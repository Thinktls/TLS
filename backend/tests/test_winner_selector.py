"""
Comprehensive unit tests for the winner selection engine.
Covers: normal winner, reserve floor, tiebreak, anomaly detection, fluff engine.
"""
import pytest
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock
from app.models.bid_line import BidLine
from app.models.master_item import MasterItem
from app.models.bid_file import BidFile
from app.models.bid_round import BidRound
from app.models.user import User
from app.models.deal import Deal
from app.services.winner_selector import select_winners
from app.core.security import hash_password


def _make_round(db):
    r = BidRound(name="WS Round", commodity="servers", status="closed", master_file_uploaded=True)
    db.add(r)
    db.flush()
    return r


def _make_buyer(db, email="buyer@test.com", fluff=3.5):
    u = User(
        email=email,
        hashed_password=hash_password("pass"),
        full_name="Test Buyer",
        role="buyer",
        is_active=True,
        
        fluff_percentage=fluff,
        fluff_enabled=True,
    )
    db.add(u)
    db.flush()
    return u


def _make_master(db, round_id, pn="PART-001", qty=10, reserve=None):
    m = MasterItem(
        bid_round_id=round_id,
        part_number=pn,
        part_number_normalized=pn.lower().replace("-", ""),
        description="Test Part",
        quantity=qty,
        reserve_price=reserve,
    )
    db.add(m)
    db.flush()
    return m


def _make_bid_file(db, round_id, buyer_id, uploaded_at=None):
    bf = BidFile(
        bid_round_id=round_id,
        buyer_id=buyer_id,
        filename="test.csv",
        file_path="/tmp/t.csv",
        status="processed",
        uploaded_at=uploaded_at or datetime(2025, 1, 1, tzinfo=timezone.utc),
    )
    db.add(bf)
    db.flush()
    return bf


def _make_line(db, bid_file, round_id, buyer_id, master_id, price, qty=10):
    line = BidLine(
        bid_file_id=bid_file.id,
        bid_round_id=round_id,
        buyer_id=buyer_id,
        master_item_id=master_id,
        raw_part_number="PART-001",
        normalized_part_number="part001",
        unit_price=price,
        quantity=qty,
        match_status="matched",
        match_method="exact",
    )
    db.add(line)
    db.flush()
    return line


# ── Tests ──────────────────────────────────────────────────────────────────────

def test_highest_price_wins(db):
    r = _make_round(db)
    b1 = _make_buyer(db, "buyer1@test.com")
    b2 = _make_buyer(db, "buyer2@test.com")
    master = _make_master(db, r.id)

    bf1 = _make_bid_file(db, r.id, b1.id)
    bf2 = _make_bid_file(db, r.id, b2.id)
    _make_line(db, bf1, r.id, b1.id, master.id, 100.0)
    _make_line(db, bf2, r.id, b2.id, master.id, 150.0)  # should win
    db.commit()

    deals = select_winners(db, r.id)
    assert len(deals) == 1
    assert deals[0].winning_buyer_id == b2.id
    assert deals[0].winning_price == 150.0


def test_reserve_price_floor_excludes_low_bids(db):
    r = _make_round(db)
    b1 = _make_buyer(db, "reservebuyer@test.com")
    master = _make_master(db, r.id, reserve=200.0)

    bf1 = _make_bid_file(db, r.id, b1.id)
    _make_line(db, bf1, r.id, b1.id, master.id, 100.0)  # below reserve
    db.commit()

    deals = select_winners(db, r.id)
    assert len(deals) == 0


def test_reserve_price_only_valid_bids_compete(db):
    r = _make_round(db)
    b1 = _make_buyer(db, "r1@test.com")
    b2 = _make_buyer(db, "r2@test.com")
    master = _make_master(db, r.id, reserve=100.0)

    bf1 = _make_bid_file(db, r.id, b1.id)
    bf2 = _make_bid_file(db, r.id, b2.id)
    _make_line(db, bf1, r.id, b1.id, master.id, 80.0)   # below reserve → excluded
    _make_line(db, bf2, r.id, b2.id, master.id, 120.0)  # valid
    db.commit()

    deals = select_winners(db, r.id)
    assert len(deals) == 1
    assert deals[0].winning_buyer_id == b2.id


