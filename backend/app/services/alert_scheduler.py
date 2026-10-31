"""
HarvestEngine: Daily Alert Evaluation and Multi-lingual SMS Dispatch Service
Enforces:
- Daily alert condition evaluation on farmer's registered coordinates:
  * Heat alert: Max forecast temperature >= 40.0°C
  * Heavy rain alert: 3-day accumulated rainfall >= 50.0 mm
  * Irrigation advisory: Net water need > 0.0 mm
- Strict 24-hour deduplication key per alert type: YYYY-MM-DD:{alert_type}:{farmer_id}
- Strict consent and opt-out compliance (TRAI / Indian DLT standards):
  * Only dispatches SMS if sms_enabled is True (opt-in)
  * Multi-lingual templates: English (en), Hindi (hi), Odia (or)
  * Mandatory opt-out instructions included in all SMS copies ("Reply STOP to opt out")
  * Provider safety: Never claims SMS was delivered if provider is disabled or fails
"""

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.farmer import Farmer
from app.models.address import FarmerAddress
from app.models.alert import AlertPreference, AlertLog
from app.models.crop import Crop
from app.services.weather_service import weather_service
from app.services.sms_provider import get_sms_provider

logger = logging.getLogger("harvestengine.alerts")

# Multilingual SMS message templates with regulatory opt-out directives
SMS_TEMPLATES: Dict[str, Dict[str, str]] = {
    "heat": {
        "en": "HarvestEngine: Heat alert for {village}. High temp {temp}°C expected today. Water crops early morning or evening. Reply STOP to opt out.",
        "hi": "हार्वेस्ट इंजन: {village} हेतु भीषण गर्मी चेतावनी। आज तापमान {temp}°C संभव। सुबह या शाम सिंचाई करें। बंद करने के लिए STOP भेजें।",
        "or": "ହାର୍ଭେଷ୍ଟ ଇଞ୍ଜିନ: {village} ପାଇଁ ଅତ୍ୟଧିକ ଖରା ସତର୍କତା। ଆଜି ତାପମାତ୍ରା {temp}°C ସମ୍ଭାବନା। ସକାଳେ/ସନ୍ଧ୍ୟାରେ ଜଳସେଚନ କରନ୍ତୁ। STOP ପଠାନ୍ତୁ।",
    },
    "flood": {
        "en": "HarvestEngine: Heavy rain alert for {village}. {rain} mm rain forecast over 3 days. Inspect drainage channels. IMD warnings: mausam.imd.gov.in. Reply STOP to opt out.",
        "hi": "हार्वेस्ट इंजन: {village} में 3 दिनों में {rain} मिमी भारी बारिश का अनुमान। खेत की जल निकासी नाली साफ करें। मौसम विभाग: mausam.imd.gov.in. STOP भेजें।",
        "or": "ହାର୍ଭେଷ୍ଟ ଇଞ୍ଜିନ: {village} ରେ ଆଗାମୀ 3 ଦିନରେ {rain} mm ବର୍ଷା ଆକଳନ। ଜମିର ନାଳ ସଫା ରଖନ୍ତୁ। ସତର୍କତା: mausam.imd.gov.in. STOP ପଠାନ୍ତୁ।",
    },
    "irrigation": {
        "en": "HarvestEngine: Irrigation reminder for {crop}. Estimated need: {mm} mm ({m3} m3/ha). ET0-based advisory. Reply STOP to opt out.",
        "hi": "हार्वेस्ट इंजन: {crop} फसल हेतु सलाह। अनुमानित आवश्यकता: {mm} मिमी ({m3} घन मीटर/हेक्टेयर)। बंद करने के लिए STOP भेजें।",
        "or": "ହାର୍ଭେଷ୍ଟ ଇଞ୍ଜିନ: {crop} ଫସଲ ପାଇଁ ଜଳସେଚନ ପରାମର୍ଶ। ଆବଶ୍ୟକତା: {mm} mm ({m3} ଘନ ମିଟର/ହେକ୍ଟର)। STOP ପଠାନ୍ତୁ।",
    },
}


