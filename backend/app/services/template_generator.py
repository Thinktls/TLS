"""
Generate a bid template Excel file for a given round.
- Sheet 1: Instructions (read-only)
- Sheet 2: Bid Template — part numbers locked, only Unit Price and Quantity editable
Returns bytes.
"""
import io
from openpyxl import Workbook
from openpyxl.styles import (
    PatternFill, Font, Alignment, Border, Side, Protection
)
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session
from app.models.master_item import MasterItem
from app.models.bid_round import BidRound


DARK_FILL   = PatternFill("solid", fgColor="0F1629")
HEADER_FILL = PatternFill("solid", fgColor="1E3A5F")
LOCKED_FILL = PatternFill("solid", fgColor="1A2540")
EDIT_FILL   = PatternFill("solid", fgColor="0D2238")
WIN_FILL    = PatternFill("solid", fgColor="0A3020")

HEADER_FONT = Font(name="Calibri", bold=True, color="FFFFFF", size=10)
LOCK_FONT   = Font(name="Calibri", color="8899AA", size=10)
EDIT_FONT   = Font(name="Calibri", color="FFFFFF", size=10)
TITLE_FONT  = Font(name="Calibri", bold=True, color="3D81E3", size=14)
INSTR_FONT  = Font(name="Calibri", color="CCDDEE", size=10)

THIN_BORDER = Border(
    left=Side(style="thin", color="1E3A5F"),
    right=Side(style="thin", color="1E3A5F"),
    top=Side(style="thin", color="1E3A5F"),
    bottom=Side(style="thin", color="1E3A5F"),
)

CENTER = Alignment(horizontal="center", vertical="center")
LEFT   = Alignment(horizontal="left",   vertical="center", wrap_text=True)


def generate_bid_template(db: Session, round_id: int) -> bytes:
    bid_round = db.query(BidRound).filter(BidRound.id == round_id).first()
    if not bid_round:
        raise ValueError(f"Round {round_id} not found")

    items = (
        db.query(MasterItem)
        .filter(MasterItem.bid_round_id == round_id)
        .order_by(MasterItem.row_number)
        .all()
    )

    wb = Workbook()

    # ── Sheet 1: Instructions ─────────────────────────────────────────────────
    ws_instr = wb.active
    ws_instr.title = "Instructions"
    ws_instr.sheet_view.showGridLines = False
    ws_instr.sheet_properties.tabColor = "3D81E3"

    ws_instr.column_dimensions["A"].width = 4
    ws_instr.column_dimensions["B"].width = 80

    ws_instr["B2"].value = "ThinkTLS Bid Desk — Pricing Template"
    ws_instr["B2"].font  = TITLE_FONT
    ws_instr["B2"].fill  = DARK_FILL

    instructions = [
        ("Round",    bid_round.name),
        ("Commodity",bid_round.commodity),
        ("Deadline", str(bid_round.submission_deadline or "See invitation email")),
        ("",         ""),
        ("How to fill in this template:", ""),
        ("1.", "Go to the 'Bid Template' tab."),
        ("2.", "Only the UNIT PRICE and QUANTITY columns are editable (white background)."),
        ("3.", "Do NOT modify Part Number, Description, or Row # columns."),
        ("4.", "Leave Unit Price blank if you do not wish to bid on a line."),
        ("5.", "Save this file and upload it via the buyer portal."),
        ("",  ""),
        ("Confidential.", "This file is for authorized ThinkTLS buyers only. Do not share."),
    ]
    for row_offset, (label, value) in enumerate(instructions, start=4):
        cell_a = ws_instr.cell(row=row_offset, column=2, value=f"{label}  {value}")
        cell_a.font = INSTR_FONT
        cell_a.fill = DARK_FILL
        cell_a.alignment = LEFT

    ws_instr.protection.sheet = True
    ws_instr.protection.password = "thinktls"

    # ── Sheet 2: Bid Template ─────────────────────────────────────────────────
    ws = wb.create_sheet("Bid Template")
    ws.sheet_view.showGridLines = False
    ws.sheet_properties.tabColor = "059669"

    headers = ["Row #", "Part Number", "Manufacturer", "Description", "Quantity", "Unit Price ($)"]
    col_widths = [8, 22, 18, 50, 12, 18]
    editable_cols = {5, 6}  # Quantity and Unit Price (1-indexed)

    for col_idx, (header, width) in enumerate(zip(headers, col_widths), start=1):
        ws.column_dimensions[get_column_letter(col_idx)].width = width
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font  = HEADER_FONT
        cell.fill  = HEADER_FILL
        cell.alignment = CENTER
        cell.border = THIN_BORDER
        cell.protection = Protection(locked=True)

    ws.row_dimensions[1].height = 28

    for item in items:
        row = item.row_number or (items.index(item) + 2)
        values = [
            item.row_number,
            item.part_number,
            item.manufacturer or "",
            item.description or "",
            item.quantity,
            None,  # Unit Price — buyer fills this
        ]
        for col_idx, value in enumerate(values, start=1):
            cell = ws.cell(row=row + 1, column=col_idx, value=value)
            cell.border = THIN_BORDER
            if col_idx in editable_cols:
                cell.fill  = EDIT_FILL
                cell.font  = EDIT_FONT
                cell.protection = Protection(locked=False)
                cell.alignment = CENTER
            else:
                cell.fill  = LOCKED_FILL
                cell.font  = LOCK_FONT
                cell.protection = Protection(locked=True)
                cell.alignment = LEFT if col_idx == 4 else CENTER

    # Protect sheet — only unlocked cells can be edited
    ws.protection.sheet = True
    ws.protection.password = "thinktls"
    ws.protection.selectLockedCells = False
    ws.protection.selectUnlockedCells = False
    ws.protection.formatCells = False
    ws.protection.formatColumns = False
    ws.protection.formatRows = False
    ws.protection.insertColumns = False
    ws.protection.insertRows = False
    ws.protection.deleteColumns = False
    ws.protection.deleteRows = False
    ws.protection.sort = False
    ws.protection.autoFilter = False

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
