import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import db from '../db/database.js';
import config from '../config.js';
import { getBrew, CATEGORIES } from './homebrewService.js';
import { pictureFile } from './homebrewPictures.js';
import { ngrokUrl } from '../routes/admin.js';
import { publicOrigin } from '../middleware/publicOrigin.js';
import { glossMatches, glossTerms } from '../../../src/components/Dashboard/brewGlossary.js';

// Sharing a recipe: a link anyone can open (sent on WhatsApp, say) that shows that one recipe and nothing else
// in IMS, and the same page as a PDF. The link carries an unguessable token, made the first time it's shared
// and kept until Simon stops sharing it. Only the recipe goes out - never logs, tastings, favourites or notes
// about the batch.

try { db.exec('ALTER TABLE brews ADD COLUMN share_token TEXT'); } catch (_) { /* already there */ }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const WINE_CATS = ['white_wine', 'red_wine', 'rose_wine', 'fruit_veg_wine', 'flower_herb_wine', 'hot_pepper_wine'];
const CAT_LABEL = { white_wine: 'White wine', red_wine: 'Red wine', rose_wine: 'Rosé wine', fruit_veg_wine: 'Fruit & vegetable wine', flower_herb_wine: 'Flower & herb wine', hot_pepper_wine: 'Hot pepper wine', mead: 'Mead', beer: 'Beer', stout: 'Stout', cider: 'Cider', soda: 'Wild soda & kvass' };
const FLAVOUR = { fruity: '🍓 Fruity', floral: '🌸 Floral', herbal: '🌿 Herbal & earthy', pine: '🌲 Pine & hoppy', roasted: '☕ Roasted & chocolate', spicy: '🫚 Spicy', honey: '🍯 Honeyed' };
const COLOUR = { red: 'Red', white: 'White', rose: 'Rosé' };

// The address people outside can reach, in order of preference:
//   SHARE_BASE_URL in .env, if set;
//   the tunnel the ngrok program is serving (start-all.bat's https://simon-ims.ngrok-free.app), read from its
//   local status page;
//   the server's own tunnel (NGROK_DOMAIN);
//   else the address the request came in on (only reachable at home).
async function agentTunnel() {
  try {
    const r = await fetch('http://127.0.0.1:4040/api/tunnels', { signal: AbortSignal.timeout(1500) });
    const t = (await r.json()).tunnels || [];
    return (t.find((x) => x.public_url?.startsWith('https://')) || t[0])?.public_url || null;
  } catch { return null; }
}
export async function publicBase(req) {
  const tunnel = process.env.SHARE_BASE_URL || await agentTunnel() || ngrokUrl() || (config.ngrok.domain ? `https://${config.ngrok.domain}` : null) || publicOrigin(req);
  if (tunnel) return { base: tunnel.replace(/\/$/, ''), reachable: true };
  return { base: `${req.protocol}://${req.get('host')}`, reachable: false };
}

export function shareRecipe(id) {
  const row = db.prepare('SELECT id, share_token FROM brews WHERE id = ?').get(Number(id));
  if (!row) throw new Error('No such recipe');
  if (row.share_token) return row.share_token;
  const token = crypto.randomBytes(12).toString('base64url');
  db.prepare('UPDATE brews SET share_token = ? WHERE id = ?').run(token, row.id);
  return token;
}
export function unshareRecipe(id) {
  return db.prepare('UPDATE brews SET share_token = NULL WHERE id = ?').run(Number(id)).changes > 0;
}
export function sharedRecipe(token) {
  if (!/^[A-Za-z0-9_-]{16}$/.test(String(token || ''))) return null;
  const row = db.prepare('SELECT id FROM brews WHERE share_token = ?').get(token);
  return row ? getBrew(row.id) : null;
}

const strengthOf = (b) => b.calc?.abv || b.calc?.potentialAbv || b.abvEstimate || null;
function bottles(b) {
  const L = Number(b.batchLitres);
  if (!L) return null;
  const wine = WINE_CATS.includes(b.category);
  return `${Math.floor((L * 0.9) / (wine ? 0.75 : 0.5))} × ${wine ? '750 ml' : '500 ml'} bottles`;
}
// text with each brewing term underlined and its meaning on hover (the PDF lists them under "Terms" instead)
const gloss = (t) => {
  const s = String(t ?? '');
  let out = '', at = 0;
  for (const g of glossMatches(s)) { out += esc(s.slice(at, g.index)) + `<abbr title="${esc(g.meaning)}">${esc(s.slice(g.index, g.index + g.length))}</abbr>`; at = g.index + g.length; }
  return out + esc(s.slice(at));
};
const steps = (m) => String(m || '').split('\n').map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim()).filter(Boolean);
const STAGE = { primary: 'Start', secondary: 'Secondary', backsweeten: 'Back-sweeten', bottling: 'Bottling' };

