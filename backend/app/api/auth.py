"""
HarvestEngine: Authentication API Router
Handles:
- POST /api/otp/request
- POST /api/recover
- POST /api/logout
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models.farmer import Farmer
from app.schemas.auth import FarmerRecoveryRequest, OTPRequest
from app.schemas.common import APIResponse
from app.schemas.farmer import FarmerProfileResponse
from app.services.otp_service import (
    OTPCooldownError,
    OTPRateLimitExceeded,
    OTPService,
    OTPVerificationError,
)
from app.services.session_service import SessionService

router = APIRouter(prefix="/api", tags=["Authentication"])


@router.post(
    "/otp/request",
    response_model=APIResponse[dict],
    summary="Request OTP verification code",
    description="Requests an OTP code for signup, recovery, or phone change with anti-abuse limits and generic responses."
)
async def request_otp(
    req: OTPRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_ip = request.client.host if request.client else None
    try:
        success, message = await OTPService.request_otp(
            db=db,
            phone=req.phone,
            purpose=req.purpose,
            ip_address=client_ip,
        )
        return APIResponse(
            success=True,
            message=message,
            data={"cooldown_seconds": settings.OTP_RESEND_COOLDOWN_SECONDS},
        )
    except OTPCooldownError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        )
    except OTPRateLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        )


@router.post(
    "/recover",
    response_model=APIResponse[FarmerProfileResponse],
    summary="Farmer Account Recovery / Sign-in",
    description="Authenticates an existing farmer via OTP code without requiring a password."
)
async def recover_account(
    req: FarmerRecoveryRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    # 1. Verify OTP
    try:
        await OTPService.verify_otp(
            db=db,
            phone=req.phone,
            purpose="recovery",
            user_otp=req.otp,
        )
    except OTPVerificationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    # 2. Query farmer
    query = (
        select(Farmer)
        .options(
            selectinload(Farmer.address),
            selectinload(Farmer.alert_preferences),
        )
        .where(Farmer.phone == req.phone, Farmer.is_active.is_(True))
    )
    result = await db.execute(query)
    farmer = result.scalar_one_or_none()

    if not farmer:
        # Generic error message to prevent enumeration
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account not found. Please sign up to create your farm profile.",
        )

    # 3. Create session and set HttpOnly cookie
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    await SessionService.create_session(
        db=db,
        farmer_id=farmer.id,
        response=response,
        ip_address=client_ip,
        user_agent=user_agent,
    )

    return APIResponse(
        success=True,
        message="Account authenticated successfully.",
        data=FarmerProfileResponse.model_validate(farmer),
    )


@router.post(
    "/logout",
    response_model=APIResponse[dict],
    summary="Sign out of this device",
    description="Revokes the current session and clears the HttpOnly cookie."
)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    raw_token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if raw_token:
        await SessionService.revoke_session(db, raw_token, response)
    else:
        # Clear cookie regardless
        response.delete_cookie(settings.SESSION_COOKIE_NAME, path="/")

    return APIResponse(
        success=True,
        message="Signed out of this device successfully.",
        data={"revoked": True},
    )
