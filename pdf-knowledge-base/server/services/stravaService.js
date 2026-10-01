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
try { db.exec('ALTER TABLE strava_activities ADD COLUMN session_tag TEXT'); } catch (_) { /* already there */ }

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
export function listActivities({ sport = '', search = '', from = '', to = '', tag = '', sortBy = 'start_local', sortDir = 'desc', limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (sport) { where.push('sport = ?'); params.push(sport); }
  if (search) { where.push('name LIKE ?'); params.push(`%${String(search).slice(0, 60)}%`); }
  if (from) { where.push('day >= ?'); params.push(from); }
  if (to) { where.push('day <= ?'); params.push(to); }
  if (tag) {
    if (tag === 'none' || tag === 'regular') { where.push("(session_tag IS NULL OR session_tag = '' OR session_tag = 'regular')"); }
    else { where.push('session_tag = ?'); params.push(tag); }
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM strava_activities ${clause}`).get(...params).n;

  // Safe sort column mapping
  const allowedSorts = {
    start_local: 'start_local',
    day: 'start_local',
    name: 'name',
    sport: 'sport',
    distance: 'distance',
    moving_time: 'moving_time',
    avg_speed: 'avg_speed',
    elevation: 'elevation',
    avg_hr: 'avg_hr',
    session_tag: 'session_tag'
  };
  const sortCol = allowedSorts[sortBy] || 'start_local';
  const orderDir = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const rows = db.prepare(`SELECT id, name, sport, start_local, day, distance, moving_time, elapsed_time, elevation, avg_speed, max_speed, avg_hr, max_hr, avg_watts, kudos, trainer, commute, session_tag
    FROM strava_activities ${clause} ORDER BY ${sortCol} ${orderDir} LIMIT ? OFFSET ?`).all(...params, Math.min(200, Number(limit) || 50), Math.max(0, Number(offset) || 0));
  return { total, activities: rows };
}

export function setActivitySessionTag(id, tag) {
  const cleanTag = tag === 'speed' || tag === 'hill' ? tag : null;
  db.prepare('UPDATE strava_activities SET session_tag = ? WHERE id = ?').run(cleanTag, Number(id));
  const row = db.prepare('SELECT id, name, sport, start_local, day, distance, moving_time, elapsed_time, elevation, avg_speed, max_speed, avg_hr, max_hr, avg_watts, kudos, trainer, commute, session_tag FROM strava_activities WHERE id = ?').get(Number(id));
  return row;
}

export const listSports = () => db.prepare('SELECT sport, COUNT(*) AS n FROM strava_activities GROUP BY sport ORDER BY n DESC').all();

const addDays = (dateStr, n) => { const d = new Date(`${dateStr}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const mondayOf = (dateStr) => { const d = new Date(`${dateStr}T00:00:00Z`); const wd = (d.getUTCDay() + 6) % 7; return addDays(dateStr, -wd); };

// Standard Heart Rate Zone thresholds for training volume distribution
// - Aerobic (Zone 1 & 2): < 145 bpm (base building, fat oxidation, recovery)
// - Threshold (Zone 3 & 4): 145 - 168 bpm (tempo, lactate threshold, race pace)
// - VO2 Max (Zone 5): > 168 bpm (anaerobic intervals, peak cardiac output)
export const HR_ZONES = {
  aerobic: { label: 'Aerobic (Z1-Z2)', range: '< 145 bpm', min: 0, max: 144, color: '#10b981', desc: 'Base aerobic development & fat oxidation' },
  threshold: { label: 'Threshold (Z3-Z4)', range: '145-168 bpm', min: 145, max: 168, color: '#f59e0b', desc: 'Lactate threshold & sustained tempo' },
  vo2max: { label: 'VO2 Max (Z5)', range: '> 168 bpm', min: 169, max: 999, color: '#ef4444', desc: 'High-intensity neuromuscular & peak aerobic power' },
};

function totals(fromDay, toDay, sport = '') {
  const r = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(distance),0) AS distance, COALESCE(SUM(moving_time),0) AS time, COALESCE(SUM(elevation),0) AS elevation,
    AVG(avg_hr) AS avgHr,
    COALESCE(SUM(CASE WHEN sport IN ('Run','TrailRun','VirtualRun') THEN distance END),0) AS runDistance,
    COALESCE(SUM(CASE WHEN sport IN ('Run','TrailRun','VirtualRun') THEN moving_time END),0) AS runTime,
    COALESCE(SUM(CASE WHEN sport IN ('Run','TrailRun','VirtualRun') AND (session_tag IS NULL OR session_tag NOT IN ('speed', 'hill')) THEN distance END),0) AS paceRunDistance,
    COALESCE(SUM(CASE WHEN sport IN ('Run','TrailRun','VirtualRun') AND (session_tag IS NULL OR session_tag NOT IN ('speed', 'hill')) THEN moving_time END),0) AS paceRunTime,
    COALESCE(SUM(CASE WHEN session_tag = 'speed' THEN 1 ELSE 0 END),0) AS speedCount,
    COALESCE(SUM(CASE WHEN session_tag = 'hill' THEN 1 ELSE 0 END),0) AS hillCount,
    -- Heart Rate Zone Aggregations
    COALESCE(SUM(CASE WHEN avg_hr IS NOT NULL AND avg_hr < 145 THEN distance END),0) AS hrAerobicDistance,
    COALESCE(SUM(CASE WHEN avg_hr IS NOT NULL AND avg_hr < 145 THEN moving_time END),0) AS hrAerobicTime,
    COALESCE(SUM(CASE WHEN avg_hr IS NOT NULL AND avg_hr < 145 THEN 1 ELSE 0 END),0) AS hrAerobicCount,
    COALESCE(SUM(CASE WHEN avg_hr >= 145 AND avg_hr <= 168 THEN distance END),0) AS hrThresholdDistance,
    COALESCE(SUM(CASE WHEN avg_hr >= 145 AND avg_hr <= 168 THEN moving_time END),0) AS hrThresholdTime,
    COALESCE(SUM(CASE WHEN avg_hr >= 145 AND avg_hr <= 168 THEN 1 ELSE 0 END),0) AS hrThresholdCount,
    COALESCE(SUM(CASE WHEN avg_hr > 168 THEN distance END),0) AS hrVo2MaxDistance,
    COALESCE(SUM(CASE WHEN avg_hr > 168 THEN moving_time END),0) AS hrVo2MaxTime,
    COALESCE(SUM(CASE WHEN avg_hr > 168 THEN 1 ELSE 0 END),0) AS hrVo2MaxCount,
    COALESCE(SUM(CASE WHEN avg_hr IS NOT NULL THEN distance END),0) AS hrTotalDistance,
    COALESCE(SUM(CASE WHEN avg_hr IS NOT NULL THEN moving_time END),0) AS hrTotalTime,
    COALESCE(SUM(CASE WHEN avg_hr IS NOT NULL THEN 1 ELSE 0 END),0) AS hrTotalCount
    FROM strava_activities WHERE day >= ? AND day <= ? ${sport ? 'AND sport = ?' : ''}`).get(fromDay, toDay, ...(sport ? [sport] : []));
  // Average running pace (min per km) = running time / running distance; null when there was no standard/aerobic running.
  // Speed and hill sessions are excluded from average pace calculations so interval rests or steep climbing do not distort standard pace.
  const paceMinKm = r.paceRunDistance > 500 ? +(r.paceRunTime / 60 / (r.paceRunDistance / 1000)).toFixed(3) : null;
  const hrTotalTime = r.hrTotalTime || 0;
  const hrTotalDist = r.hrTotalDistance || 0;

  return {
    count: r.count,
    distanceKm: +(r.distance / 1000).toFixed(1),
    hours: +(r.time / 3600).toFixed(1),
    elevationM: Math.round(r.elevation),
    avgHr: r.avgHr ? Math.round(r.avgHr) : null,
    runKm: +(r.runDistance / 1000).toFixed(1),
    paceRunKm: +(r.paceRunDistance / 1000).toFixed(1),
    paceMinKm,
    speedCount: r.speedCount,
    hillCount: r.hillCount,
    hrZones: {
      totalCount: r.hrTotalCount,
      totalKm: +(hrTotalDist / 1000).toFixed(1),
      totalHours: +(hrTotalTime / 3600).toFixed(1),
      aerobic: {
        km: +(r.hrAerobicDistance / 1000).toFixed(1),
        hours: +(r.hrAerobicTime / 3600).toFixed(1),
        count: r.hrAerobicCount,
        pctTime: hrTotalTime > 0 ? Math.round((r.hrAerobicTime / hrTotalTime) * 100) : 0,
        pctDist: hrTotalDist > 0 ? Math.round((r.hrAerobicDistance / hrTotalDist) * 100) : 0,
      },
      threshold: {
        km: +(r.hrThresholdDistance / 1000).toFixed(1),
        hours: +(r.hrThresholdTime / 3600).toFixed(1),
        count: r.hrThresholdCount,
        pctTime: hrTotalTime > 0 ? Math.round((r.hrThresholdTime / hrTotalTime) * 100) : 0,
        pctDist: hrTotalDist > 0 ? Math.round((r.hrThresholdDistance / hrTotalDist) * 100) : 0,
      },
      vo2max: {
        km: +(r.hrVo2MaxDistance / 1000).toFixed(1),
        hours: +(r.hrVo2MaxTime / 3600).toFixed(1),
        count: r.hrVo2MaxCount,
        pctTime: hrTotalTime > 0 ? Math.round((r.hrVo2MaxTime / hrTotalTime) * 100) : 0,
        pctDist: hrTotalDist > 0 ? Math.round((r.hrVo2MaxDistance / hrTotalDist) * 100) : 0,
      }
    }
  };
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

  const rec = (order, extra = '') => db.prepare(`SELECT id, name, sport, start_local, day, distance, moving_time, elevation, avg_speed, session_tag FROM strava_activities WHERE distance > 0 ${extra} ORDER BY ${order} LIMIT 1`).get();
  
  // Specific all-time milestones for running and endurance
  const firstClubRun = db.prepare(`SELECT id, name, sport, start_local, day, distance, moving_time, elevation, avg_speed FROM strava_activities WHERE sport IN ('Run','TrailRun','VirtualRun') AND (name LIKE '%1st Run%' OR day = '2024-04-23') ORDER BY start_local ASC LIMIT 1`).get();
  const earliestEverRun = db.prepare(`SELECT id, name, sport, start_local, day, distance, moving_time, elevation, avg_speed FROM strava_activities WHERE sport IN ('Run','TrailRun','VirtualRun') ORDER BY start_local ASC LIMIT 1`).get();
  const longestRun = db.prepare(`SELECT id, name, sport, start_local, day, distance, moving_time, elevation, avg_speed FROM strava_activities WHERE sport IN ('Run','TrailRun','VirtualRun') ORDER BY distance DESC LIMIT 1`).get();
  const totalRuns = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(distance),0) AS distance, COALESCE(SUM(moving_time),0) AS time, COALESCE(SUM(elevation),0) AS elevation FROM strava_activities WHERE sport IN ('Run','TrailRun','VirtualRun')`).get();

  const records = {
    longest: rec('distance DESC'),
    longestRun,
    firstEverRun: earliestEverRun,
    firstClubRun,
    mostClimbing: rec('elevation DESC'),
    longestTime: rec('moving_time DESC'),
    fastestRun: rec('avg_speed DESC', "AND sport IN ('Run','TrailRun') AND distance >= 5000 AND (session_tag IS NULL OR session_tag NOT IN ('speed', 'hill'))"),
    fastestRide: rec('avg_speed DESC', "AND sport IN ('Ride','GravelRide','MountainBikeRide','EBikeRide') AND distance >= 15000"),
    allTimeRuns: {
      count: totalRuns.count,
      totalKm: +(totalRuns.distance / 1000).toFixed(1),
      totalMiles: +(totalRuns.distance / 1609.344).toFixed(1),
      totalHours: +(totalRuns.time / 3600).toFixed(1),
      totalElevationM: Math.round(totalRuns.elevation)
    }
  };

  const activeDays = db.prepare('SELECT COUNT(DISTINCT day) AS n FROM strava_activities WHERE day >= ?').get(addDays(today, -29)).n;
  return { today, periods, weekly, monthly, bySport, records, activeDaysLast30: activeDays };
}

const fmtActivity = (a) => {
  const tagStr = a.session_tag === 'speed' ? ' [Speed Session - Pace Excluded from Averages]' : a.session_tag === 'hill' ? ' [Hill Session - Pace Excluded from Averages]' : '';
  const miles = (a.distance / 1609.344).toFixed(1);
  return `${a.day} ${a.sport} "${a.name}"${tagStr} ${(a.distance / 1000).toFixed(1)} km (${miles} mi) in ${Math.round(a.moving_time / 60)} min${a.elevation ? `, +${Math.round(a.elevation)} m` : ''}${a.avg_hr ? `, avg HR ${Math.round(a.avg_hr)}` : ''}`;
};

export function describeTraining(periodDays = 28) {
  const s = getSummary();
  const key = periodDays === 'all' || periodDays === 'all_time' ? 'all_time' : periodDays <= 7 ? 'last7' : periodDays <= 28 ? 'last28' : 'last365';
  const recent = listActivities({ limit: 8 }).activities.map(fmtActivity);

  const formatRunMilestone = (r) => {
    if (!r) return null;
    const km = (r.distance / 1000).toFixed(1);
    const miles = (r.distance / 1609.344).toFixed(1);
    const mins = Math.round(r.moving_time / 60);
    const d = new Date(r.day + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    return {
      date: d,
      rawDay: r.day,
      name: r.name,
      distanceKm: Number(km),
      distanceMiles: Number(miles),
      durationMin: mins,
      description: `"${r.name}" on ${d}: ${miles} miles (${km} km) in ${mins} minutes`
    };
  };

  const allTimeRunning = {
    totalRuns: s.records.allTimeRuns.count,
    totalDistanceKm: s.records.allTimeRuns.totalKm,
    totalDistanceMiles: s.records.allTimeRuns.totalMiles,
    totalHours: s.records.allTimeRuns.totalHours,
    firstEverRun: formatRunMilestone(s.records.firstEverRun),
    firstClubRun: formatRunMilestone(s.records.firstClubRun),
    longestRun: formatRunMilestone(s.records.longestRun),
    fastest5kPlusRun: s.records.fastestRun ? formatRunMilestone(s.records.fastestRun) : null
  };

  return {
    period: key,
    now: key === 'all_time' ? s.periods['last365'] : s.periods[key],
    before: key === 'all_time' ? s.periods['last365'].previous : s.periods[key].previous,
    activeDaysLast30: s.activeDaysLast30,
    bySport: s.bySport.slice(0, 5),
    allTimeRunning,
    allTimeRecords: {
      longestActivity: s.records.longest ? `"${s.records.longest.name}" (${(s.records.longest.distance / 1000).toFixed(1)} km / ${(s.records.longest.distance / 1609.344).toFixed(1)} mi) on ${s.records.longest.day}` : null,
      longestRun: allTimeRunning.longestRun ? allTimeRunning.longestRun.description : null,
      firstRun: allTimeRunning.firstClubRun ? allTimeRunning.firstClubRun.description : allTimeRunning.firstEverRun ? allTimeRunning.firstEverRun.description : null,
      mostClimbing: s.records.mostClimbing ? `"${s.records.mostClimbing.name}" (${Math.round(s.records.mostClimbing.elevation)} m climbed) on ${s.records.mostClimbing.day}` : null
    },
    recentActivities: recent
  };
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
    `CRITICAL RULE ON SPEED AND HILL SESSIONS:\n` +
    `Activities tagged as [Speed Session] or [Hill Session] have their distance fully credited to weekly volume and load totals, but their pace is intentionally excluded from baseline running averages. Do NOT interpret the overall average pace of interval rests or hill climbs as aerobic fitness deterioration or use their average pace in general pacing advice unless explicitly asked for.\n\n` +
    `HEART RATE ZONE POLARISATION (Aerobic vs Threshold vs VO2 Max):\n` +
    `Volume is categorised across three primary physiological heart rate bands:\n` +
    `- Aerobic (Z1-Z2 < 145 bpm): Base aerobic endurance, mitochondrial density & fat metabolism\n` +
    `- Threshold (Z3-Z4 145-168 bpm): Lactate threshold, tempo & race pace resilience\n` +
    `- VO2 Max (Z5 > 168 bpm): High-intensity anaerobic power & peak cardiovascular stroke volume\n` +
    `Evaluate whether the runner maintains a healthy 80/20 polarisation or if too much volume is creeping into the grey/threshold zone.\n\n` +
    `Write short sections with these headings: "Where you are now", "What is going well", "Watch out for", "Patterns", "Next 2 weeks" (3 concrete, modest suggestions). ` +
    `Comment on volume trend (last 28 days vs the 28 before), consistency (active days in the last 30: ${s.activeDaysLast30}), sport mix, heart rate zone distribution, and any sudden jumps in weekly load (more than about 10-15% up) that raise injury risk.\n\n` +
    `PERIOD TOTALS & HR ZONES (last 7 / 28 / 365 days, each with the equal period before it):\n${JSON.stringify(s.periods)}\n\n` +
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

