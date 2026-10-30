// The D&D Solo DM's adventures, kept on the server so they follow each player to any device and so the people
// Simon invites can see how everyone is getting on (29 Oct 2026, Simon: "we can both see each others progress but
// cant play each others campaigns"). Each game belongs to whoever made it: only they can save or delete it; anyone
// signed in can read a summary of everyone's, and open one to watch it.
import db from '../db/database.js';

db.exec(`CREATE TABLE IF NOT EXISTS dnd_beta_games (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT, state_json TEXT NOT NULL, created INTEGER, updated INTEGER NOT NULL
)`);
db.exec('CREATE INDEX IF NOT EXISTS dnd_beta_games_owner ON dnd_beta_games(owner)');

const parse = (row) => { try { return JSON.parse(row.state_json); } catch { return null; } };

export function myGames(owner) {
  return db.prepare('SELECT * FROM dnd_beta_games WHERE owner = ? ORDER BY updated DESC').all(owner).map(parse).filter(Boolean);
}
// saves a game for its owner; refuses a game id that belongs to someone else
export function saveGame(owner, state) {
  if (!state || typeof state.id !== 'string' || !state.hero) throw new Error('That is not a game.');
  const row = db.prepare('SELECT owner FROM dnd_beta_games WHERE id = ?').get(state.id);
  if (row && row.owner !== owner) { const e = new Error('That adventure is someone else\'s.'); e.code = 403; throw e; }
  const now = Date.now();
  const json = JSON.stringify(state);
  if (row) db.prepare('UPDATE dnd_beta_games SET title = ?, state_json = ?, updated = ? WHERE id = ?').run(state.title || null, json, state.updated || now, state.id);
  else db.prepare('INSERT INTO dnd_beta_games (id, owner, title, state_json, created, updated) VALUES (?, ?, ?, ?, ?, ?)').run(state.id, owner, state.title || null, json, state.created || now, state.updated || now);
  return true;
}
export function deleteGame(owner, id) {
  return db.prepare('DELETE FROM dnd_beta_games WHERE id = ? AND owner = ?').run(id, owner).changes > 0;
}
// what anyone may see of everyone else's adventures: who, which survivor, how far, and the latest few entries
export function othersGames(owner, nameOf) {
  return db.prepare('SELECT * FROM dnd_beta_games WHERE owner != ? ORDER BY updated DESC').all(owner).map((row) => {
    const s = parse(row); if (!s) return null;
    const h = s.hero || {}, v = h.vit || {}, d = s.domain || {};
    return {
      id: row.id, ownerName: nameOf(row.owner), title: s.title, updated: row.updated, created: row.created,
      hero: { name: h.name, level: h.level || 1, xp: v.xp || 0, health: v.health, maxHealth: v.maxHealth, sanity: v.sanity, maxSanity: v.maxSanity, avatar: h.avatar && !String(h.avatar).startsWith('data:') ? h.avatar : null },
      domain: { n: d.n, overseer: d.overseer?.name, rooms: d.rooms, overseerSlain: Boolean(d.overseerSlain) },
      places: (s.pieces || []).length, over: s.over || null, fighting: s.combat ? (s.pieces || []).find((p) => p.id === s.combat.piece)?.enc?.name || true : null,
      latest: (s.log || []).slice(-4).map((e) => ({ title: e.title, text: String(e.text || '').slice(0, 220), kind: e.kind })),
    };
  }).filter(Boolean);
}
// the whole of someone else's adventure, to watch it (never to play it)
export function watchGame(owner, id, nameOf) {
  const row = db.prepare('SELECT * FROM dnd_beta_games WHERE id = ?').get(id);
  if (!row) return null;
  const s = parse(row); if (!s) return null;
  return { ...s, watching: { ownerName: nameOf(row.owner), mine: row.owner === owner } };
}

// "That's not right" flags from play (30 Oct 2026): a player's note with what the scroll said, for Claude to check
db.exec(`CREATE TABLE IF NOT EXISTS dnd_beta_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, game_id TEXT, note TEXT NOT NULL, entry_json TEXT, context_json TEXT, created INTEGER NOT NULL, resolved INTEGER DEFAULT 0
)`);
export function addFlag(owner, { gameId, note, entry, context }) {
  if (!note || typeof note !== 'string') throw new Error('Say what looks wrong.');
  const r = db.prepare('INSERT INTO dnd_beta_flags (owner, game_id, note, entry_json, context_json, created) VALUES (?, ?, ?, ?, ?, ?)')
    .run(owner, gameId || null, note.slice(0, 2000), entry ? JSON.stringify(entry).slice(0, 20000) : null, context ? JSON.stringify(context).slice(0, 400000) : null, Date.now());
  return Number(r.lastInsertRowid);
}
export function listFlags(owner = null) {
  const rows = owner ? db.prepare('SELECT * FROM dnd_beta_flags WHERE owner = ? ORDER BY created DESC').all(owner) : db.prepare('SELECT * FROM dnd_beta_flags ORDER BY created DESC').all();
  return rows.map((r) => ({ id: r.id, owner: r.owner, gameId: r.game_id, note: r.note, created: r.created, resolved: Boolean(r.resolved), entry: r.entry_json ? JSON.parse(r.entry_json) : null }));
}
