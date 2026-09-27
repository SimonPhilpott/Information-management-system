import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCampaign, chronicleStatus, rollLine } from '../campaignsService.js';
import { artFile } from './chronicleArt.js';
import { getCardData } from '../decksService.js';

// The Chronicle as a PDF: the same book as on the campaign page - title page, index, a chapter per
// scenario and the tale last - set on A5 parchment pages. Chromium lays it out: each chapter starts on
// a fresh page and runs on to the next when it's long, and the index is filled in with the page each
// chapter actually starts on (Roman, as the Elven font has no digits).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT = path.resolve(__dirname, '../../../../public/fonts/elvencommonspeak.ttf');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function roman(n) {
  const t = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let s = '';
  for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
  return s;
}

function bookHtml(c, chron, heroes) {
  const font = fs.existsSync(FONT) ? `url(data:font/ttf;base64,${fs.readFileSync(FONT).toString('base64')}) format('truetype')` : 'local("Georgia")';
  // a chapter's plate, embedded (the page's /chronicle-art/<key> url names the file)
  const plate = (n) => {
    const key = String(chron.art?.[n] || '').split('/').pop();
    const f = key && artFile(key);
    return f && fs.existsSync(f) ? `data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}` : null;
  };
  const chapters = (chron.order || []).filter((n) => chron.chapters?.[n]).map((n, i) => ({ label: `Chapter ${roman(i + 1).toUpperCase()}`, title: chron.chapters[n].title, sub: n, paragraphs: chron.chapters[n].paragraphs || [], art: plate(n) }));
  if (c.epilogue?.story) chapters.push({ label: 'The Last Chapter', title: c.epilogue.title || 'The Tale Entire', paragraphs: c.epilogue.story.split(/\n+/).filter(Boolean), art: plate('__tale') });
  if (chron.fallen?.length) chapters.push({ label: 'In Memoriam', title: 'The Roll of the Fallen', paragraphs: chron.fallen.map(rollLine) });
  const kind = (c.kind || '').replace(/\s*(saga|campaign|cycle)$/i, '');
  const INK = '#3a2410';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&display=block">
<style>
  @font-face { font-family: 'Elven Common Speak'; src: ${font}; }
  @page { size: 148mm 210mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { color: ${INK}; font-family: 'IM Fell English', Georgia, serif; font-size: 11.2pt; line-height: 1.5; }
  section.page {
    width: 148mm; height: 210mm; position: relative; overflow: hidden; break-after: page; page-break-after: always;
    background:
      radial-gradient(ellipse at 12% 8%, rgba(120,80,30,.16), transparent 40%),
      radial-gradient(ellipse at 88% 94%, rgba(110,70,25,.22), transparent 45%),
      radial-gradient(ellipse at 70% 30%, rgba(160,120,60,.08), transparent 30%),
      radial-gradient(circle at 24% 72%, rgba(90,60,20,.07) 0 2.5%, transparent 3.5%),
      linear-gradient(180deg, #efdcae, #e8d19c 55%, #e2c68c);
    box-shadow: inset 0 0 22mm rgba(95,60,20,.42), inset 0 0 4mm rgba(70,40,10,.4);
  }
  section.page:last-child { break-after: auto; page-break-after: auto; }
  .body { position: absolute; top: 11mm; left: 16mm; right: 16mm; bottom: 20mm; padding-top: 6mm; overflow: hidden; }
  .folio { position: absolute; bottom: 9mm; left: 0; right: 0; text-align: center; font-size: 10pt; opacity: .7; letter-spacing: .2em; }
  .elven { font-family: 'Elven Common Speak', 'IM Fell English', serif; -webkit-text-stroke: .5px ${INK}; line-height: 1.1; }
  .label { text-align: center; letter-spacing: .3em; text-transform: uppercase; font-size: 8.5pt; opacity: .7; }
  .ct { font-size: 25pt; text-align: center; margin-top: 2mm; }
  .rule { text-align: center; opacity: .55; letter-spacing: .4em; margin: 2mm 0 4mm; }
  .rule.tight { margin-bottom: .5mm; }
  .sub { text-align: center; font-style: italic; font-size: 13pt; line-height: 1.3; opacity: .55; margin-bottom: 4mm; }
  p { margin: 0 0 .6em; text-align: justify; hyphens: auto; text-indent: 1.3em; orphans: 1; widows: 1; }
  p.first, p.cont { text-indent: 0; }
  p.first::first-letter { font-family: 'Elven Common Speak', serif; float: left; font-size: 3.3em; line-height: .85; padding: .06em .08em 0 0; color: #6b1d0e; -webkit-text-stroke: .5px #6b1d0e; }
  .title { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; text-align: center; padding: 0 14mm; }
  .idx { display: flex; align-items: baseline; gap: 2mm; margin-bottom: 3mm; font-size: 11pt; }
  .plate { position: absolute; inset: 14mm 12mm 22mm; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .plate img { max-width: 100%; max-height: 92%; object-fit: contain; mix-blend-mode: multiply; -webkit-mask-image: radial-gradient(ellipse 58% 58% at center, #000 58%, transparent 100%); mask-image: radial-gradient(ellipse 58% 58% at center, #000 58%, transparent 100%); }
  .plate .cap { font-style: italic; opacity: .75; margin-top: 4mm; text-align: center; }
  .idx .isub { display: block; font-style: italic; font-size: 9pt; line-height: 1.25; opacity: .55; }
  .idx .dots { flex: 1; border-bottom: 1px dotted ${INK}; opacity: .4; transform: translateY(-1mm); }
</style></head><body>
<section class="page"><div class="title">
  <div style="letter-spacing:.35em;text-transform:uppercase;font-size:8.5pt;opacity:.7">Here beginneth the Chronicle of</div>
  <div class="elven" style="font-size:40pt;margin:8mm 0 6mm;-webkit-text-stroke:1px ${INK}">${esc(c.name)}</div>
  <div class="rule">~ &#10086; ~</div>
  ${kind ? `<div style="font-style:italic;font-size:13pt">being a tale of ${esc(kind)}</div>` : ''}
  ${heroes.length ? `<div style="font-size:10.5pt;margin-top:6mm;opacity:.85">as it befell ${esc(heroes.slice(0, -1).join(', '))}${heroes.length > 1 ? ' and ' : ''}${esc(heroes[heroes.length - 1])}, and those who walked with them</div>` : ''}
  <div style="margin-top:14mm;font-size:9pt;font-style:italic;opacity:.6">set down by the chronicler, from the telling of those who were there</div>
</div></section>
<section class="page"><div class="body">
  <div class="elven" style="font-size:25pt;text-align:center;line-height:1.35">Index</div>
  <div class="rule">~ &#10086; ~</div>
  <div id="index">${chapters.length ? '' : '<p class="first" style="font-style:italic;text-align:center">The pages are yet blank. The road goes ever on.</p>'}</div>
</div></section>
<script id="data" type="application/json">${JSON.stringify(chapters).replace(/</g, '\\u003c')}</script>
<script>
  ${roman.toString()}
  window.paginate = function () {
    const chapters = JSON.parse(document.getElementById('data').textContent);
    const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const newPage = () => { const s = document.createElement('section'); s.className = 'page'; const b = document.createElement('div'); b.className = 'body'; s.appendChild(b); document.body.appendChild(s); return b; };
    const over = (b) => b.scrollHeight > b.clientHeight + 1;
    const starts = [];
    for (const ch of chapters) {
      if (ch.art) {
        // the chapter's plate on its own page before it
        const s = document.createElement('section'); s.className = 'page';
        s.innerHTML = '<div class="plate"><img src="' + ch.art + '"><div class="cap">' + esc(ch.title) + '</div></div>';
        document.body.appendChild(s);
      }
      let body = newPage();
      starts.push(document.querySelectorAll('section.page').length);
      body.innerHTML = '<div class="label">' + esc(ch.label) + '</div><div class="elven ct">' + esc(ch.title) + '</div>' + (ch.sub ? '<div class="rule tight">~ \\u2766 ~</div><div class="sub">' + esc(ch.sub) + '</div>' : '<div class="rule">~ \\u2766 ~</div>');
      ch.paragraphs.forEach((text, k) => {
        let p = document.createElement('p'); if (k === 0) p.className = 'first'; body.appendChild(p);
        let words = [];
        for (const w of text.split(/\\s+/)) {
          words.push(w); p.textContent = words.join(' ');
          if (over(body)) {
            words.pop(); p.textContent = words.join(' ');
            if (!words.length) p.remove();
            body = newPage(); p = document.createElement('p'); p.className = 'cont'; body.appendChild(p);
            words = [w]; p.textContent = w;
          }
        }
      });
    }
    document.getElementById('index').innerHTML = chapters.map((ch, i) =>
      '<div class="idx"><span style="min-width:3em;opacity:.75">' + (ch.label.startsWith('Chapter') ? ch.label.slice(8) + '.' : ch.label === 'In Memoriam' ? '&#10013;' : 'Last') + '</span><span style="max-width:62%">' + esc(ch.title) + (ch.sub ? '<span class="isub">' + esc(ch.sub) + '</span>' : '') + '</span><span class="dots"></span><span style="opacity:.75">' + roman(starts[i]) + '</span></div>').join('');
    document.querySelectorAll('section.page').forEach((s, i) => { const f = document.createElement('div'); f.className = 'folio'; f.textContent = roman(i + 1); s.appendChild(f); });
    window.__done = true;
  };
</script></body></html>`;
}

// Arkham Horror's chronicle as a PDF: the investigators' case file - typewritten on lined paper, a
// handwritten margin note on each entry, the photographs taped in with old sticky tape, a stamped title page.
function caseFileHtml(c, chron, heroes) {
  const photo = (n) => {
    const key = String(chron.art?.[n] || '').split('/').pop();
    const f = key && artFile(key);
    return f && fs.existsSync(f) ? `data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}` : null;
  };
  const entries = (chron.order || []).filter((n) => chron.chapters?.[n]).map((n, i) => ({ label: `Case File No. ${i + 1}`, title: chron.chapters[n].title, sub: n, note: chron.chapters[n].summary || '', paragraphs: chron.chapters[n].paragraphs || [], art: photo(n) }));
  if (c.epilogue?.story) entries.push({ label: 'The Closing Report', title: c.epilogue.title || 'The Affair Entire', paragraphs: c.epilogue.story.split(/\n+/).filter(Boolean), art: photo('__tale') });
  if (chron.fallen?.length) entries.push({ label: 'The Lost', title: 'Investigators Lost to the Mythos', paragraphs: chron.fallen.map(rollLine), roll: true });
  const INK = '#26221e';
  const paper = `radial-gradient(circle at 84% 88%, transparent 0 9mm, rgba(120,75,30,.16) 9.3mm 10.2mm, transparent 10.5mm),
      radial-gradient(ellipse at 10% 6%, rgba(120,90,40,.14), transparent 40%), radial-gradient(ellipse at 90% 96%, rgba(110,80,35,.18), transparent 45%),
      repeating-linear-gradient(180deg, transparent 0 7mm, rgba(70,105,150,.14) 7mm 7.25mm),
      linear-gradient(90deg, transparent 0 13mm, rgba(190,60,60,.25) 13mm 13.3mm, transparent 13.3mm),
      linear-gradient(180deg, #f2ead5, #e9dfc4)`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Special+Elite&family=Reenie+Beanie&display=block">
<style>
  @page { size: 148mm 210mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { color: ${INK}; font-family: 'Special Elite', 'Courier New', monospace; font-size: 10pt; line-height: 1.55; }
  section.page { width: 148mm; height: 210mm; position: relative; overflow: hidden; break-after: page; page-break-after: always; background: ${paper}; box-shadow: inset 0 0 14mm rgba(90,70,40,.3); }
  section.page:last-child { break-after: auto; page-break-after: auto; }
  .body { position: absolute; top: 12mm; left: 17mm; right: 13mm; bottom: 19mm; overflow: hidden; }
  .folio { position: absolute; bottom: 8mm; left: 0; right: 0; text-align: center; font-size: 9pt; opacity: .7; }
  .label { letter-spacing: .2em; text-transform: uppercase; font-size: 8pt; opacity: .7; }
  .ct { font-size: 15pt; text-transform: uppercase; letter-spacing: .04em; line-height: 1.2; margin-top: 1mm; }
  .sub { font-size: 9pt; opacity: .7; margin: .5mm 0 1.5mm; }
  .line { border-bottom: 1.2px solid rgba(40,35,30,.55); margin: 0 0 3mm; }
  .note { font-family: 'Reenie Beanie', cursive; color: #1f3f8f; font-size: 15pt; line-height: 1.05; transform: rotate(-1.5deg); margin: 0 5mm 4mm 7mm; }
  p { margin: 0 0 .8em; text-align: left; }
  .stamp { display: inline-block; border: 3px double #a3261d; color: #a3261d; letter-spacing: .25em; padding: 1.5mm 4mm; text-transform: uppercase; opacity: .72; transform: rotate(-11deg); font-size: 14pt; }
  .title { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; padding: 0 16mm 0 19mm; }
  .photo { position: absolute; inset: 20mm 14mm 26mm; display: flex; align-items: center; justify-content: center; }
  .print { position: relative; background: #fbf8ef; padding: 3mm 3mm 10mm; box-shadow: 0 2mm 5mm rgba(0,0,0,.35); transform: rotate(-2deg); max-width: 100%; }
  .print img { display: block; max-width: 100%; max-height: 138mm; filter: sepia(.25) contrast(1.05); }
  .print .cap { position: absolute; left: 3mm; right: 3mm; bottom: 1.2mm; text-align: center; font-family: 'Reenie Beanie', cursive; font-size: 14pt; color: #2c2c33; }
  .tape { position: absolute; width: 26mm; height: 8mm; z-index: 3; background: linear-gradient(180deg, rgba(255,250,215,.10), rgba(255,248,205,.24) 45%, rgba(236,220,160,.30)), repeating-linear-gradient(93deg, rgba(120,100,50,.05) 0 2px, transparent 2px 7px), radial-gradient(ellipse at 30% 60%, rgba(120,95,40,.16), transparent 55%), radial-gradient(ellipse at 80% 30%, rgba(255,255,255,.35), transparent 40%), rgba(238,226,170,.42); clip-path: polygon(0% 8%, 3% 0%, 6% 10%, 9% 2%, 12% 9%, 15% 1%, 18% 6%, 82% 4%, 85% 0%, 88% 9%, 91% 2%, 94% 10%, 97% 1%, 100% 7%, 100% 93%, 97% 100%, 94% 90%, 91% 99%, 88% 91%, 85% 100%, 82% 95%, 18% 96%, 15% 100%, 12% 92%, 9% 99%, 6% 90%, 3% 100%, 0% 92%); box-shadow: inset 0 0 2mm rgba(120,95,40,.25); mix-blend-mode: multiply; }
  .tape.l { top: -3mm; left: -7mm; transform: rotate(-34deg); } .tape.r { top: -3mm; right: -7mm; transform: rotate(31deg); width: 24mm; }
  .idx { display: flex; align-items: baseline; gap: 2mm; margin-bottom: 3mm; }
  .idx .isub { display: block; font-family: 'Reenie Beanie', cursive; color: #1f3f8f; font-size: 13pt; line-height: 1; }
  .idx .dots { flex: 1; border-bottom: 1px dotted ${INK}; opacity: .4; transform: translateY(-1mm); }
</style></head><body>
<section class="page"><div class="title">
  <div style="font-size:8.5pt;letter-spacing:.25em">MISKATONIC UNIVERSITY</div>
  <div style="font-size:8.5pt;letter-spacing:.25em;opacity:.75">ORNE LIBRARY &middot; SPECIAL COLLECTIONS</div>
  <div class="line" style="margin:5mm 0"></div>
  <div style="font-size:9pt;letter-spacing:.3em;opacity:.7">CASE FILE</div>
  <div style="font-size:24pt;text-transform:uppercase;line-height:1.15;margin:2mm 0">${esc(c.name)}</div>
  ${c.kind ? `<div style="font-size:10pt;opacity:.8">Re: ${esc(c.kind)}</div>` : ''}
  <div style="margin-top:9mm"><span class="stamp">Confidential</span></div>
  ${heroes.length ? `<div class="note" style="margin:10mm 0 0">Investigators: ${esc(heroes.join(', '))} - God help them.</div>` : ''}
  <div style="margin-top:7mm;font-size:8.5pt;opacity:.6">Compiled from the investigators' own notes, police reports and newspaper clippings. Not for circulation.</div>
</div></section>
<section class="page"><div class="body">
  <div class="ct" style="font-size:14pt;letter-spacing:.1em">Contents of the file</div>
  <div class="line" style="margin:2mm 0 4mm"></div>
  <div id="index">${entries.length ? '' : '<div class="note">Nothing filed yet.</div>'}</div>
</div></section>
<script id="data" type="application/json">${JSON.stringify(entries).replace(/</g, '\\u003c')}</script>
<script>
  window.paginate = function () {
    const entries = JSON.parse(document.getElementById('data').textContent);
    const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const newPage = () => { const s = document.createElement('section'); s.className = 'page'; const b = document.createElement('div'); b.className = 'body'; s.appendChild(b); document.body.appendChild(s); return b; };
    const over = (b) => b.scrollHeight > b.clientHeight + 1;
    const clip = '<div class="tape l"></div><div class="tape r"></div>';
    const starts = [];
    for (const e of entries) {
      if (e.art) {
        const s = document.createElement('section'); s.className = 'page';
        s.innerHTML = '<div class="photo"><div class="print">' + clip + '<img src="' + e.art + '"><div class="cap">' + esc(e.title) + '</div></div></div>';
        document.body.appendChild(s);
      }
      let body = newPage();
      starts.push(document.querySelectorAll('section.page').length);
      body.innerHTML = '<div class="label">' + esc(e.label) + '</div><div class="ct">' + esc(e.title) + '</div>' + (e.sub ? '<div class="sub">Re: ' + esc(e.sub) + '</div>' : '') + '<div class="line"></div>' + (e.note ? '<div class="note">' + esc(e.note) + '</div>' : '');
      e.paragraphs.forEach((text) => {
        let p = document.createElement('p'); body.appendChild(p);
        let words = [];
        for (const w of text.split(/\\s+/)) {
          words.push(w); p.textContent = words.join(' ');
          if (over(body)) {
            words.pop(); p.textContent = words.join(' ');
            if (!words.length) p.remove();
            body = newPage(); p = document.createElement('p'); body.appendChild(p);
            words = [w]; p.textContent = w;
          }
        }
      });
    }
    document.getElementById('index').innerHTML = entries.map((e, i) =>
      '<div class="idx"><span style="min-width:3.2em;opacity:.75">' + (e.roll ? '&dagger;' : e.label.startsWith('Case') ? 'No. ' + (i + 1) : 'End') + '</span><span style="max-width:64%;text-transform:uppercase">' + esc(e.title) + (e.sub ? '<span class="isub">re: ' + esc(e.sub) + '</span>' : '') + '</span><span class="dots"></span><span style="opacity:.75">p. ' + starts[i] + '</span></div>').join('');
    document.querySelectorAll('section.page').forEach((s, i) => { const f = document.createElement('div'); f.className = 'folio'; f.textContent = String(i + 1); s.appendChild(f); });
    window.__done = true;
  };
</script></body></html>`;
}

export async function chroniclePdf(id, by) {
  const c = getCampaign(id, by);
  if (!c) { const e = new Error('Campaign not found.'); e.status = 404; throw e; }
  const chron = chronicleStatus(id, by);
  const data = await getCardData(c.game || 'lotr');
  const heroes = [...new Set(c.players.flatMap((p) => p.deckHeroes || []))].map((h) => data.byCode[h]?.name).filter(Boolean);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent((c.game === 'ahlcg' ? caseFileHtml : bookHtml)(c, chron, heroes), { waitUntil: 'networkidle', timeout: 30000 }).catch(() => { /* no Google Fonts - Georgia will do */ });
    await page.evaluate(async () => { await document.fonts.ready; window.paginate(); });
    await page.waitForFunction(() => window.__done === true, null, { timeout: 30000 });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    return { pdf, filename: c.game === 'ahlcg' ? `Case File - ${c.name}.pdf` : `The Chronicle of ${c.name}.pdf` };
  } finally { await browser.close(); }
}
