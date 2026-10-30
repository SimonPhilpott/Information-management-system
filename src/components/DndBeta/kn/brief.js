// What a throw is for, said before the dice leave your hand: each die, what it decides, and the result you need.
// The play screen shows this as the roll prompt, and the result keeps it (entry.need) in the scroll and the Chronicle.
import * as E from './engine';
import { TRAPS, SCAVENGE, DIFFICULTY, look } from './tables';
import { hitLocation, encounterFor } from './creatures';

const dieOf = (d) => (d === 'd100' ? 'd100' : d);
// what a die is for, by colour (the dice tray paints it so): your checks, the creature's, damage, hit location,
// the world being made, and the Tension Die and the Darkness
export const ROLE_NAMES = { you: 'Your roll', them: 'Theirs', dmg: 'Damage', loc: 'Hit location', world: 'The world', dark: 'Tension' };
export function roleOf(k, keys = []) {
  if (['me', 'per', 'avoid', 'save', 'rot', 'end', 'camp'].includes(k) || /^mark\d/.test(k)) return 'you';
  if (k === 'check') return keys.includes('shape') ? 'world' : 'you';
  if (k === 'foe' || k === 'act') return 'them';
  if (k === 'loc') return 'loc';
  if (k === 'dmg') return 'dmg';
  if (k === 'tension') return 'dark';
  return 'world';
}
// the order the dice are thrown in: one roll at a time, except you-against-them, thrown together as the book suggests (p. 79)
export function stepsOf(plan, together = false) {
  const idx = plan.defs.map((_, i) => i);
  if (together) return [idx];
  const keys = plan.defs.map(([k]) => k); const me = keys.indexOf('me'), foe = keys.indexOf('foe');
  const out = [];
  for (const i of idx) {
    if (i === foe && me >= 0) continue;
    if (i === me && foe >= 0) { out.push([me, foe]); continue; }
    out.push([i]);
  }
  return out;
}

