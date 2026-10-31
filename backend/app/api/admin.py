"""
HarvestEngine: Administrator API Router
Enforces Rule 9:
- Dedicated /admin authentication and separate cookie (harvest_admin_session)
- Only admin endpoints can list farmers
- Comprehensive audit logging of administrative actions
- Synthetic-only seed generation
"""

import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models.admin import AdminAuditLog, AdminUser
from app.models.alert import AlertPreference
from app.models.base import utc_now
from app.models.farmer import Farmer, FarmerAddress
from app.schemas.admin import (
    AdminAuditLogResponse,
    AdminFarmerListItem,
    AdminFarmerListResponse,
    AdminLoginRequest,
    AdminProfileResponse,
    SeedResponse,
)
from app.schemas.common import APIResponse
from app.services.admin_security import (
    AdminAuthService,
    get_current_admin,
)
from app.services.csrf import csrf_protect
from app.services.rate_limiter import rate_limit

router = APIRouter(prefix="/api/admin", tags=["Admin Portal"])


@router.post(
    "/login",
    response_model=APIResponse[AdminProfileResponse],
    dependencies=[Depends(csrf_protect), Depends(rate_limit(5, 900, "admin_login"))],
    summary="Admin Login (PBKDF2-HMAC-SHA256)",
    description="Authenticates administrator, creates an 8-hour session, locks account for 30 minutes after 5 failed attempts, and sets separate HttpOnly admin cookie."
)
async def admin_login(
    req: AdminLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    client_ip = request.client.host if request.client else None
    
    # Ensure initial admin exists
    await AdminAuthService.ensure_initial_admin(db)

    admin = await AdminAuthService.authenticate_admin(
        db=db,
        username=req.username,
        password=req.password,
        ip_address=client_ip,
    )

    # Create 8-hour session and attach separate cookie
    await AdminAuthService.create_admin_session(
        db=db,
        admin_id=admin.id,
        response=response,
        ip_address=client_ip,
    )

    # Log successful login in audit trail
    await AdminAuthService.log_audit(
        db=db,
        action="admin_login",
        admin_id=admin.id,
        target_type="admin_user",
        target_id=str(admin.id),
        details=f"Successful admin authentication from IP {client_ip}",
        ip_address=client_ip,
    )

    return APIResponse(
        success=True,
        message="Administrator authenticated successfully. 8-hour session established.",
        data=AdminProfileResponse.model_validate(admin),
    )


@router.post(
    "/logout",
    response_model=APIResponse[dict],
    summary="Admin Sign-out",
    description="Revokes the 8-hour admin session and deletes the admin session cookie."
)
async def admin_logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    raw_token = request.cookies.get(settings.ADMIN_SESSION_COOKIE_NAME)
    client_ip = request.client.host if request.client else None
    if raw_token:
        await AdminAuthService.revoke_admin_session(db, raw_token, response)
        await AdminAuthService.log_audit(
            db=db,
            action="admin_logout",
            details="Admin session revoked and signed out",
            ip_address=client_ip,
        )
    else:
        response.delete_cookie(settings.ADMIN_SESSION_COOKIE_NAME, path="/")

    return APIResponse(
        success=True,
        message="Administrator signed out successfully.",
        data={"revoked": True},
    )


@router.get(
    "/me",
    response_model=APIResponse[AdminProfileResponse],
    summary="Get Current Admin Profile",
    description="Returns profile of the currently authenticated administrator."
)
async def get_admin_me(
    current_admin: AdminUser = Depends(get_current_admin),
):
    return APIResponse(
        success=True,
        data=AdminProfileResponse.model_validate(current_admin),
    )


@router.get(
    "/farmers",
    response_model=APIResponse[AdminFarmerListResponse],
    dependencies=[Depends(rate_limit(60, 60, "admin_farmers"))],
    summary="List Registered Farmers (Admin-only)",
    description="Rule 9: Only admin endpoints can list farmers. Supports search by name, phone, village, and state."
)
async def list_farmers(
    search: Optional[str] = Query(None, description="Search term for name, phone, village, or state"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_admin: AdminUser = Depends(get_current_admin),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * page_size
    query = (
        select(Farmer)
        .options(
            selectinload(Farmer.address),
            selectinload(Farmer.alert_preferences),
        )
        .order_by(Farmer.created_at.desc())
    )

    if search:
        term = f"%{search.strip()}%"
        query = query.outerjoin(Farmer.address).where(
            or_(
                Farmer.name.ilike(term),
                Farmer.phone.ilike(term),
                FarmerAddress.village.ilike(term),
                FarmerAddress.district.ilike(term),
                FarmerAddress.state.ilike(term),
                FarmerAddress.pin_code.ilike(term),
            )
        )

    # Count total
    count_query = select(func.count(Farmer.id))
    if search:
        count_query = count_query.outerjoin(Farmer.address).where(
            or_(
                Farmer.name.ilike(term),
                Farmer.phone.ilike(term),
                FarmerAddress.village.ilike(term),
                FarmerAddress.district.ilike(term),
                FarmerAddress.state.ilike(term),
                FarmerAddress.pin_code.ilike(term),
            )
        )
    total = (await db.execute(count_query)).scalar() or 0

    results = await db.execute(query.offset(offset).limit(page_size))
    farmers = results.scalars().all()

    # Audit access
    client_ip = request.client.host if request and request.client else None
    await AdminAuthService.log_audit(
        db=db,
        action="list_farmers",
        admin_id=current_admin.id,
        target_type="farmers",
        details=f"Viewed page {page} of farmers (search='{search or ''}')",
        ip_address=client_ip,
    )

    return APIResponse(
        success=True,
        data=AdminFarmerListResponse(
            total=total,
            page=page,
            page_size=page_size,
            farmers=[AdminFarmerListItem.model_validate(f) for f in farmers],
        ),
    )


@router.get(
    "/audit-logs",
    response_model=APIResponse[list],
    summary="Get Admin Audit Log Ledger",
    description="Returns the immutable record of administrative actions, IPs, and timestamps."
)
async def get_audit_logs(
    limit: int = Query(50, ge=1, le=200),
    current_admin: AdminUser = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(limit)
    results = await db.execute(query)
    logs = results.scalars().all()

    return APIResponse(
        success=True,
        data=[AdminAuditLogResponse.model_validate(log) for log in logs],
    )


@router.post(
    "/seed",
    response_model=APIResponse[SeedResponse],
    dependencies=[Depends(csrf_protect)],
    summary="Seed Synthetic Farmer Data",
    description="Seeds realistic synthetic-only Indian farmer profiles across major agricultural states (Odisha, Punjab, Maharashtra, Rajasthan, etc.)."
)
async def seed_synthetic_farmers(
    current_admin: AdminUser = Depends(get_current_admin),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    SYNTHETIC_DATA = [
        {"name": "Baldev Singh", "phone": "9814011111", "pin": "141001", "village": "Gill", "district": "Ludhiana", "state": "Punjab", "lat": 30.9010, "lon": 75.8573},
        {"name": "Ananya Patnaik", "phone": "9861022222", "pin": "768028", "village": "Remenda", "district": "Bargarh", "state": "Odisha", "lat": 21.2100, "lon": 83.5600},
        {"name": "Dnyaneshwar Shinde", "phone": "9822033333", "pin": "411001", "village": "Baramati", "district": "Pune", "state": "Maharashtra", "lat": 18.1519, "lon": 74.5770},
        {"name": "Kavita Choudhary", "phone": "9829044444", "pin": "302001", "village": "Sanganer", "district": "Jaipur", "state": "Rajasthan", "lat": 26.8188, "lon": 75.7674},
        {"name": "Srinivas Rao", "phone": "9848055555", "pin": "500001", "village": "Shamshabad", "district": "Hyderabad", "state": "Telangana", "lat": 17.2543, "lon": 78.4311},
    ]

    seeded = 0
    now = utc_now()

    for item in SYNTHETIC_DATA:
        existing = (await db.execute(select(Farmer).where(Farmer.phone == item["phone"]))).scalar_one_or_none()
        if not existing:
            f = Farmer(name=item["name"], phone=item["phone"], is_active=True, created_at=now, updated_at=now)
            db.add(f)
            await db.flush()

            addr = FarmerAddress(
                farmer_id=f.id,
                pin_code=item["pin"],
                village=item["village"],
                district=item["district"],
                state=item["state"],
                latitude=item["lat"],
                longitude=item["lon"],
                confirmed=True,
                created_at=now,
                updated_at=now,
            )
            db.add(addr)

            pref = AlertPreference(
                farmer_id=f.id,
                heat_alerts=True,
                heavy_rain_alerts=True,
                irrigation_advisories=True,
                sms_enabled=False,
                preferred_language="en",
                created_at=now,
                updated_at=now,
            )
            db.add(pref)
            seeded += 1

    await db.commit()

    client_ip = request.client.host if request and request.client else None
    await AdminAuthService.log_audit(
        db=db,
        action="seed_synthetic_data",
        admin_id=current_admin.id,
        target_type="farmers",
        details=f"Seeded {seeded} synthetic farmer records",
        ip_address=client_ip,
    )

    return APIResponse(
        success=True,
        message=f"Seeded {seeded} synthetic farmer records successfully.",
        data=SeedResponse(seeded_count=seeded, message="Synthetic seed complete."),
    )
