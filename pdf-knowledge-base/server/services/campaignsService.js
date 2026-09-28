import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db/database.js';
import { getCardData, getDeck, personName, canonEmail, OWNER, getScenarios } from './decksService.js';
import { ARKHAM_KINDS, TOKENS as ARKHAM_TOKENS, campaignByName, arkhamScenarios, campaignSetup, cachedSetup } from './decks/arkhamCampaigns.js';

// Campaign tracking for the deck builder (LOTR LCG campaign mode: the sagas, the Revised Core and the
// campaign expansions). A campaign has players (each with a deck, heroes and fallen heroes), the
// scenarios played with results and scores, the boons and burdens earned - boons go into a player's
// deck, burdens into a player's deck or the encounter deck - a threat penalty, and written notes.
// Everyone in the deck builder can see every campaign; its players can change it.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLASS_FILE = path.join(__dirname, '..', 'data', 'decks', 'lotr_campaign_kinds.json');
const lc = canonEmail;

db.exec(`CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT, game TEXT NOT NULL, name TEXT NOT NULL, kind TEXT, created_by TEXT,
  players TEXT NOT NULL DEFAULT '[]', scenarios TEXT NOT NULL DEFAULT '[]', cards TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '[]', threat_penalty INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
)`);

// Each campaign's own banner image (uploaded on the page), shown at a chosen height and crop position.
try { db.exec('ALTER TABLE campaigns ADD COLUMN banner TEXT'); } catch (_) { /* already there */ }
try { db.exec("ALTER TABLE campaigns ADD COLUMN arkham TEXT NOT NULL DEFAULT '{}'"); } catch (_) { /* already there */ }
try { db.exec("ALTER TABLE campaigns ADD COLUMN rule_checks TEXT NOT NULL DEFAULT '[]'"); } catch (_) { /* already there */ }
try { db.exec("ALTER TABLE campaigns ADD COLUMN delete_votes TEXT NOT NULL DEFAULT '[]'"); } catch (_) { /* already there */ }
try { db.exec('ALTER TABLE campaigns ADD COLUMN banner_height INTEGER NOT NULL DEFAULT 180'); } catch (_) { /* already there */ }
try { db.exec('ALTER TABLE campaigns ADD COLUMN banner_pos INTEGER NOT NULL DEFAULT 50'); } catch (_) { /* already there */ }
const BANNER_DIR = path.join(__dirname, '..', 'data', 'decks', 'campaign_banners');
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export function setBanner(id, buffer, contentType, by) {
  mustEdit(id, by);
  const ext = IMAGE_TYPES[String(contentType || '').split(';')[0].trim()];
  if (!ext) throw new Error('That isn\'t a JPEG, PNG, WebP or GIF image.');
  if (!buffer?.length) throw new Error('The image is empty.');
  if (buffer.length > 8 * 1024 * 1024) throw new Error('The image is over 8 MB - please use a smaller one.');
  fs.mkdirSync(BANNER_DIR, { recursive: true });
  const old = db.prepare('SELECT banner FROM campaigns WHERE id = ?').get(Number(id))?.banner;
  const file = `campaign_${Number(id)}_${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(BANNER_DIR, file), buffer);
  if (old && old !== file) { try { fs.unlinkSync(path.join(BANNER_DIR, old)); } catch (_) { /* gone already */ } }
  save(id, { banner: file });
  return getCampaign(id, by);
}
export function removeBanner(id, by) {
  mustEdit(id, by);
  const old = db.prepare('SELECT banner FROM campaigns WHERE id = ?').get(Number(id))?.banner;
  if (old) { try { fs.unlinkSync(path.join(BANNER_DIR, old)); } catch (_) { /* gone already */ } }
  save(id, { banner: null });
  return getCampaign(id, by);
}
export function bannerFile(id) {
  const f = db.prepare('SELECT banner FROM campaigns WHERE id = ?').get(Number(id))?.banner;
  return f ? path.join(BANNER_DIR, f) : null;
}

// The campaign types a campaign can follow - the products that come with campaign rules.
export const CAMPAIGN_KINDS = [
  'The Lord of the Rings saga', 'The Hobbit saga', 'Revised Core Set campaign', 'The Dark of Mirkwood campaign',
  'Angmar Awakened campaign', 'Dream-chaser campaign', 'Ered Mithrin campaign', 'Haradrim campaign', 'Dwarrowdelf campaign',
  'Against the Shadow campaign', 'The Ring-maker campaign', 'Vengeance of Mordor campaign', 'Custom / mixed',
];

// ---- campaign cards: boons and burdens --------------------------------------------------------------------
// RingsDB lists every campaign card (as "treasure", with text and pack) but doesn't say boon or burden;
// Hall of Beorn does (card subtypes). It caps a search at 50 cards, so it's asked one pack at a time.
async function hobTitles(subType, set) {
  const res = await fetch(`https://hallofbeorn.com/Export/Search?CardSubType=${subType}&CardSet=${encodeURIComponent(set)}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(45000) });
  if (!res.ok) return [];
  const list = await res.json().catch(() => []);
  return Array.isArray(list) ? list.map((c) => String(c.Title || '').toLowerCase()) : [];
}
// Classifies packs in the background, four at a time, and saves as it goes; callers use whatever is
// cached so far (Hall of Beorn is slow - a full pass can take minutes).
let kindsCache = null, refreshing = false;
function readKinds() {
  if (!kindsCache) { try { kindsCache = JSON.parse(fs.readFileSync(CLASS_FILE, 'utf8')); } catch (_) { kindsCache = {}; } }
  return kindsCache;
}
function refreshKinds(packs) {
  const cached = readKinds();
  const todo = packs.filter((p) => !cached[p] || Date.now() - cached[p].at > 30 * 86400000);
  if (!todo.length || refreshing) return;
  refreshing = true;
  (async () => {
    const queue = [...todo];
    const worker = async () => {
      while (queue.length) {
        const p = queue.shift();
        try {
          const [boons, burdens] = await Promise.all([hobTitles('Boon', p), hobTitles('Burden', p)]);
          cached[p] = { at: Date.now(), boons, burdens };
          fs.mkdirSync(path.dirname(CLASS_FILE), { recursive: true });
          fs.writeFileSync(CLASS_FILE, JSON.stringify(cached));
        } catch (_) { /* try again next time */ }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    refreshing = false;
    console.log(`[Campaigns] Boon/burden labels loaded for ${todo.length} packs from Hall of Beorn`);
  })();
}
export async function getCampaignCards(game = 'lotr') {
  const data = await getCardData(game);
  const camp = data.cards.filter((c) => c.type === 'treasure' || /campaign/i.test(c.typeName || ''));
  // Boon/burden labels are only used if they've been cached - no bulk lookups (Hall of Beorn is slow
  // enough to stall the page); the player says which it is when adding a card.
  const kinds = readKinds();
  return camp.map((c) => {
    const k = kinds[c.packName];
    const n = c.name.toLowerCase();
    const kind = k?.boons.includes(n) ? 'boon' : k?.burdens.includes(n) ? 'burden' : 'campaign';
    return { code: c.code, name: c.name, kind, pack: c.packName, traits: c.traits, text: c.text, image: c.image };
  }).sort((a, b) => a.pack.localeCompare(b.pack) || a.name.localeCompare(b.name));
}

// ---- campaigns ------------------------------------------------------------------------------------------
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const row = (r) => r && ({
  id: r.id, game: r.game, name: r.name, kind: r.kind, createdBy: r.created_by, createdByName: personName(r.created_by),
  players: parse(r.players, []).map((p) => ({ ...p, name: personName(p.email) })),
  scenarios: parse(r.scenarios, []), cards: parse(r.cards, []), notes: parse(r.notes, []).map((n) => ({ ...n, byName: personName(n.by) })),
  threatPenalty: r.threat_penalty, createdAt: r.created_at, updatedAt: r.updated_at,
  deleteVotes: parse(r.delete_votes, []).map((e) => ({ email: e, name: personName(e) })),
  ruleChecks: parse(r.rule_checks, []).map((x) => ({ ...x, byName: personName(x.by) })),
  epilogue: r.epilogue ? parse(r.epilogue, null) : null,
  // Arkham: difficulty, the chaos bag's tokens and the campaign log ({ id, section, text, crossed, by, at })
  arkham: parse(r.arkham, {}),
  // the file name changes with each upload, so it doubles as a cache-buster
  banner: r.banner ? { url: `/api/decks/campaigns/${r.id}/banner?v=${encodeURIComponent(r.banner)}`, height: r.banner_height, pos: r.banner_pos } : null,
});
const withPerms = (c, viewer) => c && ({ ...c, canEdit: c.players.some((p) => p.email === lc(viewer)) || c.createdBy === lc(viewer) || lc(viewer) === OWNER });

export function listCampaigns(game, viewer) {
  return db.prepare('SELECT * FROM campaigns WHERE game = ? ORDER BY updated_at DESC').all(game).map(row).map((c) => {
    const total = c.scenarios.reduce((n, s) => n + (Number(s.score) || 0), 0);
    return withPerms({ ...c, totalScore: total, played: c.scenarios.length, won: c.scenarios.filter((s) => s.result === 'won').length }, viewer);
  });
}
export function getCampaign(id, viewer) {
  const c = row(db.prepare('SELECT * FROM campaigns WHERE id = ?').get(Number(id)));
  if (!c) return null;
  // Each player's deck and heroes, fresh.
  c.players = c.players.map((p) => {
    const d = p.deckId ? getDeck(p.deckId) : null;
    return { ...p, deckName: d?.name || null, deckOwner: d?.ownerName || null, deckHeroes: d ? Object.keys(d.heroes) : [] };
  });
  c.totalScore = c.scenarios.reduce((n, s) => n + (Number(s.score) || 0), 0);
  return withPerms(c, viewer);
}
export function createCampaign(game, { name, kind, players, difficulty }, by) {
  const n = String(name || '').trim();
  if (!n) throw new Error('Give the campaign a name.');
  const list = (Array.isArray(players) && players.length ? players : [{ email: by }]).map((p) => ({ email: lc(p.email), deckId: p.deckId ? Number(p.deckId) : null, fallen: [] }));
  const now = Date.now();
  const info = db.prepare('INSERT INTO campaigns (game, name, kind, created_by, players, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(game, n.slice(0, 120), kind || null, lc(by), JSON.stringify(game === 'ahlcg' ? list.map((p) => ({ ...p, physical: 0, mental: 0, xpBonus: 0, xpSpent: 0, status: 'active' })) : list), now, now);
  if (game === 'ahlcg') startArkhamSetup(info.lastInsertRowid, kind, difficulty);
  return getCampaign(info.lastInsertRowid, by);
}

// An Arkham campaign's chaos bag at its difficulty, from its guide (read once, then remembered).
function startArkhamSetup(id, kind, difficulty = 'standard') {
  const diff = ['easy', 'standard', 'hard', 'expert'].includes(difficulty) ? difficulty : 'standard';
  const apply = (setup) => {
    const c = row(db.prepare('SELECT * FROM campaigns WHERE id = ?').get(Number(id)));
    if (!c) return;
    const a = { ...(c.arkham || {}), difficulty: c.arkham?.difficulty || diff };
    if (!a.chaosBag?.length && setup?.chaosBag?.[a.difficulty]) a.chaosBag = setup.chaosBag[a.difficulty];
    if (setup?.logSections) a.logSections = setup.logSections;
    save(id, { arkham: a });
  };
  apply(cachedSetup(kind));
  if (!cachedSetup(kind) && campaignByName(kind)?.guide?.length) {
    campaignSetup(kind).then(apply).catch((err) => console.warn(`[Campaigns] Couldn't read the ${kind} guide: ${err.message}`));
  }
}
// The chaos bag for a difficulty, as the campaign's guide gives it (to reset the bag to).
export async function arkhamSetup(kind) { return campaignSetup(kind); }

// The campaign log: entries under the guide's sections; crossing one out keeps it (struck through).
export function addLogEntry(id, { section, text }, by) {
  const c = mustEdit(id, by);
  const t = String(text || '').trim();
  if (!t) throw new Error('The entry is empty.');
  const a = { ...(c.arkham || {}) };
  a.log = [...(a.log || []), { id: newId(), section: String(section || 'Campaign Notes').slice(0, 80), text: t.slice(0, 500), crossed: false, by: lc(by), at: Date.now() }];
  save(id, { arkham: a });
  return getCampaign(id, by);
}
export function updateLogEntry(id, entryId, { crossed, text }, by) {
  const c = mustEdit(id, by);
  const a = { ...(c.arkham || {}) };
  a.log = (a.log || []).map((e) => (e.id === entryId ? { ...e, ...(crossed !== undefined ? { crossed: Boolean(crossed) } : {}), ...(text !== undefined ? { text: String(text).slice(0, 500) } : {}) } : e));
  save(id, { arkham: a });
  return getCampaign(id, by);
}
export function removeLogEntry(id, entryId, by) {
  const c = mustEdit(id, by);
  const a = { ...(c.arkham || {}) };
  a.log = (a.log || []).filter((e) => e.id !== entryId);
  save(id, { arkham: a });
  return getCampaign(id, by);
}
function mustEdit(id, by) {
  const c = getCampaign(id, by);
  if (!c) { const e = new Error('Campaign not found.'); e.status = 404; throw e; }
  if (!c.canEdit) { const e = new Error('Only the players in this campaign can change it.'); e.status = 403; throw e; }
  return c;
}
const save = (id, fields) => {
  const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE campaigns SET ${sets}, updated_at = ? WHERE id = ?`).run(...Object.values(fields).map((v) => (typeof v === 'object' ? JSON.stringify(v) : v)), Date.now(), Number(id));
};
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function updateCampaign(id, { name, kind, threatPenalty, players, bannerHeight, bannerPos, difficulty, chaosBag }, by) {
  const c = mustEdit(id, by);
  const fields = {};
  if (difficulty !== undefined || chaosBag !== undefined) {
    const a = { ...(c.arkham || {}) };
    if (difficulty !== undefined) a.difficulty = ['easy', 'standard', 'hard', 'expert'].includes(difficulty) ? difficulty : 'standard';
    if (chaosBag !== undefined) a.chaosBag = (Array.isArray(chaosBag) ? chaosBag : []).map(String).filter((t) => ARKHAM_TOKENS.includes(t)).slice(0, 80);
    fields.arkham = a;
  }
  if (name !== undefined) fields.name = String(name).trim().slice(0, 120) || c.name;
  if (kind !== undefined) fields.kind = kind || null;
  if (threatPenalty !== undefined) fields.threat_penalty = Math.max(0, Math.round(Number(threatPenalty) || 0));
  if (bannerHeight !== undefined) fields.banner_height = Math.max(60, Math.min(600, Math.round(Number(bannerHeight) || 180)));
  if (bannerPos !== undefined) fields.banner_pos = Math.max(0, Math.min(100, Math.round(Number(bannerPos) || 0)));
  if (players !== undefined) {
    fields.players = players.map((p) => {
      const fallen = Array.isArray(p.fallen) ? p.fallen.map(String) : [];
      // fallenIn: hero code -> the scenario they fell in (so only that chapter tells of it)
      const was = c.players.find((x) => x.email === lc(p.email))?.fallenIn || {};
      const given = p.fallenIn && typeof p.fallenIn === 'object' ? p.fallenIn : {};
      const fallenIn = Object.fromEntries(fallen.map((h) => [h, String(given[h] ?? was[h] ?? '').slice(0, 120) || null]));
      // Arkham investigators also carry trauma, experience (bonus beyond the scenarios', and spent) and fate
      const num = (v, d = 0) => Math.max(0, Math.min(99, Math.round(Number(v ?? d) || 0)));
      const was2 = c.players.find((x) => x.email === lc(p.email)) || {};
      const arkham = c.game === 'ahlcg' ? {
        physical: num(p.physical, was2.physical), mental: num(p.mental, was2.mental),
        xpBonus: Math.round(Number(p.xpBonus ?? was2.xpBonus ?? 0) || 0), xpSpent: num(p.xpSpent, was2.xpSpent),
        status: ['active', 'killed', 'insane'].includes(p.status) ? p.status : (was2.status || 'active'),
      } : {};
      return { email: lc(p.email), deckId: p.deckId ? Number(p.deckId) : null, fallen, fallenIn, ...arkham };
    });
  }
  if (Object.keys(fields).length) save(id, fields);
  if (fields.players) syncEpitaphs(c.id, c.players, fields.players);
  return getCampaign(id, by);
}
// Deleting takes every player: each clicks Delete (and can take it back); the campaign goes when the
// last one does. A campaign with one player is deleted straight away.
export function voteDelete(id, by, vote = true) {
  const c = mustEdit(id, by);
  const me = lc(by);
  const votes = new Set(c.deleteVotes.map((v) => v.email));
  if (vote) votes.add(me); else votes.delete(me);
  const players = c.players.map((p) => p.email);
  if (vote && players.every((e) => votes.has(e))) {
    const f = bannerFile(id);
    if (f) { try { fs.unlinkSync(f); } catch (_) { /* gone already */ } }
    db.prepare('DELETE FROM campaigns WHERE id = ?').run(Number(id));
    return { deleted: true };
  }
  save(id, { delete_votes: [...votes] });
  return { deleted: false, campaign: getCampaign(id, by) };
}
export function deleteCampaign(id, by) {
  const c = getCampaign(id, by);
  if (!c) return false;
  if (c.createdBy !== lc(by) && lc(by) !== OWNER) { const e = new Error('Only whoever started the campaign can delete it.'); e.status = 403; throw e; }
  return db.prepare('DELETE FROM campaigns WHERE id = ?').run(Number(id)).changes > 0;
}

// Scenario results: { id, scenarioId, name, result: won|lost, difficulty, score, date, notes }
export function saveScenario(id, entry, by) {
  const c = mustEdit(id, by);
  const e = {
    id: entry.id || newId(), scenarioId: entry.scenarioId ? Number(entry.scenarioId) : null, name: String(entry.name || '').slice(0, 120),
    result: entry.result === 'lost' ? 'lost' : 'won', difficulty: ['easy', 'normal', 'nightmare'].includes(entry.difficulty) ? entry.difficulty : 'normal',
    score: entry.score === '' || entry.score === null || entry.score === undefined ? null : Math.round(Number(entry.score)),
    date: /^\d{4}-\d{2}-\d{2}$/.test(entry.date || '') ? entry.date : new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }),
    // time of play (HH:MM, editable) - kept apart from the date so older plays and chronicle chapters are untouched
    time: /^\d{2}:\d{2}$/.test(entry.time || '') ? entry.time : null,
    // Arkham: the resolution reached (R1, R2... or none) and the experience it gave each investigator
    resolution: entry.resolution ? String(entry.resolution).slice(0, 40) : null,
    xp: entry.xp === '' || entry.xp === null || entry.xp === undefined ? null : Math.round(Number(entry.xp) || 0),
    loggedAt: entry.loggedAt || Date.now(),
    notes: String(entry.notes || '').slice(0, 2000), by: lc(by),
    // which deck each player used this time (kept even if the deck is later changed or deleted)
    decks: Array.isArray(entry.decks) ? entry.decks : c.players.filter((p) => p.deckId).map((p) => ({ email: p.email, name: p.name, deckId: p.deckId, deckName: p.deckName, heroes: p.deckHeroes })),
  };
  if (!e.name) throw new Error('Choose the scenario.');
  const list = c.scenarios.filter((s) => s.id !== e.id);
  list.push(e);
  list.sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`));
  save(id, { scenarios: list });
  return getCampaign(id, by);
}
export function removeScenario(id, entryId, by) {
  const c = mustEdit(id, by);
  save(id, { scenarios: c.scenarios.filter((s) => s.id !== entryId) });
  return getCampaign(id, by);
}

// Campaign cards: { id, code, name, kind, to: player email | 'encounter', hero, fromScenario, earnedAt, removed }
export function saveCampaignCard(id, entry, by) {
  const c = mustEdit(id, by);
  const e = {
    id: entry.id || newId(), code: String(entry.code || ''), name: String(entry.name || '').slice(0, 120), kind: ['boon', 'burden', 'campaign'].includes(entry.kind) ? entry.kind : 'campaign',
    to: entry.to === 'encounter' ? 'encounter' : lc(entry.to || by), hero: entry.hero || null, fromScenario: entry.fromScenario || null,
    earnedAt: entry.earnedAt || Date.now(), removed: Boolean(entry.removed), note: String(entry.note || '').slice(0, 300),
  };
  if (!e.name) throw new Error('Choose the campaign card.');
  const list = c.cards.filter((x) => x.id !== e.id);
  list.push(e);
  save(id, { cards: list });
  return getCampaign(id, by);
}
export function removeCampaignCard(id, entryId, by) {
  const c = mustEdit(id, by);
  save(id, { cards: c.cards.filter((x) => x.id !== entryId) });
  return getCampaign(id, by);
}

// Rule checks asked on this campaign (newest first, last 30), so every player sees the rulings.
export function saveRuleCheck(id, entry, by) {
  const c = getCampaign(id, by);
  const list = [{ id: newId(), by: lc(by), at: Date.now(), ...entry }, ...c.ruleChecks.map(({ byName, ...x }) => x)].slice(0, 30);
  save(id, { rule_checks: list });
  return getCampaign(id, by);
}

// Written notes: { id, by, at, text }
export function addNote(id, text, by) {
  const c = mustEdit(id, by);
  const t = String(text || '').trim();
  if (!t) throw new Error('The note is empty.');
  save(id, { notes: [{ id: newId(), by: lc(by), at: Date.now(), text: t.slice(0, 5000) }, ...c.notes.map(({ byName, ...n }) => n)] });
  return getCampaign(id, by);
}
export function removeNote(id, noteId, by) {
  const c = mustEdit(id, by);
  save(id, { notes: c.notes.filter((n) => n.id !== noteId).map(({ byName, ...n }) => n) });
  return getCampaign(id, by);
}

// Scenarios to pick from, in release order (from the deck builder's scenario list).
export const campaignScenarios = async (game, viewer) => (game === 'ahlcg'
  ? arkhamScenarios().map((s) => ({ id: s.id, name: s.name, pack: s.campaign || s.pack, community: false, owned: false }))
  : getScenarios(game, viewer));
export const campaignKinds = (game) => (game === 'ahlcg' ? ARKHAM_KINDS : CAMPAIGN_KINDS);

// ---- for Ims: the Campaign Manager in conversation ------------------------------------------------------
// A short line per campaign for his records snapshot, the full story of one for the getCampaigns tool,
// and any game played today or last night for the day report.
// The scenarios each campaign type is played with (RingsDB pack names) in play order - as on the page.
const KIND_SCENARIO_PACKS = {
  'The Lord of the Rings saga': ['The Black Riders', 'The Road Darkens', 'The Treason of Saruman', 'The Land of Shadow', 'The Flame of the West', 'The Mountain of Fire'],
  'The Hobbit saga': ['Over Hill and Under Hill', 'On the Doorstep'],
  'Revised Core Set campaign': ['Core Set'],
  'The Dark of Mirkwood campaign': ['The Dark of Mirkwood'],
  'Angmar Awakened campaign': ['The Lost Realm', 'The Wastes of Eriador', 'Escape from Mount Gram', 'Across the Ettenmoors', 'The Treachery of Rhudaur', 'The Battle of Carn Dûm', 'The Dread Realm'],
  'Dream-chaser campaign': ['The Grey Havens', 'Flight of the Stormcaller', 'The Thing in the Depths', 'Temple of the Deceived', 'The Drowned Ruins', 'A Storm on Cobas Haven', 'The City of Corsairs'],
  'Ered Mithrin campaign': ['The Wilds of Rhovanion', 'The Withered Heath', 'Roam Across Rhovanion', 'Fire in the Night', 'The Ghost of Framsburg', 'Mount Gundabad', 'The Fate of Wilderland'],
  'Haradrim campaign': ['The Sands of Harad', 'The Mûmakil', 'Race Across Harad', 'Beneath the Sands', 'The Black Serpent', 'The Dungeons of Cirith Gurat', 'The Crossings of Poros'],
  'Dwarrowdelf campaign': ['Khazad-dûm', 'The Redhorn Gate', 'Road to Rivendell', 'The Watcher in the Water', 'The Long Dark', 'Foundations of Stone', 'Shadow and Flame'],
  'Against the Shadow campaign': ['Heirs of Númenor', "The Steward's Fear", 'The Drúadan Forest', 'Encounter at Amon Dîn', 'Assault on Osgiliath', 'The Blood of Gondor', 'The Morgul Vale'],
  'The Ring-maker campaign': ['The Voice of Isengard', 'The Dunland Trap', 'The Three Trials', 'Trouble in Tharbad', 'The Nîn-in-Eilph', "Celebrimbor's Secret", 'The Antlered Crown'],
  'Vengeance of Mordor campaign': ['A Shadow in the East', 'Wrath and Ruin', 'The City of Ulfast', 'Challenge of the Wainriders', 'Under the Ash Mountains', 'The Land of Sorrow', 'The Fortress of Nurn'],
};
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'decks', f), 'utf8')); } catch { return d; } };
function imsLookups() {
  // each game's own card names (their codes overlap) and scenarios
  const look = (game) => {
    const cards = readJson(`${game}_cards.json`, {}).cards || [];
    const scen = game === 'ahlcg' ? arkhamScenarios().map((x) => ({ name: x.name, pack: x.campaign })) : (readJson('lotr_scenarios.json', {}).scenarios || []);
    return { name: Object.fromEntries(cards.map((x) => [x.code, x.name])), scen };
  };
  return { lotr: look('lotr'), ahlcg: look('ahlcg') };
}
const GAME_NAMES = { lotr: 'Lord of the Rings LCG', ahlcg: 'Arkham Horror LCG' };
function campaignRoute(c, scen) {
  if (c.game === 'ahlcg') return scen.filter((x) => x.pack === c.kind).map((x) => x.name);
  const packs = KIND_SCENARIO_PACKS[c.kind];
  if (!packs) return [...new Set(c.scenarios.map((s) => s.name))];
  return scen.filter((x) => packs.includes(x.pack)).sort((a, b) => packs.indexOf(a.pack) - packs.indexOf(b.pack)).map((x) => x.name);
}
function imsView(c, LL) {
  const L = LL[c.game] || LL.lotr;
  const hero = (code) => L.name[code] || code;
  const route = campaignRoute(c, L.scen);
  const won = new Set(c.scenarios.filter((s) => s.result === 'won').map((s) => s.name));
  const chron = parse(db.prepare('SELECT chronicle FROM campaigns WHERE id = ?').get(c.id)?.chronicle, {});
  const order = [...new Set([...c.scenarios].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((s) => s.name))];
  return {
    c, route, hero, chron, order,
    wonOnRoute: route.filter((n) => won.has(n)).length,
    next: route.find((n) => !won.has(n)) || null,
    complete: route.length > 0 && route.every((n) => won.has(n)),
    players: c.players.map((p) => ({ name: p.name, deck: p.deckName, heroes: (p.deckHeroes || []).map(hero), fallen: (p.fallen || []).map(hero),
      ...(c.game === 'ahlcg' ? { investigatorFate: p.status || 'active', physicalTrauma: p.physical || 0, mentalTrauma: p.mental || 0, xpEarned: c.scenarios.filter((s) => (s.decks || []).some((d) => d.email === p.email)).reduce((n, s) => n + (Number(s.xp) || 0), 0) + (p.xpBonus || 0), xpSpent: p.xpSpent || 0 } : {}) })),
    boons: c.cards.filter((x) => x.kind === 'boon' && !x.removed), burdens: c.cards.filter((x) => x.kind === 'burden' && !x.removed),
  };
}
const who = (c, to) => (to === 'encounter' ? 'the encounter deck' : `${c.players.find((p) => p.email === to)?.name || to}'s deck`);

