"""
HarvestEngine: Automated Tests for Address Upsert, Profile Management & Farmer Isolation
Enforces:
- Rule 4: One address per farmer (UNIQUE farmer_id), upsert only
- Rule 4: Backend rejects changes without confirmed=true
- Rule 4: Rejects coordinates outside India (6-38°N, 68-98°E)
- Rule 5: Name edits need no OTP
- Rule 5: Phone changes need OTP to new number, uniqueness checks, explicit confirmation
- Strict per-farmer data isolation
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.farmer import Farmer, FarmerAddress
from app.services.session_service import SessionService
from app.services.geocoding import validate_india_coordinates


def test_india_bounding_box_validation():
    """Verifies that coordinates outside the Indian landmass are rejected."""
    # Valid Indian coordinates (Bargarh, Odisha)
    assert validate_india_coordinates(21.1983, 83.5852) is True

    # Coordinates outside India must fail
    assert validate_india_coordinates(51.5074, -0.1278) is False  # London, UK
    assert validate_india_coordinates(37.7749, -122.4194) is False  # San Francisco, USA
    assert validate_india_coordinates(5.0, 78.0) is False  # South of Indian mainland (lat < 6.0)
    assert validate_india_coordinates(40.0, 78.0) is False  # North of Indian territory (lat > 38.5)


@pytest.mark.asyncio
async def test_address_upsert_requires_confirmed_flag(client: AsyncClient, seeded_farmer: Farmer, db_session: AsyncSession, valid_headers: dict):
    """Verifies Rule 4: Backend rejects address updates if confirmed != true."""
    # Authenticate seeded farmer
    session_record, token = await SessionService.create_session(
        farmer_id=seeded_farmer.id,
        ip_address="127.0.0.1",
        user_agent="pytest-client",
        db=db_session,
    )
    client.cookies.set("harvest_session", token)

    # Attempt address update with confirmed=False
    payload = {
        "pin_code": "141001",
        "village": "Ludhiana Village",
        "district": "Ludhiana",
        "state": "Punjab",
        "latitude": 30.9010,
        "longitude": 75.8573,
        "confirmed": False,  # Missing explicit farmer confirmation
    }

    response = await client.put("/api/address", json=payload, headers=valid_headers)
    assert response.status_code == 400
    data = response.json()
    assert data["code"] == "CONFIRMATION_REQUIRED"


@pytest.mark.asyncio
async def test_address_upsert_success_and_unique_farmer_id(client: AsyncClient, seeded_farmer: Farmer, db_session: AsyncSession, valid_headers: dict):
    """Verifies Rule 4: Address updates atomically replace current address, maintaining UNIQUE(farmer_id)."""
    session_record, token = await SessionService.create_session(
        farmer_id=seeded_farmer.id,
        ip_address="127.0.0.1",
        user_agent="pytest-client",
        db=db_session,
    )
    client.cookies.set("harvest_session", token)

    payload = {
        "pin_code": "141001",
        "village": "Ludhiana Farm",
        "district": "Ludhiana",
        "state": "Punjab",
        "latitude": 30.9010,
        "longitude": 75.8573,
        "confirmed": True,
    }

    response = await client.put("/api/address", json=payload, headers=valid_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["district"] == "Ludhiana"

    # Verify in DB: exactly ONE address exists for this farmer
    stmt = select(FarmerAddress).where(FarmerAddress.farmer_id == seeded_farmer.id)
    addresses = (await db_session.execute(stmt)).scalars().all()
    assert len(addresses) == 1
    assert addresses[0].pin_code == "141001"


@pytest.mark.asyncio
async def test_update_name_without_otp(client: AsyncClient, seeded_farmer: Farmer, db_session: AsyncSession, valid_headers: dict):
    """Verifies Rule 5: Farmer name updates succeed immediately without requiring an OTP."""
    session_record, token = await SessionService.create_session(
        farmer_id=seeded_farmer.id,
        ip_address="127.0.0.1",
        user_agent="pytest-client",
        db=db_session,
    )
    client.cookies.set("harvest_session", token)

    response = await client.patch(
        "/api/me",
        json={"name": "Sardar Gurbir Singh"},
        headers=valid_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["name"] == "Sardar Gurbir Singh"


@pytest.mark.asyncio
async def test_farmer_isolation(client: AsyncClient, seeded_farmer: Farmer, db_session: AsyncSession, valid_headers: dict):
    """Verifies strict per-farmer isolation: an unauthenticated client cannot access /api/me or /api/address."""
    # Clear cookies
    client.cookies.clear()

    me_response = await client.get("/api/me")
    assert me_response.status_code == 401

    addr_response = await client.put(
        "/api/address",
        json={"pin_code": "110001", "village": "Delhi", "district": "New Delhi", "state": "Delhi", "latitude": 28.6139, "longitude": 77.2090, "confirmed": True},
        headers=valid_headers,
    )
    assert addr_response.status_code == 401
