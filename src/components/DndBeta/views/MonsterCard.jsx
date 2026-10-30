// A creature's card, laid out like the book's stat blocks (Gravebound Edition, chapter V): its picture, what it is,
// the numbers (adapted to your level when `stat` is given), traits, its D6 table of actions, and where it has been hit
// (blood on its silhouette). `compact` is the fight version: the picture, key numbers, a health bar for each one (tap
// to target) and the hits on the one you are fighting.
// A creature's picture can be given here: copy it from the Ker Nethalas Companion and paste it, or upload a file.
import React, { useRef, useState } from 'react';
import { BESTIARY, statOf, armorAt, traitText, rangeOf } from '../kn/creatures';
import { GLOSSARY } from '../kn/glossary';
import { Tip, Term } from '../ui/Tip';
import { CreatureArt, Silhouette, artChanged } from '../ui/Figures';
import { Bar } from '../ui/Bits';
import Ico from '../ui/Ico';

const STAT_TIPS = {
  Mind: 'Its awareness: what your Perception is matched against for Initiative, and your Stealth to surprise it.',
  Endurance: 'Its stamina against poison, bleeding and the like.',
  Body: 'Its raw strength: what you match your Athletics against to break its grip.',
  Health: 'Damage it can take. Creatures have no Toughness.',
  'Combat Skill': "What it rolls under to attack and to defend. Your weapon's Speed is taken off it.",
  'Magic Resistance': 'What your Magical Abilities must overcome.',
};
const TRAIT_TIPS = {
  Alert: 'It cannot be surprised in any way.', Frightening: 'A Resolve check at the start of the fight, or lose 2 Sanity (one check for a group).', Horrifying: 'A Resolve check at the start of the fight, or lose 4 Sanity.',
  Pack: '+5 Combat Skill for each other one of its kind still alive.', Penetrating: 'Its attacks ignore this much Armor.', Ruthlessness: 'This many extra turns each round; each stack of Stunned costs one.',
  Savage: 'You cannot Parry it: only Dodge.', Swift: 'It ignores every Reaction penalty.', Venomous: 'When it damages you, Endurance or Poisoned (1).',
};
const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const dmgText = (a) => (a.dmg ? `${a.dmg.toUpperCase()} ${a.dtype || ''} damage` : '');

function ArtSetter({ name, onDone }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [open, setOpen] = useState(false);
  const file = useRef(null);
  const send = async (blob) => {
    if (!blob || !/^image\//.test(blob.type)) { setErr('That is not a picture.'); return; }
    setBusy(true); setErr('');
    try {
      const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(blob); });
      const res = await fetch('/api/dnd/beta/creature-art', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, image: data }) });
      const d = await res.json().catch(() => ({})); if (!res.ok || d.success === false) throw new Error(d.error || `HTTP ${res.status}`);
      artChanged(name); setOpen(false); onDone?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (!open) return <button type="button" className="dbt-link" onClick={() => setOpen(true)}>Give it a picture</button>;
  return (
    <div className="dbt-artset" tabIndex={0} role="region" aria-label={`A picture for ${name}`}
      onPaste={(e) => { const it = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith('image/')); if (it) { e.preventDefault(); send(it.getAsFile()); } }}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); send(e.dataTransfer.files?.[0]); }}>
      <p className="dbt-note">On the <a href={`https://www.kernethalas-companion.com/bestiary/${slug(name)}`} target="_blank" rel="noreferrer">Ker Nethalas Companion</a>, right-click the {name} picture and choose Copy image. Then click here and paste (Ctrl+V), drop a file, or upload one.</p>
      <div className="dbt-row"><input ref={file} id={`dbt-art-${slug(name)}`} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => send(e.target.files?.[0])} />
        <button type="button" className="dbt-btn sm" disabled={busy} onClick={() => file.current?.click()}><Ico n="eye" size={16} /> {busy ? 'Saving...' : 'Upload a picture'}</button>
        <button type="button" className="dbt-btn sm ghost" onClick={() => setOpen(false)}>Not now</button></div>
      {err && <p className="dbt-err" role="alert">{err}</p>}
    </div>
  );
}

