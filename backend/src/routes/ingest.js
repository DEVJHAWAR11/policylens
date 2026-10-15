import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { pythonApi } from '../config/python.js';
import { forgetPolicy, getOwnedPolicy } from '../utils/policies.js';
import { perMinutes } from '../utils/limiter.js';

const router = express.Router();

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_POLICIES_PER_USER = Number(process.env.MAX_POLICIES_PER_USER) || 25;
const MAX_ACTIVE_UPLOADS_PER_USER = Number(process.env.MAX_ACTIVE_UPLOADS_PER_USER) || 3;
const BUCKET = 'policy-pdfs';

const upload = multer({
  storage: multer.memoryStorage(), // keep file in memory
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
});

const uploadLimiter = perMinutes(60, 20, 'Upload limit reached. Please try again later.');

// multer rejects oversize files with an error; turn it into a clean 413
const handleUpload = (req, res, next) =>
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'PDF must be 25 MB or smaller' });
    }
    return res.status(400).json({ error: 'Invalid upload' });
  });

const POLICY_COLUMNS = 'policy_id, filename, status, progress, message, chunk_count, created_at';

// Python may be asleep (free tiers spin down); a cheap ping starts waking it so the
// queued job is picked up quickly. The job itself lives in the database, so nothing is lost.
const wakePython = () => { pythonApi.get('/', { timeout: 5000 }).catch(() => {}); };

const uploadResponse = (p, extra = {}) => ({
  status: p.status,
  policy_id: p.policy_id,
  filename: p.filename,
  message: `Poll /api/ingest/status/${p.policy_id} to check when ready`,
  ...extra,
});

// --------------------------------------------------------
// POST /api/ingest/upload
// Stores the PDF, then enqueues a job (a `policies` row with status 'queued').
// A worker picks it up; the client polls /ingest/status. Safe to retry: send the same
// `Idempotency-Key` header and a repeated request returns the original policy.
// --------------------------------------------------------
router.post('/ingest/upload', authMiddleware, uploadLimiter, handleUpload, async (req, res) => {
  const user_id = req.user.id;
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  if (!file.originalname.toLowerCase().endsWith('.pdf') || file.buffer.subarray(0, 5).toString() !== '%PDF-') {
    return res.status(400).json({ error: 'Only PDFs accepted' });
  }

  const rawKey = req.get('idempotency-key');
  const upload_key = rawKey && rawKey.length <= 100 ? rawKey : null;

  try {
    // Retried request (flaky connection): hand back the policy created the first time
    if (upload_key) {
      const { data: existing } = await supabase
        .from('policies').select(POLICY_COLUMNS)
        .eq('user_id', user_id).eq('upload_key', upload_key).maybeSingle();
      if (existing) return res.json(uploadResponse(existing, { duplicate: true }));
    }

    // Per-user quotas protect shared capacity (storage, embedding and LLM budget)
    const { count: total } = await supabase
      .from('policies').select('policy_id', { count: 'exact', head: true }).eq('user_id', user_id);
    if ((total || 0) >= MAX_POLICIES_PER_USER) {
      return res.status(403).json({ error: `You can store up to ${MAX_POLICIES_PER_USER} policies. Delete one to upload another.` });
    }
    const { count: active } = await supabase
      .from('policies').select('policy_id', { count: 'exact', head: true })
      .eq('user_id', user_id).in('status', ['queued', 'processing']);
    if ((active || 0) >= MAX_ACTIVE_UPLOADS_PER_USER) {
      return res.status(429).json({ error: 'Too many policies are still processing. Please wait for them to finish.' });
    }

    // 1. Unique policy_id scoped to the user; 2. PDF into private storage
    const policy_id = `${user_id}_${uuidv4()}`;
    const storage_path = `${user_id}/${policy_id}.pdf`;

    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .upload(storage_path, file.buffer, { contentType: 'application/pdf', upsert: false });
    if (storageError) {
      console.error('[ingest] storage upload failed:', storageError.message);
      return res.status(502).json({ error: 'Could not store the uploaded file. Please try again.' });
    }

    // 3. Enqueue
    const { data: created, error: insertError } = await supabase
      .from('policies')
      .insert({
        user_id, policy_id, filename: file.originalname.slice(0, 255),
        storage_path, status: 'queued', progress: 0, message: 'Waiting in queue', upload_key,
      })
      .select(POLICY_COLUMNS)
      .single();

    if (insertError) {
      await supabase.storage.from(BUCKET).remove([storage_path]);
      if (insertError.code === '23505' && upload_key) { // concurrent duplicate of the same request
        const { data: existing } = await supabase
          .from('policies').select(POLICY_COLUMNS)
          .eq('user_id', user_id).eq('upload_key', upload_key).maybeSingle();
        if (existing) return res.json(uploadResponse(existing, { duplicate: true }));
      }
      console.error('[ingest] enqueue failed:', insertError.message);
      return res.status(500).json({ error: 'Could not save the policy. Please try again.' });
    }

    wakePython();
    res.json(uploadResponse(created));
  } catch (err) {
    console.error('[ingest] Fatal error:', err.message);
    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

// --------------------------------------------------------
// GET /api/ingest/status/:policy_id
// Reads the durable job state straight from the database — cheap, works even while the
// Python service is asleep or restarting, and survives page reloads.
// --------------------------------------------------------
router.get('/ingest/status/:policy_id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('policies')
    .select('policy_id, status, progress, message, chunk_count, error')
    .eq('policy_id', req.params.policy_id)
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (error) {
    console.error('[ingest/status]', error.message);
    return res.status(503).json({ error: 'Could not read status. Please retry.', retryable: true });
  }
  if (!data) return res.status(404).json({ error: 'Policy not found' });

  if (data.status === 'queued') wakePython(); // nudge a sleeping worker while someone is waiting

  res.json({
    policy_id: data.policy_id,
    status: data.status,
    ingested: data.status === 'ready',
    progress: data.status === 'ready' ? 100 : data.progress || 0,
    message: data.status === 'failed'
      ? data.message || 'Processing failed. Please try uploading again.'
      : data.message || (data.status === 'queued' ? 'Waiting in queue' : 'Processing'),
    chunk_count: data.chunk_count || 0,
  });
});

// --------------------------------------------------------
// POST /api/policies/:policy_id/retry — re-queue a failed policy
// --------------------------------------------------------
router.post('/policies/:policy_id/retry', authMiddleware, async (req, res) => {
  const { policy_id } = req.params;
  const { data, error } = await supabase
    .from('policies')
    .update({ status: 'queued', progress: 0, attempts: 0, message: 'Waiting in queue', error: null, locked_at: null })
    .eq('policy_id', policy_id).eq('user_id', req.user.id).eq('status', 'failed')
    .select('policy_id').maybeSingle();

  if (error) return res.status(500).json({ error: 'Could not retry. Please try again.' });
  if (!data) return res.status(409).json({ error: 'Only failed policies can be retried' });
  wakePython();
  res.json({ status: 'queued', policy_id });
});

// --------------------------------------------------------
// GET /api/policies
// List all policies uploaded by the logged-in user
// --------------------------------------------------------
router.get('/policies', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('policies')
    .select(POLICY_COLUMNS)
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[policies]', error.message);
    return res.status(503).json({ error: 'Could not load your policies. Please retry.', retryable: true });
  }
  res.json(data);
});

