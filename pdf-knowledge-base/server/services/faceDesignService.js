import db from '../db/database.js';

// Ims's faces. A face is TWO frames on the device's 12 (columns) x 8 (rows)
// dot grid, each stored as 96 hex digits row by row (0 = off, f = fully lit,
// anything between = a dimmer dot):
//   grid      - the resting face: eyes plus a CLOSED mouth
//   openGrid  - the same face with the mouth OPEN
// While Ims speaks the device flaps between the two, so every face - built-in
// or designed - comes with a matching mouth for both states. Frames are sent
// to the device the moment Ims chooses a face. `scenarios` says when to use a
// face; that text is what Gemini is told (it replaced the fixed emotion guide
// that used to live in ims_persona_rules.md).
//
// 'standby' is the face Ims wears whenever it is idle (it is never chosen by
// Gemini). Every face can also have eye movement: 'blink' squashes the eyes flat
// now and then, and 'glance' slides any dim dot in the eyes (the pupil) one
// column left or right - exactly what the standby eyes do.
db.exec(`
  CREATE TABLE IF NOT EXISTS ims_faces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    grid TEXT NOT NULL,
    open_grid TEXT,
    color TEXT NOT NULL,
    scenarios TEXT NOT NULL DEFAULT '',
    builtin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    deleted_at INTEGER
  );
`);
try { db.exec(`ALTER TABLE ims_faces ADD COLUMN open_grid TEXT`); } catch (_) { }
try { db.exec(`ALTER TABLE ims_faces ADD COLUMN eye_blink INTEGER NOT NULL DEFAULT 0`); } catch (_) { }
try { db.exec(`ALTER TABLE ims_faces ADD COLUMN eye_glance INTEGER NOT NULL DEFAULT 0`); } catch (_) { }

const COLS = 12, ROWS = 8;

function makeGrid(...builders) {
  const g = new Array(COLS * ROWS).fill(0);
  const put = (r, c, v = 255) => { const i = r * COLS + c; if (v > g[i]) g[i] = v; };
  const set = (r, c, v) => { g[r * COLS + c] = v; };
  const row = (r, c0, c1, v = 255) => { for (let c = c0; c <= c1; c++) put(r, c, v); };
  for (const b of builders) b({ put, set, row });
  return g.map((v) => Math.round(v / 17).toString(16)).join('');
}

// The everyday eyes: two 3x3 blocks with a dim pupil dot, as on the device.
const STANDBY_EYES = ({ row, set }) => { for (let r = 1; r <= 3; r++) { row(r, 2, 4); row(r, 7, 9); } set(2, 3, 30); set(2, 8, 30); };
const SMILE_CLOSED = ({ put, row }) => { row(6, 3, 8); put(5, 2); put(5, 9); };
const SMILE_OPEN = ({ row, put }) => { put(5, 2); put(5, 9); row(5, 3, 8); row(6, 3, 8); row(7, 4, 7); };

