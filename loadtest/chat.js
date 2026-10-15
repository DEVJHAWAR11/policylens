// k6 load test for the Node API.  https://k6.io/docs/get-started/installation/
//
//   k6 run loadtest/chat.js \
//     -e BASE_URL=https://policylens-api.onrender.com/api \
//     -e TOKEN=<a valid session JWT> \
//     -e POLICY_ID=<a policy_id in 'ready' state that belongs to that user>
//
// Scenarios: cheap reads (status/list) at high rate, and chat at a modest rate.
// Thresholds fail the run if p95 latency or the error rate regress.
// Repeated identical questions hit the answer cache; set UNIQUE=1 to defeat it and
// measure the real RAG + LLM path.

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'http://localhost:4000/api';
const HEADERS = { Authorization: `Bearer ${__ENV.TOKEN}`, 'Content-Type': 'application/json' };
const QUESTIONS = [
  'What is covered under this policy?',
  'What are the exclusions?',
  'What is the waiting period?',
  'How do I make a claim?',
  'What is the free look period?',
];

export const options = {
  scenarios: {
    reads: { executor: 'constant-arrival-rate', rate: 50, timeUnit: '1s', duration: '1m', preAllocatedVUs: 50, exec: 'reads' },
    chat: { executor: 'constant-arrival-rate', rate: 2, timeUnit: '1s', duration: '1m', preAllocatedVUs: 20, exec: 'chat' },
  },
  thresholds: {
    'http_req_failed{scenario:reads}': ['rate<0.01'],
    'http_req_duration{scenario:reads}': ['p(95)<800'],
    // 503 + Retry-After under saturation is expected behaviour, not a failure
    'http_req_duration{scenario:chat}': ['p(95)<15000'],
  },
};

export function reads() {
  const res = http.get(`${BASE}/policies`, { headers: HEADERS });
  check(res, { 'list 200': (r) => r.status === 200 });
  const st = http.get(`${BASE}/ingest/status/${__ENV.POLICY_ID}`, { headers: HEADERS });
  check(st, { 'status 200': (r) => r.status === 200 });
}

export function chat() {
  let question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  if (__ENV.UNIQUE) question += ` (${Math.random().toString(36).slice(2, 8)})`;
  const res = http.post(
    `${BASE}/query`,
    JSON.stringify({ question, policy_id: __ENV.POLICY_ID }),
    { headers: HEADERS, timeout: '60s' },
  );
  check(res, {
    'answered or politely rejected': (r) => r.status === 200 || (r.status === 503 && r.headers['Retry-After']),
  });
  sleep(0.1);
}
