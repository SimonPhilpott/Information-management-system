import db, { getSetting, setSetting } from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { textInUnits, clearUnitCache, normaliseUnits } from './aiTextService.js';

// Matches each Strava activity with what Nightscout (an AAPS closed loop with a Libre 2
// sensor and an Omnipod) recorded around it: glucose, insulin on board (IOB), carbs on
// board (COB), boluses, carbs, temp basals and temporary targets. From that it derives
// per-activity numbers and, across activities, which starting conditions tend to give a
// steady glucose during exercise. The point is insight - it never gives dose advice.
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
const NIGHTSCOUT = 'https://simon-philpott-nightscout.herokuapp.com/api/v1';
const MGDL = 18.0182;
const LOW = 4.0, HIGH = 7.5, VERY_HIGH = 10.0; // the same bands IMS shows on its screen
const PRE_MIN = 90, POST_MIN = 120;

db.exec(`
  CREATE TABLE IF NOT EXISTS activity_glucose (
    activity_id INTEGER PRIMARY KEY,
    computed_at INTEGER NOT NULL,
    status TEXT NOT NULL,
    complete INTEGER NOT NULL DEFAULT 0,
    data TEXT
  );
`);
try { db.exec('ALTER TABLE strava_activities ADD COLUMN start_utc TEXT'); } catch (_) { /* already there */ }
// Rows stored before start_utc existed carry it in their raw JSON.
try {
  for (const r of db.prepare('SELECT id, raw FROM strava_activities WHERE start_utc IS NULL').all()) {
    try { const s = JSON.parse(r.raw).start_date; if (s) db.prepare('UPDATE strava_activities SET start_utc = ? WHERE id = ?').run(s, r.id); } catch (_) { /* skip */ }
  }
} catch (_) { /* the activities table does not exist yet - nothing to fill */ }

// ---- local Nightscout log ----------------------------------------------------------------
// This Nightscout only keeps the last few hours of data, so history has to be logged here
// as it happens: a run can only be matched to glucose that was recorded while it was going on.
db.exec(`
  CREATE TABLE IF NOT EXISTS ns_entries (date INTEGER PRIMARY KEY, sgv INTEGER NOT NULL, direction TEXT);
  CREATE TABLE IF NOT EXISTS ns_treatments (
    id TEXT PRIMARY KEY, at INTEGER NOT NULL, event TEXT, insulin REAL, carbs REAL, rate REAL, duration REAL,
    target_top REAL, target_bottom REAL, reason TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_ns_treatments_at ON ns_treatments(at);
  CREATE TABLE IF NOT EXISTS ns_devicestatus (at INTEGER PRIMARY KEY, iob REAL, basal_iob REAL, cob REAL);
`);
for (const col of ['isf', 'cr', 'target']) { try { db.exec(`ALTER TABLE ns_devicestatus ADD COLUMN ${col} REAL`); } catch (_) { /* already there */ } }

async function ns(pathAndQuery) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${NIGHTSCOUT}${pathAndQuery}`, { signal: AbortSignal.timeout(25000), headers: { Accept: 'application/json' } });
      if (res.ok) return await res.json();
      if (res.status < 500) throw new Error(`Nightscout said ${res.status}`);
    } catch (err) {
      if (attempt === 2) throw new Error(`Could not read Nightscout: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); // Heroku dynos wake slowly
  }
  return [];
}

