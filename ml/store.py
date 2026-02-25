"""
Thread-safe in-memory embedding store backed by a JSON + numpy file.

Each entry is a dict with keys:
  shark_id    : str  (UUID as string)
  display_name: str
  photo_id    : str
  orientation : str
  embedding   : np.ndarray  (106-dim float32, L2-normalised)

The store is loaded from disk on first access and persisted after every write.
The data directory is controlled by the EMBEDDINGS_PATH env var
(default: /app/data/embeddings).  Two files are written:
  <path>.json  — metadata list (shark_id, display_name, photo_id, orientation)
  <path>.npy   — numpy array of shape (N, 106)
"""

import json
import os
import threading
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

_BASE_PATH = Path(os.getenv("EMBEDDINGS_PATH", "/app/data/embeddings"))
_JSON_PATH = _BASE_PATH.with_suffix(".json")
_NPY_PATH = _BASE_PATH.with_suffix(".npy")


class EmbeddingStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._meta: List[Dict] = []        # metadata without embeddings
        self._vectors: np.ndarray = np.empty((0, 106), dtype=np.float32)
        self._load()

    # ── persistence ──────────────────────────────────────────────────────────

    def _load(self) -> None:
        if _JSON_PATH.exists() and _NPY_PATH.exists():
            try:
                with open(_JSON_PATH) as fh:
                    self._meta = json.load(fh)
                self._vectors = np.load(str(_NPY_PATH))
                if len(self._meta) != len(self._vectors):
                    self._meta = []
                    self._vectors = np.empty((0, 106), dtype=np.float32)
            except Exception:
                self._meta = []
                self._vectors = np.empty((0, 106), dtype=np.float32)

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
