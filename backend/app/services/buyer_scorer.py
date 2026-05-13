"""
Buyer scorer: recalculates win_rate, total_lines_won/bid, total_margin_contribution,
and buyer_score composite for every buyer who participated in a given round.
Called automatically after each round processes.
"""
import math
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.bid_line import BidLine
from app.models.master_item import MasterItem
from app.models.user import User

logger = logging.getLogger(__name__)


def _compute_buyer_score(
    win_rate: float,
    lines_bid: int,
    lines_won: int,
    margin_contribution: float,
    last_win_date,
) -> float:
    """
    Composite buyer score 0–100.

    Components:
      Win rate    (0–45 pts) — win_rate × 45
      Activity    (0–30 pts) — log-normalised against 1 000 lines target
      Margin      (0–15 pts) — log-normalised against $100 000 target
      Recency     (0–10 pts) — decays 1 pt per 30 days since last win

    All components are null-safe and division-free at zero inputs.
    """
    # Component 1: win rate
    win_component = win_rate * 45.0

    # Component 2: activity volume
    activity_component = min(30.0, math.log1p(lines_bid) / math.log1p(1_000) * 30.0)

    # Component 3: margin contribution
    margin_component = min(15.0, math.log1p(max(0.0, margin_contribution)) / math.log1p(100_000) * 15.0)

    # Component 4: recency
    recency_component = 0.0
    if last_win_date is not None and lines_won > 0:
        now = datetime.now(timezone.utc)
        lw = last_win_date if last_win_date.tzinfo else last_win_date.replace(tzinfo=timezone.utc)
        days_since = max(0, (now - lw).days)
        recency_component = max(0.0, 10.0 - days_since / 30.0)

    raw = win_component + activity_component + margin_component + recency_component
    return round(min(100.0, max(0.0, raw)), 2)


def recalculate_buyer_scores(db: Session, bid_round_id: int) -> None:
    buyer_ids = {
        row.buyer_id
        for row in db.query(BidLine.buyer_id)
        .filter(BidLine.bid_round_id == bid_round_id)
        .distinct()
        .all()
    }

    updated = 0
    for buyer_id in buyer_ids:
        buyer = db.query(User).filter(User.id == buyer_id).first()
        if not buyer:
            continue

        # All matched bid lines across all rounds for this buyer
        all_lines = (
            db.query(BidLine)
            .filter(BidLine.buyer_id == buyer_id, BidLine.match_status == "matched")
            .all()
        )
        lines_bid = len(all_lines)
        lines_won = sum(1 for l in all_lines if l.is_winner)
        win_rate = round(lines_won / lines_bid, 4) if lines_bid > 0 else 0.0

        # Margin contribution: sum((winning_price - reserve_price) × qty) for won lines
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

        # Composite score (0–100) written to buyer_score column
        buyer.buyer_score = _compute_buyer_score(
            win_rate=win_rate,
            lines_bid=lines_bid,
            lines_won=lines_won,
            margin_contribution=margin_total,
            last_win_date=last_win,
        )
        updated += 1

    db.commit()
    logger.info(f"[buyer_scorer] round={bid_round_id} updated {updated} buyer scores")
