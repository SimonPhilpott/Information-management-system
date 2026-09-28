import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Droplets, RotateCw, Sparkles, ChevronLeft, ChevronRight, Plus, Trash2, AlertTriangle,
  Moon, Database, ExternalLink, Eraser, Camera, Loader2, X, Check, Sliders, Activity,
  TrendingUp, TrendingDown, Clock, Save, RotateCcw, AlertCircle, CheckCircle2
} from 'lucide-react';

const MONGO_URL = 'https://cloud.mongodb.com/v2/5fabc4b4fcf8b709ce8ab13c#/explorer/6542751e47463e28ff4eeb80';
const NIGHTSCOUT_URL = 'https://simon-philpott-nightscout.herokuapp.com';
const HEROKU_SETTINGS_URL = 'https://dashboard.heroku.com/apps/simon-philpott-nightscout/settings';
import PortalShell from './PortalShell';
import PhotoCarbs from './PhotoCarbs';
import Prose from './Prose';

const PERIODS = [{ key: 1, label: '24 h' }, { key: 7, label: '7 days' }, { key: 14, label: '14 days' }, { key: 30, label: '30 days' }];
const ARROWS = { DoubleUp: '⇈', SingleUp: '↑', FortyFiveUp: '↗', Flat: '→', FortyFiveDown: '↘', SingleDown: '↓', DoubleDown: '⇊' };
const LOW = 3.9, HIGH = 10;
const colourOf = (v) => (v == null ? 'text-slate-400' : v < 3 ? 'text-red-500' : v < LOW ? 'text-red-400' : v <= HIGH ? 'text-emerald-400' : v <= 13.9 ? 'text-amber-400' : 'text-orange-500');
const fillOf = (v) => (v < 3 ? '#ef4444' : v < LOW ? '#f87171' : v <= HIGH ? '#34d399' : v <= 13.9 ? '#fbbf24' : '#f97316');
const hhmm = (t) => new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const shiftDay = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dayLabel = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

