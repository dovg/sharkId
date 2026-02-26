"""
Item 59 — classifier unit tests.

Tests top-K capping, threshold filtering, per-shark deduplication,
score ordering, and empty-store behaviour.
"""
import numpy as np
import pytest

from classifier import find_candidates
from embedder import EMBEDDING_DIM
from store import EmbeddingStore


def _unit_vec(seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    v = rng.random(EMBEDDING_DIM).astype(np.float32)
    return v / np.linalg.norm(v)


def _populate(store: EmbeddingStore, n: int, prefix: str = "shark") -> None:
    for i in range(n):
        store.upsert(f"{prefix}{i}", f"Shark {i}", _unit_vec(i), f"photo{i}")


# ── basic behaviour ───────────────────────────────────────────────────────────


def test_returns_top5_max(tmp_store):
    _populate(tmp_store, 10)
    results = find_candidates(_unit_vec(99), tmp_store, threshold=0.0)
    assert len(results) <= 5


def test_threshold_filters_all(tmp_store):
    _populate(tmp_store, 5)
    results = find_candidates(_unit_vec(99), tmp_store, threshold=2.0)  # impossible
    assert results == []


def test_threshold_zero_returns_all_up_to_five(tmp_store):
    _populate(tmp_store, 3)
    results = find_candidates(_unit_vec(99), tmp_store, threshold=0.0)
    assert len(results) == 3


def test_empty_store_returns_empty_list(tmp_store):
    results = find_candidates(_unit_vec(0), tmp_store, threshold=0.5)
    assert results == []


# ── deduplication ─────────────────────────────────────────────────────────────


def test_deduplication(tmp_store):
    """Two embeddings for the same shark → only one candidate returned."""
    tmp_store.upsert("same-shark", "Same", _unit_vec(1), "photo1")
    tmp_store.upsert("same-shark", "Same", _unit_vec(2), "photo2")

    results = find_candidates(_unit_vec(99), tmp_store, threshold=0.0)
    shark_ids = [r["shark_id"] for r in results]
    assert len(shark_ids) == len(set(shark_ids)), "Duplicate shark IDs in results"
    assert len(results) == 1


# ── ranking ───────────────────────────────────────────────────────────────────


def test_ranking_descending(tmp_store):
    _populate(tmp_store, 5)
    results = find_candidates(_unit_vec(99), tmp_store, threshold=0.0)
    for i in range(len(results) - 1):
        assert results[i]["score"] >= results[i + 1]["score"]


def test_best_match_is_self(tmp_store):
    """Query an embedding that is in the store — it should rank first."""
    query = _unit_vec(42)
    tmp_store.upsert("best", "Best Match", query.copy(), "photoBest")
    _populate(tmp_store, 4, prefix="other")

    results = find_candidates(query, tmp_store, threshold=0.0)
    assert results[0]["shark_id"] == "best"


# ── result structure ──────────────────────────────────────────────────────────


def test_result_keys(tmp_store):
    _populate(tmp_store, 1)
    results = find_candidates(_unit_vec(99), tmp_store, threshold=0.0)
    assert len(results) == 1
    assert set(results[0].keys()) == {"shark_id", "display_name", "score"}


def test_score_is_float_in_01(tmp_store):
    _populate(tmp_store, 3)
    results = find_candidates(_unit_vec(99), tmp_store, threshold=0.0)
    for r in results:
        assert 0.0 <= r["score"] <= 1.0


# ── orientation filter ────────────────────────────────────────────────────────


def test_orientation_filter(tmp_store):
    tmp_store.upsert("left-shark", "Left", _unit_vec(1), "p1", orientation="face_left")
    tmp_store.upsert("right-shark", "Right", _unit_vec(2), "p2", orientation="face_right")

    results = find_candidates(_unit_vec(99), tmp_store, threshold=0.0, orientation="face_left")
    assert all(r["shark_id"] == "left-shark" for r in results)


def test_orientation_filter_fallback(tmp_store):
    """When no stored embeddings match the requested orientation, fall back to
    all entries rather than returning an empty list.  This ensures a shark
    only photographed from one side is still surfaced as a candidate.
    """
    tmp_store.upsert("unoriented", "No Tag", _unit_vec(1), "p1", orientation="")

    results = find_candidates(_unit_vec(99), tmp_store, threshold=0.0, orientation="face_left")
    assert len(results) == 1
    assert results[0]["shark_id"] == "unoriented"
