import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import db, { getSetting, setSetting } from '../db/database.js';
import config from '../config.js';
import { getGames as getCollection } from './boardgamesService.js';
import * as ringsdb from './decks/ringsdb.js';
import * as arkhamdb from './decks/arkhamdb.js';
import { describeScenarioCards } from './decks/hallofbeorn.js';

// Deck builder for the deck-construction games in the board game collection (LCGs and the like).
// Decks live in IMS; each game has an adapter for its own card database and deck site (RingsDB for
// The Lord of the Rings LCG), used to load the cards, import decks and pull updates. New games and
// sites are added to GAMES below.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'decks');
const CARD_MAX_AGE_MS = 7 * 86400000;

export const GAMES = {
  lotr: {
    key: 'lotr', name: 'The Lord of the Rings: The Card Game', short: 'LOTR LCG', bggIds: [77423],
    site: ringsdb.siteInfo, adapter: ringsdb,
    // BGG product name -> RingsDB pack name, where they differ
    packAliases: { 'the lord of the rings: the card game': 'Core Set' },
    rules: { heroesMin: 1, heroesMax: 3, deckMin: 50, handSize: 6 },
  },
  // Arkham: a deck's one investigator sits where LOTR keeps heroes, and a card's class where it keeps sphere.
  ahlcg: {
    key: 'ahlcg', name: 'Arkham Horror: The Card Game', short: 'AH LCG', bggIds: [205637],
    site: arkhamdb.siteInfo, adapter: arkhamdb, packAliases: {},
    rules: { heroesMin: 1, heroesMax: 1, deckMin: 30, handSize: 5 }, arkham: true,
  },
};
const game = (key) => { const g = GAMES[key]; if (!g) throw new Error(`No deck builder for "${key}".`); return g; };

db.exec(`CREATE TABLE IF NOT EXISTS decks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, game TEXT NOT NULL, name TEXT NOT NULL,
  heroes TEXT NOT NULL DEFAULT '{}', slots TEXT NOT NULL DEFAULT '{}', sideslots TEXT NOT NULL DEFAULT '{}',
  notes TEXT, source TEXT, source_id TEXT, source_url TEXT, source_updated TEXT,
  insights TEXT, insights_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, synced_at INTEGER
)`);

// ---- people: the owner (ADMIN_EMAIL) and anyone they've invited to the deck builder ------------------
// Guests sign in with Google (name and email only), see every deck, and manage their own.
// googlemail.com is the same Gmail account as gmail.com (Google still reports older UK accounts that way).
export const canonEmail = (e) => String(e || '').trim().toLowerCase().replace(/@googlemail\.com$/, '@gmail.com');
export const OWNER = canonEmail(String(config.adminEmail || '').split(',')[0]);
db.exec(`CREATE TABLE IF NOT EXISTS deck_people (
  email TEXT PRIMARY KEY, name TEXT, picture TEXT, role TEXT NOT NULL DEFAULT 'guest',
  invited_at INTEGER, revoked_at INTEGER, last_signin_at INTEGER
)`);
try { db.exec('ALTER TABLE decks ADD COLUMN owner TEXT'); } catch (_) { /* already there */ }
if (OWNER) db.prepare('UPDATE decks SET owner = ? WHERE owner IS NULL').run(OWNER);

const lc = canonEmail;
export function isInvited(email) {
  const r = db.prepare('SELECT revoked_at FROM deck_people WHERE email = ? AND role = ?').get(lc(email), 'guest');
  return Boolean(r && !r.revoked_at);
}
export function rememberPerson({ email, name, picture }, role = null) {
  const e = lc(email);
  if (!e) return;
  db.prepare(`INSERT INTO deck_people (email, name, picture, role, last_signin_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET name = CASE WHEN email = '${OWNER}' AND name IS NOT NULL THEN name ELSE COALESCE(excluded.name, name) END, picture = COALESCE(excluded.picture, picture), last_signin_at = excluded.last_signin_at`)
    .run(e, name || null, picture || null, role || (e === OWNER ? 'owner' : 'guest'), Date.now());
}
export function listInvites() {
  return db.prepare(`SELECT email, name, invited_at, revoked_at, last_signin_at FROM deck_people WHERE role = 'guest' AND invited_at IS NOT NULL ORDER BY invited_at DESC`).all()
    .map((r) => ({ email: r.email, name: r.name, invitedAt: r.invited_at, revokedAt: r.revoked_at, lastSignInAt: r.last_signin_at, decks: db.prepare('SELECT COUNT(*) c FROM decks WHERE owner = ?').get(r.email).c }));
}
export function invite(email) {
  const e = lc(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('That isn\'t an email address.');
  if (e === OWNER) throw new Error('That\'s your own account.');
  db.prepare(`INSERT INTO deck_people (email, role, invited_at) VALUES (?, 'guest', ?)
    ON CONFLICT(email) DO UPDATE SET role = 'guest', invited_at = excluded.invited_at, revoked_at = NULL`).run(e, Date.now());
  return listInvites().find((x) => x.email === e);
}
export function revokeInvite(email) {
  return db.prepare(`UPDATE deck_people SET revoked_at = ? WHERE email = ? AND role = 'guest'`).run(Date.now(), lc(email)).changes > 0;
}
// Every non-owner sign-in attempt and its outcome, shown in the owner's Invites panel, so a guest
// who can't get in can be sorted out (wrong Google account, not invited, a Google error...).
db.exec(`CREATE TABLE IF NOT EXISTS signin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, email TEXT, outcome TEXT NOT NULL, detail TEXT)`);
export function logSignIn(email, outcome, detail = null) {
  try { db.prepare('INSERT INTO signin_log (at, email, outcome, detail) VALUES (?, ?, ?, ?)').run(Date.now(), email ? lc(email) : null, outcome, detail ? String(detail).slice(0, 300) : null); } catch (_) { /* never block a sign-in */ }
}
export const recentSignIns = () => db.prepare('SELECT at, email, outcome, detail FROM signin_log ORDER BY at DESC LIMIT 15').all();

export function personName(email) {
  const e = lc(email);
  const r = db.prepare('SELECT name FROM deck_people WHERE email = ?').get(e);
  return r?.name || (e ? e.split('@')[0] : 'Unknown');
}

// ---- cards ------------------------------------------------------------------------------------------
const memo = {};
export async function getCardData(key, { refresh = false } = {}) {
  const g = game(key);
  const file = path.join(DATA_DIR, `${key}_cards.json`);
  if (!refresh && memo[key] && Date.now() - memo[key].fetchedAt < CARD_MAX_AGE_MS) return memo[key];
  let cached = null;
  try { cached = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { /* none yet */ }
  if (cached && !refresh && Date.now() - cached.fetchedAt < CARD_MAX_AGE_MS) return (memo[key] = index(cached));
  try {
    const fresh = { ...(await g.adapter.fetchCardData()), fetchedAt: Date.now() };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(fresh));
    return (memo[key] = index(fresh));
  } catch (err) {
    if (cached) return (memo[key] = index(cached)); // stale is better than nothing
    throw err;
  }
}
function index(data) {
  return { ...data, byCode: Object.fromEntries(data.cards.map((c) => [c.code, c])), byName: data.cards.reduce((m, c) => ((m[c.name.toLowerCase()] ||= []).push(c), m), {}) };
}

// ---- which packs are owned: from the board game collection, overridable on the page ---------------
const norm = (s) => String(s || '').toLowerCase().replace(/^the lord of the rings: the card game\s*[–-]\s*/, '').replace(/^the hobbit:\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim();
// Each person has their own pack list. The owner's starts from the board game collection; a guest's
// starts empty (the cards in their own decks still count as theirs).
const packsKey = (key, owner) => (lc(owner || OWNER) === OWNER ? `decks_${key}_owned_packs` : `decks_${key}_owned_packs:${lc(owner)}`);
export async function getOwnedPacks(key, owner = OWNER) {
  const saved = getSetting(packsKey(key, owner));
  if (saved) return { packs: JSON.parse(saved), from: 'edited' };
  if (lc(owner || OWNER) !== OWNER) return { packs: {}, from: 'none' };
  return { packs: await ownedFromCollection(key), from: 'collection' };
}
async function ownedFromCollection(key) {
  const g = game(key);
  const { packs } = await getCardData(key);
  const coll = getCollection();
  const base = coll.games.find((x) => g.bggIds.includes(x.id));
  if (!base) return {};
  const names = [base.name, ...base.expansions.filter((e) => e.owned).map((e) => e.name)];
  const out = {};
  for (const n of names) {
    const alias = g.packAliases[n.toLowerCase()];
    const p = packs.find((pk) => (alias ? pk.name === alias : norm(pk.name) === norm(n)));
    if (p) out[p.code] = 1;
  }
  return out;
}
export function setOwnedPacks(key, packs, owner = OWNER) {
  game(key);
  const clean = {};
  for (const [code, n] of Object.entries(packs || {})) if (Number(n) > 0) clean[code] = Math.min(9, Math.round(Number(n)));
  setSetting(packsKey(key, owner), JSON.stringify(clean));
  return clean;
}
export function resetOwnedPacks(key, owner = OWNER) { setSetting(packsKey(key, owner), ''); }
const ownedQty = (card, owned) => card.packs.reduce((n, p) => n + (owned[p.code] || 0) * (p.qty || 0), 0);
// Every card in any of the owner's decks is theirs, whether or not it's in a pack they've listed -
// the pack list is only a guide to what else they have. Code -> most copies used in one deck.
export function deckCardCodes(key, owner = OWNER) {
  const out = {};
  for (const d of listDecks(key).filter((x) => lc(x.owner) === lc(owner))) for (const [code, n] of Object.entries({ ...d.slots, ...d.heroes })) out[code] = Math.max(out[code] || 0, n);
  return out;
}
const haveQty = (card, owned, inDecks) => Math.max(ownedQty(card, owned), inDecks[card.code] || 0);

// ---- decks --------------------------------------------------------------------------------------------
const parse = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
const row = (r) => r && ({
  id: r.id, game: r.game, owner: r.owner, ownerName: personName(r.owner), name: r.name, heroes: parse(r.heroes), slots: parse(r.slots), sideslots: parse(r.sideslots), notes: r.notes,
  source: r.source, sourceId: r.source_id, sourceUrl: r.source_url, sourceUpdated: r.source_updated,
  insights: r.insights ? parse(r.insights) : null, insightsAt: r.insights_at, insightsError: r.insights_error ? parse(r.insights_error) : null, createdAt: r.created_at, updatedAt: r.updated_at, syncedAt: r.synced_at,
});
const cleanSlots = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [String(k), Math.max(0, Math.round(Number(v)))]).filter(([, v]) => v > 0));

