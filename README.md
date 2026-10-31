# HarvestEngine (स्मार्ट खेती • ସ୍ମାର୍ଟ କୃଷି)
> **Tagline:** *"Smart Decisions for Sustainable Farming"*

HarvestEngine is a production-grade, secure, mobile-first advisory web application built for Indian farmers. It provides hyper-local weather intelligence, extreme heat wave alerts, indicative flood risk estimates, FAO-56 Penman-Monteith irrigation schedules, multi-lingual SMS notifications (English, Hindi, Odia), and an administrative governance portal.

---

## Architecture & Technology Stack

| Layer | Technologies & Standards |
|---|---|
| **Frontend** | React 19, Vite, TypeScript, Tailwind CSS, Lucide Icons, Mobile-First Touch Targets |
| **Backend** | FastAPI, Pydantic v2, Python 3.10+, Async SQLAlchemy 2.0 (`asyncpg`), Sync SQLAlchemy (`psycopg2`), Alembic |
| **Data Stores** | PostgreSQL 16 (Relational DB with foreign key cascades & unique constraints), Redis 7 (Cache & Rate Limiting) |
| **Meteorological APIs** | Open-Meteo API (Forecast, $ET_0$), NASA POWER (Historical Agroclimatology Fallback) |
| **Geocoding & Postal** | India Postal PIN API (`api.postalpincode.in`), India Mainland Geofence Validator ($6^\circ\text{N} - 38.5^\circ\text{N}$, $68^\circ\text{E} - 98^\circ\text{E}$) |
| **SMS Gateway** | Pluggable Provider Interface (`BaseSMSProvider`): Disabled by default, MSG91 (TRAI/DLT templates), Twilio adapter |
| **Containerization** | Docker Compose multi-service architecture, non-root application users, multi-stage builds |

---

## Security Architecture & Invariants

1. **Zero Passwords for Farmers (Rule 1 & 2):**
   - Farmers authenticate exclusively via their 10-digit Indian mobile number (`^[6-9]\d{9}$`).
   - OTPs are generated using CSPRNG (`secrets`), hashed using HMAC-SHA256 with a high-entropy server pepper (`OTP_PEPPER`), and checked using timing-safe `hmac.compare_digest`.
   - Raw OTPs are never stored in the database and never logged or returned in responses.
   - Sessions are 256-bit cryptographically secure random tokens; only their SHA-256 hash is persisted in the database.
   - Sent via `HttpOnly`, `SameSite=Lax`, `Secure` cookies with hourly activity rotation and instant revocation on sign-out.

2. **OTP Attack Hardening (Rule 3):**
   - **Lifetime:** 5 minutes.
   - **Attempt Limit:** Invalidation upon 5 incorrect attempts.
   - **Single Use:** Immediate timestamping in `consumed_at`.
   - **Send Throttles:** 30s resend cooldown, max 3 sends per 15 minutes, max 5 sends per 24 hours per phone number.
   - **Non-Enumeration:** Generic response *"If the number can receive a code, one will be sent."* prevents account discovery.

3. **Single Farm Address per Farmer (Rule 4):**
   - Enforced by database constraint `UNIQUE(farmer_id)`.
   - Backend strictly rejects address changes unless `confirmed=true` is explicitly provided.
   - UI warns: *"Save this address? It replaces your current address."*
   - Geographic coordinates are validated against the Indian landmass.

4. **Dedicated Administrator Security (Rule 9):**
   - Hosted at `/admin` with partitioned session cookie `harvest_admin_session`.
   - Passwords hashed using PBKDF2-HMAC-SHA256 with 100,000 iterations and unique 16-byte random salts.
   - 8-hour session lifetime with automatic lockout for 30 minutes after 5 consecutive failed logins.
   - Farmer catalog (`GET /api/admin/farmers`) is accessible strictly to authenticated admins.
   - All actions recorded in immutable `admin_audit_logs`. Synthetic-only seed generator.

5. **24-Hour Alert Deduplication & Non-Falsification (Rule 6):**
   - Daily alert evaluation generates a deduplication key: `YYYY-MM-DD:{alert_type}:{farmer_id}`.
   - Strict database unique constraint prevents duplicate messages within the same calendar day.
   - **Integrity Rule:** The system never pretends an SMS was sent if the provider is disabled or fails. Status is logged honestly as `provider_disabled`, `in_app_only`, or `failed`.

---

## Advisory Science & Algorithms

