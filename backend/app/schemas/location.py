from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LocationCreate(BaseModel):
    country: str
    spot_name: str
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lon: Optional[float] = Field(None, ge=-180, le=180)


class LocationUpdate(BaseModel):
    country: Optional[str] = None
    spot_name: Optional[str] = None
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lon: Optional[float] = Field(None, ge=-180, le=180)


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    country: str
    spot_name: str
    lat: Optional[float]
    lon: Optional[float]
    created_at: datetime
