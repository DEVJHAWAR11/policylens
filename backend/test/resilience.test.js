import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
delete process.env.REDIS_URL; // exercise the in-memory fallbacks

const { callPython, classify, breakerState, resetBreaker, CircuitOpenError, sendUpstreamError } =
  await import('../src/utils/resilience.js');
const { cacheGet, cacheSet, cacheDel } = await import('../src/utils/cache.js');

const netErr = (code = 'ECONNRESET') => Object.assign(new Error('net'), { code });
const httpErr = (status, headers = {}) =>
  Object.assign(new Error(`http ${status}`), { response: { status, headers } });

beforeEach(() => resetBreaker());

test('classify distinguishes outage, busy and client errors', () => {
  assert.equal(classify(netErr()), 'down');
  assert.equal(classify(httpErr(502)), 'down');
  assert.equal(classify(httpErr(504)), 'down');
  assert.equal(classify(httpErr(503, { 'retry-after': '2' })), 'busy');
  assert.equal(classify(httpErr(422)), 'client');
  assert.equal(classify(httpErr(500)), 'client');
});

test('retries transient failures then succeeds', async () => {
  let calls = 0;
  const result = await callPython(async () => {
    if (++calls < 3) throw netErr();
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});

test('does not retry client errors', async () => {
  let calls = 0;
  await assert.rejects(callPython(async () => { calls++; throw httpErr(422); }), /422/);
  assert.equal(calls, 1);
});

test('gives up after the retry budget', async () => {
  let calls = 0;
  await assert.rejects(callPython(async () => { calls++; throw netErr(); }, { retries: 1 }));
  assert.equal(calls, 2);
});

test('circuit opens after repeated outages and then fails fast', async () => {
  for (let i = 0; i < 3; i++) {
    await callPython(async () => { throw netErr(); }, { retries: 1 }).catch(() => {});
  }
  assert.equal(breakerState().open, true);

  let called = false;
  await assert.rejects(
    callPython(async () => { called = true; return 'x'; }),
    CircuitOpenError,
  );
  assert.equal(called, false, 'no upstream call while the circuit is open');
});

test('busy responses are retried but never open the circuit', async () => {
  for (let i = 0; i < 8; i++) {
    await callPython(async () => { throw httpErr(503, { 'retry-after': '0' }); }, { retries: 0 }).catch(() => {});
  }
  assert.equal(breakerState().open, false);
});

test('upstream errors map to retryable HTTP responses', () => {
  const res = () => {
    const r = { headers: {}, code: 0 };
    r.set = (k, v) => { r.headers[k] = v; return r; };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
  };
  const quiet = { error() {} };

  let r = res();
  sendUpstreamError(r, new CircuitOpenError(), quiet);
  assert.equal(r.code, 503);
  assert.equal(r.body.retryable, true);
  assert.ok(r.headers['Retry-After']);

  r = res();
  sendUpstreamError(r, httpErr(503, { 'retry-after': '5' }), quiet);
  assert.equal(r.code, 503);
  assert.equal(r.headers['Retry-After'], '5');

  r = res();
  sendUpstreamError(r, netErr('ECONNABORTED'), quiet);
  assert.equal(r.code, 504);

  r = res();
  sendUpstreamError(r, httpErr(500), quiet);
  assert.equal(r.code, 502);
});

test('memory cache stores, expires and deletes', async () => {
  await cacheSet('k1', { a: 1 }, 60);
  assert.deepEqual(await cacheGet('k1'), { a: 1 });
  await cacheDel('k1');
  assert.equal(await cacheGet('k1'), undefined);

  await cacheSet('k2', 1, -1); // already expired
  assert.equal(await cacheGet('k2'), undefined);
});
