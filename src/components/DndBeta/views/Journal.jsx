// The scroll: the whole history of the campaign, written as it happens. Each place opens a chapter with an illuminated
// initial and what the book says is there; rolls, fights, events and rests follow beneath it. Every game term can be
// hovered or tapped, every page cited opens the book, and Rindewind's lines sit in the margin with a read-aloud button.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Ico from '../ui/Ico';
import { Rich, Tip } from '../ui/Tip';
import { DieChip, Orn } from '../ui/Bits';
import { drawFeatureIcon } from '../dyson';

const KIND = {
  room: ['door', 'Place'], move: ['back', 'Movement'], roll: ['d20', 'Roll'], combat: ['swords', 'Combat'], event: ['scroll', 'Event'],
  darkness: ['eye', 'Growing Darkness'], camp: ['tent', 'Rest'], note: ['quill', 'Note'],
};
const RESULT_ICON = { won: 'star', crit: 'swords', hit: 'drop', parried: 'shield', fumble: 'skull', 'both-fail': 'hourglass', pass: 'check', fail: 'close', rally: 'wolf', resisted: 'shield' };
const FEATURE_NAMES = { altar: 'An altar', tombs: 'Burial niches and sarcophagi', statue: 'A statue', pool: 'Water', growth: 'Growth: roots, fungus, moss', chains: 'Chains and shackles', throne: 'A throne', shelves: 'Shelves and old books', lab: 'An alchemist\'s bench', bones: 'Bones', rubble: 'Rubble', pillars: 'Pillars', table: 'A table', brazier: 'Fire or scorching' };

export const FILTERS = [['all', 'All'], ['place', 'Places'], ['combat', 'Fights'], ['roll', 'Rolls'], ['note', 'Notes']];
const matches = (e, f) => f === 'all' || (f === 'place' && (e.kind === 'room' || e.kind === 'move' || e.kind === 'event')) || (f === 'combat' && e.kind === 'combat') || (f === 'roll' && (e.kind === 'roll' || e.kind === 'darkness')) || (f === 'note' && (e.kind === 'note' || e.kind === 'camp' || e.dress));

function FeatureIcon({ tag }) {
  const r = useRef(null);
  useEffect(() => { if (r.current) drawFeatureIcon(r.current, tag); }, [tag]);
  return <Tip tip={{ title: FEATURE_NAMES[tag] || tag, body: 'Drawn on the map from the book\'s description of this place.' }}><canvas ref={r} width="64" height="64" className="dbt-feat" aria-label={FEATURE_NAMES[tag] || tag} /></Tip>;
}

function DropCap({ text }) {
  const s = String(text || ''); const first = s.charAt(0); const rest = s.slice(1);
  return <p className="dbt-tale"><span className="dbt-cap" aria-hidden="true">{first}</span><span className="sr">{first}</span><Rich text={rest} /></p>;
}

