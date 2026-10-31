"""
HarvestEngine: Weather and Advisory Schemas
"""

import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class WeatherCurrent(BaseModel):
    temperature_2m: float
    relative_humidity_2m: float
    precipitation: float
    wind_speed_10m: float
    weather_code: int


class WeatherDaily(BaseModel):
    time: List[str]
    temperature_2m_max: List[float]
    temperature_2m_min: List[float]
    relative_humidity_2m_mean: List[float]
    precipitation_sum: List[float]
    et0_fao_evapotranspiration: List[float]
    wind_speed_10m_max: List[float]


class WeatherForecastResponse(BaseModel):
    source: str
    forecast_timestamp: str
    is_estimate: bool = True
    current: WeatherCurrent
    daily: WeatherDaily


class HeatAdvisoryResponse(BaseModel):
    level: str
    badge: str
    color: str
    max_temperature_c: float
    heat_index_c: float
    guidance: str
    is_estimate: bool = True
    disclaimer: str
    source: str
    forecast_timestamp: str


class FloodAdvisoryResponse(BaseModel):
    level: str
    badge: str
    color: str
    three_day_total_mm: float
    max_daily_intensity_mm: float
    guidance: str
    is_estimate: bool = True
    imd_link: str
    disclaimer: str
    source: str
    forecast_timestamp: str


class IrrigationAdvisoryResponse(BaseModel):
    crop_name: str
    stage_name: str
    kc: float
    reference_et0_mm: float
    crop_water_demand_etc_mm: float
    forecast_rain_mm: float
    effective_rain_peff_mm: float
    net_irrigation_need_mm: float
    volume_m3_per_ha: float
    volume_liters_per_ha: int
    action: str
    status_color: str
    plain_language_reason: str
    is_estimate: bool = True
    formula_documentation: str
    source: str
    forecast_timestamp: str


class IrrigationLogRequest(BaseModel):
    crop_id: str
    date: str = Field(..., description="YYYY-MM-DD")
    water_applied_mm: float = Field(..., gt=0)
    method: str = Field(default="flood", description="drip | sprinkler | flood | furrow")
    notes: Optional[str] = None


class FarmerFeedbackRequest(BaseModel):
    advisory_type: str = Field(..., description="heat | flood | irrigation | general")
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None
