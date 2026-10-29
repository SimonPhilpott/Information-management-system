// Item Knowledge Catalogue for Ker Nethalas & Solo Dungeon Delving
// Provides item definitions, ongoing passive effects, and explicit rulebook effects.

export const ITEM_CATALOG = {
  'obsidian vaelor sigil': {
    name: 'Obsidian Vaelor Sigil',
    category: 'Relic / Talisman',
    icon: 'sparkle',
    description: 'An ancient talisman carved from abyssal void-obsidian by the Vaelor cult. It pulses with cold eldritch warding when aberrational or spectral horrors draw near.',
    passive: '+10% Magic/Void Resistance; repels minor shades; glows faint violet within 1 room of ethereal threats.',
    passiveKey: 'vaelor_ward',
    passiveLabel: '🛡️ Vaelor Ward (+10% Void Res)',
    consumable: false,
    action: {
      label: 'Invoke Vaelor Sigil',
      dice: '1d100',
      description: 'Channel the obsidian sigil to unleash a burst of repelling void-resonance, imposing Disadvantage on an attacking aberration or spirit.',
      effectType: 'ward'
    }
  },
  'calcified aether stone': {
    name: 'Calcified Aether Stone',
    category: 'Relic / Arcane Focus',
    icon: 'sparkle',
    description: 'A pale, crystallised deposit of raw celestial aether harvested from deep catacomb fractures. It acts as an arcane capacitor for spells and masteries.',
    passive: '+2 Max Aether Focus capacity while carried in your active kit.',
    passiveKey: 'aether_attunement',
    passiveLabel: '✨ Aether Resonance (+2 Focus)',
    consumable: true,
    action: {
      label: 'Crush Aether Stone',
      dice: null,
      description: 'Crush the crystal in your palm to immediately surge your Aether pool back to full capacity (10 Aether). Consumes the stone.',
      effectType: 'restore_aether',
      restore: 10
    }
  },
  'silver funerary vial': {
    name: 'Silver Funerary Vial',
    category: 'Consumable / Holy Water',
    icon: 'blood',
    description: 'A filigreed vial of consecrated embalming spirit blessed by the order of the Catacomb Keepers. It cleanses necro-decay and burns undead flesh.',
    passive: null,
    consumable: true,
    action: {
      label: 'Anoint with Funerary Vial',
      dice: null,
      description: 'Cleanse flesh to reduce The Rot by 1 stage, or splash upon an undead foe to inflict 2d6 Holy/Radiant damage.',
      effectType: 'cleanse_rot',
      reduceRot: 1
    }
  },
  'vaelorian embalmer\'s salve': {
    name: "Vaelorian Embalmer's Salve",
    category: 'Alchemical Unguent / Rot Remedy',
    icon: 'flask',
    description: "An amber unguent of crushed juniper, bitumen, and ancient camphor formulated by Vaelorian morticians. Rulebook p. 87: When anointed onto corrupted flesh, arrests necrosis and immediately reduces The Rot by 1 stage.",
    passive: null,
    consumable: true,
    action: {
      label: 'Anoint Wounds (Reduce The Rot by 1 Stage)',
      dice: null,
      description: "Anoint necrotic wounds with the resinous salve: immediately steps down The Rot infection by 1 stage.",
      effectType: 'cleanse_rot',
      reduceRot: 1
    }
  },
  'embalmer\'s salve': {
    name: "Embalmer's Salve",
    category: 'Alchemical Unguent / Rot Remedy',
    icon: 'flask',
    description: "Resinous amber ointment of bitumen, juniper, and camphor. Rulebook p. 87: Arrests flesh putrefaction and immediately reduces The Rot infection by 1 stage.",
    passive: null,
    consumable: true,
    action: {
      label: 'Anoint with Salve (Reduce The Rot by 1 Stage)',
      dice: null,
      description: "Apply salve to infected tissue: reduces The Rot infection by 1 stage.",
      effectType: 'cleanse_rot',
      reduceRot: 1
    }
  },
  'dyxemis sluice map': {
    name: 'Dyxemis Sluice Map',
    category: 'Cartography / Vellum Map',
    icon: 'explore',
    description: 'Wax-treated vellum charting the drainage sluices and subterranean overflow conduits descending toward Dyxemis. Rulebook: Details auxiliary bypass routes, preventing navigation fumbles and ambushes in flooded waterways.',
    passive: 'Cartographic knowledge: Reveals hidden conduit routes, avoiding flooded dead-ends and waterborne hazards.',
    passiveKey: 'sluice_map_nav',
    passiveLabel: '🗺️ Sluice Cartography (Hazard Bypass)',
    consumable: false,
    action: {
      label: 'Consult Sluice Map',
      dice: null,
      description: 'Study the spidery iron-gall ink conduits to plan a bypass route through auxiliary drainage sluices.',
      effectType: 'study_map'
    }
  },
  'tallow torch': {
    name: 'Tallow Torch',
    category: 'Light Source',
    icon: 'sun',
    description: 'A stout mutton-tallow and pitch-linen torch. Essential for surviving the crushing dark of Ker Nethalas.',
    passive: 'Keeps darkness at bay; prevents Blinded penalties (-20% to checks).',
    passiveKey: 'torch_light',
    passiveLabel: '🔥 Illumination (Prevents Blinded)',
    consumable: true,
    action: {
      label: 'Light Torch (Refill 20 Light)',
      dice: null,
      description: 'Ignite torch to restore Light tracker to 20 rooms of illumination.',
      effectType: 'refill_light',
      lightValue: 20
    }
  },
  'flint and tinder': {
    name: 'Flint and Tinder',
    category: 'Essential Tool',
    icon: 'sparkle',
    description: 'A high-carbon steel striker and charred linen stored in a horn box. Used to ignite torches, braziers, and campfires.',
    passive: null,
    consumable: false,
    action: null
  },
  'bone suture needles': {
    name: 'Bone Suture Needles',
    category: 'Medical Tool',
    icon: 'tune',
    description: 'Fine needles carved from desiccated bone with sinew thread. Allows delvers to stitch torn flesh and bind lacerations.',
    passive: null,
    consumable: false,
    action: {
      label: 'Stitch Wounds (Roll 1d4 HP)',
      dice: '1d4',
      description: 'Field surgery: roll 1d4 to restore physical Health during a quiet pause or Camp rest.',
      effectType: 'heal_hp',
      healDice: 4
    }
  },
  'hard tack ration': {
    name: 'Hard Tack Ration',
    category: 'Rations / Sustenance',
    icon: 'food',
    description: 'Dense, salt-baked travel biscuit. Rulebook p. 125: Staves off starvation and restores delver vitality.',
    passive: null,
    consumable: true,
    action: {
      label: 'Eat Ration (Recover 5 Fatigue)',
      dice: null,
      description: 'Consume ration during rest to reduce Exhaustion by 5 points.',
      effectType: 'reduce_exhaustion',
      exhaustionValue: 5
    }
  },
  'cave lichen rations (cooking ingredient)': {
    name: 'Cave Lichen Rations',
    category: 'Rations / Cooking Ingredient',
    icon: 'food',
    description: 'Edible subterranean lichen rich in mineral salts. Rulebook pp. 125, 222: Staves off starvation and reduces Exhaustion by 2 points (or 5 points when cooked into a Camp meal).',
    passive: null,
    consumable: true,
    action: {
      label: 'Eat Lichen (Recover 2 Fatigue)',
      dice: null,
      description: 'Consume raw lichen to stave off starvation, reducing Exhaustion by 2 points.',
      effectType: 'reduce_exhaustion',
      exhaustionValue: 2
    }
  },
  'cave lichen rations': {
    name: 'Cave Lichen Rations',
    category: 'Rations / Cooking Ingredient',
    icon: 'food',
    description: 'Edible subterranean lichen rich in mineral salts. Rulebook pp. 125, 222: Staves off starvation and reduces Exhaustion by 2 points (or 5 points when cooked into a Camp meal).',
    passive: null,
    consumable: true,
    action: {
      label: 'Eat Lichen (Recover 2 Fatigue)',
      dice: null,
      description: 'Consume raw lichen to stave off starvation, reducing Exhaustion by 2 points.',
      effectType: 'reduce_exhaustion',
      exhaustionValue: 2
    }
  },
  'waterskin (half full)': {
    name: 'Waterskin',
    category: 'Rations / Water',
    icon: 'cup',
    description: 'Cured hide flask of surface well-water. Clean water is worth gold in the stagnant depths.',
    passive: null,
    consumable: true,
    action: {
      label: 'Drink Water (Recover 2 Fatigue)',
      dice: null,
      description: 'Quench thirst during rest to reduce Exhaustion by 2 points.',
      effectType: 'reduce_exhaustion',
      exhaustionValue: 2
    }
  },
  'tarnished brass cylinder': {
    name: 'Tarnished Brass Cylinder',
    category: 'Curio / Puzzle Relic',
    icon: 'archive',
    description: 'A heavy brass reliquary cylinder engraved with astrological dials. Its rotating bands require an Intelligence/Recall check to open.',
    passive: null,
    consumable: false,
    action: {
      label: 'Decipher Astrological Rings',
      dice: '1d100',
      description: 'Attempt a Recall (40%) check to align the astrological glyphs and unlock the inner reliquary.',
      effectType: 'skill_test',
      skill: 'Recall'
    }
  },
  '3 grave-iron scraps': {
    name: 'Grave-Iron Scraps',
    category: 'Crafting Material',
    icon: 'shield',
    description: 'Three jagged slabs of tomb-forged iron salvaged from catacomb grates. Can be hammered at Camp to restore degraded armour integrity.',
    passive: null,
    consumable: true,
    action: {
      label: 'Repair Armour Integrity (+1 Die Step)',
      dice: null,
      description: 'Spend grave-iron at Camp to repair a degraded armour piece (e.g. D8 -> D10).',
      effectType: 'repair_armour'
    }
  },
  'mining pickaxe': {
    name: 'Mining Pickaxe',
    category: 'Melee Weapon (Shafted)',
    icon: 'bolt',
    description: 'Heavy steel head with a hardened piercing beak on a seasoned ash haft. Lethal against armoured exoskeletons and stone horrors.',
    passive: 'Damage: 1d6+1 Physical / Piercing · Uses Shafted Weapons skill (45%).',
    passiveKey: 'mining_pick_weapon',
    passiveLabel: '⚔️ Mining Pickaxe (1d6+1 Piercing)',
    consumable: false,
    action: null
  },
  'corroded iron breastplate': {
    name: 'Corroded Iron Breastplate',
    category: 'Torso Armour',
    icon: 'shield',
    description: 'Heavy pitted iron plate covering the chest and upper vitals. Protection 3, Integrity d10.',
    passive: 'Prot 3 · -20% Agility Penalty (Dodge, Stealth, Acrobatics).',
    passiveKey: 'breastplate_penalty',
    passiveLabel: '🛡️ Torso Prot 3 (-20% Agility Penalty)',
    consumable: false,
    action: null
  },
  'tattered prisoner rags': {
    name: 'Tattered Prisoner Rags',
    category: 'Attire',
    icon: 'person',
    description: 'Coarse burlap garment issued to Veldonian penal delvers. Provides 0 Protection.',
    passive: null,
    consumable: false,
    action: null
  },
  // ---- CANONICAL KER NETHALAS POTIONS (Rulebook p. 221) ----
  'healing potion': {
    name: 'Healing Potion',
    category: 'Consumable Potion',
    icon: 'blood',
    description: 'Crimson vital extract. Rulebook p. 221 (Potions #7-8): Immediately restores 1d6+2 Health (Wounds).',
    passive: null,
    consumable: true,
    action: {
      label: 'Drink Healing Potion (Heal 1d6+2 HP)',
      dice: '1d6+2',
      description: 'Imbibe potion: immediately restores 1d6+2 Health.',
      effectType: 'heal_hp_potion'
    }
  },
  'potion of healing': {
    name: 'Potion of Healing',
    category: 'Consumable Potion',
    icon: 'blood',
    description: 'Crimson vital extract. Rulebook p. 221 (Potions #7-8): Immediately restores 1d6+2 Health (Wounds).',
    passive: null,
    consumable: true,
    action: {
      label: 'Drink Healing Potion (Heal 1d6+2 HP)',
      dice: '1d6+2',
      description: 'Imbibe potion: immediately restores 1d6+2 Health.',
      effectType: 'heal_hp_potion'
    }
  },
  'potion of vitality': {
    name: 'Potion of Vitality',
    category: 'Consumable Potion',
    icon: 'shield',
    description: 'Thick amber draught. Rulebook p. 221 (Potions #20): Grants 1d10 Temporary Toughness buffer. Drinking another while active causes 1d10 Acid damage.',
    passive: null,
    consumable: true,
    action: {
      label: 'Drink Vitality Potion (Gain 1d10 Toughness)',
      dice: '1d10',
      description: 'Imbibe potion: grants 1d10 Temporary Toughness buffer.',
      effectType: 'restore_toughness_dice'
    }
  },
  'potion of mindfulness': {
    name: 'Potion of Mindfulness',
    category: 'Consumable Potion',
    icon: 'sparkle',
    description: 'Cool violet tincture of star-moss. Rulebook p. 221 (Potions #15): Realigns a fractured psyche, immediately restoring 1 Sanity.',
    passive: null,
    consumable: true,
    action: {
      label: 'Drink Mindfulness Potion (Heal 1 Sanity)',
      dice: null,
      description: 'Imbibe potion: immediately restores 1 Sanity point.',
      effectType: 'restore_sanity',
      sanityValue: 1
    }
  },
  'potion of aether': {
    name: 'Potion of Aether',
    category: 'Consumable Potion',
    icon: 'sparkle',
    description: 'Shimmering azure liquid. Rulebook p. 221 (Potions #1): Immediately restores 5 Aether mana to your casting pool.',
    passive: null,
    consumable: true,
    action: {
      label: 'Drink Aether Potion (Restore 5 Aether)',
      dice: null,
      description: 'Imbibe potion: immediately recovers 5 Aether mana.',
      effectType: 'restore_aether',
      restore: 5
    }
  },
  'potion of antidote': {
    name: 'Potion of Antidote',
    category: 'Consumable Potion',
    icon: 'flask',
    description: 'Bitter herbal draft. Rulebook p. 221 (Potions #2): Immediately cures and removes the Poisoned condition.',
    passive: null,
    consumable: true,
    action: {
      label: 'Drink Antidote (Cure Poison)',
      dice: null,
      description: 'Imbibe antidote: immediately neutralises toxins and removes Poisoned condition.',
      effectType: 'cure_poison'
    }
  },
  'antidote': {
    name: 'Antidote',
    category: 'Consumable Potion',
    icon: 'flask',
    description: 'Bitter herbal draft. Rulebook p. 221 (Potions #2): Immediately cures and removes the Poisoned condition.',
    passive: null,
    consumable: true,
    action: {
      label: 'Drink Antidote (Cure Poison)',
      dice: null,
      description: 'Imbibe antidote: immediately neutralises toxins and removes Poisoned condition.',
      effectType: 'cure_poison'
    }
  },
  'potion of coagulate': {
    name: 'Potion of Coagulate',
    category: 'Consumable Potion',
    icon: 'blood',
    description: 'Thick astringent syrup. Rulebook p. 221 (Potions #3): Immediately arrests haemorrhaging and removes the Bleeding condition.',
    passive: null,
    consumable: true,
    action: {
      label: 'Drink Coagulate (Cure Bleeding)',
      dice: null,
      description: 'Imbibe coagulant: immediately stops internal and external bleeding.',
      effectType: 'cure_bleeding'
    }
  },
  'potion of courage': {
    name: 'Potion of Courage',
    category: 'Consumable Potion',
    icon: 'bolt',
    description: 'Fiery distillation of dragon-pepper. Rulebook p. 221 (Potions #4): Steels delver resolve and immediately removes the Frightened condition.',
    passive: null,
    consumable: true,
    action: {
      label: 'Drink Courage (Cure Frightened)',
      dice: null,
      description: 'Imbibe potion: immediately banishes dread and removes Frightened condition.',
      effectType: 'cure_frightened'
    }
  },
  'potion of purge': {
    name: 'Potion of Purge',
    category: 'Consumable Potion',
    icon: 'sparkle',
    description: 'Purifying silver elixir. Rulebook p. 221 (Potions #11): Immediately cleanses and removes both the Cursed and Sickened conditions.',
    passive: null,
    consumable: true,
    action: {
      label: 'Drink Purge (Remove Curse & Sickness)',
      dice: null,
      description: 'Imbibe purge: immediately removes both Cursed and Sickened conditions.',
      effectType: 'cure_curse'
    }
  },
  'potion of rest': {
    name: 'Potion of Rest',
    category: 'Consumable Potion',
    icon: 'food',
    description: 'Infusion of valerian root and aether salts. Rulebook p. 221 (Potions #12-13): Soothes muscular exhaustion, immediately reducing Exhaustion by 1d4 points.',
    passive: null,
    consumable: true,
    action: {
      label: 'Drink Rest Potion (Reduce 1d4 Fatigue)',
      dice: '1d4',
      description: 'Imbibe potion: reduces Exhaustion tracker by 1d4 points.',
      effectType: 'reduce_exhaustion_dice'
    }
  },
  'potion of speed': {
    name: 'Potion of Speed',
    category: 'Consumable Potion',
    icon: 'bolt',
    description: 'Quicksilver alchemical fluid. Rulebook p. 221 (Potions #16-17): Accelerates reflexes, granting 1 immediate free Standard Action in combat.',
    passive: null,
    consumable: true,
    action: {
      label: 'Drink Speed Potion (Gain 1 Free Action)',
      dice: null,
      description: 'Imbibe potion: grants 1 immediate free Standard Action.',
      effectType: 'gain_action'
    }
  },
  'potion of stoneskin': {
    name: 'Potion of Stoneskin',
    category: 'Consumable Potion',
    icon: 'shield',
    description: 'Grey calcified suspension. Rulebook p. 221 (Potions #18): Grants +1 Armor Protection for the next 1d10 rooms, but reduces Dodge and Acrobatics by -10%.',
    passive: '+1 Armor Protection, -10% Dodge & Acrobatics (lasts 1d10 rooms).',
    passiveKey: 'stoneskin_armor',
    passiveLabel: '🪨 Stoneskin (+1 Armor, -10% Dodge)',
    consumable: true,
    action: {
      label: 'Drink Stoneskin (+1 Armor for 1d10 Rooms)',
      dice: '1d10',
      description: 'Hardens skin into slate: grants +1 Armor Protection for 1d10 rooms (-10% Dodge/Acrobatics).',
      effectType: 'stoneskin'
    }
  },
  'potion of strength': {
    name: 'Potion of Strength',
    category: 'Consumable Potion',
    icon: 'bolt',
    description: 'Thick red iron elixir. Rulebook p. 221 (Potions #19): Increases Endurance and Athletics by +10% for the next 1d10 rooms.',
    passive: '+10% Endurance & Athletics (lasts 1d10 rooms).',
    passiveKey: 'strength_boost',
    passiveLabel: '💪 Ogre Strength (+10% End/Ath)',
    consumable: true,
    action: {
      label: 'Drink Strength Potion (+10% End/Ath)',
      dice: '1d10',
      description: 'Surges muscular strength: increases Endurance and Athletics by +10% for 1d10 rooms.',
      effectType: 'strength_boost'
    }
  },
  'flaming weapon oil': {
    name: 'Flaming Weapon Oil',
    category: 'Weapon Coating',
    icon: 'sun',
    description: 'Alchemical naphtha. Rulebook p. 221 (Potions #5): Applied to a weapon: adds +1d4 Fire damage to your Damage Pool for 5 combat rounds.',
    passive: null,
    consumable: true,
    action: {
      label: 'Coat Weapon (+1d4 Fire for 5 Rounds)',
      dice: '1d4',
      description: 'Coat weapon blade: adds +1d4 Fire damage to attacks for 5 rounds.',
      effectType: 'flaming_oil'
    }
  },
  'bandages': {
    name: 'Bandages',
    category: 'Medical Dressing',
    icon: 'tune',
    description: 'Clean woven linen. Rulebook p. 86: Out of combat, used in combination with the Medicine skill to restore 1d4 Toughness buffer once per room.',
    passive: null,
    consumable: true,
    action: {
      label: 'Apply Bandages (Heal 1d4 Toughness)',
      dice: '1d4',
      description: 'Dress wounds with clean linen: roll 1d4 to restore Toughness buffer pool.',
      effectType: 'heal_toughness'
    }
  },
  'bandage': {
    name: 'Bandage',
    category: 'Medical Dressing',
    icon: 'tune',
    description: 'Clean woven linen. Rulebook p. 86: Out of combat, used in combination with the Medicine skill to restore 1d4 Toughness buffer once per room.',
    passive: null,
    consumable: true,
    action: {
      label: 'Apply Bandage (Heal 1d4 Toughness)',
      dice: '1d4',
      description: 'Dress wounds with clean linen: roll 1d4 to restore Toughness buffer pool.',
      effectType: 'heal_toughness'
    }
  },
  'crafting supplies': {
    name: 'Crafting Supplies',
    category: 'Resource / Crafting',
    icon: 'tune',
    description: 'Scavenged wire, rivets, and scrap metal. Rulebook p. 125: At Camp, 1x Crafting Supplies crafts 1x Bandage, barricades camp, or repairs armour integrity.',
    passive: null,
    consumable: true,
    action: {
      label: 'Craft at Camp (Make 1x Bandage)',
      dice: null,
      description: 'Spend 1x Crafting Supplies at Camp to fashion 1x Bandage (Rulebook p. 125).',
      effectType: 'craft_bandage'
    }
  },
  'cooking ingredients': {
    name: 'Cooking Ingredients',
    category: 'Rations / Sustenance',
    icon: 'food',
    description: 'Edible marrow bones, dried roots, and subterranean fungi. Rulebook p. 125: Cooked at Camp to prepare hot meals that reduce Exhaustion.',
    passive: null,
    consumable: true,
    action: {
      label: 'Cook Meal at Camp (Recover 5 Fatigue)',
      dice: null,
      description: 'Prepare hot meal at Camp: reduces Exhaustion tracker by 5 points.',
      effectType: 'reduce_exhaustion',
      exhaustionValue: 5
    }
  },
  'flask of lamp oil': {
    name: 'Flask of Lamp Oil',
    category: 'Fuel / Combustible',
    icon: 'sun',
    description: 'Refined animal and bitumen oil. Rulebook p. 125: Refuels lantern for 20 rooms of illumination, or hurled to deal 1d6 Fire damage.',
    passive: null,
    consumable: true,
    action: {
      label: 'Refuel Lantern (Refill 20 Light)',
      dice: null,
      description: 'Refill oil lantern: restores Light tracker to 20 rooms of illumination.',
      effectType: 'refill_light',
      lightValue: 20
    }
  }
};

