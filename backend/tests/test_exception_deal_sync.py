"""
Regression coverage for: exception resolution never touched the Deal it affected.

Root cause (reported by TLS as three separate symptoms, actually one architectural gap):
Deals are created once, when a round is processed. resolve_exception/bulk_resolve
(the Exceptions screen's Accept/Reject/Remap actions) only ever mutated the BidLine row —
never the Deal. So:
  - Accepting a flagged (anomaly/below-reserve) bid never made it actually win, because the
    Deal for that item was already created (awarding the next-highest bidder) before the
    admin got a chance to review it, and accepting never regenerated that Deal.
  - Rejecting a currently-winning line never removed/reassigned its Deal, so a buyer could
    still receive a "you won" result email for a line the admin had just rejected.
  - The anomaly detector also re-flagged an already-resolved line on any full round-wide
    re-run of select_winners, silently overturning an admin's earlier "accept" decision.

Fix: winner_selector.recompute_deal_for_item() re-selects the winner for a single item from
its CURRENT bid-line state and upserts (or removes) that item's Deal; resolve_exception and
bulk_resolve now call it after every action. The anomaly detector also now skips lines the
admin already resolved.
"""
import pytest
from datetime import datetime, timezone
from app.models.bid_line import BidLine
from app.models.master_item import MasterItem
from app.models.bid_file import BidFile
from app.models.bid_round import BidRound
from app.models.user import User
from app.models.deal import Deal
from app.services.winner_selector import select_winners
from app.core.security import hash_password


def _make_round(db):
    r = BidRound(name="Exceptions Sync Round", commodity="servers", status="closed", master_file_uploaded=True)
    db.add(r)
    db.flush()
    return r


def _make_buyer(db, email):
    u = User(
        email=email, hashed_password=hash_password("pass"), full_name=email.split("@")[0],
        role="buyer", is_active=True, fluff_percentage=0.0, fluff_enabled=False,
    )
    db.add(u)
    db.flush()
    return u


def _make_master(db, round_id, pn="PART-001", qty=1, reserve=None):
    m = MasterItem(
        bid_round_id=round_id, part_number=pn,
        part_number_normalized=pn.lower().replace("-", ""),
        description="Test Part", quantity=qty, reserve_price=reserve,
    )
    db.add(m)
    db.flush()
    return m


def _make_bid_file(db, round_id, buyer_id, uploaded_at=None):
    bf = BidFile(
        bid_round_id=round_id, buyer_id=buyer_id, filename="test.csv", file_path="/tmp/t.csv",
        status="processed", uploaded_at=uploaded_at or datetime(2025, 1, 1, tzinfo=timezone.utc),
    )
    db.add(bf)
    db.flush()
    return bf


def _make_line(db, bid_file, round_id, buyer_id, master_id, price, qty=1):
    line = BidLine(
        bid_file_id=bid_file.id, bid_round_id=round_id, buyer_id=buyer_id, master_item_id=master_id,
        raw_part_number="PART-001", normalized_part_number="part001",
        unit_price=price, quantity=qty, match_status="matched", match_method="exact",
    )
    db.add(line)
    db.flush()
    return line


def test_accepting_anomaly_exception_makes_that_buyer_the_real_winner(client, admin_token, db):
    r = _make_round(db)
    honest = _make_buyer(db, "honest@test.com")
    outlier = _make_buyer(db, "outlier@test.com")
    master = _make_master(db, r.id)

    _make_line(db, _make_bid_file(db, r.id, honest.id), r.id, honest.id, master.id, 100.0)
    # 20x the honest bid on a 2-bid item triggers the "extreme ratio" anomaly check.
    outlier_line = _make_line(db, _make_bid_file(db, r.id, outlier.id), r.id, outlier.id, master.id, 2000.0)
    db.commit()

    select_winners(db, r.id)
    db.refresh(outlier_line)
    assert outlier_line.is_anomaly is True, "setup check: the 2000 bid must be flagged as an anomaly"

    deal_before = db.query(Deal).filter(Deal.master_item_id == master.id).first()
    assert deal_before.winning_buyer_id == honest.id, "setup check: the only valid bid should win initially"

    # Admin reviews the Exceptions screen and accepts the flagged price as genuine.
    resp = client.patch(
        f"/api/exceptions/{outlier_line.id}/resolve",
        json={"action": "approve_match"},
        headers=admin_token,
    )
    assert resp.status_code == 200, resp.text

    deal_after = db.query(Deal).filter(Deal.master_item_id == master.id).first()
    assert deal_after.winning_buyer_id == outlier.id, (
        "Accepting the exception must make that buyer the actual winner, not leave the "
        "previously-created Deal pointing at the next-highest bidder"
    )
    assert deal_after.winning_price == 2000.0


