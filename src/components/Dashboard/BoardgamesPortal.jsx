import AccountChip from './AccountChip';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dices, ArrowLeft, RotateCw, Check, AlertCircle, Sun, Moon, ChevronRight, ChevronDown,
  Search, Save, ExternalLink, KeyRound
} from 'lucide-react';

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

function GameRow({ game, isDark, onSell, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const ownedCount = game.expansions.filter((e) => e.owned).length;
  const hasExp = game.expansions.length > 0;
  const muted = isDark ? 'text-slate-500' : 'text-slate-400';

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
        {game.thumbnail
          ? <img src={game.thumbnail} alt="" loading="lazy" className="w-9 h-9 rounded object-cover shrink-0" />
          : <div className={`w-9 h-9 rounded shrink-0 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />}
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[13px] truncate">
            {game.name} {game.year ? <span className={`font-normal ${muted}`}>({game.year})</span> : null}
          </div>
          {hasExp && (
            <div className={`text-[11px] ${muted}`}>
              {game.expansions.length} expansion{game.expansions.length === 1 ? '' : 's'} &middot;{' '}
              <span className={ownedCount ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : ''}>{ownedCount} owned</span>
            </div>
          )}
        </div>
        <SellTick checked={game.wantToSell} isDark={isDark} onToggle={(v) => onSell(game.id, v)} />
      </div>

      {open && hasExp && (
        <div className={`px-3 pb-3 pt-1 border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
          {game.expansions.map((e) => (
            <div key={e.id} className="flex items-center gap-2 py-1 pl-7">
              <span className={`w-2 h-2 rounded-full shrink-0 ${e.owned ? 'bg-emerald-500' : isDark ? 'bg-slate-600' : 'bg-slate-300'}`} />
              <span className={e.owned ? (isDark ? 'text-emerald-400 font-semibold' : 'text-emerald-700 font-semibold') : muted}>{e.name}</span>
              {!e.owned && <span className="opacity-60 text-[10px]">not owned</span>}
              {e.owned && (
                <span className="ml-auto">
                  <SellTick checked={e.wantToSell} isDark={isDark} onToggle={(v) => onSell(e.id, v)} />
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BoardgamesPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';

  const [data, setData] = useState({ games: [], orphanExpansions: [], fetchedAt: null });
  const [config, setConfig] = useState({ username: 'Sideburnt', hasToken: false });
  const [status, setStatus] = useState({ state: 'idle' });
  const [draftUser, setDraftUser] = useState('');
  const [draftToken, setDraftToken] = useState('');
  const [search, setSearch] = useState('');
  const [sellOnly, setSellOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [notification, setNotification] = useState(null);
  const pollRef = useRef(null);
  const wasRunning = useRef(false);

  const showToast = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification((prev) => (prev?.msg === msg ? null : prev)), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/boardgames');
      const d = await res.json();
      if (!d.success) throw new Error(d.error || 'Failed to load.');
      setData({ games: d.games, orphanExpansions: d.orphanExpansions, fetchedAt: d.fetchedAt });
      setConfig(d.config);
      setStatus(d.status);
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
  useEffect(() => {
    if (running) {
      wasRunning.current = true;
      pollRef.current = setInterval(load, 3000);
      return () => clearInterval(pollRef.current);
    }
    if (wasRunning.current) { wasRunning.current = false; load(); }
  }, [running, load]);

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

  // Optimistic: flip the tick immediately, roll back if the save fails.
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
    if (!q) return true;
    return g.name.toLowerCase().includes(q) || g.expansions.some((e) => e.name.toLowerCase().includes(q));
  };
  const visible = data.games.filter(matches);
  const sellCount = data.games.filter((g) => g.wantToSell).length
    + data.games.reduce((n, g) => n + g.expansions.filter((e) => e.wantToSell).length, 0);
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
            <button onClick={refresh} disabled={running || !config.hasToken}
              className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-lime-500 to-green-600 text-white active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
              <RotateCw size={14} className={running ? 'animate-spin' : ''} />{running ? 'Refreshing...' : 'Refresh from BGG'}
            </button>
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
          ) : (
            <div className="text-[11px] text-slate-500 mb-3">
              {data.fetchedAt ? <>Last refreshed <strong>{new Date(data.fetchedAt).toLocaleString('en-GB')}</strong>.</> : 'Not fetched yet.'}
              {status.state === 'error' && <span className="text-red-400 ml-2">Last refresh failed: {status.error}</span>}
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

          {isLoading ? (
            <div className="py-8 flex justify-center"><RotateCw size={18} className="animate-spin opacity-50" /></div>
          ) : data.games.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              {config.hasToken ? 'No games yet - press "Refresh from BGG".' : 'Add your BGG token above, then refresh to load your collection.'}
            </p>
          ) : visible.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">Nothing matches.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((g) => (
                <GameRow key={g.id} game={g} isDark={isDark} onSell={setSell}
                  defaultOpen={Boolean(q) && g.expansions.some((e) => e.name.toLowerCase().includes(q))} />
              ))}
            </div>
          )}

          {data.orphanExpansions.length > 0 && !sellOnly && !q && (
            <div className="mt-6">
              <h3 className="text-[11px] font-black uppercase tracking-wider mb-2 opacity-70">
                Owned expansions not linked to a game in your collection ({data.orphanExpansions.length})
              </h3>
              <div className="flex flex-col gap-1">
                {data.orphanExpansions.map((e) => (
                  <div key={e.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
                    <span className="font-semibold">{e.name}</span>
                    {e.year && <span className="opacity-50">({e.year})</span>}
                    <span className="ml-auto"><SellTick checked={e.wantToSell} isDark={isDark} onToggle={(v) => setSell(e.id, v)} /></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
