# Deploying PolicyLens on Render

Three parts, all created from `render.yaml` and deployed straight from a GitHub branch of your repo (no merge needed):

| Service | What | Plan |
|---|---|---|
| `policylens-devj-api` | Node API (auth, uploads, chat proxy) | starter ($7/mo) |
| `policylens-devj-rag` | Python RAG service + embedded ingest worker | starter ($7/mo) |
| `policylens-devj-web` | React frontend (static) | free |

URLs: `https://policylens-devj-{api,rag,web}.onrender.com`. Supabase stays as the database/storage; Upstash Redis is optional.

## 0. Prerequisites

1. **Supabase migrations** `001`–`008` applied, and a **private** `policy-pdfs` bucket.
2. API keys: Groq, Jina (used for embeddings *and* reranking), Supabase service-role key, and the public anon key.
3. A Render account connected to GitHub, with the Render GitHub app allowed on your fork.

## 1. Create everything

Render dashboard → **New → Blueprint** → choose your fork and the branch `feat/scalable-architecture`.
Render reads `render.yaml` and lists the three services. Everything is preset except these secrets:

| Variable | Service | Value |
|---|---|---|
| `SUPABASE_SERVICE_KEY` | api, rag | Supabase → Settings → API → secret key |
| `INTERNAL_API_KEY` | api, rag | any long random string — **the same on both** |
| `GROQ_API_KEY` | rag | console.groq.com/keys |
| `JINA_API_KEY` | rag | jina.ai |
| `VITE_SUPABASE_ANON_KEY` | web | Supabase → Settings → API → anon/public key |

`JWT_SECRET` is generated for you.

## 2. Tell Supabase about the new frontend URL

Supabase → Authentication → URL Configuration → add `https://policylens-devj-web.onrender.com/**` to **Redirect URLs**
(and set **Site URL** to `https://policylens-devj-web.onrender.com`). Google sign-in will not return to the new site until this is done.

## 3. Verify

```bash
curl https://policylens-devj-api.onrender.com/api/health/deep    # database, python, redis, circuit state
```

Open `https://policylens-devj-web.onrender.com`, sign in, upload a PDF: it should go `queued → processing → ready`.

## 4. Optional extras (service → Environment tab)

- `REDIS_URL` (Upstash `rediss://…`) on **both** API services — shared cache and rate limits.
- `RESEND_API_KEY`, `MAIL_FROM` on the Node API — password-reset emails.

## 5. Scaling later

- More capacity: raise the instance count of a service in Render.
- Dedicated worker: a `type: worker` service from the same Dockerfile with `dockerCommand: python -m rag_engine.worker`,
  and `EMBEDDED_WORKER=false` on `policylens-devj-rag`.
- Chat throughput on the Groq free tier is capped by Groq's tokens-per-minute quota — see `docs/ARCHITECTURE.md`.

## 6. After merging to `main`

The services are pinned to `feat/scalable-architecture`. Once the branch is merged, change each service's **Branch** to `main`
in its Settings (or edit `branch:` in `render.yaml`).

> **Plans:** `free` is fine for a demo, but free services sleep after 15 minutes idle, so the first request after a pause takes
> 30–60 s (the app shows a retryable "waking up" message, and queued uploads run once the RAG service wakes).
