"""
HarvestEngine: Farmer Session Management
Enforces:
- 256-bit cryptographically random tokens (only SHA-256 hash stored in DB)
- HttpOnly, SameSite=Lax, Secure=(SECURE==True) cookies
- Expiry + periodic rotation
- Revocation on sign-out
- Zero local/session storage identity leakage
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from fastapi import Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models.base import utc_now
from app.models.farmer import Farmer, Session
from app.services.security import generate_session_token, hash_token


class SessionService:
    @staticmethod
    async def create_session(
        db: AsyncSession,
        farmer_id,
        response: Response,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> str:
        """
        Creates a new session for a farmer, stores its SHA-256 hash in DB,
        and attaches an HttpOnly cookie to the response.
        Returns the raw_token (for immediate testing/cookie headers).
        """
        now = utc_now()
        raw_token, token_hash = generate_session_token()
        expires_at = now + timedelta(days=settings.SESSION_EXPIRE_DAYS)

        new_session = Session(
            farmer_id=farmer_id,
            token_hash=token_hash,
            expires_at=expires_at,
            created_at=now,
            last_active_at=now,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        db.add(new_session)
        await db.commit()

        # Set secure HttpOnly cookie
        max_age_seconds = settings.SESSION_EXPIRE_DAYS * 24 * 3600
        response.set_cookie(
            key=settings.SESSION_COOKIE_NAME,
            value=raw_token,
            max_age=max_age_seconds,
            expires=expires_at,
            path="/",
            httponly=True,
            samesite="lax",
            secure=settings.SECURE,
        )
        return raw_token

    @staticmethod
    async def revoke_session(
        db: AsyncSession,
        raw_token: str,
        response: Response,
    ) -> bool:
        """Revokes a session by marking revoked_at and clearing cookie."""
        now = utc_now()
        token_hash = hash_token(raw_token)
        
        stmt = (
            update(Session)
            .where(Session.token_hash == token_hash, Session.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        await db.execute(stmt)
        await db.commit()

        response.delete_cookie(
            key=settings.SESSION_COOKIE_NAME,
            path="/",
            httponly=True,
            samesite="lax",
            secure=settings.SECURE,
        )
        return True


async def get_current_farmer(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> Farmer:
    """
    FastAPI dependency to authenticate the farmer via HttpOnly session cookie.
    Validates token hash, checks expiration, handles automatic session rotation,
    and returns the Farmer ORM object with address and preferences loaded.
    """
    raw_token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in with your mobile number.",
        )

    now = utc_now()
    token_hash = hash_token(raw_token)

    query = (
        select(Session)
        .options(
            selectinload(Session.farmer).selectinload(Farmer.address),
            selectinload(Session.farmer).selectinload(Farmer.alert_preferences),
        )
        .where(
            Session.token_hash == token_hash,
            Session.revoked_at.is_(None),
            Session.expires_at > now,
        )
    )
    result = await db.execute(query)
    session_record = result.scalar_one_or_none()

    if not session_record or not session_record.farmer or not session_record.farmer.is_active:
        # Invalid or expired session
        response.delete_cookie(settings.SESSION_COOKIE_NAME, path="/")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired or was revoked. Please sign in again.",
        )

    # Automatic Session Rotation: If session is older than rotation interval, rotate token
    age_minutes = (now - session_record.created_at).total_seconds() / 60
    if age_minutes >= settings.SESSION_ROTATION_INTERVAL_MINUTES:
        new_raw, new_hash = generate_session_token()
        session_record.token_hash = new_hash
        session_record.created_at = now
        session_record.last_active_at = now
        await db.commit()

        # Update cookie with rotated token
        max_age = int((session_record.expires_at - now).total_seconds())
        response.set_cookie(
            key=settings.SESSION_COOKIE_NAME,
            value=new_raw,
            max_age=max_age,
            expires=session_record.expires_at,
            path="/",
            httponly=True,
            samesite="lax",
            secure=settings.SECURE,
        )
    else:
        session_record.last_active_at = now
        await db.commit()

    return session_record.farmer
