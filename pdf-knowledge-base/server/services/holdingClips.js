// Holding lines (persona plan A2): short "hang on, let me look" clips in each persona's own voice, recorded once
// and cached as 24 kHz PCM - the same format Gemini Live sends the Box-3. They're recorded by the live voice
// model itself (Ims's own setup: model, voice, language, accent, personality), so they sound like the rest of
// what he says - the older TTS model gave the same named voice a noticeably different sound (11 Oct). When a slow lookup
// has run for a couple of seconds and Ims hasn't said anything yet, the server plays one, so there's no dead air.
// (Gemini's non-blocking tools don't fill the silence - tested 5 Oct 2026.)
// Greetings are recorded the same way: the persona's `greetings` lines, played the moment Simon says a wake
// phrase on its own (live/liveProxy.js) - about 0.5 s instead of ~2.4 s for a live greeting.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getPersona, listPersonas } from './personaService.js';
import WebSocket from 'ws';
import config from '../config.js';
import { getModelFor } from './modelRegistry.js';
import { recordUsage } from './geminiClient.js';
import { getPersonality, buildPersonalityParagraph } from './hardwareClientService.js';
import { accentRule, voiceName, languageCode } from './personaService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, '../data/holding_clips');

const DEFAULT_LINES = ['Hang on, let me have a look.', 'Give me a second.', 'Just checking that for you.', 'Bear with me a moment.', 'Let me find out.', 'One moment.'];
export const holdingLinesFor = (p) => (Array.isArray(p?.holdingLines) && p.holdingLines.filter((x) => typeof x === 'string' && x.trim()).length ? p.holdingLines.filter((x) => typeof x === 'string' && x.trim()) : DEFAULT_LINES);

// Greeting lines by part of the day; "anytime" ones are used at any hour.
const GREETING_PERIODS = ['anytime', 'morning', 'afternoon', 'evening'];
const cleanLines = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()) : []);
export const greetingLinesFor = (p) => Object.fromEntries(GREETING_PERIODS.map((k) => [k, cleanLines(p?.greetings?.[k])]));
// UK time: morning 05:00-11:59, afternoon 12:00-17:59, evening 18:00-04:59
export function partOfDay(date = new Date()) {
  const h = Number(date.toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false })) % 24;
  return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 18 ? 'afternoon' : 'evening';
}

const ENGINE = 'live1'; // part of each clip's name: changing it re-records every clip
const keyFor = (p, line) => crypto.createHash('sha1').update(`${p.voice}|${p.accent}|${ENGINE}|${line}`).digest('hex').slice(0, 16);
const fileFor = (p, line) => path.join(DIR, p.id, `${keyFor(p, line)}.pcm`);

const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Says one line in Ims's live voice and returns it as 24 kHz 16-bit mono PCM - a short Gemini Live session with
// his model, voice, language, accent rule and personality, told to say the line and nothing else. The
// transcript of what he said must match the line (he sometimes adds a word or two), otherwise it throws.
function liveSay(line, persona) {
  const model = getModelFor('imsVoice');
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY || config.gemini.apiKey}`);
    const chunks = [];
    let said = '', finished = false;
    const done = (err) => {
      if (finished) return; finished = true;
      clearTimeout(timer); try { ws.close(); } catch (_) { }
      if (err) return reject(err);
      const pcm = Buffer.concat(chunks);
      if (pcm.length < 4800) return reject(new Error('No audio came back'));
      if (norm(said) && norm(said) !== norm(line)) return reject(new Error(`Said "${said.trim()}" instead`));
      // a short line dragged out (one came back at 5.7 s for four words) - ask again
      const maxSec = 1.2 + norm(line).split(' ').length * 0.45;
      if (pcm.length / 48000 > maxSec) return reject(new Error(`Too slow (${(pcm.length / 48000).toFixed(1)} s)`));
      resolve(pcm);
    };
    const timer = setTimeout(() => done(new Error('Timed out')), 20000);
    ws.on('open', () => ws.send(JSON.stringify({ setup: {
      model: `models/${model}`,
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: languageCode(persona), voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName(persona) } } } },
      systemInstruction: { parts: [{ text: `You are Ims. ${accentRule(persona)} Your manner: ${buildPersonalityParagraph(getPersonality())} ` +
        'You are recording short lines you will later say to Simon. Each message gives you one line: say exactly that line, word for word, in your natural conversational voice - nothing before it, nothing after it, no extra words, and never answer it.' }] },
      outputAudioTranscription: {},
    } })));
    ws.on('message', (d) => {
      let m; try { m = JSON.parse(d.toString()); } catch (_) { return; }
      // framed as a line to say TO Simon, not something said to him - a question ("what can I do for you?") on
      // its own got answered instead of said
      if (m.setupComplete) ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: `Read this line out loud to Simon exactly as written. It is not a question for you - don't answer it, just say it:
