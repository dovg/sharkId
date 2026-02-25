from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_editor
from app.database import get_db
from app.models.audit_log import A
from app.models.location import Location
from app.models.user import User
from app.schemas.location import LocationCreate, LocationOut, LocationUpdate
from app.utils.audit import log_event

router = APIRouter(prefix="/locations", tags=["locations"])


def _get_or_404(db: Session, location_id: UUID) -> Location:
    loc = db.get(Location, location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    return loc


@router.get("", response_model=List[LocationOut])
def list_locations(
    q: str = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(Location)
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(Location.country.ilike(like), Location.spot_name.ilike(like))
        )
    return query.order_by(Location.country, Location.spot_name).all()


@router.post("", response_model=LocationOut, status_code=status.HTTP_201_CREATED)
def create_location(
    body: LocationCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    loc = Location(**body.model_dump())
    db.add(loc)
    db.flush()
    log_event(db, current_user, A.LOCATION_CREATE, resource_type="location", resource_id=loc.id, request=request)
    db.commit()
    db.refresh(loc)
    return loc


@router.put("/{location_id}", response_model=LocationOut)
def update_location(
    location_id: UUID,
    body: LocationUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    loc = _get_or_404(db, location_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(loc, field, value)
    log_event(db, current_user, A.LOCATION_UPDATE, resource_type="location", resource_id=location_id, request=request)
    db.commit()
    db.refresh(loc)
    return loc


@router.delete("/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_location(
    location_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    loc = _get_or_404(db, location_id)
    log_event(db, current_user, A.LOCATION_DELETE, resource_type="location", resource_id=location_id, request=request)
    db.delete(loc)
    db.commit()
