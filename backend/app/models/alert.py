"""
HarvestEngine: Alert Preferences and Audit Logs
Rules enforced:
- Farmer alert preferences (heat, heavy rain, irrigation, SMS opt-in, language)
- Alert logs with deduplication within 24h per alert type and delivery status tracking
"""

import uuid
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.base import TimestampMixin, utc_now


class AlertPreference(Base, TimestampMixin):
    __tablename__ = "alert_preferences"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farmer_id = Column(UUID(as_uuid=True), ForeignKey("farmers.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    
    heat_alerts = Column(Boolean, default=True, nullable=False)
    heavy_rain_alerts = Column(Boolean, default=True, nullable=False)
    irrigation_advisories = Column(Boolean, default=True, nullable=False)
    sms_enabled = Column(Boolean, default=False, nullable=False)  # Requires explicit opt-in
    preferred_language = Column(String(10), default="en", nullable=False)  # en | hi | or

    farmer = relationship("Farmer", back_populates="alert_preferences")

    def __repr__(self):
        return f"<AlertPreference(farmer_id={self.farmer_id}, sms={self.sms_enabled}, lang={self.preferred_language})>"


class AlertLog(Base):
    __tablename__ = "alert_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farmer_id = Column(UUID(as_uuid=True), ForeignKey("farmers.id", ondelete="CASCADE"), nullable=False, index=True)
    
    alert_type = Column(String(30), nullable=False, index=True)  # heat | flood | irrigation
    channel = Column(String(20), default="sms", nullable=False)   # sms | in_app
    message_snippet = Column(Text, nullable=False)
    status = Column(String(20), default="pending", nullable=False)  # pending | sent | delivered | failed
    delivery_id = Column(String(100), nullable=True)
    sent_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    
    # Format: YYYY-MM-DD:alert_type:farmer_id for strict 24h deduplication
    deduplication_key = Column(String(120), unique=True, nullable=False, index=True)

    farmer = relationship("Farmer", back_populates="alert_logs")
