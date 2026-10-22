// Homebrew (beta): the picture chooser and the bottle-label maker, as Material sheets. Both use the same service
// endpoints as the classic portal. Label settings start from whatever was last used (in the beta, else the classic
// portal's) and are remembered under the beta's own keys, so the classic portal's settings are never changed.
import React, { useEffect, useRef, useState } from 'react';
import { BEERISH, BORDERS, bottlesOf } from './brewData';
import { Sheet, Btn, Icon, TextField, Segmented, Slider, Spinner, FilterChip } from './ui';
import { getClipboardImage } from './Admin';
import Vessel from './Vessel';

const readJSON = (k) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window: fine */ } };

// ---- Change liquid colour: the colour the drink is drawn in (its demijohn, bottles and cards). Worked out for it
// from its ingredients unless you choose one; a brew made from a recipe takes the recipe's unless it has its own ----
const DRINK_COLOURS = [
  ['Pale straw', '#e9dc8c'], ['Straw', '#e3c45a'], ['Gold', '#dfa22a'], ['Amber', '#c9771f'], ['Copper', '#a9541c'],
  ['Brown', '#6e3a17'], ['Dark brown', '#43230f'], ['Stout black', '#1e130c'], ['Cloudy cider', '#d8b25a'], ['Green-gold', '#c9c56a'],
  ['Pale pink', '#f2b8b0'], ['Rosé', '#e58a8a'], ['Ruby', '#9e1f35'], ['Red wine', '#6d1028'], ['Berry purple', '#5a1a45'], ['Orange', '#e07a22'],
];
export function LiquidSheet({ open, onClose, brew, onPicked }) {
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open && brew) { setPick(brew.liquidChoice || ''); setErr(''); } }, [open, brew?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!brew) return null;
  // what the preview shows: the colour picked here, else the worked-out one (while your own is in place, brew.liquid
  // is yours, so the worked-out one isn't known until it's saved - the preview then shows the type's colour)
  const shown = pick || (brew.liquidChoice ? null : brew.liquid) || null;
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/homebrew/${brew.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ liquidChoice: pick }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Couldn\'t change the colour.');
      onPicked(d.brew);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  // drawn full, gently clearing, whatever stage it's at
  const status = brew.isRecipe || ['planning', 'finished', 'bottled', 'dumped'].includes(brew.status) ? 'conditioning' : brew.status;
  return (
    <Sheet open={open} onClose={onClose} title="Change liquid colour"
      footer={<><Btn kind="text" onClick={onClose}>Cancel</Btn><Btn kind="filled" icon="check" busy={busy} onClick={save} disabled={(pick || '') === (brew.liquidChoice || '')}>Use this colour</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div className="liq-prev"><Vessel category={brew.category} status={status} isRecipe={false} size={80} liquid={shown || undefined} exactColour={Boolean(pick)} /></div>
          <p className="muted t-bm" style={{ margin: 0 }}>
            {brew.isRecipe ? 'The colour this drink is drawn in on its card, its page and the brews made from it.' : 'The colour this brew is drawn in on its card and page.'}
            {' '}{pick ? 'Your own colour.' : 'Worked out from its ingredients.'}
          </p>
        </div>
        <div className="liq-grid" role="radiogroup" aria-label="Drink colours">
          <button type="button" role="radio" aria-checked={!pick} className={`liq sl ${!pick ? 'on' : ''}`} onClick={() => setPick('')}>
            <span className="swatch auto" style={brew.liquidChoice || !brew.liquid ? undefined : { background: brew.liquid }} />Worked out for it
          </button>
          {DRINK_COLOURS.map(([label, hex]) => (
            <button key={hex} type="button" role="radio" aria-checked={pick === hex} className={`liq sl ${pick === hex ? 'on' : ''}`} onClick={() => setPick(hex)}>
              <span className="swatch" style={{ background: hex }} />{label}
            </button>
          ))}
          <label className={`liq sl ${pick && !DRINK_COLOURS.some(([, h]) => h === pick) ? 'on' : ''}`}>
            <input type="color" value={pick || brew.liquid || '#c9771f'} onChange={(e) => setPick(e.target.value)} aria-label="Choose any colour" />
            Any colour…
          </label>
        </div>
        {err && <p style={{ color: 'var(--error)' }}>{err}</p>}
      </div>
    </Sheet>
  );
}

