"""
HarvestEngine: Admin Security and Cryptography Utilities
Enforces Rule 9:
- Password hashed with PBKDF2-HMAC-SHA256 and a random salt
- 8-hour sessions stored as SHA-256 token hashes
- Account lockout after 5 consecutive failed login attempts (30-minute lockout)
- Immutable administrative audit logging
- Separate admin authentication and cookie name (ADMIN_SESSION_COOKIE_NAME)
"""

import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from fastapi import Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.admin import AdminAuditLog, AdminSession, AdminUser
from app.models.base import utc_now
from app.services.security import hash_token

logger = logging.getLogger("harvestengine.admin_security")

PBKDF2_ITERATIONS = 100_000


def hash_admin_password(password: str) -> str:
    """
    Hashes an admin password using PBKDF2-HMAC-SHA256 with a random 16-byte salt.
    Format: pbkdf2_sha256${iterations}${salt_hex}${hash_hex}
    """
    salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${key.hex()}"


def verify_admin_password(plain_password: str, stored_hash: str) -> bool:
    """Verifies a plain password against the stored PBKDF2-HMAC-SHA256 hash."""
    try:
        parts = stored_hash.split("$")
        if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
            return False
        iterations = int(parts[1])
        salt = bytes.fromhex(parts[2])
        expected_key = bytes.fromhex(parts[3])

        calculated_key = hashlib.pbkdf2_hmac(
            "sha256",
            plain_password.encode("utf-8"),
            salt,
            iterations,
        )
        return hmac.compare_digest(calculated_key, expected_key)
    except Exception as exc:
        logger.error("Admin password verification error: %s", exc)
        return False


class AdminAuthService:
    @staticmethod
    async def ensure_initial_admin(db: AsyncSession):
        """Bootstraps default administrator if no admin account exists."""
        query = select(AdminUser).where(AdminUser.username == settings.ADMIN_USERNAME)
        result = await db.execute(query)
        admin = result.scalar_one_or_none()
        if not admin:
            pwd_hash = hash_admin_password(settings.ADMIN_PASSWORD)
            new_admin = AdminUser(
                username=settings.ADMIN_USERNAME,
                password_hash=pwd_hash,
                failed_attempts=0,
                created_at=utc_now(),
            )
            db.add(new_admin)
            await db.commit()
            logger.info("Default admin user created: %s", settings.ADMIN_USERNAME)

    @staticmethod
    async def authenticate_admin(
        db: AsyncSession,
        username: str,
        password: str,
        ip_address: Optional[str] = None,
    ) -> AdminUser:
        """
        Authenticates an administrator with brute-force lockout:
        - 5 consecutive wrong attempts locks the account for 30 minutes
        - Resets counter on successful login
        """
        now = utc_now()
        query = select(AdminUser).where(AdminUser.username == username)
        result = await db.execute(query)
        admin = result.scalar_one_or_none()

        if not admin:
            # Constant time delay / generic error
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid administrator credentials.",
            )

        # Check if locked
        if admin.locked_until and admin.locked_until > now:
            remaining_mins = int((admin.locked_until - now).total_seconds() / 60) + 1
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account locked due to 5 failed attempts. Please try again in {remaining_mins} minutes.",
            )

        is_valid = verify_admin_password(password, admin.password_hash)

        if not is_valid:
            admin.failed_attempts += 1
            if admin.failed_attempts >= settings.ADMIN_MAX_LOGIN_ATTEMPTS:
                admin.locked_until = now + timedelta(minutes=settings.ADMIN_LOCKOUT_MINUTES)
                await db.commit()
                # Audit lockout
                await AdminAuthService.log_audit(
                    db=db,
                    admin_id=admin.id,
                    action="admin_lockout",
                    target_type="admin_user",
                    target_id=str(admin.id),
                    details=f"Account locked for {settings.ADMIN_LOCKOUT_MINUTES} mins after 5 failed attempts.",
                    ip_address=ip_address,
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Maximum login attempts exceeded. Account locked for {settings.ADMIN_LOCKOUT_MINUTES} minutes.",
                )
            await db.commit()
            remaining = settings.ADMIN_MAX_LOGIN_ATTEMPTS - admin.failed_attempts
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid administrator credentials. {remaining} attempt(s) remaining before lockout.",
            )

        # Reset failed attempts on success
        admin.failed_attempts = 0
        admin.locked_until = None
        await db.commit()
        return admin

    @staticmethod
    async def create_admin_session(
        db: AsyncSession,
        admin_id,
        response: Response,
        ip_address: Optional[str] = None,
    ) -> str:
        """Creates an 8-hour admin session, hashes token, and attaches separate admin cookie."""
        now = utc_now()
        raw_token = secrets.token_urlsafe(32)
        token_hash = hash_token(raw_token)
        expires_at = now + timedelta(hours=settings.ADMIN_SESSION_EXPIRE_HOURS)

        session_record = AdminSession(
            admin_id=admin_id,
            token_hash=token_hash,
            expires_at=expires_at,
            created_at=now,
            ip_address=ip_address,
        )
        db.add(session_record)
        await db.commit()

        # Set dedicated admin session cookie
        max_age_sec = settings.ADMIN_SESSION_EXPIRE_HOURS * 3600
        response.set_cookie(
            key=settings.ADMIN_SESSION_COOKIE_NAME,
            value=raw_token,
            max_age=max_age_sec,
            expires=expires_at,
            path="/",
            httponly=True,
            samesite="lax",
            secure=settings.SECURE,
        )
        return raw_token

    @staticmethod
    async def revoke_admin_session(
        db: AsyncSession,
        raw_token: str,
        response: Response,
    ):
        """Revokes the admin session."""
        now = utc_now()
        token_hash = hash_token(raw_token)
        stmt = (
            update(AdminSession)
            .where(AdminSession.token_hash == token_hash, AdminSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        await db.execute(stmt)
        await db.commit()
        response.delete_cookie(settings.ADMIN_SESSION_COOKIE_NAME, path="/")

    @staticmethod
    async def log_audit(
        db: AsyncSession,
        action: str,
        admin_id=None,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        details: Optional[str] = None,
        ip_address: Optional[str] = None,
    ):
        """Appends an immutable event to the admin audit log."""
        try:
            log_entry = AdminAuditLog(
                admin_id=admin_id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                details=details,
                ip_address=ip_address,
                created_at=utc_now(),
            )
            db.add(log_entry)
            await db.commit()
        except Exception as exc:
            logger.error("Failed to write admin audit log: %s", exc)


async def get_current_admin(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AdminUser:
    """Dependency ensuring caller is an authenticated administrator via 8-hour session cookie."""
    raw_token = request.cookies.get(settings.ADMIN_SESSION_COOKIE_NAME)
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication required. Please log in at /admin.",
        )

    now = utc_now()
    token_hash = hash_token(raw_token)

    query = (
        select(AdminSession)
        .where(
            AdminSession.token_hash == token_hash,
            AdminSession.revoked_at.is_(None),
            AdminSession.expires_at > now,
        )
    )
    result = await db.execute(query)
    session_rec = result.scalar_one_or_none()

    if not session_rec:
        response.delete_cookie(settings.ADMIN_SESSION_COOKIE_NAME, path="/")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin session expired or revoked. Please log in again.",
        )

    admin_query = select(AdminUser).where(AdminUser.id == session_rec.admin_id)
    admin = (await db.execute(admin_query)).scalar_one_or_none()

    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Administrator account not found.",
        )

    return admin
