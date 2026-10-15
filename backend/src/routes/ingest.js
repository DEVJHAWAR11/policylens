import express from 'express';
import multer from 'multer';
import FormData from 'form-data';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { pythonApi } from '../config/python.js';
import { getOwnedPolicy } from '../utils/policies.js';

const router = express.Router();
const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB
const upload = multer({
  storage: multer.memoryStorage(), // keep file in memory
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Upload limit reached. Please try again later.' },
});

// multer rejects oversize files with an error; turn it into a clean 413
const handleUpload = (req, res, next) =>
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'PDF must be 25 MB or smaller' });
    }
    return res.status(400).json({ error: 'Invalid upload' });
  });

// --------------------------------------------------------
// POST /api/ingest/upload
// Frontend sends: file (PDF), policy_name (optional label)
// --------------------------------------------------------
router.post('/ingest/upload', authMiddleware, uploadLimiter, handleUpload, async (req, res) => {
  const user_id = req.user.id;
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  if (!file.originalname.toLowerCase().endsWith('.pdf') || file.buffer.subarray(0, 5).toString() !== '%PDF-') {
    return res.status(400).json({ error: 'Only PDFs accepted' });
  }

  // 1. Generate a unique policy_id scoped to the user
  const policy_id = `${user_id}_${uuidv4()}`;
  const storage_path = `${user_id}/${policy_id}.pdf`;

  try {
    // 2. Upload PDF to Supabase Storage
    const { error: storageError } = await supabase.storage
      .from('policy-pdfs')
      .upload(storage_path, file.buffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (storageError) return res.status(500).json({ error: storageError.message });

    // 3. Get a signed URL (valid 1 year) for the stored PDF
    const { data: signedData, error: signError } = await supabase.storage
      .from('policy-pdfs')
      .createSignedUrl(storage_path, 60 * 60 * 24 * 365);

    if (signError || !signedData?.signedUrl) {
      await supabase.storage.from('policy-pdfs').remove([storage_path]);
      return res.status(500).json({ error: 'Could not store the uploaded file' });
    }

    const storage_url = signedData.signedUrl;

    // 4. Save policy metadata to policies table
    const { error: insertError } = await supabase.from('policies').insert({
      user_id,
      policy_id,
      filename: file.originalname,
      storage_path,
      storage_url,
      status: 'processing',
    });

    if (insertError) {
      console.error('[ingest] policies insert failed:', insertError.message);
      await supabase.storage.from('policy-pdfs').remove([storage_path]);
      return res.status(500).json({ error: 'Could not save the policy' });
    }

    // 5. Forward PDF to Python as multipart — fire-and-forget so Node doesn't hang.
    // Python runs ingestion in the background; we only need it to accept the file.
    const form = new FormData();
    form.append('file', file.buffer, {
      filename: file.originalname,
      contentType: 'application/pdf',
    });
    form.append('policy_id', policy_id);
    form.append('overwrite', 'false');

    pythonApi.post('/ingest/upload', form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 30000, // enough for Python to accept the file and start its background task
    }).then((resp) => {
      console.log('[ingest] Python accepted upload:', resp.data?.status, policy_id);
    }).catch(async (err) => {
      console.error('[ingest] Python ingest error:', err.message, err.response?.status || '');
      await supabase.from('policies')
        .update({ status: 'failed' })
        .eq('policy_id', policy_id)
        .eq('user_id', user_id);
    });

    // 6. Return immediately — frontend polls /ingest/status/:policy_id for progress
    res.json({
      status: 'processing',
      policy_id,
      filename: file.originalname,
      storage_url,
      message: `Poll /api/ingest/status/${policy_id} to check when ready`,
    });

  } catch (err) {
    console.error('[ingest] Fatal error:', err.message);
    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

// --------------------------------------------------------
// GET /api/ingest/status/:policy_id
// Polls Python, updates policies table when ready or failed
// --------------------------------------------------------
router.get('/ingest/status/:policy_id', authMiddleware, async (req, res) => {
  const { policy_id } = req.params;

  const policy = await getOwnedPolicy(policy_id, req.user.id, 'policy_id, status, chunk_count');
  if (!policy) return res.status(404).json({ error: 'Policy not found' });

  try {
    const { data } = await pythonApi.get(`/ingest/status/${encodeURIComponent(policy_id)}`, {
      timeout: 15000,
    });

    if (data.status === 'ready' && policy.status !== 'ready') {
      await supabase.from('policies')
        .update({ status: 'ready', chunk_count: data.chunk_count })
        .eq('policy_id', policy_id)
        .eq('user_id', req.user.id);
    } else if (data.status === 'failed' && policy.status !== 'failed') {
      await supabase.from('policies')
        .update({ status: 'failed' })
        .eq('policy_id', policy_id)
        .eq('user_id', req.user.id);
    }

    res.json(data);
  } catch (err) {
    console.error('[ingest/status] Proxy error:', err.message);
    res.status(502).json({ error: 'Could not reach the processing service' });
  }
});

// --------------------------------------------------------
// GET /api/policies
// List all policies uploaded by the logged-in user
// --------------------------------------------------------
router.get('/policies', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('policies')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// --------------------------------------------------------
// DELETE /api/policies/:policy_id
// Delete PDF from storage + policies table
// --------------------------------------------------------
router.delete('/policies/:policy_id', authMiddleware, async (req, res) => {
  const { policy_id } = req.params;
  const user_id = req.user.id;

  // Get storage path first
  const policy = await getOwnedPolicy(policy_id, user_id, 'storage_path');
  if (!policy) return res.status(404).json({ error: 'Policy not found' });

  // Delete from Supabase Storage
  await supabase.storage.from('policy-pdfs').remove([policy.storage_path]);

  // Delete vector chunks from policy_chunks
  await supabase.from('policy_chunks')
    .delete()
    .filter('metadata->>policy_id', 'eq', policy_id);

  // Delete policy summary if exists
  await supabase.from('policy_summaries')
    .delete()
    .eq('policy_id', policy_id);

  // Delete chat history for this policy
  await supabase.from('chat_history')
    .delete()
    .eq('policy_id', policy_id)
    .eq('user_id', user_id);

  // Delete from policies table
  await supabase.from('policies').delete()
    .eq('policy_id', policy_id)
    .eq('user_id', user_id);

  res.json({ success: true });
});

// GET /api/policies/:policy_id/summary
// Fetch the AI-generated summary for a policy
router.get('/policies/:policy_id/summary', authMiddleware, async (req, res) => {
  const { policy_id } = req.params;

  const policy = await getOwnedPolicy(policy_id, req.user.id);
  if (!policy) return res.status(404).json({ error: 'Policy not found' });

  // fetch summary from policy_summaries table
  const { data, error } = await supabase
    .from('policy_summaries')
    .select('policy_id, summary, created_at')
    .eq('policy_id', policy_id)
    .maybeSingle();

  if (error || !data) return res.status(404).json({ error: 'Summary not yet generated' });
  res.json(data);
});


export default router;