// ---- Change picture: the one made for it, your own photo, or one found on Pixabay ----
export function PictureSheet({ open, onClose, brew, onPicked }) {
  const [auto, setAuto] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState(null);
  const file = useRef(null);
  useEffect(() => {
    if (!open || !brew) return;
    setErr(''); setHits(null);
    setQ(String(brew.family || brew.name || '').split(/\s+/).slice(0, 2).join(' '));
    fetch(`/api/homebrew/${brew.id}/main-ingredients`).then((r) => r.json()).then((d) => setAuto(d.banner?.ready ? d.banner.key : null)).catch(() => {});
  }, [open, brew?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!brew) return null;
  const choice = brew.bannerChoice || null;
  const pick = async (key) => {
    setBusy(key || 'auto'); setErr('');
    try {
      const res = await fetch(`/api/homebrew/${brew.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bannerChoice: key }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Couldn\'t change the picture.');
      onPicked(d.brew);
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  const upload = async (f) => {
    if (!f) return;
    setBusy('upload'); setErr('');
    try {
      const res = await fetch('/api/homebrew/picture', { method: 'POST', headers: { 'Content-Type': f.type || 'application/octet-stream' }, body: f });
      const d = await res.json();
      if (!res.ok || !d.key) throw new Error(d.error || 'Couldn\'t use that picture.');
      setUploads((u) => [...new Set([d.key, ...u])]);
      await pick(d.key);
    } catch (e) { setErr(e.message); setBusy(''); }
  };
  const pasteFromClipboard = async () => {
    setBusy('upload'); setErr('');
    try {
      if (!navigator.clipboard?.read) {
        throw new Error('Clipboard access unavailable. Press Ctrl+V directly to paste your copied image.');
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const f = new File([blob], `${brew.name || 'brew'}-pasted.png`, { type: imageType });
          await upload(f);
          return;
        }
      }
      throw new Error('No image found on your clipboard. Copy an image first, then paste or press Ctrl+V.');
    } catch (e) {
      setErr(e.name === 'NotAllowedError' ? 'Clipboard access was blocked by your browser. Press Ctrl+V directly to paste.' : (e.message || 'Couldn\'t paste picture. Try pressing Ctrl+V.'));
      setBusy('');
    }
  };

  useEffect(() => {
    if (!open || !brew) return;
    const handlePaste = (e) => {
      const f = getClipboardImage(e);
      if (f) {
        e.preventDefault();
        e.stopPropagation();
        upload(f);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [open, brew?.id]);

  const search = async () => {
    if (!q.trim()) return;
    setBusy('search'); setErr('');
    try {
      const res = await fetch(`/api/homebrew/pixabay/search?q=${encodeURIComponent(q.trim())}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Couldn\'t search for photos.');
      setHits(d.hits || []);
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  const pickHit = async (h) => {
    setBusy(`hit${h.id}`); setErr('');
    try {
      const res = await fetch('/api/homebrew/pixabay/pick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: h.url, id: h.id, credit: h.credit, page: h.page, tags: h.tags, query: q || h.tags }) });
      const d = await res.json();
      if (!res.ok || !d.key) throw new Error(d.error || 'Couldn\'t use that photo.');
      setUploads((u) => [...new Set([d.key, ...u])]);
      await pick(d.key);
    } catch (e) { setErr(e.message); setBusy(''); }
  };
  const own = [...new Set([...(choice ? [choice] : []), ...uploads])];
  return (
    <Sheet open={open} onClose={onClose} title="Change picture">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} onPaste={(e) => { const f = getClipboardImage(e); if (f) { e.preventDefault(); e.stopPropagation(); upload(f); } }}>
        <p className="muted">{brew.isRecipe ? 'Shown faintly behind this recipe\'s card and page, and on its labels.' : 'For this brew only: its card, page and labels.'}</p>
        <div className="picgrid">
          <button type="button" className={`sl ${!choice ? 'on' : ''}`} onClick={() => pick(null)} aria-pressed={!choice}>
            {auto ? <img src={`/api/homebrew/picture/${auto}`} alt="" /> : null}
            <span className="cap">Made for it</span>
            {!choice && <span className="okmark"><Icon n="check" size={18} /></span>}
            {busy === 'auto' && <span className="okmark"><Spinner size={16} /></span>}
          </button>
          {own.map((k) => (
            <button key={k} type="button" className={`sl ${choice === k ? 'on' : ''}`} onClick={() => pick(k)} aria-pressed={choice === k}>
              <img src={`/api/homebrew/picture/${k}`} alt="" />
              <span className="cap">Your picture</span>
              {choice === k && <span className="okmark"><Icon n="check" size={18} /></span>}
            </button>
          ))}
          <button type="button" className="sl" onClick={() => file.current?.click()} style={{ display: 'grid', placeItems: 'center', color: 'var(--primary)', border: '2px dashed var(--outline-var)' }}>
            {busy === 'upload' ? <Spinner /> : <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontWeight: 600 }}><Icon n="upload" />Upload a photo</span>}
          </button>
          <button type="button" className="sl" onClick={pasteFromClipboard} style={{ display: 'grid', placeItems: 'center', color: 'var(--primary)', border: '2px dashed var(--outline-var)' }}>
            {busy === 'upload' ? <Spinner /> : <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontWeight: 600 }}><Icon n="paste" />Paste picture</span>}
          </button>
        </div>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <TextField label="Find a photo" value={q} onChange={setQ} className="" onKeyDown={(e) => { if (e.key === 'Enter') search(); }} style={{ flex: 1 }} />
          <Btn kind="tonal" icon="search" busy={busy === 'search'} onClick={search} style={{ marginTop: 8 }}>Search</Btn>
        </div>
        {hits && (hits.length ? (
          <div className="picgrid">
            {hits.map((h) => (
              <button key={h.id} type="button" className="sl" onClick={() => pickHit(h)} title={h.tags}>
                <img src={h.previewUrl || h.url} alt={h.tags || ''} loading="lazy" />
                {busy === `hit${h.id}` && <span className="okmark"><Spinner size={16} /></span>}
              </button>
            ))}
          </div>
        ) : <p className="muted">No photos found for that. Try a simpler word, like honey, orchard or hops.</p>)}
        <p className="t-bs muted">Photos found here come from Pixabay. You can also paste a copied picture or click Paste picture.</p>
        {err && <p style={{ color: 'var(--error)' }}>{err}</p>}
      </div>
    </Sheet>
  );
}

