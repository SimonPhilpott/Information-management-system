import db, { getSetting, setSetting } from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';
import { encryptSecret, decryptSecret } from './wifiService.js';

// The blood sugar service: everything is worked out from the local copy of Nightscout
// (ns_entries / ns_treatments / ns_devicestatus, filled every minute by glucoseService and
// every 5 minutes by runGlucoseService), so Ims and the page never need to ask Nightscout.
// Ranges follow the international consensus on CGM time in range (Battelino et al., 2019).
// It never gives insulin doses - anything about insulin is framed as "worth discussing with
// your diabetes team".

const MGDL = 18.0182;
const LOW = 3.9, VERY_LOW = 3.0, HIGH = 10.0, VERY_HIGH = 13.9, TIGHT_HIGH = 7.8;
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
  const vals = rs.map((r) => r.v);
  const n = vals.length;
  const mean = vals.reduce((a, v) => a + v, 0) / n;
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
  const pct = (f) => Math.round((vals.filter(f).length / n) * 1000) / 10;
  const expected = spanMs / (5 * 60000);
  return {
    readings: n,
    coveragePct: Math.min(100, Math.round((n / Math.max(1, expected)) * 100)),
    hours: r1(spanMs / 3600000),
    mean: r1(mean), sd: r1(sd), cvPct: Math.round((sd / mean) * 100),
    gmiPct: r1(3.31 + 0.02392 * mean * MGDL), // estimated HbA1c
    min: Math.min(...vals), max: Math.max(...vals),
    veryLowPct: pct((v) => v < VERY_LOW),
    lowPct: pct((v) => v >= VERY_LOW && v < LOW),
    inRangePct: pct((v) => v >= LOW && v <= HIGH),
    tightPct: pct((v) => v >= LOW && v <= TIGHT_HIGH),
    highPct: pct((v) => v > HIGH && v <= VERY_HIGH),
    veryHighPct: pct((v) => v > VERY_HIGH),
  };
}

