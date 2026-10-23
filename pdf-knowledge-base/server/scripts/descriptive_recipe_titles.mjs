// One-off (23 Oct 2026, Simon): recipe titles that don't say what the drink is - "AG#27 Nebulous Cascadian Dark Ale",
// "Wendy I (glucose chippings ale)", "Continuity Error - Texas Brown Ale" - get a plain, descriptive one ("Cascadian
// dark ale", "Glucose pale ale"...). Titles that already say what it is ("Raspberry wine", "Dry mead") are kept.
// The original title is kept on the recipe (brews.original_name). Brews keep their own names.
//   node server/scripts/descriptive_recipe_titles.mjs            Gemini suggests; writes the review (nothing changed)
//   node server/scripts/descriptive_recipe_titles.mjs --apply    makes the changes (backup first)
// Suggestions are cached (data/recipe_title_proposals.json); edit that file to change or veto one before --apply
// (set "keep": true to leave a recipe as it is).
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';
import { GoogleGenerativeAI } from '../services/geminiClient.js';
import { getModelFor } from '../services/modelRegistry.js';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const APPLY = process.argv.includes('--apply');
const CACHE = path.join(DATA, 'recipe_title_proposals.json');
const REPORT = path.join(DATA, 'recipe_title_review.md');
const BATCH = 70;
const db = new Database(path.join(DATA, 'app.db'));
try { db.exec('ALTER TABLE brews ADD COLUMN original_name TEXT'); } catch { /* already there */ }

const recipes = db.prepare('SELECT id, name, category, style, source_name, original_name FROM brews WHERE is_recipe = 1 ORDER BY name').all();
const mains = new Map(db.prepare('SELECT brew_id, items FROM brew_main_ingredients').all().map((r) => { try { return [r.brew_id, JSON.parse(r.items || '[]').map((i) => i.name)]; } catch { return [r.brew_id, []]; } }));

const SYSTEM = 'You are an experienced home brewer and editor tidying the titles in a recipe book of meads, wines, ciders, beers and sodas. Reply with JSON only.';
const RULES = `For each recipe decide whether its title already says plainly what the drink is.
- KEEP it (keep: true) if a brewer reading the title alone would know what it is: the main ingredient(s) and/or the kind of drink - "Raspberry wine", "Dry mead", "Nettle beer", "Blackberry and apple wine (sweet)", "Elderflower champagne", "Cyser II (sweet)", "Pale ale", "Porter", "Kvass", "Sake", "Hop beer", "Tree leaf wine (oak or walnut)". A traditional drink name is descriptive (cyser, pyment, melomel, metheglin, hippocras, bochet, braggot, t'ej, kvass, saison, perry). Bracketed variants and sources stay as they are - "(sweet)", "(Boots)", "(Glover)", "(Wise)", "No. 2".
- RENAME it (keep: false) when the title is a brand, code, pun, person's name or in-joke and doesn't say what it is: "AG#27 Nebulous Cascadian Dark Ale", "BIAB#1 Amarillo pale ale (SMaSH)", "Wendy I (glucose chippings ale)", "Continuity Error - Texas Brown Ale", "The Lost Vikings banana-coffee t'ej", "Appalachian Viking", "Hop in My Belly Cider", "Dirty Water New England Cider", "Take Me Back to Tupelo Cyser", "Red Hot Cider (cinnamon candy)".
New title, when renaming:
- What it is, plainly: its main ingredient(s) or defining character, then the kind of drink - "Cascadian dark ale", "Amarillo pale ale (single malt and hop)", "Glucose pale ale", "Texas brown ale", "Banana and coffee t'ej", "Citra-hopped cider", "Tupelo honey cyser", "Cinnamon cider".
- Keep any real style or ingredient words from the old title; drop codes (AG#27, BIAB#1), names, puns and slogans.
- Keep a bracketed source or variant from the old title if it had one, e.g. "(Boots)", "(sweet)".
- Sentence case (capitalise the first word and proper nouns only), British spelling, at most about six words before any bracket.
- Never invent ingredients that aren't in the title, style or main ingredients given.
Return {"results": [{"id": number, "keep": boolean, "title": "the new title, or the old one if kept"}]} with one entry per recipe.`;

