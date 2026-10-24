// Run planner: the plan as a journey (24 Oct, Simon chose Option C with D beneath it).
//  RunTrack (C): start to finish as a track shaped by the hills, each carb stop a pill on a line down to the track at
//    the distance it comes, the glucose the plan expects riding above. A pill always sits centred over its line,
//    with the line from the middle of its bottom edge, and pills are drawn over everything else.
//  Moments (D): the run as a list down the screen - each stop with its time, distance, grams and water (all
//    changeable there), the lowest point and the finish - on a rail coloured by where glucose is heading.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, IconButton, useInView } from '../HomebrewBeta/ui';
import { dist } from '../../utils/units';

const interp = (pts, m) => {
  if (!pts?.length) return null;
  for (let i = 1; i < pts.length; i++) if (pts[i][0] >= m) { const a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * ((m - a[0]) / ((b[0] - a[0]) || 1)); }
  return pts[pts.length - 1][1];
};
const kmAt = (ele, m) => { if (!ele?.length) return null; let best = ele[0]; for (const e of ele) { if (e[0] > m) break; best = e; } return best[1]; };
const r1 = (v) => Math.round(v * 10) / 10;
// the hills coloured by how steep they are, as on the classic chart (24 Oct, Simon): green flat, yellow climbing,
// orange and red steeper, blue downhill
export const steep = (g) => (g >= 8 ? 'st4' : g >= 4 ? 'st3' : g >= 1.5 ? 'st2' : g <= -3 ? 'stdown' : 'st1');

// how glucose is doing between two moments: green, amber getting near the floor, red under it
const band = (lo, floor) => (lo < floor ? 'low' : lo < floor + 1 ? 'near' : 'ok');

function useWidth(ref, fallback = 800) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

