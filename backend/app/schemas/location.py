from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class LocationCreate(BaseModel):
    country: str
    spot_name: str
    lat: Optional[float] = None
    lon: Optional[float] = None


class LocationUpdate(BaseModel):
    country: Optional[str] = None
    spot_name: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    country: str
    spot_name: str
    lat: Optional[float]
    lon: Optional[float]
    created_at: datetime
