"""App settings — reads from .env via pydantic-settings."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        case_sensitive=False,
        extra="ignore",
    )

    # optional — only needed if USE_LLAMAPARSE=true (pymupdf4llm is default)
    llama_cloud_api_key: str = ""
    supabase_url: str
    supabase_service_key: str

    # gemini (primary LLM)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3-flash-preview"

    # kimi / moonshot (legacy — kept for backward compat, not required)
    moonshot_api_key: str = ""
    kimi_base_url: str = "https://api.moonshot.ai/v1"
    kimi_model: str = "moonshot-v1-8k"

    # groq
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-20b"

    # optional provider keys
    openai_api_key: str = ""
    jina_api_key: str = ""
    cohere_api_key: str = ""

    # supabase / vector store
    vector_table_name: str = "policy_chunks"
    vector_store_provider: str = "supabase"

    # embedding
    embedding_provider: str = "jina"
    embedding_model: str = "jina-embeddings-v3"
    embedding_dimension: int = 768
    # Jina v3 task adapters (retrieval.query / retrieval.passage) for NEW ingests. Each chunk
    # records how it was embedded (metadata.embed_task) and queries follow the policy, so old
    # and new policies coexist; `python -m rag_engine.reembed` upgrades the old ones.
    jina_task_adapters: bool = True
    # hybrid retrieval: vector + BM25 candidates fused with reciprocal-rank fusion
    hybrid_search: bool = True
    retrieval_k: int = 8            # fused candidates handed to the reranker
    candidate_pool: int = 12        # how many candidates each retriever contributes

    # llm
    llm_provider: str = "groq"
    llm_model: str = "openai/gpt-oss-20b"
    # gpt-oss models "think" before answering; those hidden tokens count against provider
    # rate limits and add seconds of latency. Extractive Q&A over a document needs little.
    llm_reasoning_effort: str = "low"   # low | medium | high ("" = provider default)

    # reranker: "jina" (hosted API, default), "cross_encoder" (local, needs torch), "none"
    reranker_provider: str = "jina"
    reranker_model: str = "jina-reranker-v2-base-multilingual"
    # chunks passed to the LLM after reranking (eval: 3 -> 4 lifts retrieval hits 19/24 -> 22/24)
    rerank_top_k: int = 4
    local_reranker_model: str = "cross-encoder/ms-marco-TinyBERT-L-2-v2"

    # redis (optional) — shared cache; falls back to per-process memory when empty
    redis_url: str = ""
    answer_cache_ttl_seconds: int = 3600
    embedding_cache_ttl_seconds: int = 86400

    # LLM protection: cap concurrent calls and fail fast instead of piling up
    llm_max_concurrency: int = 6
    llm_queue_timeout_seconds: float = 20.0
    llm_fallback_provider: str = ""  # e.g. "gemini" — used if the primary provider errors

    # Jina (embeddings + reranking) client-side throttle, calls/minute across both. 0 = off.
    # Free tier is roughly 100 RPM; keep headroom, and divide by the number of instances.
    jina_max_rpm: int = 80

    # ingest worker
    embedded_worker: bool = True       # run the worker loop inside the API process
    worker_concurrency: int = 1
    worker_poll_seconds: float = 2.0
    worker_stale_after_minutes: int = 10
    worker_max_attempts: int = 3
    storage_bucket: str = "policy-pdfs"

    # security — shared secret the Node backend sends as X-Internal-Key.
    # When empty the API is open (dev only).
    internal_api_key: str = ""
    cors_origins: str = "*"
    max_upload_mb: int = 25

    # backend integration
    port: int = 4000
    python_api_url: str = "http://localhost:8000"

    debug: bool = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings: Settings = get_settings()
