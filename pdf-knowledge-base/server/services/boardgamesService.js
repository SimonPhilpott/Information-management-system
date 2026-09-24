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
  let cache = { fetchedAt: null, games: [], orphanExpansions: [] };
  try {
    if (fs.existsSync(CACHE_PATH)) cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch (_) { /* treat as empty */ }
  const selling = getFlags();
  return {
    fetchedAt: cache.fetchedAt,
    games: cache.games.map((g) => ({
      ...g,
      wantToSell: selling.has(g.id),
      expansions: g.expansions.map((e) => ({ ...e, wantToSell: selling.has(e.id) })),
    })),
    orphanExpansions: cache.orphanExpansions.map((e) => ({ ...e, wantToSell: selling.has(e.id) })),
  };
}
