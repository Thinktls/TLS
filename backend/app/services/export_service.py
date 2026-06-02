"""
Export bid results to Excel, CSV, or ZIP.
All functions return bytes ready to stream as a file download.
"""
import io
import csv
import zipfile
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session
from app.models.deal import Deal
from app.models.bid_line import BidLine
from app.models.master_item import MasterItem
from app.models.user import User


# ── Shared style helpers ───────────────────────────────────────────────────────

DARK_FILL   = PatternFill("solid", fgColor="0F1629")
HEADER_FILL = PatternFill("solid", fgColor="1E3A5F")
WIN_FILL    = PatternFill("solid", fgColor="0A3020")
LOSS_FILL   = PatternFill("solid", fgColor="2A1010")
NEUTRAL_FILL= PatternFill("solid", fgColor="0D1825")

HEADER_FONT  = Font(name="Calibri", bold=True, color="FFFFFF", size=10)
WIN_FONT     = Font(name="Calibri", bold=True, color="34D399", size=10)
LOSS_FONT    = Font(name="Calibri", color="F87171", size=10)
NEUTRAL_FONT = Font(name="Calibri", color="AABBCC", size=10)

THIN = Border(
    left=Side(style="thin", color="1E3A5F"),
    right=Side(style="thin", color="1E3A5F"),
    top=Side(style="thin", color="1E3A5F"),
    bottom=Side(style="thin", color="1E3A5F"),
)
CENTER = Alignment(horizontal="center", vertical="center")
LEFT   = Alignment(horizontal="left",   vertical="center", wrap_text=True)


def _style_header_row(ws, num_cols: int, row: int = 1):
    for c in range(1, num_cols + 1):
        cell = ws.cell(row=row, column=c)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = CENTER
        cell.border = THIN
    ws.row_dimensions[row].height = 24


def _style_data_row(ws, row: int, num_cols: int, fill, font):
    for c in range(1, num_cols + 1):
        cell = ws.cell(row=row, column=c)
        cell.fill = fill
        cell.font = font
        cell.border = THIN
        cell.alignment = LEFT


# ── Deals Excel ───────────────────────────────────────────────────────────────

def export_deals_excel(db: Session, bid_round_id: int) -> bytes:
    deals = db.query(Deal).filter(Deal.bid_round_id == bid_round_id).all()
    rows = []
    for d in deals:
        buyer = db.query(User).filter(User.id == d.winning_buyer_id).first()
        rows.append({
            "Part Number": d.part_number,
            "Description": d.description,
            "Quantity": d.quantity,
            "Winning Price": d.winning_price,
            "Total Value": d.total_value,
            "Winner Company": buyer.company_name if buyer else "",
            "Winner Email": buyer.email if buyer else "",
            "Status": d.status,
            "Razor Deal ID": d.razor_deal_id or "",
        })
    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Deals")
    return buf.getvalue()


# ── Deals CSV ─────────────────────────────────────────────────────────────────

def export_deals_csv(db: Session, bid_round_id: int) -> bytes:
    deals = db.query(Deal).filter(Deal.bid_round_id == bid_round_id).all()
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=[
        "Part Number", "Description", "Quantity", "Winning Price",
        "Total Value", "Winner Company", "Winner Email", "Status", "Razor Deal ID",
    ])
    writer.writeheader()
    for d in deals:
        buyer = db.query(User).filter(User.id == d.winning_buyer_id).first()
        writer.writerow({
            "Part Number": d.part_number,
            "Description": d.description,
            "Quantity": d.quantity,
            "Winning Price": d.winning_price,
            "Total Value": d.total_value,
            "Winner Company": buyer.company_name if buyer else "",
            "Winner Email": buyer.email if buyer else "",
            "Status": d.status,
            "Razor Deal ID": d.razor_deal_id or "",
        })
    return buf.getvalue().encode()


# ── Full Bid Comparison Excel ─────────────────────────────────────────────────

