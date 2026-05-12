"""
Shared test fixtures.
Uses an in-memory SQLite database — no Postgres required for unit tests.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.db.base import Base
from app.db.session import get_db
from main import app

TEST_DB_URL = "sqlite:///./test.db"

engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def admin_token(client):
    """Register and log in an admin user, return Authorization header."""
    client.post("/api/auth/register", json={
        "email": "admin@test.com",
        "password": "testpass123",
        "full_name": "Test Admin",
        "role": "admin",
    })
    resp = client.post("/api/auth/token", data={"username": "admin@test.com", "password": "testpass123"})
    token = resp.json().get("access_token", "")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def buyer_token(client):
    """Register and log in a buyer user, return Authorization header."""
    client.post("/api/auth/register", json={
        "email": "buyer@test.com",
        "password": "testpass123",
        "full_name": "Test Buyer",
        "company_name": "Test Co",
        "role": "buyer",
    })
    resp = client.post("/api/auth/token", data={"username": "buyer@test.com", "password": "testpass123"})
    token = resp.json().get("access_token", "")
    return {"Authorization": f"Bearer {token}"}
