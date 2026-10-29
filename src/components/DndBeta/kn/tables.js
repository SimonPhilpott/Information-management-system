// Ker Nethalas rule data for the beta, from "Ker Nethalas: Into the Midnight Throne" (Gravebound Edition).
// The D-tables in bookTables.json are extracted from the PDF by scripts/extract_kn_tables.py. The creatures and small
// tables below are typed in from the book with their page numbers. Anything not in here is not imported yet.
import T from './bookTables.json';

export const BOOK = T.source;
export const pageOf = (name) => T[name]?.page;

// the row of a table that a roll lands on
export function look(name, roll) {
  const rows = T[name].rows;
  return rows.find((r) => roll >= r.lo && roll <= r.hi) || rows[rows.length - 1];
}

// what a room or corridor description shows on the map, from its words
const FEATURE_WORDS = [
  [/altar|shrine|sacrific/i, 'altar'], [/shackle|chains?\b|imprison|cage/i, 'chains'], [/throne/i, 'throne'],
  [/sarcophag|coffin|tomb|burial|niche|crypt/i, 'tombs'], [/statue|sculpture|monument|idol/i, 'statue'],
  [/water|pond|fountain|pool|flood|submerged|moss|slippery/i, 'pool'], [/plant|tree|vine|root|fungi|moss/i, 'growth'],
  [/scroll|tome|librar|book|shelves/i, 'shelves'], [/alchem|vial|beaker|experiment|lab/i, 'lab'],
  [/bones?|skull|femur|mass grave|remains/i, 'bones'], [/rubble|cave-in|collaps|crumbl|debris/i, 'rubble'],
  [/pillar|column|spire/i, 'pillars'], [/table|banquet|feast|kitchen/i, 'table'], [/fire|flame|brazier|scorch|burn/i, 'brazier'],
];
export function featuresFor(text) {
  const out = [];
  for (const [re, tag] of FEATURE_WORDS) if (re.test(text) && !out.includes(tag)) out.push(tag);
  return out.slice(0, 2);
}

// ---- Combat (pp. 75-84) --------------------------------------------------------------------------------------------
export const HIT_TABLES = {
  Humanoid: [[3, 'Right Leg'], [6, 'Left Leg'], [9, 'Abdomen'], [12, 'Chest'], [15, 'Left Arm'], [18, 'Right Arm'], [20, 'Head']],
  Quadruped: [[3, 'Right Hind Leg'], [6, 'Left Hind Leg'], [9, 'Hindquarters'], [12, 'Forequarters'], [15, 'Right Front Leg'], [18, 'Left Front Leg'], [20, 'Head']],
};
export const hitLocation = (anatomy, d20) => {
  const row = (HIT_TABLES[anatomy] || HIT_TABLES.Humanoid).find(([max]) => d20 <= max);
  return { name: row[1], weak: row[1] === 'Head' };
};

// p. 78
export const PLAYER_DEFENSIVE = [
  'Your next attack receives an additional +10 to the combat check.',
  "Reduce your opponent's Armor by -1 in the Hit Location you struck until the end of combat.",
  'Your opponent receives the Bleeding (1) condition.',
  'You are Immune to all conditions until your next turn, including the ones you are currently suffering from.',
  'Your opponent immediately suffers 1 Piercing damage that ignores Armor.',
  'Add +D6 to your Damage Pool for your next attack.',
  'You gain Advantage on your next attack.',
  "You press your advantage, reducing your opponent's next defensive check by -20.",
  'You get a moment of respite after fending off your opponent\'s attack. Recover 2 Toughness.',
  'Your next attack doesn\'t suffer the usual Disadvantage to your attack Skill when targeting a specific body part.',
];
export const NPC_DEFENSIVE = [
  "The creature's next attack receives an additional +10 to its Combat Skill. If it's a magic action, your Spellward is reduced by -10 until the creature's next turn.",
  'Your Armor is reduced by -1 in the struck Hit Location until the end of combat.',
  'You receive the Bleeding (1) condition.',
  'The creature clears all negative conditions that it is currently suffering from, if any.',
  'You receive 1 Piercing damage that ignores Armor.',
  "The creature's next damaging Action receives +D6 damage to its Damage Pool. If it's not a damaging Action, your Spellward is reduced by -10 until the creature's next turn.",
  'The creature gains Advantage on its next attack. If the attack is a Magical one, you roll your Spellward with Disadvantage.',
  'Your next Dodge, Parry, or Spellward check is reduced by -20.',
  'The creature recovers D4 Health.',
  'The creature gets a new turn immediately.',
];
// p. 84. `hit` is a self-inflicted wound the engine applies; `lose` means the turn is lost
export const PLAYER_FUMBLE = [
  { t: 'You drop your weapon and must spend your next turn recovering it.', lose: true },
  { t: 'You hurl your weapon so deep into a wall or ground that you must pass an Athletics check to retrieve it.', lose: true },
  { t: 'You hurl your weapon against a stone, breaking it in half. It can be repaired at Camp.', lose: true },
  { t: 'A random item from your Belt breaks: make a Belt check. With no Belt you receive 1 Piercing damage.', hit: 1 },
  { t: 'You are suddenly drained and lose D8 Aether. With no Aether you receive 1 Piercing damage.', aether: 8 },
  { t: 'You trip and fall, wasting this action. You are Prone and must use a Standard Action to get up.', lose: true },
  { t: 'You trip and slam your head. You are Prone and Dazed (2).', lose: true },
  { t: 'Your attack hits a random ally instead of the intended target. With no allies, you strike yourself.', hit: 'd6' },
  { t: 'You manage to strike yourself with a normal attack.', hit: 'd6' },
  { t: 'You hurt yourself badly with your own weapon. You receive a Critical Strike.', hit: 'crit' },
];
export const NPC_FUMBLE = [
  { t: "The creature's next attack suffers -20." }, { t: 'The creature is Stunned for the next round.', skip: 1 },
  { t: 'The creature is Restrained for the next D4 rounds.', skip: 2 }, { t: 'You gain Advantage on your defensive checks for the next 2 rounds.' },
  { t: 'You are Concealed for D4 rounds, or until you make an attack.' }, { t: 'The creature trips and falls, wasting its action.', skip: 1 },
  { t: 'The creature trips and slams its head. It is Prone and Stunned (2).', skip: 2 }, { t: 'The creature becomes Frightened (20).' },
  { t: 'The creature strikes itself, receiving D6 Slashing damage.', self: 'd6' },
  { t: 'The creature falls, becoming Prone and receiving 2D6 Bludgeoning damage. It must use its next turn to get up.', self: '2d6', skip: 1 },
];

