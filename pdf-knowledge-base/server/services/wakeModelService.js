// Simon's own wake-word model - trained on his voice, recorded through the Box-3 microphone - running in
// SHADOW MODE beside the live Gemini wake check: it scores the audio of every wake check and the result is
// logged next to what Gemini decided, but it never wakes Ims by itself. When the comparison shows it is
// better, it replaces the Gemini check (a separate, deliberate switch - Simon, 14 Oct: "don't replace
// what's live... when this new service is ready we replace the old").
//
// Data:
//  - positives: wake phrase recordings on /ims/phrases (Box-3 mic only) and real wake checks that woke Ims
//  - negatives: wake-check clips of other speech (3+ words heard) and of room noise (nothing heard, quiet)
//  - anything unclear is kept as "unsure" for Simon to mark on the Phrases page (yes, that was me / no)
// The model itself is server/wakeword/wakeword.py (openWakeWord speech features + a small classifier).
import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import db from '../db/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'data', 'wakeword');
const CLIPS = path.join(DIR, 'clips');
const MODEL_DIR = path.join(DIR, 'model');
const PHRASE_DIR = path.join(__dirname, '..', 'data', 'phrase_recordings');
const SCRIPT = path.join(__dirname, '..', 'wakeword', 'wakeword.py');
const PYTHON = process.env.IMS_PYTHON || 'C:/Python312/python.exe';
const PORT = Number(process.env.IMS_WAKEWORD_PORT || 3016);
const MAX_CLIPS = 3000;
fs.mkdirSync(CLIPS, { recursive: true });

