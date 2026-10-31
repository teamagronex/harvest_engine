"""
HarvestEngine: Farmer Profile and Address Schemas
Supports:
- Name editing (no OTP required)
- Phone change request (triggers OTP to the new number)
- Phone change confirmation (verifies OTP, checks uniqueness, updates phone)
- Address upsert (strictly requires confirmed=True and India coordinate bounds)
"""

from pydantic import BaseModel, Field, field_validator
from app.services.security import validate_indian_phone


class ProfileUpdateNameRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Updated farmer full name")

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        cleaned = v.strip()
        if len(cleaned) < 2:
            raise ValueError("Farmer name must be at least 2 characters.")
        return cleaned


class PhoneChangeRequest(BaseModel):
    new_phone: str = Field(..., description="New 10-digit Indian mobile number")

    @field_validator("new_phone")
    @classmethod
    def clean_phone(cls, v: str) -> str:
        return validate_indian_phone(v)


class PhoneChangeConfirmRequest(BaseModel):
    new_phone: str = Field(..., description="New 10-digit Indian mobile number")
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$", description="Verification code sent to the NEW phone")
    confirmed: bool = Field(..., description="Explicit farmer confirmation required")

    @field_validator("new_phone")
    @classmethod
    def clean_phone(cls, v: str) -> str:
        return validate_indian_phone(v)

    @field_validator("confirmed")
    @classmethod
    def require_confirmation(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Explicit confirmation is required to change your registered mobile number.")
        return v


class AddressUpsertRequest(BaseModel):
    pin_code: str = Field(..., pattern=r"^[1-9][0-9]{5}$", description="6-digit Indian Postal PIN")
    village: str = Field(..., min_length=2, max_length=120)
    district: str = Field(..., min_length=2, max_length=100)
    state: str = Field(..., min_length=2, max_length=100)
    latitude: float = Field(..., description="Latitude bounded within India (6.0°N to 38.0°N)")
    longitude: float = Field(..., description="Longitude bounded within India (68.0°E to 98.0°E)")
    confirmed: bool = Field(..., description="Strictly required: confirms replacement of previous address")

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, v: float) -> float:
        if not (6.0 <= v <= 38.0):
            raise ValueError(f"Latitude {v:.4f}°N is outside the geographical borders of India (6.0°N to 38.0°N).")
        return v

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, v: float) -> float:
        if not (68.0 <= v <= 98.0):
            raise ValueError(f"Longitude {v:.4f}°E is outside the geographical borders of India (68.0°E to 98.0°E).")
        return v

    @field_validator("confirmed")
    @classmethod
    def validate_confirmation(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Address confirmation is required. Please confirm you wish to replace your current address.")
        return v
