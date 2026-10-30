// Games: your adventure up front, heroes to bring across from the classic service, and every game in the library with
// how ready it is to be run by the Solo DM. New: rolling a survivor by the book (chapter II).
import React, { useEffect, useState } from 'react';
import * as E from '../kn/engine';
import { overseerImg } from '../kn/tables';
import { GLOSSARY } from '../kn/glossary';
import Ico from '../ui/Ico';
import { Parchment, Roll } from '../ui/Parchment';
import { Tip, Term } from '../ui/Tip';
import { Bar, Medallion, Panel, Orn } from '../ui/Bits';
import MapView from './MapView';
import { coverage } from './Rules';
import { GAMES, KINDS, sortBooks } from '../library';
import { WEAPONS } from '../kn/loot';

function Banner({ g, onOpen }) {
  const v = g.hero.vit; const last = [...g.log].reverse().find((e) => e.kind === 'room' || e.kind === 'combat' || e.kind === 'event');
  const here = E.here(g);
  return (
    <article className="dbt-banner">
      <img className="bg" src={overseerImg(g.domain.overseer.name)} alt="" aria-hidden="true" />
      <div className="veil" />
      <div className="in">
        <Medallion src={g.hero.avatar} name={g.hero.name} size={96} />
        <div className="t">
          <span className="dbt-kick">Your adventure · Domain {g.domain.n} · {g.domain.overseer.name}</span>
          <h2>{g.title}</h2>
          <p className="where"><Ico n="door" size={16} /> {here?.title || 'Somewhere below'}{g.over ? ' · the tale has ended' : g.combat ? ' · in a fight' : ''}</p>
          {last && <p className="last">{last.text.length > 180 ? `${last.text.slice(0, 180)}...` : last.text}</p>}
          <div className="dbt-mini">
            {[['Health', v.health, v.maxHealth, 'heart'], ['Toughness', v.tough, v.maxTough, 'shield'], ['Sanity', v.sanity, v.maxSanity, 'brain'], ['Light', v.light, 20, 'torch']].map(([k, n, m, ic]) => <Tip key={k} tip={{ title: k, icon: ic, ...GLOSSARY[k] }} className="m"><Ico n={ic} size={14} />{n}<small>/{m}</small></Tip>)}
          </div>
          <button type="button" className="dbt-btn primary lg" onClick={() => onOpen(g.id)}><Ico n="scroll" size={18} /> {g.over ? 'Read the tale' : 'Return to the dark'}</button>
        </div>
        <div className="map"><MapView game={g} compact onOpen={() => onOpen(g.id)} height={180} /></div>
      </div>
    </article>
  );
}

