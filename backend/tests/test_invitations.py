"""
Regression coverage for the bid-invitation email pipeline.

Root cause of the reported bug: bid_invitation_email() referenced an undefined `notes_row`
variable, so EVERY call raised NameError. Because the endpoints wrap the send in try/except and
report {ok: False} on any exception, "Send Invitations" and "Resend Invitations" both silently
failed 100% of the time while still returning HTTP 200 — the exact "false success" pattern this
suite exists to catch.

These tests stub only the network boundary (email_service._send), so the REAL template-rendering
code (app.services.email_templates.bid_invitation_email) always executes for real — that's the
function where the bug lived, and a mock at that level would have hidden it forever.
"""
import pytest
from datetime import datetime, timedelta, timezone
from app.models.user import User
from app.models.bid_round import BidRound
from app.core.security import hash_password
import app.services.email_service as email_service


@pytest.fixture
def buyer(db):
    u = User(
        email="invitee@test.com", hashed_password=hash_password("x"),
        full_name="Invitee Buyer", company_name="Invitee Co", role="buyer", is_active=True,
    )
    db.add(u); db.commit(); db.refresh(u)
    return u


@pytest.fixture
def buyer2(db):
    u = User(
        email="invitee2@test.com", hashed_password=hash_password("x"),
        full_name="Second Invitee", company_name="Invitee2 Co", role="buyer", is_active=True,
    )
    db.add(u); db.commit(); db.refresh(u)
    return u


def _open_round_with_master(client, admin_token, db, **extra) -> int:
    resp = client.post("/api/rounds/", json={
        "name": "Invite Test Round", "commodity": "laptops",
        "submission_deadline": (datetime.now(timezone.utc) + timedelta(days=3)).isoformat(),
        **extra,
    }, headers=admin_token)
    assert resp.status_code == 200, resp.text
    round_id = resp.json()["id"]
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    r.master_file_uploaded = True
    db.commit()
    return round_id


def _stub_send_ok(monkeypatch):
    """Stub only the network call — template rendering still runs for real."""
    monkeypatch.setattr(email_service, "_send", lambda *a, **k: {"ok": True, "provider": "test", "detail": "sent"})


def _stub_send_fail(monkeypatch, detail="simulated provider outage"):
    monkeypatch.setattr(email_service, "_send", lambda *a, **k: {"ok": False, "provider": "test", "detail": detail})


# ── The exact regression: bid_invitation_email() must not raise ──────────────────────────

def test_bid_invitation_email_template_renders_without_notes():
    from app.services.email_templates import bid_invitation_email
    subject, html = bid_invitation_email("Jane", "Round 1", "laptops", "2026-09-01", "https://x/bid")
    assert "Round 1" in html


def test_bid_invitation_email_template_renders_with_notes():
    from app.services.email_templates import bid_invitation_email
    subject, html = bid_invitation_email(
        "Jane", "Round 1", "laptops", "2026-09-01", "https://x/bid", "Please review the spec sheet"
    )
    assert "Please review the spec sheet" in html


# ── Send Invitations (initial) ────────────────────────────────────────────────────────────

def test_send_invitations_succeeds_and_reports_zero_failures(client, admin_token, db, buyer, monkeypatch):
    _stub_send_ok(monkeypatch)
    round_id = _open_round_with_master(client, admin_token, db)
    assign = client.post(f"/api/rounds/{round_id}/buyers", json={"buyer_ids": [buyer.id]}, headers=admin_token)
    assert assign.status_code == 200

    resp = client.post(f"/api/rounds/{round_id}/send-invitations", headers=admin_token)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["sent"] == 1
    assert data["failed"] == 0
    assert data["failures"] == []


def test_send_invitations_with_round_notes_does_not_500(client, admin_token, db, buyer, monkeypatch):
    """The exact scenario that triggered the NameError in production: a round with notes set."""
    _stub_send_ok(monkeypatch)
    round_id = _open_round_with_master(client, admin_token, db, notes="Bring your best pricing")
    client.post(f"/api/rounds/{round_id}/buyers", json={"buyer_ids": [buyer.id]}, headers=admin_token)

    resp = client.post(f"/api/rounds/{round_id}/send-invitations", headers=admin_token)
    assert resp.status_code == 200, resp.text
    assert resp.json()["sent"] == 1
    assert resp.json()["failed"] == 0


# ── Resend Invitations ─────────────────────────────────────────────────────────────────────

def test_resend_invitations_after_initial_send(client, admin_token, db, buyer, monkeypatch):
    _stub_send_ok(monkeypatch)
    round_id = _open_round_with_master(client, admin_token, db)
    client.post(f"/api/rounds/{round_id}/buyers", json={"buyer_ids": [buyer.id]}, headers=admin_token)

    first = client.post(f"/api/rounds/{round_id}/send-invitations", headers=admin_token)
    assert first.json()["sent"] == 1

    # A second non-resend call must not spuriously succeed — everyone is already 'sent'.
    second = client.post(f"/api/rounds/{round_id}/send-invitations", headers=admin_token)
    assert second.status_code == 400
    assert "already been invited" in second.json()["detail"].lower()

    # resend=true must actually re-send to the already-invited buyer, not report 0.
    resend = client.post(f"/api/rounds/{round_id}/send-invitations?resend=true", headers=admin_token)
    assert resend.status_code == 200, resend.text
    assert resend.json()["sent"] == 1
    assert resend.json()["failed"] == 0


