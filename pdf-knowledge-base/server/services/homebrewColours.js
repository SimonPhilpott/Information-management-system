import crypto from 'crypto';
import db from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI } from './geminiClient.js';
import { getModelFor } from './modelRegistry.js';

// The colour each recipe and brew is expected to be in the glass, for its demijohn on /ims/homebrew - so a pale
// lager and a stout, or a rosé and a deep elderberry wine, don't all show their category's one colour.
// Beers: Gemini estimates the SRM (the standard beer colour scale, ~2 pale lager to 40+ stout) from the grain bill,
// and the colour comes from the standard SRM chart - so beers sit lighter or darker by their malts, consistently.
// Everything else: Gemini gives the shade from the fruit / grape, honey, flowers and any colour the recipe states.
// Filled in the background, 25 to a call; worked out again only when a recipe's name or ingredients change.

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
const BATCH = 25;
const REFILL_MS = 15 * 60000; // new and edited recipes are picked up within this

db.exec(`
  CREATE TABLE IF NOT EXISTS brew_colour (
    brew_id INTEGER PRIMARY KEY,
    sig TEXT NOT NULL,
    colour TEXT NOT NULL,
    srm REAL
  );
`);

// The standard SRM -> colour chart (SRM 1-40); darker than 40 is shown as 40
const SRM_HEX = ['#FFE699', '#FFD878', '#FFCA5A', '#FFBF42', '#FBB123', '#F8A600', '#F39C00', '#EA8F00', '#E58500', '#DE7C00',
  '#D77200', '#CF6900', '#CB6200', '#C35900', '#BB5100', '#B54C00', '#B04500', '#A63E00', '#A13700', '#9B3200',
  '#952D00', '#8E2900', '#882300', '#821E00', '#7B1A00', '#771900', '#701400', '#6A0E00', '#660D00', '#5E0B00',
  '#5A0A02', '#600903', '#520907', '#4C0505', '#470606', '#440607', '#3F0708', '#3B0607', '#3A070B', '#36080A'];
const srmHex = (srm) => SRM_HEX[Math.min(40, Math.max(1, Math.round(srm))) - 1].toLowerCase();

// bump when the prompt changes, so every colour is worked out again under the new one
const PROMPT_VERSION = 2;
const sigOf = (r) => crypto.createHash('sha1').update(JSON.stringify([PROMPT_VERSION, r.name, r.style, r.category, r.colour, r.ingredients])).digest('hex').slice(0, 16);
const isBeer = (r) => r.category === 'beer' || /\b(ale|lager|stout|porter|ipa|bitter|beer|bock|pils|saison|braggot|wheat)\b/i.test(`${r.style || ''}`);

const getStmt = db.prepare('SELECT colour FROM brew_colour WHERE brew_id = ?');
export const expectedColour = (id) => getStmt.get(id)?.colour || null;

function describe(r) {
  let ings = [];
  try { ings = JSON.parse(r.ingredients || '[]'); } catch (_) { /* none */ }
  const list = ings.map((i) => `${i.name}${i.amount ? ` ${i.amount}${i.unit ? ` ${i.unit}` : ''}` : ''}`).join('; ').slice(0, 500);
  return `#${r.id} | ${r.name} | ${r.category || '-'} | ${r.style || '-'}${r.colour ? ` | wine colour: ${r.colour}` : ''}${r.batch_litres ? ` | ${r.batch_litres} L` : ''} | ${list || 'no ingredients listed'}`;
}

async function colourBatch(rows) {
  const system = 'You are an expert brewer and winemaker estimating the colour of finished home brews. Reply with JSON only.';
  const prompt = 'For each brew below (id | name | category | style | ingredients), give the colour of the finished, cleared drink as it looks in a glass.\n' +
    '- BEERS (and braggots): estimate the SRM from everything that colours it, for the batch size: the grain bill (pale malt only ~3-5, crystal/caramel malts add amber-copper, chocolate/black/roast malt makes it brown to black: porter ~25-35, stout 35-45+) AND the sugars and syrups - dark sugars colour a lot: brown sugar, demerara, muscovado, molasses, black treacle, dark candi sugar or maple syrup make a country beer (nettle, ginger, dandelion, root beer) mid to dark brown, roughly SRM 20-35 depending on how much; white sugar adds none. Give "srm".\n' +
    '- Everything else: "hex" as #rrggbb, specific to this brew - the grape or fruit and how much of it (a rosé is pale pink, blackberry or elderberry wine deep purple-red, a light white wine pale straw-green, rhubarb pale pink-gold), the honey (a light traditional mead is pale straw-gold; dark honey or a bochet amber to brown), flowers and herbs (marigold gold, hibiscus deep red), and any colour the recipe names.\n' +
    '- Don\'t default to one colour per category - two brews of the same kind should differ when their ingredients would.\n\n' +
    `${rows.map(describe).join('\n')}\n\nReturn {"colours": [{"id": number, "srm": number|null, "hex": "#rrggbb"|null}]} with one entry per brew.`;
  const model = genAI.getGenerativeModel({ model: getModelFor('homebrew') || config.gemini.chatModels.flash, systemInstruction: system });
  const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } });
  return JSON.parse(res.response.text())?.colours || [];
}

const save = db.prepare('INSERT INTO brew_colour (brew_id, sig, colour, srm) VALUES (?, ?, ?, ?) ON CONFLICT(brew_id) DO UPDATE SET sig = excluded.sig, colour = excluded.colour, srm = excluded.srm');
let filling = false;
export async function fillColours() {
  if (filling) return 0;
  filling = true;
  let done = 0;
  try {
    const known = new Map(db.prepare('SELECT brew_id, sig FROM brew_colour').all().map((x) => [x.brew_id, x.sig]));
    const todo = db.prepare('SELECT id, name, style, category, colour, ingredients, batch_litres FROM brews').all().filter((r) => known.get(r.id) !== sigOf(r));
    for (let i = 0; i < todo.length; i += BATCH) {
      const rows = todo.slice(i, i + BATCH);
      let out;
      try { out = await colourBatch(rows); } catch (err) { console.warn(`[Homebrew] Colours: ${err.message}`); break; } // try again next round
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const c of out) {
        const r = byId.get(Number(c?.id));
        if (!r) continue;
        const srm = isBeer(r) && Number(c.srm) > 0 ? Number(c.srm) : null;
        const hex = srm ? srmHex(srm) : /^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex.toLowerCase() : null;
        if (!hex) continue;
        save.run(r.id, sigOf(r), hex, srm);
        done++;
      }
    }
    if (done) console.log(`[Homebrew] Expected colours worked out for ${done} brews and recipes`);
  } finally {
    filling = false;
  }
  return done;
}

export function startBrewColours() {
  setTimeout(() => fillColours().catch(() => {}), 30000); // after start-up has settled
  setInterval(() => fillColours().catch(() => {}), REFILL_MS);
}