export function brief(plan, game, hint = {}) {
  const h = game.hero, p = E.here(game), d = game.domain, cb = game.combat;
  const keys = plan.defs.map(([k]) => k);
  const lines = [];
  const add = (die, what, need, target = null) => lines.push({ die: dieOf(die), what, need, target });
  const tgt = (name, bonus = 0) => Math.max(0, E.skillOf(h, name) + bonus);
  const skillLine = (name, bonus = 0) => {
    const s = Math.max(0, E.skillOf(h, name) + bonus);
    const adv = (h.mods?.advantage || []).includes(name), dis = E.exhTier(h) >= 2;
    return `${s} or less${adv && !dis ? ' (with Advantage)' : ''}${dis && !adv ? ' (with Disadvantage)' : ''}${s === 0 ? ': it cannot succeed' : ''}`;
  };
  for (const [k, die] of plan.defs) {
    const n = Number(String(die).slice(1)); const start = lines.length;
    switch (k) {
      case 'shape': add(die, 'Room or corridor', '1-25 a corridor, 26-100 a room'); break;
      case 'check':
        if (keys.includes('shape')) add(die, d.lairFound ? 'Exit Die' : 'Lair Die', n === 4 ? `1-2 and you have found ${d.lairFound ? 'the way out' : 'the lair'}` : '1-2 steps it down');
        else add(die, hint.skill || 'Check', skillLine(hint.skill || 'Perception', hint.bonus || 0), tgt(hint.skill || 'Perception', hint.bonus || 0));
        break;
      case 'tension': add(die, 'Tension Die', n === 4 ? '1-2 and the Darkness grows' : '3 or more keeps you unnoticed'); break;
      case 'enc': add(die, 'Combat Encounter', '10+ in a room or 15+ in a corridor brings a fight'); break;
      case 'event': add(die, 'Events table', 'whatever it lands on happens'); break;
      case 'loot': add(die, 'Scavenging table', 'read only if the search succeeds'); break;
      case 'me':
        if (keys.includes('loc')) { const o = E.attackOdds(game, cb?.target); if (keys.includes('act')) add('d100', 'Your defence or resistance', `your Dodge ${E.skillOf(h, 'Dodge')}${h.weapons[h.wield].parry || h.shield ? ` or Parry ${E.skillOf(h, h.weapons[h.wield].skill) + (h.shield?.parry || 0)}` : ''}, or the check its action names`); else add('d100', 'Your attack', `${o?.mine ?? '?'} or less, and higher than theirs`); }
        else if (hint.sneak) add('d100', 'Your Stealth', `${skillLine('Stealth')}, and higher than theirs`);
        else if (hint.ability) add('d100', 'Spare', 'not used');
        else add('d100', 'Your Perception', `${skillLine('Perception')}, and higher than theirs`);
        break;
      case 'foe':
        if (keys.includes('loc')) { const o = E.attackOdds(game, cb?.target); add('d100', keys.includes('act') ? 'Their attack' : 'Their defence', keys.includes('act') ? 'they hit if theirs wins' : `they fend you off on ${o?.theirs ?? '?'} or less`); }
        else if (hint.ability) add('d100', 'Its Magic Resistance', `it resists on ${E.foeStat(game)?.magicRes ?? '?'} or less`);
        else add('d100', 'Their Mind', `${E.foeStat(game)?.mind ?? '?'} or less`);
        break;
      case 'loc': { const s = E.foeStat(game); add(die, 'Hit location', keys.includes('act') ? 'where it strikes you' : s?.weak ? `the ${s.anatomy} table; its Weak Spot (${s.weak}) is a Critical Strike` : 'it has no Weak Spot'); break; }
      case 'dmg': add(die, 'Damage', keys.includes('act') ? 'their damage die' : `your ${h.weapons[h.wield].dmg.toUpperCase()}${h.weapons[h.wield].bonus ? ` and ${h.weapons[h.wield].bonus.toUpperCase()}` : ''}: you keep the best`); break;
      case 'act': add(die, 'What it does', 'its D6 table of actions'); break;
      case 'isdoor': add(die, 'Is there a door?', '1-5 a door, 6-10 an open archway'); break;
      case 'per': add('d100', 'Perception', hint.look === false ? 'not used: you are not looking' : `${skillLine('Perception')}, moved by the Difficulty`); break;
      case 'diff': add(die, 'Difficulty', '1 Child\'s play to 8 Impossible'); break;
      case 'trap': add(die, 'Trapped?', '7+ means it is trapped'); break;
      case 'trapRow': add(die, 'Which trap', 'read only if it is trapped'); break;
      case 'lock': add(die, 'Locked?', keys.includes('found') ? '10+ means the container is locked' : '12+ means it is locked'); break;
      case 'table': add(die, 'Encounter table', '1-3 Table A, 4-6 Table B (read only if a fight comes)'); break;
      case 'which': add(die, 'Which creature', d.n <= 1 ? 'First Domain: 1-7 Blightfang Rats, 8-14 Skeletal Horrors, 15-20 Flesh Eater' : 'the D20 row of that table'); break;
      case 'found': add(die, 'The container', 'opened later: 1-5 empty, 6-10 Container Loot'); break;
      case 'avoid': { const t = TRAPS[(hint.trap || 1) - 1]; add('d100', `${t.avoid} to avoid it`, skillLine(t.avoid, hint.knew ? 20 : 0)); break; }
      case 'camp': add(die, 'Camp Check', `${hint.need || 12} or more`); break;
      case 'save': add('d100', 'Your resistance', 'only if its blow lands and calls for a check'); break;
      case 'rot': add('d100', 'The Rot: Endurance', `${skillLine('Endurance')}, or the Rot advances`); break;
      case 'potion': add(die, 'Which potion', 'the Potions table, if it is not yet known'); break;
      case 'aging': add(die, 'Potion aging', '1-2 poison, 3-4 explodes, 5-10 weakened, 11-17 as intended, 18-20 better'); break;
      case 'end': add('d100', 'Endurance', `${skillLine('Endurance')}, only if it has turned to poison`); break;
      default:
        if (/^mark\d/.test(k)) { const sk = Object.keys(h.marks || {}).filter((x) => h.marks[x])[Number(k.slice(4))]; add('d100', `Improve ${sk || 'a Skill'}`, `over ${sk ? E.skillOf(h, sk) : 'your score'} gains D4, otherwise 1`); }
        else add(die, k, '');
    }
    for (const l of lines.slice(start)) { l.key = k; l.role = roleOf(k, keys); }
  }
  // the numbers each opposed roll needs, so its result can be read as it lands
  const at = (k) => lines.find((l) => l.key === k);
  if (keys.includes('me') && keys.includes('foe') && keys.includes('loc') && !keys.includes('act')) { const o = E.attackOdds(game, cb?.target); if (o) { at('me').target = o.mine; at('foe').target = o.theirs; } }
  else if (keys.includes('me') && keys.includes('foe') && !keys.includes('act') && !hint.ability) { const s = E.foeStat(game); at('me').target = tgt(hint.sneak ? 'Stealth' : 'Perception'); if (s) at('foe').target = s.mind; }
  if (at('per')) at('per').target = tgt('Perception');
  if (at('avoid')) { const t = TRAPS[(hint.trap || 1) - 1]; at('avoid').target = tgt(t.avoid, hint.knew ? 20 : 0); }
  for (const k of ['rot', 'end']) if (at(k)) at(k).target = tgt('Endurance');
  return { title: hint.title || 'A roll', why: hint.why || '', lines, hint };
}

