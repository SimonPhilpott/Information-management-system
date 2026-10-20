import db from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI } from './geminiClient.js';
import { getModelFor } from './modelRegistry.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { expectedColour, fillColours, colourByYou } from './homebrewColours.js';
import { readyPictures, readyBanner, bannerChoiceOf } from './homebrewPictures.js';
import { tagRecipes, splitName, variantLabel, normSweetness, COLOUR_OF_CAT, estimateAbv, profileOf } from './homebrewTags.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Homebrew (/ims/homebrew, Personal): Simon's mead, braggot and other brews - the recipe, everything that happened
// to each batch (readings, nutrient additions, racking, stabilising, bottling), how it tasted as it aged, and
// insights: the flavour profile it's heading for, and what a tweak would change next time.
//
// What's worth keeping (19 Oct research - Mead Maker / Brewfather logs, the BJCP mead guidelines, TOSNA):
//  - recipe: honey/malt/fruit/spice with amounts, yeast strain and how it was pitched, batch size, target OG/FG
//  - readings over time: gravity, temperature, pH - with the 1/3 sugar break that times the last TOSNA nutrient dose
//  - events: nutrient doses, degassing, additions, racking, stabilising, backsweetening, bottling, priming
//  - tastings at each stage: sweetness, body, acidity, alcohol heat, aroma and flavour notes, clarity, carbonation,
//    a rating, and what to change next time
//  - BJCP sense of style: sweetness (dry 0.990-1.010 / semi-sweet 1.010-1.025 / sweet 1.025-1.050 FG), strength
//    (hydromel 3.5-7.5% / standard 7.5-14% / sack 14-18%), carbonation (still / petillant / sparkling)

db.exec(`
  CREATE TABLE IF NOT EXISTS brews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    style TEXT,
    status TEXT NOT NULL DEFAULT 'planning',
    batch_litres REAL,
    started_on TEXT,
    bottled_on TEXT,
    ingredients TEXT NOT NULL DEFAULT '[]',
    yeast TEXT,
    yeast_notes TEXT,
    nutrients TEXT,
    water TEXT,
    target_og REAL, target_fg REAL, og REAL, fg REAL,
    sweetness TEXT,
    carbonation TEXT,
    method TEXT,
    notes TEXT,
    insight TEXT,
    insight_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS brew_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brew_id INTEGER NOT NULL,
    at INTEGER NOT NULL,
    kind TEXT NOT NULL,
    gravity REAL, temp_c REAL, ph REAL,
    text TEXT,
    source TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_brew_logs_brew ON brew_logs(brew_id, at);
  CREATE TABLE IF NOT EXISTS brew_tastings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brew_id INTEGER NOT NULL,
    at INTEGER NOT NULL,
    stage TEXT,
    rating INTEGER,
    sweetness INTEGER, body INTEGER, acidity INTEGER, heat INTEGER,
    aroma TEXT, flavour TEXT, clarity TEXT, carbonation TEXT,
    verdict TEXT, change_next TEXT,
    source TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_brew_tastings_brew ON brew_tastings(brew_id, at);
`);
// the kind of drink; recipe-book entries (common recipes and ones he keeps) and where a recipe came from
for (const col of ['category TEXT', 'is_recipe INTEGER NOT NULL DEFAULT 0', 'source_name TEXT', 'source_url TEXT', 'from_recipe INTEGER', 'favourite INTEGER NOT NULL DEFAULT 0',
  // recipe families (same drink from different books, one card), version label, wine colour tag, where the sweetness came from
  'family TEXT', 'variant TEXT', 'colour TEXT', 'sweetness_basis TEXT', 'summary TEXT']) {
  try { db.exec(`ALTER TABLE brews ADD COLUMN ${col}`); } catch (_) { /* already there */ }
}

// Braggots are beers (beer strength, malt-based) - move any filed as mead
try {
  db.prepare("UPDATE brews SET category = 'beer', style = 'Braggot (honey beer)' WHERE style = 'Braggot (malt mead)'").run();
} catch (_) { /* nothing to move */ }

