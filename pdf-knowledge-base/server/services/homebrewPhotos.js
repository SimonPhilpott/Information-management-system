import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import db, { getSetting } from '../db/database.js';

// Finding photos for /ims/homebrew (20 Oct, Simon: "I'd rather you found images, not create them") - the header
// banners and the ingredient photos come from free photo libraries instead of being made by Gemini (about $0.08 a
// picture). Both are searched and their results pooled, so there's more to choose from and one being down or out
// of quota doesn't matter:
//   Pexels  - PEXELS_API_KEY (pexels.com/api; 200 searches an hour)
//   Pixabay - PIXABAY_API_KEY (pixabay.com/api/docs; 100 a minute)
// Both licences allow use without credit; the source and photographer are kept anyway (found_photos).
// Each recipe gets a different photo where it can - a pick from the results by the recipe, skipping ones already
// used elsewhere - so recipes of one kind don't all show the same picture.

const PYTHON_EXE = 'C:\\Python312\\python.exe';
// centre-crop to the wanted shape, then shrink (local OpenCV, as for the face tool)
const CROP = 'import sys,cv2\nimg=cv2.imread(sys.argv[1])\nh,w=img.shape[:2]\nW,H=int(sys.argv[3]),int(sys.argv[4])\nr=W/H\nif w/h>r:\n  nw=int(h*r);x=(w-nw)//2;img=img[:,x:x+nw]\nelse:\n  nh=int(w/r);y=(h-nh)//2;img=img[y:y+nh]\nimg=cv2.resize(img,(W,H),interpolation=cv2.INTER_AREA)\ncv2.imwrite(sys.argv[2],img,[cv2.IMWRITE_JPEG_QUALITY,int(sys.argv[5])])';

db.exec(`
  CREATE TABLE IF NOT EXISTS found_photos (
    key TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    page_url TEXT,
    credit TEXT,
    query TEXT,
    found_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_found_photos_source ON found_photos(source, source_id);
`);

const keyFor = (name) => process.env[name] || getSetting(name.toLowerCase()) || '';
export const photoSearchReady = () => Boolean(keyFor('PEXELS_API_KEY') || keyFor('PIXABAY_API_KEY'));

async function searchPexels(query, shape) {
  const key = keyFor('PEXELS_API_KEY');
  if (!key) return [];
  const u = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=30&orientation=${shape === 'wide' ? 'landscape' : 'square'}`;
  const res = await fetch(u, { headers: { Authorization: key }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Pexels returned HTTP ${res.status}`);
  const d = await res.json();
  return (d.photos || []).map((p) => ({ source: 'pexels', id: String(p.id), url: shape === 'wide' ? p.src?.large2x || p.src?.large : p.src?.large || p.src?.medium, page: p.url, credit: p.photographer, alt: p.alt || '' }));
}
async function searchPixabay(query, shape, category) {
  const key = keyFor('PIXABAY_API_KEY');
  if (!key) return [];
  const u = `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&image_type=photo&per_page=30&safesearch=true${category ? `&category=${category}` : ''}${shape === 'wide' ? '&orientation=horizontal&min_width=1200' : '&min_width=500'}`;
  const res = await fetch(u, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Pixabay returned HTTP ${res.status}`);
  const d = await res.json();
  return (d.hits || []).map((p) => ({ source: 'pixabay', id: String(p.id), url: p.largeImageURL || p.webformatURL, page: p.pageURL, credit: p.user, alt: p.tags || '' }));
}

export async function searchPixabayPhotos(query, { perPage = 24, page = 1 } = {}) {
  const key = keyFor('PIXABAY_API_KEY');
  if (!key) throw new Error('Pixabay API key not configured. Set PIXABAY_API_KEY in .env or settings.');
  const q = String(query || '').trim();
  if (!q) return { hits: [], total: 0 };
  const u = `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&image_type=photo&per_page=${Math.min(50, Math.max(3, perPage))}&page=${Math.max(1, page)}&safesearch=true&orientation=horizontal`;
  const res = await fetch(u, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Pixabay returned HTTP ${res.status}`);
  const d = await res.json();
  const hits = (d.hits || []).map((p) => ({
    id: String(p.id),
    previewUrl: p.previewURL,
    url: p.largeImageURL || p.webformatURL,
    page: p.pageURL,
    credit: p.user,
    tags: p.tags || '',
    width: p.imageWidth,
    height: p.imageHeight,
  }));
  return { hits, total: d.totalHits || hits.length };
}

