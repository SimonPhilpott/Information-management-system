import db, { getSetting, setSetting } from '../db/database.js';
import config from '../config.js';
import { encryptSecret, decryptSecret } from './wifiService.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { textInUnits, clearUnitCache, normaliseUnits } from './aiTextService.js';

// Strava activities, logged locally for analysis. Sign-in is Strava's OAuth flow
// (the default token on the Strava API settings page only has the basic "read" scope,
// which cannot read activities, so the user connects once with activity:read_all).
// Credentials (client id / secret and the access + refresh tokens) are stored
// ENCRYPTED in the settings table - never in a file that is committed.
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
const API = 'https://www.strava.com/api/v3';
const CRED_KEY = 'strava_credentials';

db.exec(`
  CREATE TABLE IF NOT EXISTS strava_activities (
    id INTEGER PRIMARY KEY,
    name TEXT,
    sport TEXT,
    start_local TEXT NOT NULL,
    day TEXT NOT NULL,
    distance REAL,
    moving_time INTEGER,
    elapsed_time INTEGER,
    elevation REAL,
    avg_speed REAL,
    max_speed REAL,
    avg_hr REAL,
    max_hr REAL,
    avg_watts REAL,
    kilojoules REAL,
    kudos INTEGER,
    trainer INTEGER,
    commute INTEGER,
    raw TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_strava_day ON strava_activities(day);
  CREATE INDEX IF NOT EXISTS idx_strava_sport ON strava_activities(sport, day);
`);
try { db.exec('ALTER TABLE strava_activities ADD COLUMN start_utc TEXT'); } catch (_) { /* already there */ }

// ---- credentials ------------------------------------------------------------------
function readCreds() {
  try {
    const raw = getSetting(CRED_KEY);
    return raw ? JSON.parse(decryptSecret(JSON.parse(raw))) : {};
  } catch (_) { return {}; }
}
function writeCreds(creds) { setSetting(CRED_KEY, JSON.stringify(encryptSecret(JSON.stringify(creds)))); }

export function saveAppCredentials({ clientId, clientSecret }) {
  const c = readCreds();
  if (clientId !== undefined) {
    const id = String(clientId).trim();
    if (!/^\d{3,12}$/.test(id)) throw new Error('The Client ID is the number shown on your Strava API settings page.');
    c.clientId = id;
  }
  if (clientSecret !== undefined && String(clientSecret).trim()) {
    const sec = String(clientSecret).trim();
    if (!/^[0-9a-f]{30,64}$/i.test(sec)) throw new Error('That does not look like a Strava client secret.');
    c.clientSecret = sec;
  }
  writeCreds(c);
  return getStatus();
}

export function disconnect() {
  const c = readCreds();
  delete c.accessToken; delete c.refreshToken; delete c.expiresAt; delete c.athlete; delete c.scope;
  writeCreds(c);
}

export function redirectUri() { return `http://localhost:${config.port}/api/strava/callback`; }

export function authorizeUrl(state, redirect = redirectUri()) {
  const c = readCreds();
  if (!c.clientId || !c.clientSecret) throw new Error('Save your Strava Client ID and Client Secret first.');
  const q = new URLSearchParams({
    client_id: c.clientId, response_type: 'code', redirect_uri: redirect,
    approval_prompt: 'auto', scope: 'read,activity:read_all', state,
  });
  return `https://www.strava.com/oauth/authorize?${q}`;
}

async function tokenRequest(body) {
  const c = readCreds();
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Strava said no: ${data.message || res.status}${data.errors?.[0]?.field ? ` (${data.errors[0].field})` : ''}`);
  return data;
}

// Trades the one-time code from the redirect for tokens and remembers who connected.
export async function completeAuthorisation(code, grantedScope = '') {
  if (!/activity:read/.test(grantedScope)) throw new Error('Strava did not grant permission to read your activities. Connect again and leave "View data about your activities" ticked.');
  const data = await tokenRequest({ code, grant_type: 'authorization_code' });
  const c = readCreds();
  Object.assign(c, { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at * 1000, scope: grantedScope, athlete: { id: data.athlete?.id, name: [data.athlete?.firstname, data.athlete?.lastname].filter(Boolean).join(' ') } });
  writeCreds(c);
  return c.athlete;
}

async function accessToken() {
  const c = readCreds();
  if (!c.refreshToken) throw new Error('Not connected to Strava yet.');
  if (c.accessToken && c.expiresAt - Date.now() > 120000) return c.accessToken;
  const data = await tokenRequest({ grant_type: 'refresh_token', refresh_token: c.refreshToken });
  Object.assign(c, { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at * 1000 });
  writeCreds(c);
  return c.accessToken;
}

let rateNote = null;
async function api(pathAndQuery) {
  const res = await fetch(`${API}${pathAndQuery}`, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  rateNote = { usage: res.headers.get('x-readratelimit-usage'), limit: res.headers.get('x-readratelimit-limit') };
  if (res.status === 429) throw new Error('Strava rate limit reached (100 requests per 15 minutes) - try again shortly.');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Strava said no: ${data.message || res.status}`);
  return data;
}