// The kinds of drink, each with its styles - all made from scratch (no kits)
// Replaced legacy Rose and other wines with Richard W. Bender's Wild Winemaking categories:
// Fruit & vegetable wine, Flower & herb wine, Hot pepper wine (cannabis wines excluded)
export const CATEGORIES = [
  { id: 'white_wine', label: 'White wine', styles: ['Grape (white)', 'Gooseberry', 'Apple', 'Pear (perry-style)', 'Parsnip', 'Other white'] },
  { id: 'red_wine', label: 'Red wine', styles: ['Grape (red)', 'Blackberry', 'Elderberry', 'Damson', 'Plum', 'Blackcurrant', 'Other red'] },
  // Red, White and Rosé are also colour tags: every wine is tagged with its colour, so these show all wines of that colour
  { id: 'rose_wine', label: 'Rosé wine', styles: ['Grape (rosé)', 'Strawberry', 'Raspberry', 'Redcurrant', 'Rhubarb', 'Other rosé'] },
  { id: 'fruit_veg_wine', label: 'Fruit & vegetable wine', styles: ['Berry wine', 'Stone fruit (Peach / Plum / Cherry)', 'Pome fruit (Apple / Pear)', 'Citrus wine', 'Tropical fruit', 'Rhubarb / Blend', 'Vegetable wine (Kale / Tomato)', 'Sake-style (Squash / Pumpkin / Rice)', 'Cereal wine (Wheat / Barley / Rice)', 'Sparkling fruit wine', 'Other fruit & vegetable'] },
  { id: 'flower_herb_wine', label: 'Flower & herb wine', styles: ['Dandelion', 'Elderflower', 'Flower wine (Rose / Jasmine / Lavender)', 'Herb wine (Basil / Thyme / Rosemary)', 'Mint wine (Peppermint / Spearmint)', 'Tea & botanical wine', 'Other flower & herb'] },
  { id: 'hot_pepper_wine', label: 'Hot pepper wine', styles: ['Citrus & hot pepper', 'Sweet fruit & pepper', 'Mole & chocolate pepper', 'Tomato & pepper', 'Superhot pepper (Ghost / Habanero)', 'Mild / Medium pepper', 'Other hot pepper'] },
  { id: 'mead', label: 'Mead', styles: ['Traditional mead', 'Melomel (fruit mead)', 'Metheglin (spiced mead)', 'Cyser (apple mead)', 'Pyment (grape mead)', 'Bochet (caramelised honey)', 'Other mead'] },
  { id: 'beer', label: 'Beer', styles: ['Bitter', 'Pale ale / IPA', 'Golden ale', 'Mild', 'Brown ale', 'Lager', 'Wheat beer', 'Braggot (honey beer)', 'Herb / foraged beer', 'Other beer'] },
  { id: 'stout', label: 'Stout', styles: ['Dry stout', 'Sweet / milk stout', 'Oatmeal stout', 'Imperial stout', 'Porter', 'Other stout'] },
  { id: 'cider', label: 'Cider', styles: ['Cider', 'Perry', 'Fruit cider', 'Other cider'] },
  { id: 'soda', label: 'Wild soda & kvass', styles: ['Wild soda', 'Root beer', 'Ginger beer', 'Kvass', 'Tepache, smreka & folk drinks', 'Lacto-fermented soda', 'Starter / bug', 'Other soda'] },
];
export const STYLES = CATEGORIES.flatMap((c) => c.styles);
const categoryOfStyle = (style) => (CATEGORIES.find((c) => c.styles.includes(style)) || {}).id || null;
export const STATUSES = ['planning', 'fermenting', 'conditioning', 'bottled', 'finished', 'dumped'];
export const LOG_KINDS = ['reading', 'nutrient', 'degas', 'addition', 'rack', 'stabilise', 'backsweeten', 'bottle', 'note'];

// Auto-seed recipes from Wild Winemaking (Richard W. Bender) if not already present
try {
  const existingWildCount = db.prepare("SELECT COUNT(*) AS c FROM brews WHERE is_recipe = 1 AND source_name = 'Wild Winemaking (Richard W. Bender)'").get()?.c || 0;
  if (existingWildCount === 0) {
    const recipesFile = path.join(__dirname, '..', 'data', 'wild_winemaking_recipes.json');
    if (fs.existsSync(recipesFile)) {
      const items = JSON.parse(fs.readFileSync(recipesFile, 'utf8'));
      const insert = db.prepare(`
        INSERT INTO brews (name, style, category, status, batch_litres, ingredients, yeast, carbonation, method, notes, source_name, source_url, is_recipe, created_at, updated_at)
        VALUES (@name, @style, @category, @status, @batch_litres, @ingredients, @yeast, @carbonation, @method, @notes, @source_name, @source_url, @is_recipe, @created_at, @updated_at)
      `);
      const insertAll = db.transaction((list) => {
        const now = Date.now();
        for (const it of list) {
          insert.run({
            name: it.name,
            style: it.style,
            category: it.category,
            status: it.status || 'planning',
            batch_litres: it.batch_litres || 4.5,
            ingredients: JSON.stringify(it.ingredients || []),
            yeast: it.yeast || null,
            carbonation: it.carbonation || 'still',
            method: it.method || '',
            notes: it.notes || null,
            source_name: it.source_name || 'Wild Winemaking (Richard W. Bender)',
            source_url: it.source_url || null,
            is_recipe: 1,
            created_at: now,
            updated_at: now
          });
        }
      });
      insertAll(items);
      console.log(`[Homebrew] Seeded ${items.length} recipes from Wild Winemaking.`);
    }
  }
} catch (err) {
  console.warn('[Homebrew] Seeding Wild Winemaking recipes notice:', err.message);
}

