import db, { getSetting, setSetting } from '../db/database.js';
import { getRoute } from './routeService.js';
import { getLoopSettings } from './runGlucoseService.js';
import { getWeather } from './weatherService.js';
import { getTrainingLoad } from './trainingLoadService.js';
import { learnedAdjustments, postRunPattern, refuelStatus } from './runLearningService.js';

// Run planner: given a distance or a saved route (with its elevation), a pace, and where glucose
// and insulin on board are right now, estimate how glucose is likely to move during the run and
// where carbs would be needed to stay above the floor. It is an ESTIMATE from a simple model, a
// planning aid, not a dosing tool: it suggests carbohydrate (grams and timing) and only points at
// published guidance for insulin adjustments, provided as parameters for the user to consider.
//
// The model, per minute:  glucose  =  glucose
//     - insulin action (from IOB, the AAPS insulin sensitivity factor, boosted while exercising)
//     - exercise uptake (independent of insulin, scaled by intensity and the route's effort)
//     + carbs absorbed (grams x ISF / carb ratio, absorbed over ~20 minutes)
//
// Research behind the assumptions (see SOURCES):
//  - Muscle glucose uptake rises about 1.5-10x with intensity and most of it does not need insulin;
//    insulin-mediated uptake also rises during exercise and stays raised for hours afterwards.
//    There is no single published "insulin is Nx stronger" figure, so the boost is an adjustable
//    assumption (default 1.5x) and the insulin-independent uptake is fitted from the user's own runs.
//  - ISPAD 2022: exercise start 5.0-15.0 mmol/L; 4.0-4.9 delay 20 min with 0.3 g/kg; during exercise
//    0.5-1.0 g/kg/h with high insulin on board or 0.3-0.5 g/kg/h if >2 h since the last bolus;
//    gut absorption limit about 1 g/min; ~50% bolus reduction as a starting plan for a run within
//    2 h of a meal; low-glucose risk during, after, and up to 24 h later (7-11 h overnight).
//  - Riddell et al. 2017 consensus: 30-60 g/h with low insulin, up to 75 g/h with high insulin;
//    ~20% pre-exercise bolus reduction.
export const SOURCES = [
  { title: 'ISPAD Clinical Practice Consensus Guidelines 2022: Exercise in children and adolescents with diabetes', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10107219/' },
  { title: 'Riddell et al. 2017. Exercise management in type 1 diabetes: a consensus statement (Lancet Diabetes Endocrinol)', url: 'https://www.thelancet.com/article/S2213-8587(17)30014-1/abstract' },
  { title: 'Riddell lab summary: nutrition and insulin management guidelines for exercise in type 1 diabetes', url: 'https://mriddell.lab.yorku.ca/2017/02/nutrition-and-insulin-management-guidelines-for-exercise-in-type-1-diabetes/' },
  { title: 'Separating insulin-mediated and non-insulin-mediated glucose uptake during and after aerobic exercise in type 1 diabetes (AJP Endocrinol Metab)', url: 'https://journals.physiology.org/doi/full/10.1152/ajpendo.00534.2020' },
  { title: 'Exercise, type 1 diabetes mellitus and blood glucose: the implications of exercise timing (PMC)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9555792/' },
];

const DEFAULT_TARGETS = { startTarget: 9.0, floor: 5.0, weightKg: null, sensMult: 1.5 };
export function getTargets() { try { return { ...DEFAULT_TARGETS, ...JSON.parse(getSetting('run_targets') || '{}') }; } catch (_) { return { ...DEFAULT_TARGETS }; } }
export function saveTargets(t) {
  const n = { ...getTargets() };
  const num = (v, lo, hi, name) => { const x = Number(v); if (!Number.isFinite(x) || x < lo || x > hi) throw new Error(`${name} must be between ${lo} and ${hi}.`); return x; };
  if (t.startTarget !== undefined) n.startTarget = num(t.startTarget, 5, 15, 'The start target');
  if (t.floor !== undefined) n.floor = num(t.floor, 3.5, 8, 'The floor');
  if (t.weightKg !== undefined) n.weightKg = t.weightKg === null || t.weightKg === '' ? null : num(t.weightKg, 30, 200, 'Weight');
  if (t.sensMult !== undefined) n.sensMult = num(t.sensMult, 1, 10, 'The exercise insulin-sensitivity multiplier');
  if (n.floor >= n.startTarget) throw new Error('The floor must be below the start target.');
  setSetting('run_targets', JSON.stringify(n));
  return n;
}

// ---- terrain and pace ----------------------------------------------------------------------
// Minetti et al. (2002) energy cost of running on a gradient, J per kg per metre (g = gradient as a fraction).
const cost = (g) => { const x = Math.max(-0.45, Math.min(0.45, g)); return 155.4 * x ** 5 - 30.4 * x ** 4 - 43.3 * x ** 3 + 46.3 * x ** 2 + 19.5 * x + 3.6; };
const FLAT = cost(0);

function buildTerrain({ route, distanceKm }) {
  if (!route) return { segments: [{ from: 0, to: distanceKm, grade: 0 }], gainM: 0, lossM: 0, profile: [[0, 0, 0], [distanceKm, 0, 0]], splits: [] };
  const p = route.profile;
  const segments = [];
  for (let i = 0; i < p.length - 1; i++) segments.push({ from: p[i][0], to: p[i + 1][0], grade: p[i][2], ele: p[i][1] });
  const last = p[p.length - 1];
  if (last[0] < route.distanceKm - 0.01) segments.push({ from: last[0], to: route.distanceKm, grade: 0 });
  return { segments, gainM: route.gainM, lossM: route.lossM, profile: p, splits: route.splits };
}

// Walks the route, returning the minute at which each stretch is reached, the effort factor
// (energy per km relative to flat) and gross energy.
function runTimeline(terrain, flatPaceMinKm, weightKg) {
  let t = 0, energyRel = 0, dist = 0, energyJ = 0;
  const marks = []; // [minute, km, grade%]
  for (const s of terrain.segments) {
    const km = s.to - s.from;
    if (km <= 0) continue;
    const ratio = Math.max(0.6, cost(s.grade / 100) / FLAT);
    const speedMult = Math.max(0.5, Math.min(1.35, 1 / ratio)); // roughly constant effort: climbs slow you, descents help a little
    const minutes = (km * flatPaceMinKm) / speedMult;
    marks.push([t, s.from, s.grade]);
    t += minutes; dist += km; energyRel += ratio * km;
    energyJ += cost(s.grade / 100) * km * 1000 * (weightKg || 0);
  }
  marks.push([t, dist, 0]);
  return { minutes: t, distanceKm: dist, effort: energyRel / Math.max(dist, 0.01), kcal: weightKg ? Math.round(energyJ / 4184) : null, marks };
}
const kmAt = (marks, minute) => {
  for (let i = 0; i < marks.length - 1; i++) if (minute >= marks[i][0] && minute <= marks[i + 1][0]) {
    const f = (minute - marks[i][0]) / Math.max(1e-6, marks[i + 1][0] - marks[i][0]);
    return marks[i][1] + f * (marks[i + 1][1] - marks[i][1]);
  }
  return marks[marks.length - 1][1];
};
const gradeAt = (marks, minute) => { for (let i = 0; i < marks.length - 1; i++) if (minute >= marks[i][0] && minute <= marks[i + 1][0]) return marks[i][2]; return 0; };

// ---- hydration & thermal scaling -----------------------------------------------------------
/**
 * Calculate dynamic hydration & electrolyte requirements based on weather, duration, and terrain
 * @param {Object} params
 * @param {number} params.durationMin Total duration in minutes
 * @param {number} params.distanceKm Total route distance in kilometres
 * @param {Object} [params.weather] Live weather object from Open-Meteo
 * @param {number} [params.weightKg] Runner's body weight in kg
 * @param {number} [params.effortFactor] Terrain & pace combined effort factor
 */
export function calculateHydration({ durationMin, distanceKm, weather = null, weightKg = null, effortFactor = 1.0 }) {
  const hours = Math.max(0.1, durationMin / 60);
  const tempC = weather?.current?.temperature_c ?? 15;
  const humidity = weather?.current?.humidity_percent ?? 55;
  const windKmh = weather?.current?.wind_speed_kmh ?? 10;
  
  // Baseline sweat rate at 15°C moderate effort: ~500 ml/h for standard adult (70kg)
  const baseWeight = weightKg || 70;
  let baseRateMlPerHour = 500 * (baseWeight / 70);
  
  // Thermal scaling: +30 ml/h per 1°C above 15°C; -20 ml/h per 1°C below 10°C
  if (tempC > 15) {
    baseRateMlPerHour += (tempC - 15) * 32;
  } else if (tempC < 10) {
    baseRateMlPerHour = Math.max(350, baseRateMlPerHour - (10 - tempC) * 18);
  }
  
  // Humidity scaling: High humidity (>70%) impairs evaporative cooling, increasing sweat rate
  if (humidity > 70) {
    baseRateMlPerHour *= 1 + Math.min(0.25, (humidity - 70) * 0.007);
  }
  
  // Effort multiplier (hills + fast pace)
  baseRateMlPerHour *= Math.max(0.85, Math.min(1.4, effortFactor));
  
  const fluidPerHourMl = Math.round(baseRateMlPerHour / 10) * 10;
  const totalFluidMl = Math.round((fluidPerHourMl * hours) / 10) * 10;
  const fluidPerKmMl = distanceKm > 0 ? Math.round(totalFluidMl / distanceKm) : Math.round(fluidPerHourMl / 10);
  
  // Electrolyte guidelines (Sodium): ~450-800 mg sodium per litre sweat
  const sodiumPerLitreMg = tempC > 20 || humidity > 75 ? 700 : 500;
  const totalSodiumMg = Math.round((totalFluidMl / 1000) * sodiumPerLitreMg);
  const electrolyteTablets = totalFluidMl >= 600 || hours >= 1.25 ? Math.max(1, Math.round(totalSodiumMg / 350)) : 0;
  
  // Contextual guidance note
  let guidance = 'Standard hydration: sip 120-180ml every 20-25 minutes.';
  if (tempC >= 22) {
    guidance = `Warm conditions (${tempC}°C): sweat rate is elevated. Carry electrolyte fluids and aim for ${fluidPerKmMl}ml per km.`;
  } else if (tempC <= 5) {
    guidance = `Cold conditions (${tempC}°C): thirst sensation is blunted; maintain regular scheduled sips (~${fluidPerKmMl}ml/km) to avoid dehydration.`;
  } else if (humidity >= 75) {
    guidance = `High humidity (${humidity}%): sweat evaporation is hindered; replace electrolytes (~${electrolyteTablets} salt tab${electrolyteTablets === 1 ? '' : 's'}) to prevent hyponatremia.`;
  }

  return {
    tempC,
    humidity,
    windKmh,
    fluidPerHourMl,
    fluidPerKmMl,
    totalFluidMl,
    totalFluidLitres: Math.round((totalFluidMl / 1000) * 100) / 100,
    sodiumMg: totalSodiumMg,
    electrolyteTablets,
    guidance
  };
}

// ---- glucose model ---------------------------------------------------------------------------
const INTENSITY = { easy: 0.7, steady: 1.0, hard: 1.25 };
const DIA_H = 3, INS_P = 1.5;

function simulate({ startBg, iob, cob, isf, cr, kEx, sensMult, intensity, effort, durationMin, intakes, totalMin, exShape = null, insulinBoost = 1 }) {
  const effect = isf / cr; // mmol/L per gram of carbohydrate
  const exRate = kEx * (INTENSITY[intensity] ?? 1) * (1 + 0.5 * Math.max(0, effort - 1)); // mmol/L per hour
  const out = new Array(totalMin + 1);
  let bg = startBg;
  for (let t = 0; t <= totalMin; t++) {
    out[t] = bg;
    const tau = t / 60;
    const activity = tau < DIA_H ? (Math.max(0, iob) * INS_P / DIA_H) * (1 - tau / DIA_H) ** (INS_P - 1) : 0; // units per hour
    const mult = t <= durationMin ? sensMult : 1.15 + (sensMult - 1.15) * Math.max(0, 1 - (t - durationMin) / 180);
    let rise = 0;
    for (const it of intakes) { const dt = t - it.t - 5; if (dt >= 0 && dt < 20) rise += (it.g * effect) / 20; }
    if (cob > 0) { const dt = t; if (dt < 60) rise += (cob * effect) / 60; }
    // exShape: how hard this minute is against the run's average (climbs > 1, descents < 1); insulinBoost:
    // sensitivity still raised from a recent session
    const fall = ((isf * activity * mult * insulinBoost) + (t <= durationMin ? exRate * (exShape ? exShape[Math.min(t, exShape.length - 1)] : 1) : 0)) / 60;
    bg = Math.max(1.5, bg + rise - fall);
  }
  return out;
}

// The same model, for the run retrospective: replays a finished run with what actually happened (start
// glucose, insulin on board, the carbs as taken) so the planner's error can be measured and learned from.
export const replaySimulate = (params, intakes) => simulate({ ...params, intakes });

// The kind of run, for learning that carries across routes: distance band, effort and how hilly.
export function runProfile({ distanceKm, intensity = 'steady', climbPerKm = 0 }) {
  const dist = distanceKm < 8 ? 'short' : distanceKm < 16 ? 'medium' : distanceKm < 25 ? 'long' : 'very long';
  const eff = INTENSITY[intensity] ? intensity : 'steady';
  const hills = climbPerKm < 8 ? 'flat' : climbPerKm < 20 ? 'rolling' : 'hilly';
  return { key: `${dist}|${eff}|${hills}`, label: `${dist}, ${eff}, ${hills}`, distance: dist, intensity: eff, hills };
}

const min = (arr, a, b) => Math.min(...arr.slice(a, Math.min(b, arr.length - 1) + 1));
const round5 = (x) => Math.round(x / 5) * 5;

// ---- the estimator ------------------------------------------------------------------------------
export function personalFit(sport = 'Run') {
  const loop = getLoopSettings();
  const isf = loop.isf ?? 1.6, cr = loop.cr ?? 7.5, effect = isf / cr;
  const rows = db.prepare(`SELECT a.moving_time, g.data FROM activity_glucose g JOIN strava_activities a ON a.id = g.activity_id WHERE g.status = 'ok' AND a.sport = ? AND a.moving_time >= 1200`).all(sport);
  const ks = [];
  for (const r of rows) {
    const s = JSON.parse(r.data).stats;
    if (s.bgStart == null || s.bgEnd == null || s.iobStart == null) continue;
    const hours = r.moving_time / 3600;
    const total = s.bgStart - s.bgEnd + (s.carbsGramsDuring || 0) * effect; // glucose the run "used", without the carbs eaten
    const insulinPart = Math.max(0, s.iobStart) * isf * 1.5 * (1 - (1 - Math.min(1, hours / DIA_H)) ** INS_P); // what the IOB alone would have taken off
    ks.push(Math.max(0, (total - insulinPart) / hours));
  }
  ks.sort((a, b) => a - b);
  return { runs: ks.length, kEx: ks.length >= 4 ? Math.round(ks[Math.floor(ks.length / 2)] * 100) / 100 : null };
}

function typicalPace(sport = 'Run') {
  const rows = db.prepare(`SELECT avg_speed FROM strava_activities WHERE sport = ? AND avg_speed > 0 AND distance >= 3000 AND (session_tag IS NULL OR session_tag NOT IN ('speed', 'hill')) ORDER BY start_local DESC LIMIT 20`).all(sport);
  if (!rows.length) return null;
  const sp = rows.map((r) => r.avg_speed).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
  return Math.round((1000 / sp / 60) * 100) / 100;
}

// ---- how demanding a run is for THIS runner ---------------------------------------------------------
// Compared with the last 12 weeks of running: longest run, how long that took, typical pace and
// how hilly their usual runs are.
function recentHistory(sport = 'Run') {
  const cutoff = new Date(Date.now() - 84 * 86400000).toISOString().slice(0, 10);
  const rows = db.prepare(`SELECT day, distance, moving_time, elevation, session_tag FROM strava_activities WHERE sport IN ('Run','TrailRun','VirtualRun') AND day >= ? AND distance >= 1500`).all(cutoff);
  const med = (xs) => { const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
  const longest = rows.reduce((m, r) => (r.distance > (m?.distance ?? 0) ? r : m), null);
  const cut28 = new Date(Date.now() - 27 * 86400000).toISOString().slice(0, 10);
  const paceEligible = rows.filter((r) => r.distance >= 3000 && (!r.session_tag || (r.session_tag !== 'speed' && r.session_tag !== 'hill')));
  return {
    runs: rows.length, longestKm: longest ? longest.distance / 1000 : null, longestMin: longest ? longest.moving_time / 60 : null,
    typicalPace: med(paceEligible.map((r) => r.moving_time / 60 / (r.distance / 1000))),
    climbPerKm: med(rows.filter((r) => r.distance >= 3000 && r.elevation != null).map((r) => r.elevation / (r.distance / 1000))),
    weeklyKm: rows.filter((r) => r.day >= cut28).reduce((a, r) => a + r.distance, 0) / 1000 / 4,
  };
}

const recommendFor = (d) => ({
  longRunKm: Math.round((d <= 10 ? 0.75 * d : d <= 25 ? Math.min(0.7 * d, 18) : Math.min(0.6 * d, 32)) * 10) / 10,
  weeklyKm: Math.round((d <= 10 ? Math.max(20, 2.5 * d) : d <= 25 ? 3 * d : Math.min(2 * d, 70)) * 10) / 10,
});

function kmSplitsFrom(tl, route, distanceKm, hydration = null) {
  // minute at which a given distance is reached, from the timeline marks [minute, km, grade%]
  const minuteAt = (km) => {
    const m = tl.marks;
    for (let i = 0; i < m.length - 1; i++) if (km >= m[i][1] && km <= m[i + 1][1]) {
      const f = (km - m[i][1]) / Math.max(1e-6, m[i + 1][1] - m[i][1]);
      return m[i][0] + f * (m[i + 1][0] - m[i][0]);
    }
    return m[m.length - 1][0];
  };
  const out = [];
  const fluidPerKm = hydration?.fluidPerKmMl || 50;
  for (let k = 0; k < Math.ceil(distanceKm - 0.05); k++) {
    const from = k, to = Math.min(distanceKm, k + 1);
    const minutes = minuteAt(to) - minuteAt(from);
    const sp = route?.splits?.[k];
    out.push({
      km: k + 1,
      lengthKm: Math.round((to - from) * 100) / 100,
      minutes: Math.round(minutes * 100) / 100,
      paceMinPerKm: Math.round((minutes / (to - from)) * 100) / 100,
      gainM: sp?.gain ?? 0,
      lossM: sp?.loss ?? 0,
      maxGrade: sp?.maxGrade ?? 0,
      atMinute: Math.round(minuteAt(to)),
      targetFluidMl: Math.round(fluidPerKm * (to - from))
    });
  }
  return out;
}

function demandFrom({ distanceKm, dur, tl, terrain, route, intensity, pace, weather = null }) {
  const hist = recentHistory();
  const climbPerKm = terrain.gainM / distanceKm;
  const ratio = { distance: hist.longestKm ? distanceKm / hist.longestKm : null, duration: hist.longestMin ? dur / hist.longestMin : null, climb: hist.climbPerKm && terrain.gainM ? climbPerKm / hist.climbPerKm : null };
  const base = Math.max(ratio.distance ?? 1, ratio.duration ?? 1);
  const score = base + (ratio.climb != null ? Math.max(-0.1, Math.min(0.35, (ratio.climb - 1) * 0.25)) : 0) + ({ easy: -0.1, steady: 0, hard: 0.15 }[intensity] ?? 0) + (tl.effort - 1) * 0.5;
  const level = !hist.runs ? 'Unknown' : score < 0.85 ? 'Comfortable' : score < 1.05 ? 'Manageable' : score < 1.25 ? 'Challenging' : 'A big step up';
  const rec = recommendFor(distanceKm);
  const steepest = (route?.splits || []).reduce((b, s) => (s.maxGrade > (b?.maxGrade ?? -99) ? s : b), null);
  const why = [];
  if (hist.runs) {
    if (ratio.distance != null) why.push(`${Math.round(distanceKm * 10) / 10} km is ${Math.round(ratio.distance * 100)}% of your longest recent run (${Math.round(hist.longestKm * 10) / 10} km).`);
    if (ratio.duration != null) why.push(`About ${Math.round(dur)} min on your feet, against ${Math.round(hist.longestMin)} min for your longest recent run.`);
    if (ratio.climb != null) why.push(`${Math.round(climbPerKm)} m of climbing per km, against ${Math.round(hist.climbPerKm)} m per km on your usual runs (${ratio.climb > 1.25 ? 'hillier than you are used to' : ratio.climb < 0.8 ? 'flatter than you are used to' : 'similar terrain'}).`);
    if (tl.effort > 1.03) why.push(`The hills make it about ${Math.round((tl.effort - 1) * 100)}% more effort than the same distance on the flat, roughly like ${Math.round(distanceKm * tl.effort * 10) / 10} flat km.`);
    if (steepest && steepest.maxGrade >= 6) why.push(`The steepest stretch is on km ${steepest.km}, up to ${steepest.maxGrade}%.`);
    if (intensity === 'hard') why.push('Run at a hard effort, this asks more than the distance alone suggests.');
    if (weather?.current) {
      if (weather.current.temperature_c >= 22) why.push(`Warm weather (${weather.current.temperature_c}°C) increases cardiovascular strain and substrate oxidation.`);
      if (weather.current.wind_speed_kmh >= 25) why.push(`Wind (${weather.current.wind_speed_kmh} km/h ${weather.current.wind_direction}) adds aerodynamic drag resistance.`);
    }
  } else why.push('No recent runs are logged, so this cannot be compared with your fitness yet.');
  return {
    level, score: Math.round(score * 100) / 100, why,
    route: { distanceKm: Math.round(distanceKm * 100) / 100, gainM: terrain.gainM, lossM: terrain.lossM, climbPerKm: Math.round(climbPerKm * 10) / 10, effortFactor: Math.round(tl.effort * 100) / 100, flatEquivalentKm: Math.round(distanceKm * tl.effort * 10) / 10, durationMin: dur, steepestKm: steepest ? { km: steepest.km, maxGrade: steepest.maxGrade } : null },
    fitness: { history: { ...hist, typicalPace: hist.typicalPace ? Math.round(hist.typicalPace * 100) / 100 : null, climbPerKm: hist.climbPerKm ? Math.round(hist.climbPerKm * 10) / 10 : null, weeklyKm: Math.round(hist.weeklyKm * 10) / 10 }, recommended: rec,
      ratios: { distance: ratio.distance != null ? Math.round(ratio.distance * 100) / 100 : null, duration: ratio.duration != null ? Math.round(ratio.duration * 100) / 100 : null, climb: ratio.climb != null ? Math.round(ratio.climb * 100) / 100 : null } },
    splits: kmSplitsFrom(tl, route, distanceKm), pace,
  };
}

// The runner's own runs of a saved route, found by matching Strava runs to it: same starting
// point (within 400 m) and about the same length (within 8%), or runs linked to it by hand.
export const havM = (a, b) => {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
// Google's encoded polyline (Strava's map.summary_polyline) -> [[lat, lng], ...]
function decodePolyline(str) {
  const out = []; let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i <= str.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta; else lng += delta;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}
// Share of `a`'s points lying within `tol` metres of the line `b` (point to segment, on a flat local grid).
export function shareNear(a, b, tol) {
  if (a.length === 0 || b.length < 2) return 0;
  const lat0 = a[0][0], kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
  const P = (q) => [(q[1] - a[0][1]) * kx, (q[0] - lat0) * ky];
  const B = b.map(P);
  let near = 0;
  for (const q of a) {
    const [px, py] = P(q);
    let best = Infinity;
    for (let i = 0; i < B.length - 1; i++) {
      const [x1, y1] = B[i], [x2, y2] = B[i + 1];
      const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0;
      const d = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
      if (d < best) best = d;
      if (best <= tol) break;
    }
    if (best <= tol) near++;
  }
  return near / a.length;
}

export function routeRunHistory(routeId) {
  const route = getRoute(Number(routeId));
  if (!route) throw new Error('Route not found.');
  const start = route.path?.[0] || null;
  const linked = new Set(db.prepare('SELECT activity_id FROM activity_route WHERE route_id = ?').all(route.id).map((r) => r.activity_id));
  const rows = db.prepare(`SELECT id, day, start_local, distance, moving_time, elevation, avg_hr, raw FROM strava_activities WHERE sport IN ('Run','TrailRun','VirtualRun') AND distance >= 1500 AND moving_time > 0 ORDER BY start_local DESC`).all();
  const runs = [];
  for (const r of rows) {
    const km = r.distance / 1000;
    let ok = linked.has(r.id);
    if (!ok && start && Math.abs(km - route.distanceKm) / route.distanceKm <= 0.10) {
      try {
        const raw = JSON.parse(r.raw);
        const ll = raw.start_latlng;
        if (Array.isArray(ll) && ll.length === 2 && havM(start, ll) <= 400) {
          const poly = raw.map?.summary_polyline ? decodePolyline(raw.map.summary_polyline) : null;
          // Same shape: nearly all of the route lies on the run and nearly all of the run lies on the route.
          ok = poly && poly.length > 4 ? shareNear(route.path, poly, 60) >= 0.85 && shareNear(poly, route.path, 60) >= 0.85 : Math.abs(km - route.distanceKm) / route.distanceKm <= 0.04;
        }
      } catch (_) { ok = false; }
    }
    if (ok) runs.push({ id: r.id, day: r.day, km: Math.round(km * 100) / 100, minutes: Math.round((r.moving_time / 60) * 100) / 100, paceMinPerKm: Math.round((r.moving_time / 60 / km) * 1000) / 1000, avgHr: r.avg_hr ? Math.round(r.avg_hr) : null, climbM: r.elevation != null ? Math.round(r.elevation) : null });
  }
  if (!runs.length) {
    const hist = recentHistory();
    const generalPace = hist.typicalPace || typicalPace() || 6.0;
    const gradePerKm = route.gainM && route.distanceKm ? route.gainM / route.distanceKm : 0;
    const gradeMult = 1 + Math.max(0, gradePerKm * 0.0035);
    const expectedCurrentPaceMinPerKm = Math.round(generalPace * gradeMult * 1000) / 1000;
    const expectedCurrentTimeMin = Math.round(expectedCurrentPaceMinPerKm * route.distanceKm * 10) / 10;
    return {
      routeId: route.id, count: 0, runs: [],
      expectedCurrentPaceMinPerKm, expectedCurrentTimeMin,
      generalRecentPaceMinPerKm: generalPace, recentRunsCount: 0
    };
  }
  const byPace = runs.slice().sort((a, b) => a.paceMinPerKm - b.paceMinPerKm);
  const hist = recentHistory();
  const generalPace = hist.typicalPace || typicalPace() || 6.0;
  const gradePerKm = route.gainM && route.distanceKm ? route.gainM / route.distanceKm : 0;
  const gradeMult = 1 + Math.max(0, gradePerKm * 0.0035);
  const generalPaceAdjustedForRoute = generalPace * gradeMult;

  // Weight recent runs on this route (past 90 days) higher than older runs from months/years ago
  const nowMs = Date.now();
  const recentRuns = runs.filter((r) => r.day && (nowMs - new Date(`${r.day}T12:00:00Z`).getTime()) <= 90 * 86400000);
  let expectedCurrentPaceMinPerKm;
  if (recentRuns.length >= 2) {
    const medRecent = recentRuns.map((r) => r.paceMinPerKm).sort((a, b) => a - b)[Math.floor(recentRuns.length / 2)];
    expectedCurrentPaceMinPerKm = Math.round((0.7 * medRecent + 0.3 * generalPaceAdjustedForRoute) * 1000) / 1000;
  } else if (recentRuns.length === 1) {
    expectedCurrentPaceMinPerKm = Math.round((0.5 * recentRuns[0].paceMinPerKm + 0.5 * generalPaceAdjustedForRoute) * 1000) / 1000;
  } else {
    // Older runs on route may be when runner just started; use current overall fitness adjusted for route hills
    expectedCurrentPaceMinPerKm = Math.round(generalPaceAdjustedForRoute * 1000) / 1000;
  }
  const expectedCurrentTimeMin = Math.round(expectedCurrentPaceMinPerKm * route.distanceKm * 10) / 10;

  return {
    routeId: route.id, count: runs.length, runs: runs.slice(0, 20),
    last: runs[0], fastest: byPace[0], slowest: byPace[byPace.length - 1],
    averagePaceMinPerKm: Math.round((runs.reduce((a, r) => a + r.minutes, 0) / runs.reduce((a, r) => a + r.km, 0)) * 1000) / 1000,
    expectedCurrentPaceMinPerKm, expectedCurrentTimeMin,
    generalRecentPaceMinPerKm: generalPace, recentRunsCount: recentRuns.length,
  };
}

// Just the demands of a run (no glucose needed): what it asks of the runner, kilometre by kilometre.
export async function estimateDemand(input = {}) {
  const route = input.routeId ? getRoute(Number(input.routeId)) : null;
  if (input.routeId && !route) throw new Error('Route not found.');
  const distanceKm = route ? route.distanceKm : Number(input.distanceKm);
  if (!Number.isFinite(distanceKm) || distanceKm < 1 || distanceKm > 100) throw new Error('Enter a distance between 1 and 100 km, or pick a route.');
  const intensity = INTENSITY[input.intensity] ? input.intensity : 'steady';
  const terrain = buildTerrain({ route, distanceKm });
  const targetMinutes = Number(input.targetMinutes) > 0 ? Number(input.targetMinutes) : null;
  // The pace given is the AVERAGE over the whole run; the route's hills decide how it splits up.
  const avgPace = Number(input.paceMinPerKm) || recentHistory().typicalPace || typicalPace() || 6;
  const perFlatPace = runTimeline(terrain, 1, null).minutes;
  const pace = targetMinutes ? targetMinutes / perFlatPace : (avgPace * distanceKm) / perFlatPace;
  const tl = runTimeline(terrain, pace, null);
  const dur = Math.max(1, Math.round(tl.minutes));

  // Retrieve ambient route weather
  let weather = input.weather || null;
  if (!weather) {
    try {
      if (route?.path?.[0]) {
        weather = await getWeather({ location: `${route.path[0][0]},${route.path[0][1]}`, days: 1 });
      } else {
        weather = await getWeather({ days: 1 }) /* home */;
      }
    } catch (_) { /* fallback handled gracefully */ }
  }

  const hydration = calculateHydration({
    durationMin: dur,
    distanceKm,
    weather,
    weightKg: Number(input.weightKg) || null,
    effortFactor: tl.effort
  });

  return {
    ...demandFrom({ distanceKm, dur, tl, terrain, route, intensity, pace, weather }),
    hydration,
    weather,
    splits: kmSplitsFrom(tl, route, distanceKm, hydration),
    inputs: { paceMinPerKm: pace, averagePaceMinPerKm: tl.minutes / distanceKm, intensity, targetMinutes }
  };
}

export async function estimatePlan(input = {}) {
  // Allow callers to pass live target overrides directly in the request body so the simulation
  // can respond instantly to slider changes without requiring the user to persist them first.
  const savedTargets = getTargets();
  const targets = {
    ...savedTargets,
    ...(input.startTarget !== undefined && Number.isFinite(Number(input.startTarget)) ? { startTarget: Math.max(5, Math.min(15, Number(input.startTarget))) } : {}),
    ...(input.floor !== undefined && Number.isFinite(Number(input.floor)) ? { floor: Math.max(3.5, Math.min(8, Number(input.floor))) } : {}),
    ...(input.sensMult !== undefined && Number.isFinite(Number(input.sensMult)) ? { sensMult: Math.max(1, Math.min(10, Number(input.sensMult))) } : {}),
    ...(input.weightKg !== undefined && (input.weightKg === null || input.weightKg === '' || Number.isFinite(Number(input.weightKg))) ? { weightKg: input.weightKg === null || input.weightKg === '' ? null : Math.max(30, Math.min(200, Number(input.weightKg))) } : {}),
  };
  const loop = getLoopSettings();
  const assumed = [];
  const isf = loop.isf ?? (assumed.push('ISF 1.6 mmol/L per unit (no loop settings logged yet)'), 1.6);
  const cr = loop.cr ?? (assumed.push('carb ratio 7.5 g per unit (no loop settings logged yet)'), 7.5);
  const effect = isf / cr;

  const route = input.routeId ? getRoute(Number(input.routeId)) : null;
  if (input.routeId && !route) throw new Error('Route not found.');
  const distanceKm = route ? route.distanceKm : Number(input.distanceKm);
  if (!Number.isFinite(distanceKm) || distanceKm < 1 || distanceKm > 100) throw new Error('Enter a distance between 1 and 100 km, or pick a route.');

  const targetMinutes = Number(input.targetMinutes) > 0 ? Number(input.targetMinutes) : null;
  const avgPace = Number(input.paceMinPerKm) || typicalPace() || (assumed.push('6:00 /km pace (no runs logged yet)'), 6); // the AVERAGE pace over the whole run
  const intensity = INTENSITY[input.intensity] ? input.intensity : 'steady';
  const weightKg = Number(input.weightKg) || targets.weightKg || null;
  const startBg = Number(input.startBg);
  if (!Number.isFinite(startBg) || startBg < 2 || startBg > 30) throw new Error('Enter your current glucose (mmol/L).');
  const iob = Math.max(0, Number(input.iob) || 0);
  const cob = Math.max(0, Number(input.cob) || 0);
  const sensMult = Number(input.sensMult) || targets.sensMult;
  const personal = personalFit(input.sport || 'Run');
  const kEx = Number(input.kEx) || personal.kEx || 1.0;
  if (!personal.kEx) assumed.push('exercise glucose uptake of 1.0 mmol/L per hour (until 4 of your runs are matched with glucose data)');

  const terrain = buildTerrain({ route, distanceKm });
  // A goal with a target time: choose the flat pace that makes THIS route (climbs included) take that long.
  const perFlatPace = runTimeline(terrain, 1, weightKg).minutes;
  const pace = targetMinutes ? targetMinutes / perFlatPace : (avgPace * distanceKm) / perFlatPace; // flat-equivalent pace that gives that average over these hills
  const tl = runTimeline(terrain, pace, weightKg);
  const dur = Math.max(1, Math.round(tl.minutes));
  const totalMin = dur + 120;
  const floor = targets.floor, margin = 1.0;

  // Retrieve ambient route weather (from request or live Open-Meteo)
  let weather = input.weather || null;
  if (!weather) {
    try {
      if (route?.path?.[0]) {
        weather = await getWeather({ location: `${route.path[0][0]},${route.path[0][1]}`, days: 1 });
      } else {
        weather = await getWeather({ days: 1 }) /* home */;
      }
    } catch (_) { /* fallback handled gracefully */ }
  }

  // Factor pace / speed into effort: running faster than the runner's recent typical pace exponentially increases glycogen & glucose oxidation
  const hist = recentHistory(input.sport || 'Run');
  const baseTypicalPace = hist.typicalPace || typicalPace(input.sport || 'Run') || 6.0;
  const plannedPace = tl.minutes / distanceKm;
  const speedRatio = plannedPace > 0 ? baseTypicalPace / plannedPace : 1.0;
  const paceEffortFactor = Math.pow(Math.max(0.65, Math.min(2.5, speedRatio)), 1.35);
  
  // Ambient thermal and wind scaling factor on substrate oxidation:
  // In hot weather (>22°C), glycogenolysis is accelerated by ~10-18% due to elevated core temperature and adrenaline.
  // In strong headwinds (>20 km/h), aerobic drag increases effort.
  let weatherEffortMultiplier = 1.0;
  if (weather?.current) {
    const tempC = weather.current.temperature_c ?? 15;
    const windSpeed = weather.current.wind_speed_kmh ?? 0;
    if (tempC > 20) weatherEffortMultiplier += Math.min(0.20, (tempC - 20) * 0.015);
    if (windSpeed > 20) weatherEffortMultiplier += Math.min(0.12, (windSpeed - 20) * 0.004);
  }

  const combinedEffort = tl.effort * paceEffortFactor * weatherEffortMultiplier;

  // Minute by minute, how hard each stretch is against the run's average: runners slow on climbs but
  // still work harder, and ease off downhill. Averages to 1, so the run's total uptake is unchanged -
  // it moves the glucose drop onto the climbs.
  const rawShape = [];
  for (let t = 0; t <= dur; t++) { const g = gradeAt(tl.marks, t); rawShape.push(Math.max(0.7, Math.min(1.6, 1 + 0.03 * Math.max(0, g) - 0.012 * Math.max(0, -g)))); }
  const meanShape = rawShape.reduce((a, v) => a + v, 0) / rawShape.length || 1;
  const exShape = rawShape.map((v) => v / meanShape);

  // Recovery from recent training (Strava): insulin sensitivity still raised after a session in the last
  // 48 hours (more after a harder one, fading to nothing), and low form (accumulated fatigue, lower muscle
  // glycogen) meaning more reliance on blood glucose. Both are estimates; off with useRecovery: false.
  let recovery = null, insulinBoost = 1, uptakeBoost = 0;
  if (input.useRecovery !== false) {
    try {
      const tlg = getTrainingLoad();
      if (tlg.available) {
        const last = tlg.recovery.lastSession;
        const hoursSince = last ? (Date.now() - Date.parse(last.endedAt)) / 3600000 : null;
        const k = !last ? 0 : last.load < 50 ? 0.08 : last.load < 120 ? 0.15 : 0.25;
        const sensBoost = hoursSince != null && hoursSince < 48 ? k * (1 - hoursSince / 48) : 0;
        uptakeBoost = tlg.tsb < -10 ? Math.min(0.15, (-tlg.tsb - 10) * 0.01) : 0;
        insulinBoost = 1 + sensBoost;
        recovery = {
          status: tlg.status, form: tlg.tsb, percentRecovered: tlg.recovery.percent, hoursLeft: tlg.recovery.hoursLeft,
          lastSession: last ? { name: last.name, load: last.load, hoursSince: Math.round(hoursSince) } : null,
          insulinSensitivityPct: Math.round(sensBoost * 100), glucoseUptakePct: Math.round(uptakeBoost * 100),
          text: [
            sensBoost > 0.01 ? `Your last session (${last.name}, ${Math.round(hoursSince)} hours ago) still has insulin working about ${Math.round(sensBoost * 100)}% harder.` : null,
            uptakeBoost > 0.01 ? `Form is ${tlg.tsb} (tired), so muscles lean more on blood glucose - about ${Math.round(uptakeBoost * 100)}% more uptake.` : null,
          ].filter(Boolean).join(' ') || 'Recovered - no carry-over from recent training.',
        };
      }
    } catch (_) { /* no Strava */ }
  }
  // What your own runs have taught (accepted in the Learning tab): this route first, else this kind of run.
  // the kind of run, for learning across routes: distance, how hard (from the pace against your usual pace -
  // effort isn't something you set) and how hilly
  const paceBand = paceEffortFactor >= 1.1 ? 'hard' : paceEffortFactor <= 0.92 ? 'easy' : 'steady';
  const profile = runProfile({ distanceKm, intensity: paceBand, climbPerKm: terrain.gainM && distanceKm ? terrain.gainM / distanceKm : 0 });
  let learning = { uptakeMult: 1, postCarbsExtra: 0, applied: [] };
  if (input.useLearning !== false) { try { learning = learnedAdjustments({ routeId: route?.id ?? null, profileKey: profile.key, baseKEx: kEx }); } catch (_) { /* no learning yet */ } }
  const kExRun = kEx * (1 + uptakeBoost) * learning.uptakeMult;

  // Calculate dynamic hydration strategy
  const hydration = calculateHydration({
    durationMin: dur,
    distanceKm,
    weather,
    weightKg,
    effortFactor: combinedEffort
  });

  const params = { startBg, iob, cob, isf, cr, kEx: kExRun, sensMult, intensity, effort: combinedEffort, durationMin: dur, totalMin, exShape, insulinBoost };
  const runPlan = (start, iobStart) => {
    const p = { ...params, startBg: start, iob: iobStart };
    const intakes = [];
    // 1. carbs at the start if the first half hour would otherwise dip toward the floor
    let base = simulate({ ...p, intakes });
    const early = min(base, 0, 30);
    if (early < floor + margin) intakes.push({ t: 0, g: Math.min(40, Math.max(10, round5((floor + margin - early) / effect))), kind: 'start' });
    // 2. during the run: look 30 minutes ahead at each planned stop
    for (let t = 15; t < dur - 8; t += 20) {
      base = simulate({ ...p, intakes });
      const ahead = min(base, t, Math.min(t + 30, dur + 10));
      const nowBg = base[t];
      if (ahead < floor + margin && nowBg < 11) {
        const recent = intakes.filter((i) => i.t > t - 60).reduce((a, i) => a + i.g, 0);
        const g = Math.min(30, Math.max(10, round5((floor + margin - ahead) / effect)), Math.max(0, 75 - recent));
        if (g >= 10) intakes.push({ t, g, kind: 'run' });
      }
    }
    // Always at least one stop during the run (Simon's rule), even when the model says the start carbs are
    // enough: 10 g, about 15 minutes ahead of the lowest point of the run (or halfway on a short run).
    if (!intakes.some((i) => i.t > 0) && dur >= 15) {
      base = simulate({ ...p, intakes });
      let lowAt = 0;
      for (let t = 1; t <= dur; t++) if (base[t] < base[lowAt]) lowAt = t;
      const t = Math.round(dur < 30 ? dur / 2 : Math.max(10, Math.min(dur - 8, lowAt - 15)));
      intakes.push({ t, g: 10, kind: 'run' });
    }
    return { intakes, bg: simulate({ ...p, intakes }) };
  };

  // customIntakes: per-stop explicit intake array from the frontend's per-stop steppers.
  // Bypasses proportional redistribution so each milestone is independent.
  // Shape: [{ t: minuteIntoRun, g: grams, kind: 'start'|'run' }, ...]
  const rawCustomIntakes = Array.isArray(input.customIntakes) ? input.customIntakes : null;
  const customCarbs = !rawCustomIntakes && input.customCarbs !== undefined && input.customCarbs !== null && input.customCarbs !== '' ? Math.max(0, Math.round(Number(input.customCarbs))) : null;
  let main = runPlan(startBg, iob);
  if (rawCustomIntakes !== null) {
    // Use exact per-stop values; filter out zero-gram stops (user zeroed them)
    const exactIntakes = rawCustomIntakes
      .map((it) => ({ ...it, g: Math.max(0, Math.round(Number(it.g) || 0)) }))
      .filter((it) => it.g > 0);
    main = { intakes: exactIntakes, bg: simulate({ ...params, intakes: exactIntakes }) };
  } else if (customCarbs !== null) {
    if (customCarbs === 0) {
      main = { intakes: [], bg: simulate({ ...params, intakes: [] }) };
    } else {
      let customIntakes = [];
      if (main.intakes.length > 0) {
        const sum = main.intakes.reduce((a, i) => a + i.g, 0);
        let rem = customCarbs;
        customIntakes = main.intakes.map((it, idx) => {
          if (idx === main.intakes.length - 1) {
            return { ...it, g: Math.max(5, rem) };
          }
          const alloc = Math.max(5, round5((it.g / Math.max(1, sum)) * customCarbs));
          rem -= alloc;
          return { ...it, g: alloc };
        });
      } else {
        if (dur >= 45) {
          customIntakes = [{ t: Math.round(dur * 0.35), g: customCarbs, kind: 'run' }];
        } else {
          customIntakes = [{ t: 0, g: customCarbs, kind: 'start' }];
        }
      }
      main = { intakes: customIntakes, bg: simulate({ ...params, intakes: customIntakes }) };
    }
  }

  const noCarb = simulate({ ...params, intakes: [] });
  const totalCarbs = main.intakes.reduce((a, i) => a + i.g, 0);
  const endBg = main.bg[dur];
  const minDuring = min(main.bg, 0, dur);
  const minAfter = min(main.bg, dur, totalMin);
  const basePostCarbs = minAfter < floor + 0.5 ? Math.min(30, Math.max(10, round5((floor + 0.5 - minAfter) / effect))) : 0;
  // learned: you tend to drop more after runs than the model expects
  const postCarbs = learning.postCarbsExtra ? Math.min(45, basePostCarbs + learning.postCarbsExtra) : basePostCarbs;

  // Put each stop where it is easy to eat: not in the middle of a steep climb.
  const stops = main.intakes.map((it) => {
    let t = it.t, note = '';
    const kmTarget = kmAt(tl.marks, t);
    if (it.kind === 'start') return { minute: 0, km: 0, grams: it.g, fluidMl: 100, note: 'Just before you set off.' };
    // stops you placed yourself (dragged on the chart) stay exactly where you put them
    if (!rawCustomIntakes && gradeAt(tl.marks, t) >= 6) {
      for (let back = 1; back <= 6; back++) if (gradeAt(tl.marks, t - back) < 4) { t -= back; note = 'Moved earlier, ahead of a steep climb.'; break; }
    }
    if (route && !note && gradeAt(tl.marks, t) <= -3) note = 'On a descent - easy to take.';
    return {
      minute: Math.round(t),
      km: Math.round(kmTarget * 10) / 10,
      grams: it.g,
      fluidMl: 100,
      note: note || 'Take before fatigue sets in.'
    };
  }).sort((a, b) => a.minute - b.minute);

  // Sample the predicted curve every 2 minutes for the chart, with a matching elevation profile.
  const prediction = []; const withoutCarbs = [];
  for (let t = 0; t <= totalMin; t += 2) { prediction.push([t, Math.round(main.bg[t] * 10) / 10]); withoutCarbs.push([t, Math.round(noCarb[t] * 10) / 10]); }
  const elevation = [];
  for (let m = 0; m <= dur; m += Math.max(1, Math.round(dur / 120))) { const km = kmAt(tl.marks, m); elevation.push([m, Math.round(km * 100) / 100, Math.round(profileEle(terrain.profile, km) * 10) / 10]); }

  // ---- drinking ----
  // What you SWEAT (hydration.fluidPerHourMl, from heat, humidity, effort and weight) is not what you need
  // to DRINK. ACSM (Sawka 2007) aims to keep the deficit under ~2% of body weight, and for runs under about
  // 60-90 minutes in cool weather drinking to thirst is enough (Kenefick 2018). So: a mouthful (~100 ml)
  // to wash down each carb stop, plus only what keeps the loss under 1.5% (a margin below 2%) - added to
  // the carb stops first, so carbs and water go down together, and only then as drink-only stops in long
  // gaps. Fewer, bigger drinks = fewer toilet stops.
  const bodyKg = weightKg || 70;
  const sweatLossMl = Math.round((hydration.fluidPerHourMl * dur) / 60 / 10) * 10;
  const lossPct = Math.round((sweatLossMl / (bodyKg * 10)) * 10) / 10;
  const needMl = Math.max(0, Math.round((sweatLossMl - bodyKg * 1000 * 0.015) / 50) * 50);
  const drinks = stops.map((st) => ({ minute: st.minute, km: st.km, ml: 100, withCarbs: true }));
  if (needMl > 0) {
    // drink-only stops about every 20 minutes wherever there's no carb stop nearby...
    for (let t = 20; t < dur - 8; t += 20) {
      if (!drinks.some((d) => d.minute > 0 && Math.abs(d.minute - t) <= 12)) drinks.push({ minute: t, km: Math.round(kmAt(tl.marks, t) * 10) / 10, ml: 100, withCarbs: false });
    }
    // ...then the amount shared evenly across all the in-run drinks (100-250 ml each)
    const during = drinks.filter((d) => d.minute > 0);
    const each = Math.min(250, Math.max(100, Math.round(needMl / Math.max(1, during.length) / 50) * 50));
    for (const d of during) d.ml = each;
  }
  // water-only drinks you placed yourself (dragged on the chart) replace the planned ones
  if (Array.isArray(input.customDrinks)) {
    const own = input.customDrinks.map((d) => ({ minute: Math.max(1, Math.min(dur, Math.round(Number(d.minute) || 0))), ml: Math.max(50, Math.min(500, Math.round(Number(d.ml) || 100))) }))
      .map((d) => ({ ...d, km: Math.round(kmAt(tl.marks, d.minute) * 10) / 10, withCarbs: false, custom: true }));
    drinks.splice(0, drinks.length, ...drinks.filter((d) => d.withCarbs), ...own);
  }
  drinks.sort((a, b) => a.minute - b.minute);
  for (const st of stops) st.fluidMl = drinks.find((d) => d.minute === st.minute)?.ml ?? 100;
  const drinkTotalMl = drinks.reduce((a, d) => a + d.ml, 0);
  hydration.sweatRateMlPerHour = hydration.fluidPerHourMl;
  hydration.sweatLossMl = sweatLossMl;
  hydration.lossPct = lossPct;
  hydration.needMl = needMl;
  hydration.drinkTotalMl = drinkTotalMl;
  hydration.drinkToThirst = needMl === 0;
  hydration.weightAssumed = !weightKg;
  const longOrHot = dur >= 90 || hydration.tempC >= 22 || lossPct >= 2;
  if (!longOrHot) { hydration.electrolyteTablets = 0; hydration.sodiumMg = 0; }
  hydration.guidance = needMl === 0
    ? `${dur} minutes at ${hydration.tempC}°C: you'd sweat about ${sweatLossMl} ml (${lossPct}% of your body weight${!weightKg ? ', assuming 70 kg' : ''}) - under the 2% where it starts to matter, so there's no need to drink for hydration. Just a mouthful (about 100 ml) to wash down each carb stop, and drink to thirst. Big drinks during a run are what send you looking for a toilet.`
    : `${dur} minutes at ${hydration.tempC}°C: you'd sweat about ${sweatLossMl} ml (${lossPct}% of your body weight${!weightKg ? ', assuming 70 kg' : ''}), so drink about ${needMl} ml during the run to stay under 2% - taken at the carb stops${drinks.some((d) => !d.withCarbs) ? ', with water-only drinks between them about every 20 minutes' : ''}. Drink to thirst on top if you need to, but don't force it.`;
  if (hydration.tempC >= 22) hydration.guidance += ` It's warm, so carry water and take a mouthful whenever you're thirsty, and add electrolytes if you sweat heavily.`;
  hydration.basis = 'ACSM Exercise and Fluid Replacement (Sawka et al. 2007): keep the deficit under ~2% of body weight; drinking to thirst is enough for runs under about 60-90 minutes in cool conditions (Kenefick, Sports Med 2018).';

  // Per-minute series for the Run Plan chart (every 2 minutes): effort, what you drink (steps at each drink)
  // and what you sweat, and insulin on board.
  const effortSeries = [], hydrationSeries = [], sweatSeries = [], iobSeries = [];
  let sweat = 0;
  for (let t = 0; t <= totalMin; t += 2) {
    const sh = t <= dur ? exShape[Math.min(t, dur)] : 0;
    effortSeries.push([t, Math.round(sh * combinedEffort * 100) / 100]);
    if (t <= dur) sweat += (hydration.fluidPerHourMl * Math.max(0.6, sh) * 2) / 60;
    sweatSeries.push([t, Math.round(sweat)]);
    hydrationSeries.push([t, drinks.filter((d) => d.minute <= t).reduce((a, d) => a + d.ml, 0)]);
    const tau = t / 60;
    iobSeries.push([t, Math.round((tau < DIA_H ? iob * (1 - tau / DIA_H) ** INS_P : 0) * 100) / 100]);
  }
  const sips = drinks;
  const preRun = {
    carbsToTargetG: startBg < targets.startTarget - 0.5 ? Math.round((targets.startTarget - startBg) / effect) : 0,
    startCarbsG: main.intakes.filter((x) => x.kind === 'start').reduce((a, x) => a + x.g, 0),
    tempTarget: 'Exercise target of 8.0-9.0 mmol/L set 60-90 minutes before, so the loop eases off insulin (rulebook).',
    iobNote: iob >= 1 ? `${iob} U still on board - each unit takes off about ${(isf * sensMult * insulinBoost).toFixed(1)} mmol/L while running.` : 'Little insulin on board - a good start.',
    // ACSM: 5-7 ml/kg at least 4 hours before (more 2 hours before only if urine is dark); no big drink at the start
    drinkMl: Math.round((bodyKg * 7) / 50) * 50,
    drinkLowMl: Math.round((bodyKg * 5) / 50) * 50,
    drinkText: `Drink about ${Math.round((bodyKg * 5) / 50) * 50}-${Math.round((bodyKg * 7) / 50) * 50} ml 2-4 hours before, then stop big drinks about 45 minutes before so you're not looking for a toilet. A mouthful with your start carbs is all you need as you set off.`,
  };

  // What-if tables: different starting glucose (same IOB) and different IOB (same glucose).
  const scenario = (s, i) => { const r = runPlan(s, i); const g = r.intakes.reduce((a, x) => a + x.g, 0); return { totalCarbs: g, carbsAtStart: r.intakes.filter((x) => x.kind === 'start').reduce((a, x) => a + x.g, 0), minBg: Math.round(min(r.bg, 0, dur) * 10) / 10, endBg: Math.round(r.bg[dur] * 10) / 10 }; };
  const startScenarios = [6, 7, 8, 9, 10, 12].map((s) => ({ startBg: s, ...scenario(s, iob) }));
  const iobScenarios = [0, 0.5, 1, 2, 3, 4].map((i) => ({ iob: i, ...scenario(startBg, i) }));

  const hours = dur / 60;
  const guideline = weightKg ? {
    lowIob: [Math.round(0.3 * weightKg), Math.round(0.5 * weightKg)],
    highIob: [Math.round(0.5 * weightKg), Math.round(1.0 * weightKg)],
    usedRange: iob >= 1 || Number(input.minutesSinceBolus) < 120 ? 'highIob' : 'lowIob',
  } : null;

  const warnings = [];
  if (startBg < 4) warnings.push('Glucose is below 4.0 - treat the low and recheck before doing anything else.');
  else if (startBg < 5) warnings.push('ISPAD 2022: at 4.0-4.9 mmol/L delay the run about 20 minutes and take about 0.3 g/kg of fast carbs' + (weightKg ? ` (about ${Math.round(0.3 * weightKg)} g for you)` : '') + ', then recheck.');
  else if (startBg > 15) warnings.push('Above 15 mmol/L: check ketones first (ISPAD: no exercise at 1.5 mmol/L or more).');
  if (minDuring < floor) warnings.push(`Even with the plan the estimate dips to ${minDuring.toFixed(1)}, below your ${floor} floor - start higher, run easier, or carry more and take it earlier.`);
  if (totalCarbs / hours > 75) warnings.push('The plan needs more than 75 g an hour, which is at the top of what guidelines suggest guts can absorb - consider starting higher or reducing insulin on board beforehand.');
  if (weather?.current?.temperature_c >= 25) warnings.push(`High ambient temperature (${weather.current.temperature_c}°C): thermal strain elevates carbohydrate oxidation and rapid dehydration risk. Ensure ${hydration.fluidPerHourMl}ml/h fluid intake.`);

  const insulin = [];
  const since = Number(input.minutesSinceBolus);
  if (Number.isFinite(since) && since < 120) insulin.push({ title: 'Your last bolus was within 2 hours', text: `Published starting points for a run within 2 hours of a mealtime bolus are a reduction of that bolus of about 20% (Riddell 2017) to about 50% (ISPAD 2022 starting plan for aerobic exercise; more if the run is hard or the meal was small). That is a parameter to consider for your run, not something this page can set.` });
  if (iob >= 1) insulin.push({ title: `${iob} U on board at the start`, text: `Insulin on board is the biggest reason carbs are needed. In this model ${iob} U removes about ${(isf * iob * sensMult * (1 - (1 - Math.min(1, hours / DIA_H)) ** INS_P)).toFixed(1)} mmol/L over the run. Allowing it to fall before the run (for example by setting your exercise/activity target 1-2 hours ahead so the loop stops adding more) shrinks the carbs needed - check how your AAPS settings handle this.` });
  insulin.push({ title: 'After the run', text: 'Insulin sensitivity stays raised for hours: hypoglycaemia risk is highest during and shortly after exercise, and up to 24 hours later (7-11 hours overnight after an afternoon or evening run). ISPAD suggests around a 20% basal reduction for about 6 hours overnight for pump users after evening exercise. Your loop will react, and a temporary target or profile change can be considered for those hours.' });

  // from your own past runs: the usual post-run spike and a conservative correction estimate (see postRunPattern)
  try {
    const pr = postRunPattern();
    const pat = (intensity === 'hard' && pr.hard) || pr.overall;
    if (pat?.units) insulin.push({ title: `After the run: your usual spike (${pat.runs} runs)`, estimate: true, text: `After ${pat.runs === pr.overall?.runs ? 'your' : 'your hard'} runs glucose has typically risen about ${pat.rise} mmol/L, peaking around ${pat.peakAt} minutes after the finish (your loop added about ${pat.loopUnits} U on its own). With your ISF of ${pat.units.isf}, a full correction for that rise would be about ${pat.units.full} U; a conservative post-run correction - about half - is about ${pat.units.conservative} U, minus any insulin still on board. ${pr.caveat}` });
    else if (pat && pat.runs) insulin.push({ title: 'After the run: your usual pattern', text: `From ${pat.runs} run${pat.runs === 1 ? '' : 's'} with data: a typical rise of ${pat.rise} mmol/L about ${pat.peakAt} minutes after the finish. A correction estimate appears once ${pr.needRuns} runs show a rise of 2 or more.` });
  } catch (_) { /* no history yet */ }
  try {
    const rf = refuelStatus();
    if (rf && rf.pct != null && rf.pct < 70 && rf.hoursSince < 72) warnings.push(`Refuelling: ${rf.text}`);
  } catch (_) { /* no runs */ }

  return {
    demand: demandFrom({ distanceKm, dur, tl, terrain, route, intensity, pace, weather }),
    effortSeries, hydrationSeries, sweatSeries, iobSeries, sips, drinks, preRun, recovery, learning, profile,
    // the model's inputs, kept with the plan you run with so the retrospective can replay it
    modelParams: { ...params, exShape: exShape.map((v) => Math.round(v * 100) / 100) },
    inputs: { distanceKm, targetMinutes, paceMinPerKm: pace, averagePaceMinPerKm: tl.minutes / distanceKm, intensity, startBg, iob, cob, weightKg, sensMult, kEx, routeId: route?.id ?? null, routeName: route?.name ?? null, customCarbs, paceEffortFactor: Math.round(paceEffortFactor * 100) / 100, weatherEffortMultiplier: Math.round(weatherEffortMultiplier * 100) / 100 },
    settings: { insulinBoost: Math.round(insulinBoost * 100) / 100, kExRun: Math.round(kExRun * 100) / 100, isf, cr, gPerMmol: Math.round((1 / effect) * 10) / 10, mmolPerGram: Math.round(effect * 1000) / 1000, floor, startTarget: targets.startTarget },
    run: { durationMin: dur, distanceKm: Math.round(tl.distanceKm * 100) / 100, gainM: terrain.gainM, lossM: terrain.lossM, effortFactor: Math.round(tl.effort * 100) / 100, combinedEffortFactor: Math.round(combinedEffort * 100) / 100, kcal: tl.kcal, hasElevation: route ? route.hasElevation : false },
    weather,
    hydration,
    plan: {
      stops, totalCarbs, carbsPerHour: Math.round(totalCarbs / hours), postCarbs,
      predicted: { minDuring: Math.round(minDuring * 10) / 10, endBg: Math.round(endBg * 10) / 10, minAfter: Math.round(minAfter * 10) / 10, minWithoutCarbs: Math.round(min(noCarb, 0, dur) * 10) / 10 },
      toReachStartTarget: startBg < targets.startTarget - 0.5 ? Math.round((targets.startTarget - startBg) / effect) : 0,
    },
    prediction, withoutCarbs, elevation, splits: kmSplitsFrom(tl, route, distanceKm, hydration),
    startScenarios, iobScenarios, guideline, insulin, warnings,
    basis: { personalRuns: personal.runs, personalFitted: Boolean(personal.kEx), assumed },
    sources: SOURCES,
  };
}

function profileEle(profile, km) {
  for (let i = 0; i < profile.length - 1; i++) if (km >= profile[i][0] && km <= profile[i + 1][0]) return profile[i][1];
  return profile[profile.length - 1][1];
}
