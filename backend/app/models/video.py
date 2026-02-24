import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class VideoStatus(str, enum.Enum):
    uploaded = "uploaded"
    processing = "processing"
    done = "done"
    error = "error"


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    object_key: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(50), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    processing_status: Mapped[VideoStatus] = mapped_column(
        SAEnum(VideoStatus, name="video_status_enum"),
        nullable=False,
        default=VideoStatus.uploaded,
    )
    frames_extracted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    dive_session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dive_sessions.id", ondelete="SET NULL"), nullable=True
    )
