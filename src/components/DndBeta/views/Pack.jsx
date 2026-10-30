// Everything you carry and what you can do with it (pp. 205-241): put gear on, study or drink potions, break
// Fragments, attune at Camp; plus the Trader (p. 127), levelling up (p. 62), Masteries (pp. 21-61) and Personal Goals
// (pp. 64-67). The engine does the rules; these sheets only offer the choices the book gives you.
import React, { useMemo, useState } from 'react';
import * as E from '../kn/engine';
import { FOR_SALE, priceOf, encumbrance, armourByName, weaponByName } from '../kn/loot';
import { MASTERIES, MASTERY_NAMES, masteryOf, tiersOf, LEVEL_BENEFITS, GOALS, goalProgress, PERKS, ROT, abilityPlan, aetherCost } from '../kn/progress';
import { ABILITY, MINIONS, has } from '../kn/masteryFx';
import Ico, { itemIcon } from '../ui/Ico';
import { Tip, Term } from '../ui/Tip';
import { Action, Bar, Seg, Sheet } from '../ui/Bits';

const KIND_ICON = { weapon: 'sword', armour: 'shield', potion: 'potion', fragment: 'gem', magic: 'spark', relic: 'star', amulet: 'amulet', lore: 'tome', gear: 'pack', vial: 'vial' };
const KIND_LABEL = { weapon: 'Weapon', armour: 'Armour', potion: 'Potion', fragment: 'Fragment', magic: 'Magic item', relic: 'Relic', amulet: 'Amulet', lore: 'Lore Book', gear: 'Gear', vial: 'Vial' };
const iconOf = (x) => (x.kind === 'magic' ? ({ Ring: 'ring', Belt: 'belt', Boots: 'boot', Gloves: 'glove', Weapon: 'sword', Armor: 'shield' }[x.type] || 'spark') : KIND_ICON[x.kind] || itemIcon(x.name));
const equippable = (x) => ['weapon', 'armour', 'magic', 'amulet'].includes(x.kind) || (x.kind === 'relic' && x.type !== 'Consumable') || (x.kind === 'gear' && ['Backpack', 'Pouch', 'Belt', 'Bedroll', 'Crowbar', "Thieves' Toolkit", 'Lamp', 'Belt Lamp'].includes(x.name));

