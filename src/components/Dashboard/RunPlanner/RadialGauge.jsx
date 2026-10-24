import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

// Which look the gauges take. The classic planner keeps its thin arcs; the Run planner beta asks for 'dial' (24 Oct,
// Simon): a thick half-circle whose colours run smoothly from zone to zone, a dark tapered needle that swings up from
// the bottom of the scale to its value when the page first opens, and the value in a pill on the hub.
export const GaugeStyle = createContext('arc');

const hex = (c) => { const h = String(c).replace('#', ''); const f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); };
const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;

function Dial({ fraction, zones, safeMin, safeMax, formattedDisplay, unit, title, isDark }) {
  const cx = 120, cy = 114, rMid = 84, band = 30; // (the dial sits a little up, clear of the end labels)
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // the needle starts at the bottom of the scale and swings to its value once; after that it follows the value quickly
  const [phase, setPhase] = useState(reduced ? 'live' : 'start');
  // the swing plays each time the dial comes into view (24 Oct, Simon) - scrolled away, it's set back to the start
  const svgRef = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = svgRef.current;
    if (!el || reduced || typeof IntersectionObserver === 'undefined') { setInView(true); return undefined; }
    const io = new IntersectionObserver(([e]) => {
      setInView(e.isIntersecting);
      if (!e.isIntersecting) setPhase('start');
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);
  useEffect(() => {
    if (phase !== 'start' || !inView) return undefined;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setPhase('intro')));
    return () => cancelAnimationFrame(raf);
  }, [phase, inView]);
  useEffect(() => { if (phase !== 'intro') return undefined; const t = setTimeout(() => setPhase('live'), 1500); return () => clearTimeout(t); }, [phase]);
  const angle = -90 + (phase === 'start' ? 0 : fraction) * 180;

  // the colour at each point of the scale: blended between the middles of the zones
  const span = safeMax - safeMin;
  const stops = zones.map((z) => {
    const a = Math.max(safeMin, Math.min(safeMax, z.from)), b = Math.max(safeMin, Math.min(safeMax, z.to));
    return { at: ((a + b) / 2 - safeMin) / span, rgb: hex(z.color) };
  }).filter((z) => z.at >= 0 && z.at <= 1).sort((a, b) => a.at - b.at);
  const colourAt = (t) => {
    if (!stops.length) return isDark ? '#9fd88a' : '#2f6b3c';
    if (t <= stops[0].at) return mix(stops[0].rgb, stops[0].rgb, 0);
    for (let i = 1; i < stops.length; i++) if (t <= stops[i].at) return mix(stops[i - 1].rgb, stops[i].rgb, (t - stops[i - 1].at) / (stops[i].at - stops[i - 1].at));
    return mix(stops[stops.length - 1].rgb, stops[stops.length - 1].rgb, 0);
  };
  const pt = (deg, r) => [cx + r * Math.sin((deg * Math.PI) / 180), cy - r * Math.cos((deg * Math.PI) / 180)];
  const N = 72;
  const segs = Array.from({ length: N }, (_, i) => {
    const a1 = -90 + (i / N) * 180, a2 = -90 + ((i + 1) / N) * 180 + 0.6; // a hair of overlap, so no seams show
    const [x1, y1] = pt(a1, rMid), [x2, y2] = pt(Math.min(a2, 90), rMid);
    return <path key={i} d={`M${x1.toFixed(2)} ${y1.toFixed(2)} A${rMid} ${rMid} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`} stroke={colourAt((i + 0.5) / N)} strokeWidth={band} fill="none" />;
  });
  const hub = isDark ? '#1d211a' : '#ffffff';
  const ink = isDark ? '#e2e4d8' : '#1b1d17';
  const first = zones[0]?.label, last = zones[zones.length - 1]?.label;
  const shortUnit = String(unit).replace(/feet/, 'ft'); // "ft ascent" fits the pill
  const pillW = Math.max(76, Math.min(108, Math.max(String(formattedDisplay).length * 11, shortUnit.length * 6.2) + 26));
  return (
    <svg ref={svgRef} viewBox="0 0 240 150" className="w-full h-full overflow-visible select-none" role="img" aria-label={`${title}: ${formattedDisplay} ${unit}`}>
      {/* the band, with rounded ends */}
      <circle cx={pt(-90, rMid)[0]} cy={cy} r={band / 2} fill={colourAt(0)} />
      <circle cx={pt(90, rMid)[0]} cy={cy} r={band / 2} fill={colourAt(1)} />
      {segs}
      {/* the hub */}
      <path d={`M${cx - 56} ${cy} A56 56 0 0 1 ${cx + 56} ${cy} Z`} fill={hub} />
      {/* the needle: from the edge of the hub out across the band */}
      <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${cx}px ${cy}px`, transformBox: 'view-box',
        transition: phase === 'intro' ? 'transform 1.4s cubic-bezier(.34, 1.36, .64, 1)' : phase === 'live' ? 'transform .35s cubic-bezier(.2, 0, 0, 1)' : 'none' }}>
        <path d={`M${cx - 6} ${cy - 48} L${cx} ${cy - rMid - band / 2 + 4} L${cx + 6} ${cy - 48} Z`} fill={ink} stroke={hub} strokeWidth="2" strokeLinejoin="round" />
      </g>
      {/* the value, and what it's measured in beneath it, together in a pill on the hub (24 Oct, Simon) */}
      <rect x={cx - pillW / 2} y={cy - 26} width={pillW} height="44" rx="17" fill={ink} />
      <text x={cx} y={cy - 6} textAnchor="middle" fill={hub} fontSize="18" fontWeight="800" style={{ fontVariantNumeric: 'tabular-nums' }}>{formattedDisplay}</text>
      <text x={cx} y={cy + 11} textAnchor="middle" fill={hub} fillOpacity=".85" fontSize="11" fontWeight="700">{shortUnit}</text>
      {/* the ends of the scale */}
      {first && <text x={pt(-90, rMid)[0]} y={cy + 34} textAnchor="middle" fill={isDark ? '#a6b5a3' : '#5d6b5f'} fontSize="10.5" fontWeight="800" letterSpacing=".05em">{String(first).toUpperCase()}</text>}
      {last && zones.length > 1 && <text x={pt(90, rMid)[0]} y={cy + 34} textAnchor="middle" fill={isDark ? '#a6b5a3' : '#5d6b5f'} fontSize="10.5" fontWeight="800" letterSpacing=".05em">{String(last).toUpperCase()}</text>}
    </svg>
  );
}

/**
 * Reusable SVG Radial Gauge with Target Safe Zones and animated needle.
 *
 * @param {number|string} value - Current scalar value to display
 * @param {number} min - Minimum value for the gauge scale
 * @param {number} max - Maximum value for the gauge scale
 * @param {string} unit - Unit label (e.g. 'min/km', 'm', 'mmol/L')
 * @param {string} title - Gauge title
 * @param {Array} zones - Array of { from, to, color, label }
 * @param {string} targetLabel - Optional sub-heading or target zone description
 * @param {string} displayValue - Optional custom formatted string (e.g. '5:12')
 * @param {boolean} isDark - Dark mode theme flag
 */
export default function RadialGauge({
  value = 0,
  min = 0,
  max = 100,
  unit = '',
  title = '',
  zones = [],
  targetLabel = '',
  displayValue = null,
  isDark = true,
  className = ''
}) {
  const numVal = typeof value === 'number' ? value : parseFloat(value) || 0;
  const safeMin = Number(min);
  const safeMax = Number(max) > safeMin ? Number(max) : safeMin + 1;
  const clampedVal = Math.min(safeMax, Math.max(safeMin, numVal));
  const fraction = (clampedVal - safeMin) / (safeMax - safeMin);

  // SVG Geometry: 240-degree sweep from -120deg to +120deg
  const cx = 120;
  const cy = 115;
  const r = 82;
  const strokeWidth = 10;
  const startAngleDeg = -120;
  const endAngleDeg = 120;
  const totalSweepDeg = endAngleDeg - startAngleDeg; // 240 deg

  const degToRad = (deg) => ((deg - 90) * Math.PI) / 180;
  const polarToX = (deg, radius = r) => cx + radius * Math.cos(degToRad(deg));
  const polarToY = (deg, radius = r) => cy + radius * Math.sin(degToRad(deg));

  const describeArc = (startDeg, endDeg, radius = r) => {
    const x1 = polarToX(startDeg, radius);
    const y1 = polarToY(startDeg, radius);
    const x2 = polarToX(endDeg, radius);
    const y2 = polarToY(endDeg, radius);
    const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  const needleAngle = startAngleDeg + fraction * totalSweepDeg;
  const needleLen = r - 12;
  const nx = polarToX(needleAngle, needleLen);
  const ny = polarToY(needleAngle, needleLen);

  const formattedDisplay = displayValue !== null ? displayValue : Number(numVal).toFixed(1);
  const style = useContext(GaugeStyle);

  return (
    <div className={`flex flex-col items-center justify-between p-3.5 rounded-2xl border transition-all ${isDark ? 'bg-slate-900/60 border-white/10 shadow-lg shadow-black/20' : 'bg-white border-[#2E2B27]/10 shadow-sm'} ${className}`}>
      {/* Title, then the target / zone pill on its own line so the title never wraps */}
      <div className="w-full flex flex-col items-start gap-1 mb-1">
        <span className={`rp-title text-sm font-black uppercase tracking-wide ${isDark ? 'text-slate-100' : 'text-[#2E2B27]'}`}>{title}</span>
        {targetLabel && (
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${isDark ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' : 'bg-emerald-50 border-emerald-300 text-emerald-800'}`}>
            {targetLabel}
          </span>
        )}
      </div>

      {/* Radial SVG Arc */}
      <div className="relative w-full max-w-[220px] aspect-[240/150] flex items-center justify-center">
        {style === 'dial' ? <Dial fraction={fraction} zones={zones} safeMin={safeMin} safeMax={safeMax} formattedDisplay={formattedDisplay} unit={unit} title={title} isDark={isDark} /> : (
        <svg viewBox="0 0 240 150" className="w-full h-full overflow-visible select-none" role="img" aria-label={`${title}: ${formattedDisplay} ${unit}`}>
          <defs>
            <filter id={`glow-${title.replace(/\s+/g, '')}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background Track Arc */}
          <path
            d={describeArc(startAngleDeg, endAngleDeg)}
            fill="none"
            stroke={isDark ? '#1e293b' : '#EDE5D8'}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Coloured Zone Segments */}
          {zones.map((z, idx) => {
            const zFrom = Math.min(safeMax, Math.max(safeMin, z.from));
            const zTo = Math.min(safeMax, Math.max(safeMin, z.to));
            if (zTo <= zFrom) return null;
            const a1 = startAngleDeg + ((zFrom - safeMin) / (safeMax - safeMin)) * totalSweepDeg;
            const a2 = startAngleDeg + ((zTo - safeMin) / (safeMax - safeMin)) * totalSweepDeg;
            return (
              <path
                key={idx}
                d={describeArc(a1, a2)}
                fill="none"
                stroke={z.color}
                strokeWidth={strokeWidth - 1}
                strokeOpacity={z.active !== false ? 0.9 : 0.4}
                strokeLinecap="round"
              />
            );
          })}

          {/* Needle Pointer */}
          <g className="transition-transform duration-300 ease-out">
            <line
              x1={cx}
              y1={cy}
              x2={nx}
              y2={ny}
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeLinecap="round"
              filter={`url(#glow-${title.replace(/\s+/g, '')})`}
            />
            {/* Needle Pivot Circle */}
            <circle cx={cx} cy={cy} r="6" fill="#0284c7" />
            <circle cx={cx} cy={cy} r="3" fill="#ffffff" />
          </g>

          {/* Numeric Value & Unit Overlay in Center */}
          <text
            x={cx}
            y={cy - 22}
            textAnchor="middle"
            className="font-black tabular-nums"
            fill={isDark ? '#f8fafc' : '#2E2B27'}
            fontSize="26"
            letterSpacing="-0.5px"
          >
            {formattedDisplay}
          </text>
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            className="font-bold uppercase tracking-wider"
            fill={isDark ? '#94a3b8' : '#6A645D'}
            fontSize="10"
          >
            {unit}
          </text>
        </svg>
        )}
      </div>

      {/* Zone Legend Indicator Strip */}
      {zones.length > 0 && (
        <div className={`w-full flex flex-wrap items-center justify-center ${style === 'dial' ? 'gap-x-4 gap-y-1 mt-2 pt-2.5' : 'gap-2 mt-1 pt-1.5'} border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
          {zones.map((z, idx) => (
            // the beta's dials have a legend you can read (24 Oct, Simon: it was really small)
            <div key={idx} className={`flex items-center ${style === 'dial' ? 'gap-1.5 text-[13px] font-semibold' : 'gap-1 text-[9px]'} ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>
              <span className={`${style === 'dial' ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5'} rounded-full`} style={{ backgroundColor: z.color }} />
              <span>{z.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
