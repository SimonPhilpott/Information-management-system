import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import db from '../db/database.js';
import config from '../config.js';

// Wake and stop phrases (/ims/phrases). Each phrase keeps the ways speech-to-text actually writes
// it ("Hey IMS" -> "HMs", "Eh up IMS" -> "Anya Pims"). Recordings the user makes are run through
// the same Gemini Live transcription Ims listens with, and any new spelling is added. The wake
// gate and the stop command in index.js match against these lists.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REC_DIR = path.join(__dirname, '..', 'data', 'phrase_recordings');
fs.mkdirSync(REC_DIR, { recursive: true });

db.exec(`CREATE TABLE IF NOT EXISTS voice_phrases (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, phrase TEXT NOT NULL, variants TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS phrase_recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, phrase_id INTEGER NOT NULL, file TEXT NOT NULL, transcript TEXT, created_at INTEGER NOT NULL
)`);

const norm = (t) => String(t || '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

if (!db.prepare('SELECT COUNT(*) AS n FROM voice_phrases').get().n) {
  const ins = db.prepare('INSERT INTO voice_phrases (kind, phrase, variants, created_at) VALUES (?, ?, ?, ?)');
  const now = Date.now();
  ins.run('wake', 'Hey IMS', JSON.stringify(['hey ims', 'hey ems', 'hey eems', 'hey i m s', 'hms', 'hey hims']), now);
  ins.run('wake', 'Hi IMS', JSON.stringify(['hi ims', 'hi ems', 'hiya', 'hi i m s']), now);
  ins.run('wake', 'Eh up IMS', JSON.stringify(['eh up ims', 'ey up ims', 'ay up ims', 'anya pims', 'eh up ems']), now);
  ins.run('stop', 'IMS stop', JSON.stringify(['ims stop', 'ems stop', 'eems stop', 'i m s stop']), now);
  ins.run('stop', 'Stop IMS', JSON.stringify(['stop ims', 'stop ems']), now);
}

const present = (r) => ({
  id: r.id, kind: r.kind, phrase: r.phrase, createdAt: r.created_at,
  variants: (() => { try { return JSON.parse(r.variants || '[]'); } catch { return []; } })(),
  recordings: db.prepare('SELECT id, transcript, created_at FROM phrase_recordings WHERE phrase_id = ? ORDER BY created_at DESC').all(r.id)
    .map((x) => ({ id: x.id, transcript: x.transcript, createdAt: x.created_at })),
});

let cache = null;
const invalidate = () => { cache = null; };
export function listPhrases() {
  return db.prepare('SELECT * FROM voice_phrases ORDER BY kind DESC, id').all().map(present);
}
function lists() {
  if (!cache) {
    const all = listPhrases();
    cache = {
      wake: all.filter((p) => p.kind === 'wake').flatMap((p) => [norm(p.phrase), ...p.variants.map(norm)]).filter(Boolean),
      stop: all.filter((p) => p.kind === 'stop').flatMap((p) => [norm(p.phrase), ...p.variants.map(norm)]).filter(Boolean),
      wakePhrases: all.filter((p) => p.kind === 'wake').map((p) => p.phrase),
    };
  }
  return cache;
}

// Did what was just heard start with (or open with) one of the wake phrase's known spellings?
export function matchesWake(text) {
  const t = norm(text);
  if (!t) return false;
  const opening = t.split(' ').slice(0, 6).join(' ');
  return lists().wake.some((v) => t === v || opening.startsWith(v) || opening.includes(` ${v}`) || (v.length >= 3 && opening === v));
}
// Does what was just heard end with one of the stop phrase's spellings?
export function matchesStop(text) {
  const t = norm(text);
  if (!t) return false;
  const tail = t.split(' ').slice(-5).join(' ');
  return lists().stop.some((v) => tail === v || tail.endsWith(` ${v}`) || tail.endsWith(v) && tail.length - v.length <= 12);
}
export const wakePhraseNames = () => lists().wakePhrases;
// How the wake phrases have actually been transcribed (from recordings and edits), for Ims's instructions.
export const wakeSpellings = () => [...new Set(lists().wake)].slice(0, 40);

export function addPhrase({ kind, phrase }) {
  if (!['wake', 'stop'].includes(kind)) throw new Error('Kind must be wake or stop.');
  const p = String(phrase || '').trim();
  if (p.length < 2) throw new Error('Type the phrase.');
  const info = db.prepare('INSERT INTO voice_phrases (kind, phrase, variants, created_at) VALUES (?, ?, ?, ?)').run(kind, p.slice(0, 60), JSON.stringify([norm(p)]), Date.now());
  invalidate();
  return present(db.prepare('SELECT * FROM voice_phrases WHERE id = ?').get(info.lastInsertRowid));
}
export function updatePhrase(id, { phrase, variants }) {
  const row = db.prepare('SELECT * FROM voice_phrases WHERE id = ?').get(Number(id));
  if (!row) throw new Error('Phrase not found.');
  if (phrase !== undefined && String(phrase).trim()) db.prepare('UPDATE voice_phrases SET phrase = ? WHERE id = ?').run(String(phrase).trim().slice(0, 60), row.id);
  if (variants !== undefined) db.prepare('UPDATE voice_phrases SET variants = ? WHERE id = ?').run(JSON.stringify([...new Set((variants || []).map(norm).filter(Boolean))].slice(0, 40)), row.id);
  invalidate();
  return present(db.prepare('SELECT * FROM voice_phrases WHERE id = ?').get(row.id));
}
export function deletePhrase(id) {
  for (const r of db.prepare('SELECT file FROM phrase_recordings WHERE phrase_id = ?').all(Number(id))) { try { fs.unlinkSync(path.join(REC_DIR, r.file)); } catch (_) { /* gone */ } }
  db.prepare('DELETE FROM phrase_recordings WHERE phrase_id = ?').run(Number(id));
  const ok = db.prepare('DELETE FROM voice_phrases WHERE id = ?').run(Number(id)).changes > 0;
  invalidate();
  return ok;
}
export function deleteRecording(id) {
  const r = db.prepare('SELECT file FROM phrase_recordings WHERE id = ?').get(Number(id));
  if (r) { try { fs.unlinkSync(path.join(REC_DIR, r.file)); } catch (_) { /* gone */ } }
  return db.prepare('DELETE FROM phrase_recordings WHERE id = ?').run(Number(id)).changes > 0;
}
export function recordingFile(id) {
  const r = db.prepare('SELECT file FROM phrase_recordings WHERE id = ?').get(Number(id));
  return r ? path.join(REC_DIR, r.file) : null;
}

function wav(pcm, rate = 16000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Runs a recording through a short Gemini Live session - the same transcription Ims listens with -
// and returns what it wrote.
export function transcribeLikeLive(pcm16k) {
  return new Promise((resolve) => {
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY || config.gemini.apiKey}`;
    const ws = new WebSocket(url);
    let text = '';
    let finished = false;
    const done = () => { if (finished) return; finished = true; try { ws.close(); } catch (_) { /* closed */ } resolve(text.trim()); };
    const timer = setTimeout(done, 12000);
    ws.on('open', () => ws.send(JSON.stringify({ setup: {
      model: 'models/gemini-3.8-live', generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: 'en-GB' } },
      systemInstruction: { parts: [{ text: 'Say nothing at all.' }] }, inputAudioTranscription: {},
    } })));
    ws.on('message', (m) => {
      let d; try { d = JSON.parse(m.toString()); } catch { return; }
      if (d.setupComplete) {
        const silence = Buffer.alloc(16000 * 2 * 0.6); // a moment of quiet each side helps end-of-speech detection
        const all = Buffer.concat([silence, pcm16k, silence, silence]);
        for (let i = 0; i < all.length; i += 3200) ws.send(JSON.stringify({ realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: all.subarray(i, i + 3200).toString('base64') } } }));
        ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      }
      if (d.serverContent?.inputTranscription?.text) text += d.serverContent.inputTranscription.text;
      if (d.serverContent?.turnComplete || d.serverContent?.modelTurn) { clearTimeout(timer); setTimeout(done, 600); }
    });
    ws.on('error', () => { clearTimeout(timer); done(); });
    ws.on('close', () => { clearTimeout(timer); done(); });
  });
}

// Saves a recording for a phrase, transcribes it, and adds the spelling if it's new.
export async function addRecording(id, pcmBase64, pcmBuffer = null) {
  const row = db.prepare('SELECT * FROM voice_phrases WHERE id = ?').get(Number(id));
  if (!row) throw new Error('Phrase not found.');
  const pcm = pcmBuffer || Buffer.from(String(pcmBase64 || ''), 'base64');
  if (pcm.length < 16000 * 2 * 0.3) throw new Error('That recording was too short - try again.');
  if (pcm.length > 16000 * 2 * 8) throw new Error('Keep recordings under 8 seconds.');
  const file = `${row.id}_${Date.now()}.wav`;
  fs.writeFileSync(path.join(REC_DIR, file), wav(pcm));
  const transcript = await transcribeLikeLive(pcm);
  db.prepare('INSERT INTO phrase_recordings (phrase_id, file, transcript, created_at) VALUES (?, ?, ?, ?)').run(row.id, file, transcript || '', Date.now());
  const variants = (() => { try { return JSON.parse(row.variants || '[]'); } catch { return []; } })();
  const n = norm(transcript);
  const added = Boolean(n) && !variants.includes(n) && n !== norm(row.phrase);
  if (added) db.prepare('UPDATE voice_phrases SET variants = ? WHERE id = ?').run(JSON.stringify([...variants, n]), row.id);
  invalidate();
  return { transcript, added, phrase: present(db.prepare('SELECT * FROM voice_phrases WHERE id = ?').get(row.id)) };
}