export function ItemRow({ x, game, commit, act, combat, onDone }) {
  const h = game.hero; const med = E.skillOf(h, 'Medicine');
  const run = (r) => { commit(r.state || r); onDone?.(); };
  const buttons = [];
  const onBelt = E.beltItems(h).some((b) => b.id === x.id); const beltFull = E.beltItems(h).length >= E.BELT_SLOTS;
  if (!combat && E.beltOn(h) && E.beltable(x)) buttons.push(onBelt
    ? <button key="belt" type="button" className="dbt-btn sm ghost" onClick={() => run(E.setBelt(game, x.id, false))}>Off the Belt</button>
    : <button key="belt" type="button" className="dbt-btn sm" disabled={beltFull} title={beltFull ? `All ${E.BELT_SLOTS} Belt slots are full` : undefined} onClick={() => run(E.setBelt(game, x.id, true))}><Ico n="pouch" size={14} /> On the Belt</button>);
  if (x.kind === 'potion') {
    if (!x.known && !x.tried && !combat) buttons.push(<button key="id" type="button" className="dbt-btn sm" disabled={med === 0} onClick={() => { onDone?.(); act(E.checkPlan(), (f) => E.identifyPotion(game, x.id, f), null, { title: 'Study the potion', skill: 'Medicine' }); }}><Ico n="eye" size={14} /> Study it (Medicine {med})</button>);
    buttons.push(<button key="dr" type="button" className="dbt-btn sm primary" onClick={() => { onDone?.(); act(E.drinkPlan(), (f) => E.drinkPotion(game, x.id, f), null, { title: x.known ? `Drink the ${x.name}` : 'Drink the potion' }); }}><Ico n="potion" size={14} /> Drink{combat ? (onBelt ? ' (Belt: free)' : ' (uses your turn)') : ''}</button>);
  }
  if (x.kind === 'fragment') buttons.push(<button key="use" type="button" className="dbt-btn sm primary" onClick={() => (x.roll === 6 ? (onDone?.(), act(E.fragmentPlan(), (f) => E.useFragment(game, x.id, null, f), null, { title: x.name, skill: 'Resolve' })) : run(E.useFragment(game, x.id)))}><Ico n="gem" size={14} /> Use it</button>);
  if (x.kind === 'vial' || (x.kind === 'relic' && x.type === 'Consumable')) buttons.push(<button key="dr" type="button" className="dbt-btn sm primary" onClick={() => run(E.consume(game, x.id))}><Ico n="vial" size={14} /> Drink</button>);
  if (!combat && equippable(x)) buttons.push(x.equipped
    ? <button key="off" type="button" className="dbt-btn sm ghost" onClick={() => run(E.unequipItem(game, x.id))}>Take off</button>
    : <button key="on" type="button" className="dbt-btn sm" onClick={() => run(E.equipItem(game, x.id))}><Ico n={iconOf(x)} size={14} /> {x.kind === 'weapon' || x.type === 'Weapon' ? 'Take up' : 'Put on'}</button>);
  if (!combat) buttons.push(<button key="drop" type="button" className="dbt-btn sm ghost" onClick={() => run(E.dropItem(game, x.id))} aria-label={`Leave the ${x.name} behind`}>Leave</button>);
  const chips = [onBelt && 'On your Belt', x.broken && 'Broken', x.equipped && 'Worn', x.attuned && 'Attuned', x.kind === 'magic' && !x.attuned && 'Not attuned', x.die && `Integrity D${x.die}`, x.rarity].filter(Boolean);
  return (
    <div className="dbt-packrow">
      <span className="dbt-roundel sm"><Ico n={iconOf(x)} size={18} /></span>
      <div className="t">
        <b>{x.name}</b><small className="kind">{KIND_LABEL[x.kind] || 'Item'}{x.page ? ` · p. ${x.page}` : ''}</small>
        {chips.length > 0 && <span className="chips">{chips.map((c) => <em key={c} className="dbt-chip sm">{c}</em>)}</span>}
        <small>{x.t}</small>
        {x.powers?.length > 0 && <ul className="dbt-slist">{x.powers.map((p) => <li key={p}>{p}</li>)}</ul>}
        {x.desc && <small className="dbt-fell">{x.desc}</small>}
      </div>
      <div className="b">{buttons}</div>
    </div>
  );
}

export function PackSheet({ open, onClose, game, commit, act }) {
  const h = game.hero; const combat = Boolean(game.combat); const pack = h.pack || [];
  const [tab, setTab] = useState('all');
  const enc = encumbrance(h);
  const list = pack.filter((x) => (combat ? ['potion', 'fragment', 'vial'].includes(x.kind) || (x.kind === 'relic' && x.type === 'Consumable') : tab === 'all' || (tab === 'worn' ? x.equipped : tab === 'use' ? ['potion', 'fragment', 'vial', 'lore'].includes(x.kind) : !x.equipped)));
  const it = h.items || {};
  const counts = [['Rations', it.rations, 'ration'], ['Torches', it.torches, 'torch'], ['Bandages', it.bandages, 'bandage'], ['Crafting Supplies', it.crafting, 'chain'], ['Cooking Ingredients', it.cooking, 'bread'], ['Lockpicks', it.lockpicks, 'lock'], ['Attunement Crystals', it.crystals, 'gem'], ['Candles', it.candles, 'torch'], ['Flares', it.flares, 'spark'], ['Lamp Oil', it.oil, 'drop'], ['Ritual Components', it.ritual, 'vial'], ['Coins', it.coins, 'coin']].filter(([, n]) => n > 0);
  return (
    <Sheet open={open} onClose={onClose} title={combat ? 'Something to use' : 'Your pack'} icon="pack" wide>
      {!combat && (
        <div className="dbt-encbar"><Tip as="div" tip={{ title: 'Item slots', body: 'Ten slots, +20 with a Backpack, +5 for each Pouch (up to three). Heavy things take two; Light things bundle ten to a slot; coins take a slot per hundred. What you wear does not count.', page: 206 }}>
          <small>Carrying</small><b>{enc.used} of {enc.cap} slots</b></Tip><Bar value={enc.used} max={enc.cap} tone={enc.used > enc.cap ? 'warn' : 'gilt'} />
          {enc.used > enc.cap && <p className="dbt-err">Over your slots: leave something behind before you move on.</p>}</div>
      )}
      {!combat && <Seg value={tab} onChange={setTab} label="Show" options={[['all', 'Everything', 'pack'], ['worn', 'Worn', 'helm'], ['use', 'To use', 'potion'], ['loose', 'Carried', 'pouch']]} />}
      {E.beltOn(h) && <p className="dbt-note"><Ico n="pouch" size={14} /> Belt ({E.beltItems(h).length} of {E.BELT_SLOTS}): {E.beltItems(h).map((b) => b.name).join(', ') || 'empty'}. {combat ? 'Using these is a Free Action, one a round.' : 'Put potions, Fragments or vials on it: in a fight they are a Free Action (p. 212).'}</p>}
      {counts.length > 0 && <div className="dbt-chiprow">{counts.map(([k, n, ic]) => <span key={k} className="dbt-chip"><Ico n={ic} size={14} />{k} {n}</span>)}</div>}
      {list.length ? list.map((x) => <ItemRow key={x.id} x={x} game={game} commit={commit} act={act} combat={combat} onDone={combat ? onClose : null} />)
        : <p className="dbt-note">{combat ? 'Nothing in your pack can be used in a fight: potions, Fragments and vials can.' : 'Nothing here yet. Spoils from fights, searches and containers land in your pack.'}</p>}
      {!combat && <p className="dbt-note">Magic items act as ordinary ones until you attune to them at Camp (an Attunement Crystal and 1 Exhaustion each). Potions are a mystery until a Medicine check, or until you drink them.</p>}
    </Sheet>
  );
}

