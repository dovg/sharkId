from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: Optional[UUID]
    user_email: str
    action: str
    resource_type: Optional[str]
    resource_id: Optional[UUID]
    detail: Optional[Dict[str, Any]]
    ip_address: Optional[str]
    created_at: datetime
