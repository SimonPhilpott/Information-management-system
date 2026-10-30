// D&D Solo, beta (29 Oct 2026, Simon: "build this as a (beta) version service ... so I can compare each design side by
// side"; then "really go to town ... a truly enriched redesign that is thematic", with Rindewind back, a sheet after
// the Ker Nethalas character sheet, hover descriptions everywhere, wounds on a silhouette, creature cards, rules you
// can open, and the map only when you want it).
//
// Since 29 Oct 2026 this is the D&D Solo DM at /ims/dnd (the classic is retired; /ims/dnd-beta still lands here). Games
// are kept on the server for each player (/api/dnd/beta/games) with this browser as a cache; the people Simon invites
// play their own, and everyone can watch everyone else's adventures (/api/dnd/beta/others) but never play them.
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
  const [isOwner, setIsOwner] = useState(false); const [invite, setInvite] = useState(false);
  useEffect(() => { fetch('/api/dnd/me').then((r) => r.json()).then((d) => setIsOwner(Boolean(d.isOwner))).catch(() => {}); }, []);
  return (
    <ServicePage title="D&D Solo DM" icon="dice" accent="brown" wide theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} rail={false}
      actions={isOwner ? <button type="button" className="dbt-invite" onClick={() => setInvite(true)}><Ico n="quill" size={14} /> Invite players</button> : null}>
      <Body />
      {isOwner && <div className="dbt"><Invites open={invite} onClose={() => setInvite(false)} /></div>}
    </ServicePage>
  );
}

