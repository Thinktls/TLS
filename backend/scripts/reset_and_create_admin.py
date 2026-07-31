"""
One-off production reset: wipe ALL test/operational data (customers, bid rounds, files, lines,
deals, master items, notifications, invites, overrides) and create a single fresh admin login.

This is destructive and irreversible. It is intentionally hard to run by accident:

  * You must pass  --yes-i-am-sure  on the command line, AND
  * set  NEW_ADMIN_PASSWORD  (the password for the new admin).

Optional env:
  NEW_ADMIN_EMAIL      (default: brokers@thinktls.com)
  NEW_ADMIN_NAME       (default: "ThinkTLS Admin")
  NEW_ADMIN_COMPANY    (default: "ThinkTLS")

Run it in the environment that already has DATABASE_URL configured (e.g. the Render shell):

    cd backend && NEW_ADMIN_PASSWORD='...' python -m scripts.reset_and_create_admin --yes-i-am-sure

The schema is left intact — only rows are removed. Alembic migrations are untouched.
"""
import os
import sys

from app.db.session import SessionLocal
from app.core.security import hash_password
from app.models.approval_override import ApprovalOverride
from app.models.deal import Deal
from app.models.bid_line import BidLine
from app.models.bid_file import BidFile
from app.models.master_item import MasterItem
from app.models.invite_token import InviteToken
from app.models.bid_round import BidRound, round_buyers
from app.models.notification import Notification
from app.models.user import User


def main() -> int:
    if "--yes-i-am-sure" not in sys.argv:
        print("Refusing to run without --yes-i-am-sure (this wipes ALL data). Aborting.")
        return 2

    new_email = os.environ.get("NEW_ADMIN_EMAIL", "brokers@thinktls.com").strip().lower()
    new_password = os.environ.get("NEW_ADMIN_PASSWORD", "")
    new_name = os.environ.get("NEW_ADMIN_NAME", "ThinkTLS Admin")
    new_company = os.environ.get("NEW_ADMIN_COMPANY", "ThinkTLS")
    if not new_password:
        print("NEW_ADMIN_PASSWORD is not set — refusing to create an admin with an empty password.")
        return 2

    db = SessionLocal()
    try:
        # Snapshot counts so the operator can confirm what was removed.
        before = {
            "users": db.query(User).count(),
            "bid_rounds": db.query(BidRound).count(),
            "bid_files": db.query(BidFile).count(),
            "bid_lines": db.query(BidLine).count(),
            "deals": db.query(Deal).count(),
            "master_items": db.query(MasterItem).count(),
        }
        print("Before:", before)

        # Delete children before parents to respect foreign keys.
        db.query(ApprovalOverride).delete(synchronize_session=False)
        db.query(Deal).delete(synchronize_session=False)
        db.query(BidLine).delete(synchronize_session=False)
        db.query(BidFile).delete(synchronize_session=False)
        db.query(MasterItem).delete(synchronize_session=False)
        db.execute(round_buyers.delete())
        db.query(InviteToken).delete(synchronize_session=False)
        db.query(BidRound).delete(synchronize_session=False)
        db.query(Notification).delete(synchronize_session=False)
        db.query(User).delete(synchronize_session=False)
        db.commit()

        admin = User(
            email=new_email,
            hashed_password=hash_password(new_password),
            full_name=new_name,
            role="admin",
            company_name=new_company,
            is_active=True,
        )
        db.add(admin)
        db.commit()

        after = {
            "users": db.query(User).count(),
            "bid_rounds": db.query(BidRound).count(),
            "bid_files": db.query(BidFile).count(),
            "bid_lines": db.query(BidLine).count(),
            "deals": db.query(Deal).count(),
            "master_items": db.query(MasterItem).count(),
        }
        print("After: ", after)
        print(f"\n✅ Reset complete. New admin: {new_email} (role=admin). All test data cleared.")
        return 0
    except Exception as exc:
        db.rollback()
        print(f"❌ Reset failed, rolled back: {type(exc).__name__}: {exc}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
