"""EXIF extraction helpers using Pillow."""
import io
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

from PIL import Image
from PIL.ExifTags import TAGS

_GPS_TAG_ID = 34853  # GPSInfo IFD tag


def _serialize(value: Any) -> Any:
    """Recursively convert a PIL EXIF value to a JSON-serializable type."""
    if isinstance(value, bytes):
        return value.hex()
    if hasattr(value, "numerator") and hasattr(value, "denominator"):
        return float(value) if value.denominator != 0 else None
    if isinstance(value, tuple):
        return [_serialize(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _serialize(v) for k, v in value.items()}
    if isinstance(value, (int, float, str, bool, type(None))):
        return value
    return str(value)


def extract_exif(data: bytes) -> Dict[str, Any]:
    """Return a JSON-safe dict of all EXIF tags from image bytes."""
    try:
        img = Image.open(io.BytesIO(data))
        exif = img.getexif()
        if not exif:
            return {}
        result = {}
        for tag_id, value in exif.items():
            tag = TAGS.get(tag_id, str(tag_id))
            result[tag] = _serialize(value)
        # Embed GPS IFD as a nested dict under "GPSInfo"
        gps_ifd = exif.get_ifd(_GPS_TAG_ID)
        if gps_ifd:
            result["GPSInfo"] = _serialize(dict(gps_ifd))
        return result
    except (OSError, SyntaxError, ValueError):
        return {}


def parse_taken_at(exif: Dict[str, Any]) -> Optional[datetime]:
    raw = exif.get("DateTimeOriginal") or exif.get("DateTime")
    if not raw:
        return None
    for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt)
        except (ValueError, TypeError):
            continue
    return None


def _rational_to_float(v: Any) -> float:
    """Convert a (numerator, denominator) tuple or IFDRational to float."""
    if isinstance(v, (list, tuple)) and len(v) == 2:
        return v[0] / v[1] if v[1] else 0.0
    if hasattr(v, "numerator") and hasattr(v, "denominator"):
        return float(v) if v.denominator != 0 else 0.0
    return float(v)


def parse_gps(exif: Dict[str, Any]) -> Tuple[Optional[float], Optional[float]]:
    gps = exif.get("GPSInfo")
    if not gps or not isinstance(gps, dict):
        return None, None
    try:
        # Keys may be ints or strings depending on serialisation path
        def get(key):
            return gps.get(key) or gps.get(str(key))

        lat_dms = get(2)
        lat_ref = get(1)
        lon_dms = get(4)
        lon_ref = get(3)
        if not all([lat_dms, lat_ref, lon_dms, lon_ref]):
            return None, None

        def dms(parts):
            d, m, s = [_rational_to_float(p) for p in parts]
            return d + m / 60 + s / 3600

        lat = dms(lat_dms)
        lon = dms(lon_dms)
        if str(lat_ref).upper() == "S":
            lat = -lat
        if str(lon_ref).upper() == "W":
            lon = -lon
        return round(lat, 6), round(lon, 6)
    except (TypeError, ValueError, ZeroDivisionError, IndexError):
        return None, None
