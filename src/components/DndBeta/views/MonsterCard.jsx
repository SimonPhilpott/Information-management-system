// A creature's card, laid out like the book's stat blocks: its picture, what it is, the numbers, traits, the D6 table of
// what it does, and where it has been hit (blood on its silhouette). `compact` is the fight version: the picture, its
// key numbers, a health bar for each one (tap to target) and the hits on the one you are fighting.
// A creature's picture can be given here: copy it from the Ker Nethalas Companion and paste it, or upload a file.
import React, { useRef, useState } from 'react';
import { CREATURES } from '../kn/tables';
import { GLOSSARY } from '../kn/glossary';
import { Tip, Term } from '../ui/Tip';
import { CreatureArt, Silhouette, artChanged } from '../ui/Figures';
import { Bar } from '../ui/Bits';
import Ico from '../ui/Ico';

const STAT_TIPS = {
  Mind: 'Its awareness: what your Perception is matched against for Initiative.',
  Endurance: 'Its stamina against poison, bleeding and the like.',
  Body: 'Its raw strength: what you match your Athletics against to break its grip.',
  Health: 'Damage it can take. Creatures have no Toughness.',
  'Combat Skill': 'What it rolls under to attack and to defend. Your weapon\'s Speed is taken off it.',
  'Magic Resistance': 'What your spells must overcome.',
};
const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-');

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

export function MonsterCard({ name, alive = [], target, onTarget, compact, lastHit }) {
  const c = CREATURES[name];
  const [, redraw] = useState(0);
  if (!c) return null;
  const sel = alive.find((a) => a.id === target) || alive[0];
  const armorText = Object.keys(c.armor).length ? Object.entries(c.armor).map(([k, v]) => `${v} ${k}`).join(', ') : '–';
  if (compact) {
    return (
      <article className="dbt-foe-big">
        <div className="banner"><CreatureArt name={name} /><div className="nm"><b>{name}</b><small>{c.type}</small></div>
          <Tip tip={{ title: name, body: c.blurb, page: c.page, badge: c.type }} className="info"><Ico n="info" size={18} /></Tip></div>
        <div className="stats">
          {[['Combat Skill', c.combat], ['Health', c.health], ['Mind', c.mind], ['Body', c.body]].map(([k, v]) => <Tip key={k} tip={{ title: k, body: STAT_TIPS[k], page: 131 }} className="st"><small>{k === 'Combat Skill' ? 'Combat' : k}</small><b>{v}</b></Tip>)}
          <Tip tip={{ title: 'Armor', body: GLOSSARY.Armor.body, page: 83 }} className="st"><small>Armor</small><b>{armorText}</b></Tip>
        </div>
        <div className="traits">{c.traits.map((t) => <Term key={t} name={t}><span className="dbt-chip ox">{t}</span></Term>)}</div>
        <div className="body">
          <div className="dbt-foes">
            {alive.map((a) => (
              <button key={a.id} type="button" className={`dbt-foe ${sel?.id === a.id ? 'on' : ''}`} onClick={() => onTarget?.(a.id)} aria-pressed={sel?.id === a.id} aria-label={`${name} ${a.n}: ${a.health} of ${a.max} Health${sel?.id === a.id ? ', your target' : ''}`}>
                <span><Ico n={sel?.id === a.id ? 'swords' : 'skull'} size={14} />{alive.length > 1 ? a.n : ''}</span>
                <Bar value={a.health} max={a.max} /><small>{a.health}/{a.max}</small>
              </button>
            ))}
          </div>
          {sel && <div className="fig"><Silhouette anatomy={c.anatomy} armor={c.armor} wounds={sel.wounds || []} highlight={lastHit?.enemy === sel.id ? lastHit.loc : null} label={`Where ${name} ${sel.n} has been hit`} className="foe" /><small>{alive.length > 1 ? `No. ${sel.n}` : 'Its wounds'}</small></div>}
        </div>
      </article>
    );
  }
  const stats = [['Mind', c.mind], ['Endurance', c.endurance], ['Body', c.body], ['Health', c.health], ['Combat Skill', c.combat], ['Magic Resistance', c.magicRes]];
  return (
    <article className="dbt-bestiary">
      <div className="top">
        <div className="pic"><CreatureArt name={name} /><ArtSetter name={name} onDone={() => redraw((n) => n + 1)} /></div>
        <div className="head">
          <span className="dbt-kick">{c.type} · appears {c.number === 1 ? 'alone' : `${c.number} at a time`}</span>
          <h3>{name}</h3>
          <p className="dbt-fell">{c.blurb}</p>
          <div className="traits">{c.traits.map((t) => <Term key={t} name={t}><span className="dbt-chip ox">{t}</span></Term>)}<Term name="Hit Location"><span className="dbt-chip">{c.anatomy}</span></Term><span className="dbt-chip">Weak Spot: Head</span></div>
        </div>
      </div>
      <div className="dbt-statgrid">
        {stats.map(([k, v]) => <Tip key={k} tip={{ title: k, body: STAT_TIPS[k], page: 131 }} className="cell"><small>{k}</small><b>{v}</b></Tip>)}
        <Tip tip={{ title: 'Armor', body: GLOSSARY.Armor.body, page: 83 }} className="cell"><small>Armor</small><b>{armorText}</b></Tip>
      </div>
      <div className="dbt-actions-table">
        <h4>What it does <small>roll D6 each turn</small></h4>
        {c.actions.map((a) => (
          <div key={a.name} className="row"><b className="r">{a.rolls.length > 1 ? `${a.rolls[0]}-${a.rolls[a.rolls.length - 1]}` : a.rolls[0]}</b>
            <span><b>{a.name}</b> {a.magic ? <em className="dbt-chip sm">Magical</em> : a.dmg ? <em className="dbt-chip sm">Physical</em> : null} {a.dmg ? `${a.dmg === '1' ? '1' : a.dmg.toUpperCase()} ${a.type || ''} damage. ` : ''}{a.text || ''}</span></div>
        ))}
      </div>
      <div className="dbt-best-foot">
        <Silhouette anatomy={c.anatomy} armor={c.armor} wounds={sel?.wounds || []} label={`${name} hit locations`} />
        <p className="dbt-note">Tap a location to see its D20 range and armour. Hits you land show as blood on it. Stat block from page {c.page}.</p>
      </div>
    </article>
  );
}
