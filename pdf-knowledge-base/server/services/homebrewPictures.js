import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import db, { getSetting } from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI, readGeminiJson } from './geminiClient.js';
import { getModelFor } from './modelRegistry.js';
import logger from './loggerService.js';
import { findPhoto, photoSearchReady } from './homebrewPhotos.js';
import { canonicalizeMain, canonicalizeRecipeIngredient, migrateHomebrewIngredients, normIngredient } from './homebrewCanonical.js';

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
  CREATE TABLE IF NOT EXISTS brew_ingredient_pictures (
    name_norm TEXT PRIMARY KEY,
    name_display TEXT NOT NULL,
    key TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);
// the colour the finished drink is expected to be, for the demijohn on the page (added 20 Oct)
try { db.exec('ALTER TABLE brew_main_ingredients ADD COLUMN colour TEXT'); } catch (_) { /* already there */ }

const norm = normIngredient;
const keyOf = (name) => crypto.createHash('sha1').update(`${IMAGE_MODEL}|${norm(name)}`).digest('hex').slice(0, 20);
export const pictureFile = (key) => (/^[a-f0-9]{20}$/.test(key) ? path.join(DIR, `${key}.jpg`) : null);
const ready = (key) => fs.existsSync(path.join(DIR, `${key}.jpg`));
const sigOf = (b) => crypto.createHash('sha1').update(JSON.stringify([b.name, b.style, (b.ingredients || []).map((i) => i.name)])).digest('hex').slice(0, 16);

export function getCustomIngredientKey(name) {
  const canon = canonicalizeMain(name) || name;
  const n = norm(canon);
  if (!n) return null;
  const row = db.prepare('SELECT key FROM brew_ingredient_pictures WHERE name_norm = ?').get(n);
  return row?.key && ready(row.key) ? row.key : null;
}

export function setCustomIngredientKey(name, key) {
  const canon = canonicalizeMain(name) || name;
  const n = norm(canon);
  if (!n) throw new Error('Ingredient name is required.');
  if (!key) {
    db.prepare('DELETE FROM brew_ingredient_pictures WHERE name_norm = ?').run(n);
    return;
  }
  if (!pictureFile(key) || !ready(key)) throw new Error('That picture is not available.');
  db.prepare('INSERT INTO brew_ingredient_pictures (name_norm, name_display, key, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(name_norm) DO UPDATE SET key = excluded.key, updated_at = excluded.updated_at')
    .run(n, canon, key, Date.now());
}

export function removeCustomIngredientKey(name) {
  const canon = canonicalizeMain(name) || name;
  const n = norm(canon);
  if (n) db.prepare('DELETE FROM brew_ingredient_pictures WHERE name_norm = ?').run(n);
}

export function resolveIngredientKey(name) {
  const canon = canonicalizeMain(name) || name;
  return getCustomIngredientKey(canon) || keyOf(canon);
}

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
const SHRINK = 'import sys,cv2\nimg=cv2.imread(sys.argv[1])\nimg=cv2.resize(img,(int(sys.argv[2]),int(sys.argv[3])),interpolation=cv2.INTER_AREA)\ncv2.imwrite(sys.argv[1],img,[cv2.IMWRITE_JPEG_QUALITY,int(sys.argv[4])])';
const shrink = (file, w = 256, h = 256, q = 85) => new Promise((resolve) => execFile(PYTHON_EXE, ['-c', SHRINK, file, String(w), String(h), String(q)], { windowsHide: true, timeout: 20000 }, () => resolve()));

