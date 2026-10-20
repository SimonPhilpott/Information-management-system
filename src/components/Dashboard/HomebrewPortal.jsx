import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusItem } from '../../hooks/useFocusItem';
import { FlaskConical, Plus, Save, Trash2, RotateCw, Sparkles, Bell, X, Wand2, ExternalLink, Copy, ChevronUp, ChevronDown, ArrowLeft, ScrollText, Activity, Wine, Star, Heart, Share2, Send, FileDown, Link2, Printer, Image as ImageIcon, UserPlus, Users, Mail, User, Check, RefreshCw, Filter, Search, Smartphone, Columns2 } from 'lucide-react';
import PortalShell from './PortalShell';
import { glossMatches, glossTerms } from './brewGlossary';
import { useAuth } from '../../AuthGate';

// Homebrew: Simon's meads, braggots and other brews - the recipe, what happened to each batch, how it tasted as
// it aged, and insights (the flavour profile it's heading for, what to tweak, what a change would do).
const GRADIENT = 'from-amber-500 to-orange-600';
const ING_TYPES = ['honey', 'malt', 'fruit', 'spice', 'hops', 'sugar', 'acid', 'tannin', 'other'];
const ING_STAGES = ['primary', 'secondary', 'backsweeten', 'bottling'];
const KIND_LABEL = { reading: 'Reading', nutrient: 'Nutrient', degas: 'Degas', addition: 'Addition', rack: 'Racked', stabilise: 'Stabilised', backsweeten: 'Backsweetened', bottle: 'Bottled', note: 'Note' };
const when = (t) => (t ? new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const g3 = (g) => (g ? Number(g).toFixed(3) : '-');
const EMPTY_BREW = { name: '', category: 'mead', style: 'Traditional mead', sourceName: '', sourceUrl: '', status: 'planning', batchLitres: '', startedOn: '', bottledOn: '', targetOg: '', targetFg: '', og: '', fg: '', summary: '', sweetness: '', colour: '', carbonation: '', yeast: '', yeastNotes: '', nutrients: '', water: '', method: '', notes: '', ingredients: [], bannerChoice: null, liquidChoice: '' };
const PROFILE_KEYS = [['sweetness', 'Sweetness'], ['body', 'Body'], ['acidity', 'Acidity'], ['alcoholHeat', 'Alcohol heat'], ['aromaIntensity', 'Aroma'], ['tannin', 'Tannin']];

// The method as separate steps - edit, add, delete and reorder them (arrows, or drag a step by its number).
// Still kept as numbered lines ("1. ...\n2. ..."), so older brews, Ims and the insights read it as before.
const parseSteps = (method) => String(method || '').split('\n').map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim()).filter(Boolean);
const joinSteps = (steps) => steps.map((s) => s.trim()).filter(Boolean).map((s, i) => `${i + 1}. ${s}`).join('\n');

// Short summary for cards: extracts a concise, punchy descriptor from the recipe's full summary
// (skips book/author attributions like "From Craig Gravina...", extracts the core descriptor clause)
const shortSummary = (text) => {
  if (!text) return '';
  const clean = String(text).replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const safe = clean.replace(/(\d)\.(\d)/g, '$1\u2024$2');
  const rawSents = safe.match(/[^.!?]+[.!?]*/g) || [safe];
  const sents = rawSents.map((s) => s.replace(/\u2024/g, '.').trim()).filter(Boolean);
  const nonAttr = sents.filter((s) => !/^(from\s+[A-Z]|adapted\s+from|by\s+[A-Z]|recipe\s+from|source:)/i.test(s));
  const pool = nonAttr.length ? nonAttr : sents;
  let best = pool.find((s) => !/^(when I|one summer|early in my|in my early|my son|i had thought|i once|i bought|i process|i loved)/i.test(s) && /\b(bodied|flavour|flavor|taste|dry|sweet|tart|crisp|mild|ale|beer|wine|cider|mead|stout|lager|colour|color|classic|pale|strong|ferments|aroma|sparkling|rosé|rose)\b/i.test(s));
  if (!best) best = pool.find((s) => !/^(when I|one summer|early in my|my son)/i.test(s)) || pool[0];
  let out = (best || '').trim();
  if (out.length > 80) {
    const semi = out.split(/;\s*|\s+--\s+|\s+—\s+|\s+-\s+/)[0];
    if (semi && semi.length >= 25 && semi.length <= 80) {
      out = semi.trim();
    } else {
      const clause = out.split(/,\s+(?=brewed\b|exported\b|made\b|using\b|which\b|where\b|and\b|aiming\b|with\b|giving\b|producing\b|as\b|because\b)/i)[0];
      if (clause && clause.length >= 25 && clause.length <= 90) out = clause.trim();
    }
  }
  out = out.replace(/[,;:\s-]+$/, '').trim();
  if (!/[.!?]$/.test(out)) out += '.';
  return out;
};

// Small round photos of the main ingredients beside the name (the marigolds and camomile of a camomile and marigold
// mead; for beers the malts, hops or adjuncts that make it unusual). Made the first time a recipe is opened - it
// asks again every few seconds until they're ready - then kept, and shared with every recipe using the same thing.
// The same call also gives the drink's expected colour, for the demijohn.
function useMainIngredients(id) {
  const [main, setMain] = useState({ items: [], colour: null, banner: null });
  useEffect(() => {
    let stop = false, timer = null, tries = 0;
    setMain({ items: [], colour: null, banner: null });
    if (!id) return undefined;
    const load = async () => {
      try {
        const d = await (await fetch(`/api/homebrew/${id}/main-ingredients`)).json();
        if (stop) return;
        setMain({ items: d.items || [], colour: d.colour || null, banner: d.banner?.ready ? d.banner.key : null });
        if (d.pending && ++tries < 30) timer = setTimeout(load, 4000);
      } catch (_) { /* pictures are optional */ }
    };
    load();
    return () => { stop = true; clearTimeout(timer); };
  }, [id]);
  return main;
}

function MainIngredientPics({ items, isDark }) {
  const shown = items.filter((i) => i.ready);
  if (!shown.length) return null;
  return (
    <div className="flex items-center gap-2 shrink-0">
      {shown.map((i) => (
        <img key={i.key} src={`/api/homebrew/picture/${i.key}`} alt={i.name} title={i.name} loading="lazy"
          className={`w-14 h-14 rounded-full object-cover shadow-sm ring-2 ${isDark ? 'ring-slate-950/60' : 'ring-white'}`} />
      ))}
    </div>
  );
}

