// src/api.js

const configuredApiUrl = (import.meta.env.VITE_API_URL || '').trim();
const isLocalhost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const defaultApiUrl = isLocalhost ? 'http://localhost:4000/api' : '/api';
const API_URL = (configuredApiUrl || defaultApiUrl).replace(/\/$/, '');

// Fired when the backend rejects our session token so the app can sign the user out.
export const AUTH_EXPIRED_EVENT = 'policylens:auth-expired';

const DEFAULT_TIMEOUT_MS = 30_000;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const buildUrl = (endpoint) => `${API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

// Error with enough detail for the UI to decide whether offering "retry" makes sense.
export class ApiError extends Error {
  constructor(message, { status = 0, retryable = false, retryAfter = 0, offline = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryable = retryable;
    this.retryAfter = retryAfter;
    this.offline = offline;
  }
}

// Thrown when a streamed answer breaks after some text already arrived.
export class StreamInterruptedError extends Error {
  constructor(partial) {
    super('Connection lost while the answer was being written.');
    this.name = 'StreamInterruptedError';
    this.partial = partial;
  }
}

const getHeaders = (options = {}) => {
  const headers = { ...options.headers };

  const token = localStorage.getItem('token');
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Only add Content-Type if we're not sending FormData
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
};

const buildFetchOptions = (options) => {
  const { retry: _retry, timeout: _timeout, ...rest } = options;
  const fetchOptions = { ...rest, headers: getHeaders(options) };
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    fetchOptions.body = JSON.stringify(options.body);
  }
  return fetchOptions;
};

const handleUnauthorized = (response, hadToken) => {
  // Only treat 401 as "session expired" when we actually sent a session token.
  if (response.status === 401 && hadToken) {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
};

const retryDelay = (attempt, retryAfterSeconds) =>
  Math.max(retryAfterSeconds * 1000, 400 * 2 ** attempt + Math.random() * 250);

const offlineError = () =>
  new ApiError("You're offline. Check your connection and try again.", { retryable: true, offline: true });

// One attempt, with a timeout that also respects a caller-supplied AbortSignal.
async function attempt(endpoint, options) {
  const controller = new AbortController();
  const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs);
  const caller = options.signal;
  const onCallerAbort = () => controller.abort(caller.reason);
  if (caller) {
    if (caller.aborted) controller.abort(caller.reason);
    else caller.addEventListener('abort', onCallerAbort, { once: true });
  }
  try {
    return await fetch(buildUrl(endpoint), { ...buildFetchOptions(options), signal: controller.signal });
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener('abort', onCallerAbort);
  }
}

// GETs retry twice by default; anything else retries only when the caller opts in with
// `retry: n` (safe for idempotent requests, e.g. uploads that carry an Idempotency-Key).
export const fetchApi = async (endpoint, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  const maxRetries = options.retry ?? (method === 'GET' ? 2 : 0);
  const hadToken = Boolean(localStorage.getItem('token'));

  for (let n = 0; ; n++) {
    let response;
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw offlineError();
      response = await attempt(endpoint, options);
    } catch (err) {
      if (options.signal?.aborted) throw err; // the caller cancelled — not a failure
      const apiErr = err instanceof ApiError
        ? err
        : new ApiError(
            err?.name === 'TimeoutError' || err?.name === 'AbortError'
              ? 'The server took too long to respond.'
              : "Can't reach the server. Check your connection.",
            { retryable: true },
          );
      if (n >= maxRetries || apiErr.offline) throw apiErr;
      await sleep(retryDelay(n, 0));
      continue;
    }

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json().catch(() => ({}));
    } else {
      data = await response.text();
    }

    if (response.ok) return data;

    handleUnauthorized(response, hadToken && !options.headers?.Authorization);
    const retryAfter = Number(response.headers.get('retry-after')) || 0;
    const retryable = RETRYABLE_STATUS.has(response.status) || data?.retryable === true;
    if (retryable && n < maxRetries) {
      await sleep(retryDelay(n, Math.min(retryAfter, 5)));
      continue;
    }
    const message = (typeof data === 'string' ? data : data?.error || data?.message || data?.detail) || 'An error occurred';
    if (import.meta.env.DEV) console.error(`API Error (${endpoint}):`, message);
    throw new ApiError(message, { status: response.status, retryable, retryAfter });
  }
};

// Streams a text/plain response token by token. Connection problems *before* the first
// byte are retried transparently (nothing was shown yet, so nothing can be duplicated);
// a break *after* tokens arrived throws StreamInterruptedError carrying the partial text.
export const streamApi = async (endpoint, options = {}, onToken) => {
  const hadToken = Boolean(localStorage.getItem('token'));
  const maxRetries = options.retry ?? 2;

  let response;
  for (let n = 0; ; n++) {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw offlineError();
      response = await attempt(endpoint, { ...options, timeout: options.timeout ?? 90_000 });
    } catch (err) {
      if (options.signal?.aborted) throw err;
      const apiErr = err instanceof ApiError ? err : new ApiError("Can't reach the server. Check your connection.", { retryable: true });
      if (n >= maxRetries || apiErr.offline) throw apiErr;
      await sleep(retryDelay(n, 0));
      continue;
    }

    if (response.ok) break;

    handleUnauthorized(response, hadToken);
    const data = await response.json().catch(() => ({}));
    const retryAfter = Number(response.headers.get('retry-after')) || 0;
    const retryable = RETRYABLE_STATUS.has(response.status) || data.retryable === true;
    if (retryable && n < maxRetries) {
      await sleep(retryDelay(n, Math.min(retryAfter, 5)));
      continue;
    }
    throw new ApiError(data.error || data.detail || 'Stream error', { status: response.status, retryable, retryAfter });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      // stream: true keeps multi-byte characters intact across chunk boundaries
      const chunkValue = decoder.decode(value, { stream: true });
      if (chunkValue) {
        received += chunkValue;
        onToken(chunkValue);
      }
    }
    const tail = decoder.decode();
    if (tail) {
      received += tail;
      onToken(tail);
    }
  } catch (err) {
    if (options.signal?.aborted) throw err;
    throw new StreamInterruptedError(received);
  }
};
