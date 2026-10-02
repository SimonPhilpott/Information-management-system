import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import config from '../../config.js';
import { getModelFor } from '../modelRegistry.js';
import { readGeminiJson } from '../geminiClient.js';

// The Chronicle read aloud by the Narrator: an elderly, wise wizard narrating in a classical British stage
// voice, via Gemini's TTS with a style direction. Each chapter's reading is made once and kept (keyed by
// its exact text), so it plays straight away next time and is only remade when the text changes.
//
// A chapter is recorded in ONE request, so the narrator's voice never changes within it: each request is
// a separate performance, and reading paragraph by paragraph made the voice shift between them. Every
// recording is a "take"; if one doesn't come out well, a new take can be recorded (take numbers are part
// of the key, so each take is kept apart).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', '..', 'data', 'decks', 'chronicle_audio');
// The older TTS model: the newer gemini-3.8-flash-tts read the style direction out loud as part of the
// chronicle, and it was this model's reading of a paragraph on its own that sounded best.
const MODEL = 'gemini-2.5-flash-preview-tts';
// The narrator's voice: Gemini's deep male voice Charon, the one Simon chose.
export const NARRATOR_VOICE = 'Charon';
const NARRATOR_VOICES = [NARRATOR_VOICE, 'Algenib'];

// The style direction, word for word as it was for the reading Simon liked.
const NARRATOR_STYLE = `Read the following aloud as a very old MAN - a wise, ancient male wizard well past eighty, with a man's deep voice - narrating an ancient chronicle by the fire.
Voice character: an elderly, wise wizard with a classical British theatrical RP accent. He must sound unmistakably OLD: a voice thinned and weathered by great age, an aged rasp and slight tremble in it, breath that runs short at the ends of long phrases, a soft catch in the throat - never a young or middle-aged man.
Pitch: mid-to-low baritone with deep chest resonance and a dry, papery gravel.
Tempo: deliberate and unhurried, roughly 110 words per minute, with dramatic, thoughtful pauses between clauses.
Articulation: crisp, heightened classical enunciation of consonants; elongated, rich vowels.
Tone: majestic, deeply compassionate, aged yet capable of sudden formidable authority. Subtle, warm breathiness and thoughtful micro-pauses before key words. No monotonous pacing and no modern conversational filler.
Keep exactly the same voice, age and character from the first word to the last, and give the opening paragraphs every bit as much drama, colour and feeling as the closing ones - never drift into a flat reading voice.
Read every word aloud, starting with the very first line, which is the chapter's heading.
Read only the text itself:

`;
// Arkham Horror: a weary Miskatonic archivist (Simon's direction, word for word in substance).
const ARCHIVIST_STYLE = `Read the following aloud as a weary academic antiquarian and Miskatonic University archivist - a MAN in his late fifties or sixties - reading from an investigator's case notes by lamplight.
Pitch: low baritone with a dry, gravelly chest resonance; dropping to a hollow, breathy near-whisper during chilling details.
Tempo: measured and deliberate, roughly 100 to 115 words per minute, weighed down by dread, with extended, uneasy pauses between clauses.
Phonetics: a 1920s Mid-Atlantic, archaic New England accent - non-rhotic or softly rhotic ("dark", "harbor"), crisp transatlantic plosives (t, k, d), broad classical vowels, and meticulous, scholarly enunciation.
Tone: haunted, solemn, intellectually sharp yet psychologically frayed - suppressed horror and cold intellectual panic rather than loud melodrama.
Keep exactly the same voice from the first word to the last, and give the opening every bit as much weight and dread as the close - never a flat reading voice.
Read every word aloud, starting with the very first line, which is the entry's heading.
Read only the text itself:

`;
const ARCHIVIST_VOICE = 'Algenib'; // Gemini's gravelly male voice
const STYLE = { heading: NARRATOR_STYLE, passage: NARRATOR_STYLE };
const STYLES = { lotr: NARRATOR_STYLE, ahlcg: ARCHIVIST_STYLE };

