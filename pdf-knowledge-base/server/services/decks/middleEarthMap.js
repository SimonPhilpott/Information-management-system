import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../db/database.js';

// Where each LOTR LCG scenario happens on the campaign map (public/maps/middle-earth.svg - "Map of
// Middle-Earth" by k1tesurfen, CC BY-SA 4.0, Wikimedia Commons). Place positions come from the map's own
// labels (data/decks/middle_earth_places.json, read off the map once), each scenario is tied to the
// places it's set in (first match wins), and anyone can drag a pin to correct it - kept in map_pins.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLACES_FILE = path.join(__dirname, '..', '..', 'data', 'decks', 'middle_earth_places.json');

db.exec(`CREATE TABLE IF NOT EXISTS map_pins (scenario TEXT PRIMARY KEY, x REAL NOT NULL, y REAL NOT NULL, by TEXT, at INTEGER NOT NULL)`);

// scenario name -> places to look for on the map, most specific first
export const SCENARIO_PLACES = {
  // Core Set / Revised Core
  'Passage Through Mirkwood': ['Old Forest Road', 'Mirkwood'],
  'Journey Along the Anduin': ['Carrock', 'Anduin'],
  'Escape from Dol Guldur': ['Dol Guldur'],
  // The Hobbit saga
  'We Must Away, Ere Break of Day': ['Trollshaws', 'Last Bridge', 'Mitheithel'],
  'Over the Misty Mountains Grim': ['High Pass', 'Misty Mountains'],
  'Dungeons Deep and Caverns Dim': ['Goblin-town', 'High Pass', 'Misty Mountains'],
  'Flies and Spiders': ['Mirkwood'],
  'The Lonely Mountain': ['Esgaroth', 'Lake-town', 'Long Lake'],
  'The Battle of Five Armies': ['Erebor', 'Lonely Mountain', 'Dale'],
  // The Lord of the Rings saga
  'A Shadow of the Past': ['Hobbiton', 'The Shire', 'Shire'],
  'A Knife in the Dark': ['Weathertop', 'Amon Sûl', 'Bree'],
  'Flight to the Ford': ['Ford of Bruinen', 'Bruinen', 'Rivendell'],
  'The Ring Goes South': ['Caradhras', 'Redhorn', 'Eregion', 'Hollin'],
  'Journey in the Dark': ['Moria', 'Khazad-dûm', 'Dimrill Dale'],
  'Breaking of the Fellowship': ['Amon Hen', 'Falls of Rauros', 'Rauros', 'Emyn Muil'],
  'The Uruk-hai': ['East Emnet', 'The Wold', 'Emnet', 'Rohan'],
  "Helm's Deep": ["Helm's Deep", 'Hornburg', 'Westfold'],
  'The Road to Isengard': ['Isengard', 'Orthanc', 'Nan Curunír'],
  'The Passage of the Marshes': ['Dead Marshes', 'Dagorlad'],
  'Journey to the Cross-roads': ['Cross-roads', 'S. Ithilien', 'South Ithilien', 'Ithilien'],
  "Shelob's Lair": ['Cirith Ungol', 'Minas Morgul'],
  'The Passing of the Grey Company': ['Erech', 'Dunharrow', 'Paths of the Dead', 'Morthond'],
  'The Siege of Gondor': ['Rammas Echor', 'Osgiliath', 'Pelennor'],
  'The Battle of the Pelennor Fields': ['Pelennor', 'Minas Tirith'],
  'The Tower of Cirith Ungol': ['Cirith Ungol', 'Minas Morgul'],
  'The Black Gate Opens': ['Morannon', 'Black Gate'],
  'Mount Doom': ['Mount Doom', 'Orodruin', 'Mt. Doom', 'Plateau of Gorgoroth'],
  'The Old Forest': ['Old Forest'],
  'Fog on the Barrow-downs': ['Barrow-downs', 'Barrow Downs'],
  'The Ruins of Belegost': ['Belegost', 'Ered Luin', 'Blue Mountains'],
  'Murder at the Prancing Pony': ['Bree'],
  // The Dark of Mirkwood / starter
  'The Oath': ['Mirkwood'],
  'The Caves of Nibin-Dûm': ['Mirkwood'],
  // Shadows of Mirkwood
  'The Hunt for Gollum': ['Gladden Fields', 'Anduin'],
  'Conflict at the Carrock': ['Carrock'],
  'A Journey to Rhosgobel': ['Rhosgobel', 'Old Ford', 'Mirkwood'],
  'The Hills of Emyn Muil': ['Emyn Muil'],
  'The Dead Marshes': ['Dead Marshes'],
  'Return to Mirkwood': ['Woodland Realm', "Thranduil's Halls", 'Wood Elves', 'Mirkwood'],
  // Dwarrowdelf
  'Into the Pit': ['Moria', 'Khazad-dûm'], 'The Seventh Level': ['Moria', 'Khazad-dûm'], 'Flight from Moria': ['Moria', 'Khazad-dûm'],
  'The Redhorn Gate': ['Caradhras', 'Redhorn', 'Dimrill Dale', 'Eregion'], 'Road to Rivendell': ['Rivendell'], 'The Watcher in the Water': ['Moria', 'Sirannon'],
  'The Long Dark': ['Moria'], 'Foundations of Stone': ['Moria'], 'Shadow and Flame': ['Moria'],
  // Against the Shadow
  'Peril in Pelargir': ['Pelargir'], 'Into Ithilien': ['Ithilien', 'South Ithilien'], 'The Siege of Cair Andros': ['Cair Andros', 'Anduin'],
  "The Steward's Fear": ['Minas Tirith'], 'The Drúadan Forest': ['Drúadan Forest', 'Druadan Forest', 'Anórien'], 'Encounter at Amon Dîn': ['Amon Dîn', 'Anórien'],
  'Assault on Osgiliath': ['Osgiliath'], 'The Blood of Gondor': ['Ithilien'], 'The Morgul Vale': ['Minas Morgul', 'Morgul'],
  // The Ring-maker
  'The Fords of Isen': ['Fords of Isen', 'Isen'], 'To Catch an Orc': ['Dunland'], 'Into Fangorn': ['Fangorn'],
  'The Dunland Trap': ['Dunland'], 'The Three Trials': ['Dunland'], 'Trouble in Tharbad': ['Tharbad'],
  'The Nîn-in-Eilph': ['Nîn-in-Eilph', 'Swanfleet', 'Gwathló'], "Celebrimbor's Secret": ['Ost-in-Edhil', 'Eregion', 'Hollin'], 'The Antlered Crown': ['Dunland'],
  // Angmar Awakened
  'Intruders in Chetwood': ['Chetwood', 'Bree'], 'The Weather Hills': ['Weather Hills', 'Weathertop'], "Deadmen's Dike": ['Fornost', "Deadmen's Dike"],
  'The Wastes of Eriador': ['Ettenmoors', 'Eriador'], 'Escape from Mount Gram': ['Mount Gram', 'Mountains of Angmar', 'Ettenmoors'], 'Across the Ettenmoors': ['Ettenmoors'],
  'The Treachery of Rhudaur': ['Rhudaur', 'Trollshaws', 'Weather Hills'], 'The Battle of Carn Dûm': ['Carn Dûm'], 'The Dread Realm': ['Angmar', 'Carn Dûm'],
  // Dream-chaser
  'Voyage Across Belegaer': ['Belegaer', 'Gulf of Lhûn'], 'The Fate of Númenor': ['Belegaer', 'Gulf of Lhûn'], 'Raid on the Grey Havens': ['Grey Havens', 'Mithlond'],
  'Flight of the Stormcaller': ['Belegaer', 'Belfalas'], 'The Thing in the Depths': ['Belegaer', 'Andrast (Ras Morthil)'], 'Temple of the Deceived': ['Belegaer', 'Tolfolas'],
  'The Drowned Ruins': ['Belegaer', 'Tolfolas'], 'A Storm on Cobas Haven': ['Umbar', 'Harnen', 'South Gondor (Harondor)'], 'The City of Corsairs': ['Umbar', 'Harnen', 'South Gondor (Harondor)'],
  // Haradrim
  'Escape from Umbar': ['Umbar', 'Harnen', 'South Gondor (Harondor)'], 'Desert Crossing': ['Near Harad', 'Harad'], 'The Long Arm of Mordor': ['Near Harad', 'Harad'],
  'The Mûmakil': ['Harad', 'Near Harad'], 'Race Across Harad': ['Harad'], 'Beneath the Sands': ['Harad'], 'The Black Serpent': ['Harad'],
  'The Dungeons of Cirith Gurat': ['Ephel Dúath', 'Mordor'], 'The Crossings of Poros': ['Poros', 'Harondor'],
  // Ered Mithrin
  'Journey Up the Anduin': ['Anduin', 'Carrock'], 'Lost in Mirkwood': ['Mirkwood'], "The King's Quest": ['Woodland Realm', 'Wood Elves', 'Mirkwood'],
  'The Withered Heath': ['Withered Heath', 'Grey Mountains', 'Ered Mithrin'], 'Roam Across Rhovanion': ['Rhovanion'],
  'Fire in the Night': ['Ered Mithrin', 'Grey Mountains'], 'The Ghost of Framsburg': ['Framsburg', 'Mount Gundabad'], 'Mount Gundabad': ['Gundabad'],
  'The Fate of Wilderland': ['Rhovanion', 'Wilderland'],
  // Vengeance of Mordor
  'The River Running': ['Celduin (River Running)', 'Celduin', 'Long Lake'], 'Danger in Dorwinion': ['Dorwinion', 'Sea of Rhûn'], 'The Temple of Doom': ['Sea of Rhûn', 'Rhûn'],
  'Wrath and Ruin': ['Rhûn'], 'The City of Ulfast': ['Rhûn'], 'Challenge of the Wainriders': ['Dagorlad', 'Rhovanion'],
  'Under the Ash Mountains': ['Ered Lithui', 'Ash Mountains'], 'The Land of Sorrow': ['Dagorlad', 'Mordor'], 'The Fortress of Nurn': ['Núrn', 'Sea of Núrnen'],
  // standalone and later scenarios
  'The Massing at Osgiliath': ['Osgiliath'], 'The Battle of Lake-town': ['Esgaroth', 'Lake-town', 'Long Lake'], 'The Stone of Erech': ['Erech'],
  'The Siege of Annúminas': ['Annúminas', 'Lake Evendim', 'Nenuial'], 'Attack on Dol Guldur': ['Dol Guldur'], 'The Woodland Realm': ['Woodland Realm', 'Wood Elves', 'Mirkwood'],
  'The Mines of Moria': ['Moria'], 'Escape from Khazad-dûm': ['Moria'], 'The Hunt for the Dreadnaught': ['Belegaer', 'Belfalas'],
};

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();

