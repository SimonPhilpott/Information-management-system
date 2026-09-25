import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Music, ArrowLeft, Save, RotateCw, Check, AlertCircle, Sun, Moon,
  PlayCircle, Clock, ChevronRight, ChevronDown, Pencil, X, Search, Disc3
} from 'lucide-react';

const VIEWS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: '6months', label: '6 Months' },
  { key: 'year', label: 'Year' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'all', label: 'All Artists' }
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// MusicBrainz often only knows a month or a year for a release, so show
// exactly the precision that's actually known rather than inventing a day.
function fmtDate(date, precision) {
  if (!date) return 'Date unknown';
  const [y, m, d] = date.split('-');
  if (precision === 'day') return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
  if (precision === 'month') return `${MONTHS[Number(m) - 1]} ${y}`;
  return y;
}

function ArtistCard({ artist, isDark, onChanged, showToast }) {
  const [open, setOpen] = useState(false);
  const [fetched, setFetched] = useState(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ searchName: artist.searchName || '', aliases: (artist.aliases || []).join(', ') });

  // A fresh artist prop (parent refetched) supersedes anything fetched locally.
  useEffect(() => { setFetched(null); }, [artist]);

  const detail = fetched || (artist.releases ? artist : null);

  useEffect(() => {
    if (!open || detail) return;
    let cancelled = false;
    fetch(`/api/music-scan/artist?name=${encodeURIComponent(artist.name)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.success) setFetched(d.artist); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, detail, artist.name]);

  const startEdit = (e) => {
    e.stopPropagation();
    setForm({ searchName: artist.searchName || '', aliases: (artist.aliases || []).join(', ') });
    setEditing(true);
    setOpen(true);
  };

  const saveAndRescan = async () => {
    setBusy(true);
    try {
      const aliases = form.aliases.split(',').map((s) => s.trim()).filter(Boolean);
      let res = await fetch('/api/music-scan/artist/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: artist.name, searchName: form.searchName, aliases })
      });
      let data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save.');
      res = await fetch('/api/music-scan/artist/rescan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: artist.name })
      });
      data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Rescan failed.');
      setFetched(data.artist);
      setEditing(false);
      showToast(`Saved and rescanned ${artist.name}.`);
      onChanged();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const owned = detail ? detail.releases.filter((r) => r.owned).length : artist.owned;
  const notOwned = detail ? detail.releases.filter((r) => !r.owned).length : artist.notOwned;
  const unlistedCount = detail ? detail.unlistedAlbums.length : artist.unlisted;

  const GREEN = isDark ? 'text-emerald-400' : 'text-emerald-600';
  const RED = isDark ? 'text-red-400' : 'text-red-600';
  const GREY = isDark ? 'text-slate-500' : 'text-slate-400';
  const fieldClass = `w-full px-3 py-2 rounded-lg text-xs outline-none border ${
    isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/10 text-slate-900'
  }`;

  return (
    <div className={`rounded-xl border text-xs ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
      <div
        role="button" tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen(!open); }}
        className="w-full px-3 py-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 cursor-pointer text-left"
      >
        {open ? <ChevronDown size={14} className="shrink-0 opacity-60" /> : <ChevronRight size={14} className="shrink-0 opacity-60" />}
        <span className="font-bold min-w-0 flex-1 basis-40 break-words">{artist.name}</span>
        <span className={`hidden sm:inline text-[10px] uppercase tracking-wider ${GREY}`}>{artist.genre}</span>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-0.5 text-[11px] font-semibold">
          <span className={GREEN}>{owned} owned</span>
          <span className={RED}>{notOwned} not owned</span>
          {unlistedCount > 0 && <span className={GREY}>{unlistedCount} unlisted</span>}
          <button onClick={startEdit} title="Edit name / pseudonyms" className={`p-1 rounded ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>
            <Pencil size={12} />
          </button>
        </span>
      </div>

      {open && (
        <div className={`px-3 pb-3 pt-1 border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
          {editing && (
            <div className={`my-2 p-3 rounded-lg border grid grid-cols-1 sm:grid-cols-2 gap-3 ${isDark ? 'border-white/10 bg-slate-900/60' : 'border-[#2E2B27]/10 bg-slate-50'}`}>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Name to search MusicBrainz for</label>
                <input className={fieldClass} value={form.searchName} placeholder={artist.name}
                  onChange={(e) => setForm({ ...form, searchName: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Pseudonyms / other names (comma-separated)</label>
                <input className={fieldClass} value={form.aliases} placeholder="e.g. Perturbator, James Kent"
                  onChange={(e) => setForm({ ...form, aliases: e.target.value })} />
              </div>
              <div className="sm:col-span-2 flex items-center gap-2">
                <button onClick={saveAndRescan} disabled={busy}
                  className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white active:scale-95 disabled:opacity-50">
                  {busy ? <RotateCw size={13} className="animate-spin" /> : <Save size={13} />} Save &amp; rescan
                </button>
                <button onClick={() => setEditing(false)} disabled={busy} className={`px-3 py-2 rounded-xl text-xs font-bold ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}>
                  <X size={13} />
                </button>
                <span className="text-[10px] opacity-60">Matched on MusicBrainz as: {detail?.mbName || artist.mbName || 'no match'}</span>
              </div>
            </div>
          )}

          {!detail ? (
            <div className="py-3 flex justify-center"><RotateCw size={14} className="animate-spin opacity-50" /></div>
          ) : (
            <div className="flex flex-col">
              {detail.releases.map((r, i) => (
                <div key={`${r.title}-${r.date}-${i}`} className={`flex items-center gap-2 py-1 ${r.isNew ? (isDark ? 'bg-amber-500/10' : 'bg-amber-100/60') + ' -mx-2 px-2 rounded' : ''}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${r.owned ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <span className={`font-semibold ${r.owned ? GREEN : RED}`}>{r.title}</span>
                  <span className="opacity-50 text-[10px]">{r.type}</span>
                  {r.isNew && <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500 text-white">New</span>}
                  <span className={`ml-auto shrink-0 tabular-nums ${r.owned ? GREEN : RED} opacity-80`}>{fmtDate(r.date, r.precision)}</span>
                </div>
              ))}
              {detail.unlistedAlbums.map((title) => (
                <div key={`u-${title}`} className="flex items-center gap-2 py-1">
                  <span className="w-2 h-2 rounded-full shrink-0 bg-slate-500" />
                  <span className={`font-semibold ${GREY}`}>{title}</span>
                  <span className="opacity-50 text-[10px]">not on MusicBrainz</span>
                </div>
              ))}
              {detail.releases.length === 0 && detail.unlistedAlbums.length === 0 && (
                <p className={`py-2 ${GREY}`}>Nothing found for this artist.</p>
              )}
              {detail.error && <p className="py-1 text-red-400">Lookup error: {detail.error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MusicScanPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';

  const [config, setConfig] = useState(null);
  const [draftConfig, setDraftConfig] = useState(null);
  const [status, setStatus] = useState({ state: 'idle' });
  const [isRunning, setIsRunning] = useState(false);
  const [nextRun, setNextRun] = useState(null);
  const [meta, setMeta] = useState({ lastScanCompleted: null, artistsScanned: 0, artistsWithMissingReleases: 0 });
  const [view, setView] = useState('day');
  const [windowData, setWindowData] = useState(null);
  const [todayList, setTodayList] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [allArtists, setAllArtists] = useState([]);
  const [search, setSearch] = useState('');
  const [viewLoading, setViewLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [notification, setNotification] = useState(null);
  const pollRef = useRef(null);
  const wasRunning = useRef(false);

  const isDirty = draftConfig && config && JSON.stringify(draftConfig) !== JSON.stringify(config);

  const showToast = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification((prev) => (prev?.msg === msg ? null : prev)), 3500);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/music-scan');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        setDraftConfig((prev) => prev || data.config);
        setStatus(data.status);
        setIsRunning(data.isRunning);
        setNextRun(data.nextScheduledRun);
        setMeta({ lastScanCompleted: data.lastScanCompleted, artistsScanned: data.artistsScanned, artistsWithMissingReleases: data.artistsWithMissingReleases });
        setErrorMessage(null);
      }
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchView = useCallback(async () => {
    setViewLoading(true);
    try {
      if (view === 'all') {
        const d = await (await fetch('/api/music-scan/artists')).json();
        if (d.success) setAllArtists(d.artists);
      } else if (view === 'upcoming') {
        const d = await (await fetch('/api/music-scan/upcoming')).json();
        if (d.success) setUpcoming(d.releases);
      } else {
        const d = await (await fetch(`/api/music-scan/results?window=${view}`)).json();
        if (d.success) setWindowData(d);
        if (view === 'day') {
          const t = await (await fetch('/api/music-scan/today')).json();
          if (t.success) setTodayList(t.releases);
        }
      }
    } catch (_) { /* leave the previous view data in place */ }
    finally { setViewLoading(false); }
  }, [view]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);
  useEffect(() => { fetchView(); }, [fetchView]);

  // While a scan runs, poll every 3s to animate the progress bar; when it
  // stops, refresh the status and the visible results once.
  useEffect(() => {
    if (isRunning) {
      wasRunning.current = true;
      pollRef.current = setInterval(fetchStatus, 3000);
      return () => clearInterval(pollRef.current);
    }
    if (wasRunning.current) {
      wasRunning.current = false;
      fetchStatus();
      fetchView();
    }
  }, [isRunning, fetchStatus, fetchView]);

  const handleReturnHome = () => {
    window.history.pushState(null, '', '/ims');
    if (setCurrentPath) setCurrentPath('/ims');
    else window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/music-scan/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draftConfig)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save.');
      setConfig(data.config);
      setDraftConfig(data.config);
      setNextRun(data.nextScheduledRun);
      showToast('Settings saved.');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleScanNow = async () => {
    try {
      const res = await fetch('/api/music-scan/run', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to start scan.');
      showToast('Scan started.');
      setIsRunning(true);
      fetchStatus();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const progressPct = status.totalArtists > 0 ? Math.round((status.currentIndex / status.totalArtists) * 100) : 0;
  const hasData = meta.artistsScanned > 0;

  const fieldClass = `w-full px-3 py-2 rounded-lg text-xs font-mono outline-none border ${
    isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/10 text-slate-900'
  }`;
  const labelClass = `text-[10px] font-bold uppercase tracking-wider mb-1 block ${isDark ? 'text-slate-400' : 'text-slate-600'}`;
  const panelClass = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const GREEN = isDark ? 'text-emerald-400' : 'text-emerald-600';
  const RED = isDark ? 'text-red-400' : 'text-red-600';

  const visibleAll = allArtists.filter((a) => {
    const q = search.trim().toLowerCase();
    return !q || a.name.toLowerCase().includes(q) || (a.mbName || '').toLowerCase().includes(q) ||
      (a.aliases || []).some((x) => x.toLowerCase().includes(q));
  });

  const artistsToShow = view === 'all' ? visibleAll : (windowData?.artists || []);
  const windowLabel = VIEWS.find((v) => v.key === view)?.label;

  return (
    // h-screen + overflow-y-auto (not min-h-screen): the app shell doesn't
    // scroll the document, so this page has to be its own scroll container.
    <div className={`h-screen overflow-y-auto w-full flex flex-col font-sans transition-colors duration-300 ${
      isDark ? 'bg-[#030712] text-[#f3f4f6]' : 'bg-[#f4efed] text-[#1f2937]'
    }`}>
      {notification && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 backdrop-blur-md border animate-in fade-in slide-in-from-top-4 duration-200 ${
          notification.type === 'error'
            ? 'bg-red-500/90 text-white border-red-600/30'
            : isDark ? 'bg-slate-900/90 text-white border-brand-cyan/40' : 'bg-white/95 text-slate-800 border-[#899981]/40 shadow-xl'
        }`}>
          {notification.type === 'error' ? <AlertCircle size={18} /> : <Check size={18} className="text-emerald-400" />}
          <span className="text-xs font-semibold">{notification.msg}</span>
        </div>
      )}

      <header className={`px-6 py-4 flex items-center justify-between border-b backdrop-blur-xl sticky top-0 z-40 transition-colors duration-300 shrink-0 ${
        isDark ? 'bg-[#030712]/80 border-white/5' : 'bg-[#f4efed]/85 border-[#2E2B27]/10'
      }`}>
        <div className="flex items-center gap-4">
          <button onClick={handleReturnHome} className={`p-2 rounded-xl flex items-center gap-2 text-xs font-bold transition-all active:scale-95 ${
            isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5' : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-[#2E2B27] border border-[#2E2B27]/10'
          }`} title="Return to IMS Hub">
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">IMS Hub</span>
          </button>
          <div className="h-6 w-px bg-slate-500/20" />
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 shadow-[0_0_15px_rgba(249,115,22,0.3)]">
              <Music size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight leading-none uppercase">Music Scanner</h1>
              <span className="text-[10px] font-semibold text-slate-500 tracking-wider">/ims/musicscan • your MUZAK library vs MusicBrainz</span>
            </div>
          </div>
        </div>
        {onThemeToggle && (
          <button onClick={onThemeToggle} className={`p-2 rounded-xl transition-all border ${
            isDark ? 'bg-white/5 hover:bg-white/10 text-amber-400 border-white/5' : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-slate-700 border-[#2E2B27]/10'
          }`} title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}>
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        )}
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-6 flex flex-col gap-5">
        {errorMessage && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-3">
            <AlertCircle size={16} /><span>{errorMessage}</span>
          </div>
        )}

        {/* Status panel */}
        <div className={panelClass}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
              <RotateCw size={14} className={isRunning ? 'animate-spin text-amber-400' : 'opacity-60'} />
              Scan Status
            </h2>
            <button onClick={handleScanNow} disabled={isRunning}
              className="px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.25)] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
              <PlayCircle size={15} />
              <span>{isRunning ? 'Scanning...' : 'Scan Now'}</span>
            </button>
          </div>

          {isRunning ? (
            <div className="space-y-2">
              <div className={`w-full h-3 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                <div className="h-full bg-gradient-to-r from-amber-500 to-orange-600 transition-all duration-500" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                <span>{status.currentArtist ? `Checking "${status.currentArtist}"...` : 'Starting...'}</span>
                <span>{status.currentIndex || 0} / {status.totalArtists || 0} ({progressPct}%)</span>
              </div>
              <p className="text-[10px] text-slate-500">Results below update when the scan finishes (about 35-40 minutes for the full library).</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-500">
              <span>State: <strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>{status.state || 'idle'}</strong></span>
              {meta.lastScanCompleted && (
                <span>Last completed: <strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>{new Date(meta.lastScanCompleted).toLocaleString('en-GB')}</strong></span>
              )}
              {hasData && <span>{meta.artistsScanned} artists scanned, {meta.artistsWithMissingReleases} with releases you don't own</span>}
              {nextRun && (
                <span className="flex items-center gap-1">
                  <Clock size={11} /> Next run: <strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>{new Date(nextRun).toLocaleString('en-GB')}</strong>
                </span>
              )}
              {status.state === 'error' && status.lastError && <span className="text-red-400">Error: {status.lastError}</span>}
            </div>
          )}
        </div>

        {/* Results panel */}
        <div className={panelClass}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-xs font-black uppercase tracking-wider">
              {view === 'all' ? 'All Artists' : view === 'upcoming' ? `Upcoming releases (${upcoming.length})` : `Released in the last ${windowLabel === 'Day' ? 'day (today)' : windowLabel.toLowerCase()}`}
            </h2>
            <div className={`flex rounded-lg overflow-hidden border ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
              {VIEWS.map((v) => (
                <button key={v.key} onClick={() => setView(v.key)}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all ${
                    view === v.key ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white'
                      : isDark ? 'text-slate-400 hover:bg-white/5' : 'text-slate-600 hover:bg-black/5'
                  }`}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 mb-4 text-[11px] font-semibold">
            <span className={`flex items-center gap-1.5 ${GREEN}`}><span className="w-2 h-2 rounded-full bg-emerald-500" />Owned</span>
            <span className={`flex items-center gap-1.5 ${RED}`}><span className="w-2 h-2 rounded-full bg-red-500" />Not owned</span>
            <span className="flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full bg-slate-500" />Owned, not on MusicBrainz</span>
            {view !== 'all' && view !== 'upcoming' && <span className="text-slate-500 text-[10px]">Highlighted rows are the releases inside this window. Year-only dates can't be placed in a window.</span>}
          </div>

          {!hasData ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              {isRunning ? 'Waiting for the scan to finish...' : 'No scan data yet - run a scan to populate this.'}
            </p>
          ) : (
            <>
              {view === 'upcoming' && (
                viewLoading && upcoming.length === 0 ? (
                  <div className="py-8 flex justify-center"><RotateCw size={18} className="animate-spin opacity-50" /></div>
                ) : upcoming.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">No announced releases from your artists yet. MusicBrainz only lists them once they are announced, so check again after the next scan.</p>
                ) : (
                  <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
                    <div className={`grid grid-cols-[7.5rem_1fr_1fr_4rem] gap-3 px-3 py-2 text-[10px] font-black uppercase tracking-wider ${isDark ? 'bg-white/5 text-slate-400' : 'bg-black/5 text-slate-600'}`}>
                      <span>Release date</span><span>Album</span><span>Artist</span><span>Type</span>
                    </div>
                    {upcoming.map((r, i) => (
                      <div key={`${r.artist}-${r.title}-${i}`}
                        className={`grid grid-cols-[7.5rem_1fr_1fr_4rem] gap-3 px-3 py-2 text-xs items-center border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/5'}`}>
                        <span className="tabular-nums font-semibold text-amber-500" title={r.precision === 'day' ? '' : 'MusicBrainz does not know the exact day yet'}>
                          {fmtDate(r.date, r.precision)}{r.precision !== 'day' && <span className="ml-1 text-[9px] font-bold text-slate-500">TBC</span>}
                        </span>
                        <span className={`font-semibold min-w-0 break-words ${r.owned ? GREEN : ''}`}>{r.title}</span>
                        <span className="min-w-0 break-words font-bold" title={r.mbName && r.mbName !== r.artist ? `Your folder: ${r.artist}` : undefined}>{r.mbName || r.artist}</span>
                        <span className="opacity-60 text-[10px]">{r.type}</span>
                      </div>
                    ))}
                  </div>
                )
              )}

              {view === 'day' && (
                <div className={`mb-5 p-4 rounded-xl border ${isDark ? 'border-amber-500/30 bg-amber-500/5' : 'border-amber-400/50 bg-amber-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Disc3 size={14} className="text-amber-500" />
                    <h3 className="text-[11px] font-black uppercase tracking-wider">Released today ({todayList.length})</h3>
                    <span className="text-[10px] text-slate-500">This is the number shown next to the vinyl icon on IMS.</span>
                  </div>
                  {todayList.length === 0 ? (
                    <p className="text-xs text-slate-500">Nothing from your artists came out today.</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {todayList.map((r, i) => (
                        <div key={`${r.artist}-${r.title}-${i}`} className="flex items-center gap-2 text-xs">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${r.owned ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <span className="font-bold">{r.artist}</span>
                          <span className={`font-semibold ${r.owned ? GREEN : RED}`}>{r.title}</span>
                          <span className="opacity-50 text-[10px]">{r.type}</span>
                          <span className="ml-auto tabular-nums text-slate-500">{fmtDate(r.date, 'day')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {view === 'all' && (
                <div className="relative mb-3">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
                  <input className={`${fieldClass} pl-8 font-sans`} placeholder={`Search ${allArtists.length} artists...`}
                    value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              )}

              {view === 'upcoming' ? null : viewLoading && artistsToShow.length === 0 ? (
                <div className="py-8 flex justify-center"><RotateCw size={18} className="animate-spin opacity-50" /></div>
              ) : artistsToShow.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  {view === 'all' ? 'No artists match.' : `None of your artists have a dated release in this window.`}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {view !== 'all' && <p className="text-[11px] text-slate-500">{artistsToShow.length} artist{artistsToShow.length === 1 ? '' : 's'}</p>}
                  {artistsToShow.map((a) => (
                    <ArtistCard key={`${view}-${a.name}`} artist={a} isDark={isDark} showToast={showToast} onChanged={fetchView} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Config panel */}
        {isLoading || !draftConfig ? (
          <div className="py-10 text-center flex flex-col items-center gap-3">
            <RotateCw size={22} className="text-amber-400 animate-spin" />
            <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Loading settings...</p>
          </div>
        ) : (
          <div className={panelClass}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-black uppercase tracking-wider">Settings</h2>
              <button onClick={handleSave} disabled={!isDirty || isSaving}
                className="px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.25)] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                {isSaving ? <RotateCw size={15} className="animate-spin" /> : <Save size={15} />}
                <span>{isSaving ? 'Saving...' : 'Save'}</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>MUZAK Network Path</label>
                <input className={fieldClass} value={draftConfig.muzak_path}
                  onChange={(e) => setDraftConfig({ ...draftConfig, muzak_path: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Nightly Scan Time (Europe/London, HH:MM)</label>
                <input className={fieldClass} value={draftConfig.schedule_time} placeholder="01:00"
                  onChange={(e) => setDraftConfig({ ...draftConfig, schedule_time: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>MusicBrainz Requests / Second</label>
                <input type="number" step="0.1" min="0.1" max="1" className={fieldClass} value={draftConfig.rate_limit_per_sec}
                  onChange={(e) => setDraftConfig({ ...draftConfig, rate_limit_per_sec: parseFloat(e.target.value) || 1 })} />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input type="checkbox" checked={draftConfig.schedule_enabled}
                    onChange={(e) => setDraftConfig({ ...draftConfig, schedule_enabled: e.target.checked })} />
                  Nightly scan enabled
                </label>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Excluded Artists (comma-separated)</label>
                <textarea className={`${fieldClass} min-h-[60px]`} value={draftConfig.excluded_artists.join(', ')}
                  onChange={(e) => setDraftConfig({ ...draftConfig, excluded_artists: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
