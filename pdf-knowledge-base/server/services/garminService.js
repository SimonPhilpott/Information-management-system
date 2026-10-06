// Garmin Connect daily metrics (phase 1 of docs/plans/2026-10-06-garmin-integration-plan.md).
// garmin/garmin_sync.py does the Garmin side and prints JSON; this service runs it and keeps one row per
// day in garmin_daily. Nothing here is scheduled or shown yet - it stays inert until connectGarmin() has
// saved a login. If Garmin's private endpoints change, syncing fails quietly and everything else carries on.
//
// Still to do (see the plan): scheduler job, settings card, day-report section, readiness line, Run Planner
// fuelling, Ims tool.
import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { getSetting, setSetting } from '../db/database.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, '..', 'garmin', 'garmin_sync.py');
const TOKEN_DIR = path.join(here, '..', '..', 'data', 'garmin');
const PYTHON = process.env.GARMIN_PYTHON || 'python';

db.exec(`CREATE TABLE IF NOT EXISTS garmin_daily (
  date TEXT PRIMARY KEY, synced_at INTEGER NOT NULL, metrics TEXT NOT NULL, errors TEXT
)`);

function run(args, env = {}) {
  return new Promise((resolve) => {
    execFile(PYTHON, [SCRIPT, ...args], { env: { ...process.env, GARMIN_TOKEN_DIR: TOKEN_DIR, PYTHONIOENCODING: 'utf-8', ...env }, timeout: 120000, windowsHide: true },
      (err, stdout) => {
        try { resolve(JSON.parse(String(stdout).trim().split('\n').pop())); }
        catch { resolve({ ok: false, error: err ? err.message.slice(0, 300) : 'no output from garmin_sync.py' }); }
      });
  });
}

// First-time login. The password goes to the script once and is never stored - Garmin's tokens are.
export async function connectGarmin(email, password) {
  const r = await run(['login'], { GARMIN_EMAIL: email, GARMIN_PASSWORD: password });
  setSetting('garmin_connected', r.ok ? 'true' : 'false');
  setSetting('garmin_last_error', r.ok ? '' : r.error || 'login failed');
  return r;
}

export const isGarminConnected = () => getSetting('garmin_connected') === 'true';

// One day's metrics, fetched and stored. Partial results are kept (errors lists what failed).
export async function syncGarminDay(date) {
  if (!isGarminConnected()) return { ok: false, error: 'Garmin is not connected' };
  const r = await run(['day', date]);
  if (!r.ok) { setSetting('garmin_last_error', r.error || 'sync failed'); return r; }
  db.prepare(`INSERT INTO garmin_daily (date, synced_at, metrics, errors) VALUES (?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET synced_at = excluded.synced_at, metrics = excluded.metrics, errors = excluded.errors`)
    .run(date, Date.now(), JSON.stringify(r.metrics), JSON.stringify(r.errors || {}));
  setSetting('garmin_last_sync', String(Date.now()));
  setSetting('garmin_last_error', Object.keys(r.errors || {}).length ? `partial: ${Object.keys(r.errors).join(', ')}` : '');
  return r;
}

// Today and yesterday (sleep is filed under the morning it ended; yesterday catches late uploads).
export async function syncGarminRecent() {
  const day = (offset) => new Date(Date.now() - offset * 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const results = [];
  for (const d of [day(1), day(0)]) results.push({ date: d, ...(await syncGarminDay(d)) });
  return results;
}

export function getGarminDay(date) {
  const r = db.prepare('SELECT * FROM garmin_daily WHERE date = ?').get(date);
  return r ? { date: r.date, syncedAt: r.synced_at, ...JSON.parse(r.metrics), errors: JSON.parse(r.errors || '{}') } : null;
}

export const garminStatus = () => ({
  connected: isGarminConnected(),
  lastSync: Number(getSetting('garmin_last_sync')) || null,
  lastError: getSetting('garmin_last_error') || null,
  days: db.prepare('SELECT COUNT(*) AS n FROM garmin_daily').get().n,
});
