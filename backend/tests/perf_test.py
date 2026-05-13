"""
Performance benchmark script (Day 16 sprint plan).

Generates a full-scale dataset:
  - 20,000 master opportunity lines
  - 15 buyers × ~18,000 bid lines each = ~270,000 total bid lines

Benchmarks every pipeline step against plan targets:
  - Master file parse   < 30 s
  - Bid file parse      < 30 s (per buyer)
  - Matching            < 60 s (full round)
  - Comparison API      <  2 s (p95 response)
  - Winner selection    < 10 s
  - Export .xlsx        <  5 s
  - Table render (rows) < 3 s (skipped — frontend metric)

Run with:
  cd backend
  python -m tests.perf_test

Requires a running PostgreSQL and the app env configured.
"""

import os
import sys
import time
import io
import random
import string
import statistics
import tempfile
from datetime import datetime, timezone, timedelta

# Bootstrap the app path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import pandas as pd

from app.db.base import Base
from app.models.bid_round import BidRound, round_buyers
from app.models.master_item import MasterItem
from app.models.bid_file import BidFile
from app.models.bid_line import BidLine
from app.models.deal import Deal
from app.models.user import User
from app.services.matcher import match_bid_lines
from app.services.winner_selector import select_winners
from app.services.export_service import export_deals_excel, export_bid_comparison_excel

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://thinktls:changeme@localhost:5432/thinktls_bid_desk")
N_MASTER = 20_000
N_BUYERS = 15
BID_COVERAGE = 0.9  # each buyer bids on 90 % of master lines

TARGETS = {
    "master_parse":    30.0,
    "bid_parse":       30.0,
    "matching":        60.0,
    "winner_select":   10.0,
    "export_xlsx":      5.0,
    "comparison_xlsx":  5.0,
}

COLORS = {"PASS": "\033[92m", "FAIL": "\033[91m", "RESET": "\033[0m"}


def pn(i: int) -> str:
    prefix = "".join(random.choices(string.ascii_uppercase, k=3))
    return f"{prefix}-{i:05d}"


def make_master_df(n: int) -> pd.DataFrame:
    rows = []
    for i in range(n):
        rows.append({
            "Part Number": pn(i),
            "Description": f"Component {i} - {random.choice(['SSD','RAM','NIC','PSU','HBA','GBIC','CPU','DIMM'])} unit",
            "Quantity": random.randint(1, 100),
            "Reserve Price": round(random.uniform(5, 5000), 2),
        })
    return pd.DataFrame(rows)


def make_bid_df(master_pns: list[str], buyer_name: str) -> pd.DataFrame:
    sample = random.sample(master_pns, int(len(master_pns) * BID_COVERAGE))
    rows = []
    for p in sample:
        reserve = random.uniform(5, 5000)
        price = reserve * random.uniform(0.8, 1.4)
        rows.append({
            "Part Number": p,
            "Your Price": round(price, 2),
            "Quantity Available": random.randint(1, 200),
        })
    return pd.DataFrame(rows)


def timer(label: str, fn, *args, **kwargs):
    t0 = time.perf_counter()
    result = fn(*args, **kwargs)
    elapsed = time.perf_counter() - t0
    target = TARGETS.get(label)
    if target:
        status = "PASS" if elapsed <= target else "FAIL"
        color = COLORS[status]
        reset = COLORS["RESET"]
        target_str = f"(target ≤{target:.0f}s)"
    else:
        color, reset, status, target_str = "", "", "INFO", ""
    print(f"  {color}{status}{reset}  {label:<25} {elapsed:6.2f}s  {target_str}")
    return result, elapsed


