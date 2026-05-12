"""
Deal approval + override logging + Razor ERP push routes.
"""
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.core.security import require_admin
from app.models.deal import Deal
from app.models.user import User
from app.models.bid_line import BidLine
from app.models.approval_override import ApprovalOverride
from app.services.buyer_scorer import recalculate_buyer_scores

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
    return [_deal_out(d, db) for d in deals]


@router.post("/{deal_id}/approve")
def approve_deal(deal_id: int, db: Session = Depends(get_db), admin=Depends(require_admin)):
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(404, "Deal not found")
    deal.status = "approved"
    deal.approved_by = admin.email
    deal.approved_at = datetime.now(timezone.utc)
    db.commit()
    recalculate_buyer_scores(db, deal.bid_round_id)
    return {"status": "approved"}


@router.post("/rounds/{round_id}/approve-all")
def approve_all_deals(round_id: int, db: Session = Depends(get_db), admin=Depends(require_admin)):
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
    return {"approved": len(deals)}


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
def push_to_razor(deal_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(404, "Deal not found")
    if deal.status != "approved":
        raise HTTPException(400, "Deal must be approved before pushing to Razor")
    try:
        razor_deal_id = _call_razor_api(deal)
        deal.razor_deal_id = razor_deal_id
        deal.razor_push_status = "success"
        deal.razor_pushed_at = datetime.now(timezone.utc)
        deal.status = "pushed_to_razor"
        db.commit()
        return {"status": "pushed", "razor_deal_id": razor_deal_id}
    except Exception as e:
        deal.razor_push_status = "failed"
        db.commit()
        return {
            "status": "razor_failed",
            "error": str(e),
            "fallback": f"Download CSV at /api/rounds/{deal.bid_round_id}/export/razor.csv",
        }


def _call_razor_api(deal: Deal) -> str:
    raise NotImplementedError("Razor API integration pending — awaiting API documentation")


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
