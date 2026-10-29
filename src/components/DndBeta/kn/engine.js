// Ker Nethalas rules engine for the beta. Pure functions over a plain game state; the UI throws the 3D dice and passes
// the numbers in. Order of a room follows the book (pp. 96-99): shape, Lair or Exit check, Tension Die, Combat
// Encounter (D20, 10+ in a room, 15+ in a corridor), otherwise the Events table.
// Rules checked against the book's text: opposed checks and Critical Successes (pp. 69-71, 75-79), Advantage and
// Disadvantage (p. 70: read the D100 with the digits swapped when that helps or hurts), Flee (a Dodge check),
// Reactions (-20 for each defence after the first in a round), conditions (pp. 88-89), Exhaustion (p. 90), Madness (p. 91).
import {
  look, featuresFor, CREATURES, FIRST_DOMAIN_ENCOUNTERS, hitLocation, PLAYER_DEFENSIVE, NPC_DEFENSIVE, PLAYER_FUMBLE, NPC_FUMBLE,
  SCAVENGE, OVERSEERS, MADNESS, stepDown, DIFFICULTY, TRAPS, easeDifficulty,
} from './tables';
import { buildShape, exitCandidates, DIRS, opposite, rng } from './shapes';

export const rnd = (n) => 1 + Math.floor(Math.random() * n);
export const roll = (expr) => {
  const m = String(expr).match(/^(\d*)d(\d+)$/i);
  if (!m) return Number(expr) || 0;
  let t = 0; for (let i = 0; i < (Number(m[1]) || 1); i++) t += rnd(Number(m[2])); return t;
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
  };
  hurt(hero, hb6);
  hero.vit.sanity = Math.max(0, hero.vit.sanity - hb4);
  hero.vit.exh += 1;
  return hero;
}
export const skillOf = (hero, name) => hero.resist[name] ?? hero.skills[name] ?? BASE_SKILLS[name] ?? 0;

// ---- Advantage, Disadvantage, Exhaustion (pp. 70, 90) ----
export const exhTier = (h) => (h.vit.exh >= 21 ? 3 : h.vit.exh >= 16 ? 2 : h.vit.exh >= 11 ? 1 : 0);
export const healAmt = (h, n) => (exhTier(h) === 1 ? Math.ceil(n / 2) : n); // heal half the Wounds, rounding up
const hasAdv = (h, name) => (h.mods?.advantage || []).includes(name);
const swapDigits = (v) => (v >= 100 ? 100 : (v % 10) * 10 + Math.floor(v / 10) || 100);
// Advantage reads the lesser order of the digits, Disadvantage the greater; they cancel
export function readD100(h, name, v, notes) {
  const adv = hasAdv(h, name), dis = exhTier(h) >= 2;
  if (adv === dis) return v;
  const sw = swapDigits(v);
  const out = adv ? Math.min(v, sw) : Math.max(v, sw);
  if (out !== v && notes) notes.push(`${adv ? 'Advantage' : 'Disadvantage'}: ${v} read as ${out}`);
  return out;
}

// damage goes to Toughness first, then Health
export function hurt(hero, n) {
  const v = hero.vit; let left = Math.max(0, n);
  const t = Math.min(v.tough, left); v.tough -= t; left -= t;
  v.health = Math.max(0, v.health - left);
  return n;
}
// Bleeding, Poisoned and Burning are cumulative (pp. 88-89)
export function addEffect(h, name) { const e = h.effects.find((x) => x.name === name); if (e) e.n += 1; else h.effects.push({ name, n: 1 }); }
export const LASTING = ['Bleeding', 'Poisoned', 'Burning'];

// ---- a new Domain ----
export function newDomain(n) {
  const roll10 = rnd(10);
  const o = look('overseer', roll10);
  return {
    n, seed: Math.floor(Math.random() * 1e9), overseer: { name: OVERSEERS[rnd(OVERSEERS.length) - 1], influence: o.text, roll: roll10 },
    tension: 8, lair: 10, lairFound: false, exit: 8, exitFound: false, darkness: [], rooms: 0, lightDrain: 1,
  };
}
export function newGame(hero, title) {
  const domain = newDomain(1);
  const start = makeStart();
  return { id: uid(), title: title || `${hero.name} in Ker Nethalas`, created: Date.now(), updated: Date.now(), hero, domain, pieces: [start], here: start.id, prev: null, log: [], combat: null, over: null };
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
  return makePlan(defs);
}
export function pieceById(state, id) { return state.pieces.find((p) => p.id === id); }
export const here = (state) => pieceById(state, state.here);

function applyDarkness(state, rollNo, out) {
  const row = look('darkness', rollNo), h = state.hero, d = state.domain, v = h.vit;
  const eff = { roll: rollNo, text: row.text, auto: [] };
  if (row.lo === 9) { const n = roll('d4'); v.maxAether = Math.max(0, v.maxAether - n); v.aether = Math.min(v.aether, v.maxAether); eff.auto.push(`Max Aether -${n}`); }
  else if (row.lo === 11) { const n = roll('d6'); v.maxTough = Math.max(1, v.maxTough - n); v.tough = Math.min(v.tough, v.maxTough); eff.auto.push(`Max Toughness -${n}`); }
  else if (row.lo === 67) { const n = roll('d4'); v.light = Math.max(0, v.light - n); eff.auto.push(`Light -${n}`); }
  else if (row.lo === 69) { d.lightDrain = 2; eff.auto.push('Light now drops by 2 per room'); }
  else if (row.lo === 5 && (v.health < v.maxHealth || v.tough < v.maxTough)) { const n = roll('d6'); hurt(h, n); eff.auto.push(`${n} Psychic damage`); }
  else if (row.lo === 7 && v.sanity < v.maxSanity) { v.sanity = Math.max(0, v.sanity - 1); eff.auto.push('Sanity -1'); }
  else if (row.lo === 37) { eff.ambush = true; }
  if (!eff.ambush) d.darkness.push(eff);
  out.push({ id: uid(), kind: 'darkness', title: 'Growing Darkness', text: row.text, rolls: [{ label: 'D100', value: rollNo }], auto: eff.auto, page: 120 });
  return eff;
}
function tensionCheck(state, die, rollV, out) {
  const d = state.domain;
  const rollTxt = { label: `Tension D${die}`, value: rollV };
  if (rollV > 2) { out.push({ id: uid(), kind: 'roll', title: 'Tension Die', text: `D${die} rolled ${rollV}: nothing stirs.`, rolls: [rollTxt] }); return null; }
  if (die === 4) {
    out.push({ id: uid(), kind: 'roll', title: 'Tension Die', text: `D4 rolled ${rollV}: something takes notice. Growing Darkness, and the die resets to D8.`, rolls: [rollTxt] });
    d.tension = 8; return applyDarkness(state, rnd(100), out);
  }
  d.tension = stepDown(die);
  out.push({ id: uid(), kind: 'roll', title: 'Tension Die', text: `D${die} rolled ${rollV}: it steps down to D${d.tension}.`, rolls: [rollTxt] });
  return null;
}
// moving into a room: light, aether, blindness, and the damage that lasts after a fight (p. 84)
function upkeep(state, out) {
  const h = state.hero, v = h.vit, d = state.domain;
  v.light = Math.max(0, v.light - (d.lightDrain || 1));
  v.aether = v.maxAether;
  for (const e of h.effects.filter((x) => LASTING.includes(x.name))) {
    v.health = Math.max(0, v.health - 1);
    out.push({ id: uid(), kind: 'note', title: e.name, text: `${e.name} costs you 1 Health a room, and it ignores Armor.`, rolls: [] });
  }
  if (v.light === 0) {
    const t = rnd(100);
    out.push({ id: uid(), kind: 'note', title: 'No light', text: `Your light is out and you are Blinded. Resolve check: rolled ${t} against ${h.resist.Resolve}${t <= h.resist.Resolve ? ', passed.' : ', failed: lose 1 Sanity.'}`, rolls: [] });
    if (t > h.resist.Resolve) v.sanity = Math.max(0, v.sanity - 1);
  }
}