// One line per campaign, for Ims's records snapshot.
export function describeCampaignsForIms() {
  const rows = db.prepare("SELECT id FROM campaigns WHERE game IN ('lotr', 'ahlcg') ORDER BY updated_at DESC").all();
  if (!rows.length) return 'none yet';
  const L = imsLookups();
  return rows.map(({ id }) => {
    const v = imsView(getCampaign(id, OWNER), L);
    const { c } = v;
    const last = [...c.scenarios].sort((a, b) => String(a.date).localeCompare(String(b.date))).pop();
    const lastCh = last && v.chron[last.name];
    return `${GAME_NAMES[c.game] || ''}: "${c.name}" (${c.kind || 'custom campaign'}${c.game === 'ahlcg' ? `, ${c.arkham?.difficulty || 'standard'}` : ''}) - ${v.players.map((p) => `${p.name} playing ${p.deck ? `"${p.deck}"` : 'no deck chosen'}${p.heroes.length ? ` with ${p.heroes.join(', ')}` : ''}${p.fallen.length ? ` (${c.game === 'ahlcg' ? `${p.investigatorFate}` : `fallen: ${p.fallen.join(', ')}`})` : ''}${c.game === 'ahlcg' ? ` [trauma ${p.physicalTrauma} physical / ${p.mentalTrauma} mental, ${p.xpEarned - p.xpSpent} XP unspent]` : ''}`).join('; ')}. ` +
      (v.route.length ? `${v.wonOnRoute} of ${v.route.length} scenarios won${v.complete ? ' - CAMPAIGN COMPLETE' : v.next ? `, next up "${v.next}"` : ''}` : `${c.scenarios.length} played`) +
      `${last ? `; last played "${last.name}" on ${last.date} (${last.result})` : ''}; ${v.boons.length} boon${v.boons.length === 1 ? '' : 's'}, ${v.burdens.length} burden${v.burdens.length === 1 ? '' : 's'}, score ${c.totalScore}${c.threatPenalty ? `, threat penalty ${c.threatPenalty}` : ''}` +
      `${v.order.length ? `; the chronicle has ${v.order.filter((n) => v.chron[n]).length} chapter${v.order.filter((n) => v.chron[n]).length === 1 ? '' : 's'}${lastCh ? ` - latest "${lastCh.title}": ${lastCh.summary}` : ''}` : ''}`;
  }).join(' | ');
}

