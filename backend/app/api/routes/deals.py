"""
Deal approval + Razor ERP push routes.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.core.security import require_admin
from app.models.deal import Deal
from datetime import datetime, timezone

router = APIRouter(prefix="/deals", tags=["deals"])


@router.get("/rounds/{round_id}")
def list_deals(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    deals = db.query(Deal).filter(Deal.bid_round_id == round_id).all()
    return [_deal_out(d) for d in deals]


@router.post("/{deal_id}/approve")
def approve_deal(deal_id: int, db: Session = Depends(get_db), admin=Depends(require_admin)):
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(404, "Deal not found")
    deal.status = "approved"
    deal.approved_by = admin.email
    deal.approved_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "approved"}


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


@router.post("/{deal_id}/push-razor")
def push_to_razor(deal_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    """
    Push deal to Razor ERP. Falls back to CSV export if API fails.
    Deal approval is never blocked by Razor API failure.
    """
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(404, "Deal not found")
    if deal.status != "approved":
        raise HTTPException(400, "Deal must be approved before pushing to Razor")

    # Placeholder — replace with real Razor API call when Justin Littler provides docs
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
        # Never block — return CSV fallback instruction
        return {
            "status": "razor_failed",
            "error": str(e),
            "fallback": f"Download CSV at /api/rounds/{deal.bid_round_id}/export/deals.csv",
        }


def _call_razor_api(deal: Deal) -> str:
    """Placeholder. Replace with actual Razor ERP API integration."""
    raise NotImplementedError("Razor API integration pending — awaiting Justin Littler's API documentation")


def _deal_out(d: Deal) -> dict:
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
    }
