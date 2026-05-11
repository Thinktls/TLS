"""
Export bid results to Excel or CSV.
Returns bytes ready to stream as a file download.
"""
import io
import csv
import pandas as pd
from sqlalchemy.orm import Session
from app.models.deal import Deal
from app.models.bid_line import BidLine
from app.models.master_item import MasterItem
from app.models.user import User


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


def export_deals_csv(db: Session, bid_round_id: int) -> bytes:
    deals = db.query(Deal).filter(Deal.bid_round_id == bid_round_id).all()

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=["Part Number", "Description", "Quantity", "Winning Price", "Total Value", "Winner Company", "Winner Email", "Status", "Razor Deal ID"])
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


def export_bid_comparison_excel(db: Session, bid_round_id: int) -> bytes:
    """Full bid comparison table — all buyers, all items, all prices."""
    lines = (
        db.query(BidLine)
        .filter(BidLine.bid_round_id == bid_round_id, BidLine.match_status == "matched")
        .order_by(BidLine.master_item_id)
        .all()
    )

    rows = []
    for l in lines:
        master = db.query(MasterItem).filter(MasterItem.id == l.master_item_id).first()
        buyer = db.query(User).filter(User.id == l.buyer_id).first()
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
