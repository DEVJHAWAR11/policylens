# PolicyLens — RAG Engine & API

**PolicyLens** is an AI-powered insurance policy analysis platform. This repository contains the **RAG Engine and FastAPI backend** that powers the core intelligence — upload any PDF policy document and IRIS instantly parses, indexes, and lets you query it in plain English.

> The React frontend and Node.js auth/proxy backend are maintained separately by teammates and are not documented here.

---

## RAG Pipeline

```mermaid
flowchart TD
    A([📄 PDF Uploaded]) -->|raw bytes| B[PyMuPDF Parser]
    B -->|clean text| C[Chunker]
    B -->|whole doc| D[Summariser — Groq API]
    C -->|small pieces| E[Jina Embedder]
    D -->|saves| F[(Summaries — Supabase)]
    E -->|save vectors| G[(Vector Store — Supabase pgvector)]
    H([❓ User Question]) -->|embed query| I[Jina Embedder]
    I -->|similarity search| G
    G -->|top chunks| J[Groq LLM]
    J -->|answer + sources| K([💡 Answer])
```

---

## Features

- **PDF Parsing** — PyMuPDF local parser (~0.2s), no cloud OCR dependency. Optional LlamaParse fallback via `USE_LLAMAPARSE=true`
- **Semantic Chunking** — Page-boundary-aware chunker (~31 chunks per 20-page doc)
- **Jina Embeddings v3** — 768-dim vectors, batched for efficiency
- **Vector Store** — Supabase pgvector with cosine similarity search
- **CrossEncoder Reranking** — BGE reranker re-scores retrieved chunks for precision
- **Auto Summary** — Structured policy summary generated on upload (coverage, exclusions, premiums, benefits)
- **Streaming Chat** — IRIS chat powered by Groq API with full document context
- **Chat History** — All conversations persisted in Supabase per user per policy

---

## Tech Stack

| Layer | Technology |
|---|---|
| API Framework | Python 3.11, FastAPI, Uvicorn |
| PDF Parsing | PyMuPDF / pymupdf4llm (local) |
| Embeddings | Jina Embeddings v3 API (768-dim) |
| Vector Store | Supabase pgvector |
| Reranker | sentence-transformers CrossEncoder (BGE) |
| LLM | Groq API |
| Database | Supabase (PostgreSQL) |

---

## Project Structure

Only the parts I built are documented below.

```
policylens/
├── api/                          # FastAPI app
│   ├── main.py                   # App entry, lifespan, CORS setup
│   └── routes/
│       ├── ingest.py             # POST /ingest/upload, GET /ingest/status/:id, GET /ingest/summary/:id
│       ├── query.py              # POST /query (stream + non-stream)
│       └── health.py             # GET /health
│
├── rag_engine/                   # Core RAG logic
│   ├── ingestion/
│   │   ├── pdf_loader.py         # PyMuPDF parser (LlamaParse optional fallback)
│   │   ├── cleaner.py            # Text normalisation
│   │   ├── chunker.py            # Semantic chunking with page boundary tracking
│   │   └── pipeline.py           # Orchestrates load → clean → chunk
│   ├── embeddings/
│   │   ├── jina_embedder.py      # Jina v3 API (default, 768-dim)
│   │   └── local_embedder.py     # BGE local fallback (CPU)
│   ├── vector_store/
│   │   └── supabase_store.py     # pgvector upsert + similarity search
│   ├── retrieval/
│   │   ├── retriever.py          # k-NN vector search
│   │   ├── reranker.py           # CrossEncoder reranker
│   │   ├── context_builder.py    # Builds prompt context from chunks
│   │   └── query_preprocessor.py
│   ├── llm/
│   │   └── groq_llm.py           # Groq API client (stream + complete)
│   ├── services/
│   │   ├── ingestion_service.py  # End-to-end ingest orchestration
│   │   ├── query_service.py      # End-to-end query + streaming
│   │   └── summary_service.py    # Auto policy summary on upload
│   ├── prompts/                  # System prompts, query templates, response formatter
│   ├── config/
│   │   └── settings.py           # Pydantic settings (reads .env)
│   └── utils/
│       ├── status_tracker.py     # In-memory ingestion progress tracker
│       ├── retry.py              # Exponential backoff decorator
│       └── logger.py
│
├── supabase_migrations/          # SQL files — run in order (001 → 005)
├── .env.example
├── requirements.txt
├── Dockerfile
└── docker-compose.yml

# frontend/   → React 19 + Vite (teammate)
# backend/    → Node.js + Express auth/proxy (teammate)
```

---

## Ingestion Pipeline