// The picture behind a recipe's or brew's header, card and labels: the one made for it (from its type and ingredients
// - a brew's comes from its recipe), shown first as the default, or a photo of his own. Used in the recipe form and the header's
// Change picture.
function PicturePicker({ choice, onPick, brew, isDark, border }) {
  const [uploads, setUploads] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showPixabay, setShowPixabay] = useState(false);
  const [pixabayQuery, setPixabayQuery] = useState('');
  const [pixabayResults, setPixabayResults] = useState([]);
  const [pixabayBusy, setPixabayBusy] = useState(false);
  const [pixabayErr, setPixabayErr] = useState('');
  const [pickingId, setPickingId] = useState(null);

  const own = [...new Set([...(choice ? [choice] : []), ...uploads])]; // his photo(s), and whatever he picked before

  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/homebrew/picture', { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
      const d = await res.json();
      if (!res.ok || !d.key) throw new Error(d.error || 'Couldn\'t use that picture.');
      setUploads((u) => [...new Set([d.key, ...u])]);
      onPick(d.key);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const defaultTerm = () => {
    if (brew?.name) {
      const clean = brew.name.replace(/\b(batch|recipe|no\.?\s*\d+|v\d+|#\d+)\b/gi, '').replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (clean) return clean;
    }
    return (brew?.category || 'mead').replace(/_/g, ' ');
  };

  const searchPixabay = async (q) => {
    const term = (q !== undefined ? q : pixabayQuery).trim();
    if (!term) return;
    setPixabayBusy(true); setPixabayErr('');
    try {
      const res = await fetch(`/api/homebrew/pixabay/search?q=${encodeURIComponent(term)}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Couldn\'t search Pixabay.');
      setPixabayResults(d.hits || []);
      if (!d.hits?.length) setPixabayErr(`No photos found for "${term}". Try another word like honey, hops, orchard...`);
    } catch (e) { setPixabayErr(e.message); } finally { setPixabayBusy(false); }
  };

  const pickPixabay = async (hit) => {
    setPickingId(hit.id); setPixabayErr('');
    try {
      const res = await fetch('/api/homebrew/pixabay/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: hit.url, id: hit.id, credit: hit.credit, page: hit.page, tags: hit.tags, query: pixabayQuery || hit.tags }),
      });
      const d = await res.json();
      if (!res.ok || !d.key) throw new Error(d.error || 'Couldn\'t use that photo.');
      setUploads((u) => [...new Set([d.key, ...u])]);
      onPick(d.key);
    } catch (e) { setPixabayErr(e.message); } finally { setPickingId(null); }
  };

  // Suggestion chips: category, main words in name, or ingredients
  const suggestions = Array.from(new Set([
    brew?.category ? brew.category.replace(/_/g, ' ') : null,
    ...(brew?.ingredients || []).map((i) => i.name).filter(Boolean).slice(0, 3),
    brew?.name ? brew.name.split(/\s+/).filter((w) => w.length > 3 && !/batch|recipe|traditional/i.test(w)).slice(0, 2) : [],
  ].flat().filter(Boolean))).slice(0, 4);

  const togglePixabay = () => {
    const next = !showPixabay;
    setShowPixabay(next);
    if (next && !pixabayResults.length) {
      const init = pixabayQuery || defaultTerm();
      setPixabayQuery(init);
      searchPixabay(init);
    }
  };

  const tile = (on) => `relative shrink-0 w-28 h-16 rounded-xl overflow-hidden border-2 transition ${on ? 'border-amber-500 shadow-md shadow-amber-500/20' : `${border} hover:border-amber-500/50`}`;
  const auto = brew && !brew.bannerChoice ? brew.banner : null; // what "made for it" shows now

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button type="button" onClick={() => onPick(null)} className={tile(!choice)} title={brew && !brew.isRecipe ? 'The picture of the recipe it was made from' : 'A picture made for it from its type and main ingredients'}>
          {auto ? <img src={`/api/homebrew/picture/${auto}`} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <span className={`absolute inset-0 ${isDark ? 'bg-slate-800' : 'bg-amber-50'}`} />}
          <span className="absolute inset-x-0 bottom-0 text-[10px] font-bold text-white bg-black/45 px-1.5 py-0.5 flex items-center gap-1"><Sparkles size={10} /> {brew && !brew.isRecipe ? "Its recipe's" : 'Made for it'}</span>
        </button>
        {own.map((k) => (
          <button key={k} type="button" onClick={() => onPick(k)} className={tile(choice === k)} title="Your own picture">
            <img src={`/api/homebrew/picture/${k}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 text-[10px] font-bold text-white bg-black/45 px-1.5 py-0.5">Your picture</span>
          </button>
        ))}
        <label className={`${tile(false)} cursor-pointer flex flex-col items-center justify-center gap-1 text-slate-500 hover:text-amber-500 ${isDark ? 'bg-slate-900/50' : 'bg-white/80'}`} title="Use a photo of your own">
          {busy ? <RotateCw size={16} className="animate-spin" /> : <Plus size={16} />}
          <span className="text-[10px] font-bold">Upload your own</span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <button type="button" onClick={togglePixabay} className={`${tile(showPixabay)} flex flex-col items-center justify-center gap-1 text-slate-500 hover:text-amber-500 ${isDark ? 'bg-slate-900/50' : 'bg-white/80'}`} title="Search photos on Pixabay">
          <Search size={16} className={showPixabay ? 'text-amber-500' : ''} />
          <span className="text-[10px] font-bold">Search Pixabay</span>
        </button>
      </div>
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}

      {showPixabay && (
        <div className={`mt-2 p-3 rounded-2xl border ${border} ${isDark ? 'bg-slate-900/60' : 'bg-amber-50/40'} flex flex-col gap-2.5`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <Search size={13} className="text-amber-500" />
              <span>Search Pixabay</span>
            </div>
            <div className="flex items-center gap-2">
              <a href="https://pixabay.com" target="_blank" rel="noopener noreferrer" className="text-[10px] text-slate-400 hover:text-amber-500 flex items-center gap-1">
                pixabay.com <ExternalLink size={9} />
              </a>
              <button type="button" onClick={() => setShowPixabay(false)} className="p-1 text-slate-400 hover:text-amber-500 rounded-lg">
                <X size={14} />
              </button>
            </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); searchPixabay(); }} className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={pixabayQuery}
                onChange={(e) => setPixabayQuery(e.target.value)}
                placeholder="Search photos (e.g. honey, hops, apples, vineyard)..."
                className={`w-full text-xs pl-8 pr-7 py-2 rounded-xl border ${border} outline-none focus:border-amber-500 ${isDark ? 'bg-slate-950 text-slate-100 placeholder-slate-500' : 'bg-white text-slate-900 placeholder-slate-400'}`}
              />
              {pixabayQuery && (
                <button type="button" onClick={() => setPixabayQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={12} />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={pixabayBusy || !pixabayQuery.trim()}
              className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition shrink-0 cursor-pointer"
            >
              {pixabayBusy ? <RotateCw size={13} className="animate-spin" /> : <Search size={13} />}
              <span>Search</span>
            </button>
          </form>

          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Try:</span>
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setPixabayQuery(s); searchPixabay(s); }}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${border} text-slate-500 hover:text-amber-500 hover:border-amber-500 transition capitalize ${isDark ? 'bg-slate-800/60' : 'bg-white'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {pixabayBusy && (
            <div className="flex items-center justify-center py-6 text-xs text-slate-400 gap-2">
              <RotateCw size={14} className="animate-spin text-amber-500" />
              <span>Searching Pixabay for photos...</span>
            </div>
          )}

          {pixabayErr && (
            <p className="text-xs text-amber-600 dark:text-amber-400 py-1">{pixabayErr}</p>
          )}

          {!pixabayBusy && pixabayResults.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Results ({pixabayResults.length} photos) - click a thumbnail to use as your picture
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-56 overflow-y-auto p-1">
                {pixabayResults.map((p) => {
                  const isPicking = pickingId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={Boolean(pickingId)}
                      onClick={() => pickPixabay(p)}
                      title={`Photo by ${p.credit} on Pixabay: ${p.tags}`}
                      className="group relative aspect-[16/9] rounded-xl overflow-hidden border border-black/10 dark:border-white/10 hover:border-amber-500 hover:shadow-md transition text-left cursor-pointer bg-black/5"
                    >
                      <img
                        src={p.previewUrl}
                        alt={p.tags}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                      <span className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                        {p.credit}
                      </span>
                      {isPicking && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <RotateCw size={16} className="animate-spin text-amber-400" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// The recipe form's Look: its type (as tiles, like the type cards), its picture (PicturePicker) and the drink's
// colour (worked out for it, or his own). Saved with the rest of the form (bannerChoice, liquidChoice).
function LookPicker({ form, setForm, categories, stylesFor, brew, isDark, border, label }) {
  return (
    <div className="flex flex-col gap-3 mb-4">
      {/* the type is chosen when it's created; an existing recipe or brew doesn't show it again */}
      {!brew && <div>
        <span className={label}>Type</span>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {categories.map((c) => {
            const on = form.category === c.id;
            return (
              <button key={c.id} type="button" onClick={() => setForm({ ...form, category: c.id, style: stylesFor(c.id)[0] })}
                className={`rounded-2xl border px-2 py-2.5 flex flex-col items-center gap-1 min-w-0 transition ${on ? 'border-amber-500 shadow-lg shadow-amber-500/20' : border} ${isDark ? 'bg-slate-900/50 hover:bg-slate-800/60' : 'bg-white/80 hover:bg-white'}`}>
                <span className="text-2xl leading-none">{look(c.id).emoji}</span>
                <span className="text-[11px] font-bold text-center leading-tight">{c.label}</span>
                <span className="h-1 w-8 rounded-full" style={{ background: look(c.id).liquid, opacity: on ? 1 : 0.45 }} />
              </button>
            );
          })}
        </div>
      </div>}
      <div>
        <span className={label}>Picture <span className="normal-case font-normal text-slate-500">- shown faintly behind its header and card, and on its labels</span></span>
        <PicturePicker choice={form.bannerChoice || null} onPick={(k) => setForm((f) => ({ ...f, bannerChoice: k }))} brew={brew} isDark={isDark} border={border} />
      </div>
      <div>
        <span className={label}>Drink colour <span className="normal-case font-normal text-slate-500">- the liquid in its demijohn and on its labels</span></span>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setForm({ ...form, liquidChoice: '' })}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${!form.liquidChoice ? 'border-amber-500 text-amber-600' : `${border} text-slate-500 hover:text-amber-500`}`}>
            <Sparkles size={11} /> Worked out for it
            {!form.liquidChoice && brew?.liquid ? <span className="inline-block w-3 h-3 rounded-full border border-black/10" style={{ background: brew.liquid }} /> : null}
          </button>
          <label className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${form.liquidChoice ? 'border-amber-500 text-amber-600' : `${border} text-slate-500 hover:text-amber-500`}`}>
            <input type="color" value={form.liquidChoice || brew?.liquid || look(form.category).liquid} onChange={(e) => setForm({ ...form, liquidChoice: e.target.value })} className="w-5 h-5 p-0 border-0 bg-transparent cursor-pointer" />
            {form.liquidChoice ? 'Your colour' : 'Choose your own'}
          </label>
        </div>
      </div>
    </div>
  );
}

// Change picture (the header button): the picture choices on their own, saved as soon as one is picked
function PictureDialog({ brew, isDark, border, onClose, onPicked }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (key) => {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/homebrew/${brew.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bannerChoice: key }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Couldn\'t change the picture.');
      onPicked(d.brew);
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className={`w-full max-w-3xl rounded-3xl border ${border} p-5 flex flex-col gap-3 shadow-2xl ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-[#fbf8f3] text-[#2E2B27]'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-black uppercase tracking-wider">Change picture</h2>
          {busy && <RotateCw size={14} className="animate-spin text-amber-500" />}
          <button onClick={onClose} title="Close" className="ml-auto p-1.5 rounded-lg text-slate-500 hover:text-amber-500"><X size={16} /></button>
        </div>
        <p className="text-xs text-slate-500">{brew.isRecipe ? 'Shown faintly behind this recipe\'s header and card, and on its labels.' : 'For this brew only - its header, card and labels. The recipe keeps its own picture.'}</p>
        <PicturePicker choice={brew.bannerChoice || null} onPick={pick} brew={brew} isDark={isDark} border={border} />
        {err && <p className="text-xs text-red-500">{err}</p>}
      </div>
    </div>
  );
}

// Print labels: a live preview of one label, the name to put on them (the brew's, or another just for these labels),
// where the name sits, its size and colour, a border (and its colour), the lettering - built in, or his own uploaded fonts - - classic wine and mead faces or craft-beer ones, each shown
// in its own letters - and how many (10 to an A4 sheet). The preview is the label itself, drawn by the server the same
// way as the PDF.
const BEERISH = ['beer', 'stout', 'cider', 'soda'];
const NAME_POSITIONS = [['top-left', 'Top left'], ['top-center', 'Top centre'], ['middle-left', 'Middle left'], ['middle-center', 'Middle centre']];
const BORDERS = [['none', 'None'], ['line', 'Fine line'], ['double', 'Double'], ['classic', 'Classic'], ['vintage', 'Vintage'], ['deco', 'Art deco'], ['greek', 'Greek key'], ['scallop', 'Scallop'], ['dotted', 'Dotted']];
const LABEL_PX = [374, 215]; // 99 x 57 mm at 96 dpi
const remembered = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
function LabelsDialog({ brew, isDark, border, onClose, onDone }) {
  const [fonts, setFonts] = useState([]);
  const [font, setFont] = useState(() => remembered('hbLabelFont', ''));
  const [name, setName] = useState(brew.name);
  const [pos, setPos] = useState(() => remembered('hbLabelPos', 'top-left')); // (older choice: only its alignment is used now)
  const [align, setAlign] = useState(() => remembered('hbLabelAlign', remembered('hbLabelPos', 'top-left').endsWith('center') ? 'center' : 'left'));
  const [place, setPlace] = useState(null); // { x, y } in mm once he's dragged the name, else its usual place
  const frameRef = useRef(null);
  const drag = useRef(null);
  const [size, setSize] = useState(() => Number(remembered('hbLabelSize', '1')) || 1);
  const [colour, setColour] = useState(() => remembered('hbLabelColour', '')); // '' = the usual dark
  const [frame, setFrame] = useState(() => remembered('hbLabelBorder', 'none')); // the border style
  const [borderColour, setBorderColour] = useState(() => remembered('hbLabelBorderColour', '')); // '' = the same as the name
  const [borderAlpha, setBorderAlpha] = useState(() => Number(remembered('hbLabelBorderAlpha', '1')) || 1); // how solid the border is
  const [imageAlpha, setImageAlpha] = useState(() => { const v = Number(remembered('hbLabelImageAlpha', '0.64')); return Number.isFinite(v) ? v : 0.64; }); // the background picture
  const [fontBusy, setFontBusy] = useState(false);
  const [count, setCount] = useState(() => String(bottlesOf(brew.batchLitres, brew.category)?.n || 10));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [previewSrc, setPreviewSrc] = useState('');
  const [scale, setScale] = useState(1.5);
  const box = useRef(null);
  const showOwnFonts = (list) => list.filter((f) => f.url && !document.getElementById(`hb-font-${f.id}`)).forEach((f) => {
    const st = document.createElement('style');
    st.id = `hb-font-${f.id}`;
    st.textContent = `@font-face { font-family: '${f.family}'; src: url(${f.url}); font-display: swap; }`;
    document.head.appendChild(st);
  });
  const loadFonts = () => fetch('/api/homebrew/label-fonts').then((r) => r.json()).then((d) => { const list = d.fonts || []; setFonts(list); showOwnFonts(list); return list; });
  const uploadFont = async (file) => {
    if (!file) return;
    setFontBusy(true); setErr('');
    try {
      const res = await fetch(`/api/homebrew/label-fonts?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
      const d = await res.json();
      if (!res.ok || !d.font) throw new Error(d.error || 'Couldn\'t use that font.');
      await loadFonts();
      setFont(d.font.id);
    } catch (e) { setErr(e.message); } finally { setFontBusy(false); }
  };
  const removeFont = async (f) => {
    if (!window.confirm(`Remove "${f.label}" from your fonts?`)) return;
    await fetch(`/api/homebrew/label-fonts/${f.id}`, { method: 'DELETE' }).catch(() => {});
    const list = await loadFonts();
    if (font === f.id) setFont(list[0]?.id || '');
  };
  useEffect(() => {
    fetch('/api/homebrew/label-fonts').then((r) => r.json()).then((d) => {
      const list = d.fonts || [];
      setFonts(list);
      showOwnFonts(list);
      setFont((f) => (list.some((x) => x.id === f) ? f : (list.find((x) => x.kind === (BEERISH.includes(brew.category) ? 'beer' : 'wine')) || list[0])?.id || ''));
      // the faces themselves, so each choice is shown in its own lettering
      if (list.length && !document.getElementById('hb-label-fonts')) {
        const link = document.createElement('link');
        link.id = 'hb-label-fonts'; link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?${list.filter((x) => x.css).map((x) => `family=${x.css}`).join('&')}&display=swap`;
        document.head.appendChild(link);
      }
    }).catch(() => setErr('Couldn\'t load the fonts.'));
  }, [brew.category]);
  // the preview fills the window's width
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const fit = () => setScale(el.clientWidth / LABEL_PX[0]);
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const flat = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const ownName = name.trim() && flat(name) !== flat(brew.name) ? name.trim() : '';
  const broken = name.includes('\n'); // he's put in his own line breaks
  const query = () => new URLSearchParams({ font, pos: align === 'center' ? 'top-center' : 'top-left', align, ...(place ? { x: String(place.x), y: String(place.y) } : {}), size: String(size), border: frame, ...(colour ? { colour } : {}), ...(borderColour ? { borderColour } : {}), ...(borderAlpha < 1 ? { borderAlpha: String(borderAlpha) } : {}), imageAlpha: String(imageAlpha), ...(ownName || broken ? { name: name.trim() } : {}) });
  // redrawn a moment after the last change
  useEffect(() => {
    if (!font) return undefined;
    const t = setTimeout(() => setPreviewSrc(`/api/homebrew/${brew.id}/labels/preview?${query()}`), 300);
    return () => clearTimeout(t);
  }, [font, name, align, place, size, colour, frame, borderColour, borderAlpha, imageAlpha, brew.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = Math.max(1, Math.min(200, parseInt(count, 10) || 10));
  const make = async () => {
    setBusy(true); setErr('');
    try {
      try { localStorage.setItem('hbLabelFont', font); localStorage.setItem('hbLabelAlign', align); localStorage.setItem('hbLabelSize', String(size)); localStorage.setItem('hbLabelColour', colour); localStorage.setItem('hbLabelBorder', frame); localStorage.setItem('hbLabelBorderColour', borderColour); localStorage.setItem('hbLabelBorderAlpha', String(borderAlpha)); localStorage.setItem('hbLabelImageAlpha', String(imageAlpha)); } catch { /* fine */ }
      const q = query(); q.set('count', String(n));
      const res = await fetch(`/api/homebrew/${brew.id}/labels?${q}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Couldn\'t make the labels.');
      onDone(new File([await res.blob()], `${(name.replace(/\s+/g, ' ').trim() || brew.name).replace(/[\\/:*?"<>|]+/g, '').trim() || 'Brew'} labels.pdf`, { type: 'application/pdf' }), n);
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  const small = 'text-[10px] font-bold uppercase tracking-wider text-slate-500';
  const chip = (on) => `px-2.5 py-1.5 rounded-xl text-xs font-bold border transition ${on ? 'border-amber-500 text-amber-600' : `${border} text-slate-500 hover:text-amber-500`}`;
  // the same colour choices for the name and the border (sameAs: the border's "same as the name")
  const colours = (value, set, sameAs) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {sameAs && <button type="button" onClick={() => set('')} className={chip(!value)}>Same as the name</button>}
      <button type="button" onClick={() => set(sameAs ? '#2e2b27' : '')} className={`${chip(sameAs ? value === '#2e2b27' : !value)} flex items-center gap-1.5`}><span className="w-3 h-3 rounded-full bg-[#2e2b27]" /> Dark</button>
      <button type="button" onClick={() => set('#ffffff')} className={`${chip(value === '#ffffff')} flex items-center gap-1.5`}><span className="w-3 h-3 rounded-full bg-white border border-black/20" /> White</button>
      {brew.liquid && <button type="button" onClick={() => set(brew.liquid)} className={`${chip(value === brew.liquid)} flex items-center gap-1.5`}><span className="w-3 h-3 rounded-full" style={{ background: brew.liquid }} /> The drink's</button>}
      <label className={`${chip(value && !['#ffffff', '#2e2b27', brew.liquid].includes(value))} flex items-center gap-1.5 cursor-pointer`}>
        <input type="color" value={value || '#2e2b27'} onChange={(e) => set(e.target.value)} className="w-4 h-4 p-0 border-0 bg-transparent cursor-pointer" /> Pick
      </label>
    </div>
  );
  const group = (kind, title) => (
    <div>
      <div className={`${small} mb-1.5`}>{title}</div>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
        {fonts.filter((f) => f.kind === kind).map((f) => (
          <div key={f.id} role="button" tabIndex={0} onClick={() => setFont(f.id)} onKeyDown={(e) => e.key === 'Enter' && setFont(f.id)}
            className={`relative cursor-pointer text-left rounded-xl border-2 px-3 py-2 transition ${font === f.id ? 'border-amber-500 shadow-md shadow-amber-500/20' : `${border} hover:border-amber-500/50`} ${isDark ? 'bg-slate-900/60' : 'bg-white'}`}>
            <div className="truncate leading-normal py-1 px-1 -mx-1" style={{ fontFamily: `'${f.family}', Georgia, serif`, fontWeight: f.weight, fontSize: `${Math.round(17 * f.size)}px` }}>{name.replace(/\s+/g, ' ').trim() || brew.name}</div>
            <div className="text-[10px] text-slate-500 mt-0.5 truncate pr-4">{f.label}</div>
            {kind === 'yours' && <button type="button" onClick={(e) => { e.stopPropagation(); removeFont(f); }} title="Remove this font" className="absolute top-1 right-1 p-0.5 rounded text-slate-400 hover:text-red-500"><X size={12} /></button>}
          </div>
        ))}
        {kind === 'yours' && (
          <label className={`cursor-pointer rounded-xl border-2 border-dashed ${border} px-3 py-2 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-500 hover:text-amber-500 hover:border-amber-500/50`} title="A .ttf, .otf, .woff or .woff2 font - kept for later labels too">
            {fontBusy ? <RotateCw size={13} className="animate-spin" /> : <Plus size={13} />} Upload a font
            <input type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" className="hidden" onChange={(e) => { uploadFont(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        )}
      </div>
    </div>
  );
  // Dragging the name on the preview: the name inside the preview moves as he drags; when he lets go its spot (mm)
  // is kept and the preview is drawn again by the server, exactly as it will print.
  const MM = 99 / LABEL_PX[0];
  const where = (e) => { const r = box.current.getBoundingClientRect(); return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale]; };
  const nameEl = () => { try { return frameRef.current?.contentDocument?.querySelector('.head'); } catch { return null; } };
  const onName = (el, x, y) => { if (!el) return false; const r = el.getBoundingClientRect(); return x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4; };
  const dragStart = (e) => {
    const el = nameEl(); const [x, y] = where(e);
    if (!onName(el, x, y)) return;
    const r = el.getBoundingClientRect();
    drag.current = { el, dx: x - r.left, dy: y - r.top, w: r.width, left: r.left, top: r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const dragMove = (e) => {
    const [x, y] = where(e);
    if (!drag.current) { e.currentTarget.style.cursor = onName(nameEl(), x, y) ? 'move' : 'default'; return; }
    const d = drag.current;
    d.left = Math.max(0, Math.min(LABEL_PX[0] - 10, x - d.dx)); d.top = Math.max(0, Math.min(LABEL_PX[1] - 10, y - d.dy));
    Object.assign(d.el.style, { position: 'absolute', zIndex: 1, left: `${d.left}px`, top: `${d.top}px`, transform: 'none', width: 'max-content', margin: 0 });
  };
  const dragEnd = () => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    const round = (v) => Math.round(v * 2) / 2;
    setPlace({ x: round((align === 'center' ? d.left + d.w / 2 : align === 'right' ? d.left + d.w : d.left) * MM), y: round(d.top * MM), w: d.w * MM });
  };
  // a new alignment after he's dragged it: the name stays where it is, only the point it's measured from changes
  const realign = (id) => {
    if (place?.w) {
      const off = { left: 0, center: 0.5, right: 1 };
      const left = place.x - off[align] * place.w;
      setPlace({ ...place, x: Math.round((left + off[id] * place.w) * 2) / 2 });
    }
    setAlign(id);
  };
  // a titled panel for one group of settings
  const panel = (title, children, extra = '') => (
    <section className={`rounded-2xl border ${border} p-4 flex flex-col gap-3 ${isDark ? 'bg-slate-900/40' : 'bg-white/70'} ${extra}`}>
      <h3 className="text-xs font-black uppercase tracking-wider">{title}</h3>
      {children}
    </section>
  );
  const field = `rounded-xl border ${border} px-3 py-2 text-sm ${isDark ? 'bg-slate-900' : 'bg-white'}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className={`w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-3xl border ${border} p-5 flex flex-col gap-4 shadow-2xl ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-[#fbf8f3] text-[#2E2B27]'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Printer size={16} className="text-amber-500" />
          <h2 className="text-sm font-black uppercase tracking-wider">Print labels</h2>
          <button onClick={onClose} title="Close" className="ml-auto p-1.5 rounded-lg text-slate-500 hover:text-amber-500"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* right: what it looks like, its border, and the sheet (first on a phone) */}
          <div className="lg:order-2 flex flex-col gap-4 min-w-0">
            {panel('Preview', <>
              <div ref={box} className="relative w-full shrink-0 rounded-xl overflow-hidden shadow-md bg-white" style={{ aspectRatio: `${LABEL_PX[0]} / ${LABEL_PX[1]}` }}>
                {previewSrc
                  ? <iframe ref={frameRef} title="Label preview" src={previewSrc} className="absolute top-0 left-0 border-0 pointer-events-none origin-top-left" style={{ width: LABEL_PX[0], height: LABEL_PX[1], transform: `scale(${scale})` }} />
                  : <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">Drawing the label...</div>}
                <div className="absolute inset-0 touch-none select-none" onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd} />
              </div>
              <span className="text-[10px] text-slate-500 text-center">Drag the name to move it - as it will print, 99 x 57 mm on the sheet</span>
            </>)}
            {panel('Background', (
              <label className="flex flex-col gap-1">
                <span className={small}>Picture - {Math.round(imageAlpha * 100)}%</span>
                <input type="range" min="0" max="1" step="0.01" value={imageAlpha} onChange={(e) => setImageAlpha(Number(e.target.value))} className="accent-amber-500" />
                <span className="text-[10px] text-slate-500">0% shows just the drink's colour. <button type="button" onClick={() => setImageAlpha(0.64)} className="text-amber-600 hover:underline">Back to 64%</button></span>
              </label>
            ))}
            {panel('Border', <>
              <div className="flex flex-col gap-1">
                <span className={small}>Style</span>
                <div className="grid grid-cols-3 gap-1.5">{BORDERS.map(([id, l]) => <button key={id} type="button" onClick={() => setFrame(id)} className={chip(frame === id)}>{l}</button>)}</div>
              </div>
              {frame !== 'none' && (
                <div className="flex flex-col gap-1">
                  <span className={small}>Colour</span>
                  {colours(borderColour, setBorderColour, true)}
                </div>
              )}
              {frame !== 'none' && (
                <label className="flex flex-col gap-1">
                  <span className={small}>Opacity - {Math.round(borderAlpha * 100)}%</span>
                  <input type="range" min="0.1" max="1" step="0.05" value={borderAlpha} onChange={(e) => setBorderAlpha(Number(e.target.value))} className="accent-amber-500" />
                </label>
              )}
            </>)}
            {panel('Sheet', <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 w-32">
                  <span className={small}>How many labels</span>
                  <input type="number" min="1" max="200" value={count} onChange={(e) => setCount(e.target.value)} className={field} />
                </label>
                <span className="text-xs text-slate-500 pb-2">{Math.ceil(n / 10)} A4 sheet{n > 10 ? 's' : ''}, 10 to a sheet</span>
              </div>
              {err && <p className="text-xs text-red-500">{err}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-slate-500">Print at 100% (actual size), not "fit to page".</span>
                <button onClick={make} disabled={busy || !font}
                  className="ml-auto px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-600 shadow-md shadow-amber-500/20 flex items-center gap-1.5 disabled:opacity-60">
                  {busy ? <RotateCw size={13} className="animate-spin" /> : <FileDown size={13} />} Make the labels
                </button>
              </div>
            </>)}
          </div>
          {/* left: the name and its lettering */}
          <div className="lg:order-1 flex flex-col gap-4 min-w-0">
            {panel('The name', <>
              <label className="flex flex-col gap-1">
                <span className={small}>Text</span>
                <textarea rows={Math.min(3, Math.max(2, name.split('\n').length))} value={name} placeholder={brew.name} className={`${field} resize-none leading-snug`}
                  onChange={(e) => setName(e.target.value.split('\n').slice(0, 3).join('\n').slice(0, 100))} />
                <span className="text-[10px] text-slate-500">Press Enter where you want it to break onto the next line (up to three lines).</span>
                {ownName && <span className="text-[10px] text-slate-500">Just for these labels - the {brew.isRecipe ? 'recipe' : 'brew'} keeps its name, and it goes under yours. <button type="button" onClick={() => setName(brew.name)} className="text-amber-600 hover:underline">Use "{brew.name}"</button></span>}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <span className={small}>Position</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[['left', 'Left'], ['center', 'Centre'], ['right', 'Right']].map(([id, l]) => <button key={id} type="button" onClick={() => realign(id)} className={chip(align === id)}>{l}</button>)}
                  </div>
                  <span className="text-[10px] text-slate-500">{place ? <>Placed where you dragged it. <button type="button" onClick={() => setPlace(null)} className="text-amber-600 hover:underline">Reset position</button></> : 'Drag the name on the preview to move it.'}</span>
                </div>
                <label className="flex flex-col gap-1">
                  <span className={small}>Size - {Math.round(size * 100)}%</span>
                  <input type="range" min="0.6" max="1.8" step="0.05" value={size} onChange={(e) => setSize(Number(e.target.value))} className="accent-amber-500 mt-2" />
                  <button type="button" onClick={() => setSize(1)} className="self-start text-[10px] text-amber-600 hover:underline">Back to 100%</button>
                </label>
              </div>
              <div className="flex flex-col gap-1">
                <span className={small}>Colour</span>
                {colours(colour, setColour)}
              </div>
            </>)}
            {panel('Lettering', fonts.length
              ? <>{group('yours', 'Your fonts')}{group('wine', 'Wine and mead')}{group('beer', 'Beer, cider and soda')}</>
              : <div className="text-xs text-slate-500">Loading the fonts...</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepsEditor({ value, onChange, field, border, isDark }) {
  // local list so a step being typed (even emptied) isn't dropped mid-edit; synced when the brew changes
  const [steps, setSteps] = useState(() => parseSteps(value));
  const [dragFrom, setDragFrom] = useState(null);
  useEffect(() => { if (joinSteps(steps) !== value) setSteps(parseSteps(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (next) => { setSteps(next); onChange(joinSteps(next)); };
  const move = (from, to) => {
    if (to < 0 || to >= steps.length || from === to) return;
    const next = steps.slice(); const [s] = next.splice(from, 1); next.splice(to, 0, s); commit(next);
  };
  const iconBtn = `p-1 rounded-md border ${border} text-slate-500 hover:text-amber-500 disabled:opacity-30 disabled:hover:text-slate-500`;
  return (
    <div className="flex flex-col gap-2">
      {steps.map((s, i) => (
        <div key={i} draggable onDragStart={() => setDragFrom(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragFrom !== null) move(dragFrom, i); setDragFrom(null); }}
          className={`flex gap-2 items-start rounded-xl border ${border} p-2 ${dragFrom === i ? 'opacity-50' : ''} ${isDark ? 'bg-slate-950/40' : 'bg-white'}`}>
          <span title="Drag to move" className="cursor-grab select-none w-6 h-6 shrink-0 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 text-white text-[11px] font-bold flex items-center justify-center mt-1">{i + 1}</span>
          <textarea rows={Math.max(1, Math.ceil(s.length / 70))} value={s} onChange={(e) => { const next = steps.slice(); next[i] = e.target.value.replace(/\n/g, ' '); setSteps(next); onChange(joinSteps(next)); }}
            title={abbrTitle(s)} className={`${field} resize-y flex-1 min-w-0`} placeholder="What to do - with temperatures and timings" />
          <div className="flex flex-col gap-1 shrink-0">
            <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} title="Move up" className={iconBtn}><ChevronUp size={12} /></button>
            <button type="button" onClick={() => move(i, i + 1)} disabled={i === steps.length - 1} title="Move down" className={iconBtn}><ChevronDown size={12} /></button>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <button type="button" onClick={() => { const next = steps.slice(); next.splice(i + 1, 0, ''); setSteps(next); }} title="Add a step after this one" className={iconBtn}><Plus size={12} /></button>
            <button type="button" onClick={() => commit(steps.filter((_, j) => j !== i))} title="Delete this step" className={`${iconBtn} hover:text-red-500`}><Trash2 size={12} /></button>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setSteps([...steps, ''])} className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${border} self-start`}><Plus size={13} /> Step</button>
      {!steps.length && <p className="text-[11px] text-slate-500">No steps yet - add the first.</p>}
    </div>
  );
}

// How each kind of brew looks: an emoji, the colour of the liquid in the jar and a tint for its tile.
const CAT_LOOK = {
  mead: { emoji: '🍯', liquid: '#f2b630', tint: 'from-amber-400/30 to-yellow-500/10' },
  white_wine: { emoji: '🥂', liquid: '#e6dc8a', tint: 'from-lime-200/30 to-yellow-100/10' },
  red_wine: { emoji: '🍷', liquid: '#8a1538', tint: 'from-rose-700/30 to-red-900/10' },
  rose_wine: { emoji: '🌸', liquid: '#f08fa8', tint: 'from-pink-300/30 to-rose-400/10' },
  fruit_veg_wine: { emoji: '🫐', liquid: '#a83262', tint: 'from-pink-500/30 to-purple-600/10' },
  flower_herb_wine: { emoji: '🌼', liquid: '#e8c85a', tint: 'from-yellow-300/30 to-emerald-400/10' },
  hot_pepper_wine: { emoji: '🌶️', liquid: '#d9381e', tint: 'from-red-500/30 to-orange-600/10' },
  beer: { emoji: '🍺', liquid: '#d98a1f', tint: 'from-orange-400/30 to-amber-600/10' },
  stout: { emoji: '🖤', liquid: '#2b1a12', tint: 'from-stone-700/40 to-stone-900/10' },
  cider: { emoji: '🍏', liquid: '#c4d45a', tint: 'from-lime-400/30 to-green-500/10' },
  soda: { emoji: '🫧', liquid: '#cfe3a0', tint: 'from-lime-300/30 to-sky-300/10' },
};
// a darker shade of a #rrggbb colour (f = how much darker, 0-1): readable text in a type's own colour
const shade = (hex, f) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - f)).toString(16).padStart(2, '0')).join('')}`;
const look = (cat) => CAT_LOOK[cat] || { emoji: '🧪', liquid: '#f59e0b', tint: 'from-amber-400/20 to-orange-500/10' };

// Wine colour and sweetness are tags, filtered like the ingredients: a blackberry wine is Fruit & vegetable and red.
// The Red, White and Rosé tiles show every wine of that colour, whatever it's made from.
const WINE_COLOURS = [
  { id: 'red', label: 'Red', emoji: '🍷', liquid: '#8a1538', dot: 'bg-[#8a1538]' },
  { id: 'white', label: 'White', emoji: '🥂', liquid: '#e6dc8a', dot: 'bg-[#e6dc8a]' },
  { id: 'rose', label: 'Rosé', emoji: '🌸', liquid: '#f08fa8', dot: 'bg-[#f08fa8]' },
];
const COLOUR_TILE = { red_wine: 'red', white_wine: 'white', rose_wine: 'rose' };
const WINE_CATS = ['white_wine', 'red_wine', 'rose_wine', 'fruit_veg_wine', 'flower_herb_wine', 'hot_pepper_wine'];
const SWEETNESS = [{ id: 'dry', label: 'Dry' }, { id: 'medium', label: 'Medium' }, { id: 'sweet', label: 'Sweet' }];
const ACIDITY = [{ id: 'soft', label: 'Soft', hint: 'Gentle, low acid - flowers, grains, vegetables, most meads and beers' }, { id: 'fresh', label: 'Fresh', hint: 'Bright and lively - a balancing squeeze of citrus or added acid' }, { id: 'tart', label: 'Tart', hint: 'Sharp - rhubarb, gooseberry, currants, citrus, or a sour style' }];
const FIZZ = [{ id: 'still', label: 'Still' }, { id: 'sparkling', label: 'Sparkling' }];
const FLAVOUR_TAGS = [
  { id: 'fruity', label: 'Fruity', emoji: '🍓', hint: 'Fruit at its heart' },
  { id: 'floral', label: 'Floral', emoji: '🌸', hint: 'Flowers and blossom - elderflower, rose, dandelion, heather' },
  { id: 'herbal', label: 'Herbal & earthy', emoji: '🌿', hint: 'Herbs, leaves, roots, vegetables, mushrooms, tea' },
  { id: 'pine', label: 'Pine & hoppy', emoji: '🌲', hint: 'Hops, spruce, pine, juniper' },
  { id: 'roasted', label: 'Roasted & chocolate', emoji: '☕', hint: 'Roasted and toasted - coffee, chocolate, dark malt, caramel, oak, bourbon' },
  { id: 'spicy', label: 'Spicy', emoji: '🫚', hint: 'Ginger, cinnamon, cloves, vanilla, chilli' },
  { id: 'honey', label: 'Honeyed', emoji: '🍯', hint: 'Honey you can taste - meads, braggots and honey beers' },
];
const SWEET_PILL = { dry: 'bg-sky-500/15 text-sky-600', medium: 'bg-amber-500/15 text-amber-600', sweet: 'bg-pink-500/15 text-pink-600' };
const BASIS_WORD = { book: 'as the book says', gravity: 'from its target final gravity', estimate: 'estimated from the sugar, yeast and method - the book doesn\'t say', you: 'as you set it' };
const colourOf = (b) => b.colour || { red_wine: 'red', white_wine: 'white', rose_wine: 'rose' }[b.category] || null;
const sweetOf = (b) => {
  if (b.sweetnessTag) return b.sweetnessTag;
  const v = String(b.sweetness || '').toLowerCase();
  return v === 'dry' ? 'dry' : /semi|medium|off/.test(v) ? 'medium' : /sweet/.test(v) ? 'sweet' : null;
};
// strength (ABV %): measured, or from the target gravities, or estimated from the sugar and yeast (shown with ~)
const strengthOf = (b) => b.calc?.abv || b.calc?.potentialAbv || b.abvEstimate || null;
// how many bottles a batch fills: wines in 750 ml bottles, everything else in 500 ml, leaving about a tenth behind
// in the lees and racking losses
const bottlesOf = (litres, category) => {
  const L = Number(litres);
  if (!L || L <= 0) return null;
  const wine = WINE_CATS.includes(category);
  const n = Math.floor((L * 0.9) / (wine ? 0.75 : 0.5));
  return { n, size: wine ? '750 ml' : '500 ml', text: `≈${n} × ${wine ? '750 ml' : '500 ml'}`, hint: `About ${n} ${wine ? '750 ml wine' : '500 ml'} bottles from ${L} L, allowing about 10% for the sediment left behind when racking and bottling` };
};
// recipes of the same drink from different books share a family - one card, each book's version an alternative
const famKey = (b) => `${WINE_CATS.includes(b.category) ? 'wine' : b.category}::${String(b.family || b.name).toLowerCase()}`;
const STATUS_PILL = { planning: 'bg-slate-500/15 text-slate-500', fermenting: 'bg-amber-500/15 text-amber-500', conditioning: 'bg-sky-500/15 text-sky-500', bottled: 'bg-emerald-500/15 text-emerald-500', finished: 'bg-emerald-600/15 text-emerald-600', dumped: 'bg-red-500/15 text-red-500' };
const STATUS_WORD = { planning: 'Planning', fermenting: 'Bubbling away', conditioning: 'Clearing', bottled: 'Bottle', finished: 'Finished', dumped: 'Dumped' };
const TRACK = ['planning', 'fermenting', 'conditioning', 'bottled', 'finished'];
const VESSEL_CSS = `
@keyframes hb-rise { 0% { transform: translate(0, 0); opacity: 0 } 12% { opacity: 1 } 50% { transform: translate(var(--sway), calc(var(--rise) * .5)) } 88% { opacity: 1 } 100% { transform: translate(0, var(--rise)); opacity: 0 } }
@keyframes hb-fall { 0% { transform: translateY(0); opacity: 0 } 15% { opacity: .6 } 85% { opacity: .6 } 100% { transform: translateY(var(--fall)); opacity: 0 } }
@keyframes hb-bob { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-.5px) } }
@keyframes hb-sweep { 0%, 70% { transform: translateX(0) } 100% { transform: translateX(150px) } }
@keyframes hb-swing { 0%, 100% { transform: rotate(-5deg) } 50% { transform: rotate(5deg) } }
.hb-speck { animation: hb-fall 8s ease-in infinite; transform-box: fill-box; }
.hb-foam { animation: hb-bob 1.8s ease-in-out infinite; }
.hb-glint { animation: hb-sweep 7s ease-in-out infinite; }
.hb-tag { animation: hb-swing 3.2s ease-in-out infinite; }
@keyframes hb-blip { 0%, 70%, 100% { transform: scale(1) } 80% { transform: scale(1.35) } }
@keyframes hb-twinkle { 0%, 100% { opacity: .2; transform: scale(.7) } 50% { opacity: 1; transform: scale(1.1) } }
.hb-bubble { animation: hb-rise 2.6s ease-in infinite; transform-box: fill-box; }
.hb-airlock { animation: hb-blip 2.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.hb-star { animation: hb-twinkle 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.hb-range { position: absolute; inset: 0; width: 100%; margin: 0; background: transparent; pointer-events: none; -webkit-appearance: none; appearance: none; }
.hb-range::-webkit-slider-thumb { pointer-events: auto; -webkit-appearance: none; width: 16px; height: 16px; border-radius: 9999px; background: #f59e0b; border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.35); cursor: pointer; }
.hb-range::-moz-range-thumb { pointer-events: auto; width: 14px; height: 14px; border-radius: 9999px; background: #f59e0b; border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.35); cursor: pointer; }
.hb-range::-webkit-slider-runnable-track { background: transparent; }
.hb-range::-moz-range-track { background: transparent; }
.hb-card { transition: translate .18s ease, box-shadow .18s ease; }
.hb-card:hover { translate: 0 -4px; }
@media (prefers-reduced-motion: reduce) { .hb-bubble, .hb-airlock, .hb-star, .hb-speck, .hb-foam, .hb-glint, .hb-tag { animation: none } .hb-card:hover { transform: none } }
`;

// The ingredient finder: "apples, rhubarb" finds what you can brew with them. A word matches at the start of a
// word, as a whole word with any plural - apple finds apples and Apple Champagne but not pineapple, pepper finds
// peppers but not peppermint. A few general words also match the end of a word: berry finds blackberries, mint spearmint.
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const singular = (w) => w.toLowerCase().trim().replace(/ies$/, 'y').replace(/(ch|sh|o)es$/, '$1').replace(/([^s])s$/, '$1');
const wantedOf = (q) => q.split(/,|&|\+|\band\b/i).map((w) => singular(w)).filter((w) => w.length > 1);
const SUFFIX_WORDS = /^(berry|currant|mint|fruit|melon|flower)$/;
const wordRe = (w) => {
  const parts = w.split(/\s+/);
  const last = parts.pop();
  const tail = /y$/.test(last) ? `${escRe(last.slice(0, -1))}(?:y|ies)` : `${escRe(last)}(?:s|es)?`;
  const lead = SUFFIX_WORDS.test(last) && !parts.length ? '' : '\\b';
  // words may be written apart, hyphenated or run together: black currant = black-currant = blackcurrant
  return new RegExp(`${lead}${[...parts.map(escRe), tail].join('[\\s-]*')}\\b`, 'i');
};
const ingText = (g) => `${g.amount ? `${g.amount}${g.unit ? ` ${g.unit}` : ''} ` : ''}${g.name}`;
function ingredientHits(b, wanted) {
  const hits = [];
  let n = 0;
  for (const w of wanted) {
    const re = wordRe(w);
    const found = (b.ingredients || []).filter((g) => re.test(String(g.name || '').replace(/\(.*?\)/g, '')));
    if (found.length || re.test(b.name)) n++;
    for (const g of found) if (!hits.includes(g)) hits.push(g);
  }
  return { n, hits };
}
// The ingredient finder's groups: things that grow, each with its own icon where there is one. A group only shows the
// ingredients that turn up in a recipe or brew, A-Z. Never the helpers (Campden tablets, pectic enzyme, nutrient,
// acid). Raisins are left out: nearly every wine uses them for body.
const PRODUCE_GROUPS = [
  { id: 'fruit', label: 'Fruit', icon: '🍎', items: [
    ['apple', '🍎'], ['apricot', '🍑'], ['banana', '🍌'], ['black currant', '🫐'], ['blackberry', '🫐'], ['blood orange', '🍊'], ['blueberry', '🫐'],
    ['buddha’s hand', '🍋'], ['cactus pear', '🌵'], ['calamondin', '🍊'], ['cape gooseberry', '🟠'], ['cherry', '🍒'], ['chokecherry', '🍒'], ['citron', '🍋'],
    ['coconut', '🥥'], ['crabapple', '🍎'], ['cranberry', '🔴'], ['currant', '🫐'], ['damson', '🟣'], ['elderberry', '🫐'], ['fig', '🟤'], ['gooseberry', '🟢'],
    ['grape', '🍇'], ['grapefruit', '🍊'], ['greengage', '🟢'], ['guava', '🍐'], ['haw', '🔴'], ['kiwifruit', '🥝'], ['kumquat', '🍊'], ['lemon', '🍋'], ['lime', '🍋'],
    ['limequat', '🍋'], ['loganberry', '🍓'], ['mandarin', '🍊'], ['mango', '🥭'], ['manzanita', '🍎'], ['melon', '🍈'], ['mulberry', '🫐'], ['nectarine', '🍑'], ['orange', '🍊'],
    ['pawpaw', '🥭'], ['peach', '🍑'], ['pear', '🍐'], ['persimmon', '🟠'], ['pineapple', '🍍'], ['plum', '🟣'], ['pomegranate', '🔴'], ['prickly pear', '🌵'], ['prune', '🟣'],
    ['quince', '🍐'], ['raspberry', '🍓'], ['red currant', '🔴'], ['rhubarb', '🌱'], ['rose hip', '🔴'], ['sloe', '🫐'], ['strawberry', '🍓'], ['sumac', '🔴'],
    ['tangerine', '🍊'], ['watermelon', '🍉'],
  ] },
  { id: 'veg', label: 'Vegetables', icon: '🥕', items: [
    ['beet', '🟣'], ['bell pepper', '🫑'], ['carrot', '🥕'], ['celery', '🥬'], ['corn', '🌽'], ['cucumber', '🥒'], ['garlic', '🧄'],
    ['kale', '🥬'], ['marrow', '🥒'], ['onion', '🧅'], ['parsnip', '🥕'], ['pea', '🫛'], ['potato', '🥔'], ['pumpkin', '🎃'], ['squash', '🎃'], ['swede', '🥔'], ['sweet potato', '🍠'],
    ['tomato', '🍅'], ['turnip', '🥔'],
  ] },
  { id: 'herbs', label: 'Herbs & flowers', icon: '🌿', items: [
    ['basil', '🌿'], ['bay', '🌿'], ['broom', '🌼'], ['burdock', '🌿'], ['chamomile', '🌼'], ['clover', '☘️'], ['cowslip', '🌼'], ['dandelion', '🌼'], ['elderflower', '🌸'], ['fennel', '🌿'], ['gorse', '🌼'], ['ground ivy', '🌿'],
    ['heather', '🌸'], ['hibiscus', '🌺'], ['horehound', '🌿'], ['hyssop', '🌿'], ['jasmine', '🌸'], ['lavender', '🪻'], ['lemon balm', '🌿'], ['lemongrass', '🌿'],
    ['lilac', '🌸'], ['marigold', '🌼'], ['mint', '🌿'], ['mugwort', '🌿'], ['nettle', '🌿'], ['oregano', '🌿'], ['pineapple weed', '🌼'], ['primrose', '🌼'], ['rose', '🌹'],
    ['rosemary', '🌿'], ['sage', '🌿'], ['sagebrush', '🌿'], ['tarragon', '🌿'], ['thyme', '🌿'], ['violet', '🌸'], ['wormwood', '🌿'], ['yarrow', '🌼'],
    ['yerba santa', '🌿'],
  ] },
  { id: 'spice', label: 'Spices & roots', icon: '🫚', items: [
    ['allspice', '🟤'], ['anise', '⭐'], ['cardamom', '🟢'], ['cayenne', '🌶️'], ['chile', '🌶️'], ['chocolate', '🍫'], ['cinnamon', '🟤'], ['clove', '🟤'],
    ['cocoa', '🍫'], ['coffee', '☕'], ['coriander', '🌿'], ['fenugreek', '🟡'], ['ghost pepper', '🌶️'], ['ginger', '🫚'], ['habanero', '🌶️'], ['jalapeño', '🌶️'],
    ['licorice', '🟤'], ['nutmeg', '🌰'], ['pepper', '🌶️'], ['peppercorn', '⚫'], ['sarsaparilla', '🟤'], ['sassafras', '🟤'], ['star anise', '⭐'], ['tea', '🍵'],
    ['vanilla', '🍦'],
  ] },
  { id: 'grain', label: 'Grains & malts', icon: '🌾', items: [
    ['amber malt', '🌾'], ['barley', '🌾'], ['biscuit malt', '🌾'], ['bread', '🍞'], ['caramalt', '🌾'], ['chocolate malt', '🌾'], ['crystal malt', '🌾'],
    ['golden promise', '🌾'], ['maize', '🌽'], ['malt extract', '🌾'], ['maris otter', '🌾'], ['munich', '🌾'], ['oat', '🌾'], ['pilsner', '🌾'],
    ['rice', '🍚'], ['rye', '🌾'], ['sorghum', '🌾'], ['vienna', '🌾'], ['wheat', '🌾'],
  ] },
  { id: 'sweet', label: 'Honey & sugars', icon: '🍯', items: [
    ['birch syrup', '🍁'], ['candi sugar', '🍬'], ['honey', '🍯'], ['lactose', '🥛'], ['maple syrup', '🍁'], ['molasses', '🍯'], ['piloncillo', '🍬'],
  ] },
  { id: 'hops', label: 'Hops', icon: '🍺', items: [
    ['amarillo', '🍺'], ['cascade', '🍺'], ['centennial', '🍺'], ['chinook', '🍺'], ['citra', '🍺'], ['cluster', '🍺'], ['columbus', '🍺'], ['fuggle', '🍺'],
    ['galaxy', '🍺'], ['galena', '🍺'], ['golding', '🍺'], ['hop', '🍺'], ['motueka', '🍺'], ['nelson sauvin', '🍺'], ['pilgrim', '🍺'], ['saaz', '🍺'],
    ['simcoe', '🍺'],
  ] },
  { id: 'fungi', label: 'Mushrooms', icon: '🍄', items: [
    ['candy cap', '🍄'], ['chaga', '🍄'], ['chanterelle', '🍄'], ['matsutake', '🍄'], ['mushroom', '🍄'], ['reishi', '🍄'], ['shiitake', '🍄'], ['turkey tail', '🍄'],
  ] },
  { id: 'forage', label: 'Trees', icon: '🌲', items: [
    ['alder', '🌳'], ['birch', '🌳'], ['fir', '🌲'], ['hickory', '🌰'], ['juniper', '🌲'], ['oak', '🌳'], ['pecan', '🌰'], ['pine', '🌲'],
    ['pinecone', '🌲'], ['spruce', '🌲'], ['willow', '🌳'],
  ] },
].map((g) => ({ ...g, items: g.items.map(([w, icon]) => ({ w, icon, re: wordRe(w) })) }));

// A demijohn showing the brew, always in the drink's own colour: piles of its main ingredients beside it while it's
// planned, bubbles rising to a froth while it ferments, sediment falling on to the lees while it clears, empty bottles
// standing ready once it's bottling, and full bottles once it's finished. Sizes are true to life: a 4.5 L demijohn
// is ~37 cm tall (108 units here), a 75 cl wine bottle ~30 cm, a 500 ml beer bottle ~24 cm.
// liquid: the drink's expected colour when known, else the wine colour or the category's
// pics: the main-ingredient pictures ([{ key, name }]) for the planning piles; ingredients: the fallback when there are none
const PILE_TYPE_COLOUR = { fruit: '#b83b3b', malt: '#d4a24c', hops: '#7cb342', spice: '#8d5524', honey: '#f2b630', sugar: '#eadfc8', other: '#8fbf5a' };
const NOT_A_PILE = /water|yeast|nutrient|campden|pectic|acid blend|tannin|finings|potassium|sorbate|metabisulphite|bentonite|isinglass|gelatin/i;
const BEER_GLASS = ['beer', 'stout', 'cider', 'soda'];
const PILES = [[89, 42, 27], [118, 34, 20], [139, 23, 13]]; // [left x, width, height] - the biggest at the back, smaller in front

function Vessel({ category, status, isRecipe, size = 96, isDark, wine, liquid, pics = [], ingredients = [], fizz }) {
  const id = React.useId().replace(/:/g, '');
  const colour = status === 'dumped' ? '#94a3b8' : liquid || (WINE_COLOURS.find((w) => w.id === wine) || look(category)).liquid;
  const stage = isRecipe ? 'recipe' : status;
  const bubbling = stage === 'fermenting';
  const clearing = stage === 'conditioning';
  const finished = stage === 'finished';
  const besides = ['planning', 'bottled', 'finished'].includes(stage); // things on the table beside it
  const vbW = besides ? 162 : 100; // the demijohn stays the same size; the picture just gets wider
  // empty while it's planned (the ingredients are still in piles beside it) and once finished (it's in the bottles);
  // full to the shoulder otherwise; a little left if dumped
  const fill = finished || stage === 'planning' ? 0 : stage === 'dumped' ? 0.15 : isRecipe ? 0.83 : 0.8;
  const top = 122 - fill * 84;
  const glass = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(46,43,39,0.35)';
  const body = 'M42 20 H58 V32 C58 40 86 44 86 70 V112 Q86 122 76 122 H24 Q14 122 14 112 V70 C14 44 42 40 42 32 Z';
  const bubbles = [[26, 114, 1.6, 0, 2.6, 1.2], [33, 104, 1.1, 1.3, 3.1, -1], [40, 117, 2, 0.6, 2.4, 0.8], [47, 96, 1.2, 2.1, 2.9, -0.8], [53, 110, 1.8, 0.9, 2.7, 1],
    [60, 100, 1.3, 1.8, 3.3, -1.2], [66, 116, 2.1, 0.3, 2.5, 0.9], [72, 106, 1.2, 2.5, 3, -0.7], [37, 90, 1, 1.6, 2.2, 0.6], [57, 92, 1.1, 0.1, 2.3, -0.6]];
  const specks = [[27, top + 6, 1.4, 0, 7], [35, top + 14, 1.1, 2.4, 8.5], [43, top + 4, 1.6, 4.1, 7.5], [50, top + 20, 1.2, 1.2, 9], [57, top + 9, 1.5, 5.6, 8],
    [64, top + 17, 1.1, 3.3, 7.2], [71, top + 7, 1.4, 6.4, 8.8], [31, top + 24, 1.2, 5, 6.8], [46, top + 28, 1.1, 7.1, 7.8], [68, top + 26, 1.3, 0.7, 9.4],
    [39, top + 11, 1, 3.8, 8.2], [61, top + 3, 1.2, 2, 7.6]];
  // planning: a pile of each main ingredient (its photo shaped into a heap), else heaps coloured by ingredient type
  const piles = stage !== 'planning' ? [] : pics?.length
    ? pics.slice(0, 3).map((p) => ({ key: p.key, name: p.name }))
    : [...new Map((ingredients || []).filter((i) => i?.name && !NOT_A_PILE.test(i.name)).map((i) => [i.type || 'other', i])).values()].slice(0, 3)
      .map((i) => ({ colour: PILE_TYPE_COLOUR[i.type] || PILE_TYPE_COLOUR.other, name: i.name }));
  // bottling / finished: three bottles of the right kind - 500 ml beer bottles in brown glass, 75 cl wine bottles
  const beerBottle = BEER_GLASS.includes(category);
  const bottleTint = beerBottle ? '#7a4a12' : category === 'red_wine' ? '#3f6b3a' : null;
  const bottlePath = (cx) => (beerBottle
    ? `M${cx - 10} 118 Q${cx - 10} 122 ${cx - 6} 122 H${cx + 6} Q${cx + 10} 122 ${cx + 10} 118 V86 C${cx + 10} 78 ${cx + 3} 76 ${cx + 3} 66 V53 H${cx - 3} V66 C${cx - 3} 76 ${cx - 10} 78 ${cx - 10} 86 Z`
    : `M${cx - 11} 118 Q${cx - 11} 122 ${cx - 7} 122 H${cx + 7} Q${cx + 11} 122 ${cx + 11} 118 V72 C${cx + 11} 62 ${cx + 3.5} 60 ${cx + 3.5} 52 V37 H${cx - 3.5} V52 C${cx - 3.5} 60 ${cx - 11} 62 ${cx - 11} 72 Z`);
  const bottleTop = beerBottle ? 53 : 37;
  // a full bottle is filled to the base of the neck, with clear glass above it, as a real one is
  const fillTop = beerBottle ? 64 : 54;
  const bottles = stage === 'bottled' || finished ? [100, 122, 144] : [];
  return (
    // role="img": a drawing, not an outline icon - the page-wide icon rule (index.css) would otherwise empty its fills
    <svg viewBox={`0 0 ${vbW} 130`} width={size * vbW / 100} height={size * 1.3} role="img" aria-hidden="true" className="shrink-0 drop-shadow-sm">
      <defs>
        <clipPath id={`c${id}`}><path d={body} /></clipPath>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={colour} stopOpacity="0.95" />
          <stop offset="1" stopColor={colour} stopOpacity="1" />
        </linearGradient>
        {/* round glass: shaded at the sides, lit just left of centre */}
        <linearGradient id={`r${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.32" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.38" />
        </linearGradient>
        <linearGradient id={`e${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={isDark ? '#fff' : '#2E2B27'} stopOpacity="0.1" />
          <stop offset="0.3" stopColor="#fff" stopOpacity={isDark ? 0.08 : 0.5} />
          <stop offset="1" stopColor={isDark ? '#fff' : '#2E2B27'} stopOpacity="0.14" />
        </linearGradient>
        {/* the label turning away round the side of the glass */}
        <linearGradient id={`w${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.04" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.2" />
        </linearGradient>
        {/* a heap: lit on top, shaded round its foot */}
        <linearGradient id={`p${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
        {piles.map((p, i) => p.key && (
          <pattern key={i} id={`i${id}${i}`} patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox" width="1" height="1">
            <image href={`/api/homebrew/picture/${p.key}`} width="1" height="1" preserveAspectRatio="xMidYMid slice" />
          </pattern>
        ))}
        {bottles.map((cx, i) => <clipPath key={i} id={`b${id}${i}`}><path d={bottlePath(cx)} /></clipPath>)}
      </defs>

      {/* planning: piles of the main ingredients on the table, the biggest at the back */}
      {piles.map((p, i) => {
        const [x, w, h] = PILES[i];
        const d = `M${x} 122 C${x + w * 0.15} ${122 - h * 0.9} ${x + w * 0.35} ${122 - h * 1.05} ${x + w / 2} ${122 - h} C${x + w * 0.65} ${122 - h * 1.05} ${x + w * 0.85} ${122 - h * 0.9} ${x + w} 122 Z`;
        return (
          <g key={i}>
            <title>{p.name}</title>
            <ellipse cx={x + w / 2} cy="122.5" rx={w / 2 + 1} ry="1.6" fill="#000" opacity="0.22" />
            <path d={d} fill={p.key ? `url(#i${id}${i})` : p.colour} />
            <path d={d} fill={`url(#p${id})`} stroke={glass} strokeWidth="1.2" strokeLinejoin="round" />
            {!p.key && [0.3, 0.5, 0.7, 0.42, 0.6].map((f, j) => <circle key={j} cx={x + w * f} cy={122 - h * (j < 3 ? 0.35 : 0.65)} r="0.9" fill="#fff" opacity="0.35" />)}
          </g>
        );
      })}

      <g clipPath={`url(#c${id})`}>
        <rect x="0" y="0" width="100" height="130" fill={`url(#e${id})`} />
        {fill > 0 && <rect x="0" y={top} width="100" height="130" fill={`url(#g${id})`} />}
        {fill > 0 && <rect x="0" y={top} width="100" height="130" fill={`url(#r${id})`} />}
        {fill > 0 && <rect x="0" y={top} width="100" height="2.5" fill="#fff" opacity={bubbling ? 0.5 : 0.25} />}
        {bubbling && bubbles.map(([cx, cy, r, delay, dur, sway], i) => (
          <circle key={i} className="hb-bubble" cx={cx} cy={cy} r={r} fill="#fff" stroke="#fff" strokeOpacity="0.9" strokeWidth="0.4" fillOpacity="0.55"
            style={{ '--rise': `${top + 2 - cy}px`, '--sway': `${sway}px`, animationDelay: `${delay}s`, animationDuration: `${dur}s` }} />
        ))}
        {/* a thin froth on the surface while it ferments */}
        {bubbling && (
          <g className="hb-foam">
            <rect x="0" y={top - 1.6} width="100" height="3.2" fill="#fff" opacity="0.6" />
            {Array.from({ length: 16 }, (_, i) => <circle key={i} cx={16 + i * 4.4} cy={top - 1.2 + (i % 2) * 0.6} r={1.3 + (i % 3) * 0.45} fill="#fff" opacity="0.88" />)}
          </g>
        )}
        {bubbling && <path d="M10 122 V119.5 Q50 117 90 119.5 V122 Z" fill="#4a3522" opacity="0.45" />}
        {/* clearing: sediment falling from the top half of the liquid on to a thick layer of lees */}
        {clearing && specks.map(([cx, cy, r, delay, dur], i) => (
          <circle key={i} className="hb-speck" cx={cx} cy={cy} r={r} fill="#3d2b1a" stroke="#f5e6c8" strokeWidth="0.3" strokeOpacity="0.5" style={{ '--fall': `${115 - cy}px`, animationDelay: `${delay}s`, animationDuration: `${dur}s` }} />
        ))}
        {clearing && (
          <g>
            <path d="M10 122 V115.5 C26 111.5 40 110.5 50 110.5 C60 110.5 74 111.5 90 115.5 V122 Z" fill="#4a3522" opacity="0.92" />
            <path d="M10 116 C26 112 40 111 50 111 C60 111 74 112 90 116" stroke="#c9a978" strokeWidth="0.8" fill="none" opacity="0.7" />
            {[[24, 117], [31, 115], [38, 118.5], [45, 114], [52, 117.5], [59, 114.5], [66, 118], [73, 116], [80, 118.5], [34, 120], [56, 120.5], [70, 120]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="0.8" fill="#c9a978" opacity="0.55" />
            ))}
          </g>
        )}
        {(stage === 'planning' || stage === 'bottled') && <g transform="skewX(-18)"><rect className="hb-glint" x="-20" y="0" width="9" height="130" fill="#fff" opacity="0.28" /></g>}
        <path d="M22 60 C24 50 30 46 36 44" stroke="#fff" strokeWidth="3" fill="none" opacity="0.35" strokeLinecap="round" />
      </g>
      <path d={body} fill="none" stroke={glass} strokeWidth="2.5" />
      <rect x="39" y="14" width="22" height="9" rx="2" fill="#a0703c" />
      <rect x="47" y="3" width="6" height="12" rx="2" fill="none" stroke={glass} strokeWidth="2" />
      {bubbling && <circle className="hb-airlock" cx="50" cy="7" r="2.2" fill={colour} />}
      {/* the label, wrapped round the glass: its edges and lines curve with the body, and it shades off to the right
          where it turns away round the side */}
      <g transform="translate(61 84)">
        <path d="M0 0.4 Q10.5 2.6 22 0.2 L21.3 27.4 Q10.5 30.4 0 28.2 Z" fill="#fff" stroke="#d6b77a" strokeLinejoin="round" />
        <path d="M0 0.4 Q10.5 2.6 22 0.2 L21.3 27.4 Q10.5 30.4 0 28.2 Z" fill={`url(#w${id})`} />
        <path d="M4.5 8.6 Q10.5 9.9 16.5 8.8 M4.5 14.6 Q10.5 15.9 16.5 14.8 M4.5 20.6 Q8.5 21.6 12.5 21.1" stroke="#b08b4f" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </g>

      {/* bottling: empty bottles standing ready; finished: the same bottles full, capped and labelled */}
      {bottles.map((cx, i) => (
        <g key={i}>
          <ellipse cx={cx} cy="122.5" rx={beerBottle ? 11 : 12} ry="1.6" fill="#000" opacity="0.22" />
          <g clipPath={`url(#b${id}${i})`}>
            <rect x={cx - 12} y="30" width="24" height="95" fill={`url(#e${id})`} />
            {bottleTint && <rect x={cx - 12} y="30" width="24" height="95" fill={bottleTint} opacity={finished ? 0.25 : 0.32} />}
            {finished && <rect x={cx - 12} y={fillTop} width="24" height="95" fill={colour} />}
            {finished && <rect x={cx - 12} y={fillTop} width="24" height="95" fill={`url(#r${id})`} />}
            {finished && <rect x={cx - 12} y={fillTop} width="24" height="0.8" fill="#fff" opacity="0.35" />}
            {finished && fizz === 'sparkling' && [[-4, 116, 0], [1, 110, 0.9], [5, 118, 1.7], [-1, 104, 2.4]].map(([dx, cy, d], j) => (
              <circle key={j} className="hb-bubble" cx={cx + dx} cy={cy} r="0.7" fill="#fff" fillOpacity="0.7" style={{ '--rise': `${fillTop + 2 - cy}px`, '--sway': '0.4px', animationDelay: `${d + i * 0.5}s`, animationDuration: '3.4s' }} />
            ))}
            {!finished && <g transform="skewX(-18)"><rect className="hb-glint" x={cx - 30} y="30" width="5" height="95" fill="#fff" opacity="0.45" style={{ animationDelay: `${0.25 * i}s` }} /></g>}
            <rect x={cx - 6} y="66" width="2.4" height="50" rx="1.2" fill="#fff" opacity="0.4" />
          </g>
          <path d={bottlePath(cx)} fill="none" stroke={glass} strokeWidth="1.2" />
          {finished && (beerBottle
            ? <rect x={cx - 3.8} y={bottleTop - 2.5} width="7.6" height="3" rx="0.8" fill="#c9a227" />
            : <rect x={cx - 4} y={bottleTop - 1} width="8" height="9" rx="1" fill="#7a1f2b" />)}
          {finished && <g transform={`translate(${cx - (beerBottle ? 7 : 8)} ${beerBottle ? 92 : 84})`}><rect width={beerBottle ? 14 : 16} height={beerBottle ? 14 : 16} rx="1.5" fill="#fff" stroke="#d6b77a" strokeWidth="0.8" /><path d={`M3 5 H${beerBottle ? 11 : 13} M3 9 H${beerBottle ? 9 : 11}`} stroke="#b08b4f" strokeWidth="1.1" /></g>}
        </g>
      ))}
      {finished && [[80, 22], [20, 30], [150, 40]].map(([x, y], i) => (
        <path key={i} className="hb-star" d={`M${x} ${y - 5} L${x + 1.5} ${y - 1.5} L${x + 5} ${y} L${x + 1.5} ${y + 1.5} L${x} ${y + 5} L${x - 1.5} ${y + 1.5} L${x - 5} ${y} L${x - 1.5} ${y - 1.5} Z`} fill="#fbbf24" style={{ animationDelay: `${i * 0.6}s` }} />
      ))}
    </svg>
  );
}

// Where a brew is in its life: planning → fermenting → clearing → bottled → finished.
// Tap a step to move the brew on (or back) to it.
function StatusTrack({ status, isDark, onPick, busy }) {
  const at = TRACK.indexOf(status);
  return (
    <div className="flex items-center gap-1 w-full">
      {TRACK.map((s, i) => (
        <React.Fragment key={s}>
          <button type="button" onClick={() => s !== status && onPick?.(s)} disabled={!onPick || busy || s === status}
            title={s === status ? `It's ${STATUS_WORD[s].toLowerCase()} now` : `Move it to ${STATUS_WORD[s]}`}
            className={`group flex flex-col items-center gap-1 min-w-0 disabled:cursor-default ${s === status ? '' : 'cursor-pointer'}`}>
            <span className={`w-3 h-3 rounded-full transition ${i <= at ? `bg-gradient-to-r ${GRADIENT}` : isDark ? 'bg-white/10 group-hover:bg-amber-500/50' : 'bg-[#2E2B27]/10 group-hover:bg-amber-500/50'} ${i === at ? 'ring-4 ring-amber-500/25' : 'group-hover:ring-4 group-hover:ring-amber-500/15'}`} />
            <span className={`text-[10px] truncate transition ${i === at ? 'font-bold text-amber-500' : 'text-slate-500 group-hover:text-amber-500'}`}>{STATUS_WORD[s]}</span>
          </button>
          {i < TRACK.length - 1 && <div className={`flex-1 h-0.5 mb-4 rounded-full ${i < at ? 'bg-amber-500' : isDark ? 'bg-white/10' : 'bg-[#2E2B27]/10'}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

// Abbreviations - every one shown on the page can be hovered for what it means. Units only count straight after a
// number ("4 L", "28 g"), so the L in a yeast name or the g in a word aren't taken for litres or grams.
const ABBR = {
  OG: 'Original gravity - how much sugar is in the wort or must before it ferments',
  FG: 'Final gravity - the gravity once fermentation has finished',
  SG: 'Specific gravity - the density of the liquid compared with water',
  'S.G.': 'Specific gravity - the density of the liquid compared with water (1.000); it falls as sugar becomes alcohol',
  'CO₂': 'Carbon dioxide - the gas that makes it fizzy',
  ICV: 'Institut Coopératif du Vin - the French wine institute behind the D-47 and other Lalvin yeast strains',
  ABV: 'Alcohol by volume',
  IBU: 'International Bitterness Units - how bitter the hops make it',
  AA: 'Alpha acid - the bittering strength of a hop variety',
  BIAB: 'Brew in a bag - all-grain brewing with the grain held in a mesh bag in the kettle',
  DME: 'Dry malt extract',
  LME: 'Liquid malt extract',
  TOSNA: 'Tailored Organic Staggered Nutrient Addition - feeding yeast nutrient in doses over the first days',
  CO2: 'Carbon dioxide - the gas that makes it fizzy',
  CCV: 'Cylindro-conical vessel - a commercial fermenting tank',
  ppm: 'Parts per million',
  pH: 'How acidic it is - lower is more acidic',
  bbl: 'US beer barrel - about 117 litres',
  EBC: 'European Brewery Convention colour scale - how dark a beer or malt is (pale lager about 8, stout 80+)',
  SRM: 'Standard Reference Method - the American beer colour scale (pale lager about 4, stout 40+); about half the EBC number',
  IPA: 'India Pale Ale - a strong, very hoppy pale ale',
  AG: 'All-grain - brewed from grain with a mash, not from malt extract',
  LW: 'A brand of brewing water salts (LW Mild Ale Crystals)',
  BJCP: 'Beer Judge Certification Program - the style guidelines used in beer competitions',
  UK: 'United Kingdom - imperial measures (a UK gallon is 4.546 litres)',
  NZ: 'New Zealand',
  '1/3 break': 'The one-third sugar break - the gravity at which a third of the sugar has been eaten; the last nutrient dose is due by then',
  '°P': 'Degrees Plato - a sugar-content scale; 1°P is about 0.004 of gravity',
  '°L': 'Degrees Lovibond - the colour of a malt; higher is darker',
  '°C': 'Degrees Celsius',
  '°F': 'Degrees Fahrenheit',
  'US gal': 'US gallon - 3.785 litres (a UK gallon is 4.546)',
  'US qt': 'US quart - 0.946 litres',
  'US pt': 'US pint - 473 ml (a UK pint is 568 ml)',
  'g/L': 'Grams per litre', kg: 'Kilograms', g: 'Grams', L: 'Litres', ml: 'Millilitres', lb: 'Pounds (0.454 kg)', oz: 'Ounces (28.35 g)',
  tsp: 'Teaspoon - about 5 ml', tbsp: 'Tablespoon - about 15 ml', min: 'Minutes',
};
const ABBR_UNITS = new Set(['kg', 'g', 'L', 'ml', 'lb', 'oz', 'tsp', 'tbsp', 'min', 'US gal', 'US qt', 'US pt', 'bbl']);
const ABBR_RE = new RegExp(`(?<![A-Za-z])(${Object.keys(ABBR).sort((a, b) => b.length - a.length).map(escRe).join('|')})(?![A-Za-z])`, 'g');
function abbrMatches(text) {
  const s = String(text ?? '');
  const out = [];
  for (const m of s.matchAll(ABBR_RE)) {
    const key = m[1];
    if (ABBR_UNITS.has(key) && !/\d\s?$/.test(s.slice(0, m.index))) continue; // a unit only after a number
    out.push({ key, index: m.index });
  }
  return out;
}
// the abbreviations in a piece of text, for the hover on boxes whose text can't carry markup
const abbrTitle = (...texts) => {
  const seen = [...new Set(texts.flatMap((t) => abbrMatches(t).map((m) => m.key)))];
  return seen.length ? seen.map((k) => `${k}: ${ABBR[k]}`).join('\n') : undefined;
};
function Ab({ k, children }) {
  return <abbr title={ABBR[k]} className="cursor-help no-underline border-b border-dotted border-current">{children ?? k}</abbr>;
}
// text with every abbreviation in it hoverable
function AbbrText({ text }) {
  const s = String(text ?? '');
  const parts = [];
  let at = 0;
  for (const { key, index } of abbrMatches(s)) {
    if (index > at) parts.push(s.slice(at, index));
    parts.push(<Ab key={index} k={key} />);
    at = index + key.length;
  }
  if (at < s.length) parts.push(s.slice(at));
  return <>{parts}</>;
}
// A brewing term with its plain-English meaning: hover on a computer, tap on a phone (tap again or elsewhere to close).
function Term({ text, meaning }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline group">
      <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); } if (e.key === 'Escape') setOpen(false); }}
        className="cursor-help border-b border-dotted border-amber-500/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 rounded-sm">{text}</span>
      <span role="tooltip" className={`absolute left-0 top-full z-40 mt-1 w-64 max-w-[80vw] rounded-lg px-3 py-2 text-xs leading-snug font-normal normal-case tracking-normal shadow-xl bg-slate-900 text-slate-100 ring-1 ring-white/10 ${open ? 'block' : 'hidden group-hover:block'}`}>
        <b className="block text-amber-400 mb-0.5">{text}</b>{meaning}
      </span>
    </span>
  );
}
// Text with every brewing term and abbreviation in it explained on hover / tap
function RichText({ text }) {
  const s = String(text ?? '');
  const marks = [
    ...glossMatches(s).map((g) => ({ index: g.index, length: g.length, el: (k) => <Term key={k} text={s.slice(g.index, g.index + g.length)} meaning={g.meaning} /> })),
    ...abbrMatches(s).map((a) => ({ index: a.index, length: a.key.length, el: (k) => <Ab key={k} k={a.key} /> })),
  ].sort((a, b) => a.index - b.index || b.length - a.length);
  const parts = [];
  let at = 0;
  for (const m of marks) {
    if (m.index < at) continue; // overlaps an earlier, longer term
    if (m.index > at) parts.push(s.slice(at, m.index));
    parts.push(m.el(m.index));
    at = m.index + m.length;
  }
  if (at < s.length) parts.push(s.slice(at));
  return <>{parts}</>;
}
// Every brewing term and abbreviation a recipe uses, with what it means - readable without hovering
function TermsPanel({ texts, border }) {
  const terms = glossTerms(...texts);
  const abbrs = [...new Set(texts.flatMap((t) => abbrMatches(t).map((m) => m.key)))].filter((k) => !ABBR_UNITS.has(k) && !['°C', '°F'].includes(k));
  if (!terms.length && !abbrs.length) return null;
  return (
    <details className={`mt-4 pt-3 border-t ${border} group/terms`} open>
      <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-slate-500 select-none">Terms in this recipe - what they mean ({terms.length + abbrs.length})</summary>
      <dl className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2 text-xs">
        {terms.map((t) => <div key={t.term}><dt className="inline font-bold text-amber-600">{t.term}: </dt><dd className="inline text-slate-500">{t.meaning}</dd></div>)}
        {abbrs.map((k) => <div key={k}><dt className="inline font-bold text-amber-600">{k}: </dt><dd className="inline text-slate-500">{ABBR[k]}</dd></div>)}
      </dl>
    </details>
  );
}
// every abbreviation used in a recipe, as hoverable chips
function AbbrStrip({ texts, border }) {
  const keys = [...new Set(texts.flatMap((t) => abbrMatches(t).map((m) => m.key)))];
  if (!keys.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 mt-4 pt-3 border-t ${border}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1">Abbreviations in this recipe</span>
      {keys.map((k) => <span key={k} className={`text-[11px] px-2 py-0.5 rounded-full border ${border}`}><Ab k={k} /></span>)}
    </div>
  );
}

function Bars({ values, compare, isDark }) {
  return (
    <div className="flex flex-col gap-1.5">
      {PROFILE_KEYS.filter(([k]) => values?.[k] != null || compare?.[k] != null).map(([k, label]) => (
        <div key={k} className="flex items-center gap-2 text-[11px]">
          <span className="w-24 shrink-0 text-slate-500">{label}</span>
          <div className={`flex-1 h-2 rounded-full relative ${isDark ? 'bg-white/10' : 'bg-[#2E2B27]/10'}`}>
            {compare?.[k] != null && <div className="absolute inset-y-0 left-0 rounded-full bg-slate-400/50" style={{ width: `${(compare[k] / 5) * 100}%` }} />}
            {values?.[k] != null && <div className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${GRADIENT} ${compare ? 'h-1 top-0.5' : ''}`} style={{ width: `${(values[k] / 5) * 100}%` }} />}
          </div>
          <span className="w-10 shrink-0 text-right">{compare?.[k] != null ? `${compare[k]}→` : ''}{values?.[k] ?? '-'}</span>
        </div>
      ))}
    </div>
  );
}

function GravityChart({ logs, og, thirdBreak, isDark }) {
  const pts = logs.filter((l) => l.gravity).map((l) => ({ t: l.at, g: l.gravity }));
  if (pts.length < 2) return <p className="text-[11px] text-slate-500">Log two or more gravity readings to see the fermentation curve.</p>;
  const W = 600, H = 160, pad = 28;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
  const gs = pts.map((p) => p.g).concat(thirdBreak ? [thirdBreak] : []);
  const gMax = Math.max(...gs, og || 0) + 0.003, gMin = Math.min(...gs) - 0.003;
  const x = (t) => pad + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad * 2);
  const y = (g) => pad / 2 + ((gMax - g) / Math.max(0.001, gMax - gMin)) * (H - pad);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {thirdBreak && <><line x1={pad} x2={W - pad} y1={y(thirdBreak)} y2={y(thirdBreak)} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity="0.6" />
        <text x={W - pad} y={y(thirdBreak) - 4} textAnchor="end" fontSize="10" fill="#f59e0b">1/3 break {thirdBreak.toFixed(3)}</text></>}
      <polyline fill="none" stroke="#f97316" strokeWidth="2.5" points={pts.map((p) => `${x(p.t)},${y(p.g)}`).join(' ')} />
      {pts.map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.g)} r="3.5" fill="#f97316" />)}
      <text x={pad} y={H - 4} fontSize="10" fill={isDark ? '#94a3b8' : '#64748b'}>{new Date(t0).toLocaleDateString('en-GB')}</text>
      <text x={W - pad} y={H - 4} textAnchor="end" fontSize="10" fill={isDark ? '#94a3b8' : '#64748b'}>{new Date(t1).toLocaleDateString('en-GB')}</text>
      <text x={4} y={y(gMax - 0.003) + 3} fontSize="10" fill={isDark ? '#94a3b8' : '#64748b'}>{(gMax - 0.003).toFixed(3)}</text>
      <text x={4} y={y(gMin + 0.003) + 3} fontSize="10" fill={isDark ? '#94a3b8' : '#64748b'}>{(gMin + 0.003).toFixed(3)}</text>
    </svg>
  );
}

// Every brew and recipe has its own address - /ims/homebrew/recipe/412-broom-wine - so it can be opened in a new tab
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const brewPath = (b) => `/ims/homebrew/${b.isRecipe ? 'recipe' : 'brew'}/${b.id}${slug(b.name) ? `-${slug(b.name)}` : ''}`;
const shelfPath = (view) => (view === 'recipes' ? '/ims/homebrew/recipes' : '/ims/homebrew');
const fromPath = (p) => {
  const m = String(p).match(/^\/ims\/homebrew\/(recipe|brew)\/(\d+)/);
  if (m) return { id: Number(m[2]), view: m[1] === 'recipe' ? 'recipes' : 'brews' };
  return { id: null, view: /^\/ims\/homebrew\/recipes\b/.test(p) ? 'recipes' : 'brews' };
};
function HomebrewInviteModal({ isOpen, onClose, isDark, toast }) {
  const [list, setList] = useState([]);
  const [signIns, setSignIns] = useState([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/homebrew/invites');
      const d = await res.json();
      if (d.success) {
        setList(d.invites || []);
        setSignIns(d.signIns || []);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  if (!isOpen) return null;

  const link = `${window.location.origin}/ims/homebrew?invite=1`;

  const addInvite = async (targetEmail) => {
    const e = (targetEmail || email).trim();
    if (!e) return;
    setBusy(true);
    try {
      const res = await fetch('/api/homebrew/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e }),
      });
      const d = await res.json();
      if (d.success) {
        setEmail('');
        load();
        if (toast) toast(`${d.invite.email} can now sign in to Homebrew.`);
      } else {
        if (toast) toast(d.error || 'Failed to send invite', 'error');
      }
    } catch (err) {
      if (toast) toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (e) => {
    if (!window.confirm(`Stop ${e} accessing Homebrew?`)) return;
    try {
      const res = await fetch(`/api/homebrew/invites/${encodeURIComponent(e)}`, { method: 'DELETE' });
      const d = await res.json();
      if (d.success) {
        load();
        if (toast) toast(`Access withdrawn for ${e}`);
      }
    } catch (err) {
      if (toast) toast(err.message, 'error');
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (toast) toast('Homebrew invite link copied to clipboard.');
    });
  };

  const mailtoInvite = (e) => `mailto:${e}?subject=${encodeURIComponent('Join my Homebrew Portal')}&body=${encodeURIComponent(`Hi,\n\nI've added you to my Homebrew Portal on IMS. Open this link and sign in with your Google account (${e}):\n\n${link}\n\nYou'll get access to all my meads, wines, beers, and 140+ craft recipes with what-if flavour predictions.\n\nCheers,\nSimon`)}`;

  const mailtoDaniel = (e = 'daniel.philpott@gmail.com') => `mailto:${e}?subject=${encodeURIComponent('Join my Homebrew Portal')}&body=${encodeURIComponent(`Hi Daniel,\n\nI've added you to my Homebrew Portal. Open this link and sign in with your Google account (${e}):\n\n${link}\n\nYou can browse all my mead, cider and wine batches, explore the recipe book, and try out the flavour predictor.\n\nCheers,\nSimon`)}`;

  const isDanielInvited = list.some((x) => x.email?.toLowerCase().includes('daniel') && !x.revokedAt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border p-6 shadow-2xl ${isDark ? 'bg-slate-900 border-white/10 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}>
        <button onClick={onClose} className={`absolute top-5 right-5 p-2 rounded-xl transition-colors ${isDark ? 'bg-white/5 hover:bg-white/10 text-slate-400' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 flex items-center justify-center text-amber-500">
            <UserPlus size={20} />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight">Share Homebrew Service</h2>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Invite friends & family to your Homebrew Portal via basic Google sign-in</p>
          </div>
        </div>

        {/* Quick invite preset for Daniel Philpott */}
        <div className={`p-4 rounded-2xl border mb-5 ${isDark ? 'bg-amber-950/20 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-bold flex items-center gap-1.5 text-amber-500">
                <User size={15} /> Daniel Philpott
              </div>
              <div className={`text-xs mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {isDanielInvited ? 'Active guest access granted' : 'Quick one-click invite for your brother'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a href={mailtoDaniel()} className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${isDark ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300' : 'bg-amber-100 hover:bg-amber-200 text-amber-800'}`}>
                <Mail size={13} /> Email Daniel
              </a>
              {!isDanielInvited && (
                <button
                  disabled={busy}
                  onClick={() => addInvite('daniel.philpott@gmail.com')}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1.5 shadow-md shadow-amber-500/20"
                >
                  <UserPlus size={13} /> Authorise Daniel
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Invite by Email */}
        <div className="mb-5">
          <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Invite by Email
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addInvite()}
              placeholder="friend.or.family@gmail.com"
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm border outline-none transition-all ${
                isDark ? 'bg-slate-950/60 border-white/10 text-white focus:border-amber-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-amber-500'
              }`}
            />
            <button
              onClick={() => addInvite()}
              disabled={busy || !email.trim()}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-600 active:scale-95 text-white disabled:opacity-40 transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20"
            >
              <UserPlus size={16} /> Invite
            </button>
          </div>
          <p className={`text-[11px] mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            They sign in with Google (email and display name only). Nothing else in IMS is exposed to them.
          </p>
        </div>

        {/* Service Invite Link */}
        <div className={`p-4 rounded-2xl border mb-5 ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs font-bold flex items-center gap-1.5 text-slate-400">
              <Link2 size={13} /> Direct Service Link
            </div>
            <button
              onClick={copyLink}
              className={`text-xs font-bold flex items-center gap-1.5 px-3 py-1 rounded-lg transition-colors ${
                copied ? 'bg-emerald-500/20 text-emerald-400' : isDark ? 'bg-white/10 hover:bg-white/15 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
              }`}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <code className={`block text-xs font-mono break-all p-2 rounded-lg ${isDark ? 'bg-black/40 text-amber-300' : 'bg-white text-amber-700 border border-slate-200'}`}>
            {link}
          </code>
        </div>

        {/* Current Invited Guests */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Users size={14} /> Invited Guests ({list.length})
            </h3>
            <button onClick={load} className={`p-1.5 rounded-lg text-slate-400 hover:text-white ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`} title="Refresh">
              <RefreshCw size={13} />
            </button>
          </div>

          {list.length === 0 ? (
            <div className={`text-center py-6 border border-dashed rounded-2xl ${isDark ? 'border-white/10 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
              <Users size={24} className="mx-auto mb-2 opacity-40" />
              <p className="text-xs">No guest invites yet. Authorise someone above to grant access.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {list.map((inv) => (
                <div
                  key={inv.email}
                  className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${
                    inv.revokedAt
                      ? isDark ? 'bg-white/2 border-white/5 opacity-50' : 'bg-slate-50 border-slate-200 opacity-50'
                      : isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate flex items-center gap-2">
                      {inv.name || inv.email}
                      {inv.revokedAt ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Revoked</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Active</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {inv.name ? `${inv.email} · ` : ''}
                      {inv.lastSignInAt
                        ? `Last in ${new Date(inv.lastSignInAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}`
                        : 'Not signed in yet'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!inv.revokedAt ? (
                      <>
                        <a
                          href={mailtoInvite(inv.email)}
                          title="Email invite"
                          className={`p-2 rounded-xl text-xs font-semibold ${isDark ? 'bg-white/10 hover:bg-white/15 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                        >
                          <Mail size={13} />
                        </a>
                        <button
                          onClick={() => revoke(inv.email)}
                          title="Withdraw access"
                          className="p-2 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => addInvite(inv.email)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold ${isDark ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300' : 'bg-amber-100 hover:bg-amber-200 text-amber-800'}`}
                      >
                        Re-invite
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent sign-in attempts */}
        {signIns.length > 0 && (
          <div className="mt-5 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Recent Sign-in Attempts</span>
              <button onClick={load} className={`p-1 rounded ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`} title="Refresh">
                <RefreshCw size={11} className="text-slate-400" />
              </button>
            </div>
            <div className="space-y-1">
              {signIns.slice(0, 5).map((x, i) => (
                <div key={i} className="text-[11px] py-0.5 flex gap-2">
                  <span className="text-slate-400">{new Date(x.at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  <span className={x.outcome === 'signed-in' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>{x.outcome}</span>
                  <span className="truncate text-slate-300">{x.email || '(unknown)'}{x.detail ? <span className="text-slate-400"> · {x.detail}</span> : null}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HomebrewPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const { user } = useAuth();
  const isOwner = !user?.guest;
  const [inviteOpen, setInviteOpen] = useState(false);
  const isDark = theme === 'dark';
  const [brews, setBrews] = useState([]);
  const [meta, setMeta] = useState({ styles: [], statuses: [], logKinds: [], categories: [] });
  const [recipes, setRecipes] = useState([]);
  const [view, setView] = useState(() => fromPath(window.location.pathname).view); // 'brews' | 'recipes'
  const [cat, setCat] = useState('all');
  const [have, setHave] = useState(''); // the ingredient finder - what Simon has to use up
  const [pickGroup, setPickGroup] = useState('fruit'); // which group of the ingredient picker is open
  const [favOnly, setFavOnly] = useState(false); // show only favourites
  const [filtersOpen, setFiltersOpen] = useState(false); // on a phone the filters fold away until tapped
  const [haveOpen, setHaveOpen] = useState(''); // on a phone, the "What have you got?" group that's open
  const [acids, setAcids] = useState([]); // acidity to show (none picked = all)
  const [fizzes, setFizzes] = useState([]); // still / sparkling
  const [flavs, setFlavs] = useState([]); // flavours it must have - each one picked narrows it further
  const [sweets, setSweets] = useState([]); // sweetness to show (none picked = all)
  const [editRecipe, setEditRecipe] = useState(false); // a recipe opens to read; this switches to the edit form
  const [shareInfo, setShareInfo] = useState(null); // the share link just made: { id, url, reachable }
  const [pdfReady, setPdfReady] = useState(null); // a PDF made but waiting for a tap to send it
  const [abvPick, setAbvPick] = useState(null); // strength range picked on the slider, [low, high] - null = any
  useFocusItem(brews.length);
  const [selId, setSelId] = useState(() => fromPath(window.location.pathname).id);
  const [creating, setCreating] = useState(false); // the new-brew form is open
  const [brew, setBrew] = useState(null);
  const main = useMainIngredients(brew?.id);
  const [form, setForm] = useState(EMPTY_BREW);
  const [tab, setTab] = useState('recipe');
  const [busy, setBusy] = useState('');
  const [logForm, setLogForm] = useState({ kind: 'reading', gravity: '', tempC: '', ph: '', text: '', at: '' });
  const [taste, setTaste] = useState({ stage: '', rating: 7, sweetness: 3, body: 3, acidity: 3, heat: 2, aroma: '', flavour: '', clarity: '', carbonation: '', verdict: '', changeNext: '' });
  const [change, setChange] = useState('');
  const [whatIf, setWhatIf] = useState(null);
  const [notification, setNotification] = useState(null);
  const notify = (msg, type = 'success') => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3500); };
  const [mobileUX, setMobileUX] = useState(() => {
    try { return localStorage.getItem('ims_homebrew_mobile_ux') || 'phase1'; } catch (_) { return 'phase1'; }
  });
  const switchMobileUX = (mode) => {
    setMobileUX(mode);
    try { localStorage.setItem('ims_homebrew_mobile_ux', mode); } catch (_) {}
  };

  const panel = `rounded-2xl border p-5 min-w-0 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const border = isDark ? 'border-white/10' : 'border-[#2E2B27]/10';
  const field = `w-full px-3 py-2 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/15 text-[#2E2B27]'}`;
  const label = 'text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block';
  const btn = `px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${border}`;
  const primary = `px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r ${GRADIENT} text-white disabled:opacity-40`;

  const api = async (url, method = 'GET', body) => {
    const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.success === false) throw new Error(d.error || 'That did not work.');
    return d;
  };
  const loadList = useCallback(async () => {
    try { const d = await api('/api/homebrew'); setBrews(d.brews); setRecipes(d.recipes || []); setMeta({ styles: d.styles, statuses: d.statuses, logKinds: d.logKinds, categories: d.categories || [] }); } catch (err) { notify(err.message, 'error'); }
  }, []);
  const loadBrew = useCallback(async (id) => {
    if (!id) { setBrew(null); setForm(EMPTY_BREW); return; }
    try {
      const d = await api(`/api/homebrew/${id}`);
      setBrew(d.brew);
      setView(d.brew.isRecipe ? 'recipes' : 'brews');
      const b = d.brew;
      setForm({ ...EMPTY_BREW, ...Object.fromEntries(Object.keys(EMPTY_BREW).map((k) => [k, b[k] ?? EMPTY_BREW[k]])), ingredients: b.ingredients || [] });
    } catch (err) { notify(err.message, 'error'); }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadBrew(selId); setEditRecipe(false); }, [selId, loadBrew]);
  const fromPop = useRef(false);
  useEffect(() => {
    if (selId != null && brew?.id !== selId) return; // wait for it to load so the address has its name
    const target = selId != null ? brewPath(brew) : shelfPath(view);
    const here = window.location.pathname;
    if (target !== here) {
      const sameItem = selId != null && fromPath(here).id === selId; // only the name part changed
      if (fromPop.current || sameItem) window.history.replaceState(null, '', target); else window.history.pushState(null, '', target);
    }
    fromPop.current = false;
  }, [selId, brew, view]);
  useEffect(() => {
    const onPop = () => {
      const r = fromPath(window.location.pathname);
      fromPop.current = true;
      setCreating(false); setWhatIf(null); setView(r.view); setSelId(r.id);
      if (r.id == null) setBrew(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const run = async (key, fn, ok) => { setBusy(key); try { await fn(); if (ok) notify(ok); } catch (err) { notify(err.message, 'error'); } finally { setBusy(''); } };
  const saveBrew = () => run('save', async () => {
    const d = await api(brew ? `/api/homebrew/${brew.id}` : '/api/homebrew', brew ? 'PUT' : 'POST', brew ? form : { ...form, isRecipe: view === 'recipes' });
    await loadList(); setCreating(false); setSelId(d.brew.id); setBrew(d.brew); setEditRecipe(false);
  }, 'Brew saved.');
  const removeBrew = () => { if (!window.confirm(`Delete "${brew.name}" and everything logged for it?`)) return; run('del', async () => { await api(`/api/homebrew/${brew.id}`, 'DELETE'); setSelId(null); setCreating(false); await loadList(); }, 'Deleted.'); };
  const addLog = () => run('log', async () => {
    const d = await api(`/api/homebrew/${brew.id}/logs`, 'POST', { ...logForm, at: logForm.at || undefined });
    setBrew(d.brew); setLogForm({ kind: logForm.kind, gravity: '', tempC: '', ph: '', text: '', at: '' }); loadList();
  }, 'Logged.');
  const delLog = (id) => run('dlog', async () => { await api(`/api/homebrew/logs/${id}`, 'DELETE'); loadBrew(brew.id); });
  const addTaste = () => run('taste', async () => { const d = await api(`/api/homebrew/${brew.id}/tastings`, 'POST', taste); setBrew(d.brew); loadList(); }, 'Tasting saved.');
  const delTaste = (id) => run('dtaste', async () => { await api(`/api/homebrew/tastings/${id}`, 'DELETE'); loadBrew(brew.id); });
  const getInsight = () => run('insight', async () => { const d = await api(`/api/homebrew/${brew.id}/insight`, 'POST', {}); setBrew(d.brew); });
  const askWhatIf = () => run('whatif', async () => { const d = await api(`/api/homebrew/${brew.id}/what-if`, 'POST', { change }); setWhatIf(d.result); });
  const pitched = () => {
    if (!window.confirm('Set reminders for the staggered nutrient doses (24, 48 and 72 hours from now, and a 1/3-break check on day 6), and for each step of the method still to come?')) return;
    run('remind', async () => {
      await api(`/api/homebrew/${brew.id}/nutrient-reminders`, 'POST', {});
      let steps = 0;
      try { steps = (await api(`/api/homebrew/${brew.id}/step-reminders`, 'POST', { justPitched: true })).reminders.length; } catch (_) { /* no method steps to time */ }
      loadBrew(brew.id);
      notify(`Nutrient reminders set${steps ? `, and ${steps} for the steps to come` : ''} - see Reminders.`);
    });
  };
  // a tap on the progress track: move it on (or back). The start and bottling dates are filled in with today if
  // they're empty, the move goes in the log, and starting it off offers the pitching reminders.
  const moveTo = (status) => run('stage', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
    const body = { status };
    if (status === 'fermenting' && !brew.startedOn) body.startedOn = today;
    if (status === 'bottled' && !brew.bottledOn) body.bottledOn = today;
    const from = brew.status;
    // the log first: a log entry on a planned brew starts it off by itself, so the status is set after it
    await api(`/api/homebrew/${brew.id}/logs`, 'POST', { kind: 'note', text: `${STATUS_WORD[from] || from} → ${STATUS_WORD[status]}` });
    await api(`/api/homebrew/${brew.id}`, 'PUT', body);
    await loadBrew(brew.id); await loadList();
    notify(`${brew.name}: ${STATUS_WORD[status].toLowerCase()}.`);
    if (from === 'planning' && status === 'fermenting') pitched();
  });
  // the method's steps still to come as reminders, planned again from today (replaces this brew's earlier step reminders)
  const stepReminders = () => run('steps', async () => {
    const d = await api(`/api/homebrew/${brew.id}/step-reminders`, 'POST', {});
    loadBrew(brew.id);
    notify(`${d.reminders.length} step reminder${d.reminders.length === 1 ? '' : 's'} set - the first on ${d.reminders[0].goesOffAt}. See the Log for the list.`);
  });

  const startFrom = () => run('start', async () => { const d = await api(`/api/homebrew/${brew.id}/start`, 'POST', {}); await loadList(); setView('brews'); setSelId(d.brew.id); setTab('recipe'); }, 'New brew started from the recipe - edit it to suit, then log as you go.');
  const keepAsRecipe = () => run('keep', async () => { await api(`/api/homebrew/${brew.id}/save-as-recipe`, 'POST', {}); await loadList(); }, 'Saved to your recipe book.');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const catLabel = (id) => (meta.categories.find((x) => x.id === id) || {}).label || '';
  const stylesFor = (id) => (meta.categories.find((x) => x.id === id) || {}).styles || meta.styles;
  const wanted = view === 'recipes' ? wantedOf(have) : []; // the ingredient finder is for the recipe book only
  const hitsFor = (b) => (wanted.length ? ingredientHits(b, wanted) : { n: 0, hits: [] });
  const finds = (list) => list.map((b) => ({ b, ...hitsFor(b) })).filter((x) => x.n > 0)
    .sort((x, y) => y.n - x.n || (y.hits[0]?.type === 'fruit') - (x.hits[0]?.type === 'fruit') || x.b.name.localeCompare(y.b.name));
  // a tile matches its category - or, for Red / White / Rosé, any wine of that colour
  const inTile = (b, id) => id === 'all' || b.category === id || (COLOUR_TILE[id] && colourOf(b) === COLOUR_TILE[id]);
  // the taste filters; a chip's count leaves its own group out, so it shows what picking it would give
  const TASTE = {
    sweet: (b) => !sweets.length || sweets.includes(sweetOf(b)),
    acid: (b) => !acids.length || acids.includes(b.acidity),
    fizz: (b) => !fizzes.length || fizzes.includes(b.fizz),
    flav: (b) => flavs.every((f) => (b.flavours || []).includes(f)),
  };
  const tagsOk = (b, skip) => Object.entries(TASTE).every(([k, ok]) => k === skip || ok(b));
  const tasteOn = sweets.length + acids.length + fizzes.length + flavs.length > 0;
  const clearTaste = () => { setSweets([]); setAcids([]); setFizzes([]); setFlavs([]); setAbvPick(null); };
  // the strength slider's ends are the weakest and strongest of whatever the other filters leave
  const strengthPool = (view === 'recipes' ? recipes : brews).filter((b) => inTile(b, cat) && (!favOnly || b.favourite) && tagsOk(b) && (!wanted.length || hitsFor(b).n > 0));
  const strengths = strengthPool.map(strengthOf).filter((v) => v != null);
  const abvMin = strengths.length ? Math.floor(Math.min(...strengths)) : 0;
  const abvMax = strengths.length ? Math.ceil(Math.max(...strengths)) : 0;
  const abvLo = abvPick ? Math.max(abvMin, Math.min(abvPick[0], abvMax)) : abvMin;
  const abvHi = abvPick ? Math.min(abvMax, Math.max(abvPick[1], abvMin)) : abvMax;
  const abvOn = Boolean(abvPick) && (abvLo > abvMin || abvHi < abvMax);
  const strengthOk = (b) => { if (!abvOn) return true; const v = strengthOf(b); return v != null && v >= abvLo && v <= abvHi; };
  const inCat = (b) => inTile(b, cat) && (!favOnly || b.favourite) && tagsOk(b) && strengthOk(b);
  const shownHits = wanted.length ? finds((view === 'recipes' ? recipes : brews).filter(inCat)) : null;
  const shown = shownHits ? shownHits.map((x) => x.b) : (view === 'recipes' ? recipes : brews).filter(inCat);
  const hitMap = new Map((shownHits || []).map((x) => [x.b.id, x]));
  // in the recipe book each drink is one card, holding every version that passes the filters (best match first)
  const groupCards = (list) => {
    const byKey = new Map();
    for (const b of list) { const k = famKey(b); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(b); }
    return [...byKey.entries()].map(([key, members]) => ({ key, members, rep: members.find((m) => m.favourite) || members[0] }));
  };
  const cards = view === 'recipes' ? groupCards(shown) : shown.map((b) => ({ key: b.id, members: [b], rep: b }));
  const familyOf = (b) => (b?.isRecipe ? recipes.filter((r) => famKey(r) === famKey(b)) : []);
  const toggleIn = (list, setList, v) => setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  // the picker: every grown ingredient that turns up in the recipe book, by group, A-Z. Its number is how many cards
  // you'd see below if you picked it - same tile and filters, a drink with several versions counting once.
  const recipeText = React.useMemo(() => recipes.map((r) => ({ r, t: [r.name, ...(r.ingredients || []).map((g) => String(g.name || '').replace(/\(.*?\)/g, ''))].join(' | ') })), [recipes]);
  const pickBase = React.useMemo(() => PRODUCE_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => recipeText.some((x) => i.re.test(x.t)))
    .sort((a, b) => a.w.localeCompare(b.w)) })).filter((g) => g.items.length), [recipeText]);
  const inShelf = recipeText.filter((x) => inCat(x.r));
  const pickGroups = pickBase.map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, n: new Set(inShelf.filter((x) => i.re.test(x.t)).map((x) => famKey(x.r))).size })) }));
  // Sharing a recipe: a link (the phone's share sheet - WhatsApp and the like - or copied on a computer), the PDF
  // itself, or a PDF download. A phone only lets a page open the share sheet straight after a tap, so if making the
  // PDF takes too long the file is held ready behind a "Send it" button.
  const shareLink = () => run('share', async () => {
    const d = await api(`/api/homebrew/${brew.id}/share`, 'POST', {});
    setShareInfo({ id: brew.id, url: d.url, reachable: d.reachable });
    setBrew((b) => (b ? { ...b, shared: true } : b));
    if (navigator.share) {
      try { await navigator.share({ title: brew.name, text: `${brew.name} - a homebrew recipe`, url: d.url }); return; } catch (err) { if (err.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(d.url); notify('Link copied - paste it into WhatsApp, a text or an email.'); } catch { notify('Here\'s the link - copy it from below.'); }
  });
  const pdfFile = async () => {
    const res = await fetch(`/api/homebrew/${brew.id}/pdf`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Couldn\'t make the PDF.');
    return new File([await res.blob()], `${brew.name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Recipe'}.pdf`, { type: 'application/pdf' });
  };
  const saveFile = (file) => { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const sendFile = async (file) => {
    try { await navigator.share({ files: [file], title: brew.name }); setPdfReady(null); } catch (err) {
      if (err.name === 'AbortError') { setPdfReady(null); return; }
      if (err.name === 'NotAllowedError') { setPdfReady(file); return; } // the tap has expired - ask for another
      throw err;
    }
  };
  const sendPdf = () => run('pdf-send', async () => {
    const file = await pdfFile();
    if (navigator.canShare?.({ files: [file] })) await sendFile(file);
    else { saveFile(file); notify('This browser can\'t send files - the PDF has been downloaded instead.'); }
  });
  const downloadPdf = () => run('pdf-save', async () => saveFile(await pdfFile()));
  // bottle labels to print: A4 sheets of 10 (2 x 5); asks how many, suggesting a label for each bottle the batch fills
  // bottle labels to print (A4 sheets of 10): the name, lettering and how many are chosen in LabelsDialog
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [pictureOpen, setPictureOpen] = useState(false);
  const printLabels = () => setLabelsOpen(true);
  const labelsMade = (file, n) => { setLabelsOpen(false); saveFile(file); notify(`${n} label${n === 1 ? '' : 's'} ready to print - ${Math.ceil(n / 10)} A4 sheet${n > 10 ? 's' : ''}.`); };
  const stopSharing = () => run('unshare', async () => { await api(`/api/homebrew/${brew.id}/share`, 'DELETE'); setShareInfo(null); setBrew((b) => (b ? { ...b, shared: false } : b)); }, 'Stopped sharing - the old link no longer works.');
  const toggleFav = (b) => run('fav', async () => { await api(`/api/homebrew/${b.id}/favourite`, 'POST', { favourite: !b.favourite }); if (brew?.id === b.id) setBrew({ ...brew, favourite: !b.favourite }); await loadList(); });
  const togglePick = (w) => {
    const now = wantedOf(have);
    setHave((now.includes(w) ? now.filter((x) => x !== w) : [...now, w]).join(', '));
  };
  const setIng = (i, k, v) => setForm({ ...form, ingredients: form.ingredients.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
  const c = brew?.calc || {};
  const ins = brew?.insight;
  const open = creating || selId != null;
  const backToShelf = () => { setSelId(null); setBrew(null); setCreating(false); setForm(EMPTY_BREW); setWhatIf(null); };
  const startNew = (category) => { setSelId(null); setBrew(null); setCreating(true); setTab('recipe'); setForm({ ...EMPTY_BREW, ...(category && category !== 'all' ? { category, style: stylesFor(category)[0] } : {}) }); };
  const switchView = (v) => { setView(v); backToShelf(); setTab('recipe'); };
  const pool = view === 'recipes' ? recipes : brews;
  const passing = (id, extra = () => true) => pool.filter((b) => inTile(b, id) && (!favOnly || b.favourite) && (!wanted.length || hitsFor(b).n > 0) && strengthOk(b) && extra(b));
  // counts are cards: in the recipe book a drink with several versions counts once
  const cardCount = (list) => (view === 'recipes' ? new Set(list.map(famKey)).size : list.length);
  const countIn = (id) => cardCount(passing(id, tagsOk));
  const countTag = (group, test) => cardCount(passing(cat, (b) => tagsOk(b, group) && test(b)));
  const familyTotal = new Set(recipes.map(famKey)).size;
  const rated = brews.filter((b) => b.rating);
  const shelfStats = [
    ['🫧', 'Fermenting', brews.filter((b) => b.status === 'fermenting').length],
    ['💧', 'Clearing', brews.filter((b) => b.status === 'conditioning').length],
    ['🍾', 'Bottled', brews.filter((b) => b.status === 'bottled' || b.status === 'finished').length],
    ['⭐', 'Avg rating', rated.length ? `${(rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(1)}` : '-'],
  ];
  const tile = `rounded-2xl border ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`;
  // Fully themed header property badges: [Light Mode, Dark Mode]
  // Themed header property badges: [Light Mode, Dark Mode]
  // Consistent solid opaque themed background, themed border, and themed font color (no hover effects)
  const headPill = 'h-7 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 rounded-full border shadow-xs select-none';
  const PROP_THEMES = {
    sky: [
      'bg-sky-100 text-sky-900 border-sky-300',
      'bg-sky-950 text-sky-200 border-sky-500/50',
    ],
    amber: [
      'bg-amber-100 text-amber-950 border-amber-300',
      'bg-amber-950 text-amber-200 border-amber-500/50',
    ],
    pink: [
      'bg-pink-100 text-pink-900 border-pink-300',
      'bg-pink-950 text-pink-200 border-pink-500/50',
    ],
    rose: [
      'bg-rose-100 text-rose-900 border-rose-300',
      'bg-rose-950 text-rose-200 border-rose-500/50',
    ],
    emerald: [
      'bg-emerald-100 text-emerald-900 border-emerald-300',
      'bg-emerald-950 text-emerald-200 border-emerald-500/50',
    ],
    lime: [
      'bg-lime-100 text-lime-950 border-lime-300',
      'bg-lime-950 text-lime-200 border-lime-500/50',
    ],
    orange: [
      'bg-orange-100 text-orange-950 border-orange-300',
      'bg-orange-950 text-orange-200 border-orange-500/50',
    ],
    teal: [
      'bg-teal-100 text-teal-900 border-teal-300',
      'bg-teal-950 text-teal-200 border-teal-500/50',
    ],
    purple: [
      'bg-purple-100 text-purple-900 border-purple-300',
      'bg-purple-950 text-purple-200 border-purple-500/50',
    ],
    warm: [
      'bg-[#f5ede6] text-[#482510] border-[#d8beac]',
      'bg-[#241711] text-[#e8cbb8] border-[#6b4730]',
    ],
    slate: [
      'bg-slate-100 text-slate-800 border-slate-300',
      'bg-slate-900 text-slate-200 border-slate-700',
    ],
  };
  const pillTheme = (hue) => (PROP_THEMES[hue] || PROP_THEMES.slate)[isDark ? 1 : 0];
  const tint = (hue) => pillTheme(hue);
  const SWEET_THEME = { dry: 'sky', medium: 'amber', sweet: 'rose' };
  const ACID_THEME = { soft: 'emerald', fresh: 'lime', tart: 'orange' };
  const FIZZ_THEME = { sparkling: 'sky', still: 'slate' };
  const WINE_THEME = { red: 'rose', white: 'amber', rose: 'pink' };
  const FLAVOUR_THEME = {
    fruity: 'rose',
    floral: 'purple',
    herbal: 'emerald',
    pine: 'teal',
    roasted: 'warm',
    spicy: 'orange',
    honey: 'amber',
  };

  const renderHeaderProperties = (item) => {
    if (!item) return null;
    const wine = colourOf(item);
    const swId = sweetOf(item);
    const hasProps = wine || swId || item.acidity || item.fizz || (item.flavours || []).length > 0;
    if (!hasProps) return null;

    const wc = wine ? WINE_COLOURS.find((w) => w.id === wine) : null;
    const sw = swId ? SWEETNESS.find((s) => s.id === swId) : null;
    const ac = item.acidity ? ACIDITY.find((a) => a.id === item.acidity) : null;
    const fz = item.fizz ? FIZZ.find((f) => f.id === item.fizz) : null;
    const basisHint = item.sweetnessBasis ? BASIS_WORD[item.sweetnessBasis] : null;
    const basisBadge = item.sweetnessBasis === 'gravity' ? 'target FG'
      : item.sweetnessBasis === 'book' ? 'from book'
      : item.sweetnessBasis === 'you' ? 'as set'
      : item.sweetnessBasis === 'estimate' ? 'est.'
      : null;

    return (
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {wc && (
          <span className={`${headPill} ${pillTheme(WINE_THEME[wc.id] || 'slate')}`} title={`Wine colour: ${wc.label}`}>
            <span className={`w-2 h-2 rounded-full ${wc.dot} shrink-0`} />
            <span>{wc.label}</span>
          </span>
        )}
        {sw && (
          <span
            className={`${headPill} ${pillTheme(SWEET_THEME[sw.id] || 'slate')}`}
            title={basisHint ? `Sweetness: ${sw.label} (${basisHint})` : `Sweetness: ${sw.label}`}
          >
            <span>{sw.label}{item.sweetnessBasis === 'estimate' ? ' ~' : ''}</span>
            {basisBadge && (
              <span className="text-[10px] font-medium tracking-tight opacity-75 border-l border-current/25 pl-1.5 ml-0.5" title={basisHint}>
                {basisBadge}
              </span>
            )}
          </span>
        )}
        {ac && (
          <span className={`${headPill} ${pillTheme(ACID_THEME[ac.id] || 'lime')}`} title={ac.hint || `${ac.label} acidity`}>
            <span>{ac.label} acidity</span>
          </span>
        )}
        {fz && (
          <span className={`${headPill} ${pillTheme(FIZZ_THEME[fz.id] || 'sky')}`} title={fz.id === 'sparkling' ? 'Sparkling / carbonated' : 'Still (no fizz)'}>
            {fz.id === 'sparkling' ? (
              <>
                <span className="text-sm leading-none shrink-0">🫧</span>
                <span>Sparkling</span>
              </>
            ) : (
              <span>Still</span>
            )}
          </span>
        )}
        {FLAVOUR_TAGS.filter((f) => (item.flavours || []).includes(f.id)).map((f) => (
          <span
            key={f.id}
            className={`${headPill} ${pillTheme(FLAVOUR_THEME[f.id] || 'slate')}`}
            title={f.hint || f.label}
          >
            <span className="text-sm leading-none shrink-0">{f.emoji}</span>
            <span>{f.label}</span>
          </span>
        ))}
      </div>
    );
  };

  const renderMobileUXToggle = (extraClass = '') => (
    <div className={`inline-flex items-center p-1 rounded-2xl border text-xs font-bold ${border} ${isDark ? 'bg-slate-900/80' : 'bg-white/80'} shadow-sm ${extraClass}`}>
      <span className="text-[10px] uppercase tracking-wider text-slate-500 px-2 flex items-center gap-1">
        <Smartphone size={13} className="text-amber-500" /> Mobile UX:
      </span>
      <button
        type="button"
        onClick={() => switchMobileUX('classic')}
        title="Classic stacked mobile layout"
        className={`px-2.5 py-1 rounded-xl transition ${mobileUX === 'classic' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-500 hover:text-amber-500'}`}
      >
        Classic
      </button>
      <button
        type="button"
        onClick={() => switchMobileUX('phase1')}
        title="Phase 1: Compact horizontal hero lockup (-48% height on mobile)"
        className={`px-2.5 py-1 rounded-xl transition ${mobileUX === 'phase1' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-500 hover:text-amber-500'}`}
      >
        Phase 1
      </button>
      <button
        type="button"
        onClick={() => switchMobileUX('compare')}
        title="Compare Classic vs Phase 1 side by side in phone viewports"
        className={`hidden sm:inline-flex px-2.5 py-1 rounded-xl transition items-center gap-1 ${mobileUX === 'compare' ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs' : 'text-slate-500 hover:text-amber-500'}`}
      >
        <Columns2 size={12} /> Side-by-Side
      </button>
    </div>
  );

  const renderClassicHeader = (b, forceMobile = false) => {
    const c = b.calc || {};
    return (
      <div className={`rounded-3xl border overflow-hidden ${isDark ? 'border-white/5 bg-slate-900/40' : 'border-[#2E2B27]/10 bg-white/70 shadow-sm'}`}>
        <div className={`relative isolate flex ${forceMobile ? 'flex-col gap-4 p-4' : 'flex-col sm:flex-row gap-5 p-5'} bg-gradient-to-br ${look(b.category).tint}`}>
          {(b.bannerChoice ? b.banner : main.banner || b.banner) && (
            <img src={`/api/homebrew/picture/${b.bannerChoice ? b.banner : main.banner || b.banner}`} alt="" aria-hidden="true"
              className="absolute inset-0 -z-10 w-full h-full object-cover pointer-events-none select-none"
              style={{ opacity: isDark ? 0.33 : 0.45, mixBlendMode: isDark ? 'screen' : 'multiply', WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,0.38), #000 75%)', maskImage: 'linear-gradient(to right, rgba(0,0,0,0.38), #000 75%)' }} />
          )}
          <div className="flex flex-col items-center gap-1">
            <Vessel category={b.category} status={b.status} isRecipe={b.isRecipe} size={forceMobile ? 85 : 110} isDark={isDark} wine={colourOf(b)} liquid={b.liquid || main.colour} pics={b.mainPics?.length ? b.mainPics : main.items.filter((i) => i.ready)} ingredients={b.ingredients} fizz={b.fizz} />
            {(() => {
              const a = b.calc?.abv || b.calc?.potentialAbv || b.abvEstimate;
              if (!a) return null;
              const est = !b.calc?.abv && !b.calc?.potentialAbv;
              const word = b.calc?.abv ? (b.calc.abvFinal ? 'Strength' : 'Strength so far') : est ? 'Likely strength, estimated from the sugar and yeast' : 'Strength expected from the target gravities';
              return <span className={`${forceMobile ? 'text-2xl' : 'text-3xl'} font-black leading-none`} title={word}>{est ? '~' : ''}{a}<span className="text-base">%</span></span>;
            })()}
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <div>
              <div className="text-xs text-slate-500 flex items-center gap-1.5"><span className="text-2xl leading-none">{look(b.category).emoji}</span>{catLabel(b.category)}{b.style ? ` · ${b.style}` : ''}</div>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <h2 className={`${forceMobile ? 'text-xl' : 'text-2xl'} font-black break-words leading-tight mt-0.5 min-w-0`}>{b.name}</h2>
                  <MainIngredientPics items={main.items} isDark={isDark} />
                </div>
                <button onClick={() => setPictureOpen(true)} title={b.isRecipe ? 'Change picture' : 'Change picture'} className={`p-2 rounded-full shrink-0 transition text-slate-400 hover:text-amber-500 ${isDark ? 'bg-slate-950/40' : 'bg-white/80'}`}>
                  <ImageIcon size={18} />
                </button>
                <button onClick={() => toggleFav(b)} title={b.favourite ? 'Remove from favourites' : 'Add to favourites'} className={`p-2 rounded-full shrink-0 transition ${b.favourite ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500'} ${isDark ? 'bg-slate-950/40' : 'bg-white/80'}`}>
                  <Heart size={18} fill={b.favourite ? 'currentColor' : 'none'} />
                </button>
              </div>
              {b.isRecipe && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <button onClick={shareLink} disabled={busy === 'share'} className={`${btn} ${isDark ? 'bg-slate-950/40' : 'bg-white/85'} hover:text-amber-500`}>
                    {busy === 'share' ? <RotateCw size={13} className="animate-spin" /> : <Share2 size={13} />} Share link
                  </button>
                  <button onClick={sendPdf} disabled={busy === 'pdf-send'} className={`${btn} ${isDark ? 'bg-slate-950/40' : 'bg-white/85'} hover:text-amber-500`}>
                    {busy === 'pdf-send' ? <RotateCw size={13} className="animate-spin" /> : <Send size={13} />} Send PDF
                  </button>
                  <button onClick={downloadPdf} disabled={busy === 'pdf-save'} className={`${btn} ${isDark ? 'bg-slate-950/40' : 'bg-white/85'} hover:text-amber-500`}>
                    {busy === 'pdf-save' ? <RotateCw size={13} className="animate-spin" /> : <FileDown size={13} />} Download PDF
                  </button>
                  <button onClick={printLabels} disabled={busy === 'labels'} className={`${btn} ${isDark ? 'bg-slate-950/40' : 'bg-white/85'} hover:text-amber-500`}>
                    {busy === 'labels' ? <RotateCw size={13} className="animate-spin" /> : <Printer size={13} />} Print labels
                  </button>
                  {pdfReady && <button onClick={() => run('pdf-send', () => sendFile(pdfReady))} className={primary}><Send size={13} /> PDF ready - tap to send</button>}
                </div>
              )}
              {b.isRecipe && (b.shared || shareInfo?.id === b.id) && (
                <div className={`mt-2 flex flex-wrap items-center gap-2 text-xs rounded-xl px-3 py-2 border ${border} ${isDark ? 'bg-slate-950/40' : 'bg-white/85'}`}>
                  <Link2 size={13} className="text-amber-500 shrink-0" />
                  {shareInfo?.id === b.id
                    ? <a href={shareInfo.url} target="_blank" rel="noreferrer" className="text-sky-500 hover:underline break-all min-w-0 flex-1">{shareInfo.url}</a>
                    : <span className="text-slate-500 flex-1 min-w-0">Shared - anyone with the link can see this recipe.</span>}
                  {shareInfo?.id === b.id && <button onClick={() => navigator.clipboard?.writeText(shareInfo.url).then(() => notify('Link copied.'))} className="font-bold text-slate-500 hover:text-amber-500 flex items-center gap-1"><Copy size={12} /> Copy</button>}
                  <button onClick={stopSharing} disabled={busy === 'unshare'} className="font-bold text-slate-500 hover:text-red-500 flex items-center gap-1"><X size={12} /> Stop sharing</button>
                </div>
              )}
            </div>
            {b.isRecipe ? (
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">From your recipe book
                    {b.batchLitres ? <span title={bottlesOf(b.batchLitres, b.category)?.hint}> · {b.batchLitres} L makes {bottlesOf(b.batchLitres, b.category)?.text} bottles</span> : null}</p>
                  {b.sourceName && <p className="text-slate-500">Source: {b.sourceUrl ? <a href={b.sourceUrl} target="_blank" rel="noreferrer" className="text-sky-500 hover:underline inline-flex items-center gap-1">{b.sourceName}<ExternalLink size={10} /></a> : b.sourceName}</p>}
                  {renderHeaderProperties(b)}
                </div>
                {isOwner && <button onClick={startFrom} disabled={busy === 'start'} className={primary}><Plus size={13} /> Start a brew from this</button>}
              </div>
            ) : null}
            {b.isRecipe && familyOf(b).length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{familyOf(b).length} versions of {b.family} - pick one</span>
                <div className="flex flex-wrap gap-1.5">
                  {familyOf(b).map((v) => {
                    const on = v.id === b.id;
                    const vs = sweetOf(v);
                    return (
                      <a key={v.id} href={brewPath(v)} onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); if (!on) { setSelId(v.id); setWhatIf(null); } }} title={v.name}
                        className={`px-2.5 py-1 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition ${on ? 'bg-amber-500 border-amber-500 text-white' : `${border} ${isDark ? 'bg-slate-950/40' : 'bg-white/85'} hover:border-amber-500/60`}`}>
                        {colourOf(v) && <span className={`w-2 h-2 rounded-full ${WINE_COLOURS.find((w) => w.id === colourOf(v)).dot}`} />}
                        {v.variant || v.sourceName || v.name}
                        {vs && <span className={`text-[10px] px-1.5 rounded-full ${on ? 'bg-white/25' : SWEET_PILL[vs]}`}>{SWEETNESS.find((s) => s.id === vs).label}{v.sweetnessBasis === 'estimate' ? ' ~' : ''}</span>}
                        {v.favourite && <Heart size={11} fill="currentColor" className={on ? '' : 'text-rose-500'} />}
                      </a>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {!b.isRecipe && (
              <>
                {renderHeaderProperties(b)}
                <StatusTrack status={b.status} isDark={isDark} onPick={moveTo} busy={busy === 'stage'} />
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {[['ABV', c.abv ? `${c.abv}%${c.abvFinal ? '' : ' so far'}` : b.abvEstimate ? `~${b.abvEstimate}% likely` : '-'], ['Potential', c.potentialAbv ? `${c.potentialAbv}%` : '-'], ['Day', c.daysSinceStart ?? '-'], ['OG', g3(b.og)], ['Latest', g3(c.latestGravity)],
                    ['1/3 break', g3(c.thirdBreak)], ['Attenuation', c.attenuation != null ? `${c.attenuation}%` : '-'], ['Sweetness', c.sweetnessClass || '-'], ['Strength', c.strengthClass || '-']].map(([k, v], i) => (
                    <div key={k} className={`rounded-xl px-3 py-2 min-w-0 ${i === 0 ? `bg-gradient-to-br ${GRADIENT} text-white` : isDark ? 'bg-slate-950/50' : 'bg-white/85'}`}>
                      <div className={`text-[10px] font-bold uppercase tracking-wider ${i === 0 ? 'text-white/80' : 'text-slate-500'}`}><AbbrText text={k} /></div>
                      <div className={`font-black truncate ${i === 0 ? 'text-lg leading-tight' : 'text-sm'}`}>{v}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        {!b.isRecipe && (
          <div className={`flex flex-wrap items-center gap-2 px-5 py-3 border-t ${border}`}>
            {[['recipe', 'Recipe', <ScrollText size={14} />], ['log', 'Log', <Activity size={14} />], ['tastings', 'Tastings', <Wine size={14} />], ['insights', 'Insights', <Sparkles size={14} />]].map(([t, l, icon]) => (
              <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${tab === t ? `bg-gradient-to-r ${GRADIENT} text-white shadow-md shadow-amber-500/20` : 'text-slate-500 hover:text-amber-500'}`}>{icon} {l}</button>
            ))}
            {(b.status === 'planning' || b.status === 'fermenting') && isOwner && <button onClick={pitched} disabled={busy === 'remind'} className={`${btn} ml-auto`}><Bell size={13} /> I've just pitched</button>}
            {(b.status === 'fermenting' || b.status === 'conditioning') && isOwner && <button onClick={stepReminders} disabled={busy === 'steps'} className={btn}>{busy === 'steps' ? <RotateCw size={13} className="animate-spin" /> : <Bell size={13} />} Step reminders</button>}
            {isOwner && <button onClick={keepAsRecipe} disabled={busy === 'keep'} className={`${btn} ${['planning', 'fermenting', 'conditioning'].includes(b.status) ? '' : 'ml-auto'}`}><Copy size={13} /> Save as recipe</button>}
            <button onClick={printLabels} disabled={busy === 'labels'} className={btn}>{busy === 'labels' ? <RotateCw size={13} className="animate-spin" /> : <Printer size={13} />} Print labels</button>
          </div>
        )}
      </div>
    );
  };

  const renderPhase1Header = (b, forceMobile = false) => {
    const c = b.calc || {};
    return (
      <div className={`rounded-3xl border overflow-hidden ${isDark ? 'border-white/5 bg-slate-900/40' : 'border-[#2E2B27]/10 bg-white/70 shadow-sm'}`}>
        <div className={`relative isolate p-4 sm:p-5 bg-gradient-to-br ${look(b.category).tint}`}>
          {(b.bannerChoice ? b.banner : main.banner || b.banner) && (
            <img src={`/api/homebrew/picture/${b.bannerChoice ? b.banner : main.banner || b.banner}`} alt="" aria-hidden="true"
              className="absolute inset-0 -z-10 w-full h-full object-cover pointer-events-none select-none"
              style={{ opacity: isDark ? 0.33 : 0.45, mixBlendMode: isDark ? 'screen' : 'multiply', WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,0.38), #000 75%)', maskImage: 'linear-gradient(to right, rgba(0,0,0,0.38), #000 75%)' }} />
          )}

          {/* Phase 1 Mobile Horizontal Lockup vs Desktop */}
          <div className={`flex items-start ${forceMobile ? 'gap-3.5' : 'gap-3.5 sm:gap-5'}`}>
            {/* Vessel avatar + ABV */}
            <div className="flex flex-col items-center shrink-0">
              {forceMobile ? (
                <Vessel category={b.category} status={b.status} isRecipe={b.isRecipe} size={68} isDark={isDark} wine={colourOf(b)} liquid={b.liquid || main.colour} pics={b.mainPics?.length ? b.mainPics : main.items.filter((i) => i.ready)} ingredients={b.ingredients} fizz={b.fizz} />
              ) : (
                <>
                  <div className="sm:hidden">
                    <Vessel category={b.category} status={b.status} isRecipe={b.isRecipe} size={68} isDark={isDark} wine={colourOf(b)} liquid={b.liquid || main.colour} pics={b.mainPics?.length ? b.mainPics : main.items.filter((i) => i.ready)} ingredients={b.ingredients} fizz={b.fizz} />
                  </div>
                  <div className="hidden sm:block">
                    <Vessel category={b.category} status={b.status} isRecipe={b.isRecipe} size={110} isDark={isDark} wine={colourOf(b)} liquid={b.liquid || main.colour} pics={b.mainPics?.length ? b.mainPics : main.items.filter((i) => i.ready)} ingredients={b.ingredients} fizz={b.fizz} />
                  </div>
                </>
              )}
              {(() => {
                const a = b.calc?.abv || b.calc?.potentialAbv || b.abvEstimate;
                if (!a) return null;
                const est = !b.calc?.abv && !b.calc?.potentialAbv;
                const word = b.calc?.abv ? (b.calc.abvFinal ? 'Strength' : 'Strength so far') : est ? 'Likely strength, estimated from the sugar and yeast' : 'Strength expected from the target gravities';
                return (
                  <span className={`font-black leading-none mt-1 ${forceMobile ? 'text-xl' : 'text-xl sm:text-3xl'}`} title={word}>
                    {est ? '~' : ''}{a}<span className="text-xs sm:text-base font-bold">%</span>
                  </span>
                );
              })()}
            </div>

            {/* Title, Category & Top Right Controls */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs text-slate-500">
                <span className="truncate flex items-center gap-1 font-semibold">
                  <span className="text-base sm:text-2xl leading-none">{look(b.category).emoji}</span>
                  <span>{catLabel(b.category)}</span>
                  {b.style && <span className="opacity-75 font-normal">· {b.style}</span>}
                </span>
                <div className="flex items-center gap-1 shrink-0 ml-auto">
                  <button onClick={() => setPictureOpen(true)} title={b.isRecipe ? 'Change picture' : 'Change picture'} className={`p-1.5 sm:p-2 rounded-full transition text-slate-400 hover:text-amber-500 ${isDark ? 'bg-slate-950/40' : 'bg-white/80'}`}>
                    <ImageIcon size={14} />
                  </button>
                  <button onClick={() => toggleFav(b)} title={b.favourite ? 'Remove from favourites' : 'Add to favourites'} className={`p-1.5 sm:p-2 rounded-full transition ${b.favourite ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500'} ${isDark ? 'bg-slate-950/40' : 'bg-white/80'}`}>
                    <Heart size={14} fill={b.favourite ? 'currentColor' : 'none'} />
                  </button>
                </div>
              </div>

              <h2 className={`font-black break-words leading-tight mt-0.5 ${forceMobile ? 'text-lg' : 'text-lg sm:text-2xl'}`}>{b.name}</h2>

              {main.items?.length > 0 && (
                <div className="mt-1">
                  <MainIngredientPics items={main.items} isDark={isDark} />
                </div>
              )}

              {/* Book & Yield Subtitle */}
              {b.isRecipe && (
                <div className="text-[11px] sm:text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {b.sourceName && (
                    <span>
                      From {b.sourceUrl ? <a href={b.sourceUrl} target="_blank" rel="noreferrer" className="text-sky-500 hover:underline inline-flex items-center gap-0.5">{b.sourceName}<ExternalLink size={9} /></a> : b.sourceName}
                    </span>
                  )}
                  {b.batchLitres && (
                    <span title={bottlesOf(b.batchLitres, b.category)?.hint} className="font-semibold text-slate-600 dark:text-slate-400">
                      · {b.batchLitres} L ({bottlesOf(b.batchLitres, b.category)?.text})
                    </span>
                  )}
                </div>
              )}

              {/* Streamlined Mobile Action Toolbar */}
              {b.isRecipe && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {isOwner && (
                    <button onClick={startFrom} disabled={busy === 'start'} className={`${primary} !py-1.5 !px-3 !text-xs shadow-md shadow-amber-500/20`}>
                      <Plus size={13} /> Start brew
                    </button>
                  )}
                  <button onClick={shareLink} disabled={busy === 'share'} title="Send share link" className={`${btn} ${isDark ? 'bg-slate-950/40' : 'bg-white/85'} !py-1.5 !px-2.5 !text-xs hover:text-amber-500`}>
                    {busy === 'share' ? <RotateCw size={12} className="animate-spin" /> : <Share2 size={12} />} <span className="hidden sm:inline">Share</span>
                  </button>
                  <button onClick={sendPdf} disabled={busy === 'pdf-send'} title="Send PDF" className={`${btn} ${isDark ? 'bg-slate-950/40' : 'bg-white/85'} !py-1.5 !px-2.5 !text-xs hover:text-amber-500`}>
                    {busy === 'pdf-send' ? <RotateCw size={12} className="animate-spin" /> : <Send size={12} />} <span className="hidden sm:inline">Send</span> PDF
                  </button>
                  <button onClick={downloadPdf} disabled={busy === 'pdf-save'} title="Download PDF" className={`${btn} ${isDark ? 'bg-slate-950/40' : 'bg-white/85'} !py-1.5 !px-2.5 !text-xs hover:text-amber-500`}>
                    {busy === 'pdf-save' ? <RotateCw size={12} className="animate-spin" /> : <FileDown size={12} />} <span className="hidden sm:inline">Save</span> PDF
                  </button>
                  <button onClick={printLabels} disabled={busy === 'labels'} title="Bottle labels" className={`${btn} ${isDark ? 'bg-slate-950/40' : 'bg-white/85'} !py-1.5 !px-2.5 !text-xs hover:text-amber-500`}>
                    {busy === 'labels' ? <RotateCw size={12} className="animate-spin" /> : <Printer size={12} />} Labels
                  </button>
                  {pdfReady && <button onClick={() => run('pdf-send', () => sendFile(pdfReady))} className={`${primary} !py-1.5 !px-3 !text-xs`}><Send size={12} /> Send PDF</button>}
                </div>
              )}
            </div>
          </div>

          {/* Shared Link Banner if active */}
          {b.isRecipe && (b.shared || shareInfo?.id === b.id) && (
            <div className={`mt-2 flex flex-wrap items-center gap-2 text-xs rounded-xl px-3 py-2 border ${border} ${isDark ? 'bg-slate-950/40' : 'bg-white/85'}`}>
              <Link2 size={13} className="text-amber-500 shrink-0" />
              {shareInfo?.id === b.id
                ? <a href={shareInfo.url} target="_blank" rel="noreferrer" className="text-sky-500 hover:underline break-all min-w-0 flex-1">{shareInfo.url}</a>
                : <span className="text-slate-500 flex-1 min-w-0">Shared - anyone with the link can see this recipe.</span>}
              {shareInfo?.id === b.id && <button onClick={() => navigator.clipboard?.writeText(shareInfo.url).then(() => notify('Link copied.'))} className="font-bold text-slate-500 hover:text-amber-500 flex items-center gap-1"><Copy size={12} /> Copy</button>}
              <button onClick={stopSharing} disabled={busy === 'unshare'} title="Turn link off" className="font-bold text-slate-500 hover:text-red-500 flex items-center gap-1"><X size={12} /> Stop</button>
            </div>
          )}

          {/* Property Badges Ribbon */}
          {renderHeaderProperties(b)}

          {/* Family Alternative Versions */}
          {b.isRecipe && familyOf(b).length > 1 && (
            <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-black/5 dark:border-white/5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{familyOf(b).length} versions of {b.family} - pick one</span>
              <div className="flex flex-wrap gap-1.5">
                {familyOf(b).map((v) => {
                  const on = v.id === b.id;
                  const vs = sweetOf(v);
                  return (
                    <a key={v.id} href={brewPath(v)} onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); if (!on) { setSelId(v.id); setWhatIf(null); } }} title={v.name}
                      className={`px-2.5 py-1 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition ${on ? 'bg-amber-500 border-amber-500 text-white' : `${border} ${isDark ? 'bg-slate-950/40' : 'bg-white/85'} hover:border-amber-500/60`}`}>
                      {colourOf(v) && <span className={`w-2 h-2 rounded-full ${WINE_COLOURS.find((w) => w.id === colourOf(v)).dot}`} />}
                      {v.variant || v.sourceName || v.name}
                      {vs && <span className={`text-[10px] px-1.5 rounded-full ${on ? 'bg-white/25' : SWEET_PILL[vs]}`}>{SWEETNESS.find((s) => s.id === vs).label}{v.sweetnessBasis === 'estimate' ? ' ~' : ''}</span>}
                      {v.favourite && <Heart size={11} fill="currentColor" className={on ? '' : 'text-rose-500'} />}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active Brew Elements: StatusTrack & Metric Grid */}
          {!b.isRecipe && (
            <div className="flex flex-col gap-3 mt-2 pt-2 border-t border-black/5 dark:border-white/5">
              <StatusTrack status={b.status} isDark={isDark} onPick={moveTo} busy={busy === 'stage'} />
              <div className={`grid gap-2 ${forceMobile ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-5'}`}>
                {[['ABV', c.abv ? `${c.abv}%${c.abvFinal ? '' : ' so far'}` : b.abvEstimate ? `~${b.abvEstimate}% likely` : '-'], ['Potential', c.potentialAbv ? `${c.potentialAbv}%` : '-'], ['Day', c.daysSinceStart ?? '-'], ['OG', g3(b.og)], ['Latest', g3(c.latestGravity)],
                  ['1/3 break', g3(c.thirdBreak)], ['Attenuation', c.attenuation != null ? `${c.attenuation}%` : '-'], ['Sweetness', c.sweetnessClass || '-'], ['Strength', c.strengthClass || '-']].map(([k, v], i) => (
                  <div key={k} className={`rounded-xl px-2.5 py-2 min-w-0 ${i === 0 ? `bg-gradient-to-br ${GRADIENT} text-white` : isDark ? 'bg-slate-950/50' : 'bg-white/85'}`}>
                    <div className={`text-[10px] font-bold uppercase tracking-wider ${i === 0 ? 'text-white/80' : 'text-slate-500'}`}><AbbrText text={k} /></div>
                    <div className={`font-black truncate ${i === 0 ? 'text-base sm:text-lg leading-tight' : 'text-xs sm:text-sm'}`}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tab Bar for Active Brews */}
        {!b.isRecipe && (
          <div className={`flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3 border-t ${border}`}>
            {[['recipe', 'Recipe', <ScrollText size={14} />], ['log', 'Log', <Activity size={14} />], ['tastings', 'Tastings', <Wine size={14} />], ['insights', 'Insights', <Sparkles size={14} />]].map(([t, l, icon]) => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${tab === t ? `bg-gradient-to-r ${GRADIENT} text-white shadow-md shadow-amber-500/20` : 'text-slate-500 hover:text-amber-500'}`}>{icon} {l}</button>
            ))}
            {(b.status === 'planning' || b.status === 'fermenting') && isOwner && <button onClick={pitched} disabled={busy === 'remind'} className={`${btn} ml-auto`}><Bell size={13} /> Pitch</button>}
            {(b.status === 'fermenting' || b.status === 'conditioning') && isOwner && <button onClick={stepReminders} disabled={busy === 'steps'} className={btn}>{busy === 'steps' ? <RotateCw size={13} className="animate-spin" /> : <Bell size={13} />} Reminders</button>}
            {isOwner && <button onClick={keepAsRecipe} disabled={busy === 'keep'} className={`${btn} ${['planning', 'fermenting', 'conditioning'].includes(b.status) ? '' : 'ml-auto'}`}><Copy size={13} /> Save recipe</button>}
            <button onClick={printLabels} disabled={busy === 'labels'} className={btn}>{busy === 'labels' ? <RotateCw size={13} className="animate-spin" /> : <Printer size={13} />} Labels</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <PortalShell title="Homebrew" subtitle="/ims/homebrew • your meads, braggots and brews"
      icon={FlaskConical} gradient={GRADIENT} glow="rgba(245,158,11,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification} maxWidth="max-w-6xl" backToTop
      headerActions={isOwner && (
        <button onClick={() => setInviteOpen(true)} title="Invite people to your Homebrew, and share it" className={`p-2 rounded-xl transition-all border flex items-center gap-1.5 text-xs font-bold ${isDark ? 'bg-white/5 hover:bg-white/10 text-amber-400 border-white/5' : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-amber-700 border-[#2E2B27]/10'}`}>
          <UserPlus size={14} /><span className="hidden sm:inline">Invite &amp; Share</span>
        </button>
      )}>
      <style>{VESSEL_CSS}</style>
      {!open && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className={`inline-flex p-1 rounded-2xl border ${border} ${isDark ? 'bg-slate-900/60' : 'bg-white/70'}`}>
              {[['brews', '🫙', 'My brews', brews.length], ['recipes', '📖', 'Recipe book', familyTotal]].map(([v, e, l, n]) => (
                <button key={v} onClick={() => switchView(v)} title={v === 'recipes' ? `${recipes.length} recipes - ${familyTotal} drinks, with each book's version together on one card` : undefined} className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition ${view === v ? `bg-gradient-to-r ${GRADIENT} text-white shadow-lg shadow-amber-500/20` : 'text-slate-500 hover:text-amber-500'}`}>
                  <span>{e}</span>{l}<span className={`text-[10px] px-1.5 rounded-full ${view === v ? 'bg-white/25' : isDark ? 'bg-white/10' : 'bg-[#2E2B27]/10'}`}>{n}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setFavOnly(!favOnly)} title="Show only your favourites" className={`px-4 py-2.5 rounded-2xl text-sm font-bold flex items-center gap-2 border transition ${favOnly ? 'bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-500/20' : `${border} ${isDark ? 'bg-slate-900/60' : 'bg-white/70'} text-slate-500 hover:text-rose-500`}`}>
              <Heart size={15} fill={favOnly ? 'currentColor' : 'none'} /> Favourites<span className={`text-[10px] px-1.5 rounded-full ${favOnly ? 'bg-white/25' : isDark ? 'bg-white/10' : 'bg-[#2E2B27]/10'}`}>{pool.filter((b) => b.favourite).length}</span>
            </button>
            {/* Invite & Share is in the page header now; the new button takes its place here */}
            {isOwner && (
              <button onClick={() => startNew(cat)} className={`${primary} !px-4 !py-2.5 !text-sm shadow-lg shadow-amber-500/20`}><Plus size={15} /> {view === 'recipes' ? 'New recipe' : 'New brew'}</button>
            )}
            <div className="ml-auto">
              {renderMobileUXToggle()}
            </div>
          </div>

          {view === 'brews' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {shelfStats.map(([e, l, v]) => (
                <div key={l} className={`${tile} p-4 flex items-center gap-3 ${isDark ? 'bg-slate-900/40' : 'bg-white/70'}`}>
                  <span className="text-2xl">{e}</span>
                  <div><div className="text-2xl font-black leading-none">{v}</div><div className="text-[11px] text-slate-500 mt-1">{l}</div></div>
                </div>
              ))}
            </div>
          )}

          {view === 'recipes' && <div className={`${tile} p-4 sm:p-5 flex flex-col gap-3 bg-gradient-to-br ${isDark ? 'from-amber-500/10 to-slate-900/40' : 'from-amber-100/80 to-white/70'}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-base font-black">🧺 What have you got?</h2>
              <span className="text-xs text-slate-500">Type what you've a glut of and see what you could brew with it.</span>
            </div>
            <div className="relative">
              <input value={have} onChange={(e) => setHave(e.target.value)} placeholder="e.g. apples, or rhubarb, mint"
                className={`w-full pl-4 pr-10 py-3 rounded-xl text-sm outline-none border focus:border-amber-500 ${isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/15 text-[#2E2B27]'}`} />
              {have && <button onClick={() => setHave('')} title="Clear" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-amber-500"><X size={16} /></button>}
            </div>
            {/* on a phone: a row per kind of ingredient, opening to show them two to a row */}
            {pickGroups.length > 0 && (
              <div className="sm:hidden flex flex-col gap-1.5">
                {pickGroups.map((g) => {
                  const on = haveOpen === g.id;
                  const chosen = g.items.filter((i) => wanted.includes(i.w)).length;
                  return (
                    <div key={g.id} className={`rounded-xl border ${on ? 'border-amber-500/60' : border} ${isDark ? 'bg-slate-900/50' : 'bg-white/80'}`}>
                      <button type="button" onClick={() => setHaveOpen(on ? '' : g.id)} className="w-full px-3 py-2 flex items-center gap-2 text-sm font-bold">
                        <span className="text-2xl leading-none">{g.icon}</span>{g.label}
                        <span className={`text-[10px] px-1.5 rounded-full ${chosen ? 'bg-amber-500 text-white' : isDark ? 'bg-white/10' : 'bg-[#2E2B27]/10'}`}>{chosen ? `${chosen} ✓` : g.items.length}</span>
                        {on ? <ChevronUp size={16} className="ml-auto text-slate-500" /> : <ChevronDown size={16} className="ml-auto text-slate-500" />}
                      </button>
                      {on && (
                        <div className="grid grid-cols-2 gap-1.5 px-2 pb-2">
                          {g.items.map((i) => {
                            const picked = wanted.includes(i.w);
                            return (
                              <button key={i.w} onClick={() => togglePick(i.w)} className={`px-2 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 min-w-0 transition ${picked ? 'bg-amber-500 border-amber-500 text-white' : `${border} ${isDark ? 'bg-slate-950/40' : 'bg-white'}`}`}>
                                <span className="text-xl leading-none shrink-0">{i.icon}</span><span className="truncate">{i.w}</span><span className={`ml-auto text-[10px] ${picked ? 'text-white/80' : 'text-slate-500'}`}>{i.n}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {pickGroups.length > 0 && (
              <div className="hidden sm:flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {pickGroups.map((g) => {
                    const on = pickGroup === g.id;
                    const chosen = g.items.filter((i) => wanted.includes(i.w)).length;
                    return (
                      <button key={g.id} onClick={() => setPickGroup(on ? '' : g.id)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition ${on ? `bg-gradient-to-r ${GRADIENT} text-white border-transparent` : `${border} ${isDark ? 'bg-slate-900/50' : 'bg-white/80'} hover:border-amber-500/60`}`}>
                        <span className="text-2xl leading-none">{g.icon}</span>{g.label}
                        <span className={`text-[10px] px-1.5 rounded-full ${on ? 'bg-white/25' : isDark ? 'bg-white/10' : 'bg-[#2E2B27]/10'}`}>{chosen ? `${chosen} ✓` : g.items.length}</span>
                      </button>
                    );
                  })}
                </div>
                {pickGroups.filter((g) => g.id === pickGroup).map((g) => (
                  <div key={g.id} className={`flex flex-wrap gap-1.5 p-3 rounded-xl border ${border} ${isDark ? 'bg-slate-950/30' : 'bg-white/60'}`}>
                    {g.items.map((i) => {
                      const on = wanted.includes(i.w);
                      return (
                        <button key={i.w} onClick={() => togglePick(i.w)} title={`Used in ${i.n} recipe${i.n === 1 ? '' : 's'} or brew${i.n === 1 ? '' : 's'}`} className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${on ? 'bg-amber-500 border-amber-500 text-white' : `${border} ${isDark ? 'bg-slate-900/50' : 'bg-white/80'} hover:border-amber-500/60`}`}>
                          <span className="text-2xl leading-none mr-1 align-middle">{i.icon}</span>{i.w}<span className={`ml-1 text-[10px] ${on ? 'text-white/80' : 'text-slate-500'}`}>{i.n}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            {wanted.length > 0 && (
              <p className="text-xs">
                <b>{cards.length}</b> {view === 'recipes' ? 'recipe' : 'brew'}{cards.length === 1 ? '' : 's'} with {wanted.join(' or ')}{cat !== 'all' ? ` in ${catLabel(cat)}` : ''}{wanted.length > 1 ? ' - the ones using the most of them first' : ''}.
              </p>
            )}
          </div>}

          <div className={`${tile} p-3 sm:p-4 flex flex-col gap-3 ${isDark ? 'bg-slate-900/40' : 'bg-white/70'}`}>
          {/* on a phone the filters fold away behind this bar */}
          <button type="button" onClick={() => setFiltersOpen(!filtersOpen)} className="sm:hidden flex items-center gap-2 text-sm font-bold">
            <Filter size={15} className="text-amber-500" /> Filters
            {(() => { const n = (cat !== 'all' ? 1 : 0) + sweets.length + acids.length + fizzes.length + flavs.length + (abvOn ? 1 : 0); return n ? <span className="text-[10px] px-1.5 rounded-full bg-amber-500 text-white">{n} on</span> : null; })()}
            {filtersOpen ? <ChevronUp size={16} className="ml-auto text-slate-500" /> : <ChevronDown size={16} className="ml-auto text-slate-500" />}
          </button>
          <div className={`${filtersOpen ? 'flex' : 'hidden'} sm:flex flex-col gap-3.5`}>
            {/* the types: smaller on a phone, three to a row */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>Type</span>
                {cat !== 'all' && (
                  <button type="button" onClick={() => setCat('all')} className="text-[10px] font-bold text-slate-500 hover:text-amber-500 flex items-center gap-0.5">
                    Show all types
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5 sm:gap-2">
                {[{ id: 'all', label: 'Everything' }, ...meta.categories].map((k) => {
                  const L = k.id === 'all' ? { emoji: '✨', liquid: '#f59e0b' } : look(k.id);
                  const on = cat === k.id;
                  return (
                    <button key={k.id} onClick={() => setCat(k.id)} className={`rounded-xl sm:rounded-2xl border px-1.5 py-2 sm:px-3 sm:py-3 flex flex-col items-center gap-0.5 sm:gap-1 min-w-0 transition ${on ? 'border-amber-500 shadow-lg shadow-amber-500/20' : border} ${isDark ? 'bg-slate-900/50 hover:bg-slate-800/60' : 'bg-white/80 hover:bg-white'}`}>
                      <span className="text-xl sm:text-2xl leading-none">{L.emoji}</span>
                      <span className="text-[10px] sm:text-xs font-bold text-center leading-tight">{k.label}</span>
                      <span className="h-1 w-8 rounded-full" style={{ background: L.liquid, opacity: on ? 1 : 0.45 }} />
                      <span className="text-[10px] text-slate-500">{countIn(k.id)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          <div className="flex flex-col gap-2.5 pt-1 border-t border-black/5 dark:border-white/5">
            {[['Sweetness', 'sweet', SWEETNESS, sweets, setSweets, (o) => (b) => sweetOf(b) === o.id, 'From the book where it says, otherwise estimated from the sugar, yeast and method'],
              ['Acidity', 'acid', ACIDITY, acids, setAcids, (o) => (b) => b.acidity === o.id, 'How tart and fresh it is - judged from sharp fruit, added acid and citrus, or a sour style'],
              ['Fizz', 'fizz', FIZZ, fizzes, setFizzes, (o) => (b) => b.fizz === o.id, 'Still, or sparkling (bottle-conditioned or carbonated)']].map(([title, group, opts, on, setOn, test, help]) => (
              <div key={title} className="flex flex-wrap items-center gap-1.5" title={help}>
                <span className={`text-[10px] font-black uppercase tracking-wider mr-1 w-20 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>{title}</span>
                {opts.map((o) => {
                  const picked = on.includes(o.id);
                  return (
                    <button key={o.id} onClick={() => toggleIn(on, setOn, o.id)} title={o.hint}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 transition ${picked ? 'bg-amber-500 border-amber-500 text-white' : `${border} ${isDark ? 'bg-slate-900/50' : 'bg-white/80'} hover:border-amber-500/60`}`}>
                      {o.emoji ? <span className="leading-none">{o.emoji}</span> : null}{o.label}
                      <span className={`text-[10px] ${picked ? 'text-white/80' : 'text-slate-500'}`}>{countTag(group, test(o))}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {abvMax > abvMin && (
              <div className="flex items-center gap-2 w-full sm:w-[36rem]" title="Strength - measured, from the target gravities, or estimated from the sugar and yeast where the book doesn't say">
                <span className={`text-[10px] font-black uppercase tracking-wider w-20 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>Strength</span>
                <span className={`text-xs font-bold tabular-nums w-9 text-right ${abvOn ? 'text-amber-500' : ''}`}>{abvLo}%</span>
                <div className="relative flex-1 h-4">
                  <div className={`absolute top-1/2 -translate-y-1/2 inset-x-0 h-1.5 rounded-full ${isDark ? 'bg-white/10' : 'bg-[#2E2B27]/10'}`} />
                  <div className={`absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-gradient-to-r ${GRADIENT}`}
                    style={{ left: `${((abvLo - abvMin) / (abvMax - abvMin)) * 100}%`, right: `${100 - ((abvHi - abvMin) / (abvMax - abvMin)) * 100}%` }} />
                  <input type="range" aria-label="Weakest" className="hb-range" style={{ zIndex: abvLo >= abvHi - 0.5 && abvHi > abvMin ? 3 : 2 }} min={abvMin} max={abvMax} step={0.5} value={abvLo}
                    onChange={(e) => setAbvPick([Math.min(Number(e.target.value), abvHi), abvHi])} />
                  <input type="range" aria-label="Strongest" className="hb-range" min={abvMin} max={abvMax} step={0.5} value={abvHi}
                    onChange={(e) => setAbvPick([abvLo, Math.max(Number(e.target.value), abvLo)])} />
                </div>
                <span className={`text-xs font-bold tabular-nums w-9 ${abvOn ? 'text-amber-500' : ''}`}>{abvHi}%</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" title="Aromas and flavours, from what goes in - pick more than one to find drinks with all of them">
            <span className={`text-[10px] font-black uppercase tracking-wider mr-1 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>Aromas &amp; flavours</span>
            {FLAVOUR_TAGS.map((o) => {
              const picked = flavs.includes(o.id);
              return (
                <button key={o.id} onClick={() => toggleIn(flavs, setFlavs, o.id)} title={o.hint}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition ${picked ? 'bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-500/20' : `${border} ${isDark ? 'bg-slate-900/50' : 'bg-white/80'} hover:border-amber-500/60`}`}>
                  <span className="text-base leading-none">{o.emoji}</span>{o.label}
                  <span className={`text-[10px] ${picked ? 'text-white/80' : 'text-slate-500'}`}>{countTag('flav', (b) => [...flavs, o.id].every((f) => (b.flavours || []).includes(f)))}</span>
                </button>
              );
            })}
            {(cat !== 'all' || tasteOn || abvOn) && <button onClick={() => { setCat('all'); clearTaste(); }} className="ml-auto text-xs font-bold text-slate-500 hover:text-amber-500 flex items-center gap-1"><X size={12} /> Clear filters</button>}
          </div>
          </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {cards.map(({ key, members, rep: b }) => {
              const L = look(b.category);
              const progress = b.calc.attenuation != null ? Math.max(0, Math.min(100, b.calc.attenuation)) : null;
              const many = members.length > 1;
              const wine = colourOf(b);
              const sweetTags = SWEETNESS.filter((s) => members.some((m) => sweetOf(m) === s.id));
              const books = [...new Set(members.map((m) => (m.variant || m.sourceName || '').split(' · ')[0]).filter(Boolean))];
              return (
                <a key={key} id={`brew-${b.id}`} href={brewPath(b)} onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); setCreating(false); setSelId(b.id); setWhatIf(null); setTab('recipe'); }}
                  className={`hb-card no-underline text-inherit cursor-pointer text-left ${tile} overflow-hidden flex flex-col hover:shadow-xl hover:shadow-amber-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${isDark ? 'bg-slate-900/50' : 'bg-white/80'}`}>
                  <div className={`relative isolate flex items-end justify-center pt-5 bg-gradient-to-b ${L.tint}`}>
                    {/* the header's faint picture, cropped to its right-hand side */}
                    {b.banner && (
                      <img src={`/api/homebrew/picture/${b.banner}`} alt="" aria-hidden="true" loading="lazy"
                        className="absolute inset-0 -z-10 w-full h-full object-cover object-right pointer-events-none select-none"
                        style={{ opacity: isDark ? 0.33 : 0.45, mixBlendMode: isDark ? 'screen' : 'multiply' }} />
                    )}
                    <span className="absolute top-2 left-3 text-2xl leading-none">{L.emoji}</span>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFav(b); }} title={b.favourite ? 'Remove from favourites' : 'Add to favourites'}
                      className={`absolute top-9 right-2.5 p-1.5 rounded-full transition ${b.favourite ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500'} ${isDark ? 'bg-slate-950/40' : 'bg-white/70'}`}>
                      <Heart size={15} fill={b.favourite ? 'currentColor' : 'none'} />
                    </button>
                    {b.isRecipe
                      ? <span className="absolute top-2.5 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${L.liquid}40`, color: isDark ? L.liquid : shade(L.liquid, 0.5) }}>{many ? `${members.length} versions` : 'Recipe'}</span>
                      : <span className={`absolute top-2.5 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_PILL[b.status] || ''}`}>{STATUS_WORD[b.status] || b.status}</span>}
                    <Vessel category={b.category} status={b.status} isRecipe={b.isRecipe} size={72} isDark={isDark} wine={wine} liquid={b.liquid} pics={b.mainPics} ingredients={b.ingredients} fizz={b.fizz} />
                    {(() => {
                      const vals = members.map(strengthOf).filter((v) => v != null);
                      if (!vals.length) return null;
                      const lo = Math.min(...vals), hi = Math.max(...vals);
                      const est = members.every((m) => !m.calc.abv && !m.calc.potentialAbv);
                      return <span className="absolute bottom-2 right-3 text-lg font-black" title={est ? 'Likely strength, estimated from the sugar and yeast' : undefined}>{est ? '~' : ''}{lo === hi ? lo : `${lo}–${hi}`}<span className="text-xs">%</span></span>;
                    })()}
                  </div>
                  <div className="p-3 flex flex-col gap-1 flex-1">
                    <div className="text-sm font-bold break-words leading-snug">{many ? b.family : b.name}</div>
                    <div className="text-[11px] text-slate-500">{b.style || catLabel(b.category)}</div>
                    {(wine || sweetTags.length > 0 || members.some((m) => (m.flavours || []).length)) && (
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        {wine && <span className="h-6 text-xs font-bold px-2.5 rounded-full flex items-center gap-1.5 bg-slate-500/10 text-slate-500"><span className={`w-2.5 h-2.5 rounded-full ${WINE_COLOURS.find((w) => w.id === wine).dot}`} />{WINE_COLOURS.find((w) => w.id === wine).label}</span>}
                        {sweetTags.map((s) => {
                          const est = members.filter((m) => sweetOf(m) === s.id).every((m) => m.sweetnessBasis === 'estimate');
                          return <span key={s.id} title={est ? 'Estimated - the book doesn\'t say' : undefined} className={`h-6 inline-flex items-center text-xs font-bold px-2.5 rounded-full ${SWEET_PILL[s.id]}`}>{s.label}{est ? ' ~' : ''}</span>;
                        })}
                        {(() => {
                          const fl = FLAVOUR_TAGS.filter((f) => members.some((m) => (m.flavours || []).includes(f.id)));
                          return fl.length ? <span className="text-2xl leading-none ml-0.5 flex gap-0.5" title={fl.map((f) => f.label).join(', ')}>{fl.map((f) => <span key={f.id}>{f.emoji}</span>)}</span> : null;
                        })()}
                      </div>
                    )}
                    {(() => {
                      const sumText = b.shortSummary || b.summary || members.find((m) => m.shortSummary || m.summary)?.summary;
                      const cardSum = shortSummary(sumText);
                      return cardSum ? (
                        <p className={`text-xs leading-snug line-clamp-2 mt-1 break-words ${isDark ? 'text-slate-300/85' : 'text-slate-600'}`} title={sumText}>
                          {cardSum}
                        </p>
                      ) : null;
                    })()}
                    {hitMap.get(b.id)?.hits.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {hitMap.get(b.id).hits.slice(0, 3).map((g, i) => (
                          <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 ${isDark ? 'text-amber-400' : 'text-amber-700'} break-words`}><AbbrText text={ingText(g)} /></span>
                        ))}
                      </div>
                    )}
                    <div className="mt-auto pt-2 flex items-center gap-2 text-[11px] text-slate-500">
                      {b.isRecipe
                        ? <span className="truncate" title={many ? books.join(', ') : bottlesOf(b.batchLitres, b.category)?.hint}>{many ? `${books.slice(0, 2).join(', ')}${books.length > 2 ? ` +${books.length - 2}` : ''}` : [b.batchLitres && `${b.batchLitres} L`, bottlesOf(b.batchLitres, b.category)?.text, b.sourceName].filter(Boolean).join(' · ')}</span>
                        : <span>{b.calc.daysSinceStart != null ? `Day ${b.calc.daysSinceStart}` : b.startedOn || 'Not started yet'}</span>}
                      {b.rating ? <span className="ml-auto flex items-center gap-0.5 text-amber-500 font-bold"><Star size={11} fill="currentColor" />{b.rating}</span> : null}
                    </div>
                    {!b.isRecipe && b.status === 'fermenting' && progress != null && (
                      <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-[#2E2B27]/10'}`} title={`${progress}% of the sugar eaten so far`}>
                        <div className={`h-full bg-gradient-to-r ${GRADIENT}`} style={{ width: `${progress}%` }} />
                      </div>
                    )}
                  </div>
                </a>
              );
            })}
            <button onClick={() => startNew(cat)} className={`rounded-2xl border-2 border-dashed ${border} min-h-[14rem] flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-amber-500 hover:border-amber-500/50 transition`}>
              <span className="text-3xl">{view === 'recipes' ? '📝' : '🫙'}</span>
              <span className="text-sm font-bold">{view === 'recipes' ? 'Add a recipe' : 'Start a new brew'}</span>
            </button>
          </div>
          {!shown.length && wanted.length > 0 && <p className="text-xs text-slate-500 text-center">Nothing {view === 'recipes' ? 'in the recipe book' : 'in your brews'} uses {wanted.join(' or ')}{cat !== 'all' ? ` in ${catLabel(cat)} - try Everything` : ''}.</p>}
          {!shown.length && !wanted.length && <p className="text-xs text-slate-500 text-center">{view === 'recipes' ? 'No recipes in here yet.' : 'Nothing brewing in here yet - start one, or pick something from the recipe book.'}</p>}
        </div>
      )}

      {open && (
        <div className="flex flex-col gap-5 min-w-0">
          {pictureOpen && brew && <PictureDialog brew={brew} isDark={isDark} border={border} onClose={() => setPictureOpen(false)} onPicked={(b) => { setPictureOpen(false); setBrew(b); loadList(); notify('Picture changed.'); }} />}
          {labelsOpen && brew && <LabelsDialog brew={brew} isDark={isDark} border={border} onClose={() => setLabelsOpen(false)} onDone={labelsMade} />}
          {/* styled like the IMS Hub button in the page header (PortalShell) */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button onClick={backToShelf} className={`self-start p-2 rounded-xl flex items-center gap-2 text-xs font-bold transition-all active:scale-95 ${isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5' : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-[#2E2B27] border border-[#2E2B27]/10'}`}><ArrowLeft size={16} /> {view === 'recipes' ? 'Back to the recipe book' : 'Back to all brews'}</button>
            {renderMobileUXToggle()}
          </div>

          {brew && (
            mobileUX === 'compare' ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between text-xs font-bold text-slate-500 px-1 gap-2">
                  <div className="flex items-center gap-1.5 text-amber-500 font-extrabold uppercase tracking-wider text-[11px]">
                    <Columns2 size={14} /> Side-by-Side Mobile UX Comparison
                  </div>
                  <span className="text-[11px] text-slate-400">Comparing Classic vs Phase 1 in responsive 390px mobile viewports</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  {/* Left: Classic Frame */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs px-2">
                      <span className="font-bold px-2.5 py-0.5 rounded-full bg-slate-500/15 text-slate-600 dark:text-slate-300">
                        Option A: Classic Mobile (Vertical Stack)
                      </span>
                      <span className="text-[11px] text-slate-400">~420px height</span>
                    </div>
                    <div className="w-full max-w-[420px] mx-auto border-2 border-slate-400/20 rounded-3xl overflow-hidden shadow-xl bg-slate-950/10">
                      {renderClassicHeader(brew, true)}
                    </div>
                  </div>
                  {/* Right: Phase 1 Frame */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs px-2">
                      <span className="font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        Option B: Phase 1 (Compact Horizontal)
                      </span>
                      <span className="text-[11px] text-emerald-500 font-bold">-48% scroll tax (~220px)</span>
                    </div>
                    <div className="w-full max-w-[420px] mx-auto border-2 border-amber-500/30 rounded-3xl overflow-hidden shadow-xl bg-slate-950/10">
                      {renderPhase1Header(brew, true)}
                    </div>
                  </div>
                </div>
              </div>
            ) : mobileUX === 'phase1' ? (
              renderPhase1Header(brew, false)
            ) : (
              renderClassicHeader(brew, false)
            )
          )}

          {brew?.isRecipe && !editRecipe && (
            <div className={panel}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-xs font-black uppercase tracking-wider">Recipe</h2>
                <span className="text-[11px] text-slate-500">Dotted words: hover or tap for what they mean</span>
                {isOwner && <button onClick={() => setEditRecipe(true)} className={`${btn} ml-auto`}><Wand2 size={13} /> Edit recipe</button>}
              </div>
              {brew.summary && <p className={`text-sm leading-relaxed mb-4 p-3 rounded-xl ${isDark ? 'bg-amber-500/10' : 'bg-amber-50'}`}><RichText text={brew.summary} /></p>}
              {(brew.yeast || brew.batchLitres) && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs mb-4">
                  {brew.batchLitres ? <span><b className="text-slate-500 font-bold uppercase text-[10px] tracking-wider mr-1">Makes</b>{brew.batchLitres} L · {bottlesOf(brew.batchLitres, brew.category)?.text} bottles</span> : null}
                  {brew.yeast && <span><b className="text-slate-500 font-bold uppercase text-[10px] tracking-wider mr-1">Yeast</b><RichText text={brew.yeast} /></span>}
                </div>
              )}
              {(brew.ingredients || []).length > 0 && (
                <>
                  <h3 className="text-[11px] font-black uppercase tracking-wider text-amber-600 mb-2">Ingredients</h3>
                  {ING_STAGES.map((stage) => [stage, (brew.ingredients || []).filter((g) => (g.stage || 'primary') === stage && g.name)]).filter(([, l]) => l.length).map(([stage, list], _, all) => (
                    <div key={stage} className="mb-3">
                      {all.length > 1 && <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{{ primary: 'To start', secondary: 'Later, in secondary', backsweeten: 'To back-sweeten', bottling: 'At bottling' }[stage]}</div>}
                      <ul className={`rounded-xl border ${border} divide-y ${isDark ? 'divide-white/5' : 'divide-[#2E2B27]/10'}`}>
                        {list.map((g, i) => (
                          <li key={i} className="flex gap-3 px-3 py-1.5 text-sm">
                            <span className="w-24 shrink-0 font-bold tabular-nums"><RichText text={[g.amount, g.unit].filter(Boolean).join(' ')} /></span>
                            <span className="min-w-0"><RichText text={g.name} /></span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </>
              )}
              {parseSteps(brew.method).length > 0 && (
                <>
                  <h3 className="text-[11px] font-black uppercase tracking-wider text-amber-600 mt-4 mb-2">Method</h3>
                  <ol className="flex flex-col gap-2">
                    {parseSteps(brew.method).map((s, i) => (
                      <li key={i} className="flex gap-3 text-sm leading-relaxed">
                        <span className="w-6 h-6 shrink-0 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                        <span className="min-w-0"><RichText text={s} /></span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {brew.notes && (
                <>
                  <h3 className="text-[11px] font-black uppercase tracking-wider text-amber-600 mt-4 mb-2">Notes</h3>
                  <p className="text-sm leading-relaxed whitespace-pre-line text-slate-500"><RichText text={brew.notes} /></p>
                </>
              )}
              <TermsPanel border={border} texts={[brew.summary, brew.method, brew.notes, brew.yeast, ...(brew.ingredients || []).map(ingText)]} />
            </div>
          )}

          {(!brew || (brew.isRecipe ? editRecipe : tab === 'recipe')) && (
            <div className={panel}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-xs font-black uppercase tracking-wider">{brew ? (brew.isRecipe ? 'Edit recipe' : 'Recipe') : view === 'recipes' ? 'New recipe' : 'New brew'}</h2>
                {brew?.isRecipe && <button onClick={() => setEditRecipe(false)} className={`${btn} ml-auto`}><ScrollText size={13} /> Back to reading it</button>}
              </div>
              <LookPicker form={form} setForm={setForm} categories={meta.categories} stylesFor={stylesFor} brew={brew} isDark={isDark} border={border} label={label} />
              <div className="mb-3"><span className={label}>Summary</span><textarea rows={Math.min(6, Math.max(2, Math.ceil((form.summary || '').length / 90)))} value={form.summary || ''} onChange={set('summary')} placeholder="What it is and what it's like - a line or two" className={`${field} resize-y`} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2"><span className={label}>Name</span><input value={form.name} onChange={set('name')} placeholder="e.g. Christmas braggot for Dad" className={field} /></div>
                <div><span className={label}>Style</span><select value={form.style || ''} onChange={set('style')} className={field}>{(stylesFor(form.category).includes(form.style) || !form.style ? stylesFor(form.category) : [form.style, ...stylesFor(form.category)]).map((s) => <option key={s}>{s}</option>)}</select></div>
                <div><span className={label}>Status</span><select value={form.status} onChange={set('status')} className={field}>{meta.statuses.map((s) => <option key={s}>{s}</option>)}</select></div>
                <div><span className={label}>Batch (litres)</span><input type="number" step="0.1" value={form.batchLitres ?? ''} onChange={set('batchLitres')} className={field} />
                  {bottlesOf(form.batchLitres, form.category) && <span className="text-[10px] text-slate-500 mt-1 block" title={bottlesOf(form.batchLitres, form.category).hint}>Makes {bottlesOf(form.batchLitres, form.category).text} bottles</span>}</div>
                <div><span className={label}>Pitched on</span><input type="date" value={form.startedOn || ''} onChange={set('startedOn')} className={field} /></div>
                <div><span className={label}>Target <Ab k="OG" /></span><input type="number" step="0.001" value={form.targetOg ?? ''} onChange={set('targetOg')} placeholder="1.100" className={field} /></div>
                <div><span className={label}>Target <Ab k="FG" /></span><input type="number" step="0.001" value={form.targetFg ?? ''} onChange={set('targetFg')} placeholder="1.015" className={field} /></div>
                <div><span className={label}>Bottled on</span><input type="date" value={form.bottledOn || ''} onChange={set('bottledOn')} className={field} /></div>
                <div><span className={label}>Actual <Ab k="OG" /></span><input type="number" step="0.001" value={form.og ?? ''} onChange={set('og')} placeholder="first reading" className={field} /></div>
                <div><span className={label}>Actual <Ab k="FG" /></span><input type="number" step="0.001" value={form.fg ?? ''} onChange={set('fg')} className={field} /></div>
                <div><span className={label}>Sweetness</span><select value={form.sweetness || ''} onChange={set('sweetness')} title={brew?.sweetnessBasis ? `Currently ${BASIS_WORD[brew.sweetnessBasis]}` : undefined} className={field}><option value="">-</option>{['dry', 'medium', 'sweet', ...(['dry', 'medium', 'sweet', ''].includes(form.sweetness || '') ? [] : [form.sweetness])].map((s) => <option key={s}>{s}</option>)}</select></div>
                {WINE_CATS.includes(form.category) && <div><span className={label}>Colour</span><select value={form.colour || ''} onChange={set('colour')} className={field}><option value="">-</option>{WINE_COLOURS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></div>}
                <div><span className={label}>Carbonation</span><select value={form.carbonation || ''} onChange={set('carbonation')} className={field}><option value="">-</option><option>still</option><option>petillant</option><option>sparkling</option></select></div>
                <div className="sm:col-span-2"><span className={label}>Yeast</span><input value={form.yeast || ''} onChange={set('yeast')} placeholder="e.g. Lalvin 71B, 1 sachet" className={field} /></div>
                <div className="sm:col-span-3"><span className={label}>Yeast - how it was pitched</span><input value={form.yeastNotes || ''} onChange={set('yeastNotes')} placeholder="rehydrated with Go-Ferm at 40°C, pitched at 20°C" className={field} /></div>
                <div className="sm:col-span-3"><span className={label}>Nutrients</span><input value={form.nutrients || ''} onChange={set('nutrients')} placeholder="Fermaid-O, TOSNA 4 doses of 1.5 g" className={field} /></div>
                <div className="sm:col-span-3"><span className={label}>Water</span><input value={form.water || ''} onChange={set('water')} placeholder="tap, Campden-treated / bottled spring" className={field} /></div>
                <div className="sm:col-span-2"><span className={label}>Recipe source</span><input value={form.sourceName || ''} onChange={set('sourceName')} placeholder="where the recipe came from" className={field} /></div>
                <div><span className={label}>Source link</span><input value={form.sourceUrl || ''} onChange={set('sourceUrl')} placeholder="https://..." className={field} /></div>
              </div>
              <div className="mt-4">
                <span className={label}>Ingredients</span>
                <div className="flex flex-col gap-2">
                  {form.ingredients.map((g, i) => (
                    <div key={i} className="grid grid-cols-2 sm:grid-cols-[7rem_minmax(0,1fr)_5rem_5rem_7rem_2rem] gap-2 items-center">
                      <select value={g.type || 'honey'} onChange={(e) => setIng(i, 'type', e.target.value)} className={field}>{ING_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
                      <input value={g.name || ''} onChange={(e) => setIng(i, 'name', e.target.value)} placeholder="e.g. Heather honey" title={abbrTitle(g.name)} className={field} />
                      <input value={g.amount || ''} onChange={(e) => setIng(i, 'amount', e.target.value)} placeholder="1.5" className={field} />
                      <input value={g.unit || ''} onChange={(e) => setIng(i, 'unit', e.target.value)} placeholder="kg" title={ABBR[String(g.unit || '').trim()]} className={field} />
                      <select value={g.stage || 'primary'} onChange={(e) => setIng(i, 'stage', e.target.value)} className={field}>{ING_STAGES.map((t) => <option key={t}>{t}</option>)}</select>
                      <button onClick={() => setForm({ ...form, ingredients: form.ingredients.filter((_, j) => j !== i) })} title="Remove" className="text-slate-500 hover:text-red-500 justify-self-center"><X size={14} /></button>
                    </div>
                  ))}
                  <button onClick={() => setForm({ ...form, ingredients: [...form.ingredients, { type: 'honey', name: '', amount: '', unit: 'kg', stage: 'primary' }] })} className={`${btn} self-start`}><Plus size={13} /> Ingredient</button>
                </div>
              </div>
              <div className="mt-4">
                <span className={label}>Method</span>
                <StepsEditor value={form.method || ''} onChange={(m) => setForm({ ...form, method: m })} field={field} border={border} isDark={isDark} />
              </div>
              <div className="grid grid-cols-1 gap-3 mt-4">
                <div><span className={label}>Notes</span><textarea rows={Math.min(14, Math.max(4, Math.ceil((form.notes || '').length / 60)))} value={form.notes || ''} onChange={set('notes')} placeholder="Anything else worth remembering" title={abbrTitle(form.notes)} className={`${field} resize-y`} /></div>
              </div>
              <TermsPanel border={border} texts={[form.summary, form.method, form.notes, form.yeast, form.yeastNotes, form.nutrients, form.water, ...form.ingredients.map(ingText),
                form.targetOg || form.og ? 'OG' : '', form.targetFg || form.fg ? 'FG' : '']} />
              <div className="flex gap-2 mt-4">
                <button onClick={saveBrew} disabled={!form.name.trim() || busy === 'save'} className={primary}>{busy === 'save' ? <RotateCw size={13} className="animate-spin" /> : <Save size={13} />} Save</button>
                {brew && <button onClick={removeBrew} className={`${btn} text-red-500`}><Trash2 size={13} /> Delete</button>}
              </div>
            </div>
          )}

          {brew && !brew.isRecipe && tab === 'log' && (
            <div className={panel}>
              <h2 className="text-xs font-black uppercase tracking-wider mb-3">Fermentation log</h2>
              <GravityChart logs={brew.logs} og={brew.og} thirdBreak={c.thirdBreak} isDark={isDark} />
              <div className="grid grid-cols-2 sm:grid-cols-[8rem_6rem_5rem_5rem_minmax(0,1fr)] gap-2 mt-4 items-end">
                <div><span className={label}>What</span><select value={logForm.kind} onChange={(e) => setLogForm({ ...logForm, kind: e.target.value })} className={field}>{meta.logKinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k] || k}</option>)}</select></div>
                <div><span className={label}>Gravity</span><input type="number" step="0.001" value={logForm.gravity} onChange={(e) => setLogForm({ ...logForm, gravity: e.target.value })} placeholder="1.042" className={field} /></div>
                <div><span className={label}>°C</span><input type="number" step="0.5" value={logForm.tempC} onChange={(e) => setLogForm({ ...logForm, tempC: e.target.value })} className={field} /></div>
                <div><span className={label}><Ab k="pH" /></span><input type="number" step="0.1" value={logForm.ph} onChange={(e) => setLogForm({ ...logForm, ph: e.target.value })} className={field} /></div>
                <div className="col-span-2 sm:col-span-1"><span className={label}>Note</span><input value={logForm.text} onChange={(e) => setLogForm({ ...logForm, text: e.target.value })} placeholder="e.g. 1.5 g Fermaid-O, degassed" className={field} /></div>
              </div>
              <div className="flex flex-wrap gap-2 mt-2 items-end">
                <div><span className={label}>When (blank = now)</span><input type="datetime-local" value={logForm.at} onChange={(e) => setLogForm({ ...logForm, at: e.target.value })} className={field} /></div>
                <button onClick={addLog} disabled={busy === 'log'} className={primary}><Plus size={13} /> Log it</button>
              </div>
              <div className="flex flex-col gap-1.5 mt-4">
                {[...brew.logs].reverse().map((l) => (
                  <div key={l.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs border-b ${border} pb-1.5`}>
                    <span className="text-slate-500 w-28 shrink-0">{when(l.at)}</span>
                    <span className="font-semibold w-24 shrink-0">{KIND_LABEL[l.kind] || l.kind}</span>
                    {l.gravity && <span>{g3(l.gravity)}</span>}{l.tempC != null && <span>{l.tempC}°C</span>}{l.ph != null && <span><Ab k="pH" /> {l.ph}</span>}
                    <span className="min-w-0 flex-1 break-words text-slate-500">{l.text}{l.source === 'desk' ? ' · said on the desk' : ''}</span>
                    <button onClick={() => delLog(l.id)} className="text-slate-500 hover:text-red-500"><Trash2 size={12} /></button>
                  </div>
                ))}
                {!brew.logs.length && <p className="text-xs text-slate-500">Nothing logged yet. Or just tell Ims - "log a reading of ten forty-two on the mead".</p>}
              </div>
            </div>
          )}

          {brew && !brew.isRecipe && tab === 'tastings' && (
            <div className={panel}>
              <h2 className="text-xs font-black uppercase tracking-wider mb-3">How it tasted</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><span className={label}>Stage</span><input value={taste.stage} onChange={(e) => setTaste({ ...taste, stage: e.target.value })} placeholder="e.g. at racking / bottled / 3 months" className={field} /></div>
                <div><span className={label}>Rating: {taste.rating}/10</span><input type="range" min="1" max="10" value={taste.rating} onChange={(e) => setTaste({ ...taste, rating: Number(e.target.value) })} className="w-full accent-amber-500" /></div>
                {[['sweetness', 'Sweetness', 'dry', 'sweet'], ['body', 'Body', 'thin', 'full'], ['acidity', 'Acidity', 'flat', 'tart'], ['heat', 'Alcohol heat', 'smooth', 'hot']].map(([k, l, lo, hi]) => (
                  <div key={k}><span className={label}>{l}: {taste[k]}/5 <span className="normal-case font-normal">({lo} → {hi})</span></span><input type="range" min="1" max="5" value={taste[k]} onChange={(e) => setTaste({ ...taste, [k]: Number(e.target.value) })} className="w-full accent-amber-500" /></div>
                ))}
                <div><span className={label}>Aroma</span><input value={taste.aroma} onChange={(e) => setTaste({ ...taste, aroma: e.target.value })} placeholder="honey, pear, floral" className={field} /></div>
                <div><span className={label}>Flavour</span><input value={taste.flavour} onChange={(e) => setTaste({ ...taste, flavour: e.target.value })} placeholder="what it tastes like" className={field} /></div>
                <div><span className={label}>Clarity</span><input value={taste.clarity} onChange={(e) => setTaste({ ...taste, clarity: e.target.value })} placeholder="hazy / clear / brilliant" className={field} /></div>
                <div><span className={label}>Carbonation</span><input value={taste.carbonation} onChange={(e) => setTaste({ ...taste, carbonation: e.target.value })} placeholder="still / petillant / sparkling" className={field} /></div>
                <div><span className={label}>Was it nice?</span><input value={taste.verdict} onChange={(e) => setTaste({ ...taste, verdict: e.target.value })} placeholder="your verdict" className={field} /></div>
                <div><span className={label}>Change next time</span><input value={taste.changeNext} onChange={(e) => setTaste({ ...taste, changeNext: e.target.value })} placeholder="e.g. a bit more acid, ferment cooler" className={field} /></div>
              </div>
              <button onClick={addTaste} disabled={busy === 'taste'} className={`${primary} mt-3`}><Plus size={13} /> Save tasting</button>
              <div className="flex flex-col gap-2 mt-4">
                {[...brew.tastings].reverse().map((t) => (
                  <div key={t.id} className={`rounded-xl border ${border} px-3 py-2 text-xs flex flex-col gap-1`}>
                    <div className="flex items-center gap-2"><b>{t.rating ? `★ ${t.rating}/10` : 'Tasting'}</b><span className="text-slate-500">{when(t.at)}{t.stage ? ` · ${t.stage}` : ''}</span>
                      <button onClick={() => delTaste(t.id)} className="ml-auto text-slate-500 hover:text-red-500"><Trash2 size={12} /></button></div>
                    <span className="text-slate-500">Sweetness {t.sweetness ?? '-'} · Body {t.body ?? '-'} · Acidity {t.acidity ?? '-'} · Heat {t.heat ?? '-'}{t.clarity ? ` · ${t.clarity}` : ''}{t.carbonation ? ` · ${t.carbonation}` : ''}</span>
                    {(t.aroma || t.flavour) && <span>{[t.aroma && `Aroma: ${t.aroma}`, t.flavour && `Flavour: ${t.flavour}`].filter(Boolean).join(' · ')}</span>}
                    {t.verdict && <span>{t.verdict}</span>}
                    {t.changeNext && <span className="text-amber-500">Next time: {t.changeNext}</span>}
                  </div>
                ))}
                {!brew.tastings.length && <p className="text-xs text-slate-500">No tastings yet - taste it at racking, at bottling and as it ages, so you can see it change.</p>}
              </div>
            </div>
          )}

          {brew && !brew.isRecipe && tab === 'insights' && (
            <>
              <div className={panel}>
                <div className="flex items-center justify-between mb-3 gap-2">
                  <h2 className="text-xs font-black uppercase tracking-wider">Flavour profile and insight</h2>
                  <button onClick={getInsight} disabled={busy === 'insight'} className={primary}>{busy === 'insight' ? <RotateCw size={13} className="animate-spin" /> : <Sparkles size={13} />} {ins ? 'Refresh' : 'Get insight'}</button>
                </div>
                {!ins && <p className="text-xs text-slate-500">Reads the recipe, the log and your tastings (and your other brews, to learn what you like) and says where this one is heading and what to tweak. Takes about 15 seconds.</p>}
                {ins && (
                  <div className="flex flex-col gap-4 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="font-bold mb-2">{ins.profile?.style}{ins.profile?.expectedAbv ? ` · ~${ins.profile.expectedAbv}%` : ''}{ins.profile?.expectedFg ? <> · <Ab k="FG" /> ~{g3(ins.profile.expectedFg)}</> : ''}</p>
                        <Bars values={ins.profile} isDark={isDark} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {ins.profile?.aroma && <p><b>Aroma:</b> {ins.profile.aroma}</p>}
                        {ins.profile?.flavour && <p><b>Flavour:</b> {ins.profile.flavour}</p>}
                        {ins.profile?.finish && <p><b>Finish:</b> {ins.profile.finish}</p>}
                        {ins.progress && <p className="text-slate-500">{ins.progress}</p>}
                      </div>
                    </div>
                    {ins.watchOuts?.length > 0 && <div><p className="font-bold mb-1 text-amber-500">Watch out</p><ul className="list-disc pl-5 flex flex-col gap-1">{ins.watchOuts.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
                    {ins.nextSteps?.length > 0 && <div><p className="font-bold mb-1">Next steps</p><ul className="list-disc pl-5 flex flex-col gap-1">{ins.nextSteps.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
                    {ins.tweaks?.length > 0 && (
                      <div><p className="font-bold mb-1">Tweaks for next time</p>
                        <div className="flex flex-col gap-2">{ins.tweaks.map((t, i) => (
                          <div key={i} className={`rounded-xl border ${border} px-3 py-2`}>
                            <p className="font-semibold">{t.change}</p><p>{t.effect}</p>{t.why && <p className="text-slate-500">{t.why}</p>}
                            <button onClick={() => { setChange(t.change); setWhatIf(null); }} className="text-[11px] text-amber-500 mt-1">Try it in what-if →</button>
                          </div>))}</div>
                      </div>
                    )}
                    {ins.whatHeLikes && <p className="text-slate-500"><b>What you seem to like:</b> {ins.whatHeLikes}</p>}
                    <p className="text-[10px] text-slate-500">{when(brew.insightAt)}</p>
                  </div>
                )}
              </div>
              <div className={panel}>
                <h2 className="text-xs font-black uppercase tracking-wider mb-1">What if...</h2>
                <p className="text-[11px] text-slate-500 mb-3">Describe a change for next time and see what it would do to the brew.</p>
                <div className="flex flex-wrap gap-2">
                  <input value={change} onChange={(e) => setChange(e.target.value)} placeholder="e.g. swap 71B for EC-1118 and add 2 tsp acid blend" onKeyDown={(e) => { if (e.key === 'Enter' && change.trim()) askWhatIf(); }} className={`${field} flex-1 min-w-[14rem]`} />
                  <button onClick={askWhatIf} disabled={!change.trim() || busy === 'whatif'} className={primary}>{busy === 'whatif' ? <RotateCw size={13} className="animate-spin" /> : <Wand2 size={13} />} Predict</button>
                </div>
                {whatIf && (
                  <div className="flex flex-col gap-3 mt-4 text-xs">
                    <p className="font-semibold">{whatIf.summary}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><p className="text-[11px] text-slate-500 mb-2">Now (grey) → with the change{whatIf.before?.abv || whatIf.after?.abv ? <> · <Ab k="ABV" /> {whatIf.before?.abv ?? '?'}% → {whatIf.after?.abv ?? '?'}%</> : ''}{whatIf.after?.fg ? <> · <Ab k="FG" /> → {g3(whatIf.after.fg)}</> : ''}</p>
                        <Bars values={whatIf.after} compare={whatIf.before} isDark={isDark} /></div>
                      <div className="flex flex-col gap-1.5">
                        {whatIf.flavour && <p><b>Taste:</b> {whatIf.flavour}</p>}
                        {whatIf.process && <p><b>What you'd do differently:</b> {whatIf.process}</p>}
                        {whatIf.risks && <p className="text-amber-500"><b>Risks:</b> {whatIf.risks}</p>}
                        {whatIf.confidence && <p className="text-slate-500">Confidence: {whatIf.confidence}</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
      <HomebrewInviteModal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} isDark={isDark} toast={notify} />
    </PortalShell>
  );
}
