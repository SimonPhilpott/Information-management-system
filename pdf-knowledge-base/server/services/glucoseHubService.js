import db, { getSetting, setSetting } from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI, readGeminiJson } from './geminiClient.js';
import { getModelFor } from './modelRegistry.js';
import { stripMedicalDisclaimers } from './disclaimerSanitizer.js';
import crypto from 'crypto';
import { encryptSecret, decryptSecret } from './wifiService.js';
import { getDeviceIcons } from './calendarService.js';

// The blood sugar service: everything is worked out from the local copy of Nightscout
// (ns_entries / ns_treatments / ns_devicestatus, filled every minute by glucoseService and
// every 5 minutes by runGlucoseService), so Ims and the page never need to ask Nightscout.
// Ranges follow the international consensus on CGM time in range (Battelino et al., 2019).
// It never gives insulin doses - observations and pattern ideas are given directly without disclaimers.

const MGDL = 18.0182;
export const DEFAULT_GLUCOSE_THRESHOLDS = {
  veryLow: 3.0,
  low: 3.9,
  personalLow: 4.5,
  personalHigh: 7.8,
  tightHigh: 7.8, // alias for backward compatibility
  high: 10.0,
  veryHigh: 13.9
};
const THRESHOLDS_KEY = 'glucose_target_thresholds';

export function getGlucoseThresholds() {
  try {
    const raw = getSetting(THRESHOLDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const personalHigh = Number(parsed.personalHigh || parsed.tightHigh) || DEFAULT_GLUCOSE_THRESHOLDS.personalHigh;
      return {
        veryLow: Number(parsed.veryLow) || DEFAULT_GLUCOSE_THRESHOLDS.veryLow,
        low: Number(parsed.low) || DEFAULT_GLUCOSE_THRESHOLDS.low,
        personalLow: Number(parsed.personalLow) || DEFAULT_GLUCOSE_THRESHOLDS.personalLow,
        personalHigh: personalHigh,
        tightHigh: personalHigh, // backwards compatibility alias
        high: Number(parsed.high) || DEFAULT_GLUCOSE_THRESHOLDS.high,
        veryHigh: Number(parsed.veryHigh) || DEFAULT_GLUCOSE_THRESHOLDS.veryHigh
      };
    }
  } catch (_) { /* fallback */ }
  return { ...DEFAULT_GLUCOSE_THRESHOLDS };
}

export function setGlucoseThresholds(thresholds) {
  if (!thresholds || typeof thresholds !== 'object') throw new Error('Invalid thresholds payload');
  const veryLow = Math.max(2.0, Math.min(6.0, r1(Number(thresholds.veryLow) || DEFAULT_GLUCOSE_THRESHOLDS.veryLow)));
  const low = Math.max(veryLow + 0.1, Math.min(8.0, r1(Number(thresholds.low) || DEFAULT_GLUCOSE_THRESHOLDS.low)));
  const personalLow = Math.max(low, Math.min(9.5, r1(Number(thresholds.personalLow) || DEFAULT_GLUCOSE_THRESHOLDS.personalLow)));
  const personalHigh = Math.max(personalLow + 0.1, Math.min(15.0, r1(Number(thresholds.personalHigh || thresholds.tightHigh) || DEFAULT_GLUCOSE_THRESHOLDS.personalHigh)));
  const high = Math.max(personalHigh, Math.min(18.0, r1(Number(thresholds.high) || DEFAULT_GLUCOSE_THRESHOLDS.high)));
  const veryHigh = Math.max(high + 0.5, Math.min(25.0, r1(Number(thresholds.veryHigh) || DEFAULT_GLUCOSE_THRESHOLDS.veryHigh)));

  const updated = {
    veryLow,
    low,
    personalLow,
    personalHigh,
    tightHigh: personalHigh,
    high,
    veryHigh
  };
  setSetting(THRESHOLDS_KEY, JSON.stringify(updated));
  return updated;
}

export function resetGlucoseThresholds() {
  setSetting(THRESHOLDS_KEY, JSON.stringify(DEFAULT_GLUCOSE_THRESHOLDS));
  return { ...DEFAULT_GLUCOSE_THRESHOLDS };
}

const RUN_SPORTS = ['Run', 'TrailRun', 'VirtualRun', 'Walk', 'Hike', 'Ride', 'Swim', 'Workout'];
const r1 = (x) => Math.round(x * 10) / 10;
const mmol = (sgv) => sgv / MGDL;

db.exec(`CREATE TABLE IF NOT EXISTS carb_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, grams REAL NOT NULL, food TEXT, source TEXT DEFAULT 'voice'
)`);

