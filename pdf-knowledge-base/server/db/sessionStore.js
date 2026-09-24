import session from 'express-session';
import db from './database.js';

// express-session's default MemoryStore forgets every login whenever the
// backend restarts - which in development is on every file save - and can't be
// shared safely. This keeps sessions in the app's own SQLite database so a
// Google sign-in survives restarts until the cookie expires.
db.exec(`
  CREATE TABLE IF NOT EXISTS http_sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
`);

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class SqliteSessionStore extends session.Store {
  constructor() {
    super();
    // Drop expired sessions now and then so the table can't grow without bound.
    setInterval(() => {
      try { db.prepare('DELETE FROM http_sessions WHERE expires < ?').run(Date.now()); } catch (_) { /* best effort */ }
    }, 60 * 60 * 1000).unref();
  }

  get(sid, cb) {
    try {
      const row = db.prepare('SELECT sess, expires FROM http_sessions WHERE sid = ?').get(sid);
      if (!row) return cb(null, null);
      if (row.expires < Date.now()) { this.destroy(sid, () => {}); return cb(null, null); }
      cb(null, JSON.parse(row.sess));
    } catch (err) { cb(err); }
  }

  set(sid, sess, cb) {
    try {
      const expires = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + DEFAULT_TTL_MS;
      db.prepare(`INSERT INTO http_sessions (sid, sess, expires) VALUES (?, ?, ?)
                  ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires`)
        .run(sid, JSON.stringify(sess), expires);
      cb?.(null);
    } catch (err) { cb?.(err); }
  }

  touch(sid, sess, cb) { this.set(sid, sess, cb); }

  destroy(sid, cb) {
    try { db.prepare('DELETE FROM http_sessions WHERE sid = ?').run(sid); cb?.(null); } catch (err) { cb?.(err); }
  }
}
