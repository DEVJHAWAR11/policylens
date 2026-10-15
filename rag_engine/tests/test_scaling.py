"""Tests for the scalability / resilience layer (all offline)."""

from __future__ import annotations

import threading
import time
from unittest.mock import MagicMock, patch

import pytest

from rag_engine.config.settings import settings
from rag_engine.infra.cache import Cache, make_key
from rag_engine.infra import llm_guard


# ---------------------------------------------------------------- cache
def test_cache_roundtrip_and_expiry():
    c = Cache()
    c.set_json("k", {"a": 1}, ttl=60)
    assert c.get_json("k") == {"a": 1}
    c.set_json("short", 1, ttl=0)
    time.sleep(0.05)
    assert c.get_json("short") is None


def test_cache_survives_redis_outage():
    c = Cache()
    broken = MagicMock()
    broken.get.side_effect = ConnectionError("down")
    broken.set.side_effect = ConnectionError("down")
    c._redis = broken
    c.set_json("k", "v", ttl=60)           # must not raise
    assert c.get_json("k") == "v"           # served from the memory fallback
    assert broken.get.call_count + broken.set.call_count <= 2  # breaker stops hammering Redis
    c.get_json("k")
    c.get_json("k")
    assert broken.get.call_count <= 1


def test_make_key_is_stable_and_distinct():
    assert make_key("p", "a", "b") == make_key("p", "a", "b")
    assert make_key("p", "ab", "") != make_key("p", "a", "b")


# ----------------------------------------------------------- llm guard
def test_llm_guard_rejects_when_saturated(monkeypatch):
    monkeypatch.setattr(llm_guard, "_semaphore", threading.BoundedSemaphore(1))
    monkeypatch.setattr(settings, "llm_queue_timeout_seconds", 0.05)
    with llm_guard.llm_slot():
        with pytest.raises(llm_guard.ServiceBusy):
            with llm_guard.llm_slot():
                pass
    with llm_guard.llm_slot():  # released afterwards
        pass


# ------------------------------------------------------------ reranker
def test_jina_reranker_orders_by_relevance(monkeypatch):
    from rag_engine.retrieval import reranker as rr

    monkeypatch.setattr(settings, "jina_api_key", "k")
    r = rr.JinaReranker()
    monkeypatch.setattr(r, "_call", lambda q, docs, n: [
        {"index": 2, "relevance_score": 0.9}, {"index": 0, "relevance_score": 0.4},
    ])
    results = [{"content": "a"}, {"content": "b"}, {"content": "c"}]
    out = r.rerank("q", results, top_k=2)
    assert [x["content"] for x in out] == ["c", "a"]
    assert out[0]["rerank_score"] == 0.9


def test_reranker_falls_back_to_vector_order_on_failure(monkeypatch):
    from rag_engine.retrieval import reranker as rr

    monkeypatch.setattr(settings, "jina_api_key", "k")
    r = rr.JinaReranker()

    def boom(*a, **k):
        raise RuntimeError("api down")

    monkeypatch.setattr(r, "_call", boom)
    results = [{"content": "a"}, {"content": "b"}, {"content": "c"}]
    assert r.rerank("q", results, top_k=2) == results[:2]


def test_get_reranker_without_key_degrades(monkeypatch):
    from rag_engine.retrieval import reranker as rr

    monkeypatch.setattr(settings, "reranker_provider", "jina")
    monkeypatch.setattr(settings, "jina_api_key", "")
    out = rr.get_reranker().rerank("q", [{"content": "a"}, {"content": "b"}], top_k=1)
    assert out == [{"content": "a"}]


# --------------------------------------------------------- vector store
@patch("rag_engine.vector_store.supabase_store.create_client")
def test_store_uses_exact_policy_search(create_client):
    from rag_engine.vector_store.supabase_store import SupabaseVectorStore

    client = MagicMock()
    create_client.return_value = client
    client.rpc().execute.return_value = MagicMock(
        data=[{"content": "x", "metadata": {}, "similarity": 0.9}]
    )
    client.rpc.reset_mock()

    SupabaseVectorStore().similarity_search([0.1] * 768, k=3, filter_dict={"policy_id": "P1"})
    assert client.rpc.call_args.args[0] == "match_policy_chunks_v2"
    assert client.rpc.call_args.args[1]["p_policy_id"] == "P1"


@patch("rag_engine.vector_store.supabase_store.create_client")
def test_store_inserts_in_batches_and_propagates_failure(create_client):
    from rag_engine.vector_store import supabase_store
    from rag_engine.vector_store.supabase_store import SupabaseVectorStore

    client = MagicMock()
    create_client.return_value = client
    store = SupabaseVectorStore()
    chunks = [("t", [0.0], {"policy_id": "P"})] * 250
    store.add_chunks(chunks)
    assert client.table().insert.call_count == 3  # 100 + 100 + 50

    client.table().insert().execute.side_effect = RuntimeError("db down")
    with patch.object(supabase_store.time if hasattr(supabase_store, "time") else time, "sleep", lambda s: None):
        with pytest.raises(RuntimeError):
            store.add_chunks(chunks[:10])


# --------------------------------------------------------------- worker
def _worker():
    with patch("rag_engine.worker.create_client") as cc:
        from rag_engine.worker import IngestWorker

        w = IngestWorker(threading.Event())
        w._db = cc.return_value
        return w


def test_worker_claim_returns_none_when_queue_empty():
    w = _worker()
    w._db.rpc().execute.return_value = MagicMock(data=[])
    assert w.claim() is None


