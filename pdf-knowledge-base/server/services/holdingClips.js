// Holding lines (persona plan A2): short "hang on, let me look" clips in each persona's own voice, recorded once
// with Gemini TTS and cached as 24 kHz PCM - the same format Gemini Live sends the Box-3. When a slow lookup
// has run for a couple of seconds and Ims hasn't said anything yet, the server plays one, so there's no dead air.
// (Gemini's non-blocking tools don't fill the silence - tested 5 Oct 2026.)
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getPersona, listPersonas } from './personaService.js';
import { getModelFor } from './modelRegistry.js';
import { tts } from './modelAudit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, '../data/holding_clips');

const DEFAULT_LINES = ['Hang on, let me have a look.', 'Give me a second.', 'Just checking that for you.', 'Bear with me a moment.', 'Let me find out.', 'One moment.'];
export const holdingLinesFor = (p) => (Array.isArray(p?.holdingLines) && p.holdingLines.filter((x) => typeof x === 'string' && x.trim()).length ? p.holdingLines.filter((x) => typeof x === 'string' && x.trim()) : DEFAULT_LINES);

const keyFor = (p, line) => crypto.createHash('sha1').update(`${p.voice}|${p.accent}|${line}`).digest('hex').slice(0, 16);
const fileFor = (p, line) => path.join(DIR, p.id, `${keyFor(p, line)}.pcm`);

// 24 kHz 16-bit mono PCM from a TTS data URL (only that rate - it's what the desk plays)
function pcmFrom(dataUrl) {
  const buf = Buffer.from(String(dataUrl).split(',')[1] || '', 'base64');
  if (buf.slice(0, 4).toString() !== 'RIFF') return null;
  if (buf.readUInt32LE(24) !== 24000 || buf.readUInt16LE(22) !== 1) return null;
  const dataAt = buf.indexOf('data', 12);
  return dataAt > 0 ? buf.slice(dataAt + 8) : null;
}

const building = new Set();
export async function ensureClips(personaId) {
  const p = getPersona(personaId);
  if (!p || building.has(p.id)) return 0;
  building.add(p.id);
  let made = 0;
  try {
    fs.mkdirSync(path.join(DIR, p.id), { recursive: true });
    for (const line of holdingLinesFor(p)) {
      const f = fileFor(p, line);
      if (fs.existsSync(f)) continue;
      if (made) await new Promise((r) => setTimeout(r, 7000)); // the TTS model allows only a few requests a minute
      try {
        const pcm = pcmFrom(await tts(getModelFor('tts'), line, p));
        if (pcm && pcm.length > 4800) { fs.writeFileSync(f, pcm); made++; }
      } catch (err) { console.warn(`[Holding] ${p.id} "${line}": ${err.message}`); }
    }
  } finally { building.delete(p.id); }
  if (made) console.log(`[Holding] Recorded ${made} holding line(s) for ${p.name}`);
  return made;
}

export async function ensureAllClips() {
  let n = 0;
  for (const p of listPersonas()) n += await ensureClips(p.id);
  return n;
}

// a random clip for this persona, never the same one twice in a row
const lastPicked = new Map();
export function pickClip(personaId) {
  const p = getPersona(personaId);
  if (!p) return null;
  const ready = holdingLinesFor(p).map((line) => ({ line, f: fileFor(p, line) })).filter((x) => fs.existsSync(x.f));
  if (!ready.length) return null;
  const choices = ready.length > 1 ? ready.filter((x) => x.line !== lastPicked.get(p.id)) : ready;
  const pick = choices[Math.floor(Math.random() * choices.length)];
  lastPicked.set(p.id, pick.line);
  return { line: pick.line, pcm: fs.readFileSync(pick.f) };
}
