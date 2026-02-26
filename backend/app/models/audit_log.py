import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Index, JSON, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    user_email: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    resource_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    detail: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_audit_logs_resource", "resource_type", "resource_id"),
        Index("ix_audit_logs_created_at", "created_at"),
    )


class A:
    AUTH_LOGIN = "auth.login"
    SESSION_CREATE = "session.create"
    SESSION_UPDATE = "session.update"
    SESSION_DELETE = "session.delete"
    PHOTO_UPLOAD = "photo.upload"
    PHOTO_ANNOTATE = "photo.annotate"
    PHOTO_VALIDATE = "photo.validate"
    PHOTO_DELETE = "photo.delete"
    PHOTO_RECHECK = "photo.recheck"
    PHOTO_REBUILD_EMBEDDINGS = "photo.rebuild_embeddings"
    VIDEO_UPLOAD = "video.upload"
    VIDEO_DELETE = "video.delete"
    SHARK_CREATE = "shark.create"
    SHARK_UPDATE = "shark.update"
    SHARK_DELETE = "shark.delete"
    OBSERVATION_UPDATE = "observation.update"
    OBSERVATION_CONFIRM = "observation.confirm"
    LOCATION_CREATE = "location.create"
    LOCATION_UPDATE = "location.update"
    LOCATION_DELETE = "location.delete"
