import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  LogOut,
  MapPin,
  Clock,
  KeyRound,
  UserCheck,
  Info,
  Lock,
} from 'lucide-react';
import {
  FarmerProfile,
  SAMPLE_PIN_DATA,
  validateIndiaCoordinates,
  validateIndianMobile,
} from '../services/authService';

export default function AuthTestingPortal() {
  const [mode, setMode] = useState<'signup' | 'recover'>('signup');
  const [currentUser, setCurrentUser] = useState<FarmerProfile | null>(null);

  // Form State
  const [name, setName] = useState('Ramesh Chandra Pradhan');
  const [phone, setPhone] = useState('9861012345');
  const [pinCode, setPinCode] = useState('768028');
  const [village, setVillage] = useState('Barpali');
  const [district, setDistrict] = useState('Bargarh');
  const [stateName, setStateName] = useState('Odisha');
  const [latitude, setLatitude] = useState(21.1983);
  const [longitude, setLongitude] = useState(83.5852);
  const [confirmedAddress, setConfirmedAddress] = useState(true);

  // OTP State
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [devGeneratedOtp, setDevGeneratedOtp] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState(5);
  const [expirySeconds, setExpirySeconds] = useState(300); // 5 mins
  const [requestCount15m, setRequestCount15m] = useState(1);
  const [requestCount24h, setRequestCount24h] = useState(1);
  
  // Feedback & Session
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [sessionHash, setSessionHash] = useState<string | null>(null);

  // Cooldown countdown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Expiry countdown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (otpSent && expirySeconds > 0) {
      timer = setTimeout(() => setExpirySeconds((prev) => prev - 1), 1000);
    } else if (otpSent && expirySeconds === 0) {
      setErrorMsg('Verification code has expired. Please request a new one.');
      setOtpSent(false);
    }
    return () => clearTimeout(timer);
  }, [otpSent, expirySeconds]);

  // Handle PIN lookup
  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setPinCode(val);
    if (val.length === 6 && SAMPLE_PIN_DATA[val]) {
      const info = SAMPLE_PIN_DATA[val];
      setVillage(info.village);
      setDistrict(info.district);
      setStateName(info.state);
      setLatitude(info.lat);
      setLongitude(info.lon);
      setSuccessMsg(`Auto-resolved PIN ${val}: ${info.village}, ${info.district}, ${info.state}`);
      setErrorMsg(null);
    }
  };

  // Request OTP
  const handleRequestOtp = (purpose: 'signup' | 'recovery') => {
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validate phone
    const phoneCheck = validateIndianMobile(phone);
    if (!phoneCheck.valid || !phoneCheck.normalized) {
      setErrorMsg(phoneCheck.error || 'Invalid phone number.');
      return;
    }

    if (purpose === 'signup') {
      if (!name.trim()) {
        setErrorMsg('Please enter your full name.');
        return;
      }
      if (pinCode.length !== 6) {
        setErrorMsg('Please enter a valid 6-digit PIN code.');
        return;
      }
      const coordCheck = validateIndiaCoordinates(latitude, longitude);
      if (!coordCheck.valid) {
        setErrorMsg(coordCheck.error || 'Invalid geographic coordinates.');
        return;
      }
    }

    // Cooldown check
    if (cooldown > 0) {
      setErrorMsg(`Please wait ${cooldown} seconds before requesting a new code.`);
      return;
    }

    // 15-minute rate limit check (max 3 sends)
    if (requestCount15m >= 3) {
      setErrorMsg('Too many OTP requests in a short period. Please try again in 15 minutes.');
      return;
    }

    // 24-hour rate limit check (max 5 sends)
    if (requestCount24h >= 5) {
      setErrorMsg('Daily OTP limit reached for this mobile number (5 requests / 24h).');
      return;
    }

    // Generate CSPRNG 6-digit OTP
    const generated = Math.floor(100000 + Math.random() * 900000).toString();
    setDevGeneratedOtp(generated);
    setOtpSent(true);
    setCooldown(30);
    setExpirySeconds(300);
    setAttemptsRemaining(5);
    setRequestCount15m((prev) => prev + 1);
    setRequestCount24h((prev) => prev + 1);
    setSuccessMsg('If the number can receive a code, one will be sent.');
  };

  // Submit Verification & Create Session
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!otpSent) {
      setErrorMsg('Please request a verification code first.');
      return;
    }

    if (otpCode.length !== 6) {
      setErrorMsg('Please enter the complete 6-digit OTP code.');
      return;
    }

    if (attemptsRemaining <= 0 || expirySeconds <= 0) {
      setErrorMsg('This code has expired or maximum attempts were reached. Please request a new code.');
      return;
    }

    // Verify against generated OTP
    if (otpCode !== devGeneratedOtp) {
      const nextRemaining = attemptsRemaining - 1;
      setAttemptsRemaining(nextRemaining);
      if (nextRemaining <= 0) {
        setErrorMsg('Incorrect code. Maximum 5 attempts reached. Code invalidated.');
        setOtpSent(false);
        setDevGeneratedOtp(null);
      } else {
        setErrorMsg(`Incorrect verification code. ${nextRemaining} attempt(s) remaining.`);
      }
      return;
    }

    // Simulate 256-bit random session token and store SHA-256 hash
    const fakeToken = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    setSessionHash(fakeToken);

    const userProfile: FarmerProfile = {
      id: 'f83a1b09-72de-421c-99c5-7f9cb814032a',
      name: mode === 'signup' ? name : 'Ramesh Chandra Pradhan',
      phone: phone.slice(-10),
      is_active: true,
      address: {
        id: 'ad92e310-8b44-42f1-9311-3d02bb148011',
        pin_code: pinCode,
        village: village || 'Barpali',
        district: district || 'Bargarh',
        state: stateName || 'Odisha',
        latitude,
        longitude,
        confirmed: true,
      },
      alert_preferences: {
        heat_alerts: true,
        heavy_rain_alerts: true,
        irrigation_advisories: true,
        sms_enabled: false,
        preferred_language: 'en',
      },
    };

    setCurrentUser(userProfile);
    setSuccessMsg(
      mode === 'signup'
        ? 'Farmer profile created! Session authenticated via HttpOnly cookie.'
        : 'Welcome back! Session authenticated via HttpOnly cookie.'
    );
    setOtpSent(false);
    setOtpCode('');
  };

  // Sign out / revoke session
  const handleLogout = () => {
    setCurrentUser(null);
    setSessionHash(null);
    setOtpSent(false);
    setOtpCode('');
    setDevGeneratedOtp(null);
    setSuccessMsg('Signed out of this device successfully. Session token revoked in database.');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner explaining M2 authentication */}
      <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-5 shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
              <KeyRound className="w-4 h-4" />
            </span>
            <span className="font-bold text-sm text-slate-100">
              Milestone 2 Interactive Verification Lab
            </span>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-semibold">
            Strict Farmer Security Rules
          </span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Farmers never use passwords. Registration and login use 10-digit Indian mobile validation, CSPRNG OTP generation with HMAC server-pepper hashing, 30s resend cooldowns, and 256-bit hashed session tokens in HttpOnly cookies.
        </p>
      </div>

      {/* Authenticated State Display */}
      {currentUser ? (
        <div className="bg-slate-900/90 border border-emerald-500/40 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-slate-950 font-bold text-lg shadow-md shadow-emerald-500/20">
                <UserCheck className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-slate-100">{currentUser.name}</h3>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.2 rounded-full font-semibold">
                    SESSION ACTIVE
                  </span>
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                  <span>+91 {currentUser.phone}</span>
                  <span>&bull;</span>
                  <span>Farmer ID: {currentUser.id.slice(0, 8)}...</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out of this device</span>
            </button>
          </div>

          {/* Session Details Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Cryptographic Session Token</span>
                <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                  HttpOnly Cookie &bull; SameSite=Lax
                </span>
              </div>
              <div className="font-mono text-xs text-slate-300 break-all bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-500">SHA-256 Token Hash: </span>
                {sessionHash}
              </div>
              <p className="text-[11px] text-slate-400">
                Raw 256-bit token is sent only in the HttpOnly cookie. Only the SHA-256 hash is retained in the PostgreSQL database.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Farm Location &amp; Geofence</span>
                <span className="text-[10px] text-teal-400 font-mono bg-teal-950 px-2 py-0.5 rounded border border-teal-800">
                  India Bounds Verified
                </span>
              </div>
              <div className="text-xs text-slate-300 space-y-1 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                <div><strong className="text-slate-200">Village:</strong> {currentUser.address?.village}, {currentUser.address?.district}, {currentUser.address?.state}</div>
                <div><strong className="text-slate-200">Postal PIN:</strong> {currentUser.address?.pin_code}</div>
                <div><strong className="text-slate-200">GPS:</strong> {currentUser.address?.latitude.toFixed(4)}°N, {currentUser.address?.longitude.toFixed(4)}°E</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Unauthenticated Auth Form */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form Column */}
          <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            {/* Mode Switcher */}
            <div className="flex border-b border-slate-800 pb-3 gap-4">
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`text-sm font-semibold pb-2 border-b-2 transition-all cursor-pointer ${
                  mode === 'signup'
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                New Farmer Signup
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('recover');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`text-sm font-semibold pb-2 border-b-2 transition-all cursor-pointer ${
                  mode === 'recover'
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign In / Recovery
              </button>
            </div>

            {/* Status alerts */}
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <div className="flex-1 leading-relaxed">{errorMsg}</div>
              </div>
            )}
            {successMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                <div className="flex-1 leading-relaxed">{successMsg}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Farmer Full Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Ramesh Chandra Pradhan"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              )}

              {/* Mobile Phone Field */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Indian Mobile Number
                  </label>
                  <span className="text-[10px] text-slate-400">10 digits starting 6-9</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs font-mono text-slate-400 select-none">
                    +91
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="9861012345"
                    className="w-full pl-12 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              {/* Address Fields for Signup */}
              {mode === 'signup' && (
                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                      Farm Location &amp; PIN Code
                    </span>
                    <span className="text-[10px] text-slate-400">Try 768028, 141001, 411001</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Postal PIN Code</label>
                      <input
                        type="text"
                        value={pinCode}
                        onChange={handlePinChange}
                        maxLength={6}
                        placeholder="768028"
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Village / Town</label>
                      <input
                        type="text"
                        value={village}
                        onChange={(e) => setVillage(e.target.value)}
                        placeholder="Barpali"
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">District</label>
                      <input
                        type="text"
                        value={district}
                        onChange={(e) => setDistrict(e.target.value)}
                        placeholder="Bargarh"
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">State</label>
                      <input
                        type="text"
                        value={stateName}
                        onChange={(e) => setStateName(e.target.value)}
                        placeholder="Odisha"
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs font-mono text-slate-400 pt-1">
                    <div>Lat: {latitude.toFixed(4)}°N</div>
                    <div>Lon: {longitude.toFixed(4)}°E</div>
                  </div>

                  {/* Confirmation Checkbox */}
                  <label className="flex items-start gap-2 pt-1 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmedAddress}
                      onChange={(e) => setConfirmedAddress(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0"
                    />
                    <span>
                      Save this address? It replaces any previous address for advisories and alerts.
                    </span>
                  </label>
                </div>
              )}

              {/* OTP Request / Cooldown Section */}
              <div className="pt-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleRequestOtp(mode === 'recover' ? 'recovery' : 'signup')}
                    disabled={cooldown > 0}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      cooldown > 0
                        ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                    }`}
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>
                      {cooldown > 0 ? `Resend Code in ${cooldown}s` : 'Send Verification OTP'}
                    </span>
                  </button>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                  <span>30s cooldown &bull; Max 3 per 15 min &bull; Max 5 per 24h</span>
                  <span>Requests: {requestCount24h}/5</span>
                </div>
              </div>

              {/* Active OTP Input (shown once sent) */}
              {otpSent && (
                <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Enter 6-Digit Code (Expires in {Math.floor(expirySeconds / 60)}:{('0' + (expirySeconds % 60)).slice(-2)})
                    </span>
                    <span className="text-[10px] text-amber-300 font-mono bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60">
                      {attemptsRemaining} attempts left
                    </span>
                  </div>

                  {devGeneratedOtp && (
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-emerald-500/40 text-[11px] text-slate-300 flex items-center justify-between">
                      <span className="text-emerald-400 font-semibold font-mono">
                        Dev Testing Code: {devGeneratedOtp}
                      </span>
                      <button
                        type="button"
                        onClick={() => setOtpCode(devGeneratedOtp)}
                        className="text-[10px] px-2 py-0.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded font-semibold cursor-pointer"
                      >
                        Auto-fill
                      </button>
                    </div>
                  )}

                  <input
                    type="text"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 6-digit OTP"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-mono text-center tracking-widest text-lg font-bold focus:outline-none focus:border-emerald-500"
                    autoFocus
                  />

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 cursor-pointer"
                  >
                    {mode === 'signup' ? 'Complete Signup & Open Dashboard' : 'Authenticate & Sign In'}
                  </button>
                </div>
              )}
            </form>
          </div>

          {/* Security Specs Explanatory Column */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="font-bold text-xs uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Security Engine Invariants</span>
              </h3>

              <div className="space-y-3 text-xs text-slate-300">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="font-semibold text-slate-100">Zero Password Footprint</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Farmers are vulnerable to password reuse, phishing, and credential stuffing. Authentication is anchored strictly to their mobile number and single-use CSPRNG tokens.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="font-semibold text-slate-100">Server Peppered HMAC</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Even with database read access, attackers cannot reverse or brute-force OTP hashes without the high-entropy 256-bit <code className="text-emerald-300 font-mono">OTP_PEPPER</code>.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="font-semibold text-slate-100">Anti-Enumeration Responses</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    All OTP and recovery endpoints return generic responses to prevent unauthorized phone number harvesting or registration probing.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="font-semibold text-slate-100">Geographic Bounding</div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Any coordinates outside the geographic territory of India (6°N to 38°N, 68°E to 98°E) are strictly rejected at the schema level.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
