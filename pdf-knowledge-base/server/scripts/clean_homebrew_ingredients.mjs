// clean_homebrew_ingredients.mjs - Homebrew ingredient clean-up (22 Oct 2026)
// Cleans brew_main_ingredients.items, brews.ingredients, and brew_ingredient_pictures.
// Dry run by default. Apply with --apply (creates backup JSON first, updates in one transaction).

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { canonicalizeMain, normIngredient } from '../services/homebrewCanonical.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, '..', 'data');
const APPLY = process.argv.includes('--apply');
const REPORT = path.join(DATA, 'ingredient_cleanup_report.txt');

const db = new Database(path.join(DATA, 'app.db'));

// Map of specific recipe-level ingredient changes in brews.ingredients
function cleanRecipeIngredient(item) {
  if (!item || !item.name) return item;
  let name = String(item.name).trim();

  // 0. Camden tablet -> Campden tablet
  if (/^camden\s+tablets?\b/i.test(name)) {
    return { ...item, name: name.replace(/^camden\b/i, 'Campden') };
  }

  // 1. Apricot pulp (1 lb size) -> Apricots (pulp, 1 lb size)
  if (/^apricot pulp\b/i.test(name)) {
    const note = name.replace(/^apricot pulp\s*/i, '').replace(/^\((.*)\)$/, '$1').trim();
    const finalNote = ['pulp', note].filter(Boolean).join(', ');
    return { ...item, name: `Apricots (${finalNote})` };
  }

  // 2. Patent Black Malt / Black Malt -> Black malt
  if (/\b(patent\s+black\s+malt|black\s+malt)\b/i.test(name)) {
    let newName = name.replace(/\bpatent\s+black\s+malt\b/gi, 'Black malt')
                      .replace(/\bblack\s+malt\b/gi, 'Black malt');
    if (/patent/i.test(name) && !/patent/i.test(newName)) {
      if (/\(/.test(newName)) {
        newName = newName.replace(/\(/, '(patent, ');
      } else {
        newName = `${newName} (patent)`;
      }
    }
    return { ...item, name: newName };
  }

  // 3. Apple brandy / Calvados -> Brandy
  if (/^calvados\b/i.test(name)) {
    const note = name.replace(/^calvados\s*/i, '').replace(/^\((.*)\)$/, '$1').trim();
    const finalNote = ['calvados', note].filter(Boolean).join(', ');
    const also = (item.also || []).map((a) => (normIngredient(a) === 'apple brandy' || normIngredient(a) === 'applejack' ? 'Brandy' : a));
    return { ...item, name: `Brandy (${finalNote})`, also: [...new Set(also)] };
  }
  if (/^apple brandy\b/i.test(name)) {
    const note = name.replace(/^apple brandy\s*/i, '').replace(/^\((.*)\)$/, '$1').trim();
    const finalNote = ['apple', note].filter(Boolean).join(', ');
    return { ...item, name: `Brandy (${finalNote})` };
  }

  // 4. Red Grapefruit Zest -> Grapefruit (red, zest)
  if (/^red grapefruit zest\b/i.test(name)) {
    return { ...item, name: 'Grapefruit (red, zest)' };
  }

  // 5. Strawberry jam / syrup -> Strawberries
  if (/^strawberry jam\b/i.test(name)) {
    const note = name.replace(/^strawberry jam\s*/i, '').replace(/^\((.*)\)$/, '$1').trim();
    return { ...item, name: `Strawberries (${['jam', note].filter(Boolean).join(', ')})` };
  }
  if (/^strawberry syrup\b/i.test(name)) {
    const note = name.replace(/^strawberry syrup\s*/i, '').replace(/^\((.*)\)$/, '$1').trim();
    return { ...item, name: `Strawberries (${['syrup', note].filter(Boolean).join(', ')})` };
  }

  // 6. Atomic fireball candies -> Cinnamon (atomic fireball candies)
  if (/^atomic fireball candies\b/i.test(name)) {
    return { ...item, name: 'Cinnamon (atomic fireball candies)' };
  }

  // 7. Pomace -> Apples (pomace)
  if (/^pomace\b/i.test(name)) {
    const note = name.replace(/^pomace\s*/i, '').replace(/^\((.*)\)$/, '$1').trim();
    return { ...item, name: `Apples (${['pomace', note].filter(Boolean).join(', ')})` };
  }

  const sanitizeNote = (s) => (s || '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();

  // 8. Spruce and pine -> Spruce with also: ["Pine"]
  if (/^spruce and pine\b/i.test(name)) {
    const note = sanitizeNote(name.replace(/^spruce and pine\s*/i, ''));
    const also = [...new Set([...(item.also || []), 'Pine'])];
    return { ...item, name: `Spruce (${['and pine', note].filter(Boolean).join(', ')})`, also };
  }

  // 9. Spruce twigs -> Spruce (twigs)
  if (/^spruce twigs\b/i.test(name)) {
    const note = sanitizeNote(name.replace(/^spruce twigs\s*/i, ''));
    return { ...item, name: `Spruce (${['twigs', note].filter(Boolean).join(', ')})` };
  }

  // 10. Pine needles -> Pine (needles)
  if (/^pine needles\b/i.test(name)) {
    const note = sanitizeNote(name.replace(/^pine needles\s*/i, ''));
    return { ...item, name: `Pine (${['needles', note].filter(Boolean).join(', ')})` };
  }

  // 11. Hickory hulls -> Hickory (hulls)
  if (/^hickory hulls\b/i.test(name)) {
    const note = sanitizeNote(name.replace(/^hickory hulls\s*/i, ''));
    return { ...item, name: `Hickory (${['hulls', note].filter(Boolean).join(', ')})` };
  }

  // 12. Rice hulls -> Rice (hulls)
  if (/^rice hulls\b/i.test(name)) {
    const note = sanitizeNote(name.replace(/^rice hulls\s*/i, ''));
    return { ...item, name: `Rice (${['hulls', note].filter(Boolean).join(', ')})` };
  }

  // 13. Blue Spice Basil / Cinnamon Basil -> Basil (variety)
  if (/^blue spice basil\b/i.test(name)) {
    const note = sanitizeNote(name.replace(/^blue spice basil\s*/i, ''));
    return { ...item, name: `Basil (${['Blue Spice', note].filter(Boolean).join(', ')})` };
  }
  if (/^cinnamon basil\b/i.test(name)) {
    const note = sanitizeNote(name.replace(/^cinnamon basil\s*/i, ''));
    return { ...item, name: `Basil (${['Cinnamon', note].filter(Boolean).join(', ')})` };
  }

  // 14. Fix also array if it contains Apple brandy
  if (Array.isArray(item.also)) {
    const updatedAlso = item.also.map((a) => (normIngredient(a) === 'apple brandy' ? 'Brandy' : a));
    if (JSON.stringify(updatedAlso) !== JSON.stringify(item.also)) {
      return { ...item, also: [...new Set(updatedAlso)] };
    }
  }

  // 15. spices and herbs of your choice -> Spices [also: Herbs]
  if (/^spices and herbs of your choice\b/i.test(name)) {
    const note = sanitizeNote(name.replace(/^spices and herbs of your choice\s*/i, ''));
    const also = [...new Set([...(item.also || []), 'Herbs'])];
    return { ...item, name: `Spices (${['and herbs of your choice', note].filter(Boolean).join(', ')})`, also };
  }

  // 16. egg whites... -> Egg whites (...)
  if (/^egg whites?,?\s+beaten\b/i.test(name)) {
    const note = sanitizeNote(name.replace(/^egg whites?,?\s*/i, ''));
    return { ...item, name: `Egg whites (${note})` };
  }

  // 17. foraged herbs, fruits and aromatics... -> Herbs [also: Fruit]
  if (/^foraged herbs, fruits and aromatics\b/i.test(name)) {
    const note = sanitizeNote(name.replace(/^foraged herbs,?\s*/i, ''));
    const also = [...new Set([...(item.also || []), 'Fruit'])];
    return { ...item, name: `Herbs (${['foraged', note].filter(Boolean).join(', ')})`, also };
  }

  // 18. foraged or garden flavourings... -> Herbs
  if (/^foraged or garden flavourings\b/i.test(name)) {
    const note = sanitizeNote(name.replace(/^foraged or garden flavourings\s*/i, ''));
    return { ...item, name: `Herbs (${['foraged or garden flavourings', note].filter(Boolean).join(', ')})` };
  }

  // 19. fruits and flowers for flavour and colour -> Fruit [also: Flowers]
  if (/^fruits and flowers for flavour and colour\b/i.test(name)) {
    const note = sanitizeNote(name.replace(/^fruits and flowers for flavour and colour\s*/i, ''));
    const also = [...new Set([...(item.also || []), 'Flowers'])];
    return { ...item, name: `Fruit (${['and flowers for flavour and colour', note].filter(Boolean).join(', ')})`, also };
  }

  // 20. Berries or fruits -> Berries [also: Fruit]
  if (/^berries or fruits\b/i.test(name)) {
    const note = sanitizeNote(name.replace(/^berries or fruits\s*/i, ''));
    const also = [...new Set([...(item.also || []), 'Fruit'])];
    return { ...item, name: `Berries (${['or fruits', note].filter(Boolean).join(', ')})`, also };
  }

  // 21. Fruits and Berries -> Fruit [also: Berries]
  if (/^fruits and berries\b/i.test(name)) {
    const note = sanitizeNote(name.replace(/^fruits and berries\s*/i, ''));
    const also = [...new Set([...(item.also || []), 'Berries'])];
    return { ...item, name: `Fruit (${['and berries', note].filter(Boolean).join(', ')})`, also };
  }

  // 22. Ale/Beer/Stout -> Beer [also: Ale, Stout]
  if (/^ale\/beer\/stout\b/i.test(name)) {
    const note = sanitizeNote(name.replace(/^ale\/beer\/stout\s*/i, ''));
    const also = [...new Set([...(item.also || []), 'Ale', 'Stout'])];
    return { ...item, name: `Beer (${['ale or stout', note].filter(Boolean).join(', ')})`, also };
  }

  // 23. wine or spices - optional -> Wine [also: Spices]
  if (/^wine or spices\b/i.test(name)) {
    const note = sanitizeNote(name.replace(/^wine or spices\s*/i, ''));
    const also = [...new Set([...(item.also || []), 'Spices'])];
    return { ...item, name: `Wine (${['or spices', note].filter(Boolean).join(', ')})`, also };
  }

  // 24. Helpers/Equipment
  if (/^fresh stoppers and wire hoods\b/i.test(name)) {
    return { ...item, name: 'Stoppers (fresh, and wire hoods)' };
  }
  if (/^plastic champagne corks and wire cages\b/i.test(name)) {
    return { ...item, name: 'Corks (plastic champagne, and wire cages)' };
  }
  if (/^rock salt and crushed ice\b/i.test(name)) {
    return { ...item, name: 'Rock salt (and crushed ice - for the freezing bath)' };
  }
  if (/^smoke - smoke the vessel\b/i.test(name)) {
    return { ...item, name: 'Smoke (smoke the vessel and peppers over a cooking-wood fire)' };
  }
  if (/^pale ale water treatment\b/i.test(name) || /^plaster of Paris/i.test(name)) {
    return { ...item, name: 'Water treatment (plaster of Paris / salts)' };
  }

  return item;
}

// Special split for Brew 953 Cacao & Vanilla line
function expandRecipeIngredients(ings) {
  const out = [];
  for (const it of ings) {
    if (/^cacao & vanilla\b/i.test(it.name || '')) {
      const note = it.name.replace(/^cacao & vanilla\s*/i, '').replace(/^\((.*)\)$/, '$1').trim();
      const finalNote = note.toLowerCase().includes('extract') ? note : ['extract', note].filter(Boolean).join(', ');
      out.push({ ...it, name: `Cocoa (${finalNote})`, unit: `${it.unit || ''} (mixed with vanilla)`.trim() });
      out.push({ ...it, name: `Vanilla (${finalNote})`, unit: `${it.unit || ''} (mixed with cocoa)`.trim() });
    } else {
      out.push(cleanRecipeIngredient(it));
    }
  }
  return out;
}

// Canonical whole-ingredient dictionary for main ingredients
const MAIN_CANONICAL = {
  // Combos & Variants to whole ingredient
  'apricot pulp': 'Apricots',
  'peach pulp': 'Peaches',
  'apple pomace': 'Apples',
  'tart apples': 'Apples',
  'cooking apples': 'Apples',
  'wild apples': 'Apples',
  'windfall apples': 'Apples',
  'cider apples': 'Apples',
  'sour apples': 'Apples',
  'apple brandy': 'Brandy',
  'calvados': 'Brandy',
  'damson plums': 'Damsons',
  'wild plums': 'Plums',
  'golden plums': 'Plums',
  'victoria plums': 'Plums',
  'bing cherries': 'Cherries',
  'white cherries': 'Cherries',
  'cornelian cherries': 'Cherries',
  'sweet cherries': 'Cherries',
  'sour cherries': 'Cherries',
  'golden raspberries': 'Raspberries',
  'orange zest': 'Oranges',
  'lemon zest': 'Lemons',
  'red grapefruit zest': 'Grapefruit',
  'pink grapefruit': 'Grapefruit',
  'navel oranges': 'Oranges',
  'sliced oranges': 'Oranges',
  'key limes': 'Limes',
  'ujukitsu lemons': 'Lemons',
  'concord grapes': 'Grapes',
  'thompson seedless grapes': 'Grapes',
  'dried currants': 'Currants',
  'muscatel raisins': 'Raisins',
  'smyrna raisins': 'Raisins',
  'malaga raisins': 'Raisins',
  'american persimmons': 'Persimmons',
  'perry pears': 'Pears',
  'strawberry guavas': 'Guavas',
  'white mulberries': 'Mulberries',
  'strawberry jam': 'Strawberries',
  'strawberry syrup': 'Strawberries',

  // Spices & herbs
  'cinnamon sticks': 'Cinnamon',
  'cinnamon candies': 'Cinnamon',
  'atomic fireball candies': 'Cinnamon',
  'cocoa husks': 'Cocoa',
  'cocoa powder': 'Cocoa',
  'dark cocoa powder': 'Cocoa',
  'coffee beans': 'Coffee',
  'tea leaves': 'Tea',
  'gentian root': 'Gentian',
  'dandelion root': 'Dandelions',
  'dandelion greens': 'Dandelions',
  'licorice root': 'Licorice',
  'roasted burdock root': 'Burdock',
  'toasted burdock root': 'Burdock',
  'burdock root': 'Burdock',
  'allspice berries': 'Allspice',
  'fresh thyme': 'Thyme',
  'ground coriander': 'Coriander',
  'blue spice basil': 'Basil',
  'cinnamon basil': 'Basil',
  'local wild mint': 'Mint',
  'lemon balm leaves': 'Lemon balm',
  'geranium leaves': 'Geranium',

  // Trees, bark & forage
  'spruce twigs': 'Spruce',
  'pine needles': 'Pine',
  'green pine cones': 'Pine',
  'pinyon pine branches': 'Pinyon pine',
  'pinyon pinecones': 'Pinyon pine',
  'white fir branch': 'White fir',
  'oak leaves': 'Oak',
  'oak cubes': 'Oak',
  'toasted oak chips': 'Oak',
  'toasted oak bark': 'Oak',
  'french oak': 'Oak',
  'walnut leaves': 'Walnuts',
  'hickory leaves': 'Hickory',
  'hickory bark': 'Hickory',
  'hickory hulls': 'Hickory',
  'hickory nuts': 'Hickory',
  'fallen leaves': 'Leaves',
  'alder bark': 'Alder',
  'bitter willow leaves': 'Willow',
  'willow bark': 'Willow',
  'wintergreen leaves': 'Wintergreen',
  'curly dock leaves': 'Curly dock',

  // Flowers
  'hop flowers': 'Hops',
  'heather flower': 'Heather',
  'plum blossoms': 'Plums',
  'may blossom': 'Hawthorn blossom',
  'carnation petals': 'Carnations',
  'purple clover petals': 'Clover flowers',
  'fresh damask roses': 'Rose petals',
  'pink rosebuds': 'Rose petals',
  'lilac flowers': 'Lilac',
  'black locust flowers': 'Black locust',
  'jasmine flowers': 'Jasmine',

  // Grains & sugars
  'patent black malt': 'Black malt',
  'black malt': 'Black malt',
  'biscuit malt': 'Biscuit malt',
  'brown malt': 'Brown malt',
  'chocolate malt': 'Chocolate malt',
  'pale chocolate malt': 'Chocolate malt',
  'dark malt extract': 'Malt extract',
  'toffee malt extract': 'Malt extract',
  'amber malt extract': 'Malt extract',
  'superflavex malt extract': 'Malt extract',
  'flaked corn': 'Corn',
  'heirloom flint corn': 'Corn',
  'flaked maize': 'Maize',
  'flaked oats': 'Oats',
  'flaked barley': 'Barley',
  'pearl barley': 'Barley',
  'popped barley': 'Barley',
  'roasted barley': 'Barley',
  'rye grains': 'Rye',
  'toasted rye bread': 'Rye bread',
  'belgian candi sugar': 'Candi sugar',
  'clear candi sugar': 'Candi sugar',
  'barley sugar': 'Barley sugar',
  'tupelo honey': 'Honey',
  'wildflower honey': 'Honey',
  'english honey': 'Honey',
  'white sugar': 'Sugar',
  'demerara sugar': 'Demerara sugar',
  'dark brown sugar': 'Dark brown sugar',
  'brown sugar': 'Brown sugar',
  'candi sugar': 'Candi sugar',

  // Casing cleanups
  'runner beans': 'Runner beans',
  'sycamore sap': 'Sycamore sap',
  'orange blossom': 'Orange blossom',
  'cherry bomb peppers': 'Cherry Bomb peppers',
  'bobek hops': 'Bobek hops',
  'first gold hops': 'First Gold hops',
  'fuggle hops': 'Fuggle hops',
  'green bullet hops': 'Green Bullet hops',
  'pilgrim hops': 'Pilgrim hops',
  'progress hops': 'Progress hops',
  'summit hops': 'Summit hops',
  'kent fuggles hops': 'Kent Fuggles hops',
  'kent goldings hops': 'Kent Goldings hops',
  'east kent goldings hops': 'East Kent Goldings hops',
  'nelson sauvin hops': 'Nelson Sauvin hops',
  'motueka hops': 'Motueka hops',
  'simcoe hops': 'Simcoe hops',
  'cascade hops': 'Cascade hops',
  'centennial hops': 'Centennial hops',
  'sorachi ace hops': 'Sorachi Ace hops',
  'summer hops': 'Summer hops',
  'hallertauer hops': 'Hallertauer hops',
  'cluster hops': 'Cluster hops',
  'saaz hops': 'Saaz hops',
  'candy cap mushrooms': 'Candy cap mushrooms',
  'matsutake mushrooms': 'Matsutake mushrooms',
  'turkey tail mushrooms': 'Turkey tail mushrooms',
  'california juniper berries': 'Juniper berries',
  'california juniper': 'Juniper berries',
  'wild sassafras': 'Sassafras',
  'sassafras root bark': 'Sassafras',
  'sarsaparilla root': 'Sarsaparilla',
  'apple mint': 'Apple Mint',
  'camden tablet': 'Campden tablet',
  'camden tablets': 'Campden tablet',
  'campden tablet': 'Campden tablet',
  'campden tablets': 'Campden tablet',
};

// Explicit split rules for recipe brew_main_ingredients items with combinations
const COMBO_RECIPE_SPLITS = {
  126: [{ name: 'Citrus', picture: 'fresh citrus fruits' }, { name: 'Hot peppers', picture: 'various red and green hot peppers' }],
  165: [{ name: 'Pumpkin', picture: 'whole pumpkins' }, { name: 'Allspice', picture: 'whole allspice berries' }, { name: 'Cloves', picture: 'whole dried cloves' }],
  166: [{ name: 'Rosemary', picture: 'fresh rosemary' }, { name: 'Sage', picture: 'fresh sage leaves' }, { name: 'Nettles', picture: 'dried nettle leaves' }],
  188: [{ name: 'Sweet potatoes', picture: 'whole sweet potatoes' }, { name: 'Nutmeg', picture: 'a whole nutmeg' }, { name: 'Cinnamon', picture: 'cinnamon stick' }],
  192: [{ name: 'Oak', picture: 'fallen oak leaves' }, { name: 'Burdock', picture: 'toasted burdock root' }, { name: 'Smoked malt', picture: 'smoked malted barley grains' }],
  227: [{ name: 'Yellow Birch', picture: 'yellow birch twigs with peeling bark' }, { name: 'Sassafras', picture: 'sassafras roots' }, { name: 'Spruce', picture: 'spruce needles' }],
  233: [{ name: 'Berries', picture: 'fresh blueberries and wild grapes' }, { name: 'Mugwort', picture: 'dried mugwort and yarrow' }],
  234: [{ name: 'Berries', picture: 'dried mixed berries like currants and blueberries' }],
  255: [{ name: 'Rye bread', picture: 'slices of toasted rye bread' }, { name: 'Sassafras', picture: 'dried sassafras root bark' }, { name: 'Spruce', picture: 'fresh green spruce needles' }],
  256: [{ name: 'Fruit', picture: 'sliced apples and pears' }, { name: 'Berries', picture: 'fresh raspberries and blueberries' }],
  263: [{ name: 'Raspberries', picture: 'raspberries' }, { name: 'Blueberries', picture: 'blueberries' }, { name: 'Pinyon pine', picture: 'pinyon pine branches' }],
  417: [{ name: 'Elderflowers', picture: 'creamy white elderflowers' }, { name: 'Oranges', picture: 'a whole ripe orange' }],
  468: [{ name: 'Blackberries', picture: 'fresh blackberries' }, { name: 'Apples', picture: 'sliced green apples' }],
  489: [{ name: 'Damsons', picture: 'small dark purple damson plums' }, { name: 'Beer', picture: 'a glass of dark beer with foam' }],
  536: [{ name: 'Berries', picture: 'mixed summer berries' }, { name: 'Red grape juice', picture: 'dark red grape juice concentrate' }],
  555: [{ name: 'Pears', picture: 'ripe pears' }, { name: 'Plums', picture: 'ripe plums' }],
  596: [{ name: 'Oak', picture: 'green oak leaves' }],
  781: [{ name: 'Honey', picture: 'golden liquid honey' }, { name: 'Pine', picture: 'green pine cones' }, { name: 'Rose petals', picture: 'pink damask rose blooms' }],
  789: [{ name: 'Rice', picture: 'white rice grains' }, { name: 'Fruit', picture: 'dried fruits' }],
  802: [{ name: 'Dandelions', picture: 'yellow dandelion flowers' }, { name: 'Oranges', picture: 'orange peel' }, { name: 'Lemons', picture: 'lemon peel' }],
  824: [{ name: 'Rosemary', picture: 'fresh rosemary' }, { name: 'Cloves', picture: 'whole cloves' }, { name: 'Ginger', picture: 'fresh ginger root' }],
  953: [{ name: 'Cocoa', picture: 'cacao nibs' }, { name: 'Vanilla', picture: 'a vanilla bean' }, { name: 'Apple juice', picture: 'red and green apples' }],
};

function canonicalizeMainItem(name) {
  if (!name) return '';
  const clean = String(name).trim();
  const norm = normIngredient(clean);
  if (MAIN_CANONICAL[norm]) return MAIN_CANONICAL[norm];
  const canon = canonicalizeMain(clean);
  const normC = normIngredient(canon);
  if (MAIN_CANONICAL[normC]) return MAIN_CANONICAL[normC];
  return canon;
}

// 1. Plan brews.ingredients updates
const brewChanges = [];
const brewRows = db.prepare('SELECT id, name, ingredients FROM brews').all();
for (const b of brewRows) {
  let ings;
  try { ings = JSON.parse(b.ingredients || '[]'); } catch { continue; }
  const after = expandRecipeIngredients(ings);
  if (JSON.stringify(ings) !== JSON.stringify(after)) {
    brewChanges.push({ id: b.id, name: b.name, before: ings, after });
  }
}

// 2. Plan brew_main_ingredients.items updates
const mainChanges = [];
const mainRows = db.prepare('SELECT brew_id, items FROM brew_main_ingredients').all();
for (const r of mainRows) {
  let items;
  try { items = JSON.parse(r.items || '[]'); } catch { continue; }

  let newItems = [];
  if (COMBO_RECIPE_SPLITS[r.brew_id]) {
    newItems = COMBO_RECIPE_SPLITS[r.brew_id];
  } else {
    const seen = new Set();
    for (const it of items) {
      if (!it || !it.name) continue;
      const cleanName = canonicalizeMainItem(it.name);
      const norm = normIngredient(cleanName);
      if (!seen.has(norm)) {
        seen.add(norm);
        newItems.push({ ...it, name: cleanName });
      }
    }
  }
  newItems = newItems.slice(0, 3); // Max 3 items per recipe

  if (JSON.stringify(items) !== JSON.stringify(newItems)) {
    mainChanges.push({ brew_id: r.brew_id, before: items, after: newItems });
  }
}

// 3. Plan brew_ingredient_pictures updates
// Collect all used ingredient names across brews.ingredients and brew_main_ingredients after updates
const usedIngredientNorms = new Set();
for (const b of brewRows) {
  const change = brewChanges.find((c) => c.id === b.id);
  const ings = change ? change.after : (JSON.parse(b.ingredients || '[]'));
  for (const it of ings) {
    if (it && it.name) {
      const clean = canonicalizeMainItem(it.name.replace(/\(.*?\)/g, '').trim());
      if (clean) usedIngredientNorms.add(normIngredient(clean));
    }
    if (Array.isArray(it.also)) {
      for (const a of it.also) {
        const clean = canonicalizeMainItem(a.replace(/\(.*?\)/g, '').trim());
        if (clean) usedIngredientNorms.add(normIngredient(clean));
      }
    }
  }
}
for (const r of mainRows) {
  const change = mainChanges.find((c) => c.brew_id === r.brew_id);
  const items = change ? change.after : (JSON.parse(r.items || '[]'));
  for (const it of items) {
    if (it && it.name) {
      const clean = canonicalizeMainItem(it.name);
      if (clean) usedIngredientNorms.add(normIngredient(clean));
    }
  }
}

const currentPics = db.prepare('SELECT name_norm, name_display, key, updated_at FROM brew_ingredient_pictures').all();
const picMap = new Map(currentPics.map((p) => [p.name_norm, p]));
const picInserts = [];
const picDeletes = [];

// Automatic picture key inheritance:
// For every variant mapped to a canonical whole name:
// If the canonical name does NOT have a picture, but the variant DOES, inherit it!
for (const [normVariant, canonName] of Object.entries(MAIN_CANONICAL)) {
  const canonNorm = normIngredient(canonName);
  if (!picMap.has(canonNorm) && picMap.has(normVariant)) {
    const src = picMap.get(normVariant);
    const display = canonName[0].toUpperCase() + canonName.slice(1);
    picInserts.push({ name_norm: canonNorm, name_display: display, key: src.key, updated_at: Date.now() });
    picMap.set(canonNorm, { name_norm: canonNorm, name_display: display, key: src.key });
    usedIngredientNorms.add(canonNorm);
  }
}

// Find all pictures whose names are no longer used anywhere
for (const p of currentPics) {
  if (!usedIngredientNorms.has(p.name_norm)) {
    picDeletes.push(p);
  }
}

// Summary Report Generation
const reportLines = [];
reportLines.push('=== IMS HOMEBREW INGREDIENT CLEANUP REPORT ===');
reportLines.push(`Date: ${new Date().toISOString()}`);
reportLines.push(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

reportLines.push(`--- 1. BREWS.INGREDIENTS CHANGES (${brewChanges.length} recipes) ---`);
for (const c of brewChanges) {
  reportLines.push(`Brew ${c.id} (${c.name}):`);
  for (let i = 0; i < c.before.length; i++) {
    const b = c.before[i]?.name;
    const a = c.after[i]?.name;
    if (b !== a) reportLines.push(`  - "${b}"  ->  "${a}"`);
  }
}

reportLines.push(`\n--- 2. BREW_MAIN_INGREDIENTS CHANGES (${mainChanges.length} recipes) ---`);
for (const c of mainChanges) {
  const bNames = c.before.map((x) => x.name).join(' + ');
  const aNames = c.after.map((x) => x.name).join(' + ');
  reportLines.push(`Brew ${c.brew_id}: [${bNames}]  ->  [${aNames}]`);
}

reportLines.push(`\n--- 3. BREW_INGREDIENT_PICTURES INSERTS / INHERITED (${picInserts.length} items) ---`);
for (const ins of picInserts) {
  reportLines.push(`  + Inherit picture for "${ins.name_display}" (${ins.name_norm}): key ${ins.key}`);
}

reportLines.push(`\n--- 4. BREW_INGREDIENT_PICTURES DELETIONS (${picDeletes.length} unused items) ---`);
for (const del of picDeletes) {
  reportLines.push(`  - Remove orphaned picture entry for "${del.name_display}" (${del.name_norm}) [key: ${del.key}]`);
}

// Calculate projected counts
const simPics = new Map(currentPics.filter((p) => !picDeletes.some((d) => d.name_norm === p.name_norm)).map((p) => [p.name_norm, p]));
for (const ins of picInserts) simPics.set(ins.name_norm, ins);

const simMap = new Map();
let simRemainingCombos = 0;

for (const r of mainRows) {
  const c = mainChanges.find((x) => x.brew_id === r.brew_id);
  const items = c ? c.after : JSON.parse(r.items || '[]');
  for (const it of items) {
    if (!it?.name) continue;
    const canon = canonicalizeMainItem(it.name);
    const nm = normIngredient(canon);
    if (!nm) continue;
    if (!simMap.has(nm)) simMap.set(nm, { name: canon, norm: nm, count: 0, isMain: true });
    const e = simMap.get(nm);
    e.count++;
    e.isMain = true;
    if (/(&|\band\b|\bor\b|\/)/i.test(canon)) simRemainingCombos++;
  }
}

for (const b of brewRows) {
  const c = brewChanges.find((x) => x.id === b.id);
  const ings = c ? c.after : JSON.parse(b.ingredients || '[]');
  const allIngs = ings.flatMap((i) => [i, ...(Array.isArray(i?.also) ? i.also.map((a) => ({ ...i, name: a })) : [])]);
  for (const i of allIngs) {
    if (!i?.name) continue;
    const clean = String(i.name).replace(/\(.*?\)/g, '').trim();
    if (!clean) continue;
    const canon = canonicalizeMainItem(clean);
    const nm = normIngredient(canon);
    if (!nm) continue;
    if (!simMap.has(nm)) simMap.set(nm, { name: canon, norm: nm, count: 0, isMain: false });
    simMap.get(nm).count++;
  }
}

for (const [nm, p] of simPics) {
  const canon = canonicalizeMainItem(p.name_display || nm);
  const nmC = normIngredient(canon);
  if (!simMap.has(nmC)) simMap.set(nmC, { name: canon, norm: nmC, count: 0, isMain: false });
}

let simCustomCount = 0;
let simMainCount = 0;
for (const ing of simMap.values()) {
  if (simPics.has(ing.norm)) simCustomCount++;
  if (ing.isMain) simMainCount++;
}

console.log(`\n======================================================`);
console.log(`HOMEBREW INGREDIENT CLEANUP: DRY RUN SUMMARY`);
console.log(`======================================================`);
console.log(`1. Recipe lines updated (brews.ingredients):       ${brewChanges.length} recipes`);
console.log(`2. Main ingredient cards (brew_main_ingredients):  ${mainChanges.length} recipes`);
console.log(`3. Picture mappings inherited (surviving names):   ${picInserts.length} items`);
console.log(`4. Unused pictures removed from database:          ${picDeletes.length} items`);
console.log(`------------------------------------------------------`);
console.log(`Total Ingredients: 653 -> ${simMap.size} (-${653 - simMap.size})`);
console.log(`Custom Pictures:   442 -> ${simCustomCount} (-${442 - simCustomCount})`);
console.log(`Main Ingredients:  478 -> ${simMainCount} (-${478 - simMainCount})`);
console.log(`Remaining combos in main ingredients:             ${simRemainingCombos}`);
const remainingCombosAll = [];
for (const [nm, ing] of simMap) {
  if (/(&|\band\b|\bor\b|,|\/)/i.test(ing.name) && !/^(east kent goldings|kent goldings|rock salt and crushed ice)/i.test(ing.name)) {
    remainingCombosAll.push(ing.name);
  }
}
console.log(`Remaining combos in all ingredients:              ${remainingCombosAll.length}`, remainingCombosAll);
console.log(`======================================================`);
console.log(`\nDetailed report written to: ${REPORT}`);

if (!APPLY) {
  console.log(`\n[DRY RUN] No changes were written to the database.`);
  console.log(`Review the proposed changes above. Run with --apply to commit.`);
  process.exit(0);
}

// Apply Mode
const backupFile = path.join(DATA, `ingredient_cleanup_backup_${Date.now()}.json`);
const backupData = {
  timestamp: new Date().toISOString(),
  brewChanges: brewChanges.map((c) => ({ id: c.id, ingredients: c.before })),
  mainChanges: mainChanges.map((c) => ({ brew_id: c.brew_id, items: c.before })),
  picDeletes,
};
fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
console.log(`\nBackup saved to: ${backupFile}`);

const updateBrewStmt = db.prepare('UPDATE brews SET ingredients = ? WHERE id = ?');
const updateMainStmt = db.prepare('UPDATE brew_main_ingredients SET items = ? WHERE brew_id = ?');
const insertPicStmt = db.prepare('INSERT OR REPLACE INTO brew_ingredient_pictures (name_norm, name_display, key, updated_at) VALUES (?, ?, ?, ?)');
const deletePicStmt = db.prepare('DELETE FROM brew_ingredient_pictures WHERE name_norm = ?');

db.transaction(() => {
  for (const c of brewChanges) {
    updateBrewStmt.run(JSON.stringify(c.after), c.id);
  }
  for (const c of mainChanges) {
    updateMainStmt.run(JSON.stringify(c.after), c.brew_id);
  }
  for (const ins of picInserts) {
    insertPicStmt.run(ins.name_norm, ins.name_display, ins.key, ins.updated_at);
  }
  for (const del of picDeletes) {
    deletePicStmt.run(del.name_norm);
  }
})();

console.log(`\n[APPLIED] Successfully updated database in a single transaction.`);
