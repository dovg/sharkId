from collections import defaultdict
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import distinct, func
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.config import settings
from app.database import get_db
from app.models.dive_session import DiveSession
from app.models.observation import Observation
from app.models.photo import Photo, ProcessingStatus
from app.models.shark import Shark
from app.models.user import User
from app.schemas.dive_session import DiveSessionCreate, DiveSessionDetail, DiveSessionOut, DiveSessionUpdate
from app.schemas.observation import ObservationOut
from app.schemas.photo import PhotoOut
from app.storage.minio import get_presigned_url

router = APIRouter(prefix="/dive-sessions", tags=["dive-sessions"])


def _get_or_404(db: Session, session_id: UUID) -> DiveSession:
    s = db.get(DiveSession, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Dive session not found")
    return s


def _enrich_photo(photo: Photo) -> PhotoOut:
    out = PhotoOut.model_validate(photo)
    if settings.photo_base_url:
        out.url = f"{settings.photo_base_url}/{photo.object_key}"
    else:
        try:
            out.url = get_presigned_url(photo.object_key)
        except Exception:
            pass
    return out


def _photo_url(object_key: str) -> str | None:
    if settings.photo_base_url:
        return f"{settings.photo_base_url}/{object_key}"
    try:
        return get_presigned_url(object_key)
    except Exception:
        return None


@router.get("", response_model=List[DiveSessionOut])
def list_sessions(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    sessions = db.query(DiveSession).order_by(DiveSession.started_at.desc()).all()
    if not sessions:
        return []

    session_ids = [s.id for s in sessions]

    # Unique shark count per session
    shark_counts = dict(
        db.query(Observation.dive_session_id, func.count(distinct(Observation.shark_id)))
        .filter(
            Observation.dive_session_id.in_(session_ids),
            Observation.shark_id.isnot(None),
        )
        .group_by(Observation.dive_session_id)
        .all()
    )

    # Validation-queue photo count per session
    queue_counts = dict(
        db.query(Photo.dive_session_id, func.count(Photo.id))
        .filter(
            Photo.dive_session_id.in_(session_ids),
            Photo.processing_status == ProcessingStatus.ready_for_validation,
        )
        .group_by(Photo.dive_session_id)
        .all()
    )

    # Shark thumbnails: up to 5 unique sharks per session via their main photo
    obs_sharks = (
        db.query(Observation.dive_session_id, Observation.shark_id)
        .filter(
            Observation.dive_session_id.in_(session_ids),
            Observation.shark_id.isnot(None),
        )
        .distinct()
        .all()
    )
    session_shark_ids: dict = defaultdict(list)
    for sess_id, shark_id in obs_sharks:
        if len(session_shark_ids[sess_id]) < 5:
            session_shark_ids[sess_id].append(shark_id)

    all_shark_ids = list({sid for ids in session_shark_ids.values() for sid in ids})
    sharks_map = {}
    if all_shark_ids:
        sharks_map = {s.id: s for s in db.query(Shark).filter(Shark.id.in_(all_shark_ids)).all()}

    main_photo_ids = [s.main_photo_id for s in sharks_map.values() if s.main_photo_id]
    photos_map = {}
    if main_photo_ids:
        photos_map = {p.id: p for p in db.query(Photo).filter(Photo.id.in_(main_photo_ids)).all()}

    session_thumbs: dict = {}
    for sess_id, shark_ids in session_shark_ids.items():
        urls = []
        for shark_id in shark_ids:
            shark = sharks_map.get(shark_id)
            if shark and shark.main_photo_id:
                photo = photos_map.get(shark.main_photo_id)
                if photo:
                    url = _photo_url(photo.object_key)
                    if url:
                        urls.append(url)
        session_thumbs[sess_id] = urls

    results = []
    for s in sessions:
        out = DiveSessionOut.model_validate(s)
        out.shark_count = shark_counts.get(s.id, 0)
        out.queue_count = queue_counts.get(s.id, 0)
        out.shark_thumbs = session_thumbs.get(s.id, [])
        results.append(out)
    return results


@router.post("", response_model=DiveSessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    body: DiveSessionCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    session = DiveSession(**body.model_dump())
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/{session_id}", response_model=DiveSessionDetail)
def get_session(
    session_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    s = _get_or_404(db, session_id)
    photos = db.query(Photo).filter(Photo.dive_session_id == session_id).order_by(Photo.uploaded_at).all()
    observations = (
        db.query(Observation)
        .filter(Observation.dive_session_id == session_id)
        .order_by(Observation.taken_at)
        .all()
    )
    detail = DiveSessionDetail.model_validate(s)
    detail.photos = [_enrich_photo(p) for p in photos]
    detail.observations = [ObservationOut.model_validate(o) for o in observations]
    detail.photo_count = len(photos)
    detail.observation_count = len(observations)
    return detail


@router.put("/{session_id}", response_model=DiveSessionOut)
def update_session(
    session_id: UUID,
    body: DiveSessionUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    s = _get_or_404(db, session_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(s, field, value)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    s = _get_or_404(db, session_id)
    db.delete(s)
    db.commit()
