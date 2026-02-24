import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, func, Enum as SAEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class NameStatus(str, enum.Enum):
    temporary = "temporary"
    confirmed = "confirmed"


class Shark(Base):
    __tablename__ = "sharks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    name_status: Mapped[NameStatus] = mapped_column(
        SAEnum(NameStatus, name="name_status_enum"),
        nullable=False,
        default=NameStatus.temporary,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    main_photo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("photos.id", ondelete="SET NULL", use_alter=True, name="fk_sharks_main_photo"),
        nullable=True,
    )
