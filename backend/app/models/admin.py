"""
HarvestEngine: Admin User, Session, and Audit Log Models
Rule 9 enforced:
- Separate admin auth and cookie
- Password hashed with PBKDF2-HMAC-SHA256 and salt
- 8-hour sessions
- Lockout after 5 failures
- Audit logs for admin actions
"""

import uuid
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.base import utc_now


class AdminUser(Base):
    __tablename__ = "admin_users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    
    failed_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    sessions = relationship("AdminSession", back_populates="admin", cascade="all, delete-orphan")
    audit_logs = relationship("AdminAuditLog", back_populates="admin")

    def is_locked(self) -> bool:
        if self.locked_until and self.locked_until > utc_now():
            return True
        return False


class AdminSession(Base):
    __tablename__ = "admin_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    admin_id = Column(UUID(as_uuid=True), ForeignKey("admin_users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    
    ip_address = Column(String(45), nullable=True)

    admin = relationship("AdminUser", back_populates="sessions")

    def is_valid(self) -> bool:
        return self.revoked_at is None and self.expires_at > utc_now()


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    admin_id = Column(UUID(as_uuid=True), ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True, index=True)
    
    action = Column(String(50), nullable=False, index=True)      # e.g., 'view_farmers', 'update_config', 'export'
    target_type = Column(String(50), nullable=True)              # e.g., 'farmer', 'system'
    target_id = Column(String(100), nullable=True)
    details = Column(Text, nullable=True)                        # JSON serialized metadata or description
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

    admin = relationship("AdminUser", back_populates="audit_logs")
