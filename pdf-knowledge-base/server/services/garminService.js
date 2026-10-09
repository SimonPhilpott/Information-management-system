// Garmin Connect daily metrics (phase 1 & 2 of docs/plans/2026-10-06-garmin-integration-plan.md).
// garmin/garmin_sync.py does the Garmin side and prints JSON; this service runs it and keeps one row per
// day in garmin_daily. It runs through the scheduler and is available on-demand for Run Planner and Day Report.
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { getSetting, setSetting } from '../db/database.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, '..', 'garmin', 'garmin_sync.py');
const TOKEN_DIR = path.join(here, '..', '..', 'data', 'garmin');
const DEFAULT_WIN_PYTHON = 'C:\\Python312\\python.exe';
const PYTHON = process.env.GARMIN_PYTHON || (process.platform === 'win32' && fs.existsSync(DEFAULT_WIN_PYTHON) ? DEFAULT_WIN_PYTHON : 'python');

db.exec(`CREATE TABLE IF NOT EXISTS garmin_daily (
  date TEXT PRIMARY KEY, synced_at INTEGER NOT NULL, metrics TEXT NOT NULL, errors TEXT
)`);

function run(args, env = {}) {
  return new Promise((resolve) => {
    execFile(
      PYTHON,
      [SCRIPT, ...args],
      {
        env: {
          ...process.env,
          GARMIN_TOKEN_DIR: TOKEN_DIR,
          PYTHONIOENCODING: 'utf-8',
          ...env
        },
        timeout: 120000,
        windowsHide: true
      },
      (err, stdout) => {
        try {
          const lines = String(stdout || '').trim().split('\n');
          const lastLine = lines.pop();
          resolve(JSON.parse(lastLine));
        } catch {
          resolve({ ok: false, error: err ? err.message.slice(0, 300) : 'no output from garmin_sync.py' });
        }
      }
    );
  });
}

// First-time login. Password and optional MFA code go to the script and tokens are stored in TOKEN_DIR.
export async function connectGarmin(email, password, mfaCode = '') {
  const env = { GARMIN_EMAIL: email, GARMIN_PASSWORD: password };
  if (mfaCode) env.GARMIN_MFA_CODE = String(mfaCode).trim();
  const r = await run(['login'], env);
  setSetting('garmin_connected', r.ok ? 'true' : 'false');
  setSetting('garmin_last_error', r.ok ? '' : r.error || 'login failed');
  if (r.ok) {
    // Proactively pull today and yesterday upon successful connection
    syncGarminRecent().catch((err) => console.warn('[Garmin] Initial sync error:', err.message));
  }
  return r;
}

export const isGarminConnected = () => getSetting('garmin_connected') === 'true';

export function disconnectGarmin() {
  setSetting('garmin_connected', 'false');
  setSetting('garmin_last_error', '');
  try {
    if (fs.existsSync(TOKEN_DIR)) {
      fs.rmSync(TOKEN_DIR, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn('[Garmin] Failed to purge token dir:', err.message);
  }
  return { ok: true, connected: false };
}

// One day's metrics, fetched and stored. Partial results are kept (errors lists what failed).
export async function syncGarminDay(date) {
  if (!isGarminConnected()) return { ok: false, error: 'Garmin is not connected' };
  const r = await run(['day', date]);
  if (!r.ok) {
    setSetting('garmin_last_error', r.error || 'sync failed');
    return r;
  }
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
  for (const d of [day(1), day(0)]) {
    results.push({ date: d, ...(await syncGarminDay(d)) });
  }
  return results;
}

export function getGarminDay(date) {
  const r = db.prepare('SELECT * FROM garmin_daily WHERE date = ?').get(date);
  return r ? { date: r.date, syncedAt: r.synced_at, ...JSON.parse(r.metrics), errors: JSON.parse(r.errors || '{}') } : null;
}

export function getLatestGarminDay() {
  const r = db.prepare('SELECT * FROM garmin_daily ORDER BY date DESC LIMIT 1').get();
  return r ? { date: r.date, syncedAt: r.synced_at, ...JSON.parse(r.metrics), errors: JSON.parse(r.errors || '{}') } : null;
}

export function getGarminZones() {
  const latest = getLatestGarminDay();
  return Array.isArray(latest?.hrZones) ? latest.hrZones : [];
}

export function listGarminDays(limit = 14) {
  const rows = db.prepare('SELECT * FROM garmin_daily ORDER BY date DESC LIMIT ?').all(limit);
  return rows.map((r) => ({
    date: r.date,
    syncedAt: r.synced_at,
    ...JSON.parse(r.metrics),
    errors: JSON.parse(r.errors || '{}')
  }));
}

export const garminStatus = () => ({
  connected: isGarminConnected(),
  lastSync: Number(getSetting('garmin_last_sync')) || null,
  lastError: getSetting('garmin_last_error') || null,
  days: db.prepare('SELECT COUNT(*) AS n FROM garmin_daily').get().n
});

export function garminReadinessForPrompt(date = null) {
  const d = date ? getGarminDay(date) : getLatestGarminDay();
  if (!d) return null;

  const parts = [];
  if (d.sleepScore != null) {
    const sleepH = d.sleepS ? (d.sleepS / 3600).toFixed(1) : null;
    parts.push(`Sleep score ${d.sleepScore}/100${sleepH ? ` (${sleepH}h)` : ''}`);
  }
  if (d.bodyBatteryWake != null) {
    parts.push(`Body Battery ${d.bodyBatteryWake} at wake`);
  }
  if (d.hrvNight != null) {
    parts.push(`Overnight HRV ${d.hrvNight} ms${d.hrvStatus ? ` (${d.hrvStatus})` : ''}`);
  }
  if (d.restingHr != null) {
    parts.push(`Resting HR ${d.restingHr} bpm${d.restingHr7d ? ` (7d avg ${d.restingHr7d})` : ''}`);
  }
  if (d.readinessScore != null) {
    parts.push(`Training Readiness ${d.readinessScore}/100${d.readinessLevel ? ` (${d.readinessLevel})` : ''}`);
  }
  if (d.recoveryTimeMin != null && d.recoveryTimeMin > 0) {
    const hours = Math.round(d.recoveryTimeMin / 60);
    parts.push(`Recovery time ${hours}h`);
  }
  if (d.vo2max != null) {
    parts.push(`VO2 Max ${d.vo2max}`);
  }

  return parts.length ? parts.join('; ') : null;
}
