from datetime import datetime
from typing import Any, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.shark import NameStatus


class SharkCreate(BaseModel):
    display_name: str
    name_status: NameStatus = NameStatus.temporary


class SharkUpdate(BaseModel):
    display_name: Optional[str] = None
    name_status: Optional[NameStatus] = None
    main_photo_id: Optional[UUID] = None


class SharkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    display_name: str
    name_status: NameStatus
    created_at: datetime
    main_photo_id: Optional[UUID] = None
    main_photo_url: Optional[str] = None


class SharkDetail(SharkOut):
    profile_photos: List[Any] = []   # List[PhotoOut] — populated in router to avoid circular import
    all_photos: List[Any] = []       # List[PhotoOut] — all photos linked to this shark
    observations: List[Any] = []     # List[ObservationOut]
    sighting_count: int = 0
