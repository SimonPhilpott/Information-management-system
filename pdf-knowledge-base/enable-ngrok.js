import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'server', 'data', 'app.db');

console.log('[System] Target database:', dbPath);

if (!fs.existsSync(dbPath)) {
    console.error('[System] Database file not found at startup. Server will create it on boot.');
    // We can't enable it if the DB doesn't exist yet, but server usually creates it.
    // However, if we are running this from start.bat, it might be the first run.
}

try {
    const db = new Database(dbPath);
    
    // The correct table is 'settings' and the key is 'ngrok_enabled'
    db.prepare(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
    ).run('ngrok_enabled', 'true');

    console.log('[System] Ngrok has been auto-enabled in database (settings table).');
    db.close();
} catch (err) {
    console.error('[System] Failed to auto-enable Ngrok:', err.message);
}