function loadPlaces() {
  try { return JSON.parse(fs.readFileSync(PLACES_FILE, 'utf8')); } catch (_) { return []; }
}

// Scenario name -> { x, y } in % of the map, or nothing if it can't be placed (it can then be dragged on).
export function scenarioPins(names) {
  const places = loadPlaces();
  // "Weathertop (Amon Sûl)" answers to both names; "Erebor The Lonely Mountain" and "Moria Gate" to
  // their key word. An exact name beats a word inside a longer label.
  const byName = new Map();
  const words = [];
  for (const p of places) {
    const full = norm(p.label);
    const parts = [full, ...String(p.label).split(/[()]/).map(norm).filter(Boolean)];
    for (const k of parts) if (!byName.has(k)) byName.set(k, p);
    words.push([` ${full} `, p]);
  }
  const find = (w) => byName.get(norm(w)) || words.find(([t]) => t.includes(` ${norm(w)} `))?.[1] || null;
  const saved = Object.fromEntries(db.prepare('SELECT scenario, x, y FROM map_pins').all().map((r) => [r.scenario, { x: r.x, y: r.y, moved: true }]));
  const out = {};
  const usedSpots = {};
  for (const name of names) {
    if (saved[name]) { out[name] = saved[name]; continue; }
    const wants = SCENARIO_PLACES[name.replace(/^ALeP - /, '')] || [name];
    let hit = null, place = null;
    for (const w of wants) { hit = find(w); if (hit) { place = hit.label; break; } }
    if (!hit) continue;
    // Several scenarios in one place (Moria, Mirkwood...) fan out around it rather than stacking.
    const key = `${hit.x},${hit.y}`;
    const n = usedSpots[key] = (usedSpots[key] || 0) + 1;
    const angle = (n - 1) * 2.4, r = n === 1 ? 0 : 1.1 + 0.25 * n;
    out[name] = { x: +(hit.x + r * Math.cos(angle)).toFixed(2), y: +(hit.y + r * Math.sin(angle) * 1.33).toFixed(2), place };
  }
  return out;
}

