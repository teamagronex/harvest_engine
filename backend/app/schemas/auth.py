"""
HarvestEngine: Authentication Request and Response Schemas
"""

from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator
from app.services.security import validate_indian_phone


class OTPRequest(BaseModel):
    phone: str = Field(..., description="Indian 10-digit mobile number, with or without +91 / 0")
    purpose: Literal["signup", "recovery", "phone_change"] = Field(
        ...,
        description="Purpose for which OTP is being requested"
    )

    @field_validator("phone")
    @classmethod
    def clean_and_validate_phone(cls, v: str) -> str:
        return validate_indian_phone(v)


class OTPVerifyRequest(BaseModel):
    phone: str
    purpose: Literal["signup", "recovery", "phone_change"]
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")

    @field_validator("phone")
    @classmethod
    def clean_and_validate_phone(cls, v: str) -> str:
        return validate_indian_phone(v)


class FarmerRecoveryRequest(BaseModel):
    phone: str = Field(..., description="Registered 10-digit Indian mobile number")
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")

    @field_validator("phone")
    @classmethod
    def clean_and_validate_phone(cls, v: str) -> str:
        return validate_indian_phone(v)
