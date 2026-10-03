import crypto from 'crypto';
import db, { getSetting } from '../db/database.js';
import { matchActivity, getLoopSettings } from './runGlucoseService.js';
import { getRoute, linkedRouteId, linkActivityRoute } from './routeService.js';
import { estimatePlan, getTargets, replaySimulate, runProfile, personalFit } from './runPlanService.js';
import { logCarbs, deleteCarbs } from './glucoseHubService.js';

// Run learning: every run teaches the next one.
//  1. A session is saved when a run is sent to the phone - the exact plan (stops, predicted curve, the model's
//     inputs). Each reminder has Taken / Skipped buttons, so IMS knows what you actually took and when (carbs
//     taken are logged to Nightscout too). Runs from before this (or not sent) get a "retro" session.
//  2. After the run, the session is matched to the Strava activity and its CGM trace, and the planner replays
//     the run with what actually happened. How far off the model was - and what fits - is the analysis.
//  3. Across runs, consistent differences become suggestions at three levels: this route, this kind of run
//     (distance, effort, hills) and general. Nothing changes the planner until you accept it; accepted general
//     lessons with enough evidence are offered to the T1D Rulebook as findings.
// Safety: suggestions need several runs, are capped, lean towards more carbs when unclear, and never touch insulin.

db.exec(`
  CREATE TABLE IF NOT EXISTS run_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL, created_at INTEGER NOT NULL, started_at INTEGER,
    kind TEXT NOT NULL DEFAULT 'live', test INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'scheduled',
    route_id INTEGER, route_name TEXT, plan TEXT, activity_id INTEGER UNIQUE, effort INTEGER, analysis TEXT, analysed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS run_intake (
    id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, planned_minute INTEGER, planned_g INTEGER DEFAULT 0, planned_ml INTEGER DEFAULT 0,
    action TEXT, at INTEGER, minute REAL, grams INTEGER, ml INTEGER, carb_log_id INTEGER, source TEXT
  );
  CREATE TABLE IF NOT EXISTS run_note (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, minute REAL, text TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS run_learning (
    id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL, scope_key TEXT NOT NULL, kind TEXT NOT NULL, value REAL NOT NULL,
    runs INTEGER NOT NULL, evidence TEXT, text TEXT, status TEXT NOT NULL DEFAULT 'suggested', created_at INTEGER NOT NULL, decided_at INTEGER
  );
`);

const r1 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);
const r2 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
const round5 = (x) => Math.round(x / 5) * 5;
const median = (xs) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
const parse = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
const CGM_LAG = 5; // minutes the sensor trails blood glucose
const ANALYSIS_VERSION = 4; // bump when the analysis gains fields, so stored ones are redone when opened

// ---- sessions ----------------------------------------------------------------------------------------
// The plan as it was sent: enough to show it again and to replay it, without the heavy what-if tables.
// The chart's own series, kept so the plan can be drawn again exactly as it was sent
const CHART_KEYS = ['inputs', 'settings', 'run', 'plan', 'drinks', 'sips', 'prediction', 'withoutCarbs', 'effortSeries', 'hydrationSeries', 'sweatSeries', 'iobSeries', 'elevation', 'hydration', 'preRun', 'recovery', 'learning', 'profile', 'warnings', 'insulin', 'splits'];
function snapshotOf(plan) {
  if (!plan || typeof plan !== 'object') return null;
  const chart = Object.fromEntries(CHART_KEYS.filter((k) => plan[k] !== undefined).map((k) => [k, plan[k]]));
  return {
    chart: chart.prediction?.length && chart.plan ? chart : null,
    inputs: plan.inputs || null, settings: plan.settings || null, run: plan.run || null, profile: plan.profile || null,
    stops: plan.plan?.stops || [], drinks: plan.drinks || [], postCarbs: plan.plan?.postCarbs ?? 0, predicted: plan.plan?.predicted || null,
    prediction: plan.prediction || [], modelParams: plan.modelParams || null, recovery: plan.recovery || null,
    learning: plan.learning ? { uptakeMult: plan.learning.uptakeMult ?? 1, postCarbsExtra: plan.learning.postCarbsExtra ?? 0, applied: plan.learning.applied || [] } : { uptakeMult: 1, postCarbsExtra: 0, applied: [] },
    weather: plan.weather?.current ? { current: plan.weather.current } : null,
  };
}

