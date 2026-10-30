// What each Mastery does in play (pp. 21-61, Minions pp. 93, 200-203), so the engine can apply it: the Features and
// passive Tiers as lasting effects, and how each active Ability resolves. The words are the book's (masteries.json);
// this file only says what each one does to the numbers.

// ---- the Minions a Mastery can raise or summon (pp. 200-203) ----
const act = (rolls, name, tag, text, extra = {}) => ({ rolls, name, tag, text, ...extra });
export const MINIONS = {
  'Arcane Companion': { name: 'Arcane Companion', page: 200, type: ['Astral'], mind: 40, endurance: 40, body: 30, health: 12, anatomy: 'Humanoid', weak: 'Head', armor: {}, combat: 40, magicRes: 80,
    actions: [act([1, 2, 3, 4], 'Arcane Bolt', 'magical', 'A bolt of aether: D6+1 Arcane damage.', { dmg: 'd6+1', dtype: 'Arcane' }),
      act([5, 6], 'Ethereal Surge', 'magical', 'A focused blast: 2D4 Arcane damage; Endurance or Blinded until the end of its next turn.', { dmg: '2d4', dtype: 'Arcane', cond: ['Blinded', 1], save: 'endurance' })] },
  'Fire Elemental': { name: 'Fire Elemental', page: 201, type: ['Elemental'], mind: 40, endurance: 60, body: 40, health: 12, anatomy: 'Humanoid', weak: 'Head', armor: {}, combat: 40, magicRes: 60, restored: ['Fire'],
    actions: [act([1, 2, 3, 4], 'Ember Blast', 'physical', 'A blast of flames: D4 Fire damage on a hit; a Body check or Burning.', { dmg: 'd4', dtype: 'Fire', cond: ['Burning', 1], save: 'body' }),
      act([5, 6], 'Firestorm', 'magical', 'A firestorm fills the room: D4 Fire damage to every foe.', { dmg: 'd4', dtype: 'Fire', area: true })] },
  'Frost Elemental': { name: 'Frost Elemental', page: 201, type: ['Elemental'], mind: 40, endurance: 60, body: 40, health: 12, anatomy: 'Humanoid', weak: 'Head', armor: {}, combat: 40, magicRes: 60, restored: ['Cold'],
    actions: [act([1, 2, 3, 4], 'Frostbite', 'magical', 'A spear of ice: D6 Cold damage.', { dmg: 'd6', dtype: 'Cold' }),
      act([5, 6], "Blizzard's Embrace", 'magical', 'A swirling blizzard: D4 Cold damage to all foes, and those that fail are Restrained.', { dmg: 'd4', dtype: 'Cold', area: true, cond: ['Restrained', 2] })] },
  Skeleton: { name: 'Skeleton', page: 202, type: ['Undead'], mind: 40, endurance: 20, body: 20, health: 4, anatomy: 'Humanoid', weak: 'Head', armor: {}, combat: 30, magicRes: 20, undead: true,
    actions: [act([1, 2, 3, 4], 'Rabid Slash', 'physical', 'A careless swing: D4 Slashing damage.', { dmg: 'd4', dtype: 'Slashing' }),
      act([5, 6], 'Ethereal Grasp', 'magical', 'D4 Necrotic damage if the target fails its Magic Resistance; the Skeleton regains 1 Health.', { dmg: 'd4', dtype: 'Necrotic', drain: 1 })] },
  Wight: { name: 'Wight', page: 203, type: ['Undead'], mind: 60, endurance: 10, body: 10, health: 10, anatomy: 'Humanoid', weak: 'Head', armor: { Chest: 2 }, combat: 40, magicRes: 60, undead: true,
    actions: [act([1, 2, 3, 4], 'Deathly Slash', 'physical', 'A swipe of pure death energy: D6 Necrotic damage.', { dmg: 'd6', dtype: 'Necrotic' }),
      act([5, 6], 'Embrace of Death', null, 'An Endurance check or D4+1 Necrotic damage.', { dmg: 'd4+1', dtype: 'Necrotic', save: 'endurance' })] },
};

// ---- the Features and passive Tiers: what they change while you follow the Mastery (tier 0 is the Feature) ----
// has(h, 'Bulwark', 0): you follow Bulwark; has(h, 'Bulwark', 5): its Tier 5 is open
export const tiersHeld = (h, name) => { const m = (h.masteries || []).find((x) => !x.borrowed && (x.name === name || String(x.name || '').startsWith(name))); return m ? (m.tiers ?? 1) : -1; };
export const has = (h, name, tier = 0) => tiersHeld(h, name) >= Math.max(tier, 1) || (tier === 0 && tiersHeld(h, name) >= 0);

// one-off changes made when a Feature or Tier is gained (and undone if it is lost: a swapped Amulet)
export function onGain(h, mastery, tier) {
  const v = h.vit;
  if (mastery === 'Umbra Phantom' && tier === 1) { v.maxSanity += 5; v.sanity += 5; }
  if (mastery === 'Abyssal Reaver' && tier === 3) { v.maxSanity = Math.max(1, v.maxSanity - 5); v.sanity = Math.min(v.sanity, v.maxSanity); }
  if (mastery === 'Bulwark' && tier === 4) { const n = h.level || 1; v.maxTough += n; v.tough += n; }
}
// on each level gained (Battle Form: +2 Toughness a level)
export function onLevel(h) { if (has(h, 'Bulwark', 4)) { h.vit.maxTough += 2; h.vit.tough += 2; } }

