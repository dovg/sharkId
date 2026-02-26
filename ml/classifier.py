"""
KNN cosine-similarity classifier.

Given a query embedding and the embedding store, returns up to 5 candidate
sharks whose cosine similarity to the query meets or exceeds a threshold.

Because all stored and query embeddings are L2-normalised, cosine similarity
equals the dot product and cosine distance = 1 − similarity.
sklearn's NearestNeighbors with metric="cosine" returns cosine *distances*,
so we convert: score = 1 − distance.
"""

from typing import Any, Dict, List

import numpy as np
from sklearn.neighbors import NearestNeighbors

from store import EmbeddingStore

_TOP_K = 5


def find_candidates(
    embedding: np.ndarray,
    store: EmbeddingStore,
    threshold: float,
    orientation: str = "",
) -> List[Dict[str, Any]]:
    """Return top-K candidate sharks sorted by score descending.

    Each candidate dict: {"shark_id": str, "display_name": str, "score": float}

    When *orientation* is given, only entries with that orientation are
    considered.  Multiple embeddings per shark are deduplicated by keeping the
    best score.  Returns [] when the (filtered) store is empty.
    """
    entries = store.get_all()
    if not entries:
        return []

    # Filter by orientation when specified.
    # Falls back to all entries when no stored embeddings carry a matching
    # orientation tag (e.g. legacy data, or shark only seen from one side).
    if orientation:
        oriented = [e for e in entries if e.get("orientation", "") == orientation]
        if oriented:
            entries = oriented

    matrix = np.array([e["embedding"] for e in entries], dtype=np.float32)
    # Fetch more than TOP_K so we can deduplicate per shark and still return 5
    k = min(_TOP_K * 4, len(entries))

    nn = NearestNeighbors(n_neighbors=k, metric="cosine", algorithm="brute")
    nn.fit(matrix)

    distances, indices = nn.kneighbors([embedding])

    # Deduplicate: keep best score per shark
    best: Dict[str, Dict[str, Any]] = {}
    for dist, idx in zip(distances[0], indices[0]):
        score = float(1.0 - dist)
        if score < threshold:
            continue
        entry = entries[idx]
        sid = entry["shark_id"]
        if sid not in best or score > best[sid]["score"]:
            best[sid] = {
                "shark_id": sid,
                "display_name": entry["display_name"],
                "score": round(score, 4),
            }

    return sorted(best.values(), key=lambda c: c["score"], reverse=True)[:_TOP_K]
