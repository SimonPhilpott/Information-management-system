// One-off (22 Oct 2026, Simon): every ingredient starts with a capital letter - recipe and brew lines, their "also
// counts as" alternatives, and each recipe's main ingredients. Only the first letter changes ("potassium sorbate" ->
// "Potassium sorbate"). A backup is saved first.   node server/scripts/capitalise_ingredients.mjs [--apply]
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const APPLY = process.argv.includes('--apply');
const db = new Database(path.join(DATA, 'app.db'));
// the first letter, after any leading spaces or opening punctuation
const cap = (s) => String(s ?? '').replace(/^(\s*["'(]*)([a-z])/, (m, lead, ch) => lead + ch.toUpperCase());

let lines = 0;
const brewChanges = [];
for (const r of db.prepare('SELECT id, ingredients FROM brews').all()) {
  let ings;
  try { ings = JSON.parse(r.ingredients || '[]'); } catch { continue; }
  let any = false;
  const after = ings.map((g) => {
    const name = cap(g.name);
    const also = Array.isArray(g.also) ? g.also.map(cap) : g.also;
    const changed = name !== g.name || (Array.isArray(g.also) && also.some((a, i) => a !== g.also[i]));
    if (!changed) return g;
    any = true; lines++;
    return { ...g, name, ...(Array.isArray(g.also) ? { also } : {}) };
  });
  if (any) brewChanges.push({ id: r.id, before: r.ingredients, after: JSON.stringify(after) });
}
let mainItems = 0;
const mainChanges = [];
for (const r of db.prepare('SELECT brew_id, items FROM brew_main_ingredients').all()) {
  let items;
  try { items = JSON.parse(r.items || '[]'); } catch { continue; }
  let any = false;
  const after = items.map((it) => { const name = cap(it.name); if (name === it.name) return it; any = true; mainItems++; return { ...it, name }; });
  if (any) mainChanges.push({ brew_id: r.brew_id, before: r.items, after: JSON.stringify(after) });
}
console.log(`${lines} ingredient lines in ${brewChanges.length} recipes and brews, and ${mainItems} main ingredients, need a capital`);
if (!APPLY) { console.log('Dry run - nothing written.'); process.exit(0); }
const backup = path.join(DATA, `capitalise_backup_${Date.now()}.json`);
fs.writeFileSync(backup, JSON.stringify({ brews: brewChanges.map(({ id, before }) => ({ id, ingredients: before })), mains: mainChanges.map(({ brew_id, before }) => ({ brew_id, items: before })) }, null, 1));
db.transaction(() => {
  for (const c of brewChanges) db.prepare('UPDATE brews SET ingredients = ? WHERE id = ?').run(c.after, c.id);
  for (const c of mainChanges) db.prepare('UPDATE brew_main_ingredients SET items = ? WHERE brew_id = ?').run(c.after, c.brew_id);
})();
console.log(`Applied. Backup: ${backup}`);
