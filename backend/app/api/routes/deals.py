"""
Deal approval + override logging + Razor ERP push routes.
"""
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db, SessionLocal
from app.core.security import require_admin
from app.models.deal import Deal
from app.models.user import User
from app.models.bid_line import BidLine
from app.models.approval_override import ApprovalOverride
from app.services.buyer_scorer import recalculate_buyer_scores
from app.api.routes.notifications import create_notification
from app.services.razor_client import push_deal_to_razor, push_round_to_razor, RazorPushError
from app.services.email_service import send_round_results
from app.core.config import settings

router = APIRouter(prefix="/deals", tags=["deals"])


class OverrideRequest(BaseModel):
    field_changed: str        # "winning_buyer" | "unit_price" | "quantity"
    new_value: str
    reason_note: str          # mandatory


class BulkApproveRequest(BaseModel):
    deal_ids: list[int]


@router.get("/rounds/{round_id}")
def list_deals(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    deals = db.query(Deal).filter(Deal.bid_round_id == round_id).all()
    if not deals:
        return []
    # Pre-fetch buyers and override counts to avoid N+1
    buyer_ids = {d.winning_buyer_id for d in deals}
    deal_ids  = [d.id for d in deals]
    buyers_map = {b.id: b for b in db.query(User).filter(User.id.in_(buyer_ids)).all()}
    from sqlalchemy import func as _func
    from app.models.approval_override import ApprovalOverride as _AO
    override_counts = {
        row.deal_id: row.cnt
        for row in db.query(_AO.deal_id, _func.count().label("cnt"))
        .filter(_AO.deal_id.in_(deal_ids))
        .group_by(_AO.deal_id)
        .all()
    }
    return [_deal_out_fast(d, buyers_map, override_counts) for d in deals]


@router.post("/{deal_id}/approve")
async def approve_deal(deal_id: int, db: Session = Depends(get_db), admin=Depends(require_admin)):
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(404, "Deal not found")
    deal.status = "approved"
    deal.approved_by = admin.email
    deal.approved_at = datetime.now(timezone.utc)
    db.commit()
    recalculate_buyer_scores(db, deal.bid_round_id)
    if settings.AUTO_PUSH_RAZOR:
        try:
            await push_deal_to_razor(db, deal)
        except RazorPushError:
            pass  # notification already emitted inside push_deal_to_razor
    return {"status": "approved", "razor_auto_pushed": settings.AUTO_PUSH_RAZOR}


def _send_results_to_all_buyers(round_id: int):
    """Background task: send win/loss notice emails to every assigned buyer."""
    import logging
    from app.models.bid_round import BidRound
    _log = logging.getLogger(__name__)
    db = SessionLocal()
    try:
        r = db.query(BidRound).filter(BidRound.id == round_id).first()
        if not r:
            return
        assigned = db.execute(
            text("SELECT buyer_id FROM round_buyers WHERE round_id = :rid"), {"rid": round_id}
        ).fetchall()
        frontend_url = settings.FRONTEND_URL
        for row in assigned:
            buyer = db.query(User).filter(User.id == row.buyer_id).first()
            if not buyer or not buyer.is_active:
                continue
            won = db.query(Deal).filter(
                Deal.bid_round_id == round_id, Deal.winning_buyer_id == buyer.id
            ).count()
            total_lines = db.query(BidLine).filter(
                BidLine.bid_round_id == round_id,
                BidLine.buyer_id == buyer.id,
                BidLine.match_status == "matched",
            ).count()
            lost = max(0, total_lines - won)
            portal_url = f"{frontend_url}/portal/results?round={round_id}"
            send_round_results(buyer.email, buyer.full_name, r.name, won, lost, portal_url)
            _log.info(f"[AutoResults] Sent results for round {round_id} to {buyer.email}: won={won} lost={lost}")
    except Exception as exc:
        _log.error(f"[AutoResults] Failed to send results for round {round_id}: {exc}", exc_info=True)
    finally:
        db.close()


@router.post("/rounds/{round_id}/approve-all")
async def approve_all_deals(round_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), admin=Depends(require_admin)):
    deals = (
        db.query(Deal)
        .filter(Deal.bid_round_id == round_id, Deal.status == "pending_approval")
        .all()
    )
    now = datetime.now(timezone.utc)
    for deal in deals:
        deal.status = "approved"
        deal.approved_by = admin.email
        deal.approved_at = now
    db.commit()
    recalculate_buyer_scores(db, round_id)
    if settings.AUTO_PUSH_RAZOR:
        try:
            await push_round_to_razor(db, round_id)
        except Exception:
            pass
    # Auto-send win/loss notice emails to all assigned buyers
    background_tasks.add_task(_send_results_to_all_buyers, round_id)
    return {"approved": len(deals), "razor_auto_pushed": settings.AUTO_PUSH_RAZOR}


@router.post("/{deal_id}/reject")
def reject_deal(deal_id: int, notes: str = "", db: Session = Depends(get_db), admin=Depends(require_admin)):
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(404, "Deal not found")
    deal.status = "rejected"
    deal.notes = notes
    deal.approved_by = admin.email
    db.commit()
    return {"status": "rejected"}


