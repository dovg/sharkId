"""
Shared test fixtures for the SharkID backend.

Env vars are set BEFORE any app import so pydantic-settings picks them up.
Database: SQLite in-memory via StaticPool — all connections share the same
connection, so background tasks and request handlers see the same data.
MinIO and the ML httpx calls are fully mocked.
"""
import io
import os
from unittest.mock import MagicMock, patch

# ── env vars must be set before ANY app import ────────────────────────────────
os.environ.update(
    {
        "DATABASE_URL": "sqlite://",
        "JWT_SECRET": "test-secret-for-unit-tests-only",
        "MINIO_ENDPOINT": "localhost:9000",
        "MINIO_ROOT_USER": "minioadmin",
        "MINIO_ROOT_PASSWORD": "minioadmin",
        "MINIO_BUCKET": "sharks-photos",
        "ML_SERVICE_URL": "http://ml:8001",
        "PHOTO_BASE_URL": "http://localhost/photos",
    }
)

import pytest
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.testclient import TestClient

# App imports after env vars are set
from app.auth.hashing import hash_password
from app.auth.jwt import create_access_token
from app.database import Base, get_db
from app.main import app  # triggers all model imports → registers with Base.metadata
from app.models.user import User

# ── test engine: single in-memory SQLite connection shared via StaticPool ─────
TEST_ENGINE = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=TEST_ENGINE)


# ── stub httpx.Client used by _classify_photo background task ─────────────────
class _MockHttpxClient:
    def __init__(self, *args, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def post(self, url, **kwargs):
        m = MagicMock()
        if "/detect" in url:
            m.json.return_value = {"shark_bbox": None, "zone_bbox": None}
        else:
            m.json.return_value = {"candidates": []}
        return m


# ── autouse: create / drop tables per test ────────────────────────────────────
@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.create_all(TEST_ENGINE)
    yield
    Base.metadata.drop_all(TEST_ENGINE)


# ── autouse: test DB session + get_db override + bg-task SessionLocal patch ───
@pytest.fixture(autouse=True)
def db_session(reset_db):
    """
    Provide one SQLAlchemy session per test, override the FastAPI get_db
    dependency, and redirect SessionLocal used by background tasks to the
    same TestingSessionLocal so all code uses the same in-memory database.
    """
    session = TestingSessionLocal()

    def _override():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[get_db] = _override

    # Patch SessionLocal referenced directly in background-task modules
    import app.routers.photos as photos_mod
    import app.routers.videos as videos_mod

    orig_photos_sl = photos_mod.SessionLocal
    orig_videos_sl = videos_mod.SessionLocal
    photos_mod.SessionLocal = TestingSessionLocal
    videos_mod.SessionLocal = TestingSessionLocal

    yield session

    photos_mod.SessionLocal = orig_photos_sl
    videos_mod.SessionLocal = orig_videos_sl
    app.dependency_overrides.pop(get_db, None)
    session.close()


# ── autouse: mock all MinIO calls ─────────────────────────────────────────────
@pytest.fixture(autouse=True)
def mock_minio():
    """Patch MinIO functions where they are used (bound at import time)."""
    with (
        patch("app.routers.photos.upload_file"),
        patch("app.routers.photos.delete_file"),
        patch(
            "app.routers.photos.get_object_bytes",
            return_value=b"\xff\xd8\xff\xe0" + b"\x00" * 200,
        ),
        patch("app.routers.videos.upload_file"),
        patch("app.routers.videos.delete_file"),
        patch("app.routers.videos.get_object_bytes", return_value=b""),
    ):
        yield


# ── autouse: mock httpx ML calls inside _classify_photo ───────────────────────
@pytest.fixture(autouse=True)
def mock_ml():
    with patch("app.routers.photos.httpx.Client", _MockHttpxClient):
        yield


# ── test client ───────────────────────────────────────────────────────────────
@pytest.fixture
def client():
    return TestClient(app)


# ── user fixtures ─────────────────────────────────────────────────────────────
@pytest.fixture
def admin_user(db_session):
    user = User(
        email="admin@example.com",
        password_hash=hash_password("adminpass"),
        role="admin",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def editor_user(db_session):
    user = User(
        email="editor@example.com",
        password_hash=hash_password("editorpass"),
        role="editor",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def viewer_user(db_session):
    user = User(
        email="viewer@example.com",
        password_hash=hash_password("viewerpass"),
        role="viewer",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


# ── token / header fixtures ───────────────────────────────────────────────────
@pytest.fixture
def admin_token(admin_user):
    return create_access_token(admin_user.email)


@pytest.fixture
def editor_token(editor_user):
    return create_access_token(editor_user.email)


@pytest.fixture
def viewer_token(viewer_user):
    return create_access_token(viewer_user.email)


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def editor_headers(editor_token):
    return {"Authorization": f"Bearer {editor_token}"}


@pytest.fixture
def viewer_headers(viewer_token):
    return {"Authorization": f"Bearer {viewer_token}"}


# ── minimal valid image bytes ─────────────────────────────────────────────────
@pytest.fixture
def tiny_jpeg():
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color="white").save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def tiny_png():
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color="white").save(buf, format="PNG")
    return buf.getvalue()
