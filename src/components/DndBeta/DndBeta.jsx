// D&D Solo, beta (29 Oct 2026, Simon: "build this as a (beta) version service ... so I can compare each design side by
// side"; then "really go to town ... a truly enriched redesign that is thematic", with Rindewind back, a sheet after
// the Ker Nethalas character sheet, hover descriptions everywhere, wounds on a silhouette, creature cards, rules you
// can open, and the map only when you want it).
//
// Runs at /ims/dnd-beta beside the classic /ims/dnd and shares none of its data: games are kept in this browser only.
// Ker Nethalas runs on its own rules engine (kn/engine.js) and the book's tables (kn/bookTables.json); the 3D dice are
// thrown across the scroll and their numbers are what the rules use. Rindewind adds a line to each new place and
// answers questions (/api/dnd/beta/dress, /api/dnd/beta/ask). Sections: Play, Sheet, Chronicle, Rules, Games.
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import ServicePage from '../Material/ServicePage';
import { DarkCtx } from '../HomebrewBeta/ui';
import DiceTray from '../Material/DiceTray';
import { dndAudio } from '../DndSolo/dndAudioEngine';
import '../Material/dnd.css';
import './dndbeta.css';
import * as E from './kn/engine';
import { fromClassic } from './importClassic';
import { brief } from './kn/brief';
import Ico from './ui/Ico';
import { TipHost } from './ui/Tip';
import { Sheet } from './ui/Bits';
import PlayView, { Hud } from './views/Play';
import { FONT_LINK } from './library';
import SheetView from './views/Sheet';
import ChronicleView from './views/Chronicle';
import RulesView from './views/Rules';
import GamesView, { NewView } from './views/Games';
import Rindewind, { RindewindButton, useVoice } from './views/Rindewind';

