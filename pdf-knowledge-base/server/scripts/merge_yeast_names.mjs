// One-off (22 Oct 2026, Simon): "yeast", "baker's yeast" and "brewer's yeast" are one ingredient, Brewers yeast.
// Each line keeps its notes; a baker's yeast line keeps "baker's" as a note so nothing is lost. Simon's picture
// for "yeast" moves to Brewers yeast. A backup is saved first.   node server/scripts/merge_yeast_names.mjs [--apply]
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const APPLY = process.argv.includes('--apply');
const db = new Database(path.join(DATA, 'app.db'));
const HEAD = /^\s*(yeast|bakers?'?s?\s+yeast|brewers?'?s?\s+yeast)\b(.*)$/i;

function rename(name) {
  const m = String(name || '').match(HEAD);
  if (!m) return null;
  const rest = m[2]; // what follows: " (1 oz)", ", spread on toast", ""
  if (/^\s*[a-z]/i.test(rest)) return null; // "yeast nutrient", "yeast extract" - another ingredient
  const bakers = /^bakers?/i.test(m[1]);
  if (!bakers) return `Brewers yeast${rest}`;
  // "baker's" goes into the first bracket, or a new one
  return /^\s*\(/.test(rest) ? `Brewers yeast${rest.replace(/^\s*\(/, " (baker's, ")}` : `Brewers yeast (baker's)${rest}`;
}

const changes = [];
const shown = new Map();
for (const r of db.prepare('SELECT id, name, ingredients FROM brews').all()) {
  let ings;
  try { ings = JSON.parse(r.ingredients || '[]'); } catch { continue; }
  let any = false;
  const after = ings.map((g) => {
    const n = rename(g.name);
    if (!n || n === g.name) return g;
    any = true;
    shown.set(`${g.name}  ->  ${n}`, (shown.get(`${g.name}  ->  ${n}`) || 0) + 1);
    return { ...g, name: n };
  });
  if (any) changes.push({ id: r.id, recipe: r.name, before: ings, after });
}
for (const [s, c] of shown) console.log(`${s}   x${c}`);
console.log(`\n${[...shown.values()].reduce((a, b) => a + b, 0)} lines in ${changes.length} recipes and brews`);
if (!APPLY) { console.log('Dry run - nothing written.'); process.exit(0); }

const pics = db.prepare("SELECT name_norm, name_display, key, updated_at FROM brew_ingredient_pictures WHERE name_norm IN ('yeast', 'baker''s yeast', 'bakers yeast', 'brewer''s yeast', 'brewers yeast')").all();
const backup = path.join(DATA, `yeast_names_backup_${Date.now()}.json`);
fs.writeFileSync(backup, JSON.stringify({ brews: changes.map(({ id, recipe, before }) => ({ id, recipe, ingredients: before })), pictures: pics }, null, 1));
const upd = db.prepare('UPDATE brews SET ingredients = ? WHERE id = ?');
const keep = pics.find((p) => p.name_norm === 'brewers yeast') || pics.find((p) => p.name_norm === 'yeast') || pics[0];
db.transaction(() => {
  for (const c of changes) upd.run(JSON.stringify(c.after), c.id);
  if (keep) {
    db.prepare("DELETE FROM brew_ingredient_pictures WHERE name_norm IN ('yeast', 'baker''s yeast', 'bakers yeast', 'brewer''s yeast')").run();
    db.prepare('INSERT INTO brew_ingredient_pictures (name_norm, name_display, key, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(name_norm) DO UPDATE SET key = excluded.key, name_display = excluded.name_display, updated_at = excluded.updated_at')
      .run('brewers yeast', 'Brewers yeast', keep.key, Date.now());
  }
})();
console.log(`Applied${keep ? `, with the picture from "${keep.name_display}"` : ''}. Backup: ${backup}`);
