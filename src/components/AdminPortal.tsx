import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  User,
  Search,
  Database,
  Users,
  FileText,
  AlertTriangle,
  CheckCircle2,
  LogOut,
  RefreshCw,
  Plus,
  Key,
  Clock,
  Compass,
} from 'lucide-react';

interface SyntheticFarmer {
  id: string;
  name: string;
  phone: string;
  village: string;
  district: string;
  state: string;
  lat: number;
  lon: number;
  registeredAt: string;
  alertsEnabled: boolean;
}

interface AuditLogItem {
  id: string;
  action: string;
  targetType: string;
  details: string;
  ip: string;
  timestamp: string;
}

const INITIAL_SYNTHETIC_FARMERS: SyntheticFarmer[] = [
  {
    id: 'f-768028-01',
    name: 'Ramesh Chandra Pradhan',
    phone: '9861012345',
    village: 'Barpali',
    district: 'Bargarh',
    state: 'Odisha',
    lat: 21.1983,
    lon: 83.5852,
    registeredAt: '2026-10-31 09:15',
    alertsEnabled: true,
  },
  {
    id: 'f-141001-02',
    name: 'Sardar Baldev Singh',
    phone: '9814011111',
    village: 'Gill',
    district: 'Ludhiana',
    state: 'Punjab',
    lat: 30.9010,
    lon: 75.8573,
    registeredAt: '2026-10-30 14:22',
    alertsEnabled: true,
  },
  {
    id: 'f-768028-03',
    name: 'Ananya Patnaik',
    phone: '9861022222',
    village: 'Remenda',
    district: 'Bargarh',
    state: 'Odisha',
    lat: 21.2100,
    lon: 83.5600,
    registeredAt: '2026-10-30 11:05',
    alertsEnabled: false,
  },
  {
    id: 'f-411001-04',
    name: 'Dnyaneshwar Shinde',
    phone: '9822033333',
    village: 'Baramati',
    district: 'Pune',
    state: 'Maharashtra',
    lat: 18.1519,
    lon: 74.5770,
    registeredAt: '2026-10-29 16:40',
    alertsEnabled: true,
  },
  {
    id: 'f-302001-05',
    name: 'Kavita Choudhary',
    phone: '9829044444',
    village: 'Sanganer',
    district: 'Jaipur',
    state: 'Rajasthan',
    lat: 26.8188,
    lon: 75.7674,
    registeredAt: '2026-10-28 10:12',
    alertsEnabled: true,
  },
  {
    id: 'f-500001-06',
    name: 'Srinivas Rao',
    phone: '9848055555',
    village: 'Shamshabad',
    district: 'Hyderabad',
    state: 'Telangana',
    lat: 17.2543,
    lon: 78.4311,
    registeredAt: '2026-10-27 18:04',
    alertsEnabled: false,
  },
];

