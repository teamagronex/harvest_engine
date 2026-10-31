"""
HarvestEngine: Base Model and Mixins
"""

from datetime import datetime, timezone
from sqlalchemy import Column, DateTime
from app.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)