// lasting numbers: skill bonuses, Advantage, immunities, resistances, restoration
export function heroMods(h) {
  const m = { skills: {}, adv: [], immuneConds: [], immune: [], resist: [], restored: [], notes: [] };
  if (has(h, 'Bulwark')) m.skills.Endurance = (m.skills.Endurance || 0) + 10;
  if (has(h, 'Umbra Phantom')) m.skills.Spellward = (m.skills.Spellward || 0) + 10;
  if (has(h, 'Tracker')) m.adv.push('Scavenge', 'Perception');
  if (has(h, 'Zealot')) m.adv.push('Resolve');
  if (has(h, 'Abyssal Reaver', 3)) m.immuneConds.push('Frightened', 'Poisoned');
  if (has(h, 'Flamecaster')) m.restored.push('Fire');
  if (has(h, 'Gravecaller', 5)) m.restored.push('Necrotic');
  if (has(h, 'Bulwark', 5)) { m.immune.push('Bludgeoning'); m.resist.push('Piercing'); }
  if (has(h, 'Wrathspawn', 5)) m.resist.push('Slashing');
  if ((h.sustained || []).some((s) => s.name === 'Sanctuary')) m.skills.Spellward = (m.skills.Spellward || 0) + 20;
  if ((h.combatBuffs || []).some((b) => b.name === 'Combat Awareness')) m.skills.Acrobatics = (m.skills.Acrobatics || 0) + 20;
  return m;
}

