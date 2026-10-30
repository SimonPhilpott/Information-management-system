// Ker Nethalas rules engine for the beta. Pure functions over a plain game state; the UI throws the 3D dice and passes
// the numbers in. Order of a room follows the book (pp. 96-99): shape, Lair or Exit check, Tension Die, Combat
// Encounter (D20, 10+ in a room, 15+ in a corridor), otherwise the Events table.
// Rules checked against the book's text: opposed checks and Critical Successes (pp. 69-71, 75-79), Advantage and
// Disadvantage (p. 70: read the D100 with the digits swapped when that helps or hurts), Flee (a Dodge check),
// Reactions (-20 for each defence after the first in a round), conditions (pp. 88-89), Exhaustion (p. 90), Madness (p. 91).
import {
  look, featuresFor, PLAYER_DEFENSIVE, NPC_DEFENSIVE, PLAYER_FUMBLE, NPC_FUMBLE,
  SCAVENGE, OVERSEERS, MADNESS, stepDown, DIFFICULTY, TRAPS, easeDifficulty,
} from './tables';
import { BESTIARY, statOf, known, hitLocation, armorAt, damageAfter, traitOf, traitText, encounterFor, SPECIAL_ACTIONS } from './creatures';
import { encumbrance } from './loot';
import { MINIONS, ABILITY, ICONS, heroMods, has, onGain, onLevel } from './masteryFx';
import { HIT_TABLES } from './creatures';
import { WEAPONS, makeArmour } from './loot';
import { spoilsOf, armourByName, weaponByName, wieldable, stepDie, propEffects, potionOf, agingOf, rollProperties, grant, rollSpoils, containerLoot, priceOf, FOR_SALE, countedKey, gearByName, armourItem, gearItem, makeMagic, makePotion } from './loot';
import { parseEvent, purposeOf } from './events';
import MASTERY_LIST from './masteries.json';
import { levelDue, LEVEL_BENEFITS, masteryOf, tiersOf, abilityPlan, aetherCost, sustained, GOAL, statAt, bump, ROT } from './progress';
import { buildShape, exitCandidates, DIRS, opposite, rng } from './shapes';

export const rnd = (n) => 1 + Math.floor(Math.random() * n);
export const roll = (expr) => {
  const m = String(expr).replace(/\s+/g, '').match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!m) return Number(expr) || 0;
  let t = 0; for (let i = 0; i < (Number(m[1]) || 1); i++) t += rnd(Number(m[2])); return t + (Number(m[3]) || 0);
};
export const uid = () => Math.random().toString(36).slice(2, 9);
const clone = (s) => (typeof structuredClone === 'function' ? structuredClone(s) : JSON.parse(JSON.stringify(s)));

// ---- the skills on the character sheet (p. 19); the number is the starting score ----
export const SKILLS = ['Acrobatics', 'Athletics', 'Bladed Weapons', 'Bludgeoning Weapons', 'Dodge', 'Medicine', 'Perception', 'Reason', 'Scavenge', 'Shafted Weapons', 'Stealth', 'Thievery', 'Unarmed Combat & Fist Weapons'];
export const BASE_SKILLS = { Acrobatics: 10, Athletics: 10, Dodge: 10, Perception: 20 };
export const WEAPON_SKILLS = ['Bladed Weapons', 'Bludgeoning Weapons', 'Shafted Weapons', 'Unarmed Combat & Fist Weapons'];
export const ALLOTMENTS = [{ n: 60, count: 1, weapon: true }, { n: 40, count: 1, weapon: true }, { n: 30, count: 3 }, { n: 20, count: 2 }, { n: 10, count: 3 }];

// ---- dice plans: which dice to throw, and how the faces turn into numbers ----
export function makePlan(defs) {
  const kinds = [];
  for (const [, d] of defs) { if (d === 'd100') kinds.push('d100t', 'd10'); else kinds.push(d); }
  return { defs, kinds };
}
export function readPlan(plan, faces) {
  let i = 0; const out = {};
  for (const [k, d] of plan.defs) {
    if (d === 'd100') { const t = faces[i++] ?? 0, o = faces[i++] ?? 0; const v = t + o; out[k] = v === 0 ? 100 : v; }
    else { let f = faces[i++]; if (d === 'd10' && f === 0) f = 10; out[k] = f; }
  }
  return out;
}
export const fakeFaces = (plan) => plan.kinds.map((k) => (k === 'd100t' ? rnd(10) * 10 - 10 : k === 'd10' ? rnd(10) - 1 : rnd(Number(k.slice(1)))));

// ---- the survivor (pp. 15-20, p. 243 Hard Beginnings) ----
export function newHero({ name, faces, resist40 = 'Endurance', skills = null, goals = '' }) {
  const [t1, t2, t3, h, a, s, hb6, hb4] = faces;
  const maxTough = t1 + t2 + t3 + 20, maxHealth = h + 10, maxAether = a + 8, maxSanity = s + 10;
  const resist = { Endurance: 20, Resolve: 20, Spellward: 20 }; resist[resist40] = 40;
  const hero = {
    name: name || 'The Condemned', level: 1, goals,
    resist, skills: skills || { ...BASE_SKILLS, 'Bladed Weapons': 60 },
    weapons: [{ name: 'Rusty Cleaver', dmg: 'd6', speed: 0, skill: 'Bladed Weapons', parry: false }, { name: 'Bone Dagger', dmg: 'd6', speed: 2, skill: 'Bladed Weapons', parry: true }],
    wield: 0, armor: { Torso: 0 }, dmgMod: 0,
    vit: { maxHealth, health: maxHealth, maxTough, tough: maxTough, maxAether, aether: maxAether, maxSanity, sanity: maxSanity, exh: 0, light: 10, xp: 0 },
    items: { rations: 1, bandages: 0, crafting: 0, cooking: 0, coins: 0, torches: 2, tinder: 1 }, misc: ['Tattered rags'],
    effects: [], madness: [], marks: {}, wounds: [], perks: [], hb: { d6: hb6, d4: hb4 },
    pack: [], worn: {}, stats: {}, abilityPoints: 2, masteries: [], goalsActive: [], goalsDone: [],
  };
  hurt(hero, hb6);
  hero.vit.sanity = Math.max(0, hero.vit.sanity - hb4);
  hero.vit.exh += 1;
  return hero;
}
export const skillOf = (hero, name) => (hero.resist[name] ?? hero.skills[name] ?? BASE_SKILLS[name] ?? 0) + bonusOf(hero, name) - (name === 'Resolve' ? 10 * (hero.madFx?.[6] || 0) : 0);

// ---- Advantage, Disadvantage, Exhaustion (pp. 70, 90) ----
export const exhTier = (h) => (h.vit.exh >= 21 ? 3 : h.vit.exh >= 16 ? 2 : h.vit.exh >= 11 ? 1 : 0);
export const healAmt = (h, n) => (exhTier(h) === 1 ? Math.ceil(n / 2) : n); // heal half the Wounds, rounding up
const hasAdv = (h, name) => (h.mods?.advantage || []).includes(name) || heroMods(h).adv.includes(name)
  || (name === 'Reason' && (h.perks || []).includes('Scholar'))
  || (['Scavenge', 'Perception'].includes(name) && ((h.masteries || []).some((m) => /^Tracker/.test(m.name)) || Object.values(h.worn || {}).some((x) => x?.name === 'Third Eye of Emaricus')));
const ROT_DIS = ['Bladed Weapons', 'Bludgeoning Weapons', 'Shafted Weapons', 'Unarmed Combat & Fist Weapons', 'Dodge', 'Athletics', 'Acrobatics'];
const swapDigits = (v) => (v >= 100 ? 100 : (v % 10) * 10 + Math.floor(v / 10) || 100);
// Advantage reads the lesser order of the digits, Disadvantage the greater; they cancel
export function readD100(h, name, v, notes, extra = {}) {
  const blind = ((h.effects || []).some((e) => e.name === 'Blinded') || inDark(h)) && name !== 'Reason';
  // a Critical Success or Failure on the last Perception or Thievery check carries to the next one (pp. 72-73)
  const onceKey = name === 'Perception' ? 'nextPer' : name === 'Thievery' ? 'nextThief' : null; const once = onceKey ? h[onceKey] : null; if (once) delete h[onceKey];
  const adv = hasAdv(h, name) || Boolean(extra.adv) || once === 'adv', dis = once === 'dis' || (exhTier(h) >= 2 && !(h.rot >= 7)) || blind || Boolean(extra.dis) || (h.rot >= 6 && ROT_DIS.includes(name));
  if (adv === dis) return v;
  const sw = swapDigits(v);
  const out = adv ? Math.min(v, sw) : Math.max(v, sw);
  if (out !== v && notes) notes.push(`${adv ? 'Advantage' : 'Disadvantage'}: ${v} read as ${out}`);
  return out;
}

// with no light at all you are Blinded (p. 96), unless the Rot, a magic item or a held spell lets you see
export const inDark = (h) => (h.vit?.light ?? 1) <= 0 && !(h.rot >= 3 || h.gearFx?.light || holding(h, 'Create Light') || holding(h, 'Darksight'));
// a Torch, Candle or hand Lamp fills a hand (p. 96): no shield, no two-handed weapon, no second weapon,
// unless the Lamp is set down for the fight or hangs from a Belt
export const beltOn = (h) => Boolean(h.worn?.Belt) || (h.pack || []).some((x) => x.name === 'Belt' && x.equipped);
export const beltLamp = (h) => beltOn(h) && (h.pack || []).some((x) => x.name === 'Belt Lamp' && x.equipped);
export const handFull = (h) => (h.vit?.light || 0) > 0 && ['torch', 'candle', 'oil'].includes(h.lightSource) && !(h.lightSource === 'oil' && (beltLamp(h) || h.lampDown));
export const shieldUp = (h) => (h.shield && !h.shield.broken && !handFull(h) ? h.shield : null);
// the Belt's four quickslots (p. 212): a Belt Lamp takes one; you choose what goes in the rest
export const BELT_SLOTS = 4;
export const beltable = (x) => ['potion', 'fragment', 'vial'].includes(x.kind) || (x.kind === 'relic' && x.type === 'Consumable');
export function beltItems(h) {
  if (!beltOn(h)) return [];
  const lamp = (h.pack || []).filter((x) => x.name === 'Belt Lamp' && x.equipped);
  const chosen = (h.belt || []).map((id) => (h.pack || []).find((x) => x.id === id)).filter(Boolean);
  return [...lamp, ...chosen].slice(0, BELT_SLOTS);
}
export function setBelt(state0, id, on) {
  const state = clone(state0); const h = state.hero; const it = packItem(h, id);
  if (!it || !beltOn(h)) return finish(state, [], {});
  const cur = (h.belt || []).filter((x) => x !== id && packItem(h, x));
  if (on) {
    if (beltItems({ ...h, belt: cur }).length >= BELT_SLOTS) return finish(state, [log1(state, 'Belt', `Your Belt's ${BELT_SLOTS} slots are full. Take something off first.`)], {});
    h.belt = [...cur, id];
  } else h.belt = cur;
  return finish(state, [log1(state, 'Belt', on ? `The ${it.name} goes on your Belt: using it in a fight is a Free Action.` : `The ${it.name} goes back in your pack.`, { page: 212 })], {});
}
// using an item in a fight: a Free Action from the Belt (one a round), otherwise your Standard Action (p. 77)
function beltUse(state, id) {
  const cb = state.combat; if (!cb) return null;
  const quick = beltItems(state.hero).some((x) => x.id === id) && !cb.flags.freeUsed; if (quick) cb.flags.freeUsed = true;
  return quick;
}
function afterUse(state, quick, out) {
  if (state.combat && out[0]) out[0].text = `${out[0].text}${quick ? ' From your Belt: a Free Action.' : ' It takes your Standard Action.'}`;
  if (state.combat && !quick && state.combat.side === 'player') return endPlayerTurn(state, out);
  return finish(state, out, {});
}
// damage goes to Toughness first, then Health
export function hurt(hero, n) {
  const v = hero.vit; let left = Math.max(0, n) + (n > 0 && hero.gd?.frail ? hero.gd.frail : 0);
  const tmp = Math.min(v.temp || 0, left); v.temp = (v.temp || 0) - tmp; left -= tmp;
  const t = Math.min(v.tough, left); v.tough -= t; left -= t;
  v.health = Math.max(0, v.health - left);
  return n;
}

// ---- a new Domain ----
export function newDomain(n) {
  const roll10 = rnd(10);
  const o = look('overseer', roll10);
  return {
    n, seed: Math.floor(Math.random() * 1e9), overseer: { name: OVERSEERS[rnd(OVERSEERS.length) - 1], influence: o.text, roll: roll10 },
    tension: 8, lair: 10, lairFound: false, exit: 8, exitFound: false, darkness: [], rooms: 0, lightDrain: 1,
  };
}
export function newGame(hero, title, { start: how = 'first', weapon = null } = {}) {
  const domain = newDomain(1);
  const start = makeStart();
  const h = hero; const log = [];
  if (how === 'first') {
    // you wake with rags and nothing else; the Guard Room has the weapons, and a half-spent Torch lies by you
    domain.first = 1; domain.lairFound = false;
    h.weapons = [FISTS()]; h.wield = 0;
    h.items.torches = 0; h.vit.light = 10; h.lightSource = 'torch';
    start.title = 'The Corpse Pile'; start.desc = { roll: 0, text: 'This is where you opened your eyes after your supposed execution. There is nothing of value here, just rotten flesh and vermin. You do find a half-spent Torch, though: it will last another 10 rooms.', page: 244 };
    log.push({ id: uid(), kind: 'room', title: start.title, text: start.desc.text, page: 244, place: start.id, rolls: [] });
  } else if (how === 'further') {
    // Further runs: a weapon of your choosing, a random armour, a Torch, D10 Cooking Ingredients, D10+5 Crafting Supplies, D20 coins
    const wb = weaponByName(weapon || 'Shortsword') || WEAPONS[0];
    const wi = { id: uid(), kind: 'weapon', name: wb.name, base: wb.name, t: `${wb.dtype}, ${wb.skill}, Speed ${wb.speed}. ${wb.traits.join(', ')}.`, page: 208 };
    const ar = makeArmour(); const ck = roll('d10'), cr = roll('d10') + 5, cn = roll('d20');
    h.pack = [...(h.pack || []), wi, ar]; h.weapons = [FISTS()]; h.items.torches = 1; h.items.cooking = (h.items.cooking || 0) + ck; h.items.crafting = (h.items.crafting || 0) + cr; h.items.coins = (h.items.coins || 0) + cn;
    h.vit.light = 0; h.lightSource = null;
    log.push({ id: uid(), kind: 'note', title: 'A further run', text: `You come to the necropolis with a ${wb.name}, a ${ar.name}, a Torch, ${ck} Cooking Ingredients, ${cr} Crafting Supplies and ${cn} coins. Light the Torch and take up your arms from your pack.`, page: 67, rolls: [] });
  }
  let g = { id: uid(), title: title || `${hero.name} in Ker Nethalas`, created: Date.now(), updated: Date.now(), hero: h, domain, pieces: [start], here: start.id, prev: null, log, combat: null, over: null };
  if (how === 'further') { for (const it of [...h.pack.slice(-2)]) g = equipItem(g, it.id).state; g = lightWith(g, 'torch').state; if (!g.hero.weapons.length) g.hero.weapons = [FISTS()]; g.hero.wield = Math.max(0, g.hero.weapons.findIndex((w) => !/fist/i.test(w.name))); }
  return g;
}
const FISTS = () => ({ name: 'Fists', dmg: 'd4', speed: 0, skill: 'Unarmed Combat & Fist Weapons', parry: false });
const FIRST_ROOMS = [
  null, null,
  { title: 'The Guard Room', page: 244, quiet: true, text: 'An ancient guard room, a tattered banner still hanging from one wall. Weapon and armour racks lie collapsed and rotten, but among the rusty pieces you find something you can use: a dagger, a club and a spear, and a piece of armour.', give: (h) => { const out = ['Dagger', 'Club', 'Spear'].map((n) => { const w = weaponByName(n); if (!w) return null; h.pack.push({ id: uid(), kind: 'weapon', name: w.name, base: w.name, t: `${w.dtype}, ${w.skill}, Speed ${w.speed}. ${w.traits.join(', ')}.`, page: 208 }); return w.name; }).filter(Boolean); const a = makeArmour(); h.pack.push(a); return [...out, a.name]; } },
  { title: 'Another Unfortunate Soul', page: 244, noEvent: true, text: 'You are not the first one here. In front of you lies the fairly recent corpse of another unfortunate soul. They carry 2 Cooking Ingredients and 10 Crafting Supplies; their misfortune may yet save your life.', give: (h) => { h.items.cooking = (h.items.cooking || 0) + 2; h.items.crafting = (h.items.crafting || 0) + 10; return ['2 Cooking Ingredients', '10 Crafting Supplies']; } },
  { title: 'The Altar', page: 245, noEvent: true, text: 'Old candles have melted into a mass of wax upon an altar to a goddess you do not recognise. She holds a bowl, and within it the brittle remains of paper prayers. Some of the candles can still be used.', give: (h) => { const n = roll('d4'); h.items.candles = (h.items.candles || 0) + n; return [`${n} Candle${n > 1 ? 's' : ''}`]; } },
  { title: "Scriptorium's Scraps", page: 245, text: 'Broken shelves, rotten scrolls and books spilled all around them. Something has survived: a small sack holding 3 Attunement Crystals, warm to the touch and whispering possibilities in your mind.', give: (h) => { grant(h, { count: { name: 'Attunement Crystal', n: 3 } }); return ['3 Attunement Crystals']; } },
  { title: 'Vaulted Ossuary', page: 246, choir: true, text: 'A long, ribbed vault of black limestone and bone. Femurs and vertebrae arch overhead, threaded with rusted wire, and pale fungus pulses with a sickly light. Along the far wall dozens of mummified mouths have been sewn into one ragged choir, lips stitched shut with copper wire. As you cross the threshold, the choir begins to sing.' },
  { title: "The Overseer's Hall", page: 246, lair: true },
  { title: 'The Exit', page: 246, exit: true, text: 'The drop to the next Domain. Once you go down, the climb back is too steep: you cannot return.' },
];
const CHOIR_ASKS = () => [
  { i: 0, skill: 'Resolve', text: 'The choir sings: make a Resolve check or suffer D4 Psychic damage.', optional: false, passText: 'You steel yourself against the song.', failText: 'The voices claw at you.', skipText: '', pass: [], fail: [{ k: 'dmg', n: 'D4', type: 'Psychic' }], skip: [], cost: null, purpose: 'to bear the song' },
  { i: 1, skill: 'Reason', text: 'Try to silence the choir with a Reason check.', optional: true, passText: 'You soothe the voices and search in peace.', failText: 'It becomes unbearable and you must leave at once.', skipText: 'You leave the choir to its song.', pass: [{ k: 'spoils', which: 'Spoils table' }], fail: [{ k: 'leave' }], skip: [], cost: null, purpose: 'to silence the choir' },
];
// a new room or corridor in the First Domain takes the next set room's contents
function firstDomainRoom(state, piece, out) {
  const d = state.domain; if (!d.first || d.n !== 1 || piece.kind === 'corridor') return null;
  d.first += 1; const fr = FIRST_ROOMS[d.first]; if (!fr) { d.first = null; return null; }
  piece.title = fr.title; piece.set = d.first;
  if (fr.text) piece.desc = { text: fr.text, roll: 0, page: fr.page };
  if (fr.give) { const got = fr.give(state.hero); out.push({ id: uid(), kind: 'roll', title: 'Found', text: `${got.join(', ')}.`, rolls: [], page: fr.page, place: piece.id }); }
  if (fr.lair) { d.lairFound = true; piece.lair = true; }
  if (fr.exit) { d.exitFound = true; piece.exit = true; d.first = null; }
  return fr;
}
function makeStart() {
  const shape = buildShape(30, 7);
  const cells = shape.cells.map(([x, y]) => [x, y]);
  const p = {
    id: uid(), n: 1, family: 'chamber', kind: 'room', cells, pillars: [], noExit: [], desc: { roll: 0, text: 'You woke here among the rotting dead. Nothing of value remains, only flesh and vermin.' },
    tags: ['bones'], cleared: true, searched: true, visited: true, start: true, doors: [], enc: null, event: null,
  };
  const cands = exitCandidates({ ...shape, cells });
  const pickd = []; const r = rng(11);
  for (const c of cands.sort(() => r() - 0.5)) {
    if (pickd.length >= 2) break;
    if (pickd.some((d) => d.dir === c.dir)) continue;
    pickd.push({ id: uid(), x: c.x, y: c.y, dir: c.dir, to: null });
  }
  p.doors = pickd;
  return p;
}

