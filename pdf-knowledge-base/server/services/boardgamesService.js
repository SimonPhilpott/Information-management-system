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

try { db.exec('ALTER TABLE boardgame_flags ADD COLUMN favourite INTEGER NOT NULL DEFAULT 0'); } catch { /* already there */ }

// What each game is like, from BoardGameGeek (thing?stats=1): players, play time, complexity, rating, and its
// categories (the themes - Fantasy, Horror, Wargame...) and mechanics (incl. "Solo / Solitaire Game").
// Also includes community player count recommendations from BGG poll and collection CSV.
db.exec(`
  CREATE TABLE IF NOT EXISTS boardgame_details (
    bgg_id INTEGER PRIMARY KEY,
    min_players INTEGER, max_players INTEGER,
    playing_time INTEGER, min_time INTEGER, max_time INTEGER,
    weight REAL, rating REAL,
    categories TEXT NOT NULL DEFAULT '[]', mechanics TEXT NOT NULL DEFAULT '[]',
    community_min_players INTEGER, community_players TEXT NOT NULL DEFAULT '[]',
    fetched_at INTEGER NOT NULL
  );
`);

try { db.exec('ALTER TABLE boardgame_details ADD COLUMN community_min_players INTEGER'); } catch { }
try { db.exec("ALTER TABLE boardgame_details ADD COLUMN community_players TEXT NOT NULL DEFAULT '[]'"); } catch { }

// Decode numeric and named HTML entities (e.g. &#039;, &#39;, &apos;, &amp;, &quot;, &lt;, &gt;, &eacute;)
export function decodeHtmlEntities(str) {
  if (typeof str !== 'string') return str || '';
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&eacute;/g, 'é')
    .replace(/&Eacute;/g, 'É')
    .replace(/&nbsp;/g, ' ');
}

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
  const val = (primary && typeof primary === 'object') ? (primary['@_value'] ?? primary['#text'] ?? primary) : primary;
  return decodeHtmlEntities(String(val ?? ''));
}

export function parseCollection(xml) {
  const doc = parser.parse(xml);
  const items = doc?.items?.item || [];
  return items.map((it) => ({
    id: Number(it['@_objectid']),
    name: primaryName(it.name),
    year: it.yearpublished ? Number(text(it.yearpublished['@_value'] ?? it.yearpublished)) : null,
    thumbnail: text(it.thumbnail) || null,
  }));
}

// Parse full details for multiple items from a BGG /thing response (thumbnails, images, year)
export function parseThingDetails(xml) {
  const doc = parser.parse(xml);
  const items = doc?.items?.item || [];
  const list = Array.isArray(items) ? items : [items];
  const map = new Map();
  for (const it of list) {
    if (!it) continue;
    const id = Number(it['@_id']);
    if (!id) continue;
    const thumbnail = text(it.thumbnail) || null;
    const image = text(it.image) || null;
    const year = it.yearpublished ? Number(text(it.yearpublished['@_value'] ?? it.yearpublished)) : null;
    map.set(id, { id, thumbnail, image, year });
  }
  return map;
}