// Everything about one campaign (or all of them), for the getCampaigns tool.
export function campaignsForIms({ name = '', chronicle = false } = {}) {
  const L = imsLookups();
  const q = String(name || '').toLowerCase().trim();
  const rows = db.prepare("SELECT id, name FROM campaigns WHERE game IN ('lotr', 'ahlcg') ORDER BY updated_at DESC").all()
    .filter((r) => !q || r.name.toLowerCase().includes(q) || q.includes(r.name.toLowerCase()));
  return rows.map(({ id }) => {
    const v = imsView(getCampaign(id, OWNER), L);
    const { c } = v;
    return {
      game: GAME_NAMES[c.game] || c.game, name: c.name, kind: c.kind, page: `/campaigns/${c.game}/${c.id}`,
      ...(c.game === 'ahlcg' ? { difficulty: c.arkham?.difficulty || 'standard', chaosBag: (c.arkham?.chaosBag || []).join(' '), campaignLog: (c.arkham?.log || []).map((e) => `[${e.section}] ${e.text}${e.crossed ? ' (crossed out)' : ''}`) } : {}),
      players: v.players,
      progress: v.route.length ? { won: v.wonOnRoute, of: v.route.length, next: v.next, complete: v.complete, scenariosInOrder: v.route } : null,
      plays: [...c.scenarios].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((s) => ({
        date: s.date, time: s.time || null, scenario: s.name, result: s.result, difficulty: s.difficulty, score: s.score, ...(c.game === 'ahlcg' ? { resolution: s.resolution || null, xp: s.xp ?? null } : {}),
        notableMoments: s.notes || null, heroes: (s.decks || []).map((d) => `${d.name}: ${(d.heroes || []).map(v.hero).join(', ') || d.deckName}`),
      })),
      campaignScore: c.totalScore, threatPenalty: c.threatPenalty,
      boons: v.boons.map((x) => `${x.name} (${who(c, x.to)}${x.fromScenario ? `, from ${x.fromScenario}` : ''})`),
      burdens: v.burdens.map((x) => `${x.name} (${who(c, x.to)}${x.fromScenario ? `, from ${x.fromScenario}` : ''})`),
      notes: c.notes.slice(0, 10).map((n) => `${n.byName}: ${n.text.slice(0, 300)}`),
      ruleChecks: c.ruleChecks.slice(0, 5).map((r) => `Q: ${r.question} - A: ${String(r.answer || '').slice(0, 300)}`),
      chronicle: v.order.filter((n) => v.chron[n]).map((n, i) => ({
        chapter: i + 1, scenario: n, title: v.chron[n].title, summary: v.chron[n].summary,
        ...(chronicle ? { text: v.chron[n].paragraphs.join('\n\n') } : {}),
      })),
      tale: c.epilogue?.story ? { title: c.epilogue.title, ...(chronicle ? { text: c.epilogue.story } : {}) } : null,
    };
  });
}

