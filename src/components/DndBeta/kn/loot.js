// Spoils & Loot (chapter VI, pp. 205-241): the weapons, armour and gear lists, and the tables that turn a fight, a
// search or a container into things in your pack. The tables themselves are read from the book by
// scripts/extract_kn_loot.py into lootTables.json; this file only knows how to roll on them.
import L from './lootTables.json';

const rnd = (n) => 1 + Math.floor(Math.random() * n);
const roll = (expr) => {
  const m = String(expr).replace(/\s+/g, '').match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!m) return Number(expr) || 0;
  let t = 0; for (let i = 0; i < (Number(m[1]) || 1); i++) t += rnd(Number(m[2])); return t + (Number(m[3]) || 0);
};
const uid = () => Math.random().toString(36).slice(2, 9);
export const TABLES = L.tables;
export const RELICS = L.relics;
export const row = (name, v) => (TABLES[name]?.rows || []).find((r) => v >= r.lo && v <= r.hi);
export const rollRow = (name) => { const t = TABLES[name]; const v = rnd(t.die); return { v, die: t.die, ...row(name, v), page: t.page }; };

// ---- weapons (pp. 207-209): every non-magical weapon deals D6 ----
// traits: Defensive +10 defending with a shield; Quick +10 Initiative; Parrying; Powerful +1 damage; Simple +10 to
// the combat Skill; Two-Handed +2 damage; Versatile +1 damage with two hands
const W = (name, cost, dtype, skill, speed, traits) => ({ name, cost, dtype, skill, speed, traits });
export const WEAPONS = [
  W('Bardiche', 15, 'Slashing', 'Shafted Weapons', 0, ['Two-Handed', 'Quick']), W('Bastard Sword', 30, 'Slashing', 'Bladed Weapons', 0, ['Versatile', 'Parrying']),
  W('Billhook', 10, 'Slashing', 'Shafted Weapons', 0, ['Two-Handed', 'Simple']), W('Cestus', 5, 'Bludgeoning', 'Unarmed Combat & Fist Weapons', 5, ['Simple']),
  W('Claw', 20, 'Slashing', 'Unarmed Combat & Fist Weapons', 0, ['Parrying', 'Quick']), W('Club', 5, 'Bludgeoning', 'Bludgeoning Weapons', 5, ['Simple']),
  W('Dagger', 5, 'Piercing', 'Bladed Weapons', 0, ['Parrying', 'Quick']), W('Flail', 30, 'Bludgeoning', 'Bludgeoning Weapons', 5, ['Powerful']),
  W('Glaive', 15, 'Slashing', 'Shafted Weapons', 5, ['Two-Handed']), W('Great Axe', 50, 'Slashing', 'Bladed Weapons', 5, ['Two-Handed']),
  W('Greatclub', 20, 'Bludgeoning', 'Bludgeoning Weapons', 5, ['Two-Handed']), W('Great Sword', 80, 'Slashing', 'Bladed Weapons', 0, ['Two-Handed', 'Parrying']),
  W('Halberd', 15, 'Slashing', 'Shafted Weapons', 5, ['Two-Handed']), W('Hatchet', 5, 'Slashing', 'Bladed Weapons', 5, ['Simple']),
  W('Improvised Weapon', 1, 'Bludgeoning', 'Shafted Weapons', 5, ['Two-Handed']), W('Knuckles', 5, 'Bludgeoning', 'Unarmed Combat & Fist Weapons', 0, ['Simple', 'Quick']),
  W('Light Hammer', 5, 'Bludgeoning', 'Bludgeoning Weapons', 5, ['Defensive']), W('Longsword', 20, 'Slashing', 'Bladed Weapons', 0, ['Parrying', 'Versatile']),
  W('Maul', 20, 'Bludgeoning', 'Bludgeoning Weapons', 0, ['Two-Handed', 'Simple']), W('Mace', 15, 'Bludgeoning', 'Bludgeoning Weapons', 5, ['Simple']),
  W('Morningstar', 15, 'Bludgeoning', 'Bludgeoning Weapons', 5, ['Powerful']), W('Pike', 10, 'Piercing', 'Shafted Weapons', 5, ['Two-Handed']),
  W('Quarterstaff', 5, 'Bludgeoning', 'Shafted Weapons', 0, ['Parrying', 'Two-Handed']), W('Rapier', 30, 'Piercing', 'Bladed Weapons', 0, ['Parrying', 'Quick']),
  W('Saber', 20, 'Slashing', 'Bladed Weapons', 5, ['Parrying']), W('Shortsword', 15, 'Slashing', 'Bladed Weapons', 0, ['Parrying', 'Defensive']),
  W('Spear', 10, 'Piercing', 'Shafted Weapons', 0, ['Defensive', 'Versatile']), W('Sword Gauntlet', 10, 'Piercing', 'Unarmed Combat & Fist Weapons', 5, ['Defensive']),
  W('Warhammer', 25, 'Bludgeoning', 'Bludgeoning Weapons', 0, ['Powerful', 'Versatile']), W('War Pick', 15, 'Piercing', 'Bludgeoning Weapons', 5, ['Powerful']),
];
export const weaponByName = (n) => WEAPONS.find((w) => w.name.toLowerCase() === String(n).toLowerCase());
// a weapon as the hero wields it
export function wieldable(w, extra = {}) {
  const t = w.traits || [];
  return { name: w.name, dmg: 'd6', speed: w.speed, skill: w.skill, dtype: w.dtype, parry: t.includes('Parrying'), traits: t,
    plus: (t.includes('Powerful') ? 1 : 0) + (t.includes('Two-Handed') ? 2 : 0), simple: t.includes('Simple'), quick: t.includes('Quick'), twoHanded: t.includes('Two-Handed'), versatile: t.includes('Versatile'), defensive: t.includes('Defensive'), cost: w.cost, ...extra };
}

