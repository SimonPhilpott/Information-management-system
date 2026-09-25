import db, { getSetting, setSetting } from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { textInUnits, clearUnitCache, normaliseUnits } from './aiTextService.js';
import { getInsights } from './runGlucoseService.js';
import { getTargets } from './runPlanService.js';

// Running goals: "10 km in 55 minutes by 1 December", or just "a half marathon". Each goal is judged
// from the Strava log (what you could run today, whether the weekly volume and long run are
// on the way) and can be handed to the Run Planner to plan the fuelling for the effort itself.
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
const RUN_SPORTS = ['Run', 'TrailRun', 'VirtualRun'];

db.exec(`
  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sport TEXT NOT NULL DEFAULT 'Run',
    distance_km REAL NOT NULL,
    target_min REAL,
    target_date TEXT,
    created_at INTEGER NOT NULL
  );
`);

const present = (r) => ({ id: r.id, name: r.name, sport: r.sport, distanceKm: r.distance_km, targetMin: r.target_min, targetDate: r.target_date, createdAt: r.created_at });

function clean({ name, distanceKm, targetMin, targetDate }, partial = false) {
  const out = {};
  if (!partial || name !== undefined) { const n = String(name || '').trim(); if (!n) throw new Error('Give the goal a name.'); out.name = n.slice(0, 80); }
  if (!partial || distanceKm !== undefined) { const d = Number(distanceKm); if (!Number.isFinite(d) || d < 1 || d > 100) throw new Error('The distance must be between 1 and 100 km.'); out.distance_km = Math.round(d * 100) / 100; }
  if (targetMin !== undefined) {
    if (targetMin === null || targetMin === '') out.target_min = null;
    else { const t = Number(targetMin); if (!Number.isFinite(t) || t < 5 || t > 2000) throw new Error('The target time must be between 5 minutes and about 33 hours.'); out.target_min = Math.round(t * 100) / 100; }
  }
  if (targetDate !== undefined) {
    if (!targetDate) out.target_date = null;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(String(targetDate))) out.target_date = String(targetDate);
    else throw new Error('The date must look like 2026-12-01.');
  }
  return out;
}

export const listGoals = () => db.prepare('SELECT * FROM goals ORDER BY (target_date IS NULL), target_date, id').all().map(present);
export const getGoal = (id) => { const r = db.prepare('SELECT * FROM goals WHERE id = ?').get(id); return r ? present(r) : null; };

export function createGoal(input) {
  const c = clean(input);
  const info = db.prepare('INSERT INTO goals (name, distance_km, target_min, target_date, created_at) VALUES (?, ?, ?, ?, ?)').run(c.name, c.distance_km, c.target_min ?? null, c.target_date ?? null, Date.now());
  return getGoal(Number(info.lastInsertRowid));
}
export function updateGoal(id, input) {
  const cur = getGoal(id);
  if (!cur) throw new Error('Goal not found.');
  const c = clean({ name: cur.name, distanceKm: cur.distanceKm, targetMin: cur.targetMin, targetDate: cur.targetDate, ...input }, false);
  db.prepare('UPDATE goals SET name = ?, distance_km = ?, target_min = ?, target_date = ? WHERE id = ?').run(c.name, c.distance_km, c.target_min ?? null, c.target_date ?? null, id);
  clearUnitCache('goalplan', id);
  return getGoal(id);
}
export function deleteGoal(id) {
  db.prepare('DELETE FROM goals WHERE id = ?').run(id);
  setSetting(`goal_plan_${id}`, '');
  clearUnitCache('goalplan', id);
  return true;
}