export function getStatus(callbackHost = null) {
  const c = readCreds();
  const row = db.prepare('SELECT COUNT(*) AS n, MAX(day) AS latest, MIN(day) AS earliest FROM strava_activities').get();
  return {
    hasClientId: Boolean(c.clientId), hasClientSecret: Boolean(c.clientSecret),
    connected: Boolean(c.refreshToken), athlete: c.athlete || null,
    canReadActivities: /activity:read/.test(c.scope || ''),
    activityCount: row.n, earliest: row.earliest, latest: row.latest,
    lastSync: Number(getSetting('strava_last_sync')) || null, lastSyncError: getSetting('strava_last_error') || null,
    redirectUri: redirectUri(), callbackDomain: callbackHost || new URL(redirectUri()).hostname, rate: rateNote,
  };
}

// ---- syncing -----------------------------------------------------------------------
const upsert = db.prepare(`INSERT INTO strava_activities
  (id, name, sport, start_local, day, start_utc, distance, moving_time, elapsed_time, elevation, avg_speed, max_speed, avg_hr, max_hr, avg_watts, kilojoules, kudos, trainer, commute, raw)
  VALUES (@id, @name, @sport, @start_local, @day, @start_utc, @distance, @moving_time, @elapsed_time, @elevation, @avg_speed, @max_speed, @avg_hr, @max_hr, @avg_watts, @kilojoules, @kudos, @trainer, @commute, @raw)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, sport=excluded.sport, distance=excluded.distance, moving_time=excluded.moving_time,
    elapsed_time=excluded.elapsed_time, elevation=excluded.elevation, avg_speed=excluded.avg_speed, max_speed=excluded.max_speed,
    avg_hr=excluded.avg_hr, max_hr=excluded.max_hr, avg_watts=excluded.avg_watts, kilojoules=excluded.kilojoules, kudos=excluded.kudos, raw=excluded.raw`);

const toRow = (a) => ({
  id: a.id, name: a.name || '', sport: a.sport_type || a.type || 'Other',
  start_local: a.start_date_local || a.start_date, start_utc: a.start_date || null, day: String(a.start_date_local || a.start_date).slice(0, 10),
  distance: a.distance ?? null, moving_time: a.moving_time ?? null, elapsed_time: a.elapsed_time ?? null, elevation: a.total_elevation_gain ?? null,
  avg_speed: a.average_speed ?? null, max_speed: a.max_speed ?? null, avg_hr: a.average_heartrate ?? null, max_hr: a.max_heartrate ?? null,
  avg_watts: a.average_watts ?? null, kilojoules: a.kilojoules ?? null, kudos: a.kudos_count ?? 0, trainer: a.trainer ? 1 : 0, commute: a.commute ? 1 : 0,
  raw: JSON.stringify({ ...a, map: a.map ? { summary_polyline: a.map.summary_polyline } : undefined }),
});

let syncing = false;
// Pulls new activities (everything on the first run, then only what is newer than the
// latest one, with a 3-day overlap so edits to recent activities are picked up).
export async function syncActivities({ full = false } = {}) {
  if (syncing) throw new Error('A sync is already running.');
  syncing = true;
  try {
    const st = getStatus();
    if (!st.connected) throw new Error('Not connected to Strava yet.');
    if (!st.canReadActivities) throw new Error('Strava has not granted permission to read activities - press Connect Strava again.');
    let after = 0;
    if (!full && st.latest) after = Math.floor(new Date(`${st.latest}T00:00:00Z`).getTime() / 1000) - 3 * 86400;
    let page = 1, added = 0, seen = 0;
    for (;;) {
      const batch = await api(`/athlete/activities?per_page=200&page=${page}${after ? `&after=${after}` : ''}`);
      if (!Array.isArray(batch)) throw new Error('Unexpected reply from Strava.');
      db.transaction(() => { for (const a of batch) upsert.run(toRow(a)); })();
      seen += batch.length;
      if (batch.length < 200) break;
      page++;
      if (page > 40) break; // 8,000 activities is plenty for one sync
    }
    added = seen;
    setSetting('strava_last_sync', String(Date.now()));
    setSetting('strava_last_error', '');
    // Match new activities with what Nightscout recorded around them (in the background).
    import('./runGlucoseService.js').then((m) => m.matchPending({ recentOnly: true })).catch((err) => console.error('[Strava] glucose matching:', err.message));
    return { fetched: added, total: getStatus().activityCount };
  } catch (err) {
    setSetting('strava_last_error', err.message);
    throw err;
  } finally { syncing = false; }
}

