import db from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Call / meeting recordings. While one is active Ims must be completely silent
// (see index.js, which drops everything Gemini says and the firmware, which
// ignores anything it is sent). This service only owns the data: the active
// recording, its transcript lines, and the AI summary.
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

db.exec(`
  CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    with_whom TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    source TEXT,
    summary TEXT,
    summarised_at INTEGER,
    deleted_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS recording_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recording_id INTEGER NOT NULL,
    at INTEGER NOT NULL,
    text TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_recording_lines_rec ON recording_lines(recording_id, id);
`);

// A recording still marked active at start-up means the server died mid-call.
// The transcript so far is kept.
db.prepare(`UPDATE recordings SET status = 'interrupted', ended_at = COALESCE(ended_at, ?) WHERE status = 'recording'`).run(Date.now());

const MAX_MS = 4 * 60 * 60 * 1000;
const LINE_GAP_MS = 2500;

let active = null; // { id, withWhom, startedAt, pending, lastFragmentAt, tail }
const listeners = new Set();
export const onRecordingChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = () => { for (const fn of listeners) { try { fn(getRecordingStatus()); } catch (_) { /* listener errors never matter here */ } } };

export const isRecordingActive = () => active !== null;

export function getRecordingStatus() {
  return active
    ? { active: true, id: active.id, withWhom: active.withWhom, startedAt: active.startedAt }
    : { active: false };
}

export function startRecording(withWhom, source = 'voice') {
  if (active) return getRecordingStatus();
  const who = String(withWhom || '').trim().slice(0, 120) || 'Unknown';
  const now = Date.now();
  const info = db.prepare(`INSERT INTO recordings (with_whom, status, started_at, source) VALUES (?, 'recording', ?, ?)`).run(who, now, source);
  active = { id: Number(info.lastInsertRowid), withWhom: who, startedAt: now, pending: '', pendingAt: 0, lastFragmentAt: 0 };
  notify();
  return getRecordingStatus();
}

function flushPending() {
  if (!active || !active.pending.trim()) { if (active) active.pending = ''; return; }
  db.prepare(`INSERT INTO recording_lines (recording_id, at, text) VALUES (?, ?, ?)`).run(active.id, active.pendingAt, active.pending.trim());
  active.pending = '';
}

// Ims + stop / end / finish, optionally "recording" or "call". Speech-to-text
// hears "IMS" a few ways, so the name is matched loosely - but it must be there:
// the user talks to other people during a call and a bare "stop" means nothing.
const NAME = "(?:ims|i\\.?['’]?\\s?m\\.?\\s?s\\.?|im's|imz|aims|eims)";
const STOP_RE = new RegExp(`\\b${NAME}[\\s,.!?-]+(?:please\\s+)?(?:stop|end|finish)(?:\\s+(?:the\\s+)?(?:recording|call|meeting))?[\\s.!?]*$`, 'i');
const STOP_TAIL_RE = new RegExp(`(?:\\b(?:hey|hi|eh up)[\\s,]+)?${NAME}[\\s,.!?-]+(?:please\\s+)?(?:stop|end|finish)(?:\\s+(?:the\\s+)?(?:recording|call|meeting))?[\\s.!?]*$`, 'i');

// "IMS stop" / "stop IMS" (also cancel, enough) at the end of what was just said.
// Used to cancel whatever Ims is doing and return it to standby - see index.js.
const CANCEL_WORD = '(?:stop|cancel|enough)';
const CANCEL_TAIL = '(?:\\s+(?:please|now|it|thanks|everything))*[\\s.!?]*$';
const CANCEL_RE_A = new RegExp(`\\b${NAME}[\\s,.!?-]+(?:please\\s+)?${CANCEL_WORD}${CANCEL_TAIL}`, 'i');
const CANCEL_RE_B = new RegExp(`\\b${CANCEL_WORD}(?:\\s+it)?[\\s,.!?-]+${NAME}[\\s.!?]*$`, 'i');
export const isCancelCommand = (text) => CANCEL_RE_A.test(String(text || '').trim()) || CANCEL_RE_B.test(String(text || '').trim());

// Feed each transcription fragment. Returns true when it contained the stop phrase.
export function appendRecordingText(fragment) {
  if (!active || !fragment) return false;
  const now = Date.now();
  if (active.pending && now - active.lastFragmentAt > LINE_GAP_MS) flushPending();
  if (!active.pending) active.pendingAt = now;
  active.pending += fragment;
  active.lastFragmentAt = now;
  if (now - active.startedAt > MAX_MS) return true;
  return STOP_RE.test(active.pending.trim());
}