def test_worker_requeues_on_first_failure_and_fails_after_max_attempts():
    w = _worker()
    w._db.storage.from_().download.side_effect = RuntimeError("storage down")

    with patch("rag_engine.worker.status_tracker") as tracker:
        w.process({"job_policy_id": "P", "job_storage_path": "u/P.pdf", "job_attempts": 1})
        assert tracker.update_status.call_args.args[1] == "queued"

        w.process({
            "job_policy_id": "P", "job_storage_path": "u/P.pdf",
            "job_attempts": settings.worker_max_attempts,
        })
        assert tracker.update_status.call_args.args[1] == "failed"


def test_worker_marks_ready_even_if_summary_fails():
    w = _worker()
    w._db.storage.from_().download.return_value = b"%PDF-1.4"
    w._db.table().select().eq().limit().execute.return_value = MagicMock(data=[{"policy_id": "P"}])
    service = MagicMock()
    service.ingest.return_value = {"status": "success", "chunks": 3}
    w._service = service

    with patch("rag_engine.worker.status_tracker") as tracker, \
         patch("rag_engine.services.summary_service.SummaryService", side_effect=RuntimeError("llm down")):
        w.process({"job_policy_id": "P", "job_storage_path": "u/P.pdf", "job_attempts": 1})

    service.ingest.assert_called_once()
    assert service.ingest.call_args.kwargs["overwrite"] is True
    statuses = [c.args[1] for c in tracker.update_status.call_args_list]
    assert "failed" not in statuses and "queued" not in statuses


# ------------------------------------------------------- tracker (DB)
def test_tracker_never_throttles_terminal_states_and_survives_db_errors():
    from rag_engine.utils.status_tracker import status_tracker

    client = MagicMock()
    client.table().update().eq().execute.side_effect = RuntimeError("db down")
    status_tracker._client = client
    status_tracker.update_status("T1", "processing", 10, "a")
    status_tracker.update_status("T1", "ready", 100, "done", chunk_count=5)  # no raise
    assert status_tracker.get_status("T1")["status"] == "ready"
    status_tracker.clear("T1")
    status_tracker._client = None


def test_worker_cleans_up_chunks_when_policy_deleted_mid_ingest():
    w = _worker()
    w._db.storage.from_().download.return_value = b"%PDF-1.4"
    w._db.table().select().eq().limit().execute.return_value = MagicMock(data=[])  # row is gone
    service = MagicMock()
    service.ingest.return_value = {"status": "success", "chunks": 3}
    w._service = service

    with patch("rag_engine.worker.status_tracker"), patch.object(w, "_generate_summary") as summary:
        w.process({"job_policy_id": "P", "job_storage_path": "u/P.pdf", "job_attempts": 1})

    service._store.delete_policy.assert_called_once_with("P")
    summary.assert_not_called()


def test_worker_uses_original_filename_as_source_label():
    w = _worker()
    w._db.storage.from_().download.return_value = b"%PDF-1.4"
    w._db.table().select().eq().limit().execute.return_value = MagicMock(
        data=[{"policy_id": "P", "filename": "../My Policy (2024).pdf"}]
    )
    seen = {}
    service = MagicMock()
    service.ingest.side_effect = lambda path, pid, overwrite: seen.setdefault("name", __import__("os").path.basename(path)) and {"status": "success"}
    w._service = service

    with patch("rag_engine.worker.status_tracker"), patch.object(w, "_generate_summary"):
        w.process({"job_policy_id": "P", "job_storage_path": "u/P.pdf", "job_attempts": 1})

    assert seen["name"] == "My Policy (2024).pdf"  # sanitised, no path traversal, not a temp name


# ------------------------------------------------- rate limits (providers)
def test_throttle_spaces_calls_and_rejects_long_waits():
    from rag_engine.infra.throttle import RateLimiter

    limiter = RateLimiter(per_minute=600)  # one slot every 0.1s
    started = time.monotonic()
    for _ in range(4):
        limiter.acquire()
    assert time.monotonic() - started >= 0.25  # 4 calls need 3 gaps

    slow = RateLimiter(per_minute=1)  # one slot per minute
    slow.acquire()
    with pytest.raises(llm_guard.ServiceBusy):
        slow.acquire(max_wait=1.0)


def test_throttle_disabled_when_zero():
    from rag_engine.infra.throttle import RateLimiter

    limiter = RateLimiter(per_minute=0)
    started = time.monotonic()
    for _ in range(50):
        limiter.acquire()
    assert time.monotonic() - started < 0.1


def test_retry_honours_provider_hint_and_never_retries_backpressure(monkeypatch):
    from rag_engine.utils import retry as retry_mod

    sleeps = []
    monkeypatch.setattr(retry_mod.time, "sleep", lambda s: sleeps.append(s))

    calls = {"n": 0}

    @retry_mod.with_retry(max_retries=2, delay=0.1, backoff=2.0)
    def flaky():
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("Rate limit reached. Please try again in 7.2s.")
        return "ok"

    assert flaky() == "ok"
    assert sleeps and sleeps[0] >= 7.2  # waited what the provider asked, not our 0.1s

    busy_calls = {"n": 0}

    @retry_mod.with_retry(max_retries=5, delay=0.1)
    def busy():
        busy_calls["n"] += 1
        raise llm_guard.ServiceBusy()

    with pytest.raises(llm_guard.ServiceBusy):
        busy()
    assert busy_calls["n"] == 1


def test_is_rate_limited_detection():
    class RateLimitError(Exception):
        pass

    class Resp:
        status_code = 429

    http_429 = Exception("x")
    http_429.response = Resp()

    assert llm_guard.is_rate_limited(RateLimitError("groq"))
    assert llm_guard.is_rate_limited(http_429)
    assert not llm_guard.is_rate_limited(ValueError("nope"))
