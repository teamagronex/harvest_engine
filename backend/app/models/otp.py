"""
HarvestEngine: OTP Model
Rules enforced:
- HMAC with server pepper stored in database (never plain text)
- Tracks purpose: 'signup', 'login_recovery', 'phone_change'
- Tracks attempts (max 5), expiry (5 minutes), sent_at, consumed_at
"""

import uuid
from sqlalchemy import (
    Column,
    DateTime,
    Index,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
from app.models.base import utc_now


class OTP(Base):
    __tablename__ = "otps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone = Column(String(10), nullable=False, index=True)
    purpose = Column(String(30), nullable=False, index=True)  # signup | login_recovery | phone_change
    
    # Stored as HMAC-SHA256 hex digest using OTP_PEPPER
    otp_hash = Column(String(64), nullable=False)
    
    attempts = Column(Integer, default=0, nullable=False)
    sent_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    consumed_at = Column(DateTime(timezone=True), nullable=True)
    
    ip_address = Column(String(45), nullable=True)

    __table_args__ = (
        Index("idx_otp_phone_purpose_active", "phone", "purpose", "consumed_at", "expires_at"),
    )

    def is_usable(self, max_attempts: int = 5) -> bool:
        return (
            self.consumed_at is None
            and self.attempts < max_attempts
            and self.expires_at > utc_now()
        )
