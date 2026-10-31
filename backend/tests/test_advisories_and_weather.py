"""
HarvestEngine: Automated Tests for Advisory Logic and Weather Calculations
Enforces:
- Heat stress calculation (Normal / Hot / Alert / Severe)
- Flood risk estimation (intensity + 3-day accumulation) with IMD disclaimer
- FAO-56 Penman-Monteith Net Water Need (ETc - Peff), mm and m3/ha (1 mm = 10 m3/ha)
- Graceful API failure fallback and estimate labeling
"""

import pytest
from app.services.weather_service import weather_service


def test_heat_advisory_thresholds():
    """Verifies heat risk classification across IMD thresholds."""
    # Normal: < 35°C
    adv_normal = weather_service.evaluate_heat_risk(temperature=32.0, humidity=50.0)
    assert adv_normal.category == "Normal"

    # Hot: 35.0°C - 39.9°C
    adv_hot = weather_service.evaluate_heat_risk(temperature=37.5, humidity=50.0)
    assert adv_hot.category == "Hot"

    # Alert: 40.0°C - 44.9°C
    adv_alert = weather_service.evaluate_heat_risk(temperature=42.0, humidity=40.0)
    assert adv_alert.category == "Alert"

    # Severe: >= 45.0°C
    adv_severe = weather_service.evaluate_heat_risk(temperature=46.5, humidity=30.0)
    assert adv_severe.category == "Severe"


def test_flood_risk_advisory():
    """Verifies flood risk estimation logic and mandatory IMD disclaimer."""
    # Low: < 20 mm 3-day rain
    adv_low = weather_service.evaluate_flood_risk(three_day_rain_mm=10.0, max_daily_intensity_mm=5.0)
    assert adv_low.category == "Low"
    assert "mausam.imd.gov.in" in adv_low.official_source_link

    # Moderate: 20 mm - 49.9 mm
    adv_mod = weather_service.evaluate_flood_risk(three_day_rain_mm=35.0, max_daily_intensity_mm=15.0)
    assert adv_mod.category == "Moderate"

    # High: >= 50 mm 3-day rain or >= 35 mm daily intensity
    adv_high = weather_service.evaluate_flood_risk(three_day_rain_mm=65.0, max_daily_intensity_mm=40.0)
    assert adv_high.category == "High"
    assert "indicative, not an official warning" in adv_high.action_reason


def test_fao56_irrigation_demand():
    """
    Verifies FAO-56 Penman-Monteith irrigation water balance:
    ETc = ET0 * Kc
    Peff = USDA Soil Conservation Service formula
    W_need = max(0, ETc - Peff)
    Volume: 1 mm = 10 m3/ha
    """
    # Case 1: High evapotranspiration, zero rainfall -> Irrigation strongly recommended
    # ET0 = 5.0 mm, Kc = 1.15 (Wheat mid-season) -> ETc = 5.75 mm
    # Peff = 0.0 mm -> W_need = 5.75 mm -> Volume = 57.5 m3/ha
    res_irrigate = weather_service.calculate_irrigation_need(
        et0_mm=5.0,
        kc=1.15,
        precip_mm=0.0,
        crop_name="Wheat",
        stage="mid",
    )
    assert res_irrigate.irrigation_recommended is True
    assert round(res_irrigate.net_irrigation_depth_mm, 2) == 5.75
    assert round(res_irrigate.water_volume_m3_per_hectare, 1) == 57.5
    assert "Apply approximately" in res_irrigate.plain_language_reason

    # Case 2: Heavy rainfall exceeding ETc -> Skip irrigation
    res_skip = weather_service.calculate_irrigation_need(
        et0_mm=4.0,
        kc=1.0,
        precip_mm=30.0,
        crop_name="Wheat",
        stage="mid",
    )
    assert res_skip.irrigation_recommended is False
    assert res_skip.net_irrigation_depth_mm == 0.0
    assert res_skip.water_volume_m3_per_hectare == 0.0
    assert "Skip irrigation" in res_skip.plain_language_reason


@pytest.mark.asyncio
async def test_weather_service_graceful_fallback():
    """Verifies that weather service gracefully provides fallback data with estimate labeling when API is unavailable."""
    # Use invalid coordinates or mock failure scenario
    forecast = weather_service._fallback_forecast(21.1983, 83.5852, "Barpali")
    assert forecast.is_estimate is True
    assert "Statistical Fallback" in forecast.data_source
    assert forecast.temperature_current > 0
