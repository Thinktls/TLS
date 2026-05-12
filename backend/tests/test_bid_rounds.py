"""
Tests for bid round CRUD and lifecycle transitions.
"""
import pytest


def test_create_round(client, admin_token):
    resp = client.post("/api/rounds/", json={
        "name": "Test Round 1",
        "commodity": "laptops",
        "reserve_price_enabled": False,
    }, headers=admin_token)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Test Round 1"
    assert data["status"] == "draft"
    assert data["master_file_uploaded"] is False


def test_list_rounds(client, admin_token):
    resp = client.get("/api/rounds/", headers=admin_token)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_get_round_not_found(client, admin_token):
    resp = client.get("/api/rounds/99999", headers=admin_token)
    assert resp.status_code == 404


def test_open_round_without_master_fails(client, admin_token):
    resp = client.post("/api/rounds/", json={
        "name": "No Master Round",
        "commodity": "desktops",
    }, headers=admin_token)
    round_id = resp.json()["id"]
    open_resp = client.post(f"/api/rounds/{round_id}/open", headers=admin_token)
    assert open_resp.status_code == 400
    assert "master file" in open_resp.json()["detail"].lower()


def test_requires_admin_auth(client):
    resp = client.post("/api/rounds/", json={"name": "X", "commodity": "laptops"})
    assert resp.status_code in (401, 403)


def test_round_lifecycle(client, admin_token):
    """draft → open → closed via API."""
    r = client.post("/api/rounds/", json={"name": "Lifecycle Round", "commodity": "networking"}, headers=admin_token)
    round_id = r.json()["id"]

    # Can't open without master file
    assert client.post(f"/api/rounds/{round_id}/open", headers=admin_token).status_code == 400

    # Close while in draft is allowed
    close = client.post(f"/api/rounds/{round_id}/close", headers=admin_token)
    assert close.status_code == 200
    assert close.json()["status"] == "closed"