// One page for the recipe: on screen for the link, and the same page laid out on A4 for the PDF.
export function recipeHtml(b, { pdfUrl = null, forPdf = false } = {}) {
  const abv = strengthOf(b);
  const estimated = abv && !b.calc?.abv && !b.calc?.potentialAbv;
  const facts = [
    [CAT_LABEL[b.category] || 'Brew', b.style],
    b.batchLitres && ['Makes', `${b.batchLitres} L · ${bottles(b)}`],
    abv && ['Strength', `${estimated ? 'about ' : ''}${abv}% ABV`],
    b.targetOg && ['Starting gravity', Number(b.targetOg).toFixed(3)],
    b.targetFg && ['Final gravity', Number(b.targetFg).toFixed(3)],
    b.yeast && ['Yeast', b.yeast],
  ].filter(Boolean);
  const tags = [b.colour && COLOUR[b.colour], b.sweetnessTag && b.sweetnessTag[0].toUpperCase() + b.sweetnessTag.slice(1), b.acidity && `${b.acidity[0].toUpperCase()}${b.acidity.slice(1)} acidity`,
    b.fizz && (b.fizz === 'sparkling' ? 'Sparkling' : 'Still'), ...(b.flavours || []).map((f) => FLAVOUR[f])].filter(Boolean);
  const ings = (b.ingredients || []).filter((i) => i.name);
  const groups = Object.keys(STAGE).map((s) => [s, ings.filter((i) => (i.stage || 'primary') === s)]).filter(([, l]) => l.length);
  const desc = [b.style, abv && `${estimated ? '~' : ''}${abv}%`, b.batchLitres && `${b.batchLitres} L`, tags.slice(0, 4).join(', ')].filter(Boolean).join(' · ');
  const terms = glossTerms(b.summary, b.method, b.notes, b.yeast, ...(b.ingredients || []).map((i) => i.name));
  const source = b.sourceName && !/^simon'?s own$/i.test(b.sourceName) ? b.sourceName : null;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(b.name)} - homebrew recipe</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(b.name)}"><meta property="og:description" content="${esc(desc)}">
<meta name="robots" content="noindex">
<style>
  :root { --ink: #2e2b27; --muted: #6b645b; --line: #e7dccb; --accent: #d97706; --bg: #fbf7f0; --card: #fff; }
  @media (prefers-color-scheme: dark) { :root:not(.print) { --ink: #f1ece4; --muted: #b3aa9d; --line: #3a342c; --bg: #1b1814; --card: #24201b; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 28px 16px 48px; }
  .kicker { color: var(--accent); font-weight: 800; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
  h1 { font-size: 30px; line-height: 1.15; margin: 6px 0 4px; }
  .source { color: var(--muted); font-size: 13px; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0 4px; }
  .tag { border: 1px solid var(--line); border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 600; background: var(--card); }
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin: 18px 0; }
  .fact { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 8px 12px; }
  .fact b { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .1em; margin: 26px 0 8px; color: var(--accent); }
  h3 { font-size: 12px; margin: 12px 0 4px; color: var(--muted); }
  ul.ings { list-style: none; padding: 0; margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
  ul.ings li { display: flex; gap: 12px; padding: 7px 12px; border-top: 1px solid var(--line); }
  ul.ings li:first-child { border-top: 0; }
  .amt { min-width: 88px; font-weight: 700; font-variant-numeric: tabular-nums; }
  ol.method { padding-left: 22px; margin: 0; }
  ol.method li { margin: 0 0 8px; padding-left: 4px; }
  .notes { white-space: pre-line; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; }
  .pdf { display: inline-block; margin-top: 14px; padding: 8px 14px; border-radius: 10px; background: var(--accent); color: #fff; font-weight: 700; text-decoration: none; font-size: 13px; }
  .summary { font-size: 15px; background: var(--card); border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: 10px; padding: 10px 14px; margin: 14px 0 0; }
  abbr[title] { text-decoration: none; border-bottom: 1px dotted var(--accent); cursor: help; }
  .print abbr[title] { border-bottom: 0; }
  dl.terms { display: grid; gap: 6px; margin: 0; font-size: 13px; }
  dl.terms dt { display: inline; font-weight: 700; color: var(--accent); }
  dl.terms dt::after { content: ': '; }
  dl.terms dd { display: inline; margin: 0; color: var(--muted); }
  .print dl.terms div { break-inside: avoid; }
  footer { margin-top: 30px; color: var(--muted); font-size: 11px; }
  @page { size: A4; margin: 16mm 14mm; }
  html.print { --bg: #fff; }
  .print main { padding: 0; max-width: none; }
  .print li, .print .fact { break-inside: avoid; }
</style></head><body${forPdf ? ' class="print"' : ''}><main>
<div class="kicker">Homebrew recipe</div>
<h1>${esc(b.name)}</h1>
${source ? `<div class="source">From ${esc(source)}</div>` : ''}
${b.summary ? `<p class="summary">${gloss(b.summary)}</p>` : ''}
${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
<div class="facts">${facts.map(([k, v]) => `<div class="fact"><b>${esc(k)}</b>${esc(v || '')}</div>`).join('')}</div>
${groups.length ? `<h2>Ingredients</h2>${groups.map(([s, l]) => `${groups.length > 1 ? `<h3>${STAGE[s]}</h3>` : ''}<ul class="ings">${l.map((i) => `<li><span class="amt">${esc([i.amount, i.unit].filter(Boolean).join(' '))}</span><span>${gloss(i.name)}</span></li>`).join('')}</ul>`).join('')}` : ''}
${steps(b.method).length ? `<h2>Method</h2><ol class="method">${steps(b.method).map((s) => `<li>${gloss(s)}</li>`).join('')}</ol>` : ''}
${b.notes ? `<h2>Notes</h2><div class="notes">${gloss(b.notes)}</div>` : ''}
${terms.length ? `<h2>Terms in this recipe</h2><dl class="terms">${terms.map((t) => `<div><dt>${esc(t.term)}</dt><dd>${esc(t.meaning)}</dd></div>`).join('')}</dl>` : ''}
${pdfUrl ? `<a class="pdf" href="${esc(pdfUrl)}">Download as PDF</a>` : ''}
${estimated ? '<footer>Strength is an estimate from the sugar and yeast.</footer>' : ''}
</main></body></html>`;
}
// The PDF: the same page on A4, always in the light print colours.
export async function recipePdf(b) {
  const html = recipeHtml(b, { forPdf: true }).replace('<html lang="en">', '<html lang="en" class="print">');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 20000 });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const filename = `${b.name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Recipe'}.pdf`;
    return { pdf, filename };
  } finally { await browser.close(); }
}

// ---- Bottle labels (/ims/homebrew "Print labels") ----------------------------------------------------------------
// A4 sheets of 10 labels, 2 across and 5 down, touching (no gaps) inside a narrow 6 mm margin - his printer can't
// print edge to edge - with faint cut lines round each one, and a QR code to the recipe's shared page. Each label: the name (in the lettering he picks), the date, the strength,
// the main ingredients' pictures, and the header's look - the drink's colour as a wash with its faint picture over it.
const LABEL_EMOJI = { mead: '🍯', white_wine: '🥂', red_wine: '🍷', rose_wine: '🌸', fruit_veg_wine: '🫐', flower_herb_wine: '🌼', hot_pepper_wine: '🌶️', beer: '🍺', stout: '🖤', cider: '🍏', soda: '🫧' };
const asDataUri = (key) => {
  const f = key && pictureFile(key);
  try { return f && fs.existsSync(f) ? `data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}` : null; } catch (_) { return null; }
};
// The lettering for the name and strength, chosen when printing: classic wine and mead faces, and craft-beer ones.
// From Google Fonts (Playwright loads them when it makes the PDF). size: how big this face sets the name, as some
// run large (a script) or small (a condensed poster face).
export const LABEL_FONTS = [
  { id: 'playfair', label: 'Playfair Display', kind: 'wine', family: 'Playfair Display', css: 'Playfair+Display:wght@700;900', weight: 900, size: 1 },
  { id: 'cinzel', label: 'Cinzel', kind: 'wine', family: 'Cinzel', css: 'Cinzel:wght@700;900', weight: 900, size: 0.9 },
  { id: 'cormorant', label: 'Cormorant Garamond', kind: 'wine', family: 'Cormorant Garamond', css: 'Cormorant+Garamond:wght@700', weight: 700, size: 1.15 },
  { id: 'greatvibes', label: 'Great Vibes', kind: 'wine', family: 'Great Vibes', css: 'Great+Vibes', weight: 400, size: 1.45 },
  { id: 'imfell', label: 'IM Fell English', kind: 'wine', family: 'IM Fell English SC', css: 'IM+Fell+English+SC', weight: 400, size: 1.05 },
  { id: 'bebas', label: 'Bebas Neue', kind: 'beer', family: 'Bebas Neue', css: 'Bebas+Neue', weight: 400, size: 1.3 },
  { id: 'alfaslab', label: 'Alfa Slab One', kind: 'beer', family: 'Alfa Slab One', css: 'Alfa+Slab+One', weight: 400, size: 0.95 },
  { id: 'rye', label: 'Rye', kind: 'beer', family: 'Rye', css: 'Rye', weight: 400, size: 0.9 },
  { id: 'pirata', label: 'Pirata One', kind: 'beer', family: 'Pirata One', css: 'Pirata+One', weight: 400, size: 1.2 },
  { id: 'unifraktur', label: 'UnifrakturCook', kind: 'beer', family: 'UnifrakturCook', css: 'UnifrakturCook:wght@700', weight: 700, size: 1.05 },
  { id: 'abril', label: 'Abril Fatface', kind: 'beer', family: 'Abril Fatface', css: 'Abril+Fatface', weight: 400, size: 1 },
];
const ukDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
// How the name sits on the label, chosen in the Print labels window: where it goes, how big (a scale), what colour
// His own fonts for label names (uploaded in the Print labels window): kept in data/label_fonts and listed with the
// built-in ones under "Your fonts", for these labels and any later ones.
const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'label_fonts');
db.exec('CREATE TABLE IF NOT EXISTS label_fonts (id TEXT PRIMARY KEY, name TEXT NOT NULL, file TEXT NOT NULL, format TEXT NOT NULL, added_at INTEGER NOT NULL)');
const FONT_KINDS = [ // what the file's first bytes say it is
  { ext: 'ttf', format: 'truetype', mime: 'font/ttf', test: (b) => b.readUInt32BE(0) === 0x00010000 || b.toString('latin1', 0, 4) === 'true' },
  { ext: 'otf', format: 'opentype', mime: 'font/otf', test: (b) => b.toString('latin1', 0, 4) === 'OTTO' },
  { ext: 'woff', format: 'woff', mime: 'font/woff', test: (b) => b.toString('latin1', 0, 4) === 'wOFF' },
  { ext: 'woff2', format: 'woff2', mime: 'font/woff2', test: (b) => b.toString('latin1', 0, 4) === 'wOF2' },
];
const ownFont = (r) => ({ id: r.id, label: r.name, kind: 'yours', family: `IMS ${r.id}`, weight: 400, size: 1, url: `/api/homebrew/label-font/${r.id}` });
export const listLabelFonts = () => [...LABEL_FONTS, ...db.prepare('SELECT * FROM label_fonts ORDER BY added_at').all().map(ownFont)];
export function addLabelFont(buffer, name) {
  if (!buffer?.length || buffer.length < 12) throw new Error('No font file came through.');
  const kind = FONT_KINDS.find((k) => k.test(buffer));
  if (!kind) throw new Error('That isn\'t a font file IMS can use - try a .ttf, .otf, .woff or .woff2.');
  const id = `u${crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 12)}`;
  fs.mkdirSync(FONT_DIR, { recursive: true });
  fs.writeFileSync(path.join(FONT_DIR, `${id}.${kind.ext}`), buffer);
  const label = String(name || '').replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 60) || 'My font';
  db.prepare('INSERT INTO label_fonts (id, name, file, format, added_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name').run(id, label, `${id}.${kind.ext}`, kind.format, Date.now());
  return ownFont({ id, name: label });
}
export function removeLabelFont(id) {
  const r = db.prepare('SELECT file FROM label_fonts WHERE id = ?').get(String(id));
  if (!r) return false;
  try { fs.unlinkSync(path.join(FONT_DIR, r.file)); } catch (_) { /* gone */ }
  db.prepare('DELETE FROM label_fonts WHERE id = ?').run(String(id));
  return true;
}
// the file, to show the font in the window ({ file, mime } or null)
export function labelFontFile(id) {
  const r = db.prepare('SELECT file FROM label_fonts WHERE id = ?').get(String(id));
  if (!r) return null;
  const f = path.join(FONT_DIR, r.file);
  return fs.existsSync(f) ? { file: f, mime: FONT_KINDS.find((k) => r.file.endsWith(`.${k.ext}`))?.mime || 'application/octet-stream' } : null;
}
// how the name's font gets into the label page: a Google Fonts link, or his own file embedded
function fontHead(font) {
  if (font.kind !== 'yours') return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=${font.css}&display=block" rel="stylesheet">`;
  const r = db.prepare('SELECT file, format FROM label_fonts WHERE id = ?').get(font.id);
  const f = r && path.join(FONT_DIR, r.file);
  if (!f || !fs.existsSync(f)) return '';
  return `<style>@font-face { font-family: '${font.family}'; src: url(data:application/octet-stream;base64,${fs.readFileSync(f).toString('base64')}) format('${r.format}'); font-display: block; }</style>`;
}

// Borders drawn just inside the cut lines, in the border colour (the name's unless he picks another). All drawn on
// the label's own 99 x 57 mm grid, so circles and curves aren't stretched. Corner ornaments are drawn once for the
// top-left corner and mirrored into the other three.
const BORDERS = ['none', 'line', 'double', 'classic', 'vintage', 'deco', 'greek', 'scallop', 'dotted'];
const W = 99, H = 57;
const corners = (g) => `<g>${g}</g><g transform="translate(${W} 0) scale(-1 1)">${g}</g><g transform="translate(0 ${H}) scale(1 -1)">${g}</g><g transform="translate(${W} ${H}) scale(-1 -1)">${g}</g>`;
const svg = (c, body) => `<svg class="frame-svg" viewBox="0 0 ${W} ${H}" fill="none" stroke="${c}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
function borderHtml(kind, c) {
  if (kind === 'none') return '';
  if (kind === 'classic') {
    // a double frame whose corners curve inwards, with a dot in each
    const frame = (o, r, w) => `<path stroke-width="${w}" d="M${o + r} ${o} H${W - o - r} A${r} ${r} 0 0 0 ${W - o} ${o + r} V${H - o - r} A${r} ${r} 0 0 0 ${W - o - r} ${H - o} H${o + r} A${r} ${r} 0 0 0 ${o} ${H - o - r} V${o + r} A${r} ${r} 0 0 0 ${o + r} ${o} Z"/>`;
    return svg(c, `${frame(2.6, 3.4, 0.45)}${frame(4, 2.6, 0.22)}${corners(`<circle cx="3.3" cy="3.3" r="0.55" fill="${c}" stroke="none"/>`)}`);
  }
  if (kind === 'vintage') {
    // a fine double frame broken at each corner by a scroll - a spiral each way and a small leaf - and a little
    // ornament in the middle of the long edges
    const scroll = 'M15 2.6 C11 2.6 8 2.9 6.6 4.6 C5.4 6.1 6.2 8.1 7.8 7.9 C9.1 7.7 9.2 6 8.1 5.6 C7.4 5.4 6.9 6 7.2 6.5';
    const corner = `<path stroke-width="0.4" d="${scroll}"/><path stroke-width="0.4" d="${scroll}" transform="matrix(0 1 1 0 0 0)"/>
      <path stroke-width="0.3" fill="${c}" d="M5.4 5.4 Q3.2 4.6 2.4 2.4 Q4.6 3.2 5.4 5.4 Z"/><circle cx="9.6" cy="9.6" r="0.5" fill="${c}" stroke="none"/>`;
    const mid = (y, s) => `<path stroke-width="0.35" d="M${W / 2 - 7} ${y} C${W / 2 - 4} ${y} ${W / 2 - 3} ${y + s * 1.6} ${W / 2} ${y + s * 1.6} C${W / 2 + 3} ${y + s * 1.6} ${W / 2 + 4} ${y} ${W / 2 + 7} ${y}"/><circle cx="${W / 2}" cy="${y + s * 1.6}" r="0.45" fill="${c}" stroke="none"/>`;
    return svg(c, `<path stroke-width="0.4" d="M15 2.6 H${W / 2 - 7} M${W / 2 + 7} 2.6 H${W - 15} M15 ${H - 2.6} H${W / 2 - 7} M${W / 2 + 7} ${H - 2.6} H${W - 15} M2.6 15 V${H - 15} M${W - 2.6} 15 V${H - 15}"/>
      <path stroke-width="0.2" d="M11 4 H${W - 11} M11 ${H - 4} H${W - 11} M4 11 V${H - 11} M${W - 4} 11 V${H - 11}"/>
      ${mid(2.6, 1)}${mid(H - 2.6, -1)}${corners(corner)}`);
  }
  if (kind === 'deco') {
    // art deco: a fine outer line and a finer inner one, a square at each corner that the inner frame runs through,
    // a half-circle notch with a dot just along each edge from it, and a diamond break in the middle of the sides
    const o = 2.4, i = 4.6;
    const corner = `<rect x="${o}" y="${o}" width="4.6" height="4.6" stroke-width="0.4"/>
      <path stroke-width="0.4" d="M7 ${o} H9 A1.5 1.5 0 0 0 12 ${o} H14 M${o} 7 V9 A1.5 1.5 0 0 1 ${o} 12 V14"/>
      <circle cx="10.5" cy="${o + 0.55}" r="0.35" fill="${c}" stroke="none"/><circle cx="${o + 0.55}" cy="10.5" r="0.35" fill="${c}" stroke="none"/>`;
    const midY = H / 2;
    return svg(c, `<rect x="${i}" y="${i}" width="${W - 2 * i}" height="${H - 2 * i}" stroke-width="0.22"/>
      <path stroke-width="0.4" d="M14 ${o} H${W - 14} M14 ${H - o} H${W - 14} M${o} 14 V${midY - 3} M${o} ${midY + 3} V${H - 14} M${W - o} 14 V${midY - 3} M${W - o} ${midY + 3} V${H - 14}"/>
      ${[o, W - o].map((x) => `<path stroke-width="0.3" fill="${c}" d="M${x} ${midY - 1.6} L${x + 0.8} ${midY} L${x} ${midY + 1.6} L${x - 0.8} ${midY} Z"/>`).join('')}
      ${corners(corner)}`);
  }
  if (kind === 'greek') {
    // a Greek key band between two lines, with a square at each corner
    const o = 2.4, band = 3, u = 3; // band width, and roughly how long one key is
    const keys = (x0, x1, y, flip) => {
      const n = Math.max(1, Math.round((x1 - x0) / u)); const w = (x1 - x0) / n;
      const yy = (v) => (flip ? y + band - v : y + v);
      let d = '';
      for (let k = 0; k < n; k++) {
        const x = x0 + k * w;
        d += `M${x} ${yy(band * 0.85)} H${x + w * 0.8} V${yy(band * 0.15)} H${x + w * 0.2} V${yy(band * 0.6)} H${x + w * 0.55} V${yy(band * 0.4)} `;
      }
      return d;
    };
    const top = keys(o + band, W - o - band, o, false), bottom = keys(o + band, W - o - band, H - o - band, true);
    const side = (x, flip) => `<g transform="translate(${x} 0) rotate(90) translate(0 ${-band})"><path stroke-width="0.3" d="${keys(o + band, H - o - band, 0, flip)}"/></g>`;
    return svg(c, `<rect x="${o}" y="${o}" width="${W - 2 * o}" height="${H - 2 * o}" stroke-width="0.4"/><rect x="${o + band}" y="${o + band}" width="${W - 2 * (o + band)}" height="${H - 2 * (o + band)}" stroke-width="0.3"/>
      <path stroke-width="0.3" d="${top} ${bottom}"/>${side(o + band, false)}${side(W - o, true)}
      ${corners(`<rect x="${o + 0.7}" y="${o + 0.7}" width="${band - 1.4}" height="${band - 1.4}" stroke-width="0.3"/>`)}`);
  }
  if (kind === 'scallop') {
    // a line with a scalloped edge inside it
    const o = 2.6, d = 3.6; // inset, and roughly how wide one scallop is
    const run = (x0, x1, y, inward) => {
      const n = Math.max(1, Math.round((x1 - x0) / d)); const w = (x1 - x0) / n; let p = `M${x0} ${y}`;
      for (let k = 1; k <= n; k++) p += ` A${w / 2} ${w / 2} 0 0 ${inward} ${x0 + k * w} ${y}`;
      return p;
    };
    const runV = (y0, y1, x, inward) => {
      const n = Math.max(1, Math.round((y1 - y0) / d)); const h = (y1 - y0) / n; let p = `M${x} ${y0}`;
      for (let k = 1; k <= n; k++) p += ` A${h / 2} ${h / 2} 0 0 ${inward} ${x} ${y0 + k * h}`;
      return p;
    };
    const s = o + 1.3;
    return svg(c, `<rect x="${o}" y="${o}" width="${W - 2 * o}" height="${H - 2 * o}" rx="0.6" stroke-width="0.4"/>
      <path stroke-width="0.3" d="${run(s, W - s, s, 0)} ${run(s, W - s, H - s, 1)} ${runV(s, H - s, s, 1)} ${runV(s, H - s, W - s, 0)}"/>`);
  }
  return `<div class="frame ${kind}"></div>`;
}

const NAME_POSITIONS = ['top-left', 'top-center', 'middle-left', 'middle-center'];
export function labelLook(q = {}) {
  return {
    pos: NAME_POSITIONS.includes(q.pos) ? q.pos : 'top-left',
    size: Math.max(0.6, Math.min(1.8, Number(q.size) || 1)),
    colour: /^#[0-9a-f]{6}$/i.test(q.colour || '') ? q.colour : '',
    border: BORDERS.includes(q.border) ? q.border : 'none',
    borderColour: /^#[0-9a-f]{6}$/i.test(q.borderColour || '') ? q.borderColour : '', // '' = the same as the name
    borderAlpha: Math.max(0.1, Math.min(1, Number(q.borderAlpha) || 1)), // how solid the border is
    // how strongly the background picture shows (0 = not at all, just the colour wash; 0.64 as it always was)
    imageAlpha: q.imageAlpha !== undefined && q.imageAlpha !== '' && Number.isFinite(Number(q.imageAlpha)) ? Math.max(0, Math.min(1, Number(q.imageAlpha))) : 0.64,
    abvColour: /^#[0-9a-f]{6}$/i.test(q.abvColour || '') ? q.abvColour : '',
    // where he dragged the name to on the preview (mm from the label's top left - its left edge, its middle when
    // centred, its right edge when right-aligned), or none for the usual place
    x: q.x !== undefined && q.x !== '' && Number.isFinite(Number(q.x)) ? Math.max(0, Math.min(99, Number(q.x))) : null,
    y: q.y !== undefined && q.y !== '' && Number.isFinite(Number(q.y)) ? Math.max(0, Math.min(57, Number(q.y))) : null,
    recipeX: q.recipeX !== undefined && q.recipeX !== '' && Number.isFinite(Number(q.recipeX)) ? Math.max(0, Math.min(99, Number(q.recipeX))) : null,
    recipeY: q.recipeY !== undefined && q.recipeY !== '' && Number.isFinite(Number(q.recipeY)) ? Math.max(0, Math.min(57, Number(q.recipeY))) : null,
    align: ['left', 'center', 'right'].includes(q.align) ? q.align : String(q.pos || '').endsWith('center') ? 'center' : 'left',
  };
}
// The QR code for a label: a sharp black-and-white image with its quiet zone, not vector paths - viewers and printers
// drew the paths as a smeared, unreadable pattern (20 Oct)
export async function labelQr(url) {
  if (!url) return '';
  const QRCode = (await import('qrcode')).default;
  return `<img src="${await QRCode.toDataURL(url, { margin: 2, scale: 10, errorCorrectionLevel: 'L', color: { dark: '#000000', light: '#ffffff' } })}" alt="">`;
}

// title: a name just for these labels (e.g. "Simon's Christmas Mead") - the recipe's own name then goes under it.
// qrHtml: the QR code (labelQr). look: labelLook. preview: just one label, for the window's live preview.
export function labelsHtml(b, { count = 10, fontId, title, recipeText, showRecipe = true, qrHtml = '', look = labelLook(), preview = false } = {}) {
  const own = String(title || '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join('\n').slice(0, 100);
  const heading = own || b.name;
  const flat = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const isShowRecipe = showRecipe !== false && showRecipe !== 'false' && showRecipe !== '0';
  let under = '';
  if (isShowRecipe) {
    if (recipeText !== undefined) {
      under = String(recipeText || '').trim().slice(0, 100);
    } else {
      under = own && flat(own) !== flat(b.name) ? b.name : '';
    }
  }
  const font = listLabelFonts().find((f) => f.id === fontId) || LABEL_FONTS[0];
  const n = preview ? 1 : Math.max(1, Math.min(200, Math.round(Number(count)) || 10));
  const colour = /^#[0-9a-f]{6}$/i.test(b.liquid || '') ? b.liquid : '#e8a33a';
  const nameColour = look.colour || '#2e2b27';
  const lightName = parseInt(nameColour.slice(1, 3), 16) * 0.3 + parseInt(nameColour.slice(3, 5), 16) * 0.59 + parseInt(nameColour.slice(5, 7), 16) * 0.11 > 170;
  const halo = lightName ? 'rgba(0,0,0,0.55)' : '#fff'; // a soft glow behind the name so it reads over the photo
  const placed = look.x !== null && look.y !== null; // dragged to a spot of his own
  const recipePlaced = look.recipeX !== null && look.recipeY !== null;
  const abvColour = look.abvColour || colour;
  const vpos = placed ? 'top' : look.pos.split('-')[0];
  const align = look.align;
  const banner = asDataUri(b.banner);
  const pics = (b.mainPics || []).map((p) => ({ name: p.name, src: asDataUri(p.key) })).filter((p) => p.src).slice(0, 3);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  const [dateWord, date] = b.bottledOn ? ['Bottled', b.bottledOn] : b.startedOn ? ['Brewed', b.startedOn] : ['Made', today];
  const abv = b.calc?.abv || b.calc?.potentialAbv || b.abvEstimate;
  const estimated = !b.calc?.abv && !b.calc?.potentialAbv;
  const label = `<div class="label">
    ${banner && look.imageAlpha > 0 ? `<img class="bg" src="${banner}" alt="">` : ''}
    ${look.border !== 'none' ? `<div class="border-wrap" style="opacity: ${look.borderAlpha}">${borderHtml(look.border, look.borderColour || nameColour)}</div>` : ''}
    ${qrHtml ? `<div class="qr">${qrHtml}</div>` : ''}
    <div class="body">
      <div class="head">
        <div class="name">${esc(heading).replace(/\n/g, '<br>')}</div>
        ${under && !recipePlaced ? `<div class="under">${esc(under)}</div>` : ''}
      </div>
      ${under && recipePlaced ? `<div class="under placed">${esc(under)}</div>` : ''}
      <div class="foot">
        <div class="facts">${abv ? `<div class="abv">${estimated ? '~' : ''}${esc(abv)}<small>% ABV</small></div>` : ''}<div class="date">${dateWord} ${esc(ukDate(date))}</div></div>
        <div class="pics">${pics.map((p) => `<img src="${p.src}" alt="${esc(p.name)}">`).join('')}</div>
      </div>
    </div>
  </div>`;
  const sheets = [];
  if (preview) sheets.push(`<section class="one">${label}</section>`);
  else for (let s = 0; s < Math.ceil(n / 10); s++) {
    const here = Math.min(10, n - s * 10);
    sheets.push(`<section class="sheet">${Array.from({ length: 10 }, (_, i) => (i < here ? label : '<div class="label blank"></div>')).join('')}</section>`);
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(heading)} labels</title>
${fontHead(font)}<style>
@page { size: A4; margin: 6mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #2e2b27; }
/* 210 x 297 less the 6 mm margin: 198 x 285 mm, so each label is 99 x 57 mm */
.sheet { width: 198mm; height: 285mm; display: grid; grid-template-columns: repeat(2, 99mm); grid-template-rows: repeat(5, 57mm); page-break-after: always; break-after: page; overflow: hidden; }
.sheet:last-child { page-break-after: auto; break-after: auto; }
.one { width: 99mm; height: 57mm; display: grid; }
${preview ? 'html, body { width: 99mm; height: 57mm; overflow: hidden; background: #fff; }' : ''}
.label { position: relative; overflow: hidden; outline: 0.2mm dashed rgba(0,0,0,0.18); outline-offset: -0.1mm;
  background: linear-gradient(135deg, ${colour}38, ${colour}14 55%, #fff 100%); }
.label.blank { background: none; }
.bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: right; opacity: ${look.imageAlpha}; mix-blend-mode: multiply;
  -webkit-mask-image: linear-gradient(to right, rgba(0,0,0,0.35), #000 60%); mask-image: linear-gradient(to right, rgba(0,0,0,0.35), #000 60%); }
.body { position: relative; height: 100%; padding: 5mm 6mm 4.5mm; display: flex; flex-direction: column; }
.head { text-align: ${align}; ${vpos === 'middle' ? 'margin: auto 0;' : ''} ${qrHtml && !placed ? (align === 'center' ? 'padding: 0 13.5mm;' : 'padding-right: 13.5mm;') : ''} }
${placed ? `.head { position: absolute; z-index: 1; left: ${look.x}mm; top: ${look.y}mm; width: max-content; max-width: ${(align === 'center' ? 2 * Math.min(look.x, 99 - look.x) : align === 'right' ? look.x - 2 : 99 - look.x - 2).toFixed(1)}mm; ${align === 'center' ? 'transform: translateX(-50%);' : align === 'right' ? 'transform: translateX(-100%);' : ''} }` : ''}
.name { font-family: '${font.family}', Georgia, serif; font-size: ${(19 * font.size * look.size).toFixed(1)}pt; font-weight: ${font.weight}; line-height: 1.2; padding: 0.22em 0.3em; margin: -0.22em -0.3em; color: ${nameColour};
  text-shadow: 0 0 1.2mm ${halo}, 0 0 0.6mm ${halo}; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.under { margin-top: 1mm; font-style: italic; font-size: 9.5pt; color: ${lightName ? nameColour : '#3f3a33'}; text-shadow: 0 0 0.8mm ${halo}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
${recipePlaced ? `.under.placed { position: absolute; z-index: 2; left: ${look.recipeX}mm; top: ${look.recipeY}mm; margin: 0; max-width: 88mm; }` : ''}
.border-wrap { position: absolute; inset: 0; pointer-events: none; }
.frame { position: absolute; inset: 2.6mm; pointer-events: none; }
.frame.line { border: 0.35mm solid ${look.borderColour || nameColour}; border-radius: 0.6mm; }
.frame.double { border: 1.1mm double ${look.borderColour || nameColour}; border-radius: 0.6mm; }
.frame.dotted { border: 0.55mm dotted ${look.borderColour || nameColour}; border-radius: 0.6mm; }
.frame-svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.curl { position: absolute; width: 7mm; height: 7mm; pointer-events: none; }
.curl.tl { top: 1.6mm; left: 1.6mm; } .curl.tr { top: 1.6mm; right: 1.6mm; transform: scaleX(-1); }
.curl.bl { bottom: 1.6mm; left: 1.6mm; transform: scaleY(-1); } .curl.br { bottom: 1.6mm; right: 1.6mm; transform: scale(-1, -1); }
${look.border !== 'none' ? '.body { padding: 7mm 8.5mm 7mm; }' : ''}
.qr { position: absolute; top: ${look.border !== 'none' ? '5.6mm' : '3mm'}; right: ${look.border !== 'none' ? '5.6mm' : '3mm'}; width: 12mm; height: 12mm; background: #fff; border-radius: 1mm; overflow: hidden; }
.qr img { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
.foot { margin-top: ${vpos === 'middle' ? '0' : 'auto'}; display: flex; align-items: flex-end; justify-content: space-between; gap: 3mm; }
/* the strength, date and pictures always sit at the bottom - a long or big name can't push them off the label */
.foot { position: absolute; left: ${look.border !== 'none' ? '8.5mm' : '6mm'}; right: ${look.border !== 'none' ? '8.5mm' : '6mm'}; bottom: ${look.border !== 'none' ? '7mm' : '4.5mm'}; margin: 0; }
.abv { font-family: '${font.family}', Georgia, serif; font-size: ${(22 * Math.min(font.size, 1.2)).toFixed(1)}pt; font-weight: ${font.weight}; line-height: 1; color: ${abvColour}; text-shadow: 0 0 0.6mm #fff; }
.abv small { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 8pt; font-weight: 800; color: #2e2b27; margin-left: 0.8mm; }
.date { margin-top: 1.2mm; font-size: 8pt; font-weight: 600; color: #3f3a33; text-shadow: 0 0 0.8mm #fff; }
.pics { display: flex; gap: 1.6mm; }
.pics img { width: 14mm; height: 14mm; border-radius: 50%; object-fit: cover; border: 0.6mm solid #fff; box-shadow: 0 0.3mm 0.8mm rgba(0,0,0,0.25); }
</style></head><body>${sheets.join('')}</body></html>`;
}
// The PDF of label sheets (opts as for labelsHtml, plus qrUrl: the recipe's shared page for the QR code)
export async function labelsPdf(b, { qrUrl, ...opts } = {}) {
  const qrHtml = await labelQr(qrUrl);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(labelsHtml(b, { ...opts, qrHtml }), { waitUntil: 'networkidle', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready); // the label font, before the PDF is made
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    return { pdf, filename: `${(String(opts.title || '').trim() || b.name).replace(/[\/:*?"<>|]+/g, '').trim() || 'Brew'} labels.pdf` };
  } finally { await browser.close(); }
}
