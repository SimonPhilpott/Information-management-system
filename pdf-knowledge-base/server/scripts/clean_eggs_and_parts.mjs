// clean_eggs_and_parts.mjs
// Cleans up prep actions and parts (e.g. "egg whites, beaten" -> "Eggs (whites, beaten)",
// "Pea pods" -> "Peas (pods)", "Chopped Steak" -> "Beef (chopped steak)") so that every
// ingredient is the whole item, and prep/parts are kept in the recipe line notes.
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normIngredient } from '../services/homebrewCanonical.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, '..', 'data');
const APPLY = process.argv.includes('--apply');

const db = new Database(path.join(DATA, 'app.db'));

const sanitizeNote = (s) => (s || '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();

export function cleanRecipeIngredient(item) {
  if (!item || !item.name) return item;
  let name = String(item.name).trim();

  // 1. Eggs
  if (/^egg\s+whites?\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^egg\s+whites?,?\s*/i, ''));
    const finalNote = ['whites', rest].filter(Boolean).join(', ');
    return { ...item, name: `Eggs (${finalNote})` };
  }

  // 2. Peas
  if (/^pea\s+pods?\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^pea\s+pods?,?\s*/i, ''));
    const finalNote = ['pods', rest].filter(Boolean).join(', ');
    return { ...item, name: `Peas (${finalNote})` };
  }

  // 3. Steak / Beef
  if (/^chopped\s+steak\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^chopped\s+steak,?\s*/i, ''));
    const finalNote = ['raw chopped steak', rest].filter(Boolean).join(', ');
    return { ...item, name: `Beef (${finalNote})` };
  }

  // 4. Roots
  if (/^dandelion\s+root\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^dandelion\s+root,?\s*/i, ''));
    return { ...item, name: `Dandelions (${['root', rest].filter(Boolean).join(', ')})` };
  }
  if (/^gentian\s+root\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^gentian\s+root,?\s*/i, ''));
    return { ...item, name: `Gentian (${['root', rest].filter(Boolean).join(', ')})` };
  }
  if (/^licorice\s+root\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^licorice\s+root,?\s*/i, ''));
    return { ...item, name: `Licorice (${['root', rest].filter(Boolean).join(', ')})` };
  }
  if (/^burdock\s+root\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^burdock\s+root,?\s*/i, ''));
    return { ...item, name: `Burdock (${['root', rest].filter(Boolean).join(', ')})` };
  }
  if (/^sarsaparilla\s+root\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^sarsaparilla\s+root,?\s*/i, ''));
    return { ...item, name: `Sarsaparilla (${['root', rest].filter(Boolean).join(', ')})` };
  }

  // 5. Barks
  if (/^alder\s+bark\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^alder\s+bark,?\s*/i, ''));
    return { ...item, name: `Alder (${['bark', rest].filter(Boolean).join(', ')})` };
  }
  if (/^willow\s+bark\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^willow\s+bark,?\s*/i, ''));
    return { ...item, name: `Willow (${['bark', rest].filter(Boolean).join(', ')})` };
  }

  // 6. Leaves
  if (/^oak\s+leaves\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^oak\s+leaves,?\s*/i, ''));
    return { ...item, name: `Oak (${['leaves', rest].filter(Boolean).join(', ')})` };
  }
  if (/^walnut\s+leaves\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^walnut\s+leaves,?\s*/i, ''));
    return { ...item, name: `Walnuts (${['leaves', rest].filter(Boolean).join(', ')})` };
  }
  if (/^hickory\s+leaves\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^hickory\s+leaves,?\s*/i, ''));
    return { ...item, name: `Hickory (${['leaves', rest].filter(Boolean).join(', ')})` };
  }
  if (/^hickory\s+bark\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^hickory\s+bark,?\s*/i, ''));
    return { ...item, name: `Hickory (${['bark', rest].filter(Boolean).join(', ')})` };
  }
  if (/^raspberry\s+leaf\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^raspberry\s+leaf,?\s*/i, ''));
    return { ...item, name: `Raspberries (${['leaves', rest].filter(Boolean).join(', ')})` };
  }
  if (/^wintergreen\s+leaves\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^wintergreen\s+leaves,?\s*/i, ''));
    return { ...item, name: `Wintergreen (${['leaves', rest].filter(Boolean).join(', ')})` };
  }

  // 7. Shells & Seeds
  if (/^rosehip\s+shells\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^rosehip\s+shells,?\s*/i, ''));
    return { ...item, name: `Rosehips (${['shells', rest].filter(Boolean).join(', ')})` };
  }
  if (/^wild\s+fennel\s+seeds\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^wild\s+fennel\s+seeds,?\s*/i, ''));
    return { ...item, name: `Fennel (${['wild seeds', rest].filter(Boolean).join(', ')})` };
  }

  // 8. White sugar -> Sugar (white)
  if (/^white\s+sugar\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^white\s+sugar,?\s*/i, ''));
    return { ...item, name: `Sugar (${['white', rest].filter(Boolean).join(', ')})` };
  }

  // 9. Fix double paren in White fir
  if (name.includes('White fir (branch, (')) {
    const cleanNote = sanitizeNote(name.replace(/^White fir\s*/i, ''));
    return { ...item, name: `White fir (${cleanNote})` };
  }

  return item;
}

