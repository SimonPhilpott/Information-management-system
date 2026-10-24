// Homebrew: keeps the method in step with the ingredients while a recipe is edited (24 Oct 2026, Simon).
//  - amountChange: when an ingredient's amount or unit changes, the same amount written in the steps ("Dissolve 1.5 kg
//    of honey") changes with it. A match counts only when the ingredient is named right beside it, so "1 kg" of sugar
//    isn't changed for "1 kg" of fruit, nor a "4 L jug" for 4 L of water.
//  - stepFor: a new ingredient that no step mentions gets a suggested step, and where it would go.
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const UNIT_WORDS = [
  ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'], ['g', 'gr', 'gram', 'grams'], ['lb', 'lbs', 'pound', 'pounds'],
  ['oz', 'ounce', 'ounces'], ['l', 'ltr', 'litre', 'litres', 'liter', 'liters'], ['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters'],
  ['gal', 'gallon', 'gallons'], ['pt', 'pint', 'pints'], ['tsp', 'teaspoon', 'teaspoons'], ['tbsp', 'tablespoon', 'tablespoons'],
];
const unitAlt = (unit) => {
  const u = String(unit || '').trim().toLowerCase().replace(/\.$/, '');
  const set = UNIT_WORDS.find((w) => w.includes(u)) || [u, `${u}s`, u.replace(/s$/, '')];
  return [...new Set(set)].filter(Boolean).sort((a, b) => b.length - a.length).map(escRe).join('|');
};

const GENERIC = new Set(['and', 'the', 'of', 'or', 'with', 'fresh', 'dried', 'whole', 'ripe', 'ripest', 'optional', 'chopped', 'sliced', 'grated', 'crushed', 'halved', 'juice', 'white', 'light', 'dark', 'brown', 'organic']);
// the words of an ingredient's name worth looking for in a step, cut down to a stem so "raisins" finds "raisin"
export const nameStems = (name) => String(name || '').replace(/\(.*?\)/g, ' ').toLowerCase().split(/[^a-zà-ÿ]+/)
  .filter((w) => w.length >= 3 && !GENERIC.has(w)).map((w) => (w.length > 5 ? w.slice(0, w.length - 2) : w.replace(/e?s$/, '')));
const mentions = (text, stems) => stems.some((s) => text.toLowerCase().includes(s));

const ONE = String.raw`(\d+([.,]\d+)?|\d*\s*[½¼¾⅓⅔⅛]|\d+/\d+)`;
const GOOD = new RegExp(String.raw`^\s*${ONE}(\s*[–-]\s*${ONE})?\s*$`);
const goodAmount = (a) => GOOD.test(String(a ?? '')); // 1.5, ½, 1 ½, 0.5–1
const amountRe = (g) => {
  const a = String(g.amount).trim();
  const unit = String(g.unit || '').trim();
  const before = '(^|[^\\d.,/½¼¾])';
  if (!unit) return new RegExp(`${before}(${escRe(a)})(?=\\s+[A-Za-zÀ-ÿ])`, 'g');
  return new RegExp(`${before}(${escRe(a)})(\\s*)(${unitAlt(unit)})(?![A-Za-z])`, 'gi');
};