def test_rejecting_the_only_bid_removes_the_stale_deal(client, admin_token, db):
    r = _make_round(db)
    buyer = _make_buyer(db, "solo@test.com")
    master = _make_master(db, r.id)

    line = _make_line(db, _make_bid_file(db, r.id, buyer.id), r.id, buyer.id, master.id, 50.0)
    db.commit()

    select_winners(db, r.id)
    deal_before = db.query(Deal).filter(Deal.master_item_id == master.id).first()
    assert deal_before is not None and deal_before.winning_buyer_id == buyer.id

    resp = client.patch(
        f"/api/exceptions/{line.id}/resolve",
        json={"action": "reject"},
        headers=admin_token,
    )
    assert resp.status_code == 200, resp.text

    deal_after = db.query(Deal).filter(Deal.master_item_id == master.id).first()
    assert deal_after is None, (
        "Rejecting the only (now former) winning line must remove its stale Deal — "
        "otherwise the buyer still gets emailed a win for a line that was rejected"
    )
    db.refresh(line)
    assert line.is_winner is False


def test_rejecting_the_winner_reassigns_the_deal_to_the_next_bidder(client, admin_token, db):
    r = _make_round(db)
    top = _make_buyer(db, "top@test.com")
    runner_up = _make_buyer(db, "runnerup@test.com")
    master = _make_master(db, r.id)

    top_line = _make_line(db, _make_bid_file(db, r.id, top.id), r.id, top.id, master.id, 50.0)
    _make_line(db, _make_bid_file(db, r.id, runner_up.id), r.id, runner_up.id, master.id, 45.0)
    db.commit()

    select_winners(db, r.id)
    deal_before = db.query(Deal).filter(Deal.master_item_id == master.id).first()
    assert deal_before.winning_buyer_id == top.id

    resp = client.patch(
        f"/api/exceptions/{top_line.id}/resolve",
        json={"action": "reject"},
        headers=admin_token,
    )
    assert resp.status_code == 200, resp.text

    deal_after = db.query(Deal).filter(Deal.master_item_id == master.id).first()
    assert deal_after.winning_buyer_id == runner_up.id, (
        "Rejecting the winning line must reassign the Deal to the next valid bidder"
    )
    assert deal_after.winning_price == 45.0


def test_bulk_reject_all_also_resyncs_deals(client, admin_token, db):
    r = _make_round(db)
    top = _make_buyer(db, "bulktop@test.com")
    master = _make_master(db, r.id)

    top_line = _make_line(db, _make_bid_file(db, r.id, top.id), r.id, top.id, master.id, 999.0)
    top_line.match_status = "exception"
    top_line.exception_type = "price_anomaly"
    db.commit()

    resp = client.post(
        f"/api/exceptions/rounds/{r.id}/bulk-resolve",
        json={"action": "reject_all", "line_ids": [top_line.id]},
        headers=admin_token,
    )
    assert resp.status_code == 200, resp.text

    assert db.query(Deal).filter(Deal.master_item_id == master.id).first() is None


def test_reprocessing_the_round_does_not_re_flag_an_already_resolved_exception(client, admin_token, db):
    r = _make_round(db)
    honest = _make_buyer(db, "rh@test.com")
    outlier = _make_buyer(db, "ro@test.com")
    master = _make_master(db, r.id)

    _make_line(db, _make_bid_file(db, r.id, honest.id), r.id, honest.id, master.id, 100.0)
    outlier_line = _make_line(db, _make_bid_file(db, r.id, outlier.id), r.id, outlier.id, master.id, 2000.0)
    db.commit()

    select_winners(db, r.id)
    db.refresh(outlier_line)
    assert outlier_line.is_anomaly is True

    resp = client.patch(
        f"/api/exceptions/{outlier_line.id}/resolve",
        json={"action": "approve_match"},
        headers=admin_token,
    )
    assert resp.status_code == 200, resp.text

    # Simulate any future full reprocess of the round (e.g. a reopen/reclose cycle).
    select_winners(db, r.id)
    db.refresh(outlier_line)
    assert outlier_line.is_anomaly is not True, (
        "A full round-wide reprocess must not silently re-flag a line the admin already accepted"
    )
    assert outlier_line.match_status == "matched"

    deal = db.query(Deal).filter(Deal.master_item_id == master.id).first()
    assert deal.winning_buyer_id == outlier.id


