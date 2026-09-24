import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import db from '../db/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_EXE = 'C:\\Python312\\python.exe';
const FACE_TOOL = path.join(__dirname, '..', 'python', 'face_tool.py');
const FACES_DIR = path.join(__dirname, '..', 'data', 'faces');

// SFace's recommended cosine-similarity threshold for "same person".
export const MATCH_THRESHOLD = 0.363;

// Face data is biometric and stays entirely on this machine (server/data is
// git-ignored): embeddings are numbers derived locally by OpenCV's YuNet +
// SFace models, thumbnails are small aligned crops, and nothing is sent to any
// cloud service by this module.
db.exec(`
  CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    notes TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS face_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL,
    embedding TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

fs.mkdirSync(FACES_DIR, { recursive: true });

// Detect + embed every face in a JPEG buffer (runs the python tool).
export function detectFaces(buffer) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `ims_face_${crypto.randomUUID()}.jpg`);
    fs.writeFileSync(tmp, buffer);
    execFile(PYTHON_EXE, [FACE_TOOL, tmp], { timeout: 60000, maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      fs.unlink(tmp, () => {});
      if (err) return reject(new Error('Face engine failed: ' + err.message.split('\n')[0]));
      try {
        const out = JSON.parse(stdout);
        if (out.error) return reject(new Error(out.error));
        resolve(out);
      } catch (e) {
        reject(new Error('Face engine returned unreadable output.'));
      }
    });
  });
}

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

// Best-matching enrolled person for an embedding, or null if nobody clears the threshold.
export function matchEmbedding(embedding) {
  const rows = db.prepare(
    `SELECT s.embedding, p.id AS personId, p.name FROM face_samples s JOIN people p ON p.id = s.person_id`
  ).all();
  let best = null;
  for (const r of rows) {
    const score = dot(embedding, JSON.parse(r.embedding));
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { personId: r.personId, name: r.name, score: Math.round(score * 1000) / 1000 };
    }
  }
  return best;
}

export function listPeople() {
  return db.prepare(`
    SELECT p.id, p.name, p.notes, p.created_at,
           (SELECT COUNT(*) FROM face_samples s WHERE s.person_id = p.id) AS samples,
           (SELECT MIN(id) FROM face_samples s WHERE s.person_id = p.id) AS thumbSampleId
    FROM people p ORDER BY LOWER(p.name)
  `).all().map((p) => ({ id: p.id, name: p.name, notes: p.notes || '', samples: p.samples, thumbSampleId: p.thumbSampleId }));
}

// Adds one face sample. `personId` adds to an existing person; otherwise the
// name is matched (case-insensitively) to an existing person or a new one is created.
export function enrolFace({ personId, name, notes, embedding, thumbBase64 }) {
  if (!Array.isArray(embedding) || embedding.length !== 128) throw new Error('A valid face embedding is required.');
  let id = personId;
  if (!id) {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('A name is required.');
    const existing = db.prepare(`SELECT id FROM people WHERE LOWER(name) = LOWER(?)`).get(clean);
    id = existing ? existing.id
      : db.prepare(`INSERT INTO people (name, notes, created_at) VALUES (?, ?, ?)`).run(clean, notes || null, Date.now()).lastInsertRowid;
  } else if (!db.prepare(`SELECT 1 FROM people WHERE id = ?`).get(id)) {
    throw new Error('Person not found.');
  }
  if (notes !== undefined && personId) db.prepare(`UPDATE people SET notes = ? WHERE id = ?`).run(notes, id);
  const sampleId = db.prepare(`INSERT INTO face_samples (person_id, embedding, created_at) VALUES (?, ?, ?)`)
    .run(id, JSON.stringify(embedding), Date.now()).lastInsertRowid;
  if (thumbBase64) fs.writeFileSync(path.join(FACES_DIR, `${sampleId}.jpg`), Buffer.from(thumbBase64, 'base64'));
  return { personId: Number(id), sampleId: Number(sampleId) };
}

export function updatePerson(id, { name, notes }) {
  const p = db.prepare(`SELECT * FROM people WHERE id = ?`).get(id);
  if (!p) throw new Error('Person not found.');
  const nextName = name !== undefined ? String(name).trim() : p.name;
  if (!nextName) throw new Error('Name cannot be empty.');
  db.prepare(`UPDATE people SET name = ?, notes = ? WHERE id = ?`).run(nextName, notes !== undefined ? notes : p.notes, id);
}

function removeThumb(sampleId) {
  fs.unlink(path.join(FACES_DIR, `${sampleId}.jpg`), () => {});
}

export function deletePerson(id) {
  for (const s of db.prepare(`SELECT id FROM face_samples WHERE person_id = ?`).all(id)) removeThumb(s.id);
  db.prepare(`DELETE FROM face_samples WHERE person_id = ?`).run(id);
  return db.prepare(`DELETE FROM people WHERE id = ?`).run(id).changes > 0;
}

export function deleteSample(sampleId) {
  removeThumb(sampleId);
  return db.prepare(`DELETE FROM face_samples WHERE id = ?`).run(sampleId).changes > 0;
}

export function sampleThumbPath(sampleId) {
  const p = path.join(FACES_DIR, `${Number(sampleId)}.jpg`);
  return fs.existsSync(p) ? p : null;
}