// Games played today or last night (plays are logged by date), for a line in the day report.
export function recentCampaignGames() {
  const tz = 'Europe/London';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: tz });
  const L = imsLookups();
  const out = [];
  for (const { id } of db.prepare("SELECT id FROM campaigns WHERE game IN ('lotr', 'ahlcg') ORDER BY updated_at DESC").all()) {
    const v = imsView(getCampaign(id, OWNER), L);
    for (const s of v.c.scenarios.filter((x) => x.date === today || x.date === yesterday)) {
      const ch = v.chron[s.name];
      const when = s.date === today ? (s.time && s.time < '05:00' ? 'last night' : 'today') : (!s.time || s.time >= '17:00' ? 'last night' : 'yesterday');
      out.push(`${GAME_NAMES[v.c.game] || ''} "${v.c.name}" campaign: ${when}${s.time ? ` (${s.time})` : ''} they ${s.result === 'won' ? 'beat' : 'lost to'} "${s.name}"${s.resolution ? ` (${s.resolution})` : ''}` +
        `${s.decks?.length ? ` (${s.decks.map((d) => d.name).join(' and ')})` : ''}${s.notes ? `; notable moments: ${s.notes}` : ''}` +
        `${v.complete ? '; that finished the campaign' : v.next ? `; next up "${v.next}"` : ''}` +
        `${ch ? `; the chronicle chapter "${ch.title}" says: ${ch.summary}` : ''}`);
    }
  }
  return out;
}

// ---- the tale of the campaign ------------------------------------------------------------------------------
// When a campaign is complete, a short made-up story of it: each scenario's own story (from its FFG
// rulesheet where indexed, else the map's lore note) told with the heroes the players actually used,
// the losses before each win, the boons and burdens, the notes they kept - and any heroes who fell.
try { db.exec('ALTER TABLE campaigns ADD COLUMN epilogue TEXT'); } catch (_) { /* already there */ }
const writing = new Set();

export function epilogueStatus(id) {
  const r = db.prepare('SELECT epilogue FROM campaigns WHERE id = ?').get(Number(id));
  return { writing: writing.has(Number(id)), epilogue: r?.epilogue ? parse(r.epilogue, null) : null };
}

export function startEpilogue(id, by) {
  const c = mustEdit(id, by);
  if (c.epilogue?.locked) { const e = new Error('The tale is locked - unlock it first.'); e.status = 409; throw e; }
  if (writing.has(c.id)) return epilogueStatus(c.id);
  writing.add(c.id);
  (async () => {
    try {
      const data = await getCardData(c.game || 'lotr');
      const hero = (code) => { const h = data.byCode[code]; return h ? `${h.name} (${String(h.traits || '').replace(/\.\s*/g, ', ').replace(/,\s*$/, '')})` : code; };
      const lore = (name) => { try { return db.prepare('SELECT place, lore FROM scenario_lore WHERE name = ?').get(name); } catch { return null; } };
      let sheetText = async () => '';
      try {
        const { booksFor } = await import('./decks/rulebooks.js');
        const { generateQueryEmbedding } = await import('./embeddingService.js');
        const { searchSimilar } = await import('./vectorStore.js');
        const sheets = booksFor(c.kind, null, c.game).filter((b) => !/Learn to Play|Rules Reference|FAQ|Easy Mode|Campaign Log/i.test(b.filename));
        if (sheets.length) sheetText = async (name) => (await searchSimilar(await generateQueryEmbedding(`${name} story`), [], 2, true, sheets.map((b) => b.drive_file_id))).map((h) => String(h.text || '').slice(0, 600)).join(' ');
      } catch (_) { /* no rulebooks yet */ }
      const byName = [];
      for (const s of c.scenarios) {
        let e = byName.find((x) => x.name === s.name);
        if (!e) byName.push(e = { name: s.name, plays: [] });
        e.plays.push(s);
      }
      // tell it in the order the scenarios were won (not first attempted)
      const winDate = (e) => e.plays.find((p) => p.result === 'won')?.date || '9999';
      byName.sort((a, b) => String(winDate(a)).localeCompare(String(winDate(b))));
      const chapters = [];
      for (const e of byName) {
        const won = e.plays.find((p) => p.result === 'won');
        const losses = e.plays.filter((p) => p.result === 'lost').length;
        const teams = (won || e.plays[e.plays.length - 1]).decks || [];
        const l = lore(e.name);
        const story = (await sheetText(e.name).catch(() => '')) || l?.lore || '';
        chapters.push(`- ${e.name}${l?.place ? ` (${l.place})` : ''}: ${won ? `won${losses ? ` after ${losses} defeat${losses === 1 ? '' : 's'}` : ''}` : 'not won'}. Heroes: ${teams.map((t) => (t.heroes || []).map(hero).join(', ')).filter(Boolean).join('; ') || 'not recorded'}.${e.plays.map((p) => p.notes).filter(Boolean).map((n) => ` Their notes: "${n}".`).join('')}${story ? ` The scenario's story: ${story.replace(/\s+/g, ' ').slice(0, 700)}` : ''}`);
      }
      const fallen = c.players.flatMap((p) => (p.fallen || []).map((f) => hero(f)));
      const boons = c.cards.filter((x) => x.kind === 'boon').map((x) => `${x.name}${x.fromScenario ? ` from ${x.fromScenario}` : ''}`);
      const burdens = c.cards.filter((x) => x.kind === 'burden').map((x) => `${x.name}${x.fromScenario ? ` from ${x.fromScenario}` : ''}`);
      const prompt = c.game === 'ahlcg' ? `Write the closing account of the whole affair of ${arkhamLead(c)}, now at its end.
${ARKHAM_VOICE} Tell it as a short story. Follow each part of the affair in turn, but it is THESE investigators who lived it: use the named investigators, their deeds and their losses. ${fallen.length ? 'Those lost - killed, or driven mad - must be remembered: tell what became of them.' : 'None of them was lost - make something of that, and of what it cost them anyway.'} End on what they won, and what they can never unknow.
Five to seven short paragraphs, 320-480 words in all.

THE AFFAIR, in order:
${chapters.join('\n')}
${fallen.length ? `\nTHE LOST: ${fallen.join(', ')}` : ''}` : `Write the tale of a fellowship's whole journey through Middle-earth${c.kind ? ` (the tale of ${c.kind.replace(/\s*(saga|campaign|cycle)$/i, '')})` : ''}, now ended in victory.
Write it as J.R.R. Tolkien wrote The Lord of the Rings - his cadence, diction and gravity - told wholly from within Middle-earth, as if found in the Red Book of Westmarch. Nothing from our world may appear: no real dates or years (mark time only in Middle-earth fashion - seasons, moons, the turning of the year), no real people's names, no nicknames, no game terms (no \"threat\", \"cards\", \"decks\", \"rounds\", \"scenario\", \"players\", \"campaign\"). Only the heroes, peoples and places of Middle-earth. The heroes' traits in brackets say what they are - keep to them (a Dwarf is a Dwarf). Tell it as a short story, past tense. Follow each scenario's own story, but it is THESE heroes who lived it: use the named heroes, their deeds and their company. Losses before a win are hard-won struggles; boons are gifts or treasures gained; burdens are wounds and shadows carried. ${fallen.length ? 'Heroes who fell must be honoured - tell how they fell and are remembered.' : 'No hero fell - make something of that.'}
Five to seven short paragraphs, 320-480 words in all, ending on the victory. Tell the scenarios in the order listed.

THE CAMPAIGN, in order:
${chapters.join('\n')}
${fallen.length ? `\nFALLEN HEROES: ${fallen.join(', ')}` : ''}
${boons.length ? `\nBOONS GAINED: ${boons.join(', ')}` : ''}
${burdens.length ? `\nBURDENS CARRIED: ${burdens.join(', ')}` : ''}
${c.threatPenalty ? `\nThey ended the journey heavily wearied.` : ''}`;
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const config = (await import('../config.js')).default;
      const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: 'application/json', temperature: 0.9, responseSchema: { type: 'OBJECT', properties: { title: { type: 'STRING' }, paragraphs: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['title', 'paragraphs'] } },
      });
      const out = await inWorld(model, prompt, c);
      save(c.id, { epilogue: { title: String(out.title || '').slice(0, 140), story: (out.paragraphs || []).map((x) => String(x).trim()).filter(Boolean).join(String.fromCharCode(10, 10)).slice(0, 6000), at: Date.now(), by: lc(by) } });
      prepareReadings(c.id);
    } catch (err) {
      console.error(`[Campaigns] Tale for campaign #${id} failed:`, err.message);
      save(Number(id), { epilogue: { error: err.message.slice(0, 200), at: Date.now() } });
    } finally { writing.delete(Number(id)); }
  })();
  return epilogueStatus(c.id);
}

