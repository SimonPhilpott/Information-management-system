// Character progression (pp. 21-67, 87): Masteries and their Abilities, levelling up, Skill Improvement, Perks,
// Personal Goals (tracked from what happens in play) and the Rot. Masteries are read from the book by
// scripts/extract_kn_masteries.py.
import MASTERY_LIST from './masteries.json';

export const MASTERIES = Object.fromEntries(MASTERY_LIST.map((m) => [m.name, m]));
export const MASTERY_NAMES = MASTERY_LIST.map((m) => m.name);
export const XP_PER_LEVEL = 1000;
export const levelDue = (h) => Math.floor((h.vit?.xp || 0) / XP_PER_LEVEL) + 1 > (h.level || 1);

// a hero's mastery entry: { name, tiers: n unlocked, amulet? }; older saves carry { name, feature, tier } from the classic
export const masteryOf = (m) => MASTERIES[m?.name] || MASTERY_LIST.find((x) => new RegExp(`^${String(m?.name || '').split(/[\s(]/)[0]}`, 'i').test(x.name)) || null;
export const tiersOf = (m) => m?.tiers ?? (m ? 1 : 0);

// ---- levelling up (p. 62): +1 Ability Point and one benefit ----
export const LEVEL_BENEFITS = [
  { id: 'health', t: 'Increase your Health by +D4.', die: 'd4' },
  { id: 'tough', t: 'Increase your Toughness by +D6.', die: 'd6' },
  { id: 'sanity', t: 'Increase your Sanity by +D4.', die: 'd4' },
  { id: 'aether', t: 'Increase your Aether by +D6.', die: 'd6' },
  { id: 'pool', t: 'Add +D6 damage (Slashing, Bludgeoning or Piercing) to your Damage Pool for physical, non-Ability attacks.', pick: ['Slashing', 'Bludgeoning', 'Piercing'] },
  { id: 'ability', t: "Increase a damage-dealing Ability's damage by +1.", pickAbility: true },
  { id: 'skill', t: 'Increase a Skill of your choosing by +5.', pickSkill: true },
  { id: 'resist', t: 'Increase your Endurance, Resolve and Spellward by +5.' },
];

// ---- Perks (p. 63) ----
export const PERKS = {
  'Living Shadow': 'You always surprise your opponents, and cannot be surprised.',
  'Lucky Find': 'Each time you open a container of any sort you obtain D20 coins.',
  'Precision Striker': 'When you deal a Critical Strike, you can re-roll the damage dealt.',
  Scavenger: 'Whenever you roll on the Scavenging table, roll an extra D4 and add it to or take it from the roll.',
  Scholar: 'You have Advantage on all Reason checks.',
  'Trap Buster': 'You have Advantage on all Thievery checks when dismantling traps.',
};

