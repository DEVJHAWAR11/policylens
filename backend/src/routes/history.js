import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

const router = express.Router();

// --------------------------------------------------------
// GET /api/history
// Query params: policy_id, q, page, limit
// --------------------------------------------------------
router.get('/history', authMiddleware, async (req, res) => {
  const user_id = req.user.id;
  const { policy_id, q } = req.query;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('chat_history')
    .select('*', { count: 'exact' })
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (policy_id) query = query.eq('policy_id', policy_id);
  if (typeof q === 'string' && q.trim()) {
    // Strip characters that have meaning in PostgREST filter syntax / LIKE patterns
    const term = q.trim().slice(0, 100).replace(/[%_,()\*]/g, ' ');
    query = query.or(`question.ilike.%${term}%,answer.ilike.%${term}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error('[history]', error.message);
    return res.status(500).json({ error: 'Could not load history' });
  }

  res.json({
    data,
    pagination: {
      total: count,
      page,
      limit,
      pages: Math.ceil((count || 0) / limit),
    },
  });
});

// --------------------------------------------------------
// GET /api/history/:id   → single entry
// --------------------------------------------------------
router.get('/history/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('chat_history')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (error) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

// --------------------------------------------------------
// DELETE /api/history/:id   → delete one entry
// --------------------------------------------------------
router.delete('/history/:id', authMiddleware, async (req, res) => {
  const { error } = await supabase
    .from('chat_history')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) {
    console.error('[history]', error.message);
    return res.status(500).json({ error: 'Could not load history' });
  }
  res.json({ success: true });
});

// --------------------------------------------------------
// DELETE /api/history   → clear all (optionally by policy)
// --------------------------------------------------------
router.delete('/history', authMiddleware, async (req, res) => {
  const { policy_id } = req.query;

  let query = supabase
    .from('chat_history')
    .delete()
    .eq('user_id', req.user.id);

  if (policy_id) query = query.eq('policy_id', policy_id);

  const { error } = await query;
  if (error) {
    console.error('[history]', error.message);
    return res.status(500).json({ error: 'Could not load history' });
  }
  res.json({ success: true });
});

export default router;
