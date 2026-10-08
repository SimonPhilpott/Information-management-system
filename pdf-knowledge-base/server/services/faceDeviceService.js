// The Box-3 shows the active persona's face. The dot face is drawn by the firmware itself; every other face
// (painted Orc Chief / Chronicler, Vector, Oscilloscope, Geometric, Steampunk) reaches it as a "face pack":
// the face photographed frame by frame in a headless browser from the real web components (src/faceRender),
// sized to the device's 204 x 136 face area, as JPEGs in one file the device downloads into its PSRAM.
//
// Pack file: "IMSF" | uint32 LE index length | index JSON | JPEG frames back to back.
// Index: { w, h, bg: 'rrggbb', frames: [[name, offset, length], ...], eyes: { emotion: [[x, y, w, h, 'top', 'bottom', open]] } }
// Frame names are '<emotion>.<shape>': shapes closed / mid / wide for every face; painted faces add
// small / round (neutral) and the morph in-betweens m1..m4 for each emotion.
// Eyes that follow you: '<emotion>.<shape>.L' / '.R' are the same frame with the eyes looking left / right
// (procedural faces held at that glance; painted faces with the iris slid inside each open eye). Painted faces
// get them for their mouth shapes, not the morph in-betweens. The device swaps to them while someone is at the desk.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { getActivePersona } from './personaService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '../../..');
const RENDER_DIR = path.resolve(__dirname, '../face_render');
const PACK_DIR = path.resolve(__dirname, '../data/face_packs');
const SOURCES = [path.join(PROJECT, 'src/components/Ims'), path.join(PROJECT, 'src/assets/faces'), path.join(PROJECT, 'src/faceRender')];
const PACK_FORMAT = 3;
const W = 204, H = 136, DEVICE_BG = '0b0e15';

const PAINTED = new Set(['orc', 'chronicler']);
const PROCEDURAL = new Set(['vector', 'oscilloscope', 'geometric', 'steampunk']);
const EMOTIONS = ['neutral', 'joy', 'cocky', 'love', 'amazement', 'suspicious', 'confused', 'sad', 'devastated', 'anger', 'rage', 'fear', 'disgusted', 'bored', 'sleepy'];
// procedural faces: the mouth at rest, mid-sentence and wide open
const SHAPES = [['closed', 'idle', 0], ['mid', 'speaking', 0.35], ['wide', 'speaking', 0.9]];

const building = new Map(); // pack id -> promise
const readyListeners = new Set();
export function onFacePackReady(fn) { readyListeners.add(fn); }

const newest = (dir) => {
  let t = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs);
  }
  return t;
};
const rendererBuiltAt = () => { try { return fs.statSync(path.join(RENDER_DIR, 'index.html')).mtimeMs; } catch { return 0; } };

// The face renderer bundle, rebuilt whenever the faces themselves have changed since it was built.
let rendererBuild = null;
function ensureRenderer() {
  if (rendererBuiltAt() >= Math.max(...SOURCES.map(newest))) return Promise.resolve();
  if (rendererBuild) return rendererBuild;
  console.log('[FaceDevice] Building the face renderer...');
  rendererBuild = new Promise((resolve, reject) => {
    const p = spawn('npx', ['vite', 'build', '--config', 'face-render.vite.config.mjs'], { cwd: PROJECT, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => { rendererBuild = null; code === 0 ? resolve() : reject(new Error(`Face renderer build failed: ${err.slice(-300)}`)); });
  });
  return rendererBuild;
}

const hash = (v) => crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 10);

// What the Box-3 should show for a persona: its style, and for anything but dots the pack to load.
export function faceSpecFor(persona) {
  const style = persona?.faceStyle || 'dots';
  if (!PAINTED.has(style) && !PROCEDURAL.has(style)) return { style: 'dots' };
  const look = PAINTED.has(style) ? { style } : { style, color: persona.faceColor || '', accessories: persona.accessories || null };
  const id = `${style}-${hash({ look, PACK_FORMAT, renderer: Math.round(rendererBuiltAt()) })}`;
  return { style, id, look };
}
export const packPath = (id) => path.join(PACK_DIR, `${String(id).replace(/[^a-z0-9-]/gi, '')}.bin`);

// The face block the device gets with every status push. Until a pack is built the device keeps its dots.
export function getDeviceFace() {
  const spec = faceSpecFor(getActivePersona());
  if (spec.style === 'dots') return { style: 'dots' };
  const f = packPath(spec.id);
  if (fs.existsSync(f)) return { style: spec.style, pack: spec.id, bytes: fs.statSync(f).size };
  ensurePack(spec).catch((err) => console.error('[FaceDevice] Pack build failed:', err.message));
  return { style: 'dots', building: spec.style };
}