const insEntry = db.prepare('INSERT OR REPLACE INTO ns_entries (date, sgv, direction) VALUES (?, ?, ?)');
const insTreatment = db.prepare(`INSERT OR REPLACE INTO ns_treatments (id, at, event, insulin, carbs, rate, duration, target_top, target_bottom, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insDevice = db.prepare('INSERT OR REPLACE INTO ns_devicestatus (at, iob, basal_iob, cob, isf, cr, target) VALUES (?, ?, ?, ?, ?, ?, ?)');
// AAPS writes its live settings into the loop's reason text: "... ISF: 1.6, CR: 7.5, Target: 5.5 ..."
// (ISF in mmol/L per unit, CR in grams per unit). The profile stored in Nightscout is a placeholder.
function loopSettings(reason) {
  const text = String(reason || '');
  const last = (re) => { const m = text.match(re); return m ? Number(m[m.length - 1]) : null; };
  return { isf: last(/ISF:\s*(?:[\d.]+\s*(?:->|→)\s*)?([\d.]+)/), cr: last(/CR:\s*(?:[\d.]+\s*(?:->|→)\s*)?([\d.]+)/), target: last(/Target:\s*([\d.]+)/) };
}

// Pulls whatever Nightscout has that is newer than what is already stored (with a little
// overlap so late-arriving records are caught) and keeps it. Run every few minutes.
let lastBackfillCheck = 0;
export async function logNightscout({ hours = null } = {}) {
  const last = db.prepare('SELECT MAX(date) AS d FROM ns_entries').get().d;
  const since = hours ? Date.now() - hours * 3600000 : last ? last - 45 * 60000 : Date.now() - 6 * 3600000;
  const iso = encodeURIComponent(new Date(since).toISOString());
  const [entries, treatments, devicestatus] = await Promise.all([
    ns(`/entries.json?count=2000&find[date][$gte]=${since}`),
    ns(`/treatments.json?count=2000&find[created_at][$gte]=${iso}`),
    ns(`/devicestatus.json?count=2000&find[created_at][$gte]=${iso}`),
  ]);
  store({ entries, treatments, devicestatus });
  // Every half hour, see whether older data has appeared in Nightscout (e.g. AAPS re-uploaded its history).
  if (Date.now() - lastBackfillCheck > 30 * 60000) {
    lastBackfillCheck = Date.now();
    backfillNightscout().catch((err) => console.error('[NightscoutLog] backfill:', err.message));
  }
  return { entries: entries.length, treatments: treatments.length, devicestatus: devicestatus.length };
}

function store({ entries, treatments, devicestatus }) {
  db.transaction(() => {
    for (const e of entries) if (e.sgv != null && e.date) insEntry.run(e.date, e.sgv, e.direction || null);
    for (const t of treatments) {
      const at = new Date(t.created_at).getTime();
      if (!Number.isFinite(at)) continue;
      insTreatment.run(t._id || `${at}-${t.eventType}`, at, t.eventType || null, t.insulin ?? null, t.carbs ?? null, t.rate ?? t.absolute ?? null, t.duration ?? null, t.targetTop ?? null, t.targetBottom ?? null, t.reason || null);
    }
    for (const d of devicestatus) {
      const iob = d.openaps?.iob || d.loop?.iob || d.pump?.iob;
      const at = new Date(d.created_at || iob?.time).getTime();
      if (!iob || !Number.isFinite(at) || iob.iob == null) continue;
      const ls = loopSettings(d.openaps?.suggested?.reason || d.openaps?.enacted?.reason);
      insDevice.run(at, iob.iob, iob.basaliob ?? null, d.openaps?.suggested?.COB ?? d.loop?.cob?.cob ?? null, ls.isf, ls.cr, ls.target);
    }
  })();
}

// Where glucose and insulin stand right now, from the local Nightscout log (used to plan the
// next run and to write "next time" advice).
export function getCurrentState() {
  const e = db.prepare('SELECT date, sgv, direction FROM ns_entries ORDER BY date DESC LIMIT 1').get();
  const d = db.prepare('SELECT at, iob, basal_iob, cob FROM ns_devicestatus ORDER BY at DESC LIMIT 1').get();
  const bolus = db.prepare('SELECT at, insulin FROM ns_treatments WHERE insulin > 0 ORDER BY at DESC LIMIT 1').get();
  const carbs = db.prepare('SELECT SUM(carbs) AS g FROM ns_treatments WHERE carbs > 0 AND at >= ?').get(Date.now() - 3 * 3600000).g;
  const ago = (t) => Math.round((Date.now() - t) / 60000);
  const bg = e ? Math.round((e.sgv / MGDL) * 10) / 10 : null;
  return {
    bg, direction: e?.direction || null, bgMinutesAgo: e ? ago(e.date) : null, bgFresh: Boolean(e && ago(e.date) <= 20),
    iob: d && ago(d.at) <= 20 ? Math.max(0, Math.round(d.iob * 100) / 100) : null,
    cob: d && ago(d.at) <= 20 && d.cob != null ? Math.round(d.cob) : null,
    lastBolusUnits: bolus?.insulin ?? null, lastBolusMinutesAgo: bolus ? ago(bolus.at) : null, carbsLast3h: Math.round(carbs || 0),
  };
}

// The insulin settings AAPS has actually been using lately (median of the last two days),
// falling back to typical values if none have been logged yet.
export function getLoopSettings() {
  const rows = db.prepare('SELECT isf, cr, target FROM ns_devicestatus WHERE at >= ? AND isf IS NOT NULL AND cr IS NOT NULL').all(Date.now() - 48 * 3600000);
  const med = (k) => { const v = rows.map((r) => r[k]).filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
  return { isf: med('isf'), cr: med('cr'), target: med('target'), samples: rows.length };
}

// Older data can appear in Nightscout later (for example when AAPS re-uploads its history), so
// on each pass check whether Nightscout holds anything older than the oldest reading logged here
// and, if so, pull it in, working backwards a few days at a time.
let backfilling = false;
export async function backfillNightscout({ maxDays = 90 } = {}) {
  if (backfilling) return { skipped: true };
  backfilling = true;
  const added = { entries: 0, treatments: 0, devicestatus: 0, windows: 0 };
  try {
    const floor = Date.now() - maxDays * 86400000;
    for (let i = 0; i < 40; i++) {
      const oldest = db.prepare('SELECT MIN(date) AS d FROM ns_entries').get().d;
      if (!oldest || oldest <= floor) break;
      const probe = await ns(`/entries.json?count=1&find[date][$lt]=${oldest}`);
      if (!Array.isArray(probe) || probe.length === 0) break;
      const to = oldest - 1, from = Math.max(floor, to - 3 * 86400000);
      const iso = (ms) => encodeURIComponent(new Date(ms).toISOString());
      const [entries, treatments, devicestatus] = await Promise.all([
        ns(`/entries.json?count=5000&find[date][$gte]=${from}&find[date][$lte]=${to}`),
        ns(`/treatments.json?count=5000&find[created_at][$gte]=${iso(from - 4 * 3600000)}&find[created_at][$lte]=${iso(to)}`),
        ns(`/devicestatus.json?count=5000&find[created_at][$gte]=${iso(from)}&find[created_at][$lte]=${iso(to)}`),
      ]);
      store({ entries, treatments, devicestatus });
      added.entries += entries.length; added.treatments += treatments.length; added.devicestatus += devicestatus.length; added.windows++;
      if (entries.length === 0) break;
    }
    if (added.entries) await matchPending({ retryNoGlucose: true }).catch(() => {});
    return added;
  } finally { backfilling = false; }
}

// Glucose from a LibreView "Glucose Data" CSV export (Reports -> Download glucose data). Readings are
// every 15 minutes, so the match is coarser than from Nightscout, and real Nightscout readings are never overwritten.
export function importLibreCsv(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const headerAt = lines.findIndex((l) => /Device Timestamp/i.test(l));
  if (headerAt < 0) throw new Error('That does not look like a LibreView glucose CSV (no "Device Timestamp" column).');
  const parse = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const head = parse(lines[headerAt]).map((h) => h.trim().toLowerCase());
  const col = (re) => head.findIndex((h) => re.test(h));
  const iTime = col(/device timestamp/), iType = col(/record type/), iHist = col(/historic glucose/), iScan = col(/scan glucose/);
  if (iTime < 0 || (iHist < 0 && iScan < 0)) throw new Error('Could not find the timestamp and glucose columns.');
  const mmol = head[iHist >= 0 ? iHist : iScan].includes('mmol');
  const londonToUtc = (y, mo, d, h, mi) => {
    // Interpret the wall-clock time as Europe/London (BST or GMT) and return UTC milliseconds.
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
    const asLondon = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    return guess - (asLondon - guess);
  };
  let read = 0, added = 0, first = null, last = null;
  const ins = db.prepare('INSERT OR IGNORE INTO ns_entries (date, sgv, direction) VALUES (?, ?, ?)');
  db.transaction(() => {
    for (const line of lines.slice(headerAt + 1)) {
      if (!line.trim()) continue;
      const c = parse(line);
      const type = iType >= 0 ? c[iType]?.trim() : '0';
      if (type !== '0' && type !== '1') continue; // 0 = automatic 15-minute reading, 1 = scan
      const raw = c[iHist >= 0 && c[iHist] ? iHist : iScan];
      const value = Number(raw);
      const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\s+(\d{1,2}):(\d{2})/.exec(c[iTime] || '');
      if (!Number.isFinite(value) || !m) continue;
      const t = londonToUtc(+m[3], +m[2], +m[1], +m[4], +m[5]);
      read++;
      added += ins.run(t, Math.round(mmol ? value * MGDL : value), null).changes;
      first = first == null ? t : Math.min(first, t); last = last == null ? t : Math.max(last, t);
    }
  })();
  if (!read) throw new Error('No glucose readings were found in that file.');
  return { read, added, from: new Date(first).toISOString(), to: new Date(last).toISOString() };
}

export function getLoggerStatus() {
  const e = db.prepare('SELECT COUNT(*) AS n, MIN(date) AS first, MAX(date) AS last FROM ns_entries').get();
  return {
    readings: e.n, since: e.first ? new Date(e.first).toISOString() : null, latest: e.last ? new Date(e.last).toISOString() : null,
    treatments: db.prepare('SELECT COUNT(*) AS n FROM ns_treatments').get().n,
    iobSamples: db.prepare('SELECT COUNT(*) AS n FROM ns_devicestatus').get().n,
  };
}

// Reads the logged data for a window, in the same shape Nightscout's own API uses.
function fetchWindow(fromMs, toMs) {
  return {
    entries: db.prepare('SELECT date, sgv FROM ns_entries WHERE date BETWEEN ? AND ? ORDER BY date').all(fromMs, toMs),
    treatments: db.prepare('SELECT at, event, insulin, carbs, rate, duration, target_top, target_bottom, reason FROM ns_treatments WHERE at BETWEEN ? AND ? ORDER BY at').all(fromMs - 4 * 3600000, toMs)
      .map((t) => ({ created_at: new Date(t.at).toISOString(), eventType: t.event, insulin: t.insulin, carbs: t.carbs, rate: t.rate, duration: t.duration, targetTop: t.target_top, targetBottom: t.target_bottom, reason: t.reason })),
    devicestatus: db.prepare('SELECT at, iob, basal_iob, cob FROM ns_devicestatus WHERE at BETWEEN ? AND ? ORDER BY at').all(fromMs, toMs)
      .map((d) => ({ created_at: new Date(d.at).toISOString(), openaps: { iob: { iob: d.iob, basaliob: d.basal_iob }, suggested: { COB: d.cob } } })),
  };
}

const r1 = (x) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x == null || Number.isNaN(x) ? null : Math.round(x * 100) / 100);

// Nearest reading at or before t (within maxGap ms), else null.
function valueAt(points, t, maxGap) {
  let best = null;
  for (const p of points) { if (p.t <= t && t - p.t <= maxGap) best = p; else if (p.t > t) break; }
  return best;
}

function build(activity, raw) {
  const start = new Date(activity.start_utc).getTime();
  const durMs = Math.max(activity.elapsed_time || activity.moving_time || 0, 60) * 1000;
  const end = start + durMs;
  const rel = (t) => Math.round((t - start) / 60000); // minutes from the start of the activity

  const bg = raw.entries.filter((e) => e.sgv != null && e.date).map((e) => ({ t: e.date, v: e.sgv / MGDL })).sort((a, b) => a.t - b.t);
  let dev = raw.devicestatus.map((d) => {
    const iob = d.openaps?.iob || d.loop?.iob || d.pump?.iob;
    const cob = d.openaps?.suggested?.COB ?? d.loop?.cob?.cob ?? null;
    return { t: new Date(d.created_at || d.openaps?.iob?.time).getTime(), iob: iob?.iob ?? iob?.iob ?? null, basal: iob?.basaliob ?? null, cob };
  }).filter((d) => Number.isFinite(d.t) && d.iob != null).sort((a, b) => a.t - b.t);

  const treatments = raw.treatments.map((t) => ({ ...t, t: new Date(t.created_at).getTime() })).filter((t) => Number.isFinite(t.t)).sort((a, b) => a.t - b.t);
  const boluses = treatments.filter((t) => t.insulin > 0).map((t) => ({ t: t.t, units: t.insulin, kind: t.eventType || 'Bolus' }));
  const carbs = treatments.filter((t) => t.carbs > 0).map((t) => ({ t: t.t, grams: t.carbs }));
  const targets = treatments.filter((t) => /Temporary Target/i.test(t.eventType || '')).map((t) => ({ t: t.t, minutes: t.duration || 0, top: t.targetTop ?? null, bottom: t.targetBottom ?? null, reason: t.reason || '' }));
  const tempBasals = treatments.filter((t) => /Temp Basal/i.test(t.eventType || '') && t.duration > 0)
    .map((t) => ({ from: t.t, to: t.t + t.duration * 60000, rate: t.rate ?? t.absolute ?? null })).filter((b) => b.rate != null);

  // Insulin on board: the loop's own figure when it was logged; otherwise estimated from the
  // boluses (the same 3-hour curve the planner uses), and flagged as an estimate.
  let iobEstimated = false;
  if (!dev.length && boluses.length) {
    iobEstimated = true;
    for (let t = start - PRE_MIN * 60000; t <= end + POST_MIN * 60000; t += 5 * 60000) {
      let iobNow = 0;
      for (const b of boluses) { const tau = (t - b.t) / 3600000; if (tau >= 0 && tau < 3) iobNow += b.units * (1 - tau / 3) ** 1.5; }
      dev.push({ t, iob: iobNow, basal: null, cob: null });
    }
  }

  const inRun = (p) => p.t >= start && p.t <= end;
  // Readings every 15 minutes (a LibreView import) need wider "nearest reading" gaps than 5-minute ones.
  const near = bg.filter((p) => p.t >= start - PRE_MIN * 60000 && p.t <= end);
  const gaps = near.slice(1).map((p, i) => p.t - near[i].t).sort((a, b) => a - b);
  const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 5 * 60000;
  const gapMs = medianGap > 8 * 60000 ? 17 * 60000 : 8 * 60000;
  const nearGap = Math.max(12 * 60000, gapMs);
  const during = bg.filter(inRun);
  const startPt = valueAt(bg, start, 15 * 60000) || bg.find((p) => p.t >= start && p.t - start <= 10 * 60000);
  const endPt = valueAt(bg, end, 15 * 60000);
  const post = bg.filter((p) => p.t > end && p.t <= end + POST_MIN * 60000);
  const pre = bg.filter((p) => p.t >= start - PRE_MIN * 60000 && p.t < start);

  // 5-minute grid, from before the start to after the end, for the chart.
  const series = [];
  for (let t = start - PRE_MIN * 60000; t <= end + POST_MIN * 60000; t += 5 * 60000) {
    const b = valueAt(bg, t, gapMs);
    const d = valueAt(dev, t, 12 * 60000);
    series.push({ m: rel(t), bg: b ? r1(b.v) : null, iob: d ? r2(d.iob) : null, basalIob: d?.basal != null ? r2(d.basal) : null, cob: d?.cob != null ? Math.round(d.cob) : null });
  }

  const vals = during.map((p) => p.v);
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const sd = vals.length > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1)) : null;
  const min = vals.length ? Math.min(...vals) : null;
  const minAt = min != null ? during.find((p) => p.v === min) : null;
  const pct = (fn) => (vals.length ? Math.round((vals.filter(fn).length / vals.length) * 100) : null);
  // Steepest 10-minute fall while active (mmol/L per 10 min, positive = falling).
  let steepest = null;
  for (let i = 0; i < during.length; i++) {
    const later = during.find((p) => p.t >= during[i].t + 9 * 60000 && p.t <= during[i].t + 12 * 60000);
    if (later) { const fall = during[i].v - later.v; if (steepest == null || fall > steepest) steepest = fall; }
  }

  const devDuring = dev.filter(inRun);
  const devStart = valueAt(dev, start, 12 * 60000);
  const devEnd = valueAt(dev, end, 12 * 60000);
  const prevBolus = [...boluses].reverse().find((b) => b.t <= start);
  const bolus4h = boluses.filter((b) => b.t < start && b.t >= start - 4 * 3600000);
  const carbsBefore = carbs.filter((c) => c.t < start && c.t >= start - 3 * 3600000);
  const carbs60 = carbs.filter((c) => c.t < start && c.t >= start - 60 * 60000);
  const carbsDuring = carbs.filter(inRun);
  const smbDuring = boluses.filter(inRun);

  // How much of the run had a zero temp basal (pump effectively suspended), and the average rate.
  let covered = 0, zero = 0, weighted = 0;
  for (const b of tempBasals) {
    const from = Math.max(b.from, start), to = Math.min(b.to, end);
    if (to > from) { const len = to - from; covered += len; weighted += len * b.rate; if (b.rate === 0) zero += len; }
  }

  const activeTarget = targets.find((t) => t.t <= end && t.t + t.minutes * 60000 >= start);
  const at = (label, p) => (p ? r1(p.v) : null);

  const stats = {
    bgStart: at('start', startPt), bgEnd: at('end', endPt),
    bg30BeforeStart: (() => { const p = valueAt(bg, start - 30 * 60000, nearGap); return p ? r1(p.v) : null; })(),
    bgTrendIntoStart: startPt && valueAt(bg, start - 30 * 60000, nearGap) ? r1(startPt.v - valueAt(bg, start - 30 * 60000, nearGap).v) : null,
    bgMin: r1(min), bgMinAtMin: minAt ? rel(minAt.t) : null, bgMax: vals.length ? r1(Math.max(...vals)) : null, bgMean: r1(mean), bgSd: r1(sd), bgCv: mean && sd != null ? Math.round((sd / mean) * 100) : null,
    bgChange: startPt && endPt ? r1(endPt.v - startPt.v) : null,
    fallPer10Min: r1(steepest),
    readingsDuring: vals.length,
    pctBelow: pct((v) => v < LOW), pctInRange: pct((v) => v >= LOW && v <= HIGH), pctAbove: pct((v) => v > HIGH), pctAboveVeryHigh: pct((v) => v > VERY_HIGH),
    post: {
      bgMin: post.length ? r1(Math.min(...post.map((p) => p.v))) : null,
      bgMinAtMin: post.length ? Math.round((post.find((p) => p.v === Math.min(...post.map((q) => q.v))).t - end) / 60000) : null,
      bgMax: post.length ? r1(Math.max(...post.map((p) => p.v))) : null,
      hypo: post.some((p) => p.v < LOW),
    },
    iobStart: devStart ? r2(devStart.iob) : null, iobBasalStart: devStart?.basal != null ? r2(devStart.basal) : null, iobEnd: devEnd ? r2(devEnd.iob) : null,
    iobMinDuring: devDuring.length ? r2(Math.min(...devDuring.map((d) => d.iob))) : null, iobMaxDuring: devDuring.length ? r2(Math.max(...devDuring.map((d) => d.iob))) : null,
    cobStart: devStart?.cob != null ? Math.round(devStart.cob) : null,
    lastBolusUnits: prevBolus ? prevBolus.units : null, lastBolusMinutesBefore: prevBolus ? Math.round((start - prevBolus.t) / 60000) : null,
    bolusUnits4hBefore: r1(bolus4h.reduce((a, b) => a + b.units, 0)),
    carbsGrams3hBefore: Math.round(carbsBefore.reduce((a, c) => a + c.grams, 0)), carbsGrams60mBefore: Math.round(carbs60.reduce((a, c) => a + c.grams, 0)),
    carbsGramsDuring: Math.round(carbsDuring.reduce((a, c) => a + c.grams, 0)),
    bolusUnitsDuring: r1(smbDuring.reduce((a, b) => a + b.units, 0)),
    basalZeroPct: covered ? Math.round((zero / durMs) * 100) : null, basalCoveredPct: Math.round((covered / durMs) * 100), avgTempBasal: covered ? r2(weighted / covered) : null,
    tempTarget: activeTarget ? { top: activeTarget.top, bottom: activeTarget.bottom, reason: activeTarget.reason, startedMinBefore: Math.max(0, Math.round((start - activeTarget.t) / 60000)) } : null,
  };
  stats.iobEstimated = iobEstimated;
  stats.sparseReadings = medianGap > 8 * 60000;
  stats.hypoDuring = min != null && min < LOW;
  stats.hypoWithin2h = Boolean(stats.hypoDuring || stats.post.hypo);
  stats.startedHigh = stats.bgStart != null && stats.bgStart > VERY_HIGH;

  const events = [
    ...boluses.filter((b) => b.t >= start - PRE_MIN * 60000 && b.t <= end + POST_MIN * 60000).map((b) => ({ m: rel(b.t), type: 'bolus', units: b.units })),
    ...carbs.filter((c) => c.t >= start - PRE_MIN * 60000 && c.t <= end + POST_MIN * 60000).map((c) => ({ m: rel(c.t), type: 'carbs', grams: c.grams })),
  ];
  return { series, events, stats, window: { startUtc: activity.start_utc, durationMin: Math.round(durMs / 60000), preMin: PRE_MIN, postMin: POST_MIN } };
}

// Works out (and stores) the glucose picture for one activity.
export async function matchActivity(id, { force = false } = {}) {
  const a = db.prepare('SELECT id, name, sport, day, start_utc, moving_time, elapsed_time, distance FROM strava_activities WHERE id = ?').get(id);
  if (!a) throw new Error('Activity not found.');
  const existing = db.prepare('SELECT * FROM activity_glucose WHERE activity_id = ?').get(id);
  if (existing && !force && (existing.complete || Date.now() - existing.computed_at < 15 * 60000)) return present(a, existing);
  if (!a.start_utc) throw new Error('This activity has no start time.');

  const start = new Date(a.start_utc).getTime();
  const end = start + Math.max(a.elapsed_time || a.moving_time || 0, 60) * 1000;
  const complete = Date.now() > end + (POST_MIN + 10) * 60000;
  let status = 'ok', data = null;
  try {
    const raw = fetchWindow(start - PRE_MIN * 60000, end + POST_MIN * 60000);
    if (raw.entries.filter((e) => e.date >= start && e.date <= end).length < 2) {
      status = 'no_glucose';
      const since = getLoggerStatus().since;
      const at = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      data = { note: since && end < new Date(since).getTime()
        ? `This activity finished (${at(new Date(end).toISOString())}) before the earliest glucose IMS has (${at(since)}). Nightscout only keeps a few hours, so older readings are gone unless AAPS re-uploads its history to Nightscout (IMS will pull it in automatically) or you import a LibreView CSV.`
        : since && start < new Date(since).getTime()
          ? `The glucose IMS has starts partway through this activity (${at(since)}), so it cannot be matched fully. Re-upload from AAPS or import a LibreView CSV to fill the gap.`
          : 'No glucose readings were logged during this activity.' };
    } else data = build(a, raw);
  } catch (err) { status = 'error'; data = { error: err.message }; }
  const row = { computed_at: Date.now(), status, complete: complete && status !== 'error' ? 1 : 0, data: data ? JSON.stringify(data) : null };
  db.prepare(`INSERT INTO activity_glucose (activity_id, computed_at, status, complete, data) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(activity_id) DO UPDATE SET computed_at = excluded.computed_at, status = excluded.status, complete = excluded.complete, data = excluded.data`)
    .run(id, row.computed_at, row.status, row.complete, row.data);
  return present(a, { ...row, activity_id: id });
}

const present = (a, row) => ({
  activity: { id: a.id, name: a.name, sport: a.sport, day: a.day },
  status: row.status, complete: Boolean(row.complete), computedAt: row.computed_at,
  ...(row.data ? JSON.parse(row.data) : {}),
});

export function getStoredMatch(id) {
  const a = db.prepare('SELECT id, name, sport, day FROM strava_activities WHERE id = ?').get(id);
  const row = db.prepare('SELECT * FROM activity_glucose WHERE activity_id = ?').get(id);
  return a && row ? present(a, row) : null;
}

// One-line glucose summary per activity, for the activity table.
export function getGlucoseBadges() {
  const out = {};
  for (const r of db.prepare("SELECT activity_id, status, data FROM activity_glucose WHERE status = 'ok'").all()) {
    const s = JSON.parse(r.data).stats;
    out[r.activity_id] = { bgStart: s.bgStart, bgEnd: s.bgEnd, bgMin: s.bgMin, iobStart: s.iobStart, hypo: s.hypoWithin2h };
  }
  return out;
}

// ---- batch matching --------------------------------------------------------------------
let progress = { running: false, done: 0, total: 0, errors: 0, lastError: null };
export const getMatchProgress = () => ({ ...progress });

// Matches activities that have no glucose row yet (and re-does ones that were still
// waiting for the two hours after the finish). `sports` limits it, e.g. ['Run'].
export async function matchPending({ sports = null, limit = 500, recentOnly = false, retryNoGlucose = false } = {}) {
  if (progress.running) throw new Error('Matching is already running.');
  const params = [];
  let where = `a.moving_time >= 300 AND a.start_utc IS NOT NULL AND (g.activity_id IS NULL OR (g.complete = 0 AND g.status != 'no_glucose')${retryNoGlucose ? " OR g.status = 'no_glucose'" : ''})`;
  if (sports?.length) { where += ` AND a.sport IN (${sports.map(() => '?').join(',')})`; params.push(...sports); }
  if (recentOnly) { where += ' AND a.day >= ?'; params.push(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)); }
  const ids = db.prepare(`SELECT a.id FROM strava_activities a LEFT JOIN activity_glucose g ON g.activity_id = a.id WHERE ${where} ORDER BY a.start_local DESC LIMIT ?`).all(...params, limit).map((r) => r.id);
  progress = { running: true, done: 0, total: ids.length, errors: 0, lastError: null };
  try {
    for (const id of ids) {
      try { const m = await matchActivity(id, { force: true }); if (m.status === 'error') { progress.errors++; progress.lastError = m.error; } }
      catch (err) { progress.errors++; progress.lastError = err.message; }
      progress.done++;
      await new Promise((r) => setImmediate(r)); // the log is local, so no need to slow down
    }
  } finally { progress.running = false; }
  return getMatchProgress();
}

// ---- insights across activities ------------------------------------------------------------
function matched(sport) {
  return db.prepare(`SELECT a.id, a.name, a.sport, a.day, a.distance, a.moving_time, g.data FROM activity_glucose g JOIN strava_activities a ON a.id = g.activity_id
    WHERE g.status = 'ok' ${sport ? 'AND a.sport = ?' : ''} ORDER BY a.start_local DESC`).all(...(sport ? [sport] : []))
    .map((r) => ({ id: r.id, name: r.name, sport: r.sport, day: r.day, km: r.distance ? +(r.distance / 1000).toFixed(1) : 0, minutes: Math.round(r.moving_time / 60), ...JSON.parse(r.data).stats }));
}

const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? r1(v.reduce((a, b) => a + b, 0) / v.length) : null; };

function bucketBy(runs, key, bands) {
  return bands.map(([label, lo, hi]) => {
    const rs = runs.filter((r) => r[key] != null && r[key] >= lo && r[key] < hi);
    return {
      label, runs: rs.length,
      avgStart: avg(rs.map((r) => r.bgStart)), avgMin: avg(rs.map((r) => r.bgMin)), avgChange: avg(rs.map((r) => r.bgChange)),
      avgInRangePct: avg(rs.map((r) => r.pctInRange)), hypoPct: rs.length ? Math.round((rs.filter((r) => r.hypoWithin2h).length / rs.length) * 100) : null,
      avgIobStart: avg(rs.map((r) => r.iobStart)),
    };
  }).filter((b) => b.runs > 0);
}

export function getInsights(sport = 'Run') {
  const runs = matched(sport);
  if (!runs.length) return { sport, runs: 0 };
  const inf = 1e9;
  return {
    sport, runs: runs.length,
    overall: {
      avgStart: avg(runs.map((r) => r.bgStart)), avgMin: avg(runs.map((r) => r.bgMin)), avgChange: avg(runs.map((r) => r.bgChange)),
      avgInRangePct: avg(runs.map((r) => r.pctInRange)), avgBelowPct: avg(runs.map((r) => r.pctBelow)), avgAbovePct: avg(runs.map((r) => r.pctAbove)),
      hypoDuringPct: Math.round((runs.filter((r) => r.hypoDuring).length / runs.length) * 100), hypoWithin2hPct: Math.round((runs.filter((r) => r.hypoWithin2h).length / runs.length) * 100),
      avgIobStart: avg(runs.map((r) => r.iobStart)),
    },
    byStartGlucose: bucketBy(runs, 'bgStart', [['under 5', 0, 5], ['5 to 7', 5, 7], ['7 to 9', 7, 9], ['9 to 11', 9, 11], ['over 11', 11, inf]]),
    byStartIob: bucketBy(runs, 'iobStart', [['under 0.5 U', -inf, 0.5], ['0.5 to 1.5 U', 0.5, 1.5], ['1.5 to 3 U', 1.5, 3], ['over 3 U', 3, inf]]),
    byCarbsBefore: bucketBy(runs, 'carbsGrams60mBefore', [['none in the hour before', 0, 1], ['1 to 20 g', 1, 20], ['over 20 g', 20, inf]]),
    byTimeSinceBolus: bucketBy(runs.map((r) => ({ ...r, hrsSinceBolus: r.lastBolusMinutesBefore != null ? r.lastBolusMinutesBefore / 60 : 99 })), 'hrsSinceBolus', [['under 1 h', 0, 1], ['1 to 2 h', 1, 2], ['2 to 4 h', 2, 4], ['over 4 h', 4, inf]]),
    withTempTarget: (() => { const on = runs.filter((r) => r.tempTarget), off = runs.filter((r) => !r.tempTarget); return { runsWith: on.length, avgMinWith: avg(on.map((r) => r.bgMin)), hypoPctWith: on.length ? Math.round((on.filter((r) => r.hypoWithin2h).length / on.length) * 100) : null, runsWithout: off.length, avgMinWithout: avg(off.map((r) => r.bgMin)), hypoPctWithout: off.length ? Math.round((off.filter((r) => r.hypoWithin2h).length / off.length) * 100) : null }; })(),
    recent: runs.slice(0, 12).map((r) => ({ day: r.day, km: r.km, minutes: r.minutes, bgStart: r.bgStart, bgMin: r.bgMin, bgEnd: r.bgEnd, bgChange: r.bgChange, iobStart: r.iobStart, carbs60mBefore: r.carbsGrams60mBefore, lastBolusMinutesBefore: r.lastBolusMinutesBefore, basalZeroPct: r.basalZeroPct, hypoWithin2h: r.hypoWithin2h, tempTarget: Boolean(r.tempTarget) })),
  };
}

export async function analyseGlucose(sport = 'Run', units = 'km') {
  const ins = getInsights(sport);
  if (ins.runs < 3) throw new Error('Match at least three activities with glucose data first.');
  const prompt =
    `You are helping someone with type 1 diabetes (Omnipod pump, AAPS closed loop, Libre 2 sensor, mmol/L) understand their glucose during ${sport.toLowerCase()}s, from their own logged data. ` +
    `Use British English${units === 'mi' ? ', and write any distances in miles' : ''}. Their in-range band is ${LOW}-${HIGH} mmol/L. Be specific and quote the numbers; do not invent data; say when a group is too small to trust (fewer than about 5 runs).\n\n` +
    `Write short sections: "The picture" (how glucose behaves in their runs overall), "What seems to go well" (the starting conditions linked to steady, in-range runs), ` +
    `"What seems to go wrong" (starting conditions linked to lows during or after the run, or high starts), "Things to try" (2-4 gentle experiments framed as ideas to try over the next few runs and to discuss with their diabetes team - e.g. earlier temporary target, carbs timing, starting glucose window - never specific insulin doses or changes to pump settings), and "How much to trust this" (sample sizes, missing data). ` +
    `Start with one line reminding that this is pattern-spotting from their own data, not medical advice.\n\nDATA (JSON):\n${JSON.stringify(ins)}`;
  const text = (await genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }).generateContent(prompt)).response.text().trim();
  const saved = { at: Date.now(), sport, runs: ins.runs, text, units: normaliseUnits(units) };
  setSetting(`strava_glucose_analysis_${sport}`, JSON.stringify(saved));
  clearUnitCache('glucose', sport);
  return saved;
}

export async function getSavedGlucoseAnalysis(sport = 'Run', units = 'km') {
  try {
    const a = JSON.parse(getSetting(`strava_glucose_analysis_${sport}`) || 'null');
    if (!a) return null;
    return { ...a, text: await textInUnits('glucose', sport, a.text, a.units || 'km', units), units: normaliseUnits(units) };
  } catch (_) { return null; }
}
