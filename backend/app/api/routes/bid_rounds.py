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
    export_razor_csv, export_margin_report, export_disposition_report,
)
from app.services.email_service import send_bid_invitation, send_round_results

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


@router.get("/report/monthly-deal-value")
def report_monthly_deal_value(db: Session = Depends(get_db), _=Depends(require_admin)):
    """Monthly approved deal value for the last 12 months."""
    from datetime import datetime, timedelta, timezone
    from app.models.deal import Deal

    now = datetime.now(timezone.utc)
    months = []
    for i in range(11, -1, -1):
        first_day = (now.replace(day=1) - timedelta(days=i * 28)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if first_day.month == 12:
            last_day = first_day.replace(year=first_day.year + 1, month=1, day=1)
        else:
            last_day = first_day.replace(month=first_day.month + 1, day=1)
        total = (
            db.query(Deal)
            .filter(Deal.status == "approved", Deal.created_at >= first_day, Deal.created_at < last_day)
            .all()
        )
        months.append({
            "month": first_day.strftime("%b %Y"),
            "value": round(sum(d.total_value for d in total), 2),
            "count": len(total),
        })
    return months


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


@router.get("/{round_id}/participation")
def get_round_participation(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Real-time buyer participation status for a round."""
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
        if not buyer:
            continue
        bid_file = (
            db.query(BidFile)
            .filter(BidFile.bid_round_id == round_id, BidFile.buyer_id == buyer.id)
            .order_by(BidFile.uploaded_at.desc())
            .first()
        )
        lines_submitted = (
            db.query(BidLine)
            .filter(BidLine.bid_round_id == round_id, BidLine.buyer_id == buyer.id)
            .count()
        ) if bid_file else 0

        result.append({
            "id": buyer.id,
            "full_name": buyer.full_name,
            "email": buyer.email,
            "company_name": buyer.company_name,
            "invite_status": row.invite_status,
            "invited_at": row.invited_at.isoformat() if row.invited_at else None,
            "uploaded_at": bid_file.uploaded_at.isoformat() if bid_file and bid_file.uploaded_at else None,
            "lines_submitted": lines_submitted,
            "file_name": bid_file.filename if bid_file else None,
        })

    total = len(result)
    sent = sum(1 for r in result if r["invite_status"] in ("sent", "uploaded", "processing", "ready"))
    uploaded = sum(1 for r in result if r["uploaded_at"])
    pending = sum(1 for r in result if r["invite_status"] == "pending")

    return {
        "buyers": result,
        "stats": {
            "total": total,
            "sent": sent,
            "uploaded": uploaded,
            "pending_invite": pending,
            "no_response": sent - uploaded,
        },
    }


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

    from app.core.config import settings as _settings
    deadline_str = r.submission_deadline.strftime("%B %d, %Y") if r.submission_deadline else "See admin for deadline"
    upload_url = f"{_settings.FRONTEND_URL}/portal/bid?round={round_id}"

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


@router.post("/{round_id}/send-results")
def send_results_notifications(round_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Send bid result emails to all buyers assigned to this round."""
    r = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not r:
        raise HTTPException(404, "Round not found")
    if r.status != "complete":
        raise HTTPException(400, "Round must be complete before sending results")

    assigned = db.execute(
        text("SELECT buyer_id FROM round_buyers WHERE round_id = :rid"), {"rid": round_id}
    ).fetchall()

    from app.core.config import settings
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")

    sent = 0
    for row in assigned:
        buyer = db.query(User).filter(User.id == row.buyer_id).first()
        if not buyer or not buyer.is_active:
            continue
        won = db.query(Deal).filter(Deal.bid_round_id == round_id, Deal.buyer_id == buyer.id).count()
        total_lines = db.query(BidLine).filter(BidLine.bid_round_id == round_id, BidLine.buyer_id == buyer.id, BidLine.match_status == "matched").count()
        lost = max(0, total_lines - won)
        portal_url = f"{frontend_url}/portal/results?round={round_id}"
        background_tasks.add_task(send_round_results, buyer.email, buyer.full_name, r.name, won, lost, portal_url)
        sent += 1

    return {"sent": sent, "message": f"Results queued for {sent} buyer(s)"}


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
    import logging as _log
    from app.db.session import SessionLocal
    from app.services.buyer_scorer import recalculate_buyer_scores
    from app.services.ai_matcher import run_ai_matching
    _logger = _log.getLogger(__name__)
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
        _logger.info(f"Round {round_id} AI matching: {ai_summary}")

        select_winners(db, round_id)
        recalculate_buyer_scores(db, round_id)

        r = db.query(BidRound).filter(BidRound.id == round_id).first()
        if r:
            r.status = "complete"
            db.commit()

            # Notify admin about processing completion
            from app.services.email_service import send_exception_alert
            from app.core.config import settings
            exceptions_count = db.query(BidLine).filter(
                BidLine.bid_round_id == round_id, BidLine.match_status == "exception"
            ).count()
            if exceptions_count > 0 and getattr(settings, "ADMIN_EMAIL", None):
                frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
                send_exception_alert(
                    settings.ADMIN_EMAIL, r.name, exceptions_count,
                    f"{frontend_url}/admin/rounds/{round_id}/exceptions"
                )

    except Exception as exc:
        _logger.error(f"Processing failed for round {round_id}: {exc}", exc_info=True)
        try:
            r = db.query(BidRound).filter(BidRound.id == round_id).first()
            if r:
                r.status = "error"
                db.commit()
        except Exception:
            pass
        raise

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


@router.get("/{round_id}/export/disposition.xlsx")
def export_disposition(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    data = export_disposition_report(db, round_id)
    return StreamingResponse(iter([data]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename=disposition_report_round_{round_id}.xlsx"})


@router.get("/{round_id}/analytics")
def round_analytics(round_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    """
    Rich analytics breakdown for a single bid round.
    Returns buyer performance, match quality, price distribution, anomalies, and timeline.
    """
    import statistics

    bid_round = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not bid_round:
        raise HTTPException(404, "Round not found")

    masters = db.query(MasterItem).filter(MasterItem.bid_round_id == round_id).all()
    all_lines = db.query(BidLine).filter(BidLine.bid_round_id == round_id).all()
    all_deals = db.query(Deal).filter(Deal.bid_round_id == round_id).all()
    bid_files = db.query(BidFile).filter(BidFile.bid_round_id == round_id).all()

    matched = [l for l in all_lines if l.match_status == "matched"]
    exceptions = [l for l in all_lines if l.match_status == "exception"]
    winners = [l for l in all_lines if l.is_winner]
    anomalies = [l for l in all_lines if l.is_anomaly]
    approved_deals = [d for d in all_deals if d.status == "approved"]

    # Coverage: master items that received at least one valid matched bid
    master_ids_with_bids = {l.master_item_id for l in matched}
    coverage_pct = round(len(master_ids_with_bids) / len(masters) * 100, 1) if masters else 0.0

    # Match method breakdown
    method_counts: dict[str, int] = {}
    for l in matched:
        m = l.match_method or "unknown"
        method_counts[m] = method_counts.get(m, 0) + 1

    # Exception type breakdown
    exc_breakdown: dict[str, int] = {}
    for l in exceptions:
        t = l.exception_type or "unknown"
        exc_breakdown[t] = exc_breakdown.get(t, 0) + 1

    # Buyer performance table
    participating_buyer_ids = {l.buyer_id for l in all_lines}
    buyer_rows = []
    for buyer_id in participating_buyer_ids:
        buyer = db.query(User).filter(User.id == buyer_id).first()
        if not buyer:
            continue
        buyer_lines = [l for l in matched if l.buyer_id == buyer_id]
        buyer_won = [l for l in buyer_lines if l.is_winner]
        buyer_deals = [d for d in approved_deals if d.winning_buyer_id == buyer_id]
        total_value = round(sum(d.total_value for d in buyer_deals), 2)
        bid_file = next((bf for bf in bid_files if bf.buyer_id == buyer_id), None)
        buyer_rows.append({
            "id": buyer_id,
            "company_name": buyer.company_name or buyer.full_name,
            "email": buyer.email,
            "lines_bid": len(buyer_lines),
            "lines_won": len(buyer_won),
            "win_rate_pct": round(len(buyer_won) / len(buyer_lines) * 100, 1) if buyer_lines else 0.0,
            "total_value_awarded": total_value,
            "anomalies": len([l for l in buyer_lines if l.is_anomaly]),
            "submitted_at": bid_file.uploaded_at.isoformat() if bid_file and bid_file.uploaded_at else None,
        })
    buyer_rows.sort(key=lambda x: x["total_value_awarded"], reverse=True)

    # Price distribution per master item (for items with >= 2 bids)
    price_dist = []
    for master in masters:
        item_lines = [l for l in matched if l.master_item_id == master.id and l.unit_price]
        if len(item_lines) < 2:
            continue
        prices = [l.unit_price for l in item_lines]
        winner_line = next((l for l in item_lines if l.is_winner), None)
        price_dist.append({
            "part_number": master.part_number,
            "description": (master.description or "")[:60],
            "bids": len(prices),
            "min_price": min(prices),
            "max_price": max(prices),
            "median_price": round(statistics.median(prices), 4),
            "mean_price": round(statistics.mean(prices), 4),
            "spread_pct": round((max(prices) - min(prices)) / statistics.mean(prices) * 100, 1) if statistics.mean(prices) > 0 else 0.0,
            "winning_price": winner_line.unit_price if winner_line else None,
            "reserve_price": master.reserve_price,
            "has_anomaly": any(l.is_anomaly for l in item_lines),
        })
    price_dist.sort(key=lambda x: x["spread_pct"], reverse=True)

    # Submission timeline (bid files by upload time)
    timeline = []
    for bf in sorted(bid_files, key=lambda b: b.uploaded_at or datetime.min):
        buyer = db.query(User).filter(User.id == bf.buyer_id).first()
        timeline.append({
            "buyer_name": buyer.company_name if buyer else "",
            "filename": bf.filename,
            "lines": bf.lines_parsed or 0,
            "uploaded_at": bf.uploaded_at.isoformat() if bf.uploaded_at else None,
            "status": bf.status,
        })

    return {
        "round": {
            "id": bid_round.id,
            "name": bid_round.name,
            "commodity": bid_round.commodity,
            "status": bid_round.status,
            "submission_deadline": bid_round.submission_deadline.isoformat() if bid_round.submission_deadline else None,
        },
        "overview": {
            "total_master_items": len(masters),
            "items_with_bids": len(master_ids_with_bids),
            "coverage_pct": coverage_pct,
            "total_bid_lines": len(all_lines),
            "matched_lines": len(matched),
            "exception_lines": len(exceptions),
            "exception_rate_pct": round(len(exceptions) / len(all_lines) * 100, 1) if all_lines else 0.0,
            "anomaly_count": len(anomalies),
            "total_deals": len(all_deals),
            "approved_deals": len(approved_deals),
            "total_awarded_value": round(sum(d.total_value for d in approved_deals), 2),
            "buyers_participated": len(participating_buyer_ids),
        },
        "match_methods": method_counts,
        "exception_breakdown": exc_breakdown,
        "buyer_performance": buyer_rows,
        "price_distribution": price_dist[:30],  # top 30 widest spreads
        "submission_timeline": timeline,
    }
