"""
Video frame extraction with automatic shark detection.

For each uploaded dive video the pipeline:
  1. Samples one frame every VIDEO_FRAME_INTERVAL seconds (default: 2 s).
  2. Runs auto_detect() on each sampled frame.
  3. Returns only frames where a shark was found, up to VIDEO_MAX_FRAMES.

Returned frames include the shark and zone bounding boxes produced by
auto_detect() so the backend can create pre-annotated Photo records
without a separate detection round-trip.
"""

import base64
import io
import os
import tempfile
from typing import List

import cv2
from PIL import Image

from detector import auto_detect

# How often to sample (seconds between frames)
FRAME_INTERVAL_SEC = float(os.getenv("VIDEO_FRAME_INTERVAL", "2.0"))
# Hard cap: stop after this many shark frames to avoid runaway memory use
MAX_FRAMES = int(os.getenv("VIDEO_MAX_FRAMES", "30"))

# Map MIME type → file extension so cv2 can pick the right codec
_EXT_MAP = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/avi": ".avi",
    "video/x-msvideo": ".avi",
    "video/x-matroska": ".mkv",
    "video/webm": ".webm",
}


def extract_shark_frames(video_bytes: bytes, content_type: str = "video/mp4") -> List[dict]:
    """Extract frames from *video_bytes*, return those containing a shark.

    Each item in the returned list::

        {
          "jpeg":          "<base64-encoded JPEG string>",
          "shark_bbox":    {"x": …, "y": …, "w": …, "h": …},  # 0-1 normalised
          "zone_bbox":     {"x": …, "y": …, "w": …, "h": …},  # relative to shark crop
          "timestamp_sec": <float>,
          "frame_index":   <int>,
        }

    Returns an empty list when the video cannot be opened or contains no sharks.
    """
    ext = _EXT_MAP.get(content_type, ".mp4")

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(video_bytes)
        tmp_path = tmp.name

    results: List[dict] = []
    try:
        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            return []

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        # How many raw frames to skip between samples
        frame_step = max(1, int(round(fps * FRAME_INTERVAL_SEC)))

        frame_idx = 0
        found = 0

        while found < MAX_FRAMES:
            ret, bgr = cap.read()
            if not ret:
                break

            if frame_idx % frame_step == 0:
                # Convert BGR (OpenCV default) → RGB → JPEG bytes via PIL
                rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
                img = Image.fromarray(rgb)
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=85)
                jpeg = buf.getvalue()

                detected = auto_detect(jpeg)
                if detected:
                    timestamp = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
                    results.append({
                        "jpeg": base64.b64encode(jpeg).decode(),
                        "shark_bbox": detected["shark_bbox"],
                        "zone_bbox": detected["zone_bbox"],
                        "timestamp_sec": round(timestamp, 2),
                        "frame_index": frame_idx,
                    })
                    found += 1

            frame_idx += 1

        cap.release()

    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    return results