// ---- armour and shields (pp. 210-211). Integrity is a die: after a fight it saw use, 1-2 steps it down ----
export const TORSO = [['Heavy Cloth', 40, 1, 6, 5], ['Soft Leather', 60, 1, 8, 5], ['Hide Scale', 75, 2, 8, 10], ['Laminar', 100, 2, 8, 15], ['Rigid Leather', 125, 2, 8, 15], ['Mail', 150, 2, 8, 15], ['Metal Scale', 150, 2, 10, 20], ['Brigandine', 175, 3, 10, 20], ['Plate', 200, 3, 12, 20]]
  .map(([name, cost, prot, integ, man]) => ({ name, cost, prot, integ, man, part: 'Torso' }));
const PIECE = [['Light', 20, 1, 6], ['Medium', 40, 2, 8], ['Heavy', 60, 3, 10]];
export const VAMBRACES = PIECE.map(([w, cost, prot, integ]) => ({ name: `${w} Vambraces`, cost, prot, integ, part: 'Arms' }));
export const GREAVES = PIECE.map(([w, cost, prot, integ]) => ({ name: `${w} Greaves`, cost, prot, integ, part: 'Legs' }));
export const HELMETS = PIECE.map(([w, cost, prot, integ], i) => ({ name: `${w} Helmet`, cost, prot, integ, part: 'Head', per: [5, 10, 15][i] }));
export const SHIELDS = [['Target', 20, 5, 6], ['Normal', 40, 10, 8], ['Full', 60, 15, 8], ['Wall', 100, 20, 8]].map(([w, cost, parry, integ]) => ({ name: `${w} Shield`, cost, parry, integ, part: 'Shield', heavy: w === 'Wall' }));
export const ARMOURS = [...TORSO, ...VAMBRACES, ...GREAVES, ...HELMETS, ...SHIELDS];
export const armourByName = (n) => ARMOURS.find((a) => a.name.toLowerCase() === String(n).toLowerCase());
// found armour starts one Integrity step below its best (p. 83)
const CHAIN = [4, 6, 8, 10, 12];
export const stepDie = (d, by = -1) => CHAIN[Math.max(0, Math.min(CHAIN.length - 1, CHAIN.indexOf(d) + by))];
export const foundArmour = (a) => ({ ...a, die: stepDie(a.integ, -1) });

