"""
Tests for Razor ERP client — exercises the stub/unconfigured path
and the retry logic without requiring a live Razor API.
"""
import pytest
from unittest.mock import patch, AsyncMock
from datetime import datetime, timezone

from app.services.razor_client import push_deal_to_razor, RazorPushError, MAX_ATTEMPTS
from app.models.deal import Deal

# push_deal_to_razor / _do_post are async (httpx.AsyncClient + asyncio.sleep backoff).
# pytest.ini sets asyncio_mode=auto, so `async def test_*` runs on the event loop with no
# marker. These tests mock the async _do_post so no live Razor API is needed.


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


async def test_push_fails_when_url_not_configured(db):
    """Without RAZOR_API_URL set, _do_post raises on every attempt, so the retry loop
    exhausts and push_deal_to_razor raises RazorPushError and marks the deal failed.
    asyncio.sleep is mocked so the exponential backoff doesn't actually wait in the test."""
    deal = _fake_deal()
    with patch("app.services.razor_client.settings.RAZOR_API_URL", ""), \
         patch("app.services.razor_client.asyncio.sleep", new=AsyncMock()):
        with pytest.raises(RazorPushError):
            await push_deal_to_razor(db, deal)
    assert deal.razor_push_status == "failed"


async def test_push_succeeds_with_mock_api(db):
    """When _do_post returns a Razor id, the deal is marked pushed_to_razor."""
    deal = _fake_deal()
    with patch("app.services.razor_client._do_post", new=AsyncMock(return_value="RAZ-12345")):
        result = await push_deal_to_razor(db, deal)

    assert result == "RAZ-12345"
    assert deal.razor_push_status == "success"
    assert deal.status == "pushed_to_razor"
    assert deal.razor_deal_id == "RAZ-12345"


async def test_retry_exhaustion(db):
    """If _do_post always raises, push should attempt MAX_ATTEMPTS times then raise."""
    deal = _fake_deal()
    call_count = 0

    async def failing_post(payload):
        nonlocal call_count
        call_count += 1
        raise ConnectionError("timeout")

    with patch("app.services.razor_client._do_post", side_effect=failing_post), \
         patch("app.services.razor_client.asyncio.sleep", new=AsyncMock()):  # skip backoff
        with pytest.raises(RazorPushError):
            await push_deal_to_razor(db, deal)

    assert call_count == MAX_ATTEMPTS
    assert deal.razor_push_status == "failed"
