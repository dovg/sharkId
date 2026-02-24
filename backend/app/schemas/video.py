from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.video import VideoStatus


class VideoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    object_key: str
    content_type: str
    size: int
    uploaded_at: datetime
    processing_status: VideoStatus
    frames_extracted: int
    dive_session_id: Optional[UUID] = None
