// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, AUTH_EXPIRED_EVENT, StreamInterruptedError, fetchApi, streamApi } from './api';
import { pollPolicyStatus } from './policyStatus';

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function streamOf(chunks, { failAfter = false } = {}) {
  const enc = new TextEncoder();
  let i = 0;
  return new Response(new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]));
      else if (failAfter) controller.error(new Error('socket reset'));
      else controller.close();
    },
  }));
}

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});
afterEach(() => vi.restoreAllMocks());

describe('fetchApi', () => {
  it('retries GETs on transient failures and then succeeds', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ error: 'down' }, 503))
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(json({ ok: true }));
    await expect(fetchApi('/policies')).resolves.toEqual({ ok: true });
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('does not retry POSTs unless asked (avoids duplicate side effects)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'down' }, 503));
    await expect(fetchApi('/x', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 503, retryable: true });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('retries POSTs that opt in and reuses the same headers (idempotency key)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(json({ policy_id: 'p1' }));
    await fetchApi('/ingest/upload', { method: 'POST', body: {}, retry: 1, headers: { 'Idempotency-Key': 'k1' } });
    const keys = spy.mock.calls.map((c) => c[1].headers['Idempotency-Key']);
    expect(keys).toEqual(['k1', 'k1']);
  });

  it('does not retry client errors and surfaces the server message', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'Policy not found' }, 404));
    await expect(fetchApi('/policies/x')).rejects.toThrow('Policy not found');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('signs the user out on 401 when a session token was sent', async () => {
    localStorage.setItem('token', 't');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'Invalid token' }, 401));
    const expired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, expired);
    await expect(fetchApi('/policies')).rejects.toBeInstanceOf(ApiError);
    window.removeEventListener(AUTH_EXPIRED_EVENT, expired);
    expect(expired).toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('fails fast with a friendly message when offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(fetchApi('/policies')).rejects.toMatchObject({ offline: true });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('streamApi', () => {
  it('delivers tokens in order', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamOf(['Hel', 'lo']));
    const seen = [];
    await streamApi('/query/stream', { method: 'POST', body: {} }, (t) => seen.push(t));
    expect(seen.join('')).toBe('Hello');
  });

  it('retries before the first byte without duplicating output', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ error: 'waking' }, 503))
      .mockResolvedValueOnce(streamOf(['ok']));
    const seen = [];
    await streamApi('/query/stream', { method: 'POST', body: {} }, (t) => seen.push(t));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(['ok']);
  });

  it('reports a break mid-answer with the partial text, and does not retry', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamOf(['The cover is'], { failAfter: true }));
    const seen = [];
    const err = await streamApi('/query/stream', { method: 'POST', body: {} }, (t) => seen.push(t)).catch((e) => e);
    expect(err).toBeInstanceOf(StreamInterruptedError);
    expect(err.partial).toBe('The cover is');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('pollPolicyStatus', () => {
  it('reports progress and resolves when ready', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ status: 'queued', progress: 0 }))
      .mockResolvedValueOnce(json({ status: 'processing', progress: 50 }))
      .mockResolvedValueOnce(json({ status: 'ready', progress: 100 }));
    const progress = [];
    const final = await pollPolicyStatus('p1', { onProgress: (s) => progress.push(s.status) });
    expect(final.status).toBe('ready');
    expect(progress).toEqual(['queued', 'processing', 'ready']);
  }, 15000);

  it('resolves with the failed status instead of throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ status: 'failed', message: 'bad pdf' }));
    await expect(pollPolicyStatus('p1')).resolves.toMatchObject({ status: 'failed', message: 'bad pdf' });
  });

  it('stops immediately when the policy no longer exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'Policy not found' }, 404));
    await expect(pollPolicyStatus('gone')).rejects.toMatchObject({ status: 404 });
  });

  it('can be cancelled', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ status: 'processing', progress: 10 }));
    const controller = new AbortController();
    const p = pollPolicyStatus('p1', { signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});
