"""
HarvestEngine: Pydantic Schemas for Alert Preferences and Audit Logs
"""

from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class AlertPreferenceUpdateSchema(BaseModel):
    heat_alerts: Optional[bool] = Field(default=None, description="Toggle extreme heat advisories (>=40°C)")
    heavy_rain_alerts: Optional[bool] = Field(default=None, description="Toggle heavy rainfall alerts (>=50mm 3-day)")
    irrigation_advisories: Optional[bool] = Field(default=None, description="Toggle FAO-56 irrigation notifications")
    sms_enabled: Optional[bool] = Field(default=None, description="Opt-in consent for SMS broadcast")
    preferred_language: Optional[Literal["en", "hi", "or"]] = Field(
        default=None,
        description="Language for alerts: en (English), hi (Hindi), or (Odia)"
    )


class AlertPreferenceResponse(BaseModel):
    farmer_id: UUID
    heat_alerts: bool
    heavy_rain_alerts: bool
    irrigation_advisories: bool
    sms_enabled: bool
    preferred_language: str
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AlertLogResponse(BaseModel):
    id: UUID
    farmer_id: UUID
    alert_type: str
    channel: str
    message_snippet: str
    status: str
    delivery_id: Optional[str] = None
    sent_at: datetime
    deduplication_key: str

    class Config:
        from_attributes = True


class AlertDispatchResponse(BaseModel):
    success: bool
    evaluated_count: int
    actions: List[dict]
    provider_status: str
    timestamp: str
