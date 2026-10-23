// Homebrew: metric or imperial (23 Oct 2026, Simon). One setting, remembered on this device, for every amount the app
// shows - ingredient amounts, batch sizes, the Find matches. Recipes are stored in metric (kg, g, L, ml); imperial
// shows UK pounds and ounces, pints and gallons, rounded to sensible quarters. Kitchen measures (tsp, cups, handfuls)
// and bottle sizes stay as they are, and so do amounts too small to mean anything in ounces (a few grams).
import React, { useSyncExternalStore } from 'react';
import { MenuChip, Menu, useMenu, Segmented } from './ui';

// ---- the setting ----
const KEY = 'hbbSystem';
let system = (() => { try { return localStorage.getItem(KEY) === 'imperial' ? 'imperial' : 'metric'; } catch { return 'metric'; } })();
const listeners = new Set();
export function setSystem(v) {
  system = v === 'imperial' ? 'imperial' : 'metric';
  try { localStorage.setItem(KEY, system); } catch { /* this visit only */ }
  // the brewing tools' volume units follow it, unless chosen there since
  try { localStorage.setItem('hbbUnits', system === 'imperial' ? 'uk' : 'l'); } catch { /* fine */ }
  listeners.forEach((l) => l());
}
export const useSystem = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => system);

// ---- numbers ----
const FR = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const one = (t) => {
  const s = String(t).trim().replace(/[½¼¾⅓⅔⅛]/g, (m) => ` ${FR[m]}`);
  if (!s || /[a-z]/i.test(s)) return NaN;
  return s.split(/\s+/).reduce((sum, p) => sum + (p.includes('/') ? (() => { const [a, b] = p.split('/'); return Number(a) / Number(b); })() : Number(p)), 0);
};
// "10-12", "0.5", "1½" -> [10, 12] etc., or null if it isn't a plain number or range
const parse = (amount) => {
  const parts = String(amount ?? '').trim().split(/\s*[–-]\s*|\s+to\s+/);
  const vals = parts.map(one);
  return vals.length && vals.every(Number.isFinite) ? vals : null;
};
// a number in quarters ("2¼", "¾"), or a whole number when it's big
const quarters = (n) => {
  if (n >= 20) return String(Math.round(n));
  const q = Math.round(n * 4) / 4;
  const w = Math.floor(q), f = q - w;
  const frac = f === 0.25 ? '¼' : f === 0.5 ? '½' : f === 0.75 ? '¾' : '';
  return w === 0 && frac ? frac : `${w}${frac}`;
};
const metricNum = (n) => (n >= 100 ? String(Math.round(n)) : n >= 10 ? String(Math.round(n * 10) / 10) : String(Math.round(n * 100) / 100));

// ---- one amount and its unit, in the chosen system ----
const UNIT = /^\s*(kg|kilograms?|g|grams?|l|litres?|liters?|ml|millilitres?|lbs?|pounds?|oz|ounces?|pints?|pt|gal|gallons?|fl\.? ?oz|qt|quarts?)\b(.*)$/i;
const toBase = (u, v) => {
  const x = u.toLowerCase();
  if (/^(kg|kilogram)/.test(x)) return ['mass', v * 1000];
  if (/^(g|gram)/.test(x)) return ['mass', v];
  if (/^(lb|pound)/.test(x)) return ['mass', v * 453.592];
  if (/^(oz|ounce)/.test(x)) return ['mass', v * 28.3495];
  if (/^(l$|litre|liter)/.test(x)) return ['vol', v * 1000];
  if (/^(ml|millilitre)/.test(x)) return ['vol', v];
  if (/^(pint|pt)/.test(x)) return ['vol', v * 568.261];
  if (/^(gal|gallon)/.test(x)) return ['vol', v * 4546.09];
  if (/^fl/.test(x)) return ['vol', v * 28.4131];
  if (/^(qt|quart)/.test(x)) return ['vol', v * 1136.52];
  return [null, v];
};
function show(kind, vals, sys) {
  const top = Math.max(...vals);
  if (kind === 'mass') {
    if (sys === 'metric') return top >= 1000 ? [vals.map((v) => metricNum(v / 1000)), 'kg'] : [vals.map((v) => metricNum(v)), 'g'];
    if (top < 7) return [vals.map((v) => metricNum(v)), 'g']; // too little for ounces
    return top >= 453.592 ? [vals.map((v) => quarters(v / 453.592)), 'lb'] : [vals.map((v) => quarters(v / 28.3495)), 'oz'];
  }
  if (sys === 'metric') return top >= 1000 ? [vals.map((v) => metricNum(v / 1000)), 'L'] : [vals.map((v) => metricNum(v)), 'ml'];
  if (top < 14) return [vals.map((v) => metricNum(v)), 'ml']; // a spoonful or so
  if (top >= 4546.09 * 0.95) return [vals.map((v) => quarters(v / 4546.09)), 'gal'];
  if (top >= 568.261 * 0.95) return [vals.map((v) => quarters(v / 568.261)), top >= 568.261 * 1.9 ? 'pints' : 'pint'];
  return [vals.map((v) => quarters(v / 28.4131)), 'fl oz'];
}
// "0.91" "kg" -> "2 lb" (imperial) - any words after the unit ("(mixed with plums)") are kept
export function qty(amount, unit, sys = system) {
  const raw = [amount, unit].filter((x) => x !== undefined && x !== null && String(x) !== '').join(' ');
  const m = String(unit ?? '').match(UNIT);
  const vals = parse(amount);
  if (!m || !vals) return raw;
  const [kind] = toBase(m[1], 1);
  if (!kind) return raw;
  // metric amounts are shown just as the recipe has them; only imperial ones are converted for metric
  if (sys === 'metric' && /^(kg|kilogram|g|gram|l|litre|liter|ml|millilitre)/i.test(m[1])) return raw;
  const [nums, u] = show(kind, vals.map((v) => toBase(m[1], v)[1]), sys);
  return `${nums.join('–')} ${u}${m[2] || ''}`;
}
// a batch size in litres -> "4.5 L" or "1 gal"
export const batch = (litres, sys = system) => (litres ? qty(String(litres), 'L', sys).replace(/^(\S+) ml$/, (s, n) => `${metricNum(Number(n) / 1000)} L`) : '');

// ---- the controls ----
const NAMES = [['metric', 'Metric'], ['imperial', 'Imperial']];
export function SystemChip() {
  const sys = useSystem();
  const menu = useMenu();
  return (
    <>
      <MenuChip on={menu.open} label="Measurements" onClick={menu.show}>{sys === 'imperial' ? 'Imperial' : 'Metric'}</MenuChip>
      <Menu anchor={menu.anchor} open={menu.open} onClose={menu.close}
        items={NAMES.map(([k, l]) => ({ label: l, icon: k === sys ? 'check' : 'blank', selected: k === sys, onClick: () => setSystem(k) }))} />
    </>
  );
}
export function SystemToggle() {
  const sys = useSystem();
  return <Segmented label="Measurements" value={sys} onChange={setSystem} options={NAMES} />;
}
