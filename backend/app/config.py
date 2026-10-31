"""
HarvestEngine: Application Configuration
Strict configuration using Pydantic Settings.
Enforces security constraints, validation, and zero-leakage defaults.
"""

from typing import List, Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # General Environment
    ENVIRONMENT: str = Field(default="development", description="development, staging, or production")
    DEBUG: bool = Field(default=False)
    SECURE: bool = Field(default=False, description="Set True in production for HTTPS, Secure cookies, HSTS")
    ALLOWED_ORIGIN: str = Field(
        default="http://localhost:3000,http://localhost:5173",
        description="Comma-separated list of allowed CORS origins"
    )

    # Database
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://harvest_user:harvest_password@localhost:5432/harvestengine",
        description="Async PostgreSQL connection URL"
    )
    SYNC_DATABASE_URL: str = Field(
        default="postgresql+psycopg2://harvest_user:harvest_password@localhost:5432/harvestengine",
        description="Sync PostgreSQL connection URL for Alembic migrations"
    )
    DB_POOL_SIZE: int = Field(default=10)
    DB_MAX_OVERFLOW: int = Field(default=20)
    DB_POOL_TIMEOUT: int = Field(default=30)

    # Redis
    REDIS_URL: str = Field(default="redis://localhost:6379/0")

    # Security & Cryptography
    OTP_PEPPER: str = Field(
        default="change_this_to_a_secure_256_bit_random_hex_pepper_in_env",
        description="Secret server pepper used in HMAC-SHA256 for OTP hashing"
    )
    SESSION_SECRET: str = Field(
        default="change_this_session_secret_to_a_random_32_byte_hex_in_env",
        description="Key used for cryptographic session signing and CSRF tokens"
    )

    # Admin Credentials & Lockout
    ADMIN_USERNAME: str = Field(default="admin")
    ADMIN_PASSWORD: str = Field(
        default="AdminMasterKey123!",
        description="Initial admin password, securely hashed with PBKDF2-HMAC-SHA256 and salt"
    )
    ADMIN_SESSION_COOKIE_NAME: str = Field(default="harvest_admin_session")
    ADMIN_SESSION_EXPIRE_HOURS: int = Field(default=8)
    ADMIN_MAX_LOGIN_ATTEMPTS: int = Field(default=5)
    ADMIN_LOCKOUT_MINUTES: int = Field(default=30)

    # Farmer Session Settings
    SESSION_COOKIE_NAME: str = Field(default="harvest_session")
    SESSION_EXPIRE_DAYS: int = Field(default=30)
    SESSION_ROTATION_INTERVAL_MINUTES: int = Field(default=60)

    # OTP Anti-Abuse Rules
    OTP_LENGTH: int = Field(default=6)
    OTP_EXPIRE_MINUTES: int = Field(default=5)
    OTP_MAX_ATTEMPTS: int = Field(default=5)
    OTP_RESEND_COOLDOWN_SECONDS: int = Field(default=30)
    OTP_MAX_SENDS_PER_15_MIN: int = Field(default=3)
    OTP_MAX_SENDS_PER_24_HR: int = Field(default=5)
    DEV_OTP_LOGGING: bool = Field(
        default=False,
        description="Allows echoing OTP in dev logs only. FORCED FALSE if SECURE=true."
    )

    # External APIs
    OPEN_METEO_BASE_URL: str = Field(default="https://api.open-meteo.com/v1")
    NASA_POWER_BASE_URL: str = Field(default="https://power.larc.nasa.gov/api/temporal/daily/point")
    POSTAL_PINCODE_API_URL: str = Field(default="https://api.postalpincode.in/pincode")
    GEOCODING_NOMINATIM_URL: str = Field(default="https://nominatim.openstreetmap.org/search")

    # SMS Provider Interface (disabled until configured)
    SMS_PROVIDER: str = Field(default="disabled", description="'disabled', 'msg91', or 'twilio'")
    SMS_API_KEY: Optional[str] = None
    SMS_SENDER_ID: str = Field(default="HARVST")
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_PHONE_NUMBER: Optional[str] = None

    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = Field(default=True)
    RATE_LIMIT_DEFAULT_PER_MIN: int = Field(default=60)
    RATE_LIMIT_OTP_REQUEST_PER_MIN: int = Field(default=5)
    RATE_LIMIT_AUTH_PER_MIN: int = Field(default=10)

    @field_validator("DEV_OTP_LOGGING")
    @classmethod
    def enforce_no_otp_logging_in_production(cls, v: bool, info) -> bool:
        secure_mode = info.data.get("SECURE", False)
        env_mode = info.data.get("ENVIRONMENT", "development")
        if (secure_mode or env_mode == "production") and v is True:
            # Strictly force off in secure / production mode
            return False
        return v

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGIN.split(",") if origin.strip()]


settings = Settings()