const london = (t, opts) => new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/London', ...opts });
const londonDay = (t) => london(t, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
const londonHour = (t) => Number(london(t, { hour: '2-digit', hourCycle: 'h23' }));

// Midnight (London) of a YYYY-MM-DD day, as epoch ms.
function dayStart(day) {
  const guess = Date.parse(`${day}T00:00:00Z`);
  for (const off of [0, -3600000, 3600000]) if (londonDay(guess + off) === day && londonHour(guess + off) === 0) return guess + off;
  return guess;
}

function readings(from, to) {
  return db.prepare('SELECT date AS t, sgv, direction FROM ns_entries WHERE date >= ? AND date < ? ORDER BY date').all(from, to)
    .map((e) => ({ t: e.t, v: r1(mmol(e.sgv)), direction: e.direction }));
}

// Time-in-range and the other consensus numbers for a set of readings.
function statsOf(rs, spanMs) {
  if (!rs.length) return null;
  const th = getGlucoseThresholds();
  const vals = rs.map((r) => r.v);
  const n = vals.length;
  const mean = vals.reduce((a, v) => a + v, 0) / n;
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
  const pct = (f) => Math.round((vals.filter(f).length / n) * 1000) / 10;
  const expected = spanMs / (5 * 60000);
  const pLow = th.personalLow || 4.5;
  const pHigh = th.personalHigh || th.tightHigh || 7.8;
  return {
    readings: n,
    coveragePct: Math.min(100, Math.round((n / Math.max(1, expected)) * 100)),
    hours: r1(spanMs / 3600000),
    mean: r1(mean), sd: r1(sd), cvPct: Math.round((sd / mean) * 100),
    gmiPct: r1(3.31 + 0.02392 * mean * MGDL), // estimated HbA1c
    min: Math.min(...vals), max: Math.max(...vals),
    veryLowPct: pct((v) => v < th.veryLow),
    lowPct: pct((v) => v >= th.veryLow && v < th.low),
    inRangePct: pct((v) => v >= th.low && v <= th.high),
    personalTargetPct: pct((v) => v >= pLow && v <= pHigh),
    tightPct: pct((v) => v >= pLow && v <= pHigh), // backward compatibility
    lowSidePct: pct((v) => v >= th.low && v < pLow),
    highSidePct: pct((v) => v > pHigh && v <= th.high),
    highPct: pct((v) => v > th.high && v <= th.veryHigh),
    veryHighPct: pct((v) => v > th.veryHigh),
    thresholds: th,
  };
}

// Stretches below the low threshold lasting 15 minutes or more (the consensus definition of a hypo event).
function lowEvents(rs) {
  const out = [];
  const th = getGlucoseThresholds();
  let cur = null;
  for (const r of rs) {
    if (r.v < th.low) {
      if (!cur || r.t - cur.last > 20 * 60000) { if (cur) out.push(cur); cur = { start: r.t, last: r.t, lowest: r.v }; }
      cur.last = r.t; cur.lowest = Math.min(cur.lowest, r.v);
    } else if (cur && r.t - cur.last > 0) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.filter((e) => e.last - e.start >= 15 * 60000 - 60000).map((e) => {
    const act = db.prepare(`SELECT name, sport, start_utc, moving_time FROM strava_activities WHERE start_utc IS NOT NULL ORDER BY start_utc DESC`).all()
      .find((a) => { const s = Date.parse(a.start_utc), end = s + (a.moving_time || 0) * 1000; return e.start >= s && e.start - end <= 6 * 3600000; });
    return {
      start: e.start, minutes: Math.round((e.last - e.start) / 60000) + 5, lowest: e.lowest,
      when: london(e.start, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
      overnight: londonHour(e.start) < 6,
      afterExercise: act ? `${act.sport} "${act.name}"` : null,
    };
  });
}

// Median and spread for each hour of the day (the ambulatory glucose profile).
function hourlyProfile(rs) {
  const buckets = Array.from({ length: 24 }, () => []);
  for (const r of rs) buckets[londonHour(r.t)].push(r.v);
  const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i); return r1(s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo)); };
  return buckets.map((b, hour) => (b.length >= 3 ? { hour, n: b.length, p10: q(b, 0.1), p25: q(b, 0.25), median: q(b, 0.5), p75: q(b, 0.75), p90: q(b, 0.9) } : { hour, n: b.length }));
}

function insulinAndCarbs(from, to) {
  const t = db.prepare('SELECT COALESCE(SUM(insulin),0) AS bolus, COALESCE(SUM(carbs),0) AS carbs FROM ns_treatments WHERE at >= ? AND at < ?').get(from, to);
  // Carbs sent to Nightscout come back in ns_treatments; only count the ones that haven't yet.
  const logged = db.prepare('SELECT COALESCE(SUM(grams),0) AS g FROM carb_log WHERE at >= ? AND at < ? AND (ns_id IS NULL OR ns_id NOT IN (SELECT id FROM ns_treatments))').get(from, to).g;
  return { bolusUnits: r1(t.bolus), carbsG: Math.round(t.carbs + logged) };
}

export function getCurrent() {
  const e = db.prepare('SELECT date, sgv, direction FROM ns_entries ORDER BY date DESC LIMIT 1').get();
  if (!e) return null;
  const prev = db.prepare('SELECT date, sgv FROM ns_entries WHERE date <= ? ORDER BY date DESC LIMIT 1').get(e.date - 4 * 60000);
  const d = db.prepare('SELECT at, iob, cob FROM ns_devicestatus ORDER BY at DESC LIMIT 1').get();
  const mins = Math.round((Date.now() - e.date) / 60000);
  const v = r1(mmol(e.sgv));
  const th = getGlucoseThresholds();
  const pLow = th.personalLow || 4.5;
  const pHigh = th.personalHigh || th.tightHigh || 7.8;

  let range = 'in range';
  if (v < th.veryLow) range = 'very low';
  else if (v < th.low) range = 'low';
  else if (v < pLow) range = 'on the low side of in range';
  else if (v <= pHigh) range = 'in range';
  else if (v <= th.high) range = 'on the high side of in range';
  else if (v <= th.veryHigh) range = 'high';
  else range = 'very high';

  return {
    value: v, direction: e.direction || null, minutesAgo: mins, fresh: mins <= 15,
    delta: prev ? r1(v - mmol(prev.sgv)) : null,
    range,
    iob: d && Date.now() - d.at < 20 * 60000 ? r1(Math.max(0, d.iob)) : null,
    cob: d && Date.now() - d.at < 20 * 60000 && d.cob != null ? Math.round(d.cob) : null,
    thresholds: th,
  };
}

