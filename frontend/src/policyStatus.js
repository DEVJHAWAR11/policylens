import { fetchApi } from './api';

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      cleanup();
      resolve();
    }
    function onAbort() {
      cleanup();
      reject(new DOMException('aborted', 'AbortError'));
    }
    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      window.removeEventListener('online', done);
      document.removeEventListener('visibilitychange', onVisible);
    }
    function onVisible() {
      if (document.visibilityState === 'visible') done(); // check right away when the tab comes back
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    window.addEventListener('online', done, { once: true }); // reconnect => poll immediately
    document.addEventListener('visibilitychange', onVisible);
  });

// Polls a policy's processing status until it is ready or failed.
// - backs off gradually (1.5s → 5s) so many open tabs don't hammer the server
// - tolerates transient errors (fetchApi already retries each call); gives up after 20 in a row
// - pauses while offline and resumes the moment the connection is back
// - survives reloads: the status lives in the database, so this can simply be started again
export async function pollPolicyStatus(policyId, { onProgress, signal, maxMs = 15 * 60 * 1000 } = {}) {
  const started = Date.now();
  let delay = 1500;
  let errors = 0;

  while (Date.now() - started < maxMs) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await sleep(30_000, signal); // wakes early on the 'online' event
      continue;
    }

    try {
      const status = await fetchApi(`/ingest/status/${policyId}`, { signal });
      errors = 0;
      onProgress?.(status);
      if (status.status === 'ready' || status.status === 'failed') return status;
      delay = Math.min(delay * 1.15, 5000);
    } catch (err) {
      if (err.name === 'AbortError' || err.status === 404) throw err;
      if (++errors >= 20) throw err;
      delay = Math.min(delay * 1.5, 10_000);
    }
    await sleep(delay, signal);
  }
  throw new Error('Processing is taking longer than expected. Check back in a few minutes.');
}
