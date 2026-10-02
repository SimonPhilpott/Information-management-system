import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../db/database.js';
import { arkhamScenarios } from './arkhamCampaigns.js';

// The Arkham Horror maps: the HD map of the town of Arkham plus Dunwich, Innsmouth, Hemlock Vale, Mexico,
// the Dreamlands and the world (data/decks/arkham_maps.json; Arkham's landmarks are in arkham_places.json;
// x, y are percentages). Each scenario is placed once by Gemini - where it happens, with a few lines of
// case-note lore for its pop-up - and then put on every map it happens on, at that map's nearest landmark
// (a train from Arkham to Dunwich is on both). Scenarios on no map (the void, Carcosa, Yuggoth...) sit in the
// strip below. Players can drag a pin to correct it: kept in map_pins under "ah:<scenario>" on the Arkham
// map, "ah@<map>@<scenario>" on the others.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLACES = path.join(__dirname, '..', '..', 'data', 'decks', 'arkham_places.json');
export const arkhamPlaces = () => JSON.parse(fs.readFileSync(PLACES, 'utf8'));
const MAPS = path.join(__dirname, '..', '..', 'data', 'decks', 'arkham_maps.json');
const PUBLIC = path.join(__dirname, '..', '..', '..', '..', 'public');
// The maps whose picture is in place, each with its landmarks.
export function arkhamMaps() {
  return JSON.parse(fs.readFileSync(MAPS, 'utf8')).maps
    .filter((m) => fs.existsSync(path.join(PUBLIC, m.src)))
    .map((m) => ({ ...m, places: m.placesFile ? arkhamPlaces() : m.places || [] }));
}
const pinKey = (map, name) => (map === 'arkham' ? `ah:${name}` : `ah@${map}@${name}`);

db.exec(`CREATE TABLE IF NOT EXISTS arkham_scenario_places (name TEXT PRIMARY KEY, map_label TEXT, place TEXT, region TEXT, lore TEXT, at INTEGER NOT NULL)`);
db.exec(`CREATE TABLE IF NOT EXISTS arkham_scenario_maps (name TEXT NOT NULL, map TEXT NOT NULL, label TEXT, PRIMARY KEY (name, map))`);
try { db.exec('ALTER TABLE arkham_scenario_places ADD COLUMN mapped INTEGER'); } catch (_) { /* already there */ }
db.exec(`CREATE TABLE IF NOT EXISTS scenario_lore (name TEXT PRIMARY KEY, place TEXT, lore TEXT, source TEXT, at INTEGER NOT NULL)`);

let placing = null;
// Places (and lore for) every scenario of the named ones that hasn't been placed yet - in one batch.
function placeMissing(names) {
  const known = new Set(db.prepare('SELECT name FROM arkham_scenario_places').all().map((r) => r.name));
  const all = arkhamScenarios();
  const todo = [...new Set(names)].filter((n) => !known.has(n)).map((n) => all.find((s) => s.name === n) || { name: n, campaign: null });
  const unmapped = new Set(db.prepare('SELECT name FROM arkham_scenario_places WHERE mapped IS NULL').all().map((r) => r.name));
  const toMap = [...new Set(names)].filter((n) => unmapped.has(n) || todo.some((t) => t.name === n));
  if ((!todo.length && !toMap.length) || placing) return Boolean(placing);
  placing = (async () => {
    try {
      const labels = arkhamPlaces().map((p) => p.label);
      const { GoogleGenerativeAI } = await import('../geminiClient.js');
      const config = (await import('../../config.js')).default;
      const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          responseMimeType: 'application/json', temperature: 0.4,
          responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, mapLabel: { type: 'STRING', nullable: true }, place: { type: 'STRING' }, region: { type: 'STRING' }, lore: { type: 'STRING' } }, required: ['name', 'place', 'region', 'lore'] } },
        },
      });
      for (let i = 0; i < todo.length && todo.length; i += 25) {
        const batch = todo.slice(i, i + 25);
        const prompt = `These are scenarios of Arkham Horror: The Card Game. For each, say where it takes place, in-world:
- mapLabel: if it takes place in the town of Arkham, the ONE landmark from this list of places on our Arkham map that best fits (copy it exactly), else null: ${labels.join('; ')}.
- place: the in-world location, short (e.g. "The Miskatonic Museum, Arkham", "Dunwich, Massachusetts", "The Yucatán jungle, Mexico", "Kadath, in the Dreamlands").
- region: the town or region, short (e.g. "Arkham", "Dunwich", "Innsmouth", "Kingsport", "New Orleans", "Antarctica", "The Dreamlands", "Mexico").
- lore: two or three sentences for a pop-up on the map - the place's history and the dread that hangs over it, written as a 1920s investigator's case note, noir and Lovecraftian. No game terms, no spoilers of the scenario's twists.

SCENARIOS (with their campaign):
${batch.map((s) => `- ${s.name}${s.campaign ? ` (${s.campaign})` : ''}`).join('\n')}`;
        const out = JSON.parse((await model.generateContent(prompt)).response.text());
        const put = db.prepare('INSERT OR REPLACE INTO arkham_scenario_places (name, map_label, place, region, lore, at) VALUES (?, ?, ?, ?, ?, ?)');
        const lore = db.prepare('INSERT OR REPLACE INTO scenario_lore (name, place, lore, source, at) VALUES (?, ?, ?, ?, ?)');
        for (const r of out) {
          const s = batch.find((x) => x.name === r.name);
          if (!s) continue;
          const label = labels.includes(r.mapLabel) ? r.mapLabel : null;
          put.run(s.name, label, String(r.place || '').slice(0, 120), String(r.region || '').slice(0, 60), String(r.lore || '').slice(0, 900), Date.now());
          lore.run(s.name, String(r.place || '').slice(0, 120), String(r.lore || '').slice(0, 900), 'gemini-arkham', Date.now());
        }
      }
      for (let i = 0; i < toMap.length; i += 25) await assignMaps(toMap.slice(i, i + 25), all);
    } catch (err) { console.warn(`[ArkhamMap] Placing scenarios failed: ${err.message}`); } finally { placing = null; }
  })();
  return true;
}