const painting = new Map(); // picture key -> promise
const failedAt = new Map(); // picture key -> when it last couldn't be made (not tried again for an hour)
// Makes one picture with Gemini's image model and keeps it (shrunk to w x h) as <key>.jpg
// (resolves once it's made or given up on - the background banner fill waits on it)
// Off switch for every new picture (20 Oct, Simon: "stop creating images" - they cost about $0.08 each): nothing is
// made unless the homebrew_images setting is "on". Pictures already made are still shown.
const imagesOn = () => String(getSetting('homebrew_images') || '').toLowerCase() === 'on';
function paintImage({ key, text, aspect, w, h, q, what }) {
  if (painting.has(key)) return painting.get(key);
  if (ready(key) || !imagesOn() || Date.now() - (failedAt.get(key) || 0) < 3600000) return Promise.resolve();
  painting.set(key, (async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        const model = getModelFor('image') || IMAGE_MODEL;
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
          body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } } }),
          signal: AbortSignal.timeout(120000),
        });
        if (!res.ok) throw new Error(`Gemini image returned HTTP ${res.status}`);
        const part = (await readGeminiJson(res, model, 'image'))?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
        if (!part?.inlineData?.data) throw new Error('Gemini returned no picture.');
        fs.mkdirSync(DIR, { recursive: true });
        const file = path.join(DIR, `${key}.jpg`);
        fs.writeFileSync(file, Buffer.from(part.inlineData.data, 'base64'));
        await shrink(file, w, h, q);
        return;
      } catch (err) {
        if (attempt >= 3 || !/HTTP (429|500|502|503|504)|no picture|fetch failed|timeout|ECONNRESET/i.test(err.message)) {
          console.warn(`[Homebrew] No picture of ${what}: ${err.message}`);
          failedAt.set(key, Date.now());
          return;
        }
        await new Promise((r) => setTimeout(r, attempt * 5000));
      }
    }
  })().finally(() => painting.delete(key)));
  return painting.get(key);
}
// An ingredient's photo: found (Pexels / Pixabay - see homebrewPhotos.js), once, shared by every recipe using it.
// (Made by Gemini until 20 Oct - those are kept; generation is off, see imagesOn.)
const finding = new Map(); // picture key -> promise
const findFailedAt = new Map(); // key -> when nothing could be found (not searched again for a day)
function findOnce(key, opts) {
  if (finding.has(key)) return finding.get(key);
  if (ready(key) || !photoSearchReady() || Date.now() - (findFailedAt.get(key) || 0) < 86400000) return Promise.resolve();
  finding.set(key, findPhoto({ dir: DIR, key, ...opts })
    .then((ok) => { if (!ok) findFailedAt.set(key, Date.now()); })
    .catch((err) => { findFailedAt.set(key, Date.now()); console.warn(`[Homebrew] No photo found (${opts.queries[0]}): ${err.message}`); })
    .finally(() => finding.delete(key)));
  return finding.get(key);
}
const paint = (item) => findOnce(keyOf(item.name), { shape: 'square', seed: item.name, queries: [item.name, item.name.split(/\s+/).slice(-1)[0]] });