export function listDecks(key) {
  const rows = key ? db.prepare('SELECT * FROM decks WHERE game = ? ORDER BY updated_at DESC').all(key) : db.prepare('SELECT * FROM decks ORDER BY game, updated_at DESC').all();
  return rows.map(row);
}
export const getDeck = (id) => row(db.prepare('SELECT * FROM decks WHERE id = ?').get(Number(id)));

export function createDeck(key, { name, heroes, slots, sideslots, notes, source = 'ims', sourceId = null, sourceUrl = null, sourceUpdated = null, owner = OWNER }) {
  game(key);
  const now = Date.now();
  const info = db.prepare(`INSERT INTO decks (game, owner, name, heroes, slots, sideslots, notes, source, source_id, source_url, source_updated, created_at, updated_at, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(key, lc(owner), String(name || 'New deck').slice(0, 120), JSON.stringify(cleanSlots(heroes)), JSON.stringify(cleanSlots(slots)),
    JSON.stringify(cleanSlots(sideslots)), notes || null, source, sourceId, sourceUrl, sourceUpdated, now, now, source === 'ims' ? null : now);
  return getDeck(info.lastInsertRowid);
}

export function updateDeck(id, { name, heroes, slots, sideslots, notes }) {
  const d = getDeck(id);
  if (!d) throw new Error('Deck not found.');
  db.prepare('UPDATE decks SET name = ?, heroes = ?, slots = ?, sideslots = ?, notes = ?, updated_at = ? WHERE id = ?').run(
    name !== undefined ? String(name).slice(0, 120) || d.name : d.name,
    JSON.stringify(heroes !== undefined ? cleanSlots(heroes) : d.heroes), JSON.stringify(slots !== undefined ? cleanSlots(slots) : d.slots),
    JSON.stringify(sideslots !== undefined ? cleanSlots(sideslots) : d.sideslots), notes !== undefined ? notes : d.notes, Date.now(), d.id);
  return getDeck(id);
}
export const deleteDeck = (id) => db.prepare('DELETE FROM decks WHERE id = ?').run(Number(id)).changes > 0;
export function duplicateDeck(id, owner = OWNER) {
  const d = getDeck(id);
  if (!d) throw new Error('Deck not found.');
  const mine = lc(d.owner) === lc(owner);
  return createDeck(d.game, { name: mine ? `${d.name} (copy)` : `${d.name} (from ${d.ownerName})`, heroes: d.heroes, slots: d.slots, sideslots: d.sideslots, notes: d.notes, owner });
}

// Import or re-pull from the game's deck site.
export async function importDeck(key, link, owner = OWNER) {
  const g = game(key);
  const ref = g.adapter.parseDeckRef(link);
  const existing = db.prepare('SELECT id FROM decks WHERE game = ? AND source = ? AND source_id = ? AND owner = ?').get(key, g.site.name, ref.id, lc(owner));
  if (existing) throw new Error(`That deck is already here (deck #${existing.id}) - use "Pull from ${g.site.name}" on it to update it.`);
  const d = await g.adapter.fetchDeck(ref);
  return createDeck(key, { name: d.name, heroes: d.heroes, slots: d.slots, sideslots: d.sideslots, notes: d.description, source: g.site.name, sourceId: d.id, sourceUrl: d.url, sourceUpdated: d.updatedAt, owner });
}
export async function syncDeck(id, { force = false } = {}) {
  const deck = getDeck(id);
  if (!deck?.sourceId) throw new Error('This deck isn\'t linked to a deck site.');
  const g = game(deck.game);
  if (!force && deck.syncedAt && deck.updatedAt > deck.syncedAt + 1000) {
    const e = new Error(`This deck has changes made in IMS since it was last pulled from ${g.site.name} - pulling would overwrite them.`);
    e.code = 'LOCAL_CHANGES'; throw e;
  }
  const d = await g.adapter.fetchDeck({ kind: deck.sourceUrl?.includes('/decklist/') ? 'decklist' : 'deck', id: deck.sourceId });
  const now = Date.now();
  db.prepare('UPDATE decks SET name = ?, heroes = ?, slots = ?, sideslots = ?, source_updated = ?, updated_at = ?, synced_at = ? WHERE id = ?')
    .run(d.name, JSON.stringify(d.heroes), JSON.stringify(d.slots), JSON.stringify(d.sideslots || {}), d.updatedAt, now, now, deck.id);
  return getDeck(id);
}

// ---- analysis ---------------------------------------------------------------------------------------
const SPHERES = ['leadership', 'tactics', 'spirit', 'lore', 'neutral', 'baggins', 'fellowship'];
const costNum = (c) => (c.cost === null || c.cost === undefined || c.cost === '' ? null : c.cost === 'X' ? 0 : Number(c.cost));

export async function analyseDeck(deck) {
  const g = game(deck.game);
  const data = await getCardData(deck.game);
  const { packs: owned } = await getOwnedPacks(deck.game, deck.owner);
  const heroes = Object.entries(deck.heroes).map(([code, qty]) => ({ ...(data.byCode[code] || { code, name: `Unknown card ${code}`, type: 'hero', packs: [] }), qty }));
  const cards = Object.entries(deck.slots).map(([code, qty]) => ({ ...(data.byCode[code] || { code, name: `Unknown card ${code}`, type: 'unknown', packs: [] }), qty }))
    .sort((a, b) => (a.type || '').localeCompare(b.type || '') || (costNum(a) ?? 99) - (costNum(b) ?? 99) || a.name.localeCompare(b.name));
  // owned: what the listed packs give; notInSets: owned anyway (it's in the deck), just not from a listed pack
  for (const c of [...heroes, ...cards]) { c.inSets = ownedQty(c, owned); c.owned = Math.max(c.inSets, c.qty); c.notInSets = c.inSets < c.qty; }

  const total = cards.reduce((n, c) => n + c.qty, 0);
  const byType = {}, bySphere = {}, curve = [0, 0, 0, 0, 0, 0], traits = {};
  let costSum = 0, costed = 0;
  for (const c of cards) {
    byType[c.typeName || c.type] = (byType[c.typeName || c.type] || 0) + c.qty;
    bySphere[c.sphere || 'neutral'] = (bySphere[c.sphere || 'neutral'] || 0) + c.qty;
    const k = costNum(c);
    if (k !== null) { curve[Math.min(5, k)] += c.qty; costSum += k * c.qty; costed += c.qty; }
    for (const t of (c.traits || '').split('.').map((s) => s.trim()).filter(Boolean)) traits[t] = (traits[t] || 0) + c.qty;
  }
  const heroSpheres = [...new Set(heroes.map((h) => h.sphere))];
  const problems = [], warnings = [];
  const heroCount = heroes.reduce((n, h) => n + h.qty, 0);
  const who = g.arkham ? 'investigator' : 'hero';
  // an Arkham investigator says how big their deck is (and gives their own signature cards and weakness)
  const deckMin = g.arkham ? (Number(heroes[0]?.deckRequirements?.size) || g.rules.deckMin) : g.rules.deckMin;
  if (heroCount < g.rules.heroesMin) problems.push(`No ${who} yet.`);
  if (heroCount > g.rules.heroesMax) problems.push(`${heroCount} ${who}s - the limit is ${g.rules.heroesMax}.`);
  if (g.arkham) {
    const counted = cards.filter((c) => !['weakness', 'basicweakness'].includes(c.type) && !c.restrictions && c.sphere !== 'mythos').reduce((n, c) => n + c.qty, 0);
    if (counted < deckMin) warnings.push(`${counted} cards count towards deck size - ${heroes[0]?.name || 'the investigator'} needs ${deckMin} (plus their signature cards and weaknesses).`);
  } else if (total < deckMin) problems.push(`${total} cards - a deck needs at least ${deckMin}.`);
  const names = {};
  for (const c of [...heroes, ...cards]) names[`${c.name}|${c.xp ?? ''}`] = (names[`${c.name}|${c.xp ?? ''}`] || 0) + c.qty;
  const limit = (c) => c.deckLimit ?? (g.arkham ? 2 : 3);
  for (const c of cards) if (names[`${c.name}|${c.xp ?? ''}`] > limit(c)) problems.push(`${names[`${c.name}|${c.xp ?? ''}`]} copies of ${c.name} - the limit is ${limit(c)}.`);
  const heroNames = heroes.map((h) => h.name);
  if (!g.arkham) {
    if (new Set(heroNames).size !== heroNames.length) problems.push('Two heroes share a name - unique characters can only appear once.');
    for (const c of cards) if (c.unique && heroNames.includes(c.name)) warnings.push(`${c.name} is also one of your heroes, so the ally can't be played while that hero is in play.`);
    const offSphere = cards.filter((c) => c.sphere && !['neutral', 'baggins', 'fellowship'].includes(c.sphere) && !heroSpheres.includes(c.sphere));
    if (offSphere.length) warnings.push(`${offSphere.reduce((n, c) => n + c.qty, 0)} cards need a sphere none of your heroes have (${[...new Set(offSphere.map((c) => c.sphereName))].join(', ')}): ${offSphere.map((c) => c.name).join(', ')}.`);
  }
  // Not an issue - just a note that these came from packs not in the owner's list.
  const outside = [...heroes, ...cards].filter((c) => c.notInSets);
  const notes = outside.length ? [`${outside.length} card${outside.length === 1 ? ' is' : 's are'} from packs not in your listed sets: ${outside.map((c) => c.name).join(', ')}.`] : [];

  return {
    game: g.key, heroes, cards, total, heroCount,
    startingThreat: heroes.reduce((n, h) => n + (Number(h.threat) || 0) * h.qty, 0),
    byType, bySphere, curve, averageCost: costed ? +(costSum / costed).toFixed(2) : 0,
    traits: Object.entries(traits).sort((a, b) => b[1] - a[1]).slice(0, 12),
    heroSpheres, valid: problems.length === 0, problems, warnings,
    notes,
  };
}

// ---- testing: exact draw odds and a goldfish simulation -------------------------------------------------
const lnC = (() => { const f = [0]; for (let i = 1; i <= 400; i++) f[i] = f[i - 1] + Math.log(i); return (n, k) => (k < 0 || k > n ? -Infinity : f[n] - f[k] - f[n - k]); })();
const pAtLeastOne = (N, k, n) => (k <= 0 ? 0 : n >= N ? 1 : 1 - Math.exp(lnC(N - k, n) - lnC(N, n)));

export async function testDeck(deck, { games = 2000, rounds = 6 } = {}) {
  if (game(deck.game).arkham) throw new Error('Test hands are for Lord of the Rings decks for now - Arkham testing is coming.');
  const a = await analyseDeck(deck);
  const N = a.total;
  if (N < 10 || !a.heroes.length) throw new Error('Add heroes and at least 10 cards to test the deck.');
  const hand = GAMES[deck.game].rules.handSize;
  // Exact odds of seeing each card: opening hand, then one more card each round (round 1 draws too).
  const odds = a.cards.map((c) => ({
    name: c.name, qty: c.qty, type: c.typeName,
    opening: +pAtLeastOne(N, c.qty, hand).toFixed(3), round3: +pAtLeastOne(N, c.qty, hand + 3).toFixed(3), round5: +pAtLeastOne(N, c.qty, hand + 5).toFixed(3),
  })).sort((x, y) => y.opening - x.opening);

  // Goldfish: each hero makes 1 resource of its sphere a round; buy the most expensive allies and
  // attachments the right resources can pay for; events count as castable but are held for their
  // moment. Card effects (resource acceleration, card draw) aren't modelled.
  const deckList = a.cards.flatMap((c) => Array(c.qty).fill(c));
  const heroSph = {};
  for (const h of a.heroes) heroSph[h.sphere] = (heroSph[h.sphere] || 0) + h.qty;
  const canPayFrom = (c) => (['neutral', 'baggins', 'fellowship', undefined, null].includes(c.sphere) ? Object.keys(heroSph) : heroSph[c.sphere] ? [c.sphere] : []);
  const totals = { played: Array(rounds).fill(0), spent: Array(rounds).fill(0), wasted: Array(rounds).fill(0), castableOpen: 0, mulligans: 0, firstAlly: 0, noAllyBy3: 0, stuck: 0, deadCards: 0 };
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const cheapPlayable = (h) => h.filter((c) => canPayFrom(c).length && (costNum(c) ?? 9) <= 2).length;

  for (let gI = 0; gI < games; gI++) {
    let lib = shuffle(deckList.slice());
    let handC = lib.splice(0, hand);
    if (cheapPlayable(handC) < 2) { totals.mulligans++; lib = shuffle(lib.concat(handC)); handC = lib.splice(0, hand); }
    totals.castableOpen += cheapPlayable(handC) >= 2 ? 1 : 0;
    const pool = Object.fromEntries(Object.keys(heroSph).map((s) => [s, 0]));
    let firstAlly = 0;
    for (let r = 0; r < rounds; r++) {
      if (lib.length) handC.push(lib.shift());
      for (const [s, n] of Object.entries(heroSph)) pool[s] += n;
      const before = Object.values(pool).reduce((x, y) => x + y, 0);
      let bought = true;
      while (bought) {
        bought = false;
        const options = handC.filter((c) => ['ally', 'attachment'].includes(c.type) && costNum(c) !== null)
          .map((c) => ({ c, from: canPayFrom(c), cost: costNum(c) }))
          .filter((o) => o.from.length && o.cost <= o.from.reduce((n, s) => n + pool[s], 0))
          .sort((x, y) => y.cost - x.cost);
        if (options.length) {
          const o = options[0];
          let left = o.cost;
          for (const s of o.from.sort((x, y) => pool[y] - pool[x])) { const take = Math.min(left, pool[s]); pool[s] -= take; left -= take; }
          handC.splice(handC.indexOf(o.c), 1);
          totals.played[r]++;
          if (o.c.type === 'ally' && !firstAlly) firstAlly = r + 1;
          bought = true;
        }
      }
      const after = Object.values(pool).reduce((x, y) => x + y, 0);
      totals.spent[r] += before - after;
      totals.wasted[r] += after;
    }
    totals.firstAlly += firstAlly || rounds + 1;
    if (!firstAlly || firstAlly > 3) totals.noAllyBy3++;
    const unpayable = handC.filter((c) => !canPayFrom(c).length).length;
    totals.deadCards += unpayable;
    if (unpayable >= 2) totals.stuck++;
  }
  const avg = (x) => +(x / games).toFixed(2);
  return {
    games, rounds, deckSize: N,
    odds,
    openingHand: { keepable: +(totals.castableOpen / games).toFixed(3), mulliganRate: +(totals.mulligans / games).toFixed(3) },
    perRound: totals.played.map((_, r) => ({ round: r + 1, cardsPlayed: avg(totals.played.slice(0, r + 1).reduce((x, y) => x + y, 0)), resourcesUnspent: avg(totals.wasted[r]) })),
    averageFirstAllyRound: avg(totals.firstAlly), noAllyByRound3: +(totals.noAllyBy3 / games).toFixed(3),
    stuckWithOffSphereCards: +(totals.stuck / games).toFixed(3), averageDeadCardsInHand: avg(totals.deadCards),
    assumptions: 'One resource per hero per round in its sphere; the priciest affordable ally or attachment is bought first; events are kept in hand; mulligan if fewer than two playable cards costing 2 or less. Card effects are not modelled.',
  };
}

// ---- insight focus: topics and scenarios -------------------------------------------------------------------
// What a deck can be judged on in LOTR LCG - the questing/threat/combat balance the rules turn on,
// consistency, encounter-deck answers, and the way it's played (solo or two-handed, campaign).
export const INSIGHT_TOPICS = [
  { key: 'questing', label: 'Questing and willpower', hint: 'Enough willpower to make progress each round without stalling' },
  { key: 'threat', label: 'Threat management', hint: 'Starting threat, threat gain, engagement and threat reduction' },
  { key: 'defence', label: 'Defence', hint: 'Reliable defenders, Sentinel, surviving enemy attacks and shadows' },
  { key: 'attack', label: 'Attack', hint: 'Killing enemies efficiently, Ranged, big hitters' },
  { key: 'resources', label: 'Resources and spheres', hint: 'Resource generation, sphere matching and smoothing' },
  { key: 'draw', label: 'Card draw and consistency', hint: 'Seeing the key cards on time; redundancy' },
  { key: 'actionAdvantage', label: 'Action advantage', hint: 'Readying characters to quest and fight in the same round' },
  { key: 'locations', label: 'Location control', hint: 'Placing progress on locations and travelling safely' },
  { key: 'cancellation', label: 'Treachery and shadow cancellation', hint: 'Answers to the worst encounter cards' },
  { key: 'encounterControl', label: 'Encounter deck control', hint: 'Scrying, surge handling, keeping enemies in the staging area' },
  { key: 'healing', label: 'Healing and direct damage', hint: 'Archery, direct damage and keeping heroes alive' },
  { key: 'conditions', label: 'Condition removal', hint: 'Dealing with condition attachments on heroes' },
  { key: 'opening', label: 'Opening hand and mulligan', hint: 'A playable first two rounds' },
  { key: 'curve', label: 'Cost curve and card ratios', hint: 'Allies vs attachments vs events, and cost balance' },
  { key: 'heroes', label: 'Hero choice and synergy', hint: 'Whether the three heroes pull together' },
  { key: 'keywords', label: 'Keyword synergies', hint: 'Secrecy, Doomed, Valour, traps, side quests and similar' },
  { key: 'scaling', label: 'Solo and two-handed play', hint: 'How it holds up alone and alongside a second deck' },
  { key: 'campaign', label: 'Campaign mode', hint: 'Boons, burdens and staying strong across a campaign' },
  { key: 'sideQuests', label: 'Player side quests', hint: 'Which side quests are worth the tempo' },
  { key: 'resilience', label: 'Recovering from bad starts', hint: 'Coming back after losing a hero or a bad round' },
];

const SCEN_MAX_AGE_MS = 30 * 86400000;
export async function getScenarios(key, viewer = OWNER) {
  const g = game(key);
  if (!g.adapter.fetchScenarios) return [];
  const file = path.join(DATA_DIR, `${key}_scenarios.json`);
  let cached = null;
  try { cached = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { /* none yet */ }
  if (!cached || Date.now() - cached.fetchedAt > SCEN_MAX_AGE_MS) {
    try {
      cached = { fetchedAt: Date.now(), scenarios: await g.adapter.fetchScenarios() };
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(cached));
    } catch (err) { if (!cached) throw err; }
  }
  // Release order, with whether the owner has the pack the quest comes in.
  const { packs } = await getCardData(key);
  const { packs: owned } = await getOwnedPacks(key, viewer);
  const packOf = (name) => packs.find((p) => p.name === name);
  return cached.scenarios.map((sc) => { const p = packOf(sc.pack); return { ...sc, packPosition: p ? p.cycle * 1000 + p.position : 999999 + sc.id, owned: Boolean(p && owned[p.code]) }; })
    .sort((a, b) => a.community - b.community || a.packPosition - b.packPosition || a.id - b.id);
}

// ---- AI insights ------------------------------------------------------------------------------------------
// Four views of the deck: how every card pulls its weight (roles), what works together (synergies),
// swaps using cards the owner has, and cards from the whole pool worth considering - each with what
// it would replace and why. Cards outside the owner's listed packs are fine to suggest; they're only
// labelled, never treated as a problem.
// What an Arkham Horror deck can be judged on.
export const ARKHAM_INSIGHT_TOPICS = [
  { key: 'clues', label: 'Clue gathering', hint: 'Investigating reliably and getting the group its clues' },
  { key: 'fighting', label: 'Fighting and evading', hint: 'Dealing with enemies - killing them or slipping past' },
  { key: 'tests', label: 'Skill tests and icons', hint: 'Passing tests - base skills, committed icons, boosts' },
  { key: 'economy', label: 'Resources', hint: 'Enough money to play the key assets on time' },
  { key: 'draw', label: 'Card draw and consistency', hint: 'Finding the key cards and staying stocked' },
  { key: 'actions', label: 'Action economy', hint: 'Doing more with three actions - free triggers, fast cards' },
  { key: 'soak', label: 'Health and sanity soak', hint: 'Allies and armour that keep the investigator standing' },
  { key: 'treacheries', label: 'Treachery protection', hint: 'Cancelling or shrugging off the worst encounter cards' },
  { key: 'chaos', label: 'Chaos bag resilience', hint: 'Coping with bad tokens - margins, redraws, symbol effects' },
  { key: 'weakness', label: 'Weakness handling', hint: 'Coping with the signature and basic weaknesses' },
  { key: 'upgrades', label: 'Experience upgrades', hint: 'What to spend XP on next, and in what order' },
  { key: 'role', label: 'Role in the group', hint: 'What this investigator covers for the team' },
  { key: 'opening', label: 'Opening hand and mulligan', hint: 'A good start - which cards to hunt for' },
];
export const insightTopics = (key) => (GAMES[key]?.arkham ? ARKHAM_INSIGHT_TOPICS : INSIGHT_TOPICS);

export async function deckInsights(id, { topics = null, scenarioId = null, difficulty = 'normal', players = 1, campaign = false, partnerDeckId = null, runBy = null } = {}) {
  const deck = getDeck(id);
  if (!deck) throw new Error('Deck not found.');
  const g = game(deck.game);
  const a = await analyseDeck(deck);
  const data = await getCardData(deck.game);
  const { packs: owned } = await getOwnedPacks(deck.game, deck.owner);
  let test = null;
  try { test = await testDeck(deck, { games: 800 }); } catch (_) { /* too small to test */ }
  const inDeck = new Set([...Object.keys(deck.slots), ...Object.keys(deck.heroes)]);
  const deckNames = new Set([...a.heroes, ...a.cards].map((c) => c.name));
  const arkham = Boolean(g.arkham);
  // Arkham: the classes the investigator can take (from their deckbuilding options) plus neutral
  const invClasses = arkham ? [...new Set((a.heroes[0]?.deckOptions || []).flatMap((o) => o.faction || []))] : [];
  const spheres = new Set([...a.heroSpheres, 'neutral', ...invClasses]);
  const leadType = arkham ? 'investigator' : 'hero';
  // The collection = listed packs plus every card in any of their decks.
  const inDecks = deckCardCodes(deck.game, deck.owner);
  const have = (c) => haveQty(c, owned, inDecks);
  const fresh = (c) => !inDeck.has(c.code) && !deckNames.has(c.name);
  const playerCard = (c) => !arkham || (['asset', 'event', 'skill'].includes(c.type) && !c.encounter && !c.restrictions);
  const pool = data.cards.filter((c) => fresh(c) && c.type !== leadType && playerCard(c) && spheres.has(c.sphere) && have(c) > 0).slice(0, arkham ? 160 : Infinity);
  const ownedHeroes = arkham ? [] : data.cards.filter((c) => c.type === 'hero' && fresh(c) && have(c) > 0);

  // The wider pool, ranked by how well each card fits the deck's traits and themes.
  const themes = new Map();
  for (const [t, n] of a.traits) themes.set(t.toLowerCase(), n);
  for (const h of a.heroes) for (const t of (h.traits || '').split('.').map((s) => s.trim().toLowerCase()).filter(Boolean)) themes.set(t, (themes.get(t) || 0) + 4);
  const fit = (c) => {
    let s = 0;
    const traits = (c.traits || '').toLowerCase(), text = (c.text || '').toLowerCase();
    for (const [t, n] of themes) { if (traits.includes(t)) s += n; if (text.includes(t)) s += n * 1.5; }
    return s;
  };
  const seen = new Set([...pool, ...ownedHeroes].map((c) => c.name));
  const uniqueByName = (list) => { const out = []; for (const c of list) if (!seen.has(c.name)) { seen.add(c.name); out.push(c); } return out; };
  const wider = uniqueByName(data.cards.filter((c) => fresh(c) && c.type !== leadType && playerCard(c) && spheres.has(c.sphere) && (arkham || ['ally', 'attachment', 'event'].includes(c.type)))
    .map((c) => ({ c, s: fit(c) })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s).map((x) => x.c)).slice(0, 110);
  const widerHeroes = arkham ? [] : uniqueByName(data.cards.filter((c) => c.type === 'hero' && fresh(c)).map((c) => ({ c, s: fit(c) })).filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s).map((x) => x.c)).slice(0, 15);

  const chosen = insightTopics(deck.game).filter((t) => !topics || topics.includes(t.key));
  const scenario = scenarioId && !arkham ? (await getScenarios(deck.game)).find((x) => x.id === Number(scenarioId)) : null;
  const level = scenario && scenario.difficulties[difficulty] ? difficulty : 'normal';
  const mix = scenario?.difficulties[level];
  // The quest's real cards from Hall of Beorn, so advice isn't built on half-remembered details.
  let scenarioCards = null;
  if (scenario) { try { scenarioCards = await describeScenarioCards(scenario.encounterSets, { nightmareSet: level === 'nightmare' ? `${scenario.name} Nightmare` : null }); } catch (_) { /* go without */ } }
  const scenarioBlock = scenario ? `
TARGET SCENARIO: "${scenario.name}" from ${scenario.pack}, played on ${level} difficulty${campaign ? ' in campaign mode' : ''}.
Encounter sets: ${scenario.encounterSets.join(', ')}.
${mix ? `Encounter deck (${level}): ${mix.cards} cards - ${mix.enemies} enemies, ${mix.locations} locations, ${mix.treacheries} treacheries, ${mix.shadows} cards with shadow effects, ${mix.surges} with surge${mix.objectives ? `, ${mix.objectives} objectives` : ''}${mix.sideQuests ? `, ${mix.sideQuests} encounter side quests` : ''}.` : ''}
${scenarioCards ? `THE SCENARIO'S ACTUAL CARDS (from Hall of Beorn - base all quest advice on these; don't name encounter cards that aren't listed here):
${scenarioCards}` : 'The encounter cards could not be loaded - use what you know of this quest, and say where you are unsure rather than invent details.'}
Tune every suggestion to beating it.` : '';
  // Two-handed with a named partner deck: the pair are judged together.
  const partner = players > 1 && partnerDeckId && Number(partnerDeckId) !== deck.id ? getDeck(partnerDeckId) : null;
  const pa = partner ? await analyseDeck(partner) : null;
  const partnerBlock = pa ? `
PARTNER DECK - played alongside this one: "${partner.name}" (${partner.ownerName}'s)${arkham ? '' : `, starting threat ${pa.startingThreat}`}.
Partner ${arkham ? 'investigator' : 'heroes'}: ${pa.heroes.map((h) => `${h.name} (${h.sphereName}; ${h.traits})`).join(', ')}.
Partner cards: ${pa.cards.map((c) => `${c.qty}x ${c.name} (${c.sphereName} ${c.typeName})`).join(', ')}.
${arkham ? 'Judge the two investigators as a team: who finds the clues and who fights, what each covers for the other, and unique assets they both want.' : 'Judge the two decks as a team: unique characters or attachments they both want (only one copy of a unique card can be in play across both players), how they split questing and combat, what each covers for the other, and combined starting threat.'} Suggestions still change only THIS deck.` : '';
  const line = (c) => (arkham
    ? `${c.name}${c.xp ? ` (${c.xp} XP)` : ''} [${c.sphereName} ${c.typeName}${c.cost !== null ? `, cost ${c.cost}` : ''}${c.type === 'investigator' ? `, will ${c.willpower} / int ${c.intellect} / com ${c.combat} / agi ${c.agility}, health ${c.health}, sanity ${c.sanity}` : ''}] ${c.traits} - ${String(c.text || '').replace(/\s+/g, ' ').slice(0, 240)}`
    : `${c.name} [${c.sphereName} ${c.typeName}${c.cost !== null ? `, cost ${c.cost}` : ''}${c.threat !== null ? `, threat ${c.threat}` : ''}${c.willpower !== null ? `, ${c.willpower}WP/${c.attack}ATK/${c.defense}DEF/${c.health}HP` : ''}] ${c.traits} - ${c.text.replace(/\s+/g, ' ').slice(0, 240)}`);
  const prompt = `You are an expert deck builder for ${g.name}. Analyse this deck for its owner, who is playing ${players > 1 ? `two-handed (this deck alongside a second deck)` : 'solo (this deck on its own)'}${campaign ? ' in campaign mode' : ''} and wants to understand the synergies and how to improve the deck.
${scenarioBlock}
${partnerBlock}
FOCUS AREAS TO ASSESS (only these): ${chosen.map((t) => `${t.label} (${t.hint})`).join('; ')}.

DECK "${deck.name}" - ${a.total} cards${arkham ? '' : `, starting threat ${a.startingThreat}`}.
${arkham ? 'INVESTIGATOR' : 'HEROES'}:
${a.heroes.map((h) => `- ${line(h)}`).join('\n')}
CARDS:
${a.cards.map((c) => `- ${c.qty}x ${line(c)}`).join('\n')}
${deck.notes ? `\nOWNER'S NOTES: ${deck.notes.slice(0, 1000)}` : ''}
RULE CHECK: ${a.problems.concat(a.warnings).join(' ') || 'no problems found'}
${test ? `TEST RESULTS (${test.games} simulated games): opening hand keepable ${Math.round(test.openingHand.keepable * 100)}%, cards played by round 3 ${test.perRound[2]?.cardsPlayed}, first ally around round ${test.averageFirstAllyRound}, unspent resources in round 3 ${test.perRound[2]?.resourcesUnspent}.` : ''}

LIST A - CARDS THE OWNER HAS (same spheres, not in the deck):
${pool.map((c) => `- ${line(c)}`).join('\n') || '- none'}

LIST B - ${arkham ? 'NOT USED' : "HEROES THE OWNER HAS (a hero swap can change the deck's spheres)"}:
${ownedHeroes.map((c) => `- ${line(c)}`).join('\n') || '- none'}

LIST C - OTHER CARDS THAT FIT THIS DECK'S THEMES (may be from packs the owner hasn't listed):
${wider.map((c) => `- ${line(c)}`).join('\n') || '- none'}

LIST D - ${arkham ? 'NOT USED' : 'OTHER HEROES THAT FIT'}:
${widerHeroes.map((c) => `- ${line(c)}`).join('\n') || '- none'}

WHAT TO RETURN:
- cardRoles: every card and hero in the deck exactly once, with its role - "engine" (the deck is built around it), "core" (does a key job), "support", "flex" (fine, replaceable) or "weak" (underperforming here) - and one line on why.
- synergies: 5-10 specific interactions that make the deck work - each between 2 to 4 named cards (never a whole category like "Dwarf allies" or a list of every trap), rated "core", "strong" or "minor", explaining exactly how they interact and when it matters. antiSynergies: cards working against each other or against the heroes.
- improvements: 3-6 swaps using only cards in lists A and B. Each names what to add and what to cut (usually "flex" or "weak" cards), why the new card is better in this deck, and the impact ("high", "medium" or "low"). A hero swap is a cut of one hero and an add of another.
- cardsToConsider: 4-8 cards from lists C and D (or A and B) that would genuinely improve the deck, each with the deck cards it would replace, the deck cards it works with, and why.
- focusAreas: one entry for each focus area above, rating the deck 1-5 on it, a short assessment, and the single most useful change for it.
${partner ? '- partnership: how the two decks work together - an overview, clashes (shared uniques, both wanting the same things), what each covers for the other, and suggestions for this deck to fit the partner better.' : ''}
${scenario ? '- scenario: how this deck will fare against the target scenario - an overview, its key threats, what the deck handles well and badly there, and tips for playing it. Point your swaps and cards to consider at this scenario.' : ''}
Weight strengths, weaknesses, swaps and cards to consider towards the focus areas${scenario ? ' and the target scenario' : ''}.
Use exact card names as written above. Keep the deck at ${g.rules.deckMin} or more cards after any change. Never treat a card's pack or ownership as a problem.${arkham ? `
This is Arkham Horror: The Card Game - the deck has ONE investigator (never swap it), cards must be ones the investigator may take, and a card's XP level matters: suggest 0 XP cards as straight swaps and higher-level cards as experience upgrades ("add X (2 XP), cut Y") for the campaign. "questTypes" means the kinds of scenario the deck is best and worst at. Signature cards and weaknesses are required and can't be cut.` : ''}`;

  const str = { type: 'STRING' }, strs = { type: 'ARRAY', items: str };
  const cardQty = { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: str, qty: { type: 'INTEGER' } }, required: ['name', 'qty'] } };
  const pair = { type: 'ARRAY', items: { type: 'OBJECT', properties: { cards: strs, explanation: str, strength: { type: 'STRING', enum: ['core', 'strong', 'minor'] } }, required: ['cards', 'explanation'] } };
  const responseSchema = {
    type: 'OBJECT',
    properties: {
      summary: str, archetype: str, strengths: strs, weaknesses: strs,
      cardRoles: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: str, role: { type: 'STRING', enum: ['engine', 'core', 'support', 'flex', 'weak'] }, note: str }, required: ['name', 'role', 'note'] } },
      synergies: pair, antiSynergies: pair,
      improvements: { type: 'ARRAY', items: { type: 'OBJECT', properties: { add: cardQty, cut: cardQty, reason: str, impact: { type: 'STRING', enum: ['high', 'medium', 'low'] } }, required: ['add', 'cut', 'reason', 'impact'] } },
      cardsToConsider: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: str, qty: { type: 'INTEGER' }, replaces: cardQty, worksWith: strs, why: str }, required: ['name', 'qty', 'replaces', 'worksWith', 'why'] } },
      mulligan: str, playTips: strs, questTypes: str,
      focusAreas: { type: 'ARRAY', items: { type: 'OBJECT', properties: { topic: str, rating: { type: 'INTEGER' }, assessment: str, suggestion: str }, required: ['topic', 'rating', 'assessment', 'suggestion'] } },
      scenario: { type: 'OBJECT', properties: { overview: str, keyThreats: strs, handlesWell: strs, struggles: strs, tips: strs } },
      partnership: { type: 'OBJECT', properties: { overview: str, clashes: strs, coverage: strs, suggestions: strs } },
    },
    required: ['summary', 'archetype', 'strengths', 'weaknesses', 'cardRoles', 'synergies', 'antiSynergies', 'improvements', 'cardsToConsider', 'mulligan', 'playTips', 'questTypes', 'focusAreas'],
  };
  const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json', responseSchema, temperature: 0.4 } });
  const out = JSON.parse((await model.generateContent(prompt)).response.text());

  // Tie every named card back to the card database. inYourSets is only a label.
  const inDeckCard = (name) => [...a.heroes, ...a.cards].find((d) => d.name.toLowerCase() === String(name || '').toLowerCase());
  const find = (name) => { const list = data.byName[String(name || '').toLowerCase()] || []; return list.find((c) => have(c) > 0) || list[0] || null; };
  const ref = (x, fromDeck) => {
    const c = (fromDeck && inDeckCard(x.name)) || find(x.name);
    return { name: x.name, qty: Math.max(1, Number(x.qty) || 1), code: c?.code || null, known: Boolean(c), inYourSets: c ? have(c) > 0 : false, sphere: c?.sphere || null };
  };
  const improvements = (out.improvements || []).map((m) => ({ ...m, add: (m.add || []).map((x) => ref(x, false)), cut: (m.cut || []).map((x) => ref(x, true)) }));
  const cardsToConsider = (out.cardsToConsider || []).map((x) => {
    const r = ref(x, false);
    return { ...r, why: x.why, worksWith: x.worksWith || [], replaces: (x.replaces || []).map((y) => ref(y, true)) };
  }).filter((x) => x.known);
  const cardRoles = (out.cardRoles || []).map((r) => { const c = inDeckCard(r.name); return { ...r, code: c?.code || null, qty: c?.qty || null }; });
  // Match focus ratings back to the topic keys the page uses.
  const focusAreas = (out.focusAreas || []).map((f) => ({ ...f, key: (chosen.find((t) => t.label.toLowerCase() === String(f.topic).toLowerCase()) || chosen.find((t) => String(f.topic).toLowerCase().includes(t.label.toLowerCase().split(' ')[0])))?.key || null, rating: Math.max(1, Math.min(5, Number(f.rating) || 3)) }));
  const settings = { runBy, runAt: Date.now(), partnerDeckId: partner?.id || null, partnerName: partner ? `${partner.name} (${partner.ownerName})` : null,
    topics: chosen.map((t) => t.key), scenarioCardsLoaded: Boolean(scenarioCards), scenarioId: scenario?.id || null, scenarioName: scenario?.name || null, difficulty: level, players, campaign };
  const result = { ...out, focusAreas, scenario: scenario ? out.scenario || null : null, partnership: partner ? out.partnership || null : null, settings, improvements, cardsToConsider, cardRoles, deckSnapshot: { total: a.total, heroes: a.heroes.map((h) => h.name) } };
  db.prepare('UPDATE decks SET insights = ?, insights_at = ? WHERE id = ?').run(JSON.stringify(result), Date.now(), deck.id);
  return result;
}

