"""
Tests for Razor ERP client — exercises the stub/unconfigured path
and the retry logic without requiring a live Razor API.
"""
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone

from app.services.razor_client import push_deal_to_razor, RazorPushError, MAX_ATTEMPTS
from app.models.deal import Deal


def _fake_deal():
    d = Deal()
    d.id = 1
    d.part_number = "ABC-001"
    d.description = "Test Part"
    d.quantity = 5
    d.winning_price = 99.99
    d.total_value = 499.95
    d.winning_buyer_id = 1
    d.bid_round_id = 1
    d.status = "approved"
    d.approved_at = datetime.now(timezone.utc)
    d.approved_by = "admin@test.com"
    d.razor_push_status = None
    d.razor_deal_id = None
    d.razor_pushed_at = None
    return d


def test_push_fails_when_url_not_configured(db):
    """Without RAZOR_API_URL set, should raise RazorPushError and mark deal failed."""
    deal = _fake_deal()
    with pytest.raises(RazorPushError):
        push_deal_to_razor(db, deal)
    assert deal.razor_push_status == "failed"


def test_push_succeeds_with_mock_api(db):
    """When Razor returns 200 with an id, deal should be marked pushed_to_razor."""
    deal = _fake_deal()

    mock_resp = MagicMock()
    mock_resp.json.return_value = {"id": "RAZ-12345"}
    mock_resp.raise_for_status = MagicMock()

    with patch("app.services.razor_client.RAZOR_API_URL", "https://fake-razor.example.com"), \
         patch("app.services.razor_client._do_post", return_value="RAZ-12345"):
        result = push_deal_to_razor(db, deal)

    assert result == "RAZ-12345"
    assert deal.razor_push_status == "success"
    assert deal.status == "pushed_to_razor"
    assert deal.razor_deal_id == "RAZ-12345"


def test_retry_exhaustion(db):
    """If _do_post always raises, should attempt MAX_ATTEMPTS times then raise."""
    deal = _fake_deal()
    call_count = 0

    def failing_post(payload):
        nonlocal call_count
        call_count += 1
        raise ConnectionError("timeout")

    with patch("app.services.razor_client.RAZOR_API_URL", "https://fake-razor.example.com"), \
         patch("app.services.razor_client._do_post", side_effect=failing_post), \
         patch("app.services.razor_client.time.sleep"):  # skip backoff delay in tests
        with pytest.raises(RazorPushError):
            push_deal_to_razor(db, deal)

    assert call_count == MAX_ATTEMPTS
    assert deal.razor_push_status == "failed"
