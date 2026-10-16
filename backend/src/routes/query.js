import express from 'express';
import { pythonApi } from '../config/python.js';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { getOwnedPolicies, getOwnedPolicy } from '../utils/policies.js';
import { makeLimiter } from '../utils/limiter.js';
import { callPython, sendUpstreamError } from '../utils/resilience.js';

const router = express.Router();

// Only what the UI needs to show citation chips and highlight the clause in the PDF.
export function pickSources(data) {
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  return {
    sources: sources.map((s) => ({
      policy_id: s.policy_id ?? null,
      section: s.section ?? null,
      page_number: s.page_number ?? null,
      highlight_text: s.highlight_text ?? '',
      snippet: s.snippet ?? '',
      relevance_score: s.relevance_score ?? null,
    })),
    source_count: data?.source_count ?? sources.length,
  };
}

const MAX_QUESTION_LENGTH = 2000;
const STREAM_IDLE_TIMEOUT_MS = 45_000; // no tokens for this long => treat the stream as dead
const PYTHON_ERROR_TAIL = /Error: something went wrong while generating the answer\.$/;

// Limit per *user* (not per IP): shared offices / mobile carriers would otherwise throttle each other
const queryLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 30,
  message: 'Too many questions. Please slow down.',
  keyGenerator: (req) => `u:${req.user?.id || req.ip}`,
});

function parseQuestion(req, res) {
  const { question } = req.body || {};
  if (typeof question !== 'string' || !question.trim()) {
    res.status(400).json({ error: 'Question is required' });
    return null;
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    res.status(400).json({ error: `Question must be at most ${MAX_QUESTION_LENGTH} characters` });
    return null;
  }
  return question.trim();
}

// Validates the body and confirms the policy belongs to the caller and is queryable.
async function validateQuery(req, res) {
  const question = parseQuestion(req, res);
  if (!question) return null;

  const { policy_id } = req.body;
  const k = Math.min(Math.max(parseInt(req.body?.k, 10) || 8, 1), 20);

  const policy = await getOwnedPolicy(policy_id, req.user.id);
  if (!policy) {
    res.status(404).json({ error: 'Policy not found' });
    return null;
  }
  if (policy.status !== 'ready') {
    res.status(409).json({
      error: policy.status === 'failed'
        ? 'This policy failed to process. Please retry or upload it again.'
        : 'This policy is still being processed. Please wait a moment.',
    });
    return null;
  }
  return { question, policy_id, k };
}

async function saveHistory(row) {
  const { error } = await supabase.from('chat_history').insert(row);
  if (error) console.error('[query] chat_history save failed:', error.message);
}

router.post('/query', authMiddleware, queryLimiter, async (req, res) => {
  const payload = await validateQuery(req, res);
  if (!payload) return;

  try {
    const { data } = await callPython(() =>
      pythonApi.post('/query/', payload, { timeout: 90_000 }));

    saveHistory({
      user_id: req.user.id,
      policy_id: payload.policy_id,
      question: payload.question,
      answer: data.answer,
      sources: data.sources,
      source_count: data.source_count,
    }); // not awaited: persisting history must not delay the answer

    res.json(data);
  } catch (err) {
    sendUpstreamError(res, err);
  }
});

// Sources (page + clause text) for an answer that was just streamed. /query/stream sends
// plain text only; the RAG service caches the full result (with sources) under the same key,
// so this normally costs no LLM call. Not saved to history: the stream already saved the answer.
router.post('/query/sources', authMiddleware, queryLimiter, async (req, res) => {
  const payload = await validateQuery(req, res);
  if (!payload) return;

  try {
    const { data } = await callPython(() =>
      pythonApi.post('/query/', payload, { timeout: 90_000 }));
    res.json(pickSources(data));
  } catch (err) {
    sendUpstreamError(res, err);
  }
});

// Ask one question across 2–5 of the user's policies (compare, find gaps/overlaps)
router.post('/query/multi', authMiddleware, queryLimiter, async (req, res) => {
  const question = parseQuestion(req, res);
  if (!question) return;

  const ids = Array.isArray(req.body?.policy_ids) ? [...new Set(req.body.policy_ids)] : [];
  if (ids.length < 2 || ids.length > 5 || ids.some((i) => typeof i !== 'string')) {
    return res.status(400).json({ error: 'Choose between 2 and 5 policies to compare' });
  }
  const owned = await getOwnedPolicies(ids, req.user.id);
  if (!owned) return res.status(404).json({ error: 'One or more policies were not found' });
  if (owned.some((p) => p.status !== 'ready')) {
    return res.status(409).json({ error: 'All selected policies must finish processing first' });
  }

  try {
    const { data } = await callPython(() =>
      pythonApi.post('/query/multi', { question, policy_ids: ids }, { timeout: 90_000 }));

    saveHistory({
      user_id: req.user.id,
      policy_id: ids.join(','),
      policy_ids: ids,
      question,
      answer: data.answer,
      sources: data.sources,
      source_count: data.source_count,
    });
    res.json(data);
  } catch (err) {
    sendUpstreamError(res, err);
  }
});

router.post('/query/stream', authMiddleware, queryLimiter, async (req, res) => {
  const payload = await validateQuery(req, res);
  if (!payload) return;

  const controller = new AbortController();
  res.on('close', () => controller.abort()); // client went away — stop the upstream call

  let response;
  try {
    // Retries/backoff only cover the connection + headers phase, i.e. before any token
    // has been sent — so a retry can never duplicate output the user already saw.
    response = await callPython(() =>
      pythonApi.post('/query/stream', payload, {
        responseType: 'stream',
        signal: controller.signal,
        timeout: 90_000,
      }));
  } catch (err) {
    if (controller.signal.aborted) return;
    return sendUpstreamError(res, err);
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  let fullAnswer = '';
  let idleTimer;
  const armIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      console.warn('[query/stream] upstream idle timeout');
      controller.abort();
      res.destroy(new Error('upstream idle')); // client sees a broken stream and can offer a retry
    }, STREAM_IDLE_TIMEOUT_MS);
  };
  armIdle();

  response.data.on('data', (chunk) => {
    armIdle();
    fullAnswer += chunk.toString();
    res.write(chunk);
  });

  response.data.on('end', () => {
    clearTimeout(idleTimer);
    const answer = fullAnswer.trim();
    if (answer && !answer.startsWith('Error:') && !PYTHON_ERROR_TAIL.test(answer)) {
      saveHistory({
        user_id: req.user.id,
        policy_id: payload.policy_id,
        question: payload.question,
        answer: fullAnswer,
      });
    }
    res.end();
  });

  response.data.on('error', (err) => {
    clearTimeout(idleTimer);
    if (controller.signal.aborted) return;
    console.error('[query/stream] upstream stream error:', err.message);
    res.destroy(err); // abrupt close => the client knows the answer is incomplete
  });
});

export default router;
