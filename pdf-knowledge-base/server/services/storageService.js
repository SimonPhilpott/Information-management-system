// Storage (Phase 4, Dev Idea #51): where the disk goes, and the two ways IMS now saves it.
//
//  - summary(): exact megabytes of PDFs and vector embeddings per subject group (LOTR, Arkham,
//    Diabetes, Technology, Board Games), plus everything else in server/data. Hard-linked copies
//    are counted once - that's what they cost on disk.
//  - dedupePdfs(): the same PDF often sits in two places (the Drive cache data/pdfs/ and the deck
//    builder's rulebook folders). Identical files (SHA-256) are replaced by NTFS hard links: every
//    path keeps working, the bytes are stored once. Hashes are cached by size + modified time, so a
//    re-run only reads new or changed files. Runs nightly and from the Storage page.
//  - quantiseVectors(): converts float JSON embeddings to int8 (vectorCodec.js), checking each file's
//    accuracy first and keeping the originals in data/vectors_float32_backup/ until you delete them.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import db from '../db/database.js';
import { isPacked, packChunks, unpackChunks, writeVectorFile, cosine } from './vectorCodec.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', 'data');
const VECTORS = path.join(DATA, 'vectors');
const VECTOR_BACKUP = path.join(DATA, 'vectors_float32_backup');
const HASH_CACHE = path.join(DATA, 'pdf_hashes.json');
// Files with their own format, read by their own service - left as they are.
const NOT_LIBRARY_VECTORS = new Set(['code_snippets.json']);
const PDF_DIRS = ['pdfs', 'decks/lotr_rulebooks', 'decks/ahlcg_rulebooks', 't1d_books'];

export const GROUPS = ['LOTR', 'Arkham', 'Diabetes', 'Technology', 'Board Games'];

export function groupOf(subject = '') {
  const s = String(subject);
  if (/LOTR|Lord of the Rings|Middle[- _]?earth/i.test(s)) return 'LOTR';
  if (/Arkham|AH LCG|ahlcg/i.test(s)) return 'Arkham';
  if (/diabet|T1D|insulin|glucose|endocrin/i.test(s)) return 'Diabetes';
  if (/Boardgame|Board game|Role-?Playing|RPG|wargame/i.test(s)) return 'Board Games';
  return 'Technology';
}

const subjectToFilename = (subject) => subject.replace(/[^a-zA-Z0-9-_ ]/g, '_').replace(/\s+/g, '_').toLowerCase();
const MB = (b) => Math.round((b / 1048576) * 10) / 10;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

const statOf = (p) => fs.statSync(p, { bigint: true });
const inodeKey = (st) => `${st.dev}:${st.ino}`;

function dirBytes(dir, seen) {
  let logical = 0, physical = 0, files = 0;
  for (const f of walk(dir)) {
    const st = statOf(f);
    const size = Number(st.size);
    logical += size; files++;
    const k = inodeKey(st);
    if (!seen.has(k)) { seen.add(k); physical += size; }
  }
  return { logical, physical, files };
}

let summaryCache = { at: 0, data: null };

