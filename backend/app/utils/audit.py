from typing import Optional
from uuid import UUID

from app.models.audit_log import AuditLog


def log_event(
    db,
    user,
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[UUID] = None,
    detail: Optional[dict] = None,
    request=None,
) -> None:
    """Add an audit log entry. The caller owns the commit — the log rolls back
    with the main transaction on failure."""
    ip = None
    if request and request.client:
        ip = request.client.host

    db.add(AuditLog(
        user_id=user.id,
        user_email=user.email,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=detail,
        ip_address=ip,
    ))
