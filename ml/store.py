"""
Thread-safe in-memory embedding store backed by a pickle file.

Each entry is a dict with keys:
  shark_id    : str  (UUID as string)
  display_name: str
  embedding   : np.ndarray  (106-dim float32, L2-normalised)

The store is loaded from disk on first access and persisted after every write.
The pickle file location is controlled by the EMBEDDINGS_PATH env var
(default: /app/data/embeddings.pkl).
"""

import os
import pickle
import threading
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

_STORE_PATH = Path(os.getenv("EMBEDDINGS_PATH", "/app/data/embeddings.pkl"))


class EmbeddingStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._entries: List[Dict] = []
        self._load()

    # ── persistence ──────────────────────────────────────────────────────────

    def _load(self) -> None:
        if _STORE_PATH.exists():
            try:
                with open(_STORE_PATH, "rb") as fh:
                    self._entries = pickle.load(fh)
            except Exception:
                self._entries = []

    def _save(self) -> None:
        _STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(_STORE_PATH, "wb") as fh:
            pickle.dump(self._entries, fh)

    # ── public API ───────────────────────────────────────────────────────────

    def upsert(
        self,
        shark_id: str,
        display_name: str,
        embedding: np.ndarray,
        photo_id: str = "",
        orientation: str = "",
    ) -> None:
        """Add or replace the embedding for (shark_id, photo_id) and persist.

        Using photo_id as part of the key allows a shark to accumulate one
        embedding per annotated photo rather than being limited to one total.
        """
        with self._lock:
            for entry in self._entries:
                if entry["shark_id"] == shark_id and entry.get("photo_id", "") == photo_id:
                    entry["display_name"] = display_name
                    entry["embedding"] = embedding
                    entry["orientation"] = orientation
                    self._save()
                    return
            self._entries.append({
                "shark_id": shark_id,
                "display_name": display_name,
                "photo_id": photo_id,
                "orientation": orientation,
                "embedding": embedding,
            })
            self._save()

    def get_all(self) -> List[Dict]:
        with self._lock:
            return list(self._entries)

    def count(self) -> int:
        with self._lock:
            return len(self._entries)


# Module-level singleton — instantiated once when the module is imported.
_store: Optional[EmbeddingStore] = None


def get_store() -> EmbeddingStore:
    global _store
    if _store is None:
        _store = EmbeddingStore()
    return _store
