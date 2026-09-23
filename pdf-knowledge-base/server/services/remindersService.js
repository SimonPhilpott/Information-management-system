import db from '../db/database.js';

// Timers, alarms and reminders share one table - they're structurally
// identical (a labelled moment in time to notify about), differing only in
// how Gemini/the user talk about them. Lists are separate: they have items,
// not a single fire time.
db.exec(`
  CREATE TABLE IF NOT EXISTS scheduled_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    label TEXT,
    fire_at INTEGER NOT NULL,
    recurrence TEXT NOT NULL DEFAULT 'once',
    created_at INTEGER NOT NULL,
    cancelled INTEGER NOT NULL DEFAULT 0,
    ringing INTEGER NOT NULL DEFAULT 0,
    ring_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS list_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_name TEXT NOT NULL,
    item TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);
// Migration for the table as it existed before ringing/ring_count were
// added - CREATE TABLE IF NOT EXISTS above is a no-op against an
// already-existing table, so these columns need adding explicitly.
try { db.exec(`ALTER TABLE scheduled_items ADD COLUMN ringing INTEGER NOT NULL DEFAULT 0`); } catch (_) { }
try { db.exec(`ALTER TABLE scheduled_items ADD COLUMN ring_count INTEGER NOT NULL DEFAULT 0`); } catch (_) { }

const VALID_TYPES = ['timer', 'alarm', 'reminder'];
const VALID_RECURRENCE = ['once', 'daily', 'weekdays'];
const LONDON_TZ = 'Europe/London';

// All wall-clock reasoning ("7:30", "already passed today", "next weekday")
// is anchored to Europe/London explicitly via Intl's real IANA tz data,
// rather than relying on the server process's own OS/system timezone. That
// happens to already be Europe/London here, but explicit means this stays
// correct (including the BST/GMT changeover twice a year) even if the server
// ever moves to a host configured differently - a naive `new Date()` would
// silently start being an hour out for half the year with no error at all.
const londonPartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON_TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
});
const londonWeekdayFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: LONDON_TZ, weekday: 'short' });

// Reads a UTC instant back as the London wall-clock date/time it corresponds to.
function londonParts(date) {
  const parts = Object.fromEntries(londonPartsFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

// Inverse of londonParts(): given a London wall-clock date/time, returns the
// correct UTC epoch ms - correctly BST- or GMT-offset depending on the date,
// via a self-correcting guess (construct as if UTC, see how that instant
// actually reads in London, adjust by the difference).
function londonWallTimeToUtcMs(year, month, day, hour, minute, second = 0) {
  const guessMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const wantedMs = guessMs; // same numbers, read as the WANTED wall-clock time
  const asLondon = londonParts(new Date(guessMs));
  const gotMs = Date.UTC(asLondon.year, asLondon.month - 1, asLondon.day, asLondon.hour, asLondon.minute, asLondon.second);
  return guessMs + (wantedMs - gotMs);
}

function isLondonWeekend(ms) {
  const weekday = londonWeekdayFormatter.format(new Date(ms));
  return weekday === 'Sat' || weekday === 'Sun';
}

// Accepts EITHER a relative delay ("in 10 minutes" -> whenSeconds) or an
// absolute clock time ("at 7:30" -> time, 24-hour HH:MM, optionally paired
// with date, "YYYY-MM-DD") - Gemini picks whichever matches how the user
// actually phrased it, rather than being forced to convert everything to one
// form itself. Deliberately doesn't try to parse "this Saturday" or "the
// 25th" itself - the system prompt gives Gemini today's real London date
// specifically so IT resolves phrases like that into an explicit date,
// which is far more reliable than a bespoke natural-language date parser
// here would be.
function computeFireAt({ whenSeconds, time, date }) {
  const now = Date.now();
  if (typeof whenSeconds === 'number' && whenSeconds > 0) {
    return now + Math.round(whenSeconds) * 1000;
  }
  if (typeof time === 'string') {
    const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!m) throw new Error(`Unrecognised time "${time}" - expected 24-hour HH:MM`);
    const hh = parseInt(m[1], 10), mm = parseInt(m[2], 10);
    if (hh > 23 || mm > 59) throw new Error(`Unrecognised time "${time}" - expected 24-hour HH:MM`);

    let year, month, day, explicitDate = false;
    if (typeof date === 'string' && date.trim()) {
      const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
      if (!dm) throw new Error(`Unrecognised date "${date}" - expected YYYY-MM-DD`);
      year = parseInt(dm[1], 10); month = parseInt(dm[2], 10); day = parseInt(dm[3], 10);
      explicitDate = true;
    } else {
      const today = londonParts(new Date(now));
      year = today.year; month = today.month; day = today.day;
    }

    let fireMs = londonWallTimeToUtcMs(year, month, day, hh, mm, 0);
    if (fireMs <= now) {
      if (explicitDate) {
        // A specific date was given and it's already past - almost
        // certainly a mistake (or the user meant next year), not "roll to
        // tomorrow" as with the no-date case below. Reject rather than
        // silently scheduling something that fires immediately.
        throw new Error(`${date} ${time} is in the past`);
      }
      // No date given and that time already passed today (London) -> tomorrow.
      // Date.UTC correctly rolls day=32 etc. into the next month, so a plain
      // +1 is safe here.
      fireMs = londonWallTimeToUtcMs(year, month, day + 1, hh, mm, 0);
    }
    return fireMs;
  }
  throw new Error('Either whenSeconds or time must be provided');
}

export function scheduleItem({ type, label, whenSeconds, time, date, recurrence }) {
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`Unknown type "${type}" - expected one of ${VALID_TYPES.join(', ')}`);
  }
  const rec = VALID_RECURRENCE.includes(recurrence) ? recurrence : 'once';
  const fireAt = computeFireAt({ whenSeconds, time, date });
  const info = db.prepare(
    `INSERT INTO scheduled_items (type, label, fire_at, recurrence, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(type, label || null, fireAt, rec, Date.now());
  return {
    id: info.lastInsertRowid,
    type,
    label: label || null,
    fireAt: new Date(fireAt).toISOString(),
    secondsFromNow: Math.round((fireAt - Date.now()) / 1000),
    recurrence: rec,
  };
}

export function listScheduledItems() {
  const rows = db.prepare(
    `SELECT id, type, label, fire_at, recurrence FROM scheduled_items WHERE cancelled = 0 ORDER BY fire_at ASC`
  ).all();
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    label: r.label,
    fireAt: new Date(r.fire_at).toISOString(),
    secondsFromNow: Math.max(0, Math.round((r.fire_at - Date.now()) / 1000)),
    recurrence: r.recurrence,
  }));
}

