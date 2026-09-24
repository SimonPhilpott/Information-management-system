import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Music,
  ArrowLeft,
  Save,
  RotateCw,
  Check,
  AlertCircle,
  Sun,
  Moon,
  PlayCircle,
  Clock
} from 'lucide-react';

const WINDOWS = [
  { key: 'day', label: 'Day', days: 1 },
  { key: 'week', label: 'Week', days: 7 },
  { key: 'month', label: 'Month', days: 31 },
  { key: '6months', label: '6 Months', days: 183 },
  { key: 'year', label: 'Year', days: 366 }
];

export default function MusicScanPortal({
  theme = 'dark',
  onThemeToggle,
  currentPath = '/ims/musicscan',
  setCurrentPath
}) {
  const isDark = theme === 'dark';

  const [config, setConfig] = useState(null);
  const [draftConfig, setDraftConfig] = useState(null);
  const [status, setStatus] = useState({ state: 'idle' });
  const [isRunning, setIsRunning] = useState(false);
  const [nextRun, setNextRun] = useState(null);
  const [results, setResults] = useState({ results: [], lastScanCompleted: null, artistsScanned: 0 });
  const [selectedWindow, setSelectedWindow] = useState('week');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [notification, setNotification] = useState(null);
  const pollRef = useRef(null);

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
        setErrorMessage(null);
      }
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchResults = useCallback(async () => {
    try {
      const res = await fetch('/api/music-scan/results');
      const data = await res.json();
      if (data.success) setResults(data);
    } catch (_) { /* results are best-effort; status polling still works */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchResults();
  }, [fetchStatus, fetchResults]);

  // While a scan is running, poll every 3s to animate the progress bar; stop
  // as soon as it's no longer running and pull the fresh results once.
  useEffect(() => {
    if (isRunning) {
      pollRef.current = setInterval(fetchStatus, 3000);
      return () => clearInterval(pollRef.current);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      fetchResults();
    }
  }, [isRunning, fetchStatus, fetchResults]);

  const handleReturnHome = () => {
    window.history.pushState(null, '', '/ims');
    if (setCurrentPath) setCurrentPath('/ims');
    else window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/music-scan/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftConfig)
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

  const cutoffDate = (() => {
    const w = WINDOWS.find((x) => x.key === selectedWindow);
    const d = new Date();
    d.setDate(d.getDate() - w.days);
    return d.toISOString().slice(0, 10);
  })();

  const filteredResults = (results.results || []).filter(
    (r) => r.mostRecentReleaseDate && r.mostRecentReleaseDate >= cutoffDate
  );
  const groupedByGenre = filteredResults.reduce((acc, r) => {
    const g = r.genre || 'Unknown';
    (acc[g] = acc[g] || []).push(r);
    return acc;
  }, {});

  const progressPct = status.totalArtists > 0
    ? Math.round((status.currentIndex / status.totalArtists) * 100)
    : 0;

  const fieldClass = `w-full px-3 py-2 rounded-lg text-xs font-mono outline-none border ${
    isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/10 text-slate-900'
  }`;
  const labelClass = `text-[10px] font-bold uppercase tracking-wider mb-1 block ${isDark ? 'text-slate-400' : 'text-slate-600'}`;
  const panelClass = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;

  return (
    <div className={`min-h-screen w-full flex flex-col font-sans transition-colors duration-300 ${
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

      <header className={`px-6 py-4 flex items-center justify-between border-b backdrop-blur-xl sticky top-0 z-40 transition-colors duration-300 ${
        isDark ? 'bg-[#030712]/80 border-white/5' : 'bg-[#f4efed]/85 border-[#2E2B27]/10'
      }`}>
        <div className="flex items-center gap-4">
          <button
            onClick={handleReturnHome}
            className={`p-2 rounded-xl flex items-center gap-2 text-xs font-bold transition-all active:scale-95 ${
              isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5' : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-[#2E2B27] border border-[#2E2B27]/10'
            }`}
            title="Return to IMS Hub"
          >
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
              <span className="text-[10px] font-semibold text-slate-500 tracking-wider">
                /ims/musicscan • new releases missing from MUZAK
              </span>
            </div>
          </div>
        </div>
        {onThemeToggle && (
          <button
            onClick={onThemeToggle}
            className={`p-2 rounded-xl transition-all border ${
              isDark ? 'bg-white/5 hover:bg-white/10 text-amber-400 border-white/5' : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-slate-700 border-[#2E2B27]/10'
            }`}
            title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        )}
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-6 flex flex-col gap-5">
        {errorMessage && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-3">
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Status panel */}
        <div className={panelClass}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
              <RotateCw size={14} className={isRunning ? 'animate-spin text-amber-400' : 'opacity-60'} />
              Scan Status
            </h2>
            <button
              onClick={handleScanNow}
              disabled={isRunning}
              className="px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.25)] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <PlayCircle size={15} />
              <span>{isRunning ? 'Scanning...' : 'Scan Now'}</span>
            </button>
          </div>

          {isRunning ? (
            <div className="space-y-2">
              <div className={`w-full h-3 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-600 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                <span>{status.currentArtist ? `Checking "${status.currentArtist}"...` : 'Starting...'}</span>
                <span>{status.currentIndex || 0} / {status.totalArtists || 0} ({progressPct}%)</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-500">
              <span>State: <strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>{status.state || 'idle'}</strong></span>
              {results.lastScanCompleted && (
                <span>Last completed: <strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>{new Date(results.lastScanCompleted).toLocaleString('en-GB')}</strong></span>
              )}
              {results.artistsScanned > 0 && (
                <span>{results.artistsScanned} artists scanned, {results.artistsWithMissingReleases} with releases you don't have</span>
              )}
              {nextRun && (
                <span className="flex items-center gap-1">
                  <Clock size={11} /> Next run: <strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>{new Date(nextRun).toLocaleString('en-GB')}</strong>
                </span>
              )}
              {status.state === 'error' && status.lastError && (
                <span className="text-red-400">Error: {status.lastError}</span>
              )}
            </div>
          )}
        </div>

        {/* Results panel */}
        <div className={panelClass}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-black uppercase tracking-wider">New Releases You Don't Have</h2>
            <div className={`flex rounded-lg overflow-hidden border ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
              {WINDOWS.map((w) => (
                <button
                  key={w.key}
                  onClick={() => setSelectedWindow(w.key)}
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all ${
                    selectedWindow === w.key
                      ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white'
                      : isDark ? 'text-slate-400 hover:bg-white/5' : 'text-slate-600 hover:bg-black/5'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          {filteredResults.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No missing releases found in this window{results.lastScanCompleted ? '' : ' - run a scan to populate this.'}
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {Object.keys(groupedByGenre).sort().map((genre) => (
                <div key={genre}>
                  <h3 className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? 'text-amber-400/80' : 'text-orange-600'}`}>{genre}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {groupedByGenre[genre].sort((a, b) => a.artist.localeCompare(b.artist)).map((r) => (
                      <div key={r.artist} className={`p-3 rounded-xl border text-xs ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
                        <div className="font-bold mb-1">{r.artist}</div>
                        {r.releases.map((rel) => (
                          <div key={rel.title} className="text-[11px] text-slate-500 flex justify-between">
                            <span>{rel.title} <span className="opacity-60">({rel.type})</span></span>
                            <span className="opacity-70">{rel.year}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
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
              <button
                onClick={handleSave}
                disabled={!isDirty || isSaving}
                className="px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.25)] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSaving ? <RotateCw size={15} className="animate-spin" /> : <Save size={15} />}
                <span>{isSaving ? 'Saving...' : 'Save'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>MUZAK Network Path</label>
                <input
                  className={fieldClass}
                  value={draftConfig.muzak_path}
                  onChange={(e) => setDraftConfig({ ...draftConfig, muzak_path: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>Nightly Scan Time (Europe/London, HH:MM)</label>
                <input
                  className={fieldClass}
                  value={draftConfig.schedule_time}
                  onChange={(e) => setDraftConfig({ ...draftConfig, schedule_time: e.target.value })}
                  placeholder="01:00"
                />
              </div>
              <div>
                <label className={labelClass}>MusicBrainz Requests / Second</label>
                <input
                  type="number" step="0.1" min="0.1" max="1"
                  className={fieldClass}
                  value={draftConfig.rate_limit_per_sec}
                  onChange={(e) => setDraftConfig({ ...draftConfig, rate_limit_per_sec: parseFloat(e.target.value) || 1 })}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftConfig.schedule_enabled}
                    onChange={(e) => setDraftConfig({ ...draftConfig, schedule_enabled: e.target.checked })}
                  />
                  Nightly scan enabled
                </label>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Excluded Artists (comma-separated)</label>
                <textarea
                  className={`${fieldClass} min-h-[60px]`}
                  value={draftConfig.excluded_artists.join(', ')}
                  onChange={(e) => setDraftConfig({
                    ...draftConfig,
                    excluded_artists: e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                  })}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
