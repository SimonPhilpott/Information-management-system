import React, { useState, useEffect, useCallback } from 'react';
import { useFocusItem } from '../../hooks/useFocusItem';
import { FlaskConical, Plus, Save, Trash2, RotateCw, Sparkles, Bell, X, Wand2, ExternalLink, Copy, ChevronUp, ChevronDown, ArrowLeft, ScrollText, Activity, Wine, Star, Heart, Share2, Send, FileDown, Link2 } from 'lucide-react';
import PortalShell from './PortalShell';

// Homebrew: Simon's meads, braggots and other brews - the recipe, what happened to each batch, how it tasted as
// it aged, and insights (the flavour profile it's heading for, what to tweak, what a change would do).
const GRADIENT = 'from-amber-500 to-orange-600';
const ING_TYPES = ['honey', 'malt', 'fruit', 'spice', 'hops', 'sugar', 'acid', 'tannin', 'other'];
const ING_STAGES = ['primary', 'secondary', 'backsweeten', 'bottling'];
const KIND_LABEL = { reading: 'Reading', nutrient: 'Nutrient', degas: 'Degas', addition: 'Addition', rack: 'Racked', stabilise: 'Stabilised', backsweeten: 'Backsweetened', bottle: 'Bottled', note: 'Note' };
const when = (t) => (t ? new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const g3 = (g) => (g ? Number(g).toFixed(3) : '-');
const EMPTY_BREW = { name: '', category: 'mead', style: 'Traditional mead', sourceName: '', sourceUrl: '', status: 'planning', batchLitres: '', startedOn: '', bottledOn: '', targetOg: '', targetFg: '', og: '', fg: '', sweetness: '', colour: '', carbonation: '', yeast: '', yeastNotes: '', nutrients: '', water: '', method: '', notes: '', ingredients: [] };
const PROFILE_KEYS = [['sweetness', 'Sweetness'], ['body', 'Body'], ['acidity', 'Acidity'], ['alcoholHeat', 'Alcohol heat'], ['aromaIntensity', 'Aroma'], ['tannin', 'Tannin']];

// The method as separate steps - edit, add, delete and reorder them (arrows, or drag a step by its number).
// Still kept as numbered lines ("1. ...\n2. ..."), so older brews, Ims and the insights read it as before.
const parseSteps = (method) => String(method || '').split('\n').map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim()).filter(Boolean);
const joinSteps = (steps) => steps.map((s) => s.trim()).filter(Boolean).map((s, i) => `${i + 1}. ${s}`).join('\n');

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
const STATUS_WORD = { planning: 'Planning', fermenting: 'Bubbling away', conditioning: 'Clearing', bottled: 'Bottled', finished: 'Finished', dumped: 'Dumped' };
const TRACK = ['planning', 'fermenting', 'conditioning', 'bottled', 'finished'];
const VESSEL_CSS = `
@keyframes hb-rise { 0% { transform: translateY(0); opacity: 0 } 15% { opacity: .9 } 100% { transform: translateY(-62px); opacity: 0 } }
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
@media (prefers-reduced-motion: reduce) { .hb-bubble, .hb-airlock, .hb-star { animation: none } .hb-card:hover { transform: none } }
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
    ['lilac', '🌸'], ['marigold', '🌼'], ['mint', '🌿'], ['mugwort', '🌿'], ['nettle', '🌱'], ['oregano', '🌿'], ['pineapple weed', '🌼'], ['primrose', '🌼'], ['rose', '🌹'],
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

// A demijohn showing the brew: the liquid in its colour, bubbles while it ferments, clearing as it
// conditions, a twinkle once bottled, empty while it's still a plan.
function Vessel({ category, status, isRecipe, size = 96, isDark, wine }) {
  const id = React.useId().replace(/:/g, '');
  const colour = status === 'dumped' ? '#94a3b8' : (WINE_COLOURS.find((w) => w.id === wine) || look(category)).liquid;
  const fill = isRecipe ? 0.55 : ({ planning: 0, dumped: 0.15 }[status] ?? 0.8);
  const top = 122 - fill * 84;
  const glass = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(46,43,39,0.35)';
  const body = 'M42 20 H58 V32 C58 40 86 44 86 70 V112 Q86 122 76 122 H24 Q14 122 14 112 V70 C14 44 42 40 42 32 Z';
  const bubbling = !isRecipe && status === 'fermenting';
  return (
    <svg viewBox="0 0 100 130" width={size} height={size * 1.3} aria-hidden="true" className="shrink-0 drop-shadow-sm">
      <defs>
        <clipPath id={`c${id}`}><path d={body} /></clipPath>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={colour} stopOpacity={status === 'conditioning' ? 0.75 : 0.95} />
          <stop offset="1" stopColor={colour} stopOpacity="1" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#c${id})`}>
        <rect x="0" y={top} width="100" height="130" fill={`url(#g${id})`} />
        {fill > 0 && <rect x="0" y={top} width="100" height="3" fill="#fff" opacity={bubbling ? 0.55 : 0.25} />}
        {bubbling && [22, 34, 48, 61, 72, 40, 66].map((cx, i) => (
          <circle key={i} className="hb-bubble" cx={cx} cy={118 - (i % 3) * 6} r={1.6 + (i % 3) * 0.7} fill="#fff" opacity="0.8" style={{ animationDelay: `${(i * 0.37) % 2.6}s` }} />
        ))}
        {!isRecipe && status === 'conditioning' && <rect x="0" y="116" width="100" height="8" fill="#6b4f2a" opacity="0.45" />}
        <path d="M22 60 C24 50 30 46 36 44" stroke="#fff" strokeWidth="3" fill="none" opacity="0.35" strokeLinecap="round" />
      </g>
      <path d={body} fill="none" stroke={glass} strokeWidth="2.5" />
      <rect x="39" y="14" width="22" height="9" rx="2" fill="#a0703c" />
      <rect x="47" y="3" width="6" height="12" rx="2" fill="none" stroke={glass} strokeWidth="2" />
      {bubbling && <circle className="hb-airlock" cx="50" cy="7" r="2.2" fill={colour} />}
      {isRecipe && <g transform="translate(62 84)"><rect width="22" height="28" rx="2" fill="#fff8e7" stroke="#d6b77a" /><path d="M5 8 H17 M5 14 H17 M5 20 H13" stroke="#b08b4f" strokeWidth="1.6" /></g>}
      {!isRecipe && (status === 'bottled' || status === 'finished') && [[80, 22], [20, 30], [88, 46]].map(([x, y], i) => (
        <path key={i} className="hb-star" d={`M${x} ${y - 5} L${x + 1.5} ${y - 1.5} L${x + 5} ${y} L${x + 1.5} ${y + 1.5} L${x} ${y + 5} L${x - 1.5} ${y + 1.5} L${x - 5} ${y} L${x - 1.5} ${y - 1.5} Z`} fill="#fbbf24" style={{ animationDelay: `${i * 0.6}s` }} />
      ))}
    </svg>
  );
}

