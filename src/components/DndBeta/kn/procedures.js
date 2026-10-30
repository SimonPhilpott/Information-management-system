// The game's procedures as flowcharts, adapted from "Processes" (Jono, v0.01) in the Ker Nathalas folder and re-paged
// for the Gravebound Edition. Each step says how the beta handles it (auto, assisted, manual, missing) so the Rules
// page can show the whole loop of a solo session and where you are in it.
// A step: { id, t: text, kind: 'step' | 'ask' | 'end', page, roll, mode, yes, no }
export const PROCEDURES = [
  { id: 'turn', title: 'A turn in the dark', icon: 'hourglass', steps: [
    { id: 'turn.cond', t: 'Lasting conditions tick: Bleeding, Poisoned and Burning cost 1 Health per room', page: 84, mode: 'auto' },
    { id: 'turn.goals', t: 'Check for a new level and your Personal Goals', page: 62, mode: 'auto' },
    { id: 'turn.choose', kind: 'ask', t: 'Explore, rest, heal or retrace?', mode: 'auto', yes: 'Pick from the actions at the foot of the screen' },
  ] },
  { id: 'explore', title: 'Entering a new place', icon: 'door', steps: [
    { id: 'explore.domain', kind: 'ask', t: 'A new Domain?', yes: 'Roll its Overseer and Influence (D10); the Tension Die resets to D8', page: 100, roll: 'D10', mode: 'auto' },
    { id: 'explore.door', kind: 'ask', t: 'Through a door?', yes: 'Follow the door procedure first', page: 99, mode: 'auto' },
    { id: 'explore.shape', t: 'Room or corridor: roll its shape (1-25 a corridor)', page: 97, roll: 'D100', mode: 'assisted' },
    { id: 'explore.describe', t: 'Its description (and draw it on the map)', page: 100, roll: 'D100 / D20', mode: 'auto' },
    { id: 'explore.upkeep', t: 'Light -1, Aether refills, lasting conditions; Blinded with no light', page: 96, mode: 'auto' },
    { id: 'explore.lair', kind: 'ask', t: 'Lair found yet?', no: 'Lair Check: the D10 Usage Die', yes: 'Exit Check: the D8 Usage Die', page: 98, roll: 'Usage Die', mode: 'auto' },
    { id: 'explore.tension', t: 'Tension Check', page: 120, roll: 'Tension Die', mode: 'auto' },
    { id: 'explore.encounter', kind: 'ask', t: 'A Combat Encounter? 10+ in a room, 15+ in a corridor, never in the lair', yes: 'Fight', no: 'Roll the Events table (D100)', page: 99, roll: 'D20', mode: 'auto' },
    { id: 'explore.scavenge', t: 'Scavenge, once per room', page: 116, roll: 'D100, then D20', mode: 'auto' },
  ] },
  { id: 'door', title: 'Doors, locks and traps', icon: 'lock', steps: [
    { id: 'door.is', kind: 'ask', t: 'Is there a door? (1-5)', no: 'An open archway: go through', page: 99, roll: 'D10', mode: 'auto' },
    { id: 'door.look', t: 'Investigate: Perception at a random Difficulty', page: 117, roll: 'D100, D8', mode: 'auto' },
    { id: 'door.trap', kind: 'ask', t: 'Trapped? (7+)', yes: 'Spotted if your Perception passed; otherwise it springs when you touch the door', page: 117, roll: 'D10', mode: 'auto' },
    { id: 'door.resolve', t: 'A spotted trap: disarm it (Thieves\' Tools, Thievery) or set it off on purpose (+20 to avoid)', page: 117, mode: 'auto' },
    { id: 'door.lock', kind: 'ask', t: 'Locked? (12+, a container 10+)', page: 117, roll: 'D20', mode: 'auto' },
    { id: 'door.open', t: 'Pick it (Lockpick, Thievery; a failure breaks the pick) or force it (Athletics, +20 a retry, a Tension Check each time)', page: 118, mode: 'auto' },
    { id: 'door.trigger', t: 'A trap that springs: its avoidance check (+20 if you knew); it never triggers again', page: 118, roll: 'D10 trap, D100', mode: 'auto' },
  ] },
  { id: 'combat', title: 'A fight', icon: 'swords', steps: [
    { id: 'combat.sanity', t: 'Frightening or Horrifying: a Resolve check or lose 2 or 4 Sanity', page: 92, roll: 'D100', mode: 'auto' },
    { id: 'combat.surprise', kind: 'ask', t: 'Surprise? Stealth against their Mind: +20 to your first attack', page: 76, mode: 'auto' },
    { id: 'combat.init', t: 'Initiative: your Perception against their Mind', page: 76, roll: 'D100 each', mode: 'auto' },
    { id: 'combat.round', t: 'Each round: one Standard Action, one Free Action, Reactions at -20 after the first', page: 76, mode: 'auto' },
    { id: 'combat.attack', t: 'Attack: opposed checks, +10 to the attacker, Speed off the defender', page: 75, roll: 'D100 each', mode: 'auto' },
    { id: 'combat.hit', kind: 'ask', t: 'Who won?', yes: 'Attacker: Hit Location (D20), Damage Pool, Armor; Critical Strikes doubled', no: 'Defender: a Defensive Move (D10). Both failed: 1 damage to the defender', page: 80, mode: 'auto' },
    { id: 'combat.magic', t: 'A magical action: no attack roll, resist it with Spellward', page: 79, mode: 'auto' },
    { id: 'combat.flee', t: 'Flee: a Standard Action and a Dodge check', page: 77, roll: 'D100', mode: 'auto' },
    { id: 'combat.win', kind: 'end', t: 'Victory: +50 XP (+200 and D4 Sanity for an Overseer), D4 Toughness, Spoils, and an Integrity roll for used armour', page: 83, mode: 'auto' },
  ] },
  { id: 'rest', title: 'Resting', icon: 'tent', steps: [
    { id: 'rest.breather', t: 'A Breather: D10+2 Toughness, 1 Health, -2 Exhaustion; -5 Light and the Tension Die steps down', page: 123, mode: 'auto' },
    { id: 'rest.camp', t: 'Camp: one Ration, then activities (Barricade, Sleep, cook, craft, heal, repair, attune, swap)', page: 124, mode: 'auto' },
    { id: 'rest.check', kind: 'ask', t: 'Camp Check: 12+?', no: 'An encounter, and every benefit is halved', page: 124, roll: 'D20', mode: 'auto' },
    { id: 'rest.benefits', t: 'All Toughness, 1 Health, D4 Sanity, -10 Exhaustion; improve marked Skills; the Rot\'s Endurance check', page: 125, mode: 'auto' },
    { id: 'rest.heal', t: 'Between rests: a Bandage and a Medicine check heal D4 Toughness once per room, or stop Bleeding or Poison', page: 19, mode: 'auto' },
  ] },
];

// where the current game is in the procedures, for the "you are here" marker
export function whereNow(game) {
  if (!game) return null;
  const p = game.pieces.find((x) => x.id === game.here); const cb = game.combat;
  if (cb) return cb.initiative ? (cb.side === 'player' ? 'combat.attack' : 'combat.hit') : 'combat.init';
  if (p?.event?.pending) return 'explore.encounter';
  const d = (p?.doors || []).find((x) => x.kind === 'door' && !x.open && !x.to);
  if (d) return d.spotted ? 'door.resolve' : d.locked ? 'door.open' : 'door.trap';
  return 'turn.choose';
}
