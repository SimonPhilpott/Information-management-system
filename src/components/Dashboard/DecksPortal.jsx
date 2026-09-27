import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CardHover from './CardHover';
import {
  Layers, Plus, Minus, Download, Upload, Search, RefreshCw, Trash2, Copy, ExternalLink, FlaskConical, Sparkles,
  BarChart3, FileJson, FileText, ChevronLeft, AlertTriangle, CheckCircle2, Package, X, Wand2, ClipboardCopy, UserPlus, Mail, Eye, MessageCircleQuestion, Send,
} from 'lucide-react';
import PortalShell from './PortalShell';
import { CampaignList, CampaignDetail } from './CampaignsView';
import { ArkhamList, ArkhamDetail } from './ArkhamCampaigns';
import { CAMPAIGN_GAMES, canonicalCampaignPath } from './campaignPaths';

// Campaign Manager (/campaigns): a tab per game - for now Lord of the Rings LCG (/campaigns/lotr) - with
// its campaigns first (/campaigns/lotr, /campaigns/lotr/<id>) and then the decks (/campaigns/lotr/decks,
// /campaigns/lotr/decks/<id>) - decks for the deck-construction games in the
// board game collection, built from the game's own card database (RingsDB for LOTR LCG), with
// tests, AI insights and exports. Decks can be imported from and pulled again from the deck site.

// A card's colour: its LOTR sphere or its Arkham class.
const SPHERE = {
  leadership: '#a855f7', tactics: '#ef4444', spirit: '#3b82f6', lore: '#22c55e', neutral: '#94a3b8', baggins: '#eab308', fellowship: '#f97316',
  guardian: '#2b80c5', seeker: '#ec8426', rogue: '#107116', mystic: '#4331b9', survivor: '#cc3038', mythos: '#475569',
};
const TYPES = ['hero', 'investigator', 'ally', 'asset', 'attachment', 'event', 'skill', 'player-side-quest', 'contract'];
// the deck's leader: LOTR heroes, or an Arkham investigator
const isLead = (c) => c?.type === 'hero' || c?.type === 'investigator';
const arkham = (game) => game === 'ahlcg';
// deck card types first, anything else (saga campaign cards and the like) last
const typeRank = (c) => { const i = TYPES.indexOf(c.type); return i < 0 ? 99 : i; };
const pct = (x) => `${Math.round((x || 0) * 100)}%`;

async function api(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.success === false) { const e = new Error(d.error || `Request failed (${res.status})`); e.code = d.code; throw e; }
  return d;
}

export default function DecksPortal({ theme = 'dark', onThemeToggle, setCurrentPath, currentPath = window.location.pathname }) {
  const isDark = theme === 'dark';
  const [notification, setNotification] = useState(null);
  const toast = useCallback((msg, type = 'success') => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3500); }, []);
  const go = (path) => { window.history.pushState(null, '', path); if (setCurrentPath) setCurrentPath(path); else window.dispatchEvent(new PopStateEvent('popstate')); };
  const path = canonicalCampaignPath(currentPath);
  const gameKey = path.split('/')[2];
  const deckId = (path.match(/^\/campaigns\/[a-z]+\/decks\/(\d+)/) || [])[1];
  const campaignId = (path.match(/^\/campaigns\/[a-z]+\/(\d+)/) || [])[1];
  const onDecks = path.startsWith(`/campaigns/${gameKey}/decks`);

  const ui = {
    isDark,
    panel: `rounded-2xl border p-4 sm:p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`,
    field: `w-full px-3 py-2 rounded-xl text-sm outline-none border ${isDark ? 'bg-slate-950/60 border-white/10' : 'bg-white border-[#2E2B27]/10'}`,
    muted: isDark ? 'text-slate-400' : 'text-slate-500',
    soft: isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10',
    row: isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10',
    primary: 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white',
  };

  return (
    <PortalShell title="Campaign Manager" subtitle="/campaigns • your card game campaigns, and the decks you play them with"
      icon={Layers} gradient="from-emerald-600 to-teal-700" glow="rgba(16,185,129,0.3)" maxWidth="max-w-7xl"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification}>
      {/* a tab for each game with campaigns */}
      <div className={`flex gap-1 border-b ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
        {CAMPAIGN_GAMES.map((g) => (
          <button key={g.key} onClick={() => go(`/campaigns/${g.key}`)}
            className={`px-4 py-2 -mb-px text-sm font-bold border-b-2 ${g.key === gameKey ? 'border-emerald-500' : `border-transparent ${ui.muted}`}`}>{g.name}</button>
        ))}
      </div>
      {!deckId && !campaignId && (
        <div className="flex gap-2">
          {[[`/campaigns/${gameKey}`, 'Campaigns', Sparkles, !onDecks], [`/campaigns/${gameKey}/decks`, 'Decks', Layers, onDecks]].map(([to, label, Icon, active]) => (
            <button key={to} onClick={() => go(to)} className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${active ? ui.primary : ui.soft}`}><Icon size={15} />{label}</button>
          ))}
        </div>
      )}
      {deckId ? <DeckEditor key={deckId} id={deckId} ui={ui} toast={toast} go={go} />
        : campaignId && gameKey === 'ahlcg' ? <ArkhamDetail key={campaignId} id={campaignId} ui={ui} toast={toast} go={go} />
        : campaignId ? <CampaignDetail key={campaignId} id={campaignId} ui={ui} toast={toast} go={go} />
        : onDecks ? <DeckList key={gameKey} gameKey={gameKey} ui={ui} toast={toast} go={go} />
        : gameKey === 'ahlcg' ? <ArkhamList ui={ui} toast={toast} go={go} />
        : <CampaignList ui={ui} toast={toast} go={go} />}
    </PortalShell>
  );
}

