"""
Item 59 — embedder unit tests.

Verifies the EMBEDDING_DIM L2-normalised feature vector extracted from a zone
crop.  The CNN model is replaced by a deterministic stub (see conftest.py) so
tests run without downloading pretrained weights.
"""
import numpy as np
import pytest
from PIL import Image

from embedder import EMBEDDING_DIM, extract_embedding


def test_embedding_dimension(dummy_rgb_image):
    emb = extract_embedding(dummy_rgb_image)
    assert emb.shape == (EMBEDDING_DIM,)
    assert emb.dtype == np.float32


def test_embedding_l2_norm(dummy_rgb_image):
    emb = extract_embedding(dummy_rgb_image)
    norm = np.linalg.norm(emb)
    assert abs(norm - 1.0) < 1e-5, f"Expected unit norm, got {norm}"


def test_embedding_deterministic(dummy_rgb_image):
    emb1 = extract_embedding(dummy_rgb_image)
    emb2 = extract_embedding(dummy_rgb_image)
    np.testing.assert_array_equal(emb1, emb2)


def test_embedding_differs_for_different_images():
    red = Image.new("RGB", (64, 64), color=(255, 0, 0))
    blue = Image.new("RGB", (64, 64), color=(0, 0, 255))
    emb_red = extract_embedding(red)
    emb_blue = extract_embedding(blue)
    assert not np.allclose(emb_red, emb_blue), "Embeddings for different images should differ"


def test_embedding_accepts_non_square_image():
    """extract_embedding should handle non-square images via convert."""
    img = Image.new("RGB", (128, 64), color=(100, 150, 200))
    emb = extract_embedding(img)
    assert emb.shape == (EMBEDDING_DIM,)


def test_embedding_accepts_rgba_image():
    """RGBA images are converted to RGB internally."""
    img = Image.new("RGBA", (64, 64), color=(100, 150, 200, 128))
    emb = extract_embedding(img)
    assert emb.shape == (EMBEDDING_DIM,)
    assert abs(np.linalg.norm(emb) - 1.0) < 1e-5
