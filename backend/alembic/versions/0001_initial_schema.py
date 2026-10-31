"""Initial schema for HarvestEngine

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-10-31 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Farmers table
    op.create_table(
        'farmers',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('phone', sa.String(length=10), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_farmers_phone', 'farmers', ['phone'], unique=True)

    # 2. Farmer Addresses table (UNIQUE(farmer_id), cascade delete)
    op.create_table(
        'farmer_addresses',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('farmer_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('farmers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('pin_code', sa.String(length=6), nullable=False),
        sa.Column('village', sa.String(length=120), nullable=False),
        sa.Column('district', sa.String(length=100), nullable=False),
        sa.Column('state', sa.String(length=100), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('confirmed', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('farmer_id', name='uq_farmer_addresses_farmer_id')
    )
    op.create_index('ix_farmer_addresses_pin', 'farmer_addresses', ['pin_code'])
    op.create_index('idx_farmer_address_coords', 'farmer_addresses', ['latitude', 'longitude'])

    # 3. Farmer Sessions table (SHA-256 token hash)
    op.create_table(
        'sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('farmer_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('farmers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('last_active_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
    )
    op.create_index('ix_sessions_token_hash', 'sessions', ['token_hash'], unique=True)
    op.create_index('ix_sessions_farmer_id', 'sessions', ['farmer_id'])
    op.create_index('ix_sessions_expires_at', 'sessions', ['expires_at'])

    # 4. OTPs table (HMAC-SHA256 with pepper)
    op.create_table(
        'otps',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('phone', sa.String(length=10), nullable=False),
        sa.Column('purpose', sa.String(length=30), nullable=False),
        sa.Column('otp_hash', sa.String(length=64), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('consumed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
    )
    op.create_index('ix_otps_phone', 'otps', ['phone'])
    op.create_index('ix_otps_purpose', 'otps', ['purpose'])
    op.create_index('idx_otp_phone_purpose_active', 'otps', ['phone', 'purpose', 'consumed_at', 'expires_at'])

    # 5. Alert Preferences table
    op.create_table(
        'alert_preferences',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('farmer_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('farmers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('heat_alerts', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('heavy_rain_alerts', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('irrigation_advisories', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('sms_enabled', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('preferred_language', sa.String(length=10), nullable=False, server_default='en'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('farmer_id', name='uq_alert_preferences_farmer_id')
    )

    # 6. Alert Logs table (Deduplication within 24h)
    op.create_table(
        'alert_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('farmer_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('farmers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('alert_type', sa.String(length=30), nullable=False),
        sa.Column('channel', sa.String(length=20), nullable=False, server_default='sms'),
        sa.Column('message_snippet', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('delivery_id', sa.String(length=100), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('deduplication_key', sa.String(length=120), nullable=False),
        sa.UniqueConstraint('deduplication_key', name='uq_alert_logs_dedup_key')
    )
    op.create_index('ix_alert_logs_farmer_id', 'alert_logs', ['farmer_id'])
    op.create_index('ix_alert_logs_sent_at', 'alert_logs', ['sent_at'])

    # 7. Admin Users table (PBKDF2-HMAC-SHA256 with salt)
    op.create_table(
        'admin_users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('username', sa.String(length=50), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('failed_attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_admin_users_username', 'admin_users', ['username'], unique=True)

    # 8. Admin Sessions table (8-hour sessions)
    op.create_table(
        'admin_sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('admin_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('admin_users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
    )
    op.create_index('ix_admin_sessions_token_hash', 'admin_sessions', ['token_hash'], unique=True)
    op.create_index('ix_admin_sessions_admin_id', 'admin_sessions', ['admin_id'])

    # 9. Admin Audit Logs table
    op.create_table(
        'admin_audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('admin_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('admin_users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('action', sa.String(length=50), nullable=False),
        sa.Column('target_type', sa.String(length=50), nullable=True),
        sa.Column('target_id', sa.String(length=100), nullable=True),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_admin_audit_logs_action', 'admin_audit_logs', ['action'])
    op.create_index('ix_admin_audit_logs_created_at', 'admin_audit_logs', ['created_at'])

    # 10. Crops table (FAO-56 Kc values)
    op.create_table(
        'crops',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(length=80), nullable=False),
        sa.Column('local_name', sa.String(length=100), nullable=True),
        sa.Column('crop_type', sa.String(length=50), nullable=False),
        sa.Column('kc_initial', sa.Float(), nullable=False, server_default='0.40'),
        sa.Column('kc_crop_dev', sa.Float(), nullable=False, server_default='0.75'),
        sa.Column('kc_mid_season', sa.Float(), nullable=False, server_default='1.15'),
        sa.Column('kc_late_season', sa.Float(), nullable=False, server_default='0.65'),
        sa.Column('root_depth_m', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_crops_name', 'crops', ['name'], unique=True)

    # 11. Irrigation History table
    op.create_table(
        'irrigation_history',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('farmer_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('farmers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('crop_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('crops.id', ondelete='CASCADE'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('water_applied_mm', sa.Float(), nullable=False),
        sa.Column('method', sa.String(length=50), nullable=False, server_default='flood'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_irrigation_history_farmer_id', 'irrigation_history', ['farmer_id'])
    op.create_index('ix_irrigation_history_date', 'irrigation_history', ['date'])

    # 12. Farmer Feedback table
    op.create_table(
        'farmer_feedback',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('farmer_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('farmers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('advisory_type', sa.String(length=30), nullable=False),
        sa.Column('rating', sa.Integer(), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_farmer_feedback_farmer_id', 'farmer_feedback', ['farmer_id'])


def downgrade() -> None:
    op.drop_table('farmer_feedback')
    op.drop_table('irrigation_history')
    op.drop_table('crops')
    op.drop_table('admin_audit_logs')
    op.drop_table('admin_sessions')
    op.drop_table('admin_users')
    op.drop_table('alert_logs')
    op.drop_table('alert_preferences')
    op.drop_table('otps')
    op.drop_table('sessions')
    op.drop_table('farmer_addresses')
    op.drop_table('farmers')