// ---- common gear (p. 212) ----
export const GEAR = [
  ['Backpack', 500, 'Normal', 'Increases carrying capacity by 20 item slots. Can only equip 1.'], ['Bandage', 10, 'Light', 'Heals D4 Toughness with a successful Medicine check.'],
  ['Bedroll', 200, 'Heavy', 'Grants +1 to the Camp Check.'], ['Belt', 1000, 'Normal', 'Up to 4 items in your Belt quickslots, used as a Free Action.'],
  ['Belt Lamp', 1500, 'Normal', 'Attaches to a Belt, taking one slot. Needs Lamp Oil. Leaves your hands free.'], ['Candle', 2, 'Light', 'A lightsource for 10 rooms.'],
  ['Crowbar', 50, 'Normal', '+10 Athletics when breaking down a container or door.'], ['Flare', 20, 'Light', 'Thrown into a room or corridor, it lights it.'],
  ['Lamp', 200, 'Normal', 'A lightsource for 20 rooms on its oil. Needs Lamp Oil.'], ['Lamp Oil', 5, 'Light', 'Fuel for a Lamp.'],
  ['Lockpick', 5, 'Light', 'Needed to open locks; one breaks on each failed attempt.'], ['Pouch', 100, 'Normal', 'Increases carrying capacity by 5 item slots. Up to 3.'],
  ['Ration', 5, 'Light', 'Food. Setting Camp eats one.'], ['Ritual Ingredient', 10, 'Light', 'Required by Ritualists.'],
  ["Thieves' Toolkit", 200, 'Normal', 'Needed to disarm traps. +5 to Thievery.'], ['Torch', 10, 'Light', 'A lightsource for 20 rooms.'],
].map(([name, cost, weight, t]) => ({ name, cost, weight, t }));
export const gearByName = (n) => GEAR.find((g) => g.name.toLowerCase() === String(n).toLowerCase());

// counted supplies live on hero.items; everything else becomes a thing in the pack
const COUNTED = { 'Crafting Supplies': 'crafting', 'Cooking Ingredients': 'cooking', Bandage: 'bandages', Candle: 'candles', 'Lamp Oil': 'oil', Lockpick: 'lockpicks', Flare: 'flares', 'Ritual Components': 'ritual', 'Ritual Ingredient': 'ritual', Ration: 'rations', Torch: 'torches', 'Attunement Crystal': 'crystals' };
export const countedKey = (name) => COUNTED[name];

