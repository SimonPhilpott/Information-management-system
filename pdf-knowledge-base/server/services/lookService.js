import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config.js';
import db from '../db/database.js';
import { getFrame, markInUse, wakeCamera } from './cameraService.js';
import { detectFaces, matchEmbedding } from './faceService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = path.join(__dirname, '..', 'data', 'snapshots');
fs.mkdirSync(SNAP_DIR, { recursive: true });

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

db.exec(`
  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    source TEXT,
    width INTEGER,
    height INTEGER,
    faces_json TEXT,
    faces_error TEXT
  );
  CREATE TABLE IF NOT EXISTS snapshot_qa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

const imagePath = (id) => path.join(SNAP_DIR, `${Number(id)}.jpg`);

// Faces are stored with their embeddings, but matches are recomputed on every
// read so someone enrolled AFTER a snapshot was taken is recognised in it too.
function loadFaces(row) {
  let faces = [];
  try { faces = JSON.parse(row.faces_json || '[]'); } catch (_) { /* treat as none */ }
  return faces.map((f, index) => ({
    index, box: f.box, score: f.score, thumb: f.thumb,
    match: matchEmbedding(f.embedding),
    embedding: f.embedding,
  }));
}

function present(row, { withEmbeddings = false } = {}) {
  const faces = loadFaces(row).map((f) => {
    const { embedding, ...rest } = f;
    return withEmbeddings ? f : rest;
  });
  const qa = db.prepare(`SELECT id, question, answer, created_at FROM snapshot_qa WHERE snapshot_id = ? ORDER BY id`).all(row.id);
  return {
    id: row.id, createdAt: new Date(row.created_at).toISOString(), source: row.source,
    width: row.width, height: row.height, facesError: row.faces_error || null,
    faces, qa,
  };
}

export function listSnapshots() {
  return db.prepare(`SELECT * FROM snapshots ORDER BY id DESC LIMIT 200`).all().map((row) => {
    const faces = loadFaces(row);
    return {
      id: row.id, createdAt: new Date(row.created_at).toISOString(),
      faceCount: faces.length,
      names: [...new Set(faces.filter((f) => f.match).map((f) => f.match.name))],
      qaCount: db.prepare(`SELECT COUNT(*) AS n FROM snapshot_qa WHERE snapshot_id = ?`).get(row.id).n,
    };
  });
}

export function getSnapshot(id, opts) {
  const row = db.prepare(`SELECT * FROM snapshots WHERE id = ?`).get(id);
  return row ? present(row, opts) : null;
}

export function getSnapshotImagePath(id) {
  const p = imagePath(id);
  return fs.existsSync(p) ? p : null;
}

export function deleteSnapshot(id) {
  fs.unlink(imagePath(id), () => {});
  db.prepare(`DELETE FROM snapshot_qa WHERE snapshot_id = ?`).run(id);
  return db.prepare(`DELETE FROM snapshots WHERE id = ?`).run(id).changes > 0;
}

// Saves the camera's current frame as a snapshot and finds/recognises faces in it.
export async function takeSnapshot() {
  const frame = getFrame();
  if (!frame) throw new Error('No camera frame available - start the camera view first.');
  markInUse();
  let faces = [], width = null, height = null, facesError = null;
  try {
    const out = await detectFaces(frame.buffer);
    faces = out.faces.map(({ box, score, embedding, thumb }) => ({ box, score, embedding, thumb }));
    width = out.width; height = out.height;
  } catch (err) {
    facesError = err.message;
  }
  const id = db.prepare(
    `INSERT INTO snapshots (created_at, source, width, height, faces_json, faces_error) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(Date.now(), frame.source, width, height, JSON.stringify(faces), facesError).lastInsertRowid;
  fs.writeFileSync(imagePath(id), frame.buffer);
  return getSnapshot(Number(id));
}

function describeFaces(faces, width) {
  if (!faces.length) return 'IMS\'s local face detection found no faces in this photo.';
  const where = (f) => {
    const cx = (f.box[0] + f.box[2] / 2) / (width || 1);
    return cx < 0.33 ? 'on the left' : cx > 0.66 ? 'on the right' : 'in the middle';
  };
  const parts = faces.map((f) => `the face ${where(f)} is ${f.match ? f.match.name : 'not someone IMS knows'}`);
  return `IMS's local face recognition found ${faces.length} face(s): ${parts.join('; ')}. Use those names when relevant.`;
}

// Asks Gemini a question about a stored snapshot and records the exchange.
export async function askAboutSnapshot(id, question) {
  const q = String(question || '').trim();
  if (!q) throw new Error('Ask a question first.');
  const row = db.prepare(`SELECT * FROM snapshots WHERE id = ?`).get(id);
  const imgPath = getSnapshotImagePath(id);
  if (!row || !imgPath) throw new Error('Snapshot not found.');
  if (!config.gemini.apiKey) throw new Error('No Gemini API key is configured on the server.');

  const faces = loadFaces(row);
  const prompt = 'You are the eyes of IMS, a home desk assistant. Answer the question about this photo directly and accurately, in British English. ' +
    'If you cannot tell something from the photo, say so rather than guessing. ' +
    describeFaces(faces, row.width) + '\n\nQuestion: ' + q;
  const model = genAI.getGenerativeModel({ model: config.gemini.chatModels.flash });
  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType: 'image/jpeg', data: fs.readFileSync(imgPath).toString('base64') } },
  ]);
  const answer = result.response.text().trim();
  db.prepare(`INSERT INTO snapshot_qa (snapshot_id, question, answer, created_at) VALUES (?, ?, ?, ?)`).run(id, q, answer, Date.now());
  markInUse();
  return getSnapshot(id);
}

// "Ask about what IMS sees right now": snapshot first (so it's kept in the
// gallery with its answer), then ask.
export async function askLive(question) {
  const snap = await takeSnapshot();
  return askAboutSnapshot(snap.id, question);
}

// Who is in front of the camera right now? Uses the latest frame only if it's
// fresh (never a stale picture of someone who has since left), and only ever
// reports people who are actually enrolled - an unknown face is reported as
// unknown, never guessed at. Returns null when there's no fresh frame.
export async function identifyPeopleInView(maxAgeMs = 60000) {
  wakeCamera();
  const frame = getFrame();
  if (!frame || Date.now() - frame.at > maxAgeMs) return null;
  const out = await detectFaces(frame.buffer);
  const matches = out.faces.map((f) => matchEmbedding(f.embedding));
  return {
    faceCount: out.faces.length,
    names: [...new Set(matches.filter(Boolean).map((m) => m.name))],
    unknownCount: matches.filter((m) => !m).length,
  };
}
