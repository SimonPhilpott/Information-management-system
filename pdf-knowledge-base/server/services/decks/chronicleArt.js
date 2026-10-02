import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import config from '../../config.js';
import { getModelFor } from '../modelRegistry.js';
import { readGeminiJson } from '../geminiClient.js';

// Illustrated chapters: a full-page plate for each chapter of the Chronicle - an antique pen-and-ink
// engraving in sepia on parchment - painted by Gemini's image model from the chapter's summary, its place
// and the heroes who were there. Made once per chapter (keyed by what it shows, plus a take number for
// "New picture") and kept; made in the background when a chapter is written.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', '..', 'data', 'decks', 'chronicle_art');
const MODEL = 'gemini-3.1-flash-image';

// Drawn in ink on PURE WHITE: the book lays the picture over its own parchment with a multiply blend, so
// the white vanishes and only the ink remains - a drawn-on-paper background would show as a rectangle.
const STYLE = 'An illustration for an old hand-written chronicle of Middle-earth. Style: antique pen-and-ink engraving with fine cross-hatching, in dark sepia-brown ink only, like a plate from a 19th-century illustrated book. The background must be PURE FLAT WHITE (#FFFFFF) - no paper, no parchment, no texture, no stains, no shading of the background, no tint. The drawing is a vignette: its edges fade out irregularly into the white with loose hatching, never a hard rectangular edge. No text, no letters, no captions, no borders, no frames. Portrait orientation.';

// The chapter's own part of the prompt (what the picture shows) - shown on the page for editing. A
// player's edited version (custom) replaces it; the drawing style is always added in front.
export const artBrief = ({ scene, place, heroes, fallen, style }) => (style === 'photo'
  ? `Scene: ${scene}${place ? `\nPlace: ${place}.` : ''}${heroes?.length ? `\nThe investigators - show exactly these people and no others, true to who they are: ${heroes.join('; ')}.` : ''}${fallen?.length ? `\nLost here (dead or driven mad), shown with dread: ${fallen.join('; ')}.` : ''}`
  : `Scene: ${scene}${place ? `\nPlace: ${place}.` : ''}${heroes?.length ? `\nThe company - show exactly these heroes and no others among them, true to their kind: ${heroes.join('; ')}.` : ''}${fallen?.length ? `\nFallen here, to be shown with sorrow and honour: ${fallen.join('; ')}.` : ''}`);
// Arkham Horror: an old photograph, as if clipped into an investigator's case notes.
const PHOTO = 'A photograph taken in the 1920s: grainy black-and-white silver-gelatin print, slightly faded and sepia-toned with age, soft focus at the edges, deep film noir shadows, the Roaring Twenties in New England (cloche hats, fedoras, trench coats, gas lamps, Model T motor cars) - a haunting, uneasy scene of cosmic horror and detective investigation, true to H.P. Lovecraft. It fills the whole frame edge to edge. No text, no letters, no captions, no borders, no frames, no modern things. Portrait orientation.';
const promptOf = (src) => `${src.style === 'photo' ? PHOTO : STYLE}\n${src.custom || artBrief(src)}`;

const keyOf = (src) => crypto.createHash('sha1').update(`${MODEL}|${promptOf(src)}|take ${src.take || 0}`).digest('hex').slice(0, 20);
export const artFile = (key) => (/^[a-f0-9]{20}$/.test(key) ? path.join(DIR, `${key}.jpg`) : null);
export const artReady = (src) => { const key = keyOf(src); return fs.existsSync(path.join(DIR, `${key}.jpg`)) ? key : null; };

async function paint(src) {
  for (let attempt = 1; ; attempt++) {
    try {
      const model = getModelFor('image') || MODEL;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptOf(src) }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '3:4' } } }),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) throw new Error(`Gemini image returned HTTP ${res.status}`);
      const part = (await readGeminiJson(res, model, 'image'))?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      if (!part?.inlineData?.data) throw new Error('Gemini returned no picture.');
      return Buffer.from(part.inlineData.data, 'base64');
    } catch (err) {
      if (attempt >= 3 || !/HTTP (429|500|502|503|504)|no picture|fetch failed|timeout|ECONNRESET/i.test(err.message)) throw err;
      await new Promise((r) => setTimeout(r, attempt * 5000));
    }
  }
}

const jobs = new Map(); // key -> promise
// Makes the chapter's plate if it isn't made yet; resolves with its key once it is.
export async function artAndWait(src) {
  const key = keyOf(src);
  if (fs.existsSync(path.join(DIR, `${key}.jpg`))) return key;
  if (!jobs.has(key)) {
    jobs.set(key, (async () => {
      try {
        const img = await paint(src);
        fs.mkdirSync(DIR, { recursive: true });
        fs.writeFileSync(path.join(DIR, `${key}.jpg`), img);
      } finally { jobs.delete(key); }
    })());
  }
  await jobs.get(key);
  return key;
}
export function forgetArt(src) {
  try { fs.unlinkSync(path.join(DIR, `${keyOf(src)}.jpg`)); } catch (_) { /* none */ }
}
