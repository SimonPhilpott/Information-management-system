import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import { google } from 'googleapis';
import db, { getSetting, setSetting } from '../db/database.js';
import { getAuthenticatedClient } from './driveService.js';

// Nightly backup of everything IMS keeps for its services: the SQLite database (a consistent copy taken
// while it's in use - memories, birthdays, reminders, lists, carbs, tasks, campaigns, decks, chronicles,
// settings...) plus the files that aren't in it (config, phrase recordings, campaign banners, chronicle
// pictures and narration, campaign setups and map places). Zipped, kept on the PC (last 10) and uploaded
// to "IMS Backups" in the owner's Google Drive (last 10). Things that can be rebuilt or fetched again are
// left out: the PDF library (it lives in Drive), the vector index, the joke dataset, card and rulebook caches.
// Runs once a night after 03:00 London time, or on demand from /ims/backups.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', 'data');
const LOCAL = path.join(DATA, 'backups');
const DRIVE_FOLDER = 'IMS Backups';
const KEEP_LOCAL = 10, KEEP_DRIVE = 10;

// What goes in, relative to data/ (files or folders; missing ones are skipped).
const FILES = [
  'database.sqlite', 'boardgames_config.json', 'boardgames_cache.json', 'bgg_collection.csv', 'morning_report_state.json', 'wifi_networks.json',
  'phrase_recordings', 'faces',
  'decks/campaign_banners', 'decks/chronicle_art', 'decks/chronicle_audio',
  'decks/ahlcg_campaign_setups.json', 'decks/arkham_places.json', 'decks/arkham_maps.json', 'decks/middle_earth_places.json',
  'decks/lotr_rulebooks.json', 'decks/ahlcg_rulebooks.json',
];

let running = null;
const STATUS_KEY = 'backup_status';
export function backupStatus() {
  let s = {};
  try { s = JSON.parse(getSetting(STATUS_KEY) || '{}'); } catch (_) { /* none yet */ }
  const local = fs.existsSync(LOCAL) ? fs.readdirSync(LOCAL).filter((f) => f.endsWith('.zip')).sort().reverse()
    .map((f) => ({ name: f, sizeMb: +(fs.statSync(path.join(LOCAL, f)).size / 1048576).toFixed(1) })) : [];
  return { ...s, running: Boolean(running), local, keepLocal: KEEP_LOCAL, keepDrive: KEEP_DRIVE, driveFolder: DRIVE_FOLDER };
}
const saveStatus = (patch) => setSetting(STATUS_KEY, JSON.stringify({ ...backupStatus(), ...patch, running: undefined, local: undefined }));

async function driveFolderId(drive) {
  const q = `name='${DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
  const found = (await drive.files.list({ q, fields: 'files(id)' })).data.files[0];
  if (found) return found.id;
  return (await drive.files.create({ requestBody: { name: DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' })).data.id;
}

export function runBackup({ reason = 'manual' } = {}) {
  if (running) return running;
  running = (async () => {
    const started = Date.now();
    const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/London' }).replace(' ', '_').replace(/:/g, '-').slice(0, 16);
    const name = `ims-backup-${stamp}.zip`;
    fs.mkdirSync(LOCAL, { recursive: true });
    const tmpDb = path.join(LOCAL, `app-${Date.now()}.db`);
    try {
      // a consistent copy of the live database
      await db.backup(tmpDb);
      const zip = new AdmZip();
      zip.addLocalFile(tmpDb, '', 'app.db');
      let files = 1;
      for (const rel of FILES) {
        const p = path.join(DATA, rel);
        if (!fs.existsSync(p)) continue;
        if (fs.statSync(p).isDirectory()) zip.addLocalFolder(p, rel); else zip.addLocalFile(p, path.dirname(rel) === '.' ? '' : path.dirname(rel));
        files++;
      }
      zip.addFile('README.txt', Buffer.from(`IMS backup ${stamp} (${reason}).\nTo restore: stop the server, put app.db and the other files back in pdf-knowledge-base/server/data/ (same folders), then start it again.\nNot included (rebuilt or fetched again): the PDF library (in Google Drive), the vector index, the joke dataset, card and rulebook caches.\nThe Wi-Fi passwords file is encrypted; its key (data/.wifi_key) is deliberately not in the backup.\n`));
      const out = path.join(LOCAL, name);
      zip.writeZip(out);
      const sizeMb = +(fs.statSync(out).size / 1048576).toFixed(1);
      // keep the last few on the PC
      const locals = fs.readdirSync(LOCAL).filter((f) => f.endsWith('.zip')).sort();
      for (const f of locals.slice(0, Math.max(0, locals.length - KEEP_LOCAL))) fs.unlinkSync(path.join(LOCAL, f));

      // and up to Google Drive
      let drive = { uploaded: false };
      try {
        const auth = getAuthenticatedClient();
        if (!auth) throw new Error('Google Drive is not connected');
        const d = google.drive({ version: 'v3', auth });
        const folder = await driveFolderId(d);
        await d.files.create({ requestBody: { name, parents: [folder] }, media: { mimeType: 'application/zip', body: fs.createReadStream(out) }, fields: 'id' });
        const all = (await d.files.list({ q: `'${folder}' in parents and trashed=false and name contains 'ims-backup-'`, fields: 'files(id,name)', orderBy: 'name desc', pageSize: 200 })).data.files;
        for (const f of all.slice(KEEP_DRIVE)) await d.files.delete({ fileId: f.id }).catch(() => {});
        drive = { uploaded: true, kept: Math.min(all.length, KEEP_DRIVE) };
      } catch (err) { drive = { uploaded: false, error: err.message }; }

      const result = { ok: true, name, sizeMb, files, drive, at: Date.now(), tookSec: Math.round((Date.now() - started) / 1000), reason };
      saveStatus({ last: result, lastOkAt: Date.now() });
      console.log(`[Backup] ${name} - ${sizeMb} MB${drive.uploaded ? ', uploaded to Drive' : `, NOT uploaded (${drive.error})`}`);
      return result;
    } catch (err) {
      const result = { ok: false, error: err.message, at: Date.now(), reason };
      saveStatus({ last: result });
      console.error('[Backup] Failed:', err.message);
      throw err;
    } finally {
      try { fs.unlinkSync(tmpDb); } catch (_) { /* gone */ }
      running = null;
    }
  })();
  return running;
}

// Once a night, after 03:00 London time.
export function startNightlyBackups() {
  const check = () => {
    const now = new Date();
    const day = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    const hour = Number(now.toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }));
    if (hour >= 3 && getSetting('backup_last_day') !== day) {
      setSetting('backup_last_day', day);
      runBackup({ reason: 'nightly' }).catch(() => { /* recorded in the status */ });
    }
  };
  setTimeout(check, 60 * 1000);
  setInterval(check, 10 * 60 * 1000);
}