const LABEL_PX = [374, 215]; // one label, 99 x 57 mm at 96 dpi
// ---- Bottle labels: a live preview drawn by the server, then a PDF of A4 sheets (10 to a sheet) ----
const COLOUR_CHOICES = (brew) => [['', 'Dark'], ['#ffffff', 'White'], ...(brew.liquid ? [[brew.liquid, 'The drink\'s']] : [])];
export function LabelsSheet({ open, onClose, brew, onDone }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  const start = () => readJSON(`hbbLabel_${brew.id}`) || readJSON(`hbLabel_${brew.id}`) || readJSON('hbbLabel_last') || readJSON('hbLabel_last') || {};
  const [s, setS] = useState(() => ({}));
  const [fonts, setFonts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [src, setSrc] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    const v = start();
    setS({
      name: v.name ?? brew.name, showRecipe: v.showRecipe ?? true, recipeText: v.recipeText ?? brew.name, font: v.font ?? '', align: v.align ?? 'left',
      place: v.place ?? null, recipePlace: v.recipePlace ?? null, size: Number(v.size ?? 1) || 1, colour: v.colour ?? '', abvColour: v.abvColour ?? '',
      frame: v.frame ?? 'none', borderColour: v.borderColour ?? '', borderAlpha: Number(v.borderAlpha ?? 1) || 1, imageAlpha: Number.isFinite(Number(v.imageAlpha)) ? Number(v.imageAlpha) : 0.64,
      bottledDate: v.bottledDate ?? brew.bottledOn ?? brew.startedOn ?? today, count: v.count ?? String(bottlesOf(brew.batchLitres, brew.category)?.n || 10),
    });
    setErr(''); setBusy(false);
    fetch('/api/homebrew/label-fonts').then((r) => r.json()).then((d) => {
      const list = d.fonts || [];
      setFonts(list);
      setS((x) => ({ ...x, font: list.some((f) => f.id === x.font) ? x.font : (list.find((f) => f.kind === (BEERISH.includes(brew.category) ? 'beer' : 'wine')) || list[0])?.id || '' }));
      list.filter((f) => f.url && !document.getElementById(`hb-font-${f.id}`)).forEach((f) => {
        const st = document.createElement('style'); st.id = `hb-font-${f.id}`;
        st.textContent = `@font-face { font-family: '${f.family}'; src: url(${f.url}); font-display: swap; }`;
        document.head.appendChild(st);
      });
      if (list.length && !document.getElementById('hb-label-fonts')) {
        const link = document.createElement('link'); link.id = 'hb-label-fonts'; link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?${list.filter((x) => x.css).map((x) => `family=${x.css}`).join('&')}&display=swap`;
        document.head.appendChild(link);
      }
    }).catch(() => setErr('Couldn\'t load the fonts.'));
  }, [open, brew.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => setS((x) => ({ ...x, [k]: v }));
  const flat = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const query = () => {
    const own = s.name?.trim() && (flat(s.name) !== flat(brew.name) || s.name.includes('\n'));
    return new URLSearchParams({
      font: s.font, pos: s.align === 'center' ? 'top-center' : 'top-left', align: s.align,
      ...(s.place ? { x: String(s.place.x), y: String(s.place.y) } : {}), ...(s.recipePlace ? { recipeX: String(s.recipePlace.x), recipeY: String(s.recipePlace.y) } : {}),
      size: String(s.size), border: s.frame, ...(s.colour ? { colour: s.colour } : {}), ...(s.abvColour ? { abvColour: s.abvColour } : {}),
      ...(s.borderColour ? { borderColour: s.borderColour } : {}), ...(s.borderAlpha < 1 ? { borderAlpha: String(s.borderAlpha) } : {}), imageAlpha: String(s.imageAlpha),
      ...(own ? { name: s.name.trim() } : {}), showRecipe: s.showRecipe ? '1' : '0', ...(s.showRecipe && s.recipeText?.trim() ? { recipeText: s.recipeText.trim() } : {}),
      ...(s.bottledDate ? { bottledDate: s.bottledDate } : {}),
    });
  };
  // redrawn a moment after the last change, and remembered
  useEffect(() => {
    if (!open || !s.font) return undefined;
    writeJSON(`hbbLabel_${brew.id}`, s); writeJSON('hbbLabel_last', s);
    const t = setTimeout(() => { setLoading(true); setSrc(`/api/homebrew/${brew.id}/labels/preview?${query()}`); }, 300);
    return () => clearTimeout(t);
  }, [open, s]); // eslint-disable-line react-hooks/exhaustive-deps
  // the preview frame, scaled to the width of its box
  const prevBox = useRef(null);
  const [prevScale, setPrevScale] = useState(1.4);
  useEffect(() => {
    const el = prevBox.current;
    if (!open || !el) return undefined;
    const fit = () => setPrevScale(el.clientWidth / LABEL_PX[0]);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, s.font !== undefined]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = Math.max(1, Math.min(200, parseInt(s.count, 10) || 10));
  const make = async () => {
    setBusy(true); setErr('');
    try {
      const q = query(); q.set('count', String(n));
      const res = await fetch(`/api/homebrew/${brew.id}/labels?${q}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Couldn\'t make the labels.');
      onDone(new File([await res.blob()], `${(s.name.replace(/\s+/g, ' ').trim() || brew.name).replace(/[\\/:*?"<>|]+/g, '').trim() || 'Brew'} labels.pdf`, { type: 'application/pdf' }), n);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const fontGroup = (kind, title) => {
    const list = fonts.filter((f) => f.kind === kind);
    if (!list.length) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 className="t-ts muted">{title}</h3>
        <div className="fontlist">
          {list.map((f) => (
            <button key={f.id} type="button" className={`sl ${s.font === f.id ? 'on' : ''}`} onClick={() => set('font')(f.id)} title={f.label} aria-pressed={s.font === f.id}
              style={{ fontFamily: `'${f.family}', Georgia, serif`, fontWeight: f.weight, fontSize: Math.round(20 * (f.size || 1)) }}>
              {(s.name || brew.name).split('\n')[0]}
            </button>
          ))}
        </div>
      </div>
    );
  };
  const colourRow = (k, label) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <h3 className="t-ts muted">{label}</h3>
      <div className="chips wrap">
        {COLOUR_CHOICES(brew).map(([v, l]) => (
          <FilterChip key={l} on={(s[k] || '') === v} onClick={() => set(k)(v)}><span className="swatch" style={{ background: v || '#2e2b27', width: 14, height: 14, marginRight: 6 }} />{l}</FilterChip>
        ))}
        <label className={`chip sl ${s[k] && !COLOUR_CHOICES(brew).some(([v]) => v === s[k]) ? 'on' : ''}`} style={{ cursor: 'pointer' }}>
          <input type="color" value={s[k] || '#2e2b27'} onChange={(e) => set(k)(e.target.value)} style={{ width: 18, height: 18, border: 0, padding: 0, background: 'none', marginRight: 6 }} aria-label={`${label}: choose a colour`} />Pick
        </label>
      </div>
    </div>
  );
  return (
    <Sheet open={open} onClose={onClose} title="Bottle labels"
      footer={<><Btn kind="text" onClick={onClose}>Cancel</Btn><Btn kind="filled" icon="print" busy={busy} onClick={make} disabled={!s.font}>Make {n} label{n === 1 ? '' : 's'}</Btn></>}>
      {s.font !== undefined && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="label-prev" aria-label="Label preview" ref={prevBox}>
            {/* the server draws the label as a web page at its real size (99 x 57 mm at 96 dpi), so it's shown in a
                frame scaled to the box - an <img> can't show a page, and showed a broken picture */}
            {src && <iframe title="Label preview" src={src} className={loading ? 'loading' : ''} onLoad={() => setLoading(false)}
              style={{ width: LABEL_PX[0], height: LABEL_PX[1], transform: `scale(${prevScale})` }} />}
            {loading && <span style={{ position: 'absolute' }}><Spinner /></span>}
          </div>
          <p className="t-bs muted">10 labels to an A4 sheet, 99 × 57 mm. {Math.ceil(n / 10)} sheet{n > 10 ? 's' : ''}.</p>
          <div className="fgrid">
            <TextField className="full" label="Name on the label" value={s.name} onChange={set('name')} />
            <TextField label="How many" type="number" inputMode="numeric" value={s.count} onChange={set('count')} help={bottlesOf(brew.batchLitres, brew.category) ? `About ${bottlesOf(brew.batchLitres, brew.category).n} bottles in this batch` : undefined} />
            <TextField label="Bottled on" type="date" value={s.bottledDate} onChange={set('bottledDate')} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <FilterChip on={s.showRecipe} onClick={() => set('showRecipe')(!s.showRecipe)}>Show a subtitle</FilterChip>
            {s.showRecipe && <TextField label="Subtitle" value={s.recipeText} onChange={set('recipeText')} style={{ flex: 1 }} />}
          </div>
          <Segmented label="Name position" value={s.align} onChange={set('align')} options={[['left', 'Left'], ['center', 'Centred']]} />
          {(s.place || s.recipePlace) && <Btn kind="text" icon="close" onClick={() => setS((x) => ({ ...x, place: null, recipePlace: null }))}>Put the name back in its usual place</Btn>}
          {fontGroup('wine', 'Classic lettering')}
          {fontGroup('beer', 'Craft lettering')}
          {fontGroup('yours', 'Your fonts')}
          <Slider label="Name size" value={s.size} onChange={set('size')} min={0.6} max={1.6} step={0.05} />
          {colourRow('colour', 'Name colour')}
          {colourRow('abvColour', 'Strength colour')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h3 className="t-ts muted">Border</h3>
            <div className="chips wrap">{BORDERS.map(([v, l]) => <FilterChip key={v} on={s.frame === v} onClick={() => set('frame')(v)}>{l}</FilterChip>)}</div>
          </div>
          {s.frame !== 'none' && colourRow('borderColour', 'Border colour')}
          {s.frame !== 'none' && <Slider label="Border strength" value={Math.round(s.borderAlpha * 100)} onChange={(v) => set('borderAlpha')(v / 100)} min={20} max={100} step={5} />}
          <Slider label="Background picture" value={Math.round(s.imageAlpha * 100)} onChange={(v) => set('imageAlpha')(v / 100)} min={0} max={100} step={2} lo="Off" hi="Full" />
          {err && <p style={{ color: 'var(--error)' }}>{err}</p>}
        </div>
      )}
    </Sheet>
  );
}
