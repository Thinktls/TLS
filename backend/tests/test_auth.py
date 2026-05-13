"""
Tests for auth — login, token validation, rate limiting, forgot-password.
"""
from tests.conftest import _create_user


def test_login_success(client, db):
    _create_user(db, "logintest@example.com", "securepass99", "buyer", "Login Test")
    resp = client.post("/api/auth/login", json={"email": "logintest@example.com", "password": "securepass99"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["role"] == "buyer"


def test_wrong_password(client, db):
    _create_user(db, "wrongpw@example.com", "correctpass", "buyer", "Wrong PW")
    resp = client.post("/api/auth/login", json={"email": "wrongpw@example.com", "password": "wrongpass"})
    assert resp.status_code == 401


def test_unknown_email_rejected(client):
    resp = client.post("/api/auth/login", json={"email": "nobody@nowhere.com", "password": "whatever"})
    assert resp.status_code == 401


def test_me_endpoint(client, buyer_token):
    resp = client.get("/api/auth/me", headers=buyer_token)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "buyer@test.com"
    assert data["role"] == "buyer"


def test_me_requires_auth(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code in (401, 403)


def test_buyer_cannot_create_buyer(client, buyer_token):
    resp = client.post("/api/auth/buyers", json={
        "email": "newbuyer@test.com",
        "password": "pass1234",
        "full_name": "New Buyer",
        "company_name": "ACME",
        "role": "buyer",
    }, headers=buyer_token)
    assert resp.status_code in (401, 403)


def test_forgot_password_always_200(client):
    resp = client.post("/api/auth/forgot-password", json={"email": "nonexistent@nowhere.com"})
    assert resp.status_code == 200
    assert "message" in resp.json()


def test_reset_password_invalid_token(client):
    resp = client.post("/api/auth/reset-password", json={"token": "invalid-token-xyz", "new_password": "newpass123"})
    assert resp.status_code == 400


def test_reset_password_too_short(client):
    resp = client.post("/api/auth/reset-password", json={"token": "any-token", "new_password": "short"})
    assert resp.status_code == 400