def test_tiebreak_uses_earliest_upload(db):
    r = _make_round(db)
    b1 = _make_buyer(db, "tie1@test.com")
    b2 = _make_buyer(db, "tie2@test.com")
    master = _make_master(db, r.id)

    early = datetime(2025, 1, 1, 8, 0, tzinfo=timezone.utc)
    late  = datetime(2025, 1, 1, 10, 0, tzinfo=timezone.utc)

    bf1 = _make_bid_file(db, r.id, b1.id, uploaded_at=late)
    bf2 = _make_bid_file(db, r.id, b2.id, uploaded_at=early)  # earlier → wins tie
    _make_line(db, bf1, r.id, b1.id, master.id, 100.0)
    _make_line(db, bf2, r.id, b2.id, master.id, 100.0)
    db.commit()

    deals = select_winners(db, r.id)
    assert len(deals) == 1
    assert deals[0].winning_buyer_id == b2.id


def test_fluff_engine_applied_to_losers(db):
    r = _make_round(db)
    b1 = _make_buyer(db, "fluff1@test.com", fluff=5.0)
    b2 = _make_buyer(db, "fluff2@test.com", fluff=3.0)
    master = _make_master(db, r.id)

    bf1 = _make_bid_file(db, r.id, b1.id)
    bf2 = _make_bid_file(db, r.id, b2.id)
    _make_line(db, bf1, r.id, b1.id, master.id, 200.0)  # winner
    loser_line = _make_line(db, bf2, r.id, b2.id, master.id, 150.0)
    db.commit()

    select_winners(db, r.id)
    db.refresh(loser_line)
    # fluff for b2: 200 * (1 + 3/100) = 206.0
    assert loser_line.fluffed_loss_price == pytest.approx(206.0, abs=0.01)


def test_anomaly_detection_zscore(db):
    r = _make_round(db)
    buyers = [_make_buyer(db, f"anm{i}@test.com") for i in range(4)]
    master = _make_master(db, r.id)

    prices = [1000.0, 980.0, 1020.0, 5.0]  # last one is anomalously low (triggers < mean * 0.2)
    lines = []
    for buyer, price in zip(buyers, prices):
        bf = _make_bid_file(db, r.id, buyer.id)
        lines.append(_make_line(db, bf, r.id, buyer.id, master.id, price))
    db.commit()

    select_winners(db, r.id)
    for line in lines:
        db.refresh(line)

    anomaly_line = [l for l in lines if l.unit_price == 5.0][0]
    assert anomaly_line.is_anomaly == True

    # The reason shown to the admin must be plain English — no statistics jargon — and must
    # name the flagged price and the likely cause so it's understandable at a glance.
    note = anomaly_line.exception_notes or ""
    assert "$5.00" in note
    assert "typical bid" in note.lower() or "lower than" in note.lower()
    for jargon in ("z-score", "z score", "std-dev", "standard deviation", "median $"):
        assert jargon not in note.lower(), f"Anomaly note still contains jargon: {jargon!r} -> {note}"


def test_no_bids_no_deal(db):
    r = _make_round(db)
    _make_master(db, r.id)
    db.commit()

    deals = select_winners(db, r.id)
    assert deals == []


def test_deal_total_value_calculated(db):
    r = _make_round(db)
    buyer = _make_buyer(db, "tv@test.com")
    master = _make_master(db, r.id, qty=5)

    bf = _make_bid_file(db, r.id, buyer.id)
    _make_line(db, bf, r.id, buyer.id, master.id, 100.0, qty=5)
    db.commit()

    deals = select_winners(db, r.id)
    assert len(deals) == 1
    assert deals[0].total_value == pytest.approx(500.0, abs=0.01)
    assert deals[0].quantity == 5
