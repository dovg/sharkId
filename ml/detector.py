"""
Heuristic snout region detector.

Tiger sharks' distinguishing spot patterns are concentrated around the snout.
We use a fixed-ratio center-crop (skewed slightly toward the front/top of the
frame, where a diver typically aims the camera) rather than a learned detector.
This is fast, deterministic, and good enough for the MVP.
"""

from io import BytesIO
from typing import Optional

import numpy as np
from PIL import Image
from scipy import ndimage

# Fraction of image dimensions to crop (fallback when no annotation exists)
_X0, _X1 = 0.20, 0.80
_Y0, _Y1 = 0.20, 0.85

# Canonical output size fed to the embedder
SNOUT_SIZE = (128, 128)


def detect_snout(img: Image.Image) -> Image.Image:
    """Fallback fixed-ratio crop used when no user annotation exists."""
    img = img.convert("RGB")
    w, h = img.size
    box = (int(w * _X0), int(h * _Y0), int(w * _X1), int(h * _Y1))
    return img.crop(box).resize(SNOUT_SIZE, Image.LANCZOS)


def auto_detect(img_bytes: bytes) -> Optional[dict]:
    """Heuristic shark + zone detection for underwater photos.

    Strategy:
      1. Downsample for speed.
      2. Estimate background colour from border pixels (water at the edges).
      3. Threshold pixels with high distance from background.
      4. Morphological closing to fill holes, then isolate the largest
         connected component (the shark body).
      5. Return its bounding box as shark_bbox (0-1 normalised).
      6. zone_bbox is a fixed heuristic region within the shark crop —
         the right-centre area where the identification pattern lives.

    Returns {"shark_bbox": {x,y,w,h}, "zone_bbox": {x,y,w,h}} or None.
    """
    try:
        img = Image.open(BytesIO(img_bytes)).convert("RGB")
    except Exception:
        return None

    # Downsample to ≤300px on the longest side for speed
    w, h = img.size
    scale = min(300 / w, 300 / h, 1.0)
    sw, sh = max(1, int(w * scale)), max(1, int(h * scale))
    small = img.resize((sw, sh), Image.LANCZOS)
    arr = np.array(small, dtype=np.float32)  # (sh, sw, 3)

    # Background colour = median of all border pixels
    border = np.concatenate([
        arr[0, :],       # top row
        arr[-1, :],      # bottom row
        arr[1:-1, 0],    # left column
        arr[1:-1, -1],   # right column
    ], axis=0)
    bg = np.median(border, axis=0)

    # Per-pixel Euclidean distance from background
    diff = np.sqrt(np.sum((arr - bg) ** 2, axis=2))

    # Binary mask: pixels that stand out from background
    threshold = diff.mean() + 0.8 * diff.std()
    mask = diff > threshold

    # Morphological closing to fill internal holes
    struct = ndimage.generate_binary_structure(2, 2)
    mask = ndimage.binary_closing(mask, structure=struct, iterations=3)

    # Largest connected component = the shark
    labeled, n = ndimage.label(mask)
    if n == 0:
        return None
    sizes = ndimage.sum(mask, labeled, range(1, n + 1))
    shark_mask = labeled == (int(np.argmax(sizes)) + 1)

    rows = np.where(shark_mask.any(axis=1))[0]
    cols = np.where(shark_mask.any(axis=0))[0]
    if len(rows) < 4 or len(cols) < 4:
        return None

    pad = 0.04
    y1 = max(0.0, rows[0]  / sh - pad)
    y2 = min(1.0, rows[-1] / sh + pad)
    x1 = max(0.0, cols[0]  / sw - pad)
    x2 = min(1.0, cols[-1] / sw + pad)
    bw, bh = x2 - x1, y2 - y1

    # Reject near-full-frame or tiny detections
    if bw < 0.10 or bh < 0.05 or bw > 0.95 or bh > 0.95:
        return None

    shark_bbox = {"x": round(x1, 4), "y": round(y1, 4),
                  "w": round(bw, 4), "h": round(bh, 4)}

    # Zone: identification area between mouth and dorsal fin —
    # heuristic right-centre portion of the shark crop (35-85% x, 5-55% y)
    zone_bbox = {"x": 0.35, "y": 0.05, "w": 0.50, "h": 0.50}

    return {"shark_bbox": shark_bbox, "zone_bbox": zone_bbox}


def crop_shark_with_auto_zone(
    img: Image.Image,
    shark_bbox: dict,
    orientation: str = "",
) -> Image.Image:
    """Crop the shark region and apply an orientation-aware zone heuristic.

    Used when the user has annotated shark_bbox but not zone_bbox.
    The mouth/snout of a tiger shark is on the side that the shark faces,
    so the identification zone is biased toward that side.

    orientation:
      "face_left"  → zone is on the left side of the shark crop
      "face_right" → zone is on the right side of the shark crop
      ""           → zone is centered (no orientation known)
    """
    img = img.convert("RGB")
    iw, ih = img.size

    sx = int(shark_bbox["x"] * iw)
    sy = int(shark_bbox["y"] * ih)
    sw = max(1, int(shark_bbox["w"] * iw))
    sh = max(1, int(shark_bbox["h"] * ih))
    shark_crop = img.crop((sx, sy, sx + sw, sy + sh))

    if orientation == "face_left":
        zone = {"x": 0.05, "y": 0.10, "w": 0.50, "h": 0.80}
    elif orientation == "face_right":
        zone = {"x": 0.45, "y": 0.10, "w": 0.50, "h": 0.80}
    else:
        zone = {"x": 0.25, "y": 0.10, "w": 0.50, "h": 0.80}

    zx = int(zone["x"] * sw)
    zy = int(zone["y"] * sh)
    zw = max(1, int(zone["w"] * sw))
    zh = max(1, int(zone["h"] * sh))
    zone_crop = shark_crop.crop((zx, zy, zx + zw, zy + zh))

    return zone_crop.resize(SNOUT_SIZE, Image.LANCZOS)


def crop_zone(
    img: Image.Image,
    shark_bbox: dict,  # {x, y, w, h} normalised 0-1, relative to full image
    zone_bbox: dict,   # {x, y, w, h} normalised 0-1, relative to shark crop
) -> Image.Image:
    """Crop the user-annotated zone and resize to SNOUT_SIZE.

    Two-step crop:
      1. Extract the shark region from the full image using shark_bbox.
      2. Extract the valuable zone from the shark crop using zone_bbox.
    """
    img = img.convert("RGB")
    iw, ih = img.size

    # Step 1: shark region
    sx = int(shark_bbox["x"] * iw)
    sy = int(shark_bbox["y"] * ih)
    sw = max(1, int(shark_bbox["w"] * iw))
    sh = max(1, int(shark_bbox["h"] * ih))
    shark_crop = img.crop((sx, sy, sx + sw, sy + sh))

    # Step 2: zone within the shark crop
    zx = int(zone_bbox["x"] * sw)
    zy = int(zone_bbox["y"] * sh)
    zw = max(1, int(zone_bbox["w"] * sw))
    zh = max(1, int(zone_bbox["h"] * sh))
    zone_crop = shark_crop.crop((zx, zy, zx + zw, zy + zh))

    return zone_crop.resize(SNOUT_SIZE, Image.LANCZOS)
