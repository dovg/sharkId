"""
Item 57 — user management tests (admin-only /users endpoints).
"""
import pytest


# ── list ──────────────────────────────────────────────────────────────────────


def test_admin_list_users(client, admin_headers, admin_user):
    resp = client.get("/users", headers=admin_headers)
    assert resp.status_code == 200
    users = resp.json()
    assert isinstance(users, list)
    assert any(u["email"] == "admin@example.com" for u in users)


def test_editor_cannot_list_users(client, editor_headers):
    resp = client.get("/users", headers=editor_headers)
    assert resp.status_code == 403


def test_viewer_cannot_list_users(client, viewer_headers):
    resp = client.get("/users", headers=viewer_headers)
    assert resp.status_code == 403


# ── create ────────────────────────────────────────────────────────────────────


def test_admin_create_user(client, admin_headers):
    resp = client.post(
        "/users",
        json={"email": "new@example.com", "password": "newpass123", "role": "editor"},
        headers=admin_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "new@example.com"
    assert data["role"] == "editor"
    assert "password_hash" not in data


def test_create_user_duplicate_email(client, admin_headers, admin_user):
    resp = client.post(
        "/users",
        json={"email": "admin@example.com", "password": "pass", "role": "viewer"},
        headers=admin_headers,
    )
    assert resp.status_code == 409


def test_create_user_invalid_role(client, admin_headers):
    resp = client.post(
        "/users",
        json={"email": "x@example.com", "password": "pass", "role": "superuser"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


# ── update ────────────────────────────────────────────────────────────────────


def test_admin_update_role(client, admin_headers, editor_user):
    resp = client.put(
        f"/users/{editor_user.id}",
        json={"role": "viewer"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "viewer"


def test_admin_reset_password(client, admin_headers, editor_user):
    resp = client.put(
        f"/users/{editor_user.id}",
        json={"password": "newpassword456"},
        headers=admin_headers,
    )
    assert resp.status_code == 200


# ── delete ────────────────────────────────────────────────────────────────────


def test_admin_delete_user(client, admin_headers, editor_user):
    resp = client.delete(f"/users/{editor_user.id}", headers=admin_headers)
    assert resp.status_code == 204

    # Verify user no longer appears in list
    users = client.get("/users", headers=admin_headers).json()
    assert not any(u["email"] == "editor@example.com" for u in users)


def test_admin_self_delete_returns_409(client, admin_headers, admin_user):
    resp = client.delete(f"/users/{admin_user.id}", headers=admin_headers)
    assert resp.status_code == 409


# ── /users/me ─────────────────────────────────────────────────────────────────


def test_get_me_admin(client, admin_headers, admin_user):
    resp = client.get("/users/me", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "admin@example.com"
    assert resp.json()["role"] == "admin"


def test_get_me_viewer(client, viewer_headers, viewer_user):
    resp = client.get("/users/me", headers=viewer_headers)
    assert resp.status_code == 200
    assert resp.json()["role"] == "viewer"
