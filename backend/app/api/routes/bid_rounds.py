import os
import shutil
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from app.db.session import get_db
from app.core.security import require_admin, get_current_user
from app.models.bid_round import BidRound, round_buyers
from app.models.master_item import MasterItem
from app.models.bid_file import BidFile
from app.models.bid_line import BidLine
from app.models.deal import Deal
from app.models.user import User
from app.services.file_parser import parse_master_file
from app.services.matcher import match_bid_lines
from app.services.winner_selector import select_winners
from app.services.template_generator import generate_bid_template
from app.services.export_service import (
    export_deals_excel, export_deals_csv, export_bid_comparison_excel,
    export_buyer_award_sheet, export_all_award_sheets_zip,
    export_razor_csv, export_margin_report,
)
from app.services.email_service import send_bid_invitation

router = APIRouter(prefix="/rounds", tags=["bid_rounds"])

UPLOAD_DIR = "/tmp/thinktls_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


class RoundCreate(BaseModel):
    name: str
    commodity: str
    customer: Optional[str] = None
    submission_deadline: Optional[datetime] = None
    notes: Optional[str] = None
    reserve_price_enabled: bool = False


class RoundOut(BaseModel):
    id: int
    name: str
    commodity: str
    customer: Optional[str] = None
    status: str
    total_line_items: int
    master_file_uploaded: bool
    submission_deadline: Optional[datetime] = None

    class Config:
        from_attributes = True


class BuyerAssignment(BaseModel):
    buyer_ids: List[int]


