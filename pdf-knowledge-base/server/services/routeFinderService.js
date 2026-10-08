import db, { getSetting, setSetting } from '../db/database.js';
import { refreshEvents, getEventsOn } from './calendarService.js';
import { listRoutes, getRoute, listKomootTours, importKomootTour, getKomootStatus, deleteRoute, hiddenKomootIds } from './routeService.js';
import { routeRunHistory, havM, shareNear } from './runPlanService.js';
import { describeMissing, describing, descriptionOf, landmarksOf, landmarkSentence } from './routeDescriptionService.js';

// Route finder and duplicate finder for the Run Planner's saved routes (Komoot imports and GPX files).
// The finder narrows the routes down by shape (loop / there and back / one way), a distance or a run
// time - the time coming from how long the user actually took on that route (their Strava runs matched
// to it), or an estimate from current fitness when they have never run it. The duplicate finder groups
// routes that are the same line on the map, whatever they are called.

// ---- shape --------------------------------------------------------------------------------------

const lengthM = (path) => path.reduce((n, p, i) => (i ? n + havM(path[i - 1], p) : 0), 0);

// 'loop' | 'out-and-back' | 'one-way', from the map line.
export function routeShape(path) {
  if (!path || path.length < 4) return 'unknown';
  const total = lengthM(path);
  // ends more than 500 m (or 5% of the length) apart: it doesn't come back to the start
  if (havM(path[0], path.at(-1)) > Math.max(500, total * 0.05)) return 'one-way';
  // comes back the way it went: the second half retraces the first
  let acc = 0, mid = 1;
  for (; mid < path.length; mid++) { acc += havM(path[mid - 1], path[mid]); if (acc >= total / 2) break; }
  const out = path.slice(0, mid + 1), back = path.slice(mid).reverse();
  return shareNear(back, out, 60) >= 0.7 ? 'out-and-back' : 'loop';
}

const SHAPE_LABEL = { loop: 'Loop', 'out-and-back': 'There and back', 'one-way': 'One way', unknown: 'Unknown shape' };

// ---- the finder ---------------------------------------------------------------------------------

// Matching every route against every Strava run is slow with 100+ routes, so each route's history is
// kept until the activity count changes (a new run synced) or ten minutes pass.
const historyCache = new Map();
function cachedHistory(id) {
  const stamp = db.prepare('SELECT COUNT(*) AS n, MAX(id) AS m FROM strava_activities').get();
  const key = `${stamp.n}:${stamp.m}`;
  const hit = historyCache.get(id);
  if (hit && hit.key === key && Date.now() - hit.at < 10 * 60000) return hit.hist;
  let hist = null;
  try { hist = routeRunHistory(id); } catch { /* route vanished */ }
  historyCache.set(id, { key, at: Date.now(), hist });
  return hist;
}

/**
 * @param {object} q
 * @param {'any'|'loop'|'out-and-back'} [q.shape]
 * @param {number} [q.minKm] [q.maxKm] distance range (either end optional)
 * @param {number} [q.minMinutes] [q.maxMinutes] run-time range, against the user's last time on the route (or the estimate)
 */
