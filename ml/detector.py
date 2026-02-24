"""
Heuristic snout region detector.

Tiger sharks' distinguishing spot patterns are concentrated around the snout.
We use a fixed-ratio center-crop (skewed slightly toward the front/top of the
frame, where a diver typically aims the camera) rather than a learned detector.
This is fast, deterministic, and good enough for the MVP.
"""

from PIL import Image

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
