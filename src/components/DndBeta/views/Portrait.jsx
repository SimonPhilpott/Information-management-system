// The survivor up close (tap the portrait on the sheet): how the campaign has left them, in Rindewind's words and
// their own, the marks of the road taken from the game itself, and a new portrait painted from a photo or a
// description, as they are now or as they began (the classic service's portrait painter, /api/dnd/hero/avatar).
import React, { useMemo, useRef, useState } from 'react';
import * as E from '../kn/engine';
import Ico from '../ui/Ico';
import { Rich } from '../ui/Tip';
import { Medallion, Seg, Sheet, Switch } from '../ui/Bits';
import { contextOf } from './Rindewind';

const post = async (path, body) => { const r = await fetch(`/api/dnd${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok || d.success === false) throw new Error(d.error || `HTTP ${r.status}`); return d; };

// a picture, shrunk to at most 768 px and made into a data URL for the painter
async function toDataUrl(src) {
  const img = new Image(); img.crossOrigin = 'anonymous';
  await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('That picture could not be read.')); img.src = src; });
  const k = Math.min(1, 768 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.86);
}

const word = (v, max, words) => { const r = v / Math.max(1, max); return r >= 0.75 ? words[0] : r >= 0.5 ? words[1] : r >= 0.25 ? words[2] : words[3]; };

export function marksOf(game) {
  const h = game.hero, v = h.vit, log = game.log;
  const fights = log.filter((e) => e.kind === 'combat' && e.result === 'won').length;
  const foes = [...new Set(log.filter((e) => e.creature).map((e) => e.creature))];
  const worst = (h.wounds || []).reduce((m, w) => (w.dmg > (m?.dmg || 0) ? w : m), null);
  return [
    ['door', 'Places walked', `${game.pieces.length} in Domain ${game.domain.n}${game.source?.turns ? `, after ${game.source.turns} turns of the earlier tale` : ''}`],
    ['swords', 'Fights won', fights ? `${fights}${foes.length ? `, against ${foes.join(', ')}` : ''}` : foes.length ? `None yet; faced ${foes.join(', ')}` : 'None yet'],
    ['drop', 'Hurts since the last camp', (h.wounds || []).length ? `${h.wounds.length}, the worst ${worst.dmg} to the ${worst.loc.toLowerCase()}` : 'None'],
    ['heart', 'Body', `${word(v.health, v.maxHealth, ['Whole', 'Hurt', 'Badly hurt', 'Near death'])}: Health ${v.health}/${v.maxHealth}, Toughness ${v.tough}/${v.maxTough}`],
    ['brain', 'Mind', `${word(v.sanity, v.maxSanity, ['Steady', 'Shaken', 'Haunted', 'Breaking'])}: Sanity ${v.sanity}/${v.maxSanity}${h.madness?.length ? `; carries ${h.madness.length} madness${h.madness.length > 1 ? 'es' : ''}` : ''}`],
    ['hourglass', 'Weariness', ['Rested enough', 'Worn: healing comes slowly', 'Exhausted: every check is harder', 'Spent'][E.exhTier(h)]],
    ['torch', 'Light', `${v.light} room${v.light === 1 ? '' : 's'} of torchlight, ${h.items.torches} spare`],
    ['star', 'Under the rule of', `${game.domain.overseer.name}`],
  ];
}

export default function PortraitSheet({ game, commit, open, onClose }) {
  const h = game.hero;
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const [when, setWhen] = useState('now');
  const [desc, setDesc] = useState('');
  const [photo, setPhoto] = useState(null);
  const [keep, setKeep] = useState(Boolean(h.avatar));
  const file = useRef(null);
  const marks = useMemo(() => marksOf(game), [game]);
  const r = h.reflection; const stale = !r || r.at < game.log.length - 4;
  const update = (patch) => commit({ ...game, hero: { ...game.hero, ...patch }, updated: Date.now() });

  const reflect = async () => {
    setBusy('reflect'); setErr('');
    try { const out = await post('/beta/reflect', { context: { ...contextOf(game), marks: marks.map(([, k, v]) => `${k}: ${v}`).join('\n'), backstory: (h.backstory || '').slice(0, 900), goals: h.goals || '' } }); update({ reflection: { ...out, at: game.log.length } }); }
    catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  const paint = async () => {
    setBusy('paint'); setErr('');
    try {
      const p = E.here(game);
      const now = `Right now: in ${p.title}, ${p.desc?.text || ''} ${marks.slice(2, 6).map(([, k, v]) => `${k}: ${v}`).join('. ')}.${h.effects.length ? ` Suffering from ${h.effects.map((e) => e.name).join(', ')}.` : ''}`;
      const began = 'Just woken among rotting corpses in the necropolis of Ker Nethalas after a botched execution: in rags, bruised and bloodied, dazed, torchlight on wet stone.';
      const referenceImage = photo || (keep && h.avatar ? await toDataUrl(h.avatar) : null);
      const out = await post('/hero/avatar', { name: h.name, roleOrClass: h.role || 'Condemned survivor', rulesetId: 'ker-nethalas', concept: h.role || '', details: desc, backstory: (h.backstory || '').slice(0, 400), premise: when === 'now' ? now : began, referenceImage });
      if (!out.avatarUrl) throw new Error('No picture came back.');
      update({ avatar: out.avatarUrl, portraits: [...new Set([...(h.portraits || (h.avatar ? [h.avatar] : [])), out.avatarUrl])] });
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  const pick = async (f) => { if (!f) return; try { setPhoto(await toDataUrl(URL.createObjectURL(f))); } catch (e) { setErr(e.message); } };

  return (
    <Sheet open={open} onClose={onClose} title={h.name} icon="helm" wide className="dbt-portrait-sheet">
      <div className="dbt-pt-grid">
        <figure className="dbt-pt-frame">
          {h.avatar ? <img src={h.avatar} alt={`Portrait of ${h.name}`} /> : <Medallion name={h.name} size={220} />}
          <figcaption><b>{h.name}</b><span>{h.role || 'Survivor'} · Level {h.level}</span></figcaption>
        </figure>
        <div className="dbt-pt-words">
          <div className="dbt-callout"><b><Ico n="quill" size={16} /> As Rindewind sees {h.name} now</b>
            {r ? <p className="dbt-fell"><Rich text={r.portrait} /></p> : <p className="dbt-note">He has not yet set down how the road has changed {h.name}.</p>}
            {r?.feeling && <p className="dbt-pt-voice">&ldquo;{r.feeling}&rdquo;</p>}
            <div className="dbt-row">{r?.mood && <span className="dbt-chip">{r.mood}</span>}<button type="button" className="dbt-btn sm" disabled={busy === 'reflect'} onClick={reflect}><Ico n="quill" size={16} /> {busy === 'reflect' ? 'He is writing...' : r ? (stale ? 'Much has happened: ask him again' : 'Ask him again') : 'Ask Rindewind'}</button></div></div>
          <h4 className="dbt-sub">Marks of the road</h4>
          <ul className="dbt-marks">{marks.map(([ic, k, v]) => <li key={k}><Ico n={ic} size={16} /><span><b>{k}</b>{v}</span></li>)}</ul>
          {h.goals && <p className="dbt-note"><b>Personal goal:</b> {h.goals}</p>}
        </div>
      </div>
      <div className="dbt-pt-paint">
        <h4 className="dbt-sub">A new portrait</h4>
        <Seg value={when} onChange={setWhen} label="When" options={[['now', 'As they are now', 'eye'], ['began', 'As they began', 'door']]} />
        <label className="dbt-field" htmlFor="dbt-pt-desc"><span>Describe them (optional)</span><input id="dbt-pt-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="A cheerful gnome miner, patched leather cap, soot in his beard" maxLength={300} /></label>
        <div className="dbt-row">
          <input ref={file} id="dbt-pt-file" type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <button type="button" className="dbt-btn ghost" onClick={() => file.current?.click()}><Ico n="eye" size={16} /> {photo ? 'Choose another photo' : 'Start from a photo'}</button>
          {photo && <img className="dbt-pt-thumb" src={photo} alt="The photo to start from" />}
          {photo && <button type="button" className="dbt-link" onClick={() => setPhoto(null)}>Remove</button>}
          {!photo && h.avatar && <Switch id="dbt-pt-keep" checked={keep} onChange={setKeep} label="Keep their likeness" sub="Paints from the current portrait" />}
        </div>
        <div className="dbt-row"><button type="button" className="dbt-btn primary" disabled={busy === 'paint'} onClick={paint}><Ico n="quill" size={16} /> {busy === 'paint' ? 'Painting...' : 'Paint a new portrait'}</button><span className="dbt-note">Each new picture costs a few pence.</span></div>
        {(h.portraits || []).length > 1 && <div className="dbt-pt-history">{h.portraits.map((u) => <button key={u} type="button" className={u === h.avatar ? 'on' : ''} onClick={() => update({ avatar: u })} aria-label="Use this portrait"><img src={u} alt="" /></button>)}</div>}
        {err && <p className="dbt-err" role="alert">{err}</p>}
      </div>
    </Sheet>
  );
}