function TirBar({ s }) {
  const parts = [
    ['Very low <3.0', s.veryLowPct, '#ef4444'], ['Low 3.0-3.9', s.lowPct, '#f87171'], ['In range 3.9-10', s.inRangePct, '#34d399'],
    ['High 10-13.9', s.highPct, '#fbbf24'], ['Very high >13.9', s.veryHighPct, '#f97316'],
  ];
  return (
    <div>
      <div className="flex h-5 rounded-lg overflow-hidden">
        {parts.map(([k, v, c]) => v > 0 && <div key={k} style={{ width: `${v}%`, background: c }} title={`${k}: ${v}%`} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {parts.map(([k, v, c]) => (
          <span key={k} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: c }} />{k}: <b className="tabular-nums">{v}%</b></span>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Goals: over 70% in range, under 4% below 3.9, under 1% below 3.0.</p>
    </div>
  );
}

// One day: readings against the 3.9-10 band, with activities, insulin and carbs marked. Tap for a reading.
function DayChart({ data, isDark }) {
  const [pick, setPick] = useState(null);
  const W = 720, H = 220, L = 30, R = 8, T = 10, B = 24;
  const maxV = Math.max(15, ...data.readings.map((r) => r.v + 1));
  const x = (t) => L + ((t - data.from) / (data.to - data.from)) * (W - L - R);
  const y = (v) => T + (1 - v / maxV) * (H - T - B);
  const pts = data.readings;
  const grid = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const onPoint = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const t = data.from + ((px - L) / (W - L - R)) * (data.to - data.from);
    let best = null;
    for (const r of pts) if (!best || Math.abs(r.t - t) < Math.abs(best.t - t)) best = r;
    setPick(best && Math.abs(best.t - t) < 30 * 60000 ? best : null);
  };
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" onPointerDown={onPoint} onPointerMove={(e) => e.buttons && onPoint(e)}>
        <rect x={L} y={y(HIGH)} width={W - L - R} height={y(LOW) - y(HIGH)} fill="rgba(52,211,153,0.10)" />
        {[3.9, 10, 15].filter((v) => v <= maxV).map((v) => (
          <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={grid} strokeDasharray="3 3" /><text x={L - 4} y={y(v) + 3} fontSize="9" textAnchor="end" fill="#94a3b8">{v}</text></g>
        ))}
        {[0, 6, 12, 18, 24].map((h) => (
          <text key={h} x={L + (h / 24) * (W - L - R)} y={H - 6} fontSize="9" textAnchor="middle" fill="#94a3b8">{String(h % 24).padStart(2, '0')}:00</text>
        ))}
        {data.activities.map((a) => (
          <g key={a.id}><rect x={x(Math.max(a.start, data.from))} y={T} width={Math.max(2, x(Math.min(a.end, data.to)) - x(Math.max(a.start, data.from)))} height={H - T - B} fill="rgba(249,115,22,0.15)" />
            <text x={x(Math.max(a.start, data.from)) + 2} y={T + 10} fontSize="9" fill="#f97316">{a.sport}</text></g>
        ))}
        {pts.map((r, i) => i > 0 && r.t - pts[i - 1].t < 15 * 60000 && (
          <line key={r.t} x1={x(pts[i - 1].t)} y1={y(pts[i - 1].v)} x2={x(r.t)} y2={y(r.v)} stroke={fillOf(r.v)} strokeWidth="2" strokeLinecap="round" />
        ))}
        {data.treatments.filter((t) => t.insulin > 0).map((t) => (
          <g key={`i${t.at}`}><path d={`M${x(t.at) - 4},${H - B - 2} L${x(t.at) + 4},${H - B - 2} L${x(t.at)},${H - B - 10} Z`} fill="#60a5fa" /><title>{`${t.insulin} u at ${hhmm(t.at)}`}</title></g>
        ))}
        {[...data.treatments.filter((t) => t.carbs > 0).map((t) => ({ at: t.at, g: t.carbs })), ...data.carbs.map((c) => ({ at: c.at, g: c.grams }))].map((c) => (
          <g key={`c${c.at}`}><circle cx={x(c.at)} cy={T + 22} r="4" fill="#facc15" /><text x={x(c.at)} y={T + 36} fontSize="9" textAnchor="middle" fill="#facc15">{Math.round(c.g)}g</text></g>
        ))}
        {pick && (
          <g><line x1={x(pick.t)} x2={x(pick.t)} y1={T} y2={H - B} stroke="#94a3b8" strokeDasharray="2 2" /><circle cx={x(pick.t)} cy={y(pick.v)} r="4" fill={fillOf(pick.v)} /></g>
        )}
      </svg>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 mt-1">
        {pick ? <span className="font-bold text-sm text-inherit"><span className={colourOf(pick.v)}>{pick.v} mmol/L</span> at {hhmm(pick.t)} {ARROWS[pick.direction] || ''}</span> : <span>Tap the chart to see a reading.</span>}
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#facc15]" />carbs</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[#60a5fa]" />bolus</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-orange-500/40" />activity</span>
      </div>
    </div>
  );
}

// Median and spread for each hour of the day across the period.
function Profile({ profile, isDark }) {
  const W = 720, H = 180, L = 30, R = 8, T = 8, B = 22, maxV = 15;
  const pts = profile.filter((p) => p.median != null);
  if (pts.length < 4) return <p className="text-xs text-slate-500">Needs a few more days of readings to draw your typical day.</p>;
  const x = (h) => L + ((h + 0.5) / 24) * (W - L - R);
  const y = (v) => T + (1 - Math.min(v, maxV) / maxV) * (H - T - B);
  const band = (lo, hi) => pts.map((p) => `${x(p.hour)},${y(p[hi])}`).join(' ') + ' ' + [...pts].reverse().map((p) => `${x(p.hour)},${y(p[lo])}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <rect x={L} y={y(HIGH)} width={W - L - R} height={y(LOW) - y(HIGH)} fill="rgba(52,211,153,0.10)" />
      {[3.9, 10].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'} strokeDasharray="3 3" /><text x={L - 4} y={y(v) + 3} fontSize="9" textAnchor="end" fill="#94a3b8">{v}</text></g>)}
      <polygon points={band('p10', 'p90')} fill="rgba(96,165,250,0.15)" />
      <polygon points={band('p25', 'p75')} fill="rgba(96,165,250,0.30)" />
      <polyline points={pts.map((p) => `${x(p.hour)},${y(p.median)}`).join(' ')} fill="none" stroke="#60a5fa" strokeWidth="2" />
      {[0, 6, 12, 18].map((h) => <text key={h} x={L + (h / 24) * (W - L - R)} y={H - 6} fontSize="9" fill="#94a3b8">{String(h).padStart(2, '0')}:00</text>)}
    </svg>
  );
}

// Visual Step-Line SVG representing pump schedule across 24h
function ProfileStepChart({ items = [], maxVal = 2.0, unit = 'U/h', isDark = true, highlightAfternoon = false }) {
  const W = 680, H = 130, L = 36, R = 12, T = 12, B = 22;
  const grid = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  // Build 24 hour points array
  const sorted = [...items].sort((a, b) => a.time.localeCompare(b.time));
  const hourly = [];
  for (let h = 0; h < 24; h++) {
    let val = sorted[0]?.value || 0;
    for (const item of sorted) {
      const ih = parseInt(item.time.split(':')[0], 10);
      if (ih <= h) val = Number(item.value) || 0;
      else break;
    }
    hourly.push({ h, val });
  }

  const x = (h) => L + (h / 24) * (W - L - R);
  const y = (v) => T + (1 - Math.min(maxVal, Math.max(0, v)) / maxVal) * (H - T - B);

  // Build step path
  let pathD = `M ${x(0)} ${y(hourly[0].val)}`;
  for (let h = 0; h < 24; h++) {
    const curVal = hourly[h].val;
    const nextH = h + 1;
    pathD += ` L ${x(nextH)} ${y(curVal)}`;
    if (nextH < 24) {
      pathD += ` L ${x(nextH)} ${y(hourly[nextH].val)}`;
    }
  }

  const yTicks = [0, maxVal * 0.5, maxVal].map((v) => Math.round(v * 10) / 10);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none">
      {/* 12pm - 4pm focus window shading */}
      {highlightAfternoon && (
        <rect x={x(12)} y={T} width={x(16) - x(12)} height={H - T - B} fill="rgba(56,189,248,0.12)" rx={2} />
      )}
      {/* Grid lines */}
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={grid} strokeDasharray="2 2" />
          <text x={L - 4} y={y(v) + 3} fontSize="9" textAnchor="end" fill="#94a3b8">{v}</text>
        </g>
      ))}
      {[0, 6, 12, 18, 24].map((h) => (
        <text key={h} x={x(h)} y={H - 6} fontSize="9" textAnchor="middle" fill="#94a3b8">{String(h % 24).padStart(2, '0')}:00</text>
      ))}
      {highlightAfternoon && (
        <text x={x(14)} y={T + 12} fontSize="9" textAnchor="middle" fill="#38bdf8" fontWeight="bold">12:00 - 16:00 Focus</text>
      )}
      <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function GlucosePortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [days, setDays] = useState(14);
  const [summary, setSummary] = useState(null);
  const [day, setDay] = useState(todayStr());
  const [dayData, setDayData] = useState(null);
  const [carbs, setCarbs] = useState([]);
  const [carbForm, setCarbForm] = useState({ grams: '', food: '' });
  const [nsWrite, setNsWrite] = useState(null);
  const [nsSecret, setNsSecret] = useState('');
  const [dbSize, setDbSize] = useState(null);
  const [showConnect, setShowConnect] = useState(false);
  const [autoClear, setAutoClear] = useState(null);
  const [busy, setBusy] = useState('');
  const [notification, setNotification] = useState(null);

  // Profile Insights & Fine-Tuning State
  const [profile, setProfile] = useState(null);
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileTab, setProfileTab] = useState('BAS'); // 'BAS' | 'IC' | 'ISF'
  const [evalDays, setEvalDays] = useState(14);
  const [evalData, setEvalData] = useState(null);
  const [evalBusy, setEvalBusy] = useState(false);

  const notify = (msg, type = 'success') => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3500); };
  const panel = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const field = `px-3 py-2 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10' : 'bg-white border-[#2E2B27]/10'}`;
  const gradient = 'from-rose-500 to-red-600';

  const load = useCallback(async () => {
    const d = await (await fetch(`/api/glucose-hub/summary?days=${days}`)).json();
    if (d.success) setSummary(d);
  }, [days]);
  const loadDay = useCallback(async () => {
    const d = await (await fetch(`/api/glucose-hub/day?date=${day}`)).json();
    if (d.success) setDayData(d);
  }, [day]);
  const loadCarbs = useCallback(async () => {
    const d = await (await fetch('/api/glucose-hub/carbs?days=7')).json();
    if (d.success) setCarbs(d.carbs);
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const res = await (await fetch('/api/glucose-hub/profile')).json();
      if (res.success && res.profile) {
        setProfile(res.profile);
        setProfileDirty(false);
      }
    } catch (err) {
      console.error('[GlucosePortal] Failed to load profile:', err);
    }
  }, []);

  const loadEvaluation = useCallback(async () => {
    try {
      const res = await (await fetch('/api/glucose-hub/profile/evaluation')).json();
      if (res.success && res.evaluation) {
        setEvalData(res.evaluation);
      }
    } catch (err) {
      console.error('[GlucosePortal] Failed to load evaluation:', err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadDay(); }, [loadDay]);
  useEffect(() => { loadCarbs(); }, [loadCarbs]);
  useEffect(() => { loadProfile(); }, [loadProfile]);
  useEffect(() => { loadEvaluation(); }, [loadEvaluation]);
  useEffect(() => { fetch('/api/glucose-hub/nightscout').then((r) => r.json()).then((d) => { if (d.success) { setNsWrite(d.configured); setDbSize(d.dbSize); setAutoClear(d.autoClear); } }).catch(() => {}); }, []);
  useEffect(() => { const t = setInterval(() => { load(); if (day === todayStr()) loadDay(); }, 60000); return () => clearInterval(t); }, [load, loadDay, day]);

  const addCarbs = async () => {
    const res = await fetch('/api/glucose-hub/carbs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(carbForm) });
    const d = await res.json();
    if (!d.success) return notify(d.error, 'error');
    setCarbForm({ grams: '', food: '' }); loadCarbs(); loadDay(); notify('Carbs logged.');
  };
  const saveNsSecret = async (secret) => {
    setBusy('ns');
    try {
      const d = await (await fetch('/api/glucose-hub/nightscout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret }) })).json();
      if (!d.success) throw new Error(d.error);
      setNsWrite(d.configured); setNsSecret('');
      notify(d.configured ? 'Nightscout accepted the secret - carbs will be sent there.' : 'Removed - carbs stay in IMS only.');
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(''); }
  };
  const toggleAutoClear = async (enabled) => {
    const d = await (await fetch('/api/glucose-hub/nightscout/auto-clear', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) })).json();
    if (d.success) { setAutoClear(d.autoClear); notify(enabled ? 'Auto-clear on: at 95% full, records older than 3 months are cleared.' : 'Auto-clear off.'); }
  };
  const clearOld = async () => {
    if (!window.confirm('Delete every Nightscout record (glucose readings, treatments and AAPS device status) older than 3 months?\n\nThis cannot be undone in Nightscout. IMS keeps its own copy, so your charts here are not affected.')) return;
    setBusy('cleanup');
    try {
      const d = await (await fetch('/api/glucose-hub/nightscout/cleanup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ months: 3 }) })).json();
      if (!d.success) throw new Error(d.error);
      if (d.dbSize) setDbSize(d.dbSize);
      const failed = d.results.filter((r) => !r.ok);
      const counts = d.results.filter((r) => r.ok && r.deleted != null).map((r) => `${r.deleted} ${r.label}`).join(', ');
      notify(failed.length ? `Some deletes failed: ${failed.map((r) => r.label).join(', ')}` : `Cleared records older than 3 months${counts ? ` (${counts})` : ''}.`, failed.length ? 'error' : 'success');
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(''); }
  };
  const dbColour = (p) => (p == null ? 'text-slate-500' : p <= 70 ? 'text-emerald-500' : p <= 90 ? 'text-orange-500' : 'text-red-500');
  const delCarbs = async (id) => { await fetch(`/api/glucose-hub/carbs/${id}`, { method: 'DELETE' }); loadCarbs(); loadDay(); };
  const analyse = async () => {
    setBusy('insight');
    try {
      const d = await (await fetch('/api/glucose-hub/insight', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days }) })).json();
      if (!d.success) throw new Error(d.error);
      setSummary((s) => ({ ...s, insight: d.insight }));
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(''); }
  };

  // --- Profile Fine-Tuning Actions ---
  const adjustBasal = (index, delta) => {
    if (!profile?.basal) return;
    const nextBasal = [...profile.basal];
    const curVal = Number(nextBasal[index].value) || 0;
    const newVal = Math.max(0.05, Math.round((curVal + delta) * 100) / 100);
    nextBasal[index] = { ...nextBasal[index], value: newVal };
    setProfile({ ...profile, basal: nextBasal });
    setProfileDirty(true);
  };

  const adjustIC = (index, delta) => {
    if (!profile?.ic) return;
    const nextIC = [...profile.ic];
    const curVal = Number(nextIC[index].value) || 0;
    const newVal = Math.max(2.0, Math.round((curVal + delta) * 10) / 10);
    nextIC[index] = { ...nextIC[index], value: newVal };
    setProfile({ ...profile, ic: nextIC });
    setProfileDirty(true);
  };

  const adjustISF = (index, delta) => {
    if (!profile?.isf) return;
    const nextISF = [...profile.isf];
    const curVal = Number(nextISF[index].value) || 0;
    const newVal = Math.max(0.5, Math.round((curVal + delta) * 10) / 10);
    nextISF[index] = { ...nextISF[index], value: newVal };
    setProfile({ ...profile, isf: nextISF });
    setProfileDirty(true);
  };

  const saveActiveProfile = async () => {
    if (!profile) return;
    try {
      const res = await (await fetch('/api/glucose-hub/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      })).json();
      if (!res.success) throw new Error(res.error);
      setProfile(res.profile);
      setProfileDirty(false);
      notify('Profile saved.');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const resetActiveProfile = async () => {
    if (!window.confirm('Reset fine-tuned profile back to baseline 20u Standard Day?')) return;
    try {
      const res = await (await fetch('/api/glucose-hub/profile/reset', { method: 'POST' })).json();
      if (!res.success) throw new Error(res.error);
      setProfile(res.profile);
      setProfileDirty(false);
      notify('Profile reset to 20u Standard Day baseline.');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const runProfileEvaluation = async () => {
    setEvalBusy(true);
    try {
      const res = await (await fetch('/api/glucose-hub/profile/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: evalDays, profile })
      })).json();
      if (!res.success) throw new Error(res.error);
      setEvalData(res.evaluation);
      notify(`Profile evaluated over ${evalDays} days of data.`);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setEvalBusy(false);
    }
  };

  // Compute daily basal sum
  const totalBasal = useMemo(() => {
    if (!profile?.basal) return 20.75;
    const sorted = [...profile.basal].sort((a, b) => a.time.localeCompare(b.time));
    let total = 0;
    for (let h = 0; h < 24; h++) {
      let val = sorted[0]?.value || 0.5;
      for (const b of sorted) {
        const bh = parseInt(b.time.split(':')[0], 10);
        if (bh <= h) val = b.value;
        else break;
      }
      total += val;
    }
    return Math.round(total * 100) / 100;
  }, [profile?.basal]);

  const cur = summary?.current;
  const s = summary?.stats, p = summary?.previous;
  const earlyDays = summary?.dataSince ? (Date.now() - summary.dataSince) / 86400000 : null;
  const cmp = (a, b, better) => (a == null || b == null || a === b ? null : (better === 'up' ? a > b : a < b) ? 'better' : 'worse');
  const chips = useMemo(() => (s ? [
    ['Average', `${s.mean} mmol/L`, cmp(Math.abs(s.mean - 7), p && Math.abs(p.mean - 7), 'down')],
    ['Estimated HbA1c (GMI)', `${s.gmiPct}%`, null],
    ['Variability (CV)', `${s.cvPct}%`, s.cvPct <= 36 ? 'better' : 'worse'],
    ['Tight range 3.9-7.8', `${s.tightPct}%`, cmp(s.tightPct, p?.tightPct, 'up')],
    ['Lowest / highest', `${s.min} / ${s.max}`, null],
    ['Sensor coverage', `${s.coveragePct}%`, null],
  ] : []), [s, p]);

  return (
    <PortalShell title="Blood Sugar" subtitle="/ims/glucose • your glucose, from IMS's own log"
      icon={Droplets} gradient={gradient} glow="rgba(244,63,94,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification} maxWidth="max-w-5xl">

      {/* Nightscout database */}
      <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
        <span className={`flex items-center gap-1.5 font-bold ${dbColour(dbSize?.pct)}`} title={dbSize ? `${dbSize.usedMb} MB of ${dbSize.maxMb} MB used` : 'Nightscout database size'}>
          <Database size={13} /> Nightscout DB {dbSize ? `${Number(dbSize.pct).toFixed(1)}%` : '--'}
          {dbSize && <span className="font-normal text-slate-500">({dbSize.usedMb} of {dbSize.maxMb} MB)</span>}
        </span>
        <a href={MONGO_URL} target="_blank" rel="noreferrer" className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 border text-emerald-600 ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-[#2E2B27]/10 hover:bg-black/5'}`}>
          <ExternalLink size={12} /> MongoDB
        </a>
        <a href={NIGHTSCOUT_URL} target="_blank" rel="noreferrer" className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 border text-sky-600 ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-[#2E2B27]/10 hover:bg-black/5'}`}>
          <ExternalLink size={12} /> Nightscout
        </a>
        {nsWrite ? (
          <>
          <label className="flex items-center gap-1.5 cursor-pointer font-semibold" title={autoClear?.last ? `Last auto-clear: ${new Date(autoClear.last.at).toLocaleString('en-GB')} (${autoClear.last.before}% before${autoClear.last.after != null ? `, ${autoClear.last.after}% after` : ''}${autoClear.last.ok === false ? ', had problems' : ''})` : 'Checked hourly'}>
            <input type="checkbox" checked={Boolean(autoClear?.enabled)} onChange={(e) => toggleAutoClear(e.target.checked)} /> Auto-clear at 95%
          </label>
          <button onClick={clearOld} disabled={busy === 'cleanup'} title="Delete Nightscout records older than 3 months"
            className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 border disabled:opacity-40 ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-[#2E2B27]/10 hover:bg-black/5'}`}>
            {busy === 'cleanup' ? <RotateCw size={12} className="animate-spin" /> : <Eraser size={12} />} Clear over 3 months
          </button>
          </>
        ) : (
          <button onClick={() => setShowConnect((v) => !v)} className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 bg-gradient-to-r ${gradient} text-white`}>
            <Database size={12} /> Connect Nightscout
          </button>
        )}
      </div>
      {!nsWrite && showConnect && (
        <div className={`${panel} text-xs flex flex-col gap-2`}>
          <h2 className="text-xs font-black uppercase tracking-wider">Connect Nightscout</h2>
          <p className="text-slate-500">
            IMS needs your Nightscout <b>API secret</b> to send carbs there and to clear old records. It's the <b>API_SECRET</b> setting on Heroku: open{' '}
            <a href={HEROKU_SETTINGS_URL} target="_blank" rel="noreferrer" className="text-sky-500 hover:underline">your Heroku app settings</a>, press <b>Reveal Config Vars</b> and copy API_SECRET.
            It's also the password Nightscout asks for when you open its <a href={NIGHTSCOUT_URL} target="_blank" rel="noreferrer" className="text-sky-500 hover:underline">settings</a> to authenticate.
          </p>
          <div className="flex flex-wrap gap-2">
            <input type="password" autoComplete="off" className={`${field} flex-1 min-w-[12rem]`} placeholder="API secret" value={nsSecret}
              onChange={(e) => setNsSecret(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && nsSecret && saveNsSecret(nsSecret)} />
            <button onClick={() => saveNsSecret(nsSecret)} disabled={!nsSecret || busy === 'ns'} className={`px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r ${gradient} text-white disabled:opacity-40`}>
              {busy === 'ns' ? 'Checking...' : 'Connect'}
            </button>
          </div>
          <p className="text-[10px] text-slate-500">IMS checks it with Nightscout before saving, and stores it encrypted on the IMS server.</p>
        </div>
      )}

      {/* right now */}
      <div className={`${panel} flex flex-wrap items-center gap-6`}>
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Right now</div>
          <div className={`text-5xl font-black tabular-nums ${colourOf(cur?.value)} ${cur && !cur.fresh ? 'opacity-50' : ''}`}>
            {cur ? cur.value : '--'} <span className="text-3xl">{ARROWS[cur?.direction] || ''}</span>
          </div>
          <div className="text-xs text-slate-500">{cur ? `${cur.delta != null ? `${cur.delta > 0 ? '+' : ''}${cur.delta} · ` : ''}${cur.minutesAgo} min ago · ${cur.range}` : 'No readings yet'}</div>
        </div>
        <div className="flex gap-6 text-sm">
          <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Insulin on board</div><div className="font-bold tabular-nums">{cur?.iob != null ? `${cur.iob} u` : '-'}</div></div>
          <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Carbs on board</div><div className="font-bold tabular-nums">{cur?.cob != null ? `${cur.cob} g` : '-'}</div></div>
        </div>
        {summary?.overnight && (
          <div className="flex items-start gap-2 text-xs"><Moon size={14} className="mt-0.5 text-indigo-400" />
            <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Last night</div>
              {summary.overnight.inRangePct}% in range · lowest {summary.overnight.min} · woke at {summary.overnight.endValue}</div></div>
        )}
      </div>

      {earlyDays != null && earlyDays < 14 && (
        <div className={`${panel} text-xs flex items-center gap-2`}><AlertTriangle size={14} className="text-amber-500 shrink-0" />
          IMS has {earlyDays < 1 ? `${Math.round(earlyDays * 24)} hours` : `${Math.round(earlyDays * 10) / 10} days`} of glucose since the log was restarted, so longer periods fill in over the next couple of weeks.</div>
      )}

      {/* period */}
      <div className={panel}>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="text-xs font-black uppercase tracking-wider">Time in range</h2>
          <div className={`ml-auto flex max-w-full overflow-x-auto rounded-lg border [scrollbar-width:none] ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
            {PERIODS.map((o) => (
              <button key={o.key} onClick={() => setDays(o.key)} className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${days === o.key ? `bg-gradient-to-r ${gradient} text-white` : isDark ? 'text-slate-400 hover:bg-white/5' : 'text-slate-600 hover:bg-black/5'}`}>{o.label}</button>
            ))}
          </div>
        </div>
        {s ? (
          <>
            <TirBar s={s} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
              {chips.map(([k, v, tone]) => (
                <div key={k} className={`rounded-xl border px-3 py-2 ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">{k}</div>
                  <div className={`text-base font-bold tabular-nums ${tone === 'better' ? 'text-emerald-500' : tone === 'worse' ? 'text-amber-500' : ''}`}>{v}</div>
                </div>
              ))}
            </div>
            {summary.totals && <p className="mt-3 text-[11px] text-slate-500">Over this period: {summary.totals.bolusUnits} u bolus logged by the loop, {summary.totals.carbsG} g carbs entered.</p>}
          </>
        ) : <p className="text-xs text-slate-500">No readings in this period yet.</p>}
      </div>

      {/* one day */}
      <div className={panel}>
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setDay(shiftDay(day, -1))} className="p-1.5 rounded-lg hover:bg-slate-500/10"><ChevronLeft size={16} /></button>
          <h2 className="text-xs font-black uppercase tracking-wider flex-1 text-center">{day === todayStr() ? 'Today' : dayLabel(day)}</h2>
          <button onClick={() => setDay(shiftDay(day, 1))} disabled={day >= todayStr()} className="p-1.5 rounded-lg hover:bg-slate-500/10 disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
        {dayData && dayData.readings.length ? <DayChart data={dayData} isDark={isDark} /> : <p className="text-xs text-slate-500 text-center py-8">No readings for this day.</p>}
        {dayData?.stats && <p className="mt-2 text-[11px] text-slate-500 text-center">{dayData.stats.inRangePct}% in range · average {dayData.stats.mean} · lowest {dayData.stats.min} · highest {dayData.stats.max}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={panel}>
          <h2 className="text-xs font-black uppercase tracking-wider mb-3">Your typical day ({PERIODS.find((o) => o.key === days)?.label})</h2>
          {summary && <Profile profile={summary.profile} isDark={isDark} />}
          <p className="text-[11px] text-slate-500 mt-1">Line: median. Dark band: middle half of readings. Light band: 10th to 90th percentile.</p>
        </div>
        <div className={panel}>
          <h2 className="text-xs font-black uppercase tracking-wider mb-3">Lows (below 3.9 for 15 minutes or more)</h2>
          {summary?.lows?.length ? (
            <div className="flex flex-col gap-1.5 text-xs">
              {summary.lows.map((l) => (
                <div key={l.start} className="flex flex-wrap items-baseline gap-x-3">
                  <span className="w-32 text-slate-500">{l.when}</span>
                  <span className={`font-bold ${colourOf(l.lowest)}`}>{l.lowest}</span>
                  <span className="text-slate-500">{l.minutes} min</span>
                  {l.overnight && <span className="text-indigo-400">overnight</span>}
                  {l.afterExercise && <span className="text-orange-500">after {l.afterExercise}</span>}
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-slate-500">None in this period.</p>}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PROFILE INSIGHTS & CONTINUOUS FINE-TUNING WORKBENCH                       */}
      {/* ========================================================================= */}
      <div className={`${panel} border-sky-500/20`}>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Sliders size={16} className="text-sky-400" />
              <h2 className="text-sm font-black uppercase tracking-wider">Pump Profile & Fine-Tuning Insights</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Continuously evaluates AndroidAPS telemetry (basal rates, meal boluses, corrective sensitivity) against real glucose data.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {profileDirty && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                Unsaved tweaks
              </span>
            )}
            <button
              onClick={saveActiveProfile}
              disabled={!profileDirty}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
                profileDirty
                  ? 'bg-sky-500 text-white border-sky-400 shadow-lg shadow-sky-500/20'
                  : 'border-slate-500/20 text-slate-500 opacity-50'
              }`}
            >
              <Save size={13} /> Save Profile
            </button>
            <button
              onClick={resetActiveProfile}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 border border-slate-500/20 hover:bg-white/5 text-slate-400`}
              title="Reset to 20u Standard Day baseline"
            >
              <RotateCcw size={12} /> Reset
            </button>
          </div>
        </div>

        {/* Profile Tabs: BAS, IC, ISF mirroring user's AndroidAPS */}
        <div className={`flex items-center gap-2 border-b pb-3 mb-4 ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
          <button
            onClick={() => setProfileTab('BAS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wider uppercase transition-all ${
              profileTab === 'BAS'
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            BAS (Basal Σ{totalBasal} U)
          </button>
          <button
            onClick={() => setProfileTab('IC')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wider uppercase transition-all ${
              profileTab === 'IC'
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            IC (Carb Ratio)
          </button>
          <button
            onClick={() => setProfileTab('ISF')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wider uppercase transition-all ${
              profileTab === 'ISF'
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ISF (Sensitivity)
          </button>
        </div>

        {/* Active Tab View */}
        {profile && (
          <div className="mb-6">
            {profileTab === 'BAS' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400">Scheduled 24h Basal Curve (Total: <span className="text-sky-400 font-extrabold">{totalBasal} U/day</span>)</span>
                  <span className="text-[11px] text-slate-500">12:00 - 16:00 is highlighted for focused drift scrutiny</span>
                </div>
                <div className={`p-3 rounded-xl border mb-4 ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-[#2E2B27]/5'}`}>
                  <ProfileStepChart items={profile.basal} maxVal={2.0} unit="U/h" isDark={isDark} highlightAfternoon={true} />
                </div>
                {/* Hourly stepper rows */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {profile.basal.map((b, idx) => (
                    <div
                      key={b.time}
                      className={`p-2 rounded-xl border flex flex-col items-center justify-between transition-all ${
                        parseInt(b.time.split(':')[0], 10) >= 12 && parseInt(b.time.split(':')[0], 10) < 16
                          ? 'border-sky-500/40 bg-sky-500/10'
                          : isDark ? 'border-white/5 bg-slate-950/30' : 'border-[#2E2B27]/5 bg-white'
                      }`}
                    >
                      <span className="text-[11px] font-mono text-slate-400 mb-1">{b.time}</span>
                      <span className="text-sm font-black tabular-nums text-sky-400 mb-1.5">{b.value.toFixed(2)} <span className="text-[10px] font-normal text-slate-400">U/h</span></span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => adjustBasal(idx, -0.05)}
                          className="w-6 h-6 rounded-md bg-slate-500/20 hover:bg-slate-500/40 flex items-center justify-center font-bold text-xs"
                          title="Decrease 0.05 U/h"
                        >
                          -
                        </button>
                        <button
                          onClick={() => adjustBasal(idx, 0.05)}
                          className="w-6 h-6 rounded-md bg-slate-500/20 hover:bg-slate-500/40 flex items-center justify-center font-bold text-xs"
                          title="Increase 0.05 U/h"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {profileTab === 'IC' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400">Scheduled Insulin-to-Carb Ratios (grams per Unit)</span>
                  <span className="text-[11px] text-slate-500">Lower g/U = more insulin (stronger) · Higher g/U = less insulin (gentler)</span>
                </div>
                <div className={`p-3 rounded-xl border mb-4 ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-[#2E2B27]/5'}`}>
                  <ProfileStepChart items={profile.ic} maxVal={12.0} unit="g/U" isDark={isDark} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {profile.ic.map((item, idx) => (
                    <div key={item.time} className={`p-3 rounded-xl border flex flex-col items-center justify-between ${isDark ? 'border-white/5 bg-slate-950/30' : 'border-[#2E2B27]/5 bg-white'}`}>
                      <span className="text-xs font-mono text-slate-400 mb-1">{item.time}</span>
                      <span className="text-base font-black tabular-nums text-amber-400 mb-2">{item.value.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">g/U</span></span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => adjustIC(idx, -0.5)}
                          className="px-2 py-1 rounded bg-slate-500/20 hover:bg-slate-500/40 font-bold text-xs"
                          title="Decrease 0.5 g/U (Stronger bolus)"
                        >
                          - 0.5
                        </button>
                        <button
                          onClick={() => adjustIC(idx, 0.5)}
                          className="px-2 py-1 rounded bg-slate-500/20 hover:bg-slate-500/40 font-bold text-xs"
                          title="Increase 0.5 g/U (Gentler bolus)"
                        >
                          + 0.5
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {profileTab === 'ISF' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400">Scheduled Insulin Sensitivity Factor (mmol/L drop per Unit)</span>
                  <span className="text-[11px] text-slate-500">Currently scheduled flat across 24 hours</span>
                </div>
                <div className={`p-3 rounded-xl border mb-4 ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-[#2E2B27]/5'}`}>
                  <ProfileStepChart items={profile.isf} maxVal={3.0} unit="mmol/L/U" isDark={isDark} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {profile.isf.map((item, idx) => (
                    <div key={item.time} className={`p-3 rounded-xl border flex flex-col items-center justify-between ${isDark ? 'border-white/5 bg-slate-950/30' : 'border-[#2E2B27]/5 bg-white'}`}>
                      <span className="text-xs font-mono text-slate-400 mb-1">{item.time} (All Day)</span>
                      <span className="text-base font-black tabular-nums text-emerald-400 mb-2">{item.value.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">mmol/L per U</span></span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => adjustISF(idx, -0.1)}
                          className="px-2.5 py-1 rounded bg-slate-500/20 hover:bg-slate-500/40 font-bold text-xs"
                          title="Decrease 0.1 mmol/L/U"
                        >
                          - 0.1
                        </button>
                        <button
                          onClick={() => adjustISF(idx, 0.1)}
                          className="px-2.5 py-1 rounded bg-slate-500/20 hover:bg-slate-500/40 font-bold text-xs"
                          title="Increase 0.1 mmol/L/U"
                        >
                          + 0.1
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Evaluation Control Bar */}
        <div className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 mb-6 ${isDark ? 'bg-slate-950/50 border-white/10' : 'bg-slate-100 border-[#2E2B27]/10'}`}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">Evaluation Window:</span>
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setEvalDays(d)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  evalDays === d
                    ? 'bg-sky-500 text-white shadow-sm'
                    : isDark ? 'text-slate-400 hover:bg-white/5' : 'text-slate-600 hover:bg-black/5'
                }`}
              >
                {d} Days
              </button>
            ))}
          </div>

          <button
            onClick={runProfileEvaluation}
            disabled={evalBusy}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/20 disabled:opacity-50 transition-all`}
          >
            {evalBusy ? <RotateCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {evalBusy ? 'Analysing Telemetry...' : 'Run Deep Profile Evaluation'}
          </button>
        </div>

        {/* Evaluation Results & Telemetry Scorecards */}
        {evalData?.metrics ? (
          <div className="space-y-6">
            {/* Telemetry Overview Badges */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><Activity size={13} className="text-sky-400" /> <b className="text-slate-200">{evalData.metrics.readingsEvaluated?.toLocaleString()}</b> CGM readings</span>
              <span>•</span>
              <span className="flex items-center gap-1.5"><Clock size={13} className="text-indigo-400" /> <b className="text-slate-200">{evalData.metrics.treatmentsEvaluated?.toLocaleString()}</b> treatments & temp basals</span>
              <span>•</span>
              <span className="text-[11px] text-slate-500">Evaluated on {new Date(evalData.at).toLocaleString('en-GB')}</span>
            </div>

            {/* Question 1: Basal Scrutiny (12pm - 4pm focus & Overnight) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Clock size={13} className="text-sky-400" />
                  1. Basal Drift & Loop Delivered Offsets (12:00 - 16:00 & Overnight Focus)
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {evalData.metrics.basalBlocks?.map((bb) => (
                  <div
                    key={bb.id}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                      bb.id === 'afternoon'
                        ? 'border-sky-500/50 bg-sky-500/10 shadow-md shadow-sky-500/10'
                        : bb.id === 'overnight'
                        ? 'border-indigo-500/40 bg-indigo-500/10'
                        : isDark ? 'border-white/5 bg-slate-950/30' : 'border-[#2E2B27]/5 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold">{bb.name}</span>
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            bb.verdict === 'TOO_LOW'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : bb.verdict === 'TOO_HIGH'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {bb.verdict === 'TOO_LOW' ? 'Rate Too Low' : bb.verdict === 'TOO_HIGH' ? 'Rate Too High' : 'Well Calibrated'}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mb-2">{bb.label}</div>

                      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                        <div>
                          <div className="text-[10px] text-slate-500">Scheduled Rate</div>
                          <div className="font-bold tabular-nums">{bb.avgScheduled} U/h</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Delivered Rate</div>
                          <div className="font-bold tabular-nums text-sky-400">{bb.avgDelivered} U/h</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Loop Offset</div>
                          <div className={`font-bold tabular-nums ${bb.netOffset > 0 ? 'text-rose-400' : bb.netOffset < 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                            {bb.netOffset > 0 ? `+${bb.netOffset}` : bb.netOffset} U/h
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Fasting Drift</div>
                          <div className={`font-bold tabular-nums ${bb.meanDrift > 0.4 ? 'text-rose-400' : bb.meanDrift < -0.4 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {bb.meanDrift > 0 ? `+${bb.meanDrift}` : bb.meanDrift} mmol/h
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 mt-1 pt-2 border-t border-white/5">
                      <span className="font-medium">{bb.suggestion}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Question 2: IC Ratio Postprandial Excursions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <TrendingUp size={13} className="text-amber-400" />
                  2. Insulin-to-Carb (IC) Ratio Accuracy by Meal Window
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {evalData.metrics.mealBlocks?.map((mb) => (
                  <div
                    key={mb.id}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                      isDark ? 'border-white/5 bg-slate-950/30' : 'border-[#2E2B27]/5 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold">{mb.name}</span>
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            mb.verdict === 'UNDER_BOLUSED'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : mb.verdict === 'OVER_BOLUSED'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {mb.verdict === 'UNDER_BOLUSED' ? 'Under-Bolused' : mb.verdict === 'OVER_BOLUSED' ? 'Over-Bolused' : 'Calibrated'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                        <div>
                          <div className="text-[10px] text-slate-500">Scheduled IC</div>
                          <div className="font-bold tabular-nums">{mb.scheduledIC} g/U</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Measured IC</div>
                          <div className="font-bold tabular-nums text-amber-400">{mb.measuredIC} g/U</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Avg Excursion</div>
                          <div className={`font-bold tabular-nums ${mb.avgExcursion > 2.0 ? 'text-rose-400' : 'text-slate-300'}`}>
                            {mb.avgExcursion > 0 ? `+${mb.avgExcursion}` : mb.avgExcursion} mmol/L
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Post-Meal Highs</div>
                          <div className={`font-bold tabular-nums ${mb.highPct > 40 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {mb.highPct}% ({mb.mealsObserved} meals)
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 mt-1 pt-2 border-t border-white/5">
                      <span>{mb.suggestion}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Question 3: Diurnal ISF Sensitivity Variance */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Activity size={13} className="text-emerald-400" />
                  3. ISF Calibration & Diurnal Sensitivity Variance (Flat 1.6 vs Real Drops)
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {evalData.metrics.isfBlocks?.map((ib) => (
                  <div
                    key={ib.id}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                      isDark ? 'border-white/5 bg-slate-950/30' : 'border-[#2E2B27]/5 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold">{ib.name}</span>
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            ib.verdict === 'MORE_SENSITIVE'
                              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                              : ib.verdict === 'MORE_RESISTANT'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {ib.verdict === 'MORE_SENSITIVE' ? 'More Sensitive' : ib.verdict === 'MORE_RESISTANT' ? 'More Resistant' : 'Matched'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                        <div>
                          <div className="text-[10px] text-slate-500">Profile ISF</div>
                          <div className="font-bold tabular-nums">{ib.scheduledISF} mmol/L/U</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Measured Drop</div>
                          <div className="font-bold tabular-nums text-emerald-400">{ib.measuredISF} mmol/L/U</div>
                        </div>
                        <div className="col-span-2">
                          <div className="text-[10px] text-slate-500">Variance from Flat 1.6</div>
                          <div className="font-semibold text-xs text-slate-300">
                            {ib.diff > 0 ? `+${ib.diff}` : ib.diff} mmol/L drop per Unit
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 mt-1 pt-2 border-t border-white/5">
                      <span>{ib.suggestion}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Question 4 & 5: AI Clinical Synthesis & Action Plan */}
            {evalData.report && (
              <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-950/60 border-sky-500/20' : 'bg-slate-50 border-[#2E2B27]/10'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={15} className="text-sky-400" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-sky-400">
                    Clinical Synthesis & Fine-Tuning Action Plan
                  </h3>
                </div>
                <Prose text={evalData.report} className="text-sm leading-relaxed" />
                <p className="text-[10px] text-slate-500 mt-3 pt-2 border-t border-white/5">
                  Generated continuously from empirical AndroidAPS and CGM telemetry. Parameter adjustments should always be tested conservatively and aligned with your clinical diabetes care team.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-xs text-slate-400 mb-2">
              Press <b>Run Deep Profile Evaluation</b> above to evaluate continuous glucose readings, temp basals, and carb boluses against your "20u standard day" profile.
            </p>
            <p className="text-[11px] text-slate-500">
              This service performs automated drift analysis across 12pm-4pm and overnight, calculates meal excursion IC ratios, and checks diurnal ISF sensitivity.
            </p>
          </div>
        )}
      </div>

      {/* carbs */}
      <div className={panel}>
        <h2 className="text-xs font-black uppercase tracking-wider mb-1">Carb log</h2>
        <p className="text-[11px] text-slate-500 mb-3">Say "Hey IMS, I've just had two slices of toast" - Ims looks the carbs up in Open Food Facts, asks if it needs to (white or brown, how thick), and logs the total. {nsWrite ? 'Entries are also sent to Nightscout as a Carb Correction.' : 'Add your Nightscout API secret below to send entries to Nightscout too.'}</p>
        <div className={`mb-3 p-3 rounded-xl border text-xs flex flex-wrap items-center gap-2 ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
          <span className="font-bold">Nightscout:</span>
          {nsWrite ? (
            <>
              <span className="text-emerald-500 font-semibold">connected - carbs are sent there</span>
              <button onClick={() => saveNsSecret('')} disabled={busy === 'ns'} className="ml-auto px-2 py-1 rounded-lg text-[11px] font-bold border border-slate-500/30">Disconnect</button>
            </>
          ) : (
            <>
              <input type="password" autoComplete="off" className={`${field} flex-1 min-w-[10rem]`} placeholder="API secret (from your Nightscout settings)" value={nsSecret} onChange={(e) => setNsSecret(e.target.value)} />
              <button onClick={() => saveNsSecret(nsSecret)} disabled={!nsSecret || busy === 'ns'} className={`px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r ${gradient} text-white disabled:opacity-40`}>{busy === 'ns' ? 'Checking...' : 'Connect'}</button>
              <span className="w-full text-[10px] text-slate-500">Stored encrypted on the IMS server. AAPS may pick these carbs up from Nightscout, so don't also enter the same food in AAPS.</span>
            </>
          )}
        </div>
        <PhotoCarbs isDark={isDark} field={field} gradient={gradient} notify={notify} onLogged={() => { loadCarbs(); loadDay(); }} />
        <div className="flex flex-wrap gap-2 mb-3">
          <input className={`${field} w-24`} inputMode="decimal" placeholder="grams" value={carbForm.grams} onChange={(e) => setCarbForm({ ...carbForm, grams: e.target.value })} />
          <input className={`${field} flex-1 min-w-[10rem]`} placeholder="what (optional)" value={carbForm.food} onChange={(e) => setCarbForm({ ...carbForm, food: e.target.value })} />
          <button onClick={addCarbs} disabled={!carbForm.grams} className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r ${gradient} text-white disabled:opacity-40`}><Plus size={13} /> Log</button>
        </div>
        {carbs.length ? (
          <div className="flex flex-col gap-1 text-xs">
            {carbs.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="w-32 text-slate-500">{new Date(c.at).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="font-bold tabular-nums w-12">{Math.round(c.grams)} g</span>
                <span className="flex-1 truncate">{c.food || ''}</span>
                {c.ns_id && <span className="text-[10px] font-bold text-emerald-500" title="Sent to Nightscout">NS</span>}
                <button onClick={() => delCarbs(c.id)} className="p-1 rounded hover:bg-slate-500/10 text-slate-500"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-slate-500">Nothing logged in the last week.</p>}
      </div>

      {/* AI read */}
      <div className={panel}>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <h2 className="text-xs font-black uppercase tracking-wider flex items-center gap-2"><Sparkles size={13} className="text-rose-400" />What the numbers say</h2>
          <button onClick={analyse} disabled={busy === 'insight'} className={`ml-auto px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r ${gradient} text-white disabled:opacity-50`}>
            {busy === 'insight' ? <RotateCw size={13} className="animate-spin" /> : <Sparkles size={13} />} {summary?.insight ? 'Refresh' : 'Analyse'}
          </button>
        </div>
        {summary?.insight ? (
          <>
            <Prose text={summary.insight.text} className="text-sm leading-relaxed" />
            <p className="text-[10px] text-slate-500 mt-2">Written {new Date(summary.insight.at).toLocaleString('en-GB')} from {summary.insight.days} days. Never gives insulin doses; talk those through with your diabetes team.</p>
          </>
        ) : <p className="text-xs text-slate-500">Press Analyse for a plain-English read of the patterns, lows and what to try. It never gives insulin doses.</p>}
      </div>
    </PortalShell>
  );
}

