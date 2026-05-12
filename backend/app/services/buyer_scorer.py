"""
Buyer scorer: recalculates win_rate, total_lines_won/bid, total_margin_contribution
for every buyer who participated in a given round.
Called automatically after deal approval.
"""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.bid_line import BidLine
from app.models.deal import Deal
from app.models.master_item import MasterItem
from app.models.user import User


def recalculate_buyer_scores(db: Session, bid_round_id: int) -> None:
    buyer_ids = {
        row.buyer_id
        for row in db.query(BidLine.buyer_id)
        .filter(BidLine.bid_round_id == bid_round_id)
        .distinct()
        .all()
    }

    for buyer_id in buyer_ids:
        buyer = db.query(User).filter(User.id == buyer_id).first()
        if not buyer:
            continue

        # All bid lines ever submitted by this buyer (all rounds)
        all_lines = db.query(BidLine).filter(BidLine.buyer_id == buyer_id, BidLine.match_status == "matched").all()
        lines_bid = len(all_lines)
        lines_won = sum(1 for l in all_lines if l.is_winner)
        win_rate  = round(lines_won / lines_bid, 4) if lines_bid > 0 else 0.0

        # Margin contribution: sum(winning_price - reserve_price) for all won lines
        margin_total = 0.0
        last_win = None
        for line in all_lines:
            if line.is_winner:
                master = db.query(MasterItem).filter(MasterItem.id == line.master_item_id).first()
                if master and master.reserve_price and line.unit_price:
                    margin_total += max(0.0, line.unit_price - master.reserve_price) * (line.quantity or 1)
                if last_win is None or (line.created_at and line.created_at > last_win):
                    last_win = line.created_at

        buyer.win_rate = win_rate
        buyer.total_lines_won = lines_won
        buyer.total_lines_bid = lines_bid
        buyer.total_margin_contribution = round(margin_total, 2)
        buyer.score_updated_at = datetime.now(timezone.utc)
        if last_win:
            buyer.last_win_date = last_win

    db.commit()
