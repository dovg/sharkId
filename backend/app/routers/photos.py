import uuid
from datetime import datetime, timezone
from typing import List
from uuid import UUID

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, status
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
from app.storage.minio import delete_file, get_presigned_url, upload_file
from app.utils.exif import extract_exif, parse_gps, parse_taken_at

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png"}

router = APIRouter(tags=["photos"])


# ── helpers ──────────────────────────────────────────────────────────────────

def _get_photo_or_404(db: Session, photo_id: UUID) -> Photo:
    photo = db.get(Photo, photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    return photo


def _enrich(photo: Photo) -> PhotoOut:
    out = PhotoOut.model_validate(photo)
    if settings.photo_base_url:
        out.url = f"{settings.photo_base_url}/{photo.object_key}"
    else:
        try:
            out.url = get_presigned_url(photo.object_key)
        except Exception:
            pass
    return out


# ── background classification task ───────────────────────────────────────────

def _classify_photo(photo_id: UUID) -> None:
    """
    Fetch image from MinIO, call ML service, update photo record.
    Runs in FastAPI's thread pool via BackgroundTasks.
    Phase 5 will implement the actual ML logic; for now the ML service
    returns an empty candidates list and the photo moves to ready_for_validation.
    """
    db = SessionLocal()
    try:
        photo = db.get(Photo, photo_id)
        if not photo:
            return

        photo.processing_status = ProcessingStatus.processing
        db.commit()

        # Fetch image bytes from MinIO
        from app.storage.minio import _client
        s3 = _client()
        obj = s3.get_object(Bucket=settings.minio_bucket, Key=photo.object_key)
        image_data = obj["Body"].read()

        # Build bbox params if the photo has been annotated
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

        # Call ML service
        with httpx.Client(timeout=30.0) as http:
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
        db.rollback()
        try:
            photo = db.get(Photo, photo_id)
            if photo:
                photo.processing_status = ProcessingStatus.ready_for_validation
                photo.top5_candidates = []
                db.commit()
        except Exception:
            pass
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

    return _enrich(photo)


# ── validation queue — must be registered BEFORE /{photo_id} ─────────────────

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
    return [_enrich(p) for p in photos]


# ── photo detail ──────────────────────────────────────────────────────────────

@router.get("/photos/{photo_id}", response_model=PhotoOut)
def get_photo(
    photo_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return _enrich(_get_photo_or_404(db, photo_id))


# ── background embedding task ────────────────────────────────────────────────

def _store_embedding_for_shark(photo_id: UUID, shark_id: str, display_name: str) -> None:
    """Fetch image from MinIO and push its embedding to the ML service."""
    db = SessionLocal()
    try:
        photo = db.get(Photo, photo_id)
        if not photo:
            return
        from app.storage.minio import _client
        s3 = _client()
        obj = s3.get_object(Bucket=settings.minio_bucket, Key=photo.object_key)
        image_data = obj["Body"].read()

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
        pass  # non-critical; ML store can be rebuilt from profile photos
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
    photo.processing_status = ProcessingStatus.processing
    photo.top5_candidates = None
    db.commit()
    db.refresh(photo)

    background_tasks.add_task(_classify_photo, photo.id)
    return _enrich(photo)


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

    else:
        raise HTTPException(status_code=422, detail=f"Unknown action '{body.action}'")

    if body.set_as_profile_photo and photo.shark_id:
        photo.is_profile_photo = True
        # Kick off embedding storage after commit so the shark record exists
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
    return _enrich(photo)
