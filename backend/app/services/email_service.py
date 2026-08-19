"""
Email delivery priority:
  1. Vercel relay  (EMAIL_RELAY_URL + EMAIL_RELAY_SECRET set)  ← Gmail via Vercel
  2. SendGrid      (SENDGRID_API_KEY set)
  3. Console       (dev fallback — logs to stdout)
"""
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def _resolve_provider() -> str:
    """Which provider _send will use: honors EMAIL_PROVIDER override, else auto."""
    forced = (settings.EMAIL_PROVIDER or "").strip().lower()
    if forced in ("brevo", "sendgrid", "relay", "smtp"):
        return forced
    if settings.EMAIL_RELAY_URL and settings.EMAIL_RELAY_SECRET:
        return "relay"
    if settings.SENDGRID_API_KEY:
        return "sendgrid"
    if settings.BREVO_API_KEY:
        return "brevo"
    if settings.SMTP_HOST:
        return "smtp"
    return "none"


def email_provider_status() -> dict:
    """Which provider is active + which config is present (booleans only — never the secret values).
    Lets an admin see, without shell/log access, whether email is even wired up."""
    return {
        "active_provider": _resolve_provider(),
        "email_provider_override": (settings.EMAIL_PROVIDER or "").strip().lower() or "(auto)",
        "relay_url_set": bool(settings.EMAIL_RELAY_URL),
        "relay_secret_set": bool(settings.EMAIL_RELAY_SECRET),
        "sendgrid_key_set": bool(settings.SENDGRID_API_KEY),
        "brevo_key_set": bool(settings.BREVO_API_KEY),
        "smtp_host_set": bool(settings.SMTP_HOST),
        "from_email": settings.FROM_EMAIL,
        "reply_to": settings.REPLY_TO_EMAIL,
    }


def _send(to_email: str, to_name: str, subject: str, html_body: str) -> dict:
    """Send an email. Returns {"ok": bool, "provider": str, "detail": str} — never raises, so it's
    safe as a background task, but callers that care (invites, the email test) can inspect the
    result instead of a silent failure."""
    provider = _resolve_provider()
    if provider == "brevo":
        if not settings.BREVO_API_KEY:
            return {"ok": False, "provider": "brevo", "detail": "BREVO_API_KEY is not set"}
        return _send_brevo_api(to_email, to_name, subject, html_body)
    if provider == "sendgrid":
        if not settings.SENDGRID_API_KEY:
            return {"ok": False, "provider": "sendgrid", "detail": "SENDGRID_API_KEY is not set"}
        return _send_sendgrid(to_email, to_name, subject, html_body)
    if provider == "smtp":
        if not settings.SMTP_HOST:
            return {"ok": False, "provider": "smtp", "detail": "SMTP_HOST is not set"}
        return _send_smtp(to_email, to_name, subject, html_body)
    if provider == "relay":
        if not (settings.EMAIL_RELAY_URL and settings.EMAIL_RELAY_SECRET):
            return {"ok": False, "provider": "relay", "detail": "EMAIL_RELAY_URL / EMAIL_RELAY_SECRET not set"}
        return _send_via_relay(to_email, to_name, subject, html_body)
    msg = "No email provider configured (set EMAIL_PROVIDER=smtp + SMTP_* , or sendgrid + SENDGRID_API_KEY)."
    logger.warning(f"[EMAIL MOCK] {msg} To: {to_email} Subject: {subject}")
    return {"ok": False, "provider": "none", "detail": msg}


def _html_to_text(html: str) -> str:
    """Minimal plain-text alternative from HTML — every email should carry a text/plain part
    (an HTML-only message is a strong spam signal)."""
    import re
    text = re.sub(r"(?is)<(style|script).*?</\1>", " ", html)
    text = re.sub(r"(?i)</(p|div|tr|h[1-6]|li)>", "\n", text)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = (text.replace("&nbsp;", " ").replace("&amp;", "&")
                .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&#39;", "'"))
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    return "\n".join(line.strip() for line in text.splitlines()).strip()


def _send_brevo_api(to_email: str, to_name: str, subject: str, html_body: str) -> dict:
    """Send via Brevo's transactional HTTPS API — works even where outbound SMTP is blocked."""
    try:
        import httpx
        payload = {
            "sender": {"email": settings.FROM_EMAIL, "name": settings.FROM_NAME},
            "to": [{"email": to_email, "name": to_name or to_email}],
            "replyTo": {"email": settings.REPLY_TO_EMAIL},
            "subject": subject,
            "htmlContent": html_body,
            "textContent": _html_to_text(html_body),
        }
        resp = httpx.post(
            "https://api.brevo.com/v3/smtp/email",
            json=payload,
            headers={"api-key": settings.BREVO_API_KEY, "content-type": "application/json", "accept": "application/json"},
            timeout=20,
        )
        if resp.status_code >= 400:
            detail = f"brevo HTTP {resp.status_code}: {resp.text[:300]}"
            logger.error(f"[EMAIL Brevo] Failed for {to_email}: {detail}")
            return {"ok": False, "provider": "brevo", "detail": detail}
        logger.info(f"[EMAIL Brevo] Sent to {to_email}: {subject}")
        return {"ok": True, "provider": "brevo", "detail": "sent"}
    except Exception as e:
        detail = f"{type(e).__name__}: {e}"
        logger.error(f"[EMAIL Brevo] Failed for {to_email}: {detail}")
        return {"ok": False, "provider": "brevo", "detail": detail}


def _send_smtp(to_email: str, to_name: str, subject: str, html_body: str) -> dict:
    """Send via a generic SMTP provider (Brevo, Mailgun, Amazon SES, Mailjet, …)."""
    try:
        import smtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText
        from email.utils import formataddr

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = formataddr((settings.FROM_NAME, settings.FROM_EMAIL))
        msg["To"] = formataddr((to_name, to_email)) if to_name else to_email
        msg["Reply-To"] = settings.REPLY_TO_EMAIL
        msg.attach(MIMEText(_html_to_text(html_body), "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        port = int(settings.SMTP_PORT or 587)
        if port == 465:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, port, timeout=20) as s:
                s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                s.sendmail(settings.FROM_EMAIL, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(settings.SMTP_HOST, port, timeout=20) as s:
                s.starttls()
                s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                s.sendmail(settings.FROM_EMAIL, [to_email], msg.as_string())
        logger.info(f"[EMAIL SMTP] Sent to {to_email}: {subject}")
        return {"ok": True, "provider": "smtp", "detail": "sent"}
    except Exception as e:
        detail = f"{type(e).__name__}: {e}"
        logger.error(f"[EMAIL SMTP] Failed for {to_email}: {detail}")
        return {"ok": False, "provider": "smtp", "detail": detail}


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