export function Entry({ e, piece, onPage, voice, fresh }) {
  const [ic] = KIND[e.kind] || KIND.note;
  const playing = voice?.playing === e.id, waiting = voice?.waiting === e.id;
  if (e.kind === 'room') {
    return (
      <article className={`dbt-chapter ${fresh ? 'fresh' : ''} ${e.lair ? 'lair' : ''}`}>
        <header>
          <span className="dbt-roundel lg"><Ico n={e.lair ? 'star' : piece?.kind === 'corridor' ? 'run' : 'door'} size={26} /></span>
          <div className="t">
            <span className="dbt-kick">{piece?.kind === 'corridor' ? 'Corridor' : piece?.start ? 'Where it began' : 'Chamber'}{piece?.family && !['corridor', 'chamber'].includes(piece.family) ? ` · ${piece.family}` : ''}</span>
            <h3>{e.title}</h3>
          </div>
          <div className="feats">{(e.tags || []).map((t) => <FeatureIcon key={t} tag={t} />)}</div>
        </header>
        {e.overseer && <p className="dbt-ov"><Ico n="star" size={16} /> <b>{e.overseer.name}</b> rules this Domain. <Rich text={e.overseer.influence} /></p>}
        <DropCap text={e.text} />
        {e.dress && <Margin e={e} voice={voice} playing={playing} waiting={waiting} />}
        <footer className="dbt-entry-foot">
          {(e.rolls || []).map((r, i) => <DieChip key={i} label={r.label} value={r.value} />)}
          {e.creature && <span className="dbt-chip ox"><Ico n="swords" size={14} /> {e.creature}</span>}
          {e.page && <PageChip page={e.page} onPage={onPage} />}
        </footer>
        <Needed e={e} />
        <Orn />
      </article>
    );
  }
  const rIc = RESULT_ICON[e.result];
  return (
    <article className={`dbt-entry k-${e.kind} ${e.result ? `r-${e.result}` : ''} ${fresh ? 'fresh' : ''}`}>
      <span className="dbt-entry-ico" aria-hidden="true"><Ico n={rIc || ic} size={18} /></span>
      <div className="dbt-entry-body">
        <h4>{e.title}{e.page && <PageChip page={e.page} onPage={onPage} />}</h4>
        <p><Rich text={e.text} /></p>
        {e.auto?.length > 0 && <p className="dbt-auto">{e.auto.join(' · ')}</p>}
        {e.hit && <p className="dbt-hitline"><Ico n="drop" size={14} /> {e.hit.loc}: {e.hit.dmg} damage{e.hit.crit ? ', critical' : ''}</p>}
        {e.dress && <Margin e={e} voice={voice} playing={playing} waiting={waiting} />}
        {e.rolls?.length > 0 && <div className="dbt-entry-foot">{e.rolls.map((r, i) => <DieChip key={i} label={r.label} value={r.value} />)}</div>}
        <Needed e={e} />
      </div>
    </article>
  );
}
function Margin({ e, voice, playing, waiting }) {
  return (
    <aside className="dbt-margin">
      <span className="who"><Ico n="quill" size={14} /> Rindewind</span>
      <p>{e.dress}</p>
      {voice && <button type="button" className="dbt-speak" onClick={() => (playing ? voice.stop() : voice.play(e.id, e.dress))} aria-label={playing ? 'Stop reading' : 'Read aloud'}>
        <Ico n={playing ? 'stop' : waiting ? 'hourglass' : 'speaker'} size={16} />{playing ? 'Stop' : waiting ? 'Finding his voice' : 'Read aloud'}</button>}
    </aside>
  );
}
// what the roll needed, kept with its result
function Needed({ e }) {
  if (!e.need?.length) return null;
  return <div className="dbt-needed"><b><Ico n="d20" size={13} /> You needed</b><ul>{e.need.map((n, i) => <li key={i}>{n}</li>)}</ul></div>;
}
// the roll about to be made: the dice, what each decides, the result you need
export function RollPrompt({ pending, onThrow, onCancel, busy }) {
  const { info, plan } = pending;
  return (
    <div className="dbt-prompt" role="region" aria-label={`Roll: ${info.title}`}>
      <header><span className="dbt-roundel sm"><Ico n="d20" size={18} /></span><div><span className="dbt-kick">Ready to roll</span><h4>{info.title}</h4>{info.why && <small>{info.why}</small>}</div></header>
      <ul className="dbt-prompt-lines">{info.lines.map((l, i) => <li key={i}><DieChip value={l.die.toUpperCase()} die={l.die} /><span><b>{l.what}</b>{l.need && <small>{l.need}</small>}</span></li>)}</ul>
      <div className="dbt-row"><button type="button" className="dbt-btn primary lg" disabled={busy} onClick={onThrow} autoFocus><Ico n="d20" size={18} /> Throw {plan.kinds.length > 1 ? `the ${plan.kinds.length} dice` : 'the die'}</button><button type="button" className="dbt-btn ghost" onClick={onCancel}>Not now</button></div>
    </div>
  );
}
export function PageChip({ page, onPage }) {
  return <button type="button" className="dbt-pg" onClick={(ev) => { ev.stopPropagation(); onPage?.(page); }} aria-label={`Open the book at page ${page}`}><Ico n="tome" size={12} />p. {page}</button>;
}

// the scroll in the play screen: scrolls through everything, with filters and a way back to the newest line
export default function Journal({ game, onPage, voice, trayNode, header, pending, onThrow, onCancel, busy }) {
  const [filter, setFilter] = useState('all');
  const [away, setAway] = useState(false);
  const body = useRef(null);
  const seen = useRef(game.log.length);
  const pieces = useMemo(() => Object.fromEntries(game.pieces.map((p) => [p.id, p])), [game.pieces]);
  const list = game.log.filter((e) => matches(e, filter));
  const freshFrom = seen.current;
  useEffect(() => { seen.current = game.log.length; }, [game.log.length]);
  useEffect(() => { const el = body.current; if (el && !away) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }, [game.log.length, game.log[game.log.length - 1]?.dress, filter, pending]); // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = () => { const el = body.current; if (el) setAway(el.scrollHeight - el.scrollTop - el.clientHeight > 160); };
  return (
    <section className="dbt-scroll" aria-label="The scroll">
      <div className="dbt-scroll-rod top" aria-hidden="true" />
      <header className="dbt-scroll-head">
        {header}
        <div className="dbt-filters" role="tablist" aria-label="Show">
          {FILTERS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
      </header>
      <div className="dbt-scroll-body" ref={body} onScroll={onScroll}>
        {list.length === 0 && <p className="dbt-tale">Nothing written here yet.</p>}
        {list.map((e) => {
          const idx = game.log.indexOf(e);
          return <Entry key={e.id} e={e} piece={pieces[e.place]} onPage={onPage} voice={voice} fresh={idx >= freshFrom} />;
        })}
        {pending && <RollPrompt pending={pending} onThrow={onThrow} onCancel={onCancel} busy={busy} />}
      </div>
      {away && <button type="button" className="dbt-latest" onClick={() => { body.current?.scrollTo({ top: body.current.scrollHeight, behavior: 'smooth' }); setAway(false); }}><Ico n="next" size={14} /> Latest</button>}
      {trayNode}
      <div className="dbt-scroll-rod bottom" aria-hidden="true" />
    </section>
  );
}
