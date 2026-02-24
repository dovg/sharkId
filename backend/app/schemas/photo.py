from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.photo import ProcessingStatus


class BBox(BaseModel):
    x: float
    y: float
    w: float
    h: float


class PhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    object_key: str
    content_type: str
    size: int
    uploaded_at: datetime
    taken_at: Optional[datetime]
    gps_lat: Optional[float]
    gps_lon: Optional[float]
    processing_status: ProcessingStatus
    top5_candidates: Optional[List[Any]]
    dive_session_id: Optional[UUID]
    shark_id: Optional[UUID]
    is_profile_photo: bool
    shark_bbox: Optional[Dict[str, float]] = None
    zone_bbox: Optional[Dict[str, float]] = None
    orientation: Optional[str] = None
    auto_detected: bool = False
    # Presigned URL injected at response time (not a DB column)
    url: Optional[str] = None


class ValidateRequest(BaseModel):
    # action: "confirm" | "select" | "create" | "unlink"
    action: str
    shark_id: Optional[UUID] = None    # required for "confirm" and "select"
    shark_name: Optional[str] = None   # required for "create"
    name_status: str = "temporary"     # for "create"
    set_as_profile_photo: bool = False


class AnnotateRequest(BaseModel):
    shark_bbox: BBox
    zone_bbox: BBox
    orientation: Optional[str] = None   # "face_left" | "face_right"