export function summary({ fresh = false } = {}) {
  if (!fresh && summaryCache.data && Date.now() - summaryCache.at < 60000) return summaryCache.data;
  const seen = new Set();
  const groups = Object.fromEntries(GROUPS.map((g) => [g, { group: g, pdfBytes: 0, pdfFiles: 0, vectorBytes: 0, vectorFiles: 0, subjects: {} }]));
  const addSubject = (g, subject, field, bytes) => {
    const s = (groups[g].subjects[subject] ||= { subject, pdfBytes: 0, vectorBytes: 0, pdfFiles: 0 });
    s[field] += bytes;
    if (field === 'pdfBytes') s.pdfFiles++;
  };

  // PDFs - the Drive cache is named by Drive file id; the library table says which subject
  const subjectById = new Map(db.prepare('SELECT drive_file_id, subject FROM documents').all().map((r) => [`${r.drive_file_id}.pdf`, r.subject]));
  let pdfLogical = 0, pdfPhysical = 0, orphanBytes = 0, orphanFiles = 0;
  for (const rel of PDF_DIRS) {
    for (const f of walk(path.join(DATA, rel)).filter((x) => /\.pdf$/i.test(x))) {
      const st = statOf(f);
      const size = Number(st.size);
      pdfLogical += size;
      const k = inodeKey(st);
      if (seen.has(k)) continue; // a hard-linked copy: no extra space
      seen.add(k);
      pdfPhysical += size;
      let subject;
      if (rel === 'pdfs') {
        subject = subjectById.get(path.basename(f));
        if (!subject) { orphanBytes += size; orphanFiles++; continue; }
      } else subject = rel === 't1d_books' ? 'Diabetes / T1D Rulebook books' : rel.includes('lotr') ? 'LOTR LCG / Deck builder rulebooks' : 'Arkham Horror LCG / Deck builder rulebooks';
      const g = groupOf(subject);
      groups[g].pdfBytes += size; groups[g].pdfFiles++;
      addSubject(g, subject, 'pdfBytes', size);
    }
  }

  // Vector embeddings - one file per subject
  const subjectByVectorFile = new Map(db.prepare('SELECT DISTINCT subject FROM documents').all().map((r) => [`${subjectToFilename(r.subject)}.json`, r.subject]));
  let vectorBytes = 0, packedFiles = 0, floatFiles = 0;
  for (const f of walk(VECTORS).filter((x) => x.endsWith('.json'))) {
    const name = path.basename(f);
    const size = Number(statOf(f).size);
    seen.add(inodeKey(statOf(f)));
    vectorBytes += size;
    const subject = name === 'code_snippets.json' ? 'Code best practices (code snippets)' : (subjectByVectorFile.get(name) || name.replace(/\.json$/, '').replace(/___/g, ' / ').replace(/_/g, ' '));
    const g = groupOf(subject);
    groups[g].vectorBytes += size; groups[g].vectorFiles++;
    addSubject(g, subject, 'vectorBytes', size);
    if (!NOT_LIBRARY_VECTORS.has(name)) {
      // the format is in the first few bytes: '[{"documentId"...' either way, so peek for the int8 field
      const head = Buffer.alloc(8192);
      const fd = fs.openSync(f, 'r'); fs.readSync(fd, head, 0, 8192, 0); fs.closeSync(fd);
      if (head.toString('utf8').includes('"q":"')) packedFiles++; else floatFiles++;
    }
  }
  const backup = dirBytes(VECTOR_BACKUP, seen);

  // Everything else in server/data
  const other = [];
  const covered = new Set(['pdfs', 'vectors', 'vectors_float32_backup', 't1d_books', 'decks']);
  for (const e of fs.readdirSync(DATA, { withFileTypes: true })) {
    if (covered.has(e.name)) continue;
    const p = path.join(DATA, e.name);
    const b = e.isDirectory() ? dirBytes(p, seen) : (() => { const st = statOf(p); const k = inodeKey(st); const n = Number(st.size); const fresh = !seen.has(k); seen.add(k); return { logical: n, physical: fresh ? n : 0, files: 1 }; })();
    if (b.logical > 0) other.push({ name: e.name, bytes: b.physical, files: b.files, isDir: e.isDirectory() });
  }
  for (const e of fs.readdirSync(path.join(DATA, 'decks'), { withFileTypes: true })) {
    if (/^(lotr|ahlcg)_rulebooks$/.test(e.name)) continue;
    const p = path.join(DATA, 'decks', e.name);
    const b = e.isDirectory() ? dirBytes(p, seen) : { physical: Number(statOf(p).size), files: 1 };
    if (b.physical > 0) other.push({ name: `decks/${e.name}`, bytes: b.physical, files: b.files, isDir: e.isDirectory() });
  }
  other.sort((a, b) => b.bytes - a.bytes);

  const out = {
    at: new Date().toISOString(),
    groups: GROUPS.map((g) => ({
      ...groups[g], pdfMB: MB(groups[g].pdfBytes), vectorMB: MB(groups[g].vectorBytes), totalMB: MB(groups[g].pdfBytes + groups[g].vectorBytes),
      subjects: Object.values(groups[g].subjects).map((s) => ({ ...s, pdfMB: MB(s.pdfBytes), vectorMB: MB(s.vectorBytes) })).sort((a, b) => (b.pdfBytes + b.vectorBytes) - (a.pdfBytes + a.vectorBytes)),
    })),
    pdfs: { logicalMB: MB(pdfLogical), physicalMB: MB(pdfPhysical), savedByLinksMB: MB(pdfLogical - pdfPhysical), orphanMB: MB(orphanBytes), orphanFiles },
    vectors: { MB: MB(vectorBytes), packedFiles, floatFiles, backupMB: MB(backup.physical), backupFiles: backup.files },
    other: other.map((o) => ({ ...o, MB: MB(o.bytes) })),
    totalMB: MB(pdfPhysical + vectorBytes + backup.physical + other.reduce((n, o) => n + o.bytes, 0)),
    lastDedupe: readJsonSetting('storage_last_dedupe'),
    lastQuantise: readJsonSetting('storage_last_quantise'),
  };
  summaryCache = { at: Date.now(), data: out };
  return out;
}

