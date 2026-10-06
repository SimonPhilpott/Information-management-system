import React, { useMemo, useRef, useState } from 'react';

// Training load in the Run plan chart's style, overlaid so you can see how one measure moves another:
//   main panel - FITNESS (blue area) and FATIGUE (orange line) on the left scale, FORM (fitness - fatigue, the
//                zone-coloured line) on the right scale. Form falls when fatigue climbs above fitness and recovers
//                as it eases. Sessions are labelled pills with a line down, and the days shaded by how hard.
//   LOAD RATIO - fatigue / fitness, 0.8-1.3 the sweet spot
//   REFUELLING - since each run: carbs eaten (solid, climbing) towards what you need (dashed) - resets at each run
// The last 4 weeks take most of the width, then the next week if you rest (dashed), like the run vs after it.

const dm = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const formZone = (v) => (v >= -5 ? ['recovered', '#16a34a'] : v >= -20 ? ['recovering', '#d97706'] : ['very tired', '#dc2626']);
const ratioZone = (v) => (v == null ? ['-', '#64748b'] : v > 1.5 ? ['injury risk', '#dc2626'] : v > 1.3 ? ['above the sweet spot', '#d97706'] : v >= 0.8 ? ['sweet spot', '#16a34a'] : ['easing off', '#0ea5e9']);