```
PDF Upload
  ↓
PyMuPDF (local, ~0.2s)          ← set USE_LLAMAPARSE=true for cloud fallback
  ↓
Text Cleaner
  ↓
Semantic Chunker (~31 chunks per 20-page doc)
  ↓
Jina Embeddings v3 (768-dim, batches of 100)
  ↓
Supabase pgvector (batch upsert)
  ↓
Auto Summary (Groq API, top-15 chunks)
  ↓
Status → "ready"
```

---

## Query Pipeline

```
User Question
  ↓
Query Preprocessor
  ↓
Jina embed_query (single vector)
  ↓
pgvector similarity_search (k=8)
  ↓
CrossEncoder Reranker (top 5)
  ↓
Context Builder (~3400 tokens)
  ↓
Groq LLM (stream or complete)
  ↓
Response + Sources
```

---

## Local Setup

### Prerequisites
- Python 3.11+
- A [Supabase](https://supabase.com) project with pgvector enabled
- [Jina AI](https://jina.ai) API key (free tier available)
- [Groq](https://console.groq.com) API key (free tier available)

### 1. Supabase — Run Migrations

In your Supabase project → **SQL Editor**, run the files in `supabase_migrations/` in order from `001` to `005`.

### 2. Python RAG Engine

```bash
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env`:

```env
GROQ_API_KEY=your_groq_api_key
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key

EMBEDDING_PROVIDER=jina
JINA_API_KEY=jina_xxxxxxxxxxxxxxxx

# Optional — only needed if USE_LLAMAPARSE=true
LLAMA_CLOUD_API_KEY=not_used
USE_LLAMAPARSE=false
```

Start the server:

```bash
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```

✅ Running at `http://localhost:8000`

---

## Architecture & deployment

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — components, data flow, failure modes, capacity and scaling plan
- **[docs/DEPLOY_RENDER.md](docs/DEPLOY_RENDER.md)** — step-by-step deploy on Render (+ Upstash Redis, Supabase)
- **[docs/AUDIT.md](docs/AUDIT.md)** — security/bug audit and what was fixed

---

## API Reference

The React app talks only to the Node backend (`/api/*`). The Node backend talks to the FastAPI service below
with a shared `X-Internal-Key`; FastAPI is not meant to be public.

### Node backend (public, JWT-authenticated)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/ingest/upload` | Store a PDF and enqueue processing. Send an `Idempotency-Key` header to make retries safe |
| GET | `/api/ingest/status/:policy_id` | `queued` → `processing` → `ready` / `failed`, with progress (read from the database) |
| GET | `/api/policies` | List the user's policies with status |
| POST | `/api/policies/:id/retry` | Re-queue a failed policy |
| GET | `/api/policies/:id/pdf` | Short-lived signed link to the stored PDF |
| GET | `/api/policies/:id/summary` | Structured summary |
| DELETE | `/api/policies/:id` | Delete PDF, vectors, summary, chat history |
| POST | `/api/query` · `/api/query/stream` | Ask one policy (JSON / streamed text) |
| POST | `/api/query/multi` | Ask across 2–5 policies (`{ question, policy_ids }`) |
| GET | `/api/health` · `/api/health/deep` | Liveness · readiness (database, Python, Redis, circuit state) |

### FastAPI RAG service (internal)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/query/` · `/query/stream` · `/query/multi` | RAG pipeline (retrieve → rerank → LLM) |
| POST/GET | `/ingest/summary/:policy_id` | (Re)generate / fetch a summary |
| GET | `/` · `/health/` · `/health/stats` | Liveness · Supabase check · cache/worker/LLM-capacity snapshot |

Ingestion itself runs in `rag_engine/worker.py`, which claims jobs from Postgres
(`FOR UPDATE SKIP LOCKED`) — embedded in the API process by default, or as a separate service.

---

## Environment Variables

See `.env.example` and `backend/.env.example` for the full, commented lists. The important ones:

| Variable | Service | Required | Description |
|---|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | both | ✅ | Supabase project and service-role key |
| `JWT_SECRET` | Node | ✅ | ≥32 random characters |
| `PYTHON_API_URL` | Node | ✅ | URL of the FastAPI service |
| `INTERNAL_API_KEY` | both | ✅ prod | Shared secret between Node and FastAPI |
| `GROQ_API_KEY` | Python | ✅ | LLM |
| `JINA_API_KEY` | Python | ✅ | Embeddings **and** reranking |
| `REDIS_URL` | both | ❌ | Shared cache/rate limits (e.g. Upstash). Falls back to memory |
| `CORS_ORIGINS` | both | ✅ prod | Your frontend origin(s) |
| `RESEND_API_KEY` | Node | ❌ | Password-reset emails |
| `EMBEDDED_WORKER` | Python | ❌ | `true` (default) runs the ingest worker inside the API process |
| `LLM_FALLBACK_PROVIDER` | Python | ❌ | e.g. `gemini` — used if the primary LLM errors |
