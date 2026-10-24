// One-off (24 Oct 2026, Simon): no "-" characters in recipe titles or descriptions. A hyphenated word becomes two
// ("Barley-wine-style braggot" -> "Barley wine style braggot", "full-bodied" -> "full bodied"), a dash used as
// punctuation becomes a comma, and a number range becomes "5 to 7". Each recipe's family and version are worked out
// again from its new title. A backup is saved first.   node server/scripts/remove_dashes.mjs [--apply]
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { splitName, variantLabel } from '../services/homebrewTags.js';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const APPLY = process.argv.includes('--apply');
const db = new Database(path.join(DATA, 'app.db'));

export function noDashes(t) {
  return String(t)
    .replace(/(\d)\s*[-–—]\s*(\d)/g, '$1 to $2') // 5-7, 1.010–1.020
    .replace(/\s+[-–—]+\s+/g, ', ') // a dash as punctuation
    .replace(/([A-Za-zÀ-ÿ'’])[-–—]+(?=[A-Za-zÀ-ÿ0-9])/g, '$1 ') // hyphenated words
    .replace(/[-–—]+/g, ' ') // anything left
    .replace(/ {2,}/g, ' ').replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
}

// in a title, ingredients joined by hyphens are a list: "Blackberry-Peach wine" -> "Blackberry and peach wine",
// "Cherry-Chocolate-Almond wine" -> "Cherry, chocolate and almond wine"
function titleNoDashes(t) {
  let s = String(t).replace(/([A-Za-z'])-(?=[A-Z])/g, (m, a) => `${a} and `).replace(/ and ([A-Z])/g, (m, c) => ` and ${c.toLowerCase()}`);
  // "A and b and c" -> "A, b and c"
  for (let i = 0; i < 3; i++) s = s.replace(/(\w[\w ']*?) and ([\w']+(?: [\w']+)?) and /, '$1, $2 and ');
  return noDashes(s);
}
const rows = db.prepare('SELECT id, is_recipe, name, category, summary, family, variant FROM brews WHERE is_recipe = 1').all();
const changes = rows.map((r) => {
  const name = titleNoDashes(r.name);
  const summary = r.summary ? noDashes(r.summary) : r.summary;
  return { r, name, summary, family: splitName(name, r.category).family, variant: variantLabel(name, r.category, null) || null };
}).filter((c) => c.name !== c.r.name || c.summary !== c.r.summary || c.family !== c.r.family || (c.variant || null) !== (c.r.variant || null));

const titled = changes.filter((c) => c.name !== c.r.name);
console.log(`${titled.length} titles and ${changes.filter((c) => c.summary !== c.r.summary).length} descriptions to change`);
for (const c of titled.slice(0, 15)) console.log(`  ${c.r.name}  ->  ${c.name}`);
const ex = changes.find((c) => c.summary !== c.r.summary);
if (ex) console.log(`  e.g. "${(ex.r.summary.match(/.{0,40}[-–—].{0,30}/) || [''])[0]}" -> "${(ex.summary.match(/.{0,60}/) || [''])[0]}..."`);
if (!APPLY) { console.log('Dry run - nothing changed.'); process.exit(0); }

const backup = path.join(DATA, `dashes_backup_${Date.now()}.json`);
fs.writeFileSync(backup, JSON.stringify(changes.map(({ r }) => r), null, 1));
const upd = db.prepare('UPDATE brews SET name = ?, summary = ?, family = ?, variant = ?, updated_at = ? WHERE id = ?');
db.transaction(() => { for (const c of changes) upd.run(c.name, c.summary, c.family, c.variant, Date.now(), c.r.id); })();
const left = db.prepare("SELECT COUNT(*) n FROM brews WHERE is_recipe = 1 AND (name GLOB '*[-–—]*' OR summary GLOB '*[-–—]*')").get().n;
console.log(`Applied. ${left} titles or descriptions still with a dash. Backup: ${backup}`);
