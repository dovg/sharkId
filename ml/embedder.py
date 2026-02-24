"""
Feature embedding for a snout-region crop.

Produces a 106-dimensional L2-normalised vector:
  - 64-dim  3D HSV histogram  (4 × 4 × 4 bins over H, S, V)
  - 10-dim  LBP histogram     (uniform LBP, P=8, R=1, binned into 10 buckets)
  - 32-dim  spatial grid      (4×4 cells, mean + std of grayscale per cell)

All components are concatenated and L2-normalised so cosine similarity
equals dot-product, which makes KNN fast and intuitive.
"""

import numpy as np
from PIL import Image
from skimage.color import rgb2hsv
from skimage.feature import local_binary_pattern

EMBEDDING_DIM = 106

# LBP parameters
_LBP_P = 8
_LBP_R = 1

# Spatial grid
_GRID_N = 4   # split each axis into 4 → 16 cells → 16×2 = 32 values


def extract_embedding(img: Image.Image) -> np.ndarray:
    """Return a 106-dim float32 L2-normalised embedding for *img*.

    *img* should already be the snout crop (128×128) produced by detect_snout.
    """
    img = img.convert("RGB")
    arr = np.array(img, dtype=np.float32) / 255.0   # [0, 1], shape (H, W, 3)

    # ── 1. HSV histogram (64 dims) ───────────────────────────────────────────
    hsv = rgb2hsv(arr)   # shape (H, W, 3), all channels in [0, 1]
    hsv_hist, _ = np.histogramdd(
        hsv.reshape(-1, 3),
        bins=(4, 4, 4),
        range=((0.0, 1.0), (0.0, 1.0), (0.0, 1.0)),
    )
    hsv_feat = hsv_hist.flatten().astype(np.float32)   # 64-dim

    # ── 2. LBP histogram (10 dims) ───────────────────────────────────────────
    # Convert to grayscale in [0, 255] range as required by skimage LBP
    gray = (np.dot(arr, [0.299, 0.587, 0.114]) * 255.0).astype(np.uint8)
    lbp = local_binary_pattern(gray, P=_LBP_P, R=_LBP_R, method="uniform")
    lbp_max = _LBP_P * (_LBP_P - 1) + 2   # max uniform LBP value for P=8 → 58
    lbp_hist, _ = np.histogram(lbp.ravel(), bins=10, range=(0.0, lbp_max + 1))
    lbp_feat = lbp_hist.astype(np.float32)   # 10-dim

    # ── 3. Spatial grid (32 dims) ────────────────────────────────────────────
    gray_f = gray.astype(np.float32)
    rows = np.array_split(gray_f, _GRID_N, axis=0)
    grid_vals: list[float] = []
    for row_strip in rows:
        for cell in np.array_split(row_strip, _GRID_N, axis=1):
            grid_vals.append(float(cell.mean()))
            grid_vals.append(float(cell.std()))
    grid_feat = np.array(grid_vals, dtype=np.float32)   # 32-dim

    # ── Concatenate and L2-normalise ─────────────────────────────────────────
    feat = np.concatenate([hsv_feat, lbp_feat, grid_feat])   # 106-dim
    norm = np.linalg.norm(feat)
    if norm > 0.0:
        feat /= norm
    return feat
