import os
import shutil
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.core.security import require_admin, get_current_user
from app.models.bid_round import BidRound
from app.models.master_item import MasterItem
from app.models.bid_file import BidFile
from app.models.bid_line import BidLine
from app.models.deal import Deal
from app.services.file_parser import parse_master_file
from app.services.matcher import match_bid_lines
from app.services.winner_selector import select_winners
from app.services.export_service import export_deals_excel, export_deals_csv, export_bid_comparison_excel

router = APIRouter(prefix="/rounds", tags=["bid_rounds"])

UPLOAD_DIR = "/tmp/thinktls_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


class RoundCreate(BaseModel):
    name: str
    commodity: str
    submission_deadline: datetime | None = None
    notes: str | None = None
    reserve_price_enabled: bool = False


class RoundOut(BaseModel):
    id: int
    name: str
    commodity: str
    status: str
    total_line_items: int
    master_file_uploaded: bool
    submission_deadline: datetime | None

    class Config:
        from_attributes = True


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
    db = SessionLocal()
    try:
        master_items = db.query(MasterItem).filter(MasterItem.bid_round_id == round_id).all()
        bid_lines = (
            db.query(BidLine)
            .filter(BidLine.bid_round_id == round_id, BidLine.match_status == "pending")
            .all()
        )
        matched = match_bid_lines(bid_lines, master_items)
        db.commit()

        select_winners(db, round_id)

        r = db.query(BidRound).filter(BidRound.id == round_id).first()
        if r:
            r.status = "complete"
            db.commit()
    finally:
        db.close()


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
