import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

// The scan engine lives outside this repo, in the pre-existing D:\Music
// scanner project (it already has musicbrainzngs installed system-wide and
// scanned_history.json build up from real runs) - this service just drives
// it and exposes its JSON state files over HTTP for the /ims/musicscan page.
const SCANNER_DIR = 'D:\\Music scanner';
const PYTHON_EXE = 'C:\\Python312\\python.exe';
const SCRIPT_PATH = path.join(SCANNER_DIR, 'ims_scan_service.py');
const CONFIG_PATH = path.join(SCANNER_DIR, 'ims_scan_config.json');
const STATUS_PATH = path.join(SCANNER_DIR, 'ims_scan_status.json');
const RESULTS_PATH = path.join(SCANNER_DIR, 'ims_scan_results.json');
const LOG_PATH = path.join(SCANNER_DIR, 'ims_scan_log.txt');

const DEFAULT_CONFIG = {
  muzak_path: '\\\\Sideburnt\\NorthField\\MUZAK',
  excluded_artists: ['various artists', 'various', 'unknown', 'unknown artist', 'soundtrack', 'va', 'compilations'],
  release_types: ['Album', 'EP'],
  chunk_size: 25,
  rate_limit_per_sec: 1.0,
  schedule_time: '01:00',
  schedule_enabled: true
};

let scanProcess = null;
let lastTriggeredLondonDate = null; // 'YYYY-MM-DD', guards against firing twice in one day

function readJson(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) { /* fall through to fallback */ }
  return fallback;
}

export function getConfig() {
  return { ...DEFAULT_CONFIG, ...readJson(CONFIG_PATH, {}) };
}

export function saveConfig(partialConfig) {
  const current = getConfig();
  const merged = { ...current, ...partialConfig };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

export function getStatus() {
  return readJson(STATUS_PATH, { state: 'idle', phase: null, currentIndex: 0, totalArtists: 0, currentArtist: null });
}

export function getResults() {
  return readJson(RESULTS_PATH, { lastScanCompleted: null, artistsScanned: 0, artistsWithMissingReleases: 0, results: [] });
}

// Ground truth is the status file's own state, not just this process's
// in-memory child-process handle: this backend restarts on every file save
// (node --watch), which would orphan a still-running python subprocess and
// leave a stale, wrong "not running" in this process's own bookkeeping while
// the scan (and its progress file) keep going regardless.
export function isScanRunning() {
  if (scanProcess !== null) return true;
  return getStatus().state === 'running';
}

export function runScanNow() {
  if (isScanRunning()) {
    return { started: false, reason: 'A scan is already running.' };
  }
  if (!fs.existsSync(SCRIPT_PATH)) {
    return { started: false, reason: `Scan engine not found at ${SCRIPT_PATH}.` };
  }

  fs.appendFileSync(LOG_PATH, `\n\n=== Scan started ${new Date().toISOString()} ===\n`);
  // stdio is opened as raw file descriptors (not piped through this Node
  // process) and the child is spawned detached + unref'd, so a scan that can
  // legitimately run for 20-30+ minutes survives this backend restarting
  // (node --watch reloads on every file save in dev) instead of dying with
  // it - a piped stdout/stderr would otherwise tie the child's lifetime, and
  // a non-detached child is killed outright when Node's process group exits.
  const logFd = fs.openSync(LOG_PATH, 'a');

  scanProcess = spawn(PYTHON_EXE, [SCRIPT_PATH], {
    cwd: SCANNER_DIR,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    detached: true,
    stdio: ['ignore', logFd, logFd]
  });
  scanProcess.unref();
  fs.closeSync(logFd);
  scanProcess.on('exit', (code) => {
    fs.appendFileSync(LOG_PATH, `=== Scan process exited with code ${code} ===\n`);
    scanProcess = null;
  });
  scanProcess.on('error', (err) => {
    fs.appendFileSync(LOG_PATH, `=== Scan process failed to start: ${err.message} ===\n`);
    scanProcess = null;
  });

  return { started: true };
}

const londonPartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  hourCycle: 'h23'
});

function londonNowParts() {
  const parts = Object.fromEntries(londonPartsFormatter.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { dateStr: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${parts.hour}:${parts.minute}` };
}

// Has a scan already been started today (London date), per the status file?
// Checked in addition to the in-memory lastTriggeredLondonDate flag, since
// that flag alone doesn't survive a process restart - this backend runs
// under `node --watch` in dev and reloads on every file save, and without
// this file-backed check a restart occurring any time after schedule_time
// would see a fresh, unset in-memory flag and immediately re-fire a full
// scan, even though one had already run (or was running) earlier that day.
function scanAlreadyStartedToday(londonDateStr) {
  const s = getStatus();
  if (!s.startedAt) return false;
  const startedLondonDate = londonPartsFormatter.formatToParts(new Date(s.startedAt))
    .reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return `${startedLondonDate.year}-${startedLondonDate.month}-${startedLondonDate.day}` === londonDateStr;
}

// Called every minute from index.js, mirroring how reminders/alarms are
// polled - fires once when the London wall-clock time first reaches (or
// passes) the configured schedule_time on a given day, then won't fire again
// until the date rolls over.
export function checkAndTriggerNightlyScan() {
  const cfg = getConfig();
  if (!cfg.schedule_enabled) return;

  const { dateStr, hhmm } = londonNowParts();
  if (lastTriggeredLondonDate === dateStr) return;
  if (hhmm < cfg.schedule_time) return;
  if (scanAlreadyStartedToday(dateStr)) {
    lastTriggeredLondonDate = dateStr;
    return;
  }

  lastTriggeredLondonDate = dateStr;
  console.log(`[MusicScan] Nightly scan triggered at ${hhmm} London time (scheduled for ${cfg.schedule_time}).`);
  const result = runScanNow();
  if (!result.started) {
    console.warn(`[MusicScan] Nightly scan did not start: ${result.reason}`);
  }
}

// Self-correcting UTC guess for a London wall-clock time, same technique
// remindersService uses: construct as if the wanted numbers were UTC, see
// how that instant actually reads in London, adjust by the difference. This
// keeps the BST/GMT changeover correct without relying on the server
// process's own OS timezone (which happens to be Europe/London here, but
// explicit is what keeps that from silently going wrong for half the year).
function londonWallTimeToUtcMs(year, month, day, hour, minute) {
  const guessMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const asLondonParts = Object.fromEntries(
    londonPartsFormatter.formatToParts(new Date(guessMs)).map((p) => [p.type, p.value])
  );
  const gotMs = Date.UTC(
    Number(asLondonParts.year), Number(asLondonParts.month) - 1, Number(asLondonParts.day),
    Number(asLondonParts.hour), Number(asLondonParts.minute), 0
  );
  return guessMs + (guessMs - gotMs);
}

export function getNextScheduledRun() {
  const cfg = getConfig();
  if (!cfg.schedule_enabled) return null;
  const { dateStr, hhmm } = londonNowParts();
  const [h, m] = cfg.schedule_time.split(':').map(Number);
  let [y, mo, d] = dateStr.split('-').map(Number);
  if (hhmm >= cfg.schedule_time) {
    const next = new Date(Date.UTC(y, mo - 1, d + 1));
    y = next.getUTCFullYear(); mo = next.getUTCMonth() + 1; d = next.getUTCDate();
  }
  return new Date(londonWallTimeToUtcMs(y, mo, d, h, m)).toISOString();
}
