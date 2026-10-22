// clean_ingredient_preferences.mjs
// Removes varieties, blends, and preferences from ingredient titles so every ingredient
// is the whole item, moving the preference/variety into the recipe line notes.
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normIngredient } from '../services/homebrewCanonical.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, '..', 'data');
const APPLY = process.argv.includes('--apply');

const db = new Database(path.join(DATA, 'app.db'));

const sanitizeNote = (s) => (s || '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();

// Map recipe ingredient lines
export function cleanRecipeIngredient(item) {
  if (!item || !item.name) return item;
  let name = String(item.name).trim();

  // 1. Honey varieties & blends
  if (/^honey\s+blend\b/i.test(name)) {
    const note = sanitizeNote(name.replace(/^honey\s+blend\s*/i, ''));
    const finalNote = ['blend', note].filter(Boolean).join(', ');
    return { ...item, name: `Honey (${finalNote})` };
  }
  if (/^(clover|heather|medium-amber|orange\s+blossom|tupelo|english|wildflower|blended|raw)\s+honey\b/i.test(name)) {
    const m = name.match(/^(clover|heather|medium-amber|orange\s+blossom|tupelo|english|wildflower|blended|raw)\s+honey\s*/i);
    const variety = m[1];
    const rest = sanitizeNote(name.slice(m[0].length));
    const finalNote = [variety, rest].filter(Boolean).join(', ');
    return { ...item, name: `Honey (${finalNote})` };
  }

  // 2. Apples
  if (/^(cider|cooking|sour|tart|wild|windfall)\s+apples?\b/i.test(name)) {
    const m = name.match(/^(cider|cooking|sour|tart|wild|windfall)\s+apples?\s*/i);
    const variety = m[1];
    const rest = sanitizeNote(name.slice(m[0].length));
    return { ...item, name: `Apples (${[variety, rest].filter(Boolean).join(', ')})` };
  }

  // 3. Cherries
  if (/^(bing|black|cornelian|morello|sour|sweet|white)\s+cherries\b/i.test(name)) {
    const m = name.match(/^(bing|black|cornelian|morello|sour|sweet|white)\s+cherries\s*/i);
    const variety = m[1];
    const rest = sanitizeNote(name.slice(m[0].length));
    return { ...item, name: `Cherries (${[variety, rest].filter(Boolean).join(', ')})` };
  }

  // 4. Grapes
  if (/^(black|concord|cypriot|green|red|thompson\s+seedless|white)\s+grapes\b/i.test(name)) {
    const m = name.match(/^(black|concord|cypriot|green|red|thompson\s+seedless|white)\s+grapes\s*/i);
    const variety = m[1];
    const rest = sanitizeNote(name.slice(m[0].length));
    return { ...item, name: `Grapes (${[variety, rest].filter(Boolean).join(', ')})` };
  }

  // 5. Oranges
  if (/^(blood|calamondin|mandarin|navel|seville)\s+oranges?\b/i.test(name)) {
    const m = name.match(/^(blood|calamondin|mandarin|navel|seville)\s+oranges?\s*/i);
    const variety = m[1];
    const rest = sanitizeNote(name.slice(m[0].length));
    return { ...item, name: `Oranges (${[variety, rest].filter(Boolean).join(', ')})` };
  }

  // 6. Plums
  if (/^(cherry|golden|victoria|wild)\s+plums?\b/i.test(name)) {
    const m = name.match(/^(cherry|golden|victoria|wild)\s+plums?\s*/i);
    const variety = m[1];
    const rest = sanitizeNote(name.slice(m[0].length));
    return { ...item, name: `Plums (${[variety, rest].filter(Boolean).join(', ')})` };
  }

  // 7. Raisins
  if (/^(golden|malaga|muscatel|smyrna)\s+raisins\b/i.test(name)) {
    const m = name.match(/^(golden|malaga|muscatel|smyrna)\s+raisins\s*/i);
    const variety = m[1];
    const rest = sanitizeNote(name.slice(m[0].length));
    return { ...item, name: `Raisins (${[variety, rest].filter(Boolean).join(', ')})` };
  }

  // 8. Raspberries
  if (/^golden\s+raspberries\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^golden\s+raspberries\s*/i, ''));
    return { ...item, name: `Raspberries (${['golden', rest].filter(Boolean).join(', ')})` };
  }

  // 9. Grapefruit
  if (/^pink\s+grapefruit\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^pink\s+grapefruit\s*/i, ''));
    return { ...item, name: `Grapefruit (${['pink', rest].filter(Boolean).join(', ')})` };
  }

  // 10. Limes & Lemons
  if (/^key\s+limes\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^key\s+limes\s*/i, ''));
    return { ...item, name: `Limes (${['key', rest].filter(Boolean).join(', ')})` };
  }
  if (/^ujukitsu\s+lemons\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^ujukitsu\s+lemons\s*/i, ''));
    return { ...item, name: `Lemons (${['ujukitsu', rest].filter(Boolean).join(', ')})` };
  }
  if (/^(local\s+wild|wild|bush)\s+berr(y|ies)\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^(local\s+wild|wild|bush)\s+berr(y|ies)\s*/i, ''));
    return { ...item, name: rest ? `Mixed berries (${rest})` : 'Mixed berries' };
  }
  if (/^berries\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^berries\s*/i, ''));
    return { ...item, name: rest ? `Mixed berries (${rest})` : 'Mixed berries' };
  }

  // 11. Currants & Dates
  if (/^dried\s+currants\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^dried\s+currants\s*/i, ''));
    return { ...item, name: `Currants (${['dried', rest].filter(Boolean).join(', ')})` };
  }
  if (/^dried\s+dates\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^dried\s+dates\s*/i, ''));
    return { ...item, name: `Dates (${['dried', rest].filter(Boolean).join(', ')})` };
  }

  // 12. Mulberries & Persimmons
  if (/^white\s+mulberries\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^white\s+mulberries\s*/i, ''));
    return { ...item, name: `Mulberries (${['white', rest].filter(Boolean).join(', ')})` };
  }
  if (/^(american|wild)\s+persimmons?\b/i.test(name)) {
    const m = name.match(/^(american|wild)\s+persimmons?\s*/i);
    const rest = sanitizeNote(name.slice(m[0].length));
    return { ...item, name: rest ? `Persimmons (${[m[1], rest].filter(Boolean).join(', ')})` : 'Persimmons' };
  }

  // 13. Guavas
  if (/^(lemon|strawberry)\s+guavas\b/i.test(name)) {
    const m = name.match(/^(lemon|strawberry)\s+guavas\s*/i);
    const rest = sanitizeNote(name.slice(m[0].length));
    return { ...item, name: `Guavas (${[m[1], rest].filter(Boolean).join(', ')})` };
  }

  // 14. Barley
  if (/^(black|flaked|malted|pearl|popped|roasted)\s+barley\b/i.test(name)) {
    const m = name.match(/^(black|flaked|malted|pearl|popped|roasted)\s+barley\s*/i);
    const rest = sanitizeNote(name.slice(m[0].length));
    return { ...item, name: `Barley (${[m[1], rest].filter(Boolean).join(', ')})` };
  }

  // 15. Oats, Maize & Corn
  if (/^flaked\s+oats\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^flaked\s+oats\s*/i, ''));
    return { ...item, name: `Oats (${['flaked', rest].filter(Boolean).join(', ')})` };
  }
  if (/^flaked\s+maize\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^flaked\s+maize\s*/i, ''));
    return { ...item, name: `Maize (${['flaked', rest].filter(Boolean).join(', ')})` };
  }
  if (/^heirloom\s+flint\s+corn\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^heirloom\s+flint\s+corn\s*/i, ''));
    return { ...item, name: `Corn (${['heirloom flint', rest].filter(Boolean).join(', ')})` };
  }

  // 16. Wheat
  if (/^(crushed|malted|midnight)\s+wheat\b/i.test(name)) {
    const m = name.match(/^(crushed|malted|midnight)\s+wheat\s*/i);
    const rest = sanitizeNote(name.slice(m[0].length));
    return { ...item, name: `Wheat (${[m[1], rest].filter(Boolean).join(', ')})` };
  }

  // 17. Malt Extract
  if (/^(amber|dark|superflavex)\s+malt\s+extract\b/i.test(name)) {
    const m = name.match(/^(amber|dark|superflavex)\s+malt\s+extract\s*/i);
    const rest = sanitizeNote(name.slice(m[0].length));
    return { ...item, name: `Malt extract (${[m[1], rest].filter(Boolean).join(', ')})` };
  }

  // 18. Sugar
  if (/^(clear|belgian)\s+candi\s+sugar\b/i.test(name)) {
    const m = name.match(/^(clear|belgian)\s+candi\s+sugar\s*/i);
    const rest = sanitizeNote(name.slice(m[0].length));
    return { ...item, name: `Candi sugar (${[m[1], rest].filter(Boolean).join(', ')})` };
  }
  if (/^(granulated|brewing)\s+sugar\b/i.test(name)) {
    const m = name.match(/^(granulated|brewing)\s+sugar\s*/i);
    const rest = sanitizeNote(name.slice(m[0].length));
    return { ...item, name: `Sugar (${[m[1], rest].filter(Boolean).join(', ')})` };
  }

  // 19. Herbs & Blends
  if (/^(aromatic|bouquet|forest|mixed|spiced)\s+herbs\b/i.test(name)) {
    const m = name.match(/^(aromatic|bouquet|forest|mixed|spiced)\s+herbs\s*/i);
    const rest = sanitizeNote(name.slice(m[0].length));
    return { ...item, name: `Herbs (${[m[1], rest].filter(Boolean).join(', ')})` };
  }
  if (/^(lactation|mother\'?s\s+milk)\s+herbs\b/i.test(name)) {
    const m = name.match(/^(lactation|mother\'?s\s+milk)\s+herbs\s*/i);
    const rest = sanitizeNote(name.slice(m[0].length));
    return { ...item, name: `Herbs (${[m[1], rest].filter(Boolean).join(', ')})` };
  }
  if (/^dried\s+herbal\s+blend\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^dried\s+herbal\s+blend\s*/i, ''));
    return { ...item, name: `Herbs (${['dried herbal blend', rest].filter(Boolean).join(', ')})` };
  }

  // Gorse -> Gorse flowers
  if (/^gorse\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^gorse(\s+(flowers?|blossoms?))?\s*/i, ''));
    return { ...item, name: rest ? `Gorse flowers (${rest})` : 'Gorse flowers' };
  }

  // Brewmore / Brumore flour -> Brewers flour
  if (/^(brewmore|brumore)\s+(?:brewing\s+)?flour\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^(brewmore|brumore)\s+(?:brewing\s+)?flour\s*/i, ''));
    return { ...item, name: rest ? `Brewers flour (${rest})` : 'Brewers flour' };
  }

  // Fallen leaves
  if (/^(mixed\s+)?fallen\s+leaves\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^(mixed\s+)?fallen\s+leaves\s*/i, ''));
    return { ...item, name: rest ? `Fallen leaves (${rest})` : 'Fallen leaves' };
  }

  // Dried mixed fruit / Mixed dried fruit / Dried Forest Berries -> Dried mixed fruit
  if (/^(mixed\s+dried|dried\s+mixed)\s+fruit\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^(mixed\s+dried|dried\s+mixed)\s+fruit\s*/i, ''));
    return { ...item, name: rest ? `Dried mixed fruit (${rest})` : 'Dried mixed fruit' };
  }
  if (/^dried\s+forest\s+berr(y|ies)\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^dried\s+forest\s+berr(y|ies)\s*/i, ''));
    return { ...item, name: rest ? `Dried mixed fruit (${rest})` : 'Dried mixed fruit' };
  }

  // White grape juice / concentrate / grape juice
  if (/(?<!\bred\s+)\b(?:white\s+)?grape\s+(?:juice\s+concentrate|concentrate|juice)\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/(?<!\bred\s+)\b(?:white\s+)?grape\s+(?:juice\s+concentrate|concentrate|juice)\s*/i, ''));
    return { ...item, name: rest ? `White grape juice (${rest})` : 'White grape juice' };
  }

  // Forest grass (Hierochloe odorata)
  if (/^grass\s*\(\s*forest\s*\)$/i.test(name) || /^forest\s+grass\b/i.test(name)) {
    return { ...item, name: 'Forest grass (Hierochloe odorata)' };
  }

  // Acid / Acid (to taste) -> Citric acid
  if (/^acid\s*\(\s*to\s+taste\s*\)$/i.test(name)) {
    return { ...item, name: 'Citric acid (to taste)' };
  }
  if (/^acid(\s*\([^)]*\))?$/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^acid\s*/i, ''));
    return { ...item, name: rest ? `Citric acid (${rest})` : 'Citric acid' };
  }

  // Raspberry leaf
  if (/^raspberries\s*\(\s*leaves/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^raspberries\s*\(\s*leaves,?\s*/i, ''));
    return { ...item, name: rest ? `Raspberry leaf (${rest})` : 'Raspberry leaf' };
  }
  if (/^raspberry\s+leaves?\b/i.test(name)) {
    const rest = sanitizeNote(name.replace(/^raspberry\s+leaves?\s*/i, ''));
    return { ...item, name: rest ? `Raspberry leaf (${rest})` : 'Raspberry leaf' };
  }

  // 20. Spices
  if (/^(chai|metheglin)\s+spices\b/i.test(name)) {
    const m = name.match(/^(chai|metheglin)\s+spices\s*/i);
    const rest = sanitizeNote(name.slice(m[0].length));
    return { ...item, name: `Spices (${[m[1], rest].filter(Boolean).join(', ')})` };
  }

  // Equipment & Process Supplies (not ingredients)
  if (/^kettle\s+coagulant\b/i.test(name)) {
    return null;
  }

  // 21. Oddities / helpers
  if (/^-\s*if\s+liked$/i.test(name)) {
    return { ...item, name: 'Cloves (if liked)' };
  }
  if (/^acid\s+to\s+taste$/i.test(name)) {
    return { ...item, name: 'Acid (to taste)' };
  }
  if (/^water\s+treatment\s+(as\s+appropriate|as\s+needed)$/i.test(name)) {
    return { ...item, name: 'Water treatment (as needed)' };
  }
  if (/^mild\s+ale\s+water\s+treatment$/i.test(name)) {
    return { ...item, name: 'Water treatment (mild ale)' };
  }
  if (/^pectin\s+enzyme$/i.test(name)) {
    return { ...item, name: 'Pectic enzyme' };
  }
  if (/^white-wine\s+vinegar$/i.test(name)) {
    return { ...item, name: 'Vinegar (white wine)' };
  }
  if (/^mangold\s+wurzels?$/i.test(name)) {
    return { ...item, name: 'Mangelwurzel' };
  }
  if (/^unripe\s+pinecones$/i.test(name)) {
    return { ...item, name: 'Pine (unripe cones)' };
  }
  if (/^pink\s+rosebuds$/i.test(name)) {
    return { ...item, name: 'Rose petals (buds)' };
  }
  if (/^damask\s+roses$/i.test(name)) {
    return { ...item, name: 'Rose petals (Damask)' };
  }
  if (/^birch\s+sap$/i.test(name)) {
    return { ...item, name: 'Birch (sap)' };
  }
  if (/^walnut\s+sap$/i.test(name)) {
    return { ...item, name: 'Walnuts (sap)' };
  }
  if (/^sassafras\s+root\s+bark$/i.test(name)) {
    return { ...item, name: 'Sassafras (root bark)' };
  }
  if (/^bitter\s+willow\s+leaves$/i.test(name)) {
    return { ...item, name: 'Willow (bitter leaves)' };
  }
  if (/^curly\s+dock\s+leaves$/i.test(name)) {
    return { ...item, name: 'Curly dock (leaves)' };
  }
  if (/^wintergreen\s+leaves$/i.test(name)) {
    return { ...item, name: 'Wintergreen (leaves)' };
  }

  return item;
}