// name: [colour, eyes, mouthClosed, mouthOpen, scenarios]
const FACES = {
  standby: ['4CFF7A', STANDBY_EYES, SMILE_CLOSED, SMILE_OPEN,
    "Ims's resting face: shown automatically whenever Ims is idle in standby (and while it talks with no other face chosen). Ims never picks this one - it is here so you can design it."],
  neutral: ['A9BFB0', STANDBY_EYES, SMILE_CLOSED, SMILE_OPEN,
    'Calm, factual moments: reading out numbers, plain confirmations, or nothing in particular to react to. Never leave the face deadpan when you have a genuine reaction, though.'],
  joy: ['FFD700', ({ put }) => { put(1, 3); put(1, 8); put(2, 2); put(2, 4); put(2, 7); put(2, 9); },
    ({ put, row }) => { row(6, 3, 8); put(5, 2); put(5, 9); },
    ({ put, row }) => { put(5, 2); put(5, 9); row(5, 3, 8); row(6, 3, 8); row(7, 4, 7); },
    'Warm greetings, successful task completions, positive test runs, hearing a good joke, a great result, clean compiles on the first try, catching up after being powered down.'],
  cocky: ['00E5FF', ({ row, set }) => { row(0, 2, 4); row(2, 2, 4); row(3, 2, 4); row(2, 7, 9); set(2, 3, 30); set(3, 8, 30); },
    ({ put, row }) => { row(6, 4, 8); put(5, 9); },
    ({ put, row }) => { row(5, 5, 8); row(6, 5, 8); put(5, 9); },
    'A wry smirk: a witty comeback, teasing the user, solving a tricky problem with casual ease, winning a trivial argument, boasting about running lean on ESP32 silicon without cloud bloat.'],
  love: ['FF3385', ({ put, row }) => { put(1, 2); put(1, 4); put(1, 7); put(1, 9); row(2, 2, 4); row(2, 7, 9); put(3, 3); put(3, 8); },
    ({ row }) => { row(6, 4, 7); },
    ({ row }) => { row(5, 4, 7); row(6, 4, 7); },
    'Genuine camaraderie, heartfelt compliments, deep appreciation for a proper cuppa, finding a beautifully documented function, admiring a clean, elegant fix.'],
  amazement: ['FFB84D', ({ row, set }) => { for (let r = 1; r <= 4; r++) { row(r, 2, 4); row(r, 7, 9); } set(2, 3, 30); set(2, 8, 30); },
    ({ row }) => { row(6, 5, 6); },
    ({ row }) => { row(5, 4, 7); row(6, 3, 8); row(7, 4, 7); },
    'Wild facts, impressive project milestones, shocking revelations in documents, surprisingly fast benchmarks, discovering an elegant one-line solution, unexpected good news.'],
  suspicious: ['33FFB8', ({ put, row, set }) => { row(2, 2, 4); row(2, 7, 9); put(3, 3); put(3, 4); put(3, 8); put(3, 9); set(3, 2, 30); set(3, 7, 30); },
    ({ put, row }) => { row(6, 3, 6); put(5, 7); put(5, 8); },
    ({ row }) => { row(5, 4, 6); row(6, 3, 7); },
    'Dubious claims, questions phrased like a trap, sketchy coding suggestions, skipping unit tests, squinting at questionable architecture, sensing the user is about to push straight to production.'],
  confused: ['99FF33', ({ put, row, set }) => { row(0, 2, 4); put(1, 8); put(1, 9); row(2, 2, 4); row(3, 2, 4); row(2, 7, 9); row(3, 7, 9); set(2, 3, 30); set(3, 8, 30); },
    ({ put }) => { put(6, 3); put(5, 4); put(6, 5); put(5, 6); put(6, 7); put(5, 8); },
    ({ row }) => { row(5, 4, 7); row(6, 4, 7); row(7, 5, 6); },
    'Contradictory user input, baffling requests, malformed queries, contradictory requirements, syntax soup, genuinely weird concepts that make no technical sense.'],
  sad: ['4D94FF', ({ put, row, set }) => { put(0, 5); put(0, 7); put(1, 3); put(1, 9); row(2, 2, 4); row(2, 7, 9); row(3, 2, 4); row(3, 7, 9); set(3, 3, 30); set(3, 8, 30); },
    ({ put, row }) => { row(5, 4, 7); put(6, 3); put(6, 8); },
    ({ row }) => { row(6, 3, 8); row(7, 4, 7); },
    'Melancholy news, broken builds, dropped tea mugs, depressing statistics in research, lost files, merge conflicts, discovering a library was deprecated five years ago.'],
  devastated: ['1E88E5', ({ put, row, set }) => { row(2, 2, 4); row(2, 7, 9); set(3, 3, 140); set(3, 8, 140); put(5, 3); put(5, 8); },
    ({ put, row }) => { row(6, 4, 7); put(7, 3); put(7, 8); },
    ({ row }) => { row(6, 4, 7); row(7, 3, 8); },
    'The heavier end of sad: a catastrophic failure, real loss, or grim news that deserves more than a shrug (use sparingly).'],
  anger: ['FF7733', ({ put, row, set }) => { put(1, 1); put(1, 10); row(2, 2, 4); row(2, 7, 9); row(3, 2, 4); row(3, 7, 9); set(3, 3, 30); set(3, 8, 30); },
    ({ row }) => { row(6, 3, 8); },
    ({ row }) => { row(5, 3, 8); row(6, 3, 8); },
    'Blatant nonsense, severe avoidable errors, endless corporate buzzwords, enterprise bloat, infinite retry loops (use playfully or dryly, never genuinely abusive).'],
  rage: ['FF2222', ({ put, row, set }) => { put(0, 0); put(0, 11); put(1, 1); put(1, 10); row(2, 2, 4); row(2, 7, 9); row(3, 2, 4); row(3, 7, 9); set(3, 3, 30); set(3, 8, 30); },
    ({ row }) => { row(6, 2, 9); },
    ({ row }) => { row(5, 2, 9); row(6, 2, 9); row(7, 3, 8); },
    'The extreme end of anger, for comic effect only: the third identical failure in a row, a build that has hung for an hour (never genuinely abusive).'],
  fear: ['BA68C8', ({ put, row, set }) => { put(0, 2); put(0, 3); put(0, 8); put(0, 9); for (let r = 1; r <= 3; r++) { row(r, 2, 4); row(r, 7, 9); } set(3, 3, 30); set(3, 8, 30); },
    ({ row }) => { row(6, 4, 7); },
    ({ row }) => { row(5, 4, 7); row(6, 3, 8); row(7, 4, 7); },
    'Existential hardware threats (overvoltage, flashing sketchy bootloaders, thermal spikes, water spilled on desk), accidental rm -rf, dreading a massive impending refactor.'],
  disgusted: ['A6E22E', ({ put, row, set }) => { put(1, 8); put(2, 2); put(2, 3); put(2, 7); put(2, 9); put(3, 3); put(3, 4); put(3, 7); put(3, 8); put(3, 9); set(3, 3, 30); set(2, 8, 30); },
    ({ put, row }) => { put(6, 3); put(5, 4); put(5, 5); row(6, 6, 8); },
    ({ put, row }) => { put(5, 3); row(6, 3, 8); row(7, 4, 7); },
    'Gross food combinations, microwaved tea, filthy keyboards, spaghetti code with nested ternaries, unformatted JSON blobs, 5,000-line monolithic files.'],
  bored: ['7E9A85', ({ row, set }) => { row(2, 2, 4); row(2, 7, 9); row(3, 2, 4); row(3, 7, 9); set(3, 3, 30); set(3, 8, 30); },
    ({ row }) => { row(6, 4, 7); },
    ({ row }) => { row(6, 4, 7); row(7, 5, 6); },
    'Tedious repetitive queries, reading endless boilerplate, sorting flat CSV rows, hearing about mundane office bureaucracy, waiting on bloated build pipelines.'],
  sleepy: ['2E4A38', ({ row }) => { row(3, 2, 4); row(3, 7, 9); },
    ({ row }) => { row(6, 5, 6); },
    ({ row }) => { row(6, 4, 7); row(7, 5, 6); },
    'Late-night sessions (past 11 PM), early morning wake-ups before 8 AM, low-activity idle periods, long passive readouts, winding down after a long day (usually after 4pm).'],
};