// ---- making things ----
export function makeWeapon(v = rnd(100)) {
  const r = row('RANDOM WEAPON', v); if (/Magic weapon/.test(r.t)) return { ...makeMagic('Weapon'), roll: v };
  const w = weaponByName(r.t); return { id: uid(), kind: 'weapon', name: w.name, base: w.name, roll: v, t: `${w.dtype}, ${w.skill}, Speed ${w.speed}. ${w.traits.join(', ')}.`, page: 208 };
}
export function makeArmour(v10 = rnd(10), v100 = rnd(100)) {
  const kind = row('RANDOM ARMOR', v10).t;
  if (kind === 'Torso') { const r = row('TORSO ARMOR (PAGE 211)', v100); if (/Magic/.test(r.t)) return makeMagic('Armor'); const a = TORSO.find((x) => x.name === r.t); return armourItem(a); }
  if (kind === 'Shield') { const r = row('SHIELDS (PAGE 210)', v100); return armourItem(SHIELDS.find((x) => x.name.startsWith(r.t))); }
  const weight = row('VAMBRACES, GREAVES & HELMETS (PAGES 210-211)', v100).t;
  const list = kind === 'Vambraces' ? VAMBRACES : kind === 'Greaves' ? GREAVES : HELMETS;
  return armourItem(list.find((x) => x.name.startsWith(weight)));
}
const armourItem = (a) => ({ id: uid(), kind: 'armour', name: a.name, base: a.name, part: a.part, die: stepDie(a.integ, -1), t: a.part === 'Shield' ? `Parry +${a.parry}. Integrity D${a.integ} at its best.` : `Protection ${a.prot} (${a.part}). Integrity D${a.integ} at its best.${a.man ? ` Maneuverability -${a.man}.` : ''}${a.per ? ` Perception -${a.per}.` : ''}`, page: a.part === 'Torso' || a.part === 'Arms' || a.part === 'Legs' ? 211 : 210 });
export const makePotion = () => ({ id: uid(), kind: 'potion', name: 'Unknown potion', known: false, t: 'A stoppered vial. A Medicine check tells you what it is; otherwise you can only drink it and see.', page: 126 });
export const makeFragment = (v = rnd(20)) => ({ id: uid(), kind: 'fragment', name: `Fragment: ${row('FRAGMENTS', v).t.split(/[.,]/)[0].replace(/^An? /, '')}`, roll: v, t: row('FRAGMENTS', v).t, page: 214 });
export function makeMagic(type = null) {
  const d8 = rnd(8); const it = type || row('ITEM', d8).t.split(' (')[0];
  const rr = rnd(10); const rarity = row('ITEM RARITY', rr).t.split(':')[0];
  const props = rarity === 'Uncommon' ? 1 : rarity === 'Rare' ? 2 : 3;
  let base = null; let name = it;
  if (it === 'Weapon') { let r; do r = row('RANDOM WEAPON', rnd(100)); while (/Magic/.test(r.t)); base = r.t; name = r.t; }
  if (it === 'Armor') { let a; do a = makeArmour(); while (a.kind !== 'armour'); base = a.name; name = a.name; }
  if (it === 'Amulet') { const m = rnd(20); const mastery = row('RANDOM MASTERY', m).t; return { id: uid(), kind: 'amulet', name: `Amulet of the ${mastery}`, mastery, roll: m, t: `Grants the ${mastery} Mastery as a third Mastery, its Feature at once. Swap amulets only at Camp.`, page: 222 }; }
  const pec = row('MAGIC ITEM PECULIARITY', rnd(100)).t;
  return { id: uid(), kind: 'magic', name: `${rarity} ${name}`, type: it, base, rarity, props, attuned: false, found: Date.now(), peculiar: pec, t: `A magic ${it.toLowerCase()} (${rarity}: ${props} Magic Propert${props > 1 ? 'ies' : 'y'}). Until you attune to it at Camp with an Attunement Crystal it behaves as an ordinary one. ${pec}`, page: 224 };
}
export const makeRelic = (v = rnd(20)) => { const r = RELICS[v - 1]; return { id: uid(), kind: 'relic', name: r.name, type: r.type, powers: r.powers, roll: v, t: `${r.type}.`, desc: r.desc, page: 234 }; };
export const makeLore = (v = rnd(10)) => { const r = row('LORE BOOKS', v); return { id: uid(), kind: 'lore', name: r.t.split(/[.“"]/)[0].trim(), roll: v, t: r.t, page: 216 }; };
export const gemsWorth = (v = rnd(20)) => { const r = row('GEMS & JEWELRY', v); const m = r.t.match(/(\d*)D100/); return { v, name: r.t.split(' - ')[0], coins: roll(`${m[1] || 1}d100`) }; };
const gearItem = (name) => { const g = gearByName(name); return { id: uid(), kind: 'gear', name, t: g?.t || '', weight: g?.weight || 'Normal', page: 212 }; };

// a thing found: counted supplies go on the hero's tallies, the rest into the pack. Returns a short phrase.
export function grant(h, what) {
  h.items = h.items || {}; h.pack = h.pack || [];
  if (what.count) { const k = countedKey(what.count.name); h.items[k] = (h.items[k] || 0) + what.count.n; return `${what.count.n} ${what.count.name}`; }
  if (what.coins) { h.items.coins = (h.items.coins || 0) + what.coins; h.stats = h.stats || {}; h.stats.coinsEver = (h.stats.coinsEver || 0) + what.coins; return `${what.coins} coins`; }
  h.pack.push(what.item); return what.item.name;
}
// Mundane Items (D100, p. 213)
function mundane(v) {
  const r = row('MUNDANE ITEMS', v); const t = r.t;
  let m;
  if ((m = t.match(/^D(\d+) (.+)$/))) return { count: { name: m[2], n: roll(`d${m[1]}`) } };
  if ((m = t.match(/^1x (.+)$/))) return { count: { name: m[1], n: 1 } };
  if (/^Gems/.test(t)) { const g = gemsWorth(); return { coins: g.coins, gem: g.name };  }
  if (t === 'Lore Book') return { item: makeLore(), lore: true };
  if (t === 'Random Armor') return { item: makeArmour() };
  if (t === 'Random Weapon') return { item: makeWeapon() };
  return { item: gearItem(t) };
}
const valuable = (v) => { const t = row('VALUABLE ITEMS', v).t; if (/Potion/.test(t)) return { item: makePotion() }; if (/Crystal/.test(t)) return { count: { name: 'Attunement Crystal', n: 1 } }; if (/Fragment/.test(t)) return { item: makeFragment() }; return { item: makeMagic() }; };
const precious = (v) => (row('PRECIOUS ITEMS', v).t === 'Relic' ? { item: makeRelic(), relic: true } : { item: makeMagic() });

// what a slain creature leaves (Spoils column of its stat block); also used by events that say "roll on the Spoils table"
export function rollSpoils(h, which = 'Spoils table') {
  const lines = [];
  const take = (label, die, v, what) => { const name = grant(h, what); lines.push(`${label} ${die} ${v}: ${what.gem ? `${what.gem} gems worth ` : ''}${name}`); if (what.lore) { h.vit.xp += 10; h.stats = h.stats || {}; h.stats.lore = (h.stats.lore || 0) + 1; lines.push('+10 XP for the Lore Book'); } if (what.relic) { h.stats = h.stats || {}; h.stats.relics = (h.stats.relics || 0) + 1; } };
  if (/Resources/.test(which)) {
    const v = rnd(10); const t = row('RESOURCES', v).t;
    if (/nothing/.test(t)) lines.push(`Resources D10 ${v}: nothing of value`); else take('Resources', 'D10', v, { count: { name: /Cooking/.test(t) ? 'Cooking Ingredients' : 'Crafting Supplies', n: 1 } });
    return lines;
  }
  if (/Valuable/.test(which) && /Precious/.test(which)) { const a = rnd(20); take('Valuable', 'D20', a, valuable(a)); const b = rnd(20); take('Precious', 'D20', b, precious(b)); return lines; }
  if (!which) return lines;
  const d6 = rnd(6);
  if (d6 <= 3) { const v = rnd(100); take(`Spoils D6 ${d6}, Mundane`, 'D100', v, mundane(v)); }
  else if (d6 <= 5) { const v = rnd(20); take(`Spoils D6 ${d6}, Valuable`, 'D20', v, valuable(v)); }
  else { const v = rnd(20); take(`Spoils D6 ${d6}, Precious`, 'D20', v, precious(v)); }
  return lines;
}
// Container Loot (D20, p. 220)
export function containerLoot(h, v = rnd(20)) {
  const t = row('CONTAINER LOOT', v).t; let what; let m;
  if (/^Rotten/.test(t)) return [`Container D20 ${v}: ${t}.`];
  if ((m = t.match(/^D(\d+) (.+)$/))) what = { count: { name: m[2].replace(/s$/, '') === 'Candle' ? 'Candle' : m[2].replace(/Flares/, 'Flare'), n: roll(`d${m[1]}`) } };
  else if (t === 'Lore Book') what = { item: makeLore(), lore: true };
  else if (/^Gems/.test(t)) { const g = gemsWorth(); what = { coins: g.coins, gem: g.name }; }
  else if (t === 'Pouch' || t === 'Blank Diary') what = { item: gearItem(t) };
  else { const rel = RELICS.find((r) => r.name === t); what = { item: rel ? makeRelic(RELICS.indexOf(rel) + 1) : { id: uid(), kind: /^Vial/.test(t) ? 'vial' : 'magic', name: t, t: /^Vial of Potency - (\w+)/.test(t) ? `A permanent +D4 to your ${t.split(' - ')[1]} when drunk.` : 'A named item from the Container Loot table (p. 220); its powers are in the book.', page: 220 } }; }
  const name = grant(h, what);
  if (what.lore) { h.vit.xp += 10; h.stats = h.stats || {}; h.stats.lore = (h.stats.lore || 0) + 1; }
  return [`Container D20 ${v}: ${what.gem ? `${what.gem} gems worth ` : ''}${name}${what.lore ? ' (+10 XP)' : ''}.`];
}
// called by the engine when a fight is won
export function spoilsOf(state, slain = [], out = null, BESTIARY = null) {
  const h = state.hero; const lines = [];
  for (const name of slain) {
    const which = state.bestiarySpoils?.[name] ?? (BESTIARY && BESTIARY[name]?.spoils);
    if (!which) continue;
    lines.push(...rollSpoils(h, which).map((l) => `${name}: ${l}`));
  }
  return lines.length ? ` Spoils: ${lines.join('; ')}.` : '';
}

// ---- Potions (pp. 126, 221) ----
export const potionOf = (v) => row('POTIONS', v);
const AGING = [ // p. 126
  [2, 'poison', 'The Potion has turned into a poison. Make a successful Endurance check or become Poisoned (1).'],
  [4, 'explodes', 'The Potion has become extremely unstable and explodes the second you open it: 2D4 Force damage.'],
  [6, 'inert', 'The Potion has lost all its potency. No effect after drinking it.'],
  [10, 'weak', 'The Potion has lost some potency: its effects last half as long and work half as well.'],
  [17, 'normal', 'The Potion works as intended.'],
  [19, 'strong', 'The Potion has been refined by time: its effects last 50% longer and work twice as well.'],
  [20, 'permanent', 'The Potion has been completely enhanced, making its effects permanent.'],
];
export const agingOf = (v) => { const r = AGING.find(([hi]) => v <= hi); return { v, k: r[1], t: r[2] }; };

// ---- magic properties on attuning (pp. 226-231) ----
const PROP_TABLE = { Armor: 'ARMOR MAGIC PROPERTIES', Belt: 'BELT MAGIC PROPERTIES', Boots: 'BOOTS MAGIC PROPERTIES', Gloves: 'GLOVES MAGIC PROPERTIES', Ring: 'RING MAGIC PROPERTIES', Weapon: 'WEAPON MAGIC PROPERTIES' };
export function rollProperties(item) {
  const tbl = PROP_TABLE[item.type]; if (!tbl) return [];
  const out = [];
  for (let i = 0; i < item.props; i++) {
    const v = rnd(20); let t = row(tbl, v).t;
    if (/Damage Type table/.test(t)) { const d = rnd(20); const dt = row('DAMAGE TYPE', d).t; t = `${t} (D20 ${d}: ${dt})`; out.push({ v, t, dtype: dt }); continue; }
    if (/Enemy Type table/.test(t)) { const d = rnd(8); const et = row('ENEMY TYPE', d).t; t = `${t} (D8 ${d}: ${et})`; out.push({ v, t, etype: et }); continue; }
    out.push({ v, t });
  }
  return out;
}
const RARITY_N = { Uncommon: 0, Rare: 1, Epic: 2 };
// the properties the engine can apply by itself; the rest are shown on the sheet for you to apply
export function propEffects(item) {
  const fx = { skills: {}, resist: [], maxAether: 0, maxTough: 0, slots: 0, light: false, immune: [] };
  const r = RARITY_N[item.rarity] ?? 0;
  for (const p of item.properties || []) {
    let m;
    if ((m = p.t.match(/^Increase your (Endurance|Resolve|Spellward) by an amount based on this item's rarity/))) fx.skills[m[1]] = (fx.skills[m[1]] || 0) + [5, 10, 15][r];
    else if ((m = p.t.match(/^Increase your (Dodge|Perception|Stealth|Acrobatics|Athletics|Thievery|Medicine|Reason|Scavenge) by (\d+)/))) fx.skills[m[1]] = (fx.skills[m[1]] || 0) + Number(m[2]);
    else if (/^Reduce your max Aether by 5, but increase your max Toughness by 10/.test(p.t)) { fx.maxAether -= 5; fx.maxTough += 10; }
    else if (/^Reduce your max Toughness by 5, but increase your max Aether by 10/.test(p.t)) { fx.maxTough -= 5; fx.maxAether += 10; }
    else if (p.dtype && /Resistant to that damage type/.test(p.t)) fx.resist.push(p.dtype);
    else if (/works as a lightsource/.test(p.t)) fx.light = true;
    else if ((m = p.t.match(/carrying capacity by (\d+)/))) fx.slots += Number(m[1]);
    else if ((m = p.t.match(/Immune to (\w+)\.?$/))) fx.immune.push(m[1]);
  }
  return fx;
}

// ---- carrying (p. 206): 10 slots, a Backpack +20, Pouches +5 each (up to 3); Heavy items take 2, Light bundle in 10s ----
export function encumbrance(h) {
  const it = h.items || {}; const pack = h.pack || [];
  const light = ['rations', 'torches', 'crafting', 'cooking', 'bandages', 'lockpicks', 'candles', 'flares', 'oil', 'ritual', 'crystals'].reduce((t, k) => t + (it[k] || 0), 0)
    + pack.filter((x) => ['potion', 'fragment', 'vial'].includes(x.kind) || (x.kind === 'magic' && x.type === 'Ring') || x.kind === 'amulet').length;
  let used = Math.ceil(light / 10) + Math.ceil((it.coins || 0) / 100);
  for (const x of pack) {
    if (x.equipped || ['potion', 'fragment', 'vial', 'amulet', 'lore'].includes(x.kind) || (x.kind === 'magic' && x.type === 'Ring')) continue;
    const heavy = x.weight === 'Heavy' || (x.kind === 'weapon' && weaponByName(x.base)?.traits.includes('Two-Handed')) || /Wall Shield/.test(x.name);
    used += heavy ? 2 : 1;
  }
  const backpack = pack.some((x) => x.name === 'Backpack') ? 20 : 0;
  const pouches = Math.min(3, pack.filter((x) => x.name === 'Pouch').length) * 5;
  const extra = (h.gearFx?.slots || 0);
  return { used, cap: 10 + backpack + pouches + extra, backpack, pouches };
}
// a Trader's prices (p. 127): they pay half for ordinary things, a fixed price for magic by rarity; Amulets are not bought
export function priceOf(x) {
  if (x.kind === 'relic') return 1000;
  if (x.kind === 'magic') return { Uncommon: 200, Rare: 400, Epic: 600 }[x.rarity] || 200;
  if (x.kind === 'amulet') return 0;
  const base = weaponByName(x.base || x.name)?.cost ?? armourByName(x.base || x.name)?.cost ?? gearByName(x.name)?.cost ?? 0;
  return Math.floor(base / 2);
}
export const FOR_SALE = [
  ...WEAPONS.map((w) => ({ kind: 'weapon', name: w.name, cost: w.cost })), ...ARMOURS.map((a) => ({ kind: 'armour', name: a.name, cost: a.cost })),
  ...GEAR.map((g) => ({ kind: 'gear', name: g.name, cost: g.cost })), { kind: 'count', name: 'Attunement Crystal', cost: 50 }, { kind: 'count', name: 'Cooking Ingredients', cost: 5 }, { kind: 'count', name: 'Crafting Supplies', cost: 5 },
];
export { armourItem, gearItem };