db.exec(`CREATE TABLE IF NOT EXISTS wake_clips (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, file TEXT NOT NULL, outcome TEXT, transcript TEXT,
  peak INTEGER, label TEXT NOT NULL, labelled_by TEXT NOT NULL DEFAULT 'auto',
  score REAL, threshold REAL, scored_at INTEGER
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_wake_clips_at ON wake_clips(at)');
// where each phrase recording came from - only Box-3 recordings are used to train
try { db.exec("ALTER TABLE phrase_recordings ADD COLUMN source TEXT NOT NULL DEFAULT 'box3'"); } catch (_) { /* already there */ }

const wav = (pcm) => {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(16000, 24); h.writeUInt32LE(32000, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
};

// ---- the scorer (a small local Python service) ----------------------------------------------------------
let scorer = null; let scorerStarting = null; let restarts = 0;
function request(method, p, body = null, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers: body ? { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length } : {} }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (err) { reject(err); } });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('wake model timed out')));
    if (body) req.write(body);
    req.end();
  });
}
async function ensureScorer() {
  try { return await request('GET', '/', null, 1500); } catch (_) { /* not running */ }
  if (scorerStarting) return scorerStarting;
  scorerStarting = (async () => {
    if (!scorer || scorer.exitCode !== null) {
      scorer = spawn(PYTHON, [SCRIPT, 'serve', MODEL_DIR, String(PORT)], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
      scorer.stderr.on('data', (d) => { const t = d.toString().trim(); if (t && !/Warning|warn/i.test(t)) console.warn('[WakeModel]', t.slice(0, 300)); });
      scorer.on('exit', (code) => { console.warn(`[WakeModel] scorer stopped (${code})`); scorer = null; });
      restarts++;
    }
    for (let i = 0; i < 60; i++) { // the feature models take a few seconds to load
      await new Promise((r) => setTimeout(r, 500));
      try { return await request('GET', '/', null, 1500); } catch (_) { /* still starting */ }
    }
    throw new Error('The wake model service did not start.');
  })().finally(() => { scorerStarting = null; });
  return scorerStarting;
}

// ---- collecting clips from every wake check -------------------------------------------------------------
// Labels: 'wake' (Gemini woke Ims), 'other_speech' (3+ words heard, not a wake), 'noise' (nothing heard,
// quiet), 'unheard' (nothing written down but loud - could be anything, even him: kept, never trained on and
// never asked about), 'unsure' (one or two words that weren't a wake phrase - asked about on the Phrases
// page). 'yes' / 'no' = Simon's answers. (15 Oct: asking about clips with nothing written down meant a long
// list of near-silent clips he couldn't tell apart.)
function autoLabel({ outcome, transcript, peak }) {
  if (/^woke/.test(outcome || '')) return 'wake';
  const words = String(transcript || '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 3) return 'other_speech';
  if (!words.length) return (peak || 0) < 700 ? 'noise' : 'unheard';
  return 'unsure';
}
try { db.prepare("UPDATE wake_clips SET label = 'unheard' WHERE label = 'unsure' AND labelled_by = 'auto' AND TRIM(COALESCE(transcript, '')) = ''").run(); } catch (_) { /* first run */ }

// The Box-3 mic records quietly (speech peaks around 3% of full scale), so clips are made louder to play back
export function loudWav(file) {
  const buf = fs.readFileSync(file);
  if (buf.length <= 44) return buf;
  const pcm = Buffer.from(buf.subarray(44));
  let peak = 1;
  for (let i = 0; i + 1 < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
  const gain = Math.min(30, (0.8 * 32767) / peak);
  if (gain > 1.05) for (let i = 0; i + 1 < pcm.length; i += 2) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm.readInt16LE(i) * gain))), i);
  return Buffer.concat([buf.subarray(0, 44), pcm]);
}

/** Called after every wake check (liveProxy): keeps the clip and scores it in shadow mode. Never blocks. */
export function recordWakeCheck({ pcm, outcome, transcript = '', peak = 0, log = null }) {
  if (!pcm || pcm.length < 16000) return; // under half a second
  const at = Date.now();
  const file = `${new Date(at).toISOString().replace(/[:.]/g, '-')}.wav`;
  let id;
  try {
    fs.writeFileSync(path.join(CLIPS, file), wav(pcm));
    const label = autoLabel({ outcome, transcript, peak });
    id = db.prepare('INSERT INTO wake_clips (at, file, outcome, transcript, peak, label) VALUES (?, ?, ?, ?, ?, ?)')
      .run(at, file, String(outcome || '').slice(0, 120), String(transcript || '').trim().slice(0, 200), peak || 0, label).lastInsertRowid;
    prune();
  } catch (err) { console.warn('[WakeModel] could not keep the clip:', err.message); return; }
  if (!modelMeta()) return; // nothing trained yet - just collecting
  ensureScorer().then(() => request('POST', '/score', pcm)).then((r) => {
    if (r?.score == null) return;
    db.prepare('UPDATE wake_clips SET score = ?, threshold = ?, scored_at = ? WHERE id = ?').run(r.score, r.threshold, Date.now(), id);
    const would = r.score >= (r.threshold ?? 0.5);
    log?.(`WAKE MODEL (shadow): score ${r.score} vs threshold ${r.threshold} -> would ${would ? 'WAKE' : 'stay asleep'}${would ? ` (phrase ending ${r.at} s in)` : ''} | Gemini: ${outcome}${transcript ? ` "${transcript}"` : ''} | ${r.ms} ms`);
  }).catch((err) => log?.(`WAKE MODEL (shadow): not scored - ${err.message}`));
}

function prune() {
  const n = db.prepare('SELECT COUNT(*) n FROM wake_clips').get().n;
  if (n <= MAX_CLIPS) return;
  // drop the oldest automatic noise first; never Simon's own labels or real wakes
  for (const r of db.prepare("SELECT id, file FROM wake_clips WHERE labelled_by = 'auto' AND label IN ('noise','other_speech','unsure') ORDER BY at LIMIT ?").all(n - MAX_CLIPS)) {
    try { fs.unlinkSync(path.join(CLIPS, r.file)); } catch (_) { /* gone */ }
    db.prepare('DELETE FROM wake_clips WHERE id = ?').run(r.id);
  }
}

// ---- sorting the "unheard" clips ----------------------------------------------------------------------
// Most clips the live check wrote nothing down for are ordinary conversation - exactly what the model must
// learn to ignore (15 Oct: with only room noise as "not you" it learned "someone is talking" and would have
// woken for "I'll see you when I get home"). A careful transcription sorts them: everyday talk becomes
// 'other_speech', anything that sounds like a wake phrase goes to Simon ('unsure'), silence stays 'unheard'.
const WAKE_LIKE = /\b(i\.?\s?m\.?\s?s|ims|imz|ems|eems|emms|hims|aims|hms|h\s*&\s*m|m\s*&\s*m|m'?s|hymns?|pims|mims|elms)\b|\b(hey|hi|hiya|eh up|ay up|ayup)\b/i;
let sorting = false;
export async function sortUnheardClips({ limit = 200 } = {}) {
  if (sorting) return { busy: true };
  sorting = true;
  const done = { checked: 0, otherSpeech: 0, maybeWake: 0, nothing: 0 };
  try {
    const { GoogleGenerativeAI } = await import('./geminiClient.js');
    const config = (await import('../config.js')).default;
    const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({ model: 'gemini-2.5-flash' });
    const rows = db.prepare("SELECT id, file FROM wake_clips WHERE label = 'unheard' AND labelled_by = 'auto' ORDER BY at DESC LIMIT ?").all(limit);
    for (const r of rows) {
      let text = '';
      try {
        const data = fs.readFileSync(path.join(CLIPS, r.file)).toString('base64');
        const g = await model.generateContent([{ inlineData: { mimeType: 'audio/wav', data } },
          'Transcribe exactly what is said, word for word (British English). If no words are spoken, reply only: (nothing)']);
        text = g.response.text().trim();
      } catch (_) { continue; }
      done.checked++;
      const words = text.replace(/\(nothing\)|\[[^\]]*\]|\([^)]*\)/gi, ' ').trim().split(/\s+/).filter((w) => /[a-z]/i.test(w));
      let label = 'unheard';
      if (WAKE_LIKE.test(text)) { label = 'unsure'; done.maybeWake++; }
      else if (words.length >= 2) { label = 'other_speech'; done.otherSpeech++; }
      else done.nothing++;
      db.prepare('UPDATE wake_clips SET label = ?, transcript = ? WHERE id = ?').run(label, words.join(' ').slice(0, 200), r.id);
    }
  } finally { sorting = false; }
  return done;
}

// Keeps itself learning: every hour new "unheard" clips are sorted, and at 03:30 it retrains if there's new
// data since the last training - so real wakes and everyday conversation keep teaching it.
let lastAutoTrainDay = null;
setInterval(async () => {
  try { await sortUnheardClips({ limit: 60 }); } catch (err) { console.warn('[WakeModel] sorting:', err.message); }
}, 60 * 60000).unref?.();
setInterval(() => {
  try {
    const now = new Date();
    const day = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    const [h, mi] = now.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).split(':').map(Number);
    if (lastAutoTrainDay === day || h !== 3 || mi < 30) return;
    lastAutoTrainDay = day;
    const meta = modelMeta();
    const newer = db.prepare("SELECT COUNT(*) n FROM wake_clips WHERE at > ? AND label IN ('wake','yes','other_speech','no')").get(meta?.trainedAt || 0).n
      + db.prepare('SELECT COUNT(*) n FROM phrase_recordings WHERE created_at > ?').get(meta?.trainedAt || 0).n;
    if (meta && newer >= 5) startTraining();
  } catch (err) { console.warn('[WakeModel] nightly training:', err.message); }
}, 5 * 60000).unref?.();

// ---- Simon marking clips ------------------------------------------------------------------------------
export function listClipsToReview(limit = 30) {
  return db.prepare("SELECT id, at, outcome, transcript, peak, label, score FROM wake_clips WHERE label = 'unsure' AND labelled_by = 'auto' ORDER BY at DESC LIMIT ?").all(limit);
}
export function labelClips(ids, isWake) {
  let n = 0;
  for (const id of ids || []) n += db.prepare("UPDATE wake_clips SET label = ?, labelled_by = 'simon' WHERE id = ?").run(isWake ? 'yes' : 'no', Number(id)).changes;
  return { labelled: n };
}
export function labelClip(id, isWake) {
  const ok = db.prepare("UPDATE wake_clips SET label = ?, labelled_by = 'simon' WHERE id = ?").run(isWake ? 'yes' : 'no', Number(id)).changes > 0;
  if (!ok) throw new Error('Clip not found.');
  return { ok };
}
export function clipFile(id) {
  const r = db.prepare('SELECT file FROM wake_clips WHERE id = ?').get(Number(id));
  return r ? path.join(CLIPS, r.file) : null;
}

// ---- training ------------------------------------------------------------------------------------------
let training = null; // { startedAt, error, result }
const modelMeta = () => { try { return JSON.parse(fs.readFileSync(path.join(MODEL_DIR, 'meta.json'), 'utf8')); } catch (_) { return null; } };

function trainingData() {
  const phraseRecs = db.prepare(`SELECT r.file, p.phrase FROM phrase_recordings r JOIN voice_phrases p ON p.id = r.phrase_id
    WHERE p.kind = 'wake' AND r.source = 'box3'`).all();
  const clips = db.prepare("SELECT file, label FROM wake_clips WHERE label IN ('wake','yes','other_speech','noise','no')").all();
  return {
    positives: [...phraseRecs.map((r) => path.join(PHRASE_DIR, r.file)), ...clips.filter((c) => c.label === 'wake' || c.label === 'yes').map((c) => path.join(CLIPS, c.file))],
    negatives: clips.filter((c) => !['wake', 'yes'].includes(c.label)).map((c) => path.join(CLIPS, c.file)),
  };
}

export function startTraining() {
  if (training && !training.finishedAt) throw new Error('Already training - give it a minute.');
  const data = trainingData();
  const dataPath = path.join(DIR, 'training_data.json');
  fs.writeFileSync(dataPath, JSON.stringify(data));
  training = { startedAt: Date.now(), positives: data.positives.length, negatives: data.negatives.length };
  const p = spawn(PYTHON, [SCRIPT, 'train', dataPath, MODEL_DIR], { windowsHide: true });
  let out = '', err = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { err += d; });
  p.on('exit', async (code) => {
    training.finishedAt = Date.now();
    const last = out.trim().split('\n').pop() || '';
    try { const j = JSON.parse(last); if (j.error) training.error = j.error; else training.result = j; } catch (_) { training.error = code ? (err.split('\n').filter((l) => l.trim() && !/warn/i.test(l)).slice(-3).join(' ') || `stopped (${code})`) : 'No result.'; }
    if (training.result) { try { await ensureScorer(); await request('POST', '/reload'); } catch (_) { /* picked up on next start */ } }
  });
  return trainingStatus();
}
export const trainingStatus = () => (training ? { ...training, running: !training.finishedAt } : null);

// ---- the comparison: how the model would have done against Gemini ----------------------------------------
export function wakeModelStatus() {
  const phrases = db.prepare(`SELECT p.id, p.phrase, p.kind, COUNT(r.id) AS recordings FROM voice_phrases p
    LEFT JOIN phrase_recordings r ON r.phrase_id = p.id AND r.source = 'box3' GROUP BY p.id ORDER BY p.kind DESC, p.id`).all();
  const labels = Object.fromEntries(db.prepare('SELECT label, COUNT(*) n FROM wake_clips GROUP BY label').all().map((r) => [r.label, r.n]));
  const since = Date.now() - 7 * 86400000;
  const scored = db.prepare('SELECT label, outcome, transcript, score, threshold, at FROM wake_clips WHERE score IS NOT NULL AND at > ? ORDER BY at DESC').all(since);
  const wakeLike = (r) => r.label === 'wake' || r.label === 'yes';
  const cmp = { checks: scored.length, bothWoke: 0, modelOnly: 0, geminiOnly: 0, bothQuiet: 0, modelMissedRealWake: 0, modelFalseWake: 0 };
  for (const r of scored) {
    const m = r.score >= (r.threshold ?? 0.5), g = /^woke/.test(r.outcome || '');
    if (m && g) cmp.bothWoke++; else if (m) cmp.modelOnly++; else if (g) cmp.geminiOnly++; else cmp.bothQuiet++;
    if (wakeLike(r) && !m) cmp.modelMissedRealWake++;
    if ((r.label === 'no' || r.label === 'other_speech' || r.label === 'noise') && m) cmp.modelFalseWake++;
  }
  return {
    phrases, target: 20, clips: labels, model: modelMeta(), training: trainingStatus(), comparison: cmp,
    recent: scored.slice(0, 15).map((r) => ({ at: r.at, gemini: r.outcome, heard: r.transcript, score: r.score, threshold: r.threshold, label: r.label })),
    live: 'gemini', // the model only watches until it is switched over
  };
}