// The track itself, for a plan or a run looked back on (24 Oct): lines of glucose above (each { pts, cls }), the
// hills, a mark each km or mile, pills for the carbs, the water with them, water-only drinks as blue dots, and insulin
// on board as a strip under the track. Pills: kind 'plan' (solid), 'taken' (solid, what you really took) or 'ghost'
// (planned but not taken, outlined). A pill sits centred over its line, the line from the middle of its bottom edge,
// and pills are drawn over everything else. detail: a taller glucose panel (the folded "detailed chart").
// onMoveStop(index, minute): drag a pill along the run to change when you take it.
export function TrackView({ dur, distanceKm, elevation, lines = [], floor = 5, stops = [], drinks = [], iob = null, units = 'km', label = 'Glucose', detail = false, onMoveStop = null, playhead = null, onProbe = null }) {
  const box = useRef(null);
  const svg = useRef(null);
  const W = useWidth(box);
  const seen = useInView(box, { once: true });
  const [drag, setDrag] = useState(null); // { idx, minute }
  const [probe, setProbe] = useState(null); // the minute under your finger or the pointer (24 Oct, Simon)
  const v = useMemo(() => {
    const L = 34, R = 34; // room either side, so a pill at the start or the finish stays centred over its line
    const X = (m) => L + (Math.max(0, Math.min(dur, m)) / dur) * (W - L - R);
    const all = lines.flatMap((ln) => ln.pts.filter((p) => p[0] >= 0 && p[0] <= dur).map((p) => p[1])).filter((x) => x != null);
    const lo = Math.min(floor - 1, ...all), hi = Math.max(10.5, ...all);
    const gTop = 22, gH = detail ? 150 : 70;
    const Yg = (g) => gTop + (1 - (g - lo) / (hi - lo)) * gH;
    const paths = lines.map((ln) => ({ cls: ln.cls, name: ln.name, pts: ln.pts, d: ln.pts.filter((p) => p[0] >= 0 && p[0] <= dur && p[1] != null).map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Yg(p[1]).toFixed(1)}`).join(' ') }));
    const pillH = 36, pillW = 78, wH = 24, wW = 70;
    const pillY = gTop + gH + 8;
    const trackY = pillY + pillH + wH + 44, hillH = 40;
    const ele = (elevation || []).filter((e) => e[0] <= dur);
    const eVals = ele.map((e) => e[2]);
    const eMin = Math.min(...eVals), eMax = Math.max(...eVals, eMin + 10);
    const Ye = (e) => trackY - 4 - ((e - eMin) / (eMax - eMin)) * hillH;
    const hills = ele.length > 1 ? ele.slice(1).map((e, i) => {
      const a = ele[i];
      const grade = ((e[2] - a[2]) / (Math.max(0.001, e[1] - a[1]) * 1000)) * 100;
      return { cls: steep(grade), d: `M${X(a[0]).toFixed(1)} ${trackY} L${X(a[0]).toFixed(1)} ${Ye(a[2]).toFixed(1)} L${X(e[0]).toFixed(1)} ${Ye(e[2]).toFixed(1)} L${X(e[0]).toFixed(1)} ${trackY} Z` };
    }) : null;
    const hillLine = ele.length > 1 ? `M${ele.map((e) => `${X(e[0]).toFixed(1)} ${Ye(e[2]).toFixed(1)}`).join(' L')}` : null;
    const step = units === 'mi' ? 1.609344 : 1;
    const every = distanceKm / step > 14 ? 2 : 1;
    const ticks = [];
    for (let k = every; k * step < distanceKm - step * 0.4; k += every) {
      const hit = ele.find((e) => e[1] >= k * step);
      if (hit) ticks.push({ k, x: X(hit[0]) });
    }
    const rows = [];
    const pills = stops.map((s, idx) => ({ ...s, idx })).sort((a, b) => a.minute - b.minute).map((s, i) => {
      const x = X(s.minute);
      let row = 0;
      while (rows[row] != null && x - rows[row] < pillW + 8) row++;
      rows[row] = x;
      return { ...s, i, x, y: pillY - row * (pillH + wH + 10) };
    });
    // insulin on board, a strip under the track
    let iobPath = null, iobFirst = null, iobLast = null;
    const iobTop = trackY + 64, iobH = 36;
    const ip = (iob || []).filter((p) => p[0] >= 0 && p[0] <= dur && p[1] != null).map((p) => [p[0], Math.max(0, p[1])]); // (a loop suspending makes it dip below 0)
    if (ip.length > 1) {
      const iMax = Math.max(0.5, ...ip.map((p) => p[1]));
      const Yi = (u) => iobTop + (1 - u / iMax) * iobH;
      const top = ip.map((p) => `${X(p[0]).toFixed(1)} ${Yi(p[1]).toFixed(1)}`);
      iobPath = { area: `M${X(ip[0][0])} ${iobTop + iobH} L${top.join(' L')} L${X(ip[ip.length - 1][0])} ${iobTop + iobH} Z`, line: `M${top.join(' L')}` };
      iobFirst = ip[0][1]; iobLast = ip[ip.length - 1][1];
    }
    const H = iobPath ? iobTop + iobH + 6 : trackY + 36;
    const inv = (x) => Math.max(0, Math.min(dur, Math.round(((x - L) / (W - L - R)) * dur)));
    return { X, inv, paths, Yg, trackY, hills, hillLine, ticks, pills, pillW, pillH, wH, wW, L, R, H, iobPath, iobTop, iobH, iobFirst, iobLast, drinks: drinks.map((dk) => ({ ...dk, x: X(dk.minute) })) };
  }, [dur, distanceKm, elevation, lines, floor, stops, drinks, iob, W, units, detail]);

  // dragging a pill along the run
  const toMinute = (e) => { const r = svg.current.getBoundingClientRect(); return v.inv(((e.clientX - r.left) / r.width) * W); };
  const down = (s) => (e) => { if (!onMoveStop) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDrag({ idx: s.idx, minute: s.minute }); };
  const move = (e) => {
    if (drag) { setDrag({ ...drag, minute: toMinute(e) }); return; }
    if (e.pointerType === 'mouse' || e.buttons || e.pointerType === 'touch' || e.pointerType === 'pen') { const m = toMinute(e); setProbe(m); onProbe?.(m); }
  };
  const press = (e) => { if (drag) return; const m = toMinute(e); setProbe(m); onProbe?.(m); };
  const up = () => { if (drag) { const st = stops[drag.idx]; if (st && drag.minute !== st.minute) onMoveStop(drag.idx, drag.minute); setDrag(null); } };
  const leave = (e) => { if (e.pointerType === 'mouse' && !drag) setProbe(null); };
  // what's at a minute: each glucose line, insulin on board, distance and height
  const at = (pts, m) => {
    const q = (pts || []).filter((p) => p[1] != null);
    if (!q.length || m < q[0][0] - 1) return null;
    for (let i = 1; i < q.length; i++) if (q[i][0] >= m) { const a = q[i - 1], b = q[i]; return a[1] + (b[1] - a[1]) * ((m - a[0]) / ((b[0] - a[0]) || 1)); }
    return m <= q[q.length - 1][0] + 1 ? q[q.length - 1][1] : null;
  };
  const shown = playhead != null ? Math.max(0, Math.min(dur, playhead)) : probe;
  const readout = shown == null ? null : (() => {
    const e = (elevation || []).reduce((best, x) => (x[0] <= shown ? x : best), (elevation || [])[0]);
    const iobAt = at(iob, shown);
    return {
      m: shown, x: v.X(shown), km: e ? e[1] : null, height: e ? e[2] : null,
      values: v.paths.map((pa) => ({ cls: pa.cls, name: pa.name || 'Glucose', g: at(pa.pts, shown) })).filter((x) => x.g != null),
      iob: iobAt != null ? Math.max(0, iobAt) : null,
    };
  })();

  const r1 = (x) => Math.round(x * 10) / 10;
  return (
    <div ref={box} className={`rpb-track ${seen ? 'in' : ''} ${drag ? 'dragging' : ''}`}>
      {/* the numbers at the minute under your finger (or the replay's runner) */}
      {readout && (
        <div className="rpb-readout" style={{ left: Math.max(8, Math.min(W - 228, readout.x - 110)) }} aria-live="polite">
          <b>{readout.m === 0 ? 'Start' : `${Math.round(readout.m)} min`}{readout.km != null ? ` · ${units === 'mi' ? (readout.km / 1.609344).toFixed(1) : readout.km.toFixed(1)} ${units}` : ''}</b>
          {readout.values.map((x) => <span key={x.cls} className={x.cls}><i />{x.name} <b>{r1(x.g)}</b> mmol/L</span>)}
          {readout.iob != null && <span className="iob"><i />Insulin on board <b>{r1(readout.iob)}</b> u</span>}
          {readout.height != null && <span className="ht"><i />Height <b>{Math.round(units === 'mi' ? readout.height * 3.28084 : readout.height)}</b> {units === 'mi' ? 'ft' : 'm'}</span>}
        </div>
      )}
      <svg ref={svg} width={W} height={v.H} viewBox={`0 0 ${W} ${v.H}`} role="img" aria-label={`The run from start to finish: ${v.pills.length} carb stops. Touch or point at it for the numbers at any minute.`}
        onPointerMove={move} onPointerDown={press} onPointerUp={up} onPointerLeave={leave} onPointerCancel={() => setDrag(null)} style={{ touchAction: 'pan-y' }}>
        <text x={v.L} y={12} className="lab">{label}</text>
        <rect x={v.L} y={v.Yg(10)} width={W - v.L - v.R} height={Math.max(0, v.Yg(floor) - v.Yg(10))} rx="8" className="gband" />
        {detail && [floor, 10].map((g) => <text key={g} x={v.L - 6} y={v.Yg(g) + 4} textAnchor="end" className="km">{g}</text>)}
        {v.paths.map((pa) => <path key={pa.cls} d={pa.d} className={pa.cls} pathLength="1" />)}
        {v.hills && <g className="hillsg">{v.hills.map((h, i) => <path key={i} d={h.d} className={h.cls} />)}<path d={v.hillLine} className="hilltop" /></g>}
        <line x1={v.X(0)} x2={v.X(dur)} y1={v.trackY} y2={v.trackY} className="track" pathLength="1" />
        {v.ticks.map((t) => <g key={t.k}><line x1={t.x} x2={t.x} y1={v.trackY + 6} y2={v.trackY + 11} className="tick" /><text x={t.x} y={v.trackY + 28} textAnchor="middle" className="km">{t.k} {units}</text></g>)}
        <text x={v.X(0)} y={v.trackY + 28} textAnchor="middle" className="km b">Start</text>
        <text x={v.X(dur)} y={v.trackY + 28} textAnchor="middle" className="km b">{Math.round(dur)} min</text>
        <circle cx={v.X(dur)} cy={v.trackY} r="8" className="finish" />
        {readout && (
          <g className={`probe ${playhead != null ? 'play' : ''}`}>
            <line x1={readout.x} x2={readout.x} y1={14} y2={v.iobPath ? v.iobTop + v.iobH : v.trackY} className="pline" />
            {readout.values.map((x) => <circle key={x.cls} cx={readout.x} cy={v.Yg(x.g)} r="5.5" className={`pdot ${x.cls}`} />)}
            <circle cx={readout.x} cy={v.trackY} r={playhead != null ? 9 : 6} className="prunner" />
          </g>
        )}
        {v.iobPath && (
          <g className="iob">
            <text x={v.L} y={v.iobTop - 10} className="lab ilab">Insulin on board</text>
            <rect x={v.L} y={v.iobTop} width={W - v.L - v.R} height={v.iobH} rx="10" className="iband" />
            <path d={v.iobPath.area} className="iarea" />
            <path d={v.iobPath.line} className="iline" />
            <text x={v.L + 8} y={v.iobTop + v.iobH - 9} className="ival">{r1(v.iobFirst)} u</text>
            <text x={W - v.R - 8} y={v.iobTop + v.iobH - 9} textAnchor="end" className="ival">{r1(v.iobLast)} u</text>
          </g>
        )}
        {v.drinks.map((dk) => (
          <g key={`d${dk.minute}`} className="drinkg">
            <line x1={dk.x} x2={dk.x} y1={v.trackY - 34} y2={v.trackY} className="wstem" />
            <circle cx={dk.x} cy={v.trackY} r="6" className="drink" />
            <rect x={dk.x - v.wW / 2} y={v.trackY - 34 - v.wH} width={v.wW} height={v.wH} rx={v.wH / 2} className="wpill" />
            <text x={dk.x} y={v.trackY - 34 - v.wH / 2 + 1} textAnchor="middle" dominantBaseline="central" className="pml">{dk.ml} ml</text>
            <title>{`${dk.ml} ml of water at ${dk.minute} min`}</title>
          </g>
        ))}
        {v.pills.map((s0) => {
          const s = drag && drag.idx === s0.idx ? { ...s0, x: v.X(drag.minute), minute: drag.minute } : s0;
          return (
            <g key={`s${s.idx}`} className={`stop ${s.kind || 'plan'} ${onMoveStop ? 'movable' : ''}`} style={{ animationDelay: `${0.5 + s.i * 0.12}s` }} onPointerDown={down(s0)}>
              <line x1={s.x} x2={s.x} y1={s.y + v.pillH} y2={v.trackY} className="stem" />
              <circle cx={s.x} cy={v.trackY} r="7" className="dot" />
              <rect x={s.x - v.pillW / 2} y={s.y} width={v.pillW} height={v.pillH} rx={v.pillH / 2} className="cpill" />
              <text x={s.x} y={s.y + v.pillH / 2 + 1} textAnchor="middle" dominantBaseline="central" className="pg">{s.grams} g</text>
              {/* the water with it, its own small blue pill just under the carbs */}
              {s.ml ? <>
                <rect x={s.x - v.wW / 2} y={s.y + v.pillH + 4} width={v.wW} height={v.wH} rx={v.wH / 2} className="wpill" />
                <text x={s.x} y={s.y + v.pillH + 4 + v.wH / 2 + 1} textAnchor="middle" dominantBaseline="central" className="pml">{s.ml} ml</text>
              </> : null}
              {drag && drag.idx === s0.idx && <text x={s.x} y={s.y - 8} textAnchor="middle" className="km b">{s.minute} min</text>}
              <title>{s.title || `${s.grams} g ${s.minute === 0 ? 'at the start' : `at ${Math.round(s.minute)} min`}`}{onMoveStop ? '. Drag to change when.' : ''}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// the plan (detail: the larger chart, with glucose without the carbs, that you can drag the stops on)
export function RunTrack({ plan, units, detail = false, onMoveStop = null, onProbe = null, playhead = null }) {
  const dur = plan.run.durationMin;
  const lines = useMemo(() => [...(detail ? [{ pts: plan.withoutCarbs || [], cls: 'gnocarb', name: 'Without carbs' }] : []), { pts: plan.prediction || [], cls: 'gline', name: 'Glucose' }], [plan, detail]);
  const stops = useMemo(() => (plan.plan.stops || []).map((s) => ({ minute: s.minute, grams: s.grams, ml: s.fluidMl || 100, kind: 'plan', title: `${s.grams} g and ${s.fluidMl || 100} ml of water ${s.minute === 0 ? 'before you set off' : `at ${s.minute} min`}` })), [plan]);
  const drinks = useMemo(() => (plan.drinks || []).filter((dk) => dk.minute > 0 && !(plan.plan.stops || []).some((s) => s.minute === dk.minute)), [plan]);
  return <TrackView dur={dur} distanceKm={plan.run.distanceKm} elevation={plan.elevation} lines={lines} floor={plan.settings?.floor ?? 5} stops={stops} drinks={drinks}
    iob={plan.iobSeries} units={units} detail={detail} onMoveStop={onMoveStop} onProbe={onProbe} playhead={playhead} label={detail ? 'Glucose with the plan, and without any carbs (dashed)' : 'Glucose'} />;
}

// a run looked back on: the plan's line (dashed) against your real glucose, what you took (solid pills) and any
// planned stop you didn't take (outlined), the water with them and the insulin on board
export function RetroTrack({ a, intakes, units, playhead = null, onProbe = null }) {
  const lines = useMemo(() => [{ pts: a.planned || [], cls: 'gplan', name: 'Planned' }, { pts: a.actual || [], cls: 'gline', name: 'Real' }], [a]);
  const stops = useMemo(() => {
    const taken = (intakes || []).filter((it) => it.action === 'taken' && (it.grams || it.ml)).map((it) => ({ minute: it.minute ?? it.planned_minute ?? 0, grams: it.grams || 0, ml: it.ml || it.planned_ml || 0, kind: 'taken', title: `You took ${it.grams || 0} g at ${Math.round(it.minute ?? 0)} min` }));
    const missed = (intakes || []).filter((it) => it.planned_g && it.action !== 'taken').map((it) => ({ minute: it.planned_minute ?? 0, grams: it.planned_g, ml: it.planned_ml || 0, kind: 'ghost', title: `Planned ${it.planned_g} g at ${it.planned_minute} min${it.action === 'skipped' ? ', skipped' : ', not recorded'}` }));
    return [...taken, ...missed];
  }, [intakes]);
  const drinks = useMemo(() => (intakes || []).filter((it) => !it.planned_g && !it.grams && (it.ml || it.planned_ml) && (it.action === 'taken' || it.action == null)).map((it) => ({ minute: it.minute ?? it.planned_minute ?? 0, ml: it.ml || it.planned_ml })), [intakes]);
  const iob = Array.isArray(a.iob) ? a.iob : null;
  return <TrackView dur={a.run.durationMin} distanceKm={a.run.km} elevation={a.elevation} lines={lines} floor={a.floor ?? 5} stops={stops} drinks={drinks} iob={iob} units={units} label="Glucose: planned (dashed) and real" playhead={playhead} onProbe={onProbe} />;
}

export function Moments({ plan, units, editable, rp }) {
  const dur = plan.run.durationMin;
  const pred = plan.prediction || [];
  const floor = plan.settings?.floor ?? 5;
  const ele = plan.elevation || [];
  // the lowest point during the run
  const lowest = pred.filter((p) => p[0] <= dur).reduce((a, p) => (!a || p[1] < a[1] ? p : a), null);
  const after = pred.length ? pred[pred.length - 1][1] : null;
  const items = [
    ...(plan.plan.stops || []).map((s, i) => ({ kind: 'stop', m: s.minute, s, i })),
    ...(lowest && !(plan.plan.stops || []).some((s) => Math.abs(s.minute - lowest[0]) < 2) ? [{ kind: 'low', m: lowest[0] }] : []),
    { kind: 'finish', m: dur },
  ].sort((a, b) => a.m - b.m || (a.kind === 'finish' ? 1 : -1));
  // the rail below each moment: how low glucose gets before the next one
  const minBetween = (a, b) => pred.filter((p) => p[0] >= a && p[0] <= b).reduce((m, p) => Math.min(m, p[1]), Infinity);

  return (
    <div className="rpb-moments">
      {items.map((it, n) => {
        const next = items[n + 1];
        const g = interp(pred, it.m);
        const seg = next ? band(minBetween(it.m, next.m), floor) : 'none';
        const km = it.m === 0 ? 0 : kmAt(ele, it.m);
        return (
          <div key={`${it.kind}${it.i ?? ''}${it.m}`} className={`mo ${it.kind}`} style={{ animationDelay: `${n * 50}ms` }}>
            <div className="mt">
              <b>{it.m === 0 ? 'Start' : `${Math.round(it.m)} min`}</b>
              <small>{it.kind === 'finish' ? `${dist(plan.run.distanceKm, units, 2)} ${units}` : km != null && it.m > 0 ? `${dist(km, units, 1)} ${units}` : 'before you go'}</small>
            </div>
            <div className={`mrail ${seg}`}><i /></div>
            <div className="mbd">
              {it.kind === 'stop' ? (
                <div className="ev">
                  <span className="mamt">{it.s.grams}<small>g</small></span>
                  <span className="mwhat">and {it.s.fluidMl || 100} ml of water{it.m === 0 ? ', before you set off' : ''}</span>
                  {editable && (
                    <span className="med">
                      {rp.moveStop && (
                        <label className="mmin" title="Minute into the run (0 is at the start)">
                          <input type="number" min="0" max={dur} defaultValue={it.s.minute} key={it.s.minute} inputMode="numeric"
                            onBlur={(e) => { const val = Number(e.target.value); if (Number.isFinite(val) && val !== it.s.minute) rp.moveStop(it.i, val); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} aria-label={`Minute of stop ${it.i + 1}`} />
                          <span>min</span>
                        </label>
                      )}
                      {rp.stepStopCarbs && <span className="rpb-stepper"><IconButton icon="remove" label={`5 g less at stop ${it.i + 1}`} onClick={() => rp.stepStopCarbs(it.i, -5)} /><IconButton icon="add" label={`5 g more at stop ${it.i + 1}`} onClick={() => rp.stepStopCarbs(it.i, 5)} /></span>}
                      {rp.removeStop && <IconButton icon="close" label={`Remove stop ${it.i + 1}`} onClick={() => rp.removeStop(it.i)} />}
                    </span>
                  )}
                </div>
              ) : (
                <div className="ev quiet"><b>{it.kind === 'low' ? 'The lowest point' : 'Finish'}</b></div>
              )}
              {g != null && (
                <span className={`mgl ${band(g, floor)}`}>
                  Glucose about {r1(g)}{interp(plan.iobSeries, it.m) != null ? `, ${r1(Math.max(0, interp(plan.iobSeries, it.m)))} u of insulin on board` : ''}
                  {it.kind === 'finish' && after != null ? `. Two hours later with no more carbs: ${r1(after)}` : ''}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {editable && rp.addStop && (
        <button type="button" className="mo-add sl" onClick={() => rp.addStop()} title="Adds 10 g in the middle of the longest gap">
          <Icon n="add" size={22} />Add a carb stop
        </button>
      )}
    </div>
  );
}
