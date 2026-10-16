"""Re-process existing policies with the current ingestion pipeline.

Two modes (both are per-policy and safe to interrupt; the next run resumes):

  python -m rag_engine.reembed --list
      show every policy and whether it is already on the current embedding scheme

  python -m rag_engine.reembed --mode vectors [--policy ID ...]
      re-embed the STORED chunk text with the Jina task adapters and tag the rows.
      Fast, needs no PDF. Chunk boundaries stay as they were.

  python -m rag_engine.reembed --mode full [--policy ID ...]
      download each PDF from Supabase Storage and re-ingest it (new structure-aware
      chunking + adapters). The policy's old chunks are deleted when its re-ingest starts,
      but only after the new chunks are fully built and embedded, so a failure leaves them as they were.

Only touches policies that are not already current unless --force is given.
"""
from __future__ import annotations

import argparse
import sys

from rag_engine.config.settings import settings
from rag_engine.services.ingestion_service import EMBED_TASK_ADAPTERS
from rag_engine.utils.logger import get_logger

logger = get_logger(__name__)


def _policies(store) -> list[dict]:
    rows = store._client.table("policies").select("policy_id, filename, status, storage_path").execute().data
    return rows


def _is_current(store, pid: str) -> bool:
    chunks = store.get_policy_chunks(pid)
    return bool(chunks) and all((c["metadata"] or {}).get("embed_task") == EMBED_TASK_ADAPTERS for c in chunks)


def reembed_vectors(store, embedder, pid: str) -> int:
    chunks = store.get_policy_chunks(pid)
    if not chunks:
        return 0
    vectors = embedder.embed_documents([c["content"] for c in chunks])
    updates = []
    for c, v in zip(chunks, vectors):
        meta = dict(c["metadata"] or {})
        meta["embed_task"] = EMBED_TASK_ADAPTERS
        updates.append((c["id"], v, meta))
    store.update_embeddings(updates)
    from rag_engine.retrieval.lexical import lexical_cache

    lexical_cache.invalidate(pid)
    return len(updates)


def reingest_full(store, embedder, pid: str, storage_path: str, filename: str) -> int:
    """Parse, chunk and embed first; only then swap the stored chunks, so a failure
    anywhere before the swap leaves the policy's existing chunks untouched."""
    import os
    import re
    import tempfile

    from rag_engine.ingestion.pipeline import IngestionPipeline
    from rag_engine.retrieval.lexical import lexical_cache

    pdf_bytes = store._client.storage.from_(settings.storage_bucket).download(storage_path)
    safe = re.sub(r"[^A-Za-z0-9._ -]", "_", filename or "policy.pdf")  # chunks cite this name
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, safe)
        with open(path, "wb") as f:
            f.write(pdf_bytes)
        chunks = IngestionPipeline().run(path, pid)
    if not chunks:
        raise ValueError("no text extracted")
    texts = [t for t, _ in chunks]
    metas = [m.to_supabase_dict() for _, m in chunks]
    for m in metas:
        m["embed_task"] = EMBED_TASK_ADAPTERS
    vectors = embedder.embed_documents(texts)
    store.delete_policy(pid)  # the only destructive step; everything above succeeded
    store.add_chunks(list(zip(texts, vectors, metas)))
    lexical_cache.invalidate(pid)
    return len(texts)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--mode", choices=["vectors", "full"], default="vectors")
    ap.add_argument("--policy", action="append", help="policy id (repeatable); default: all")
    ap.add_argument("--force", action="store_true", help="also redo policies that are already current")
    a = ap.parse_args()

    from rag_engine.embeddings.embedding_factory import get_embedder
    from rag_engine.vector_store.store_factory import get_vector_store

    store, embedder = get_vector_store(), get_embedder()
    if not getattr(embedder, "uses_task_adapters", False):
        print("JINA_TASK_ADAPTERS is off or the embedder does not support adapters; nothing to do.")
        return 1

    rows = [r for r in _policies(store) if not a.policy or r["policy_id"] in a.policy]
    for r in rows:
        pid = r["policy_id"]
        current = _is_current(store, pid) if r["status"] == "ready" else None
        if a.list:
            print(f"{pid}  {r['status']:<10} current={current}  {r.get('filename')}")
            continue
        if r["status"] != "ready" or (current and not a.force):
            continue
        try:
            n = reembed_vectors(store, embedder, pid) if a.mode == "vectors" else reingest_full(store, embedder, pid, r["storage_path"], r["filename"])
            print(f"OK   {pid}  {n} chunks  {r.get('filename')}")
        except Exception as exc:  # keep going; the policy keeps working on its old vectors
            print(f"FAIL {pid}  {type(exc).__name__}: {exc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
