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
// History: nothing is ever deleted. scheduled_for is the time the user asked
// for (fire_at drifts forward while an item re-rings); cancelled_at/ended_at/
// ended_reason record how and when it finished ('cancelled', 'dismissed' =
// rang and was acknowledged, 'unanswered' = rang its maximum times with no
// response); first_fired_at is when it first went off. schedule_events is the
// full timeline (created / edited / fired / dismissed / unanswered / cancelled)
// used to answer "did my reminder go off?" and "what did I set yesterday?".
try { db.exec(`ALTER TABLE scheduled_items ADD COLUMN scheduled_for INTEGER`); } catch (_) { }
try { db.exec(`ALTER TABLE scheduled_items ADD COLUMN first_fired_at INTEGER`); } catch (_) { }
try { db.exec(`ALTER TABLE scheduled_items ADD COLUMN cancelled_at INTEGER`); } catch (_) { }
try { db.exec(`ALTER TABLE scheduled_items ADD COLUMN ended_at INTEGER`); } catch (_) { }
try { db.exec(`ALTER TABLE scheduled_items ADD COLUMN ended_reason TEXT`); } catch (_) { }
db.exec(`
  CREATE TABLE IF NOT EXISTS schedule_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    item_type TEXT NOT NULL,
    label TEXT,
    event TEXT NOT NULL,
    at INTEGER NOT NULL,
    scheduled_for INTEGER,
    detail TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_schedule_events_at ON schedule_events(at);
`);

