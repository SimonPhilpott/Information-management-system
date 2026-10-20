// Homebrew recipe tags: which family a recipe belongs to (all the "Elderflower wine"s from different books are one
// card with each book's version as an alternative), the label for that version, the wine's colour (red / white /
// rosé - a tag, so a blackberry wine is both Fruit & vegetable and red) and its sweetness (dry / medium / sweet),
// with where the sweetness came from: the book, the target gravity, or an estimate from the sugar and method.

export const WINE_CATS = ['white_wine', 'red_wine', 'rose_wine', 'fruit_veg_wine', 'flower_herb_wine', 'hot_pepper_wine'];
export const COLOUR_OF_CAT = { red_wine: 'red', white_wine: 'white', rose_wine: 'rose' };
export const normSweetness = (s) => {
  const v = String(s || '').toLowerCase().trim();
  if (!v) return null;
  if (/^dry$/.test(v)) return 'dry';
  if (/sweet|dessert/.test(v) && !/semi|medium|off/.test(v)) return 'sweet';
  if (/medium|semi|off-dry/.test(v)) return 'medium';
  return null;
};

// ---- family and version -------------------------------------------------------------------------------------
const SOURCE_SHORT = [
  [/wild winemaking/i, 'Wild Winemaking'], [/500 recipes/i, 'Patten'], [/boots book/i, 'Boots'], [/drink your own garden/i, 'Glover'],
  [/merrydown/i, 'Merrydown'], [/home-made country wines/i, 'Farmers Weekly'], [/wildcrafting/i, 'Wildcrafting Brewer'], [/mead like a viking/i, 'Viking mead'],
  [/brewing local/i, 'Brewing Local'], [/broadford/i, 'Broadford'], [/brewing better beers/i, 'Brewing Better Beers'], [/proulx/i, 'Proulx & Nichols'],
  [/everything hard cider/i, 'Everything Hard Cider'], [/big book of cidermaking/i, 'Big Book of Cidermaking'],
];
export const sourceShort = (s) => (SOURCE_SHORT.find(([re]) => re.test(s || '')) || [null, s ? String(s).replace(/\s*\(.*$/, '').slice(0, 28) : 'Your own'])[1];
// author tags added to names to tell books apart - not part of the drink's name
const AUTHOR = /^(glover|wise|merrydown|beechum|shockey|boots|proulx & nichols|farmers weekly|raffald.*)$/i;
// words for the same thing - so "Red currant" and "Redcurrant" are one family
const SPELL = [[/\bred ?currants?\b/gi, 'Redcurrant'], [/\bblack ?currants?\b/gi, 'Blackcurrant'], [/\bwhite ?currants?\b/gi, 'Whitecurrant'],
  [/\bhawthorn ?berry\b|\bhawthornberry\b/gi, 'Hawthorn berry'], [/\bpea[- ]pod\b/gi, 'Pea pod'], [/\b(dandelion|cowslip) flower\b/gi, '$1']];
const SWEET_WORD = /^(dry|sweet|medium|medium[- ]sweet|medium[- ]dry|semi-?sweet|off-dry)$/i;
const LEAD_WINE = /^(dry|sweet|medium(?:[- ](?:sweet|dry))?|semi-?sweet|spiced|country|quick|simple)\s+/i;
const LEAD_ANY = /^(dry|sweet|medium(?:[- ](?:sweet|dry))?|semi-?sweet)\s+/i;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function splitName(name, category) {
  const wine = WINE_CATS.includes(category);
  let s = String(name || '').trim();
  const quals = [];
  let m = s.match(/^AG#\s*\d+\s+/i); if (m) { quals.push(m[0].trim().toUpperCase()); s = s.slice(m[0].length); }
  let tail = null; m = s.match(/\s+-\s+(.+)$/); if (m) { tail = m[1]; s = s.slice(0, m.index); }
  s = s.replace(/\(([^()]*)\)/g, (_, inner) => {
    for (const part of inner.split(/,\s*/)) {
      const p = part.trim();
      if (!p || AUTHOR.test(p)) continue;
      if (/^\d{1,2}$/.test(p)) quals.push(`No. ${p}`); else quals.push(p);
    }
    return ' ';
  });
  m = s.match(/\bNo\.?\s*(\d+)\b/i); if (m) { quals.push(`No. ${m[1]}`); s = s.replace(m[0], ' '); }
  for (;;) { const lead = s.trim().match(wine ? LEAD_WINE : LEAD_ANY); if (!lead) break; quals.push(lead[1].toLowerCase()); s = s.trim().slice(lead[0].length); }
  for (const [re, to] of SPELL) s = s.replace(re, to);
  s = s.replace(/\s+/g, ' ').trim();
  // only keep the bracketed words that tell versions apart (not synonyms like "(bramble)" or "(squash)")
  const keep = quals.filter((q) => / /.test(q) || /^\d{4}s?$/.test(q) || SWEET_WORD.test(q) || /^No\. |^AG#|^(spiced|country|quick|simple|tinned|dried|fresh|sparkling|fortified|raw|red|rosé|white|\d+ gallons|1834|1808|wild yeast|dry red|dry white|sweet red|perfumed|infused|.*sugar.*|.*spice.*|.*cloves.*)$/i.test(q) || /medium sweet/i.test(q));
  return { family: cap(s), quals: tail ? [...keep, tail] : keep };
}
export const familyKey = (family, category) => `${WINE_CATS.includes(category) ? 'wine' : category}::${family.toLowerCase()}`;
export function variantLabel(name, category, source) {
  const { quals } = splitName(name, category);
  return [sourceShort(source), ...quals.map((q) => q.replace(/^medium sweet$/i, 'medium-sweet').toLowerCase().replace(/^no\. /, 'No. ').replace(/^ag#/, 'AG#'))].join(' · ');
}

// ---- colour -------------------------------------------------------------------------------------------------
const RED = /elderberr|blackberr|bramble(?! tip)|blackcurrant|black currant|damson|\bsloes?\b|bilberr|blueberr|huckleberr|whortleberr|mulberr|black cherr|morello|\bcherr(y|ies)\b|beetroot|\bbeets?\b|red grape|black grape|\bplums?\b|loganberr|dewberr|wineberr|tayberr|boysenberr|pomegranate|aronia|chokeberr|chokecherr|bullace|cornelian|hibiscus|jamaica|blood orange|\bbeet\b|black ?berry|grape and (elder|black|damson|mulberr|logan|plum|sloe)/i;
const ROSE = /\bros[eé]\b(?! ?hip)|rosé|rose petal|rosehip|rose hip|strawberr|raspberr|redcurrant|red currant|rhubarb|cranberr|cloudberr|hawthorn berr|\bhaws?\b|tomato|watermelon|pink grapefruit|prickly pear|cactus|cherry plum|red clover|pink/i;
const WHITE_FIRST = /golden plum|yellow plum|greengage|white currant|whitecurrant|white grape|green grape|gooseberr|elderflower|\bwhite\b/i;
// names that look like a red fruit but aren't: chilli varieties, sugar beet, and the tips, leaves or blossom of a fruit plant
const NOT_FRUIT = /cherry bomb|sugar beet|\b[a-z]+ (tips?|shoots?|leaf|leaves|blossoms?)\b/i;
export function colourOf(name, category, ingredients = []) {
  if (!WINE_CATS.includes(category)) return null;
  const raw = String(name || '');
  const n = raw.replace(new RegExp(NOT_FRUIT.source, 'gi'), ' ');
  if (/\((?:[^)]*\b)?(red|dry red|sweet red)\)/i.test(n)) return 'red';
  if (/\((?:[^)]*)ros[eé]\)/i.test(n) || /\bros[eé]\b wine/i.test(n)) return 'rose';
  if (/^\s*(white|golden|green|yellow)\b/i.test(n) || (WHITE_FIRST.test(n) && !RED.test(n.replace(WHITE_FIRST, '')))) return 'white';
  if (RED.test(n)) return 'red';
  if (ROSE.test(n)) return 'rose';
  if (NOT_FRUIT.test(raw)) return COLOUR_OF_CAT[category] || 'white';
  // name gives nothing away - look at the main fruit (not citrus juice or grape concentrate added for acid and body)
  const main = ingredients.filter((i) => i.type === 'fruit' && !/concentrate|lemons?\b|oranges?\b|limes?\b/i.test(i.name)).slice(0, 2).map((i) => String(i.name).replace(/\(.*?\)/g, '')).join(' ');
  if (RED.test(main)) return 'red';
  if (ROSE.test(main)) return 'rose';
  return COLOUR_OF_CAT[category] || 'white'; // a wine filed under Red / White / Rosé keeps that colour when nothing else says
}

// ---- sweetness ----------------------------------------------------------------------------------------------
const DRINK = '(?:wine|mead|cider|perry|beer|ale|stout|sherry|port|metheglin|melomel|cyser|braggot|finish|one|version|style)';
const SW = '(dry|sweet|medium(?:[- ](?:sweet|dry))?|semi-?sweet|off-dry)';
export function statedSweetness(name, notes) {
  const n = String(name || '').toLowerCase();
  let m = n.match(/\((?:[^)]*?)\b(dry|sweet|medium(?:[- ](?:sweet|dry))?|semi-?sweet)\b[^)]*\)/) || n.match(/^(dry|sweet|medium(?:[- ](?:sweet|dry))?|semi-?sweet)\b/) || n.match(/\b(dry|sweet|semi-?sweet) (?:show |aged |table )?(mead|wine|cider|perry)\b/);
  if (m) return normSweetness(m[1]);
  if (/\b(sack|dessert|port|liqueur|ice cider|cidre de glace)\b/.test(n)) return 'sweet';
  const t = String(notes || '').split('\n\nSource:')[0].toLowerCase();
  m = t.match(new RegExp(`\\b(?:a|an|makes? a|is a|gives a|produces a|for a|it will be|it is|very)\\s+(?:very\\s+|light,?\\s+|pleasant,?\\s+|good,?\\s+|clear,?\\s+|strong,?\\s+)*${SW}[, ]+(?:and\\s+\\w+\\s+)?(?:\\w+\\s+)?${DRINK}\\b`));
  if (m) return normSweetness(m[1]);
  m = t.match(new RegExp(`\\b(?:best|served?|drunk|finish(?:es)?|keep it|left)\\s+${SW}\\b`));
  if (m) return normSweetness(m[1]);
  return null;
}
// fermentable sugar in grams per litre of batch, from the ingredient list
const FRESH = /apple|pear|plum|damson|cherr|peach|apricot|grape|berr|currant|rhubarb|orange|lemon|lime|grapefruit|pineapple|banana|mango|melon|fig|quince|bullace|sloe|greengage|nectarine|rosehip|kiwi|persimmon|pomegranate|tomato|marrow|pumpkin|squash|beet|parsnip|carrot|potato|pea pod|mangold|turnip/;
export function sugarPerLitre(ingredients, litres) {
  let g = 0, known = false;
  for (const i of ingredients || []) {
    const n = String(i.name || '').toLowerCase();
    const a = parseFloat(String(i.amount || '').split(/[–-]/).map(Number).reduce((x, y) => (x + y) / 2));
    if (i.stage === 'bottling' || /priming|for bottling|to sweeten|only if|optional/.test(n) || !a || Number.isNaN(a)) continue;
    const kg = i.unit === 'kg' ? a : i.unit === 'g' ? a / 1000 : null, L = i.unit === 'L' ? a : i.unit === 'ml' ? a / 1000 : null;
    if (/lactose/.test(n)) continue;
    if (i.type === 'sugar' || /\bsugar\b|candy|treacle|golden syrup|molasses|glucose|dextrose/.test(n)) { if (kg) { g += kg * 1000; known = true; } continue; }
    if (i.type === 'honey' || /\bhoney\b/.test(n)) { if (kg) g += kg * 800; else if (L) g += L * 1100; known = true; continue; }
    if (/concentrate/.test(n) && L) { g += L * 900; known = true; continue; }
    if (/malt extract|dried malt/.test(n) && kg) { g += kg * 780; known = true; continue; }
    if (/raisin|sultana|dried (fig|date|apricot|fruit)|\bdates?\b|prune/.test(n) && kg) { g += kg * 650; known = true; continue; }
    if (/juice|cider/.test(n) && L && /apple|grape|pear|sweet cider|orange/.test(n)) { g += L * 105; known = true; continue; }
    if (FRESH.test(n) && kg) known = true;
    if (FRESH.test(n) && kg) g += kg * (/grape|banana|fig|cherr|pear|apple/.test(n) ? 120 : /lemon|lime|rhubarb|tomato|marrow|pumpkin|squash|pea|turnip|mangold|potato/.test(n) ? 15 : /beet|parsnip|carrot/.test(n) ? 40 : 70);
  }
  return known ? g / (litres || 4.5) : null;
}
// gravity points the yeast will likely get through before it stops
function yeastReach(yeast, ingredients) {
  const y = `${yeast || ''} ${(ingredients || []).map((i) => i.name).join(' ')}`.toLowerCase();
  if (/champagne|ec-?1118|k1-?v1116|sack|tokay|high.alcohol|port yeast/.test(y)) return 125;
  if (/baker|bread/.test(y) && !/wine yeast/.test(y)) return 100;
  if (/\bwild\b|spontaneous/.test(y) && !/wine yeast/.test(y)) return 95;
  if (/mead yeast|wine yeast|sherry|burgundy|71b|d47|côte des blancs|cote des blancs|general purpose|all.purpose/.test(y)) return 115;
  return 110;
}
export function sweetnessFor(r) {
  const stated = statedSweetness(r.name, r.notes);
  if (stated) return { sweetness: stated, basis: 'book' };
  // a sweetness already on the recipe counts only if the book gave it (or he did) - not a past estimate
  const own = !r.sweetness_basis || r.sweetness_basis === 'book' ? normSweetness(r.sweetness) : null;
  if (own) return { sweetness: own, basis: 'book' };
  if (/starter|\bbug\b|scoby|culture/i.test(r.name) && r.category === 'soda') return { sweetness: null, basis: null };
  const beer = ['beer', 'stout'].includes(r.category);
  if (r.target_fg) {
    const fg = r.target_fg;
    return { sweetness: beer ? (fg < 1.009 ? 'dry' : fg <= 1.015 ? 'medium' : 'sweet') : (fg < 1.006 ? 'dry' : fg < 1.020 ? 'medium' : 'sweet'), basis: 'gravity' };
  }
  const method = String(r.method || '').toLowerCase();
  const text = `${r.name} ${r.notes || ''}`.toLowerCase();
  // beers with no final gravity: by style - pale, hoppy and lager beers finish dry; dark, strong and malty ones medium
  if (beer) {
    if (/lactose|milk stout|sweet stout|oatmeal|cream stout/.test(text)) return { sweetness: 'sweet', basis: 'estimate' };
    if (/within (a|two|2|three|3) days|bottle (it )?(at once|young|early)|drink (it )?young/.test(`${text} ${method}`)) return { sweetness: 'sweet', basis: 'estimate' };
    const malty = /stout|porter|brown|mild|strong|barley.?wine|old ale|bragg?ot|scotch|wee heavy|dark|bock|honey|maple|molasses|treacle/.test(`${text} ${String(r.style || '').toLowerCase()}`);
    return { sweetness: malty ? 'medium' : 'dry', basis: 'estimate' };
  }
  if (r.category === 'soda') return { sweetness: /full(y)? ferment|fermented (out|dry)|to dryness/.test(text) ? 'dry' : 'sweet', basis: 'estimate' };
  // the method can settle it: stopped early or sweetened before bottling, or fermented right out
  const stopsSweet = /(rack|stop|stabili[sz]e|campden)[^.]{0,60}(s\.?g\.?|gravity)\s*(of\s*)?1\.0[1-4]\d|add (the )?sorbate|back-?sweeten (it|with|to)|sweeten to taste|add sugar to taste|sugar[- ]?candy/.test(method);
  const fermentsOut = /to dryness|ferment(s|ed)? (right |completely )?(out|dry)|until (it is |completely )?dry\b|1\.000 or (below|less)|below 1\.000/.test(method);
  const g = sugarPerLitre(json(r.ingredients), r.batch_litres);
  if (g == null) {
    if (r.category === 'soda' && /starter|\bbug\b/i.test(r.name)) return { sweetness: null, basis: null };
    // no amounts to go on (some old recipes): fermented out = dry, otherwise these old country recipes were medium
    return { sweetness: r.category === 'cider' || fermentsOut ? 'dry' : 'medium', basis: 'estimate' };
  }
  const pts = (r.category === 'cider' && !/juice|cider/.test(String(r.ingredients)) ? g + 105 : g) / 2.65;
  // cut-offs fitted to the recipes whose books say how sweet they are (60% exact; dry/sweet mixed up 15%) - the
  // yeast's reach only shifts the strong ones (champagne yeast eats more, baker's and wild yeasts less)
  const reach = yeastReach(r.yeast, json(r.ingredients)) - 110;
  const left = pts - reach;
  let s = left <= 113 ? 'dry' : left <= 118 ? 'medium' : 'sweet';
  if (stopsSweet && s === 'dry') s = 'medium';
  if (fermentsOut && !stopsSweet) s = 'dry';
  return { sweetness: s, basis: 'estimate' };
}
// ---- taste profile: acidity, fizz and flavours, read from the ingredients (the books don't say) ---------------
const SHARP_FRUIT = /rhubarb|gooseberr|redcurrant|red currant|blackcurrant|black currant|whitecurrant|white currant|\bsloes?\b|damson|crab ?apple|cranberr|lemon|\blimes?\b|grapefruit|morello|sour cherr|cornelian|sumac|sorrel|tamarind|quince|bullace|kumquat|calamondin|key lime|limequat|hibiscus|rose ?hip|chokecherr|aronia|tart cherr|bramble/i;
const SOUR_STYLE = /\bsour\b|kombucha|kefir|lambic|gose|brett|spanish-style|sidra|basque|wild cider|cider vinegar|acetic/i;
const FLAVOURS = [
  ['fruity', /apple|pear|plum|damson|sloe|cherr|peach|apricot|nectarine|grape|raisin|sultana|berr|currant|rhubarb|orange|lemon|lime|grapefruit|pineapple|banana|mango|melon|fig|date|quince|bullace|greengage|persimmon|pomegranate|guava|papaya|kiwi|passion|medlar|haw\b|rose ?hip|tomato|cactus|prickly pear|mandarin|tangerine|kumquat|citrus/i],
  ['floral', /elderflower|dandelion|rose petal|\brose\b|cowslip|primrose|lilac|violet|blossom|honeysuckle|lavender|chamomile|camomile|hibiscus|marigold|calendula|clover|gorse|broom|linden|lime flower|carnation|jasmine|heather|meadowsweet|golden ?rod|coltsfoot|burnet|sunflower|flower|petal|orange blossom/i],
  ['herbal', /\bmint|sage|thyme|rosemary|basil|parsley|balm|nettle|burdock|yarrow|mugwort|tarragon|fennel|dill|oregano|marjoram|lovage|\btea\b|chai|tulsi|bay leaf|herb|beetroot|parsnip|carrot|potato|turnip|mangold|celery|lettuce|spinach|pea pod|broad bean|runner bean|lima bean|mushroom|matsutake|chanterelle|truffle|earth|dandelion root|burdock root|sap\b|birch|oak leaf|walnut leaf|leaves|leaf/i],
  ['pine', /\bhops?\b|hopped|ipa\b|pale ale|bitter\b|spruce|\bpines?\b|pine (needle|cone|tip)|\bfir\b|juniper|cedar|douglas|resin|conifer|gruit/i],
  ['roasted', /coffee|espresso|chocolate|cocoa|cacao|roast|black malt|chocolate malt|crystal malt|caramel|toffee|toasted (?!bread)|\boak (chips?|cubes?|spiral|stave|barrel)|\boaked\b|bourbon|molasses|treacle|black treacle|maple|stout|porter|smoked|bochet|burnt/i],
  ['spicy', /ginger|cinnamon|clove|nutmeg|allspice|mace|cardamom|star anise|anise|chai|pepper|chil+i|chile|jalape|habanero|cayenne|chipotle|vanilla|spice|spiced|metheglin|wassail/i],
];
export function profileOf(r) {
  const ings = json(r.ingredients);
  const names = ings.map((i) => String(i.name || '').replace(/\(.*?\)/g, ''));
  const all = `${r.name} | ${r.style || ''} | ${names.join(' | ')}`;
  const cat = r.category;
  // flavours: what's in it, plus what the kind of drink always brings. Helpers don't count - a few raisins, a lemon
  // or some grape concentrate for body and acid don't make a flower wine fruity, nor root ginger make it herbal.
  const HELPER = /raisin|sultana|lemon|\blimes?\b|orange|grapefruit|citrus|concentrate|juice of|tannin|currants?$/i;
  const tasted = `${r.name} | ${names.filter((n) => !HELPER.test(n)).join(' | ')}`.replace(/root ginger|ginger root|\bpineapple/gi, (m) => (/pine/i.test(m) ? 'ananas' : 'ginger'));
  const flavours = FLAVOURS.filter(([k, re]) => re.test(k === 'fruity' ? tasted.replace(/ananas/g, 'pineapple') : tasted)).map(([k]) => k);
  const add = (k) => { if (!flavours.includes(k)) flavours.push(k); };
  if (['fruit_veg_wine', 'red_wine', 'white_wine', 'rose_wine', 'cider'].includes(cat) && !/vegetable|cereal|grain|sake/i.test(r.style || '')) add('fruity');
  if (cat === 'flower_herb_wine' && /dandelion|elderflower|flower/i.test(r.style || '')) add('floral');
  if (cat === 'flower_herb_wine' && /herb|mint|tea/i.test(r.style || '')) add('herbal');
  if (cat === 'stout') add('roasted');
  if (cat === 'hot_pepper_wine') add('spicy');
  // honey you can taste: meads, braggots and honey beers
  if (cat === 'mead' || ings.some((i) => i.type === 'honey' && parseFloat(i.amount) >= (i.unit === 'g' ? 400 : 0.4))) add('honey');
  // grain and plain vegetable wines - earthy rather than fruity
  if (!['beer', 'stout'].includes(cat) && /wheat|\brye\b|maize|\bcorn\b|\brice\b|barley|grain|malt wine|sake|aubergine|eggplant|swede|sugar beet|marrow|squash|pumpkin/i.test(r.name)) add('herbal');
  if (/prune|\bhips?\b|dried fruit|pyment/i.test(r.name)) add('fruity');
  if (cat === 'soda' && !flavours.length) add('herbal');
  if ((cat === 'beer' || cat === 'stout') && ings.some((i) => i.type === 'hops')) add('pine');
  // acidity: sharp fruit, added acid and citrus, or a deliberately sour style
  let score = 0;
  if (SOUR_STYLE.test(all)) score += 3;
  if (SHARP_FRUIT.test(r.name)) score += 2;
  else if (names.slice(0, 3).some((n) => SHARP_FRUIT.test(n))) score += 1;
  const citrus = ings.filter((i) => /\blemons?\b|\blimes?\b|grapefruit/i.test(i.name)).reduce((s, i) => s + (parseFloat(i.amount) || (/\b(\d+)\s+(lemons?|limes?)/i.exec(i.name)?.[1] | 0) || 1), 0);
  if (citrus >= 2) score += 1;
  if (ings.some((i) => i.type === 'acid' || /citric|tartaric|malic|acid blend|cream of tartar/i.test(i.name))) score += 1;
  if (['beer', 'stout'].includes(cat) && !SOUR_STYLE.test(all)) score = Math.min(score, 0);
  if (cat === 'mead' && !SHARP_FRUIT.test(all) && score < 2) score = Math.min(score, 1);
  const acidity = score >= 3 ? 'tart' : score >= 1 ? 'fresh' : 'soft';
  const c = String(r.carbonation || '').toLowerCase();
  const fizz = /sparkl|petillant|pétillant|fizz|carbonat/.test(c) ? 'sparkling' : c === 'still' ? 'still' : null;
  return { acidity, flavours, fizz };
}

// Likely strength (ABV %) when the recipe gives no starting gravity: the fermentable sugar as gravity points, capped
// at what the yeast can get through (a sweet wine stops when the yeast gives up), at 0.131% ABV per point.
export function estimateAbv(r) {
  const ings = json(r.ingredients);
  const text = `${r.name} ${r.notes || ''}`.toLowerCase();
  if (r.category === 'soda' && /starter|\bbug\b|scoby/i.test(r.name)) return null; // not a drink
  // fortified with spirit to the usual 18% - the sugar sum says nothing about it
  if (/fortified|pommeau/.test(text) || ings.some((i) => /everclear|grain spirit/i.test(i.name))) return 18;
  const g = sugarPerLitre(ings, r.batch_litres);
  // no amounts to go on: what that kind of drink usually comes to (pressed apples on their own make about 6%)
  if (g == null) return /sack|dessert/.test(text) ? 15 : { cider: 6, beer: 5, stout: 5, soda: 1.5 }[r.category] ?? 12;
  const juice = /juice|cider/i.test(ings.map((i) => i.name).join(' '));
  const pts = (r.category === 'cider' && !juice ? g + 105 : g) / 2.65;
  let abv = Math.min(pts, yeastReach(r.yeast, ings) + 10) * 0.131;
  // sodas and ginger beers are bottled after a day or two, long before the sugar is gone
  if (r.category === 'soda' && !/full(y)? ferment|fermented (out|dry)|to dryness/.test(text)) abv = Math.min(abv, 2);
  // fruit infused into finished cider, or old recipes in barrels with no amounts: the drink's usual strength
  if (abv < 0.5) return { cider: 6, beer: 5, stout: 5, soda: 1.5 }[r.category] ?? 12;
  return Math.round(abv * 2) / 2;
}
const json = (v) => { if (Array.isArray(v)) return v; try { return JSON.parse(v || '[]'); } catch { return []; } };

// ---- applying the tags --------------------------------------------------------------------------------------
const FRUIT_STYLE = [[/berr|currant|bramble|rosehip|haw\b|elder/i, 'Berry wine'], [/plum|damson|sloe|bullace|cherr|peach|apricot|nectarine|greengage/i, 'Stone fruit (Peach / Plum / Cherry)'],
  [/apple|pear|quince|crab/i, 'Pome fruit (Apple / Pear)'], [/orange|lemon|lime|grapefruit/i, 'Citrus wine'], [/parsnip|potato|beet|carrot|celery|turnip|mangold|pea pod|marrow/i, 'Vegetable wine (Kale / Tomato)']];
// Tag recipes that have no family yet (all of them the first time; then just new imports). Wines filed under Red
// or White wine move to the ingredient category they belong to - the colour tag now does the job. A family split
// across wine categories is gathered into its most common one.
export function tagRecipes(db, { all = false } = {}) {
  const rows = db.prepare(`SELECT * FROM brews WHERE is_recipe = 1 ${all ? '' : 'AND family IS NULL'}`).all();
  if (!rows.length) return 0;
  const up = db.prepare('UPDATE brews SET family = @family, variant = @variant, colour = @colour, sweetness = @sweetness, sweetness_basis = @basis, category = @category, style = @style WHERE id = @id');
  const touched = new Set();
  db.transaction(() => {
    for (const r of rows) {
      let { category, style } = r;
      if (['red_wine', 'white_wine'].includes(category)) {
        style = (FRUIT_STYLE.find(([re]) => re.test(r.name)) || [null, 'Other fruit & vegetable'])[1];
        category = 'fruit_veg_wine';
      }
      const ings = json(r.ingredients);
      const sw = r.sweetness_basis === 'you' ? { sweetness: r.sweetness, basis: 'you' } : sweetnessFor({ ...r, category });
      const colour = r.colour || colourOf(r.name, r.category === 'red_wine' || r.category === 'white_wine' ? r.category : category, ings);
      const { family } = splitName(r.name, category);
      up.run({ id: r.id, family, variant: variantLabel(r.name, category, r.source_name), colour, sweetness: sw.sweetness, basis: sw.basis, category, style });
      touched.add(familyKey(family, category));
    }
    // each family shown under its most common spelling
    const every = db.prepare('SELECT id, family, category FROM brews WHERE is_recipe = 1 AND family IS NOT NULL').all();
    const spell = {};
    for (const r of every) { const k = familyKey(r.family, r.category); (spell[k] ||= {})[r.family] = (spell[k]?.[r.family] || 0) + 1; }
    const setFam = db.prepare('UPDATE brews SET family = ? WHERE id = ?');
    for (const r of every) { const best = Object.entries(spell[familyKey(r.family, r.category)]).sort((a, b) => b[1] - a[1] || (a[0] > b[0] ? -1 : 1))[0][0]; if (best !== r.family) setFam.run(best, r.id); }
    // one category per wine family
    const all2 = db.prepare('SELECT id, family, category, style FROM brews WHERE is_recipe = 1 AND family IS NOT NULL').all();
    const fams = {};
    for (const r of all2) if (WINE_CATS.includes(r.category)) (fams[`wine::${r.family.toLowerCase()}`] ||= []).push(r);
    const setCat = db.prepare('UPDATE brews SET category = ?, style = ? WHERE id = ?');
    for (const [k, members] of Object.entries(fams)) {
      if (!touched.has(k) || new Set(members.map((m) => m.category)).size < 2) continue;
      const counts = members.reduce((a, m) => ({ ...a, [m.category]: (a[m.category] || 0) + 1 }), {});
      const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      const bestStyle = members.find((m) => m.category === best).style;
      for (const m of members) if (m.category !== best) setCat.run(best, bestStyle, m.id);
    }
  })();
  return rows.length;
}