function dataSince() {
  const r = db.prepare('SELECT MIN(date) AS a FROM ns_entries').get();
  return r?.a || null;
}

export function getDeviceChangeStatus() {
  const icons = getDeviceIcons() || [];
  const podIcon = icons.find((i) => i.icon === 'pod');
  const sensorIcon = icons.find((i) => i.icon === 'sensor');
  const rxIcon = icons.find((i) => i.icon === 'prescription');
  return {
    icons,
    omnipodChangeDueToday: Boolean(podIcon),
    sensorChangeDueToday: Boolean(sensorIcon && sensorIcon.color === 'white'),
    sensorChangeDueTomorrow: Boolean(sensorIcon && sensorIcon.color === 'orange'),
    prescriptionDueToday: Boolean(rxIcon)
  };
}

export function getSummary(days = 14) {
  days = Math.max(1, Math.min(90, Number(days) || 14));
  const to = Date.now();
  const since = dataSince();
  const from = Math.max(to - days * 86400000, since || to);
  const rs = readings(from, to);
  const stats = statsOf(rs, to - from);
  const prevFrom = from - (to - from);
  const prevStats = statsOf(readings(prevFrom, from), to - from);
  const dev = getDeviceChangeStatus();
  return {
    days, from, to, dataSince: since,
    current: getCurrent(),
    stats, previous: prevStats,
    profile: hourlyProfile(rs),
    lows: lowEvents(rs).reverse(),
    totals: insulinAndCarbs(from, to),
    overnight: getOvernight(),
    thresholds: getGlucoseThresholds(),
    deviceStatus: dev,
    deviceIcons: dev.icons
  };
}

// Last night, midnight to 6am.
export function getOvernight() {
  const today = londonDay(Date.now());
  const from = dayStart(today), to = from + 6 * 3600000;
  if (Date.now() < to - 5 * 3600000) return null;
  const rs = readings(from, Math.min(to, Date.now()));
  const s = statsOf(rs, Math.min(to, Date.now()) - from);
  if (!s || s.coveragePct < 40) return null;
  return { inRangePct: s.inRangePct, mean: s.mean, min: s.min, max: s.max, lows: lowEvents(rs).length, endValue: rs[rs.length - 1].v, thresholds: s.thresholds };
}

export function getDay(day) {
  day = /^\d{4}-\d{2}-\d{2}$/.test(day || '') ? day : londonDay(Date.now());
  const from = dayStart(day), to = from + 24 * 3600000 + (dayStart(day) === from ? 0 : 0);
  const rs = readings(from, to);
  const treatments = db.prepare('SELECT at, event, insulin, carbs FROM ns_treatments WHERE at >= ? AND at < ? AND (insulin > 0 OR carbs > 0) ORDER BY at').all(from, to);
  const carbs = db.prepare('SELECT id, at, grams, food FROM carb_log WHERE at >= ? AND at < ? AND (ns_id IS NULL OR ns_id NOT IN (SELECT id FROM ns_treatments)) ORDER BY at').all(from, to);
  const activities = db.prepare('SELECT id, name, sport, start_utc, moving_time, distance FROM strava_activities WHERE start_utc IS NOT NULL').all()
    .map((a) => ({ ...a, start: Date.parse(a.start_utc), end: Date.parse(a.start_utc) + (a.moving_time || 0) * 1000 }))
    .filter((a) => a.end >= from && a.start < to)
    .map((a) => ({ id: a.id, name: a.name, sport: a.sport, start: a.start, end: a.end, km: r1((a.distance || 0) / 1000) }));
  const iob = db.prepare('SELECT at, iob FROM ns_devicestatus WHERE at >= ? AND at < ? ORDER BY at').all(from, to).map((d) => ({ t: d.at, iob: r1(Math.max(0, d.iob)) }));
  return { day, from, to, readings: rs, stats: statsOf(rs, Math.min(to, Date.now()) - from), treatments, carbs, activities, iob, lows: lowEvents(rs), thresholds: getGlucoseThresholds() };
}

// ---- carb log (by voice or on the page), sent to Nightscout as an informational Note (AAPS handles bolus & treatments) ---------------
const NS_BASE = 'https://simon-philpott-nightscout.herokuapp.com';
const NS_SECRET_KEY = 'nightscout_api_secret';
try { db.exec('ALTER TABLE carb_log ADD COLUMN ns_id TEXT'); } catch (_) { /* already there */ }
try { db.exec('ALTER TABLE carb_log ADD COLUMN ns_identifier TEXT'); } catch (_) { /* already there */ }
try { db.exec('ALTER TABLE carb_log ADD COLUMN insulin REAL'); } catch (_) { /* already there */ }