// Map for main ingredients (must always be clean single whole ingredient)
export const MAIN_CANONICAL = {
  // Honey
  'clover honey': 'Honey',
  'heather honey': 'Honey',
  'medium amber honey': 'Honey',
  'orange blossom honey': 'Honey',
  'tupelo honey': 'Honey',
  'english honey': 'Honey',
  'wildflower honey': 'Honey',
  'honey blend': 'Honey',

  // Apples
  'cider apples': 'Apples',
  'cooking apples': 'Apples',
  'sour apples': 'Apples',
  'tart apples': 'Apples',
  'wild apples': 'Apples',
  'windfall apples': 'Apples',

  // Cherries
  'bing cherries': 'Cherries',
  'black cherries': 'Cherries',
  'cornelian cherries': 'Cherries',
  'morello cherries': 'Cherries',
  'sour cherries': 'Cherries',
  'sweet cherries': 'Cherries',
  'white cherries': 'Cherries',

  // Grapes
  'black grapes': 'Grapes',
  'concord grapes': 'Grapes',
  'cypriot grapes': 'Grapes',
  'green grapes': 'Grapes',
  'red grapes': 'Grapes',
  'thompson seedless grapes': 'Grapes',
  'white grapes': 'Grapes',

  // Oranges
  'blood oranges': 'Oranges',
  'calamondin oranges': 'Oranges',
  'mandarin oranges': 'Oranges',
  'navel oranges': 'Oranges',
  'seville oranges': 'Oranges',

  // Plums
  'cherry plums': 'Plums',
  'damson plums': 'Damsons',
  'golden plums': 'Plums',
  'victoria plums': 'Plums',
  'wild plums': 'Plums',

  // Raisins
  'golden raisins': 'Raisins',
  'malaga raisins': 'Raisins',
  'muscatel raisins': 'Raisins',
  'smyrna raisins': 'Raisins',

  // Raspberries
  'golden raspberries': 'Raspberries',

  // Grapefruit
  'pink grapefruit': 'Grapefruit',

  // Limes & Lemons
  'key limes': 'Limes',
  'ujukitsu lemons': 'Lemons',

  // Berries
  'wild berries': 'Mixed berries',
  'wild berry': 'Mixed berries',

  // Currants & Dates
  'dried currants': 'Currants',
  'dried dates': 'Dates',

  // Mulberries & Persimmons
  'white mulberries': 'Mulberries',
  'american persimmons': 'Persimmons',

  // Guavas
  'lemon guavas': 'Guavas',
  'strawberry guavas': 'Guavas',

  // Barley
  'black barley': 'Barley',
  'flaked barley': 'Barley',
  'malted barley': 'Barley',
  'pearl barley': 'Barley',
  'popped barley': 'Barley',
  'roasted barley': 'Barley',

  // Oats, Maize, Corn
  'flaked oats': 'Oats',
  'flaked maize': 'Maize',
  'heirloom flint corn': 'Corn',

  // Wheat
  'crushed wheat': 'Wheat',
  'malted wheat': 'Wheat',
  'midnight wheat': 'Wheat',

  // Malt Extract
  'amber malt extract': 'Malt extract',
  'dark malt extract': 'Malt extract',
  'superflavex malt extract': 'Malt extract',

  // Sugar
  'clear candi sugar': 'Candi sugar',
  'belgian candi sugar': 'Candi sugar',
  'granulated sugar': 'Sugar',
  'brewing sugar': 'Sugar',

  // Herbs & Blends
  'aromatic herbs': 'Herbs',
  'bouquet herbs': 'Herbs',
  'forest herbs': 'Herbs',
  'mixed herbs': 'Herbs',
  'spiced herbs': 'Herbs',
  'lactation herbs': 'Herbs',
  "mother's milk herbs": 'Herbs',
  'mothers milk herbs': 'Herbs',
  'dried herbal blend': 'Herbs',

  // Spices
  'chai spices': 'Spices',
  'metheglin spices': 'Spices',

  // Miscellaneous
  'if liked': 'Cloves',
  'acid to taste': 'Acid',
  'water treatment as appropriate': 'Water treatment',
  'water treatment as needed': 'Water treatment',
  'mild ale water treatment': 'Water treatment',
  'pectin enzyme': 'Pectic enzyme',
  'white wine vinegar': 'Vinegar',
  'mangold wurzels': 'Mangelwurzel',
  'mangold wurzel': 'Mangelwurzel',
  'unripe pinecones': 'Pine',
  'pink rosebuds': 'Rose petals',
  'damask roses': 'Rose petals',
  'birch sap': 'Birch',
  'walnut sap': 'Walnuts',
  'sassafras root bark': 'Sassafras',
  'bitter willow leaves': 'Willow',
  'curly dock leaves': 'Curly dock',
  'wintergreen leaves': 'Wintergreen',
  'alder bark': 'Alder',
  'willow bark': 'Willow',
  'hop flowers': 'Hops',
  'heather flower': 'Heather',
  'lilac flowers': 'Lilac',
  'black locust flowers': 'Black locust',
  'mixed flower petals': 'Flower petals',
  'mixed fallen leaves': 'Fallen leaves',
  'fallen leaves': 'Fallen leaves',
  'fallen leaves (cottonwood, alder, willow': 'Fallen leaves',
  'fallen leaves (cottonwood, alder, willow)': 'Fallen leaves',
  'white fir branch': 'White fir',
  'gorse': 'Gorse flowers',
  'gorse flower': 'Gorse flowers',
  'gorse flowers': 'Gorse flowers',
  'brumore flour': 'Brewers flour',
  'brumore brewing flour': 'Brewers flour',
  'brewmore flour': 'Brewers flour',
  'brewmore brewing flour': 'Brewers flour',
  'brewing flour': 'Brewers flour',
  'mixed dried fruit': 'Dried mixed fruit',
  'dried mixed fruit': 'Dried mixed fruit',
  'dried forest berries': 'Dried mixed fruit',
  'dried forest berry': 'Dried mixed fruit',
  'white grape juice concentrate': 'White grape juice',
  'white grape concentrate': 'White grape juice',
  'grape juice': 'White grape juice',
  'grape juice concentrate': 'White grape juice',
  'grape concentrate': 'White grape juice',
  'forest grass': 'Forest grass (Hierochloe odorata)',
  'forest grass (hierochloe odorata)': 'Forest grass (Hierochloe odorata)',
  'grass (forest)': 'Forest grass (Hierochloe odorata)',
  'hierochloe odorata': 'Forest grass (Hierochloe odorata)',
  'berries': 'Mixed berries',
  'berry': 'Mixed berries',
  'bush berries': 'Mixed berries',
  'bush berry': 'Mixed berries',
  'local wild berries': 'Mixed berries',
  'local wild berry': 'Mixed berries',
  'wild berries': 'Mixed berries',
  'wild berry': 'Mixed berries',
  'wild persimmon': 'Persimmons',
  'wild persimmons': 'Persimmons',
  'persimmon': 'Persimmons',
  'persimmons': 'Persimmons',
  'acid': 'Citric acid',
  'citric acid': 'Citric acid',
  'raspberry leaf': 'Raspberry leaf',
  'raspberry leaves': 'Raspberry leaf',
  'dried raspberry leaf': 'Raspberry leaf',
  'dried raspberry leaves': 'Raspberry leaf',
};