// The header banner: a faint, wide picture behind a recipe's header, in its type's theme (cider: apple orchards,
// mead: beehives...) and featuring its own main ingredients - beehives among marigolds and camomile for a camomile
// and marigold mead. One per type and set of main ingredients; a brew made from a recipe shows the recipe's.
const BANNER_THEME = {
  mead: 'beehives and wooden skeps in a flowering meadow, honeycomb, bees',
  white_wine: 'a sunlit vineyard with pale green-gold grapes on the vine',
  red_wine: 'a vineyard at golden hour with dark red-black grapes, oak barrels',
  rose_wine: 'a soft pink vineyard with blush grapes and roses',
  fruit_veg_wine: 'a cottage kitchen garden overflowing with a mixture of fruit and vegetables',
  flower_herb_wine: 'fresh herbs and wildflowers growing in a cottage garden',
  hot_pepper_wine: 'chilli plants heavy with bright peppers in a greenhouse',
  beer: 'golden barley fields and hop bines climbing poles in a hop garden',
  stout: 'roasted dark malt and barley in a rustic old brewhouse, oak casks',
  cider: 'an English apple orchard with old apple trees laden with fruit',
  soda: 'a sunny English hedgerow with foraged roots, flowers and berries',
};
// a style that lives somewhere else than its type's usual world
const STYLE_THEME = [
  [/herb|foraged|nettle|dandelion/i, 'a sunny English hedgerow and woodland edge, foraging country'],
  [/root beer|ginger beer|kvass|tepache/i, 'a rustic farmhouse kitchen with roots, spices and stoneware crocks'],
  [/perry|pear/i, 'an old English perry pear orchard'],
  [/bochet|caramel/i, 'beehives at dusk with a glowing copper pan of darkened honey'],
];
const themeOf = (b) => STYLE_THEME.find(([re]) => re.test(`${b.style || ''} ${b.name || ''}`))?.[1] || BANNER_THEME[b.category] || 'a sunny English country garden';
// v2 (20 Oct): the first main ingredient is the subject of the scene, not a detail in it (a nettle beer's hedgerow
// showed one small nettle plant). Banners made then are still used; new ones are v3.
const bannerKeyV2 = (b, items) => crypto.createHash('sha1').update(`${IMAGE_MODEL}|banner v2|${themeOf(b)}|${items.map((i) => norm(i.name)).sort().join(',')}`).digest('hex').slice(0, 20);
// v3 (20 Oct, "many look exactly the same"): each recipe gets its own setting within its type, its own kind of shot
// and its own light - picked from the recipe, so it stays the same - and the ingredient itself must be plain to see:
// fruit on the trees, grain heads in the field, flowers in bloom.
const SETTINGS = {
  mead: ['straw skeps and wooden hives in a wildflower meadow', 'beehives on a purple heather moor', "a beekeeper's bench with frames of dripping honeycomb", 'hives at the edge of a blossoming orchard', 'a cottage garden with a bee bole wall and old skeps'],
  white_wine: ['rows of vines heavy with pale green-gold grapes', 'a hillside vineyard above a river', 'a harvest crate of white grapes between the vines', 'a stone terrace overlooking a vineyard'],
  red_wine: ['vines heavy with dark purple-black grapes', 'a harvest of red grapes in wooden crates', 'an old stone winery with oak barrels and grapes', 'a vineyard in autumn colour'],
  rose_wine: ['vines with blush-pink grapes beside climbing roses', 'a summer vineyard with rose bushes at the row ends', 'a basket of pink grapes on a garden table'],
  fruit_veg_wine: ['a walled kitchen garden overflowing with produce', 'an allotment in high summer', 'a market-garden harvest table', 'a fruit cage heavy with soft fruit', 'an old orchard and vegetable plot'],
  flower_herb_wine: ['a cottage garden in full bloom', 'a wildflower meadow', 'a herb garden with raised beds', 'a hedgerow bank of wild flowers', 'a sunny potager of herbs and flowers'],
  hot_pepper_wine: ['a greenhouse of chilli plants heavy with peppers', 'chillies drying on strings in a sunny barn', 'a garden bed of bright pepper plants'],
  beer: ['a field of ripe golden barley with the ears in close-up', 'a hop garden of tall bines hung with green cones', 'an old malting floor with barley grain', 'a harvest of hops being picked into sacks', 'a wheat field at harvest time'],
  stout: ['dark roasted malt spilling from a sack in an old brewhouse', 'a rustic malt barn with oak casks', 'ripe barley and a heap of roasted grain on a farm table', 'an old brewery yard with barrels'],
  cider: ['an English orchard of old apple trees laden with ripe red and green apples', 'apples heaped under the trees at harvest', 'a traditional cider barn with an apple press and baskets of apples', 'apple trees in a misty valley orchard', 'crates of freshly picked apples between the trees'],
  soda: ['a sunny English hedgerow', 'a farmhouse kitchen with roots and spices', 'a woodland edge rich with foraged plants', 'a garden of herbs and roots'],
};
const SHOTS = ['a close foreground still life with the setting softly behind', 'looking along a row into the distance', 'a low view from the ground through the plants', 'a harvest basket in the foreground with the setting behind', 'a wide open view with the ingredient filling the foreground', 'a rustic wooden table in the foreground, the setting beyond'];
const LIGHTS = ['early morning with soft mist', 'golden late-afternoon light', 'bright, fresh midday light', 'soft overcast light', 'warm early-autumn light', 'cool clear spring light'];
const pickOf = (list, seed, salt) => list[parseInt(crypto.createHash('sha1').update(`${seed}|${salt}`).digest('hex').slice(0, 8), 16) % list.length];
function bannerPrompt(b, items) {
  const seed = `${b.id}|${b.name}`;
  const styled = STYLE_THEME.find(([re]) => re.test(`${b.style || ''} ${b.name || ''}`));
  const setting = styled ? styled[1] : pickOf(SETTINGS[b.category] || ['a sunny English country garden'], seed, 'setting');
  const main = items[0];
  return `A wide, airy, soft-focus landscape photograph for a faint background banner. Setting: ${setting}. Shot: ${pickOf(SHOTS, seed, 'shot')}. Light: ${pickOf(LIGHTS, seed, 'light')}.` +
    (main ? ` The main subject, clearly visible and in focus so anyone can tell at a glance what it is: ${main.name} - ${main.picture || main.name}. Show the actual ingredient itself, plainly: fruit hanging on the trees or heaped in the foreground (never bare trees), ripe grain heads close up (never just a field), flowers open in bloom, hop cones on the bine, herbs and leaves in close-up.` : '') +
    (items.length > 1 ? ` Also clearly visible: ${items.slice(1).map((i) => i.picture || i.name).join(' and ')}.` : '') +
    ' Low contrast, pale and calm, plenty of soft space. No text, no letters, no people, no bottles, glasses or labels, no borders.';
}
const bannerKeyOf = (b, items) => crypto.createHash('sha1').update(`${IMAGE_MODEL}|banner v3|${bannerPrompt(b, items)}`).digest('hex').slice(0, 20);
// What to search for a banner: the main ingredient where it grows or is gathered (apple orchard, barley field...),
// then the ingredient on its own, then just the type's scene
const SCENE_WORDS = { mead: 'beehive meadow', white_wine: 'vineyard grapes', red_wine: 'vineyard red grapes', rose_wine: 'vineyard grapes roses', fruit_veg_wine: 'fruit harvest', flower_herb_wine: 'herb garden flowers', hot_pepper_wine: 'chilli peppers', beer: 'barley field hops', stout: 'roasted malt barley', cider: 'apple orchard apples', soda: 'hedgerow foraging' };
const bannerQueries = (b, items) => {
  const main = items[0]?.name;
  const scene = SCENE_WORDS[b.category] || 'country garden';
  // the ingredient itself first, so it's what the photo shows ("white sage apple" found an orchard with no sage in it)
  return [main, main && `${main} plant`, scene];
};
const bannerFoundKey = (b, items) => crypto.createHash('sha1').update(`found banner|${b.id}|${items.map((i) => norm(i.name)).sort().join(',')}`).digest('hex').slice(0, 20);
const paintBanner = (b, items) => findOnce(bannerFoundKey(b, items), { shape: 'wide', seed: `${b.id}|${b.name}`, queries: bannerQueries(b, items) });
// the recipe's own banner if it has one: a new v3, else one made before (v2)
const ownBanner = (b, items) => [bannerFoundKey(b, items), bannerKeyOf(b, items), bannerKeyV2(b, items)].find(ready) || null;

