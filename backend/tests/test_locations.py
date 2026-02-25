"""
Item 57 — location CRUD tests.

lat/lon are optional in LocationCreate but bounded (ge/le) when provided.
"""

_LOC = {"country": "Australia", "spot_name": "Coral Bay", "lat": -23.0, "lon": 113.0}


def test_create_location(client, editor_headers):
    resp = client.post("/locations", json=_LOC, headers=editor_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["spot_name"] == "Coral Bay"
    assert data["country"] == "Australia"
    assert "id" in data


def test_list_locations(client, editor_headers):
    client.post("/locations", json=_LOC, headers=editor_headers)
    resp = client.get("/locations", headers=editor_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_update_location(client, editor_headers):
    resp = client.post("/locations", json=_LOC, headers=editor_headers)
    loc_id = resp.json()["id"]

    resp = client.put(
        f"/locations/{loc_id}",
        json={"spot_name": "New Spot"},
        headers=editor_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["spot_name"] == "New Spot"


def test_delete_location(client, editor_headers):
    resp = client.post("/locations", json=_LOC, headers=editor_headers)
    loc_id = resp.json()["id"]

    resp = client.delete(f"/locations/{loc_id}", headers=editor_headers)
    assert resp.status_code == 204

    resp = client.get("/locations", headers=editor_headers)
    assert resp.json() == []


def test_lat_out_of_range(client, editor_headers):
    body = {**_LOC, "lat": 91.0}
    resp = client.post("/locations", json=body, headers=editor_headers)
    assert resp.status_code == 422


def test_lon_out_of_range(client, editor_headers):
    body = {**_LOC, "lon": 181.0}
    resp = client.post("/locations", json=body, headers=editor_headers)
    assert resp.status_code == 422


def test_search_by_name(client, editor_headers):
    client.post("/locations", json=_LOC, headers=editor_headers)
    client.post(
        "/locations",
        json={"country": "Maldives", "spot_name": "Blue Hole"},
        headers=editor_headers,
    )

    resp = client.get("/locations?q=coral", headers=editor_headers)
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) == 1
    assert results[0]["spot_name"] == "Coral Bay"


def test_search_by_country(client, editor_headers):
    client.post("/locations", json=_LOC, headers=editor_headers)
    client.post(
        "/locations",
        json={"country": "Maldives", "spot_name": "Blue Hole"},
        headers=editor_headers,
    )

    resp = client.get("/locations?q=maldives", headers=editor_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["country"] == "Maldives"


def test_delete_nonexistent(client, editor_headers):
    resp = client.delete(
        "/locations/00000000-0000-0000-0000-000000000000",
        headers=editor_headers,
    )
    assert resp.status_code == 404
