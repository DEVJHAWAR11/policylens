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
  const { policy_id, q, page = 1, limit = 20 } = req.query;

  const from = (page - 1) * limit;
  const to = from + parseInt(limit) - 1;

  let query = supabase
    .from('chat_history')
    .select('*', { count: 'exact' })
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (policy_id) query = query.eq('policy_id', policy_id);
  if (q) query = query.or(`question.ilike.%${q}%,answer.ilike.%${q}%`);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  res.json({
    data,
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(count / limit),
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

  if (error) return res.status(500).json({ error: error.message });
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
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export default router;