// The recipe's main ingredients and their pictures, and the drink's expected colour: { items: [{ name, key, ready }], colour, pending }. The first call for a
// recipe starts the picking and painting in the background; the page asks again until nothing is pending.
// Picks a recipe's main ingredients and keeps them; photos: also make their photos (the page does, the banner fill doesn't)
function pickAndStore(b, { photos = true } = {}) {
  if (!picking.has(b.id)) {
    const sig = sigOf(b);
    picking.set(b.id, pickMain(b)
      .then(({ items, colour }) => {
        const canonicalItems = items.map((it) => ({ ...it, name: canonicalizeMain(it.name) }));
        db.prepare('INSERT INTO brew_main_ingredients (brew_id, sig, items, colour) VALUES (?, ?, ?, ?) ON CONFLICT(brew_id) DO UPDATE SET sig = excluded.sig, items = excluded.items, colour = excluded.colour')
          .run(b.id, sig, JSON.stringify(canonicalItems), colour);
        if (photos) canonicalItems.forEach(paint);
        return canonicalItems;
      })
      .finally(() => picking.delete(b.id)));
  }
  return picking.get(b.id);
}
const needsPicking = (b, row) => !row || row.sig !== sigOf(b) || !row.colour; // (picked before colours were asked for: again)

export function mainIngredients(b) {
  const row = db.prepare('SELECT sig, items, colour FROM brew_main_ingredients WHERE brew_id = ?').get(b.id);
  if (needsPicking(b, row)) {
    pickAndStore(b).then((items) => paintBanner(b, items)).catch((err) => console.warn(`[Homebrew] Couldn't pick the main ingredients of ${b.name}: ${err.message}`));
    return { items: [], colour: null, banner: bannerFor(b.id) ? { key: bannerFor(b.id), ready: true } : null, pending: true };
  }
  const picked = JSON.parse(row.items || '[]');
  const items = picked.map((i) => {
    const customKey = getCustomIngredientKey(i.name);
    const defKey = keyOf(i.name);
    const key = customKey || defKey;
    return { name: i.name, key, ready: ready(key), defaultKey: defKey, customKey, _i: i };
  });
  for (const i of items) if (!i.ready && !i.customKey) paint(i._i); // e.g. the server restarted mid-way
  const bannerKey = bannerKeyOf(b, picked);
  if (!ownBanner(b, picked)) paintBanner(b, picked); // (does nothing while pictures are switched off)
  // what the header shows: his own choice, else its own banner, else (while that's being made) its theme's
  const shown = bannerFor(b.id);
  const banner = shown ? { key: shown, ready: true } : null;
  return { items: items.map(({ _i, ...i }) => i), colour: row.colour, banner,
    pending: items.some((i) => !i.ready && painting.has(i.key)) || (!ready(bannerKey) && painting.has(bannerKey)) };
}

