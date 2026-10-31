"""
HarvestEngine: Pytest Configuration and Test Fixtures
Provides:
- In-memory SQLite async database engine & session fixtures
- FastAPI AsyncClient test client
- Synthetic test farmer, test admin, and CSRF token generator
"""

import asyncio
import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

# Set test environment flags
os.environ["ENVIRONMENT"] = "testing"
os.environ["SECURE"] = "false"
os.environ["DEV_OTP_LOGGING"] = "true"
os.environ["OTP_PEPPER"] = "TEST_PEPPER_FOR_HARVEST_ENGINE_AUTOMATED_TESTS_123456"
os.environ["ADMIN_PASSWORD"] = "TestAdminPass123!"
os.environ["SMS_PROVIDER"] = "disabled"

from app.database import Base, get_db
from app.main import app
from app.services.csrf import CSRFService
from app.services.admin_security import AdminSecurityService
from app.models.farmer import Farmer, FarmerAddress
from app.models.admin import AdminUser
from app.models.alert import AlertPreference

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestingSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def db_session():
    """Provides a fresh isolated database schema for each test function."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with TestingSessionLocal() as session:
        yield session

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession):
    """FastAPI AsyncClient overriding get_db with in-memory SQLite session."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
def csrf_token():
    """Generates a valid signed HMAC-SHA256 CSRF token."""
    return CSRFService.generate_csrf_token()


@pytest.fixture
def valid_headers(csrf_token: str):
    """Headers required for mutating HTTP requests (Origin + CSRF token)."""
    return {
        "Content-Type": "application/json",
        "Origin": "http://test",
        "X-CSRF-Token": csrf_token,
    }


@pytest_asyncio.fixture
async def seeded_farmer(db_session: AsyncSession):
    """Seeds a verified test farmer with address and alert preferences."""
    farmer = Farmer(
        phone_number="9861012345",
        name="Ramesh Pradhan",
        is_active=True,
    )
    db_session.add(farmer)
    await db_session.flush()

    address = FarmerAddress(
        farmer_id=farmer.id,
        pin_code="768028",
        village_or_town="Barpali",
        district="Bargarh",
        state="Odisha",
        latitude=21.1983,
        longitude=83.5852,
        confirmed=True,
    )
    db_session.add(address)

    pref = AlertPreference(
        farmer_id=farmer.id,
        heat_alerts=True,
        heavy_rain_alerts=True,
        irrigation_advisories=True,
        sms_enabled=False,
        preferred_language="en",
    )
    db_session.add(pref)

    await db_session.commit()
    await db_session.refresh(farmer)
    return farmer


@pytest_asyncio.fixture
async def seeded_admin(db_session: AsyncSession):
    """Seeds an active administrator with PBKDF2-HMAC-SHA256 hashed password."""
    salt = AdminSecurityService.generate_salt()
    pwd_hash = AdminSecurityService.hash_password("TestAdminPass123!", salt)

    admin = AdminUser(
        username="admin",
        password_hash=pwd_hash,
        password_salt=salt,
        is_active=True,
        is_superadmin=True,
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)
    return admin
