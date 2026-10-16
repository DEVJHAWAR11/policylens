import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';

let authMiddleware;
before(async () => {
  ({ authMiddleware } = await import('../src/middleware/auth.js'));
});

function run(headers) {
  return new Promise((resolve) => {
    const req = { headers };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body, req }); },
    };
    authMiddleware(req, res, () => resolve({ status: 200, req }));
  });
}

test('rejects requests with no token', async () => {
  const r = await run({});
  assert.equal(r.status, 401);
});

test('accepts a valid session token', async () => {
  const token = jwt.sign({ id: 'u1', email: 'a@b.com' }, process.env.JWT_SECRET);
  const r = await run({ authorization: `Bearer ${token}` });
  assert.equal(r.status, 200);
  assert.equal(r.req.user.id, 'u1');
});

test('rejects password-reset tokens used as session tokens', async () => {
  const token = jwt.sign({ email: 'a@b.com', purpose: 'password_reset' }, process.env.JWT_SECRET);
  const r = await run({ authorization: `Bearer ${token}` });
  assert.equal(r.status, 401);
});

test('rejects tokens without a user id', async () => {
  const token = jwt.sign({ email: 'a@b.com' }, process.env.JWT_SECRET);
  const r = await run({ authorization: `Bearer ${token}` });
  assert.equal(r.status, 401);
});