// Invites (the shared guest list of the deck builder and Homebrew): an invited person signs in with Google at
// /ims/dnd and plays their own adventures; they can watch yours and you theirs.
function Invites({ open, onClose }) {
  const [list, setList] = useState(null); const [email, setEmail] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { const d = await (await fetch('/api/homebrew/invites')).json(); setList(d.invites || []); } catch { setList([]); } }, []);
  useEffect(() => { if (open) load(); }, [open, load]);
  const link = `${window.location.origin}/ims/dnd`;
  const add = async () => {
    setBusy(true); setMsg('');
    try {
      const d = await (await fetch('/api/homebrew/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) })).json();
      if (!d.success) throw new Error(d.error || 'That did not work.');
      setEmail(''); load(); setMsg(`${d.invite?.email || 'They'} can come in now: send them the link.`);
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  const revoke = async (e) => { await fetch(`/api/homebrew/invites/${encodeURIComponent(e)}`, { method: 'DELETE' }); load(); };
  const live = (list || []).filter((x) => !x.revokedAt);
  return (
    <Sheet open={open} onClose={onClose} title="Invite players" icon="quill">
      <p className="dbt-note">Anyone you invite signs in with their Google account (just their name and email) and plays their own adventures with Rindewind. You can each watch the other's progress from Games, but nobody can play anyone else's. The same invite also opens the deck builder and Homebrew.</p>
      <div className="dbt-invite-link"><code>{link}</code><button type="button" className="dbt-btn sm" onClick={() => { try { navigator.clipboard?.writeText(link); setMsg('Link copied: send it to them.'); } catch { setMsg(link); } }}>Copy the link</button></div>
      <div className="dbt-row"><input className="dbt-input" type="email" placeholder="Their Google email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && email.trim()) add(); }} aria-label="Their Google email" />
        <button type="button" className="dbt-btn primary" disabled={busy || !email.trim()} onClick={add}>Invite</button></div>
      {msg && <p className="dbt-note" role="status">{msg}</p>}
      <h4 className="dbt-sub">Invited</h4>
      {list === null ? <p className="dbt-note">Looking…</p> : live.length ? live.map((x) => (
        <div key={x.email} className="dbt-packrow"><span className="dbt-roundel sm"><Ico n="ghost" size={18} /></span>
          <div className="t"><b>{x.name || x.email}</b><small>{x.email}{x.lastSignInAt ? ` · last in ${new Date(x.lastSignInAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ' · not signed in yet'}</small></div>
          <div className="b"><button type="button" className="dbt-btn sm ghost" onClick={() => revoke(x.email)}>Remove</button></div></div>
      )) : <p className="dbt-note">Nobody yet.</p>}
    </Sheet>
  );
}

// the server copy of the games: load once, then save each change a moment after it settles
const tidy = (g) => {
  if (!g?.log?.some((e) => e.title === 'From the classic service' || e.title === 'Where the classic left off')) return g;
  return { ...g, log: g.log.map((e) => (e.title === 'From the classic service' ? { ...e, title: 'The story so far' }
    : e.title === 'Where the classic left off' ? { ...e, title: 'Where the tale stands', text: String(e.text).replace(/\s*The beta does not carry a fight in progress, so you stand in a quiet moment\.?/, '') } : e)) };
};
const api = async (method, path, body) => { const r = await fetch(`/api/dnd${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }); const d = await r.json().catch(() => ({})); if (!r.ok || d.success === false) throw new Error(d.error || `HTTP ${r.status}`); return d; };

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
  const [games, setGames] = useState(() => lsGet(STORE, []).map(tidy));
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
  // saving to the server: one timer per game, so a burst of moves becomes one save
  const timers = useRef({}); const [synced, setSynced] = useState('local');
  const push = useCallback((g) => {
    clearTimeout(timers.current[g.id]);
    timers.current[g.id] = setTimeout(() => { api('PUT', `/beta/games/${encodeURIComponent(g.id)}`, { state: g }).then(() => setSynced('saved')).catch(() => setSynced('offline')); }, 900);
  }, []);
  const commit = useCallback((g) => { gameRef.current = g; push(g); setGames((prev) => save(prev.some((x) => x.id === g.id) ? prev.map((x) => (x.id === g.id ? g : x)) : [g, ...prev])); }, [save, push]);
  // on arrival: the server's games, newer of the two copies wins; games only in this browser are sent up
  const [table, setTable] = useState([]); const [me, setMe] = useState('');
  useEffect(() => {
    let live = true;
    api('GET', '/beta/games').then((d) => {
      if (!live) return; setMe(d.me || '');
      const server = d.games || []; const local = lsGet(STORE, []);
      const byId = new Map(server.map((g) => [g.id, g]));
      for (const g of local) { const sv = byId.get(g.id); if (!sv || (g.updated || 0) > (sv.updated || 0)) { byId.set(g.id, g); api('PUT', `/beta/games/${encodeURIComponent(g.id)}`, { state: g }).catch(() => {}); } }
      const merged = [...byId.values()].map((g) => { const t = tidy(g); if (t !== g) api('PUT', `/beta/games/${encodeURIComponent(t.id)}`, { state: t }).catch(() => {}); return t; }).sort((a, b) => (b.updated || 0) - (a.updated || 0));
      setGames(save(merged)); setSynced('saved');
      setView((v) => (v === 'games' && merged.some((g) => g.id === lsGet(LAST, null)) ? 'play' : v));
    }).catch(() => setSynced('offline'));
    api('GET', '/beta/others').then((d) => live && setTable(d.games || [])).catch(() => {});
    return () => { live = false; };
  }, [save]);
  // the play screen on a wide window fills the window and never slides: only the scroll and the side panel scroll
  const rootRef = useRef(null);
  useEffect(() => {
    const sc = rootRef.current?.closest('.scroll'); if (!sc) return undefined;
    const q = window.matchMedia('(min-width: 1000px)');
    const apply = () => { const lock = view === 'play' && q.matches; sc.style.overflow = lock ? 'hidden' : ''; if (lock) sc.scrollTop = 0; };
    apply(); q.addEventListener?.('change', apply);
    return () => { q.removeEventListener?.('change', apply); sc.style.overflow = ''; };
  }, [view]);
  const [watching, setWatching] = useState(null);
  const [sheetPage, setSheetPage] = useState('one'); const [openFirst, setOpenFirst] = useState(null);
  const goSheet = (pg) => { setSheetPage(pg || 'one'); setView('sheet'); };
  const hudGo = (t) => { if (!t) return; if (t.startsWith('sheet')) goSheet(t.split(':')[1]); else { setOpenFirst(t); setView('play'); } };
  const watch = async (id) => { try { const d = await api('GET', `/beta/others/${encodeURIComponent(id)}`); setWatching(d.game); setView('watch'); } catch (e) { toastMsg(e.message); } };
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

  // how the survivor is, in words, so his telling fits (hurt, frightened, in the dark)
  const heroState = (h) => { const v = h.vit; const bits = []; if (v.health <= Math.ceil(v.maxHealth / 3)) bits.push('badly hurt'); else if (v.tough < v.maxTough / 2) bits.push('bruised and tiring'); if (v.sanity <= 4) bits.push('close to breaking'); if (v.light <= 2) bits.push('the light failing'); if (E.exhTier(h) > 0) bits.push('exhausted'); (h.effects || []).slice(0, 2).forEach((e) => bits.push(e.name.toLowerCase())); return bits.join(', '); };
  const lastDress = (g) => [...g.log].reverse().find((l) => l.dress)?.dress || '';
  const dress = useCallback(async (g, entry, kind = null) => {
    if (!narrate || !entry) return;
    try {
      const p = E.here(g);
      const roll = kind === 'roll';
      const { text } = await post('/beta/dress', { title: roll ? `${entry.title}${entry.result ? ` (${entry.result})` : ''}` : E.placeName(p), book: entry.text, tags: p?.tags || [], kind: roll ? 'roll' : p?.kind, overseer: g.domain.overseer.name, light: g.hero.vit.light,
        hero: { name: g.hero.name, state: heroState(g.hero) }, before: lastDress(g),
        hint: roll ? 'This is the outcome of something the survivor just attempted or suffered. Show it happening in one or two vivid sentences (at most 45 words), true to whether it went well or badly.' : '' });
      const cur = gameRef.current; if (!text || !cur || cur.id !== g.id) return;
      commit({ ...cur, log: cur.log.map((l) => (l.id === entry.id ? { ...l, dress: text } : l)) });
    } catch { /* the book's own words stand without him */ }
  }, [narrate, commit]);

  // the place you stand in is told, if it was entered before he told places (or while narration was off)
  const toldHere = useRef(null);
  useEffect(() => {
    if (!narrate || !game || busy || toldHere.current === game.here) return;
    const entry = [...game.log].reverse().find((e) => e.kind === 'room' && e.place === game.here);
    toldHere.current = game.here;
    if (entry && !entry.dress) dress(game, entry);
  }, [game?.here, narrate, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rindewind's line for an event check's outcome, written into that check on the scroll (never changing the result)
  const narrateAsk = useCallback(async (g, i) => {
    if (!narrate || !g) return;
    const p = E.here(g); const a = p?.event?.asks?.[i]; if (!a?.done) return;
    try {
      const outcome = a.done.skipped ? `The survivor chose to leave it. ${a.done.text}` : `The survivor ${a.done.pass ? 'passed' : 'failed'} the ${a.done.skill} check. What happens: ${a.done.text}`;
      const { text } = await post('/beta/dress', { title: 'Event outcome', book: `${p.event.text} ${outcome}`, tags: p.tags || [], kind: 'event', overseer: g.domain.overseer.name, light: g.hero.vit.light, hint: 'Write one or two sentences showing this outcome as it happens. Do not add new rolls, rewards or harm.' });
      const cur = gameRef.current; if (!text || !cur || cur.id !== g.id) return;
      const pc = E.here(cur); const ev = pc?.event; if (!ev?.asks?.[i]) return;
      const asks = ev.asks.map((x, k) => (k === i ? { ...x, dress: text } : x));
      commit({ ...cur, pieces: cur.pieces.map((q) => (q.id === pc.id ? { ...q, event: { ...ev, asks } } : q)), log: cur.log.map((l) => (l.id === ev.entryId ? { ...l, asks } : l)) });
    } catch { /* the result stands without him */ }
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
      if (res.combat) res = { ...res, state: E.startCombat(res.state, Boolean(res.combat.surprised)).state };
      else if (res.darkness?.ambush) { const a = E.ambush(res.state); res = { ...a, state: E.startCombat(a.state, true).state }; }
      commit(res.state);
      const room = (res.out || []).find((o) => o.kind === 'room');
      if (room) dress(res.state, room);
      // a roll you chose to make gets a line of the story too (the creatures' own turns do not, to keep the fight quick)
      else if (info) { const main = (res.out || []).find((o) => o.rolls?.length && o.kind !== 'darkness'); if (main) dress(res.state, main, 'roll'); }
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
    <div ref={rootRef} className={`dbt ${dark ? 'dark' : ''}`} data-view={view}>
      <TipHost onPage={(n) => openPage(n)}>
        <main className="dbt-views">
          {view === 'games' && <GamesView games={games} curId={curId} onOpen={select} onNew={() => setView('new')} onImport={importFrom}
            onDelete={(id) => { const next = save(games.filter((g) => g.id !== id)); setGames(next); api('DELETE', `/beta/games/${encodeURIComponent(id)}`).catch(() => {}); if (curId === id) { setCurId(null); lsSet(LAST, null); } }}
            table={table} onWatch={watch} me={me} synced={synced} />}
          {view === 'new' && <NewView throwDice={throwDice} busy={busy} setBusy={setBusy} trayNode={trayNode} onBack={() => setView('games')} onCreate={(g) => { commit(g); select(g.id); toastMsg('Your survivor wakes among the dead.'); }} />}
          {view === 'play' && needGame(<PlayView onFlagSend={(note, entry) => api('POST', '/beta/flags', { gameId: game.id, note, entry, context: { place: E.placeName(E.here(game)), log: game.log.slice(-25), hero: { name: game.hero.name, level: game.hero.level, vit: game.hero.vit, effects: game.hero.effects, weapons: game.hero.weapons, wield: game.hero.wield, shield: game.hero.shield, masteries: game.hero.masteries }, combat: game.combat, domain: game.domain, checks: game.checks || [] } })} narrateAsk={narrateAsk} openFirst={openFirst} clearOpenFirst={() => setOpenFirst(null)} onGoSheet={goSheet} game={game} busy={busy} act={act} pending={pending} onThrow={throwPending} onCancelRoll={cancelPending} commit={commit} trayNode={trayNode} toast={toastMsg} onPage={openPage} voice={voice} onHero={() => setView('sheet')} />)}
          {(view === 'sheet' || view === 'chronicle') && game && <Hud game={game} onAdjust={() => setView('play')} onHero={() => setView('sheet')} onMap={() => setView('play')} onHere={() => setView('play')} onGo={hudGo} />}
          {view === 'sheet' && needGame(<SheetView startPage={sheetPage} game={game} commit={commit} act={(...a) => { setView('play'); act(...a); }} />)}
          {view === 'chronicle' && needGame(<ChronicleView game={game} onPage={openPage} voice={voice} commit={commit} />)}
          {view === 'watch' && watching && (
            <div className="dbt-page dbt-watch">
              <div className="dbt-callout"><b><Ico n="eye" size={16} /> {watching.watching?.ownerName || 'Someone'}&apos;s adventure</b><p className="dbt-note">You are watching {watching.hero?.name}: you can read their chronicle and their sheet, but not play for them.</p>
                <div className="dbt-row"><button type="button" className="dbt-btn sm" onClick={() => setView('games')}><Ico n="back" size={14} /> Back to Games</button></div></div>
              <Hud game={watching} onAdjust={() => {}} onHero={() => {}} onMap={() => {}} onHere={() => {}} />
              <ChronicleView game={watching} onPage={openPage} voice={voice} />
              <SheetView game={watching} commit={() => toastMsg(`This is ${watching.watching?.ownerName || 'someone else'}'s adventure: you can only watch.`)} act={() => {}} />
            </div>
          )}
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