export function cancelScheduledItem(id) {
  const info = db.prepare(`UPDATE scheduled_items SET cancelled = 1 WHERE id = ? AND cancelled = 0`).run(id);
  return info.changes > 0;
}

function nextOccurrence(prevFireAtMs, recurrence) {
  const p = londonParts(new Date(prevFireAtMs));
  let day = p.day;
  let ms;
  do {
    day += 1;
    ms = londonWallTimeToUtcMs(p.year, p.month, day, p.hour, p.minute, p.second);
  } while (recurrence === 'weekdays' && isLondonWeekend(ms));
  return ms;
}

// A fired item keeps re-alerting rather than firing once and going quiet -
// real alarms/timers/reminders should be hard to sleep through and easy to
// dismiss once heard. Capped at MAX_RINGS so a forgotten/unreachable device
// doesn't ring forever.
const RING_INTERVAL_MS = 30000;
const MAX_RINGS = 10;

// Retires a ringing item once it's done being repeated - either dismissed
// (stopAllRinging()) or it's rung MAX_RINGS times with no response. 'once'
// items are finished; recurring ones advance to their next real occurrence
// rather than staying cancelled.
function retireRinging(item) {
  if (item.recurrence === 'once') {
    db.prepare(`UPDATE scheduled_items SET cancelled = 1, ringing = 0, ring_count = 0 WHERE id = ?`).run(item.id);
  } else {
    db.prepare(`UPDATE scheduled_items SET fire_at = ?, ringing = 0, ring_count = 0 WHERE id = ?`)
      .run(nextOccurrence(item.fire_at, item.recurrence), item.id);
  }
}

// Polled periodically (see index.js) rather than using setTimeout per item -
// this dev server restarts constantly (node --watch reloads on every file
// save), which would silently drop any in-memory timer. A DB-backed poll
// survives that: whatever's due gets picked up on the next tick after a
// restart, at most a few seconds late instead of never firing at all.
export function checkDueScheduledItems() {
  const now = Date.now();
  const due = db.prepare(`SELECT * FROM scheduled_items WHERE cancelled = 0 AND fire_at <= ?`).all(now);
  const fired = [];
  for (const item of due) {
    const ringCount = item.ring_count + 1;
    fired.push({ id: item.id, type: item.type, label: item.label, ringCount, maxRings: MAX_RINGS });
    if (ringCount >= MAX_RINGS) {
      retireRinging(item);
    } else {
      db.prepare(`UPDATE scheduled_items SET fire_at = ?, ringing = 1, ring_count = ? WHERE id = ?`)
        .run(now + RING_INTERVAL_MS, ringCount, item.id);
    }
  }
  return fired;
}

// Called whenever the user dismisses an alert (see the endConversation tool
// handler in index.js, which calls this on every farewell - harmless no-op
// if nothing happens to be ringing, so it doesn't need to know whether THIS
// particular goodbye was actually about an alert or just an ordinary one).
export function stopAllRinging() {
  const ringing = db.prepare(`SELECT * FROM scheduled_items WHERE ringing = 1 AND cancelled = 0`).all();
  for (const item of ringing) retireRinging(item);
  return ringing.length;
}

// --- Lists (shopping, todo, etc.) ---

const normaliseListName = (name) => String(name || '').trim().toLowerCase();

export function addToList(listName, item) {
  if (!listName || !item) throw new Error('listName and item are both required');
  db.prepare(`INSERT INTO list_items (list_name, item, created_at) VALUES (?, ?, ?)`)
    .run(normaliseListName(listName), String(item).trim(), Date.now());
  return readList(listName);
}

export function readList(listName) {
  if (!listName) throw new Error('listName is required');
  const rows = db.prepare(`SELECT item FROM list_items WHERE list_name = ? ORDER BY created_at ASC`)
    .all(normaliseListName(listName));
  return { listName: String(listName).trim(), items: rows.map((r) => r.item) };
}

export function removeFromList(listName, item) {
  if (!listName || !item) throw new Error('listName and item are both required');
  const row = db.prepare(
    `SELECT id FROM list_items WHERE list_name = ? AND LOWER(item) = LOWER(?) ORDER BY created_at ASC LIMIT 1`
  ).get(normaliseListName(listName), String(item).trim());
  if (!row) return false;
  db.prepare(`DELETE FROM list_items WHERE id = ?`).run(row.id);
  return true;
}

export function clearList(listName) {
  if (!listName) throw new Error('listName is required');
  db.prepare(`DELETE FROM list_items WHERE list_name = ?`).run(normaliseListName(listName));
  return true;
}