function readJsonSetting(key) {
  try { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key); return r ? JSON.parse(r.value) : null; } catch { return null; }
}
function writeJsonSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
}

// ---------------- PDF de-duplication ----------------
function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

let dedupeRunning = false;
export async function dedupePdfs({ dryRun = false } = {}) {
  if (dedupeRunning) throw new Error('A de-duplication pass is already running.');
  dedupeRunning = true;
  try {
    let cache = {};
    try { cache = JSON.parse(fs.readFileSync(HASH_CACHE, 'utf8')); } catch { }
    const byHash = new Map();
    let hashed = 0;
    for (const rel of PDF_DIRS) {
      for (const f of walk(path.join(DATA, rel)).filter((x) => /\.pdf$/i.test(x))) {
        const st = statOf(f);
        const key = path.relative(DATA, f);
        const sig = `${st.size}:${st.mtimeMs}`;
        let h = cache[key]?.sig === sig ? cache[key].sha256 : null;
        if (!h) { h = await sha256(f); cache[key] = { sig, sha256: h }; hashed++; }
        if (!byHash.has(h)) byHash.set(h, []);
        byHash.get(h).push({ file: f, rel: key, inode: inodeKey(st), size: Number(st.size) });
      }
    }
    for (const k of Object.keys(cache)) if (!fs.existsSync(path.join(DATA, k))) delete cache[k];
    fs.writeFileSync(HASH_CACHE, JSON.stringify(cache));

    let linked = 0, savedBytes = 0;
    const errors = [];
    for (const list of byHash.values()) {
      if (list.length < 2) continue;
      // keep the Drive cache copy as the original (it's what re-syncs refresh)
      const keep = list.find((x) => x.rel.startsWith('pdfs')) || list[0];
      for (const x of list) {
        if (x === keep || x.inode === keep.inode) continue;
        savedBytes += x.size;
        linked++;
        if (dryRun) continue;
        const tmp = `${x.file}.link-tmp`;
        try {
          if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
          fs.linkSync(keep.file, tmp);
          fs.renameSync(tmp, x.file);
        } catch (err) {
          errors.push(`${x.rel}: ${err.message}`);
          try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { }
          linked--; savedBytes -= x.size;
        }
      }
    }
    const result = { at: new Date().toISOString(), dryRun, filesHashed: hashed, duplicatesLinked: linked, savedMB: MB(savedBytes), errors: errors.slice(0, 20) };
    if (!dryRun) writeJsonSetting('storage_last_dedupe', result);
    summaryCache.at = 0;
    console.log(`[Storage] PDF de-duplication: ${linked} duplicate(s) ${dryRun ? 'found' : 'hard-linked'}, ${result.savedMB} MB${dryRun ? ' could be' : ''} saved (${hashed} file(s) hashed)`);
    return result;
  } finally { dedupeRunning = false; }
}

