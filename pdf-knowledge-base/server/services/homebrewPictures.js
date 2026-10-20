import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import db from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI, readGeminiJson } from './geminiClient.js';
import { getModelFor } from './modelRegistry.js';

// Main-ingredient pictures for a recipe's header (/ims/homebrew): small round photos of what makes the brew what
// it is - the marigolds and camomile of a camomile and marigold mead, the malts and hops that make a beer unusual.
// Not the supporting bits (a sliced lemon, a handful of raisins, yeast, nutrient, water, sugar). Gemini picks 1-3
// once per recipe (picked again only if the name or ingredients change); each ingredient's photo is made once and
// shared by every recipe that uses it. Made the first time a recipe is opened, not all at once.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'data', 'homebrew_pictures');
const IMAGE_MODEL = 'gemini-3.1-flash-image';
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

db.exec(`
  CREATE TABLE IF NOT EXISTS brew_main_ingredients (
    brew_id INTEGER PRIMARY KEY,
    sig TEXT NOT NULL,
    items TEXT NOT NULL DEFAULT '[]'
  );
`);
// the colour the finished drink is expected to be, for the demijohn on the page (added 20 Oct)
try { db.exec('ALTER TABLE brew_main_ingredients ADD COLUMN colour TEXT'); } catch (_) { /* already there */ }

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const keyOf = (name) => crypto.createHash('sha1').update(`${IMAGE_MODEL}|${norm(name)}`).digest('hex').slice(0, 20);
export const pictureFile = (key) => (/^[a-f0-9]{20}$/.test(key) ? path.join(DIR, `${key}.jpg`) : null);
const ready = (key) => fs.existsSync(path.join(DIR, `${key}.jpg`));
const sigOf = (b) => crypto.createHash('sha1').update(JSON.stringify([b.name, b.style, (b.ingredients || []).map((i) => i.name)])).digest('hex').slice(0, 16);

const picking = new Map(); // brew id -> promise
async function pickMain(b) {
  const system = 'You pick the main ingredients of a home-brew recipe for small pictures in its header. Reply with JSON only.';
  const prompt = `Recipe: ${b.name}\nCategory: ${b.category}\nStyle: ${b.style || '-'}\nIngredients:\n${(b.ingredients || []).map((i) => `- ${i.name}${i.amount ? ` (${i.amount} ${i.unit || ''})` : ''} [${i.type || 'other'}, ${i.stage || 'primary'}]`).join('\n')}\n\n` +
    'Pick the 1 to 3 ingredients that make this brew what it is - usually the ones named in the title (the flowers, fruit, herbs or spices). ' +
    'For beers look at the recipe: the grains, hops or adjuncts that make it unusual (a smoked malt, a big hop, oats, coffee...) - not plain base malt unless that IS its character. ' +
    'Never pick supporting or basic things: water, yeast, nutrient, sugar, Campden tablets, acid blend, tannin, a sliced lemon or orange for acidity, a handful of raisins for body, tea for tannin. ' +
    'For a mead, honey only if the title is about the honey itself (e.g. "heather honey mead"). ' +
    'Return {"items": [{"name": "short label to show, e.g. Marigolds", "picture": "what the photo shows, plainly, e.g. a heap of bright orange dried marigold petals"}]} in the order they matter, and "colour": the colour the finished, cleared drink is expected to be in the glass, as a #rrggbb hex - from the ingredients, style and any colour given (pale straw, gold, amber, ruby, near-black stout...). ' +
    'The picture is of the ingredient itself as it grows or is sold loose - never its packaging (camomile flowers, not teabags; hop cones, not pellets in a bag).';
  const model = genAI.getGenerativeModel({ model: getModelFor('homebrew') || config.gemini.chatModels.flash, systemInstruction: system });
  const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } });
  const out = JSON.parse(res.response.text()) || {};
  const items = (out.items || [])
    .filter((i) => i && String(i.name || '').trim())
    .slice(0, 3)
    .map((i) => ({ name: String(i.name).trim().slice(0, 40), picture: String(i.picture || i.name).trim().slice(0, 200) }));
  return { items, colour: /^#[0-9a-f]{6}$/i.test(out.colour) ? out.colour.toLowerCase() : null };
}

