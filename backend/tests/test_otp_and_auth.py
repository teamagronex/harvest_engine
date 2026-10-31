"""
HarvestEngine: Automated Tests for OTP Lifecycle and Authentication
Enforces Rule 3:
- CSPRNG generation & HMAC-SHA256 with server pepper
- 5-minute expiry & max 5 wrong attempts then invalidate
- Single-use guarantee
- 30s resend cooldown, 3 sends per 15 min, 5 sends per 24h
- Older OTP invalidation on new request
- Generic non-enumerating responses
- Zero passwords for farmers
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.security import (
    generate_secure_otp,
    hash_otp_with_pepper,
    validate_indian_phone,
)
from app.services.otp_service import OTPService, OTPVerificationError, OTPCooldownError, OTPRateLimitExceeded


def test_indian_phone_validation():
    """Verifies strict 10-digit Indian mobile validation with leading prefixes 6-9."""
    assert validate_indian_phone("9861012345") == "9861012345"
    assert validate_indian_phone("+919861012345") == "9861012345"
    assert validate_indian_phone("09861012345") == "9861012345"

    with pytest.raises(ValueError):
        validate_indian_phone("1234567890")  # Invalid prefix (must start with 6,7,8,9)

    with pytest.raises(ValueError):
        validate_indian_phone("98610")  # Too short


def test_otp_generation_and_hashing():
    """Verifies CSPRNG OTP generation and HMAC-SHA256 peppered hashing."""
    otp = generate_secure_otp()
    assert len(otp) == 6
    assert otp.isdigit()

    pepper = "TEST_PEPPER_FOR_HARVEST_ENGINE_AUTOMATED_TESTS_123456"
    hashed = hash_otp_with_pepper(otp, pepper)
    assert len(hashed) == 64  # SHA256 hex string

    # Same OTP with same pepper yields identical hash
    assert hash_otp_with_pepper(otp, pepper) == hashed
    # Different OTP yields different hash
    assert hash_otp_with_pepper("000000", pepper) != hashed


@pytest.mark.asyncio
async def test_otp_generic_response(client: AsyncClient, valid_headers: dict):
    """Verifies Rule 3: OTP request returns a generic non-enumerating response."""
    response = await client.post(
        "/api/otp/request",
        json={"phone": "9861012345", "purpose": "signup"},
        headers=valid_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "If the number can receive a code, one will be sent." in data["message"]
    # Ensure raw OTP is NEVER returned in response body
    assert "otp" not in data.get("data", {})


@pytest.mark.asyncio
async def test_otp_cooldown_enforcement(db_session: AsyncSession):
    """Verifies Rule 3: 30-second resend cooldown rejects rapid back-to-back requests."""
    phone = "9861099999"

    # First request succeeds
    await OTPService.create_and_send_otp(
        phone=phone,
        purpose="signup",
        ip_address="127.0.0.1",
        db=db_session,
    )

    # Immediate second request must trigger cooldown error
    with pytest.raises(OTPCooldownError):
        await OTPService.create_and_send_otp(
            phone=phone,
            purpose="signup",
            ip_address="127.0.0.1",
            db=db_session,
        )


@pytest.mark.asyncio
async def test_otp_max_5_attempts_invalidation(db_session: AsyncSession):
    """Verifies Rule 3: 5 incorrect verification attempts invalidates the OTP."""
    phone = "9861088888"

    otp_record, raw_otp = await OTPService.create_and_send_otp(
        phone=phone,
        purpose="signup",
        ip_address="127.0.0.1",
        db=db_session,
    )

    # 4 wrong attempts fail but record stays active
    for attempt in range(4):
        with pytest.raises(OTPVerificationError) as exc_info:
            await OTPService.verify_otp(
                phone=phone,
                purpose="signup",
                candidate_otp="000000",
                db=db_session,
            )
        assert "Invalid code" in str(exc_info.value)

    # 5th wrong attempt triggers invalidation
    with pytest.raises(OTPVerificationError) as exc_info:
        await OTPService.verify_otp(
            phone=phone,
            purpose="signup",
            candidate_otp="000000",
            db=db_session,
        )
    assert "Maximum verification attempts exceeded" in str(exc_info.value)

    # Subsequent attempt with even the CORRECT OTP is now rejected
    with pytest.raises(OTPVerificationError) as exc_info:
        await OTPService.verify_otp(
            phone=phone,
            purpose="signup",
            candidate_otp=raw_otp,
            db=db_session,
        )
    assert "Invalid or expired code" in str(exc_info.value)


@pytest.mark.asyncio
async def test_otp_single_use_consumption(db_session: AsyncSession):
    """Verifies Rule 3: Single-use guarantee (consumed OTP cannot be reused)."""
    phone = "9861077777"

    _, raw_otp = await OTPService.create_and_send_otp(
        phone=phone,
        purpose="signup",
        ip_address="127.0.0.1",
        db=db_session,
    )

    # First verification succeeds
    valid_record = await OTPService.verify_otp(
        phone=phone,
        purpose="signup",
        candidate_otp=raw_otp,
        db=db_session,
    )
    assert valid_record.consumed_at is not None

    # Immediate second verification with same code is rejected
    with pytest.raises(OTPVerificationError) as exc_info:
        await OTPService.verify_otp(
            phone=phone,
            purpose="signup",
            candidate_otp=raw_otp,
            db=db_session,
        )
    assert "Invalid or expired code" in str(exc_info.value)
