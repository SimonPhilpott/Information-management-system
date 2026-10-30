// The character sheet, laid out after the Ker Nethalas sheet in the books folder (Ker_Nethalas_CharSheet.pdf):
// page one the survivor (vitals, skills, resistances, weapons, masteries), page two gear and armour (with the body
// silhouette, its armour and wounds), page three mind and notes (madness, perks, notes, damage resistances).
import React, { useState } from 'react';
import * as E from '../kn/engine';
import { GLOSSARY } from '../kn/glossary';
import { lookupItem } from '../../Material/itemCatalog';
import Ico, { itemIcon } from '../ui/Ico';
import { Tip, Term } from '../ui/Tip';
import { Medallion, Seg } from '../ui/Bits';
import { Silhouette, armorAt } from '../ui/Figures';
import PortraitSheet from './Portrait';
import { itemInfo } from '../ui/gearInfo';
import { MasteryBox, GoalsBox, PerksBox, ItemRow, PointsBox, DedicationBox } from './Pack';
import { encumbrance, armourByName } from '../kn/loot';
import { levelDue } from '../kn/progress';

const DAMAGE_TYPES = ['Acid', 'Arcane', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Holy', 'Infernal', 'Lightning', 'Necrotic', 'Piercing', 'Poison', 'Psychic', 'Slashing'];
const SKILL_NOTE = { Acrobatics: 10, Athletics: 10, Dodge: 10, Perception: 20 };

function itemTip(name) {
  const it = lookupItem(name);
  return { title: name, icon: itemIcon(name), badge: it?.category, body: it?.description || 'Something you carry. The book gives it no special rules.', live: it?.passive || null,
    extra: it?.action ? <p className="dbt-tip-act"><b>{it.action.label}.</b> {it.action.description}</p> : null };
}
function Item({ name, h }) {
  const t = h ? { icon: itemIcon(name), ...itemInfo(h, name) } : itemTip(name);
  return <Tip as="button" type="button" className="dbt-item" tip={t}><Ico n={itemIcon(name)} size={16} /><span>{name}</span></Tip>;
}
function Plate({ children, className = '' }) { return <div className={`dbt-splate ${className}`}><span>{children}</span></div>; }

function VitalRow({ label, cur, max, icon }) {
  return (
    <Tip as="div" className="dbt-svital" tip={{ title: label, icon, ...GLOSSARY[label] }}>
      <div className="box"><b>{cur}</b><i>/</i><span>{max}</span></div>
      <Plate>{label}</Plate>
    </Tip>
  );
}

function PageOne({ game, update, onPortrait, commit }) {
  const h = game.hero, v = h.vit;
  const skills = E.SKILLS.concat(Object.keys(h.skills).filter((k) => !E.SKILLS.includes(k)));
  const tier = E.exhTier(h);
  return (
    <div className="dbt-spage">
      <PointsBox game={game} commit={commit} />
      <div className="dbt-s-top">
        <div className="dbt-s-logo"><span className="kn">Ker Nethalas</span><span className="sub">Into the Midnight Throne</span></div>
        <div className="dbt-s-id">
          <button type="button" className="dbt-pt-open" onClick={onPortrait} aria-label={`${h.name}: who they are now`}><Medallion src={h.avatar} name={h.name} size={84} /><span>Who they are now</span></button>
          <div className="fields">
            <div className="dbt-sfield wide"><Plate>Name</Plate><b>{h.name}</b></div>
            <div className="row"><div className="dbt-sfield"><Plate>Level</Plate><b>{h.level}</b>{levelDue(h) && <em className="dbt-chip sm gilt">Level up on the play screen</em>}</div><Tip as="div" className="dbt-sfield" tip={{ title: 'Experience', body: '1,000 XP brings a new level. +10 for a door, trap or book; +50 for a fight or a new Domain; +200 for an Overseer.', page: 62 }}><Plate>XP</Plate><b>{v.xp}</b></Tip></div>
          </div>
        </div>
      </div>
      <div className="dbt-s-grid">
        <div className="dbt-s-col">
          <VitalRow label="Health" cur={v.health} max={v.maxHealth} icon="heart" />
          <VitalRow label="Toughness" cur={v.tough} max={v.maxTough} icon="shield" />
          <VitalRow label="Aether" cur={v.aether} max={v.maxAether} icon="spark" />
          <VitalRow label="Sanity" cur={v.sanity} max={v.maxSanity} icon="brain" />
          <Tip as="div" className="dbt-sline" tip={{ title: 'Damage Modifier', body: 'A fixed bonus added to the die you keep from your Damage Pool.', page: 81 }}><Plate>Damage modifier</Plate><b>{h.dmgMod ? `+${h.dmgMod}` : '+0'}</b></Tip>
          <Tip as="div" className="dbt-sline" tip={{ title: 'Exhaustion', icon: 'hourglass', ...GLOSSARY.Exhaustion }}><Plate>Exhaustion</Plate><b>{v.exh}</b>
            <div className="dbt-exhbar" aria-hidden="true">{[[0, 10], [11, 15], [16, 20], [21, 25]].map(([a, b], i) => <i key={a} className={`z${i} ${tier === i ? 'on' : ''}`} style={{ flex: b - a + 1 }} />)}<u style={{ left: `${(Math.min(25, v.exh) / 25) * 100}%` }} /></div></Tip>
          <Tip as="div" className="dbt-slight" tip={{ title: 'Lightsource', icon: 'torch', ...GLOSSARY.Light, live: `${v.light} rooms left. ${h.items.torches} spare Torches.` }}>
            <Plate>Lightsource <small>-1 / room</small></Plate>
            <div className="boxes">{Array.from({ length: 20 }, (_, i) => <i key={i} className={i < v.light ? 'lit' : ''} />)}</div>
          </Tip>
          <Tip as="div" className="dbt-sline" tip={{ title: 'The Rot', icon: 'rot', ...GLOSSARY['The Rot'] }}><Plate>The Rot</Plate><b>Stage {h.rot || 0}</b></Tip>
        </div>
        <div className="dbt-s-col">
          <div className="dbt-sgoals"><Plate>Personal goals</Plate>
            <GoalsBox game={game} commit={commit} />
            {h.goals ? <p className="dbt-note">Your own words: {h.goals}</p> : null}</div>
          <div className="dbt-sbox"><Plate className="bar">Skills</Plate>
            <div className="dbt-skills">{skills.map((k) => (
              <Tip key={k} as="div" className="dbt-skill" tip={{ title: k, ...(GLOSSARY[k] || { body: E.WEAPON_SKILLS.includes(k) ? 'The ability to fight with weapons of this kind.' : 'A Skill from your old life.' }), live: h.marks[k] ? 'Marked: you rolled doubles under it. Try to improve it at Camp.' : null, page: GLOSSARY[k]?.page || 19 }}>
                <i className={`tick ${h.marks[k] ? 'on' : ''}`} aria-label={h.marks[k] ? 'marked for improvement' : ''}>{h.marks[k] ? '✓' : ''}</i>
                <span>{k}{SKILL_NOTE[k] ? <small> ({SKILL_NOTE[k]})</small> : null}</span><b>{E.skillOf(h, k)}</b>
              </Tip>
            ))}</div>
          </div>
          <div className="dbt-sbox"><Plate className="bar">Resistances</Plate>
            <div className="dbt-resist">{Object.entries(h.resist).map(([k, n]) => <Tip key={k} as="div" tip={{ title: k, ...GLOSSARY[k] }}><span>{k}</span><b>{n}</b></Tip>)}</div></div>
        </div>
      </div>
      <div className="dbt-sbox"><Plate className="bar">Weapons</Plate>
        <table className="dbt-stable"><thead><tr><th>Weapon</th><th>Skill</th><th>Notes</th></tr></thead><tbody>
          {h.weapons.map((w, i) => <tr key={w.name} className={i === h.wield ? 'on' : ''}><td><Item name={w.name} h={h} />{i === h.wield ? <em> in hand</em> : null}</td><td>{w.skill} <b>{E.skillOf(h, w.skill)}</b></td>
            <td><Term name="Damage Pool">{w.dmg.toUpperCase()}{w.bonus ? ` + ${w.bonus.toUpperCase()}` : ''}{w.plus ? ` +${w.plus}` : ''}</Term>{w.dtype ? ` ${w.dtype}` : ''} · <Term name="Speed">Speed {w.speed}</Term>{w.parry ? <> · <Term name="Parry">Parrying</Term></> : ''}{(w.traits || []).filter((t) => t !== 'Parrying').map((t) => ` · ${t}`)}{w.broken ? ' · broken' : ''}</td></tr>)}
        </tbody></table></div>
      <div className="dbt-sbox"><Plate className="bar">Masteries</Plate>
        <MasteryBox game={game} commit={commit} />
        <DedicationBox game={game} commit={commit} />
        {!(h.masteries || []).length && !(h.abilityPoints > 0) && <p className="dbt-note">No Masteries yet. Each level brings an Ability Point to open one (p. 21).</p>}
      </div>
    </div>
  );
}

function PageTwo({ game, commit, act }) {
  const h = game.hero; const inv = [...(h.misc || [])]; const worn = h.worn || {}; const enc = encumbrance(h);
  const main = h.weapons[h.wield]?.name, off = h.weapons.find((w, i) => i !== h.wield && !/fist/i.test(w.name))?.name;
  const nm = (x) => x?.name || null;
  const slots = [['Main-hand', main], ['Off-hand', nm(worn.Shield) || off], ['Belt', nm(worn.Belt) || (h.pack || []).find((x) => x.name === 'Belt' && x.equipped)?.name], ['Helmet', nm(worn.Head)], ['Armor', nm(worn.Torso) || h.armorName || (h.armor?.Torso ? 'Breastplate' : null)], ['Vambraces', nm(worn.Arms)], ['Greaves', nm(worn.Legs)], ['Gloves', nm(worn.Gloves)], ['Boots', nm(worn.Boots)], ['Amulet', nm(worn.Amulet)], ['Ring', nm(worn.Ring1)], ['Ring', nm(worn.Ring2)]];
  const locs = [['Legs', ['Left Leg', 'Right Leg']], ['Torso (Chest + Abdomen)', ['Chest', 'Abdomen']], ['Arms', ['Left Arm', 'Right Arm']], ['Head', ['Head']]];
  return (
    <div className="dbt-spage">
      <div className="dbt-s-grid">
        <div className="dbt-s-col">
          <div className="dbt-sbox"><Plate className="bar">Equipped gear</Plate>
            <div className="dbt-slots">{slots.map(([k, v], i) => <div key={i} className="slot"><b>{k}</b>{v ? <Item name={v} h={h} /> : <span className="dbt-emptyslot">-</span>}</div>)}</div></div>
          <div className="dbt-row2">
            <div className="dbt-sbox"><Plate className="bar">Wealth</Plate><Tip as="div" className="dbt-sline" tip={{ title: 'Coins', body: 'Spent with Traders. Coins and gems count against your item slots, a slot for every 100.', page: 205 }}><Ico n="coin" size={18} /><span>Coins</span><b>{h.items.coins}</b></Tip></div>
            <div className="dbt-sbox"><Plate className="bar">Supplies</Plate>
              {[['Crafting Supplies', h.items.crafting, 'chain'], ['Cooking Ingredients', h.items.cooking, 'bread'], ['Ration', h.items.rations, 'ration']].map(([k, n, ic]) => <Tip key={k} as="div" className="dbt-sline" tip={{ title: k, icon: ic, ...GLOSSARY[k] }}><Ico n={ic} size={18} /><span>{k === 'Ration' ? 'Rations' : k}</span><b>{n}</b></Tip>)}</div>
          </div>
          <div className="dbt-sbox"><Plate className="bar">Armor (protection &amp; integrity)</Plate>
            <div className="dbt-armor">
              <Silhouette hero={h} armor={h.armor} wounds={h.wounds || []} label="Your armour and wounds" className="you big" />
              <div className="locs">{locs.map(([k, parts]) => { const a = armorAt(h.armor, parts[0]); const ws = (h.wounds || []).filter((w) => parts.includes(w.loc)); return (
                <Tip key={k} as="div" className="loc" tip={{ title: k, body: GLOSSARY.Armor.body, live: ws.length ? `${ws.length} hits here since your last camp.` : null, page: 83 }}><b>{k}</b><span>Protection {a}</span><span className={ws.length ? 'hurt' : ''}>{ws.length ? `${ws.length} wound${ws.length > 1 ? 's' : ''}` : 'Unhurt'}</span></Tip>
              ); })}{['Torso', 'Arms', 'Legs', 'Head', 'Shield'].filter((k) => worn[k]?.die).map((k) => <p key={k} className="dbt-note">{worn[k].name}: Integrity D{worn[k].die}{armourByName(worn[k].base || worn[k].name)?.integ ? ` (best D${armourByName(worn[k].base || worn[k].name).integ})` : ''}.</p>)}
              <p className="dbt-note">After a fight in which you were hit, each worn piece rolls its Integrity die: 1-2 and it drops a step; on a D4 it is ruined. Repair at Camp (p. 83).</p></div>
            </div>
          </div>
        </div>
        <div className="dbt-s-col">
          <div className="dbt-sbox"><Plate className="bar">Belt quickslots (D4)</Plate><div className="dbt-num">{[1, 2, 3, 4].map((n) => <div key={n}><b>{n}</b><span className="dbt-emptyslot">-</span></div>)}</div></div>
          <div className="dbt-sbox"><Plate className="bar">Carried ({enc.used} of {enc.cap} slots)</Plate>
            {(h.pack || []).map((x) => <ItemRow key={x.id} x={x} game={game} commit={commit} act={act} />)}
            {inv.length > 0 && <div className="dbt-num">{inv.map((t, i) => <div key={t + i}><b>{i + 1}</b><Item name={t} h={h} /></div>)}</div>}
            {!(h.pack || []).length && !inv.length && <p className="dbt-note">Nothing yet.</p>}</div>
          <div className="dbt-sbox"><Plate className="bar">Pouch</Plate>
            <div className="dbt-num">{[['Torch', h.items.torches], ['Flint and tinder', h.items.tinder], ['Bandage', h.items.bandages], ['Lockpick', h.items.lockpicks || 0], ["Thieves' Tools", h.items.tools || 0], ['Attunement Crystal', h.items.crystals || 0], ['Candle', h.items.candles || 0], ['Lamp Oil', h.items.oil || 0], ['Flare', h.items.flares || 0], ['Ritual Components', h.items.ritual || 0]].map(([k, n], i) => <div key={k}><b>{i + 1}</b>{n ? <><Item name={k} h={h} /><em>×{n}</em></> : <span className="dbt-emptyslot">{k}: none</span>}</div>)}</div></div>
        </div>
      </div>
    </div>
  );
}

function PageThree({ game, update }) {
  const h = game.hero; const rot = h.rot || 0;
  const res = (t) => ({ Immune: rot >= 1 && t === 'Necrotic', Vulnerable: rot >= 1 && t === 'Holy', Resistant: (h.gearFx?.resist || []).includes(t) });
  return (
    <div className="dbt-spage">
      <div className="dbt-row2">
        <div className="dbt-sbox tall"><Plate className="bar">Madness</Plate>{(h.madness || []).length ? <ul className="dbt-slist">{h.madness.map((m, i) => <li key={i}>{m}</li>)}</ul> : <p className="dbt-note">None yet. At 0 Sanity you roll D10 on the Madness table (p. 91).</p>}</div>
        <div className="dbt-sbox tall"><Plate className="bar">Perks</Plate><PerksBox game={game} /></div>
      </div>
      <div className="dbt-sbox"><Plate className="bar">Notes</Plate>
        {h.backstory && <p className="dbt-fell dbt-back">{h.backstory.split('\n')[0]}</p>}
        <textarea id="dbt-notes" className="dbt-notes" value={h.notes || ''} placeholder="Your own notes: names, clues, promises, grudges." onChange={(e) => update({ notes: e.target.value })} rows={6} /></div>
      <div className="dbt-sbox"><Plate className="bar">Damage vulnerabilities &amp; resistances</Plate>
        <div className="dbt-tablewrap"><table className="dbt-stable dmg"><thead><tr><th /><th>Immune</th><th>Vulnerable</th><th>Resistant</th><th>Restored</th><th>Reduction</th></tr></thead>
          <tbody>{DAMAGE_TYPES.map((t) => { const r = res(t); return <tr key={t}><th>{t}</th>{['Immune', 'Vulnerable', 'Resistant', 'Restored'].map((c) => <td key={c}><i className={`tick ${r[c] ? 'on' : ''}`}>{r[c] ? '✓' : ''}</i></td>)}<td>{(h.reduce || {})[t] ? `-${h.reduce[t]}` : '-'}</td></tr>; })}</tbody></table></div>
        <p className="dbt-note">The Rot at stage 1 makes you immune to Necrotic damage and vulnerable to Holy (p. 87). Attuned gear adds resistances; damage-expert goals add reduction.</p></div>
    </div>
  );
}

export default function SheetView({ game, commit, act, startPage = 'one' }) {
  const [page, setPage] = useState(startPage === 'points' ? 'one' : startPage);
  React.useEffect(() => { setPage(startPage === 'points' ? 'one' : startPage); if (startPage === 'points') setTimeout(() => document.getElementById('dbt-points')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120); }, [startPage]);
  const [pt, setPt] = useState(false);
  const update = (patch) => commit({ ...game, hero: { ...game.hero, ...patch }, updated: Date.now() });
  return (
    <div className="dbt-page dbt-sheetview">
      <Seg value={page} onChange={setPage} label="Sheet pages" options={[['one', 'Survivor', 'helm'], ['two', 'Gear and armour', 'pack'], ['three', 'Mind and notes', 'brain']]} />
      <div className="dbt-paper-sheet">
        {page === 'one' && <PageOne game={game} update={update} onPortrait={() => setPt(true)} commit={commit} />}
        {page === 'two' && <PageTwo game={game} commit={commit} act={act} />}
        {page === 'three' && <PageThree game={game} update={update} />}
      </div>
      {pt && <PortraitSheet game={game} commit={commit} open onClose={() => setPt(false)} />}
    </div>
  );
}
