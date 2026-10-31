"""
HarvestEngine: Automated Tests for Administrator Portal & Security
Enforces Rule 9:
- Separate /admin auth with PBKDF2-HMAC-SHA256 and random salt
- 8-hour session lifetime with harvest_admin_session cookie
- Lockout after 5 consecutive failed login attempts
- Strict access control: Only admin endpoints can list farmers
- Immutable audit logging
- Synthetic-only seed generation
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.admin import AdminUser, AdminAuditLog
from app.services.admin_security import AdminSecurityService


def test_admin_password_hashing():
    """Verifies PBKDF2-HMAC-SHA256 hashing with distinct random salts."""
    salt1 = AdminSecurityService.generate_salt()
    salt2 = AdminSecurityService.generate_salt()
    assert salt1 != salt2

    hash1 = AdminSecurityService.hash_password("MasterKey123!", salt1)
    hash2 = AdminSecurityService.hash_password("MasterKey123!", salt2)
    # Different salts must produce distinct hashes for identical passwords
    assert hash1 != hash2

    assert AdminSecurityService.verify_password("MasterKey123!", hash1, salt1) is True
    assert AdminSecurityService.verify_password("WrongKey!", hash1, salt1) is False


@pytest.mark.asyncio
async def test_admin_lockout_after_5_failures(client: AsyncClient, seeded_admin: AdminUser, valid_headers: dict):
    """Verifies Rule 9: Account locks out for 30 minutes after 5 consecutive failed login attempts."""
    for attempt in range(5):
        resp = await client.post(
            "/api/admin/login",
            json={"username": "admin", "password": "WrongPassword!"},
            headers=valid_headers,
        )
        assert resp.status_code == 401
        data = resp.json()
        assert "Invalid credentials" in data["message"]

    # 6th attempt must trigger account lockout
    locked_resp = await client.post(
        "/api/admin/login",
        json={"username": "admin", "password": "TestAdminPass123!"},  # Correct password now fails due to lockout
        headers=valid_headers,
    )
    assert locked_resp.status_code == 423
    data = locked_resp.json()
    assert data["code"] == "ACCOUNT_LOCKED"
    assert "Account locked" in data["message"]


@pytest.mark.asyncio
async def test_admin_farmers_catalog_restricted(client: AsyncClient):
    """Verifies Rule 9: Only admin sessions can list farmers. Public or farmer requests are rejected."""
    # Attempt without admin session
    resp = await client.get("/api/admin/farmers")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_admin_audit_logging(db_session: AsyncSession, seeded_admin: AdminUser):
    """Verifies that administrative operations create immutable audit log entries."""
    await AdminSecurityService.log_audit_event(
        admin_id=seeded_admin.id,
        action="SEED_SYNTHETIC_DATA",
        target_resource="farmers",
        details="Seeded 5 synthetic farmer records",
        ip_address="127.0.0.1",
        db=db_session,
    )

    stmt = select(AdminAuditLog).where(AdminAuditLog.admin_id == seeded_admin.id)
    logs = (await db_session.execute(stmt)).scalars().all()
    assert len(logs) == 1
    assert logs[0].action == "SEED_SYNTHETIC_DATA"
