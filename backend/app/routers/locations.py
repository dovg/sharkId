from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.location import Location
from app.models.user import User
from app.schemas.location import LocationCreate, LocationOut, LocationUpdate

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
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    loc = Location(**body.model_dump())
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


@router.put("/{location_id}", response_model=LocationOut)
def update_location(
    location_id: UUID,
    body: LocationUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    loc = _get_or_404(db, location_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(loc, field, value)
    db.commit()
    db.refresh(loc)
    return loc


@router.delete("/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_location(
    location_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    loc = _get_or_404(db, location_id)
    db.delete(loc)
    db.commit()