// Gemini's pictures are 1024 px and ~800 KB; the header shows them 56 px wide, so they're kept at 256 px (the same
// local python + OpenCV as the face tool). If that fails the full-size picture is kept.
const PYTHON_EXE = 'C:\\Python312\\python.exe';
const SHRINK = 'import sys,cv2\nimg=cv2.imread(sys.argv[1])\nimg=cv2.resize(img,(256,256),interpolation=cv2.INTER_AREA)\ncv2.imwrite(sys.argv[1],img,[cv2.IMWRITE_JPEG_QUALITY,85])';
const shrink = (file) => new Promise((resolve) => execFile(PYTHON_EXE, ['-c', SHRINK, file], { windowsHide: true, timeout: 20000 }, () => resolve()));

const painting = new Map(); // picture key -> promise
const failedAt = new Map(); // picture key -> when it last couldn't be made (not tried again for an hour)
async function paint(item) {
  const key = keyOf(item.name);
  if (ready(key) || painting.has(key) || Date.now() - (failedAt.get(key) || 0) < 3600000) return;
  painting.set(key, (async () => {
    const text = `A close-up food photograph of ${item.picture} (${item.name}), as a home-brewing ingredient. Natural soft daylight, shallow depth of field, ` +
      'the ingredient fills the whole square frame edge to edge and is centred (it will be cropped to a circle). Fresh, true colours. No text, no labels, no hands, no bottles or glasses, no borders.';
    for (let attempt = 1; ; attempt++) {
      try {
        const model = getModelFor('image') || IMAGE_MODEL;
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
          body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } } }),
          signal: AbortSignal.timeout(120000),
        });
        if (!res.ok) throw new Error(`Gemini image returned HTTP ${res.status}`);
        const part = (await readGeminiJson(res, model, 'image'))?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
        if (!part?.inlineData?.data) throw new Error('Gemini returned no picture.');
        fs.mkdirSync(DIR, { recursive: true });
        const file = path.join(DIR, `${key}.jpg`);
        fs.writeFileSync(file, Buffer.from(part.inlineData.data, 'base64'));
        await shrink(file);
        return;
      } catch (err) {
        if (attempt >= 3 || !/HTTP (429|500|502|503|504)|no picture|fetch failed|timeout|ECONNRESET/i.test(err.message)) {
          console.warn(`[Homebrew] No picture of ${item.name}: ${err.message}`);
          failedAt.set(key, Date.now());
          return;
        }
        await new Promise((r) => setTimeout(r, attempt * 5000));
      }
    }
  })().finally(() => painting.delete(key)));
}

// The recipe's main ingredients and their pictures, and the drink's expected colour: { items: [{ name, key, ready }], colour, pending }. The first call for a
// recipe starts the picking and painting in the background; the page asks again until nothing is pending.
export function mainIngredients(b) {
  const sig = sigOf(b);
  const row = db.prepare('SELECT sig, items, colour FROM brew_main_ingredients WHERE brew_id = ?').get(b.id);
  if (!row || row.sig !== sig || !row.colour) { // picked before colours were asked for: picked again (pictures are kept)
    if (!picking.has(b.id)) {
      picking.set(b.id, pickMain(b)
        .then(({ items, colour }) => {
          db.prepare('INSERT INTO brew_main_ingredients (brew_id, sig, items, colour) VALUES (?, ?, ?, ?) ON CONFLICT(brew_id) DO UPDATE SET sig = excluded.sig, items = excluded.items, colour = excluded.colour')
            .run(b.id, sig, JSON.stringify(items), colour);
          items.forEach(paint);
        })
        .catch((err) => console.warn(`[Homebrew] Couldn't pick the main ingredients of ${b.name}: ${err.message}`))
        .finally(() => picking.delete(b.id)));
    }
    return { items: [], colour: null, pending: true };
  }
  const items = JSON.parse(row.items || '[]').map((i) => ({ name: i.name, key: keyOf(i.name), ready: ready(keyOf(i.name)), _i: i }));
  for (const i of items) if (!i.ready) paint(i._i); // e.g. the server restarted mid-way
  return { items: items.map(({ _i, ...i }) => i), colour: row.colour, pending: items.some((i) => !i.ready && painting.has(i.key)) };
}
