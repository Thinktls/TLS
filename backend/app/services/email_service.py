"""
Email delivery priority:
  1. Vercel relay  (EMAIL_RELAY_URL + EMAIL_RELAY_SECRET set)  ← Gmail via Vercel
  2. SendGrid      (SENDGRID_API_KEY set)
  3. Console       (dev fallback — logs to stdout)
"""
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def email_provider_status() -> dict:
    """Which provider is active + which config is present (booleans only — never the secret values).
    Lets an admin see, without shell/log access, whether email is even wired up."""
    relay = bool(settings.EMAIL_RELAY_URL and settings.EMAIL_RELAY_SECRET)
    sendgrid = bool(settings.SENDGRID_API_KEY)
    return {
        "active_provider": "relay" if relay else ("sendgrid" if sendgrid else "none"),
        "relay_url_set": bool(settings.EMAIL_RELAY_URL),
        "relay_secret_set": bool(settings.EMAIL_RELAY_SECRET),
        "sendgrid_key_set": sendgrid,
        "from_email": settings.FROM_EMAIL,
        "reply_to": settings.REPLY_TO_EMAIL,
    }


def _send(to_email: str, to_name: str, subject: str, html_body: str) -> dict:
    """Send an email. Returns {"ok": bool, "provider": str, "detail": str} — never raises, so it's
    safe as a background task, but callers that care (invites, the email test) can inspect the
    result instead of a silent failure."""
    if settings.EMAIL_RELAY_URL and settings.EMAIL_RELAY_SECRET:
        return _send_via_relay(to_email, to_name, subject, html_body)
    elif settings.SENDGRID_API_KEY:
        return _send_sendgrid(to_email, to_name, subject, html_body)
    else:
        msg = "No email provider configured (set EMAIL_RELAY_URL+EMAIL_RELAY_SECRET, or SENDGRID_API_KEY)."
        logger.warning(f"[EMAIL MOCK] {msg} To: {to_email} Subject: {subject}")
        return {"ok": False, "provider": "none", "detail": msg}


def _send_via_relay(to_email: str, to_name: str, subject: str, html_body: str) -> dict:
    try:
        import httpx
        url = f"{settings.EMAIL_RELAY_URL.rstrip('/')}/api/send-email"
        resp = httpx.post(
            url,
            json={
                "to_email": to_email, "to_name": to_name, "subject": subject,
                "html_body": html_body, "reply_to": settings.REPLY_TO_EMAIL,
            },
            headers={"x-email-secret": settings.EMAIL_RELAY_SECRET},
            timeout=20,
        )
        if resp.status_code >= 400:
            # Surface the relay's own error body (e.g. "Gmail env vars not set", auth/limit errors).
            detail = f"relay HTTP {resp.status_code}: {resp.text[:300]}"
            logger.error(f"[EMAIL Relay] Failed for {to_email}: {detail}")
            return {"ok": False, "provider": "relay", "detail": detail}
        logger.info(f"[EMAIL Relay] Sent to {to_email}: {subject}")
        return {"ok": True, "provider": "relay", "detail": "sent"}
    except Exception as e:
        detail = f"{type(e).__name__}: {e}"
        logger.error(f"[EMAIL Relay] Failed for {to_email}: {detail}")
        return {"ok": False, "provider": "relay", "detail": detail}


def _send_sendgrid(to_email: str, to_name: str, subject: str, html_body: str) -> dict:
    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail, To, ReplyTo
        message = Mail(
            from_email=(settings.FROM_EMAIL, settings.FROM_NAME),
            to_emails=To(to_email, to_name),
            subject=subject,
            html_content=html_body,
        )
        # Route replies to the brokers inbox, not the sending identity.
        message.reply_to = ReplyTo(settings.REPLY_TO_EMAIL, settings.FROM_NAME)
        resp = SendGridAPIClient(settings.SENDGRID_API_KEY).send(message)
        code = getattr(resp, "status_code", 0)
        if code >= 400:
            detail = f"sendgrid HTTP {code}"
            logger.error(f"[EMAIL SendGrid] Failed for {to_email}: {detail}")
            return {"ok": False, "provider": "sendgrid", "detail": detail}
        logger.info(f"[EMAIL SendGrid] Sent to {to_email}: {subject} (HTTP {code})")
        return {"ok": True, "provider": "sendgrid", "detail": f"sent (HTTP {code})"}
    except Exception as e:
        detail = f"{type(e).__name__}: {e}"
        logger.error(f"[EMAIL SendGrid] Failed for {to_email}: {detail}")
        return {"ok": False, "provider": "sendgrid", "detail": detail}


def send_bid_invitation(buyer_email: str, buyer_name: str, round_name: str, commodity: str, deadline: str, upload_url: str):
    from app.services.email_templates import bid_invitation_email
    subject, html = bid_invitation_email(buyer_name, round_name, commodity, deadline, upload_url)
    _send(buyer_email, buyer_name, subject, html)


def send_round_results(buyer_email: str, buyer_name: str, round_name: str, won_count: int, lost_count: int, portal_url: str, won_items: list | None = None, lost_items: list | None = None):
    from app.services.email_templates import results_email
    subject, html = results_email(buyer_name, round_name, won_count, lost_count, portal_url, won_items or [], lost_items or [])
    _send(buyer_email, buyer_name, subject, html)


def send_lines_removed(buyer_email: str, buyer_name: str, round_name: str, items: list, portal_url: str):
    """Tell a buyer that specific line(s) of their bid were removed and won't compete."""
    from app.services.email_templates import lines_removed_email
    if not items:
        return
    subject, html = lines_removed_email(buyer_name, round_name, items, portal_url)
    _send(buyer_email, buyer_name, subject, html)


def send_exception_alert(admin_email: str, round_name: str, exception_count: int, review_url: str):
    _send(admin_email, "ThinkTLS Admin", f"ThinkTLS: {exception_count} exceptions need review — {round_name}", f"""
    <h2>Exceptions require your attention</h2>
    <p>{exception_count} bid lines have been flagged in <strong>{round_name}</strong> and need manual review.</p>
    <p><a href="{review_url}" style="background:#e74c3c;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;">Review Exceptions</a></p>
    """)


def send_approval_ready_email(admin_email: str, round_name: str, deal_count: int, round_url: str):
    _send(admin_email, "ThinkTLS Admin", f"ThinkTLS: Winners selected — {round_name} ready for approval", f"""
    <h2>Round ready for approval</h2>
    <p>Processing for <strong>{round_name}</strong> is complete.</p>
    <table style="border-collapse:collapse;width:280px;margin:12px 0;">
      <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Deals Ready</strong></td><td style="padding:8px;border:1px solid #ddd;color:green;">{deal_count}</td></tr>
    </table>
    <p><a href="{round_url}" style="background:#0f3460;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;display:inline-block;">Review &amp; Approve</a></p>
    <hr/><p style="color:#666;font-size:12px;">ThinkTLS Bid Desk — Confidential</p>
    """)


def send_password_reset(to_email: str, to_name: str, reset_url: str):
    from app.services.email_templates import password_reset_email
    subject, html = password_reset_email(to_name, reset_url)
    _send(to_email, to_name, subject, html)