const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({ model: getModelFor('homebrew') || config.gemini.chatModels.flash, systemInstruction: SYSTEM });
async function ask(batch) {
  const list = batch.map((r) => `${r.id} | ${r.name} | ${r.category || '-'} | ${r.style || '-'} | ${(mains.get(r.id) || []).join(', ') || '-'}`).join('\n');
  const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: `${RULES}\n\nRecipes (id | title | kind | style | main ingredients):\n${list}` }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } });
  return JSON.parse(res.response.text()).results || [];
}

// ---- 1. suggestions (cached: a re-run only asks about recipes it hasn't seen) ----
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const todo = recipes.filter((r) => !r.original_name && !cache[r.id]);
if (!APPLY && todo.length) {
  console.log(`Asking Gemini about ${todo.length} recipe titles in ${Math.ceil(todo.length / BATCH)} batches...`);
  for (let s = 0; s < todo.length; s += BATCH) {
    const batch = todo.slice(s, s + BATCH);
    let results = [];
    for (let attempt = 0; attempt < 3 && !results.length; attempt++) {
      try { results = await ask(batch); } catch (e) { console.log(`  batch ${s / BATCH + 1}: ${e.message} - trying again`); await new Promise((r) => setTimeout(r, 4000)); }
    }
    for (const r of results) {
      const rec = batch.find((b) => b.id === Number(r.id));
      if (rec) cache[rec.id] = { old: rec.name, keep: Boolean(r.keep) || !String(r.title || '').trim() || r.title.trim() === rec.name, title: String(r.title || rec.name).trim() };
    }
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
    console.log(`  ${Math.min(s + BATCH, todo.length)} of ${todo.length}`);
  }
}

// ---- 2. the review ----
const changes = recipes.filter((r) => cache[r.id] && !cache[r.id].keep && !r.original_name).map((r) => ({ id: r.id, old: r.name, title: cache[r.id].title, category: r.category }));
const kept = recipes.length - changes.length;
const md = [`# Recipe titles to change (${changes.length} of ${recipes.length})`, '', `${kept} titles already say what the drink is and stay as they are.`, '',
  'To veto or change one: edit `data/recipe_title_proposals.json` (set "keep": true, or change "title"), then run with --apply.', '',
  '| # | Now | Becomes |', '|---|---|---|', ...changes.map((c) => `| ${c.id} | ${c.old.replace(/\|/g, '/')} | ${c.title.replace(/\|/g, '/')} |`)].join('\n');
fs.writeFileSync(REPORT, md);
console.log(`${changes.length} titles to change, ${kept} kept. Review: ${REPORT}`);
if (!APPLY) { console.log('Dry run - nothing changed.'); process.exit(0); }

// ---- 3. apply: the new title, and the recipe's family and version worked out again from it ----
const { splitName, variantLabel } = await import('../services/homebrewTags.js');
const backup = path.join(DATA, `recipe_titles_backup_${Date.now()}.json`);
fs.writeFileSync(backup, JSON.stringify(changes.map(({ id, old }) => ({ id, name: old })), null, 1));
const cat = new Map(recipes.map((r) => [r.id, r.category]));
const upd = db.prepare('UPDATE brews SET original_name = COALESCE(original_name, ?), name = ?, family = ?, variant = ?, updated_at = ? WHERE id = ?');
db.transaction(() => {
  for (const c of changes) upd.run(c.old, c.title, splitName(c.title, cat.get(c.id)).family, variantLabel(c.title, cat.get(c.id), null) || null, Date.now(), c.id);
})();
console.log(`Renamed ${changes.length} recipes. Backup of the old titles: ${backup}`);
process.exit(0);