// Eye movement ships on by default for the two everyday faces only.
const DEFAULT_MOTION = { standby: { blink: true, glance: true }, neutral: { blink: true, glance: true } };
const DEFAULTS = Object.fromEntries(Object.entries(FACES).map(([name, [color, eyes, closed, open, scenarios]]) => [
  name, { color, grid: makeGrid(eyes, closed), openGrid: makeGrid(eyes, open), scenarios,
    blink: Boolean(DEFAULT_MOTION[name]?.blink), glance: Boolean(DEFAULT_MOTION[name]?.glance) }
]));

// Seed built-ins that are missing. Earlier versions stored eyes only (no
// mouth) and no open frame: bring those rows up to the two-frame model, but
// never touch scenarios (or, once present, frames) the user may have edited.
{
  const insert = db.prepare(`INSERT OR IGNORE INTO ims_faces (name, grid, open_grid, color, scenarios, builtin, eye_blink, eye_glance, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`);
  for (const [name, d] of Object.entries(DEFAULTS)) insert.run(name, d.grid, d.openGrid, d.color, d.scenarios, d.blink ? 1 : 0, d.glance ? 1 : 0, Date.now());
  // The old neutral face had no eyes of its own (the firmware drew them). Give it
  // the real ones, once, unless it has already been redrawn.
  const oldNeutral = db.prepare(`SELECT * FROM ims_faces WHERE name = 'neutral' AND builtin = 1`).get();
  if (oldNeutral && /^0+$/.test(String(oldNeutral.grid).slice(0, 5 * COLS))) {
    const d = DEFAULTS.neutral;
    db.prepare(`UPDATE ims_faces SET grid = ?, open_grid = ?, eye_blink = 1, eye_glance = 1 WHERE id = ?`).run(d.grid, d.openGrid, oldNeutral.id);
  }
  const upgrade = db.prepare(`UPDATE ims_faces SET grid = ?, open_grid = ? WHERE name = ? AND builtin = 1 AND open_grid IS NULL`);
  for (const [name, d] of Object.entries(DEFAULTS)) upgrade.run(d.grid, d.openGrid, name);
  db.prepare(`UPDATE ims_faces SET open_grid = grid WHERE open_grid IS NULL`).run();
}