// ---- assessment ------------------------------------------------------------------------------------
const addDays = (dateStr, n) => { const d = new Date(`${dateStr}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const median = (xs) => { const v = xs.slice().sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

// What the distance calls for: the long run to have done, and the weekly volume to be running.
function recommend(distanceKm) {
  const d = distanceKm;
  const longRun = d <= 10 ? 0.75 * d : d <= 25 ? Math.min(0.7 * d, 18) : Math.min(0.6 * d, 32);
  const weekly = d <= 10 ? Math.max(20, 2.5 * d) : d <= 25 ? 3 * d : Math.min(2 * d, 70);
  return { longRunKm: r1(longRun), weeklyKm: r1(weekly) };
}

export function assessGoal(goal) {
  const today = todayStr();
  const runs = db.prepare(`SELECT id, day, distance, moving_time, elevation FROM strava_activities WHERE sport IN (${RUN_SPORTS.map(() => '?').join(',')}) AND day >= ? AND distance >= 1500 ORDER BY day`)
    .all(...RUN_SPORTS, addDays(today, -84));
  const last28 = runs.filter((r) => r.day >= addDays(today, -27));
  const last42 = runs.filter((r) => r.day >= addDays(today, -41));
  const weeklyKm = last28.reduce((a, r) => a + r.distance, 0) / 1000 / 4;
  const longest = last42.reduce((m, r) => (r.distance > (m?.distance ?? 0) ? r : m), null);

  // Riegel: T2 = T1 * (D2 / D1) ^ 1.06, from each recent run of a useful length.
  const preds = last42.filter((r) => r.distance >= 3000 && r.moving_time > 0 && (goal.distanceKm * 1000) / r.distance <= 3.2)
    .map((r) => ({ id: r.id, day: r.day, km: r1(r.distance / 1000), minutes: Math.round((r.moving_time / 60) * 10) / 10, predMin: (r.moving_time / 60) * ((goal.distanceKm * 1000) / r.distance) ** 1.06 }))
    .sort((a, b) => a.predMin - b.predMin);
  const best = preds[0] || null;
  const typical = preds.length ? median(preds.slice(0, 3).map((p) => p.predMin)) : null;
  const typicalPace = median(last42.filter((r) => r.distance >= 3000).map((r) => r.moving_time / 60 / (r.distance / 1000)));

  const rec = recommend(goal.distanceKm);
  const longestKm = longest ? longest.distance / 1000 : 0;
  const weeksLeft = goal.targetDate ? Math.max(0, Math.ceil((new Date(`${goal.targetDate}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / (7 * 86400000))) : null;
  const progress = {
    longRun: Math.min(1, longestKm / rec.longRunKm), weekly: Math.min(1, weeklyKm / rec.weeklyKm),
    time: goal.targetMin && best ? Math.max(0, Math.min(1, goal.targetMin / best.predMin)) : null,
  };
  const rampPct = weeksLeft && weeklyKm > 1 && weeklyKm < rec.weeklyKm ? Math.round(((rec.weeklyKm / weeklyKm) ** (1 / weeksLeft) - 1) * 100) : null;

  const flags = [];
  if (runs.length < 4) flags.push('Fewer than four runs in the last 12 weeks, so this is a rough guide.');
  if (longestKm < rec.longRunKm * 0.7) flags.push(`Your longest recent run is ${r1(longestKm)} km; about ${rec.longRunKm} km is a good long run for this distance.`);
  if (weeklyKm < rec.weeklyKm * 0.6) flags.push(`You are averaging ${r1(weeklyKm)} km a week; about ${rec.weeklyKm} km a week suits this distance.`);
  if (rampPct != null && rampPct > 10) flags.push(`Reaching that weekly volume by ${goal.targetDate} would need about ${rampPct}% more each week, above the usual 10% limit for staying injury-free.`);
  if (weeksLeft === 0 && goal.targetDate < today) flags.push('The target date has passed.');

  let verdict = null;
  if (goal.targetMin && best) {
    const ratio = best.predMin / goal.targetMin; // above 1 = predicted slower than the target
    verdict = ratio <= 1.0 ? 'Within reach today: your recent running already predicts this time or better.'
      : ratio <= 1.04 ? 'Very close: a short, focused block should get you there.'
      : ratio <= 1.09 ? 'A stretch: achievable with consistent training.'
      : 'Ambitious for now: a bigger gain in fitness is needed - consider a longer timeline or a slightly easier time.';
  } else if (!goal.targetMin) {
    const ready = Math.min(progress.longRun, progress.weekly);
    verdict = ready >= 0.9 ? 'Ready: your long run and weekly volume already suit this distance.'
      : ready >= 0.65 ? 'Getting there: build the long run and weekly volume a little further.'
      : 'Early days: build gradually towards this distance.';
  } else verdict = 'Not enough recent runs to predict a time yet.';

  return {
    goal, targetPaceMinPerKm: goal.targetMin ? Math.round((goal.targetMin / goal.distanceKm) * 100) / 100 : null,
    current: { weeklyKm: r1(weeklyKm), runsPerWeek: r1(last28.length / 4), longestRunKm: r1(longestKm), typicalPaceMinPerKm: typicalPace ? Math.round(typicalPace * 100) / 100 : null, bestPredictedMin: best ? r1(best.predMin) : null, typicalPredictedMin: typical ? r1(typical) : null, basedOn: best },
    recommended: rec, progress, weeksLeft, rampPct, verdict, flags,
  };
}

