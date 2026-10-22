// Ingredient review (22 Oct 2026, Simon): every distinct ingredient line in the recipes and brews is read by Gemini,
// which says what the ingredient itself is - the thing you buy - and keeps everything else as a note in the recipe:
//   "Abenaki or other heirloom flint corn"  -> Corn (Abenaki or other heirloom flint corn)
//   "Corn or rice"                           -> Corn (or rice), also counts as Rice - either finds the recipe
//   "50% UK Fuggle and 50% Galena - 90 min"  -> two lines, Fuggle hops and Galena hops, sharing the quantity
//   "lemons, juice and rind"                 -> Lemons (juice and rind)
// A line's "also" list (alternatives) is counted as an ingredient in Ingredient pictures and the finder.
//   node server/scripts/review_ingredients_gemini.mjs            ask Gemini (cached), write the proposals report
//   node server/scripts/review_ingredients_gemini.mjs --apply    make the changes (a backup is saved first)
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';
import { GoogleGenerativeAI } from '../services/geminiClient.js';
import { getModelFor } from '../services/modelRegistry.js';
import { listAllIngredients } from '../services/homebrewPictures.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, '..', 'data');
const CACHE = path.join(DATA, 'ingredient_review_proposals.json');
const REPORT = path.join(DATA, 'ingredient_review_report.txt');
const APPLY = process.argv.includes('--apply');
const BATCH = 80;

const db = new Database(path.join(DATA, 'app.db'));
const rows = db.prepare('SELECT id, name, is_recipe, ingredients FROM brews').all()
  .map((r) => { try { return { ...r, ings: JSON.parse(r.ingredients || '[]') }; } catch { return null; } }).filter(Boolean);

// every distinct line, with an example of its amount and kind for context
const lines = new Map();
for (const r of rows) for (const g of r.ings) {
  const n = String(g.name || '').trim();
  if (n && !lines.has(n)) lines.set(n, { type: g.type || '', amount: [g.amount, g.unit].filter(Boolean).join(' ') });
}
// the ingredient names already in use (Ingredient pictures), so Gemini keeps to their wording
const established = listAllIngredients().ingredients.filter((i) => i.count >= 3 || i.isMain).map((i) => i.name).slice(0, 700);

const SYSTEM = `You tidy the ingredient lines of home-brew recipes (meads, wines, ciders, beers). For each line, say what the ingredient itself is - the thing you would buy or pick - and keep everything else as a short note that stays in the recipe. Reply with JSON only.`;
const RULES = `For each numbered line return {"i": number, "mode": ..., "items": [{"name": ..., "note": ...}]}.
mode:
- "keep": the line is already just an ingredient's name (a note in brackets alone is fine). items: [].
- "one": one ingredient plus detail. items: one {name, note}.
- "either": a choice between ingredients ("corn or rice", "apples or pears"). items: each option, the first is the main one.
- "mix": several ingredients used together that share the line's one quantity ("cherries and apricots", "50% Fuggle and 50% Galena"). items: each one.
- "all": several separate ingredients on one line with no shared quantity ("wine yeast and yeast nutrient"). items: each one.
name: the WHOLE ingredient as a shopper would know it, in the wording of the established list when it's there (same singular or plural - e.g. "Lemons", "Pineapple", "Corn", "Ginger", "Cinnamon", "Fuggle hops", "Wine yeast"). Sentence case: capitalise only the first word, unless a proper noun.
- A form, part or product of an ingredient is that ingredient, with the form in the note: "cinnamon sticks" -> Cinnamon (sticks); "cinnamon syrup" / "cinnamon extract" -> Cinnamon (syrup / extract); "cocoa powder" -> Cocoa (powder); "cocoa husks" -> Cocoa (husks); "coffee beans" -> Coffee (beans); "coriander seeds" -> Coriander (seeds); "ground allspice" -> Allspice (ground); "vanilla pods" -> Vanilla (pods); "lime juice", "lemon rind", "orange zest" -> Limes / Lemons / Oranges (juice / rind / zest). Exceptions that ARE ingredients in their own right: apple juice, grape juice, malt extract, cider, wine, beer, honey, tea (as a drink ingredient), molasses, maple syrup, golden syrup, treacle, yeast nutrient, pectic enzyme, Campden tablets.
- A variety, grade or age of something is that thing: "Abenaki or other heirloom flint corn" -> Corn; "old carrots" -> Carrots (old); "Bramley apples" -> Apples (Bramley); "Lalvin 71B" -> Wine yeast (Lalvin 71B); "80°L crystal" -> Crystal malt (80°L); "Kung Pao peppers" -> Chilli peppers (Kung Pao).
- Quantities and approximations are never part of the name: "about 6 cloves", "a lump of ginger", "cloves per gallon", "a branch of Mormon tea", "decent-sized wild sassafras roots" -> Cloves, Ginger, Cloves, Mormon tea (branch), Sassafras (roots, wild, decent-sized).
- "or other X" / "or similar" is NOT a choice - it's one ingredient with a note.
- Never invent an ingredient that isn't on the line. If the line isn't an ingredient at all ("if liked", "flavourings of your choice"), use mode "keep".
note: everything else on the line worth keeping, lower case, short, WITHOUT brackets around it and without repeating the name: variety, form, preparation, timing, percentage, and quantities or sizes written in the line's text ("Abenaki or other heirloom flint corn", "juice and rind", "90 min, for 25 IBU", "7 lb", "about 6"). Do NOT copy the [amount: ...] context into the note - that is already stored separately. For "either", put the choice in the first item's note as "or rice". Empty string if nothing.`;

