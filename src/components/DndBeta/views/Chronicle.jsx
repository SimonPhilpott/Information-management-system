// The Chronicle: the whole campaign, to read back. An index of every place visited down the side (with what happened
// there), the full scroll to the right, a search, and the story from the classic service if the hero came across.
import React, { useMemo, useRef, useState } from 'react';
import Ico from '../ui/Ico';
import { Orn } from '../ui/Bits';
import { Entry, FILTERS } from './Journal';

export default function ChronicleView({ game, onPage, voice }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [showClassic, setShowClassic] = useState(false);
  const refs = useRef({});
  const pieces = useMemo(() => Object.fromEntries(game.pieces.map((p) => [p.id, p])), [game.pieces]);
  // chapters: a new one starts at each place entered
  const chapters = useMemo(() => {
    const out = []; let cur = null;
    for (const e of game.log) {
      if (e.kind === 'room' || (e.kind === 'move' && e.place)) { cur = { id: e.id, title: e.kind === 'room' ? e.title : pieces[e.place]?.title || e.title, entries: [], fights: 0, rolls: 0 }; out.push(cur); }
      if (!cur) { cur = { id: 'start', title: 'Before the first door', entries: [], fights: 0, rolls: 0 }; out.push(cur); }
      cur.entries.push(e); if (e.kind === 'combat') cur.fights += 1; if (e.kind === 'roll') cur.rolls += 1;
    }
    return out;
  }, [game.log, pieces]);
  const term = q.trim().toLowerCase();
  const show = (e) => (filter === 'all' || (filter === 'place' && ['room', 'move', 'event'].includes(e.kind)) || (filter === 'combat' && e.kind === 'combat') || (filter === 'roll' && ['roll', 'darkness'].includes(e.kind)) || (filter === 'note' && ['note', 'camp'].includes(e.kind)))
    && (!term || `${e.title} ${e.text} ${e.dress || ''}`.toLowerCase().includes(term));
  const total = game.log.filter(show).length;
  return (
    <div className="dbt-page dbt-chron">
      <header className="dbt-head"><div><span className="dbt-kick">{game.hero.name} · {chapters.length} chapters · {game.log.length} entries</span><h1>The Chronicle</h1></div></header>
      <div className="dbt-chron-tools">
        <label className="dbt-search" htmlFor="dbt-q"><Ico n="search" size={16} /><input id="dbt-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the chronicle" /></label>
        <div className="dbt-filters" role="tablist" aria-label="Show">{FILTERS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
      </div>
      <div className="dbt-chron-grid">
        <nav className="dbt-chron-index" aria-label="Chapters">
          {game.imported?.length > 0 && <button type="button" className={`ix classic ${showClassic ? 'on' : ''}`} onClick={() => setShowClassic((v) => !v)}><Ico n="tome" size={16} /><span><b>The classic story</b><small>{game.imported.length} turns before the beta</small></span></button>}
          {chapters.map((c, i) => (
            <button key={c.id} type="button" className="ix" onClick={() => refs.current[c.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              <i>{i + 1}</i><span><b>{c.title}</b><small>{c.entries.length} entries{c.fights ? ` · ${c.fights} fight${c.fights > 1 ? 's' : ''}` : ''}</small></span>
            </button>
          ))}
        </nav>
        <section className="dbt-scroll dbt-static">
          <div className="dbt-scroll-rod top" aria-hidden="true" />
          <div className="dbt-scroll-body full">
            {showClassic && game.imported?.length > 0 && (
              <div className="dbt-classic-story">
                <h3><Ico n="tome" size={18} /> Before the beta: the classic campaign</h3>
                {game.imported.filter((t) => !term || `${t.action} ${t.text}`.toLowerCase().includes(term)).map((t) => <article key={t.n} className="dbt-imp-turn"><h4>{t.n ? `Turn ${t.n}` : 'The opening'}{t.action ? <span>: {t.action}</span> : null}</h4><p>{t.text}</p></article>)}
                <Orn />
              </div>
            )}
            {total === 0 && <p className="dbt-tale">Nothing matches.</p>}
            {chapters.map((c) => {
              const list = c.entries.filter(show); if (!list.length) return null;
              return <div key={c.id} ref={(el) => { refs.current[c.id] = el; }}>{list.map((e) => <Entry key={e.id} e={e} piece={pieces[e.place]} onPage={onPage} voice={voice} />)}</div>;
            })}
          </div>
          <div className="dbt-scroll-rod bottom" aria-hidden="true" />
        </section>
      </div>
    </div>
  );
}