def export_bid_comparison_excel(db: Session, bid_round_id: int) -> bytes:
    lines = (
        db.query(BidLine)
        .filter(BidLine.bid_round_id == bid_round_id, BidLine.match_status == "matched")
        .order_by(BidLine.master_item_id)
        .all()
    )
    rows = []
    for l in lines:
        master = db.query(MasterItem).filter(MasterItem.id == l.master_item_id).first()
        buyer  = db.query(User).filter(User.id == l.buyer_id).first()
        rows.append({
            "Part Number": master.part_number if master else l.raw_part_number,
            "Description": master.description if master else l.description,
            "Buyer Company": buyer.company_name if buyer else "",
            "Unit Price": l.unit_price,
            "Quantity": l.quantity,
            "Total Price": l.total_price,
            "Is Winner": "YES" if l.is_winner else "no",
            "Match Method": l.match_method,
            "Match Score": l.match_score,
            "Is Anomaly": "YES" if l.is_anomaly else "",
            "Z-Score": l.z_score,
        })
    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Bid Comparison")
    return buf.getvalue()


# ── Buyer Award Sheet ─────────────────────────────────────────────────────────

def export_buyer_award_sheet(db: Session, bid_round_id: int, buyer_id: int) -> bytes:
    buyer = db.query(User).filter(User.id == buyer_id).first()
    lines = (
        db.query(BidLine)
        .filter(
            BidLine.bid_round_id == bid_round_id,
            BidLine.buyer_id == buyer_id,
            BidLine.match_status == "matched",
        )
        .order_by(BidLine.master_item_id)
        .all()
    )

    wb = Workbook()
    ws = wb.active
    ws.title = "Award Sheet"
    ws.sheet_view.showGridLines = False

    # Header
    headers = ["Part Number", "Description", "Qty", "Your Price", "Result", "Loss Notice Price"]
    widths   = [22, 50, 8, 16, 10, 20]
    for i, (h, w) in enumerate(zip(headers, widths), start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
        ws.cell(row=1, column=i, value=h)
    _style_header_row(ws, len(headers))

    for row_idx, line in enumerate(lines, start=2):
        master = db.query(MasterItem).filter(MasterItem.id == line.master_item_id).first()
        result = "WON" if line.is_winner else "LOST"
        values = [
            master.part_number if master else line.raw_part_number,
            master.description if master else line.description,
            line.quantity,
            line.unit_price,
            result,
            line.fluffed_loss_price if not line.is_winner else "",
        ]
        fill = WIN_FILL if line.is_winner else LOSS_FILL
        font = WIN_FONT if line.is_winner else LOSS_FONT
        _style_data_row(ws, row_idx, len(headers), fill, font)
        for col_idx, val in enumerate(values, start=1):
            ws.cell(row=row_idx, column=col_idx, value=val)

    # Summary row
    won = sum(1 for l in lines if l.is_winner)
    lost = len(lines) - won
    ws.cell(row=len(lines) + 3, column=1, value=f"Total Won: {won}  |  Total Lost: {lost}")
    ws.cell(row=len(lines) + 3, column=1).font = Font(bold=True, color="FFFFFF")

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── ZIP of All Buyer Award Sheets ────────────────────────────────────────────

def export_all_award_sheets_zip(db: Session, bid_round_id: int) -> bytes:
    buyer_ids = {
        row.buyer_id
        for row in db.query(BidLine.buyer_id)
        .filter(BidLine.bid_round_id == bid_round_id, BidLine.match_status == "matched")
        .distinct()
        .all()
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for buyer_id in buyer_ids:
            buyer = db.query(User).filter(User.id == buyer_id).first()
            if not buyer:
                continue
            sheet_bytes = export_buyer_award_sheet(db, bid_round_id, buyer_id)
            name = f"{buyer.company_name or buyer.email}_award_{bid_round_id}.xlsx".replace(" ", "_")
            zf.writestr(name, sheet_bytes)

    return buf.getvalue()


# ── Razor-Compatible Sales Order CSV ─────────────────────────────────────────

def export_razor_csv(db: Session, bid_round_id: int) -> bytes:
    deals = (
        db.query(Deal)
        .filter(Deal.bid_round_id == bid_round_id, Deal.status == "approved")
        .all()
    )
    buf = io.StringIO()
    fieldnames = [
        "RAZOR_ITEM_CODE", "DESCRIPTION", "QTY", "UNIT_PRICE",
        "TOTAL_VALUE", "CUSTOMER_CODE", "VENDOR_CODE", "DEAL_REF",
    ]
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for d in deals:
        buyer = db.query(User).filter(User.id == d.winning_buyer_id).first()
        writer.writerow({
            "RAZOR_ITEM_CODE": d.part_number,
            "DESCRIPTION": (d.description or "")[:100],
            "QTY": d.quantity,
            "UNIT_PRICE": f"{d.winning_price:.4f}",
            "TOTAL_VALUE": f"{d.total_value:.4f}",
            "CUSTOMER_CODE": buyer.company_name if buyer else "",
            "VENDOR_CODE": buyer.email if buyer else "",
            "DEAL_REF": f"THINKTLS-{bid_round_id}-{d.id}",
        })
    return buf.getvalue().encode()


# ── Inventory Disposition Report ─────────────────────────────────────────────

def export_disposition_report(db: Session, bid_round_id: int) -> bytes:
    """
    Shows every master line item with disposition:
    AWARDED (has approved deal), NO_BIDS (no valid bid lines), BELOW_RESERVE,
    or PENDING (matched lines but no deal yet approved).
    """
    masters = db.query(MasterItem).filter(MasterItem.bid_round_id == bid_round_id).all()
    rows = []
    for m in masters:
        deal = (
            db.query(Deal)
            .filter(Deal.bid_round_id == bid_round_id, Deal.master_item_id == m.id, Deal.status == "approved")
            .first()
        )
        valid_lines = (
            db.query(BidLine)
            .filter(
                BidLine.bid_round_id == bid_round_id,
                BidLine.master_item_id == m.id,
                BidLine.match_status == "matched",
            )
            .all()
        )
        below_reserve_lines = (
            db.query(BidLine)
            .filter(
                BidLine.bid_round_id == bid_round_id,
                BidLine.master_item_id == m.id,
                BidLine.exception_type == "below_reserve",
            )
            .all()
        )

        if deal:
            disposition = "AWARDED"
            winner = db.query(User).filter(User.id == deal.winning_buyer_id).first()
            awarded_to = winner.company_name if winner else ""
            awarded_price = deal.winning_price
        elif valid_lines:
            disposition = "PENDING"
            awarded_to = ""
            awarded_price = None
        elif below_reserve_lines:
            disposition = "BELOW_RESERVE"
            awarded_to = ""
            awarded_price = None
        else:
            disposition = "NO_BIDS"
            awarded_to = ""
            awarded_price = None

        rows.append({
            "Part Number": m.part_number,
            "Description": m.description,
            "Quantity Requested": m.quantity,
            "Reserve Price": m.reserve_price,
            "Bids Received": len(valid_lines),
            "Disposition": disposition,
            "Awarded To": awarded_to,
            "Awarded Price": awarded_price,
            "Total Award Value": round(awarded_price * (m.quantity or 1), 4) if awarded_price else None,
        })

    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Disposition")
    return buf.getvalue()


# ── Margin Report Excel ───────────────────────────────────────────────────────

def export_margin_report(db: Session, bid_round_id: int) -> bytes:
    deals = db.query(Deal).filter(Deal.bid_round_id == bid_round_id).all()
    rows = []
    for d in deals:
        buyer  = db.query(User).filter(User.id == d.winning_buyer_id).first()
        master = db.query(MasterItem).filter(MasterItem.id == d.master_item_id).first()
        reserve = master.reserve_price if master else None
        margin  = round(d.winning_price - reserve, 4) if reserve else None
        margin_pct = round((margin / reserve * 100), 2) if (margin is not None and reserve) else None
        rows.append({
            "Part Number": d.part_number,
            "Description": d.description,
            "Quantity": d.quantity,
            "Reserve Price": reserve,
            "Winning Price": d.winning_price,
            "Margin $": margin,
            "Margin %": margin_pct,
            "Total Value": d.total_value,
            "Winner Company": buyer.company_name if buyer else "",
        })
    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Margin Report")
    return buf.getvalue()