async function ask(batch, startIndex) {
  const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  const model = genAI.getGenerativeModel({ model: getModelFor('homebrew') || config.gemini.chatModels.flash, systemInstruction: SYSTEM });
  const list = batch.map(([n, info], k) => `${startIndex + k}. ${n}${info.amount ? `   [amount: ${info.amount}]` : ''}${info.type ? `   [kind: ${info.type}]` : ''}`).join('\n');
  const prompt = `Established ingredient names (use their wording):\n${established.join(', ')}\n\n${RULES}\n\nLines:\n${list}\n\nReturn {"results": [...]} with one entry per line.`;
  const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } });
  const out = JSON.parse(res.response.text());
  return out.results || [];
}

// ---- 1. proposals (cached, so a re-run only asks about lines it hasn't seen) ----
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const todo = [...lines.entries()].filter(([n]) => !cache[n]);
if (!APPLY && todo.length) {
  console.log(`Asking Gemini about ${todo.length} lines in ${Math.ceil(todo.length / BATCH)} batches...`);
  for (let s = 0; s < todo.length; s += BATCH) {
    const batch = todo.slice(s, s + BATCH);
    let results = [];
    for (let attempt = 0; attempt < 3 && !results.length; attempt++) {
      try { results = await ask(batch, 0); } catch (e) { console.log(`  batch ${s / BATCH + 1}: ${e.message} - trying again`); await new Promise((r) => setTimeout(r, 4000)); }
    }
    for (const r of results) { const entry = batch[r.i]; if (entry) cache[entry[0]] = { mode: r.mode, items: (r.items || []).filter((x) => x && String(x.name || '').trim()) }; }
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
    console.log(`  batch ${s / BATCH + 1} of ${Math.ceil(todo.length / BATCH)}: ${results.length} answers`);
  }
}

