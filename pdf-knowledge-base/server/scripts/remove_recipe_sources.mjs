// One-off (23 Oct 2026, Simon): take every recipe's source off it - the book or site it came from (source name and
// link), the book or author in its title ("Sloe wine (Glover)" -> "Sloe wine", "(sweet, Boots)" -> "(sweet)",
// "Mrs Beeton's orange wine" -> "Orange wine"), and the "Source: ..." / "Boots recipe no. 12." lines in its notes.
// Brews made from a recipe lose the same (they were copied from it). Each recipe's family and version are worked out
// again from its new title; versions that are otherwise the same are numbered by the app. A backup is saved first.
//   node server/scripts/remove_recipe_sources.mjs [--apply]
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { splitName, variantLabel } from '../services/homebrewTags.js';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const APPLY = process.argv.includes('--apply');
const db = new Database(path.join(DATA, 'app.db'));

// book and author names as they appear in titles
const NAMES = ['Proulx & Nichols', 'Farmers Weekly', 'Mrs Beeton', 'Glover', 'Wise', 'Boots', 'Merrydown', 'Shockey', 'Beechum', 'Raffald', 'Shales',
  'Patten', 'Bender', 'Baudar', 'Turner', 'Launay', 'Hieronymus', 'Zimmerman', 'Broadford'];
const NAME_RE = new RegExp(`^(?:${NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?:'s)?$`, 'i');
function cleanTitle(t) {
  let s = String(t || '');
  // in brackets: drop the parts that are a source, keep the rest ("(sweet, Boots)" -> "(sweet)", "(Raffald, 1795)" -> "(1795)")
  s = s.replace(/\s*\(([^()]*)\)/g, (m, inner) => {
    const parts = inner.split(/\s*,\s*/).filter((p) => !NAME_RE.test(p.trim()));
    return parts.length ? ` (${parts.join(', ')})` : '';
  });
  // at the start: "Mrs Beeton's orange wine" -> "Orange wine", "Boots basic beer" -> "Basic beer"
  s = s.replace(/^(?:Mrs Beeton's|Boots)\s+/i, '');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : t;
}
// the source sentences in notes, one per book, then any other "Source: ... (...)." line
const NOTE_RES = [
  /Source: The Boots Book of Home Wine Making and Brewing by B\. ?C\. ?A\. Turner\.\s*/g,
  /Source: 500 Recipes for Home-Made Wines & Drinks by Marguerite Patten \(Hamlyn\)\.\s*/g,
  /Source: Drink Your Own Garden by Judith Glover \([^)]*\)\.\s*/g,
  /Source: Home-Made Country Wines, Beer, Mead and Metheglin, compiled by Dorothy Wise \([^)]*\)\.\s*/g,
  /Source: The Everything Hard Cider Book by Drew Beechum \([^)]*\)\.\s*/g,
  /Source: The Merrydown Book of Country Wines by André Launay \([^)]*\)\.\s*/g,
  /Source: The Big Book of Cidermaking by Christopher Shockey and Kirsten K\. Shockey \([^)]*\)\.\s*/g,
  /Source: Brewing Better Beers by Ken Shales\.\s*/g,
  /Source: Cider - Making, Using & Enjoying Sweet & Hard Cider by Annie Proulx and Lew Nichols \([^)]*\)\.\s*/g,
  /Source: [^\n]*?\([^)]*\)\.\s*/g,
  /Boots recipe no\. ?\d+[a-z]?\.\s*/gi,
];
const cleanNotes = (n) => {
  if (!n) return n;
  let s = String(n);
  for (const re of NOTE_RES) s = s.replace(re, '');
  return s.replace(/\n{3,}/g, '\n\n').trim() || null;
};

const rows = db.prepare('SELECT id, is_recipe, from_recipe, name, category, source_name, source_url, notes, family, variant FROM brews WHERE is_recipe = 1 OR from_recipe IS NOT NULL').all();
const changes = rows.map((r) => {
  const name = cleanTitle(r.name);
  const notes = cleanNotes(r.notes);
  const family = r.is_recipe ? splitName(name, r.category).family : r.family;
  const variant = r.is_recipe ? variantLabel(name, r.category, null) : r.variant;
  return { r, name, notes, family, variant };
}).filter(({ r, name, notes, family, variant }) => name !== r.name || notes !== r.notes || r.source_name || r.source_url || family !== r.family || variant !== r.variant);

const titled = changes.filter((c) => c.name !== c.r.name);
const noted = changes.filter((c) => c.notes !== c.r.notes);
const sourced = changes.filter((c) => c.r.source_name || c.r.source_url);
console.log(`${sourced.length} recipes and brews with a source name or link, ${titled.length} titles, ${noted.length} notes to change`);
console.log('Titles, for example:'); for (const c of titled.slice(0, 12)) console.log(`  ${c.r.name}  ->  ${c.name}`);
const left = changes.filter((c) => /Source:|Boots recipe/i.test(c.notes || ''));
if (left.length) console.log(`(${left.length} notes still mention a source - check them)`);
if (!APPLY) { console.log('Dry run - nothing changed.'); process.exit(0); }

const backup = path.join(DATA, `recipe_sources_backup_${Date.now()}.json`);
fs.writeFileSync(backup, JSON.stringify(changes.map(({ r }) => r), null, 1));
const upd = db.prepare('UPDATE brews SET name = ?, notes = ?, source_name = NULL, source_url = NULL, family = ?, variant = ?, updated_at = ? WHERE id = ?');
db.transaction(() => { for (const c of changes) upd.run(c.name, c.notes, c.family, c.variant, Date.now(), c.r.id); })();
// the title suggestions waiting for review lose the same source names
const CACHE = path.join(DATA, 'recipe_title_proposals.json');
if (fs.existsSync(CACHE)) {
  const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  for (const v of Object.values(cache)) { v.title = cleanTitle(v.title); v.old = cleanTitle(v.old); }
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
}
console.log(`Applied. Backup: ${backup}`);
