from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_editor
from app.database import get_db
from app.models.audit_log import A
from app.models.dive_session import DiveSession
from app.models.location import Location
from app.models.observation import Observation
from app.models.photo import Photo
from app.models.shark import Shark
from app.models.user import User
from app.schemas.observation import ObservationOut, ObservationUpdate
from app.utils.audit import log_event

router = APIRouter(prefix="/observations", tags=["observations"])


def _get_or_404(db: Session, obs_id: UUID) -> Observation:
    obs = db.get(Observation, obs_id)
    if not obs:
        raise HTTPException(status_code=404, detail="Observation not found")
    return obs


def _to_out(obs: Observation, db: Session) -> ObservationOut:
    """Convert observation to output schema, injecting exif_payload from linked photo."""
    out = ObservationOut.model_validate(obs)
    if obs.photo_id:
        photo = db.get(Photo, obs.photo_id)
        if photo and photo.exif_payload:
            out.exif_payload = photo.exif_payload
    return out


@router.get("/{observation_id}", response_model=ObservationOut)
def get_observation(
    observation_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    obs = _get_or_404(db, observation_id)
    return _to_out(obs, db)


@router.put("/{observation_id}", response_model=ObservationOut)
def update_observation(
    observation_id: UUID,
    body: ObservationUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    obs = _get_or_404(db, observation_id)
    if obs.confirmed_at is not None:
        raise HTTPException(status_code=409, detail="Confirmed observations cannot be edited")

    # M5: validate foreign keys before applying changes
    if body.shark_id is not None and not db.get(Shark, body.shark_id):
        raise HTTPException(status_code=404, detail="Shark not found")
    if body.location_id is not None and not db.get(Location, body.location_id):
        raise HTTPException(status_code=404, detail="Location not found")
    if body.dive_session_id is not None and not db.get(DiveSession, body.dive_session_id):
        raise HTTPException(status_code=404, detail="Dive session not found")

    for field, value in body.model_dump(exclude_unset=True, exclude={"confirm"}).items():
        setattr(obs, field, value)

    if body.confirm:
        obs.confirmed_at = datetime.now(timezone.utc)
        action = A.OBSERVATION_CONFIRM
    else:
        action = A.OBSERVATION_UPDATE

    log_event(db, current_user, action, resource_type="observation", resource_id=observation_id, request=request)
    db.commit()
    db.refresh(obs)
    return _to_out(obs, db)
