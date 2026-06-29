"""
Tests for part-number normalization and the three-tier matching pipeline.
"""
import pytest
from app.services.normalizer import normalize_part_number, normalize_description
from app.services.matcher import match_bid_lines


# ── Normalizer tests ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw,expected", [
    ("ABC-001", "ABC001"),
    ("abc-001", "ABC001"),
    ("ABC 001", "ABC001"),
    ("ABC.001", "ABC001"),
    ("ABC#001", "ABC001"),
    ("ABC_001", "ABC001"),
    ("ABC/001", "ABC001"),
    (" ABC-001 ", "ABC001"),
    ("", ""),
    ("123", "123"),
    ("A B C - 0 0 1", "ABC001"),
])
def test_normalize_part_number(raw, expected):
    assert normalize_part_number(raw) == expected


@pytest.mark.parametrize("raw,expected", [
    ("Dell  Laptop", "dell laptop"),
    ("DELL LAPTOP", "dell laptop"),
    ("  spaces  ", "spaces"),
    ("", ""),
])
def test_normalize_description(raw, expected):
    assert normalize_description(raw) == expected


# ── Matcher tests ───────────────────────────────────────────────────────────────

def _make_master_items(db, round_id):
    from app.models.master_item import MasterItem
    # part_number_normalized must match what normalize_part_number() returns (UPPERCASE, stripped)
    items = [
        MasterItem(bid_round_id=round_id, part_number="ABC-001", part_number_normalized="ABC001", description="Server CPU", quantity=5),
        MasterItem(bid_round_id=round_id, part_number="DEF-002", part_number_normalized="DEF002", description="Server RAM", quantity=10),
        MasterItem(bid_round_id=round_id, part_number="GHI-003", part_number_normalized="GHI003", description="Laptop Battery", quantity=2),
    ]
    for i in items:
        db.add(i)
    db.flush()
    return items


def _make_bid_file(db, round_id, buyer_id):
    from app.models.bid_file import BidFile
    bf = BidFile(bid_round_id=round_id, buyer_id=buyer_id, filename="bids.csv", file_path="/tmp/b.csv", status="uploaded")
    db.add(bf)
    db.flush()
    return bf


def _make_buyer(db, email="matcher@test.com"):
    from app.models.user import User
    from app.core.security import hash_password
    u = User(email=email, hashed_password=hash_password("pass"), full_name="Matcher Buyer", role="buyer", is_active=True)
    db.add(u)
    db.flush()
    return u


def _make_round(db):
    from app.models.bid_round import BidRound
    r = BidRound(name="Match Round", commodity="parts", status="open", master_file_uploaded=True)
    db.add(r)
    db.flush()
    return r


def _make_bid_lines(db, bf, round_id, buyer_id, master_items, lines_data):
    from app.models.bid_line import BidLine
    created = []
    for raw_pn, price in lines_data:
        from app.services.normalizer import normalize_part_number
        line = BidLine(
            bid_file_id=bf.id,
            bid_round_id=round_id,
            buyer_id=buyer_id,
            raw_part_number=raw_pn,
            normalized_part_number=normalize_part_number(raw_pn),
            unit_price=price,
            quantity=1,
            match_status="pending",
        )
        db.add(line)
        created.append(line)
    db.flush()
    return created


def test_exact_match(db):
    r = _make_round(db)
    buyer = _make_buyer(db)
    masters = _make_master_items(db, r.id)
    bf = _make_bid_file(db, r.id, buyer.id)
    lines = _make_bid_lines(db, bf, r.id, buyer.id, masters, [("ABC-001", 100.0)])
    db.commit()

    match_bid_lines(lines, masters)

    assert lines[0].match_status == "matched"
    assert lines[0].match_method == "exact"
    assert lines[0].master_item_id == masters[0].id


def test_fuzzy_match(db):
    r = _make_round(db)
    buyer = _make_buyer(db, "fuzzy@test.com")
    masters = _make_master_items(db, r.id)
    bf = _make_bid_file(db, r.id, buyer.id)
    lines = _make_bid_lines(db, bf, r.id, buyer.id, masters, [("ABC001X", 100.0)])
    db.commit()

    match_bid_lines(lines, masters)

    # Should be matched (fuzzy) or flagged as exception — never left as pending
    assert lines[0].match_status in ("matched", "exception", "flagged")


def test_no_match_becomes_exception(db):
    r = _make_round(db)
    buyer = _make_buyer(db, "nomatch@test.com")
    masters = _make_master_items(db, r.id)
    bf = _make_bid_file(db, r.id, buyer.id)
    lines = _make_bid_lines(db, bf, r.id, buyer.id, masters, [("ZZZZZ-999", 50.0)])
    db.commit()

    match_bid_lines(lines, masters)

    assert lines[0].match_status == "exception"
    assert lines[0].exception_type == "unmatched"


def test_multiple_lines_matched(db):
    r = _make_round(db)
    buyer = _make_buyer(db, "multi@test.com")
    masters = _make_master_items(db, r.id)
    bf = _make_bid_file(db, r.id, buyer.id)
    lines = _make_bid_lines(db, bf, r.id, buyer.id, masters, [
        ("ABC-001", 100.0),
        ("DEF-002", 200.0),
        ("UNKNOWN-999", 50.0),
    ])
    db.commit()

    match_bid_lines(lines, masters)

    matched = [l for l in lines if l.match_status == "matched"]
    exceptions = [l for l in lines if l.match_status == "exception"]

    assert len(matched) >= 2
    assert len(exceptions) >= 1
