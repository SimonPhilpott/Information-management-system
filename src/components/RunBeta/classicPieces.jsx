// Run planner: the route map, elevation profile and demand card the run's panels use. They came from the classic
// page (Dashboard/RunPlannerPortal.jsx), retired on 24 Oct 2026 when this design replaced it.
import React, { useMemo } from 'react';
import { Route as RouteIcon, RotateCw, LogIn, Lock, Upload, Link2, Trash2, Mountain, Calculator, AlertTriangle, Save, Cookie, Syringe, BookOpen, Unlink, Download, ExternalLink, Edit3, Check, Copy, ChevronDown, ChevronUp, Sparkles, Shield, HeartPulse, Zap, Clock, FileText, Plus, CheckCircle, XCircle, ArrowRight, HelpCircle, Layers, Sliders, AlertCircle, Compass, GraduationCap, Printer, Moon, X } from 'lucide-react';
import { dist, paceText, KM_PER_MI } from '../../utils/units';


const fmtMin = (m) => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')} min`;

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
export function RouteMap({ route, units }) {
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
    <div className="rounded-xl overflow-hidden border border-white/10 relative w-full max-w-full min-w-0">
      <svg viewBox={`0 0 ${view.W} ${view.H}`} className="w-full max-w-full h-auto block bg-slate-200" role="img" aria-label={`Map of ${route.name}`}>
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
      <div className="absolute top-2 right-2 max-w-[calc(100%-1rem)] rounded-lg px-2 py-1 text-[9px] font-bold bg-slate-900/80 text-white flex flex-wrap justify-end gap-x-2 gap-y-0.5">
        <span><span className="inline-block w-2 h-2 rounded-full align-middle mr-1" style={{ background: '#22c55e' }} />flat</span>
        <span><span className="inline-block w-2 h-2 rounded-full align-middle mr-1" style={{ background: '#f59e0b' }} />climb</span>
        <span><span className="inline-block w-2 h-2 rounded-full align-middle mr-1" style={{ background: '#ef4444' }} />steep</span>
        <span><span className="inline-block w-2 h-2 rounded-full align-middle mr-1" style={{ background: '#38bdf8' }} />down</span>
      </div>
    </div>
  );
}

export function ElevationProfile({ route, units }) {
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
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-full h-auto block" role="img" aria-label="Elevation profile">
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

export function DemandCard({ demand, units, isDark }) {
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
        {chip('Time at this pace', `${Math.floor((r.durationMin || 0) / 60) ? `${Math.floor((r.durationMin || 0) / 60)} h ` : ''}${Math.round((r.durationMin || 0) % 60)} min`)}
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
        <summary className="rp-title cursor-pointer font-bold text-[11px] uppercase tracking-wider opacity-80">Kilometre by kilometre (your average pace, adjusted for the hills)</summary>
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

