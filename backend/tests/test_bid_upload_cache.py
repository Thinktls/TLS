"""
Buyer file submission is a two-step flow: parse-preview (upload + parse), then confirm
(POST .../bid). Confirming used to re-upload and re-parse the exact same file a second
time, which doubled how long a buyer sat waiting on a large workbook. parse-preview now
caches the uploaded bytes on disk so confirm can reuse them by filename alone.
"""
import io
from sqlalchemy import text
from app.models.bid_round import BidRound
from app.models.user import User
from app.core.security import hash_password


def _make_open_round_with_buyer(db):
    buyer = User(
        email="memlot@buyer.com",
        hashed_password=hash_password("testpass123"),
        full_name="Memory Buyer",
        company_name="Memory Co",
        role="buyer",
        is_active=True,
    )
    db.add(buyer)
    db.commit()
    db.refresh(buyer)

    r = BidRound(name="Memory Lot", commodity="memory", status="open")
    db.add(r)
    db.commit()
    db.refresh(r)

    db.execute(
        text("INSERT INTO round_buyers (round_id, buyer_id, invite_status) VALUES (:rid, :bid, 'invited')"),
        {"rid": r.id, "bid": buyer.id},
    )
    db.commit()

    login = None
    return r, buyer


def _buyer_headers(client, email="memlot@buyer.com", password="testpass123"):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


CSV_CONTENT = b"Part Number,Description,Unit Price\nMEM-1,8GB DDR4,12.50\nMEM-2,16GB DDR4,22.00\n"


def test_confirm_reuses_preview_cache_without_reuploading_file(client, db):
    r, buyer = _make_open_round_with_buyer(db)
    headers = _buyer_headers(client)

    preview_resp = client.post(
        f"/api/buyer/rounds/{r.id}/parse-preview",
        headers=headers,
        files={"file": ("memory_lot.csv", io.BytesIO(CSV_CONTENT), "text/csv")},
    )
    assert preview_resp.status_code == 200, preview_resp.text
    assert preview_resp.json()["total_lines"] == 2

    # Confirm WITHOUT sending the file again — only the filename, as the frontend now does.
    confirm_resp = client.post(
        f"/api/buyer/rounds/{r.id}/bid",
        headers=headers,
        data={"filename": "memory_lot.csv", "offer_terms": ""},
    )
    assert confirm_resp.status_code == 200, confirm_resp.text
    assert confirm_resp.json()["message"] == "Submitted 2 line items"


def test_confirm_without_prior_preview_fails_clearly(client, db):
    r, buyer = _make_open_round_with_buyer(db)
    headers = _buyer_headers(client)

    confirm_resp = client.post(
        f"/api/buyer/rounds/{r.id}/bid",
        headers=headers,
        data={"filename": "never_previewed.csv", "offer_terms": ""},
    )
    assert confirm_resp.status_code == 400
    assert "expired" in confirm_resp.json()["detail"].lower()


def test_confirm_still_accepts_a_direct_file_upload(client, db):
    """Back-compat: submitting a file directly (no prior preview) still works."""
    r, buyer = _make_open_round_with_buyer(db)
    headers = _buyer_headers(client)

    confirm_resp = client.post(
        f"/api/buyer/rounds/{r.id}/bid",
        headers=headers,
        files={"file": ("direct.csv", io.BytesIO(CSV_CONTENT), "text/csv")},
        data={"offer_terms": ""},
    )
    assert confirm_resp.status_code == 200, confirm_resp.text
    assert confirm_resp.json()["message"] == "Submitted 2 line items"
