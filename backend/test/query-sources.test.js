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
    sources: [{ policy_id: null, section: '4.2', page_number: 12, highlight_text: 'clause', snippet: 'cl', relevance_score: 0.9 }],
    source_count: 4,
  });
});

test('pickSources passes the policy id through for comparison citations', () => {
  const out = pickSources({ sources: [{ policy_id: 'abc', section: 'S', page_number: 3 }] });
  assert.equal(out.sources[0].policy_id, 'abc');
});

test('pickSources tolerates a missing sources list', () => {
  assert.deepEqual(pickSources({}), { sources: [], source_count: 0 });
});
