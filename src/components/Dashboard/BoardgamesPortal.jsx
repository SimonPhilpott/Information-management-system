import AccountChip from './AccountChip';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dices, ArrowLeft, RotateCw, Check, AlertCircle, Sun, Moon, ChevronRight, ChevronDown,
  Search, Save, ExternalLink, KeyRound, Plus, Trash2, Undo2, ClipboardList, X, Image, Star, Users, Clock, User
} from 'lucide-react';

// Decode numeric and named HTML entities (e.g. &#039;, &#39;, &apos;, &amp;, &quot;, &lt;, &gt;, &eacute;)
function decodeHtmlEntities(str) {
  if (typeof str !== 'string') return str || '';
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&eacute;/g, 'é')
    .replace(/&Eacute;/g, 'É')
    .replace(/&nbsp;/g, ' ');
}

// The "Want to sell" tick. A real toggle button rather than a bare checkbox so
// it's a large tap target and reads clearly next to the title.
function SellTick({ checked, onToggle, isDark, label = 'Want to sell' }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(!checked); }}
      title={checked ? `${label} - click to clear` : `Mark as ${label.toLowerCase()}`}
      className={`shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wide transition-all active:scale-95 ${
        checked
          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500'
          : isDark ? 'border-white/10 text-slate-500 hover:bg-white/5' : 'border-[#2E2B27]/15 text-slate-400 hover:bg-black/5'
      }`}
    >
      <span className={`w-4 h-4 rounded border flex items-center justify-center ${checked ? 'bg-emerald-500 border-emerald-500' : isDark ? 'border-slate-600' : 'border-slate-300'}`}>
        {checked && <Check size={11} className="text-white" strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
}

// Opens eBay UK filtered to sold listings for this game, located in the UK, most recent first.
// Only shown once a game is ticked "Want to sell".
const ebaySoldUrl = (name) => `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(decodeHtmlEntities(name))}&LH_Sold=1&LH_Complete=1&LH_PrefLoc=1&_sop=13`;
function EbaySold({ name, isDark }) {
  const clean = decodeHtmlEntities(name);
  return (
    <a href={ebaySoldUrl(clean)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
      title={`Recent sold listings for "${clean}" on eBay UK`}
      className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wide ${isDark ? 'border-white/10 text-sky-400 hover:bg-white/5' : 'border-[#2E2B27]/15 text-sky-600 hover:bg-black/5'}`}>
      <ExternalLink size={11} /> eBay sold
    </a>
  );
}

// Small bin button: removes a game or expansion from the collection (it can be restored).
function RemoveBtn({ name, onRemove }) {
  const clean = decodeHtmlEntities(name);
  return (
    <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Remove ${clean} from your collection? You can restore it from the Removed list.`)) onRemove(); }}
      title="Remove from collection" className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 shrink-0"><Trash2 size={13} /></button>
  );
}
const ManualTag = () => <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-sky-500/15 text-sky-500 align-middle">added by you</span>;