// Ends the recording, dropping the spoken stop command from the end of the transcript.
export function stopRecording() {
  if (!active) return null;
  active.pending = active.pending.replace(STOP_TAIL_RE, '');
  flushPending();
  const id = active.id;
  db.prepare(`UPDATE recordings SET status = 'completed', ended_at = ? WHERE id = ?`).run(Date.now(), id);
  active = null;
  notify();
  return getRecording(id);
}

const fmtClock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', second: '2-digit' });

function shape(row, withTranscript) {
  if (!row) return null;
  const lines = withTranscript ? db.prepare(`SELECT at, text FROM recording_lines WHERE recording_id = ? ORDER BY id`).all(row.id) : null;
  return {
    id: row.id, withWhom: row.with_whom, status: row.status, source: row.source,
    startedAt: row.started_at, endedAt: row.ended_at,
    durationSec: row.ended_at ? Math.round((row.ended_at - row.started_at) / 1000) : null,
    summary: row.summary ? JSON.parse(row.summary) : null, summarisedAt: row.summarised_at,
    ...(withTranscript ? { lines: lines.map((l) => ({ at: l.at, clock: fmtClock(l.at), text: l.text })) } : {}),
  };
}

export function listRecordings() {
  return db.prepare(`SELECT * FROM recordings WHERE deleted_at IS NULL ORDER BY started_at DESC`).all().map((r) => {
    const s = shape(r, false);
    s.wordCount = db.prepare(`SELECT text FROM recording_lines WHERE recording_id = ?`).all(r.id).reduce((n, l) => n + l.text.split(/\s+/).length, 0);
    return s;
  });
}

export function getRecording(id) {
  return shape(db.prepare(`SELECT * FROM recordings WHERE id = ? AND deleted_at IS NULL`).get(id), true);
}

export function deleteRecording(id) {
  if (active?.id === Number(id)) throw new Error('Stop the recording before deleting it.');
  const info = db.prepare(`UPDATE recordings SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`).run(Date.now(), id);
  return info.changes > 0;
}

export function renameRecording(id, withWhom) {
  const who = String(withWhom || '').trim().slice(0, 120);
  if (!who) throw new Error('Who the recording was with cannot be empty.');
  return db.prepare(`UPDATE recordings SET with_whom = ? WHERE id = ? AND deleted_at IS NULL`).run(who, id).changes > 0;
}

export function transcriptText(rec) {
  return rec.lines.map((l) => `[${l.clock}] ${l.text}`).join('\n');
}

export async function summariseRecording(id) {
  const rec = getRecording(id);
  if (!rec) throw new Error('Recording not found.');
  if (rec.status === 'recording') throw new Error('Wait until the recording has ended.');
  if (!rec.lines.length) throw new Error('This recording has no transcript to summarise.');

  const when = new Date(rec.startedAt).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'full', timeStyle: 'short' });
  const prompt =
    `You are helping the person who recorded this call or meeting (the microphone is theirs; other voices may be picked up faintly or not at all, ` +
    `and the transcript has no speaker labels or punctuation guarantees). It was with: ${rec.withWhom}. It took place on ${when}.\n\n` +
    `Return ONLY a JSON object with these keys:\n` +
    `"summary": a short paragraph of what the call was about and how it went,\n` +
    `"actionItems": array of {"task": string, "owner": string (who, if clear, else ""), "due": string (if mentioned, else "")},\n` +
    `"followUpQuestions": array of questions worth asking or answering next time,\n` +
    `"keyPoints": array of the important facts, figures, names and decisions,\n` +
    `"decisions": array of things that were agreed,\n` +
    `"risksOrConcerns": array of worries, blockers or things that could go wrong,\n` +
    `"suggestedNextSteps": array of anything else that would help the recorder after the call.\n` +
    `Use British English. Only include what the transcript supports - do not invent. Use empty arrays where there is nothing.\n\nTRANSCRIPT:\n${transcriptText(rec)}`;

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } });
  const result = await model.generateContent(prompt);
  let parsed;
  try { parsed = JSON.parse(result.response.text()); }
  catch (_) { throw new Error('The summary came back in an unreadable format - try again.'); }
  db.prepare(`UPDATE recordings SET summary = ?, summarised_at = ? WHERE id = ?`).run(JSON.stringify(parsed), Date.now(), id);
  return getRecording(id);
}