// Apply one suggestion: a swap (list "improvements") or a card worth considering (list
// "cardsToConsider", which adds that card and cuts what it replaces). Adds and cuts go by card code.
export function applyImprovement(id, index, list = 'improvements') {
  const deck = getDeck(id);
  const item = deck?.insights?.[list]?.[index];
  if (!item) throw new Error('That suggestion is no longer there.');
  const change = list === 'cardsToConsider' ? { add: [{ code: item.code, qty: item.qty }], cut: item.replaces || [] } : item;
  const data = memo[deck.game];
  const slots = { ...deck.slots }, heroes = { ...deck.heroes };
  const isHero = (code) => data?.byCode[code]?.type === 'hero';
  for (const x of change.cut || []) {
    const box = heroes[x.code] ? heroes : slots;
    if (x.code && box[x.code]) box[x.code] = Math.max(0, box[x.code] - x.qty);
  }
  for (const x of change.add || []) {
    if (!x.code) continue;
    if (isHero(x.code)) heroes[x.code] = 1; else slots[x.code] = (slots[x.code] || 0) + x.qty;
  }
  const updated = updateDeck(id, { slots, heroes });
  const insights = { ...deck.insights, [list]: deck.insights[list].map((m, i) => (i === index ? { ...m, applied: true } : m)) };
  db.prepare('UPDATE decks SET insights = ? WHERE id = ?').run(JSON.stringify(insights), deck.id);
  return { ...updated, insights };
}

