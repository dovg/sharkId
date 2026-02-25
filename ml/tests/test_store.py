"""
Item 59 — EmbeddingStore unit tests.

Tests upsert/get/count semantics, file persistence, and thread safety.
"""
import threading

import numpy as np
import pytest

from store import EmbeddingStore


def _unit_vec(seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    v = rng.random(106).astype(np.float32)
    return v / np.linalg.norm(v)


# ── basic operations ──────────────────────────────────────────────────────────


def test_upsert_and_count(tmp_store):
    tmp_store.upsert("shark1", "Shark One", _unit_vec(1), "photo1")
    assert tmp_store.count() == 1


def test_upsert_multiple(tmp_store):
    tmp_store.upsert("shark1", "Shark One", _unit_vec(1), "photo1")
    tmp_store.upsert("shark2", "Shark Two", _unit_vec(2), "photo2")
    assert tmp_store.count() == 2


def test_upsert_updates_existing(tmp_store):
    """Same (shark_id, photo_id) → update in place; count stays the same."""
    tmp_store.upsert("shark1", "Original Name", _unit_vec(1), "photo1")
    tmp_store.upsert("shark1", "Updated Name", _unit_vec(2), "photo1")
    assert tmp_store.count() == 1
    entries = tmp_store.get_all()
    assert entries[0]["display_name"] == "Updated Name"


def test_same_shark_different_photos(tmp_store):
    """Different photo_ids for the same shark → two entries."""
    tmp_store.upsert("shark1", "Shark One", _unit_vec(1), "photo1")
    tmp_store.upsert("shark1", "Shark One", _unit_vec(2), "photo2")
    assert tmp_store.count() == 2


def test_get_all_includes_embedding(tmp_store):
    emb = _unit_vec(7)
    tmp_store.upsert("shark1", "Shark One", emb, "photo1")
    entries = tmp_store.get_all()
    assert len(entries) == 1
    assert "embedding" in entries[0]
    np.testing.assert_allclose(entries[0]["embedding"], emb, atol=1e-6)


def test_get_all_empty(tmp_store):
    assert tmp_store.get_all() == []


# ── persistence ───────────────────────────────────────────────────────────────


def test_persistence(tmp_path, monkeypatch):
    """Data survives store object destruction and recreation."""
    import store as store_module

    base = tmp_path / "embeddings"
    monkeypatch.setattr(store_module, "_BASE_PATH", base)
    monkeypatch.setattr(store_module, "_JSON_PATH", base.with_suffix(".json"))
    monkeypatch.setattr(store_module, "_NPY_PATH", base.with_suffix(".npy"))
    monkeypatch.setattr(store_module, "_store", None)

    emb = _unit_vec(99)
    s1 = EmbeddingStore()
    s1.upsert("shark-persist", "Persisted Shark", emb, "photo-persist")

    # Simulate restart: new store object reads from disk
    monkeypatch.setattr(store_module, "_store", None)
    s2 = EmbeddingStore()
    assert s2.count() == 1
    entry = s2.get_all()[0]
    assert entry["shark_id"] == "shark-persist"
    np.testing.assert_allclose(entry["embedding"], emb, atol=1e-6)


# ── thread safety ─────────────────────────────────────────────────────────────


def test_thread_safety(tmp_store):
    """Concurrent upserts from multiple threads must not corrupt the store."""
    errors = []

    def worker(thread_id: int):
        try:
            for i in range(10):
                tmp_store.upsert(
                    f"shark-t{thread_id}-{i}",
                    f"Shark {thread_id}-{i}",
                    _unit_vec(thread_id * 10 + i),
                    f"photo-t{thread_id}-{i}",
                )
        except Exception as exc:
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(t,)) for t in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors, f"Thread errors: {errors}"
    # 5 threads × 10 unique (shark_id, photo_id) pairs each = 50 entries
    assert tmp_store.count() == 50
