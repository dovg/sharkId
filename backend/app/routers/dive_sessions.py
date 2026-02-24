from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.config import settings
from app.database import get_db
from app.models.dive_session import DiveSession
from app.models.observation import Observation
from app.models.photo import Photo
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


@router.get("", response_model=List[DiveSessionOut])
def list_sessions(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(DiveSession).order_by(DiveSession.started_at.desc()).all()


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