// the result of each roll in words, as far as the dice so far can tell it: { t, tone } per line, or null
const dbl = (v) => v % 11 === 0 && v < 100;
const vsSkill = (v, t) => (t == null ? null : v <= t ? { t: `${dbl(v) ? 'a Critical Success' : 'success'} (needed ${t})`, tone: 'good' } : { t: `${dbl(v) || v === 100 ? 'a Critical Failure' : 'failure'} (needed ${t})`, tone: 'bad' });
const first = (s, n = 80) => { const f = String(s || '').split(/(?<=[.!?])\s/)[0]; return f.length > n ? `${f.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : f; };
export function outcomes(plan, vals, game, hint = {}, lines = []) {
  const keys = plan.defs.map(([k]) => k); const d = game.domain, cb = game.combat;
  const sizeOf = (k) => Number(String(plan.defs.find(([x]) => x === k)?.[1] || 'd0').slice(1));
  const T = (k) => lines.find((l) => l.key === k)?.target ?? null;
  const corridor = vals.shape != null ? vals.shape <= 25 : null;
  const attack = keys.includes('loc') && !keys.includes('act');
  let hit = null; // the attack's result, once both D100s are in
  if (attack && vals.me != null && vals.foe != null && T('me') != null && T('foe') != null) hit = E.opposedResult(vals.me, T('me'), vals.foe, T('foe')).winner;
  const one = (k, v) => {
    if (v == null) return null;
    if (vals.isdoor > 5 && ['per', 'diff', 'trap', 'trapRow', 'lock'].includes(k)) return { t: 'not needed: an open archway' };
    switch (k) {
      case 'shape': return { t: v <= 25 ? 'a corridor' : 'a room' };
      case 'check':
        if (keys.includes('shape')) { const n = sizeOf('check'); return v <= 2 ? { t: n === 4 ? (d.lairFound ? 'the way out is here' : "the Overseer's lair is here") : `it steps down to D${n === 10 ? 8 : n === 8 ? 6 : 4}`, tone: 'warn' } : { t: 'no change' }; }
        return vsSkill(v, T('check'));
      case 'tension': { const n = sizeOf('tension'); return v <= 2 ? { t: n === 4 ? 'the Darkness grows' : `it steps down to D${n === 10 ? 8 : n === 8 ? 6 : 4}`, tone: 'bad' } : { t: 'nothing stirs', tone: 'good' }; }
      case 'enc': { if (corridor == null) return { t: `${v}: a fight on 10+ in a room, 15+ in a corridor` }; const need = corridor ? 15 : 10; return v >= need ? { t: 'a fight comes', tone: 'bad' } : { t: 'no fight here', tone: 'good' }; }
      case 'table': return { t: v <= 3 ? 'Table A' : 'Table B' };
      case 'which': { if (vals.enc != null && corridor != null && vals.enc < (corridor ? 15 : 10)) return { t: 'not needed: no fight' }; return { t: encounterFor(d.n, vals.table || 1, v).name, tone: 'bad' }; }
      case 'event': return { t: first(look('events', v)?.text) };
      case 'loot': { const r = SCAVENGE.find((x) => v >= x.lo && v <= x.hi); return { t: vals.check != null && T('check') != null && vals.check > T('check') ? 'not needed: the search failed' : first(r?.t) }; }
      case 'isdoor': return { t: v <= 5 ? 'a door' : 'an open archway' };
      case 'diff': { const [nm, m] = DIFFICULTY[v] || ['Normal', 0]; return { t: `${nm} (${m > 0 ? '+' : ''}${m})` }; }
      case 'per': { if (hint.look === false) return { t: 'not used' }; if (vals.diff == null || T('per') == null) return { t: 'read with the Difficulty, next' }; return vsSkill(v, Math.max(0, T('per') + (DIFFICULTY[vals.diff]?.[1] || 0))); }
      case 'trap': return v >= 7 ? { t: 'trapped', tone: 'bad' } : { t: 'no trap', tone: 'good' };
      case 'trapRow': return vals.trap != null && vals.trap < 7 ? { t: 'not needed: no trap' } : { t: first(TRAPS[v - 1]?.t, 70), tone: 'bad' };
      case 'lock': return v >= (keys.includes('found') ? 10 : 12) ? { t: 'locked', tone: 'warn' } : { t: 'not locked', tone: 'good' };
      case 'found': return v <= 5 ? { t: 'empty', tone: 'bad' } : { t: 'something inside', tone: 'good' };
      case 'me': {
        const r = vsSkill(v, T('me')); if (!r) return null;
        if (vals.foe == null || T('foe') == null) return r;
        const w = E.opposedResult(v, T('me'), vals.foe, T('foe')).winner;
        if (attack) return w === 'att' ? { t: `${r.t}: you hit`, tone: 'good' } : w === 'def' ? { t: `${r.t}: they fend you off`, tone: 'bad' } : { t: `${r.t}: both fail, it takes 1 damage`, tone: 'warn' };
        if (hint.sneak) return w === 'att' ? { t: `${r.t}: you take them unawares`, tone: 'good' } : { t: `${r.t}: they hear you coming`, tone: 'bad' };
        return w === 'att' ? { t: `${r.t}: you act first`, tone: 'good' } : { t: `${r.t}: they act first`, tone: 'bad' };
      }
      case 'foe': return T('foe') == null ? null : v <= T('foe') ? { t: `their success (they needed ${T('foe')})` } : { t: `their failure (they needed ${T('foe')})` };
      case 'loc': { if (attack && hit && hit !== 'att') return { t: 'not needed: no hit' }; const s = E.foeStat(game); if (!attack || !s) return null; const l = hitLocation(s.anatomy, v, s.weak); return { t: `the ${l.name}${l.weak ? ': its Weak Spot, a Critical Strike' : ''}`, tone: l.weak ? 'good' : '' }; }
      case 'dmg': return attack && hit && hit !== 'att' ? { t: 'not needed: no hit' } : { t: `${v} on the die, before Armor` };
      case 'avoid': return vsSkill(v, T('avoid'));
      case 'rot': return vsSkill(v, T('rot'));
      case 'end': return vsSkill(v, T('end'));
      case 'camp': return { t: `${v}, plus your preparations: 12 or more is safe` };
      default: return null;
    }
  };
  return plan.defs.map(([k]) => one(k, vals[k]));
}
