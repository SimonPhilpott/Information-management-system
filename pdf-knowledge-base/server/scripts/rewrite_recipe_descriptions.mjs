// One-off (23 Oct 2026, Simon): every recipe's description (brews.summary) becomes exactly one paragraph about the drink
// itself - its profile (taste, aroma, colour, body, sweetness, strength, how it ages) and, where it adds something, a
// little about the style or tradition it comes from. Nothing carried over from where the recipe came from: no people,
// authors, books, sites, awards, "the book says", "his", "my".
//   node server/scripts/rewrite_recipe_descriptions.mjs            Gemini writes them; checks them; review file (nothing changed)
//   node server/scripts/rewrite_recipe_descriptions.mjs --apply    saves them (backup first)
// Cached in data/recipe_description_proposals.json - edit one there before --apply, or delete it to have it written again.
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';
import { GoogleGenerativeAI } from '../services/geminiClient.js';
import { getModelFor } from '../services/modelRegistry.js';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const APPLY = process.argv.includes('--apply');
const CACHE = path.join(DATA, 'recipe_description_proposals.json');
const REPORT = path.join(DATA, 'recipe_description_review.md');
const BATCH = 20;
const db = new Database(path.join(DATA, 'app.db'));

const recipes = db.prepare('SELECT id, name, category, style, ingredients, target_og, target_fg, og, fg, sweetness, carbonation, colour, batch_litres, summary FROM brews WHERE is_recipe = 1 ORDER BY id').all();
const mains = new Map(db.prepare('SELECT brew_id, items FROM brew_main_ingredients').all().map((r) => { try { return [r.brew_id, JSON.parse(r.items || '[]').map((i) => i.name)]; } catch { return [r.brew_id, []]; } }));
const ingNames = (j) => { try { return JSON.parse(j || '[]').map((g) => String(g.name || '').replace(/\(.*?\)/g, '').trim()).filter(Boolean).slice(0, 14).join(', '); } catch { return ''; } };

const SYSTEM = 'You are a drinks writer for a home-brewing recipe book of meads, wines, ciders, beers and sodas. You write warm, precise, sensory descriptions in British English. Reply with JSON only.';
const RULES = `Write the description for each recipe: EXACTLY ONE paragraph (no line breaks), about 50-110 words.
Describe the drink itself: how it looks (colour, clarity), smells and tastes, its body, sweetness, acidity, fizz and likely strength, what it's like young and how it changes with age, and when or with what it's good to drink. Where it adds something, a sentence on the style or tradition it belongs to (for example where a style comes from, or what a historical drink was used for).
Never mention: any person (no names, no "he", "she", "his", "her", "I", "my", "we", "our", "the author", "the brewer"), any book, magazine, website, blog, forum, shop or brand, awards, medals or competitions, batch or rebrew numbers, "this recipe" as a document ("the book says", "the scan", "the original"), or quantities and method steps.
Use only what the recipe's details support - its name, kind, style, ingredients, gravities and sweetness. The old description is background only: keep its facts about the drink's character, drop everything about people, sources and history of the recipe itself. Don't invent ingredients. Write in the present tense, sentence case, no headings, no lists, no quotation marks around phrases from elsewhere. Never use a dash as punctuation (no " - ", " – " or " — "): use commas, full stops or "and" instead.
Return {"results": [{"id": number, "text": "the paragraph"}]} with one entry per recipe.`;

const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({ model: getModelFor('homebrew') || config.gemini.chatModels.flash, systemInstruction: SYSTEM });
const describe = (r) => [`id ${r.id}: ${r.name}`, `kind ${r.category || '-'}`, r.style && `style ${r.style}`, r.colour && `wine colour ${r.colour}`,
  (mains.get(r.id) || []).length && `main ingredients ${(mains.get(r.id) || []).join(', ')}`, `ingredients ${ingNames(r.ingredients) || '-'}`,
  (r.og || r.target_og) && `OG ${r.og || r.target_og}`, (r.fg || r.target_fg) && `FG ${r.fg || r.target_fg}`, r.sweetness && `sweetness ${r.sweetness}`,
  r.carbonation && `fizz ${r.carbonation}`, r.summary && `old description: ${String(r.summary).replace(/\s+/g, ' ').slice(0, 700)}`].filter(Boolean).join(' | ');
async function ask(batch) {
  const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: `${RULES}\n\nRecipes:\n${batch.map(describe).join('\n')}` }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.5 } });
  return JSON.parse(res.response.text()).results || [];
}

