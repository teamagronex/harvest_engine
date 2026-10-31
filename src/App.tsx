import React, { useState } from 'react';
import {
  ShieldCheck,
  Database,
  Layers,
  Terminal,
  Server,
  CloudSun,
  Flame,
  Droplets,
  Sprout,
  CheckCircle2,
  Lock,
  Smartphone,
  Cpu,
  FileCode2,
  ChevronRight,
  ExternalLink,
  Info,
  Copy,
  Check,
  KeyRound,
  FileCheck,
  MapPin,
  ShieldAlert,
  Bell,
} from 'lucide-react';

interface SchemaTable {
  name: string;
  category: 'Farmers & Identity' | 'Security & Sessions' | 'Advisory & Crops' | 'Admin & Audit';
  description: string;
  columns: { name: string; type: string; key?: 'PK' | 'FK' | 'UQ' | 'IDX'; note?: string }[];
}

const SCHEMA_TABLES: SchemaTable[] = [
  {
    name: 'farmers',
    category: 'Farmers & Identity',
    description: 'Farmer base profiles authenticated via OTP. No passwords stored.',
    columns: [
      { name: 'id', type: 'UUID', key: 'PK' },
      { name: 'phone', type: 'VARCHAR(10)', key: 'UQ', note: '10-digit Indian mobile, indexed' },
      { name: 'name', type: 'VARCHAR(100)' },
      { name: 'is_active', type: 'BOOLEAN', note: 'Default true' },
      { name: 'created_at', type: 'TIMESTAMPTZ' },
      { name: 'updated_at', type: 'TIMESTAMPTZ' },
    ],
  },
  {
    name: 'farmer_addresses',
    category: 'Farmers & Identity',
    description: 'Single address per farmer. Strict UNIQUE(farmer_id) with confirmed flag.',
    columns: [
      { name: 'id', type: 'UUID', key: 'PK' },
      { name: 'farmer_id', type: 'UUID', key: 'UQ', note: 'FK -> farmers.id, ON DELETE CASCADE' },
      { name: 'pin_code', type: 'VARCHAR(6)', key: 'IDX' },
      { name: 'village', type: 'VARCHAR(120)' },
      { name: 'district', type: 'VARCHAR(100)' },
      { name: 'state', type: 'VARCHAR(100)' },
      { name: 'latitude', type: 'FLOAT', key: 'IDX', note: 'Bounded to India (6°-38°N)' },
      { name: 'longitude', type: 'FLOAT', key: 'IDX', note: 'Bounded to India (68°-98°E)' },
      { name: 'confirmed', type: 'BOOLEAN', note: 'Requires confirmed=true to upsert' },
    ],
  },
  {
    name: 'sessions',
    category: 'Security & Sessions',
    description: 'Farmer auth sessions. Stores only 256-bit token SHA256 hash.',
    columns: [
      { name: 'id', type: 'UUID', key: 'PK' },
      { name: 'farmer_id', type: 'UUID', key: 'FK', note: 'FK -> farmers.id, ON DELETE CASCADE' },
      { name: 'token_hash', type: 'VARCHAR(64)', key: 'UQ', note: 'SHA-256 of 256-bit token' },
      { name: 'expires_at', type: 'TIMESTAMPTZ', key: 'IDX' },
      { name: 'created_at', type: 'TIMESTAMPTZ' },
      { name: 'last_active_at', type: 'TIMESTAMPTZ' },
      { name: 'revoked_at', type: 'TIMESTAMPTZ', note: 'Nullable, set on signout' },
      { name: 'ip_address', type: 'VARCHAR(45)' },
      { name: 'user_agent', type: 'TEXT' },
    ],
  },
  {
    name: 'otps',
    category: 'Security & Sessions',
    description: 'CSPRNG OTP requests hashed with server pepper HMAC-SHA256.',
    columns: [
      { name: 'id', type: 'UUID', key: 'PK' },
      { name: 'phone', type: 'VARCHAR(10)', key: 'IDX' },
      { name: 'purpose', type: 'VARCHAR(30)', key: 'IDX', note: 'signup | login_recovery | phone_change' },
      { name: 'otp_hash', type: 'VARCHAR(64)', note: 'HMAC-SHA256 with OTP_PEPPER' },
      { name: 'attempts', type: 'INTEGER', note: 'Max 5 attempts allowed' },
      { name: 'sent_at', type: 'TIMESTAMPTZ' },
      { name: 'expires_at', type: 'TIMESTAMPTZ', key: 'IDX', note: '5-minute lifetime' },
      { name: 'consumed_at', type: 'TIMESTAMPTZ', note: 'Single-use guarantee' },
      { name: 'ip_address', type: 'VARCHAR(45)' },
    ],
  },
  {
    name: 'alert_preferences',
    category: 'Advisory & Crops',
    description: 'Notification channels and language preferences per farmer.',
    columns: [
      { name: 'id', type: 'UUID', key: 'PK' },
      { name: 'farmer_id', type: 'UUID', key: 'UQ', note: 'FK -> farmers.id, ON DELETE CASCADE' },
      { name: 'heat_alerts', type: 'BOOLEAN', note: 'Default true' },
      { name: 'heavy_rain_alerts', type: 'BOOLEAN', note: 'Default true' },
      { name: 'irrigation_advisories', type: 'BOOLEAN', note: 'Default true' },
      { name: 'sms_enabled', type: 'BOOLEAN', note: 'Default false (explicit opt-in)' },
      { name: 'preferred_language', type: 'VARCHAR(10)', note: 'en | hi | or' },
    ],
  },
  {
    name: 'alert_logs',
    category: 'Advisory & Crops',
    description: 'Alert audit history with strict 24-hour deduplication keys.',
    columns: [
      { name: 'id', type: 'UUID', key: 'PK' },
      { name: 'farmer_id', type: 'UUID', key: 'FK', note: 'FK -> farmers.id, ON DELETE CASCADE' },
      { name: 'alert_type', type: 'VARCHAR(30)', note: 'heat | flood | irrigation' },
      { name: 'channel', type: 'VARCHAR(20)', note: 'sms | in_app' },
      { name: 'message_snippet', type: 'TEXT' },
      { name: 'status', type: 'VARCHAR(20)', note: 'pending | sent | delivered | failed' },
      { name: 'delivery_id', type: 'VARCHAR(100)' },
      { name: 'sent_at', type: 'TIMESTAMPTZ', key: 'IDX' },
      { name: 'deduplication_key', type: 'VARCHAR(120)', key: 'UQ', note: 'YYYY-MM-DD:type:farmer_id' },
    ],
  },
  {
    name: 'crops',
    category: 'Advisory & Crops',
    description: 'Crop catalog with FAO-56 crop coefficients (Kc) and rooting depths.',
    columns: [
      { name: 'id', type: 'UUID', key: 'PK' },
      { name: 'name', type: 'VARCHAR(80)', key: 'UQ', note: 'Wheat, Rice, Cotton, etc.' },
      { name: 'local_name', type: 'VARCHAR(100)', note: 'गेहूं (Gehun), धान (Dhan)' },
      { name: 'crop_type', type: 'VARCHAR(50)', note: 'Kharif, Rabi, Zaid' },
      { name: 'kc_initial', type: 'FLOAT', note: 'Initial stage factor (~0.40)' },
      { name: 'kc_crop_dev', type: 'FLOAT', note: 'Development stage factor (~0.75)' },
      { name: 'kc_mid_season', type: 'FLOAT', note: 'Mid-season peak (~1.15)' },
      { name: 'kc_late_season', type: 'FLOAT', note: 'Ripening stage factor (~0.65)' },
      { name: 'root_depth_m', type: 'FLOAT', note: 'Root depth in meters' },
    ],
  },
  {
    name: 'irrigation_history',
    category: 'Advisory & Crops',
    description: 'Farmer water application logs in mm and m³/ha (1 mm = 10 m³/ha).',
    columns: [
      { name: 'id', type: 'UUID', key: 'PK' },
      { name: 'farmer_id', type: 'UUID', key: 'FK', note: 'FK -> farmers.id, ON DELETE CASCADE' },
      { name: 'crop_id', type: 'UUID', key: 'FK', note: 'FK -> crops.id' },
      { name: 'date', type: 'DATE', key: 'IDX' },
      { name: 'water_applied_mm', type: 'FLOAT' },
      { name: 'method', type: 'VARCHAR(50)', note: 'drip | sprinkler | flood' },
      { name: 'notes', type: 'TEXT' },
    ],
  },
  {
    name: 'admin_users',
    category: 'Admin & Audit',
    description: 'Administrative portal accounts with PBKDF2-HMAC-SHA256 password hashing.',
    columns: [
      { name: 'id', type: 'UUID', key: 'PK' },
      { name: 'username', type: 'VARCHAR(50)', key: 'UQ' },
      { name: 'password_hash', type: 'VARCHAR(255)', note: 'PBKDF2-HMAC-SHA256 with salt' },
      { name: 'failed_attempts', type: 'INTEGER', note: 'Lockout after 5 failures' },
      { name: 'locked_until', type: 'TIMESTAMPTZ', note: '30 min lockout duration' },
      { name: 'created_at', type: 'TIMESTAMPTZ' },
    ],
  },
  {
    name: 'admin_sessions',
    category: 'Admin & Audit',
    description: 'Separate admin session cookie with 8-hour max duration.',
    columns: [
      { name: 'id', type: 'UUID', key: 'PK' },
      { name: 'admin_id', type: 'UUID', key: 'FK', note: 'FK -> admin_users.id, ON DELETE CASCADE' },
      { name: 'token_hash', type: 'VARCHAR(64)', key: 'UQ' },
      { name: 'expires_at', type: 'TIMESTAMPTZ', key: 'IDX', note: '8 hours from issue' },
      { name: 'created_at', type: 'TIMESTAMPTZ' },
      { name: 'revoked_at', type: 'TIMESTAMPTZ' },
      { name: 'ip_address', type: 'VARCHAR(45)' },
    ],
  },
  {
    name: 'admin_audit_logs',
    category: 'Admin & Audit',
    description: 'Immutable ledger of all admin read/write actions on farmer records.',
    columns: [
      { name: 'id', type: 'UUID', key: 'PK' },
      { name: 'admin_id', type: 'UUID', key: 'FK', note: 'FK -> admin_users.id, ON DELETE SET NULL' },
      { name: 'action', type: 'VARCHAR(50)', key: 'IDX', note: 'e.g. view_farmers, change_config' },
      { name: 'target_type', type: 'VARCHAR(50)' },
      { name: 'target_id', type: 'VARCHAR(100)' },
      { name: 'details', type: 'TEXT' },
      { name: 'ip_address', type: 'VARCHAR(45)' },
      { name: 'created_at', type: 'TIMESTAMPTZ', key: 'IDX' },
    ],
  },
  {
    name: 'farmer_feedback',
    category: 'Farmers & Identity',
    description: 'Farmer feedback on weather, heat, and irrigation recommendations.',
    columns: [
      { name: 'id', type: 'UUID', key: 'PK' },
      { name: 'farmer_id', type: 'UUID', key: 'FK', note: 'FK -> farmers.id, ON DELETE CASCADE' },
      { name: 'advisory_type', type: 'VARCHAR(30)', key: 'IDX' },
      { name: 'rating', type: 'INTEGER', note: '1 to 5 stars' },
      { name: 'comment', type: 'TEXT' },
      { name: 'created_at', type: 'TIMESTAMPTZ' },
    ],
  },
];