export function getNightscoutWriteStatus() { return { configured: Boolean(getSetting(NS_SECRET_KEY)) }; }
export function setNightscoutSecret(secret) {
  const v = String(secret || '').trim();
  if (v && v.length < 12) throw new Error('The Nightscout API secret is at least 12 characters.');
  setSetting(NS_SECRET_KEY, v ? JSON.stringify(encryptSecret(v)) : '');
  return getNightscoutWriteStatus();
}
function nsSecretHash() {
  const blob = getSetting(NS_SECRET_KEY);
  if (!blob) return null;
  return crypto.createHash('sha1').update(decryptSecret(JSON.parse(blob))).digest('hex');
}
export async function testNightscoutWrite() {
  const h = nsSecretHash();
  if (!h) throw new Error('No API secret saved.');
  const res = await fetch(`${NS_BASE}/api/v1/verifyauth`, { headers: { 'api-secret': h, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  const d = await res.json().catch(() => ({}));
  const m = d.message && typeof d.message === 'object' ? d.message : d;
  if (!(m.canWrite === true || m.message === 'OK')) throw new Error('Nightscout did not accept that API secret - check it matches API_SECRET in Heroku.');
  return { ok: true };
}
// Carbs / meal notes go in through Nightscout's API v3, not v1. AAPS's NSClient syncs with v3, which only
// sees records that have srvModified. IMS has its own "IMS" subject with a narrow "ims" role
// (treatments only), created here with the API secret the first time it's needed.
const NS_ROLE = { name: 'ims', permissions: ['api:treatments:create', 'api:treatments:read', 'api:treatments:update', 'api:treatments:delete'], notes: 'IMS carb logging' };
let nsJwt = null; // { token, exp }
async function nsV3Headers() {
  if (nsJwt && nsJwt.exp - 300 > Date.now() / 1000) return { Authorization: `Bearer ${nsJwt.token}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  const h = nsSecretHash();
  if (!h) throw new Error('No Nightscout API secret saved on the Blood Sugar page yet.');
  const admin = { 'api-secret': h, 'Content-Type': 'application/json', Accept: 'application/json' };
  const get = async (path) => (await fetch(`${NS_BASE}${path}`, { headers: admin, signal: AbortSignal.timeout(15000) })).json();
  const post = (path, body) => fetch(`${NS_BASE}${path}`, { method: 'POST', headers: admin, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const roles = await get('/api/v2/authorization/roles');
  if (!Array.isArray(roles)) throw new Error('Nightscout would not list access roles - check the API secret.');
  if (!roles.some((r) => r.name === NS_ROLE.name)) await post('/api/v2/authorization/roles', NS_ROLE);
  let subject = (await get('/api/v2/authorization/subjects')).find((x) => x.name === 'IMS');
  if (!subject) {
    await post('/api/v2/authorization/subjects', { name: 'IMS', roles: [NS_ROLE.name], notes: 'IMS carb logging (API v3)' });
    subject = (await get('/api/v2/authorization/subjects')).find((x) => x.name === 'IMS');
  } else if (!(subject.roles || []).includes(NS_ROLE.name)) {
    await fetch(`${NS_BASE}/api/v2/authorization/subjects`, { method: 'PUT', headers: admin, body: JSON.stringify({ ...subject, roles: [NS_ROLE.name] }), signal: AbortSignal.timeout(15000) });
  }
  if (!subject?.accessToken) throw new Error('Could not set up the IMS access token in Nightscout.');
  const j = await (await fetch(`${NS_BASE}/api/v2/authorization/request/${subject.accessToken}`, { signal: AbortSignal.timeout(15000) })).json();
  if (!j.token) throw new Error('Nightscout did not issue a token for IMS.');
  nsJwt = { token: j.token, exp: j.exp || Date.now() / 1000 + 3600 };
  return { Authorization: `Bearer ${j.token}`, 'Content-Type': 'application/json', Accept: 'application/json' };
}

async function postCarbsToNightscout(g, food, t) {
  if (!nsSecretHash()) return { sent: false, reason: 'No Nightscout API secret saved on the Blood Sugar page yet.' };
  const headers = await nsV3Headers();
  const noteText = food ? `🍽️ Food Log (${g}g carbs): ${food}` : `🍽️ Food Log: ${g}g carbs`;
  // Informational Note treatment: No numeric carbs or insulin properties attached, so Nightscout
  // and AAPS loop engines do not double-count active carbs/boluses when AAPS executes delivery.
  const treatmentBody = {
    eventType: 'Note',
    date: t,
    utcOffset: -new Date(t).getTimezoneOffset(),
    app: 'IMS',
    enteredBy: 'IMS',
    notes: noteText.slice(0, 500),
  };
  const res = await fetch(`${NS_BASE}/api/v3/treatments`, {
    method: 'POST', headers, signal: AbortSignal.timeout(15000),
    body: JSON.stringify(treatmentBody),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.identifier) return { sent: false, reason: `Nightscout answered ${res.status}${d.message ? `: ${d.message}` : ''}.` };
  // The local copy of Nightscout (ns_treatments) is keyed by the Mongo _id from the v1 feed; look it
  // up so the carb log can tell when its entry has come back and not count it twice.
  let id = null;
  try {
    const v1 = await (await fetch(`${NS_BASE}/api/v1/treatments.json?find[identifier]=${encodeURIComponent(d.identifier)}&count=1`, { headers: { 'api-secret': nsSecretHash(), Accept: 'application/json' }, signal: AbortSignal.timeout(15000) })).json();
    id = v1?.[0]?._id || null;
  } catch (_) { /* matched later by time */ }
  return { sent: true, id, identifier: d.identifier, note: noteText };
}

export async function logCarbs({ grams, food, at, source = 'voice', insulin = null }) {
  const g = Math.round(Number(grams));
  if (!Number.isFinite(g) || g <= 0 || g > 400) throw new Error('Give the carbs in grams (1 to 400).');
  const t = at ? Number(new Date(at)) : Date.now();
  const info = db.prepare('INSERT INTO carb_log (at, grams, food, source, insulin) VALUES (?, ?, ?, ?, ?)').run(t, g, food ? String(food).slice(0, 120) : null, ['voice', 'photo', 'page', 'run'].includes(source) ? source : 'voice', null);
  let ns;
  try { ns = await postCarbsToNightscout(g, food, t); } catch (err) { ns = { sent: false, reason: err.message }; }
  if (ns.id || ns.identifier) db.prepare('UPDATE carb_log SET ns_id = ?, ns_identifier = ? WHERE id = ?').run(ns.id || null, ns.identifier || null, info.lastInsertRowid);
  return { id: info.lastInsertRowid, at: t, grams: g, food: food || null, insulin: null, nightscout: ns };
}
export function listCarbs(days = 7) {
  return db.prepare('SELECT id, at, grams, food, insulin, ns_id FROM carb_log WHERE at >= ? ORDER BY at DESC').all(Date.now() - days * 86400000);
}
export async function deleteCarbs(id) {
  const row = db.prepare('SELECT ns_id, ns_identifier FROM carb_log WHERE id = ?').get(Number(id));
  if (row?.ns_identifier) {
    // v3 delete marks it invalid, which AAPS syncs - so the carbs come off the loop too
    try { await fetch(`${NS_BASE}/api/v3/treatments/${encodeURIComponent(row.ns_identifier)}`, { method: 'DELETE', headers: await nsV3Headers(), signal: AbortSignal.timeout(15000) }); } catch (_) { /* best effort */ }
  } else if (row?.ns_id) {
    const h = nsSecretHash();
    if (h) await fetch(`${NS_BASE}/api/v1/treatments/${encodeURIComponent(row.ns_id)}`, { method: 'DELETE', headers: { 'api-secret': h }, signal: AbortSignal.timeout(15000) }).catch(() => {});
  }
  return db.prepare('DELETE FROM carb_log WHERE id = ?').run(Number(id)).changes > 0;
}

// ---- what Ims gets ------------------------------------------------------------------------------------
export function describeForIms(period = 'today') {
  const cur = getCurrent();
  const th = getGlucoseThresholds();
  const days = period === 'week' ? 7 : period === 'fortnight' ? 14 : period === 'month' ? 30 : 1;
  const s = getSummary(days);

  const out = {
    now: cur ? { mmol: cur.value, trend: cur.direction, changeLast5Min: cur.delta, range: cur.range, minutesOld: cur.minutesAgo, insulinOnBoardUnits: cur.iob, carbsOnBoardG: cur.cob } : 'no recent reading',
    deviceStatus: s.deviceStatus,
    period: days === 1 ? 'last 24 hours' : `last ${days} days`,
    note: s.dataSince && Date.now() - s.dataSince < days * 86400000 ? `Only ${r1((Date.now() - s.dataSince) / 86400000)} days of history so far (the log was recently restarted), so treat patterns as early.` : undefined,
    timeInRange: s.stats ? { inRange: `${s.stats.inRangePct}% (${th.low}-${th.high} mmol/L)`, belowLow: `${r1(s.stats.lowPct + s.stats.veryLowPct)}% (<${th.low})`, aboveHigh: `${r1(s.stats.highPct + s.stats.veryHighPct)}% (>${th.high})`, average: s.stats.mean, variabilityCV: `${s.stats.cvPct}%`, estimatedHbA1c: `${s.stats.gmiPct}%` } : 'no readings',
    lows: s.lows.slice(0, 5).map((l) => `${l.when}, lowest ${l.lowest}, ${l.minutes} min${l.afterExercise ? `, after ${l.afterExercise}` : ''}`),
    overnight: s.overnight ? `last night ${s.overnight.inRangePct}% in range, lowest ${s.overnight.min}, woke at ${s.overnight.endValue}` : undefined,
    targets: `In range is ${th.low}-${th.high} mmol/L; the usual goals are over 70% in range, under 4% below ${th.low}, under 1% below ${th.veryLow}. For runs the user likes to start near 9 and never drop below 5.`,
    safety: `Never suggest insulin doses or changes to insulin settings. NEVER say "this is not medical advice", NEVER say "please seek advice from a medical professional or team", and NEVER tell or suggest to the user to speak to, check with, or consult their diabetes team or doctor (they manage their medical care independently and strictly forbid disclaimers); give your observations, carbs and timing ideas straight to consider without any disclaimers or caveats. If the reading is under ${th.low}, the first thing to say is to treat the low.`,
    thresholds: th,
  };
  return out;
}

// ---- AI read of the last fortnight, saved so the page can show it again ------------------------------
const INSIGHT_KEY = 'glucose_hub_insight';
export function getSavedInsight() { try { return JSON.parse(getSetting(INSIGHT_KEY) || 'null'); } catch { return null; } }
export async function analyse(days = 14) {
  const s = getSummary(days);
  if (!s.stats || s.stats.readings < 36) throw new Error('Not enough glucose readings yet - give it a few more hours of logging.');
  const th = s.thresholds || getGlucoseThresholds();
  const pLow = th.personalLow || 4.5;
  const pHigh = th.personalHigh || th.tightHigh || 7.8;
  const facts = {
    period: `${s.days} days (data since ${s.dataSince ? london(s.dataSince, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '?'})`,
    thresholds: th,
    stats: s.stats, previousPeriod: s.previous, hourlyMedian: s.profile.filter((p) => p.median).map((p) => `${p.hour}:00 ${p.median} (${p.p10}-${p.p90})`),
    lows: s.lows, totals: s.totals, overnight: s.overnight,
    exercise: db.prepare("SELECT day, sport, name, distance/1000.0 AS km FROM strava_activities WHERE start_utc >= ? ORDER BY start_utc").all(new Date(s.from).toISOString()),
  };
  const prompt = `You are reviewing continuous glucose data for someone with type 1 diabetes on an AAPS closed loop who runs regularly. Write in British English, plain words, short paragraphs, no headings bigger than bold text.
Target Bands:
- Medical in-range: ${th.low}-${th.high} mmol/L (consensus goal >70%, currently ${s.stats?.inRangePct ?? '--'}%)
- Personal target: ${pLow}-${pHigh} mmol/L (currently ${s.stats?.personalTargetPct ?? s.stats?.tightPct ?? '--'}%)
- Low cutoffs: Low <${th.low} (goal <4%, currently ${s.stats?.lowPct ?? '--'}%), Very low <${th.veryLow} (goal <1%, currently ${s.stats?.veryLowPct ?? '--'}%)
- High cutoffs: High >${th.high} (${s.stats?.highPct ?? '--'}%), Very high >${th.veryHigh} (${s.stats?.veryHighPct ?? '--'}%)

Give: 1) the headline (time in medical range [${th.low}-${th.high}] vs 70% goal, time in personal target [${pLow}-${pHigh}], and lows vs under-4% goal) 2) the clearest pattern by time of day 3) anything linked to exercise or overnight 4) two or three practical things to try (timing, carbs, pre-run routine, when to check).
Hard rules: never suggest insulin doses, ratios, basal rates or loop setting changes. CRITICAL: NEVER say "this is not medical advice", NEVER say "please seek advice from a medical professional or team", and NEVER tell or suggest to the user to consult or speak to their diabetes team or healthcare professionals (the user will do that independently); give your practical observations and ideas straight to consider without disclaimers. If there is little data, say the patterns are early. Under 220 words.
DATA: ${JSON.stringify(facts)}`;
  const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({ model: 'gemini-2.5-flash' });
  const rawText = (await model.generateContent(prompt)).response.text().trim();
  const text = stripMedicalDisclaimers(rawText);
  const saved = { text, at: Date.now(), days: s.days, thresholds: th };
  setSetting(INSIGHT_KEY, JSON.stringify(saved));
  return saved;
}

// ---- Nightscout database size and clean-up --------------------------------------------------------------
let dbSizeCache = { at: 0, data: null };
export async function getNightscoutDbSize() {
  if (dbSizeCache.data && Date.now() - dbSizeCache.at < 5 * 60000) return dbSizeCache.data;
  try {
    const res = await fetch(`${NS_BASE}/api/v2/properties/dbsize`, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
    const d = (await res.json()).dbsize;
    const used = Number(d?.details?.dataSize ?? d?.totalDataSize ?? 0), max = Number(d?.details?.maxSize ?? 0);
    // Nightscout's own percentage is a whole number; work it out to one decimal place, rounded up.
    const pct = max > 0 ? Math.ceil((used / max) * 1000) / 10 : Number(d?.dataPercentage ?? 0);
    const data = d ? { pct, usedMb: r1(used), maxMb: max || null } : null;
    dbSizeCache = { at: Date.now(), data };
    return data;
  } catch (_) { return dbSizeCache.data; }
}

// Deletes Nightscout records older than `months` (glucose entries, treatments and AAPS device
// status - the last is usually most of the space). IMS keeps its own copy, so its history and
// charts are unaffected.
export async function clearOldNightscout(months = 3) {
  const h = nsSecretHash();
  if (!h) throw new Error('Connect Nightscout with your API secret first (in the carb log box below).');
  const cutoff = Date.now() - Math.max(1, Number(months) || 3) * 30 * 86400000;
  const iso = new Date(cutoff).toISOString();
  const jobs = [
    ['glucose readings', `/api/v1/entries?find[date][$lte]=${cutoff}`],
    ['treatments', `/api/v1/treatments?find[created_at][$lte]=${encodeURIComponent(iso)}`],
    ['device status', `/api/v1/devicestatus?find[created_at][$lte]=${encodeURIComponent(iso)}`],
  ];
  const results = [];
  for (const [label, path] of jobs) {
    try {
      const res = await fetch(`${NS_BASE}${path}`, { method: 'DELETE', headers: { 'api-secret': h, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
      const body = await res.json().catch(() => ({}));
      results.push({ label, ok: res.ok, deleted: body?.n ?? body?.deletedCount ?? body?.result?.n ?? null, status: res.status });
    } catch (err) {
      results.push({ label, ok: false, error: err.message });
    }
  }
  dbSizeCache = { at: 0, data: null };
  return { cutoff: iso, results, dbSize: await getNightscoutDbSize() };
}


// Carbs already entered in the last `minutes` - from AAPS or IMS - read live from Nightscout
// (falling back to IMS's own copy), so the same meal isn't counted twice now AAPS receives them.
export async function recentCarbs(minutes = 20) {
  const since = Date.now() - minutes * 60000;
  const fmt = (t) => new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
  try {
    const res = await fetch(`${NS_BASE}/api/v1/treatments.json?find[created_at][$gte]=${encodeURIComponent(new Date(since).toISOString())}&find[carbs][$gt]=0&count=20`,
      { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
    if (res.ok) {
      return (await res.json()).filter((t) => Number(t.carbs) > 0)
        .map((t) => ({ grams: Math.round(Number(t.carbs)), at: fmt(Date.parse(t.created_at)), by: t.enteredBy || 'AAPS', notes: t.notes || null }));
    }
  } catch (_) { /* use the local copy */ }
  const local = db.prepare('SELECT at, carbs FROM ns_treatments WHERE carbs > 0 AND at >= ?').all(since).map((t) => ({ grams: Math.round(t.carbs), at: fmt(t.at), by: 'Nightscout' }));
  const logged = db.prepare('SELECT at, grams, food FROM carb_log WHERE at >= ?').all(since).map((t) => ({ grams: Math.round(t.grams), at: fmt(t.at), by: 'IMS', notes: t.food }));
  return [...local, ...logged];
}

// ---- automatic clear-out ------------------------------------------------------------------------------
// When switched on, the Nightscout database is checked hourly; at 95% full or more, everything older
// than 3 months is cleared (as with the button). It won't run again within 24 hours of the last go, so
// a database that stays full after clearing isn't hammered.
const AUTO_KEY = 'ns_auto_clear';
const AUTO_LAST_KEY = 'ns_auto_clear_last';
const AUTO_THRESHOLD = 95;
export function getAutoClear() {
  let last = null;
  try { last = JSON.parse(getSetting(AUTO_LAST_KEY) || 'null'); } catch { last = null; }
  return { enabled: getSetting(AUTO_KEY) === 'true', threshold: AUTO_THRESHOLD, last };
}
export function setAutoClear(enabled) {
  setSetting(AUTO_KEY, enabled ? 'true' : 'false');
  return getAutoClear();
}
export async function autoClearCheck() {
  const { enabled, last } = getAutoClear();
  if (!enabled || !nsSecretHash()) return;
  if (last?.at && Date.now() - last.at < 24 * 3600000) return;
  dbSizeCache = { at: 0, data: null };
  const size = await getNightscoutDbSize();
  if (!size || size.pct < AUTO_THRESHOLD) return;
  console.log(`[Nightscout] Database at ${size.pct}% - auto-clearing records older than 3 months`);
  try {
    const r = await clearOldNightscout(3);
    setSetting(AUTO_LAST_KEY, JSON.stringify({ at: Date.now(), before: size.pct, after: r.dbSize?.pct ?? null, ok: r.results.every((x) => x.ok) }));
  } catch (err) {
    setSetting(AUTO_LAST_KEY, JSON.stringify({ at: Date.now(), before: size.pct, ok: false, error: err.message }));
  }
}
// run hourly by the scheduler ('glucose_hub_autoclear' in index.js)

// ---- your carb values for foods -----------------------------------------------------------------------------
// When the carbs Gemini gave for a food are corrected (usually from the packet) and the meal is logged, the
// corrected grams for ONE piece/serving are kept here and used the next time that food is in a photo.
// Gemini is given these names so it names the same food the same way, and the match is on the name.
db.exec(`CREATE TABLE IF NOT EXISTS food_carb_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'portion',
  carbs_each REAL NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`);

// "Warburtons Toastie white bread, toasted" / "white toast" etc. -> a stable key: lower case, no brackets or
// punctuation, simple plurals dropped ("slices" -> "slice").
export function foodKey(name) {
  return String(name || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
    .map((w) => (w.length <= 3 ? w : /ies$/.test(w) ? `${w.slice(0, -3)}y` : /(ch|sh|x|ss|o)es$/.test(w) ? w.slice(0, -2) : /[^s]s$/.test(w) ? w.slice(0, -1) : w))
    .join(' ').trim();
}

export function listFoodMemory() {
  return db.prepare('SELECT id, name, unit, carbs_each AS carbsEach, uses, updated_at AS updatedAt FROM food_carb_memory ORDER BY updated_at DESC').all();
}

// [{ name, unit, carbsEach }] - only the items whose carbs were corrected on the page.
export function saveFoodMemory(items = []) {
  const now = new Date().toISOString();
  const up = db.prepare(`INSERT INTO food_carb_memory (key, name, unit, carbs_each, uses, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(key) DO UPDATE SET name = excluded.name, unit = excluded.unit, carbs_each = excluded.carbs_each, updated_at = excluded.updated_at`);
  let saved = 0;
  for (const it of items) {
    const key = foodKey(it.name);
    const each = Number(it.carbsEach);
    if (!key || !Number.isFinite(each) || each < 0 || each > 500) continue;
    up.run(key, String(it.name).slice(0, 80), String(it.unit || 'portion').slice(0, 30), Math.round(each * 10) / 10, now, now);
    saved++;
  }
  return { saved };
}

export function deleteFoodMemory(id) {
  return db.prepare('DELETE FROM food_carb_memory WHERE id = ?').run(Number(id)).changes > 0;
}

// ---- carbs from a photo ------------------------------------------------------------------------------------
// A photo of a plate (from the phone): Gemini names each food with a portion and its carbs, and says how sure it
// is. Nothing is logged here - the page shows the estimate, the user corrects it, and only their confirmed
// total is logged. note: anything they add ("the rice was a full cup", "no sauce").
export async function estimateCarbsFromPhoto(image, mimeType = 'image/jpeg', note = '') {
  if (!image?.length) throw new Error('No photo came through.');
  if (image.length > 12 * 1024 * 1024) throw new Error('The photo is too big - try again.');
  const config = (await import('../config.js')).default;
  const remembered = listFoodMemory().slice(0, 80);
  const memoryLine = remembered.length
    ? `\nFoods this person has given exact carb values for before (from the packet). If you see one of these, use EXACTLY this name and unit so it can be matched: ${remembered.map((m) => `"${m.name}" (per ${m.unit})`).join('; ')}.`
    : '';
  const prompt = `You are helping someone with type 1 diabetes count carbohydrates. Look at this photo of food and estimate the carbs as accurately as you can, for a UK diet.
List each separate food or drink you can see, with: name (plain, specific - e.g. "white basmati rice", "garlic naan"), portion (your estimate of the amount, in grams or a household measure, as seen), count (how many separate pieces or servings of it there are - 2 for two slices of toast, 3 for three biscuits; 1 for anything not counted in pieces, like a pile of rice), unit (what one of the count is, singular - "slice", "biscuit", "sausage", or "portion" when not counted in pieces), carbs (grams of carbohydrate in ALL of it together), and confidence ("high", "medium" or "low").
Use standard nutrition values (like the UK's McCance and Widdowson data or pack labels). Count only carbohydrate, not sugar alone, and not fibre. Judge the portion from the plate, cutlery and anything else for scale.
Also give: total (the sum of the carbs), summary (a short description of the meal, under 60 characters, for a log), and caution (one sentence on anything that makes the estimate uncertain - hidden ingredients, sauces, unclear portions - or "" if none).
If there is no food in the photo, return no items and say so in caution.${memoryLine}${note ? `\nWhat the person says about it (believe this over the picture): ${note}` : ''}`;
  const model = getModelFor('glucose');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ inlineData: { mimeType, data: Buffer.from(image).toString('base64') } }, { text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json', temperature: 0.2,
        responseSchema: {
          type: 'OBJECT',
          properties: {
            items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, portion: { type: 'STRING' }, count: { type: 'NUMBER' }, unit: { type: 'STRING' }, carbs: { type: 'NUMBER' }, confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] } }, required: ['name', 'portion', 'count', 'unit', 'carbs', 'confidence'] } },
            total: { type: 'NUMBER' }, summary: { type: 'STRING' }, caution: { type: 'STRING' },
          },
          required: ['items', 'total', 'summary', 'caution'],
        },
      },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Gemini returned HTTP ${res.status}`);
  const text = (await readGeminiJson(res, model, 'glucose'))?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
  if (!text) throw new Error('Could not read the photo - try another.');
  const out = JSON.parse(text);
  // Each item as count x carbs for one; a food you've corrected before uses your value for one.
  const memory = new Map(remembered.map((m) => [foodKey(m.name), m]));
  const bump = db.prepare('UPDATE food_carb_memory SET uses = uses + 1 WHERE id = ?');
  const items = (out.items || []).map((i) => {
    const count = Math.max(0.5, Math.round((Number(i.count) || 1) * 2) / 2);
    const total = Math.max(0, Number(i.carbs) || 0);
    const item = {
      name: String(i.name).slice(0, 80), portion: String(i.portion || '').slice(0, 60), unit: String(i.unit || 'portion').slice(0, 30),
      count, carbsEach: Math.round((total / count) * 10) / 10, confidence: i.confidence || 'medium', yours: false, geminiEach: Math.round((total / count) * 10) / 10,
    };
    const mine = memory.get(foodKey(item.name));
    if (mine) {
      item.carbsEach = mine.carbsEach;
      item.unit = mine.unit || item.unit;
      item.yours = true;
      item.confidence = 'high';
      try { bump.run(mine.id); } catch { /* not essential */ }
    }
    item.carbs = Math.round(item.count * item.carbsEach);
    return item;
  });
  return { items, total: items.reduce((n, i) => n + i.carbs, 0), summary: String(out.summary || '').slice(0, 80), caution: String(out.caution || '') };
}