// Which maps a scenario happens on, and where on each: Gemini picks from each map's landmarks. A scenario
// already on the Arkham map keeps its landmark there.
async function assignMaps(names, all) {
  const maps = arkhamMaps().filter((m) => m.places.length);
  const rows = Object.fromEntries(db.prepare(`SELECT * FROM arkham_scenario_places WHERE name IN (${names.map(() => '?').join(',')})`).all(...names).map((r) => [r.name, r]));
  const list = names.filter((n) => rows[n]);
  if (!list.length) return;
  const { GoogleGenerativeAI } = await import('../geminiClient.js');
  const config = (await import('../../config.js')).default;
  const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({
    model: 'gemini-2.5-pro',
    generationConfig: {
      responseMimeType: 'application/json', temperature: 0.2,
      responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, maps: { type: 'ARRAY', items: { type: 'OBJECT', properties: { map: { type: 'STRING' }, label: { type: 'STRING' } }, required: ['map', 'label'] } } }, required: ['name', 'maps'] } },
    },
  });
  const prompt = `These are scenarios of Arkham Horror: The Card Game, with where each takes place. We have these maps, each with its landmarks (map id: landmarks):
${maps.map((m) => `- ${m.id} (${m.name}): ${m.places.map((p) => p.label).join('; ')}`).join('\n')}

For each scenario, list every map it actually takes place on, with the ONE landmark from that map's list that fits best (copy the landmark exactly).
- Use the most specific map: a scenario in Arkham goes on "arkham"; in Dunwich, on "dunwich"; in Innsmouth or off its coast, on "innsmouth"; on Hemlock Island, on "hemlock"; in the Yucatán or Mexico, on "mexico"; in the Dreamlands (Kadath, Ulthar, the Moon, the Underworld...), on "dreamlands".
- "world" is only for real places no other map covers (London, Paris, Cairo, Antarctica, New Orleans...).
- Most scenarios are on one map. Give two only when the scenario really moves between two mapped places (a journey from one to the other).
- A scenario in another dimension, the void, Carcosa, Yuggoth, Celaeno, Yoth, the court of Azathoth or "all of time and space" is on no map: give an empty list.
- Know the game: e.g. Threads of Fate and Echoes of the Past are in Arkham; The Boundary Beyond is Mexico City; Black Stars Rise is the abbey of Mont Saint-Michel; Essex County Express runs from Arkham towards Dunwich.

SCENARIOS (name | campaign | where):
${list.map((n) => `- ${n} | ${all.find((s) => s.name === n)?.campaign || '-'} | ${rows[n].place}${rows[n].map_label ? ` (Arkham landmark: ${rows[n].map_label})` : ''}`).join('\n')}`;
  const out = JSON.parse((await model.generateContent(prompt)).response.text());
  const labels = Object.fromEntries(maps.map((m) => [m.id, new Set(m.places.map((p) => p.label))]));
  const put = db.prepare('INSERT OR REPLACE INTO arkham_scenario_maps (name, map, label) VALUES (?, ?, ?)');
  const done = db.prepare('UPDATE arkham_scenario_places SET mapped = 1 WHERE name = ?');
  db.transaction(() => {
    for (const r of out) {
      if (!rows[r.name]) continue;
      db.prepare('DELETE FROM arkham_scenario_maps WHERE name = ?').run(r.name);
      for (const m of r.maps || []) {
        if (!labels[m.map]) continue;
        const label = m.map === 'arkham' && rows[r.name].map_label ? rows[r.name].map_label : labels[m.map].has(m.label) ? m.label : null;
        put.run(r.name, m.map, label);
      }
      done.run(r.name);
    }
  })();
}

