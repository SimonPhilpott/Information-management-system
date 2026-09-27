import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';
import db from '../db/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'boardgames_config.json');
const CACHE_PATH = path.join(DATA_DIR, 'boardgames_cache.json');

const BGG = 'https://boardgamegeek.com/xmlapi2';
const REQUEST_GAP_MS = 2500;   // BGG rate-limits hard; be polite between calls
const QUEUED_RETRY_MS = 4000;  // collection requests return 202 while BGG builds them
const THING_BATCH = 20;        // BGG's max ids per thing request

// "Want to sell" is IMS's own flag (BGG's collection has a separate "for
// sale" status that this doesn't touch). Keyed by BGG object id so it
// survives a refresh, and covers expansions too.
db.exec(`
  CREATE TABLE IF NOT EXISTS boardgame_flags (
    bgg_id INTEGER PRIMARY KEY,
    want_to_sell INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
`);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['item', 'link', 'name'].includes(name),
});

const text = (v) => (v && typeof v === 'object' ? v['#text'] : v);

// <name> is an array in thing responses (primary + alternates) and a single
// element in collection responses; the primary one is type="primary" or the
// only one present.
function primaryName(names) {
  if (!names) return '';
  const list = Array.isArray(names) ? names : [names];
  const primary = list.find((n) => n && n['@_type'] === 'primary') || list[0];
  return String(text(primary) ?? '');
}

export function parseCollection(xml) {
  const doc = parser.parse(xml);
  const items = doc?.items?.item || [];
  return items.map((it) => ({
    id: Number(it['@_objectid']),
    name: primaryName(it.name),
    year: it.yearpublished ? Number(text(it.yearpublished)) : null,
    thumbnail: text(it.thumbnail) || null,
  }));
}

// For each base game: every expansion BGG knows of (outbound
// "boardgameexpansion" links; inbound ones are the reverse relationship).
export function parseThingExpansions(xml) {
  const doc = parser.parse(xml);
  const out = {};
  for (const it of doc?.items?.item || []) {
    out[Number(it['@_id'])] = (it.link || [])
      .filter((l) => l['@_type'] === 'boardgameexpansion' && l['@_inbound'] !== 'true')
      .map((l) => ({ id: Number(l['@_id']), name: String(l['@_value']) }));
  }
  return out;
}

export function getConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) return { username: 'Sideburnt', token: '', ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  } catch (_) { /* fall through */ }
  return { username: 'Sideburnt', token: '' };
}

function getToken() {
  return getConfig().token || process.env.BGG_API_TOKEN || '';
}

// The token is a credential, so it's never sent back to the browser.
export function getPublicConfig() {
  const c = getConfig();
  return { username: c.username, hasToken: Boolean(getToken()) };
}