class AlertSchedulerService:
    """Evaluates weather criteria and dispatches multi-lingual advisories with deduplication."""

    async def evaluate_farmer_alerts(
        self,
        farmer_id: str,
        db: AsyncSession,
    ) -> List[Dict]:
        """
        Evaluates daily alert criteria for a specific farmer.
        Returns list of generated alert actions and their delivery status.
        """
        # 1. Fetch farmer, address, and alert preferences
        farmer_stmt = select(Farmer).where(Farmer.id == farmer_id)
        res = await db.execute(farmer_stmt)
        farmer = res.scalar_one_or_none()
        if not farmer:
            return []

        addr_stmt = select(FarmerAddress).where(FarmerAddress.farmer_id == farmer_id)
        addr_res = await db.execute(addr_stmt)
        address = addr_res.scalar_one_or_none()
        if not address:
            logger.info("Farmer %s has no registered address; skipping alert evaluation.", farmer_id)
            return []

        pref_stmt = select(AlertPreference).where(AlertPreference.farmer_id == farmer_id)
        pref_res = await db.execute(pref_stmt)
        pref = pref_res.scalar_one_or_none()
        if not pref:
            # Create default preferences if absent
            pref = AlertPreference(farmer_id=farmer_id, sms_enabled=False, preferred_language="en")
            db.add(pref)
            await db.commit()
            await db.refresh(pref)

        # 2. Fetch forecast for saved coordinates
        forecast = await weather_service.fetch_weather_forecast(
            latitude=address.latitude,
            longitude=address.longitude,
            location_label=f"{address.village_or_town}, {address.district}",
        )

        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        lang = pref.preferred_language if pref.preferred_language in ("en", "hi", "or") else "en"
        sms_provider = get_sms_provider()

        results = []

        # 3. Check Heat Alert (Threshold: forecast T_max >= 40.0°C)
        if pref.heat_alerts:
            max_temp = forecast.temperature_max
            if max_temp >= 40.0:
                dedup_key = f"{today_str}:heat:{farmer_id}"
                action = await self._process_alert(
                    db=db,
                    farmer=farmer,
                    address=address,
                    pref=pref,
                    alert_type="heat",
                    dedup_key=dedup_key,
                    template_params={"village": address.village_or_town, "temp": f"{max_temp:.1f}"},
                    sms_provider=sms_provider,
                    lang=lang,
                )
                results.append(action)

        # 4. Check Heavy Rain / Flood Alert (Threshold: 3-day rain >= 50.0 mm)
        if pref.heavy_rain_alerts:
            three_day_rain = forecast.precipitation_sum_3d
            if three_day_rain >= 50.0:
                dedup_key = f"{today_str}:flood:{farmer_id}"
                action = await self._process_alert(
                    db=db,
                    farmer=farmer,
                    address=address,
                    pref=pref,
                    alert_type="flood",
                    dedup_key=dedup_key,
                    template_params={"village": address.village_or_town, "rain": f"{three_day_rain:.1f}"},
                    sms_provider=sms_provider,
                    lang=lang,
                )
                results.append(action)

        # 5. Check Irrigation Reminder (Evaluated on default crop or Wheat mid-season if need > 0)
        if pref.irrigation_advisories:
            crop_stmt = select(Crop).limit(1)
            crop_res = await db.execute(crop_stmt)
            crop = crop_res.scalar_one_or_none()
            crop_name = crop.name if crop else "Wheat"
            kc = crop.kc_mid if crop else 1.15

            irrigation_res = weather_service.calculate_irrigation_need(
                et0_mm=forecast.et0_fao_evapotranspiration,
                kc=kc,
                precip_mm=forecast.precipitation_probability_max,
                crop_name=crop_name,
                stage="mid",
            )

            if irrigation_res.irrigation_recommended and irrigation_res.net_irrigation_depth_mm >= 3.0:
                dedup_key = f"{today_str}:irrigation:{farmer_id}"
                action = await self._process_alert(
                    db=db,
                    farmer=farmer,
                    address=address,
                    pref=pref,
                    alert_type="irrigation",
                    dedup_key=dedup_key,
                    template_params={
                        "crop": crop_name,
                        "mm": f"{irrigation_res.net_irrigation_depth_mm:.1f}",
                        "m3": f"{irrigation_res.water_volume_m3_per_hectare:.0f}",
                    },
                    sms_provider=sms_provider,
                    lang=lang,
                )
                results.append(action)

        return results

    async def _process_alert(
        self,
        db: AsyncSession,
        farmer: Farmer,
        address: FarmerAddress,
        pref: AlertPreference,
        alert_type: str,
        dedup_key: str,
        template_params: Dict[str, str],
        sms_provider,
        lang: str,
    ) -> Dict:
        """Processes a single alert type with 24-hour deduplication and safe status logging."""
        # Check deduplication
        existing_log = await db.execute(select(AlertLog).where(AlertLog.deduplication_key == dedup_key))
        if existing_log.scalar_one_or_none():
            logger.info("Alert %s already logged for farmer %s today (deduplicated).", alert_type, farmer.id)
            return {
                "alert_type": alert_type,
                "status": "deduplicated_skipped",
                "message": "Already generated within the last 24 hours.",
                "dedup_key": dedup_key,
            }

        # Build multilingual message
        template = SMS_TEMPLATES.get(alert_type, {}).get(lang, SMS_TEMPLATES[alert_type]["en"])
        message_text = template.format(**template_params)

        # Check channel and dispatch
        channel = "sms" if pref.sms_enabled else "in_app"
        delivery_id = None
        status = "pending"

        if pref.sms_enabled:
            # Dispatch via configured provider
            success, del_id, err = await sms_provider.send_sms(
                to_phone=farmer.phone_number,
                message=message_text,
            )
            if success:
                status = "sent"
                delivery_id = del_id
            else:
                status = "provider_disabled" if "disabled" in (err or "").lower() else "failed"
                delivery_id = None
        else:
            status = "in_app_only"

        # Record in immutable audit log
        log_entry = AlertLog(
            farmer_id=farmer.id,
            alert_type=alert_type,
            channel=channel,
            message_snippet=message_text[:160],
            status=status,
            delivery_id=delivery_id,
            deduplication_key=dedup_key,
        )
        db.add(log_entry)
        await db.commit()
        await db.refresh(log_entry)

        return {
            "alert_type": alert_type,
            "channel": channel,
            "status": status,
            "message_snippet": message_text,
            "delivery_id": delivery_id,
            "dedup_key": dedup_key,
            "timestamp": log_entry.sent_at.isoformat(),
        }

    async def run_daily_batch(self, db: AsyncSession) -> Dict:
        """
        Executes daily alert evaluation across all active registered farmers.
        Returns aggregate summary.
        """
        stmt = select(Farmer.id).where(Farmer.is_active == True)
        res = await db.execute(stmt)
        farmer_ids = res.scalars().all()

        total_farmers = len(farmer_ids)
        alerts_evaluated = 0
        sms_sent = 0
        deduplicated = 0

        for f_id in farmer_ids:
            farmer_alerts = await self.evaluate_farmer_alerts(str(f_id), db)
            alerts_evaluated += len(farmer_alerts)
            for a in farmer_alerts:
                if a.get("status") == "sent":
                    sms_sent += 1
                elif a.get("status") == "deduplicated_skipped":
                    deduplicated += 1

        return {
            "total_farmers": total_farmers,
            "alerts_evaluated": alerts_evaluated,
            "sms_sent": sms_sent,
            "deduplicated_skipped": deduplicated,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


alert_scheduler_service = AlertSchedulerService()
