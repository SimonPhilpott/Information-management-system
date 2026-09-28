import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Route as RouteIcon, RotateCw, LogIn, Lock, Upload, Link2, Trash2, Mountain, Calculator, AlertTriangle, Save, Cookie, Syringe, BookOpen, Unlink, Download, ExternalLink, Edit3, Check, Copy, ChevronDown, ChevronUp, Sparkles, Shield, HeartPulse, Zap, Clock, FileText, Plus, CheckCircle, XCircle, ArrowRight, HelpCircle, Layers, Sliders, AlertCircle, Compass } from 'lucide-react';
import PortalShell from './PortalShell';
import { useUnits, UnitToggle, dist, toKm, paceText, paceToMinPerKm, KM_PER_MI } from '../../utils/units';

// Modular Tab Components
import RunMissionControlTab from './RunPlanner/RunMissionControlTab';
import RunRulebookTab from './RunPlanner/RunRulebookTab';
import RunTargetsTab from './RunPlanner/RunTargetsTab';
import RunFlythroughTab from './RunPlanner/RunFlythroughTab';

const fmtMin = (m) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;

// ---- route preview helpers -------------------------------------------------------------------------
const gradeColour = (g) => (g <= -3 ? '#38bdf8' : g < 3 ? '#22c55e' : g < 6 ? '#f59e0b' : '#ef4444');
const hav = (a, b) => {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const gradeAtKm = (profile, km) => {
  let best = profile[0];
  for (const p of profile) { if (p[0] <= km) best = p; else break; }
  return best[2];
};

// Route drawn over OpenStreetMap tiles
function RouteMap({ route, units }) {
  const view = useMemo(() => {
    const path = route.path;
    if (!path || path.length < 2) return null;
    const lats = path.map((p) => p[0]), lngs = path.map((p) => p[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const X = (lng, z) => ((lng + 180) / 360) * 256 * 2 ** z;
    const Y = (lat, z) => { const s = Math.sin((lat * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z; };
    const W = 640, H = 360;
    let z = 16;
    for (; z > 9; z--) { if (X(maxLng, z) - X(minLng, z) <= W - 90 && Y(minLat, z) - Y(maxLat, z) <= H - 90) break; }
    const cx = (X(minLng, z) + X(maxLng, z)) / 2, cy = (Y(minLat, z) + Y(maxLat, z)) / 2;
    const ox = cx - W / 2, oy = cy - H / 2;
    const tiles = [];
    const n = 2 ** z;
    for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + H) / 256); ty++) {
      for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + W) / 256); tx++) {
        if (ty < 0 || ty >= n) continue;
        tiles.push({ key: `${tx}-${ty}`, url: `https://tile.openstreetmap.org/${z}/${((tx % n) + n) % n}/${ty}.png`, x: tx * 256 - ox, y: ty * 256 - oy });
      }
    }
    const pts = path.map((p) => [X(p[1], z) - ox, Y(p[0], z) - oy]);
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + hav(path[i - 1], path[i]));
    const total = cum[cum.length - 1] || 1;
    const segs = pts.slice(1).map((p, i) => ({ a: pts[i], b: p, colour: gradeColour(gradeAtKm(route.profile, (cum[i] / total) * route.distanceKm)) }));
    const step = units === 'mi' ? KM_PER_MI : 1;
    const count = Math.floor(route.distanceKm / step);
    const every = count > 24 ? 5 : count > 12 ? 2 : 1;
    const marks = [];
    for (let k = every; k <= count; k += every) {
      const target = ((k * step) / route.distanceKm) * total;
      const i = cum.findIndex((c) => c >= target);
      if (i > 0) marks.push({ k, at: pts[i] });
    }
    const loop = hav(path[0], path[path.length - 1]) < 200;
    return { W, H, tiles, pts, segs, marks, loop };
  }, [route, units]);

  if (!view) return <div className="rounded-xl border border-dashed border-slate-500/40 p-6 text-center text-xs text-slate-500">This route was saved without its map. Delete it and import it again to see the map.</div>;
  const line = view.pts.map((p) => p.join(',')).join(' ');
  return (
    <div className="rounded-xl overflow-hidden border border-white/10 relative">
      <svg viewBox={`0 0 ${view.W} ${view.H}`} className="w-full block bg-slate-200" role="img" aria-label={`Map of ${route.name}`}>
        {view.tiles.map((t) => <image key={t.key} href={t.url} x={t.x} y={t.y} width="256" height="256" />)}
        <polyline points={line} fill="none" stroke="#fff" strokeWidth="8" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
        {view.segs.map((s, i) => <line key={i} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={s.colour} strokeWidth="4.5" strokeLinecap="round" />)}
        {view.marks.map((m) => (
          <g key={m.k}><circle cx={m.at[0]} cy={m.at[1]} r="8" fill="#0f172a" stroke="#fff" strokeWidth="1.5" /><text x={m.at[0]} y={m.at[1] + 3} fontSize="9" fontWeight="700" textAnchor="middle" fill="#fff">{m.k}</text></g>
        ))}
        <circle cx={view.pts[0][0]} cy={view.pts[0][1]} r="7" fill="#22c55e" stroke="#fff" strokeWidth="2" />
        {!view.loop && <rect x={view.pts[view.pts.length - 1][0] - 6} y={view.pts[view.pts.length - 1][1] - 6} width="12" height="12" fill="#ef4444" stroke="#fff" strokeWidth="2" />}
        <text x="6" y={view.H - 6} fontSize="9" fill="#334155">(c) OpenStreetMap contributors</text>
      </svg>
      <div className="absolute top-2 right-2 rounded-lg px-2 py-1 text-[9px] font-bold bg-slate-900/80 text-white flex gap-2">
        <span><span className="inline-block w-2 h-2 rounded-full align-middle mr-1" style={{ background: '#22c55e' }} />flat</span>
        <span><span className="inline-block w-2 h-2 rounded-full align-middle mr-1" style={{ background: '#f59e0b' }} />climb</span>
        <span><span className="inline-block w-2 h-2 rounded-full align-middle mr-1" style={{ background: '#ef4444' }} />steep</span>
        <span><span className="inline-block w-2 h-2 rounded-full align-middle mr-1" style={{ background: '#38bdf8' }} />down</span>
      </div>
    </div>
  );
}

