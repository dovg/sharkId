"""
Thread-safe in-memory embedding store backed by a JSON + numpy file.

Each entry is a dict with keys:
  shark_id    : str  (UUID as string)
  display_name: str
  photo_id    : str
  orientation : str
  embedding   : np.ndarray  (EMBEDDING_DIM-dim float32, L2-normalised)

The store is loaded from disk on first access and persisted after every write.
The data directory is controlled by the EMBEDDINGS_PATH env var
(default: /app/data/embeddings).  Two files are written:
  <path>.json  — metadata list (shark_id, display_name, photo_id, orientation)
  <path>.npy   — numpy array of shape (N, EMBEDDING_DIM)

If the on-disk .npy has a different embedding dimension than the current
EMBEDDING_DIM (e.g. after upgrading from the hand-crafted 106-dim embedder),
the store resets to empty rather than loading stale incompatible vectors.
"""

import json
import os
import threading
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

from embedder import EMBEDDING_DIM

_BASE_PATH = Path(os.getenv("EMBEDDINGS_PATH", "/app/data/embeddings"))
_JSON_PATH = _BASE_PATH.with_suffix(".json")
_NPY_PATH = _BASE_PATH.with_suffix(".npy")


class EmbeddingStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._meta: List[Dict] = []        # metadata without embeddings
        self._vectors: np.ndarray = np.empty((0, EMBEDDING_DIM), dtype=np.float32)
        self._load()

    # ── persistence ──────────────────────────────────────────────────────────

    def _load(self) -> None:
        if _JSON_PATH.exists() and _NPY_PATH.exists():
            try:
                with open(_JSON_PATH) as fh:
                    self._meta = json.load(fh)
                vectors = np.load(str(_NPY_PATH))
                # Reject stale files whose embedding dimension no longer matches
                # (e.g. upgrading from the old 106-dim hand-crafted embedder)
                if len(self._meta) != len(vectors) or (
                    len(vectors) > 0 and vectors.shape[1] != EMBEDDING_DIM
                ):
                    self._meta = []
                    self._vectors = np.empty((0, EMBEDDING_DIM), dtype=np.float32)
                    return
                self._vectors = vectors
            except Exception:
                self._meta = []
                self._vectors = np.empty((0, EMBEDDING_DIM), dtype=np.float32)

    def _save(self) -> None:
        _BASE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(_JSON_PATH, "w") as fh:
            json.dump(self._meta, fh)
        np.save(str(_NPY_PATH), self._vectors)

    # ── public API ───────────────────────────────────────────────────────────

    def upsert(
        self,
        shark_id: str,
        display_name: str,
        embedding: np.ndarray,
        photo_id: str = "",
        orientation: str = "",
    ) -> None:
        """Add or replace the embedding for (shark_id, photo_id) and persist."""
        with self._lock:
            for i, entry in enumerate(self._meta):
                if entry["shark_id"] == shark_id and entry.get("photo_id", "") == photo_id:
                    entry["display_name"] = display_name
                    entry["orientation"] = orientation
                    self._vectors[i] = embedding.astype(np.float32)
                    self._save()
                    return
            self._meta.append({
                "shark_id": shark_id,
                "display_name": display_name,
                "photo_id": photo_id,
                "orientation": orientation,
            })
            self._vectors = np.vstack([
                self._vectors,
                embedding.astype(np.float32).reshape(1, -1),
            ])
            self._save()

    def get_all(self) -> List[Dict]:
        """Return list of entries with 'embedding' key added."""
        with self._lock:
            result = []
            for i, entry in enumerate(self._meta):
                result.append({**entry, "embedding": self._vectors[i]})
            return result

    def count(self) -> int:
        with self._lock:
            return len(self._meta)


# Module-level singleton — instantiated once when the module is imported.
_store: Optional[EmbeddingStore] = None


def get_store() -> EmbeddingStore:
    global _store
    if _store is None:
        _store = EmbeddingStore()
    return _store
