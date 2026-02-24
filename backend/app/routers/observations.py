from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.observation import Observation
from app.models.user import User
from app.schemas.observation import ObservationOut, ObservationUpdate

router = APIRouter(prefix="/observations", tags=["observations"])


def _get_or_404(db: Session, obs_id: UUID) -> Observation:
    obs = db.get(Observation, obs_id)
    if not obs:
        raise HTTPException(status_code=404, detail="Observation not found")
    return obs


@router.get("/{observation_id}", response_model=ObservationOut)
def get_observation(
    observation_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return _get_or_404(db, observation_id)


@router.put("/{observation_id}", response_model=ObservationOut)
def update_observation(
    observation_id: UUID,
    body: ObservationUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    obs = _get_or_404(db, observation_id)
    if obs.confirmed_at is not None:
        raise HTTPException(status_code=409, detail="Confirmed observations cannot be edited")

    for field, value in body.model_dump(exclude_unset=True, exclude={"confirm"}).items():
        setattr(obs, field, value)

    if body.confirm:
        obs.confirmed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(obs)
    return obs
