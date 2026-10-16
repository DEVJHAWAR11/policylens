import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';
delete process.env.REDIS_URL;

const { pickSources } = await import('../src/routes/query.js');

test('pickSources keeps page, section and clause text only', () => {
  const out = pickSources({
    answer: 'secret answer text',
    source_count: 4,
    sources: [{ section: '4.2', page_number: 12, highlight_text: 'clause', snippet: 'cl', relevance_score: 0.9, clause_type: 'x' }],
  });
  assert.deepEqual(out, {
    sources: [{ section: '4.2', page_number: 12, highlight_text: 'clause', snippet: 'cl', relevance_score: 0.9 }],
    source_count: 4,
  });
});

test('pickSources tolerates a missing sources list', () => {
  assert.deepEqual(pickSources({}), { sources: [], source_count: 0 });
});