// The pictures already made for a brew (or, for a brew made from a recipe, the recipe's) - for the piles of
// ingredients beside a planned brew's demijohn on the cards and header. Never starts any picking or painting.
const rowStmt = db.prepare('SELECT items FROM brew_main_ingredients WHERE brew_id = ?');
// (a brew made from a recipe uses the recipe's picks - see routes/homebrew.js)
const srcOf = (id, fromRecipe) => (fromRecipe && rowStmt.get(fromRecipe) ? fromRecipe : id);
const pickedOf = (id) => { try { return JSON.parse(rowStmt.get(id)?.items || 'null'); } catch (_) { return null; } };
export function readyPictures(id, fromRecipe = null) {
  const items = pickedOf(srcOf(id, fromRecipe)) || [];
  return items.map((i) => ({ name: i.name, key: resolveIngredientKey(i.name) })).filter((i) => ready(i.key)).slice(0, 3);
}
// ---- Which banner a recipe shows ----------------------------------------------------------------------------------
// His own choice (a theme picture or a photo he uploaded, picked on the recipe form), else the recipe's own banner,
// else - until that's been made - the general picture for its theme (an orchard for any cider...). A brew made from
// a recipe shows the recipe's.
const THEMES = [
  ['mead', 'Mead - beehives'], ['white_wine', 'White wine - vineyard'], ['red_wine', 'Red wine - vineyard'], ['rose_wine', 'Rosé - vineyard'],
  ['fruit_veg_wine', 'Fruit & veg - kitchen garden'], ['flower_herb_wine', 'Flowers & herbs'], ['hot_pepper_wine', 'Chillies'], ['beer', 'Beer - barley & hops'],
  ['stout', 'Stout - brewhouse'], ['cider', 'Cider - orchard'], ['soda', 'Wild soda - hedgerow'],
].map(([id, label]) => ({ id, label, theme: BANNER_THEME[id] }))
  .concat([['foraged', 'Foraged - hedgerow'], ['farmhouse', 'Farmhouse kitchen'], ['perry', 'Perry - pear orchard'], ['bochet', 'Bochet - hives at dusk']]
    .map(([id, label], i) => ({ id, label, theme: STYLE_THEME[i][1] })))
  .concat([{ id: 'garden', label: 'Country garden', theme: 'a sunny English country garden' }]);
