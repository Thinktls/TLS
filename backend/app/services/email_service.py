"""
Email via SendGrid. Falls back to console logging if API key is missing.
"""
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, To
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


def _send(to_email: str, to_name: str, subject: str, html_body: str):
    if not settings.SENDGRID_API_KEY:
        logger.info(f"[EMAIL MOCK] To: {to_email} | Subject: {subject}")
        return

    message = Mail(
        from_email=(settings.FROM_EMAIL, settings.FROM_NAME),
        to_emails=To(to_email, to_name),
        subject=subject,
        html_content=html_body,
    )
    try:
        sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
        sg.send(message)
    except Exception as e:
        logger.error(f"SendGrid error for {to_email}: {e}")


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