const MILESTONES = [
  {
    id: 'M1',
    title: 'Scaffold, Models, Migrations & Docker',
    status: 'completed',
    badge: 'DELIVERED',
    desc: 'Project directory structure, SQLAlchemy models, Alembic initial migration, Pydantic settings, Docker Compose, .env.example, FastAPI entry point, and security middleware.',
  },
  {
    id: 'M2',
    title: 'OTP, Signup, Sessions & Recovery',
    status: 'completed',
    badge: 'DELIVERED',
    desc: 'CSPRNG OTP with HMAC pepper, phone validation (+91), 256-bit hashed sessions, HttpOnly cookies, 5-attempt lockout, recovery flow, and sign-out.',
  },
  {
    id: 'M3',
    title: 'Address Upsert, CSRF & Security Headers',
    status: 'completed',
    badge: 'DELIVERED',
    desc: 'PIN code district/state lookup, village suggestions, India geocoding validation, atomic address upsert with confirmation, CSRF token, and rate limiting.',
  },
  {
    id: 'M4',
    title: 'Weather, Heat, Flood & Irrigation Advisories',
    status: 'completed',
    badge: 'DELIVERED',
    desc: 'Open-Meteo & NASA POWER data integration, heat risk (Normal/Hot/Alert/Severe), indicative flood risk, FAO-56 Penman-Monteith ET0 × Kc irrigation water balance.',
  },
  {
    id: 'M5',
    title: 'Admin Portal & Audit Trail',
    status: 'completed',
    badge: 'DELIVERED',
    desc: 'Separate /admin auth, PBKDF2-HMAC-SHA256, 8-hour sessions, 5-failure lockout, farmer listing with audit logs, and synthetic seed data.',
  },
  {
    id: 'M6',
    title: 'Alert Preferences & SMS Scheduler',
    status: 'completed',
    badge: 'DELIVERED',
    desc: 'SMS adapter interface (MSG91/Twilio, disabled until configured), daily alert cron job with 24h deduplication, and consent/opt-out compliance.',
  },
  {
    id: 'M7',
    title: 'Testing Suite & Security Checklist',
    status: 'completed',
    badge: 'DELIVERED',
    desc: 'Automated tests for OTP limits, session lifecycle, address uniqueness, rate limiting, and production security readiness checklist.',
  },
];

