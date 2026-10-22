// fix_campden_spelling.mjs
// Corrects 'Camden tablet(s)' -> 'Campden tablet(s)' in brews.ingredients and brews.method.
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(here, '..', 'data', 'app.db'));

const brews = db.prepare("SELECT id, name, ingredients, method FROM brews WHERE ingredients LIKE '%Camden%' OR method LIKE '%Camden%'").all();

console.log(`Found ${brews.length} brews with Camden spelling.`);

const updateStmt = db.prepare('UPDATE brews SET ingredients = ?, method = ? WHERE id = ?');

let updated = 0;
db.transaction(() => {
  for (const b of brews) {
    let ingStr = b.ingredients;
    let methodStr = b.method;
    let changed = false;

    if (ingStr && ingStr.includes('Camden')) {
      ingStr = ingStr.replace(/\bCamden\s+tablets?\b/g, (match) => match.replace(/^Camden/, 'Campden'));
      changed = true;
    }

    if (methodStr && methodStr.includes('Camden')) {
      methodStr = methodStr.replace(/\bCamden(\s+tablets?)\b/gi, (match) => match.replace(/^camden/i, 'Campden'));
      changed = true;
    }

    if (changed) {
      updateStmt.run(ingStr, methodStr, b.id);
      updated++;
    }
  }
})();

console.log(`Successfully updated ${updated} brews to 'Campden tablet(s)'.`);
