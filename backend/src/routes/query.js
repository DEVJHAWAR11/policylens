import express from 'express';
import rateLimit from 'express-rate-limit';
import { pythonApi } from '../config/python.js';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { getOwnedPolicy } from '../utils/policies.js';

const router = express.Router();

const MAX_QUESTION_LENGTH = 2000;

const queryLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many questions. Please slow down.' },
});

// Validates the body and confirms the policy belongs to the caller.
async function validateQuery(req, res) {
  const { question, policy_id } = req.body || {};
  const k = Math.min(Math.max(parseInt(req.body?.k, 10) || 8, 1), 20);

  if (typeof question !== 'string' || !question.trim()) {
    res.status(400).json({ error: 'Question is required' });
    return null;
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    res.status(400).json({ error: `Question must be at most ${MAX_QUESTION_LENGTH} characters` });
    return null;
  }
  if (!(await getOwnedPolicy(policy_id, req.user.id))) {
    res.status(404).json({ error: 'Policy not found' });
    return null;
  }
  return { question: question.trim(), policy_id, k };
}

router.post('/query', authMiddleware, queryLimiter, async (req, res) => {
  const payload = await validateQuery(req, res);
  if (!payload) return;

  try {
    const { data } = await pythonApi.post('/query/', payload, { timeout: 60000 });

    const { error } = await supabase.from('chat_history').insert({
      user_id: req.user.id,
      policy_id: payload.policy_id,
      question: payload.question,
      answer: data.answer,
      sources: data.sources,
      source_count: data.source_count,
    });
    if (error) console.error('[query] chat_history save failed:', error.message);

    res.json(data);
  } catch (err) {
    console.error('[query] Proxy error:', err.message);
    res.status(502).json({ error: 'The AI service is unavailable. Please try again.' });
  }
});

router.post('/query/stream', authMiddleware, queryLimiter, async (req, res) => {
  const payload = await validateQuery(req, res);
  if (!payload) return;

  const controller = new AbortController();
  res.on('close', () => controller.abort()); // client went away — stop the upstream call

  try {
    const response = await pythonApi.post('/query/stream', payload, {
      responseType: 'stream',
      signal: controller.signal,
      timeout: 120000,
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    let fullAnswer = '';
    response.data.on('data', (chunk) => {
      fullAnswer += chunk.toString();
      res.write(chunk);
    });

    response.data.on('end', async () => {
      if (fullAnswer.trim() && !fullAnswer.startsWith('Error:')) {
        const { error } = await supabase.from('chat_history').insert({
          user_id: req.user.id,
          policy_id: payload.policy_id,
          question: payload.question,
          answer: fullAnswer,
        });
        if (error) console.error('[query/stream] chat_history save failed:', error.message);
      }
      res.end();
    });

    response.data.on('error', (err) => {
      console.error('[query/stream] Upstream stream error:', err.message);
      if (!res.writableEnded) res.end();
    });
  } catch (err) {
    if (controller.signal.aborted) return;
    console.error('[query/stream] Proxy error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'The AI service is unavailable. Please try again.' });
    } else {
      res.end();
    }
  }
});

export default router;
