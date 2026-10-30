// How this session runs: the settings in force, the game's procedures as flowcharts with where you are in them,
// every rule with what the book says and what the Solo DM does with it, the book's tables, and the bestiary.
import React, { useMemo, useState } from 'react';
import T from '../kn/bookTables.json';
import { RULES, RULE_GROUPS } from '../kn/rules';
import { PROCEDURES, whereNow } from '../kn/procedures';
import { OVERSEERS, overseerImg } from '../kn/tables';
import { TABLE_A, TABLE_B, FIRST_DOMAIN, statOf } from '../kn/creatures';
import { TABLES as LOOT } from '../kn/loot';
import { MASTERY_NAMES, MASTERIES } from '../kn/progress';
import Ico from '../ui/Ico';
import { Rich, Tip } from '../ui/Tip';
import { Panel, Seg, Switch, Bar } from '../ui/Bits';
import { PageChip } from './Journal';
import { MonsterCard } from './MonsterCard';

const MODE = { auto: ['Done for you', 'ok'], assisted: ['Rolled for you, you settle it', 'warn'], manual: ['You keep track', ''], missing: ['Not in the beta yet', 'bad'] };
export const coverage = () => { const w = { auto: 1, assisted: 0.6, manual: 0.3, missing: 0 }; return Math.round((RULES.reduce((s, r) => s + w[r.mode], 0) / RULES.length) * 100); };

function liveLine(key, game, settings) {
  if (!game) return null;
  const d = game.domain, h = game.hero;
  switch (key) {
    case 'rooms': return `${d.rooms} places entered in Domain ${d.n}; ${game.pieces.length} on the map.`;
    case 'lair': return d.lairFound ? (d.exitFound ? 'Lair found, and the way out.' : `Lair found. Exit Die at D${d.exit}.`) : `Lair Die at D${d.lair}; ${Math.max(0, 15 - d.rooms)} rooms until the lair is certain.`;
    case 'tension': return `Tension Die at D${d.tension}.`;
    case 'darkness': return d.darkness.length ? `${d.darkness.length} in play: ${d.darkness.map((x) => x.text.split('.')[0]).join('; ')}.` : 'None in play.';
    case 'light': return `${h.vit.light} rooms left; ${h.items.torches} spare Torches.`;
    case 'exh': return `Exhaustion ${h.vit.exh}.`;
    case 'sanity': return `Sanity ${h.vit.sanity} of ${h.vit.maxSanity}; Resolve ${h.resist.Resolve}.`;
    case 'narration': return settings.narrate ? 'On: Rindewind writes a line for each new place.' : 'Off: only the book\'s words.';
    case 'dice': return settings.fast ? 'Quick dice: no 3D throw.' : '3D dice across the scroll.';
    default: return null;
  }
}