// tag recipes with their family, version, colour and sweetness - all of them the first time, then any new ones
try { const n = tagRecipes(db); if (n) console.log(`[Homebrew] Tagged ${n} recipes (family, colour, sweetness).`); } catch (err) { console.warn('[Homebrew] Tagging recipes:', err.message); }

const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const json = (s, d) => { try { return JSON.parse(s || ''); } catch { return d; } };

// --- the sums brewers do -----------------------------------------------------------------------------------
export const abv = (og, fg) => (og && fg ? Math.round((og - fg) * 131.25 * 10) / 10 : null);
// the gravity at which a third of the sugar is gone (the last TOSNA dose is due by then, or by day 7)
export const thirdBreak = (og, fg = 1.0) => (og ? Math.round((og - (og - (fg || 1.0)) / 3) * 1000) / 1000 : null);
export const attenuation = (og, gravity) => (og && gravity && og > 1 ? Math.round(((og - gravity) / (og - 1)) * 100) : null);
export const sweetnessOf = (fg) => (!fg ? null : fg < 1.010 ? 'dry' : fg < 1.025 ? 'semi-sweet' : 'sweet');
export const strengthOf = (a) => (!a ? null : a < 7.5 ? 'hydromel' : a < 14 ? 'standard' : 'sack');

function present(r, { full = false } = {}) {
  if (!r) return null;
  const logs = db.prepare('SELECT * FROM brew_logs WHERE brew_id = ? ORDER BY at').all(r.id);
  const tastings = db.prepare('SELECT * FROM brew_tastings WHERE brew_id = ? ORDER BY at').all(r.id);
  const readings = logs.filter((l) => l.gravity);
  const latest = readings.length ? readings[readings.length - 1].gravity : null;
  const og = r.og || (readings[0]?.gravity ?? null);
  const fgNow = r.fg || latest;
  const a = abv(og, r.fg || latest);
  const out = {
    id: r.id, name: r.name, style: r.style, category: r.category || categoryOfStyle(r.style), isRecipe: Boolean(r.is_recipe), favourite: Boolean(r.favourite), sourceName: r.source_name, sourceUrl: r.source_url, fromRecipe: r.from_recipe, status: r.status, batchLitres: r.batch_litres, startedOn: r.started_on, bottledOn: r.bottled_on,
    ingredients: json(r.ingredients, []), yeast: r.yeast, yeastNotes: r.yeast_notes, nutrients: r.nutrients, water: r.water,
    targetOg: r.target_og, targetFg: r.target_fg, og: r.og, fg: r.fg, sweetness: r.sweetness, carbonation: r.carbonation,
    shared: Boolean(r.share_token), sweetnessTag: normSweetness(r.sweetness), sweetnessBasis: r.sweetness_basis, abvEstimate: !r.target_og ? estimateAbv(r) : null, /* brews too: a likely strength until readings give the real one */ ...profileOf(r), colour: r.colour || COLOUR_OF_CAT[r.category] || null, liquid: expectedColour(r.id, r.from_recipe), mainPics: readyPictures(r.id, r.from_recipe), banner: readyBanner(r.id, r.from_recipe), bannerChoice: bannerChoiceOf(r.id), liquidChoice: colourByYou(r.id) || '', family: r.family, variant: r.variant,
    method: r.method, notes: r.notes, summary: r.summary || null, createdAt: r.created_at, updatedAt: r.updated_at,
    calc: {
      latestGravity: latest, abv: a, abvFinal: Boolean(r.fg), potentialAbv: abv(og || r.target_og, r.target_fg || 1.0),
      thirdBreak: thirdBreak(og || r.target_og, r.target_fg || 1.0), attenuation: attenuation(og, latest),
      sweetnessClass: sweetnessOf(fgNow), strengthClass: strengthOf(a || abv(og || r.target_og, r.target_fg || 1.0)),
      daysSinceStart: r.started_on ? Math.floor((Date.now() - Date.parse(`${r.started_on}T12:00:00Z`)) / 86400000) : null,
    },
    rating: tastings.length ? tastings[tastings.length - 1].rating : null,
    insight: json(r.insight, null), insightAt: r.insight_at,
  };
  if (full) {
    out.logs = logs.map((l) => ({ id: l.id, at: l.at, kind: l.kind, gravity: l.gravity, tempC: l.temp_c, ph: l.ph, text: l.text, source: l.source }));
    out.tastings = tastings.map((t) => ({ id: t.id, at: t.at, stage: t.stage, rating: t.rating, sweetness: t.sweetness, body: t.body, acidity: t.acidity, heat: t.heat,
      aroma: t.aroma, flavour: t.flavour, clarity: t.clarity, carbonation: t.carbonation, verdict: t.verdict, changeNext: t.change_next, source: t.source }));
  }
  return out;
}

