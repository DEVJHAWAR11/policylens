"""API-layer tests: validation, auth guard, backpressure. No network or models needed."""

from __future__ import annotations

import os

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-key")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.errors import service_busy_handler
from api.routes.query import router as query_router
from rag_engine.config.settings import settings
from rag_engine.infra.llm_guard import ServiceBusy


class FakeQueryService:
    busy = False

    def check_capacity(self):
        if self.busy:
            raise ServiceBusy(retry_after=7)

    raise_exc = None

    def query(self, question, policy_id, k):
        if self.raise_exc:
            raise self.raise_exc
        return {"answer": "42", "policy_id": policy_id, "source_count": 0, "sources": []}

    def query_multi_policy(self, question, policy_ids, k_per_policy):
        return {"answer": "cmp", "source_count": 0, "sources": []}

    def prepare_stream(self, question, policy_id, k):
        return iter(["hel", "lo"])


@pytest.fixture(autouse=True)
def _no_internal_key(monkeypatch):
    # hermetic: a developer's local .env may define INTERNAL_API_KEY
    monkeypatch.setattr(settings, "internal_api_key", "")


@pytest.fixture()
def client():
    app = FastAPI()
    app.state.query_service = FakeQueryService()
    app.add_exception_handler(ServiceBusy, service_busy_handler)
    app.include_router(query_router)
    return TestClient(app)


def test_query_ok(client):
    r = client.post("/query/", json={"question": "Is fire covered?", "policy_id": "abc_123"})
    assert r.status_code == 200
    assert r.json()["answer"] == "42"


def test_stream_ok(client):
    r = client.post("/query/stream", json={"question": "hi", "policy_id": "abc_123"})
    assert r.status_code == 200
    assert r.text == "hello"


def test_stream_returns_503_with_retry_after_when_saturated(client):
    client.app.state.query_service.busy = True
    r = client.post("/query/stream", json={"question": "hi", "policy_id": "abc_123"})
    assert r.status_code == 503
    assert r.headers["retry-after"] == "7"


def test_multi_ok(client):
    r = client.post("/query/multi", json={"question": "compare", "policy_ids": ["a1", "b2"]})
    assert r.status_code == 200
    assert r.json()["policy_id"] == "a1,b2"


@pytest.mark.parametrize(
    "path,body",
    [
        ("/query/", {"question": "", "policy_id": "abc"}),
        ("/query/", {"question": "x" * 2001, "policy_id": "abc"}),
        ("/query/", {"question": "hi", "policy_id": "../etc/passwd"}),
        ("/query/", {"question": "hi", "policy_id": "abc", "k": 500}),
        ("/query/multi", {"question": "hi", "policy_ids": ["only-one"]}),
        ("/query/multi", {"question": "hi", "policy_ids": ["a", "b", "c", "d", "e", "f"]}),
        ("/query/multi", {"question": "hi", "policy_ids": ["a", "../b"]}),
    ],
)
def test_validation(client, path, body):
    assert client.post(path, json=body).status_code == 422


def test_internal_key_enforced(client, monkeypatch):
    monkeypatch.setattr(settings, "internal_api_key", "secret")
    body = {"question": "hi", "policy_id": "abc"}
    assert client.post("/query/", json=body).status_code == 401
    assert client.post("/query/", json=body, headers={"X-Internal-Key": "wrong"}).status_code == 401
    assert client.post("/query/", json=body, headers={"X-Internal-Key": "secret"}).status_code == 200


def test_provider_rate_limit_becomes_retryable_503(client):
    class RateLimitError(Exception):
        pass

    client.app.state.query_service.raise_exc = RateLimitError("429 from groq")
    r = client.post("/query/", json={"question": "hi", "policy_id": "abc_123"})
    assert r.status_code == 503
    assert r.headers["retry-after"] == "10"


def test_unexpected_failure_is_a_generic_500(client):
    client.app.state.query_service.raise_exc = RuntimeError("secret internals")
    r = client.post("/query/", json={"question": "hi", "policy_id": "abc_123"})
    assert r.status_code == 500
    assert "secret internals" not in r.text