export async function findRoutes({ shape = 'any', minKm = null, maxKm = null, minMinutes = null, maxMinutes = null } = {}) {
  const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const [loKm, hiKm, loMin, hiMin] = [num(minKm), num(maxKm), num(minMinutes), num(maxMinutes)];
  const all = [];
  for (const r of listRoutes()) {
    // matching runs to routes is heavy the first time - let the server breathe between routes
    await new Promise((resolve) => setImmediate(resolve));
    const full = getRoute(r.id);
    const s = routeShape(full?.path);
    const hist = cachedHistory(r.id);
    const last = hist?.last || null;
    // the time to judge by: the last time they ran it, or the estimate from current fitness
    const timeMin = last?.minutes ?? hist?.expectedCurrentTimeMin ?? null;
    all.push({
      id: r.id, name: r.name, source: r.source, account: r.account, externalId: r.externalId, shape: s, sport: r.sport,
      running: !r.sport || RUN_SPORTS.has(r.sport),
      // the one-line description, plus the landmarks it passes ("Takes in Parlington Hollins woods...")
      description: (() => { const d = descriptionOf(r.id); if (d == null) return null; return [d, landmarkSentence(landmarksOf(r.id), d)].filter(Boolean).join(' '); })(),
      landmarks: landmarksOf(r.id),
      // a light copy of the line for the card's little map (about 80 points)
      mapPath: full?.path ? full.path.filter((_, i, a) => i % Math.max(1, Math.ceil(a.length / 80)) === 0 || i === a.length - 1) : null, shapeLabel: SHAPE_LABEL[s],
      distanceKm: r.distanceKm, gainM: r.gainM, lossM: r.lossM, minEle: r.minEle, maxEle: r.maxEle, hasElevation: r.hasElevation,
      climbPerKm: r.distanceKm ? Math.round((r.gainM / r.distanceKm) * 10) / 10 : null,
      runCount: hist?.count || 0,
      lastRun: last ? { day: last.day, minutes: last.minutes, paceMinPerKm: last.paceMinPerKm, avgHr: last.avgHr } : null,
      fastestMinutes: hist?.fastest?.minutes ?? null,
      expectedMinutes: hist?.expectedCurrentTimeMin ?? null,
      timeMinutes: timeMin, timeSource: last ? 'last run' : timeMin != null ? 'estimate' : null,
      createdAt: r.createdAt,
    });
  }
  const timeFiltered = loMin != null || hiMin != null;
  const matches = all.filter((r) => {
    if (shape !== 'any' && r.shape !== shape) return false;
    if (loKm != null && r.distanceKm < loKm) return false;
    if (hiKm != null && r.distanceKm > hiKm) return false;
    if (timeFiltered && r.timeMinutes == null) return false;
    if (loMin != null && r.timeMinutes < loMin) return false;
    if (hiMin != null && r.timeMinutes > hiMin) return false;
    return true;
  });
  // shortest first; routes you've run most recently first among equals
  matches.sort((a, b) => a.distanceKm - b.distanceKm || String(b.lastRun?.day || '').localeCompare(String(a.lastRun?.day || '')));
  // The slider ends: the longest RUNNING route (a 200 km hike would stretch the slider uselessly; the
  // page rounds it up to the next mile or km) and your longest run ever on Strava, rounded up to the hour.
  const longestRunMin = (db.prepare(`SELECT MAX(moving_time) AS s FROM strava_activities WHERE sport IN ('Run','TrailRun','VirtualRun')`).get().s || 0) / 60;
  const runningRoutes = all.filter((r) => r.running);
  const bounds = {
    maxKm: Math.max(1, ...(runningRoutes.length ? runningRoutes : all).map((r) => r.distanceKm || 0)),
    maxMinutes: Math.max(60, Math.ceil(longestRunMin / 60) * 60),
  };
  // routes without a description yet get one in the background (the page checks back)
  if (all.some((r) => r.description == null || r.landmarks == null)) describeMissing(routeShape).catch((err) => console.warn('[RouteDescription]', err.message));
  return { total: all.length, count: matches.length, routes: matches, bounds, describing: describing(), komoot: getKomootStatus() };
}

// ---- Komoot saved routes into the finder ---------------------------------------------------------
// The finder and duplicate finder need each route's full line, so Komoot's saved (planned) routes are
// imported into IMS first. With 100+ routes that takes a while, so it runs as a background job the
// page follows; routes already imported are skipped (and re-imports just update them).

const RUN_SPORTS = new Set(['jogging', 'running', 'run', 'trail_running']);
let syncJob = null;          // { total, done, added, failed, current, startedAt, finishedAt }
let tourCache = null;        // { at, account, tours }

