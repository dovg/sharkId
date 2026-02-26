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


@pytest.fixture(autouse=True)
def mock_cnn_model(monkeypatch):
    """Replace the ONNX inference session with a deterministic numpy stub.

    Avoids loading the ONNX model file and any network access.  The stub is a
    fixed random linear projection (seed=0) that satisfies the interface
    contract: correct EMBEDDING_DIM output, deterministic, different images
    produce different embeddings.  No torch or onnxruntime needed in tests.
    """
    import embedder as embedder_module
    from embedder import EMBEDDING_DIM

    _rng = np.random.default_rng(0)
    # Project a flattened 8×8 RGB patch → EMBEDDING_DIM; fixed weight matrix
    _W = _rng.standard_normal((8 * 8 * 3, EMBEDDING_DIM)).astype(np.float32)

    class _StubSession:
        def get_inputs(self):
            class _I:
                name = "input"
            return [_I()]

        def run(self, output_names, inputs):
            arr = list(inputs.values())[0]   # (1, 3, H, W) float32
            # Downsample to 8×8 then flatten — preserves per-image distinctiveness
            patch = arr[0].transpose(1, 2, 0)  # (H, W, 3)
            h, w = patch.shape[:2]
            step_h, step_w = max(1, h // 8), max(1, w // 8)
            small = patch[::step_h, ::step_w][:8, :8]  # (8, 8, 3)
            feat = (small.ravel() @ _W).reshape(1, -1)  # (1, EMBEDDING_DIM)
            return [feat]

    monkeypatch.setattr(embedder_module, "_session", _StubSession())


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
