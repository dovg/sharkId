import io
import logging
import uuid
from datetime import datetime, timezone
from typing import List
from uuid import UUID

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, status
from PIL import Image
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.config import settings
from app.database import SessionLocal, get_db
from app.models.dive_session import DiveSession
from app.models.observation import Observation
from app.models.photo import Photo, ProcessingStatus
from app.models.shark import NameStatus, Shark
from app.models.user import User
from app.schemas.photo import AnnotateRequest, PhotoOut, ValidateRequest
from app.storage.minio import delete_file, get_object_bytes, upload_file
from app.utils.exif import extract_exif, parse_gps, parse_taken_at
from app.utils.photo import enrich_photo

logger = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png"}
MAX_PHOTO_BYTES = 50 * 1024 * 1024  # 50 MB

router = APIRouter(tags=["photos"])


# ── helpers ──────────────────────────────────────────────────────────────────

def _get_photo_or_404(db: Session, photo_id: UUID) -> Photo:
    photo = db.get(Photo, photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    return photo


# ── background classification task ───────────────────────────────────────────

def _classify_photo(photo_id: UUID) -> None:
    """
    Fetch image from MinIO, call ML service, update photo record.
    Runs in FastAPI's thread pool via BackgroundTasks.
    """
    db = SessionLocal()
    try:
        photo = db.get(Photo, photo_id)
        if not photo:
            return

        photo.processing_status = ProcessingStatus.processing
        db.commit()

        image_data = get_object_bytes(photo.object_key)

        with httpx.Client(timeout=30.0) as http:
            # Step 1: auto-detect bboxes when no annotation exists yet
            if not photo.shark_bbox or not photo.zone_bbox:
                det = http.post(
                    f"{settings.ml_service_url}/detect",
                    content=image_data,
                    headers={"Content-Type": photo.content_type},
                )
                detected = det.json()
                if detected.get("shark_bbox") and detected.get("zone_bbox"):
                    photo.shark_bbox = detected["shark_bbox"]
                    photo.zone_bbox = detected["zone_bbox"]
                    photo.auto_detected = True
                    db.commit()

            # Step 2: classify using bboxes (auto-detected or user-annotated)
            ml_params: dict = {}
            if photo.shark_bbox and photo.zone_bbox:
                sb, zb = photo.shark_bbox, photo.zone_bbox
                ml_params = {
                    "shark_x": sb["x"], "shark_y": sb["y"],
                    "shark_w": sb["w"], "shark_h": sb["h"],
                    "zone_x":  zb["x"], "zone_y":  zb["y"],
                    "zone_w":  zb["w"], "zone_h":  zb["h"],
                }
            if photo.orientation:
                ml_params["orientation"] = photo.orientation

            resp = http.post(
                f"{settings.ml_service_url}/classify",
                content=image_data,
                headers={"Content-Type": photo.content_type},
                params=ml_params or None,
            )
            candidates = resp.json().get("candidates", [])

        photo.top5_candidates = candidates
        photo.processing_status = ProcessingStatus.ready_for_validation
        db.commit()

    except Exception:
        logger.exception("Error classifying photo %s", photo_id)
        db.rollback()
        try:
            photo = db.get(Photo, photo_id)
            if photo:
                photo.processing_status = ProcessingStatus.error
                photo.top5_candidates = []
                db.commit()
        except Exception:
            logger.exception("Failed to set error status for photo %s", photo_id)
    finally:
        db.close()


# ── upload ────────────────────────────────────────────────────────────────────

@router.post(
    "/dive-sessions/{session_id}/photos",
    response_model=PhotoOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_photo(
    session_id: UUID,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    # Validate session exists
    if not db.get(DiveSession, session_id):
        raise HTTPException(status_code=404, detail="Dive session not found")

    # Validate content type
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only JPEG and PNG images are accepted",
        )

    data = await file.read()

    # H1: enforce file size limit
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Photo exceeds the {MAX_PHOTO_BYTES // 1024 // 1024} MB limit.",
        )

    # H1: verify file is actually a valid image
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File is not a valid image",
        )

    # Extract EXIF
    exif = extract_exif(data)
    taken_at = parse_taken_at(exif)
    gps_lat, gps_lon = parse_gps(exif)

    # Build MinIO object key
    photo_id = uuid.uuid4()
    ext = "jpg" if file.content_type == "image/jpeg" else "png"
    object_key = f"photos/{session_id}/{photo_id}.{ext}"
    upload_file(data, object_key, file.content_type)

    photo = Photo(
        id=photo_id,
        object_key=object_key,
        content_type=file.content_type,
        size=len(data),
        exif_payload=exif,
        taken_at=taken_at,
        gps_lat=gps_lat,
        gps_lon=gps_lon,
        dive_session_id=session_id,
        processing_status=ProcessingStatus.uploaded,
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)

    background_tasks.add_task(_classify_photo, photo.id)

    return enrich_photo(photo)


# ── validation queue — must be registered BEFORE /{photo_id} ─────────────────

@router.get("/photos/validation-queue/count")
def validation_queue_count(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    count = (
        db.query(Photo)
        .filter(Photo.processing_status == ProcessingStatus.ready_for_validation)
        .count()
    )
    return {"count": count}


@router.get("/photos/validation-queue", response_model=List[PhotoOut])
def validation_queue(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    photos = (
        db.query(Photo)
        .filter(Photo.processing_status == ProcessingStatus.ready_for_validation)
        .order_by(Photo.uploaded_at)
        .all()
    )
    return [enrich_photo(p) for p in photos]


# ── photo detail ──────────────────────────────────────────────────────────────

@router.get("/photos/{photo_id}", response_model=PhotoOut)
def get_photo(
    photo_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return enrich_photo(_get_photo_or_404(db, photo_id))


# ── background embedding task ────────────────────────────────────────────────

def _store_embedding_for_shark(photo_id: UUID, shark_id: str, display_name: str) -> None:
    """Fetch image from MinIO and push its embedding to the ML service."""
    db = SessionLocal()
    try:
        photo = db.get(Photo, photo_id)
        if not photo:
            return
        image_data = get_object_bytes(photo.object_key)

        ml_params: dict = {
            "shark_id": shark_id,
            "display_name": display_name,
            "photo_id": str(photo_id),
        }
        if photo.shark_bbox and photo.zone_bbox:
            sb, zb = photo.shark_bbox, photo.zone_bbox
            ml_params.update({
                "shark_x": sb["x"], "shark_y": sb["y"],
                "shark_w": sb["w"], "shark_h": sb["h"],
                "zone_x":  zb["x"], "zone_y":  zb["y"],
                "zone_w":  zb["w"], "zone_h":  zb["h"],
            })
        if photo.orientation:
            ml_params["orientation"] = photo.orientation

        with httpx.Client(timeout=30.0) as http:
            http.post(
                f"{settings.ml_service_url}/embeddings",
                content=image_data,
                headers={"Content-Type": photo.content_type},
                params=ml_params,
            )
    except Exception:
        logger.exception("Failed to store embedding for photo %s / shark %s", photo_id, shark_id)
    finally:
        db.close()


# ── annotate ──────────────────────────────────────────────────────────────────

@router.post("/photos/{photo_id}/annotate", response_model=PhotoOut)
async def annotate_photo(
    photo_id: UUID,
    body: AnnotateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Save user-drawn annotation (shark bbox + zone bbox + orientation) and
    re-trigger ML classification using the annotated region."""
    photo = _get_photo_or_404(db, photo_id)

    photo.shark_bbox = body.shark_bbox.model_dump()
    photo.zone_bbox = body.zone_bbox.model_dump()
    photo.orientation = body.orientation
    photo.auto_detected = False   # user has now reviewed / confirmed the annotation
    photo.processing_status = ProcessingStatus.processing
    photo.top5_candidates = None
    db.commit()
    db.refresh(photo)

    background_tasks.add_task(_classify_photo, photo.id)
    return enrich_photo(photo)


# ── delete ────────────────────────────────────────────────────────────────────

@router.delete("/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(
    photo_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    photo = _get_photo_or_404(db, photo_id)
    try:
        delete_file(photo.object_key)
    except Exception:
        pass  # file may already be gone; proceed with DB deletion
    db.delete(photo)
    db.commit()


# ── validate ──────────────────────────────────────────────────────────────────

@router.post("/photos/{photo_id}/validate", response_model=PhotoOut)
def validate_photo(
    photo_id: UUID,
    body: ValidateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    photo = _get_photo_or_404(db, photo_id)
    if photo.processing_status != ProcessingStatus.ready_for_validation:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Photo is not in the validation queue",
        )

    shark: Shark | None = None

    if body.action in ("confirm", "select"):
        if not body.shark_id:
            raise HTTPException(status_code=422, detail="shark_id required for this action")
        shark = db.get(Shark, body.shark_id)
        if not shark:
            raise HTTPException(status_code=404, detail="Shark not found")
        photo.shark_id = shark.id

    elif body.action == "create":
        if not body.shark_name:
            raise HTTPException(status_code=422, detail="shark_name required for action 'create'")
        shark = Shark(
            display_name=body.shark_name,
            name_status=NameStatus(body.name_status),
        )
        db.add(shark)
        db.flush()  # get shark.id before commit
        photo.shark_id = shark.id

    elif body.action == "unlink":
        photo.shark_id = None

    if body.set_as_profile_photo and photo.shark_id:
        photo.is_profile_photo = True
        background_tasks.add_task(
            _store_embedding_for_shark,
            photo.id,
            str(photo.shark_id),
            shark.display_name if shark else "",
        )

    photo.processing_status = ProcessingStatus.validated

    # Auto-create a draft Observation when a shark is linked
    if photo.shark_id:
        obs = Observation(
            dive_session_id=photo.dive_session_id,
            shark_id=photo.shark_id,
            photo_id=photo.id,
            taken_at=photo.taken_at,
            location_id=(
                db.get(DiveSession, photo.dive_session_id).location_id
                if photo.dive_session_id
                else None
            ),
        )
        db.add(obs)

    db.commit()
    db.refresh(photo)
    return enrich_photo(photo)
