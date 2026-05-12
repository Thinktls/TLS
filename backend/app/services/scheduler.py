"""
APScheduler background jobs:
  - 90-day auto-prune: deactivates buyers who haven't bid in 90+ days
  - Runs nightly at 02:00 UTC
"""
from datetime import datetime, timedelta, timezone
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)
_scheduler: BackgroundScheduler | None = None


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
    _scheduler.start()
    logger.info("APScheduler started — 90-day auto-prune job registered")


def stop_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
