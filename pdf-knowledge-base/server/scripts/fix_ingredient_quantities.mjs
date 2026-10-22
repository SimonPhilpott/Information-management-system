// One-off tidy (22 Oct 2026, Simon): some recipe ingredients carry their quantity or size in the name
// ("1–2 limes", "20–25 bushels of apples", "a few cloves", "Average-sized peaches", "100% sour cherry juice"), so
// each became its own ingredient in Ingredient pictures and the finder, and didn't link to the picture of the
// ingredient itself. This moves the quantity into the amount field (or, when the amount is already filled in, to
// the end of the name in brackets, which the ingredient matching ignores) and sizes and "100%" to the end in
// brackets: "peaches (average-sized)". Nothing is lost.
//   node server/scripts/fix_ingredient_quantities.mjs            dry run: lists every change, writes nothing
//   node server/scripts/fix_ingredient_quantities.mjs --apply    makes the changes (after saving a backup)
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { canonicalizeMain, normIngredient } from '../services/homebrewCanonical.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(here, '..', 'data', 'app.db');
const APPLY = process.argv.includes('--apply');

const NUM = String.raw`(?:\d+(?:[.,]\d+)?(?:\s*[½¼¾⅓⅔])?|[½¼¾⅓⅔]|\d+\s*/\s*\d+)`;
const RANGE = String.raw`${NUM}(?:\s*(?:[–—-]|to)\s*${NUM})?`;
const UNIT = String.raw`(?:%|kg|kgs|g|gr|grams?|lbs?|oz|ounces?|l|litres?|liters?|ml|tsp|tbsp|teaspoons?|tablespoons?|teaspoonfuls?|tablespoonfuls?|spoonfuls?|cups?|cupfuls?|pints?|pt|quarts?|qt|gallons?|gal|bushels?|handfuls?|heads?|sprigs?|sticks?|cloves?|pods?|sachets?|packets?|packages?|packs?|cans?|tins?|bottles?|bunch(?:es)?|pieces?|slices?|stalks?|knobs?|pinch(?:es)?|dash(?:es)?|drops?|bags?|jars?|boxes?|punnets?|pounds?)`;
// "1 level tsp salt", "2 heaped tbsp honey": the word before the unit belongs with it
const QTY_RE = new RegExp(String.raw`^(${RANGE})\s*(?:((?:(?:level|heaped|heaping|rounded|scant|generous|good|large|small)\s+)?${UNIT})\b\.?)?\s+(?:of\s+)?(.+)$`, 'i');
const WORDS_RE = /^(a few|a couple of|a couple|a handful of|a small handful of|a large handful of|a good handful of|a pinch of|a dash of|a splash of|a little|a bunch of|a heaped [a-z]+ of|several|some)\s+(.+)$/i;
const SIZE_RE = /^(average[- ]sized|medium[- ]sized|good[- ]sized|extra[- ]large|large|small|big|jumbo|medium)\s+(.+)$/i;
const NOT_A_SIZE = /^(crystal|malt|roast|toast|dry|sweet|caramel|brown|amber|dark|light|beer|ale)\b/i; // "medium crystal malt" is a grade
const tidyRange = (s) => s.replace(/\s*(?:[–—]|-|to)\s*/i, '–').replace(/\s+/g, ' ').trim();

