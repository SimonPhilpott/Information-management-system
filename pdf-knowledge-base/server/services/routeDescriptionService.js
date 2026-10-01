import db from '../db/database.js';
import { getRoute, fetchKomootDirections, getKomootStatus } from './routeService.js';

// One-sentence route descriptions for the Run Planner's route finder, e.g. "From the start, head
// south-east along Ninelands Lane, turn right onto Selby Road (A63), then left onto Leeds Road, and loop
// back to the start." Komoot routes use Komoot's own turn-by-turn directions; GPX routes have their road
// names looked up from points along the line (OpenStreetMap's Nominatim, at most one request a second).
// Worked out once per route in the background and kept in planned_routes.description.

try { db.exec('ALTER TABLE planned_routes ADD COLUMN description TEXT'); } catch (_) { /* already there */ }

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
  })().finally(() => { job = null; });
  return job;
}

export const describing = () => Boolean(job);
export const descriptionOf = (id) => db.prepare('SELECT description FROM planned_routes WHERE id = ?').get(id)?.description ?? null;
