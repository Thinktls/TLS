"""
Eastern-time formatting for buyer-facing text (emails, templates).

Deadlines are stored in UTC. They were being rendered with a FIXED -5 hour offset and a
hardcoded "EST" label, which is wrong for ~8 months of the year: US Eastern is UTC-4 (EDT)
during daylight saving. That put the deadline in the invitation email a full hour behind what
the admin saw in the app (which correctly uses the America/New_York zone) — e.g. admin "2:56 PM"
vs email "1:56 PM". Using the real zone here keeps both in agreement and labels EST/EDT correctly.
"""
from datetime import datetime, timezone, timedelta

try:
    from zoneinfo import ZoneInfo
    _ET = ZoneInfo("America/New_York")
except Exception:  # pragma: no cover - zoneinfo/tzdata unavailable
    _ET = timezone(timedelta(hours=-5))  # last-resort fallback (no DST)


def format_et(dt: datetime | None, fmt: str = "%m/%d/%Y %I:%M %p") -> str:
    """Format a UTC datetime in US Eastern time with the correct EST/EDT label.

    Returns "" for None. A naive datetime is assumed to be UTC (that's how deadlines are stored).
    """
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    local = dt.astimezone(_ET)
    label = local.strftime("%Z") or "ET"
    return f"{local.strftime(fmt)} {label}"