@router.post("/{deal_id}/override")
def override_deal(deal_id: int, req: OverrideRequest, db: Session = Depends(get_db), admin=Depends(require_admin)):
    """Override a field on a deal with a mandatory reason. Logged to audit trail."""
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(404, "Deal not found")
    if not req.reason_note.strip():
        raise HTTPException(400, "reason_note is required for overrides")

    old_value: str = ""

    if req.field_changed == "unit_price":
        try:
            new_price = float(req.new_value)
        except ValueError:
            raise HTTPException(400, "new_value must be a number for unit_price override")
        old_value = str(deal.winning_price)
        deal.winning_price = new_price
        deal.total_value = round(new_price * deal.quantity, 4)

    elif req.field_changed == "quantity":
        try:
            new_qty = int(req.new_value)
        except ValueError:
            raise HTTPException(400, "new_value must be an integer for quantity override")
        old_value = str(deal.quantity)
        deal.quantity = new_qty
        deal.total_value = round(deal.winning_price * new_qty, 4)

    elif req.field_changed == "winning_buyer":
        try:
            new_buyer_id = int(req.new_value)
        except ValueError:
            raise HTTPException(400, "new_value must be a buyer ID (integer)")
        new_buyer = db.query(User).filter(User.id == new_buyer_id).first()
        if not new_buyer:
            raise HTTPException(404, "New buyer not found")
        old_value = str(deal.winning_buyer_id)
        deal.winning_buyer_id = new_buyer_id

    else:
        raise HTTPException(400, f"Unknown field_changed: {req.field_changed}")

    override = ApprovalOverride(
        deal_id=deal_id,
        bid_round_id=deal.bid_round_id,
        admin_user=admin.email,
        field_changed=req.field_changed,
        old_value=old_value,
        new_value=req.new_value,
        reason_note=req.reason_note,
    )
    db.add(override)
    db.commit()
    return {"status": "overridden", "field": req.field_changed, "old": old_value, "new": req.new_value}


@router.get("/{deal_id}/overrides")
def get_deal_overrides(deal_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    overrides = db.query(ApprovalOverride).filter(ApprovalOverride.deal_id == deal_id).all()
    return [
        {
            "id": o.id,
            "admin_user": o.admin_user,
            "field_changed": o.field_changed,
            "old_value": o.old_value,
            "new_value": o.new_value,
            "reason_note": o.reason_note,
            "overridden_at": o.overridden_at,
        }
        for o in overrides
    ]


@router.post("/{deal_id}/push-razor")
async def push_to_razor(deal_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(404, "Deal not found")
    if deal.status != "approved":
        raise HTTPException(400, "Deal must be approved before pushing to Razor")
    try:
        razor_deal_id = await push_deal_to_razor(db, deal)
        db.commit()
        return {"status": "pushed", "razor_deal_id": razor_deal_id}
    except RazorPushError as e:
        db.commit()
        return {
            "status": "razor_failed",
            "error": str(e),
            "fallback": f"Download CSV at /api/rounds/{deal.bid_round_id}/export/razor.csv",
        }


@router.post("/rounds/{round_id}/push-razor-all")
async def push_round_razor(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Push all approved deals in a round to Razor ERP in bulk."""
    result = await push_round_to_razor(db, round_id)
    return result


def _deal_out_fast(d: Deal, buyers_map: dict, override_counts: dict) -> dict:
    buyer = buyers_map.get(d.winning_buyer_id)
    return {
        "id": d.id,
        "part_number": d.part_number,
        "description": d.description,
        "quantity": d.quantity,
        "winning_price": d.winning_price,
        "total_value": d.total_value,
        "status": d.status,
        "razor_push_status": d.razor_push_status,
        "razor_deal_id": d.razor_deal_id,
        "approved_by": d.approved_by,
        "approved_at": d.approved_at,
        "winner_company": buyer.company_name if buyer else "",
        "winner_email": buyer.email if buyer else "",
        "winning_buyer_id": d.winning_buyer_id,
        "master_item_id": d.master_item_id,
        "override_count": override_counts.get(d.id, 0),
        "notes": d.notes,
    }


def _deal_out(d: Deal, db: Session) -> dict:
    buyer = db.query(User).filter(User.id == d.winning_buyer_id).first()
    overrides = db.query(ApprovalOverride).filter(ApprovalOverride.deal_id == d.id).count()
    return {
        "id": d.id,
        "part_number": d.part_number,
        "description": d.description,
        "quantity": d.quantity,
        "winning_price": d.winning_price,
        "total_value": d.total_value,
        "status": d.status,
        "razor_push_status": d.razor_push_status,
        "razor_deal_id": d.razor_deal_id,
        "approved_by": d.approved_by,
        "approved_at": d.approved_at,
        "winner_company": buyer.company_name if buyer else "",
        "winner_email": buyer.email if buyer else "",
        "winning_buyer_id": d.winning_buyer_id,
        "override_count": overrides,
        "notes": d.notes,
    }
