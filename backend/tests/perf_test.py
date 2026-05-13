"""
Performance benchmark script (Day 16 sprint plan).

Generates a full-scale dataset:
  - 20,000 master opportunity lines
  - 15 buyers × ~18,000 bid lines each = ~270,000 total bid lines

Benchmarks every pipeline step against plan targets:
  - Master file parse   < 30 s
  - Bid file parse      < 30 s (per buyer, p95)
  - Matching            < 60 s (full round)
  - Winner selection    < 10 s
  - Export .xlsx        <  5 s

Run with:
  cd backend
  python -m tests.perf_test

Requires a running PostgreSQL and the app env configured (DATABASE_URL).
"""

import os
import sys
import time
import io
import random
import string
import statistics
import tempfile
from datetime import datetime, timezone

# Bootstrap app path so imports work when run as a module
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import pandas as pd

from app.db.base import Base
from app.models.bid_round import BidRound
from app.models.master_item import MasterItem
from app.models.bid_file import BidFile
from app.models.bid_line import BidLine
from app.models.deal import Deal
from app.models.user import User

# These are imported lazily inside main() to avoid import-time side effects
# from app.services.file_parser import parse_master_file, parse_buyer_file
# from app.services.matcher import match_bid_lines
# from app.services.winner_selector import select_winners
# from app.services.export_service import export_deals_excel, export_bid_comparison_excel

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://thinktls:changeme@localhost:5432/thinktls_bid_desk")
N_MASTER = 20_000
N_BUYERS = 15
BID_COVERAGE = 0.9  # each buyer bids on 90 % of master lines

TARGETS = {
    "master_parse":    30.0,
    "bid_parse_p95":   30.0,
    "matching":        60.0,
    "winner_select":   10.0,
    "export_xlsx":      5.0,
    "comparison_xlsx":  5.0,
}

COLORS = {"PASS": "\033[92m", "FAIL": "\033[91m", "INFO": "", "RESET": "\033[0m"}


# ── Data generators ──────────────────────────────────────────────────────────

def _rnd_pn(i: int) -> str:
    prefix = "".join(random.choices(string.ascii_uppercase, k=3))
    return f"{prefix}-{i:05d}"


def make_master_df(n: int) -> pd.DataFrame:
    categories = ["SSD", "RAM", "NIC", "PSU", "HBA", "GBIC", "CPU", "DIMM"]
    rows = [
        {
            "Part Number": _rnd_pn(i),
            "Description": f"Component {i} - {random.choice(categories)} unit",
            "Quantity": random.randint(1, 100),
            "Reserve Price": round(random.uniform(5.0, 5000.0), 2),
        }
        for i in range(n)
    ]
    return pd.DataFrame(rows)


def make_bid_df(master_pns: list[str]) -> pd.DataFrame:
    sample = random.sample(master_pns, int(len(master_pns) * BID_COVERAGE))
    rows = [
        {
            "Part Number": p,
            "Your Price": round(random.uniform(5.0, 5000.0) * random.uniform(0.8, 1.4), 2),
            "Quantity Available": random.randint(1, 200),
        }
        for p in sample
    ]
    return pd.DataFrame(rows)


# ── Timer helper ─────────────────────────────────────────────────────────────

def timer(label: str, fn, *args, **kwargs):
    t0 = time.perf_counter()
    result = fn(*args, **kwargs)
    elapsed = time.perf_counter() - t0
    target = TARGETS.get(label)
    if target:
        ok = elapsed <= target
        status = "PASS" if ok else "FAIL"
        color = COLORS[status]
        reset = COLORS["RESET"]
        print(f"  {color}{status}{reset}  {label:<25} {elapsed:6.2f}s  (target ≤{target:.0f}s)")
    else:
        print(f"  INFO   {label:<25} {elapsed:6.2f}s")
    return result, elapsed


# ── Pipeline helpers ──────────────────────────────────────────────────────────

def _df_to_bytes(df: pd.DataFrame, suffix: str = ".xlsx") -> tuple[bytes, str]:
    """Serialise a DataFrame to bytes in the given format, return (bytes, filename)."""
    buf = io.BytesIO()
    if suffix == ".xlsx":
        df.to_excel(buf, index=False)
        fname = "file.xlsx"
    else:
        df.to_csv(buf, index=False)
        fname = "file.csv"
    buf.seek(0)
    return buf.read(), fname