// one game, dressed like its rulebook: its cover, its typeface, its colours; its books counted by kind
function GameCard({ g, listing, rulesets, cov, open, onToggle }) {
  const folder = listing?.folders.find((f) => f.name === g.folder);
  const files = g.file ? (listing?.files || []).filter((f) => f.name === g.file) : (folder?.files || []);
  const groups = sortBooks(g, files);
  const rs = rulesets.find((r) => r.id === g.id); const rd = rs?.readiness || rs?.metadata?.readiness;
  const pct = g.beta ? cov : (rd?.percentage ?? null);
  const counts = KINDS.map(([k, label]) => [k, label, Object.keys(groups[k] || {}).length]).filter(([, , n]) => n > 0);
  const short = { core: ['core book', 'core books'], expansion: ['expansion', 'expansions'], setting: ['setting', 'settings'], campaign: ['campaign', 'campaigns'], supplement: ['supplement', 'supplements'], reference: ['reference', 'references'], aid: ['play aid', 'play aids'], map: ['map set', 'map sets'], print: ['print version', 'print versions'] };
  const style = { '--g-bg': g.bg, '--g-accent': g.accent, '--g-accent2': g.accent2, '--g-title': g.title, '--g-font': g.font, '--g-size': g.size, '--g-track': g.track || '0' };
  return (
    <article className="dbt-game" style={style}>
      <div className="cover"><img src={`/kn/covers/${g.id}.jpg`} alt={`The cover of ${g.name}`} loading="lazy" />
        <div className="tags">{g.beta && <span className="tag play">Playable in the beta</span>}{g.isNew && <span className="tag new">New: not indexed yet</span>}{!g.beta && !g.isNew && <span className="tag">Classic service</span>}</div></div>
      <div className="body">
        <h3>{g.name}{g.sub && <><br /><small style={{ fontSize: '.55em' }}>{g.sub}</small></>}</h3>
        <p className="genre">{g.genre}</p>
        <div className="counts">{counts.length ? counts.map(([k, , n]) => <span key={k}><b>{n}</b>{short[k][n === 1 ? 0 : 1]}</span>) : <span>{listing ? 'No books found' : '...'}</span>}</div>
        {pct != null && <div className="ready"><Bar value={pct} max={100} /><b>{pct}%</b></div>}
        <p className="note">{g.beta ? 'Ready to run here: measured from the rules the beta runs.' : g.isNew ? 'Added to the library. It will be studied when you ask for it to be indexed.' : rd ? `${rd.summary || rd.label || ''} (the classic service's estimate)` : 'Indexed in the classic service.'}{g.note ? ` ${g.note}` : ''}</p>
        {counts.length > 0 && <button type="button" className="more" onClick={onToggle} aria-expanded={open}>{open ? 'Hide the books' : 'Show the books'}</button>}
        {open && (
          <div className="books">{KINDS.filter(([k]) => groups[k]).map(([k, label]) => (
            <div key={k}><h5>{label}</h5><ul>{Object.entries(groups[k]).map(([t, fs]) => <li key={t}>{t}{fs.length > 1 ? <small> ({fs.length} files)</small> : null}</li>)}</ul></div>
          ))}
            {open && !g.beta && rd?.checklist?.length > 0 && <div><h5>Ready for the Solo DM</h5><ul>{rd.checklist.map((c) => <li key={c.name}>{c.done ? '✓ ' : '· '}{c.name}</li>)}</ul></div>}
          </div>
        )}
      </div>
    </article>
  );
}

