# PolicyLens — Architecture

## Components

```
                     ┌───────────────┐
   Browser (React) ──►  Node API     │  auth · uploads · chat proxy · rate limits · quotas
   Vercel / static   │  (stateless)  │──────────────┐
                     └──────┬────────┘              │ X-Internal-Key
                            │                       ▼
                            │              ┌────────────────────┐        ┌──────────────┐
                            │              │ FastAPI RAG service │───────►│ Groq (LLM)   │
                            │              │  query pipeline     │───────►│ Jina (embed  │
                            │              │  + ingest worker    │        │  + rerank)   │
                            │              └─────────┬──────────┘        └──────────────┘
                            ▼                        │
                  ┌───────────────────┐              │ claims jobs (SKIP LOCKED)
                  │ Supabase          │◄─────────────┘
                  │ Postgres+pgvector │   policies (= job queue + status) · policy_chunks (vectors)
                  │ Storage (PDFs)    │   chat_history · policy_summaries · users
                  └───────────────────┘
                  ┌───────────────────┐
                  │ Redis (optional)  │   shared rate limits · auth/ownership cache ·
                  └───────────────────┘   answer + query-embedding cache
```

| Component | Responsibility | State | Scales by |
|---|---|---|---|
| **Node API** | JWT auth, validation, quotas, per-user rate limits, upload → storage + enqueue, proxy to RAG with retries/circuit breaker | none (Redis optional) | more instances behind the platform load balancer |
| **FastAPI RAG** | retrieve → rerank → LLM, streaming, multi-policy, summaries; embeds the ingest worker by default | none (cache optional) | more instances; or split the worker out |
| **Ingest worker** | parse PDF → chunk → embed → store vectors → summary | job state in Postgres | more workers (`python -m rag_engine.worker`) |
| **Postgres** | source of truth, durable job queue, vector search | everything durable | Supabase plan size / read replicas |
| **Redis** | optional cache + shared counters | ephemeral | managed (Upstash) |

## Why these design choices

**The database is the queue.** Upload = store the PDF + insert a `policies` row with `status='queued'`.
Workers call `claim_ingest_job()` (`FOR UPDATE SKIP LOCKED`). Consequences:
- Jobs survive restarts, deploys and crashes; a worker that dies mid-job is detected by a stale lock and the job is re-claimed (max 3 attempts, then `failed`).
- Any number of workers can run concurrently without double-processing.
- The status endpoint reads one row; it works while the RAG service is asleep or restarting, and it survives page reloads.
- Retries are idempotent (`ingest(..., overwrite=True)` replaces partial chunks) and so are uploads (`Idempotency-Key`).

**Redis is an optimisation, never a dependency.** Every Redis call is best-effort with an in-memory fallback and, on the Python side, a 30 s circuit breaker. Redis down ⇒ slower and per-instance limits, not an outage.

**Exact per-policy vector search.** `match_policy_chunks_v2` selects a policy's rows through a btree on `policy_id`
and ranks them exactly. The old approach ran an approximate (HNSW) scan *then* filtered by policy, which with many users
sharing one table can return too few or zero rows. A policy has a few hundred chunks, so exact ranking is cheap and
independent of how many other users exist.

**Hosted reranker, no PyTorch.** The cross-encoder needed ~1.5 GB RAM and a model download on cold start. Jina's reranker
API keeps the service ~250 MB, starts fast, and a reranker failure degrades to vector order instead of failing the question.

**Backpressure over queues-of-doom.** LLM calls are capped (`LLM_MAX_CONCURRENCY`). When saturated, requests wait up to
`LLM_QUEUE_TIMEOUT_SECONDS` and then get `503 + Retry-After`, which the Node API and the frontend retry politely. A flood of
questions slows down gracefully rather than exhausting memory or hammering Groq into mass 429s.

## Request flows

**Upload:** browser → Node (auth, quota, size/type check) → Storage → `policies(queued)` → response (~200 ms) →
worker claims → progress written to `policies` → browser polls `/ingest/status` (backoff 1.5 s → 5 s) → `ready`.

**Question (streaming):** browser → Node (auth, user rate limit, ownership + `ready` check, cached) →
FastAPI → answer cache? → embed query (cached) → vector search → rerank → LLM stream → tokens back → history saved.

