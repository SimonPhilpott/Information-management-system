// The test lab (30 Oct 2026, Simon: "an Admin cog icon which only I can see and access which allows me to test combat,
// room generation etc."). Only the owner sees it. Everything here happens in a separate sandbox game ("Test lab"),
// never in a real adventure, and other players never see it round the table. Rolls made from here use the real dice
// and the real rules; the lab only sets the stage: who you are, what you face, which table row comes up.
import React, { useState } from 'react';
import * as E from '../kn/engine';
import { CREATURE_NAMES, BESTIARY, encounterFor } from '../kn/creatures';
import { MASTERY_NAMES } from '../kn/progress';
import { look } from '../kn/tables';
import { makePotion } from '../kn/loot';
import Ico from '../ui/Ico';
import { Panel } from '../ui/Bits';

const LAB = 'Test lab';
// the faces that make a plan come up as given: { key: value } (a D100's tens and ones are split for you)
export function facesFor(plan, want) {
  const auto = E.fakeFaces(plan); const out = []; let i = 0;
  for (const [k, d] of plan.defs) {
    if (d === 'd100') { const v = want[k]; if (v != null) { const n = v === 100 ? 0 : v; out.push(Math.floor(n / 10) * 10, n % 10); } else out.push(auto[i], auto[i + 1]); i += 2; }
    else { out.push(want[k] != null ? (d === 'd10' && want[k] === 10 ? 0 : want[k]) : auto[i]); i += 1; }
  }
  return out;
}
const labHero = () => {
  const h = E.newHero({ name: 'Tester', faces: [6, 6, 6, 6, 6, 6, 1, 1], skills: { ...E.BASE_SKILLS, 'Bladed Weapons': 60, 'Bludgeoning Weapons': 40, Dodge: 40, Perception: 50, Athletics: 40, Acrobatics: 30, Medicine: 30, Reason: 30, Stealth: 30, Thievery: 30, Scavenge: 30 } });
  h.vit.health = h.vit.maxHealth; h.vit.tough = h.vit.maxTough; h.vit.sanity = h.vit.maxSanity; h.vit.exh = 0;
  return h;
};
export const newLabGame = () => { const g = E.newGame(labHero(), LAB, { start: 'keep' }); return { ...g, test: true }; };

function Row({ label, children }) { return <div className="dbt-lab-row"><span className="l">{label}</span><div className="c">{children}</div></div>; }

