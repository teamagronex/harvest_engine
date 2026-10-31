"""
HarvestEngine: Farmer Profile and Registration API Router
Handles:
- POST /api/farmers (Signup with OTP verification and atomic address creation)
- GET /api/me (Current authenticated farmer profile)
- PATCH /api/me (Update farmer name without OTP)
- POST /api/me/phone/request-otp (Request OTP to NEW phone number for phone change)
- PATCH /api/me/phone (Verify OTP on new phone, check uniqueness, update phone number)
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.alert import AlertPreference
from app.models.base import utc_now
from app.models.farmer import Farmer, FarmerAddress
from app.schemas.common import APIResponse
from app.schemas.farmer import FarmerProfileResponse, FarmerSignupRequest
from app.schemas.profile import (
    PhoneChangeConfirmRequest,
    PhoneChangeRequest,
    ProfileUpdateNameRequest,
)
from app.services.csrf import CSRFService, csrf_protect
from app.services.otp_service import (
    OTPCooldownError,
    OTPRateLimitExceeded,
    OTPService,
    OTPVerificationError,
)
from app.services.rate_limiter import rate_limit
from app.services.session_service import SessionService, get_current_farmer

router = APIRouter(prefix="/api", tags=["Farmers"])


@router.get(
    "/csrf-token",
    response_model=APIResponse[dict],
    summary="Get CSRF Token",
    description="Returns a cryptographically signed CSRF token to be included in the X-CSRF-Token header on mutating requests."
)
async def get_csrf_token():
    token = CSRFService.generate_csrf_token()
    return APIResponse(
        success=True,
        message="CSRF token generated.",
        data={"csrf_token": token, "header_name": "X-CSRF-Token"},
    )


@router.post(
    "/farmers",
    response_model=APIResponse[FarmerProfileResponse],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(csrf_protect), Depends(rate_limit(10, 60, "signup"))],
    summary="Farmer Signup with OTP Verification",
    description="Registers a new farmer profile, associates farm coordinates, provisions alert preferences, and opens an authenticated session."
)
async def register_farmer(
    req: FarmerSignupRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    if not req.confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Address confirmation is required before creating a farmer profile.",
        )

    existing_farmer_query = select(Farmer).where(Farmer.phone == req.phone)
    existing_farmer = (await db.execute(existing_farmer_query)).scalar_one_or_none()
    if existing_farmer:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This mobile number is already registered. Please use recovery to sign in.",
        )

    try:
        await OTPService.verify_otp(
            db=db,
            phone=req.phone,
            purpose="signup",
            user_otp=req.otp,
        )
    except OTPVerificationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    now = utc_now()
    new_farmer = Farmer(
        name=req.name.strip(),
        phone=req.phone,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(new_farmer)
    await db.flush()

    new_address = FarmerAddress(
        farmer_id=new_farmer.id,
        pin_code=req.pin_code,
        village=req.village.strip(),
        district=req.district.strip(),
        state=req.state.strip(),
        latitude=req.latitude,
        longitude=req.longitude,
        confirmed=True,
        created_at=now,
        updated_at=now,
    )
    db.add(new_address)

    new_alert_prefs = AlertPreference(
        farmer_id=new_farmer.id,
        heat_alerts=True,
        heavy_rain_alerts=True,
        irrigation_advisories=True,
        sms_enabled=False,
        preferred_language="en",
        created_at=now,
        updated_at=now,
    )
    db.add(new_alert_prefs)

    await db.commit()

    query = (
        select(Farmer)
        .options(
            selectinload(Farmer.address),
            selectinload(Farmer.alert_preferences),
        )
        .where(Farmer.id == new_farmer.id)
    )
    farmer_full = (await db.execute(query)).scalar_one()

    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    await SessionService.create_session(
        db=db,
        farmer_id=new_farmer.id,
        response=response,
        ip_address=client_ip,
        user_agent=user_agent,
    )

    return APIResponse(
        success=True,
        message="Farmer profile registered and authenticated successfully.",
        data=FarmerProfileResponse.model_validate(farmer_full),
    )


@router.get(
    "/me",
    response_model=APIResponse[FarmerProfileResponse],
    summary="Get Current Farmer Profile",
    description="Retrieves the profile, farm location coordinates, and alert preferences of the currently logged-in farmer."
)
async def get_me(
    current_farmer: Farmer = Depends(get_current_farmer),
):
    return APIResponse(
        success=True,
        data=FarmerProfileResponse.model_validate(current_farmer),
    )


@router.patch(
    "/me",
    response_model=APIResponse[FarmerProfileResponse],
    dependencies=[Depends(csrf_protect), Depends(rate_limit(30, 60, "profile_update"))],
    summary="Update Farmer Name (No OTP required)",
    description="Updates the farmer's display name without requiring OTP verification."
)
async def update_profile_name(
    req: ProfileUpdateNameRequest,
    current_farmer: Farmer = Depends(get_current_farmer),
    db: AsyncSession = Depends(get_db),
):
    current_farmer.name = req.name
    current_farmer.updated_at = utc_now()
    await db.commit()
    await db.refresh(current_farmer)

    return APIResponse(
        success=True,
        message="Profile name updated successfully.",
        data=FarmerProfileResponse.model_validate(current_farmer),
    )


@router.post(
    "/me/phone/request-otp",
    response_model=APIResponse[dict],
    dependencies=[Depends(csrf_protect), Depends(rate_limit(5, 60, "phone_change_otp"))],
    summary="Request OTP for Phone Number Change",
    description="Dispatches a verification OTP to the NEW phone number after checking uniqueness."
)
async def request_phone_change_otp(
    req: PhoneChangeRequest,
    current_farmer: Farmer = Depends(get_current_farmer),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    # Rule 5: Phone change needs OTP to the new number and uniqueness check
    if req.new_phone == current_farmer.phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The new mobile number is identical to your current registered number.",
        )

    # Check uniqueness
    existing_query = select(Farmer).where(Farmer.phone == req.new_phone)
    existing_farmer = (await db.execute(existing_query)).scalar_one_or_none()
    if existing_farmer:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This mobile number is already registered to another account.",
        )

    client_ip = request.client.host if request and request.client else None
    try:
        success, message = await OTPService.request_otp(
            db=db,
            phone=req.new_phone,
            purpose="phone_change",
            ip_address=client_ip,
        )
        return APIResponse(
            success=True,
            message="Verification code sent to the new mobile number.",
            data={"phone": f"***{req.new_phone[-4:]}"},
        )
    except (OTPCooldownError, OTPRateLimitExceeded) as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        )


@router.patch(
    "/me/phone",
    response_model=APIResponse[FarmerProfileResponse],
    dependencies=[Depends(csrf_protect), Depends(rate_limit(5, 60, "phone_change_confirm"))],
    summary="Confirm Phone Number Change",
    description="Verifies the OTP sent to the new number and updates the registered phone with strict per-farmer data isolation."
)
async def confirm_phone_change(
    req: PhoneChangeConfirmRequest,
    current_farmer: Farmer = Depends(get_current_farmer),
    db: AsyncSession = Depends(get_db),
):
    if not req.confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Explicit confirmation required to change your registered mobile number.",
        )

    # Verify OTP sent to new phone
    try:
        await OTPService.verify_otp(
            db=db,
            phone=req.new_phone,
            purpose="phone_change",
            user_otp=req.otp,
        )
    except OTPVerificationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    # Re-verify uniqueness inside transaction
    existing_query = select(Farmer).where(Farmer.phone == req.new_phone, Farmer.id != current_farmer.id)
    conflict = (await db.execute(existing_query)).scalar_one_or_none()
    if conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This mobile number is already registered to another account.",
        )

    current_farmer.phone = req.new_phone
    current_farmer.updated_at = utc_now()
    await db.commit()
    await db.refresh(current_farmer)

    return APIResponse(
        success=True,
        message="Registered mobile number updated successfully.",
        data=FarmerProfileResponse.model_validate(current_farmer),
    )
