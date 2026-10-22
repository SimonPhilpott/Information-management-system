// One-off (22 Oct 2026, Simon): "Nutrient tablet" is yeast nutrient in tablet form, so recipe lines named
// "Nutrient tablet(s)" become "Yeast nutrient (tablet)" - the amount is unchanged - and link to Yeast nutrient's
// picture. A backup is saved first.   node server/scripts/merge_nutrient_tablets.mjs [--apply]
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const APPLY = process.argv.includes('--apply');
const db = new Database(path.join(DATA, 'app.db'));
const IS_TABLET = /^\s*(?:yeast\s+)?nutrient\s+tablets?\b\s*(.*)$/i;

const changes = [];
for (const r of db.prepare('SELECT id, name, ingredients FROM brews').all()) {
  let ings;
  try { ings = JSON.parse(r.ingredients || '[]'); } catch { continue; }
  let any = false;
  const after = ings.map((g) => {
    const m = String(g.name || '').match(IS_TABLET);
    if (!m) return g;
    any = true;
    const rest = m[1].trim().replace(/^\((.*)\)$/, '$1').replace(/^[-,]\s*/, '');
    return { ...g, name: `Yeast nutrient (tablet${rest ? `, ${rest}` : ''})` };
  });
  if (any) changes.push({ id: r.id, recipe: r.name, before: ings, after });
}
console.log(`${changes.length} recipes and brews have a nutrient tablet line`);
if (!APPLY) { console.log('Dry run - nothing written.'); process.exit(0); }
const backup = path.join(DATA, `nutrient_tablets_backup_${Date.now()}.json`);
fs.writeFileSync(backup, JSON.stringify(changes.map(({ id, recipe, before }) => ({ id, recipe, ingredients: before })), null, 1));
const upd = db.prepare('UPDATE brews SET ingredients = ? WHERE id = ?');
db.transaction(() => { for (const c of changes) upd.run(JSON.stringify(c.after), c.id); })();
console.log(`Applied. Backup: ${backup}`);
