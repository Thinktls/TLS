"""
APScheduler background jobs:
  - 90-day auto-prune: deactivates buyers who haven't bid in 90+ days (nightly 02:00 UTC)
  - auto-close expired rounds: closes open rounds once their deadline passes (every 5 min)
"""
from datetime import datetime, timedelta, timezone
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)
_scheduler: BackgroundScheduler | None = None


def _recover_stuck_processing_rounds():
    """Reset any round stuck in 'processing' for too long back to 'closed' so the admin can
    re-process it. Processing runs as an in-process background task; on the free hosting tier a
    cold-start/restart can kill that task mid-run, leaving the round showing 0% forever. Since a
    (now model-consolidated) round finishes in seconds, anything still 'processing' after 20
    minutes is genuinely stuck, not slow."""
    from app.db.session import SessionLocal
    from app.models.bid_round import BidRound
    from app.api.routes.notifications import create_notification

    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=20)
        stuck = (
            db.query(BidRound)
            .filter(
                BidRound.status == "processing",
                BidRound.processing_started_at != None,
                BidRound.processing_started_at < cutoff,
            )
            .all()
        )
        for r in stuck:
            r.status = "closed"
            logger.warning(f"Recovered stuck round {r.id} '{r.name}' (processing since {r.processing_started_at}) -> closed")
            try:
                create_notification(
                    db,
                    title=f"Processing didn't finish: {r.name}",
                    body="This round was stuck processing and has been reset to Closed. Click Process again to retry.",
                    category="warning",
                    link=f"/admin/rounds/{r.id}",
                )
            except Exception:
                pass
        if stuck:
            db.commit()
    except Exception as e:
        logger.error(f"Recover stuck rounds failed: {e}")
    finally:
        db.close()


def _auto_close_expired_rounds():
    """Close any OPEN round whose submission deadline has passed.

    Buyers are already blocked from submitting after the deadline, so this just brings the
    round's state in line with reality — an admin no longer has to sit and click Close at the
    deadline. Notifies the admin in-app that the round is closed and ready to process.
    """
    from app.db.session import SessionLocal
    from app.models.bid_round import BidRound
    from app.api.routes.notifications import create_notification

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        expired = (
            db.query(BidRound)
            .filter(
                BidRound.status == "open",
                BidRound.submission_deadline != None,
                BidRound.submission_deadline < now,
            )
            .all()
        )
        for r in expired:
            r.status = "closed"
            r.closed_at = now
            logger.info(f"Auto-closed round {r.id} '{r.name}' (deadline {r.submission_deadline})")
            try:
                create_notification(
                    db,
                    title=f"Round auto-closed: {r.name}",
                    body="The submission deadline passed. The round is now closed and ready to process.",
                    category="info",
                    link=f"/admin/rounds/{r.id}",
                )
            except Exception:
                pass
        if expired:
            db.commit()
    except Exception as e:
        logger.error(f"Auto-close expired rounds failed: {e}")
    finally:
        db.close()


def _prune_inactive_buyers():
    from app.db.session import SessionLocal
    from app.models.user import User

    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=90)
        stale = (
            db.query(User)
            .filter(
                User.role == "buyer",
                User.is_active == True,
                User.last_bid_at != None,
                User.last_bid_at < cutoff,
            )
            .all()
        )
        count = 0
        for buyer in stale:
            buyer.is_active = False
            count += 1
            logger.info(f"Auto-pruned buyer {buyer.email} (last bid: {buyer.last_bid_at})")
        if count:
            db.commit()
        logger.info(f"90-day auto-prune complete: {count} buyer(s) deactivated")
    except Exception as e:
        logger.error(f"Auto-prune failed: {e}")
    finally:
        db.close()


def start_scheduler():
    global _scheduler
    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        _prune_inactive_buyers,
        trigger=CronTrigger(hour=2, minute=0),
        id="auto_prune_buyers",
        replace_existing=True,
    )
    _scheduler.add_job(
        _auto_close_expired_rounds,
        trigger=IntervalTrigger(minutes=5),
        id="auto_close_rounds",
        replace_existing=True,
        next_run_time=datetime.now(timezone.utc) + timedelta(seconds=30),
    )
    _scheduler.add_job(
        _recover_stuck_processing_rounds,
        trigger=IntervalTrigger(minutes=5),
        id="recover_stuck_rounds",
        replace_existing=True,
        next_run_time=datetime.now(timezone.utc) + timedelta(seconds=45),
    )
    _scheduler.start()
    logger.info("APScheduler started — auto-prune (nightly) + auto-close + stuck-round recovery (5 min)")


def stop_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