const NAME_RE = /^[a-z][a-z0-9_]{1,22}$/;
const GRID_RE = /^[0-9a-f]{96}$/;
const COLOR_RE = /^[0-9a-fA-F]{6}$/;

const present = (r) => ({
  id: r.id, name: r.name, grid: r.grid, openGrid: r.open_grid || r.grid, color: r.color.toUpperCase(), scenarios: r.scenarios,
  builtin: Boolean(r.builtin),
  shapeLocked: false, // every face can be redrawn
  selectable: r.name !== 'standby', // Ims never chooses the standby face itself
  eyeBlink: Boolean(r.eye_blink), eyeGlance: Boolean(r.eye_glance),
  hasDefault: Boolean(r.builtin && DEFAULTS[r.name]),
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null,
});

export function listFaces({ deleted = false } = {}) {
  return db.prepare(`SELECT * FROM ims_faces WHERE deleted_at IS ${deleted ? 'NOT' : ''} NULL ORDER BY (name = 'standby') DESC, builtin DESC, id ASC`).all().map(present);
}

export function getFaceByName(name) {
  const r = db.prepare(`SELECT * FROM ims_faces WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL`).get(String(name || ''));
  return r ? present(r) : null;
}

const normaliseName = (name) => String(name || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

function checkFrames(grid, openGrid) {
  if (!GRID_RE.test(String(grid || ''))) throw new Error('The resting (mouth closed) face is invalid.');
  if (!GRID_RE.test(String(openGrid || ''))) throw new Error('The speaking (mouth open) face is invalid.');
}

export function createFace({ name, grid, openGrid, color, scenarios, eyeBlink, eyeGlance }) {
  const n = normaliseName(name);
  if (!NAME_RE.test(n)) throw new Error('Name must be 2-23 characters: letters, numbers or underscores, starting with a letter.');
  checkFrames(grid, openGrid ?? grid);
  if (!COLOR_RE.test(String(color || ''))) throw new Error('Pick a colour.');
  if (db.prepare(`SELECT 1 FROM ims_faces WHERE LOWER(name) = ?`).get(n)) throw new Error(`A face called "${n}" already exists.`);
  const info = db.prepare(`INSERT INTO ims_faces (name, grid, open_grid, color, scenarios, builtin, eye_blink, eye_glance, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`)
    .run(n, grid, openGrid ?? grid, String(color).toUpperCase(), String(scenarios || '').trim(), eyeBlink ? 1 : 0, eyeGlance ? 1 : 0, Date.now());
  return present(db.prepare(`SELECT * FROM ims_faces WHERE id = ?`).get(info.lastInsertRowid));
}

// Built-in faces keep their name; their frames and colour can be edited (and
// reset to the defaults) - neutral too, which the device uses when idle and speaking.
export function updateFace(id, { name, grid, openGrid, color, scenarios, eyeBlink, eyeGlance }) {
  const r = db.prepare(`SELECT * FROM ims_faces WHERE id = ? AND deleted_at IS NULL`).get(id);
  if (!r) throw new Error('Face not found.');
  const locked = false;
  const next = { name: r.name, grid: r.grid, open_grid: r.open_grid || r.grid, color: r.color, scenarios: r.scenarios, eye_blink: r.eye_blink, eye_glance: r.eye_glance };
  if (eyeBlink !== undefined) next.eye_blink = eyeBlink ? 1 : 0;
  if (eyeGlance !== undefined) next.eye_glance = eyeGlance ? 1 : 0;
  if (scenarios !== undefined) next.scenarios = String(scenarios).trim();
  if (!locked) {
    if (name !== undefined && !r.builtin) {
      const n = normaliseName(name);
      if (!NAME_RE.test(n)) throw new Error('Name must be 2-23 characters: letters, numbers or underscores, starting with a letter.');
      if (n !== r.name && db.prepare(`SELECT 1 FROM ims_faces WHERE LOWER(name) = ?`).get(n)) throw new Error(`A face called "${n}" already exists.`);
      next.name = n;
    }
    if (grid !== undefined || openGrid !== undefined) {
      checkFrames(grid ?? next.grid, openGrid ?? next.open_grid);
      next.grid = grid ?? next.grid;
      next.open_grid = openGrid ?? next.open_grid;
    }
    if (color !== undefined) { if (!COLOR_RE.test(String(color))) throw new Error('Pick a colour.'); next.color = String(color).toUpperCase(); }
  }
  db.prepare(`UPDATE ims_faces SET name = ?, grid = ?, open_grid = ?, color = ?, scenarios = ?, eye_blink = ?, eye_glance = ?, updated_at = ? WHERE id = ?`)
    .run(next.name, next.grid, next.open_grid, next.color, next.scenarios, next.eye_blink, next.eye_glance, Date.now(), id);
  return present(db.prepare(`SELECT * FROM ims_faces WHERE id = ?`).get(id));
}

// Put a built-in's frames and colour back to how they shipped (scenarios are left alone).
export function resetFace(id) {
  const r = db.prepare(`SELECT * FROM ims_faces WHERE id = ? AND deleted_at IS NULL AND builtin = 1`).get(id);
  const d = r && DEFAULTS[r.name];
  if (!d) throw new Error('Only built-in faces can be reset.');
  db.prepare(`UPDATE ims_faces SET grid = ?, open_grid = ?, color = ?, eye_blink = ?, eye_glance = ?, updated_at = ? WHERE id = ?`).run(d.grid, d.openGrid, d.color, d.blink ? 1 : 0, d.glance ? 1 : 0, Date.now(), id);
  return present(db.prepare(`SELECT * FROM ims_faces WHERE id = ?`).get(id));
}

// Designed faces are archived, not destroyed (and can be restored); built-ins can't be deleted.
export function deleteFace(id) {
  const r = db.prepare(`SELECT * FROM ims_faces WHERE id = ? AND deleted_at IS NULL`).get(id);
  if (!r) throw new Error('Face not found.');
  if (r.builtin) throw new Error('Built-in faces can\'t be deleted.');
  db.prepare(`UPDATE ims_faces SET deleted_at = ? WHERE id = ?`).run(Date.now(), id);
}

export function restoreFace(id) {
  const r = db.prepare(`SELECT * FROM ims_faces WHERE id = ? AND deleted_at IS NOT NULL`).get(id);
  if (!r) throw new Error('Archived face not found.');
  db.prepare(`UPDATE ims_faces SET deleted_at = NULL WHERE id = ?`).run(id);
}

// --- What Gemini is told ----------------------------------------------------

export const getEmotionNames = () => listFaces().filter((f) => f.selectable).map((f) => f.name);

export function getFacePromptGuide() {
  const lines = listFaces().filter((f) => f.selectable).map((f) => `- ${f.name}: ${f.scenarios || '(no scenarios written yet - use your judgement)'}`);
  return 'FACES AVAILABLE (choose the one that best fits, by exact name): \n' + lines.join('\n');
}

// What to send the device for a chosen face. Every face except neutral goes as
// its two frames (resting + speaking) and colour, so edits made in the Face
// Designer - to built-ins as well as new designs - take effect immediately.
const faceForDevice = (f) => ({ grid: f.grid, openGrid: f.openGrid, color: f.color, blink: f.eyeBlink, glance: f.eyeGlance });

export function getDevicePayload(name) {
  const f = getFaceByName(name);
  if (!f) return { setEmotion: String(name || 'neutral') };
  if (f.name === 'standby') return { setEmotion: 'neutral', standbyFace: getStandbyOverride() };
  return { setEmotion: f.name, face: faceForDevice(f) };
}

// The idle face is drawn by the firmware unless the user has changed it in the
// Face Designer. Returns the user's version, or null while it is still the
// original (so the device keeps its built-in look).
export function getStandbyOverride() {
  const f = getFaceByName('standby');
  const d = DEFAULTS.standby;
  if (!f || !d) return null;
  if (f.grid === d.grid && f.openGrid === d.openGrid && f.color.toUpperCase() === d.color.toUpperCase() && f.eyeBlink === d.blink && f.eyeGlance === d.glance) return null;
  return faceForDevice(f);
}
