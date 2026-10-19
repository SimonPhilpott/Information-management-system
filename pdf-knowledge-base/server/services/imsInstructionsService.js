// Ims's instructions: things Simon has asked Ims to do later - reminders for Ims rather than for Simon.
// "When Rowan's on camera between 8:30 and 9 tonight, say 'Hello Rowan, isn't it time for bed?'",
// "At 6pm tell me to put the oven on", "Next time we talk, ask me how the interview went",
// "Always call the cat Mr Biscuits". Each is stored precisely - what to do, the exact words to say, when or
// for whom, and any time window - so he does exactly what he was asked, at the right moment (16 Oct: he told
// Rowan it was bedtime at 3:25 in the afternoon, when Simon had said he'd be there at 8:30-9).
//
// Triggers:
//   time              - at a set time (once, or daily); the desk speaks it like a reminder
//   person            - when that person is seen at the desk (optionally only within a time window)
//   next_conversation - the next time Simon talks to him
//   standing          - a rule he keeps until it's cancelled (shown in his records, never "done")
import db from '../db/database.js';
import { computeFireAt } from './remindersService.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS ims_instructions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instruction TEXT NOT NULL,
    say TEXT,
    simon_said TEXT,
    trigger TEXT NOT NULL,
    person TEXT,
    at INTEGER,
    not_before INTEGER,
    not_after INTEGER,
    repeat TEXT NOT NULL DEFAULT 'once',
    status TEXT NOT NULL DEFAULT 'pending',
    origin TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    fired_at INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    done_count INTEGER NOT NULL DEFAULT 0,
    last_done_at INTEGER,
    outcome TEXT,
    missed_from INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_ims_instructions_status ON ims_instructions(status);
