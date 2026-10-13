// Runs the backend (server/index.js) and restarts it when its code really changes - replacing `node --watch`.
//
// Why: on Windows, Node's file watcher reports a "change" when a file is only READ, because NTFS updates the
// file's last-access time (at most once an hour per file, and last-access updates are on on this PC). The
// server reads its own files (lazy imports in scheduled jobs), so `node --watch` restarted it a few times an
// hour all day and night - every restart dropped the Box-3, and one cut Ims's day report off mid-sentence
// (13 Oct). Here a file only counts as changed when its size or modified time differs from before.
//
// Also: if the server crashes it's started again (after 2 s, backing off to 30 s if it keeps crashing);
// `node --watch` just waited for a file to change.
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = process.env.WATCH_SERVER_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // override for testing
const ENTRY = path.join(ROOT, 'server', 'index.js');
const WATCHED = ['server/routes', 'server/services', 'server/live', 'server/db', 'server/config.js', 'server/index.js']
  .map((p) => path.join(ROOT, p));
const CODE_FILE = /\.(m?js|cjs|json)$/i;

const stamp = () => new Date().toLocaleTimeString('en-GB');
const say = (msg) => console.log(`\x1b[36m[watch ${stamp()}]\x1b[0m ${msg}`);

// size + modified time of every code file, to tell a real edit from a read
const seen = new Map();
const sig = (file) => { try { const st = fs.statSync(file); return st.isFile() ? `${st.size}:${st.mtimeMs}` : null; } catch (_) { return null; } };
function scan(target) {
  let st;
  try { st = fs.statSync(target); } catch (_) { return; }
  if (st.isFile()) { if (CODE_FILE.test(target)) seen.set(target, `${st.size}:${st.mtimeMs}`); return; }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    scan(path.join(target, entry.name));
  }
}
WATCHED.forEach(scan);

let child = null;
let stopping = false;
let crashes = 0;
let startedAt = 0;

function start() {
  startedAt = Date.now();
  child = spawn(process.execPath, [ENTRY], { cwd: ROOT, stdio: 'inherit', env: process.env });
  child.on('exit', (code, signal) => {
    const wasStopping = stopping;
    child = null;
    stopping = false;
    if (wasStopping) return start(); // a restart for changed code
    // it stopped by itself: start it again, more slowly if it keeps falling over
    crashes = Date.now() - startedAt < 60000 ? crashes + 1 : 1;
    const wait = Math.min(30000, 2000 * 2 ** (crashes - 1));
    say(`server stopped (${signal || `exit code ${code}`}) - starting it again in ${Math.round(wait / 1000)} s`);
    setTimeout(() => { if (!child) start(); }, wait);
  });
}

function restart(reason) {
  say(`${reason} - restarting the server`);
  if (!child) return start();
  stopping = true;
  child.kill();
  // if it won't stop, make it
  const pid = child.pid;
  setTimeout(() => { if (child && child.pid === pid) { try { process.kill(pid, 'SIGKILL'); } catch (_) { } } }, 5000);
}

// events are gathered for a moment (an editor saves in several steps), then checked against size + time
let pending = new Set();
let timer = null;
function onEvent(dir, name) {
  if (!name) return;
  const file = path.join(dir, String(name));
  if (!CODE_FILE.test(file)) return;
  pending.add(file);
  clearTimeout(timer);
  timer = setTimeout(() => {
    const changed = [];
    for (const f of pending) {
      const now = sig(f);
      if (now !== (seen.get(f) ?? null)) {
        changed.push(path.relative(ROOT, f));
        if (now) seen.set(f, now); else seen.delete(f);
      }
    }
    pending = new Set();
    if (changed.length) restart(`changed: ${changed.slice(0, 3).join(', ')}${changed.length > 3 ? ` and ${changed.length - 3} more` : ''}`);
  }, 300);
}

for (const target of WATCHED) {
  let isDir = false;
  try { isDir = fs.statSync(target).isDirectory(); } catch (_) { continue; }
  if (isDir) fs.watch(target, { recursive: true }, (_type, name) => onEvent(target, name));
  else fs.watch(target, () => onEvent(path.dirname(target), path.basename(target)));
}

for (const sigName of ['SIGINT', 'SIGTERM']) {
  process.on(sigName, () => { stopping = false; if (child) { child.removeAllListeners('exit'); child.kill(); } process.exit(0); });
}

say(`watching ${WATCHED.map((p) => path.relative(ROOT, p)).join(', ')} - restarts only when a file's content changes`);
start();
