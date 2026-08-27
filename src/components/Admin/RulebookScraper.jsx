import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, Loader2, RefreshCw, FileText, CheckCircle2, AlertCircle, Terminal, Search, Zap, HelpCircle, Globe, Lock, Check } from 'lucide-react';

export function RulebookScraper() {
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState({ percent: 0, current: 0, total: 0 });
  const [games, setGames] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'downloaded' | 'notfound' | 'pending'
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [scrapingGame, setScrapingGame] = useState(null); // name of game running single deep scrape
  const [bggUsername, setBggUsername] = useState(localStorage.getItem('bgg_username') || '');
  const [bggPassword, setBggPassword] = useState(localStorage.getItem('bgg_password') || '');
  
  const terminalEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  const fetchGamesList = async () => {
    setIsLoadingFiles(true);
    try {
      const res = await fetch('/api/admin/rulebooks/list');
      const data = await res.json();
      if (data.games) {
        setGames(data.games);
      }
    } catch (err) {
      console.error('Failed to fetch games list:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const fetchInitialStatus = async () => {
    try {
      const res = await fetch('/api/admin/rulebooks/scrape/status');
      const data = await res.json();
      setIsRunning(data.active);
      if (data.logs) {
        setLogs(data.logs.map(l => l.text));
      }
    } catch (err) {
      console.error('Failed to fetch initial status:', err);
    }
  };

  const startScrape = async () => {
    localStorage.setItem('bgg_username', bggUsername);
    localStorage.setItem('bgg_password', bggPassword);
    
    try {
      const res = await fetch('/api/admin/rulebooks/scrape', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bggUsername, bggPassword })
      });
      const data = await res.json();
      if (data.error) {
        alert(`Error: ${data.error}`);
        return;
      }
      setIsRunning(true);
      setLogs(['[System] Requesting full scraper start...']);
      setProgress({ percent: 0, current: 0, total: 0 });
      setupEventSource();
    } catch (err) {
      alert(`Connection failed: ${err.message}`);
    }
  };

  const startSingleScrape = async (gameName, deep = false) => {
    if (isRunning) return;
    setScrapingGame(gameName);
    localStorage.setItem('bgg_username', bggUsername);
    localStorage.setItem('bgg_password', bggPassword);
    
    try {
      const res = await fetch('/api/admin/rulebooks/scrape/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameName, deep, bggUsername, bggPassword })
      });
      const data = await res.json();
      if (data.error) {
        alert(`Error: ${data.error}`);
        setScrapingGame(null);
        return;
      }
      setIsRunning(true);
      setLogs([`[System] Requesting single scrape for '${gameName}' (deep=${deep})...`]);
      setupEventSource();
    } catch (err) {
      alert(`Connection failed: ${err.message}`);
      setScrapingGame(null);
    }
  };

  const handleMarkAsFound = async (gameName) => {
    try {
      const response = await fetch('/api/admin/rulebooks/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: gameName, status: 'Downloaded', url: 'Manual' })
      });
      if (response.ok) {
        fetchGamesList();
      } else {
        alert('Failed to update status.');
      }
    } catch (err) {
      alert(`Error updating status: ${err.message}`);
    }
  };

  const stopScrape = async () => {
    try {
      const res = await fetch('/api/admin/rulebooks/scrape/stop', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      alert(`Connection failed: ${err.message}`);
    }
  };

  const setupEventSource = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const source = new EventSource('/api/admin/rulebooks/scrape/stream');
    eventSourceRef.current = source;

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'status') {
          setIsRunning(data.status === 'running');
          if (data.status === 'idle') {
            setScrapingGame(null);
            fetchGamesList();
          }
        } else if (data.type === 'log') {
          setLogs(prev => [...prev, data.text].slice(-500));
          if (data.text.includes('BGG login failed')) {
            window.open('https://boardgamegeek.com/login', '_blank');
          }
        } else if (data.type === 'progress') {
          setProgress({ percent: data.progress, current: data.current, total: data.total });
        }
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    source.onerror = () => {
      console.warn('Scraper EventSource encountered an error, reconnecting...');
    };
  };

  useEffect(() => {
    fetchInitialStatus();
    fetchGamesList();
    setupEventSource();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Filter games based on search query and status tab filter
  const filteredGames = games.filter(g => {
    const matchesSearch = g.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (statusFilter === 'all') return matchesSearch;
    if (statusFilter === 'downloaded') {
      return matchesSearch && (g.status === 'Downloaded' || g.status === 'Already Exists');
    }
    if (statusFilter === 'notfound') {
      return matchesSearch && g.status === 'Not Found';
    }
    if (statusFilter === 'pending') {
      return matchesSearch && g.status === 'Pending';
    }
    return matchesSearch;
  });

  const getStatusBadge = (status) => {
    if (status === 'Downloaded' || status === 'Already Exists') {
      return (
        <span className="flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
          <CheckCircle2 size={10} />
          Found
        </span>
      );
    }
    if (status === 'Not Found') {
      return (
        <span className="flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/25">
          <AlertCircle size={10} />
          Not Found
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/25">
        <HelpCircle size={10} />
        Pending
      </span>
    );
  };

  const getLogColorClass = (text) => {
    const lower = text.toLowerCase();
    if (lower.includes('success') || lower.includes('downloaded') || lower.includes('authenticated')) {
      return 'text-emerald-400';
    }
    if (lower.includes('warning') || lower.includes('failed') || lower.includes('could not find')) {
      return 'text-amber-400';
    }
    if (lower.includes('error') || lower.includes('exception')) {
      return 'text-red-400';
    }
    if (text.startsWith('[System]')) {
      return 'text-cyan-400';
    }
    return 'text-zinc-300';
  };

  const successCount = games.filter(g => g.status === 'Downloaded' || g.status === 'Already Exists').length;

  return (
    <div className="space-y-6 pb-20">
      {/* Introduction Card */}
      <div className="bg-[var(--accent-cyan)]/5 border border-[var(--accent-cyan)]/25 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Terminal size={16} className="text-[var(--accent-cyan)]" />
            <span>Rulebook Search & Downloader</span>
          </h3>
          <p className="text-[11px] text-[var(--text-secondary)]">
            Scrapes board game rulebooks in PDF format from publishers and BGG user-uploaded files using Gemini Grounding search.
          </p>
        </div>
        
        <div className="flex gap-2">
          {isRunning ? (
            <button 
              onClick={stopScrape}
              className="px-5 py-2.5 rounded-xl text-xs font-bold transition-all border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white flex items-center gap-2 cursor-pointer"
            >
              <Square size={14} />
              <span>Stop Scraper</span>
            </button>
          ) : (
            <button 
              onClick={startScrape}
              className="px-5 py-2.5 rounded-xl text-xs font-bold transition-all border bg-[var(--accent-cyan)]/10 border-[var(--accent-cyan)]/30 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)] hover:text-black flex items-center gap-2 cursor-pointer"
            >
              <Play size={14} />
              <span>Run Full Scrape</span>
            </button>
          )}
          <button 
            onClick={fetchGamesList}
            className="p-2.5 rounded-xl border border-[var(--glass-border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] cursor-pointer"
            title="Refresh List"
          >
            <RefreshCw size={14} className={isLoadingFiles ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* BoardGameGeek Credentials Panel */}
      <div className="p-6 bg-[var(--bg-secondary)]/30 backdrop-blur-xl border border-[var(--glass-border)] rounded-2xl space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-2">
            <Globe size={14} className="text-[var(--accent-cyan)]" /> BoardGameGeek Integration
          </h4>
          <button 
            type="button"
            onClick={() => window.open('https://boardgamegeek.com/login', '_blank')}
            className="px-4 py-2 bg-[var(--bg-primary)]/50 border border-[var(--glass-border)] hover:border-[var(--accent-cyan)]/45 text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Globe size={12} />
            <span>Open BGG Login Page</span>
          </button>
        </div>
        <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
          Provide your BGG credentials to search and download official rulebooks from BGG's user-uploaded files section (restricted to English files only). Credentials are saved locally on your device.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-wider">BGG Username</label>
            <input 
              type="text"
              className="w-full bg-[var(--bg-primary)]/50 border border-[var(--glass-border)] rounded-xl py-2.5 px-3 text-xs outline-none focus:border-[var(--accent-cyan)]/30 transition-all text-[var(--text-primary)]"
              placeholder="Username"
              value={bggUsername}
              onChange={(e) => setBggUsername(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-wider">BGG Password</label>
            <input 
              type="password"
              className="w-full bg-[var(--bg-primary)]/50 border border-[var(--glass-border)] rounded-xl py-2.5 px-3 text-xs outline-none focus:border-[var(--accent-cyan)]/30 transition-all text-[var(--text-primary)]"
              placeholder="Password"
              value={bggPassword}
              onChange={(e) => setBggPassword(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Progress Section */}
      {isRunning && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="p-6 bg-[var(--bg-secondary)]/50 backdrop-blur-xl border border-[var(--glass-border)] rounded-2xl space-y-4 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="text-[var(--accent-cyan)] animate-spin" />
              <span className="text-[10px] font-black uppercase text-[var(--text-primary)] tracking-widest">
                {scrapingGame ? `Scraping: ${scrapingGame}` : 'Scraping Progress'}
              </span>
            </div>
            {progress.total > 0 && !scrapingGame && (
              <span className="text-[10px] font-mono font-bold text-[var(--accent-cyan)]">
                {progress.current} / {progress.total} ({progress.percent}%)
              </span>
            )}
          </div>
          {!scrapingGame && (
            <div className="h-2 w-full bg-[var(--bg-primary)] rounded-full overflow-hidden border border-[var(--glass-border)]">
              <motion.div 
                style={{ width: `${progress.percent}%`, background: 'var(--gradient-primary)' }}
                className="h-full rounded-full shadow-[var(--shadow-glow)]" 
              />
            </div>
          )}
        </motion.div>
      )}

      {/* Scraper Terminal Output */}
      <div className="p-6 bg-black/60 border border-[var(--glass-border)] rounded-2xl flex flex-col h-[280px]">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-muted)] mb-3 flex items-center gap-2">
          <Terminal size={12} className="text-[var(--text-muted)]" /> Live Console Output
        </h4>
        <div className="flex-1 bg-black/40 border border-[var(--glass-border)] rounded-xl p-4 font-mono text-[10px] text-zinc-300 overflow-y-auto space-y-1.5 custom-scrollbar">
          {logs.length > 0 ? (
            logs.map((log, index) => (
              <div key={index} className={`whitespace-pre-wrap leading-relaxed border-b border-white/[0.02] pb-1 font-mono ${getLogColorClass(log)}`}>{log}</div>
            ))
          ) : (
            <div className="text-[var(--text-muted)] italic text-center py-16">
              Console idle. Select "Run Full Scrape" or start a "Deep Scrape" on a single game below.
            </div>
          )}
          <div ref={terminalEndRef} />
        </div>
      </div>

      {/* Games Catalog List Section */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[var(--glass-border)] pb-3">
          <div className="flex items-center gap-3">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-muted)]">
              Games Catalog ({filteredGames.length}/{games.length})
            </h4>
            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/10">
              {successCount} found
            </span>
          </div>

          {/* Status filters */}
          <div className="flex bg-[var(--bg-elevated)] p-[2px] rounded-lg border border-[var(--glass-border)] text-[9px] font-bold uppercase tracking-wider gap-[2px]">
            {['all', 'downloaded', 'notfound', 'pending'].map(tab => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 rounded transition-all cursor-pointer ${
                  statusFilter === tab 
                    ? 'bg-[var(--accent-cyan)]/25 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30' 
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Search game catalog */}
        <div className="relative">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input 
            className="w-full bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-xl py-3 pl-12 pr-4 text-xs outline-none focus:border-[var(--accent-cyan)]/30 transition-all placeholder:text-[var(--text-muted)] text-[var(--text-primary)]"
            placeholder="Search catalog titles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Game results list grid */}
        {filteredGames.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto custom-scrollbar pr-2">
            {filteredGames.map(game => {
              const isDownloaded = game.status === 'Downloaded' || game.status === 'Already Exists';
              const isScrapingThis = scrapingGame === game.name;

              return (
                <div 
                  key={game.name} 
                  className="p-4 bg-[var(--bg-elevated)]/60 border border-[var(--glass-border)] rounded-xl flex items-center justify-between hover:border-[var(--glass-border-hover)] transition-all gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText size={16} className={`shrink-0 ${isDownloaded ? 'text-[var(--accent-cyan)]' : 'text-[var(--text-muted)]'}`} />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[11px] font-bold text-[var(--text-primary)] truncate" title={game.name}>
                        {game.name}
                      </span>
                      {game.url && isDownloaded && (
                        <a 
                          href={game.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-[9px] text-[var(--accent-cyan)] truncate hover:underline"
                        >
                          Source URL
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {getStatusBadge(game.status)}

                    {!isDownloaded && (
                      <>
                        <button
                          onClick={() => handleMarkAsFound(game.name)}
                          className="p-2 rounded-lg border border-[var(--glass-border)] bg-[var(--bg-primary)] hover:border-emerald-500/50 text-[var(--text-secondary)] hover:text-emerald-400 transition-all cursor-pointer flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider"
                          title="Manually set status to Downloaded/Found"
                        >
                          <Check size={12} />
                          <span>Mark Found</span>
                        </button>
                        <button
                          onClick={() => startSingleScrape(game.name, true)}
                          disabled={isRunning || isScrapingThis}
                          className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider ${
                            isScrapingThis
                              ? 'bg-[var(--accent-cyan)]/15 border-[var(--accent-cyan)]/30 text-[var(--accent-cyan)]'
                              : isRunning
                              ? 'opacity-40 cursor-not-allowed border-[var(--glass-border)] text-[var(--text-muted)]'
                              : 'bg-[var(--bg-primary)] border-[var(--glass-border)] hover:border-[var(--accent-cyan)] text-[var(--text-secondary)] hover:text-[var(--accent-cyan)]'
                          }`}
                          title="Run Deep Search Scrape using Publisher Info"
                        >
                          {isScrapingThis ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Zap size={12} />
                          )}
                          <span>Deep Scrape</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-12 text-center text-[var(--text-muted)] text-[10px] italic border border-dashed border-[var(--glass-border)] rounded-xl">
            No games match the current search or filters.
          </div>
        )}
      </div>
    </div>
  );
}
