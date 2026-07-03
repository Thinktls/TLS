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
    # Clear existing deals so re-runs don't produce duplicates.
    from app.models.approval_override import ApprovalOverride
    db.query(ApprovalOverride).filter(ApprovalOverride.bid_round_id == bid_round_id).delete(synchronize_session=False)
    db.query(Deal).filter(Deal.bid_round_id == bid_round_id).delete(synchronize_session=False)
    # Reset is_winner flag on all lines before re-selecting
    db.query(BidLine).filter(BidLine.bid_round_id == bid_round_id).update({"is_winner": False}, synchronize_session=False)
    db.flush()

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

    # Pre-fetch masters and buyers once to avoid N+1
    master_map = {
        m.id: m for m in db.query(MasterItem)
        .filter(MasterItem.bid_round_id == bid_round_id).all()
    }
    buyer_ids = {l.buyer_id for l in matched_lines}
    buyer_map = {
        b.id: b for b in db.query(User).filter(User.id.in_(buyer_ids)).all()
    }

    deals = []
    for item_id, lines in by_item.items():
        master = master_map.get(item_id)
        if not master:
            continue

        # Anomaly detection — flag outlier bids and route to exception queue.
        # With ≥3 bids: z-score + absolute ratio using the group mean.
        # With 2 bids: check max/min ratio directly (catches 10x typos like $1000 instead of $100).
        # With 1 bid: no peers, so no anomaly detection.
        prices = [l.unit_price for l in lines if l.unit_price]
        if len(prices) >= 2:
            mean_price = statistics.mean(prices)
            stdev = statistics.stdev(prices) if len(prices) >= 3 else None
            min_price = min(prices)
            max_price = max(prices)
            for line in lines:
                if line.unit_price is None:
                    continue
                z = abs(line.unit_price - mean_price) / stdev if stdev and stdev > 0 else 0
                line.z_score = round(z, 4)
                # Extreme ratio check works with 2 bids: flag the high bid when it's ≥10x the low bid
                extreme_high = (len(prices) == 2 and max_price > min_price * 10 and line.unit_price == max_price)
                if z > 2.5 or line.unit_price > mean_price * 10 or line.unit_price < mean_price * 0.2 or extreme_high:
                    line.is_anomaly = True
                    line.match_status = "exception"
                    line.exception_type = "price_anomaly"
                    if extreme_high or line.unit_price > mean_price * 10:
                        ratio = line.unit_price / min(p for p in prices if p != line.unit_price)
                        line.exception_notes = f"Bid ${line.unit_price:.2f} is {ratio:.0f}× other bids (${min_price:.2f}–${max_price:.2f}) — likely data entry error"
                    elif line.unit_price < mean_price * 0.2:
                        line.exception_notes = f"Bid ${line.unit_price:.2f} is {(1-line.unit_price/mean_price)*100:.0f}% below median ${mean_price:.2f} — possible magnitude error"
                    else:
                        line.exception_notes = f"Bid ${line.unit_price:.2f} has z-score {z:.2f} (group mean ${mean_price:.2f}) — statistical outlier"

        # Filter out below-reserve bids and anomalies from valid candidates
        valid_lines = [l for l in lines if not l.is_anomaly]
        if master.reserve_price:
            # Respect admin-approved exceptions: if a line was manually resolved
            # (exception_resolved=True, match_status="matched"), keep it as a
            # valid candidate even if it is below reserve.
            below_reserve = [
                l for l in valid_lines
                if l.unit_price < master.reserve_price and not l.exception_resolved
            ]
            for l in below_reserve:
                l.match_status = "exception"
                l.exception_type = "below_reserve"
                l.exception_notes = f"Bid ${l.unit_price:.2f} is below reserve ${master.reserve_price:.2f}"
            valid_lines = [
                l for l in valid_lines
                if l.unit_price >= master.reserve_price or l.exception_resolved
            ]

        if not valid_lines:
            continue

        # Sort: highest price first, tiebreak = earliest upload
        valid_lines.sort(key=lambda l: (-l.unit_price, l.bid_file.uploaded_at))
        winner = valid_lines[0]
        winner.is_winner = True
        winner.real_winning_price = winner.unit_price

        # Fluff engine: losing buyers told real_price * (1 + buyer_fluff%) only when enabled
        for loser in valid_lines[1:]:
            buyer = buyer_map.get(loser.buyer_id)
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