// ---- 2. what each line becomes ----
const lc = (s) => String(s || '').trim();
const listWords = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0]);
// the names in use, by lower case, so a proposal takes their exact spelling ("Black malt", not "Black Malt")
const spelling = new Map(established.map((n) => [n.toLowerCase(), n]));
const caseOf = (n) => { const t = lc(n); return spelling.get(t.toLowerCase()) || (t ? t[0].toUpperCase() + t.slice(1).toLowerCase() : t); };
function transform(g) {
  const p = cache[lc(g.name)];
  if (!p || p.mode === 'keep' || !p.items?.length) return null;
  const amount = lc(g.amount);
  const unit = lc(g.unit);
  // a note never repeats the amount that's already in the amount field ("Cinnamon (sticks, 2)" with amount 2)
  const amountBits = new Set([amount, `${amount} ${unit}`, `${amount}${unit}`].map((x) => x.toLowerCase()).filter(Boolean));
  // a note's bits, each once ("husks or powder, 4 oz, powder, 4 oz" -> "husks or powder, 4 oz")
  const tidyNote = (s) => {
    const bits = lc(s).replace(/^\((.*)\)$/, '$1').split(/,\s*/).map((b) => b.trim()).filter((b) => b && !amountBits.has(b.toLowerCase()));
    return bits.filter((b, i) => bits.findIndex((x) => x.toLowerCase() === b.toLowerCase()) === i && !bits.some((x, j) => j !== i && x.length > b.length && x.toLowerCase().includes(b.toLowerCase()))).join(', ');
  };
  // the book's own quantity in brackets ("(½ lb)") is kept if the proposal dropped it
  const keepBrackets = (name) => {
    const lower = name.toLowerCase();
    const lost = (lc(g.name).match(/\([^)]*\d[^)]*\)/g) || []).filter((b) => !lower.includes(b.slice(1, -1).toLowerCase()));
    return lost.length ? `${name} ${lost.join(' ')}` : name;
  };
  const named = (it, extra = '') => { const note = tidyNote([it.note, extra].filter(Boolean).join(', ')); return `${caseOf(it.name)}${note ? ` (${note})` : ''}`; };
  // the same ingredient twice ("cocoa husks or cocoa powder" -> Cocoa, Cocoa) is one ingredient
  const items = [...new Map(p.items.map((it) => [caseOf(it.name).toLowerCase(), it])).values()];
  const merged = items.length < p.items.length
    ? [{ name: items[0].name, note: p.items.filter((it) => caseOf(it.name).toLowerCase() === caseOf(items[0].name).toLowerCase()).map((it) => tidyNote(it.note)).filter(Boolean).join(', ') }, ...items.slice(1)]
    : items;
  if (p.mode === 'one' || merged.length === 1) {
    const name = keepBrackets(named(merged[0]));
    return name === lc(g.name) ? null : [{ ...g, name }];
  }
  if (p.mode === 'either') {
    const [first, ...others] = merged;
    const note = tidyNote(first.note) || `or ${listWords(others.map((o) => lc(o.name).toLowerCase()))}`;
    return [{ ...g, name: keepBrackets(`${caseOf(first.name)} (${note})`), also: others.map((o) => caseOf(o.name)) }];
  }
  // mix / all: one line each; a shared quantity is shown on each as a mix
  const names = merged.map((it) => caseOf(it.name).toLowerCase());
  return merged.map((it, k) => {
    const withWhat = `mixed with ${listWords(names.filter((_, j) => j !== k))}`;
    return { ...g, name: k === 0 ? keepBrackets(named(it)) : named(it), amount, unit: amount ? `${unit}${unit ? ' ' : ''}(${withWhat})` : unit };
  });
}

const report = [];
const changes = [];
const counts = { one: 0, either: 0, mix: 0, all: 0 };
for (const r of rows) {
  let any = false;
  const after = r.ings.flatMap((g) => {
    const t = transform(g);
    if (!t) return [g];
    any = true;
    const mode = cache[lc(g.name)].mode;
    counts[mode] = (counts[mode] || 0) + 1;
    report.push(`${mode.padEnd(6)} | ${g.name}  ->  ${t.map((x) => `${x.name}${x.also ? ` [also: ${x.also.join(', ')}]` : ''}${x.unit && x.unit.includes('mixed') ? ` [${[x.amount, x.unit].filter(Boolean).join(' ')}]` : ''}`).join('  +  ')}`);
    return t;
  });
  if (any) changes.push({ id: r.id, recipe: r.name, before: r.ings, after });
}
const unanswered = [...lines.keys()].filter((n) => !cache[n]).length;
const distinct = [...new Set(report)].sort();
fs.writeFileSync(REPORT, `${distinct.join('\n')}\n`);
console.log(`${report.length} lines would change (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}) in ${changes.length} recipes and brews; ${distinct.length} distinct changes listed in ${REPORT}${unanswered ? `; ${unanswered} lines had no answer and are left alone` : ''}`);
if (!APPLY) { console.log('Dry run - nothing written. Run with --apply to make these changes.'); process.exit(0); }

const backup = path.join(DATA, `ingredient_review_backup_${Date.now()}.json`);
fs.writeFileSync(backup, JSON.stringify(changes.map(({ id, recipe, before }) => ({ id, recipe, ingredients: before })), null, 1));
const upd = db.prepare('UPDATE brews SET ingredients = ? WHERE id = ?');
db.transaction(() => { for (const c of changes) upd.run(JSON.stringify(c.after), c.id); })();
console.log(`Applied. The old ingredients are saved in ${backup}`);
process.exit(0);