// ---- Creatures (First Domain encounter table, p. 244; stat blocks pp. 142, 152, 167) --------------------------------
export const FIRST_DOMAIN_ENCOUNTERS = [
  { lo: 1, hi: 7, name: 'Blightfang Rats' }, { lo: 8, hi: 14, name: 'Skeletal Horrors' }, { lo: 15, hi: 20, name: 'Flesh Eater' },
];
export const CREATURES = {
  'Blightfang Rats': {
    page: 142, number: 3, type: 'Animal, Undead', blurb: 'Grotesque blends of rotting flesh and shadow, sinewy bodies under mangy, mottled fur. Left unchecked they spread havoc fast, and beneath Veldonia their numbers only grow, waiting for the day they pour up into the streets.', mind: 60, endurance: 30, body: 40, health: 6, anatomy: 'Quadruped', armor: {}, combat: 30, magicRes: 20, traits: ['Pack'],
    actions: [
      { rolls: [1, 2], name: 'Bite', magic: false, dmg: 'd6', type: 'Piercing' },
      { rolls: [3, 4, 5], name: 'Scratch', magic: false, dmg: 'd4', type: 'Slashing' },
      { rolls: [6], name: 'Rally', rally: true, text: 'The rat screeches, raising the Combat Skill of all Blightfang Rats by +10 until the next round.' },
    ],
  },
  'Skeletal Horrors': {
    page: 167, number: 2, type: 'Undead', blurb: 'The remains of fallen warriors cursed to wander for ever, wrapped in the tatters of once-proud armour, their bones blackened and charred by the fires of the afterlife. They wield spectral weapons with uncanny skill and hunt every living trespasser without rest.', mind: 20, endurance: 20, body: 25, health: 8, anatomy: 'Humanoid', armor: { Chest: 1 }, combat: 40, magicRes: 20, traits: ['Frightening'],
    actions: [
      { rolls: [1, 2], name: 'Cursed Slash', magic: false, dmg: 'd6', type: 'Slashing' },
      { rolls: [3, 4], name: 'Ethereal Grasp', magic: true, dmg: 'd6', type: 'Necrotic', text: 'Endurance check or take D6 Necrotic damage; success halves it.', halfOnSave: true },
      { rolls: [5], name: 'Haunting Wail', magic: true, wail: true, text: 'Everyone must pass a Resolve check or be Stunned (1).' },
      { rolls: [6], name: 'Vengeful Onslaught', magic: false, dmg: 'd4', type: 'Piercing', text: 'On a hit it uses Ethereal Grasp as a free action.' },
    ],
  },
  'Flesh Eater': {
    page: 152, number: 1, type: 'Humanoid, Undead', blurb: 'A bloated, rotting thing, pallid skin stretched over jutting bones and weeping sores, jagged teeth bared in a permanent grin. It reeks of the grave, yet it moves with unsettling speed and stealth through the darkest corners, rending its quarry with festering claws.', mind: 30, endurance: 30, body: 65, health: 12, anatomy: 'Humanoid', armor: {}, combat: 40, magicRes: 10, traits: ['Frightening'],
    actions: [
      { rolls: [1, 2], name: 'Rancid Claw', magic: false, dmg: 'd6', type: 'Slashing', text: 'Endurance check or a festering wound: 1 extra Necrotic damage each turn until healed.', festers: true },
      { rolls: [3, 4], name: 'Grasp', magic: false, grasp: true, dmg: '1', type: 'Bludgeoning', text: 'Athletics check against its Body or you are Restrained, taking 1 damage that ignores Armor each turn.' },
      { rolls: [5, 6], name: 'Slam', magic: false, dmg: 'd8', type: 'Bludgeoning' },
    ],
  },
};

