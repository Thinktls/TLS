"""
Email delivery:
  1. SendGrid  (SENDGRID_API_KEY set)  ← primary
  2. Console   (dev fallback — logs to stdout)
"""
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


def _send(to_email: str, to_name: str, subject: str, html_body: str):
    if settings.SENDGRID_API_KEY:
        _send_sendgrid(to_email, to_name, subject, html_body)
    else:
        logger.info(
            f"[EMAIL MOCK] No provider configured.\n"
            f"  To: {to_email}\n  Subject: {subject}\n"
            f"  Set SENDGRID_API_KEY in Render to enable emails."
        )


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


def send_bid_invitation(buyer_email: str, buyer_name: str, round_name: str, deadline: str, upload_url: str):
    _send(buyer_email, buyer_name, f"ThinkTLS Bid Invitation: {round_name}", f"""
    <h2>You've been invited to bid</h2>
    <p>Hello {buyer_name},</p>
    <p>ThinkTLS has opened a new bid round: <strong>{round_name}</strong></p>
    <p><strong>Submission deadline:</strong> {deadline}</p>
    <p><a href="{upload_url}" style="background:#0f3460;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;">Upload My Bid</a></p>
    <hr/><p style="color:#666;font-size:12px;">ThinkTLS Bid Desk — Confidential</p>
    """)


def send_round_results(buyer_email: str, buyer_name: str, round_name: str, won_count: int, lost_count: int, portal_url: str):
    _send(buyer_email, buyer_name, f"ThinkTLS Bid Results: {round_name}", f"""
    <h2>Your bid results are ready</h2>
    <p>Hello {buyer_name},</p>
    <p>Results for <strong>{round_name}</strong> are now available.</p>
    <table style="border-collapse:collapse;width:300px;">
      <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Items Won</strong></td><td style="padding:8px;border:1px solid #ddd;color:green;">{won_count}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Items Lost</strong></td><td style="padding:8px;border:1px solid #ddd;color:red;">{lost_count}</td></tr>
    </table>
    <br/><p><a href="{portal_url}" style="background:#0f3460;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;">View My Results</a></p>
    <hr/><p style="color:#666;font-size:12px;">ThinkTLS Bid Desk — Confidential</p>
    """)


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
    _send(to_email, to_name, "ThinkTLS: Reset your password", f"""
    <h2>Password Reset Request</h2>
    <p>Hello {to_name},</p>
    <p>Click below to reset your password. This link expires in 2 hours.</p>
    <p><a href="{reset_url}" style="background:#0f3460;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;">Reset Password</a></p>
    <p>If you didn't request this, ignore this email.</p>
    <hr/><p style="color:#666;font-size:12px;">ThinkTLS Bid Desk — Confidential</p>
    """)


def send_buyer_invite(to_email: str, to_name: str, setup_url: str):
    _send(to_email, to_name, "Welcome to ThinkTLS Bid Desk — Set up your account", f"""
    <h2>Welcome to ThinkTLS Bid Desk</h2>
    <p>Hello {to_name},</p>
    <p>Your buyer account has been created. Click below to set your password.</p>
    <p><a href="{setup_url}" style="background:#0f3460;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;">Set Up My Account</a></p>
    <p>This link expires in 72 hours.</p>
    <hr/><p style="color:#666;font-size:12px;">ThinkTLS Bid Desk — Confidential</p>
    """)
