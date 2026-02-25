from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_editor
from app.database import get_db
from app.models.audit_log import A
from app.models.observation import Observation
from app.models.photo import Photo
from app.models.shark import Shark
from app.models.user import User
from app.schemas.observation import ObservationOut
from app.schemas.shark import SharkCreate, SharkDetail, SharkOut, SharkUpdate
from app.utils.audit import log_event
from app.utils.names import suggest_name
from app.utils.photo import enrich_photo, photo_url

router = APIRouter(prefix="/sharks", tags=["sharks"])


def _get_or_404(db: Session, shark_id: UUID) -> Shark:
    s = db.get(Shark, shark_id)
    if not s:
        raise HTTPException(status_code=404, detail="Shark not found")
    return s


@router.get("/suggest-name")
def suggest_shark_name(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return {"name": suggest_name(db)}


@router.get("", response_model=List[SharkOut])
def list_sharks(
    q: str = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    sharks = db.query(Shark)
    if q:
        sharks = sharks.filter(Shark.display_name.ilike(f"%{q}%"))
    sharks = sharks.order_by(Shark.display_name).all()

    main_photo_ids = [s.main_photo_id for s in sharks if s.main_photo_id]
    photos_by_id = {}
    if main_photo_ids:
        photos = db.query(Photo).filter(Photo.id.in_(main_photo_ids)).all()
        photos_by_id = {p.id: p for p in photos}

    result = []
    for s in sharks:
        out = SharkOut.model_validate(s)
        if s.main_photo_id and s.main_photo_id in photos_by_id:
            out.main_photo_url = photo_url(photos_by_id[s.main_photo_id])
        result.append(out)
    return result


@router.post("", response_model=SharkOut, status_code=status.HTTP_201_CREATED)
def create_shark(
    body: SharkCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    shark = Shark(**body.model_dump())
    db.add(shark)
    db.flush()
    log_event(
        db, current_user, A.SHARK_CREATE,
        resource_type="shark", resource_id=shark.id,
        detail={"display_name": shark.display_name},
        request=request,
    )
    db.commit()
    db.refresh(shark)
    return shark


@router.get("/{shark_id}", response_model=SharkDetail)
def get_shark(
    shark_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    shark = _get_or_404(db, shark_id)
    all_photos = (
        db.query(Photo)
        .filter(Photo.shark_id == shark_id)
        .order_by(Photo.uploaded_at)
        .all()
    )
    profile_photos = [p for p in all_photos if p.is_profile_photo]
    observations = (
        db.query(Observation)
        .filter(Observation.shark_id == shark_id)
        .order_by(Observation.taken_at.desc().nullslast())
        .all()
    )

    # Req11: compute first/last seen from observation taken_at
    obs_dates = [o.taken_at for o in observations if o.taken_at is not None]
    first_seen = min(obs_dates) if obs_dates else None
    last_seen = max(obs_dates) if obs_dates else None

    detail = SharkDetail.model_validate(shark)
    detail.all_photos = [enrich_photo(p) for p in all_photos]
    detail.profile_photos = [enrich_photo(p) for p in profile_photos]
    detail.observations = [ObservationOut.model_validate(o) for o in observations]
    detail.sighting_count = len(observations)
    detail.first_seen = first_seen
    detail.last_seen = last_seen
    if shark.main_photo_id:
        main = next((p for p in all_photos if p.id == shark.main_photo_id), None)
        if main:
            detail.main_photo_url = photo_url(main)
    return detail


@router.delete("/{shark_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shark(
    shark_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    shark = _get_or_404(db, shark_id)
    log_event(db, current_user, A.SHARK_DELETE, resource_type="shark", resource_id=shark_id, request=request)
    db.delete(shark)
    db.commit()


@router.put("/{shark_id}", response_model=SharkOut)
def update_shark(
    shark_id: UUID,
    body: SharkUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_editor),
):
    shark = _get_or_404(db, shark_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(shark, field, value)
    log_event(
        db, current_user, A.SHARK_UPDATE,
        resource_type="shark", resource_id=shark_id,
        detail={"display_name": body.display_name} if body.display_name else None,
        request=request,
    )
    db.commit()
    db.refresh(shark)
    out = SharkOut.model_validate(shark)
    if shark.main_photo_id:
        photo = db.get(Photo, shark.main_photo_id)
        if photo:
            out.main_photo_url = photo_url(photo)
    return out