// does a photo's tags / description name every word that matters in the query? ("Strawberries" -> strawberry)
const STOP = new Set(['plant', 'fresh', 'dried', 'growing', 'the', 'and', 'of', 'a', 'with']);
const stem = (w) => w.toLowerCase().replace(/(ies)$/, 'y').replace(/(oes|ses|xes)$/, (m) => m.slice(0, -2)).replace(/s$/, '');
const mentions = (text, query) => {
  const have = String(text || '').toLowerCase().split(/[^a-z]+/).filter(Boolean).map(stem);
  return String(query).toLowerCase().split(/[^a-z]+/).filter((w) => w && !STOP.has(w)).map(stem).every((w) => have.some((h) => h === w || h.startsWith(w) || w.startsWith(h)));
};
const usedStmt = db.prepare('SELECT 1 FROM found_photos WHERE source = ? AND source_id = ?');
const pick = (list, seed) => list[parseInt(crypto.createHash('sha1').update(String(seed)).digest('hex').slice(0, 8), 16) % list.length];

// Finds a photo for the first query that has results (queries go from most to least specific), saves it as
// <dir>/<key>.jpg cropped to the shape (wide: 960x540 banner, square: 256x256 ingredient), and returns true if it did.
// Ingredients are looked for among food photos first, then nature; banners among nature photos, then anything -
// "ginger" on its own found a red-haired woman (20 Oct). Photos of people are never used.
const PEOPLE = /\b(woman|women|man|men|girl|boy|people|person|portrait|model|lady|child|kid|face|beauty|fashion|redhead|bride)\b/i;
export async function findPhoto({ dir, key, queries, shape, seed }) {
  const tries = queries.filter(Boolean).flatMap((query) => (shape === 'wide' ? ['nature', null] : ['food', 'nature']).map((category) => [query, category]));
  for (const [query, category] of tries) {
    const results = (await Promise.all([searchPexels(query, shape), searchPixabay(query, shape, category)].map((p) => p.catch((err) => { console.warn(`[Homebrew] Photo search: ${err.message}`); return []; })))).flat().filter((p) => p.url);
    // only photos whose own tags / description name what was searched for, and only the best few of those: further
    // down, loosely tagged results crept in ("strawberries" found a chocolate cake, "sweet potatoes" valentine cookies)
    const found = results.filter((p) => mentions(p.alt, query) && !PEOPLE.test(p.alt)).slice(0, 8);
    if (!found.length) continue;
    const fresh = found.filter((p) => !usedStmt.get(p.source, p.id));
    const choice = pick(fresh.length ? fresh : found, `${seed}|${query}`);
    const res = await fetch(choice.url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) continue;
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, `${key}.download`);
    fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    const [w, h, q] = shape === 'wide' ? [960, 540, 80] : [256, 256, 85];
    try {
      await new Promise((resolve, reject) => execFile(PYTHON_EXE, ['-c', CROP, tmp, path.join(dir, `${key}.jpg`), String(w), String(h), String(q)], { windowsHide: true, timeout: 30000 }, (err) => (err ? reject(err) : resolve())));
    } catch (_) { continue; } finally { try { fs.unlinkSync(tmp); } catch (_) { /* gone */ } }
    if (!fs.existsSync(path.join(dir, `${key}.jpg`))) continue;
    db.prepare('INSERT OR REPLACE INTO found_photos (key, source, source_id, page_url, credit, query, found_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(key, choice.source, choice.id, choice.page || null, choice.credit || null, query, Date.now());
    return true;
  }
  return false;
}

// Where a found photo came from, for a credit line ({ source, credit, page } or null)
export function photoCredit(key) {
  const r = db.prepare('SELECT source, credit, page_url FROM found_photos WHERE key = ?').get(key);
  return r ? { source: r.source === 'pexels' ? 'Pexels' : 'Pixabay', credit: r.credit, page: r.page_url } : null;
}
