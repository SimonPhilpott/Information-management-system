// homebrewCanonical.js - Canonical dictionary & normalisation for homebrew ingredients
// Merges synonyms, word-order inversions (e.g. "Root ginger" / "Ginger root" -> "Ginger"),
// compounding ("Black currants" -> "Blackcurrants"), and grammatical plurals/cases.

const EXACT_CANONICAL = {
  // Ginger
  'ginger': 'Ginger',
  'ginger root': 'Ginger',
  'root ginger': 'Ginger',
  'gingerroot': 'Ginger',
  'fresh ginger': 'Ginger',
  'whole ginger': 'Ginger',
  'bruised ginger': 'Ginger',
  'ground ginger': 'Ginger',
  'powdered ginger': 'Ginger',
  'lump ginger': 'Ginger',
  'ginger pieces': 'Ginger',
  'piece of ginger': 'Ginger',
  'root ginger bruised': 'Ginger',
  'ginger bruised': 'Ginger',

  // Currants
  'black currants': 'Blackcurrants',
  'black currant': 'Blackcurrants',
  'blackcurrant': 'Blackcurrants',
  'blackcurrants': 'Blackcurrants',
  'red currants': 'Redcurrants',
  'red currant': 'Redcurrants',
  'redcurrant': 'Redcurrants',
  'redcurrants': 'Redcurrants',
  'white currant': 'White currants',
  'white currants': 'White currants',

  // Rose
  'rose hips': 'Rosehips',
  'rose hip': 'Rosehips',
  'rosehip': 'Rosehips',
  'rosehips': 'Rosehips',
  'rose petal': 'Rose petals',
  'rose petals': 'Rose petals',
  'red rose petals': 'Rose petals',

  // Elder
  'elderflower': 'Elderflowers',
  'elderflowers': 'Elderflowers',
  'elderberry': 'Elderberries',
  'elderberries': 'Elderberries',
  'dried elderberry': 'Elderberries',
  'dried elderberries': 'Elderberries',

  // Flowers
  'cowslip': 'Cowslips',
  'cowslips': 'Cowslips',
  'cowslip flowers': 'Cowslips',
  'cowslip flower': 'Cowslips',
  'cowslip blossom': 'Cowslips',
  'cowslip blossoms': 'Cowslips',
  'cowslip peeps': 'Cowslips',
  'chamomile': 'Chamomile',
  'chamomiles': 'Chamomile',
  'chamomile flowers': 'Chamomile',
  'chamomile flower': 'Chamomile',
  'camomile': 'Chamomile',
  'camomiles': 'Chamomile',
  'camomile flowers': 'Chamomile',
  'camomile flower': 'Chamomile',
  'primrose': 'Primroses',
  'primroses': 'Primroses',
  'primrose flowers': 'Primroses',
  'primrose flower': 'Primroses',
  'wild violet': 'Wild Violets',
  'wild violets': 'Wild Violets',
  'wild violet petals': 'Wild Violets',
  'violet': 'Wild Violets',
  'violets': 'Wild Violets',
  'violet petals': 'Wild Violets',
  'yarrow': 'Yarrow',
  'yarrow flower': 'Yarrow',
  'yarrow flowers': 'Yarrow',
  'broom flower': 'Broom flowers',
  'broom flowers': 'Broom flowers',
  'clover': 'Clover flowers',
  'clover flower': 'Clover flowers',
  'clover flowers': 'Clover flowers',
  'clover blossom': 'Clover flowers',
  'clover blossoms': 'Clover flowers',
  'purple clover': 'Clover flowers',
  'purple clover flowers': 'Clover flowers',

  // Berries & Orchard Fruits
  'blackberry': 'Blackberries',
  'blackberries': 'Blackberries',
  'raspberry': 'Raspberries',
  'raspberries': 'Raspberries',
  'strawberry': 'Strawberries',
  'strawberries': 'Strawberries',
  'blueberry': 'Blueberries',
  'blueberries': 'Blueberries',
  'cranberry': 'Cranberries',
  'cranberries': 'Cranberries',
  'loganberry': 'Loganberries',
  'loganberries': 'Loganberries',
  'gooseberry': 'Gooseberries',
  'gooseberries': 'Gooseberries',
  'apple': 'Apples',
  'apples': 'Apples',
  'fresh apple': 'Apples',
  'fresh apples': 'Apples',
  'dried apple': 'Apples',
  'dried apples': 'Apples',
  'sweet apple': 'Apples',
  'red apples': 'Apples',
  'crab apple': 'Crab apples',
  'crab apples': 'Crab apples',
  'crabapple': 'Crab apples',
  'crabapples': 'Crab apples',
  'pear': 'Pears',
  'pears': 'Pears',
  'peach': 'Peaches',
  'peaches': 'Peaches',
  'plum': 'Plums',
  'plums': 'Plums',
  'damson': 'Damsons',
  'damsons': 'Damsons',
  'sloe': 'Sloes',
  'sloes': 'Sloes',
  'cherry': 'Cherries',
  'cherries': 'Cherries',
  'sour cherry': 'Sour cherries',
  'sour cherries': 'Sour cherries',
  'morello cherry': 'Morello cherries',
  'morello cherries': 'Morello cherries',
  'cherry plum': 'Cherry plums',
  'cherry plums': 'Cherry plums',
  'lemon': 'Lemons',
  'lemons': 'Lemons',
  'fresh lemon': 'Lemons',
  'orange': 'Oranges',
  'oranges': 'Oranges',
  'fresh orange': 'Oranges',
  'seville orange': 'Seville oranges',
  'seville oranges': 'Seville oranges',
  'mandarin orange': 'Mandarin oranges',
  'mandarin oranges': 'Mandarin oranges',
  'calamondin orange': 'Calamondin oranges',
  'calamondin oranges': 'Calamondin oranges',
  'grapefruit': 'Grapefruit',
  'grapefruits': 'Grapefruit',
  'apricot': 'Apricots',
  'apricots': 'Apricots',
  'banana': 'Bananas',
  'bananas': 'Bananas',
  'fig': 'Figs',
  'figs': 'Figs',
  'dried fig': 'Figs',
  'dried figs': 'Figs',
  'raisin': 'Raisins',
  'raisins': 'Raisins',
  'dried raisins': 'Raisins',
  'golden raisin': 'Golden raisins',
  'golden raisins': 'Golden raisins',
  'sultana': 'Sultanas',
  'sultanas': 'Sultanas',

  // Vegetables & Herbs
  'carrot': 'Carrots',
  'carrots': 'Carrots',
  'parsnip': 'Parsnips',
  'parsnips': 'Parsnips',
  'potato': 'Potatoes',
  'potatoes': 'Potatoes',
  'sweet potato': 'Sweet potatoes',
  'sweet potatoes': 'Sweet potatoes',
  'beetroot': 'Beetroot',
  'beetroots': 'Beetroot',
  'marrow': 'Marrow',
  'marrows': 'Marrow',
  'dandelion': 'Dandelions',
  'dandelions': 'Dandelions',
  'dandelion flower': 'Dandelions',
  'dandelion flowers': 'Dandelions',
  'dandelion petal': 'Dandelions',
  'dandelion petals': 'Dandelions',
  'dandelion blossom': 'Dandelions',
  'dandelion blossoms': 'Dandelions',
  'dandelion head': 'Dandelions',
  'dandelion heads': 'Dandelions',
  'dandelion root': 'Dandelion root',
  'dandelion roots': 'Dandelion root',
  'dandelion green': 'Dandelion greens',
  'dandelion greens': 'Dandelion greens',
  'sassafras root bark': 'Sassafras root bark',
  'sumac berry': 'Sumac berries',
  'sumac berries': 'Sumac berries',
  'manzanita berry': 'Manzanita berries',
  'manzanita berries': 'Manzanita berries',
  'hawthorn blossom': 'Hawthorn blossom',
  'hawthorn blossoms': 'Hawthorn blossom',
  'vine pruning': 'Vine prunings',
  'vine prunings': 'Vine prunings',
  'turkey tail mushroom': 'Turkey tail mushrooms',
  'turkey tail mushrooms': 'Turkey tail mushrooms',
  'buddha s hand': "Buddha's Hand",
  "buddha's hand": "Buddha's Hand",

  // Spices
  'cinnamon stick': 'Cinnamon sticks',
  'cinnamon sticks': 'Cinnamon sticks',
  'ground cinnamon': 'Cinnamon',
  'clove': 'Cloves',
  'cloves': 'Cloves',
  'whole cloves': 'Cloves',
  'nutmeg': 'Nutmeg',
  'whole nutmeg': 'Nutmeg',
  'grated nutmeg': 'Nutmeg',
  'orange zest': 'Orange zest',
  'orange peel': 'Orange zest',
  'orange rind': 'Orange zest',
  'lemon zest': 'Lemon zest',
  'lemon peel': 'Lemon zest',
  'lemon rind': 'Lemon zest',
  'habanero pepper': 'Habanero peppers',
  'habanero peppers': 'Habanero peppers',
  'cayenne pepper': 'Cayenne peppers',
  'cayenne peppers': 'Cayenne peppers',
  'hot pepper': 'Hot peppers',
  'hot peppers': 'Hot peppers',

  // Sugars & Grains
  'white sugar': 'White sugar',
  'granulated sugar': 'Granulated sugar',
  'brown sugar': 'Brown sugar',
  'dark brown sugar': 'Dark brown sugar',
  'glucose chipping': 'Brewing sugar',
  'glucose chippings': 'Brewing sugar',
  'brewing sugar': 'Brewing sugar',
  'brewers sugar': 'Brewing sugar',
  'brewer s sugar': 'Brewing sugar',
  "brewer's sugar": 'Brewing sugar',
  'dextrose': 'Brewing sugar',
  'corn sugar': 'Brewing sugar',
  'maple syrup': 'Maple syrup',
  'flaked barley': 'Flaked barley',
  'pearl barley': 'Pearl barley',
  'roasted barley': 'Roasted barley',
  'crystal malt': 'Crystal Malt',
  'chocolate malt': 'Chocolate Malt',
  'black malt': 'Black Malt',
  'patent black malt': 'Patent Black Malt',
  'black patent malt': 'Patent Black Malt',
  'malt extract': 'Malt extract',

  // Hops
  'cascade': 'Cascade hops',
  'cascade hops': 'Cascade hops',
  'cascade hop': 'Cascade hops',
  'us cascade hops': 'Cascade hops',
  'us cascade hop': 'Cascade hops',
  'uk cascade hops': 'Cascade hops',
  'uk cascade hop': 'Cascade hops',
  'nz cascade hops': 'Cascade hops',
  'nz cascade hop': 'Cascade hops',
  'columbus': 'Columbus hops',
  'columbus hops': 'Columbus hops',
  'columbus hop': 'Columbus hops',
  'columbus (tomahawk) hops': 'Columbus hops',
  'simcoe': 'Simcoe hops',
  'simcoe hops': 'Simcoe hops',
  'simcoe hop': 'Simcoe hops',
  'centennial': 'Centennial hops',
  'centennial hops': 'Centennial hops',
  'centennial hop': 'Centennial hops',
  'citra': 'Citra hops',
  'citra hops': 'Citra hops',
  'citra hop': 'Citra hops',
  'motueka': 'Motueka hops',
  'motueka hops': 'Motueka hops',
  'motueka hop': 'Motueka hops',
  'amarillo': 'Amarillo hops',
  'amarillo hops': 'Amarillo hops',
  'saaz': 'Saaz hops',
  'saaz hops': 'Saaz hops',
  'chinook': 'Chinook hops',
  'chinook hops': 'Chinook hops',
  'east kent goldings': 'East Kent Goldings hops',
  'east kent golding': 'East Kent Goldings hops',
  'east kent goldings hops': 'East Kent Goldings hops',
  'kent goldings': 'East Kent Goldings hops',
  'goldings hops': 'Goldings hops',
  'fuggles': 'Fuggles hops',
  'fuggle': 'Fuggles hops',
  'fuggles hops': 'Fuggles hops',
  'hallertau': 'Hallertauer hops',
  'hallertauer': 'Hallertauer hops',
  'hallertauer hops': 'Hallertauer hops',

  // Juices & Grapes
  'white grape juice': 'White grape juice',
  'red grape juice': 'Red grape juice',
  'white grape juice concentrate': 'White grape juice concentrate',
  'red grape juice concentrate': 'Red grape juice concentrate',
  'white grapes': 'White grapes',
  'white grape': 'White grapes',
  'red grapes': 'Red grapes',
  'red grape': 'Red grapes',
  'black grapes': 'Black grapes',
  'black grape': 'Black grapes',
  'green grapes': 'Green grapes',
  'green grape': 'Green grapes',
  'apple juice': 'Apple juice',
  'sweet apple juice': 'Apple juice',
  'sweet cider': 'Apple juice',
  'sweet apple cider': 'Apple juice',
  'apple cider': 'Apple juice',
  'apple juice concentrate': 'Apple juice',
  'frozen apple juice concentrate': 'Apple juice',
  'apple concentrate': 'Apple juice',
  'fresh apple juice': 'Apple juice',
  'fresh sweet apple juice': 'Apple juice',
  'fresh sweet cider': 'Apple juice',
  'freshly pressed sweet cider': 'Apple juice',
  'unpasteurised sweet cider': 'Apple juice',
  'unpasteurized sweet cider': 'Apple juice',
  'pasteurised apple juice': 'Apple juice',
  'pasteurized apple juice': 'Apple juice',
  'preservative-free apple juice': 'Apple juice',
};

