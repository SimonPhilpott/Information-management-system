import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Route as RouteIcon, RotateCw, LogIn, Lock, Upload, Link2, Trash2, Mountain, Calculator, AlertTriangle, Save, Cookie, Syringe, BookOpen, Unlink, Download, ExternalLink, Edit3, Check, Copy, ChevronDown, ChevronUp, Sparkles, Shield, HeartPulse, Zap, Clock, FileText, Plus, CheckCircle, XCircle, ArrowRight, HelpCircle, Layers, Sliders, AlertCircle } from 'lucide-react';
import PortalShell from './PortalShell';
import Prose from './Prose';
import { useUnits, UnitToggle, dist, toKm, paceText, paceToMinPerKm } from '../../utils/units';

const fmtMin = (m) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;

// Predicted glucose (with and without the planned carbs) over the route's elevation profile.
function PlanChart({ plan, isDark }) {
  const dur = plan.run.durationMin;
  const total = plan.prediction[plan.prediction.length - 1][0];
  const W = 760, PADL = 30, PADR = 10, H1 = 170, H2 = 56, GAP = 18;
  const X = (m) => PADL + (m / total) * (W - PADL - PADR);
  const maxBg = Math.max(12, Math.ceil(Math.max(...plan.prediction.map((p) => p[1]), ...plan.withoutCarbs.map((p) => p[1])) + 1));
  const Y = (v) => 8 + (1 - (Math.min(maxBg, Math.max(2, v)) - 2) / (maxBg - 2)) * (H1 - 16);
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
  const eles = plan.elevation.map((e) => e[2]);
  const eMin = Math.min(...eles), eMax = Math.max(...eles, eMin + 1);
  const Y2 = (v) => H1 + GAP + (1 - (v - eMin) / (eMax - eMin)) * (H2 - 6);
  const area = plan.elevation.map((e, i) => `${i ? 'L' : 'M'}${X(e[0]).toFixed(1)},${Y2(e[2]).toFixed(1)}`).join(' ') + ` L${X(plan.elevation[plan.elevation.length - 1][0])},${H1 + GAP + H2} L${X(0)},${H1 + GAP + H2} Z`;
  const ticks = []; for (let m = 0; m <= total; m += 30) ticks.push(m);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H1 + GAP + H2 + 16}`} className="w-full min-w-[560px]" role="img" aria-label="Predicted glucose over the run">
        <rect x={X(0)} y={0} width={X(dur) - X(0)} height={H1 + GAP + H2} fill="rgba(249,115,22,0.08)" />
        <text x={X(0) + 4} y={11} fontSize="9" fill="#f97316">run</text>
        <line x1={PADL} x2={W - PADR} y1={Y(plan.settings.floor)} y2={Y(plan.settings.floor)} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity="0.7" />
        <text x={2} y={Y(plan.settings.floor) + 3} fontSize="9" fill="#ef4444">{plan.settings.floor}</text>
        <line x1={PADL} x2={W - PADR} y1={Y(plan.settings.startTarget)} y2={Y(plan.settings.startTarget)} stroke="#22c55e" strokeDasharray="4 3" strokeOpacity="0.5" />
        <text x={2} y={Y(plan.settings.startTarget) + 3} fontSize="9" fill="#22c55e">{plan.settings.startTarget}</text>
        <path d={path(plan.withoutCarbs)} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" />
        <path d={path(plan.prediction)} fill="none" stroke="#38bdf8" strokeWidth="2.2" strokeLinejoin="round" />
        {plan.plan.stops.map((s, i) => (
          <g key={i}>
            <line x1={X(s.minute)} x2={X(s.minute)} y1={10} y2={H1} stroke="#facc15" strokeWidth="1.2" strokeOpacity="0.8" />
            <text x={X(s.minute) + 3} y={20 + (i % 2) * 10} fontSize="9" fontWeight="700" fill="#facc15">{s.grams} g</text>
          </g>
        ))}
        <path d={area} fill="rgba(148,163,184,0.25)" stroke="#94a3b8" strokeWidth="1" />
        <text x={2} y={H1 + GAP + 10} fontSize="9" fill="currentColor" opacity="0.5">{Math.round(eMax)}m</text>
        {ticks.map((m) => (<text key={m} x={X(m)} y={H1 + GAP + H2 + 12} fontSize="9" textAnchor="middle" fill="currentColor" opacity="0.55">{m === 0 ? 'start' : `${m}m`}</text>))}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500 mt-1">
        <span><span className="inline-block w-3 h-0.5 bg-sky-400 align-middle mr-1" />estimated glucose with the plan</span>
        <span><span className="inline-block w-3 h-0.5 bg-slate-400 align-middle mr-1" />with no carbs</span>
        <span><span className="inline-block w-3 h-0.5 bg-yellow-400 align-middle mr-1" />carb stop</span>
        <span><span className="inline-block w-3 h-0.5 bg-red-500 align-middle mr-1" />your floor</span>
        <span><span className="inline-block w-3 h-0.5 bg-green-500 align-middle mr-1" />start target</span>
        <span>grey area = route elevation</span>
      </div>
    </div>
  );
}

// ---- route preview ----------------------------------------------------------------------------------
const gradeColour = (g) => (g <= -3 ? '#38bdf8' : g < 3 ? '#22c55e' : g < 6 ? '#f59e0b' : '#ef4444');
const KM_PER_MI = 1.609344;
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

// The route drawn over OpenStreetMap tiles, coloured by steepness, with a marker at every km/mile.
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

// What this run asks of you, compared with your last 12 weeks of running.
function DemandCard({ demand, units, isDark }) {
  const r = demand.route, h = demand.fitness.history, rec = demand.fitness.recommended, ratios = demand.fitness.ratios;
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
        <span className="text-[11px] text-slate-500">for your current fitness, at {demand.inputs.intensity} effort and an average pace of {paceText(demand.inputs.averagePaceMinPerKm, units)} /{units}</span>
      </div>
      <ul className="text-xs leading-relaxed list-disc pl-5 space-y-0.5">{demand.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {chip('Distance', `${dist(r.distanceKm, units, 1)} ${units}`)}
        {chip('Climbing', r.gainM ? `${r.gainM} m up` : 'flat')}
        {chip('Climb per ' + units, `${Math.round(units === 'mi' ? r.climbPerKm * KM_PER_MI : r.climbPerKm)} m`)}
        {chip('Effort vs flat', `+${Math.round((r.effortFactor - 1) * 100)}%`)}
        {chip('Like flat', `${dist(r.flatEquivalentKm, units, 1)} ${units}`)}
        {chip('Time at this pace', `${Math.floor(r.durationMin / 60) ? `${Math.floor(r.durationMin / 60)}h ` : ''}${Math.round(r.durationMin % 60)}m`)}
      </div>
      {h.runs > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {ratios.distance != null && bar(ratios.distance, 'Distance vs your longest run', `${dist(r.distanceKm, units, 1)} of ${dist(h.longestKm, units, 1)} ${units}`, 'bg-emerald-500')}
          {ratios.duration != null && bar(ratios.duration, 'Time vs your longest run', `${Math.round(r.durationMin)} of ${Math.round(h.longestMin)} min`, 'bg-emerald-500')}
          {ratios.climb != null && bar(ratios.climb, 'Hills vs your usual runs', `${Math.round(units === 'mi' ? r.climbPerKm * KM_PER_MI : r.climbPerKm)} vs ${Math.round(units === 'mi' ? h.climbPerKm * KM_PER_MI : h.climbPerKm)} m per ${units}`, 'bg-emerald-500')}
        </div>
      )}
      <p className="text-[11px] text-slate-500 leading-relaxed">
        To do this comfortably as a regular run, a long run of about {dist(rec.longRunKm, units, 1)} {units} and around {dist(rec.weeklyKm, units, 1)} {units} a week suits the distance. You are averaging {dist(h.weeklyKm, units, 1)} {units} a week over {h.runs} recent runs.
      </p>
      <details className="text-xs">
        <summary className="cursor-pointer font-bold text-[11px] uppercase tracking-wider opacity-80">Kilometre by kilometre (your average pace, adjusted for the hills)</summary>
        <table className="w-full text-xs mt-2">
          <thead><tr className="text-left text-[9px] uppercase tracking-wider text-slate-500"><th className="py-1">{units === 'mi' ? 'Km' : 'Km'}</th><th className="text-right">Pace</th><th className="text-right">Up / down</th><th className="text-right">Steepest</th><th className="text-right">Time in</th></tr></thead>
          <tbody>
            {demand.splits.map((s) => (
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
  const [rulebookExpanded, setRulebookExpanded] = useState(false);
  const [rulebookCopied, setRulebookCopied] = useState(false);
  
  // Pace / time override for inline plan editing
  const [paceEditDraft, setPaceEditDraft] = useState(null);   // null = not editing; string = draft mm:ss text
  const [timeEditDraft, setTimeEditDraft] = useState(null);   // null = not editing; string = draft "Xh YYm" text
  const [paceEditFocus, setPaceEditFocus] = useState(false);
  const [timeEditFocus, setTimeEditFocus] = useState(false);

  // Rulebook Books & AI Comparative Scanning State
  const [rulebookTab, setRulebookTab] = useState('rulebook'); // 'rulebook' | 'library' | 'findings' | 'paste'
  const [books, setBooks] = useState([]);
  const [bookUploadTitle, setBookUploadTitle] = useState('');
  const [bookUploadFile, setBookUploadFile] = useState(null);
  const [findings, setFindings] = useState([]);
  const [findingsStatusFilter, setFindingsStatusFilter] = useState('pending'); // 'all' | 'pending' | 'accepted' | 'dismissed'
  const [findingsTypeFilter, setFindingsTypeFilter] = useState('all'); // 'all' | 'conflict' | 'addition' | 'refinement'
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
      try { setGoals((await call('/api/goals')).goals); } catch (_) { /* goals are optional */ }
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

  // The chosen route, in full (with its map and elevation), and what it asks of the runner.
  useEffect(() => {
    let live = true;
    setRouteFull(null);
    setRouteHistory(null);
    setPaceTouched(false); // a newly chosen route fills in the pace you last ran it at
    if (routeId) {
      call(`/api/planner/routes/${routeId}`).then((d) => { if (live) setRouteFull(d.route); }).catch(() => {});
      call(`/api/planner/routes/${routeId}/history`).then((d) => { if (live) setRouteHistory(d); }).catch(() => {});
    }
    return () => { live = false; };
  }, [routeId, call]);
  // Fill the pace box with the pace you last ran this route at (until you type your own).
  useEffect(() => {
    if (routeId && routeHistory?.last && !paceTouched) setForm((f) => ({ ...f, pace: paceText(routeHistory.last.paceMinPerKm, units) }));
  }, [routeHistory, units, routeId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (needsSignIn) return undefined;
    const km = routeId ? null : toKm(form.distanceKm, units);
    if (!routeId && !(km >= 1)) { setDemand(null); return undefined; }
    let live = true;
    const t = setTimeout(() => {
      const body = { routeId: routeId || undefined, distanceKm: km || undefined, intensity: form.intensity };
      if (form.pace) body.paceMinPerKm = paceToMinPerKm(form.pace, units);
      if (goal?.goal.targetMin) {
        const routeKm = routeId ? (routes.find((r) => String(r.id) === routeId)?.distanceKm ?? goal.goal.distanceKm) : goal.goal.distanceKm;
        body.targetMinutes = goal.goal.targetMin * (routeKm / goal.goal.distanceKm);
        delete body.paceMinPerKm;
      }
      call('/api/planner/demand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then((d) => { if (live) setDemand(d); }).catch(() => { if (live) setDemand(null); });
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [routeId, form.distanceKm, form.pace, form.intensity, goal, routes, units, needsSignIn, call]);
  const pickGoal = useCallback((id, list = goals) => {
    setGoalId(id);
    const a = list.find((x) => String(x.goal.id) === id);
    if (!a) return;
    setForm((f) => ({
      ...f,
      distanceKm: String(dist(a.goal.distanceKm, units, 2)),
      pace: a.targetPaceMinPerKm ? paceText(a.targetPaceMinPerKm, units) : f.pace,
      // a target pace clearly quicker than usual running is a hard effort
      intensity: a.targetPaceMinPerKm && a.current.typicalPaceMinPerKm && a.targetPaceMinPerKm < a.current.typicalPaceMinPerKm * 0.93 ? 'hard' : a.goal.targetMin ? 'steady' : f.intensity,
    }));
  }, [goals, units]);
  // Arriving from a goal on the Activities page: /ims/runplanner?goal=3
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('goal');
    if (id && goals.length && !goalId) pickGoal(id, goals);
  }, [goals]); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = async () => { try { const d = await (await fetch(`/api/auth/url?returnTo=${encodeURIComponent(window.location.pathname)}`)).json(); if (d.url) window.location.href = d.url; } catch (err) { showToast(err.message, 'error'); } };

  const estimate = async () => {
    setBusy('estimate');
    try {
      const body = { routeId: routeId || undefined, distanceKm: routeId ? undefined : toKm(form.distanceKm, units), startBg: Number(form.startBg), iob: Number(form.iob) || 0, cob: Number(form.cob) || 0, intensity: form.intensity };
      if (form.pace) body.paceMinPerKm = paceToMinPerKm(form.pace, units);
      if (goal?.goal.targetMin) {
        // Fit the run to the goal time; if the route is a different length, keep the same target pace.
        const km = routeId ? (routes.find((r) => String(r.id) === routeId)?.distanceKm ?? goal.goal.distanceKm) : goal.goal.distanceKm;
        body.targetMinutes = goal.goal.targetMin * (km / goal.goal.distanceKm);
        delete body.paceMinPerKm;
      }
      if (form.minutesSinceBolus !== '') body.minutesSinceBolus = Number(form.minutesSinceBolus);
      setPlan(await send('/api/planner/estimate', 'POST', body));
    } catch (err) { showToast(err.message, 'error'); } finally { setBusy(''); }
  };

  const saveTargets = async () => {
    try { const d = await send('/api/planner/targets', 'PUT', targets); setTargets(d.targets); showToast('Saved.'); } catch (err) { showToast(err.message, 'error'); }
  };
  const addGpx = async (file) => {
    if (!file) return;
    setBusy('gpx');
    try { const d = await send('/api/planner/routes/gpx', 'POST', { gpx: await file.text(), name: file.name.replace(/\.gpx$/i, '') }); showToast(`Added "${d.route.name}" - ${d.route.distanceKm} km, ${d.route.gainM} m up.`); setRouteId(String(d.route.id)); loadAll(); }
    catch (err) { showToast(err.message, 'error'); } finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  };
  const addLink = async () => {
    setBusy('link');
    try { const d = await send('/api/planner/routes/komoot-link', 'POST', { link: kForm.link }); showToast(`Added "${d.route.name}".`); setKForm({ ...kForm, link: '' }); setRouteId(String(d.route.id)); loadAll(); }
    catch (err) { showToast(err.message, 'error'); } finally { setBusy(''); }
  };
  const connectKomoot = async () => {
    setBusy('komoot');
    try { const d = await send('/api/planner/komoot/connect', 'POST', { email: kForm.email, password: kForm.password }); setKomoot(d); setKForm({ ...kForm, password: '' }); showToast('Komoot connected (details stored encrypted).'); loadTours(); }
    catch (err) { showToast(err.message, 'error'); } finally { setBusy(''); }
  };
  const loadTours = async (type = 'recorded') => {
    setBusy('tours');
    try { setTourType(type); setTours((await call(`/api/planner/komoot/tours?type=${type}`)).tours); } catch (err) { showToast(err.message, 'error'); } finally { setBusy(''); }
  };
  const importTour = async (id) => {
    setBusy(`t${id}`);
    try { const d = await send('/api/planner/komoot/import', 'POST', { tourId: id }); showToast(`Imported "${d.route.name}".`); setRouteId(String(d.route.id)); loadAll(); }
    catch (err) { showToast(err.message, 'error'); } finally { setBusy(''); }
  };
  const removeRoute = async (r) => {
    if (!window.confirm(`Delete the route "${r.name}"?`)) return;
    try { await call(`/api/planner/routes/${r.id}`, { method: 'DELETE' }); if (String(r.id) === routeId) setRouteId(''); loadAll(); } catch (err) { showToast(err.message, 'error'); }
  };

  const saveRulebookText = async () => {
    setBusy('rulebook');
    try {
      const d = await send('/api/planner/rulebook', 'PUT', { rulebook: rulebookDraft });
      setRulebook(d);
      setRulebookEditing(false);
      showToast('Running with T1D Rulebook updated and synchronized with AI coaching.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const handleResetRulebook = async () => {
    if (!window.confirm('Reset the T1D Running Rulebook to the clinical default?')) return;
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
    showToast('Rulebook copied to clipboard.');
  };

  // --- Book Upload, Management & Arbitration Actions ---
  const handleUploadBook = async () => {
    if (!bookUploadFile) {
      showToast('Please select a book file (.pdf, .txt, .md) to upload.', 'error');
      return;
    }
    setBusy('book-upload');
    try {
      const reader = new FileReader();
      const base64Promise = new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
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
      showToast(`Indexed "${d.book.title}" (${d.book.page_count} pages, ${d.book.word_count.toLocaleString()} words).`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const handleDeleteBook = async (b) => {
    if (!window.confirm(`Delete the indexed book "${b.title}" and its extracted text?`)) return;
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

  const handleScanBooks = async (targetBookId = null) => {
    setBusy('book-scan');
    try {
      const d = await send('/api/planner/rulebook/scan', 'POST', { bookId: targetBookId || undefined });
      const fRes = await call('/api/planner/rulebook/findings');
      setFindings(fRes.findings || []);
      const bRes = await call('/api/planner/rulebook/books');
      setBooks(bRes.books || []);
      setRulebookTab('findings');
      setFindingsStatusFilter('pending');
      showToast(`Scan complete: ${d.new_findings_count} potential improvements and conflicts identified for your review.`);
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
        customText: customText || undefined
      });
      // Update local findings state
      setFindings((prev) =>
        prev.map((f) => (f.id === finding.id ? { ...f, status: d.status, user_action_at: new Date().toISOString() } : f))
      );
      // If rulebook was modified, update rulebook state
      if (d.rulebook) {
        setRulebook((prev) => ({ ...prev, rulebook: d.rulebook, updatedAt: Date.now(), isDefault: false }));
        setRulebookDraft(d.rulebook);
      }
      setEditingFindingId(null);
      setEditingFindingText('');
      showToast(d.message || 'Decision recorded.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const handleReviewPastedResearch = async () => {
    const text = pasteText.trim();
    if (!text || text.length < 20) {
      showToast('Please paste at least 20 characters of research text to analyze.', 'error');
      return;
    }
    setBusy('research-review');
    try {
      const d = await send('/api/planner/rulebook/research/review', 'POST', {
        title: pasteTitle.trim() || undefined,
        source: pasteSource.trim() || undefined,
        textContent: text,
        saveAsBook: pasteSaveAsBook
      });

      // Refresh findings
      const fRes = await call('/api/planner/rulebook/findings');
      setFindings(fRes.findings || []);
      if (pasteSaveAsBook) {
        const bRes = await call('/api/planner/rulebook/books');
        setBooks(bRes.books || []);
      }

      setRulebookTab('findings');
      setFindingsStatusFilter('pending');
      showToast(d.summary || `Research reviewed: ${d.new_findings_count} findings recorded for arbitration.`);
      setPasteTitle('');
      setPasteSource('');
      setPasteText('');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  // Findings counts
  const pendingFindingsCount = useMemo(() => findings.filter((f) => f.status === 'pending').length, [findings]);
  const conflictCount = useMemo(() => findings.filter((f) => f.type === 'conflict').length, [findings]);
  const additionCount = useMemo(() => findings.filter((f) => f.type === 'addition').length, [findings]);
  const refinementCount = useMemo(() => findings.filter((f) => f.type === 'refinement').length, [findings]);

  // Filtered findings list
  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      if (findingsStatusFilter !== 'all' && f.status !== findingsStatusFilter) return false;
      if (findingsTypeFilter !== 'all' && f.type !== findingsTypeFilter) return false;
      return true;
    });
  }, [findings, findingsStatusFilter, findingsTypeFilter]);

  const panel = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const field = `w-full px-3 py-2 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/10 text-slate-900'}`;
  const label = 'text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70';
  const gradient = 'from-emerald-500 to-teal-600';
  const btn = `px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r ${gradient} text-white active:scale-95 disabled:opacity-40`;
  const ghost = `px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`;
  const chip = (l, v, tone) => (
    <div className={`rounded-lg px-3 py-2 border ${isDark ? 'bg-slate-950/50 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
      <div className="text-[9px] font-bold uppercase tracking-wider opacity-60">{l}</div>
      <div className={`text-sm font-black tabular-nums ${tone || ''}`}>{v ?? '-'}</div>
    </div>
  );
  const selected = routes.find((r) => String(r.id) === routeId);

  return (
    <PortalShell title="Run Planner" subtitle="/ims/runplanner • carbs and timing for a run, from your route and your numbers"
      icon={RouteIcon} gradient={gradient} glow="rgba(16,185,129,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification} maxWidth="max-w-5xl">

      {needsSignIn ? (
        <div className={`${panel} text-center py-10 flex flex-col items-center gap-4`}>
          <Lock size={28} className="opacity-60" />
          <p className="text-xs text-slate-500 max-w-sm">Your glucose and insulin data is only available to your signed-in Google account.</p>
          <button onClick={signIn} className={btn}><LogIn size={14} /> Sign in with Google</button>
        </div>
      ) : isLoading ? (
        <div className="py-16 flex justify-center"><RotateCw size={22} className="animate-spin opacity-50" /></div>
      ) : (
        <>
          <div className="flex items-center justify-end gap-2 text-[10px] text-slate-500">Distances in <UnitToggle units={units} setUnits={setUnits} isDark={isDark} /></div>

          <div className={`p-3 rounded-xl border flex items-start gap-3 text-[11px] leading-relaxed ${isDark ? 'bg-amber-500/5 border-amber-500/30 text-slate-300' : 'bg-amber-50 border-amber-300 text-slate-700'}`}>
            <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-500" />
            <span>This is a <strong>planning estimate</strong> from a simple model, your logged data and published exercise guidance - not medical advice, and not a dose calculator. It suggests carbohydrate only; insulin changes are for you and your diabetes team. Always carry fast carbs and follow your own hypo plan.</span>
          </div>

          {/* Routes */}
          <div className={panel}>
            <h2 className="text-xs font-black uppercase tracking-wider mb-3 flex items-center gap-2"><Mountain size={13} />Route</h2>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <select className={field} value={routeId} onChange={(e) => setRouteId(e.target.value)}>
                <option value="">No route - just a distance</option>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.name} - {dist(r.distanceKm, units)} {units}, {r.gainM} m up</option>)}
              </select>
              {!routeId && <input className={`${field} sm:!w-40`} type="number" min="1" step="0.5" value={form.distanceKm} onChange={(e) => setForm({ ...form, distanceKm: e.target.value })} placeholder={units} />}
            </div>
            {selected && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mb-3">
                <span>{dist(selected.distanceKm, units)} {units} - {selected.gainM} m up / {selected.lossM} m down - {selected.minEle}-{selected.maxEle} m altitude - from {selected.source}</span>
                {!selected.hasElevation && <span className="text-amber-500">this file has no elevation, so climbing is unknown</span>}
                <button onClick={() => removeRoute(selected)} className="ml-auto text-red-400 flex items-center gap-1"><Trash2 size={12} />Delete</button>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div>
                <label className={label}>Add a GPX file</label>
                <input ref={fileRef} type="file" accept=".gpx,application/gpx+xml,text/xml" className="hidden" onChange={(e) => addGpx(e.target.files?.[0])} />
                <button onClick={() => fileRef.current?.click()} disabled={busy === 'gpx'} className={ghost}>{busy === 'gpx' ? <RotateCw size={13} className="animate-spin" /> : <Upload size={13} />} Choose file</button>
                <p className="text-[10px] text-slate-500 mt-1.5">In Komoot: open the tour, then Share / Export as GPX.</p>
              </div>
              <div>
                <label className={label}>Or paste a Komoot tour link</label>
                <div className="flex gap-2">
                  <input className={field} value={kForm.link} onChange={(e) => setKForm({ ...kForm, link: e.target.value })} placeholder="https://www.komoot.com/tour/..." />
                  <button onClick={addLink} disabled={!kForm.link.trim() || busy === 'link'} className={ghost}><Link2 size={13} /></button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5">Any tour link works while your account is connected; otherwise use a link from Share, which includes the share code.</p>
              </div>
              <div>
                <label className={label}>Or connect your Komoot account</label>
                {komoot.connected ? (
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-[11px] text-emerald-500 font-bold">Connected{komoot.email ? ` (${komoot.email})` : ''}</span>
                    <button onClick={() => loadTours('recorded')} disabled={busy === 'tours'} className={btn} title="The routes you have run - your completed activities on Komoot">{busy === 'tours' ? <RotateCw size={13} className="animate-spin" /> : <Download size={13} />} My completed routes</button>
                    <a href="https://www.komoot.com/tours" target="_blank" rel="noreferrer" className={ghost} title="Open your routes on komoot.com, open one, and copy its link to paste in the box on the left"><ExternalLink size={13} /> Open my Komoot routes</a>
                    <button onClick={() => loadTours('planned')} disabled={busy === 'tours'} className={ghost} title="Routes you planned or saved on Komoot"><Download size={13} /> Saved routes</button>
                    <button onClick={async () => { await send('/api/planner/komoot/disconnect', 'POST'); setTours(null); loadAll(); }} className={ghost}><Unlink size={13} /></button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <input className={field} value={kForm.email} onChange={(e) => setKForm({ ...kForm, email: e.target.value })} placeholder="Komoot email" autoComplete="off" />
                    <input className={field} type="password" value={kForm.password} onChange={(e) => setKForm({ ...kForm, password: e.target.value })} placeholder="Komoot password" autoComplete="new-password" />
                    <button onClick={connectKomoot} disabled={!kForm.email || !kForm.password || busy === 'komoot'} className={btn}>{busy === 'komoot' ? <RotateCw size={13} className="animate-spin" /> : <Link2 size={13} />}Connect</button>
                    <p className="text-[10px] text-slate-500">Komoot has no public API, so this uses the same web service its app does; the password is stored encrypted. If it stops working, GPX and links still do.</p>
                  </div>
                )}
              </div>
            </div>
            {tours && (
              <div className="mt-4 max-h-72 overflow-y-auto flex flex-col gap-1.5">
                <div className="flex items-center gap-3 mb-1 sticky top-0 py-1" style={{ background: isDark ? '#0f172a' : '#fff' }}>
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{tourType === 'recorded' ? 'Completed routes' : 'Saved routes'} ({tours.length})</span>
                  <input className={`${field} !w-56`} value={tourSearch} onChange={(e) => setTourSearch(e.target.value)} placeholder="Search by name..." />
                </div>
                {tours.length === 0 ? <p className="text-xs text-slate-500">Nothing found here - try the other list.</p> : tours.filter((t) => !tourSearch.trim() || String(t.name).toLowerCase().includes(tourSearch.trim().toLowerCase())).map((t) => (
                  <div key={t.id} className={`flex items-center gap-3 p-2 rounded-lg border text-xs ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
                    <div className="min-w-0 flex-1"><div className="font-bold truncate">{t.name}</div><div className="text-[10px] text-slate-500">{t.sport} - {t.distanceKm != null ? dist(t.distanceKm, units) : '?'} {units}{t.gainM != null ? ` - ${t.gainM} m up` : ''}</div></div>
                    <a href={`https://www.komoot.com/tour/${t.id}`} target="_blank" rel="noreferrer" className={ghost} title="Open this tour on komoot.com (copy its link from there)"><ExternalLink size={12} /></a>
                    <button onClick={() => importTour(t.id)} disabled={busy === `t${t.id}`} className={ghost}>{busy === `t${t.id}` ? <RotateCw size={12} className="animate-spin" /> : <Download size={12} />} Use</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Route preview and what it asks of you */}
          {(routeFull || demand) && (
            <div className={panel}>
              <h2 className="text-xs font-black uppercase tracking-wider mb-3 flex items-center gap-2"><Mountain size={13} />{routeFull ? routeFull.name : `${dist(toKm(form.distanceKm, units), units, 1)} ${units} run`} - what it asks of you</h2>
              {routeFull && (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
                  <div className="lg:col-span-3"><RouteMap route={routeFull} units={units} /></div>
                  <div className="lg:col-span-2 flex flex-col gap-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Elevation</div>
                    <ElevationProfile route={routeFull} units={units} />
                    <p className="text-[10px] text-slate-500 leading-relaxed">{dist(routeFull.distanceKm, units, 1)} {units}, {routeFull.gainM} m up and {routeFull.lossM} m down, between {routeFull.minEle} and {routeFull.maxEle} m. Colours show steepness: green flat, amber climbing, red steep, blue downhill.</p>
                  </div>
                </div>
              )}
              {routeFull && routeHistory && (
                <div className={`rounded-xl border p-3 mb-4 ${isDark ? 'border-white/10 bg-slate-950/30' : 'border-[#2E2B27]/10 bg-white/60'}`}>
                  {routeHistory.count > 0 ? (
                    <>
                      <div className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-2">Your runs of this route ({routeHistory.count})</div>
                      <div className="flex flex-wrap gap-2">
                        {[['Last', routeHistory.last, 'sky'], ['Fastest', routeHistory.fastest, 'emerald'], ['Slowest', routeHistory.slowest, 'amber']].map(([name, run]) => (
                          <button key={name} onClick={() => { setPaceTouched(true); setForm((f) => ({ ...f, pace: paceText(run.paceMinPerKm, units) })); }}
                            title={`Use this pace for the plan (${dist(run.km, units, 1)} ${units} in ${Math.round(run.minutes)} min)`}
                            className={`text-left rounded-lg px-3 py-2 border ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-[#2E2B27]/10 hover:bg-black/5'}`}>
                            <div className="text-[9px] font-bold uppercase tracking-wider opacity-60">{name}</div>
                            <div className="text-sm font-black tabular-nums">{paceText(run.paceMinPerKm, units)} <span className="text-[10px] font-bold text-slate-500">/{units}</span></div>
                            <div className="text-[10px] text-slate-500">{new Date(`${run.day}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })}</div>
                          </button>
                        ))}
                        <button onClick={() => { setPaceTouched(true); setForm((f) => ({ ...f, pace: paceText(routeHistory.averagePaceMinPerKm, units) })); }} title="Use your average pace on this route"
                          className={`text-left rounded-lg px-3 py-2 border ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-[#2E2B27]/10 hover:bg-black/5'}`}>
                          <div className="text-[9px] font-bold uppercase tracking-wider opacity-60">Average</div>
                          <div className="text-sm font-black tabular-nums">{paceText(routeHistory.averagePaceMinPerKm, units)} <span className="text-[10px] font-bold text-slate-500">/{units}</span></div>
                          <div className="text-[10px] text-slate-500">all {routeHistory.count} runs</div>
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2">The pace box is filled with your last pace on this route. Press any of these to use that pace instead. Runs are matched to the route by their start point and shape.</p>
                    </>
                  ) : <p className="text-[11px] text-slate-500">None of your Strava runs follow this route yet, so the pace box uses your usual pace. Type your own to change it.</p>}
                </div>
              )}
              {demand ? <DemandCard demand={demand} units={units} isDark={isDark} /> : <p className="text-xs text-slate-500">Working out what this asks of you...</p>}
              <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">Choosing a route changes the plan below: the pace is adjusted for the hills, the effort and energy use go up with the climbing, and the carb stops are placed away from steep sections. Change the effort or pace in "Where you are now" and this updates.</p>
            </div>
          )}

          {/* Goal */}
          {goals.length > 0 && (
            <div className={panel}>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xs font-black uppercase tracking-wider">Plan for a goal</h2>
                <select className={`${field} sm:!w-72`} value={goalId} onChange={(e) => pickGoal(e.target.value)}>
                  <option value="">No goal - just this run</option>
                  {goals.map((a) => <option key={a.goal.id} value={a.goal.id}>{a.goal.name} - {dist(a.goal.distanceKm, units, 1)} {units}{a.goal.targetMin ? ` in ${Math.floor(a.goal.targetMin / 60) ? `${Math.floor(a.goal.targetMin / 60)}:` : ''}${String(Math.floor(a.goal.targetMin % 60)).padStart(Math.floor(a.goal.targetMin / 60) ? 2 : 1, '0')}:${String(Math.round((a.goal.targetMin % 1) * 60)).padStart(2, '0')}` : ''}</option>)}
                </select>
              </div>
              {goal && (
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  {goal.goal.targetMin ? <>The plan fits the run to your target time, so the pace it uses is what the goal needs{routeId && selected && Math.abs(selected.distanceKm - goal.goal.distanceKm) / goal.goal.distanceKm > 0.05 ? <span className="text-amber-500"> - note this route is {dist(selected.distanceKm, units, 1)} {units} against a {dist(goal.goal.distanceKm, units, 1)} {units} goal, so the same pace is used over its length</span> : ''}.</> : <>A distance goal: the plan uses your usual pace over {dist(goal.goal.distanceKm, units, 1)} {units} unless you set one below.</>}
                  {' '}{goal.verdict}
                </p>
              )}
            </div>
          )}

          {/* Inputs */}
          <div className={panel}>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h2 className="text-xs font-black uppercase tracking-wider">Where you are now</h2>
              <button onClick={() => useCurrent(false)} className={`${ghost} ml-auto`}><RotateCw size={12} />Use my current readings</button>
            </div>
            {now?.now?.bgFresh && <p className="text-[11px] text-slate-500 mb-3">From your Nightscout log {now.now.bgMinutesAgo} min ago: glucose {now.now.bg} ({now.now.direction}), insulin on board {now.now.iob ?? 'unknown'} U{now.now.lastBolusMinutesAgo != null ? `, last bolus ${now.now.lastBolusUnits} U ${now.now.lastBolusMinutesAgo} min ago` : ''}.</p>}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
              <div><label className={label}>Glucose (mmol/L)</label><input className={field} type="number" step="0.1" value={form.startBg} onChange={(e) => setForm({ ...form, startBg: e.target.value })} /></div>
              <div><label className={label}>Insulin on board (U)</label><input className={field} type="number" step="0.1" value={form.iob} onChange={(e) => setForm({ ...form, iob: e.target.value })} /></div>
              <div><label className={label}>Carbs on board (g)</label><input className={field} type="number" step="1" value={form.cob} onChange={(e) => setForm({ ...form, cob: e.target.value })} /></div>
              <div><label className={label}>Last bolus (min ago)</label><input className={field} type="number" value={form.minutesSinceBolus} onChange={(e) => setForm({ ...form, minutesSinceBolus: e.target.value })} /></div>
              <div><label className={label}>Average pace (min:sec /{units})</label><input className={field} value={form.pace} onChange={(e) => { setPaceTouched(true); setForm({ ...form, pace: e.target.value }); }} placeholder="from your runs" /></div>
              <div><label className={label}>Effort</label>
                <select className={field} value={form.intensity} onChange={(e) => setForm({ ...form, intensity: e.target.value })}><option value="easy">Easy</option><option value="steady">Steady</option><option value="hard">Hard</option></select>
              </div>
              <button onClick={estimate} disabled={busy === 'estimate' || !form.startBg} className={btn}>{busy === 'estimate' ? <RotateCw size={13} className="animate-spin" /> : <Calculator size={13} />}Plan my carbs</button>
            </div>
          </div>

          {plan && (
            <>
              {plan.warnings.length > 0 && (
                <div className={`${panel} border-amber-500/40 flex flex-col gap-1.5`}>
                  {plan.warnings.map((w, i) => <p key={i} className="text-xs flex items-start gap-2"><AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />{w}</p>)}
                </div>
              )}
              <div className={panel}>
                <h2 className="text-xs font-black uppercase tracking-wider mb-3 flex items-center gap-2"><Cookie size={13} />The plan{plan.inputs.routeName ? ` - ${plan.inputs.routeName}` : ''}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-4">
                  {chip('Distance', `${dist(plan.run.distanceKm, units, 2)} ${units}`)}

                  {/* ── Editable: Estimated Time chip ─────────────────────── */}
                  <div className={`rounded-lg px-3 py-2 border ${isDark ? 'bg-slate-950/50 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
                    <div className="text-[9px] font-bold uppercase tracking-wider opacity-60">Estimated time</div>
                    {timeEditFocus ? (
                      <input
                        autoFocus
                        className={`text-sm font-black tabular-nums w-full bg-transparent outline-none border-b ${isDark ? 'border-emerald-400 text-emerald-300' : 'border-emerald-600 text-emerald-700'}`}
                        value={timeEditDraft ?? fmtMin(plan.run.durationMin)}
                        onChange={(e) => setTimeEditDraft(e.target.value)}
                        onFocus={() => {
                          if (!timeEditFocus) setTimeEditDraft(fmtMin(plan.run.durationMin));
                          setTimeEditFocus(true);
                        }}
                        onBlur={() => {
                          // Parse "Xh YYm" or raw minutes
                          const raw = (timeEditDraft ?? '').trim();
                          const hm = raw.match(/(\d+)h\s*(\d+)m/);
                          const hOnly = raw.match(/^(\d+)h$/);
                          const mOnly = raw.match(/^(\d+)m?$/);
                          let newMin = null;
                          if (hm) newMin = parseInt(hm[1]) * 60 + parseInt(hm[2]);
                          else if (hOnly) newMin = parseInt(hOnly[1]) * 60;
                          else if (mOnly) newMin = parseInt(mOnly[1]);
                          if (newMin && newMin > 0) {
                            // Derive new pace from the fixed distance
                            const distKm = plan.run.distanceKm;
                            const newPaceMinPerKm = newMin / distKm;
                            const newPaceStr = paceText(newPaceMinPerKm, units);
                            setForm((f) => ({ ...f, pace: newPaceStr }));
                            setPaceTouched(true);
                            // Re-estimate with the new pace
                            setTimeout(() => {
                              const body = { routeId: routeId || undefined, distanceKm: routeId ? undefined : toKm(form.distanceKm, units), startBg: Number(form.startBg), iob: Number(form.iob) || 0, cob: Number(form.cob) || 0, intensity: form.intensity, paceMinPerKm: newPaceMinPerKm };
                              if (form.minutesSinceBolus !== '') body.minutesSinceBolus = Number(form.minutesSinceBolus);
                              setBusy('estimate');
                              send('/api/planner/estimate', 'POST', body).then(setPlan).catch((e) => showToast(e.message, 'error')).finally(() => setBusy(''));
                            }, 0);
                          }
                          setTimeEditFocus(false);
                          setTimeEditDraft(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.target.blur();
                          if (e.key === 'Escape') { setTimeEditFocus(false); setTimeEditDraft(null); }
                        }}
                        placeholder="e.g. 1h 20m"
                        style={{ width: '80px' }}
                      />
                    ) : (
                      <button
                        className={`text-sm font-black tabular-nums hover:underline cursor-text text-left w-full`}
                        title="Click to edit estimated time"
                        onClick={() => { setTimeEditFocus(true); setTimeEditDraft(fmtMin(plan.run.durationMin)); }}
                      >
                        {busy === 'estimate' ? <RotateCw size={12} className="animate-spin inline" /> : fmtMin(plan.run.durationMin)}
                        <span className="ml-1 text-[9px] opacity-40 font-normal">✎</span>
                      </button>
                    )}
                  </div>

                  {/* ── Editable: Average Pace chip ────────────────────────── */}
                  <div className={`rounded-lg px-3 py-2 border ${isDark ? 'bg-slate-950/50 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
                    <div className="text-[9px] font-bold uppercase tracking-wider opacity-60">Average pace</div>
                    {paceEditFocus ? (
                      <input
                        autoFocus
                        className={`text-sm font-black tabular-nums w-full bg-transparent outline-none border-b ${isDark ? 'border-emerald-400 text-emerald-300' : 'border-emerald-600 text-emerald-700'}`}
                        value={paceEditDraft ?? `${paceText(plan.inputs.averagePaceMinPerKm, units)}`}
                        onChange={(e) => setPaceEditDraft(e.target.value)}
                        onFocus={() => {
                          if (!paceEditFocus) setPaceEditDraft(paceText(plan.inputs.averagePaceMinPerKm, units));
                          setPaceEditFocus(true);
                        }}
                        onBlur={() => {
                          const raw = (paceEditDraft ?? '').trim();
                          const parsed = paceToMinPerKm(raw, units);
                          if (raw.includes(':') && parsed > 0 && parsed < 30) {
                            setForm((f) => ({ ...f, pace: raw }));
                            setPaceTouched(true);
                            setTimeout(() => {
                              const body = { routeId: routeId || undefined, distanceKm: routeId ? undefined : toKm(form.distanceKm, units), startBg: Number(form.startBg), iob: Number(form.iob) || 0, cob: Number(form.cob) || 0, intensity: form.intensity, paceMinPerKm: parsed };
                              if (form.minutesSinceBolus !== '') body.minutesSinceBolus = Number(form.minutesSinceBolus);
                              setBusy('estimate');
                              send('/api/planner/estimate', 'POST', body).then(setPlan).catch((e) => showToast(e.message, 'error')).finally(() => setBusy(''));
                            }, 0);
                          }
                          setPaceEditFocus(false);
                          setPaceEditDraft(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.target.blur();
                          if (e.key === 'Escape') { setPaceEditFocus(false); setPaceEditDraft(null); }
                        }}
                        placeholder="m:ss"
                        style={{ width: '64px' }}
                      />
                    ) : (
                      <button
                        className="text-sm font-black tabular-nums hover:underline cursor-text text-left w-full"
                        title="Click to edit average pace"
                        onClick={() => { setPaceEditFocus(true); setPaceEditDraft(paceText(plan.inputs.averagePaceMinPerKm, units)); }}
                      >
                        {busy === 'estimate' ? <RotateCw size={12} className="animate-spin inline" /> : `${paceText(plan.inputs.averagePaceMinPerKm, units)} /${units}`}
                        <span className="ml-1 text-[9px] opacity-40 font-normal">✎</span>
                      </button>
                    )}
                  </div>

                  {chip('Climbing', plan.run.hasElevation ? `${plan.run.gainM} m up` : 'flat / unknown')}
                  {chip('Effort vs flat', `${Math.round((plan.run.effortFactor - 1) * 100)}% more`)}
                  {chip('Carbs in total', `${plan.plan.totalCarbs} g`, 'text-yellow-500')}
                  {chip('Per hour', `${plan.plan.carbsPerHour} g/h`)}
                  {chip('Lowest (estimate)', plan.plan.predicted.minDuring, plan.plan.predicted.minDuring < plan.settings.floor ? 'text-red-500' : 'text-emerald-500')}
                  {chip('At the finish', plan.plan.predicted.endBg)}
                  {chip('Lowest after', plan.plan.predicted.minAfter, plan.plan.predicted.minAfter < plan.settings.floor ? 'text-red-500' : '')}
                  {chip('With no carbs', plan.plan.predicted.minWithoutCarbs, plan.plan.predicted.minWithoutCarbs < plan.settings.floor ? 'text-amber-500' : '')}
                  {chip('Energy', plan.run.kcal ? `${plan.run.kcal} kcal` : 'add weight')}
                  {chip('1 g of carb =', `${plan.settings.mmolPerGram} mmol/L`)}
                </div>
                <PlanChart plan={plan} isDark={isDark} />
                <h3 className="text-[11px] font-black uppercase tracking-wider mt-5 mb-2">When to eat</h3>
                {plan.plan.stops.length === 0 ? <p className="text-xs text-slate-500">On these numbers no carbs are needed during the run - keep some with you anyway.</p> : (
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-[9px] uppercase tracking-wider text-slate-500"><th className="py-1 pr-3">When</th><th className="pr-3">Where</th><th className="pr-3 text-right">Carbs</th><th>Note</th></tr></thead>
                    <tbody>
                      {plan.plan.stops.map((s, i) => (
                        <tr key={i} className={`border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/5'}`}>
                          <td className="py-1.5 pr-3 tabular-nums font-bold">{s.minute === 0 ? 'At the start' : `${s.minute} min in`}</td>
                          <td className="pr-3 tabular-nums">{s.minute === 0 ? '-' : `${units} ${dist(s.km, units)}`}</td>
                          <td className="pr-3 text-right tabular-nums font-black text-yellow-500">{s.grams} g</td>
                          <td className="text-slate-500">{s.note}</td>
                        </tr>
                      ))}
                      {plan.plan.postCarbs > 0 && (<tr className={`border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/5'}`}><td className="py-1.5 pr-3 font-bold">At the finish</td><td>-</td><td className="pr-3 text-right font-black text-yellow-500 tabular-nums">{plan.plan.postCarbs} g</td><td className="text-slate-500">The estimate dips after you stop; insulin stays extra effective for hours.</td></tr>)}
                    </tbody>
                  </table>
                )}
                {plan.plan.toReachStartTarget > 0 && <p className="text-[11px] text-slate-500 mt-3">To be at your {plan.settings.startTarget} start target from {plan.inputs.startBg} you would need about {plan.plan.toReachStartTarget} g of fast carbs 15-20 minutes before you go.</p>}
                {plan.guideline && <p className="text-[11px] text-slate-500 mt-2">For comparison, ISPAD guidance is {plan.guideline[plan.guideline.usedRange][0]}-{plan.guideline[plan.guideline.usedRange][1]} g an hour at your weight with {plan.guideline.usedRange === 'highIob' ? 'insulin still active' : 'little insulin active'}; this plan uses {plan.plan.carbsPerHour} g/h because it is tailored to your glucose and insulin on board.</p>}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={panel}>
                  <h3 className="text-[11px] font-black uppercase tracking-wider mb-2">If you started at a different glucose</h3>
                  <table className="w-full text-xs"><thead><tr className="text-left text-[9px] uppercase tracking-wider text-slate-500"><th className="py-1">Start</th><th className="text-right">Carbs</th><th className="text-right">At start</th><th className="text-right">Lowest</th></tr></thead><tbody>
                    {plan.startScenarios.map((s) => (<tr key={s.startBg} className={`border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/5'}`}><td className="py-1 font-bold">{s.startBg}</td><td className="text-right tabular-nums">{s.totalCarbs} g</td><td className="text-right tabular-nums">{s.carbsAtStart} g</td><td className={`text-right tabular-nums ${s.minBg < plan.settings.floor ? 'text-red-500' : ''}`}>{s.minBg}</td></tr>))}
                  </tbody></table>
                </div>
                <div className={panel}>
                  <h3 className="text-[11px] font-black uppercase tracking-wider mb-2">If you had different insulin on board</h3>
                  <table className="w-full text-xs"><thead><tr className="text-left text-[9px] uppercase tracking-wider text-slate-500"><th className="py-1">IOB</th><th className="text-right">Carbs</th><th className="text-right">At start</th><th className="text-right">Lowest</th></tr></thead><tbody>
                    {plan.iobScenarios.map((s) => (<tr key={s.iob} className={`border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/5'}`}><td className="py-1 font-bold">{s.iob} U</td><td className="text-right tabular-nums">{s.totalCarbs} g</td><td className="text-right tabular-nums">{s.carbsAtStart} g</td><td className={`text-right tabular-nums ${s.minBg < plan.settings.floor ? 'text-red-500' : ''}`}>{s.minBg}</td></tr>))}
                  </tbody></table>
                </div>
              </div>

              <div className={panel}>
                <h3 className="text-[11px] font-black uppercase tracking-wider mb-2 flex items-center gap-2"><Syringe size={13} />Insulin - things to discuss with your diabetes team</h3>
                <div className="flex flex-col gap-3">
                  {plan.insulin.map((n, i) => (<div key={i}><div className="text-xs font-bold">{n.title}</div><p className="text-[11px] text-slate-500 leading-relaxed">{n.text}</p></div>))}
                </div>
              </div>

              <div className={panel}>
                <h3 className="text-[11px] font-black uppercase tracking-wider mb-2 flex items-center gap-2"><BookOpen size={13} />How this was worked out</h3>
                <p className="text-[11px] text-slate-500 leading-relaxed mb-2">
                  Each minute: glucose falls with insulin action (your {plan.inputs.iob} U on board over a 3-hour curve, times your ISF of {plan.settings.isf} mmol/L per U, made {plan.inputs.sensMult}x stronger during the run) and with exercise uptake ({plan.inputs.kEx} mmol/L per hour, scaled by effort and the route's climbing), and rises with carbs ({plan.settings.cr} g per U, so about {plan.settings.mmolPerGram} mmol/L per gram, absorbed over about 20 minutes). Stops are placed so the estimate stays at least 1 mmol/L above your {plan.settings.floor} floor, off steep climbs where possible. Your loop will also react (temp basals), which this ignores, so treat the estimate as cautious.
                </p>
                <p className="text-[11px] text-slate-500 leading-relaxed mb-2">
                  {plan.basis.personalFitted ? `Exercise uptake was fitted from ${plan.basis.personalRuns} of your matched runs.` : `Not personalised yet: ${plan.basis.personalRuns} of your runs are matched with glucose data and 4 are needed to fit your own exercise uptake.`}
                  {plan.basis.assumed.length > 0 && <> Assumed: {plan.basis.assumed.join('; ')}.</>}
                </p>
                <ul className="text-[11px] list-disc pl-5 space-y-0.5">
                  {plan.sources.map((s) => (<li key={s.url}><a className="text-sky-500 hover:underline" href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>))}
                </ul>
              </div>
            </>
          )}

          {/* Running with T1D: Comprehensive Glucose Rulebook & Book Intelligence */}
          <div id="rulebook" className={`${panel} border-emerald-500/30`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center flex-wrap gap-2">
                <BookOpen size={16} className="text-emerald-500" />
                <h2 className="text-xs font-black uppercase tracking-wider">Running with T1D: Comprehensive Glucose Rulebook</h2>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${rulebook?.isDefault ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'}`}>
                  {rulebook?.isDefault ? 'Standard Evidence Base' : 'Custom Tailored'}
                </span>
                {rulebook?.updatedAt && (
                  <span className="text-[10px] text-slate-500">
                    Updated {new Date(rulebook.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRulebookTab('paste')}
                  className={`${ghost} text-emerald-400 hover:text-emerald-300 font-semibold`}
                  title="Paste clinical research notes or trial papers to review against rulebook"
                >
                  <FileText size={12} />
                  <span>Paste Research</span>
                </button>
                <button
                  onClick={copyRulebookText}
                  className={ghost}
                  title="Copy the entire rulebook markdown text"
                >
                  {rulebookCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  <span>{rulebookCopied ? 'Copied' : 'Copy'}</span>
                </button>
                {rulebookEditing ? (
                  <button
                    onClick={() => { setRulebookDraft(rulebook?.rulebook || ''); setRulebookEditing(false); }}
                    className={ghost}
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    onClick={() => { setRulebookDraft(rulebook?.rulebook || ''); setRulebookEditing(true); setRulebookTab('rulebook'); }}
                    className={ghost}
                  >
                    <Edit3 size={12} />
                    <span>Edit Rulebook</span>
                  </button>
                )}
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
              A comprehensive clinical and field-tested rulebook for running with Type 1 Diabetes (Omnipod, AAPS closed loop, and CGM). Upload and index your diabetes sports books and studies, paste raw research papers for real-time comparative audit, and arbitrate whether AI findings should replace existing rules, fill missing gaps, or be dismissed.
            </p>

            {/* Sub-Section Navigation Tabs */}
            <div className={`flex flex-wrap items-center gap-2 border-b pb-3 mb-4 ${isDark ? 'border-white/5' : 'border-[#2E2B27]/5'}`}>
              <button
                onClick={() => setRulebookTab('rulebook')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${rulebookTab === 'rulebook' ? (isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-slate-900') : 'text-slate-400 hover:text-slate-200'}`}
              >
                <Layers size={13} />
                <span>Rulebook & Protocols</span>
              </button>

              <button
                onClick={() => setRulebookTab('library')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${rulebookTab === 'library' ? (isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-slate-900') : 'text-slate-400 hover:text-slate-200'}`}
              >
                <BookOpen size={13} />
                <span>Uploaded Books & Literature</span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-500/20 text-emerald-400 font-bold tabular-nums">
                  {books.length}
                </span>
              </button>

              <button
                onClick={() => setRulebookTab('paste')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${rulebookTab === 'paste' ? (isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-slate-900') : 'text-slate-400 hover:text-slate-200'}`}
              >
                <FileText size={13} className="text-emerald-400" />
                <span>Paste & Review Research</span>
              </button>

              <button
                onClick={() => setRulebookTab('findings')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${rulebookTab === 'findings' ? (isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-slate-900') : 'text-slate-400 hover:text-slate-200'}`}
              >
                <Sparkles size={13} className="text-yellow-400" />
                <span>AI Scan & Conflict Arbitration</span>
                {pendingFindingsCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-amber-500/20 text-amber-400 font-black tabular-nums animate-pulse">
                    {pendingFindingsCount} pending
                  </span>
                )}
              </button>
            </div>

            {/* TAB 1: ACTIVE RULEBOOK & DIMENSIONS */}
            {rulebookTab === 'rulebook' && (
              rulebookEditing ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>Markdown format. Use headings (##), bullet points (*), and bold (**text**) to organise your rules.</span>
                    <span className="tabular-nums">{rulebookDraft.length} characters</span>
                  </div>
                  <textarea
                    className={`${field} font-mono text-xs leading-relaxed`}
                    rows={20}
                    value={rulebookDraft}
                    onChange={(e) => setRulebookDraft(e.target.value)}
                    placeholder="Paste or write your Running with T1D Rulebook..."
                  />
                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <button
                      onClick={saveRulebookText}
                      disabled={busy === 'rulebook' || !rulebookDraft.trim()}
                      className={btn}
                    >
                      {busy === 'rulebook' ? <RotateCw size={13} className="animate-spin" /> : <Save size={13} />}
                      <span>Save Rulebook</span>
                    </button>
                    <button
                      onClick={() => { setRulebookDraft(rulebook?.rulebook || ''); setRulebookEditing(false); }}
                      className={ghost}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleResetRulebook}
                      disabled={busy === 'rulebook-reset'}
                      className={`${ghost} ml-auto text-amber-400`}
                      title="Reset to default clinical rulebook"
                    >
                      {busy === 'rulebook-reset' ? <RotateCw size={12} className="animate-spin" /> : <RotateCw size={12} />}
                      <span>Reset to Default</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {/* 5 Dimension Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 mb-4">
                    <div className={`rounded-xl p-3 border flex flex-col justify-between ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white/80 border-[#2E2B27]/10'}`}>
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1.5 mb-1">
                          <HeartPulse size={11} /> 1. Launch Gate
                        </div>
                        <div className="text-base font-black tabular-nums">7.0 - 10.0 <span className="text-[10px] text-slate-400 font-normal">mmol/L</span></div>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2 leading-tight">
                        Optimal start window. Delay with 0.3g/kg if 4.0-4.9; abort if &lt;4.0; ketone check if &gt;15.0.
                      </p>
                    </div>

                    <div className={`rounded-xl p-3 border flex flex-col justify-between ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white/80 border-[#2E2B27]/10'}`}>
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5 mb-1">
                          <Clock size={11} /> 2. IOB & Loop
                        </div>
                        <div className="text-base font-black tabular-nums">&lt; 1.0 U <span className="text-[10px] text-slate-400 font-normal">start IOB</span></div>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2 leading-tight">
                        Set temp target (8.0-9.0) 60-90m prior. Reduce pre-run meal bolus by 30-50% within 2h.
                      </p>
                    </div>

                    <div className={`rounded-xl p-3 border flex flex-col justify-between ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white/80 border-[#2E2B27]/10'}`}>
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-wider text-yellow-500 flex items-center gap-1.5 mb-1">
                          <Cookie size={11} /> 3. Fueling Rate
                        </div>
                        <div className="text-base font-black tabular-nums">30 - 60 g <span className="text-[10px] text-slate-400 font-normal">per hour</span></div>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2 leading-tight">
                        15-20g increments every 20-30 min. Up to 75g/h with higher IOB or hard pace.
                      </p>
                    </div>

                    <div className={`rounded-xl p-3 border flex flex-col justify-between ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white/80 border-[#2E2B27]/10'}`}>
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-1">
                          <Mountain size={11} /> 4. Terrain & Hills
                        </div>
                        <div className="text-base font-black tabular-nums">Flats / Down <span className="text-[10px] text-slate-400 font-normal">stops</span></div>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2 leading-tight">
                        Fuel 3-5m before climbs or on descents. Avoid mid-climb fueling during anaerobic surges.
                      </p>
                    </div>

                    <div className={`rounded-xl p-3 border flex flex-col justify-between ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white/80 border-[#2E2B27]/10'}`}>
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5 mb-1">
                          <Shield size={11} /> 5. Nocturnal Lows
                        </div>
                        <div className="text-base font-black tabular-nums">-20% Basal <span className="text-[10px] text-slate-400 font-normal">6h night</span></div>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2 leading-tight">
                        Refuel if finish &lt;6.0. Night-time hypo risk peaks 7-11h post-run; set overnight temp basal.
                      </p>
                    </div>
                  </div>

                  {/* Collapsible Full Document */}
                  <div className={`rounded-xl border transition-all ${isDark ? 'border-white/10 bg-slate-950/20' : 'border-[#2E2B27]/10 bg-white/50'}`}>
                    <button
                      onClick={() => setRulebookExpanded(!rulebookExpanded)}
                      className="w-full p-3.5 flex items-center justify-between text-left hover:opacity-80"
                    >
                      <span className="text-xs font-bold flex items-center gap-2">
                        <Sparkles size={13} className="text-emerald-400" />
                        {rulebookExpanded ? 'Hide Full Rulebook Document' : 'View Full Rulebook Document & Clinical Protocols'}
                      </span>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        <span>{rulebook?.rulebook ? `${rulebook.rulebook.split('\n').length} lines` : '0 lines'}</span>
                        {rulebookExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                    </button>

                    {rulebookExpanded && (
                      <div className={`p-4 pt-2 border-t text-xs ${isDark ? 'border-white/5' : 'border-[#2E2B27]/5'}`}>
                        <Prose text={rulebook?.rulebook} />
                      </div>
                    )}
                  </div>
                </div>
              )
            )}

            {/* TAB 2: UPLOADED BOOKS & LITERATURE */}
            {rulebookTab === 'library' && (
              <div className="flex flex-col gap-4">
                {/* Upload Section */}
                <div className={`rounded-xl p-4 border ${isDark ? 'bg-slate-950/30 border-white/5' : 'bg-white/80 border-[#2E2B27]/10'}`}>
                  <h3 className="text-xs font-black uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Upload size={13} className="text-emerald-500" />
                    Upload & Index Book or Research Paper
                  </h3>
                  <p className="text-[11px] text-slate-500 mb-3">
                    Supported formats: PDF (.pdf), Plain Text (.txt), Markdown (.md). Text is extracted and indexed locally so Gemini can audit it against your current running rules.
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div className="sm:col-span-1">
                      <label className={label}>Book / Paper Title</label>
                      <input
                        className={field}
                        type="text"
                        value={bookUploadTitle}
                        onChange={(e) => setBookUploadTitle(e.target.value)}
                        placeholder="e.g. The Athlete's Guide to Diabetes"
                      />
                    </div>
                    
                    <div className="sm:col-span-1">
                      <label className={label}>Select File (PDF / Text / MD)</label>
                      <input
                        ref={bookFileRef}
                        type="file"
                        accept=".pdf,.txt,.md,.markdown"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            setBookUploadFile(f);
                            if (!bookUploadTitle) setBookUploadTitle(f.name.replace(/\.[^/.]+$/, ''));
                          }
                        }}
                      />
                      <button
                        onClick={() => bookFileRef.current?.click()}
                        className={`${ghost} w-full truncate text-left`}
                      >
                        <FileText size={13} className="shrink-0" />
                        <span className="truncate">{bookUploadFile ? bookUploadFile.name : 'Choose book file...'}</span>
                      </button>
                    </div>

                    <div className="sm:col-span-1">
                      <button
                        onClick={handleUploadBook}
                        disabled={!bookUploadFile || busy === 'book-upload'}
                        className={`${btn} w-full justify-center`}
                      >
                        {busy === 'book-upload' ? <RotateCw size={13} className="animate-spin" /> : <Plus size={13} />}
                        <span>Index Book</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Books Listing */}
                <div className="flex items-center justify-between mt-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Indexed Literature Library ({books.length})
                  </div>
                  {books.length > 0 && (
                    <button
                      onClick={() => handleScanBooks(null)}
                      disabled={busy === 'book-scan'}
                      className={btn}
                    >
                      {busy === 'book-scan' ? <RotateCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
                      <span>Scan All Books for Improvements</span>
                    </button>
                  )}
                </div>

                {books.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-500/30 p-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                    <BookOpen size={24} className="opacity-40 text-emerald-500" />
                    <span>No books uploaded yet. Upload a diabetes sports medicine book or training guide to start comparative scanning.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {books.map((b) => (
                      <div
                        key={b.id}
                        className={`rounded-xl p-3.5 border flex flex-col justify-between ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white/80 border-[#2E2B27]/10'}`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs font-black truncate">{b.title}</h4>
                              <p className="text-[10px] text-slate-500 truncate">{b.filename}</p>
                            </div>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                              {b.file_type}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500 mb-2">
                            <span>{b.page_count} pages</span>
                            <span>•</span>
                            <span>{b.word_count.toLocaleString()} words</span>
                            <span>•</span>
                            <span>{(b.file_size / (1024 * 1024)).toFixed(1)} MB</span>
                          </div>

                          {b.last_scanned_at ? (
                            <div className="text-[9px] text-emerald-500 font-semibold mb-3 flex items-center gap-1">
                              <CheckCircle size={10} />
                              <span>Last scanned: {new Date(b.last_scanned_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          ) : (
                            <div className="text-[9px] text-amber-500/80 mb-3 flex items-center gap-1">
                              <Clock size={10} />
                              <span>Not scanned yet</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                          <button
                            onClick={() => handleScanBooks(b.id)}
                            disabled={busy === 'book-scan'}
                            className={`${ghost} flex-1 justify-center text-[11px]`}
                            title="Run comparative AI audit on this book against the active rulebook"
                          >
                            {busy === 'book-scan' ? <RotateCw size={11} className="animate-spin" /> : <Sparkles size={11} className="text-yellow-400" />}
                            <span>Scan Book</span>
                          </button>
                          <button
                            onClick={() => handleDeleteBook(b)}
                            disabled={busy === `del-book-${b.id}`}
                            className="p-2 rounded-lg text-red-400 hover:bg-red-500/10"
                            title="Delete book and associated extracted text"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: AI SCAN & CONFLICT ARBITRATION */}
            {rulebookTab === 'findings' && (
              <div className="flex flex-col gap-4">
                {/* Header & Controls */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                      <Shield size={13} className="text-emerald-500" />
                      Comparative Evidence & Conflict Arbitration
                    </h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      You maintain full control. Review conflicting thresholds and missing guidance extracted from uploaded literature and pasted research. Choose whether to replace active rules, add missing protocols, or dismiss.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setRulebookTab('paste')}
                      className={`${ghost} text-emerald-400 font-semibold`}
                      title="Paste research text to review against rulebook"
                    >
                      <FileText size={12} />
                      <span>Paste Research</span>
                    </button>
                    <button
                      onClick={() => handleScanBooks(null)}
                      disabled={busy === 'book-scan' || books.length === 0}
                      className={btn}
                    >
                      {busy === 'book-scan' ? <RotateCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
                      <span>{findings.length > 0 ? 'Re-scan Books' : 'Scan Books'}</span>
                    </button>
                  </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5 text-[11px]">
                  {/* Status Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mr-1">Status:</span>
                    {[
                      { id: 'pending', label: 'Pending Review', count: pendingFindingsCount },
                      { id: 'accepted', label: 'Applied', count: findings.filter((f) => f.status === 'accepted').length },
                      { id: 'dismissed', label: 'Ignored', count: findings.filter((f) => f.status === 'dismissed').length },
                      { id: 'all', label: 'All', count: findings.length }
                    ].map((st) => (
                      <button
                        key={st.id}
                        onClick={() => setFindingsStatusFilter(st.id)}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all ${findingsStatusFilter === st.id ? (isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-slate-900') : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        {st.label} ({st.count})
                      </button>
                    ))}
                  </div>

                  {/* Type Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mr-1">Type:</span>
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'conflict', label: 'Conflicts' },
                      { id: 'addition', label: 'Additions' },
                      { id: 'refinement', label: 'Refinements' }
                    ].map((ty) => (
                      <button
                        key={ty.id}
                        onClick={() => setFindingsTypeFilter(ty.id)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${findingsTypeFilter === ty.id ? (isDark ? 'bg-white/15 text-white' : 'bg-black/10 text-slate-900') : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        {ty.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Findings Cards List */}
                {filteredFindings.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-500/30 p-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                    <CheckCircle size={22} className="opacity-40 text-emerald-500" />
                    <span>No findings matching this filter. {books.length > 0 ? 'Click "Scan Books" or "Paste Research" to run a comparative audit.' : 'Upload a book or paste research to begin.'}</span>
                    <button
                      onClick={() => setRulebookTab('paste')}
                      className={`${ghost} text-emerald-400 font-semibold mt-1`}
                    >
                      <FileText size={12} />
                      <span>Paste Research to Review</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3.5">
                    {filteredFindings.map((finding) => {
                      const isConflict = finding.type === 'conflict';
                      const isAddition = finding.type === 'addition';
                      const isPending = finding.status === 'pending';
                      const isEditing = editingFindingId === finding.id;

                      const cardBorder = isConflict
                        ? 'border-red-500/40 bg-red-500/5'
                        : isAddition
                        ? 'border-sky-500/40 bg-sky-500/5'
                        : 'border-emerald-500/40 bg-emerald-500/5';

                      return (
                        <div
                          key={finding.id}
                          className={`rounded-xl p-4 border transition-all ${cardBorder} ${isDark ? '' : 'bg-white/90 shadow-sm'}`}
                        >
                          {/* Card Header */}
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                                  isConflict
                                    ? 'bg-red-500/20 text-red-400 border-red-500/40'
                                    : isAddition
                                    ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                }`}
                              >
                                {isConflict ? 'Clinical Conflict' : isAddition ? 'Missing Protocol' : 'Refinement'}
                              </span>

                              <span className="text-[10px] text-slate-400 font-semibold">
                                Target: <strong>{finding.section_target}</strong>
                              </span>

                              <span className="text-[10px] text-slate-500">
                                Source: <em>{finding.book_title}</em> ({finding.citation})
                              </span>
                            </div>

                            <span
                              className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                finding.status === 'pending'
                                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                  : finding.status === 'accepted'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'
                              }`}
                            >
                              {finding.status === 'pending' ? 'Pending Arbitration' : finding.status === 'accepted' ? 'Applied to Rulebook' : 'Ignored'}
                            </span>
                          </div>

                          {/* Title */}
                          <h4 className="text-xs font-black text-slate-100 mb-2">
                            {finding.title}
                          </h4>

                          {/* Comparison Box (For Conflicts) */}
                          {isConflict && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                              {/* Current Rule */}
                              <div className={`rounded-lg p-3 border text-xs ${isDark ? 'bg-slate-950/60 border-red-500/20' : 'bg-red-50/70 border-red-200'}`}>
                                <div className="text-[9px] font-bold uppercase tracking-wider text-red-400 mb-1 flex items-center gap-1">
                                  <XCircle size={10} /> Active Rulebook Guidance
                                </div>
                                <p className="text-[11px] leading-relaxed text-slate-300">
                                  {finding.current_rule || 'Current standard baseline.'}
                                </p>
                              </div>

                              {/* Book Recommendation */}
                              <div className={`rounded-lg p-3 border text-xs ${isDark ? 'bg-slate-950/60 border-emerald-500/20' : 'bg-emerald-50/70 border-emerald-200'}`}>
                                <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 mb-1 flex items-center gap-1">
                                  <CheckCircle size={10} /> Book Recommendation & Evidence
                                </div>
                                <p className="text-[11px] leading-relaxed text-slate-300">
                                  {finding.book_recommendation}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* For Additions / Refinements */}
                          {!isConflict && (
                            <div className={`rounded-lg p-3 border text-xs mb-3 ${isDark ? 'bg-slate-950/60 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                              <div className="text-[9px] font-bold uppercase tracking-wider text-sky-400 mb-1 flex items-center gap-1">
                                <Plus size={10} /> Proposed Protocol
                              </div>
                              <p className="text-[11px] leading-relaxed text-slate-300 font-mono">
                                {finding.proposed_text}
                              </p>
                            </div>
                          )}

                          {/* Explanation */}
                          {finding.explanation && (
                            <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                              <strong className="text-slate-300">Clinical Rationale:</strong> {finding.explanation}
                            </p>
                          )}

                          {/* Inline Edit Box */}
                          {isEditing && (
                            <div className="flex flex-col gap-2 mb-3 p-3 rounded-lg border border-amber-500/30 bg-slate-950/80">
                              <label className="text-[9px] font-bold uppercase tracking-wider text-amber-400">
                                Customise Proposed Text Before Applying
                              </label>
                              <textarea
                                className={`${field} font-mono text-xs`}
                                rows={4}
                                value={editingFindingText}
                                onChange={(e) => setEditingFindingText(e.target.value)}
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleResolveFinding(finding, isConflict ? 'replace' : 'add', editingFindingText)}
                                  disabled={busy === `res-${finding.id}` || !editingFindingText.trim()}
                                  className={btn}
                                >
                                  {busy === `res-${finding.id}` ? <RotateCw size={12} className="animate-spin" /> : <Save size={12} />}
                                  <span>Apply Custom Text</span>
                                </button>
                                <button
                                  onClick={() => { setEditingFindingId(null); setEditingFindingText(''); }}
                                  className={ghost}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          {/* User Decision Controls (Arbitration Buttons) */}
                          {isPending && !isEditing && (
                            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
                              {isConflict ? (
                                <>
                                  <button
                                    onClick={() => handleResolveFinding(finding, 'replace')}
                                    disabled={busy === `res-${finding.id}`}
                                    className={btn}
                                    title="Replace the conflicting rule in the rulebook with the book's recommendation"
                                  >
                                    {busy === `res-${finding.id}` ? <RotateCw size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                                    <span>Replace Rule</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingFindingId(finding.id);
                                      setEditingFindingText(finding.proposed_text || finding.book_recommendation || '');
                                    }}
                                    className={ghost}
                                    title="Fine-tune wording before applying"
                                  >
                                    <Edit3 size={12} />
                                    <span>Edit & Apply</span>
                                  </button>
                                  <button
                                    onClick={() => handleResolveFinding(finding, 'dismiss')}
                                    disabled={busy === `res-${finding.id}`}
                                    className={`${ghost} text-slate-400 hover:text-slate-200 ml-auto`}
                                    title="Reject change and retain your existing rulebook guidance"
                                  >
                                    <XCircle size={12} />
                                    <span>Ignore / Keep Current</span>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleResolveFinding(finding, 'add')}
                                    disabled={busy === `res-${finding.id}`}
                                    className={btn}
                                    title="Add this new protocol under the specified section of the rulebook"
                                  >
                                    {busy === `res-${finding.id}` ? <RotateCw size={12} className="animate-spin" /> : <Plus size={12} />}
                                    <span>Add to Rulebook</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingFindingId(finding.id);
                                      setEditingFindingText(finding.proposed_text || '');
                                    }}
                                    className={ghost}
                                    title="Edit wording before adding"
                                  >
                                    <Edit3 size={12} />
                                    <span>Edit & Add</span>
                                  </button>
                                  <button
                                    onClick={() => handleResolveFinding(finding, 'dismiss')}
                                    disabled={busy === `res-${finding.id}`}
                                    className={`${ghost} text-slate-400 hover:text-slate-200 ml-auto`}
                                    title="Dismiss this addition"
                                  >
                                    <XCircle size={12} />
                                    <span>Ignore</span>
                                  </button>
                                </>
                              )}
                            </div>
                          )}

                          {/* Stamped Outcome If Resolved */}
                          {!isPending && (
                            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
                              <span>
                                {finding.status === 'accepted'
                                  ? (isConflict ? 'Decision: Replaced existing rule with book guidance.' : 'Decision: Added protocol to rulebook.')
                                  : 'Decision: Ignored (current rule retained).'}
                              </span>
                              {finding.user_action_at && (
                                <span>{new Date(finding.user_action_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: PASTE & REVIEW RESEARCH DIRECTLY */}
            {rulebookTab === 'paste' && (
              <div className="flex flex-col gap-4">
                <div className={`rounded-xl p-4 border ${isDark ? 'bg-slate-950/30 border-white/5' : 'bg-white/80 border-[#2E2B27]/10'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                    <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                      <FileText size={13} className="text-emerald-500" />
                      Paste Clinical Research or Running Notes
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => {
                          setPasteTitle('Dr Michael Riddell: 10s Sprint Catecholamine Blunting Study');
                          setPasteSource('The Lancet Diabetes & Endocrinology (2024)');
                          setPasteText(`Clinical trials in endurance runners with Type 1 Diabetes established that performing an all-out 10-second maximal sprint either immediately before initiating aerobic running or directly upon detecting an acute downward glucose slope triggers an intense sympathetic neuro-endocrine release of adrenaline and noradrenaline. 

This catecholamine surge stimulates acute hepatic glucose production (glycogenolysis) exceeding muscular glucose disposal for 30–60 minutes, stabilizing blood glucose or raising it by 1.2–2.2 mmol/L without needing upfront carbohydrate consumption. 

Key Clinical Finding: If starting glucose is between 5.0 and 6.5 mmol/L with a flat or dropping arrow, an immediate 10-second sprint provides a non-caloric glycemic buffer, allowing the runner to set out without digestive discomfort or delayed gastrointestinal distress.`);
                        }}
                        className={`${ghost} text-[10px] py-1 px-2`}
                        title="Load clinical research sample on 10s sprints blunting hypos"
                      >
                        <Sparkles size={11} className="text-yellow-400" />
                        <span>Sample 1 (Sprint Blunting)</span>
                      </button>

                      <button
                        onClick={() => {
                          setPasteTitle('Exogenous Carbohydrate Oxidation: Dual-Source vs Glucose Alone');
                          setPasteSource('Medicine & Science in Sports & Exercise / ISPAD');
                          setPasteText(`Investigation into endurance athletes running with T1D for durations exceeding 90 minutes demonstrated that single-source glucose absorption saturates intestinal SGLT1 transporters at approximately 60 grams per hour (1.0 g/min). Ingesting more than 60 g/h of pure dextrose or maltodextrin leads to gastric distress and osmotic fluid shifts.

Conversely, utilizing a multiple-transportable carbohydrate formulation (2:1 Glucose-to-Fructose or Maltodextrin-to-Fructose ratio) engages both SGLT1 and GLUT5 transporters in the gut, increasing total exogenous carbohydrate absorption ceiling to 80–90 grams per hour. 

Furthermore, during ambient temperatures exceeding 24°C, supplementing each litre of hydration with 500–700 mg of sodium maintains microvascular perfusion and eliminates the 10–15 minute sensor lag typically observed in dehydrated runners.`);
                        }}
                        className={`${ghost} text-[10px] py-1 px-2`}
                        title="Load clinical research sample on dual-source fueling in heat"
                      >
                        <Sparkles size={11} className="text-yellow-400" />
                        <span>Sample 2 (Dual-Source Fueling)</span>
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
                    Paste raw research papers, study abstracts, clinical trial observations, endocrinology guidance, or your own structured run experiments. Gemini AI cross-examines the text against your active <em>Running with T1D Rulebook</em> to identify contradictions, missing protocols, or precision refinements, and presents them in the Arbitration board for your decision.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className={label}>Research Title / Topic</label>
                      <input
                        className={field}
                        type="text"
                        value={pasteTitle}
                        onChange={(e) => setPasteTitle(e.target.value)}
                        placeholder="e.g. Ketone Kinetics & Aerobic Thresholds in T1D Runners"
                      />
                    </div>

                    <div>
                      <label className={label}>Source / Author / Publication (Optional)</label>
                      <input
                        className={field}
                        type="text"
                        value={pasteSource}
                        onChange={(e) => setPasteSource(e.target.value)}
                        placeholder="e.g. ISPAD Clinical Consensus / DOI: 10.1111/pedi.13421"
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className={label}>Research Text / Clinical Notes</label>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500">
                        <span>{pasteText.length.toLocaleString()} characters</span>
                        <span>•</span>
                        <span>{pasteText.split(/\s+/).filter(Boolean).length} words</span>
                        {pasteText && (
                          <button
                            onClick={() => { setPasteText(''); setPasteTitle(''); setPasteSource(''); }}
                            className="text-red-400 hover:underline ml-2"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                    <textarea
                      rows={8}
                      className={`${field} font-mono text-[11px] leading-relaxed`}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder="Paste research text, study findings, trial protocol, or personal training experiment log here..."
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={pasteSaveAsBook}
                        onChange={(e) => setPasteSaveAsBook(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span>Also save and index this note in my Uploaded Books & Literature Library</span>
                    </label>

                    <button
                      onClick={handleReviewPastedResearch}
                      disabled={!pasteText.trim() || pasteText.trim().length < 20 || busy === 'research-review'}
                      className={`${btn} px-5`}
                    >
                      {busy === 'research-review' ? (
                        <>
                          <RotateCw size={13} className="animate-spin" />
                          <span>Cross-examining against Rulebook...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} className="text-yellow-400" />
                          <span>Review Research Against Rulebook</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Targets */}
          {targets && (
            <div className={panel}>
              <h2 className="text-xs font-black uppercase tracking-wider mb-3">Your targets and assumptions</h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
                <div><label className={label}>Start target (mmol/L)</label><input className={field} type="number" step="0.1" value={targets.startTarget} onChange={(e) => setTargets({ ...targets, startTarget: e.target.value })} /></div>
                <div><label className={label}>Never below (mmol/L)</label><input className={field} type="number" step="0.1" value={targets.floor} onChange={(e) => setTargets({ ...targets, floor: e.target.value })} /></div>
                <div><label className={label}>Weight (kg, optional)</label><input className={field} type="number" value={targets.weightKg ?? ''} onChange={(e) => setTargets({ ...targets, weightKg: e.target.value })} /></div>
                <div><label className={label}>Insulin stronger during exercise (x)</label><input className={field} type="number" step="0.1" min="1" max="10" value={targets.sensMult} onChange={(e) => setTargets({ ...targets, sensMult: e.target.value })} /></div>
                <button onClick={saveTargets} className={btn}><Save size={13} />Save</button>
              </div>
              <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">Exercise raises glucose uptake by muscle (roughly 1.5 to 10 times with intensity, most of it without insulin) and also makes insulin work harder during and for hours after. There is no single published multiplier, so 1.5 is an adjustable starting assumption: raise it if you tend to fall faster with insulin on board, lower it if not.</p>
            </div>
          )}
        </>
      )}
    </PortalShell>
  );
}
