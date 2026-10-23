// One-off (22 Oct 2026, Simon): two main ingredients were one combined name - "Oak or Walnut leaves" (Tree leaf wine)
// and "Spruce & Pine" (Vermont forest beer). Each becomes two main ingredients, named as the recipes' own lines name
// them (Oak + Walnut leaves, Spruce + Pine). A backup is saved first.   node server/scripts/split_combined_mains.mjs [--apply]
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const APPLY = process.argv.includes('--apply');
const db = new Database(path.join(DATA, 'app.db'));

const SPLIT = {
  'oak or walnut leaves': [{ name: 'Oak', picture: 'a pile of fresh young oak leaves' }, { name: 'Walnut leaves', picture: 'a pile of fresh young walnut leaves' }],
  'spruce & pine': [{ name: 'Spruce', picture: 'spruce needles and small branches' }, { name: 'Pine', picture: 'pine needles and small branches' }],
};

const changes = [];
for (const r of db.prepare('SELECT brew_id, items FROM brew_main_ingredients').all()) {
  let items;
  try { items = JSON.parse(r.items || '[]'); } catch { continue; }
  if (!items.some((i) => SPLIT[String(i.name || '').toLowerCase()])) continue;
  const after = items.flatMap((i) => SPLIT[String(i.name || '').toLowerCase()]?.map((s) => ({ ...i, ...s })) || [i]);
  changes.push({ brew_id: r.brew_id, before: r.items, after: JSON.stringify(after) });
  console.log(`#${r.brew_id}: ${items.map((i) => i.name).join(', ')}  ->  ${after.map((i) => i.name).join(', ')}`);
}
if (!APPLY) { console.log('Dry run - nothing written.'); process.exit(0); }
const backup = path.join(DATA, `split_mains_backup_${Date.now()}.json`);
fs.writeFileSync(backup, JSON.stringify(changes.map(({ brew_id, before }) => ({ brew_id, items: before })), null, 1));
db.transaction(() => { for (const c of changes) db.prepare('UPDATE brew_main_ingredients SET items = ? WHERE brew_id = ?').run(c.after, c.brew_id); })();
console.log(`Applied. Backup: ${backup}`);
