"""
Item 57 — auth tests.

Covers login, logout, token enforcement, and role-gating.
"""


def test_login_success(client, admin_user):
    resp = client.post(
        "/auth/login",
        json={"email": "admin@example.com", "password": "adminpass"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["role"] == "admin"
    assert data["email"] == "admin@example.com"


def test_login_wrong_password(client, admin_user):
    resp = client.post(
        "/auth/login",
        json={"email": "admin@example.com", "password": "wrongpassword"},
    )
    assert resp.status_code == 401


def test_login_unknown_email(client):
    resp = client.post(
        "/auth/login",
        json={"email": "nobody@example.com", "password": "anything"},
    )
    assert resp.status_code == 401


def test_logout(client, admin_headers):
    resp = client.post("/auth/logout", headers=admin_headers)
    assert resp.status_code == 204


def test_protected_no_token(client):
    # HTTPBearer returns 401 when Authorization header is absent
    resp = client.get("/locations")
    assert resp.status_code == 401


def test_viewer_blocked_from_mutation(client, viewer_headers):
    resp = client.post(
        "/locations",
        json={"country": "Test", "spot_name": "Spot"},
        headers=viewer_headers,
    )
    assert resp.status_code == 403


def test_editor_allowed_mutation(client, editor_headers):
    resp = client.post(
        "/locations",
        json={"country": "Test", "spot_name": "Spot"},
        headers=editor_headers,
    )
    assert resp.status_code == 201


def test_admin_only_endpoint_viewer(client, viewer_headers):
    resp = client.get("/users", headers=viewer_headers)
    assert resp.status_code == 403


def test_admin_only_endpoint_editor(client, editor_headers):
    resp = client.get("/users", headers=editor_headers)
    assert resp.status_code == 403


def test_admin_only_endpoint_admin(client, admin_headers):
    resp = client.get("/users", headers=admin_headers)
    assert resp.status_code == 200
