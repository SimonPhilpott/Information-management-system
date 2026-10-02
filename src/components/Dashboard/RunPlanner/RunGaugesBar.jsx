import { Sun, Moon, CloudSun, CloudMoon, Cloud, CloudRain, CloudDrizzle, CloudSnow, CloudLightning, CloudFog } from 'lucide-react';
import React from 'react';
import RadialGauge from './RadialGauge';
import { paceToMinPerKm, paceText, elev, elevUnit, KM_PER_MI, FT_PER_M } from '../../../utils/units';

/**
 * Top Telemetry Bar containing three radial gauges with target zones:
 * 1. Pace Gauge
 * 2. Elevation / Climbing Gauge
 * 3. Blood Glucose Target Zone Gauge
 */
// the weather as a picture: an icon for the condition (day or night), a compass for the wind
const COMPASS = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
function weatherIcon(condition = '', day = true) {
  const c = condition.toLowerCase();
  if (/thunder|lightning/.test(c)) return [CloudLightning, '#7c3aed'];
  if (/snow|sleet|hail/.test(c)) return [CloudSnow, '#38bdf8'];
  if (/drizzle|light rain|shower/.test(c)) return [CloudDrizzle, '#0ea5e9'];
  if (/rain/.test(c)) return [CloudRain, '#0284c7'];
  if (/fog|mist|haze/.test(c)) return [CloudFog, '#94a3b8'];
  if (/overcast|cloudy/.test(c) && !/partly|bright|sunny/.test(c)) return [Cloud, '#94a3b8'];
  if (/partly|bright|some cloud|mostly sunny/.test(c)) return day ? [CloudSun, '#f59e0b'] : [CloudMoon, '#94a3b8'];
  return day ? [Sun, '#f59e0b'] : [Moon, '#94a3b8'];
}