// ---- how each active Ability resolves (the engine does the rest) ----
// spell: damage from the text (kn/progress abilityPlan); attack: a weapon attack changed as given; react: readied
// before the enemy acts; sustain: lasts while its Aether is held back; free: no Standard Action spent
export const ABILITY = {
  // Abyssal Reaver
  'Hellish Weapon': { sustain: { pool: { die: 'd6', dtype: 'Infernal' } } },
  'Demon Shroud': { buff: 'Demon Shroud' },
  'Soul Harvest': { spell: true, sanityPerHit: 2 },
  // Arcanist
  'Arcane Missiles': { spell: true, upToHalf: true, feedback: true },
  'Magic Shell': { react: 'shell', vary: { res: 'aether', label: 'Aether to pour in (1 damage soaked per 2)', min: 2, step: 2 } },
  'Create Light': { sustain: { light: true } },
  'Summon Arcane Companion': { summon: 'Arcane Companion' },
  'Arcane Bolt': { spell: true, feedback: true },
  // Brawler
  Feint: { react: 'feint' },
  Uppercut: { attack: { replaceDmg: '2d8', dtype: 'Bludgeoning', selfDefPenalty: 20 } },
  Overwhelm: { attack: { pool: ['d8'], undefendable: true, free: true, oncePerCombat: true } },
  'Kidney Shot': { attack: { onHitCond: ['Stunned', 2] } },
  // Bulwark
  Brace: { react: 'brace', exh: 2 },
  'Shield Bash': { attack: { needShield: true, noDamage: true, onHitCond: ['Dazed', 2] } },
  'Sword & Board': { attack: { needShield: true, onHitExtra: { die: 'd4', dtype: 'Bludgeoning' } } },
  // Duskblade
  'Poisoned Blade': { spell: true, cond: ['Poisoned', 1] },
  Weaken: { spell: true, debuff: { name: 'Weakened', defence: -20, rounds: 'd4+1' } },
  Sap: { attack: { bonus: -20, noDamage: true, onHitCond: ['Stunned', 2] } },
  'Ruthless Strike': { attack: { autoCrit: true, oncePerRoom: true } },
  Invisibility: { buff: 'Invisible' },
  // Emissary
  'Heal Wounds': { heal: 'd4', exh: 2 },
  'Unbreakable Faith': { free: true, nextAttack: 40 },
  'Remove Condition': { removeCond: true },
  'Divine Justice': { free: true, spell: true, debuff: { name: 'Armour negated', noArmor: true, rounds: 1 } },
  // Flamecaster
  'Flame Spray': { spell: true, upToHalf: true },
  'Fire Cage': { spell: true, debuff: { name: 'Fire Cage', cage: true, rounds: 99 }, cond: ['Restrained', 99] },
  'Summon Fire Elemental': { summon: 'Fire Elemental' },
  // Frostweaver
  'Ice Shield': { react: 'iceShield' },
  'Ice Nova': { spell: true, upToHalf: true },
  'Summon Frost Elemental': { summon: 'Frost Elemental' },
  'Frost Weapon': { sustain: { frostWeapon: true } },
  // Gravecaller
  'Raise Skeleton': { summon: 'Skeleton', corpse: true },
  'Corpse Explosion': { spell: true, corpse: true, noSave: true },
  Bloodskin: { buff: 'Bloodskin', health: 2, oncePerCombat: true },
  'Raise Wight': { summon: 'Wight' },
  // Hexmancer
  'Sap Vitality': { spell: true, debuff: { name: 'Cursed', sap: true, rounds: 99 } },
  Enfeeble: { spell: true, debuff: { name: 'Cursed', enfeebled: true, rounds: 99 }, oncePerTarget: true },
  'Curse Mind': { spell: true, curseMind: true },
  'Drain Lifeforce': { spell: true, drainHeal: true },
  'Putrefy Armor': { spell: true, debuff: { name: 'Putrefying', putrefy: true, rounds: 99 } },
  // Icon Caller
  'Restoring Icon': { icon: 'Restoring' }, 'Vine Icon': { icon: 'Vine' }, 'Firebomb Icon': { icon: 'Firebomb' }, 'Razorwind Icon': { icon: 'Razorwind' }, 'Strength Icon': { icon: 'Strength' },
  // Mindbinder
  'Suppress Mind': { free: true, spell: true, debuff: { name: 'Suppressed', noMagic: true, rounds: 1 } },
  'Heal Mind': { sanity: 'd4', oncePerRest: true },
  Calm: { calm: true },
  Dominate: { spell: true, dominate: true },
  // Ritualist
  'Astral Punishment': { spell: true, vary: { res: 'ritual', label: 'Ritual Components (D6 Arcane each)', min: 1, step: 1 }, perUnit: 'd6' },
  'Aetheric Blessing': { vary: { res: 'ritual', label: 'Ritual Components (D6 Wounds per 3)', min: 3, step: 3 }, healPer3: 'd6' },
  'Cleanse Mind': { vary: { res: 'ritual', label: 'Ritual Components (1 Sanity per 3)', min: 3, step: 3 }, sanityPer3: 1 },
  'Sigil of Power': { sigil: true },
  'Arcane Torrent': { spell: true, vary: { res: 'ritual', label: 'Extra targets (4 Ritual Components each)', min: 0, step: 4 }, extraTargets: 4 },
  // Stormbrand
  'Infuse Weapon': { sustain: { pool: { die: 'd4', dtype: 'Lightning' } } },
  Countershock: { react: 'countershock' },
  'Thunderous Slice': { attack: { noDamage: true, onHitZeroArmor: true, freeAim: true } },
  'Tempestuous Rage': { buff: 'Tempestuous Rage' },
  // Tracker
  'Set Trap': { react: 'trap', afterSurprise: true },
  // Umbra Phantom
  Darksight: { sustain: { light: true } },
  'Shadow Madness': { vary: { res: 'sanity', label: 'Sanity to spend (D4 Psychic each)', min: 1, step: 1 }, perUnit: 'd4', dtype: 'Psychic' },
  Vanish: { vanish: true, oncePerRest: true },
  Reaper: { attack: { onKillSanity: 'd6' } },
  'Shadow Clone': { summon: 'Shadow Clone' },
  // Weapon Master
  'Evasive Strike': { attack: { onHitNextDef: 10 } },
  'Sure Blow': { attack: { undefendable: true } },
  'Overwhelming Technique': { free: true, spell: true, debuff: { name: 'Overwhelmed', combat: -20, rounds: 99 }, oncePerTarget: true },
  'Thousand Strikes': { attack: { all: true, onHitCond: ['Dazed', 1] } },
  // Wraith
  'Combat Awareness': { buff: 'Combat Awareness' },
  'Create Opening': { opening: true, exh: 3 },
  'Exploit Weakness': { exploit: true },
  'Fast Strike': { attack: { onHitAgain: true } },
  // Wrathspawn
  Bash: { attack: { pool: [{ die: 'd4', dtype: 'Bludgeoning' }] } },
  'Sweeping Blow': { attack: { all: true }, exh: 2 },
  'Reckless Attack': { attack: { pool: [{ die: '2d6', dtype: 'Bludgeoning' }], selfNoDefence: true } },
  Charge: { charge: true, exh: 2 },
  // Zealot
  'Holy Weapon': { sustain: { pool: { die: 'd4', dtype: 'Holy' } } },
  'Purifying Flames': { spell: true },
  'Holy Flames': { spell: true }, 'Infernal Flame': { spell: true }, 'Fire Bolt': { spell: true }, Fireball: { spell: true }, 'Frost Bolt': { spell: true }, Tempest: { spell: true },
  'Astral Projection': { foresee: 5, oncePerRest: true },
  Absolution: { absolution: true, oncePerRest: true },
  "God's Will": { spell: true, sanityFromDamage: true },
  Sanctuary: { sustain: { sanctuary: true } },
};
export const ICONS = {
  Restoring: 'Heals you and your allies 1 Toughness each round.',
  Vine: 'Bursts into vines: a foe failing a Body check is Restrained. Gone once it frees itself.',
  Firebomb: 'Explodes at the start of the next round: 2D10 Fire to every foe that fails its Magic Resistance.',
  Razorwind: 'Lashes every foe in the room with 1 Slashing damage each round.',
  Strength: '+5 Temporary Toughness, and +2D4 Bludgeoning in your Damage Pool, for you and your allies.',
};
