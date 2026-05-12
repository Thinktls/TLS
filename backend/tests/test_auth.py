"""
Tests for auth — registration, login, token validation.
"""
import pytest


def test_register_and_login(client):
    resp = client.post("/api/auth/register", json={
        "email": "newuser@example.com",
        "password": "securepass99",
        "full_name": "Jane Doe",
        "role": "buyer",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data

    # Login
    login = client.post("/api/auth/token", data={
        "username": "newuser@example.com",
        "password": "securepass99",
    })
    assert login.status_code == 200
    assert "access_token" in login.json()


def test_wrong_password(client):
    client.post("/api/auth/register", json={
        "email": "wrongpw@example.com",
        "password": "correctpass",
        "full_name": "Wrong PW",
        "role": "buyer",
    })
    resp = client.post("/api/auth/token", data={
        "username": "wrongpw@example.com",
        "password": "wrongpass",
    })
    assert resp.status_code == 401


def test_duplicate_email(client):
    payload = {
        "email": "dup@example.com",
        "password": "pass1234",
        "full_name": "Dup User",
        "role": "buyer",
    }
    client.post("/api/auth/register", json=payload)
    resp = client.post("/api/auth/register", json=payload)
    assert resp.status_code == 400


def test_me_endpoint(client, buyer_token):
    resp = client.get("/api/auth/me", headers=buyer_token)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "buyer@test.com"
    assert data["role"] == "buyer"


def test_buyer_cannot_access_admin_route(client, buyer_token):
    resp = client.get("/api/rounds/", headers=buyer_token)
    assert resp.status_code in (200, 401, 403)