def _insert_master_items(db, round_id: int, rows: list[dict]) -> list[MasterItem]:
    items = [MasterItem(bid_round_id=round_id, **row) for row in rows]
    db.bulk_save_objects(items)
    db.commit()
    return db.query(MasterItem).filter(MasterItem.bid_round_id == round_id).all()


def _insert_bid_lines(
    db,
    round_id: int,
    buyer: User,
    rows: list[dict],
    upload_offset_seconds: int = 0,
) -> BidFile:
    """Create a BidFile record and all its BidLine children for one buyer."""
    uploaded_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    # Slight offset so tiebreaker ordering is deterministic across buyers
    from datetime import timedelta
    uploaded_at = uploaded_at + timedelta(seconds=upload_offset_seconds)

    bid_file = BidFile(
        bid_round_id=round_id,
        buyer_id=buyer.id,
        filename=f"bid_{buyer.id}.xlsx",
        file_path=f"/tmp/perf_{round_id}_{buyer.id}.xlsx",
        file_size_bytes=1024,
        status="processed",
        lines_parsed=len(rows),
        uploaded_at=uploaded_at,
    )
    db.add(bid_file)
    db.flush()  # populate bid_file.id

    lines = [
        BidLine(
            bid_file_id=bid_file.id,
            bid_round_id=round_id,
            buyer_id=buyer.id,
            raw_part_number=row["raw_part_number"],
            normalized_part_number=row["normalized_part_number"],
            description=row.get("description"),
            unit_price=row.get("unit_price"),
            quantity=row.get("quantity", 1),
            total_price=row.get("total_price"),
            match_status="pending",
            row_number=row.get("row_number"),
        )
        for row in rows
    ]
    db.bulk_save_objects(lines)
    db.commit()
    return bid_file


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    from app.services.file_parser import parse_master_file, parse_buyer_file
    from app.services.matcher import match_bid_lines
    from app.services.winner_selector import select_winners
    from app.services.export_service import export_deals_excel, export_bid_comparison_excel

    print("\n=== ThinkTLS Bid Desk — Performance Benchmark ===")
    print(f"  Master lines  : {N_MASTER:,}")
    print(f"  Buyers        : {N_BUYERS}")
    print(f"  Total bids    : ~{int(N_MASTER * N_BUYERS * BID_COVERAGE):,}")
    print()

    engine = create_engine(DATABASE_URL, pool_pre_ping=True, echo=False)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    # ── Seed users ──────────────────────────────────────────────────────────
    admin = db.query(User).filter(User.email == "perf@thinktls.com").first()
    if not admin:
        from passlib.context import CryptContext
        admin = User(
            email="perf@thinktls.com",
            hashed_password=CryptContext(schemes=["bcrypt"]).hash("perftest"),
            full_name="Perf Admin",
            role="admin",
            is_active=True,
        )
        db.add(admin)
        db.commit()

    buyers: list[User] = []
    for i in range(N_BUYERS):
        email = f"perf_buyer{i}@test.com"
        b = db.query(User).filter(User.email == email).first()
        if not b:
            b = User(
                email=email,
                hashed_password="x",
                full_name=f"Perf Buyer {i}",
                company_name=f"Corp {i}",
                role="buyer",
                is_active=True,
            )
            db.add(b)
    db.commit()
    buyers = db.query(User).filter(User.role == "buyer", User.email.like("perf_buyer%@test.com")).all()

    # ── Create round ─────────────────────────────────────────────────────────
    br = BidRound(
        name="Perf Test Round",
        commodity="IT Hardware",
        status="closed",
        created_at=datetime.now(timezone.utc),
    )
    db.add(br)
    db.commit()

    # ── Step 1: Master file parse ─────────────────────────────────────────────
    print("--- Step 1: Master file parse ---")
    master_df = make_master_df(N_MASTER)
    master_bytes, master_fname = _df_to_bytes(master_df, ".xlsx")

    def _parse_and_insert_master():
        rows = parse_master_file(master_bytes, master_fname)
        assert len(rows) == N_MASTER, f"Expected {N_MASTER} rows, got {len(rows)}"
        _insert_master_items(db, br.id, rows)
        return rows

    parsed_master, t_master = timer("master_parse", _parse_and_insert_master)
    master_pns = [r["part_number"] for r in parsed_master]

    # ── Step 2: Bid file parse (per buyer) ───────────────────────────────────
    print(f"\n--- Step 2: Bid file parse ({N_BUYERS} buyers) ---")
    bid_times: list[float] = []

    for i, buyer in enumerate(buyers):
        bid_df = make_bid_df(master_pns)
        bid_bytes, bid_fname = _df_to_bytes(bid_df, ".xlsx")

        def _parse_and_insert_bid(b=buyer, bb=bid_bytes, bf=bid_fname, offset=i):
            rows = parse_buyer_file(bb, bf)
            assert len(rows) > 0, f"Buyer {b.id}: no rows parsed"
            _insert_bid_lines(db, br.id, b, rows, upload_offset_seconds=offset * 10)
            return rows

        _, elapsed = timer(f"bid_parse[{i}]", _parse_and_insert_bid)
        bid_times.append(elapsed)

    p95_idx = max(0, int(len(bid_times) * 0.95) - 1)
    p95 = sorted(bid_times)[p95_idx]
    p50 = statistics.median(bid_times)
    print(f"  Bid parse p50={p50:.2f}s  p95={p95:.2f}s  max={max(bid_times):.2f}s")
    # Evaluate p95 against target
    p95_ok = p95 <= TARGETS["bid_parse_p95"]
    print(f"  {'PASS' if p95_ok else 'FAIL'}  bid_parse_p95               {p95:6.2f}s  (target ≤{TARGETS['bid_parse_p95']:.0f}s)")

    # ── Step 3: Matching ─────────────────────────────────────────────────────
    print("\n--- Step 3: Matching ---")
    master_items = db.query(MasterItem).filter(MasterItem.bid_round_id == br.id).all()
    bid_lines = (
        db.query(BidLine)
        .filter(BidLine.bid_round_id == br.id, BidLine.match_status == "pending")
        .all()
    )
    print(f"  Loaded {len(master_items):,} master items, {len(bid_lines):,} bid lines")

    def _run_match():
        match_bid_lines(bid_lines, master_items)
        db.commit()

    _, t_match = timer("matching", _run_match)

    # ── Step 4: Winner selection ─────────────────────────────────────────────
    print("\n--- Step 4: Winner selection ---")

    def _run_winners():
        return select_winners(db, br.id)

    deals, t_winners = timer("winner_select", _run_winners)
    print(f"  Created {len(deals):,} deals")

    # ── Step 5: Exports ───────────────────────────────────────────────────────
    print("\n--- Step 5: Exports ---")
    deal_count = db.query(Deal).filter(Deal.bid_round_id == br.id).count()
    if deal_count > 0:
        _, t_export = timer("export_xlsx", export_deals_excel, db, br.id)
        _, t_comp   = timer("comparison_xlsx", export_bid_comparison_excel, db, br.id)
    else:
        print("  INFO  No deals — skipping export benchmark")
        t_export = t_comp = 0.0

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n=== Summary ===")
    results = {
        "master_parse":    (t_master,  TARGETS["master_parse"]),
        "bid_parse_p95":   (p95,       TARGETS["bid_parse_p95"]),
        "matching":        (t_match,   TARGETS["matching"]),
        "winner_select":   (t_winners, TARGETS["winner_select"]),
        "export_xlsx":     (t_export,  TARGETS["export_xlsx"]),
        "comparison_xlsx": (t_comp,    TARGETS["comparison_xlsx"]),
    }
    all_pass = True
    for key, (elapsed, target) in results.items():
        if elapsed == 0.0:
            continue
        ok = elapsed <= target
        all_pass = all_pass and ok
        status = "PASS" if ok else "FAIL"
        color = COLORS[status]
        reset = COLORS["RESET"]
        print(f"  {color}{status}{reset}  {key:<25} {elapsed:6.2f}s / {target:.0f}s target")

    verdict = "All benchmarks PASSED" if all_pass else "Some benchmarks FAILED"
    color = COLORS["PASS"] if all_pass else COLORS["FAIL"]
    print(f"\n  {color}{verdict}{COLORS['RESET']}")

    # ── Cleanup ───────────────────────────────────────────────────────────────
    db.query(BidLine).filter(BidLine.bid_round_id == br.id).delete()
    db.query(MasterItem).filter(MasterItem.bid_round_id == br.id).delete()
    db.query(Deal).filter(Deal.bid_round_id == br.id).delete()
    db.query(BidFile).filter(BidFile.bid_round_id == br.id).delete()
    db.delete(br)
    db.commit()
    db.close()
    print("\n  Perf test data cleaned up.\n")


if __name__ == "__main__":
    main()
