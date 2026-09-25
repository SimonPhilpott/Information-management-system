import React, { useState, useEffect, useCallback } from 'react';

// Distance units for run data: kilometres or miles. One choice shared by every page and
// remembered in the browser. (Elevation stays in metres.) The server always works in km.
const KEY = 'ims_units';
export const KM_PER_MI = 1.609344;

const read = () => { try { return localStorage.getItem(KEY) === 'mi' ? 'mi' : 'km'; } catch (_) { return 'km'; } };

export function useUnits() {
  const [units, setState] = useState(read);
  useEffect(() => {
    const on = () => setState(read());
    window.addEventListener('storage', on);
    window.addEventListener('ims-units', on);
    return () => { window.removeEventListener('storage', on); window.removeEventListener('ims-units', on); };
  }, []);
  const setUnits = useCallback((u) => {
    try { localStorage.setItem(KEY, u); } catch (_) { /* not remembered */ }
    setState(u);
    window.dispatchEvent(new Event('ims-units'));
  }, []);
  return { units, setUnits, label: units === 'mi' ? 'mi' : 'km' };
}

// km -> the chosen unit, rounded.
export const dist = (km, units, digits = 1) => (km == null ? null : Number(((units === 'mi' ? km / KM_PER_MI : Number(km))).toFixed(digits)));
// A value typed in the chosen unit -> km.
export const toKm = (v, units) => (units === 'mi' ? Number(v) * KM_PER_MI : Number(v));
const mmss = (min) => `${Math.floor(min)}:${String(Math.round((min % 1) * 60) % 60 || 0).padStart(2, '0')}`;
// min per km -> "m:ss" per chosen unit.
export const paceText = (minPerKm, units) => {
  const p = units === 'mi' ? minPerKm * KM_PER_MI : minPerKm;
  let m = Math.floor(p), s = Math.round((p - m) * 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, '0')}`;
};
// "m:ss" typed per chosen unit -> min per km.
export const paceToMinPerKm = (text, units) => {
  const [m, s] = String(text).split(':');
  const perUnit = Number(m) + (Number(s) || 0) / 60;
  return units === 'mi' ? perUnit / KM_PER_MI : perUnit;
};
// metres per second -> km/h or mph.
export const speedText = (ms, units) => (units === 'mi' ? `${(ms * 3.6 / KM_PER_MI).toFixed(1)} mph` : `${(ms * 3.6).toFixed(1)} km/h`);

export function UnitToggle({ units, setUnits, isDark }) {
  return (
    <div className={`inline-flex rounded-lg overflow-hidden border text-[10px] font-bold uppercase tracking-wide ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`} role="group" aria-label="Distance units">
      {[['km', 'Kilometres'], ['mi', 'Miles']].map(([u, name]) => (
        <button key={u} type="button" onClick={() => setUnits(u)} title={name}
          className={`px-3 py-1.5 ${units === u ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white' : isDark ? 'text-slate-400 hover:bg-white/5' : 'text-slate-600 hover:bg-black/5'}`}>
          {u}
        </button>
      ))}
    </div>
  );
}
