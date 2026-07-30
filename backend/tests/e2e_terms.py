"""Verify offer_terms flows through inline submit -> DB -> my_submission + admin list_bid_files."""
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.user import User
from app.models.bid_round import BidRound
from app.models.master_item import MasterItem
from app.models.bid_file import BidFile
from app.core.security import hash_password
from app.api.routes.buyer import submit_bid_inline, my_submission, InlineBidPayload, InlineBidLine
from app.api.routes.bid_rounds import list_bid_files

fails = []
def check(cond, msg):
    print(("PASS" if cond else "FAIL"), "-", msg)
    if not cond: fails.append(msg)

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(bind=engine)
db = sessionmaker(bind=engine)()

rnd = BidRound(name="R", status="open", commodity="drives")
db.add(rnd); db.commit(); db.refresh(rnd)
buyer = User(email="b@x.com", hashed_password=hash_password("x"), full_name="B", company_name="Bco", role="buyer", is_active=True)
admin = User(email="a@x.com", hashed_password=hash_password("x"), full_name="A", role="admin", is_active=True)
db.add_all([buyer, admin]); db.commit(); db.refresh(buyer)
m = MasterItem(bid_round_id=rnd.id, part_number="PN1", part_number_normalized="pn1", description="d", quantity=5)
db.add(m); db.commit(); db.refresh(m)
db.execute(text("INSERT INTO round_buyers (round_id, buyer_id, invite_status) VALUES (:r,:b,'invited')"),
           {"r": rnd.id, "b": buyer.id})
db.commit()

TERMS = "Will not accept an award lower than $20K.\nAll SSDs must be above 90% health."
payload = InlineBidPayload(
    lines=[InlineBidLine(master_item_id=m.id, part_number="PN1", description="d", unit_price=100.0, quantity=5)],
    offer_terms=TERMS,
)
res = submit_bid_inline(rnd.id, payload, db=db, buyer=buyer)
check("Submitted" in res["message"], "inline submit succeeded")

bf = db.query(BidFile).filter(BidFile.bid_round_id == rnd.id).first()
check(bf.offer_terms == TERMS, f"offer_terms stored: {bf.offer_terms!r}")

sub = my_submission(rnd.id, db=db, buyer=buyer)
check(sub["bid_file"]["offer_terms"] == TERMS, "my_submission returns offer_terms")

admin_files = list_bid_files(rnd.id, db=db, _=admin)
check(admin_files[0]["offer_terms"] == TERMS, "admin list_bid_files returns offer_terms")

# blank terms -> stored as None
payload2 = InlineBidPayload(
    lines=[InlineBidLine(master_item_id=m.id, part_number="PN1", description="d", unit_price=101.0, quantity=5)],
    offer_terms="   ",
)
submit_bid_inline(rnd.id, payload2, db=db, buyer=buyer)
bf2 = db.query(BidFile).filter(BidFile.bid_round_id == rnd.id, BidFile.status == "processed").order_by(BidFile.id.desc()).first()
check(bf2.offer_terms is None, f"blank/whitespace terms -> None (got {bf2.offer_terms!r})")

print()
if fails:
    print(f"❌ {len(fails)} FAILED:"); [print("  -", f) for f in fails]; sys.exit(1)
print("✅ ALL OFFER-TERMS CHECKS PASSED")
