"""
Shared fixtures for the ML service tests.

`pythonpath = .` in pytest.ini ensures the ml/ directory is on sys.path,
so `import store`, `import embedder`, etc. work without a package prefix.
"""
import io
import os

import numpy as np
import pytest
from PIL import Image


@pytest.fixture
def dummy_rgb_image():
    """64×64 RGB image with random noise — repeatable via fixed seed."""
    rng = np.random.default_rng(seed=42)
    arr = rng.integers(0, 255, (64, 64, 3), dtype=np.uint8)
    return Image.fromarray(arr)


@pytest.fixture
def dummy_image_bytes(dummy_rgb_image):
    """JPEG bytes of the dummy RGB image."""
    buf = io.BytesIO()
    dummy_rgb_image.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def tmp_store(tmp_path, monkeypatch):
    """
    EmbeddingStore backed by a temporary directory.

    Patches the module-level path constants and resets the singleton so every
    test gets a fresh, isolated store without touching disk outside tmp_path.
    """
    import store as store_module
    from store import EmbeddingStore

    base = tmp_path / "embeddings"
    monkeypatch.setattr(store_module, "_BASE_PATH", base)
    monkeypatch.setattr(store_module, "_JSON_PATH", base.with_suffix(".json"))
    monkeypatch.setattr(store_module, "_NPY_PATH", base.with_suffix(".npy"))
    monkeypatch.setattr(store_module, "_store", None)  # reset singleton

    return EmbeddingStore()