const themeKey = (theme) => crypto.createHash('sha1').update(`${IMAGE_MODEL}|theme banner|${theme}`).digest('hex').slice(0, 20);
const paintTheme = (t) => paintImage({
  key: themeKey(t.theme), aspect: '16:9', w: 960, h: 540, q: 78, what: `the ${t.label} theme picture`,
  text: `A wide, airy, soft-focus landscape photograph for a faint background banner: ${t.theme}. ` +
    'Gentle natural light, low contrast, pale and calm, plenty of soft empty space. No text, no letters, no people, no bottles, glasses or labels, no borders.',
});
export const listThemes = () => THEMES.map((t) => ({ id: t.id, label: t.label, key: themeKey(t.theme), ready: ready(themeKey(t.theme)) }));

db.exec('CREATE TABLE IF NOT EXISTS brew_banner_choice (brew_id INTEGER PRIMARY KEY, key TEXT NOT NULL)');
const choiceStmt = db.prepare('SELECT key FROM brew_banner_choice WHERE brew_id = ?');
export const bannerChoiceOf = (id) => choiceStmt.get(id)?.key || null;
export function setBannerChoice(id, key) {
  if (!key) return db.prepare('DELETE FROM brew_banner_choice WHERE brew_id = ?').run(Number(id));
  if (!pictureFile(key) || !ready(key)) throw new Error('That picture isn\'t there any more - choose another.');
  db.prepare('INSERT INTO brew_banner_choice (brew_id, key) VALUES (?, ?) ON CONFLICT(brew_id) DO UPDATE SET key = excluded.key').run(Number(id), key);
}

const brewStmt = db.prepare('SELECT id, name, style, category FROM brews WHERE id = ?');
// The banner a recipe or brew shows, if there's one to show (never starts making one)
export function bannerFor(id, fromRecipe = null) {
  const src = srcOf(id, fromRecipe);
  const chosen = bannerChoiceOf(id) || (src !== id ? bannerChoiceOf(src) : null);
  if (chosen && ready(chosen)) return chosen;
  const b = brewStmt.get(src);
  if (!b) return null;
  const items = pickedOf(src);
  if (items) { const own = ownBanner(b, items); if (own) return own; }
  const theme = themeKey(themeOf(b));
  return ready(theme) ? theme : null;
}
export const readyBanner = bannerFor;

// A photo of his own for the banner (uploaded on the recipe form): cropped to the banner's shape and kept like the rest
const CROP = 'import sys,cv2\nimg=cv2.imread(sys.argv[1])\nh,w=img.shape[:2]\nt=w/h\nr=16/9\nif t>r:\n  nw=int(h*r);x=(w-nw)//2;img=img[:,x:x+nw]\nelse:\n  nh=int(w/r);y=(h-nh)//2;img=img[y:y+nh]\nimg=cv2.resize(img,(960,540),interpolation=cv2.INTER_AREA)\ncv2.imwrite(sys.argv[2],img,[cv2.IMWRITE_JPEG_QUALITY,82])';
export async function uploadBanner(buffer) {
  if (!buffer?.length) throw new Error('No picture came through.');
  const key = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 20);
  if (ready(key)) return key;
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = path.join(DIR, `${key}.upload`);
  fs.writeFileSync(tmp, buffer);
  try {
    await new Promise((resolve, reject) => execFile(PYTHON_EXE, ['-c', CROP, tmp, path.join(DIR, `${key}.jpg`)], { windowsHide: true, timeout: 30000 }, (err) => (err ? reject(new Error('That doesn\'t look like a picture IMS can read - try a JPEG or PNG.')) : resolve())));
  } finally { try { fs.unlinkSync(tmp); } catch (_) { /* gone */ } }
  if (!ready(key)) throw new Error('That doesn\'t look like a picture IMS can read - try a JPEG or PNG.');
  return key;
}