// ingredient i went from `was` to `now` (each { name, amount, unit }); returns the new steps and which ones changed
export function amountChange(steps, ingredients, i, was, now) {
  if (!goodAmount(was?.amount) || !goodAmount(now?.amount)) return null;
  if (String(was.amount).trim() === String(now.amount).trim() && String(was.unit || '') === String(now.unit || '')) return null;
  const stems = nameStems(now.name || was.name);
  const unitChanged = unitAlt(was.unit) !== unitAlt(now.unit);
  const changed = [];
  const out = steps.map((s, k) => {
    let hit = false;
    const withUnit = Boolean(String(was.unit || '').trim());
    const next = s.replace(amountRe(was), (...a) => {
      const [m, pre] = a;
      const [sp, u, at] = withUnit ? [a[3], a[4], a[5]] : [undefined, undefined, a[3]];
      // the ingredient has to be named right beside the amount ("1.5 kg of honey", "honey (1.5 kg)"), so a "4 L jug"
      // in a step that also mentions water isn't changed with the water
      const after = s.slice(at + m.length).toLowerCase();
      const before = s.slice(0, at + pre.length).toLowerCase();
      const named = stems.some((st) => new RegExp(String.raw`^[\s,]*(of\s+)?(the\s+)?([a-zà-ÿ'’]+\s+)?${escRe(st)}`).test(after)
        || new RegExp(String.raw`${escRe(st)}[a-zà-ÿ]*\s*[(,:]?\s*$`).test(before));
      if (!named) return m;
      hit = true;
      return u === undefined ? `${pre}${String(now.amount).trim()}` : `${pre}${String(now.amount).trim()}${sp || ' '}${unitChanged ? String(now.unit).trim() : u}`;
    });
    if (hit) changed.push(k);
    return next;
  });
  return changed.length ? { steps: out, changed } : null;
}

// does any step talk about this ingredient already?
export const inMethod = (steps, g) => { const st = nameStems(g.name); return !st.length || steps.some((s) => mentions(s, st)); };

const lowerName = (n) => { const s = String(n).replace(/\s*\(.*?\)\s*/g, ' ').trim(); return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s; };
// a step for a new ingredient, worded for its kind and when it goes in, and the place it belongs in the method
export function stepFor(steps, g, ingredients = []) {
  const name = lowerName(g.name);
  const q = goodAmount(g.amount) ? `${String(g.amount).trim()}${g.unit ? ` ${String(g.unit).trim()}` : ''} ` : '';
  const what = q ? `${q}${g.unit ? 'of ' : ''}${name}` : `the ${name}`;
  const stage = g.stage || 'primary';
  let text;
  if (stage === 'secondary') text = g.type === 'fruit' ? `Rack onto ${what} and leave it for one to two weeks, tasting as you go.` : `Add ${what} to the secondary and leave it until the flavour is where you want it, tasting every few days.`;
  else if (stage === 'backsweeten') text = `Once it's stabilised, stir in ${what} a little at a time, tasting until it's sweet enough.`;
  else if (stage === 'bottling') text = `At bottling, stir in ${what}.`;
  else if (['honey', 'sugar', 'malt'].includes(g.type)) text = `Dissolve ${what} in some warm water and stir it into the must.`;
  else if (g.type === 'fruit') text = `Add ${what} to the fermenter (in a straining bag if you like) before pitching the yeast.`;
  else if (['acid', 'tannin'].includes(g.type)) text = `Stir ${what} into the must before pitching the yeast.`;
  else text = `Add ${what} to the must and stir well.`;

  // where it goes: before the bottling step for anything going in before bottling; for the start, before the yeast is pitched
  const find = (re) => steps.findIndex((s) => re.test(s));
  const findLast = (re) => { for (let k = steps.length - 1; k >= 0; k--) if (re.test(steps[k])) return k; return -1; };
  let at = steps.length;
  if (stage === 'primary') {
    const pitch = find(/\b(pitch|sprinkle the yeast|add the yeast|stir in the yeast|yeast (is|has been) added)/i);
    const others = ingredients.filter((o) => o !== g && (o.stage || 'primary') === 'primary').map((o) => nameStems(o.name)).filter((st) => st.length);
    let lastOther = -1;
    steps.forEach((s, k) => { if (others.some((st) => mentions(s, st))) lastOther = k; });
    at = pitch >= 0 ? pitch : lastOther >= 0 ? lastOther + 1 : steps.length;
  } else if (stage === 'secondary' || stage === 'backsweeten') {
    const bottle = find(/\bbottl/i);
    at = bottle >= 0 ? bottle : steps.length;
  } else {
    const bottle = findLast(/\bbottl/i);
    at = bottle >= 0 ? bottle : steps.length;
  }
  if (steps.length === 1 && !steps[0].trim()) at = 0;
  return { text, at };
}