async function komootSavedTours({ fresh = false } = {}) {
  const account = getKomootStatus().email;
  if (!fresh && tourCache && tourCache.account === account && Date.now() - tourCache.at < 10 * 60000) return tourCache.tours;
  const tours = await listKomootTours('planned');
  tourCache = { at: Date.now(), account, tours };
  return tours;
}

export async function komootSyncStatus() {
  const status = getKomootStatus();
  if (!status.connected) return { connected: false, job: syncJob };
  // routes already in IMS, plus Komoot routes you deleted (so syncing doesn't bring them back)
  const have = new Set([...listRoutes().filter((r) => r.source === 'komoot').map((r) => String(r.externalId)), ...hiddenKomootIds()]);
  let tours = [];
  try { tours = await komootSavedTours(); } catch (err) { return { connected: true, account: status.email, error: err.message, job: syncJob }; }
  const missing = tours.filter((t) => !have.has(String(t.id)));
  // routes imported before their sport was kept get it from the tour list
  const setSport = db.prepare("UPDATE planned_routes SET sport = ? WHERE source = 'komoot' AND external_id = ? AND sport IS NULL");
  for (const t of tours) if (t.sport) setSport.run(t.sport, String(t.id));
  const hidden = hiddenKomootIds();
  return { connected: true, account: status.email, saved: tours.length, imported: tours.length - missing.length, missing: missing.length, hidden: tours.filter((t) => hidden.has(String(t.id))).length, job: syncJob };
}

export async function startKomootSync() {
  if (!getKomootStatus().connected) throw new Error('Connect Komoot first.');
  if (syncJob && !syncJob.finishedAt) return syncJob;
  // routes already in IMS, plus Komoot routes you deleted (so syncing doesn't bring them back)
  const have = new Set([...listRoutes().filter((r) => r.source === 'komoot').map((r) => String(r.externalId)), ...hiddenKomootIds()]);
  const tours = (await komootSavedTours({ fresh: true })).filter((t) => !have.has(String(t.id)));
  syncJob = { total: tours.length, done: 0, added: 0, failed: [], current: null, startedAt: Date.now(), finishedAt: null };
  (async () => {
    for (const t of tours) {
      syncJob.current = t.name;
      try { await importKomootTour(t.id); syncJob.added++; } catch (err) { syncJob.failed.push({ name: t.name, error: err.message }); }
      syncJob.done++;
    }
    syncJob.current = null;
    syncJob.finishedAt = Date.now();
    historyCache.clear();
    describeMissing(routeShape).catch((err) => console.warn('[RouteDescription]', err.message));
  })();
  return syncJob;
}

// ---- the evening sync on run days -------------------------------------------------------------------
// At 10pm on any day with a run in the calendar (e.g. "Run" on Tuesdays and Thursdays), pull in any
// Komoot routes saved since the last sync - a new route planned for the next run turns up in the finder,
// described and matched. Checked every 10 minutes; runs once per day.

const RUN_EVENT = /(run|runs|running|jog|jogging|parkrun|long run|tempo|intervals)/i;
const SYNC_DAY_KEY = 'komoot_evening_sync_day';
const londonNow = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false })
    .formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
};

export async function eveningKomootCheck() {
  const { day, hour } = londonNow();
  if (hour !== 22 || getSetting(SYNC_DAY_KEY) === day || !getKomootStatus().connected) return null;
  await refreshEvents().catch(() => {});
  const runs = getEventsOn(day).filter((e) => RUN_EVENT.test(e.title));
  if (!runs.length) return null;
  setSetting(SYNC_DAY_KEY, day);
  const job = await startKomootSync();
  console.log(`[RouteFinder] Evening Komoot sync (run today: ${runs.map((e) => e.title).join(', ')}) - ${job.total} new route${job.total === 1 ? '' : 's'} to import`);
  return job;
}

// Deletes every duplicate copy, keeping the oldest in each group (from IMS only - Komoot is untouched).
export async function deleteAllDuplicates() {
  const { groups } = await findDuplicateRoutes();
  const deleted = [];
  for (const g of groups) for (const r of g.slice(1)) if (deleteRoute(r.id)) deleted.push({ id: r.id, name: r.name });
  historyCache.clear();
  return { deleted, kept: groups.length };
}

