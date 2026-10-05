// Conversation transcripts (persona plan, Phase 0 / E3): every conversation with Ims, however it ends, with
// each turn's words, the face he pulled, the tools he used and how long he took to start answering.
// The foundation for memory (notes from every conversation), latency tracking and the aliveness tests.
// Never stored: anything while a call or meeting is being recorded (the caller checks before logging).
import db, { getSetting, setSetting } from '../db/database.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    persona_id TEXT,
    device TEXT,
    end_reason TEXT,
    turn_count INTEGER DEFAULT 0,
    summary_done INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_conversations_started ON conversations(started_at);
  CREATE TABLE IF NOT EXISTS conversation_turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    at INTEGER NOT NULL,
    role TEXT NOT NULL,
    text TEXT,
    emotion TEXT,
    tools TEXT,
    latency_ms INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_turns_conversation ON conversation_turns(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_turns_at ON conversation_turns(at);
`);

const RETENTION_KEY = 'conversation_retention_days';
export const getRetentionDays = () => Math.max(1, Number(getSetting(RETENTION_KEY)) || 180);
export const setRetentionDays = (d) => { setSetting(RETENTION_KEY, String(Math.max(1, Math.min(3650, Math.round(Number(d) || 180))))); return getRetentionDays(); };

export function startConversation({ personaId = null, device = 'desk' } = {}) {
  return Number(db.prepare('INSERT INTO conversations (started_at, persona_id, device) VALUES (?, ?, ?)').run(Date.now(), personaId, device).lastInsertRowid);
}

// role: 'user' | 'ims' | 'system' (a device text turn, e.g. a reminder being announced)
export function addTurn(conversationId, { role, text = '', emotion = null, tools = null, latencyMs = null }) {
  if (!conversationId || !String(text || '').trim()) return;
  db.prepare('INSERT INTO conversation_turns (conversation_id, at, role, text, emotion, tools, latency_ms) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(conversationId, Date.now(), role, String(text).trim().slice(0, 8000), emotion || null, tools && tools.length ? JSON.stringify(tools) : null, Number.isFinite(latencyMs) ? Math.round(latencyMs) : null);
  db.prepare('UPDATE conversations SET turn_count = turn_count + 1 WHERE id = ?').run(conversationId);
}

// end_reason: farewell | cancel | tap_interrupt | silence | device_closed | disconnect | stale
export function endConversation(conversationId, reason = 'ended') {
  if (!conversationId) return;
  db.prepare('UPDATE conversations SET ended_at = ?, end_reason = ? WHERE id = ? AND ended_at IS NULL').run(Date.now(), reason, conversationId);
  // a conversation where nothing was actually said isn't worth keeping
  const c = db.prepare('SELECT turn_count FROM conversations WHERE id = ?').get(conversationId);
  if (c && !c.turn_count) db.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId);
}

export function listConversations({ limit = 50, before = null } = {}) {
  const rows = before
    ? db.prepare('SELECT * FROM conversations WHERE started_at < ? ORDER BY started_at DESC LIMIT ?').all(Number(before), limit)
    : db.prepare('SELECT * FROM conversations ORDER BY started_at DESC LIMIT ?').all(limit);
  const first = db.prepare("SELECT text FROM conversation_turns WHERE conversation_id = ? AND role = 'user' ORDER BY at LIMIT 1");
  return rows.map((r) => ({ ...r, opening: first.get(r.id)?.text || null }));
}

export function getConversation(id) {
  const c = db.prepare('SELECT * FROM conversations WHERE id = ?').get(Number(id));
  if (!c) return null;
  const turns = db.prepare('SELECT * FROM conversation_turns WHERE conversation_id = ? ORDER BY at, id').all(c.id)
    .map((t) => ({ ...t, tools: t.tools ? JSON.parse(t.tools) : [] }));
  return { ...c, turns };
}

export function deleteConversation(id) {
  db.prepare('DELETE FROM conversation_turns WHERE conversation_id = ?').run(Number(id));
  return db.prepare('DELETE FROM conversations WHERE id = ?').run(Number(id)).changes > 0;
}

// the turns of recent conversations (for memory notes, reconnect continuity and the aliveness tests)
export function recentTurns({ withinMinutes = 30, limit = 12 } = {}) {
  return db.prepare('SELECT role, text, at FROM conversation_turns WHERE at > ? ORDER BY at DESC LIMIT ?')
    .all(Date.now() - withinMinutes * 60000, limit).reverse();
}

export function conversationsSince(ms) {
  return db.prepare('SELECT id FROM conversations WHERE started_at >= ? ORDER BY started_at').all(ms).map((r) => getConversation(r.id));
}

// nightly: conversations older than the retention period are removed
export function pruneConversations() {
  const cutoff = Date.now() - getRetentionDays() * 86400000;
  const ids = db.prepare('SELECT id FROM conversations WHERE started_at < ?').all(cutoff).map((r) => r.id);
  for (const id of ids) deleteConversation(id);
  return ids.length;
}

// ---- A3: how long Ims takes to start answering ----
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };

export function latencyStats() {
  const now = Date.now();
  const since = (ms) => db.prepare("SELECT latency_ms, tools FROM conversation_turns WHERE role = 'ims' AND latency_ms IS NOT NULL AND latency_ms BETWEEN 0 AND 120000 AND at >= ?").all(now - ms);
  const summarise = (rows) => {
    const noTool = rows.filter((r) => !r.tools).map((r) => r.latency_ms);
    const withTool = rows.filter((r) => r.tools).map((r) => r.latency_ms);
    return {
      turns: rows.length,
      noTool: { count: noTool.length, median: pct(noTool, 0.5), p90: pct(noTool, 0.9) },
      withTool: { count: withTool.length, median: pct(withTool, 0.5), p90: pct(withTool, 0.9) },
    };
  };
  // slowest tools this week, by median time to answer
  const tools = {};
  for (const r of since(7 * 86400000)) {
    if (!r.tools) continue;
    for (const t of JSON.parse(r.tools)) if (Number.isFinite(t.ms)) (tools[t.name] ||= []).push(t.ms);
  }
  const slowestTools = Object.entries(tools).map(([name, ms]) => ({ name, calls: ms.length, median: pct(ms, 0.5), p90: pct(ms, 0.9) }))
    .sort((a, b) => b.median - a.median).slice(0, 6);
  return { today: summarise(since(86400000)), week: summarise(since(7 * 86400000)), slowestTools };
}