// ---- the chronicle: a chapter for each scenario, written as the campaign is played -----------------------
// One chapter per scenario (all its plays together), in the order first played. A chapter is written
// when its scenario is first logged and rewritten whenever what happened there changes - another play,
// new notes or notable moments, campaign cards earned there. The story comes from the scenario's
// rulesheet where indexed (else the map's lore note), told through the players' decks and heroes. Each
// chapter also has a one-line summary, shown in the scenario's pop-up on the map.
try { db.exec("ALTER TABLE campaigns ADD COLUMN chronicle TEXT NOT NULL DEFAULT '{}'"); } catch (_) { /* already there */ }
const chronicling = new Set();

function chronicleOf(id) {
  const r = db.prepare('SELECT chronicle FROM campaigns WHERE id = ?').get(Number(id));
  return r ? parse(r.chronicle, {}) : {};
}
function scenarioOrder(c) {
  const order = [];
  for (const s of [...c.scenarios].sort((a, b) => String(a.date).localeCompare(String(b.date)))) if (!order.includes(s.name)) order.push(s.name);
  return order;
}
// Everything a chapter is written from - if this changes, the chapter is rewritten.
function chapterKey(c, name) {
  const plays = c.scenarios.filter((s) => s.name === name).map((p) => [p.date, p.result, p.difficulty, p.score, p.notes, (p.decks || []).map((d) => d.deckId).join(',')]);
  const cards = c.cards.filter((x) => x.fromScenario === name).map((x) => [x.name, x.kind, x.to, x.removed]);
  const fallen = c.players.map((p) => (p.fallen || []).filter((h) => (p.fallenIn || {})[h] === name).join(','));
  return JSON.stringify([plays, cards, fallen]);
}
export function chronicleStatus(id, by) {
  const c = getCampaign(id, by);
  if (!c) return null;
  const chapters = chronicleOf(id);
  const order = scenarioOrder(c);
  // A chapter someone has edited by hand is never rewritten on its own - if what happened there changes
  // afterwards it's only flagged (outdated), and rewriting it is their call.
  const changed = (n) => chapters[n].key !== chapterKey(c, n);
  // A locked chapter is left exactly as it is - no rewrites and no nagging.
  const stale = order.filter((n) => !chapters[n] || (changed(n) && !chapters[n].edited && !chapters[n].locked));
  const outdated = order.filter((n) => chapters[n]?.edited && !chapters[n].locked && changed(n));
  return { writing: chronicling.has(c.id), order, chapters, stale, outdated, art: artUrls(c, chapters, order), artBrief: artBriefs(c, chapters, order), fallen: rollOfTheFallen(c) };
}

