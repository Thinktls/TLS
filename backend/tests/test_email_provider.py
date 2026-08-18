"""Provider resolution + SMTP/plain-text helpers for outbound email."""
from app.core.config import settings
from app.services import email_service as es


def test_provider_override_and_guard(monkeypatch):
    # EMAIL_PROVIDER=smtp is honored, and _send reports a clear error when SMTP_HOST is missing.
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "smtp")
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    assert es._resolve_provider() == "smtp"
    r = es._send("x@y.com", "X", "subj", "<p>hi</p>")
    assert r["ok"] is False and r["provider"] == "smtp" and "SMTP_HOST" in r["detail"]


def test_auto_resolution_prefers_configured(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "")
    monkeypatch.setattr(settings, "EMAIL_RELAY_URL", "")
    monkeypatch.setattr(settings, "EMAIL_RELAY_SECRET", "")
    monkeypatch.setattr(settings, "SENDGRID_API_KEY", "")
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp-relay.brevo.com")
    assert es._resolve_provider() == "smtp"
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    assert es._resolve_provider() == "none"


def test_html_to_text_strips_markup():
    out = es._html_to_text("<h1>Title</h1><p>Line one</p><p>Two &amp; three</p>")
    assert "Title" in out and "Line one" in out and "Two & three" in out
    assert "<" not in out and ">" not in out