// ---- Smaller tables ------------------------------------------------------------------------------------------------
export const SCAVENGE = [ // p. 116
  { lo: 1, hi: 1, t: 'You uncover some grisly remains. Pass a Resolve check or lose 1 Sanity.', resolve: true },
  { lo: 2, hi: 2, t: 'You find nothing of interest.' },
  { lo: 3, hi: 3, t: 'You discover D20 coins.', coins: '1d20' },
  { lo: 4, hi: 11, t: 'You find D4 Crafting Supplies.', supplies: '1d4' },
  { lo: 12, hi: 12, t: 'You discover 2D20 coins.', coins: '2d20' },
  { lo: 13, hi: 18, t: 'You find D4 Cooking Ingredients.', cooking: '1d4' },
  { lo: 19, hi: 19, t: 'You discover D100 coins.', coins: '1d100' },
  { lo: 20, hi: 20, t: 'Roll on the Spoils table (p. 213, not imported yet).' },
];
// p. 120: the rows the engine applies on its own. Everything else is shown as a card and kept in the Domain's list.
// portraits from the rulebook (pp. 180-198), in public/kn/overseers
export const overseerImg = (name) => `/kn/overseers/${String(name).toLowerCase().replace(/[^a-z]+/g, '-')}.jpg`;
export const OVERSEERS = ['Carnage Devourer', 'Dreadlord', 'Glacial Burrower', 'Gorehoof', 'Infernal Archon', 'Infernal Tormentor', 'Pyroclasmic Possessor', 'Veilshifter', 'Venomcloud Siren', 'Zephyrous Shadow'];

export const CHAIN = [4, 6, 8, 10, 12];
export const stepDown = (die) => CHAIN[Math.max(0, CHAIN.indexOf(die) - 1)];

// p. 91
export const MADNESS = [
  { t: 'Your mind breaks, and you are lost to the madness. Your character is, for all effects, dead.' },
  { t: 'Your mind is in shambles. All future rolls on this table suffer -1, cumulative.' },
  { t: 'Your max Toughness is reduced by 1, cumulative.' },
  { t: 'Each time you lose Sanity, you lose an additional 1, cumulative.' },
  { t: 'You rush through rooms. Scavenging becomes a Demanding (-10) task, cumulative.' },
  { t: 'You offer less resistance. All Resolve checks are Demanding (-10), cumulative.' },
  { t: 'You have trouble retaining experience. Each time you earn XP you earn 10 less, cumulative.' },
  { t: 'You have blocked out a traumatic experience. Reduce a Skill of your choosing by 10, cumulative.' },
  { t: 'You slap yourself to regain your wits and take 2D6 Bludgeoning damage that ignores Armor.' },
  { t: 'The traumatic experiences have taught you about yourself. +100 XP.' },
];

// p. 69: the Random Difficulty table (D8)
export const DIFFICULTY = [null, ['Child\'s play', 30], ['Effortless', 20], ['Easy', 10], ['Normal', 0], ['Normal', 0], ['Demanding', -10], ['Hard', -20], ['Impossible', -30]];
export const easeDifficulty = (d) => Math.max(1, d - (d === 5 ? 2 : 1));

// p. 119: the Traps table (D10). `avoid` is the check that negates it; `dmg` the damage if it is not avoided
export const TRAPS = [
  { avoid: 'Dodge', dmg: '2d6', type: 'Piercing', t: 'Arrows shoot from a hidden spot.' },
  { avoid: 'Dodge', dmg: '2d6', type: 'Piercing', t: 'You step on a hidden bear trap.' },
  { avoid: 'Dodge', dmg: '2d8', type: 'Bludgeoning', net: true, t: 'A net drops and Restrains you. Each attempt to get free costs 1 Exhaustion; after D6 attempts it breaks and the hard landing hurts.' },
  { avoid: 'Dodge', dmg: '2d4', type: 'Piercing', poison: true, t: 'A salvo of small poisoned darts: Poisoned (1) unless you pass an Endurance check.' },
  { avoid: 'Acrobatics', dmg: '3d4', type: 'Piercing', t: 'A disguised trap door drops you into a pit of spikes.' },
  { avoid: 'Dodge', dmg: 'd12', type: 'Slashing', t: 'A swinging blade.' },
  { avoid: 'Athletics', dmg: '2d4', type: 'Poison', gas: true, t: 'Noxious gas fills the chamber: an Endurance check or 2D4 Poison damage.' },
  { avoid: 'Acrobatics', dmg: '2d6', type: 'Fire', t: 'A ball of fire fills the room.' },
  { avoid: 'Dodge', alarm: true, t: 'An alarm draws one of the place\'s inhabitants: roll on the Combat Encounter table.' },
  { avoid: 'Athletics', dmg: '3d4', type: 'Bludgeoning', t: 'A rush of water fills the room and slams you against the walls.' },
];