// ---- duplicates ---------------------------------------------------------------------------------

// Where along `line` (0-1 of its length) the point q lies nearest.
function positionOn(line, q) {
  let best = Infinity, at = 0, run = 0, total = 0;
  for (let i = 1; i < line.length; i++) total += havM(line[i - 1], line[i]);
  for (let i = 0; i < line.length; i++) {
    if (i) run += havM(line[i - 1], line[i]);
    const d = havM(line[i], q);
    if (d < best) { best = d; at = run; }
  }
  return total ? at / total : 0;
}
// Whether b follows a in the same direction: walk ten points along a and see which way they move along b
// (wrapping round for loops that start somewhere else).
function sameDirection(a, b) {
  const pos = Array.from({ length: 10 }, (_, k) => positionOn(b, a[Math.floor((k / 10) * (a.length - 1))]));
  let fwd = 0, back = 0;
  for (let k = 1; k < pos.length; k++) {
    let d = pos[k] - pos[k - 1];
    if (d > 0.5) d -= 1; else if (d < -0.5) d += 1; // wrapped past the start of a loop
    if (d > 0.005) fwd++; else if (d < -0.005) back++;
  }
  return fwd >= back;
}

// Groups of saved routes that are the same route: lengths within 3%, each line lying (90%+) on the other,
// and run the same way round. The same line run the other way is a different run (the hills differ), so
// those pairs are listed separately as reverses rather than duplicates.
export async function findDuplicateRoutes() {
  const routes = listRoutes().map((r) => ({ ...r, path: getRoute(r.id)?.path || null }));
  const parent = new Map(routes.map((r) => [r.id, r.id]));
  const root = (id) => { while (parent.get(id) !== id) id = parent.get(id); return id; };
  const reverses = [];
  // 'same' | 'reverse' | null
  const match = (a, b) => {
    if (!a.distanceKm || Math.abs(a.distanceKm - b.distanceKm) / Math.max(a.distanceKm, b.distanceKm) > 0.03) return null;
    if (!a.path || !b.path) return a.name === b.name ? 'same' : null;
    if (shareNear(a.path, b.path, 40) < 0.9 || shareNear(b.path, a.path, 40) < 0.9) return null;
    // an out-and-back covers its line both ways, so direction can't tell two copies apart
    if (routeShape(a.path) === 'out-and-back') return 'same';
    return sameDirection(a.path, b.path) ? 'same' : 'reverse';
  };
  for (let i = 0; i < routes.length; i++) {
    await new Promise((resolve) => setImmediate(resolve));
    for (let j = i + 1; j < routes.length; j++) {
      const m = match(routes[i], routes[j]);
      if (m === 'same' && root(routes[i].id) !== root(routes[j].id)) parent.set(root(routes[j].id), root(routes[i].id));
      else if (m === 'reverse') reverses.push([routes[i], routes[j]].map((r) => ({ id: r.id, name: r.name, source: r.source, externalId: r.externalId })));
    }
  }
  const groups = new Map();
  for (const r of routes) {
    const k = root(r.id);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ id: r.id, name: r.name, source: r.source, account: r.account, externalId: r.externalId, distanceKm: r.distanceKm, gainM: r.gainM, createdAt: r.createdAt });
  }
  const dupes = [...groups.values()].filter((g) => g.length > 1)
    // oldest first - the one to keep by default
    .map((g) => g.sort((a, b) => a.createdAt - b.createdAt));
  // a reverse pair matters once per pair of groups, not for every copy in them
  const seenPair = new Set();
  const reversePairs = reverses.filter(([a, b]) => { const k = [root(a.id), root(b.id)].sort().join('-'); if (seenPair.has(k)) return false; seenPair.add(k); return true; });
  return { routes: routes.length, groups: dupes, duplicates: dupes.reduce((n, g) => n + g.length - 1, 0), reverses: reversePairs };
}