export async function savePixabayPhoto({ url, id, credit, page, query }) {
  if (!url) throw new Error('No photo URL provided.');
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Couldn't download photo from Pixabay (HTTP ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const key = await uploadBanner(buffer);
  try {
    db.prepare('INSERT OR REPLACE INTO found_photos (key, source, source_id, page_url, credit, query, found_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(key, 'pixabay', String(id || key), page || null, credit || null, query || 'pixabay search', Date.now());
  } catch (_) { /* fine */ }
  return { key };
}

const CROP_SQUARE = 'import sys,cv2\nimg=cv2.imread(sys.argv[1])\nh,w=img.shape[:2]\nd=min(h,w)\nx=(w-d)//2;y=(h-d)//2\nimg=img[y:y+d,x:x+d]\nimg=cv2.resize(img,(256,256),interpolation=cv2.INTER_AREA)\ncv2.imwrite(sys.argv[2],img,[cv2.IMWRITE_JPEG_QUALITY,85])';

export async function uploadIngredientPicture(buffer) {
  if (!buffer?.length) throw new Error('No picture came through.');
  const key = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 20);
  if (ready(key)) return key;
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = path.join(DIR, `${key}.upload`);
  fs.writeFileSync(tmp, buffer);
  try {
    await new Promise((resolve, reject) => execFile(PYTHON_EXE, ['-c', CROP_SQUARE, tmp, path.join(DIR, `${key}.jpg`)], { windowsHide: true, timeout: 30000 }, (err) => (err ? reject(new Error('That doesn\'t look like a picture IMS can read - try a JPEG or PNG.')) : resolve())));
  } finally { try { fs.unlinkSync(tmp); } catch (_) { /* gone */ } }
  if (!ready(key)) throw new Error('That doesn\'t look like a picture IMS can read - try a JPEG or PNG.');
  return key;
}