// ---- Personal Goals (pp. 64-67). `track` names the counter in hero.stats that measures it ----
const G = (name, obj, reward, track, n, fx) => ({ name, obj, reward, track, n, fx });
const dmgExp = (type, reduce) => G(`${type === 'Force' ? 'Air' : type} Damage Expert`, `Deal 200 ${type} damage`, reduce ? `Gain 1 ${type} damage reduction` : `Increase all ${type} damage dealt by +1`, `dmg.${type}`, 200, reduce ? { reduce: type } : { dealt: type });
const bane = (name, type, n = 50) => G(name, `Defeat ${n} ${type} opponents`, `Triple the damage dealt with a Critical Strike against ${type} opponents`, `killsType.${type}`, n, { tripleCrit: type });
const wm = (name, skill, short) => G(name, `Defeat 50 opponents with the ${skill} Skill`, `+1 damage while wielding a ${short}`, `killsSkill.${skill}`, 50, { skillDmg: skill });
export const GOALS = [
  dmgExp('Acid', true), dmgExp('Force', true), G('Annihilator', 'Defeat 100 opponents', '+D4 Psychic damage to all attacks', 'kills', 100, { psychic: true }),
  dmgExp('Arcane'), bane('Astral Bane', 'Astral'), bane('Beast Hunter', 'Animal'), wm('Bladed Weapon Master', 'Bladed Weapons', 'Bladed weapon'), dmgExp('Bludgeoning', true),
  wm('Bludgeoning Weapon Master', 'Bludgeoning Weapons', 'Bludgeoning weapon'), bane('Botanical Exterminator', 'Plant'), wm('Brawler', 'Unarmed Combat & Fist Weapons', 'fist weapon or unarmed'),
  dmgExp('Cold'), G('Decapitate the Leadership', 'Defeat 20 Overseers', 'When facing an Overseer, it is Stunned during the first combat round', 'overseers', 20, { stunOverseer: true }),
  bane('Demon Bane', 'Demon'), bane('Elemental Vanquisher', 'Elemental'), dmgExp('Fire'), G('Hoarder', 'Obtain 5,000 coins (in total, not all at once)', 'Traders buy up to 5 items from you at full price', 'coinsEver', 5000, { fullPrice: 5 }),
  dmgExp('Holy'), dmgExp('Infernal'), G('Living Shadow', 'Surprise 50 opponents', 'You gain the Living Shadow Perk', 'surprised', 50, { perk: 'Living Shadow' }), bane('Marauder', 'Humanoid'),
  G('Master Thief', 'Open 100 doors or containers with your Thievery Skill', 'You gain the Lucky Find Perk', 'thiefOpens', 100, { perk: 'Lucky Find' }), dmgExp('Necrotic'),
  G('Overseer Overthrown', 'Defeat an Overseer', 'You obtain an Amulet (a third Mastery)', 'overseers', 1, { amulet: true }), dmgExp('Piercing', true), dmgExp('Poison', true),
  G('Precision Striker', 'Deal 50 Critical Strikes in combat', 'You gain the Precision Striker Perk', 'crits', 50, { perk: 'Precision Striker' }), dmgExp('Psychic'),
  G('Relic Hunter', 'Find a Relic', '100 XP', 'relics', 1, { xp: 100 }), G('Scavenger', 'Successfully scavenge 100 rooms', 'You gain the Scavenger Perk', 'scavenged', 100, { perk: 'Scavenger' }),
  G('Scholar', 'Successfully use the Reason Skill 100 times to solve Events', 'You gain the Scholar Perk', 'reasonEvents', 100, { perk: 'Scholar' }), bane('Sentinel Smasher', 'Construct', 100),
  wm('Shafted Weapon Master', 'Shafted Weapons', 'Shafted weapon'), dmgExp('Slashing', true),
  G('Trap Buster', 'Successfully dismantle 50 traps', 'You gain the Trap Buster Perk', 'traps', 50, { perk: 'Trap Buster' }),
  G('Thrill Seeker', 'Trigger 20 Growing Darkness events', 'Roll twice on the Growing Darkness table and choose', 'darkness', 20, { darknessTwice: true }),
  G('Vaelorian Erudite', 'Loot 10 Lore Books', 'Increase your maximum Aether by +D4', 'lore', 10, { aether: 'd4' }), bane('Wraithstalker', 'Undead'),
];
export const GOAL = Object.fromEntries(GOALS.map((g) => [g.name, g]));
export const statAt = (h, path) => path.split('.').reduce((o, k) => (o ? o[k] : 0), h.stats || {}) || 0;
export const goalProgress = (h, name) => { const g = GOAL[name]; return g ? Math.min(g.n, statAt(h, g.track)) : 0; };
export const bump = (h, path, n = 1) => { h.stats = h.stats || {}; const ks = path.split('.'); let o = h.stats; for (const k of ks.slice(0, -1)) o = o[k] = o[k] || {}; o[ks.at(-1)] = (o[ks.at(-1)] || 0) + n; };

// ---- the Rot (p. 87): Endurance on exposure; then at each rest, Endurance or one stage worse ----
export const ROT = [null,
  'Immune to Necrotic damage, Vulnerable to Holy damage.',
  'Your max Toughness is halved.',
  'Your skin blackens like charcoal, and you can see in the dark: no lightsource needed.',
  'Always ravenous: 2 Rations to remove 1 Exhaustion.',
  'Your flesh knits itself: +D4 Health each time you Set Camp.',
  'Your body grows unresponsive: Disadvantage on weapon Skills, Dodge, Athletics and Acrobatics checks.',
  'You are immune to the effects of Exhaustion.',
  'The Rot takes your mind. You become another abomination of the Midnight Throne.',
];
// the Masteries' Tier Abilities the engine can resolve itself: damage to one target or all, with or without a Magic
// Resistance check. Everything else is spent (Aether) and its words are logged for you.
export function abilityPlan(tier) {
  const t = tier.text; const m = t.match(/dealing (\d*D\d+(?:\s*\+\s*\d*D?\d+)*) (\w+) damage/i) || t.match(/(?:deals?|receive|receives) (\d*D\d+(?:\s*\+\s*\d*D?\d+)*) (\w+) damage/i);
  if (!m) return null;
  return { dmg: m[1].replace(/\s+/g, '').toLowerCase(), dtype: m[2], all: /all (opponents|enemies)|every enemy|each enemy/i.test(t), upTo: /Up to/.test(t), magical: /Magical/.test(tier.action) };
}
export const aetherCost = (tier) => { const m = String(tier.cost || '').match(/(\d+) Aether/); return m ? Number(m[1]) : 0; };
export const sustained = (tier) => /Sustained/.test(tier.cost || '');
