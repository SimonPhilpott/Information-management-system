import React from 'react';
import RadialGauge from './RadialGauge';
import { paceToMinPerKm, paceText, elev, elevUnit, KM_PER_MI, FT_PER_M } from '../../../utils/units';

/**
 * Top Telemetry Bar containing three radial gauges with target zones:
 * 1. Pace Gauge
 * 2. Elevation / Climbing Gauge
 * 3. Blood Glucose Target Zone Gauge
 */
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
    { from: 2.0, to: bgFloor || 4.5, color: '#ef4444', label: 'Hypo Floor' },
    { from: bgFloor || 4.5, to: 7.0, color: '#f59e0b', label: 'Sub-Optimal' },
    { from: 7.0, to: bgCeiling || 10.0, color: '#10b981', label: 'Target Safe' },
    { from: bgCeiling || 10.0, to: 16.0, color: '#f97316', label: 'Elevated' }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-4">
      {/* 1. Pace Gauge */}
      <RadialGauge
        value={activePaceKm * perUnit}
        min={3.5 * perUnit}
        max={8.5 * perUnit}
        unit={`/${units}`}
        title={isLiveFlythrough ? 'Instantaneous Pace' : 'Planned Running Pace'}
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
        title={isLiveFlythrough ? 'Current Altitude' : 'Total Route Ascent'}
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
        title={isLiveFlythrough ? 'Simulated Glucose' : 'Blood Glucose Status'}
        zones={bgZones}
        targetLabel={`Target: 7.0 - ${bgCeiling || 10.0}`}
        displayValue={Number(bgVal).toFixed(1)}
        isDark={isDark}
      />
    </div>
  );
}