export function movePin(scenario, x, y, by) {
  const nx = Math.max(0, Math.min(100, Number(x))), ny = Math.max(0, Math.min(100, Number(y)));
  if (!scenario || !Number.isFinite(nx) || !Number.isFinite(ny)) throw new Error('Bad pin position.');
  db.prepare(`INSERT INTO map_pins (scenario, x, y, by, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(scenario) DO UPDATE SET x = excluded.x, y = excluded.y, by = excluded.by, at = excluded.at`)
    .run(String(scenario), nx, ny, by || null, Date.now());
}
export const resetPin = (scenario) => db.prepare('DELETE FROM map_pins WHERE scenario = ?').run(String(scenario)).changes > 0;

// ---- scenario lore for the map ------------------------------------------------------------------------
// A short "where it is" and a paragraph of Tolkien history for each scenario, written once by Gemini and
// kept. Where the scenario's FFG rulesheet is indexed, its own story text is used as the basis.
db.exec(`CREATE TABLE IF NOT EXISTS scenario_lore (name TEXT PRIMARY KEY, place TEXT, lore TEXT, source TEXT, at INTEGER NOT NULL)`);
const loreQueue = new Set();
let loreRunning = false;

async function writeLore(name, pack) {
  let passages = '';
  try {
    const { booksFor } = await import('./rulebooks.js');
    const books = booksFor(null, pack);
    const sheet = books.filter((b) => !/Learn to Play|Rules Reference|FAQ|Easy Mode/i.test(b.filename));
    if (sheet.length) {
      const { generateQueryEmbedding } = await import('../embeddingService.js');
      const { searchSimilar } = await import('../vectorStore.js');
      const hits = await searchSimilar(await generateQueryEmbedding(`${name} story introduction`), [], 5, true, sheet.map((b) => b.drive_file_id));
      passages = hits.map((h) => String(h.text || '').slice(0, 900)).join('\n---\n');
    }
  } catch (_) { /* rulebooks not indexed yet - Gemini's own knowledge */ }
  const { GoogleGenerativeAI } = await import('../geminiClient.js');
  const config = (await import('../../config.js')).default;
  const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.5, responseSchema: { type: 'OBJECT', properties: { place: { type: 'STRING' }, lore: { type: 'STRING' } }, required: ['place', 'lore'] } },
  });
  const prompt = `For a Lord of the Rings: The Card Game campaign map, write the lore note for the scenario "${name}"${pack ? ` (from ${pack})` : ''}.
place: where in Middle-earth it happens, short (e.g. "The Shire, Eriador" or "The Dead Marshes, before the Black Gate").
lore: one paragraph of 55-85 words, evocative but accurate to Tolkien's books - what happened in this place in the stories, and what the heroes face there in this scenario. If the scenario is not from the books (an original FFG story), say what the place is in Tolkien's world and set the scene. No spoilers of the scenario's twists, no game terms.
${passages ? `The scenario's own rulesheet story text, to base it on:\n${passages}` : ''}`;
  const out = JSON.parse((await model.generateContent(prompt)).response.text());
  db.prepare('INSERT OR REPLACE INTO scenario_lore (name, place, lore, source, at) VALUES (?, ?, ?, ?, ?)').run(name, String(out.place || '').slice(0, 120), String(out.lore || '').slice(0, 900), passages ? 'rulesheet' : 'gemini', Date.now());
}

// Lore for these scenarios: what's written already; the rest are written in the background.
export function scenarioLore(items) {
  const names = items.map((x) => x.name);
  const rows = names.length ? db.prepare(`SELECT * FROM scenario_lore WHERE name IN (${names.map(() => '?').join(',')})`).all(...names) : [];
  const have = Object.fromEntries(rows.map((r) => [r.name, { place: r.place, lore: r.lore, source: r.source }]));
  for (const x of items) if (!have[x.name]) loreQueue.add(JSON.stringify([x.name, x.pack || null]));
  if (!loreRunning && loreQueue.size) {
    loreRunning = true;
    (async () => {
      const worker = async () => {
        for (;;) {
          const next = loreQueue.values().next().value;
          if (!next) return;
          loreQueue.delete(next);
          const [n, p] = JSON.parse(next);
          try { await writeLore(n, p); } catch (err) { console.warn(`[Map] Lore for ${n} failed: ${err.message}`); }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      loreRunning = false;
    })();
  }
  return { lore: have, pending: names.filter((n) => !have[n]).length };
}