export const MAIN_CANONICAL = {
  'egg whites': 'Eggs',
  'egg white': 'Eggs',
  'eggs': 'Eggs',
  'egg': 'Eggs',
  'pea pods': 'Peas',
  'pea pod': 'Peas',
  'chopped steak': 'Beef',
  'dandelion root': 'Dandelions',
  'gentian root': 'Gentian',
  'licorice root': 'Licorice',
  'burdock root': 'Burdock',
  'sarsaparilla root': 'Sarsaparilla',
  'alder bark': 'Alder',
  'willow bark': 'Willow',
  'oak leaves': 'Oak',
  'walnut leaves': 'Walnuts',
  'hickory leaves': 'Hickory',
  'hickory bark': 'Hickory',
  'raspberry leaf': 'Raspberries',
  'wintergreen leaves': 'Wintergreen',
  'rosehip shells': 'Rosehips',
  'wild fennel seeds': 'Fennel',
  'white sugar': 'Sugar',
};

// 1. Plan brews.ingredients updates
const brewChanges = [];
const brewRows = db.prepare('SELECT id, name, ingredients FROM brews').all();
for (const b of brewRows) {
  let ings;
  try { ings = JSON.parse(b.ingredients || '[]'); } catch { continue; }
  const after = ings.map(cleanRecipeIngredient);
  if (JSON.stringify(ings) !== JSON.stringify(after)) {
    brewChanges.push({ id: b.id, name: b.name, before: ings, after });
  }
}

// 2. Plan brew_main_ingredients.items updates
const mainChanges = [];
const mainRows = db.prepare('SELECT brew_id, items FROM brew_main_ingredients').all();
for (const r of mainRows) {
  let items;
  try { items = JSON.parse(r.items || '[]'); } catch { continue; }

  const seen = new Set();
  const newItems = [];
  for (const it of items) {
    if (!it || !it.name) continue;
    const norm = normIngredient(it.name);
    const cleanName = MAIN_CANONICAL[norm] || it.name;
    const cleanNorm = normIngredient(cleanName);
    if (!seen.has(cleanNorm)) {
      seen.add(cleanNorm);
      newItems.push({ ...it, name: cleanName });
    }
  }

  if (JSON.stringify(items) !== JSON.stringify(newItems)) {
    mainChanges.push({ brew_id: r.brew_id, before: items, after: newItems });
  }
}

// 3. Plan brew_ingredient_pictures updates
const currentPics = db.prepare('SELECT name_norm, name_display, key, updated_at FROM brew_ingredient_pictures').all();
const picMap = new Map(currentPics.map((p) => [p.name_norm, p]));
const picInserts = [];
const picDeletes = [];

for (const [normVariant, canonName] of Object.entries(MAIN_CANONICAL)) {
  const canonNorm = normIngredient(canonName);
  if (!picMap.has(canonNorm) && picMap.has(normVariant)) {
    const src = picMap.get(normVariant);
    const display = canonName[0].toUpperCase() + canonName.slice(1);
    picInserts.push({ name_norm: canonNorm, name_display: display, key: src.key, updated_at: Date.now() });
    picMap.set(canonNorm, { name_norm: canonNorm, name_display: display, key: src.key });
  }
  if (picMap.has(normVariant) && normVariant !== canonNorm) {
    picDeletes.push(picMap.get(normVariant));
  }
}

console.log('=== EGGS & INGREDIENT PARTS CLEANUP ===');
console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
console.log(`1. Recipe lines to update (brews.ingredients):      ${brewChanges.length} recipes`);
console.log(`2. Main ingredient cards to update (brew_main):     ${mainChanges.length} recipes`);
console.log(`3. Pictures inherited to whole ingredients:         ${picInserts.length} items`);
console.log(`4. Specific part pictures removed:                  ${picDeletes.length} items`);

if (!APPLY) {
  console.log('\nSample recipe changes:');
  for (const c of brewChanges.slice(0, 10)) {
    console.log(`Brew ${c.id} (${c.name}):`);
    for (let i = 0; i < c.before.length; i++) {
      if (c.before[i]?.name !== c.after[i]?.name) {
        console.log(`  - "${c.before[i]?.name}" -> "${c.after[i]?.name}"`);
      }
    }
  }
  console.log('\nSample main changes:');
  for (const c of mainChanges) {
    console.log(`Brew ${c.brew_id}: ${c.before.map((x) => x.name).join(', ')} -> ${c.after.map((x) => x.name).join(', ')}`);
  }
  console.log('\nRun with --apply to commit to database.');
  process.exit(0);
}

// APPLY MODE
const backupFile = path.join(DATA, `ingredient_parts_backup_${Date.now()}.json`);
fs.writeFileSync(backupFile, JSON.stringify({ brewChanges, mainChanges, picDeletes }, null, 2));
console.log(`\nBackup saved to: ${backupFile}`);

const updateBrewStmt = db.prepare('UPDATE brews SET ingredients = ? WHERE id = ?');
const updateMainStmt = db.prepare('UPDATE brew_main_ingredients SET items = ? WHERE brew_id = ?');
const insertPicStmt = db.prepare('INSERT OR REPLACE INTO brew_ingredient_pictures (name_norm, name_display, key, updated_at) VALUES (?, ?, ?, ?)');
const deletePicStmt = db.prepare('DELETE FROM brew_ingredient_pictures WHERE name_norm = ?');

db.transaction(() => {
  for (const c of brewChanges) {
    updateBrewStmt.run(JSON.stringify(c.after), c.id);
  }
  for (const c of mainChanges) {
    updateMainStmt.run(JSON.stringify(c.after), c.brew_id);
  }
  for (const ins of picInserts) {
    insertPicStmt.run(ins.name_norm, ins.name_display, ins.key, ins.updated_at);
  }
  for (const del of picDeletes) {
    deletePicStmt.run(del.name_norm);
  }
})();

console.log(`\n[APPLIED] Successfully cleaned up eggs and ingredient parts in database.`);