// ---- coaching plan (AI) ------------------------------------------------------------------------------------
const unitNote = (units) => (units === 'mi' ? 'Write distances in MILES and pace in min per mile (the data below is in kilometres - convert: 1 mile = 1.609 km); elevation stays in metres.' : 'Write distances in kilometres and pace in min per km; elevation in metres.');

export async function analyseGoal(id, units = 'km') {
  const goal = getGoal(id);
  if (!goal) throw new Error('Goal not found.');
  const a = assessGoal(goal);
  if (!a.current.weeklyKm && !a.current.longestRunKm) throw new Error('Sync some runs from Strava first.');
  const weekly = db.prepare(`SELECT strftime('%Y-%W', day) AS wk, MIN(day) AS start, COUNT(*) AS runs, ROUND(SUM(distance)/1000.0, 1) AS km FROM strava_activities WHERE sport IN (${RUN_SPORTS.map(() => '?').join(',')}) AND day >= ? GROUP BY wk ORDER BY wk`)
    .all(...RUN_SPORTS, addDays(todayStr(), -84));
  let glucose = null;
  try { const g = getInsights('Run'); if (g.runs) glucose = { runsMatched: g.runs, overall: g.overall }; } catch (_) { /* optional */ }
  const t = getTargets();
  const weeks = a.weeksLeft ? Math.min(a.weeksLeft, 16) : 8;
  const prompt =
    `You are an encouraging, sensible running coach. The runner has type 1 diabetes (Omnipod pump, AAPS closed loop). Use British English. ${unitNote(units)} ` +
    `Base everything on the DATA; do not invent runs, injuries or times. Quote numbers.\n\n` +
    `THE GOAL: ${goal.name} - ${goal.distanceKm} km${goal.targetMin ? ` in ${goal.targetMin} minutes (${a.targetPaceMinPerKm} min/km)` : ' (a distance goal, no target time)'}${goal.targetDate ? ` by ${goal.targetDate} (${a.weeksLeft} weeks away)` : ' (no date set)'}.\n\n` +
    `Write short sections with these headings:\n` +
    `1. "Where you are" - current weekly distance, runs per week, longest run, and what the recent running predicts for this distance (the assessment's predictions come from Riegel's formula on recent runs).\n` +
    `2. "Is it realistic?" - an honest answer, using the assessment's verdict and flags.\n` +
    `3. "The plan" - a ${weeks}-week outline, one line per week: total distance, the long run, and the key session. Build weekly distance by no more than about 10% a week with an easier week every 3rd or 4th week, taper the last week if there is a date, and finish with the goal effort itself.\n` +
    `4. "Key sessions" - two or three types (easy runs, tempo/threshold at the goal pace, intervals, long run) and what each is for.\n` +
    `5. "Fuelling and glucose" - the runner's targets are to start near ${t.startTarget} mmol/L and never go below ${t.floor}. Point them to the Run Planner for carbs and timing for each key run and the goal effort, mention that longer or harder sessions need a fuelling plan, and never give insulin doses or pump changes.\n` +
    `6. "Watch-outs" - injury risk from ramping too fast, recovery, and when to ease off.\n` +
    `Keep it under about 500 words. Start with one sentence summing up the goal.\n\nDATA (JSON):\n${JSON.stringify({ assessment: a, weeklyLast12Weeks: weekly, glucose })}`;
  const text = (await genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }).generateContent(prompt)).response.text().trim();
  const saved = { at: Date.now(), text, units: normaliseUnits(units) };
  setSetting(`goal_plan_${id}`, JSON.stringify(saved));
  clearUnitCache('goalplan', id);
  return saved;
}

export async function getGoalPlan(id, units = 'km') {
  try {
    const p = JSON.parse(getSetting(`goal_plan_${id}`) || 'null');
    if (!p) return null;
    return { at: p.at, text: await textInUnits('goalplan', id, p.text, p.units || 'km', units), units: normaliseUnits(units) };
  } catch (_) { return null; }
}