// ---------------- vector quantisation ----------------
let quantiseState = { running: false, done: 0, total: 0, file: null };
export const quantiseStatus = () => ({ ...quantiseState });

export async function quantiseVectors() {
  if (quantiseState.running) throw new Error('Already converting.');
  const files = fs.readdirSync(VECTORS).filter((f) => f.endsWith('.json') && !NOT_LIBRARY_VECTORS.has(f));
  quantiseState = { running: true, done: 0, total: files.length, file: null };
  fs.mkdirSync(VECTOR_BACKUP, { recursive: true });
  let before = 0, after = 0, converted = 0, skipped = 0, worst = 1;
  const problems = [];
  try {
    for (const name of files) {
      quantiseState.file = name;
      const file = path.join(VECTORS, name);
      const raw = await fs.promises.readFile(file, 'utf8');
      const chunks = JSON.parse(raw);
      if (!chunks.length || isPacked(chunks)) { skipped++; quantiseState.done++; continue; }
      // accuracy check on a sample before touching anything
      const packed = packChunks(chunks);
      const decoded = unpackChunks(JSON.parse(JSON.stringify(packed)));
      let fileWorst = 1;
      const step = Math.max(1, Math.floor(chunks.length / 200));
      for (let i = 0; i < chunks.length; i += step) {
        if (!chunks[i].embedding) continue;
        fileWorst = Math.min(fileWorst, cosine(chunks[i].embedding, decoded[i].embedding));
      }
      if (fileWorst < 0.995) { problems.push(`${name}: accuracy ${fileWorst.toFixed(4)} - left as it was`); quantiseState.done++; continue; }
      worst = Math.min(worst, fileWorst);
      const backupFile = path.join(VECTOR_BACKUP, name);
      if (!fs.existsSync(backupFile)) fs.copyFileSync(file, backupFile);
      writeVectorFile(file, chunks);
      before += Buffer.byteLength(raw);
      after += fs.statSync(file).size;
      converted++;
      quantiseState.done++;
      await new Promise((r) => setImmediate(r));
    }
  } finally {
    quantiseState.running = false;
    quantiseState.file = null;
  }
  const result = { at: new Date().toISOString(), converted, skipped, beforeMB: MB(before), afterMB: MB(after), savedMB: MB(before - after), worstCosine: Number(worst.toFixed(5)), problems };
  writeJsonSetting('storage_last_quantise', result);
  summaryCache.at = 0;
  console.log(`[Storage] Vectors to int8: ${converted} file(s), ${result.beforeMB} MB -> ${result.afterMB} MB (worst cosine ${result.worstCosine})`);
  return result;
}

// Once search has been checked on the int8 files, the float originals can go.
export function deleteVectorBackup() {
  if (!fs.existsSync(VECTOR_BACKUP)) return { deletedMB: 0 };
  const b = dirBytes(VECTOR_BACKUP, new Set());
  fs.rmSync(VECTOR_BACKUP, { recursive: true, force: true });
  summaryCache.at = 0;
  return { deletedMB: MB(b.physical), files: b.files };
}

// Put the float originals back (rollback plan in the architecture document).
export function restoreVectorBackup() {
  if (!fs.existsSync(VECTOR_BACKUP)) throw new Error('There is no float32 backup to restore.');
  let n = 0;
  for (const name of fs.readdirSync(VECTOR_BACKUP)) {
    fs.copyFileSync(path.join(VECTOR_BACKUP, name), path.join(VECTORS, name));
    n++;
  }
  summaryCache.at = 0;
  return { restored: n };
}

export default { summary, dedupePdfs, quantiseVectors, quantiseStatus, deleteVectorBackup, restoreVectorBackup, groupOf, GROUPS };