const armorLine = (c) => {
  const parts = Object.entries(c.armor).map(([k, v]) => `${v} ${k === '*' ? 'all over' : k}`);
  for (const p of c.armorPlus || []) parts.push(`+${p.n} all${p.except ? ` but ${p.except}` : ''}`);
  return parts.length ? parts.join(', ') : '–';
};
const condsOf = (a) => [...Object.entries(a.conds || {}).filter(([, n]) => n).map(([k, n]) => `${k}${n > 1 ? ` ${n}` : ''}`), ...(a.buffs || []).map((b) => b.from)];

export function MonsterCard({ name, alive = [], target, onTarget, compact, lastHit, stat = null, statOf: statFor = null }) {
  const b = BESTIARY[name];
  const [, redraw] = useState(0);
  if (!b) return null;
  const c = stat || statOf(name);
  const sel = alive.find((a) => a.id === target) || alive[0];
  const selStat = sel && statFor ? statFor(sel) : c;
  const typeText = b.type.join(', ');
  const traits = c.traits.map((t) => <Tip key={t.name} tip={{ title: traitText(t), body: TRAIT_TIPS[t.name], page: 132 }} className="dbt-chip ox">{traitText(t)}</Tip>);
  if (compact) {
    return (
      <article className="dbt-foe-big">
        <div className="banner"><CreatureArt name={name} /><div className="nm"><b>{name}</b><small>{typeText}{c.adapted?.length ? ' · adapted to your level' : ''}{c.influence ? ` · ${c.influence}` : ''}</small></div>
          <Tip tip={{ title: name, body: b.desc, page: b.page, badge: typeText }} className="info"><Ico n="info" size={18} /></Tip></div>
        <div className="stats">
          {[['Combat Skill', c.combat], ['Health', c.health], ['Mind', c.mind], ['Body', c.body]].map(([k, v]) => <Tip key={k} tip={{ title: k, body: STAT_TIPS[k], page: 131 }} className="st"><small>{k === 'Combat Skill' ? 'Combat' : k}</small><b>{v}</b></Tip>)}
          <Tip tip={{ title: 'Armor', body: GLOSSARY.Armor.body, page: 83 }} className="st"><small>Armor</small><b>{armorLine(c)}</b></Tip>
        </div>
        <div className="traits">{traits}{c.special?.map((x) => <span key={x} className="dbt-chip">{x}</span>)}</div>
        <div className="body">
          <div className="dbt-foes">
            {alive.map((a) => (
              <button key={a.id} type="button" className={`dbt-foe ${sel?.id === a.id ? 'on' : ''}`} onClick={() => onTarget?.(a.id)} aria-pressed={sel?.id === a.id} aria-label={`${a.kind || name} ${a.n}: ${a.health} of ${a.max} Health${sel?.id === a.id ? ', your target' : ''}`}>
                <span><Ico n={sel?.id === a.id ? 'swords' : 'skull'} size={14} />{a.kind ? `${a.kind.split(' ')[0]} ` : ''}{alive.length > 1 ? a.n : ''}</span>
                <Bar value={a.health} max={a.max} /><small>{a.health}/{a.max}{a.temp ? ` +${a.temp}` : ''}</small>
                {condsOf(a).length > 0 && <small className="conds">{condsOf(a).join(', ')}</small>}
              </button>
            ))}
          </div>
          {sel && <div className="fig"><Silhouette anatomy={selStat.anatomy || 'none'} weak={selStat.weak} armorOf={(loc) => armorAt(selStat, loc, sel.down)} wounds={sel.wounds || []} highlight={lastHit?.enemy === sel.id ? lastHit.loc : null} label={`Where ${sel.kind || name} ${sel.n} has been hit`} className="foe" /><small>{alive.length > 1 ? `No. ${sel.n}` : 'Its wounds'}</small></div>}
        </div>
      </article>
    );
  }
  const stats = [['Mind', c.mind], ['Endurance', c.endurance], ['Body', c.body], ['Health', `${c.health}${b.healthPerLevel ? ` (${b.health}+${b.healthPerLevel}/level)` : ''}`], ['Combat Skill', c.combat], ['Magic Resistance', c.magicRes]];
  const number = typeof b.number === 'number' ? (b.number === 1 ? 'alone' : `${b.number} at a time`) : `${b.number.toUpperCase()} at a time`;
  return (
    <article className="dbt-bestiary">
      <div className="top">
        <div className="pic"><CreatureArt name={name} /><ArtSetter name={name} onDone={() => redraw((n) => n + 1)} /></div>
        <div className="head">
          <span className="dbt-kick">{typeText} · appears {number}{b.overseer ? ' · an Overseer' : ''}</span>
          <h3>{name}</h3>
          <p className="dbt-fell">{b.desc}</p>
          <div className="traits">{traits}{c.special?.map((x) => <span key={x} className="dbt-chip">{x}</span>)}
            <Term name="Hit Location"><span className="dbt-chip">{b.anatomy || 'No Hit Location table'}</span></Term>{b.weak && <span className="dbt-chip">Weak Spot: {b.weak}</span>}</div>
        </div>
      </div>
      <div className="dbt-statgrid">
        {stats.map(([k, v]) => <Tip key={k} tip={{ title: k, body: STAT_TIPS[k], page: 131 }} className="cell"><small>{k}</small><b>{v}</b></Tip>)}
        <Tip tip={{ title: 'Armor', body: GLOSSARY.Armor.body, page: 83 }} className="cell"><small>Armor</small><b>{armorLine(c)}</b></Tip>
        <Tip tip={{ title: 'Spoils', body: 'What you roll for once it is dead (pp. 213, 222).', page: 213 }} className="cell"><small>Spoils</small><b>{b.spoils || '–'}</b></Tip>
      </div>
      {b.level.length > 0 && (
        <div className="dbt-leveladapt"><h4>Level Adaptation <small>{c.adapted?.length ? `applied: after level ${c.adapted.join(' and ')}` : 'none applied yet'}</small></h4>
          {b.level.map((l) => <p key={l.at} className={c.adapted?.includes(l.at) ? 'on' : ''}><b>After level {l.at}:</b> {[l.health && `+${l.health} Health`, ...l.dmg.map((d) => `+${d} damage`), l.combat && `+${l.combat} Combat Skill`, l.magicRes && `+${l.magicRes} Magic Resistance`, l.mind && `+${l.mind} Mind`, ...l.traits.map(traitText), ...l.notes].filter(Boolean).join(', ')}</p>)}
        </div>
      )}
      <div className="dbt-actions-table">
        <h4>What it does <small>roll D6 each turn</small></h4>
        {c.actions.map((a) => (
          <div key={a.name} className="row"><b className="r">{a.rolls.length > 1 ? `${a.rolls[0]}-${a.rolls[a.rolls.length - 1]}` : a.rolls[0]}</b>
            <span><b>{a.name}</b> {a.tag && <em className="dbt-chip sm">{a.tag === 'magical' ? 'Magical' : 'Physical'}</em>} {a.dmg ? <em className="dbt-chip sm ox">{dmgText(a)}</em> : null} {a.save && <em className="dbt-chip sm">{a.save}</em>} {a.text}</span></div>
        ))}
      </div>
      <div className="dbt-best-foot">
        <Silhouette anatomy={b.anatomy || 'none'} weak={b.weak} armorOf={(loc) => armorAt(c, loc, sel?.down)} wounds={sel?.wounds || []} label={`${name} hit locations`} />
        <p className="dbt-note">{b.anatomy ? `The ${b.anatomy} table (p. 80)${b.weak ? `: the ${b.weak} (D20 ${rangeOf(b.anatomy, b.weak)}) is its Weak Spot` : ''}. ` : 'It has no Hit Location table: every hit lands on its body, and it has no Weak Spot. '}Tap a location to see its D20 range and armour. Hits you land show as blood on it. Stat block from page {b.page} of the Gravebound Edition, which renamed Awareness to Mind and Athletics to Body and reworked the numbers; sites based on the first edition show different values.</p>
      </div>
    </article>
  );
}
