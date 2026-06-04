"""
Email delivery — backends tried in order:
  1. Brevo API  (BREVO_API_KEY set)       ← HTTPS, works on all platforms
  2. SendGrid   (SENDGRID_API_KEY set)
  3. SMTP       (SMTP_HOST + SMTP_USER + SMTP_PASSWORD)
  4. Console    (dev fallback)
"""
import json
import logging
import smtplib
import ssl
import urllib.request
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)


def _send(to_email: str, to_name: str, subject: str, html_body: str):
    if settings.BREVO_API_KEY:
        _send_brevo_api(to_email, to_name, subject, html_body)
    elif settings.SENDGRID_API_KEY:
        _send_sendgrid(to_email, to_name, subject, html_body)
    elif settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD:
        _send_smtp(to_email, to_name, subject, html_body)
    else:
        logger.info(
            f"[EMAIL MOCK] No email provider configured.\n"
            f"  To: {to_email} ({to_name})\n"
            f"  Subject: {subject}\n"
            f"  Set BREVO_API_KEY in Render environment to enable real emails."
        )


def _send_brevo_api(to_email: str, to_name: str, subject: str, html_body: str):
    try:
        payload = json.dumps({
            "sender": {"name": settings.FROM_NAME, "email": settings.FROM_EMAIL},
            "to": [{"email": to_email, "name": to_name}],
            "subject": subject,
            "htmlContent": html_body,
        }).encode("utf-8")
        req = urllib.request.Request(
            "https://api.brevo.com/v3/smtp/email",
            data=payload,
            method="POST",
        )
        req.add_header("accept", "application/json")
        req.add_header("api-key", settings.BREVO_API_KEY)
        req.add_header("content-type", "application/json")
        with urllib.request.urlopen(req, timeout=15) as resp:
            logger.info(f"[EMAIL Brevo API] Sent to {to_email}: {subject} (status {resp.status})")
    except Exception as e:
        logger.error(f"[EMAIL Brevo API] Failed for {to_email}: {e}")


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


def _send_smtp(to_email: str, to_name: str, subject: str, html_body: str):
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.FROM_NAME} <{settings.FROM_EMAIL}>"
        msg["To"] = f"{to_name} <{to_email}>"
        msg.attach(MIMEText(html_body, "html"))

        context = ssl.create_default_context()
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls(context=context)
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.FROM_EMAIL, to_email, msg.as_string())
        logger.info(f"[EMAIL SMTP] Sent to {to_email}: {subject}")
    except Exception as e:
        logger.error(f"[EMAIL SMTP] Failed for {to_email}: {e}")


def send_bid_invitation(buyer_email: str, buyer_name: str, round_name: str, deadline: str, upload_url: str):
    subject = f"ThinkTLS Bid Invitation: {round_name}"
    body = f"""
    <h2>You've been invited to bid</h2>
    <p>Hello {buyer_name},</p>
    <p>ThinkTLS has opened a new bid round: <strong>{round_name}</strong></p>
    <p><strong>Submission deadline:</strong> {deadline}</p>
    <p>Please upload your pricing file using the link below:</p>
    <p><a href="{upload_url}" style="background:#0f3460;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;">Upload My Bid</a></p>
    <hr/>
    <p style="color:#666;font-size:12px;">ThinkTLS Bid Desk — Confidential</p>
    """
    _send(buyer_email, buyer_name, subject, body)


def send_round_results(buyer_email: str, buyer_name: str, round_name: str, won_count: int, lost_count: int, portal_url: str):
    subject = f"ThinkTLS Bid Results: {round_name}"
    body = f"""
    <h2>Your bid results are ready</h2>
    <p>Hello {buyer_name},</p>
    <p>Results for <strong>{round_name}</strong> are now available.</p>
    <table style="border-collapse:collapse;width:300px;">
      <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Items Won</strong></td><td style="padding:8px;border:1px solid #ddd;color:green;">{won_count}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Items Lost</strong></td><td style="padding:8px;border:1px solid #ddd;color:red;">{lost_count}</td></tr>
    </table>
    <br/>
    <p><a href="{portal_url}" style="background:#0f3460;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;">View My Results</a></p>
    <hr/>
    <p style="color:#666;font-size:12px;">ThinkTLS Bid Desk — Confidential</p>
    """
    _send(buyer_email, buyer_name, subject, body)


def send_exception_alert(admin_email: str, round_name: str, exception_count: int, review_url: str):
    subject = f"ThinkTLS: {exception_count} exceptions need review — {round_name}"
    body = f"""
    <h2>Exceptions require your attention</h2>
    <p>{exception_count} bid lines have been flagged in <strong>{round_name}</strong> and need manual review.</p>
    <p><a href="{review_url}" style="background:#e74c3c;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;">Review Exceptions</a></p>
    """
    _send(admin_email, "ThinkTLS Admin", subject, body)


def send_approval_ready_email(admin_email: str, round_name: str, deal_count: int, round_url: str):
    subject = f"ThinkTLS: Winners selected — {round_name} ready for approval"
    body = f"""
    <h2>Round ready for approval</h2>
    <p>Processing for <strong>{round_name}</strong> is complete with no open exceptions.</p>
    <table style="border-collapse:collapse;width:280px;margin:12px 0;">
      <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Deals Ready</strong></td><td style="padding:8px;border:1px solid #ddd;color:green;">{deal_count}</td></tr>
    </table>
    <p>All bid lines have been matched and winners selected. You may now review and approve the deals.</p>
    <p><a href="{round_url}" style="background:#0f3460;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;display:inline-block;">Review &amp; Approve</a></p>
    <hr/>
    <p style="color:#666;font-size:12px;">ThinkTLS Bid Desk — Confidential</p>
    """
    _send(admin_email, "ThinkTLS Admin", subject, body)


def send_password_reset(to_email: str, to_name: str, reset_url: str):
    subject = "ThinkTLS: Reset your password"
    body = f"""
    <h2>Password Reset Request</h2>
    <p>Hello {to_name},</p>
    <p>Click the button below to reset your password. This link expires in 2 hours.</p>
    <p><a href="{reset_url}" style="background:#0f3460;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;">Reset Password</a></p>
    <p>If you didn't request this, ignore this email.</p>
    <hr/>
    <p style="color:#666;font-size:12px;">ThinkTLS Bid Desk — Confidential</p>
    """
    _send(to_email, to_name, subject, body)


def send_buyer_invite(to_email: str, to_name: str, setup_url: str):
    subject = "Welcome to ThinkTLS Bid Desk — Set up your account"
    body = f"""
    <h2>Welcome to ThinkTLS Bid Desk</h2>
    <p>Hello {to_name},</p>
    <p>Your buyer account has been created. Click below to set your password and access the platform.</p>
    <p><a href="{setup_url}" style="background:#0f3460;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;">Set Up My Account</a></p>
    <p>This link expires in 72 hours.</p>
    <hr/>
    <p style="color:#666;font-size:12px;">ThinkTLS Bid Desk — Confidential</p>
    """
    _send(to_email, to_name, subject, body)
