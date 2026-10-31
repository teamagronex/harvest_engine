"""
HarvestEngine: Alert Preferences and Notification Management Router
Handles:
- GET /api/alerts/preferences (Retrieve farmer notification and language settings)
- PATCH /api/alerts/preferences (Update notification toggles, language, and SMS opt-in)
- GET /api/alerts/logs (View recent alert audit logs with safe delivery metadata)
- POST /api/alerts/dispatch-daily (Trigger daily alert evaluation with 24h deduplication)
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.alert import AlertLog, AlertPreference
from app.models.farmer import Farmer
from app.schemas.alert import (
    AlertDispatchResponse,
    AlertLogResponse,
    AlertPreferenceResponse,
    AlertPreferenceUpdateSchema,
)
from app.schemas.common import APIResponse
from app.services.alert_scheduler import alert_scheduler_service
from app.services.csrf import csrf_protect
from app.services.rate_limiter import rate_limit
from app.services.session_service import get_current_farmer
from app.config import settings

router = APIRouter(prefix="/api/alerts", tags=["Alerts & Notifications"])


@router.get(
    "/preferences",
    response_model=APIResponse[AlertPreferenceResponse],
    summary="Get Alert Preferences",
    description="Retrieves the authenticated farmer's notification preferences, SMS opt-in status, and chosen language.",
)
async def get_alert_preferences(
    farmer: Farmer = Depends(get_current_farmer),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AlertPreference).where(AlertPreference.farmer_id == farmer.id)
    res = await db.execute(stmt)
    pref = res.scalar_one_or_none()

    if not pref:
        pref = AlertPreference(
            farmer_id=farmer.id,
            heat_alerts=True,
            heavy_rain_alerts=True,
            irrigation_advisories=True,
            sms_enabled=False,
            preferred_language="en",
        )
        db.add(pref)
        await db.commit()
        await db.refresh(pref)

    return APIResponse(
        success=True,
        message="Alert preferences retrieved.",
        data=AlertPreferenceResponse.model_validate(pref),
    )


@router.patch(
    "/preferences",
    response_model=APIResponse[AlertPreferenceResponse],
    dependencies=[Depends(csrf_protect), Depends(rate_limit(30, 60, "alert_pref"))],
    summary="Update Alert Preferences",
    description="Updates notification toggles, SMS opt-in consent, and preferred language (en, hi, or).",
)
async def update_alert_preferences(
    payload: AlertPreferenceUpdateSchema,
    farmer: Farmer = Depends(get_current_farmer),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AlertPreference).where(AlertPreference.farmer_id == farmer.id)
    res = await db.execute(stmt)
    pref = res.scalar_one_or_none()

    if not pref:
        pref = AlertPreference(farmer_id=farmer.id)
        db.add(pref)

    if payload.heat_alerts is not None:
        pref.heat_alerts = payload.heat_alerts
    if payload.heavy_rain_alerts is not None:
        pref.heavy_rain_alerts = payload.heavy_rain_alerts
    if payload.irrigation_advisories is not None:
        pref.irrigation_advisories = payload.irrigation_advisories
    if payload.sms_enabled is not None:
        pref.sms_enabled = payload.sms_enabled
    if payload.preferred_language is not None:
        pref.preferred_language = payload.preferred_language

    await db.commit()
    await db.refresh(pref)

    return APIResponse(
        success=True,
        message="Alert preferences updated successfully.",
        data=AlertPreferenceResponse.model_validate(pref),
    )


@router.get(
    "/logs",
    response_model=APIResponse[List[AlertLogResponse]],
    summary="Get Alert Audit Logs",
    description="Retrieves the authenticated farmer's alert history and dispatch statuses (deduplicated per 24h).",
)
async def get_alert_logs(
    farmer: Farmer = Depends(get_current_farmer),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(AlertLog)
        .where(AlertLog.farmer_id == farmer.id)
        .order_by(desc(AlertLog.sent_at))
        .limit(50)
    )
    res = await db.execute(stmt)
    logs = res.scalars().all()

    return APIResponse(
        success=True,
        message="Alert logs retrieved.",
        data=[AlertLogResponse.model_validate(log) for log in logs],
    )


@router.post(
    "/dispatch-daily",
    response_model=APIResponse[AlertDispatchResponse],
    dependencies=[Depends(csrf_protect), Depends(rate_limit(5, 60, "dispatch_daily"))],
    summary="Trigger Daily Alert Evaluation",
    description="Evaluates weather against threshold rules (>=40°C heat, >=50mm rain, irrigation need) for the farmer's registered coordinates with 24h deduplication.",
)
async def dispatch_daily_alerts(
    farmer: Farmer = Depends(get_current_farmer),
    db: AsyncSession = Depends(get_db),
):
    actions = await alert_scheduler_service.evaluate_farmer_alerts(str(farmer.id), db)
    provider_type = (settings.SMS_PROVIDER or "disabled").lower()

    return APIResponse(
        success=True,
        message=f"Alert evaluation complete. {len(actions)} conditions evaluated.",
        data=AlertDispatchResponse(
            success=True,
            evaluated_count=len(actions),
            actions=actions,
            provider_status=provider_type,
            timestamp=actions[0]["timestamp"] if actions and "timestamp" in actions[0] else "",
        ),
    )
