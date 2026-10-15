"""API-layer tests: validation, auth guard, upload limits. No network or models needed."""

from __future__ import annotations

import os

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-key")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes.ingest import router as ingest_router
from api.routes.query import router as query_router
from rag_engine.config.settings import settings


class FakeQueryService:
    def query(self, question, policy_id, k):
        return {"answer": "42", "policy_id": policy_id, "source_count": 0, "sources": []}

    def stream_query(self, question, policy_id, k):
        yield "hel"
        yield "lo"


@pytest.fixture()
def client():
    app = FastAPI()
    app.state.query_service = FakeQueryService()
    app.include_router(query_router)
    app.include_router(ingest_router)
    return TestClient(app)


def test_query_ok(client):
    r = client.post("/query/", json={"question": "Is fire covered?", "policy_id": "abc_123"})
    assert r.status_code == 200
    assert r.json()["answer"] == "42"


def test_stream_ok(client):
    r = client.post("/query/stream", json={"question": "hi", "policy_id": "abc_123"})
    assert r.status_code == 200
    assert r.text == "hello"


@pytest.mark.parametrize(
    "body",
    [
        {"question": "", "policy_id": "abc"},
        {"question": "x" * 2001, "policy_id": "abc"},
        {"question": "hi", "policy_id": "../etc/passwd"},
        {"question": "hi", "policy_id": "abc", "k": 500},
    ],
)
def test_query_validation(client, body):
    assert client.post("/query/", json=body).status_code == 422


def test_internal_key_enforced(client, monkeypatch):
    monkeypatch.setattr(settings, "internal_api_key", "secret")
    body = {"question": "hi", "policy_id": "abc"}
    assert client.post("/query/", json=body).status_code == 401
    assert client.post("/query/", json=body, headers={"X-Internal-Key": "wrong"}).status_code == 401
    assert client.post("/query/", json=body, headers={"X-Internal-Key": "secret"}).status_code == 200


def test_upload_rejects_non_pdf(client):
    r = client.post(
        "/ingest/upload",
        files={"file": ("evil.pdf", b"not a pdf at all", "application/pdf")},
        data={"policy_id": "abc"},
    )
    assert r.status_code == 400


def test_upload_rejects_wrong_extension(client):
    r = client.post(
        "/ingest/upload",
        files={"file": ("x.txt", b"%PDF-1.4", "text/plain")},
        data={"policy_id": "abc"},
    )
    assert r.status_code == 400


def test_upload_rejects_oversize(client, monkeypatch):
    monkeypatch.setattr(settings, "max_upload_mb", 1)
    payload = b"%PDF-" + b"0" * (2 * 1024 * 1024)
    r = client.post(
        "/ingest/upload",
        files={"file": ("big.pdf", payload, "application/pdf")},
        data={"policy_id": "abc"},
    )
    assert r.status_code == 413


def test_upload_rejects_bad_policy_id(client):
    r = client.post(
        "/ingest/upload",
        files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")},
        data={"policy_id": "../../x"},
    )
    assert r.status_code == 422
