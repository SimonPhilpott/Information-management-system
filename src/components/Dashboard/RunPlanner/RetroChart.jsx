import React, { useMemo, useRef, useState } from 'react';
import { dist, elev, elevUnit } from '../../../utils/units';
import { makeTimeScale } from './timeScale';

// The retrospective chart, laid out like the Run Plan chart: glucose, water, insulin on board and the course
// on one time axis. Your real glucose is the thick line (green between your floor and start target, red below,
// yellow above); the plan's prediction is dashed grey and the model replayed with what you actually took is
// dotted blue (purple: fitted to this run). Carb pills sit on their lines - solid where taken, hollow where
// planned but skipped or not recorded, with an arrow when taken late or early. Water bars sit beneath their
// carb lines. Your notes are numbered dots on the glucose line. Hover for the numbers at any minute.

const gradeFill = (g) => (g >= 8 ? '#dc2626' : g >= 4 ? '#f97316' : g >= 1.5 ? '#facc15' : g <= -3 ? '#38bdf8' : '#22c55e');
const near = (series, m, maxGap = 6) => {
  if (!series?.length) return null;
  let best = null;
  for (const p of series) if (!best || Math.abs(p[0] - m) < Math.abs(best[0] - m)) best = p;
  return best && Math.abs(best[0] - m) <= maxGap ? best : null;
};