function ElevationProfile({ route, units }) {
  const p = route.profile;
  if (!p || p.length < 2 || !route.hasElevation) return <p className="text-xs text-slate-500">This route has no elevation data.</p>;
  const W = 640, H = 150, PADL = 34, PADR = 8, PADT = 10, PADB = 20;
  const step = units === 'mi' ? KM_PER_MI : 1;
  const totalKm = p[p.length - 1][0] || route.distanceKm;
  const eMin = Math.min(...p.map((x) => x[1])), eMax = Math.max(...p.map((x) => x[1]), eMin + 5);
  const X = (km) => PADL + (km / totalKm) * (W - PADL - PADR);
  const Y = (e) => PADT + (1 - (e - eMin) / (eMax - eMin)) * (H - PADT - PADB);
  const area = `M${X(p[0][0])},${H - PADB} ` + p.map((x) => `L${X(x[0]).toFixed(1)},${Y(x[1]).toFixed(1)}`).join(' ') + ` L${X(p[p.length - 1][0])},${H - PADB} Z`;
  const ticks = []; for (let k = 0; k * step <= totalKm; k++) ticks.push(k);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Elevation profile">
      <path d={area} fill="rgba(148,163,184,0.18)" />
      {p.slice(1).map((x, i) => <line key={i} x1={X(p[i][0])} y1={Y(p[i][1])} x2={X(x[0])} y2={Y(x[1])} stroke={gradeColour(x[2])} strokeWidth="2.6" strokeLinecap="round" />)}
      <text x={2} y={Y(eMax) + 3} fontSize="9" fill="currentColor" opacity="0.6">{Math.round(eMax)}m</text>
      <text x={2} y={Y(eMin) + 3} fontSize="9" fill="currentColor" opacity="0.6">{Math.round(eMin)}m</text>
      {ticks.map((k) => <text key={k} x={X(k * step)} y={H - 5} fontSize="9" textAnchor="middle" fill="currentColor" opacity="0.6">{k === 0 ? 'start' : `${k} ${units}`}</text>)}
    </svg>
  );
}