`);

export const TRIGGERS = ['time', 'person', 'next_conversation', 'standing'];
export const REPEATS = ['once', 'daily', 'every_time'];
const DAY_MS = 86400000;
const RETRY_MS = 2 * 60000;   // a time instruction the desk couldn't say is tried again after this
const MAX_ATTEMPTS = 3;       // ...this many times, then he does it the next time Simon talks to him
const PERSON_GAP_MS = 30 * 60000; // 'every_time' for a person: not again within half an hour

const tz = 'Europe/London';
export const londonWhen = (ms) => (ms ? new Date(ms).toLocaleString('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const londonClock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });

const rowOut = (r) => r && ({
  id: r.id, instruction: r.instruction, say: r.say || null, simonSaid: r.simon_said || null,
  trigger: r.trigger, person: r.person || null, at: r.at || null, notBefore: r.not_before || null, notAfter: r.not_after || null,
  repeat: r.repeat, status: r.status, origin: r.origin || null, createdAt: r.created_at, updatedAt: r.updated_at || null,
  firedAt: r.fired_at || null, attempts: r.attempts, doneCount: r.done_count, lastDoneAt: r.last_done_at || null,
  outcome: r.outcome || null, missedFrom: r.missed_from || null,
});

// A London time ("20:30", "8:30pm") and date ("today", "tomorrow", "YYYY-MM-DD") as epoch ms - the same parsing
// reminders use. A bare time already past today rolls to tomorrow; `allowPast` keeps it today (window starts).
function whenMs(time, date, { allowPast = false } = {}) {
  if (time === undefined || time === null || time === '') return null;
  if (typeof time === 'number') return time;
  const s = String(time).trim();
  const iso = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2})/.exec(s); // "2026-10-19T20:30"
  if (iso) return computeFireAt({ time: iso[2], date: iso[1] });
  if (allowPast) {
    try { return computeFireAt({ time: s, date: date || 'today' }); } catch (_) { /* a past explicit date */ }
  }
  return computeFireAt({ time: s, date: date || undefined });
}

// The one line that says exactly what he'll do and when - read back to Simon, shown on the page and in his records
export function describe(r) {
  const x = 'createdAt' in r ? r : rowOut(r);
  const what = x.say ? `${x.instruction.replace(/[.\s]+$/, '')} - saying "${x.say}"` : x.instruction;
  const win = x.notBefore && x.notAfter ? ` between ${londonClock(x.notBefore)} and ${londonClock(x.notAfter)} (${londonWhen(x.notBefore).split(',')[0]})`
    : x.notBefore ? ` after ${londonWhen(x.notBefore)}` : x.notAfter ? ` until ${londonWhen(x.notAfter)}` : '';
  const rep = x.repeat === 'daily' ? ', every day' : x.repeat === 'every_time' ? ', every time' : '';
  if (x.trigger === 'time') return `At ${londonWhen(x.at)}${rep}: ${what}`;
  if (x.trigger === 'person') return `When ${x.person} is at the desk${win}${rep}: ${what}`;
  if (x.trigger === 'next_conversation') return `Next time Simon talks to me${win}: ${what}${x.missedFrom ? ` (it was due ${londonWhen(x.missedFrom)} but couldn't be said then)` : ''}`;
  return `Always${win}: ${what}`;
}

export function addInstruction({ instruction, say, simonSaid, trigger, person, time, date, notBefore, notAfter, notBeforeDate, notAfterDate, repeat = 'once', origin = 'desk' } = {}) {
  const text = String(instruction || '').trim();
  if (!text) throw new Error('instruction is required - what exactly should Ims do?');
  const trig = String(trigger || '').trim();
  if (!TRIGGERS.includes(trig)) throw new Error(`trigger must be one of ${TRIGGERS.join(', ')}`);
  const rep = REPEATS.includes(repeat) ? repeat : 'once';
  const who = trig === 'person' ? String(person || '').trim() : null;
  if (trig === 'person' && !who) throw new Error('person is required for a person trigger - who should he do it for?');
  const at = trig === 'time' ? whenMs(time, date) : null;
  if (trig === 'time' && !at) throw new Error('time is required for a time trigger - when should he do it?');
  const nb = whenMs(notBefore, notBeforeDate, { allowPast: true });
  let na = whenMs(notAfter, notAfterDate || notBeforeDate, { allowPast: true });
  if (nb && na && na <= nb) na += DAY_MS; // "between 11pm and 1am"
  if (na && na < Date.now()) throw new Error('that time window has already passed');
  const now = Date.now();
  const id = db.prepare(`INSERT INTO ims_instructions (instruction, say, simon_said, trigger, person, at, not_before, not_after, repeat, origin, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(text, String(say || '').trim() || null, String(simonSaid || '').trim() || null, trig, who, at, nb, na, rep, origin, now, now).lastInsertRowid;
  return getInstruction(id);
}

export function getInstruction(id) {
  return rowOut(db.prepare('SELECT * FROM ims_instructions WHERE id = ?').get(Number(id)));
}

export function listInstructions({ status = 'pending', limit = 200 } = {}) {
  const rows = status === 'all'
    ? db.prepare('SELECT * FROM ims_instructions ORDER BY (status = \'pending\') DESC, COALESCE(at, not_before, created_at) ASC LIMIT ?').all(limit)
    : status === 'finished'
      ? db.prepare("SELECT * FROM ims_instructions WHERE status != 'pending' ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ?").all(limit)
      : db.prepare("SELECT * FROM ims_instructions WHERE status = 'pending' ORDER BY COALESCE(at, not_before, created_at) ASC LIMIT ?").all(limit);
  return rows.map(rowOut);
}

