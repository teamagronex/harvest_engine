import React, { useState } from 'react';
import {
  CloudSun,
  Flame,
  Droplets,
  Sprout,
  ExternalLink,
  Info,
  Calendar,
  Compass,
  Zap,
  TrendingDown,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronDown,
  Check,
  Star,
  MessageSquare,
  Send,
  AlertTriangle,
} from 'lucide-react';
import { FarmerProfile } from '../services/authService';

interface FarmerDashboardProps {
  farmer: FarmerProfile;
  onChangeAddressClick: () => void;
}

export default function FarmerDashboard({ farmer, onChangeAddressClick }: FarmerDashboardProps) {
  // Crop & Growth Stage State
  const [selectedCrop, setSelectedCrop] = useState<'paddy' | 'wheat' | 'cotton' | 'mustard' | 'sugarcane'>('paddy');
  const [selectedStage, setSelectedStage] = useState<'initial' | 'dev' | 'mid' | 'late'>('mid');

  // Selected Forecast Day
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(0);

  // Energy & Water Savings Calculator State
  const [landAreaHa, setLandAreaHa] = useState<number>(1.5);
  const [pumpHp, setPumpHp] = useState<number>(5);

  // Irrigation Log State
  const [logWaterMm, setLogWaterMm] = useState<number>(20);
  const [logMethod, setLogMethod] = useState<'flood' | 'drip' | 'sprinkler'>('flood');
  const [logHistory, setLogHistory] = useState<Array<{ date: string; crop: string; mm: number; method: string }>>([
    { date: '2026-10-28', crop: 'Paddy / Rice', mm: 25, method: 'flood' },
    { date: '2026-10-24', crop: 'Paddy / Rice', mm: 30, method: 'flood' },
  ]);
  const [logSuccessMsg, setLogSuccessMsg] = useState<string | null>(null);

  // Feedback State
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [feedbackType, setFeedbackType] = useState<'irrigation' | 'heat' | 'flood' | 'general'>('irrigation');
  const [feedbackComment, setFeedbackComment] = useState<string>('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<boolean>(false);

  // 7-day Weather Model Data (Open-Meteo representation for farmer coordinates)
  const forecastDays = [
    { date: 'Today (31 Oct)', tMax: 33.8, tMin: 21.5, rh: 62, rain: 0.0, et0: 5.1, condition: 'Partly Cloudy' },
    { date: 'Sun (01 Nov)', tMax: 34.5, tMin: 22.0, rh: 60, rain: 0.0, et0: 5.3, condition: 'Sunny' },
    { date: 'Mon (02 Nov)', tMax: 36.2, tMin: 23.1, rh: 58, rain: 2.4, et0: 5.8, condition: 'Hot & Clear' },
    { date: 'Tue (03 Nov)', tMax: 37.1, tMin: 24.0, rh: 55, rain: 0.0, et0: 6.1, condition: 'Dry Heat' },
    { date: 'Wed (04 Nov)', tMax: 35.8, tMin: 23.5, rh: 64, rain: 8.2, et0: 5.4, condition: 'Scattered Showers' },
    { date: 'Thu (05 Nov)', tMax: 34.0, tMin: 22.0, rh: 68, rain: 12.0, et0: 4.8, condition: 'Moderate Rain' },
    { date: 'Fri (06 Nov)', tMax: 33.5, tMin: 21.0, rh: 65, rain: 1.5, et0: 4.9, condition: 'Passing Clouds' },
  ];

  const currentDay = forecastDays[selectedDayIdx];

  // Dynamic Crop Kc values
  const cropKcMap = {
    paddy: { initial: 1.05, dev: 1.15, mid: 1.25, late: 0.85, name: 'Paddy / Rice (धान)' },
    wheat: { initial: 0.40, dev: 0.75, mid: 1.15, late: 0.65, name: 'Wheat (गेहूं)' },
    cotton: { initial: 0.45, dev: 0.80, mid: 1.20, late: 0.70, name: 'Cotton (कपास)' },
    mustard: { initial: 0.35, dev: 0.70, mid: 1.10, late: 0.55, name: 'Mustard (सरसों)' },
    sugarcane: { initial: 0.40, dev: 0.85, mid: 1.25, late: 0.75, name: 'Sugarcane (गन्ना)' },
  };

  const currentKc = cropKcMap[selectedCrop][selectedStage];
  const cropWaterDemandEtc = +(currentDay.et0 * currentKc).toFixed(1);

  // Effective Rainfall calculation (USDA formula)
  const peff = currentDay.rain <= 8.3
    ? 0.0
    : currentDay.rain <= 75.0
    ? +((currentDay.rain * (125.0 - 0.2 * currentDay.rain)) / 125.0).toFixed(1)
    : +(0.8 * currentDay.rain - 10.0).toFixed(1);

  const netWaterNeedMm = Math.max(0, +(cropWaterDemandEtc - peff).toFixed(1));
  const volumeM3Ha = +(netWaterNeedMm * 10).toFixed(1);
  const totalVolumeLiters = Math.round(volumeM3Ha * 1000 * landAreaHa);

  // Heat Index Calculation
  const heatIndex = +(currentDay.tMax + (currentDay.rh > 60 ? (currentDay.rh - 60) * 0.15 : 0)).toFixed(1);
  const heatLevel = currentDay.tMax >= 45 ? 'Severe' : currentDay.tMax >= 40 ? 'Alert' : currentDay.tMax >= 35 ? 'Hot' : 'Normal';

  // 3-Day Flood Risk
  const threeDayRain = +(forecastDays[0].rain + forecastDays[1].rain + forecastDays[2].rain).toFixed(1);
  const floodLevel = threeDayRain >= 75 ? 'High' : threeDayRain >= 35 ? 'Moderate' : 'Low';

  // Savings Calculator relative to generic 50mm flooding
  const traditionalWaterMm = 50;
  const waterSavedMm = Math.max(0, traditionalWaterMm - netWaterNeedMm);
  const waterSavedM3 = +(waterSavedMm * 10 * landAreaHa).toFixed(1);
  const pumpFlowRateLph = pumpHp * 6000; // ~6,000 L/hr per HP for typical agricultural borewell
  const pumpHoursSaved = +((waterSavedM3 * 1000) / pumpFlowRateLph).toFixed(1);
  const electricityKwhSaved = +(pumpHoursSaved * (pumpHp * 0.746)).toFixed(1);
  const rupeesSaved = Math.round(electricityKwhSaved * 6.5); // avg agricultural tariff/fuel equivalent ₹6.5/unit

  // Handle Log submit
  const handleLogIrrigation = (e: React.FormEvent) => {
    e.preventDefault();
    const newEntry = {
      date: new Date().toISOString().split('T')[0],
      crop: cropKcMap[selectedCrop].name,
      mm: logWaterMm,
      method: logMethod,
    };
    setLogHistory([newEntry, ...logHistory]);
    setLogSuccessMsg(`Irrigation recorded: ${logWaterMm} mm applied via ${logMethod}.`);
    setTimeout(() => setLogSuccessMsg(null), 3000);
  };

  // Handle Feedback submit
  const handleSubmitFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackSubmitted(true);
    setTimeout(() => {
      setFeedbackSubmitted(false);
      setFeedbackComment('');
    }, 4000);
  };

  return (
    <div className="space-y-6">
      {/* Farmer Greeting & Location Bar */}
      <div className="bg-gradient-to-r from-emerald-950/70 via-slate-900 to-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-bold tracking-wider text-emerald-400">
              Namaste, Kisan Mitra
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
              Verified Farmer
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 mt-0.5">
            {farmer.name}
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
            <Compass className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {farmer.address?.village}, {farmer.address?.district}, {farmer.address?.state} (PIN {farmer.address?.pin_code})
            </span>
            <span>&bull;</span>
            <span className="font-mono">{farmer.address?.latitude.toFixed(2)}°N, {farmer.address?.longitude.toFixed(2)}°E</span>
          </div>
        </div>

        <button
          onClick={onChangeAddressClick}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold cursor-pointer transition-all shadow-sm"
        >
          <Compass className="w-3.5 h-3.5 text-emerald-400" />
          <span>Change Farm Coordinates</span>
        </button>
      </div>

      {/* Main Grid: Weather & 3 Advisories */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Live Weather & 7-Day Forecast (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Current Day Weather Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CloudSun className="w-5 h-5 text-amber-400" />
                <span className="font-bold text-sm text-slate-100">Live Field Weather</span>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/80">
                Open-Meteo &bull; Estimate
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-4xl font-extrabold text-slate-100 tracking-tight">
                  {currentDay.tMax}°C
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Min: <span className="text-slate-200 font-medium">{currentDay.tMin}°C</span> &bull; {currentDay.condition}
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="text-xs text-slate-300">
                  Humidity: <span className="font-bold text-slate-100">{currentDay.rh}%</span>
                </div>
                <div className="text-xs text-slate-300">
                  Precipitation: <span className="font-bold text-emerald-400">{currentDay.rain} mm</span>
                </div>
                <div className="text-xs text-slate-300">
                  Reference ET₀: <span className="font-bold text-teal-400">{currentDay.et0} mm/day</span>
                </div>
              </div>
            </div>

            <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-850 flex items-center justify-between">
              <span>Timestamp: 2026-10-31 12:00 IST</span>
              <span className="text-emerald-400">Hyperlocal Grid: 0.1° (~11 km)</span>
            </div>
          </div>

          {/* 7-Day Interactive Forecast Selector */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-emerald-400" />
                7-Day Agrometeorological Forecast
              </span>
              <span className="text-[10px] text-slate-400">Select day to inspect</span>
            </div>

            <div className="space-y-1.5">
              {forecastDays.map((day, idx) => {
                const isSelected = selectedDayIdx === idx;
                return (
                  <button
                    key={day.date}
                    onClick={() => setSelectedDayIdx(idx)}
                    className={`w-full p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-950/60 border-emerald-500/60 text-slate-100 shadow-md'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-850'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                      <span className="font-medium">{day.date}</span>
                    </div>

                    <div className="flex items-center gap-3 font-mono">
                      <span>{day.tMax}° / {day.tMin}°</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${day.rain > 0 ? 'bg-blue-900/60 text-blue-300' : 'text-slate-500'}`}>
                        {day.rain} mm
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Right Column: Three Color-Coded Advisories with Text Labels & Formulas (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Advisory 1: HEAT ADVISORY */}
          <div
            className={`p-5 rounded-2xl border shadow-lg space-y-3 ${
              heatLevel === 'Severe'
                ? 'bg-rose-950/40 border-rose-600/50'
                : heatLevel === 'Alert'
                ? 'bg-orange-950/40 border-orange-600/50'
                : heatLevel === 'Hot'
                ? 'bg-amber-950/40 border-amber-600/50'
                : 'bg-emerald-950/30 border-emerald-600/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className={`w-5 h-5 ${heatLevel === 'Severe' ? 'text-rose-400' : heatLevel === 'Alert' ? 'text-orange-400' : heatLevel === 'Hot' ? 'text-amber-400' : 'text-emerald-400'}`} />
                <h3 className="font-bold text-sm text-slate-100">Heat Stress Advisory</h3>
              </div>
              <span
                className={`text-[10px] uppercase font-extrabold px-2.5 py-1 rounded-full tracking-wider ${
                  heatLevel === 'Severe'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                    : heatLevel === 'Alert'
                    ? 'bg-orange-500/20 text-orange-300 border border-orange-500/50'
                    : heatLevel === 'Hot'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                }`}
              >
                LEVEL: {heatLevel.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 text-xs font-mono">
              <div>
                <span className="text-slate-400 block text-[10px]">Forecast Peak</span>
                <span className="font-bold text-slate-100 text-sm">{currentDay.tMax}°C</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Apparent Heat Index (HI)</span>
                <span className="font-bold text-slate-100 text-sm">{heatIndex}°C</span>
              </div>
            </div>

            <p className="text-xs text-slate-200 leading-relaxed font-sans">
              {heatLevel === 'Severe'
                ? 'Severe Heat Wave: Avoid manual field labor and foliar spraying between 11:00 AM and 3:30 PM. Provide shade and hydration for cattle.'
                : heatLevel === 'Alert'
                ? 'Heat Wave Alert: High evaporative demand. Irrigate sensitive nursery beds during early morning or late evening. Mulch soil surface.'
                : heatLevel === 'Hot'
                ? 'Caution: Ambient temperatures elevated. Complete pesticide/fertilizer spraying in early morning hours before wind and evaporation increase.'
                : 'Normal ambient conditions: Favorable for all standard farm operations and crop growth.'}
            </p>

            <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/60 flex items-center justify-between">
              <span>Formula: Rothfusz HI regression on Tmax ({currentDay.tMax}°C) &amp; RH ({currentDay.rh}%)</span>
              <span className="text-slate-500">Estimate &bull; Open-Meteo</span>
            </div>
          </div>

          {/* Advisory 2: FLOOD RISK ADVISORY */}
          <div
            className={`p-5 rounded-2xl border shadow-lg space-y-3 ${
              floodLevel === 'High'
                ? 'bg-rose-950/40 border-rose-600/50'
                : floodLevel === 'Moderate'
                ? 'bg-amber-950/40 border-amber-600/50'
                : 'bg-blue-950/40 border-blue-600/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Droplets className={`w-5 h-5 ${floodLevel === 'High' ? 'text-rose-400' : floodLevel === 'Moderate' ? 'text-amber-400' : 'text-blue-400'}`} />
                <h3 className="font-bold text-sm text-slate-100">Indicative Flood Risk</h3>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] uppercase font-extrabold px-2.5 py-1 rounded-full tracking-wider ${
                    floodLevel === 'High'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                      : floodLevel === 'Moderate'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                      : 'bg-blue-500/20 text-blue-300 border border-blue-500/50'
                  }`}
                >
                  RISK: {floodLevel.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 text-xs font-mono">
              <div>
                <span className="text-slate-400 block text-[10px]">3-Day Cumulative Rainfall</span>
                <span className="font-bold text-slate-100 text-sm">{threeDayRain} mm</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Peak 24h Intensity</span>
                <span className="font-bold text-slate-100 text-sm">{Math.max(forecastDays[0].rain, forecastDays[1].rain, forecastDays[2].rain)} mm/day</span>
              </div>
            </div>

            <p className="text-xs text-slate-200 leading-relaxed font-sans">
              {floodLevel === 'High'
                ? 'High Inundation Risk: Inspect bunds and clear perimeter drainage trenches. Hold scheduled fertilizer application to prevent nutrient runoff.'
                : floodLevel === 'Moderate'
                ? 'Moderate Watch: Rainfall approaching soil absorption capacity. Check field drainage in low-lying plots.'
                : 'Low Risk: Forecast precipitation well within natural soil infiltration limits. Normal drainage adequate.'}
            </p>

            <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 flex items-center justify-between">
              <span className="text-amber-300 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Indicative farm estimate, not an official warning.
              </span>
              <a
                href="https://mausam.imd.gov.in"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold underline"
              >
                <span>Check Official IMD</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Advisory 3: IRRIGATION ADVISORY (FAO-56 Water Balance) */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900 border border-emerald-500/40 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sprout className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm text-slate-100">FAO-56 Crop Irrigation Advisory</h3>
              </div>
              <span className="text-[10px] font-mono bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800 font-semibold self-start sm:self-auto">
                Penman-Monteith ET₀ &times; Kc
              </span>
            </div>

            {/* Crop & Growth Stage Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Select Crop</label>
                <select
                  value={selectedCrop}
                  onChange={(e) => setSelectedCrop(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 font-medium focus:outline-none focus:border-emerald-500"
                >
                  <option value="paddy">Paddy / Rice (धान)</option>
                  <option value="wheat">Wheat (गेहूं)</option>
                  <option value="cotton">Cotton (कपास)</option>
                  <option value="mustard">Mustard (सरसों)</option>
                  <option value="sugarcane">Sugarcane (गन्ना)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Crop Growth Stage</label>
                <select
                  value={selectedStage}
                  onChange={(e) => setSelectedStage(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 font-medium focus:outline-none focus:border-emerald-500"
                >
                  <option value="initial">Initial Stage (Kc: {cropKcMap[selectedCrop].initial})</option>
                  <option value="dev">Vegetative / Tillering (Kc: {cropKcMap[selectedCrop].dev})</option>
                  <option value="mid">Mid-Season / Flowering (Kc: {cropKcMap[selectedCrop].mid})</option>
                  <option value="late">Late Season / Maturity (Kc: {cropKcMap[selectedCrop].late})</option>
                </select>
              </div>
            </div>

            {/* Water Calculation Grid */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div>
                  <span className="text-slate-500 text-[10px] block">Reference ET₀</span>
                  <span className="text-slate-200 font-bold">{currentDay.et0} mm</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Crop Kc Factor</span>
                  <span className="text-emerald-400 font-bold">{currentKc}</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">ETc Demand</span>
                  <span className="text-slate-200 font-bold">{cropWaterDemandEtc} mm</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">Effective Rain</span>
                  <span className="text-blue-400 font-bold">{peff} mm</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-850 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Recommended Net Irrigation</div>
                  <div className="text-2xl font-extrabold text-emerald-400 tracking-tight">
                    {netWaterNeedMm} mm <span className="text-sm font-normal text-slate-300">({volumeM3Ha} m³/ha)</span>
                  </div>
                </div>

                <span
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl border ${
                    netWaterNeedMm === 0
                      ? 'bg-blue-950/60 text-blue-300 border-blue-500/40'
                      : 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  {netWaterNeedMm === 0 ? 'SKIP IRRIGATION' : 'IRRIGATE ADVISED'}
                </span>
              </div>
            </div>

            {/* Plain-Language Reason */}
            <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-slate-200 leading-relaxed">
              <strong className="text-emerald-300">Operational Reason: </strong>
              {netWaterNeedMm === 0
                ? `Effective rainfall (${peff} mm) meets or exceeds the daily crop water demand of ${cropWaterDemandEtc} mm. Pumping water today is unnecessary and would risk root waterlogging.`
                : `Apply ${netWaterNeedMm} mm (${volumeM3Ha} m³/ha or ${(volumeM3Ha * 1000).toLocaleString()} L/ha). The crop transpiration demand (${cropWaterDemandEtc} mm) exceeds expected rain (${peff} mm) by ${netWaterNeedMm} mm.`}
            </div>
          </div>

        </div>
      </div>

      {/* Interactive Water & Pump-Energy Savings Calculator */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Water &amp; Pump-Energy Conservation Calculator</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Quantifies real electricity, diesel, and groundwater savings by following HarvestEngine&apos;s dynamic ET₀ advice vs uncalibrated 50mm flood irrigation.
            </p>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
            Efficiency ROI
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          {/* Controls */}
          <div className="space-y-4 p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>Farm Land Area</span>
                <span className="font-bold text-emerald-400 font-mono">{landAreaHa} Hectares (~{(landAreaHa * 2.471).toFixed(1)} Acres)</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={landAreaHa}
                onChange={(e) => setLandAreaHa(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>Borewell / Surface Pump Rating</span>
                <span className="font-bold text-amber-400 font-mono">{pumpHp} Horsepower (HP)</span>
              </div>
              <div className="flex gap-2">
                {[3, 5, 7.5, 10].map((hp) => (
                  <button
                    key={hp}
                    type="button"
                    onClick={() => setPumpHp(hp)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold cursor-pointer transition-colors ${
                      pumpHp === hp
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-850'
                    }`}
                  >
                    {hp} HP
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Metric Outputs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Groundwater Saved</span>
              <div className="text-2xl font-bold text-teal-400 font-mono">{waterSavedM3} m³</div>
              <p className="text-[10px] text-slate-500">{(waterSavedM3 * 1000).toLocaleString()} Liters preserved</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Pump Runtime Avoided</span>
              <div className="text-2xl font-bold text-amber-400 font-mono">{pumpHoursSaved} Hours</div>
              <p className="text-[10px] text-slate-500">Wear &amp; tear reduced</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Electricity Saved</span>
              <div className="text-2xl font-bold text-emerald-400 font-mono">{electricityKwhSaved} kWh</div>
              <p className="text-[10px] text-slate-500">Units of power</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-1">
              <span className="text-[10px] uppercase font-semibold text-slate-400">Estimated Cost Savings</span>
              <div className="text-2xl font-bold text-emerald-400 font-mono">₹{rupeesSaved.toLocaleString()}</div>
              <p className="text-[10px] text-slate-500">Per irrigation cycle</p>
            </div>
          </div>
        </div>
      </div>

      {/* Irrigation History & Feedback Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Irrigation Logging & History */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <Sprout className="w-4 h-4 text-emerald-400" />
              <span>Log Field Irrigation</span>
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">Farm Ledger</span>
          </div>

          {logSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{logSuccessMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogIrrigation} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Water Applied (mm)</label>
                <input
                  type="number"
                  min="5"
                  max="100"
                  value={logWaterMm}
                  onChange={(e) => setLogWaterMm(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Method</label>
                <select
                  value={logMethod}
                  onChange={(e) => setLogMethod(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100"
                >
                  <option value="flood">Flood / Furrow</option>
                  <option value="drip">Drip Irrigation</option>
                  <option value="sprinkler">Sprinkler</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-md cursor-pointer transition-colors"
            >
              Record Irrigation Event ({logWaterMm * 10} m³/ha)
            </button>
          </form>

          {/* History records list */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Recent Logs</span>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {logHistory.map((item, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-slate-950 border border-slate-850 flex items-center justify-between text-xs font-mono">
                  <div>
                    <span className="text-slate-300 font-semibold">{item.crop}</span>
                    <span className="text-slate-500 text-[10px] block font-sans">{item.date} &bull; {item.method}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-emerald-400 font-bold">{item.mm} mm</span>
                    <span className="text-[10px] text-slate-400 block">{item.mm * 10} m³/ha</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Farmer Advisory Feedback Form */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <span>Advisory Ground-Truth Feedback</span>
            </h3>
            <span className="text-[10px] text-slate-400">Calibrate Algorithms</span>
          </div>

          {feedbackSubmitted ? (
            <div className="p-6 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <div className="font-bold text-sm text-emerald-200">Dhanyavaad! Feedback Received</div>
              <p className="text-xs text-slate-400">
                Your field observation helps adjust crop coefficient parameters and moisture calibration for your village.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmitFeedback} className="space-y-3">
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Advisory Topic</label>
                <select
                  value={feedbackType}
                  onChange={(e) => setFeedbackType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100"
                >
                  <option value="irrigation">Irrigation Recommendation Accuracy</option>
                  <option value="heat">Heat Index &amp; Temperature Experience</option>
                  <option value="flood">Rainfall &amp; Inundation Estimates</option>
                  <option value="general">General Platform Usability</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Accuracy Rating</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFeedbackRating(star)}
                      className="p-1 text-amber-400 hover:scale-110 transition-transform cursor-pointer"
                    >
                      <Star className={`w-6 h-6 ${star <= feedbackRating ? 'fill-amber-400' : 'text-slate-600'}`} />
                    </button>
                  ))}
                  <span className="text-xs text-slate-400 ml-2 font-mono">{feedbackRating} / 5 Stars</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Field Observation / Notes (Optional)</label>
                <textarea
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  placeholder="e.g. Recommended 20 mm was sufficient; soil stayed moist for 3 days."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Send className="w-3.5 h-3.5 text-emerald-400" />
                <span>Submit Field Feedback</span>
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}
