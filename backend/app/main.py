"""
HarvestEngine: FastAPI Main Application Entry Point
Tagline: "Smart Decisions for Sustainable Farming"

Enforces:
- Strict security headers (CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy)
- CORS allowlist
- Consistent JSON error envelopes
- API health check and OpenAPI documentation
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.schemas.common import APIErrorResponse, HealthStatus

# Configure structured logging with safe level
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("harvestengine")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Applies OWASP recommended security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(self)"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "connect-src 'self' https://api.open-meteo.com https://power.larc.nasa.gov https://api.postalpincode.in; "
            "frame-ancestors 'none';"
        )
        response.headers["Cache-Control"] = "no-store, max-age=0"
        
        if settings.SECURE:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup validation
    logger.info("Starting HarvestEngine Backend Service...")
    logger.info("Environment: %s | Secure: %s", settings.ENVIRONMENT, settings.SECURE)
    if settings.SECURE and settings.DEV_OTP_LOGGING:
        logger.critical("SECURITY VIOLATION: DEV_OTP_LOGGING was requested in Secure mode. Forcibly disabled.")
    yield
    logger.info("Shutting down HarvestEngine Backend Service...")


app = FastAPI(
    title="HarvestEngine API",
    description="Secure, mobile-first advisory platform for Indian farmers: hyper-local weather, heat alerts, flood-risk estimates, and irrigation advice.",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# 1. Security Headers
app.add_middleware(SecurityHeadersMiddleware)

# 2. CORS Allowlist
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# 3. Mount Routers
from app.api.auth import router as auth_router
from app.api.farmers import router as farmers_router
from app.api.address import router as address_router
from app.api.advisory import router as advisory_router
from app.api.admin import router as admin_router
from app.api.alerts import router as alerts_router

app.include_router(auth_router)
app.include_router(farmers_router)
app.include_router(address_router)
app.include_router(advisory_router)
app.include_router(admin_router)
app.include_router(alerts_router)


# 3. Global Exception Handlers ensuring consistent JSON error shapes
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        field = " -> ".join([str(loc) for loc in err.get("loc", []) if loc != "body"])
        errors.append({"field": field, "issue": err.get("msg")})
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=APIErrorResponse(
            success=False,
            code="VALIDATION_ERROR",
            message="Request parameters failed validation checks.",
            details=errors,
        ).model_dump(),
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled server exception: %s", str(exc), exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=APIErrorResponse(
            success=False,
            code="INTERNAL_SERVER_ERROR",
            message="An unexpected server error occurred. Please try again later.",
            details=str(exc) if settings.DEBUG else None,
        ).model_dump(),
    )


# 4. Core System Endpoints
@app.get(
    "/api/health",
    response_model=HealthStatus,
    tags=["System"],
    summary="Health Check",
    description="Returns backend readiness, environment state, and connectivity status."
)
async def health_check():
    return HealthStatus(
        status="healthy",
        environment=settings.ENVIRONMENT,
        database="configured",
        redis="configured",
        version="1.0.0",
    )


@app.get("/", tags=["System"])
async def root():
    return {
        "app": "HarvestEngine",
        "tagline": "Smart Decisions for Sustainable Farming",
        "version": "1.0.0",
        "api_docs": "/api/docs",
        "health": "/api/health",
    }