export function normIngredient(s) {
  return String(s || '').toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns the canonical display name for a main ingredient item.
 * e.g. "Ginger root", "Root ginger", "Gingerroot" -> "Ginger"
 */
export function canonicalizeMain(name) {
  if (!name) return '';
  const clean = String(name).trim();
  const n = normIngredient(clean);
  if (EXACT_CANONICAL[n]) return EXACT_CANONICAL[n];

  // Specific ginger check: any variation of ginger root, root ginger, gingerroot etc.
  if (/\b(ginger\s*root|root\s*ginger|gingerroot)\b/i.test(clean)) {
    return 'Ginger';
  }

  // Apple juice / sweet apple juice / sweet cider / apple juice concentrate
  if (/^(frozen\s+)?(fresh\s*,?\s*)?(freshly\s+pressed\s+)?(unpasteuri[sz]ed\s+)?(sweet\s+)?apple\s+juice(\s+concentrate)?$/i.test(clean) ||
      /^(fresh\s*,?\s*)?(freshly\s+pressed\s+)?(unpasteuri[sz]ed\s+)?sweet\s+(apple\s+)?cider$/i.test(clean) ||
      /^(frozen\s+)?apple\s+(juice\s+concentrate|concentrate|cider)$/i.test(clean)) {
    return 'Apple juice';
  }

  // Cascade / Cascade hops
  if (/^(us\s+|uk\s+|nz\s+)?cascade(\s+hops?)?$/i.test(clean)) {
    return 'Cascade hops';
  }

  // Cowslips / Cowslip flowers
  if (/^cowslip(\s+flowers?|\s+blossoms?|\s+peeps?)?$/i.test(clean)) {
    return 'Cowslips';
  }

  // Dandelion flowers / petals / blossoms (preserving root and greens)
  if (/^dandelion(\s+(flowers?|petals?|blossoms?|heads?))?$/i.test(clean)) {
    return 'Dandelions';
  }

  // Chamomile / Camomile
  if (/^(ch|c)amomile(\s+flowers?)?$/i.test(clean)) {
    return 'Chamomile';
  }

  // Primroses
  if (/^primrose(\s+flowers?)?$/i.test(clean)) {
    return 'Primroses';
  }

  // Glucose chippings / brewing sugar / brewer's sugar / dextrose
  if (/^(glucose\s+chippings?|brewers?\s*sugar|brewing\s+sugar|dextrose|corn\s+sugar)$/i.test(clean)) {
    return 'Brewing sugar';
  }

  return clean;
}

/**
 * Canonicalizes ingredient strings stored inside recipe `ingredients` arrays.
 * Preserves quantity notes, units, brackets, and preparation descriptions.
 * e.g. "root ginger (½ oz)" -> "ginger (½ oz)"
 *      "root ginger, bruised (1 oz)" -> "ginger, bruised (1 oz)"
 *      "black currants (3 lb)" -> "blackcurrants (3 lb)"
 */
export function canonicalizeRecipeIngredient(name) {
  if (!name) return '';
  let str = String(name).trim();

  // Root ginger / ginger root / gingerroot
  str = str.replace(/\b(root\s+ginger|ginger\s*root|gingerroot)\b/gi, (match) => {
    return match[0] === match[0].toUpperCase() ? 'Ginger' : 'ginger';
  });

  // Black currants / Black Currants -> Blackcurrants
  str = str.replace(/\bblack\s+currants?\b/gi, (match) => {
    return match[0] === match[0].toUpperCase() ? 'Blackcurrants' : 'blackcurrants';
  });

  // Red currants / Red Currants -> Redcurrants
  str = str.replace(/\bred\s+currants?\b/gi, (match) => {
    return match[0] === match[0].toUpperCase() ? 'Redcurrants' : 'redcurrants';
  });

  // Rose hips -> Rosehips
  str = str.replace(/\brose\s+hips?\b/gi, (match) => {
    return match[0] === match[0].toUpperCase() ? 'Rosehips' : 'rosehips';
  });

  // Sweet apple juice -> apple juice
  str = str.replace(/\b(fresh,\s*)?sweet\s+apple\s+juice\b/gi, (match) => {
    return match[0] === match[0].toUpperCase() ? 'Apple juice' : 'apple juice';
  });

  // Sweet cider / sweet apple cider (e.g. "freshly pressed sweet cider", "sweet cider", "fresh, sweet apple cider")
  str = str.replace(/\b((?:freshly\s+pressed|fresh|unpasteuri[sz]ed)\s*,?\s*)?sweet\s+(?:apple\s+)?cider\b/gi, (match, prefix) => {
    const pref = prefix || '';
    const term = (match[0] === match[0].toUpperCase() && !pref) ? 'Apple juice' : 'apple juice';
    return pref + term;
  });

  // Frozen apple juice concentrate / apple juice concentrate -> apple juice
  str = str.replace(/\b(frozen\s+)?apple\s+juice\s+concentrate\b/gi, (match) => {
    return match[0] === match[0].toUpperCase() ? 'Apple juice' : 'apple juice';
  });

  // Cowslip flowers -> cowslips
  str = str.replace(/\bcowslip\s+flowers?\b/gi, (match) => {
    return match[0] === match[0].toUpperCase() ? 'Cowslips' : 'cowslips';
  });

  // Dandelion petals / Dandelion flowers / blossoms -> dandelions
  str = str.replace(/\bdandelion\s+(flowers?|petals?|blossoms?|heads?)\b/gi, (match) => {
    return match[0] === match[0].toUpperCase() ? 'Dandelions' : 'dandelions';
  });

  // Chamomile flowers / Camomile flowers -> chamomile
  str = str.replace(/\b(ch|c)amomile\s+flowers?\b/gi, (match) => {
    return match[0] === match[0].toUpperCase() ? 'Chamomile' : 'chamomile';
  });

  // Primrose flowers -> primroses
  str = str.replace(/\bprimrose\s+flowers?\b/gi, (match) => {
    return match[0] === match[0].toUpperCase() ? 'Primroses' : 'primroses';
  });

  // Glucose chippings -> brewing sugar
  str = str.replace(/\bglucose\s+chippings?\b/gi, (match) => {
    return match[0] === match[0].toUpperCase() ? 'Brewing sugar' : 'brewing sugar';
  });

  return str;
}

/**
 * Migration routine: updates `brews.ingredients` and `brew_main_ingredients.items` in the DB.
 */
export function migrateHomebrewIngredients(db) {
  let brewsUpdated = 0;
  let mainUpdated = 0;
  let picturesMerged = 0;

  // 1. Update brews.ingredients
  const brewRows = db.prepare('SELECT id, ingredients FROM brews').all();
  const updateBrew = db.prepare('UPDATE brews SET ingredients = ? WHERE id = ?');

  db.transaction(() => {
    for (const b of brewRows) {
      try {
        const ings = JSON.parse(b.ingredients || '[]');
        let changed = false;
        const newIngs = ings.map((item) => {
          if (!item?.name) return item;
          const canon = canonicalizeRecipeIngredient(item.name);
          if (canon !== item.name) {
            changed = true;
            return { ...item, name: canon };
          }
          return item;
        });
        if (changed) {
          updateBrew.run(JSON.stringify(newIngs), b.id);
          brewsUpdated++;
        }
      } catch (_) {}
    }

    // 2. Update brew_main_ingredients.items
    const mainRows = db.prepare('SELECT brew_id, items FROM brew_main_ingredients').all();
    const updateMain = db.prepare('UPDATE brew_main_ingredients SET items = ? WHERE brew_id = ?');

    for (const r of mainRows) {
      try {
        const items = JSON.parse(r.items || '[]');
        let changed = false;
        const seenNames = new Set();
        const newItems = [];

        for (const it of items) {
          if (!it?.name) continue;
          const canon = canonicalizeMain(it.name);
          if (canon !== it.name) changed = true;

          const norm = normIngredient(canon);
          if (!seenNames.has(norm)) {
            seenNames.add(norm);
            newItems.push({ ...it, name: canon });
          } else {
            // Deduplicate if multiple items in the same recipe merged into the same ingredient!
            changed = true;
          }
        }

        if (changed) {
          updateMain.run(JSON.stringify(newItems), r.brew_id);
          mainUpdated++;
        }
      } catch (_) {}
    }

    // 3. Migrate custom picture mappings in brew_ingredient_pictures
    // E.g. If an entry exists for "root ginger", copy key to "ginger" if "ginger" doesn't have one
    const pics = db.prepare('SELECT name_norm, name_display, key, updated_at FROM brew_ingredient_pictures').all();
    for (const p of pics) {
      const canonDisplay = canonicalizeMain(p.name_display);
      const canonNorm = normIngredient(canonDisplay);
      if (canonNorm !== p.name_norm) {
        // Check if canonical already has a picture
        const existing = db.prepare('SELECT key FROM brew_ingredient_pictures WHERE name_norm = ?').get(canonNorm);
        if (!existing) {
          db.prepare('INSERT INTO brew_ingredient_pictures (name_norm, name_display, key, updated_at) VALUES (?, ?, ?, ?)')
            .run(canonNorm, canonDisplay, p.key, p.updated_at);
        }
        // Remove old non-canonical mapping
        db.prepare('DELETE FROM brew_ingredient_pictures WHERE name_norm = ?').run(p.name_norm);
        picturesMerged++;
      }
    }
  })();

  return { brewsUpdated, mainUpdated, picturesMerged };
}
