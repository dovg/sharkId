"""Shared photo URL helpers used across multiple routers."""
from app.config import settings
from app.models.photo import Photo
from app.schemas.photo import PhotoOut
from app.storage.minio import get_presigned_url


def photo_url(photo: Photo) -> str | None:
    """Return the public URL for a photo object, or None on failure."""
    if settings.photo_base_url:
        return f"{settings.photo_base_url}/{photo.object_key}"
    try:
        return get_presigned_url(photo.object_key)
    except Exception:
        return None


def enrich_photo(photo: Photo) -> PhotoOut:
    """Validate photo to PhotoOut schema and inject URL."""
    out = PhotoOut.model_validate(photo)
    url = photo_url(photo)
    if url:
        out.url = url
    return out
