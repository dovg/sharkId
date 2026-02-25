"""
Item 59 — detector unit tests.

Tests the heuristic snout crop, auto-detect, and crop_zone functions.
"""
import io

import numpy as np
import pytest
from PIL import Image

from detector import SNOUT_SIZE, auto_detect, crop_zone, detect_snout


def _make_jpeg(color=(100, 150, 200), size=(200, 200)) -> bytes:
    img = Image.new("RGB", size, color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# ── detect_snout ──────────────────────────────────────────────────────────────


def test_detect_snout_returns_pil_image(dummy_rgb_image):
    result = detect_snout(dummy_rgb_image)
    assert isinstance(result, Image.Image)


def test_detect_snout_output_size(dummy_rgb_image):
    result = detect_snout(dummy_rgb_image)
    assert result.size == SNOUT_SIZE


def test_detect_snout_accepts_rgba():
    img = Image.new("RGBA", (100, 100), color=(255, 0, 0, 200))
    result = detect_snout(img)
    assert result.size == SNOUT_SIZE


def test_detect_snout_output_is_rgb(dummy_rgb_image):
    result = detect_snout(dummy_rgb_image)
    assert result.mode == "RGB"


# ── auto_detect ───────────────────────────────────────────────────────────────


def test_auto_detect_returns_dict_or_none():
    img_bytes = _make_jpeg()
    result = auto_detect(img_bytes)
    if result is not None:
        assert "shark_bbox" in result
        assert "zone_bbox" in result


def test_auto_detect_bbox_keys():
    """When detection succeeds, bboxes have the required x/y/w/h keys."""
    img_bytes = _make_jpeg(size=(300, 300))
    result = auto_detect(img_bytes)
    if result is not None:
        for key in ("x", "y", "w", "h"):
            assert key in result["shark_bbox"]
            assert key in result["zone_bbox"]


def test_auto_detect_invalid_bytes():
    result = auto_detect(b"this is not an image")
    assert result is None


def test_auto_detect_empty_bytes():
    result = auto_detect(b"")
    assert result is None


# ── crop_zone ─────────────────────────────────────────────────────────────────


def test_crop_zone_output_size():
    img = Image.new("RGB", (400, 300), color="blue")
    shark_bbox = {"x": 0.1, "y": 0.1, "w": 0.8, "h": 0.8}
    zone_bbox = {"x": 0.2, "y": 0.1, "w": 0.6, "h": 0.5}
    result = crop_zone(img, shark_bbox, zone_bbox)
    assert result.size == SNOUT_SIZE


def test_crop_zone_returns_pil_image():
    img = Image.new("RGB", (200, 200), color="green")
    shark_bbox = {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}
    zone_bbox = {"x": 0.35, "y": 0.05, "w": 0.50, "h": 0.50}
    result = crop_zone(img, shark_bbox, zone_bbox)
    assert isinstance(result, Image.Image)


def test_crop_zone_full_image_bbox():
    """shark_bbox covering the whole image should not crash."""
    img = Image.new("RGB", (128, 128), color=(42, 42, 42))
    shark_bbox = {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}
    zone_bbox = {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}
    result = crop_zone(img, shark_bbox, zone_bbox)
    assert result.size == SNOUT_SIZE