function logEvent(item, event, { at = Date.now(), scheduledFor = null, detail = null } = {}) {
  db.prepare(`INSERT INTO schedule_events (item_id, item_type, label, event, at, scheduled_for, detail) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(item.id, item.type, item.label || null, event, at, scheduledFor, detail);
}

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
    `INSERT INTO scheduled_items (type, label, fire_at, recurrence, created_at, scheduled_for) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(type, label || null, fireAt, rec, Date.now(), fireAt);
  logEvent({ id: info.lastInsertRowid, type, label }, 'created', { scheduledFor: fireAt, detail: rec === 'once' ? null : rec });
  return {
    id: info.lastInsertRowid,
    type,
    label: label || null,
    fireAt: new Date(fireAt).toISOString(),
    secondsFromNow: Math.round((fireAt - Date.now()) / 1000),
    recurrence: rec,
  };
}

export function listScheduledItems(type = null) {
  const rows = type
    ? db.prepare(`SELECT id, type, label, fire_at, recurrence FROM scheduled_items WHERE cancelled = 0 AND type = ? ORDER BY fire_at ASC`).all(type)
    : db.prepare(`SELECT id, type, label, fire_at, recurrence FROM scheduled_items WHERE cancelled = 0 ORDER BY fire_at ASC`).all();
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
  const item = db.prepare(`SELECT * FROM scheduled_items WHERE id = ? AND cancelled = 0`).get(id);
  if (!item) return false;
  const now = Date.now();
  db.prepare(`UPDATE scheduled_items SET cancelled = 1, ringing = 0, cancelled_at = ?, ended_at = ?, ended_reason = 'cancelled' WHERE id = ?`).run(now, now, id);
  logEvent(item, 'cancelled', { at: now, scheduledFor: item.scheduled_for || item.fire_at });
  return true;
}

// Web-editing counterpart to scheduleItem() - used by the /ims/alarms,
// /ims/reminders and /ims/timers pages, where a user revises an existing
// entry rather than cancelling and recreating it. Any field not supplied
// keeps its current value.
export function updateScheduledItem(id, { label, whenSeconds, time, date, recurrence }) {
  const existing = db.prepare(`SELECT * FROM scheduled_items WHERE id = ? AND cancelled = 0`).get(id);
  if (!existing) throw new Error('Scheduled item not found');
  const rec = recurrence !== undefined
    ? (VALID_RECURRENCE.includes(recurrence) ? recurrence : 'once')
    : existing.recurrence;
  const fireAt = (whenSeconds !== undefined || time !== undefined || date !== undefined)
    ? computeFireAt({ whenSeconds, time, date })
    : existing.fire_at;
  db.prepare(`UPDATE scheduled_items SET label = ?, fire_at = ?, scheduled_for = ?, recurrence = ?, ringing = 0, ring_count = 0 WHERE id = ?`)
    .run(label !== undefined ? (label || null) : existing.label, fireAt, fireAt, rec, id);
  logEvent({ id, type: existing.type, label: label !== undefined ? (label || null) : existing.label }, 'edited', { scheduledFor: fireAt });
  return {
    id,
    type: existing.type,
    label: label !== undefined ? (label || null) : existing.label,
    fireAt: new Date(fireAt).toISOString(),
    secondsFromNow: Math.max(0, Math.round((fireAt - Date.now()) / 1000)),
    recurrence: rec,
  };
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
function retireRinging(item, reason = 'dismissed') {
  const now = Date.now();
  logEvent(item, reason, { at: now, scheduledFor: item.scheduled_for || item.fire_at, detail: `rang ${item.ring_count} time(s)` });
  if (item.recurrence === 'once') {
    db.prepare(`UPDATE scheduled_items SET cancelled = 1, ringing = 0, ring_count = 0, ended_at = ?, ended_reason = ? WHERE id = ?`).run(now, reason, item.id);
  } else {
    const next = nextOccurrence(item.fire_at, item.recurrence);
    db.prepare(`UPDATE scheduled_items SET fire_at = ?, scheduled_for = ?, ringing = 0, ring_count = 0, first_fired_at = NULL WHERE id = ?`)
      .run(next, next, item.id);
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
    if (!item.first_fired_at) {
      db.prepare(`UPDATE scheduled_items SET first_fired_at = ? WHERE id = ?`).run(now, item.id);
      logEvent(item, 'fired', { at: now, scheduledFor: item.scheduled_for || item.fire_at });
    }
    if (ringCount >= MAX_RINGS) {
      retireRinging({ ...item, ring_count: ringCount }, 'unanswered');
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
  for (const item of ringing) retireRinging(item, 'dismissed');
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

export function getActiveScheduledStatus() {
  const rows = db.prepare(`SELECT type, COUNT(*) as n FROM scheduled_items WHERE cancelled = 0 GROUP BY type`).all();
  const counts = { alarm: 0, timer: 0, reminder: 0 };
  for (const r of rows) counts[r.type] = r.n;
  return {
    hasAlarm: counts.alarm > 0,
    hasTimer: counts.timer > 0,
    hasReminder: counts.reminder > 0,
    alarmCount: counts.alarm,
    timerCount: counts.timer,
    reminderCount: counts.reminder,
  };
}

// Items firing today (London calendar date) - used by the morning report to
// mention "you've got X on today", not the full outstanding list.
export function getItemsDueToday() {
  const today = londonParts(new Date());
  const startMs = londonWallTimeToUtcMs(today.year, today.month, today.day, 0, 0, 0);
  const endMs = londonWallTimeToUtcMs(today.year, today.month, today.day, 23, 59, 59);
  const rows = db.prepare(
    `SELECT id, type, label, fire_at FROM scheduled_items WHERE cancelled = 0 AND fire_at BETWEEN ? AND ? ORDER BY fire_at ASC`
  ).all(startMs, endMs);
  return rows.map((r) => ({ id: r.id, type: r.type, label: r.label, fireAt: new Date(r.fire_at).toISOString() }));
}


// --- History / archive ------------------------------------------------------

const msToIso = (ms) => (ms ? new Date(ms).toISOString() : null);
const londonFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON_TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const londonText = (ms) => (ms ? londonFmt.format(new Date(ms)) : null);

// Finished items (cancelled, or once-only ones that went off), newest first.
// outcome: cancelled | dismissed (went off, acknowledged) | unanswered (rang
// the maximum times, nobody responded) | ended (older records with no reason).
export function getArchivedItems({ type = null, days = 30, search = '' } = {}) {
  const since = days > 0 ? Date.now() - days * 86400000 : 0;
  const term = `%${String(search || '').trim()}%`;
  const rows = db.prepare(
    `SELECT * FROM scheduled_items WHERE cancelled = 1 ${type ? 'AND type = ?' : ''}
       AND COALESCE(ended_at, cancelled_at, first_fired_at, fire_at) >= ? AND COALESCE(label, '') LIKE ?
     ORDER BY COALESCE(ended_at, cancelled_at, first_fired_at, fire_at) DESC LIMIT 500`
  ).all(...(type ? [type] : []), since, term);
  return rows.map((r) => ({
    id: r.id, type: r.type, label: r.label, recurrence: r.recurrence,
    createdAt: msToIso(r.created_at),
    scheduledFor: msToIso(r.scheduled_for || r.fire_at),
    firstFiredAt: msToIso(r.first_fired_at),
    endedAt: msToIso(r.ended_at || r.cancelled_at),
    outcome: r.ended_reason || 'ended',
  }));
}

// The full timeline of what happened, newest first.
export function getScheduleEvents({ type = null, sinceMs = 0, untilMs = Date.now() + 1, limit = 300 } = {}) {
  return db.prepare(
    `SELECT * FROM schedule_events WHERE at >= ? AND at < ? ${type ? 'AND item_type = ?' : ''} ORDER BY at DESC LIMIT ?`
  ).all(sinceMs, untilMs, ...(type ? [type] : []), limit).map((e) => ({
    id: e.id, itemId: e.item_id, type: e.item_type, label: e.label, event: e.event,
    at: msToIso(e.at), scheduledFor: msToIso(e.scheduled_for), detail: e.detail,
  }));
}

// Plain-language history for a period - what the voice tool returns so Ims
// can answer "did my reminders go off?" or "what alarms did I set yesterday?".
// Times are given in London local time.
export function getHistorySummary({ type = null, period = 'yesterday' } = {}) {
  const now = Date.now();
  const today = londonParts(new Date(now));
  const startOfToday = londonWallTimeToUtcMs(today.year, today.month, today.day, 0, 0, 0);
  const windows = {
    today: [startOfToday, now + 1],
    yesterday: [londonWallTimeToUtcMs(today.year, today.month, today.day - 1, 0, 0, 0), startOfToday],
    week: [now - 7 * 86400000, now + 1],
    month: [now - 30 * 86400000, now + 1],
  };
  const [from, to] = windows[period] || windows.yesterday;
  const events = getScheduleEvents({ type, sinceMs: from, untilMs: to, limit: 200 }).reverse();
  return {
    period: windows[period] ? period : 'yesterday',
    from: londonText(from), to: londonText(to - 1),
    events: events.map((e) => ({
      when: londonText(Date.parse(e.at)), type: e.type, label: e.label || '(unlabelled)', event: e.event,
      scheduledFor: londonText(e.scheduledFor ? Date.parse(e.scheduledFor) : null), detail: e.detail,
    })),
  };
}