// ---- exports ------------------------------------------------------------------------------------------
const csvCell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export async function exportDeck(id, format) {
  const deck = getDeck(id);
  if (!deck) throw new Error('Deck not found.');
  const a = await analyseDeck(deck);
  const g = game(deck.game);
  const all = [...a.heroes.map((h) => ({ ...h, section: 'Hero' })), ...a.cards.map((c) => ({ ...c, section: c.typeName || c.type }))];
  if (format === 'csv') {
    const head = ['section', 'quantity', 'code', 'name', 'sphere', 'type', 'cost', 'threat', 'willpower', 'attack', 'defense', 'health', 'traits', 'pack', 'in_listed_sets', 'text'];
    return [head.join(','), ...all.map((c) => [c.section, c.qty, c.code, c.name, c.sphereName, c.typeName, c.cost, c.threat, c.willpower, c.attack, c.defense, c.health, c.traits, c.packName, c.notInSets ? 'no' : 'yes', c.text].map(csvCell).join(','))].join('\r\n');
  }
  if (format === 'txt') {
    // RingsDB's deck import reads "<n>x <Card name> (<Pack>)" lines.
    const ln = (c) => `${c.qty}x ${c.name} (${c.packName})`;
    const groups = {};
    for (const c of a.cards) (groups[c.typeName || 'Other'] ||= []).push(c);
    return [`${deck.name}`, '', `Heroes (${a.heroCount}, starting threat ${a.startingThreat})`, ...a.heroes.map(ln),
      ...Object.entries(groups).flatMap(([t, list]) => ['', `${t} (${list.reduce((n, c) => n + c.qty, 0)})`, ...list.map(ln)])].join('\n');
  }
  return {
    game: g.name, name: deck.name, exportedAt: new Date().toISOString(), source: deck.sourceUrl || 'IMS',
    startingThreat: a.startingThreat, totalCards: a.total, valid: a.valid, problems: a.problems, warnings: a.warnings,
    heroes: a.heroes.map((h) => ({ code: h.code, name: h.name, sphere: h.sphereName, threat: h.threat, traits: h.traits })),
    cards: a.cards.map((c) => ({ qty: c.qty, code: c.code, name: c.name, type: c.typeName, sphere: c.sphereName, cost: c.cost, inListedSets: !c.notInSets })),
    [g.site.name.toLowerCase()]: { heroes: deck.heroes, slots: { ...deck.slots, ...deck.heroes }, sideslots: deck.sideslots },
    notes: deck.notes || '',
  };
}

