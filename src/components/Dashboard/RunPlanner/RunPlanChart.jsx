import React, { useMemo, useRef, useState } from 'react';
import { dist, elev, elevUnit } from '../../../utils/units';

// The Run Plan chart: glucose, hydration, insulin on board and the course, on one time axis, so you
// can see the climbs pull glucose down, where the carbs and sips go, and how it settles afterwards.
// Everything comes from the planner (/api/planner/estimate) and redraws as the pace, time or anything
// else on the page changes. Hover for the numbers at any minute.

const gradeFill = (g) => (g >= 8 ? '#dc2626' : g >= 4 ? '#f97316' : g >= 1.5 ? '#facc15' : g <= -3 ? '#38bdf8' : '#22c55e');
const at = (series, m) => {
  if (!series?.length) return null;
  let best = series[0];
  for (const p of series) { if (p[0] > m) break; best = p; }
  return best;
};

export default function RunPlanChart({ plan, isDark, units = 'km' }) {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const d = useMemo(() => {
    if (!plan?.prediction?.length) return null;
    const dur = plan.run.durationMin;
    const total = plan.prediction.at(-1)[0];
    const W = 900, L = 44, R = 12;
    const rows = { bg: [8, 200], fluid: [222, 56], iob: [292, 34], ele: [340, 82] };
    const H = 444;
    const X = (m) => L + (m / total) * (W - L - R);
    const maxBg = Math.max(12, Math.ceil(Math.max(...plan.prediction.map((p) => p[1]), ...plan.withoutCarbs.map((p) => p[1])) + 1));
    const Ybg = (v) => rows.bg[0] + (1 - (Math.min(maxBg, Math.max(2, v)) - 2) / (maxBg - 2)) * rows.bg[1];
    const line = (pts, Y) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
    // effort shading behind the glucose (run only)
    const eff = (plan.effortSeries || []).filter((p) => p[0] <= dur);
    const effMax = Math.max(1.2, ...eff.map((p) => p[1]));
    // hydration
    const hyd = plan.hydrationSeries || [];
    const fMax = Math.max(100, hyd.at(-1)?.[1] || 0);
    const Yf = (v) => rows.fluid[0] + (1 - v / fMax) * rows.fluid[1];
    // insulin on board
    const iob = plan.iobSeries || [];
    const iMax = Math.max(0.5, ...iob.map((p) => p[1]));
    const Yi = (v) => rows.iob[0] + (1 - v / iMax) * rows.iob[1];
    // course: elevation by minute, coloured by gradient
    const ele = plan.elevation || [];
    const eVals = ele.map((e) => e[2]);
    const eMin = Math.min(...eVals, 0), eMax = Math.max(...eVals, eMin + 5);
    const Ye = (v) => rows.ele[0] + (1 - (v - eMin) / (eMax - eMin)) * (rows.ele[1] - 4);
    const eleSegs = ele.slice(1).map((e, i) => {
      const a = ele[i]; const kmSpan = Math.max(0.001, e[1] - a[1]);
      return { x1: X(a[0]), x2: X(e[0]), y1: Ye(a[2]), y2: Ye(e[2]), fill: gradeFill(((e[2] - a[2]) / (kmSpan * 1000)) * 100) };
    });
    const ticks = []; for (let m = 0; m <= total; m += total > 150 ? 30 : 15) ticks.push(m);
    return { dur, total, W, H, L, R, rows, X, Ybg, Yf, Yi, Ye, line, eff, effMax, hyd, fMax, iob, iMax, ele, eMin, eMax, eleSegs, ticks, maxBg };
  }, [plan]);

  if (!d) return null;
  const { dur, total, W, H, L, R, rows, X, Ybg, Yf, Yi, Ye, line } = d;
  const ink = isDark ? '#cbd5e1' : '#2E2B27';
  const grid = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(46,43,39,0.08)';
  // panel titles sit just inside the plot, top right, clear of the axis numbers and carb tags
  const label = (y, text, colour) => <text x={W - R - 4} y={y} fontSize="10" fontWeight="800" textAnchor="end" fill={colour} opacity="0.9">{text}</text>;

  const onMove = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const m = Math.max(0, Math.min(total, ((x - L) / (W - L - R)) * total));
    setHover(m);
  };
  const h = hover != null ? {
    m: Math.round(hover),
    bg: at(plan.prediction, hover)?.[1], noCarb: at(plan.withoutCarbs, hover)?.[1],
    effort: hover <= dur ? at(d.eff, hover)?.[1] : null, fluid: at(d.hyd, hover)?.[1], iob: at(d.iob, hover)?.[1],
    ele: hover <= dur ? at(d.ele, hover) : null,
  } : null;

  return (
    <div>
      <div className="overflow-x-auto">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[640px] select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Run plan: glucose, hydration, insulin and course over time">
          {/* run window and effort shading */}
          {d.eff.slice(1).map((p, i) => (
            <rect key={i} x={X(d.eff[i][0])} y={rows.bg[0]} width={Math.max(0.5, X(p[0]) - X(d.eff[i][0]))} height={rows.ele[0] + rows.ele[1] - rows.bg[0]}
              fill="#f97316" fillOpacity={Math.max(0, Math.min(0.22, ((p[1] - 0.7) / (d.effMax - 0.7)) * 0.22))} />
          ))}
          <line x1={X(dur)} x2={X(dur)} y1={rows.bg[0]} y2={rows.ele[0] + rows.ele[1]} stroke={ink} strokeOpacity="0.35" strokeDasharray="3 3" />
          <text x={X(dur) + 4} y={rows.bg[0] + rows.bg[1] - 4} fontSize="9" fontWeight="700" fill={ink} opacity="0.6">finish → recovery</text>

          {/* glucose */}
          {label(rows.bg[0] + 10, 'GLUCOSE', '#0284c7')}
          {[plan.settings.floor, plan.settings.startTarget, 10].map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={Ybg(v)} y2={Ybg(v)} stroke={v === plan.settings.floor ? '#ef4444' : v === 10 ? '#f59e0b' : '#16a34a'} strokeDasharray="4 3" strokeOpacity="0.8" />
              <text x={L - 4} y={Ybg(v) + 3} fontSize="9" fontWeight="700" textAnchor="end" fill={v === plan.settings.floor ? '#dc2626' : v === 10 ? '#d97706' : '#16a34a'}>{v}</text>
            </g>
          ))}
          <rect x={L} y={Ybg(10)} width={W - L - R} height={Ybg(plan.settings.floor) - Ybg(10)} fill="#22c55e" fillOpacity="0.05" />
          <path d={line(plan.withoutCarbs, Ybg)} fill="none" stroke={isDark ? '#94a3b8' : '#64748b'} strokeWidth="1.5" strokeDasharray="5 4" />
          <path d={line(plan.prediction, Ybg)} fill="none" stroke="#0284c7" strokeWidth="2.8" strokeLinejoin="round" />
          {plan.plan.stops.map((s, i) => (
            <g key={`c${i}`}>
              <line x1={X(s.minute)} x2={X(s.minute)} y1={rows.bg[0] + 14} y2={rows.bg[0] + rows.bg[1]} stroke={isDark ? '#facc15' : '#b45309'} strokeWidth="1.6" />
              <rect x={X(s.minute) - 16} y={rows.bg[0] + 14 + (i % 2) * 15} width="32" height="13" rx="6" fill={isDark ? '#facc15' : '#f59e0b'} />
              <text x={X(s.minute)} y={rows.bg[0] + 24 + (i % 2) * 15} fontSize="9" fontWeight="900" textAnchor="middle" fill="#1c1917">{s.grams} g</text>
            </g>
          ))}

          {/* hydration */}
          {label(rows.fluid[0] + 10, 'HYDRATION', '#06b6d4')}
          <line x1={L} x2={W - R} y1={rows.fluid[0] + rows.fluid[1]} y2={rows.fluid[0] + rows.fluid[1]} stroke={grid} />
          <path d={`${line(d.hyd, Yf)} L${X(d.hyd.at(-1)[0])},${Yf(0)} L${X(0)},${Yf(0)} Z`} fill="#06b6d4" fillOpacity="0.18" stroke="#06b6d4" strokeWidth="1.6" />
          <text x={L - 4} y={Yf(d.fMax) + 8} fontSize="9" textAnchor="end" fill="#0891b2">{(d.fMax / 1000).toFixed(1)} L</text>
          {(plan.sips || []).map((s) => (
            <g key={`s${s.minute}`}>
              <path d={`M${X(s.minute)},${rows.fluid[0] + 6} q-5,8 0,12 q5,-4 0,-12 Z`} fill="#06b6d4" />
              <text x={X(s.minute) + 6} y={rows.fluid[0] + 16} fontSize="9" fontWeight="800" fill="#0891b2">{s.ml} ml</text>
            </g>
          ))}

          {/* insulin on board */}
          {label(rows.iob[0] + 10, 'INSULIN ON BOARD', '#8b5cf6')}
          <path d={`${line(d.iob, Yi)} L${X(d.iob.at(-1)[0])},${Yi(0)} L${X(0)},${Yi(0)} Z`} fill="#8b5cf6" fillOpacity="0.2" stroke="#8b5cf6" strokeWidth="1.4" />
          <text x={L - 4} y={Yi(d.iMax) + 8} fontSize="9" textAnchor="end" fill="#7c3aed">{d.iMax} U</text>

          {/* course */}
          {label(rows.ele[0] + 10, 'COURSE', ink)}
          {d.eleSegs.map((sg, i) => (
            <path key={`e${i}`} d={`M${sg.x1},${sg.y1} L${sg.x2},${sg.y2} L${sg.x2},${rows.ele[0] + rows.ele[1]} L${sg.x1},${rows.ele[0] + rows.ele[1]} Z`} fill={sg.fill} fillOpacity="0.55" />
          ))}
          <path d={line(d.ele.map((e) => [e[0], e[2]]), Ye)} fill="none" stroke={ink} strokeWidth="1.2" strokeOpacity="0.7" />
          <path d={line(d.eff, (v) => rows.ele[0] + (1 - (v - 0.5) / (d.effMax - 0.5)) * (rows.ele[1] - 4))} fill="none" stroke="#f97316" strokeWidth="1.6" strokeDasharray="1 0" />
          <text x={L - 4} y={Ye(d.eMax) + 3} fontSize="9" textAnchor="end" fill={ink} opacity="0.7">{elev(d.eMax, units)} {elevUnit(units)}</text>

          {d.ticks.map((m, i) => <text key={`t${m}`} x={X(m)} y={H - 2} fontSize="9" fontWeight="600" textAnchor={i === 0 ? 'start' : m >= total - 5 ? 'end' : 'middle'} fill={ink} opacity="0.75">{m === 0 ? 'start' : `${m} min`}</text>)}

          {/* hover */}
          {h && (
            <g pointerEvents="none">
              <line x1={X(hover)} x2={X(hover)} y1={rows.bg[0]} y2={rows.ele[0] + rows.ele[1]} stroke={ink} strokeOpacity="0.6" />
              {h.bg != null && <circle cx={X(hover)} cy={Ybg(h.bg)} r="4" fill="#0284c7" stroke="#fff" strokeWidth="1.5" />}
            </g>
          )}
        </svg>
      </div>
      <div className={`mt-1 min-h-[34px] text-[11px] rounded-lg px-3 py-1.5 ${isDark ? 'bg-white/5 text-slate-300' : 'bg-[#2E2B27]/5 text-[#2E2B27]'}`}>
        {h ? (
          <span className="flex flex-wrap gap-x-4 gap-y-0.5">
            <b>{h.m} min{h.m > dur ? ` (${h.m - dur} min after)` : ''}{h.ele ? ` · ${dist(h.ele[1], units, 2)} ${units}` : ''}</b>
            <span className="text-sky-500">glucose {h.bg}</span>
            <span className="opacity-70">no carbs {h.noCarb}</span>
            {h.effort != null && <span className="text-orange-500">effort {h.effort}×</span>}
            {h.ele && <span>height {elev(h.ele[2], units)} {elevUnit(units)}</span>}
            <span className="text-cyan-500">drunk {h.fluid} ml</span>
            <span className="text-violet-500">insulin on board {h.iob} U</span>
          </span>
        ) : (
          <span className="flex flex-wrap gap-x-4 gap-y-0.5 opacity-80">
            <span><span className="inline-block w-3 h-1 bg-sky-600 align-middle mr-1 rounded" />glucose with the plan</span>
            <span><span className="inline-block w-3 h-1 bg-slate-400 align-middle mr-1 rounded" />no carbs</span>
            <span><span className="inline-block w-3 h-2 bg-orange-500/40 align-middle mr-1" />harder stretches</span>
            <span><span className="inline-block w-3 h-2 align-middle mr-1 rounded" style={{ background: 'linear-gradient(90deg,#22c55e,#facc15,#f97316,#dc2626)' }} />climb steepness</span>
            <span>hover for the numbers at any minute</span>
          </span>
        )}
      </div>
    </div>
  );
}
