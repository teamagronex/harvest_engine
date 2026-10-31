"""
HarvestEngine: Automated Tests for OWASP Security Headers and CSRF Protection
Enforces:
- Rule 8: CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy
- Rule 8: CSRF (Origin/Referer check + signed HMAC token)
"""

import pytest
from httpx import AsyncClient
from app.services.csrf import CSRFService


@pytest.mark.asyncio
async def test_security_headers_present(client: AsyncClient):
    """Verifies that all OWASP recommended security headers are attached to responses."""
    response = await client.get("/api/health")
    assert response.status_code == 200

    headers = response.headers
    assert headers.get("X-Frame-Options") == "DENY"
    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "camera=()" in headers.get("Permissions-Policy", "")
    assert "frame-ancestors 'none'" in headers.get("Content-Security-Policy", "")
    assert headers.get("Cache-Control") == "no-store, max-age=0"


@pytest.mark.asyncio
async def test_csrf_token_generation_and_validation():
    """Verifies CSRF token HMAC signature generation and tamper rejection."""
    token = CSRFService.generate_csrf_token()
    assert token is not None
    assert CSRFService.validate_csrf_token(token) is True

    # Tampered token must fail
    tampered = token[:-4] + "abcd"
    assert CSRFService.validate_csrf_token(tampered) is False

    # Empty token must fail
    assert CSRFService.validate_csrf_token("") is False
    assert CSRFService.validate_csrf_token(None) is False


@pytest.mark.asyncio
async def test_mutating_request_rejected_without_csrf(client: AsyncClient):
    """Verifies that POST/PUT/PATCH requests fail with 403 when CSRF token is omitted."""
    # Attempt signup without CSRF token
    response = await client.post(
        "/api/farmers",
        json={"phone": "9876543210", "name": "Kisan Test", "otp": "123456"},
        headers={"Content-Type": "application/json", "Origin": "http://test"},
    )
    assert response.status_code == 403
    data = response.json()
    assert data["code"] in ("CSRF_FORBIDDEN", "CSRF_ERROR")


@pytest.mark.asyncio
async def test_mutating_request_rejected_with_invalid_origin(client: AsyncClient, csrf_token: str):
    """Verifies that requests from untrusted external origins are blocked by CSRF protection."""
    response = await client.post(
        "/api/farmers",
        json={"phone": "9876543210", "name": "Kisan Test", "otp": "123456"},
        headers={
            "Content-Type": "application/json",
            "Origin": "https://malicious-attacker-website.com",
            "X-CSRF-Token": csrf_token,
        },
    )
    assert response.status_code == 403
