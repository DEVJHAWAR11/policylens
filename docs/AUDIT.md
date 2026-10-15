# PolicyLens — Audit, fixes and plan

Status legend: ✅ fixed in this pass · 🟡 needs action from you · 🔜 recommended next

## 1. Critical security

| # | Issue | Status |
|---|-------|--------|
| 1 | `POST /api/auth/google` trusted any `email` in the body and returned a 7-day JWT → **anyone could log in as any user**. Now requires a Supabase OAuth access token and takes the email from the *verified* token. | ✅ |
| 2 | A Google OAuth client secret (`GOCSPX-…`) was committed in `frontend/.env.example` (commit `6c48636`, still in git history). | 🟡 rotate it |
| 3 | Python API had **no authentication** and is deployed publicly (HF Space). Anyone could query any policy, ingest, or trigger LLM summaries. Added shared-secret `X-Internal-Key` guard. | ✅ code · 🟡 set the key |
| 4 | `/query`, `/query/stream`, `/ingest/status` never checked that the `policy_id` belongs to the caller (IDOR). | ✅ |
| 5 | Password-reset: 6-digit code had no attempt limit (brute-forceable), was stored in plaintext, logged to the console in prod, and no email was ever sent. Now HMAC-hashed, max 5 attempts, rate-limited, emailed via Resend. | ✅ code · 🟡 add Resend key |
| 6 | Password-reset JWT (same secret, no `id`) was accepted by `authMiddleware` as a session token. Purpose-tokens and id-less tokens are now rejected. | ✅ |
| 7 | Supabase-token fallback in `authMiddleware` fell back to the `auth.users` id → FK failures / wrong owner. Now requires the local user row. | ✅ |
| 8 | `POST /ingest/` accepted a `pdf_url` (SSRF) and passed the URL to a local-file parser (never worked). Endpoint removed. | ✅ |
| 9 | No rate limiting anywhere; no `helmet`; request bodies unbounded. Added `express-rate-limit`, `helmet`, 100 kb JSON limit. | ✅ |
| 10 | No upload size limit (memory exhaustion); `.pdf` check was case-sensitive and trusted the name only. Now 25 MB cap + `%PDF-` magic-byte check on both Node and Python. | ✅ |
| 11 | `history?q=` was interpolated into a PostgREST `.or()` filter (filter injection). Sanitised, limit/page clamped. | ✅ |
| 12 | Tables have no RLS; the anon key shipped to browsers could read them. `007_hardening.sql` enables RLS (service key bypasses it). | ✅ file · 🟡 run it |
| 13 | Internal error messages (`err.message`) were returned to clients. Now generic; details only in server logs. | ✅ |
| 14 | Signup had no validation (email format, password length, bcrypt 72-byte limit); login leaked account existence via timing. | ✅ |
| 15 | `CORS=*` with `allow_credentials=True` (invalid combo) on the Python API. | ✅ |

## 2. Bugs

- ✅ Upload polling never stopped on failure — UI spun forever. Python now reports `failed`; Node marks the policy `failed`; Dboard/UploadModal stop and tell the user. Transient poll errors give up after ~3 min.
- ✅ Failed ingestion left half-written chunks. Now cleaned up.
- ✅ Dockerfile/compose port mismatch (7860 vs 8000) and healthcheck hit `/` which returned 404 → container always "unhealthy". Added `/` route, `PORT` env.
- ✅ Dockerfile pre-cached `MiniLM-L-6` but code loaded `TinyBERT-L-2` (downloaded at runtime on every cold start). Now configurable (`RERANKER_MODEL`) and aligned.
- ✅ Blocking RAG calls inside `async def` endpoints froze the event loop for all users. Now plain `def` (threadpool).
- ✅ `StatusTracker` shared a class-level dict with no locking. Now thread-safe.
- ✅ Chatbot route queried policy id `'test'`. Now asks the user to open a policy first.
- ✅ Streaming decoder corrupted multi-byte characters across chunk boundaries (`{stream:true}`).
- ✅ Streaming proxy: no abort on client disconnect, errors saved as chat answers, no error handler. Fixed.
- ✅ Dashboard/upload/chat routes were reachable without a session; 401s didn't log the user out. Added route guard + `auth-expired` handling.
- ✅ Frontend/backend upload limits disagreed (50 MB vs none). Unified at 25 MB.
- ✅ Hero star glow used `Math.random()` during render (flicker on every re-render).
- ✅ `pyproject` said Python ≥3.12, Dockerfile uses 3.11. `pytest` was installed in the production image.
- ✅ Hard-coded Supabase project URL in `supabaseClient.js`; `index.html` title was "landingpage".

