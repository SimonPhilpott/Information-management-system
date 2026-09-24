import fs from 'fs';
import path from 'path';
import { spawn, execFile } from 'child_process';

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
const ARTISTS_PATH = path.join(SCANNER_DIR, 'ims_scan_artists.json');
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

// Results file shape (written by ims_scan_service.py):
//   { lastScanCompleted, artistsScanned, artistsWithMissingReleases,
//     artists: { [folderName]: { genre, mbName, mbId, releases: [{title, type,
//       date, precision, owned}], unlisted: [folderName], error } } }
// It's ~MBs, so it's cached by mtime rather than re-parsed on every request.
let resultsCache = { mtimeMs: 0, data: null };
export function getResults() {
  try {
    const stat = fs.statSync(RESULTS_PATH);
    if (resultsCache.data && stat.mtimeMs === resultsCache.mtimeMs) return resultsCache.data;
    const data = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
    if (!data.artists || typeof data.artists !== 'object') data.artists = {};
    resultsCache = { mtimeMs: stat.mtimeMs, data };
    return data;
  } catch (_) {
    return { lastScanCompleted: null, artistsScanned: 0, artistsWithMissingReleases: 0, artists: {} };
  }
}

export function getResultsMeta() {
  const r = getResults();
  return {
    lastScanCompleted: r.lastScanCompleted || null,
    artistsScanned: r.artistsScanned || 0,
    artistsWithMissingReleases: r.artistsWithMissingReleases || 0
  };
}

// --- per-artist name overrides / pseudonyms (read by the python scanner) ---
export function getArtistOverrides() {
  return readJson(ARTISTS_PATH, {});
}

export function saveArtistSettings(name, { searchName, aliases }) {
  const all = getArtistOverrides();
  const cleanAliases = (Array.isArray(aliases) ? aliases : []).map((a) => String(a).trim()).filter(Boolean);
  const cleanSearch = String(searchName || '').trim();
  if (!cleanSearch && cleanAliases.length === 0) delete all[name];
  else all[name] = { searchName: cleanSearch, aliases: cleanAliases };
  fs.writeFileSync(ARTISTS_PATH, JSON.stringify(all, null, 2), 'utf8');
  return all[name] || { searchName: '', aliases: [] };
}

function summarise(name, entry, overrides) {
  const ov = overrides[name] || {};
  return {
    name,
    genre: entry.genre,
    mbName: entry.mbName,
    owned: entry.releases.filter((r) => r.owned).length,
    notOwned: entry.releases.filter((r) => !r.owned).length,
    unlisted: entry.unlisted.length,
    searchName: ov.searchName || '',
    aliases: ov.aliases || []
  };
}

export function getArtistList() {
  const overrides = getArtistOverrides();
  return Object.entries(getResults().artists)
    .map(([name, entry]) => summarise(name, entry, overrides))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function getArtistDetail(name) {
  const entry = getResults().artists[name];
  if (!entry) return null;
  return { ...summarise(name, entry, getArtistOverrides()), releases: entry.releases, unlistedAlbums: entry.unlisted, error: entry.error || null };
}

const londonDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'
});
function todayLondonDateStr() {
  const parts = Object.fromEntries(londonDateFormatter.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// How far back each view reaches. "day" is today only - it's the same set
// the footer vinyl-icon count comes from.
const WINDOW_DAYS = { day: 0, week: 7, month: 30, '6months': 182, year: 365 };

// Day-precision dates are compared exactly. Month-precision dates (MusicBrainz
// often only knows the month) only count for the 6-month/year views, where a
// month overlapping the window is a fair "yes"; year-only dates are never
// placed in a window, since which day they fall on is unknown.
function inWindow(rel, cutoff, today, windowKey) {
  if (rel.precision === 'day') return rel.date >= cutoff && rel.date <= today;
  if (rel.precision === 'month' && (windowKey === '6months' || windowKey === 'year')) {
    const monthStart = `${rel.date}-01`;
    const [y, m] = rel.date.split('-').map(Number);
    const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return monthEnd >= cutoff && monthStart <= today;
  }
  return false;
}

export function getWindowResults(windowKey) {
  const days = WINDOW_DAYS[windowKey];
  if (days === undefined) throw new Error(`Unknown window "${windowKey}"`);
  const today = todayLondonDateStr();
  const cutoff = addDays(today, -days);
  const overrides = getArtistOverrides();
  const out = [];
  for (const [name, entry] of Object.entries(getResults().artists)) {
    const releases = entry.releases.map((r) => ({ ...r, isNew: inWindow(r, cutoff, today, windowKey) }));
    const newest = releases.filter((r) => r.isNew).map((r) => r.date).sort().pop();
    if (!newest) continue;
    out.push({ ...summarise(name, entry, overrides), releases, unlistedAlbums: entry.unlisted, newestDate: newest });
  }
  out.sort((a, b) => (b.newestDate.localeCompare(a.newestDate)) || a.name.localeCompare(b.name));
  return { window: windowKey, cutoff, today, artists: out };
}

// Every release dated exactly today for an artist in the library, owned or
// not - the "released today" list on the Day view, and the count shown next
// to the vinyl icon on the device and in the morning report.
export function getTodayReleases() {
  const today = todayLondonDateStr();
  const list = [];
  for (const [name, entry] of Object.entries(getResults().artists)) {
    for (const r of entry.releases) {
      if (r.precision === 'day' && r.date === today) {
        list.push({ artist: name, title: r.title, type: r.type, date: r.date, owned: r.owned });
      }
    }
  }
  return list.sort((a, b) => a.artist.localeCompare(b.artist));
}

// Re-scans one artist (a couple of MusicBrainz calls) after their search
// name/aliases were edited. Refused while a full scan is running, since both
// would write the same results file.
export function rescanArtist(name) {
  return new Promise((resolve, reject) => {
    if (isScanRunning()) return reject(new Error('A full scan is running - try again once it finishes.'));
    execFile(PYTHON_EXE, [SCRIPT_PATH, '--artist', name], {
      cwd: SCANNER_DIR, timeout: 120000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || stdout || err.message).toString().trim().split('\n').pop()));
      resolve(getArtistDetail(name));
    });
  });
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