# ── Targeting a single buyer (not everyone) ─────────────────────────────────────────────────

def test_send_invitations_targets_only_the_requested_buyer(client, admin_token, db, buyer, buyer2, monkeypatch):
    sent_to = []
    monkeypatch.setattr(email_service, "_send", lambda to_email, *a, **k: (sent_to.append(to_email), {"ok": True, "provider": "test", "detail": "sent"})[1])
    round_id = _open_round_with_master(client, admin_token, db)
    client.post(f"/api/rounds/{round_id}/buyers", json={"buyer_ids": [buyer.id, buyer2.id]}, headers=admin_token)

    resp = client.post(f"/api/rounds/{round_id}/send-invitations?buyer_id={buyer.id}", headers=admin_token)
    assert resp.status_code == 200, resp.text
    assert resp.json()["sent"] == 1
    assert sent_to == [buyer.email]  # only the targeted buyer was emailed, not buyer2 too


def test_resend_to_single_buyer_does_not_touch_the_other(client, admin_token, db, buyer, buyer2, monkeypatch):
    _stub_send_ok(monkeypatch)
    round_id = _open_round_with_master(client, admin_token, db)
    client.post(f"/api/rounds/{round_id}/buyers", json={"buyer_ids": [buyer.id, buyer2.id]}, headers=admin_token)
    client.post(f"/api/rounds/{round_id}/send-invitations", headers=admin_token)  # both get the initial send

    sent_to = []
    monkeypatch.setattr(email_service, "_send", lambda to_email, *a, **k: (sent_to.append(to_email), {"ok": True, "provider": "test", "detail": "sent"})[1])
    resp = client.post(f"/api/rounds/{round_id}/send-invitations?buyer_id={buyer2.id}&resend=true", headers=admin_token)
    assert resp.status_code == 200, resp.text
    assert resp.json()["sent"] == 1
    assert sent_to == [buyer2.email]


def test_send_invitations_rejects_buyer_not_assigned_to_round(client, admin_token, db, buyer, buyer2, monkeypatch):
    _stub_send_ok(monkeypatch)
    round_id = _open_round_with_master(client, admin_token, db)
    client.post(f"/api/rounds/{round_id}/buyers", json={"buyer_ids": [buyer.id]}, headers=admin_token)  # buyer2 NOT assigned

    resp = client.post(f"/api/rounds/{round_id}/send-invitations?buyer_id={buyer2.id}", headers=admin_token)
    assert resp.status_code == 400
    assert "not assigned" in resp.json()["detail"].lower()


# ── Auto-send on round open ─────────────────────────────────────────────────────────────────

def test_auto_send_invites_on_open(client, admin_token, db, buyer, monkeypatch):
    _stub_send_ok(monkeypatch)
    round_id = _open_round_with_master(client, admin_token, db, auto_send_invites=True)
    client.post(f"/api/rounds/{round_id}/buyers", json={"buyer_ids": [buyer.id]}, headers=admin_token)

    resp = client.post(f"/api/rounds/{round_id}/open", headers=admin_token)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "open"
    assert data["invitations_sent"] == 1
    assert data["invitations_failed"] == 0
    assert data["failures"] == []


# ── Failures must be surfaced, never silently swallowed ─────────────────────────────────────

def test_send_invitations_reports_provider_failure_not_false_success(client, admin_token, db, buyer, monkeypatch):
    _stub_send_fail(monkeypatch, detail="550 mailbox unavailable")
    round_id = _open_round_with_master(client, admin_token, db)
    client.post(f"/api/rounds/{round_id}/buyers", json={"buyer_ids": [buyer.id]}, headers=admin_token)

    resp = client.post(f"/api/rounds/{round_id}/send-invitations", headers=admin_token)
    assert resp.status_code == 200  # the request itself succeeds — it's the send that failed
    data = resp.json()
    assert data["sent"] == 0
    assert data["failed"] == 1
    assert "550 mailbox unavailable" in data["failures"][0]

    # A failed send must leave the buyer retryable (still 'pending'), not falsely marked 'sent'.
    row = db.execute(
        __import__("sqlalchemy").text(
            "SELECT invite_status FROM round_buyers WHERE round_id=:r AND buyer_id=:b"
        ),
        {"r": round_id, "b": buyer.id},
    ).fetchone()
    assert row.invite_status == "pending"


def test_open_round_reports_invite_failures_not_false_success(client, admin_token, db, buyer, monkeypatch):
    _stub_send_fail(monkeypatch, detail="connection timed out")
    round_id = _open_round_with_master(client, admin_token, db, auto_send_invites=True)
    client.post(f"/api/rounds/{round_id}/buyers", json={"buyer_ids": [buyer.id]}, headers=admin_token)

    resp = client.post(f"/api/rounds/{round_id}/open", headers=admin_token)
    assert resp.status_code == 200
    data = resp.json()
    # The round itself still opens — only the invite email failed.
    assert data["status"] == "open"
    assert data["invitations_sent"] == 0
    assert data["invitations_failed"] == 1
    assert "connection timed out" in data["failures"][0]