// playheadMin / onSeek: the Flythrough's replay of a completed run - a marker on your real glucose, click to jump
export default function RetroChart({ a, notes = [], isDark = false, units = 'km', staticRender = false, playheadMin = null, onSeek = null }) {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const d = useMemo(() => {
    if (!a?.actual?.length) return null;
    const dur = a.run.durationMin;
    // the same frame as the Run plan chart (Glucose, hydration, insulin & course): time from the start, the
    // same panels and sizes, so the two read the same way
    const from = 0, to = dur + 120;
    const W = 900, L = 44, R = 12;
    const hasEle = Boolean(a.elevation?.length > 1);
    const STRIP = 0;
    const rows = { bg: [8, 200], fluid: [222, 56], iob: [292, 34], ele: [340, 82] };
    const H = hasEle ? 444 : 344;
    const scale = makeTimeScale({ L, W, R, dur, total: to, from });
    const X = scale.X;
    const all = [...a.actual, ...(a.planned || []), ...(a.asModelled || []), ...(a.fitted || [])].map((p) => p[1]).filter((v) => v != null);
    // headroom above the highest reading keeps the carb labels at the top clear of the lines
    // the carb labels take the top ~23% of the panel: set the top of the scale so the highest reading sits below them
    const minBg = Math.min(2, Math.floor(Math.min(...all)));
    const maxBg = Math.max(12, Math.ceil((Math.max(...all) - 0.25 * minBg) / 0.75));
    const Ybg = (v) => rows.bg[0] + STRIP + (1 - (Math.min(maxBg, Math.max(minBg, v)) - minBg) / (maxBg - minBg)) * (rows.bg[1] - STRIP);
    const line = (pts, Y) => pts.filter((p) => p[1] != null && p[0] >= from && p[0] <= to).map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
    const off = a.run.startOffsetMin || 0;

    // carbs: each planned stop with what happened to it, plus extras that weren't planned
    const taken = (a.intakesOnRunClock || []).map((x) => ({ ...x }));
    const stops = [];
    for (const t of (a.timing || [])) {
      const plannedAt = t.plannedMinute - off;
      const got = taken.find((x) => x.plannedMinute != null && Math.abs(x.plannedMinute - plannedAt) < 0.6 && !x.used);
      if (got) got.used = true;
      stops.push({ plannedAt, at: got ? got.minute : null, grams: got ? got.grams : t.grams, ml: got ? got.ml : t.ml, status: got ? 'taken' : t.action === 'skipped' ? 'skipped' : 'not recorded', planned: true });
    }
    for (const x of taken.filter((t) => !t.used)) stops.push({ plannedAt: null, at: x.minute, grams: x.grams, ml: x.ml, status: 'taken', planned: false });
    const carbStops = stops.filter((x) => x.grams > 0).sort((p, q) => (p.at ?? p.plannedAt) - (q.at ?? q.plannedAt));
    const water = stops.filter((x) => x.ml > 0).sort((p, q) => (p.at ?? p.plannedAt) - (q.at ?? q.plannedAt));
    // a drink close to the one before gets its label raised a row, so the two never overlap
    water.forEach((w, i) => { const pv = water[i - 1]; w.raised = Boolean(pv && !pv.raised && X(w.at ?? w.plannedAt) - X(pv.at ?? pv.plannedAt) < 75); });
    const drinkMax = Math.max(100, ...water.map((w) => w.ml));
    const drunk = water.filter((w) => w.status === 'taken').reduce((n, w) => n + w.ml, 0);

    const iob = (a.iob || []).filter((p) => p[0] >= from && p[0] <= to);
    const iMax = Math.max(0.5, ...iob.map((p) => p[1]));
    const Yi = (v) => rows.iob[0] + (1 - v / iMax) * rows.iob[1];

    const ele = hasEle ? a.elevation : [];
    const eVals = ele.map((e) => e[2]);
    const eMin = hasEle ? Math.min(...eVals) : 0, eMax = hasEle ? Math.max(...eVals, eMin + 5) : 1;
    const Ye = (v) => rows.ele[0] + (1 - (v - eMin) / (eMax - eMin)) * (rows.ele[1] - 4);
    // effort through the run from the gradient (as the planner models it): harder on climbs, easier downhill
    const eff = [];
    for (let i = 1; i < ele.length; i++) {
      const p = ele[i - 1], e = ele[i];
      const g = ((e[2] - p[2]) / (Math.max(0.001, e[1] - p[1]) * 1000)) * 100;
      eff.push([e[0], Math.max(0.7, Math.min(1.6, 1 + 0.03 * Math.max(0, g) - 0.012 * Math.max(0, -g)))]);
    }
    if (eff.length) eff.unshift([0, eff[0][1]]);
    const effMax = Math.max(1.2, ...eff.map((x) => x[1]));
    const eleSegs = ele.slice(1).map((e, i) => {
      const p = ele[i]; const kmSpan = Math.max(0.001, e[1] - p[1]);
      return { x1: X(p[0]), x2: X(e[0]), y1: Ye(p[2]), y2: Ye(e[2]), fill: gradeFill(((e[2] - p[2]) / (kmSpan * 1000)) * 100) };
    });
    const ticks = scale.ticks;
    const noteDots = notes.filter((n) => n.minute != null).map((n, i) => {
      const m = n.minute - off;
      const p = near(a.actual, m, 10);
      return { n: i + 1, m, y: p ? Ybg(p[1]) : rows.bg[0] + 30, text: n.text };
    });
    return { inv: scale.inv, STRIP, eff, effMax, dur, from, to, W, H, L, R, rows, X, Ybg, Yi, Ye, line, carbStops, water, drinkMax, drunk, iob, iMax, ele, eMin, eMax, eleSegs, hasEle, ticks, noteDots, maxBg };
  }, [a, notes]);

  if (!d) return null;
  const { dur, from, to, W, H, L, R, rows, X, Ybg, Yi, Ye, line } = d;
  const ink = isDark ? '#cbd5e1' : '#2E2B27';
  const grid = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(46,43,39,0.08)';
  const amber = isDark ? '#facc15' : '#b45309';
  const pill = isDark ? '#facc15' : '#f59e0b';
  const label = (y, text, colour) => <text x={W - R - 4} y={y} fontSize="10" fontWeight="800" textAnchor="end" fill={colour} opacity="0.9">{text}</text>;
  const gid = `retroBands-${a.run.id}`;
  const bandOff = (v) => Math.max(0, Math.min(1, (Ybg(v) - rows.bg[0]) / rows.bg[1]));

  const minuteAt = (clientX) => {
    const r = svgRef.current.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    return d.inv(x);
  };
  const onMove = (e) => { if (!staticRender) setHover(minuteAt(e.clientX)); };
  // the readout follows the mouse, or the replay's playhead when the mouse is elsewhere
  const pm = playheadMin != null ? Math.max(0, Math.min(to, playheadMin)) : null;
  const probe = hover ?? pm;
  const h = probe != null ? {
    m: Math.round(probe),
    bg: near(a.actual, probe)?.[1], planned: near(a.planned, probe, 3)?.[1], model: near(a.asModelled, probe, 3)?.[1], fitted: near(a.fitted, probe, 3)?.[1],
    iob: near(d.iob, probe)?.[1],
    carbs: d.carbStops.filter((s) => Math.abs((s.at ?? s.plannedAt) - probe) <= 1.5),
    note: d.noteDots.find((n) => Math.abs(n.m - probe) <= 2),
    ele: probe >= 0 && probe <= dur ? near(d.ele, probe, 4) : null,
  } : null;
  const pmColour = pm != null && pm > dur ? '#a855f7' : '#0ea5e9';
  const tone = (v) => (v < a.floor ? 'text-red-500' : v > a.startTarget ? 'text-yellow-500' : 'text-green-600');

  return (
    <div>
      <div className={staticRender ? '' : 'overflow-x-auto'}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[640px] select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={(e) => { if (onSeek) onSeek(Math.max(0, minuteAt(e.clientX))); }} style={{ cursor: onSeek ? 'pointer' : undefined }} role="img" aria-label="Run retrospective: your glucose against the plan, with carbs, water, insulin on board and the course">
          {/* the run itself, shaded; before and after left clear */}
          {d.eff.length > 1 ? d.eff.slice(1).map((p, i) => (
            <rect key={`s${i}`} x={X(d.eff[i][0])} y={rows.bg[0]} width={Math.max(0.5, X(p[0]) - X(d.eff[i][0]))} height={rows.ele[0] + rows.ele[1] - rows.bg[0]}
              fill="#f97316" fillOpacity={Math.max(0.03, Math.min(0.22, ((p[1] - 0.7) / (d.effMax - 0.7)) * 0.22))} />
          )) : <rect x={X(0)} y={rows.bg[0]} width={X(dur) - X(0)} height={rows.iob[0] + rows.iob[1] - rows.bg[0]} fill="#f97316" fillOpacity="0.08" />}
          <line x1={X(dur)} x2={X(dur)} y1={rows.bg[0]} y2={d.hasEle ? rows.ele[0] + rows.ele[1] : rows.iob[0] + rows.iob[1]} stroke={ink} strokeOpacity="0.35" strokeDasharray="3 3" />
          <text x={X(dur) + 4} y={rows.bg[0] + rows.bg[1] - 4} fontSize="9" fontWeight="700" fill={ink} opacity="0.6">after the run · 2 hours, compressed</text>

          {/* glucose */}
          {label(rows.bg[0] + 10, 'GLUCOSE', '#16a34a')}
          {[a.floor, a.startTarget, 10].map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={Ybg(v)} y2={Ybg(v)} stroke={v === a.floor ? '#ef4444' : v === 10 ? '#f59e0b' : '#16a34a'} strokeDasharray="4 3" strokeOpacity="0.8" />
              <text x={L - 4} y={Ybg(v) + 3} fontSize="9" fontWeight="700" textAnchor="end" fill={v === a.floor ? '#dc2626' : v === 10 ? '#d97706' : '#16a34a'}>{v}</text>
            </g>
          ))}
          <text x={L - 4} y={Ybg(d.maxBg) + 8} fontSize="9" textAnchor="end" fill={ink} opacity="0.6">{d.maxBg}</text>
          <rect x={L} y={Ybg(10)} width={W - L - R} height={Ybg(a.floor) - Ybg(10)} fill="#22c55e" fillOpacity="0.05" />
          <path d={line(a.asModelled || [], Ybg)} fill="none" stroke="#0ea5e9" strokeWidth="1.4" strokeDasharray="2 3" strokeOpacity="0.55" />
          {a.fitted && <path d={line(a.fitted, Ybg)} fill="none" stroke="#a855f7" strokeWidth="1.4" strokeDasharray="2 3" strokeOpacity="0.55" />}
          <defs>
            <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={rows.bg[0]} y2={rows.bg[0] + rows.bg[1]}>
              <stop offset={bandOff(a.startTarget)} stopColor="#eab308" />
              <stop offset={bandOff(a.startTarget)} stopColor="#16a34a" />
              <stop offset={bandOff(a.floor)} stopColor="#16a34a" />
              <stop offset={bandOff(a.floor)} stopColor="#dc2626" />
            </linearGradient>
          </defs>
          {/* expected: the plan's predicted line in full colour, dashed, behind - with its planned carb stops on it */}
          {a.planned && <path d={line(a.planned, Ybg)} fill="none" stroke={`url(#${gid})`} strokeWidth="3" strokeOpacity="0.85" strokeDasharray="9 6" strokeLinejoin="round" strokeLinecap="round" />}
          {a.planned && (a.plannedStops || []).map((s, i) => {
            const p = near(a.planned, s.minute, 3);
            return p ? (
              <g key={`ps${i}`}>
                <circle cx={X(s.minute)} cy={Ybg(p[1])} r="6.5" fill={isDark ? '#0f172a' : '#fff'} stroke="#f59e0b" strokeWidth="2.5" />
                <text x={X(s.minute)} y={Ybg(p[1]) - 10} fontSize="9" fontWeight="800" textAnchor="middle" fill={amber}>plan {s.grams} g</text>
              </g>
            ) : null;
          })}
          {/* reality: yours, bold in front */}
          <path d={line(a.actual, Ybg)} fill="none" stroke={isDark ? '#0f172a' : '#fff'} strokeWidth="6" strokeOpacity="0.9" strokeLinejoin="round" strokeLinecap="round" />
          <path d={line(a.actual, Ybg)} fill="none" stroke={`url(#${gid})`} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />

          {/* carbs: solid pill where taken, hollow where planned but not taken, arrow from plan to when taken */}
          {d.carbStops.map((s, i) => {
            const m = s.at ?? s.plannedAt;
            const y = rows.bg[0] + 14 + (i % 2) * 15;
            const moved = s.planned && s.at != null && Math.abs(s.at - s.plannedAt) >= 1;
            return (
              <g key={`c${i}`}>
                {moved && <line x1={X(s.plannedAt)} x2={X(s.plannedAt)} y1={y + 13} y2={rows.bg[0] + rows.bg[1]} stroke={amber} strokeOpacity="0.35" strokeDasharray="3 3" />}
                {moved && <path d={`M${X(s.plannedAt)},${y + 6} L${X(s.at) + (s.at > s.plannedAt ? -17 : 17)},${y + 6}`} stroke={amber} strokeWidth="1.4" markerEnd="" />}
                {moved && <path d={`M${X(s.at) + (s.at > s.plannedAt ? -17 : 17)},${y + 6} l${s.at > s.plannedAt ? -5 : 5},-3.5 l0,7 Z`} fill={amber} />}
                <line x1={X(m)} x2={X(m)} y1={y + 13} y2={rows.bg[0] + rows.bg[1]} stroke={amber} strokeWidth={s.status === 'taken' ? 1.6 : 1} strokeDasharray={s.status === 'taken' ? '' : '4 3'} />
                <line x1={X(m)} x2={X(m)} y1={rows.bg[0] + rows.bg[1]} y2={rows.fluid[0] + rows.fluid[1]} stroke={amber} strokeWidth="1" strokeOpacity="0.35" strokeDasharray="2 3" />
                <rect x={X(m) - 17} y={y} width="34" height="13" rx="6" fill={s.status === 'taken' ? pill : (isDark ? '#0f172a' : '#fff')} stroke={pill} strokeWidth="1.4" />
                <text x={X(m)} y={y + 10} fontSize="9" fontWeight="900" textAnchor="middle" fill={s.status === 'taken' ? '#1c1917' : amber}>{s.grams} g</text>
                {s.status !== 'taken' && <text x={X(m) + 20} y={y + 10} fontSize="9" fontWeight="800" fill="#dc2626">{s.status}</text>}
                {moved && <text x={X(m) + (s.at > s.plannedAt ? 20 : -20)} y={y + 10} fontSize="9" fontWeight="800" textAnchor={s.at > s.plannedAt ? 'start' : 'end'} fill={amber}>{Math.round(Math.abs(s.at - s.plannedAt))} min {s.at > s.plannedAt ? 'late' : 'early'}</text>}
                {!s.planned && <text x={X(m) + 20} y={y + 10} fontSize="9" fontWeight="800" fill={amber}>extra</text>}
              </g>
            );
          })}

          {/* your notes, numbered on the glucose line */}
          {d.noteDots.map((n) => (
            <g key={`n${n.n}`}>
              <circle cx={X(n.m)} cy={n.y} r="8" fill="#6366f1" stroke="#fff" strokeWidth="1.5" />
              <text x={X(n.m)} y={n.y + 3.5} fontSize="10" fontWeight="900" textAnchor="middle" fill="#fff">{n.n}</text>
              <title>{n.text}</title>
            </g>
          ))}

          {/* water: one bar per drink, beneath its carb line - solid if drunk, outline if planned but not */}
          {label(rows.fluid[0] + 10, 'WATER - WHAT YOU DRANK', '#06b6d4')}
          <line x1={L} x2={W - R} y1={rows.fluid[0] + rows.fluid[1]} y2={rows.fluid[0] + rows.fluid[1]} stroke={grid} />
          {d.water.map((w, i) => {
            const m = w.at ?? w.plannedAt;
            const x = X(m);
            const base = rows.fluid[0] + rows.fluid[1];
            const hgt = Math.max(6, (w.ml / d.drinkMax) * (rows.fluid[1] - 22));
            const ok = w.status === 'taken';
            return (
              <g key={`w${i}`}>
                <line x1={x} x2={x} y1={rows.fluid[0] + 2} y2={base} stroke="#06b6d4" strokeWidth="1.4" strokeDasharray={ok ? '' : '4 3'} />
                <rect x={x - 7} y={base - hgt} width="14" height={hgt} rx="2" fill="#06b6d4" fillOpacity={ok ? 0.55 : 0} stroke="#06b6d4" strokeWidth={ok ? 0 : 1.2} />
                <text x={x + 10} y={base - hgt + 8 - (w.raised ? 22 : 0)} fontSize="10" fontWeight="900" fill="#0891b2">{w.ml} ml</text>
                <text x={x + 10} y={base - hgt + 18 - (w.raised ? 22 : 0)} fontSize="8" fill={ok ? ink : '#dc2626'} opacity={ok ? 0.6 : 0.9}>{ok ? (w.grams ? 'with carbs' : 'water only') : w.status}</text>
              </g>
            );
          })}
          <text x={W - R - 4} y={rows.fluid[0] + rows.fluid[1] - 6} fontSize="10" fontWeight="800" textAnchor="end" fill="#0891b2">{d.water.length ? `Total ${d.drunk} ml drunk` : 'No water recorded'}</text>

          {/* insulin on board (from your loop) */}
          {label(rows.iob[0] + 10, 'INSULIN ON BOARD', '#8b5cf6')}
          {d.iob.length > 1 ? (
            <>
              <path d={`${line(d.iob, Yi)} L${X(d.iob.at(-1)[0])},${Yi(0)} L${X(d.iob[0][0])},${Yi(0)} Z`} fill="#8b5cf6" fillOpacity="0.2" stroke="#8b5cf6" strokeWidth="1.4" />
              <text x={L - 4} y={Yi(d.iMax) + 8} fontSize="9" textAnchor="end" fill="#7c3aed">{d.iMax} U</text>
            </>
          ) : <text x={L + 4} y={rows.iob[0] + 24} fontSize="10" fill={ink} opacity="0.6">No insulin on board logged for this run</text>}

          {/* course */}
          {d.hasEle && (
            <>
              {label(rows.ele[0] + 10, 'COURSE', ink)}
              {d.eleSegs.map((sg, i) => (
                <path key={`e${i}`} d={`M${sg.x1},${sg.y1} L${sg.x2},${sg.y2} L${sg.x2},${rows.ele[0] + rows.ele[1]} L${sg.x1},${rows.ele[0] + rows.ele[1]} Z`} fill={sg.fill} fillOpacity="0.55" />
              ))}
              <path d={line(d.ele.map((e) => [e[0], e[2]]), Ye)} fill="none" stroke={ink} strokeWidth="1.2" strokeOpacity="0.7" />
              {d.eff.length > 1 && <path d={line(d.eff, (v) => rows.ele[0] + (1 - (v - 0.5) / (d.effMax - 0.5)) * (rows.ele[1] - 4))} fill="none" stroke="#f97316" strokeWidth="1.6" />}
              <text x={L - 4} y={Ye(d.eMax) + 3} fontSize="9" textAnchor="end" fill={ink} opacity="0.7">{elev(d.eMax, units)} {elevUnit(units)}</text>
            </>
          )}

          {d.ticks.map((t) => <text key={`t${t.m}`} x={X(t.m)} y={H - 2} fontSize="9" fontWeight={t.strong ? 800 : 600} textAnchor={t.anchor} fill={ink} opacity={t.strong ? 0.95 : 0.75}>{t.label}</text>)}

          {pm != null && (() => {
            const pbg = near(a.actual, pm)?.[1];
            const pe = pm <= dur ? near(d.ele, pm, 4) : null;
            return (
              <g pointerEvents="none">
                <line x1={X(pm)} x2={X(pm)} y1={rows.bg[0]} y2={d.hasEle ? rows.ele[0] + rows.ele[1] : rows.iob[0] + rows.iob[1]} stroke={pmColour} strokeWidth="2" />
                {pbg != null && <circle cx={X(pm)} cy={Ybg(pbg)} r="9" fill={pmColour} fillOpacity="0.25" />}
                {pbg != null && <circle cx={X(pm)} cy={Ybg(pbg)} r="5" fill={pmColour} stroke="#fff" strokeWidth="2" />}
                {pe && <circle cx={X(pm)} cy={Ye(pe[2])} r="5" fill={pmColour} stroke="#fff" strokeWidth="2" />}
              </g>
            );
          })()}
          {hover != null && h && (
            <g pointerEvents="none">
              <line x1={X(hover)} x2={X(hover)} y1={rows.bg[0]} y2={d.hasEle ? rows.ele[0] + rows.ele[1] : rows.iob[0] + rows.iob[1]} stroke={ink} strokeOpacity="0.6" />
              {h.bg != null && <circle cx={X(hover)} cy={Ybg(h.bg)} r="4.5" fill={h.bg < a.floor ? '#dc2626' : h.bg > a.startTarget ? '#eab308' : '#16a34a'} stroke="#fff" strokeWidth="1.5" />}
            </g>
          )}
        </svg>
      </div>
      <div className={`mt-1 min-h-[34px] text-[11px] rounded-lg px-3 py-1.5 ${isDark ? 'bg-white/5 text-slate-300' : 'bg-[#2E2B27]/5 text-[#2E2B27]'}`}>
        {h ? (
          <span className="flex flex-wrap gap-x-4 gap-y-0.5">
            <b>{h.m < 0 ? `${-h.m} min before` : h.m > dur ? `${h.m - dur} min after` : `${h.m} min`}{h.ele ? ` · ${dist(h.ele[1], units, 2)} ${units}` : ''}</b>
            {h.bg != null && <span className={tone(h.bg)}>your glucose {h.bg}</span>}
            {h.planned != null && <span className="opacity-70">planned {h.planned}</span>}
            {h.model != null && <span className="text-sky-500">model {h.model}</span>}
            {h.fitted != null && <span className="text-purple-500">fitted {h.fitted}</span>}
            {h.iob != null && <span className="text-violet-500">insulin on board {h.iob} U</span>}
            {h.carbs.map((c, i) => <span key={i} className="text-amber-600">{c.grams} g {c.status}{c.ml ? ` + ${c.ml} ml` : ''}</span>)}
            {h.note && <span className="text-indigo-500">note {h.note.n}: {h.note.text}</span>}
          </span>
        ) : (
          <span className="flex flex-wrap gap-x-4 gap-y-0.5 opacity-80">
            <span><span className="inline-block w-3 h-1 bg-green-600 align-middle mr-1 rounded" />your glucose - <span className="text-red-500 font-bold">red</span> below {a.floor}, <span className="text-yellow-500 font-bold">yellow</span> above {a.startTarget}</span>
            {a.planned && <span><span className="inline-block w-5 align-middle mr-1" style={{ borderTop: '3px dashed #16a34a' }} />the plan's prediction (as sent) <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-amber-500 align-middle mx-1" />its planned carbs</span>}
            <span><span className="inline-block w-4 align-middle mr-1" style={{ borderTop: '2px dotted #0ea5e9' }} />model with what you actually took</span>
            {a.fitted && <span><span className="inline-block w-4 align-middle mr-1" style={{ borderTop: '2px dotted #a855f7' }} />model fitted to this run</span>}
            <span><span className="inline-block px-1 rounded bg-amber-400 text-[9px] font-black text-stone-900 mr-1">10 g</span>carbs taken (hollow: not taken)</span>
            <span><span className="inline-block w-3 h-3 rounded-full bg-indigo-500 align-middle mr-1" />your notes</span>
            {d.eff.length > 1 && <span><span className="inline-block w-3 h-2 bg-orange-500/40 align-middle mr-1" />harder stretches</span>}
            {d.hasEle && <span><span className="inline-block w-3 h-2 align-middle mr-1 rounded" style={{ background: 'linear-gradient(90deg,#22c55e,#facc15,#f97316,#dc2626)' }} />climb steepness</span>}
            {!staticRender && <span>{onSeek ? 'hover for the numbers - click to jump the replay there' : 'hover for the numbers at any minute'}</span>}
          </span>
        )}
      </div>
      {d.noteDots.length > 0 && (
        <ol className="mt-1.5 text-[11px] flex flex-col gap-0.5">
          {d.noteDots.map((n) => <li key={n.n}><b className="text-indigo-500">{n.n}</b> · {Math.round(n.m)} min - {n.text}</li>)}
        </ol>
      )}
    </div>
  );
}
