import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'app.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS oauth_tokens (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT,
    refresh_token TEXT,
    token_type TEXT,
    expiry_date INTEGER,
    user_email TEXT,
    user_name TEXT
  );

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT CHECK(role IN ('user', 'assistant')),
    content TEXT,
    citations_json TEXT,
    model_used TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    drive_file_id TEXT UNIQUE,
    filename TEXT,
    folder_path TEXT,
    subject TEXT,
    subject_source TEXT DEFAULT 'folder',
    page_count INTEGER DEFAULT 0,
    file_size INTEGER DEFAULT 0,
    drive_modified_time TEXT,
    indexed INTEGER DEFAULT 0,
    last_synced DATETIME
  );

  CREATE TABLE IF NOT EXISTS topics (
    id TEXT PRIMARY KEY,
    document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
    subject TEXT,
    topic TEXT,
    description TEXT,
    suggested_question TEXT
  );

  CREATE TABLE IF NOT EXISTS token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    model TEXT,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    estimated_cost REAL DEFAULT 0,
    operation TEXT CHECK(operation IN ('chat', 'embedding', 'topic_extraction'))
  );

  CREATE TABLE IF NOT EXISTS canvas_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    content TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pinned_items (
    id TEXT PRIMARY KEY,
    drive_file_id TEXT,
    filename TEXT,
    page_num INTEGER,
    excerpt TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS global_rules (
    id TEXT PRIMARY KEY,
    content TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS gems (
    id TEXT PRIMARY KEY,
    name TEXT,
    icon TEXT,
    instruction TEXT,
    is_active INTEGER DEFAULT 0,
    is_system INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS toc_items (
    id TEXT PRIMARY KEY,
    document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
    title TEXT,
    level INTEGER DEFAULT 0,
    parent_id TEXT,
    page_number INTEGER,
    order_index INTEGER DEFAULT 0
  );

  -- Insert default gems if they don't exist
  INSERT OR IGNORE INTO gems (id, name, icon, instruction, is_active, is_system) 
  VALUES 
  ('default', 'Default', 'Sparkles', 'You are a helpful AI assistant.', 1, 1),
  ('researcher', 'Researcher', 'Search', 'You are a meticulous Research Analyst. Focus on extracting specific data points, dates, and cross-references. Always explain the context of your findings.', 0, 1),
  ('critic', 'Fact Checker', 'Shield', 'You are a rigorous Fact Checker. Your goal is to verify information and point out potential inconsistencies or ambiguities in the text.', 0, 1),
  ('rule-expert', 'Rulebook Guru', 'Book', 'You are an expert Rulebook Analyst. You specialize in interpreting complex game systems or technical manuals. Be precise and literal.', 0, 1);

  CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_documents_subject ON documents(subject);
  CREATE INDEX IF NOT EXISTS idx_topics_subject ON topics(subject);
  CREATE INDEX IF NOT EXISTS idx_topics_document ON topics(document_id);
  CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON token_usage(timestamp);
  CREATE INDEX IF NOT EXISTS idx_toc_document ON toc_items(document_id);
  CREATE INDEX IF NOT EXISTS idx_toc_parent ON toc_items(parent_id);

  CREATE TABLE IF NOT EXISTS validated_qas (
    id TEXT PRIMARY KEY,
    question TEXT UNIQUE,
    answer TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ims_memories (
    id TEXT PRIMARY KEY,
    fact TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_memories_created ON ims_memories(created_at);
`);

// Memories are never destroyed: deleting one archives it (deleted_at) so it can
// be reviewed or restored from the /ims/memories archive.
try { db.exec(`ALTER TABLE ims_memories ADD COLUMN deleted_at TEXT`); } catch (_) { }
try { db.exec(`ALTER TABLE ims_memories ADD COLUMN updated_at TEXT`); } catch (_) { }

// Migrations: Add confidence_score and validation_status to chat_messages if missing
try {
  db.exec("ALTER TABLE chat_messages ADD COLUMN confidence_score INTEGER DEFAULT NULL");
} catch (e) {
  // Column already exists
}
try {
  db.exec("ALTER TABLE chat_messages ADD COLUMN validation_status TEXT DEFAULT NULL");
} catch (e) {
  // Column already exists
}

// Helper functions
export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }
  return settings;
}

// Explicit Memory & Recall Subsystem
export function addMemory(fact, category = 'general') {
  const id = 'mem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const cat = (category || 'general').trim().toLowerCase();
  const trimmedFact = fact.trim();
  const createdAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
  db.prepare('INSERT INTO ims_memories (id, fact, category, created_at) VALUES (?, ?, ?, ?)').run(id, trimmedFact, cat, createdAt);
  return { id, fact: trimmedFact, category: cat, created_at: createdAt };
}

const MEM_COLS = 'id, fact, category, created_at, updated_at';
const nowStamp = () => new Date().toISOString().replace('T', ' ').substring(0, 19);

export function getMemories(limit = 100, category = null) {
  if (category && category !== 'all') {
    const cat = category.trim().toLowerCase();
    if (limit <= 0) {
      return db.prepare(`SELECT ${MEM_COLS} FROM ims_memories WHERE deleted_at IS NULL AND category = ? ORDER BY created_at DESC`).all(cat);
    }
    return db.prepare(`SELECT ${MEM_COLS} FROM ims_memories WHERE deleted_at IS NULL AND category = ? ORDER BY created_at DESC LIMIT ?`).all(cat, limit);
  }
  if (limit <= 0) {
    return db.prepare(`SELECT ${MEM_COLS} FROM ims_memories WHERE deleted_at IS NULL ORDER BY created_at DESC`).all();
  }
  return db.prepare(`SELECT ${MEM_COLS} FROM ims_memories WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?`).all(limit);
}

export function searchMemories(query, category = null) {
  if (!query || !query.trim()) {
    return getMemories(50, category);
  }
  const term = `%${query.trim()}%`;
  if (category && category !== 'all') {
    const cat = category.trim().toLowerCase();
    return db.prepare(`SELECT ${MEM_COLS} FROM ims_memories WHERE deleted_at IS NULL AND category = ? AND (fact LIKE ? OR id LIKE ?) ORDER BY created_at DESC LIMIT 50`).all(cat, term, term);
  }
  return db.prepare(`SELECT ${MEM_COLS} FROM ims_memories WHERE deleted_at IS NULL AND (fact LIKE ? OR category LIKE ? OR id LIKE ?) ORDER BY created_at DESC LIMIT 50`).all(term, term, term);
}

// "Deleting" archives: the row stays, stamped with when it was deleted.
export function deleteMemory(idOrFact) {
  const info = db.prepare(`UPDATE ims_memories SET deleted_at = ? WHERE deleted_at IS NULL AND (id = ? OR fact LIKE ?)`)
    .run(nowStamp(), idOrFact, `%${idOrFact}%`);
  return info.changes > 0;
}

export function updateMemory(id, fact, category = 'general') {
  const cat = (category || 'general').trim().toLowerCase();
  const info = db.prepare('UPDATE ims_memories SET fact = ?, category = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(fact.trim(), cat, nowStamp(), id);
  return info.changes > 0;
}

// Archived (deleted) memories, most recently deleted first. `search` matches the text.
export function getArchivedMemories({ search = '', limit = 300 } = {}) {
  const term = `%${String(search || '').trim()}%`;
  return db.prepare(
    `SELECT ${MEM_COLS}, deleted_at FROM ims_memories WHERE deleted_at IS NOT NULL AND (fact LIKE ? OR category LIKE ?) ORDER BY deleted_at DESC LIMIT ?`
  ).all(term, term, limit);
}

export function restoreMemory(id) {
  return db.prepare('UPDATE ims_memories SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL').run(id).changes > 0;
}

export default db;