export function ensurePack(spec = faceSpecFor(getActivePersona())) {
  if (spec.style === 'dots') return Promise.resolve(null);
  if (fs.existsSync(packPath(spec.id))) return Promise.resolve(packPath(spec.id));
  if (building.has(spec.id)) return building.get(spec.id);
  const job = (async () => {
    await ensureRenderer();
    const s = faceSpecFor(getActivePersona()); // the renderer may have just been rebuilt: id includes its build time
    const target = s.style === spec.style ? s : spec;
    if (fs.existsSync(packPath(target.id))) return packPath(target.id);
    const started = Date.now();
    const file = await renderPack(target);
    console.log(`[FaceDevice] Face pack ${target.id} built in ${((Date.now() - started) / 1000).toFixed(1)} s (${Math.round(fs.statSync(file).size / 1024)} KB)`);
    for (const fn of readyListeners) { try { fn(target); } catch { /* listener errors don't fail the build */ } }
    return file;
  })().finally(() => building.delete(spec.id));
  building.set(spec.id, job);
  return job;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

async function renderPack({ id, style, look }) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
    // the renderer bundle, served from disk under a made-up origin (module scripts don't load from file://)
    await page.route('http://face.render/**', (route) => {
      const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, '');
      const f = path.join(RENDER_DIR, rel);
      if (!f.startsWith(RENDER_DIR) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
      route.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
    });
    await page.route(/^(?!http:\/\/face\.render\/).*/, (route) => route.fulfill({ status: 404, body: '' })); // faces must not call the app's APIs
    await page.goto('http://face.render/index.html');
    await page.waitForFunction(() => typeof window.show === 'function', null, { timeout: 30000 });
    const box = page.locator('#box');
    const shot = () => box.screenshot({ type: 'jpeg', quality: 82 });
    const frames = [];
    let bg = DEVICE_BG;
    const eyes = {};

    if (PAINTED.has(style)) {
      const art = await page.evaluate((s) => { const a = window.PAINTED[s]; return { frames: a.frames, eyes: a.eyes, aspect: a.aspect, background: a.background }; }, style);
      bg = String(art.background || '#0b0e15').replace('#', '');
      const [aw, ah] = String(art.aspect).split('/').map(Number);
      const pw = H * aw / ah, ox = (W - pw) / 2;
      for (const [emotion, set] of Object.entries(art.frames)) {
        const open = (art.eyes?.[emotion] || []).filter((e) => e.open !== false);
        for (const [shape, url] of Object.entries(set)) {
          // every frame goes through the same canvas, so the looking frames match the rest exactly
          const sides = open.length && !/^m[1-4]$/.test(shape) ? [[0, ''], [-1, '.L'], [1, '.R']] : [[0, '']];
          for (const [dir, suffix] of sides) {
            await page.evaluate((spec) => window.show(spec), { kind: 'image', url, background: art.background, aspect: art.aspect, look: { dir, eyes: dir ? open : [] } });
            frames.push([`${emotion}.${shape}${suffix}`, await shot()]);
          }
        }
      }
      for (const [emotion, list] of Object.entries(art.eyes || {})) {
        eyes[emotion] = list.map((e) => [
          Math.round(ox + e.x / 100 * pw), Math.round(e.y / 100 * H), Math.max(2, Math.round(e.w / 100 * pw)), Math.max(2, Math.round(e.h / 100 * H)),
          String(e.lid?.[0] || '#000000').replace('#', ''), String(e.lid?.[1] || e.lid?.[0] || '#000000').replace('#', ''), e.open === false ? 0 : 1,
        ]);
      }
    } else {
      for (const emotion of EMOTIONS) {
        for (const [shape, status, level] of SHAPES) {
          for (const [gaze, suffix] of [[0, ''], [-1, '.L'], [1, '.R']]) {
            const face = { faceStyle: style, emotion, faceEmotion: emotion, ...(gaze ? { gaze } : {}), ...(look.color ? { color: look.color, faceColor: look.color } : {}), ...(look.accessories ? { accessories: look.accessories } : {}) };
            await page.evaluate((spec) => window.show(spec), { kind: 'face', face, status, level });
            await page.waitForTimeout(450); // let the face's springs and mouth settle on this level
            frames.push([`${emotion}.${shape}${suffix}`, await shot()]);
          }
        }
      }
    }

    const index = [];
    let offset = 0;
    for (const [name, buf] of frames) { index.push([name, offset, buf.length]); offset += buf.length; }
    const json = Buffer.from(JSON.stringify({ w: W, h: H, bg, frames: index, eyes }), 'utf8');
    const head = Buffer.alloc(8);
    head.write('IMSF', 0, 'ascii');
    head.writeUInt32LE(json.length, 4);
    fs.mkdirSync(PACK_DIR, { recursive: true });
    const out = packPath(id);
    fs.writeFileSync(`${out}.tmp`, Buffer.concat([head, json, ...frames.map(([, b]) => b)]));
    fs.renameSync(`${out}.tmp`, out);
    return out;
  } finally {
    await browser.close();
  }
}
