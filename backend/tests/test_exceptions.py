"""
Tests for the exception queue — list, resolve, bulk resolve, master search.
"""
import pytest
from app.models.bid_round import BidRound
from app.models.bid_file import BidFile
from app.models.bid_line import BidLine
from app.models.master_item import MasterItem
from app.models.user import User
from app.core.security import hash_password


def _make_admin(db):
    u = User(
        email="excadmin@test.com",
        hashed_password=hash_password("pass"),
        full_name="Exc Admin",
        role="admin",
        is_active=True,
        
    )
    db.add(u)
    db.flush()
    return u


def _make_buyer(db):
    u = User(
        email="excbuyer@test.com",
        hashed_password=hash_password("pass"),
        full_name="Exc Buyer",
        role="buyer",
        is_active=True,
        
    )
    db.add(u)
    db.flush()
    return u


def _make_round(db):
    r = BidRound(name="EXC Round", commodity="laptops", status="closed", master_file_uploaded=True)
    db.add(r)
    db.flush()
    return r


def _make_master(db, round_id):
    m = MasterItem(
        bid_round_id=round_id,
        part_number="ABC-001",
        part_number_normalized="abc001",
        description="Test Laptop",
        quantity=10,
    )
    db.add(m)
    db.flush()
    return m


def _make_exception_line(db, round_id, buyer_id, master_id=None):
    bf = BidFile(bid_round_id=round_id, buyer_id=buyer_id, filename="test.csv", file_path="/tmp/t", status="processed")
    db.add(bf)
    db.flush()
    line = BidLine(
        bid_file_id=bf.id,
        bid_round_id=round_id,
        buyer_id=buyer_id,
        raw_part_number="ABC-XXX",
        normalized_part_number="abcxxx",
        unit_price=100.0,
        match_status="exception",
        exception_type="unmatched",
        exception_resolved=False,
        master_item_id=master_id,
    )
    db.add(line)
    db.flush()
    return line


def test_list_exceptions_requires_admin(client):
    resp = client.get("/api/exceptions/rounds/1")
    assert resp.status_code in (401, 403)


def test_list_exceptions_empty(client, db, admin_token):
    r = _make_round(db)
    db.commit()
    resp = client.get(f"/api/exceptions/rounds/{r.id}", headers=admin_token)
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_and_resolve_exception(client, db, admin_token):
    buyer = _make_buyer(db)
    r = _make_round(db)
    master = _make_master(db, r.id)
    line = _make_exception_line(db, r.id, buyer.id, master_id=master.id)
    db.commit()

    # List
    resp = client.get(f"/api/exceptions/rounds/{r.id}", headers=admin_token)
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["exception_type"] == "unmatched"

    # Resolve via approve_match
    resolve = client.patch(f"/api/exceptions/{line.id}/resolve", json={"action": "approve_match"}, headers=admin_token)
    assert resolve.status_code == 200
    assert resolve.json()["new_match_status"] == "matched"


def test_remap_exception(client, db, admin_token):
    buyer = _make_buyer(db)
    r = _make_round(db)
    master = _make_master(db, r.id)
    line = _make_exception_line(db, r.id, buyer.id)
    db.commit()

    resolve = client.patch(
        f"/api/exceptions/{line.id}/resolve",
        json={"action": "remap", "new_master_item_id": master.id},
        headers=admin_token,
    )
    assert resolve.status_code == 200
    assert resolve.json()["new_match_status"] == "matched"


def test_bulk_resolve_approve_suggested(client, db, admin_token):
    buyer = _make_buyer(db)
    r = _make_round(db)
    master = _make_master(db, r.id)

    # Line with high-confidence AI suggestion
    line = _make_exception_line(db, r.id, buyer.id)
    line.ai_match_suggestion = master.part_number_normalized
    line.ai_match_confidence = 92.0
    db.commit()

    resp = client.post(
        f"/api/exceptions/rounds/{r.id}/bulk-resolve",
        json={"action": "approve_suggested"},
        headers=admin_token,
    )
    assert resp.status_code == 200
    assert resp.json()["resolved"] == 1


def test_master_search(client, db, admin_token):
    r = _make_round(db)
    master = _make_master(db, r.id)
    db.commit()

    resp = client.get(f"/api/exceptions/rounds/{r.id}/search-master", params={"q": "laptop"}, headers=admin_token)
    assert resp.status_code == 200
    items = resp.json()
    assert any(i["part_number"] == "ABC-001" for i in items)


def test_exception_stats(client, db, admin_token):
    buyer = _make_buyer(db)
    r = _make_round(db)
    _make_exception_line(db, r.id, buyer.id)
    db.commit()

    resp = client.get(f"/api/exceptions/rounds/{r.id}/stats", headers=admin_token)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert "by_type" in data