export function TraderSheet({ open, onClose, game, commit }) {
  const h = game.hero; const [tab, setTab] = useState('sell'); const [kind, setKind] = useState('gear');
  const coins = h.items.coins || 0;
  const sellable = (h.pack || []).filter((x) => x.kind !== 'amulet');
  const buy = FOR_SALE.filter((x) => (kind === 'supplies' ? x.kind === 'count' : x.kind === kind));
  return (
    <Sheet open={open} onClose={onClose} title="The Trader" icon="scales" wide>
      <p className="dbt-fell">A figure with its head wrapped in thick bandages grunts and spreads its wares. It is never hostile, and it will be here when you come back (p. 127).</p>
      <div className="dbt-chiprow"><span className="dbt-chip gilt"><Ico n="coin" size={14} />{coins} coins</span></div>
      <Seg value={tab} onChange={setTab} label="Trade" options={[['sell', 'Sell', 'coin'], ['buy', 'Buy', 'scales']]} />
      {tab === 'sell' ? (
        sellable.length ? sellable.map((x) => (
          <div key={x.id} className="dbt-packrow"><span className="dbt-roundel sm"><Ico n={iconOf(x)} size={18} /></span><div className="t"><b>{x.name}</b><small>{x.t}</small></div>
            <div className="b"><button type="button" className="dbt-btn sm" onClick={() => commit(E.sellItem(game, x.id).state)}>Sell for {priceOf(x)}</button></div></div>
        )) : <p className="dbt-note">Nothing to sell. The Trader pays half price for ordinary things; magic items by rarity (200, 400, 600 coins), Relics 1,000. Amulets it will not take.</p>
      ) : (
        <>
          <Seg value={kind} onChange={setKind} label="Wares" options={[['gear', 'Gear', 'pack'], ['weapon', 'Weapons', 'sword'], ['armour', 'Armour', 'shield'], ['supplies', 'Supplies', 'chain']]} />
          <div className="dbt-wares">{buy.map((x) => (
            <button key={x.name} type="button" className="dbt-ware" disabled={coins < x.cost} onClick={() => commit(E.buyItem(game, x.name).state)} title={coins < x.cost ? 'You cannot afford it' : `Buy for ${x.cost} coins`}>
              <Ico n={x.kind === 'weapon' ? 'sword' : x.kind === 'armour' ? 'shield' : itemIcon(x.name)} size={16} /><span>{x.name}</span><b>{x.cost}</b></button>
          ))}</div>
        </>
      )}
    </Sheet>
  );
}