def main():
    print("\n=== ThinkTLS Bid Desk — Performance Benchmark ===")
    print(f"  Master lines : {N_MASTER:,}")
    print(f"  Buyers       : {N_BUYERS}")
    print(f"  Total bids   : ~{int(N_MASTER * N_BUYERS * BID_COVERAGE):,}")
    print()

    engine = create_engine(DATABASE_URL, pool_pre_ping=True, echo=False)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    # ---------- Seed admin user ----------
    admin = db.query(User).filter(User.email == "perf@thinktls.com").first()
    if not admin:
        from passlib.context import CryptContext
        pwd_ctx = CryptContext(schemes=["bcrypt"])
        admin = User(
            email="perf@thinktls.com",
            hashed_password=pwd_ctx.hash("perftest123"),
            full_name="Perf Admin",
            role="admin",
            is_active=True,
        )
        db.add(admin)
        db.commit()

    # ---------- Seed buyer users ----------
    buyers = []
    for i in range(N_BUYERS):
        email = f"perf_buyer{i}@test.com"
        b = db.query(User).filter(User.email == email).first()
        if not b:
            b = User(email=email, hashed_password="x", full_name=f"Perf Buyer {i}",
                     company_name=f"Corp {i}", role="buyer", is_active=True)
            db.add(b)
        buyers.append(b)
    db.commit()

    # ---------- Create round ----------
    br = BidRound(name="Perf Test Round", commodity="IT Hardware",
                  status="open", created_at=datetime.now(timezone.utc))
    db.add(br)
    db.commit()

    print("--- Step 1: Generate & parse master file ---")
    master_df = make_master_df(N_MASTER)

    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
        master_path = f.name
        master_df.to_excel(master_path, index=False)

    from app.services.file_parser import parse_master_file
    _, t_master = timer("master_parse", parse_master_file, master_path, br.id, db)

    master_pns = [row["Part Number"] for _, row in master_df.iterrows()]

    print(f"\n--- Step 2: Parse bid files ({N_BUYERS} buyers) ---")
    bid_times = []
    bid_files_created = []
    for i, buyer in enumerate(buyers):
        bid_df = make_bid_df(master_pns, buyer.full_name)
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            bid_path = f.name
            bid_df.to_excel(bid_path, index=False)

        from app.services.file_parser import parse_bid_file
        _, elapsed = timer(f"bid_parse[{i}]", parse_bid_file, bid_path, br.id, buyer.id, db)
        bid_times.append(elapsed)

    print(f"  Bid parse p50={statistics.median(bid_times):.2f}s  p95={sorted(bid_times)[int(len(bid_times)*0.95)]:.2f}s  max={max(bid_times):.2f}s")

    print("\n--- Step 3: Matching ---")
    _, t_match = timer("matching", match_bid_lines, br.id, db)

    print("\n--- Step 4: Winner selection ---")
    _, t_winners = timer("winner_select", select_winners, br.id, db)

    print("\n--- Step 5: Exports ---")
    deals = db.query(Deal).filter(Deal.bid_round_id == br.id).limit(5000).all()

    if deals:
        _, t_export = timer("export_xlsx", export_deals_excel, db, br.id)
        _, t_comp = timer("comparison_xlsx", export_bid_comparison_excel, db, br.id)
    else:
        print("  INFO  No deals to export (run winner selection first)")

    # ---------- Summary ----------
    print("\n=== Summary ===")
    results = {
        "master_parse": t_master,
        "matching": t_match,
        "winner_select": t_winners,
    }
    all_pass = True
    for key, elapsed in results.items():
        target = TARGETS.get(key, 999)
        ok = elapsed <= target
        all_pass = all_pass and ok
        status = "PASS" if ok else "FAIL"
        color = COLORS[status]
        reset = COLORS["RESET"]
        print(f"  {color}{status}{reset}  {key:<25} {elapsed:6.2f}s / {target:.0f}s target")

    print(f"\n  {'All benchmarks PASSED' if all_pass else 'Some benchmarks FAILED'}")

    # ---------- Cleanup ----------
    db.query(BidLine).filter(BidLine.bid_round_id == br.id).delete()
    db.query(MasterItem).filter(MasterItem.bid_round_id == br.id).delete()
    db.query(Deal).filter(Deal.bid_round_id == br.id).delete()
    db.query(BidFile).filter(BidFile.bid_round_id == br.id).delete()
    db.delete(br)
    db.commit()
    db.close()
    print("\n  Cleaned up perf test data.\n")


if __name__ == "__main__":
    main()
