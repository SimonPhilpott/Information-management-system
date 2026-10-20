import crypto from 'crypto';
import db from '../db/database.js';
import config from '../config.js';
import { getBrew } from './homebrewService.js';
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
