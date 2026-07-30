"""
Email delivery priority:
  1. Vercel relay  (EMAIL_RELAY_URL + EMAIL_RELAY_SECRET set)  ← Gmail via Vercel
  2. SendGrid      (SENDGRID_API_KEY set)
  3. Console       (dev fallback — logs to stdout)
"""
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def _send(to_email: str, to_name: str, subject: str, html_body: str):
    if settings.EMAIL_RELAY_URL and settings.EMAIL_RELAY_SECRET:
        _send_via_relay(to_email, to_name, subject, html_body)
    elif settings.SENDGRID_API_KEY:
        _send_sendgrid(to_email, to_name, subject, html_body)
    else:
        logger.info(
            f"[EMAIL MOCK] No provider configured.\n"
            f"  To: {to_email}\n  Subject: {subject}\n"
            f"  Set EMAIL_RELAY_URL+EMAIL_RELAY_SECRET or SENDGRID_API_KEY in Render."
        )


def _send_via_relay(to_email: str, to_name: str, subject: str, html_body: str):
    try:
        import httpx
        url = f"{settings.EMAIL_RELAY_URL.rstrip('/')}/api/send-email"
        resp = httpx.post(
            url,
            json={"to_email": to_email, "to_name": to_name, "subject": subject, "html_body": html_body},
            headers={"x-email-secret": settings.EMAIL_RELAY_SECRET},
            timeout=15,
        )
        resp.raise_for_status()
        logger.info(f"[EMAIL Relay] Sent to {to_email}: {subject}")
    except Exception as e:
        logger.error(f"[EMAIL Relay] Failed for {to_email}: {e}")


def _send_sendgrid(to_email: str, to_name: str, subject: str, html_body: str):
    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail, To
        message = Mail(
            from_email=(settings.FROM_EMAIL, settings.FROM_NAME),
            to_emails=To(to_email, to_name),
            subject=subject,
            html_content=html_body,
        )
        SendGridAPIClient(settings.SENDGRID_API_KEY).send(message)
        logger.info(f"[EMAIL SendGrid] Sent to {to_email}: {subject}")
    except Exception as e:
        logger.error(f"[EMAIL SendGrid] Failed for {to_email}: {e}")


def send_bid_invitation(buyer_email: str, buyer_name: str, round_name: str, commodity: str, deadline: str, upload_url: str):
    from app.services.email_templates import bid_invitation_email
    subject, html = bid_invitation_email(buyer_name, round_name, commodity, deadline, upload_url)
    _send(buyer_email, buyer_name, subject, html)


def send_round_results(buyer_email: str, buyer_name: str, round_name: str, won_count: int, lost_count: int, portal_url: str, won_items: list | None = None):
    from app.services.email_templates import results_email
    subject, html = results_email(buyer_name, round_name, won_count, lost_count, portal_url, won_items or [])
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
