// Run planner: training load and recovery in the beta's design (24 Oct, Simon: restyle it as Option C).
// The last four weeks and the week ahead as a track: each session a pill (its load) on a line down to its day, the
// days shaded by how hard; form (fitness minus fatigue) riding above in its zones; under the track the load ratio
// (the sweet spot shaded) and how full your muscle glycogen is since each run. If you rest, the week ahead is dashed.
// The same /api/strava/training-load as the classic card (Dashboard/TrainingLoadCard.jsx).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, useInView } from '../HomebrewBeta/ui';
import { dist } from '../../utils/units';
import { Banner } from './PlanSection';

const STATUS = { fresh: ['Fresh', 'ok'], ready: ['Ready to train', 'ok'], recovering: ['Recovering', 'near'], tired: ['Tired', 'near'], 'very tired': ['Very tired', 'low'] };
const dm = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const left = (h) => {
  if (h == null) return 'more than three weeks';
  const d = Math.floor(h / 24), hr = h % 24;
  return [d ? `${d} day${d === 1 ? '' : 's'}` : '', hr ? `${hr} hour${hr === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ') || 'under an hour';
};

function useWidth(ref) {
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function LoadTrack({ days }) {
  const box = useRef(null);
  const W = useWidth(box);
  const seen = useInView(box, { once: true });
  const v = useMemo(() => {
    const L = 34, R = 34;
    const today = Math.max(0, days.findIndex((x) => x.today));
    const last = days.length - 1;
    const X = (i) => L + (i / Math.max(1, last)) * (W - L - R);
    // form above, in its zones
    const fTop = 22, fH = 80;
    const tsb = days.map((x) => x.tsb);
    const lo = Math.min(-30, ...tsb), hi = Math.max(15, ...tsb);
    const Yf = (t) => fTop + (1 - (t - lo) / (hi - lo)) * fH;
    const path = (from, to) => days.slice(from, to + 1).map((x, k) => `${k ? 'L' : 'M'}${X(from + k).toFixed(1)} ${Yf(x.tsb).toFixed(1)}`).join(' ');
    // sessions as pills over the track
    const pillW = 54, pillH = 30, pillY = fTop + fH + 10, trackY = pillY + pillH + 40;
    const rows = [];
    const pills = days.map((x, i) => ({ x, i })).filter(({ x }) => x.load > 0 && !x.future).map(({ x, i }, n) => {
      const px = X(i);
      let row = 0;
      while (rows[row] != null && px - rows[row] < pillW + 4) row++;
      rows[row] = px;
      return { day: x, i, n, x: px, y: pillY - row * (pillH + 5), hard: x.load >= 150 ? 'hard' : x.load >= 80 ? 'mid' : 'easy' };
    });
    const ticks = days.map((x, i) => ({ x, i })).filter(({ x, i }) => x.today || i === 0 || (i < today && (today - i) % 7 === 0 && today - i > 2) || i === last);
    // load ratio and glycogen, as strips under the track
    const rTop = trackY + 58, rH = 26;
    const rLo = 0.5, rHi = 1.8;
    const Yr = (r) => rTop + (1 - (Math.max(rLo, Math.min(rHi, r)) - rLo) / (rHi - rLo)) * rH;
    const ratio = days.map((x, i) => (x.acwr != null ? [i, x.acwr] : null)).filter(Boolean);
    const rPath = (part) => ratio.filter(([i]) => (part === 'past' ? i <= today : i >= today)).map(([i, r], k) => `${k ? 'L' : 'M'}${X(i).toFixed(1)} ${Yr(r).toFixed(1)}`).join(' ');
    const gTop = rTop + rH + 34, gH = 26;
    const gly = days.map((x, i) => (x.glycogen && !x.future ? [i, Math.max(0, Math.min(100, x.glycogen.pct ?? 0))] : null)).filter(Boolean);
    const gPath = gly.length > 1 ? `M${X(gly[0][0])} ${gTop + gH} ${gly.map(([i, p]) => `L${X(i).toFixed(1)} ${(gTop + gH - (p / 100) * gH).toFixed(1)}`).join(' ')} L${X(gly[gly.length - 1][0])} ${gTop + gH} Z` : null;
    return { L, R, X, Yf, today, last, pastForm: path(0, today), nextForm: path(today, last), fTop, fH, pills, pillW, pillH, trackY, ticks, rTop, rH, Yr, ratioPast: rPath('past'), ratioNext: rPath('next'), gTop, gH, gPath, H: (gPath ? gTop + gH : rTop + rH) + 10 };
  }, [days, W]);
  const zone = (a, b, cls) => <rect x={v.L} width={W - v.L - v.R} y={v.Yf(a)} height={Math.max(0, v.Yf(b) - v.Yf(a))} className={`fz ${cls}`} />;
  return (
    <div ref={box} className={`rpb-track rpb-loadtrack ${seen ? 'in' : ''}`}>
      <svg width={W} height={v.H} viewBox={`0 0 ${W} ${v.H}`} role="img" aria-label="Training load over the last four weeks and the week ahead">
        <text x={v.L} y={12} className="lab">Form: fitness minus fatigue</text>
        {zone(40, -5, 'ok')}{zone(-5, -20, 'near')}{zone(-20, -60, 'low')}
        <text x={W - v.R + 4} y={v.Yf(5)} className="km">fresh</text>
        <text x={W - v.R + 4} y={v.Yf(-12)} className="km">tired</text>
        <path d={v.pastForm} className="gline" pathLength="1" />
        <path d={v.nextForm} className="fnext" />
        <line x1={v.X(v.today)} x2={v.X(v.today)} y1={v.fTop - 6} y2={v.gTop + v.gH} className="todayline" />
        {/* the track through the weeks; the week ahead dashed */}
        <line x1={v.X(0)} x2={v.X(v.today)} y1={v.trackY} y2={v.trackY} className="track" pathLength="1" />
        <line x1={v.X(v.today)} x2={v.X(v.last)} y1={v.trackY} y2={v.trackY} className="track next" />
        {v.ticks.map(({ x, i }) => <text key={i} x={v.X(i)} y={v.trackY + 26} textAnchor="middle" className={`km ${x.today ? 'b' : ''}`}>{x.today ? 'Today' : i === v.last ? '+7 days' : dm(x.day)}</text>)}
        <circle cx={v.X(v.today)} cy={v.trackY} r="8" className="finish" />
        {/* load ratio, the sweet spot shaded */}
        <text x={v.L} y={v.rTop - 6} className="ilab ratio">Load ratio (0.8 to 1.3 is the sweet spot)</text>
        <rect x={v.L} width={W - v.L - v.R} y={v.Yr(1.3)} height={v.Yr(0.8) - v.Yr(1.3)} className="rband" />
        <path d={v.ratioPast} className="rline" />
        <path d={v.ratioNext} className="rline next" />
        {/* glycogen refill */}
        {v.gPath && <>
          <text x={v.L} y={v.gTop - 6} className="ilab gly">Muscle glycogen, refilled since each run</text>
          <path d={v.gPath} className="garea" />
        </>}
        {/* the sessions, over everything */}
        {v.pills.map((p) => (
          <g key={p.i} className={`stop ${p.hard}`} style={{ animationDelay: `${0.4 + p.n * 0.06}s` }}>
            <line x1={p.x} x2={p.x} y1={p.y + v.pillH} y2={v.trackY} className="stem" />
            <circle cx={p.x} cy={v.trackY} r="6" className="dot" />
            <rect x={p.x - v.pillW / 2} y={p.y} width={v.pillW} height={v.pillH} rx="15" className="cpill" />
            <text x={p.x} y={p.y + v.pillH / 2 + 1} textAnchor="middle" dominantBaseline="central" className="pg">{p.day.load}</text>
            <title>{`${dm(p.day.day)}: ${p.day.name || 'session'}, load ${p.day.load}${p.day.km ? `, ${p.day.km} km` : ''}`}</title>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function TrainingLoad({ units = 'km' }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    fetch('/api/strava/training-load', { credentials: 'same-origin' }).then((r) => r.json()).then((j) => { if (!live) return; if (j.success) setData(j.load); else setError(j.error || 'Unavailable'); }).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, []);
  if (error) return <div className="rpb-card rpb-chartcard"><div className="hd"><h3>Training load and recovery</h3></div><p className="muted">Not available just now: {error}</p></div>;
  if (!data) return <div className="rpb-card rpb-chartcard"><div className="hd"><h3>Training load and recovery</h3></div><p className="muted">Working it out…</p></div>;
  if (!data.available) return <div className="rpb-card rpb-chartcard"><div className="hd"><h3>Training load and recovery</h3></div><p className="muted">{data.reason}</p></div>;
  const [word, tone] = STATUS[data.status] || STATUS.ready;
  const rec = data.recovery;
  return (
    <section className="rpb-card rpb-chartcard rpb-load">
      <div className="hd"><h3>Training load and recovery</h3><span className={`status ${tone}`}>{word}</span></div>
      <div className="rpb-recover">
        <span className="top"><Icon n={rec.inRecovery ? 'timer' : 'check'} size={18} />{rec.inRecovery ? `Recovering, ${left(rec.hoursLeft)} to go` : 'Fully recovered'}<b>{rec.percent}%</b></span>
        <span className="rcbar"><i className={rec.percent >= 100 ? 'ok' : rec.percent >= 60 ? 'near' : 'low'} style={{ width: `${Math.min(100, rec.percent)}%` }} /></span>
        {rec.lastSession && <span className="muted">Last session: {rec.lastSession.name} ({new Date(`${rec.lastSession.day}T12:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}), load {rec.lastSession.load}.</span>}
      </div>
      <div className="rpb-stats">
        <div className="rpb-stat"><span className="k">Fatigue, 7 days</span><span className="v">{data.atl}</span></div>
        <div className="rpb-stat"><span className="k">Fitness, 42 days</span><span className="v">{data.ctl}</span></div>
        <div className={`rpb-stat ${data.tsb < -20 ? 'low' : data.tsb < -5 ? '' : 'ok'}`}><span className="k">Form</span><span className="v">{data.tsb > 0 ? '+' : ''}{data.tsb}</span></div>
        <div className={`rpb-stat ${data.acwr > 1.5 ? 'low' : ''}`}><span className="k">Load ratio</span><span className="v">{data.acwr ?? '–'}</span><span className="s">0.8 to 1.3 is the sweet spot</span></div>
        <div className="rpb-stat"><span className="k">This week</span><span className="v">{dist(data.ramp.thisWeekKm, units, 1)}<small>{units}</small></span><span className="s">Last week {dist(data.ramp.lastWeekKm, units, 1)} {units}{data.ramp.pct != null ? ` (${data.ramp.pct > 0 ? '+' : ''}${data.ramp.pct}%)` : ''}</span></div>
      </div>
      {data.days?.length > 1 && <LoadTrack days={data.days} />}
      {data.warnings.length > 0 ? <Banner tone={data.warnings.some((w) => w.level === 'high') ? 'stop' : 'warn'} title={data.warnings.map((w) => w.text).join(' ')}>{data.suggestions.join(' ')}</Banner>
        : data.suggestions.length > 0 && <Banner tone={['tired', 'very tired', 'recovering'].includes(data.status) ? 'info' : 'good'} title={data.suggestions[0]}>{data.suggestions.slice(1).join(' ') || null}</Banner>}
    </section>
  );
}
