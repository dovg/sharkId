"""
Item 57 — shark CRUD tests.
"""

_SHARK = {"display_name": "Hermione", "name_status": "temporary"}


def test_create_shark(client, editor_headers):
    resp = client.post("/sharks", json=_SHARK, headers=editor_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["display_name"] == "Hermione"
    assert data["name_status"] == "temporary"


def test_list_sharks(client, editor_headers):
    client.post("/sharks", json=_SHARK, headers=editor_headers)
    resp = client.get("/sharks", headers=editor_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_get_shark_detail(client, editor_headers):
    resp = client.post("/sharks", json=_SHARK, headers=editor_headers)
    shark_id = resp.json()["id"]

    resp = client.get(f"/sharks/{shark_id}", headers=editor_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["display_name"] == "Hermione"
    assert data["sighting_count"] == 0
    assert data["first_seen"] is None
    assert data["last_seen"] is None
    assert data["all_photos"] == []


def test_update_shark(client, editor_headers):
    resp = client.post("/sharks", json=_SHARK, headers=editor_headers)
    shark_id = resp.json()["id"]

    resp = client.put(
        f"/sharks/{shark_id}",
        json={"display_name": "Hermione G", "name_status": "confirmed"},
        headers=editor_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "Hermione G"
    assert resp.json()["name_status"] == "confirmed"


def test_delete_shark(client, editor_headers):
    resp = client.post("/sharks", json=_SHARK, headers=editor_headers)
    shark_id = resp.json()["id"]

    resp = client.delete(f"/sharks/{shark_id}", headers=editor_headers)
    assert resp.status_code == 204

    resp = client.get("/sharks", headers=editor_headers)
    assert resp.json() == []


def test_suggest_name(client, editor_headers):
    resp = client.get("/sharks/suggest-name", headers=editor_headers)
    assert resp.status_code == 200
    assert "name" in resp.json()
    assert isinstance(resp.json()["name"], str)
    assert len(resp.json()["name"]) > 0


def test_search_by_name(client, editor_headers):
    client.post("/sharks", json=_SHARK, headers=editor_headers)
    client.post(
        "/sharks",
        json={"display_name": "Luna", "name_status": "temporary"},
        headers=editor_headers,
    )

    resp = client.get("/sharks?q=herm", headers=editor_headers)
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) == 1
    assert results[0]["display_name"] == "Hermione"


def test_viewer_can_read_sharks(client, viewer_headers):
    resp = client.get("/sharks", headers=viewer_headers)
    assert resp.status_code == 200


def test_viewer_cannot_create_shark(client, viewer_headers):
    resp = client.post("/sharks", json=_SHARK, headers=viewer_headers)
    assert resp.status_code == 403


def test_delete_nonexistent(client, editor_headers):
    resp = client.delete(
        "/sharks/00000000-0000-0000-0000-000000000000",
        headers=editor_headers,
    )
    assert resp.status_code == 404