// ---- for Ims ----------------------------------------------------------------------------------------
export function describeDecksForIms() {
  const all = listDecks();
  const others = {};
  for (const d of all) if (lc(d.owner) !== OWNER) others[d.ownerName] = (others[d.ownerName] || 0) + 1;
  const decks = all.filter((d) => lc(d.owner) === OWNER);
  const shared = Object.entries(others).map(([n, c]) => `${n} has ${c} deck${c === 1 ? '' : 's'} there too`).join('; ');
  if (!decks.length) return shared ? `none of their own yet; ${shared}` : 'none built yet';
  return describeOwn(decks) + (shared ? `. Invited: ${shared}` : '');
}
function describeOwn(decks) {
  if (!decks.length) return 'none built yet';
  return decks.map((d) => {
    let heroes = '';
    try {
      if (!memo[d.game]) { const f = path.join(DATA_DIR, `${d.game}_cards.json`); if (fs.existsSync(f)) memo[d.game] = index(JSON.parse(fs.readFileSync(f, 'utf8'))); }
      const data = memo[d.game]; heroes = data ? Object.keys(d.heroes).map((c) => data.byCode[c]?.name).filter(Boolean).join(', ') : ''; } catch (_) { /* cards not loaded */ }
    const n = Object.values(d.slots).reduce((x, y) => x + y, 0);
    return `${GAMES[d.game]?.short || d.game} "${d.name}"${heroes ? ` (heroes ${heroes})` : ''}, ${n} cards${d.insights?.summary ? ` - ${d.insights.summary.slice(0, 140)}` : ''}`;
  }).join('; ');
}
// Deck-builder games in the collection, for the Board Games page.
export const deckGameForBgg = (bggId) => Object.values(GAMES).find((g) => g.bggIds.includes(Number(bggId)))?.key || null;