export function enterDoor(state0, doorId, faces) {
  const state = clone(state0); const out = [];
  const from = here(state); const door = from.doors.find((x) => x.id === doorId);
  const plan = doorPlan(state, door); const vals = readPlan(plan, faces);
  const d = state.domain;
  if (door.to) { // retracing: a Tension check only (p. 99)
    state.prev = from.id; state.here = door.to;
    upkeep(state, out);
    const eff = tensionCheck(state, Number(plan.defs[0][1].slice(1)), vals.tension, out);
    out.push({ id: uid(), kind: 'move', title: 'Retracing your steps', text: 'You pass back through ground you have already cleared.', rolls: [], place: here(state).id });
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
  if (!d.lairFound) {
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
  piece.tags = featuresFor(dsc.text);
  if (piece.alcoves) piece.tags = ['tombs'];
  const need = kind === 'corridor' ? 15 : 10;
  let combat = null;
  if (isLair) piece.overseer = true;
  else if (vals.enc >= need) {
    const er = rnd(20); const row = FIRST_DOMAIN_ENCOUNTERS.find((x) => er >= x.lo && er <= x.hi);
    piece.enc = makeEnemies(row.name); combat = { name: row.name, table: er };
  }
  out.push({ id: uid(), kind: 'room', title: piece.title, text: piece.desc.text, page: piece.desc.page, rolls: isLair ? [] : [{ label: `Encounter D20 (${need}+)`, value: vals.enc }], lair: isLair, overseer: isLair ? d.overseer : null, tags: piece.tags, family: piece.family, place: piece.id, creature: combat ? combat.name : null });
  if (!combat && !isLair) piece.event = { pending: true };
  if (!combat) piece.cleared = !isLair;
  return finish(state, out, { darkness: eff, combat });
}

function finish(state, out, extra) {
  const hh = state.hero;
  if (hh.vit.sanity <= 0 && !hh.mad) {
    hh.mad = true; const m = rnd(10), row = MADNESS[m - 1];
    out.push({ id: uid(), kind: 'note', title: 'Madness', text: `Your Sanity reaches 0. Madness D10 ${m}: ${row.t} The episode passes and your lost Sanity returns.`, rolls: [{ label: 'D10', value: m }], page: 91 });
    if (m === 1) state.over = 'mad'; else { if (m === 9) hurt(hh, roll('2d6')); if (m === 10) hh.vit.xp += 100; if (m !== 1 && m !== 9 && m !== 10) hh.madness.push(row.t); hh.vit.sanity = hh.vit.maxSanity; }
  } else if (hh.vit.sanity > 0) hh.mad = false;
  state.log.push(...out); state.updated = Date.now();
  if (!state.over && hh.vit.health <= 0) state.over = 'dead';
  if (!state.over && hh.vit.exh >= 21) { state.over = 'dead'; state.log.push({ id: uid(), kind: 'note', title: 'Exhausted', text: 'Your body is no longer capable of enduring the accumulated fatigue. You die.', rolls: [], page: 90 }); }
  return { state, out, ...extra };
}
export function makeEnemies(name) {
  const c = CREATURES[name];
  return { name, alive: Array.from({ length: c.number }, (_, i) => ({ id: uid(), n: i + 1, health: c.health, max: c.health, wounds: [] })) };
}

// ---- events (p. 108) ----
export const eventPlan = () => makePlan([['event', 'd100']]);
export function resolveEvent(state0, faces) {
  const state = clone(state0); const out = []; const p = here(state);
  const v = readPlan(eventPlan(), faces).event;
  const row = look('events', v);
  p.event = { roll: v, text: row.text, page: 108, done: false };
  out.push({ id: uid(), kind: 'event', title: 'Event', text: row.text, rolls: [{ label: 'D100', value: v }], page: 108, place: p.id });
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
  const v = readPlan(scavengePlan(), faces); const skill = skillOf(h, 'Scavenge'); const notes = [];
  v.check = readD100(h, 'Scavenge', v.check, notes);
  p.searched = true;
  const pass = v.check <= skill;
  const rolls = [{ label: 'D100', value: v.check }];
  if (!pass) { out.push({ id: uid(), kind: 'roll', title: 'Scavenge', text: `Rolled ${v.check} against ${skill}: you find nothing. ${notes.join(' ')}`, rolls, result: 'fail', place: p.id }); return finish(state, out, {}); }
  const row = SCAVENGE.find((r) => v.loot >= r.lo && v.loot <= r.hi); let extra = '';
  if (row.coins) { const n = roll(row.coins); h.items.coins += n; extra = ` (${n})`; }
  if (row.supplies) { const n = roll(row.supplies); h.items.crafting += n; extra = ` (${n})`; }
  if (row.cooking) { const n = roll(row.cooking); h.items.cooking += n; extra = ` (${n})`; }
  if (h.mods?.scavengeCooking) { h.items.cooking += 1; extra += ' Camp Familiarity: +1 Cooking Ingredient.'; }
  if (row.resolve) { const t = rnd(100); if (t > h.resist.Resolve) { h.vit.sanity = Math.max(0, h.vit.sanity - 1); extra = ` Resolve ${t}: failed, -1 Sanity.`; } else extra = ` Resolve ${t}: passed.`; }
  rolls.push({ label: 'D20', value: v.loot });
  out.push({ id: uid(), kind: 'roll', title: 'Scavenge', text: `Rolled ${v.check} against ${skill}: success. D20 ${v.loot}: ${row.t}${extra} ${notes.join(' ')}`.trim(), rolls, page: 116, result: 'pass', place: p.id });
  return finish(state, out, {});
}

// ---- checks against a skill or resistance (p. 69) ----
export const checkPlan = () => makePlan([['check', 'd100']]);
export function skillCheck(state0, name, faces, why = '') {
  const state = clone(state0); const h = state.hero;
  const label = name === 'weapon' ? h.weapons[h.wield].skill : name; const target = skillOf(h, label); const notes = [];
  const v = readD100(h, label, readPlan(checkPlan(), faces).check, notes);
  const doubles = v % 11 === 0 && v < 100; const pass = v <= target;
  const res = pass ? (doubles || v === 1 ? 'Critical success' : 'Success') : (doubles || v === 100 ? 'Fumble' : 'Failure');
  if (doubles && pass) h.marks[label] = true;
  const out = [{ id: uid(), kind: 'roll', title: `${label} check`, text: `Rolled ${v} against ${target}: ${res}.${doubles && pass ? ' The skill is marked for improvement at Camp.' : ''} ${notes.join(' ')}${why ? ` (${why})` : ''}`.trim(), rolls: [{ label: 'D100', value: v }], result: pass ? 'pass' : 'fail', place: state.here }];
  return finish(state, out, { pass });
}

// ---- Combat (pp. 75-84) ----
const isDoubles = (n) => n % 11 === 0 && n < 100;
export function opposedResult(aRoll, aSkill, dRoll, dSkill) {
  const aPass = aRoll <= aSkill, dPass = dRoll <= dSkill;
  const aCrit = aPass && (aRoll === 1 || isDoubles(aRoll)), dCrit = dPass && (dRoll === 1 || isDoubles(dRoll));
  const aFumble = !aPass && (aRoll === 100 || isDoubles(aRoll)), dFumble = !dPass && (dRoll === 100 || isDoubles(dRoll));
  let winner = 'none';
  if (aCrit && !dCrit) winner = 'att'; else if (dCrit && !aCrit) winner = 'def';
  else if (aCrit && dCrit) winner = aRoll > dRoll ? 'att' : dRoll > aRoll ? 'def' : (aSkill >= dSkill ? 'att' : 'def');
  else if (aPass && dPass) winner = aRoll > dRoll ? 'att' : dRoll > aRoll ? 'def' : (aSkill >= dSkill ? 'att' : 'def');
  else if (aPass) winner = 'att'; else if (dPass) winner = 'def';
  return { winner, aPass, dPass, aCrit, dCrit, aFumble, dFumble };
}
const newFlags = () => ({ playerBonus: 0, playerPool: 0, enemyBonus: 0, enemyPool: 0, enemyDefPenalty: 0, playerDefPenalty: 0 });
export function startCombat(state0, surprised = false) {
  const state = clone(state0); const p = here(state); const out = [];
  const c = CREATURES[p.enc.name];
  state.combat = { piece: p.id, round: 1, side: 'player', flags: newFlags(), rally: 0, restrained: false, lose: false, initiative: null, skip: {}, reactions: 0, target: null, lastHit: null, surprised };
  if ((c.traits || []).includes('Frightening')) {
    const t = rnd(100), res = state.hero.resist.Resolve;
    out.push({ id: uid(), kind: 'combat', title: 'Frightening', text: `The ${p.enc.name} are Frightening. Resolve ${t} against ${res}: ${t <= res ? 'you hold.' : 'you lose 2 Sanity.'}`, rolls: [{ label: 'Resolve', value: t }], page: 92, result: t <= res ? 'pass' : 'fail' });
    if (t > res) state.hero.vit.sanity = Math.max(0, state.hero.vit.sanity - 2);
  }
  out.push({ id: uid(), kind: 'combat', title: `${p.enc.name}`, text: `${p.enc.alive.length} ${p.enc.name}: Combat Skill ${c.combat}, Health ${c.health} each, ${c.anatomy} anatomy${Object.keys(c.armor).length ? `, Armor ${Object.entries(c.armor).map(([k, v]) => `${v} (${k})`).join(', ')}` : ''}. ${surprised ? 'They surprised you.' : ''}`.trim(), rolls: [], page: c.page, creature: p.enc.name });
  return finish(state, out, {});
}
export const initiativePlan = () => makePlan([['me', 'd100'], ['foe', 'd100']]);
export function rollInitiative(state0, faces) {
  const state = clone(state0); const cb = state.combat; const p = here(state); const c = CREATURES[p.enc.name]; const h = state.hero;
  const v = readPlan(initiativePlan(), faces); const per = skillOf(h, 'Perception'); const notes = [];
  v.me = readD100(h, 'Perception', v.me, notes);
  const r = opposedResult(v.me, per, v.foe, c.mind);
  const first = cb.surprised ? 'enemy' : (r.winner === 'att' ? 'player' : 'enemy');
  cb.initiative = first; cb.side = first;
  return finish(state, [{ id: uid(), kind: 'combat', title: 'Initiative', text: `Your Perception ${v.me} against ${per}; their Mind ${v.foe} against ${c.mind}. ${first === 'player' ? 'You act first.' : 'They act first.'} ${notes.join(' ')}`.trim(), rolls: [{ label: 'You', value: v.me }, { label: 'Them', value: v.foe }], page: 76 }], {});
}

export const attackPlan = () => makePlan([['me', 'd100'], ['foe', 'd100'], ['loc', 'd20'], ['dmg', 'd6']]);
// what a swing would be up against, for the odds shown before the roll
export function attackOdds(state, targetId) {
  const p = here(state), cb = state.combat, h = state.hero; if (!p?.enc || !cb) return null;
  const c = CREATURES[p.enc.name], w = h.weapons[h.wield];
  const pack = (c.traits || []).includes('Pack') ? 5 * (p.enc.alive.length - 1) : 0;
  const mine = Math.max(0, skillOf(h, w.skill) + 10 + cb.flags.playerBonus - (cb.restrained ? 20 : 0));
  const theirs = Math.max(0, c.combat + pack + (cb.rally ? 10 : 0) - w.speed - cb.flags.enemyDefPenalty);
  return { mine, theirs, notes: [`Upper hand +10`, w.speed ? `${w.name} Speed ${w.speed} lowers theirs` : null, pack ? `Pack +${pack} to theirs` : null, cb.restrained ? 'Restrained -20' : null, cb.rally ? 'Rallied +10 to theirs' : null].filter(Boolean) };
}
export function playerAttack(state0, faces, opts = {}) {
  const state = clone(state0); const cb = state.combat; const p = here(state); const c = CREATURES[p.enc.name]; const h = state.hero; const w = h.weapons[h.wield];
  const out = []; const v = readPlan(attackPlan(), faces); const notes = [];
  const tgt = p.enc.alive.find((a) => a.id === (opts.targetId || cb.target)) || p.enc.alive[0];
  const odds = attackOdds(state, tgt.id);
  v.me = readD100(h, w.skill, v.me, notes);
  cb.flags.enemyDefPenalty = 0; cb.flags.playerBonus = 0;
  const r = opposedResult(v.me, odds.mine, v.foe, odds.theirs);
  const rolls = [{ label: 'You', value: v.me }, { label: 'Them', value: v.foe }];
  const who = `${p.enc.name} ${tgt.n}`;
  let text = `You ${v.me} against ${odds.mine}; ${who} ${v.foe} against ${odds.theirs}. `;
  const card = { id: uid(), kind: 'combat', title: `You strike with the ${w.name}`, rolls, result: null, place: p.id, creature: p.enc.name };
  const dmgSides = Number(String(w.dmg).slice(1)) || 6;
  if (r.aFumble) {
    const fr = rnd(10), f = PLAYER_FUMBLE[fr - 1]; text += `Fumble! D10 ${fr}: ${f.t}`;
    if (f.hit) { const n = f.hit === 'crit' ? roll('d6') * 2 : roll(f.hit); hurt(h, n); text += ` (${n} damage to you)`; }
    if (f.aether) { const n = roll('d8'); h.vit.aether = Math.max(0, h.vit.aether - n); text += ` (Aether -${n})`; }
    if (f.lose) cb.lose = true;
    if (!r.dPass) { tgt.health = Math.max(0, tgt.health - 1); text += ` Both of you failed, so it takes 1 damage that cannot be avoided.`; }
    card.result = 'fumble';
  } else if (r.winner === 'att') {
    const hl = hitLocation(c.anatomy, v.loc);
    const crit = r.aCrit || hl.weak; const pool = [v.dmg <= dmgSides ? v.dmg : rnd(dmgSides)];
    if (w.bonus) pool.push(roll(w.bonus));
    if (cb.flags.playerPool) { pool.push(rnd(6)); cb.flags.playerPool = 0; }
    let dmg = Math.max(...pool) + (h.dmgMod || 0); if (opts.push && h.vit.exh + 2 <= 25) { dmg += 1; h.vit.exh += 2; }
    if (crit) dmg *= 2;
    const armor = c.armor[hl.name] || 0;
    const net = Math.max(0, dmg - armor);
    tgt.health = Math.max(0, tgt.health - net); tgt.wounds.push({ loc: hl.name, dmg: net, crit });
    cb.lastHit = { enemy: tgt.id, loc: hl.name, dmg: net, by: 'you' };
    text += `Hit on the ${hl.name} (D20 ${v.loc})${crit ? `, a Critical Strike${hl.weak && !r.aCrit ? ' on its Weak Spot' : ''}, so the damage is doubled` : ''}. Damage pool ${pool.join(', ')}: ${dmg}${armor ? ` minus ${armor} Armor` : ''} = ${net}.`;
    card.result = crit ? 'crit' : 'hit'; card.hit = { loc: hl.name, dmg: net, crit };
    if (tgt.health <= 0) { text += ` ${who} is destroyed.`; p.enc.alive = p.enc.alive.filter((x) => x.id !== tgt.id); }
  } else if (r.winner === 'def') {
    const dm = rnd(10); text += `${who} fends you off. Its Defensive Move (D10 ${dm}): ${NPC_DEFENSIVE[dm - 1]}`;
    applyNpcDefMove(state, dm);
    card.result = 'parried';
  } else { tgt.health = Math.max(0, tgt.health - 1); text += `Both of you fail: ${who} takes 1 damage that cannot be avoided.`; card.result = 'both-fail'; if (tgt.health <= 0) p.enc.alive = p.enc.alive.filter((x) => x.id !== tgt.id); }
  card.text = `${text} ${notes.join(' ')}`.trim(); out.unshift(card);
  if (cb.rally) cb.rally = Math.max(0, cb.rally - 1);
  return endPlayerTurn(state, out);
}
function applyNpcDefMove(state, dm) {
  const cb = state.combat, h = state.hero;
  if (dm === 1) cb.flags.enemyBonus += 10;
  if (dm === 5) hurt(h, 1);
  if (dm === 6) cb.flags.enemyPool = 1;
  if (dm === 8) cb.flags.playerDefPenalty = 20;
  if (dm === 3) addEffect(h, 'Bleeding');
  if (dm === 9) { const t = here(state).enc.alive[0]; if (t) t.health = Math.min(t.max, t.health + roll('d4')); }
  if (dm === 10) cb.extraEnemyTurn = true;
}
function applyPlayerDefMove(state, dm) {
  const cb = state.combat, h = state.hero, p = here(state);
  if (dm === 1) cb.flags.playerBonus += 10;
  if (dm === 5) { const t = p.enc.alive[0]; if (t) { t.health = Math.max(0, t.health - 1); if (t.health <= 0) p.enc.alive = p.enc.alive.filter((x) => x.id !== t.id); } }
  if (dm === 6) cb.flags.playerPool = 1;
  if (dm === 8) cb.flags.enemyDefPenalty = 20;
  if (dm === 9) h.vit.tough = Math.min(h.vit.maxTough, h.vit.tough + healAmt(h, 2));
}
function endPlayerTurn(state, out) {
  const p = here(state), cb = state.combat;
  if (!p.enc.alive.length) return victory(state, out);
  cb.side = 'enemy'; cb.enemyIdx = 0;
  return finish(state, out, {});
}
function victory(state, out) {
  const p = here(state), h = state.hero, v = h.vit; const t = healAmt(h, roll('d4'));
  v.tough = Math.min(v.maxTough, v.tough + t); v.xp += 50;
  p.enc = null; p.cleared = true; p.event = p.event || { pending: true };
  state.combat = null;
  h.effects = h.effects.filter((e) => e.name !== 'Restrained' && e.name !== 'Festering wound');
  out.push({ id: uid(), kind: 'combat', title: 'Victory', text: `The fight is over. +50 XP, and you recover ${t} Toughness.`, rolls: [], result: 'won', place: p.id });
  return finish(state, out, { won: true });
}

// one enemy's turn: action die, its attack, your defence, location and damage
export const enemyPlan = () => makePlan([['act', 'd6'], ['foe', 'd100'], ['me', 'd100'], ['loc', 'd20'], ['dmg', 'd8']]);
export function enemyTurn(state0, faces) {
  const state = clone(state0); const cb = state.combat; const p = here(state); const c = CREATURES[p.enc.name]; const h = state.hero;
  const out = []; const v = readPlan(enemyPlan(), faces);
  const idx = Math.min(cb.enemyIdx || 0, p.enc.alive.length - 1); const en = p.enc.alive[idx];
  const act = c.actions.find((a) => a.rolls.includes(v.act));
  const pack = (c.traits || []).includes('Pack') ? 5 * (p.enc.alive.length - 1) : 0;
  const foeSkill = c.combat + pack + (cb.rally ? 10 : 0) + 10 + cb.flags.enemyBonus; cb.flags.enemyBonus = 0;
  const w = h.weapons[h.wield];
  const dodge = skillOf(h, 'Dodge'), parry = w.parry ? skillOf(h, w.skill) : 0;
  const use = parry > dodge ? { n: 'parry', s: parry } : { n: 'dodge', s: dodge };
  const reactionPenalty = 20 * (cb.reactions || 0);
  const mySkill = Math.max(0, use.s - cb.flags.playerDefPenalty - reactionPenalty - (cb.restrained ? 20 : 0)); cb.flags.playerDefPenalty = 0;
  const who = `${p.enc.name} ${en.n}`;
  const card = { id: uid(), kind: 'combat', title: `${who}: ${act.name}`, rolls: [], result: null, place: p.id, creature: p.enc.name };
  let text = '';
  if (cb.skip[en.id]) { cb.skip[en.id] -= 1; text = 'It is too dazed to act this round.'; card.result = 'skip'; }
  else if (act.rally) { cb.rally = 2; text = act.text; card.result = 'rally'; }
  else if (act.magic) {
    const resName = act.wail ? 'Resolve' : act.halfOnSave ? 'Endurance' : 'Spellward';
    const target = skillOf(h, resName); const save = v.me; const ok = save <= target;
    card.rolls = [{ label: resName, value: save }];
    text = `${act.name} (magical): ${resName} ${save} against ${target}: ${ok ? 'resisted' : 'it takes hold'}. `;
    if (act.wail) { if (!ok) { cb.lose = true; text += 'You are Stunned and lose your next action.'; } }
    else if (act.dmg) {
      const sd = Number(act.dmg.slice(1)) || 6; let n = v.dmg <= sd ? v.dmg : rnd(sd);
      if (ok && act.halfOnSave) n = Math.ceil(n / 2); if (ok && !act.halfOnSave) n = 0;
      if (n) { hurt(h, n); text += `${n} ${act.type} damage.`; if (act.halfOnSave && !ok) en.health = Math.min(en.max, en.health + Math.floor(n / 2)); }
    }
    card.result = ok ? 'resisted' : 'hit';
  } else {
    cb.reactions = (cb.reactions || 0) + 1;
    const r = opposedResult(v.foe, foeSkill, v.me, mySkill);
    card.rolls = [{ label: 'Them', value: v.foe }, { label: 'You', value: v.me }];
    text = `${who} ${v.foe} against ${foeSkill} (upper hand +10); your ${use.n} ${v.me} against ${mySkill}${reactionPenalty ? ` (-${reactionPenalty} for earlier defences this round)` : ''}. `;
    if (r.aFumble) { const fr = rnd(10), f = NPC_FUMBLE[fr - 1]; text += `It fumbles. D10 ${fr}: ${f.t}`; if (f.self) { const n = roll(f.self); en.health = Math.max(0, en.health - n); text += ` (${n})`; if (en.health <= 0) p.enc.alive = p.enc.alive.filter((x) => x.id !== en.id); } if (f.skip) cb.skip[en.id] = f.skip; card.result = 'fumble'; }
    else if (r.winner === 'att') {
      const hl = hitLocation('Humanoid', v.loc); const crit = r.aCrit;
      const sides = act.dmg === '1' ? 1 : Number(String(act.dmg).slice(1));
      let dmg = sides === 1 ? 1 : (v.dmg <= sides ? v.dmg : rnd(sides));
      if (cb.flags.enemyPool) { dmg = Math.max(dmg, rnd(6)); cb.flags.enemyPool = 0; }
      if (crit) dmg *= 2;
      const armor = act.grasp ? 0 : (h.armor[hl.name === 'Chest' || hl.name === 'Abdomen' ? 'Torso' : hl.name] || 0);
      const net = Math.max(act.grasp ? 1 : 0, dmg - armor);
      hurt(h, net); h.wounds = [...(h.wounds || []), { loc: hl.name, dmg: net, crit, by: p.enc.name }].slice(-24);
      cb.lastHit = { enemy: en.id, loc: hl.name, dmg: net, by: 'them' };
      text += `It hits your ${hl.name}${crit ? ' with a brutal strike (damage doubled)' : ''}: ${act.dmg === '1' ? '1' : `D${sides} ${dmg}`}${armor ? ` minus ${armor} Armor` : ''} = ${net} ${act.type || ''} damage.`;
      card.hit = { loc: hl.name, dmg: net, crit };
      if (act.festers) { const t = rnd(100); if (t > h.resist.Endurance) { if (!h.effects.some((e) => e.name === 'Festering wound')) h.effects.push({ name: 'Festering wound', n: 1 }); text += ` Endurance ${t}: a festering wound.`; } else text += ` Endurance ${t}: no infection.`; }
      if (act.grasp) { const a = rnd(100), body = skillOf(h, 'Athletics'); const ar = opposedResult(a, body, rnd(100), c.body); if (ar.winner !== 'att') { cb.restrained = true; text += ' You are Restrained.'; } else text += ' You twist free.'; }
      card.result = crit ? 'crit' : 'hit';
    } else if (r.winner === 'def') {
      const dm = rnd(10); text += `You turn it aside. Your Defensive Move (D10 ${dm}): ${PLAYER_DEFENSIVE[dm - 1]}`;
      applyPlayerDefMove(state, dm); card.result = 'parried';
    } else { hurt(h, 1); text += 'Both of you fail: you suffer 1 damage that cannot be avoided.'; card.result = 'both-fail'; }
  }
  card.text = text; out.push(card);
  if (!p.enc.alive.length) return victory(state, out);
  cb.enemyIdx = (cb.enemyIdx || 0) + 1;
  if (cb.extraEnemyTurn) { cb.extraEnemyTurn = false; cb.enemyIdx -= 1; }
  if (cb.enemyIdx >= p.enc.alive.length) {
    cb.enemyIdx = 0; cb.side = 'player'; cb.round += 1; cb.reactions = 0; if (cb.rally) cb.rally = Math.max(0, cb.rally - 1);
    for (const e of h.effects) {
      if (e.name === 'Bleeding' || e.name === 'Poisoned' || e.name === 'Burning') { hurt(h, e.n); out.push({ id: uid(), kind: 'combat', title: e.name, text: `${e.name}: ${e.n} damage at the end of the round.`, rolls: [], place: p.id }); }
      if (e.name === 'Festering wound') { hurt(h, 1); out.push({ id: uid(), kind: 'combat', title: e.name, text: 'The festering wound burns for 1 Necrotic damage.', rolls: [], place: p.id }); }
    }
    if (cb.restrained) { hurt(h, 1); out.push({ id: uid(), kind: 'combat', title: 'Restrained', text: 'Held fast: 1 damage that ignores Armor.', rolls: [], place: p.id }); }
    if (cb.lose) { cb.lose = false; cb.side = 'enemy'; cb.enemyIdx = 0; out.push({ id: uid(), kind: 'combat', title: 'Lost action', text: 'You lose this turn.', rolls: [], place: p.id }); }
  }
  return finish(state, out, {});
}
// Restrained (p. 89): an Athletics check as a Free Action; a Standard Action instead gives +20
export const breakFreePlan = () => makePlan([['check', 'd100']]);
export function breakFree(state0, faces, { standard = false } = {}) {
  const state = clone(state0); const cb = state.combat; const h = state.hero; const body = skillOf(h, 'Athletics') + (standard ? 20 : 0); const notes = [];
  const v = readD100(h, 'Athletics', readPlan(breakFreePlan(), faces).check, notes); const ok = v <= body;
  if (ok) cb.restrained = false;
  if (standard) { cb.side = 'enemy'; cb.enemyIdx = 0; }
  return finish(state, [{ id: uid(), kind: 'combat', title: 'Break free', text: `Athletics ${v} against ${body}${standard ? ' (+20 for a Standard Action)' : ''}: ${ok ? 'you break free.' : 'you stay held.'} ${notes.join(' ')}`.trim(), rolls: [{ label: 'D100', value: v }], result: ok ? 'pass' : 'fail', place: state.here }], {});
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
  return finish(state, out, { darkness: eff });
}
export const campPlan = () => makePlan([['camp', 'd20']]);
export function setCamp(state0, faces, { barricade = 0, sleep = false }) {
  const state = clone(state0); const h = state.hero; const v = h.vit; const out = [];
  const hasRation = h.items.rations > 0; if (hasRation) h.items.rations -= 1;
  const bar = Math.min(barricade, h.items.crafting); h.items.crafting -= bar; v.exh += bar;
  const mod = bar * 5 + (sleep ? 2 : 0);
  const r = readPlan(campPlan(), faces).camp; const total = r + mod; const safe = total >= 12;
  const half = !hasRation || !safe; const f = (n) => (half ? Math.floor(n / 2) : n);
  const t = healAmt(h, f(v.maxTough - v.tough)); v.tough += t; const hh = healAmt(h, f(1) + (sleep ? 1 : 0)); v.health = Math.min(v.maxHealth, v.health + hh);
  const san = f(roll('d4')); v.sanity = Math.min(v.maxSanity, v.sanity + san); const ex = f(10) + (sleep ? 5 : 0); v.exh = Math.max(0, v.exh - ex);
  h.wounds = []; h.effects = h.effects.filter((e) => e.name === 'Bleeding' || e.name === 'Poisoned' || e.name === 'Burning');
  out.push({ id: uid(), kind: 'camp', title: 'Camp', text: `Camp Check D20 ${r}${mod ? ` ${mod > 0 ? '+' : ''}${mod}` : ''} = ${total} (12+ is safe): ${safe ? 'you rest undisturbed.' : 'something finds the camp.'} ${hasRation ? '' : 'No Ration: half the benefits. '}You recover ${t} Toughness, ${hh} Health, ${san} Sanity and lose ${ex} Exhaustion.`, rolls: [{ label: 'D20', value: r }], page: 123, result: safe ? 'pass' : 'fail', place: state.here });
  let combat = null;
  if (!safe) { const p = here(state); if (!p.enc) { const er = rnd(20); const row = FIRST_DOMAIN_ENCOUNTERS.find((x) => er >= x.lo && er <= x.hi); p.enc = makeEnemies(row.name); p.cleared = false; combat = { name: row.name }; } }
  return finish(state, out, { combat, safe });
}
// Medicine + 1 Bandage (p. 19): D4 Toughness once per room, or remove Bleeding / Poisoned. Out of combat only.
export const tendPlan = () => makePlan([['check', 'd100']]);
export function tend(state0, faces, { mode = 'heal' } = {}) {
  const state = clone(state0); const h = state.hero; const p = here(state); const out = [];
  if (h.items.bandages < 1) return finish(state, [{ id: uid(), kind: 'note', title: 'No bandages', text: 'You have no Bandages.', rolls: [] }], {});
  h.items.bandages -= 1; const notes = []; const skill = skillOf(h, 'Medicine');
  const v = readD100(h, 'Medicine', readPlan(tendPlan(), faces).check, notes); const ok = v <= skill;
  if (mode === 'heal') p.tended = true;
  let text = `Medicine ${v} against ${skill}: ${ok ? 'success.' : 'the bandage is wasted.'}`;
  if (ok) {
    if (mode === 'heal') { const t = healAmt(h, roll('d4')); h.vit.tough = Math.min(h.vit.maxTough, h.vit.tough + t); text += ` You recover ${t} Toughness.`; }
    else { const i = h.effects.findIndex((e) => LASTING.includes(e.name) || e.name === 'Festering wound'); if (i >= 0) { text += ` The ${h.effects[i].name.toLowerCase()} stops.`; h.effects.splice(i, 1); } }
  }
  out.push({ id: uid(), kind: 'camp', title: mode === 'heal' ? 'Tending your wounds' : 'Dressing a condition', text: `${text} ${notes.join(' ')}`.trim(), rolls: [{ label: 'D100', value: v }], page: 19, result: ok ? 'pass' : 'fail', place: state.here });
  return finish(state, out, {});
}
export function eat(state0, what = 'ration') {
  const state = clone(state0); const h = state.hero; const out = [];
  if (what === 'ration') { if (h.items.rations < 1) return finish(state, [{ id: uid(), kind: 'note', title: 'No rations', text: 'You have no Ration.', rolls: [] }], {}); h.items.rations -= 1; h.vit.exh = Math.max(0, h.vit.exh - 1); out.push({ id: uid(), kind: 'camp', title: 'A Ration', text: 'You eat a Ration and lose 1 Exhaustion.', rolls: [], page: 90, place: state.here }); }
  else { if (h.items.cooking < 1) return finish(state, [{ id: uid(), kind: 'note', title: 'Nothing to eat', text: 'You have no Cooking Ingredients.', rolls: [] }], {}); h.items.cooking -= 1; h.vit.exh = Math.max(0, h.vit.exh - 1); const t = rnd(100); const ok = t <= h.resist.Endurance; if (!ok) h.vit.health = Math.max(0, h.vit.health - 1); out.push({ id: uid(), kind: 'camp', title: 'Raw ingredients', text: `You eat raw Cooking Ingredients and lose 1 Exhaustion. Endurance ${t} against ${h.resist.Endurance}: ${ok ? 'you keep it down.' : 'it turns your stomach and costs you 1 Health.'}`, rolls: [{ label: 'Endurance', value: t }], page: 90, place: state.here }); }
  return finish(state, out, {});
}
export function lightTorch(state0) {
  const state = clone(state0); const h = state.hero;
  if (h.items.torches < 1) return finish(state, [{ id: uid(), kind: 'note', title: 'No torches', text: 'You have no Torch to light.', rolls: [] }], {});
  h.items.torches -= 1; h.vit.light = 20;
  return finish(state, [{ id: uid(), kind: 'note', title: 'Torch', text: 'You light a fresh Torch. It will last 20 rooms.', rolls: [], page: 96, place: state.here }], {});
}

// ---- the lair, ambushes, leaving the Domain ----
export function ambush(state0) {
  const state = clone(state0); const p = here(state); const er = rnd(20); const row = FIRST_DOMAIN_ENCOUNTERS.find((x) => er >= x.lo && er <= x.hi);
  p.enc = makeEnemies(row.name); p.cleared = false;
  return finish(state, [{ id: uid(), kind: 'combat', title: 'Ambush', text: `You are ambushed. Combat Encounter D20 ${er}: ${row.name}. They surprise you.`, rolls: [{ label: 'D20', value: er }], page: 133, place: p.id }], { combat: { name: row.name } });
}
export function overseerDown(state0) {
  const state = clone(state0); const p = here(state); p.lair = false; p.overseerDown = true; p.cleared = true; state.hero.vit.xp += 200; state.domain.overseerSlain = true;
  state.hero.vit.sanity = Math.min(state.hero.vit.maxSanity, state.hero.vit.sanity + roll('d4'));
  return finish(state, [{ id: uid(), kind: 'combat', title: 'The Overseer falls', text: 'You mark the Overseer as defeated. Every creature in this Domain loses its empowerment. +200 XP and D4 Sanity.', rolls: [], page: 179, place: p.id }], {});
}
export function descend(state0) {
  const state = clone(state0); const n = state.domain.n + 1;
  state.domain = newDomain(n); const start = makeStart(); start.desc = { text: 'The stair lets you out into the next Domain. The air is colder here.', roll: 0 };
  start.title = `Domain ${n}`; start.tags = []; start.start = true; state.pieces = [start]; state.here = start.id; state.prev = null; state.combat = null;
  return finish(state, [{ id: uid(), kind: 'room', title: `Domain ${n}`, text: `You leave the Domain behind. The Tension Die resets to D8. Overseer: ${state.domain.overseer.name}. Influence (D10 ${state.domain.overseer.roll}): ${state.domain.overseer.influence}`, rolls: [], page: 100, place: start.id }], {});
}
export function adjust(state0, field, delta) {
  const state = clone(state0); const v = state.hero.vit; const caps = { health: 'maxHealth', tough: 'maxTough', aether: 'maxAether', sanity: 'maxSanity' };
  const cap = caps[field] ? v[caps[field]] : (field === 'exh' ? 25 : (field === 'light' ? 20 : 100000));
  v[field] = Math.max(0, Math.min(cap, v[field] + delta));
  if (v.health <= 0) state.over = 'dead';
  state.updated = Date.now(); return state;
}
export function setWield(state0, i) { const state = clone(state0); state.hero.wield = i; return state; }

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
export const findDoor = (state, doorId) => { for (const p of state.pieces) { const d = p.doors.find((x) => x.id === doorId); if (d) return d; } return null; };
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
  return finish(state, out, {});
}
// a trap goes off: its avoidance check, +20 if you knew it was there; it never triggers again
export const trapPlan = () => makePlan([['avoid', 'd100']]);
export function springTrap(state0, doorId, faces, { knew = false, voluntary = false } = {}) {
  const state = clone(state0); const h = state.hero; const d = findDoor(state, doorId); const out = [];
  const row = d.trap || rnd(10); const t = TRAPS[row - 1]; const bonus = (knew || voluntary) ? 20 : 0;
  const skill = Math.max(0, skillOf(h, t.avoid) + bonus); const notes = [];
  const v = readD100(h, t.avoid, readPlan(trapPlan(), faces).avoid, notes); const ok = v <= skill;
  let text = `${voluntary ? 'You set it off on purpose. ' : ''}Trap D10 ${row}: ${t.t} ${t.avoid} ${v} against ${skill}${bonus ? ' (+20, you knew)' : ''}: `;
  let combat = null;
  if (ok) text += 'you avoid it entirely.';
  else if (t.alarm) { const er = rnd(20); const r = FIRST_DOMAIN_ENCOUNTERS.find((x) => er >= x.lo && er <= x.hi); const p = here(state); p.enc = makeEnemies(r.name); p.cleared = false; combat = { name: r.name }; text += `the alarm brings ${r.name} (D20 ${er}).`; }
  else {
    let n = roll(t.dmg);
    if (t.gas) { const e = rnd(100); if (e <= h.resist.Endurance) { n = 0; text += `Endurance ${e}: you hold your breath. `; } }
    if (n) { hurt(h, n); text += `${n} ${t.type} damage. `; }
    if (t.poison) { const e = rnd(100); if (e > h.resist.Endurance) { addEffect(h, 'Poisoned'); text += `Endurance ${e}: Poisoned.`; } else text += `Endurance ${e}: the poison does not take.`; }
    if (t.net) { h.vit.exh += roll('d6'); text += 'You struggle free of the net at the cost of Exhaustion.'; }
  }
  d.trapped = false; d.trap = null; d.spotted = false; d.sprung = true;
  out.push({ id: uid(), kind: 'roll', title: 'Trap', text: `${text} ${notes.join(' ')}`.trim(), rolls: [{ label: t.avoid, value: v }], page: 119, result: ok ? 'pass' : 'fail', place: state.here });
  return finish(state, out, { combat });
}
export const thieveryPlan = () => makePlan([['check', 'd100']]);
export function disarmTrap(state0, doorId, faces) {
  const state = clone(state0); const h = state.hero; const d = findDoor(state, doorId);
  const [dname, dmod] = DIFFICULTY[rnd(8)]; const skill = Math.max(0, skillOf(h, 'Thievery') + dmod); const notes = [];
  const v = readD100(h, 'Thievery', readPlan(thieveryPlan(), faces).check, notes);
  if (v <= skill) { d.trapped = false; d.trap = null; d.spotted = false; d.safe = true; h.vit.xp += 10; return finish(state, [{ id: uid(), kind: 'roll', title: 'Disarm', text: `Thievery ${v} against ${skill} (${dname}): the trap is disabled. +10 XP. ${notes.join(' ')}`.trim(), rolls: [{ label: 'Thievery', value: v }], page: 117, result: 'pass', place: state.here }], {}); }
  state.log.push({ id: uid(), kind: 'roll', title: 'Disarm', text: `Thievery ${v} against ${skill} (${dname}): it goes off in your hands.`, rolls: [{ label: 'Thievery', value: v }], page: 117, result: 'fail', place: state.here });
  return springTrap(state, doorId, fakeFaces(trapPlan()), { knew: true });
}
export function pickLock(state0, doorId, faces) {
  const state = clone(state0); const h = state.hero; const d = findDoor(state, doorId);
  if (!(h.items.lockpicks > 0)) return finish(state, [{ id: uid(), kind: 'note', title: 'No Lockpick', text: 'You need a Lockpick.', rolls: [] }], {});
  const [dname, dmod] = DIFFICULTY[d.pickDiff || 5]; const skill = Math.max(0, skillOf(h, 'Thievery') + dmod); const notes = [];
  const v = readD100(h, 'Thievery', readPlan(thieveryPlan(), faces).check, notes);
  if (v <= skill) { d.locked = false; h.vit.xp += 10; return finish(state, [{ id: uid(), kind: 'roll', title: 'Pick the lock', text: `Thievery ${v} against ${skill} (${dname}): the lock opens. +10 XP. ${notes.join(' ')}`.trim(), rolls: [{ label: 'Thievery', value: v }], page: 118, result: 'pass', place: state.here }], {}); }
  h.items.lockpicks -= 1; d.pickDiff = easeDifficulty(d.pickDiff || 5);
  return finish(state, [{ id: uid(), kind: 'roll', title: 'Pick the lock', text: `Thievery ${v} against ${skill} (${dname}): the Lockpick snaps. The next attempt is a step easier.`, rolls: [{ label: 'Thievery', value: v }], page: 118, result: 'fail', place: state.here }], {});
}
export const forcePlan = (state) => makePlan([['check', 'd100'], ['tension', `d${state.domain.tension}`]]);
export function forceDoor(state0, doorId, faces) {
  const state = clone(state0); const h = state.hero; const d = findDoor(state, doorId); const out = [];
  const plan = forcePlan(state0); const v = readPlan(plan, faces); const bonus = 20 * (d.forceTries || 0); const skill = skillOf(h, 'Athletics') + bonus; const notes = [];
  const r = readD100(h, 'Athletics', v.check, notes); const ok = r <= skill; d.forceTries = (d.forceTries || 0) + 1;
  if (ok) { d.locked = false; h.vit.xp += 10; }
  out.push({ id: uid(), kind: 'roll', title: 'Force the door', text: `Athletics ${r} against ${skill}${bonus ? ` (+${bonus} for trying again)` : ''}: ${ok ? 'it gives way. +10 XP.' : 'it holds.'} The noise carries. ${notes.join(' ')}`.trim(), rolls: [{ label: 'Athletics', value: r }], page: 118, result: ok ? 'pass' : 'fail', place: state.here });
  const eff = tensionCheck(state, Number(plan.defs[1][1].slice(1)), v.tension, out);
  return finish(state, out, { darkness: eff });
}
export function openDoor(state0, doorId) { const state = clone(state0); const d = findDoor(state, doorId); d.open = true; return state; }