import AuthTestingPortal from './components/AuthTestingPortal';
import AddressAndProfileManager from './components/AddressAndProfileManager';
import FarmerDashboard from './components/FarmerDashboard';
import AdminPortal from './components/AdminPortal';
import { AlertPreferencesManager } from './components/AlertPreferencesManager';
import AutomatedTestSuite from './components/AutomatedTestSuite';

export default function App() {
  const [activeTab, setActiveTab] = useState<'tests' | 'alerts' | 'admin' | 'dashboard' | 'address_profile' | 'auth_lab' | 'overview' | 'schema' | 'docker' | 'config' | 'mobile_preview'>('tests');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const [currentFarmer, setCurrentFarmer] = useState({
    id: 'f83a1b09-72de-421c-99c5-7f9cb814032a',
    name: 'Ramesh Chandra Pradhan',
    phone: '9861012345',
    is_active: true,
    address: {
      id: 'ad92e310-8b44-42f1-9311-3d02bb148011',
      pin_code: '768028',
      village: 'Barpali',
      district: 'Bargarh',
      state: 'Odisha',
      latitude: 21.1983,
      longitude: 83.5852,
      confirmed: true,
    },
    alert_preferences: {
      heat_alerts: true,
      heavy_rain_alerts: true,
      irrigation_advisories: true,
      sms_enabled: false,
      preferred_language: 'en',
    },
  });

  const filteredTables = selectedCategory === 'All'
    ? SCHEMA_TABLES
    : SCHEMA_TABLES.filter((t) => t.category === selectedCategory);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-900">
      {/* Top Banner / Header */}
      <header className="border-b border-emerald-900/40 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/20">
              <Sprout className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-emerald-400 tracking-tight">HarvestEngine</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-semibold">
                  M7 ALL DELIVERED
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Smart Decisions for Sustainable Farming</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>OWASP Ready • Zero Farm Passwords</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        
        {/* Milestone Status Notification */}
        <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 border border-emerald-500/40 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute -right-12 -top-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Full Project Delivery
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-100">
                All Milestones Completed (M1–M7): Production-Ready HarvestEngine
              </h1>
              <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
                The entire agricultural platform is delivered: M1 (Scaffold, ORM &amp; Docker), M2 (Zero-Password OTP Auth &amp; Sessions), M3 (Single Address Upsert &amp; CSRF), M4 (Scientific Advisories &amp; Dashboard UI), M5 (Admin Portal &amp; 5-Attempt Lockout), M6 (SMS Adapters, Multi-lingual Dispatch &amp; 24h Deduplication), and M7 (Automated Pytest Suite, Interactive Browser Test Runner &amp; Production Checklist).
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right hidden sm:block">
                <div className="text-xs text-slate-400">Execution State</div>
                <div className="text-sm font-semibold text-emerald-400">All 7 Milestones Complete</div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto" aria-label="Sections">
          {[
            { id: 'tests', label: 'Automated Tests (M7)', icon: CheckCircle2 },
            { id: 'alerts', label: 'Alerts & SMS (M6)', icon: Bell },
            { id: 'admin', label: 'Admin Portal (M5)', icon: ShieldAlert },
            { id: 'dashboard', label: 'Farmer Dashboard (M4)', icon: Sprout },
            { id: 'address_profile', label: 'Address & Profile (M3)', icon: MapPin },
            { id: 'auth_lab', label: 'Farmer Auth & OTP Lab (M2)', icon: KeyRound },
            { id: 'overview', label: 'Milestones & Architecture', icon: Layers },
            { id: 'schema', label: 'Database Schema (12 Tables)', icon: Database },
            { id: 'docker', label: 'Docker & API Commands', icon: Terminal },
            { id: 'config', label: 'Security & Config (.env)', icon: Lock },
            { id: 'mobile_preview', label: 'Mobile Advisory UX Preview', icon: Smartphone },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* TAB: M7 AUTOMATED TEST SUITE */}
        {activeTab === 'tests' && <AutomatedTestSuite />}

        {/* TAB: M6 ALERT PREFERENCES & SMS */}
        {activeTab === 'alerts' && (
          <AlertPreferencesManager
            farmerPhone={currentFarmer.phone}
            farmerVillage={currentFarmer.address.village}
            farmerDistrict={currentFarmer.address.district}
          />
        )}

        {/* TAB: M5 ADMIN PORTAL */}
        {activeTab === 'admin' && <AdminPortal />}

        {/* TAB: M4 FARMER DASHBOARD */}
        {activeTab === 'dashboard' && (
          <FarmerDashboard
            farmer={currentFarmer}
            onChangeAddressClick={() => setActiveTab('address_profile')}
          />
        )}

        {/* TAB: M3 ADDRESS & PROFILE MANAGER */}
        {activeTab === 'address_profile' && <AddressAndProfileManager />}

        {/* TAB: M2 AUTH LAB */}
        {activeTab === 'auth_lab' && <AuthTestingPortal />}

        {/* TAB 1: OVERVIEW & MILESTONES */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Core Architectural Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-slate-100">Zero Farm Passwords</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Indian farmers authenticate entirely via 10-digit mobile verification with HMAC-SHA256 peppered OTPs and 256-bit cryptographically random tokens stored as SHA256 hashes in HttpOnly, SameSite=Lax cookies.
                </p>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Droplets className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-slate-100">Scientific Advisories</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Penman-Monteith ET₀ &times; FAO-56 Kc crop coefficients &minus; effective rainfall. Heat risk categories (Normal/Hot/Alert/Severe) &amp; indicative flood indices backed by Open-Meteo &amp; NASA POWER.
                </p>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-slate-100">Strict Data Isolation</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Every farmer has exactly one address (UNIQUE farmer_id) bounded strictly within India coordinates (6°&ndash;38°N, 68°&ndash;98°E). Admin portal has distinct credentials, sessions, rate limits, and audit logs.
                </p>
              </div>
            </div>

            {/* Roadmap Execution Timeline */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-base font-bold text-slate-100 mb-4 flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-400" />
                <span>Milestone Execution Plan</span>
              </h2>

              <div className="space-y-3">
                {MILESTONES.map((m) => {
                  const isDone = m.status === 'completed';
                  const isReady = m.status === 'ready';
                  return (
                    <div
                      key={m.id}
                      className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors ${
                        isDone
                          ? 'bg-emerald-950/30 border-emerald-600/40'
                          : isReady
                          ? 'bg-slate-800/70 border-emerald-500/50 shadow-md'
                          : 'bg-slate-900/40 border-slate-800/80 opacity-75'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold text-xs mt-0.5 ${
                            isDone
                              ? 'bg-emerald-500 text-slate-950'
                              : isReady
                              ? 'bg-emerald-900 text-emerald-300 border border-emerald-500'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {isDone ? <Check className="w-4 h-4 stroke-[3]" /> : m.id}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-100 text-sm">{m.id}: {m.title}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1 max-w-2xl">{m.desc}</p>
                        </div>
                      </div>

                      <div className="shrink-0 self-end sm:self-center">
                        <span
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                            isDone
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : isReady
                              ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                              : 'bg-slate-800 text-slate-500'
                          }`}
                        >
                          {m.badge}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: SCHEMA EXPLORER */}
        {activeTab === 'schema' && (
          <div className="space-y-6">
            {/* Filter buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center gap-1.5 flex-wrap">
                {['All', 'Farmers & Identity', 'Security & Sessions', 'Advisory & Crops', 'Admin & Audit'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                      selectedCategory === cat
                        ? 'bg-emerald-500 text-slate-950 font-semibold'
                        : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Showing {filteredTables.length} of 12 tables
              </span>
            </div>

            {/* Tables Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTables.map((table) => (
                <div
                  key={table.name}
                  className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden shadow-lg transition-all"
                >
                  <div className="bg-slate-850 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-400" />
                      <span className="font-mono font-bold text-sm text-slate-100">{table.name}</span>
                    </div>
                    <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                      {table.category}
                    </span>
                  </div>

                  <div className="p-4 space-y-3">
                    <p className="text-xs text-slate-300">{table.description}</p>

                    <div className="border border-slate-800/80 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px]">
                          <tr>
                            <th className="px-3 py-1.5">Column</th>
                            <th className="px-3 py-1.5">Type</th>
                            <th className="px-3 py-1.5">Constraint / Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-300">
                          {table.columns.map((col) => (
                            <tr key={col.name} className="hover:bg-slate-800/40">
                              <td className="px-3 py-1.5 font-semibold text-slate-200">
                                {col.name}
                              </td>
                              <td className="px-3 py-1.5 text-slate-400">
                                {col.type}
                              </td>
                              <td className="px-3 py-1.5 text-[11px] text-slate-300 font-sans">
                                {col.key && (
                                  <span
                                    className={`inline-block mr-1.5 px-1.5 py-0.2 rounded text-[9px] font-bold font-mono ${
                                      col.key === 'PK'
                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                        : col.key === 'FK'
                                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                        : col.key === 'UQ'
                                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    }`}
                                  >
                                    {col.key}
                                  </span>
                                )}
                                {col.note || ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: DOCKER & RUN COMMANDS */}
        {activeTab === 'docker' && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-emerald-400" />
                  <span>Execution & Testing Commands for Milestone 1</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  You can spin up the full containerized environment with Docker Compose or run the FastAPI backend &amp; migrations directly.
                </p>
              </div>

              {/* Commands list */}
              <div className="space-y-4">
                {[
                  {
                    id: 'cmd-otp-req',
                    title: '1. Request CSPRNG OTP (Signup Purpose)',
                    cmd: `curl -i -X POST http://localhost:8000/api/otp/request \\\n  -H "Content-Type: application/json" \\\n  -d '{"phone": "9861012345", "purpose": "signup"}'`,
                    desc: 'Requests 6-digit OTP. Enforces 30s resend cooldown, 3/15min, 5/24h rate limits, and returns generic anti-enumeration response.',
                  },
                  {
                    id: 'cmd-signup',
                    title: '2. Register Farmer & Create Session (HttpOnly Cookie)',
                    cmd: `curl -i -X POST http://localhost:8000/api/farmers \\\n  -H "Content-Type: application/json" \\\n  -c cookies.txt \\\n  -d '{\n    "name": "Ramesh Chandra Pradhan",\n    "phone": "9861012345",\n    "otp": "123456",\n    "pin_code": "768028",\n    "village": "Barpali",\n    "district": "Bargarh",\n    "state": "Odisha",\n    "latitude": 21.1983,\n    "longitude": 83.5852,\n    "confirmed": true\n  }'`,
                    desc: 'Validates Indian mobile (+91), geofenced coordinates (6-38°N, 68-98°E), verifies OTP, creates farmer profile and sets HttpOnly session cookie.',
                  },
                  {
                    id: 'cmd-get-me',
                    title: '3. Authenticated Profile Lookup (Session Cookie)',
                    cmd: `curl -i -X GET http://localhost:8000/api/me -b cookies.txt`,
                    desc: 'Validates 256-bit hashed session token from HttpOnly cookie, updates last_active_at, and handles automatic session rotation.',
                  },
                  {
                    id: 'cmd-recover',
                    title: '4. Sign-in / Account Recovery via OTP (Zero Passwords)',
                    cmd: `curl -i -X POST http://localhost:8000/api/recover \\\n  -H "Content-Type: application/json" \\\n  -c cookies.txt \\\n  -d '{"phone": "9861012345", "otp": "123456"}'`,
                    desc: 'Verifies recovery OTP, provisions a fresh 256-bit hashed session, and attaches the session cookie.',
                  },
                  {
                    id: 'cmd-address-upsert',
                    title: '5. Upsert Farm Address (Single Address: UNIQUE farmer_id, confirmed=true)',
                    cmd: `curl -i -X PUT http://localhost:8000/api/address \\\n  -H "Content-Type: application/json" \\\n  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \\\n  -b cookies.txt \\\n  -d '{\n    "pin_code": "141001",\n    "village": "Ludhiana Central",\n    "district": "Ludhiana",\n    "state": "Punjab",\n    "latitude": 30.9010,\n    "longitude": 75.8573,\n    "confirmed": true\n  }'`,
                    desc: 'Replaces previous farm address atomically. Backend rejects changes without confirmed=true. Revalidates India geofence (6-38°N, 68-98°E).',
                  },
                  {
                    id: 'cmd-update-name',
                    title: '6. Update Farmer Name (Zero OTP required)',
                    cmd: `curl -i -X PATCH http://localhost:8000/api/me \\\n  -H "Content-Type: application/json" \\\n  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \\\n  -b cookies.txt \\\n  -d '{"name": "Sardar Baldev Singh"}'`,
                    desc: 'Updates farmer profile name directly without OTP overhead.',
                  },
                  {
                    id: 'cmd-phone-change-req',
                    title: '7. Phone Change Step 1: Request OTP to NEW Number',
                    cmd: `curl -i -X POST http://localhost:8000/api/me/phone/request-otp \\\n  -H "Content-Type: application/json" \\\n  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \\\n  -b cookies.txt \\\n  -d '{"new_phone": "9814012345"}'`,
                    desc: 'Verifies uniqueness, checks different from current phone, and dispatches verification OTP to the new number.',
                  },
                  {
                    id: 'cmd-phone-change-confirm',
                    title: '8. Phone Change Step 2: Confirm OTP & Update Number',
                    cmd: `curl -i -X PATCH http://localhost:8000/api/me/phone \\\n  -H "Content-Type: application/json" \\\n  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \\\n  -b cookies.txt \\\n  -d '{"new_phone": "9814012345", "otp": "123456", "confirmed": true}'`,
                    desc: 'Verifies OTP against the new phone, enforces explicit confirmation checkbox, and updates registered mobile.',
                  },
                  {
                    id: 'cmd-pincode',
                    title: '9. Resolve Indian Postal PIN Code',
                    cmd: `curl -i -X GET http://localhost:8000/api/pincode/768028`,
                    desc: 'Queries India Postal directory and resolves District, State, and village suggestions.',
                  },
                  {
                    id: 'cmd-weather-forecast',
                    title: '10. Fetch 7-Day Field Forecast & Reference ET₀',
                    cmd: `curl -i -X GET "http://localhost:8000/api/weather/forecast?lat=21.1983&lon=83.5852" -b cookies.txt`,
                    desc: 'Fetches live Open-Meteo weather parameters, temperature, humidity, rainfall, and FAO-56 reference evapotranspiration.',
                  },
                  {
                    id: 'cmd-heat-advisory',
                    title: '11. Evaluate IMD Heat Stress Advisory',
                    cmd: `curl -i -X GET "http://localhost:8000/api/advisory/heat?lat=21.1983&lon=83.5852" -b cookies.txt`,
                    desc: 'Evaluates heat index, peak temperature against Normal/Hot/Alert/Severe thresholds with crop & labor safety guidelines.',
                  },
                  {
                    id: 'cmd-flood-advisory',
                    title: '12. Evaluate Indicative Flood Risk Advisory',
                    cmd: `curl -i -X GET "http://localhost:8000/api/advisory/flood?lat=21.1983&lon=83.5852" -b cookies.txt`,
                    desc: 'Estimates 3-day rainfall totals and inundation risk with direct link to official IMD warnings.',
                  },
                  {
                    id: 'cmd-irrigation-advisory',
                    title: '13. Calculate FAO-56 Crop Water Need (ETc - Peff)',
                    cmd: `curl -i -X GET "http://localhost:8000/api/advisory/irrigation?crop_id=paddy&stage_id=mid&lat=21.1983&lon=83.5852" -b cookies.txt`,
                    desc: 'Computes crop water demand in mm depth and m³/ha volume (1 mm = 10 m³/ha) with a plain-language reason to irrigate or skip.',
                  },
                  {
                    id: 'cmd-crops',
                    title: '14. List Crops and FAO-56 Growth Stages',
                    cmd: `curl -i -X GET http://localhost:8000/api/crops`,
                    desc: 'Retrieves crop catalog with Kc coefficients across Initial, Vegetative, Flowering, and Maturity stages.',
                  },
                  {
                    id: 'cmd-feedback',
                    title: '15. Submit Farmer Advisory Feedback',
                    cmd: `curl -i -X POST http://localhost:8000/api/feedback \\\n  -H "Content-Type: application/json" \\\n  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \\\n  -b cookies.txt \\\n  -d '{"advisory_type": "irrigation", "rating": 5, "comment": "Water savings matched soil moisture perfectly."}'`,
                    desc: 'Submits field feedback to calibrate local agricultural recommendations.',
                  },
                  {
                    id: 'cmd-admin-login',
                    title: '16. Administrator Login (PBKDF2-HMAC-SHA256 & 8h Session)',
                    cmd: `curl -i -X POST http://localhost:8000/api/admin/login \\\n  -H "Content-Type: application/json" \\\n  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \\\n  -c admin_cookies.txt \\\n  -d '{"username": "admin", "password": "AdminMasterKey123!"}'`,
                    desc: 'Authenticates admin, verifies PBKDF2 hash, creates 8-hour session, and sets harvest_admin_session HttpOnly cookie. 5 failures trigger a 30m lockout.',
                  },
                  {
                    id: 'cmd-admin-farmers',
                    title: '17. List Farmers (Admin-only: GET /api/admin/farmers)',
                    cmd: `curl -i -X GET "http://localhost:8000/api/admin/farmers?page=1&page_size=20" -b admin_cookies.txt`,
                    desc: 'Rule 9: Exclusively accessible to admins. Non-admin calls are rejected. Logs immutable audit event.',
                  },
                  {
                    id: 'cmd-admin-audit',
                    title: '18. Inspect Administrative Audit Log Ledger',
                    cmd: `curl -i -X GET http://localhost:8000/api/admin/audit-logs -b admin_cookies.txt`,
                    desc: 'Returns immutable ledger of admin actions, targets, IPs, and timestamps.',
                  },
                  {
                    id: 'cmd-admin-seed',
                    title: '19. Seed Synthetic Farmer Profiles (Rule 9: Synthetic Only)',
                    cmd: `curl -i -X POST http://localhost:8000/api/admin/seed \\\n  -H "Content-Type: application/json" \\\n  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \\\n  -b admin_cookies.txt`,
                    desc: 'Populates realistic synthetic-only farmers with valid Indian coordinates across major states.',
                  },
                  {
                    id: 'cmd-admin-logout',
                    title: '20. Admin Sign-out (Revoke 8h Session)',
                    cmd: `curl -i -X POST http://localhost:8000/api/admin/logout -b admin_cookies.txt -c admin_cookies.txt`,
                    desc: 'Revokes administrator session in DB and deletes admin cookie.',
                  },
                  {
                    id: 'cmd-alert-pref-get',
                    title: '21. Get Farmer Alert Preferences & Channels',
                    cmd: `curl -i -X GET http://localhost:8000/api/alerts/preferences -b cookies.txt`,
                    desc: 'Fetches notification toggles (heat, rain, irrigation), SMS opt-in consent, and preferred language (en, hi, or).',
                  },
                  {
                    id: 'cmd-alert-pref-update',
                    title: '22. Update Alert Preferences & Language (TRAI Consent)',
                    cmd: `curl -i -X PATCH http://localhost:8000/api/alerts/preferences \\\n  -H "Content-Type: application/json" \\\n  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \\\n  -b cookies.txt \\\n  -d '{\n    "heat_alerts": true,\n    "heavy_rain_alerts": true,\n    "irrigation_advisories": true,\n    "sms_enabled": true,\n    "preferred_language": "hi"\n  }'`,
                    desc: 'Updates notification channels with regulatory opt-in consent and switches language to Hindi/Odia/English.',
                  },
                  {
                    id: 'cmd-alert-logs',
                    title: '23. Inspect Alert Audit Ledger (24h Deduplication)',
                    cmd: `curl -i -X GET http://localhost:8000/api/alerts/logs -b cookies.txt`,
                    desc: 'Inspects delivery status, delivery_id, and 24-hour deduplication keys (YYYY-MM-DD:type:farmer_id). Never falsifies status.',
                  },
                  {
                    id: 'cmd-alert-dispatch',
                    title: '24. Trigger Daily Advisory Evaluation & Broadcast',
                    cmd: `curl -i -X POST http://localhost:8000/api/alerts/dispatch-daily \\\n  -H "Content-Type: application/json" \\\n  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \\\n  -b cookies.txt`,
                    desc: 'Evaluates coordinates against >=40°C heat, >=50mm rain, and FAO-56 irrigation need. Dispatches SMS if enabled and un-duplicated in 24h.',
                  },
                  {
                    id: 'cmd-csrf',
                    title: '10. Fetch Signed CSRF Token',
                    cmd: `curl -i -X GET http://localhost:8000/api/csrf-token`,
                    desc: 'Generates a signed HMAC-SHA256 CSRF token for the X-CSRF-Token request header.',
                  },
                  {
                    id: 'cmd-logout',
                    title: '11. Sign out of this device (Revoke Session)',
                    cmd: `curl -i -X POST http://localhost:8000/api/logout -b cookies.txt -c cookies.txt`,
                    desc: 'Revokes the session token in PostgreSQL and deletes the HttpOnly cookie.',
                  },
                  {
                    id: 'cmd-docker',
                    title: '6. Start full Docker Compose cluster',
                    cmd: 'docker compose up -d --build',
                    desc: 'Runs Postgres 16, Redis 7, FastAPI backend, and React frontend with health checks.',
                  },
                  {
                    id: 'cmd-migrate',
                    title: '7. Run Alembic Migrations',
                    cmd: 'docker compose exec backend alembic upgrade head',
                    desc: 'Applies initial schema migrations to PostgreSQL.',
                  },
                ].map((item) => (
                  <div key={item.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200">{item.title}</span>
                      <button
                        onClick={() => handleCopy(item.cmd, item.id)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-mono transition-colors cursor-pointer"
                      >
                        {copiedCmd === item.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400 font-sans">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span className="font-sans">Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="bg-slate-900 text-emerald-400 font-mono text-xs p-3 rounded-lg overflow-x-auto border border-slate-800">
                      <code>{item.cmd}</code>
                    </pre>
                    <p className="text-[11px] text-slate-400">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CONFIG & SECURITY */}
        {activeTab === 'config' && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <Lock className="w-5 h-5 text-emerald-400" />
                    <span>Configuration &amp; Cryptographic Secrets (.env.example)</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Environment variables segregated into strict Pydantic Settings with automatic fail-safes.
                  </p>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  Zero hardcoded secrets
                </span>
              </div>

              {/* Security Safeguards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Dev OTP Logging Lockdown</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    If <code className="text-emerald-300 font-mono">SECURE=true</code> or <code className="text-emerald-300 font-mono">ENVIRONMENT=production</code>, Pydantic field validator forcibly turns <code className="text-amber-300 font-mono">DEV_OTP_LOGGING</code> off to guarantee zero OTP leaks in logs.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Cryptographic Server Pepper</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    OTPs are never stored plain-text. They are hashed using HMAC-SHA256 with the secret 256-bit server-side <code className="text-emerald-300 font-mono">OTP_PEPPER</code>.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Admin Brute-Force Lockout</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Admin passwords hashed with PBKDF2-HMAC-SHA256 and unique random salt. 5 consecutive incorrect password attempts lock the administrative account for 30 minutes.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Cookie Exclusivity</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Session identity never enters <code className="text-rose-300 font-mono">localStorage</code> or <code className="text-rose-300 font-mono">sessionStorage</code>. Always transmitted via HttpOnly, SameSite=Lax (or Strict) Secure cookies.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: MOBILE UX PREVIEW */}
        {activeTab === 'mobile_preview' && (
          <div className="flex flex-col items-center justify-center py-4">
            <div className="text-center mb-6 space-y-1">
              <h2 className="text-lg font-bold text-slate-100">HarvestEngine Mobile-First Architecture</h2>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Designed specifically for Indian farmers using smartphones in field conditions with high contrast, large touch targets, and clear status cards.
              </p>
            </div>

            {/* Phone Mockup Frame */}
            <div className="w-full max-w-[380px] bg-slate-900 border-4 border-slate-700 rounded-[36px] p-3 shadow-2xl relative overflow-hidden">
              {/* Speaker notch */}
              <div className="w-28 h-4 bg-slate-800 rounded-full mx-auto mb-3" />

              <div className="bg-slate-950 rounded-[24px] p-4 text-slate-100 space-y-4 border border-slate-800">
                {/* Mobile Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 font-bold text-sm">
                      HE
                    </div>
                    <div>
                      <div className="text-xs font-bold text-emerald-400 leading-tight">HarvestEngine</div>
                      <div className="text-[10px] text-slate-400">Barpali, Bargarh, Odisha</div>
                    </div>
                  </div>
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                    768028
                  </span>
                </div>

                {/* Weather card */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-850 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Live Field Weather</span>
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Open-Meteo
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold text-slate-100">33.4&deg;C</div>
                      <div className="text-xs text-slate-400">Partly Cloudy &bull; Humidity 64%</div>
                    </div>
                    <CloudSun className="w-10 h-10 text-amber-400" />
                  </div>
                </div>

                {/* 3 Color-Coded Advisories with Text Labels */}
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-slate-300">Today&apos;s Field Advisories</div>

                  {/* Heat Alert Card */}
                  <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-600/40 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                        <Flame className="w-4 h-4 text-amber-400" />
                        <span>Heat Advisory: Hot (33.4&deg;C)</span>
                      </div>
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                        Caution
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Moderate heat index. Irrigate sensitive vegetable nurseries during early morning or late evening.
                    </p>
                  </div>

                  {/* Flood Risk Card */}
                  <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-600/40 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-blue-300">
                        <Droplets className="w-4 h-4 text-blue-400" />
                        <span>Flood Risk: Low (4.2 mm / 3d)</span>
                      </div>
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                        Indicative
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Rainfall within normal limits. Soil drainage adequate. Always check official IMD alerts.
                    </p>
                  </div>

                  {/* Irrigation Card */}
                  <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-600/40 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                        <Sprout className="w-4 h-4 text-emerald-400" />
                        <span>Irrigation: Apply 18 mm (180 m&sup3;/ha)</span>
                      </div>
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                        Advised
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Paddy (Grain Development): ET₀ (5.2 mm) &times; Kc (1.15) &minus; Rain (0.0 mm) = 6 mm deficit over 3 days.
                    </p>
                  </div>
                </div>

                {/* Action button */}
                <button
                  type="button"
                  className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <FileCheck className="w-4 h-4" />
                  <span>Log Irrigation &amp; Calculate Savings</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div>HarvestEngine &copy; 2026 &bull; Smart Decisions for Sustainable Farming</div>
          <div className="flex items-center gap-4">
            <span>FastAPI + PostgreSQL + React + Vite</span>
            <span>Milestone 1 Completed</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
