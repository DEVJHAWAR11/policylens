import { fetchApi } from './api';
import type { PolicyStatus } from './types';

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      cleanup();
      resolve();
    }
    function onAbort() {
      cleanup();
      reject(new DOMException('aborted', 'AbortError'));
    }
    function onVisible() {
      if (document.visibilityState === 'visible') done(); // check right away when the tab comes back
    }
    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      window.removeEventListener('online', done);
      document.removeEventListener('visibilitychange', onVisible);
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    window.addEventListener('online', done, { once: true }); // reconnect => poll immediately
    document.addEventListener('visibilitychange', onVisible);
  });

interface PollOptions {
  onProgress?: (status: PolicyStatus) => void;
  signal?: AbortSignal;
  maxMs?: number;
}

// Polls a policy's processing status until it is ready or failed.
// - backs off gradually (1.5s → 5s) so many open tabs don't hammer the server
// - tolerates transient errors (fetchApi already retries each call); gives up after 20 in a row
// - pauses while offline and resumes the moment the connection is back
// - survives reloads: the status lives in the database, so this can simply be started again
export async function pollPolicyStatus(
  policyId: string,
  { onProgress, signal, maxMs = 15 * 60 * 1000 }: PollOptions = {},
): Promise<PolicyStatus> {
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
      const status = await fetchApi<PolicyStatus>(`/ingest/status/${policyId}`, { signal });
      errors = 0;
      onProgress?.(status);
      if (status.status === 'ready' || status.status === 'failed') return status;
      delay = Math.min(delay * 1.15, 5000);
    } catch (err) {
      const e = err as { name?: string; status?: number };
      if (e.name === 'AbortError' || e.status === 404) throw err;
      if (++errors >= 20) throw err;
      delay = Math.min(delay * 1.5, 10_000);
    }
    await sleep(delay, signal);
  }
  throw new Error('Processing is taking longer than expected. Check back in a few minutes.');
}
