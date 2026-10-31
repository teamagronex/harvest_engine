"""
HarvestEngine: Common Pydantic Schemas and Response Envelopes
Ensures consistent JSON error shape and standard API response formats across all endpoints.
"""

from typing import Any, Generic, Optional, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    success: bool = True
    message: Optional[str] = None
    data: Optional[T] = None


class APIErrorResponse(BaseModel):
    success: bool = False
    code: str = Field(..., description="Machine-readable error identifier")
    message: str = Field(..., description="Actionable human-readable error description")
    details: Optional[Any] = Field(default=None, description="Detailed validation or context error info")


class HealthStatus(BaseModel):
    status: str
    environment: str
    database: str
    redis: str
    version: str
