// The play screen. Top: your survivor at a glance (every number explains itself on hover or tap). Middle: the scroll,
// with the place, the small map and your body beside it on a wide screen. Bottom: what you can do now, each action
// illustrated and saying what it costs. In a fight the bottom becomes the fight: the creatures, your odds, your moves.
import React, { useEffect, useMemo, useState } from 'react';
import * as E from '../kn/engine';
import { CREATURES, overseerImg } from '../kn/tables';
import { GLOSSARY } from '../kn/glossary';
import Ico from '../ui/Ico';
import { Tip, Term, Rich } from '../ui/Tip';
import { Action, Bar, Medallion, Sheet, Switch, Panel } from '../ui/Bits';
import { Silhouette } from '../ui/Figures';
import Journal, { PageChip } from './Journal';
import MapView from './MapView';
import { MonsterCard } from './MonsterCard';
import DoorSheet from './DoorSheet';

const DIR = ['north', 'east', 'south', 'west'];
// wide screens put the actions beside the scroll; phones stack them below
function useWide(px = 1000) {
  const q = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(`(min-width: ${px}px)`) : null;
  const [wide, setWide] = useState(() => Boolean(q?.matches));
  useEffect(() => { if (!q) return undefined; const f = () => setWide(q.matches); q.addEventListener?.('change', f); return () => q.removeEventListener?.('change', f); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return wide;
}
const EXH = ['No effect yet. At 11 you heal only half of every Wound.', 'You heal half of every Wound (rounded up). At 16, Disadvantage on every check.', 'Disadvantage on every check. At 21 you die.', 'Fatal.'];

// the chance of each outcome of an opposed attack, counted over every pair of D100 rolls
function oddsOf(mine, theirs) {
  let a = 0, d = 0, n = 0;
  for (let x = 1; x <= 100; x++) for (let y = 1; y <= 100; y++) { const r = E.opposedResult(x, mine, y, theirs); if (r.aFumble) { /* fumble */ } else if (r.winner === 'att') a++; else if (r.winner === 'def') d++; else n++; }
  return { hit: Math.round(a / 100), fended: Math.round(d / 100), both: Math.round(n / 100), fumble: 100 - Math.round(a / 100) - Math.round(d / 100) - Math.round(n / 100) };
}

export const CHECK_INFO = {
  Resolve: { icon: 'brain', use: 'Holding your nerve: against Frightening foes, horrors and anything that would cost Sanity.' },
  Endurance: { icon: 'heart', use: 'Your body against poison, infection, cold, fatigue and raw food.' },
  Spellward: { icon: 'spark', use: 'Resisting spells and anything supernatural.' },
  Dodge: { icon: 'run', use: 'Getting out of the way of falling stone, traps and blows. Also how you flee a fight.' },
  Perception: { icon: 'eye', use: 'Seeing, hearing, sensing: noticing what is hidden, and your Initiative.' },
  Stealth: { icon: 'ghost', use: 'Staying unseen and unheard.' },
  Reason: { icon: 'tome', use: 'Reading signs, symbols and inscriptions; working out puzzles.' },
  Athletics: { icon: 'hand', use: 'Climbing, lifting, jumping, sprinting, breaking a grip.' },
  Acrobatics: { icon: 'run', use: 'Balancing, swinging, rolling under a closing gate.' },
  Medicine: { icon: 'bandage', use: 'Tending wounds with a Bandage; identifying potions.' },
  Thievery: { icon: 'lock', use: 'Picking locks and disarming traps.' },
  weapon: { icon: 'sword', use: 'Your weapon Skill: some events ask for a check with it.' },
};

// ---------------------------------------------------------------------------------------------------------------
export function Hud({ game, onAdjust, onHero, onMap, onHere }) {
  const h = game.hero, v = h.vit, d = game.domain;
  const vit = [
    ['health', 'Health', 'heart', v.health, v.maxHealth, `${v.health} of ${v.maxHealth}. At 0 you die.`],
    ['tough', 'Toughness', 'shield', v.tough, v.maxTough, `${v.tough} of ${v.maxTough} before damage reaches Health.`],
    ['aether', 'Aether', 'spark', v.aether, v.maxAether, `${v.aether} of ${v.maxAether}; full again in the next room.`],
    ['sanity', 'Sanity', 'brain', v.sanity, v.maxSanity, `${v.sanity} of ${v.maxSanity}. Your Resolve is ${h.resist.Resolve}.`],
    ['light', 'Light', 'torch', v.light, 20, `${v.light} room${v.light === 1 ? '' : 's'} of light left. ${h.items.torches} spare Torch${h.items.torches === 1 ? '' : 'es'}.`],
    ['exh', 'Exhaustion', 'hourglass', v.exh, 25, `${v.exh}: ${EXH[E.exhTier(h)]}`],
  ];
  const tensionPct = Math.round((2 / d.tension) * 100);
  return (
    <header className="dbt-hud">
      <button type="button" className="dbt-hud-who" onClick={onHero} aria-label={`${h.name}: open the character sheet`}>
        <Medallion src={h.avatar} name={h.name} size={52} />
        <span className="t"><b>{h.name}</b><small>Level {h.level} · {v.xp} XP</small><Bar value={v.xp % 1000} max={1000} tone="gilt" thin /></span>
      </button>
      <div className="dbt-vitals">
        {vit.map(([k, label, ic, n, max, live]) => (
          <Tip key={k} as="button" type="button" className={`dbt-vit v-${k} ${k === 'exh' ? `t${E.exhTier(h)}` : ''} ${n / max <= 0.25 && k !== 'exh' ? 'low' : ''}`} tip={{ title: label, icon: ic, live, ...GLOSSARY[label] }} onClick={() => onAdjust(k)}>
            <Ico n={ic} size={16} /><b>{n}</b><small>{label === 'Exhaustion' ? 'Exh.' : label === 'Toughness' ? 'Tough' : label}</small><Bar value={k === 'exh' ? max - n : n} max={max} tone={k === 'light' ? 'gilt' : k === 'aether' ? 'blue' : k === 'exh' ? 'warn' : 'ox'} thin />
          </Tip>
        ))}
      </div>
      <div className="dbt-hud-chips">
        <Tip as="button" type="button" className="dbt-chip gilt" tip={{ title: `Domain ${d.n}: ${d.overseer.name}`, icon: 'star', body: `Influence (D10 ${d.overseer.roll}): ${d.overseer.influence}`, page: 100, extra: <img className="dbt-tip-img" src={overseerImg(d.overseer.name)} alt={d.overseer.name} /> }}><Ico n="star" size={14} />Domain {d.n}</Tip>
        <Tip as="button" type="button" className={`dbt-chip ${d.tension <= 4 ? 'bad' : d.tension <= 6 ? 'warn' : ''}`} tip={{ title: 'Tension Die', icon: 'eye', live: `D${d.tension} now: a ${tensionPct}% chance it steps down when you next move.${d.tension === 4 ? ' On the D4 that means Growing Darkness.' : ''}`, ...GLOSSARY['Tension Die'] }}><Ico n="eye" size={14} />Tension D{d.tension}</Tip>
        {!d.lairFound ? <Tip as="button" type="button" className="dbt-chip" tip={{ title: 'Lair Die', icon: 'star', live: `D${d.lair}. ${d.rooms} of 15 rooms explored.`, ...GLOSSARY['Lair Die'] }}>Lair D{d.lair}</Tip>
          : <Tip as="button" type="button" className="dbt-chip" tip={{ title: 'Exit Die', icon: 'stairs', live: d.exitFound ? 'The way out is found.' : `D${d.exit}.`, ...GLOSSARY['Exit Die'] }}><Ico n="stairs" size={14} />{d.exitFound ? 'Exit found' : `Exit D${d.exit}`}</Tip>}
        {d.darkness.length > 0 && <Tip as="button" type="button" className="dbt-chip bad" tip={{ title: 'Growing Darkness in this Domain', icon: 'eye', body: d.darkness.map((x) => `D100 ${x.roll}: ${x.text}`).join(' '), page: 120 }}>Darkness ×{d.darkness.length}</Tip>}
        {h.effects.map((e) => <Tip key={e.name} as="button" type="button" className="dbt-chip bad" tip={{ title: `${e.name}${e.n > 1 ? ` (${e.n})` : ''}`, icon: 'drop', ...(GLOSSARY[e.name] || {}) }}><Ico n="drop" size={14} />{e.name}{e.n > 1 ? ` ${e.n}` : ''}</Tip>)}
        <span className="sp" />
        <button type="button" className="dbt-chip icon only-mobile" onClick={onHere} aria-label="This place"><Ico n="door" size={16} /></button>
        <button type="button" className="dbt-chip icon only-mobile" onClick={onMap} aria-label="Open the map"><Ico n="map" size={16} /> Map</button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------------------------------------------
export function PlaceCard({ game, onPage, onDoor, onMove }) {
  const p = E.here(game); const camp = E.campRating(game, p);
  const status = p.enc ? ['bad', 'swords', `${p.enc.name} here`] : p.lair ? ['bad', 'star', "The Overseer's lair"] : p.cleared ? ['ok', 'check', 'Quiet'] : ['', 'eye', 'Unsettled'];
  return (
    <Panel plate={p.title || 'Here'} icon={p.kind === 'corridor' ? 'run' : 'door'} className="dbt-place">
      <p className="dbt-fell"><Rich text={p.desc?.text} /></p>
      <div className="dbt-chiprow">
        <span className={`dbt-chip ${status[0]}`}><Ico n={status[1]} size={14} />{status[2]}</span>
        <Tip as="span" className={`dbt-chip ${p.searched ? '' : 'gilt'}`} tip={{ title: 'Scavenge', ...GLOSSARY.Scavenge }}><Ico n="search" size={14} />{p.searched ? 'Searched' : 'Not searched'}</Tip>
        {camp > 0 && <Tip as="span" className="dbt-chip ok" tip={{ title: 'A place to camp', icon: 'tent', body: camp === 2 ? 'Cleared, with only one way in: the best place to make camp.' : 'Cleared, with two ways in: a fair place to make camp.', page: 123 }}><Ico n="tent" size={14} />{camp === 2 ? 'Good camp' : 'Fair camp'}</Tip>}
        {p.desc?.page && <PageChip page={p.desc.page} onPage={onPage} />}
      </div>
      <Exits game={game} onDoor={onDoor} onMove={onMove} small />
    </Panel>
  );
}
function Exits({ game, onDoor, onMove, small }) {
  const p = E.here(game);
  const list = p.doors.filter((d) => !d.blocked).map((d) => {
    const to = d.to ? E.pieceById(game, d.to) : null;
    const state = d.kind === 'arch' ? 'an open archway' : d.kind === 'door' ? `${d.spotted ? 'trapped, ' : ''}${d.locked ? 'locked' : d.open ? 'open' : 'closed'}` : 'unexplored';
    return { d, to, title: to ? `Back to ${to.title || 'the last room'}` : `The ${DIR[d.dir]} way`, sub: to ? 'Retrace your steps: a Tension roll, no encounter' : `${state[0].toUpperCase()}${state.slice(1)}: ${d.kind ? 'tap to deal with it' : 'is there a door? a trap? a lock?'}` };
  });
  if (!list.length) return <p className="dbt-note">No way on from here.</p>;
  return (
    <div className={`dbt-exits ${small ? 'small' : ''}`}>
      {list.map(({ d, to, title, sub }) => <Action key={d.id} compact={small} icon={to ? 'back' : 'doorq'} title={title} sub={small ? null : sub} tone={to ? '' : 'gilt'} onClick={() => (to ? onMove(to.id) : onDoor(d.id))} tip={{ title, body: sub, page: to ? 99 : 98 }} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
export function ChecksSheet({ open, onClose, game, roll, busy }) {
  const h = game.hero, p = E.here(game);
  const evt = p.event?.roll && !p.event.done ? p.event : null;
  const asked = evt ? E.eventChecks(evt.text) : [];
  const names = ['Resolve', 'Endurance', 'Spellward', 'Dodge', 'Perception', 'Stealth', 'Reason', 'Athletics', 'Acrobatics', 'Medicine', 'Thievery'];
  const dis = E.exhTier(h) >= 2;
  const row = (n, isAsked) => {
    const label = n === 'weapon' ? h.weapons[h.wield].skill : n; const score = E.skillOf(h, label); const info = CHECK_INFO[n];
    const adv = (h.mods?.advantage || []).includes(label);
    return (
      <div key={n} className={`dbt-checkrow ${isAsked ? 'asked' : ''}`}>
        <span className="dbt-roundel sm"><Ico n={info.icon} size={18} /></span>
        <div className="t"><b><Term name={label}>{label}</Term> <span className="score">{score}%</span>{adv && <Term name="Advantage"><em className="dbt-chip ok sm">Advantage</em></Term>}{dis && <Term name="Disadvantage"><em className="dbt-chip bad sm">Disadvantage</em></Term>}</b>
          <small>{info.use}</small>{score === 0 && <small className="warn">At 0 this check cannot succeed.</small>}</div>
        <button type="button" className="dbt-btn sm primary" disabled={busy} onClick={() => roll(n, isAsked ? 'the event asks for it' : '')}>Roll</button>
      </div>
    );
  };
  return (
    <Sheet open={open} onClose={onClose} title="Test yourself" icon="d20">
      {evt ? (
        <div className="dbt-callout"><b><Ico n="scroll" size={16} /> The event</b><p className="dbt-fell"><Rich text={evt.text} /></p>
          {asked.length ? <p className="dbt-note">It asks for {asked.map((a) => (a === 'weapon' ? 'a weapon Skill' : a)).join(' and ')} {asked.length > 1 ? 'checks' : 'check'}: they are first below.</p> : <p className="dbt-note">It names no check: settle it as it says, then mark it settled.</p>}</div>
      ) : <div className="dbt-callout"><p className="dbt-note">Nothing here calls for a check right now. The book only asks for one when something is at stake and the result is not obvious (p. 69), so roll only if you are attempting something.</p></div>}
      {asked.length > 0 && <h4 className="dbt-sub">Asked for now</h4>}
      {asked.map((n) => row(n, true))}
      <h4 className="dbt-sub">{asked.length ? 'Other checks' : 'Your checks'}</h4>
      {names.filter((n) => !asked.includes(n)).map((n) => row(n, false))}
    </Sheet>
  );
}

function CampSheet({ open, game, onClose, onCamp }) {
  const h = game.hero; const p = E.here(game);
  const [bar, setBar] = useState(0); const [sleep, setSleep] = useState(true);
  const mod = bar * 5 + (sleep ? 2 : 0); const need = Math.max(1, 12 - mod); const chance = Math.max(0, Math.min(100, Math.round(((21 - need) / 20) * 100)));
  const rating = E.campRating(game, p);
  return (
    <Sheet open={open} onClose={onClose} title="Set camp" icon="tent">
      <div className="dbt-callout"><p className="dbt-note">{rating === 2 ? 'A good spot: cleared, with one way in.' : rating === 1 ? 'A fair spot: cleared, two ways in.' : 'Not a sensible spot: too many ways in, or not cleared.'} Camp uses one Ration; without one, everything you recover is halved. The Camp Check is a D20 and 12 or more is a safe night (pp. 123-125).</p></div>
      <div className="dbt-campgrid">
        <div className="dbt-checkrow"><span className="dbt-roundel sm"><Ico n="chain" size={18} /></span><div className="t"><b><Term name="Crafting Supplies">Barricade</Term></b><small>1 Crafting Supplies each: +1 Exhaustion, +5 to the check. You have {h.items.crafting}.</small></div>
          <div className="dbt-step"><button type="button" onClick={() => setBar(Math.max(0, bar - 1))} aria-label="Less">−</button><b>{bar}</b><button type="button" onClick={() => setBar(Math.min(h.items.crafting, bar + 1))} aria-label="More">+</button></div></div>
        <Switch id="dbt-sleep" checked={sleep} onChange={setSleep} label="Sleep" sub="Nothing else but rest: −5 Exhaustion, +1 Health, +2 to the check" />
      </div>
      <div className="dbt-campmeter"><span>Needs {need}+ on the D20</span><Bar value={chance} max={100} tone="ok" /><b>{chance}% safe</b></div>
      <p className="dbt-note">Rations {h.items.rations}. Cooking, crafting, repairs and attuning are not in the beta yet.</p>
      <div className="dbt-row"><button type="button" className="dbt-btn ghost" onClick={onClose}>Not yet</button><button type="button" className="dbt-btn primary" onClick={() => { onClose(); onCamp({ barricade: bar, sleep }); }}><Ico n="tent" size={18} /> Roll the Camp Check</button></div>
    </Sheet>
  );
}

export function AdjustSheet({ field, game, onClose, commit }) {
  const labels = { health: 'Health', tough: 'Toughness', aether: 'Aether', sanity: 'Sanity', light: 'Light', exh: 'Exhaustion' };
  if (!field) return null; const v = game.hero.vit[field];
  return (
    <Sheet open onClose={onClose} title={`${labels[field]}: ${v}`} icon="quill">
      <p className="dbt-note">{GLOSSARY[labels[field]]?.body} Adjust it here for anything the book leaves to you: an altar, an event, a potion.</p>
      <div className="dbt-row center">{[-5, -1, 1, 5].map((n) => <button key={n} type="button" className="dbt-btn" onClick={() => commit(E.adjust(game, field, n))}>{n > 0 ? `+${n}` : n}</button>)}</div>
      <div className="dbt-row center"><button type="button" className="dbt-btn ghost" onClick={() => commit(E.adjust(game, 'xp', 10))}>+10 XP</button><button type="button" className="dbt-btn primary" onClick={onClose}>Done</button></div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------------------------------------------
function CombatDock({ game, busy, act, commit, openBestiary }) {
  const cb = game.combat, h = game.hero, p = E.here(game), c = CREATURES[p.enc?.name];
  const [push, setPush] = useState(false);
  const alive = p.enc?.alive || [];
  const target = alive.find((a) => a.id === cb.target) || alive[0];
  const odds = E.attackOdds(game, target?.id);
  const pct = useMemo(() => (odds ? oddsOf(odds.mine, odds.theirs) : null), [odds?.mine, odds?.theirs]); // eslint-disable-line react-hooks/exhaustive-deps
  const w = h.weapons[h.wield];
  const mine = cb.side === 'player' && !cb.lose;
  return (
    <div className="dbt-combat">
      <div className="dbt-combat-top">
        <MonsterCard name={p.enc.name} alive={alive} target={target?.id} onTarget={(id) => commit(E.switchTarget(game, id))} compact lastHit={cb.lastHit} />
        <div className="dbt-you">
          <Silhouette armor={h.armor} wounds={h.wounds || []} highlight={cb.lastHit?.by === 'them' ? cb.lastHit.loc : null} label="Where you have been hit" className="you" />
          <small>You</small>
        </div>
      </div>
      {!cb.initiative ? (
        <div className="dbt-row"><Action icon="eye" title="Roll Initiative" sub={`Your Perception ${E.skillOf(h, 'Perception')} against their Mind ${c.mind}`} tone="primary" onClick={() => act(E.initiativePlan(), (f) => E.rollInitiative(game, f), null, { title: 'Initiative' })} tip={{ title: 'Initiative', ...GLOSSARY.Initiative }} /><Action icon="tome" title="Their card" sub="Stats, actions, hit locations" onClick={openBestiary} /></div>
      ) : mine ? (
        <>
          <div className="dbt-odds">
            <Tip tip={{ title: 'Your attack', body: odds.notes.join(' · '), page: 77 }} className="side me"><small>You roll under</small><b>{odds.mine}</b></Tip>
            <div className="mid">{pct && <><span className="ok">Hit {pct.hit}%</span><span>Fended off {pct.fended}%</span><span>Both fail {pct.both}%</span>{pct.fumble > 0 && <span className="bad">Fumble {pct.fumble}%</span>}</>}</div>
            <Tip tip={{ title: `${p.enc.name}: Combat Skill`, body: `${c.combat}${w.speed ? `, less your ${w.name}'s Speed ${w.speed}` : ''}.`, page: 79 }} className="side them"><small>{alive.length > 1 && target ? `No. ${target.n} rolls under` : 'They roll under'}</small><b>{odds.theirs}</b></Tip>
          </div>
          <div className="dbt-weapons">{h.weapons.map((wp, i) => (
            <Tip key={wp.name} as="button" type="button" className={`dbt-weapon ${h.wield === i ? 'on' : ''}`} onClick={() => commit(E.setWield(game, i))}
              tip={{ title: wp.name, body: `${wp.skill} ${E.skillOf(h, wp.skill)}%. Damage ${wp.dmg.toUpperCase()}${wp.bonus ? ` + ${wp.bonus.toUpperCase()} (Mastery)` : ''}, Speed ${wp.speed}${wp.parry ? ', can parry' : ', cannot parry (you Dodge)'}.`, page: 207 }}>
              <Ico n={/pick/i.test(wp.name) ? 'pickaxe' : /fist/i.test(wp.name) ? 'fist' : /dagger/i.test(wp.name) ? 'dagger' : 'cleaver'} size={18} />{wp.name}</Tip>
          ))}<Switch id="dbt-push" checked={push} onChange={setPush} label="Push" sub="+1 damage for 2 Exhaustion" /></div>
          <div className="dbt-dock-grid">
            {cb.restrained && <Action icon="hand" title="Break free" sub={`Athletics ${E.skillOf(h, 'Athletics')}: a Free Action, then attack`} tone="warn" onClick={() => act(E.breakFreePlan(), (f) => E.breakFree(game, f), null, { title: 'Break free', skill: 'Athletics' })} tip={{ title: 'Restrained', ...GLOSSARY.Restrained }} />}
            {cb.restrained && <Action icon="hand" title="Strain free" sub={`Athletics +20, uses your turn`} onClick={() => act(E.breakFreePlan(), (f) => E.breakFree(game, f, { standard: true }), null, { title: 'Strain free', skill: 'Athletics', bonus: 20 })} />}
            <Action icon={/pick/i.test(w.name) ? 'pickaxe' : 'sword'} title={`Strike${target && alive.length > 1 ? ` ${p.enc.name.split(' ')[0]} ${target.n}` : ''}`} sub={`${w.name} · ${w.dmg.toUpperCase()}${w.bonus ? `+${w.bonus.toUpperCase()}` : ''}`} tone="primary" onClick={() => act(E.attackPlan(), (f) => E.playerAttack(game, f, { push, targetId: target?.id }), null, { title: `Strike with the ${w.name}` })} tip={{ title: 'The attack check', body: GLOSSARY['Opposed check'].body, page: 75 }} />
            <Action icon="run" title="Flee" sub={`Dodge ${E.skillOf(h, 'Dodge')}${cb.restrained ? ' -20' : ''}`} disabled={!game.prev} why="There is nowhere to run back to." onClick={() => act(E.fleePlan(), (f) => E.flee(game, f), null, { title: 'Flee', skill: 'Dodge', bonus: cb.restrained ? -20 : 0 })} tip={{ title: 'Flee', ...GLOSSARY.Flee }} />
            <Action icon="tome" title="Their card" sub="Stats, actions, locations" onClick={openBestiary} />
          </div>
        </>
      ) : <div className="dbt-theirturn"><Ico n="hourglass" size={18} /> {alive[cb.enemyIdx || 0] ? `${p.enc.name} ${alive.length > 1 ? alive[cb.enemyIdx || 0].n : ''} acts` : 'Their turn'}{busy ? '...' : ''}</div>}
      <p className="dbt-round">Round {cb.round} · {cb.initiative ? (cb.side === 'player' ? 'your turn' : 'their turn') : 'about to begin'}{cb.reactions ? ` · ${cb.reactions} defence${cb.reactions > 1 ? 's' : ''} this round` : ''}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
function ExploreDock({ game, busy, act, commit, openChecks, openCamp, onDoor, onMove, toast }) {
  const h = game.hero, p = E.here(game), v = h.vit;
  const evt = p.event?.roll && !p.event.done ? p.event : null;
  const asked = evt ? E.eventChecks(evt.text) : [];
  const med = E.skillOf(h, 'Medicine'); const lasting = h.effects.find((e) => E.LASTING.includes(e.name));
  return (
    <div className="dbt-explore">
      {game.over && <div className="dbt-over"><Ico n="skull" size={28} /><div><h3>{game.over === 'mad' ? 'Your mind is gone' : 'You have died'}</h3><p>The necropolis keeps another. Begin a new survivor from Games.</p></div></div>}
      {!game.over && (
        <>
          {(p.event?.pending || evt || p.exit || p.lair) && (
            <div className="dbt-dock-grid feature">
              {p.event?.pending && <Action icon="scroll" title="Roll the Events table" sub="Nothing fights you here: something else happens (D100)" tone="primary" onClick={() => act(E.eventPlan(), (f) => E.resolveEvent(game, f), null, { title: 'The Events table' })} tip={{ title: 'Event', ...GLOSSARY.Event }} />}
              {evt && <Action icon="d20" title="Settle the event" sub={asked.length ? `It asks for ${asked.map((a) => (a === 'weapon' ? 'a weapon Skill' : a)).join(' and ')}` : 'Settle it as it says'} tone="primary" badge={asked.length || null} onClick={openChecks} />}
              {evt && <Action icon="check" title="Event settled" sub="Close it and move on" onClick={() => commit(E.markEvent(game))} />}
              {p.exit && <Action icon="stairs" title="Descend to the next Domain" sub="A new Overseer, the Tension Die back to D8" tone="primary" onClick={() => commit(E.descend(game).state)} />}
              {p.lair && <Action icon="star" title="Overseer defeated" sub="Fight it from the book (pp. 180-198), then mark it" tone="warn" onClick={() => commit(E.overseerDown(game).state)} />}
            </div>
          )}
          <h4 className="dbt-dock-h"><Ico n="door" size={14} /> Ways on</h4>
          <Exits game={game} onDoor={onDoor} onMove={onMove} />
          <h4 className="dbt-dock-h"><Ico n="search" size={14} /> Here</h4>
          <div className="dbt-dock-grid">
            <Action icon="search" title="Search the room" sub={p.searched ? 'Already searched: once per room' : `Scavenge ${E.skillOf(h, 'Scavenge')}%${(h.mods?.advantage || []).includes('Scavenge') ? ' with Advantage' : ''}`} disabled={p.searched || p.lair} why={p.lair ? 'Not in the lair.' : 'Each room can be searched only once (p. 116).'} onClick={() => act(E.scavengePlan(), (f) => E.scavenge(game, f), null, { title: 'Search the room', skill: 'Scavenge' })} tip={!p.searched ? { title: 'Scavenge', ...GLOSSARY.Scavenge } : null} />
            <Action icon="d20" title="Test yourself" sub={asked.length ? 'The event asks for a check' : 'Checks, and what each is for'} badge={asked.length || null} onClick={openChecks} />
            {v.light <= 3 && <Action icon="torch" title="Light a Torch" sub={`${h.items.torches} spare · lasts 20 rooms`} disabled={!h.items.torches} why="You have no spare Torch." onClick={() => commit(E.lightTorch(game).state)} tone={v.light === 0 ? 'warn' : ''} />}
          </div>
          <h4 className="dbt-dock-h"><Ico n="tent" size={14} /> Rest and mend</h4>
          <div className="dbt-dock-grid">
            <Action icon="fire" title="Take a Breather" sub="+D10+2 Toughness · −5 Light · Tension steps down" onClick={() => act(null, () => E.breather(game))} tip={{ title: 'Breather', ...GLOSSARY.Breather }} />
            <Action icon="tent" title="Set camp" sub={`${E.campRating(game, p) === 2 ? 'Good spot' : E.campRating(game, p) === 1 ? 'Fair spot' : 'Poor spot'} · ${h.items.rations} Ration${h.items.rations === 1 ? '' : 's'}`} onClick={openCamp} tip={{ title: 'Camp', ...GLOSSARY.Camp }} />
            <Action icon="bandage" title="Tend your wounds" sub={`Bandage + Medicine ${med}% · D4 Toughness`} disabled={!h.items.bandages || p.tended || med === 0 || v.tough >= v.maxTough} why={!h.items.bandages ? 'You have no Bandages.' : p.tended ? 'Only once per room.' : med === 0 ? 'Your Medicine is 0, so the check cannot succeed: the Bandage would be wasted.' : 'Your Toughness is full.'} onClick={() => act(E.tendPlan(), (f) => E.tend(game, f, { mode: 'heal' }), null, { title: 'Tend your wounds', skill: 'Medicine' })} />
            {lasting && <Action icon="drop" title={`Dress the ${lasting.name.toLowerCase()}`} sub={`Bandage + Medicine ${med}%`} tone="warn" disabled={!h.items.bandages || med === 0} why={!h.items.bandages ? 'You have no Bandages.' : 'Your Medicine is 0, so the check cannot succeed.'} onClick={() => act(E.tendPlan(), (f) => E.tend(game, f, { mode: 'remove' }), null, { title: `Dress the ${lasting.name.toLowerCase()}`, skill: 'Medicine' })} />}
            <Action icon="ration" title="Eat a Ration" sub={`−1 Exhaustion · ${h.items.rations} left`} disabled={!h.items.rations || v.exh === 0} why={!h.items.rations ? 'You have no Rations.' : 'You are not exhausted.'} onClick={() => commit(E.eat(game, 'ration').state)} tip={{ title: 'Ration', ...GLOSSARY.Ration }} />
            {h.items.cooking > 0 && v.exh > 0 && <Action icon="bread" title="Eat it raw" sub={`Cooking Ingredients · Endurance ${h.resist.Endurance}`} onClick={() => commit(E.eat(game, 'cooking').state)} tip={{ title: 'Cooking Ingredients', ...GLOSSARY['Cooking Ingredients'] }} />}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
export default function PlayView({ game, busy, act, commit, trayNode, toast, onPage, voice, onHero, rindewind, pending, onThrow, onCancelRoll }) {
  const h = game.hero, here = E.here(game), cb = game.combat;
  const [adjust, setAdjust] = useState(null);
  const [sheet, setSheet] = useState(null); // checks | camp | map | here | bestiary
  const camps = useMemo(() => { const m = {}; for (const p of game.pieces) { const r = E.campRating(game, p); if (r) m[p.id] = r; } return m; }, [game]);
  const [doorId, setDoorId] = useState(null);
  const go = (id) => act(E.doorPlan(game, here.doors.find((d) => d.id === id)), (f) => E.enterDoor(game, id, f), null, { title: 'Into the unknown' });
  // an unexplored way first goes through the door procedure (is there a door, a trap, a lock); then you go through
  const door = (id) => { if (cb || game.over || busy) return; setSheet(null); const d = here.doors.find((x) => x.id === id); if (d && E.doorReady(d)) go(id); else setDoorId(id); };
  const moveTo = (pid) => { if (cb || game.over || busy) return; const d = here.doors.find((x) => x.to === pid); if (d) { setSheet(null); act(E.doorPlan(game, d), (f) => E.enterDoor(game, d.id, f), null, { title: 'Retracing your steps' }); } else toast('That place is not joined to this one by a door.'); };
  const rollCheck = (name, why) => { setSheet(null); act(E.checkPlan(), (f) => E.skillCheck(game, name, f, why), null, { title: `${name === 'weapon' ? 'Weapon' : name} check`, skill: name === 'weapon' ? game.hero.weapons[game.hero.wield].skill : name, why }); };

  // the creatures' turns run by themselves, one after another
  useEffect(() => {
    if (!cb || game.over || busy) return undefined;
    if (cb.initiative && cb.side === 'enemy') { const t = setTimeout(() => act(E.enemyPlan(), (f) => E.enemyTurn(game, f), null, { auto: true }), 650); return () => clearTimeout(t); }
    if (cb.initiative && cb.side === 'player' && cb.lose) { const t = setTimeout(() => commit({ ...game, combat: { ...cb, lose: false, side: 'enemy', enemyIdx: 0 } }), 500); return () => clearTimeout(t); }
    return undefined;
  }, [cb?.side, cb?.initiative, cb?.round, cb?.enemyIdx, busy, game.over, cb?.lose]); // eslint-disable-line react-hooks/exhaustive-deps

  const wide = useWide();
  const dock = (
    <div className="dbt-dock">
      {cb ? <CombatDock game={game} busy={busy} act={act} commit={commit} openBestiary={() => setSheet('bestiary')} />
        : <ExploreDock game={game} busy={busy} act={act} commit={commit} openChecks={() => setSheet('checks')} openCamp={() => setSheet('camp')} onDoor={door} onMove={moveTo} toast={toast} />}
    </div>
  );
  return (
    <div className={`dbt-play ${cb ? 'fighting' : ''} ${wide ? 'wide' : ''}`}>
      <Hud game={game} onAdjust={setAdjust} onHero={onHero} onMap={() => setSheet('map')} onHere={() => setSheet('here')} />
      <div className="dbt-stage">
        <Journal game={game} onPage={onPage} voice={voice} trayNode={trayNode} pending={pending} onThrow={onThrow} onCancel={onCancelRoll} busy={busy}
          header={<div className="dbt-scroll-title"><b>{here.title || 'Here'}</b><span>{cb ? `Round ${cb.round}` : here.lair ? 'The lair' : here.cleared ? 'Quiet' : ''}</span></div>} />
        {wide && (
          <aside className="dbt-side">
            {!cb && <PlaceCard game={game} onPage={onPage} onDoor={door} onMove={moveTo} />}
            <Panel plate={cb ? 'The fight' : 'What you can do'} icon={cb ? 'swords' : 'hand'} className="dbt-sidedock">{dock}</Panel>
            <MapView game={game} camps={camps} compact onOpen={() => setSheet('map')} height={200} />
            {!cb && <Panel plate="Your body" icon="helm" className="dbt-bodycard">
              <Silhouette armor={h.armor} wounds={h.wounds || []} label="Your hit locations" className="you" />
              <p className="dbt-note">{(h.wounds || []).length ? `${h.wounds.length} hit${h.wounds.length > 1 ? 's' : ''} taken since you last made camp. ` : 'Unhurt since your last camp. '}Tap a location for its D20 range and armour.</p>
            </Panel>}
            {rindewind}
          </aside>
        )}
      </div>
      {!wide && dock}
      <ChecksSheet open={sheet === 'checks'} onClose={() => setSheet(null)} game={game} roll={rollCheck} busy={busy} />
      <CampSheet open={sheet === 'camp'} game={game} onClose={() => setSheet(null)} onCamp={(o) => act(E.campPlan(), (f) => E.setCamp(game, f, o), null, { title: 'Camp Check', need: Math.max(1, 12 - (o.barricade * 5 + (o.sleep ? 2 : 0))) })} />
      <Sheet open={sheet === 'map'} onClose={() => setSheet(null)} title={`Domain ${game.domain.n}`} icon="map" wide className="dbt-mapsheet">
        <MapView game={game} camps={camps} onDoor={door} onMove={moveTo} height="min(68vh, 640px)" />
      </Sheet>
      <Sheet open={sheet === 'here'} onClose={() => setSheet(null)} title="This place" icon="door"><PlaceCard game={game} onPage={onPage} onDoor={door} onMove={moveTo} />
        <Panel plate="Your body" icon="helm" className="dbt-bodycard"><Silhouette armor={h.armor} wounds={h.wounds || []} label="Your hit locations" className="you" /></Panel></Sheet>
      <Sheet open={sheet === 'bestiary'} onClose={() => setSheet(null)} title={here.enc?.name || 'Creature'} icon="skull" wide>{here.enc && <MonsterCard name={here.enc.name} alive={here.enc.alive} target={cb?.target} />}</Sheet>
      <AdjustSheet field={adjust} game={game} onClose={() => setAdjust(null)} commit={commit} />
      {doorId && !cb && <DoorSheet game={game} doorId={doorId} onClose={() => setDoorId(null)} act={act} commit={commit} go={go} reopen={setDoorId} />}
    </div>
  );
}