export function saveConfig({ username, token }) {
  const current = getConfig();
  const next = {
    username: typeof username === 'string' && username.trim() ? username.trim() : current.username,
    // Empty/omitted token leaves the stored one alone; send a value to replace it.
    token: typeof token === 'string' && token.trim() ? token.trim() : current.token,
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  return getPublicConfig();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchXml(url) {
  const token = getToken();
  if (!token) throw new Error('No BGG API token set - add one in the settings panel.');
  for (let attempt = 0; attempt < 15; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/xml' } });
    if (res.status === 200) return res.text();
    if (res.status === 202) { await sleep(QUEUED_RETRY_MS); continue; }   // still being generated
    if (res.status === 429) { await sleep(10000); continue; }             // rate limited
    if (res.status === 401 || res.status === 403) throw new Error('BGG rejected the API token (HTTP ' + res.status + ') - check it in settings.');
    throw new Error(`BGG returned HTTP ${res.status}`);
  }
  throw new Error('BGG kept queueing/rate-limiting the request - try again in a few minutes.');
}

let status = { state: 'idle', phase: null, done: 0, total: 0, error: null, startedAt: null, finishedAt: null };
export const getStatus = () => ({ ...status });

async function runRefresh() {
  const { username } = getConfig();
  const u = encodeURIComponent(username);

  status = { ...status, phase: 'Fetching your owned games', done: 0, total: 0 };
  const baseGames = parseCollection(await fetchXml(`${BGG}/collection?username=${u}&own=1&subtype=boardgame&excludesubtype=boardgameexpansion`));
  await sleep(REQUEST_GAP_MS);

  status = { ...status, phase: 'Fetching your owned expansions' };
  const ownedExpansions = parseCollection(await fetchXml(`${BGG}/collection?username=${u}&own=1&subtype=boardgameexpansion`));
  await sleep(REQUEST_GAP_MS);

  const expansionsByGame = {};
  const ids = baseGames.map((g) => g.id);
  status = { ...status, phase: 'Looking up expansions', done: 0, total: ids.length };
  for (let i = 0; i < ids.length; i += THING_BATCH) {
    const batch = ids.slice(i, i + THING_BATCH);
    Object.assign(expansionsByGame, parseThingExpansions(await fetchXml(`${BGG}/thing?id=${batch.join(',')}`)));
    status = { ...status, done: Math.min(i + THING_BATCH, ids.length) };
    if (i + THING_BATCH < ids.length) await sleep(REQUEST_GAP_MS);
  }

  const ownedIds = new Set(ownedExpansions.map((e) => e.id));
  const claimed = new Set();
  const games = baseGames.map((g) => {
    const expansions = (expansionsByGame[g.id] || []).map((e) => {
      const owned = ownedIds.has(e.id);
      if (owned) claimed.add(e.id);
      return { id: e.id, name: e.name, owned };
    });
    // Owned first, then the rest alphabetically.
    expansions.sort((a, b) => (b.owned - a.owned) || a.name.localeCompare(b.name));
    return { ...g, expansions };
  });
  games.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  // Owned expansions BGG doesn't link from any game in the collection.
  const orphanExpansions = ownedExpansions.filter((e) => !claimed.has(e.id));

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify({ fetchedAt: new Date().toISOString(), username, games, orphanExpansions }), 'utf8');
}

export function startRefresh() {
  if (status.state === 'running') return { started: false, reason: 'A refresh is already running.' };
  if (!getToken()) return { started: false, reason: 'No BGG API token set - add one in the settings panel.' };
  status = { state: 'running', phase: 'Starting', done: 0, total: 0, error: null, startedAt: new Date().toISOString(), finishedAt: null };
  runRefresh()
    .then(() => { status = { ...status, state: 'done', phase: null, finishedAt: new Date().toISOString() }; })
    .catch((err) => {
      console.error('[Boardgames] Refresh failed:', err.message);
      status = { ...status, state: 'error', error: err.message, finishedAt: new Date().toISOString() };
    });
  return { started: true };
}

function getFlags() {
  return new Set(db.prepare(`SELECT bgg_id FROM boardgame_flags WHERE want_to_sell = 1`).all().map((r) => r.bgg_id));
}

export function setWantToSell(id, wantToSell) {
  db.prepare(
    `INSERT INTO boardgame_flags (bgg_id, want_to_sell, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(bgg_id) DO UPDATE SET want_to_sell = excluded.want_to_sell, updated_at = excluded.updated_at`
  ).run(id, wantToSell ? 1 : 0, Date.now());
}

export function getGames() {
  const raw = readCache();
  const edited = applyEdits(raw);
  const cache = { ...raw, games: edited.games, orphanExpansions: edited.orphanExpansions };
  const selling = getFlags();
  return {
    fetchedAt: cache.fetchedAt,
    source: cache.source || 'bgg',
    games: cache.games.map((g) => ({
      ...g,
      wantToSell: selling.has(g.id),
      expansions: g.expansions.map((e) => ({ ...e, wantToSell: selling.has(e.id) })),
    })),
    orphanExpansions: cache.orphanExpansions.map((e) => ({ ...e, wantToSell: selling.has(e.id) })),
    removed: edited.removed,
  };
}

// ---- CSV import (BoardGameGeek's "Export collection" CSV) -----------------------------------------------
// Used until the BGG API token arrives, and any time after. Owned items only; an expansion is filed
// under the owned base game whose name it starts with ("Spirit Island: Jagged Earth" under
// "Spirit Island", "The Lord of the Rings: The Card Game – The Black Riders" under the LCG).
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

export function importCollectionCsv(text, { source = 'csv' } = {}) {
  const items = parseCsv(String(text || '').replace(/^\uFEFF/, '')).filter((r) => r.objectid && (r.own === undefined || r.own === '1'));
  if (!items.length) throw new Error('No owned games found - is this the CSV from BoardGameGeek\'s "Export collection"?');
  const num = (v) => (v === '' || v === undefined || Number(v) === 0 ? null : Number(v));
  const toItem = (r) => ({
    id: Number(r.objectid), name: r.objectname, year: num(r.yearpublished), thumbnail: null,
    players: r.minplayers ? `${r.minplayers}${r.maxplayers && r.maxplayers !== r.minplayers ? `-${r.maxplayers}` : ''}` : null,
    playingTime: num(r.playingtime), weight: num(r.avgweight) ? +Number(r.avgweight).toFixed(2) : null,
    bggRating: num(r.average) ? +Number(r.average).toFixed(2) : null, rank: num(r.rank), myRating: num(r.rating),
  });
  const isExp = (r) => (r.itemtype || '').toLowerCase() === 'expansion';
  const base = items.filter((r) => !isExp(r)).map((r) => ({ ...toItem(r), expansions: [] }));
  const orphanExpansions = [];
  const byLongest = [...base].sort((a, b) => b.name.length - a.name.length);
  for (const r of items.filter(isExp)) {
    const e = { ...toItem(r), owned: true };
    const parent = byLongest.find((g) => e.name.startsWith(g.name) && /^\s*[:–—-]/.test(e.name.slice(g.name.length)));
    if (parent) parent.expansions.push(e); else orphanExpansions.push(e);
  }
  for (const g of base) g.expansions.sort((a, b) => a.name.localeCompare(b.name));
  base.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify({ fetchedAt: new Date().toISOString(), username: getConfig().username, source, games: base, orphanExpansions }), 'utf8');
  return { games: base.length, expansions: items.length - base.length, orphanExpansions: orphanExpansions.length };
}

