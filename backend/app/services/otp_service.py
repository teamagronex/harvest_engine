"""
HarvestEngine: OTP Service
Implements strict anti-abuse lifecycle:
- 30-second resend cooldown per phone
- Max 3 sends per 15 minutes per phone
- Max 5 sends per 24 hours per phone
- 5-minute expiry
- 5 wrong attempts max, then invalidated
- Single-use consumption
- Superceded OTP invalidation
- Generic anti-enumeration responses
- Absolute privacy: Never return OTP in response or log in production
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.base import utc_now
from app.models.otp import OTP
from app.services.security import (
    compute_otp_hash,
    generate_csprng_otp,
    verify_otp_hash,
)

logger = logging.getLogger("harvestengine.otp")


class OTPCooldownError(Exception):
    def __init__(self, wait_seconds: int):
        self.wait_seconds = wait_seconds
        super().__init__(f"Please wait {wait_seconds} seconds before requesting a new code.")


class OTPRateLimitExceeded(Exception):
    def __init__(self, message: str):
        super().__init__(message)


class OTPVerificationError(Exception):
    def __init__(self, message: str, remaining_attempts: Optional[int] = None):
        self.remaining_attempts = remaining_attempts
        super().__init__(message)


class OTPService:
    @staticmethod
    async def request_otp(
        db: AsyncSession,
        phone: str,
        purpose: str,
        ip_address: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """
        Processes an OTP request under strict anti-abuse rules.
        Returns:
            success (bool), generic_message (str)
        """
        now = utc_now()

        # 1. Check 30-second resend cooldown
        recent_otp_query = (
            select(OTP)
            .where(OTP.phone == phone, OTP.purpose == purpose)
            .order_by(OTP.sent_at.desc())
            .limit(1)
        )
        result = await db.execute(recent_otp_query)
        latest_otp = result.scalar_one_or_none()

        if latest_otp and latest_otp.sent_at:
            elapsed_seconds = (now - latest_otp.sent_at).total_seconds()
            if elapsed_seconds < settings.OTP_RESEND_COOLDOWN_SECONDS:
                wait_sec = int(settings.OTP_RESEND_COOLDOWN_SECONDS - elapsed_seconds)
                raise OTPCooldownError(wait_sec)

        # 2. Check 15-minute rate limit (max 3 sends)
        fifteen_mins_ago = now - timedelta(minutes=15)
        count_15m_query = select(func.count(OTP.id)).where(
            OTP.phone == phone,
            OTP.sent_at >= fifteen_mins_ago,
        )
        count_15m = (await db.execute(count_15m_query)).scalar() or 0
        if count_15m >= settings.OTP_MAX_SENDS_PER_15_MIN:
            raise OTPRateLimitExceeded(
                "Too many OTP requests in a short period. Please try again after 15 minutes."
            )

        # 3. Check 24-hour rate limit (max 5 sends)
        twenty_four_hours_ago = now - timedelta(hours=24)
        count_24h_query = select(func.count(OTP.id)).where(
            OTP.phone == phone,
            OTP.sent_at >= twenty_four_hours_ago,
        )
        count_24h = (await db.execute(count_24h_query)).scalar() or 0
        if count_24h >= settings.OTP_MAX_SENDS_PER_24_HR:
            raise OTPRateLimitExceeded(
                "Daily OTP request limit reached for this mobile number. Please try again tomorrow."
            )

        # 4. Invalidate any existing active OTPs for this phone and purpose
        invalidate_stmt = (
            update(OTP)
            .where(
                OTP.phone == phone,
                OTP.purpose == purpose,
                OTP.consumed_at.is_(None),
            )
            .values(consumed_at=now)
        )
        await db.execute(invalidate_stmt)

        # 5. Generate CSPRNG 6-digit code
        raw_otp = generate_csprng_otp(settings.OTP_LENGTH)
        otp_hash = compute_otp_hash(phone, purpose, raw_otp)
        expires_at = now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

        # 6. Save new OTP record
        new_otp = OTP(
            phone=phone,
            purpose=purpose,
            otp_hash=otp_hash,
            attempts=0,
            sent_at=now,
            expires_at=expires_at,
            ip_address=ip_address,
        )
        db.add(new_otp)
        await db.commit()

        # 7. Delivery / Logging policy
        # If DEV_OTP_LOGGING is explicitly enabled in dev mode, print to debug log.
        # NEVER log in production or when SECURE=True (enforced by Pydantic validator).
        if settings.DEV_OTP_LOGGING and not settings.SECURE and settings.ENVIRONMENT == "development":
            logger.info("[DEV ONLY - DO NOT USE IN PRODUCTION] OTP generated for %s (%s): %s", phone, purpose, raw_otp)
        else:
            logger.info("OTP dispatched securely for phone ending in ***%s [purpose=%s]", phone[-4:], purpose)

        # Return strictly generic response to protect farmer privacy
        return True, "If the number can receive a code, one will be sent."

    @staticmethod
    async def verify_otp(
        db: AsyncSession,
        phone: str,
        purpose: str,
        user_otp: str,
    ) -> bool:
        """
        Validates user submitted OTP.
        - Checks expiration
        - Increments attempt counter
        - Invalidates after 5 wrong attempts
        - Marks consumed on success
        """
        now = utc_now()

        # Fetch the most recent active OTP for this phone and purpose
        query = (
            select(OTP)
            .where(
                OTP.phone == phone,
                OTP.purpose == purpose,
                OTP.consumed_at.is_(None),
            )
            .order_by(OTP.sent_at.desc())
            .limit(1)
        )
        result = await db.execute(query)
        otp_record = result.scalar_one_or_none()

        if not otp_record:
            raise OTPVerificationError(
                "No active OTP found. Please request a new verification code."
            )

        # Check if already expired
        if otp_record.expires_at <= now:
            otp_record.consumed_at = now
            await db.commit()
            raise OTPVerificationError(
                "This verification code has expired. Please request a new one."
            )

        # Check attempts limit
        if otp_record.attempts >= settings.OTP_MAX_ATTEMPTS:
            otp_record.consumed_at = now
            await db.commit()
            raise OTPVerificationError(
                "Maximum attempts exceeded. This verification code has been invalidated. Please request a new one."
            )

        # Verify hash constant-time
        is_valid = verify_otp_hash(phone, purpose, user_otp, otp_record.otp_hash)

        if not is_valid:
            otp_record.attempts += 1
            remaining = settings.OTP_MAX_ATTEMPTS - otp_record.attempts
            if remaining <= 0:
                otp_record.consumed_at = now
                await db.commit()
                raise OTPVerificationError(
                    "Incorrect code. Maximum attempts reached and code invalidated. Please request a new code.",
                    remaining_attempts=0,
                )
            await db.commit()
            raise OTPVerificationError(
                f"Incorrect verification code. {remaining} attempt(s) remaining.",
                remaining_attempts=remaining,
            )

        # Mark consumed
        otp_record.consumed_at = now
        await db.commit()
        return True
