import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Route as RouteIcon, RotateCw, LogIn, Lock, Upload, Link2, Trash2, Mountain, Calculator, AlertTriangle, Save, Cookie, Syringe, BookOpen, Unlink, Download, ExternalLink } from 'lucide-react';
import PortalShell from './PortalShell';
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
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notification, setNotification] = useState(null);
  const fileRef = useRef(null);

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
                  {chip('Estimated time', fmtMin(plan.run.durationMin))}
                  {chip('Average pace', `${paceText(plan.inputs.averagePaceMinPerKm, units)} /${units}`)}
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

          {/* Targets */}
          {targets && (
            <div className={panel}>
              <h2 className="text-xs font-black uppercase tracking-wider mb-3">Your targets and assumptions</h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
                <div><label className={label}>Start target (mmol/L)</label><input className={field} type="number" step="0.1" value={targets.startTarget} onChange={(e) => setTargets({ ...targets, startTarget: e.target.value })} /></div>
                <div><label className={label}>Never below (mmol/L)</label><input className={field} type="number" step="0.1" value={targets.floor} onChange={(e) => setTargets({ ...targets, floor: e.target.value })} /></div>
                <div><label className={label}>Weight (kg, optional)</label><input className={field} type="number" value={targets.weightKg ?? ''} onChange={(e) => setTargets({ ...targets, weightKg: e.target.value })} /></div>
                <div><label className={label}>Insulin stronger during exercise (x)</label><input className={field} type="number" step="0.1" min="1" max="3" value={targets.sensMult} onChange={(e) => setTargets({ ...targets, sensMult: e.target.value })} /></div>
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
