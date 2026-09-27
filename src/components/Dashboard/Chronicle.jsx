import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Download, Pencil, RefreshCw, Volume2, Pause, Square, Loader2, Lock, LockOpen, Image as ImageIcon } from 'lucide-react';

// The Chronicle: a campaign's story as an old quill-and-ink book. Closed, it's a leather cover; opened,
// page i is the campaign's title, page ii the index, and from page iii a chapter for each scenario played
// (the tale, once the campaign is won, is the last chapter). Chapters are written by the server in the
// background and rewritten when what happened there changes - another play, notable moments, boons,
// burdens or fallen heroes. Two pages to a spread on a wide screen, one at a time on a phone.

async function api(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.success === false) throw new Error(d.error || `Request failed (${res.status})`);
  return d;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Loads the chronicle, asks for any missing or out-of-date chapters to be written (players only), and
// keeps checking while the chronicler is writing. Shared by the book and the map's pop-ups.
export function useChronicle(c, edit) {
  const [chron, setChron] = useState(null);
  const [tick, setTick] = useState(0); // bumped to look again (after an edit or a rewrite)
  const sig = c ? JSON.stringify([c.scenarios, c.cards, c.players.map((p) => p.fallen)]) : '';
  useEffect(() => {
    if (!c) return undefined;
    let alive = true;
    (async () => {
      try {
        const url = `/api/decks/campaigns/${c.id}/chronicle`;
        let d = await api(url);
        let asked = 0;
        for (let i = 0; alive && i < 90; i++) {
          setChron(d);
          const making = (d.fallen || []).some((r) => !r.epitaph) || (d.order || []).some((n) => d.chapters?.[n] && !d.art?.[n]);
          if (!d.writing && !making) {
            if (!edit || !d.stale?.length || asked >= 2) break;
            asked++;
            d = await api(url, { method: 'POST' });
            continue;
          }
          if (!d.writing && edit && d.stale?.length && asked < 2) { asked++; d = await api(url, { method: 'POST' }); continue; }
          await sleep(4000);
          if (alive) d = await api(url);
        }
      } catch (_) { /* the chronicle is a nice-to-have */ }
    })();
    return () => { alive = false; };
  }, [c?.id, sig, edit, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo(() => chron && { ...chron, set: setChron, refresh: () => setTick((t) => t + 1) }, [chron]);
}

// The Elven font has letters only, so page and chapter numbers are Roman.
function roman(n) {
  const t = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let s = '';
  for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
  return s;
}

const INK = '#3a2410';
// Every page of every chronicle has the shape of a chapter page as first designed (557 x 855); a chapter
// too long for its page runs on to the next.
const PAGE_W = 557, PAGE_H = 855;
const ELVEN = '"Elven Common Speak", "IM Fell English", Georgia, serif';
const FELL = '"IM Fell English", Georgia, serif';

function useWide() {
  const q = '(min-width: 900px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

function BookStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=Special+Elite&family=Reenie+Beanie&family=Caveat:wght@500&display=swap');
      @font-face { font-family: 'Elven Common Speak'; src: url('/fonts/elvencommonspeak.ttf') format('truetype'); font-display: swap; }
      .chron-page {
        position: relative; color: ${INK}; font-family: ${FELL}; font-size: 17px; line-height: 1.6;
        padding: 44px 44px 56px; aspect-ratio: ${PAGE_W} / ${PAGE_H}; overflow: hidden; display: flex; flex-direction: column;
        background:
          radial-gradient(ellipse at 12% 8%, rgba(120,80,30,.16), transparent 40%),
          radial-gradient(ellipse at 88% 94%, rgba(110,70,25,.20), transparent 45%),
          radial-gradient(ellipse at 70% 30%, rgba(160,120,60,.08), transparent 30%),
          radial-gradient(circle at 30% 70%, rgba(90,60,20,.07) 0 3%, transparent 4%),
          linear-gradient(180deg, #efdcae, #e8d19c 55%, #e2c68c);
        box-shadow: inset 0 0 60px rgba(95,60,20,.45), inset 0 0 14px rgba(70,40,10,.35);
      }
      .chron-page.left { border-radius: 6px 2px 2px 6px; }
      .chron-page.left::after { content: ''; position: absolute; inset: 0 0 0 auto; width: 46px; background: linear-gradient(90deg, transparent, rgba(60,35,10,.28)); pointer-events: none; }
      .chron-page.right { border-radius: 2px 6px 6px 2px; }
      .chron-page.right::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 46px; background: linear-gradient(270deg, transparent, rgba(60,35,10,.28)); pointer-events: none; }
      .chron-page.single { border-radius: 6px; padding: 30px 22px 50px; font-size: 15.5px; }
      .chron-text { flex: 1; min-height: 0; overflow: hidden; }
      .chron-page p { text-align: justify; hyphens: auto; margin: 0 0 .7em; text-indent: 1.3em; }
      .chron-page p.first, .chron-page p.cont { text-indent: 0; }
      .chron-page p.cut { text-align-last: justify; margin-bottom: 0; }
      .chron-page p.first::first-letter { font-family: ${ELVEN}; float: left; font-size: 3.4em; line-height: .85; padding: .06em .08em 0 0; color: #6b1d0e; -webkit-text-stroke: .6px #6b1d0e; }
      .chron-elven { font-family: ${ELVEN}; -webkit-text-stroke: .7px ${INK}; letter-spacing: .01em; line-height: 1.1; font-weight: 700; }
      .chron-folio { position: absolute; bottom: 18px; left: 0; right: 0; text-align: center; font-size: 14px; opacity: .7; letter-spacing: .2em; }
      /* the turning leaf: two faces back to back, hinged on the spine */
      .chron-leaf { position: absolute; top: 0; bottom: 0; transform-style: preserve-3d; z-index: 4; animation-duration: .95s; animation-timing-function: cubic-bezier(.45,.05,.35,1); animation-fill-mode: forwards; }
      .chron-leaf.next { left: 50%; width: 50%; transform-origin: left center; animation-name: leafNext; }
      .chron-leaf.prev { left: 0; width: 50%; transform-origin: right center; animation-name: leafPrev; }
      .chron-leaf.out { left: 0; width: 100%; transform-origin: left center; animation-name: leafOut; animation-duration: .75s; }
      .chron-leaf.in { left: 0; width: 100%; transform-origin: left center; animation-name: leafIn; animation-duration: .75s; }
      @keyframes leafNext { 0% { transform: rotateY(0) } 50% { transform: rotateY(-90deg) translateZ(18px) } 100% { transform: rotateY(-180deg) } }
      @keyframes leafPrev { 0% { transform: rotateY(0) } 50% { transform: rotateY(90deg) translateZ(18px) } 100% { transform: rotateY(180deg) } }
      @keyframes leafOut { 0% { transform: rotateY(0); opacity: 1 } 75% { opacity: 1 } 100% { transform: rotateY(-165deg); opacity: 0 } }
      @keyframes leafIn { 0% { transform: rotateY(-165deg); opacity: 0 } 25% { opacity: 1 } 100% { transform: rotateY(0); opacity: 1 } }
      .chron-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; overflow: hidden; }
      .chron-face.back { transform: rotateY(180deg); }
      .chron-face > .chron-page { height: 100%; aspect-ratio: auto; }
      .chron-shade { position: absolute; inset: 0; pointer-events: none; opacity: 0; animation: leafShade .95s ease-in-out; background: linear-gradient(90deg, rgba(40,20,5,.55), rgba(40,20,5,.1) 60%, rgba(255,240,200,.15)); }
      .chron-leaf.prev .chron-face:not(.back) .chron-shade, .chron-leaf.next .chron-face.back .chron-shade { background: linear-gradient(270deg, rgba(40,20,5,.55), rgba(40,20,5,.1) 60%, rgba(255,240,200,.15)); }
      @keyframes leafShade { 0% { opacity: 0 } 50% { opacity: 1 } 100% { opacity: 0 } }
      /* dog-eared corners that lift under the pointer */
      .chron-corner { position: absolute; bottom: 0; width: 64px; height: 64px; z-index: 5; cursor: pointer; background: none; border: 0; padding: 0; }
      .chron-corner.r { right: 0; } .chron-corner.l { left: 0; }
      .chron-corner::after { content: ''; position: absolute; bottom: 0; width: 18px; height: 18px; transition: width .25s ease, height .25s ease; box-shadow: -2px -2px 5px rgba(60,35,10,.35); }
      .chron-corner.r::after { right: 0; background: linear-gradient(315deg, #2c1407 0 50%, #cdb07a 50%, #f1e1b8 100%); border-top-left-radius: 8px; }
      .chron-corner.l::after { left: 0; background: linear-gradient(45deg, #2c1407 0 50%, #cdb07a 50%, #f1e1b8 100%); border-top-right-radius: 8px; box-shadow: 2px -2px 5px rgba(60,35,10,.35); }
      .chron-corner:hover::after { width: 46px; height: 46px; }
      .chron-cover {
        background:
          radial-gradient(ellipse at 30% 20%, rgba(255,255,255,.07), transparent 50%),
          radial-gradient(ellipse at 80% 90%, rgba(0,0,0,.35), transparent 55%),
          repeating-linear-gradient(35deg, rgba(0,0,0,.05) 0 2px, transparent 2px 5px),
          linear-gradient(135deg, #5b2e17, #3e1d0c 60%, #2c1407);
        box-shadow: 0 14px 34px rgba(0,0,0,.45), inset 0 0 30px rgba(0,0,0,.55), inset 8px 0 0 rgba(0,0,0,.35);
      }
      /* Arkham Horror: an investigator's case notes - typewritten on lined paper, handwritten notes, clipped photographs */
      .chron-page.journal { font-family: 'Special Elite', 'Courier New', monospace; font-size: 15px; line-height: 1.6; color: #26221e;
        background:
          radial-gradient(circle at 84% 88%, transparent 0 30px, rgba(120,75,30,.16) 31px 34px, transparent 35px),
          radial-gradient(ellipse at 10% 6%, rgba(120,90,40,.14), transparent 40%),
          radial-gradient(ellipse at 90% 96%, rgba(110,80,35,.18), transparent 45%),
          repeating-linear-gradient(180deg, transparent 0 25px, rgba(70,105,150,.13) 25px 26px),
          linear-gradient(90deg, transparent 0 34px, rgba(190,60,60,.22) 34px 35px, transparent 35px),
          linear-gradient(180deg, #f2ead5, #e9dfc4);
        box-shadow: inset 0 0 44px rgba(90,70,40,.32), inset 0 0 10px rgba(60,45,25,.25); }
      .chron-page.journal.single { font-size: 14px; }
      .chron-page.journal p { text-align: left; hyphens: none; text-indent: 0; margin: 0 0 .85em; }
      .chron-page.journal p.first::first-letter { float: none; font: inherit; color: inherit; padding: 0; -webkit-text-stroke: 0; line-height: inherit; }
      .chron-page.journal .chron-elven { font-family: 'Special Elite', 'Courier New', monospace; -webkit-text-stroke: 0; text-transform: uppercase; letter-spacing: .05em; font-weight: 400; line-height: 1.2; }
      .chron-page.journal .chron-folio { font-family: 'Special Elite', monospace; letter-spacing: .1em; }
      .j-note { font-family: 'Reenie Beanie', 'Caveat', cursive; color: #1f3f8f; font-size: 1.45em; line-height: 1.05; }
      .j-stamp { display: inline-block; border: 3px double #a3261d; color: #a3261d; font-family: 'Special Elite', monospace; letter-spacing: .25em; padding: 4px 12px; text-transform: uppercase; opacity: .72; transform: rotate(-11deg); }
      .j-photo { position: relative; background: #fbf8ef; padding: 10px 10px 34px; box-shadow: 0 8px 18px rgba(0,0,0,.35); }
      .chron-cover.journal { background: radial-gradient(ellipse at 30% 20%, rgba(255,255,255,.05), transparent 50%), repeating-linear-gradient(35deg, rgba(0,0,0,.05) 0 2px, transparent 2px 5px), linear-gradient(135deg, #2c3b33, #1c2822 60%, #141d19); }
      .chron-gold { color: #e3bd62; -webkit-text-stroke: .9px #e3bd62; text-shadow: 0 1px 0 #6a4a14, 0 0 10px rgba(227,189,98,.35); }
    `}</style>
  );
}

// Pencil sketches for the case notes: an elder sign, a circled word with an arrow, a scrawled question.
const Doodle = ({ kind = 'sign', style }) => (
  <svg viewBox="0 0 100 100" style={{ position: 'absolute', width: 86, height: 86, opacity: .5, pointerEvents: 'none', ...style }} fill="none" stroke="#3b3a44" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    {kind === 'sign' && <>
      <path d="M50 12 C52 30 54 38 50 52 C46 66 48 76 50 90" /><path d="M50 52 C38 44 26 40 14 42" /><path d="M50 52 C62 44 76 42 88 44" />
      <path d="M50 52 C40 62 34 72 30 86" /><path d="M50 52 C58 62 66 72 72 86" />
      <path d="M18 30 L82 30 L30 78 L50 10 L70 78 Z" strokeWidth=".9" opacity=".7" /><circle cx="50" cy="50" r="40" strokeWidth=".8" strokeDasharray="3 4" />
    </>}
    {kind === 'circle' && <>
      <ellipse cx="42" cy="40" rx="30" ry="16" transform="rotate(-8 42 40)" /><ellipse cx="44" cy="41" rx="33" ry="19" transform="rotate(-5 44 41)" strokeWidth=".8" />
      <path d="M60 58 C70 70 76 78 86 90" /><path d="M86 90 L78 88 M86 90 L85 81" />
    </>}
    {kind === 'question' && <>
      <path d="M30 34 C30 18 58 14 62 28 C66 42 46 44 46 58" /><circle cx="46" cy="72" r="2" fill="#3b3a44" />
      <path d="M62 60 C70 62 80 58 88 50" strokeDasharray="2 3" /><path d="M16 84 C34 80 60 82 84 78" />
    </>}
  </svg>
);
const Paperclip = ({ style }) => (
  <svg viewBox="0 0 24 64" style={{ position: 'absolute', width: 22, height: 60, zIndex: 3, filter: 'drop-shadow(1px 2px 1px rgba(0,0,0,.35))', ...style }} fill="none" stroke="#8f959c" strokeWidth="2.6" strokeLinecap="round">
    <path d="M17 22 V50 A7 7 0 0 1 3 50 V12 A5 5 0 0 1 13 12 V46 A2 2 0 0 1 9 46 V20" />
  </svg>
);

const Rule = ({ tight }) => <div style={{ textAlign: 'center', opacity: .55, letterSpacing: '.4em', margin: tight ? '10px 0 2px' : '10px 0 16px' }}>~ ❦ ~</div>;
// A chapter's heading: its number, its title, and beneath the flourish the scenario it tells of.
const ChapterHead = ({ label, title, sub, journal, note }) => (journal ? (
  <>
    <div data-label="" style={{ letterSpacing: '.2em', textTransform: 'uppercase', fontSize: 12, opacity: .7 }}>{label}</div>
    <div data-title="" className="chron-elven" style={{ fontSize: 24, marginTop: 4 }}>{title}</div>
    <div data-sub="" style={{ fontSize: 13, opacity: .7, margin: '2px 0 6px', display: sub ? '' : 'none' }}>{sub ? `Re: ${sub}` : ''}</div>
    <div style={{ borderBottom: '1.5px solid rgba(40,35,30,.55)', margin: '0 0 10px' }} />
    <div data-note="" className="j-note" style={{ transform: 'rotate(-1.6deg)', margin: '0 18px 14px 26px', display: note ? '' : 'none' }}>{note}</div>
  </>
) : (
  <>
    <div data-label="" style={{ textAlign: 'center', letterSpacing: '.3em', textTransform: 'uppercase', fontSize: 13, opacity: .7 }}>{label}</div>
    <div data-title="" className="chron-elven" style={{ fontSize: 36, textAlign: 'center', marginTop: 8 }}>{title}</div>
    <Rule tight />
    <div data-sub="" style={{ textAlign: 'center', fontStyle: 'italic', fontSize: '1.2em', lineHeight: 1.3, opacity: .55, margin: '0 0 16px', display: sub ? '' : 'none' }}>{sub}</div>
    <div data-note="" style={{ display: 'none' }} />
  </>
));

// Splits each chapter into pages by laying it out in a hidden page of the real size: whole paragraphs
// while they fit, then as many words as fit, the rest running on to the next page.
function paginate(meas, chapters) {
  const text = meas.querySelector('.chron-text'), head = meas.querySelector('[data-head]'), body = meas.querySelector('[data-body]');
  const over = () => text.scrollHeight > text.clientHeight + 1;
  return chapters.map((x) => {
    const paras = x.ch ? x.ch.paragraphs : [];
    head.style.display = '';
    head.querySelector('[data-label]').textContent = x.label;
    head.querySelector('[data-title]').textContent = x.ch?.title || 'Yet to be written';
    const sub = head.querySelector('[data-sub]');
    const journal = Boolean(meas.querySelector('.journal'));
    sub.textContent = x.last || x.roll ? '' : journal ? `Re: ${x.name}` : x.name;
    sub.style.display = x.last || x.roll ? 'none' : '';
    const note = head.querySelector('[data-note]');
    if (journal) { note.textContent = x.ch?.summary || ''; note.style.display = x.ch?.summary ? '' : 'none'; }
    body.innerHTML = '';
    const chunks = [];
    let cur = [];
    paras.forEach((t, k) => {
      let words = t.split(/\s+/);
      let cls = k === 0 ? 'first' : '';
      while (words.length) {
        const el = document.createElement('p');
        if (cls) el.className = cls;
        body.appendChild(el);
        el.textContent = words.join(' ');
        if (!over()) { cur.push({ t: el.textContent, cls }); break; }
        let lo = 0, hi = words.length - 1;
        while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); el.textContent = words.slice(0, mid).join(' '); if (over()) hi = mid - 1; else lo = mid; }
        if (lo === 0 && !cur.length && head.style.display === 'none') lo = 1; // never an empty page
        if (lo > 0) cur.push({ t: words.slice(0, lo).join(' '), cls: `${cls} cut` });
        chunks.push(cur);
        cur = [];
        head.style.display = 'none';
        body.innerHTML = '';
        words = words.slice(lo);
        cls = 'cont';
      }
    });
    chunks.push(cur);
    return chunks;
  });
}

export default function Chronicle({ c, chron, byCode = {}, setC, toast = () => {} }) {
  // Arkham Horror's chronicle is an investigator's case notes; Lord of the Rings' a quill-and-ink book.
  const journal = c.game === 'ahlcg';
  const num = journal ? (n) => String(n) : roman;
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const wide = useWide();

  // The book's pages: title, index, then a chapter per scenario in the order first played.
  const chapters = useMemo(() => {
    const list = (chron?.order || []).map((name, i) => ({ name, ch: chron.chapters?.[name] || null, label: journal ? `Case File No. ${i + 1}` : `Chapter ${roman(i + 1).toUpperCase()}`, art: chron.art?.[name] || null }));
    if (c.epilogue?.story) list.push({ name: '__tale', ch: { title: c.epilogue.title || 'The Tale Entire', paragraphs: c.epilogue.story.split(/\n+/).filter(Boolean), locked: c.epilogue.locked }, label: journal ? 'The Closing Report' : 'The Last Chapter', last: true, art: chron?.art?.__tale || null });
    // Arkham's lost: investigators taken by death or madness.
    if (journal && chron?.fallen?.length) {
      list.push({ name: '__fallen', label: 'The Lost', roll: true, ch: { title: 'Investigators Lost to the Mythos', locked: true,
        paragraphs: chron.fallen.map((r) => `${r.hero}${r.traits ? ` (${r.traits.split(',')[0].trim()})` : ''} - lost ${r.place ? `at ${r.place}` : r.scenario ? `in the affair of ${r.scenario}` : 'in the course of the investigation'}. ${r.epitaph || 'The file on them is not yet closed.'}`) } });
    }
    // The Roll of the Fallen: every hero who fell, where, and their epitaph.
    if (!journal && chron?.fallen?.length) {
      list.push({ name: '__fallen', label: 'In Memoriam', roll: true, ch: { title: 'The Roll of the Fallen', locked: true,
        paragraphs: chron.fallen.map((r) => `${r.hero}${r.traits ? ` the ${r.traits.split(',')[0].trim()}` : ''}, who fell ${r.place ? `in ${r.place}` : r.scenario ? `upon the road at ${r.scenario}` : 'upon the road'}. ${r.epitaph || 'Their lament is yet being written.'}`) } });
    }
    return list;
  }, [chron, c.epilogue, journal]);

  // Lay the chapters out at the page's real width (again when the book is resized or the fonts arrive).
  const gridRef = useRef(null), measRef = useRef(null);
  const [gridW, setGridW] = useState(0);
  const [split, setSplit] = useState(null);
  const pageW = wide ? gridW / 2 : gridW;
  useLayoutEffect(() => {
    if (!open || !gridRef.current) return undefined;
    const ro = new ResizeObserver(([e]) => setGridW(Math.round(e.contentRect.width)));
    ro.observe(gridRef.current);
    return () => ro.disconnect();
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !pageW || !measRef.current) return undefined;
    let alive = true;
    const run = () => { if (alive && measRef.current) setSplit({ w: pageW, chunks: paginate(measRef.current, chapters) }); };
    run();
    document.fonts?.ready.then(run);
    return () => { alive = false; };
  }, [open, pageW, chapters]);

  const { pages, starts } = useMemo(() => {
    const out = [{ kind: 'title' }, { kind: 'index' }], st = [];
    chapters.forEach((x, i) => {
      const chunks = split?.chunks?.[i] || [(x.ch?.paragraphs || []).map((t, k) => ({ t, cls: k ? '' : 'first' }))];
      if (x.art && x.ch) {
        if (wide && out.length % 2 === 1) out.push({ kind: 'blank' });
        out.push({ kind: 'plate', ...x });
      }
      st.push(out.length);
      chunks.forEach((paras, k) => out.push({ kind: 'chapter', ...x, paras, head: k === 0, end: k === chunks.length - 1 }));
    });
    return { pages: out, starts: st };
  }, [chapters, split, wide]);

  const step = wide ? 2 : 1;
  const at = Math.min(page - (page % step), Math.max(0, pages.length - 1));
  // Turning a page: a two-sided leaf hinged on the spine swings across while the spread it reveals sits
  // underneath, as a real book does. Jumping from the index turns one leaf straight to that spread.
  const [flip, setFlip] = useState(null); // { dir: 'next' | 'prev', to }
  const [touchX, setTouchX] = useState(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const go = (p) => {
    const t = Math.max(0, Math.min(pages.length - 1, p));
    const to = t - (t % step);
    if (to === at || flip) return;
    if (reduced) { setPage(to); return; }
    setFlip({ dir: to > at ? 'next' : 'prev', to });
  };
  const landed = () => { if (flip) { setPage(flip.to); setFlip(null); } };
  const heroes = [...new Set(c.players.flatMap((p) => p.deckHeroes || []))].map((h) => byCode[h]?.name).filter(Boolean);
  const kind = (c.kind || '').replace(/\s*(saga|campaign|cycle)$/i, '');
  const writing = chron?.writing;

  // The chapter on the open spread (the one that starts there, else the one running on): the one the
  // reading, editing and rewriting buttons act on.
  const shown = [pages[at], wide ? pages[at + 1] : null].filter((p) => (p?.kind === 'chapter' || p?.kind === 'plate') && p.ch);
  const current = (shown.find((p) => p.head) || shown[0]) || null;

  // Read aloud by the Narrator: the reading is made on the server when the chapter is written, then plays.
  const audio = useRef(null);
  const [voice, setVoice] = useState(null); // { chapter, state: 'preparing' | 'playing' | 'paused' }
  const stopReading = () => { audio.current?.pause(); audio.current = null; setVoice(null); };
  useEffect(() => () => audio.current?.pause(), []);
  useEffect(() => { if (!open) stopReading(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const readAloud = async (x, fresh = false) => {
    stopReading();
    setVoice({ chapter: x.name, state: 'preparing' });
    try {
      if (fresh) await api(`/api/decks/campaigns/${c.id}/chronicle/voice/new-take`, { method: 'POST', body: { chapter: x.name } });
      let d;
      for (let i = 0; i < 80; i++) {
        d = await api(`/api/decks/campaigns/${c.id}/chronicle/voice`, { method: 'POST', body: { chapter: x.name } });
        if (d.ready) break;
        await sleep(4000);
      }
      if (!d?.ready) throw new Error('The narrator is taking too long - try again in a minute.');
      const a = new Audio(d.url);
      audio.current = a;
      a.onended = () => { if (audio.current === a) { audio.current = null; setVoice(null); } };
      await a.play();
      setVoice({ chapter: x.name, state: 'playing' });
    } catch (err) { setVoice(null); toast(err.message, 'error'); }
  };
  const togglePause = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) { a.play(); setVoice((v) => v && { ...v, state: 'playing' }); } else { a.pause(); setVoice((v) => v && { ...v, state: 'paused' }); }
  };

  // Editing a chapter by hand, and having it written afresh.
  const [editing, setEditing] = useState(null); // { chapter, label, title, summary, text, tale }
  const [busy, setBusy] = useState(false);
  const reloadCampaign = async () => { if (setC) { try { const d = await api(`/api/decks/campaigns/${c.id}`); setC(d.campaign); } catch (_) { /* next load */ } } };
  // A fresh title from the chronicler, for the chapter as it now reads (kept only if the edit is saved).
  const [titling, setTitling] = useState(false);
  const newTitle = async () => {
    setTitling(true);
    try {
      const d = await api(`/api/decks/campaigns/${c.id}/chronicle/title`, { method: 'POST', body: { chapter: editing.chapter, title: editing.title, text: editing.text } });
      setEditing((e) => e && { ...e, title: d.title });
    } catch (err) { toast(err.message, 'error'); } finally { setTitling(false); }
  };
  const saveEdit = async () => {
    setBusy(true);
    try {
      const d = await api(`/api/decks/campaigns/${c.id}/chronicle/chapter`, { method: 'PUT', body: { chapter: editing.chapter, title: editing.title, summary: editing.summary, paragraphs: editing.text } });
      chron?.set?.(d);
      if (editing.tale) await reloadCampaign();
      setEditing(null);
      toast('Chapter saved.');
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const toggleLock = async (x) => {
    try {
      const d = await api(`/api/decks/campaigns/${c.id}/chronicle/lock`, { method: 'PUT', body: { chapter: x.name, locked: !x.ch.locked } });
      chron?.set?.(d);
      if (x.name === '__tale') await reloadCampaign();
      toast(x.ch.locked ? 'Chapter unlocked.' : 'Chapter locked - it stays exactly as it is.');
    } catch (err) { toast(err.message, 'error'); }
  };
  const [painting, setPainting] = useState(null);
  const [artEdit, setArtEdit] = useState(null);
  const [editMode, setEditMode] = useState(false); // 'Edit the book': shows the editing controls // { chapter, title, prompt } - the picture's description being edited
  const newPicture = async (x, prompt) => {
    setPainting(x.name);
    try {
      let d = await api(`/api/decks/campaigns/${c.id}/chronicle/art/new-take`, { method: 'POST', body: { chapter: x.name, prompt } });
      chron?.set?.(d);
      for (let i = 0; i < 30 && !d.art?.[x.name]; i++) { await sleep(3000); d = await api(`/api/decks/campaigns/${c.id}/chronicle`); }
      chron?.set?.(d);
      if (!d.art?.[x.name]) toast('The picture is taking a while - it will appear when it is ready.');
    } catch (err) { toast(err.message, 'error'); } finally { setPainting(null); }
  };
  const rewrite = async (x) => {
    if (!window.confirm(`Have the chronicler write "${x.ch?.title || x.label}" afresh? The chapter as it stands${x.ch?.edited || c.epilogue?.edited ? ', including any hand edits,' : ''} will be replaced.`)) return;
    try {
      const d = await api(`/api/decks/campaigns/${c.id}/chronicle/rewrite`, { method: 'POST', body: { chapter: x.name } });
      if (x.name === '__tale') {
        toast('The chronicler is rewriting the tale...');
        for (let i = 0; i < 60; i++) { await sleep(4000); const e = await api(`/api/decks/campaigns/${c.id}/epilogue`); if (!e.writing) break; }
        await reloadCampaign();
      } else { chron?.set?.(d); chron?.refresh?.(); toast('The chronicler is rewriting the chapter...'); }
    } catch (err) { toast(err.message, 'error'); }
  };

  if (!open && journal) {
    const count = (chron?.order || []).length;
    return (
      <button onClick={() => { setOpen(true); setPage(0); setFlip(null); }} className="w-full rounded-xl text-left relative overflow-hidden" title="Open the case file"
        style={{ padding: '30px 28px 26px', minHeight: 160, background: 'radial-gradient(ellipse at 20% 10%, rgba(255,255,255,.25), transparent 50%), radial-gradient(circle at 88% 80%, transparent 0 26px, rgba(110,70,25,.2) 27px 30px, transparent 31px), linear-gradient(170deg, #dcc08a, #c9a766 70%, #b8945a)', boxShadow: '0 12px 30px rgba(0,0,0,.4), inset 0 0 30px rgba(90,60,20,.3)', fontFamily: "'Special Elite', monospace", color: '#2b2419' }}>
        <BookStyles />
        <div style={{ position: 'absolute', top: 0, left: 36, width: 150, height: 14, background: '#caa865', borderRadius: '0 0 8px 8px', boxShadow: 'inset 0 -2px 3px rgba(0,0,0,.15)' }} />
        <div className="relative flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-[14rem]">
            <div style={{ fontSize: 11, letterSpacing: '.3em', opacity: .75 }}>MISKATONIC UNIVERSITY · ORNE LIBRARY</div>
            <div style={{ background: '#f4ecd6', display: 'inline-block', padding: '8px 14px', margin: '10px 0 6px', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transform: 'rotate(-.6deg)' }}>
              <div style={{ fontSize: 11, letterSpacing: '.25em', opacity: .7 }}>CASE FILE</div>
              <div style={{ fontSize: 'clamp(20px, 3.4vw, 28px)', textTransform: 'uppercase' }}>{c.name}</div>
            </div>
            <div className="j-note" style={{ fontSize: 20 }}>{writing ? 'still being typed up...' : count ? `${count} entr${count === 1 ? 'y' : 'ies'} - click to open the file` : 'nothing filed yet - click to open'}</div>
          </div>
          <span className="j-stamp" style={{ fontSize: 18, marginTop: 14 }}>Confidential</span>
        </div>
      </button>
    );
  }
  if (!open) {
    return (
      <button onClick={() => { setOpen(true); setPage(0); setFlip(null); }} className="chron-cover w-full rounded-xl text-left relative overflow-hidden" style={{ padding: '26px 28px', minHeight: 150 }} title="Open the chronicle">
        <BookStyles />
        <div style={{ position: 'absolute', inset: 10, border: '1.5px solid rgba(227,189,98,.55)', borderRadius: 8, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 15, border: '.8px solid rgba(227,189,98,.3)', borderRadius: 6, pointerEvents: 'none' }} />
        <div className="relative text-center">
          <div style={{ fontFamily: FELL, color: '#d8b56a', fontSize: 13, letterSpacing: '.35em', textTransform: 'uppercase', opacity: .85 }}>The Chronicle of</div>
          <div className="chron-gold" style={{ fontFamily: ELVEN, fontSize: 'clamp(30px, 6vw, 48px)', lineHeight: 1.15, margin: '6px 0' }}>{c.name}</div>
          <div style={{ fontFamily: FELL, fontStyle: 'italic', color: '#cfae6a', fontSize: 14 }}>
            {writing ? 'The chronicler\'s quill is moving...' : `${(chron?.order || []).length ? `${roman((chron?.order || []).length).toUpperCase()} chapter${(chron?.order || []).length === 1 ? '' : 's'} written` : 'No chapter yet written'} · click to open the book`}
          </div>
        </div>
      </button>
    );
  }

  // side: 'left' | 'right' on a spread, 'single' on a phone.
  const renderPage = (i, side) => {
    const pg = pages[i];
    const cls = `chron-page ${side}${journal ? ' journal' : ''}`;
    if ((!pg || pg.kind === 'blank') && journal) {
      return (
        <div className={cls} key={`blank-${i}`}>
          <Doodle kind="sign" style={{ top: '30%', left: '30%', width: 140, height: 140, opacity: .35 }} />
          <div className="j-note" style={{ position: 'absolute', bottom: 70, left: 40, right: 40, textAlign: 'center', opacity: .6 }}>...the rest of the pages are blank. For now.</div>
        </div>
      );
    }
    if (!pg || pg.kind === 'blank') {
      return (
        <div className={cls} key={`blank-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ fontStyle: 'italic', opacity: .45, fontSize: 16 }}>
            <div style={{ letterSpacing: '.4em' }}>~ ❦ ~</div>
            <div style={{ marginTop: 10 }}>The road goes ever on and on...</div>
          </div>
        </div>
      );
    }
    const folio = <div className="chron-folio">{num(i + 1)}</div>;
    const redo = c.canEdit && editMode && !pg.ch?.locked && pg.kind === 'plate' && (
      <button className="absolute top-3 right-3 p-2 rounded-full z-[6]" style={{ background: 'rgba(60,30,12,.85)', color: '#e3bd62' }} disabled={painting === pg.name}
        onClick={() => setArtEdit({ chapter: pg.name, title: pg.ch.title, prompt: chron?.artBrief?.[pg.name] || '' })} title="Take a new photograph - and say what should change">
        <RefreshCw size={15} className={painting === pg.name ? 'animate-spin' : ''} /></button>
    );
    // Arkham: a photograph clipped into the notes, with a scrawled caption
    if (pg.kind === 'plate' && journal) {
      return (
        <div className={cls} key={i} style={{ justifyContent: 'center', alignItems: 'center' }}>
          {redo}
          <div className="j-photo" style={{ transform: `rotate(${(i % 2 ? 1.8 : -2.4)}deg)`, maxWidth: '86%' }}>
            <Paperclip style={{ top: -22, left: '30%', transform: 'rotate(-8deg)' }} />
            <img src={pg.art} alt="" style={{ display: 'block', maxWidth: '100%', maxHeight: '58vh', filter: 'sepia(.25) contrast(1.05)' }} />
            <div className="j-note" style={{ position: 'absolute', left: 12, right: 12, bottom: 4, fontSize: 19, color: '#2c2c33', textAlign: 'center' }}>{pg.ch.title}</div>
          </div>
          <Doodle kind="circle" style={{ bottom: 40, right: 26, width: 70, height: 70, opacity: .35 }} />
          {folio}
        </div>
      );
    }
    if (pg.kind === 'title' && journal) {
      return (
        <div className={cls} key={i} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 12, letterSpacing: '.25em' }}>MISKATONIC UNIVERSITY</div>
          <div style={{ fontSize: 12, letterSpacing: '.25em', opacity: .75 }}>ORNE LIBRARY · SPECIAL COLLECTIONS</div>
          <div style={{ borderBottom: '1.5px solid rgba(40,35,30,.55)', margin: '14px 0' }} />
          <div style={{ fontSize: 13, letterSpacing: '.3em', opacity: .7 }}>CASE FILE</div>
          <div className="chron-elven" style={{ fontSize: 'clamp(26px, 4vw, 40px)', margin: '8px 0 6px' }}>{c.name}</div>
          {c.kind && <div style={{ fontSize: 14, opacity: .8 }}>Re: {c.kind}</div>}
          <div style={{ marginTop: 26 }}><span className="j-stamp" style={{ fontSize: 20 }}>Confidential</span></div>
          {heroes.length > 0 && <div className="j-note" style={{ marginTop: 30, transform: 'rotate(-1.5deg)' }}>Investigators: {heroes.join(', ')} - God help them.</div>}
          <div style={{ marginTop: 22, fontSize: 12, opacity: .6 }}>Compiled from the investigators' own notes, police reports and newspaper clippings. Not for circulation.</div>
          <Doodle kind="sign" style={{ bottom: 40, right: 30 }} />
          {folio}
        </div>
      );
    }
    if (pg.kind === 'index' && journal) {
      return (
        <div className={cls} key={i}>
          <div className="chron-elven" style={{ fontSize: 22, letterSpacing: '.12em' }}>Contents of the file</div>
          <div style={{ borderBottom: '1.5px solid rgba(40,35,30,.55)', margin: '8px 0 14px' }} />
          {!chapters.length && <p className="j-note" style={{ fontSize: 22 }}>Nothing filed yet.</p>}
          <div className="flex flex-col gap-2.5">
            {chapters.map((x, j) => (
              <button key={x.name} onClick={() => go(starts[j])} className="text-left flex items-baseline gap-2 hover:underline" style={{ fontFamily: "'Special Elite', monospace", color: '#26221e', fontSize: 14.5 }}>
                <span style={{ minWidth: '3.4em', opacity: .75 }}>{x.roll ? '†' : x.last ? 'End' : `No. ${j + 1}`}</span>
                <span className="flex-1">
                  <span style={{ display: 'block', textTransform: 'uppercase', opacity: x.ch ? 1 : .6 }}>{x.ch?.title || 'being typed up...'}</span>
                  {!x.last && !x.roll && <span className="j-note" style={{ display: 'block', fontSize: 17 }}>re: {x.name}</span>}
                </span>
                <span style={{ flex: '0 1 22%', borderBottom: '1px dotted #26221e', opacity: .4, transform: 'translateY(-4px)' }} />
                <span style={{ opacity: .75 }}>p. {starts[j] + 1}</span>
              </button>
            ))}
          </div>
          {writing && <p className="j-note" style={{ marginTop: 22, fontSize: 20 }}>More is being typed up...</p>}
          <Doodle kind="question" style={{ bottom: 44, right: 30 }} />
          {folio}
        </div>
      );
    }
    if (pg.kind === 'plate') {
      return (
        <div className={cls} key={i} style={{ justifyContent: 'center', alignItems: 'center' }}>
          {c.canEdit && editMode && !pg.ch?.locked && (
            <button className="absolute top-3 right-3 p-2 rounded-full z-[6]" style={{ background: 'rgba(60,30,12,.85)', color: '#e3bd62' }} disabled={painting === pg.name}
              onClick={() => setArtEdit({ chapter: pg.name, title: pg.ch.title, prompt: chron?.artBrief?.[pg.name] || '' })} title="Paint a new picture - and say what should change">
              <RefreshCw size={15} className={painting === pg.name ? 'animate-spin' : ''} /></button>
          )}
          <img src={pg.art} alt="" style={{ maxWidth: '100%', maxHeight: '86%', objectFit: 'contain', mixBlendMode: 'multiply', WebkitMaskImage: 'radial-gradient(ellipse 58% 58% at center, #000 58%, transparent 100%)', maskImage: 'radial-gradient(ellipse 58% 58% at center, #000 58%, transparent 100%)' }} />
          <div style={{ fontStyle: 'italic', textAlign: 'center', marginTop: 12, opacity: .75 }}>{pg.ch.title}</div>
          {folio}
        </div>
      );
    }
    if (pg.kind === 'title') {
      return (
        <div className={cls} key={i} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ letterSpacing: '.35em', textTransform: 'uppercase', fontSize: 13, opacity: .7 }}>Here beginneth the Chronicle of</div>
          <div className="chron-elven" style={{ fontSize: 'clamp(46px, 7vw, 76px)', margin: '22px 0 18px', WebkitTextStroke: `1.6px ${INK}` }}>{c.name}</div>
          <Rule />
          {kind && <div style={{ fontStyle: 'italic', fontSize: 19 }}>being a tale of {kind}</div>}
          {heroes.length > 0 && <div style={{ fontSize: 15, marginTop: 18, opacity: .85 }}>as it befell {heroes.slice(0, -1).join(', ')}{heroes.length > 1 ? ' and ' : ''}{heroes[heroes.length - 1]}, and those who walked with them</div>}
          <div style={{ marginTop: 40, fontSize: 13, fontStyle: 'italic', opacity: .6 }}>set down by the chronicler, from the telling of those who were there</div>
          {folio}
        </div>
      );
    }
    if (pg.kind === 'index') {
      return (
        <div className={cls} key={i}>
          <div className="chron-elven" style={{ fontSize: 36, textAlign: 'center', paddingTop: 4 }}>Index</div>
          <Rule />
          {!chapters.length && <p className="first" style={{ fontStyle: 'italic', textAlign: 'center' }}>The pages are yet blank. The road goes ever on.</p>}
          <div className="flex flex-col gap-2.5">
            {chapters.map((x, j) => (
              <button key={x.name} onClick={() => go(starts[j])} className="text-left flex items-baseline gap-2 hover:underline" style={{ fontFamily: FELL, color: INK, fontSize: 16 }}>
                <span style={{ minWidth: '3.2em', opacity: .75 }}>{x.roll ? '✝' : x.last ? 'Last' : `${roman(j + 1).toUpperCase()}.`}</span>
                <span className="flex-1">
                  <span style={{ display: 'block', fontStyle: x.ch ? 'normal' : 'italic', opacity: x.ch ? 1 : .6 }}>{x.ch?.title || 'being written...'}</span>
                  {!x.last && !x.roll && <span style={{ display: 'block', fontStyle: 'italic', fontSize: 13.5, lineHeight: 1.25, opacity: .55 }}>{x.name}</span>}
                </span>
                <span style={{ flex: '0 1 30%', borderBottom: `1px dotted ${INK}`, opacity: .4, transform: 'translateY(-4px)' }} />
                <span style={{ opacity: .75 }}>{roman(starts[j] + 1)}</span>
              </button>
            ))}
          </div>
          {writing && <p className="first" style={{ fontStyle: 'italic', textAlign: 'center', marginTop: 22, opacity: .7 }}>The chronicler's quill is moving...</p>}
          {folio}
        </div>
      );
    }
    return (
      <div className={cls} key={i}>
        <div className="chron-text">
          {pg.head && <ChapterHead journal={journal} note={pg.ch?.summary} label={pg.label} title={pg.ch?.title || 'Yet to be written'} sub={pg.last || pg.roll ? '' : pg.name} />}
          {pg.ch ? pg.paras.map((x, k) => <p key={k} className={x.cls}>{x.t}</p>)
            : <p className="first" style={{ fontStyle: 'italic', textAlign: 'center' }}>{journal ? 'Still being typed up...' : 'The ink is still wet upon this page; the chronicler is setting down what befell here.'}</p>}
        </div>
        {journal && pg.head && <Doodle kind={i % 3 === 0 ? 'circle' : i % 3 === 1 ? 'question' : 'sign'} style={{ top: 10, right: 12, width: 58, height: 58, opacity: .4 }} />}
        {pg.end && chron?.stale?.includes(pg.name) && pg.ch && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 38, fontStyle: 'italic', fontSize: 12.5, textAlign: 'center', opacity: .6 }}>New tidings have come; the chronicler will amend this chapter.</div>}
        {pg.end && chron?.outdated?.includes(pg.name) && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 38, padding: '0 30px', fontStyle: 'italic', fontSize: 12.5, textAlign: 'center', opacity: .6 }}>New tidings have come since this page was written by hand - rewrite it to have them told.</div>}
        {folio}
      </div>
    );
  };

  // What lies still beneath the turning leaf, and what's printed on each side of the leaf.
  let under, leaf = null;
  if (wide) {
    under = [renderPage(flip?.dir === 'prev' ? flip.to : at, 'left'), renderPage(flip?.dir === 'next' ? flip.to + 1 : at + 1, 'right')];
    if (flip?.dir === 'next') leaf = { cls: 'chron-leaf next', front: renderPage(at + 1, 'right'), back: renderPage(flip.to, 'left') };
    if (flip?.dir === 'prev') leaf = { cls: 'chron-leaf prev', front: renderPage(at, 'left'), back: renderPage(flip.to + 1, 'right') };
  } else {
    under = [renderPage(flip?.dir === 'next' ? flip.to : at, 'single')];
    if (flip?.dir === 'next') leaf = { cls: 'chron-leaf out', front: renderPage(at, 'single'), back: <div className="chron-page single" /> };
    if (flip?.dir === 'prev') leaf = { cls: 'chron-leaf in', front: renderPage(flip.to, 'single'), back: <div className="chron-page single" /> };
  }
  const canBack = at > 0, canOn = at + step < pages.length;

  const btn = 'p-2 rounded-full disabled:opacity-25';
  const btnStyle = { background: 'rgba(60,30,12,.85)', color: '#e3bd62' };
  return (
    <div className={`chron-cover rounded-xl${journal ? ' journal' : ''}`} style={{ padding: wide ? '18px 18px 14px' : '10px 8px 12px' }}>
      <BookStyles />
      <div lang="en" className="relative" style={{ perspective: '2600px' }}
        onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
        onTouchEnd={(e) => { if (touchX === null) return; const dx = e.changedTouches[0].clientX - touchX; setTouchX(null); if (dx < -50 && canOn) go(at + step); if (dx > 50 && canBack) go(at - step); }}>
        <div ref={gridRef} className={`grid ${wide ? 'grid-cols-2' : 'grid-cols-1'}`}>{under}</div>
        {/* a hidden page of the real size, for laying out the chapters */}
        <div ref={measRef} aria-hidden="true" style={{ position: 'fixed', left: -20000, top: 0, width: pageW || 1, visibility: 'hidden', pointerEvents: 'none' }}>
          <div className={`chron-page ${wide ? 'left' : 'single'}${journal ? ' journal' : ''}`}>
            <div className="chron-text"><div data-head=""><ChapterHead journal={journal} note="" label="" title="" /></div><div data-body="" /></div>
          </div>
        </div>
        {leaf && (
          <div className={leaf.cls} onAnimationEnd={(e) => { if (e.target === e.currentTarget) landed(); }}>
            <div className="chron-face">{leaf.front}<div className="chron-shade" /></div>
            <div className="chron-face back">{leaf.back}<div className="chron-shade" /></div>
          </div>
        )}
        {/* the page corners lift under the pointer - click one to turn */}
        {!flip && canBack && <button className="chron-corner l" onClick={() => go(at - step)} title="Turn back" aria-label="Turn back" />}
        {!flip && canOn && <button className="chron-corner r" onClick={() => go(at + step)} title="Turn the page" aria-label="Turn the page" />}
      </div>
      {current && (
        <div className="flex flex-wrap items-center gap-2 mt-3 px-1" style={{ fontFamily: journal ? "'Special Elite', monospace" : FELL, color: '#d8b56a' }}>
          <span className="italic text-sm flex-1 min-w-[10rem] truncate">{current.label}: {current.ch.title}</span>
          {voice?.chapter === current.name ? (
            voice.state === 'preparing'
              ? <span className="flex items-center gap-2 text-sm italic"><Loader2 size={15} className="animate-spin" /> The narrator is clearing his throat... (a minute or so if the chapter is new)</span>
              : <>
                  <button className="px-3 py-1.5 rounded-full text-sm flex items-center gap-1.5" style={btnStyle} onClick={togglePause}>{voice.state === 'paused' ? <><Volume2 size={15} /> Carry on</> : <><Pause size={15} /> Pause</>}</button>
                  <button className="px-3 py-1.5 rounded-full text-sm flex items-center gap-1.5" style={btnStyle} onClick={stopReading}><Square size={13} /> Stop</button>
                </>
          ) : <button className="px-3 py-1.5 rounded-full text-sm flex items-center gap-1.5" style={btnStyle} onClick={() => readAloud(current)} title="The narrator reads this chapter aloud"><Volume2 size={15} /> Narrator</button>}
          {c.canEdit && editMode && !current.roll && <button className="p-2 rounded-full" style={btnStyle} onClick={() => toggleLock(current)}
            title={current.ch.locked ? 'Locked - no edits or rewrites. Click to unlock.' : 'Lock this chapter against edits and rewrites'} aria-label={current.ch.locked ? 'Unlock chapter' : 'Lock chapter'}>
            {current.ch.locked ? <Lock size={15} /> : <LockOpen size={15} style={{ opacity: .6 }} />}</button>}
          {c.canEdit && editMode && !current.ch.locked && <>
            <button className="px-3 py-1.5 rounded-full text-sm flex items-center gap-1.5" style={btnStyle} title="Edit this chapter's words"
              onClick={() => setEditing({ chapter: current.name, label: current.label, title: current.ch.title, summary: current.ch.summary || '', text: current.ch.paragraphs.join('\n\n'), tale: current.name === '__tale' })}><Pencil size={14} /> Edit text</button>
            <button className="px-3 py-1.5 rounded-full text-sm flex items-center gap-1.5" style={btnStyle} title="Have the chronicler write this chapter afresh" onClick={() => rewrite(current)}><RefreshCw size={14} /> Rewrite</button>
          </>}
        </div>
      )}
      {artEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: 'rgba(0,0,0,.6)' }} onClick={() => setArtEdit(null)}>
          <div className="chron-page single w-full max-w-2xl flex flex-col gap-2" style={{ aspectRatio: 'auto', maxHeight: '92vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ textAlign: 'center', letterSpacing: '.3em', textTransform: 'uppercase', fontSize: 13, opacity: .7 }}>A new picture for {artEdit.title}</div>
            <label className="text-sm flex-1 flex flex-col">What the picture shows <span style={{ opacity: .6 }}>(change anything - who's there, what they're doing, the place, the time of day, the mood)</span>
              <textarea autoFocus className="w-full mt-1 px-3 py-2 rounded-lg bg-white/50 border border-[#3a2410]/30 outline-none flex-1" rows={12} style={{ fontFamily: FELL, fontSize: 15.5, lineHeight: 1.5 }}
                value={artEdit.prompt} onChange={(e) => setArtEdit({ ...artEdit, prompt: e.target.value })} />
            </label>
            <p className="text-xs italic" style={{ opacity: .65, textIndent: 0 }}>The ink-drawing style is always kept. Your description is remembered for this chapter's pictures from now on.</p>
            <div className="flex gap-2 justify-end">
              <button className="px-4 py-2 rounded-full text-sm" style={btnStyle} onClick={() => setArtEdit(null)}>Cancel</button>
              <button className="px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2" style={{ ...btnStyle, background: '#6b1d0e', color: '#f4e4bc' }} disabled={!artEdit.prompt.trim()}
                onClick={() => { const x = chapters.find((y) => y.name === artEdit.chapter); const p = artEdit.prompt; setArtEdit(null); if (x) newPicture(x, p); }}><ImageIcon size={15} /> Paint the new picture</button>
            </div>
          </div>
        </div>
      )}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: 'rgba(0,0,0,.6)' }} onClick={() => !busy && setEditing(null)}>
          <div className="chron-page single w-full max-w-2xl flex flex-col gap-2" style={{ aspectRatio: 'auto', maxHeight: '92vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ textAlign: 'center', letterSpacing: '.3em', textTransform: 'uppercase', fontSize: 13, opacity: .7 }}>Editing {editing.label}</div>
            <label className="text-sm">Title
              <span className="flex items-center gap-2 mt-1">
                <input className="w-full px-3 py-2 rounded-lg bg-white/50 border border-[#3a2410]/30 outline-none" style={{ fontFamily: FELL, fontSize: 18 }} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                <button type="button" className="p-2.5 rounded-full shrink-0" style={btnStyle} disabled={titling} onClick={newTitle} title="Have the chronicler suggest a new title">
                  <RefreshCw size={16} className={titling ? 'animate-spin' : ''} /></button>
              </span>
            </label>
            {!editing.tale && <label className="text-sm">Summary <span style={{ opacity: .6 }}>(shown on the map)</span>
              <input className="w-full mt-1 px-3 py-2 rounded-lg bg-white/50 border border-[#3a2410]/30 outline-none" style={{ fontFamily: FELL }} value={editing.summary} onChange={(e) => setEditing({ ...editing, summary: e.target.value })} />
            </label>}
            <label className="text-sm flex-1 flex flex-col">The chapter <span style={{ opacity: .6 }}>(a blank line between paragraphs)</span>
              <textarea className="w-full mt-1 px-3 py-2 rounded-lg bg-white/50 border border-[#3a2410]/30 outline-none flex-1" rows={16} style={{ fontFamily: FELL, fontSize: 16, lineHeight: 1.55 }} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
            </label>
            <p className="text-xs italic" style={{ opacity: .65, textIndent: 0 }}>A chapter you've edited is kept as you wrote it - the chronicler won't rewrite it unless you press Rewrite.</p>
            <div className="flex gap-2 justify-end">
              <button className="px-4 py-2 rounded-full text-sm" style={btnStyle} disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
              <button className="px-4 py-2 rounded-full text-sm font-bold" style={{ ...btnStyle, background: '#6b1d0e', color: '#f4e4bc' }} disabled={busy} onClick={saveEdit}>{busy ? 'Saving...' : 'Save the chapter'}</button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mt-3 px-1">
        <button className={btn} style={btnStyle} disabled={!canBack || !!flip} onClick={() => go(at - step)} title="Turn back"><ChevronLeft size={18} /></button>
        <div style={{ fontFamily: FELL, color: '#d8b56a', fontStyle: 'italic', fontSize: 14 }}>
          {wide && pages[at + 1] ? `pages ${num(at + 1)} - ${num(at + 2)}` : `page ${num(at + 1)}`} of {num(pages.length)}
        </div>
        <div className="flex items-center gap-2">
          <button className={btn} style={btnStyle} disabled={!canOn || !!flip} onClick={() => go(at + step)} title="Turn the page"><ChevronRight size={18} /></button>
          {c.canEdit && <button className={btn} style={editMode ? { ...btnStyle, background: '#6b1d0e', color: '#f4e4bc' } : btnStyle} onClick={() => setEditMode(!editMode)} title={editMode ? 'Done editing' : 'Edit the book - chapters, titles, pictures and locks'} aria-pressed={editMode}><Pencil size={17} /></button>}
          <a className={btn} style={btnStyle} href={`/api/decks/campaigns/${c.id}/chronicle.pdf`} download title="Download the chronicle as a PDF"><Download size={18} /></a>
          <button className={btn} style={btnStyle} onClick={() => setOpen(false)} title="Close the book"><X size={18} /></button>
        </div>
      </div>
    </div>
  );
}