export const listBrews = () => db.prepare('SELECT * FROM brews WHERE is_recipe = 0 ORDER BY COALESCE(started_on, date(created_at / 1000, \'unixepoch\')) DESC, id DESC').all().map((r) => present(r));
export const listRecipes = () => (tagRecipes(db), db.prepare('SELECT * FROM brews WHERE is_recipe = 1 ORDER BY category, name').all().map((r) => present(r)));
export const getBrew = (id) => present(db.prepare('SELECT * FROM brews WHERE id = ?').get(Number(id)), { full: true });

const FIELDS = { name: 'name', style: 'style', category: 'category', sourceName: 'source_name', sourceUrl: 'source_url', status: 'status', batchLitres: 'batch_litres', startedOn: 'started_on', bottledOn: 'bottled_on', yeast: 'yeast', yeastNotes: 'yeast_notes',
  nutrients: 'nutrients', water: 'water', targetOg: 'target_og', targetFg: 'target_fg', og: 'og', fg: 'fg', sweetness: 'sweetness', carbonation: 'carbonation', method: 'method', notes: 'notes', colour: 'colour', summary: 'summary' };
const NUMERIC = new Set(['batch_litres', 'target_og', 'target_fg', 'og', 'fg']);

export function saveBrew(id, body = {}) {
  const set = {};
  for (const [k, col] of Object.entries(FIELDS)) if (body[k] !== undefined) set[col] = NUMERIC.has(col) ? num(body[k]) : (String(body[k] ?? '').trim() || null);
  if (body.ingredients !== undefined) set.ingredients = JSON.stringify((Array.isArray(body.ingredients) ? body.ingredients : []).filter((i) => i && String(i.name || '').trim()));
  if (set.status && !STATUSES.includes(set.status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
  if (set.category && !CATEGORIES.some((c) => c.id === set.category)) throw new Error('Unknown category');
  if (set.style && !set.category && !id) set.category = categoryOfStyle(set.style);
  if (body.isRecipe !== undefined) set.is_recipe = body.isRecipe ? 1 : 0;
  if (set.colour && !['red', 'white', 'rose'].includes(set.colour)) throw new Error('colour must be red, white or rose');
  const before = id ? db.prepare('SELECT * FROM brews WHERE id = ?').get(Number(id)) : null;
  // a sweetness he picks himself is his, not the book's or an estimate
  if (set.sweetness !== undefined && (set.sweetness || null) !== (before?.sweetness || null)) set.sweetness_basis = set.sweetness ? 'you' : null;
  const isRecipe = set.is_recipe ?? before?.is_recipe;
  if (isRecipe && (set.name || set.category || set.source_name !== undefined || !id)) {
    const name = set.name || before?.name, category = set.category || before?.category, source = set.source_name !== undefined ? set.source_name : before?.source_name;
    if (name) { set.family = splitName(name, category).family; set.variant = variantLabel(name, category, source); }
  }
  const now = Date.now();
  if (!id) {
    if (!set.name) throw new Error('Give the brew a name.');
    const cols = Object.keys(set);
    const rid = db.prepare(`INSERT INTO brews (${cols.join(', ')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(', ')}, ?, ?)`).run(...cols.map((c) => set[c]), now, now).lastInsertRowid;
    return getBrew(rid);
  }
  if (!db.prepare('SELECT id FROM brews WHERE id = ?').get(Number(id))) throw new Error(`No brew #${id}`);
  set.updated_at = now;
  const cols = Object.keys(set);
  db.prepare(`UPDATE brews SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => set[c]), Number(id));
  fillColours().catch(() => {}); // an edited recipe's demijohn colour is worked out again straight away
  return getBrew(id);
}

const COPY = ['name', 'style', 'category', 'batch_litres', 'ingredients', 'yeast', 'yeast_notes', 'nutrients', 'water', 'target_og', 'target_fg', 'sweetness', 'sweetness_basis', 'colour', 'carbonation', 'method', 'notes', 'summary', 'source_name', 'source_url'];
function copyBrew(id, { asRecipe }) {
  const r = db.prepare('SELECT * FROM brews WHERE id = ?').get(Number(id));
  if (!r) throw new Error(`No brew #${id}`);
  const now = Date.now();
  const vals = COPY.map((c) => r[c]);
  const nid = db.prepare(`INSERT INTO brews (${COPY.join(', ')}, is_recipe, status, from_recipe, created_at, updated_at) VALUES (${COPY.map(() => '?').join(', ')}, ?, ?, ?, ?, ?)`)
    .run(...vals, asRecipe ? 1 : 0, 'planning', asRecipe ? null : r.id, now, now).lastInsertRowid;
  if (asRecipe) tagRecipes(db);
  return getBrew(nid);
}
// star a recipe or brew as a favourite (or un-star it)
export function setFavourite(id, on) {
  const n = db.prepare('UPDATE brews SET favourite = ? WHERE id = ?').run(on ? 1 : 0, Number(id)).changes;
  if (!n) throw new Error('No such brew');
  return present(db.prepare('SELECT * FROM brews WHERE id = ?').get(Number(id)));
}
export const startFromRecipe = (id) => copyBrew(id, { asRecipe: false });
export const saveAsRecipe = (id) => copyBrew(id, { asRecipe: true });

export function deleteBrew(id) {
  db.prepare('DELETE FROM brew_logs WHERE brew_id = ?').run(Number(id));
  db.prepare('DELETE FROM brew_tastings WHERE brew_id = ?').run(Number(id));
  return db.prepare('DELETE FROM brews WHERE id = ?').run(Number(id)).changes > 0;
}

// A log entry; a reading with no OG yet becomes the OG, and bottling moves the status on
export function addLog(brewId, { kind = 'reading', gravity, tempC, ph, text, at, source = 'page' } = {}) {
  const b = db.prepare('SELECT * FROM brews WHERE id = ?').get(Number(brewId));
  if (!b) throw new Error(`No brew #${brewId}`);
  const k = LOG_KINDS.includes(kind) ? kind : 'note';
  const g = num(gravity);
  if (g !== null && (g < 0.98 || g > 1.2)) throw new Error('Gravity looks wrong - expected something like 1.095 or 0.998.');
  const when = at ? (typeof at === 'number' ? at : Date.parse(at)) || Date.now() : Date.now();
  const id = db.prepare('INSERT INTO brew_logs (brew_id, at, kind, gravity, temp_c, ph, text, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(b.id, when, k, g, num(tempC), num(ph), String(text || '').trim() || null, source).lastInsertRowid;
  const set = {};
  if (g !== null && !b.og) set.og = g;
  if (b.status === 'planning') { set.status = 'fermenting'; if (!b.started_on) set.started_on = new Date(when).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); }
  if (k === 'bottle') { set.status = 'bottled'; set.bottled_on = new Date(when).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); if (g !== null) set.fg = g; }
  if (Object.keys(set).length) { set.updated_at = Date.now(); const c = Object.keys(set); db.prepare(`UPDATE brews SET ${c.map((x) => `${x} = ?`).join(', ')} WHERE id = ?`).run(...c.map((x) => set[x]), b.id); }
  return { id, brew: getBrew(b.id) };
}
export const deleteLog = (id) => db.prepare('DELETE FROM brew_logs WHERE id = ?').run(Number(id)).changes > 0;

export function addTasting(brewId, t = {}) {
  if (!db.prepare('SELECT id FROM brews WHERE id = ?').get(Number(brewId))) throw new Error(`No brew #${brewId}`);
  const sc = (v) => { const n = num(v); return n === null ? null : Math.max(1, Math.min(5, Math.round(n))); }; // 1-5 scales
  const rating = num(t.rating) === null ? null : Math.max(1, Math.min(10, Math.round(num(t.rating))));
  const id = db.prepare(`INSERT INTO brew_tastings (brew_id, at, stage, rating, sweetness, body, acidity, heat, aroma, flavour, clarity, carbonation, verdict, change_next, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(Number(brewId), t.at ? Date.parse(t.at) || Date.now() : Date.now(), t.stage || null, rating, sc(t.sweetness), sc(t.body), sc(t.acidity), sc(t.heat),
      t.aroma || null, t.flavour || null, t.clarity || null, t.carbonation || null, t.verdict || null, t.changeNext || null, t.source || 'page').lastInsertRowid;
  return { id, brew: getBrew(brewId) };
}
export const deleteTasting = (id) => db.prepare('DELETE FROM brew_tastings WHERE id = ?').run(Number(id)).changes > 0;

// Find a brew from what Simon said ("the braggot", "mead number 3"); the one on the go if he didn't say
export function findBrew(q = '') {
  const all = listBrews();
  const s = String(q || '').toLowerCase().trim();
  if (!s) return all.find((b) => b.status === 'fermenting') || all.find((b) => b.status === 'conditioning') || all[0] || null;
  const n = /#?(\d+)/.exec(s);
  return all.find((b) => n && b.id === Number(n[1])) || all.find((b) => b.name.toLowerCase().includes(s) || s.includes(b.name.toLowerCase()))
    || all.find((b) => (b.style || '').toLowerCase().includes(s)) || null;
}

// --- insights -------------------------------------------------------------------------------------------------
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
const KNOW = 'You are an experienced mead maker and brewer (BJCP mead judge level) helping a homebrewer in the UK. ' +
  'Ground everything in brewing science: yeast strain character (e.g. EC-1118 clean, dry and crisp with an alcohol edge; 71B softer, metabolises some malic acid, good for fruit; D47 fuller with pear/floral notes but fusel-prone above ~20°C; QA23 bright, fruity; K1-V1116 robust, floral esters), ' +
  'fermentation temperature (warm = more esters and fusel heat; ~15-19°C for most mead yeast), nutrition (staggered TOSNA-style organic nutrients avoid stress and sulphur), honey varietal (aroma and colour carry through; heat-treated honey loses aroma), ' +
  'pH and acidity, tannin, residual sugar and sweetness (FG: dry under 1.010, semi-sweet 1.010-1.025, sweet over 1.025 - perceived sweetness is also cut by acid and tannin), strength (hydromel/standard/sack), ' +
  'for braggot the malt bill and hops, oxidation, ageing (harsh young meads round out over months), stabilising before backsweetening, carbonation. ' +
  'ABV = (OG - FG) x 131.25. British English, metric units. Be specific and practical; say when something is uncertain.';

function brewForPrompt(b) {
  return JSON.stringify({
    name: b.name, style: b.style, status: b.status, batchLitres: b.batchLitres, started: b.startedOn, bottled: b.bottledOn,
    ingredients: b.ingredients, yeast: b.yeast, yeastNotes: b.yeastNotes, nutrients: b.nutrients, water: b.water,
    targetOg: b.targetOg, targetFg: b.targetFg, og: b.og, fg: b.fg, sweetnessAimed: b.sweetness, carbonation: b.carbonation, method: b.method, notes: b.notes, calc: b.calc,
    log: (b.logs || []).map((l) => ({ date: new Date(l.at).toISOString().slice(0, 10), kind: l.kind, gravity: l.gravity, tempC: l.tempC, ph: l.ph, note: l.text })),
    tastings: (b.tastings || []).map((t) => ({ date: new Date(t.at).toISOString().slice(0, 10), stage: t.stage, rating10: t.rating, sweetness5: t.sweetness, body5: t.body, acidity5: t.acidity, alcoholHeat5: t.heat, aroma: t.aroma, flavour: t.flavour, clarity: t.clarity, carbonation: t.carbonation, verdict: t.verdict, changeNext: t.changeNext })),
  });
}

async function askJson(system, prompt) {
  const model = genAI.getGenerativeModel({ model: getModelFor('homebrew') || config.gemini.chatModels.flash, systemInstruction: system });
  const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } });
  return JSON.parse(res.response.text());
}

// The flavour profile it's heading for, how it's going, and what to tweak
export async function brewInsight(id) {
  const b = getBrew(id);
  if (!b) throw new Error(`No brew #${id}`);
  const others = listBrews().filter((x) => x.id !== b.id).slice(0, 8).map((x) => getBrew(x.id));
  const out = await askJson(KNOW + ' Reply with JSON only.',
    `THE BREW:\n${brewForPrompt(b)}\n\nHIS OTHER BREWS (to learn what he likes):\n${others.map(brewForPrompt).join('\n').slice(0, 14000)}\n\n` +
    'Return JSON: {"profile": {"sweetness": 1-5, "body": 1-5, "acidity": 1-5, "alcoholHeat": 1-5, "aromaIntensity": 1-5, "tannin": 1-5, "style": "the BJCP-style description it fits, e.g. semi-sweet standard traditional mead", "expectedAbv": number|null, "expectedFg": number|null, "aroma": "short", "flavour": "short", "finish": "short"}, ' +
    '"progress": "one or two sentences on how the fermentation / ageing is going, from the readings (stalled? on track? when to expect it done? the 1/3 break for the last nutrient dose if still early)", ' +
    '"watchOuts": ["specific risks from this log - temperature, nutrition, oxidation, stuck ferment, fusels..."], ' +
    '"nextSteps": ["what to do next and when"], ' +
    '"tweaks": [{"change": "one specific change for next time", "effect": "what it would do to the flavour profile and numbers", "why": "the reason, tied to his tastings if any"}] (3-5), ' +
    '"whatHeLikes": "from his tastings across brews, what he seems to like - or null if not enough yet"}');
  db.prepare('UPDATE brews SET insight = ?, insight_at = ? WHERE id = ?').run(JSON.stringify(out), Date.now(), b.id);
  return out;
}

// "What if I swapped 71B for D47?" - the change, predicted
export async function whatIf(id, change) {
  const b = getBrew(id);
  if (!b) throw new Error(`No brew #${id}`);
  if (!String(change || '').trim()) throw new Error('Say what you would change.');
  return askJson(KNOW + ' Reply with JSON only.',
    `THE BREW (as made, with how it tasted):\n${brewForPrompt(b)}\n\nTHE CHANGE HE'S CONSIDERING FOR NEXT TIME: ${String(change).slice(0, 600)}\n\n` +
    'Return JSON: {"summary": "one or two sentences: what the change would do overall", "before": {"sweetness": 1-5, "body": 1-5, "acidity": 1-5, "alcoholHeat": 1-5, "aromaIntensity": 1-5, "abv": number|null, "fg": number|null}, ' +
    '"after": {same keys}, "flavour": "how the taste and aroma would change", "process": "anything he would need to do differently (nutrients, temperature, timing, stabilising...)", "risks": "what could go wrong", "confidence": "low|medium|high"}');
}

// What he has logged, for Ims ("how's the mead doing?")
export function brewsForIms({ brew = '' } = {}) {
  const pick = brew ? findBrew(brew) : null;
  const list = pick ? [getBrew(pick.id)] : listBrews().slice(0, 6).map((b) => getBrew(b.id));
  return list.map((b) => ({
    id: b.id, name: b.name, style: b.style, status: b.status, started: b.startedOn, bottled: b.bottledOn, daysIn: b.calc.daysSinceStart,
    og: b.og, latestGravity: b.calc.latestGravity, fg: b.fg, abv: b.calc.abv, thirdBreak: b.calc.thirdBreak, sweetness: b.calc.sweetnessClass,
    lastLog: b.logs.length ? b.logs[b.logs.length - 1] : null, lastTasting: b.tastings.length ? b.tastings[b.tastings.length - 1] : null,
    nextSteps: b.insight?.nextSteps || null,
  }));
}

// "I've just pitched": the staggered (TOSNA) nutrient doses as reminders - 24, 48 and 72 hours after pitching,
// and a check for the 1/3 sugar break (the last dose, no later than day 7)
// Step reminders: the method's timed steps (rack on to the camomile, take it off after 4 days, stabilise, back-sweeten,
// bottle...) as reminders, worked out by Gemini from the method, the log so far and today's date. Set when he pitches
// ("I've just pitched"), and again whenever he asks - planning again cancels this brew's earlier step reminders.
db.exec('CREATE TABLE IF NOT EXISTS brew_step_reminders (brew_id INTEGER NOT NULL, reminder_id INTEGER NOT NULL)');
const londonDate = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(ms)); // YYYY-MM-DD
export async function setStepReminders(id, { justPitched = false, dryRun = false } = {}) { // dryRun: the plan only, nothing set (testing)
  const b = getBrew(id);
  if (!b) throw new Error(`No brew #${id}`);
  if (!String(b.method || '').trim()) throw new Error('This brew has no method steps to remind you about.');
  const { scheduleItem, cancelScheduledItem } = await import('./remindersService.js');
  const today = londonDate(Date.now());
  const out = await askJson(KNOW + ' Reply with JSON only.',
    `THE BREW:\n${brewForPrompt(b)}\n\nToday is ${today} (${new Date().toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'long' })}).${justPitched ? ' He has just pitched the yeast today.' : ''}\n\n` +
    'Turn the METHOD into reminders for the steps still to come, at the day each one falls due - from the method\'s own timings ("leave 4 days", "rack after a week") and, where it doesn\'t say, the usual timing for this kind of brew and its log so far ' +
    '(e.g. primary ferment of a mead ~2-4 weeks; check the gravity is steady over 3 days before racking or stabilising). ' +
    'Skip steps already done (see the log and status) and anything done on brew day itself. Leave out nutrient doses - those have their own reminders. ' +
    'A step that depends on how it\'s going is a check, not an order: "check the gravity - if it\'s steady at about 1.000, rack on to the 8 camomile teabags". ' +
    'Each label starts with the brew name and says exactly what to do, with the amounts from the recipe. At most 8 reminders, in date order. ' +
    'Time of day: 18:30 on weekdays, 10:00 at weekends, unless a step needs another time. ' +
    'Return {"reminders": [{"date": "YYYY-MM-DD", "time": "HH:MM", "label": "..."}]}.');
  const wanted = (out?.reminders || []).filter((r) => r && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.date >= today && String(r.label || '').trim()).slice(0, 8);
  if (!wanted.length) throw new Error('No steps still to come that need a reminder.');
  if (dryRun) return wanted;
  // the brew's earlier step reminders make way for the new plan
  for (const { reminder_id: rid } of db.prepare('SELECT reminder_id FROM brew_step_reminders WHERE brew_id = ?').all(b.id)) {
    try { cancelScheduledItem(rid); } catch (_) { /* already gone off or cancelled */ }
  }
  db.prepare('DELETE FROM brew_step_reminders WHERE brew_id = ?').run(b.id);
  const made = [];
  for (const r of wanted) {
    try {
      const m = scheduleItem({ type: 'reminder', label: String(r.label).trim().slice(0, 300), time: /^\d{2}:\d{2}$/.test(r.time) ? r.time : '18:30', date: r.date, alertMode: 'both' });
      db.prepare('INSERT INTO brew_step_reminders (brew_id, reminder_id) VALUES (?, ?)').run(b.id, m.id);
      made.push({ id: m.id, date: r.date, label: m.label, goesOffAt: m.goesOffAt });
    } catch (err) { console.warn(`[Homebrew] Step reminder not set: ${err.message}`); } // e.g. today's time already gone
  }
  addLog(b.id, { kind: 'note', text: `Step reminders set:\n${made.map((m) => `- ${m.date}: ${m.label}`).join('\n')}` });
  return made;
}

export async function setNutrientReminders(id) {
  const b = getBrew(id);
  if (!b) throw new Error(`No brew #${id}`);
  const { scheduleItem } = await import('./remindersService.js');
  const brk = b.calc.thirdBreak ? ` - last dose once it's down to ${b.calc.thirdBreak.toFixed(3)} (the 1/3 sugar break)` : '';
  const doses = [
    [24, `${b.name}: first nutrient dose (24 h) - degas first, dissolve it in a cup of must`],
    [48, `${b.name}: second nutrient dose (48 h) - degas first`],
    [72, `${b.name}: third nutrient dose (72 h)${brk}`],
    [24 * 6, `${b.name}: check the gravity for the 1/3 sugar break${brk} - add the last nutrient by tomorrow at the latest`],
  ];
  const made = doses.map(([h, label]) => scheduleItem({ type: 'reminder', label, whenSeconds: h * 3600, alertMode: 'both' }));
  addLog(b.id, { kind: 'note', text: 'Pitched - nutrient reminders set for 24, 48 and 72 hours, and a 1/3-break check on day 6.' });
  return made.map((m) => ({ id: m.id, goesOffAt: m.goesOffAt }));
}