// ---- insights as a background job ----------------------------------------------------------------------
// A run takes 30-60 s - long enough for a phone, ngrok or a proxy to give up on the request - so the
// page starts a job and checks back. Gemini being busy (429/500/503) is retried twice before failing,
// and the last failure is kept on the deck so the page can say what went wrong.
try { db.exec('ALTER TABLE decks ADD COLUMN insights_error TEXT'); } catch (_) { /* already there */ }
const jobs = new Map(); // deckId -> { status, startedAt, finishedAt, error, runBy }
const transient = (e) => /\b(429|500|502|503|504)\b|overloaded|unavailable|fetch failed|ECONNRESET|ETIMEDOUT|deadline/i.test(String(e?.message || e));

export function startInsightsJob(id, opts) {
  const deckId = Number(id);
  const running = jobs.get(deckId);
  if (running?.status === 'running') return running;
  const job = { status: 'running', startedAt: Date.now(), runBy: opts.runBy || null, attempt: 1 };
  jobs.set(deckId, job);
  (async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      job.attempt = attempt;
      try {
        await deckInsights(deckId, opts);
        db.prepare('UPDATE decks SET insights_error = NULL WHERE id = ?').run(deckId);
        Object.assign(job, { status: 'done', finishedAt: Date.now() });
        return;
      } catch (err) {
        console.error(`[Decks] Insights for deck #${deckId} failed (attempt ${attempt}):`, err.message);
        if (attempt < 3 && transient(err)) { await new Promise((r) => setTimeout(r, attempt * 5000)); continue; }
        const msg = transient(err) ? `Gemini is busy right now - try again in a minute. (${err.message.slice(0, 160)})` : err.message.slice(0, 300);
        db.prepare('UPDATE decks SET insights_error = ? WHERE id = ?').run(JSON.stringify({ message: msg, at: Date.now(), runBy: job.runBy }), deckId);
        Object.assign(job, { status: 'error', error: msg, finishedAt: Date.now() });
        return;
      }
    }
  })();
  return job;
}
export function insightsJob(id) {
  const job = jobs.get(Number(id));
  return job ? { ...job, seconds: Math.round(((job.finishedAt || Date.now()) - job.startedAt) / 1000) } : { status: 'idle' };
}

