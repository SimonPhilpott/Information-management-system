// One-off (22 Oct 2026): ingredient names with brackets inside brackets ("Beetroot (shredded (0.5–1 oz per gallon),
// near the end)") confuse the ingredient matching, which stops at the first closing bracket. Inner brackets become
// commas: "Beetroot (shredded, 0.5–1 oz per gallon, near the end)". A backup is saved first.
//   node server/scripts/flatten_nested_brackets.mjs [--apply]
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const APPLY = process.argv.includes('--apply');
const db = new Database(path.join(DATA, 'app.db'));

function flatten(name) {
  let depth = 0;
  let out = '';
  for (const ch of String(name)) {
    if (ch === '(') { depth++; out += depth === 1 ? '(' : ', '; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); out += depth === 0 ? ')' : ''; continue; }
    out += ch;
  }
  if (depth > 0) out += ')'.repeat(depth);
  return out.replace(/,\s*,/g, ',').replace(/\s+,/g, ',').replace(/\(\s*,\s*/g, '(').replace(/,\s*\)/g, ')').replace(/\s{2,}/g, ' ').trim();
}
const nested = (n) => /\([^)]*\(/.test(String(n || ''));

const changes = [];
for (const r of db.prepare('SELECT id, name, ingredients FROM brews').all()) {
  let ings;
  try { ings = JSON.parse(r.ingredients || '[]'); } catch { continue; }
  if (!ings.some((g) => nested(g.name))) continue;
  const after = ings.map((g) => (nested(g.name) ? { ...g, name: flatten(g.name) } : g));
  changes.push({ id: r.id, recipe: r.name, before: ings, after });
  ings.forEach((g, i) => { if (g !== after[i] && g.name !== after[i].name) console.log(`"${g.name}"  ->  "${after[i].name}"`); });
}
console.log(`\n${changes.length} recipes and brews`);
if (!APPLY) { console.log('Dry run - nothing written.'); process.exit(0); }
const backup = path.join(DATA, `nested_brackets_backup_${Date.now()}.json`);
fs.writeFileSync(backup, JSON.stringify(changes.map(({ id, recipe, before }) => ({ id, recipe, ingredients: before })), null, 1));
const upd = db.prepare('UPDATE brews SET ingredients = ? WHERE id = ?');
db.transaction(() => { for (const c of changes) upd.run(JSON.stringify(c.after), c.id); })();
console.log(`Applied. Backup: ${backup}`);