export function LevelSheet({ open, onClose, game, commit }) {
  const h = game.hero; const [b, setB] = useState('health'); const [pick, setPick] = useState('');
  const ben = LEVEL_BENEFITS.find((x) => x.id === b);
  const abilities = (h.masteries || []).flatMap((m) => (masteryOf(m)?.tiers || []).slice(0, tiersOf(m)).filter((t) => abilityPlan(t)).map((t) => t.name));
  const needPick = ben.pick || ben.pickSkill || ben.pickAbility;
  const opts = ben.pick || (ben.pickSkill ? E.SKILLS : ben.pickAbility ? abilities : []);
  return (
    <Sheet open={open} onClose={onClose} title={`Level ${(h.level || 1) + 1}`} icon="star">
      <p className="dbt-note">1,000 XP brings a new level: +1 Ability Point for your Masteries, and one benefit of your choice (p. 62).</p>
      <div className="dbt-choicelist">{LEVEL_BENEFITS.map((x) => (
        <label key={x.id} className={`dbt-choice ${b === x.id ? 'on' : ''}`}><input type="radio" name="dbt-lvl" checked={b === x.id} onChange={() => { setB(x.id); setPick(''); }} /><span>{x.t}</span></label>
      ))}</div>
      {needPick && (opts.length ? <select className="dbt-select" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Choose"><option value="">Choose…</option>{opts.map((o) => <option key={o}>{o}</option>)}</select> : <p className="dbt-note">You have no damage-dealing Ability yet.</p>)}
      <div className="dbt-row"><button type="button" className="dbt-btn ghost" onClick={onClose}>Later</button>
        <button type="button" className="dbt-btn primary" disabled={needPick && !pick} onClick={() => { commit(E.levelUp(game, b, pick || null).state); onClose(); }}><Ico n="star" size={16} /> Take it</button></div>
    </Sheet>
  );
}

// the Tier Abilities you have opened, to use now (Aether is spent; damage is rolled against your target)
// the Tier Abilities you have opened, to use now: what each does to the game is resolved by the engine (kn/masteryFx);
// Reactions are readied before the creatures act, held (Sustained) ones keep their Aether until released
const HOW = { attack: 'A weapon attack', spell: 'Rolled for you', react: 'Ready it before they act', sustain: 'Held while its Aether is held back', summon: 'Summons an ally', icon: 'Places an Icon', buff: 'Lasts this fight', heal: 'Heals you' };
const howOf = (fx) => (fx.attack ? HOW.attack : fx.react ? HOW.react : fx.sustain ? HOW.sustain : fx.summon ? HOW.summon : fx.icon ? HOW.icon : fx.buff ? HOW.buff : fx.heal || fx.healPer3 || fx.sanity || fx.absolution ? HOW.heal : fx.spell || fx.debuff ? HOW.spell : null);
export function AbilitySheet({ open, onClose, game, commit, act }) {
  const h = game.hero; const cb = game.combat; const [units, setUnits] = useState({});
  const rows = (h.masteries || []).flatMap((m) => { const M = masteryOf(m); return M ? M.tiers.slice(0, tiersOf(m)).map((t) => ({ m: M.name, t, fx: ABILITY[t.name] || {} })) : []; });
  const held = (n) => (h.sustained || []).some((x) => (x.name || x) === n);
  const readied = (fx) => Boolean(cb?.ready?.[fx.react]);
  const use = (name, t, fx) => {
    const n = units[t.name] ?? fx.vary?.min ?? 0;
    if (fx.react) { commit(E.readyReaction(game, t.name, n).state); return; }
    onClose();
    if (cb && fx.attack) act(E.attackPlan(), (f) => E.useAbility(game, name, t.tier, f, { n }), null, { title: t.name });
    else if (cb && (fx.spell || fx.debuff || fx.curseMind || fx.dominate)) act(E.abilityDicePlan(), (f) => E.useAbility(game, name, t.tier, f, { n }), null, { title: t.name, ability: true });
    else commit(E.useAbility(game, name, t.tier, E.fakeFaces(E.abilityDicePlan()), { n }).state);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Your Abilities" icon="spark" wide>
      {rows.length ? rows.map(({ m, t, fx }) => {
        const cost = aetherCost(t); const short = cost > h.vit.aether; const passive = /Passive/.test(t.action) && !fx.absolution && !fx.foresee;
        const isHeld = held(t.name); const isReady = fx.react && readied(fx);
        const n = units[t.name] ?? fx.vary?.min ?? 0;
        const how = passive ? 'Always on' : howOf(fx);
        return (
          <div key={`${m}-${t.tier}`} className={`dbt-packrow ${isHeld || isReady ? 'on' : ''}`}>
            <span className="dbt-roundel sm"><Ico n={fx.attack ? 'sword' : fx.react ? 'shield' : fx.summon ? 'ghost' : 'spark'} size={18} /></span>
            <div className="t"><b>{t.name}</b><small className="kind">{m} · Tier {t.tier} · {t.action}{t.cost ? ` · ${t.cost}` : ''}</small><small>{t.text}</small>
              {how && <span className="chips"><em className={`dbt-chip sm ${passive ? 'ok' : ''}`}>{how}</em>{isHeld && <em className="dbt-chip sm gilt">Held</em>}{isReady && <em className="dbt-chip sm gilt">Readied</em>}</span>}</div>
            <div className="b">
              {fx.vary && !passive && !isHeld && <div className="dbt-step" title={fx.vary.label}><button type="button" onClick={() => setUnits((u) => ({ ...u, [t.name]: Math.max(fx.vary.min, n - (fx.vary.step || 1)) }))} aria-label="Less">−</button><b>{n}</b><button type="button" onClick={() => setUnits((u) => ({ ...u, [t.name]: n + (fx.vary.step || 1) }))} aria-label="More">+</button></div>}
              {fx.vary && !passive && <small className="unitlabel">{fx.vary.label}</small>}
              {passive ? null : isHeld ? <button type="button" className="dbt-btn sm ghost" onClick={() => commit(E.releaseSustained(game, t.name).state)}>Release</button>
                : <button type="button" className="dbt-btn sm primary" disabled={short && !fx.vary} title={short ? `Needs ${cost} Aether` : ''} onClick={() => use(m, t, fx)}>{fx.react ? (isReady ? 'Stand down' : 'Ready') : 'Use'}{cost && !isReady ? ` (${cost} Aether)` : ''}</button>}
            </div>
          </div>
        );
      }) : <p className="dbt-note">You have no Mastery Abilities yet. Spend your Ability Points on the character sheet.</p>}
      {(h.minions || []).length > 0 && <><h4 className="dbt-sub">Your Minions</h4>{h.minions.map((mm) => (
        <div key={mm.id} className="dbt-packrow"><span className="dbt-roundel sm"><Ico n="ghost" size={18} /></span><div className="t"><b>{mm.kind}</b><small>Health {mm.health} of {mm.max}{mm.rounds ? ` · ${mm.rounds} rounds left` : ''}. It acts after you each round; some foes will fight it instead of you (p. 93).</small></div>
          <div className="b">{has(h, 'Gravecaller') && (MINIONS[mm.kind]?.undead) && <button type="button" className="dbt-btn sm ghost" onClick={() => { onClose(); commit(E.sacrificeMinion(game, mm.id).state); }}>Sacrifice (D4 Wounds)</button>}</div></div>
      ))}</>}
      <p className="dbt-note">Attacks are rolled as a weapon attack with the Ability's changes; spells against your target, with a Magic Resistance check first if Magical. A Reaction is readied before the creatures act and is used up when it applies. Held Abilities keep their Aether out of your pool until you release them.</p>
    </Sheet>
  );
}

// Weapon Master's Dedication: one weapon, chosen once
export function DedicationBox({ game, commit }) {
  const h = game.hero; const [w, setW] = useState('');
  if (!has(h, 'Weapon Master') || h.dedicated || h.weapons.some((x) => x.bonus === 'd4')) return null;
  return (
    <div className="dbt-callout sm"><b>Weapon Master: choose your weapon</b>
      <p className="dbt-note">Dedication: +10 to its Skill and +D4 in its Damage Pool whenever you wield it. You choose once, for good (p. 54).</p>
      <div className="dbt-row"><select className="dbt-select" value={w} onChange={(e) => setW(e.target.value)} aria-label="Your weapon"><option value="">Choose…</option>{h.weapons.map((x) => <option key={x.name}>{x.name}</option>)}</select>
        <button type="button" className="dbt-btn sm primary" disabled={!w} onClick={() => commit(E.setDedication(game, w).state)}>Dedicate</button></div>
    </div>
  );
}

// what kind of play a Mastery suits, read from its tiers: spells, weapons, summoning, healing, stealth, survival
export function masteryStyle(M) {
  const all = M.tiers.map((t) => `${t.action} ${t.text}`).join(' ');
  const tags = [];
  if ((all.match(/Magical/g) || []).length >= 2) tags.push('Spells');
  if (/weapon|attack|strike|blow|melee/i.test(all) && (all.match(/weapon|attack|strike/gi) || []).length >= 3) tags.push('Weapons');
  if (/Summon|Minion|Companion|Elemental|Skeleton|Wight/i.test(all)) tags.push('Summoning');
  if (/heal|recover|Wounds|cure|remove.*condition/i.test(all)) tags.push('Healing');
  if (/Stealth|invisib|shadow|unseen|Vanish|sneak/i.test(all)) tags.push('Stealth');
  if (/Ration|Camp|trap|forag|Scaveng/i.test(all)) tags.push('Survival');
  if (/shield|Parry|block|Armor/i.test(all)) tags.push('Defence');
  return tags.slice(0, 3);
}
// a card for a Mastery: what it is, what kind of play it suits, its Feature and what Tier 1 gives you; the rest on demand
export function MasteryCard({ M, onTake, taken }) {
  const [more, setMore] = useState(false);
  const t1 = M.tiers[0];
  return (
    <article className={`dbt-mcard pick ${taken ? 'on' : ''}`}>
      <div className="hd"><b>{M.name}</b><small>p. {M.page}</small></div>
      <div className="tags">{masteryStyle(M).map((t) => <em key={t} className="dbt-chip sm">{t}</em>)}</div>
      <p className="dbt-fell">{M.blurb}</p>
      {M.feature && <p className="feat"><b>Always on · {M.feature.name}.</b> {M.feature.text}</p>}
      {t1 && <p className="t1"><b>Tier 1 · {t1.name}</b> <small>{t1.action}{t1.cost ? ` · ${t1.cost}` : ''}</small><br />{t1.text}</p>}
      {more && M.tiers.slice(1).map((t) => <p key={t.tier} className="tn"><b>Tier {t.tier} · {t.name}</b> <small>{t.action}{t.cost ? ` · ${t.cost}` : ''}</small><br />{t.text}</p>)}
      <div className="dbt-row"><button type="button" className="dbt-btn sm ghost" onClick={() => setMore((v) => !v)}>{more ? 'Fewer tiers' : 'Tiers 2 to 5'}</button>
        {onTake && <button type="button" className="dbt-btn sm primary" onClick={onTake} disabled={taken}>{taken ? 'Chosen' : 'Take this one'}</button>}</div>
    </article>
  );
}
export function MasteryPicker({ open, onClose, exclude = [], onPick, current }) {
  const [style, setStyle] = useState('');
  const list = MASTERY_NAMES.filter((n) => !exclude.includes(n)).map((n) => MASTERIES[n]).filter((M) => !style || masteryStyle(M).includes(style));
  return (
    <Sheet open={open} onClose={onClose} title="Choose a Mastery" icon="spark" wide>
      <p className="dbt-note">A Mastery is your survivor's path: a Feature that is always on once you take it, and five Tiers of Abilities you open one Ability Point at a time. A new survivor puts one point into each of two Masteries (p. 21).</p>
      <div className="dbt-seg wrapseg">{['', 'Spells', 'Weapons', 'Summoning', 'Healing', 'Stealth', 'Survival', 'Defence'].map((t) => <button key={t || 'all'} type="button" className={style === t ? 'on' : ''} onClick={() => setStyle(t)}>{t || 'All'}</button>)}</div>
      <div className="dbt-mpick">{list.map((M) => <MasteryCard key={M.name} M={M} taken={current === M.name} onTake={() => { onPick(M.name); onClose(); }} />)}</div>
    </Sheet>
  );
}

// Points to spend, at the top of the sheet (29 Oct 2026, Simon: "allow me to add them with a + and - then confirm the
// changes"): a + and − for each Mastery you follow (and a new one, while you have room for two), what each point would
// open, how many are left; nothing changes until you confirm.
export function PointsBox({ game, commit }) {
  const h = game.hero; const pts = h.abilityPoints || 0;
  const mine = (h.masteries || []).map((m) => ({ m, M: masteryOf(m) })).filter((x) => x.M);
  const [draft, setDraft] = useState({}); const [pick, setPick] = useState(''); const [choosing, setChoosing] = useState(false);
  const used = Object.values(draft).reduce((t, n) => t + n, 0); const left = pts - used;
  const room = mine.filter((x) => !x.m.amulet).length < 2;
  const rows = [...mine.map(({ m, M }) => ({ name: M.name, have: tiersOf(m), M })), ...(room && pick && MASTERIES[pick] ? [{ name: pick, have: 0, M: MASTERIES[pick], isNew: true }] : [])];
  const step = (name, d, have) => setDraft((x) => { const n = Math.max(0, Math.min(5 - have, (x[name] || 0) + d)); if (d > 0 && left <= 0) return x; return { ...x, [name]: n }; });
  const confirm = () => {
    let st = game;
    for (const r of rows) for (let i = 0; i < (draft[r.name] || 0); i++) st = E.spendAbilityPoint(st, r.name).state;
    commit(st); setDraft({}); setPick('');
  };
  if (pts <= 0) return null;
  return (
    <div className="dbt-points" id="dbt-points">
      <div className="hd"><Ico n="star" size={16} /><b>Points to spend</b><span className={`left ${left === 0 ? 'done' : ''}`}>{left} of {pts} left</span></div>
      <p className="dbt-note">Each Ability Point opens the next Tier of a Mastery, from Tier 1 down to Tier 5 (p. 21). You may follow two Masteries, and a third through an Amulet.</p>
      {rows.map((r) => { const add = draft[r.name] || 0; const opens = r.M.tiers.slice(r.have, r.have + add); return (
        <div key={r.name} className="row">
          <div className="t"><b>{r.name}{r.isNew ? ' (new)' : ''}</b><small>Tier {r.have}{add ? ` → ${r.have + add}` : ''} of 5{opens.length ? ` · opens ${opens.map((t) => t.name).join(', ')}` : r.have >= 5 ? ' · all open' : ` · next: ${r.M.tiers[r.have]?.name || ''}`}</small></div>
          <div className="dbt-step"><button type="button" onClick={() => step(r.name, -1, r.have)} disabled={!add} aria-label={`One fewer for ${r.name}`}>−</button><b>{add}</b><button type="button" onClick={() => step(r.name, 1, r.have)} disabled={left <= 0 || r.have + add >= 5} aria-label={`One more for ${r.name}`}>+</button></div>
        </div>
      ); })}
      {room && !pick && (
        <div className="row"><div className="t"><b>A new Mastery</b><small>You follow {mine.filter((x) => !x.m.amulet).length} of 2.</small></div>
          <button type="button" className="dbt-btn sm" onClick={() => setChoosing(true)}><Ico n="spark" size={14} /> Browse the Masteries</button></div>
      )}
      {room && pick && <p className="dbt-note">Chose {pick} by mistake? <button type="button" className="dbt-link" onClick={() => { setPick(''); setDraft((x) => { const y = { ...x }; delete y[pick]; return y; }); setChoosing(true); }}>Choose another</button></p>}
      <MasteryPicker open={choosing} onClose={() => setChoosing(false)} exclude={mine.map((x) => x.M.name)} current={pick} onPick={(n) => { setPick(n); setDraft((x) => ({ ...x, [n]: Math.max(1, x[n] || 0) })); }} />
      <div className="dbt-row"><button type="button" className="dbt-btn primary" disabled={!used} onClick={confirm}><Ico n="check" size={16} /> Confirm {used ? `${used} point${used > 1 ? 's' : ''}` : ''}</button>
        <button type="button" className="dbt-btn ghost" disabled={!used && !pick} onClick={() => { setDraft({}); setPick(''); }}>Reset</button></div>
    </div>
  );
}

// on the character sheet: your Masteries, Ability Points to spend, and the full text of every tier
export function MasteryBox({ game, commit }) {
  const h = game.hero; const pts = h.abilityPoints || 0; const mine = (h.masteries || []).map((m) => ({ m, M: masteryOf(m) })).filter((x) => x.M);
  const [adding, setAdding] = useState(''); const [browse, setBrowse] = useState(false);
  const canAdd = pts > 0 && mine.filter((x) => !x.m.amulet).length < 2;
  return (
    <div className="dbt-masterybox">
      {pts > 0 && <p className="dbt-callout sm"><Ico n="star" size={14} /> {pts} Ability Point{pts > 1 ? 's' : ''} to spend. Each opens the next Tier of a Mastery; a new survivor puts one in each of two Masteries (p. 21).</p>}
      <div className="dbt-mgrid">{mine.map(({ m, M }) => (
        <div key={M.name} className="dbt-mcard">
          <div className="hd"><b>{M.name}</b>{m.amulet && <em className="dbt-chip sm">Amulet</em>}<small>p. {M.page}</small></div>
          <p className="dbt-fell">{M.blurb}</p>
          {M.feature && <Tip as="div" className="feat" tip={{ title: M.feature.name, body: M.feature.text, page: M.page }}><b>Feature</b><span>{M.feature.name}</span></Tip>}
          {M.tiers.map((t) => { const on = t.tier <= tiersOf(m); return (
            <Tip key={t.tier} as="div" className={`tier ${on ? 'on' : ''}`} tip={{ title: `Tier ${t.tier}: ${t.name}`, body: `${t.action}${t.cost ? `. ${t.cost}` : ''}. ${t.text}`, page: M.page }}><b>Tier {t.tier}</b><span>{t.name}</span>{!on && t.tier === tiersOf(m) + 1 && pts > 0 && <button type="button" className="dbt-btn sm" onClick={(e) => { e.stopPropagation(); commit(E.spendAbilityPoint(game, M.name).state); }}>Open</button>}</Tip>
          ); })}
        </div>
      ))}</div>
      {canAdd && (<>
        <div className="dbt-row"><button type="button" className="dbt-btn sm" onClick={() => setBrowse(true)}><Ico n="spark" size={14} /> Browse the Masteries</button>{adding && <><span className="dbt-note">{adding}</span><button type="button" className="dbt-btn sm primary" onClick={() => { commit(E.spendAbilityPoint(game, adding).state); setAdding(''); }}>Take it up</button></>}</div>
        <MasteryPicker open={browse} onClose={() => setBrowse(false)} exclude={mine.map((x) => x.M.name)} current={adding} onPick={setAdding} />
      </>)}
      {adding && MASTERIES[adding] && <div className="dbt-callout sm"><b>{adding}</b><p className="dbt-fell">{MASTERIES[adding].blurb}</p><p className="dbt-note">Feature: {MASTERIES[adding].feature?.name}. {MASTERIES[adding].feature?.text} Tier 1: {MASTERIES[adding].tiers[0].name}. {MASTERIES[adding].tiers[0].text}</p></div>}
    </div>
  );
}

export function GoalsBox({ game, commit }) {
  const h = game.hero; const active = h.goalsActive || []; const done = h.goalsDone || [];
  const [adding, setAdding] = useState('');
  const left = GOALS.filter((g) => !active.includes(g.name) && !done.includes(g.name));
  return (
    <div className="dbt-goals">
      {active.map((n) => { const g = GOALS.find((x) => x.name === n); const p = goalProgress(h, n); return (
        <Tip key={n} as="div" className="dbt-goal" tip={{ title: n, body: `${g.obj}. Reward: ${g.reward}.`, page: 64 }}><b>{n}</b><small>{g.obj}</small><Bar value={p} max={g.n} tone="gilt" thin /><small>{p} of {g.n}</small></Tip>
      ); })}
      {done.length > 0 && <p className="dbt-note">Completed: {done.join(', ')}.</p>}
      {active.length < 2 && (
        <div className="dbt-row"><select className="dbt-select" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Choose a Personal Goal"><option value="">Choose a Personal Goal…</option>{left.map((g) => <option key={g.name} value={g.name}>{g.name}: {g.obj}</option>)}</select>
          <button type="button" className="dbt-btn sm primary" disabled={!adding} onClick={() => { commit(E.chooseGoal(game, adding).state); setAdding(''); }}>Pursue it</button></div>
      )}
      {active.length < 2 && <p className="dbt-note">Two goals at a time, never changed once chosen. The book suggests Overseer Overthrown first: its reward is an Amulet, a third Mastery (p. 64).</p>}
    </div>
  );
}

export function PerksBox({ game }) {
  const h = game.hero; const perks = (h.perks || []).filter((p) => PERKS[p]);
  const other = (h.perks || []).filter((p) => !PERKS[p]);
  return (
    <div>
      {perks.length || other.length ? <ul className="dbt-slist">{perks.map((p) => <li key={p}><b>{p}.</b> {PERKS[p]}</li>)}{other.map((p) => <li key={p}>{p}</li>)}</ul>
        : <p className="dbt-note">None yet. Perks come from completing Personal Goals (p. 63).</p>}
      {h.rot > 0 && <p className="dbt-callout sm"><Ico n="rot" size={14} /> The Rot, stage {h.rot}: {ROT[h.rot]} Each rest, an Endurance check or it spreads (p. 87).</p>}
    </div>
  );
}
