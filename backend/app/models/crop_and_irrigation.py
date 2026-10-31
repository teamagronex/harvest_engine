"""
HarvestEngine: Crop, Irrigation History, and Farmer Feedback Models
Supports irrigation advisory calculation (ET0 * Kc - Peff), water conservation tracking, and advisory feedback.
"""

import uuid
from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.base import TimestampMixin, utc_now


class Crop(Base, TimestampMixin):
    __tablename__ = "crops"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(80), unique=True, nullable=False, index=True)         # e.g., 'Wheat', 'Rice (Paddy)', 'Cotton', 'Mustard'
    local_name = Column(String(100), nullable=True)                            # e.g., 'गेहूं (Gehun)', 'धान (Dhan)'
    crop_type = Column(String(50), nullable=False)                             # Kharif, Rabi, Zaid, Cash Crop
    
    # Crop coefficient (Kc) factors based on FAO-56 irrigation guidelines
    kc_initial = Column(Float, nullable=False, default=0.40)                    # Initial growth stage
    kc_crop_dev = Column(Float, nullable=False, default=0.75)                   # Vegetative / Development stage
    kc_mid_season = Column(Float, nullable=False, default=1.15)                 # Mid-season / Flowering / Grain filling
    kc_late_season = Column(Float, nullable=False, default=0.65)                # Ripening / Late season
    
    root_depth_m = Column(Float, default=1.0, nullable=False)                   # Root depth in meters

    irrigation_records = relationship("IrrigationHistory", back_populates="crop")

    def __repr__(self):
        return f"<Crop(name={self.name}, type={self.crop_type})>"


class IrrigationHistory(Base):
    __tablename__ = "irrigation_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farmer_id = Column(UUID(as_uuid=True), ForeignKey("farmers.id", ondelete="CASCADE"), nullable=False, index=True)
    crop_id = Column(UUID(as_uuid=True), ForeignKey("crops.id", ondelete="CASCADE"), nullable=False, index=True)
    
    date = Column(Date, nullable=False, index=True)
    water_applied_mm = Column(Float, nullable=False)                            # In mm (1 mm = 10 m3/ha)
    method = Column(String(50), default="flood", nullable=False)                # drip, sprinkler, flood, furrow
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    farmer = relationship("Farmer", back_populates="irrigation_records")
    crop = relationship("Crop", back_populates="irrigation_records")


class FarmerFeedback(Base):
    __tablename__ = "farmer_feedback"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farmer_id = Column(UUID(as_uuid=True), ForeignKey("farmers.id", ondelete="CASCADE"), nullable=False, index=True)
    
    advisory_type = Column(String(30), nullable=False, index=True)              # heat | flood | irrigation | general
    rating = Column(Integer, nullable=False)                                     # 1 to 5 stars
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    farmer = relationship("Farmer", back_populates="feedbacks")
