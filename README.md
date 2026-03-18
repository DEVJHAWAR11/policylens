---
title: PolicyLens RAG API
emoji: 🔍
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# PolicyLens — AI Insurance Policy Decoder

AI to decode and explain complex insurance/mortgage clauses in simple, easy-to-understand terms.

## Tech Stack

- **Frontend:** React.js, Vite, Tailwind CSS
- **Backend:** Node.js, Express.js
- **Database:** Supabase (Vector DB + Storage)
- **AI:** Kimi API (Moonshot)
- **Other:** LlamaParse (OCR), RAG (LangChain)

## Features

1. Upload PDF/Images (Batch Upload)
2. Summary Cards — key coverage, deductibles, exclusions
3. AI Chat — ask questions about your policy in plain language
4. Chat History — revisit past Q&A per policy
5. User Authentication — register, login, JWT-based sessions

## Supabase OAuth (Google) Setup

Email/password login remains unchanged. Google OAuth is a separate sign-in path.

1. Configure Supabase Auth provider:
	- In Supabase Dashboard, go to Authentication -> Providers -> Google.
	- Enable Google provider and add your Google OAuth client ID/secret.
	- In Google Cloud Console, add the authorized redirect URI:
	  - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

2. Configure redirect URLs:
	- In Supabase Dashboard, go to Authentication -> URL Configuration.
	- Add this local redirect URL: `http://localhost:5173`
	- Add your production redirect URL in the same format, for example: `https://your-domain.com`

3. Configure frontend env vars:
	- Copy `frontend/.env.example` to `frontend/.env`
	- Set:
	  - `VITE_SUPABASE_URL`
	  - `VITE_SUPABASE_ANON_KEY`

4. Start frontend and backend:
	- Frontend: `npm run dev` in `frontend/`
	- Backend: `npm run dev` in `backend/`

5. Login behavior:
	- Email/password uses your existing `/api/auth/login` endpoint.
	- Google OAuth uses Supabase OAuth, then the app exchanges the user profile with `/api/auth/google` to mint the same backend JWT used by protected API routes.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login and get JWT token |
| GET | `/auth/me` | Get logged-in user info |
| POST | `/ingest/upload` | Upload policy PDF/image |
| GET | `/ingest/status/{policy_id}` | Check ingestion status |
| GET | `/ingest/summary/{policy_id}` | Get AI-generated summary |
| POST | `/query/ask` | Ask a question about a policy |
| GET | `/history/{policy_id}` | Get chat history for a policy |

## Live API Docs

[https://devjhawar-policylens-rag-api.hf.space/docs](https://devjhawar-policylens-rag-api.hf.space/docs)