// Gemini returns either a WAV file or raw 16-bit mono PCM (audio/L16;rate=N) - either way, the PCM and rate.
function toPcm(buf, mime) {
  if (/wav/i.test(mime) || buf.slice(0, 4).toString() === 'RIFF') {
    const rate = buf.readUInt32LE(24);
    let i = 12;
    while (i + 8 <= buf.length) {
      const id = buf.slice(i, i + 4).toString(), size = buf.readUInt32LE(i + 4);
      if (id === 'data') return { pcm: buf.slice(i + 8, Math.min(buf.length, i + 8 + size)), rate };
      i += 8 + size + (size % 2);
    }
    return { pcm: buf.slice(44), rate };
  }
  return { pcm: buf, rate: Number((mime.match(/rate=(\d+)/) || [])[1]) || 24000 };
}
function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Gemini's TTS now and then answers 500/503 (or 429 when busy) for a request that works a moment later,
// so each part is tried up to three times before the reading fails.
async function speak(text, style, voice = NARRATOR_VOICE) {
  for (let attempt = 1; ; attempt++) {
    try { return await speakOnce(text, style, voice); } catch (err) {
      const passing = /HTTP (429|500|502|503|504)|no audio|fetch failed|timeout|ECONNRESET/i.test(err.message);
      if (!passing || attempt >= 3) throw err;
      console.warn(`[Chronicle] Narrator hiccup (${err.message}) - trying again`);
      await new Promise((r) => setTimeout(r, attempt * 5000));
    }
  }
}
async function speakOnce(text, style, voice) {
  const model = getModelFor('tts') || MODEL;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: style + text }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) throw new Error(`Gemini TTS returned HTTP ${res.status}`);
  const part = (await readGeminiJson(res, model, 'tts'))?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part?.inlineData?.data) throw new Error('Gemini TTS returned no audio.');
  return toPcm(Buffer.from(part.inlineData.data, 'base64'), part.inlineData.mimeType || '');
}

// What's spoken: the whole chapter in one piece - heading and paragraphs together. Only something far
// longer than any chapter (over ~6,000 characters) is split, at a paragraph.
function pieces(heading, paragraphs, style = STYLE.passage) {
  const out = [];
  let cur = heading ? `${heading}.` : '';
  for (const p of paragraphs) {
    if (cur && (cur + p).length > 6000) { out.push({ text: cur, style, pause: 0.8 }); cur = ''; }
    cur += (cur ? '\n\n' : '') + p;
  }
  if (cur) out.push({ text: cur, style, pause: 0.8 });
  return out;
}

const keyOf = (text, voice, take = 0, style = STYLE.passage) => crypto.createHash('sha1').update(`${MODEL}|${voice}|${style}|take ${take}|${text}`).digest('hex').slice(0, 20);
// Each game's narrator: its style direction and voice (Arkham: the archivist).
const narratorFor = (game, voice) => (game === 'ahlcg' ? { style: ARCHIVIST_STYLE, voice: ARCHIVIST_VOICE } : { style: STYLE.passage, voice });
export const narrationFile = (key) => (/^[a-f0-9]{20}$/.test(key) ? path.join(DIR, `${key}.wav`) : null);

const jobs = new Map(); // key -> { state: 'working' | 'failed', error, promise }

// { heading, paragraphs } -> { ready, key } now, or starts making it and returns { working }.
export function narrate({ heading, paragraphs, take = 0, game = 'lotr' }, voiceIn = NARRATOR_VOICE) {
  const { style, voice } = narratorFor(game, NARRATOR_VOICES.includes(voiceIn) ? voiceIn : NARRATOR_VOICE);
  const text = [heading, ...paragraphs].filter(Boolean).join('\n\n');
  const key = keyOf(text, voice, take, style);
  if (fs.existsSync(path.join(DIR, `${key}.wav`))) return { ready: true, key };
  const job = jobs.get(key);
  if (job?.state === 'working') return { working: true, key };
  if (job?.state === 'failed') { jobs.delete(key); return { failed: true, key, error: job.error }; }
  const promise = (async () => {
    try {
      const chunks = [];
      let rate = null;
      for (const p of pieces(heading, paragraphs, style)) {
        const a = await speak(p.text, p.style, voice);
        rate ||= a.rate;
        chunks.push(a.pcm, Buffer.alloc(Math.round(rate * p.pause) * 2));
      }
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(path.join(DIR, `${key}.wav`), wav(Buffer.concat(chunks), rate || 24000));
      jobs.delete(key);
    } catch (err) {
      console.warn(`[Chronicle] Narration failed: ${err.message}`);
      jobs.set(key, { state: 'failed', error: err.message });
    }
  })();
  if (!fs.existsSync(path.join(DIR, `${key}.wav`)) && !jobs.has(key)) jobs.set(key, { state: 'working', promise });
  return { working: true, key };
}

// The same, waiting until the reading is made (for making readings ahead of time, one after another).
export async function narrateAndWait(src, voice = NARRATOR_VOICE) {
  let r = narrate(src, voice);
  while (r.working) { await jobs.get(r.key)?.promise; r = narrate(src, voice); }
  if (r.failed) throw new Error(r.error);
  return r;
}

// Drop a chapter's current recording (before a new take).
export function forgetReading({ heading, paragraphs, take = 0, game = 'lotr' }, voiceIn = NARRATOR_VOICE) {
  const { style, voice } = narratorFor(game, voiceIn);
  const key = keyOf([heading, ...paragraphs].filter(Boolean).join('\n\n'), voice, take, style);
  try { fs.unlinkSync(path.join(DIR, `${key}.wav`)); } catch (_) { /* none */ }
}