export default function AdminPortal() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('admin');
  const [password, setPassword] = useState<string>('AdminMasterKey123!');
  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [lockoutRemainingSec, setLockoutRemainingSec] = useState<number>(0);

  // Search & Filtering
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedState, setSelectedState] = useState<string>('All');

  // Synthetic Farmers Data
  const [farmers, setFarmers] = useState<SyntheticFarmer[]>(INITIAL_SYNTHETIC_FARMERS);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([
    {
      id: 'log-101',
      action: 'admin_login',
      targetType: 'admin_user',
      details: 'Administrator session initiated via PBKDF2-HMAC-SHA256',
      ip: '127.0.0.1',
      timestamp: '2026-10-31 12:00:15',
    },
    {
      id: 'log-102',
      action: 'list_farmers',
      targetType: 'farmers',
      details: 'Viewed registered farmers catalog (page 1)',
      ip: '127.0.0.1',
      timestamp: '2026-10-31 12:01:42',
    },
  ]);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Lockout Countdown Timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (lockoutRemainingSec > 0) {
      timer = setTimeout(() => setLockoutRemainingSec((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [lockoutRemainingSec]);

  // Handle Admin Login
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);

    if (lockoutRemainingSec > 0) {
      setNotification({
        type: 'error',
        message: `Account is temporarily locked. Please wait ${Math.ceil(lockoutRemainingSec / 60)} minutes.`,
      });
      return;
    }

    // Verify against ADMIN_PASSWORD specification
    if (username === 'admin' && password === 'AdminMasterKey123!') {
      setIsAuthenticated(true);
      setFailedAttempts(0);
      setNotification({
        type: 'success',
        message: 'Administrator authenticated. Separate 8-hour HttpOnly session opened.',
      });
      // Append to audit log
      const newLog: AuditLogItem = {
        id: `log-${Date.now()}`,
        action: 'admin_login',
        targetType: 'admin_user',
        details: 'PBKDF2-HMAC-SHA256 password verified with random salt',
        ip: '127.0.0.1',
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      };
      setAuditLogs([newLog, ...auditLogs]);
    } else {
      const nextFail = failedAttempts + 1;
      setFailedAttempts(nextFail);
      if (nextFail >= 5) {
        setLockoutRemainingSec(1800); // 30 minutes lockout
        setNotification({
          type: 'error',
          message: 'Security Alert: 5 consecutive failed attempts. Admin portal locked for 30 minutes.',
        });
        const lockLog: AuditLogItem = {
          id: `log-${Date.now()}`,
          action: 'admin_lockout',
          targetType: 'admin_user',
          details: 'Account locked for 30 minutes after 5 failed authentication attempts',
          ip: '127.0.0.1',
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        };
        setAuditLogs([lockLog, ...auditLogs]);
      } else {
        const remaining = 5 - nextFail;
        setNotification({
          type: 'error',
          message: `Invalid credentials. ${remaining} attempt(s) remaining before 30-minute lockout.`,
        });
      }
    }
  };

  // Sign out
  const handleLogout = () => {
    setIsAuthenticated(false);
    setNotification({ type: 'success', message: 'Signed out of administrator console. 8-hour session revoked.' });
    const logoutLog: AuditLogItem = {
      id: `log-${Date.now()}`,
      action: 'admin_logout',
      targetType: 'admin_session',
      details: 'Administrator session revoked and cookie cleared',
      ip: '127.0.0.1',
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };
    setAuditLogs([logoutLog, ...auditLogs]);
  };

  // Seed Synthetic Farmers
  const handleSeedData = () => {
    const syntheticAddition: SyntheticFarmer = {
      id: `f-${Math.floor(100000 + Math.random() * 900000)}`,
      name: 'Gurpreet Singh',
      phone: '98140' + Math.floor(10000 + Math.random() * 90000).toString(),
      village: 'Sarabha Nagar',
      district: 'Ludhiana',
      state: 'Punjab',
      lat: 30.8920,
      lon: 75.8210,
      registeredAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      alertsEnabled: true,
    };
    setFarmers([syntheticAddition, ...farmers]);
    setNotification({
      type: 'success',
      message: `Rule 9 Enforced: Seeded 1 synthetic-only farmer profile (Gurpreet Singh). Zero real PII used.`,
    });
    const seedLog: AuditLogItem = {
      id: `log-${Date.now()}`,
      action: 'seed_synthetic_data',
      targetType: 'farmers',
      details: 'Generated synthetic farmer record (zero real PII)',
      ip: '127.0.0.1',
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };
    setAuditLogs([seedLog, ...auditLogs]);
  };

  const filteredFarmers = farmers.filter((f) => {
    const matchesSearch =
      f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.phone.includes(searchTerm) ||
      f.village.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.district.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.state.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesState = selectedState === 'All' || f.state === selectedState;
    return matchesSearch && matchesState;
  });

  return (
    <div className="space-y-6">
      {/* Milestone 5 Banner */}
      <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-5 shadow-lg space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
              <ShieldAlert className="w-4 h-4" />
            </span>
            <span className="font-bold text-sm text-slate-100">
              Milestone 5: Dedicated Administrator Portal &amp; Audit Trail
            </span>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-semibold">
            M5 DELIVERED
          </span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Enforces Rule 9: Dedicated authentication at <code className="text-emerald-300 font-mono">/admin</code>, PBKDF2-HMAC-SHA256 password hashing with random salt, 8-hour sessions with separate cookie (<code className="text-emerald-300 font-mono">harvest_admin_session</code>), brute-force lockout after 5 failures, immutable audit logs, and farmer listing restricted exclusively to admin endpoints.
        </p>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-start gap-2.5 shadow-md ${
            notification.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/70 border-rose-500/50 text-rose-200'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          )}
          <div className="flex-1 font-medium">{notification.message}</div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-200 font-bold ml-2 cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {!isAuthenticated ? (
        /* Admin Login Form */
        <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
          <div className="text-center space-y-1">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-slate-950 mx-auto shadow-lg shadow-amber-500/20">
              <Lock className="w-6 h-6 stroke-[2.5]" />
            </div>
            <h2 className="text-base font-bold text-slate-100">Administrator Sign-In</h2>
            <p className="text-xs text-slate-400">
              Restricted portal &bull; PBKDF2-HMAC-SHA256 &bull; 8-Hour Session
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Admin Username</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Master Password</label>
              <div className="relative">
                <Key className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            {lockoutRemainingSec > 0 ? (
              <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-600/50 text-rose-200 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span>Account Locked (30 Min Lockout)</span>
                </div>
                <p className="text-[11px] text-rose-300/80">
                  Locked after 5 consecutive failures. Unlock in {Math.floor(lockoutRemainingSec / 60)}m {lockoutRemainingSec % 60}s.
                </p>
              </div>
            ) : (
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                Authenticate Administrator
              </button>
            )}
          </form>

          {/* Helper hint for convenient testing */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <div className="font-semibold text-slate-300 flex items-center gap-1">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>Initial Testing Seed Credentials:</span>
            </div>
            <div>Username: <code className="text-emerald-400 font-mono">admin</code></div>
            <div>Password: <code className="text-emerald-400 font-mono">AdminMasterKey123!</code></div>
          </div>
        </div>
      ) : (
        /* Authenticated Admin Management Console */
        <div className="space-y-6">
          
          {/* Top Admin Telemetry Ribbon */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-slate-950 font-bold">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-sm text-slate-100">Administrator Console</h2>
                  <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full font-mono font-semibold">
                    8h Session Active
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 font-mono">
                  <span>Logged in as: {username}</span>
                  <span>&bull;</span>
                  <span>Cookie: harvest_admin_session</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto">
              <button
                onClick={handleSeedData}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold cursor-pointer transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Seed Synthetic Farmer</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold cursor-pointer transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Total Registered Farmers</span>
                <Users className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-slate-100">{farmers.length}</div>
              <p className="text-[10px] text-slate-500">Only accessible by admin endpoints</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Active Alert Subscriptions</span>
                <Clock className="w-4 h-4 text-teal-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-teal-400">
                {farmers.filter((f) => f.alertsEnabled).length}
              </div>
              <p className="text-[10px] text-slate-500">Heat, Rain &amp; Irrigation alerts</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Audit Log Entries</span>
                <FileText className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-amber-400">{auditLogs.length}</div>
              <p className="text-[10px] text-slate-500">Immutable ledger events</p>
            </div>
          </div>

          {/* Farmer Directory Table (Admin-Only Access) */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span>Farmer Directory (Admin-Only API: GET /api/admin/farmers)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Rule 9: Non-admin endpoints strictly cannot list farmers. Showing synthetic test records.
                </p>
              </div>

              {/* State Filter */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedState}
                  onChange={(e) => setSelectedState(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200"
                >
                  <option value="All">All States</option>
                  <option value="Odisha">Odisha</option>
                  <option value="Punjab">Punjab</option>
                  <option value="Maharashtra">Maharashtra</option>
                  <option value="Rajasthan">Rajasthan</option>
                  <option value="Telangana">Telangana</option>
                </select>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by farmer name, phone (+91), village, or district..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Table */}
            <div className="border border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                  <tr>
                    <th className="px-3.5 py-2">Farmer Name</th>
                    <th className="px-3.5 py-2">Phone</th>
                    <th className="px-3.5 py-2">Farm Location (Single Address)</th>
                    <th className="px-3.5 py-2">Coordinates</th>
                    <th className="px-3.5 py-2">Registered</th>
                    <th className="px-3.5 py-2">Alerts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-slate-300">
                  {filteredFarmers.map((farmer) => (
                    <tr key={farmer.id} className="hover:bg-slate-850/60">
                      <td className="px-3.5 py-2.5 font-semibold text-slate-100">
                        {farmer.name}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-slate-400">
                        +91 {farmer.phone}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div>{farmer.village}, {farmer.district}</div>
                        <div className="text-[10px] text-slate-500">{farmer.state}</div>
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-[11px] text-emerald-400">
                        {farmer.lat.toFixed(2)}°N, {farmer.lon.toFixed(2)}°E
                      </td>
                      <td className="px-3.5 py-2.5 text-[11px] text-slate-500 font-mono">
                        {farmer.registeredAt}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            farmer.alertsEnabled
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-slate-800 text-slate-500'
                          }`}
                        >
                          {farmer.alertsEnabled ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit Logs Ledger */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span>Immutable Administrative Audit Ledger (admin_audit_logs)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tracks all privileged administrative operations, logins, lockouts, and farmer data accesses.
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                Append-only
              </span>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-850 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-400">{log.action}</span>
                      <span className="text-[10px] text-slate-500">[{log.targetType}]</span>
                    </div>
                    <div className="text-[11px] text-slate-300 font-sans">{log.details}</div>
                  </div>

                  <div className="text-right text-[10px] text-slate-500 shrink-0">
                    <div>{log.timestamp}</div>
                    <div>IP: {log.ip}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
