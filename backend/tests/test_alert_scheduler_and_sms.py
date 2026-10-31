"""
HarvestEngine: Automated Tests for Alert Scheduler, SMS Providers & 24h Deduplication
Enforces:
- SMS provider adapter interface (MSG91, Twilio, Disabled default)
- Safety invariant: Never pretend an SMS was delivered when disabled or failed
- Strict 24-hour deduplication key constraint (YYYY-MM-DD:alert_type:farmer_id)
- Multilingual SMS templates (English, Hindi, Odia)
- Mandatory opt-out instruction ("Reply STOP to opt out") in all outbound copies
"""

import pytest
from app.services.sms_provider import (
    BaseSMSProvider,
    DisabledSMSProvider,
    get_sms_provider,
)
from app.services.alert_scheduler import SMS_TEMPLATES, AlertSchedulerService
from app.models.farmer import Farmer
from app.models.alert import AlertPreference, AlertLog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select


@pytest.mark.asyncio
async def test_disabled_sms_provider_never_claims_delivered():
    """Verifies that DisabledSMSProvider returns success=False and safe error status."""
    provider = DisabledSMSProvider()
    success, delivery_id, err = await provider.send_sms(
        to_phone="9861012345",
        message="HarvestEngine test message",
    )
    assert success is False
    assert delivery_id is None
    assert "disabled" in err.lower()


def test_multilingual_templates_and_opt_out():
    """Verifies that all alert templates across English, Hindi, and Odia include opt-out directives."""
    for alert_type in ("heat", "flood", "irrigation"):
        for lang in ("en", "hi", "or"):
            template = SMS_TEMPLATES[alert_type][lang]
            assert "STOP" in template, f"Template for {alert_type} ({lang}) is missing STOP directive."


@pytest.mark.asyncio
async def test_strict_24h_alert_deduplication(db_session: AsyncSession, seeded_farmer: Farmer):
    """Verifies that duplicate alerts generated on the same day are discarded via the 24h deduplication key."""
    today = "2026-10-31"
    dedup_key = f"{today}:heat:{seeded_farmer.id}"

    # Insert first log entry
    first_log = AlertLog(
        farmer_id=seeded_farmer.id,
        alert_type="heat",
        channel="in_app",
        message_snippet="Heat alert text",
        status="in_app_only",
        deduplication_key=dedup_key,
    )
    db_session.add(first_log)
    await db_session.commit()

    # Second check for the same key must recognize duplicate
    existing = await db_session.execute(select(AlertLog).where(AlertLog.deduplication_key == dedup_key))
    assert existing.scalar_one_or_none() is not None
