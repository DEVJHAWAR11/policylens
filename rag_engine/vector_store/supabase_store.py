"""Supabase-backed vector store (pgvector under the hood)."""

from __future__ import annotations

from supabase import create_client

from rag_engine.config.settings import settings
from rag_engine.utils.logger import get_logger
from rag_engine.utils.retry import with_retry
from .base_store import BaseVectorStore

logger = get_logger(__name__)

_BATCH_SIZE = 100
_INSERT_WORKERS = 4


class SupabaseVectorStore(BaseVectorStore):
    """Store and retrieve policy-chunk embeddings via Supabase."""

    def __init__(self) -> None:
        self._client = create_client(settings.supabase_url, settings.supabase_service_key)
        self._table = settings.vector_table_name
        logger.info("SupabaseVectorStore connected | table=%s", self._table)

    # ------------------------------------------------------------------ #
    #  write
    # ------------------------------------------------------------------ #
    def add_chunks(self, chunks: list[tuple[str, list[float], dict]]) -> None:
        """Insert chunks in parallel batches; each batch retries independently."""
        from concurrent.futures import ThreadPoolExecutor

        rows = [
            {"content": text, "embedding": vector, "metadata": meta}
            for text, vector, meta in chunks
        ]
        batches = [rows[i : i + _BATCH_SIZE] for i in range(0, len(rows), _BATCH_SIZE)]
        total = len(batches)

        @with_retry(max_retries=3, delay=1.0, backoff=2.0)
        def _insert_batch(args: tuple[int, list[dict]]) -> None:
            b_num, b_rows = args
            self._client.table(self._table).insert(b_rows).execute()
            logger.info("Batch %d/%d stored (%d rows)", b_num, total, len(b_rows))

        # list() surfaces the first exception; a failed batch fails the whole ingest,
        # and the worker's retry re-ingests with overwrite=True so nothing is duplicated.
        with ThreadPoolExecutor(max_workers=_INSERT_WORKERS) as pool:
            list(pool.map(_insert_batch, enumerate(batches, start=1)))

        logger.info("Successfully stored %d chunks in Supabase", len(chunks))

    # ------------------------------------------------------------------ #
    #  read
    # ------------------------------------------------------------------ #
    @with_retry(max_retries=3, delay=0.5, backoff=2.0)
    def similarity_search(
        self,
        query_embedding: list[float],
        k: int = 8,
        filter_dict: dict | None = None,
    ) -> list[dict]:
        filter_dict = filter_dict or {}
        if set(filter_dict) == {"policy_id"}:
            # exact per-policy search (btree first, then rank) — see migration 008
            response = self._client.rpc(
                "match_policy_chunks_v2",
                {
                    "query_embedding": query_embedding,
                    "p_policy_id": filter_dict["policy_id"],
                    "match_count": k,
                },
            ).execute()
        else:
            response = self._client.rpc(
                "match_policy_chunks",
                {
                    "query_embedding": query_embedding,
                    "match_count": k,
                    "filter": filter_dict,
                },
            ).execute()
        results = [
            {
                "content": r["content"],
                "metadata": r["metadata"],
                "score": r["similarity"],
            }
            for r in response.data
        ]
        logger.info("similarity_search | k=%d | returned %d results", k, len(results))
        return results

    # ------------------------------------------------------------------ #
    #  delete / exists
    # ------------------------------------------------------------------ #
    def delete_policy(self, policy_id: str) -> None:
        self._client.table(self._table).delete().eq("policy_id", policy_id).execute()
        logger.info("Deleted all chunks for policy_id=%s", policy_id)

    @with_retry(max_retries=3, delay=0.5, backoff=2.0)
    def policy_exists(self, policy_id: str) -> bool:
        response = (
            self._client.table(self._table)
            .select("id")
            .eq("policy_id", policy_id)
            .limit(1)
            .execute()
        )
        return bool(response.data)

    def get_policy_chunk_count(self, policy_id: str) -> int:
        response = (
            self._client.table(self._table)
            .select("id", count="exact")
            .eq("policy_id", policy_id)
            .limit(1)
            .execute()
        )
        return response.count or 0
