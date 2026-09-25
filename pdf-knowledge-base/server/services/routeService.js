import db, { getSetting, setSetting } from '../db/database.js';
import { encryptSecret, decryptSecret } from './wifiService.js';

// Routes for the run planner: distance and elevation, from a GPX file, a Komoot share link,
// or the user's saved (planned) Komoot tours. Komoot has no public API for personal use, so
// the Komoot parts use the same web API its own app uses; if that ever changes, GPX still works.
db.exec(`
  CREATE TABLE IF NOT EXISTS planned_routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    external_id TEXT,
    name TEXT NOT NULL,
    distance_km REAL NOT NULL,
    gain_m REAL NOT NULL,
    loss_m REAL NOT NULL,
    min_ele REAL,
    max_ele REAL,
    profile TEXT NOT NULL,
    splits TEXT NOT NULL,
    has_elevation INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    UNIQUE(source, external_id)
  );
  CREATE TABLE IF NOT EXISTS activity_route (activity_id INTEGER PRIMARY KEY, route_id INTEGER NOT NULL);
`);
try { db.exec('ALTER TABLE planned_routes ADD COLUMN path TEXT'); } catch (_) { /* already there */ }

// ---- geometry ------------------------------------------------------------------------------
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
function haversine(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// GPX: <trkpt lat lon><ele>..</ele></trkpt>, or route points <rtept>.
export function parseGpx(xml) {
  const pts = [];
  const re = /<(trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[2];
    const lat = Number(/lat\s*=\s*["']([-\d.eE]+)["']/.exec(attrs)?.[1]);
    const lng = Number(/lon\s*=\s*["']([-\d.eE]+)["']/.exec(attrs)?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const ele = m[3] ? Number(/<ele>\s*([-\d.eE]+)\s*<\/ele>/.exec(m[3])?.[1]) : NaN;
    pts.push({ lat, lng, ele: Number.isFinite(ele) ? ele : null });
  }
  return pts;
}

// Distance, climbing and gradient profile. Elevation is resampled every 25 m and smoothed
// (GPS/barometer noise otherwise inflates climbing), and climbing counts only rises of 3 m+.
export function analyseCoords(points) {
  if (points.length < 2) throw new Error('The route needs at least two points.');
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + haversine(points[i - 1], points[i]));
  const total = cum[cum.length - 1];
  if (total < 200) throw new Error('That route is shorter than 200 m - is it the right file?');
  const hasEle = points.filter((p) => p.ele != null).length >= points.length * 0.8;

  const step = 25;
  const n = Math.floor(total / step) + 1;
  const ele = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = i * step;
    while (j < cum.length - 2 && cum[j + 1] < d) j++;
    const span = cum[j + 1] - cum[j] || 1;
    const t = Math.min(1, Math.max(0, (d - cum[j]) / span));
    const e0 = points[j].ele ?? 0, e1 = points[j + 1].ele ?? 0;
    ele.push(e0 + (e1 - e0) * t);
  }
  const sm = ele.map((_, i) => {
    let s = 0, c = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(ele.length - 1, i + 2); k++) { s += ele[k]; c++; }
    return s / c;
  });

  let gain = 0, loss = 0, ref = sm[0];
  for (const e of sm) {
    if (e - ref >= 3) { gain += e - ref; ref = e; }
    else if (ref - e >= 3) { loss += ref - e; ref = e; }
  }
  // Gradient (%) over roughly 100 m at each sample.
  const grade = sm.map((_, i) => {
    const a = Math.max(0, i - 2), b = Math.min(sm.length - 1, i + 2);
    return b > a ? ((sm[b] - sm[a]) / ((b - a) * step)) * 100 : 0;
  });

  const profile = [];
  const every = Math.max(1, Math.floor(sm.length / 400));
  for (let i = 0; i < sm.length; i += every) profile.push([+(i * step / 1000).toFixed(3), Math.round(sm[i] * 10) / 10, Math.round(grade[i] * 10) / 10]);

  // The route's shape for the map: about 350 points, evenly spread along its length.
  const path = [];
  const gap = total / 350;
  let lastAt = -Infinity;
  points.forEach((p, i) => { if (i === 0 || i === points.length - 1 || cum[i] - lastAt >= gap) { path.push([Math.round(p.lat * 1e5) / 1e5, Math.round(p.lng * 1e5) / 1e5]); lastAt = cum[i]; } });

  const splits = [];
  for (let k = 0; k < Math.ceil(total / 1000 - 0.05); k++) {
    const from = Math.floor((k * 1000) / step), to = Math.min(sm.length - 1, Math.floor(((k + 1) * 1000) / step));
    let up = 0, down = 0, maxG = -99, minG = 99;
    for (let i = from + 1; i <= to; i++) { const d = sm[i] - sm[i - 1]; if (d > 0) up += d; else down -= d; }
    for (let i = from; i <= to; i++) { maxG = Math.max(maxG, grade[i]); minG = Math.min(minG, grade[i]); }
    splits.push({ km: k + 1, gain: Math.round(up), loss: Math.round(down), net: Math.round(sm[to] - sm[from]), maxGrade: Math.round(maxG * 10) / 10, minGrade: Math.round(minG * 10) / 10 });
  }
  return {
    distanceKm: Math.round(total / 10) / 100, gainM: Math.round(gain), lossM: Math.round(loss),
    minEle: Math.round(Math.min(...sm)), maxEle: Math.round(Math.max(...sm)), profile, splits, path, hasElevation: hasEle,
  };
}

// ---- storage ---------------------------------------------------------------------------------
const present = (r, full = false) => ({
  id: r.id, source: r.source, externalId: r.external_id, name: r.name, distanceKm: r.distance_km, gainM: r.gain_m, lossM: r.loss_m,
  minEle: r.min_ele, maxEle: r.max_ele, hasElevation: Boolean(r.has_elevation), createdAt: r.created_at,
  ...(full ? { profile: JSON.parse(r.profile), splits: JSON.parse(r.splits), path: r.path ? JSON.parse(r.path) : null } : {}),
});

export function saveRoute({ source, externalId = null, name, points }) {
  const a = analyseCoords(points);
  const nm = String(name || 'Route').trim().slice(0, 120) || 'Route';
  const existing = externalId ? db.prepare('SELECT id FROM planned_routes WHERE source = ? AND external_id = ?').get(source, String(externalId)) : null;
  if (existing) {
    db.prepare(`UPDATE planned_routes SET name=?, distance_km=?, gain_m=?, loss_m=?, min_ele=?, max_ele=?, profile=?, splits=?, has_elevation=?, path=? WHERE id=?`)
      .run(nm, a.distanceKm, a.gainM, a.lossM, a.minEle, a.maxEle, JSON.stringify(a.profile), JSON.stringify(a.splits), a.hasElevation ? 1 : 0, JSON.stringify(a.path), existing.id);
    return getRoute(existing.id);
  }
  const info = db.prepare(`INSERT INTO planned_routes (source, external_id, name, distance_km, gain_m, loss_m, min_ele, max_ele, profile, splits, has_elevation, created_at, path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(source, externalId ? String(externalId) : null, nm, a.distanceKm, a.gainM, a.lossM, a.minEle, a.maxEle, JSON.stringify(a.profile), JSON.stringify(a.splits), a.hasElevation ? 1 : 0, Date.now(), JSON.stringify(a.path));
  return getRoute(Number(info.lastInsertRowid));
}

export const listRoutes = () => db.prepare('SELECT * FROM planned_routes ORDER BY created_at DESC').all().map((r) => present(r));
export const getRoute = (id) => { const r = db.prepare('SELECT * FROM planned_routes WHERE id = ?').get(id); return r ? present(r, true) : null; };
export function deleteRoute(id) {
  db.prepare('DELETE FROM activity_route WHERE route_id = ?').run(id);
  return db.prepare('DELETE FROM planned_routes WHERE id = ?').run(id).changes > 0;
}
export function linkActivityRoute(activityId, routeId) {
  if (routeId == null) { db.prepare('DELETE FROM activity_route WHERE activity_id = ?').run(activityId); return null; }
  if (!getRoute(routeId)) throw new Error('Route not found.');
  db.prepare('INSERT OR REPLACE INTO activity_route (activity_id, route_id) VALUES (?, ?)').run(activityId, routeId);
  return routeId;
}
export const linkedRouteId = (activityId) => db.prepare('SELECT route_id FROM activity_route WHERE activity_id = ?').get(activityId)?.route_id ?? null;

// Routes whose length is within 8% of an activity's distance, best match first (a suggestion only).
export function suggestRoutes(distanceKm) {
  return listRoutes().filter((r) => Math.abs(r.distanceKm - distanceKm) / Math.max(distanceKm, 0.1) <= 0.08)
    .sort((a, b) => Math.abs(a.distanceKm - distanceKm) - Math.abs(b.distanceKm - distanceKm));
}

// ---- Komoot ------------------------------------------------------------------------------------
const KOMOOT = 'https://api.komoot.de';
const CRED_KEY = 'komoot_credentials';
const readCreds = () => { try { const raw = getSetting(CRED_KEY); return raw ? JSON.parse(decryptSecret(JSON.parse(raw))) : {}; } catch (_) { return {}; } };
const writeCreds = (c) => setSetting(CRED_KEY, JSON.stringify(encryptSecret(JSON.stringify(c))));
const basic = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

async function komoot(pathAndQuery, auth) {
  // Komoot's v007 tour endpoints are HAL: they answer 406 unless HAL JSON is accepted.
  const res = await fetch(`${KOMOOT}${pathAndQuery}`, { headers: { Accept: 'application/hal+json, application/json;q=0.8', 'User-Agent': 'Mozilla/5.0 (IMS route planner)', ...(auth ? { Authorization: auth } : {}) }, signal: AbortSignal.timeout(30000) });
  if (res.status === 401 || res.status === 403) throw new Error('Komoot refused the request - check the email and password (or that the tour is shared).');
  if (res.status === 406) throw new Error('Komoot answered 406 (it did not like the request format).');
  if (res.status === 404) throw new Error('Komoot could not find that.');
  if (!res.ok) throw new Error(`Komoot said ${res.status}.`);
  return res.json();
}

export const getKomootStatus = () => { const c = readCreds(); return { connected: Boolean(c.userId), email: c.email || null }; };
export const disconnectKomoot = () => writeCreds({});

export async function connectKomoot(email, password) {
  const em = String(email || '').trim();
  if (!em || !password) throw new Error('Enter your Komoot email and password.');
  const data = await komoot(`/v006/account/email/${encodeURIComponent(em)}/`, basic(em, password));
  const userId = data.username || data.user?.username;
  const token = data.password;
  if (!userId) throw new Error('Komoot did not return your account - check the details.');
  writeCreds({ email: em, userId: String(userId), token: token || null, password }); // stored encrypted
  return getKomootStatus();
}

const komootAuth = () => {
  const c = readCreds();
  if (!c.userId) throw new Error('Connect Komoot first.');
  return { auth: basic(c.userId, c.token || c.password), creds: c };
};

// The user's tours, newest first: 'planned' (routes made in Komoot) or 'recorded' (activities they did).
export async function listKomootTours(kind = 'planned') {
  const { auth, creds } = komootAuth();
  const type = kind === 'recorded' ? 'tour_recorded' : 'tour_planned';
  const tours = [];
  for (let page = 0; page < 12; page++) {
    const d = await komoot(`/v007/users/${creds.userId}/tours/?type=${type}&sort_field=date&sort_direction=desc&limit=50&page=${page}`, auth);
    const items = d._embedded?.tours || [];
    for (const t of items) tours.push({ id: String(t.id), name: t.name, sport: t.sport, distanceKm: t.distance ? Math.round(t.distance / 10) / 100 : null, gainM: t.elevation_up != null ? Math.round(t.elevation_up) : null, date: t.date || t.changed_at || null });
    if (page + 1 >= (d.page?.totalPages ?? 1)) break;
  }
  return tours;
}

async function fetchTour(tourId, { auth = null, shareToken = null } = {}) {
  const q = `_embedded=coordinates${shareToken ? `&share_token=${encodeURIComponent(shareToken)}` : ''}`;
  const t = await komoot(`/v007/tours/${encodeURIComponent(tourId)}?${q}`, auth);
  const items = t._embedded?.coordinates?.items || [];
  const points = items.map((c) => ({ lat: c.lat, lng: c.lng, ele: c.alt ?? null })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (points.length < 2) throw new Error('Komoot returned no route points for that tour.');
  return { name: t.name, points };
}

export async function importKomootTour(tourId) {
  const { auth } = komootAuth();
  const t = await fetchTour(tourId, { auth });
  return saveRoute({ source: 'komoot', externalId: tourId, name: t.name, points: t.points });
}

// A share link like https://www.komoot.com/tour/123456789?share_token=abc works without an account.
export async function importKomootLink(link) {
  const m = /tour\/(\d+)/.exec(String(link || ''));
  if (!m) throw new Error('That does not look like a Komoot tour link.');
  let token = null;
  try { token = new URL(link).searchParams.get('share_token'); } catch (_) { /* no token */ }
  const t = await fetchTour(m[1], { shareToken: token, auth: token ? null : (getKomootStatus().connected ? komootAuth().auth : null) });
  return saveRoute({ source: 'komoot', externalId: m[1], name: t.name, points: t.points });
}
