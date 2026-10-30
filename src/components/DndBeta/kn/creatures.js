// Every creature in the Gravebound Edition bestiary (chapter V, pp. 131-203), read from the book by
// scripts/extract_kn_bestiary.py + normalise_kn_bestiary.py into bestiary.json, and the rules that turn a stat block
// into a fight: Level Adaptation (p. 131), hit locations and Weak Spots (p. 80), damage types and Armor (p. 82),
// creature types (pp. 130-131), traits (pp. 132-133), the Combat Encounter tables (pp. 133-134) and the Overseer's
// Influence on its Domain (p. 98).
import RAW from './bestiary.json';

// two ligatures the PDF lost survive in the text; mend them on load
const BEST = JSON.parse(JSON.stringify(RAW).replace(/([a-z])`([a-z])/g, '$1f$2').replace(/ and lesh\b/g, ' and flesh'));

// actions the text reader got wrong, put right by hand from the book (audit of 30 Oct 2026)
const ACTION_FIX = {
  'Rage Unleashed': { manual: true, conds: [], tag: null, dmg: null },
  'Stone Spike': { dmg: 'd6', dtype: 'Bludgeoning' }, // the book says "Earth", which is not a damage type; stone strikes as Bludgeoning
  'Putrid Eruption': { area: true, weaponMinus: 5 },
  'Eruption of Flame': { area: true },
  'Ensnaring Thorns': { area: true },
};
for (const c of BEST) for (const a of c.actions || []) if (ACTION_FIX[a.name]) Object.assign(a, ACTION_FIX[a.name]);
export const BESTIARY = Object.fromEntries(BEST.map((c) => [c.name, c]));
export const CREATURE_NAMES = BEST.filter((c) => !c.summoned).map((c) => c.name).sort();

// ---- hit locations (p. 80) ----
export const HIT_TABLES = {
  Humanoid: [[3, 'Right Leg'], [6, 'Left Leg'], [9, 'Abdomen'], [12, 'Chest'], [15, 'Left Arm'], [18, 'Right Arm'], [20, 'Head']],
  Quadruped: [[3, 'Right Hind Leg'], [6, 'Left Hind Leg'], [9, 'Hindquarters'], [12, 'Forequarters'], [15, 'Right Front Leg'], [18, 'Left Front Leg'], [20, 'Head']],
  Insectoid: [[1, 'Right Rear Leg'], [2, 'Left Rear Leg'], [3, 'Right Middle Leg'], [4, 'Left Middle Leg'], [9, 'Abdomen'], [13, 'Thorax'], [14, 'Right Front Leg'], [15, 'Left Front Leg'], [20, 'Head']],
  Arachnid: [[2, 'Right Rear Leg'], [4, 'Left Rear Leg'], [6, 'Mid Right Leg'], [8, 'Mid Left Leg'], [10, 'Fore Right Leg'], [12, 'Fore Left Leg'], [14, 'Abdomen'], [16, 'Front Right Leg'], [18, 'Front Left Leg'], [20, 'Cephalothorax']],
  'Winged Biped': [[1, 'Right Leg'], [2, 'Left Leg'], [3, 'Abdomen'], [4, 'Chest'], [9, 'Right Wing'], [13, 'Left Wing'], [14, 'Right Arm'], [15, 'Left Arm'], [20, 'Head']],
  Serpentoid: [[17, 'Body'], [20, 'Head']],
};
// a creature with no Hit Location table (oozes, swarms) is struck on its body, with no Weak Spot
export function hitLocation(anatomy, d20, weak = 'Head') {
  const t = HIT_TABLES[anatomy];
  if (!t) return { name: 'Body', weak: false, none: true };
  const row = t.find(([max]) => d20 <= max);
  return { name: row[1], weak: Boolean(weak) && row[1] === weak };
}
export const rangeOf = (anatomy, loc) => {
  const t = HIT_TABLES[anatomy]; if (!t) return null;
  const i = t.findIndex((r) => r[1] === loc); if (i < 0) return null;
  const lo = i ? t[i - 1][0] + 1 : 1, hi = t[i][0];
  return lo === hi ? `${lo}` : `${lo}-${hi}`;
};

// ---- damage types (p. 82) ----
export const IGNORE_ARMOR = ['Arcane', 'Cold', 'Fire', 'Force', 'Holy', 'Infernal', 'Lightning', 'Necrotic', 'Psychic', 'Poison'];
export const PHYSICAL = ['Bludgeoning', 'Piercing', 'Slashing'];
// creature types (pp. 130-131): how damage and conditions treat them
const TYPE_RULES = {
  Undead: { vuln: ['Holy'], restored: ['Necrotic'], immuneConds: ['Bleeding', 'Sickened', 'Poisoned', 'Frightened'] },
  Demon: { vuln: ['Holy'], restored: ['Infernal'], immuneConds: ['Poisoned'] },
  Construct: { immuneConds: ['Charmed', 'Poisoned', 'Bleeding', 'Sickened', 'Frightened', 'Sleeping'] },
  Astral: { immuneConds: ['Bleeding', 'Poisoned', 'Sickened', 'Frightened'] },
  Elemental: { immuneConds: ['Bleeding', 'Sickened', 'Poisoned'] },
  Plant: { vuln: ['Fire'], immuneConds: ['Frightened', 'Blinded'] },
};
// what a creature's type and its own notes say about each damage type and condition
export function defencesOf(c) {
  const d = { vuln: [], resist: [], immune: [], restored: [], immuneConds: [], resistPhysical: false };
  for (const t of c.type || []) {
    const r = TYPE_RULES[t]; if (!r) continue;
    d.vuln.push(...(r.vuln || [])); d.restored.push(...(r.restored || [])); d.immuneConds.push(...(r.immuneConds || []));
  }
  for (const s of c.special || []) {
    let m;
    if ((m = s.match(/^Elemental Affinity: (\w+)/))) d.restored.push(m[1]);
    else if ((m = s.match(/^Restored by (\w+)/))) d.restored.push(m[1]);
    else if ((m = s.match(/^Vulnerable to (\w+)/))) d.vuln.push(m[1]);
    else if ((m = s.match(/^Resistant to (\w+) damage/))) d.resist.push(m[1]);
    else if ((m = s.match(/^Immune to (\w+) damage/))) d.immune.push(m[1]);
    else if (/Resistant to all Physical, non-Magical/.test(s)) d.resistPhysical = true;
  }
  d.vuln = d.vuln.filter((x) => !d.restored.includes(x));
  return d;
}

// ---- the Overseer's Influence on its Domain (p. 98, D10) ----
export const INFLUENCE = [null,
  { name: 'Tough', t: 'Domain creatures are immune to Critical Strikes.' },
  { name: 'Vital', t: 'Domain creatures gain +D6 Health for every 5 levels you have.' },
  { name: 'Frenzied', t: 'Domain creatures deal +1 damage.' },
  { name: 'Skilled', t: 'Domain creatures gain +10 Combat Skill.' },
  { name: 'Magebane', t: 'Domain creatures gain +10 Magic Resistance.' },
  { name: 'Resistant', t: 'Domain creatures are Resistant to one damage type.' },
  { name: 'Corrupting', t: 'When a Domain creature deals you 5 or more damage, pass a Resolve check or lose 1 Sanity.' },
  { name: 'Unstable', t: 'A Domain creature deals 1 Arcane damage to you when it dies.' },
  { name: 'Alert', t: 'Domain creatures gain +20 Mind.' },
  { name: 'Piercing', t: 'Domain creatures gain Penetrating (1).' },
];
const RESIST_PICK = ['Bludgeoning', 'Piercing', 'Slashing', 'Fire', 'Cold', 'Lightning', 'Necrotic', 'Arcane', 'Poison', 'Psychic'];
export const influenceResist = (seed) => RESIST_PICK[Math.abs(seed || 0) % RESIST_PICK.length];

// ---- a stat block adapted to the hero's level (p. 131) and the Domain's Influence ----
const ADJ_TRAIT = (traits, t) => {
  const old = traits.find((x) => x.name === t.name);
  if (old && t.n) old.n = Math.max(old.n || 0, t.n); else if (!old) traits.push({ ...t });
};
export function statOf(name, level = 1, influence = null) {
  const b = BESTIARY[name]; if (!b) return null;
  const s = { ...b, traits: b.traits.map((t) => ({ ...t })), armor: { ...b.armor }, dmgDice: [], armorPlus: [], adapted: [] };
  s.health = b.health + b.healthPerLevel * level;
  for (const l of b.level) {
    if (level < l.at) continue;
    s.health += l.health; s.combat += l.combat; s.magicRes += l.magicRes; s.mind += l.mind;
    s.dmgDice.push(...l.dmg.map((x) => x.toLowerCase()));
    l.traits.forEach((t) => ADJ_TRAIT(s.traits, t));
    for (const n of l.notes) {
      let m;
      if ((m = n.match(/^\+(\d+) Armor \(all Hit Locations(?: except (.+))?\)/))) s.armorPlus.push({ n: Number(m[1]), except: m[2] || null });
      else if ((m = n.match(/^(\d+) Health/))) s.health += Number(m[1]);
    }
    s.adapted.push(l.at);
  }
  if (influence && !b.overseer) {
    const r = influence.roll;
    s.influence = INFLUENCE[r]?.name;
    if (r === 2) s.health += Math.floor(level / 5) * 3; // +D6 per 5 levels, taken as its average so every copy matches
    if (r === 4) s.combat += 10;
    if (r === 5) s.magicRes += 10;
    if (r === 9) s.mind += 20;
    if (r === 10) ADJ_TRAIT(s.traits, { name: 'Penetrating', n: 1 });
  }
  s.def = defencesOf(s);
  if (influence && !b.overseer && influence.roll === 6) s.def.resist.push(influence.resist || influenceResist(influence.seed));
  return s;
}
export const traitOf = (s, name) => s.traits.find((t) => t.name === name);
export const traitText = (t) => (t.n ? `${t.name} (${t.n})` : t.name);
export const armorAt = (s, loc, down = {}) => {
  let a = s.armor[loc] ?? s.armor['*'] ?? 0;
  for (const p of s.armorPlus || []) if (p.except !== loc) a += p.n;
  return Math.max(0, a - (down[loc] || 0));
};
export const groupSize = (b) => (typeof b.number === 'number' ? b.number : null);

// ---- damage after Armor and defences (p. 82). Used for both sides. ----
// target: { armor: n, def: defencesOf(), buffs: [...] }; returns { net, notes, heal }
export function damageAfter(n, dtype, { armor = 0, crit = false, penetrating = 0, def = null, magical = false, buffs = [] } = {}) {
  const notes = []; let dmg = n;
  if (dtype === 'Piercing' && crit) { dmg += 2; notes.push('Piercing Critical +2'); }
  let a = IGNORE_ARMOR.includes(dtype) ? 0 : armor;
  if (armor && IGNORE_ARMOR.includes(dtype)) notes.push(`${dtype} ignores Armor`);
  if (dtype === 'Bludgeoning' && a) { a -= 1; notes.push('Bludgeoning ignores 1 Armor'); }
  if (penetrating && a) { const p = Math.min(a, penetrating); a -= p; notes.push(`Penetrating ${p}`); }
  let net = Math.max(0, dmg - a);
  if (a) notes.push(`${a} Armor`);
  if (dtype === 'Slashing' && net > 0 && net <= 3) { net += 1; notes.push('Slashing +1'); }
  if (def) {
    const all = [...buffs];
    const immune = def.immune.includes(dtype) || all.some((b) => b.immune && (b.immune === '*' ? true : b.immune === 'nonmagical' ? !magical : b.immune.includes(dtype)));
    if (def.restored.includes(dtype)) { notes.push(`restored by ${dtype}`); return { net: 0, heal: net, notes }; }
    if (immune) { notes.push(`immune to ${dtype}`); return { net: 0, notes }; }
    const vuln = def.vuln.includes(dtype) || all.some((b) => b.vuln === '*');
    const resist = def.resist.includes(dtype) || (def.resistPhysical && PHYSICAL.includes(dtype) && !magical)
      || all.some((b) => b.resist && (b.resist === '*' || (Array.isArray(b.resist) && b.resist.includes(dtype)) || (b.resist.except && !b.resist.except.includes(dtype))));
    if (vuln && !resist) { net *= 2; notes.push(`vulnerable to ${dtype}, doubled`); }
    else if (resist && !vuln) { net = Math.floor(net / 2); notes.push(`resistant to ${dtype}, halved`); }
  }
  return { net, notes };
}

// ---- Combat Encounter tables (pp. 133-134): D6 picks Table A (1-3) or B (4-6), then D20 ----
export const TABLE_A = ['Abyssal Vexator', 'Amalgam', 'Armor Construct', 'Astral Beast', 'Bladewings', 'Blood Stalker', 'Bone Golem', 'Bone Spiders', 'Cavebound Leech', 'Corpse Ants', 'Death Sage', 'Desiccated Cryptguards', 'Dwerax', 'Fangvine', 'Flayed Knight', 'Fleshmelt Slime', 'Giant Spider', 'Hive Larvae', 'Hive Warrior', 'Hollow Shambler'];
export const TABLE_B = ['Living Moss', 'Necropede', 'Netherfiend', 'Plaguebringer', 'Pyreborn', 'Ratkin Marauders', 'Razorjaw', 'Reanimated Homunculus', 'Rotwalkers', 'Stone Warden', 'Swarmer', 'Tomb Crawler', 'Umbra Fiend', 'Unfettered Familiar', 'Vaelorian Magus', 'Vinekin', 'Voidweaver', 'Vorleg', 'Wraithskull', 'Wrath Elemental'];
// The First Domain has its own table (p. 244): Blightfang Rats 1-7, Skeletal Horrors 8-14, Flesh Eater 15-20
export const FIRST_DOMAIN = [[7, 'Blightfang Rats'], [14, 'Skeletal Horrors'], [20, 'Flesh Eater']];
export function encounterFor(domainN, d6, d20) {
  if (domainN <= 1) return { name: FIRST_DOMAIN.find(([max]) => d20 <= max)[1], table: 'First Domain', d20, page: 244 };
  const t = d6 <= 3 ? TABLE_A : TABLE_B;
  return { name: t[d20 - 1], table: d6 <= 3 ? 'Table A' : 'Table B', d6, d20, page: d6 <= 3 ? 133 : 134 };
}
// a name the bestiary does not know (an old save) falls back to the nearest one
export const known = (name) => (BESTIARY[name] ? name : CREATURE_NAMES.find((n) => n.toLowerCase().startsWith(String(name || '').toLowerCase().slice(0, 5))) || 'Flesh Eater');

// ---- actions the stat blocks describe in words only: what each does to the fight ----
// buff: on the creature until its next turn (`turns` rounds); others act on the fight itself
export const SPECIAL_ACTIONS = {
  'Arcane Shield': { temp: 'halfMax', t: 'gains Temporary Health equal to half its maximum Health' },
  'Nebula Shield': { buff: { resist: '*' }, t: 'is Resistant to all damage until its next turn' },
  'Shadow Dive': { buff: { defence: 10 }, t: '+10 to its defensive checks until its next turn' },
  'Blood Frenzy': { t: 'readies a follow-up strike; you are alone, so it has no second target' },
  Rally: { rally: true, t: 'all of its kind gain +10 Combat Skill until the next round' },
  'Distorted Lurch': { buff: { combat: 5 }, turns: 'd4', t: '+5 Combat Skill for D4 rounds' },
  Alarm: { alarm: true, t: 'raises a horn to sound the alarm: Thievery to stop it, or a Tension Die check' },
  'Evasive Shadows': { buff: { disadv: true }, t: 'your attacks against it have Disadvantage until its next turn' },
  'Eldritch Enfeeblement': { curse: true, t: 'your next attack or check has Disadvantage' },
  'Ethereal Phantasm': { buff: { immune: 'nonmagical' }, t: 'is Immune to non-magical damage until its next turn' },
  'Elemental Fury': { fury: true, t: 'D6: cone of fire (1-2), line of lightning (3-4) or crashing water (5-6)' },
  'Infernal Resilience': { temp: 'halfCurrent', cap: 2, t: 'gains Temporary Health equal to half its current Health' },
  'Shroud of Darkness': { buff: { resist: { except: ['Holy'] } }, t: 'is Resistant to all damage except Holy until its next turn' },
  'Rage Unleashed': { buff: { adv: true, extra: 'd6' }, turns: 2, t: 'Advantage on attacks and +D6 damage for 2 rounds; it cannot be Frightened or Charmed' },
  'Bloodlust Frenzy': { buff: { adv: true, extra: 'd6', vuln: '*' }, t: 'Advantage on attacks, +D6 damage, and Vulnerable to all damage until its next turn' },
  'Endurance Surge': { buff: { resist: ['Bludgeoning', 'Piercing', 'Slashing'] }, turns: 2, t: 'Resistant to Bludgeoning, Piercing and Slashing for 2 rounds' },
  'Shadow Veil': { buff: { defenceAdv: true }, turns: 2, t: 'Advantage on its defensive checks until the end of its next turn' },
  'Demonic Conjuration': { summon: 'Lesser Demon', dice: 'd4', max: 4, t: 'summons D4 Lesser Demons (at most 4 at once)' },
  'Infernal Shapechange': { buff: { immune: ['Fire'], resist: ['Bludgeoning', 'Piercing', 'Slashing'] }, turns: 2, t: 'Immune to Fire and Resistant to Bludgeoning, Piercing and Slashing for 2 rounds' },
  'Burning Urge': { tension: true, t: 'makes a Tension Die check' },
  'Illusory Mirage': { buff: { disadv: true }, turns: 2, t: 'your attacks against it have Disadvantage until the end of its next turn' },
  'Shadow Cloak': { buff: { disadv: true, resist: { except: ['Arcane'] } }, t: 'your attacks have Disadvantage and it is Resistant to all damage except Arcane until its next turn' },
};