// ---- deck list ------------------------------------------------------------------------------------------
function DeckList({ ui, toast, go, gameKey = 'lotr' }) {
  const [games, setGames] = useState([]);
  const [decks, setDecks] = useState([]);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [cards, setCards] = useState(null);
  const [showPacks, setShowPacks] = useState(false);
  const [me, setMe] = useState(null);
  useEffect(() => { api('/api/decks/me').then(setMe).catch(() => {}); }, []);

  const load = useCallback(async () => {
    try {
      const [g, d] = await Promise.all([api('/api/decks/games'), api(`/api/decks/${gameKey}/decks`)]);
      setGames(g.games); setDecks(d.decks);
    } catch (err) { toast(err.message, 'error'); }
  }, [gameKey, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api(`/api/decks/${gameKey}/cards`).then(setCards).catch((err) => toast(err.message, 'error')); }, [gameKey, toast]);

  const game = games.find((g) => g.key === gameKey);
  const byCode = useMemo(() => Object.fromEntries((cards?.cards || []).map((c) => [c.code, c])), [cards]);

  const importDeck = async () => {
    if (!link.trim()) return;
    setBusy(true);
    try { const d = await api(`/api/decks/${gameKey}/import`, { method: 'POST', body: { link } }); setLink(''); toast(`Imported "${d.deck.name}".`); go(`/campaigns/${gameKey}/decks/${d.deck.id}`); }
    catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const newDeck = async () => {
    try { const d = await api(`/api/decks/${gameKey}/decks`, { method: 'POST', body: { name: 'New deck' } }); go(`/campaigns/${gameKey}/decks/${d.deck.id}`); } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <>
      <div className={ui.panel}>
        <div className="flex flex-wrap items-center gap-3">
          <b className="text-sm">{game?.name || ''}</b>
          {game && <a href={game.site.url} target="_blank" rel="noreferrer" className={`text-xs flex items-center gap-1 ${ui.muted}`}>Cards and decks from {game.site.name} <ExternalLink size={11} /></a>}
          <button onClick={newDeck} className={`ml-auto px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${ui.primary}`}><Plus size={15} /> New deck</button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <input className={ui.field} value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && importDeck()}
            placeholder={`Paste a ${game?.site.name || 'RingsDB'} deck link, e.g. ${game?.site.url || 'https://ringsdb.com'}/decklist/view/12345/... or /deck/view/12345`} />
          <button onClick={importDeck} disabled={busy || !link.trim()} className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shrink-0 disabled:opacity-40 ${ui.soft}`}>
            <Upload size={15} /> {busy ? 'Importing...' : `Import from ${game?.site.name || 'RingsDB'}`}
          </button>
        </div>
        <p className={`text-[11px] mt-2 ${ui.muted}`}>A private deck imports if "Share my decks" is switched on in your {game?.site.name || 'RingsDB'} account settings; published decklists always do.</p>
      </div>

      {!decks.length && <div className={ui.panel}><p className={`text-sm text-center py-8 ${ui.muted}`}>No decks yet - import one or start a new one.</p></div>}
      {groupByOwner(decks).map(([owner, list]) => (
      <div key={owner} className={ui.panel}>
        <h2 className="text-xs font-black uppercase tracking-wider mb-3">{list[0].mine ? 'Your decks' : `${list[0].ownerName}'s decks`} ({list.length})</h2>
        {(
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {list.map((d) => {
              const heroes = Object.keys(d.heroes).map((c) => byCode[c]).filter(Boolean);
              const n = Object.values(d.slots).reduce((a, b) => a + b, 0);
              return (
                <button key={d.id} onClick={() => go(`/campaigns/${gameKey}/decks/${d.id}`)} className={`text-left p-4 rounded-xl border hover:brightness-95 ${ui.row}`}>
                  <div className="font-bold text-[15px]">{d.name}</div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {heroes.map((h) => <span key={h.code} className="px-2 py-0.5 rounded-full text-[11px] font-bold text-white" style={{ background: SPHERE[h.sphere] || '#64748b' }}><CardHover card={h}>{h.name}</CardHover></span>)}
                  </div>
                  <div className={`text-xs mt-2 ${ui.muted}`}>
                    {n} cards · threat {heroes.reduce((t, h) => t + (Number(h.threat) || 0), 0)}
                    {d.source && d.source !== 'ims' ? ` · from ${d.source}` : ''}{d.insights ? ' · AI insights ready' : ''}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      ))}

      {me?.isOwner && <Invites ui={ui} toast={toast} />}

      {cards && <OwnedPacks ui={ui} toast={toast} gameKey={gameKey} cards={cards} setCards={setCards} open={showPacks} setOpen={setShowPacks} />}
    </>
  );
}

// Mine first, then everyone else's, each group newest first.
function groupByOwner(decks) {
  const groups = new Map();
  for (const d of [...decks].sort((a, b) => (b.mine - a.mine) || String(a.ownerName).localeCompare(String(b.ownerName)))) {
    if (!groups.has(d.owner)) groups.set(d.owner, []);
    groups.get(d.owner).push(d);
  }
  return [...groups.entries()];
}

// Invite people to the deck builder (owner only). They sign in with Google - name and email only -
// see every deck, run tests and insights on any of them, and manage their own.
function Invites({ ui, toast }) {
  const [list, setList] = useState([]);
  const [signIns, setSignIns] = useState([]);
  const [email, setEmail] = useState('');
  const load = useCallback(() => api('/api/decks/invites').then((d) => { setList(d.invites); setSignIns(d.signIns || []); }).catch((err) => toast(err.message, 'error')), [toast]);
  useEffect(() => { load(); }, [load]);
  const link = `${window.location.origin}/campaigns?invite=1`;
  const add = async () => {
    try { const d = await api('/api/decks/invites', { method: 'POST', body: { email } }); setEmail(''); load(); toast(`${d.invite.email} can now sign in to the Campaign Manager.`); } catch (err) { toast(err.message, 'error'); }
  };
  const revoke = async (e) => {
    if (!window.confirm(`Stop ${e} using the Campaign Manager? Their decks and campaigns stay here.`)) return;
    try { await api(`/api/decks/invites/${encodeURIComponent(e)}`, { method: 'DELETE' }); load(); } catch (err) { toast(err.message, 'error'); }
  };
  const mailto = (e) => `mailto:${e}?subject=${encodeURIComponent('Join my Campaign Manager (Lord of the Rings LCG)')}&body=${encodeURIComponent(`I've added you to my Campaign Manager. Open this link and sign in with this Google account (${e}):\n\n${link}\n\nYou can import your RingsDB decks (switch on "Share my decks" in your RingsDB settings first), look at mine, and run tests and AI insights on any of them.`)}`;
  return (
    <div className={ui.panel}>
      <h2 className="text-xs font-black uppercase tracking-wider mb-1 flex items-center gap-2"><UserPlus size={14} className="opacity-60" /> Invite people</h2>
      <p className={`text-xs mb-3 ${ui.muted}`}>They sign in with that Google account (name and email only - nothing else in IMS is open to them), manage their own decks, and can see yours, test them and run AI insights. AI insights use IMS's Gemini account.</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input className={ui.field} value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="their.gmail@gmail.com" type="email" />
        <button onClick={add} disabled={!email.trim()} className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shrink-0 disabled:opacity-40 ${ui.primary}`}><UserPlus size={15} /> Invite</button>
      </div>
      {list.length > 0 && (
        <div className="flex flex-col gap-2 mt-3">
          {list.map((x) => (
            <div key={x.email} className={`rounded-xl border p-3 flex flex-wrap items-center gap-2 ${ui.row} ${x.revokedAt ? 'opacity-60' : ''}`}>
              <div className="flex-1 min-w-[12rem]">
                <div className="text-sm font-semibold">{x.name || x.email}{x.name ? <span className={`font-normal ${ui.muted}`}> · {x.email}</span> : null}</div>
                <div className={`text-[11px] ${ui.muted}`}>
                  {x.revokedAt ? 'Invite withdrawn' : x.lastSignInAt ? `Joined · last signed in ${new Date(x.lastSignInAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Invited - not signed in yet'} · {x.decks} deck{x.decks === 1 ? '' : 's'}
                </div>
              </div>
              {!x.revokedAt && <>
                <a href={mailto(x.email)} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${ui.soft}`}><Mail size={13} /> Email invite</a>
                <button onClick={() => navigator.clipboard.writeText(link).then(() => toast('Invite link copied.'))} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${ui.soft}`}><ClipboardCopy size={13} /> Copy link</button>
                <button onClick={() => revoke(x.email)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-500">Withdraw</button>
              </>}
              {x.revokedAt && <button onClick={() => api('/api/decks/invites', { method: 'POST', body: { email: x.email } }).then(load)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${ui.soft}`}>Invite again</button>}
            </div>
          ))}
        </div>
      )}
      {signIns.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-black uppercase tracking-wider flex-1">Recent sign-in attempts</span>
            <button onClick={load} className={`p-1 rounded ${ui.soft}`} title="Refresh"><RefreshCw size={12} /></button>
          </div>
          {signIns.map((x, i) => (
            <div key={i} className="text-xs py-0.5 flex gap-2">
              <span className={ui.muted}>{new Date(x.at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <span className={x.outcome === 'signed-in' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>{x.outcome}</span>
              <span className="truncate">{x.email || '(unknown account)'}{x.detail ? <span className={ui.muted}> · {x.detail}</span> : null}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OwnedPacks({ ui, toast, gameKey, cards, setCards, open, setOpen }) {
  const [draft, setDraft] = useState(cards.owned.packs);
  useEffect(() => setDraft(cards.owned.packs), [cards]);
  const owned = Object.entries(cards.owned.packs).filter(([, n]) => n > 0);
  const save = async () => {
    try { await api(`/api/decks/${gameKey}/owned-packs`, { method: 'PUT', body: { packs: draft } }); setCards(await api(`/api/decks/${gameKey}/cards`)); toast('Your packs are saved.'); } catch (err) { toast(err.message, 'error'); }
  };
  const reset = async () => {
    try { await api(`/api/decks/${gameKey}/owned-packs`, { method: 'DELETE' }); setCards(await api(`/api/decks/${gameKey}/cards`)); toast('Back to the packs in your board game collection.'); } catch (err) { toast(err.message, 'error'); }
  };
  const refreshCards = async () => {
    try { setCards(await api(`/api/decks/${gameKey}/cards?refresh=1`)); toast('Card database refreshed.'); } catch (err) { toast(err.message, 'error'); }
  };
  return (
    <div className={ui.panel}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 text-left">
        <Package size={15} className="opacity-60" />
        <span className="text-xs font-black uppercase tracking-wider">Your packs ({owned.length})</span>
        <span className={`text-xs ${ui.muted} truncate`}>{cards.owned.from === 'collection' ? 'from your board game collection' : 'edited here'} · {owned.map(([c]) => cards.packs.find((p) => p.code === c)?.name || c).join(', ')}</span>
      </button>
      {open && (
        <div className="mt-4">
          <p className={`text-xs mb-3 ${ui.muted}`}>Set how many of each pack you own - two Core Sets means two of each Core card. Owned-only card lists and the AI's suggestions use this. Card database: {cards.cards.length} cards, updated {new Date(cards.fetchedAt).toLocaleDateString('en-GB')}.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 max-h-80 overflow-y-auto pr-1">
            {cards.packs.map((p) => (
              <label key={p.code} className="flex items-center gap-2 text-sm py-0.5">
                <input type="number" min="0" max="9" className={`${ui.field} !w-14 !py-1 text-center`} value={draft[p.code] || 0}
                  onChange={(e) => setDraft({ ...draft, [p.code]: Number(e.target.value) })} />
                <span className={draft[p.code] ? 'font-semibold' : ui.muted}>{p.name}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button onClick={save} className={`px-4 py-2 rounded-xl text-sm font-bold ${ui.primary}`}>Save packs</button>
            <button onClick={reset} className={`px-4 py-2 rounded-xl text-sm font-bold ${ui.soft}`}>Use my collection</button>
            <button onClick={refreshCards} className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${ui.soft}`}><RefreshCw size={14} /> Refresh card database</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- deck editor ------------------------------------------------------------------------------------------
function DeckEditor({ id, ui, toast, go }) {
  const [deck, setDeck] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [cards, setCards] = useState(null);
  const [tab, setTab] = useState('deck');
  const [preview, setPreview] = useState(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    api(`/api/decks/deck/${id}`).then((d) => {
      setDeck(d.deck); setAnalysis(d.analysis);
      return api(`/api/decks/${d.deck.game}/cards`);
    }).then(setCards).catch((err) => toast(err.message, 'error'));
  }, [id, toast]);

  const save = useCallback((next) => {
    setDeck(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { const d = await api(`/api/decks/deck/${id}`, { method: 'PUT', body: { name: next.name, heroes: next.heroes, slots: next.slots, notes: next.notes } }); setAnalysis(d.analysis); }
      catch (err) { toast(err.message, 'error'); }
    }, 500);
  }, [id, toast]);

  const byCode = useMemo(() => Object.fromEntries((cards?.cards || []).map((c) => [c.code, c])), [cards]);
  if (!deck || !cards) return <div className={`text-center py-16 ${ui.muted}`}>Loading deck and cards...</div>;

  const readOnly = deck.mine === false;
  const qtyOf = (c) => (isLead(c) ? deck.heroes[c.code] : deck.slots[c.code]) || 0;
  const copyToMine = async () => { try { const d = await api(`/api/decks/deck/${id}/duplicate`, { method: 'POST' }); toast('Copied to your decks.'); go(`/campaigns/${deck?.game || 'lotr'}/decks/${d.deck.id}`); } catch (err) { toast(err.message, 'error'); } };
  const change = (c, delta) => {
    if (readOnly) return;
    const box = isLead(c) ? 'heroes' : 'slots';
    const cur = deck[box][c.code] || 0;
    const max = isLead(c) ? 1 : c.deckLimit ?? 3;
    const nextQty = Math.max(0, Math.min(max, cur + delta));
    if (nextQty === cur) return;
    save({ ...deck, [box]: { ...deck[box], [c.code]: nextQty } });
  };
  const setAll = (d, a) => { setDeck(d); setAnalysis(a); };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => go(`/campaigns/${deck?.game || 'lotr'}/decks`)} className={`px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1 ${ui.soft}`}><ChevronLeft size={15} /> Decks</button>
        <input className={`${ui.field} !w-auto flex-1 min-w-[12rem] font-bold text-base`} value={deck.name} readOnly={readOnly} onChange={(e) => save({ ...deck, name: e.target.value })} />
        {analysis && (
          <span className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${analysis.valid ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500'}`}>
            {analysis.valid ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}{analysis.total} cards{arkham(analysis.game) ? '' : ` · threat ${analysis.startingThreat}`}
          </span>
        )}
      </div>
      {deck.sourceUrl && (
        <div className={`-mt-3 flex items-center gap-2 text-xs ${ui.muted} min-w-0`}>
          <a href={deck.sourceUrl} target="_blank" rel="noreferrer" className="underline truncate">{deck.sourceUrl}</a>
          <button onClick={() => navigator.clipboard.writeText(deck.sourceUrl).then(() => toast('Link copied.'), () => toast('Could not copy - select the link instead.', 'error'))}
            title="Copy the RingsDB link" className={`p-1 rounded-md shrink-0 ${ui.soft}`}><ClipboardCopy size={13} /></button>
        </div>
      )}

      {readOnly && (
        <div className={`rounded-xl border p-3 flex flex-wrap items-center gap-3 text-sm ${ui.row}`}>
          <Eye size={16} className="text-sky-500" />
          <span className="flex-1 min-w-[12rem]"><b>{deck.ownerName}'s deck.</b> <span className={ui.muted}>You can look through it, test it and run AI insights. Copy it to your decks to change it.</span></span>
          <button onClick={copyToMine} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${ui.primary}`}><Copy size={13} /> Copy to my decks</button>
        </div>
      )}

      {/* one column: the deck and its tabs, then the card browser for adding cards */}
      <div className="flex flex-col gap-5">
        <div className={ui.panel}>
          <div className={`flex gap-4 border-b mb-4 text-sm overflow-x-auto ${ui.isDark ? 'border-white/10' : 'border-slate-200'}`}>
            {[['deck', 'Deck', Layers], ['ask', 'Ask', MessageCircleQuestion], ['stats', 'Stats', BarChart3], ['test', 'Test', FlaskConical], ['ai', 'AI insights', Sparkles], ['export', 'Export and sync', Download]].map(([k, label, Icon]) => (
              <button key={k} onClick={() => setTab(k)} className={`pb-2 -mb-px border-b-2 flex items-center gap-1.5 whitespace-nowrap ${tab === k ? 'border-emerald-500 text-emerald-500 font-bold' : `border-transparent ${ui.muted}`}`}><Icon size={14} />{label}</button>
            ))}
          </div>
          {tab === 'deck' && <DeckTab ui={ui} deck={deck} analysis={analysis} change={readOnly ? null : change} onPreview={setPreview} save={save} readOnly={readOnly} />}
          {tab === 'ask' && <AskTab ui={ui} deck={deck} id={id} toast={toast} setAll={setAll} byCode={byCode} onPreview={setPreview} />}
          {tab === 'stats' && <StatsTab ui={ui} analysis={analysis} />}
          {tab === 'test' && <TestTab ui={ui} id={id} toast={toast} />}
          {tab === 'ai' && <AiTab ui={ui} deck={deck} id={id} toast={toast} setAll={setAll} byCode={byCode} onPreview={setPreview} />}
          {tab === 'export' && <ExportTab ui={ui} deck={deck} id={id} toast={toast} go={go} setAll={setAll} copyToMine={copyToMine} />}
        </div>
        {!readOnly && <CardBrowser ui={ui} cards={cards} qtyOf={qtyOf} change={change} onPreview={setPreview} heroSpheres={analysis?.heroSpheres || []} />}
      </div>
      {preview && <CardPreview ui={ui} card={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

function CardBrowser({ ui, cards, qtyOf, change, onPreview, heroSpheres }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [sphere, setSphere] = useState('');
  const [ownedOnly, setOwnedOnly] = useState(true);
  const [deckSpheres, setDeckSpheres] = useState(false);
  const owned = cards.owned.packs;
  const inDecks = cards.inDecks || {};
  const ownedQty = (c) => Math.max(c.packs.reduce((n, p) => n + (owned[p.code] || 0) * (p.qty || 0), 0), inDecks[c.code] || 0);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return cards.cards.filter((c) => (!type || c.type === type) && (!sphere || c.sphere === sphere)
      && (!deckSpheres || isLead(c) || ['neutral', 'baggins', 'fellowship'].includes(c.sphere) || heroSpheres.includes(c.sphere))
      && (!ownedOnly || ownedQty(c) > 0)
      && (!s || c.name.toLowerCase().includes(s) || c.traits.toLowerCase().includes(s) || c.text.toLowerCase().includes(s)))
      .sort((a, b) => typeRank(a) - typeRank(b) || a.name.localeCompare(b.name)).slice(0, 300);
  }, [cards, q, type, sphere, ownedOnly, deckSpheres, heroSpheres]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={ui.panel}>
      <h2 className="text-xs font-black uppercase tracking-wider mb-3 flex items-center gap-2"><Plus size={14} className="opacity-60" /> Add cards</h2>
      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
        <input className={`${ui.field} pl-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, traits and card text..." />
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        <select className={`${ui.field} !w-auto !py-1.5 text-xs`} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>{TYPES.map((t) => <option key={t} value={t}>{t.replace(/-/g, ' ')}</option>)}
        </select>
        <select className={`${ui.field} !w-auto !py-1.5 text-xs`} value={sphere} onChange={(e) => setSphere(e.target.value)}>
          <option value="">All {arkham(cards?.game) ? 'classes' : 'spheres'}</option>{[...new Set((cards?.cards || []).map((c) => c.sphere).filter(Boolean))].sort().map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs font-semibold"><input type="checkbox" checked={ownedOnly} onChange={(e) => setOwnedOnly(e.target.checked)} /> Cards I own</label>
        <label className="flex items-center gap-1.5 text-xs font-semibold"><input type="checkbox" checked={deckSpheres} onChange={(e) => setDeckSpheres(e.target.checked)} /> My heroes' spheres</label>
      </div>
      <div className={`text-[11px] mb-2 ${ui.muted}`}>{list.length === 300 ? 'First 300 matches' : `${list.length} cards`}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5 max-h-[70vh] overflow-y-auto pr-1">
        {list.map((c) => {
          const n = qtyOf(c), own = ownedQty(c);
          return (
            <div key={c.code} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border ${ui.row}`}>
              <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: SPHERE[c.sphere] || '#64748b' }} />
              <button onClick={() => onPreview(c)} className="flex-1 min-w-0 text-left">
                <div className="text-[13px] font-semibold truncate">{c.unique ? '• ' : ''}{c.name}</div>
                <div className={`text-[11px] truncate ${ui.muted}`}>{c.typeName}{c.cost !== null ? ` · cost ${c.cost}` : ''}{c.threat !== null ? ` · threat ${c.threat}` : ''} · {c.packName}{own ? ` · own ${own}` : ' · not owned'}</div>
              </button>
              <button onClick={() => change(c, -1)} disabled={!n} className={`p-1.5 rounded-lg disabled:opacity-20 ${ui.soft}`}><Minus size={13} /></button>
              <span className={`w-5 text-center text-sm font-black ${n ? 'text-emerald-500' : 'opacity-30'}`}>{n}</span>
              <button onClick={() => change(c, 1)} className={`p-1.5 rounded-lg ${ui.soft}`}><Plus size={13} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardLine({ ui, c, change, onPreview }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SPHERE[c.sphere] || '#64748b' }} />
      <button onClick={() => onPreview(c)} className="flex-1 min-w-0 text-left text-[13px] truncate">
        <b>{c.qty}×</b> <CardHover card={c}>{c.name}</CardHover>{c.cost !== null && c.cost !== undefined ? <span className={ui.muted}> ({c.cost})</span> : null}
        {c.notInSets && <span className={`text-[11px] ${ui.muted}`} title="You own it - it's just not from a pack in your listed sets"> · not in listed sets</span>}
      </button>
      {change && <>
        <button onClick={() => change(c, -1)} className={`p-1 rounded ${ui.soft}`}><Minus size={12} /></button>
        <button onClick={() => change(c, 1)} className={`p-1 rounded ${ui.soft}`}><Plus size={12} /></button>
      </>}
    </div>
  );
}

function DeckTab({ ui, deck, analysis, change, onPreview, save, readOnly }) {
  if (!analysis) return null;
  const groups = {};
  for (const c of analysis.cards) (groups[c.typeName || c.type] ||= []).push(c);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs font-black uppercase tracking-wider mb-2">{arkham(analysis.game) ? 'Investigator' : `Heroes (${analysis.heroCount}) · starting threat ${analysis.startingThreat}`}</div>
        {analysis.heroes.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {analysis.heroes.map((h) => (
              <div key={h.code} className="rounded-xl p-3 text-white relative" style={{ background: SPHERE[h.sphere] || '#64748b' }}>
                <button onClick={() => onPreview(h)} className="text-left w-full">
                  <div className="font-black text-sm"><CardHover card={h}>{h.name}</CardHover></div>
                  <div className="text-[11px] opacity-90">{h.sphereName} · {arkham(analysis.game) ? `${h.subname ? `${h.subname} · ` : ''}health ${h.health} · sanity ${h.sanity}` : `threat ${h.threat}`}</div>
                  <div className="text-[11px] opacity-90">{h.willpower} WP · {h.attack} ATK · {h.defense} DEF · {h.health} HP</div>
                </button>
                {!readOnly && <button onClick={() => change(h, -1)} className="absolute top-2 right-2 opacity-80 hover:opacity-100"><X size={14} /></button>}
              </div>
            ))}
          </div>
        ) : <p className={`text-sm ${ui.muted}`}>Add up to three heroes from the card list (filter by type: hero).</p>}
      </div>
      {(analysis.problems.length > 0 || analysis.warnings.length > 0) && (
        <div className="flex flex-col gap-1.5">
          {analysis.problems.map((p) => <div key={p} className="text-xs flex gap-2 text-red-500"><AlertTriangle size={14} className="shrink-0" />{p}</div>)}
          {analysis.warnings.map((w) => <div key={w} className="text-xs flex gap-2 text-amber-500"><AlertTriangle size={14} className="shrink-0" />{w}</div>)}
        </div>
      )}
      {(analysis.notes || []).map((n) => <div key={n} className={`text-[11px] ${ui.muted}`}>{n}</div>)}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
        {Object.entries(groups).map(([t, list]) => (
          <div key={t}>
            <div className="text-xs font-black uppercase tracking-wider mb-1">{t} ({list.reduce((n, c) => n + c.qty, 0)})</div>
            {list.map((c) => <CardLine key={c.code} ui={ui} c={c} change={change} onPreview={onPreview} />)}
          </div>
        ))}
      </div>
      <div>
        <div className="text-xs font-black uppercase tracking-wider mb-1">Notes</div>
        <textarea className={ui.field} rows={3} value={deck.notes || ''} readOnly={readOnly} onChange={(e) => save({ ...deck, notes: e.target.value })} placeholder="Strategy, quests it's for, changes you're thinking about..." />
      </div>
    </div>
  );
}

// Ask about the deck: questions and answers are kept on the deck, answered in the background.
const VERDICT = { works: ['Works', 'bg-emerald-500/15 text-emerald-500'], possible: ['Possible', 'bg-sky-500/15 text-sky-500'], 'wont-work': ["Won't work", 'bg-red-500/15 text-red-500'] };
function AskTab({ ui, deck, id, toast, setAll, byCode, onPreview }) {
  const [list, setList] = useState([]);
  const [text, setText] = useState('');
  const timer = useRef(null);
  const load = useCallback(async () => {
    try {
      const d = await api(`/api/decks/deck/${id}/questions`);
      setList(d.questions);
      clearTimeout(timer.current);
      if (d.questions.some((q) => q.status === 'running')) timer.current = setTimeout(load, 3000);
    } catch (err) { toast(err.message, 'error'); }
  }, [id, toast]);
  useEffect(() => { load(); return () => clearTimeout(timer.current); }, [load]);
  const ask = async (q = text) => {
    if (!q.trim()) return;
    try { await api(`/api/decks/deck/${id}/questions`, { method: 'POST', body: { question: q } }); setText(''); load(); } catch (err) { toast(err.message, 'error'); }
  };
  const remove = async (qid) => { try { await api(`/api/decks/deck/${id}/questions/${qid}`, { method: 'DELETE' }); load(); } catch (err) { toast(err.message, 'error'); } };
  const add = async (c) => {
    try { const d = await api(`/api/decks/deck/${id}/add-card`, { method: 'POST', body: { code: c.code, qty: c.qty } }); setAll(d.deck, d.analysis); toast(`Added ${c.qty}x ${c.name}.`); } catch (err) { toast(err.message, 'error'); }
  };
  const examples = ['Are there any other cards with the same traits as my heroes that I could add?', 'What is the weakest card in this deck and what could replace it?', 'How do I deal with enemies that attack for 5 or more?', 'Which cards should I mulligan for?'];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 items-end">
        <textarea className={ui.field} rows={2} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
          placeholder={`Ask anything about ${deck.name} - e.g. "are there any other Ent cards I could add?"`} />
        <button onClick={() => ask()} disabled={!text.trim()} className={`px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2 shrink-0 disabled:opacity-40 ${ui.primary}`}><Send size={15} /> Ask</button>
      </div>
      {!list.length && (
        <div className="flex flex-wrap gap-2">
          {examples.map((q) => <button key={q} onClick={() => ask(q)} className={`px-3 py-1.5 rounded-lg text-xs text-left ${ui.soft}`}>{q}</button>)}
        </div>
      )}
      <p className={`text-[11px] ${ui.muted}`}>Answers look through the whole card pool for cards matching your question, and check each one against this deck's heroes - which spheres it can pay for - and what you own. Everyone who can see the deck sees the questions.</p>
      {list.map((q) => (
        <div key={q.id} className={`rounded-xl border p-4 ${ui.row}`}>
          <div className="flex items-start gap-2">
            <MessageCircleQuestion size={16} className="text-emerald-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{q.question}</div>
              <div className={`text-[11px] ${ui.muted}`}>{q.askedByName} · {new Date(q.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            </div>
            <button onClick={() => remove(q.id)} title="Remove" className={`p-1 rounded ${ui.soft}`}><X size={13} /></button>
          </div>
          {q.status === 'running' && <p className={`text-sm mt-3 ${ui.muted}`}>Thinking...</p>}
          {q.status === 'error' && <p className="text-sm mt-3 text-red-500">{q.error} <button onClick={() => ask(q.question)} className="underline font-bold">Ask again</button></p>}
          {q.answer && (
            <div className="mt-3">
              <p className="text-sm whitespace-pre-line">{q.answer.answer}</p>
              {(q.answer.cards || []).length > 0 && (
                <div className="flex flex-col gap-2 mt-3">
                  {['works', 'possible', 'wont-work'].flatMap((v) => q.answer.cards.filter((c) => c.verdict === v)).map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase shrink-0 mt-0.5 ${VERDICT[c.verdict]?.[1]}`}>{VERDICT[c.verdict]?.[0]}</span>
                      <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: SPHERE[c.sphere] || '#64748b' }} />
                      <div className="flex-1 min-w-0">
                        <button onClick={() => byCode[c.code] && onPreview(byCode[c.code])} className="font-semibold underline decoration-dotted">{c.name}</button>
                        <span className={`text-[11px] ${ui.muted}`}>{c.owned ? ` · you own ${c.owned}` : ' · not in your listed sets'}</span>
                        <div className={`text-xs ${ui.muted}`}>{c.reason}</div>
                      </div>
                      {deck.mine !== false && c.verdict !== 'wont-work' && !isLead(byCode[c.code]) && (
                        <button onClick={() => add(c)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 flex items-center gap-1 ${ui.soft}`}><Plus size={12} /> Add {c.qty}</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Bar({ label, value, max, color }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 truncate capitalize">{label}</span>
      <div className="flex-1 h-4 rounded bg-slate-500/10 overflow-hidden"><div className="h-full rounded" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: color }} /></div>
      <span className="w-8 text-right font-bold">{value}</span>
    </div>
  );
}

function StatsTab({ ui, analysis }) {
  if (!analysis) return null;
  const maxCurve = Math.max(1, ...analysis.curve);
  const sph = Object.entries(analysis.bySphere), maxS = Math.max(1, ...sph.map(([, n]) => n));
  const typ = Object.entries(analysis.byType), maxT = Math.max(1, ...typ.map(([, n]) => n));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div>
        <div className="text-xs font-black uppercase tracking-wider mb-2">Cost curve · average {analysis.averageCost}</div>
        <div className="flex items-end gap-2 h-32">
          {analysis.curve.map((n, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
              <span className="text-[11px] font-bold">{n}</span>
              <div className="w-full rounded-t bg-emerald-500" style={{ height: `${(n / maxCurve) * 85}%` }} />
              <span className={`text-[11px] ${ui.muted}`}>{i === 5 ? '5+' : i}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-xs font-black uppercase tracking-wider mb-1">Spheres</div>
        {sph.map(([s, n]) => <Bar key={s} label={s} value={n} max={maxS} color={SPHERE[s] || '#64748b'} />)}
        <div className="text-xs font-black uppercase tracking-wider mt-3 mb-1">Card types</div>
        {typ.map(([t, n]) => <Bar key={t} label={t} value={n} max={maxT} color="#14b8a6" />)}
      </div>
      <div className="sm:col-span-2">
        <div className="text-xs font-black uppercase tracking-wider mb-2">Most common traits</div>
        <div className="flex flex-wrap gap-1.5">{analysis.traits.map(([t, n]) => <span key={t} className={`px-2 py-1 rounded-lg text-xs ${ui.soft}`}>{t} <b>{n}</b></span>)}</div>
      </div>
    </div>
  );
}

function TestTab({ ui, id, toast }) {
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { setTest((await api(`/api/decks/deck/${id}/test`, { method: 'POST', body: { games: 3000 } })).test); } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={run} disabled={busy} className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${ui.primary} disabled:opacity-50`}><FlaskConical size={15} />{busy ? 'Testing...' : test ? 'Test again' : 'Test this deck'}</button>
        <span className={`text-xs ${ui.muted}`}>Deals 3,000 opening hands and plays six rounds of each, plus the exact odds of drawing every card.</span>
      </div>
      {test && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[['Keepable opening hand', pct(test.openingHand.keepable)], ['Mulligan rate', pct(test.openingHand.mulliganRate)], ['First ally, round', test.averageFirstAllyRound], ['No ally by round 3', pct(test.noAllyByRound3)],
              ['Stuck with off-sphere cards', pct(test.stuckWithOffSphereCards)], ['Dead cards in hand (avg)', test.averageDeadCardsInHand]].map(([k, v]) => (
              <div key={k} className={`rounded-xl p-3 ${ui.soft}`}><div className="text-lg font-black">{v}</div><div className={`text-[11px] ${ui.muted}`}>{k}</div></div>
            ))}
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-wider mb-2">By round (average)</div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {test.perRound.map((r) => (
                <div key={r.round} className={`rounded-xl p-2 text-center ${ui.soft}`}>
                  <div className={`text-[11px] ${ui.muted}`}>Round {r.round}</div>
                  <div className="font-black">{r.cardsPlayed}</div><div className={`text-[10px] ${ui.muted}`}>cards out</div>
                  <div className="text-xs font-bold mt-1">{r.resourcesUnspent}</div><div className={`text-[10px] ${ui.muted}`}>unspent</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-wider mb-2">Chance of drawing each card</div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead><tr className={ui.muted}><th className="text-left py-1">Card</th><th>Copies</th><th>Opening hand</th><th>By round 3</th><th>By round 5</th></tr></thead>
                <tbody>{test.odds.map((o) => <tr key={o.name} className="border-t border-slate-500/10"><td className="py-1">{o.name}</td><td className="text-center">{o.qty}</td><td className="text-center">{pct(o.opening)}</td><td className="text-center">{pct(o.round3)}</td><td className="text-center">{pct(o.round5)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
          <p className={`text-[11px] ${ui.muted}`}>{test.assumptions}</p>
        </>
      )}
    </div>
  );
}

const ROLE = {
  engine: ['Engine', 'bg-violet-500/15 text-violet-500'], core: ['Core', 'bg-emerald-500/15 text-emerald-500'], support: ['Support', 'bg-sky-500/15 text-sky-500'],
  flex: ['Flex', 'bg-slate-500/15 text-slate-500'], weak: ['Weak here', 'bg-amber-500/15 text-amber-500'],
};
const STRENGTH = { core: 'bg-violet-500/15 text-violet-500', strong: 'bg-emerald-500/15 text-emerald-500', minor: 'bg-slate-500/15 text-slate-500' };
const IMPACT = { high: 'bg-emerald-500/15 text-emerald-500', medium: 'bg-sky-500/15 text-sky-500', low: 'bg-slate-500/15 text-slate-500' };
const Chip = ({ cls, children }) => <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide shrink-0 ${cls}`}>{children}</span>;

// What the insights focus on and which quest they're tuned for. Everything is on by default.
function InsightSettings({ ui, game, deckId, value, onChange }) {
  const [opts, setOpts] = useState(null);
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const [decks, setDecks] = useState([]);
  useEffect(() => { api(`/api/decks/${game}/decks`).then((d) => setDecks(d.decks.filter((x) => String(x.id) !== String(deckId)))).catch(() => {}); }, [game, deckId]);
  useEffect(() => { api(`/api/decks/${game}/insight-options`).then(setOpts).catch(() => setOpts({ topics: [], scenarios: [] })); }, [game]);
  useEffect(() => { if (opts && value.topics === null) onChange({ ...value, topics: opts.topics.map((t) => t.key) }); }, [opts]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!opts) return <div className={`text-xs ${ui.muted}`}>Loading focus options and scenarios...</div>;
  const topics = value.topics || [];
  const toggle = (k) => onChange({ ...value, topics: topics.includes(k) ? topics.filter((x) => x !== k) : [...topics, k] });
  const scen = opts.scenarios.find((x) => x.id === Number(value.scenarioId));
  const s = q.trim().toLowerCase();
  const list = opts.scenarios.filter((x) => (!mine || x.owned) && (!s || x.name.toLowerCase().includes(s) || x.pack.toLowerCase().includes(s)));
  const groups = [];
  for (const x of list) {
    const label = x.community ? `Community (ALeP): ${x.pack.replace(/^ALeP - /, '')}` : x.pack;
    if (!groups.length || groups[groups.length - 1][0] !== label) groups.push([label, []]);
    groups[groups.length - 1][1].push(x);
  }
  const mix = scen?.difficulties[value.difficulty] || scen?.difficulties.normal;
  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-3 ${ui.row}`}>
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-black uppercase tracking-wider flex-1">Focus on ({topics.length}/{opts.topics.length})</span>
          <button onClick={() => onChange({ ...value, topics: opts.topics.map((t) => t.key) })} className={`px-2 py-1 rounded-lg text-[11px] font-bold ${ui.soft}`}>Select all</button>
          <button onClick={() => onChange({ ...value, topics: [] })} className={`px-2 py-1 rounded-lg text-[11px] font-bold ${ui.soft}`}>Clear all</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
          {opts.topics.map((t) => (
            <label key={t.key} className="flex items-start gap-2 text-xs cursor-pointer" title={t.hint}>
              <input type="checkbox" className="mt-0.5" checked={topics.includes(t.key)} onChange={() => toggle(t.key)} />
              <span><b className="font-semibold">{t.label}</b> <span className={ui.muted}>- {t.hint}</span></span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <div className="text-xs font-black uppercase tracking-wider mb-2">Scenario you're playing</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input className={`${ui.field} !py-1.5 text-xs sm:!w-48`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search quests or packs..." />
          <select className={`${ui.field} !py-1.5 text-xs`} value={value.scenarioId || ''} onChange={(e) => onChange({ ...value, scenarioId: e.target.value ? Number(e.target.value) : null, difficulty: 'normal' })}>
            <option value="">Any scenario - general advice</option>
            {groups.map(([label, xs]) => (
              <optgroup key={label} label={label}>
                {xs.map((x) => <option key={x.id} value={x.id}>{x.name}{x.owned ? ' ✓' : ''}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-xs">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only quests from my packs (✓)</label>
          {scen && (
            <label className="flex items-center gap-1.5">Difficulty
              <select className={`${ui.field} !w-auto !py-1 text-xs`} value={value.difficulty} onChange={(e) => onChange({ ...value, difficulty: e.target.value })}>
                {['easy', 'normal', 'nightmare'].filter((d) => scen.difficulties[d]).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5">Playing
            <select className={`${ui.field} !w-auto !py-1 text-xs`} value={value.players} onChange={(e) => onChange({ ...value, players: Number(e.target.value), partnerDeckId: Number(e.target.value) === 2 ? value.partnerDeckId : null })}>
              <option value={1}>solo</option><option value={2}>two-handed</option>
            </select>
          </label>
          {value.players === 2 && (
            <label className="flex items-center gap-1.5">alongside
              <select className={`${ui.field} !w-auto !py-1 text-xs`} value={value.partnerDeckId || ''} onChange={(e) => onChange({ ...value, partnerDeckId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">any second deck</option>
                {decks.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.mine ? 'yours' : d.ownerName})</option>)}
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={value.campaign} onChange={(e) => onChange({ ...value, campaign: e.target.checked })} /> Campaign mode</label>
        </div>
        {scen && (
          <div className={`text-[11px] mt-2 ${ui.muted}`}>
            {scen.pack} · encounter sets: {scen.encounterSets.join(', ')}
            {mix ? ` · ${mix.cards} cards: ${mix.enemies} enemies, ${mix.locations} locations, ${mix.treacheries} treacheries, ${mix.shadows} shadows` : ''}
          </div>
        )}
      </div>
    </div>
  );
}

const Dots = ({ n }) => <span className="flex gap-0.5 shrink-0">{[1, 2, 3, 4, 5].map((i) => <span key={i} className={`w-2 h-2 rounded-full ${i <= n ? (n >= 4 ? 'bg-emerald-500' : n === 3 ? 'bg-sky-500' : 'bg-amber-500') : 'bg-slate-500/20'}`} />)}</span>;

function AiTab({ ui, deck, id, toast, setAll, byCode, onPreview }) {
  const [busy, setBusy] = useState(false);
  const ins = deck.insights;
  const [settings, setSettings] = useState(() => ({ topics: null, scenarioId: null, difficulty: 'normal', players: 1, campaign: false, ...(ins?.settings || {}) }));
  const [elapsed, setElapsed] = useState(0);
  const [lastError, setLastError] = useState(null);
  // Insights run as a background job on the server (they take 30-60 s); this checks back every 3 s.
  const watch = useCallback(async () => {
    setBusy(true);
    try {
      for (;;) {
        const { job } = await api(`/api/decks/deck/${id}/insights/status`);
        setElapsed(job.seconds || 0);
        if (job.status === 'done') { const full = await api(`/api/decks/deck/${id}`); setAll(full.deck, full.analysis); setLastError(null); toast('Insights ready.'); break; }
        if (job.status === 'error') { setLastError(job.error); toast('The insights run failed - see the message below.', 'error'); break; }
        if (job.status !== 'running') break;
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (err) { setLastError(err.message); } finally { setBusy(false); }
  }, [id, setAll, toast]);
  // Pick up a run that's still going (e.g. after a page reload).
  useEffect(() => { api(`/api/decks/deck/${id}/insights/status`).then(({ job }) => { if (job.status === 'running') watch(); }).catch(() => {}); }, [id, watch]);
  const run = async () => {
    if (settings.topics && !settings.topics.length) { toast('Tick at least one thing to focus on.', 'error'); return; }
    setLastError(null); setElapsed(0);
    try { await api(`/api/decks/deck/${id}/insights`, { method: 'POST', body: settings }); watch(); }
    catch (err) { setLastError(err.message); toast(err.message, 'error'); }
  };
  const apply = async (i, list) => {
    try { const d = await api(`/api/decks/deck/${id}/insights/apply/${i}${list === 'consider' ? '?list=consider' : ''}`, { method: 'POST' }); setAll(d.deck, d.analysis); toast('Change made to the deck.'); }
    catch (err) { toast(err.message, 'error'); }
  };
  const cardLink = (x, i) => {
    const c = x.code && byCode[x.code];
    return (
      <button key={i} onClick={() => c && onPreview(c)} className="underline decoration-dotted">
        {x.qty ? `${x.qty}× ` : ''}{x.name}{x.known === false ? ' (unknown card)' : ''}
        {x.known && x.inYourSets === false && <span className={`no-underline text-[11px] ${ui.muted}`} title="Not from a pack in your listed sets"> ◦</span>}
      </button>
    );
  };
  const names = (list) => (list || []).map(cardLink).reduce((acc, el, i) => (i ? [...acc, ', ', el] : [el]), []);
  const section = 'text-xs font-black uppercase tracking-wider mb-2';

  return (
    <div className="flex flex-col gap-5">
      <InsightSettings ui={ui} game={deck.game} deckId={id} value={settings} onChange={setSettings} />
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={run} disabled={busy} className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${ui.primary} disabled:opacity-50`}><Sparkles size={15} />{busy ? `Thinking... ${elapsed}s (usually 30-60)` : ins ? 'Refresh insights' : 'Get AI insights'}</button>
        {deck.insightsAt && <span className={`text-[11px] ${ui.muted}`}>Last run {new Date(deck.insightsAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
      </div>
      {(lastError || (!busy && deck.insightsError && (!deck.insightsAt || deck.insightsError.at > deck.insightsAt))) && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500 flex gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>The last insights run failed{deck.insightsError?.runBy && !lastError ? ` (run by ${deck.insightsError.runBy})` : ''}: {lastError || deck.insightsError.message} <button onClick={run} className="underline font-bold">Try again</button></div>
        </div>
      )}
      {!ins ? (
        <p className={`text-sm ${ui.muted}`}>Gemini reads every card in the deck, the test results, your collection and the wider card pool, then rates each card's role, explains the synergies, and suggests swaps and new cards - each with what it replaces and why. Any suggestion can be applied in one tap.</p>
      ) : (
        <>
          <div className={`rounded-xl p-4 ${ui.soft}`}>
            <div className="text-xs font-black uppercase tracking-wider text-emerald-500">{ins.archetype}</div>
            <p className="text-sm mt-1">{ins.summary}</p>
            {ins.settings && <p className={`text-[11px] mt-2 ${ui.muted}`}>Focused on {ins.settings.topics.length} area{ins.settings.topics.length === 1 ? '' : 's'}{ins.settings.scenarioName ? ` · tuned for ${ins.settings.scenarioName} (${ins.settings.difficulty})` : ''} · {ins.settings.players === 2 ? `two-handed${ins.settings.partnerName ? ` with ${ins.settings.partnerName}` : ''}` : 'solo'}{ins.settings.campaign ? ' · campaign' : ''}{ins.settings.runBy ? ` · run by ${ins.settings.runBy}` : ''}</p>}
          </div>

          {ins.partnership && (
            <div className={`rounded-xl border p-4 ${ui.row}`}>
              <div className={section}>Playing alongside {ins.settings?.partnerName}</div>
              <p className="text-sm">{ins.partnership.overview}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
                <List title="Clashes" items={ins.partnership.clashes} />
                <List title="How they cover each other" items={ins.partnership.coverage} />
                <List title="To fit the partner better" items={ins.partnership.suggestions} />
              </div>
            </div>
          )}

          {ins.scenario && (
            <div className={`rounded-xl border p-4 ${ui.row}`}>
              <div className={section}>Against {ins.settings?.scenarioName}</div>
              <p className="text-sm">{ins.scenario.overview}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                <List title="Key threats" items={ins.scenario.keyThreats} />
                <List title="Tips for this quest" items={ins.scenario.tips} />
                <List title="What the deck handles well" items={ins.scenario.handlesWell} />
                <List title="Where it struggles" items={ins.scenario.struggles} />
              </div>
              {ins.settings && !ins.settings.scenarioCardsLoaded && <p className={`text-[11px] mt-2 ${ui.muted}`}>The quest's encounter cards couldn't be loaded, so this is from general knowledge of the quest.</p>}
            </div>
          )}

          {(ins.focusAreas || []).length > 0 && (
            <div>
              <div className={section}>Focus areas</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ins.focusAreas.map((f, i) => (
                  <div key={i} className={`rounded-xl border p-3 ${ui.row}`}>
                    <div className="flex items-center gap-2"><b className="text-sm flex-1">{f.topic}</b><Dots n={f.rating} /></div>
                    <p className={`text-xs mt-1 ${ui.muted}`}>{f.assessment}</p>
                    <p className="text-xs mt-1"><span className="text-emerald-500 font-bold">Try:</span> {f.suggestion}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className={section}>Synergies</div>
            <div className="flex flex-col gap-2">
              {(ins.synergies || []).map((s, i) => (
                <div key={i} className={`rounded-xl border p-3 ${ui.row}`}>
                  <div className="flex items-start gap-2"><b className="text-sm flex-1">{s.cards.join(' + ')}</b>{s.strength && <Chip cls={STRENGTH[s.strength]}>{s.strength}</Chip>}</div>
                  <p className={`text-xs mt-1 ${ui.muted}`}>{s.explanation}</p>
                </div>
              ))}
            </div>
            {(ins.antiSynergies || []).length > 0 && (
              <>
                <div className={`${section} mt-4 text-amber-500`}>Working against each other</div>
                {ins.antiSynergies.map((s, i) => <div key={i} className="text-sm mb-2"><b>{s.cards.join(' + ')}</b> - <span className={ui.muted}>{s.explanation}</span></div>)}
              </>
            )}
          </div>

          <div>
            <div className={section}>Swaps with cards you have</div>
            <div className="flex flex-col gap-2">
              {(ins.improvements || []).map((m, i) => (
                <div key={i} className={`rounded-xl border p-3 ${ui.row}`}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 text-sm">
                      {m.add?.length > 0 && <div><span className="text-emerald-500 font-bold">In</span> {names(m.add)}</div>}
                      {m.cut?.length > 0 && <div><span className="text-red-500 font-bold">Out</span> {names(m.cut)}</div>}
                    </div>
                    {m.impact && <Chip cls={IMPACT[m.impact]}>{m.impact} impact</Chip>}
                  </div>
                  <p className={`text-xs mt-1 ${ui.muted}`}>{m.reason}</p>
                  {deck.mine !== false && <button onClick={() => apply(i)} disabled={m.applied} className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 ${ui.soft}`}><Wand2 size={13} />{m.applied ? 'Applied' : 'Make this swap'}</button>}
                </div>
              ))}
            </div>
          </div>

          {(ins.cardsToConsider || []).length > 0 && (
            <div>
              <div className={section}>Cards worth considering</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ins.cardsToConsider.map((x, i) => (
                  <div key={i} className={`rounded-xl border p-3 flex flex-col ${ui.row}`}>
                    <div className="text-sm font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SPHERE[x.sphere] || '#64748b' }} />{cardLink(x, 'n')}
                    </div>
                    {!x.inYourSets && <div className={`text-[11px] ${ui.muted}`}>Not from a pack in your listed sets</div>}
                    <p className={`text-xs mt-1 ${ui.muted}`}>{x.why}</p>
                    {x.replaces?.length > 0 && <div className="text-xs mt-1.5"><span className="text-red-500 font-bold">Replaces</span> {names(x.replaces)}</div>}
                    {x.worksWith?.length > 0 && <div className="text-xs mt-0.5"><span className="text-emerald-500 font-bold">Works with</span> {x.worksWith.join(', ')}</div>}
                    {deck.mine !== false && <button onClick={() => apply(i, 'consider')} disabled={x.applied} className={`mt-2 self-start px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 ${ui.soft}`}><Wand2 size={13} />{x.applied ? 'Added' : 'Add it in'}</button>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(ins.cardRoles || []).length > 0 && (
            <div>
              <div className={section}>How each card pulls its weight</div>
              <div className="flex flex-col gap-1">
                {['engine', 'core', 'support', 'flex', 'weak'].flatMap((role) => ins.cardRoles.filter((r) => r.role === role)).map((r, i) => (
                  <div key={i} className="flex items-start gap-2 py-1 border-b border-slate-500/10">
                    <Chip cls={ROLE[r.role]?.[1]}>{ROLE[r.role]?.[0] || r.role}</Chip>
                    <div className="text-sm min-w-0"><button onClick={() => r.code && byCode[r.code] && onPreview(byCode[r.code])} className="font-semibold">{r.qty ? `${r.qty}× ` : ''}{r.name}</button> <span className={`text-xs ${ui.muted}`}>{r.note}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <List title="Strengths" items={ins.strengths} />
            <List title="Weaknesses" items={ins.weaknesses} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><div className="text-xs font-black uppercase tracking-wider mb-1">Mulligan</div><p className="text-sm">{ins.mulligan}</p></div>
            <div><div className="text-xs font-black uppercase tracking-wider mb-1">Quests</div><p className="text-sm">{ins.questTypes}</p></div>
          </div>
          <List title="How to play it" items={ins.playTips} />
        </>
      )}
    </div>
  );
}

const List = ({ title, items }) => (
  <div><div className="text-xs font-black uppercase tracking-wider mb-1">{title}</div><ul className="list-disc pl-5 text-sm space-y-1">{(items || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
);

function ExportTab({ ui, deck, id, toast, go, setAll, copyToMine }) {
  const site = arkham(deck.game) ? 'ArkhamDB' : 'RingsDB';
  const [busy, setBusy] = useState(false);
  const base = `/api/decks/deck/${id}/export`;
  const copyText = async () => {
    try { const t = await (await fetch(`${base}.txt`)).text(); await navigator.clipboard.writeText(t); toast(`Deck list copied - paste it into ${site}'s deck import.`); } catch (err) { toast(err.message, 'error'); }
  };
  const pull = async (force = false) => {
    setBusy(true);
    try { const d = await api(`/api/decks/deck/${id}/sync`, { method: 'POST', body: { force } }); setAll(d.deck, d.analysis); toast(`Pulled the latest from ${deck.source}.`); }
    catch (err) {
      if (err.code === 'LOCAL_CHANGES' && window.confirm(`${err.message}\n\nPull anyway and replace the IMS version?`)) { setBusy(false); return pull(true); }
      toast(err.message, 'error');
    } finally { setBusy(false); }
  };
  const dup = async () => { try { const d = await api(`/api/decks/deck/${id}/duplicate`, { method: 'POST' }); go(`/campaigns/${deck.game || 'lotr'}/decks/${d.deck.id}`); } catch (err) { toast(err.message, 'error'); } };
  const del = async () => { if (!window.confirm(`Delete "${deck.name}"?`)) return; try { await api(`/api/decks/deck/${id}`, { method: 'DELETE' }); go(`/campaigns/${deck.game || 'lotr'}/decks`); } catch (err) { toast(err.message, 'error'); } };
  const btn = `px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 ${ui.soft}`;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-xs font-black uppercase tracking-wider mb-2">Download</div>
        <div className="flex flex-wrap gap-2">
          <a className={btn} href={`${base}.csv?download=1`}><FileText size={15} /> CSV</a>
          <a className={btn} href={`${base}.json?download=1`}><FileJson size={15} /> JSON</a>
          <a className={btn} href={`${base}.json`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View JSON</a>
          <a className={btn} href={`${base}.txt?download=1`}><FileText size={15} /> Text list</a>
        </div>
      </div>
      <div>
        <div className="text-xs font-black uppercase tracking-wider mb-2">{site}</div>
        {deck.sourceUrl ? (
          <p className={`text-xs mb-2 ${ui.muted}`}>Linked to <a className="underline" href={deck.sourceUrl} target="_blank" rel="noreferrer">{deck.sourceUrl}</a>{deck.syncedAt ? `, last pulled ${new Date(deck.syncedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}.</p>
        ) : <p className={`text-xs mb-2 ${ui.muted}`}>Built in IMS - not linked to {site}.</p>}
        <div className="flex flex-wrap gap-2">
          {deck.sourceUrl && deck.mine !== false && <button onClick={() => pull(false)} disabled={busy} className={btn}><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> Pull from RingsDB</button>}
          <button onClick={copyText} className={btn}><ClipboardCopy size={15} /> Copy for {site} import</button>
          <a className={btn} href={arkham(deck.game) ? 'https://arkhamdb.com/deck/import' : 'https://ringsdb.com/deck/import'} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open {site} import</a>
        </div>
        <p className={`text-[11px] mt-2 ${ui.muted}`}>{site} has no way for other apps to save decks, so changes go back by copying the list and pasting it into its import page.</p>
      </div>
      <div>
        <div className="text-xs font-black uppercase tracking-wider mb-2">Deck</div>
        <div className="flex flex-wrap gap-2">
          {deck.mine === false
            ? <button onClick={copyToMine} className={btn}><Copy size={15} /> Copy to my decks</button>
            : <>
              <button onClick={dup} className={btn}><Copy size={15} /> Duplicate</button>
              <button onClick={del} className={`${btn} text-red-500`}><Trash2 size={15} /> Delete</button>
            </>}
        </div>
      </div>
    </div>
  );
}

function CardPreview({ ui, card, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`max-w-2xl w-full rounded-2xl p-4 flex flex-col sm:flex-row gap-4 max-h-[90vh] overflow-y-auto ${ui.isDark ? 'bg-slate-900' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
        {card.image && <img src={card.image} alt={card.name} className="w-full sm:w-64 rounded-xl self-start" loading="lazy" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2"><h3 className="text-lg font-black flex-1">{card.unique ? '• ' : ''}{card.name}</h3><button onClick={onClose}><X size={18} /></button></div>
          <div className="text-xs font-bold mt-0.5" style={{ color: SPHERE[card.sphere] }}>{card.sphereName} {card.typeName}</div>
          <div className={`text-xs mt-1 ${ui.muted}`}>{[card.cost !== null && `Cost ${card.cost}`, card.threat !== null && `Threat ${card.threat}`, card.willpower !== null && `${card.willpower} WP · ${card.attack} ATK · ${card.defense} DEF · ${card.health} HP`].filter(Boolean).join(' · ')}</div>
          <div className="text-xs italic mt-2">{card.traits}</div>
          <p className="text-sm mt-2 whitespace-pre-line">{card.text}</p>
          <div className={`text-[11px] mt-3 ${ui.muted}`}>{card.packName}{card.url ? <> · <a className="underline" href={card.url} target="_blank" rel="noreferrer">RingsDB</a></> : null}</div>
        </div>
      </div>
    </div>
  );
}
