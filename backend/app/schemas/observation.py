from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ObservationUpdate(BaseModel):
    shark_id: Optional[UUID] = None
    location_id: Optional[UUID] = None
    taken_at: Optional[datetime] = None
    comment: Optional[str] = None
    confirm: bool = False  # set True to confirm; irreversible


class ObservationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    dive_session_id: UUID
    shark_id: Optional[UUID]
    photo_id: Optional[UUID]
    location_id: Optional[UUID]
    taken_at: Optional[datetime]
    comment: Optional[str]
    confirmed_at: Optional[datetime]
    created_at: datetime