## Failure modes

| Failure | What happens |
|---|---|
| User's connection drops mid-upload | Request retried with the same `Idempotency-Key`; never creates a duplicate policy |
| User's connection drops mid-answer | Stream breaks; UI keeps the partial text and puts the question back in the input |
| User closes the tab while processing | Job continues server-side; on return the dashboard resumes polling |
| Browser offline | Banner shown; polling pauses and resumes immediately on reconnect |
| RAG service restarts / deploys mid-ingest | Lock goes stale → job re-claimed automatically |
| RAG service asleep (free tier) | Node pings to wake it; chat returns a retryable 503; queued jobs wait, then run |
| RAG service down | Circuit breaker opens after 5 failures: fail fast for 20 s, then probe again |
| LLM provider rate-limits / errors | Concurrency cap → 503 + Retry-After; optional fallback provider; retries with backoff |
| Reranker/Jina rerank down | Falls back to vector order |
| Redis down | Falls back to memory; rate limits become per-instance |
| Supabase blip | Retries on vector ops; status/list endpoints return retryable 503 |
| Policy deleted while being processed | Worker notices the missing row and removes the chunks it just wrote |
| Poison PDF | 3 attempts, then `failed` with a Retry button; never blocks other jobs |

## Capacity — measured

Measured on a laptop against the real stack (Supabase in Singapore, Groq + Jina free tiers); reproduce with `loadtest/chat.js`.

| Path | Result | What limits it |
|---|---|---|
| `GET /api/health` (liveness) | ~11,700 req/s, p99 12 ms | Node itself |
| `GET /api/policies`, `/api/ingest/status/:id` | ~290–330 req/s, p50 ~150 ms, p99 < 1 s, 0 errors at 50 concurrent | one Supabase round trip (~150 ms) per request |
| Repeated question (answer cache) | **~10–20 ms** vs 1.3–3.6 s uncached | — |
| 24 simultaneous *uncached* questions | **24/24 succeeded**, 65 s wall (before the rate-limit work: 22/24, 2 errors) | **Groq free tier: 8,000 tokens/min** |
| Ingest, 2 small PDFs | ready in 7–10 s each | embedding + inserts |

**The honest ceiling is the LLM provider's quota, not this code.** Groq's free tier allows 8,000 tokens/min for the default model
and each question uses ~2,000 (prompt + context), so *sustained* uncached throughput is only a handful of questions per minute
across all users. Bursts are absorbed (throttling, `Retry-After`-aware retries, concurrency cap, polite 503s), but they are
absorbed by waiting. Ways to raise the ceiling, cheapest first:

1. **Cache** (already on) — repeated/similar questions cost nothing.
2. **Fallback provider** — set `GEMINI_API_KEY` + `LLM_FALLBACK_PROVIDER=gemini` (free key from aistudio.google.com); when Groq
   rate-limits, requests continue on Gemini.
3. **Paid Groq tier** (Dev tier) — raises the limit by orders of magnitude; no code change.
4. Fewer tokens per question: lower `top_k_rerank` in `QueryService` (trades answer context for throughput).

Everything else scales horizontally: Node and RAG are stateless (more instances), ingest workers coordinate through Postgres,
and vector search cost depends on one policy's rows, not on the number of users. Jina calls are throttled per instance
(`JINA_MAX_RPM`, default 80) — divide your Jina limit by the instance count.

## Scaling levers, in order

1. Turn on Redis (`REDIS_URL`) — shared limits + caches.
2. Add RAG instances (Render: bump instance count).
3. Split the worker: second service `python -m rag_engine.worker`, set `EMBEDDED_WORKER=false` on the API service.
4. Raise `LLM_MAX_CONCURRENCY` / upgrade the LLM tier / set `LLM_FALLBACK_PROVIDER`.
5. Supabase compute upgrade / read replica for chat history.

## Observability

- Every request has an `X-Request-Id` (Node and FastAPI) and a latency log line.
- `GET /api/health` (liveness), `GET /api/health/deep` (database, Python, Redis, circuit breaker),
  `GET /health/stats` on FastAPI (cache backend, workers alive, LLM capacity).
- Load test: `loadtest/chat.js` (k6).