export default function RunGaugesBar({
  paceTextVal = '5:15',
  units = 'km',
  gainM = 0,
  lossM = 0,
  currentBg = 8.0,
  bgFloor = 4.5,
  bgCeiling = 10.0,
  targetBg = 8.0,
  isDark = true,
  livePaceSec = null,
  liveElevationM = null,
  liveBg = null,
  weather = null, // { current, hydration } - the planner's quick-reference weather tile
  isLiveFlythrough = false
}) {
  // Everything below is worked out in km and metres, then shown in the chosen units: pace per km or
  // per mile, climbing in metres or feet. paceTextVal is already per the chosen unit; livePaceSec is per km.
  const perUnit = units === 'mi' ? KM_PER_MI : 1; // min/km -> min per chosen unit
  const parsedPaceKm = paceToMinPerKm(paceTextVal, units) || 5.25;
  const activePaceKm = isLiveFlythrough && livePaceSec != null ? livePaceSec / 60 : parsedPaceKm;
  const activePaceDisplay = isLiveFlythrough && livePaceSec != null ? paceText(livePaceSec / 60, units) : paceTextVal || paceText(5.25, units);

  // Pace target zones (aerobic zone around 4:48 - 5:42 /km), scaled to the chosen unit
  const paceZones = [
    { from: 3.5, to: 4.8, color: '#f59e0b', label: 'Anaerobic' },
    { from: 4.8, to: 5.7, color: '#10b981', label: 'Target Safe' },
    { from: 5.7, to: 8.5, color: '#38bdf8', label: 'Aerobic Base' }
  ].map((z) => ({ ...z, from: z.from * perUnit, to: z.to * perUnit }));

  // Elevation gauge parameters (metres, or feet with miles)
  const toUnit = units === 'mi' ? FT_PER_M : 1;
  const elevValM = isLiveFlythrough && liveElevationM != null ? liveElevationM : (gainM || 0);
  const elevMaxM = Math.max(150, Math.ceil(((gainM || 50) * 1.3) / 50) * 50);
  const elevZones = [
    { from: 0, to: 50, color: '#10b981', label: 'Flat' },
    { from: 50, to: 120, color: '#38bdf8', label: 'Rolling' },
    { from: 120, to: elevMaxM, color: '#f97316', label: 'Climbing' }
  ].map((z) => ({ ...z, from: z.from * toUnit, to: z.to * toUnit }));
  const eu = elevUnit(units);

  // Blood glucose gauge parameters (mmol/L)
  const bgVal = isLiveFlythrough && liveBg != null ? liveBg : (parseFloat(currentBg) || 8.0);
  const bgZones = [
    { from: 2.0, to: bgFloor || 4.5, color: '#ef4444', label: 'Hypo' },
    { from: bgFloor || 4.5, to: 7.0, color: '#f59e0b', label: 'Low' },
    { from: 7.0, to: bgCeiling || 10.0, color: '#10b981', label: 'Safe' },
    { from: bgCeiling || 10.0, to: 16.0, color: '#f97316', label: 'Hyper' }
  ];

  return (
    <div className={`grid grid-cols-1 gap-3.5 mb-4 ${weather?.current ? 'sm:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'}`}>
      {/* 1. Pace Gauge */}
      <RadialGauge
        value={activePaceKm * perUnit}
        min={3.5 * perUnit}
        max={8.5 * perUnit}
        unit={`/${units}`}
        title={isLiveFlythrough ? 'Instantaneous Pace' : 'Pace'}
        zones={paceZones}
        targetLabel={`Target: ${paceText(4.8, units)} - ${paceText(5.7, units)} /${units}`}
        displayValue={activePaceDisplay}
        isDark={isDark}
      />

      {/* 2. Elevation Gauge */}
      <RadialGauge
        value={elevValM * toUnit}
        min={0}
        max={elevMaxM * toUnit}
        unit={`${units === 'mi' ? 'feet' : 'metres'} ${isLiveFlythrough ? 'alt' : 'ascent'}`}
        title={isLiveFlythrough ? 'Current Altitude' : 'Ascent'}
        zones={elevZones}
        targetLabel={gainM ? `+${elev(gainM, units)}${eu} / -${elev(lossM, units)}${eu}` : 'Flat Course'}
        displayValue={String(elev(elevValM, units))}
        isDark={isDark}
      />

      {/* 3. Blood Glucose Target Zone Gauge */}
      <RadialGauge
        value={bgVal}
        min={2.0}
        max={16.0}
        unit="mmol/L"
        title={isLiveFlythrough ? 'Simulated Glucose' : 'Blood Glucose'}
        zones={bgZones}
        targetLabel={`Target: 7.0 - ${bgCeiling || 10.0}`}
        displayValue={Number(bgVal).toFixed(1)}
        isDark={isDark}
      />

      {/* 4. Weather for the run (planner only) */}
      {weather?.current && (() => {
        const c = weather.current, h = weather.hydration || {};
        const ink = isDark ? 'text-slate-100' : 'text-[#2E2B27]';
        const sub = isDark ? 'text-slate-400' : 'text-[#6A645D]';
        return (
          <div className={`flex flex-col justify-between p-3.5 rounded-2xl border ${isDark ? 'bg-slate-900/60 border-white/10 shadow-lg shadow-black/20' : 'bg-white border-[#2E2B27]/10 shadow-sm'}`}>
            <div className="w-full flex flex-col items-start gap-1 mb-1">
              <span className={`text-sm font-black uppercase tracking-wide ${isDark ? 'text-slate-100' : 'text-[#2E2B27]'}`}>Weather</span>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${isDark ? 'bg-sky-500/10 border-sky-500/25 text-sky-300' : 'bg-sky-50 border-sky-300 text-sky-900'}`}>{c.condition}</span>
            </div>
            {(() => {
              const [Icon, colour] = weatherIcon(c.condition, c.is_daylight !== false);
              const from = COMPASS[String(c.wind_direction || '').toUpperCase()];
              const mph = c.wind_speed_mph ?? Math.round((c.wind_speed_kmh || 0) / 1.609);
              return (
                <div className="flex items-center gap-3 my-2">
                  <Icon size={46} color={colour} strokeWidth={1.6} aria-label={c.condition} />
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-4xl font-black tabular-nums ${ink}`}>{Math.round(c.temperature_c)}°</span>
                      <span className={`text-xs whitespace-nowrap ${sub}`}>feels {Math.round(c.feels_like_c)}°C</span>
                    </div>
                  </div>
                  {/* wind: the arrow points the way it's blowing; the ring fills with its strength */}
                  {from != null && (
                    <svg viewBox="0 0 64 64" width="70" height="70" className="shrink-0" role="img" aria-label={`Wind ${mph} mph from the ${c.wind_direction}`}>
                      {/* ring: fills with the wind's strength (full at 30 mph) */}
                      <circle cx="32" cy="32" r="19" fill="none" stroke={isDark ? 'rgba(255,255,255,0.15)' : 'rgba(46,43,39,0.15)'} strokeWidth="3" />
                      <circle cx="32" cy="32" r="19" fill="none" stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round"
                        strokeDasharray={`${Math.min(1, mph / 30) * 119.4} 119.4`} transform="rotate(-90 32 32)" />
                      {/* compass points outside the ring, clear of the arrow */}
                      {[['N', 32, 7.5], ['E', 57.5, 35.5], ['S', 32, 62], ['W', 6.5, 35.5]].map(([t, x, y]) => (
                        <text key={t} x={x} y={y} fontSize="10" fontWeight="900" textAnchor="middle" fill={t === 'N' ? (isDark ? '#e2e8f0' : '#2E2B27') : (isDark ? '#94a3b8' : '#6A645D')}>{t}</text>
                      ))}
                      {/* arrow: the way the wind is blowing */}
                      <g transform={`rotate(${from + 180} 32 32)`}>
                        <path d="M32 19 L37 30 L32 27.5 L27 30 Z" fill={isDark ? '#e2e8f0' : '#2E2B27'} />
                        <line x1="32" y1="27.5" x2="32" y2="44" stroke={isDark ? '#e2e8f0' : '#2E2B27'} strokeWidth="2.2" strokeLinecap="round" />
                      </g>
                    </svg>
                  )}
                </div>
              );
            })()}
            <div className={`grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] ${ink}`}>
              <span><span className={sub}>Wind</span> <b>{c.wind_speed_mph ?? Math.round((c.wind_speed_kmh || 0) / 1.609)} mph</b> {c.wind_direction || ''}</span>
              <span className="flex items-center gap-1.5"><span className={sub}>Humidity</span> <b>{c.humidity_percent}%</b>
                <span className={`flex-1 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}><span className="block h-full bg-sky-400" style={{ width: `${c.humidity_percent}%` }} /></span></span>
              {h.sweatLossMl != null && <span><span className={sub}>Sweat</span> <b>{h.sweatLossMl} ml</b> ({h.lossPct}%)</span>}
              {h.drinkToThirst != null && <span><span className={sub}>Drink</span> <b>{h.drinkToThirst ? 'to thirst' : `${h.needMl} ml`}</b></span>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
