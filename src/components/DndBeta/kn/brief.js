// What a throw is for, said before the dice leave your hand: each die, what it decides, and the result you need.
// The play screen shows this as the roll prompt, and the result keeps it (entry.need) in the scroll and the Chronicle.
import * as E from './engine';
import { CREATURES, TRAPS } from './tables';

const dieOf = (d) => (d === 'd100' ? 'd100' : d);

export function brief(plan, game, hint = {}) {
  const h = game.hero, p = E.here(game), d = game.domain, cb = game.combat;
  const keys = plan.defs.map(([k]) => k);
  const lines = [];
  const add = (die, what, need) => lines.push({ die: dieOf(die), what, need });
  const skillLine = (name, bonus = 0) => {
    const s = Math.max(0, E.skillOf(h, name) + bonus);
    const adv = (h.mods?.advantage || []).includes(name), dis = E.exhTier(h) >= 2;
    return `${s} or less${adv && !dis ? ' (with Advantage)' : ''}${dis && !adv ? ' (with Disadvantage)' : ''}${s === 0 ? ': it cannot succeed' : ''}`;
  };
  for (const [k, die] of plan.defs) {
    const n = Number(String(die).slice(1));
    switch (k) {
      case 'shape': add(die, 'Room or corridor', '1-25 a corridor, 26-100 a room'); break;
      case 'check':
        if (keys.includes('shape')) add(die, d.lairFound ? 'Exit Die' : 'Lair Die', n === 4 ? `1-2 and you have found ${d.lairFound ? 'the way out' : 'the lair'}` : '1-2 steps it down');
        else add(die, hint.skill || 'Check', skillLine(hint.skill || 'Perception', hint.bonus || 0));
        break;
      case 'tension': add(die, 'Tension Die', n === 4 ? '1-2 and the Darkness grows' : '3 or more keeps you unnoticed'); break;
      case 'enc': add(die, 'Combat Encounter', '10+ in a room or 15+ in a corridor brings a fight'); break;
      case 'event': add(die, 'Events table', 'whatever it lands on happens'); break;
      case 'loot': add(die, 'Scavenging table', 'read only if the search succeeds'); break;
      case 'me':
        if (keys.includes('loc')) { const o = E.attackOdds(game, cb?.target); if (keys.includes('act')) add('d100', 'Your defence', `${Math.max(E.skillOf(h, 'Dodge'), h.weapons[h.wield].parry ? E.skillOf(h, h.weapons[h.wield].skill) : 0)} or less`); else add('d100', 'Your attack', `${o?.mine ?? '?'} or less, and higher than theirs`); }
        else add('d100', 'Your Perception', `${skillLine('Perception')}, and higher than theirs`);
        break;
      case 'foe':
        if (keys.includes('loc')) { const o = E.attackOdds(game, cb?.target); add('d100', keys.includes('act') ? 'Their attack' : 'Their defence', keys.includes('act') ? 'they hit if theirs wins' : `they fend you off on ${o?.theirs ?? '?'} or less`); }
        else add('d100', 'Their Mind', `${CREATURES[p.enc?.name]?.mind ?? '?'} or less`);
        break;
      case 'loc': add(die, 'Hit location', '19-20 is the Weak Spot: a Critical Strike'); break;
      case 'dmg': add(die, 'Damage', keys.includes('act') ? 'their damage die' : `your ${h.weapons[h.wield].dmg.toUpperCase()}${h.weapons[h.wield].bonus ? ` and ${h.weapons[h.wield].bonus.toUpperCase()}` : ''}: you keep the best`); break;
      case 'act': add(die, 'What it does', 'its D6 table of actions'); break;
      case 'isdoor': add(die, 'Is there a door?', '1-5 a door, 6-10 an open archway'); break;
      case 'per': add('d100', 'Perception', hint.look === false ? 'not used: you are not looking' : `${skillLine('Perception')}, moved by the Difficulty`); break;
      case 'diff': add(die, 'Difficulty', '1 Child\'s play to 8 Impossible'); break;
      case 'trap': add(die, 'Trapped?', '7+ means it is trapped'); break;
      case 'trapRow': add(die, 'Which trap', 'read only if it is trapped'); break;
      case 'lock': add(die, 'Locked?', '12+ means it is locked'); break;
      case 'avoid': { const t = TRAPS[(hint.trap || 1) - 1]; add('d100', `${t.avoid} to avoid it`, skillLine(t.avoid, hint.knew ? 20 : 0)); break; }
      case 'camp': add(die, 'Camp Check', `${hint.need || 12} or more`); break;
      default: add(die, k, '');
    }
  }
  return { title: hint.title || 'A roll', why: hint.why || '', lines };
}