// 1. Plan brews.ingredients updates
const brewChanges = [];
const brewRows = db.prepare('SELECT id, name, ingredients FROM brews').all();
for (const b of brewRows) {
  let ings;
  try { ings = JSON.parse(b.ingredients || '[]'); } catch { continue; }
  const after = ings.map(cleanRecipeIngredient).filter(Boolean);
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

  const seen = new Set();
  const newItems = [];
  for (const it of items) {
    if (!it || !it.name) continue;
    if (/^(?:lemon\s*(&|and)\s*orange|orange\s*(&|and)\s*lemon)$/i.test(it.name.trim())) {
      for (const splitName of ['Lemons', 'Oranges']) {
        const cleanNorm = normIngredient(splitName);
        if (!seen.has(cleanNorm)) {
          seen.add(cleanNorm);
          newItems.push({ name: splitName, picture: splitName === 'Lemons' ? 'a fresh yellow lemon' : 'a fresh orange' });
        }
      }
      continue;
    }
    if (/nettles?,\s*clover\s*(&|and)\s*raspberry\s*leaf/i.test(it.name.trim())) {
      for (const split of [
        { name: 'Nettles', picture: 'dried green nettle leaves' },
        { name: 'Clover flowers', picture: 'dried red clover flowers' },
        { name: 'Raspberry leaf', picture: 'dried raspberry leaves' }
      ]) {
        const cleanNorm = normIngredient(split.name);
        if (!seen.has(cleanNorm)) {
          seen.add(cleanNorm);
          newItems.push({ name: split.name, picture: split.picture });
        }
      }
      continue;
    }
    const norm = normIngredient(it.name);
    const cleanName = MAIN_CANONICAL[norm] || it.name;
    const cleanNorm = normIngredient(cleanName);
    if (!seen.has(cleanNorm)) {
      seen.add(cleanNorm);
      newItems.push({ ...it, name: cleanName });
    }
  }

  if (JSON.stringify(items) !== JSON.stringify(newItems)) {
    mainChanges.push({ brew_id: r.brew_id, before: items, after: newItems });
  }
}

