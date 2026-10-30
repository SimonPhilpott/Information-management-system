// The play screen. Top: your survivor at a glance (every number explains itself on hover or tap). Middle: the scroll,
// with the place, the small map and your body beside it on a wide screen. Bottom: what you can do now, each action
// illustrated and saying what it costs. In a fight the bottom becomes the fight: the creatures, your odds, your moves.
import React, { useEffect, useMemo, useState } from 'react';
import * as E from '../kn/engine';
import { overseerImg } from '../kn/tables';
import { HIT_TABLES, traitOf } from '../kn/creatures';
import { PackSheet, TraderSheet, LevelSheet, AbilitySheet } from './Pack';
import { StatusStrip } from './Status';
import { has } from '../kn/masteryFx';
import { armourByName } from '../kn/loot';
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
export function Hud({ game, onAdjust, onHero, onMap, onHere, onGo }) {
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
            <Ico n={ic} size={16} /><b>{n}{['health', 'tough', 'aether', 'sanity'].includes(k) && <em className="of">/{max}</em>}</b><small>{label === 'Exhaustion' ? 'Exh.' : label === 'Toughness' ? 'Tough' : label}</small><Bar value={k === 'exh' ? max - n : n} max={max} tone={k === 'light' ? 'gilt' : k === 'aether' ? 'blue' : k === 'exh' ? 'warn' : 'ox'} thin />
          </Tip>
        ))}
      </div>
      <div className="dbt-hud-chips">
        <Tip as="button" type="button" className="dbt-chip gilt" tip={{ title: `Domain ${d.n}: ${d.overseer.name}`, icon: 'star', body: `Influence (D10 ${d.overseer.roll}): ${d.overseer.influence}`, page: 100, extra: <img className="dbt-tip-img" src={overseerImg(d.overseer.name)} alt={d.overseer.name} /> }}><Ico n="star" size={14} />Domain {d.n}</Tip>
        <Tip as="button" type="button" className={`dbt-chip ${d.tension <= 4 ? 'bad' : d.tension <= 6 ? 'warn' : ''}`} tip={{ title: 'Tension Die', icon: 'eye', live: `D${d.tension} now: a ${tensionPct}% chance it steps down when you next move.${d.tension === 4 ? ' On the D4 that means Growing Darkness.' : ''}`, ...GLOSSARY['Tension Die'] }}><Ico n="eye" size={14} />Tension D{d.tension}</Tip>
        {!d.lairFound ? <Tip as="button" type="button" className="dbt-chip" tip={{ title: 'Lair Die', icon: 'star', live: `D${d.lair}. ${d.rooms} of 15 rooms explored.`, ...GLOSSARY['Lair Die'] }}>Lair D{d.lair}</Tip>
          : <Tip as="button" type="button" className="dbt-chip" tip={{ title: 'Exit Die', icon: 'stairs', live: d.exitFound ? 'The way out is found.' : `D${d.exit}.`, ...GLOSSARY['Exit Die'] }}><Ico n="stairs" size={14} />{d.exitFound ? 'Exit found' : `Exit D${d.exit}`}</Tip>}
        <StatusStrip game={game} onGo={onGo} />
        <span className="sp" />
        <Tip as="button" type="button" className="dbt-chip icon only-mobile" onClick={onHere} aria-label="This place" tip={{ title: 'This place', icon: 'door', body: 'What is here, the ways on, and your body.' }}><Ico n="door" size={16} /> Here</Tip>
        <Tip as="button" type="button" className="dbt-chip icon only-mobile" onClick={onMap} aria-label="Open the map" tip={{ title: 'The map', icon: 'map', body: 'The whole Domain as you have found it. Tap a door to go through it, or the target to find yourself.' }}><Ico n="map" size={16} /> Map</Tip>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------------------------------------------