// ---- placing a piece next to a door ----
const key = (x, y) => `${x},${y}`;
function occupied(state) { const s = new Set(); for (const p of state.pieces) for (const [x, y] of p.cells) s.add(key(x, y)); return s; }
function tryPlace(state, parent, door, shape, seed) {
  const [dx, dy] = DIRS[door.dir]; const qx = door.x + dx, qy = door.y + dy;
  const occ = occupied(state);
  if (occ.has(key(qx, qy))) return null;
  const cands = exitCandidates(shape).filter((c) => c.dir === opposite(door.dir));
  const r = rng(seed); const order = cands.map((c) => [r(), c]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  for (const c of order) {
    const ox = qx - c.x, oy = qy - c.y;
    const cells = shape.cells.map(([x, y]) => [x + ox, y + oy]);
    if (cells.some(([x, y]) => occ.has(key(x, y)))) continue;
    return { ox, oy, entry: { x: c.x + ox, y: c.y + oy, dir: opposite(door.dir) }, cells, pillars: shape.pillars.map(([x, y]) => [x + ox, y + oy]), noExit: shape.noExit.map((k) => { const [x, y] = k.split(',').map(Number); return key(x + ox, y + oy); }), ends: shape.ends && shape.ends.map((e) => ({ x: e.x + ox, y: e.y + oy, dir: e.dir })) };
  }
  return null;
}
function addDoors(state, piece, shape, placed, seed) {
  const r = rng(seed + 5);
  const occ = occupied(state);
  const base = exitCandidates({ ...shape, cells: placed.cells, noExit: placed.noExit, ends: placed.ends });
  const free = base.filter((c) => { const [dx, dy] = DIRS[c.dir]; return !occ.has(key(c.x + dx, c.y + dy)) && !(c.x === placed.entry.x && c.y === placed.entry.y && c.dir === placed.entry.dir); });
  const want = piece.kind === 'corridor' ? free.length : Math.min(free.length, r.int(1, 3));
  const doors = [{ id: uid(), x: placed.entry.x, y: placed.entry.y, dir: placed.entry.dir, to: null, entry: true }];
  const sorted = free.map((c) => [r(), c]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  for (const c of sorted) {
    if (doors.length - 1 >= want) break;
    if (doors.some((d) => d.dir === c.dir && Math.abs(d.x - c.x) + Math.abs(d.y - c.y) < 3)) continue;
    doors.push({ id: uid(), x: c.x, y: c.y, dir: c.dir, to: null });
  }
  return doors;
}

// ---- entering a door ----
export function doorPlan(state, door) {
  const d = state.domain;
  if (door.to) return makePlan([['tension', `d${d.tension}`]]);
  const defs = [['shape', 'd100']];
  const checkDie = !d.lairFound ? d.lair : (!d.exitFound ? d.exit : null);
  if (checkDie) defs.push(['check', `d${checkDie}`]);
  defs.push(['tension', `d${d.tension}`], ['enc', 'd20']);
  // the Combat Encounter tables, thrown with the rest and used only if the encounter roll calls for a fight
  if (d.n > 1) defs.push(['table', 'd6']);
  defs.push(['which', 'd20']);
  return makePlan(defs);
}
export function pieceById(state, id) { return state.pieces.find((p) => p.id === id); }
export const here = (state) => pieceById(state, state.here);
// a place's name with its number on the map: "Room 14", or "14. The Chasm Reliquary" for a named one
export const placeName = (p) => {
  if (!p) return 'Here';
  const n = p.n || 0; const t = p.title || '';
  if (!t) return p.kind === 'corridor' ? `Corridor ${n}` : `Room ${n}`;
  if (/^(Room|Corridor|Chamber) \d+$/.test(t)) return `${t.split(' ')[0]} ${n}`;
  return n ? `${n}. ${t}` : t;
};

// the Growing Darkness results in play in this Domain, by the first number of their row (p. 120)
const gdLo = (e) => e.lo ?? look('darkness', e.roll)?.lo;
export const gdCount = (state, lo) => (state.domain?.darkness || []).filter((e) => gdLo(e) === lo).length;
const GD_TYPES = { 1: 'Animal', 13: 'Elemental', 23: 'Astral', 35: 'Plant', 51: 'Demon', 59: 'Undead', 65: 'Humanoid', 77: 'Construct' };
// what they do to you, kept on the hero so every check can see it (recounted after every action)
function gdHero(state) {
  const c = (lo) => gdCount(state, lo);
  return { breather: c(15), camp: c(17), noAttune: c(19), spellward: c(21), frail: c(55), sanityHurts: c(61), dull: c(73) };
}
// what they do to the creatures: +10 Combat Skill to a type, and any further Overseer Influences
function gdFoe(state, s) {
  if (!s || s.overseer) return s;
  for (const [lo, type] of Object.entries(GD_TYPES)) { const n = gdCount(state, Number(lo)); if (n && (s.type || []).includes(type)) s.combat += 10 * n; }
  s.infl = [s.influence, ...(state.domain?.extraInf || []).map((r) => INFLUENCE_NAMES[r])].filter(Boolean);
  for (const r of state.domain?.extraInf || []) {
    if (r === 2) s.health += Math.floor((state.hero.level || 1) / 5) * 3;
    if (r === 4) s.combat += 10; if (r === 5) s.magicRes += 10; if (r === 9) s.mind += 20;
    if (r === 10) { const t = s.traits.find((x) => x.name === 'Penetrating'); if (t) t.n = (t.n || 0) + 1; else s.traits.push({ name: 'Penetrating', n: 1 }); }
    if (r === 6) s.def.resist.push(['Fire', 'Cold', 'Lightning', 'Acid', 'Poison', 'Necrotic', 'Holy', 'Arcane', 'Psychic', 'Force'][(state.domain.seed + r) % 10]);
  }
  return s;
}
const INFLUENCE_NAMES = [null, 'Tough', 'Vital', 'Frenzied', 'Skilled', 'Magebane', 'Resistant', 'Corrupting', 'Unstable', 'Alert', 'Piercing'];
export const infHas = (s, name) => s?.influence === name || (s?.infl || []).includes(name);
function applyDarkness(state, rollNo, out, chosen = false) {
  const row = look('darkness', rollNo), h = state.hero, d = state.domain, v = h.vit;
  if (h.darknessTwice && !chosen && !h.skipDarkness) {
    const other = rnd(100); const b = look('darkness', other);
    d.darkChoice = [{ roll: rollNo, text: row.text }, { roll: other, text: b.text }];
    out.push({ id: uid(), kind: 'darkness', title: 'Growing Darkness: choose', text: `Thrill Seeker: the darkness offers two shapes. D100 ${rollNo}: ${row.text} Or D100 ${other}: ${b.text}`, rolls: [{ label: 'D100', value: rollNo }, { label: 'D100', value: other }], page: 120, choose: true });
    return { roll: rollNo, text: '', auto: [], pending: true };
  }
  if (h.skipDarkness) { h.skipDarkness = false; out.push({ id: uid(), kind: 'darkness', title: 'Growing Darkness', text: 'The darkness stirs, but you read its signs earlier and let it pass you by.', rolls: [{ label: 'D100', value: rollNo }], page: 120 }); return { roll: rollNo, text: '', auto: [], skipped: true }; }
  const eff = { roll: rollNo, lo: row.lo, text: row.text, auto: [] };
  const lo = row.lo; const q = (c) => { queueCheck(state, { title: 'Growing Darkness', page: lo >= 65 ? 122 : lo >= 19 ? 121 : 120, ...c }, out); eff.auto.push(`a ${c.skill} check`); };
  if (lo === 3) { const n = (d.darkness || []).length + 1; q({ skill: 'Resolve', why: `The shadows grow longer: Resolve, or lose ${n} Sanity (1 for each Growing Darkness in play).`, purpose: `or lose ${n} Sanity`, fail: [{ k: 'sanity', n, final: true }] }); }
  else if (lo === 25) { const items = beltItems(h); const slot = rnd(4); const it = items[slot - 1]; if (it) { h.pack = h.pack.filter((x) => x.id !== it.id); eff.auto.push(`Belt check D4 ${slot}: the ${it.name} is destroyed`); } else eff.auto.push(beltOn(h) ? `Belt check D4 ${slot}: nothing in that slot` : 'no Belt to check'); }
  else if (lo === 27) q({ skill: 'Resolve', why: 'This place knows, and it watches you: Resolve, or lose D4 Sanity.', purpose: 'or lose D4 Sanity', fail: [{ k: 'sanity', n: 'D4', final: true }] });
  else if (lo === 29) { h.surpriseNext = true; eff.auto.push('the next creature to attack you surprises you'); }
  else if (lo === 31) { const ms = h.minions || []; if (ms.length) { const lost = ms.filter(() => rnd(6) === 1); h.minions = ms.filter((m) => !lost.includes(m)); eff.auto.push(lost.length ? `${lost.map((m) => m.kind).join(', ')} destroyed` : 'your Minions endure'); } else { const n = roll('d8'); hurt(h, n); eff.auto.push(`${n} Psychic damage`); } }
  else if (lo === 33) { const n = (d.darkness || []).length; d.darkness = []; v.sanity = Math.max(0, v.sanity - n); v.health = Math.max(0, v.health - n); eff.auto.push(n ? `${n} other Growing Darkness dismissed: -${n} Sanity, -${n} Health` : 'nothing else to dismiss'); }
  else if (lo === 53) q({ skill: 'Endurance', why: 'A suffocating mist: Endurance, or 3D4 Poison damage.', purpose: 'or 3D4 Poison damage', fail: [{ k: 'dmg', n: '3D4', type: 'Poison' }] });
  else if (lo === 57) { h.madPick = (h.madPick || 0) + 1; eff.auto.push('choose a Skill to lose 10'); }
  else if (lo === 63) { const sk = h.weapons[h.wield]?.skill || 'Bladed Weapons'; q({ skill: sk, why: 'A swarm of Hellbats: a weapon Skill check. Pass for 10 XP; fail and take D10 Slashing damage.', purpose: 'against the Hellbats', pass: [{ k: 'xp', n: 10 }], fail: [{ k: 'dmg', n: 'D10', type: 'Slashing' }] }); }
  else if (lo === 71) q({ skill: 'Resolve', why: 'The spirits of the angry dead swarm you: pass for 20 XP, fail and lose D4 Sanity.', purpose: 'against the angry dead', pass: [{ k: 'xp', n: 20 }], fail: [{ k: 'sanity', n: 'D4', final: true }] });
  else if (lo === 75) { const m = (h.madness || []).length; if (m) { let n = 0; for (let i = 0; i < m; i++) n += roll('d6'); hurt(h, n); eff.auto.push(`${n} Psychic damage (${m} Madness)`); } else eff.auto.push('no Madness for it to find'); }
  else if (lo === 79) q({ skill: 'Dodge', why: 'The ground shakes and debris falls: Dodge, or 3D6 Bludgeoning damage.', purpose: 'out of the way of the debris', fail: [{ k: 'dmg', n: '3D6', type: 'Bludgeoning' }] });
  else if (lo === 81) { const r = rnd(10); d.extraInf = [...(d.extraInf || []), r]; eff.auto.push(`Overseer Influence D10 ${r}: ${INFLUENCE_NAMES[r]}, for every creature in this Domain (+10 XP each when slain)`); }
  if (row.lo === 9) { const n = roll('d4'); v.maxAether = Math.max(0, v.maxAether - n); v.aether = Math.min(v.aether, v.maxAether); eff.auto.push(`Max Aether -${n}`); }
  else if (row.lo === 11) { const n = roll('d6'); v.maxTough = Math.max(1, v.maxTough - n); v.tough = Math.min(v.tough, v.maxTough); eff.auto.push(`Max Toughness -${n}`); }
  else if (row.lo === 67) { const n = roll('d4'); v.light = Math.max(0, v.light - n); eff.auto.push(`Light -${n}`); }
  else if (row.lo === 69) { d.lightDrain = 2; eff.auto.push('Light now drops by 2 per room'); }
  else if (row.lo === 5 && (v.health < v.maxHealth || v.tough < v.maxTough)) { const n = roll('d6'); hurt(h, n); eff.auto.push(`${n} Psychic damage`); }
  else if (row.lo === 37) { eff.ambush = true; }
  if (row.lo === 7 && v.sanity < v.maxSanity) { queueCheck(state, { title: 'Growing Darkness', skill: 'Resolve', page: 92, why: 'The darkness gnaws at your mind: a Resolve check, or lose 1 Sanity.', purpose: 'or lose 1 Sanity', fail: [{ k: 'sanity', n: 1, final: true }] }, out); eff.auto.push('a Resolve check against 1 Sanity'); }
  eff.when = darknessWhen(row.text);
  if (!eff.ambush) d.darkness.push(eff);
  bump(h, 'darkness');
  out.push({ id: uid(), kind: 'darkness', title: 'Growing Darkness', text: row.text, rolls: [{ label: 'D100', value: rollNo }], auto: eff.auto, page: 120 });
  return eff;
}
// a given Growing Darkness roll, applied as if the Tension Die had called for it (used by the rules tests)
export function darknessRoll(state0, rollNo) { const state = clone(state0); const out = []; const eff = applyDarkness(state, rollNo, out); return finish(state, out, { darkness: eff }); }
export function chooseDarkness(state0, i) {
  const state = clone(state0); const d = state.domain; const c = d.darkChoice?.[i]; if (!c) return finish(state, [], {});
  d.darkChoice = null; const out = [];
  const eff = applyDarkness(state, c.roll, out, true);
  return finish(state, out, { darkness: eff, combat: eff.ambush ? { ambush: true } : null });
}
function tensionCheck(state, die, rollV, out) {
  const d = state.domain;
  const rollTxt = { label: `Tension D${die}`, value: rollV };
  if (rollV > 2) { out.push({ id: uid(), kind: 'roll', title: 'Tension Die', text: `D${die} rolled ${rollV}: nothing stirs.`, rolls: [rollTxt] }); return null; }
  if (die === 4) {
    out.push({ id: uid(), kind: 'roll', title: 'Tension Die', text: `D4 rolled ${rollV}: something takes notice. Growing Darkness, and the die resets to D8.`, rolls: [rollTxt] });
    d.tension = has(state.hero, 'Tracker', 5) ? 10 : 8; return applyDarkness(state, rnd(100), out);
  }
  d.tension = stepDown(die);
  out.push({ id: uid(), kind: 'roll', title: 'Tension Die', text: `D${die} rolled ${rollV}: it steps down to D${d.tension}.`, rolls: [rollTxt] });
  return null;
}
// moving into a room: light, aether, blindness, and the damage that lasts after a fight (p. 84)
function upkeep(state, out) {
  const h = state.hero, v = h.vit, d = state.domain;
  const lit = h.rot >= 3 || h.gearFx?.light || holding(h, 'Create Light') || holding(h, 'Darksight');
  if (!lit) v.light = Math.max(0, v.light - (d.lightDrain || 1));
  if (h.timed?.length) {
    for (const t of h.timed) {
      if (t.healRoom) { v.tough = Math.min(v.maxTough, v.tough + t.healRoom); if (t.rooms <= 0) { v.health = Math.max(0, v.health - 1); out.push({ id: uid(), kind: 'note', title: t.name, text: 'The cursed bandages fester: -1 Health.', rolls: [] }); } }
      if (t.burnOnExit) { const n = roll(t.burnOnExit); hurt(h, n); out.push({ id: uid(), kind: 'note', title: t.name, text: `The gauntlet sears you as you leave: ${n} Fire damage.`, rolls: [] }); t.rooms = 0; t.burnOnExit = null; }
      if (!t.healRoom || t.rooms > 0) t.rooms -= 1;
    }
    const gone = h.timed.filter((t) => t.rooms <= 0 && !t.healRoom && !(t.rounds > 0));
    h.timed = h.timed.filter((t) => !(t.rooms <= 0 && !t.healRoom && !(t.rounds > 0)) && !(t.healRoom && t.rooms < -50));
    if (gone.some((t) => t.name === 'Stoneskin')) recalcGear(h);
  }
  if (h.regen > 0) { healWounds(h, 1); h.regen -= 1; }
  v.aether = Math.max(0, v.maxAether - reservedAether(h));
  for (const e of h.effects.filter((x) => LASTING.includes(x.name))) {
    v.health = Math.max(0, v.health - 1);
    out.push({ id: uid(), kind: 'note', title: e.name, text: `${e.name} costs you 1 Health a room, and it ignores Armor.`, rolls: [] });
  }
  const frz = h.effects.find((e) => e.name === 'Freezing');
  if (frz) {
    frz.rooms = (frz.rooms || 0) + 1;
    if (frz.rooms >= 10) { v.health = 0; out.push({ id: uid(), kind: 'note', title: 'Frozen', text: 'Ten rooms of cold: your heart slows, and stops.', rolls: [], page: 88 }); }
    else {
      if (frz.rooms === 5) out.push({ id: uid(), kind: 'note', title: 'Hypothermia', text: 'The cold has you: -50 to everything you do until you shake it off.', rolls: [], page: 88 });
      queueCheck(state, { title: 'Freezing', skill: 'Endurance', page: 88, why: `You are Freezing (${frz.rooms} room${frz.rooms > 1 ? 's' : ''}): an Endurance check once a room throws it off. At 5 rooms hypothermia sets in (-50), at 10 you die.`, purpose: 'to throw off the cold', passText: 'Warmth returns.', pass: [{ k: 'uncond', name: 'Freezing' }] }, out);
    }
  }
  if (v.light === 0 && !lit) queueCheck(state, { title: 'No light', skill: 'Resolve', page: 96, why: 'Your light is out and you are Blinded. Each room you enter in the dark asks a Resolve check, or you lose 1 Sanity.', purpose: 'to keep your nerve in the dark', failText: 'The dark presses in.', fail: [{ k: 'sanity', n: 1 }] }, out);
}

export function enterDoor(state0, doorId, faces) {
  const state = clone(state0); const out = []; settleAllQueued(state, out);
  const from = here(state); const door = from.doors.find((x) => x.id === doorId);
  const plan = doorPlan(state, door); const vals = readPlan(plan, faces);
  const d = state.domain;
  if (door.to) { // retracing: a Tension check only (p. 99)
    state.prev = from.id; state.here = door.to;
    upkeep(state, out);
    const eff = tensionCheck(state, Number(plan.defs[0][1].slice(1)), vals.tension, out);
    out.push({ id: uid(), kind: 'move', title: 'Retracing your steps', text: 'You pass back through ground you have already cleared.', rolls: [], place: here(state).id });
    if (here(state).choir) queueCheck(state, { title: 'The choir', skill: 'Resolve', page: 246, why: 'The choir sings again as you cross the threshold: Resolve, or D4 Psychic damage.', purpose: 'to bear the song', passText: 'You bear it.', fail: [{ k: 'dmg', n: 'D4', type: 'Psychic' }] }, out);
    return finish(state, out, { darkness: eff });
  }
  let shapeRoll = vals.shape, placed = null, shape = null, tries = 0; const seed = d.seed + state.pieces.length * 977;
  while (tries < 12) {
    shape = buildShape(shapeRoll, seed + tries);
    placed = tryPlace(state, from, door, shape, seed + tries);
    if (placed) break;
    tries += 1; shapeRoll = rnd(100);
  }
  if (!placed) { out.push({ id: uid(), kind: 'note', title: 'Dead end', text: 'The way is blocked: there is no room for anything beyond this door.', rolls: [] }); door.blocked = true; return finish(state, out, {}); }
  const kind = shapeRoll <= 25 ? 'corridor' : 'room';
  if (state.hero.foresee?.length) { vals.enc = state.hero.foresee.shift(); if (!state.hero.foresee.length) delete state.hero.foresee; }
  const piece = { id: uid(), n: state.pieces.length + 1, kind, family: shape.family, cave: shape.cave, cells: placed.cells, pillars: placed.pillars, noExit: placed.noExit, alcoves: shape.alcoves || 0,
    cleared: false, searched: false, visited: true, doors: [], enc: null, event: null, shapeRoll, tags: [], seed };
  piece.doors = addDoors(state, piece, shape, placed, seed);
  door.to = piece.id; piece.doors[0].to = from.id;
  state.pieces.push(piece); d.rooms += 1;
  state.prev = from.id; state.here = piece.id;
  piece.title = `${kind === 'corridor' ? 'Corridor' : 'Room'} ${d.rooms}`;
  out.push({ id: uid(), kind: 'roll', title: 'Room & Corridor Shape', text: tries ? `D100 ${vals.shape} had no space, re-rolled to ${shapeRoll}: ${kind === 'corridor' ? 'a corridor' : 'a room'}.` : `D100 ${shapeRoll}: ${kind === 'corridor' ? 'a corridor' : 'a room'}.`, rolls: [{ label: 'D100', value: shapeRoll }], page: 97 });
  upkeep(state, out);
  let isLair = false;
  if (d.first) { /* the First Domain's map shows the Overseer and the Exit (p. 244) */ }
  else if (!d.lairFound) {
    const die = d.lair;
    if (d.rooms >= 15) { d.lairFound = true; isLair = true; out.push({ id: uid(), kind: 'roll', title: 'Lair', text: 'Fifteen rooms and no Overseer: this room holds the lair.', rolls: [] }); }
    else if (vals.check <= 2) {
      if (die === 4) { d.lairFound = true; isLair = true; out.push({ id: uid(), kind: 'roll', title: 'Lair Check', text: `D4 rolled ${vals.check}: this is the Overseer's lair.`, rolls: [{ label: 'D4', value: vals.check }], page: 98 }); }
      else { d.lair = stepDown(die); out.push({ id: uid(), kind: 'roll', title: 'Lair Check', text: `D${die} rolled ${vals.check}: it steps down to D${d.lair}.`, rolls: [{ label: `D${die}`, value: vals.check }], page: 98 }); }
    } else out.push({ id: uid(), kind: 'roll', title: 'Lair Check', text: `D${die} rolled ${vals.check}: no change.`, rolls: [{ label: `D${die}`, value: vals.check }], page: 98 });
  } else if (!d.exitFound) {
    const die = d.exit;
    if (vals.check <= 2) {
      if (die === 4) { d.exitFound = true; piece.exit = true; out.push({ id: uid(), kind: 'roll', title: 'Domain Exit', text: `D4 rolled ${vals.check}: you have found the way out of this Domain.`, rolls: [{ label: 'D4', value: vals.check }], page: 98 }); }
      else { d.exit = stepDown(die); out.push({ id: uid(), kind: 'roll', title: 'Domain Exit', text: `D${die} rolled ${vals.check}: it steps down to D${d.exit}.`, rolls: [{ label: `D${die}`, value: vals.check }], page: 98 }); }
    } else out.push({ id: uid(), kind: 'roll', title: 'Domain Exit', text: `D${die} rolled ${vals.check}: no change.`, rolls: [{ label: `D${die}`, value: vals.check }], page: 98 });
  }
  if (isLair) piece.lair = true;
  const eff = tensionCheck(state, Number(plan.defs.find((x) => x[0] === 'tension')[1].slice(1)), vals.tension, out);
  const dsc = kind === 'corridor' ? look('corridor', rnd(20)) : look('room', rnd(100));
  piece.desc = { text: dsc.text, roll: dsc.lo, page: kind === 'corridor' ? 100 : 102 };
  const set = firstDomainRoom(state, piece, out); if (set?.lair) isLair = true;
  piece.tags = featuresFor(piece.desc.text);
  if (piece.alcoves) piece.tags = ['tombs'];
  const need = kind === 'corridor' ? 15 : 10;
  let combat = null;
  if (isLair) piece.overseer = true;
  else if (vals.enc >= need && !set?.quiet && !set?.exit && !set?.choir) {
    const e = encounter(state, vals.table || rnd(6), vals.which || rnd(20));
    piece.enc = e.enc; combat = { name: e.name, table: e.d20 };
    out.push({ id: uid(), kind: 'roll', title: 'Combat Encounter', text: `${encText(e)}${e.enc.alive.length > 1 ? `, ${e.enc.alive.length} of them` : ''}.`, rolls: encRolls(e), page: e.page, place: piece.id, creature: e.name });
  }
  out.push({ id: uid(), kind: 'room', title: piece.title, text: piece.desc.text, page: piece.desc.page, rolls: isLair ? [] : [{ label: `Encounter D20 (${need}+)`, value: vals.enc }], lair: isLair, overseer: isLair ? d.overseer : null, tags: piece.tags, family: piece.family, place: piece.id, creature: combat ? combat.name : null });
  if (set?.choir) { const entryId = uid(); piece.event = { roll: 0, text: set.text, page: 246, done: false, asks: CHOIR_ASKS(), entryId }; piece.choir = true; out.push({ id: entryId, kind: 'event', title: 'The choir', text: 'The choir begins to sing.', rolls: [], page: 246, place: piece.id, asks: piece.event.asks }); }
  else if (!combat && !isLair && !set?.quiet && !set?.noEvent && !set?.exit) piece.event = { pending: true };
  if (!combat) piece.cleared = !isLair;
  return finish(state, out, { darkness: eff, combat });
}

function finish(state, out, extra) {
  const hh = state.hero;
  // Madness 4: every loss of Sanity costs more; Madness 7: every gain of XP is smaller (p. 91)
  if (hh.madFx?.[4] && hh._san != null && hh.vit.sanity < hh._san) hh.vit.sanity = Math.max(0, hh.vit.sanity - hh.madFx[4]);
  if (state.domain) hh.gd = gdHero(state);
  if (hh.gd?.sanityHurts && hh._san != null && hh.vit.sanity < hh._san) queueCheck(state, { title: 'Growing Darkness', skill: 'Endurance', page: 121, why: 'Your mental wounds leave physical marks: Endurance, or D6 Psychic damage.', purpose: 'or D6 Psychic damage', fail: [{ k: 'dmg', n: 'D6', type: 'Psychic' }] }, out);
  if (hh.madFx?.[7] && hh._xp != null && hh.vit.xp > hh._xp) hh.vit.xp = Math.max(hh._xp, hh.vit.xp - 10 * hh.madFx[7]);
  if (hh.vit.sanity <= 0 && !hh.mad) {
    hh.mad = true; const mf = hh.madFx || {}; const m0 = rnd(10), m = Math.max(1, m0 - (mf[2] || 0)), row = MADNESS[m - 1];
    out.push({ id: uid(), kind: 'note', title: 'Madness', text: `Your Sanity reaches 0. Madness D10 ${m0}${m !== m0 ? ` (-${mf[2]}, your shattered mind: ${m})` : ''}: ${row.t} The episode passes and your lost Sanity returns.`, rolls: [{ label: 'D10', value: m0 }], page: 91 });
    if (m === 1) state.over = 'mad';
    else {
      if (m === 9) hurt(hh, roll('2d6')); if (m === 10) hh.vit.xp += 100;
      if (m >= 2 && m <= 8) { hh.madness.push(row.t); hh.madFx = { ...mf, [m]: (mf[m] || 0) + 1 }; }
      if (m === 3) { hh.vit.maxTough = Math.max(1, hh.vit.maxTough - 1); hh.vit.tough = Math.min(hh.vit.tough, hh.vit.maxTough); }
      if (m === 8) { hh.madPick = (hh.madPick || 0) + 1; out.push({ id: uid(), kind: 'note', title: 'Blocked out', text: 'Choose a Skill to lose 10: the memory, and what it taught you, are gone.', rolls: [], page: 91, remind: 'madness' }); }
      hh.vit.sanity = hh.vit.maxSanity; hh._san = hh.vit.sanity;
    }
  } else if (hh.vit.sanity > 0) hh.mad = false;
  checkGoals(state, out);
  try {
    const enc = encumbrance(hh); const over = enc.used > enc.cap;
    if (over && !hh.overloaded) out.push({ id: uid(), kind: 'note', title: 'Over your slots', text: `You are carrying ${enc.used} slots' worth with room for ${enc.cap}. Leave something behind, or find a Backpack or Pouch (p. 206).`, rolls: [], page: 206, place: state.here, remind: 'pack' });
    hh.overloaded = over;
  } catch { /* an old save without a pack */ }
  state.log.push(...out); state.updated = Date.now();
  if (!state.over && hh.vit.health <= 0 && has(hh, 'Tracker', 4) && !(hh.restUsed || {})['Will to Survive']) { hh.vit.health = 1; hh.restUsed = { ...(hh.restUsed || {}), 'Will to Survive': true }; state.log.push({ id: uid(), kind: 'note', title: 'Will to Survive', text: 'The blow should have killed you. It does not: you cling on at 1 Health.', rolls: [], place: state.here }); }
  if (!state.over && hh.vit.health <= 0) {
    state.over = 'dead';
    const foe = state.combat ? here(state)?.enc?.name : null;
    state.log.push({ id: uid(), kind: 'note', title: 'You have died', text: `Your Health reaches 0${foe ? ` and the ${foe} finish you` : ''}. Your journey ends here, unless you take the optional Forgiving Death rule (p. 87).`, rolls: [], page: 87, result: 'fail', place: state.here });
  }
  hh._san = hh.vit.sanity; hh._xp = hh.vit.xp;
  if (!state.over && hh.vit.exh >= 21 && !(hh.rot >= 7)) { state.over = 'dead'; state.log.push({ id: uid(), kind: 'note', title: 'Exhausted', text: 'Your body is no longer capable of enduring the accumulated fatigue. You die.', rolls: [], page: 90 }); }
  return { state, out, ...extra };
}

// ---- events (p. 108) ----
export const eventPlan = () => makePlan([['event', 'd100']]);
export function resolveEvent(state0, faces) {
  const state = clone(state0); const out = []; const p = here(state);
  const v = readPlan(eventPlan(), faces).event;
  const row = look('events', v);
  // the checks the event's own words ask for become roll prompts on the scroll (events.js)
  const asks = parseEvent(row.text).map((a, i) => ({ ...a, i, purpose: purposeOf(a) }));
  const entryId = uid();
  p.event = { roll: v, text: row.text, page: 108, done: false, asks, entryId };
  if (/\bTrader\b/.test(row.text)) p.trader = true;
  out.push({ id: entryId, kind: 'event', title: 'Event', text: row.text, rolls: [{ label: 'D100', value: v }], page: 108, place: p.id, asks });
  return finish(state, out, {});
}
// the checks an event's own words ask for
const CHECK_RE = /\b(Resolve|Endurance|Dodge|Reason|Athletics|Perception|Medicine|Spellward|Stealth|Scavenge|Acrobatics|Thievery|weapon Skill)\b(?: or [A-Z][a-z]+)? check/g;
export function eventChecks(text) {
  const out = []; let m;
  const re = new RegExp(CHECK_RE.source, 'g');
  while ((m = re.exec(String(text || '')))) { const n = m[1] === 'weapon Skill' ? 'weapon' : m[1]; if (!out.includes(n)) out.push(n); }
  return out;
}
export function markEvent(state0) { const state = clone(state0); const p = here(state); if (p.event) p.event = { ...p.event, pending: false, done: true }; return state; }

// ---- searching a room (p. 116) ----
export const scavengePlan = () => makePlan([['check', 'd100'], ['loot', 'd20']]);
export function scavenge(state0, faces) {
  const state = clone(state0); const out = []; const p = here(state); const h = state.hero;
  const v = readPlan(scavengePlan(), faces); const rush = 10 * (h.madFx?.[5] || 0); const skill = Math.max(0, skillOf(h, 'Scavenge') - rush); const notes = rush ? [`You rush the search (Madness): -${rush}.`] : [];
  v.check = readD100(h, 'Scavenge', v.check, notes);
  p.searched = true;
  const pass = v.check <= skill;
  const rolls = [{ label: 'D100', value: v.check }];
  const ck = critKind(v.check, skill);
  if (!pass) {
    out.push({ id: uid(), kind: 'roll', title: 'Scavenge', text: `Rolled ${v.check} against ${skill}: you find nothing. ${notes.join(' ')}`, rolls, result: 'fail', place: p.id });
    if (ck === 'fumble') { // Noisy Search: roll on the Combat Encounters table (p. 73)
      critFx(state, 'Scavenging', ck, out, { handled: true });
      const e = encounter(state, rnd(6), rnd(20)); p.enc = e.enc; p.cleared = false;
      out.push({ id: uid(), kind: 'roll', title: 'Combat Encounter', text: `${encText(e)}.`, rolls: encRolls(e), page: e.page, place: p.id, creature: e.name });
      return finish(state, out, { combat: { name: e.name } });
    }
    return finish(state, out, {});
  }
  bump(h, 'scavenged'); darkRemind(state, 'search', out);
  let lootRoll = v.loot; let perkNote = '';
  if (ck === 'crit') { lootRoll = Math.min(20, lootRoll + 5); critFx(state, 'Scavenging', ck, out, { handled: true }); }
  if ((h.perks || []).includes('Scavenger')) { const d4 = rnd(4); const up = Math.min(20, lootRoll + d4), dn = Math.max(1, lootRoll - d4); const best = [up, dn].find((x) => x === 20) || (up >= 3 ? up : dn); lootRoll = best; perkNote = ` Scavenger D4 ${d4}: read as ${best}.`; }
  const row = SCAVENGE.find((r) => lootRoll >= r.lo && lootRoll <= r.hi); let extra = perkNote;
  if (row.coins) { const n = roll(row.coins); h.items.coins += n; bump(h, 'coinsEver', n); extra += ` (${n})`; }
  if (row.spoils) extra += ` ${rollSpoils(h).join('; ')}.`;
  if (row.supplies) { const n = roll(row.supplies); h.items.crafting += n; extra = ` (${n})`; }
  if (row.cooking) { const n = roll(row.cooking); h.items.cooking += n; extra = ` (${n})`; }
  if (h.mods?.scavengeCooking || has(h, 'Tracker', 1)) { h.items.cooking += 1; extra += ' Camp Familiarity: +1 Cooking Ingredient.'; }
  if (row.resolve) { const t = rnd(100); if (t > skillOf(h, 'Resolve')) { h.vit.sanity = Math.max(0, h.vit.sanity - 1); extra = ` Resolve ${t}: failed, -1 Sanity.`; } else extra = ` Resolve ${t}: passed.`; }
  rolls.push({ label: 'D20', value: v.loot });
  out.push({ id: uid(), kind: 'roll', title: 'Scavenge', text: `Rolled ${v.check} against ${skill}: success. D20 ${v.loot}: ${row.t}${extra} ${notes.join(' ')}`.trim(), rolls, page: 116, result: 'pass', place: p.id });
  return finish(state, out, {});
}

// ---- Critical Successes and Failures on checks (pp. 71-73): doubles under the skill, or doubles (or 100) over it ----
export const critKind = (v, target) => (v <= target ? (isDoubles(v) ? 'crit' : null) : (v === 100 || isDoubles(v) ? 'fumble' : null));
const CRIT_NAMES = {
  Acrobatics: ['Daring Manoeuvre', 'Catastrophic Tumble'], Athletics: ['Herculean Feat', 'Overexertion'], Dodge: ['Elusive Manoeuvre', 'Clumsy Misstep'],
  Endurance: ['Unwavering Resilience', 'Overwhelmed by Strain'], Initiative: ['Snap Reaction', 'Taken by Surprise'], Medicine: ['Miraculous Recovery', 'Harmful Treatment'],
  Perception: ['Heightened Awareness', 'Blind Spot'], Resolve: ['Unwavering Will', 'Mental Lapse'], Reason: ['Brilliant Deduction', 'Mental Block'],
  Scavenging: ['Good Find', 'Noisy Search'], Spellward: ['Unbreakable Will', 'Magical Vulnerability'], Stealth: ['Ghost in the Shadows', 'Flimsy Footing'],
  Thievery: ['Masterful Thief', 'Bungled Attempt'],
};
// what happens; `ctx.handled` names the parts the calling procedure applies itself (a Scavenging roll, a trap, double damage)
export function critFx(state, skill0, kind, out, ctx = {}) {
  const skill = skill0 === 'Scavenge' ? 'Scavenging' : skill0; const names = CRIT_NAMES[skill];
  if (!kind || !names) return null;
  const h = state.hero, v = h.vit, cb = state.combat, d = state.domain; let t = '';
  if (kind === 'crit') switch (skill) {
    case 'Acrobatics': h.nextAttackBonus = (h.nextAttackBonus || 0) + 30; t = 'Momentum and the rush of it: +30 to your next action.'; break;
    case 'Athletics': h.herculean = true; t = 'Your next successful attack is a Critical Strike, or the next door you force gives way at once, whichever comes first.'; break;
    case 'Dodge': if (cb) cb.flags.dodgeBonus = { n: 20, rounds: 2 }; t = cb ? '+20 to your Dodge for the next round.' : 'You are untouchable for a moment (+20 Dodge, if it comes to a fight this round).'; break;
    case 'Endurance': { const n = roll('d4'); v.health = Math.min(v.maxHealth, v.health + 1); v.exh = Math.max(0, v.exh - n); t = `You recover 1 Health and lose ${n} Exhaustion.`; break; }
    case 'Initiative': if (cb) cb.flags.playerAdv = true; t = 'Your next attack has Advantage.'; break;
    case 'Medicine': { const n = roll('d10'); v.tough = Math.min(v.maxTough, v.tough + n); t = `You recover ${n} Toughness.`; break; }
    case 'Perception': h.nextPer = 'adv'; t = 'Advantage on your next Perception check.'; break;
    case 'Resolve': { const n = roll('d4') + 1; v.sanity = Math.min(v.maxSanity, v.sanity + n); t = `You recover ${n} Sanity.`; break; }
    case 'Reason': { const it = (h.pack || []).find((x) => (x.kind === 'magic' || x.kind === 'relic') && !x.attuned);
      if (it) { it.attuned = true; recalcGear(h); t = `You understand the ${it.name} at once: it is identified without an Attunement Crystal.`; } else t = 'A breakthrough, though you carry nothing unknown to spend it on.'; break; }
    case 'Scavenging': t = ctx.handled ? '+5 to the roll on the Scavenging table.' : 'Your next look round is sharper (+5 on the Scavenging table).'; break;
    case 'Spellward': if (cb) cb.flags.spellRes = roll('d4'); t = cb ? `You are Resistant to damage from magic for ${cb.flags.spellRes} rounds.` : 'The magic finds no purchase on you.'; break;
    case 'Stealth': if (cb) cb.flags.autoHit = 2; else h.autoHitNext = true; t = 'If you attack in the next round, it strikes automatically.'; break;
    case 'Thievery': h.nextThief = 'adv'; t = 'Advantage on your next Thievery check.'; break;
    default: break;
  } else switch (skill) {
    case 'Acrobatics': { const n = roll('d6'); hurt(h, n); addEffect(h, 'Prone'); t = `You fall badly: ${n} Bludgeoning damage, and you are Prone.`; break; }
    case 'Athletics': { const n = roll('d4'); v.exh += n; t = `You push too hard: +${n} Exhaustion.`; break; }
    case 'Dodge': t = ctx.handled ? 'You take double damage from it.' : 'You misjudge it badly (double damage from what you were avoiding).'; break;
    case 'Endurance': { const n = roll('d4'); v.exh += n; t = `+${n} Exhaustion.`; break; }
    case 'Initiative': if (cb) cb.lose = true; t = 'You lose your first turn.'; break;
    case 'Medicine': { const n = roll('2d6'); hurt(h, n); t = `You make it worse: ${n} Bludgeoning damage.`; break; }
    case 'Perception': h.nextPer = 'dis'; t = 'Disadvantage on your next Perception check.'; break;
    case 'Resolve': { const n = roll('d4'); v.sanity = Math.max(0, v.sanity - n); t = `You lose ${n} Sanity.`; break; }
    case 'Reason': { const key = !d.lairFound ? 'lair' : !d.exitFound ? 'exit' : null; if (key) { d[key] = stepDie(d[key], 1); t = `You wander: the ${key === 'lair' ? 'Lair' : 'Domain Exit'} Die steps back up to D${d[key]}.`; } else t = 'You lose the thread, and your way, for a while.'; break; }
    case 'Scavenging': t = ctx.handled ? 'The noise draws something: roll on the Combat Encounters table.' : 'You make a lot of noise searching.'; break;
    case 'Spellward': t = ctx.handled ? 'The spell takes you fully: double damage, or twice as long.' : 'The magic floods in (double damage, or twice as long).'; break;
    case 'Stealth': if (cb) cb.flags.fumbleDis = 2; else h.disNext = true; t = 'Disadvantage on anything you do in the next round.'; break;
    case 'Thievery': t = 'You set off a trap you had missed.'; break;
    default: break;
  }
  out.push({ id: uid(), kind: 'note', title: `${kind === 'crit' ? 'Critical Success' : 'Critical Failure'}: ${names[kind === 'crit' ? 0 : 1]}`, text: t, rolls: [], page: skill === 'Acrobatics' || skill === 'Athletics' || skill === 'Dodge' ? 71 : skill === 'Scavenging' || skill === 'Spellward' || skill === 'Stealth' || skill === 'Thievery' ? 73 : 72, result: kind === 'crit' ? 'pass' : 'fail', place: state.here });
  return kind;
}
// a trap you had missed goes off where you stand (Thievery Critical Failure)
function trapUnderfoot(state) {
  const p = here(state); const tmp = { id: `trap-${uid()}`, trap: rnd(10), dir: 0, kind: 'door', trapped: true };
  p.doors.push(tmp);
  const r = springTrap(state, tmp.id, fakeFaces(trapPlan()));
  const q = here(r.state); q.doors = q.doors.filter((x) => x.id !== tmp.id); p.doors = p.doors.filter((x) => x.id !== tmp.id);
  return r;
}

// ---- checks the rules spring on you (walking blind, a Frightening foe, the Rot...): a prompt on the scroll you roll
// with the dice; anything left unrolled when you move on, fight or camp is rolled for you ----
function queueCheck(state, c, out) {
  const q = { id: uid(), page: 0, pass: [], fail: [], bonus: 0, ...c }; q.entry = uid();
  state.checks = [...(state.checks || []), q];
  out.push({ id: q.entry, kind: 'roll', title: c.title || `${q.skill} check`, text: q.why, rolls: [], page: q.page, place: state.here, queued: q.id,
    asks: [{ i: 0, skill: q.skill, text: q.why, purpose: q.purpose || '', passText: q.passText || '', failText: q.failText || '', pass: q.pass, fail: q.fail }] });
  return q;
}
function settleQueued(state, id, face, out, auto = false) {
  const h = state.hero; const q = (state.checks || []).find((x) => x.id === id); if (!q) return null;
  state.checks = state.checks.filter((x) => x.id !== id);
  const pen = penaltyOf(h, state.combat, q.skill); const target = Math.max(0, skillOf(h, q.skill) + pen.mod + (q.bonus || 0)); const notes = [...pen.notes];
  const v = readD100(h, q.skill, face, notes); const pass = v <= target; const ck = critKind(v, target);
  if (isDoubles(v)) h.marks[q.skill] = true;
  if (ck === 'fumble' && (q.skill === 'Dodge' || q.skill === 'Spellward')) state.double = true;
  const fx = applyEventEffects(state, pass ? q.pass : q.fail, out, { resolved: q.skill === 'Resolve' }); delete state.double;
  const said = pass ? q.passText : q.failText;
  const text = `${q.skill} ${v} against ${target}${auto ? ' (rolled for you as you moved on)' : ''}: ${pass ? 'passed' : 'failed'}.${said ? ` ${said}` : ''}${fx.lines.length ? ` ${fx.lines.join(', ')}.` : ''}${notes.length ? ` ${notes.join(' ')}` : ''}`;
  const entry = state.log.find((e) => e.queued === id);
  if (entry) entry.asks = [{ ...entry.asks[0], done: { value: v, target, pass, skill: q.skill, notes, effects: fx.lines, said, text } }];
  else out.push({ id: uid(), kind: 'roll', title: `${q.skill} check`, text, rolls: [{ label: q.skill, value: v }], result: pass ? 'pass' : 'fail', page: q.page, place: state.here });
  critFx(state, q.skill, ck, out, { handled: q.skill === 'Dodge' || q.skill === 'Spellward' });
  if (!pass) darkRemind(state, 'check', out);
  return { pass, combat: fx.combat, darkness: fx.darkness };
}
export function rollQueued(state0, id, faces) {
  const state = clone(state0); const out = [];
  const r = settleQueued(state, id, faces ? readPlan(checkPlan(), faces).check : rnd(100), out);
  return finish(state, out, { combat: r?.combat || null, darkness: r?.darkness || null });
}
function settleAllQueued(state, out) { for (const q of [...(state.checks || [])]) settleQueued(state, q.id, rnd(100), out, true); }

// Madness 8: the Skill you choose falls by 10
export function chooseMadSkill(state0, skill) {
  const state = clone(state0); const h = state.hero; if (!(h.madPick > 0)) return finish(state, [], {});
  const cur = h.skills[skill] ?? BASE_SKILLS[skill] ?? 0; h.skills[skill] = Math.max(0, cur - 10); h.madPick -= 1;
  return finish(state, [{ id: uid(), kind: 'note', title: 'Blocked out', text: `${skill} falls by 10, to ${h.skills[skill]}.`, rolls: [], page: 91, place: state.here }], {});
}

// ---- checks against a skill or resistance (p. 69) ----
export const checkPlan = () => makePlan([['check', 'd100']]);
export function skillCheck(state0, name, faces, why = '') {
  const state = clone(state0); const h = state.hero;
  const label = name === 'weapon' ? h.weapons[h.wield].skill : name; const target = skillOf(h, label); const notes = [];
  const v = readD100(h, label, readPlan(checkPlan(), faces).check, notes);
  const doubles = v % 11 === 0 && v < 100; const pass = v <= target;
  const res = pass ? (doubles ? 'Critical success' : 'Success') : (doubles || v === 100 ? 'Fumble' : 'Failure');
  if (doubles) h.marks[label] = true;
  if (pass && label === 'Reason' && here(state)?.event) bump(h, 'reasonEvents');
  const out = [{ id: uid(), kind: 'roll', title: `${label} check`, text: `Rolled ${v} against ${target}: ${res}.${doubles ? ' Doubles: the skill is marked for improvement at Camp.' : ''} ${notes.join(' ')}${why ? ` (${why})` : ''}`.trim(), rolls: [{ label: 'D100', value: v }], result: pass ? 'pass' : 'fail', place: state.here }];
  critFx(state, label, critKind(v, target), out);
  if (!pass) { gearRemind(state, 'fail', out); darkRemind(state, 'check', out); }
  return finish(state, out, { pass });
}

// ---- Combat (pp. 75-89; creatures pp. 131-203) ----
// Every creature fights from its own stat block: its D6 actions are read from their wording (physical attacks are
// opposed by your Dodge or Parry; magical ones and those that name a check are resisted with that check), its traits
// (Pack, Penetrating, Ruthlessness, Savage, Venomous, Frightening, Horrifying, Alert), its Level Adaptation, its
// type's resistances, the Overseer's Influence, and damage types against Armor (p. 82).
const isDoubles = (n) => n % 11 === 0 && n < 100;
export function opposedResult(aRoll, aSkill, dRoll, dSkill) {
  const aPass = aRoll <= aSkill, dPass = dRoll <= dSkill;
  const aCrit = aPass && isDoubles(aRoll), dCrit = dPass && isDoubles(dRoll); // only doubles are Critical (p. 71): 01 is not
  const aFumble = !aPass && (aRoll === 100 || isDoubles(aRoll)), dFumble = !dPass && (dRoll === 100 || isDoubles(dRoll));
  let winner = 'none';
  if (aCrit && !dCrit) winner = 'att'; else if (dCrit && !aCrit) winner = 'def';
  else if (aCrit && dCrit) winner = aRoll > dRoll ? 'att' : dRoll > aRoll ? 'def' : (aSkill >= dSkill ? 'att' : 'def');
  else if (aPass && dPass) winner = aRoll > dRoll ? 'att' : dRoll > aRoll ? 'def' : (aSkill >= dSkill ? 'att' : 'def');
  else if (aPass) winner = 'att'; else if (dPass) winner = 'def';
  return { winner, aPass, dPass, aCrit, dCrit, aFumble, dFumble };
}
const newFlags = () => ({ playerBonus: 0, playerPool: 0, enemyBonus: 0, enemyPool: 0, enemyDefPenalty: 0, playerDefPenalty: 0, playerAdv: false, enemyAdv: false, freeAim: false, defAdv: 0, concealed: 0, condShield: false });
const influenceOf = (state) => (state.domain?.overseerSlain || !state.domain?.overseer ? null : { roll: state.domain.overseer.roll, seed: state.domain.seed });
const kindOf = (p, a) => (a && a.kind) || p.enc.name;
// the stat block of a creature in the fight, adapted to your level and the Domain
export function foeStat(state, a = null) {
  const p = here(state); if (!p?.enc) return null;
  return gdFoe(state, statOf(known(kindOf(p, a)), state.hero.level || 1, influenceOf(state)));
}
const statFor = (state, name) => gdFoe(state, statOf(known(name), state.hero.level || 1, influenceOf(state)));
const newFoe = (s, n, kind = null) => ({ id: uid(), n, kind, health: s.health, max: s.health, wounds: [], conds: {}, buffs: [], temp: 0, down: {} });
export function makeEnemies(name, state = null, count = null) {
  const nm = known(name); const b = BESTIARY[nm];
  const s = state ? statFor(state, nm) : statOf(nm);
  const n = count ?? (typeof b.number === 'number' ? b.number : Math.max(1, roll(b.number)));
  return { name: nm, alive: Array.from({ length: n }, (_, i) => newFoe(s, i + 1)) };
}
// a Combat Encounter from the tables (pp. 133-134), or the First Domain's own (p. 244)
function encounter(state, d6, d20) {
  const e = encounterFor(state.domain.n, d6, d20);
  return { ...e, enc: makeEnemies(e.name, state) };
}
const encRolls = (e) => [e.d6 ? { label: 'D6 table', value: e.d6 } : null, { label: 'D20', value: e.d20 }].filter(Boolean);
const encText = (e) => `${e.table}${e.d6 ? ` (D6 ${e.d6})` : ''}, D20 ${e.d20}: ${e.name}`;

// ---- your conditions (pp. 88-89) ----
const effN = (h, name) => h.effects.find((e) => e.name === name)?.n || 0;
const CUMULATIVE = ['Bleeding', 'Poisoned', 'Sickened', 'Frightened', 'Stunned', 'Dazed', 'Cursed'];
export function addEffect(h, name, n = 1) {
  const e = h.effects.find((x) => x.name === name);
  if (e) e.n = CUMULATIVE.includes(name) ? e.n + n : Math.max(e.n, n); else h.effects.push({ name, n });
}
const dropEffect = (h, name) => { h.effects = h.effects.filter((e) => e.name !== name); };
export const LASTING = ['Bleeding', 'Poisoned', 'Burning'];
const RESTRAIN_SKILLS = ['Acrobatics', 'Dodge', 'Athletics', ...['Bladed Weapons', 'Bludgeoning Weapons', 'Shafted Weapons', 'Unarmed Combat & Fist Weapons']];
// penalties a check suffers from your conditions
function penaltyOf(h, cb, skill, { attack = false } = {}) {
  let mod = 0; const notes = [];
  const sick = effN(h, 'Sickened'); if (sick) { mod -= sick; notes.push(`Sickened -${sick}`); }
  if (skill === 'Spellward' && h.gd?.spellward) { mod -= 5 * h.gd.spellward; notes.push(`Growing Darkness -${5 * h.gd.spellward}`); }
  if (!cb && h.gd?.dull) { mod -= 10; notes.push('Growing Darkness: Demanding -10'); }
  if (effN(h, 'Freezing')) { const hypo = (h.effects.find((e) => e.name === 'Freezing')?.rooms || 0) >= 5; mod -= hypo ? 50 : 10; notes.push(hypo ? 'Hypothermia -50' : 'Freezing -10'); }
  if ((cb?.restrained || effN(h, 'Restrained')) && RESTRAIN_SKILLS.includes(skill)) { mod -= 20; notes.push('Restrained -20'); }
  if (cb?.flags?.weaponPen && WEAPON_SKILLS.includes(skill)) { mod -= cb.flags.weaponPen; notes.push(`Corroded -${cb.flags.weaponPen}`); }
  const fr = effN(h, 'Frightened'); if (attack && fr) { mod -= fr; notes.push(`Frightened -${fr}`); }
  return { mod, notes };
}
const heroPart = (loc) => (/Chest|Abdomen|Body|Thorax/.test(loc) ? 'Torso' : /Arm/.test(loc) ? 'Arms' : /Leg/.test(loc) ? 'Legs' : 'Head');
const heroArmor = (h, loc) => Math.max(0, (h.armor[heroPart(loc)] ?? (heroPart(loc) === 'Torso' ? h.armor.Torso : 0) ?? 0) - (h.armorDown?.[heroPart(loc)] || 0)) + ((h.combatBuffs || []).some((b) => b.name === 'Bloodskin') ? 1 : 0);
// what a weapon cuts with (p. 82): blades slash, points pierce, blunt things bludgeon
export function weaponType(w) {
  if (w.dtype) return w.dtype;
  if (/dagger|knife|pick|spear|rapier|stiletto|awl|pike|trident|javelin|lance|spike|fang/i.test(w.name)) return 'Piercing';
  if (/Bludgeoning|Unarmed/.test(w.skill)) return 'Bludgeoning';
  if (/Shafted/.test(w.skill)) return 'Piercing';
  return 'Slashing';
}
const rollWith = (expr, face, faceSides) => {
  const m = String(expr || '').toLowerCase().match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!m) return roll(expr);
  const n = Number(m[1]) || 1, sides = Number(m[2]); let t = 0;
  for (let i = 0; i < n; i++) t += (i === 0 && face && face <= sides && faceSides >= sides) ? face : rnd(sides);
  return t + (Number(m[3]) || 0);
};

// ---- starting a fight ----
export function startCombat(state0, surprised0 = false) {
  const state = clone(state0); const p = here(state); const out = []; const h = state.hero;
  const surprised = surprised0 || Boolean(h.surpriseNext); if (h.surpriseNext) { h.surpriseNext = false; out.push({ id: uid(), kind: 'combat', title: 'Caught napping', text: 'You can barely keep your eyes open: they surprise you (Growing Darkness).', rolls: [], page: 121 }); }
  const kinds = [...new Set(p.enc.alive.map((a) => kindOf(p, a)))];
  const s = foeStat(state);
  p.enc.alive.forEach((a) => { if (a.conds === undefined) Object.assign(a, { conds: {}, buffs: [], temp: 0, down: {} }); });
  state.combat = { piece: p.id, round: 1, side: 'player', flags: newFlags(), rally: 0, restrained: false, restrainedBy: null, lose: false, initiative: null, skip: {}, reactions: 0, target: null, lastHit: null, surprised: surprised && !traitOf(s, 'Alert'), turns: {} };
  h.combatBuffs = [];
  assignTargets(state);
  if (s.overseer && h.stunNextOverseer) { h.stunNextOverseer = false; p.enc.alive.forEach((a) => { a.conds = { ...(a.conds || {}), Stunned: 1 }; }); }
  if (s.overseer && h.stunOverseer) p.enc.alive.forEach((a) => { a.conds = { ...(a.conds || {}), Stunned: 1 }; });
  const fear = Math.max(0, ...kinds.map((k) => { const sk = foeStat(state, p.enc.alive.find((a) => kindOf(p, a) === k)); return traitOf(sk, 'Horrifying') ? 4 : traitOf(sk, 'Frightening') ? 2 : 0; }));
  if (fear) queueCheck(state, { title: fear === 4 ? 'Horrifying' : 'Frightening', skill: 'Resolve', page: 132, why: `The ${p.enc.name} ${fear === 4 ? 'is Horrifying' : 'are Frightening'}: one Resolve check for the whole group, or lose ${fear} Sanity.`, purpose: 'to hold your nerve', passText: 'You hold your nerve.', fail: [{ k: 'sanity', n: fear }] }, out);
  darkRemind(state, 'combat', out); gearRemind(state, 'combat', out);
  const lv = s.adapted.length ? ` Adapted to your level ${h.level || 1} (after level ${s.adapted.join(' and ')}).` : '';
  const inf = s.influence ? ` The Overseer's Influence makes it ${s.influence}.` : '';
  const arm = Object.keys(s.armor).length || s.armorPlus.length ? `, Armor ${Object.entries(s.armor).map(([k, v]) => `${v} (${k === '*' ? 'all' : k})`).join(', ')}${s.armorPlus.map((x) => ` +${x.n} (all${x.except ? ` but ${x.except}` : ''})`).join('')}` : '';
  out.push({ id: uid(), kind: 'combat', title: `${p.enc.name}`, text: `${p.enc.alive.length} ${p.enc.name}: Combat Skill ${s.combat}, Health ${s.health}${p.enc.alive.length > 1 ? ' each' : ''}, ${s.anatomy || 'no'} Hit Location${s.weak ? ` (Weak Spot: ${s.weak})` : ''}${arm}.${s.traits.length ? ` ${s.traits.map(traitText).join(', ')}.` : ''}${lv}${inf}${state.combat.surprised ? ' They surprised you.' : surprised ? ' It is Alert and cannot be surprised, so neither side is.' : ''}`.trim(), rolls: [], page: s.page, creature: p.enc.name, kinds });
  return finish(state, out, {});
}
export const initiativePlan = () => makePlan([['me', 'd100'], ['foe', 'd100']]);
export function rollInitiative(state0, faces) {
  const state = clone(state0); const cb = state.combat; const s = foeStat(state); const h = state.hero;
  const pre = []; settleAllQueued(state, pre); state.log.push(...pre);
  const v = readPlan(initiativePlan(), faces); const pen = penaltyOf(h, cb, 'Perception'); const wq = h.weapons[h.wield]?.quick ? 10 : 0; const ib = h.initBonus || 0; if (ib) h.initBonus = 0; const per = Math.max(0, skillOf(h, 'Perception') + pen.mod + wq + ib); const notes = [...pen.notes, ...(wq ? ['Quick weapon +10.'] : []), ...(ib ? [`The warning you read: +${ib}.`] : [])];
  v.me = readD100(h, 'Perception', v.me, notes);
  const r = opposedResult(v.me, per, v.foe, s.mind); const ck = critKind(v.me, per);
  // Freezing acts last (p. 88); a fumbled Initiative loses your first turn (p. 72)
  const first = cb.surprised || effN(h, 'Freezing') || ck === 'fumble' ? 'enemy' : (r.winner === 'att' ? 'player' : 'enemy');
  cb.initiative = first; cb.side = first; cb.enemyIdx = 0;
  if (first === 'player') heroTurnStarts(state, []);
  const out = [{ id: uid(), kind: 'combat', title: 'Initiative', text: `Your Perception ${v.me} against ${per}; their Mind ${v.foe} against ${s.mind}. ${first === 'player' ? 'You act first.' : 'They act first.'} ${notes.join(' ')}`.trim(), rolls: [{ label: 'You', value: v.me }, { label: 'Them', value: v.foe }], page: 76 }];
  critFx(state, 'Initiative', ck, out);
  return finish(state, out, {});
}

// ---- your attack ----
export const attackPlan = () => makePlan([['me', 'd100'], ['foe', 'd100'], ['loc', 'd20'], ['dmg', 'd6']]);
const packOf = (p, a, s) => (traitOf(s, 'Pack') ? 5 * p.enc.alive.filter((x) => x.id !== a.id && kindOf(p, x) === kindOf(p, a)).length : 0);
const buffSum = (a, k) => (a.buffs || []).reduce((t, b) => t + (b[k] || 0), 0);
const buffHas = (a, k) => (a.buffs || []).some((b) => b[k]);
// what a swing would be up against, for the odds shown before the roll
export function attackOdds(state, targetId, { aim = null, ...opts } = {}) {
  const p = here(state), cb = state.combat, h = state.hero; if (!p?.enc || !cb) return null;
  const t0 = p.enc.alive.find((a) => a.id === (targetId || cb.target)) || p.enc.alive[0]; if (!t0) return null;
  const tgt = { ...t0, conds: t0.conds || {}, buffs: t0.buffs || [] };
  const s = foeStat(state, tgt), w = h.weapons[h.wield];
  const pen = penaltyOf(h, cb, w.skill, { attack: true });
  const ab = opts.ability || {};
  const ded = has(h, 'Weapon Master') && (h.dedicated === w.name || (w.bonus === 'd4' && !h.dedicated)) ? 10 : 0;
  const dual = h.dual && dualOk(h) ? (has(h, 'Stormbrand') ? 0 : -40) : 0;
  const trade = cb.flags.wmTrade ? -30 : 0;
  const expl = t0.exploited ? 10 : 0;
  const mine = Math.max(0, skillOf(h, w.skill) + 10 + (w.simple ? 10 : 0) + cb.flags.playerBonus + pen.mod + ded + dual + trade + expl + (ab.bonus || 0) + (h.nextAttackBonus || 0));
  const pack = packOf(p, tgt, s), shield = buffSum(tgt, 'defence');
  const held = tgt.conds.Stunned > 0 || tgt.conds.Paralyzed > 0 || tgt.conds.Sleeping;
  const tRes = tgt.conds.Restrained ? 20 : 0;
  const fm = foeMods(t0); const invis = combatBuff(h, 'Invisible') ? 40 : 0;
  const theirs = held || ab.undefendable ? 0 : Math.max(0, s.combat + pack + (cb.rally ? 10 : 0) + shield - w.speed - cb.flags.enemyDefPenalty - tRes + fm.defence - invis);
  const adv = cb.flags.playerAdv || Boolean(tgt.conds.Prone);
  const unaware = Boolean(opts.ability?.freeAim) || (has(h, 'Duskblade') && ((cb.surprisedThem && !cb.struck) || combatBuff(h, 'Invisible')));
  const dis = (buffHas(tgt, 'disadv') || cb.flags.fumbleDis > 0 || h.disNext || effN(h, 'Prone') > 0 || effN(h, 'Enfeebled') > 0 || (aim && !cb.flags.freeAim && !unaware)) && !(aim && (cb.flags.freeAim || unaware) && !buffHas(tgt, 'disadv'));
  const auto = Boolean(tgt.conds.Paralyzed || tgt.conds.Sleeping || cb.flags.autoHit > 0 || h.autoHitNext);
  const notes = ['Upper hand +10', w.simple ? 'Simple +10' : null, w.broken ? `${w.name} is broken: D4 like a bare fist` : null, w.speed ? `${w.name} Speed ${w.speed} lowers theirs` : null, pack ? `Pack +${pack} to theirs` : null, shield ? `+${shield} to its defence` : null, cb.rally ? 'Rallied +10 to theirs' : null,
    held ? 'It cannot defend itself' : null, ab.undefendable ? 'It cannot defend against this' : null, tRes ? 'It is Restrained: -20' : null, ded ? 'Dedication +10' : null, dual ? `Two weapons ${dual}` : null, trade ? 'One With Your Weapon -30' : null, expl ? 'Exploit Weakness +10' : null, fm.defence ? `Its curses ${fm.defence}` : null, invis ? 'You are invisible: -40 to theirs' : null, ab.bonus ? `${ab.ability} ${ab.bonus}` : null, ...pen.notes, adv ? 'Advantage' : null, dis ? 'Disadvantage' : null, aim ? `Aiming at the ${aim}` : null, buffHas(tgt, 'defenceAdv') ? 'Its defence has Advantage' : null].filter(Boolean);
  return { mine, theirs, adv, dis, auto, tgt, s, notes };
}
const adv2 = (v, adv, dis) => { if (adv === dis) return v; const sw = swapDigits(v); return adv ? Math.min(v, sw) : Math.max(v, sw); };
// damage to a creature: Temporary Health first, then Health; returns the text
function woundFoe(state, tgt, s, n, dtype, { crit = false, loc = null, magical = false, out = null } = {}) {
  const res = damageAfter(n, dtype, { armor: loc ? armorAt(s, loc, tgt.down) : 0, crit, def: s.def, buffs: tgt.buffs, magical });
  if (res.heal) { tgt.health = Math.min(tgt.max, tgt.health + res.heal); return { net: 0, notes: res.notes, healed: res.heal }; }
  let left = res.net; const fromTemp = Math.min(tgt.temp || 0, left); tgt.temp = (tgt.temp || 0) - fromTemp; left -= fromTemp;
  tgt.health = Math.max(0, tgt.health - left);
  if (loc) tgt.wounds.push({ loc, dmg: res.net, crit });
  return { net: res.net, notes: res.notes };
}
function killFoe(state, tgt, out, skill = null) {
  const p = here(state); const s = foeStat(state, tgt);
  p.enc.alive = p.enc.alive.filter((x) => x.id !== tgt.id);
  p.enc.slain = [...(p.enc.slain || []), kindOf(p, tgt)];
  const hh = state.hero; bump(hh, 'kills'); for (const t of s.type || []) bump(hh, `killsType.${t}`); if (skill) bump(hh, `killsSkill.${skill}`); if (s.overseer) bump(hh, 'overseers');
  if (infHas(s, 'Unstable')) { hurt(state.hero, 1); out?.push({ id: uid(), kind: 'combat', title: 'Unstable', text: 'It bursts as it dies: 1 Arcane damage to you (the Overseer\'s Influence).', rolls: [], place: p.id }); }
  if (skill && hh.reaper && !s.overseer) { hh.reaper = false; const m = newMinion(hh, 'Skeleton'); out?.push({ id: uid(), kind: 'combat', title: 'The thorned dagger', text: `It rises again as your Skeleton (${m.health} Health) and turns on its kin.`, rolls: [], page: 214, place: p.id }); if (state.combat) assignTargets(state); }
  if (state.combat?.restrainedBy === tgt.id) { state.combat.restrained = false; state.combat.restrainedBy = null; dropEffect(state.hero, 'Restrained'); }
}
const fixFoes = (p) => p?.enc?.alive.forEach((a) => { a.conds = a.conds || {}; a.buffs = a.buffs || []; a.down = a.down || {}; a.temp = a.temp || 0; a.wounds = a.wounds || []; });
export function playerAttack(state0, faces, opts = {}) {
  if (state0.over) return { state: state0, out: [] };
  const state = clone(state0); fixFoes(here(state)); const cb = state.combat; const p = here(state); const h = state.hero; const w = h.weapons[h.wield];
  const out = []; const v = readPlan(attackPlan(), faces); const notes = [];
  for (const [k, n] of [['me', 100], ['foe', 100], ['loc', 20], ['dmg', 6]]) if (!(v[k] >= 1)) v[k] = rnd(n); // a die that was not thrown is rolled here
  if (!p?.enc?.alive.length) return p?.enc ? victory(state, out) : finish(state, out, {});
  if (w.twoHanded && handFull(h)) return finish(state, [{ id: uid(), kind: 'note', title: 'Both hands', text: `The ${w.name} needs both hands, and one holds your light. ${h.lightSource === 'oil' ? 'Set the Lamp down first, or' : 'Swap to'} a one-handed weapon.`, rolls: [], page: 96, remind: 'hands' }], {});
  const basicOnly = effN(h, 'Blinded') > 0 || inDark(h) || effN(h, 'Prone') > 0;
  if (basicOnly && opts.aim) { notes.push(`${effN(h, 'Prone') ? 'Prone' : 'Blinded'}: you cannot aim, so the blow falls where it may.`); opts = { ...opts, aim: null }; }
  const odds = attackOdds(state, opts.targetId, { aim: opts.aim, ability: opts.ability }); const { tgt, s } = odds; const ab = opts.ability || {};
  h.nextAttackBonus = 0; h.autoHitNext = false; h.disNext = false; if (cb.flags.autoHit) cb.flags.autoHit = 0;
  const curse = effN(h, 'Enfeebled') > 0; if (curse) { dropEffect(h, 'Enfeebled'); notes.push('The Magus\'s curse gives this attack Disadvantage.'); }
  v.me = readD100(h, w.skill, v.me, notes, { adv: odds.adv, dis: odds.dis });
  const foeRoll = adv2(v.foe, buffHas(tgt, 'defenceAdv'), false);
  if (opts.aim) cb.flags.freeAim = false; cb.struck = true;
  cb.flags.enemyDefPenalty = 0; cb.flags.playerBonus = 0; cb.flags.playerAdv = false;
  if (cb.flags.concealedMe) cb.flags.concealed = 0; // attacking breaks Concealed
  const r = odds.auto ? { winner: 'att', aPass: true, dPass: false, aCrit: false, dCrit: false, aFumble: false } : opposedResult(v.me, odds.mine, foeRoll, odds.theirs);
  const rolls = [{ label: 'You', value: v.me }, { label: 'Them', value: foeRoll }];
  const who = `${kindOf(p, tgt)}${p.enc.alive.length > 1 || tgt.n > 1 ? ` ${tgt.n}` : ''}`;
  let text = odds.auto ? `${who} cannot move: the blow lands without a check. ` : `You ${v.me} against ${odds.mine}; ${who} ${foeRoll} against ${odds.theirs}. `;
  const card = { id: uid(), kind: 'combat', title: ab.ability ? `${ab.ability} with the ${w.name}` : `You strike with the ${w.name}`, rolls, result: null, place: p.id, creature: kindOf(p, tgt) };
  if (combatBuff(h, 'Invisible')) h.combatBuffs = h.combatBuffs.filter((b) => b.name !== 'Invisible'); // attacking ends it
  const dmgSides = Number(String(w.dmg).replace(/^\d*d/i, '')) || 6;
  if (r.aFumble && h.lampDown) {
    h.lampDown = false; h.vit.light = 0; h.lightSource = null; addEffect(h, 'Blinded', 99);
    text += 'Fumble! You kick the Lamp you set down: the oil spills and burns out, and you are Blinded.';
    if (!r.dPass) { const res = woundFoe(state, tgt, s, 1, 'Force'); text += ` Both of you failed, so it takes ${res.net} damage that cannot be avoided.`; }
    card.result = 'fumble';
  } else if (r.aFumble) {
    const fr = rnd(10), f = PLAYER_FUMBLE[fr - 1]; text += `Fumble! D10 ${fr}: ${f.t}`;
    if (fr === 4 && beltOn(h)) { const slot = rnd(4); const it = beltItems(h)[slot - 1]; if (it) { h.pack = h.pack.filter((x) => x.id !== it.id); text += ` Belt check D4 ${slot}: the ${it.name} is destroyed.`; } else text += ` Belt check D4 ${slot}: that slot was empty.`; }
    else if (f.hit) { const n = f.hit === 'crit' ? rollWith(w.dmg) * 2 : roll(f.hit); hurt(h, n); text += ` (${n} damage to you)`; }
    if (f.aether) { const n = roll('d8'); if (h.vit.aether > 0) h.vit.aether = Math.max(0, h.vit.aether - n); else hurt(h, 1); text += ` (Aether -${n})`; }
    if (fr === 6 || fr === 7) addEffect(h, 'Prone');
    if (fr === 7) addEffect(h, 'Dazed', 2);
    if (fr === 3) { w.broken = true; text += ' It is broken until you repair it at Camp.'; }
    if (f.lose) cb.lose = true;
    if (!r.dPass) { const res = woundFoe(state, tgt, s, 1, 'Force'); text += ` Both of you failed, so it takes ${res.net} damage that cannot be avoided.`; }
    card.result = 'fumble';
  } else if (r.winner === 'att') {
    const hl = opts.aim ? { name: opts.aim, weak: opts.aim === s.weak } : hitLocation(s.anatomy, v.loc, s.weak);
    const herc = Boolean(h.herculean); h.herculean = false; if (herc) notes.push('Herculean Feat: a Critical Strike.');
    const crit = (r.aCrit || hl.weak || ab.autoCrit || herc) && !infHas(s, 'Tough');
    const frost = holding(h, 'Frost Weapon');
    const brawl = has(h, 'Brawler') && /Unarmed/.test(w.skill);
    const baseDie = ab.replaceDmg || (frost ? 'd8' : brawl && /^d4$/i.test(w.dmg) ? 'd6' : w.dmg);
    const pool = [w.broken && !has(h, 'Weapon Master', 5) ? rnd(4) : rollWith(baseDie, v.dmg, 6)];
    const types = [ab.dtype || (frost ? 'Cold' : null)];
    const add = (die, dtype = null) => { pool.push(roll(die)); types.push(dtype); };
    if (w.bonus) add(w.bonus);
    else if (has(h, 'Weapon Master') && h.dedicated === w.name) add('d4');
    if (brawl) add('d4', 'Bludgeoning');
    if (cb.flags.playerPool) { add('d6'); cb.flags.playerPool = 0; }
    for (const d of h.poolDice || []) add(d.die, d.dtype);
    if ((h.timed || []).some((t) => t.frenzy && t.rounds > 0)) add('2d6');
    for (const sx of susList(h)) { const f2 = ABILITY[sx.name]?.sustain; if (f2?.pool) add(f2.pool.die, f2.pool.dtype); }
    if (w.sigil) add('d10', 'Arcane');
    if ((cb.icons || []).some((i) => i.kind === 'Strength')) add('2d4', 'Bludgeoning');
    for (const x of ab.pool || []) (typeof x === 'string' ? add(x) : add(x.die, x.dtype));
    if (ab.noDamage) { pool.length = 0; types.length = 0; pool.push(0); types.push(null); }
    const fm2 = foeMods(tgt);
    const fixed = ab.noDamage ? 0 : (h.dmgMod || 0) + (w.plus || 0) + (frost ? 1 : 0) + (w.versatile && !h.shield && !handFull(h) ? 1 : 0) + ((h.skillDmg || []).includes(w.skill) ? 1 : 0) + ((h.dealtPlus || {})[weaponType(w)] || 0)
      + (h.dual && dualOk(h) ? 1 : 0) + (tgt.exploited ? 1 : 0) + (has(h, 'Hexmancer') && fm2.cursed ? 1 : 0) + (fm2.enfeebled ? 1 : 0);
    let dmg = Math.max(...pool) + fixed; if (opts.push && h.vit.exh + 2 <= 25) { dmg += 1; h.vit.exh += 2; }
    // Precision Striker: re-roll a Critical Strike's damage, keeping the better
    if (crit && (h.perks || []).includes('Precision Striker')) { const again = Math.max(rollWith(w.dmg), ...pool.slice(1)) + fixed; if (again > dmg) { notes.push(`Precision Striker re-roll: ${again}.`); dmg = again; } }
    const triple = crit && (h.tripleCrit || []).some((t) => s.type.includes(t));
    if (crit) dmg *= triple ? 3 : 2;
    const best = pool.indexOf(Math.max(...pool));
    const psychic = has(h, 'Weapon Master', 5) && !ab.replaceDmg;
    const dtype = psychic ? 'Psychic' : types[best] || weaponType(w);
    const bare = w.ignoreArmor || frost || psychic || fm2.noArmor;
    const res = ab.noDamage ? { net: 0, notes: [] } : woundFoe(state, tgt, s, dmg, dtype, { crit, loc: bare ? null : hl.name });
    if (bare && !ab.noDamage) tgt.wounds.push({ loc: hl.name, dmg: res.net, crit });
    if (res.net && has(h, 'Wrathspawn', 5)) { healWounds(h, 1); notes.push('Vicious Warrior: you heal 1 Wound.'); }
    if (ab.onHitCond && !s.def.immuneConds.includes(ab.onHitCond[0])) { tgt.conds[ab.onHitCond[0]] = (tgt.conds[ab.onHitCond[0]] || 0) + ab.onHitCond[1]; notes.push(`${ab.onHitCond[0]} (${ab.onHitCond[1]}).`); }
    if (ab.onHitExtra) { const rr = woundFoe(state, tgt, s, roll(ab.onHitExtra.die), ab.onHitExtra.dtype); notes.push(`A free blow with your shield: ${rr.net} ${ab.onHitExtra.dtype}.`); }
    if (ab.onHitZeroArmor) { tgt.down[hl.name] = 99; notes.push(`Its ${hl.name} has no Armor left.`); }
    if (ab.onHitNextDef) { cb.flags.nextDefBonus = (cb.flags.nextDefBonus || 0) + ab.onHitNextDef; notes.push(`+${ab.onHitNextDef} to your next defence.`); }
    bump(h, `dmg.${dtype}`, res.net); if (crit) bump(h, 'crits');
    // damage of other kinds riding on the blow: a magic weapon's, Flaming oil, Annihilator's D4 Psychic
    const riders = [...(w.extra || []), ...((h.timed || []).filter((t) => t.extra && t.rounds > 0).map((t) => t.extra)), ...(h.psychicD4 ? [{ die: 'd4', dtype: 'Psychic' }] : [])];
    const riderTxt = riders.map((r) => { const rr = woundFoe(state, tgt, s, roll(r.die), r.dtype); bump(h, `dmg.${r.dtype}`, rr.net); return `+${rr.net} ${r.dtype}`; });
    if (h.poisonNext && res.net > 0 && !s.def.immuneConds.includes('Poisoned')) { tgt.conds.Poisoned = (tgt.conds.Poisoned || 0) + 1; h.poisonNext = false; riderTxt.push('Poisoned (1)'); }
    const props = w.from ? ((h.pack || []).find((x) => x.id === w.from)?.properties || []) : [];
    for (const pr of props) {
      if (/Bleeding \(1\)/.test(pr.t) && res.net && !s.def.immuneConds.includes('Bleeding')) { tgt.conds.Bleeding = (tgt.conds.Bleeding || 0) + 1; riderTxt.push('Bleeding (1)'); }
      if (/Poisoned \(1\)/.test(pr.t) && res.net && !s.def.immuneConds.includes('Poisoned')) { tgt.conds.Poisoned = (tgt.conds.Poisoned || 0) + 1; riderTxt.push('Poisoned (1)'); }
    }
    if (riderTxt.length) notes.push(`Also: ${riderTxt.join(', ')}.`);
    cb.lastHit = { enemy: tgt.id, loc: hl.name, dmg: res.net, by: 'you' };
    text += `Hit on the ${hl.name}${opts.aim ? '' : ` (D20 ${v.loc})`}${crit ? `, a Critical Strike${hl.weak && !r.aCrit ? ' on its Weak Spot' : ''}, so the damage is ${triple ? 'tripled' : 'doubled'}` : (r.aCrit || hl.weak) && infHas(s, 'Tough') ? ' (the Overseer\'s Influence makes it immune to Critical Strikes)' : ''}. Damage pool ${pool.join(', ')}${h.dmgMod ? ` +${h.dmgMod}` : ''}: ${dmg} ${dtype}${res.notes.length ? `, ${res.notes.join(', ')}` : ''} = ${res.healed ? `it is healed for ${res.healed}` : res.net}.`;
    card.result = crit ? 'crit' : 'hit'; card.hit = { loc: hl.name, dmg: res.net, crit };
    if (tgt.health <= 0) { text += ` ${who} is destroyed.`; killFoe(state, tgt, out, w.skill); if (ab.onKillSanity) { const n2 = roll(ab.onKillSanity); h.vit.sanity = Math.min(h.vit.maxSanity, h.vit.sanity + n2); text += ` You drink its soul: +${n2} Sanity.`; } }
    else if (tgt.conds.Sleeping) delete tgt.conds.Sleeping;

  } else if (r.winner === 'def') {
    const dm = rnd(10); text += `${who} fends you off. Its Defensive Move (D10 ${dm}): ${NPC_DEFENSIVE[dm - 1]}`;
    applyNpcDefMove(state, dm, tgt, out);
    card.result = 'parried';
  } else { const res = woundFoe(state, tgt, s, 1, 'Force'); text += `Both of you fail: ${who} takes ${res.net} damage that cannot be avoided.`; card.result = 'both-fail'; if (tgt.health <= 0) killFoe(state, tgt, out); }
  card.text = `${text} ${notes.join(' ')}`.trim(); out.unshift(card);
  // Fast Strike: a hit earns a second, free attack on the same target
  if (ab.onHitAgain && !ab.again && (card.result === 'hit' || card.result === 'crit') && p.enc.alive.some((x) => x.id === tgt.id)) {
    const mid = finish(state, out, {}).state; return playerAttack(mid, fakeFaces(attackPlan()), { targetId: tgt.id, ability: { ...ab, again: true } });
  }
  if (ab.selfDefPenalty) cb.flags.playerDefPenalty = (cb.flags.playerDefPenalty || 0) + ab.selfDefPenalty;
  if (ab.selfNoDefence) cb.flags.noDefence = true;
  if (ab.free) return p.enc.alive.length ? finish(state, out, {}) : victory(state, out);
  return endPlayerTurn(state, out);
}
// two One-Handed weapons in hand (p. 84)
const dualOk = (h) => !handFull(h) && (h.weapons || []).filter((w) => !w.twoHanded && !/fist/i.test(w.name)).length >= 2;
function applyNpcDefMove(state, dm, foe, out) {
  const cb = state.combat, h = state.hero;
  if (dm === 1) cb.flags.enemyBonus += 10;
  if (dm === 2) { h.armorDown = h.armorDown || {}; const part = ['Torso', 'Arms', 'Legs', 'Head'][rnd(4) - 1]; if (h.armor[part]) h.armorDown[part] = (h.armorDown[part] || 0) + 1; cb.armorDowns = [...(cb.armorDowns || []), part]; }
  if (dm === 3 && !cb.flags.condShield) addEffect(h, 'Bleeding', 1);
  if (dm === 4 && foe) foe.conds = {};
  if (dm === 5) hurt(h, 1);
  if (dm === 6) cb.flags.enemyPool = 1;
  if (dm === 7) cb.flags.enemyAdv = true;
  if (dm === 8) cb.flags.playerDefPenalty = 20;
  if (dm === 9 && foe) foe.health = Math.min(foe.max, foe.health + roll('d4'));
  if (dm === 10) cb.extraEnemyTurn = foe?.id || true;
}
function applyPlayerDefMove(state, dm, foe, loc, out) {
  const cb = state.combat, h = state.hero, p = here(state);
  if (dm === 1) cb.flags.playerBonus += 10;
  if (dm === 2 && foe) { const s = foeStat(state, foe); const l = loc || hitLocation(s.anatomy, rnd(20), s.weak).name; foe.down[l] = (foe.down[l] || 0) + 1; }
  if (dm === 3 && foe) { const s = foeStat(state, foe); if (!s.def.immuneConds.includes('Bleeding')) foe.conds.Bleeding = (foe.conds.Bleeding || 0) + 1; }
  if (dm === 4) cb.flags.condShield = true;
  if (dm === 5 && foe) { foe.health = Math.max(0, foe.health - 1); if (foe.health <= 0) killFoe(state, foe, out); }
  if (dm === 6) cb.flags.playerPool = 1;
  if (dm === 7) cb.flags.playerAdv = true;
  if (dm === 8) cb.flags.enemyDefPenalty = 20;
  if (dm === 9) h.vit.tough = Math.min(h.vit.maxTough, h.vit.tough + healAmt(h, 2));
  if (dm === 10) cb.flags.freeAim = true;
  return p;
}
function endPlayerTurn(state, out) {
  const p = here(state), cb = state.combat, h = state.hero;
  if (!p.enc.alive.length) return victory(state, out);
  // end of your turn: Frightened eases by 10 (p. 89)
  const fr = h.effects.find((e) => e.name === 'Frightened'); if (fr) { fr.n -= 10; if (fr.n <= 0) dropEffect(h, 'Frightened'); }
  if (cb.extraAction > 0) { cb.extraAction -= 1; out.push({ id: uid(), kind: 'combat', title: 'Another action', text: 'You act again before they can answer.', rolls: [], place: p.id }); return finish(state, out, {}); }
  minionsAct(state, out); if (!p.enc.alive.length) return victory(state, out);
  cb.side = 'enemy'; cb.enemyIdx = 0; cb.turns = {}; cb.flags.condShield = false;
  // creatures shed buffs that last "until its next turn" when that turn comes; see enemyTurn
  return finish(state, out, {});
}
function victory(state, out) {
  const p = here(state), h = state.hero, v = h.vit; const t = healAmt(h, roll('d4'));
  const slain = p.enc.slain || [p.enc.name]; const overseer = BESTIARY[p.enc.name]?.overseer;
  p.corpses = (p.corpses || 0) + slain.filter((n2) => (BESTIARY[n2]?.type || []).some((t) => t === 'Humanoid' || t === 'Animal')).length;
  if (has(h, 'Abyssal Reaver')) { v.temp = (v.temp || 0) + 1; out.push({ id: uid(), kind: 'combat', title: "Conqueror's Vitality", text: '+1 Temporary Toughness.', rolls: [], place: p.id }); }
  (h.minions || []).forEach((m) => { m.health = m.max; }); h.combatBuffs = [];
  v.tough = Math.min(v.maxTough, v.tough + t); v.xp += (overseer ? 200 : 50) + (overseer ? 0 : 10 * (state.domain?.extraInf || []).length * slain.length);
  const spoils = spoilsOf(state, slain, out, BESTIARY);
  if (state.combat?.hitsTaken) integrityRolls(state, out);
  p.enc = null; p.cleared = true; p.event = p.event || (overseer ? null : { pending: true });
  state.combat = null; h.lampDown = false;
  h.effects = h.effects.filter((e) => !['Restrained', 'Festering wound', 'Prone', 'Stunned', 'Dazed', 'Frightened', 'Charmed', 'Paralyzed', 'Blinded', 'Enfeebled'].includes(e.name));
  h.armorDown = {};
  out.push({ id: uid(), kind: 'combat', title: 'Victory', text: `The fight is over. +${overseer ? 200 : 50} XP, and you recover ${t} Toughness.${spoils}`, rolls: [], result: 'won', place: p.id });
  if (overseer) {
    p.lair = false; p.overseerDown = true; state.domain.overseerSlain = true;
    const san = roll('d4'); v.sanity = Math.min(v.maxSanity, v.sanity + san);
    out.push({ id: uid(), kind: 'combat', title: 'The Overseer falls', text: `${slain[0]} is dead. Its Influence lifts from every creature in this Domain, and you recover ${san} Sanity.`, rolls: [], page: 179, place: p.id });
  }
  return finish(state, out, { won: true });
}

// ---- a creature's turn: its D6 action, then your defence or resistance ----
export const enemyPlan = () => makePlan([['act', 'd6'], ['foe', 'd100'], ['me', 'd100'], ['loc', 'd20'], ['dmg', 'd8'], ['save', 'd100']]);
const CHECK_SKILL = { Body: 'Athletics', Mind: 'Perception' };
function heroSave(state, name, faceV, notes, against = null) {
  const h = state.hero, cb = state.combat; const nm = CHECK_SKILL[name] || name;
  const pen = penaltyOf(h, cb, nm); notes.push(...pen.notes);
  const spell = nm === 'Spellward' && cb.flags.spellPenalty ? cb.flags.spellPenalty : 0; if (spell) notes.push(`Spellward -${spell}`);
  const target = Math.max(0, skillOf(h, nm) + pen.mod - spell);
  const val = readD100(h, nm, faceV, notes, { adv: cb.flags.defAdv > 0, dis: nm === 'Spellward' && cb.flags.spellDis });
  const ck = critKind(val, target);
  if (ck) { const o2 = []; critFx(state, nm, ck, o2, { handled: nm === 'Spellward' || nm === 'Dodge' }); state.log.push(...o2); }
  if (against != null) { const o = opposedResult(val, target, rnd(100), against); return { ok: o.winner === 'att', val, target, opposed: against, ck }; }
  return { ok: val <= target, val, target, ck };
}
// conditions a creature's action lays on you; Stunned (X) and the like come from the action's own words
function afflict(state, act, en, out, notes) {
  const h = state.hero, cb = state.combat; if (cb.flags.condShield) { if (act.conds?.length) notes.push('Your Defensive Move keeps you free of conditions.'); return; }
  const immune = heroDef(h).immuneConds;
  for (const c of act.conds || []) {
    if (immune.includes(c.name)) { notes.push(`You are immune to ${c.name}.`); continue; }
    if (c.name === 'Restrained') { cb.restrained = true; cb.restrainedBy = en.id; const m = act.text.match(/(?:taking|takes?|suffers?) (\d+) (\w+) damage/); cb.restrainDmg = m ? { n: Number(m[1]), type: m[2], ignore: /ignores Armor/.test(act.text) } : null; addEffect(h, 'Restrained'); notes.push('You are Restrained.'); continue; }
    if (c.name === 'Concealed') continue;
    const rounds = Number((act.text.match(/for (\d+) rounds?/) || [])[1]) || c.n || 1;
    addEffect(h, c.name, ['Frightened', 'Sickened'].includes(c.name) ? (c.n > 1 ? c.n : 10) : ['Bleeding', 'Poisoned'].includes(c.name) ? c.n : rounds);
    notes.push(`You are ${c.name}${c.n > 1 ? ` (${c.n})` : ''}.`);
  }
  if (/festering wound/.test(act.text)) { addEffect(h, 'Festering wound'); notes.push('A festering wound: 1 Necrotic damage at the start of each of your turns.'); }
  if (/Disadvantage on its next attack roll or Skill check/.test(act.text)) addEffect(h, 'Enfeebled');
}
function hurtHero(state, n, dtype, loc, s, en, { crit = false, penetrating = 0, ignore = false } = {}) {
  const h = state.hero; const armor = ignore || !loc ? 0 : heroArmor(h, loc);
  const res = damageAfter(n, dtype, { armor, crit, penetrating, def: heroDef(h) });
  const red = (h.reduce || {})[dtype] || 0; if (red && res.net) { res.net = Math.max(0, res.net - red); res.notes.push(`${red} ${dtype} reduction`); }
  if (res.heal) res.net = 0;
  if (state.combat) state.combat.hitsTaken = (state.combat.hitsTaken || 0) + 1;
  if (dtype === 'Acid' && loc && h.armor[heroPart(loc)]) { h.armorDown = h.armorDown || {}; h.armorDown[heroPart(loc)] = (h.armorDown[heroPart(loc)] || 0) + 1; res.notes.push(`Acid eats 1 Armor from your ${heroPart(loc)}`); }
  hurt(h, res.net);
  if (loc) h.wounds = [...(h.wounds || []), { loc, dmg: res.net, crit, by: kindOf(here(state), en) }].slice(-24);
  return res;
}
// your own resistances: the Rot (stage 1: immune to Necrotic, vulnerable to Holy) and attuned gear
function heroDef(h) {
  const mm = heroMods(h);
  const d = { vuln: [], resist: [...(h.gearFx?.resist || []), ...mm.resist], immune: [...mm.immune], restored: [...mm.restored], immuneConds: [...(h.gearFx?.immune || []), ...mm.immuneConds], resistPhysical: false };
  if (h.rot >= 1) { d.immune.push('Necrotic'); d.vuln.push('Holy'); }
  return d;
}
function corrupt(state, s, net, notes) {
  if (!infHas(s, 'Corrupting') || net < 5) return;
  const t = rnd(100), r = skillOf(state.hero, 'Resolve'); if (t > r) { state.hero.vit.sanity = Math.max(0, state.hero.vit.sanity - 1); notes.push(`Corrupting: Resolve ${t} failed, -1 Sanity.`); } else notes.push(`Corrupting: Resolve ${t} held.`);
}
function venom(state, s, net, notes) {
  if (!traitOf(s, 'Venomous') || net <= 0) return;
  const t = rnd(100), e = skillOf(state.hero, 'Endurance'); if (t > e && !state.combat.flags.condShield) { addEffect(state.hero, 'Poisoned', 1); notes.push(`Venomous: Endurance ${t} failed, Poisoned (1).`); } else notes.push(`Venomous: Endurance ${t} resisted.`);
}
function specialAction(state, en, s, act, sp, v, out, card) {
  const p = here(state), cb = state.combat, h = state.hero; const who = card.who;
  if (sp.buff) { const turns = sp.turns ? roll(sp.turns) : 1; en.buffs = [...(en.buffs || []).filter((b) => b.from !== act.name), { ...sp.buff, from: act.name, turns }]; return `${who} ${sp.t}.`; }
  if (sp.temp) { const add = sp.temp === 'halfMax' ? Math.floor(en.max / 2) : Math.floor(en.health / 2); en.temp = Math.min(sp.cap ? en.max * sp.cap - en.health : 999, (en.temp || 0) + add); return `${who} ${sp.t}: +${add} Temporary Health.`; }
  if (sp.rally) { cb.rally = 1; return `${who} screeches: ${sp.t}.`; }
  if (sp.curse) { addEffect(h, 'Enfeebled'); return `${who} curses you: ${sp.t}.`; }
  if (sp.summon) {
    const have = p.enc.alive.filter((a) => a.kind === sp.summon).length; const want = Math.min(roll(sp.dice), sp.max - have);
    const ds = statFor(state, sp.summon); let n = p.enc.alive.reduce((m, a) => Math.max(m, a.n), 0);
    for (let i = 0; i < want; i++) p.enc.alive.push(newFoe(ds, ++n, sp.summon));
    return want > 0 ? `${who} ${sp.t}: ${want} answer${want > 1 ? '' : 's'} the call.` : `${who} calls, but no more can come (at most ${sp.max}).`;
  }
  if (sp.tension || sp.alarm) {
    if (sp.alarm) { const notes = []; const sv = heroSave(state, 'Thievery', v.me, notes); card.rolls = [{ label: 'Thievery', value: sv.val }]; if (sv.ok) return `${who} raises a horn; Thievery ${sv.val} against ${sv.target}: you knock it aside before it sounds.`; }
    const d = state.domain; const die = d.tension; const tv = rnd(die); const eff = tensionCheck(state, die, tv, out);
    if (eff) cb.darkness = eff;
    return `${who} ${sp.alarm ? 'sounds the alarm' : 'sends out a burning call'}: a Tension Die check (D${die} ${tv}).`;
  }
  if (sp.fury) {
    const f = rnd(6); const dtype = f <= 2 ? 'Fire' : f <= 4 ? 'Lightning' : 'Force'; const n = rollWith('d6', v.dmg, 8);
    const res = hurtHero(state, n, dtype, null, s, en); return `${who} unleashes its fury. D6 ${f}: ${dtype === 'Force' ? 'a river of crashing water' : dtype === 'Fire' ? 'a cone of fire' : 'a line of lightning'}, ${res.net} ${dtype} damage.`;
  }
  return `${who}: ${act.name}. ${sp.t}.`;
}
function resolveAction(state, en, s, act, v, out, card, depth = 0) {
  const p = here(state), cb = state.combat, h = state.hero; const w = h.weapons[h.wield]; const who = card.who;
  const notes = []; let text = '';
  const sp = act.manual ? SPECIAL_ACTIONS[act.name] : null;
  if (sp) { card.result = 'special'; return specialAction(state, en, s, act, sp, v, out, card); }
  let physical = act.tag === 'physical' || (act.tag == null && act.dmg && !act.save && !act.area);
  if (act.area) state.combat.icons = []; // an area attack sweeps away your Icons
  // a creature set on one of your Minions fights it, not you (p. 93)
  const mt = state.combat.targets?.[en.id]; const minion = mt && mt !== 'hero' ? (h.minions || []).find((x) => x.id === mt && x.health > 0) : null;
  if (minion && !act.area && (physical || act.dmg)) { card.result = 'ally'; return strikeMinion(state, en, s, act, minion, out); }
  if (combatBuff(h, 'Invisible') && !act.area) { card.result = 'skip'; return `${who} cannot find you: you are invisible.`; }
  // Set Trap: the first creature to attack springs it unless it passes a Mind check
  if (cb.ready?.trap && (physical || act.dmg)) { delete cb.ready.trap; const t = rnd(100); if (t > s.mind) { const n = roll('3d4'); const r = woundFoe(state, en, s, n, 'Piercing'); notes.push(`It springs your trap (Mind ${t}): ${r.net} Piercing.`); if (en.health <= 0) { killFoe(state, en, out); card.result = 'trapped'; return notes.join(' '); } } else notes.push(`It sees your trap and steps round it (Mind ${t}).`); }
  const pen = traitOf(s, 'Penetrating')?.n || 0;
  const ignore = /ignores all Armor|ignores Armor/.test(act.text);
  const frenzy = infHas(s, 'Frenzied') ? 1 : 0;
  const pool = (base) => { const dice = [rollWith(base, v.dmg, 8), ...s.dmgDice.map((x) => roll(x))]; buffHas(en, 'extra') && dice.push(roll('d6')); if (cb.flags.enemyPool) { dice.push(rnd(6)); cb.flags.enemyPool = 0; } return { dice, n: Math.max(...dice) + frenzy }; };
  if (physical) {
    if (cb.flags.concealed > 0) { const m = rnd(100); if (m > s.mind) { card.rolls = [{ label: 'Mind', value: m }]; card.result = 'missed'; return `${who} cannot find you in the dust (Mind ${m} against ${s.mind}).`; } }
    cb.reactions = (cb.reactions || 0) + 1;
    const fear = en.conds.Frightened || 0; const tRes = en.conds.Restrained ? 20 : 0;
    const mind = has(h, 'Mindbinder') ? 10 : 0; const fmA = foeMods(en).attack;
    const foeSkill = Math.max(0, s.combat + 10 + packOf(p, en, s) + (cb.rally ? 10 : 0) + buffSum(en, 'combat') + cb.flags.enemyBonus - fear - tRes - mind + fmA); cb.flags.enemyBonus = 0;
    const db = cb.flags.dodgeBonus?.rounds > 0 ? cb.flags.dodgeBonus.n : 0;
    // a shield adds to every defensive check (p. 85); the Wraith may Dodge with Acrobatics; Ice Shield gives +30 to a Parry
    const sh = shieldUp(h)?.parry || 0; const ice = cb.ready?.iceShield ? 30 : 0; const dualParry = h.dual && dualOk(h) && !cb.flags.dualParried;
    const dodgeBase = has(h, 'Wraith') ? Math.max(skillOf(h, 'Dodge'), skillOf(h, 'Acrobatics')) : skillOf(h, 'Dodge');
    const dodge = dodgeBase + db + sh + (cb.flags.nextDefBonus || 0), canParry = (w.parry || shieldUp(h) || ice || dualParry) && !w.broken && !traitOf(s, 'Savage');
    const parry = canParry ? skillOf(h, w.skill) + sh + ice + (shieldUp(h) && w.defensive ? 10 : 0) + (cb.flags.nextDefBonus || 0) : 0;
    cb.flags.nextDefBonus = 0; if (cb.ready?.iceShield) delete cb.ready.iceShield;
    const use = parry > dodge ? { n: 'parry', s: parry, k: w.skill } : { n: 'dodge', s: dodge, k: 'Dodge' };
    const freeParry = dualParry && parry > dodge; if (freeParry) { cb.flags.dualParried = true; cb.reactions = Math.max(0, (cb.reactions || 1) - 1); }
    const reactionPenalty = (has(h, 'Brawler', 5) ? 10 : 20) * Math.max(0, (cb.reactions || 1) - 1);
    const dpen = penaltyOf(h, cb, use.k);
    const cannot = effN(h, 'Stunned') > 0 || effN(h, 'Paralyzed') > 0 || (h.timed || []).some((t) => t.frenzy && t.rounds > 0) || cb.flags.noDefence;
    const mySkill = cannot ? 0 : Math.max(0, use.s - cb.flags.playerDefPenalty - reactionPenalty + dpen.mod); cb.flags.playerDefPenalty = 0;
    const aAdv = cb.flags.enemyAdv || buffHas(en, 'adv') || effN(h, 'Prone') > 0, aDis = Boolean(en.conds.Prone); cb.flags.enemyAdv = false;
    const foeRoll = adv2(v.foe, aAdv, aDis); const myRoll = readD100(h, use.k, v.me, notes, { adv: cb.flags.defAdv > 0 });
    const auto = effN(h, 'Paralyzed') > 0;
    const r = auto ? { winner: 'att', aCrit: false } : opposedResult(foeRoll, foeSkill, myRoll, mySkill);
    const dck = auto || cannot || use.n !== 'dodge' ? null : critKind(myRoll, mySkill);
    if (dck) { const o3 = []; critFx(state, 'Dodge', dck, o3, { handled: true }); state.log.push(...o3); }
    card.rolls = [{ label: 'Them', value: foeRoll }, { label: 'You', value: myRoll }];
    text = auto ? `You cannot move: ${who}'s ${act.name} lands. ` : `${who} ${foeRoll} against ${foeSkill} (upper hand +10${fear ? `, Frightened -${fear}` : ''}); your ${use.n} ${myRoll} against ${mySkill}${reactionPenalty ? ` (-${reactionPenalty} for earlier defences this round)` : ''}${cannot ? ' (you cannot defend)' : ''}${traitOf(s, 'Savage') && w.parry ? ' (Savage: no parrying)' : ''}. `;
    if (r.aFumble) {
      const fr = rnd(10), f = NPC_FUMBLE[fr - 1]; text += `It fumbles. D10 ${fr}: ${f.t}`;
      if (fr === 1) cb.flags.enemyBonus -= 20;
      if (fr === 2) en.conds.Stunned = (en.conds.Stunned || 0) + 1;
      if (fr === 3) en.conds.Restrained = roll('d4');
      if (fr === 4) cb.flags.defAdv = 2;
      if (fr === 5) { cb.flags.concealed = roll('d4'); cb.flags.concealedMe = true; }
      if (fr === 6 || fr === 10) en.conds.Prone = 1;
      if (fr === 7) { en.conds.Prone = 1; en.conds.Stunned = (en.conds.Stunned || 0) + 2; }
      if (fr === 8 && !s.def.immuneConds.includes('Frightened')) en.conds.Frightened = (en.conds.Frightened || 0) + 20;
      if (f.self) { const res = woundFoe(state, en, s, roll(f.self), fr === 9 ? 'Slashing' : 'Bludgeoning'); text += ` (${res.net})`; if (en.health <= 0) killFoe(state, en, out); }
      card.result = 'fumble';
    } else if (r.winner === 'att') {
      const hl = hitLocation('Humanoid', v.loc); const crit = r.aCrit;
      const pl = act.dmg ? pool(act.dmg) : { dice: [], n: 0 };
      let dmg = pl.n; if (crit) dmg *= 2; if (dck === 'fumble') { dmg *= 2; notes.push('Clumsy Misstep: double damage.'); }
      let dmgIn = dmg;
      // about to take a Critical Strike: you may throw your shield or weapon into it (p. 85); the turn pauses to ask you
      let sac = null;
      const offer = crit && act.dmg && state.critAsk ? sacOptions(h) : [];
      if (offer.length) {
        const choice = state.critAsk.choices.shift();
        if (choice === undefined) throw new CritPause({ who, act: act.name, loc: hl.name, dmg, dtype: act.dtype || 'Bludgeoning', options: offer.map((x) => ({ kind: x.kind, name: x.item.name })) });
        state.critAsk.made.push(choice); sac = offer.find((x) => x.kind === choice)?.item || null;
      }
      if (sac) { sac.broken = true; dmgIn = 0; notes.push(`You throw your ${sac.name} into the blow: it absorbs the Critical Strike and breaks (mend it at Camp).`); }
      if (cb.ready?.brace) { const b2 = roll('d4'); dmgIn = Math.max(0, dmgIn - b2); delete cb.ready.brace; notes.push(`You Brace: -${b2}.`); }
      const res = act.dmg && !sac ? hurtHero(state, dmgIn, act.dtype || 'Bludgeoning', hl.name, s, en, { crit, penetrating: pen, ignore }) : { net: 0, notes: sac ? ['sacrificed'] : [] };
      if (cb.ready?.shell && res.net) { const soak = Math.min(res.net, cb.ready.shell); cb.ready.shell -= soak; healWounds(h, soak); res.notes.push(`Magic Shell soaks ${soak}`); if (!cb.ready.shell) delete cb.ready.shell; }
      if (combatBuff(h, 'Demon Shroud') && res.net) { const r3 = woundFoe(state, en, s, 1, 'Infernal'); notes.push(`Your Demon Shroud burns it for ${r3.net}.`); if (en.health <= 0) killFoe(state, en, out); }
      cb.lastHit = { enemy: en.id, loc: hl.name, dmg: res.net, by: 'them' };
      text += act.dmg ? `It hits your ${hl.name}${crit ? ' with a brutal strike (damage doubled)' : ''}: ${act.dmg.toUpperCase()}${pl.dice.length > 1 ? ` pool ${pl.dice.join(', ')}` : ''} = ${dmg}${frenzy ? ' (Frenzied +1)' : ''} ${act.dtype || ''}${res.notes.length ? `, ${res.notes.join(', ')}` : ''} = ${res.net} damage.` : 'It reaches you.';
      card.hit = { loc: hl.name, dmg: res.net, crit };
      if (act.save) { const sv = heroSave(state, act.save, v.save ?? rnd(100), notes, /opposed/.test(act.text) ? s.body : null); notes.push(`${CHECK_SKILL[act.save] || act.save} ${sv.val} against ${sv.target}${sv.opposed ? ` (opposed by its Body ${sv.opposed})` : ''}: ${sv.ok ? 'you resist' : 'you fail'}.`); if (!sv.ok) afflict(state, act, en, out, notes); }
      else afflict(state, act, en, out, notes);
      if (act.heal) { const n = roll(act.heal); en.health = Math.min(en.max, en.health + n); notes.push(`It recovers ${n} Health.`); }
      if (/regains Health equal to half|healing for half/.test(act.text) && res.net) { en.health = Math.min(en.max, en.health + Math.floor(res.net / 2)); notes.push('It feeds on the wound.'); }
      venom(state, s, res.net, notes); corrupt(state, s, res.net, notes);
      const follow = act.text.match(/uses its ([A-Z][\w' ]+?) (?:ability|Action) as a Free Action/);
      if (follow && depth === 0) { const fa = s.actions.find((a) => a.name === follow[1]); if (fa) notes.push(`Then ${fa.name}: ${resolveAction(state, en, s, fa, { ...v, me: rnd(100), foe: rnd(100), dmg: rnd(8) }, out, { ...card, rolls: [] }, 1)}`); }
      card.result = crit ? 'crit' : 'hit';
    } else if (r.winner === 'def') {
      const dm = rnd(10); text += `You turn it aside. Your Defensive Move (D10 ${dm}): ${PLAYER_DEFENSIVE[dm - 1]}`;
      if (cb.ready?.feint && use.n === 'dodge') { cb.flags.playerBonus += 10; delete cb.ready.feint; text += ' Your feint pays: +20 to your next attack.'; }
      if (cb.ready?.countershock && use.n === 'parry' && h.vit.aether >= 4) { h.vit.aether -= 4; delete cb.ready.countershock; const r4 = woundFoe(state, en, s, roll('d6'), 'Force'); text += ` Countershock: ${r4.net} Force through your weapon.`; if (en.health <= 0) killFoe(state, en, out); }
      applyPlayerDefMove(state, dm, en, null, out); card.result = 'parried';
    } else { hurt(h, 1); text += 'Both of you fail: you suffer 1 damage that cannot be avoided.'; card.result = 'both-fail'; }
    return `${text} ${notes.join(' ')}`.trim();
  }
  // magical, or resisted with a named check: a Spellward unless the action names another
  const save = act.save || (act.tag === 'magical' && (act.dmg || act.conds) ? 'Spellward' : null);
  let ok = false;
  if (save) {
    const sv = heroSave(state, save, v.me, notes, /opposed/.test(act.text) ? s.body : null); ok = sv.ok; if (sv.ck === 'fumble' && (save === 'Spellward' || save === 'Dodge')) cb.flags.doubleNext = true;
    card.rolls = [{ label: CHECK_SKILL[save] || save, value: sv.val }];
    text = `${act.name}${act.tag === 'magical' ? ' (magical)' : ''}: ${CHECK_SKILL[save] || save} ${sv.val} against ${sv.target}${sv.opposed ? ` (opposed by its Body ${sv.opposed})` : ''}: ${ok ? 'you resist' : 'it takes hold'}. `;
  } else text = `${act.name}${act.tag === 'magical' ? ' (magical)' : ''}. `;
  cb.flags.spellPenalty = 0; cb.flags.spellDis = false; const dbl = cb.flags.doubleNext; cb.flags.doubleNext = false;
  if (act.dmg) {
    const pl = pool(act.dmg); let n = pl.n; if (ok) n = act.half ? Math.floor(n / 2) : 0;
    if (n && dbl) { n *= 2; notes.push('Magical Vulnerability: double damage.'); }
    if (n && act.tag === 'magical' && cb.flags.spellRes > 0) { n = Math.ceil(n / 2); notes.push('Unbreakable Will: Resistant, half damage.'); }
    if (n) {
      const loc = act.area ? null : hitLocation('Humanoid', v.loc).name;
      const res = hurtHero(state, n, act.dtype || 'Force', act.tag === 'physical' ? loc : null, s, en, { penetrating: pen, ignore });
      text += `${res.net} ${act.dtype || ''} damage${res.notes.length ? ` (${res.notes.join(', ')})` : ''}.`;
      if (/regains Health equal to half|healing for half/.test(act.text) && !ok) en.health = Math.min(en.max, en.health + Math.floor(res.net / 2));
      if (/maximum Health is reduced by the amount/.test(act.text) && !ok && res.net) { h.vit.drain = (h.vit.drain || 0) + res.net; h.vit.maxHealth = Math.max(1, h.vit.maxHealth - res.net); h.vit.health = Math.min(h.vit.health, h.vit.maxHealth); notes.push('Your maximum Health is lowered by as much until you finish a Camp Rest.'); }
      venom(state, s, res.net, notes); corrupt(state, s, res.net, notes);
      card.hit = { loc: null, dmg: res.net };
    } else if (ok) text += 'No harm done.';
  }
  if (!ok && act.weaponMinus) { cb.flags.weaponPen = (cb.flags.weaponPen || 0) + act.weaponMinus; notes.push(`Your weapon Skills are -${cb.flags.weaponPen} for the rest of the fight.`); }
  if (!ok) { afflict(state, act, en, out, notes); if (dbl) for (const c of act.conds || []) { const e = h.effects.find((x) => x.name === c.name); if (e && e.n > 0) { e.n *= 2; notes.push(`${c.name} lasts twice as long.`); } } }
  if (act.heal) { const n = roll(act.heal); en.health = Math.min(en.max, en.health + n); notes.push(`${who} recovers ${n} Health.`); }
  if (act.extraTurn) cb.extraEnemyTurn = en.id;
  if (act.summon && !SPECIAL_ACTIONS[act.name]) notes.push('(It calls for help: the book leaves the details to you.)');
  card.result = ok ? 'resisted' : 'hit';
  return `${text} ${notes.join(' ')}`.trim();
}
// what you could throw into a Critical Strike: your shield, and the weapon in your hand
function sacOptions(h) {
  const o = []; const sh = shieldUp(h); if (sh) o.push({ kind: 'shield', item: sh });
  const w = h.weapons[h.wield]; if (w && !w.broken && !/fist/i.test(w.name)) o.push({ kind: 'weapon', item: w });
  return o;
}
class CritPause { constructor(info) { this.info = info; } }
export function setSacrifice(state0, rule) { const state = clone(state0); state.hero.sacrifice = rule; return state; }
// set the Lamp down for the fight: a Standard Action that frees the hand (p. 96)
export function setLampDown(state0) {
  const state = clone(state0); const h = state.hero;
  if (!state.combat || h.lightSource !== 'oil' || beltLamp(h) || h.lampDown) return finish(state, [], {});
  h.lampDown = true;
  return endPlayerTurn(state, [{ id: uid(), kind: 'combat', title: 'The Lamp, set down', text: 'You set the Lamp on the flagstones. Both hands are free, but a Fumble now will kick it over.', rolls: [], page: 96, place: state.here }]);
}
// how many turns a creature takes this round: Ruthlessness (X) adds X, and each stack of Stunned or Paralyzed costs one
const turnsOf = (s) => 1 + (traitOf(s, 'Ruthlessness')?.n || 0);
// a creature's turn. If a Critical Strike is about to land and you have something to sacrifice, the turn stops and
// asks you (combat.pendingCrit); answering replays the same turn, with the same dice, and your choice
export function enemyTurn(state0, faces, { tape = null, choices = [] } = {}) {
  const real = Math.random; const queue = [...(tape || [])]; const rec = [];
  Math.random = () => { const x = queue.length ? queue.shift() : real(); rec.push(x); return x; };
  try { const r = enemyTurn0(state0, faces, choices); delete r.state.critAsk; return r; }
  catch (e) {
    if (!(e instanceof CritPause)) throw e;
    const state = clone(state0); state.combat.pendingCrit = { ...e.info, faces, tape: rec, choices };
    return { state, out: [] };
  } finally { Math.random = real; }
}
export function answerCrit(state0, choice) {
  const pc = state0.combat?.pendingCrit; if (!pc) return { state: state0, out: [] };
  const state = clone(state0); delete state.combat.pendingCrit;
  return enemyTurn(state, pc.faces, { tape: pc.tape, choices: [...pc.choices, choice] });
}
function enemyTurn0(state0, faces, choices) {
  if (state0.over) return { state: clone(state0), out: [] };
  const state = clone(state0); state.critAsk = { choices: [...choices], made: [] }; fixFoes(here(state)); const cb = state.combat; const p = here(state); const h = state.hero;
  const out = []; const v = readPlan(enemyPlan(), faces);
  const idx = Math.min(cb.enemyIdx || 0, p.enc.alive.length - 1); const en = p.enc.alive[idx];
  const s = foeStat(state, en);
  cb.turns = cb.turns || {}; cb.turns[en.id] = (cb.turns[en.id] || 0) + 1;
  // buffs that last until this creature's next turn end as it begins
  if ((cb.turns[en.id] === 1)) en.buffs = (en.buffs || []).map((b) => ({ ...b, turns: b.turns - 1 })).filter((b) => b.turns > 0);
  let act = s.actions.find((a) => a.rolls.includes(v.act)) || s.actions[0];
  if (foeMods(en).noMagic && act.tag === 'magical') act = s.actions.find((a) => a.tag !== 'magical') || { name: 'Suppressed', rolls: [], text: 'Its magic will not come.', manual: true, hold: true };
  // a creature holding you in its grasp keeps squeezing, or uses the action its grasp names
  if (cb.restrainedBy === en.id && !/Restrained/.test(act.text) && cb.restrainDmg) {
    const nxt = s.actions.find((a) => /targets a creature it has Restrained/.test(a.text));
    act = nxt || { name: 'Holds you fast', rolls: [], text: 'It waits for you to weaken.', manual: true, hold: true };
  }
  const who = `${kindOf(p, en)}${p.enc.alive.length > 1 || en.n > 1 ? ` ${en.n}` : ''}`;
  const card = { id: uid(), kind: 'combat', title: `${who}: ${act.name}`, rolls: [{ label: 'D6', value: v.act }], result: null, place: p.id, creature: kindOf(p, en), who };
  let text = '';
  const lost = (en.conds.Stunned || 0) > 0 || (en.conds.Paralyzed || 0) > 0;
  if (lost) { if (en.conds.Stunned) en.conds.Stunned -= 1; else en.conds.Paralyzed -= 1; text = 'It is Stunned and loses this turn.'; card.result = 'skip'; card.title = `${who} is Stunned`; }
  else if (en.conds.Prone) { delete en.conds.Prone; text = 'It spends its turn getting back up.'; card.result = 'skip'; card.title = `${who} gets up`; }
  else if (cb.skip[en.id]) { cb.skip[en.id] -= 1; text = 'It is too dazed to act this round.'; card.result = 'skip'; }
  else if (act.hold) { text = 'It holds you fast and waits for you to weaken.'; card.result = 'skip'; }
  else if ((en.conds.Dazed || 0) > 0 && (act.dmg || act.tag === 'physical')) { en.conds.Dazed -= 1; text = 'It is Dazed and cannot press an attack.'; card.result = 'skip'; }
  else text = resolveAction(state, en, s, act, v, out, card);
  if (en.conds.Frightened) { en.conds.Frightened = Math.max(0, en.conds.Frightened - 10); if (!en.conds.Frightened) delete en.conds.Frightened; }
  // a Poisoned or Restrained creature tries to shake it off (p. 88)
  if (en.conds.Poisoned && rnd(100) <= s.endurance) { delete en.conds.Poisoned; text += ' It shakes off the poison.'; }
  if (en.conds.Restrained) { en.conds.Restrained -= 1; if (en.conds.Restrained <= 0) delete en.conds.Restrained; }
  card.text = text; delete card.who; out.push(card);
  if (card.result === 'hit' || card.result === 'crit') gearRemind(state, 'hit', out);
  if (cb.darkness) { const eff = cb.darkness; delete cb.darkness; if (eff.ambush) out.push({ id: uid(), kind: 'note', title: 'More of them', text: 'The darkness stirs, but you are already fighting.', rolls: [] }); }
  if (!p.enc.alive.length) return victory(state, out);
  // next: the same creature again (Ruthlessness, or a new turn), or the next one, or the end of the round
  const again = cb.extraEnemyTurn === en.id || cb.extraEnemyTurn === true; if (again) cb.extraEnemyTurn = false;
  const stillHere = p.enc.alive.some((a) => a.id === en.id);
  if (!(stillHere && (again || cb.turns[en.id] < turnsOf(s)))) cb.enemyIdx = (stillHere ? idx : idx - 1) + 1;
  if (cb.enemyIdx >= p.enc.alive.length) endRound(state, out);
  if (!p.enc.alive.length) return victory(state, out);
  return finish(state, out, {});
}
// the end of a round and the start of your turn: conditions bite (pp. 88-89)
function endRound(state, out) {
  const cb = state.combat, p = here(state), h = state.hero;
  cb.enemyIdx = 0; cb.side = 'player'; cb.round += 1; cb.reactions = 0; cb.flags.freeUsed = false; cb.turns = {}; cb.flags.noDefence = false; cb.flags.dualParried = false;
  iconsTick(state, out); foeDebuffsTick(state, out);
  for (const m of [...(h.minions || [])]) if (m.rounds) { m.rounds -= 1; if (m.rounds <= 0) { h.minions = h.minions.filter((x) => x.id !== m.id); out.push({ id: uid(), kind: 'combat', title: `Your ${m.kind}`, text: 'It fades back into you.', rolls: [], place: p.id }); } }
  for (const b of [...(h.combatBuffs || [])]) if (b.rounds) { b.rounds -= 1; if (b.rounds <= 0) { h.combatBuffs = h.combatBuffs.filter((x) => x !== b); if (b.name === 'Tempestuous Rage') { addEffect(h, 'Dazed', 1); out.push({ id: uid(), kind: 'combat', title: 'The rage spends itself', text: 'You are Dazed for a round.', rolls: [], place: p.id }); } } else if (b.name === 'Tempestuous Rage') cb.extraAction = (cb.extraAction || 0) + 1; }
  if (cb.rally) cb.rally = Math.max(0, cb.rally - 1);
  if (cb.flags.defAdv) cb.flags.defAdv -= 1;
  if (cb.flags.dodgeBonus) cb.flags.dodgeBonus.rounds -= 1;
  for (const t of h.timed || []) { if (t.extraAct && t.rounds > 1) cb.extraAction = (cb.extraAction || 0) + 1; if (t.rounds) t.rounds -= 1; }
  if (h.regen > 0) { h.regen -= 1; healWounds(h, 1); }
  if (cb.flags.concealed) cb.flags.concealed -= 1;
  for (const k of ['spellRes', 'autoHit', 'fumbleDis']) if (cb.flags[k] > 0) cb.flags[k] -= 1;
  for (const en of [...p.enc.alive]) {
    const s = foeStat(state, en);
    for (const c of ['Bleeding', 'Poisoned']) if (en.conds[c]) { en.health = Math.max(0, en.health - en.conds[c]); out.push({ id: uid(), kind: 'combat', title: `${kindOf(p, en)} ${en.n}: ${c}`, text: `${c} costs it ${en.conds[c]} Health.`, rolls: [], place: p.id }); if (en.health <= 0) killFoe(state, en, out); }
    if (en.conds.Burning) { const r = woundFoe(state, en, s, 1, 'Fire'); if (en.health <= 0) killFoe(state, en, out); else if (r.net) out.push({ id: uid(), kind: 'combat', title: 'Burning', text: `It burns for ${r.net}.`, rolls: [], place: p.id }); }
  }
  heroTurnStarts(state, out);
}
function heroTurnStarts(state, out) {
  const cb = state.combat, p = here(state), h = state.hero;
  for (const e of [...h.effects]) {
    if (e.name === 'Bleeding' || e.name === 'Poisoned') { hurt(h, e.n); out.push({ id: uid(), kind: 'combat', title: e.name, text: `${e.name}: ${e.n} damage, ignoring Armor.`, rolls: [], place: p.id }); }
    if (e.name === 'Burning') { hurt(h, 1); out.push({ id: uid(), kind: 'combat', title: 'Burning', text: 'You burn for 1 Fire damage. Putting it out takes your Standard Action.', rolls: [], place: p.id }); }
    if (e.name === 'Festering wound') { hurt(h, 1); out.push({ id: uid(), kind: 'combat', title: e.name, text: 'The festering wound burns for 1 Necrotic damage.', rolls: [], place: p.id }); }
  }
  if (effN(h, 'Freezing') && cb.round > 1) { const t = rnd(100), e = skillOf(h, 'Endurance'); if (t <= e) { dropEffect(h, 'Freezing'); out.push({ id: uid(), kind: 'combat', title: 'Freezing', text: `Endurance ${t} against ${e}: warmth returns to your limbs.`, rolls: [{ label: 'Endurance', value: t }], result: 'pass', place: p.id, page: 88 }); } }
  // the round after poison takes hold you may resist it with Endurance as a Free Action (p. 89)
  if (effN(h, 'Poisoned')) { const t = rnd(100), e = skillOf(h, 'Endurance'); if (t <= e) { dropEffect(h, 'Poisoned'); out.push({ id: uid(), kind: 'combat', title: 'Poison', text: `Endurance ${t} against ${e}: you fight the poison off.`, rolls: [{ label: 'Endurance', value: t }], result: 'pass', place: p.id }); } }
  if (cb.restrained && cb.restrainDmg) { const r = cb.restrainDmg; const res = damageAfter(r.n, r.type, { armor: r.ignore ? 0 : heroArmor(h, 'Chest') }); hurt(h, res.net); out.push({ id: uid(), kind: 'combat', title: 'Restrained', text: `Held fast: ${res.net} ${r.type} damage${r.ignore ? ' that ignores Armor' : ''}.`, rolls: [], place: p.id }); }
  // Prone: you get up as a Free Action, and they get a Defensive Move (p. 89)
  if (effN(h, 'Prone')) { dropEffect(h, 'Prone'); cb.flags.freeUsed = true; const dm = rnd(10); applyNpcDefMove(state, dm, p.enc.alive[0], out); out.push({ id: uid(), kind: 'combat', title: 'You get up', text: `You climb back to your feet. They take their chance, Defensive Move D10 ${dm}: ${NPC_DEFENSIVE[dm - 1]}`, rolls: [{ label: 'D10', value: dm }], place: p.id }); }
  const loseBy = ['Stunned', 'Paralyzed', 'Dazed', 'Charmed'].find((n) => effN(h, n) > 0);
  if (loseBy) { const e = h.effects.find((x) => x.name === loseBy); e.n -= 1; if (e.n <= 0) dropEffect(h, loseBy); cb.lose = true; out.push({ id: uid(), kind: 'combat', title: loseBy, text: loseBy === 'Dazed' ? 'You are Dazed and cannot attack this turn.' : loseBy === 'Charmed' ? 'You are Charmed and cannot bring yourself to strike.' : `You are ${loseBy} and lose this turn.`, rolls: [], place: p.id }); }
  if (effN(h, 'Blinded')) { const e = h.effects.find((x) => x.name === 'Blinded'); e.n -= 1; if (e.n <= 0) dropEffect(h, 'Blinded'); }
}
// putting out flames takes your Standard Action (p. 88)
export function douse(state0) {
  const state = clone(state0); const h = state.hero; dropEffect(h, 'Burning');
  const out = [{ id: uid(), kind: 'combat', title: 'Put out the flames', text: 'You beat out the fire. It costs you your turn.', rolls: [], place: state.here }];
  if (!state.combat) { h.vit.exh += 2; out[0].text = 'You beat out the fire: +2 Exhaustion.'; return finish(state, out, {}); }
  return endPlayerTurn(state, out);
}
// the Overseer, in its lair (pp. 179-199)
export function faceOverseer(state0) {
  const state = clone(state0); const p = here(state); const name = state.domain.overseer.name;
  p.enc = makeEnemies(name, state); p.cleared = false;
  const b = BESTIARY[name];
  return finish(state, [{ id: uid(), kind: 'combat', title: name, text: `${b.desc.split('. ').slice(0, 2).join('. ')}.`, rolls: [], page: b.page, place: p.id, creature: name, overseer: name }], { combat: { name } });
}
// Restrained (p. 89): an Athletics check as a Free Action; a Standard Action instead gives +20
export const breakFreePlan = () => makePlan([['check', 'd100']]);
export function breakFree(state0, faces, { standard = false } = {}) {
  const state = clone(state0); const cb = state.combat; const h = state.hero; const body = Math.max(0, skillOf(h, 'Athletics') - 20 + (standard ? 20 : 0)); const notes = [];
  if (!standard) { if (cb.flags.freeUsed) return finish(state, [{ id: uid(), kind: 'note', title: 'Break free', text: 'You have already used your Free Action this round: strain free with your Standard Action instead.', rolls: [], page: 76 }], {}); cb.flags.freeUsed = true; }
  const v = readD100(h, 'Athletics', readPlan(breakFreePlan(), faces).check, notes); const ok = v <= body;
  if (ok) { cb.restrained = false; cb.restrainedBy = null; cb.restrainDmg = null; dropEffect(h, 'Restrained'); }
  const out = [{ id: uid(), kind: 'combat', title: 'Break free', text: `Athletics ${v} against ${body} (Restrained -20${standard ? ', +20 for a Standard Action' : ''}): ${ok ? 'you break free.' : 'you stay held.'} ${notes.join(' ')}`.trim(), rolls: [{ label: 'D100', value: v }], result: ok ? 'pass' : 'fail', place: state.here }];
  if (standard) return endPlayerTurn(state, out);
  return finish(state, out, {});
}
// Flee (p. 77): a Standard Action and a Dodge check; the foes are back to full Health when you return
export const fleePlan = () => makePlan([['check', 'd100']]);
export function flee(state0, faces) {
  const state = clone(state0); const h = state.hero; const cb = state.combat;
  if (!state.prev) return finish(state, [{ id: uid(), kind: 'note', title: 'No way back', text: 'There is nowhere to flee to.', rolls: [] }], {});
  const notes = []; const dodge = Math.max(0, skillOf(h, 'Dodge') - (cb?.restrained ? 20 : 0));
  const v = readD100(h, 'Dodge', readPlan(fleePlan(), faces).check, notes);
  if (v > dodge) { cb.side = 'enemy'; cb.enemyIdx = 0; return finish(state, [{ id: uid(), kind: 'combat', title: 'Flee', text: `Dodge ${v} against ${dodge}: they block your way and you cannot leave the fight. ${notes.join(' ')}`.trim(), rolls: [{ label: 'Dodge', value: v }], result: 'fail', place: state.here }], {}); }
  const p = here(state); if (p.enc) p.enc.alive.forEach((a) => { a.health = a.max; a.wounds = []; });
  state.here = state.prev; state.combat = null;
  return finish(state, [{ id: uid(), kind: 'move', title: 'Retreat', text: `Dodge ${v} against ${dodge}: you break away and back out into the previous room. They will be there when you return, with their Health back to full. ${notes.join(' ')}`.trim(), rolls: [{ label: 'Dodge', value: v }], place: state.here }], {});
}
export function switchTarget(state0, id) { const state = clone(state0); if (state.combat) state.combat.target = id; return state; }

// ---- resting and mending (pp. 86, 90, 123-125) ----
export function breather(state0) {
  const state = clone(state0); const h = state.hero; const v = h.vit; const d = state.domain; const out = [];
  const heal = healAmt(h, roll('d10') + 2); v.tough = Math.min(v.maxTough, v.tough + heal); v.health = Math.min(v.maxHealth, v.health + healAmt(h, 1)); v.exh = Math.max(0, v.exh - 2); v.light = Math.max(0, v.light - 5);
  out.push({ id: uid(), kind: 'camp', title: 'Taking a Breather', text: `You recover ${heal} Toughness and lose 2 Exhaustion. It costs 5 Light and the Tension Die steps down.${exhTier(h) === 1 ? ' Your Exhaustion halves what you heal.' : ''}`, rolls: [], page: 123, place: state.here });
  let eff = null;
  if (d.tension === 4) { d.tension = 8; eff = applyDarkness(state, rnd(100), out); } else d.tension = stepDown(d.tension);
  for (let i = 0; i < gdCount(state, 15); i++) { const die = d.tension; eff = tensionCheck(state, die, rnd(die), out) || eff; }
  return finish(state, out, { darkness: eff });
}
export const campPlan = (state = null) => {
  const h = state?.hero; const defs = [['camp', 'd20']];
  if (h?.rot > 0 && h.rot < 8) defs.push(['rot', 'd100']);
  Object.keys(h?.marks || {}).filter((k) => h.marks[k]).forEach((k, i) => defs.push([`mark${i}`, 'd100']));
  return makePlan(defs);
};
export function setCamp(state0, faces, { barricade = 0, sleep = false, ...acts } = {}) {
  const state = clone(state0); const h = state.hero; const v = h.vit; const out = [];
  const actMod = sleep ? 0 : campActivities(state, acts, out);
  const bedroll = (h.pack || []).some((x) => x.name === 'Bedroll') ? 1 : 0;
  const hasRation = h.items.rations > 0; if (hasRation) h.items.rations -= 1;
  const bar = Math.min(barricade, h.items.crafting); h.items.crafting -= bar; v.exh += bar;
  const mod = bar * 5 + (sleep ? 2 : 0) + actMod + bedroll - gdCount(state, 17);
  const cv = readPlan(campPlan(state0), faces); const r = cv.camp; const total = r + mod; const safe = total >= 12; state.campDice = cv;
  const half = !hasRation || !safe; const f = (n) => (half ? Math.floor(n / 2) : n);
  const t = healAmt(h, f(v.maxTough - v.tough)); v.tough += t; const hh = healAmt(h, f(1) + (sleep ? 1 : 0)); v.health = Math.min(v.maxHealth, v.health + hh);
  const san = f(roll('d4')); v.sanity = Math.min(v.maxSanity, v.sanity + san); const ex = f(10) + (sleep ? 5 : 0); v.exh = Math.max(0, v.exh - ex);
  h.wounds = []; h.effects = h.effects.filter((e) => e.name === 'Bleeding' || e.name === 'Poisoned' || e.name === 'Burning');
  if (v.drain) { v.maxHealth += v.drain; v.drain = 0; } // a lowered maximum Health returns after a Camp Rest
  v.temp = 0; if (v.tempSanity) { v.sanity = Math.max(0, v.sanity - v.tempSanity); v.tempSanity = 0; }
  if (h.rot >= 5) { const n = roll('d4'); v.health = Math.min(v.maxHealth, v.health + n); out.push({ id: uid(), kind: 'camp', title: 'The Rot', text: `Your flesh knits itself: +${n} Health.`, rolls: [], page: 87 }); }
  improveSkills(state, out); rotAtRest(state, out); delete state.campDice;
  h.restUsed = {}; // once-per-Rest powers return
  darkRemind(state, 'camp', out);
  out.push({ id: uid(), kind: 'camp', title: 'Camp', text: `Camp Check D20 ${r}${mod ? ` ${mod > 0 ? '+' : ''}${mod}` : ''} = ${total} (12+ is safe): ${safe ? 'you rest undisturbed.' : 'something finds the camp.'} ${hasRation ? '' : 'No Ration: half the benefits. '}You recover ${t} Toughness, ${hh} Health, ${san} Sanity and lose ${ex} Exhaustion.`, rolls: [{ label: 'D20', value: r }], page: 123, result: safe ? 'pass' : 'fail', place: state.here });
  let combat = null;
  if (!safe) { const p = here(state); if (!p.enc) { const e = encounter(state, rnd(6), rnd(20)); p.enc = e.enc; p.cleared = false; combat = { name: e.name }; out.push({ id: uid(), kind: 'combat', title: 'The camp is found', text: `${encText(e)}.`, rolls: encRolls(e), page: e.page, place: p.id, creature: e.name }); } }
  return finish(state, out, { combat, safe });
}
// Medicine + 1 Bandage (p. 19): D4 Toughness once per room, or remove Bleeding / Poisoned. Out of combat only.
export const tendPlan = () => makePlan([['check', 'd100']]);
export function tend(state0, faces, { mode = 'heal' } = {}) {
  const state = clone(state0); const h = state.hero; const p = here(state); const out = [];
  if (h.items.bandages < 1) return finish(state, [{ id: uid(), kind: 'note', title: 'No bandages', text: 'You have no Bandages.', rolls: [] }], {});
  h.items.bandages -= 1; const notes = []; const skill = skillOf(h, 'Medicine');
  const v = readD100(h, 'Medicine', readPlan(tendPlan(), faces).check, notes); const ok = v <= skill; const ckM = critKind(v, skill);
  if (mode === 'heal') p.tended = true;
  let text = `Medicine ${v} against ${skill}: ${ok ? 'success.' : 'the bandage is wasted.'}`;
  if (ok) {
    if (mode === 'heal') { const t = healAmt(h, roll('d4')); h.vit.tough = Math.min(h.vit.maxTough, h.vit.tough + t); text += ` You recover ${t} Toughness.`; }
    else { const i = h.effects.findIndex((e) => LASTING.includes(e.name) || e.name === 'Festering wound'); if (i >= 0) { text += ` The ${h.effects[i].name.toLowerCase()} stops.`; h.effects.splice(i, 1); } }
  }
  out.push({ id: uid(), kind: 'camp', title: mode === 'heal' ? 'Tending your wounds' : 'Dressing a condition', text: `${text} ${notes.join(' ')}`.trim(), rolls: [{ label: 'D100', value: v }], page: 19, result: ok ? 'pass' : 'fail', place: state.here });
  critFx(state, 'Medicine', ckM, out);
  return finish(state, out, {});
}
export function eat(state0, what = 'ration', faces = null) {
  const state = clone(state0); const h = state.hero; const out = [];
  if (what === 'ration') { const need = h.rot >= 4 && h.rot < 8 ? 2 : 1; if (h.items.rations < need) return finish(state, [{ id: uid(), kind: 'note', title: 'No rations', text: need > 1 ? 'The Rot leaves you ravenous: it takes 2 Rations to ease 1 Exhaustion, and you have fewer.' : 'You have no Ration.', rolls: [], page: 87 }], {}); h.items.rations -= need; h.vit.exh = Math.max(0, h.vit.exh - 1); out.push({ id: uid(), kind: 'camp', title: 'A Ration', text: 'You eat a Ration and lose 1 Exhaustion.', rolls: [], page: 90, place: state.here }); }
  else { if (h.items.cooking < 1) return finish(state, [{ id: uid(), kind: 'note', title: 'Nothing to eat', text: 'You have no Cooking Ingredients.', rolls: [] }], {}); h.items.cooking -= 1; h.vit.exh = Math.max(0, h.vit.exh - 1); const t = readD100(h, 'Endurance', faces ? readPlan(checkPlan(), faces).check : rnd(100), []); critFx(state, 'Endurance', critKind(t, skillOf(h, 'Endurance')), out); const ok = t <= h.resist.Endurance; if (!ok) h.vit.health = Math.max(0, h.vit.health - 1); out.push({ id: uid(), kind: 'camp', title: 'Raw ingredients', text: `You eat raw Cooking Ingredients and lose 1 Exhaustion. Endurance ${t} against ${h.resist.Endurance}: ${ok ? 'you keep it down.' : 'it turns your stomach and costs you 1 Health.'}`, rolls: [{ label: 'Endurance', value: t }], page: 90, place: state.here }); }
  return finish(state, out, {});
}
export function lightWith(state0, what) {
  const state = clone(state0); const h = state.hero; const it = h.items;
  const table = { torch: ['torches', 20, 'a fresh Torch'], candle: ['candles', 10, 'a Candle'], oil: ['oil', 20, 'your Lamp with fresh oil'] };
  const [k, rooms, label] = table[what] || table.torch;
  if (!(it[k] > 0) || (what === 'oil' && !(h.pack || []).some((x) => /Lamp/.test(x.name)))) return finish(state, [{ id: uid(), kind: 'note', title: 'No light', text: what === 'oil' ? 'You need a Lamp and Lamp Oil.' : `You have no ${label.replace(/^a (fresh )?/, '')}.`, rolls: [] }], {});
  it[k] -= 1; h.vit.light = rooms; h.lightSource = what;
  return finish(state, [{ id: uid(), kind: 'note', title: 'Light', text: `You light ${label}. It will last ${rooms} rooms.`, rolls: [], page: 96, place: state.here }], {});
}
export function lightTorch(state0) {
  const state = clone(state0); const h = state.hero;
  if (h.items.torches < 1) return finish(state, [{ id: uid(), kind: 'note', title: 'No torches', text: 'You have no Torch to light.', rolls: [] }], {});
  h.items.torches -= 1; h.vit.light = 20; h.lightSource = 'torch';
  return finish(state, [{ id: uid(), kind: 'note', title: 'Torch', text: 'You light a fresh Torch. It will last 20 rooms.', rolls: [], page: 96, place: state.here }], {});
}

// ---- the lair, ambushes, leaving the Domain ----
export function ambush(state0) {
  const state = clone(state0); const p = here(state); const e = encounter(state, rnd(6), rnd(20));
  p.enc = e.enc; p.cleared = false;
  return finish(state, [{ id: uid(), kind: 'combat', title: 'Ambush', text: `You are ambushed. ${encText(e)}. They surprise you.`, rolls: encRolls(e), page: e.page, place: p.id, creature: e.name }], { combat: { name: e.name } });
}
export function overseerDown(state0) {
  const state = clone(state0); const p = here(state); p.lair = false; p.overseerDown = true; p.cleared = true; state.hero.vit.xp += 200; state.domain.overseerSlain = true;
  state.hero.vit.sanity = Math.min(state.hero.vit.maxSanity, state.hero.vit.sanity + roll('d4'));
  return finish(state, [{ id: uid(), kind: 'combat', title: 'The Overseer falls', text: 'You mark the Overseer as defeated (settled outside the app). Every creature in this Domain loses its empowerment. +200 XP and D4 Sanity.', rolls: [], page: 179, place: p.id }], {});
}
export function descend(state0) {
  const state = clone(state0); const n = state.domain.n + 1;
  state.domain = newDomain(n); state.hero.vit.xp += 50; if (has(state.hero, 'Tracker', 5)) state.domain.tension = 10; const start = makeStart(); start.desc = { text: 'The stair lets you out into the next Domain. The air is colder here.', roll: 0 };
  start.title = `Domain ${n}`; start.tags = []; start.start = true; state.pieces = [start]; state.here = start.id; state.prev = null; state.combat = null;
  return finish(state, [{ id: uid(), kind: 'room', title: `Domain ${n}`, text: `You leave the Domain behind (+50 XP). The Tension Die resets to D8. Overseer: ${state.domain.overseer.name}. Influence (D10 ${state.domain.overseer.roll}): ${state.domain.overseer.influence}`, rolls: [], page: 100, place: start.id }], {});
}
export function adjust(state0, field, delta) {
  const state = clone(state0); const v = state.hero.vit; const caps = { health: 'maxHealth', tough: 'maxTough', aether: 'maxAether', sanity: 'maxSanity' };
  const cap = caps[field] ? v[caps[field]] : (field === 'exh' ? 25 : (field === 'light' ? 20 : 100000));
  v[field] = Math.max(0, Math.min(cap, v[field] + delta));
  if (v.health <= 0) state.over = 'dead';
  state.updated = Date.now(); return state;
}
export function setWield(state0, i) {
  const state = clone(state0); const h = state.hero; if (h.wield === i) return state;
  h.wield = i; const cb = state.combat;
  // before anyone acts you choose what to draw; once the fight is on, a swap costs your Standard Action
  if (cb && cb.initiative && cb.side === 'player') return endPlayerTurn(state, [{ id: uid(), kind: 'combat', title: 'You swap weapons', text: `You take up the ${h.weapons[i].name}. It costs your Standard Action.`, rolls: [], page: 77, place: state.here }]).state;
  return state;
}

// where a camp would be sensible: cleared, quiet, few ways in (p. 123)
export function campRating(state, p) {
  if (!p.cleared || p.lair || p.kind === 'corridor') return 0;
  const open = p.doors.length;
  return open <= 1 ? 2 : open === 2 ? 1 : 0;
}

// ---- bringing a classic campaign across: each chamber the classic story visited becomes a cleared place on the map ----
export function appendImported(state0, chambers) {
  const state = clone(state0); const d = state.domain;
  for (const ch of chambers) {
    const hn = [...String(ch.name)].reduce((a, c) => a + c.charCodeAt(0), 0);
    let done = false;
    for (let attempt = 0; attempt < 8 && !done; attempt++) {
      const roll26 = 26 + ((hn + attempt * 17) % 75);
      const seed = d.seed + state.pieces.length * 131 + hn + attempt;
      const shape = buildShape(roll26, seed);
      const parents = [state.pieces[state.pieces.length - 1], ...state.pieces.slice(0, -1).reverse()];
      for (const par of parents) {
        for (const door of par.doors.filter((x) => !x.to && !x.blocked)) {
          const placed = tryPlace(state, par, door, shape, seed);
          if (!placed) continue;
          const piece = { id: uid(), n: state.pieces.length + 1, kind: 'room', family: shape.family, cave: shape.cave, cells: placed.cells, pillars: placed.pillars, noExit: placed.noExit, alcoves: shape.alcoves || 0,
            cleared: true, searched: true, visited: true, imported: true, title: ch.name, doors: [], enc: null, event: null, shapeRoll: roll26, seed,
            desc: { text: ch.desc, roll: 0 }, tags: shape.alcoves ? ['tombs'] : featuresFor(`${ch.name} ${ch.desc}`) };
          piece.doors = addDoors(state, piece, shape, placed, seed); door.to = piece.id; piece.doors[0].to = par.id;
          state.pieces.push(piece); state.here = piece.id; state.prev = par.id; d.rooms += 1; done = true; break;
        }
        if (done) break;
      }
    }
  }
  return state;
}

// ---- doors, locks and traps (pp. 99, 117-119) ----
// An unexplored exit is first checked for a door (D10, 1-5). A door can be investigated: Perception at a random
// Difficulty (D8); a pass and a D10 of 7+ means you have spotted a trap. Then a D20 of 12+ means it is locked.
// Opening it without looking (or after a failed Perception check) springs any trap, avoided only by its own check.
export const findDoor = (state, doorId) => { for (const p of state.pieces) { if (p.container?.id === doorId) return p.container; const d = p.doors.find((x) => x.id === doorId); if (d) return d; } return null; };
export const doorReady = (d) => Boolean(d.to || d.entry || d.kind === 'arch' || d.open);
export const approachPlan = () => makePlan([['isdoor', 'd10'], ['per', 'd100'], ['diff', 'd8'], ['trap', 'd10'], ['trapRow', 'd10'], ['lock', 'd20']]);
export function approachDoor(state0, doorId, faces, { look = true } = {}) {
  const state = clone(state0); const h = state.hero; const d = findDoor(state, doorId); const out = [];
  const v = readPlan(approachPlan(), faces);
  const dir = ['north', 'east', 'south', 'west'][d.dir];
  if (v.isdoor > 5) {
    d.kind = 'arch';
    out.push({ id: uid(), kind: 'roll', title: 'Is there a door?', text: `D10 ${v.isdoor}: the ${dir} way is an open archway. No lock, no trap.`, rolls: [{ label: 'D10', value: v.isdoor }], page: 99, place: state.here });
    return finish(state, out, {});
  }
  d.kind = 'door'; d.trapped = v.trap >= 7; d.trap = d.trapped ? v.trapRow : null; d.locked = v.lock >= 12; d.pickDiff = rnd(8); d.forceTries = 0;
  const [dname, dmod] = DIFFICULTY[v.diff]; const per = Math.max(0, skillOf(h, 'Perception') + dmod); const notes = [];
  const pr = look ? readD100(h, 'Perception', v.per, notes) : null;
  d.looked = look; d.spotted = Boolean(look && pr <= per && d.trapped); d.safe = Boolean(look && pr <= per && !d.trapped);
  const rolls = [{ label: 'D10', value: v.isdoor }];
  let text = `D10 ${v.isdoor}: a door. `;
  if (look) { rolls.push({ label: 'Perception', value: pr }); text += `You study it: Perception ${pr} against ${per} (${dname}${dmod ? ` ${dmod > 0 ? '+' : ''}${dmod}` : ''}). ${pr <= per ? (d.trapped ? `You spot a trap: ${TRAPS[d.trap - 1].t}` : 'No sign of a trap.') : 'You cannot tell whether it is safe.'} ${notes.join(' ')}`; }
  else text += 'You do not stop to look. ';
  rolls.push({ label: 'D20 lock', value: v.lock }); text += ` ${d.locked ? `D20 ${v.lock}: it is locked.` : `D20 ${v.lock}: it is not locked.`}`;
  out.push({ id: uid(), kind: 'roll', title: `The ${dir} door`, text: text.trim(), rolls, page: 117, place: state.here });
  darkRemind(state, 'door', out); if (d.trapped) darkRemind(state, 'trap', out);
  return finish(state, out, {});
}
// a trap goes off: its avoidance check, +20 if you knew it was there; it never triggers again
export const trapPlan = () => makePlan([['avoid', 'd100']]);
export function springTrap(state0, doorId, faces, { knew = false, voluntary = false } = {}) {
  const state = clone(state0); const h = state.hero; const d = findDoor(state, doorId); const out = [];
  const row = d.trap || rnd(10); const t0 = TRAPS[row - 1]; const wraith = has(h, 'Wraith') && t0.avoid === 'Dodge' && skillOf(h, 'Acrobatics') > skillOf(h, 'Dodge'); const t = wraith ? { ...t0, avoid: 'Acrobatics' } : t0;
  const bonus = ((knew || voluntary) ? 20 : 0) + (t.avoid === 'Acrobatics' && has(h, 'Wraith', 2) ? 20 : 0);
  const skill = Math.max(0, skillOf(h, t.avoid) + bonus); const notes = [];
  const v = readD100(h, t.avoid, readPlan(trapPlan(), faces).avoid, notes); const ok = v <= skill;
  let text = `${voluntary ? 'You set it off on purpose. ' : ''}Trap D10 ${row}: ${t.t} ${t.avoid} ${v} against ${skill}${bonus ? ' (+20, you knew)' : ''}: `;
  let combat = null;
  if (ok) text += 'you avoid it entirely.';
  else if (t.alarm) { const e = encounter(state, rnd(6), rnd(20)); const p = here(state); p.enc = e.enc; p.cleared = false; combat = { name: e.name }; text += `the alarm brings ${e.name} (${encText(e)}).`; }
  else {
    let n = roll(t.dmg);
    if (t.gas) { const e = rnd(100); if (e <= h.resist.Endurance) { n = 0; text += `Endurance ${e}: you hold your breath. `; } }
    if (n) { hurt(h, n); text += `${n} ${t.type} damage. `; }
    if (t.poison) { const e = rnd(100); if (e > h.resist.Endurance) { addEffect(h, 'Poisoned'); text += `Endurance ${e}: Poisoned.`; } else text += `Endurance ${e}: the poison does not take.`; }
    if (t.net) { h.vit.exh += roll('d6'); text += 'You struggle free of the net at the cost of Exhaustion.'; }
  }
  d.trapped = false; d.trap = null; d.spotted = false; d.sprung = true;
  if (!ok) gearRemind(state, 'fail', out);
  out.push({ id: uid(), kind: 'roll', title: 'Trap', text: `${text} ${notes.join(' ')}`.trim(), rolls: [{ label: t.avoid, value: v }], page: 119, result: ok ? 'pass' : 'fail', place: state.here });
  return finish(state, out, { combat });
}
export const thieveryPlan = () => makePlan([['check', 'd100']]);
export function disarmTrap(state0, doorId, faces) {
  const state = clone(state0); const h = state.hero; const d = findDoor(state, doorId);
  const [dname, dmod] = DIFFICULTY[rnd(8)]; const skill = Math.max(0, skillOf(h, 'Thievery') + dmod); const notes = [];
  const v = readD100(h, 'Thievery', readPlan(thieveryPlan(), faces).check, notes, { adv: (h.perks || []).includes('Trap Buster') });
  const crits = []; critFx(state, 'Thievery', critKind(v, skill), crits, { handled: true }); state.log.push(...crits);
  if (v <= skill) { d.trapped = false; d.trap = null; d.spotted = false; d.safe = true; h.vit.xp += 10; bump(h, 'traps'); return finish(state, [{ id: uid(), kind: 'roll', title: 'Disarm', text: `Thievery ${v} against ${skill} (${dname}): the trap is disabled. +10 XP. ${notes.join(' ')}`.trim(), rolls: [{ label: 'Thievery', value: v }], page: 117, result: 'pass', place: state.here }], {}); }
  state.log.push({ id: uid(), kind: 'roll', title: 'Disarm', text: `Thievery ${v} against ${skill} (${dname}): it goes off in your hands.`, rolls: [{ label: 'Thievery', value: v }], page: 117, result: 'fail', place: state.here });
  return springTrap(state, doorId, fakeFaces(trapPlan()), { knew: true });
}
export function pickLock(state0, doorId, faces) {
  const state = clone(state0); const h = state.hero; const d = findDoor(state, doorId);
  if (!(h.items.lockpicks > 0)) return finish(state, [{ id: uid(), kind: 'note', title: 'No Lockpick', text: 'You need a Lockpick.', rolls: [] }], {});
  const [dname, dmod] = DIFFICULTY[d.pickDiff || 5]; const skill = Math.max(0, skillOf(h, 'Thievery') + dmod); const notes = [];
  const v = readD100(h, 'Thievery', readPlan(thieveryPlan(), faces).check, notes); const ck = critKind(v, skill);
  const crits = []; critFx(state, 'Thievery', ck, crits, { handled: true }); state.log.push(...crits);
  if (ck === 'fumble') { h.items.lockpicks -= 1; state.log.push({ id: uid(), kind: 'roll', title: 'Pick the lock', text: `Thievery ${v} against ${skill} (${dname}): the Lockpick snaps, and something clicks.`, rolls: [{ label: 'Thievery', value: v }], page: 118, result: 'fail', place: state.here }); d.trapped = true; d.trap = d.trap || rnd(10); return springTrap(state, doorId, fakeFaces(trapPlan())); }
  if (v <= skill) { d.locked = false; h.vit.xp += 10; bump(h, 'thiefOpens'); return finish(state, [{ id: uid(), kind: 'roll', title: 'Pick the lock', text: `Thievery ${v} against ${skill} (${dname}): the lock opens. +10 XP. ${notes.join(' ')}`.trim(), rolls: [{ label: 'Thievery', value: v }], page: 118, result: 'pass', place: state.here }], {}); }
  h.items.lockpicks -= 1; d.pickDiff = easeDifficulty(d.pickDiff || 5);
  return finish(state, [{ id: uid(), kind: 'roll', title: 'Pick the lock', text: `Thievery ${v} against ${skill} (${dname}): the Lockpick snaps. The next attempt is a step easier.`, rolls: [{ label: 'Thievery', value: v }], page: 118, result: 'fail', place: state.here }], {});
}
export const forcePlan = (state) => makePlan([['check', 'd100'], ['tension', `d${state.domain.tension}`]]);
export function forceDoor(state0, doorId, faces) {
  const state = clone(state0); const h = state.hero; const d = findDoor(state, doorId); const out = [];
  const plan = forcePlan(state0); const v = readPlan(plan, faces); const bonus = 20 * (d.forceTries || 0); const skill = skillOf(h, 'Athletics') + bonus; const notes = [];
  const r = readD100(h, 'Athletics', v.check, notes); const herc = Boolean(h.herculean); if (herc) { h.herculean = false; notes.push('Herculean Feat: it is smashed open.'); }
  const ok = herc || r <= skill; d.forceTries = (d.forceTries || 0) + 1;
  if (ok) { d.locked = false; h.vit.xp += 10; }
  out.push({ id: uid(), kind: 'roll', title: 'Force the door', text: `Athletics ${r} against ${skill}${bonus ? ` (+${bonus} for trying again)` : ''}: ${ok ? 'it gives way. +10 XP.' : 'it holds.'} The noise carries. ${notes.join(' ')}`.trim(), rolls: [{ label: 'Athletics', value: r }], page: 118, result: ok ? 'pass' : 'fail', place: state.here });
  if (!herc) critFx(state, 'Athletics', critKind(r, skill), out);
  const eff = tensionCheck(state, Number(plan.defs[1][1].slice(1)), v.tension, out);
  return finish(state, out, { darkness: eff });
}
export function openDoor(state0, doorId) { const state = clone(state0); const d = findDoor(state, doorId); d.open = true; return state; }

// ---- gear, the pack and what it does (pp. 83, 205-241) ----
const PARTS = ['Torso', 'Arms', 'Legs', 'Head', 'Shield'];
// worn armour sets your Armor by location; attuned magic items add what the engine can apply (loot.propEffects)
export function recalcGear(h) {
  h.worn = h.worn || {};
  if (Object.keys(h.worn).some((k) => PARTS.includes(k))) {
    const a = { Torso: 0, Arms: 0, Legs: 0, Head: 0 };
    for (const p of ['Torso', 'Arms', 'Legs', 'Head']) { const it = h.worn[p]; if (it) a[p] = (armourByName(it.base || it.name)?.prot || 0); }
    if (h.timed?.some((t) => t.name === 'Stoneskin')) for (const k of Object.keys(a)) a[k] += 1;
    h.armor = a; h.armorName = h.worn.Torso?.name || h.armorName;
  }
  const fx = { skills: {}, resist: [], maxAether: 0, maxTough: 0, slots: 0, light: false, immune: [] };
  for (const it of Object.values(h.worn)) {
    if (!it || !it.attuned) continue;
    const f = propEffects(it);
    for (const [k, v] of Object.entries(f.skills)) fx.skills[k] = (fx.skills[k] || 0) + v;
    fx.resist.push(...f.resist); fx.immune.push(...f.immune); fx.slots += f.slots; fx.light = fx.light || f.light;
    fx.maxAether += f.maxAether; fx.maxTough += f.maxTough;
  }
  // max Aether / Toughness changes are applied once, as the difference from what was applied before
  const prev = h.gearFx || { maxAether: 0, maxTough: 0 };
  h.vit.maxAether += fx.maxAether - (prev.maxAether || 0); h.vit.maxTough += fx.maxTough - (prev.maxTough || 0);
  h.vit.aether = Math.min(h.vit.aether, h.vit.maxAether); h.vit.tough = Math.min(h.vit.tough, h.vit.maxTough);
  h.gearFx = fx;
}
// skill bonuses from gear, timed effects and armour weight (Maneuverability, a helmet's Perception)
export function bonusOf(h, name) {
  let b = (h.gearFx?.skills?.[name] || 0) + (heroMods(h).skills[name] || 0);
  for (const t of h.timed || []) b += t.skills?.[name] || 0;
  const torso = h.worn?.Torso && armourByName(h.worn.Torso.base || h.worn.Torso.name);
  if (torso?.man && ['Acrobatics', 'Dodge', 'Stealth'].includes(name) && !has(h, 'Bulwark')) b -= torso.man;
  const helm = h.worn?.Head && armourByName(h.worn.Head.base || h.worn.Head.name);
  if (helm?.per && name === 'Perception') b -= helm.per;
  return b;
}
const packItem = (h, id) => (h.pack || []).find((x) => x.id === id);
const log1 = (state, title, text, extra = {}) => ({ id: uid(), kind: 'note', title, text, rolls: [], place: state.here, ...extra });
export function equipItem(state0, id) {
  const state = clone(state0); const h = state.hero; const it = packItem(h, id); if (!it) return finish(state, [], {});
  let text = '';
  const asWeapon = it.kind === 'weapon' || (it.kind === 'magic' && it.type === 'Weapon') || (it.kind === 'relic' && weaponByName(it.type === 'Scimitar' ? 'Saber' : it.type === 'Fist weapon' ? 'Claw' : it.type));
  if (asWeapon) {
    const base = weaponByName(it.base || it.name) || (it.kind === 'relic' ? weaponByName(it.type === 'Scimitar' ? 'Saber' : it.type === 'Fist weapon' ? 'Claw' : it.type) : null);
    const w = wieldable(base || { name: it.name, speed: 0, skill: 'Bladed Weapons', dtype: 'Slashing', traits: [] }, { name: it.name, from: it.id });
    if (it.attuned) for (const p of it.properties || []) { if (/^\+1 damage of the same type/.test(p.t)) w.plus += 1; if (p.dtype && /add \+D4 damage of that Type/.test(p.t)) w.extra = [...(w.extra || []), { die: 'd4', dtype: p.dtype }]; if (/\+10 to Initiative/.test(p.t)) w.quick = true; }
    const pw = (it.powers || []).join('. ') || it.t;
    if (it.kind === 'relic') { if (/ignore Armor/.test(pw)) w.ignoreArmor = true; const m = pw.match(/\+(\d+) (\w+) damage/); if (m) w.extra = [...(w.extra || []), { die: m[1], dtype: m[2] }]; const d = pw.match(/\+D(\d+) (\w+) damage/); if (d) w.extra = [...(w.extra || []), { die: `d${d[1]}`, dtype: d[2] }]; }
    h.weapons.push(w); it.equipped = true; text = `You take up the ${it.name}. Choose it in the fight to wield it.`;
  } else if (it.kind === 'armour' || (it.kind === 'magic' && it.type === 'Armor') || (it.kind === 'relic' && /Shield|Plate/.test(it.type))) {
    const a = armourByName(it.base || it.name) || (it.kind === 'relic' ? armourByName(/Shield/.test(it.type) ? 'Full Shield' : 'Plate') : null);
    const part = a?.part || 'Torso'; h.worn = h.worn || {};
    if (h.worn[part]) { const old = packItem(h, h.worn[part].id); if (old) old.equipped = false; }
    h.worn[part] = { ...it, base: a?.name, die: it.die || a?.integ || 8 }; it.equipped = true; text = `You put on the ${it.name} (${part}).`;
    if (part === 'Shield') h.shield = { name: it.name, parry: (a?.parry || 10) + (/Parry by \+20/.test((it.powers || []).join(' ')) ? 20 : 0) };
  } else if (it.kind === 'amulet') {
    h.masteries = (h.masteries || []).filter((m) => !m.amulet);
    h.masteries.push({ name: it.mastery, tiers: h.amuletTiers || 1, amulet: true }); h.worn = h.worn || {}; h.worn.Amulet = it; it.equipped = true;
    text = `The amulet grants you the ${it.mastery} Mastery and its Feature.`;
  } else if (it.kind === 'magic' || it.kind === 'relic') {
    const slot = /Ring/.test(it.type) ? (h.worn?.Ring1 ? 'Ring2' : 'Ring1') : it.type === 'Head Piece' ? 'Head' : it.type; h.worn = h.worn || {};
    h.worn[slot] = it; it.equipped = true; text = `You wear the ${it.name}.`;
  } else if (it.kind === 'gear' && ['Backpack', 'Pouch', 'Belt', 'Bedroll', 'Crowbar', "Thieves' Toolkit", 'Lamp', 'Belt Lamp'].includes(it.name)) {
    it.equipped = true; if (it.name === "Thieves' Toolkit") h.items.tools = (h.items.tools || 0) + 1; text = `${it.name} ready.`;
  } else return finish(state, [log1(state, it.name, 'There is nothing to put on.')], {});
  recalcGear(h);
  return finish(state, [log1(state, 'Gear', text)], {});
}
export function unequipItem(state0, id) {
  const state = clone(state0); const h = state.hero; const it = packItem(h, id); if (!it) return finish(state, [], {});
  it.equipped = false;
  h.weapons = h.weapons.filter((w) => w.from !== id); h.wield = Math.min(h.wield, h.weapons.length - 1);
  for (const [k, v] of Object.entries(h.worn || {})) if (v?.id === id) { delete h.worn[k]; if (k === 'Shield') h.shield = null; }
  if (it.kind === 'amulet') h.masteries = (h.masteries || []).filter((m) => !m.amulet);
  if (it.name === "Thieves' Toolkit") h.items.tools = Math.max(0, (h.items.tools || 0) - 1);
  recalcGear(h);
  return finish(state, [log1(state, 'Gear', `You put away the ${it.name}.`)], {});
}
export function dropItem(state0, id) {
  const state = clone(state0); const h = state.hero; const it = packItem(h, id); if (!it) return finish(state, [], {});
  if (it.equipped) { const s2 = unequipItem(state, id).state; return dropItem(s2, id); }
  h.pack = h.pack.filter((x) => x.id !== id);
  return finish(state, [log1(state, 'Left behind', `You leave the ${it.name}.`)], {});
}
// After a fight your worn armour saw use: roll each piece's Integrity die; 1-2 steps it down; 1-2 on a D4 ruins it
function integrityRolls(state, out) {
  const h = state.hero; if (!h.worn) return;
  const lines = [];
  for (const part of PARTS) {
    const it = h.worn[part]; if (!it || !it.die) continue;
    const r = rnd(it.die);
    if (r > 2) { lines.push(`${it.name} D${it.die} ${r}: holds`); continue; }
    if (it.die === 4) { lines.push(`${it.name} D4 ${r}: ruined`); h.pack = (h.pack || []).filter((x) => x.id !== it.id); delete h.worn[part]; if (part === 'Shield') h.shield = null; continue; }
    it.die = stepDie(it.die, -1); const p = packItem(h, it.id); if (p) p.die = it.die; lines.push(`${it.name} ${r}: Integrity falls to D${it.die}`);
  }
  if (lines.length) { recalcGear(h); out.push({ id: uid(), kind: 'note', title: 'Armour Integrity', text: `${lines.join('; ')}.`, rolls: [], page: 83, place: state.here }); }
}

// ---- Potions (pp. 126, 221) ----
export function identifyPotion(state0, id, faces) {
  const state = clone(state0); const h = state.hero; const it = packItem(h, id); const notes = [];
  const skill = skillOf(h, 'Medicine'); const v = readD100(h, 'Medicine', readPlan(checkPlan(), faces).check, notes);
  it.tried = true;
  if (v > skill) return finish(state, [{ id: uid(), kind: 'roll', title: 'Study the potion', text: `Medicine ${v} against ${skill}: you cannot tell what it is. Only drinking it will tell. ${notes.join(' ')}`.trim(), rolls: [{ label: 'Medicine', value: v }], result: 'fail', page: 126, place: state.here }], {});
  const p = rnd(20); const a = rnd(20); const row = potionOf(p); const age = agingOf(a);
  Object.assign(it, { known: true, roll: p, aging: age, name: `${row.t.split('.')[0]} potion`, t: `${row.t} Aging D20 ${a}: ${age.t}` });
  return finish(state, [{ id: uid(), kind: 'roll', title: 'Study the potion', text: `Medicine ${v} against ${skill}: it is ${row.t.split('.')[0]} (D20 ${p}). Potion Aging D20 ${a}: ${age.t}`, rolls: [{ label: 'Medicine', value: v }, { label: 'Potion', value: p }, { label: 'Aging', value: a }], result: 'pass', page: 221, place: state.here }], {});
}
const healWounds = (h, n) => { const v = h.vit; const t = Math.min(n, v.maxTough - v.tough); v.tough += t; v.health = Math.min(v.maxHealth, v.health + (n - t)); };
const timed = (h, name, rooms, extra = {}) => { h.timed = (h.timed || []).filter((t) => t.name !== name); h.timed.push({ name, rooms, ...extra }); };
export const drinkPlan = () => makePlan([['potion', 'd20'], ['aging', 'd20'], ['end', 'd100']]);
export function drinkPotion(state0, id, faces = null) {
  const state = clone(state0); const h = state.hero; const it = packItem(h, id); const cb = state.combat; const v = h.vit;
  const quick = beltUse(state, id);
  const dv = faces ? readPlan(drinkPlan(), faces) : { potion: rnd(20), aging: rnd(20), end: rnd(100) };
  if (!it.known) { it.roll = dv.potion; it.aging = agingOf(dv.aging); }
  h.pack = h.pack.filter((x) => x.id !== id);
  const row = potionOf(it.roll); const age = it.aging; const k = age.k;
  const lines = [`${row.t.split('.')[0]} (D20 ${it.roll}). Aging D20 ${age.v}: ${age.t}`];
  if (k === 'poison') { const t = readD100(h, 'Endurance', dv.end, []); if (t > skillOf(h, 'Endurance')) { addEffect(h, 'Poisoned', 1); lines.push(`Endurance ${t}: Poisoned (1).`); } else lines.push(`Endurance ${t}: you keep it down.`); }
  else if (k === 'explodes') { const n = roll('2d4'); hurt(h, n); lines.push(`${n} Force damage.`); }
  else if (k !== 'inert') {
    const f = k === 'weak' ? 0.5 : k === 'strong' || k === 'permanent' ? 2 : 1; const dur = (n) => Math.max(1, Math.round(n * (k === 'weak' ? 0.5 : k === 'strong' ? 1.5 : 1)));
    const amt = (n) => Math.max(1, Math.floor(n * f));
    switch (it.roll) {
      case 1: { const n = amt(5); v.aether = Math.min(v.maxAether + (k === 'permanent' ? 0 : 0), v.aether + n); if (k === 'permanent') { v.maxAether += 5; } lines.push(`+${n} Aether${k === 'permanent' ? ', and +5 max Aether for good' : ''}.`); break; }
      case 2: dropEffect(h, 'Poisoned'); lines.push('The poison is gone.'); break;
      case 3: dropEffect(h, 'Bleeding'); lines.push('The bleeding stops.'); break;
      case 4: dropEffect(h, 'Frightened'); lines.push('Your fear lifts.'); break;
      case 5: timed(h, 'Flaming', 0, { rounds: dur(5), extra: { die: 'd4', dtype: 'Fire' } }); lines.push(`Your weapon burns: +D4 Fire to your Damage Pool for ${dur(5)} rounds.`); break;
      case 6: timed(h, 'Frenzy', 0, { rounds: dur(roll('d6')), frenzy: true }); lines.push('Frenzy: +2D6 damage, but you cannot defend.'); break;
      case 7: case 8: { const n = amt(roll('d6') + 2); healWounds(h, n); lines.push(`You heal ${n} Wounds.`); break; }
      case 9: { const n = amt(roll('d10') + 5); h.regen = (h.regen || 0) + n; lines.push(`You will heal ${n} Wounds, 1 each round (or room).`); break; }
      case 10: h.poisonNext = true; lines.push('Your next successful attack Poisons (1).'); break;
      case 11: dropEffect(h, 'Cursed'); dropEffect(h, 'Sickened'); lines.push('Curses and sickness are purged.'); break;
      case 12: case 13: { const n = amt(roll('d4')); v.exh = Math.max(0, v.exh - n); lines.push(`-${n} Exhaustion.`); break; }
      case 14: h.items.rations = (h.items.rations || 0) + 1; lines.push('It counts as a Ration.'); break;
      case 15: { const n = amt(1); v.sanity = Math.min(v.maxSanity, v.sanity + n); if (k === 'permanent') v.maxSanity += 1; lines.push(`+${n} Sanity.`); break; }
      case 16: case 17: if (cb) cb.extraAction = (cb.extraAction || 0) + amt(1); lines.push(cb ? 'You gain a free Standard Action.' : 'It is wasted out of a fight.'); break;
      case 18: timed(h, 'Stoneskin', dur(roll('d10')), { skills: { Dodge: -10, Acrobatics: -10 } }); recalcGear(h); lines.push('Stoneskin: +1 Armor, -10 Dodge and Acrobatics for some rooms.'); break;
      case 19: timed(h, 'Strength', dur(roll('d10')), { skills: { Endurance: 10 * f, Athletics: 10 * f } }); lines.push(`Strength: +${10 * f} Endurance and Athletics for some rooms.`); break;
      case 20: { if ((h.timed || []).some((t) => t.name === 'Vitality')) { const n = roll('d10'); hurt(h, n); lines.push(`Too much at once: ${n} Acid damage.`); } else { const n = amt(roll('d10')); v.temp = (v.temp || 0) + n; timed(h, 'Vitality', 99); lines.push(`+${n} Temporary Toughness.`); } break; }
      default: break;
    }
    if (k === 'permanent') lines.push('Its effect is permanent.');
  }
  h.belt = (h.belt || []).filter((x) => x !== id);
  return afterUse(state, quick, [{ id: uid(), kind: 'note', title: 'You drink the potion', text: lines.join(' '), rolls: [], page: 221, place: state.here }]);
}
// Vials of Potency (Container Loot) and the consumable Relics
export function consume(state0, id) {
  const state = clone(state0); const h = state.hero; const it = packItem(h, id); const v = h.vit; let text = ''; const quick = beltUse(state, id); h.belt = (h.belt || []).filter((x) => x !== id);
  h.pack = h.pack.filter((x) => x.id !== id);
  const m = it.name.match(/Vial of Potency - (\w+)/); const n = roll('d4');
  if (m) {
    const what = m[1];
    if (what === 'Aether') { v.maxAether += n; v.aether += n; } else if (what === 'Health') { v.maxHealth += n; v.health += n; } else if (what === 'Sanity') { v.maxSanity += n; v.sanity += n; } else h.resist[what] = (h.resist[what] || 0) + n;
    text = `+${n} ${what} for good.`;
  } else if (it.name === 'Draught of Vitality') { v.maxHealth += n; v.health += n; text = `Your Health rises by ${n} for good.`; }
  else if (it.name === 'Elixir of Arcane Ascendance') { v.maxAether += n; v.aether += n; text = `Your Aether rises by ${n} for good.`; }
  else if (it.name === 'Mindward Elixir') { v.maxSanity += n; v.sanity += n; text = `Your Sanity rises by ${n} for good.`; }
  else if (it.name === 'Gloomheart Seed') { h.abilityPoints = (h.abilityPoints || 0) + 1; text = '+1 Ability Point.'; }
  else text = `${it.t} (Apply it as the book describes.)`;
  return afterUse(state, quick, [log1(state, it.name, text, { page: it.page })]);
}
// Fragments (p. 214): one use each, no attuning
export const fragmentPlan = () => makePlan([['check', 'd100']]);
export function useFragment(state0, id, targetId = null, faces = null) {
  const state = clone(state0); const h = state.hero; const it = packItem(h, id); const cb = state.combat; const p = here(state); const out = [];
  const quick = beltUse(state, id); h.belt = (h.belt || []).filter((x) => x !== id);
  h.pack = h.pack.filter((x) => x.id !== id);
  const foes = p?.enc?.alive || []; const tgt = foes.find((a) => a.id === (targetId || cb?.target)) || foes[0];
  const hit = (a, n, dtype) => { const s = foeStat(state, a); const r = woundFoe(state, a, s, n, dtype); if (a.health <= 0) killFoe(state, a, out); return r.net; };
  let text = it.t;
  switch (it.roll) {
    case 2: timed(h, 'Invisible', 5); text += ' You are unseen for 5 rooms (or until you attack): you may pass any Combat Encounter by.'; break;
    case 3: if (cb) cb.flags.dodgeBonus = { n: 30, rounds: 4 }; text += ' +30 to Dodge for 4 rounds.'; break;
    case 4: h.vit.sanity += 10; h.vit.tempSanity = (h.vit.tempSanity || 0) + 10; text += ' +10 Temporary Sanity.'; break;
    case 6: if (tgt) { const t = readD100(h, 'Resolve', faces ? readPlan(fragmentPlan(), faces).check : rnd(100), []), r = skillOf(h, 'Resolve'); text += t <= r ? ` Resolve ${t}: ${hit(tgt, roll('3d10'), 'Psychic')} Psychic damage.` : ` Resolve ${t}: it fails.`; } break;
    case 7: { const n = roll('3d6'); const sum = [...foes].map((a) => hit(a, n, 'Acid')); text += ` ${n} Acid damage to each (${sum.join(', ')}).`; break; }
    case 9: timed(h, 'Cursed bandages', roll('d6'), { healRoom: 2 }); text += ' 2 Toughness a room while you keep them on; too long and they fester.'; break;
    case 10: timed(h, 'Blood-red strength', 99, { skills: { Athletics: 50 }, once: 'Athletics' }); break;
    case 12: timed(h, 'Spiked gauntlet', 1, { skills: { 'Unarmed Combat & Fist Weapons': 50 }, burnOnExit: '2d6' }); break;
    case 13: timed(h, 'Black vial', 4, { noSanityLoss: true }); break;
    case 14: if (tgt) tgt.conds.Restrained = 99; text += ' It is Restrained.'; break;
    case 15: if (tgt) text += ` ${hit(tgt, roll('3d10'), 'Psychic')} Psychic damage.`; break;
    case 16: { const n = roll('3d4'); const sum = [...foes].map((a) => hit(a, n, 'Poison')); text += ` ${n} Poison damage to each (${sum.join(', ')}).`; break; }
    case 17: if (tgt) { p.enc.alive = p.enc.alive.filter((a) => a.id !== tgt.id); text += ' It turns away, no longer hostile.'; } break;
    case 1: h.reaper = true; text += ' The next creature you strike down rises as a Skeleton under your control.'; break;
    case 8: { h.foresee = [rnd(20), rnd(20), rnd(20)]; text += ` The skull shows you the next three rooms: Combat Encounter D20 ${h.foresee.join(', ')} (10+ in a room, 15+ in a corridor, means a fight).`; break; }
    case 11: if (cb) { cb.extraAction = (cb.extraAction || 0) + 1; } timed(h, 'Raven feather', 0, { rounds: 4, extraAct: true }); text += ' +1 Standard Action for the next 4 rounds.'; break;
    case 18: { const M = MASTERY_LIST[rnd(MASTERY_LIST.length) - 1]; h.masteries = [...(h.masteries || []).filter((x) => !x.borrowed), { name: M.name, tiers: 5, borrowed: true }]; text += ` The pages open on ${M.name}: you may use any one of its Abilities once (from your Abilities).`; break; }
    case 19: { const n = roll('2d10'); h.vit.temp = (h.vit.temp || 0) + n; text += ` +${n} Temporary Toughness.`; break; }
    case 20: foes.forEach((a) => { a.conds.Dazed = (a.conds.Dazed || 0) + 3; }); text += ' Every enemy is Dazed (3).'; break;
    default: text += ' (Apply it as the book describes.)';
  }
  out.unshift(log1(state, it.name, text, { page: 214 }));
  if (cb && p.enc && !p.enc.alive.length) return victory(state, out);
  return afterUse(state, quick, out);
}

// ---- Camp Activities (pp. 124-125) ----
export const CAMP_ACTIVITIES = {
  cook: { t: 'Cooking: each Cooking Ingredient becomes a Ration', exh: 1, camp: -1 },
  bandages: { t: 'Craft Bandages: 1 Crafting Supplies each', exh: 1, camp: -1 },
  oil: { t: 'Craft Lamp Oil: 2 Crafting Supplies each', exh: 1, camp: -2 },
  lockpicks: { t: 'Craft Lockpicks: 1 Crafting Supplies each', exh: 1, camp: -2 },
  torches: { t: 'Craft Torches: 1 Crafting Supplies each', exh: 1, camp: -2 },
  repair: { t: 'Repair: 2 Crafting Supplies a piece of gear', exh: 2, camp: -2 },
};
function campActivities(state, opts, out) {
  const h = state.hero; const it = h.items; let mod = 0; const lines = [];
  const n = (k) => Math.max(0, Math.floor(opts[k] || 0));
  if (n('cook')) { const c = Math.min(n('cook'), it.cooking || 0); if (c) { it.cooking -= c; it.rations = (it.rations || 0) + c; h.vit.exh += 1; mod -= 1; lines.push(`cooked ${c} Ration${c > 1 ? 's' : ''}`); } }
  for (const [k, per, key, label] of [['bandages', 1, 'bandages', 'Bandage'], ['oil', 2, 'oil', 'Lamp Oil'], ['lockpicks', 1, 'lockpicks', 'Lockpick'], ['torches', 1, 'torches', 'Torch']]) {
    const c = Math.min(n(k), Math.floor((it.crafting || 0) / per)); if (!c) continue;
    it.crafting -= c * per; it[key] = (it[key] || 0) + c; h.vit.exh += 1; mod -= CAMP_ACTIVITIES[k].camp * -1; lines.push(`made ${c} ${label}${c > 1 ? 's' : ''}`);
  }
  const heal = (opts.heal || []).filter((c) => h.effects.some((e) => e.name === c));
  for (const c of heal) { if ((it.bandages || 0) < 1) break; it.bandages -= 1; dropEffect(h, c); h.vit.exh += 1; lines.push(`dressed ${c}`); }
  const rep = (opts.repair || []).slice(0, Math.floor((it.crafting || 0) / 2));
  if (rep.length) {
    for (const rid of rep) {
      it.crafting -= 2;
      const w = h.weapons.find((x) => x.from === rid || x.name === rid); if (w?.broken) { w.broken = false; lines.push(`mended the ${w.name}`); continue; }
      if (h.shield?.broken && (rid === 'shield' || h.worn?.Shield?.id === rid)) { h.shield.broken = false; lines.push(`mended the ${h.shield.name}`); continue; }
      const part = Object.keys(h.worn || {}).find((k) => h.worn[k]?.id === rid);
      if (part) { const a = armourByName(h.worn[part].base || h.worn[part].name); h.worn[part].die = Math.min(a?.integ || 12, stepDie(h.worn[part].die, 1)); const pi = packItem(h, rid); if (pi) pi.die = h.worn[part].die; lines.push(`repaired the ${h.worn[part].name} (D${h.worn[part].die})`); }
    }
    h.armorDown = {}; h.vit.exh += 2; mod -= 2;
  }
  // Attune: an Attunement Crystal and 1 Exhaustion per magic item
  if (gdCount(state, 19) && (opts.attune || []).length) { lines.push('could not attune: the Growing Darkness will not let you concentrate'); opts = { ...opts, attune: [] }; }
  for (const aid of opts.attune || []) {
    const x = packItem(h, aid); if (!x || x.attuned || (it.crystals || 0) < 1) continue;
    it.crystals -= 1; h.vit.exh += 1; x.attuned = true; x.properties = rollProperties(x);
    x.t = `${x.rarity} ${x.type}${x.base ? ` (${x.base})` : ''}. ${x.properties.map((p) => p.t).join(' ')} ${x.peculiar || ''}`.trim();
    lines.push(`attuned the ${x.name}: ${x.properties.map((p) => `D20 ${p.v}, ${p.t}`).join('; ')}`);
  }
  if (opts.swapAmulet) lines.push('swapped Mastery amulets');
  if (opts.pray && has(h, 'Emissary')) { const n = roll('d4'); h.vit.sanity = Math.min(h.vit.maxSanity, h.vit.sanity + n); h.vit.exh += 2; mod -= 1; lines.push(`prayed (+${n} Sanity, +2 Exhaustion)`); }
  if (opts.components > 0 && has(h, 'Ritualist')) { const c = Math.min(opts.components, it.crafting || 0); if (c) { it.crafting -= c; it.ritual = (it.ritual || 0) + c; mod -= 4; lines.push(`prepared ${c} Ritual Component${c > 1 ? 's' : ''}`); } }
  if (has(h, 'Tracker', 3)) mod += 2;
  recalcGear(h);
  if (lines.length) out.push({ id: uid(), kind: 'camp', title: 'Camp Activities', text: `You ${lines.join(', ')}.`, rolls: [], page: 125, place: state.here });
  return mod;
}
// Skill Improvement (p. 62): each marked Skill, D100 above it adds D4, otherwise +1, to a maximum of 80
function improveSkills(state, out) {
  const h = state.hero; const lines = []; const rolls = [];
  let mi = 0;
  for (const k of Object.keys(h.marks || {})) {
    if (!h.marks[k]) continue;
    const cur = h.resist[k] ?? h.skills[k] ?? BASE_SKILLS[k] ?? 0; const r = state.campDice?.[`mark${mi}`] ?? rnd(100); mi += 1; const up = r > cur ? rnd(4) : 1; const nv = Math.min(80, cur + up);
    if (k in h.resist) h.resist[k] = nv; else h.skills[k] = nv;
    lines.push(`${k} ${r} ${r > cur ? `above ${cur}: +${up}` : `not above ${cur}: +1`} = ${nv}`); rolls.push({ label: k, value: r });
  }
  h.marks = {};
  if (lines.length) out.push({ id: uid(), kind: 'camp', title: 'Skill Improvement', text: `${lines.join('; ')}.`, rolls, page: 62, place: state.here });
}
// the Rot advances at each rest unless you pass Endurance (p. 87)
function rotAtRest(state, out) {
  const h = state.hero; if (!(h.rot > 0) || h.rot >= 8) return;
  const e = skillOf(h, 'Endurance'); const t = readD100(h, 'Endurance', state.campDice?.rot ?? rnd(100), []);
  if (t <= e) { out.push({ id: uid(), kind: 'camp', title: 'The Rot', text: `Endurance ${t} against ${e}: the Rot holds at stage ${h.rot}.`, rolls: [{ label: 'Endurance', value: t }], page: 87, result: 'pass', place: state.here }); return; }
  h.rot += 1;
  if (h.rot === 2) { h.vit.maxTough = Math.max(1, Math.floor(h.vit.maxTough / 2)); h.vit.tough = Math.min(h.vit.tough, h.vit.maxTough); }
  if (h.rot >= 8) state.over = 'rot';
  out.push({ id: uid(), kind: 'camp', title: 'The Rot', text: `Endurance ${t} against ${e}: the Rot spreads to stage ${h.rot}. ${ROT[h.rot]}`, rolls: [{ label: 'Endurance', value: t }], page: 87, result: 'fail', place: state.here });
}
export function exposeRot(state0, faces = null) {
  const state = clone(state0); const h = state.hero; const e = skillOf(h, 'Endurance'); const t = readD100(h, 'Endurance', faces ? readPlan(checkPlan(), faces).check : rnd(100), []);
  { const o = []; critFx(state, 'Endurance', critKind(t, e), o); state.log.push(...o); }
  if (t <= e || h.rot > 0) return finish(state, [{ id: uid(), kind: 'roll', title: 'The Rot', text: h.rot > 0 ? 'You already carry the Rot.' : `Endurance ${t} against ${e}: you resist the infection.`, rolls: [{ label: 'Endurance', value: t }], page: 87, result: 'pass', place: state.here }], {});
  h.rot = 1; return finish(state, [{ id: uid(), kind: 'roll', title: 'The Rot', text: `Endurance ${t} against ${e}: you are infected. Stage 1: ${ROT[1]}`, rolls: [{ label: 'Endurance', value: t }], page: 87, result: 'fail', place: state.here }], {});
}

// ---- Traders (p. 127): they stay where you found them, buy at half price (magic at a fixed price) ----
export function buyItem(state0, name) {
  const state = clone(state0); const h = state.hero; const offer = FOR_SALE.find((x) => x.name === name); if (!offer) return finish(state, [], {});
  if ((h.items.coins || 0) < offer.cost) return finish(state, [log1(state, 'Trader', `The Trader grunts: you cannot afford the ${name} (${offer.cost} coins).`)], {});
  h.items.coins -= offer.cost; let got;
  if (offer.kind === 'count') got = grant(h, { count: { name, n: 1 } });
  else if (offer.kind === 'weapon') { const w = weaponByName(name); got = grant(h, { item: { id: uid(), kind: 'weapon', name, base: name, t: `${w.dtype}, ${w.skill}, Speed ${w.speed}. ${w.traits.join(', ')}.`, page: 208 } }); }
  else if (offer.kind === 'armour') { const a = armourByName(name); const it = armourItem(a); it.die = a.integ; got = grant(h, { item: it }); }
  else got = countedKey(name) ? grant(h, { count: { name, n: 1 } }) : grant(h, { item: gearItem(name) });
  return finish(state, [log1(state, 'Trader', `You buy ${got} for ${offer.cost} coins.`, { page: 127 })], {});
}
export function sellItem(state0, id) {
  const state = clone(state0); const h = state.hero; const it = packItem(h, id); if (!it) return finish(state, [], {});
  if (it.kind === 'amulet') return finish(state, [log1(state, 'Trader', 'Traders will not buy Amulets.')], {});
  const full = (h.goalsDone || []).includes('Hoarder') && (h.fullPriceSold || 0) < 5 && !['magic', 'relic'].includes(it.kind);
  const price = full ? priceOf(it) * 2 : priceOf(it);
  const s1 = it.equipped ? unequipItem(state, id).state : state; const h1 = s1.hero;
  h1.pack = h1.pack.filter((x) => x.id !== id); h1.items.coins = (h1.items.coins || 0) + price; if (full) h1.fullPriceSold = (h1.fullPriceSold || 0) + 1;
  bump(h1, 'coinsEver', price);
  return finish(s1, [log1(s1, 'Trader', `You sell the ${it.name} for ${price} coins${full ? ' (full price: Hoarder)' : ''}.`, { page: 127 })], {});
}
export function sellCounted(state0, name, n = 1) {
  const state = clone(state0); const h = state.hero; const k = countedKey(name); const have = h.items[k] || 0; const c = Math.min(n, have); if (!c) return finish(state, [], {});
  const each = Math.floor((FOR_SALE.find((x) => x.name === name)?.cost || gearByName(name)?.cost || 0) / 2); h.items[k] -= c; h.items.coins = (h.items.coins || 0) + each * c;
  return finish(state, [log1(state, 'Trader', `You sell ${c} ${name} for ${each * c} coins.`, { page: 127 })], {});
}

// ---- containers (p. 116): a deep search costs a Tension Die check and 2 Exhaustion ----
export const deepSearchPlan = (state) => makePlan([['tension', `d${state.domain.tension}`], ['found', 'd10'], ['per', 'd100'], ['diff', 'd8'], ['trap', 'd10'], ['trapRow', 'd10'], ['lock', 'd20']]);
export function deepSearch(state0, faces) {
  const state = clone(state0); const h = state.hero; const p = here(state); const out = [];
  const plan = deepSearchPlan(state0); const v = readPlan(plan, faces);
  p.deepSearched = true; h.vit.exh += 2;
  const eff = tensionCheck(state, Number(plan.defs[0][1].slice(1)), v.tension, out);
  // the book's procedure: Perception at a Random Difficulty to spot a trap, D20 10+ locked
  const c = { id: `c-${uid()}`, container: true, found: v.found, dir: 0, kind: 'door', trapped: v.trap >= 7, trap: v.trap >= 7 ? v.trapRow : null, locked: v.lock >= 10, pickDiff: rnd(8), forceTries: 0 };
  const [dname, dmod] = DIFFICULTY[v.diff]; const per = Math.max(0, skillOf(h, 'Perception') + dmod); const notes = [];
  const pr = readD100(h, 'Perception', v.per, notes);
  c.looked = true; c.spotted = pr <= per && c.trapped; c.safe = pr <= per && !c.trapped;
  p.container = c;
  out.push({ id: uid(), kind: 'roll', title: 'Deep search', text: `You leave no stone unturned (+2 Exhaustion) and find a hidden container. Perception ${pr} against ${per} (${dname}): ${pr <= per ? (c.trapped ? `it is trapped: ${TRAPS[c.trap - 1].t}` : 'no trap that you can see') : 'you cannot tell if it is safe'}. D20 ${v.lock}: ${c.locked ? 'locked' : 'not locked'}. ${notes.join(' ')}`.trim(), rolls: [{ label: 'Perception', value: pr }, { label: 'D20 lock', value: v.lock }], page: 116, place: p.id });
  return finish(state, out, { darkness: eff });
}
export function openContainer(state0) {
  const state = clone(state0); const h = state.hero; const p = here(state); const c = p.container; const out = [];
  if (!c || c.locked) return finish(state, [], {});
  const d10 = c.found || rnd(10); c.opened = true;
  if ((h.perks || []).includes('Lucky Find')) { const n = rnd(20); grant(h, { coins: n }); out.push(log1(state, 'Lucky Find', `${n} coins.`)); }
  if (d10 <= 5) { out.unshift({ id: uid(), kind: 'roll', title: 'The container', text: `D10 ${d10}: it is empty.`, rolls: [{ label: 'D10', value: d10 }], page: 116, place: p.id }); return finish(state, out, {}); }
  const lines = containerLoot(h);
  out.unshift({ id: uid(), kind: 'roll', title: 'The container', text: `D10 ${d10}: something inside. ${lines.join(' ')}`, rolls: [{ label: 'D10', value: d10 }], page: 220, place: p.id });
  return finish(state, out, {});
}
// an Event or other source that says "roll on the Spoils table"
export function rollEventSpoils(state0, which = 'Spoils table') {
  const state = clone(state0); const lines = rollSpoils(state.hero, which); const p = here(state); if (p.event) p.event.spoils = true;
  return finish(state, [{ id: uid(), kind: 'roll', title: 'Spoils', text: `${lines.join('; ')}.`, rolls: [], page: 213, place: state.here }], {});
}

// ---- surprise (p. 76): Stealth against their Mind wins the Initiative and +20 to your first attack ----
export const sneakPlan = () => makePlan([['me', 'd100'], ['foe', 'd100']]);
export function sneakAttack(state0, faces) {
  const state = clone(state0); const cb = state.combat; const s = foeStat(state); const h = state.hero; const notes = [];
  const living = (h.perks || []).includes('Living Shadow');
  if (traitOf(s, 'Alert')) return finish(state, [{ id: uid(), kind: 'combat', title: 'Ambush', text: 'It is Alert and cannot be surprised. Roll Initiative.', rolls: [], page: 132, place: state.here }], {});
  const pre = []; settleAllQueued(state, pre); state.log.push(...pre);
  const v = readPlan(sneakPlan(), faces); const st = Math.max(0, skillOf(h, 'Stealth') + penaltyOf(h, cb, 'Stealth').mod);
  const me = readD100(h, 'Stealth', v.me, notes); const r = opposedResult(me, st, v.foe, s.mind);
  const crits = []; critFx(state, 'Stealth', critKind(me, st), crits); state.log.push(...crits);
  if (living || r.winner === 'att') {
    cb.initiative = 'player'; cb.side = 'player'; cb.flags.playerBonus += 20; cb.surprisedThem = true; bump(h, 'surprised', here(state).enc.alive.length);
    return finish(state, [{ id: uid(), kind: 'combat', title: 'Ambush', text: living ? 'Living Shadow: you always surprise them. You act first, +20 to your first attack.' : `Stealth ${me} against ${st}; their Mind ${v.foe} against ${s.mind}: you take them unawares. You act first, +20 to your first attack. ${notes.join(' ')}`.trim(), rolls: [{ label: 'You', value: me }, { label: 'Them', value: v.foe }], page: 76, result: 'pass', place: state.here }], {});
  }
  cb.initiative = 'enemy'; cb.side = 'enemy'; cb.enemyIdx = 0;
  return finish(state, [{ id: uid(), kind: 'combat', title: 'Ambush', text: `Stealth ${me} against ${st}; their Mind ${v.foe} against ${s.mind}: they hear you coming and act first. ${notes.join(' ')}`.trim(), rolls: [{ label: 'You', value: me }, { label: 'Them', value: v.foe }], page: 76, result: 'fail', place: state.here }], {});
}

// ---- levelling up (p. 62) ----
export function levelUp(state0, benefit, pick = null) {
  const state = clone(state0); const h = state.hero; const v = h.vit; if (!levelDue(h)) return finish(state, [], {});
  h.level = (h.level || 1) + 1; h.abilityPoints = (h.abilityPoints || 0) + 1; onLevel(h);
  const b = LEVEL_BENEFITS.find((x) => x.id === benefit); let text = '';
  const n = b?.die ? roll(b.die) : 0;
  if (benefit === 'health') { v.maxHealth += n; v.health += n; text = `+${n} Health`; }
  if (benefit === 'tough') { v.maxTough += n; v.tough += n; text = `+${n} Toughness`; }
  if (benefit === 'sanity') { v.maxSanity += n; v.sanity += n; text = `+${n} Sanity`; }
  if (benefit === 'aether') { v.maxAether += n; v.aether += n; text = `+${n} Aether`; }
  if (benefit === 'pool') { h.poolDice = [...(h.poolDice || []), { die: 'd6', dtype: pick || 'Slashing' }]; text = `+D6 ${pick || 'Slashing'} in your Damage Pool`; }
  if (benefit === 'ability') { h.abilityPlus = { ...(h.abilityPlus || {}), [pick]: ((h.abilityPlus || {})[pick] || 0) + 1 }; text = `+1 damage to ${pick}`; }
  if (benefit === 'skill' && pick) { if (pick in h.resist) h.resist[pick] += 5; else h.skills[pick] = Math.min(80, (h.skills[pick] ?? BASE_SKILLS[pick] ?? 0) + 5); text = `+5 ${pick}`; }
  if (benefit === 'resist') { for (const k of ['Endurance', 'Resolve', 'Spellward']) h.resist[k] += 5; text = '+5 Endurance, Resolve and Spellward'; }
  return finish(state, [{ id: uid(), kind: 'note', title: `Level ${h.level}`, text: `You reach level ${h.level}: +1 Ability Point, and ${text}.`, rolls: n ? [{ label: b.die.toUpperCase(), value: n }] : [], page: 62, place: state.here }], {});
}
// Ability Points open the next Tier of a Mastery (Tier 1 first). A new survivor spends 2 on two different Masteries.
export function spendAbilityPoint(state0, name) {
  const state = clone(state0); const h = state.hero; h.masteries = h.masteries || [];
  if (!(h.abilityPoints > 0)) return finish(state, [], {});
  let m = h.masteries.find((x) => masteryOf(x)?.name === name);
  if (!m) { if (h.masteries.filter((x) => !x.amulet).length >= 2) return finish(state, [log1(state, 'Masteries', 'You can follow only two Masteries (and a third through an Amulet).')], {}); m = { name, tiers: 0 }; h.masteries.push(m); }
  if (tiersOf(m) >= 5) return finish(state, [], {});
  m.tiers = tiersOf(m) + 1; h.abilityPoints -= 1; if (m.amulet) h.amuletTiers = m.tiers;
  onGain(h, masteryOf(m).name, m.tiers);
  const t = masteryOf(m).tiers[m.tiers - 1];
  return finish(state, [log1(state, name, `Tier ${m.tiers} opens: ${t.name}. ${t.text}`, { page: masteryOf(m).page })], {});
}
// using a Tier Ability: spend its Aether; damage abilities are rolled against the target (Magic Resistance if Magical)
export const abilityDicePlan = () => makePlan([['me', 'd100'], ['foe', 'd100']]);

// ---- Personal Goals (pp. 64-67): two at a time, progress counted from play ----
export function chooseGoal(state0, name) {
  const state = clone(state0); const h = state.hero; h.goalsActive = h.goalsActive || []; h.goalsDone = h.goalsDone || [];
  if (h.goalsActive.length >= 2 || h.goalsActive.includes(name) || h.goalsDone.includes(name)) return finish(state, [], {});
  h.goalsActive.push(name);
  return finish(state, [log1(state, 'Personal Goal', `${name}: ${GOAL[name].obj}. Reward: ${GOAL[name].reward}.`, { page: 64 })], {});
}
function checkGoals(state, out) {
  const h = state.hero; if (!h.goalsActive?.length) return;
  for (const name of [...h.goalsActive]) {
    const g = GOAL[name]; if (!g || statAt(h, g.track) < g.n) continue;
    h.goalsActive = h.goalsActive.filter((x) => x !== name); h.goalsDone = [...(h.goalsDone || []), name];
    const fx = g.fx; let extra = '';
    if (fx.reduce) h.reduce = { ...(h.reduce || {}), [fx.reduce]: ((h.reduce || {})[fx.reduce] || 0) + 1 };
    if (fx.dealt) h.dealtPlus = { ...(h.dealtPlus || {}), [fx.dealt]: ((h.dealtPlus || {})[fx.dealt] || 0) + 1 };
    if (fx.tripleCrit) h.tripleCrit = [...(h.tripleCrit || []), fx.tripleCrit];
    if (fx.skillDmg) h.skillDmg = [...(h.skillDmg || []), fx.skillDmg];
    if (fx.perk) h.perks = [...new Set([...(h.perks || []), fx.perk])];
    if (fx.psychic) h.psychicD4 = true;
    if (fx.xp) h.vit.xp += fx.xp;
    if (fx.aether) { const n = roll(fx.aether); h.vit.maxAether += n; extra = ` (+${n})`; }
    if (fx.amulet) { const a = makeMagic('Amulet'); h.pack = [...(h.pack || []), a]; extra = `: ${a.name}`; }
    if (fx.stunOverseer) h.stunOverseer = true;
    if (fx.darknessTwice) h.darknessTwice = true;
    out.push({ id: uid(), kind: 'note', title: 'Personal Goal complete', text: `${name}: ${g.reward}${extra}. You may choose another goal.`, rolls: [], page: 64, place: state.here, result: 'won' });
  }
}
// ---- the optional Forgiving Death rule (p. 87) ----
export function forgivingDeath(state0) {
  const state = clone(state0); const h = state.hero; const v = h.vit;
  state.over = null; v.sanity = Math.min(v.maxSanity, v.sanity + roll('2d6')); v.health = Math.min(v.maxHealth, Math.max(1, roll('2d6'))); v.tough = v.maxTough;
  const p = here(state); if (p?.enc) { p.enc = null; p.cleared = true; } state.combat = null;
  return finish(state, [{ id: uid(), kind: 'note', title: 'Forgiving Death', text: 'You come to among the dead. Whatever struck you down took you for a corpse and moved on. You recover 2D6 Sanity, 2D6 Health and all your Toughness, and must give up 2 Mastery Abilities of your choosing (never the last one in a Mastery).', rolls: [], page: 87, place: state.here }], {});
}
export { levelDue, LEVEL_BENEFITS };


// ---- an Event's checks, rolled from the scroll (events.js reads them from the event's words) ----
const ITEM_KEY = { torch: 'torches', 'crafting supplies': 'crafting', 'cooking ingredients': 'cooking', ration: 'rations', bandage: 'bandages', lockpick: 'lockpicks', candle: 'candles', flare: 'flares', 'attunement crystal': 'crystals' };
function applyEventEffects(state, fx, out, { resolved = false } = {}) {
  const h = state.hero, v = h.vit; const lines = []; let combat = null; let darkness = null;
  for (const e of fx) {
    const n = e.n != null ? (typeof e.n === 'number' ? e.n : roll(String(e.n).toLowerCase())) : 0;
    switch (e.k) {
      case 'xp': v.xp += n; lines.push(`+${n} XP`); break;
      case 'sanity': if (!resolved && !e.final) { queueCheck(state, { title: 'Hold on to your wits', skill: 'Resolve', page: 92, why: `You face losing ${n} Sanity: a Resolve check lets you hold on to your wits.`, purpose: `or lose ${n} Sanity`, passText: 'You hold on to your wits.', fail: [{ k: 'sanity', n, final: true }] }, out); lines.push(`a Resolve check against losing ${n} Sanity`); break; }
        if ((h.timed || []).some((t) => t.noSanityLoss)) { lines.push('your Sanity holds (the black vial)'); break; } v.sanity = Math.max(0, v.sanity - n); lines.push(`-${n} Sanity`); break;
      case 'sanity+': v.sanity = Math.min(v.maxSanity, v.sanity + n); lines.push(`+${n} Sanity`); break;
      case 'exh': v.exh += n; lines.push(`+${n} Exhaustion`); break;
      case 'dmg': { const n2 = state.double ? n * 2 : n; hurt(h, n2); lines.push(`${n2} ${e.type} damage${state.double ? ' (doubled)' : ''}`); break; }
      case 'uncond': dropEffect(h, e.name); lines.push(`no longer ${e.name}`); break;
      case 'leave': if (state.prev) { state.here = state.prev; lines.push('you are driven back the way you came'); } break; // out of combat, Armor does not absorb it (p. 83)
      case 'health': v.health = Math.max(0, v.health - n); lines.push(`-${n} Health`); break;
      case 'heal': healWounds(h, n); lines.push(`you heal ${n} Wounds`); break;
      case 'tough': v.tough = Math.min(v.maxTough, v.tough + n); lines.push(`+${n} Toughness`); break;
      case 'coins-': { const c = Math.min(h.items.coins || 0, n); h.items.coins = (h.items.coins || 0) - c; lines.push(`-${c} coins`); break; }
      case 'coins+': grant(h, { coins: n }); lines.push(`+${n} coins`); break;
      case 'item': { const nm = e.name.toLowerCase().replace(/es$|s$/, '').replace(/torche$/, 'torch'); const k = ITEM_KEY[nm] || ITEM_KEY[e.name.toLowerCase()];
        if (/potion/i.test(e.name)) { for (let i = 0; i < n; i++) (h.pack = h.pack || []).push(makePotion()); lines.push(`${n} Potion${n > 1 ? 's' : ''} in your pack`); }
        else if (k) { h.items[k] = (h.items[k] || 0) + n; lines.push(`+${n} ${e.name.replace(/s$/, '')}${n > 1 ? 's' : ''}`); } break; }
      case 'skill': { const cur = h.skills[e.name] ?? BASE_SKILLS[e.name] ?? 0; h.skills[e.name] = Math.min(80, cur + e.n); lines.push(`${e.name} +${e.n}`); break; }
      case 'spoils': lines.push(...rollSpoils(h, e.which)); break;
      case 'darkness': darkness = applyDarkness(state, rnd(100), out); lines.push('the Darkness grows'); break;
      case 'fight': { const enc = encounter(state, rnd(6), rnd(20)); const p = here(state); p.enc = enc.enc; p.cleared = false; combat = { name: enc.name, surprised: e.surprised }; lines.push(`${encText(enc)}${e.surprised ? ', and they surprise you' : ''}`); break; }
      case 'rot': if (!(h.rot > 0)) { h.rot = 1; lines.push(`the Rot takes hold (stage 1: ${ROT[1]})`); } break;
      case 'cond': addEffect(h, e.name, e.n || 1); lines.push(`${e.name}${e.n > 1 ? ` (${e.n})` : ''}`); break;
      case 'rider': timed(h, e.next ? 'Charged blow' : 'Charm', e.next ? 99 : 1, { rounds: e.next ? 1 : 99, extra: { die: e.die, dtype: e.dtype } }); lines.push(`+${e.die.toUpperCase()} ${e.dtype} in your Damage Pool${e.next ? ' for your next attack' : ' in this room'}`); break;
      case 'stunOverseer': h.stunNextOverseer = true; lines.push("the Overseer will be Stunned in your first round against it"); break;
      case 'skipDarkness': h.skipDarkness = true; lines.push('you may ignore the next Growing Darkness'); break;
      case 'initBonus': h.initBonus = e.n; lines.push(`+${e.n} to your next Initiative`); break;
      default: break;
    }
  }
  return { lines, combat, darkness };
}
// i: which of the event's checks; skip: decline it (an optional one), paying what declining costs
export function eventCheck(state0, i, faces, { skip = false } = {}) {
  const state = clone(state0); const h = state.hero; const p = here(state); const ev = p.event; const out = [];
  const a = ev?.asks?.[i]; if (!a || a.done) return finish(state, out, {});
  // re-read the event's words, so a check saved before a reading fix gets the corrected pass and fail
  if (ev.roll) { const fresh = parseEvent(ev.text)[i]; if (fresh && fresh.skill === a.skill) Object.assign(a, { passText: fresh.passText, failText: fresh.failText, skipText: fresh.skipText, pass: fresh.pass, fail: fresh.fail, skip: fresh.skip }); }
  let res; let combat = null, darkness = null; let springAfter = false;
  if (skip) {
    const fx = applyEventEffects(state, a.skip || [], out);
    a.done = { skipped: true, text: fx.lines.length ? `You leave it. ${fx.lines.join(', ')}.` : 'You leave it be.' };
  } else {
    if (a.cost?.bandages) { if ((h.items.bandages || 0) < a.cost.bandages) return finish(state, [{ id: uid(), kind: 'note', title: 'No bandages', text: `This needs ${a.cost.bandages} Bandage.`, rolls: [] }], {}); h.items.bandages -= a.cost.bandages; }
    const name = a.skill === 'weapon' ? h.weapons[h.wield].skill : a.skill;
    const pen = penaltyOf(h, null, name); const target = Math.max(0, skillOf(h, name) + pen.mod); const notes = [...pen.notes];
    const v = readD100(h, name, readPlan(checkPlan(), faces).check, notes);
    const pass = v <= target; const doubles = v % 11 === 0 && v < 100; const ck = critKind(v, target);
    if (doubles) h.marks[name] = true;
    if (pass && name === 'Reason') bump(h, 'reasonEvents');
    if (ck === 'fumble' && (name === 'Dodge' || name === 'Spellward')) state.double = true;
    const fx = applyEventEffects(state, pass ? a.pass : a.fail, out, { resolved: name === 'Resolve' }); combat = fx.combat; darkness = fx.darkness; delete state.double;
    critFx(state, name, ck, out, { handled: name === 'Dodge' || name === 'Spellward' || name === 'Thievery' });
    if (ck === 'fumble' && name === 'Thievery') springAfter = true;
    const said = (pass ? a.passText : a.failText) || '';
    res = { value: v, target, pass, skill: name, notes, effects: fx.lines, said };
    a.done = { ...res, text: `${name} ${v} against ${target}: ${pass ? 'passed' : 'failed'}.${fx.lines.length ? ` ${fx.lines.join(', ')}.` : said ? ` ${said[0].toUpperCase()}${said.slice(1)}.` : ''}${doubles ? ' Doubles: marked for improvement.' : ''}${notes.length ? ` ${notes.join(' ')}` : ''}` };
  }
  // the prompt on the scroll becomes the result: the event's entry carries its checks
  const entry = state.log.find((e) => e.id === ev.entryId); if (entry) entry.asks = ev.asks.map((x) => ({ ...x }));
  if (ev.asks.every((x) => x.done)) { ev.done = true; ev.pending = false; }
  if (res && !res.pass) { gearRemind(state, 'fail', out); darkRemind(state, 'check', out); }
  const fin = finish(state, out, { combat, darkness, ask: a, result: res });
  if (!springAfter) return fin;
  const r2 = trapUnderfoot(fin.state);
  return { ...r2, out: [...fin.out, ...r2.out], ask: a, result: res, combat: r2.combat || combat, darkness };
}


// ---- reminders at the moment they matter ----
// which moments a Growing Darkness effect bears on, from its words
export function darknessWhen(t = '') {
  const w = [];
  if (/trap/i.test(t)) w.push('trap');
  if (/door|lock/i.test(t)) w.push('door');
  if (/combat|enem|creature|attack|fight|initiative|opponent/i.test(t)) w.push('combat');
  if (/camp|rest|sleep|breather/i.test(t)) w.push('camp');
  if (/scaveng|search|loot|spoils|container/i.test(t)) w.push('search');
  if (/light|torch|lamp|dark/i.test(t)) w.push('light');
  if (/check|skill/i.test(t)) w.push('check');
  return w;
}
const DARK_LABEL = { trap: 'this trap', door: 'this door', combat: 'this fight', camp: 'this camp', search: 'this search', light: 'your light', check: 'this check' };
function darkRemind(state, when, out) {
  const list = (state.domain?.darkness || []).filter((e) => (e.when || darknessWhen(e.text)).includes(when) && e.text);
  if (!list.length) return;
  out.push({ id: uid(), kind: 'darkness', title: 'The Darkness in play', text: `For ${DARK_LABEL[when]}: ${list.map((e) => e.text).join(' ')}`, rolls: [], page: 120, place: state.here, remind: 'darkness' });
}
// your Abilities and gear that could help right now: Reactions when you are hit, rerolls when a check fails
function gearRemind(state, when, out) {
  const h = state.hero; const lines = [];
  if (when === 'hit') for (const m of h.masteries || []) { const M = masteryOf(m); for (const t of (M?.tiers || []).slice(0, tiersOf(m))) if (/Reaction/.test(t.action) && aetherCost(t) <= h.vit.aether) lines.push(`${t.name} (${M.name}, a Reaction${t.cost ? `, ${t.cost}` : ''}): ${t.text}`); }
  const powers = [];
  for (const it of Object.values(h.worn || {})) { if (!it) continue; for (const p of [...(it.attuned ? (it.properties || []).map((x) => x.t) : []), ...(it.powers || [])]) powers.push([it.name, p]); }
  for (const [nm, p] of powers) {
    if (when === 'fail' && /reroll any check/i.test(p)) lines.push(`${nm}: ${p}`);
    if (when === 'hit' && /ignore all damage|turn your opponent's attack|if one blow were to kill/i.test(p)) lines.push(`${nm}: ${p}`);
    if (when === 'combat' && /once per (?:combat encounter|room)/i.test(p) && /damage|attack|enem/i.test(p)) lines.push(`${nm}: ${p}`);
  }
  if (!lines.length) return;
  out.push({ id: uid(), kind: 'note', title: 'You could use', text: lines.join(' · '), rolls: [], place: state.here, remind: 'gear' });
}

// ==== Masteries in play (pp. 21-61) and Minions (pp. 93, 200-203) =================================================
// Features and passive Tiers act through heroMods (kn/masteryFx) and the hooks in attack, defence and camp; this
// section resolves the active Abilities, the readied Reactions, Icons, Minions, and the once-per-rest powers.
const susList = (h) => (h.sustained || []).map((s) => (typeof s === 'string' ? { name: s, cost: 0 } : s));
export const reservedAether = (h) => susList(h).reduce((t, s) => t + (s.cost || 0), 0);
export const holding = (h, name) => susList(h).some((s) => s.name === name);
const restUsed = (h, k) => Boolean((h.restUsed || {})[k]);
const useRest = (h, k) => { h.restUsed = { ...(h.restUsed || {}), [k]: true }; };
const minionStat = (h, m) => {
  if (m.kind === 'Shadow Clone') { const w = h.weapons[h.wield]; return { name: 'Shadow Clone', combat: skillOf(h, w.skill), magicRes: skillOf(h, 'Spellward'), health: 10, armor: {}, anatomy: 'Humanoid', weak: 'Head', type: ['Humanoid'], actions: [{ rolls: [1, 2, 3, 4, 5, 6], name: 'Mirrored strike', tag: 'physical', text: `Your shadow strikes with its own ${w.name}.`, dmg: w.dmg || 'd6', dtype: weaponType(w) }] }; }
  if (MINIONS[m.kind]) { const b = MINIONS[m.kind]; return has(h, 'Gravecaller', 5) && b.undead ? { ...b, health: b.health + 2, necro: true } : b; }
  const b = BESTIARY[m.kind]; return b ? { ...b, actions: b.actions } : null; // a dominated creature fights with its own stat block
};
function newMinion(h, kind, extra = {}) {
  const s = minionStat(h, { kind }); const mx = s?.health || 10;
  const m = { id: uid(), kind, health: extra.health ?? mx, max: extra.max ?? mx, ...extra };
  h.minions = [...(h.minions || []), m]; return m;
}
// who fights whom (p. 93): you and each Minion get one opponent; the rest come at you
function assignTargets(state) {
  const p = here(state), cb = state.combat, h = state.hero; if (!p?.enc || !cb) return;
  const ms = (h.minions || []).filter((m) => m.health > 0); const foes = p.enc.alive;
  cb.targets = {}; foes.forEach((f, i) => { cb.targets[f.id] = i === 0 || i > ms.length ? 'hero' : ms[i - 1].id; });
}
// your Minions act in your turn, after you (p. 93): each takes its own D6 action against its opponent
function minionsAct(state, out) {
  const p = here(state), h = state.hero, cb = state.combat; if (!p?.enc?.alive.length) return;
  for (const m of [...(h.minions || [])]) {
    if (!(m.health > 0) || !p.enc.alive.length) continue;
    const s = minionStat(h, m); if (!s) continue;
    const foe = p.enc.alive.find((f) => cb.targets?.[f.id] === m.id) || p.enc.alive[0];
    const fs = foeStat(state, foe); const a = s.actions.find((x) => x.rolls.includes(rnd(6))) || s.actions[0];
    const lines = [];
    const hitOne = (f) => {
      const fst = foeStat(state, f);
      if (a.tag === 'physical') {
        const atk = rnd(100), def = rnd(100); const mine = s.combat + 10 + (cb.flags.minionBonus || 0); const r = opposedResult(atk, mine, def, fst.combat);
        if (r.winner !== 'att') { lines.push(`${a.name} at ${kindOf(p, f)} ${f.n}: ${atk} against ${mine}, it fends off (${def})`); return; }
        const hl = hitLocation(fst.anatomy, rnd(20), fst.weak); let n = (a.dmg ? roll(a.dmg) : 0) * (r.aCrit || hl.weak ? 2 : 1); if (s.necro) n += roll('d6');
        const res = n ? woundFoe(state, f, fst, n, a.dtype || 'Bludgeoning', { loc: hl.name, crit: r.aCrit }) : { net: 0 }; lines.push(`${a.name} ${n ? `hits ${kindOf(p, f)} ${f.n} on the ${hl.name}: ${res.net} ${a.dtype || 'Bludgeoning'}` : `lands on ${kindOf(p, f)} ${f.n}`}`);
        if (a.cond && res.net && rnd(100) > (a.save === 'body' ? fst.body : fst.endurance)) { f.conds[a.cond[0]] = a.cond[1]; lines.push(`${a.cond[0]}`); }
      } else if (!a.dmg) {
        const conds = a.cond ? [{ name: a.cond[0], n: a.cond[1] }] : (a.conds || []);
        const t = rnd(100); const sv = /Body|Athletics/.test(a.save || '') ? fst.body : /Endurance/.test(a.save || '') ? fst.endurance : fst.magicRes;
        if (!conds.length || t <= sv) { lines.push(`${a.name}: ${kindOf(p, f)} ${f.n} ${conds.length ? `resists (${t} against ${sv})` : 'is unmoved'}`); return; }
        conds.forEach((c) => { if (!fst.def.immuneConds.includes(c.name)) f.conds[c.name] = c.n || 1; }); lines.push(`${a.name}: ${kindOf(p, f)} ${f.n} is ${conds.map((c) => c.name).join(' and ')}`);
      } else {
        const save = a.save === 'endurance' ? fst.endurance : a.save === 'body' ? fst.body : fst.magicRes; const t = rnd(100);
        if (t <= save) { lines.push(`${a.name}: ${kindOf(p, f)} ${f.n} resists (${t} against ${save})`); return; }
        let n = roll(a.dmg); if (s.necro) n += roll('d6'); const res = woundFoe(state, f, fst, n, a.dtype, { magical: true }); lines.push(`${a.name} on ${kindOf(p, f)} ${f.n}: ${res.net} ${a.dtype}`);
        if (a.drain) m.health = Math.min(m.max, m.health + a.drain);
        if (a.cond) f.conds[a.cond[0]] = a.cond[1]; else (a.conds || []).forEach((c) => { if (!fst.def.immuneConds.includes(c.name)) f.conds[c.name] = c.n || 1; });
      }
      if (f.health <= 0) { killFoe(state, f, out); lines.push(`${kindOf(p, f)} ${f.n} falls`); }
    };
    if (a.area) [...p.enc.alive].forEach(hitOne); else hitOne(foe);
    out.push({ id: uid(), kind: 'combat', title: `Your ${m.kind}`, text: `${lines.join('; ')}.`, rolls: [], place: p.id, result: 'ally' });
    void fs;
  }
  cb.flags.minionBonus = 0;
}
// a creature's blow at one of your Minions
function strikeMinion(state, en, s, act, m, out) {
  const h = state.hero; const ms = minionStat(h, m); const atk = rnd(100), def = rnd(100);
  const r = opposedResult(atk, s.combat + 10, def, ms.combat);
  if (r.winner !== 'att') return `${act.name} at your ${m.kind}: it holds them off.`;
  const loc = hitLocation('Humanoid', rnd(20)).name; const pool = act.dmg ? roll(act.dmg) : 1;
  const armor = (ms.armor || {})[loc] || 0; const n = Math.max(0, pool * (r.aCrit ? 2 : 1) - (IGNORE_DT.includes(act.dtype) ? 0 : armor));
  m.health = Math.max(0, m.health - n);
  if (m.health <= 0) { h.minions = h.minions.filter((x) => x.id !== m.id); h.sustained = susList(h).filter((x) => x.minion !== m.id); return `${act.name} strikes your ${m.kind} for ${n}: it is destroyed.`; }
  return `${act.name} strikes your ${m.kind} for ${n} (${m.health} of ${m.max} left).`;
}
const IGNORE_DT = ['Arcane', 'Cold', 'Fire', 'Force', 'Holy', 'Infernal', 'Lightning', 'Necrotic', 'Psychic', 'Poison'];

// ---- Icons (Icon Caller): up to two at once, one of each kind, only in a fight ----
function placeIcon(state, kind, out) {
  const cb = state.combat, h = state.hero, p = here(state);
  cb.icons = (cb.icons || []).filter((i) => i.kind !== kind); if (cb.icons.length >= 2) cb.icons.shift();
  const icon = { kind, id: uid() }; cb.icons.push(icon);
  let text = `You place a ${kind} Icon. ${ICONS[kind]}`;
  if (kind === 'Strength') { h.vit.temp = (h.vit.temp || 0) + 5; text += ' (+5 Temporary Toughness.)'; }
  if (kind === 'Vine') { const f = p.enc.alive.find((a) => a.id === cb.target) || p.enc.alive[0]; if (f) { const fs = foeStat(state, f); const t = rnd(100); if (t > fs.body) { f.conds.Restrained = 99; f.vined = true; text += ` ${kindOf(p, f)} ${f.n} fails its Body check (${t}): Restrained.`; } else { text += ` ${kindOf(p, f)} ${f.n} tears free at once (${t}).`; cb.icons = cb.icons.filter((i) => i !== icon); } } }
  out.push({ id: uid(), kind: 'combat', title: `${kind} Icon`, text, rolls: [], place: p.id });
}
function iconsTick(state, out) {
  const cb = state.combat, h = state.hero, p = here(state); if (!cb?.icons?.length) return;
  for (const icon of [...cb.icons]) {
    if (icon.kind === 'Restoring') { h.vit.tough = Math.min(h.vit.maxTough, h.vit.tough + 1); (h.minions || []).forEach((m) => { m.health = Math.min(m.max, m.health + 1); }); }
    if (icon.kind === 'Razorwind') for (const f of [...p.enc.alive]) { const r = woundFoe(state, f, foeStat(state, f), 1, 'Slashing'); if (f.health <= 0) killFoe(state, f, out); void r; }
    if (icon.kind === 'Firebomb' && icon.armed) {
      const lines = []; for (const f of [...p.enc.alive]) { const fs = foeStat(state, f); const t = rnd(100); if (t <= fs.magicRes) { lines.push(`${kindOf(p, f)} ${f.n} resists`); continue; } const r = woundFoe(state, f, fs, roll('2d10'), 'Fire', { magical: true }); lines.push(`${kindOf(p, f)} ${f.n} ${r.net} Fire`); if (f.health <= 0) killFoe(state, f, out); }
      out.push({ id: uid(), kind: 'combat', title: 'The Firebomb Icon bursts', text: `${lines.join('; ')}.`, rolls: [], place: p.id });
      cb.icons = cb.icons.filter((i) => i !== icon);
    } else if (icon.kind === 'Firebomb') icon.armed = true;
    if (icon.kind === 'Vine' && !p.enc.alive.some((f) => f.vined && f.conds.Restrained)) cb.icons = cb.icons.filter((i) => i !== icon);
  }
}
// curses and the like on creatures, each round
function foeDebuffsTick(state, out) {
  const p = here(state); if (!p?.enc) return;
  for (const f of [...p.enc.alive]) {
    const fs = foeStat(state, f);
    for (const d of f.debuffs || []) {
      if (d.sap) d.sapN = Math.min(20, (d.sapN || 0) + 5);
      if (d.putrefy) { const locs = Object.keys(HIT_TABLES[fs.anatomy] ? Object.fromEntries((HIT_TABLES[fs.anatomy] || []).map(([, l]) => [l, 1])) : { Body: 1 }); const loc = d.loc && armorAt(fs, d.loc, f.down) > 0 ? d.loc : locs.find((l) => armorAt(fs, l, f.down) > 0); if (loc) { d.loc = loc; f.down[loc] = (f.down[loc] || 0) + 1; } }
      if (d.cage) { const t = rnd(100); if (t <= fs.magicRes) { d.rounds = 0; delete f.conds.Restrained; out.push({ id: uid(), kind: 'combat', title: 'Fire Cage', text: `${kindOf(p, f)} ${f.n} breaks the cage (${t}).`, rolls: [], place: p.id }); } else { const r = woundFoe(state, f, fs, 1, 'Fire'); out.push({ id: uid(), kind: 'combat', title: 'Fire Cage', text: `${kindOf(p, f)} ${f.n} fails to break out (${t}): ${r.net} Fire.`, rolls: [], place: p.id }); if (f.health <= 0) killFoe(state, f, out); } }
      if (d.rounds && d.rounds < 90) d.rounds -= 1;
    }
    f.debuffs = (f.debuffs || []).filter((d) => !(d.rounds <= 0));
  }
}
const foeDebuff = (f, k) => (f.debuffs || []).reduce((t, d) => t + (d[k] || 0), 0);
const foeHas = (f, k) => (f.debuffs || []).some((d) => d[k]);
export function foeMods(f) {
  return { defence: foeDebuff(f, 'defence') - (f.debuffs || []).reduce((t, d) => t + (d.sapN || 0), 0) + foeDebuff(f, 'combat'), attack: foeDebuff(f, 'combat') - (f.debuffs || []).reduce((t, d) => t + (d.sapN || 0), 0), noArmor: foeHas(f, 'noArmor'), enfeebled: foeHas(f, 'enfeebled'), cursed: foeHas(f, 'sap') || foeHas(f, 'enfeebled') || (f.debuffs || []).some((d) => d.name === 'Cursed'), noMagic: foeHas(f, 'noMagic') };
}
const combatBuff = (h, name) => (h.combatBuffs || []).find((b) => b.name === name);

// ---- readying a Reaction before the creatures act ----
export function readyReaction(state0, name, n = 0) {
  const state = clone(state0); const h = state.hero; const cb = state.combat; if (!cb) return finish(state, [], {});
  const t = abilityTier(h, name); const fx = ABILITY[name]; if (!t || !fx?.react) return finish(state, [], {});
  cb.ready = cb.ready || {};
  if (cb.ready[fx.react]) { delete cb.ready[fx.react]; return finish(state, [{ id: uid(), kind: 'combat', title: name, text: `You stand down ${name}.`, rolls: [], place: state.here }], {}); }
  if (fx.react === 'trap' && !cb.surprisedThem) return finish(state, [{ id: uid(), kind: 'note', title: name, text: 'Only after you win the surprise, as your first action.', rolls: [] }], {});
  const cost = fx.react === 'shell' ? Math.max(2, n - (n % 2)) : aetherCost(t);
  if (cost > h.vit.aether) return finish(state, [{ id: uid(), kind: 'note', title: name, text: `It needs ${cost} Aether.`, rolls: [] }], {});
  h.vit.aether -= cost; if (fx.exh) h.vit.exh += fx.exh;
  cb.ready[fx.react] = fx.react === 'shell' ? cost / 2 : true;
  return finish(state, [{ id: uid(), kind: 'combat', title: `${name} readied`, text: `${t.text}${cost ? ` (${cost} Aether)` : ''}${fx.exh ? ` (+${fx.exh} Exhaustion)` : ''}`, rolls: [], place: state.here }], {});
}
const abilityTier = (h, name) => { for (const m of h.masteries || []) { const M = masteryOf(m); const i = (M?.tiers || []).findIndex((t) => t.name === name); if (i >= 0 && i < tiersOf(m)) return M.tiers[i]; } return null; };
export function releaseSustained(state0, name) {
  const state = clone(state0); const h = state.hero; const s = susList(h).find((x) => x.name === name); if (!s) return finish(state, [], {});
  h.sustained = susList(h).filter((x) => x.name !== name); if (s.minion) h.minions = (h.minions || []).filter((m) => m.id !== s.minion);
  return finish(state, [{ id: uid(), kind: 'note', title: name, text: `You let ${name} go${s.cost ? `, and your ${s.cost} Aether is yours again` : ''}.`, rolls: [], place: state.here }], {});
}

// ---- the active Abilities ----
// opts: { targetId, n (for Abilities that take a number: Sanity, Aether, Ritual Components), aim }
export function useAbility(state0, name, tierN, faces, opts = {}) {
  const state = clone(state0); const h = state.hero; const m = (h.masteries || []).find((x) => masteryOf(x)?.name === name); const M = masteryOf(m); const tier = M?.tiers[tierN - 1];
  if (!tier || tierN > tiersOf(m)) return finish(state, [], {});
  const fx = ABILITY[tier.name] || {}; const p = here(state); const cb = state.combat; const out = []; const v = h.vit;
  const say = (t, extra = {}) => out.push({ id: uid(), kind: cb ? 'combat' : 'note', title: tier.name, text: t, rolls: [], place: state.here, page: M.page, ...extra });
  const no = (why) => finish(state, [{ id: uid(), kind: 'note', title: tier.name, text: why, rolls: [] }], {});
  if (/Passive/.test(tier.action) && !fx.absolution && !fx.foresee) return no('It is always at work: there is nothing to use.');
  if (fx.react) return readyReaction(state0, tier.name, opts.n);
  if (fx.oncePerRest && restUsed(h, tier.name)) return no('Once per Rest: it is spent until you next make camp.');
  if (fx.oncePerCombat && cb?.used?.[tier.name]) return no('Once per fight.');
  if (fx.attack?.oncePerRoom && p?.usedAbilities?.[tier.name]) return no('Once per room.');
  if ((fx.attack || fx.charge || fx.icon || fx.calm || fx.opening || fx.exploit || fx.debuff || fx.curseMind || fx.dominate || fx.buff === 'Tempestuous Rage') && !cb) return no('Only in a fight.');
  if (fx.charge && cb?.initiative) return no('Only at the start of a fight, before anyone acts.');
  if (fx.attack?.needShield && !shieldUp(h)) return no(h.shield?.broken ? 'Your shield is broken until you mend it at Camp.' : handFull(h) ? 'Your light fills that hand.' : 'You need a shield in hand.');
  if (fx.corpse && !(p?.corpses > 0)) return no('It needs a fresh Humanoid or Animal corpse here.');
  if (cb && (effN(h, 'Blinded') > 0 || inDark(h) || effN(h, 'Prone') > 0)) return no(`${effN(h, 'Prone') ? 'Prone' : 'Blinded'}: you can only make basic melee attacks, not use Mastery Abilities (pp. 88-89).`);
  // one Free Action a round (p. 76)
  const isFree = Boolean(cb) && (fx.free || /Free Action/.test(tier.action)) && !fx.react;
  if (isFree && cb.flags.freeUsed) return no('You have already used your Free Action this round (p. 76).');
  // what it costs: Aether (held back while Sustained), Exhaustion, Health, Ritual Components, Sanity
  const cost = aetherCost(tier); const hold = sustained(tier);
  const units = fx.vary ? Math.max(fx.vary.min || 0, Number(opts.n) || fx.vary.min || 0) : 0;
  if (fx.vary?.res === 'ritual' && (h.items.ritual || 0) < units) return no(`You need ${units} Ritual Components; you have ${h.items.ritual || 0}.`);
  if (fx.vary?.res === 'sanity' && v.sanity <= units) return no(`You have only ${v.sanity} Sanity.`);
  if (tier.name === 'Sigil of Power' && (h.items.ritual || 0) < 5) return no('It needs 5 Ritual Components.');
  if (cost > v.aether) return no(`It needs ${cost} Aether; you have ${v.aether}.`);
  if (hold && holding(h, tier.name)) return no(`${tier.name} is already held. Release it from your Abilities to end it.`);
  v.aether -= cost; if (fx.exh) v.exh += fx.exh; if (fx.health) hurt(h, fx.health);
  if (fx.vary?.res === 'ritual') h.items.ritual -= units; if (fx.vary?.res === 'sanity') v.sanity -= units;
  if (hold) h.sustained = [...susList(h), { name: tier.name, cost }];
  if (fx.oncePerRest) useRest(h, tier.name);
  if (cb && fx.oncePerCombat) cb.used = { ...(cb.used || {}), [tier.name]: true };
  if (p && fx.attack?.oncePerRoom) p.usedAbilities = { ...(p.usedAbilities || {}), [tier.name]: true };
  const tgt = cb ? (p.enc.alive.find((a) => a.id === (opts.targetId || cb.target)) || p.enc.alive[0]) : null;
  const tname = tgt ? `${kindOf(p, tgt)}${p.enc.alive.length > 1 ? ` ${tgt.n}` : ''}` : '';
  const ends = cb && !fx.free && /Standard Action/.test(tier.action); if (isFree) cb.flags.freeUsed = true;
  if (m.borrowed) h.masteries = h.masteries.filter((x) => x !== m);

  // a weapon attack, changed as the Ability says
  if (fx.attack) {
    const atk = { ...fx.attack, ability: tier.name };
    if (atk.all) { let st = state; const foes = [...p.enc.alive]; foes.forEach((f, i) => { const last = i === foes.length - 1; const r = playerAttack(st, i === 0 ? faces : fakeFaces(attackPlan()), { targetId: f.id, ability: { ...atk, free: !last }, aim: opts.aim }); st = r.state; }); return finish(st, [], {}); }
    return playerAttack(state, faces, { targetId: opts.targetId, aim: opts.aim, ability: atk });
  }
  if (fx.charge) { const n = roll('2d6'); const s = foeStat(state, tgt); const r = woundFoe(state, tgt, s, n, 'Bludgeoning'); cb.initiative = 'player'; cb.side = 'player'; say(`You win the Initiative and crash into ${tname}: ${r.net} Bludgeoning.`); if (tgt.health <= 0) killFoe(state, tgt, out); return endPlayerTurn(state, out); }
  if (fx.sustain) {
    if (fx.sustain.light) say(`${tier.text} (Held: ${cost} Aether.)`);
    else if (fx.sustain.pool) say(`Your weapon carries +${fx.sustain.pool.die.toUpperCase()} ${fx.sustain.pool.dtype} in its Damage Pool while you hold it (${cost} Aether).`);
    else if (fx.sustain.frostWeapon) say(`A weapon of ice forms in your hand: D8+1 Cold, past all Armor, while you hold it (${cost} Aether).`);
    else if (fx.sustain.sanctuary) say(`Your aura turns holy: +20 Spellward while you hold it (${cost} Aether).`);
    return cb && ends ? endPlayerTurn(state, out) : finish(state, out, {});
  }
  if (fx.summon) {
    if (fx.summon === 'Shadow Clone') { const mm = newMinion(h, 'Shadow Clone', { rounds: roll('d4') + 1 }); say(`Your shadow steps away from you and fights at your side for ${mm.rounds} rounds.`); }
    else { const mm = newMinion(h, fx.summon); if (hold) h.sustained = susList(h).map((x) => (x.name === tier.name && !x.minion ? { ...x, minion: mm.id } : x)); if (fx.corpse) p.corpses -= 1; say(`${tier.text.split('. ')[0]}. Your ${fx.summon} (Health ${mm.max}) fights at your side${hold ? `; it lasts while you hold its ${cost} Aether` : ''}.`); }
    if (cb) { assignTargets(state); cb.lose = true; return endPlayerTurn(state, out); } // two Standard Actions: this turn and the next
    return finish(state, out, {});
  }
  if (fx.icon) { placeIcon(state, fx.icon, out); return endPlayerTurn(state, out); }
  if (fx.buff) {
    const b = { name: fx.buff };
    if (fx.buff === 'Tempestuous Rage') { b.rounds = 3; cb.extraAction = (cb.extraAction || 0) + 1; }
    h.combatBuffs = [...(h.combatBuffs || []).filter((x) => x.name !== fx.buff), b];
    say(`${tier.text}`); return ends ? endPlayerTurn(state, out) : finish(state, out, {});
  }
  if (fx.heal) { const n = healAmt(h, roll(fx.heal)); healWounds(h, n); say(`You heal ${n} Wounds.${fx.exh ? ` (+${fx.exh} Exhaustion.)` : ''}`); return ends ? endPlayerTurn(state, out) : finish(state, out, {}); }
  if (fx.sanity) { const n = roll(fx.sanity); v.sanity = Math.min(v.maxSanity, v.sanity + n); say(`You recover ${n} Sanity.`); return ends ? endPlayerTurn(state, out) : finish(state, out, {}); }
  if (fx.foresee) {
    if (cb) return no('Not in the middle of a fight.');
    useRest(h, tier.name); h.foresee = Array.from({ length: fx.foresee }, () => rnd(20));
    say(`Your mind runs ahead of you through the next ${fx.foresee} rooms: their Combat Encounter rolls will be D20 ${h.foresee.join(', ')} (10+ in a room, 15+ in a corridor, means a fight).`);
    return finish(state, out, {});
  }
  if (fx.absolution) { v.health = Math.min(v.maxHealth, v.health + 2); v.sanity = Math.min(v.maxSanity, v.sanity + 2); say('You forgive yourself: +2 Health and +2 Sanity.'); return finish(state, out, {}); }
  if (fx.removeCond) { const bad = ['Paralyzed', 'Stunned', 'Restrained', 'Bleeding', 'Poisoned', 'Burning', 'Blinded', 'Frightened', 'Sickened', 'Cursed', 'Dazed', 'Freezing', 'Charmed', 'Prone', 'Festering wound']; const c = bad.find((x) => effN(h, x) > 0); if (c) { dropEffect(h, c); if (c === 'Restrained' && cb) { cb.restrained = false; cb.restrainedBy = null; } } say(c ? `Your deity's touch lifts ${c} from you.` : 'You suffer no condition to lift.'); return ends ? endPlayerTurn(state, out) : finish(state, out, {}); }
  if (fx.nextAttack) { cb ? (cb.flags.playerBonus += fx.nextAttack) : (h.nextAttackBonus = fx.nextAttack); say(`+${fx.nextAttack} to your next attack.`); return finish(state, out, {}); }
  if (fx.healPer3) { const n = healAmt(h, Array.from({ length: Math.floor(units / 3) }, () => roll(fx.healPer3)).reduce((a, b) => a + b, 0)); healWounds(h, n); say(`${units} Ritual Components: you heal ${n} Wounds.`); return ends ? endPlayerTurn(state, out) : finish(state, out, {}); }
  if (fx.sanityPer3) { const n = Math.floor(units / 3) * fx.sanityPer3; v.sanity = Math.min(v.maxSanity, v.sanity + n); say(`${units} Ritual Components: +${n} Sanity.`); return ends ? endPlayerTurn(state, out) : finish(state, out, {}); }
  if (fx.sigil) { const w = h.weapons[h.wield]; if (w.sigil) { h.items.ritual += 0; return no('This weapon already bears a Sigil.'); } h.items.ritual -= 5; w.sigil = true; say(`You carve a sigil into your ${w.name}: +D10 Arcane in its Damage Pool for good.`); return ends ? endPlayerTurn(state, out) : finish(state, out, {}); }
  if (fx.vanish || fx.calm) {
    if (fx.calm && BESTIARY[p.enc?.name]?.overseer) return no('Calm does not work on an Overseer.');
    if (!state.prev) return no('There is nowhere to go.');
    const pc = here(state); if (fx.calm) pc.calmed = true; state.combat = null; h.combatBuffs = [];
    state.here = state.prev; say(fx.calm ? 'The creatures stop, their rage drained away. You leave, and may neither search nor loot that room.' : 'Your shadow swallows you, and you slip out of the fight and the room.');
    return finish(state, out, {});
  }
  if (fx.opening) { cb.flags.minionBonus = 30; say((h.minions || []).length ? 'Your allies get +30 to their next attack.' : 'You make an opening, but no ally is here to use it.'); return endPlayerTurn(state, out); }
  if (fx.exploit) { tgt.exploited = true; say(`You have its measure: +10 to hit and +1 damage against ${tname} from now on.`); return endPlayerTurn(state, out); }
  // spells and curses on a creature: a Magic Resistance check first if the Ability is Magical
  if (cb && (fx.spell || fx.debuff || fx.curseMind || fx.dominate)) {
    const magical = /Magical/.test(tier.action) && !fx.noSave;
    const plan = abilityPlan(tier);
    const n0 = 1 + (units && fx.extraTargets ? Math.floor(units / fx.extraTargets) : 0);
    let targets = plan?.all || fx.corpse ? [...p.enc.alive] : fx.upToHalf ? p.enc.alive.slice(0, Math.max(1, Math.floor((h.level || 1) / 2))) : p.enc.alive.filter((a) => a.id === tgt.id).concat(p.enc.alive.filter((a) => a.id !== tgt.id).slice(0, n0 - 1));
    if (fx.corpse) p.corpses -= 1;
    if (fx.oncePerTarget) { if ((tgt.marks || {})[tier.name]) return no(`Only once against the same opponent.`); tgt.marks = { ...(tgt.marks || {}), [tier.name]: true }; }
    if (fx.dominate && BESTIARY[kindOf(p, tgt)]?.overseer) return no('It does not work on an Overseer.');
    const v2 = readPlan(abilityDicePlan(), faces); const res = []; let hitAny = 0; let dealt = 0;
    for (const a of targets) {
      const s = foeStat(state, a); const who = `${kindOf(p, a)}${p.enc.alive.length > 1 ? ` ${a.n}` : ''}`;
      if (magical) { const mr = a === targets[0] ? v2.foe : rnd(100); const mrv = s.magicRes; if (mr <= mrv && !fx.curseMind) { res.push(`${who} resists (${mr} against ${mrv})`); continue; } if (fx.curseMind) { const ok = mr <= mrv; a.conds[ok ? 'Dazed' : 'Stunned'] = 2; res.push(`${who}: ${ok ? 'Dazed (2)' : 'Stunned (2)'} (${mr} against ${mrv})`); continue; } }
      if (fx.dominate) { p.enc.alive = p.enc.alive.filter((x) => x.id !== a.id); const mm = newMinion(h, kindOf(p, a), { health: a.health, max: a.max }); h.sustained = susList(h).map((x) => (x.name === tier.name && !x.minion ? { ...x, minion: mm.id } : x)); res.push(`${who} is yours now: your Minion while you hold the spell`); continue; }
      let n = 0; let dtype = plan?.dtype || fx.dtype;
      if (plan) n = plan.dmg.split('+').reduce((t, part) => t + roll(part), 0) + ((h.abilityPlus || {})[tier.name] || 0) + ((h.dealtPlus || {})[plan.dtype] || 0);
      if (fx.perUnit) { n = Array.from({ length: units }, () => roll(fx.perUnit)).reduce((x, y) => x + y, 0); dtype = fx.dtype || 'Arcane'; }
      if (fx.feedback && dtype === 'Arcane' && has(h, 'Arcanist')) n += a.arcaneFb || 0;
      if (fx.drainHeal && s.def.restored.includes('Necrotic')) { res.push(`${who} feeds on necrotic power: it does not work`); continue; }
      if (n) {
        const r = woundFoe(state, a, s, n, dtype, { magical }); dealt += r.net; if (r.net) hitAny += 1; bump(h, `dmg.${dtype}`, r.net);
        res.push(`${who}: ${r.healed ? `restored by it (${r.healed})` : `${r.net} ${dtype}`}${r.notes.length ? ` (${r.notes.join(', ')})` : ''}`);
        if (fx.feedback && dtype === 'Arcane' && has(h, 'Arcanist')) a.arcaneFb = (a.arcaneFb || 0) + 1;
        if (M.name === 'Frostweaver' && r.net) { a.conds.Freezing = 2; res.push('Freezing'); }
      }
      if (fx.cond && !s.def.immuneConds.includes(fx.cond[0])) { a.conds[fx.cond[0]] = fx.cond[1]; res.push(`${fx.cond[0]}${fx.cond[1] < 90 ? ` (${fx.cond[1]})` : ''}`); }
      if (fx.debuff) { const d = { ...fx.debuff, rounds: fx.debuff.rounds === 'd4+1' ? roll('d4') + 1 : fx.debuff.rounds }; a.debuffs = [...(a.debuffs || []).filter((x) => x.name !== d.name), d]; res.push(`${d.name}${d.rounds && d.rounds < 90 ? ` for ${d.rounds} round${d.rounds > 1 ? 's' : ''}` : ''}`); }
      if (a.health <= 0) { killFoe(state, a, out); res.push(`${who} falls`); }
    }
    if (fx.sanityPerHit && hitAny) { const n = fx.sanityPerHit * hitAny; v.sanity = Math.min(v.maxSanity, v.sanity + n); res.push(`you recover ${n} Sanity`); }
    if (fx.drainHeal && dealt) { healWounds(h, dealt); res.push(`you heal ${dealt} Wounds`); }
    if (fx.sanityFromDamage && dealt) { v.sanity = Math.min(v.maxSanity, v.sanity + dealt); res.push(`you recover ${dealt} Sanity`); }
    say(`${res.join('; ')}.`, { rolls: magical ? [{ label: 'Magic Res.', value: v2.foe }] : [] });
    if (!p.enc.alive.length) return victory(state, out);
    return ends ? endPlayerTurn(state, out) : finish(state, out, {});
  }
  say(`${tier.text} (Apply it as written.)`);
  return cb && ends ? endPlayerTurn(state, out) : finish(state, out, {});
}

// ---- the Feature choices and once-per-rest powers ----
export function setDedication(state0, weaponName) { const state = clone(state0); state.hero.dedicated = weaponName; return finish(state, [{ id: uid(), kind: 'note', title: 'Dedication', text: `You dedicate yourself to your ${weaponName}: +10 to its Skill and +D4 in its Damage Pool, for good.`, rolls: [], page: 54 }], {}); }
export function setDual(state0, on) { const state = clone(state0); state.hero.dual = Boolean(on); return state; }
export function wmTrade(state0) { // One With Your Weapon: -30 weapon Skill for 10 Temporary Toughness until the end of the fight
  const state = clone(state0); const cb = state.combat; if (!cb || cb.used?.wmTrade) return finish(state, [], {});
  cb.used = { ...(cb.used || {}), wmTrade: true }; cb.flags.wmTrade = true; state.hero.vit.temp = (state.hero.vit.temp || 0) + 10;
  return finish(state, [{ id: uid(), kind: 'combat', title: 'One With Your Weapon', text: 'You give up finesse for endurance: -30 to your weapon Skill, +10 Temporary Toughness, until the fight ends.', rolls: [], place: state.here }], {});
}
export function savageWill(state0, n) { // Wrathspawn: once per Rest, Aether for damage after a blow lands
  const state = clone(state0); const h = state.hero; const cb = state.combat; const p = here(state);
  const tgt = p?.enc?.alive.find((a) => a.id === cb?.lastHit?.enemy); if (!tgt || cb.lastHit.by !== 'you' || restUsed(h, 'Savage Will')) return finish(state, [], {});
  const k = Math.min(n, h.vit.aether); h.vit.aether -= k; useRest(h, 'Savage Will');
  tgt.health = Math.max(0, tgt.health - k); const out = [{ id: uid(), kind: 'combat', title: 'Savage Will', text: `You pour ${k} Aether into the blow: ${k} more damage.`, rolls: [], place: p.id }];
  if (tgt.health <= 0) { killFoe(state, tgt, out); if (!p.enc.alive.length) return victory(state, out); }
  return finish(state, out, {});
}
export function sacrificeMinion(state0, id) { // Gravecaller: a Standard Action, D4 Wounds or 1 Sanity
  const state = clone(state0); const h = state.hero; const m = (h.minions || []).find((x) => x.id === id); if (!m) return finish(state, [], {});
  h.minions = h.minions.filter((x) => x.id !== id); h.sustained = susList(h).filter((x) => x.minion !== id);
  const n = roll('d4'); if (h.vit.health < h.vit.maxHealth || h.vit.tough < h.vit.maxTough) healWounds(h, n); else h.vit.sanity = Math.min(h.vit.maxSanity, h.vit.sanity + 1);
  const out = [{ id: uid(), kind: state.combat ? 'combat' : 'note', title: 'Necrotic Vitality', text: `You unmake your ${m.kind} and drink what held it together.`, rolls: [], place: state.here }];
  return state.combat ? endPlayerTurn(state, out) : finish(state, out, {});
}
export function rerollEvent(state0, faces) { // Zealot: once per Rest, roll an Event again
  const state = clone(state0); const h = state.hero; if (restUsed(h, 'Divine Guidance')) return finish(state, [], {});
  useRest(h, 'Divine Guidance'); const p = here(state); if (p.event) p.event = { pending: true };
  const r = resolveEvent(state, faces); r.state.log.push({ id: uid(), kind: 'note', title: 'Divine Guidance', text: 'Your faith turns the moment aside, and another takes its place.', rolls: [], place: p.id });
  return r;
}