// Box art thumbnail with interactive larger hover popup preview
function ThumbnailHoverPreview({ src, alt = '', name = '', year = null, isDark, size = 'w-9 h-9' }) {
  const [hovered, setHovered] = useState(false);
  const hoverTimeoutRef = useRef(null);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHovered(true);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHovered(false);
    }, 120);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  if (!src) {
    return <div className={`${size} rounded shrink-0 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />;
  }

  const cleanName = decodeHtmlEntities(name);

  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center z-10"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <img
        src={src}
        alt={alt || cleanName}
        loading="lazy"
        className={`${size} rounded object-cover shrink-0 cursor-pointer shadow-sm hover:ring-2 hover:ring-lime-500/60 transition-all`}
      />

      {hovered && (
        <div
          className={`absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 pointer-events-none w-52 p-2 rounded-2xl shadow-2xl backdrop-blur-xl border transition-all duration-200 animate-in fade-in zoom-in-95 ${
            isDark ? 'bg-slate-950/95 border-white/15 text-slate-100 shadow-[0_20px_40px_rgba(0,0,0,0.8)]' : 'bg-white/95 border-slate-300 text-slate-900 shadow-2xl'
          }`}
          style={{ minWidth: '13rem', maxWidth: '15rem' }}
        >
          <div className="relative rounded-xl overflow-hidden mb-2 bg-black/40 aspect-[4/3] flex items-center justify-center border border-white/5">
            <img
              src={src}
              alt={cleanName}
              className="w-full h-full object-contain drop-shadow-md"
            />
          </div>
          {cleanName && (
            <div className="px-1 text-left">
              <div className="text-xs font-bold leading-tight line-clamp-2">
                {cleanName}
              </div>
              {year && (
                <div className={`text-[11px] font-semibold mt-0.5 ${isDark ? 'text-lime-400' : 'text-emerald-600'}`}>
                  Released: {year}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GameRow({ game, isDark, onSell, onFavourite, onToggleExpansion, defaultOpen, onDecks, onRemove }) {
  const [open, setOpen] = useState(defaultOpen);
  const detail = isDark ? 'text-slate-300' : 'text-slate-700';
  const time = game.minTime && game.maxTime && game.minTime !== game.maxTime ? `${game.minTime}-${game.maxTime} min` : game.playingTime ? `${game.playingTime} min` : null;
  const ownedCount = (game.expansions || []).filter((e) => e.owned).length;
  const hasExp = (game.expansions || []).length > 0;
  const muted = isDark ? 'text-slate-500' : 'text-slate-400';
  const gameName = decodeHtmlEntities(game.name);

  return (
    <div className={`rounded-xl border text-xs ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
      <div
        role="button" tabIndex={0}
        onClick={() => hasExp && setOpen(!open)}
        onKeyDown={(e) => { if (hasExp && (e.key === 'Enter' || e.key === ' ')) setOpen(!open); }}
        className={`px-3 py-2.5 flex items-center gap-3 ${hasExp ? 'cursor-pointer' : ''}`}
      >
        <span className="w-4 shrink-0 flex justify-center opacity-60">
          {hasExp ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
        </span>
        <ThumbnailHoverPreview
          src={game.thumbnail}
          alt={gameName}
          name={gameName}
          year={game.year}
          isDark={isDark}
          size="w-9 h-9"
        />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[13px] truncate">
            {gameName} {game.year ? <span className={`font-normal ${muted}`}>({game.year})</span> : null}{game.manual && <ManualTag />}
          </div>
          {(game.players || time || game.categories?.length) && (
            <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] ${detail}`}>
              {game.players && <span className="inline-flex items-center gap-1"><Users size={11} />{game.players} player{game.players === '1' ? '' : 's'}</span>}
              {time && <span className="inline-flex items-center gap-1"><Clock size={11} />{time}</span>}
              {game.solo && (
                <span
                  className={`inline-flex items-center gap-1 font-bold ${isDark ? 'text-sky-300' : 'text-sky-800'}`}
                  title={
                    game.minPlayers === 1 && game.maxPlayers === 1
                      ? '1 player only'
                      : game.minPlayers === 1
                      ? '1 player minimum'
                      : game.communityMinPlayers === 1
                      ? 'Community player count minimum: 1'
                      : 'Solo-capable (solo mode or mechanic)'
                  }
                >
                  <User size={11} />Solo
                </span>
              )}
              {(game.categories || []).filter((c) => c !== 'Print & Play').slice(0, 3).map((c) => <span key={c} className={`px-1.5 rounded ${isDark ? 'bg-white/10' : 'bg-slate-100'}`}>{c}</span>)}
            </div>
          )}
          {hasExp && (
            <div className={`text-[11px] ${muted}`}>
              {game.expansions.length} expansion{game.expansions.length === 1 ? '' : 's'} &middot;{' '}
              <span className={ownedCount ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : ''}>{ownedCount} owned</span>
            </div>
          )}
        </div>
        {game.deckGame && (
          <button onClick={(e) => { e.stopPropagation(); onDecks(game.deckGame); }} title="Build and test decks for this game"
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-gradient-to-r from-emerald-600 to-teal-700 text-white shrink-0">Campaign manager</button>
        )}
        <button onClick={(e) => { e.stopPropagation(); onFavourite(game.id, !game.favourite); }}
          title={game.favourite ? 'Remove from favourite games' : 'Add to favourite games'}
          className={`p-1 rounded transition-colors shrink-0 ${game.favourite ? 'text-amber-500' : `${muted} hover:text-amber-500`}`}>
          <Star size={15} fill={game.favourite ? 'currentColor' : 'none'} />
        </button>
        {game.wantToSell && <EbaySold name={gameName} isDark={isDark} />}
        <SellTick checked={game.wantToSell} isDark={isDark} onToggle={(v) => onSell(game.id, v)} />
        <RemoveBtn name={gameName} onRemove={() => onRemove(game.id)} />
      </div>

      {open && hasExp && (
        <div className={`px-3 pb-3 pt-1 border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
          {game.expansions.map((e) => {
            const expName = decodeHtmlEntities(e.name);
            return (
              <div key={e.id} className="flex items-center gap-2.5 py-1.5 pl-7">
                <button
                  onClick={(ev) => { ev.stopPropagation(); onToggleExpansion(e.id, !e.owned); }}
                  title={e.owned ? "Owned - click to mark as unowned" : "Not owned - click to add to your owned collection"}
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all ${
                    e.owned
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : isDark ? 'border-slate-600 hover:border-emerald-400' : 'border-slate-300 hover:border-emerald-600'
                  }`}
                >
                  {e.owned && <Check size={10} strokeWidth={3} />}
                </button>
                {e.thumbnail ? (
                  <ThumbnailHoverPreview
                    src={e.thumbnail}
                    alt={expName}
                    name={expName}
                    year={e.year}
                    isDark={isDark}
                    size="w-6 h-6"
                  />
                ) : (
                  <div className={`w-6 h-6 rounded shrink-0 ${isDark ? 'bg-slate-800/60' : 'bg-slate-200/80'}`} />
                )}
                <div className="min-w-0 flex-1 truncate">
                  <span className={e.owned ? (isDark ? 'text-emerald-400 font-semibold' : 'text-emerald-700 font-semibold') : muted}>
                    {expName}
                  </span>
                  {e.year ? <span className={`ml-1 font-normal ${muted}`}>({e.year})</span> : null}
                  {e.manual && <ManualTag />}
                  {!e.owned && <span className="ml-2 opacity-60 text-[10px] italic">click box to own</span>}
                </div>
                {e.owned && (
                  <span className="ml-auto flex items-center gap-1.5 shrink-0">
                    {e.wantToSell && <EbaySold name={expName} isDark={isDark} />}
                    <SellTick checked={e.wantToSell} isDark={isDark} onToggle={(v) => onSell(e.id, v)} />
                    <RemoveBtn name={expName} onRemove={() => onRemove(e.id)} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function BoardgamesPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';

  const [data, setData] = useState({ games: [], orphanExpansions: [], fetchedAt: null, updates: [] });
  const [config, setConfig] = useState({ username: 'Sideburnt', hasToken: false });
  const [status, setStatus] = useState({ state: 'idle' });
  const [backfillStatus, setBackfillStatus] = useState({ state: 'idle' });
  const [draftUser, setDraftUser] = useState('');
  const [draftToken, setDraftToken] = useState('');
  const [search, setSearch] = useState('');
  const [sellOnly, setSellOnly] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const [soloOnly, setSoloOnly] = useState(false);
  const [playerCount, setPlayerCount] = useState(0);   // 0 = any
  const [maxTime, setMaxTime] = useState(0);           // 0 = any, else minutes (999 = over 3 hours)
  const [gameTheme, setGameTheme] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [notification, setNotification] = useState(null);
  const pollRef = useRef(null);
  const wasRunning = useRef(false);

  // Updates list modal state
  const [showUpdates, setShowUpdates] = useState(false);
  const [updatesSearch, setUpdatesSearch] = useState('');

  // Add game modal states
  const [adding, setAdding] = useState(false);
  const [addMode, setAddMode] = useState('bgg'); // 'bgg' | 'manual'
  const [bggSearchQuery, setBggSearchQuery] = useState('');
  const [bggSearchResults, setBggSearchResults] = useState([]);
  const [isSearchingBgg, setIsSearchingBgg] = useState(false);
  const [selectedBggGame, setSelectedBggGame] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedExpansions, setSelectedExpansions] = useState(new Set());
  const [draftGame, setDraftGame] = useState({ name: '', year: '', type: 'base', parentId: '', bggLink: '' });
  const [showRemoved, setShowRemoved] = useState(false);

  const showToast = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification((prev) => (prev?.msg === msg ? null : prev)), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/boardgames');
      const d = await res.json();
      if (!d.success) throw new Error(d.error || 'Failed to load.');
      setData({ games: d.games, orphanExpansions: d.orphanExpansions, fetchedAt: d.fetchedAt, updates: d.updates || [], details: d.details || null });
      setConfig(d.config);
      setStatus(d.status);
      if (d.backfillStatus) setBackfillStatus(d.backfillStatus);
      setDraftUser((prev) => prev || d.config.username);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const running = status.state === 'running';
  const backfillRunning = backfillStatus.state === 'running';
  useEffect(() => {
    if (running || backfillRunning) {
      wasRunning.current = true;
      pollRef.current = setInterval(load, 3000);
      return () => clearInterval(pollRef.current);
    }
    if (wasRunning.current) { wasRunning.current = false; load(); }
  }, [running, backfillRunning, load]);

  const handleReturnHome = () => {
    window.history.pushState(null, '', '/ims');
    if (setCurrentPath) setCurrentPath('/ims');
    else window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const saveConfig = async () => {
    try {
      const res = await fetch('/api/boardgames/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: draftUser, token: draftToken })
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to save.');
      setConfig(d.config);
      setDraftToken('');
      showToast('BGG settings saved.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const refresh = async () => {
    try {
      const res = await fetch('/api/boardgames/refresh', { method: 'POST' });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to start refresh.');
      setStatus({ state: 'running', phase: 'Starting', done: 0, total: 0 });
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const syncBoxArt = async () => {
    try {
      const res = await fetch('/api/boardgames/backfill-thumbnails', { method: 'POST' });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to start box art sync.');
      setBackfillStatus({ state: 'running', phase: 'Fetching expansion box art', done: 0, total: d.total || 0 });
      showToast(`Started fetching box art for ${d.total} expansions.`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Search BGG live
  const searchBggLive = async (e) => {
    e?.preventDefault();
    const q = bggSearchQuery.trim();
    if (!q) return;
    setIsSearchingBgg(true);
    try {
      const res = await fetch(`/api/boardgames/search?query=${encodeURIComponent(q)}`);
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Search failed');
      setBggSearchResults(d.results || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSearchingBgg(false);
    }
  };

  // Pick a BGG game and load its expansions
  const selectBggResult = async (item) => {
    setLoadingDetails(true);
    try {
      const res = await fetch(`/api/boardgames/bgg-details/${item.id}`);
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to fetch details');
      setSelectedBggGame(d.details);
      setSelectedExpansions(new Set());
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoadingDetails(false);
    }
  };

  // Toggle expansion checkbox in add modal
  const toggleExpansionCheckbox = (expId) => {
    setSelectedExpansions((prev) => {
      const next = new Set(prev);
      if (next.has(expId)) next.delete(expId);
      else next.add(expId);
      return next;
    });
  };

  // Submit adding BGG game with selected expansions
  const saveBggGameWithExpansions = async () => {
    if (!selectedBggGame) return;
    try {
      const res = await fetch('/api/boardgames/add-with-expansions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bggId: selectedBggGame.id,
          name: selectedBggGame.name,
          year: selectedBggGame.year,
          thumbnail: selectedBggGame.thumbnail,
          ownedExpansionIds: Array.from(selectedExpansions)
        })
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Could not add the game.');
      showToast(`Added ${decodeHtmlEntities(selectedBggGame.name)} with ${selectedExpansions.size} owned expansion(s).`);
      setAdding(false);
      setSelectedBggGame(null);
      setSelectedExpansions(new Set());
      setBggSearchResults([]);
      setBggSearchQuery('');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Toggle owned status of existing expansion
  const toggleExpansionOwned = async (expansionId, owned) => {
    try {
      const res = await fetch(`/api/boardgames/expansions/${expansionId}/own`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owned })
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to update expansion ownership');
      showToast(owned ? 'Added expansion to owned collection.' : 'Removed expansion from owned.');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const addManualGame = async () => {
    try {
      const res = await fetch('/api/boardgames/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draftGame, parentId: draftGame.parentId ? Number(draftGame.parentId) : null })
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Could not add the game.');
      showToast(`Added ${decodeHtmlEntities(d.game.name)}.`);
      setDraftGame({ name: '', year: '', type: 'base', parentId: '', bggLink: '' });
      setAdding(false);
      load();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const removeGame = async (id) => {
    try { await fetch(`/api/boardgames/games/${id}`, { method: 'DELETE' }); showToast('Removed from your collection.'); load(); } catch (err) { showToast(err.message, 'error'); }
  };
  const restoreGame = async (id) => {
    try { await fetch(`/api/boardgames/games/${id}/restore`, { method: 'POST' }); showToast('Back in your collection.'); load(); } catch (err) { showToast(err.message, 'error'); }
  };

  // BoardGameGeek's "Export collection" CSV - loads the collection without the API token.
  const importCsv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const res = await fetch('/api/boardgames/import-csv', { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: await file.text() });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Import failed.');
      showToast(`Imported ${d.games} games and ${d.expansions} expansions.`);
      load();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const setFavourite = async (id, favourite) => {
    const apply = (val) => setData((prev) => ({ ...prev, games: prev.games.map((g) => (g.id === id ? { ...g, favourite: val } : g)) }));
    apply(favourite);
    try {
      const res = await fetch('/api/boardgames/favourite', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, favourite }) });
      if (!res.ok) throw new Error('Save failed');
      const g = data.games.find((x) => x.id === id);
      showToast(favourite ? `Added "${decodeHtmlEntities(g?.name || '')}" to favourites.` : `Removed "${decodeHtmlEntities(g?.name || '')}" from favourites.`);
    } catch (err) {
      apply(!favourite);
      showToast(err.message, 'error');
    }
  };

  // games without players / play time / themes yet: fetch them from BGG in the background, then reload
  const detailsKick = useRef(false);
  useEffect(() => {
    if (detailsKick.current || !data.details?.missing || !config.hasToken) return;
    detailsKick.current = true;
    fetch('/api/boardgames/details/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    const t = setInterval(async () => {
      try {
        const st = await (await fetch('/api/boardgames/details/status')).json();
        if (!st.running) { clearInterval(t); load(); }
      } catch { clearInterval(t); }
    }, 4000);
    return () => clearInterval(t);
  }, [data.details?.missing, config.hasToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSell = async (id, wantToSell) => {
    const apply = (val) => setData((prev) => {
      const flag = (x) => (x.id === id ? { ...x, wantToSell: val } : x);
      return {
        ...prev,
        games: prev.games.map((g) => ({ ...flag(g), expansions: g.expansions.map(flag) })),
        orphanExpansions: prev.orphanExpansions.map(flag)
      };
    });
    apply(wantToSell);
    try {
      const res = await fetch('/api/boardgames/sell', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, wantToSell })
      });
      if (!res.ok) throw new Error('Save failed');
    } catch (err) {
      apply(!wantToSell);
      showToast(err.message, 'error');
    }
  };

  const q = search.trim().toLowerCase();
  const matches = (g) => {
    if (sellOnly && !(g.wantToSell || g.expansions.some((e) => e.wantToSell))) return false;
    if (favOnly && !g.favourite) return false;
    if (soloOnly && !g.solo) return false;
    if (playerCount) {
      if (playerCount === 1) {
        if (!g.solo && g.minPlayers !== 1 && g.communityMinPlayers !== 1) return false;
      } else {
        if (!g.minPlayers) return false;
        const hi = g.maxPlayers || g.minPlayers;
        if (playerCount === 6 ? hi < 6 : (playerCount < g.minPlayers || playerCount > hi)) return false;
      }
    }
    if (maxTime) {
      const t = g.playingTime || g.maxTime;
      if (!t) return false;
      if (maxTime === 999 ? t <= 180 : t > maxTime) return false;
    }
    if (gameTheme && !(g.categories || []).includes(gameTheme)) return false;
    if (!q) return true;
    const gName = decodeHtmlEntities(g.name).toLowerCase();
    return gName.includes(q) || (g.expansions || []).some((e) => decodeHtmlEntities(e.name).toLowerCase().includes(q));
  };
  const visible = data.games.filter(matches);
  const favCount = data.games.filter((g) => g.favourite).length;
  const themes = Object.entries(data.games.reduce((acc, g) => { for (const c of g.categories || []) if (c !== 'Print & Play') acc[c] = (acc[c] || 0) + 1; return acc; }, {}))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const filtersOn = favOnly || soloOnly || playerCount || maxTime || gameTheme;
  const sellCount = data.games.filter((g) => g.wantToSell).length
    + data.games.reduce((n, g) => n + (g.expansions || []).filter((e) => e.wantToSell).length, 0);
  const progressPct = status.total > 0 ? Math.round((status.done / status.total) * 100) : 0;

  const fieldClass = `w-full px-3 py-2 rounded-lg text-xs outline-none border ${
    isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/10 text-slate-900'
  }`;
  const panelClass = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;

  return (
    <div className={`h-screen overflow-y-auto w-full flex flex-col font-sans transition-colors duration-300 ${
      isDark ? 'bg-[#030712] text-[#f3f4f6]' : 'bg-[#f4efed] text-[#1f2937]'
    }`}>
      {notification && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 backdrop-blur-md border ${
          notification.type === 'error' ? 'bg-red-500/90 text-white border-red-600/30'
            : isDark ? 'bg-slate-900/90 text-white border-brand-cyan/40' : 'bg-white/95 text-slate-800 border-[#899981]/40 shadow-xl'
        }`}>
          {notification.type === 'error' ? <AlertCircle size={18} /> : <Check size={18} className="text-emerald-400" />}
          <span className="text-xs font-semibold">{notification.msg}</span>
        </div>
      )}

      <header className={`px-6 py-4 flex items-center justify-between border-b backdrop-blur-xl sticky top-0 z-40 shrink-0 ${
        isDark ? 'bg-[#030712]/80 border-white/5' : 'bg-[#f4efed]/85 border-[#2E2B27]/10'
      }`}>
        <div className="flex items-center gap-4">
          <button onClick={handleReturnHome} className={`p-2 rounded-xl flex items-center gap-2 text-xs font-bold transition-all active:scale-95 ${
            isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5' : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-[#2E2B27] border border-[#2E2B27]/10'
          }`} title="Return to IMS Hub">
            <ArrowLeft size={16} /><span className="hidden sm:inline">IMS Hub</span>
          </button>
          <div className="h-6 w-px bg-slate-500/20" />
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-lime-500 to-green-600 shadow-[0_0_15px_rgba(132,204,22,0.3)]">
              <Dices size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight leading-none uppercase">Board Games</h1>
              <span className="text-[10px] font-semibold text-slate-500 tracking-wider">/ims/boardgames • your BoardGameGeek collection</span>
            </div>
          </div>
        </div>
        {onThemeToggle && (
          <div className="flex items-center gap-2 shrink-0">
            <AccountChip isDark={isDark} />
            <button onClick={onThemeToggle} className={`p-2 rounded-xl transition-all border ${
              isDark ? 'bg-white/5 hover:bg-white/10 text-amber-400 border-white/5' : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-slate-700 border-[#2E2B27]/10'
            }`}>
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-6 flex flex-col gap-5">
        {errorMessage && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-3">
            <AlertCircle size={16} /><span>{errorMessage}</span>
          </div>
        )}

        {/* BGG connection */}
        <div className={panelClass}>
          <div className="flex items-center justify-between mb-3 gap-3">
            <h2 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
              <KeyRound size={14} className="opacity-60" /> BoardGameGeek
              <span className={`px-2 py-0.5 rounded-full text-[9px] ${config.hasToken ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500'}`}>
                {config.hasToken ? 'Token set' : 'Token needed'}
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={syncBoxArt}
                disabled={running || backfillRunning || !config.hasToken}
                title="Fetch box art for all expansions that do not yet have thumbnails"
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                  isDark
                    ? 'bg-slate-900 border-white/10 hover:bg-slate-800 text-slate-200'
                    : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-800'
                }`}
              >
                <Image size={14} className={backfillRunning ? 'animate-pulse text-lime-400' : 'opacity-70'} />
                {backfillRunning ? 'Syncing Art...' : 'Sync Box Art'}
              </button>
              <button
                onClick={refresh}
                disabled={running || backfillRunning || !config.hasToken}
                className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-lime-500 to-green-600 text-white active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCw size={14} className={running ? 'animate-spin' : ''} />
                {running ? 'Refreshing...' : 'Refresh from BGG'}
              </button>
            </div>
          </div>

          {!config.hasToken && (
            <div className={`mb-4 p-3 rounded-xl text-[11px] leading-relaxed border ${isDark ? 'border-amber-500/30 bg-amber-500/5 text-slate-300' : 'border-amber-400/50 bg-amber-50 text-slate-700'}`}>
              BoardGameGeek now requires an application token for its XML API (requests without one get HTTP 401).
              Register an application on your BGG account at{' '}
              <a className="underline inline-flex items-center gap-1" href="https://boardgamegeek.com/applications" target="_blank" rel="noreferrer">
                boardgamegeek.com/applications <ExternalLink size={10} />
              </a>
              , create a token, then paste it below. It's stored on the IMS server only and never shown again.
            </div>
          )}

          {running ? (
            <div className="space-y-2 mb-3">
              <div className={`w-full h-3 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                <div className="h-full bg-gradient-to-r from-lime-500 to-green-600 transition-all duration-500" style={{ width: `${status.total ? progressPct : 5}%` }} />
              </div>
              <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                <span>{status.phase}</span>
                {status.total > 0 && <span>{status.done} / {status.total}</span>}
              </div>
            </div>
          ) : backfillRunning ? (
            <div className="space-y-2 mb-3">
              <div className={`w-full h-3 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                <div
                  className="h-full bg-gradient-to-r from-teal-500 to-lime-500 transition-all duration-500"
                  style={{ width: `${backfillStatus.total ? (backfillStatus.done / backfillStatus.total) * 100 : 5}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                <span>{backfillStatus.phase || 'Fetching expansion box art...'}</span>
                {backfillStatus.total > 0 && <span>{backfillStatus.done} / {backfillStatus.total}</span>}
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-slate-500 mb-3">
              {data.fetchedAt ? <>{data.source === 'csv' ? 'Loaded from a BGG collection CSV' : 'Last refreshed'} <strong>{new Date(data.fetchedAt).toLocaleString('en-GB')}</strong>.</> : 'Not fetched yet.'}
              {' '}<label className="underline cursor-pointer font-semibold">Import a BGG collection CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} /></label>
              {status.state === 'error' && <span className="text-red-400 ml-2">Last refresh failed: {status.error}</span>}
              {backfillStatus.state === 'error' && <span className="text-red-400 ml-2">Box art sync failed: {backfillStatus.error}</span>}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">BGG username</label>
              <input className={fieldClass} value={draftUser} onChange={(e) => setDraftUser(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">{config.hasToken ? 'Replace token (optional)' : 'API token'}</label>
              <input className={fieldClass} type="password" autoComplete="off" value={draftToken} placeholder={config.hasToken ? '••••••••' : 'Paste token'}
                onChange={(e) => setDraftToken(e.target.value)} />
            </div>
            <button onClick={saveConfig}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 active:scale-95 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}>
              <Save size={13} /> Save
            </button>
          </div>
        </div>

        {/* Add game modal / workbench with BGG Expansion Selector */}
        <div className={panelClass}>
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-black uppercase tracking-wider flex-1">Add Games &amp; Expansions</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowUpdates(true)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all active:scale-95 ${
                  isDark
                    ? 'bg-slate-950/80 hover:bg-slate-900 border-lime-500/40 text-lime-400 hover:border-lime-500/60 shadow-[0_0_15px_rgba(132,204,22,0.15)]'
                    : 'bg-white hover:bg-lime-50 border-lime-600/40 text-lime-700 shadow-sm'
                }`}
                title="View newly added games & expansions to synchronise with your BGG account"
              >
                <ClipboardList size={14} className="text-lime-500" />
                <span>Show List Updates</span>
                {(data.updates || []).length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-lime-500 text-slate-950">
                    {data.updates.length}
                  </span>
                )}
              </button>

              {!adding && (
                <button
                  onClick={() => { setAdding(true); setAddMode('bgg'); }}
                  className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-lime-500 to-green-600 text-white active:scale-95"
                >
                  <Plus size={14} /> Add Game / Expansions
                </button>
              )}
            </div>
          </div>

          {adding && (
            <div className="mt-4 space-y-4">
              <div className="flex gap-2 border-b border-white/10 pb-2">
                <button
                  onClick={() => setAddMode('bgg')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${addMode === 'bgg' ? 'bg-lime-500/20 text-lime-400 border border-lime-500/40' : 'opacity-60 hover:opacity-100'}`}
                >
                  Search BoardGameGeek
                </button>
                <button
                  onClick={() => setAddMode('manual')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${addMode === 'manual' ? 'bg-lime-500/20 text-lime-400 border border-lime-500/40' : 'opacity-60 hover:opacity-100'}`}
                >
                  Manual Entry
                </button>
              </div>

              {addMode === 'bgg' ? (
                <div className="space-y-3">
                  <form onSubmit={searchBggLive} className="flex gap-2">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
                      <input
                        className={`${fieldClass} pl-8`}
                        placeholder="Search BGG title (e.g. Dune Imperium, Terraforming Mars)..."
                        value={bggSearchQuery}
                        onChange={(e) => setBggSearchQuery(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSearchingBgg || !bggSearchQuery.trim()}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-lime-600 hover:bg-lime-500 text-white disabled:opacity-40 flex items-center gap-2 shrink-0"
                    >
                      {isSearchingBgg ? <RotateCw size={13} className="animate-spin" /> : <Search size={13} />} Search
                    </button>
                  </form>

                  {/* BGG search results list */}
                  {!selectedBggGame && bggSearchResults.length > 0 && (
                    <div className={`max-h-60 overflow-y-auto rounded-xl border p-2 space-y-1 ${isDark ? 'bg-slate-950/60 border-white/10' : 'bg-white border-slate-200'}`}>
                      <span className="text-[10px] font-bold uppercase tracking-wider opacity-60 px-2">Select matching game:</span>
                      {bggSearchResults.map((res) => (
                        <div
                          key={res.id}
                          onClick={() => selectBggResult(res)}
                          className={`px-3 py-2 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                            isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'
                          }`}
                        >
                          <div className="font-semibold text-xs">
                            {decodeHtmlEntities(res.name)} {res.year && <span className="opacity-50 font-normal">({res.year})</span>}
                          </div>
                          <span className="text-[10px] font-bold text-lime-400">Select &amp; pick expansions &rarr;</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {loadingDetails && (
                    <div className="py-6 flex items-center justify-center gap-2 text-xs text-lime-400">
                      <RotateCw size={16} className="animate-spin" /> Fetching game expansions from BGG...
                    </div>
                  )}

                  {/* Selected BGG game with expansion checklist */}
                  {selectedBggGame && (
                    <div className={`p-4 rounded-xl border space-y-3 ${isDark ? 'bg-slate-950/80 border-lime-500/30' : 'bg-white border-lime-500/40'}`}>
                      <div className="flex items-center gap-3">
                        {selectedBggGame.thumbnail && (
                          <img src={selectedBggGame.thumbnail} alt="" className="w-12 h-12 rounded object-cover" />
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-sm text-lime-400">{decodeHtmlEntities(selectedBggGame.name)}</h3>
                          <span className="text-xs opacity-60">Year: {selectedBggGame.year || 'N/A'} &middot; BGG ID: {selectedBggGame.id}</span>
                        </div>
                        <button
                          onClick={() => setSelectedBggGame(null)}
                          className="px-2.5 py-1 rounded text-[11px] border border-white/10 hover:bg-white/10"
                        >
                          Change game
                        </button>
                      </div>

                      <div className="border-t border-white/10 pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider">
                            Select Owned Expansions ({selectedExpansions.size} / {selectedBggGame.expansions?.length || 0})
                          </span>
                          {selectedBggGame.expansions?.length > 0 && (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedExpansions(new Set(selectedBggGame.expansions.map((e) => e.id)))}
                                className="text-[10px] font-bold text-lime-400 hover:underline"
                              >
                                Select all
                              </button>
                              <span className="opacity-40">|</span>
                              <button
                                type="button"
                                onClick={() => setSelectedExpansions(new Set())}
                                className="text-[10px] font-bold opacity-70 hover:underline"
                              >
                                Clear
                              </button>
                            </div>
                          )}
                        </div>

                        {selectedBggGame.expansions?.length === 0 ? (
                          <p className="text-xs opacity-60 italic">No expansions recorded on BoardGameGeek for this game.</p>
                        ) : (
                          <div className={`max-h-52 overflow-y-auto space-y-1.5 p-2 rounded-lg border ${isDark ? 'bg-slate-900/50 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                            {selectedBggGame.expansions.map((exp) => {
                              const checked = selectedExpansions.has(exp.id);
                              const expName = decodeHtmlEntities(exp.name);
                              return (
                                <label
                                  key={exp.id}
                                  className={`flex items-center gap-2.5 p-1.5 rounded cursor-pointer text-xs transition-colors ${
                                    checked
                                      ? 'bg-lime-500/15 text-lime-300 font-semibold'
                                      : isDark ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-200 text-slate-700'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleExpansionCheckbox(exp.id)}
                                    className="rounded border-slate-600 accent-lime-500 w-4 h-4 cursor-pointer"
                                  />
                                  {exp.thumbnail ? (
                                    <img src={exp.thumbnail} alt="" className="w-6 h-6 rounded object-cover shrink-0 shadow-sm" />
                                  ) : (
                                    <div className={`w-6 h-6 rounded shrink-0 flex items-center justify-center ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                                      <Image size={12} className="opacity-40" />
                                    </div>
                                  )}
                                  <span className="truncate flex-1">{expName}</span>
                                  {exp.year && <span className="text-[10px] opacity-60">({exp.year})</span>}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={saveBggGameWithExpansions}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-lime-500 to-green-600 text-white flex items-center gap-2 shadow-lg shadow-lime-500/20 active:scale-95"
                        >
                          <Save size={13} /> Add Game &amp; Selected Expansions to Collection
                        </button>
                        <button
                          onClick={() => { setAdding(false); setSelectedBggGame(null); }}
                          className={`px-4 py-2 rounded-xl text-xs font-bold ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {!selectedBggGame && (
                    <div className="flex justify-end pt-1">
                      <button onClick={() => setAdding(false)} className={`px-4 py-2 rounded-xl text-xs font-bold ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end">
                  <div className="sm:col-span-3">
                    <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Name</label>
                    <input className={fieldClass} value={draftGame.name} onChange={(e) => setDraftGame({ ...draftGame, name: e.target.value })} placeholder="e.g. Marvel Champions: The Card Game" autoFocus />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Year</label>
                    <input className={fieldClass} type="number" value={draftGame.year} onChange={(e) => setDraftGame({ ...draftGame, year: e.target.value })} placeholder="optional" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Type</label>
                    <select className={fieldClass} value={draftGame.type} onChange={(e) => setDraftGame({ ...draftGame, type: e.target.value })}>
                      <option value="base">Base game</option><option value="expansion">Expansion</option>
                    </select>
                  </div>
                  {draftGame.type === 'expansion' && (
                    <div className="sm:col-span-3">
                      <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Expansion for</label>
                      <select className={fieldClass} value={draftGame.parentId} onChange={(e) => setDraftGame({ ...draftGame, parentId: e.target.value })}>
                        <option value="">Choose a game...</option>
                        {data.games.map((g) => <option key={g.id} value={g.id}>{decodeHtmlEntities(g.name)}</option>)}
                      </select>
                    </div>
                  )}
                  <div className={draftGame.type === 'expansion' ? 'sm:col-span-3' : 'sm:col-span-6'}>
                    <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">BoardGameGeek link (optional)</label>
                    <input className={fieldClass} value={draftGame.bggLink} onChange={(e) => setDraftGame({ ...draftGame, bggLink: e.target.value })} placeholder="https://boardgamegeek.com/boardgame/285774/..." />
                  </div>
                  <div className="sm:col-span-6 flex gap-2">
                    <button onClick={addManualGame} disabled={!draftGame.name.trim()} className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-lime-500 to-green-600 text-white disabled:opacity-40"><Save size={13} /> Add to collection</button>
                    <button onClick={() => setAdding(false)} className={`px-4 py-2 rounded-xl text-xs font-bold ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Collection */}
        <div className={panelClass}>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <h2 className="text-xs font-black uppercase tracking-wider">
              Collection ({data.games.length}) <span className="text-emerald-500 ml-2">{sellCount} to sell</span>
            </h2>
            <label className="ml-auto flex items-center gap-2 text-[11px] font-semibold cursor-pointer">
              <input type="checkbox" checked={sellOnly} onChange={(e) => setSellOnly(e.target.checked)} /> Want to sell only
            </label>
          </div>
          <div className="relative mb-4">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
            <input className={`${fieldClass} pl-8`} placeholder="Search games and expansions..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-4 text-[11px] font-semibold">
            <button onClick={() => setFavOnly(!favOnly)} title={favOnly ? 'Showing favourite games only - click to show all' : 'Show favourite games only'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${favOnly ? 'bg-amber-500 border-amber-500 text-black' : isDark ? 'border-white/15' : 'border-slate-300'}`}>
              <Star size={12} fill={favOnly ? 'currentColor' : 'none'} />Favourites ({favCount})
            </button>
            <select className={`${fieldClass} !w-auto !py-1.5`} value={playerCount} onChange={(e) => setPlayerCount(Number(e.target.value))} aria-label="Players">
              <option value={0}>Any number of players</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} player{n === 1 ? '' : 's'}</option>)}
              <option value={6}>6+ players</option>
            </select>
            <select className={`${fieldClass} !w-auto !py-1.5`} value={maxTime} onChange={(e) => setMaxTime(Number(e.target.value))} aria-label="Play time">
              <option value={0}>Any play time</option>
              {[30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>Up to {m >= 60 ? `${m / 60} hour${m === 60 ? '' : 's'}` : `${m} min`}</option>)}
              <option value={999}>Over 3 hours</option>
            </select>
            <button onClick={() => setSoloOnly(!soloOnly)} title="Games that can be played on your own"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${soloOnly ? 'bg-sky-600 border-sky-600 text-white' : isDark ? 'border-white/15' : 'border-slate-300'}`}>
              <User size={12} />Solo
            </button>
            <select className={`${fieldClass} !w-auto !py-1.5`} value={gameTheme} onChange={(e) => setGameTheme(e.target.value)} aria-label="Theme">
              <option value="">Any theme</option>
              {themes.map(([t, n]) => <option key={t} value={t}>{t} ({n})</option>)}
            </select>
            {filtersOn ? <button onClick={() => { setFavOnly(false); setSoloOnly(false); setPlayerCount(0); setMaxTime(0); setGameTheme(''); }} className="underline underline-offset-2">Clear filters</button> : null}
            <span className="ml-auto">{visible.length} of {data.games.length} shown</span>
          </div>
          {data.details?.running || (data.details?.missing > 0 && config.hasToken) ? (
            <p className="text-[11px] mb-3">Fetching players, play times and themes from BoardGameGeek{data.details?.total ? ` (${data.details.done} of ${data.details.total})` : ''}...</p>
          ) : null}

          {isLoading ? (
            <div className="py-8 flex justify-center"><RotateCw size={18} className="animate-spin opacity-50" /></div>
          ) : data.games.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              {config.hasToken ? 'No games yet - press "Refresh from BGG" or add above.' : 'Add your BGG token above or add games directly.'}
            </p>
          ) : visible.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">Nothing matches.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((g) => (
                <GameRow key={g.id} game={g} isDark={isDark} onSell={setSell} onFavourite={setFavourite} onToggleExpansion={toggleExpansionOwned} onRemove={removeGame} onDecks={() => { window.history.pushState(null, '', '/campaigns/lotr'); if (setCurrentPath) setCurrentPath('/campaigns/lotr'); }}
                  defaultOpen={Boolean(q) && (g.expansions || []).some((e) => decodeHtmlEntities(e.name).toLowerCase().includes(q))} />
              ))}
            </div>
          )}

          {data.orphanExpansions.length > 0 && !sellOnly && !q && (
            <div className="mt-6">
              <h3 className="text-[11px] font-black uppercase tracking-wider mb-2 opacity-70">
                Owned expansions not linked to a game in your collection ({data.orphanExpansions.length})
              </h3>
              <div className="flex flex-col gap-1">
                {data.orphanExpansions.map((e) => {
                  const orphanName = decodeHtmlEntities(e.name);
                  return (
                    <div key={e.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-xs ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
                      {e.thumbnail ? (
                        <ThumbnailHoverPreview
                          src={e.thumbnail}
                          alt={orphanName}
                          name={orphanName}
                          year={e.year}
                          isDark={isDark}
                          size="w-8 h-8"
                        />
                      ) : (
                        <div className={`w-8 h-8 rounded shrink-0 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                      )}
                      <div className="min-w-0 flex-1 truncate">
                        <span className="font-semibold">{orphanName}</span>
                        {e.year && <span className="opacity-50 ml-1 font-normal">({e.year})</span>}
                        {e.manual && <ManualTag />}
                      </div>
                      <span className="ml-auto flex items-center gap-1.5 shrink-0">
                        {e.wantToSell && <EbaySold name={orphanName} isDark={isDark} />}
                        <SellTick checked={e.wantToSell} isDark={isDark} onToggle={(v) => setSell(e.id, v)} />
                        <RemoveBtn name={orphanName} onRemove={() => removeGame(e.id)} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {(data.removed || []).length > 0 && !sellOnly && !q && (
            <div className="mt-6">
              <button onClick={() => setShowRemoved(!showRemoved)} className="text-[11px] font-black uppercase tracking-wider opacity-70">
                Removed from your collection ({data.removed.length}) {showRemoved ? '▾' : '▸'}
              </button>
              {showRemoved && (
                <div className="flex flex-col gap-1 mt-2">
                  {data.removed.map((e) => {
                    const remName = decodeHtmlEntities(e.name);
                    return (
                      <div key={e.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
                        <span className="font-semibold opacity-70">{remName}</span>{e.year && <span className="opacity-50">({e.year})</span>}
                        <button onClick={() => restoreGame(e.id)} className={`ml-auto px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}><Undo2 size={12} /> Restore</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* List Updates Modal / Drawer */}
      {showUpdates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
          <div
            className={`w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl shadow-2xl border overflow-hidden ${
              isDark ? 'bg-slate-950 border-white/10 text-slate-100' : 'bg-[#FAF7F2] border-[#2E2B27]/15 text-slate-900'
            }`}
          >
            {/* Modal Header */}
            <div className={`p-4 sm:p-5 flex items-center justify-between border-b ${isDark ? 'border-white/10 bg-slate-900/60' : 'border-[#2E2B27]/10 bg-white/60'}`}>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-tr from-lime-500 to-green-600 text-white shadow-md">
                  <ClipboardList size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                    Collection Updates &amp; Additions
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-lime-500 text-slate-950">
                      {(data.updates || []).length} items
                    </span>
                  </h3>
                  <p className="text-[11px] opacity-70">
                    Games &amp; expansions added locally or marked owned. Click any BGG link to add them to your BGG account.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowUpdates(false)}
                className={`p-2 rounded-xl transition-all ${isDark ? 'hover:bg-white/10 text-slate-400 hover:text-white' : 'hover:bg-black/5 text-slate-600 hover:text-black'}`}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Search & Stats */}
            <div className={`p-3 sm:px-5 border-b flex items-center gap-3 ${isDark ? 'border-white/5 bg-slate-900/30' : 'border-[#2E2B27]/5 bg-white/40'}`}>
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
                <input
                  className={`${fieldClass} pl-8`}
                  placeholder="Filter updates by title, base game, or year..."
                  value={updatesSearch}
                  onChange={(e) => setUpdatesSearch(e.target.value)}
                  autoFocus
                />
              </div>
              {updatesSearch && (
                <button
                  onClick={() => setUpdatesSearch('')}
                  className="text-[11px] font-semibold opacity-60 hover:opacity-100 shrink-0"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Modal Body - Items List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2">
              {(() => {
                const uQuery = updatesSearch.trim().toLowerCase();
                const filteredUpdates = (data.updates || []).filter((u) => {
                  if (!uQuery) return true;
                  const nameMatch = (u.name || '').toLowerCase().includes(uQuery);
                  const parentMatch = (u.parentName || '').toLowerCase().includes(uQuery);
                  const yearMatch = String(u.year || '').includes(uQuery);
                  return nameMatch || parentMatch || yearMatch;
                });

                if (filteredUpdates.length === 0) {
                  return (
                    <div className="py-12 text-center text-xs opacity-60">
                      {updatesSearch ? 'No updates match your filter query.' : 'No local additions or owned expansion updates found.'}
                    </div>
                  );
                }

                return filteredUpdates.map((item) => {
                  const cleanName = decodeHtmlEntities(item.name);
                  const cleanParent = item.parentName ? decodeHtmlEntities(item.parentName) : null;
                  const isExpansion = item.type === 'expansion';

                  return (
                    <div
                      key={`${item.type}_${item.id}`}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                        isDark ? 'bg-slate-900/50 border-white/5 hover:border-lime-500/30' : 'bg-white border-[#2E2B27]/10 hover:border-lime-600/40 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {item.thumbnail ? (
                          <ThumbnailHoverPreview
                            src={item.thumbnail}
                            alt={cleanName}
                            name={cleanName}
                            year={item.year}
                            isDark={isDark}
                            size="w-10 h-10"
                          />
                        ) : (
                          <div className={`w-10 h-10 rounded flex items-center justify-center font-bold text-[10px] shrink-0 ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600'}`}>
                            {isExpansion ? 'EXP' : 'GAME'}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-xs text-slate-100 leading-tight" style={{ color: isDark ? '#ffffff' : '#1e293b' }}>
                              {cleanName}
                            </span>
                            {item.year && (
                              <span className={`text-[11px] font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                ({item.year})
                              </span>
                            )}
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                isExpansion ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20' : 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                              }`}
                            >
                              {isExpansion ? 'Expansion' : 'Base Game'}
                            </span>
                          </div>

                          {cleanParent && (
                            <div className={`text-[11px] mt-0.5 truncate ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                              For base game: <span className="font-semibold text-lime-400">{cleanParent}</span>
                            </div>
                          )}

                          {item.updatedAt && (
                            <div className="text-[10px] opacity-40 mt-0.5">
                              Added/Updated: {new Date(item.updatedAt).toLocaleString('en-GB')}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* External BGG Link Button */}
                      <div className="shrink-0">
                        {item.bggUrl ? (
                          <a
                            href={item.bggUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 ${
                              isDark
                                ? 'bg-lime-500/15 hover:bg-lime-500/25 text-lime-300 border border-lime-500/40 hover:border-lime-500/60'
                                : 'bg-lime-600 hover:bg-lime-700 text-white'
                            }`}
                            title={`Open "${cleanName}" on BoardGameGeek`}
                          >
                            <span>Open in BGG</span>
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span className="text-[10px] italic opacity-50 px-2 py-1">Manual (No BGG ID)</span>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Modal Footer */}
            <div className={`p-4 border-t flex items-center justify-between ${isDark ? 'border-white/10 bg-slate-900/60' : 'border-[#2E2B27]/10 bg-white/60'}`}>
              <div className="text-[11px] opacity-70">
                Tip: After adding them to your BGG account, click <strong>"Refresh from BGG"</strong> to sync everything automatically.
              </div>
              <button
                onClick={() => setShowUpdates(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold ${isDark ? 'bg-white/10 hover:bg-white/15 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
