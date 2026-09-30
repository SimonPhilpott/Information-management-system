import fs from 'fs';
import path from 'path';
import { spawn, execFile } from 'child_process';
import { getSetting, setSetting } from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
//       date, precision, owned, linkedFolder}], unlisted: [folderName], error, hidden, linkedFolder } } }
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
  const overrides = getArtistOverrides();
  const visible = Object.entries(r.artists || {}).filter(([name]) => !overrides[name]?.hidden);
  return {
    lastScanCompleted: r.lastScanCompleted || null,
    artistsScanned: visible.length,
    artistsWithMissingReleases: visible.filter(([, a]) => a.releases?.some((rel) => !rel.owned)).length
  };
}

// --- per-artist name overrides / pseudonyms (read by the python scanner) ---
export function getArtistOverrides() {
  return readJson(ARTISTS_PATH, {});
}

export function saveArtistSettings(name, { searchName, aliases, hidden, favourite, mbId, linkedFolder, linkedReleases }) {
  const all = getArtistOverrides();
  const current = all[name] || {};
  
  const cleanAliases = (Array.isArray(aliases) ? aliases : (current.aliases || [])).map((a) => String(a).trim()).filter(Boolean);
  const cleanSearch = searchName !== undefined ? String(searchName || '').trim() : (current.searchName || '');
  const isHidden = hidden !== undefined ? Boolean(hidden) : Boolean(current.hidden);
  const isFavourite = favourite !== undefined ? Boolean(favourite) : Boolean(current.favourite);
  const cleanMbId = mbId !== undefined ? (String(mbId || '').trim() || null) : (current.mbId || null);
  const folderLink = linkedFolder !== undefined ? (String(linkedFolder || '').trim() || null) : (current.linkedFolder || null);
  const relLinks = linkedReleases !== undefined ? linkedReleases : (current.linkedReleases || {});

  const hasContent = cleanSearch || cleanAliases.length > 0 || isHidden || isFavourite || cleanMbId || folderLink || (relLinks && Object.keys(relLinks).length > 0);
  
  if (!hasContent) {
    delete all[name];
  } else {
    all[name] = {
      ...(cleanSearch ? { searchName: cleanSearch } : {}),
      ...(cleanAliases.length ? { aliases: cleanAliases } : {}),
      ...(isHidden ? { hidden: true } : {}),
      ...(isFavourite ? { favourite: true } : {}),
      ...(cleanMbId ? { mbId: cleanMbId } : {}),
      ...(folderLink ? { linkedFolder: folderLink } : {}),
      ...(relLinks && Object.keys(relLinks).length ? { linkedReleases: relLinks } : {})
    };
  }
  
  fs.writeFileSync(ARTISTS_PATH, JSON.stringify(all, null, 2), 'utf8');
  return all[name] || { searchName: '', aliases: [], hidden: false, favourite: false, mbId: null, linkedFolder: null, linkedReleases: {} };
}

export function toggleArtistFavourite(name, favourite) {
  const all = getArtistOverrides();
  const current = all[name] || {};
  const nextFav = favourite !== undefined ? Boolean(favourite) : !Boolean(current.favourite);
  return saveArtistSettings(name, { favourite: nextFav });
}

export function hideArtist(name, hidden = true) {
  return saveArtistSettings(name, { hidden });
}

export function linkArtistRelease(artistName, releaseTitle, folderName) {
  const all = getArtistOverrides();
  const current = all[artistName] || {};
  const linkedReleases = { ...(current.linkedReleases || {}) };
  if (folderName) {
    linkedReleases[releaseTitle] = folderName;
  } else {
    delete linkedReleases[releaseTitle];
  }
  saveArtistSettings(artistName, { linkedReleases });

  // Update in results cache immediately
  const results = getResults();
  if (results.artists && results.artists[artistName]) {
    const entry = results.artists[artistName];
    for (const r of entry.releases) {
      if (r.title === releaseTitle || r.title.toLowerCase() === releaseTitle.toLowerCase()) {
        r.owned = Boolean(folderName);
        r.linkedFolder = folderName || null;
      }
    }
    // Recompute unlisted if needed
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 1), 'utf8');
  }
  return getArtistDetail(artistName);
}

