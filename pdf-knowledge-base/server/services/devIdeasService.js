import db from '../db/database.js';

// Dev ideas: development ideas for IMS itself, captured by voice ("Ims, dev idea: ...") or on
// /ims/devideas, and picked up in Claude Code with the /ideas command (which reads and updates
// this table through scripts/dev-ideas.js). Status runs new -> picked_up -> done (or dismissed).

db.exec(`CREATE TABLE IF NOT EXISTS dev_ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'page',
  status TEXT NOT NULL DEFAULT 'new', notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER
)`);

export const STATUSES = ['new', 'picked_up', 'done', 'dismissed'];

const present = (r) => r && ({ id: r.id, text: r.text, source: r.source, status: r.status, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at });

export function listIdeas({ status } = {}) {
  const rows = status
    ? db.prepare('SELECT * FROM dev_ideas WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare(`SELECT * FROM dev_ideas ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'picked_up' THEN 1 ELSE 2 END, created_at DESC`).all();
  return rows.map(present);
}

export function addIdea({ text, source = 'page' }) {
  const t = String(text || '').trim();
  if (!t) throw new Error('The idea is empty.');
  const info = db.prepare('INSERT INTO dev_ideas (text, source, created_at) VALUES (?, ?, ?)').run(t.slice(0, 4000), source, Date.now());
  return present(db.prepare('SELECT * FROM dev_ideas WHERE id = ?').get(info.lastInsertRowid));
}

export function updateIdea(id, { text, status, notes }) {
  const row = db.prepare('SELECT * FROM dev_ideas WHERE id = ?').get(id);
  if (!row) throw new Error('Idea not found.');
  if (status !== undefined && !STATUSES.includes(status)) throw new Error(`Status must be one of ${STATUSES.join(', ')}.`);
  db.prepare('UPDATE dev_ideas SET text = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?').run(
    text !== undefined ? String(text).trim() || row.text : row.text,
    status ?? row.status,
    notes !== undefined ? (String(notes).trim() || null) : row.notes,
    Date.now(), id,
  );
  return present(db.prepare('SELECT * FROM dev_ideas WHERE id = ?').get(id));
}

export function deleteIdea(id) {
  return db.prepare('DELETE FROM dev_ideas WHERE id = ?').run(id).changes > 0;
}

// A voice tool that failed, logged as a ready-to-use prompt for Claude Code. The same tool failing
// the same way isn't logged twice while an earlier one is still open.
export function flagToolFailure({ tool, error, args, heard, where }) {
  const err = String(error || 'unknown error').slice(0, 300);
  const dup = db.prepare(`SELECT id FROM dev_ideas WHERE source = 'auto' AND status IN ('new', 'picked_up') AND text LIKE ? AND text LIKE ?`)
    .get(`%tool ${tool} failed%`, `%${err.slice(0, 80).replace(/[%_]/g, '')}%`);
  if (dup) return { id: dup.id, duplicate: true };
  const text = `Ims's voice tool ${tool} failed${where ? ` (${where})` : ''}. Investigate and fix it.\n`
    + `Error: ${err}\n`
    + (args && Object.keys(args).length ? `Arguments Gemini sent: ${JSON.stringify(args).slice(0, 400)}\n` : '')
    + (heard ? `What the user had just said: "${String(heard).trim().slice(0, 300)}"\n` : '')
    + 'The tool is handled in pdf-knowledge-base/server/index.js (handleLiveProxyConnection, toolCall branch) and declared in services/hardwareClientService.js.';
  return { ...addIdea({ text, source: 'auto' }), duplicate: false };
}
