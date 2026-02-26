"""
Feature embedding for a snout-region crop using EfficientNet-B0.

Produces a 1280-dimensional L2-normalised vector from the global average
pooling layer of EfficientNet-B0 pretrained on ImageNet, via ONNX Runtime.

Why CNN over hand-crafted features:
- HSV histograms + LBP match sharks by overall colour and coarse texture,
  which is similar across all tiger sharks.
- EfficientNet-B0 has learned hierarchical visual features that capture
  fine-grained patterns (spots, markings, skin texture) in a
  viewpoint-tolerant way, dramatically improving per-individual discrimination.

The ONNX model is loaded lazily on first call.  Its path is controlled by
the MODEL_PATH env var (default: /opt/shark_model/efficientnet_b0.onnx).
Generate the model once with:  python export_model.py
"""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np
from PIL import Image

EMBEDDING_DIM = 1280  # EfficientNet-B0 global-average-pool output

_INPUT_SIZE = 224
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD  = np.array([0.229, 0.224, 0.225], dtype=np.float32)

MODEL_PATH = Path(os.getenv("MODEL_PATH", "/opt/shark_model/efficientnet_b0.onnx"))

_session = None


def _get_session():
    """Load ONNX Runtime inference session on first call; cache afterwards."""
    global _session
    if _session is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"EfficientNet-B0 ONNX model not found at {MODEL_PATH}.\n"
                "Generate it once with:  python export_model.py\n"
                "Or set MODEL_PATH to an existing .onnx file."
            )
        import onnxruntime as ort  # deferred so tests can mock before import
        _session = ort.InferenceSession(
            str(MODEL_PATH),
            providers=["CPUExecutionProvider"],
        )
    return _session


def _preprocess(img: Image.Image) -> np.ndarray:
    """Resize, normalise, and convert to (1, 3, H, W) float32 array."""
    img = img.convert("RGB").resize((_INPUT_SIZE, _INPUT_SIZE), Image.BILINEAR)
    arr = np.array(img, dtype=np.float32) / 255.0   # (H, W, 3) in [0, 1]
    arr = (arr - _MEAN) / _STD                       # ImageNet normalisation
    arr = arr.transpose(2, 0, 1)[np.newaxis]         # (1, 3, H, W)
    return arr


def extract_embedding(img: Image.Image) -> np.ndarray:
    """Return a 1280-dim float32 L2-normalised embedding for *img*.

    *img* should already be the zone crop produced by crop_zone / detect_snout.
    """
    session = _get_session()
    inp = _preprocess(img)
    input_name = session.get_inputs()[0].name
    output = session.run(None, {input_name: inp})[0]   # (1, 1280)
    feat = output[0].astype(np.float32)
    norm = np.linalg.norm(feat)
    if norm > 0.0:
        feat /= norm
    return feat
