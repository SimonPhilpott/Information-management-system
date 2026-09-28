import React from 'react';
import RadialGauge from './RadialGauge';
import { paceToMinPerKm } from '../../../utils/units';

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
  // Pace parsing: convert mm:ss to decimal minutes per km
  const parsedPace = paceToMinPerKm(paceTextVal) || 5.25;
  const activePaceNum = livePaceSec != null ? livePaceSec / 60 : parsedPace;
  const activePaceDisplay = isLiveFlythrough && livePaceSec != null
    ? `${Math.floor(livePaceSec / 60)}:${String(Math.round(livePaceSec % 60)).padStart(2, '0')}`
    : paceTextVal || '5:15';

  // Pace target zones (aerobic zone around 5:00 - 5:40 /km)
  const paceZones = [
    { from: 3.5, to: 4.8, color: '#f59e0b', label: 'Anaerobic' },
    { from: 4.8, to: 5.7, color: '#10b981', label: 'Target Safe' },
    { from: 5.7, to: 8.5, color: '#38bdf8', label: 'Aerobic Base' }
  ];

  // Elevation gauge parameters
  const elevVal = isLiveFlythrough && liveElevationM != null ? liveElevationM : (gainM || 0);
  const elevMax = Math.max(150, Math.ceil(((gainM || 50) * 1.3) / 50) * 50);
  const elevZones = [
    { from: 0, to: 50, color: '#10b981', label: 'Flat' },
    { from: 50, to: 120, color: '#38bdf8', label: 'Rolling' },
    { from: 120, to: elevMax, color: '#f97316', label: 'Climbing' }
  ];

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
        value={activePaceNum}
        min={3.5}
        max={8.5}
        unit={`/${units}`}
        title={isLiveFlythrough ? 'Instantaneous Pace' : 'Planned Running Pace'}
        zones={paceZones}
        targetLabel="Target: 4:50 - 5:35"
        displayValue={activePaceDisplay}
        isDark={isDark}
      />

      {/* 2. Elevation Gauge */}
      <RadialGauge
        value={elevVal}
        min={0}
        max={elevMax}
        unit={isLiveFlythrough ? 'metres alt' : 'metres ascent'}
        title={isLiveFlythrough ? 'Current Altitude' : 'Total Route Ascent'}
        zones={elevZones}
        targetLabel={gainM ? `+${gainM}m / -${lossM}m` : 'Flat Course'}
        displayValue={String(Math.round(elevVal))}
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