// Stretches below 3.9 lasting 15 minutes or more (the consensus definition of a hypo event).
function lowEvents(rs) {
  const out = [];
  let cur = null;
  for (const r of rs) {
    if (r.v < LOW) {
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
  return {
    value: v, direction: e.direction || null, minutesAgo: mins, fresh: mins <= 15,
    delta: prev ? r1(v - mmol(prev.sgv)) : null,
    range: v < VERY_LOW ? 'very low' : v < LOW ? 'low' : v <= HIGH ? 'in range' : v <= VERY_HIGH ? 'high' : 'very high',
    iob: d && Date.now() - d.at < 20 * 60000 ? r1(Math.max(0, d.iob)) : null,
    cob: d && Date.now() - d.at < 20 * 60000 && d.cob != null ? Math.round(d.cob) : null,
  };
}

function dataSince() {
  const r = db.prepare('SELECT MIN(date) AS a FROM ns_entries').get();
  return r?.a || null;
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
  return {
    days, from, to, dataSince: since,
    current: getCurrent(),
    stats, previous: prevStats,
    profile: hourlyProfile(rs),
    lows: lowEvents(rs).reverse(),
    totals: insulinAndCarbs(from, to),
    overnight: getOvernight(),
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
  return { inRangePct: s.inRangePct, mean: s.mean, min: s.min, max: s.max, lows: lowEvents(rs).length, endValue: rs[rs.length - 1].v };
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
  return { day, from, to, readings: rs, stats: statsOf(rs, Math.min(to, Date.now()) - from), treatments, carbs, activities, iob, lows: lowEvents(rs) };
}

// ---- carb log (by voice or on the page), also sent to Nightscout as carbs (Meal Bolus, like AAPS) ---------------
const NS_BASE = 'https://simon-philpott-nightscout.herokuapp.com';
const NS_SECRET_KEY = 'nightscout_api_secret';
try { db.exec('ALTER TABLE carb_log ADD COLUMN ns_id TEXT'); } catch (_) { /* already there */ }

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
async function postCarbsToNightscout(g, food, t) {
  const h = nsSecretHash();
  if (!h) return { sent: false, reason: 'No Nightscout API secret saved on the Blood Sugar page yet.' };
  const res = await fetch(`${NS_BASE}/api/v1/treatments`, {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { 'api-secret': h, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify([{ eventType: 'Meal Bolus', carbs: g, // same type AAPS uses for carbs, so they show and count the same way
       created_at: new Date(t).toISOString(), enteredBy: 'IMS', notes: food || undefined }]),
  });
  if (!res.ok) return { sent: false, reason: `Nightscout answered ${res.status}.` };
  const d = await res.json().catch(() => null);
  const id = Array.isArray(d) ? d[0]?._id : d?._id;
  return { sent: true, id: id || null };
}

export async function logCarbs({ grams, food, at }) {
  const g = Math.round(Number(grams));
  if (!Number.isFinite(g) || g <= 0 || g > 400) throw new Error('Give the carbs in grams (1 to 400).');
  const t = at ? Number(new Date(at)) : Date.now();
  const info = db.prepare('INSERT INTO carb_log (at, grams, food, source) VALUES (?, ?, ?, ?)').run(t, g, food ? String(food).slice(0, 120) : null, 'voice');
  let ns;
  try { ns = await postCarbsToNightscout(g, food, t); } catch (err) { ns = { sent: false, reason: err.message }; }
  if (ns.id) db.prepare('UPDATE carb_log SET ns_id = ? WHERE id = ?').run(ns.id, info.lastInsertRowid);
  return { id: info.lastInsertRowid, at: t, grams: g, food: food || null, nightscout: ns };
}
export function listCarbs(days = 7) {
  return db.prepare('SELECT id, at, grams, food, ns_id FROM carb_log WHERE at >= ? ORDER BY at DESC').all(Date.now() - days * 86400000);
}
export async function deleteCarbs(id) {
  const row = db.prepare('SELECT ns_id FROM carb_log WHERE id = ?').get(Number(id));
  if (row?.ns_id) {
    const h = nsSecretHash();
    if (h) await fetch(`${NS_BASE}/api/v1/treatments/${encodeURIComponent(row.ns_id)}`, { method: 'DELETE', headers: { 'api-secret': h }, signal: AbortSignal.timeout(15000) }).catch(() => {});
  }
  return db.prepare('DELETE FROM carb_log WHERE id = ?').run(Number(id)).changes > 0;
}

// ---- what Ims gets ------------------------------------------------------------------------------------
export function describeForIms(period = 'today') {
  const cur = getCurrent();
  const days = period === 'week' ? 7 : period === 'fortnight' ? 14 : period === 'month' ? 30 : 1;
  const s = getSummary(days);
  const out = {
    now: cur ? { mmol: cur.value, trend: cur.direction, changeLast5Min: cur.delta, range: cur.range, minutesOld: cur.minutesAgo, insulinOnBoardUnits: cur.iob, carbsOnBoardG: cur.cob } : 'no recent reading',
    period: days === 1 ? 'last 24 hours' : `last ${days} days`,
    note: s.dataSince && Date.now() - s.dataSince < days * 86400000 ? `Only ${r1((Date.now() - s.dataSince) / 86400000)} days of history so far (the log was recently restarted), so treat patterns as early.` : undefined,
    timeInRange: s.stats ? { inRange3_9to10: `${s.stats.inRangePct}%`, below3_9: `${r1(s.stats.lowPct + s.stats.veryLowPct)}%`, above10: `${r1(s.stats.highPct + s.stats.veryHighPct)}%`, average: s.stats.mean, variabilityCV: `${s.stats.cvPct}%`, estimatedHbA1c: `${s.stats.gmiPct}%` } : 'no readings',
    lows: s.lows.slice(0, 5).map((l) => `${l.when}, lowest ${l.lowest}, ${l.minutes} min${l.afterExercise ? `, after ${l.afterExercise}` : ''}`),
    overnight: s.overnight ? `last night ${s.overnight.inRangePct}% in range, lowest ${s.overnight.min}, woke at ${s.overnight.endValue}` : undefined,
    targets: 'In range is 3.9-10 mmol/L; the usual goals are over 70% in range, under 4% below 3.9, under 1% below 3.0. For runs the user likes to start near 9 and never drop below 5.',
    safety: 'Never suggest insulin doses or changes to insulin settings - say it is worth discussing with the diabetes team. Carbs and timing ideas are fine. If the reading is under 3.9, the first thing to say is to treat the low.',
  };
  return out;
}

// ---- AI read of the last fortnight, saved so the page can show it again ------------------------------
const INSIGHT_KEY = 'glucose_hub_insight';
export function getSavedInsight() { try { return JSON.parse(getSetting(INSIGHT_KEY) || 'null'); } catch { return null; } }
export async function analyse(days = 14) {
  const s = getSummary(days);
  if (!s.stats || s.stats.readings < 36) throw new Error('Not enough glucose readings yet - give it a few more hours of logging.');
  const facts = {
    period: `${s.days} days (data since ${s.dataSince ? london(s.dataSince, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '?'})`,
    stats: s.stats, previousPeriod: s.previous, hourlyMedian: s.profile.filter((p) => p.median).map((p) => `${p.hour}:00 ${p.median} (${p.p10}-${p.p90})`),
    lows: s.lows, totals: s.totals, overnight: s.overnight,
    exercise: db.prepare("SELECT day, sport, name, distance/1000.0 AS km FROM strava_activities WHERE start_utc >= ? ORDER BY start_utc").all(new Date(s.from).toISOString()),
  };
  const prompt = `You are reviewing continuous glucose data for someone with type 1 diabetes on an AAPS closed loop who runs regularly. Write in British English, plain words, short paragraphs, no headings bigger than bold text.
Give: 1) the headline (time in range vs the 70% goal, lows vs the under-4% goal) 2) the clearest pattern by time of day 3) anything linked to exercise or overnight 4) two or three practical things to try (timing, carbs, pre-run routine, when to check).
Hard rules: never suggest insulin doses, ratios, basal rates or loop setting changes - if they look relevant, say it would be worth raising with the diabetes team. If there is little data, say the patterns are early. Under 220 words.
DATA: ${JSON.stringify(facts)}`;
  const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({ model: 'gemini-2.5-flash' });
  const text = (await model.generateContent(prompt)).response.text().trim();
  const saved = { text, at: Date.now(), days: s.days };
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
async function autoClearCheck() {
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
setTimeout(() => autoClearCheck().catch(() => {}), 60000);
setInterval(() => autoClearCheck().catch(() => {}), 3600000);