@router.post("/", response_model=RoundOut)
def create_round(req: RoundCreate, db: Session = Depends(get_db), admin=Depends(require_admin)):
    r = BidRound(**req.model_dump(), created_by_id=admin.id)
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@router.get("/", response_model=list[RoundOut])
def list_rounds(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(BidRound).order_by(BidRound.created_at.desc()).all()


@router.get("/{round_id}", response_model=RoundOut)
def get_round(round_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not r:
        raise HTTPException(404, "Round not found")
    return r


@router.post("/{round_id}/master-file")
async def upload_master_file(round_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not r:
        raise HTTPException(404, "Round not found")

    content = await file.read()
    try:
        rows = parse_master_file(content, file.filename)
    except ValueError as e:
        raise HTTPException(400, str(e))

    # Clear existing master items for this round
    db.query(MasterItem).filter(MasterItem.bid_round_id == round_id).delete()

    for row in rows:
        db.add(MasterItem(bid_round_id=round_id, **row))

    r.master_file_uploaded = True
    r.total_line_items = len(rows)
    r.master_file_path = file.filename
    db.commit()

    return {"message": f"Uploaded {len(rows)} line items", "total": len(rows)}


@router.post("/{round_id}/open")
def open_round(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not r:
        raise HTTPException(404, "Round not found")
    if not r.master_file_uploaded:
        raise HTTPException(400, "Upload master file before opening round")
    r.status = "open"
    db.commit()
    return {"status": "open"}


@router.post("/{round_id}/close")
def close_round(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not r:
        raise HTTPException(404, "Round not found")
    r.status = "closed"
    db.commit()
    return {"status": "closed"}


@router.get("/{round_id}/buyers")
def get_round_buyers(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not r:
        raise HTTPException(404, "Round not found")
    rows = db.execute(
        text("SELECT buyer_id, invite_status, invited_at FROM round_buyers WHERE round_id = :rid"),
        {"rid": round_id},
    ).fetchall()
    result = []
    for row in rows:
        buyer = db.query(User).filter(User.id == row.buyer_id).first()
        if buyer:
            result.append({
                "id": buyer.id,
                "full_name": buyer.full_name,
                "email": buyer.email,
                "company_name": buyer.company_name,
                "invite_status": row.invite_status,
                "invited_at": row.invited_at,
            })
    return result


@router.post("/{round_id}/buyers")
def assign_buyers(round_id: int, req: BuyerAssignment, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not r:
        raise HTTPException(404, "Round not found")
    # Remove existing assignments not in the new list
    db.execute(
        text("DELETE FROM round_buyers WHERE round_id = :rid AND buyer_id NOT IN :bids"),
        {"rid": round_id, "bids": tuple(req.buyer_ids) or (0,)},
    )
    # Add new ones (upsert via ignore)
    existing = {row.buyer_id for row in db.execute(
        text("SELECT buyer_id FROM round_buyers WHERE round_id = :rid"), {"rid": round_id}
    ).fetchall()}
    for bid in req.buyer_ids:
        if bid not in existing:
            db.execute(
                text("INSERT INTO round_buyers (round_id, buyer_id, invite_status) VALUES (:rid, :bid, 'pending')"),
                {"rid": round_id, "bid": bid},
            )
    db.commit()
    return {"assigned": len(req.buyer_ids)}


@router.get("/{round_id}/generate-template")
def download_template(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not r:
        raise HTTPException(404, "Round not found")
    if not r.master_file_uploaded:
        raise HTTPException(400, "Upload master file before generating template")
    data = generate_bid_template(db, round_id)
    filename = f"bid_template_{r.name.replace(' ', '_')}_{round_id}.xlsx"
    return StreamingResponse(
        iter([data]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/{round_id}/send-invitations")
def send_invitations(round_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), admin=Depends(require_admin)):
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not r:
        raise HTTPException(404, "Round not found")
    if not r.master_file_uploaded:
        raise HTTPException(400, "Upload master file before sending invitations")

    assigned = db.execute(
        text("SELECT buyer_id FROM round_buyers WHERE round_id = :rid"), {"rid": round_id}
    ).fetchall()
    if not assigned:
        raise HTTPException(400, "Assign buyers to this round before sending invitations")

    deadline_str = r.submission_deadline.strftime("%B %d, %Y") if r.submission_deadline else "See admin for deadline"
    upload_url = f"http://localhost:3000/portal/bid?round={round_id}"

    sent = 0
    for row in assigned:
        buyer = db.query(User).filter(User.id == row.buyer_id).first()
        if not buyer or not buyer.is_active:
            continue
        background_tasks.add_task(send_bid_invitation, buyer.email, buyer.full_name, r.name, deadline_str, upload_url)
        db.execute(
            text("UPDATE round_buyers SET invite_status='sent', invited_at=now() WHERE round_id=:rid AND buyer_id=:bid"),
            {"rid": round_id, "bid": buyer.id},
        )
        buyer.last_invited_date = datetime.utcnow()
        sent += 1

    db.commit()
    return {"sent": sent, "message": f"Invitations queued for {sent} buyer(s)"}


@router.post("/{round_id}/process")
def process_round(round_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Match all bid lines and select winners."""
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not r:
        raise HTTPException(404, "Round not found")
    if r.status != "closed":
        raise HTTPException(400, "Round must be closed before processing")

    r.status = "processing"
    db.commit()

    background_tasks.add_task(_run_processing, round_id)
    return {"message": "Processing started"}


def _run_processing(round_id: int):
    from app.db.session import SessionLocal
    from app.services.buyer_scorer import recalculate_buyer_scores
    from app.services.ai_matcher import run_ai_matching
    db = SessionLocal()
    try:
        master_items = db.query(MasterItem).filter(MasterItem.bid_round_id == round_id).all()
        bid_lines = (
            db.query(BidLine)
            .filter(BidLine.bid_round_id == round_id, BidLine.match_status == "pending")
            .all()
        )
        match_bid_lines(bid_lines, master_items)
        db.commit()

        # Tier 3: AI matching for remaining exceptions
        ai_summary = run_ai_matching(db, round_id)
        import logging
        logging.getLogger(__name__).info(f"Round {round_id} AI matching: {ai_summary}")

        select_winners(db, round_id)
        recalculate_buyer_scores(db, round_id)

        r = db.query(BidRound).filter(BidRound.id == round_id).first()
        if r:
            r.status = "complete"
            db.commit()
    finally:
        db.close()


@router.post("/{round_id}/ai-match")
def trigger_ai_match(round_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Re-run AI fuzzy matcher on all remaining unmatched/partial-match exceptions."""
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not r:
        raise HTTPException(404, "Round not found")
    background_tasks.add_task(_run_ai_match_only, round_id)
    return {"message": "AI matching started in background"}


def _run_ai_match_only(round_id: int):
    from app.db.session import SessionLocal
    from app.services.ai_matcher import run_ai_matching
    db = SessionLocal()
    try:
        summary = run_ai_matching(db, round_id)
        import logging
        logging.getLogger(__name__).info(f"Manual AI match round {round_id}: {summary}")
    finally:
        db.close()


@router.get("/{round_id}/comparison")
def get_comparison(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    """
    Returns all matched bid lines grouped by master item, with each buyer's price.
    Used by the comparison table UI.
    """
    master_items = db.query(MasterItem).filter(MasterItem.bid_round_id == round_id).order_by(MasterItem.row_number).all()
    lines = (
        db.query(BidLine)
        .filter(BidLine.bid_round_id == round_id, BidLine.match_status == "matched")
        .all()
    )

    # Index lines by master_item_id → buyer_id
    from collections import defaultdict
    by_item: dict = defaultdict(dict)
    for line in lines:
        buyer = db.query(User).filter(User.id == line.buyer_id).first()
        company = buyer.company_name if buyer else str(line.buyer_id)
        by_item[line.master_item_id][company] = {
            "buyer_id": line.buyer_id,
            "unit_price": line.unit_price,
            "is_winner": line.is_winner,
            "is_anomaly": line.is_anomaly,
            "bid_line_id": line.id,
        }

    # Collect all buyer company names across this round
    buyer_ids = {l.buyer_id for l in lines}
    buyer_map: dict[int, str] = {}
    for bid in buyer_ids:
        b = db.query(User).filter(User.id == bid).first()
        buyer_map[bid] = b.company_name if b else str(bid)
    buyers = sorted(set(buyer_map.values()))

    rows = []
    for mi in master_items:
        row: dict = {
            "master_item_id": mi.id,
            "part_number": mi.part_number,
            "description": mi.description,
            "quantity": mi.quantity,
            "reserve_price": mi.reserve_price,
            "bids": by_item.get(mi.id, {}),
        }
        rows.append(row)

    return {"buyers": buyers, "rows": rows}


@router.get("/{round_id}/summary")
def round_summary(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    lines = db.query(BidLine).filter(BidLine.bid_round_id == round_id).all()
    deals = db.query(Deal).filter(Deal.bid_round_id == round_id).all()
    exceptions = [l for l in lines if l.match_status == "exception"]

    return {
        "total_bid_lines": len(lines),
        "matched": len([l for l in lines if l.match_status == "matched"]),
        "exceptions": len(exceptions),
        "winners": len([l for l in lines if l.is_winner]),
        "deals": len(deals),
        "total_deal_value": round(sum(d.total_value for d in deals), 2),
        "exception_breakdown": _exception_breakdown(exceptions),
    }


def _exception_breakdown(lines):
    breakdown = {}
    for l in lines:
        t = l.exception_type or "unknown"
        breakdown[t] = breakdown.get(t, 0) + 1
    return breakdown


@router.get("/{round_id}/export/deals.xlsx")
def export_deals_xlsx(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    data = export_deals_excel(db, round_id)
    return StreamingResponse(iter([data]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename=deals_round_{round_id}.xlsx"})


@router.get("/{round_id}/export/deals.csv")
def export_deals_csv_route(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    data = export_deals_csv(db, round_id)
    return StreamingResponse(iter([data]), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=deals_round_{round_id}.csv"})


@router.get("/{round_id}/export/comparison.xlsx")
def export_comparison(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    data = export_bid_comparison_excel(db, round_id)
    return StreamingResponse(iter([data]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename=comparison_round_{round_id}.xlsx"})


@router.get("/{round_id}/export/award-sheet/{buyer_id}")
def export_single_award(round_id: int, buyer_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    buyer = db.query(User).filter(User.id == buyer_id).first()
    if not buyer:
        raise HTTPException(404, "Buyer not found")
    data = export_buyer_award_sheet(db, round_id, buyer_id)
    filename = f"award_{buyer.company_name or buyer.email}_{round_id}.xlsx".replace(" ", "_")
    return StreamingResponse(iter([data]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/{round_id}/export/all-awards.zip")
def export_all_awards(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    data = export_all_award_sheets_zip(db, round_id)
    return StreamingResponse(iter([data]), media_type="application/zip", headers={"Content-Disposition": f"attachment; filename=all_award_sheets_round_{round_id}.zip"})


@router.get("/{round_id}/export/razor.csv")
def export_razor(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    data = export_razor_csv(db, round_id)
    return StreamingResponse(iter([data]), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=razor_sales_order_round_{round_id}.csv"})


@router.get("/{round_id}/export/margin-report.xlsx")
def export_margin(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    data = export_margin_report(db, round_id)
    return StreamingResponse(iter([data]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename=margin_report_round_{round_id}.xlsx"})


@router.get("/report/summary")
def report_summary(db: Session = Depends(get_db), _=Depends(require_admin)):
    """
    Global KPI summary for the reporting dashboard.
    Returns aggregated stats across all rounds.
    """
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import func as sqlfunc
    from app.models.deal import Deal
    from app.models.user import User as UserModel

    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)

    deals_30d = db.query(Deal).filter(Deal.created_at >= thirty_days_ago, Deal.status == "approved").all()
    total_deal_value_30d = round(sum(d.total_value for d in deals_30d), 2)

    all_deals = db.query(Deal).filter(Deal.status == "approved").all()
    total_deal_value = round(sum(d.total_value for d in all_deals), 2)

    # Average margin % — compare winning_price to master reserve_price
    margins = []
    for d in all_deals:
        master = db.query(MasterItem).filter(MasterItem.id == d.master_item_id).first()
        if master and master.reserve_price and master.reserve_price > 0:
            margins.append((d.winning_price - master.reserve_price) / master.reserve_price * 100)
    avg_margin_pct = round(sum(margins) / len(margins), 2) if margins else 0.0

    active_buyers = db.query(User).filter(User.role == "buyer", User.is_active == True).count()

    all_rounds = db.query(BidRound).all()
    total_lines = db.query(BidLine).count()
    unmatched = db.query(BidLine).filter(BidLine.match_status == "exception", BidLine.exception_type == "unmatched").count()
    unbid_rate = round(unmatched / total_lines * 100, 2) if total_lines > 0 else 0.0

    # Top buyers by total margin contribution
    top_buyers = (
        db.query(User)
        .filter(User.role == "buyer", User.total_lines_bid > 0)
        .order_by(User.total_margin_contribution.desc())
        .limit(10)
        .all()
    )

    return {
        "kpis": {
            "total_deal_value_30d": total_deal_value_30d,
            "total_deal_value_all_time": total_deal_value,
            "avg_margin_pct": avg_margin_pct,
            "active_buyers": active_buyers,
            "unbid_rate_pct": unbid_rate,
            "total_rounds": len(all_rounds),
            "total_deals": len(all_deals),
        },
        "top_buyers": [
            {
                "id": b.id,
                "full_name": b.full_name,
                "company_name": b.company_name,
                "win_rate": round(b.win_rate * 100, 1),
                "total_lines_won": b.total_lines_won,
                "total_lines_bid": b.total_lines_bid,
                "total_margin_contribution": round(b.total_margin_contribution, 2),
                "buyer_score": round(b.buyer_score, 1),
            }
            for b in top_buyers
        ],
        "recent_rounds": [
            {
                "id": r.id,
                "name": r.name,
                "status": r.status,
                "total_line_items": r.total_line_items,
                "created_at": r.created_at,
            }
            for r in sorted(all_rounds, key=lambda x: x.created_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)[:5]
        ],
    }
