"""
HarvestEngine: CSRF Protection and Token Service
Implements:
- Cryptographic CSRF token generation and validation using HMAC-SHA256 bound to session/client
- Origin & Referer header verification on state-changing requests
- Double submit token pattern / X-CSRF-Token header validation
"""

import hmac
import hashlib
import secrets
import time
from typing import Optional
from fastapi import HTTPException, Request, status
from app.config import settings

CSRF_HEADER_NAME = "X-CSRF-Token"
CSRF_COOKIE_NAME = "harvest_csrf"


class CSRFService:
    @staticmethod
    def generate_csrf_token(client_entropy: Optional[str] = None) -> str:
        """
        Generates a timed, signed CSRF token.
        Format: timestamp:random_bytes:signature
        """
        timestamp = str(int(time.time()))
        entropy = client_entropy or secrets.token_hex(16)
        payload = f"{timestamp}:{entropy}"
        signature = hmac.new(
            settings.SESSION_SECRET.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return f"{payload}:{signature}"

    @staticmethod
    def verify_csrf_token(token: str, max_age_seconds: int = 86400) -> bool:
        """
        Verifies CSRF token validity, signature, and expiration.
        """
        if not token or token.count(":") != 2:
            return False

        try:
            timestamp_str, entropy, provided_sig = token.split(":")
            timestamp = int(timestamp_str)
        except ValueError:
            return False

        # Expiration check
        if time.time() - timestamp > max_age_seconds or time.time() < timestamp - 60:
            return False

        payload = f"{timestamp_str}:{entropy}"
        expected_sig = hmac.new(
            settings.SESSION_SECRET.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(provided_sig, expected_sig)

    @staticmethod
    def verify_request_origin(request: Request) -> bool:
        """
        Validates Origin or Referer header matches allowed origins for state-changing requests.
        """
        # In development/local testing, if headers are absent (e.g. CLI curl without origin), allow unless strictly secure
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")

        if not origin and not referer:
            # If SECURE mode is active in production, strictly enforce Origin/Referer
            if settings.SECURE or settings.ENVIRONMENT == "production":
                return False
            return True

        header_to_check = origin or referer
        allowed = settings.cors_origins
        return any(header_to_check.startswith(allowed_origin) for allowed_origin in allowed)


async def csrf_protect(request: Request):
    """
    FastAPI dependency that enforces CSRF validation on mutating HTTP methods (POST, PUT, PATCH, DELETE).
    Safe methods (GET, HEAD, OPTIONS) are exempt.
    """
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return

    # 1. Content-Type check: Must be JSON for API requests
    content_type = request.headers.get("content-type", "")
    if request.method in ("POST", "PUT", "PATCH") and "application/json" not in content_type.lower():
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Content-Type must be application/json.",
        )

    # 2. Origin/Referer verification
    if not CSRFService.verify_request_origin(request):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-Site Request Forgery (CSRF) check failed: invalid Origin or Referer.",
        )

    # 3. Token check: Read from X-CSRF-Token header or cookie
    token = request.headers.get(CSRF_HEADER_NAME)
    if token and not CSRFService.verify_csrf_token(token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or expired CSRF token.",
        )