// Helper: look up item data by matching against catalog keys
export function lookupItem(rawItemName) {
  if (!rawItemName) return null;
  const nameStr = String(typeof rawItemName === 'string' ? rawItemName : rawItemName.name || '').trim().toLowerCase();
  
  // Exact match
  if (ITEM_CATALOG[nameStr]) return ITEM_CATALOG[nameStr];

  // Partial match against catalog keys
  for (const [key, val] of Object.entries(ITEM_CATALOG)) {
    if (nameStr.includes(key) || key.includes(nameStr)) {
      return val;
    }
  }

  // Fallback heuristic for generic weapons, armor, potions
  if (/pick|axe|mace|hammer|spear|sword|dagger|blade/i.test(nameStr)) {
    return {
      name: rawItemName,
      category: 'Melee Weapon',
      icon: 'bolt',
      description: 'Scavenged close-combat weapon. Rulebook p. 222: Deals standard physical damage determined by weapon type and character skill.',
      passive: 'Equipped melee weapon.',
      consumable: false,
      action: null
    };
  }
  if (/breastplate|plate|cuirass|greave|helm|shield|bracer|hauberk/i.test(nameStr)) {
    return {
      name: rawItemName,
      category: 'Armour Piece',
      icon: 'shield',
      description: 'Piecemeal protective armor. Rulebook p. 82: Absorbs damage on struck body location according to piece Protection value (1-3).',
      passive: 'Piecemeal Damage Absorption (Rulebook p. 82).',
      consumable: false,
      action: null
    };
  }
  if (/potion|elixir|salve|brew|herb|vial|draught/i.test(nameStr)) {
    return {
      name: rawItemName,
      category: 'Consumable Elixir',
      icon: 'flask',
      description: 'Unidentified alchemical concoction. Rulebook p. 126: Requires a successful Medicine check to identify, or must be tasted with a roll on the Potion Aging Table (p. 126).',
      passive: null,
      consumable: true,
      action: {
        label: `Identify ${rawItemName} (Medicine Check)`,
        dice: '1d100',
        description: `Make a Medicine check (Rulebook p. 126) to identify the formula without risking spoiled or poisoned side effects.`,
        effectType: 'identify_potion'
      }
    };
  }
  if (/scroll|tome|grimoire|parchment|note|map/i.test(nameStr)) {
    return {
      name: rawItemName,
      category: 'Lore / Inscription',
      icon: 'doc',
      description: 'Inscribed parchment or vellum. Rulebook: Decipher with a Recall check to uncover forgotten dungeon secrets, floor layouts, or rites.',
      passive: null,
      consumable: false,
      action: {
        label: `Read ${rawItemName} (Recall Check)`,
        dice: '1d100',
        description: 'Study the text to glean dungeon secrets, conduit layouts, or arcane lore.',
        effectType: 'read_lore'
      }
    };
  }

  return {
    name: rawItemName,
    category: 'Inventory Item',
    icon: 'archive',
    description: 'An item scavenged or carried into the depths of Ker Nethalas.',
    passive: null,
    consumable: false,
    action: null
  };
}

// Extract all active ongoing passive boons/penalties across a character's inventory
export function getActiveOngoingEffects(inventory = []) {
  const effects = [];
  const seenKeys = new Set();

  for (const item of inventory) {
    const data = lookupItem(item);
    if (data?.passive && data.passiveLabel && !seenKeys.has(data.passiveKey || data.name)) {
      seenKeys.add(data.passiveKey || data.name);
      effects.push({
        name: data.name,
        label: data.passiveLabel,
        description: data.passive,
        isPenalty: (data.passive || '').toLowerCase().includes('penalty')
      });
    }
  }

  return effects;
}