## 3. Repo hygiene

- ✅ Root `node_modules/` (100+ files), `api.zip`, stray root `package.json` were tracked in git → untracked + ignored (a corrupted UTF-16 `.gitignore` line was why).
- ✅ `backend/diag_node.js` debug script removed; debug `print`/`console.log` removed.
- ✅ `.dockerignore` now excludes frontend/backend/node_modules from the Python image.
- ✅ Lint: 12 errors → 0. Build passes. Tests added (11 Python API tests, 4 Node auth tests) + CI workflow.

## 4. Remaining recommendations (not done — need a decision or are larger)

- 🔜 **Re-ingest with Jina task adapters** (`retrieval.passage` for docs, `retrieval.query` for queries) — typically a solid retrieval-quality gain, but needs all existing policies re-embedded.
- 🔜 `query_preprocessor.extract_filters` hard-filters on `coverage_category` using fire/flood/theft keywords. Those keywords come from a generic property-insurance taxonomy; for life/health policies they can wrongly narrow retrieval (there is a fallback only when *zero* rows match). Consider dropping or making it a soft boost.
- 🔜 Ingest status lives in process memory — lost on restart and not shared across replicas. Store it in a Supabase table (or just use `policies.status`).
- 🔜 Move session JWT from `localStorage` to an httpOnly cookie (XSS resilience); shorten the 7-day expiry + add refresh.
- 🔜 The 1-year signed PDF URL is stored in the DB and returned by `/policies`; generate short-lived URLs on demand instead.
- 🔜 Code-split the 600 kB+ frontend bundle (`React.lazy` for Dboard/Chatbot/Login); `Dboard.jsx` (1000 lines) and `Login.jsx` (1100 lines) should be split into components.
- 🔜 Personal-email-only rule is enforced client-side only. If it is a real business rule, enforce it in `/auth/signup` and `/auth/google` too.
- 🔜 Existing tests in `rag_engine/tests` hit live services; mark them `integration` and keep unit tests offline.
- 🔜 Multi-policy `query_service.query_multi_policy` is implemented but not exposed by the API.

## 5. What I need from you

1. **Rotate the Google OAuth client secret** (Google Cloud Console → Credentials → your OAuth client → reset secret) and update it in Supabase → Auth → Providers → Google. It is in public git history. If this repo is public, also consider the Supabase anon key exposed in old commits (rotate if RLS wasn't on).
2. **Generate a shared key** and set it in *both* services:
   `python -c "import secrets; print(secrets.token_hex(32))"` → `INTERNAL_API_KEY` in the Python env (HF Space secret / root `.env`) **and** `backend/.env`. Deploy both together — Node starts sending the header immediately; Python starts enforcing as soon as its var is set.
3. **Run `supabase_migrations/006` (if not yet) and `007_hardening.sql`** in the Supabase SQL editor.
4. **Password-reset email**: create a free [Resend](https://resend.com) account → API key → `RESEND_API_KEY` in `backend/.env`, plus `MAIL_FROM` once you verify a domain (the default `onboarding@resend.dev` only delivers to your own address). Without it, reset codes can't be delivered in production.
5. **Set in production**: `NODE_ENV=production`, `CORS_ORIGINS=https://<your-frontend>` on both services (not `*`), `JWT_SECRET` ≥32 random chars.
6. **Confirm the Supabase `policy-pdfs` storage bucket is private.**
7. **Decisions**: (a) is the personal-email-only rule real policy? (b) OK to re-embed existing policies for the Jina task-adapter upgrade? (c) Want me to commit this as a branch/PR? Nothing has been committed.
8. **GitHub secret**: `HF_TOKEN` must exist for the HF sync workflow; add a repo secret if CI is to deploy.
