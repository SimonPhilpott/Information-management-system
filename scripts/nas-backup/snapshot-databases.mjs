// Consistent copies of IMS's live SQLite databases, safe to take while the server and Home Assistant are running
// (SQLite's online backup, not a file copy that could catch a half-written page).
// Usage: node snapshot-databases.mjs <destination folder>
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const ROOT = 'D:\\Information management system';
const require = createRequire(path.join(ROOT, 'pdf-knowledge-base', 'server', 'package.json'));
const Database = require('better-sqlite3');

const DBS = [
  ['app.db', path.join(ROOT, 'pdf-knowledge-base', 'server', 'data', 'app.db')],
  ['home-assistant_v2.db', path.join(ROOT, 'homeassistant', 'config', 'home-assistant_v2.db')],
];

const dest = process.argv[2];
if (!dest) { console.error('Give the destination folder.'); process.exit(2); }
fs.mkdirSync(dest, { recursive: true });
let failed = 0;
for (const [name, file] of DBS) {
  if (!fs.existsSync(file)) { console.log(`skip ${name} (not found)`); continue; }
  try {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    await db.backup(path.join(dest, name));
    db.close();
    const check = new Database(path.join(dest, name), { readonly: true });
    const ok = check.pragma('quick_check', { simple: true });
    check.close();
    console.log(`ok ${name} ${(fs.statSync(path.join(dest, name)).size / 1048576).toFixed(1)} MB, check: ${ok}`);
    if (ok !== 'ok') failed++;
  } catch (err) { console.error(`FAILED ${name}: ${err.message}`); failed++; }
}
process.exit(failed ? 1 : 0);
