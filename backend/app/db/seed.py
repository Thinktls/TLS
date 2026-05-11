"""Run once to create the admin user and sample buyers."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.db.session import SessionLocal
from app.models.user import User
from app.core.security import hash_password
from app.core.config import settings


def seed():
    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == settings.ADMIN_EMAIL).first():
            print("Admin already exists — skipping seed.")
            return

        admin = User(
            email=settings.ADMIN_EMAIL,
            hashed_password=hash_password(settings.ADMIN_PASSWORD),
            full_name="ThinkTLS Admin",
            role="admin",
            company_name="ThinkTLS",
        )
        db.add(admin)

        buyers = [
            User(email="buyer1@acme.com", hashed_password=hash_password("buyer123"), full_name="Alice Chen", role="buyer", company_name="Acme Corp", fluff_percentage=3.5),
            User(email="buyer2@techco.com", hashed_password=hash_password("buyer123"), full_name="Bob Martinez", role="buyer", company_name="TechCo", fluff_percentage=4.0),
            User(email="buyer3@globalit.com", hashed_password=hash_password("buyer123"), full_name="Carol Wu", role="buyer", company_name="Global IT", fluff_percentage=3.0),
        ]
        for b in buyers:
            db.add(b)

        db.commit()
        print(f"Seeded admin ({settings.ADMIN_EMAIL}) and {len(buyers)} sample buyers.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