def test_override_on_an_approved_deal_resets_it_to_pending_approval(client, admin_token, db):
    r = _make_round(db)
    winner = _make_buyer(db, "winner@test.com")
    other = _make_buyer(db, "other@test.com")
    master = _make_master(db, r.id)

    _make_line(db, _make_bid_file(db, r.id, winner.id), r.id, winner.id, master.id, 100.0)
    db.commit()
    select_winners(db, r.id)
    deal = db.query(Deal).filter(Deal.master_item_id == master.id).first()

    approve_resp = client.post(f"/api/deals/{deal.id}/approve", headers=admin_token)
    assert approve_resp.status_code == 200, approve_resp.text
    db.refresh(deal)
    assert deal.status == "approved"

    override_resp = client.post(
        f"/api/deals/{deal.id}/override",
        json={"field_changed": "winning_buyer", "new_value": str(other.id), "reason_note": "wrong buyer picked"},
        headers=admin_token,
    )
    assert override_resp.status_code == 200, override_resp.text
    assert override_resp.json()["reset_to_pending"] is True

    db.refresh(deal)
    assert deal.status == "pending_approval", (
        "Overriding an already-approved deal must reset it to pending_approval so the corrected "
        "data actually gets re-sent, instead of silently disagreeing with what was already approved"
    )
    assert deal.approved_by is None
    assert deal.approved_at is None
    assert deal.winning_buyer_id == other.id


# ── Deal-level Reject (POST /deals/{id}/reject) — a DIFFERENT endpoint from the Exceptions
# screen's per-line reject above. It marked the deal status="rejected" but never cleared
# winning_buyer_id, and every buyer-facing "did I win" query read winning_buyer_id with no
# status filter — so a rejected deal still showed as WON in the buyer's own portal and in the
# result emails sent from approve-all. Fixed by filtering those queries to status=="approved",
# matching what the Razor export already correctly did.

def _buyer_headers(client, email, password="pass"):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_rejected_deal_not_shown_as_won_in_buyer_portal(client, admin_token, db):
    """A deal the admin actually approves must count as won; a deal the admin rejects
    (instead of approving) must not — even though both still carry winning_buyer_id."""
    r = _make_round(db)
    buyer = _make_buyer(db, "rejwin@test.com")
    master_won = _make_master(db, r.id, pn="PART-WON")
    master_rejected = _make_master(db, r.id, pn="PART-REJ")
    _make_line(db, _make_bid_file(db, r.id, buyer.id), r.id, buyer.id, master_won.id, 100.0)
    _make_line(db, _make_bid_file(db, r.id, buyer.id), r.id, buyer.id, master_rejected.id, 50.0)
    db.commit()
    select_winners(db, r.id)
    deal_won = db.query(Deal).filter(Deal.master_item_id == master_won.id).first()
    deal_rejected = db.query(Deal).filter(Deal.master_item_id == master_rejected.id).first()

    approve_resp = client.post(f"/api/deals/{deal_won.id}/approve", headers=admin_token)
    assert approve_resp.status_code == 200, approve_resp.text
    reject_resp = client.post(f"/api/deals/{deal_rejected.id}/reject", headers=admin_token)
    assert reject_resp.status_code == 200, reject_resp.text

    buyer_headers = _buyer_headers(client, "rejwin@test.com")
    result = client.get(f"/api/buyer/my-results/{r.id}", headers=buyer_headers)
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["won"] == 1, "the legitimately-approved deal must still count as a win"
    won_parts = {res["part_number"] for res in body["results"] if res["outcome"] == "WON"}
    assert won_parts == {"PART-WON"}, (
        f"A rejected deal must not still show as WON in the buyer's own results page, got: {won_parts}"
    )

    aggregate = client.get("/api/buyer/my-results", headers=buyer_headers)
    assert aggregate.status_code == 200, aggregate.text
    agg_won_parts = {res["part_number"] for res in aggregate.json()["results"] if res["outcome"] == "WON"}
    assert agg_won_parts == {"PART-WON"}, (
        f"A rejected deal must not appear as WON in the buyer's all-rounds results either, got: {agg_won_parts}"
    )


def test_rejecting_a_deal_does_not_award_it_to_the_next_bidder_either(client, admin_token, db):
    """The admin's stated intent: Reject pulls the item from the round entirely — it must
    NOT fall through to the next-highest bidder the way an Exceptions-screen reject does."""
    r = _make_round(db)
    top = _make_buyer(db, "rejtop@test.com")
    runner_up = _make_buyer(db, "rejrunner@test.com")
    master = _make_master(db, r.id)
    _make_line(db, _make_bid_file(db, r.id, top.id), r.id, top.id, master.id, 100.0)
    _make_line(db, _make_bid_file(db, r.id, runner_up.id), r.id, runner_up.id, master.id, 90.0)
    db.commit()
    select_winners(db, r.id)
    deal = db.query(Deal).filter(Deal.master_item_id == master.id).first()
    assert deal.winning_buyer_id == top.id

    reject_resp = client.post(f"/api/deals/{deal.id}/reject", headers=admin_token)
    assert reject_resp.status_code == 200, reject_resp.text

    runner_up_headers = _buyer_headers(client, "rejrunner@test.com")
    runner_result = client.get(f"/api/buyer/my-results/{r.id}", headers=runner_up_headers)
    assert runner_result.status_code == 200, runner_result.text
    assert runner_result.json()["won"] == 0, (
        "Rejecting the deal must not silently award the item to the runner-up either"
    )
