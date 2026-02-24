from datetime import datetime
from typing import Any, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DiveSessionCreate(BaseModel):
    started_at: datetime
    ended_at: Optional[datetime] = None
    location_id: Optional[UUID] = None
    comment: Optional[str] = None


class DiveSessionUpdate(BaseModel):
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    location_id: Optional[UUID] = None
    comment: Optional[str] = None


class DiveSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    started_at: datetime
    ended_at: Optional[datetime]
    location_id: Optional[UUID]
    comment: Optional[str]
    created_at: datetime


class DiveSessionDetail(DiveSessionOut):
    photo_count: int = 0
    observation_count: int = 0
    photos: List[Any] = []        # List[PhotoOut]
    observations: List[Any] = []  # List[ObservationOut]
