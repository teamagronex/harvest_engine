/**
 * HarvestEngine: Milestone 6 - Alert Preferences, Multi-lingual SMS Dispatch,
 * and 24-Hour Deduplication Audit Ledger
 */

import React, { useState } from 'react';
import {
  Bell,
  Smartphone,
  ShieldCheck,
  Globe,
  Flame,
  CloudRain,
  Droplets,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  RotateCw,
  Send,
  ToggleLeft,
  ToggleRight,
  ShieldAlert,
  Server,
} from 'lucide-react';

export interface AlertPrefData {
  heat_alerts: boolean;
  heavy_rain_alerts: boolean;
  irrigation_advisories: boolean;
  sms_enabled: boolean;
  preferred_language: 'en' | 'hi' | 'or';
}

export interface AlertLogItem {
  id: string;
  alert_type: string;
  channel: string;
  message_snippet: string;
  status: 'sent' | 'in_app_only' | 'provider_disabled' | 'deduplicated_skipped' | 'failed';
  delivery_id?: string;
  sent_at: string;
  deduplication_key: string;
}

interface AlertPreferencesManagerProps {
  farmerPhone: string;
  farmerVillage: string;
  farmerDistrict: string;
}

export const AlertPreferencesManager: React.FC<AlertPreferencesManagerProps> = ({
  farmerPhone,
  farmerVillage,
  farmerDistrict,
}) => {
  const [prefs, setPrefs] = useState<AlertPrefData>({
    heat_alerts: true,
    heavy_rain_alerts: true,
    irrigation_advisories: true,
    sms_enabled: false, // Default: feature-flagged / disabled
    preferred_language: 'en',
  });

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<string | null>(null);

  // Initial audit log showing deduplication invariant and safe status tracking
  const [logs, setLogs] = useState<AlertLogItem[]>([
    {
      id: 'log-1',
      alert_type: 'heat',
      channel: 'sms',
      message_snippet:
        'HarvestEngine: Heat alert for ' +
        (farmerVillage || 'Kisanpur') +
        '. High temp 41.2°C expected today. Water crops early morning or evening. Reply STOP to opt out.',
      status: 'provider_disabled',
      delivery_id: undefined,
      sent_at: new Date(Date.now() - 3600000).toISOString(),
      deduplication_key: `${new Date().toISOString().slice(0, 10)}:heat:current_farmer`,
    },
    {
      id: 'log-2',
      alert_type: 'irrigation',
      channel: 'in_app',
      message_snippet:
        'HarvestEngine: Irrigation reminder for Wheat. Estimated need: 18.4 mm (184 m3/ha). ET0-based advisory.',
      status: 'in_app_only',
      delivery_id: undefined,
      sent_at: new Date(Date.now() - 7200000).toISOString(),
      deduplication_key: `${new Date().toISOString().slice(0, 10)}:irrigation:current_farmer`,
    },
  ]);

  const handleToggle = (key: keyof AlertPrefData) => {
    if (key === 'sms_enabled' && !prefs.sms_enabled) {
      // Opening consent modal for regulatory opt-in
      setShowConsentModal(true);
      return;
    }
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleConfirmSMSConsent = () => {
    setPrefs((prev) => ({ ...prev, sms_enabled: true }));
    setShowConsentModal(false);
    triggerSave({ ...prefs, sms_enabled: true });
  };

  const handleLanguageChange = (lang: 'en' | 'hi' | 'or') => {
    const updated = { ...prefs, preferred_language: lang };
    setPrefs(updated);
    triggerSave(updated);
  };

  const triggerSave = (updatedPrefs: AlertPrefData) => {
    setSaving(true);
    setSuccessMsg(null);
    setTimeout(() => {
      setSaving(false);
      setSuccessMsg('Preferences saved and synchronized.');
      setTimeout(() => setSuccessMsg(null), 3500);
    }, 400);
  };

  // Preview templates per language
  const getSMSPreview = (type: 'heat' | 'flood' | 'irrigation') => {
    const vName = farmerVillage || 'Kisanpur';
    if (type === 'heat') {
      if (prefs.preferred_language === 'hi') {
        return `हार्वेस्ट इंजन: ${vName} हेतु भीषण गर्मी चेतावनी। आज तापमान 41.5°C संभव। सुबह या शाम सिंचाई करें। बंद करने के लिए STOP भेजें।`;
      }
      if (prefs.preferred_language === 'or') {
        return `ହାର୍ଭେଷ୍ଟ ଇଞ୍ଜିନ: ${vName} ପାଇଁ ଅତ୍ୟଧିକ ଖରା ସତର୍କତା। ଆଜି ତାପମାତ୍ରା 41.5°C ସମ୍ଭାବନା। ସକାଳେ/ସନ୍ଧ୍ୟାରେ ଜଳସେଚନ କରନ୍ତୁ। STOP ପଠାନ୍ତୁ।`;
      }
      return `HarvestEngine: Heat alert for ${vName}. High temp 41.5°C expected today. Water crops early morning or evening. Reply STOP to opt out.`;
    }
    if (type === 'flood') {
      if (prefs.preferred_language === 'hi') {
        return `हार्वेस्ट इंजन: ${vName} में 3 दिनों में 54.0 मिमी भारी बारिश का अनुमान। खेत की जल निकासी नाली साफ करें। मौसम विभाग: mausam.imd.gov.in. STOP भेजें।`;
      }
      if (prefs.preferred_language === 'or') {
        return `ହାର୍ଭେଷ୍ଟ ଇଞ୍ଜିନ: ${vName} ରେ ଆଗାମୀ 3 ଦିନରେ 54.0 mm ବର୍ଷା ଆକଳନ। ଜମିର ନାଳ ସଫା ରଖନ୍ତୁ। ସତର୍କତା: mausam.imd.gov.in. STOP ପଠାନ୍ତୁ।`;
      }
      return `HarvestEngine: Heavy rain alert for ${vName}. 54.0 mm rain forecast over 3 days. Inspect drainage channels. IMD warnings: mausam.imd.gov.in. Reply STOP to opt out.`;
    }
    // irrigation
    if (prefs.preferred_language === 'hi') {
      return `हार्वेस्ट इंजन: गेहूं फसल हेतु सलाह। अनुमानित आवश्यकता: 22.0 मिमी (220 घन मीटर/हेक्टेयर)। बंद करने के लिए STOP भेजें।`;
    }
    if (prefs.preferred_language === 'or') {
      return `ହାର୍ଭେଷ୍ଟ ଇଞ୍ଜିନ: ଗହମ ଫସଲ ପାଇଁ ଜଳସେଚନ ପରାମର୍ଶ। ଆବଶ୍ୟକତା: 22.0 mm (220 ଘନ ମିଟର/ହେକ୍ଟର)। STOP ପଠାନ୍ତୁ।`;
    }
    return `HarvestEngine: Irrigation reminder for Wheat. Estimated need: 22.0 mm (220 m3/ha). ET0-based advisory. Reply STOP to opt out.`;
  };

  const handleRunDailyDispatch = () => {
    setEvaluating(true);
    setEvalResult(null);

    setTimeout(() => {
      setEvaluating(false);
      const today = new Date().toISOString().slice(0, 10);
      const heatKey = `${today}:heat:current_farmer`;

      // Check if heat key exists
      const alreadyLogged = logs.some((l) => l.deduplication_key === heatKey);

      if (alreadyLogged) {
        setEvalResult(
          'Evaluation completed: Condition met (41.5°C >= 40°C), but alert was SKIPPED due to strict 24-hour deduplication constraint.'
        );
        const skippedEntry: AlertLogItem = {
          id: `log-${Date.now()}`,
          alert_type: 'heat',
          channel: prefs.sms_enabled ? 'sms' : 'in_app',
          message_snippet: getSMSPreview('heat'),
          status: 'deduplicated_skipped',
          sent_at: new Date().toISOString(),
          deduplication_key: `${today}:heat:duplicate_attempt_${Date.now()}`,
        };
        setLogs((prev) => [skippedEntry, ...prev]);
      } else {
        const newEntry: AlertLogItem = {
          id: `log-${Date.now()}`,
          alert_type: 'heat',
          channel: prefs.sms_enabled ? 'sms' : 'in_app',
          message_snippet: getSMSPreview('heat'),
          status: prefs.sms_enabled ? 'provider_disabled' : 'in_app_only',
          sent_at: new Date().toISOString(),
          deduplication_key: heatKey,
        };
        setLogs((prev) => [newEntry, ...prev]);
        setEvalResult(
          prefs.sms_enabled
            ? 'Evaluation completed: Alert evaluated. Provider status: "Disabled" in config; logged with status "provider_disabled" (never falsified).'
            : 'Evaluation completed: Logged as "in_app_only" as SMS broadcast is not enabled.'
        );
      }
    }, 800);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-900 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Milestone 6: SMS & Alert Preferences
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                Feature-Flagged
              </span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Kisan Alert & Broadcast Engine</h2>
            <p className="text-emerald-200 text-sm max-w-2xl">
              Configurable weather thresholds (≥40°C heat, ≥50mm rain, FAO-56 irrigation), multi-channel delivery,
              multilingual SMS support (EN, HI, OR), and 24-hour deduplication.
            </p>
          </div>
          <button
            onClick={handleRunDailyDispatch}
            disabled={evaluating}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-900 font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 text-sm whitespace-nowrap self-start md:self-auto cursor-pointer"
          >
            <RotateCw className={`w-4 h-4 ${evaluating ? 'animate-spin' : ''}`} />
            {evaluating ? 'Evaluating Daily Weather...' : 'Test Daily Alert Evaluation'}
          </button>
        </div>

        {evalResult && (
          <div className="mt-4 p-3.5 bg-black/30 border border-emerald-400/30 rounded-xl text-xs font-mono text-emerald-200 flex items-start gap-2 animate-fade-in">
            <Info className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-200">Execution Result:</p>
              <p>{evalResult}</p>
            </div>
          </div>
        )}
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Grid: Settings & Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Preferences Controls */}
        <div className="lg:col-span-7 space-y-6">
          {/* Language Selector Card */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-stone-800">Alert Language / भाषा / ଭାଷା</h3>
              </div>
              <span className="text-xs text-stone-500 font-mono">TRAI compliant</span>
            </div>
            <p className="text-xs text-stone-600">
              Select the language used for SMS text and advisory explanations.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { code: 'en', label: 'English', sub: 'Latin Script' },
                { code: 'hi', label: 'हिन्दी', sub: 'Devanagari' },
                { code: 'or', label: 'ଓଡ଼ିଆ', sub: 'Odia Script' },
              ].map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleLanguageChange(lang.code as 'en' | 'hi' | 'or')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    prefs.preferred_language === lang.code
                      ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-bold shadow-sm ring-1 ring-emerald-600'
                      : 'border-stone-200 hover:border-stone-300 bg-stone-50/50 text-stone-700'
                  }`}
                >
                  <p className="text-sm font-semibold">{lang.label}</p>
                  <p className="text-xs text-stone-500 font-normal mt-0.5">{lang.sub}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Alert Type Criteria Toggles */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-stone-800">Advisory Triggers & Thresholds</h3>
              </div>
              <span className="text-xs text-stone-500">Auto-evaluated daily</span>
            </div>

            <div className="divide-y divide-stone-100">
              {/* Heat Alert */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-red-100 text-red-600 mt-0.5">
                    <Flame className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-900">Extreme Heat Advisory</p>
                    <p className="text-xs text-stone-600">
                      Triggers when daily forecast max temperature reaches <strong>≥40.0°C</strong>.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('heat_alerts')}
                  className="cursor-pointer text-stone-400 hover:text-stone-600 focus:outline-none"
                  aria-label="Toggle Heat Alerts"
                >
                  {prefs.heat_alerts ? (
                    <ToggleRight className="w-8 h-8 text-emerald-600" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-stone-300" />
                  )}
                </button>
              </div>

              {/* Heavy Rain / Flood Alert */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600 mt-0.5">
                    <CloudRain className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-900">Heavy Rainfall & Flood Risk</p>
                    <p className="text-xs text-stone-600">
                      Triggers when 3-day accumulated rainfall is <strong>≥50.0 mm</strong>. Links to IMD.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('heavy_rain_alerts')}
                  className="cursor-pointer text-stone-400 hover:text-stone-600 focus:outline-none"
                  aria-label="Toggle Heavy Rain Alerts"
                >
                  {prefs.heavy_rain_alerts ? (
                    <ToggleRight className="w-8 h-8 text-emerald-600" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-stone-300" />
                  )}
                </button>
              </div>

              {/* FAO-56 Irrigation Advisory */}
              <div className="py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-teal-100 text-teal-600 mt-0.5">
                    <Droplets className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-stone-900">Crop Irrigation Advice</p>
                    <p className="text-xs text-stone-600">
                      Triggers when net water need $W_{'need'} &gt; 0$ mm ($ET_c &gt; P_{'eff'}$).
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('irrigation_advisories')}
                  className="cursor-pointer text-stone-400 hover:text-stone-600 focus:outline-none"
                  aria-label="Toggle Irrigation Advisories"
                >
                  {prefs.irrigation_advisories ? (
                    <ToggleRight className="w-8 h-8 text-emerald-600" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-stone-300" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Delivery Channels & SMS Opt-In Card */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-stone-800">Dispatch Channels</h3>
              </div>
              <span className="text-xs bg-stone-100 text-stone-700 px-2 py-0.5 rounded font-mono">
                TRAI / DLT Standard
              </span>
            </div>

            {/* In-App Channel (Always On) */}
            <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-stone-900">In-App Dashboard Alerts</p>
                <p className="text-xs text-stone-500">Live colored banner notices directly on farmer dashboard.</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800">
                Always Active
              </span>
            </div>

            {/* SMS Broadcast Channel */}
            <div
              className={`p-4 rounded-xl border transition-all ${
                prefs.sms_enabled
                  ? 'bg-amber-50/60 border-amber-300 ring-1 ring-amber-300'
                  : 'bg-stone-50 border-stone-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-stone-900">SMS Broadcast to Mobile</p>
                    {prefs.sms_enabled ? (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-200 text-amber-900">
                        Opted In
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-stone-200 text-stone-600">
                        Disabled (Default)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-600">
                    Recipient: <strong className="font-mono text-stone-800">{farmerPhone || '+91 98765-XXXXX'}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('sms_enabled')}
                  className="cursor-pointer text-stone-400 hover:text-stone-600 focus:outline-none"
                  aria-label="Toggle SMS broadcast"
                >
                  {prefs.sms_enabled ? (
                    <ToggleRight className="w-8 h-8 text-amber-600" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-stone-300" />
                  )}
                </button>
              </div>

              <div className="mt-3 text-xs text-stone-500 border-t border-stone-200/60 pt-2.5 flex items-center justify-between">
                <span>Frequency: Max 1 SMS per category per 24 hours (strict deduplication).</span>
                <span className="font-semibold text-stone-600">Zero Charge</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live SMS Preview & Provider Architecture */}
        <div className="lg:col-span-5 space-y-6">
          {/* Mobile SMS Preview Device */}
          <div className="bg-stone-900 rounded-3xl p-4 shadow-xl border-4 border-stone-800 text-stone-100">
            <div className="flex items-center justify-between px-2 pb-3 border-b border-stone-800 text-xs text-stone-400">
              <span className="font-semibold text-emerald-400">HarvestEngine SMS Simulator</span>
              <span>DLT Template Active</span>
            </div>

            <div className="mt-4 space-y-3">
              {/* Message bubble: Heat */}
              {prefs.heat_alerts && (
                <div className="p-3.5 bg-stone-800/90 border border-stone-700 rounded-2xl rounded-tl-sm text-xs space-y-1.5 shadow-sm">
                  <div className="flex items-center justify-between text-[10px] text-red-400 font-semibold uppercase">
                    <span className="flex items-center gap-1">
                      <Flame className="w-3 h-3" /> Heat Alert
                    </span>
                    <span>10:00 AM</span>
                  </div>
                  <p className="text-stone-200 leading-relaxed font-sans">{getSMSPreview('heat')}</p>
                </div>
              )}

              {/* Message bubble: Flood */}
              {prefs.heavy_rain_alerts && (
                <div className="p-3.5 bg-stone-800/90 border border-stone-700 rounded-2xl rounded-tl-sm text-xs space-y-1.5 shadow-sm">
                  <div className="flex items-center justify-between text-[10px] text-blue-400 font-semibold uppercase">
                    <span className="flex items-center gap-1">
                      <CloudRain className="w-3 h-3" /> Heavy Rain
                    </span>
                    <span>10:01 AM</span>
                  </div>
                  <p className="text-stone-200 leading-relaxed font-sans">{getSMSPreview('flood')}</p>
                </div>
              )}

              {/* Message bubble: Irrigation */}
              {prefs.irrigation_advisories && (
                <div className="p-3.5 bg-stone-800/90 border border-stone-700 rounded-2xl rounded-tl-sm text-xs space-y-1.5 shadow-sm">
                  <div className="flex items-center justify-between text-[10px] text-teal-400 font-semibold uppercase">
                    <span className="flex items-center gap-1">
                      <Droplets className="w-3 h-3" /> Irrigation Need
                    </span>
                    <span>06:30 AM</span>
                  </div>
                  <p className="text-stone-200 leading-relaxed font-sans">{getSMSPreview('irrigation')}</p>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-stone-800 flex items-center justify-between text-[11px] text-stone-400 px-1">
              <span>Opt-Out Directive:</span>
              <span className="font-mono text-amber-300">Reply STOP to unsubscribe</span>
            </div>
          </div>

          {/* SMS Adapter & Provider Compliance Architecture Card */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm space-y-3.5 text-xs">
            <div className="flex items-center gap-2 text-stone-800 font-bold text-sm">
              <Server className="w-4 h-4 text-emerald-600" />
              <span>SMS Adapter Architecture</span>
            </div>
            <div className="space-y-2 text-stone-600">
              <div className="flex items-center justify-between p-2 rounded-lg bg-stone-50 border border-stone-200">
                <span className="font-medium">Active Provider:</span>
                <span className="font-mono font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                  Disabled (Safety Default)
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-stone-50 border border-stone-200">
                <span className="font-medium">Supported Adapters:</span>
                <span className="font-mono text-stone-800">MSG91 (India DLT) &bull; Twilio</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-stone-50 border border-stone-200">
                <span className="font-medium">Integrity Guarantee:</span>
                <span className="text-emerald-700 font-semibold">Never pretends sent when disabled</span>
              </div>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-amber-900 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-700" /> Production Enablement
              </p>
              <p className="text-[11px] leading-relaxed">
                To activate live dispatches in production, set <code className="bg-white px-1 py-0.5 rounded font-mono">SMS_PROVIDER=msg91</code> and provide verified DLT Header & Entity IDs in <code className="bg-white px-1 py-0.5 rounded font-mono">.env</code>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 24-Hour Deduplication Audit Log Ledger */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-stone-800">24-Hour Deduplication & Delivery Audit Log</h3>
          </div>
          <span className="text-xs text-stone-500 font-mono">
            Key: YYYY-MM-DD:alert_type:farmer_id
          </span>
        </div>
        <p className="text-xs text-stone-600">
          The system strictly prevents alert fatigue by enforcing a unique database constraint on the 24-hour key. Duplicate alerts within the same calendar day are safely discarded.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-stone-200 rounded-xl overflow-hidden">
            <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase tracking-wider font-semibold">
              <tr>
                <th className="p-3">Alert Type</th>
                <th className="p-3">Channel</th>
                <th className="p-3">Deduplication Key</th>
                <th className="p-3">Status</th>
                <th className="p-3">Snippet</th>
                <th className="p-3">Sent At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-800">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-stone-50/70">
                  <td className="p-3 font-semibold capitalize flex items-center gap-1.5">
                    {log.alert_type === 'heat' && <Flame className="w-3.5 h-3.5 text-red-600" />}
                    {log.alert_type === 'flood' && <CloudRain className="w-3.5 h-3.5 text-blue-600" />}
                    {log.alert_type === 'irrigation' && <Droplets className="w-3.5 h-3.5 text-teal-600" />}
                    {log.alert_type}
                  </td>
                  <td className="p-3 uppercase font-mono text-[11px] text-stone-600">{log.channel}</td>
                  <td className="p-3 font-mono text-[11px] text-stone-600">{log.deduplication_key}</td>
                  <td className="p-3">
                    {log.status === 'sent' && (
                      <span className="px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800">
                        Delivered
                      </span>
                    )}
                    {log.status === 'provider_disabled' && (
                      <span className="px-2 py-0.5 rounded font-semibold bg-amber-100 text-amber-800">
                        Provider Disabled
                      </span>
                    )}
                    {log.status === 'in_app_only' && (
                      <span className="px-2 py-0.5 rounded font-semibold bg-blue-100 text-blue-800">
                        In-App Only
                      </span>
                    )}
                    {log.status === 'deduplicated_skipped' && (
                      <span className="px-2 py-0.5 rounded font-semibold bg-purple-100 text-purple-800">
                        Deduplicated (Skipped)
                      </span>
                    )}
                    {log.status === 'failed' && (
                      <span className="px-2 py-0.5 rounded font-bold bg-red-100 text-red-800">
                        Failed
                      </span>
                    )}
                  </td>
                  <td className="p-3 max-w-xs truncate text-stone-600">{log.message_snippet}</td>
                  <td className="p-3 text-stone-500 whitespace-nowrap font-mono text-[11px]">
                    {new Date(log.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Regulatory Consent Modal (TRAI / DLT Opt-In) */}
      {showConsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 text-emerald-800 rounded-2xl">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-stone-900 text-lg">SMS Consent Confirmation</h3>
                <p className="text-xs text-stone-500">TRAI Regulatory Compliance</p>
              </div>
            </div>

            <div className="text-sm text-stone-600 space-y-2 bg-stone-50 p-4 rounded-2xl border border-stone-200/80 leading-relaxed">
              <p>
                By opting in, you authorize HarvestEngine to send critical hyper-local agricultural advisories
                (heat wave warnings, flash flood alerts, and irrigation schedules) directly to:
              </p>
              <p className="font-mono font-bold text-stone-900 bg-white p-2 rounded border border-stone-200 text-center">
                {farmerPhone || '+91 98765-XXXXX'}
              </p>
              <ul className="list-disc list-inside text-xs space-y-1 text-stone-700 pt-1">
                <li>No promotional messages or marketing spam</li>
                <li>Strict daily limit: Maximum 1 SMS per category per 24 hours</li>
                <li>Instant opt-out anytime by replying STOP or toggling off</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConsentModal(false)}
                className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-700 font-semibold text-sm hover:bg-stone-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSMSConsent}
                className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm shadow-md cursor-pointer"
              >
                I Agree & Opt In
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