async function writeChapter(c, name, previous) {
  const data = await getCardData(c.game || 'lotr');
  // name plus what the hero is ("Thalin (Dwarf, Warrior)") so the chronicler doesn't guess
  const hero = (code) => { const h = data.byCode[code]; return h ? `${h.name} (${String(h.traits || '').replace(/\.\s*/g, ', ').replace(/,\s*$/, '')})` : code; };
  const plays = c.scenarios.filter((s) => s.name === name).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let story = '';
  try {
    const { booksFor } = await import('./decks/rulebooks.js');
    const sheets = booksFor(c.kind, null, c.game).filter((b) => !/Learn to Play|Rules Reference|FAQ|Easy Mode|Campaign Log/i.test(b.filename));
    if (sheets.length) {
      const { generateQueryEmbedding } = await import('./embeddingService.js');
      const { searchSimilar } = await import('./vectorStore.js');
      story = (await searchSimilar(await generateQueryEmbedding(`${name} story`), [], 3, true, sheets.map((b) => b.drive_file_id))).map((h) => String(h.text || '').slice(0, 700)).join(' ');
    }
  } catch (_) { /* no rulebooks yet */ }
  let place = '';
  try { const l = db.prepare('SELECT place, lore FROM scenario_lore WHERE name = ?').get(name); place = l?.place || ''; if (!story) story = l?.lore || ''; } catch (_) { /* none */ }
  const cards = c.cards.filter((x) => x.fromScenario === name);
  // Players are never named to the model - a company is known only by its heroes.
  const company = (email) => { const p = c.players.find((x) => x.email === email); const hs = (p?.deckHeroes || []).map((h) => data.byCode[h]?.name).filter(Boolean); return hs.length ? `the company of ${hs.join(', ')}` : 'one of the companies'; };
  const fellHere = c.players.flatMap((p) => (p.fallen || []).filter((f) => (p.fallenIn || {})[f] === name).map((f) => hero(f)));
  const fellBefore = c.players.flatMap((p) => (p.fallen || []).filter((f) => (p.fallenIn || {})[f] !== name).map((f) => hero(f)));
  const arkham = c.game === 'ahlcg';
  const prompt = arkham ? `You keep the case files of ${arkhamLead(c)}. Write ONE entry of the case file: what happened in the affair of "${name}"${place ? ` (${place})` : ''}.
Voice: ${ARKHAM_VOICE} Follow what happened there, but it is THESE investigators who lived it - name them and give them deeds, doubts and dreadful discoveries.
${plays.length > 1 ? 'Every attempt belongs in the entry: failures are real, costly setbacks.' : ''}
Their notes and notable moments are true events - weave every one of them in.
Length: 3-4 paragraphs, 150-230 words. Also give: a short, pulpy, noir case-file heading (not the scenario name word for word, and never starting with "Case File" - the page says that already), and a one-sentence summary (under 30 words) in the voice of a scribbled margin note.

WHAT HAPPENED (in order):
${plays.map((p, i) => `- Attempt ${i + 1}: ${p.result === 'won' ? 'they came through it' : 'it went badly for them'}${p.resolution ? ` (the ending the files record: ${p.resolution})` : ''}. Investigators: ${(p.decks || []).map((d) => (d.heroes || []).map(hero).join(', ')).filter(Boolean).join('; ') || 'not recorded'}.${p.notes ? ` Notable moments: "${p.notes}".` : ''}`).join('\n')}
${fellHere.length ? `INVESTIGATORS LOST HERE - killed or driven insane; tell of it: ${fellHere.join(', ')}` : ''}${fellBefore.length ? `\nINVESTIGATORS LOST EARLIER (no longer with them; remembered only if it fits): ${fellBefore.join(', ')}` : ''}
${story ? `WHAT THE FILES SAY OF IT: ${story.replace(/\s+/g, ' ').slice(0, 1400)}` : ''}
${previous ? `THE PREVIOUS ENTRY ENDED: ${previous.slice(-400)}` : 'This is the first entry - open the case file.'}` : `You are the chronicler of a fellowship's journey through Middle-earth${c.kind ? ` (the tale of ${c.kind.replace(/\s*(saga|campaign|cycle)$/i, '')})` : ''}. Write ONE chapter of the chronicle: the part of the journey at "${name}"${place ? ` (${place})` : ''}.
Voice: Write it as J.R.R. Tolkien wrote The Lord of the Rings - his cadence, diction and gravity - told wholly from within Middle-earth, as if found in the Red Book of Westmarch. Nothing from our world may appear: no real dates or years (mark time only in Middle-earth fashion - seasons, moons, the turning of the year), no real people's names, no nicknames, no game terms (no \"threat\", \"cards\", \"decks\", \"rounds\", \"scenario\", \"players\", \"campaign\"). Only the heroes, peoples and places of Middle-earth. The heroes' traits in brackets say what they are - keep to them (a Dwarf is a Dwarf). Past tense. Follow the story of that place and deed, but it is THESE heroes who lived it - name them and give them deeds.
${plays.length > 1 ? 'Every attempt belongs in the chapter: defeats are real setbacks, and the victory (if there was one) is hard won.' : ''}
Their notes and notable moments are true events - weave every one of them in.
Length: 3-4 paragraphs, 150-230 words. Also give: a short evocative chapter title (not the scenario name word for word), and a one-sentence summary (under 30 words) of what befell the heroes here.

WHAT HAPPENED (in order):
${plays.map((p, i) => `- Attempt ${i + 1}: ${p.result === 'won' ? 'VICTORY' : 'DEFEAT'}${p.difficulty === 'nightmare' ? ', against a darker, more terrible foe' : p.difficulty === 'easy' ? '' : ''}. Companies: ${(p.decks || []).map((d, j) => `company ${j + 1}: ${(d.heroes || []).map(hero).join(', ') || 'unnamed heroes'}`).join('; ') || 'not recorded'}.${p.notes ? ` Notable moments: "${p.notes}".` : ''}`).join('\n')}
${cards.length ? `GAINED OR BURDENED HERE: ${cards.map((x) => `${x.name} (${x.kind === 'boon' ? 'a gift' : x.kind === 'burden' ? 'a burden' : 'a campaign card'}, to ${x.to === 'encounter' ? 'the shadow' : company(x.to)})${x.note ? ` - ${x.note}` : ''}`).join(', ')}` : ''}
${fellHere.length ? `HEROES WHO FELL HERE - tell of their fall; it is a grievous loss to the company: ${fellHere.join(', ')}` : ''}${fellBefore.length ? `\nHEROES WHO FELL ELSEWHERE on the journey (no longer with the company; remember them only if it fits): ${fellBefore.join(', ')}` : ''}
${story ? `THE SCENARIO'S STORY: ${story.replace(/\s+/g, ' ').slice(0, 1400)}` : ''}
${previous ? `THE PREVIOUS CHAPTER ENDED: ${previous.slice(-400)}` : 'This is the first chapter - open the chronicle.'}`;
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const config = (await import('../config.js')).default;
  const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.85, responseSchema: { type: 'OBJECT', properties: { title: { type: 'STRING' }, summary: { type: 'STRING' }, paragraphs: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['title', 'summary', 'paragraphs'] } },
  });
  const out = await inWorld(model, prompt, c);
  return {
    title: String(out.title || name).replace(/^\s*case\s*file\s*(no\.?\s*\d+)?\s*[:\-–—]\s*/i, '').slice(0, 120), summary: String(out.summary || '').slice(0, 300),
    paragraphs: (out.paragraphs || []).map((x) => String(x).trim()).filter(Boolean).slice(0, 6),
    plays: plays.length, won: plays.some((p) => p.result === 'won'), key: chapterKey(c, name), at: Date.now(),
  };
}


// ---- how each game's chronicle is told ----------------------------------------------------------------------
// Lord of the Rings: as Tolkien told it, wholly within Middle-earth. Arkham Horror: the investigators' case
// notes, typed up by a Miskatonic archivist - 1920s noir steeped in Lovecraft's cosmic dread.
const ARKHAM_VOICE = `Write it as the investigators' own case notes, typed up at night on a battered typewriter by a weary Miskatonic University archivist who pieced the affair together from their journals, police reports and clippings - the Roaring Twenties, New England, gritty hard-boiled noir detective prose steeped in H.P. Lovecraft's Cthulhu Mythos: clipped sentences, rain and cigarette smoke, bootleg gin, and beneath it all a mounting, bleak cosmic dread and minds beginning to fray. Nothing from outside that world may appear: no modern or later dates (the 1920s are right), no real people's names, no nicknames, no game terms (no "chaos bag", "tokens", "cards", "decks", "act", "agenda", "resolution", "XP", "experience", "trauma", "doom", "scenario", "players", "campaign"). The investigators' callings in brackets say who they are - keep to them, but never copy the brackets or the list of callings into the prose (write "Roland Banks", not "Roland Banks (Agency, Detective)"). Past tense.`;
const arkhamLead = (c) => `a band of investigators in 1920s New England${c.kind && c.kind !== 'Custom / mixed' ? ` - the affair the files call "${c.kind}"` : ''}`;

// Nothing from our world may leak into the chronicle - no players' names, no campaign nickname, no years.
// Asks again (up to twice more) if one slips through.
async function inWorld(model, prompt, c) {
  const names = [...c.players.flatMap((p) => String(p.name || '').split(/\s+/)), ...String(c.name || '').split(/\s+/)]
    .map((w) => w.replace(/[^\p{L}']/gu, '')).filter((w) => w.length > 3 && !/^(the|and|with|from|before|after)$/i.test(w));
  const leak = (t) => (c.game === 'ahlcg' ? /\b20\d\d\b/ : /\b(1[89]|20)\d\d\b/).test(t) || names.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(t));
  let out;
  for (let i = 0; i < 3; i++) {
    out = JSON.parse((await model.generateContent(prompt)).response.text());
    if (!leak(JSON.stringify(out))) return out;
  }
  return out;
}

// Write any chapters that are missing or out of date, one at a time, saving as each is done.
export function writeChronicle(id, by) {
  const st = chronicleStatus(id, by);
  if (!st) throw new Error('Campaign not found.');
  if (st.writing || !st.stale.length) return st;
  const cid = Number(id);
  chronicling.add(cid);
  (async () => {
    try {
      for (const name of st.stale) {
        const c = getCampaign(cid, by);
        const chapters = chronicleOf(cid);
        const idx = st.order.indexOf(name);
        const prevName = st.order[idx - 1];
        const previous = prevName && chapters[prevName] ? chapters[prevName].paragraphs.join(' ') : '';
        try {
          chapters[name] = await writeChapter(c, name, previous);
          save(cid, { chronicle: chapters });
        } catch (err) { console.warn(`[Campaigns] Chapter "${name}" failed: ${err.message}`); }
      }
    } finally { chronicling.delete(cid); prepareReadings(cid); }
  })();
  return { ...st, writing: true };
}

// ---- editing the chronicle by hand, and rewriting a chapter afresh -----------------------------------------
// name is the scenario's name, or '__tale' for the tale of the whole campaign (the book's last chapter).
export function editChapter(id, name, { title, summary, paragraphs }, by) {
  const c = mustEdit(id, by);
  mustBeUnlocked(c, name);
  const paras = (Array.isArray(paragraphs) ? paragraphs : String(paragraphs || '').split(/\n\s*\n/))
    .map((x) => String(x).trim()).filter(Boolean).slice(0, 30);
  if (!paras.length) throw new Error('The chapter is empty.');
  if (name === '__tale') {
    save(c.id, { epilogue: { ...(c.epilogue || {}), title: String(title || '').trim().slice(0, 140), story: paras.join('\n\n').slice(0, 12000), edited: true, by: lc(by), at: Date.now() } });
    prepareReadings(c.id);
    return chronicleStatus(id, by);
  }
  const chapters = chronicleOf(id);
  if (!chapters[name]) { const e = new Error('That chapter isn\'t written yet.'); e.status = 404; throw e; }
  chapters[name] = {
    ...chapters[name], title: String(title || chapters[name].title).trim().slice(0, 120), summary: String(summary ?? chapters[name].summary).trim().slice(0, 300),
    paragraphs: paras.map((x) => x.slice(0, 4000)), edited: true, editedBy: lc(by), key: chapterKey(c, name), at: Date.now(),
  };
  save(c.id, { chronicle: chapters });
  prepareReadings(c.id);
  return chronicleStatus(id, by);
}
export function rewriteChapter(id, name, by) {
  const c = mustEdit(id, by);
  mustBeUnlocked(c, name);
  if (name === '__tale') { startEpilogue(id, by); return { ...chronicleStatus(id, by), taleWriting: true }; }
  const chapters = chronicleOf(id);
  delete chapters[name];
  save(c.id, { chronicle: chapters });
  return writeChronicle(id, by);
}

// What the narrator reads for a chapter: "Chapter One. <title>." then its paragraphs.
const NUMBER_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
export function chapterForReading(id, name, by) {
  const c = getCampaign(id, by);
  if (!c) { const e = new Error('Campaign not found.'); e.status = 404; throw e; }
  if (name === '__intro') {
    const heroes = [...new Set((c.players || []).flatMap((p) => p.deckHeroes || []))].map((h) => heroName(h, c.game)).filter(Boolean);
    if (c.game === 'ahlcg') {
      const paragraphs = [`Case File: ${c.name}`];
      if (c.kind) paragraphs.push(`Re: ${c.kind}`);
      paragraphs.push('Confidential.');
      if (heroes.length > 0) paragraphs.push(`Investigators: ${heroes.join(', ')} - God help them.`);
      paragraphs.push("Compiled from the investigators' own notes, police reports and newspaper clippings. Not for circulation.");
      return {
        heading: 'Miskatonic University. Orne Library, Special Collections',
        paragraphs,
        take: c.introTake || 0,
        game: c.game,
      };
    }
    const paragraphs = [];
    const kind = (c.kind || '').replace(/\s*(saga|campaign|cycle)$/i, '');
    if (kind) paragraphs.push(`Being a tale of ${kind}.`);
    if (heroes.length > 0) {
      const heroList = heroes.length > 1
        ? `${heroes.slice(0, -1).join(', ')} and ${heroes[heroes.length - 1]}`
        : heroes[0];
      paragraphs.push(`As it befell ${heroList}, and those who walked with them.`);
    }
    paragraphs.push('Set down by the chronicler, from the telling of those who were there.');
    return {
      heading: `Here beginneth the Chronicle of ${c.name}`,
      paragraphs,
      take: c.introTake || 0,
      game: c.game,
    };
  }
  if (name === '__fallen') {
    const roll = rollOfTheFallen(c);
    if (!roll.length) { const e = new Error('No hero has fallen.'); e.status = 404; throw e; }
    return c.game === 'ahlcg'
      ? { heading: 'The Lost. Investigators taken by death or madness', paragraphs: roll.map(rollLine), take: 0, game: c.game }
      : { heading: 'In Memoriam. The Roll of the Fallen', paragraphs: roll.map(rollLine), take: 0 };
  }
  if (name === '__tale') {
    if (!c.epilogue?.story) { const e = new Error('The tale isn\'t written yet.'); e.status = 404; throw e; }
    return { heading: `${c.game === 'ahlcg' ? 'The Closing Report' : 'The Last Chapter'}. ${c.epilogue.title || 'The Tale Entire'}`, paragraphs: c.epilogue.story.split(/\n+/).filter(Boolean), take: c.epilogue.take || 0, game: c.game };
  }
  const chapters = chronicleOf(id);
  const written = scenarioOrder(c).filter((n) => chapters[n]);
  const i = written.indexOf(name);
  if (i < 0) { const e = new Error('That chapter isn\'t written yet.'); e.status = 404; throw e; }
  return { heading: `${c.game === 'ahlcg' ? 'Case File' : 'Chapter'} ${NUMBER_WORDS[i + 1] || i + 1}. ${chapters[name].title}`, paragraphs: chapters[name].paragraphs, take: chapters[name].take || 0, game: c.game };
}

// A fresh recording of a chapter (every take is a new performance - "New take" on the page, for when one
// doesn't come out well). The old recording is dropped and the new one made in the background.
export async function newTake(id, name, by) {
  const c = mustEdit(id, by);
  const { forgetReading, narrate } = await import('./decks/chronicleVoice.js');
  forgetReading(chapterForReading(id, name, by));
  if (name === '__intro') {
    save(c.id, { introTake: (c.introTake || 0) + 1 });
  } else if (name === '__tale') {
    save(c.id, { epilogue: { ...c.epilogue, take: (c.epilogue?.take || 0) + 1 } });
  } else {
    const chapters = chronicleOf(id);
    if (!chapters[name]) { const e = new Error('That chapter is not written yet.'); e.status = 404; throw e; }
    chapters[name] = { ...chapters[name], take: (chapters[name].take || 0) + 1 };
    save(c.id, { chronicle: chapters });
  }
  return narrate(chapterForReading(id, name, by));
}

// The Narrator's readings are made as soon as chapters are written, rewritten or edited (and the tale), one
// at a time in the background, so pressing "Narrator" plays at once. Readings already made are
// skipped. Made in the default voice - another voice is made the first time it's chosen.
let readingQueue = Promise.resolve();
function prepareReadings(id) {
  readingQueue = readingQueue.then(async () => {
    const { narrateAndWait } = await import('./decks/chronicleVoice.js');
    const c = getCampaign(id, OWNER);
    if (!c) return;
    const chapters = chronicleOf(id);
    const names = ['__intro', ...scenarioOrder(c).filter((n) => chapters[n]), ...(c.epilogue?.story ? ['__tale'] : [])];
    const { artAndWait } = await import('./decks/chronicleArt.js');
    if (rollOfTheFallen(c).some((r) => r.epitaph)) names.push('__fallen');
    for (const n of names.filter((x) => x !== '__fallen' && x !== '__intro')) {
      try { await artAndWait(chapterForArt(c, n)); } catch (err) { console.warn(`[Chronicle] Picture for "${n}" not made: ${err.message}`); }
    }
    for (const n of names) {
      try { await narrateAndWait(chapterForReading(id, n, OWNER)); } catch (err) { console.warn(`[Chronicle] Reading of "${n}" not made: ${err.message}`); }
    }
  }).catch(() => {});
}

// Locking a chapter (or the tale) keeps it as it is: no edits, no rewrites - by hand or by the chronicler -
// until a player unlocks it.
function mustBeUnlocked(c, name) {
  const locked = name === '__tale' ? c.epilogue?.locked : chronicleOf(c.id)[name]?.locked;
  if (locked) { const e = new Error('That chapter is locked - unlock it first.'); e.status = 409; throw e; }
}
export function lockChapter(id, name, locked, by) {
  const c = mustEdit(id, by);
  const who = { locked: Boolean(locked), lockedBy: locked ? lc(by) : null, lockedAt: locked ? Date.now() : null };
  if (name === '__tale') {
    if (!c.epilogue?.story) { const e = new Error('The tale is not written yet.'); e.status = 404; throw e; }
    save(c.id, { epilogue: { ...c.epilogue, ...who } });
    return chronicleStatus(id, by);
  }
  const chapters = chronicleOf(id);
  if (!chapters[name]) { const e = new Error('That chapter is not written yet.'); e.status = 404; throw e; }
  // Once unlocked, it's rewritten only if what happened there changed while it was locked (and it wasn't
  // edited by hand).
  chapters[name] = { ...chapters[name], ...who };
  save(c.id, { chronicle: chapters });
  return chronicleStatus(id, by);
}

// ---- heroes: names and traits (for the plates, epitaphs and the roll) -------------------------------------
const cardInfoMemo = {};
function cardInfo(game = 'lotr') {
  if (!cardInfoMemo[game]) {
    try {
      const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'decks', `${game}_cards.json`), 'utf8')).cards || [];
      cardInfoMemo[game] = Object.fromEntries(cards.map((x) => [x.code, { name: x.name, subname: x.subname || null, traits: String(x.traits || '').replace(/\.\s*/g, ', ').replace(/,\s*$/, '') }]));
    } catch (_) { return {}; }
  }
  return cardInfoMemo[game];
}
const heroWithTraits = (code, game = 'lotr') => { const h = cardInfo(game)[code]; return h ? `${h.name}${h.subname ? `, ${h.subname}` : ''}${h.traits ? ` (${h.traits})` : ''}` : code; };
function heroName(code, game = 'lotr') { return cardInfo(game)[code]?.name || code; }
const placeOf = (scenario) => { try { return db.prepare('SELECT place FROM scenario_lore WHERE name = ?').get(scenario)?.place || ''; } catch (_) { return ''; } };

// ---- illustrated chapters -----------------------------------------------------------------------------------
// What a chapter's plate shows: its summary, its place, the company that won it (or last tried it), and
// any hero who fell there.
export function chapterForArt(c, name) {
  if (name === '__tale') {
    const heroes = [...new Set(c.players.flatMap((p) => (p.deckHeroes || []).filter((h) => !(p.fallen || []).includes(h))))].map((h) => heroWithTraits(h, c.game));
    const first = String(c.epilogue?.story || '').split(/\n+/)[0] || '';
    return { scene: `${c.game === 'ahlcg' ? 'The end of the affair' : "The journey's end, in triumph"}: ${c.epilogue?.title || ''}. ${first.slice(0, 500)}`, place: '', heroes, fallen: [], take: c.epilogue?.artTake || 0, custom: c.epilogue?.artPrompt || null, style: c.game === 'ahlcg' ? 'photo' : 'engraving' };
  }
  const ch = chronicleOf(c.id)[name] || {};
  const plays = c.scenarios.filter((s) => s.name === name);
  const play = plays.find((p) => p.result === 'won') || plays[plays.length - 1];
  const heroes = (play?.decks || []).flatMap((d) => d.heroes || []).map((h) => heroWithTraits(h, c.game));
  const fallen = c.players.flatMap((p) => (p.fallen || []).filter((h) => (p.fallenIn || {})[h] === name)).map((h) => heroWithTraits(h, c.game));
  return { scene: `${ch.title || name}: ${ch.summary || ''}`, place: placeOf(name), heroes, fallen, take: ch.artTake || 0, custom: ch.artPrompt || null, style: c.game === 'ahlcg' ? 'photo' : 'engraving' };
}
function artUrls(c, chapters, order) {
  const out = {};
  // the plates are only looked up here (a hash and a file check); they're made in the background
  const ready = artReadyFn;
  if (!ready) return out;
  for (const n of [...order.filter((x) => chapters[x]), ...(c.epilogue?.story ? ['__tale'] : [])]) {
    const key = ready(chapterForArt(c, n));
    if (key) out[n] = `/api/decks/campaigns/chronicle-art/${key}`;
  }
  return out;
}
let artReadyFn = null, artBriefFn = null;
import('./decks/chronicleArt.js').then((m) => { artReadyFn = m.artReady; artBriefFn = m.artBrief; }).catch(() => {});
// Each chapter's picture description as it stands (a player's edited one, or the chapter's own).
function artBriefs(c, chapters, order) {
  const out = {};
  if (!artBriefFn) return out;
  for (const n of [...order.filter((x) => chapters[x]), ...(c.epilogue?.story ? ['__tale'] : [])]) {
    const src = chapterForArt(c, n);
    out[n] = src.custom || artBriefFn(src);
  }
  return out;
}

// A fresh plate for a chapter ("New picture" on the page).
// prompt: the picture's description as the player edited it (kept for this chapter's pictures from now on;
// if it's left as the chapter's own description, the chapter goes back to describing itself).
export async function newPicture(id, name, by, prompt = null) {
  const c = mustEdit(id, by);
  const { forgetArt, artAndWait, artBrief } = await import('./decks/chronicleArt.js');
  const src = chapterForArt(c, name);
  forgetArt(src);
  const given = String(prompt ?? '').trim().slice(0, 3000);
  const artPrompt = given && given !== artBrief({ ...src, custom: null }).trim() ? given : null;
  if (name === '__tale') save(c.id, { epilogue: { ...c.epilogue, artTake: (c.epilogue?.artTake || 0) + 1, artPrompt } });
  else {
    const chapters = chronicleOf(id);
    if (!chapters[name]) { const e = new Error('That chapter is not written yet.'); e.status = 404; throw e; }
    chapters[name] = { ...chapters[name], artTake: (chapters[name].artTake || 0) + 1, artPrompt };
    save(c.id, { chronicle: chapters });
  }
  artAndWait(chapterForArt(getCampaign(id, by), name)).catch((err) => console.warn(`[Chronicle] Picture not made: ${err.message}`));
  return chronicleStatus(id, by);
}

// ---- hero epitaphs and the Roll of the Fallen ---------------------------------------------------------------
// When a hero is marked as fallen, a short lament is written for them (in-world, as Tolkien would), kept
// for the Roll of the Fallen at the end of the Chronicle. Bringing a hero back removes theirs.
try { db.exec("ALTER TABLE campaigns ADD COLUMN epitaphs TEXT NOT NULL DEFAULT '{}'"); } catch (_) { /* already there */ }
const epitaphsOf = (id) => parse(db.prepare('SELECT epitaphs FROM campaigns WHERE id = ?').get(Number(id))?.epitaphs, {});

function syncEpitaphs(id, before, after) {
  const eps = epitaphsOf(id);
  let changed = false;
  const toWrite = [];
  for (const p of after) {
    for (const h of p.fallen) {
      const k = `${p.email}|${h}`;
      const scenario = p.fallenIn?.[h] || null;
      if (!eps[k] || eps[k].scenario !== scenario) { eps[k] = { hero: h, scenario, text: null, at: Date.now() }; changed = true; toWrite.push(k); }
    }
  }
  for (const k of Object.keys(eps)) {
    const [email, h] = k.split('|');
    if (!after.some((p) => p.email === email && p.fallen.includes(h))) { delete eps[k]; changed = true; }
  }
  if (changed) save(id, { epitaphs: eps });
  for (const k of toWrite) writeEpitaph(id, k); // after saving, so the writer finds them
}

async function writeEpitaph(id, k) {
  try {
    const c = getCampaign(id, OWNER);
    const e = epitaphsOf(id)[k];
    if (!c || !e) return;
    const [email] = k.split('|');
    const comrades = (c.players.find((p) => p.email === email)?.deckHeroes || []).filter((h) => h !== e.hero).map((h) => heroWithTraits(h, c.game));
    const place = e.scenario ? placeOf(e.scenario) : '';
    const prompt = c.game === 'ahlcg' ? `Write the last word on an investigator lost to the Mythos, for the list of the lost at the back of a 1920s case file.
Investigator: ${heroWithTraits(e.hero, c.game)} - keep to what they are.
${e.scenario ? `They were lost during the affair of "${e.scenario}"${place ? ` (${place})` : ''}.` : 'They were lost during the investigation.'}
${comrades.length ? `Their closest companions: ${comrades.join(', ')}.` : ''}
Write it as a terse 1920s newspaper obituary crossed with an archivist's private note - two to four sentences, grave, noir and haunted, hinting at the horror that took them (death or madness) without naming game terms. No real people's names, no modern dates.` : `Write the epitaph of a hero of Middle-earth who has fallen, for the Roll of the Fallen at the end of a chronicle of their fellowship's journey.
Hero: ${heroWithTraits(e.hero, c.game)} - keep to what the traits say they are.
${e.scenario ? `They fell on the journey at "${e.scenario}"${place ? ` (${place})` : ''}.` : 'They fell on the journey.'}
${comrades.length ? `Their closest companions: ${comrades.join(', ')}.` : ''}
Write it as J.R.R. Tolkien would: a lament of two to four sentences, grave, tender and noble, wholly within Middle-earth. Nothing from our world - no real names, no dates or years, no game terms. Do not begin with "Here lies".`;
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const config = (await import('../config.js')).default;
    const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json', temperature: 0.8, responseSchema: { type: 'OBJECT', properties: { epitaph: { type: 'STRING' } }, required: ['epitaph'] } },
    });
    const out = JSON.parse((await model.generateContent(prompt)).response.text());
    const eps = epitaphsOf(id);
    if (!eps[k]) return; // brought back meanwhile
    eps[k] = { ...eps[k], text: String(out.epitaph || '').trim().slice(0, 800) };
    save(id, { epitaphs: eps });
    prepareReadings(id);
  } catch (err) { console.warn(`[Chronicle] Epitaph not written: ${err.message}`); }
}

// The roll: each fallen hero, where they fell and their epitaph (in the order they fell).
function rollOfTheFallen(c) {
  const eps = epitaphsOf(c.id);
  const order = scenarioOrder(c);
  return Object.entries(eps)
    .map(([k, e]) => ({ key: k, game: c.game, hero: heroName(e.hero, c.game), traits: cardInfo(c.game)[e.hero]?.traits || '', scenario: e.scenario, place: e.scenario ? placeOf(e.scenario) : '', epitaph: e.text, at: e.at }))
    .sort((a, b) => (order.indexOf(a.scenario) - order.indexOf(b.scenario)) || (a.at - b.at));
}
const rollLine = (r) => (r.game === 'ahlcg'
  ? `${r.hero}${r.traits ? ` (${r.traits.split(',')[0].trim()})` : ''} - lost ${r.place ? `at ${r.place}` : r.scenario ? `in the affair of ${r.scenario}` : 'in the course of the investigation'}. ${r.epitaph || 'The file on them is not yet closed.'}`
  : `${r.hero}${r.traits ? ` the ${r.traits.split(',')[0].trim()}` : ''}, who fell ${r.place ? `in ${r.place}` : r.scenario ? `upon the road at ${r.scenario}` : 'upon the road'}. ${r.epitaph || 'Their lament is yet being written.'}`);
export { rollLine };

// ---- campaign cards a scenario awards -----------------------------------------------------------------------
// After a win: what the scenario's rules say is earned (from the indexed rulesheet), to go with the page's
// list of that product's campaign cards.
export async function scenarioRewards(id, { scenarioName, scenarioPack }, by) {
  const c = getCampaign(id, by);
  if (!c) { const e = new Error('Campaign not found.'); e.status = 404; throw e; }
  const { ruleCheck } = await import('./decks/rulebooks.js');
  return ruleCheck({ game: c.game, kind: c.kind, scenarioPack, scenarioName, question: `At the end of the scenario "${scenarioName}" in campaign mode, which campaign cards, boons or burdens are earned or added to the campaign pool, under what conditions, and who or which deck gets each one?` });
}

// A fresh title for a chapter, from the chapter as it now reads (the editor's refresh button). Only
// suggested - it's kept if the edit is saved.
export async function suggestTitle(id, name, { title, text }, by) {
  const c = mustEdit(id, by);
  const body = String(text || '').trim().slice(0, 6000);
  if (!body) throw new Error('The chapter is empty.');
  const prompt = c.game === 'ahlcg' ? `You write the headings of the entries in a 1920s investigators' case file - pulp noir steeped in Lovecraftian dread.
Give ONE new heading for the entry below: short (two to seven words), evocative, hard-boiled and ominous - no real-world names, modern dates or game terms.${name && name !== '__tale' ? ` It must not simply repeat the name of the affair ("${name}").` : ''}${title ? ` It must be different from the current heading, "${title}".` : ''}

THE ENTRY:
${body}` : `You title the chapters of a chronicle of a fellowship's journey through Middle-earth, written as J.R.R. Tolkien wrote The Lord of the Rings.
Give ONE new title for the chapter below: short (two to seven words), evocative and in Tolkien's manner, wholly within Middle-earth - no real-world names, dates or game terms.${name && name !== '__tale' ? ` It must not simply repeat the name of the place or deed ("${name}").` : ''}${title ? ` It must be different from the current title, "${title}".` : ''}

THE CHAPTER:
${body}`;
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const config = (await import('../config.js')).default;
  const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json', temperature: 1, responseSchema: { type: 'OBJECT', properties: { title: { type: 'STRING' } }, required: ['title'] } },
  });
  const out = JSON.parse((await model.generateContent(prompt)).response.text());
  return { title: String(out.title || '').replace(/^["']|["']$/g, '').trim().slice(0, 120) || title };
}

// ---- voice notes -----------------------------------------------------------------------------------------------
// A spoken note for a campaign (the notes, the campaign log, a scenario's notable moments): Gemini writes down
// what was said, told the campaign's own names (heroes, investigators, scenarios, players, campaign cards) so
// "Glorfindel" or "The Midnight Masks" come out spelt right. Returns plain text; the page adds it as a bullet.
export async function transcribeVoiceNote(id, audio, mimeType = 'audio/webm', by) {
  if (!audio?.length) throw new Error('No recording came through.');
  if (audio.length > 15 * 1024 * 1024) throw new Error('That recording is too long - keep voice notes under a few minutes.');
  const c = getCampaign(id, by);
  if (!c) throw Object.assign(new Error('Campaign not found'), { status: 404 });
  const v = imsView(c, imsLookups());
  const names = [...new Set([
    c.name, c.kind, ...v.route, ...c.scenarios.map((s) => s.name),
    ...v.players.flatMap((p) => [p.name, ...p.heroes]), ...c.cards.map((x) => x.name),
  ].filter(Boolean))].slice(0, 150);
  const game = c.game === 'ahlcg' ? 'the Arkham Horror card game' : 'the Lord of the Rings card game';
  const prompt = `Transcribe this voice note, spoken in English (a Yorkshire accent), about a campaign of ${game}. Write exactly what was said as clean text: proper punctuation and capitals, no filler words ("um", "er"), no false starts, no timestamps, no speaker labels, and nothing added. Keep it in the speaker's words.
Names that may come up - spell them like this: ${names.join('; ')}.
If nothing intelligible was said, return an empty string.`;
  const config = (await import('../config.js')).default;
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ inlineData: { mimeType: String(mimeType).split(';')[0], data: Buffer.from(audio).toString('base64') } }, { text: prompt }] }],
      generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Gemini returned HTTP ${res.status}`);
  const text = ((await res.json())?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  return { text: text.replace(/^["']|["']$/g, '').replace(/\s*\n+\s*/g, ' ').trim() };
}