${line}` }] }], turnComplete: true } }));
      if (m.usageMetadata) { try { recordUsage(model, m.usageMetadata, 'tts'); } catch (_) { } }
      if (m.serverContent?.outputTranscription?.text) said += m.serverContent.outputTranscription.text;
      for (const part of m.serverContent?.modelTurn?.parts || []) if (part.inlineData?.data) chunks.push(Buffer.from(part.inlineData.data, 'base64'));
      if (m.serverContent?.turnComplete) setTimeout(() => done(), 300); // the transcript can trail the audio slightly
    });
    ws.on('close', (code, reason) => { if (!finished) done(chunks.length ? null : new Error(`Gemini closed the session: ${code} ${String(reason || '')}`.trim())); });
    ws.on('error', (e) => done(e));
  });
}

const building = new Set();
export async function ensureClips(personaId) {
  const p = getPersona(personaId);
  if (!p || building.has(p.id)) return 0;
  building.add(p.id);
  let made = 0;
  try {
    fs.mkdirSync(path.join(DIR, p.id), { recursive: true });
    const greetings = Object.values(greetingLinesFor(p)).flat();
    for (const line of [...holdingLinesFor(p), ...greetings]) {
      const f = fileFor(p, line);
      if (fs.existsSync(f)) continue;
      if (made) await new Promise((r) => setTimeout(r, 1500)); // gently - one short live session at a time
      let lastErr = null;
      for (let attempt = 0; attempt < 3; attempt++) { // he occasionally adds a word - ask again
        try { fs.writeFileSync(f, await liveSay(line, p)); made++; lastErr = null; break; } catch (err) { lastErr = err; }
      }
      if (lastErr) console.warn(`[Holding] ${p.id} "${line}": ${lastErr.message}`);
    }
    // clips for lines that have since changed (or from the old TTS model) are removed
    const keep = new Set([...holdingLinesFor(p), ...greetings].map((line) => path.basename(fileFor(p, line))));
    for (const old of fs.readdirSync(path.join(DIR, p.id))) if (old.endsWith('.pcm') && !keep.has(old)) fs.unlinkSync(path.join(DIR, p.id, old));
  } finally { building.delete(p.id); }
  if (made) console.log(`[Holding] Recorded ${made} holding line(s) / greeting(s) for ${p.name}`);
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

// A greeting for now: any recorded "anytime" line or one for this part of the day, never the same twice in a
// row. Null when none are recorded yet (Gemini then greets live, as before).
const lastGreeting = new Map();
export function pickGreeting(personaId, date = new Date()) {
  const p = getPersona(personaId);
  if (!p) return null;
  const g = greetingLinesFor(p);
  const ready = [...g.anytime, ...g[partOfDay(date)]].map((line) => ({ line, f: fileFor(p, line) })).filter((x) => fs.existsSync(x.f));
  if (!ready.length) return null;
  const choices = ready.length > 1 ? ready.filter((x) => x.line !== lastGreeting.get(p.id)) : ready;
  const pick = choices[Math.floor(Math.random() * choices.length)];
  lastGreeting.set(p.id, pick.line);
  return { line: pick.line, pcm: fs.readFileSync(pick.f) };
}