function summarise(name, entry, overrides) {
  const ov = overrides[name] || {};
  return {
    name,
    genre: entry.genre,
    mbName: entry.mbName,
    mbId: entry.mbId || ov.mbId || null,
    owned: entry.releases.filter((r) => r.owned).length,
    notOwned: entry.releases.filter((r) => !r.owned).length,
    unlisted: entry.unlisted.length,
    searchName: ov.searchName || '',
    aliases: ov.aliases || [],
    hidden: Boolean(ov.hidden),
    favourite: Boolean(ov.favourite),
    linkedFolder: ov.linkedFolder || null,
    linkedReleases: ov.linkedReleases || {}
  };
}

export function getArtistList({ includeHidden = false } = {}) {
  const overrides = getArtistOverrides();
  return Object.entries(getResults().artists)
    .filter(([name]) => includeHidden || !overrides[name]?.hidden)
    .map(([name, entry]) => summarise(name, entry, overrides))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function getArtistDetail(name) {
  const entry = getResults().artists[name];
  if (!entry) return null;
  return {
    ...summarise(name, entry, getArtistOverrides()),
    releases: entry.releases,
    unlistedAlbums: entry.unlisted,
    error: entry.error || null
  };
}

// Audit: list all unmatched artists (no mbId or 0 releases), artists with unowned releases, and hidden folders
export function getMusicAudit() {
  const overrides = getArtistOverrides();
  const results = getResults().artists;
  const unmatched = [];
  const withMissing = [];
  const hidden = [];

  for (const [name, entry] of Object.entries(results)) {
    const isHidden = Boolean(overrides[name]?.hidden);
    const sum = summarise(name, entry, overrides);
    const detail = {
      ...sum,
      releases: entry.releases || [],
      unlistedAlbums: entry.unlisted || [],
      error: entry.error || null
    };

    if (isHidden) {
      hidden.push(detail);
      continue;
    }

    const isUnmatched = !entry.mbId || entry.error || (entry.releases || []).length === 0;
    if (isUnmatched) {
      unmatched.push(detail);
    } else if (sum.notOwned > 0 || (entry.unlisted || []).length > 0) {
      withMissing.push(detail);
    }
  }

  unmatched.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  withMissing.sort((a, b) => (b.notOwned + (b.unlistedAlbums?.length || 0)) - (a.notOwned + (a.unlistedAlbums?.length || 0)) || a.name.localeCompare(b.name));
  hidden.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return {
    summary: {
      unmatchedCount: unmatched.length,
      missingReleasesArtistCount: withMissing.length,
      hiddenCount: hidden.length
    },
    unmatchedCount: unmatched.length,
    withMissingCount: withMissing.length,
    hiddenCount: hidden.length,
    unmatchedArtists: unmatched,
    missingReleases: withMissing,
    hiddenArtists: hidden,
    unmatched,
    withMissing,
    hidden
  };
}

// List all genre folders and artist subfolders on MUZAK share
export function getMuzakFolders() {
  const cfg = getConfig();
  const root = cfg.muzak_path;
  const genres = [];
  try {
    if (fs.existsSync(root)) {
      for (const g of fs.readdirSync(root)) {
        const gp = path.join(root, g);
        try {
          if (fs.statSync(gp).isDirectory() && !g.startsWith('.')) {
            const artists = [];
            for (const a of fs.readdirSync(gp)) {
              const ap = path.join(gp, a);
              try {
                if (fs.statSync(ap).isDirectory() && !a.startsWith('.')) {
                  artists.push(a);
                }
              } catch (_) {}
            }
            genres.push({ genre: g, artists: artists.sort((a, b) => a.localeCompare(b)) });
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    console.error('[MusicScan] getMuzakFolders error:', err.message);
  }
  return { root, genres };
}

// List album folders and audio files inside a specific artist folder
export function getArtistFolderContents(genre, artistName) {
  const cfg = getConfig();
  const artistPath = path.join(cfg.muzak_path, genre, artistName);
  if (!fs.existsSync(artistPath)) {
    // Try searching all genres if given genre not found
    for (const g of fs.readdirSync(cfg.muzak_path)) {
      const gp = path.join(cfg.muzak_path, g);
      try {
        if (fs.statSync(gp).isDirectory()) {
          const candidate = path.join(gp, artistName);
          if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
            return listFolderContents(candidate, g, artistName);
          }
        }
      } catch (_) {}
    }
    throw new Error(`Artist folder not found: ${artistName}`);
  }
  return listFolderContents(artistPath, genre, artistName);
}

function listFolderContents(dirPath, genre, artistName) {
  const items = fs.readdirSync(dirPath);
  const subfolders = [];
  const audioFiles = [];
  
  for (const item of items) {
    const full = path.join(dirPath, item);
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        subfolders.push(item);
      } else if (/\.(mp3|flac|m4a|wav|wma|ogg|aac|alac)$/i.test(item)) {
        audioFiles.push(item);
      }
    } catch (_) {}
  }
  
  return {
    genre,
    artist: artistName,
    path: dirPath,
    subfolders: subfolders.sort((a, b) => a.localeCompare(b)),
    audioFiles: audioFiles.sort((a, b) => a.localeCompare(b))
  };
}

// Rename an album subfolder inside an artist folder
export function renameAlbumFolder(genre, artistName, oldFolderName, newFolderName) {
  const cfg = getConfig();
  const cleanOld = String(oldFolderName || '').trim();
  const cleanNew = String(newFolderName || '').trim().replace(/[\\/:*?"<>|]/g, '-');
  if (!cleanOld || !cleanNew) throw new Error('Both old and new folder names are required.');
  
  let artistPath = path.join(cfg.muzak_path, genre, artistName);
  if (!fs.existsSync(artistPath)) {
    for (const g of fs.readdirSync(cfg.muzak_path)) {
      const candidate = path.join(cfg.muzak_path, g, artistName);
      if (fs.existsSync(candidate)) {
        artistPath = candidate;
        genre = g;
        break;
      }
    }
  }
  
  const oldPath = path.join(artistPath, cleanOld);
  const newPath = path.join(artistPath, cleanNew);
  
  if (!fs.existsSync(oldPath)) throw new Error(`Original folder does not exist: ${cleanOld}`);
  if (fs.existsSync(newPath) && cleanOld.toLowerCase() !== cleanNew.toLowerCase()) {
    throw new Error(`Target folder already exists: ${cleanNew}`);
  }
  
  fs.renameSync(oldPath, newPath);
  
  // Re-scan single artist
  return rescanArtist(artistName);
}

// Rename an artist folder on disk
export function renameArtistFolder(genre, oldArtistName, newArtistName) {
  const cfg = getConfig();
  const cleanOld = String(oldArtistName || '').trim();
  const cleanNew = String(newArtistName || '').trim().replace(/[\\/:*?"<>|]/g, '-');
  if (!cleanOld || !cleanNew) throw new Error('Both old and new artist names are required.');

  let genrePath = path.join(cfg.muzak_path, genre);
  let oldPath = path.join(genrePath, cleanOld);
  if (!fs.existsSync(oldPath)) {
    for (const g of fs.readdirSync(cfg.muzak_path)) {
      const candidate = path.join(cfg.muzak_path, g, cleanOld);
      if (fs.existsSync(candidate)) {
        oldPath = candidate;
        genrePath = path.join(cfg.muzak_path, g);
        genre = g;
        break;
      }
    }
  }

  const newPath = path.join(genrePath, cleanNew);
  if (!fs.existsSync(oldPath)) throw new Error(`Original artist folder does not exist: ${cleanOld}`);
  if (fs.existsSync(newPath) && cleanOld.toLowerCase() !== cleanNew.toLowerCase()) {
    throw new Error(`Target artist folder already exists: ${cleanNew}`);
  }

  fs.renameSync(oldPath, newPath);

  // Migrate artist overrides if any
  const overrides = getArtistOverrides();
  if (overrides[cleanOld]) {
    overrides[cleanNew] = overrides[cleanOld];
    delete overrides[cleanOld];
    fs.writeFileSync(ARTISTS_PATH, JSON.stringify(overrides, null, 2), 'utf8');
  }

  // Update results JSON
  const results = getResults();
  if (results.artists && results.artists[cleanOld]) {
    results.artists[cleanNew] = results.artists[cleanOld];
    delete results.artists[cleanOld];
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 1), 'utf8');
  }

  return rescanArtist(cleanNew);
}

// Search MusicBrainz for closest artist matches via Python helper
export function searchMusicBrainzArtist(query) {
  return new Promise((resolve, reject) => {
    const q = String(query || '').trim();
    if (!q) return resolve([]);
    
    const pyScript = `import sys, json, musicbrainzngs
musicbrainzngs.set_useragent('IMSMusicScanService', '1.0.0', 'https://github.com/yourusername/ims')
try:
    hits = musicbrainzngs.search_artists(query=sys.argv[1], limit=10).get('artist-list', [])
    res = [{'name': h.get('name'), 'disambiguation': h.get('disambiguation'), 'score': h.get('ext:score'), 'id': h.get('id'), 'country': h.get('country'), 'type': h.get('type')} for h in hits]
    print(json.dumps(res))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;
    execFile(PYTHON_EXE, ['-c', pyScript, q], {
      timeout: 15000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || stdout || err.message));
      try {
        const data = JSON.parse(stdout.trim());
        if (data.error) return reject(new Error(data.error));
        resolve(data);
      } catch (e) {
        reject(new Error('Failed to parse MusicBrainz search output: ' + e.message));
      }
    });
  });
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
    if (overrides[name]?.hidden) continue;
    const releases = entry.releases.map((r) => ({ ...r, isNew: inWindow(r, cutoff, today, windowKey) }));
    const newest = releases.filter((r) => r.isNew).map((r) => r.date).sort().pop();
    if (!newest) continue;
    out.push({ ...summarise(name, entry, overrides), releases, unlistedAlbums: entry.unlisted, newestDate: newest });
  }
  out.sort((a, b) => (b.newestDate.localeCompare(a.newestDate)) || a.name.localeCompare(b.name));
  return { window: windowKey, cutoff, today, artists: out };
}

export function getTodayReleases() {
  const today = todayLondonDateStr();
  const overrides = getArtistOverrides();
  const list = [];
  for (const [name, entry] of Object.entries(getResults().artists)) {
    if (overrides[name]?.hidden) continue;
    for (const r of entry.releases) {
      if (r.precision === 'day' && r.date === today) {
        list.push({ artist: name, title: r.title, type: r.type, date: r.date, owned: r.owned });
      }
    }
  }
  return list.sort((a, b) => a.artist.localeCompare(b.artist));
}

export function getUpcomingReleases() {
  const today = todayLondonDateStr();
  const thisMonth = today.slice(0, 7);
  const thisYear = Number(today.slice(0, 4));
  const overrides = getArtistOverrides();
  const list = [];
  for (const [name, entry] of Object.entries(getResults().artists)) {
    if (overrides[name]?.hidden) continue;
    for (const r of entry.releases) {
      const d = r.date || '';
      const upcoming = (r.precision === 'day' && d > today)
        || (r.precision === 'month' && d >= thisMonth)
        || (r.precision === 'year' && Number(d) > thisYear);
      if (!upcoming) continue;
      // Sort key: unknown days/months sort after the known ones in the same period.
      const sortKey = r.precision === 'day' ? d : r.precision === 'month' ? `${d}-99` : `${d}-99-99`;
      list.push({ artist: name, mbName: entry.mbName || null, title: r.title, type: r.type, date: d, precision: r.precision, owned: Boolean(r.owned), sortKey });
    }
  }
  return list.sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.artist.localeCompare(b.artist))
    .map(({ sortKey, ...rest }) => rest);
}

// Re-scans one artist (a couple of MusicBrainz calls) after their search
// name/aliases were edited. Refused while a full scan is running.
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

function scanAlreadyStartedToday(londonDateStr) {
  const s = getStatus();
  if (!s.startedAt) return false;
  const startedLondonDate = londonPartsFormatter.formatToParts(new Date(s.startedAt))
    .reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return `${startedLondonDate.year}-${startedLondonDate.month}-${startedLondonDate.day}` === londonDateStr;
}

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

// ---- want list and recommendations ---------------------------------------------------------------------
const WANTS_KEY = 'music_wants';
const RECS_KEY = 'music_recommendations';
const wantKey = (w) => `${String(w.artist).toLowerCase()}|${String(w.title).toLowerCase()}`;

export function getWants() {
  let wants = [];
  try { wants = JSON.parse(getSetting(WANTS_KEY) || '[]'); } catch { wants = []; }
  const today = todayLondonDateStr();
  const results = getResults().artists;
  return wants.map((w) => {
    const r = results[w.artist]?.releases.find((x) => x.title.toLowerCase() === w.title.toLowerCase());
    const cur = r ? { ...w, date: r.date, precision: r.precision, type: r.type, owned: Boolean(r.owned) } : w;
    const released = cur.date && (cur.precision === 'day' ? cur.date <= today : cur.precision === 'month' ? cur.date < today.slice(0, 7) : Number(cur.date) < Number(today.slice(0, 4)));
    return { ...cur, released: Boolean(released) };
  }).sort((a, b) => Number(a.owned) - Number(b.owned) || String(a.date || '9999').localeCompare(String(b.date || '9999')));
}

export function addWant({ artist, title, date, precision, type }) {
  if (!artist || !title) throw new Error('Need an artist and a title.');
  let wants = [];
  try { wants = JSON.parse(getSetting(WANTS_KEY) || '[]'); } catch { wants = []; }
  if (!wants.some((w) => wantKey(w) === wantKey({ artist, title }))) wants.push({ artist, title, date: date || null, precision: precision || null, type: type || null, addedAt: Date.now() });
  setSetting(WANTS_KEY, JSON.stringify(wants));
  return getWants();
}

export function removeWant({ artist, title }) {
  let wants = [];
  try { wants = JSON.parse(getSetting(WANTS_KEY) || '[]'); } catch { wants = []; }
  setSetting(WANTS_KEY, JSON.stringify(wants.filter((w) => wantKey(w) !== wantKey({ artist, title }))));
  return getWants();
}

export function getSavedRecommendations() { try { return JSON.parse(getSetting(RECS_KEY) || 'null'); } catch { return null; } }

export async function recommendArtists() {
  const artists = Object.entries(getResults().artists);
  if (!artists.length) throw new Error('Run a scan first so IMS knows your library.');
  const owned = artists.map(([name, e]) => ({ name: e.mbName || name, genre: e.genre || '', n: e.releases.filter((r) => r.owned).length + (e.unlisted?.length || 0) }))
    .sort((a, b) => b.n - a.n);
  const have = new Set(artists.flatMap(([name, e]) => [name, e.mbName].filter(Boolean).map((x) => x.toLowerCase().replace(/^the /, ''))));
  const top = owned.slice(0, 60).map((a) => `${a.name}${a.genre ? ` (${a.genre})` : ''}`).join('; ');
  const prompt = `Here are the artists someone owns the most albums by: ${top}.
They already own music by every artist in this list, so NEVER suggest any of them: ${[...new Set(artists.map(([name, e]) => e.mbName || name))].join('; ')}.
Suggest 18 other artists they do not own who they would very likely enjoy, mixing close matches with a few braver picks. Real, findable artists only.
Reply as JSON only: [{"artist": "...", "because": ["Owned Artist", "Owned Artist"], "why": "one short British-English sentence", "startWith": "one album to start with"}]`;
  const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } });
  const text = (await model.generateContent(prompt)).response.text();
  let list = [];
  try { list = JSON.parse(text); } catch { throw new Error('The recommendation service returned something unreadable - try again.'); }
  const picks = (Array.isArray(list) ? list : []).filter((r) => r && r.artist && !have.has(String(r.artist).toLowerCase().replace(/^the /, ''))).slice(0, 15);
  const saved = { at: Date.now(), artists: picks };
  setSetting(RECS_KEY, JSON.stringify(saved));
  return saved;
}
