import path from 'path';
import { fileURLToPath } from 'url';
// the server folder, as in index.js (this file lives one level down, in live/)
const __dirname = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
import fs from 'fs';

// The always-on debug log (audio_captures/debug.log). Written through one stream - a blocking write per line
// paused the server, and it grew to 430 MB - and rotated: at the first write of a new day, or past 100 MB,
// the current file becomes debug-YYYY-MM-DD[-HHMM].log, and rotated logs older than 14 days are deleted.
// The ESP-IDF verbose/debug lines older firmware sends ("V (1234) ENUM: ...") are left out.
const DEBUG_LOG_DIR = path.join(__dirname, 'audio_captures');
const DEBUG_LOG_PATH = path.join(DEBUG_LOG_DIR, 'debug.log');
const DEBUG_LOG_MAX_BYTES = 100 * 1024 * 1024;
const DEBUG_LOG_KEEP_DAYS = 14;
export const IDF_NOISE = /DEVICE LOG: [VD] \(\d+\) /;
let debugLogStream = null, debugLogDay = '', debugLogBytes = 0;
const londonDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
function rotateDebugLog(label) {
  try { if (debugLogStream) debugLogStream.end(); } catch (_) { }
  debugLogStream = null;
  try {
    if (fs.existsSync(DEBUG_LOG_PATH) && fs.statSync(DEBUG_LOG_PATH).size > 0) {
      let dest = path.join(DEBUG_LOG_DIR, `debug-${label}.log`);
      if (fs.existsSync(dest)) dest = path.join(DEBUG_LOG_DIR, `debug-${label}-${Date.now()}.log`);
      fs.renameSync(DEBUG_LOG_PATH, dest);
    }
    // rotated logs, and the per-conversation capture folders (audio.wav / mic.wav / debug.log), after 14 days
    const cutoff = Date.now() - DEBUG_LOG_KEEP_DAYS * 86400000;
    for (const f of fs.readdirSync(DEBUG_LOG_DIR)) {
      const full = path.join(DEBUG_LOG_DIR, f);
      if (/^debug-.+\.log$/.test(f) && fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
      else if (/^\d{13}_(hardware|browser)$/.test(f) && Number(f.slice(0, 13)) < cutoff) fs.rmSync(full, { recursive: true, force: true });
    }
  } catch (err) { console.warn('[DebugLog] rotate:', err.message); }
}
export function writeDebugLog(line) {
  if (IDF_NOISE.test(line)) return;
  const day = londonDay();
  if (!debugLogStream) {
    // first write since start-up: a log left from an earlier day, or an oversized one, is rotated first
    try {
      const st = fs.existsSync(DEBUG_LOG_PATH) ? fs.statSync(DEBUG_LOG_PATH) : null;
      const fileDay = st ? new Date(st.mtimeMs).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) : day;
      if (st && (fileDay !== day || st.size > DEBUG_LOG_MAX_BYTES)) rotateDebugLog(fileDay);
      debugLogBytes = fs.existsSync(DEBUG_LOG_PATH) ? fs.statSync(DEBUG_LOG_PATH).size : 0;
    } catch (_) { debugLogBytes = 0; }
    debugLogDay = day;
    debugLogStream = fs.createWriteStream(DEBUG_LOG_PATH, { flags: 'a' });
    debugLogStream.on('error', (err) => { console.warn('[DebugLog]', err.message); debugLogStream = null; });
  } else if (day !== debugLogDay || debugLogBytes > DEBUG_LOG_MAX_BYTES) {
    rotateDebugLog(day !== debugLogDay ? debugLogDay : `${day}-${new Date().toISOString().slice(11, 16).replace(':', '')}`);
    debugLogDay = day;
    debugLogBytes = 0;
    debugLogStream = fs.createWriteStream(DEBUG_LOG_PATH, { flags: 'a' });
    debugLogStream.on('error', (err) => { console.warn('[DebugLog]', err.message); debugLogStream = null; });
  }
  debugLogBytes += Buffer.byteLength(line);
  debugLogStream.write(line);
}