export function updateInstruction(id, fields = {}) {
  const cur = db.prepare('SELECT * FROM ims_instructions WHERE id = ?').get(Number(id));
  if (!cur) throw new Error(`No instruction #${id}`);
  const set = {};
  if (fields.instruction !== undefined) { const t = String(fields.instruction).trim(); if (!t) throw new Error('instruction cannot be empty'); set.instruction = t; }
  if (fields.say !== undefined) set.say = String(fields.say || '').trim() || null;
  if (fields.trigger !== undefined) { if (!TRIGGERS.includes(fields.trigger)) throw new Error(`trigger must be one of ${TRIGGERS.join(', ')}`); set.trigger = fields.trigger; }
  if (fields.person !== undefined) set.person = String(fields.person || '').trim() || null;
  if (fields.repeat !== undefined && REPEATS.includes(fields.repeat)) set.repeat = fields.repeat;
  if (fields.time !== undefined || fields.date !== undefined) set.at = fields.time ? whenMs(fields.time, fields.date) : null;
  if (fields.notBefore !== undefined) set.not_before = fields.notBefore ? whenMs(fields.notBefore, fields.notBeforeDate, { allowPast: true }) : null;
  if (fields.notAfter !== undefined) set.not_after = fields.notAfter ? whenMs(fields.notAfter, fields.notAfterDate || fields.notBeforeDate, { allowPast: true }) : null;
  if (fields.status !== undefined && ['pending', 'done', 'cancelled'].includes(fields.status)) set.status = fields.status;
  const trig = set.trigger || cur.trigger;
  if (trig === 'time' && !(set.at !== undefined ? set.at : cur.at)) throw new Error('a time instruction needs a time');
  if (trig === 'person' && !(set.person !== undefined ? set.person : cur.person)) throw new Error('a person instruction needs a person');
  if ((set.not_before ?? cur.not_before) && (set.not_after ?? cur.not_after) && (set.not_after ?? cur.not_after) <= (set.not_before ?? cur.not_before)) set.not_after = (set.not_after ?? cur.not_after) + DAY_MS;
  set.updated_at = Date.now();
  if (set.at !== undefined || set.trigger !== undefined || set.status === 'pending') { set.fired_at = null; set.attempts = 0; }
  const keys = Object.keys(set);
  db.prepare(`UPDATE ims_instructions SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => set[k]), Number(id));
  return getInstruction(id);
}

export function cancelInstruction(id) {
  const r = db.prepare("UPDATE ims_instructions SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'pending'").run(Date.now(), Number(id));
  if (!r.changes) throw new Error(`No pending instruction #${id}`);
  return getInstruction(id);
}

export function deleteInstruction(id) {
  return db.prepare('DELETE FROM ims_instructions WHERE id = ?').run(Number(id)).changes > 0;
}

// Done: a once-only one is finished; a daily one moves on a day; an 'every time' one stays, noting when.
export function completeInstruction(id, outcome = '') {
  const r = db.prepare('SELECT * FROM ims_instructions WHERE id = ?').get(Number(id));
  if (!r) throw new Error(`No instruction #${id}`);
  if (r.status !== 'pending') return rowOut(r);
  if (r.trigger === 'standing') return rowOut(r); // a rule, never "done"
  const now = Date.now();
  const note = String(outcome || '').trim().slice(0, 400) || null;
  if (r.repeat === 'daily') {
    // on to tomorrow: the time, and the window (keeping its length)
    const shift = (ms) => { if (!ms) return null; let v = ms; while (v <= now) v += DAY_MS; return v; };
    const nb = r.not_before ? shift(r.not_before) : null;
    const na = nb && r.not_after ? nb + (r.not_after - r.not_before) : r.not_after ? shift(r.not_after) : null;
    db.prepare(`UPDATE ims_instructions SET at = ?, not_before = ?, not_after = ?, fired_at = NULL, attempts = 0, done_count = done_count + 1,
      last_done_at = ?, outcome = ?, updated_at = ? WHERE id = ?`)
      .run(shift(r.at), nb, na, now, note, now, r.id);
  } else if (r.repeat === 'every_time') {
    db.prepare('UPDATE ims_instructions SET done_count = done_count + 1, last_done_at = ?, outcome = ?, fired_at = NULL, attempts = 0, updated_at = ? WHERE id = ?').run(now, note, now, r.id);
  } else {
    db.prepare("UPDATE ims_instructions SET status = 'done', done_count = done_count + 1, last_done_at = ?, outcome = ?, updated_at = ? WHERE id = ?").run(now, note, now, r.id);
  }
  return getInstruction(id);
}

const inWindow = (r, now) => (!r.not_before || r.not_before <= now) && (!r.not_after || r.not_after >= now);
const sameName = (a, b) => {
  const f = (s) => String(s || '').trim().toLowerCase().split(/\s+/)[0];
  return f(a) && f(a) === f(b);
};

// Person instructions to carry out now for these people (who are at the desk)
export function forPeople(names = [], now = Date.now()) {
  if (!names.length) return [];
  return db.prepare("SELECT * FROM ims_instructions WHERE status = 'pending' AND trigger = 'person'").all()
    .filter((r) => names.some((n) => sameName(n, r.person)) && inWindow(r, now)
      && !(r.repeat === 'every_time' && r.last_done_at && now - r.last_done_at < PERSON_GAP_MS)
      && !(r.fired_at && now - r.fired_at < RETRY_MS))
    .map(rowOut);
}

// Tidy-up and what's due: called every few seconds by the scheduler.
//  - window passed: a once-only one has expired; a daily one moves on to tomorrow's window
//  - a time one the desk couldn't say after a few tries is kept for the next conversation
// Returns the time instructions due to be said now.
export function dueNow(now = Date.now()) {
  for (const r of db.prepare("SELECT * FROM ims_instructions WHERE status = 'pending' AND not_after IS NOT NULL AND not_after < ?").all(now)) {
    if (r.repeat === 'daily') {
      let nb = r.not_before, na = r.not_after;
      while (na < now) { na += DAY_MS; if (nb) nb += DAY_MS; }
      db.prepare('UPDATE ims_instructions SET not_before = ?, not_after = ?, fired_at = NULL, attempts = 0, updated_at = ? WHERE id = ?').run(nb, na, now, r.id);
    } else if (r.repeat === 'every_time' && r.done_count > 0) {
      db.prepare("UPDATE ims_instructions SET status = 'done', updated_at = ? WHERE id = ?").run(now, r.id);
    } else {
      db.prepare("UPDATE ims_instructions SET status = 'expired', outcome = COALESCE(outcome, 'The time window passed before it could be done'), updated_at = ? WHERE id = ?").run(now, r.id);
    }
  }
  for (const r of db.prepare("SELECT * FROM ims_instructions WHERE status = 'pending' AND trigger = 'time' AND attempts >= ? AND fired_at < ?").all(MAX_ATTEMPTS, now - RETRY_MS)) {
    db.prepare("UPDATE ims_instructions SET trigger = 'next_conversation', missed_from = at, fired_at = NULL, attempts = 0, updated_at = ? WHERE id = ?").run(now, r.id);
  }
  return db.prepare("SELECT * FROM ims_instructions WHERE status = 'pending' AND trigger = 'time' AND at <= ? AND (fired_at IS NULL OR fired_at < ?) ORDER BY at")
    .all(now, now - RETRY_MS).filter((r) => inWindow(r, now)).map(rowOut);
}

export function markFired(id, now = Date.now()) {
  db.prepare('UPDATE ims_instructions SET fired_at = ?, attempts = attempts + 1 WHERE id = ?').run(now, Number(id));
}

// What goes into his records for every session
export function instructionsForPrompt(now = Date.now()) {
  const rows = db.prepare("SELECT * FROM ims_instructions WHERE status = 'pending' ORDER BY COALESCE(at, not_before, created_at)").all();
  if (!rows.length) return '';
  const line = (r) => `#${r.id} ${describe(r)}`;
  const standing = rows.filter((r) => r.trigger === 'standing' && inWindow(r, now));
  const nextTalk = rows.filter((r) => r.trigger === 'next_conversation' && inWindow(r, now));
  const later = rows.filter((r) => r.trigger === 'time' || r.trigger === 'person');
  const out = [];
  if (standing.length) out.push(`standing rules (keep to these every time) - ${standing.map(line).join('; ')}`);
  if (nextTalk.length) out.push(`do in this conversation, once it's under way (not in a greeting), then call completeInstruction - ${nextTalk.map(line).join('; ')}`);
  if (later.length) out.push(`waiting for their moment (you'll be told when - don't do them early) - ${later.map(line).join('; ')}`);
  return out.join(' | ');
}

// The words he's given when one is carried out now
export function carryOutPrompt(rows) {
  return rows.map((r) => `#${r.id}: ${r.instruction}${r.say ? ` Say exactly: "${r.say}"` : ''}`).join(' ');
}
