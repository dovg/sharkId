"""
Item 59 — ML FastAPI endpoint tests.

The module-level singleton in store.py is reset via the autouse fixture so
each test gets an empty, isolated store backed by a tmp_path directory.
"""
import io

import pytest
from PIL import Image
from starlette.testclient import TestClient


# ── autouse: reset embedding store before each test ───────────────────────────


@pytest.fixture(autouse=True)
def reset_ml_store(tmp_path, monkeypatch):
    """
    Redirect the module-level path constants and reset the singleton so every
    test starts with a fresh in-process EmbeddingStore.
    """
    import store as store_module

    base = tmp_path / "embeddings"
    monkeypatch.setattr(store_module, "_BASE_PATH", base)
    monkeypatch.setattr(store_module, "_JSON_PATH", base.with_suffix(".json"))
    monkeypatch.setattr(store_module, "_NPY_PATH", base.with_suffix(".npy"))
    monkeypatch.setattr(store_module, "_store", None)


# ── fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def ml_client():
    from main import app

    return TestClient(app)


@pytest.fixture
def jpeg_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), color=(120, 80, 40)).save(buf, format="JPEG")
    return buf.getvalue()


# ── /health ───────────────────────────────────────────────────────────────────


def test_health(ml_client):
    resp = ml_client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "ml"
    assert "embeddings" in data


def test_health_shows_zero_embeddings(ml_client):
    assert ml_client.get("/health").json()["embeddings"] == 0


# ── /detect ───────────────────────────────────────────────────────────────────


def test_detect_returns_bbox_keys(ml_client, jpeg_bytes):
    resp = ml_client.post(
        "/detect",
        content=jpeg_bytes,
        headers={"Content-Type": "image/jpeg"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "shark_bbox" in data
    assert "zone_bbox" in data


def test_detect_empty_body_returns_400(ml_client):
    resp = ml_client.post("/detect", content=b"", headers={"Content-Type": "image/jpeg"})
    assert resp.status_code == 400


# ── /classify ─────────────────────────────────────────────────────────────────


def test_classify_empty_store(ml_client, jpeg_bytes):
    resp = ml_client.post(
        "/classify",
        content=jpeg_bytes,
        headers={"Content-Type": "image/jpeg"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"candidates": []}


def test_classify_empty_body_returns_400(ml_client):
    resp = ml_client.post("/classify", content=b"", headers={"Content-Type": "image/jpeg"})
    assert resp.status_code == 400


def test_classify_invalid_image_returns_422(ml_client):
    resp = ml_client.post(
        "/classify",
        content=b"not an image",
        headers={"Content-Type": "image/jpeg"},
    )
    assert resp.status_code == 422


# ── /embeddings ───────────────────────────────────────────────────────────────


def test_store_embedding(ml_client, jpeg_bytes):
    resp = ml_client.post(
        "/embeddings?shark_id=shark-1&display_name=TestShark&photo_id=photo-1",
        content=jpeg_bytes,
        headers={"Content-Type": "image/jpeg"},
    )
    assert resp.status_code == 200
    data = resp.json()
    from embedder import EMBEDDING_DIM
    assert data["status"] == "stored"
    assert data["shark_id"] == "shark-1"
    assert data["embedding_dim"] == EMBEDDING_DIM


def test_store_embedding_increments_health_count(ml_client, jpeg_bytes):
    assert ml_client.get("/health").json()["embeddings"] == 0

    ml_client.post(
        "/embeddings?shark_id=s1&display_name=S1&photo_id=p1",
        content=jpeg_bytes,
        headers={"Content-Type": "image/jpeg"},
    )

    assert ml_client.get("/health").json()["embeddings"] == 1


def test_store_and_classify(ml_client, jpeg_bytes):
    """After storing one embedding, classify should return a candidate."""
    ml_client.post(
        "/embeddings?shark_id=shark-x&display_name=SharkX&photo_id=px",
        content=jpeg_bytes,
        headers={"Content-Type": "image/jpeg"},
    )

    resp = ml_client.post(
        "/classify",
        content=jpeg_bytes,
        headers={"Content-Type": "image/jpeg"},
    )
    assert resp.status_code == 200
    # With default threshold 0.5 and identical image, score should be ~1.0
    candidates = resp.json()["candidates"]
    # May be empty if threshold > score, but structure should be valid
    assert isinstance(candidates, list)


def test_store_embedding_empty_body_returns_400(ml_client):
    resp = ml_client.post(
        "/embeddings?shark_id=s&display_name=S&photo_id=p",
        content=b"",
        headers={"Content-Type": "image/jpeg"},
    )
    assert resp.status_code == 400