// Citrus juice, zest, rind and peel are the fruit, used a particular way: "Lime juice" -> "Limes (juice)", so it links
// to the lime's picture and counts as limes in the finder, and "juice of 2 lemons" -> 2 "Lemons (juice)". Apple and
// grape juice are left alone - they're ingredients in their own right (the server's merge rules say so).
const CITRUS = '(lemon|lime|orange|grapefruit|tangerine|mandarin|clementine|satsuma|seville orange|blood orange)';
const PART = '(juice|zest|rind|peel|grated rind|grated zest|thinly pared rind|pared rind)';
const NUMWORD = { a: '1', an: '1', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6' };
const CITRUS_RE = new RegExp(String.raw`^(?:(?:fresh|freshly squeezed|squeezed)\s+)?${CITRUS}s?\s+${PART}(?:\s+and\s+${PART})?\b(.*)$`, 'i');
const CITRUS_OF_RE = new RegExp(String.raw`^(?:the\s+)?${PART}(?:\s+and\s+${PART})?\s+of\s+(\d+(?:[.,]\d+)?(?:\s*[–-]\s*\d+)?|a|an|one|two|three|four|five|six|half an?|½)\s+(?:(?:large|small|medium|fresh|unwaxed)\s+)?${CITRUS}s?\b(.*)$`, 'i');
const fruitName = (f) => { const w = f.toLowerCase(); const plural = /fruit$/.test(w) ? w : `${w}s`; return plural[0].toUpperCase() + plural.slice(1); };
function fixCitrus(name, amount) {
  let m = name.match(CITRUS_RE);
  if (m) return { name: `${fruitName(m[1])}${m[4] || ''}`.trim(), form: [m[2], m[3]].filter(Boolean).join(' and ').toLowerCase(), amount };
  m = name.match(CITRUS_OF_RE);
  if (m && !/\bor\b/i.test(m[5] || '')) { // "juice of 1 lemon or 2 limes" is a choice - left as it is
    const n = /^half/i.test(m[3]) ? '½' : NUMWORD[m[3].toLowerCase()] || m[3];
    return { name: `${fruitName(m[4])}${m[5] || ''}`.trim(), form: [m[1], m[2]].filter(Boolean).join(' and ').toLowerCase(), amount: amount || n };
  }
  return null;
}

// one ingredient: returns the changed copy, or null if it's fine as it is
function fixOne(g) {
  let name = String(g.name || '').trim();
  let amount = String(g.amount ?? '').trim();
  let unit = String(g.unit ?? '').trim();
  const notes = [];
  let changed = false;
  for (let pass = 0; pass < 4; pass++) {
    const c = fixCitrus(name, amount);
    if (c) { name = c.name; amount = c.amount; notes.unshift(c.form); changed = true; continue; }
    let m = name.match(QTY_RE);
    if (m && m[3].length > 1) {
      const qty = tidyRange(m[1]);
      const u = m[2] || '';
      if (u === '%' && Number(qty) !== 100) break; // "92 % pale malt" is a share of the grist, already shown that way
      if (u === '%') notes.push('100%');
      else if (!amount) { amount = qty; unit = unit || u; }
      else notes.push(`${qty}${u ? ` ${u}` : ''}`);
      name = m[3].trim(); changed = true; continue;
    }
    m = name.match(WORDS_RE);
    if (m) {
      const words = m[1].replace(/\s+of$/i, '').toLowerCase();
      if (!amount) amount = words; else notes.push(words);
      name = m[2].trim(); changed = true; continue;
    }
    m = name.match(SIZE_RE);
    if (m && !NOT_A_SIZE.test(m[2])) {
      notes.push(m[1].toLowerCase().replace(/ /g, '-'));
      name = m[2].trim(); changed = true; continue;
    }
    // a bracket left at the front ("1 bottle (350 ml) dry cider" -> "(350 ml) dry cider"): it goes to the end
    m = changed && name.match(/^\(([^)]*)\)\s*(.+)$/);
    if (m) { notes.push(m[1].trim()); name = m[2].trim(); continue; }
    break;
  }
  if (!changed) return null;
  // keep a leading capital if the original had one ("Average-sized peaches" -> "Peaches (average-sized)")
  if (/^[A-Z]/.test(String(g.name)) && /^[a-z]/.test(name)) name = name[0].toUpperCase() + name.slice(1);
  if (notes.length) name = `${name} (${notes.join(', ')})`;
  return { ...g, name, amount, unit };
}

const db = new Database(DB_PATH, { readonly: !APPLY });
const rows = db.prepare('SELECT id, name, is_recipe, ingredients FROM brews').all();
const parsed = rows.map((r) => { try { return { ...r, ings: JSON.parse(r.ingredients || '[]') }; } catch { return { ...r, ings: null }; } }).filter((r) => r.ings);

