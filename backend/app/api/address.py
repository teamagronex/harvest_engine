"""
HarvestEngine: Address Upsert and Postal PIN API Router
Handles:
- PUT /api/address (One address per farmer: UNIQUE(farmer_id), upsert only with confirmed=true)
- GET /api/pincode/{pincode} (District/state lookup and village suggestions with error handling)
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.base import utc_now
from app.models.farmer import Farmer, FarmerAddress
from app.schemas.common import APIResponse
from app.schemas.farmer import AddressResponse
from app.schemas.profile import AddressUpsertRequest
from app.services.csrf import csrf_protect
from app.services.geocoding import GeocodingService
from app.services.rate_limiter import rate_limit
from app.services.session_service import get_current_farmer

router = APIRouter(prefix="/api", tags=["Address & Location"])


@router.put(
    "/address",
    response_model=APIResponse[AddressResponse],
    dependencies=[Depends(csrf_protect), Depends(rate_limit(20, 60, "address"))],
    summary="Upsert Farmer Farm Address",
    description="Updates or creates the single address for the authenticated farmer. Rejects changes if confirmed=false. Immediately updates coordinates for all advisories."
)
async def upsert_address(
    req: AddressUpsertRequest,
    current_farmer: Farmer = Depends(get_current_farmer),
    db: AsyncSession = Depends(get_db),
):
    # Rule 4: Reject changes without confirmed=true
    if not req.confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Address change rejected: confirmation is required to replace your existing farm address.",
        )

    # Query existing address
    query = select(FarmerAddress).where(FarmerAddress.farmer_id == current_farmer.id)
    result = await db.execute(query)
    existing_address = result.scalar_one_or_none()

    now = utc_now()

    if existing_address:
        # Atomic Update
        existing_address.pin_code = req.pin_code
        existing_address.village = req.village
        existing_address.district = req.district
        existing_address.state = req.state
        existing_address.latitude = req.latitude
        existing_address.longitude = req.longitude
        existing_address.confirmed = True
        existing_address.updated_at = now
        target_record = existing_address
    else:
        # Create new single address record
        new_address = FarmerAddress(
            farmer_id=current_farmer.id,
            pin_code=req.pin_code,
            village=req.village,
            district=req.district,
            state=req.state,
            latitude=req.latitude,
            longitude=req.longitude,
            confirmed=True,
            created_at=now,
            updated_at=now,
        )
        db.add(new_address)
        target_record = new_address

    await db.commit()
    await db.refresh(target_record)

    return APIResponse(
        success=True,
        message="Farm address updated successfully. New coordinates applied to all advisories.",
        data=AddressResponse.model_validate(target_record),
    )


@router.get(
    "/pincode/{pincode}",
    response_model=APIResponse[dict],
    dependencies=[Depends(rate_limit(60, 60, "pincode"))],
    summary="Indian Postal PIN Code Lookup",
    description="Resolves District, State, suggested villages, and approximate geocodes from a 6-digit Indian PIN."
)
async def lookup_pincode(pincode: str):
    try:
        data = await GeocodingService.lookup_pincode(pincode)
        return APIResponse(
            success=True,
            message="PIN code resolved successfully.",
            data=data,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
