import db from '../db/database.js';
import { getRoute, fetchKomootDirections, getKomootStatus } from './routeService.js';

// One-sentence route descriptions for the Run Planner's route finder, e.g. "From the start, head
// south-east along Ninelands Lane, turn right onto Selby Road (A63), then left onto Leeds Road, and loop
// back to the start." Komoot routes use Komoot's own turn-by-turn directions; GPX routes have their road
// names looked up from points along the line (OpenStreetMap's Nominatim, at most one request a second).
// Worked out once per route in the background and kept in planned_routes.description.

try { db.exec('ALTER TABLE planned_routes ADD COLUMN description TEXT'); } catch (_) { /* already there */ }
// Notable places the route passes (woods, parks, lakes, named trails), as a JSON list in route order.
try { db.exec('ALTER TABLE planned_routes ADD COLUMN landmarks TEXT'); } catch (_) { /* already there */ }

const CARDINAL = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' };
const WAY = { 'wt#off_grid': 'the off-road stretch', 'wt#way': 'the path', 'wt#trail': 'the trail', 'wt#track': 'the track', 'wt#footway': 'the footpath', 'wt#cycleway': 'the cycle path', 'wt#hiking_path': 'the footpath' };
const bearing = (a, b) => {
  const r = (d) => (d * Math.PI) / 180;
  const y = Math.sin(r(b[1] - a[1])) * Math.cos(r(b[0]));
  const x = Math.cos(r(a[0])) * Math.sin(r(b[0])) - Math.sin(r(a[0])) * Math.cos(r(b[0])) * Math.cos(r(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};
const compass8 = (deg) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
// "Selby Road, A63" -> "Selby Road (A63)"
const roadName = (n) => { const [a, ...rest] = String(n).split(',').map((x) => x.trim()).filter(Boolean); return rest.length ? `${a} (${rest.join(', ')})` : a; };
const turnWord = (type) => {
  const t = String(type || '');
  if (!t.startsWith('T')) return null;
  const side = t.endsWith('L') ? 'left' : t.endsWith('R') ? 'right' : null;
  if (!side) return null;
  return t.startsWith('TS') && t.length === 3 ? `bear ${side}` : `turn ${side}`;
};
const ending = (shape) => (shape === 'loop' ? 'and loop back to the start' : shape === 'out-and-back' ? 'then turn round and come back the same way' : 'to the finish');

function sentence(steps, shape) {
  if (!steps.length) return null;
  const [first, ...rest] = steps;
  const parts = [`From the start, head ${CARDINAL[first.dir] || 'off'} along ${first.name}`];
  rest.slice(0, 4).forEach((s, i) => {
    const how = s.turn ? `${s.turn} onto ${s.name}` : `carry on along ${s.name}`;
    parts.push(i === rest.length - 1 || i === 3 ? `then ${how}` : how);
  });
  return `${parts.join(', ')}, ${ending(shape)}.`;
}

// Komoot: the named ways, in order, merged, keeping the ones you're on for a while.
async function fromKomoot(route, shape) {
  const { directions, coordinates } = await fetchKomootDirections(route.externalId);
  if (!directions.length) return null;
  // out-and-back: only the way out matters
  const cut = shape === 'out-and-back' && coordinates.length ? Math.floor(coordinates.length / 2) : Infinity;
  const steps = [];
  for (const d of directions) {
    if (d.index > cut) break;
    const name = d.street_name ? roadName(d.street_name) : WAY[d.way_type] || null;
    if (!name) continue;
    const prev = steps.at(-1);
    if (prev && prev.name === name) { prev.distance += d.distance || 0; continue; }
    steps.push({ name, dir: d.cardinal_direction, turn: turnWord(d.type), distance: d.distance || 0 });
  }
  // keep the start and stretches of 250 m or more
  const kept = steps.filter((s, i) => i === 0 || s.distance >= 250);
  const merged = kept.filter((s, i) => i === 0 || s.name !== kept[i - 1].name);
  return sentence(merged, shape);
}

// GPX: road names at points along the way (out-and-back: the way out only).
let lastNominatim = 0;
async function nominatim([lat, lng]) {
  const wait = lastNominatim + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1`, {
    headers: { 'User-Agent': 'IMS-Run-Planner/1.0 (personal route descriptions)', 'Accept-Language': 'en-GB' }, signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Nominatim said ${res.status}`);
  const j = await res.json();
  const a = j.address || {};
  return a.road || a.footway || a.path || a.pedestrian || a.cycleway || a.track || null;
}

async function fromMap(route, shape) {
  const path = route.path || [];
  if (path.length < 4) return null;
  const upTo = shape === 'out-and-back' ? Math.floor(path.length / 2) : path.length - 1;
  const samples = 8;
  const steps = [];
  for (let k = 0; k <= samples; k++) {
    const i = Math.min(upTo, Math.round((k / samples) * upTo));
    let name = null;
    try { name = await nominatim(path[i]); } catch { /* skip this point */ }
    if (!name || steps.at(-1)?.name === name) continue;
    // which way the route turns here: compare the heading in and out of the point
    const a = path[Math.max(0, i - 3)], b = path[i], c = path[Math.min(path.length - 1, i + 3)];
    const delta = ((bearing(b, c) - bearing(a, b) + 540) % 360) - 180;
    steps.push({ name, dir: compass8(bearing(path[0], path[Math.min(path.length - 1, 4)])), turn: k === 0 ? null : delta > 35 ? 'turn right' : delta < -35 ? 'turn left' : null });
  }
  return sentence(steps, shape);
}

// ---- landmarks: named woods, parks, nature reserves, water and trails within a few metres of the line,
// from OpenStreetMap via the public Overpass API (one request per route, spaced out) ----
const NOISE = /definitive|footpath\s+\w+\s*\d|^\w+\s+\d+$|cycle route|national cycle|\bncn\b|branch$|^path$|bridleway \d/i;
const kindOf = (t) => (t.natural === 'wood' || t.landuse === 'forest' ? 'wood' : t.leisure === 'park' ? 'park' : t.leisure === 'nature_reserve' ? 'reserve' : t.natural === 'water' ? 'water' : 'trail');
const withKind = (name, kind) => {
  if (kind === 'wood' && !/wood|forest|copse|plantation|spinney|hollins/i.test(name)) return `${name} woods`;
  if (kind === 'park' && !/park|gardens?|ground|field|common|green|recreation/i.test(name)) return `${name} park`;
  if (kind === 'water' && !/lake|reservoir|pond|water|mere|dam|lagoon/i.test(name)) return `${name} lake`;
  return name;
};
let lastOverpass = 0;
let overpassPausedUntil = 0; // the public Overpass servers are sometimes overloaded - back off rather than queue timeouts
async function findLandmarks(path) {
  if (!path || path.length < 4) return [];
  const wait = lastOverpass + 1500 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastOverpass = Date.now();
  const step = Math.max(1, Math.ceil(path.length / 60));
  const pts = path.filter((_, i) => i % step === 0 || i === path.length - 1);
  const c = pts.map(([a, b]) => `${a.toFixed(5)},${b.toFixed(5)}`).join(',');
  const q = `[out:json][timeout:25];(
way(around:35,${c})["name"]["highway"~"^(path|footway|cycleway|track|bridleway)$"];
relation(around:35,${c})["name"]["route"~"hiking|foot|walking"];
way(around:25,${c})["name"]["natural"~"^(wood|water)$"];way(around:25,${c})["name"]["landuse"="forest"];
way(around:25,${c})["name"]["leisure"~"^(park|nature_reserve)$"];relation(around:25,${c})["name"]["leisure"~"^(park|nature_reserve)$"];
relation(around:25,${c})["name"]["landuse"="forest"];relation(around:25,${c})["name"]["natural"~"^(wood|water)$"];
);out tags center;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: `data=${encodeURIComponent(q)}`,
    headers: { 'User-Agent': 'IMS-Run-Planner/1.0 (personal route summaries)', 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(40000) });
  if (!res.ok) throw new Error(`Overpass said ${res.status}`);
  const els = (await res.json()).elements || [];
  // where along the route each one is first met, so they're listed in the order you pass them
  const along = (lat, lon) => { let best = Infinity, at = 0; path.forEach(([a, b], i) => { const d = (a - lat) ** 2 + (b - lon) ** 2; if (d < best) { best = d; at = i; } }); return at; };
  const seen = new Map();
  for (const e of els) {
    const name = String(e.tags?.name || '').trim();
    if (!name || NOISE.test(name)) continue;
    const kind = kindOf(e.tags);
    const pos = e.center ? along(e.center.lat, e.center.lon) : 0;
    const prev = seen.get(name);
    // a wood or park outranks a path of the same name; keep the earliest position
    if (!prev || (prev.kind === 'trail' && kind !== 'trail')) seen.set(name, { name, kind, pos: Math.min(pos, prev?.pos ?? pos) });
    else prev.pos = Math.min(prev.pos, pos);
  }
  return [...seen.values()].sort((a, b) => a.pos - b.pos).map((x) => withKind(x.name, x.kind));
}

// "Takes in Parlington Hollins woods, The Lines Way and Brecks Wood." Footpaths named after streets
// (Station Road, Medway Avenue) aren't landmarks and are left out; "YWT Hollinhurst Wood" gives way to
// "Hollinhurst Wood"; woods, parks, water and reserves come first, then named trails - up to four, kept
// in the order you pass them, skipping names the description already gives.
const STREETY = /\b(drive|avenue|road|street|place|close|crescent|grove|court|terrace|mews|lane|row|square|gardens? road|view|rise|walk east|walk west)\b/i;
const NATURAL = /\b(woods?|forest|hollins|copse|plantation|spinney|park|lake|pond|reservoir|water|mere|reserve|sssi|common|hills?|valley|meadows?|moor|fields?|nature)\b/i;
const TRAIL = /\b(way|path|trod|line|lines|trail|greenway|walk|loop|track)\b/i;
export function landmarkSentence(landmarks, description = '') {
  const desc = String(description || '').toLowerCase();
  // names saved before 'Recreation Ground' stopped getting 'park' added
  const names = (landmarks || []).map((n) => n.replace(/(ground|field|fields|common|green) park$/i, '$1')).filter((n) => !STREETY.test(n) || NATURAL.test(n.replace(STREETY, '')) && /park|wood|lake|pond/i.test(n));
  const plain = new Set(names.map((n) => n.toLowerCase()));
  const kept = names.filter((n) => !/^ywt\s+/i.test(n) || !plain.has(n.replace(/^ywt\s+/i, '').toLowerCase()))
    .filter((n) => !desc.includes(n.toLowerCase().replace(/ (woods|park|lake)$/, '')))
    .map((n, i) => ({ n, i, rank: NATURAL.test(n) ? 0 : TRAIL.test(n) ? 1 : 2 }))
    .filter((x) => x.rank < 2);
  const list = kept.slice().sort((x, y) => x.rank - y.rank || x.i - y.i).slice(0, 4).sort((x, y) => x.i - y.i).map((x) => x.n);
  if (!list.length) return '';
  return `Takes in ${list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`}.`;
}

let job = null;

// Fills in descriptions for routes that have none, one at a time, in the background.
export function describeMissing(shapeOf) {
  if (job) return job;
  job = (async () => {
    const rows = db.prepare('SELECT id, source, external_id FROM planned_routes WHERE description IS NULL ORDER BY id').all();
    for (const r of rows) {
      const route = getRoute(r.id);
      if (!route) continue;
      const shape = shapeOf(route.path);
      let text = null;
      try {
        text = r.source === 'komoot' && r.external_id && getKomootStatus().connected ? await fromKomoot({ ...route, externalId: r.external_id }, shape) : null;
        if (!text) text = await fromMap(route, shape);
      } catch (err) { console.warn(`[RouteDescription] ${route.name}: ${err.message}`); }
      // '' marks "tried, nothing to say" so it isn't retried every time
      db.prepare('UPDATE planned_routes SET description = ? WHERE id = ?').run(text || '', r.id);
    }
    // then the landmarks, for any route without them yet (left blank on failure, so tried again later)
    let failures = 0;
    for (const r of db.prepare('SELECT id, name FROM planned_routes WHERE landmarks IS NULL ORDER BY id').all()) {
      if (Date.now() < overpassPausedUntil) break;
      const route = getRoute(r.id);
      if (!route) continue;
      try {
        db.prepare('UPDATE planned_routes SET landmarks = ? WHERE id = ?').run(JSON.stringify(await findLandmarks(route.path)), r.id);
        failures = 0;
      } catch (err) {
        console.warn(`[RouteDescription] landmarks for ${r.name}: ${err.message}`);
        if (++failures >= 2) { overpassPausedUntil = Date.now() + 15 * 60000; console.warn('[RouteDescription] Overpass not answering - landmark look-ups paused for 15 minutes'); break; }
      }
    }
  })().finally(() => { job = null; });
  return job;
}

export const describing = () => Boolean(job);
export const descriptionOf = (id) => db.prepare('SELECT description FROM planned_routes WHERE id = ?').get(id)?.description ?? null;
export const landmarksOf = (id) => { try { return JSON.parse(db.prepare('SELECT landmarks FROM planned_routes WHERE id = ?').get(id)?.landmarks ?? 'null'); } catch { return null; } };
