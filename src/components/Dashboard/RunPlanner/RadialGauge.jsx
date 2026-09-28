import React from 'react';

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

  return (
    <div className={`flex flex-col items-center justify-between p-3.5 rounded-2xl border transition-all ${isDark ? 'bg-slate-900/60 border-white/10 shadow-lg shadow-black/20' : 'bg-white border-[#2E2B27]/10 shadow-sm'} ${className}`}>
      {/* Title & Target Zone Badge */}
      <div className="w-full flex items-center justify-between mb-1">
        <span className={`text-[11px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-[#2E2B27]'}`}>{title}</span>
        {targetLabel && (
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${isDark ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' : 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold'}`}>
            {targetLabel}
          </span>
        )}
      </div>

      {/* Radial SVG Arc */}
      <div className="relative w-full max-w-[220px] aspect-[240/150] flex items-center justify-center">
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
      </div>

      {/* Zone Legend Indicator Strip */}
      {zones.length > 0 && (
        <div className={`w-full flex items-center justify-center gap-2 mt-1 pt-1.5 border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
          {zones.map((z, idx) => (
            <div key={idx} className={`flex items-center gap-1 text-[9px] ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: z.color }} />
              <span>{z.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
