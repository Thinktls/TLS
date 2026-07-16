"""
Winner selection engine:
  - Highest price wins per master item
  - Reserve price floor enforced
  - Tiebreaker = earliest upload timestamp
  - Fluff engine: losing buyers told (real_price * (1 + fluff_pct/100))
  - Anomaly detection: a bid is flagged when it is >2.5 std-devs from the group mean,
    or more than 10× the group mean, or less than 20% of the group mean. Flagged bids
    are routed to the exception queue with a plain-English reason (no statistics jargon)
    so an admin can tell at a glance why it was flagged and what to check.
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
    # Commit deals in batches instead of only at the very end. A per-unit memory round creates
    # ~9,305 deals; with a single trailing commit the admin's progress bar reads 0 deals for the
    # whole phase and then jumps, so the UI looked frozen. Flushing periodically lets the
    # processing-status poll watch the deal count climb.
    #
    # expire_on_commit must be off while we do that: committing mid-loop would otherwise expire
    # every loaded master/buyer/bid-line, and the next attribute read would re-SELECT each one
    # individually — turning a batched loop into thousands of queries. We only read attributes
    # already loaded here, so suppressing expiry is safe. Restored in the finally block.
    _DEAL_COMMIT_BATCH = 500
    _prev_expire = db.expire_on_commit
    db.expire_on_commit = False
    try:
        _select_winners_loop(db, bid_round_id, by_item, master_map, buyer_map, deals, _DEAL_COMMIT_BATCH)
    finally:
        db.expire_on_commit = _prev_expire
    db.commit()
    return deals


def _select_winners_loop(db, bid_round_id, by_item, master_map, buyer_map, deals, commit_batch):
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
            median_price = statistics.median(prices)  # shown to admins — more intuitive than the mean
            stdev = statistics.stdev(prices) if len(prices) >= 3 else None
            min_price = min(prices)
            max_price = max(prices)
            bid_count = len(prices)
            for line in lines:
                if line.unit_price is None:
                    continue
                z = abs(line.unit_price - mean_price) / stdev if stdev and stdev > 0 else 0
                line.z_score = round(z, 4)
                # Extreme ratio check works with 2 bids: flag the high bid when it's ≥10x the low bid
                extreme_high = (len(prices) == 2 and max_price > min_price * 10 and line.unit_price == max_price)
                too_high = line.unit_price > mean_price * 10
                # "Suspiciously low" is judged against the MEDIAN, and only once there are ≥3
                # bids to establish a norm. Against the mean with just 2 bids, one buyer's typo
                # poisoned the other: $100 vs a mistyped $5,000 gives a mean of $2,550, so the
                # perfectly good $100 bid fell under 20% of it and was flagged too — both bids
                # were then excluded from winning and the item got NO winner at all. The median
                # is not dragged by the outlier the way the mean is.
                too_low = len(prices) >= 3 and line.unit_price < median_price * 0.2
                if z > 2.5 or too_high or too_low or extreme_high:
                    line.is_anomaly = True
                    line.match_status = "exception"
                    line.exception_type = "price_anomaly"
                    # Plain-English reason — no "z-score"/"median"/"std-dev" jargon. Every note
                    # states the flagged price, how it compares to the other bids, the most likely
                    # cause, and what the admin should do.
                    others = [p for p in prices if p != line.unit_price] or prices
                    if extreme_high or too_high:
                        ratio = line.unit_price / (min(others) or 1)
                        line.exception_notes = (
                            f"This bid of ${line.unit_price:,.2f} is about {ratio:.0f}× higher than the "
                            f"other {bid_count - 1} bid(s) on this item (which ranged ${min_price:,.2f}–${max_price:,.2f}). "
                            f"This usually means an extra digit or zero was typed by mistake. "
                            f"Accept it only if the price is genuinely intended."
                        )
                    elif too_low:
                        pct = (1 - line.unit_price / median_price) * 100 if median_price else 0
                        line.exception_notes = (
                            f"This bid of ${line.unit_price:,.2f} is about {pct:.0f}% lower than the typical "
                            f"bid on this item (${median_price:,.2f}). This often means a decimal point or a "
                            f"zero was dropped. Confirm the price before allowing it to compete."
                        )
                    else:
                        line.exception_notes = (
                            f"This bid of ${line.unit_price:,.2f} stands out from the other bids on this item, "
                            f"which cluster around ${median_price:,.2f} (range ${min_price:,.2f}–${max_price:,.2f}). "
                            f"Flagged as a possible typo — review it before it competes."
                        )

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

        # Publish progress periodically so the admin's progress bar advances during this phase
        # rather than sitting still until every deal exists.
        if len(deals) % commit_batch == 0:
            db.commit()