export default function TrainingLoadChart({ days, isDark }) {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const d = useMemo(() => {
    if (!days?.length) return null;
    const W = 900, L = 40, R = 34;
    const rows = { main: [8, 196], ratio: [216, 50], fuel: [278, 62] };
    const H = 354;
    const todayIdx = Math.max(0, days.findIndex((x) => x.today));
    const last = days.length - 1;
    const plotW = W - L - R, pastW = plotW * 0.76;
    const X = (i) => (i <= todayIdx ? L + (i / Math.max(1, todayIdx)) * pastW : L + pastW + ((i - todayIdx) / Math.max(1, last - todayIdx)) * (plotW - pastW));
    const inv = (x) => {
      const p = x - L;
      const i = p <= pastW ? (p / pastW) * todayIdx : todayIdx + ((p - pastW) / (plotW - pastW)) * (last - todayIdx);
      return Math.max(0, Math.min(last, Math.round(i)));
    };
    const step = (i) => (i <= todayIdx ? pastW / Math.max(1, todayIdx) : (plotW - pastW) / Math.max(1, last - todayIdx));
    // main panel: top 34 px kept for the session pills
    const top = rows.main[0] + 34, hgt = rows.main[1] - 34;
    const lMax = Math.ceil(Math.max(20, ...days.map((x) => Math.max(x.atl, x.ctl))) / 20) * 20;
    const Yl = (v) => top + (1 - v / lMax) * hgt;
    const tMin = Math.min(-30, Math.floor(Math.min(...days.map((x) => x.tsb)) / 10) * 10);
    const tMax = Math.max(20, Math.ceil(Math.max(...days.map((x) => x.tsb)) / 10) * 10);
    const Yt = (v) => top + (1 - (Math.max(tMin, Math.min(tMax, v)) - tMin) / (tMax - tMin)) * hgt;
    const rMin = Math.min(0.6, Math.floor(Math.min(...days.map((x) => x.acwr ?? 1)) * 10) / 10 - 0.05);
    const rMax = Math.max(1.65, Math.ceil(Math.max(...days.map((x) => x.acwr || 0)) * 10) / 10 + 0.05);
    const Yr = (v) => rows.ratio[0] + 4 + (1 - (Math.max(rMin, Math.min(rMax, v)) - rMin) / (rMax - rMin)) * (rows.ratio[1] - 8);
    const loadMax = Math.max(50, ...days.map((x) => x.load));
    // muscle glycogen: what the last run(s) took out (need) and how much of it the carbs since have put back
    // (eaten) - it fills up and then stays full, rather than adding up every day's carbs
    const fuel = [];
    days.forEach((x, i) => {
      if (x.future || !x.glycogen) return;
      fuel.push({ i, eaten: x.glycogen.refilledG, need: x.glycogen.owedG, pct: x.glycogen.pct, run: x.run });
    });
    const fMax = Math.max(200, ...fuel.map((f) => f.need)) * 1.08;
    const Yfu = (v) => rows.fuel[0] + 14 + (1 - v / fMax) * (rows.fuel[1] - 14);
    const line = (key, Y, part) => days.map((x, i) => [i, x]).filter(([i, x]) => x[key] != null && (part === 'past' ? i <= todayIdx : i >= todayIdx))
      .map(([i, x], k) => `${k ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x[key]).toFixed(1)}`).join(' ');
    const ticks = days.map((x, i) => [i, x]).filter(([i, x]) => x.today || (i < todayIdx && i % 7 === 0 && todayIdx - i > 2) || i === last);
    return { W, L, R, H, rows, top, hgt, todayIdx, X, inv, step, lMax, Yl, tMin, tMax, Yt, rMin, rMax, Yr, loadMax, fuel, fMax, Yfu, line, ticks };
  }, [days]);
  if (!d) return null;
  const { W, L, R, H, rows, todayIdx, X, Yl, Yt, Yr, Yfu, line } = d;
  const ink = isDark ? '#cbd5e1' : '#2E2B27';
  const grid = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(46,43,39,0.08)';
  const top = rows.main[0], bottom = rows.fuel[0] + rows.fuel[1];
  const label = (x, y, text, colour, anchor = 'end') => <text x={x} y={y} fontSize="10" fontWeight="800" textAnchor={anchor} fill={colour} opacity="0.9">{text}</text>;
  const band = (id, Y, y0, y1, stops) => (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={y0} y2={y1}>
      {stops.flatMap(([v, c], k) => {
        const off = Math.max(0, Math.min(1, (Y(v) - y0) / (y1 - y0)));
        return [<stop key={`${k}a`} offset={off} stopColor={k ? stops[k - 1][1] : c} />, <stop key={`${k}b`} offset={off} stopColor={c} />];
      })}
    </linearGradient>
  );
  const onMove = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    setHover(d.inv(((e.clientX - r.left) / r.width) * W));
  };
  const hi = hover ?? todayIdx;
  const h = days[hi];
  const hf = [...d.fuel].reverse().find((f) => f.i <= hi);
  const sessions = days.map((x, i) => [i, x]).filter(([, x]) => x.load > 0);
  const ctlArea = (() => { const p = line('ctl', Yl, 'past'); return p ? `${p} L${X(todayIdx)},${Yl(0)} L${X(0)},${Yl(0)} Z` : ''; })();
  const fuelPath = (key) => d.fuel.map((f, k) => {
    const prev = d.fuel[k - 1];
    // a fresh start at each run: drop back to zero there
    const jump = f.run && prev ? `L${X(f.i) - 0.01},${Yfu(prev[key])} M${X(f.i)},${Yfu(0)} ` : '';
    return `${k ? jump + 'L' : 'M'}${X(f.i).toFixed(1)},${Yfu(f[key]).toFixed(1)}`;
  }).join(' ');
  const lastFuel = d.fuel.at(-1);
  // hover box: each line named, its value, and what it means in a few words
  const tipRows = [
    ['#0ea5e9', 'Fitness', h.ctl, 'your training base - average load over 6 weeks; slow to build, slow to lose'],
    ['#f97316', 'Fatigue', h.atl, 'how tired the last week has made you - average load over 7 days; jumps after a run, eases with rest'],
    [formZone(h.tsb)[1], 'Form', `${h.tsb > 0 ? '+' : ''}${h.tsb} (${formZone(h.tsb)[0]})`, 'fitness minus fatigue - the mirror of fatigue; below -20 very tired, above -5 fresh'],
    ...(h.acwr != null ? [[ratioZone(h.acwr)[1], 'Load ratio', `${h.acwr} (${ratioZone(h.acwr)[0]})`, 'fatigue divided by fitness; 0.8-1.3 builds safely, over 1.5 risks injury']] : []),
    ...(h.load > 0 ? [['#c2410c', 'Session load', h.load, h.sessions.map((x) => `${x.name}${x.km ? ` ${x.km} km` : ''}`).join(', ')]] : []),
    ...(!h.future && hf ? [['#06b6d4', 'Glycogen refill', `${hf.eaten} of ${hf.need} g (${hf.pct}%)`, hf.pct >= 100 ? 'your muscles are topped back up after the last run' : 'how much of the glycogen the last run used you have eaten back - about half of the carbs you eat go to your muscles']] : []),
  ];
  const tipLeftPct = (X(hi) / W) * 100;

  return (
    <div>
      <div className="relative overflow-x-auto">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[640px] select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Training load: fitness, fatigue and form overlaid, load ratio and refuelling">
          <defs>
            {band('tl-form', Yt, d.top, d.top + d.hgt, [[d.tMax, '#16a34a'], [-5, '#d97706'], [-20, '#dc2626']])}
            {band('tl-ratio', Yr, rows.ratio[0], rows.ratio[0] + rows.ratio[1], [[d.rMax, '#dc2626'], [1.5, '#d97706'], [1.3, '#16a34a'], [0.8, '#0ea5e9']])}
          </defs>

          {/* how hard each day was, shaded through the panels */}
          {sessions.map(([i, x]) => (
            <rect key={`s${i}`} x={X(i) - d.step(i) / 2} y={d.top} width={d.step(i)} height={bottom - d.top} fill="#f97316" fillOpacity={Math.min(0.2, 0.05 + (x.load / d.loadMax) * 0.15)} />
          ))}
          <line x1={X(todayIdx)} x2={X(todayIdx)} y1={top} y2={bottom} stroke={ink} strokeOpacity="0.35" strokeDasharray="3 3" />
          <text x={X(todayIdx) + 4} y={d.top + d.hgt - 4} fontSize="9" fontWeight="700" fill={ink} opacity="0.6">today → if you rest</text>

          {/* main: fitness, fatigue (left scale) and form (right scale) */}
          {label(W - R - 4, d.top + 10, 'FITNESS · FATIGUE · FORM', isDark ? '#e2e8f0' : '#2E2B27')}
          {[0, d.lMax / 2, d.lMax].map((v) => <text key={`l${v}`} x={L - 4} y={Yl(v) + 3} fontSize="9" textAnchor="end" fill={ink} opacity="0.6">{v}</text>)}
          <rect x={L} y={Yt(d.tMax)} width={W - L - R} height={Yt(-5) - Yt(d.tMax)} fill="#22c55e" fillOpacity="0.035" />
          {[[-5, '#16a34a'], [-20, '#dc2626']].map(([v, c]) => (
            <g key={`t${v}`}>
              <line x1={L} x2={W - R} y1={Yt(v)} y2={Yt(v)} stroke={c} strokeDasharray="4 3" strokeOpacity="0.7" />
              <text x={W - R + 4} y={Yt(v) + 3} fontSize="9" fontWeight="700" fill={c}>{v}</text>
            </g>
          ))}
          <line x1={L} x2={W - R} y1={Yt(0)} y2={Yt(0)} stroke={grid} />
          <text x={W - R + 4} y={Yt(0) + 3} fontSize="9" fill={ink} opacity="0.6">0</text>
          <text x={W - R + 4} y={d.top - 4} fontSize="8" fontWeight="800" fill={ink} opacity="0.6">form</text>
          <text x={L - 4} y={d.top - 4} fontSize="8" fontWeight="800" textAnchor="end" fill={ink} opacity="0.6">load</text>
          <path d={ctlArea} fill="#0ea5e9" fillOpacity="0.16" stroke="#0ea5e9" strokeWidth="1.6" />
          <path d={line('ctl', Yl, 'future')} fill="none" stroke="#0ea5e9" strokeWidth="1.6" strokeDasharray="5 4" />
          <path d={line('atl', Yl, 'past')} fill="none" stroke="#f97316" strokeWidth="2" />
          <path d={line('atl', Yl, 'future')} fill="none" stroke="#f97316" strokeWidth="2" strokeDasharray="5 4" />
          <path d={line('tsb', Yt, 'past')} fill="none" stroke="url(#tl-form)" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />
          <path d={line('tsb', Yt, 'future')} fill="none" stroke="url(#tl-form)" strokeWidth="2.6" strokeDasharray="6 4" />
          {sessions.map(([i, x], k) => (
            <g key={`p${i}`}>
              <line x1={X(i)} x2={X(i)} y1={rows.main[0] + 4 + (k % 2) * 14 + 13} y2={bottom} stroke={isDark ? '#fb923c' : '#c2410c'} strokeWidth="1.1" strokeOpacity="0.5" />
              <rect x={X(i) - 16} y={rows.main[0] + 4 + (k % 2) * 14} width="32" height="13" rx="6" fill={isDark ? '#fb923c' : '#f97316'} />
              <text x={X(i)} y={rows.main[0] + 14 + (k % 2) * 14} fontSize="9" fontWeight="900" textAnchor="middle" fill="#1c1917">{x.load}</text>
              <title>{x.sessions.map((s) => `${s.name}${s.km ? ` ${s.km} km` : ''} - load ${s.load}`).join('\n')}</title>
            </g>
          ))}

          {/* load ratio */}
          {label(W - R - 4, rows.ratio[0] + 10, 'LOAD RATIO', '#d97706')}
          <rect x={L} y={Yr(1.3)} width={W - L - R} height={Yr(0.8) - Yr(1.3)} fill="#22c55e" fillOpacity="0.08" />
          {[[1.5, '#dc2626'], [0.8, '#0ea5e9']].map(([v, c]) => (
            <g key={`r${v}`}>
              <line x1={L} x2={W - R} y1={Yr(v)} y2={Yr(v)} stroke={c} strokeDasharray="4 3" strokeOpacity="0.7" />
              <text x={L - 4} y={Yr(v) + 3} fontSize="9" fontWeight="700" textAnchor="end" fill={c}>{v}</text>
            </g>
          ))}
          <text x={L - 4} y={Yr(1.3) + 3} fontSize="9" fontWeight="700" textAnchor="end" fill="#16a34a">1.3</text>
          <path d={line('acwr', Yr, 'past')} fill="none" stroke="url(#tl-ratio)" strokeWidth="2.5" strokeLinejoin="round" />
          <path d={line('acwr', Yr, 'future')} fill="none" stroke="url(#tl-ratio)" strokeWidth="2" strokeDasharray="5 4" />

          {/* refuelling: eaten climbing towards what you need, from each run */}
          {label(W - R - 4, rows.fuel[0] + 10, 'MUSCLE GLYCOGEN REFILL', '#0891b2')}
          <line x1={L} x2={W - R} y1={Yfu(0)} y2={Yfu(0)} stroke={grid} />
          {d.fuel.length > 0 && <>
            <path d={fuelPath('need')} fill="none" stroke="#0891b2" strokeWidth="1.6" strokeDasharray="5 3" strokeOpacity="0.8" />
            <path d={fuelPath('eaten')} fill="none" stroke="#06b6d4" strokeWidth="2.8" strokeLinejoin="round" />
            {lastFuel && <text x={X(lastFuel.i) + 6} y={Math.min(Yfu(lastFuel.eaten), Yfu(lastFuel.need)) + 10} fontSize="10" fontWeight="900" textAnchor="start" fill="#0891b2">{lastFuel.pct >= 100 ? 'refilled' : `${lastFuel.pct}% refilled`}</text>}
          </>}

          {d.ticks.map(([i, x]) => <text key={`x${i}`} x={X(i)} y={H - 2} fontSize="9" fontWeight={x.today ? 800 : 600} textAnchor={i === days.length - 1 ? 'end' : 'middle'} fill={ink} opacity={x.today ? 0.95 : 0.75}>{x.today ? 'today' : i === days.length - 1 ? '+7 days' : dm(x.day)}</text>)}

          {hover != null && (
            <g pointerEvents="none">
              <line x1={X(hi)} x2={X(hi)} y1={top} y2={bottom} stroke={ink} strokeOpacity="0.6" />
              <circle cx={X(hi)} cy={Yl(h.ctl)} r="4" fill="#0ea5e9" stroke="#fff" strokeWidth="1.5" />
              <circle cx={X(hi)} cy={Yl(h.atl)} r="4" fill="#f97316" stroke="#fff" strokeWidth="1.5" />
              <circle cx={X(hi)} cy={Yt(h.tsb)} r="4.5" fill={formZone(h.tsb)[1]} stroke="#fff" strokeWidth="1.5" />
              {h.acwr != null && <circle cx={X(hi)} cy={Yr(h.acwr)} r="4" fill={ratioZone(h.acwr)[1]} stroke="#fff" strokeWidth="1.5" />}
              {hf && hf.i === hi && <circle cx={X(hi)} cy={Yfu(hf.eaten)} r="4" fill="#06b6d4" stroke="#fff" strokeWidth="1.5" />}
            </g>
          )}
        </svg>
        {hover != null && (
          <div className={`pointer-events-none absolute top-10 z-10 w-72 rounded-lg border px-3 py-2 text-[11px] shadow-lg ${isDark ? 'bg-slate-900/95 border-white/10 text-slate-200' : 'bg-white/95 border-stone-200 text-[#2E2B27]'}`}
            style={tipLeftPct > 55 ? { right: `calc(${100 - tipLeftPct}% + 12px)` } : { left: `calc(${tipLeftPct}% + 12px)` }}>
            <div className="font-black mb-1">{h.today ? 'Today' : dm(h.day)}{h.future ? ' (if you rest)' : ''}</div>
            {tipRows.map(([c, name, v, why]) => (
              <div key={name} className="mb-1 last:mb-0">
                <span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1.5" style={{ background: c }} />
                <b>{name}</b> <span className="font-black" style={{ color: c }}>{v}</span>
                <div className="opacity-70 leading-snug pl-4">{why}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={`mt-1 min-h-[34px] text-[11px] rounded-lg px-3 py-1.5 ${isDark ? 'bg-white/5 text-slate-300' : 'bg-[#2E2B27]/5 text-[#2E2B27]'}`}>
        <span className="flex flex-wrap gap-x-4 gap-y-0.5">
          <b>{h.today ? 'Today' : dm(h.day)}{h.future ? ' (if you rest)' : ''}</b>
          <span className="text-sky-600">fitness {h.ctl}</span>
          <span className="text-orange-600">fatigue {h.atl}</span>
          <span style={{ color: formZone(h.tsb)[1] }}>form {h.tsb > 0 ? '+' : ''}{h.tsb} - {formZone(h.tsb)[0]}</span>
          {h.acwr != null && <span style={{ color: ratioZone(h.acwr)[1] }}>load ratio {h.acwr} - {ratioZone(h.acwr)[0]}</span>}
          {h.load > 0 && <span>load {h.load}: {h.sessions.map((s) => `${s.name}${s.km ? ` ${s.km} km` : ''}`).join(', ')}</span>}
          {!h.future && hf && <span className="text-cyan-600">glycogen refill: {hf.eaten} of {hf.need} g ({hf.pct}%)</span>}
        </span>
      </div>
      <div className={`mt-1 text-[11px] rounded-lg px-3 py-1.5 ${isDark ? 'bg-white/5 text-slate-300' : 'bg-[#2E2B27]/5 text-[#2E2B27]'}`}>
        <span className="flex flex-wrap gap-x-4 gap-y-0.5 opacity-80">
          <span><span className="inline-block w-3 h-2 bg-sky-500/40 align-middle mr-1" />fitness (42-day load)</span>
          <span><span className="inline-block w-3 h-1 bg-orange-500 align-middle mr-1 rounded" />fatigue (7-day load)</span>
          <span><span className="inline-block w-3 h-1 bg-green-600 align-middle mr-1 rounded" />form = fitness - fatigue, right-hand scale - it mirrors the fatigue line because fitness barely moves day to day - <span className="text-red-500 font-bold">red</span> below -20, <span className="text-amber-600 font-bold">amber</span> recovering, green above -5</span>
          <span>load ratio - <span className="font-bold text-green-700">0.8-1.3 sweet spot</span>, <span className="font-bold text-red-600">over 1.5 injury risk</span></span>
          <span><span className="inline-block w-3 h-1 bg-cyan-500 align-middle mr-1 rounded" />muscle glycogen put back since each run (dashed: what the run used) - about half the carbs you log in IMS or AAPS</span>
          <span><span className="inline-block px-1 rounded bg-orange-500 text-[9px] font-black text-stone-900 mr-1">195</span>a session and its load</span>
          <span>dashed: the next week if you rest</span>
        </span>
      </div>
    </div>
  );
}