export async function savePixabayIngredientPhoto({ url, id, credit, page, query, name }) {
  if (!url) throw new Error('No photo URL provided.');
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Couldn't download photo from Pixabay (HTTP ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const key = await uploadIngredientPicture(buffer);
  try {
    db.prepare('INSERT OR REPLACE INTO found_photos (key, source, source_id, page_url, credit, query, found_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(key, 'pixabay', String(id || key), page || null, credit || null, query || 'pixabay search', Date.now());
  } catch (_) { /* fine */ }
  if (name) {
    setCustomIngredientKey(name, key);
  }
  return { key };
}

export function listAllIngredients() {
  const customRows = db.prepare('SELECT name_norm, name_display, key FROM brew_ingredient_pictures').all();
  const customMap = new Map(customRows.map((r) => [r.name_norm, { key: r.key, display: r.name_display }]));

  const map = new Map();

  // 1. Distilled main ingredients from recipes
  const mainRows = db.prepare('SELECT items FROM brew_main_ingredients').all();
  for (const r of mainRows) {
    try {
      const items = JSON.parse(r.items || '[]');
      for (const it of items) {
        if (!it.name) continue;
        const canon = canonicalizeMain(it.name);
        const nm = norm(canon);
        if (!nm) continue;
        if (!map.has(nm)) {
          map.set(nm, { name: canon, norm: nm, count: 0, isMain: true, types: new Set() });
        }
        const entry = map.get(nm);
        entry.count++;
        entry.isMain = true;
      }
    } catch (_) {}
  }

  // 2. Ingredients from brews & recipes table
  const brewRows = db.prepare('SELECT ingredients FROM brews').all();
  for (const b of brewRows) {
    try {
      const ings = JSON.parse(b.ingredients || '[]');
      for (const i of ings) {
        if (!i.name) continue;
        const clean = String(i.name).replace(/\(.*?\)/g, '').trim();
        if (!clean) continue;
        const canon = canonicalizeMain(clean);
        const nm = norm(canon);
        if (!nm) continue;
        if (!map.has(nm)) {
          map.set(nm, { name: canon, norm: nm, count: 0, isMain: false, types: new Set() });
        }
        const entry = map.get(nm);
        entry.count++;
        if (i.type) entry.types.add(i.type);
      }
    } catch (_) {}
  }

  // 3. Any custom-set ingredients
  for (const [nm, info] of customMap.entries()) {
    const canon = canonicalizeMain(info.display || nm);
    const canonNm = norm(canon);
    if (!map.has(canonNm)) {
      map.set(canonNm, { name: canon, norm: canonNm, count: 0, isMain: false, types: new Set() });
    }
  }

  const ingredients = Array.from(map.values()).map((ing) => {
    const defaultKey = keyOf(ing.name);
    const customInfo = customMap.get(ing.norm);
    const customKey = customInfo?.key || null;
    const currentKey = customKey || defaultKey;
    const hasImage = ready(currentKey);
    const defaultReady = ready(defaultKey);
    return {
      name: ing.name,
      norm: ing.norm,
      count: ing.count,
      isMain: ing.isMain,
      type: Array.from(ing.types)[0] || (ing.isMain ? 'main' : 'other'),
      types: Array.from(ing.types),
      defaultKey,
      defaultReady,
      customKey,
      currentKey,
      hasImage,
      hasCustom: Boolean(customKey),
    };
  });

  ingredients.sort((a, b) => {
    if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });

  return {
    ingredients,
    totalCount: ingredients.length,
    withImageCount: ingredients.filter((i) => i.hasImage).length,
    customCount: ingredients.filter((i) => i.hasCustom).length,
    mainCount: ingredients.filter((i) => i.isMain).length,
  };
}

// ---- Every recipe its own banner, in the background (20 Oct: "give those recipes their unique banner now") --------
// Works through the recipe book one at a time: picks its main ingredients (a text call, a fraction of a penny) and
// finds its banner photo (Pexels / Pixabay, free - nothing is generated). Only runs once a photo key is set;
// ingredient photos are found when a recipe is first opened. Carries on after a restart; set homebrew_banner_fill
// to "off" (Settings DB) to pause it.
const FILL_AT_ONCE = 1;
// Pexels allows 200 searches an hour (one recipe every 20 s stays inside it); Pixabay alone allows 100 a minute
const fillGapMs = () => (process.env.PEXELS_API_KEY ? 20000 : 4000);
let filling = false;
export async function fillBanners() {
  if (filling) return;
  filling = true;
  try {
    if (!photoSearchReady()) return; // no Pexels / Pixabay key yet
    if (imagesOn()) for (const t of THEMES) await paintTheme(t); // the stand-ins first: a few pictures cover every recipe at once

    const rows = db.prepare('SELECT id, name, style, category, ingredients FROM brews WHERE is_recipe = 1 ORDER BY favourite DESC, id').all();
    const rowOf = db.prepare('SELECT sig, items, colour FROM brew_main_ingredients WHERE brew_id = ?');
    const todo = rows.map((r) => ({ id: r.id, name: r.name, style: r.style, category: r.category, ingredients: (() => { try { return JSON.parse(r.ingredients || '[]'); } catch (_) { return []; } })() }))
      .filter((b) => { const row = rowOf.get(b.id); return needsPicking(b, row) || !ownBanner(b, JSON.parse(row.items || '[]')); });
    if (!todo.length) return;
    logger.info('Homebrew', `Banner fill: ${todo.length} recipes to give their own banner`);
    let done = 0, i = 0;
    const worker = async () => {
      while (i < todo.length) {
        if (!photoSearchReady() || String(getSetting('homebrew_banner_fill') || '').toLowerCase() === 'off') return;
        const b = todo[i++];
        try {
          const row = rowOf.get(b.id);
          const items = needsPicking(b, row) ? await pickAndStore(b, { photos: false }) : JSON.parse(row.items || '[]');
          await paintBanner(b, items);
          await new Promise((r) => setTimeout(r, fillGapMs()));
          if (++done % 25 === 0) logger.info('Homebrew', `Banner fill: ${done} of ${todo.length} done`);
        } catch (err) { console.warn(`[Homebrew] Banner fill: ${b.name}: ${err.message}`); }
      }
    };
    await Promise.all(Array.from({ length: FILL_AT_ONCE }, worker));
    logger.info('Homebrew', `Banner fill: finished (${done} made this run)`);
  } finally { filling = false; }
}
export function startBannerFill() {
  setTimeout(() => fillBanners().catch((err) => console.warn(`[Homebrew] Banner fill: ${err.message}`)), 60000);
  setInterval(() => fillBanners().catch(() => {}), 6 * 3600000); // new and edited recipes
}