// ---- combined ingredients ("Cherries and apricots"): one line for each, the mix in the quantity ----
// Only when every part is an ingredient that turns up on its own line in at least two recipes, so "lemons, juice and
// rind" or "birch twigs and clean wheat straw" are left alone.
const bare = (n) => normIngredient(canonicalizeMain(String(n || '').replace(/\(.*?\)/g, '').split(/,|\s[-–—]\s|;/)[0].trim()));
const seen = new Map();
for (const r of parsed) for (const g of r.ings) { const k = bare(fixOne(g)?.name ?? g.name); if (k) seen.set(k, (seen.get(k) || 0) + 1); }
const known = (k) => (seen.get(k) || 0) >= 1;
function splitOne(g) {
  const name = String(g.name || '').trim();
  const brackets = (name.match(/\s*\([^)]*\)/g) || []).join('');
  const plain = name.replace(/\s*\([^)]*\)/g, '').trim();
  const [head0, ...tail] = plain.split(/\s[-–—]\s/);
  if (/\bor\b/i.test(head0)) return null; // "apples or pears" is a choice, not a mix
  // "cherries and apricots, mixed": a trailing "mixed" is what the split says anyway
  const head = head0.replace(/,\s*(?:well\s+)?mixed$/i, '').trim();
  const parts = head.replace(/^mixed\s+/i, '').split(/\s*(?:,|&|\band\b)\s*/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 4 || !parts.every((p) => known(bare(p)) && bare(p) !== bare(head))) return null;
  const suffix = tail.length ? ` - ${tail.join(' - ')}` : '';
  return parts.map((p, i) => {
    const others = parts.filter((_, j) => j !== i).map((x) => x.toLowerCase());
    const withWhat = `mixed with ${others.length > 1 ? `${others.slice(0, -1).join(', ')} and ${others.at(-1)}` : others[0]}`;
    const cap = /^[A-Z]/.test(name) ? p[0].toUpperCase() + p.slice(1) : p;
    const amount = String(g.amount ?? '').trim();
    const unit = String(g.unit ?? '').trim();
    // a shared quantity is a mix ("2 kg (mixed with apricots)"); with no quantity they're simply separate lines
    return { ...g, name: `${cap}${suffix}${brackets}`, amount, unit: amount ? `${unit}${unit ? ' ' : ''}(${withWhat})` : unit };
  });
}

const changes = []; // { id, recipe, before: [...], after: [...] }
const report = [];
const splits = [];
for (const r of parsed) {
  let any = false;
  const after = r.ings.flatMap((g) => {
    const f = fixOne(g) || g;
    const s = splitOne(f);
    const show = (x) => `"${x.name}" [${[x.amount, x.unit].filter(Boolean).join(' ') || '-'}]`;
    if (s) {
      any = true;
      splits.push(`${r.is_recipe ? 'recipe' : 'brew  '} ${String(r.id).padStart(5)} | ${show(g)}  ->  ${s.map(show).join('  +  ')}`);
      return s;
    }
    if (f !== g) { any = true; report.push(`${r.is_recipe ? 'recipe' : 'brew  '} ${String(r.id).padStart(5)} | ${show(g)}  ->  ${show(f)}`); }
    return [f];
  });
  if (any) changes.push({ id: r.id, recipe: r.name, before: r.ings, after });
}

// ---- the main ingredients picked for each recipe's pictures ("Cherries and apricots") are split the same way ----
const mainRows = db.prepare('SELECT brew_id, items FROM brew_main_ingredients').all();
const mainParsed = mainRows.map((r) => { try { return { brew_id: r.brew_id, items: JSON.parse(r.items || '[]') }; } catch { return null; } }).filter(Boolean);
const mainSplit = new Map(); // brew_id -> items after splitting
for (const r of mainParsed) {
  let any = false;
  const after = r.items.flatMap((it) => {
    const s = splitOne({ name: it.name });
    if (!s) return [it];
    any = true;
    return s.map((x) => ({ ...it, name: x.name[0].toUpperCase() + x.name.slice(1), picture: x.name.toLowerCase() }));
  });
  if (any) mainSplit.set(r.brew_id, after);
}

// ---- one name for one ingredient: "Pineapples" and "Pineapple" are the same thing ----
// Where a singular and a plural of the same ingredient both turn up, the one the recipes use most is kept and the
// other renamed to it (the count stays in the amount): Pineapple (9) over Pineapples (2), Apples (109) over Apple.
const headOf = (name) => String(name || '').replace(/\s*\([^)]*\)/g, '').split(/,|\s[-–—]\s|;/)[0].trim();
const finalLines = [...parsed.map((r) => (changes.find((c) => c.id === r.id)?.after || r.ings)).flat().map((g) => g.name),
  ...mainParsed.flatMap((r) => (mainSplit.get(r.brew_id) || r.items).map((i) => i.name))];