// --------------------------------------------------------
// GET /api/policies/:policy_id/pdf — short-lived signed link to the stored PDF
// --------------------------------------------------------
router.get('/policies/:policy_id/pdf', authMiddleware, async (req, res) => {
  const { data: row } = await supabase
    .from('policies').select('storage_path')
    .eq('policy_id', req.params.policy_id).eq('user_id', req.user.id).maybeSingle();
  if (!row) return res.status(404).json({ error: 'Policy not found' });

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, 60 * 60);
  if (error || !data?.signedUrl) return res.status(502).json({ error: 'Could not create a download link' });
  res.json({ url: data.signedUrl, expires_in: 3600 });
});

// --------------------------------------------------------
// DELETE /api/policies/:policy_id
// Removes the PDF, vector chunks, summary, chat history and the policy row.
// (If a worker is mid-way through this policy it notices the missing row and cleans up.)
// --------------------------------------------------------
router.delete('/policies/:policy_id', authMiddleware, async (req, res) => {
  const { policy_id } = req.params;
  const user_id = req.user.id;

  const { data: policy } = await supabase
    .from('policies').select('storage_path')
    .eq('policy_id', policy_id).eq('user_id', user_id).maybeSingle();
  if (!policy) return res.status(404).json({ error: 'Policy not found' });

  const results = await Promise.all([
    supabase.storage.from(BUCKET).remove([policy.storage_path]),
    supabase.from('policy_chunks').delete().eq('policy_id', policy_id),
    supabase.from('policy_summaries').delete().eq('policy_id', policy_id),
    supabase.from('chat_history').delete().eq('policy_id', policy_id).eq('user_id', user_id),
  ]);
  const failed = results.find((r) => r.error);
  if (failed) {
    // keep the policy row so the user can retry the delete; nothing is half-hidden
    console.error('[policies/delete] cleanup failed:', failed.error.message);
    return res.status(502).json({ error: 'Could not fully delete the policy. Please try again.' });
  }

  const { error } = await supabase.from('policies').delete()
    .eq('policy_id', policy_id).eq('user_id', user_id);
  if (error) return res.status(500).json({ error: 'Could not delete the policy. Please try again.' });

  await forgetPolicy(policy_id, user_id);
  res.json({ success: true });
});

// GET /api/policies/:policy_id/summary
// Fetch the AI-generated summary for a policy
router.get('/policies/:policy_id/summary', authMiddleware, async (req, res) => {
  const { policy_id } = req.params;

  const policy = await getOwnedPolicy(policy_id, req.user.id);
  if (!policy) return res.status(404).json({ error: 'Policy not found' });

  const { data, error } = await supabase
    .from('policy_summaries')
    .select('policy_id, summary, created_at')
    .eq('policy_id', policy_id)
    .maybeSingle();

  if (error || !data) return res.status(404).json({ error: 'Summary not yet generated' });
  res.json(data);
});

export default router;
