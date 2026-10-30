// The Chronicle: the whole campaign, to read back. By default it reads as a tale (29 Oct 2026, Simon: "the chronicle
// really should read out more like a story, rather than a literal summary of rolls"): each place is a chapter that
// Rindewind writes from what happened there, kept with the game and rewritten when more happens there. The record
// (every roll and card) is one tap away. An index of the places down the side, a search, and the earlier tale.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { placeName } from '../kn/engine';
import Ico from '../ui/Ico';
import { Parchment, Roll } from '../ui/Parchment';
import { Orn } from '../ui/Bits';
import { Entry, FILTERS } from './Journal';

// the length and style of a written chapter; raising it rewrites the chapters written before
const TALE_V = 2;
export default function ChronicleView({ game, onPage, voice, commit }) {
  const [mode, setMode] = useState('tale');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [showClassic, setShowClassic] = useState(false);
  const refs = useRef({});
  const pieces = useMemo(() => Object.fromEntries(game.pieces.map((p) => [p.id, p])), [game.pieces]);
  // chapters: a new one starts at each place entered
  const chapters = useMemo(() => {
    const out = []; let cur = null;
    for (const e of game.log) {
      if (e.kind === 'room' || (e.kind === 'move' && e.place)) { cur = { id: e.id, title: pieces[e.place] ? placeName(pieces[e.place]) : e.title, entries: [], fights: 0, rolls: 0 }; out.push(cur); }
      if (!cur) { cur = { id: 'start', title: 'Before the first door', entries: [], fights: 0, rolls: 0 }; out.push(cur); }
      cur.entries.push(e); if (e.kind === 'combat') cur.fights += 1; if (e.kind === 'roll') cur.rolls += 1;
    }
    return out;
  }, [game.log, pieces]);
  const term = q.trim().toLowerCase();
  const show = (e) => (filter === 'all' || (filter === 'place' && ['room', 'move', 'event'].includes(e.kind)) || (filter === 'combat' && e.kind === 'combat') || (filter === 'roll' && ['roll', 'darkness'].includes(e.kind)) || (filter === 'note' && ['note', 'camp'].includes(e.kind)))
    && (!term || `${e.title} ${e.text} ${e.dress || ''}`.toLowerCase().includes(term));
  const total = game.log.filter(show).length;
  // the tale: written chapter by chapter, in order, one at a time; kept on the game (game.tales[chapter] = { n, text })
  const [local, setLocal] = useState({}); const writing = useRef(false); const [busyId, setBusyId] = useState(null);
  const tales = { ...(game.tales || {}), ...local };
  const factsOf = (c) => c.entries.flatMap((e) => {
    const done = (e.asks || []).filter((a) => a.done && !a.done.skipped).map((a) => `${a.done.pass ? 'Succeeded at' : 'Failed at'} what was asked (${a.skill}): ${a.done.text}${a.dress ? ` ${a.dress}` : ''}`);
    return [`${e.title}: ${String(e.text || '').replace(/\s*\(p\. \d+\)/g, '')}${e.dress ? ` (as told then: ${e.dress})` : ''}`, ...done];
  });
  useEffect(() => {
    if (mode !== 'tale' || writing.current) return;
    const todo = chapters.find((c) => c.id !== 'start' && (!tales[c.id] || tales[c.id].n !== c.entries.length || (tales[c.id].v || 1) < TALE_V));
    if (!todo) return;
    writing.current = true; setBusyId(todo.id);
    const i = chapters.indexOf(todo); const before = i > 0 ? tales[chapters[i - 1].id]?.text || '' : '';
    fetch('/api/dnd/beta/tale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hero: game.hero.name, place: todo.title, facts: factsOf(todo), before }) })
      .then((r) => r.json()).then((d) => {
        if (!d.text) throw new Error('no tale');
        const t = { n: todo.entries.length, text: d.text, v: TALE_V };
        if (commit) commit({ ...game, tales: { ...(game.tales || {}), [todo.id]: t } }); else setLocal((m) => ({ ...m, [todo.id]: t }));
      }).catch(() => setLocal((m) => ({ ...m, [todo.id]: { n: todo.entries.length, text: '', failed: true } })))
      .finally(() => { writing.current = false; setBusyId(null); });
  }, [mode, chapters, game.tales, local]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="dbt-page dbt-chron">
      <header className="dbt-head"><div><span className="dbt-kick">{game.hero.name} · {chapters.length} chapters · {game.log.length} entries</span><h1>The Chronicle</h1></div></header>
      <div className="dbt-chron-tools">
        <label className="dbt-search" htmlFor="dbt-q"><Ico n="search" size={16} /><input id="dbt-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the chronicle" /></label>
        <div className="dbt-filters" role="tablist" aria-label="Read as">{[['tale', 'The tale'], ['record', 'The record']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}</div>
        {mode === 'record' && <div className="dbt-filters" role="tablist" aria-label="Show">{FILTERS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>}
      </div>
      <div className="dbt-chron-grid">
        <nav className="dbt-chron-index" aria-label="Chapters">
          {game.imported?.length > 0 && <button type="button" className={`ix classic ${showClassic ? 'on' : ''}`} onClick={() => setShowClassic((v) => !v)}><Ico n="tome" size={16} /><span><b>The earlier tale</b><small>{game.imported.length} turns before this map</small></span></button>}
          {chapters.map((c, i) => (
            <button key={c.id} type="button" className="ix" onClick={() => refs.current[c.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              <i>{i + 1}</i><span><b>{c.title}</b><small>{c.entries.length} entries{c.fights ? ` · ${c.fights} fight${c.fights > 1 ? 's' : ''}` : ''}</small></span>
            </button>
          ))}
        </nav>
        <section className="dbt-scroll dbt-static"><span className="dbt-paperbg" aria-hidden="true" />
          <Roll which="top" />
          <div className="dbt-scroll-body full">
            {showClassic && game.imported?.length > 0 && (
              <div className="dbt-classic-story">
                <h3><Ico n="tome" size={18} /> The earlier tale</h3>
                {game.imported.filter((t) => !term || `${t.action} ${t.text}`.toLowerCase().includes(term)).map((t) => <article key={t.n} className="dbt-imp-turn"><h4>{t.n ? `Turn ${t.n}` : 'The opening'}{t.action ? <span>: {t.action}</span> : null}</h4><p>{t.text}</p></article>)}
                <Orn />
              </div>
            )}
            {mode === 'tale' && chapters.filter((c) => c.id !== 'start' && (!term || `${c.title} ${tales[c.id]?.text || ''}`.toLowerCase().includes(term))).map((c, i) => (
              <article key={c.id} ref={(el) => { refs.current[c.id] = el; }} className="dbt-tale-chapter">
                <header><span className="dbt-kick">Chapter {i + 1}</span><h3>{c.title}</h3></header>
                {tales[c.id]?.text ? tales[c.id].text.split(/\n\s*\n/).map((para, k) => <p key={k} className={`dbt-tale ${k === 0 ? 'first' : ''}`}>{para}</p>)
                  : busyId === c.id ? <p className="dbt-note"><Ico n="quill" size={14} /> Rindewind is writing this chapter…</p>
                    : tales[c.id]?.failed ? <p className="dbt-note">This chapter could not be written just now. The record has every moment of it.</p>
                      : <p className="dbt-note"><Ico n="hourglass" size={14} /> Waiting its turn to be written.</p>}
                {tales[c.id]?.text && tales[c.id].n !== c.entries.length && <p className="dbt-note">More has happened here since; it is being rewritten.</p>}
                <Orn />
              </article>
            ))}
            {mode === 'record' && total === 0 && <p className="dbt-tale">Nothing matches.</p>}
            {mode === 'record' && chapters.map((c) => {
              const list = c.entries.filter(show); if (!list.length) return null;
              return <div key={c.id} ref={(el) => { refs.current[c.id] = el; }}>{list.map((e) => <Entry key={e.id} e={e} piece={pieces[e.place]} onPage={onPage} voice={voice} />)}</div>;
            })}
          </div>
          <Roll which="bottom" />
        </section>
      </div>
    </div>
  );
}