// First run with no collection yet: load the CSV kept in data/ (saved from the user's BGG export).
const SEED_CSV = path.join(DATA_DIR, 'bgg_collection.csv');
try {
  if (!fs.existsSync(CACHE_PATH) && fs.existsSync(SEED_CSV)) importCollectionCsv(fs.readFileSync(SEED_CSV, 'utf8'));
} catch (err) { console.error('[Boardgames] CSV seed import failed:', err.message); }

// ---- manual changes to the collection ------------------------------------------------------------------
// Games added by hand (before BGG knows, or not on BGG at all) and games removed, kept apart from
// the CSV/BGG data so a fresh import or refresh never undoes them. A hand-added game without a BGG
// id gets a negative id, so it still works with "want to sell" and the rest.
db.exec(`CREATE TABLE IF NOT EXISTS boardgame_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, bgg_id INTEGER, name TEXT, year INTEGER,
  item_type TEXT, parent_id INTEGER, created_at INTEGER NOT NULL
)`);

export function addGame({ name, year, type = 'base', parentId = null, bggLink = '' }) {
  const n = String(name || '').trim();
  if (!n) throw new Error('Give the game a name.');
  const m = String(bggLink || '').match(/boardgame(?:expansion)?\/(\d+)/i) || String(bggLink || '').trim().match(/^(\d+)$/);
  const bggId = m ? Number(m[1]) : null;
  const isExp = type === 'expansion';
  if (isExp && !parentId) throw new Error('Choose which game the expansion is for.');
  const cache = readCache();
  const all = [...cache.games, ...cache.games.flatMap((g) => g.expansions), ...cache.orphanExpansions, ...manualItems()];
  if (bggId && all.some((g) => g.id === bggId)) throw new Error('That game is already in your collection.');
  const info = db.prepare('INSERT INTO boardgame_edits (kind, bgg_id, name, year, item_type, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('add', bggId, n.slice(0, 200), year ? Number(year) || null : null, isExp ? 'expansion' : 'base', isExp ? Number(parentId) : null, Date.now());
  // Adding back a game that was removed simply restores it.
  if (bggId) db.prepare(`DELETE FROM boardgame_edits WHERE kind = 'remove' AND bgg_id = ?`).run(bggId);
  return { id: bggId || -info.lastInsertRowid, name: n };
}

export function removeGame(id) {
  const n = Number(id);
  if (n < 0) return db.prepare(`DELETE FROM boardgame_edits WHERE id = ? AND kind = 'add'`).run(-n).changes > 0;
  const manual = db.prepare(`SELECT id FROM boardgame_edits WHERE kind = 'add' AND bgg_id = ?`).get(n);
  if (manual) return db.prepare('DELETE FROM boardgame_edits WHERE id = ?').run(manual.id).changes > 0;
  db.prepare(`INSERT INTO boardgame_edits (kind, bgg_id, created_at) VALUES ('remove', ?, ?)`).run(n, Date.now());
  return true;
}
export function restoreGame(id) {
  return db.prepare(`DELETE FROM boardgame_edits WHERE kind = 'remove' AND bgg_id = ?`).run(Number(id)).changes > 0;
}

function readCache() {
  try { if (fs.existsSync(CACHE_PATH)) return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch (_) { /* treat as empty */ }
  return { fetchedAt: null, games: [], orphanExpansions: [] };
}
function manualItems() {
  return db.prepare(`SELECT * FROM boardgame_edits WHERE kind = 'add' ORDER BY created_at`).all().map((r) => ({
    id: r.bgg_id || -r.id, name: r.name, year: r.year, thumbnail: null, manual: true, type: r.item_type, parentId: r.parent_id, owned: true,
  }));
}

// The collection as imported, with the manual additions merged in and removals taken out.
function applyEdits(cache) {
  const removed = new Set(db.prepare(`SELECT bgg_id FROM boardgame_edits WHERE kind = 'remove'`).all().map((r) => r.bgg_id));
  const games = cache.games.filter((g) => !removed.has(g.id)).map((g) => ({ ...g, expansions: g.expansions.filter((e) => !removed.has(e.id)) }));
  const orphanExpansions = cache.orphanExpansions.filter((e) => !removed.has(e.id));
  const manual = manualItems();
  for (const m of manual.filter((x) => x.type !== 'expansion')) games.push({ ...m, expansions: [] });
  for (const m of manual.filter((x) => x.type === 'expansion')) {
    const parent = games.find((g) => g.id === m.parentId);
    if (parent) parent.expansions = [...parent.expansions, m].sort((a, b) => (b.owned - a.owned) || a.name.localeCompare(b.name));
    else orphanExpansions.push(m);
  }
  games.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const all = [...cache.games, ...cache.games.flatMap((g) => g.expansions), ...cache.orphanExpansions];
  const removedList = [...removed].map((id) => all.find((g) => g.id === id)).filter(Boolean).map((g) => ({ id: g.id, name: g.name, year: g.year || null }));
  return { games, orphanExpansions, removed: removedList };
}

// ---- for Ims ----------------------------------------------------------------------------------------------
// Counts, plus a filtered list when asked ("two-player games under an hour", "anything by name").
export function collectionSummary() {
  const d = getGames();
  const exps = d.games.flatMap((g) => g.expansions).filter((e) => e.owned !== false);
  return {
    baseGames: d.games.length,
    expansions: exps.length + d.orphanExpansions.length,
    gamesWithExpansions: d.games.filter((g) => g.expansions.some((e) => e.owned !== false)).length,
    wantToSell: d.games.filter((g) => g.wantToSell).length + exps.filter((e) => e.wantToSell).length + d.orphanExpansions.filter((e) => e.wantToSell).length,
    source: d.source === 'csv' ? 'BoardGameGeek collection export' : 'BoardGameGeek',
  };
}

export function describeCollectionForIms({ query = '', players = null, maxMinutes = null, sortBy = null, limit = 15 } = {}) {
  const d = getGames();
  const summary = collectionSummary();
  const q = String(query || '').trim().toLowerCase();
  const fitsPlayers = (g) => {
    if (!players) return true;
    const [lo, hi] = String(g.players || '').split('-').map(Number);
    return Number.isFinite(lo) && players >= lo && players <= (Number.isFinite(hi) ? hi : lo);
  };
  let list = d.games.filter((g) => (!q || g.name.toLowerCase().includes(q) || g.expansions.some((e) => e.name.toLowerCase().includes(q)))
    && fitsPlayers(g) && (!maxMinutes || (g.playingTime && g.playingTime <= maxMinutes)));
  if (sortBy === 'rating') list = list.sort((a, b) => (b.bggRating || 0) - (a.bggRating || 0));
  else if (sortBy === 'weight') list = list.sort((a, b) => (b.weight || 0) - (a.weight || 0));
  else if (sortBy === 'expansions') list = list.sort((a, b) => b.expansions.length - a.expansions.length);
  const filtered = Boolean(q || players || maxMinutes || sortBy);
  return {
    ...summary,
    ...(filtered ? {
      matching: list.length,
      games: list.slice(0, limit).map((g) => ({
        name: g.name, year: g.year || null, players: g.players || null, minutes: g.playingTime || null,
        weight: g.weight || null, bggRating: g.bggRating || null, expansionsOwned: g.expansions.filter((e) => e.owned !== false).map((e) => e.name),
        wantToSell: Boolean(g.wantToSell),
      })),
    } : {}),
  };
}