function Flow({ proc, now }) {
  return (
    <ol className="dbt-flow">
      {proc.steps.map((s) => (
        <li key={s.id} className={`k-${s.kind || 'step'} ${now === s.id ? 'now' : ''} mode-${s.mode}`}>
          <span className="node" aria-hidden="true">{s.kind === 'ask' ? '?' : s.kind === 'end' ? <Ico n="star" size={12} /> : ''}</span>
          <div className="body">
            <p><b><Rich text={s.t} /></b>{now === s.id && <em className="dbt-chip gilt sm">You are here</em>}</p>
            {(s.yes || s.no) && <p className="branch">{s.yes && <span><i>Yes</i> <Rich text={s.yes} /></span>}{s.no && <span><i>No</i> <Rich text={s.no} /></span>}</p>}
            <p className="meta">{s.roll && <span className="dbt-chip sm"><Ico n="d20" size={12} />{s.roll}</span>}<span className={`dbt-chip sm ${MODE[s.mode][1]}`}>{MODE[s.mode][0]}</span>{s.page && <span className="pg">p. {s.page}</span>}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function RulesView({ game, onPage, settings, setSettings }) {
  const [tab, setTab] = useState('flow');
  const [proc, setProc] = useState('explore');
  const [tbl, setTbl] = useState('events');
  const [open, setOpen] = useState(null);
  const [foe, setFoe] = useState('Flesh Eater');
  const now = whereNow(game);
  const cov = coverage();
  const lastRolls = useMemo(() => { const m = {}; for (const e of game?.log || []) { if (e.kind === 'event') m.events = e.rolls?.[0]?.value; if (e.kind === 'darkness') m.darkness = e.rolls?.[0]?.value; } return m; }, [game?.log]);
  const tb = tbl.startsWith('loot:') ? (() => { const x = LOOT[tbl.slice(5)]; return { die: `d${x.die}`, page: x.page, rows: x.rows }; })() : T[tbl];
  const [mast, setMast] = useState(MASTERY_NAMES[0]);
  const lv = game?.hero.level || 1; const inf = game && !game.domain.overseerSlain ? { roll: game.domain.overseer.roll, seed: game.domain.seed } : null;
  return (
    <div className="dbt-page dbt-rules">
      <header className="dbt-head"><div><span className="dbt-kick">Ker Nethalas · Gravebound Edition</span><h1>How this session runs</h1></div>
        <Tip tip={{ title: 'How much of the book the beta runs', body: `Every rule and procedure of the book has a card below. One done for you counts in full, one rolled for you but settled by you counts 60%, one you track yourself 30%, one not built yet nothing. ${RULES.filter((x) => x.mode === 'missing').length} of the ${RULES.length} are not built yet, which is why this is not 100%.` }} className="dbt-cov-badge"><b>{cov}%</b><small>of the book run by the beta</small><em>{RULES.filter((x) => x.mode === 'auto').length} done · {RULES.filter((x) => x.mode === 'assisted' || x.mode === 'manual').length} partly · {RULES.filter((x) => x.mode === 'missing').length} to build</em></Tip></header>
      <Panel plate="This session" icon="quill" className="dbt-session">
        <div className="dbt-session-grid">
          <div><small>Game</small><b>Ker Nethalas: Into the Midnight Throne</b></div>
          <div><small>Domain</small><b>{game ? `${game.domain.n}, ruled by ${game.domain.overseer.name}` : 'No game open'}</b></div>
          <div><small>Influence</small><b>{game ? game.domain.overseer.influence : '-'}</b></div>
          <div><small>Encounter table</small><b>{!game || game.domain.n <= 1 ? "The First Domain's (p. 244)" : 'D6: Table A or B, then D20 (pp. 133-134)'}</b></div>
          <div><small>Creatures</small><b>{game ? `Adapted to level ${game.hero.level || 1}${game.domain.overseerSlain ? '' : `, ${game.domain.overseer.influence.split('.')[0]}`}` : 'At level 1'}</b></div>
        </div>
        <div className="dbt-session-switches">
          <Switch id="dbt-s-narr" checked={settings.narrate} onChange={(v) => setSettings({ narrate: v })} label="Rindewind narrates" sub="A line or two for each new place; never changes what happened" />
          <Switch id="dbt-s-fast" checked={settings.fast} onChange={(v) => setSettings({ fast: v })} label="Quick dice" sub="Skip the 3D throw; the same rules, faster" />
          <Switch id="dbt-s-steps" checked={settings.stepwise !== false} onChange={(v) => setSettings({ stepwise: v })} label="Roll step by step" sub="Each roll in turn, with what it is for; off throws them all at once" />
        </div>
        <Bar value={cov} max={100} tone="gilt" />
      </Panel>
      <Seg value={tab} onChange={setTab} label="Sections" options={[['flow', 'Flowcharts', 'compass'], ['rules', 'Rules in force', 'scales'], ['tables', 'Book tables', 'scroll'], ['bestiary', 'Bestiary', 'skull'], ['masteries', 'Masteries', 'spark']]} />

      {tab === 'flow' && (
        <div className="dbt-flows">
          <div className="dbt-flow-pick">{PROCEDURES.map((p) => <button key={p.id} type="button" className={proc === p.id ? 'on' : ''} onClick={() => setProc(p.id)}><Ico n={p.icon} size={18} />{p.title}{now?.startsWith(p.id) && <i className="dot" aria-label="you are here" />}</button>)}</div>
          <Panel plate={PROCEDURES.find((p) => p.id === proc).title} icon={PROCEDURES.find((p) => p.id === proc).icon}><Flow proc={PROCEDURES.find((p) => p.id === proc)} now={now} /></Panel>
          <p className="dbt-note">Adapted from the "Processes" flowcharts (Jono, v0.01) in your Ker Nathalas folder, with page numbers moved to the Gravebound Edition. Each step says whether the beta does it for you.</p>
        </div>
      )}

      {tab === 'rules' && RULE_GROUPS.map(([g, title, icon]) => (
        <Panel key={g} plate={title} icon={icon} className="dbt-rulegroup">
          {RULES.filter((r) => r.group === g).map((r) => {
            const isOpen = open === r.id; const live = liveLine(r.live, game, settings);
            return (
              <article key={r.id} className={`dbt-rule ${isOpen ? 'open' : ''}`}>
                <button type="button" className="dbt-rule-head" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}>
                  <span className={`mode ${MODE[r.mode][1]}`} aria-hidden="true" /><b>{r.title}</b><em>{MODE[r.mode][0]}</em><Ico n={isOpen ? 'close' : 'next'} size={14} />
                </button>
                {live && <p className="dbt-rule-live"><Ico n="eye" size={14} /> {live}</p>}
                {isOpen && (
                  <div className="dbt-rule-body">
                    <div><h5>The book</h5><p><Rich text={r.book} /></p></div>
                    <div><h5>In this session</h5><p><Rich text={r.session} /></p></div>
                    {r.page && <button type="button" className="dbt-btn sm ghost" onClick={() => onPage(r.page)}><Ico n="tome" size={16} /> Read page {r.page}</button>}
                  </div>
                )}
              </article>
            );
          })}
        </Panel>
      ))}

      {tab === 'tables' && (
        <Panel plate="The book's tables" icon="scroll">
          <div className="dbt-seg wrapseg">{[['room', 'Rooms'], ['corridor', 'Corridors'], ['overseer', 'Overseer Influence'], ['events', 'Events'], ['darkness', 'Growing Darkness'], ...Object.keys(LOOT).map((k) => [`loot:${k}`, k[0] + k.slice(1).toLowerCase().replace(/ \(pages? [\d-]+\)/, '')])].map(([k, l]) => <button key={k} type="button" className={tbl === k ? 'on' : ''} onClick={() => setTbl(k)}>{l}</button>)}</div>
          <p className="dbt-note">{tb.die.toUpperCase()} · {tb.rows.length} rows · <PageChip page={tb.page} onPage={onPage} />{lastRolls[tbl] ? ` · last rolled: ${lastRolls[tbl]}` : ''}</p>
          <div className="dbt-tbl">{tb.rows.map((r) => <div key={`${r.lo}-${r.hi}`} className={lastRolls[tbl] >= r.lo && lastRolls[tbl] <= r.hi ? 'hit' : ''}><b>{r.lo === r.hi ? r.lo : `${r.lo}-${r.hi}`}</b><span><Rich text={r.text ?? r.t} /></span></div>)}</div>
        </Panel>
      )}

      {tab === 'masteries' && (
        <>
          <div className="dbt-seg wrapseg">{MASTERY_NAMES.map((k) => <button key={k} type="button" className={mast === k ? 'on' : ''} onClick={() => setMast(k)}>{k}</button>)}</div>
          <Panel plate={mast} icon="spark" className="dbt-mastery-full">
            <p className="dbt-fell">{MASTERIES[mast].blurb}</p>
            {MASTERIES[mast].feature && <p><b>Mastery Feature: {MASTERIES[mast].feature.name}.</b> {MASTERIES[mast].feature.text}</p>}
            {MASTERIES[mast].tiers.map((t) => <div key={t.tier} className="dbt-tierrow"><b>Tier {t.tier}: {t.name}</b><small>{t.action}{t.cost ? ` · ${t.cost}` : ''}</small><p><Rich text={t.text} /></p></div>)}
            {MASTERIES[mast].training?.length > 0 && <><h4 className="dbt-sub">Where did you train? (D6)</h4>{MASTERIES[mast].training.map((e) => <p key={e.n} className="dbt-note"><b>{e.n}. {e.name}.</b> {e.text}</p>)}</>}
            <button type="button" className="dbt-btn sm ghost" onClick={() => onPage(MASTERIES[mast].page)}><Ico n="tome" size={16} /> Read page {MASTERIES[mast].page}</button>
          </Panel>
        </>
      )}

      {tab === 'bestiary' && (
        <>
          {[['The First Domain (p. 244)', FIRST_DOMAIN.map(([, n]) => n)], ['Combat Encounters, Table A (D6 1-3, p. 133)', TABLE_A], ['Combat Encounters, Table B (D6 4-6, p. 134)', TABLE_B], ['Summoned', ['Lesser Demon']]].map(([title, names]) => (
            <div key={title} className="dbt-bgroup"><h4 className="dbt-sub">{title}</h4><div className="dbt-seg wrapseg">{names.map((k, i) => <button key={k} type="button" className={foe === k ? 'on' : ''} onClick={() => setFoe(k)}>{names.length === 20 ? <i>{i + 1}</i> : null}{k}</button>)}</div></div>
          ))}
          <Panel plate={foe} icon="skull"><MonsterCard name={foe} stat={statOf(foe, lv, OVERSEERS.includes(foe) ? null : inf)} /></Panel>
          <Panel plate="The Overseers" icon="star">
            <p className="dbt-note">The ten rulers of the Domains, as the book draws them (pp. 180-198). Each waits in its Domain's lair; tap one for its stat block.</p>
            <div className="dbt-overseers">{OVERSEERS.map((o) => <figure key={o} className={`${game?.domain.overseer.name === o ? 'now' : ''} ${foe === o ? 'on' : ''}`} onClick={() => setFoe(o)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setFoe(o); }}><img src={overseerImg(o)} alt={o} loading="lazy" /><figcaption>{o}{game?.domain.overseer.name === o ? <em> · rules this Domain</em> : null}</figcaption></figure>)}</div>
          </Panel>
        </>
      )}
    </div>
  );
}