// Where a brew is in its life: planning → fermenting → clearing → bottled → finished.
function StatusTrack({ status, isDark }) {
  const at = TRACK.indexOf(status);
  return (
    <div className="flex items-center gap-1 w-full">
      {TRACK.map((s, i) => (
        <React.Fragment key={s}>
          <div className="flex flex-col items-center gap-1 min-w-0">
            <span className={`w-3 h-3 rounded-full ${i <= at ? `bg-gradient-to-r ${GRADIENT}` : isDark ? 'bg-white/10' : 'bg-[#2E2B27]/10'} ${i === at ? 'ring-4 ring-amber-500/25' : ''}`} />
            <span className={`text-[10px] truncate ${i === at ? 'font-bold text-amber-500' : 'text-slate-500'}`}>{STATUS_WORD[s]}</span>
          </div>
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

export default function HomebrewPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [brews, setBrews] = useState([]);
  const [meta, setMeta] = useState({ styles: [], statuses: [], logKinds: [], categories: [] });
  const [recipes, setRecipes] = useState([]);
  const [view, setView] = useState('brews'); // 'brews' | 'recipes'
  const [cat, setCat] = useState('all');
  const [have, setHave] = useState(''); // the ingredient finder - what Simon has to use up
  const [pickGroup, setPickGroup] = useState('fruit'); // which group of the ingredient picker is open
  const [favOnly, setFavOnly] = useState(false); // show only favourites
  const [acids, setAcids] = useState([]); // acidity to show (none picked = all)
  const [fizzes, setFizzes] = useState([]); // still / sparkling
  const [flavs, setFlavs] = useState([]); // flavours it must have - each one picked narrows it further
  const [sweets, setSweets] = useState([]); // sweetness to show (none picked = all)
  const [shareInfo, setShareInfo] = useState(null); // the share link just made: { id, url, reachable }
  const [pdfReady, setPdfReady] = useState(null); // a PDF made but waiting for a tap to send it
  const [abvPick, setAbvPick] = useState(null); // strength range picked on the slider, [low, high] - null = any
  useFocusItem(brews.length);
  const [selId, setSelId] = useState(null);
  const [creating, setCreating] = useState(false); // the new-brew form is open
  const [brew, setBrew] = useState(null);
  const [form, setForm] = useState(EMPTY_BREW);
  const [tab, setTab] = useState('recipe');
  const [busy, setBusy] = useState('');
  const [logForm, setLogForm] = useState({ kind: 'reading', gravity: '', tempC: '', ph: '', text: '', at: '' });
  const [taste, setTaste] = useState({ stage: '', rating: 7, sweetness: 3, body: 3, acidity: 3, heat: 2, aroma: '', flavour: '', clarity: '', carbonation: '', verdict: '', changeNext: '' });
  const [change, setChange] = useState('');
  const [whatIf, setWhatIf] = useState(null);
  const [notification, setNotification] = useState(null);
  const notify = (msg, type = 'success') => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3500); };

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
      const b = d.brew;
      setForm({ ...EMPTY_BREW, ...Object.fromEntries(Object.keys(EMPTY_BREW).map((k) => [k, b[k] ?? EMPTY_BREW[k]])), ingredients: b.ingredients || [] });
    } catch (err) { notify(err.message, 'error'); }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadBrew(selId); }, [selId, loadBrew]);

  const run = async (key, fn, ok) => { setBusy(key); try { await fn(); if (ok) notify(ok); } catch (err) { notify(err.message, 'error'); } finally { setBusy(''); } };
  const saveBrew = () => run('save', async () => {
    const d = await api(brew ? `/api/homebrew/${brew.id}` : '/api/homebrew', brew ? 'PUT' : 'POST', brew ? form : { ...form, isRecipe: view === 'recipes' });
    await loadList(); setCreating(false); setSelId(d.brew.id); setBrew(d.brew);
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
  const pitched = () => { if (!window.confirm('Set reminders for the staggered nutrient doses - 24, 48 and 72 hours from now, and a 1/3-break check on day 6?')) return; run('remind', async () => { await api(`/api/homebrew/${brew.id}/nutrient-reminders`, 'POST', {}); loadBrew(brew.id); }, 'Nutrient reminders set - see Reminders.'); };

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

  return (
    <PortalShell title="Homebrew" subtitle="/ims/homebrew • your meads, braggots and brews"
      icon={FlaskConical} gradient={GRADIENT} glow="rgba(245,158,11,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification} maxWidth="max-w-6xl">
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
            <button onClick={() => startNew(cat)} className={`${primary} ml-auto !px-4 !py-2.5 !text-sm shadow-lg shadow-amber-500/20`}><Plus size={15} /> {view === 'recipes' ? 'New recipe' : 'New brew'}</button>
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
            {pickGroups.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {pickGroups.map((g) => {
                    const on = pickGroup === g.id;
                    const chosen = g.items.filter((i) => wanted.includes(i.w)).length;
                    return (
                      <button key={g.id} onClick={() => setPickGroup(on ? '' : g.id)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition ${on ? `bg-gradient-to-r ${GRADIENT} text-white border-transparent` : `${border} ${isDark ? 'bg-slate-900/50' : 'bg-white/80'} hover:border-amber-500/60`}`}>
                        <span className="text-sm leading-none">{g.icon}</span>{g.label}
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
                          <span className="mr-1">{i.icon}</span>{i.w}<span className={`ml-1 text-[10px] ${on ? 'text-white/80' : 'text-slate-500'}`}>{i.n}</span>
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
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {[['Sweetness', 'sweet', SWEETNESS, sweets, setSweets, (o) => (b) => sweetOf(b) === o.id, 'From the book where it says, otherwise estimated from the sugar, yeast and method'],
              ['Acidity', 'acid', ACIDITY, acids, setAcids, (o) => (b) => b.acidity === o.id, 'How tart and fresh it is - judged from sharp fruit, added acid and citrus, or a sour style'],
              ['Fizz', 'fizz', FIZZ, fizzes, setFizzes, (o) => (b) => b.fizz === o.id, 'Still, or sparkling (bottle-conditioned or carbonated)']].map(([title, group, opts, on, setOn, test, help]) => (
              <div key={title} className="flex flex-wrap items-center gap-1.5" title={help}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1">{title}</span>
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
              <div className="basis-full flex"><div className="flex items-center gap-2 w-full sm:w-[36rem]" title="Strength - measured, from the target gravities, or estimated from the sugar and yeast where the book doesn't say">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Strength</span>
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
              </div></div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" title="Aromas and flavours, from what goes in - pick more than one to find drinks with all of them">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1">Aromas &amp; flavours</span>
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
            {(tasteOn || abvOn) && <button onClick={clearTaste} className="ml-auto text-xs font-bold text-slate-500 hover:text-amber-500 flex items-center gap-1"><X size={12} /> Clear filters</button>}
          </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {[{ id: 'all', label: 'Everything' }, ...meta.categories].map((k) => {
              const L = k.id === 'all' ? { emoji: '✨', liquid: '#f59e0b' } : look(k.id);
              const on = cat === k.id;
              return (
                <button key={k.id} onClick={() => setCat(k.id)} className={`rounded-2xl border px-3 py-3 flex flex-col items-center gap-1 min-w-0 transition ${on ? 'border-amber-500 shadow-lg shadow-amber-500/20' : border} ${isDark ? 'bg-slate-900/50 hover:bg-slate-800/60' : 'bg-white/80 hover:bg-white'}`}>
                  <span className="text-2xl leading-none">{L.emoji}</span>
                  <span className="text-xs font-bold text-center leading-tight">{k.label}</span>
                  <span className="h-1 w-8 rounded-full" style={{ background: L.liquid, opacity: on ? 1 : 0.45 }} />
                  <span className="text-[10px] text-slate-500">{countIn(k.id)}</span>
                </button>
              );
            })}
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
                <div key={key} id={`brew-${b.id}`} role="button" tabIndex={0} onClick={() => { setCreating(false); setSelId(b.id); setWhatIf(null); setTab('recipe'); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCreating(false); setSelId(b.id); setWhatIf(null); setTab('recipe'); } }}
                  className={`hb-card cursor-pointer text-left ${tile} overflow-hidden flex flex-col hover:shadow-xl hover:shadow-amber-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${isDark ? 'bg-slate-900/50' : 'bg-white/80'}`}>
                  <div className={`relative flex items-end justify-center pt-5 bg-gradient-to-b ${L.tint}`}>
                    <span className="absolute top-2 left-3 text-xl">{L.emoji}</span>
                    <button onClick={(e) => { e.stopPropagation(); toggleFav(b); }} title={b.favourite ? 'Remove from favourites' : 'Add to favourites'}
                      className={`absolute top-9 right-2.5 p-1.5 rounded-full transition ${b.favourite ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500'} ${isDark ? 'bg-slate-950/40' : 'bg-white/70'}`}>
                      <Heart size={15} fill={b.favourite ? 'currentColor' : 'none'} />
                    </button>
                    {b.isRecipe
                      ? <span className="absolute top-2.5 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600">{many ? `${members.length} versions` : 'Recipe'}</span>
                      : <span className={`absolute top-2.5 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_PILL[b.status] || ''}`}>{STATUS_WORD[b.status] || b.status}</span>}
                    <Vessel category={b.category} status={b.status} isRecipe={b.isRecipe} size={72} isDark={isDark} wine={wine} />
                    {(() => {
                      const vals = members.map(strengthOf).filter((v) => v != null);
                      if (!vals.length || (!b.isRecipe && !b.calc.abv && !b.calc.potentialAbv)) return null;
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
                        {wine && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 bg-slate-500/10 text-slate-500"><span className={`w-2 h-2 rounded-full ${WINE_COLOURS.find((w) => w.id === wine).dot}`} />{WINE_COLOURS.find((w) => w.id === wine).label}</span>}
                        {sweetTags.map((s) => {
                          const est = members.filter((m) => sweetOf(m) === s.id).every((m) => m.sweetnessBasis === 'estimate');
                          return <span key={s.id} title={est ? 'Estimated - the book doesn\'t say' : undefined} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${SWEET_PILL[s.id]}`}>{s.label}{est ? ' ~' : ''}</span>;
                        })}
                        {(() => {
                          const fl = FLAVOUR_TAGS.filter((f) => members.some((m) => (m.flavours || []).includes(f.id)));
                          return fl.length ? <span className="text-sm leading-none ml-0.5 tracking-tight" title={fl.map((f) => f.label).join(', ')}>{fl.map((f) => f.emoji).join('')}</span> : null;
                        })()}
                      </div>
                    )}
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
                </div>
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
          <button onClick={backToShelf} className="self-start text-xs font-bold text-slate-500 hover:text-amber-500 flex items-center gap-1.5"><ArrowLeft size={14} /> {view === 'recipes' ? 'Back to the recipe book' : 'Back to all brews'}</button>

          {brew && (
            <div className={`rounded-3xl border overflow-hidden ${isDark ? 'border-white/5 bg-slate-900/40' : 'border-[#2E2B27]/10 bg-white/70 shadow-sm'}`}>
              <div className={`flex flex-col sm:flex-row gap-5 p-5 bg-gradient-to-br ${look(brew.category).tint}`}>
                <div className="flex justify-center"><Vessel category={brew.category} status={brew.status} isRecipe={brew.isRecipe} size={110} isDark={isDark} wine={colourOf(brew)} /></div>
                <div className="flex-1 min-w-0 flex flex-col gap-3">
                  <div>
                    <div className="text-xs text-slate-500">{look(brew.category).emoji} {catLabel(brew.category)}{brew.style ? ` · ${brew.style}` : ''}</div>
                    <div className="flex items-start gap-2">
                      <h2 className="text-2xl font-black break-words leading-tight mt-0.5 flex-1 min-w-0">{brew.name}</h2>
                      <button onClick={() => toggleFav(brew)} title={brew.favourite ? 'Remove from favourites' : 'Add to favourites'} className={`p-2 rounded-full shrink-0 transition ${brew.favourite ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500'} ${isDark ? 'bg-slate-950/40' : 'bg-white/80'}`}>
                        <Heart size={18} fill={brew.favourite ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                    {brew.isRecipe && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <button onClick={shareLink} disabled={busy === 'share'} title="Send a link to this recipe - opens WhatsApp, Messages and the rest on a phone, or copies the link on a computer" className={`${btn} ${isDark ? 'bg-slate-950/40' : 'bg-white/85'} hover:text-amber-500`}>
                          {busy === 'share' ? <RotateCw size={13} className="animate-spin" /> : <Share2 size={13} />} Share link
                        </button>
                        <button onClick={sendPdf} disabled={busy === 'pdf-send'} title="Send the recipe as a PDF file" className={`${btn} ${isDark ? 'bg-slate-950/40' : 'bg-white/85'} hover:text-amber-500`}>
                          {busy === 'pdf-send' ? <RotateCw size={13} className="animate-spin" /> : <Send size={13} />} Send PDF
                        </button>
                        <button onClick={downloadPdf} disabled={busy === 'pdf-save'} title="Download the recipe as a PDF" className={`${btn} ${isDark ? 'bg-slate-950/40' : 'bg-white/85'} hover:text-amber-500`}>
                          {busy === 'pdf-save' ? <RotateCw size={13} className="animate-spin" /> : <FileDown size={13} />} Download PDF
                        </button>
                        {pdfReady && <button onClick={() => run('pdf-send', () => sendFile(pdfReady))} className={primary}><Send size={13} /> PDF ready - tap to send</button>}
                      </div>
                    )}
                    {brew.isRecipe && (brew.shared || shareInfo?.id === brew.id) && (
                      <div className={`mt-2 flex flex-wrap items-center gap-2 text-xs rounded-xl px-3 py-2 border ${border} ${isDark ? 'bg-slate-950/40' : 'bg-white/85'}`}>
                        <Link2 size={13} className="text-amber-500 shrink-0" />
                        {shareInfo?.id === brew.id
                          ? <a href={shareInfo.url} target="_blank" rel="noreferrer" className="text-sky-500 hover:underline break-all min-w-0 flex-1">{shareInfo.url}</a>
                          : <span className="text-slate-500 flex-1 min-w-0">Shared - anyone with the link can see this recipe.</span>}
                        {shareInfo?.id === brew.id && <button onClick={() => navigator.clipboard?.writeText(shareInfo.url).then(() => notify('Link copied.'))} className="font-bold text-slate-500 hover:text-amber-500 flex items-center gap-1"><Copy size={12} /> Copy</button>}
                        <button onClick={stopSharing} disabled={busy === 'unshare'} title="Turn the link off - anyone who has it won't be able to open it any more" className="font-bold text-slate-500 hover:text-red-500 flex items-center gap-1"><X size={12} /> Stop sharing</button>
                        {shareInfo?.id === brew.id && !shareInfo.reachable && <span className="basis-full text-[11px] text-amber-600">The remote-access tunnel isn't running, so this link only works on your home network. Turn ngrok on in Settings to send it to other people.</span>}
                      </div>
                    )}
                  </div>
                  {brew.isRecipe ? (
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">From your recipe book{brew.calc.potentialAbv ? ` · about ${brew.calc.potentialAbv}%` : brew.abvEstimate ? ` · ~${brew.abvEstimate}%` : ''}
                          {brew.batchLitres ? <span title={bottlesOf(brew.batchLitres, brew.category)?.hint}> · {brew.batchLitres} L makes {bottlesOf(brew.batchLitres, brew.category)?.text} bottles</span> : null}</p>
                        {brew.sourceName && <p className="text-slate-500">Source: {brew.sourceUrl ? <a href={brew.sourceUrl} target="_blank" rel="noreferrer" className="text-sky-500 hover:underline inline-flex items-center gap-1">{brew.sourceName}<ExternalLink size={10} /></a> : brew.sourceName}</p>}
                        {(colourOf(brew) || sweetOf(brew)) && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {colourOf(brew) && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 bg-slate-500/10 text-slate-500"><span className={`w-2 h-2 rounded-full ${WINE_COLOURS.find((w) => w.id === colourOf(brew)).dot}`} />{WINE_COLOURS.find((w) => w.id === colourOf(brew)).label}</span>}
                            {sweetOf(brew) && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${SWEET_PILL[sweetOf(brew)]}`}>{SWEETNESS.find((s) => s.id === sweetOf(brew)).label}</span>}
                            {sweetOf(brew) && brew.sweetnessBasis && <span className="text-[10px] text-slate-500">{BASIS_WORD[brew.sweetnessBasis]}</span>}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {brew.acidity && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-lime-500/15 text-lime-700" title={ACIDITY.find((a) => a.id === brew.acidity)?.hint}>{ACIDITY.find((a) => a.id === brew.acidity)?.label} acidity</span>}
                          {brew.fizz && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600">{brew.fizz === 'sparkling' ? '🫧 Sparkling' : 'Still'}</span>}
                          {FLAVOUR_TAGS.filter((f) => (brew.flavours || []).includes(f.id)).map((f) => <span key={f.id} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-500">{f.emoji} {f.label}</span>)}
                        </div>
                      </div>
                      <button onClick={startFrom} disabled={busy === 'start'} className={primary}><Plus size={13} /> Start a brew from this</button>
                    </div>
                  ) : null}
                  {brew.isRecipe && familyOf(brew).length > 1 ? (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{familyOf(brew).length} versions of {brew.family} - pick one</span>
                      <div className="flex flex-wrap gap-1.5">
                        {familyOf(brew).map((v) => {
                          const on = v.id === brew.id;
                          const vs = sweetOf(v);
                          return (
                            <button key={v.id} onClick={() => { if (!on) { setSelId(v.id); setWhatIf(null); } }} title={v.name}
                              className={`px-2.5 py-1 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition ${on ? 'bg-amber-500 border-amber-500 text-white' : `${border} ${isDark ? 'bg-slate-950/40' : 'bg-white/85'} hover:border-amber-500/60`}`}>
                              {colourOf(v) && <span className={`w-2 h-2 rounded-full ${WINE_COLOURS.find((w) => w.id === colourOf(v)).dot}`} />}
                              {v.variant || v.sourceName || v.name}
                              {vs && <span className={`text-[10px] px-1.5 rounded-full ${on ? 'bg-white/25' : SWEET_PILL[vs]}`}>{SWEETNESS.find((s) => s.id === vs).label}{v.sweetnessBasis === 'estimate' ? ' ~' : ''}</span>}
                              {v.favourite && <Heart size={11} fill="currentColor" className={on ? '' : 'text-rose-500'} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  {brew.isRecipe ? null : (
                    <>
                      <StatusTrack status={brew.status} isDark={isDark} />
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {[['ABV', c.abv ? `${c.abv}%${c.abvFinal ? '' : ' so far'}` : '-'], ['Potential', c.potentialAbv ? `${c.potentialAbv}%` : '-'], ['Day', c.daysSinceStart ?? '-'], ['OG', g3(brew.og)], ['Latest', g3(c.latestGravity)],
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
              {!brew.isRecipe && (
                <div className={`flex flex-wrap items-center gap-2 px-5 py-3 border-t ${border}`}>
                  {[['recipe', 'Recipe', <ScrollText size={14} />], ['log', 'Log', <Activity size={14} />], ['tastings', 'Tastings', <Wine size={14} />], ['insights', 'Insights', <Sparkles size={14} />]].map(([t, l, icon]) => (
                    <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${tab === t ? `bg-gradient-to-r ${GRADIENT} text-white shadow-md shadow-amber-500/20` : 'text-slate-500 hover:text-amber-500'}`}>{icon} {l}</button>
                  ))}
                  {(brew.status === 'planning' || brew.status === 'fermenting') && <button onClick={pitched} disabled={busy === 'remind'} className={`${btn} ml-auto`}><Bell size={13} /> I've just pitched</button>}
                  <button onClick={keepAsRecipe} disabled={busy === 'keep'} className={`${btn} ${(brew.status === 'planning' || brew.status === 'fermenting') ? '' : 'ml-auto'}`}><Copy size={13} /> Save as recipe</button>
                </div>
              )}
            </div>
          )}

          {(!brew || brew.isRecipe || tab === 'recipe') && (
            <div className={panel}>
              <h2 className="text-xs font-black uppercase tracking-wider mb-3">{brew ? 'Recipe' : view === 'recipes' ? 'New recipe' : 'New brew'}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2"><span className={label}>Name</span><input value={form.name} onChange={set('name')} placeholder="e.g. Christmas braggot for Dad" className={field} /></div>
                <div><span className={label}>Type</span><select value={form.category || ''} onChange={(e) => setForm({ ...form, category: e.target.value, style: stylesFor(e.target.value)[0] })} className={field}>{meta.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
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
              <AbbrStrip border={border} texts={[form.method, form.notes, form.yeast, form.yeastNotes, form.nutrients, form.water, ...form.ingredients.map(ingText),
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
    </PortalShell>
  );
}
