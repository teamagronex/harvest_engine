"""
HarvestEngine: Farmer Schemas
Enforces:
- 10-digit Indian mobile validation
- 6-digit Indian Postal PIN Code validation
- Strict geographic bounding within India coordinates (Latitude 6.0° to 38.0° N, Longitude 68.0° to 98.0° E)
- Confirmation requirement for address operations
"""

import uuid
from typing import Optional
from pydantic import BaseModel, Field, field_validator
from app.services.security import validate_indian_phone


class FarmerSignupRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Farmer full name")
    phone: str = Field(..., description="10-digit Indian mobile number")
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$", description="Verification code received via SMS")
    
    # Address details
    pin_code: str = Field(..., pattern=r"^[1-9][0-9]{5}$", description="6-digit Indian Postal PIN code")
    village: str = Field(..., min_length=2, max_length=120, description="Village or Town name")
    district: str = Field(..., min_length=2, max_length=100, description="District")
    state: str = Field(..., min_length=2, max_length=100, description="State or Union Territory")
    
    latitude: float = Field(..., description="Latitude bounded within India (6.0° to 38.0° N)")
    longitude: float = Field(..., description="Longitude bounded within India (68.0° to 98.0° E)")
    confirmed: bool = Field(default=True, description="Must be true to create address")

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, v: str) -> str:
        return validate_indian_phone(v)

    @field_validator("latitude")
    @classmethod
    def validate_latitude_bounds(cls, v: float) -> float:
        if not (6.0 <= v <= 38.0):
            raise ValueError(
                f"Latitude {v:.4f} is outside the geographical boundaries of India (6.0°N to 38.0°N)."
            )
        return v

    @field_validator("longitude")
    @classmethod
    def validate_longitude_bounds(cls, v: float) -> float:
        if not (68.0 <= v <= 98.0):
            raise ValueError(
                f"Longitude {v:.4f} is outside the geographical boundaries of India (68.0°E to 98.0°E)."
            )
        return v


class AddressResponse(BaseModel):
    id: uuid.UUID
    pin_code: str
    village: str
    district: str
    state: str
    latitude: float
    longitude: float
    confirmed: bool

    class Config:
        from_attributes = True


class AlertPreferenceResponse(BaseModel):
    heat_alerts: bool
    heavy_rain_alerts: bool
    irrigation_advisories: bool
    sms_enabled: bool
    preferred_language: str

    class Config:
        from_attributes = True


class FarmerProfileResponse(BaseModel):
    id: uuid.UUID
    name: str
    phone: str
    is_active: bool
    address: Optional[AddressResponse] = None
    alert_preferences: Optional[AlertPreferenceResponse] = None

    class Config:
        from_attributes = True
