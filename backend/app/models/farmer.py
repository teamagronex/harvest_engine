"""
HarvestEngine: Farmer, Address, and Session Models
Rules enforced:
- 10-digit Indian mobile, indexed, unique
- One address per farmer: UNIQUE(farmer_id), confirmed boolean
- Coordinates with geographic constraints (India latitude 6-38, longitude 68-98)
- 256-bit hashed session tokens with cascade revocation and rotation
"""

import uuid
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.base import TimestampMixin, utc_now


class Farmer(Base, TimestampMixin):
    __tablename__ = "farmers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone = Column(String(10), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # Relationships
    address = relationship("FarmerAddress", back_populates="farmer", uselist=False, cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="farmer", cascade="all, delete-orphan")
    alert_preferences = relationship("AlertPreference", back_populates="farmer", uselist=False, cascade="all, delete-orphan")
    alert_logs = relationship("AlertLog", back_populates="farmer", cascade="all, delete-orphan")
    irrigation_records = relationship("IrrigationHistory", back_populates="farmer", cascade="all, delete-orphan")
    feedbacks = relationship("FarmerFeedback", back_populates="farmer", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Farmer(id={self.id}, phone=***{self.phone[-4:]})>"


class FarmerAddress(Base, TimestampMixin):
    __tablename__ = "farmer_addresses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Strictly one address per farmer: UNIQUE(farmer_id)
    farmer_id = Column(UUID(as_uuid=True), ForeignKey("farmers.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    
    pin_code = Column(String(6), nullable=False, index=True)
    village = Column(String(120), nullable=False)
    district = Column(String(100), nullable=False)
    state = Column(String(100), nullable=False)
    
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    
    # Backend rejects changes without confirmed=true
    confirmed = Column(Boolean, default=False, nullable=False)

    farmer = relationship("Farmer", back_populates="address")

    __table_args__ = (
        Index("idx_farmer_address_coords", "latitude", "longitude"),
    )

    def __repr__(self):
        return f"<FarmerAddress(farmer_id={self.farmer_id}, pin={self.pin_code}, village={self.village})>"


class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farmer_id = Column(UUID(as_uuid=True), ForeignKey("farmers.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Store only the SHA-256 hash of the 256-bit random session token
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    last_active_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)

    farmer = relationship("Farmer", back_populates="sessions")

    def is_valid(self) -> bool:
        return self.revoked_at is None and self.expires_at > utc_now()