// Pins for the named scenarios: { place, region, at: { <map>: { x, y } } } - on every map it happens on -
// or { offMap: true, region, place } when it's on none. (x, y at the top level: its spot on the Arkham map.)
export function arkhamPins(names) {
  const pending = placeMissing(names);
  const maps = arkhamMaps();
  const places = Object.fromEntries(maps.map((m) => [m.id, Object.fromEntries(m.places.map((p) => [p.label, p]))]));
  const rows = Object.fromEntries(db.prepare('SELECT * FROM arkham_scenario_places').all().map((r) => [r.name, r]));
  const onMaps = {};
  for (const r of db.prepare('SELECT * FROM arkham_scenario_maps').all()) (onMaps[r.name] ||= []).push(r);
  const saved = Object.fromEntries(db.prepare("SELECT scenario, x, y FROM map_pins WHERE scenario LIKE 'ah:%' OR scenario LIKE 'ah@%'").all().map((r) => [r.scenario, { x: r.x, y: r.y, moved: true }]));
  const out = {}, used = {};
  for (const name of names) {
    const r = rows[name];
    if (!r) { if (saved[pinKey('arkham', name)]) out[name] = { ...saved[pinKey('arkham', name)], at: { arkham: saved[pinKey('arkham', name)] } }; continue; }
    // before it's been put on the maps: the Arkham landmark (or Downtown, for somewhere in Arkham off the landmarks)
    const inTown = !r.map_label && /^arkham$/i.test(String(r.region || '').trim());
    const spots = onMaps[name] || (r.map_label || inTown ? [{ map: 'arkham', label: r.map_label || 'Downtown' }] : []);
    const at = {};
    for (const { map, label } of spots) {
      if (!places[map]) continue;
      const key = pinKey(map, name);
      if (saved[key]) { at[map] = saved[key]; continue; }
      const spot = places[map][label] || (map === 'arkham' ? places.arkham.Downtown : null);
      if (!spot) continue;
      // several scenarios at one landmark fan out around it
      const k = `${map}|${spot.label}`;
      const n = used[k] = (used[k] || 0) + 1;
      const angle = (n - 1) * 2.4, rad = n === 1 ? 0 : 1.6 + 0.3 * n;
      at[map] = { x: +(spot.x + rad * Math.cos(angle)).toFixed(2), y: +(spot.y + rad * Math.sin(angle)).toFixed(2) };
    }
    out[name] = Object.keys(at).length ? { ...(at.arkham || {}), at, place: r.place, region: r.region } : { offMap: true, region: r.region || 'Beyond Arkham', place: r.place, at: {} };
  }
  return { pins: out, maps: maps.map(({ places: _p, placesFile: _f, ...m }) => m), pending };
}
export function arkhamLore(names) {
  const pending = placeMissing(names);
  const rows = names.length ? db.prepare(`SELECT name, place, lore FROM arkham_scenario_places WHERE name IN (${names.map(() => '?').join(',')})`).all(...names) : [];
  return { lore: Object.fromEntries(rows.map((r) => [r.name, { place: r.place, lore: r.lore }])), pending };
}
export function moveArkhamPin(scenario, x, y, by, map = 'arkham') {
  db.prepare(`INSERT INTO map_pins (scenario, x, y, by, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(scenario) DO UPDATE SET x = excluded.x, y = excluded.y, by = excluded.by, at = excluded.at`)
    .run(pinKey(map || 'arkham', scenario), Math.max(0, Math.min(100, Number(x))), Math.max(0, Math.min(100, Number(y))), by || null, Date.now());
}