export default function LabView({ games, curId, commit, select, act, toast }) {
  const lab = games.find((g) => g.test) || null;
  const using = lab && curId === lab.id;
  const [foe, setFoe] = useState('Blightfang Rats'); const [count, setCount] = useState(0);
  const [surprised, setSurprised] = useState(false);
  const [level, setLevel] = useState(1);
  const [eventN, setEventN] = useState(52); const [darkN, setDarkN] = useState(40);
  const [mastery, setMastery] = useState(MASTERY_NAMES[0]); const [tiers, setTiers] = useState(5);
  const [encOn, setEncOn] = useState('random');

  const open = () => { if (lab) { select(lab.id); return; } const g = newLabGame(); commit(g); select(g.id); toast('A fresh test game: Tester, level 1, in an empty first room.'); };
  const change = (fn, msg) => { if (!lab) return; const g = fn(JSON.parse(JSON.stringify(lab))); commit({ ...g, updated: Date.now() }); if (msg) toast(msg); };
  const reset = () => { if (!lab) return; const g = { ...newLabGame(), id: lab.id }; commit(g); toast('The test game is reset.'); };

  // a fight, in the room you stand in, with the real start-of-fight procedure
  // a random foe: rolled on this Domain's Combat Encounter tables as the book does, or any creature in the bestiary
  const pickFoe = (g) => {
    if (foe === '__tables') { const e = encounterFor(g.domain.n, E.rnd(6), E.rnd(20)); return { name: e.name, how: `${e.table}${e.d6 ? ` (D6 ${e.d6})` : ''}, D20 ${e.d20}` }; }
    if (foe === '__any') { const pool = CREATURE_NAMES.filter((n) => !BESTIARY[n]?.overseer); return { name: pool[E.rnd(pool.length) - 1], how: 'any creature' }; }
    return { name: foe, how: '' };
  };
  const fight = () => {
    if (!lab) return; const picked = pickFoe(lab);
    change((g) => {
      const p = E.here(g); p.enc = E.makeEnemies(picked.name, g, count || null); p.cleared = false; p.event = null;
      return E.startCombat({ ...g, combat: null, over: null }, surprised).state;
    }, `${picked.name}${picked.how ? ` (random: ${picked.how})` : ''}: the fight is set.`);
  };
  // a new room through the next unexplored way, with the dice; the encounter roll can be forced
  const room = () => {
    if (!lab) return; select(lab.id);
    const g = JSON.parse(JSON.stringify(lab)); g.combat = null; g.over = null; const p = E.here(g); if (p.enc) { p.enc = null; p.cleared = true; } // any fight here is set aside
    const d = p.doors.find((x) => !x.to && !x.blocked);
    if (!d) { toast('No unexplored way out of this place: reset the test game.'); return; }
    const plan = E.doorPlan(g, d);
    const want = encOn === 'fight' ? { enc: 20 } : encOn === 'quiet' ? { enc: 1 } : {};
    act(plan, (f) => E.enterDoor(g, d.id, encOn === 'random' ? f : facesFor(plan, { ...E.readPlan(plan, f), ...want })), null, { title: encOn === 'random' ? 'Into the unknown' : `Into the unknown (encounter forced: ${encOn === 'fight' ? 'a fight' : 'no fight'})` });
  };
  const event = () => {
    if (!lab) return; select(lab.id);
    const g = { ...lab, combat: null }; const p = E.here(g); p.event = { pending: true };
    act(E.eventPlan(), () => E.resolveEvent(g, facesFor(E.eventPlan(), { event: eventN })), null, { title: `Event ${eventN}` });
  };
  const darkness = () => change((g) => E.darknessRoll(g, darkN).state, `Growing Darkness ${darkN} applied.`);

  return (
    <div className="dbt-page dbt-lab">
      <header className="dbt-head"><div><span className="dbt-kick">Owner only · a sandbox, never your real adventures</span><h1><Ico n="cog" size={26} /> Test lab</h1></div>
        <div className="dbt-row"><button type="button" className="dbt-btn primary" onClick={open}><Ico n="door" size={16} /> {lab ? (using ? 'Go to Play' : 'Play the test game') : 'Start a test game'}</button>{lab && <button type="button" className="dbt-btn ghost" onClick={reset}>Reset it</button>}</div></header>
      {!lab && <p className="dbt-note">Start a test game first: a sturdy level 1 survivor called Tester in an empty room. Nothing here touches George, Noddy or anyone else&apos;s adventure.</p>}
      {lab && (
        <>
          <Panel plate="A fight" icon="swords">
            <Row label="Creature"><select className="dbt-select" value={foe} onChange={(e) => setFoe(e.target.value)}><option value="__tables">Random: this Domain's encounter tables</option><option value="__any">Random: any creature (no Overseers)</option>{CREATURE_NAMES.map((n) => <option key={n} value={n}>{n}{BESTIARY[n]?.overseer ? ' (Overseer)' : ''}</option>)}</select></Row>
            <Row label="How many"><select className="dbt-select" value={count} onChange={(e) => setCount(Number(e.target.value))}><option value={0}>As the book says</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></Row>
            <Row label="They surprise you"><input type="checkbox" checked={surprised} onChange={(e) => setSurprised(e.target.checked)} /></Row>
            <div className="dbt-row"><button type="button" className="dbt-btn primary" onClick={() => { fight(); select(lab.id); }}><Ico n="swords" size={16} /> Start the fight</button></div>
          </Panel>
          <Panel plate="Rooms, events and the Darkness" icon="map">
            <Row label="New room"><select className="dbt-select" value={encOn} onChange={(e) => setEncOn(e.target.value)}><option value="random">Encounter as the dice fall</option><option value="fight">Force a fight</option><option value="quiet">Force no fight (an event)</option></select>
              <button type="button" className="dbt-btn" onClick={room}><Ico n="door" size={16} /> Through the next door</button></Row>
            <Row label="Event (D100)"><input className="dbt-num" type="number" min={1} max={100} value={eventN} onChange={(e) => setEventN(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
              <button type="button" className="dbt-btn" onClick={event}><Ico n="scroll" size={16} /> Roll this event here</button></Row>
            <p className="dbt-note dbt-lab-peek">{look('events', eventN)?.text?.slice(0, 220)}…</p>
            <Row label="Growing Darkness (D100)"><input className="dbt-num" type="number" min={1} max={100} value={darkN} onChange={(e) => setDarkN(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
              <button type="button" className="dbt-btn" onClick={darkness}><Ico n="eye" size={16} /> Apply it</button></Row>
            <p className="dbt-note dbt-lab-peek">{look('darkness', darkN)?.text}</p>
          </Panel>
          <Panel plate="The test survivor" icon="helm">
            <Row label="Level"><select className="dbt-select" value={level} onChange={(e) => setLevel(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select>
              <button type="button" className="dbt-btn" onClick={() => change((g) => { g.hero.level = level; return g; }, `Tester is level ${level}: creatures adapt to it.`)}>Set</button></Row>
            <Row label="Mastery"><select className="dbt-select" value={mastery} onChange={(e) => setMastery(e.target.value)}>{MASTERY_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
              <select className="dbt-select" value={tiers} onChange={(e) => setTiers(Number(e.target.value))} aria-label="Tiers">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Tiers 1-{n}</option>)}</select>
              <button type="button" className="dbt-btn" onClick={() => change((g) => { g.hero.masteries = [...(g.hero.masteries || []).filter((m) => m.name !== mastery), { name: mastery, tiers }]; g.hero.vit.maxAether = Math.max(g.hero.vit.maxAether, 30); g.hero.vit.aether = g.hero.vit.maxAether; g.hero.items.ritual = 20; return g; }, `${mastery} given, Tiers 1-${tiers}, with Aether and Ritual Components to spend.`)}>Give it</button></Row>
            <div className="dbt-row wrap">
              <button type="button" className="dbt-btn sm" onClick={() => change((g) => { const v = g.hero.vit; Object.assign(v, { health: v.maxHealth, tough: v.maxTough, sanity: v.maxSanity, aether: v.maxAether, exh: 0, light: 20 }); g.hero.lightSource = g.hero.lightSource || 'torch'; g.hero.effects = []; g.over = null; return g; }, 'Fully healed, rested and lit.')}><Ico n="heart" size={14} /> Heal everything</button>
              <button type="button" className="dbt-btn sm" onClick={() => change((g) => { for (let i = 0; i < 3; i++) g.hero.pack.push(makePotion()); Object.assign(g.hero.items, { bandages: (g.hero.items.bandages || 0) + 5, torches: (g.hero.items.torches || 0) + 3, rations: (g.hero.items.rations || 0) + 3, crafting: (g.hero.items.crafting || 0) + 10, lockpicks: (g.hero.items.lockpicks || 0) + 3 }); return g; }, '3 potions, 5 bandages, 3 torches, 3 rations, 10 crafting supplies, 3 lockpicks.')}><Ico n="pack" size={14} /> Supplies</button>
              <button type="button" className="dbt-btn sm" onClick={() => change((g) => { g.hero.pack.push({ id: `belt-${Date.now()}`, kind: 'gear', name: 'Belt', equipped: true }, { id: `shield-${Date.now()}`, kind: 'armour', name: 'Normal Shield', base: 'Normal Shield', part: 'Shield', die: 8 }); g.hero.shield = { name: 'Normal Shield', parry: 10 }; return g; }, 'A Belt and a Normal Shield.')}><Ico n="shield" size={14} /> Belt and shield</button>
              <button type="button" className="dbt-btn sm" onClick={() => change((g) => { g.hero.vit.light = 0; g.hero.lightSource = null; return g; }, 'The light is out.')}><Ico n="torch" size={14} /> Put the light out</button>
              <button type="button" className="dbt-btn sm" onClick={() => change((g) => { g.hero.vit.health = 1; g.hero.vit.tough = 0; return g; }, 'One Health left.')}><Ico n="skull" size={14} /> Near death</button>
              <button type="button" className="dbt-btn sm" onClick={() => change((g) => { g.hero.vit.xp = Math.max(g.hero.vit.xp, (g.hero.level || 1) * 1000); return g; }, 'Enough XP to level up.')}><Ico n="star" size={14} /> XP to level up</button>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