### 1. Extreme Heat Stress Advisory
Evaluates peak daily temperatures and relative humidity using the Rothfusz regression Heat Index:
- **Normal:** $< 35.0^\circ\text{C}$ &mdash; Standard field operations.
- **Hot:** $35.0^\circ\text{C} - 39.9^\circ\text{C}$ &mdash; Mulching advised; avoid peak afternoon irrigation.
- **Alert:** $40.0^\circ\text{C} - 44.9^\circ\text{C}$ &mdash; Irrigation required early morning (before 09:00 AM) or late evening (after 05:30 PM).
- **Severe:** $\ge 45.0^\circ\text{C}$ &mdash; Immediate crop cooling; pause agricultural field labor.

### 2. Indicative Flood Risk
- Analyzes 3-day accumulated rainfall and 24-hour peak intensity:
  - **Low:** $< 20\text{ mm}$ 3-day total.
  - **Moderate:** $20 - 49.9\text{ mm}$ 3-day total.
  - **High:** $\ge 50.0\text{ mm}$ 3-day total or $\ge 35.0\text{ mm}$ single-day downpour.
- Explicit label: *"Indicative estimate, not an official warning."* Direct hyperlink to IMD official alerts (`mausam.imd.gov.in`).

### 3. FAO-56 Penman-Monteith Irrigation Scheduling
Computes crop evapotranspiration ($ET_c$) and net water demand ($W_{\text{need}}$):
$$ET_c = ET_0 \times K_c$$
$$P_{\text{eff}} = \text{USDA Soil Conservation Service effective rainfall formula}$$
$$W_{\text{need}} = \max(0, ET_c - P_{\text{eff}})$$
$$\text{Water Volume } (m^3/\text{ha}) = W_{\text{need}} (\text{mm}) \times 10$$
Provides clear plain-language rationale: *"Apply approximately 18 mm irrigation (180 m³/ha) over 3 days"* or *"Skip irrigation: rainfall satisfies water requirements"*.

---

## Quickstart & Docker Compose

### 1. Clone & Configure Environment
```bash
git clone https://github.com/your-org/harvestengine.git
cd harvestengine

# Copy configuration template
cp .env.example .env
```

Review `.env` settings:
```ini
ENVIRONMENT="development"
SECURE="false"                    # Set to 'true' in production with HTTPS
DATABASE_URL="postgresql+asyncpg://harvest_user:harvest_password@postgres:5432/harvest_db"
REDIS_URL="redis://redis:6379/0"
OTP_PEPPER="generate-at-least-32-random-hex-characters"
ADMIN_PASSWORD="ChooseAStrongAdminPassword123!"
SMS_PROVIDER="disabled"           # disabled | msg91 | twilio
```

### 2. Launch Entire Cluster
```bash
docker compose up -d --build
```
This spins up:
- **`postgres`**: PostgreSQL 16 on port `5432` with persistent healthcheck.
- **`redis`**: Redis 7 cache on port `6379`.
- **`backend`**: FastAPI application on port `8000` (auto-runs Alembic migrations).
- **`frontend`**: React + Vite application on port `3000` via Nginx reverse proxy.

### 3. Apply Migrations & Verify Health
```bash
# Verify Alembic migrations
docker compose exec backend alembic upgrade head

# Check system health
curl -s http://localhost:8000/api/health
```

---

## Automated Test Suites

### Running Backend Unit & Integration Tests (pytest)
```bash
# Run inside backend container
docker compose exec backend pytest -v

# Run with coverage report
docker compose exec backend pytest --cov=app --cov-report=term-missing
```

Test coverage includes:
- `test_security_headers_and_csrf.py`: OWASP headers & CSRF Origin/signature checks.
- `test_otp_and_auth.py`: OTP lifetime, attempts, cooldowns, send throttles, single-use.
- `test_address_and_profile.py`: `UNIQUE(farmer_id)` constraint, India geofence, phone change flow.
- `test_advisories_and_weather.py`: Heat index categories, flood thresholds, FAO-56 formulas.
- `test_admin_portal.py`: PBKDF2 hashing, 5-failure lockout, audit ledger, catalog access.
- `test_alert_scheduler_and_sms.py`: 24h deduplication keys, SMS provider safety, multilingual templates.

### Running In-App Interactive Test Runner
Navigate to the **Automated Tests (M7)** tab in the web UI and click **"Run All 12 Test Suites"** to execute the end-to-end suite directly inside the browser.

---

## API Reference (OpenAPI)

Interactive documentation is available at:
- **Swagger UI:** `http://localhost:8000/api/docs`
- **ReDoc:** `http://localhost:8000/api/redoc`