// ---- ask about a deck ---------------------------------------------------------------------------------
// "Are there any other Ent cards I could add?" - the question's key words are looked up across the
// whole card pool (whole words, simple plurals), and those cards go to Gemini with the deck, the
// heroes' spheres (the resources the deck can actually pay with) and what the asker owns. Each card in
// the answer gets a verdict: works / possible / won't work, and why. Questions and answers are kept on
// the deck so everyone looking at it sees them.
db.exec(`CREATE TABLE IF NOT EXISTS deck_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, deck_id INTEGER NOT NULL, asked_by TEXT, question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running', answer TEXT, error TEXT, created_at INTEGER NOT NULL, answered_at INTEGER
)`);
const STOP = new Set('the a an and or of to in on for with is are was be it this that my me i you your any other some can could would should will what which who how why do does did have has had there their them they we our us about into from than then more most less best good work works working deck decks card cards add adding play playing use using get make like need want also just only really still'.split(' '));

function relevantCards(data, question, deckCodes, limit = 60) {
  const words = [...new Set(String(question).toLowerCase().match(/[a-zà-ÿ'-]{3,}/g) || [])].filter((w) => !STOP.has(w));
  if (!words.length) return [];
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const forms = words.map((w) => {
    const base = w.replace(/'s$/, '').replace(/ies$/, 'y').replace(/([^s])s$/, '$1');
    return new RegExp(`\\b(${esc(w)}|${esc(base)})\\b`, 'i');
  });
  return data.cards.filter((c) => !deckCodes.has(c.code)).map((c) => {
    let score = 0;
    forms.forEach((re) => { if (re.test(c.name)) score += 6; if (re.test(c.traits)) score += 5; if (re.test(c.text)) score += 2; });
    return { c, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.c);
}

async function answerQuestion(qid) {
  const q = db.prepare('SELECT * FROM deck_questions WHERE id = ?').get(qid);
  const deck = getDeck(q.deck_id);
  const g = game(deck.game);
  const a = await analyseDeck(deck);
  const data = await getCardData(deck.game);
  const asker = q.asked_by || deck.owner;
  const { packs: owned } = await getOwnedPacks(deck.game, asker);
  const inDecks = deckCardCodes(deck.game, asker);
  const have = (c) => haveQty(c, owned, inDecks);
  const deckCodes = new Set([...Object.keys(deck.slots), ...Object.keys(deck.heroes)]);
  // A card sharing a name with anything in the deck is left out - a unique name can only be in play once
  // (e.g. the Treebeard ally when Treebeard is a hero), and duplicates of deck cards aren't additions.
  const deckNames = new Set([...a.heroes, ...a.cards].map((c) => c.name.toLowerCase()));
  const found = relevantCards(data, q.question, deckCodes).filter((c) => !deckNames.has(c.name.toLowerCase()));
  const history = db.prepare(`SELECT question, answer FROM deck_questions WHERE deck_id = ? AND status = 'done' AND id < ? ORDER BY id DESC LIMIT 3`).all(deck.id, qid).reverse();
  const line = (c) => `${c.name} [${c.sphereName} ${c.typeName}${c.cost !== null ? `, cost ${c.cost}` : ''}${c.threat !== null ? `, threat ${c.threat}` : ''}${c.willpower !== null ? `, ${c.willpower}WP/${c.attack}ATK/${c.defense}DEF/${c.health}HP` : ''}] ${c.traits} - ${c.text.replace(/\s+/g, ' ').slice(0, 300)}`;
  const earlier = history.map((h) => { let ans = ''; try { ans = JSON.parse(h.answer).answer; } catch { /* old format */ } return `Q: ${h.question}\nA: ${String(ans).slice(0, 500)}`; }).join('\n');
  const prompt = `You answer questions about one deck for ${g.name}, for a player at home. Be direct and specific, use exact card names, and keep to what they asked.

THE DECK "${deck.name}" (${deck.ownerName}'s) - ${a.total} cards, starting threat ${a.startingThreat}.
HEROES - the resources it can pay with (each hero makes 1 resource a round of its own sphere; Neutral cards can be paid from any sphere): ${a.heroes.map((h) => `${h.name} (${h.sphereName})`).join(', ')}.
${a.heroes.map((h) => `- ${line(h)}`).join('\n')}
CARDS IN THE DECK:
${a.cards.map((c) => `- ${c.qty}x ${line(c)}`).join('\n')}
${deck.insights?.summary ? `\nEARLIER ANALYSIS: ${deck.insights.summary}` : ''}
${earlier ? `\nEARLIER QUESTIONS ON THIS DECK:\n${earlier}` : ''}

CARDS FROM THE WHOLE CARD POOL THAT MATCH THE QUESTION (not in the deck; "owned" is how many the asker has):
${found.map((c) => `- ${line(c)} {owned: ${have(c)}}`).join('\n') || "- no cards matched the question's words - answer from the deck itself and your knowledge of the game, and say if you are unsure."}

QUESTION from ${personName(asker)}: ${q.question}

For every card you mention as a possible addition, give a verdict: "works" (payable with this deck's spheres and it fits), "possible" (works with a change - e.g. a sphere-matching card, a song attachment or a hero swap; say which) or "wont-work" (say why - usually the resource sphere, or it doesn't fit the deck). Remember a unique card can't come into play while one with the same name is in play (a hero included). Not owning a card isn't a problem - just mention it. Only name cards listed above or already in the deck.`;
  const str = { type: 'STRING' };
  const responseSchema = {
    type: 'OBJECT',
    properties: {
      answer: str,
      cards: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: str, verdict: { type: 'STRING', enum: ['works', 'possible', 'wont-work'] }, qty: { type: 'INTEGER' }, reason: str }, required: ['name', 'verdict', 'reason'] } },
    },
    required: ['answer', 'cards'],
  };
  const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json', responseSchema, temperature: 0.3 } });
  const out = JSON.parse((await model.generateContent(prompt)).response.text());
  const byName = (n) => found.find((c) => c.name.toLowerCase() === String(n).toLowerCase()) || (data.byName[String(n).toLowerCase()] || [])[0] || null;
  out.cards = (out.cards || []).map((x) => {
    const c = byName(x.name);
    return { ...x, code: c?.code || null, sphere: c?.sphere || null, owned: c ? have(c) : 0, inDeck: c ? deckCodes.has(c.code) : false, qty: Math.max(1, Math.min(c?.deckLimit || 3, Number(x.qty) || 1)) };
  }).filter((x) => x.code);
  out.matched = found.length;
  return out;
}

const qRow = (r) => ({ id: r.id, question: r.question, askedBy: r.asked_by, askedByName: personName(r.asked_by), status: r.status, error: r.error, createdAt: r.created_at, answeredAt: r.answered_at, answer: r.answer ? parse(r.answer) : null });
export function listQuestions(deckId) {
  return db.prepare('SELECT * FROM deck_questions WHERE deck_id = ? ORDER BY id DESC LIMIT 30').all(Number(deckId)).map(qRow);
}
export function askDeck(deckId, question, askedBy) {
  const text = String(question || '').trim();
  if (!text) throw new Error('Type a question first.');
  if (!getDeck(deckId)) throw new Error('Deck not found.');
  const info = db.prepare('INSERT INTO deck_questions (deck_id, asked_by, question, created_at) VALUES (?, ?, ?, ?)').run(Number(deckId), lc(askedBy), text.slice(0, 1000), Date.now());
  const qid = info.lastInsertRowid;
  (async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const out = await answerQuestion(qid);
        db.prepare(`UPDATE deck_questions SET status = 'done', answer = ?, answered_at = ? WHERE id = ?`).run(JSON.stringify(out), Date.now(), qid);
        return;
      } catch (err) {
        console.error(`[Decks] Question #${qid} failed (attempt ${attempt}):`, err.message);
        if (attempt < 3 && transient(err)) { await new Promise((r) => setTimeout(r, attempt * 4000)); continue; }
        db.prepare(`UPDATE deck_questions SET status = 'error', error = ?, answered_at = ? WHERE id = ?`).run(transient(err) ? 'Gemini is busy right now - try again in a minute.' : err.message.slice(0, 300), Date.now(), qid);
        return;
      }
    }
  })();
  return qRow(db.prepare('SELECT * FROM deck_questions WHERE id = ?').get(qid));
}
export const deleteQuestion = (deckId, qid) => db.prepare('DELETE FROM deck_questions WHERE id = ? AND deck_id = ?').run(Number(qid), Number(deckId)).changes > 0;

// Add one suggested card to a deck (owner only - checked in the route).
export async function addCardToDeck(deckId, code, qty = 1) {
  const deck = getDeck(deckId);
  const data = await getCardData(deck.game);
  const c = data.byCode[code];
  if (!c) throw new Error('Unknown card.');
  if (c.type === 'hero') return updateDeck(deckId, { heroes: { ...deck.heroes, [code]: 1 } });
  return updateDeck(deckId, { slots: { ...deck.slots, [code]: Math.min(c.deckLimit ?? 3, (deck.slots[code] || 0) + Math.max(1, qty)) } });
}