/** A run sent to the phone. stops: [{minute, grams, ml}] as reminded. */
export function createSession({ routeId = null, routeName = '', plan = null, stops = [], test = false, startedAt = null, status = 'scheduled' }) {
  const token = crypto.randomBytes(12).toString('hex');
  const info = db.prepare('INSERT INTO run_session (token, created_at, started_at, kind, test, status, route_id, route_name, plan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(token, Date.now(), startedAt, 'live', test ? 1 : 0, status, routeId ? Number(routeId) : null, routeName || null, JSON.stringify(snapshotOf(plan)));
  const id = Number(info.lastInsertRowid);
  const ins = db.prepare('INSERT INTO run_intake (session_id, planned_minute, planned_g, planned_ml) VALUES (?, ?, ?, ?)');
  const intakes = [];
  for (const x of stops) {
    if (!(x.grams || x.ml)) continue;
    const r = ins.run(id, Math.round(x.minute), Math.round(x.grams || 0), Math.round(x.ml || 0));
    intakes.push({ id: Number(r.lastInsertRowid), minute: Math.round(x.minute) });
  }
  return { id, token, intakes };
}
export function startSession(id, at = Date.now()) {
  db.prepare("UPDATE run_session SET started_at = ?, status = 'started' WHERE id = ?").run(at, id);
}
/** Alerts cleared: a run that hasn't begun is cancelled; one already under way is kept (it may still be run). */
export function endPendingSession(id) {
  const s = id ? db.prepare('SELECT * FROM run_session WHERE id = ?').get(id) : null;
  if (!s || s.activity_id) return;
  if (s.status === 'armed' || (s.status === 'scheduled' && (s.started_at == null || s.started_at > Date.now()))) {
    db.prepare("UPDATE run_session SET status = 'cancelled' WHERE id = ?").run(id);
  }
}
export const sessionIntakes = (sessionId) => db.prepare('SELECT * FROM run_intake WHERE session_id = ? ORDER BY COALESCE(minute, planned_minute), id').all(sessionId);

// carbs taken: to the carb log and Nightscout, at the moment they were taken
async function logIntakeCarbs(s, grams, at, minute) {
  if (!grams || s.test) return null;
  try {
    const e = await logCarbs({ grams, food: `Run: ${s.route_name || 'run'} (minute ${Math.round(minute)})`, at, source: 'run' });
    return e.id;
  } catch { return null; }
}

/** Taken / Skipped from the reminder on the phone (or watch). Guarded by the session's token. */
export async function recordIntakeFromPhone(token, intakeId, action) {
  const s = db.prepare('SELECT * FROM run_session WHERE token = ?').get(String(token || ''));
  const it = s ? db.prepare('SELECT * FROM run_intake WHERE id = ? AND session_id = ?').get(Number(intakeId), s.id) : null;
  if (!s || !it) return { unknown: true };
  if (it.action) return { already: it.action };
  const now = Date.now();
  // tapped during the run: that's when it was taken; tapped long after (catching up later): assume on time
  const runMin = parse(s.plan)?.run?.durationMin ?? 240;
  const elapsed = s.started_at ? (now - s.started_at) / 60000 : null;
  const minute = elapsed != null && elapsed >= 0 && elapsed <= runMin + 30 ? elapsed : it.planned_minute;
  if (action === 'skipped') {
    db.prepare("UPDATE run_intake SET action = 'skipped', at = ?, minute = ?, grams = 0, ml = 0, source = 'phone' WHERE id = ?").run(now, minute, it.id);
    return { recorded: 'skipped' };
  }
  const carbId = await logIntakeCarbs(s, it.planned_g, s.started_at ? s.started_at + minute * 60000 : now, minute);
  db.prepare("UPDATE run_intake SET action = 'taken', at = ?, minute = ?, grams = ?, ml = ?, carb_log_id = ?, source = 'phone' WHERE id = ?")
    .run(now, minute, it.planned_g, it.planned_ml, carbId, it.id);
  return { recorded: 'taken', minute: r1(minute), loggedToNightscout: Boolean(carbId) };
}

/** Corrected in the retrospective: when, how much, or taken / skipped. */
export async function updateIntake(id, { action, minute, grams, ml } = {}) {
  const it = db.prepare('SELECT * FROM run_intake WHERE id = ?').get(Number(id));
  if (!it) throw new Error('Not found.');
  const s = db.prepare('SELECT * FROM run_session WHERE id = ?').get(it.session_id);
  const next = {
    action: action === undefined ? it.action : ['taken', 'skipped'].includes(action) ? action : null,
    minute: minute === undefined ? it.minute : (minute === null || minute === '' ? null : Math.max(-30, Math.min(600, Number(minute)))),
    grams: grams === undefined ? it.grams : Math.max(0, Math.min(200, Math.round(Number(grams) || 0))),
    ml: ml === undefined ? it.ml : Math.max(0, Math.min(1500, Math.round(Number(ml) || 0))),
  };
  if (next.action === 'taken') { if (next.minute == null) next.minute = it.planned_minute ?? 0; if (next.grams == null) next.grams = it.planned_g; if (next.ml == null) next.ml = it.planned_ml; }
  if (next.action === 'skipped') { next.grams = 0; next.ml = 0; }
  // keep the carb log (and Nightscout) in step: remove the old entry and log the corrected one
  let carbId = it.carb_log_id;
  const changed = next.action !== it.action || next.grams !== it.grams || next.minute !== it.minute;
  if (changed && carbId) { try { await deleteCarbs(carbId); } catch { /* gone already */ } carbId = null; }
  if (changed && next.action === 'taken' && next.grams > 0 && s?.started_at) carbId = await logIntakeCarbs(s, next.grams, s.started_at + next.minute * 60000, next.minute);
  db.prepare('UPDATE run_intake SET action = ?, minute = ?, grams = ?, ml = ?, carb_log_id = ?, at = COALESCE(at, ?), source = COALESCE(source, ?) WHERE id = ?')
    .run(next.action, next.minute, next.grams, next.ml, carbId, Date.now(), 'page', it.id);
  return db.prepare('SELECT * FROM run_intake WHERE id = ?').get(it.id);
}
/** Something taken that wasn't in the plan (an extra gel, a drink at a fountain). */
export async function addIntake(sessionId, { minute, grams = 0, ml = 0, log = true }) {
  const s = db.prepare('SELECT * FROM run_session WHERE id = ?').get(Number(sessionId));
  if (!s) throw new Error('Run not found.');
  const m = Math.max(-30, Math.min(600, Number(minute) || 0));
  const g = Math.max(0, Math.min(200, Math.round(Number(grams) || 0)));
  const carbId = log && s.started_at ? await logIntakeCarbs(s, g, s.started_at + m * 60000, m) : null;
  db.prepare("INSERT INTO run_intake (session_id, planned_minute, action, at, minute, grams, ml, carb_log_id, source) VALUES (?, NULL, 'taken', ?, ?, ?, ?, ?, 'added')")
    .run(s.id, Date.now(), m, g, Math.max(0, Math.round(Number(ml) || 0)), carbId);
  return sessionIntakes(s.id);
}
export async function deleteIntake(id) {
  const it = db.prepare('SELECT * FROM run_intake WHERE id = ?').get(Number(id));
  if (!it) return false;
  if (it.planned_minute != null) { await updateIntake(id, { action: null }); return true; } // planned stops stay, just unrecorded
  if (it.carb_log_id) { try { await deleteCarbs(it.carb_log_id); } catch { /* gone */ } }
  db.prepare('DELETE FROM run_intake WHERE id = ?').run(it.id);
  return true;
}

export function addNote(sessionId, { minute = null, text }) {
  const t = String(text || '').trim().slice(0, 1000);
  if (!t) throw new Error('Write a note first.');
  const m = minute === null || minute === '' || minute === undefined ? null : Math.max(-30, Math.min(600, Number(minute)));
  db.prepare('INSERT INTO run_note (session_id, minute, text, created_at) VALUES (?, ?, ?, ?)').run(Number(sessionId), Number.isFinite(m) ? m : null, t, Date.now());
  return db.prepare('SELECT * FROM run_note WHERE session_id = ? ORDER BY COALESCE(minute, 9999), id').all(Number(sessionId));
}
export function deleteNote(id) { return db.prepare('DELETE FROM run_note WHERE id = ?').run(Number(id)).changes > 0; }
export function setEffort(sessionId, effort) {
  const e = effort === null || effort === '' ? null : Math.max(1, Math.min(10, Math.round(Number(effort))));
  db.prepare('UPDATE run_session SET effort = ? WHERE id = ?').run(e, Number(sessionId));
}

// ---- matching sessions to Strava runs ----------------------------------------------------------------
const RUN_SPORTS = "('Run','TrailRun','VirtualRun')";
/** Sessions that have started get the Strava run that began closest to the tap (within 40 minutes). */
export async function linkSessions() {
  const open = db.prepare("SELECT * FROM run_session WHERE activity_id IS NULL AND test = 0 AND kind = 'live' AND status IN ('started','scheduled') AND started_at IS NOT NULL AND started_at < ?").all(Date.now() - 10 * 60000);
  const linked = [];
  for (const s of open) {
    const from = new Date(s.started_at - 20 * 60000).toISOString(), to = new Date(s.started_at + 40 * 60000).toISOString();
    const cands = db.prepare(`SELECT id, start_utc FROM strava_activities WHERE sport IN ${RUN_SPORTS} AND start_utc >= ? AND start_utc <= ? AND id NOT IN (SELECT activity_id FROM run_session WHERE activity_id IS NOT NULL)`).all(from, to);
    const best = cands.sort((a, b) => Math.abs(Date.parse(a.start_utc) - s.started_at) - Math.abs(Date.parse(b.start_utc) - s.started_at))[0];
    if (!best) {
      // a day on with no run found: it didn't happen (or wasn't recorded)
      if (Date.now() - s.started_at > 36 * 3600000) db.prepare("UPDATE run_session SET status = 'no_run' WHERE id = ?").run(s.id);
      continue;
    }
    linkTo(s, best.id);
    linked.push(s.id);
  }
  for (const id of linked) { try { await analyseSession(id); } catch { /* shown when opened */ } }
  return linked;
}
function linkTo(s, activityId) {
  db.prepare("UPDATE run_session SET activity_id = ?, status = 'linked' WHERE id = ?").run(activityId, s.id);
  if (s.route_id && !linkedRouteId(activityId) && getRoute(s.route_id)) { try { linkActivityRoute(activityId, s.route_id); } catch { /* fine */ } }
}
export async function linkSessionManually(sessionId, activityId) {
  const s = db.prepare('SELECT * FROM run_session WHERE id = ?').get(Number(sessionId));
  if (!s) throw new Error('Run not found.');
  const other = db.prepare('SELECT id, kind FROM run_session WHERE activity_id = ?').get(Number(activityId));
  if (other && other.id !== s.id) {
    if (other.kind !== 'retro') throw new Error('That activity is already linked to another sent run.');
    db.prepare('DELETE FROM run_intake WHERE session_id = ?').run(other.id);
    db.prepare('DELETE FROM run_note WHERE session_id = ?').run(other.id);
    db.prepare('DELETE FROM run_session WHERE id = ?').run(other.id);
  }
  linkTo(s, Number(activityId));
  return analyseSession(s.id);
}

// For a run with no sent plan: a "retro" session, so it can still be reviewed, annotated and learned from.
// Carbs come from the carb log (and Nightscout) in the run's window; there's no plan to compare timings with.
function ensureSession(activityId) {
  const existing = db.prepare('SELECT * FROM run_session WHERE activity_id = ?').get(activityId);
  if (existing) return existing;
  const a = db.prepare('SELECT id, name, start_utc, elapsed_time, moving_time FROM strava_activities WHERE id = ?').get(activityId);
  if (!a?.start_utc) throw new Error('Activity not found.');
  const start = Date.parse(a.start_utc);
  const routeId = linkedRouteId(activityId);
  const token = crypto.randomBytes(12).toString('hex');
  const info = db.prepare("INSERT INTO run_session (token, created_at, started_at, kind, test, status, route_id, route_name, plan, activity_id) VALUES (?, ?, ?, 'retro', 0, 'linked', ?, ?, NULL, ?)")
    .run(token, Date.now(), start, routeId, routeId ? getRoute(routeId)?.name : a.name, activityId);
  const id = Number(info.lastInsertRowid);
  const end = start + (a.elapsed_time || a.moving_time || 0) * 1000;
  for (const c of db.prepare('SELECT id, at, grams FROM carb_log WHERE at >= ? AND at <= ?').all(start - 30 * 60000, end)) {
    db.prepare("INSERT INTO run_intake (session_id, planned_minute, action, at, minute, grams, ml, carb_log_id, source) VALUES (?, NULL, 'taken', ?, ?, ?, 0, NULL, 'carb log')")
      .run(id, c.at, r1((c.at - start) / 60000), Math.round(c.grams));
  }
  return db.prepare('SELECT * FROM run_session WHERE id = ?').get(id);
}

// ---- the analysis ------------------------------------------------------------------------------------
function resampleShape(shape, dur) {
  if (!Array.isArray(shape) || !shape.length) return null;
  const out = [];
  for (let t = 0; t <= dur; t++) out.push(shape[Math.min(shape.length - 1, Math.round((t / Math.max(1, dur)) * (shape.length - 1)))]);
  return out;
}
const at = (series, m) => series[Math.max(0, Math.min(series.length - 1, Math.round(m)))];

function intensityOf(a) {
  if (a.session_tag === 'speed' || a.session_tag === 'hill' || (a.avg_hr && a.avg_hr >= 165)) return 'hard';
  if (a.avg_hr && a.avg_hr <= 135) return 'easy';
  return 'steady';
}

// How good the plan's prediction was, for the run itself: the share of your readings within 1 mmol/L of the
// predicted line (the headline %), the average gap, which way it was off, and the lowest point predicted vs real.
function predictionAccuracy(plan, toRun, obsRun, st) {
  if (!plan?.prediction?.length || obsRun.length < 4) return null;
  const pts = plan.prediction.map(([x, bg]) => [toRun(x), bg]);
  const predAt = (m) => { const p = pts.reduce((b, q) => (Math.abs(q[0] - m) < Math.abs(b[0] - m) ? q : b), pts[0]); return Math.abs(p[0] - m) <= 3 ? p[1] : null; };
  const d = obsRun.map((p) => { const pr = predAt(p.m - CGM_LAG); return pr == null ? null : p.bg - pr; }).filter((x) => x != null);
  if (d.length < 4) return null;
  const within = d.filter((x) => Math.abs(x) <= 1).length / d.length;
  return {
    pct: Math.round(within * 100), mae: r1(d.reduce((n, x) => n + Math.abs(x), 0) / d.length), bias: r1(d.reduce((n, x) => n + x, 0) / d.length),
    lowestPredicted: plan.predicted?.minDuring ?? null, lowestActual: st.bgMin, readings: d.length,
  };
}

export async function analyseSession(sessionId) {
  const s = db.prepare('SELECT * FROM run_session WHERE id = ?').get(Number(sessionId));
  if (!s?.activity_id) throw new Error('This run is not matched to a Strava activity yet.');
  const a = db.prepare('SELECT id, name, day, start_utc, distance, moving_time, elapsed_time, elevation, avg_hr, max_hr, session_tag FROM strava_activities WHERE id = ?').get(s.activity_id);
  const m = await matchActivity(s.activity_id);
  const save = (analysis) => { db.prepare('UPDATE run_session SET analysis = ?, analysed_at = ? WHERE id = ?').run(JSON.stringify(analysis), Date.now(), s.id); return analysis; };
  if (m.status !== 'ok') return save({ available: false, reason: m.note || 'No glucose data was logged for this run.' });

  const t = getTargets();
  const plan = parse(s.plan);
  const st = m.stats;
  const dur = m.window.durationMin;
  const km = a.distance / 1000;
  const startMs = Date.parse(a.start_utc);
  // reminders were timed from the tap; the watch may have started a little later
  const offset = s.kind === 'live' && s.started_at ? (startMs - s.started_at) / 60000 : 0;
  const toRun = (minute) => minute - offset; // session minute -> minute of the recorded run

  // what was actually taken, on the run's own clock
  const rows = sessionIntakes(s.id);
  const intakes = rows.filter((x) => x.action === 'taken' && x.grams > 0 && x.minute != null).map((x) => ({ t: toRun(x.minute), g: x.grams }));
  // carbs entered in Nightscout/AAPS during the run (not IMS's own notes)
  for (const e of m.events || []) if (e.type === 'carbs' && e.m >= 0 && e.m <= dur && e.grams > 0) intakes.push({ t: e.m, g: e.grams });
  // anything else in the carb log around the run (e.g. a gel logged by voice) - for a sent run; a retro run's are its intakes
  if (s.kind === 'live') {
    const own = new Set(rows.map((x) => x.carb_log_id).filter(Boolean));
    for (const c of db.prepare('SELECT id, at, grams FROM carb_log WHERE at >= ? AND at <= ?').all(startMs - 30 * 60000, startMs + dur * 60000)) if (!own.has(c.id)) intakes.push({ t: (c.at - startMs) / 60000, g: Math.round(c.grams) });
  }

  // the model as used for the plan - or, for a run that wasn't planned in IMS, as it stands now (no learning)
  let mp = plan?.modelParams || null;
  let applied = plan?.learning?.uptakeMult ?? 1;
  let baseK = plan?.inputs?.kEx ?? 1; // the planner's uptake before any lesson, when the plan was made
  if (!mp) {
    try {
      const routeId = s.route_id && getRoute(s.route_id) ? s.route_id : null;
      const p = await estimatePlan({ ...(routeId ? { routeId } : { distanceKm: km }), targetMinutes: a.moving_time / 60, intensity: intensityOf(a), startBg: st.bgStart ?? t.startTarget, iob: st.iobStart ?? 0, cob: st.cobStart ?? 0, useRecovery: false, useLearning: false, weather: {} });
      mp = p.modelParams; applied = 1; baseK = p.inputs?.kEx ?? 1;
    } catch (err) { return save({ available: false, reason: `The planner could not model this run (${err.message}).` }); }
  }
  const rp = { ...mp, startBg: st.bgStart ?? mp.startBg, iob: st.iobStart ?? mp.iob, cob: st.cobStart ?? 0, durationMin: dur, totalMin: dur + 120, exShape: resampleShape(mp.exShape, dur) };

  const obsRun = m.series.filter((p) => p.bg != null && p.m >= 0 && p.m <= dur);
  const obsPost = m.series.filter((p) => p.bg != null && p.m > dur && p.m <= dur + 120);
  const err = (sim, obs) => (obs.length ? Math.sqrt(obs.reduce((acc, p) => acc + (at(sim, p.m - CGM_LAG) - p.bg) ** 2, 0) / obs.length) : null);
  const asModelled = replaySimulate(rp, intakes);
  let best = { scale: 1, rmse: err(asModelled, obsRun), sim: asModelled };
  if (obsRun.length >= 4 && rp.startBg != null) {
    for (let k = 0.2; k <= 8.001; k += 0.05) {
      const sim = replaySimulate({ ...rp, kEx: rp.kEx * k }, intakes);
      const e = err(sim, obsRun);
      if (e < best.rmse) best = { scale: Math.round(k * 100) / 100, rmse: e, sim };
    }
  }
  const fitted = best.sim;
  const fitOk = obsRun.length >= 6 && best.rmse != null && best.rmse < 1.6 && !st.sparseReadings && best.scale > 0.2 && best.scale < 8;
  const postResidual = obsPost.length >= 6 ? obsPost.reduce((acc, p) => acc + (p.bg - at(fitted, p.m - CGM_LAG)), 0) / obsPost.length : null;

  // timings: each planned stop against when (and whether) it was taken
  const timing = rows.filter((x) => x.planned_minute != null).map((x) => ({
    id: x.id, plannedMinute: x.planned_minute, grams: x.planned_g, ml: x.planned_ml, action: x.action || null,
    minute: x.minute != null ? r1(x.minute) : null, lateBy: x.action === 'taken' && x.minute != null ? r1(x.minute - x.planned_minute) : null,
  }));

  // what if the carbs had gone in exactly as planned (with what this run showed about uptake)?
  let onTime = null;
  if (plan?.stops?.length && timing.some((x) => x.action !== 'taken' || Math.abs(x.lateBy || 0) >= 3)) {
    const planned = plan.stops.map((x) => ({ t: toRun(x.minute), g: x.grams }));
    const sim = replaySimulate({ ...rp, kEx: rp.kEx * best.scale }, planned);
    const minOf = (arr) => Math.min(...arr.slice(0, dur + 1));
    onTime = { lowest: r1(minOf(sim)), actualModelLowest: r1(minOf(fitted)) };
  }

  // the plan this run points to: the same start, with the uptake it showed (live runs only)
  let betterPlan = null;
  if (plan?.inputs && fitOk && Math.abs(best.scale - 1) >= 0.1) {
    try {
      const i = plan.inputs;
      const p = await estimatePlan({ ...(i.routeId ? { routeId: i.routeId } : { distanceKm: i.distanceKm }), paceMinPerKm: i.averagePaceMinPerKm, intensity: i.intensity, startBg: i.startBg, iob: i.iob, cob: i.cob, kEx: (i.kEx || 1) * applied * best.scale, useLearning: false, useRecovery: false, weather: plan.weather || {} });
      betterPlan = { totalCarbs: p.plan.totalCarbs, stops: p.plan.stops.map((x) => ({ minute: x.minute, grams: x.grams })), lowest: p.plan.predicted.minDuring };
    } catch { /* not essential */ }
  }

  const notes = db.prepare('SELECT * FROM run_note WHERE session_id = ? ORDER BY COALESCE(minute, 9999), id').all(s.id);
  const bgAt = (minute) => { const p = m.series.filter((q) => q.bg != null).reduce((b, q) => (Math.abs(q.m - minute) < Math.abs((b?.m ?? 1e9) - minute) ? q : b), null); return p && Math.abs(p.m - minute) <= 10 ? p : null; };
  const trendAt = (minute) => { const p0 = bgAt(minute - 10), p1 = bgAt(minute); return p0 && p1 && p1.m > p0.m ? r1(((p1.bg - p0.bg) / (p1.m - p0.m)) * 10) : null; };

  const pace = km > 0 ? a.moving_time / 60 / km : null;
  const plannedPace = plan?.inputs?.averagePaceMinPerKm || null;
  const profile = runProfile({ distanceKm: km, intensity: plan?.profile?.intensity || intensityOf(a), climbPerKm: a.elevation && km ? a.elevation / km : (plan?.run?.gainM && km ? plan.run.gainM / km : 0) });

  // ---- findings, in plain words, from the numbers above ----
  const good = [], watch = [], learn = [];
  const fmtPace = (p) => `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, '0')} per km`;
  if (plan?.inputs?.startBg != null && st.bgStart != null) {
    const d = st.bgStart - plan.inputs.startBg;
    if (Math.abs(d) >= 1) watch.push(`You planned from ${plan.inputs.startBg} mmol/L but started at ${st.bgStart} - the plan was for a different start.`);
  }
  if (st.bgMin != null) (st.bgMin >= t.floor ? good : watch).push(st.bgMin >= t.floor ? `Stayed above your ${t.floor} floor (lowest ${st.bgMin}${st.bgMinAtMin != null ? ` at minute ${st.bgMinAtMin}` : ''}).` : `Went below your ${t.floor} floor: lowest ${st.bgMin}${st.bgMinAtMin != null ? ` at minute ${st.bgMinAtMin}` : ''}.`);
  if (plan?.predicted?.minDuring != null && st.bgMin != null) {
    const d = st.bgMin - plan.predicted.minDuring;
    if (Math.abs(d) >= 0.8) (d > 0 ? good : watch).push(`The plan predicted a lowest of ${plan.predicted.minDuring}; you actually reached ${st.bgMin} (${d > 0 ? 'higher' : 'lower'} by ${r1(Math.abs(d))}).`);
  }
  for (const x of timing) {
    if (!x.action) watch.push(`Stop at ${x.plannedMinute} min (${x.grams} g) wasn't recorded - mark it below so the review is right.`);
    else if (x.action === 'skipped') watch.push(`Skipped the ${x.grams ? `${x.grams} g` : `${x.ml} ml water`} stop planned at ${x.plannedMinute} min.`);
    else if (x.lateBy >= 3) watch.push(`Took the ${x.plannedMinute} min stop ${Math.round(x.lateBy)} minutes late (at ${Math.round(x.minute)} min).`);
    else if (x.lateBy <= -3) learn.push(`Took the ${x.plannedMinute} min stop ${Math.round(-x.lateBy)} minutes early.`);
  }
  if (timing.length && timing.every((x) => x.action === 'taken' && Math.abs(x.lateBy || 0) < 3)) good.push('Every carb stop was taken on time.');
  if (onTime && onTime.lowest - onTime.actualModelLowest >= 0.4) learn.push(`Taken exactly as planned, the model says your lowest would have been about ${onTime.lowest} instead of ${onTime.actualModelLowest}.`);
  if (fitOk && best.scale >= 1.15) learn.push(`Your glucose fell faster than the planner expected - exercise took about ${Math.round((best.scale - 1) * 100)}% more glucose than the model (even allowing for the carbs you actually took).`);
  else if (fitOk && best.scale <= 0.85) learn.push(`Your glucose held up better than the planner expected - about ${Math.round((1 - best.scale) * 100)}% less exercise uptake than the model.`);
  else if (fitOk) good.push('The planner\'s model matched how your glucose actually moved (within about 15%).');
  const highest = obsRun.length ? Math.max(...obsRun.map((p) => p.bg)) : null;
  const rose = st.bgStart != null && obsRun.length >= 4 && highest - st.bgStart >= 1.5;
  if (rose) learn.push(`Your glucose rose during the run (from ${st.bgStart} to a high of ${highest}) - typical of hard efforts, when adrenaline makes the liver release glucose. The planner only models glucose being used up, so runs like this are kept out of the learning for now.`);
  else if (!fitOk) learn.push(obsRun.length < 6 ? 'Too few glucose readings during the run to measure the model against it.' : 'The model didn\'t fit this run closely, so it isn\'t used for learning (it\'s still shown for you to look at).');
  if (betterPlan) learn.push(`With what this run showed, the plan would have been ${betterPlan.totalCarbs} g: ${betterPlan.stops.map((x) => `${x.grams} g at ${x.minute} min`).join(', ') || 'no stops'}.`);
  if (pace && plannedPace) {
    const d = (pace - plannedPace) / plannedPace;
    if (d <= -0.05) learn.push(`You ran faster than planned (${fmtPace(pace)} against ${fmtPace(plannedPace)}) - faster running uses glucose faster.`);
    else if (d >= 0.07) learn.push(`You ran slower than planned (${fmtPace(pace)} against ${fmtPace(plannedPace)}).`);
  }
  if (postResidual != null && postResidual <= -0.8) watch.push(`After the run you dropped about ${r1(-postResidual)} mmol/L more than the model expects.`);
  // after the finish: lowest point in the first hour, then the highest after it - the post-run spike
  let postRun = null;
  const postPts = m.series.filter((p) => p.bg != null && p.m >= dur && p.m <= dur + 120);
  if (postPts.length >= 8 && st.bgEnd != null) {
    const early = postPts.filter((p) => p.m <= dur + 60);
    const trough = early.reduce((b, p) => (p.bg < b.bg ? p : b), early[0]);
    const later = postPts.filter((p) => p.m >= trough.m);
    const peak = later.reduce((b, p) => (p.bg > b.bg ? p : b), later[0]);
    const loopUnits = (m.events || []).filter((e) => e.type === 'bolus' && e.m >= dur && e.m <= dur + 120).reduce((n, e) => n + (e.units || 0), 0);
    const mealG = (m.events || []).filter((e) => e.type === 'carbs' && e.m > dur && e.m <= dur + 120).reduce((n, e) => n + e.grams, 0)
      + db.prepare('SELECT COALESCE(SUM(grams), 0) n FROM carb_log WHERE at > ? AND at <= ?').get(startMs + dur * 60000, startMs + (dur + 120) * 60000).n;
    const iobPeak = m.series.find((p) => p.m >= peak.m && p.iob != null)?.iob ?? null;
    const last = postPts[postPts.length - 1];
    postRun = {
      end: st.bgEnd, trough: trough.bg, troughAt: trough.m - dur, peak: peak.bg, peakAt: peak.m - dur, rise: r1(peak.bg - trough.bg),
      loopUnits: r2(loopUnits), iobAtPeak: iobPeak, mealAfterG: Math.round(mealG), last: last.bg, lastAt: last.m - dur,
      settled: peak.bg - last.bg >= 1, stillRising: last.m === peak.m && peak.bg - trough.bg >= 1,
    };
    if (postRun.rise >= 1) watch.push(`After the finish you dipped to ${postRun.trough} (${postRun.troughAt} min after), then rose ${postRun.rise} to ${postRun.peak} by ${postRun.peakAt} min after${postRun.stillRising ? ' and were still rising when the 2 hours ran out' : postRun.settled ? `, settling to ${postRun.last}` : ''}. Your loop gave ${postRun.loopUnits} U in those 2 hours${postRun.mealAfterG ? ` (and ${postRun.mealAfterG} g of food was logged, which explains some of it)` : ''}.`);
  }

  // a rise after stopping is not the model being wrong: say which of the usual causes fit this run
  const postHigh = obsPost.length ? Math.max(...obsPost.map((p) => p.bg)) : null;
  if (postHigh != null && st.bgEnd != null && postHigh - st.bgEnd >= 1.5) {
    const lateCarbs = intakes.filter((x) => x.t >= dur - 30).reduce((n, x) => n + x.g, 0);
    const why = [
      lateCarbs ? `the tail of the ${lateCarbs} g you took in the last half hour still absorbing` : null,
      st.carbsGrams3hBefore >= 30 ? `slow carbs from the ${st.carbsGrams3hBefore} g eaten in the 3 hours before still coming through` : null,
      (profile.intensity === 'hard' || (s.effort ?? 0) >= 7 || (a.avg_hr ?? 0) >= 160) ? 'stress hormones from a hard effort (adrenaline tells the liver to release glucose faster than muscles now at rest use it)' : null,
    ].filter(Boolean);
    watch.push(`Glucose rose about ${r1(postHigh - st.bgEnd)} mmol/L after you stopped (to ${postHigh}). Likely: ${why.length ? why.join('; ') : 'carbs still absorbing, a pre-run meal or stress hormones - nothing in the data points to one'}. Usually settles on its own as the loop catches up - be wary of correcting hard, as the raised insulin sensitivity after a run can turn it into a late low.`);
  }
  if (st.post?.bgMin != null && st.post.bgMin < t.floor) watch.push(`Went down to ${st.post.bgMin} in the 2 hours after.`);
  for (const n of notes.filter((x) => x.minute != null)) {
    const p = bgAt(toRun(n.minute)), tr = trendAt(toRun(n.minute));
    if (p) learn.push(`At ${Math.round(n.minute)} min you noted "${n.text}" - glucose was ${p.bg}${tr != null ? `, ${tr < 0 ? 'falling' : 'rising'} ${Math.abs(tr)} per 10 minutes` : ''}.${/tired|heavy|legs|slow|walk|dizzy|shaky|wobbly|hypo|low/i.test(n.text) && tr != null && tr <= -0.5 ? ' Falling glucose may have played a part.' : ''}`);
  }
  if (s.effort && s.effort >= 8 && fitOk && best.scale >= 1.1) learn.push(`It felt hard (${s.effort}/10), and glucose fell faster than planned - harder efforts burn more.`);

  const series = (fn) => { const out = []; for (let x = 0; x <= dur + 120; x += 2) out.push([x, r1(fn(x))]); return out; };
  // the course by minute (even pace along the saved route), for the chart's course panel
  let elevation = null;
  const route = s.route_id ? getRoute(s.route_id) : null;
  if (route?.profile?.length && route.hasElevation !== false) {
    const totalKm = route.distanceKm || route.profile.at(-1)[0] || km;
    elevation = route.profile.filter((_, i, arr) => i % Math.max(1, Math.round(arr.length / 120)) === 0 || i === arr.length - 1)
      .map(([pk, ele]) => [r1((pk / totalKm) * dur), r2(pk), r1(ele)]);
  }
  return save({
    v: ANALYSIS_VERSION,
    available: true, quality: fitOk ? 'good' : 'low',
    iob: m.series.filter((p) => p.iob != null && p.m >= -30 && p.m <= dur + 120).map((p) => [p.m, p.iob]),
    elevation, routeName: route?.name || s.route_name || null,
    run: { id: a.id, name: a.name, day: a.day, km: r1(km), minutes: Math.round(a.moving_time / 60), durationMin: dur, pace: r2(pace), plannedPace: r2(plannedPace), plannedMinutes: plan?.run?.durationMin ?? null, avgHr: a.avg_hr ? Math.round(a.avg_hr) : null, climbM: a.elevation != null ? Math.round(a.elevation) : null, startOffsetMin: r1(offset) },
    profile, routeId: s.route_id, floor: t.floor, startTarget: t.startTarget,
    actual: m.series.filter((p) => p.bg != null && p.m >= -30 && p.m <= dur + 120).map((p) => [p.m, p.bg]),
    planned: plan?.prediction?.length ? plan.prediction.map(([x, bg]) => [r1(toRun(x)), bg]).filter(([x]) => x >= 0 && x <= dur + 120) : null,
    // the plan's model with what you actually did, and the same with the uptake that fits
    asModelled: series((x) => at(asModelled, x)), fitted: fitOk && Math.abs(best.scale - 1) >= 0.05 ? series((x) => at(fitted, x)) : null,
    intakesOnRunClock: rows.filter((x) => x.action === 'taken' && x.minute != null).map((x) => ({ minute: r1(toRun(x.minute)), grams: x.grams, ml: x.ml, plannedMinute: x.planned_minute != null ? r1(toRun(x.planned_minute)) : null })),
    plannedStops: plan?.stops ? plan.stops.map((x) => ({ minute: r1(toRun(x.minute)), grams: x.grams })) : [],
    stats: { start: st.bgStart, end: st.bgEnd, lowest: st.bgMin, lowestAt: st.bgMinAtMin, iobStart: st.iobStart, postLowest: st.post?.bgMin ?? null, fastestFall: st.fallPer10Min },
    // effective: the exercise uptake this run showed, in the planner's own units (1.0 = its standard default)
    fit: { scale: best.scale, applied, baseK, effective: r2(baseK * applied * best.scale), rmseModel: r2(err(asModelled, obsRun)), rmseFitted: r2(best.rmse), readings: obsRun.length },
    postResidual: r1(postResidual), postRun, accuracy: predictionAccuracy(plan, toRun, obsRun, st), timing, onTime, betterPlan,
    findings: { good, watch, learn },
  });
}

/** Everything the retrospective shows for one Strava run (made on first open, re-analysed when stale). */
export async function retrospective(activityId, { refresh = false, peek = false } = {}) {
  // peek: only what's already there (for printing) - never makes a new retrospective
  if (peek && !db.prepare('SELECT 1 FROM run_session WHERE activity_id = ?').get(Number(activityId))) return { none: true };
  let s = ensureSession(Number(activityId));
  if (refresh || !s.analysed_at || Date.now() - s.analysed_at > 6 * 3600000 || parse(s.analysis)?.v !== ANALYSIS_VERSION) {
    try { await analyseSession(s.id); } catch (err) { return { session: present(s), error: err.message }; }
    refreshLearnings();
    s = db.prepare('SELECT * FROM run_session WHERE id = ?').get(s.id);
  }
  return { session: present(s), analysis: parse(s.analysis), intakes: sessionIntakes(s.id), notes: db.prepare('SELECT * FROM run_note WHERE session_id = ? ORDER BY COALESCE(minute, 9999), id').all(s.id) };
}
// ---- plans as sent, kept against the route ----
function planSummary(s) {
  const p = parse(s.plan);
  if (!p) return null;
  return { startBg: p.inputs?.startBg ?? null, iob: p.inputs?.iob ?? null, minutes: p.run?.durationMin ?? null, stops: (p.stops || []).map((x) => ({ minute: x.minute, grams: x.grams })), totalCarbs: (p.stops || []).reduce((n, x) => n + (x.grams || 0), 0), lowest: p.predicted?.minDuring ?? null, hasChart: Boolean(p.chart) };
}

/** The plan's chart exactly as sent. Plans sent before charts were kept are redrawn from what was saved
 *  (inputs and carb stops), with the saved predicted line put back on top - marked as redrawn. */
export async function sessionChart(id) {
  const s = db.prepare('SELECT * FROM run_session WHERE id = ?').get(Number(id));
  const p = parse(s?.plan);
  if (!p) throw new Error('No plan was saved with this run.');
  const meta = { id: s.id, createdAt: s.created_at, startedAt: s.started_at, status: s.status, routeId: s.route_id, routeName: s.route_name, activityId: s.activity_id };
  if (p.chart) return { ...meta, chart: p.chart, redrawn: false };
  const i = p.inputs || {};
  const plan = await estimatePlan({
    ...(i.routeId && getRoute(i.routeId) ? { routeId: i.routeId } : { distanceKm: i.distanceKm }), paceMinPerKm: i.averagePaceMinPerKm, intensity: i.intensity,
    startBg: i.startBg, iob: i.iob, cob: i.cob, weightKg: i.weightKg ?? undefined, kEx: i.kEx, sensMult: i.sensMult, useLearning: false, useRecovery: false,
    customIntakes: (p.stops || []).map((x) => ({ t: x.minute, g: x.grams, kind: x.minute === 0 ? 'start' : 'run' })), weather: p.weather || {},
  });
  // the line, stops and drinks exactly as saved
  plan.prediction = p.prediction?.length ? p.prediction : plan.prediction;
  if (p.stops?.length) plan.plan.stops = p.stops;
  if (p.drinks?.length) plan.drinks = p.drinks;
  if (p.predicted) plan.plan.predicted = p.predicted;
  return { ...meta, chart: plan, redrawn: true };
}

/** Every plan sent for a route, newest first. */
export function routePlans(routeId) {
  return db.prepare("SELECT * FROM run_session WHERE route_id = ? AND kind = 'live' AND test = 0 AND plan IS NOT NULL ORDER BY created_at DESC LIMIT 30").all(Number(routeId))
    .map((s) => ({ id: s.id, createdAt: s.created_at, startedAt: s.started_at, status: s.status, activityId: s.activity_id, ...planSummary(s), accuracy: parse(s.analysis)?.accuracy || null }));
}

/** The run sent to the phone that's waiting or under way - what the phone is following right now. */
export async function currentSentPlan() {
  const id = Number(getSetting('run_session_current')) || null;
  const s = id ? db.prepare('SELECT * FROM run_session WHERE id = ?').get(id) : null;
  if (!s || s.test || !['armed', 'scheduled', 'started'].includes(s.status)) return null;
  const p = parse(s.plan);
  const dur = p?.run?.durationMin || 120;
  if (s.started_at && Date.now() > s.started_at + (dur + 60) * 60000) return null; // that run is over
  const c = await sessionChart(s.id);
  const reminders = (p?.stops || []).map((x) => ({ minute: x.minute, grams: x.grams, at: s.started_at ? s.started_at + x.minute * 60000 : null }));
  for (const d of (p?.drinks || []).filter((x) => !x.withCarbs)) reminders.push({ minute: d.minute, ml: d.ml, at: s.started_at ? s.started_at + d.minute * 60000 : null });
  reminders.sort((a, b) => a.minute - b.minute);
  return { ...c, reminders, waitingForTap: s.status === 'armed' };
}

/** The newest run on a route that has a retrospective, for the printed report. */
export async function latestRetrospectiveForRoute(routeId) {
  const s = db.prepare("SELECT activity_id FROM run_session WHERE route_id = ? AND test = 0 AND activity_id IS NOT NULL AND analysis IS NOT NULL ORDER BY started_at DESC LIMIT 1").get(Number(routeId));
  return s ? retrospective(s.activity_id) : { none: true };
}
const present = (s) => ({ id: s.id, kind: s.kind, status: s.status, createdAt: s.created_at, plan: planSummary(s), startedAt: s.started_at, routeId: s.route_id, routeName: s.route_name, activityId: s.activity_id, effort: s.effort, test: Boolean(s.test), hasPlan: Boolean(parse(s.plan)?.stops) });

// ---- learning across runs ----------------------------------------------------------------------------
// faster learning: 2 clear runs are enough for a lesson that means MORE carbs (the safer direction); lessons that
// mean fewer carbs need one more run and none of them below the floor
const MIN_RUNS = { route: 2, profile: 2, general: 2 };
const UPTAKE_RANGE = [0.5, 5]; // exercise uptake, 1.0 = the planner's standard default

function usableRuns() {
  return db.prepare("SELECT s.id, s.route_id, s.route_name, s.analysis FROM run_session s WHERE s.test = 0 AND s.analysis IS NOT NULL AND s.activity_id IS NOT NULL").all()
    .map((r) => ({ ...r, a: parse(r.analysis) })).filter((r) => r.a?.available);
}

function describe(scope, label, kind, value, runs, base = 1) {
  const where = scope === 'route' ? `on ${label}` : scope === 'profile' ? `on ${label} runs` : 'on your runs in general';
  if (kind === 'uptake') {
    const x = value / base;
    const how = x >= 1.95 ? `about ${Math.round(x * 10) / 10} times` : `about ${Math.round(Math.abs(x - 1) * 100)}% ${x >= 1 ? 'more' : 'less'}`;
    return x >= 1
      ? `${runs} runs ${where} used ${how} the glucose the planner currently expects. Plan with that uptake there - more carbs, and stops brought forward.`
      : `${runs} runs ${where} used ${how} glucose than the planner currently expects, and none went below your floor. Plan with that uptake there - slightly fewer carbs.`;
  }
  if (kind === 'post_carbs') return `Across ${runs} runs, in the 2 hours after, you dropped more than the model expects. Add about ${value} g to the refuel after each run.`;
  return '';
}

// Look at all analysed runs and make (or update) suggestions. Never changes the planner by itself.
export function refreshLearnings() {
  const runs = usableRuns();
  const good = runs.filter((r) => r.a.quality === 'good');
  const groups = [];
  const by = (fn) => { const m = new Map(); for (const r of good) { const k = fn(r); if (k == null) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };
  for (const [k, rs] of by((r) => r.route_id)) groups.push({ scope: 'route', key: String(k), label: getRoute(Number(k))?.name || rs[0].route_name || 'this route', rs });
  for (const [k, rs] of by((r) => r.a.profile?.key)) groups.push({ scope: 'profile', key: k, label: rs[0].a.profile.label, rs });
  if (good.length) groups.push({ scope: 'general', key: 'all', label: 'all runs', rs: good });
  const base = personalFit('Run').kEx || 1; // what the planner uses now, before lessons

  const upsert = (scope, key, kind, value, rs, text, extra = {}) => {
    const cur = db.prepare("SELECT * FROM run_learning WHERE scope = ? AND scope_key = ? AND kind = ? AND status IN ('suggested','accepted','dismissed') ORDER BY id DESC").all(scope, key, kind);
    const accepted = cur.find((x) => x.status === 'accepted');
    const pending = cur.find((x) => x.status === 'suggested');
    const dismissed = cur.find((x) => x.status === 'dismissed');
    const evidence = JSON.stringify({ sessions: rs.map((r) => r.id), values: rs.map((r) => extra.valueOf ? extra.valueOf(r) : null), label: extra.label || null });
    if (accepted && Math.abs(accepted.value - value) < (kind === 'uptake' ? 0.15 * accepted.value : 5)) { if (pending) db.prepare("UPDATE run_learning SET status = 'superseded' WHERE id = ?").run(pending.id); return; }
    if (dismissed && !pending && rs.length < dismissed.runs + 2) return; // dismissed: ask again only with more evidence
    if (pending) db.prepare('UPDATE run_learning SET value = ?, runs = ?, evidence = ?, text = ? WHERE id = ?').run(value, rs.length, evidence, text, pending.id);
    else db.prepare("INSERT INTO run_learning (scope, scope_key, kind, value, runs, evidence, text, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'suggested', ?)").run(scope, key, kind, value, rs.length, evidence, text, Date.now());
  };

  // exercise uptake, per route and per kind of run
  for (const g of groups) {
    if (g.rs.length < MIN_RUNS[g.scope]) continue;
    const vals = g.rs.map((r) => r.a.fit.effective).filter(Number.isFinite);
    if (vals.length < MIN_RUNS[g.scope]) continue;
    const med = median(vals);
    const x = med / base;
    const sameSide = vals.filter((v) => (x >= 1 ? v / base >= 1.05 : v / base <= 0.95)).length / vals.length;
    if (Math.abs(x - 1) < 0.12 || sameSide < 0.66) continue;
    // fewer carbs is the riskier direction: only with more runs and none below the floor
    if (x < 1 && (g.rs.length < MIN_RUNS[g.scope] + 1 || g.rs.some((r) => r.a.stats.lowest != null && r.a.stats.lowest < r.a.floor))) continue;
    const value = Math.round(Math.max(UPTAKE_RANGE[0], Math.min(UPTAKE_RANGE[1], med)) * 100) / 100;
    upsert(g.scope, g.key, 'uptake', value, g.rs, describe(g.scope, g.label, 'uptake', value, g.rs.length, base), { valueOf: (r) => r.a.fit.effective, label: g.label });
  }

  // after the run: consistently lower than the model in the 2 hours after
  const post = good.filter((r) => r.a.postResidual != null);
  if (post.length >= MIN_RUNS.general) {
    const med = median(post.map((r) => r.a.postResidual));
    if (med <= -0.8 && post.filter((r) => r.a.postResidual < -0.3).length / post.length >= 0.66) {
      const loop = getLoopSettings();
      const effect = (loop.isf ?? 1.6) / (loop.cr ?? 7.5); // mmol/L per gram of carbs
      const g = Math.max(5, Math.min(20, round5(-med / effect)));
      upsert('general', 'all', 'post_carbs', g, post, describe('general', '', 'post_carbs', g, post.length), { valueOf: (r) => r.a.postResidual });
    }
  }
  return listLearnings();
}

export function listLearnings() {
  const rows = db.prepare("SELECT * FROM run_learning WHERE status IN ('suggested','accepted') ORDER BY status DESC, created_at DESC").all()
    .map((r) => ({ ...r, evidence: parse(r.evidence), label: r.scope === 'route' ? (getRoute(Number(r.scope_key))?.name || 'route') : r.scope === 'profile' ? (parse(r.evidence)?.label || r.scope_key.replace(/\|/g, ', ')) : 'all runs' }));
  const runs = usableRuns();
  const profiles = new Map();
  for (const r of runs) {
    const p = r.a.profile; if (!p) continue;
    const e = profiles.get(p.key) || { key: p.key, label: p.label, runs: 0, good: 0, effective: [] };
    e.runs++; if (r.a.quality === 'good') { e.good++; e.effective.push(r.a.fit.effective); }
    profiles.set(p.key, e);
  }
  const sessions = db.prepare("SELECT s.*, a.name AS activity_name, a.day AS activity_day FROM run_session s LEFT JOIN strava_activities a ON a.id = s.activity_id WHERE s.test = 0 AND s.status != 'cancelled' ORDER BY COALESCE(s.started_at, s.created_at) DESC LIMIT 30").all()
    .map((s) => { const an = parse(s.analysis); return { id: s.id, kind: s.kind, status: s.status, startedAt: s.started_at, routeName: s.route_name, activityId: s.activity_id, activityName: s.activity_name, day: s.activity_day, quality: an?.quality || null, lowest: an?.stats?.lowest ?? null, effective: an?.fit?.effective ?? null, profile: an?.profile?.label || null, accuracy: an?.accuracy?.pct ?? null }; });
  return {
    suggestions: rows.filter((r) => r.status === 'suggested'),
    accepted: rows.filter((r) => r.status === 'accepted'),
    profiles: [...profiles.values()].map((p) => ({ ...p, medianEffective: r2(median(p.effective)), effective: undefined })).sort((x, y) => y.runs - x.runs),
    sessions, minRuns: MIN_RUNS, postRun: postRunPattern(), refuel: refuelStatus(),
    accuracy: usableRuns().filter((r) => r.a.accuracy).map((r) => ({ id: r.id, day: r.a.run.day, name: r.a.run.name, routeName: r.route_name, ...r.a.accuracy }))
      .sort((x, y) => String(x.day).localeCompare(String(y.day))),
  };
}

export function decideLearning(id, decision) {
  const l = db.prepare('SELECT * FROM run_learning WHERE id = ?').get(Number(id));
  if (!l) throw new Error('Not found.');
  if (decision === 'accept') {
    db.prepare("UPDATE run_learning SET status = 'superseded', decided_at = ? WHERE scope = ? AND scope_key = ? AND kind = ? AND status = 'accepted'").run(Date.now(), l.scope, l.scope_key, l.kind);
    db.prepare("UPDATE run_learning SET status = 'accepted', decided_at = ? WHERE id = ?").run(Date.now(), l.id);
    proposeRulebookFinding(l);
  } else if (decision === 'dismiss') db.prepare("UPDATE run_learning SET status = 'dismissed', decided_at = ? WHERE id = ?").run(Date.now(), l.id);
  else if (decision === 'retire') db.prepare("UPDATE run_learning SET status = 'retired', decided_at = ? WHERE id = ?").run(Date.now(), l.id);
  else throw new Error('Accept, dismiss or retire.');
  return listLearnings();
}

/** What the planner applies: the route's own lesson first, else the kind of run's; post-run carbs in general. */
export function learnedAdjustments({ routeId = null, profileKey = null, baseKEx = 1 }) {
  const get = (scope, key, kind) => db.prepare("SELECT * FROM run_learning WHERE scope = ? AND scope_key = ? AND kind = ? AND status = 'accepted' ORDER BY decided_at DESC LIMIT 1").get(scope, String(key), kind);
  const applied = [];
  let uptakeMult = 1, postCarbsExtra = 0;
  const u = (routeId != null ? get('route', routeId, 'uptake') : null) || (profileKey ? get('profile', profileKey, 'uptake') : null) || get('general', 'all', 'uptake');
  if (u) {
    uptakeMult = u.value / (baseKEx || 1);
    const x = uptakeMult;
    applied.push({ id: u.id, scope: u.scope, kind: 'uptake', value: u.value, runs: u.runs, text: `Exercise uptake ${x >= 1.95 ? `x${Math.round(x * 10) / 10}` : `${x >= 1 ? '+' : '-'}${Math.round(Math.abs(x - 1) * 100)}%`}, learned from ${u.runs} ${u.scope === 'route' ? 'runs on this route' : u.scope === 'profile' ? 'runs like this one' : 'of your runs'}.` });
  }
  const pc = get('general', 'all', 'post_carbs');
  if (pc) { postCarbsExtra = pc.value; applied.push({ id: pc.id, scope: 'general', kind: 'post_carbs', value: pc.value, runs: pc.runs, text: `+${pc.value} g refuel after the run, learned from ${pc.runs} runs.` }); }
  return { uptakeMult, postCarbsExtra, applied };
}

// The spike after runs, across your runs: how big, how soon, what the loop did - and, once 3 runs show it, a
// conservative correction estimate. Simon asked for units (with the caveat); this is the ONLY place IMS gives an
// insulin figure. It comes from his own observed rises and his loop's ISF, never from the planner's prediction,
// at about half a usual correction (post-exercise guidance, Riddell 2017), excluding runs with food logged after.
export function postRunPattern() {
  const runs = usableRuns().filter((r) => r.a.postRun && r.a.postRun.rise != null && !(r.a.postRun.mealAfterG >= 15));
  const loop = getLoopSettings();
  const isf = loop.isf || null;
  const all = runs.map((r) => ({ id: r.id, day: r.a.run.day, name: r.a.run.name, hard: r.a.profile?.intensity === 'hard', ...r.a.postRun }));
  const summarise = (rs) => {
    if (!rs.length) return null;
    const rise = median(rs.map((x) => x.rise)), peakAt = median(rs.map((x) => x.peakAt)), loopU = median(rs.map((x) => x.loopUnits || 0));
    const spikes = rs.filter((x) => x.rise >= 2);
    const out = { runs: rs.length, spikes: spikes.length, rise: r1(rise), peakAt: Math.round(peakAt), peak: r1(median(rs.map((x) => x.peak))), loopUnits: r2(loopU), settledByThemselves: rs.filter((x) => x.settled).length };
    if (isf && rs.length >= 3 && rise >= 2) {
      const full = rise / isf;
      out.units = { full: r1(full), conservative: Math.round(full * 0.5 * 10) / 10, isf };
    }
    return out;
  };
  const overall = summarise(all);
  const hard = summarise(all.filter((x) => x.hard));
  return {
    runs: all.slice(-12).reverse(), overall, hard: hard && hard.runs >= 3 ? hard : null, isf, needRuns: 3,
    caveat: 'An estimate from your own past runs and your AAPS ISF. Your insulin sensitivity stays raised for hours after a run, so: only correct once the rise is clearly happening (not at the finish, and never if you are falling or about to eat); take off any insulin still on board (your AAPS bolus wizard does this); remember the loop is already adding its own corrections, so a manual bolus on top can stack; and watch for a low 2-8 hours later and overnight.',
  };
}

// Refuelled since the last run? Glycogen the run used (from its energy cost and how hard it was) plus an everyday
// baseline, against the carbs logged since (IMS carb log and carbs entered in AAPS / Nightscout). Only logged
// carbs count, so meals you don't enter make it read short.
export function refuelStatus() {
  const t = getTargets();
  const kg = t.weightKg || 70;
  const run = db.prepare(`SELECT id, name, start_utc, distance, moving_time, elapsed_time, avg_hr, session_tag FROM strava_activities WHERE sport IN ${RUN_SPORTS} ORDER BY start_utc DESC LIMIT 1`).get();
  if (!run) return null;
  const end = Date.parse(run.start_utc) + (run.elapsed_time || run.moving_time || 0) * 1000;
  const km = run.distance / 1000;
  const intensity = intensityOf(run);
  const carbShare = intensity === 'hard' ? 0.8 : intensity === 'easy' ? 0.55 : 0.65;
  const kcal = kg * km * 1.0;
  const usedG = Math.round((kcal * carbShare) / 4);
  const hours = Math.max(0, (Date.now() - end) / 3600000);
  const baselineG = Math.round(3 * kg * (hours / 24)); // ~3 g per kg a day for everyday life and light training (IOC / ACSM)
  const logged = db.prepare("SELECT at, grams FROM carb_log WHERE at > ?").all(end);
  const aaps = db.prepare("SELECT at, carbs AS grams FROM ns_treatments WHERE at > ? AND carbs > 0").all(end);
  // the same food logged in both: count once (within 20 minutes and similar grams)
  const aapsOnly = aaps.filter((x) => !logged.some((l) => Math.abs(l.at - x.at) <= 20 * 60000 && Math.abs(l.grams - x.grams) <= Math.max(5, 0.2 * x.grams)));
  const eatenG = Math.round(logged.reduce((n, x) => n + x.grams, 0) + aapsOnly.reduce((n, x) => n + x.grams, 0));
  const targetG = usedG + baselineG;
  const pct = targetG ? Math.round((eatenG / targetG) * 100) : null;
  return {
    run: { id: run.id, name: run.name, endedAt: end, km: r1(km), intensity }, hoursSince: r1(hours),
    usedG, baselineG, targetG, eatenG, pct, shortG: Math.max(0, targetG - eatenG), weightAssumed: !t.weightKg,
    sources: { imsLog: logged.length, aaps: aapsOnly.length },
    text: pct == null ? '' : pct >= 90
      ? `Since ${run.name} (${r1(hours)} hours ago) you've logged about ${eatenG} g of carbs against roughly ${targetG} g to replace what the run used (${usedG} g) and cover the time since (${baselineG} g) - topped up.`
      : `Since ${run.name} (${r1(hours)} hours ago) you've logged about ${eatenG} g of carbs against roughly ${targetG} g to replace what the run used (${usedG} g) and cover the time since (${baselineG} g) - about ${Math.max(0, targetG - eatenG)} g short. Low glycogen means you lean more on blood glucose next run: more carbs during it, or eat before.`,
    note: `Only carbs logged in IMS or entered in AAPS are counted.${!t.weightKg ? ' Assumes 70 kg - add your weight under Targets.' : ''}`,
  };
}

// A lesson that holds across routes is worth writing into the rulebook - offered as a finding to approve there.
function proposeRulebookFinding(l) {
  if (l.scope === 'route') return;
  const ev = parse(l.evidence) || {};
  const sessions = (ev.sessions || []).map((id) => db.prepare('SELECT route_id FROM run_session WHERE id = ?').get(id)?.route_id).filter((x) => x != null);
  if (l.runs < 4 || new Set(sessions).size < 2) return;
  const title = l.kind === 'uptake' ? `Personal glucose use on ${l.scope === 'profile' ? (ev.label || l.scope_key.replace(/\|/g, ', ')) : 'all'} runs` : 'Personal post-run refuel';
  const proposed = l.kind === 'uptake'
    ? `* **${title}:** From ${l.runs} of my own runs across ${new Set(sessions).size} routes (IMS run learning), ${ev.label || 'these'} runs use about ${Math.round(Math.abs(l.value - 1) * 100)}% ${l.value >= 1 ? 'more' : 'less'} glucose than the standard model - plan carbs ${l.value >= 1 ? 'higher and earlier' : 'slightly lower'} for them.`
    : `* **${title}:** From ${l.runs} of my own runs (IMS run learning), glucose drops more than expected in the 2 hours after - add about ${l.value} g to the post-run refuel.`;
  const id = `learn_${l.id}`;
  if (db.prepare('SELECT 1 FROM t1d_rulebook_findings WHERE id = ?').get(id)) return;
  try {
    db.prepare(`INSERT INTO t1d_rulebook_findings (id, book_id, book_title, type, section_target, title, current_rule, book_recommendation, citation, explanation, suggested_action, proposed_text, status)
      VALUES (?, NULL, 'Your own runs (IMS learning)', 'refinement', ?, ?, NULL, ?, 'IMS run retrospectives', ?, 'add', ?, 'pending')`)
      .run(id, l.kind === 'uptake' ? '4. In-Run Fueling Strategy & Elevation Adaptation' : '5. Post-Run Recovery & Late-Onset Nocturnal Hypo Defense', title, l.text, `Accepted in the Run Planner's Learning tab, from ${l.runs} runs with matched glucose data. Personal pattern-spotting from logged run data.`, proposed);
  } catch { /* rulebook not set up */ }
}

// Every 15 minutes: link sent runs to their Strava activity, and analyse them.
let ticker = null;
// Run by the scheduler ('run_learning_tick' in index.js).
export async function tickRunLearning() {
  const ids = await linkSessions();
  if (ids.length) await refreshLearnings();
  return { linked: ids.length };
}
export function startRunLearning() {
  if (ticker) return;
  const tick = () => tickRunLearning().catch((err) => console.warn('[run learning]', err.message));
  ticker = setInterval(tick, 15 * 60000);
  setTimeout(tick, 60000);
}

/** For Ims: a note on the most recent run ("felt tired halfway"). */
export function noteOnLatestRun({ text, minute = null }) {
  let s = db.prepare("SELECT * FROM run_session WHERE test = 0 AND status NOT IN ('cancelled','armed','no_run') AND started_at IS NOT NULL AND started_at < ? ORDER BY started_at DESC LIMIT 1").get(Date.now());
  const a = db.prepare(`SELECT id, start_utc FROM strava_activities WHERE sport IN ${RUN_SPORTS} ORDER BY start_utc DESC LIMIT 1`).get();
  // a more recent Strava run than the last sent one: note it on that run instead
  if (a && (!s || Date.parse(a.start_utc) > (s.started_at || 0) + 3 * 3600000)) s = ensureSession(a.id);
  if (!s) throw new Error('No run found to add the note to.');
  addNote(s.id, { text, minute });
  return { run: s.route_name || 'your last run', when: s.started_at ? new Date(s.started_at).toISOString() : null };
}
