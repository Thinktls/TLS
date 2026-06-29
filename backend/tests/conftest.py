"""
Shared test fixtures.
Uses an in-memory SQLite database — no Postgres required for unit tests.
Each test gets a fresh isolated session via nested transactions.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from app.db.base import Base
from app.db.session import get_db
from app.models.user import User
from app.core.security import hash_password
from main import app

TEST_DB_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def clean_tables():
    """Truncate all tables before each test to ensure isolation."""
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
    yield


@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _create_user(db, email, password, role, full_name, company_name=""):
    existing = db.query(User).filter(User.email == email).first()
    if existing:  # guard is valid — StaticPool shares one in-memory DB across fixtures
        return existing
    u = User(
        email=email,
        hashed_password=hash_password(password),
        full_name=full_name,
        company_name=company_name,
        role=role,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture
def admin_token(client, db):
    """Create an admin user directly in DB and log in via /api/auth/login."""
    _create_user(db, "admin@test.com", "testpass123", "admin", "Test Admin")
    resp = client.post("/api/auth/login", json={"email": "admin@test.com", "password": "testpass123"})
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
def buyer_token(client, db):
    """Create a buyer user directly in DB and log in via /api/auth/login."""
    _create_user(db, "buyer@test.com", "testpass123", "buyer", "Test Buyer", "Test Co")
    resp = client.post("/api/auth/login", json={"email": "buyer@test.com", "password": "testpass123"})
    assert resp.status_code == 200, f"Buyer login failed: {resp.text}"
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}