// ---- checks: one paragraph, the right length, nothing about people, sources or awards ----
const BANNED = /\b(he|she|his|her|him|I|my|we|our|us|author|brewer's own|the book|the scan|the original recipe|blog|forum|website|award|awards|award-winning|medal|competition|prize|rebrew|AG#|BIAB#|Boots|Glover|Wise|Merrydown|Shockey|Proulx|Nichols|Beechum|Raffald|Shales|Patten|Bender|Baudar|Turner|Launay|Hieronymus|Zimmerman|Beeton|Broadford|Mrs|Mr|Dr|Lady|Lord|King|Queen|Prince)\b/;
const problems = (t) => {
  const p = [];
  if (!t) return ['empty'];
  if (/\n/.test(t)) p.push('more than one paragraph');
  const w = t.split(/\s+/).length;
  if (w < 35) p.push(`short (${w} words)`);
  if (w > 140) p.push(`long (${w} words)`);
  const m = t.match(BANNED);
  if (m) p.push(`mentions "${m[0]}"`);
  return p;
};

// any spaced dash that slips through becomes a comma (23 Oct, Simon: no " - " in the descriptions)
const noDash = (t) => String(t || '').replace(/\s+[-–—]\s+/g, ', ').replace(/,\s*,/g, ',').replace(/,\s*\./g, '.');
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
for (const v of Object.values(cache)) v.text = noDash(v.text);
// written for any recipe without one yet, or whose last one failed the checks
const todo = recipes.filter((r) => !cache[r.id] || problems(cache[r.id].text).length);
if (!APPLY && todo.length) {
  console.log(`Writing ${todo.length} descriptions in ${Math.ceil(todo.length / BATCH)} batches...`);
  for (let s = 0; s < todo.length; s += BATCH) {
    const batch = todo.slice(s, s + BATCH);
    let results = [];
    for (let attempt = 0; attempt < 3 && !results.length; attempt++) {
      try { results = await ask(batch); } catch (e) { console.log(`  batch ${s / BATCH + 1}: ${e.message} - trying again`); await new Promise((r) => setTimeout(r, 4000)); }
    }
    for (const r of results) {
      const rec = batch.find((b) => b.id === Number(r.id));
      if (rec) cache[rec.id] = { name: rec.name, old: rec.summary || '', text: noDash(String(r.text || '').replace(/\s*\n+\s*/g, ' ').trim()) };
    }
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
    if ((s / BATCH) % 10 === 9 || s + BATCH >= todo.length) console.log(`  ${Math.min(s + BATCH, todo.length)} of ${todo.length}`);
  }
}

const ready = recipes.filter((r) => cache[r.id] && !problems(cache[r.id].text).length);
const flagged = recipes.filter((r) => cache[r.id] && problems(cache[r.id].text).length);
const missing = recipes.filter((r) => !cache[r.id]);
const md = [`# Recipe descriptions (${ready.length} ready, ${flagged.length} flagged, ${missing.length} not written)`, '',
  ...(flagged.length ? ['## Flagged (not saved until fixed - run again to rewrite them)', '', ...flagged.map((r) => `- **${r.name}** (#${r.id}): ${problems(cache[r.id].text).join(', ')}\n  > ${cache[r.id].text}`), ''] : []),
  '## Ready', '', ...ready.map((r) => `### ${r.name} (#${r.id})\n\n**Was:** ${cache[r.id].old || '(none)'}\n\n**Now:** ${cache[r.id].text}\n`)].join('\n');
fs.writeFileSync(REPORT, md);
console.log(`${ready.length} ready, ${flagged.length} flagged, ${missing.length} not written. Review: ${REPORT}`);
if (!APPLY) { console.log('Dry run - nothing changed.'); process.exit(0); }

const backup = path.join(DATA, `recipe_descriptions_backup_${Date.now()}.json`);
fs.writeFileSync(backup, JSON.stringify(recipes.map((r) => ({ id: r.id, summary: r.summary })), null, 1));
const upd = db.prepare('UPDATE brews SET summary = ?, updated_at = ? WHERE id = ?');
db.transaction(() => { for (const r of ready) upd.run(cache[r.id].text, Date.now(), r.id); })();
console.log(`Saved ${ready.length} descriptions. Backup of the old ones: ${backup}`);
process.exit(0);
