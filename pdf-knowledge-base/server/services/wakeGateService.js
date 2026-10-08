import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

// Local wake-phrase check. The Box-3 streams its microphone whenever it hears a sound, and every one of
// those used to open a full Gemini Live session (system prompt and tools, ~16k tokens) just to find out
// whether "Hey Ims" was said - ~360 checks a day for ~19 real requests. Now the audio is held here and
// transcribed locally first (python/wake_stt.py, faster-whisper base.en - nothing leaves this machine);
// only speech that sounds like a wake phrase opens Gemini, and it gets the held audio, so nothing said is
// lost. The judging of the words stays in index.js (the same matchers the wake phrases service feeds).
//
// Fail-open: if the local model isn't loaded yet, has died or errors, the check passes and Gemini decides
// as before - a missed wake is worse than an extra session.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_EXE = 'C:\\Python312\\python.exe';
const TOOL = path.join(__dirname, '..', 'python', 'wake_stt.py');

let worker = null;
let ready = false;
let buf = '';
let pending = null; // { id, resolve, reject, timer }
let nextId = 1;
let restartAt = 0;

function start() {
  if (worker || Date.now() < restartAt) return;
  ready = false;
  buf = '';
  worker = spawn(PYTHON_EXE, [TOOL], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  worker.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      let out;
      try { out = JSON.parse(line); } catch (_) { continue; }
      if (out.ready) { ready = true; console.log(`[WakeGate] Local wake check ready (${out.model})`); continue; }
      const p = pending;
      if (!p || out.id !== p.id) continue;
      pending = null;
      clearTimeout(p.timer);
      if (out.error) p.reject(new Error(out.error));
      else p.resolve(String(out.text || ''));
    }
  });
  const dead = () => {
    worker = null;
    ready = false;
    restartAt = Date.now() + 30000; // don't spin if Python or the model is broken
    if (pending) { clearTimeout(pending.timer); pending.reject(new Error('Wake check stopped.')); pending = null; }
  };
  worker.on('exit', dead);
  worker.on('error', dead);
}

// Load the model at start-up so the first wake isn't slowed by it.
export function startWakeGate() { start(); }
export const wakeGateReady = () => ready;

// Transcribes 16 kHz mono 16-bit PCM. Rejects with 'busy' while another clip is being transcribed, and
// with an error when the local model isn't available (the caller then lets the audio through).
export function transcribeWake(pcm) {
  return new Promise((resolve, reject) => {
    start();
    if (!worker || !ready) return reject(new Error('not ready'));
    if (pending) return reject(new Error('busy'));
    const id = nextId++;
    const timer = setTimeout(() => {
      if (pending?.id !== id) return;
      pending = null;
      reject(new Error('Wake check timed out.'));
    }, 4000);
    pending = { id, resolve, reject, timer };
    worker.stdin.write(JSON.stringify({ id, pcm: pcm.toString('base64') }) + '\n');
  });
}