// ---- reading & analysis ---------------------------------------------------------------
export function listActivities({ sport = '', search = '', from = '', to = '', limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (sport) { where.push('sport = ?'); params.push(sport); }
  if (search) { where.push('name LIKE ?'); params.push(`%${String(search).slice(0, 60)}%`); }
  if (from) { where.push('day >= ?'); params.push(from); }
  if (to) { where.push('day <= ?'); params.push(to); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM strava_activities ${clause}`).get(...params).n;
  const rows = db.prepare(`SELECT id, name, sport, start_local, day, distance, moving_time, elapsed_time, elevation, avg_speed, max_speed, avg_hr, max_hr, avg_watts, kudos, trainer, commute
    FROM strava_activities ${clause} ORDER BY start_local DESC LIMIT ? OFFSET ?`).all(...params, Math.min(200, Number(limit) || 50), Math.max(0, Number(offset) || 0));
  return { total, activities: rows };
}

export const listSports = () => db.prepare('SELECT sport, COUNT(*) AS n FROM strava_activities GROUP BY sport ORDER BY n DESC').all();

const addDays = (dateStr, n) => { const d = new Date(`${dateStr}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const mondayOf = (dateStr) => { const d = new Date(`${dateStr}T00:00:00Z`); const wd = (d.getUTCDay() + 6) % 7; return addDays(dateStr, -wd); };

function totals(fromDay, toDay, sport = '') {
  const r = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(distance),0) AS distance, COALESCE(SUM(moving_time),0) AS time, COALESCE(SUM(elevation),0) AS elevation,
    AVG(avg_hr) AS avgHr,
    COALESCE(SUM(CASE WHEN sport IN ('Run','TrailRun','VirtualRun') THEN distance END),0) AS runDistance,
    COALESCE(SUM(CASE WHEN sport IN ('Run','TrailRun','VirtualRun') THEN moving_time END),0) AS runTime
    FROM strava_activities WHERE day >= ? AND day <= ? ${sport ? 'AND sport = ?' : ''}`).get(fromDay, toDay, ...(sport ? [sport] : []));
  // Average running pace (min per km) = running time / running distance; null when there was no running.
  const paceMinKm = r.runDistance > 500 ? +(r.runTime / 60 / (r.runDistance / 1000)).toFixed(3) : null;
  return { count: r.count, distanceKm: +(r.distance / 1000).toFixed(1), hours: +(r.time / 3600).toFixed(1), elevationM: Math.round(r.elevation), avgHr: r.avgHr ? Math.round(r.avgHr) : null, runKm: +(r.runDistance / 1000).toFixed(1), paceMinKm };
}

export function getSummary() {
  const today = todayStr();
  const periods = {};
  for (const [key, days] of [['last7', 7], ['last28', 28], ['last365', 365]]) {
    periods[key] = { ...totals(addDays(today, -(days - 1)), today), previous: totals(addDays(today, -(2 * days - 1)), addDays(today, -days)) };
  }

  const weekly = [];
  const thisMonday = mondayOf(today);
  for (let i = 25; i >= 0; i--) {
    const start = addDays(thisMonday, -7 * i);
    weekly.push({ weekStart: start, ...totals(start, addDays(start, 6)) });
  }
  const monthly = [];
  const [y, m] = today.split('-').map(Number);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const start = d.toISOString().slice(0, 10);
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    monthly.push({ month: start.slice(0, 7), ...totals(start, end) });
  }

  const bySport = db.prepare(`SELECT sport, COUNT(*) AS count, SUM(distance)/1000.0 AS km, SUM(moving_time)/3600.0 AS hours, SUM(elevation) AS elevation
    FROM strava_activities GROUP BY sport ORDER BY hours DESC`).all().map((r) => ({ sport: r.sport, count: r.count, km: +r.km.toFixed(1), hours: +r.hours.toFixed(1), elevationM: Math.round(r.elevation || 0) }));

  const rec = (order, extra = '') => db.prepare(`SELECT id, name, sport, day, distance, moving_time, elevation, avg_speed FROM strava_activities WHERE distance > 0 ${extra} ORDER BY ${order} LIMIT 1`).get();
  const records = {
    longest: rec('distance DESC'),
    mostClimbing: rec('elevation DESC'),
    longestTime: rec('moving_time DESC'),
    fastestRun: rec('avg_speed DESC', "AND sport IN ('Run','TrailRun') AND distance >= 5000"),
    fastestRide: rec('avg_speed DESC', "AND sport IN ('Ride','GravelRide','MountainBikeRide','EBikeRide') AND distance >= 15000"),
  };

  const activeDays = db.prepare('SELECT COUNT(DISTINCT day) AS n FROM strava_activities WHERE day >= ?').get(addDays(today, -29)).n;
  return { today, periods, weekly, monthly, bySport, records, activeDaysLast30: activeDays };
}

const fmtActivity = (a) => `${a.day} ${a.sport} "${a.name}" ${(a.distance / 1000).toFixed(1)} km in ${Math.round(a.moving_time / 60)} min${a.elevation ? `, +${Math.round(a.elevation)} m` : ''}${a.avg_hr ? `, avg HR ${Math.round(a.avg_hr)}` : ''}`;

export function describeTraining(periodDays = 28) {
  const s = getSummary();
  const key = periodDays <= 7 ? 'last7' : periodDays <= 28 ? 'last28' : 'last365';
  const recent = listActivities({ limit: 8 }).activities.map(fmtActivity);
  return { period: key, now: s.periods[key], before: s.periods[key].previous, activeDaysLast30: s.activeDaysLast30, bySport: s.bySport.slice(0, 5), recentActivities: recent };
}

// A written analysis of the training log by Gemini, kept so the page can show it again.
const unitNote = (units) => (units === 'mi' ? 'Write distances in MILES and pace in min per mile (the data below is in kilometres and min per km - convert: 1 mile = 1.609 km); elevation stays in metres.' : 'Write distances in kilometres and pace in min per km; elevation in metres.');
export async function analyse(units = 'km') {
  const st = getStatus();
  if (!st.activityCount) throw new Error('Sync your activities first.');
  const s = getSummary();
  const recent = listActivities({ limit: 25 }).activities.map(fmtActivity);
  const prompt =
    `You are a sensible, encouraging running/cycling/fitness coach reviewing one person's Strava log. Today is ${s.today}. Use British English. ${unitNote(units)} ` +
    `Base everything on the numbers below; do not invent activities, injuries or goals. Where there is not enough data, say so.\n\n` +
    `Write short sections with these headings: "Where you are now", "What is going well", "Watch out for", "Patterns", "Next 2 weeks" (3 concrete, modest suggestions). ` +
    `Comment on volume trend (last 28 days vs the 28 before), consistency (active days in the last 30: ${s.activeDaysLast30}), sport mix, and any sudden jumps in weekly load (more than about 10-15% up) that raise injury risk.\n\n` +
    `PERIOD TOTALS (last 7 / 28 / 365 days, each with the equal period before it):\n${JSON.stringify(s.periods)}\n\n` +
    `WEEKLY TOTALS, oldest to newest (last 26 weeks):\n${JSON.stringify(s.weekly.map((w) => [w.weekStart, w.count, w.distanceKm, w.hours, w.elevationM]))}\n(each row: week starting, activities, km, hours, metres climbed)\n\n` +
    `BY SPORT (all time):\n${JSON.stringify(s.bySport)}\n\nRECORDS:\n${JSON.stringify(s.records)}\n\nLATEST 25 ACTIVITIES:\n${recent.join('\n')}`;
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const text = (await model.generateContent(prompt)).response.text().trim();
  setSetting('strava_analysis', JSON.stringify({ at: Date.now(), text, units: normaliseUnits(units) }));
  clearUnitCache('analysis', 'all');
  return { at: Date.now(), text };
}

export async function getSavedAnalysis(units = 'km') {
  try {
    const a = JSON.parse(getSetting('strava_analysis') || 'null');
    if (!a) return null;
    return { at: a.at, text: await textInUnits('analysis', 'all', a.text, a.units || 'km', units), units: normaliseUnits(units) };
  } catch (_) { return null; }
}
