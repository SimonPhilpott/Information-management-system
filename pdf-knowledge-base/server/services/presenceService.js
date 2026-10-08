import { EventEmitter } from 'events';
import db from '../db/database.js';
import { getFrame } from './cameraService.js';
import { detectFacesFast, matchEmbedding } from './faceService.js';
import { isRecordingActive } from './recordingService.js';

// Desk presence: watches the live camera frames (locally - the same YuNet +
// SFace engine as /ims/faces, nothing leaves this machine) to know whether
// someone is at the desk and who. It is silent - it only ever:
//   - emits 'gaze' {x, y} (or null when nobody's there) so Ims's eyes on the
//     Box-3 can follow the person in front of him, and
//   - emits 'greet' {names} once when an enrolled person sits down after being
//     away, so the Box-3 can have Ims say hello by name (the device only does
//     it from standby, never while recording, muted or asleep).
// Sessions are kept in desk_presence for /api/camera/presence.
//
// Absence has to be SEEN: while the camera isn't delivering frames (asleep,
// unplugged, or a call/meeting recording - no camera activity at all then) the
// state goes back to "unknown", so coming back from a long recording or a
// restart never counts as "just sat down".

const TICK_MS = 250;                    // how often a fresh frame is looked at
const FRESH_MS = 2000;                  // older frames are not looked at
const BLIND_MS = 20000;                 // no fresh frames this long -> state unknown
const GAZE_LOST_MS = 1500;              // no face this long -> eyes go back to their own glances
const GAZE_REPEAT_MS = 3000;            // the device forgets a gaze it isn't reminded of
const LEAVE_MS = 30000;                 // no face this long -> they've left the desk
const AWAY_BEFORE_GREET_MS = 5 * 60000; // must have been seen away this long to be greeted on return
const RECOGNISE_WINDOW_MS = 20000;      // after sitting down, how long recognition may take
const MATCHES_TO_GREET = 2;             // matches needed in that window (one stray match never greets)
// The camera faces the person, so someone on the right of the picture is on
// Ims's left: his eyes move the opposite way across the screen. If the eyes
// look away from you rather than at you, set this to false.
const GAZE_MIRROR_X = true;

db.exec(`
  CREATE TABLE IF NOT EXISTS desk_presence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    last_seen_at INTEGER NOT NULL,
    names TEXT NOT NULL DEFAULT '[]',
    greeted TEXT
  );
`);
// A restart can't know when an open session really ended: close it at the last sighting.
db.prepare('UPDATE desk_presence SET ended_at = last_seen_at WHERE ended_at IS NULL').run();

const events = new EventEmitter();
export const onPresence = (event, fn) => { events.on(event, fn); return () => events.off(event, fn); };

let present = null;        // null = unknown (not watching), false = nobody, true = someone at the desk
let absentSince = 0;       // when the desk was last seen to empty (only meaningful while present === false)
let lastFreshAt = 0;
let lastFaceAt = 0;
let lastFrameAt = 0;
let session = null;        // { id, startedAt, greetEligible, matches: Map(name -> count), greeted }

let smoothX = 0, smoothY = 0;
let gaze = null;           // { x: -1..1, y: -1..1 } as last sent, or null
let gazeSentAt = 0;

function level(v, edges) {
  let l = 0;
  for (const e of edges) if (v > e) l++;
  return l - Math.floor(edges.length / 2);
}
// Snaps a -1..1 position to a few steps, with a little stickiness so a face
// sitting on a boundary doesn't make the eyes flick back and forth.
function quantise(v, prev, edges, hyst) {
  const cand = level(v, edges);
  if (prev === null || prev === undefined) return cand;
  if (cand > prev) return level(v - hyst, edges) > prev ? cand : prev;
  if (cand < prev) return level(v + hyst, edges) < prev ? cand : prev;
  return prev;
}
// Left / centre / right only: the outer quarters of the picture turn the eyes, the middle half keeps them centred.
const X_EDGES = [-0.5, 0.5];              // -> -1..1
const Y_EDGES = [-0.35, 0.35];            // -> -1..1

function sendGaze(next) {
  const same = (gaze === null && next === null) || (gaze && next && gaze.x === next.x && gaze.y === next.y);
  if (same && (next === null || Date.now() - gazeSentAt < GAZE_REPEAT_MS)) return;
  gaze = next;
  gazeSentAt = Date.now();
  events.emit('gaze', next);
}

function endSession(at) {
  if (!session) return;
  db.prepare('UPDATE desk_presence SET ended_at = ?, last_seen_at = ? WHERE id = ?').run(at, at, session.id);
  session = null;
}

function goBlind() {
  if (present !== null) endSession(lastFaceAt || Date.now());
  present = null;
  absentSince = 0;
  sendGaze(null);
}