// For each base game: every expansion BGG knows of (outbound
// "boardgameexpansion" links; inbound ones are the reverse relationship).
export function parseThingExpansions(xml) {
  const doc = parser.parse(xml);
  const out = {};
  for (const it of doc?.items?.item || []) {
    out[Number(it['@_id'])] = (it.link || [])
      .filter((l) => l['@_type'] === 'boardgameexpansion' && l['@_inbound'] !== 'true')
      .map((l) => ({ id: Number(l['@_id']), name: decodeHtmlEntities(String(l['@_value'] || '')) }));
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

let backfillStatus = { state: 'idle', phase: null, done: 0, total: 0, error: null };
export const getBackfillStatus = () => ({ ...backfillStatus });

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

  const ownedMap = new Map(ownedExpansions.map((e) => [e.id, e]));

  // Collect all unowned expansion IDs to batch-fetch box art & release years
  const unownedExpansionIds = new Set();
  for (const g of baseGames) {
    for (const exp of (expansionsByGame[g.id] || [])) {
      if (!ownedMap.has(exp.id)) {
        unownedExpansionIds.add(exp.id);
      }
    }
  }

  const unownedIdList = Array.from(unownedExpansionIds);
  const unownedDetailsMap = new Map();
  if (unownedIdList.length > 0) {
    status = { ...status, phase: 'Fetching expansion box art', done: 0, total: unownedIdList.length };
    for (let i = 0; i < unownedIdList.length; i += THING_BATCH) {
      const batch = unownedIdList.slice(i, i + THING_BATCH);
      try {
        const batchXml = await fetchXml(`${BGG}/thing?id=${batch.join(',')}`);
        const parsedMap = parseThingDetails(batchXml);
        for (const [id, det] of parsedMap.entries()) {
          unownedDetailsMap.set(id, det);
        }
      } catch (err) {
        console.error(`[Boardgames] Failed to fetch expansion batch ${batch.join(',')}:`, err.message);
      }
      status = { ...status, done: Math.min(i + THING_BATCH, unownedIdList.length) };
      if (i + THING_BATCH < unownedIdList.length) await sleep(REQUEST_GAP_MS);
    }
  }

  const claimed = new Set();
  const games = baseGames.map((g) => {
    const expansions = (expansionsByGame[g.id] || []).map((e) => {
      const ownedItem = ownedMap.get(e.id);
      const unownedItem = unownedDetailsMap.get(e.id);
      const owned = Boolean(ownedItem);
      if (owned) claimed.add(e.id);
      return {
        id: e.id,
        name: e.name,
        year: ownedItem?.year || unownedItem?.year || null,
        thumbnail: ownedItem?.thumbnail || unownedItem?.thumbnail || null,
        owned
      };
    });
    // Owned first, then the rest alphabetically.
    expansions.sort((a, b) => (b.owned - a.owned) || a.name.localeCompare(b.name));
    return { ...g, expansions };
  });
  games.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  // Owned expansions BGG doesn't link from any game in the collection.
  const orphanExpansions = ownedExpansions.filter((e) => !claimed.has(e.id)).map((e) => ({
    id: e.id,
    name: e.name,
    year: e.year || null,
    thumbnail: e.thumbnail || null,
    owned: true
  }));

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

// Backfill box art for all expansions in the current cache that are missing thumbnails
export function startThumbnailBackfill() {
  if (backfillStatus.state === 'running') return { started: false, reason: 'A box art backfill is already running.' };
  if (!getToken()) return { started: false, reason: 'No BGG API token set - add one in the settings panel.' };

  const raw = readCache();
  if (!raw.games || !raw.games.length) return { started: false, reason: 'No cached games found.' };

  const missingIds = [];
  const idToRefs = new Map();

  for (const g of raw.games) {
    for (const exp of (g.expansions || [])) {
      if (exp.id > 0 && !exp.thumbnail) {
        if (!idToRefs.has(exp.id)) {
          idToRefs.set(exp.id, []);
          missingIds.push(exp.id);
        }
        idToRefs.get(exp.id).push(exp);
      }
    }
  }

  for (const exp of (raw.orphanExpansions || [])) {
    if (exp.id > 0 && !exp.thumbnail) {
      if (!idToRefs.has(exp.id)) {
        idToRefs.set(exp.id, []);
        missingIds.push(exp.id);
      }
      idToRefs.get(exp.id).push(exp);
    }
  }

  if (missingIds.length === 0) {
    return { started: false, reason: 'All expansions already have box art.' };
  }

  backfillStatus = { state: 'running', phase: 'Fetching expansion box art', done: 0, total: missingIds.length, error: null };

  (async () => {
    try {
      for (let i = 0; i < missingIds.length; i += THING_BATCH) {
        const batch = missingIds.slice(i, i + THING_BATCH);
        try {
          const xml = await fetchXml(`${BGG}/thing?id=${batch.join(',')}`);
          const detailsMap = parseThingDetails(xml);
          for (const [id, details] of detailsMap.entries()) {
            const refs = idToRefs.get(id);
            if (refs) {
              for (const ref of refs) {
                if (details.thumbnail) ref.thumbnail = details.thumbnail;
                if (details.year && !ref.year) ref.year = details.year;
              }
            }
          }
          fs.writeFileSync(CACHE_PATH, JSON.stringify(raw), 'utf8');
        } catch (err) {
          console.error(`[Boardgames] Backfill batch failed for ${batch.join(',')}:`, err.message);
        }
        backfillStatus.done = Math.min(i + THING_BATCH, missingIds.length);
        if (i + THING_BATCH < missingIds.length) await sleep(REQUEST_GAP_MS);
      }
      fs.writeFileSync(CACHE_PATH, JSON.stringify(raw), 'utf8');
      backfillStatus = { state: 'done', phase: null, done: missingIds.length, total: missingIds.length, error: null };
      console.log(`[Boardgames] Successfully backfilled box art for ${missingIds.length} expansions.`);
    } catch (err) {
      console.error('[Boardgames] Backfill error:', err.message);
      backfillStatus = { state: 'error', phase: null, done: backfillStatus.done, total: missingIds.length, error: err.message };
    }
  })();

  return { started: true, total: missingIds.length };
}

function getFlags() {
  return new Set(db.prepare(`SELECT bgg_id FROM boardgame_flags WHERE want_to_sell = 1`).all().map((r) => r.bgg_id));
}

function getFavourites() {
  return new Set(db.prepare(`SELECT bgg_id FROM boardgame_flags WHERE favourite = 1`).all().map((r) => r.bgg_id));
}

export function setFavourite(id, favourite) {
  db.prepare(
    `INSERT INTO boardgame_flags (bgg_id, want_to_sell, favourite, updated_at) VALUES (?, 0, ?, ?)
     ON CONFLICT(bgg_id) DO UPDATE SET favourite = excluded.favourite, updated_at = excluded.updated_at`
  ).run(id, favourite ? 1 : 0, Date.now());
}

function getDetailsMap() {
  const out = new Map();
  for (const r of db.prepare('SELECT * FROM boardgame_details').all()) {
    let categories = [], mechanics = [], community_players = [];
    try { categories = JSON.parse(r.categories); } catch { }
    try { mechanics = JSON.parse(r.mechanics); } catch { }
    try { community_players = JSON.parse(r.community_players || '[]'); } catch { }
    out.set(r.bgg_id, {
      ...r,
      categories,
      mechanics,
      community_players,
      community_min_players: r.community_min_players ?? (community_players.length ? Math.min(...community_players) : null)
    });
  }
  return out;
}

/**
 * Extracts community recommended player counts from BGG thing?stats=1 <poll name="suggested_numplayers">
 */
export function parseCommunityPlayers(item) {
  const polls = item?.poll || [];
  const list = Array.isArray(polls) ? polls : [polls];
  const p = list.find((x) => x && x['@_name'] === 'suggested_numplayers');
  if (!p || !p.results) return { min: null, rec: [] };
  const results = Array.isArray(p.results) ? p.results : [p.results];
  const rec = [];
  for (const r of results) {
    if (!r) continue;
    const num = r['@_numplayers'];
    const n = parseInt(num, 10);
    if (!Number.isFinite(n) || n <= 0) continue;
    const votes = Array.isArray(r.result) ? r.result : [r.result].filter(Boolean);
    let best = 0, recommended = 0, notRec = 0;
    for (const v of votes) {
      if (!v) continue;
      const val = v['@_value'];
      const count = Number(v['@_numvotes'] || 0);
      if (val === 'Best') best = count;
      else if (val === 'Recommended') recommended = count;
      else if (val === 'Not Recommended') notRec = count;
    }
    if ((best + recommended) > 0 && (best + recommended) >= notRec) {
      rec.push(n);
    }
  }
  return { min: rec.length ? Math.min(...rec) : null, rec };
}

/**
 * Determines whether a game supports solo play.
 * A solo game satisfies ANY of the following four conditions:
 * 1. 1 player only (e.g. min_players === 1 && max_players === 1, or players === '1')
 * 2. 1 marked in the player count as the minimum (e.g. min_players === 1, or player count starts with '1')
 * 3. 1 listed in the community player count minimum (e.g. community poll or CSV bggrecplayers has min 1 or includes 1)
 * 4. Marked as solo (mechanics, categories, tags, or game name contains "solo" or "solitaire")
 */
export function isSoloGame(g = {}, d = null) {
  // 1. 1 player only
  const isOnePlayerOnly =
    (d?.min_players === 1 && d?.max_players === 1) ||
    (g?.minPlayers === 1 && g?.maxPlayers === 1) ||
    String(g?.players || '').trim() === '1' ||
    String(d?.players || '').trim() === '1';

  // 2. Have 1 marked in the player count as the minimum
  const hasOneAsMinPlayer =
    d?.min_players === 1 ||
    g?.minPlayers === 1 ||
    (Number.isFinite(d?.min_players) && d.min_players <= 1) ||
    (Number.isFinite(g?.minPlayers) && g.minPlayers <= 1) ||
    (() => {
      const p = String(g?.players || d?.players || '').trim();
      if (!p) return false;
      const firstNum = parseInt(p.split('-')[0].trim(), 10);
      return firstNum === 1;
    })();

  // 3. With 1 listed in the community player count minimum
  const communityRec = [].concat(d?.community_players || g?.communityPlayers || []);
  const commMin = d?.community_min_players ?? g?.communityMinPlayers ?? (communityRec.length ? Math.min(...communityRec) : null);
  const hasOneAsCommunityMin =
    commMin === 1 ||
    communityRec.includes(1) ||
    (() => {
      const rec = String(g?.bggRecPlayers || d?.bggRecPlayers || '').trim();
      const best = String(g?.bggBestPlayers || d?.bggBestPlayers || '').trim();
      const nums = [...rec.split(','), ...best.split(',')].map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
      return nums.includes(1) || (nums.length > 0 && Math.min(...nums) === 1);
    })();

  // 4. Marked as solo
  const allMechanics = [].concat(d?.mechanics || [], g?.mechanics || []);
  const allCategories = [].concat(d?.categories || [], g?.categories || []);
  const markedAsSolo =
    allMechanics.some((m) => typeof m === 'string' && /solo|solitaire/i.test(m)) ||
    allCategories.some((c) => typeof c === 'string' && /solo|solitaire/i.test(c)) ||
    /\b(solo|solitaire)\b/i.test(g?.name || '') ||
    /\b(solo|solitaire)\b/i.test(d?.name || '');

  return Boolean(isOnePlayerOnly || hasOneAsMinPlayer || hasOneAsCommunityMin || markedAsSolo);
}

function withDetails(g, det) {
  const d = det.get(g.id);
  const minPlayers = d?.min_players || g.minPlayers || null;
  const maxPlayers = d?.max_players || g.maxPlayers || null;
  const players = minPlayers
    ? `${minPlayers}${maxPlayers && maxPlayers !== minPlayers ? `-${maxPlayers}` : ''}`
    : g.players;
  const communityMinPlayers = d?.community_min_players ?? g.communityMinPlayers ?? null;
  const communityPlayers = d?.community_players || g.communityPlayers || [];
  const categories = d?.categories || g.categories || [];
  const mechanics = d?.mechanics || g.mechanics || [];

  const solo = isSoloGame(
    { ...g, players, minPlayers, maxPlayers, communityMinPlayers, communityPlayers, categories, mechanics },
    d
  );

  return {
    ...g,
    players,
    minPlayers,
    maxPlayers,
    communityMinPlayers,
    communityPlayers,
    playingTime: d?.playing_time || g.playingTime || null,
    minTime: d?.min_time || g.minTime || null,
    maxTime: d?.max_time || g.maxTime || null,
    weight: d?.weight || g.weight || null,
    bggRating: d?.rating || g.bggRating || null,
    categories,
    mechanics,
    solo,
  };
}

let detailsStatus = { running: false, done: 0, total: 0, error: null, lastRunAt: 0 };
export const getDetailsStatus = () => ({ ...detailsStatus, missing: missingDetailIds().length });

function missingDetailIds() {
  const have = new Set(db.prepare('SELECT bgg_id FROM boardgame_details').all().map((r) => r.bgg_id));
  const raw = readCache();
  const games = applyEdits(raw).games || [];
  return games.map((g) => g.id).filter((id) => Number.isInteger(id) && id > 0 && !have.has(id));
}

const asNum = (v) => { const n = Number(v?.['@_value'] ?? v); return Number.isFinite(n) && n > 0 ? n : null; };
export async function fetchMissingDetails({ force = false } = {}) {
  if (detailsStatus.running) return getDetailsStatus();
  if (!getToken()) return getDetailsStatus();
  const ids = force ? (applyEdits(readCache()).games || []).map((g) => g.id).filter((id) => id > 0) : missingDetailIds();
  if (!ids.length) return getDetailsStatus();
  detailsStatus = { running: true, done: 0, total: ids.length, error: null, lastRunAt: Date.now() };
  const save = db.prepare(`INSERT INTO boardgame_details (bgg_id, min_players, max_players, playing_time, min_time, max_time, weight, rating, categories, mechanics, community_min_players, community_players, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(bgg_id) DO UPDATE SET min_players = excluded.min_players, max_players = excluded.max_players,
    playing_time = excluded.playing_time, min_time = excluded.min_time, max_time = excluded.max_time, weight = excluded.weight, rating = excluded.rating,
    categories = excluded.categories, mechanics = excluded.mechanics, community_min_players = excluded.community_min_players, community_players = excluded.community_players, fetched_at = excluded.fetched_at`);
  try {
    for (let i = 0; i < ids.length; i += 20) {
      const batch = ids.slice(i, i + 20);
      const doc = parser.parse(await fetchXml(`${BGG}/thing?id=${batch.join(',')}&stats=1`));
      const items = [].concat(doc?.items?.item || []);
      for (const item of items) {
        const links = [].concat(item.link || []);
        const of = (type) => links.filter((l) => l?.['@_type'] === type).map((l) => decodeHtmlEntities(String(l['@_value'] || '')));
        const ratings = item.statistics?.ratings || {};
        const comm = parseCommunityPlayers(item);
        save.run(Number(item['@_id']), asNum(item.minplayers), asNum(item.maxplayers), asNum(item.playingtime), asNum(item.minplaytime), asNum(item.maxplaytime),
          asNum(ratings.averageweight) ? +Number(ratings.averageweight['@_value'] ?? ratings.averageweight).toFixed(2) : null,
          asNum(ratings.average) ? +Number(ratings.average['@_value'] ?? ratings.average).toFixed(2) : null,
          JSON.stringify(of('boardgamecategory')), JSON.stringify(of('boardgamemechanic')),
          comm.min, JSON.stringify(comm.rec), Date.now());
      }
      detailsStatus.done = Math.min(ids.length, i + batch.length);
      await sleep(2500); // be gentle with BGG
    }
  } catch (err) {
    detailsStatus.error = err.message;
    console.warn('[Boardgames] details:', err.message);
  } finally { detailsStatus.running = false; }
  return getDetailsStatus();
}

export function setWantToSell(id, wantToSell) {
  db.prepare(
    `INSERT INTO boardgame_flags (bgg_id, want_to_sell, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(bgg_id) DO UPDATE SET want_to_sell = excluded.want_to_sell, updated_at = excluded.updated_at`
  ).run(id, wantToSell ? 1 : 0, Date.now());
}

export function getLocalUpdates() {
  const raw = readCache();
  const edited = applyEdits(raw);
  const ownershipRows = db.prepare('SELECT expansion_id, owned, updated_at FROM boardgame_expansion_ownership').all();
  const manualEdits = db.prepare("SELECT * FROM boardgame_edits WHERE kind = 'add' ORDER BY created_at DESC").all();

  const allExpansions = edited.games.flatMap((x) => (x.expansions || []).map((e) => ({ ...e, parentName: x.name, parentId: x.id })));
  const allOrphans = edited.orphanExpansions || [];
  const updates = [];

  // 1. Manual base games
  for (const item of manualEdits.filter((x) => x.item_type !== 'expansion')) {
    updates.push({
      id: item.bgg_id || -item.id,
      bggId: item.bgg_id || null,
      name: decodeHtmlEntities(item.name),
      type: 'base_game',
      year: item.year || null,
      thumbnail: null,
      updatedAt: item.created_at,
      bggUrl: item.bgg_id ? `https://boardgamegeek.com/boardgame/${item.bgg_id}` : null
    });
  }

  // 2. Manual expansions
  for (const item of manualEdits.filter((x) => x.item_type === 'expansion')) {
    const parent = edited.games.find((x) => x.id === item.parent_id);
    updates.push({
      id: item.bgg_id || -item.id,
      bggId: item.bgg_id || null,
      name: decodeHtmlEntities(item.name),
      parentName: parent ? decodeHtmlEntities(parent.name) : null,
      parentId: item.parent_id,
      type: 'expansion',
      year: item.year || null,
      thumbnail: null,
      updatedAt: item.created_at,
      bggUrl: item.bgg_id ? `https://boardgamegeek.com/boardgameexpansion/${item.bgg_id}` : null
    });
  }

  // 3. Toggled BGG expansions
  for (const row of ownershipRows) {
    if (row.owned === 1) {
      const exp = allExpansions.find((e) => e.id === row.expansion_id) || allOrphans.find((e) => e.id === row.expansion_id);
      if (exp) {
        updates.push({
          id: exp.id,
          bggId: exp.id > 0 ? exp.id : null,
          name: decodeHtmlEntities(exp.name),
          parentName: exp.parentName ? decodeHtmlEntities(exp.parentName) : null,
          parentId: exp.parentId || null,
          type: 'expansion',
          year: exp.year || null,
          thumbnail: exp.thumbnail || null,
          updatedAt: row.updated_at,
          bggUrl: exp.id > 0 ? `https://boardgamegeek.com/boardgameexpansion/${exp.id}` : null
        });
      }
    }
  }

  // Deduplicate by ID and sort newest first
  const seen = new Set();
  const deduped = [];
  updates.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  for (const u of updates) {
    const key = `${u.type}_${u.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(u);
    }
  }
  return deduped;
}

export function getGames() {
  const raw = readCache();
  const edited = applyEdits(raw);
  const cache = { ...raw, games: edited.games, orphanExpansions: edited.orphanExpansions };
  const selling = getFlags();
  const favourites = getFavourites();
  const det = getDetailsMap();
  return {
    fetchedAt: cache.fetchedAt,
    source: cache.source || 'bgg',
    details: getDetailsStatus(),
    games: cache.games.map((g) => ({
      ...withDetails(g, det),
      favourite: favourites.has(g.id),
      wantToSell: selling.has(g.id),
      expansions: g.expansions.map((e) => ({ ...e, wantToSell: selling.has(e.id) })),
    })),
    orphanExpansions: cache.orphanExpansions.map((e) => ({ ...e, wantToSell: selling.has(e.id) })),
    removed: edited.removed,
    updates: getLocalUpdates(),
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
  const toItem = (r) => {
    const recNums = String(r.bggrecplayers || '').split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
    const bestNums = String(r.bggbestplayers || '').split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
    const commRec = [...new Set([...recNums, ...bestNums])].sort((a, b) => a - b);
    const commMin = commRec.length ? commRec[0] : null;
    return {
      id: Number(r.objectid), name: r.objectname, year: num(r.yearpublished), thumbnail: null,
      players: r.minplayers ? `${r.minplayers}${r.maxplayers && r.maxplayers !== r.minplayers ? `-${r.maxplayers}` : ''}` : null,
      minPlayers: num(r.minplayers), maxPlayers: num(r.maxplayers),
      communityMinPlayers: commMin, communityPlayers: commRec,
      bggRecPlayers: r.bggrecplayers || null, bggBestPlayers: r.bggbestplayers || null,
      playingTime: num(r.playingtime), weight: num(r.avgweight) ? +Number(r.avgweight).toFixed(2) : null,
      bggRating: num(r.average) ? +Number(r.average).toFixed(2) : null, rank: num(r.rank), myRating: num(r.rating),
    };
  };
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

  // Backfill community player counts into boardgame_details from this CSV
  try {
    const updateComm = db.prepare('UPDATE boardgame_details SET community_min_players = ?, community_players = ? WHERE bgg_id = ?');
    for (const item of items) {
      const recNums = String(item.bggrecplayers || '').split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
      const bestNums = String(item.bggbestplayers || '').split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
      const commRec = [...new Set([...recNums, ...bestNums])].sort((a, b) => a - b);
      if (commRec.length > 0) {
        updateComm.run(commRec[0], JSON.stringify(commRec), Number(item.objectid));
      }
    }
  } catch (err) {
    console.warn('[Boardgames] CSV community player count backfill:', err.message);
  }

  return { games: base.length, expansions: items.length - base.length, orphanExpansions: orphanExpansions.length };
}

// First run with no collection yet: load the CSV kept in data/ (saved from the user's BGG export).
const SEED_CSV = path.join(DATA_DIR, 'bgg_collection.csv');
try {
  if (!fs.existsSync(CACHE_PATH) && fs.existsSync(SEED_CSV)) importCollectionCsv(fs.readFileSync(SEED_CSV, 'utf8'));
} catch (err) { console.error('[Boardgames] CSV seed import failed:', err.message); }

// ---- manual changes to the collection ------------------------------------------------------------------
// Games added by hand (before BGG knows, or not on BGG at all) and games removed, kept apart from
// Expansion ownership overrides (for setting owned = true/false on BGG expansions)
db.exec(`CREATE TABLE IF NOT EXISTS boardgame_expansion_ownership (
  expansion_id INTEGER PRIMARY KEY,
  owned INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
)`);

export function setExpansionOwned(expansionId, owned) {
  const id = Number(expansionId);
  if (!id) throw new Error('Invalid expansion ID');
  db.prepare(`
    INSERT INTO boardgame_expansion_ownership (expansion_id, owned, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(expansion_id) DO UPDATE SET owned = excluded.owned, updated_at = excluded.updated_at
  `).run(id, owned ? 1 : 0, Date.now());
  return { expansionId: id, owned: Boolean(owned) };
}

function getExpansionOwnershipMap() {
  const rows = db.prepare(`SELECT expansion_id, owned FROM boardgame_expansion_ownership`).all();
  const map = new Map();
  for (const r of rows) map.set(r.expansion_id, Boolean(r.owned));
  return map;
}

// Search BoardGameGeek for games by query string
export async function searchBgg(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  const url = `${BGG}/search?query=${encodeURIComponent(q)}&type=boardgame`;
  const xml = await fetchXml(url);
  const doc = parser.parse(xml);
  const items = doc?.items?.item || [];
  const list = Array.isArray(items) ? items : [items];
  return list.map((it) => ({
    id: Number(it['@_id']),
    name: primaryName(it.name),
    year: it.yearpublished ? Number(text(it.yearpublished['@_value'] ?? it.yearpublished)) : null,
    type: it['@_type'] || 'boardgame'
  }));
}

// Fetch details for a BGG game ID including thumbnail, full metadata, and all known expansions
export async function getBggDetails(bggId) {
  const id = Number(bggId);
  if (!id) throw new Error('Invalid BGG ID');
  const url = `${BGG}/thing?id=${id}&stats=1`;
  const xml = await fetchXml(url);
  const doc = parser.parse(xml);
  const item = doc?.items?.item?.[0] || doc?.items?.item;
  if (!item) throw new Error('Game not found on BoardGameGeek');

  const name = primaryName(item.name);
  const year = item.yearpublished ? Number(text(item.yearpublished['@_value'] ?? item.yearpublished)) : null;
  const thumbnail = text(item.thumbnail) || null;
  const image = text(item.image) || null;
  const links = item.link || [];
  const list = Array.isArray(links) ? links : [links];

  const expansions = list
    .filter((l) => l && l['@_type'] === 'boardgameexpansion' && l['@_inbound'] !== 'true')
    .map((l) => ({
      id: Number(l['@_id']),
      name: decodeHtmlEntities(String(l['@_value'] || ''))
    }));

  // Fetch box art for these expansions if there are any (up to 40)
  if (expansions.length > 0 && expansions.length <= 40) {
    try {
      const expIds = expansions.map((e) => e.id);
      for (let i = 0; i < expIds.length; i += THING_BATCH) {
        const batch = expIds.slice(i, i + THING_BATCH);
        const expXml = await fetchXml(`${BGG}/thing?id=${batch.join(',')}`);
        const detailsMap = parseThingDetails(expXml);
        for (const exp of expansions) {
          const det = detailsMap.get(exp.id);
          if (det) {
            if (det.thumbnail) exp.thumbnail = det.thumbnail;
            if (det.year && !exp.year) exp.year = det.year;
          }
        }
        if (i + THING_BATCH < expIds.length) await sleep(REQUEST_GAP_MS);
      }
    } catch (_) { /* non-fatal fallback */ }
  }

  return {
    id,
    name,
    year,
    thumbnail,
    image,
    expansions
  };
}

export function addGameWithExpansions({ bggId, name, year, thumbnail, ownedExpansionIds = [] }) {
  const id = bggId ? Number(bggId) : null;
  const gameName = String(name || '').trim();
  if (!gameName && !id) throw new Error('Game name or BGG ID required');

  // Add the base game via addGame or cache insertion
  const baseResult = addGame({
    name: gameName,
    year: year ? Number(year) : null,
    type: 'base',
    bggLink: id ? String(id) : ''
  });

  // For any owned expansions supplied, mark their ownership in DB
  const ownedSet = new Set((ownedExpansionIds || []).map(Number));
  for (const expId of ownedSet) {
    if (expId) setExpansionOwned(expId, true);
  }

  return baseResult;
}

export function addGame({ name, year, type = 'base', parentId = null, bggLink = '' }) {
  const n = decodeHtmlEntities(String(name || '').trim());
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
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      // Clean HTML entities across raw cache games and expansions
      if (raw.games) {
        raw.games = raw.games.map((g) => ({
          ...g,
          name: decodeHtmlEntities(g.name),
          expansions: (g.expansions || []).map((e) => ({ ...e, name: decodeHtmlEntities(e.name) }))
        }));
      }
      if (raw.orphanExpansions) {
        raw.orphanExpansions = raw.orphanExpansions.map((e) => ({ ...e, name: decodeHtmlEntities(e.name) }));
      }
      return raw;
    }
  } catch (_) { /* treat as empty */ }
  return { fetchedAt: null, games: [], orphanExpansions: [] };
}
function manualItems() {
  return db.prepare(`SELECT * FROM boardgame_edits WHERE kind = 'add' ORDER BY created_at`).all().map((r) => ({
    id: r.bgg_id || -r.id, name: decodeHtmlEntities(r.name), year: r.year, thumbnail: null, manual: true, type: r.item_type, parentId: r.parent_id, owned: true,
  }));
}

// The collection as imported, with the manual additions merged in and removals taken out.
function applyEdits(cache) {
  const removed = new Set(db.prepare(`SELECT bgg_id FROM boardgame_edits WHERE kind = 'remove'`).all().map((r) => r.bgg_id));
  const ownershipMap = getExpansionOwnershipMap();

  const games = cache.games.filter((g) => !removed.has(g.id)).map((g) => ({
    ...g,
    name: decodeHtmlEntities(g.name),
    expansions: g.expansions.filter((e) => !removed.has(e.id)).map((e) => ({
      ...e,
      name: decodeHtmlEntities(e.name),
      owned: ownershipMap.has(e.id) ? ownershipMap.get(e.id) : Boolean(e.owned)
    }))
  }));
  const orphanExpansions = cache.orphanExpansions.filter((e) => !removed.has(e.id)).map((e) => ({
    ...e,
    name: decodeHtmlEntities(e.name),
    owned: ownershipMap.has(e.id) ? ownershipMap.get(e.id) : Boolean(e.owned)
  }));
  const manual = manualItems();
  for (const m of manual.filter((x) => x.type !== 'expansion')) games.push({ ...m, expansions: [] });
  for (const m of manual.filter((x) => x.type === 'expansion')) {
    const parent = games.find((g) => g.id === m.parentId);
    if (parent) parent.expansions = [...parent.expansions, m].sort((a, b) => (b.owned - a.owned) || a.name.localeCompare(b.name));
    else orphanExpansions.push(m);
  }
  games.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const all = [...cache.games, ...cache.games.flatMap((g) => g.expansions), ...cache.orphanExpansions];
  const removedList = [...removed].map((id) => all.find((g) => g.id === id)).filter(Boolean).map((g) => ({ id: g.id, name: decodeHtmlEntities(g.name), year: g.year || null }));
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
    favourites: d.games.filter((g) => g.favourite).map((g) => g.name),
    source: d.source === 'csv' ? 'BoardGameGeek collection export' : 'BoardGameGeek',
  };
}

export function describeCollectionForIms({ query = '', players = null, maxMinutes = null, sortBy = null, favourites = false, solo = false, theme = '', limit = 15 } = {}) {
  const d = getGames();
  const summary = collectionSummary();
  const q = String(query || '').trim().toLowerCase();
  const fitsPlayers = (g) => {
    if (!players) return true;
    if (players === 1 && g.solo) return true;
    const [lo, hi] = String(g.players || '').split('-').map(Number);
    return Number.isFinite(lo) && players >= lo && players <= (Number.isFinite(hi) ? hi : lo);
  };
  const th = String(theme || '').trim().toLowerCase();
  let list = d.games.filter((g) => (!q || g.name.toLowerCase().includes(q) || g.expansions.some((e) => e.name.toLowerCase().includes(q)))
    && fitsPlayers(g) && (!maxMinutes || (g.playingTime && g.playingTime <= maxMinutes))
    && (!favourites || g.favourite) && (!solo || g.solo)
    && (!th || (g.categories || []).some((c) => c.toLowerCase().includes(th)) || (g.mechanics || []).some((m) => m.toLowerCase().includes(th))));
  // favourites first, so Ims leads with the games the user loves
  list = [...list].sort((a, b) => Number(Boolean(b.favourite)) - Number(Boolean(a.favourite)));
  if (sortBy === 'rating') list = list.sort((a, b) => (b.bggRating || 0) - (a.bggRating || 0));
  else if (sortBy === 'weight') list = list.sort((a, b) => (b.weight || 0) - (a.weight || 0));
  else if (sortBy === 'expansions') list = list.sort((a, b) => b.expansions.length - a.expansions.length);
  const filtered = Boolean(q || players || maxMinutes || sortBy || favourites || solo || th);
  return {
    ...summary,
    ...(filtered ? {
      matching: list.length,
      games: list.slice(0, limit).map((g) => ({
        name: g.name, year: g.year || null, players: g.players || null, minutes: g.playingTime || null,
        weight: g.weight || null, bggRating: g.bggRating || null, expansionsOwned: g.expansions.filter((e) => e.owned !== false).map((e) => e.name),
        wantToSell: Boolean(g.wantToSell),
        favourite: Boolean(g.favourite), solo: Boolean(g.solo), themes: (g.categories || []).slice(0, 4),
      })),
    } : {}),
  };
}