### Core Endpoints

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/api/health` | Backend and database readiness probe | Public |
| `GET` | `/api/csrf-token` | Generate signed CSRF token | Public |
| `POST` | `/api/otp/request` | Request 6-digit OTP (rate-limited, generic response) | Public |
| `POST` | `/api/farmers` | Farmer registration with OTP verification | Public (CSRF) |
| `POST` | `/api/recover` | Recover existing farmer session via OTP | Public (CSRF) |
| `POST` | `/api/logout` | Revoke session and clear cookies | Farmer Session |
| `GET` | `/api/me` | Retrieve authenticated farmer profile | Farmer Session |
| `PATCH` | `/api/me` | Update farmer name (no OTP required) | Farmer Session |
| `POST` | `/api/me/phone/request-otp` | Request OTP to new mobile number | Farmer Session |
| `PATCH` | `/api/me/phone` | Verify OTP and confirm phone change | Farmer Session |
| `PUT` | `/api/address` | Upsert single farm address (`confirmed=true` required) | Farmer Session |
| `GET` | `/api/pincode/{pincode}` | Lookup Indian postal district, state, and villages | Public |
| `GET` | `/api/weather/forecast` | Fetch 7-day Open-Meteo forecast and $ET_0$ | Farmer Session |
| `GET` | `/api/advisory/heat` | Evaluate IMD heat stress index | Farmer Session |
| `GET` | `/api/advisory/flood` | Evaluate indicative flood risk with IMD link | Farmer Session |
| `GET` | `/api/advisory/irrigation` | Compute FAO-56 Penman-Monteith crop water need | Farmer Session |
| `GET` | `/api/alerts/preferences` | Retrieve alert toggles and language setting | Farmer Session |
| `PATCH` | `/api/alerts/preferences` | Update notification channels & TRAI opt-in consent | Farmer Session |
| `GET` | `/api/alerts/logs` | View 24h deduplicated alert audit logs | Farmer Session |
| `POST` | `/api/alerts/dispatch-daily` | Trigger daily evaluation across farm coordinates | Farmer Session |
| `POST` | `/api/admin/login` | Admin authentication (PBKDF2, 8h session) | Public |
| `POST` | `/api/admin/logout` | Revoke admin session | Admin Session |
| `GET` | `/api/admin/farmers` | List registered farmers (strictly admin only) | Admin Session |
| `GET` | `/api/admin/audit-logs` | Retrieve immutable administrative audit ledger | Admin Session |
| `POST` | `/api/admin/seed` | Generate synthetic farmer seed records | Admin Session |

---

## Production & Security Readiness Checklist

Before promoting HarvestEngine to production:

- [x] **Zero Password Authentication:** Enforced. Farmers authenticate only via 10-digit mobile and peppered OTPs.
- [x] **Secure Session Storage:** Enforced. 256-bit random tokens; only SHA-256 hash is persisted in database.
- [ ] **HTTPS Enforcement:** Set `SECURE=true` in `.env`. Requires TLS 1.3 termination via reverse proxy/Cloud Run.
- [ ] **Production Cookie Flags:** When `SECURE=true`, cookies are flagged `Secure`, `HttpOnly`, and `SameSite=Lax`.
- [x] **OTP Pepper Security:** Set `OTP_PEPPER` to at least 32 cryptographically random hex characters.
- [x] **Development OTP Logging Disabled:** When `SECURE=true`, `DEV_OTP_LOGGING` is forcibly disabled by `backend/app/main.py` startup validation.
- [x] **Strict CORS Allowlist:** Specify exact production domains in `ALLOWED_ORIGIN` (no wildcards).
- [x] **OWASP Security Headers:** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, strict `Content-Security-Policy`.
- [x] **Database Constraints:** `farmer_addresses.UNIQUE(farmer_id)` and `alert_logs.UNIQUE(deduplication_key)`.
- [ ] **SMS Gateway Activation (TRAI/DLT):** Register principal entity and message templates on Indian telecom DLT portals (e.g. Jio/Airtel/Vil). Configure `SMS_PROVIDER=msg91` with production credentials.
- [x] **Automated Deduplication:** 24-hour deduplication key guarantees maximum 1 SMS per category per day to prevent farmer fatigue.
- [x] **Opt-Out Compliance:** All SMS copies include mandatory *"Reply STOP to opt out"* text.
- [ ] **PostgreSQL Backups:** Configure daily automated WAL archiving and pg_dump snapshots.
- [ ] **Redis Rate Limiting:** Point `REDIS_URL` to a production managed Redis instance.

---

## License

HarvestEngine is released under the **Apache 2.0 License**.
Copyright &copy; 2026 HarvestEngine Contributors.