function onFaces(out, frameAt) {
  const now = Date.now();
  const faces = out.faces || [];
  if (faces.length) {
    lastFaceAt = frameAt;
    // Eyes: follow the biggest (nearest) face.
    const [x, y, w, h] = faces[0].box;
    const nx = ((x + w / 2) / out.width) * 2 - 1;
    const ny = ((y + h / 2) / out.height) * 2 - 1;
    smoothX = smoothX * 0.5 + (GAZE_MIRROR_X ? -nx : nx) * 0.5;
    smoothY = smoothY * 0.5 + ny * 0.5;
    sendGaze({ x: quantise(smoothX, gaze?.x, X_EDGES, 0.08), y: quantise(smoothY, gaze?.y, Y_EDGES, 0.1) });

    if (present !== true) {
      // Sat down. Only a return after being SEEN away for a while earns a hello.
      const greetEligible = present === false && now - absentSince >= AWAY_BEFORE_GREET_MS;
      present = true;
      const id = db.prepare('INSERT INTO desk_presence (started_at, last_seen_at) VALUES (?, ?)').run(frameAt, frameAt).lastInsertRowid;
      session = { id, startedAt: frameAt, greetEligible, matches: new Map(), greeted: false, savedAt: frameAt };
    }

    // Who is it? Every face, every look - a name only counts after a couple of matches.
    let namesChanged = false;
    for (const f of faces) {
      const m = f.embedding ? matchEmbedding(f.embedding) : null;
      if (!m) continue;
      if (!session.matches.has(m.name)) namesChanged = true;
      session.matches.set(m.name, (session.matches.get(m.name) || 0) + 1);
    }
    if (namesChanged || frameAt - session.savedAt > 30000) {
      session.savedAt = frameAt;
      db.prepare('UPDATE desk_presence SET last_seen_at = ?, names = ? WHERE id = ?')
        .run(frameAt, JSON.stringify([...session.matches.keys()]), session.id);
    }

    if (session.greetEligible && !session.greeted && now - session.startedAt <= RECOGNISE_WINDOW_MS) {
      const names = [...session.matches]
        .filter(([name, n]) => n >= MATCHES_TO_GREET)
        .map(([name]) => name);
      if (names.length && !isRecordingActive()) {
        session.greeted = true;
        db.prepare('UPDATE desk_presence SET greeted = ? WHERE id = ?').run(JSON.stringify(names), session.id);
        console.log(`[Presence] ${names.join(' and ')} sat down - asking the device to say hello`);
        events.emit('greet', { names });
      }
    }
    return;
  }

  // Nobody in this frame.
  if (frameAt - lastFaceAt > GAZE_LOST_MS) sendGaze(null);
  if (present === null) {
    present = false;
    absentSince = frameAt;
  } else if (present === true && frameAt - lastFaceAt > LEAVE_MS) {
    endSession(lastFaceAt);
    present = false;
    absentSince = lastFaceAt;
  }
}

let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const now = Date.now();
    const frame = isRecordingActive() ? null : getFrame();
    if (!frame || now - frame.at > FRESH_MS) {
      if (isRecordingActive() || now - lastFreshAt > BLIND_MS) goBlind();
      else if (now - lastFaceAt > GAZE_LOST_MS) sendGaze(null);
      return;
    }
    lastFreshAt = now;
    if (frame.at === lastFrameAt) return; // nothing new since the last look
    lastFrameAt = frame.at;
    let out;
    try { out = await detectFacesFast(frame.buffer); } catch { return; } // busy or a bad frame: try the next one
    if (isRecordingActive()) return goBlind(); // a recording started while it was looking
    onFaces(out, frame.at);
  } finally {
    busy = false;
  }
}

let timer = null;
export function startPresence() {
  if (timer) return;
  timer = setInterval(() => { tick().catch((err) => console.warn('[Presence]', err.message)); }, TICK_MS);
  console.log('[Presence] Desk presence watching the camera (silent; greets on return)');
}

export function getGaze() {
  return gaze;
}

export function getPresence() {
  return {
    watching: present !== null,
    present: present === true,
    since: present === true ? session?.startedAt ?? null : present === false ? absentSince || null : null,
    names: session ? [...session.matches].filter(([, n]) => n >= MATCHES_TO_GREET).map(([name]) => name) : [],
    lastSeenAt: lastFaceAt || null,
  };
}

export function listPresence(limit = 50) {
  return db.prepare('SELECT * FROM desk_presence ORDER BY started_at DESC LIMIT ?').all(Math.min(500, Number(limit) || 50))
    .map((r) => ({ ...r, names: JSON.parse(r.names || '[]'), greeted: r.greeted ? JSON.parse(r.greeted) : null }));
}