const tally = new Map(); // key -> { n, shown: Map(text -> n) }
for (const nm of finalLines) {
  const h = headOf(nm); const k = bare(h);
  if (!k) continue;
  const t = tally.get(k) || { n: 0, shown: new Map() };
  t.n++; t.shown.set(h.toLowerCase(), (t.shown.get(h.toLowerCase()) || 0) + 1);
  tally.set(k, t);
}
const otherForms = (k) => {
  const words = k.split(' '); const last = words.pop();
  const c = [`${last}s`, `${last}es`, last.replace(/y$/, 'ies'), last.replace(/ies$/, 'y'), last.replace(/es$/, ''), last.replace(/s$/, '')];
  return [...new Set(c)].map((x) => [...words, x].join(' ')).filter((x) => x !== k && x.length > 2);
};
const renameTo = new Map(); // key of the less-used form -> text of the more-used one
for (const [k, t] of tally) {
  for (const o of otherForms(k)) {
    const u = tally.get(o);
    if (!u || renameTo.has(k) || renameTo.has(o)) continue;
    const [win, lose] = t.n >= u.n ? [[k, t], [o, u]] : [[o, u], [k, t]];
    const shown = [...win[1].shown.entries()].sort((a, b) => b[1] - a[1])[0][0];
    renameTo.set(lose[0], shown);
  }
}
const renamed = [];
const renameName = (nm) => {
  const h = headOf(nm); const to = renameTo.get(bare(h));
  if (!to || !h) return nm;
  const text = /^[A-Z]/.test(h) ? to[0].toUpperCase() + to.slice(1) : to;
  const out = nm.replace(h, text);
  if (out !== nm) renamed.push(`"${nm}"  ->  "${out}"`);
  return out;
};
for (const r of parsed) {
  const cur = changes.find((c) => c.id === r.id);
  const base = cur ? cur.after : r.ings;
  const after = base.map((g) => { const n = renameName(g.name); return n === g.name ? g : { ...g, name: n }; });
  if (after.some((g, i) => g !== base[i])) { if (cur) cur.after = after; else changes.push({ id: r.id, recipe: r.name, before: r.ings, after }); }
}

const mainChanges = [];
const mainReport = [];
for (const r of mainParsed) {
  const items = r.items;
  const split = mainSplit.get(r.brew_id) || items;
  const after = split.map((it) => { const n = renameName(it.name); return n === it.name ? it : { ...it, name: n }; });
  const any = mainSplit.has(r.brew_id) || after.some((x, i) => x !== split[i]);
  if (any) {
    // keep at most three, as the picker does, without repeating one
    const uniq = [...new Map(after.map((x) => [bare(x.name), x])).values()].slice(0, 3);
    mainChanges.push({ brew_id: r.brew_id, before: items, after: uniq });
    mainReport.push(`main ${String(r.brew_id).padStart(5)} | ${items.map((x) => x.name).join(', ')}  ->  ${uniq.map((x) => x.name).join(', ')}`);
  }
}

console.log(report.join('\n'));
console.log('\n---- combined ingredients split ----');
console.log(splits.join('\n'));
console.log('\n---- main ingredients split ----');
console.log(mainReport.join('\n'));
console.log('\n---- singular / plural made one ----');
console.log([...renameTo.entries()].map(([k, v]) => `${k}  ->  ${v}`).join('\n'));
console.log(`\n${report.length} lines tidied, ${splits.length} combined lines split, ${renamed.length} names made one form, in ${changes.length} recipes and brews; ${mainReport.length} main-ingredient lists changed`);
if (!APPLY) { console.log('Dry run - nothing written. Run with --apply to make these changes.'); process.exit(0); }

const backup = path.join(here, '..', 'data', `ingredient_quantities_backup_${Date.now()}.json`);
fs.writeFileSync(backup, JSON.stringify({
  brews: changes.map(({ id, recipe, before }) => ({ id, recipe, ingredients: before })),
  mainIngredients: mainChanges.map(({ brew_id, before }) => ({ brew_id, items: before })),
}, null, 1));
const upd = db.prepare('UPDATE brews SET ingredients = ? WHERE id = ?');
const updMain = db.prepare('UPDATE brew_main_ingredients SET items = ? WHERE brew_id = ?');
db.transaction(() => {
  for (const c of changes) upd.run(JSON.stringify(c.after), c.id);
  for (const c of mainChanges) updMain.run(JSON.stringify(c.after), c.brew_id);
})();
console.log(`Applied. The old ingredients are saved in ${backup}`);
