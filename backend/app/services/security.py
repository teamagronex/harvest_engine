"""
HarvestEngine: Cryptography and Security Utilities
Enforces:
- CSPRNG OTP generation
- HMAC-SHA256 with server pepper (OTP_PEPPER)
- Constant-time comparison (timing attack resistance)
- 256-bit random session tokens with SHA-256 storage hashing
- Strict Indian mobile phone number normalization and validation (+91 / 0 handling, 10 digits starting with 6-9)
"""

import hashlib
import hmac
import re
import secrets
from typing import Tuple
from app.config import settings


def validate_indian_phone(phone_input: str) -> str:
    """
    Validates and normalizes an Indian mobile number.
    Accepts: '9876543210', '+919876543210', '09876543210', '98765 43210', '+91 98765-43210'.
    Returns: Exactly 10 digits as a string.
    Raises: ValueError with actionable message if invalid.
    """
    if not phone_input or not isinstance(phone_input, str):
        raise ValueError("Mobile number is required.")

    # Remove spaces, dashes, parentheses
    cleaned = re.sub(r"[\s\-\(\)]", "", phone_input.strip())

    # Strip +91, 91 (if 12 digits), or leading 0
    if cleaned.startswith("+91"):
        cleaned = cleaned[3:]
    elif cleaned.startswith("91") and len(cleaned) == 12:
        cleaned = cleaned[2:]
    elif cleaned.startswith("0") and len(cleaned) == 11:
        cleaned = cleaned[1:]

    # Must be exactly 10 digits
    if not re.match(r"^[6-9]\d{9}$", cleaned):
        raise ValueError(
            "Please provide a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9."
        )

    return cleaned


def generate_csprng_otp(length: int = 6) -> str:
    """Generates a cryptographically secure random numeric OTP using secrets module."""
    digits = "0123456789"
    return "".join(secrets.choice(digits) for _ in range(length))


def compute_otp_hash(phone: str, purpose: str, otp: str) -> str:
    """
    Computes an HMAC-SHA256 hash using the secret OTP_PEPPER.
    Binding phone and purpose into the HMAC prevents cross-purpose replay attacks.
    """
    pepper = settings.OTP_PEPPER.encode("utf-8")
    message = f"{phone}:{purpose}:{otp}".encode("utf-8")
    return hmac.new(pepper, message, hashlib.sha256).hexdigest()


def verify_otp_hash(phone: str, purpose: str, user_otp: str, stored_hash: str) -> bool:
    """Verifies user provided OTP against stored hash using constant-time comparison."""
    calculated_hash = compute_otp_hash(phone, purpose, user_otp)
    return hmac.compare_digest(calculated_hash, stored_hash)


def generate_session_token() -> Tuple[str, str]:
    """
    Generates a cryptographically strong 256-bit session token.
    Returns:
        raw_token: High-entropy string sent ONLY to the client in HttpOnly cookie.
        token_hash: SHA-256 digest (64 hex characters) stored in the database.
    """
    raw_token = secrets.token_urlsafe(32)  # 256 bits of CSPRNG entropy
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    return raw_token, token_hash


def hash_token(raw_token: str) -> str:
    """Computes SHA-256 digest of a raw session token for lookup."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