const STORE = 'imsd-beta-games', LAST = 'imsd-beta-last', NARR = 'imsd-beta-narrate', FAST = 'imsd-beta-fast';
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage may be blocked */ } };
const NAV = [['play', 'Play', 'scroll'], ['sheet', 'Sheet', 'helm'], ['chronicle', 'Chronicle', 'tome'], ['rules', 'Rules', 'compass'], ['games', 'Games', 'door']];
const post = async (path, body) => { const r = await fetch(`/api/dnd${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok || d.success === false) throw new Error(d.error || `HTTP ${r.status}`); return d; };

export default function DndBeta({ theme, onThemeToggle, setCurrentPath }) {
  const go = (to) => { window.history.pushState(null, '', to); if (setCurrentPath) setCurrentPath(to); else window.dispatchEvent(new PopStateEvent('popstate')); };
  return (
    <ServicePage title="D&D Solo Beta" icon="dice" accent="brown" wide theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} rail={false}
      actions={<button type="button" onClick={() => go('/ims/dnd')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid currentColor', color: 'inherit', borderRadius: 999, padding: '6px 14px', font: "600 12px 'Cinzel', serif", letterSpacing: '.06em', cursor: 'pointer', minHeight: 36, whiteSpace: 'nowrap' }}><Ico n="back" size={14} /> The classic</button>}>
      <Body />
    </ServicePage>
  );
}

// the book, a page at a time (the pages the Drive library already serves)
function PageSheet({ page, onClose }) {
  const [n, setN] = useState(page?.n || 1);
  useEffect(() => { setN(page?.n || 1); }, [page]);
  if (!page) return null;
  return (
    <Sheet open onClose={onClose} title={`${page.book || 'Ker Nethalas'}, page ${n}`} icon="tome" wide className="dbt-pagesheet">
      {page.id ? <img className="dbt-bookpage" src={`/api/drive/page-image/${page.id}/${n}`} alt={`Page ${n}`} /> : <p className="dbt-note">The rulebook could not be found in the library index.</p>}
      <div className="dbt-row"><button type="button" className="dbt-btn ghost" disabled={n <= 1} onClick={() => setN(n - 1)}><Ico n="back" size={16} /> Page {n - 1}</button><button type="button" className="dbt-btn ghost" onClick={() => setN(n + 1)}>Page {n + 1} <Ico n="next" size={16} /></button></div>
    </Sheet>
  );
}

function PaperTray({ tray, paper, dark }) {
  return <div className={`dbt-paper ${paper ? 'active' : ''}`} aria-hidden="true"><DiceTray ref={tray} dark={dark} height={340} onPaper onKnock={(s) => dndAudio.knock?.(s)} /></div>;
}

// the typefaces (the tome's, and each game's), linked once: an @import inside the bundled CSS would be ignored
function useFonts() {
  useEffect(() => {
    if (document.getElementById('dbt-fonts')) return;
    const l = document.createElement('link'); l.id = 'dbt-fonts'; l.rel = 'stylesheet'; l.href = FONT_LINK; document.head.appendChild(l);
  }, []);
}

function Body() {
  useFonts();
  const dark = useContext(DarkCtx);
  const [games, setGames] = useState(() => lsGet(STORE, []));
  const [curId, setCurId] = useState(() => lsGet(LAST, null));
  const [view, setView] = useState(() => (lsGet(STORE, []).some((g) => g.id === lsGet(LAST, null)) ? 'play' : 'games'));
  const game = games.find((g) => g.id === curId) || null;
  const gameRef = useRef(game); gameRef.current = game;
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [narrate, setNarrateS] = useState(() => lsGet(NARR, true));
  const [fast, setFastS] = useState(() => lsGet(FAST, false));
  const [toast, setToast] = useState('');
  const [rw, setRw] = useState(false);
  const [page, setPage] = useState(null);
  const [book, setBook] = useState(null);
  const tray = useRef(null);
  const [paper, setPaper] = useState(false);
  const fadeTimer = useRef(null);
  const toastMsg = useCallback((m) => { setToast(m); setTimeout(() => setToast(''), 3200); }, []);
  const voice = useVoice(toastMsg);
  const setNarrate = (v) => { setNarrateS(v); lsSet(NARR, v); };
  const setFast = (v) => { setFastS(v); lsSet(FAST, v); };

  // the rulebook's file in the library, for opening pages
  useEffect(() => {
    fetch('/api/dnd/rulesets/ker-nethalas').then((r) => r.json()).then((d) => {
      const files = d.ruleset?.metadata?.files || [];
      const core = files.find((f) => f.role === 'core') || files.find((f) => /midnight throne/i.test(f.filename || f.name || '')) || files[0];
      if (core) setBook({ id: core.id, name: (core.filename || 'Ker Nethalas').replace(/\.pdf$/i, '') });
    }).catch(() => {});
  }, []);
  const openPage = useCallback((n, fileId) => setPage({ n, id: fileId || book?.id, book: book?.name }), [book]);

  const save = useCallback((next) => { lsSet(STORE, next); return next; }, []);
  const commit = useCallback((g) => { gameRef.current = g; setGames((prev) => save(prev.some((x) => x.id === g.id) ? prev.map((x) => (x.id === g.id ? g : x)) : [g, ...prev])); }, [save]);
  const select = (id) => { setCurId(id); lsSet(LAST, id); setView('play'); };

  const throwDice = useCallback(async (plan) => {
    if (fast || !tray.current) return E.fakeFaces(plan);
    setPaper(true); dndAudio.ensureRunning?.(); dndAudio.playSfx?.(plan.kinds.length > 1 ? 'dice_pool' : 'dice_roll');
    let faces = null;
    try { faces = await tray.current.roll(plan.kinds); } catch { faces = null; }
    clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => { setPaper(false); setTimeout(() => tray.current?.clear?.(), 800); }, 2200);
    return faces && faces.length === plan.kinds.length ? faces : E.fakeFaces(plan);
  }, [fast]);

  const dress = useCallback(async (g, entry) => {
    if (!narrate || !entry) return;
    try {
      const p = E.here(g);
      const { text } = await post('/beta/dress', { title: entry.title, book: entry.text, tags: p?.tags || [], kind: p?.kind, overseer: g.domain.overseer.name, light: g.hero.vit.light });
      const cur = gameRef.current; if (!text || !cur || cur.id !== g.id) return;
      commit({ ...cur, log: cur.log.map((l) => (l.id === entry.id ? { ...l, dress: text } : l)) });
    } catch { /* the book's own words stand without him */ }
  }, [narrate, commit]);

  // a roll you make first appears as a prompt (the dice, what each decides, what you need); you throw when ready.
  // The creatures' turns (hint.auto) and rolls with no dice go straight through.
  const [pending, setPending] = useState(null);
  const run = useCallback(async (plan, apply, then, info) => {
    if (busyRef.current || !gameRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const faces = plan ? await throwDice(plan) : [];
      let res = apply(faces);
      if (info && res.out?.length) { const main = res.out.find((o) => o.rolls?.length) || res.out[0]; main.need = info.lines.filter((l) => l.need).map((l) => `${l.what}: ${l.need}`); main.needTitle = info.title; }
      if (res.combat) res = { ...res, state: E.startCombat(res.state).state };
      else if (res.darkness?.ambush) { const a = E.ambush(res.state); res = { ...a, state: E.startCombat(a.state, true).state }; }
      commit(res.state);
      const room = (res.out || []).find((o) => o.kind === 'room');
      if (room) dress(res.state, room);
      if (then) then(res);
    } finally { busyRef.current = false; setBusy(false); }
  }, [throwDice, commit, dress]);
  const act = useCallback((plan, apply, then, hint = {}) => {
    if (!plan || hint.auto || !gameRef.current) return run(plan, apply, then, null);
    const info = brief(plan, gameRef.current, hint);
    setPending({ plan, apply, then, info, onCancel: hint.onCancel });
    return undefined;
  }, [run]);
  const throwPending = () => { const p = pending; if (!p) return; setPending(null); run(p.plan, p.apply, p.then, p.info); };
  const cancelPending = () => { const p = pending; setPending(null); p?.onCancel?.(); };

  const importFrom = async (id) => {
    const r = await fetch(`/api/dnd/campaigns/${id}`); const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.campaign) throw new Error(d.error || 'The classic campaign could not be read.');
    const g = fromClassic(d.campaign); commit(g); select(g.id);
    toastMsg(`${g.hero.name} has crossed over, with ${g.pieces.length} places on the map.`);
  };

  const trayNode = <PaperTray tray={tray} paper={paper} dark={dark} />;
  const needGame = (node) => (game ? node : (
    <div className="dbt-page"><div className="dbt-empty"><Ico n="door" size={40} /><h2>No adventure open</h2><p>Roll a survivor, or open one from Games.</p><button type="button" className="dbt-btn primary" onClick={() => setView('games')}>Go to Games</button></div></div>
  ));
  return (
    <div className={`dbt ${dark ? 'dark' : ''}`} data-view={view}>
      <TipHost onPage={(n) => openPage(n)}>
        <main className="dbt-views">
          {view === 'games' && <GamesView games={games} curId={curId} onOpen={select} onNew={() => setView('new')} onImport={importFrom}
            onDelete={(id) => { const next = save(games.filter((g) => g.id !== id)); setGames(next); if (curId === id) { setCurId(null); lsSet(LAST, null); } }} />}
          {view === 'new' && <NewView throwDice={throwDice} busy={busy} setBusy={setBusy} trayNode={trayNode} onBack={() => setView('games')} onCreate={(g) => { commit(g); select(g.id); toastMsg('Your survivor wakes among the dead.'); }} />}
          {view === 'play' && needGame(<PlayView game={game} busy={busy} act={act} pending={pending} onThrow={throwPending} onCancelRoll={cancelPending} commit={commit} trayNode={trayNode} toast={toastMsg} onPage={openPage} voice={voice} onHero={() => setView('sheet')} />)}
          {(view === 'sheet' || view === 'chronicle') && game && <Hud game={game} onAdjust={() => setView('play')} onHero={() => setView('sheet')} onMap={() => setView('play')} onHere={() => setView('play')} />}
          {view === 'sheet' && needGame(<SheetView game={game} commit={commit} />)}
          {view === 'chronicle' && needGame(<ChronicleView game={game} onPage={openPage} voice={voice} />)}
          {view === 'rules' && <RulesView game={game} onPage={openPage} settings={{ narrate, fast }} setSettings={(s) => { if ('narrate' in s) setNarrate(s.narrate); if ('fast' in s) setFast(s.fast); }} />}
        </main>
        {<RindewindButton onClick={() => setRw(true)} voice={voice} />}
        <Rindewind game={game} open={rw} onClose={() => setRw(false)} narrate={narrate} setNarrate={setNarrate} voice={voice} onPage={openPage} />
        <PageSheet page={page} onClose={() => setPage(null)} />
        {toast && <div className="dbt-toast" role="status">{toast}</div>}
        <nav className="dbt-nav" aria-label="Sections">
          <div className="in">
            {NAV.map(([k, label, ic]) => (
              <button key={k} type="button" className={view === k || (view === 'new' && k === 'games') ? 'on' : ''} aria-current={view === k ? 'page' : undefined} onClick={() => setView(k)}><Ico n={ic} size={22} /><span>{label}</span></button>
            ))}
          </div>
        </nav>
      </TipHost>
    </div>
  );
}
