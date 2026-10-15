// Resilient calls to the Python RAG service: bounded retries with jittered backoff,
// a circuit breaker so a dead service fails fast instead of stacking up slow
// requests, and one place that turns upstream failures into clean HTTP responses.

const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 20_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const breaker = { failures: 0, openUntil: 0 };

export class CircuitOpenError extends Error {
  constructor() {
    super('AI service temporarily unavailable');
    this.name = 'CircuitOpenError';
  }
}

export const breakerState = () => ({
  open: Date.now() < breaker.openUntil,
  failures: breaker.failures,
});
export const resetBreaker = () => { breaker.failures = 0; breaker.openUntil = 0; };

const NETWORK_CODES = new Set(['ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EPIPE', 'ERR_NETWORK']);

// 'busy' = the service is up but saturated (503 + Retry-After): wait and retry, but do not
// count it as an outage. 'down' = network failure / 502 / 504: counts toward the breaker.
export function classify(err) {
  const status = err.response?.status;
  if (status === 503 && err.response?.headers?.['retry-after']) return 'busy';
  if (status === 502 || status === 503 || status === 504) return 'down';
  if (!err.response && (NETWORK_CODES.has(err.code) || err.code === 'ERR_CANCELED')) {
    return err.code === 'ERR_CANCELED' ? 'cancelled' : 'down';
  }
  return 'client'; // 4xx, 500 from app code etc. — not retryable
}

export async function callPython(fn, { retries = 2 } = {}) {
  if (Date.now() < breaker.openUntil) throw new CircuitOpenError();

  for (let attempt = 0; ; attempt++) {
    try {
      const result = await fn();
      breaker.failures = 0;
      return result;
    } catch (err) {
      const kind = classify(err);
      if (kind === 'cancelled' || kind === 'client') throw err;

      if (kind === 'down') {
        breaker.failures += 1;
        if (breaker.failures >= FAILURE_THRESHOLD) {
          breaker.openUntil = Date.now() + COOLDOWN_MS;
          console.warn(`[python] circuit opened for ${COOLDOWN_MS / 1000}s after ${breaker.failures} failures`);
        }
      }
      if (attempt >= retries) throw err;

      const retryAfter = kind === 'busy' ? Math.min(Number(err.response.headers['retry-after']) || 2, 3) * 1000 : 0;
      const backoff = 300 * 3 ** attempt + Math.random() * 200; // ~0.3s, ~0.9s
      await sleep(Math.max(retryAfter, backoff));
    }
  }
}

// Map an upstream failure to the response the client should see.
export function sendUpstreamError(res, err, log = console) {
  if (err instanceof CircuitOpenError) {
    res.set('Retry-After', '20');
    return res.status(503).json({ error: 'The AI service is temporarily unavailable. Please try again in a moment.', retryable: true });
  }
  const kind = classify(err);
  log.error('[python] upstream error:', err.message, err.response?.status || err.code || '');
  if (kind === 'busy') {
    res.set('Retry-After', String(err.response.headers['retry-after']));
    return res.status(503).json({ error: 'The AI service is busy. Please retry in a few seconds.', retryable: true });
  }
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return res.status(504).json({ error: 'The AI service took too long to respond. Please try again.', retryable: true });
  }
  if (kind === 'down') {
    return res.status(503).json({ error: 'The AI service is waking up or unavailable. Please retry in a few seconds.', retryable: true });
  }
  return res.status(502).json({ error: 'The AI service returned an error. Please try again.', retryable: false });
}
