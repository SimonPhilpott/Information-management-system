import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../db/database.js';
import { arkhamScenarios } from './arkhamCampaigns.js';

// The Arkham Horror map: an HD map of the town of Arkham (public/maps/arkham.jpg) with its landmarks in
// data/decks/arkham_places.json (x, y as percentages). Each scenario is placed once by Gemini - the
// landmark it happens at if it's in Arkham, or the town or region it happens in if it's beyond (those
// sit in the strip beside the map) - with a few lines of case-note lore for its pop-up. Players can drag a
// pin to correct it (kept in map_pins under "ah:<scenario>").

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLACES = path.join(__dirname, '..', '..', 'data', 'decks', 'arkham_places.json');
export const arkhamPlaces = () => JSON.parse(fs.readFileSync(PLACES, 'utf8'));

db.exec(`CREATE TABLE IF NOT EXISTS arkham_scenario_places (name TEXT PRIMARY KEY, map_label TEXT, place TEXT, region TEXT, lore TEXT, at INTEGER NOT NULL)`);
db.exec(`CREATE TABLE IF NOT EXISTS scenario_lore (name TEXT PRIMARY KEY, place TEXT, lore TEXT, source TEXT, at INTEGER NOT NULL)`);

let placing = null;
// Places (and lore for) every scenario of the named ones that hasn't been placed yet - in one batch.
function placeMissing(names) {
  const known = new Set(db.prepare('SELECT name FROM arkham_scenario_places').all().map((r) => r.name));
  const all = arkhamScenarios();
  const todo = [...new Set(names)].filter((n) => !known.has(n)).map((n) => all.find((s) => s.name === n) || { name: n, campaign: null });
  if (!todo.length || placing) return Boolean(placing);
  placing = (async () => {
    try {
      const labels = arkhamPlaces().map((p) => p.label);
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const config = (await import('../../config.js')).default;
      const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          responseMimeType: 'application/json', temperature: 0.4,
          responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, mapLabel: { type: 'STRING', nullable: true }, place: { type: 'STRING' }, region: { type: 'STRING' }, lore: { type: 'STRING' } }, required: ['name', 'place', 'region', 'lore'] } },
        },
      });
      for (let i = 0; i < todo.length; i += 25) {
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
    } catch (err) { console.warn(`[ArkhamMap] Placing scenarios failed: ${err.message}`); } finally { placing = null; }
  })();
  return true;
}

// Pins for the named scenarios: { x, y, place } on the map, or { offMap: true, region, place } beyond it.
export function arkhamPins(names) {
  const pending = placeMissing(names);
  const rows = Object.fromEntries(db.prepare('SELECT * FROM arkham_scenario_places').all().map((r) => [r.name, r]));
  const saved = Object.fromEntries(db.prepare("SELECT scenario, x, y FROM map_pins WHERE scenario LIKE 'ah:%'").all().map((r) => [r.scenario.slice(3), { x: r.x, y: r.y, moved: true }]));
  const places = Object.fromEntries(arkhamPlaces().map((p) => [p.label, p]));
  const out = {}, used = {};
  for (const name of names) {
    const r = rows[name];
    if (saved[name]) { out[name] = { ...saved[name], place: r?.place || null }; continue; }
    if (!r) continue;
    // somewhere in Arkham that isn't a landmark on the map (an investigator's house, "all over town"): Downtown
    const inTown = !r.map_label && /^arkham$/i.test(String(r.region || '').trim());
    const at = (r.map_label && places[r.map_label]) || (inTown && places.Downtown);
    if (!at) { out[name] = { offMap: true, region: r.region || 'Beyond Arkham', place: r.place }; continue; }
    // several scenarios at one landmark fan out around it
    const k = r.map_label || 'Downtown';
    const n = used[k] = (used[k] || 0) + 1;
    const angle = (n - 1) * 2.4, rad = n === 1 ? 0 : 1.6 + 0.3 * n;
    out[name] = { x: +(at.x + rad * Math.cos(angle)).toFixed(2), y: +(at.y + rad * Math.sin(angle)).toFixed(2), place: r.place };
  }
  return { pins: out, pending };
}
export function arkhamLore(names) {
  const pending = placeMissing(names);
  const rows = names.length ? db.prepare(`SELECT name, place, lore FROM arkham_scenario_places WHERE name IN (${names.map(() => '?').join(',')})`).all(...names) : [];
  return { lore: Object.fromEntries(rows.map((r) => [r.name, { place: r.place, lore: r.lore }])), pending };
}
export function moveArkhamPin(scenario, x, y, by) {
  db.prepare(`INSERT INTO map_pins (scenario, x, y, by, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(scenario) DO UPDATE SET x = excluded.x, y = excluded.y, by = excluded.by, at = excluded.at`)
    .run(`ah:${scenario}`, Math.max(0, Math.min(100, Number(x))), Math.max(0, Math.min(100, Number(y))), by || null, Date.now());
}
