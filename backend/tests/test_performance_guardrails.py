"""
Performance regression guardrails — each test encodes a real, measured incident so the
exact same regression fails CI instead of reaching a user.

Thresholds are set well above normal operating numbers (measured inline in each test's
docstring) so the tests stay reliable in CI without becoming flaky, while still catching a
real regression by an order of magnitude.
"""
import time
import asyncio
import io

import openpyxl
import pytest
from sqlalchemy import event

from app.core.security import verify_password, hash_password
from app.core.executors import file_parsing_executor
from app.services.file_parser import parse_master_file
from app.models.bid_round import BidRound
from app.models.bid_file import BidFile
from app.models.bid_line import BidLine
from app.models.master_item import MasterItem
from app.models.deal import Deal
from app.models.user import User
from app.services.export_service import export_disposition_report


# ── Login latency under file-upload contention ─────────────────────────────────
# Incident: asyncio.to_thread() for file parsing shared the same default executor
# login's bcrypt check uses. Measured: 91ms -> 13,581ms under 2 concurrent uploads on a
# small pool. Fix: a dedicated executor (app/core/executors.py) for parsing only.

def _make_xlsx(num_rows: int) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Part Number", "Description", "Quantity", "Reserve Price"])
    for i in range(num_rows):
        ws.append([f"PN-{i:05d}", f"Test Item {i}", 1, 10.0])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_login_latency_unaffected_by_concurrent_file_parsing():
    """Login's bcrypt check must stay fast even while the dedicated file-parsing
    executor is fully saturated by large uploads. Threshold: 2 seconds — normal
    bcrypt latency is under 200ms; the incident this guards against took 13.5s."""
    loop = asyncio.new_event_loop()
    try:
        pw_hash = hash_password("guardrail-test-password")
        big_file = _make_xlsx(2000)

        async def run():
            async def fake_upload():
                await loop.run_in_executor(file_parsing_executor, parse_master_file, big_file, "big.xlsx")

            # Saturate the dedicated parsing pool with concurrent heavy uploads.
            upload_tasks = [asyncio.ensure_future(fake_upload()) for _ in range(3)]
            await asyncio.sleep(0.1)  # let uploads grab the pool's worker threads

            t0 = time.time()
            await asyncio.to_thread(verify_password, "guardrail-test-password", pw_hash)
            login_latency = time.time() - t0

            await asyncio.gather(*upload_tasks)
            return login_latency

        latency = loop.run_until_complete(run())
        assert latency < 2.0, (
            f"Login took {latency:.2f}s while 3 file uploads were parsing concurrently — "
            "this is the thread-pool-contention regression (was measured at 13.5s before "
            "the dedicated executor fix). Check that file parsing still uses "
            "app.core.executors.file_parsing_executor, not asyncio's default executor."
        )
    finally:
        loop.close()


# ── File parsing must never lose or duplicate rows ──────────────────────────────
# Incident: a hidden "rollup" sheet alongside per-tab breakdowns doubled every row;
# unit-level aggregation silently merged distinct units. Both fixed to be exact 1:1.

@pytest.mark.parametrize("num_rows", [7, 100, 537])
def test_file_parsing_preserves_exact_row_count(num_rows):
    content = _make_xlsx(num_rows)
    rows = parse_master_file(content, "guardrail_test.xlsx")
    assert len(rows) == num_rows, (
        f"Uploaded {num_rows} rows but parser returned {len(rows)} — file parsing must "
        "produce an exact 1:1 row count with no silent loss or duplication."
    )
    part_numbers = [r["part_number"] for r in rows]
    assert len(part_numbers) == len(set(part_numbers)), "Duplicate part numbers in parsed output."


# ── Export N+1 query regression ─────────────────────────────────────────────────
# Incident: export_disposition_report queried Deal + BidLine per master item (3 queries
# x N). At 1818 real master items this measured 14.0s. Fixed via batch-fetch up front.

def test_disposition_export_has_no_n_plus_one(db):
    """500 master items + 500 deals must export in well under 1 second if batch-fetched
    correctly. The N+1 version of this code measured 14s at 1818 items (~3.8x this size) —
    a query-per-row regression would push this test from milliseconds to multiple seconds."""
    round_ = BidRound(name="Perf Guardrail Round", commodity="test", status="complete", master_file_uploaded=True)
    db.add(round_)
    db.flush()

    buyer = User(
        email="perfguard@test.com", hashed_password=hash_password("pass"),
        full_name="Perf Guard Buyer", role="buyer", is_active=True,
    )
    db.add(buyer)
    db.flush()

    bid_file = BidFile(
        bid_round_id=round_.id, buyer_id=buyer.id,
        filename="perfguard.xlsx", file_path="/tmp/perfguard.xlsx",
    )
    db.add(bid_file)
    db.flush()

    for i in range(500):
        m = MasterItem(
            bid_round_id=round_.id, part_number=f"PG-{i:04d}", part_number_normalized=f"PG{i:04d}",
            description=f"Item {i}", quantity=1, reserve_price=10.0,
        )
        db.add(m)
        db.flush()
        line = BidLine(
            bid_file_id=bid_file.id, bid_round_id=round_.id, buyer_id=buyer.id,
            master_item_id=m.id, raw_part_number=m.part_number, unit_price=15.0,
            quantity=1, match_status="matched", is_winner=True,
        )
        db.add(line)
        db.flush()
        db.add(Deal(
            bid_round_id=round_.id, master_item_id=m.id, winning_buyer_id=buyer.id,
            winning_bid_line_id=line.id, part_number=m.part_number, description=m.description,
            quantity=1, winning_price=15.0, total_value=15.0, status="approved",
        ))
    db.commit()

    # Count actual SQL statements rather than timing wall-clock: the test DB is in-memory
    # SQLite with near-zero per-query latency, so an N+1 regression here would still
    # complete in milliseconds and a timing-only assertion would never catch it — the real
    # 14s incident only showed up over a real network connection to Postgres. Counting
    # statements detects the O(N) vs O(1) query pattern directly, regardless of DB backend.
    statement_count = 0

    def _count_statements(*args, **kwargs):
        nonlocal statement_count
        statement_count += 1

    event.listen(db.bind, "before_cursor_execute", _count_statements)
    try:
        t0 = time.time()
        data = export_disposition_report(db, round_.id)
        elapsed = time.time() - t0
    finally:
        event.remove(db.bind, "before_cursor_execute", _count_statements)

    assert statement_count < 20, (
        f"Disposition export of 500 master items ran {statement_count} SQL statements — "
        "expected a small constant number regardless of row count. This is the N+1 query "
        "regression (3 queries per master item x 500 = 1500+ before the fix, measured "
        "as 14s against real Postgres at 1818 items). Check export_disposition_report "
        "still batch-fetches deals/bid-lines/buyers before the per-row loop."
    )
    assert len(data) > 0
    assert elapsed < 5.0  # sanity bound even against the slower in-memory SQLite test DB
