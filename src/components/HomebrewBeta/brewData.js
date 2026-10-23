// Homebrew (beta): the facts about drinks, copied from the classic portal (HomebrewPortal.jsx) so the beta stays
// fully separate from it - the same categories, statuses, sweetness, flavours, glossary abbreviations and ingredient
// finder, so both show a brew the same way. Generated from the classic file on 22 Oct 2026; keep in step by hand.

const ING_TYPES = ['honey', 'malt', 'fruit', 'spice', 'hops', 'sugar', 'acid', 'tannin', 'other'];
const ING_EMOJI = { honey: '🍯', malt: '🌾', fruit: '🍎', spice: '🌿', hops: '🍃', sugar: '🍬', acid: '🍋', tannin: '🍂', other: '🧪' };
const ING_STAGES = ['primary', 'secondary', 'backsweeten', 'bottling'];
const STAGE_LABEL = { primary: 'Primary (start)', secondary: 'Secondary (aging)', backsweeten: 'Backsweeten', bottling: 'Bottling' };
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

const BEERISH = ['beer', 'stout', 'cider', 'soda'];
const NAME_POSITIONS = [['top-left', 'Top left'], ['top-center', 'Top centre'], ['middle-left', 'Middle left'], ['middle-center', 'Middle centre']];
const BORDERS = [['none', 'None'], ['line', 'Fine line'], ['double', 'Double'], ['classic', 'Classic'], ['vintage', 'Vintage'], ['deco', 'Art deco'], ['greek', 'Greek key'], ['scallop', 'Scallop'], ['dotted', 'Dotted']];
const LABEL_PX = [374, 215]; // 99 x 57 mm at 96 dpi
const remembered = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };


// How each kind of brew looks: an emoji, the colour of the liquid in the jar and a tint for its tile.
const CAT_LOOK = {
  mead: { emoji: '🍯', liquid: '#f2b630', tint: 'from-amber-400/30 to-yellow-500/10' },
  white_wine: { emoji: '🥂', liquid: '#e6dc8a', tint: 'from-lime-200/30 to-yellow-100/10' },
  red_wine: { emoji: '🍷', liquid: '#8a1538', tint: 'from-rose-700/30 to-red-900/10' },
  rose_wine: { emoji: '🌸', liquid: '#f08fa8', tint: 'from-pink-300/30 to-rose-400/10' },
  fruit_veg_wine: { emoji: '🫐', liquid: '#a83262', tint: 'from-pink-500/30 to-purple-600/10' },
  flower_herb_wine: { emoji: '🌼', liquid: '#e8c85a', tint: 'from-yellow-300/30 to-emerald-400/10' },
  hot_pepper_wine: { emoji: '🌶', liquid: '#d9381e', tint: 'from-red-500/30 to-orange-600/10' },
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
  { id: 'spicy', label: 'Spiced', emoji: '🫚', hint: 'Ginger, cinnamon, cloves, vanilla, chilli' },
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
    ['citrus', '🍋'], ['citrus fruit', '🍋'], ['cloudberry', '🫐'], ['dewberry', '🫐'], ['stone fruit', '🍑'],
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
    ['artichoke', '🥬'], ['jerusalem artichoke', '🥔'], ['aubergine', '🍆'], ['broad bean', '🫛'], ['lima bean', '🫛'], ['runner bean', '🫛'], ['lettuce', '🥬'], ['spinach', '🥬'], ['mangel wurzel', '🥔'], ['mangelwurzel', '🥔'], ['mangold', '🥔'], ['mangold wurzel', '🥔'], ['knotweed', '🌱'], ['knotweed stalk', '🌱'],
    ['beet', '🟣'], ['bell pepper', '🫑'], ['carrot', '🥕'], ['celery', '🥬'], ['corn', '🌽'], ['cucumber', '🥒'], ['garlic', '🧄'],
    ['kale', '🥬'], ['marrow', '🥒'], ['onion', '🧅'], ['parsnip', '🥕'], ['pea', '🫛'], ['potato', '🥔'], ['pumpkin', '🎃'], ['squash', '🎃'], ['swede', '🥔'], ['sweet potato', '🍠'],
    ['tomato', '🍅'], ['turnip', '🥔'],
  ] },
  { id: 'herbs', label: 'Herbs & flowers', icon: '🌿', items: [
    ['rose water', '🌹'], ['agrimony', '🌼'], ['burnet', '🌿'], ['black locust flower', '🌼'], ['bramble tip', '🌱'], ['carnation', '🌸'], ['coltsfoot', '🌼'], ['flower', '🌸'], ['petal', '🌸'], ['blossom', '🌸'], ['geranium', '🌸'], ['pelargonium', '🌸'], ['goldenrod', '🌼'], ['hawthorn blossom', '🌸'], ['honeysuckle', '🌼'], ['linden blossom', '🌼'], ['parsley', '🌿'], ['passion flower', '🌸'], ['pellitory', '🌿'], ['rosebud', '🌹'], ['sweet briar', '🌹'], ['woolly bluecurls', '🌸'], ['forest grass', '🌾'], ['gesho', '🌿'], ['gesho stick', '🌿'], ['dock', '🌿'], ['curly dock', '🌿'], ['bitter dock', '🌿'], ['gromwell', '🌿'],
    ['apple mint', '🌿'], ['basil', '🌿'], ['bay', '🌿'], ['broom', '🌼'], ['burdock', '🌿'], ['chamomile', '🌼'], ['clover', '☘'], ['cowslip', '🌼'], ['dandelion', '🌼'], ['elderflower', '🌸'], ['fennel', '🌿'], ['gorse', '🌼'], ['ground ivy', '🌿'],
    ['heather', '🌸'], ['hibiscus', '🌺'], ['horehound', '🌿'], ['hyssop', '🌿'], ['jasmine', '🌸'], ['lavender', '🪻'], ['lemon balm', '🌿'], ['lemongrass', '🌿'],
    ['lilac', '🌸'], ['marigold', '🌼'], ['mint', '🌿'], ['mugwort', '🌿'], ['nettle', '🌿'], ['oregano', '🌿'], ['pineapple weed', '🌼'], ['primrose', '🌼'], ['rose', '🌹'],
    ['rosemary', '🌿'], ['sage', '🌿'], ['sagebrush', '🌿'], ['tarragon', '🌿'], ['thyme', '🌿'], ['violet', '🌸'], ['wormwood', '🌿'], ['yarrow', '🌼'],
    ['yerba santa', '🌿'],
  ] },
  { id: 'spice', label: 'Spices & roots', icon: '🫚', items: [
    ['eringo root', '🫚'], ['gentian', '🫚'], ['almond essence', '🌰'],
    ['allspice', '🟤'], ['anise', '⭐'], ['cardamom', '🟢'], ['cayenne', '🌶'], ['chile', '🌶'], ['chocolate', '🍫'], ['cinnamon', '🟤'], ['clove', '🟤'],
    ['cocoa', '🍫'], ['coffee', '☕'], ['coriander', '🌿'], ['fenugreek', '🟡'], ['ghost pepper', '🌶'], ['ginger', '🫚'], ['habanero', '🌶'], ['jalapeño', '🌶'],
    ['licorice', '🟤'], ['nutmeg', '🌰'], ['pepper', '🌶'], ['peppercorn', '⚫'], ['sarsaparilla', '🟤'], ['sassafras', '🟤'], ['star anise', '⭐'], ['tea', '🍵'],
    ['vanilla', '🍦'],
  ] },
  { id: 'grain', label: 'Grains & malts', icon: '🌾', items: [
    ['souring grain', '🌾'],
    ['amber malt', '🌾'], ['barley', '🌾'], ['biscuit malt', '🌾'], ['bread', '🍞'], ['caramalt', '🌾'], ['chocolate malt', '🌾'], ['crystal malt', '🌾'],
    ['golden promise', '🌾'], ['maize', '🌽'], ['malt', '🌾'], ['malt extract', '🌾'], ['maris otter', '🌾'], ['munich', '🌾'], ['oat', '🌾'], ['pilsner', '🌾'],
    ['rice', '🍚'], ['rye', '🌾'], ['sorghum', '🌾'], ['vienna', '🌾'], ['wheat', '🌾'],
  ] },
  { id: 'sweet', label: 'Honey & sugars', icon: '🍯', items: [
    ['sugar', '🍬'], ['brewing sugar', '🍬'], ['candies', '🍬'], ['fireball candies', '🍬'],
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
    ['tree sap', '🌳'], ['sycamore sap', '🌳'], ['walnut sap', '🌳'], ['black locust', '🌳'], ['fallen leaves', '🍂'], ['vine prunings', '🍇'], ['almond', '🌰'], ['walnut', '🌰'],
    ['alder', '🌳'], ['birch', '🌳'], ['fir', '🌲'], ['hickory', '🌰'], ['juniper', '🌲'], ['oak', '🌳'], ['pecan', '🌰'], ['pine', '🌲'],
    ['pinecone', '🌲'], ['spruce', '🌲'], ['willow', '🌳'],
  ] },
  { id: 'aids', label: 'Yeasts & brewing aids', icon: '🧫', items: [
    ['yeast', '🧫'], ['brettanomyces', '🧫'], ['kefir', '🧫'], ['kefir grain', '🧫'], ['kefir culture', '🧫'], ['scoby', '🧫'], ['kombucha', '🧫'], ['malolactic culture', '🧫'], ['culture', '🧫'], ['yeast nutrient', '🧪'], ['nutrient', '🧪'], ['tannin', '🧪'], ['citric acid', '🧪'], ['malic acid', '🧪'], ['tartaric acid', '🧪'], ['acid', '🧪'], ['cream of tartar', '🧪'], ['campden tablet', '🧪'], ['metabisulphite', '🧪'], ['potassium sorbate', '🧪'], ['pectic enzyme', '🧪'], ['pectin enzyme', '🧪'], ['enzyme', '🧪'], ['isinglass', '🧪'], ['glycerine', '🧪'], ['calcium carbonate', '🧪'], ['calcium chloride', '🧪'], ['chalk', '🧪'], ['salt', '🧂'], ['water', '💧'], ['rainwater', '💧'], ['vinegar', '🧪'], ['whey', '🥛'],
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

const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export {
  ING_TYPES, ING_EMOJI, ING_STAGES, STAGE_LABEL, KIND_LABEL, when, g3, EMPTY_BREW, PROFILE_KEYS, parseSteps, joinSteps, shortSummary,
  BEERISH, NAME_POSITIONS, BORDERS, LABEL_PX, remembered,
  CAT_LOOK, shade, look, WINE_COLOURS, COLOUR_TILE, WINE_CATS, SWEETNESS, ACIDITY, FIZZ, FLAVOUR_TAGS, SWEET_PILL, BASIS_WORD,
  colourOf, sweetOf, strengthOf, bottlesOf, famKey, STATUS_PILL, STATUS_WORD, TRACK,
  escRe, singular, wantedOf, wordRe, ingText, ingredientHits, PRODUCE_GROUPS, PILE_TYPE_COLOUR, NOT_A_PILE, BEER_GLASS, PILES,
  ABBR, ABBR_UNITS, ABBR_RE, abbrMatches, abbrTitle, slug,
};
