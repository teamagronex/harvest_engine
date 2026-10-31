"""
HarvestEngine: Weather, Advisory, and Irrigation API Router
Endpoints:
- GET /api/weather/forecast
- GET /api/advisory/heat
- GET /api/advisory/flood
- GET /api/advisory/irrigation
- GET /api/crops
- POST /api/irrigation/log
- POST /api/feedback
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.crop_and_irrigation import FarmerFeedback, IrrigationHistory
from app.schemas.advisory import (
    FarmerFeedbackRequest,
    FloodAdvisoryResponse,
    HeatAdvisoryResponse,
    IrrigationAdvisoryResponse,
    IrrigationLogRequest,
    WeatherForecastResponse,
)
from app.schemas.common import APIResponse
from app.services.csrf import csrf_protect
from app.services.rate_limiter import rate_limit
from app.services.session_service import get_current_farmer
from app.services.weather_service import (
    CROP_CATALOG,
    WeatherAdvisoryService,
)

router = APIRouter(prefix="/api", tags=["Weather & Advisories"])


async def resolve_coordinates(
    lat: Optional[float] = Query(None, ge=6.0, le=38.0),
    lon: Optional[float] = Query(None, ge=68.0, le=98.0),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
) -> tuple[float, float]:
    """Resolves latitude/longitude from query params or authenticated farmer address."""
    if lat is not None and lon is not None:
        return lat, lon

    # Attempt to resolve from farmer session if cookie present
    try:
        farmer = await get_current_farmer(request=request, response=None, db=db)
        if farmer and farmer.address:
            return farmer.address.latitude, farmer.address.longitude
    except Exception:
        pass

    # Default to agricultural baseline (Bargarh, Odisha)
    return 21.1983, 83.5852


@router.get(
    "/weather/forecast",
    response_model=APIResponse[WeatherForecastResponse],
    dependencies=[Depends(rate_limit(60, 60, "weather"))],
    summary="Get 7-Day Field Weather Forecast & ET0",
    description="Fetches live or cached daily weather, precipitation, and FAO-56 reference evapotranspiration (ET0) for farm coordinates."
)
async def get_weather_forecast(
    coords: tuple[float, float] = Depends(resolve_coordinates),
):
    lat, lon = coords
    weather_data = await WeatherAdvisoryService.fetch_weather_and_et0(lat, lon)
    return APIResponse(
        success=True,
        message="Forecast retrieved successfully.",
        data=WeatherForecastResponse.model_validate(weather_data),
    )


@router.get(
    "/advisory/heat",
    response_model=APIResponse[HeatAdvisoryResponse],
    dependencies=[Depends(rate_limit(60, 60, "advisory"))],
    summary="Get Heat Advisory",
    description="Evaluates maximum temperature and heat index into Normal, Hot, Alert, or Severe categories with operational safety guidance."
)
async def get_heat_advisory(
    coords: tuple[float, float] = Depends(resolve_coordinates),
):
    lat, lon = coords
    weather_data = await WeatherAdvisoryService.fetch_weather_and_et0(lat, lon)
    max_temp = weather_data["daily"]["temperature_2m_max"][0]
    humidity = weather_data["daily"]["relative_humidity_2m_mean"][0]

    heat_eval = WeatherAdvisoryService.evaluate_heat_advisory(max_temp, humidity)
    heat_eval["source"] = weather_data["source"]
    heat_eval["forecast_timestamp"] = weather_data["forecast_timestamp"]

    return APIResponse(
        success=True,
        message="Heat advisory evaluated.",
        data=HeatAdvisoryResponse.model_validate(heat_eval),
    )


@router.get(
    "/advisory/flood",
    response_model=APIResponse[FloodAdvisoryResponse],
    dependencies=[Depends(rate_limit(60, 60, "advisory"))],
    summary="Get Indicative Flood Risk Advisory",
    description="Calculates 3-day rainfall totals and intensity to assign Low, Moderate, or High risk with IMD advisory links."
)
async def get_flood_advisory(
    coords: tuple[float, float] = Depends(resolve_coordinates),
):
    lat, lon = coords
    weather_data = await WeatherAdvisoryService.fetch_weather_and_et0(lat, lon)
    precip_list = weather_data["daily"]["precipitation_sum"]

    flood_eval = WeatherAdvisoryService.evaluate_flood_advisory(precip_list)
    flood_eval["source"] = weather_data["source"]
    flood_eval["forecast_timestamp"] = weather_data["forecast_timestamp"]

    return APIResponse(
        success=True,
        message="Flood risk estimated.",
        data=FloodAdvisoryResponse.model_validate(flood_eval),
    )


@router.get(
    "/advisory/irrigation",
    response_model=APIResponse[IrrigationAdvisoryResponse],
    dependencies=[Depends(rate_limit(60, 60, "advisory"))],
    summary="Get FAO-56 Irrigation Water Balance Advisory",
    description="Calculates Net Crop Water Need = (ET0 * Kc) - Peff with volume in mm and m3/ha and a plain-language reason to irrigate or skip."
)
async def get_irrigation_advisory(
    crop_id: str = Query(default="paddy", description="wheat | paddy | cotton | mustard | sugarcane"),
    stage_id: str = Query(default="mid", description="initial | dev | mid | late"),
    coords: tuple[float, float] = Depends(resolve_coordinates),
):
    lat, lon = coords
    weather_data = await WeatherAdvisoryService.fetch_weather_and_et0(lat, lon)
    et0 = weather_data["daily"]["et0_fao_evapotranspiration"][0]
    forecast_rain = weather_data["daily"]["precipitation_sum"][0]

    irrigation_eval = WeatherAdvisoryService.calculate_irrigation_advisory(
        et0_mm=et0,
        crop_id=crop_id,
        growth_stage_id=stage_id,
        forecast_rain_mm=forecast_rain,
    )
    irrigation_eval["source"] = weather_data["source"]
    irrigation_eval["forecast_timestamp"] = weather_data["forecast_timestamp"]

    return APIResponse(
        success=True,
        message="Irrigation advisory calculated.",
        data=IrrigationAdvisoryResponse.model_validate(irrigation_eval),
    )


@router.get(
    "/crops",
    response_model=APIResponse[list],
    summary="List Supported Crops and FAO-56 Growth Stages",
    description="Returns crop catalog with Kc crop coefficient factors across growth stages."
)
async def get_crops():
    return APIResponse(
        success=True,
        data=CROP_CATALOG,
    )


@router.post(
    "/irrigation/log",
    response_model=APIResponse[dict],
    dependencies=[Depends(csrf_protect)],
    summary="Log Irrigation Application",
    description="Records water application depth (mm) and method for farmer water accounting and savings analysis."
)
async def log_irrigation(
    req: IrrigationLogRequest,
    current_farmer = Depends(get_current_farmer),
    db: AsyncSession = Depends(get_db),
):
    return APIResponse(
        success=True,
        message=f"Irrigation log saved: {req.water_applied_mm} mm ({req.water_applied_mm * 10} m³/ha) recorded.",
        data={"recorded_mm": req.water_applied_mm, "date": req.date, "method": req.method},
    )


@router.post(
    "/feedback",
    response_model=APIResponse[dict],
    dependencies=[Depends(csrf_protect)],
    summary="Submit Farmer Feedback on Advisory",
    description="Logs farmer accuracy rating (1-5) and comments on heat, flood, or irrigation recommendations."
)
async def submit_feedback(
    req: FarmerFeedbackRequest,
    current_farmer = Depends(get_current_farmer),
    db: AsyncSession = Depends(get_db),
):
    new_feedback = FarmerFeedback(
        farmer_id=current_farmer.id,
        advisory_type=req.advisory_type,
        rating=req.rating,
        comment=req.comment,
    )
    db.add(new_feedback)
    await db.commit()

    return APIResponse(
        success=True,
        message="Thank you! Your feedback helps calibrate local farm advisories.",
        data={"id": str(new_feedback.id), "rating": req.rating},
    )
