"""
Item 57 — observation tests.

Observations are auto-created when a photo is validated with a shark.
For isolation, this suite creates observations directly via the DB session.
"""
import uuid
from datetime import datetime, timezone

import pytest

from app.models.dive_session import DiveSession
from app.models.observation import Observation
from app.models.shark import NameStatus, Shark

_SESSION_BODY = {"started_at": "2024-01-15T10:00:00Z"}
_SHARK_BODY = {"display_name": "TestShark", "name_status": "temporary"}


# ── shared fixtures ───────────────────────────────────────────────────────────


@pytest.fixture
def session_id(client, editor_headers):
    resp = client.post("/dive-sessions", json=_SESSION_BODY, headers=editor_headers)
    return resp.json()["id"]


@pytest.fixture
def shark_id(client, editor_headers):
    resp = client.post("/sharks", json=_SHARK_BODY, headers=editor_headers)
    return resp.json()["id"]


@pytest.fixture
def observation(db_session, session_id, shark_id):
    """Draft observation created directly in the database."""
    obs = Observation(
        dive_session_id=uuid.UUID(session_id),
        shark_id=uuid.UUID(shark_id),
        taken_at=datetime(2024, 1, 15, 10, 30, tzinfo=timezone.utc),
    )
    db_session.add(obs)
    db_session.commit()
    db_session.refresh(obs)
    return obs


# ── tests ─────────────────────────────────────────────────────────────────────


def test_get_observation(client, editor_headers, observation):
    resp = client.get(f"/observations/{observation.id}", headers=editor_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert str(data["id"]) == str(observation.id)
    # exif_payload key is always present (may be None when no linked photo)
    assert "exif_payload" in data


def test_viewer_can_get_observation(client, viewer_headers, observation):
    resp = client.get(f"/observations/{observation.id}", headers=viewer_headers)
    assert resp.status_code == 200


def test_edit_draft_comment(client, editor_headers, observation):
    resp = client.put(
        f"/observations/{observation.id}",
        json={"comment": "Spotted near the reef"},
        headers=editor_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["comment"] == "Spotted near the reef"


def test_confirm_observation(client, editor_headers, observation):
    resp = client.put(
        f"/observations/{observation.id}",
        json={"confirm": True},
        headers=editor_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["confirmed_at"] is not None


def test_edit_confirmed_returns_409(client, editor_headers, observation):
    # First, confirm it
    client.put(
        f"/observations/{observation.id}",
        json={"confirm": True},
        headers=editor_headers,
    )
    # Then try to edit
    resp = client.put(
        f"/observations/{observation.id}",
        json={"comment": "Too late to edit"},
        headers=editor_headers,
    )
    assert resp.status_code == 409


def test_viewer_cannot_edit(client, viewer_headers, observation):
    resp = client.put(
        f"/observations/{observation.id}",
        json={"comment": "Viewer sneaking in"},
        headers=viewer_headers,
    )
    assert resp.status_code == 403
