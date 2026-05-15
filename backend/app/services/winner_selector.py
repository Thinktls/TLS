"""
Winner selection engine:
  - Highest price wins per master item
  - Reserve price floor enforced
  - Tiebreaker = earliest upload timestamp
  - Fluff engine: losing buyers told (real_price * (1 + fluff_pct/100))
  - Anomaly detection: z-score > 2.5, or >10x median, or <20% of median
"""
import statistics
from sqlalchemy.orm import Session, selectinload
from app.models.bid_line import BidLine
from app.models.master_item import MasterItem
from app.models.deal import Deal
from app.models.user import User
from app.core.config import settings


def select_winners(db: Session, bid_round_id: int) -> list[Deal]:
    # selectinload(BidLine.bid_file) fires one IN-query for all distinct
    # bid_file_ids after loading lines — eliminates the N+1 that previously
    # hit the DB once per line when accessing l.bid_file.uploaded_at.
    matched_lines = (
        db.query(BidLine)
        .options(selectinload(BidLine.bid_file))
        .filter(BidLine.bid_round_id == bid_round_id, BidLine.match_status == "matched", BidLine.unit_price.isnot(None))
        .all()
    )

    # Group by master_item_id
    by_item: dict[int, list[BidLine]] = {}
    for line in matched_lines:
        by_item.setdefault(line.master_item_id, []).append(line)

    deals = []
    for item_id, lines in by_item.items():
        master = db.query(MasterItem).filter(MasterItem.id == item_id).first()
        if not master:
            continue

        # Anomaly detection
        prices = [l.unit_price for l in lines if l.unit_price]
        if len(prices) >= 3:
            mean_price = statistics.mean(prices)
            stdev = statistics.stdev(prices)
            for line in lines:
                z = abs(line.unit_price - mean_price) / stdev if stdev > 0 else 0
                line.z_score = round(z, 4)
                line.is_anomaly = (
                    z > 2.5
                    or line.unit_price > mean_price * 10
                    or line.unit_price < mean_price * 0.2
                )

        # Filter out below-reserve bids
        valid_lines = lines
        if master.reserve_price:
            below_reserve = [l for l in lines if l.unit_price < master.reserve_price]
            for l in below_reserve:
                l.match_status = "exception"
                l.exception_type = "below_reserve"
                l.exception_notes = f"Bid ${l.unit_price:.2f} is below reserve ${master.reserve_price:.2f}"
            valid_lines = [l for l in lines if l.unit_price >= master.reserve_price]

        if not valid_lines:
            continue

        # Sort: highest price first, tiebreak = earliest upload
        valid_lines.sort(key=lambda l: (-l.unit_price, l.bid_file.uploaded_at))
        winner = valid_lines[0]
        winner.is_winner = True
        winner.real_winning_price = winner.unit_price

        # Fluff engine: losing buyers told real_price * (1 + buyer_fluff%) only when enabled
        for loser in valid_lines[1:]:
            buyer = db.query(User).filter(User.id == loser.buyer_id).first()
            if buyer and buyer.fluff_enabled:
                fluff_pct = buyer.fluff_percentage
            elif not buyer:
                fluff_pct = settings.FLUFF_PERCENTAGE
            else:
                fluff_pct = 0.0
            loser.fluffed_loss_price = round(winner.unit_price * (1 + fluff_pct / 100), 4)

        # Create deal
        qty = master.quantity or winner.quantity or 1
        deal = Deal(
            bid_round_id=bid_round_id,
            master_item_id=item_id,
            winning_buyer_id=winner.buyer_id,
            winning_bid_line_id=winner.id,
            part_number=master.part_number,
            description=master.description,
            quantity=qty,
            winning_price=winner.unit_price,
            total_value=round(winner.unit_price * qty, 4),
        )
        db.add(deal)
        deals.append(deal)

    db.commit()
    return deals
