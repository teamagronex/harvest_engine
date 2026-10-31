"""
HarvestEngine: Admin Request and Response Schemas
"""

import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field
from app.schemas.farmer import AddressResponse, AlertPreferenceResponse


class AdminLoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=128)


class AdminProfileResponse(BaseModel):
    id: uuid.UUID
    username: str
    created_at: datetime

    class Config:
        from_attributes = True


class AdminAuditLogResponse(BaseModel):
    id: uuid.UUID
    admin_id: Optional[uuid.UUID]
    action: str
    target_type: Optional[str]
    target_id: Optional[str]
    details: Optional[str]
    ip_address: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class AdminFarmerListItem(BaseModel):
    id: uuid.UUID
    name: str
    phone: str
    is_active: bool
    created_at: datetime
    address: Optional[AddressResponse] = None
    alert_preferences: Optional[AlertPreferenceResponse] = None

    class Config:
        from_attributes = True


class AdminFarmerListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    farmers: List[AdminFarmerListItem]


class SeedResponse(BaseModel):
    seeded_count: int
    message: str
