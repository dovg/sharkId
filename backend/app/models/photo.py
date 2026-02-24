import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, Float, ForeignKey, Integer, JSON, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProcessingStatus(str, enum.Enum):
    uploaded = "uploaded"
    processing = "processing"
    ready_for_validation = "ready_for_validation"
    validated = "validated"   # user has made a decision (linked, selected, or skipped)
    error = "error"


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    object_key: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(50), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # EXIF data
    exif_payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    taken_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    gps_lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    gps_lon: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # ML classification results
    processing_status: Mapped[ProcessingStatus] = mapped_column(
        SAEnum(ProcessingStatus, name="processing_status_enum"),
        nullable=False,
        default=ProcessingStatus.uploaded,
    )
    # [{shark_id, display_name, score}, ...] — top-5 candidates from ML
    top5_candidates: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    # User annotation — set via POST /photos/{id}/annotate
    # shark_bbox: {x, y, w, h} normalised 0-1, relative to the full image
    # zone_bbox:  {x, y, w, h} normalised 0-1, relative to the shark crop
    # orientation: "face_left" | "face_right"
    # auto_detected: True while bbox was set by ML and awaits user confirmation
    shark_bbox: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    zone_bbox: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    orientation: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    auto_detected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relations
    dive_session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dive_sessions.id", ondelete="SET NULL"), nullable=True
    )
    shark_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sharks.id", ondelete="SET NULL"), nullable=True
    )
    is_profile_photo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
