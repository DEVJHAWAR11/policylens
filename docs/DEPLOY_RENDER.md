# Deploying PolicyLens on Render

Two services (Node API + Python RAG, which also runs the ingest worker), Supabase for data, optional Upstash Redis.
Frontend stays on Vercel.

## 0. One-time prerequisites

1. **Supabase migrations** `001`–`008` applied (SQL editor, in order). `008` is required by this version of the code.
2. **Storage bucket** `policy-pdfs`, **private**.
3. **Keys** ready: Groq, Jina (used for embeddings *and* reranking), Supabase URL + service-role key.
4. A shared secret: `python -c "import secrets; print(secrets.token_hex(32))"` → `INTERNAL_API_KEY`.

## 1. Create the services

Render dashboard → **New → Blueprint** → select this repo. Render reads `render.yaml` and creates
`policylens-api` (Node) and `policylens-rag` (Docker). Fill the prompted secrets:

| Variable | policylens-api | policylens-rag |
|---|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | ✅ | ✅ |
| `INTERNAL_API_KEY` | ✅ same value | ✅ same value |
| `PYTHON_API_URL` | `https://policylens-rag.onrender.com` | — |
| `CORS_ORIGINS` | `https://<your-frontend>` | `https://<your-frontend>` |
| `GROQ_API_KEY`, `JINA_API_KEY` | — | ✅ |
| `GEMINI_API_KEY` (optional fallback) | — | ✅ + set `LLM_FALLBACK_PROVIDER=gemini` |
| `REDIS_URL` (optional) | ✅ | ✅ same URL |
| `RESEND_API_KEY`, `MAIL_FROM` | ✅ | — |

`JWT_SECRET` is generated for you. `NODE_ENV=production` is preset.

> **Plans:** `starter` is the smallest that doesn't sleep. On `free` both services spin down after 15 min idle —
> fine for a demo; the first request after a pause takes 30–60 s (the app shows a retryable "waking up" message,
> and queued uploads are picked up as soon as the RAG service wakes).

## 2. Redis (optional, recommended before scaling past one instance)

1. [upstash.com](https://upstash.com) → create a Redis database (free tier is plenty).
2. Copy the **`rediss://`** URL → `REDIS_URL` on **both** services.
3. Check `GET https://<api>/api/health/deep` → `"redis": "connected"`.

## 3. Frontend (Vercel)

Environment variables: `VITE_API_URL=https://policylens-api.onrender.com/api`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
Supabase → Authentication → URL configuration: add your Vercel URL to **Redirect URLs** (and `http://localhost:5173/**` for dev).

## 4. Verify

```bash
curl https://policylens-api.onrender.com/api/health/deep     # database, python, redis
curl https://policylens-rag.onrender.com/health/stats        # needs X-Internal-Key; workers_alive should be 1
```

Then upload a PDF in the app: status should go `queued → processing → ready`.

## 5. Scaling later

- More capacity: increase the instance count of either service in Render.
- Dedicated worker: add a service from the same Dockerfile with start command `python -m rag_engine.worker`
  and set `EMBEDDED_WORKER=false` on `policylens-rag`.
- Load test: `k6 run loadtest/chat.js` (see the file header for env vars).

## 6. Rolling back / migrating from Hugging Face

The Hugging Face sync workflow was removed. Cut over by pointing `PYTHON_API_URL` at the Render RAG service; the old Space
can then be paused. Deploy order matters: **migration 008 → RAG service → Node API → frontend**.
