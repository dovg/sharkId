"""
Internal user management endpoints.

Accessible only from localhost or the Docker internal network.
Not proxied by nginx — reachable at localhost:8000/internal/ or backend:8000/internal/.
"""
import ipaddress
import logging
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr
from sqlalchemy.orm import Session

from app.auth.hashing import hash_password
from app.database import get_db
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal", tags=["internal"])

# RFC-1918 private ranges + loopback — the only sources allowed
_ALLOWED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
]


def _require_internal(request: Request) -> None:
    """Dependency: reject requests that don't originate from localhost / Docker network."""
    client_ip = request.client.host if request.client else ""
    try:
        addr = ipaddress.ip_address(client_ip)
        if any(addr in net for net in _ALLOWED_NETWORKS):
            return
    except ValueError:
        pass
    logger.warning("Blocked internal endpoint access from %s", client_ip)
    raise HTTPException(status_code=403, detail="Forbidden")


# ── Schemas ────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    password: str | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    created_at: str

    @classmethod
    def from_orm_model(cls, user: User) -> "UserOut":
        return cls(
            id=user.id,
            email=user.email,
            created_at=user.created_at.isoformat(),
        )


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=List[UserOut], dependencies=[Depends(_require_internal)])
def list_users(db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.created_at).all()
    return [UserOut.from_orm_model(u) for u in users]


@router.post(
    "/users",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_require_internal)],
)
def create_user(body: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(email=body.email, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut.from_orm_model(user)


@router.get("/users/{user_id}", response_model=UserOut, dependencies=[Depends(_require_internal)])
def get_user(user_id: UUID, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserOut.from_orm_model(user)


@router.put("/users/{user_id}", response_model=UserOut, dependencies=[Depends(_require_internal)])
def update_user(user_id: UUID, body: UserUpdate, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.email is not None:
        conflict = db.query(User).filter(User.email == body.email, User.id != user_id).first()
        if conflict:
            raise HTTPException(status_code=409, detail="Email already registered")
        user.email = body.email
    if body.password is not None:
        user.password_hash = hash_password(body.password)
    db.commit()
    db.refresh(user)
    return UserOut.from_orm_model(user)


@router.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(_require_internal)],
)
def delete_user(user_id: UUID, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