export function PlaceCard({ game, onPage, onDoor, onMove, children, exits = true }) {
  const p = E.here(game); const camp = E.campRating(game, p);
  const status = p.enc ? ['bad', 'swords', `${p.enc.name} here`] : p.lair ? ['bad', 'star', "The Overseer's lair"] : p.cleared ? ['ok', 'check', 'Quiet'] : ['', 'eye', 'Unsettled'];
  return (
    <Panel plate={E.placeName(p)} icon={p.kind === 'corridor' ? 'run' : 'door'} className="dbt-place">
      <p className="dbt-fell"><Rich text={p.desc?.text} /></p>
      <div className="dbt-chiprow">
        <span className={`dbt-chip ${status[0]}`}><Ico n={status[1]} size={14} />{status[2]}</span>
        <Tip as="span" className={`dbt-chip ${p.searched ? '' : 'gilt'}`} tip={{ title: 'Scavenge', ...GLOSSARY.Scavenge }}><Ico n="search" size={14} />{p.searched ? 'Searched' : 'Not searched'}</Tip>
        {camp > 0 && <Tip as="span" className="dbt-chip ok" tip={{ title: 'A place to camp', icon: 'tent', body: camp === 2 ? 'Cleared, with only one way in: the best place to make camp.' : 'Cleared, with two ways in: a fair place to make camp.', page: 123 }}><Ico n="tent" size={14} />{camp === 2 ? 'Good camp' : 'Fair camp'}</Tip>}
        {p.desc?.page && <PageChip page={p.desc.page} onPage={onPage} />}
      </div>
      {exits && <Exits game={game} onDoor={onDoor} onMove={onMove} small />}
      {children}
    </Panel>
  );
}
function Exits({ game, onDoor, onMove, small }) {
  const p = E.here(game);
  const open = p.doors.filter((d) => !d.blocked && !d.to); const nth = (d) => { const same = open.filter((x) => x.dir === d.dir); return same.length > 1 ? ` (${['first', 'second', 'third', 'fourth'][same.indexOf(d)] || same.indexOf(d) + 1})` : ''; };
  const list = p.doors.filter((d) => !d.blocked).map((d) => {
    const to = d.to ? E.pieceById(game, d.to) : null;
    const state = d.kind === 'arch' ? 'an open archway' : d.kind === 'door' ? `${d.spotted ? 'trapped, ' : ''}${d.locked ? 'locked' : d.open ? 'open' : 'closed'}` : 'unexplored';
    return { d, to, title: to ? `Back to ${E.placeName(to)}` : `The ${DIR[d.dir]} way${nth(d)}`, sub: to ? 'Retrace your steps: a Tension roll, no encounter' : `${state[0].toUpperCase()}${state.slice(1)}: ${d.kind ? 'tap to deal with it' : 'is there a door? a trap? a lock?'}` };
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
  const evt = (p.event?.roll || p.event?.asks?.length) && !p.event.done ? p.event : null;
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
  const h = game.hero; const p = E.here(game); const it = h.items;
  const [bar, setBar] = useState(0); const [sleep, setSleep] = useState(false);
  const [n, setN] = useState({ cook: 0, bandages: 0, oil: 0, lockpicks: 0, torches: 0 });
  const [heal, setHeal] = useState([]); const [repair, setRepair] = useState([]); const [attune, setAttune] = useState([]); const [pray, setPray] = useState(false); const [comps, setComps] = useState(0);
  const conds = h.effects.filter((e) => ['Bleeding', 'Poisoned', 'Burning', 'Sickened', 'Cursed', 'Freezing'].includes(e.name)).map((e) => e.name);
  const repairable = [...h.weapons.filter((w) => w.broken).map((w) => ({ id: w.from || w.name, name: w.name })), ...Object.values(h.worn || {}).filter((x) => x?.die && x.die < (armourByName(x.base || x.name)?.integ || 0)).map((x) => ({ id: x.id, name: `${x.name} (D${x.die})` }))];
  const magic = (h.pack || []).filter((x) => x.kind === 'magic' && !x.attuned);
  const crafting = it.crafting || 0;
  const used = bar + n.bandages + n.oil * 2 + n.lockpicks + n.torches + repair.length * 2 + comps;
  const actMod = (has(h, 'Tracker', 3) ? 2 : 0) + (sleep ? 0 : -((n.cook ? 1 : 0) + (n.bandages ? 1 : 0) + (n.oil ? 2 : 0) + (n.lockpicks ? 2 : 0) + (n.torches ? 2 : 0) + (repair.length ? 2 : 0) + (pray ? 1 : 0) + (comps ? 4 : 0)));
  const bedroll = (h.pack || []).some((x) => x.name === 'Bedroll') ? 1 : 0;
  const mod = bar * 5 + (sleep ? 2 : 0) + actMod + bedroll; const need = Math.max(1, 12 - mod); const chance = Math.max(0, Math.min(100, Math.round(((21 - need) / 20) * 100)));
  const rating = E.campRating(game, p);
  const step = (k, max) => (
    <div className="dbt-step"><button type="button" onClick={() => setN({ ...n, [k]: Math.max(0, n[k] - 1) })} aria-label="Less" disabled={sleep}>−</button><b>{n[k]}</b><button type="button" onClick={() => setN({ ...n, [k]: Math.min(max, n[k] + 1) })} aria-label="More" disabled={sleep}>+</button></div>
  );
  const toggle = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const left = crafting - used;
  return (
    <Sheet open={open} onClose={onClose} title="Set camp" icon="tent" wide>
      <div className="dbt-callout"><p className="dbt-note">{rating === 2 ? 'A good spot: cleared, with one way in.' : rating === 1 ? 'A fair spot: cleared, two ways in.' : 'Not a sensible spot: too many ways in, or not cleared.'} Camp eats one Ration; without one, everything you recover is halved. The Camp Check is a D20: 12 or more is a safe night (pp. 123-125). You recover all Toughness, 1 Health, D4 Sanity and 10 Exhaustion, improve the Skills you marked, and the Rot (if you carry it) tests you.</p></div>
      <div className="dbt-campgrid">
        <div className="dbt-checkrow"><span className="dbt-roundel sm"><Ico n="chain" size={18} /></span><div className="t"><b><Term name="Crafting Supplies">Barricade</Term></b><small>1 Crafting Supplies each: +1 Exhaustion, +5 to the check.</small></div>
          <div className="dbt-step"><button type="button" onClick={() => setBar(Math.max(0, bar - 1))} aria-label="Less">−</button><b>{bar}</b><button type="button" onClick={() => setBar(Math.min(bar + left, bar + 1))} aria-label="More" disabled={left <= 0}>+</button></div></div>
        <Switch id="dbt-sleep" checked={sleep} onChange={setSleep} label="Sleep" sub="Nothing else but rest (Barricade allowed): −5 Exhaustion, +1 Health, +2 to the check" />
        <div className="dbt-checkrow"><span className="dbt-roundel sm"><Ico n="bread" size={18} /></span><div className="t"><b>Cooking</b><small>Each Cooking Ingredient becomes a Ration. +1 Exhaustion, −1 to the check. You have {it.cooking || 0}.</small></div>{step('cook', it.cooking || 0)}</div>
        {[['bandages', 'Craft Bandages', 'bandage', 1, '−1'], ['torches', 'Craft Torches', 'torch', 1, '−2'], ['lockpicks', 'Craft Lockpicks', 'lock', 1, '−2'], ['oil', 'Craft Lamp Oil', 'drop', 2, '−2']].map(([k, label, ic, per, pen]) => (
          <div key={k} className="dbt-checkrow"><span className="dbt-roundel sm"><Ico n={ic} size={18} /></span><div className="t"><b>{label}</b><small>{per} Crafting Supplies each. +1 Exhaustion, {pen} to the check.</small></div>{step(k, n[k] + Math.floor(left / per))}</div>
        ))}
        {has(h, 'Emissary') && <Switch id="dbt-pray" checked={pray} onChange={setPray} label="Pray (Emissary)" sub="Heal D4 Sanity; +2 Exhaustion; −1 to the check" />}
        {has(h, 'Ritualist') && <div className="dbt-checkrow"><span className="dbt-roundel sm"><Ico n="vial" size={18} /></span><div className="t"><b>Prepare Components (Ritualist)</b><small>Each Crafting Supplies becomes a Ritual Component. −4 to the check. You have {it.ritual || 0} Components.</small></div>
          <div className="dbt-step"><button type="button" onClick={() => setComps(Math.max(0, comps - 1))} aria-label="Less" disabled={sleep}>−</button><b>{comps}</b><button type="button" onClick={() => setComps(Math.min(comps + left, comps + 1))} aria-label="More" disabled={sleep || left <= 0}>+</button></div></div>}
        {conds.length > 0 && <div className="dbt-checkrow"><span className="dbt-roundel sm"><Ico n="drop" size={18} /></span><div className="t"><b>Heal Condition</b><small>1 Bandage and 1 Exhaustion each, no Medicine check. You have {it.bandages || 0} Bandages.</small>
          <span className="chips">{conds.map((c) => <button key={c} type="button" className={`dbt-chip ${heal.includes(c) ? 'ok' : ''}`} disabled={sleep} onClick={() => toggle(heal, setHeal, c)}>{c}</button>)}</span></div></div>}
        {repairable.length > 0 && <div className="dbt-checkrow"><span className="dbt-roundel sm"><Ico n="pickaxe" size={18} /></span><div className="t"><b>Repair</b><small>2 Crafting Supplies a piece: +1 Integrity step, Acid damage mended. +2 Exhaustion, −2 to the check.</small>
          <span className="chips">{repairable.map((r) => <button key={r.id} type="button" className={`dbt-chip ${repair.includes(r.id) ? 'ok' : ''}`} disabled={sleep || (!repair.includes(r.id) && left < 2)} onClick={() => toggle(repair, setRepair, r.id)}>{r.name}</button>)}</span></div></div>}
        {magic.length > 0 && <div className="dbt-checkrow"><span className="dbt-roundel sm"><Ico n="spark" size={18} /></span><div className="t"><b>Attune</b><small>An Attunement Crystal and 1 Exhaustion each: learn and wake its Magic Properties. You have {it.crystals || 0} Crystals.</small>
          <span className="chips">{magic.map((x) => <button key={x.id} type="button" className={`dbt-chip ${attune.includes(x.id) ? 'ok' : ''}`} disabled={sleep || (!attune.includes(x.id) && attune.length >= (it.crystals || 0))} onClick={() => toggle(attune, setAttune, x.id)}>{x.name}</button>)}</span></div></div>}
      </div>
      <div className="dbt-campmeter"><span>Needs {need}+ on the D20{bedroll ? ' (Bedroll +1)' : ''}</span><Bar value={chance} max={100} tone="ok" /><b>{chance}% safe</b></div>
      <p className="dbt-note">Rations {it.rations}{n.cook ? ` (+${n.cook} cooked first)` : ''}. Crafting Supplies {crafting}, {Math.max(0, left)} left after these plans.</p>
      <div className="dbt-row"><button type="button" className="dbt-btn ghost" onClick={onClose}>Not yet</button><button type="button" className="dbt-btn primary" onClick={() => { onClose(); onCamp({ barricade: bar, sleep, ...(sleep ? {} : { ...n, heal, repair, attune, pray, components: comps }) }, need); setPray(false); setComps(0); setN({ cook: 0, bandages: 0, oil: 0, lockpicks: 0, torches: 0 }); setHeal([]); setRepair([]); setAttune([]); }}><Ico n="tent" size={18} /> Roll the Camp Check</button></div>
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
function CombatDock({ game, busy, act, commit, openBestiary, openSheet }) {
  const cb = game.combat, h = game.hero, p = E.here(game), c = E.foeStat(game);
  const [push, setPush] = useState(false); const [aim, setAim] = useState('');
  const alive = p.enc?.alive || [];
  const target = alive.find((a) => a.id === cb.target) || alive[0];
  const odds = E.attackOdds(game, target?.id, { aim: aim || null });
  const ts = target ? E.foeStat(game, target) : c; const locs = HIT_TABLES[ts?.anatomy] || null;
  const burning = h.effects.some((e) => e.name === 'Burning'); const hasAbilities = (h.masteries || []).length > 0; const usable = (h.pack || []).some((x) => ['potion', 'fragment', 'vial'].includes(x.kind));
  const pct = useMemo(() => (odds ? oddsOf(odds.mine, odds.theirs) : null), [odds?.mine, odds?.theirs]); // eslint-disable-line react-hooks/exhaustive-deps
  const w = h.weapons[h.wield];
  const mine = cb.side === 'player' && !cb.lose;
  return (
    <div className="dbt-combat">
      <div className="dbt-combat-top">
        <MonsterCard name={p.enc.name} alive={alive} target={target?.id} onTarget={(id) => commit(E.switchTarget(game, id))} compact lastHit={cb.lastHit} stat={c} statOf={(a) => E.foeStat(game, a)} />
        <div className="dbt-you">
          <Silhouette hero={h} armor={h.armor} wounds={h.wounds || []} highlight={cb.lastHit?.by === 'them' ? cb.lastHit.loc : null} label="Where you have been hit" className="you" />
          <small>You</small>
        </div>
      </div>
      {!cb.initiative ? (
        <div className="dbt-dock-grid"><Action icon="eye" title="Roll Initiative" sub={`Your Perception ${E.skillOf(h, 'Perception')} against their Mind ${c.mind}`} tone="primary" onClick={() => act(E.initiativePlan(), (f) => E.rollInitiative(game, f), null, { title: 'Initiative' })} tip={{ title: 'Initiative', ...GLOSSARY.Initiative }} />
          {hasAbilities && <Action icon="spark" title="An Ability first" sub={has(h, 'Wrathspawn', 4) ? 'Charge before Initiative, or another Ability' : 'Ready a Reaction, or act before Initiative'} onClick={() => openSheet('abilities')} />}
          {!cb.surprised && <Action icon="ghost" title="Ambush them" sub={traitOf(c, 'Alert') ? 'It is Alert: it cannot be surprised' : `Stealth ${E.skillOf(h, 'Stealth')} against their Mind ${c.mind}: win and strike first at +20`} disabled={Boolean(traitOf(c, 'Alert'))} why="Alert creatures cannot be surprised (p. 132)." onClick={() => act(E.sneakPlan(), (f) => E.sneakAttack(game, f), null, { title: 'Ambush', sneak: true })} tip={{ title: 'Surprise', body: 'Stealth opposed by their Mind. Win and you take the Initiative with +20 to your first attack; lose and they act first.', page: 76 }} />}
          <Action icon="tome" title="Their card" sub="Stats, actions, hit locations" onClick={openBestiary} /></div>
      ) : mine ? (
        <>
          <div className="dbt-odds">
            <Tip tip={{ title: 'Your attack', body: odds.notes.join(' · '), page: 77 }} className="side me"><small>You roll under</small><b>{odds.mine}</b></Tip>
            <div className="mid">{pct && <><span className="ok">Hit {pct.hit}%</span><span>Fended off {pct.fended}%</span><span>Both fail {pct.both}%</span>{pct.fumble > 0 && <span className="bad">Fumble {pct.fumble}%</span>}</>}</div>
            <Tip tip={{ title: `${p.enc.name}: Combat Skill`, body: `${c.combat}${w.speed ? `, less your ${w.name}'s Speed ${w.speed}` : ''}.`, page: 79 }} className="side them"><small>{alive.length > 1 && target ? `No. ${target.n} rolls under` : 'They roll under'}</small><b>{odds.theirs}</b></Tip>
          </div>
          <div className="dbt-weapons">{h.weapons.map((wp, i) => (
            <Tip key={wp.name} as="button" type="button" className={`dbt-weapon ${h.wield === i ? 'on' : ''}`} onClick={() => commit(E.setWield(game, i))}
              tip={{ title: wp.name, body: `${wp.skill} ${E.skillOf(h, wp.skill)}%. Damage ${wp.dmg.toUpperCase()}${wp.bonus ? ` + ${wp.bonus.toUpperCase()} (Mastery)` : ''}, Speed ${wp.speed}${wp.parry ? ', can parry' : ', cannot parry (you Dodge)'}.${cb.initiative && h.wield !== i ? ' Swapping weapons now uses your turn (p. 77).' : ''}`, page: 207 }}>
              <Ico n={/pick/i.test(wp.name) ? 'pickaxe' : /fist/i.test(wp.name) ? 'fist' : /dagger/i.test(wp.name) ? 'dagger' : 'cleaver'} size={18} />{wp.name}</Tip>
          ))}<Switch id="dbt-push" checked={push} onChange={setPush} label="Push" sub="+1 damage for 2 Exhaustion" />
            {h.weapons.filter((x) => !x.twoHanded && !/fist/i.test(x.name)).length >= 2 && <Switch id="dbt-dual" checked={Boolean(h.dual)} onChange={(on) => commit(E.setDual(game, on))} label="Two weapons" sub={has(h, 'Stormbrand') ? '+1 damage and a free Parry each round (Dual Wielder: no penalty)' : '+1 damage and a free Parry each round, but -40 to hit'} />}
            {locs && <label className="dbt-aim"><small>Aim</small><select className="dbt-select" value={aim} onChange={(e) => setAim(e.target.value)} aria-label="Aim at a hit location">
              <option value="">Anywhere (D20)</option>{locs.map(([, l]) => <option key={l} value={l}>{l}{l === ts.weak ? ' (Weak Spot)' : ''}</option>)}</select>
              <small>{aim ? (cb.flags?.freeAim ? 'no Disadvantage this time' : 'with Disadvantage') : ''}</small></label>}
            {E.handFull(h) && (h.shield || w.twoHanded || h.dual) && <p className="dbt-note warn">Your {h.lightSource === 'oil' ? 'Lamp' : h.lightSource === 'candle' ? 'Candle' : 'Torch'} fills a hand: {[h.shield && 'no shield', w.twoHanded && `the ${w.name} cannot be swung`, h.dual && 'no second weapon'].filter(Boolean).join(', ')} (p. 96).</p>}</div>
          <div className="dbt-dock-grid">
            {cb.restrained && <Action icon="hand" title="Break free" sub={`Athletics ${E.skillOf(h, 'Athletics')}: a Free Action, then attack`} tone="warn" onClick={() => act(E.breakFreePlan(), (f) => E.breakFree(game, f), null, { title: 'Break free', skill: 'Athletics' })} tip={{ title: 'Restrained', ...GLOSSARY.Restrained }} />}
            {cb.restrained && <Action icon="hand" title="Strain free" sub={`Athletics +20, uses your turn`} onClick={() => act(E.breakFreePlan(), (f) => E.breakFree(game, f, { standard: true }), null, { title: 'Strain free', skill: 'Athletics', bonus: 20 })} />}
            <Action icon={/pick/i.test(w.name) ? 'pickaxe' : 'sword'} title={`Strike${target && alive.length > 1 ? ` ${(target.kind || p.enc.name).split(' ')[0]} ${target.n}` : ''}`} sub={`${w.name} · ${w.dmg.toUpperCase()}${w.bonus ? `+${w.bonus.toUpperCase()}` : ''}${w.plus ? `+${w.plus}` : ''}${aim ? ` · at the ${aim}` : ''}`} tone="primary" onClick={() => { act(E.attackPlan(), (f) => E.playerAttack(game, f, { push, targetId: target?.id, aim: aim || null }), null, { title: `Strike with the ${w.name}` }); setAim(''); }} tip={{ title: 'The attack check', body: GLOSSARY['Opposed check'].body, page: 75 }} />
            {hasAbilities && <Action icon="spark" title="An Ability" sub={`${h.vit.aether} Aether`} onClick={() => openSheet('abilities')} />}
            {usable && <Action icon="potion" title="Use something" sub="A potion, a Fragment" onClick={() => openSheet('pack')} />}
            {has(h, 'Weapon Master', 5) && !cb.used?.wmTrade && <Action icon="shield" title="One With Your Weapon" sub="-30 weapon Skill for 10 Temporary Toughness, this fight" onClick={() => commit(E.wmTrade(game).state)} />}
            {has(h, 'Wrathspawn') && cb.lastHit?.by === 'you' && !(h.restUsed || {})['Savage Will'] && alive.some((a) => a.id === cb.lastHit.enemy) && h.vit.aether > 0 && <Action icon="flame" title="Savage Will" sub={`Pour Aether into that blow: +1 damage each (once per Rest). ${Math.min(5, h.vit.aether)} Aether`} onClick={() => commit(E.savageWill(game, Math.min(5, h.vit.aether)).state)} />}
            {game.domain.darkChoice && <DarkChoice game={game} commit={commit} />}
            {h.lightSource === 'oil' && h.vit.light > 0 && !h.lampDown && !E.beltLamp(h) && <Action icon="lantern" title="Set the Lamp down" sub="Frees the hand for a shield or a second weapon. Uses your turn; a Fumble kicks it over" onClick={() => commit(E.setLampDown(game).state)} tip={{ title: 'Lamp combat usage', body: 'Spend a Standard Action to set your Lamp on the floor and fight with both hands. If you then roll a Fumble you kick the Lamp, spill its oil and are Blinded.', page: 96 }} />}
            {burning && <Action icon="fire" title="Put out the flames" sub="Burning: 1 Fire a round. Uses your turn" tone="warn" onClick={() => commit(E.douse(game).state)} />}
            <Action icon="run" title="Flee" sub={`Dodge ${E.skillOf(h, 'Dodge')}${cb.restrained ? ' -20' : ''}`} disabled={!game.prev} why="There is nowhere to run back to." onClick={() => act(E.fleePlan(), (f) => E.flee(game, f), null, { title: 'Flee', skill: 'Dodge', bonus: cb.restrained ? -20 : 0 })} tip={{ title: 'Flee', ...GLOSSARY.Flee }} />
            <Action icon="tome" title="Their card" sub="Stats, actions, locations" onClick={openBestiary} />
          </div>
        </>
      ) : cb.pendingCrit ? <CritChoice game={game} commit={commit} /> : <div className="dbt-theirturn"><Ico n="hourglass" size={18} /> {alive[cb.enemyIdx || 0] ? `${alive[cb.enemyIdx || 0].kind || p.enc.name} ${alive.length > 1 ? alive[cb.enemyIdx || 0].n : ''} acts` : 'Their turn'}{busy ? '...' : ''}</div>}
      {(cb.ready && Object.keys(cb.ready).length > 0) || (h.minions || []).length || (cb.icons || []).length ? <p className="dbt-note dbt-readied">{[...Object.keys(cb.ready || {}).map((k) => `Readied: ${({ brace: 'Brace', shell: `Magic Shell (${cb.ready.shell})`, iceShield: 'Ice Shield', feint: 'Feint', countershock: 'Countershock', trap: 'your trap' })[k] || k}`), ...(h.minions || []).map((mm) => `Your ${mm.kind} ${mm.health}/${mm.max}`), ...(cb.icons || []).map((i) => `${i.kind} Icon`)].join(' · ')}</p> : null}
      {(target?.conds && Object.keys(target.conds).length > 0) || target?.buffs?.length ? <p className="dbt-note">{target.kind || p.enc.name} {target.n}: {[...Object.entries(target.conds || {}).filter(([, n]) => n).map(([k, n]) => `${k}${n > 1 ? ` (${n})` : ''}`), ...(target.buffs || []).map((b) => b.from)].join(', ')}{target.temp ? `, ${target.temp} Temporary Health` : ''}</p> : null}
      <p className="dbt-round">Round {cb.round} · {cb.initiative ? (cb.side === 'player' ? 'your turn' : 'their turn') : 'about to begin'}{cb.reactions ? ` · ${cb.reactions} defence${cb.reactions > 1 ? 's' : ''} this round` : ''}</p>
    </div>
  );
}

// checks the rules have sprung on you, waiting for your throw (they are also prompts on the scroll)
function Queued({ game, onQueued }) {
  const q = game.checks || []; if (!q.length) return null;
  return <div className="dbt-dock-grid feature">{q.map((c) => <Action key={c.id} icon="d20" title={`Roll ${c.skill}`} sub={c.purpose || c.why} tone="primary" onClick={() => onQueued(c.id)} tip={{ title: c.title || `${c.skill} check`, body: c.why, page: c.page }} />)}</div>;
}
// "that's not right": a note to Claude, sent with what the scroll says and where you are
function FlagSheet({ entry, onClose, onSend }) {
  const [note, setNote] = useState('');
  return (
    <Sheet open onClose={onClose} title="That's not right" icon="flag">
      {entry && <p className="dbt-note"><b>{entry.title}</b>: {String(entry.text || '').slice(0, 220)}</p>}
      <label className="dbt-field" htmlFor="dbt-flagnote"><span>What looks wrong? (the rule, what you expected, what happened)</span>
        <textarea id="dbt-flagnote" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The rat landed a Critical Strike but I was not asked about my shield" /></label>
      <p className="dbt-note">The last part of the scroll, your hero and the fight go with it, so Claude can see what happened.</p>
      <div className="dbt-row"><button type="button" className="dbt-btn ghost" onClick={onClose}>Cancel</button><button type="button" className="dbt-btn primary" disabled={!note.trim()} onClick={() => onSend(note.trim())}><Ico n="flag" size={14} /> Send</button></div>
    </Sheet>
  );
}
// Madness 8 (p. 91): you choose which Skill the lost memory takes
function MadnessSheet({ open, onClose, game, commit }) {
  const h = game.hero; const [pick, setPick] = useState('');
  const list = E.SKILLS.map((k) => [k, h.skills[k] ?? E.BASE_SKILLS[k] ?? 0]);
  return (
    <Sheet open={open} onClose={onClose} title="Blocked out" icon="brain">
      <p className="dbt-note">Something has taken a memory, and with it some of what it taught you{h.madPick > 1 ? ` (${h.madPick} to choose)` : ''}. Choose a Skill to reduce by 10.</p>
      <div className="dbt-seg wrapseg">{list.map(([k, n]) => <button key={k} type="button" className={pick === k ? 'on' : ''} onClick={() => setPick(k)}>{k} {n}{pick === k ? ` → ${Math.max(0, n - 10)}` : ''}</button>)}</div>
      <div className="dbt-row"><button type="button" className="dbt-btn ghost" onClick={onClose}>Later</button><button type="button" className="dbt-btn primary" disabled={!pick} onClick={() => { commit(E.chooseMadSkill(game, pick).state); setPick(''); onClose(); }}>Lose 10 from {pick || '...'}</button></div>
    </Sheet>
  );
}
// a Critical Strike is about to land: throw your shield or weapon into it, or take the blow (p. 85)
function CritChoice({ game, commit }) {
  const pc = game.combat.pendingCrit;
  return (
    <div className="dbt-critask" role="alertdialog" aria-label="A Critical Strike">
      <p><Ico n="skull" size={18} /> <b>{pc.who}</b>: <b>{pc.act}</b> lands a Critical Strike on your {pc.loc}: <b>{pc.dmg} {pc.dtype}</b> before your Armor.</p>
      <p className="dbt-note">You may sacrifice your shield or weapon to stop it entirely. It breaks, and stays broken until you Repair it at Camp (p. 85).</p>
      <div className="dbt-dock-grid">
        {pc.options.map((o) => <Action key={o.kind} icon={o.kind === 'shield' ? 'shield' : 'sword'} title={`Sacrifice the ${o.name}`} sub="It absorbs the whole blow and breaks" tone="warn" onClick={() => commit(E.answerCrit(game, o.kind).state)} />)}
        <Action icon="heart" title="Take the blow" sub={`${pc.dmg} damage, less your Armor`} onClick={() => commit(E.answerCrit(game, 'none').state)} />
      </div>
    </div>
  );
}
// Thrill Seeker (p. 67): the Growing Darkness is rolled twice and you keep the one you prefer
function DarkChoice({ game, commit }) {
  const c = game.domain.darkChoice; if (!c) return null;
  return c.map((x, i) => <Action key={x.roll} icon="eye" title={`Keep D100 ${x.roll}`} sub={x.text.length > 90 ? `${x.text.slice(0, 88)}...` : x.text} tone={i ? '' : 'primary'} onClick={() => commit(E.chooseDarkness(game, i).state)} tip={{ title: 'Thrill Seeker', body: `Choose which Growing Darkness comes true. D100 ${x.roll}: ${x.text}`, page: 120 }} />);
}
// ---------------------------------------------------------------------------------------------------------------
function ExploreDock({ game, busy, act, commit, openChecks, openCamp, onDoor, onMove, toast, openSheet, onHero, onAsk, onGoSheet }) {
  const h = game.hero, p = E.here(game), v = h.vit;
  const evt = (p.event?.roll || p.event?.asks?.length) && !p.event.done ? p.event : null;
  const asked = evt ? E.eventChecks(evt.text) : [];
  const med = E.skillOf(h, 'Medicine'); const lasting = h.effects.find((e) => E.LASTING.includes(e.name));
  const spoilsAsk = evt && !evt.spoils ? (evt.text.match(/(Spoils|Resources|Valuable Items|Precious Items) table/) || [])[0] : null;
  const rotAsk = evt && /\bRot\b/.test(evt.text) && !(h.rot > 0);
  const levelUp = E.levelDue(h); const noMastery = (h.abilityPoints || 0) > 0;
  return (
    <div className="dbt-explore">
      {game.over && <div className="dbt-over"><Ico n="skull" size={28} /><div><h3>{game.over === 'mad' ? 'Your mind is gone' : game.over === 'rot' ? 'The Rot has taken you' : 'You have died'}</h3><p>The necropolis keeps another. Begin a new survivor from Games{game.over === 'dead' ? ', or use the optional Forgiving Death rule (p. 87)' : ''}.</p>
        {game.over === 'dead' && <button type="button" className="dbt-btn sm" onClick={() => commit(E.forgivingDeath(game).state)}><Ico n="heart" size={14} /> Forgiving Death</button>}</div></div>}
      {!game.over && (
        <>
          {(p.event?.pending || evt || p.exit || p.lair || levelUp || noMastery || p.trader || game.domain.darkChoice || h.madPick > 0) && (
            <div className="dbt-dock-grid feature">
              <DarkChoice game={game} commit={commit} />
              {p.event?.pending && <Action icon="scroll" title="Roll the Events table" sub="Nothing fights you here: something else happens (D100)" tone="primary" onClick={() => act(E.eventPlan(), (f) => E.resolveEvent(game, f), null, { title: 'The Events table' })} tip={{ title: 'Event', ...GLOSSARY.Event }} />}
              {evt && (evt.asks || []).filter((a) => !a.done).slice(0, 1).map((a) => <Action key={a.i} icon="d20" title={`Roll ${a.skill}`} sub={a.purpose} tone="primary" onClick={() => onAsk(a.i, false)} tip={{ title: `${a.skill} check`, body: `${a.passText ? `Pass: ${a.passText}. ` : ''}${a.failText ? `Fail: ${a.failText}.` : ''}` || 'As the event says.', page: 108 }} />)}
              {evt && !(evt.asks || []).some((a) => !a.done) && <Action icon="d20" title="Settle the event" sub={asked.length && !(evt.asks || []).length ? `It asks for ${asked.map((a) => (a === 'weapon' ? 'a weapon Skill' : a)).join(' and ')}` : 'Anything else it says is yours to settle'} badge={!(evt.asks || []).length && asked.length ? asked.length : null} onClick={openChecks} />}
              {evt && <Action icon="check" title="Event settled" sub="Close it and move on" onClick={() => commit(E.markEvent(game))} />}
              {evt && has(h, 'Zealot') && !(h.restUsed || {})['Divine Guidance'] && !(evt.asks || []).some((x) => x.done) && <Action icon="star" title="Re-roll the event" sub="Divine Guidance: once per Rest" onClick={() => act(E.eventPlan(), (f) => E.rerollEvent(game, f), null, { title: 'The Events table, again' })} />}
              {p.exit && <Action icon="stairs" title="Descend to the next Domain" sub="A new Overseer, the Tension Die back to D8" tone="primary" onClick={() => commit(E.descend(game).state)} />}
              {spoilsAsk && <Action icon="chest" title={`Roll on the ${spoilsAsk}`} sub="If the event gives it to you" onClick={() => commit(E.rollEventSpoils(game, spoilsAsk).state)} />}
              {rotAsk && <Action icon="rot" title="Exposed to the Rot" sub={`If the event says so: Endurance ${E.skillOf(h, 'Endurance')}`} tone="warn" onClick={() => act(E.checkPlan(), (f) => E.exposeRot(game, f), null, { title: 'Exposed to the Rot', skill: 'Endurance' })} tip={{ title: 'The Rot', body: 'Fail the Endurance check and you are infected; then each rest it may advance a stage (p. 87).', page: 87 }} />}
              {p.lair && <Action icon="star" title={`Face ${game.domain.overseer.name}`} sub="The Overseer of this Domain, in its lair" tone="warn" onClick={() => act(null, () => E.faceOverseer(game))} tip={{ title: game.domain.overseer.name, body: 'The Domain\'s master. Its stat block and actions are from the book; beat it for 200 XP and D4 Sanity, and its Influence lifts.', page: 179 }} />}
              {p.trader && <Action icon="scales" title="The Trader" sub="Buy, or sell at half price" onClick={() => openSheet('trader')} />}
              {levelUp && <Action icon="star" title={`Level ${(h.level || 1) + 1}`} sub="+1 Ability Point and a benefit" tone="primary" onClick={() => openSheet('level')} />}
              {h.madPick > 0 && <Action icon="brain" title="Choose a Skill to lose 10" sub="Madness or the Growing Darkness has taken a memory (pp. 91, 121)" tone="warn" onClick={() => openSheet('madness')} />}
              {noMastery && <Action icon="spark" title="Spend Ability Points" sub={`${h.abilityPoints} to spend on your Masteries`} onClick={() => onGoSheet?.('points')} />}
            </div>
          )}
          <h4 className="dbt-dock-h"><Ico n="door" size={14} /> Ways on</h4>
          <Exits game={game} onDoor={onDoor} onMove={onMove} />
          <h4 className="dbt-dock-h"><Ico n="search" size={14} /> Here</h4>
          <div className="dbt-dock-grid">
            <Action icon="search" title="Search the room" sub={p.searched ? 'Already searched: once per room' : `Scavenge ${E.skillOf(h, 'Scavenge')}%${(h.mods?.advantage || []).includes('Scavenge') ? ' with Advantage' : ''}`} disabled={p.searched || p.lair} why={p.lair ? 'Not in the lair.' : 'Each room can be searched only once (p. 116).'} onClick={() => act(E.scavengePlan(), (f) => E.scavenge(game, f), null, { title: 'Search the room', skill: 'Scavenge' })} tip={!p.searched ? { title: 'Scavenge', ...GLOSSARY.Scavenge } : null} />
            <Action icon="d20" title="Test yourself" sub={asked.length ? 'The event asks for a check' : 'Checks, and what each is for'} badge={asked.length || null} onClick={openChecks} />
            <Action icon="chest" title="Deep search" sub={p.deepSearched ? 'Already done here' : 'Hidden containers: a Tension check, +2 Exhaustion'} disabled={p.deepSearched || p.lair || Boolean(p.enc)} why={p.lair ? 'Not in the lair.' : 'Once per room (p. 116).'} onClick={() => act(E.deepSearchPlan(game), (f) => E.deepSearch(game, f), (res) => onDoor(E.here(res.state).container?.id, true), { title: 'Deep search' })} tip={{ title: 'Finding containers', body: 'Once per room: a Tension Die check and 2 Exhaustion. A container may be locked (D20 10+) or trapped, like a door. Inside: D10 1-5 empty, 6-10 the Container Loot table.', page: 116 }} />
            {p.container && !p.container.opened && <Action icon="chest" title="The container" sub={p.container.locked ? 'Locked' : p.container.spotted ? 'Trapped' : 'Open it'} tone="gilt" onClick={() => onDoor(p.container.id)} />}
            <Action icon="pack" title="Your pack" sub={(() => { const n = (h.pack || []).length + (h.misc || []).length; return `${n} thing${n === 1 ? '' : 's'} carried · ${h.items.coins || 0} coins`; })()} onClick={() => openSheet('pack')} />
            {(h.masteries || []).length > 0 && <Action icon="spark" title="An Ability" sub={`${v.aether} Aether`} onClick={() => openSheet('abilities')} />}
            {v.light <= 3 && <Action icon="torch" title="Light a Torch" sub={`${h.items.torches} spare · lasts 20 rooms`} disabled={!h.items.torches} why="You have no spare Torch." onClick={() => commit(E.lightTorch(game).state)} tone={v.light === 0 ? 'warn' : ''} />}
            {v.light <= 3 && h.items.candles > 0 && <Action icon="torch" title="Light a Candle" sub={`${h.items.candles} · lasts 10 rooms`} onClick={() => commit(E.lightWith(game, 'candle').state)} />}
            {v.light <= 3 && h.items.oil > 0 && <Action icon="lantern" title="Fill the Lamp" sub={`${h.items.oil} Lamp Oil · 20 rooms`} onClick={() => commit(E.lightWith(game, 'oil').state)} />}
          </div>
          <h4 className="dbt-dock-h"><Ico n="tent" size={14} /> Rest and mend</h4>
          <div className="dbt-dock-grid">
            <Action icon="fire" title="Take a Breather" sub="+D10+2 Toughness · −5 Light · Tension steps down" onClick={() => act(null, () => E.breather(game))} tip={{ title: 'Breather', ...GLOSSARY.Breather }} />
            <Action icon="tent" title="Set camp" sub={`${E.campRating(game, p) === 2 ? 'Good spot' : E.campRating(game, p) === 1 ? 'Fair spot' : 'Poor spot'} · ${h.items.rations} Ration${h.items.rations === 1 ? '' : 's'}`} onClick={openCamp} tip={{ title: 'Camp', ...GLOSSARY.Camp }} />
            <Action icon="bandage" title="Tend your wounds" sub={`Bandage + Medicine ${med}% · D4 Toughness`} disabled={!h.items.bandages || p.tended || med === 0 || v.tough >= v.maxTough} why={!h.items.bandages ? 'You have no Bandages.' : p.tended ? 'Only once per room.' : med === 0 ? 'Your Medicine is 0, so the check cannot succeed: the Bandage would be wasted.' : 'Your Toughness is full.'} onClick={() => act(E.tendPlan(), (f) => E.tend(game, f, { mode: 'heal' }), null, { title: 'Tend your wounds', skill: 'Medicine' })} />
            {lasting && <Action icon="drop" title={`Dress the ${lasting.name.toLowerCase()}`} sub={`Bandage + Medicine ${med}%`} tone="warn" disabled={!h.items.bandages || med === 0} why={!h.items.bandages ? 'You have no Bandages.' : 'Your Medicine is 0, so the check cannot succeed.'} onClick={() => act(E.tendPlan(), (f) => E.tend(game, f, { mode: 'remove' }), null, { title: `Dress the ${lasting.name.toLowerCase()}`, skill: 'Medicine' })} />}
            <Action icon="ration" title="Eat a Ration" sub={`−1 Exhaustion · ${h.items.rations} left`} disabled={!h.items.rations || v.exh === 0} why={!h.items.rations ? 'You have no Rations.' : 'You are not exhausted.'} onClick={() => commit(E.eat(game, 'ration').state)} tip={{ title: 'Ration', ...GLOSSARY.Ration }} />
            {h.items.cooking > 0 && v.exh > 0 && <Action icon="bread" title="Eat it raw" sub={`Cooking Ingredients · Endurance ${h.resist.Endurance}`} onClick={() => act(E.checkPlan(), (f) => E.eat(game, 'cooking', f), null, { title: 'Eat it raw', skill: 'Endurance' })} tip={{ title: 'Cooking Ingredients', ...GLOSSARY['Cooking Ingredients'] }} />}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
export default function PlayView({ game, busy, act, commit, trayNode, toast, onPage, voice, onHero, rindewind, pending, ladder, onThrow, onCancelRoll, narrateAsk, openFirst, clearOpenFirst, onGoSheet, onFlagSend }) {
  const [flagging, setFlagging] = useState(null); // { entry } while the "that's not right" note is open
  const h = game.hero, here = E.here(game), cb = game.combat;
  const [adjust, setAdjust] = useState(null);
  const [sheet, setSheet] = useState(null); // checks | camp | map | here | bestiary
  const camps = useMemo(() => { const m = {}; for (const p of game.pieces) { const r = E.campRating(game, p); if (r) m[p.id] = r; } return m; }, [game]);
  const [doorId, setDoorId] = useState(null);
  // where a status icon in the top bar sends you
  const goTo = (t) => {
    if (!t) return;
    if (t.startsWith('sheet')) { onGoSheet?.(t.split(':')[1] || 'one'); return; }
    if (t === 'light') { const it = h.items; const r = it.torches > 0 ? E.lightTorch(game) : it.candles > 0 ? E.lightWith(game, 'candle') : E.lightWith(game, 'oil'); commit(r.state); return; }
    setSheet(t);
  };
  useEffect(() => { if (openFirst) { goTo(openFirst); clearOpenFirst?.(); } }, [openFirst]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (id) => act(E.doorPlan(game, here.doors.find((d) => d.id === id)), (f) => E.enterDoor(game, id, f), null, { title: 'Into the unknown' });
  // an unexplored way first goes through the door procedure (is there a door, a trap, a lock); then you go through
  const door = (id, direct = false) => { if (!id) return; if (direct) { setDoorId(id); return; } if (cb || game.over || busy) return; setSheet(null); if (E.here(game).container?.id === id) { setDoorId(id); return; } const d = here.doors.find((x) => x.id === id); if (d && E.doorReady(d)) go(id); else setDoorId(id); };
  const moveTo = (pid) => { if (cb || game.over || busy) return; const d = here.doors.find((x) => x.to === pid); if (d) { setSheet(null); act(E.doorPlan(game, d), (f) => E.enterDoor(game, d.id, f), null, { title: 'Retracing your steps' }); } else toast('That place is not joined to this one by a door.'); };
  // an event's check, rolled from its prompt on the scroll: the prompt is replaced by the result and Rindewind's line
  const askInfo = (a) => { const name = a.skill === 'weapon' ? h.weapons[h.wield].skill : a.skill; return { target: E.skillOf(h, name), adv: (h.mods?.advantage || []).includes(name), dis: E.exhTier(h) >= 2 }; };
  const onQueued = (id) => { if (busy) return; const q = (game.checks || []).find((x) => x.id === id); if (!q) return; act(E.checkPlan(), (f) => E.rollQueued(game, id, f), null, { auto: true }); };
  const onAsk = (i, skip) => {
    if (busy || cb) return;
    if (skip) { const r = E.eventCheck(game, i, null, { skip: true }); commit(r.state); narrateAsk?.(r.state, i); return; }
    const a = here.event?.asks?.[i]; if (!a) return;
    act(E.checkPlan(), (f) => E.eventCheck(game, i, f), (res) => narrateAsk?.(res.state, i), { auto: true });
  };
  const rollCheck = (name, why) => { setSheet(null); act(E.checkPlan(), (f) => E.skillCheck(game, name, f, why), null, { title: `${name === 'weapon' ? 'Weapon' : name} check`, skill: name === 'weapon' ? game.hero.weapons[game.hero.wield].skill : name, why }); };

  // the creatures' turns run by themselves, one after another
  useEffect(() => {
    if (!cb || game.over || busy) return undefined;
    if (cb.initiative && cb.side === 'enemy' && !cb.pendingCrit) { const t = setTimeout(() => act(E.enemyPlan(), (f) => E.enemyTurn(game, f), null, { auto: true }), 650); return () => clearTimeout(t); }
    if (cb.initiative && cb.side === 'player' && cb.lose) { const t = setTimeout(() => commit({ ...game, combat: { ...cb, lose: false, side: 'enemy', enemyIdx: 0 } }), 500); return () => clearTimeout(t); }
    return undefined;
  }, [cb?.side, cb?.initiative, cb?.round, cb?.enemyIdx, busy, game.over, cb?.lose, cb?.pendingCrit]); // eslint-disable-line react-hooks/exhaustive-deps

  const wide = useWide();
  const dock = (
    <div className="dbt-dock">
      <Queued game={game} onQueued={onQueued} />
      {cb && !game.over ? <CombatDock game={game} busy={busy} act={act} commit={commit} openBestiary={() => setSheet('bestiary')} openSheet={setSheet} />
        : <ExploreDock onAsk={onAsk} onGoSheet={onGoSheet} game={game} busy={busy} act={act} commit={commit} openChecks={() => setSheet('checks')} openCamp={() => setSheet('camp')} onDoor={door} onMove={moveTo} toast={toast} openSheet={setSheet} onHero={onHero} />}
    </div>
  );
  return (
    <div className={`dbt-play ${cb ? 'fighting' : ''} ${wide ? 'wide' : ''}`}>
      <Hud game={game} onAdjust={setAdjust} onHero={onHero} onMap={() => setSheet('map')} onHere={() => setSheet('here')} onGo={goTo} />
      <div className="dbt-stage">
        <Journal game={game} onPage={onPage} voice={voice} trayNode={trayNode} pending={pending} ladder={ladder} onThrow={onThrow} onCancel={onCancelRoll} busy={busy} onAsk={onAsk} onQueued={onQueued} ask={askInfo} onFlag={onFlagSend ? (e) => setFlagging({ entry: e }) : null}
          header={<div className="dbt-scroll-title">{onFlagSend && <button type="button" className="dbt-flagbtn top" onClick={() => setFlagging({ entry: null })} title="Something here is not as the rules say? Tell Claude"><Ico n="flag" size={14} /> That's not right</button>}<b>{E.placeName(here)}</b><span>{cb ? `Round ${cb.round}` : here.lair ? 'The lair' : here.cleared ? 'Quiet' : ''}</span></div>} />
        {wide && (
          <aside className="dbt-side">
            {cb ? <Panel plate="The fight" icon="swords" className="dbt-sidedock">{dock}</Panel>
              : <PlaceCard game={game} onPage={onPage} onDoor={door} onMove={moveTo} exits={false}><div className="dbt-sidedock merged">{dock}</div></PlaceCard>}
            <MapView game={game} camps={camps} compact onOpen={() => setSheet('map')} height={200} />
            {!cb && <Panel plate="Your body" icon="helm" className="dbt-bodycard">
              <Silhouette hero={h} armor={h.armor} wounds={h.wounds || []} label="Your hit locations" className="you" />
              <p className="dbt-note">{(h.wounds || []).length ? `${h.wounds.length} hit${h.wounds.length > 1 ? 's' : ''} taken since you last made camp. ` : 'Unhurt since your last camp. '}Tap a location for its D20 range and armour.</p>
            </Panel>}
            {rindewind}
          </aside>
        )}
      </div>
      {!wide && dock}
      {flagging && <FlagSheet entry={flagging.entry} onClose={() => setFlagging(null)} onSend={(note) => { const en = flagging.entry; setFlagging(null); onFlagSend(note, en).then(() => toast('Sent. Claude will look into it.')).catch((err) => toast(`Could not send: ${err.message}`)); }} />}
      <MadnessSheet open={sheet === 'madness'} onClose={() => setSheet(null)} game={game} commit={commit} />
      <ChecksSheet open={sheet === 'checks'} onClose={() => setSheet(null)} game={game} roll={rollCheck} busy={busy} />
      <CampSheet open={sheet === 'camp'} game={game} onClose={() => setSheet(null)} onCamp={(o, need) => act(E.campPlan(game), (f) => E.setCamp(game, f, o), null, { title: 'Camp Check', need })} />
      <PackSheet open={sheet === 'pack'} onClose={() => setSheet(null)} game={game} commit={commit} act={act} />
      <TraderSheet open={sheet === 'trader'} onClose={() => setSheet(null)} game={game} commit={commit} />
      <LevelSheet open={sheet === 'level'} onClose={() => setSheet(null)} game={game} commit={commit} />
      <AbilitySheet open={sheet === 'abilities'} onClose={() => setSheet(null)} game={game} commit={commit} act={act} />
      <Sheet open={sheet === 'map'} onClose={() => setSheet(null)} title={`Domain ${game.domain.n}`} icon="map" wide className="dbt-mapsheet">
        <MapView game={game} camps={camps} onDoor={door} onMove={moveTo} height="min(68vh, 640px)" />
      </Sheet>
      <Sheet open={sheet === 'here'} onClose={() => setSheet(null)} title="This place" icon="door"><PlaceCard game={game} onPage={onPage} onDoor={door} onMove={moveTo} />
        <Panel plate="Your body" icon="helm" className="dbt-bodycard"><Silhouette hero={h} armor={h.armor} wounds={h.wounds || []} label="Your hit locations" className="you" /></Panel></Sheet>
      <Sheet open={sheet === 'bestiary'} onClose={() => setSheet(null)} title={here.enc?.name || 'Creature'} icon="skull" wide>{here.enc && <MonsterCard name={here.enc.name} alive={here.enc.alive} target={cb?.target} stat={E.foeStat(game)} />}</Sheet>
      <AdjustSheet field={adjust} game={game} onClose={() => setAdjust(null)} commit={commit} />
      {doorId && !cb && <DoorSheet game={game} doorId={doorId} onClose={() => setDoorId(null)} act={act} commit={commit} go={go} reopen={setDoorId} />}
    </div>
  );
}