const LEVEL_STYLE = {
  Comfortable: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  Manageable: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  Challenging: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'A big step up': 'bg-red-500/15 text-red-400 border-red-500/30',
  Unknown: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

function DemandCard({ demand, units, isDark }) {
  if (!demand || !demand.inputs) return null;
  const r = demand.route || {};
  const fitness = demand.fitness || {};
  const h = fitness.history || {};
  const rec = fitness.recommended || {};
  const ratios = fitness.ratios || {};
  const bar = (v, label, right, tone) => (
    <div>
      <div className="flex justify-between text-[10px] text-slate-500 mb-1"><span>{label}</span><span>{right}</span></div>
      <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-black/10'}`}><div className={`h-full ${v > 1.15 ? 'bg-red-500' : v > 0.95 ? 'bg-amber-500' : tone}`} style={{ width: `${Math.min(100, Math.round(v * 100))}%` }} /></div>
    </div>
  );
  const chip = (l, v) => (
    <div className={`rounded-lg px-3 py-2 border ${isDark ? 'bg-slate-950/50 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
      <div className="text-[9px] font-bold uppercase tracking-wider opacity-60">{l}</div><div className="text-sm font-black tabular-nums">{v}</div>
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`px-3 py-1.5 rounded-full border text-xs font-black ${LEVEL_STYLE[demand.level] || LEVEL_STYLE.Unknown}`}>{demand.level}</span>
        <span className="text-[11px] text-slate-500">for your current fitness, at {demand.inputs?.intensity || 'steady'} effort and an average pace of {demand.inputs?.averagePaceMinPerKm ? paceText(demand.inputs.averagePaceMinPerKm, units) : '--'} /{units}</span>
      </div>
      <ul className="text-xs leading-relaxed list-disc pl-5 space-y-0.5">{(demand.why || []).map((w, i) => <li key={i}>{w}</li>)}</ul>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {chip('Distance', `${dist(r.distanceKm || 0, units, 1)} ${units}`)}
        {chip('Climbing', r.gainM ? `${r.gainM} m up` : 'flat')}
        {chip('Climb per ' + units, `${Math.round(units === 'mi' ? (r.climbPerKm || 0) * KM_PER_MI : (r.climbPerKm || 0))} m`)}
        {chip('Effort vs flat', `+${Math.round(((r.effortFactor || 1) - 1) * 100)}%`)}
        {chip('Like flat', `${dist(r.flatEquivalentKm || 0, units, 1)} ${units}`)}
        {chip('Time at this pace', `${Math.floor((r.durationMin || 0) / 60) ? `${Math.floor((r.durationMin || 0) / 60)}h ` : ''}${Math.round((r.durationMin || 0) % 60)}m`)}
      </div>
      {(h.runs || 0) > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {ratios.distance != null && bar(ratios.distance, 'Distance vs your longest run', `${dist(r.distanceKm || 0, units, 1)} of ${dist(h.longestKm || 0, units, 1)} ${units}`, 'bg-emerald-500')}
          {ratios.duration != null && bar(ratios.duration, 'Time vs your longest run', `${Math.round(r.durationMin || 0)} of ${Math.round(h.longestMin || 0)} min`, 'bg-emerald-500')}
          {ratios.climb != null && bar(ratios.climb, 'Hills vs your usual runs', `${Math.round(units === 'mi' ? (r.climbPerKm || 0) * KM_PER_MI : (r.climbPerKm || 0))} vs ${Math.round(units === 'mi' ? (h.climbPerKm || 0) * KM_PER_MI : (h.climbPerKm || 0))} m per ${units}`, 'bg-emerald-500')}
        </div>
      )}
      <p className="text-[11px] text-slate-500 leading-relaxed">
        To do this comfortably as a regular run, a long run of about {dist(rec.longRunKm || 0, units, 1)} {units} and around {dist(rec.weeklyKm || 0, units, 1)} {units} a week suits the distance. You are averaging {dist(h.weeklyKm || 0, units, 1)} {units} a week over {h.runs || 0} recent runs.
      </p>
      <details className="text-xs">
        <summary className="cursor-pointer font-bold text-[11px] uppercase tracking-wider opacity-80">Kilometre by kilometre (your average pace, adjusted for the hills)</summary>
        <table className="w-full text-xs mt-2">
          <thead><tr className="text-left text-[9px] uppercase tracking-wider text-slate-500"><th className="py-1">{units === 'mi' ? 'Km' : 'Km'}</th><th className="text-right">Pace</th><th className="text-right">Up / down</th><th className="text-right">Steepest</th><th className="text-right">Time in</th></tr></thead>
          <tbody>
            {(demand.splits || []).map((s) => (
              <tr key={s.km} className={`border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/5'}`}>
                <td className="py-1 font-bold">{s.km}</td>
                <td className="text-right tabular-nums">{paceText(s.paceMinPerKm, units)} /{units}</td>
                <td className="text-right tabular-nums">+{s.gainM} / -{s.lossM} m</td>
                <td className={`text-right tabular-nums ${s.maxGrade >= 6 ? 'text-red-400 font-bold' : s.maxGrade >= 3 ? 'text-amber-400' : ''}`}>{s.maxGrade}%</td>
                <td className="text-right tabular-nums">{Math.floor(s.atMinute / 60) ? `${Math.floor(s.atMinute / 60)}:` : ''}{String(s.atMinute % 60).padStart(2, '0')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export default function RunPlannerPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const { units, setUnits } = useUnits();

  // Top Tab State: 'mission' | 'rulebook' | 'targets' | 'flythrough'
  const [activeMainTab, setActiveMainTab] = useState('mission');

  const [routes, setRoutes] = useState([]);
  const [routeId, setRouteId] = useState('');
  const [form, setForm] = useState({ distanceKm: '10', pace: '', intensity: 'steady', startBg: '', iob: '', cob: '', minutesSinceBolus: '' });
  const [targets, setTargets] = useState(null);
  const [now, setNow] = useState(null);
  const [plan, setPlan] = useState(null);
  const [komoot, setKomoot] = useState({ connected: false, email: null });
  const [tours, setTours] = useState(null);
  const [goals, setGoals] = useState([]);
  const [routeFull, setRouteFull] = useState(null);
  const [routeHistory, setRouteHistory] = useState(null);
  const [paceTouched, setPaceTouched] = useState(false);
  const [demand, setDemand] = useState(null);
  const [goalId, setGoalId] = useState('');
  const [tourType, setTourType] = useState('recorded');
  const [tourSearch, setTourSearch] = useState('');
  const [kForm, setKForm] = useState({ email: '', password: '', link: '' });
  const [rulebook, setRulebook] = useState(null);
  const [rulebookDraft, setRulebookDraft] = useState('');
  const [rulebookEditing, setRulebookEditing] = useState(false);
  const [rulebookExpanded, setRulebookExpanded] = useState(true);
  const [rulebookCopied, setRulebookCopied] = useState(false);

  // Pace / time / carbs override for inline plan editing
  const [originalBaseline, setOriginalBaseline] = useState(null);
  const [paceEditDraft, setPaceEditDraft] = useState(null);
  const [timeEditDraft, setTimeEditDraft] = useState(null);
  const [carbsEditDraft, setCarbsEditDraft] = useState(null);
  const [paceEditFocus, setPaceEditFocus] = useState(false);
  const [timeEditFocus, setTimeEditFocus] = useState(false);
  const [carbsEditFocus, setCarbsEditFocus] = useState(false);

  // Rulebook Books & AI Comparative Scanning State
  const [rulebookTab, setRulebookTab] = useState('rulebook'); // 'rulebook' | 'library' | 'findings' | 'paste'
  const [books, setBooks] = useState([]);
  const [bookUploadTitle, setBookUploadTitle] = useState('');
  const [bookUploadFile, setBookUploadFile] = useState(null);
  const [findings, setFindings] = useState([]);
  const [findingsStatusFilter, setFindingsStatusFilter] = useState('pending');
  const [findingsTypeFilter, setFindingsTypeFilter] = useState('all');
  const [editingFindingId, setEditingFindingId] = useState(null);
  const [editingFindingText, setEditingFindingText] = useState('');

  // Direct Research Text Review State
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteSource, setPasteSource] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [pasteSaveAsBook, setPasteSaveAsBook] = useState(true);

  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notification, setNotification] = useState(null);
  const fileRef = useRef(null);
  const bookFileRef = useRef(null);
  // Debounce ref for re-estimating on live target changes
  const estimateDebounceRef = useRef(null);

  const showToast = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification((p) => (p?.msg === msg ? null : p)), 5000);
  }, []);

  const call = useCallback(async (url, options) => {
    const res = await fetch(url, { credentials: 'same-origin', ...options });
    const d = await res.json().catch(() => ({}));
    if (res.status === 401) { setNeedsSignIn(true); throw new Error(d.error || 'Sign in required.'); }
    if (!res.ok || d.success === false) throw new Error(d.error || 'Request failed.');
    return d;
  }, []);
  const send = (url, method, body) => call(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

  const useCurrent = useCallback(async (silent = false) => {
    try {
      const d = await call('/api/planner/now');
      setNow(d);
      const n = d.now;
      if (n.bgFresh) setForm((f) => ({ ...f, startBg: String(n.bg), iob: n.iob != null ? String(n.iob) : f.iob, cob: n.cob != null ? String(n.cob) : f.cob, minutesSinceBolus: n.lastBolusMinutesAgo != null ? String(n.lastBolusMinutesAgo) : '' }));
      else if (!silent) showToast('No fresh glucose reading in the log - type your values in.', 'error');
    } catch (err) { if (!silent) showToast(err.message, 'error'); }
  }, [call, showToast]);

  const loadAll = useCallback(async () => {
    try {
      const [r, t, k] = await Promise.all([call('/api/planner/routes'), call('/api/planner/targets'), call('/api/planner/komoot/status')]);
      setNeedsSignIn(false); setRoutes(r.routes); setTargets(t.targets); setKomoot(k);
      try { setGoals((await call('/api/goals')).goals); } catch (_) { /* optional */ }
      try {
        const rb = await call('/api/planner/rulebook');
        setRulebook(rb);
        setRulebookDraft(rb.rulebook || '');
      } catch (_) { /* optional */ }
      try {
        const [bRes, fRes] = await Promise.all([
          call('/api/planner/rulebook/books'),
          call('/api/planner/rulebook/findings')
        ]);
        setBooks(bRes.books || []);
        setFindings(fRes.findings || []);
      } catch (_) { /* optional */ }
      await useCurrent(true);
    } catch (_) { /* needsSignIn set */ } finally { setIsLoading(false); }
  }, [call, useCurrent]);
  useEffect(() => { loadAll(); }, [loadAll]);

  const goal = goals.find((a) => String(a.goal.id) === goalId) || null;

  useEffect(() => {
    let live = true;
    setRouteFull(null);
    setRouteHistory(null);
    setPaceTouched(false);
    if (routeId) {
      call(`/api/planner/routes/${routeId}`).then((d) => { if (live) setRouteFull(d.route); }).catch(() => {});
      call(`/api/planner/routes/${routeId}/history`).then((d) => { if (live) setRouteHistory(d); }).catch(() => {});
    }
    return () => { live = false; };
  }, [routeId, call]);

  useEffect(() => {
    let live = true;
    setDemand(null);
    const distKm = routeFull ? routeFull.distanceKm : toKm(form.distanceKm, units);
    if (!distKm || distKm <= 0) return;
    const body = {
      distanceKm: distKm,
      intensity: form.intensity,
      paceMinPerKm: form.pace ? (paceToMinPerKm(form.pace, units) || null) : null,
      gainM: routeFull?.gainM,
      lossM: routeFull?.lossM,
      profile: routeFull?.profile,
    };
    const t = setTimeout(() => {
      send('/api/planner/demand', 'POST', body)
        .then((d) => {
          if (!live || !d) return;
          const demandObj = d.demand || d;
          setDemand(demandObj);
          if (!paceTouched && demandObj?.inputs?.averagePaceMinPerKm) {
            setForm((f) => ({ ...f, pace: paceText(demandObj.inputs.averagePaceMinPerKm, units) }));
          }
        })
        .catch(() => {
          if (live) setDemand(null);
        });

    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [routeFull, form.distanceKm, form.intensity, form.pace, paceTouched, units]);

  const estimate = async (overrides = {}, targetsOverride = null) => {
    setBusy('estimate');
    try {
      const distKm = routeFull ? routeFull.distanceKm : toKm(form.distanceKm, units);
      const isTweak = overrides?.isTweak === true;
      const targetPace = overrides?.paceMinPerKm ?? (form.pace ? paceToMinPerKm(form.pace, units) : null);
      const targetCarbs = overrides?.customCarbs;
      // Use live (possibly unsaved) targets so the chart reacts instantly to Tab 3 adjustments
      const liveTargets = targetsOverride ?? targets;

      const body = {
        distanceKm: distKm,
        paceMinPerKm: targetPace,
        intensity: form.intensity,
        startBg: Number(form.startBg),
        iob: form.iob === '' ? null : Number(form.iob),
        cob: form.cob === '' ? null : Number(form.cob),
        minutesSinceBolus: form.minutesSinceBolus === '' ? null : Number(form.minutesSinceBolus),
        gainM: routeFull?.gainM,
        lossM: routeFull?.lossM,
        profile: routeFull?.profile,
        routeName: routeFull?.name || (routeId ? routes.find((r) => String(r.id) === routeId)?.name : null),
        routeId: routeId || null,
        goalId: goalId || null,
        customCarbs: targetCarbs,
        // Live target overrides — backend uses these instead of persisted DB values
        ...(liveTargets?.startTarget !== undefined ? { startTarget: Number(liveTargets.startTarget) } : {}),
        ...(liveTargets?.floor !== undefined ? { floor: Number(liveTargets.floor) } : {}),
        ...(liveTargets?.sensMult !== undefined ? { sensMult: Number(liveTargets.sensMult) } : {}),
        ...(liveTargets?.weightKg !== undefined && liveTargets.weightKg !== null && liveTargets.weightKg !== '' ? { weightKg: Number(liveTargets.weightKg) } : {}),
      };

      const d = await send('/api/planner/estimate', 'POST', body);
      setPlan(d);

      if (!isTweak) {
        setOriginalBaseline({
          durationMin: d?.run?.durationMin,
          averagePaceMinPerKm: d?.inputs?.averagePaceMinPerKm,
          totalCarbs: d?.plan?.totalCarbs
        });
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  // Debounced re-estimation triggered by live target changes in Tab 3.
  // Only fires if a plan already exists (i.e. the user has already generated one).
  const estimateWithTargets = useCallback((newTargets) => {
    if (!plan) return; // no plan to update yet
    if (estimateDebounceRef.current) clearTimeout(estimateDebounceRef.current);
    estimateDebounceRef.current = setTimeout(() => {
      estimate({ isTweak: true }, newTargets);
    }, 600);
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const stepTime = (deltaMin) => {
    if (!plan || !plan.run) return;
    const currentDur = plan.run.durationMin || 0;
    const newDur = Math.max(2, currentDur + deltaMin);
    const distKm = plan.run.distanceKm || 1;
    const newPaceMinPerKm = newDur / distKm;
    const newPaceStr = paceText(newPaceMinPerKm, units);
    setForm((f) => ({ ...f, pace: newPaceStr }));
    setPaceTouched(true);
    estimate({ isTweak: true, paceMinPerKm: newPaceMinPerKm });
  };

  const stepPace = (deltaSec) => {
    if (!plan) return;
    const paceVal = plan.inputs?.averagePaceMinPerKm || 5.0;
    const currentPacePerUnit = units === 'mi' ? paceVal * KM_PER_MI : paceVal;
    const newPacePerUnit = Math.max(2, currentPacePerUnit + deltaSec / 60);
    const newPaceMinPerKm = units === 'mi' ? newPacePerUnit / KM_PER_MI : newPacePerUnit;
    const newPaceStr = paceText(newPaceMinPerKm, units);
    setForm((f) => ({ ...f, pace: newPaceStr }));
    setPaceTouched(true);
    estimate({ isTweak: true, paceMinPerKm: newPaceMinPerKm });
  };

  const stepCarbs = (deltaGrams) => {
    if (!plan || !plan.plan) return;
    const currentG = plan.plan.totalCarbs || 0;
    const newG = Math.max(0, currentG + deltaGrams);
    estimate({ isTweak: true, customCarbs: newG });
  };

  const saveTargets = async () => {
    setBusy('targets');
    try {
      const d = await send('/api/planner/targets', 'PUT', targets);
      setTargets(d.targets);
      showToast('Targets and assumptions saved.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const addGpx = async (file) => {
    if (!file) return;
    setBusy('gpx');
    try {
      const d = await send('/api/planner/routes/gpx', 'POST', { gpx: await file.text(), name: file.name.replace(/\.gpx$/i, '') });
      showToast(`Added "${d.route.name}" - ${d.route.distanceKm} km, ${d.route.gainM} m up.`);
      setRouteId(String(d.route.id));
      loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const addLink = async () => {
    setBusy('link');
    try {
      const d = await send('/api/planner/routes/komoot-link', 'POST', { link: kForm.link });
      showToast(`Added "${d.route.name}".`);
      setKForm({ ...kForm, link: '' });
      setRouteId(String(d.route.id));
      loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const connectKomoot = async () => {
    setBusy('komoot');
    try {
      const d = await send('/api/planner/komoot/connect', 'POST', { email: kForm.email, password: kForm.password });
      setKomoot(d);
      setKForm({ ...kForm, password: '' });
      showToast('Komoot connected.');
      loadTours();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const loadTours = async (type = 'recorded') => {
    setBusy('tours');
    try {
      setTourType(type);
      setTours((await call(`/api/planner/komoot/tours?type=${type}`)).tours);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const importTour = async (id) => {
    setBusy(`t${id}`);
    try {
      const d = await send('/api/planner/komoot/import', 'POST', { tourId: id });
      showToast(`Imported "${d.route.name}".`);
      setRouteId(String(d.route.id));
      loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const removeRoute = async (r) => {
    if (!window.confirm(`Delete the route "${r.name}"?`)) return;
    try {
      await call(`/api/planner/routes/${r.id}`, { method: 'DELETE' });
      if (String(r.id) === routeId) setRouteId('');
      loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const saveRulebookText = async () => {
    setBusy('rulebook');
    try {
      const d = await send('/api/planner/rulebook', 'PUT', { rulebook: rulebookDraft });
      setRulebook(d);
      setRulebookEditing(false);
      showToast('Running with T1D Rulebook updated.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const handleResetRulebook = async () => {
    if (!window.confirm('Reset the T1D Running Rulebook to clinical default?')) return;
    setBusy('rulebook-reset');
    try {
      const d = await send('/api/planner/rulebook/reset', 'POST');
      setRulebook(d);
      setRulebookDraft(d.rulebook || '');
      setRulebookEditing(false);
      showToast('Rulebook reset to default.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const copyRulebookText = () => {
    if (!rulebook?.rulebook) return;
    navigator.clipboard.writeText(rulebook.rulebook);
    setRulebookCopied(true);
    setTimeout(() => setRulebookCopied(false), 2000);
    showToast('Rulebook copied.');
  };

  const handleUploadBook = async () => {
    if (!bookUploadFile) return showToast('Please select a file.', 'error');
    setBusy('book-upload');
    try {
      const reader = new FileReader();
      const base64Promise = new Promise((res, rej) => {
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
      });
      reader.readAsDataURL(bookUploadFile);
      const dataBase64 = await base64Promise;
      const d = await send('/api/planner/rulebook/books/upload', 'POST', {
        title: bookUploadTitle || bookUploadFile.name.replace(/\.[^/.]+$/, ''),
        filename: bookUploadFile.name,
        dataBase64
      });
      setBooks((prev) => [d.book, ...prev]);
      setBookUploadFile(null);
      setBookUploadTitle('');
      if (bookFileRef.current) bookFileRef.current.value = '';
      showToast(`Indexed "${d.book.title}".`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const handleDeleteBook = async (b) => {
    if (!window.confirm(`Delete "${b.title}"?`)) return;
    setBusy(`del-book-${b.id}`);
    try {
      await call(`/api/planner/rulebook/books/${b.id}`, { method: 'DELETE' });
      setBooks((prev) => prev.filter((x) => x.id !== b.id));
      setFindings((prev) => prev.filter((x) => x.book_id !== b.id));
      showToast(`Deleted "${b.title}".`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const handleScanBook = async (bookId = null) => {
    setBusy(`scan-${bookId || 'all'}`);
    try {
      const d = await send('/api/planner/rulebook/scan', 'POST', { bookId: bookId || undefined });
      const [fRes, bRes] = await Promise.all([
        call('/api/planner/rulebook/findings'),
        call('/api/planner/rulebook/books')
      ]);
      setFindings(fRes.findings || []);
      setBooks(bRes.books || []);
      setRulebookTab('findings');
      setFindingsStatusFilter('pending');
      showToast(`Scan complete: ${d.new_findings_count} findings found.`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const handleResolveFinding = async (finding, action, customText = null) => {
    setBusy(`res-${finding.id}`);
    try {
      const d = await send(`/api/planner/rulebook/findings/${finding.id}/resolve`, 'POST', {
        action,
        customText
      });
      setFindings((prev) =>
        prev.map((f) =>
          f.id === finding.id
            ? { ...f, status: d.status || (action === 'dismiss' ? 'dismissed' : 'accepted'), user_action: action }
            : f
        )
      );
      if (d.rulebook) {
        setRulebook((prev) => ({ ...prev, rulebook: d.rulebook, updatedAt: Date.now(), isDefault: false }));
        setRulebookDraft(d.rulebook);
      }
      setEditingFindingId(null);
      setEditingFindingText('');
      showToast(d.message || 'Finding updated.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const handleAcceptFinding = (findingId) => {
    const f = findings.find((x) => x.id === findingId);
    if (!f) return;
    const action = f.finding_type === 'conflict' ? 'replace' : 'add';
    handleResolveFinding(f, action);
  };

  const handleDismissFinding = (findingId) => {
    const f = findings.find((x) => x.id === findingId);
    if (!f) return;
    handleResolveFinding(f, 'dismiss');
  };

  const handleApplyFindingEdit = (findingId) => {
    const f = findings.find((x) => x.id === findingId);
    if (!f) return;
    const action = f.finding_type === 'conflict' ? 'replace' : 'add';
    handleResolveFinding(f, action, editingFindingText);
  };


  const handleReviewPastedResearch = async () => {
    const text = pasteText.trim();
    if (!text || text.length < 20) return showToast('Please paste at least 20 characters of research.', 'error');
    setBusy('research-review');
    try {
      const d = await send('/api/planner/rulebook/research/review', 'POST', {
        title: pasteTitle.trim() || undefined,
        source: pasteSource.trim() || undefined,
        textContent: text,
        saveAsBook: pasteSaveAsBook
      });
      const fRes = await call('/api/planner/rulebook/findings');
      setFindings(fRes.findings || []);
      if (pasteSaveAsBook) {
        const bRes = await call('/api/planner/rulebook/books');
        setBooks(bRes.books || []);
      }
      setRulebookTab('findings');
      setFindingsStatusFilter('pending');
      showToast(d.summary || `Research reviewed: ${d.new_findings_count} findings.`);
      setPasteTitle('');
      setPasteSource('');
      setPasteText('');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const pendingFindingsCount = useMemo(() => findings.filter((f) => f.status === 'pending').length, [findings]);

  const pickGoal = (id) => {
    setGoalId(id);
    const g = goals.find((a) => String(a.goal.id) === id);
    if (!g) return;
    if (!routeId) setForm((f) => ({ ...f, distanceKm: String(g.goal.distanceKm) }));
    if (g.goal.targetMin) {
      const pace = g.goal.targetMin / g.goal.distanceKm;
      setForm((f) => ({ ...f, pace: paceText(pace, units) }));
      setPaceTouched(true);
    }
  };

  const signIn = () => { window.location.href = `/api/auth/google?returnTo=${encodeURIComponent(window.location.pathname)}`; };

  const panel = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/80 border-[#2E2B27]/10 shadow-sm'}`;
  const field = `w-full px-3 py-2 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10 text-slate-100 placeholder:text-slate-500' : 'bg-[#FAF7F2] border-[#2E2B27]/15 text-[#2E2B27] placeholder:text-[#6A645D]/60'}`;
  const label = `text-[10px] font-bold uppercase tracking-wider mb-1 block ${isDark ? 'text-slate-300' : 'text-[#2E2B27]'}`;
  const gradient = 'from-emerald-500 to-teal-600';
  const btn = `px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r ${gradient} text-white active:scale-95 disabled:opacity-40 shadow-sm`;
  const ghost = `px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${isDark ? 'bg-white/5 hover:bg-white/10 text-slate-200' : 'bg-[#FAF7F2] hover:bg-[#F4EFE6] text-[#2E2B27] border border-[#2E2B27]/10'}`;
  const chip = (l, v, tone) => (
    <div className={`rounded-lg px-3 py-2 border ${isDark ? 'bg-slate-950/50 border-white/5' : 'bg-[#FAF7F2] border-[#2E2B27]/10'}`}>
      <div className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>{l}</div>
      <div className={`text-sm font-black tabular-nums ${isDark ? '' : 'text-[#2E2B27]'} ${tone || ''}`}>{v ?? '-'}</div>
    </div>
  );
  const selected = routes.find((r) => String(r.id) === routeId);

  return (
    <PortalShell
      title="Plan My Run"
      subtitle="/ims/runplanner • Run Planner, T1D Rulebook & Interactive Flythrough Replay"
      icon={RouteIcon}
      gradient={gradient}
      glow="rgba(16,185,129,0.3)"
      isDark={isDark}
      onThemeToggle={onThemeToggle}
      setCurrentPath={setCurrentPath}
      notification={notification}
      maxWidth="max-w-6xl"
    >
      {needsSignIn ? (
        <div className={`${panel} text-center py-10 flex flex-col items-center gap-4`}>
          <Lock size={28} className="opacity-60" />
          <p className={`text-xs max-w-sm ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>Your glucose and insulin data is only available to your signed-in Google account.</p>
          <button onClick={signIn} className={btn}><LogIn size={14} /> Sign in with Google</button>
        </div>
      ) : isLoading ? (
        <div className="py-16 flex justify-center"><RotateCw size={22} className="animate-spin opacity-50" /></div>
      ) : (
        <>
          {/* Header Action Bar: Distances unit toggle */}
          <div className={`flex items-center justify-end gap-2 text-[10px] ${isDark ? 'text-slate-500' : 'text-[#6A645D] font-medium'} mb-2`}>
            Distances in <UnitToggle units={units} setUnits={setUnits} isDark={isDark} />
          </div>

          {/* TOP 4-TAB WORKSPACE NAVIGATOR */}
          <div className={`flex flex-wrap items-center gap-2 mb-5 p-1.5 rounded-2xl border ${isDark ? 'border-white/10 bg-slate-950/60 shadow-lg shadow-black/20' : 'border-[#2E2B27]/15 bg-[#F4EFE6]/90 shadow-sm shadow-[#2E2B27]/5'}`}>
            <button
              onClick={() => setActiveMainTab('mission')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeMainTab === 'mission'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md'
                  : isDark
                  ? 'text-slate-400 hover:text-white hover:bg-white/5'
                  : 'text-[#6A645D] hover:text-[#2E2B27] hover:bg-[#2E2B27]/5'
              }`}
            >
              <Mountain size={14} />
              <span>1. Run Planner</span>
            </button>

            <button
              onClick={() => setActiveMainTab('rulebook')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeMainTab === 'rulebook'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md'
                  : isDark
                  ? 'text-slate-400 hover:text-white hover:bg-white/5'
                  : 'text-[#6A645D] hover:text-[#2E2B27] hover:bg-[#2E2B27]/5'
              }`}
            >
              <BookOpen size={14} />
              <span>2. T1D Rulebook & Intelligence</span>
              {pendingFindingsCount > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-900 border border-amber-300'} animate-pulse`}>
                  {pendingFindingsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveMainTab('targets')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeMainTab === 'targets'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md'
                  : isDark
                  ? 'text-slate-400 hover:text-white hover:bg-white/5'
                  : 'text-[#6A645D] hover:text-[#2E2B27] hover:bg-[#2E2B27]/5'
              }`}
            >
              <Sliders size={14} />
              <span>3. Targets & Assumptions</span>
            </button>

            <button
              onClick={() => setActiveMainTab('flythrough')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeMainTab === 'flythrough'
                  ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                  : isDark
                  ? 'text-slate-400 hover:text-white hover:bg-white/5'
                  : 'text-[#6A645D] hover:text-[#2E2B27] hover:bg-[#2E2B27]/5'
              }`}
            >
              <Sparkles size={14} className={activeMainTab === 'flythrough' ? 'text-yellow-300' : (isDark ? 'text-yellow-400' : 'text-amber-600')} />
              <span>4. Run Flythrough & Retrospective</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold uppercase tracking-wider ${isDark ? 'bg-sky-500/20 text-sky-300' : 'bg-sky-100 text-sky-900 border border-sky-300'}`}>
                Replay
              </span>
            </button>
          </div>

          {/* TAB 1: RUN PLANNER (THE MAIN RUN PLANNING COCKPIT) */}
          {activeMainTab === 'mission' && (
            <RunMissionControlTab
              routeFull={routeFull}
              routeHistory={routeHistory}
              demand={demand}
              routes={routes}
              routeId={routeId}
              setRouteId={setRouteId}
              selected={selected}
              removeRoute={removeRoute}
              fileRef={fileRef}
              addGpx={addGpx}
              kForm={kForm}
              setKForm={setKForm}
              addLink={addLink}
              komoot={komoot}
              loadTours={loadTours}
              tours={tours}
              tourType={tourType}
              tourSearch={tourSearch}
              setTourSearch={setTourSearch}
              importTour={importTour}
              connectKomoot={connectKomoot}
              send={send}
              setTours={setTours}
              loadAll={loadAll}
              form={form}
              setForm={setForm}
              setPaceTouched={setPaceTouched}
              goals={goals}
              goalId={goalId}
              pickGoal={pickGoal}
              goal={goal}
              now={now}
              useCurrent={useCurrent}
              estimate={estimate}
              plan={plan}
              originalBaseline={originalBaseline}
              stepTime={stepTime}
              stepPace={stepPace}
              stepCarbs={stepCarbs}
              timeEditFocus={timeEditFocus}
              setTimeEditFocus={setTimeEditFocus}
              timeEditDraft={timeEditDraft}
              setTimeEditDraft={setTimeEditDraft}
              paceEditFocus={paceEditFocus}
              setPaceEditFocus={setPaceEditFocus}
              paceEditDraft={paceEditDraft}
              setPaceEditDraft={setPaceEditDraft}
              carbsEditFocus={carbsEditFocus}
              setCarbsEditFocus={setCarbsEditFocus}
              carbsEditDraft={carbsEditDraft}
              setCarbsEditDraft={setCarbsEditDraft}
              RouteMap={RouteMap}
              ElevationProfile={ElevationProfile}
              DemandCard={DemandCard}
              chip={chip}
              busy={busy}
              units={units}
              isDark={isDark}
              panel={panel}
              label={label}
              field={field}
              btn={btn}
              ghost={ghost}
              targets={targets}
            />
          )}

          {/* TAB 2: T1D RULEBOOK & INTELLIGENCE */}
          {activeMainTab === 'rulebook' && (
            <RunRulebookTab
              rulebook={rulebook}
              rulebookDraft={rulebookDraft}
              setRulebookDraft={setRulebookDraft}
              rulebookEditing={rulebookEditing}
              setRulebookEditing={setRulebookEditing}
              rulebookExpanded={rulebookExpanded}
              setRulebookExpanded={setRulebookExpanded}
              rulebookCopied={rulebookCopied}
              saveRulebookText={saveRulebookText}
              handleResetRulebook={handleResetRulebook}
              copyRulebookText={copyRulebookText}
              rulebookTab={rulebookTab}
              setRulebookTab={setRulebookTab}
              books={books}
              bookUploadTitle={bookUploadTitle}
              setBookUploadTitle={setBookUploadTitle}
              bookUploadFile={bookUploadFile}
              setBookUploadFile={setBookUploadFile}
              bookFileRef={bookFileRef}
              handleUploadBook={handleUploadBook}
              handleDeleteBook={handleDeleteBook}
              handleScanBook={handleScanBook}
              findings={findings}
              findingsStatusFilter={findingsStatusFilter}
              setFindingsStatusFilter={setFindingsStatusFilter}
              findingsTypeFilter={findingsTypeFilter}
              setFindingsTypeFilter={setFindingsTypeFilter}
              editingFindingId={editingFindingId}
              setEditingFindingId={setEditingFindingId}
              editingFindingText={editingFindingText}
              setEditingFindingText={setEditingFindingText}
              handleAcceptFinding={handleAcceptFinding}
              handleDismissFinding={handleDismissFinding}
              handleApplyFindingEdit={handleApplyFindingEdit}
              handleResolveFinding={handleResolveFinding}
              pendingFindingsCount={pendingFindingsCount}
              pasteTitle={pasteTitle}
              setPasteTitle={setPasteTitle}
              pasteSource={pasteSource}
              setPasteSource={setPasteSource}
              pasteText={pasteText}
              setPasteText={setPasteText}
              pasteSaveAsBook={pasteSaveAsBook}
              setPasteSaveAsBook={setPasteSaveAsBook}
              handleReviewPastedResearch={handleReviewPastedResearch}
              busy={busy}
              isDark={isDark}
              panelClass={panel}
              labelClass={label}
              fieldClass={field}
              btnClass={btn}
              ghostClass={ghost}
            />
          )}

          {/* TAB 3: TARGETS & ASSUMPTIONS */}
          {activeMainTab === 'targets' && (
            <RunTargetsTab
              targets={targets}
              setTargets={setTargets}
              saveTargets={saveTargets}
              hasPlan={Boolean(plan)}
              onTargetChange={estimateWithTargets}
              busy={busy}
              isDark={isDark}
              panelClass={panel}
              labelClass={label}
              fieldClass={field}
              btnClass={btn}
              ghostClass={ghost}
            />
          )}

          {/* TAB 4: RUN FLYTHROUGH & RETROSPECTIVE PLAYER */}
          {activeMainTab === 'flythrough' && (
            <RunFlythroughTab
              route={routeFull || selected}
              plan={plan}
              routeHistory={routeHistory}
              units={units}
              isDark={isDark}
              panelClass={panel}
              btnClass={btn}
              ghostClass={ghost}
              targets={targets}
            />
          )}
        </>
      )}
    </PortalShell>
  );
}