// 3. Plan brew_ingredient_pictures updates
const currentPics = db.prepare('SELECT name_norm, name_display, key, updated_at FROM brew_ingredient_pictures').all();
const picMap = new Map(currentPics.map((p) => [p.name_norm, p]));
const picInserts = [];
const picDeletes = [];

for (const [normVariant, canonName] of Object.entries(MAIN_CANONICAL)) {
  const canonNorm = normIngredient(canonName);
  if (!picMap.has(canonNorm) && picMap.has(normVariant)) {
    const src = picMap.get(normVariant);
    const display = canonName[0].toUpperCase() + canonName.slice(1);
    picInserts.push({ name_norm: canonNorm, name_display: display, key: src.key, updated_at: Date.now() });
    picMap.set(canonNorm, { name_norm: canonNorm, name_display: display, key: src.key });
  }
  if (picMap.has(normVariant) && normVariant !== canonNorm) {
    picDeletes.push(picMap.get(normVariant));
  }
}

console.log('=== INGREDIENT PREFERENCES CLEANUP ===');
console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
console.log(`1. Recipe lines to update (brews.ingredients):      ${brewChanges.length} recipes`);
console.log(`2. Main ingredient cards to update (brew_main):     ${mainChanges.length} recipes`);
console.log(`3. Pictures inherited to whole ingredients:         ${picInserts.length} items`);
console.log(`4. Specific variety pictures removed:               ${picDeletes.length} items`);

if (!APPLY) {
  console.log('\nSample recipe changes:');
  for (const c of brewChanges.slice(0, 10)) {
    console.log(`Brew ${c.id} (${c.name}):`);
    for (let i = 0; i < c.before.length; i++) {
      if (c.before[i]?.name !== c.after[i]?.name) {
        console.log(`  - "${c.before[i]?.name}" -> "${c.after[i]?.name}"`);
      }
    }
  }
  console.log('\nSample main changes:');
  for (const c of mainChanges.slice(0, 10)) {
    console.log(`Brew ${c.brew_id}: ${c.before.map((x) => x.name).join(', ')} -> ${c.after.map((x) => x.name).join(', ')}`);
  }
  console.log('\nRun with --apply to commit to database.');
  process.exit(0);
}

// APPLY MODE
const backupFile = path.join(DATA, `ingredient_pref_backup_${Date.now()}.json`);
fs.writeFileSync(backupFile, JSON.stringify({ brewChanges, mainChanges, picDeletes }, null, 2));
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

console.log(`\n[APPLIED] Successfully cleaned up ingredient preferences in database.`);