export default function GamesView({ games, curId, onOpen, onNew, onDelete, onImport, table = [], onWatch, me, synced }) {
  const [sure, setSure] = useState(null);
  const [classic, setClassic] = useState([]);
  const [rulesets, setRulesets] = useState([]);
  const [listing, setListing] = useState(null);
  const [importing, setImporting] = useState(null);
  const [importErr, setImportErr] = useState('');
  const [openRs, setOpenRs] = useState(null);
  useEffect(() => {
    fetch('/api/dnd/campaigns').then((r) => r.json()).then((d) => setClassic((d.campaigns || []).filter((c) => c.ruleset_id === 'ker-nethalas'))).catch(() => {});
    fetch('/api/dnd/rulesets').then((r) => r.json()).then((d) => setRulesets(d.rulesets || [])).catch(() => {});
    fetch('/api/dnd/beta/library').then((r) => r.json()).then((d) => setListing(d.folders ? d : { folders: [], files: [] })).catch(() => setListing({ folders: [], files: [] }));
  }, []);
  const doImport = async (id) => { setImporting(id); setImportErr(''); try { await onImport(id); } catch (e) { setImportErr(e.message); } finally { setImporting(null); } };
  const cur = games.find((g) => g.id === curId) || games[0];
  const others = games.filter((g) => g !== cur);
  const cov = coverage();
  return (
    <div className="dbt-page dbt-games">
      <header className="dbt-head"><div><span className="dbt-kick">D&amp;D Solo DM{me ? ` · ${me}` : ''}{synced === 'offline' ? ' · not saved to the server' : ''}</span><h1>Rindewind&apos;s Table</h1></div>
        <button type="button" className="dbt-btn primary" onClick={onNew}><Ico n="d6" size={18} /> New survivor</button></header>
      {cur ? <Banner g={cur} onOpen={onOpen} /> : (
        <Panel plate="No adventure yet" icon="door" className="dbt-empty-panel"><p className="dbt-fell">Thrown down to die beneath Veldonia, you did not. Roll a survivor, or bring one across from the old D&D Solo.</p>
          <button type="button" className="dbt-btn primary" onClick={onNew}><Ico n="d6" size={18} /> Roll a survivor</button></Panel>
      )}
      {others.length > 0 && (
        <Panel plate="Other adventures" icon="scroll">
          <div className="dbt-gamegrid">{others.map((g) => (
            <article key={g.id} className="dbt-gamecard">
              <Medallion src={g.hero.avatar} name={g.hero.name} size={48} />
              <div className="t"><b>{g.title}</b><small>{g.hero.name} · Domain {g.domain.n} · {g.pieces.length} places{g.over ? ' · ended' : ''}</small></div>
              <div className="dbt-row"><button type="button" className="dbt-btn sm" onClick={() => onOpen(g.id)}>Open</button>
                {sure === g.id ? <><button type="button" className="dbt-btn sm danger" onClick={() => { onDelete(g.id); setSure(null); }}>Delete for good</button><button type="button" className="dbt-btn sm ghost" onClick={() => setSure(null)}>Keep</button></>
                  : <button type="button" className="dbt-btn sm ghost" onClick={() => setSure(g.id)}>Delete</button>}</div>
            </article>
          ))}</div>
        </Panel>
      )}
      {table.length > 0 && (
        <Panel plate="Round the table" icon="eye" className="dbt-table">
          <p className="dbt-note">Everyone else's adventures, as they stand. Watch any of them; only their owner can play them.</p>
          <div className="dbt-gamegrid">{table.map((g) => (
            <article key={g.id} className="dbt-gamecard watch">
              <Medallion src={g.hero.avatar} name={g.hero.name} size={48} />
              <div className="t"><b>{g.hero.name}</b><small>{g.ownerName}&apos;s · level {g.hero.level} · Domain {g.domain.n}{g.domain.overseer ? `, ${g.domain.overseer}${g.domain.overseerSlain ? ' (slain)' : ''}` : ''} · {g.places} places{g.over ? ` · ${g.over === 'dead' ? 'died' : 'ended'}` : g.fighting ? ` · fighting ${g.fighting === true ? '' : g.fighting}` : ''}</small>
                {g.hero.maxHealth ? <small>Health {g.hero.health}/{g.hero.maxHealth} · Sanity {g.hero.sanity}/{g.hero.maxSanity} · {g.hero.xp} XP · {new Date(g.updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small> : null}
                {g.latest?.[g.latest.length - 1] && <small className="dbt-fell">{g.latest[g.latest.length - 1].title}: {g.latest[g.latest.length - 1].text}</small>}</div>
              <div className="dbt-row"><button type="button" className="dbt-btn sm" onClick={() => onWatch?.(g.id)}><Ico n="eye" size={14} /> Watch</button></div>
            </article>
          ))}</div>
        </Panel>
      )}
      {cur && others.length === 0 && (
        <p className="dbt-note dbt-delnote">{sure === cur.id ? <>Delete {cur.title}? <button type="button" className="dbt-link" onClick={() => { onDelete(cur.id); setSure(null); }}>Delete for good</button> <button type="button" className="dbt-link" onClick={() => setSure(null)}>Keep it</button></> : <button type="button" className="dbt-link" onClick={() => setSure(cur.id)}>Delete this adventure</button>}</p>
      )}
      {classic.length > 0 && (
        <Panel plate="Heroes from the old D&D Solo" icon="helm" className="dbt-classic">
          {classic.map((c) => {
            const done = games.some((g) => g.source?.classic === c.id);
            return (
              <div key={c.id} className="dbt-classic-row">
                <Medallion src={c.character_avatar} name={c.character_name} size={56} />
                <div><b>{c.character_name || 'Hero'}</b><p className="dbt-mut">{c.character_class} · {c.turn_count} turns · {c.title}</p></div>
                <button type="button" className="dbt-btn" disabled={importing === c.id} onClick={() => doImport(c.id)}><Ico n="back" size={16} /> {importing === c.id ? 'Bringing across' : done ? 'Bring across again' : 'Bring across'}</button>
              </div>
            );
          })}
          <p className="dbt-note">Brings the hero as he stands (vitals, kit, skills, masteries) and the places his story passed through, as cleared rooms on the map. The classic copy is not changed.</p>
          {importErr && <p className="dbt-err" role="alert">{importErr}</p>}
        </Panel>
      )}
      <Panel plate="The library" icon="tome" className="dbt-library">
        <p className="dbt-note">Every game in the D&amp;D folder, dressed like its own rulebook, with its books sorted and how ready each is to be run by the Solo DM. Games marked new are listed but not indexed yet.</p>
        <div className="dbt-libgrid">{GAMES.map((g) => <GameCard key={g.id} g={g} listing={listing} rulesets={rulesets} cov={cov} open={openRs === g.id} onToggle={() => setOpenRs(openRs === g.id ? null : g.id)} />)}</div>
        {!listing && <p className="dbt-note">Reading the library...</p>}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Rolling a survivor (chapter II): attributes on the dice, a resistance at 40, the Skill allotments, a personal goal
export function NewView({ throwDice, busy, setBusy, onCreate, onBack, trayNode }) {
  const [name, setName] = useState('');
  const [faces, setFaces] = useState(null);
  const [r40, setR40] = useState('Endurance');
  const [allot, setAllot] = useState({}); // skill -> value
  const [goals, setGoals] = useState('');
  const [start, setStart] = useState('first'); const [kitWeapon, setKitWeapon] = useState('Shortsword');
  const roll = async () => {
    if (busy) return; setBusy(true);
    try { setFaces(await throwDice(E.makePlan([['a', 'd6'], ['b', 'd6'], ['c', 'd6'], ['h', 'd6'], ['ae', 'd6'], ['s', 'd6'], ['hb6', 'd6'], ['hb4', 'd4']]))); } finally { setBusy(false); }
  };
  const pool = E.ALLOTMENTS.flatMap((a) => Array.from({ length: a.count }, () => a));
  const used = Object.values(allot);
  const left = (n) => pool.filter((a) => a.n === n).length - used.filter((u) => u === n).length;
  const options = (skill) => [...new Set(pool.filter((a) => (!a.weapon || E.WEAPON_SKILLS.includes(skill)) && (left(a.n) > 0 || allot[skill] === a.n)).map((a) => a.n))];
  const skills = Object.fromEntries(E.SKILLS.map((k) => [k, Math.min(80, (E.BASE_SKILLS[k] || 0) + (allot[k] || 0))]));
  const weaponOk = E.WEAPON_SKILLS.some((k) => allot[k] === 60) && E.WEAPON_SKILLS.some((k) => allot[k] === 40);
  const complete = used.length === pool.length && weaponOk;
  const hero = faces ? E.newHero({ name, faces, resist40: r40, skills, goals }) : null;
  const bestWeapon = E.WEAPON_SKILLS.find((k) => allot[k] === 60);
  if (hero && bestWeapon) hero.weapons = hero.weapons.map((w) => ({ ...w, skill: bestWeapon === 'Unarmed Combat & Fist Weapons' ? w.skill : bestWeapon }));
  return (
    <div className="dbt-page dbt-new">
      <header className="dbt-head"><div><span className="dbt-kick">Chapter II · Creating your survivor</span><h1>Roll your survivor</h1></div><button type="button" className="dbt-btn ghost" onClick={onBack}><Ico n="back" size={16} /> Back</button></header>
      <section className="dbt-scroll dbt-static dbt-scroll-new"><span className="dbt-paperbg" aria-hidden="true" />
        <Roll which="top" />
        <div className="dbt-scroll-body full">
          <p className="dbt-tale"><span className="dbt-cap" aria-hidden="true">Y</span><span className="sr">Y</span>ou were thrown down here to die, and did not. Throw the dice for body and mind, then decide what your old life taught you.</p>
          <label className="dbt-field" htmlFor="dbt-name"><span>Name</span><input id="dbt-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="The Condemned" maxLength={40} /></label>
          <button type="button" className="dbt-btn primary lg" disabled={busy} onClick={roll}><Ico n="d6" size={18} /> {faces ? 'Throw again' : 'Throw the dice'}</button>
          {hero && (
            <div className="dbt-stats">
              {[['Toughness', '3D6 + 20', hero.vit.maxTough, 'shield'], ['Health', 'D6 + 10', hero.vit.maxHealth, 'heart'], ['Aether', 'D6 + 8', hero.vit.maxAether, 'spark'], ['Sanity', 'D6 + 10', hero.vit.maxSanity, 'brain']].map(([k, f, n, ic]) => (
                <Tip key={k} tip={{ title: k, icon: ic, ...GLOSSARY[k] }} className="stat"><Ico n={ic} size={20} /><b>{n}</b><small>{k} <em>{f}</em></small></Tip>
              ))}
            </div>
          )}
          {hero && <p className="dbt-note">Hard beginnings (p. 243): you wake with {hero.hb.d6} damage, {hero.hb.d4} Sanity lost and 1 Exhaustion.</p>}
          {hero && <><Orn /><h3 className="dbt-sub">Resistances (p. 20)</h3><p className="dbt-note">One starts at 40, the other two at 20.</p>
            <div className="dbt-seg">{['Endurance', 'Resolve', 'Spellward'].map((k) => <Tip key={k} as="button" type="button" className={r40 === k ? 'on' : ''} onClick={() => setR40(k)} tip={{ title: k, ...GLOSSARY[k] }}>{k} {r40 === k ? 40 : 20}</Tip>)}</div></>}
          {hero && <><Orn /><h3 className="dbt-sub">Skills (p. 19)</h3>
            <p className="dbt-note">Add these to the starting scores, each to a different Skill: +60 and +40 to two weapon Skills, +30 to three Skills, +20 to two and +10 to three. No Skill goes over 80.</p>
            <div className="dbt-allot-left">{[60, 40, 30, 20, 10].map((n) => <span key={n} className={`dbt-chip ${left(n) ? 'gilt' : ''}`}>+{n} ×{left(n)}</span>)}</div>
            <div className="dbt-allot">{E.SKILLS.map((k) => (
              <div key={k} className={`row ${allot[k] ? 'set' : ''}`}><Term name={k}>{k}</Term>{E.WEAPON_SKILLS.includes(k) && <em className="dbt-chip sm">weapon</em>}
                <select id={`dbt-al-${k}`} aria-label={`Allotment for ${k}`} value={allot[k] || ''} onChange={(e) => setAllot((a) => { const n = { ...a }; if (e.target.value) n[k] = Number(e.target.value); else delete n[k]; return n; })}>
                  <option value="">-</option>{options(k).map((n) => <option key={n} value={n}>+{n}</option>)}</select>
                <b>{skills[k]}</b></div>
            ))}</div></>}
          {hero && <><Orn /><h3 className="dbt-sub">Where you begin</h3>
            <div className="dbt-seg">
              <Tip as="button" type="button" className={start === 'first' ? 'on' : ''} onClick={() => setStart('first')} tip={{ title: 'The First Domain', body: 'Wake in rags among the dead, with a half-spent Torch. The first Domain has set rooms: a Guard Room with weapons and armour, a dead survivor’s supplies, an altar of candles, Attunement Crystals, a singing choir, the Overseer and the Exit.', page: 243 }}>The First Domain</Tip>
              <Tip as="button" type="button" className={start === 'further' ? 'on' : ''} onClick={() => setStart('further')} tip={{ title: 'Further runs', body: 'Start in the ordinary exploration rules with a weapon of your choosing, a random armour, a Torch, D10 Cooking Ingredients, D10+5 Crafting Supplies and D20 coins.', page: 67 }}>Further runs</Tip>
            </div>
            {start === 'further' && <label className="dbt-field" htmlFor="dbt-kitw"><span>Your weapon</span><select id="dbt-kitw" className="dbt-select" value={kitWeapon} onChange={(e) => setKitWeapon(e.target.value)}>{WEAPONS.filter((w) => !/Improvised/.test(w.name)).map((w) => <option key={w.name} value={w.name}>{w.name} ({w.skill}, {w.dtype})</option>)}</select></label>}
          </>}
          {hero && <><Orn /><label className="dbt-field" htmlFor="dbt-goal"><span>A personal goal (p. 64)</span><input id="dbt-goal" value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="Find the one who condemned you" maxLength={120} /></label></>}
        </div>
        {trayNode}
        <Roll which="bottom" />
      </section>
      <div className="dbt-row">
        {hero && <button type="button" className="dbt-btn primary lg" disabled={busy || !complete} onClick={() => onCreate(E.newGame(hero, `${hero.name} in Ker Nethalas`, { start, weapon: kitWeapon }))}><Ico n="door" size={18} /> {complete ? 'Wake among the dead' : 'Assign every Skill allotment first'}</button>}
      </div>
      <p className="dbt-note">{start === 'first' ? 'You begin with rags, a Ration and a half-spent Torch (10 rooms). Weapons wait in the Guard Room (p. 244).' : 'Your kit is rolled when you begin (p. 67).'}</p>
    </div>
  );
}
