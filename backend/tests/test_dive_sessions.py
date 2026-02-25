"""
Item 57 — dive-session CRUD tests.
"""

_SESSION = {"started_at": "2024-01-15T10:00:00Z"}


def test_create_session(client, editor_headers):
    resp = client.post("/dive-sessions", json=_SESSION, headers=editor_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert data["comment"] is None


def test_list_sessions(client, editor_headers):
    client.post("/dive-sessions", json=_SESSION, headers=editor_headers)
    resp = client.get("/dive-sessions", headers=editor_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_list_includes_counts(client, editor_headers):
    client.post("/dive-sessions", json=_SESSION, headers=editor_headers)
    resp = client.get("/dive-sessions", headers=editor_headers)
    item = resp.json()[0]
    assert "shark_count" in item
    assert "queue_count" in item
    assert item["shark_count"] == 0
    assert item["queue_count"] == 0


def test_get_session_detail(client, editor_headers):
    resp = client.post("/dive-sessions", json=_SESSION, headers=editor_headers)
    session_id = resp.json()["id"]

    resp = client.get(f"/dive-sessions/{session_id}", headers=editor_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "photos" in data
    assert "observations" in data
    assert data["photos"] == []
    assert data["observations"] == []


def test_update_session(client, editor_headers):
    resp = client.post("/dive-sessions", json=_SESSION, headers=editor_headers)
    session_id = resp.json()["id"]

    resp = client.put(
        f"/dive-sessions/{session_id}",
        json={"comment": "Great dive, saw 3 sharks"},
        headers=editor_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["comment"] == "Great dive, saw 3 sharks"


def test_delete_session(client, editor_headers):
    resp = client.post("/dive-sessions", json=_SESSION, headers=editor_headers)
    session_id = resp.json()["id"]

    resp = client.delete(f"/dive-sessions/{session_id}", headers=editor_headers)
    assert resp.status_code == 204

    resp = client.get("/dive-sessions", headers=editor_headers)
    assert resp.json() == []


def test_viewer_can_list_sessions(client, viewer_headers):
    resp = client.get("/dive-sessions", headers=viewer_headers)
    assert resp.status_code == 200


def test_viewer_cannot_create_session(client, viewer_headers):
    resp = client.post("/dive-sessions", json=_SESSION, headers=viewer_headers)
    assert resp.status_code == 403


def test_delete_nonexistent(client, editor_headers):
    resp = client.delete(
        "/dive-sessions/00000000-0000-0000-0000-000000000000",
        headers=editor_headers,
    )
    assert resp.status_code == 404
