import AccountChip from './AccountChip';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Music, ArrowLeft, Save, RotateCw, Check, AlertCircle, Sun, Moon,
  PlayCircle, Clock, ChevronRight, ChevronDown, Pencil, X, Search, Disc3, Star,
  Headphones, Sparkles, Folder, FolderOpen, Link2, EyeOff, Eye, CheckCircle2,
  ExternalLink, Edit3, AlertTriangle, HelpCircle, FileText
} from 'lucide-react';

const VIEWS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: '6months', label: '6 Months' },
  { key: 'year', label: 'Year' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'wants', label: 'Want list' },
  { key: 'discover', label: 'Discover' },
  { key: 'audit', label: 'Audit' },
  { key: 'all', label: 'All Artists' }
];

const UP_RANGES = [
  { key: 'week', label: 'Next 7 days' },
  { key: 'month', label: 'Next month' },
  { key: 'all', label: 'All announced' }
];

// Search links to hear a release: MusicBrainz has no audio, so these open the services' own search.
function ListenLinks({ artist, title }) {
  const q = encodeURIComponent(`${artist} ${title || ''}`.trim());
  const cls = 'px-1.5 py-0.5 rounded text-[9px] font-black uppercase border border-current opacity-70 hover:opacity-100 transition-opacity';
  return (
    <span className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
      <a className={`${cls} text-emerald-500`} href={`https://open.spotify.com/search/${q}`} target="_blank" rel="noreferrer" title="Search on Spotify">Spotify</a>
      <a className={`${cls} text-red-500`} href={`https://www.youtube.com/results?search_query=${q}`} target="_blank" rel="noreferrer" title="Search on YouTube">YouTube</a>
    </span>
  );
}

const wantId = (artist, title) => `${String(artist).toLowerCase()}|${String(title).toLowerCase()}`;

function StarButton({ on, onClick }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={on ? 'Remove from want list' : 'Add to want list'}
      className={`p-1 rounded shrink-0 transition-colors ${on ? 'text-amber-400' : 'text-slate-500 hover:text-amber-400'}`}
    >
      <Star size={13} fill={on ? 'currentColor' : 'none'} />
    </button>
  );
}

function inUpcomingRange(r, range, today) {
  if (range === 'all') return true;
  const days = range === 'week' ? 7 : 31;
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + days);
  const endStr = end.toISOString().slice(0, 10);
  if (r.precision === 'day') return r.date > today && r.date <= endStr;
  if (r.precision === 'month') return range === 'month' && r.date <= endStr.slice(0, 7);
  return false;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(date, precision) {
  if (!date) return 'Date unknown';
  const [y, m, d] = date.split('-');
  if (precision === 'day') return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
  if (precision === 'month') return `${MONTHS[Number(m) - 1]} ${y}`;
  return y;
}

/* -------------------------------------------------------------------------- */
/* Modal: MusicBrainz Fuzzy Search & Align                                     */
/* -------------------------------------------------------------------------- */
function MusicBrainzSearchModal({ artistName, genre, isDark, onClose, onAligned, showToast }) {
  const [query, setQuery] = useState(artistName || '');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [busyAction, setBusyAction] = useState(null);

  const runSearch = useCallback(async (searchQ) => {
    if (!searchQ || !searchQ.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/music-scan/musicbrainz/search?q=${encodeURIComponent(searchQ.trim())}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'MusicBrainz search failed.');
      setResults(data.artists || []);
      setHasSearched(true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (artistName) {
      runSearch(artistName);
    }
  }, [artistName, runSearch]);

  const handleApplyOverride = async (targetMbName, targetMbId = null) => {
    setBusyAction(targetMbName);
    try {
      const res = await fetch('/api/music-scan/artist/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: artistName,
          searchName: targetMbName,
          mbId: targetMbId || undefined,
          aliases: []
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update search name.');
      
      await fetch('/api/music-scan/artist/rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: artistName })
      });

      showToast(`Matched "${artistName}" to MusicBrainz artist "${targetMbName}" and rescanned.`);
      onAligned(targetMbName);
      onClose();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRenameFolder = async (targetMbName) => {
    if (!window.confirm(`Rename folder "${artistName}" on disk to "${targetMbName}"?`)) return;
    setBusyAction(`rename-${targetMbName}`);
    try {
      const res = await fetch('/api/music-scan/artist/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ genre, oldArtist: artistName, newArtist: targetMbName })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to rename artist folder.');
      showToast(`Renamed folder to "${targetMbName}" and rescanned.`);
      onAligned(targetMbName);
      onClose();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className={`w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
        isDark ? 'bg-slate-900 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/15 text-slate-900'
      }`}>
        <div className={`px-5 py-4 border-b flex items-center justify-between ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-500">
              <Search size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider">MusicBrainz Search &amp; Alignment</h3>
              <p className="text-[11px] text-slate-500">Find canonical match for folder: <strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>{artistName}</strong></p>
            </div>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-4">
          <form onSubmit={(e) => { e.preventDefault(); runSearch(query); }} className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
              <input
                className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs outline-none border ${
                  isDark ? 'bg-slate-950/70 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/15 text-slate-900'
                }`}
                placeholder="Search MusicBrainz by name..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white active:scale-95 disabled:opacity-50"
            >
              {loading ? <RotateCw size={13} className="animate-spin" /> : <Search size={13} />}
              <span>Search</span>
            </button>
          </form>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <RotateCw size={20} className="animate-spin text-amber-500" />
              <span className="text-xs text-slate-500">Querying MusicBrainz Lucene database...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              {hasSearched ? 'No close artist matches found on MusicBrainz.' : 'Enter a query and press Search.'}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Top Matches ({results.length})
              </div>
              {results.map((r) => (
                <div
                  key={r.id || r.name}
                  className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isDark ? 'bg-slate-950/50 border-white/5 hover:border-amber-500/30' : 'bg-slate-50/80 border-[#2E2B27]/10 hover:border-amber-500/40'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs">{r.name}</span>
                      {r.type && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-500/20 text-slate-400">{r.type}</span>}
                      {r.country && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-500/20 text-amber-400">{r.country}</span>}
                      {r.score && <span className="text-[10px] text-slate-500">Score: {r.score}%</span>}
                    </div>
                    {r.disambiguation && (
                      <p className="text-[11px] text-slate-500 mt-0.5 italic">{r.disambiguation}</p>
                    )}
                    {r.id && (
                      <p className="text-[10px] text-slate-500 mt-0.5 font-mono">MBID: {r.id}</p>
                    )}
                    {r.aliases?.length > 0 && (
                      <p className="text-[10px] text-slate-500 mt-0.5 truncate">Aliases: {r.aliases.slice(0, 4).join(', ')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleApplyOverride(r.name, r.id)}
                      disabled={busyAction !== null}
                      title="Keep folder name as-is, but link to this MusicBrainz artist MBID & name"
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        isDark ? 'border-white/10 hover:bg-white/10 text-slate-200' : 'border-[#2E2B27]/15 hover:bg-black/5 text-slate-800'
                      }`}
                    >
                      {busyAction === r.name ? <RotateCw size={12} className="animate-spin" /> : 'Set MBID & Search Name'}
                    </button>
                    <button
                      onClick={() => handleRenameFolder(r.name)}
                      disabled={busyAction !== null}
                      title="Rename the local folder on disk to match this canonical name"
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition-all"
                    >
                      {busyAction === `rename-${r.name}` ? <RotateCw size={12} className="animate-spin" /> : 'Rename Folder'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal: Artist Folder Browser & Linking / Renaming                          */
/* -------------------------------------------------------------------------- */
function FolderBrowserModal({
  artistName,
  genre,
  targetRelease = null, // if opened for a specific release linking/renaming
  isDark,
  onClose,
  onUpdated,
  showToast
}) {
  const [loading, setLoading] = useState(true);
  const [folderData, setFolderData] = useState(null);
  const [activeTab, setActiveTab] = useState('browse'); // 'browse' | 'rename-folder' | 'rename-artist'
  const [selectedFolder, setSelectedFolder] = useState('');
  const [newAlbumFolderName, setNewAlbumFolderName] = useState('');
  const [newArtistFolderName, setNewArtistFolderName] = useState(artistName || '');
  const [busy, setBusy] = useState(false);

  const fetchContents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/music-scan/artist/folder?artist=${encodeURIComponent(artistName)}&genre=${encodeURIComponent(genre || '')}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to inspect artist folder.');
      setFolderData(data);
      if (targetRelease?.title) {
        setNewAlbumFolderName(targetRelease.title);
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [artistName, genre, targetRelease, showToast]);

  useEffect(() => {
    fetchContents();
  }, [fetchContents]);

  const handleLinkFolder = async (folderNameToLink) => {
    if (!targetRelease?.title) {
      showToast('Select an album to link to this folder.', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/music-scan/album/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistName,
          releaseTitle: targetRelease.title,
          folderName: folderNameToLink
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to link album.');
      showToast(`Linked "${targetRelease.title}" to folder "${folderNameToLink}". Marked as owned.`);
      onUpdated();
      onClose();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRenameAlbumFolder = async () => {
    if (!selectedFolder || !newAlbumFolderName.trim()) {
      showToast('Please select a folder and enter the new folder name.', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/music-scan/album/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          genre: folderData.genre,
          artist: artistName,
          oldFolder: selectedFolder,
          newFolder: newAlbumFolderName.trim()
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to rename album folder.');
      showToast(`Renamed album folder to "${newAlbumFolderName.trim()}" and rescanned.`);
      onUpdated();
      onClose();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRenameArtistFolder = async () => {
    if (!newArtistFolderName.trim() || newArtistFolderName.trim() === artistName) {
      showToast('Please specify a different new artist folder name.', 'error');
      return;
    }
    if (!window.confirm(`Rename artist folder "${artistName}" to "${newArtistFolderName.trim()}" on network drive?`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/music-scan/artist/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          genre: folderData.genre,
          oldArtist: artistName,
          newArtist: newArtistFolderName.trim()
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to rename artist folder.');
      showToast(`Renamed artist folder to "${newArtistFolderName.trim()}".`);
      onUpdated();
      onClose();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const fieldClass = `w-full px-3 py-2 rounded-xl text-xs outline-none border ${
    isDark ? 'bg-slate-950/70 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/15 text-slate-900'
  }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className={`w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
        isDark ? 'bg-slate-900 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/15 text-slate-900'
      }`}>
        <div className={`px-5 py-4 border-b flex items-center justify-between ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-500">
              <FolderOpen size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider">
                Artist Folder: {artistName}
              </h3>
              <p className="text-[11px] text-slate-500 truncate max-w-md">
                {folderData?.folderPath || `Scanning \\Sideburnt\\NorthField\\MUZAK\\${genre || '...'}\\${artistName}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>
            <X size={16} />
          </button>
        </div>

        {/* Tab Selector */}
        <div className={`px-5 pt-3 flex items-center gap-2 border-b text-xs font-bold ${isDark ? 'border-white/5' : 'border-[#2E2B27]/5'}`}>
          <button
            onClick={() => setActiveTab('browse')}
            className={`pb-2 px-1 border-b-2 transition-all ${
              activeTab === 'browse' ? 'border-amber-500 text-amber-500' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Folder Contents ({folderData?.subfolders?.length || 0} subfolders)
          </button>
          <button
            onClick={() => setActiveTab('rename-folder')}
            className={`pb-2 px-1 border-b-2 transition-all ${
              activeTab === 'rename-folder' ? 'border-amber-500 text-amber-500' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Rename Album Folder
          </button>
          <button
            onClick={() => setActiveTab('rename-artist')}
            className={`pb-2 px-1 border-b-2 transition-all ${
              activeTab === 'rename-artist' ? 'border-amber-500 text-amber-500' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            Rename Artist Directory
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <RotateCw size={20} className="animate-spin text-amber-500" />
              <span className="text-xs text-slate-500">Reading directory contents from network drive...</span>
            </div>
          ) : !folderData?.exists ? (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              Folder does not exist on disk at path: <code className="block mt-1 font-mono">{folderData?.folderPath}</code>
            </div>
          ) : (
            <>
              {targetRelease && (
                <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                  isDark ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}>
                  <div className="text-xs">
                    <span className="text-[10px] uppercase font-black block tracking-wider opacity-70">Target Release To Link</span>
                    <strong>{targetRelease.title}</strong> ({targetRelease.type || 'Album'}, {targetRelease.date || 'unknown date'})
                  </div>
                  <button
                    onClick={() => handleLinkFolder(artistName)}
                    disabled={busy}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm flex items-center gap-1.5 shrink-0"
                    title="Mark owned by linking directly to artist folder / loose tracks"
                  >
                    <CheckCircle2 size={13} />
                    <span>Link to Artist Root</span>
                  </button>
                </div>
              )}

              {activeTab === 'browse' && (
                <div className="flex flex-col gap-3">
                  {folderData.subfolders.length === 0 ? (
                    <div className="p-4 rounded-xl border text-center text-xs text-slate-500">
                      No subfolders found inside artist folder. Songs may be loose audio files in root.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Album Subfolders
                      </div>
                      {folderData.subfolders.map((f) => (
                        <div
                          key={f.name}
                          className={`px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs transition-colors ${
                            selectedFolder === f.name
                              ? 'border-amber-500 bg-amber-500/10'
                              : isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-[#2E2B27]/10'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Folder size={14} className="text-amber-500 shrink-0" />
                            <span className="font-semibold truncate">{f.name}</span>
                            <span className="text-[10px] text-slate-500 shrink-0">({f.audioFilesCount} tracks)</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {targetRelease && (
                              <button
                                onClick={() => handleLinkFolder(f.name)}
                                disabled={busy}
                                className="px-2 py-1 rounded-lg text-[11px] font-bold bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1"
                              >
                                <Link2 size={12} />
                                <span>Link This</span>
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setSelectedFolder(f.name);
                                setNewAlbumFolderName(targetRelease?.title || f.name);
                                setActiveTab('rename-folder');
                              }}
                              className={`p-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
                                isDark ? 'border-white/10 hover:bg-white/10' : 'border-[#2E2B27]/10 hover:bg-black/5'
                              }`}
                              title="Rename this folder"
                            >
                              <Edit3 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {folderData.looseAudioFiles.length > 0 && (
                    <div className="flex flex-col gap-1.5 mt-2">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Loose Audio Tracks In Root ({folderData.looseAudioFiles.length})
                      </div>
                      <div className={`p-2.5 rounded-xl border max-h-36 overflow-y-auto font-mono text-[11px] space-y-0.5 ${
                        isDark ? 'bg-slate-950/60 border-white/5 text-slate-400' : 'bg-slate-100 border-[#2E2B27]/10 text-slate-700'
                      }`}>
                        {folderData.looseAudioFiles.map((file, idx) => (
                          <div key={idx} className="truncate flex items-center gap-1.5">
                            <Music size={11} className="shrink-0 opacity-50" />
                            <span>{file}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'rename-folder' && (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">
                      Select Folder to Rename
                    </label>
                    <select
                      className={fieldClass}
                      value={selectedFolder}
                      onChange={(e) => {
                        setSelectedFolder(e.target.value);
                        if (!newAlbumFolderName) setNewAlbumFolderName(e.target.value);
                      }}
                    >
                      <option value="">-- Choose a subfolder --</option>
                      {folderData.subfolders.map((f) => (
                        <option key={f.name} value={f.name}>{f.name} ({f.audioFilesCount} tracks)</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">
                      New Folder Name on Network Drive
                    </label>
                    <input
                      className={fieldClass}
                      value={newAlbumFolderName}
                      placeholder="e.g. The Union of Souls"
                      onChange={(e) => setNewAlbumFolderName(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={handleRenameAlbumFolder}
                    disabled={busy || !selectedFolder || !newAlbumFolderName.trim()}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white active:scale-95 disabled:opacity-50"
                  >
                    {busy ? <RotateCw size={14} className="animate-spin" /> : <Edit3 size={14} />}
                    <span>Rename Folder &amp; Rescan</span>
                  </button>
                </div>
              )}

              {activeTab === 'rename-artist' && (
                <div className="flex flex-col gap-3">
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                    This will rename the folder <code>{artistName}</code> under <code>{folderData.genre}</code> on the network drive and migrate any custom search overrides.
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">
                      New Artist Folder Name
                    </label>
                    <input
                      className={fieldClass}
                      value={newArtistFolderName}
                      placeholder={artistName}
                      onChange={(e) => setNewArtistFolderName(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={handleRenameArtistFolder}
                    disabled={busy || !newArtistFolderName.trim() || newArtistFolderName.trim() === artistName}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white active:scale-95 disabled:opacity-50"
                  >
                    {busy ? <RotateCw size={14} className="animate-spin" /> : <FolderOpen size={14} />}
                    <span>Rename Artist Directory &amp; Rescan</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Component: ArtistCard with Linking & Actions                               */
/* -------------------------------------------------------------------------- */
function ArtistCard({
  artist,
  isDark,
  onChanged,
  showToast,
  wantSet = new Set(),
  onToggleWant = () => {},
  onOpenFolderBrowser = () => {},
  onOpenMbSearch = () => {}
}) {
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

  const handleHideArtist = async (e) => {
    e.stopPropagation();
    if (!window.confirm(`Hide artist "${artist.name}" from future music scans?`)) return;
    try {
      const res = await fetch('/api/music-scan/artist/hide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: artist.name, hidden: true })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to hide artist.');
      showToast(`Hidden "${artist.name}" from music scanner.`);
      onChanged();
    } catch (err) {
      showToast(err.message, 'error');
    }
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

  const handleToggleFavourite = async (e) => {
    e.stopPropagation();
    try {
      const res = await fetch('/api/music-scan/artist/favourite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: artist.name, favourite: !Boolean(artist.favourite) })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update favourite.');
      showToast(!artist.favourite ? `Added "${artist.name}" to favourites.` : `Removed "${artist.name}" from favourites.`);
      onChanged();
    } catch (err) {
      showToast(err.message, 'error');
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
    <div className={`rounded-xl border text-xs transition-colors ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
      <div
        role="button" tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen(!open); }}
        className="w-full px-3 py-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 cursor-pointer text-left"
      >
        <button
          onClick={handleToggleFavourite}
          title={artist.favourite ? 'Remove from favourite artists' : 'Add to favourite artists'}
          className={`p-1 rounded transition-colors shrink-0 ${artist.favourite ? 'text-amber-400' : 'text-slate-500 hover:text-amber-400'}`}
        >
          <Star size={14} fill={artist.favourite ? 'currentColor' : 'none'} />
        </button>
        {open ? <ChevronDown size={14} className="shrink-0 opacity-60" /> : <ChevronRight size={14} className="shrink-0 opacity-60" />}
        <span className="font-bold min-w-0 flex-1 basis-40 break-words flex items-center gap-1.5">
          <span>{artist.name}</span>
          {artist.favourite && (
            <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
              Fav
            </span>
          )}
        </span>
        <span className={`hidden sm:inline text-[10px] uppercase tracking-wider ${GREY}`}>{artist.genre}</span>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-x-2.5 gap-y-0.5 text-[11px] font-semibold">
          <span className={GREEN}>{owned} owned</span>
          <span className={RED}>{notOwned} not owned</span>
          {unlistedCount > 0 && <span className={GREY}>{unlistedCount} unlisted</span>}
          
          <div className="flex items-center gap-1 border-l pl-2 border-slate-500/20" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onOpenFolderBrowser(artist, null)}
              title="Open artist folder / rename folders"
              className={`p-1 rounded ${isDark ? 'hover:bg-white/10 text-slate-300' : 'hover:bg-black/5 text-slate-600'}`}
            >
              <FolderOpen size={12} />
            </button>
            <button
              onClick={() => onOpenMbSearch(artist)}
              title="Check MusicBrainz for closest match"
              className={`p-1 rounded ${isDark ? 'hover:bg-white/10 text-amber-400' : 'hover:bg-black/5 text-amber-600'}`}
            >
              <Search size={12} />
            </button>
            <button
              onClick={startEdit}
              title="Edit name / pseudonyms"
              className={`p-1 rounded ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={handleHideArtist}
              title="Hide artist from music scanner"
              className={`p-1 rounded ${isDark ? 'hover:bg-red-500/20 text-red-400' : 'hover:bg-red-500/10 text-red-600'}`}
            >
              <EyeOff size={12} />
            </button>
          </div>
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
                  className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white active:scale-95 disabled:opacity-50"
                >
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
            <div className="flex flex-col gap-1">
              {detail.releases.map((r, i) => (
                <div key={`${r.title}-${r.date}-${i}`} className={`flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 px-2 rounded-lg transition-colors ${
                  r.isNew ? (isDark ? 'bg-amber-500/10' : 'bg-amber-100/60') : (isDark ? 'hover:bg-white/5' : 'hover:bg-black/5')
                }`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${r.owned ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <span className={`font-semibold min-w-0 flex-1 basis-48 break-words ${r.owned ? GREEN : RED}`}>{r.title}</span>
                  <span className="opacity-50 text-[10px] shrink-0">{r.type}</span>
                  {r.isNew && <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500 text-white shrink-0">New</span>}
                  
                  <span className={`shrink-0 tabular-nums ${r.owned ? GREEN : RED} opacity-80 text-[11px]`}>
                    {fmtDate(r.date, r.precision)}
                  </span>
                  
                  <div className="ml-auto flex items-center gap-1.5 shrink-0">
                    {!r.owned && (
                      <button
                        onClick={() => onOpenFolderBrowser(artist, r)}
                        title="Link to existing folder or rename folder to match this album"
                        className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 border transition-colors ${
                          isDark ? 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10' : 'border-amber-600/40 text-amber-700 hover:bg-amber-50'
                        }`}
                      >
                        <Link2 size={11} />
                        <span>Link / Rename</span>
                      </button>
                    )}
                    <ListenLinks artist={detail.mbName || artist.name} title={r.title} />
                    {!r.owned && <StarButton on={wantSet.has(wantId(artist.name, r.title))} onClick={() => onToggleWant({ artist: artist.name, ...r })} />}
                  </div>
                </div>
              ))}
              
              {detail.unlistedAlbums.map((title) => (
                <div key={`u-${title}`} className="flex items-center gap-2 py-1.5 px-2 rounded-lg opacity-80">
                  <span className="w-2 h-2 rounded-full shrink-0 bg-slate-500" />
                  <span className={`font-semibold min-w-0 flex-1 truncate ${GREY}`}>{title}</span>
                  <span className="opacity-50 text-[10px] shrink-0">Local folder not matched on MusicBrainz</span>
                  <button
                    onClick={() => onOpenFolderBrowser(artist, { title })}
                    title="Rename this folder or inspect contents"
                    className={`p-1 rounded ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}
                  >
                    <Edit3 size={11} />
                  </button>
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

/* -------------------------------------------------------------------------- */
/* Component: Audit View                                                      */
/* -------------------------------------------------------------------------- */
function AuditView({
  isDark,
  showToast,
  onRefresh,
  onOpenFolderBrowser,
  onOpenMbSearch
}) {
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [auditSubTab, setAuditSubTab] = useState('unmatched'); // 'unmatched' | 'missing' | 'hidden'
  const [searchFilter, setSearchFilter] = useState('');

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/music-scan/audit');
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load audit data.');
      setAuditData(data);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const handleUnhideArtist = async (name) => {
    try {
      const res = await fetch('/api/music-scan/artist/hide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, hidden: false })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to unhide artist.');
      showToast(`Restored "${name}" to music scanner.`);
      fetchAudit();
      onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleHideArtist = async (name) => {
    try {
      const res = await fetch('/api/music-scan/artist/hide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, hidden: true })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to hide artist.');
      showToast(`Hidden "${name}" from music scanner.`);
      fetchAudit();
      onRefresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const unmatchedFiltered = (auditData?.unmatchedArtists || []).filter((a) => {
    const q = searchFilter.trim().toLowerCase();
    return !q || a.name.toLowerCase().includes(q) || a.genre?.toLowerCase().includes(q);
  });

  const missingFiltered = (auditData?.missingReleases || []).filter((a) => {
    const q = searchFilter.trim().toLowerCase();
    return !q || a.name.toLowerCase().includes(q) || a.genre?.toLowerCase().includes(q);
  });

  const hiddenFiltered = (auditData?.hiddenArtists || []).filter((a) => {
    const q = searchFilter.trim().toLowerCase();
    return !q || a.name.toLowerCase().includes(q) || a.genre?.toLowerCase().includes(q);
  });

  const fieldClass = `w-full px-3 py-2 rounded-xl text-xs outline-none border ${
    isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/10 text-slate-900'
  }`;

  return (
    <div className="flex flex-col gap-4">
      {/* Sub tabs & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={`flex rounded-xl border p-1 ${isDark ? 'border-white/10 bg-slate-950/40' : 'border-[#2E2B27]/10 bg-slate-100'}`}>
          <button
            onClick={() => setAuditSubTab('unmatched')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              auditSubTab === 'unmatched'
                ? 'bg-red-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Unmatched Artists ({auditData?.summary?.unmatchedCount || 0})
          </button>
          <button
            onClick={() => setAuditSubTab('missing')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              auditSubTab === 'missing'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Missing Releases ({auditData?.summary?.missingReleasesArtistCount || 0})
          </button>
          <button
            onClick={() => setAuditSubTab('hidden')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              auditSubTab === 'hidden'
                ? 'bg-slate-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Hidden Folders ({auditData?.summary?.hiddenCount || 0})
          </button>
        </div>

        <button
          onClick={fetchAudit}
          disabled={loading}
          className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors ${
            isDark ? 'border-white/10 hover:bg-white/10 text-slate-300' : 'border-[#2E2B27]/10 hover:bg-black/5 text-slate-700'
          }`}
          title="Refresh audit findings"
        >
          <RotateCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Audit</span>
        </button>
      </div>

      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
        <input
          className={`${fieldClass} pl-8 font-sans`}
          placeholder={`Filter audit list...`}
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-2">
          <RotateCw size={20} className="animate-spin text-amber-500" />
          <span className="text-xs text-slate-500">Auditing MUZAK library against MusicBrainz scan cache...</span>
        </div>
      ) : auditSubTab === 'unmatched' ? (
        unmatchedFiltered.length === 0 ? (
          <div className="p-8 rounded-xl border text-center text-xs text-slate-500">
            {searchFilter ? 'No unmatched artists match filter.' : 'All library artists matched successfully on MusicBrainz.'}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="text-[11px] text-slate-500">
              Listed in <strong className="text-red-500">red</strong>: These local folders failed exact MusicBrainz search. Click <strong>Search MusicBrainz</strong> to find spelling variants or <strong>Browse Folder</strong> to rename.
            </div>
            {unmatchedFiltered.map((a) => (
              <div
                key={a.name}
                className={`p-3.5 rounded-xl border flex flex-col gap-2 transition-colors ${
                  isDark ? 'bg-red-950/20 border-red-500/20 text-slate-200' : 'bg-red-50/80 border-red-300/40 text-slate-900'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                    <span className="font-black text-sm text-red-500">{a.name}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-500/20 text-slate-400">{a.genre}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onOpenMbSearch(a)}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1.5 shadow-sm"
                    >
                      <Search size={12} />
                      <span>Search MusicBrainz</span>
                    </button>
                    <button
                      onClick={() => onOpenFolderBrowser(a, null)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                        isDark ? 'border-white/10 hover:bg-white/10 text-slate-200' : 'border-[#2E2B27]/15 hover:bg-black/5 text-slate-800'
                      }`}
                    >
                      <FolderOpen size={12} />
                      <span>Browse / Rename Folder</span>
                    </button>
                    <button
                      onClick={() => handleHideArtist(a.name)}
                      className={`p-1.5 rounded-lg border transition-colors text-slate-400 hover:text-red-400 ${
                        isDark ? 'border-white/10 hover:bg-white/10' : 'border-[#2E2B27]/10 hover:bg-black/5'
                      }`}
                      title="Hide from scanner"
                    >
                      <EyeOff size={13} />
                    </button>
                  </div>
                </div>

                {a.error && (
                  <p className="text-[11px] text-red-400 font-mono">Error: {a.error}</p>
                )}

                {a.unlistedAlbums?.length > 0 && (
                  <div className="text-[11px] opacity-80 flex flex-wrap gap-1.5 items-center">
                    <span className="text-slate-500">Local folders found:</span>
                    {a.unlistedAlbums.map((u) => (
                      <span key={u} className="px-2 py-0.5 rounded bg-black/20 font-medium text-[10px]">{u}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : auditSubTab === 'missing' ? (
        missingFiltered.length === 0 ? (
          <div className="p-8 rounded-xl border text-center text-xs text-slate-500">
            {searchFilter ? 'No artists match filter.' : 'All releases for your matched artists are owned.'}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="text-[11px] text-slate-500">
              Artists with unowned releases on MusicBrainz. Use <strong>Link / Rename</strong> to match unrecognised local folders.
            </div>
            {missingFiltered.map((a) => (
              <ArtistCard
                key={`audit-missing-${a.name}`}
                artist={a}
                isDark={isDark}
                showToast={showToast}
                onChanged={() => { fetchAudit(); onRefresh(); }}
                onOpenFolderBrowser={onOpenFolderBrowser}
                onOpenMbSearch={onOpenMbSearch}
              />
            ))}
          </div>
        )
      ) : (
        hiddenFiltered.length === 0 ? (
          <div className="p-8 rounded-xl border text-center text-xs text-slate-500">
            No artists or folders are currently hidden from the music scanner.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="text-[11px] text-slate-500">
              These folders are excluded from music scans and daily release reports. Click <strong>Restore</strong> to include them again.
            </div>
            {hiddenFiltered.map((a) => (
              <div
                key={a.name}
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                  isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-[#2E2B27]/10'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <EyeOff size={14} className="text-slate-500 shrink-0" />
                  <span className="font-bold text-xs truncate">{a.name}</span>
                  <span className="text-[10px] uppercase font-bold text-slate-500 px-2 py-0.5 rounded bg-slate-500/10">{a.genre}</span>
                </div>
                <button
                  onClick={() => handleUnhideArtist(a.name)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1.5 shadow-sm"
                >
                  <Eye size={12} />
                  <span>Restore Artist</span>
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main MusicScanPortal Component                                             */
/* -------------------------------------------------------------------------- */
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
  const [upRange, setUpRange] = useState('month');
  const [wants, setWants] = useState([]);
  const [recs, setRecs] = useState(null);
  const [recsBusy, setRecsBusy] = useState(false);
  const wantSet = React.useMemo(() => new Set(wants.map((w) => wantId(w.artist, w.title))), [wants]);
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const [allArtists, setAllArtists] = useState([]);
  const [search, setSearch] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [notification, setNotification] = useState(null);
  const pollRef = useRef(null);
  const wasRunning = useRef(false);

  // Modal states
  const [browserModal, setBrowserModal] = useState({ open: false, artistName: '', genre: '', targetRelease: null });
  const [mbSearchModal, setMbSearchModal] = useState({ open: false, artistName: '', genre: '' });

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
      } else if (view === 'audit') {
        // Handled inside AuditView
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

  const fetchWants = useCallback(async () => {
    try { const d = await (await fetch('/api/music-scan/wants')).json(); if (d.success) setWants(d.wants); } catch (_) { /* keep */ }
  }, []);

  useEffect(() => { fetchWants(); }, [fetchWants]);

  useEffect(() => {
    if (view !== 'discover' || recs) return;
    fetch('/api/music-scan/recommendations').then((r) => r.json()).then((d) => { if (d.success) setRecs(d.recommendations); }).catch(() => {});
  }, [view, recs]);

  const toggleWant = async (r) => {
    const on = wantSet.has(wantId(r.artist, r.title));
    const res = await fetch('/api/music-scan/wants', {
      method: on ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist: r.artist, title: r.title, date: r.date, precision: r.precision, type: r.type })
    });
    const d = await res.json();
    if (d.success) {
      setWants(d.wants);
      showToast(on ? `Removed ${r.title} from your want list.` : `Added ${r.title} to your want list.`);
    }
  };

  const makeRecs = async () => {
    setRecsBusy(true);
    try {
      const d = await (await fetch('/api/music-scan/recommendations', { method: 'POST' })).json();
      if (!d.success) throw new Error(d.error);
      setRecs(d.recommendations);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRecsBusy(false);
    }
  };

  const upcomingShown = upcoming.filter((r) => inUpcomingRange(r, upRange, todayStr));

  useEffect(() => { fetchStatus(); }, [fetchStatus]);
  useEffect(() => { fetchView(); }, [fetchView]);

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

  const openFolderBrowser = (artist, targetRelease = null) => {
    setBrowserModal({
      open: true,
      artistName: artist.name,
      genre: artist.genre,
      targetRelease
    });
  };

  const openMbSearch = (artist) => {
    setMbSearchModal({
      open: true,
      artistName: artist.name,
      genre: artist.genre
    });
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

  const favCount = (view === 'all' ? allArtists : (windowData?.artists || [])).filter(a => a.favourite).length;

  const visibleAll = allArtists.filter((a) => {
    if (favOnly && !a.favourite) return false;
    const q = search.trim().toLowerCase();
    return !q || a.name.toLowerCase().includes(q) || (a.mbName || '').toLowerCase().includes(q) ||
      (a.aliases || []).some((x) => x.toLowerCase().includes(q));
  });

  const rawWindowArtists = windowData?.artists || [];
  const artistsToShow = view === 'all' ? visibleAll : (favOnly ? rawWindowArtists.filter(a => a.favourite) : rawWindowArtists);
  const windowLabel = VIEWS.find((v) => v.key === view)?.label;

  return (
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

      {/* Modals */}
      {browserModal.open && (
        <FolderBrowserModal
          artistName={browserModal.artistName}
          genre={browserModal.genre}
          targetRelease={browserModal.targetRelease}
          isDark={isDark}
          onClose={() => setBrowserModal({ open: false, artistName: '', genre: '', targetRelease: null })}
          onUpdated={() => { fetchStatus(); fetchView(); }}
          showToast={showToast}
        />
      )}

      {mbSearchModal.open && (
        <MusicBrainzSearchModal
          artistName={mbSearchModal.artistName}
          genre={mbSearchModal.genre}
          isDark={isDark}
          onClose={() => setMbSearchModal({ open: false, artistName: '', genre: '' })}
          onAligned={() => { fetchStatus(); fetchView(); }}
          showToast={showToast}
        />
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
          <div className="flex items-center gap-2 shrink-0">
            <AccountChip isDark={isDark} />
            <button onClick={onThemeToggle} className={`p-2 rounded-xl transition-all border ${
              isDark ? 'bg-white/5 hover:bg-white/10 text-amber-400 border-white/5' : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-slate-700 border-[#2E2B27]/10'
            }`} title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}>
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
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
              {view === 'all' ? 'All Artists'
                : view === 'audit' ? 'Library & Metadata Audit'
                : view === 'upcoming' ? `Upcoming releases (${upcomingShown.length})`
                : view === 'wants' ? `Want list (${wants.filter((w) => !w.owned).length})`
                : view === 'discover' ? 'Artists you might like'
                : `Released in the last ${windowLabel === 'Day' ? 'day (today)' : windowLabel.toLowerCase()}`}
            </h2>
            <div className="flex items-center gap-2 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                onClick={() => setFavOnly(!favOnly)}
                title={favOnly ? 'Showing only favourite artists. Click to show all.' : 'Filter to favourite artists only'}
                className={`shrink-0 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all border ${
                  favOnly
                    ? 'bg-amber-500 text-white border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                    : isDark ? 'border-white/10 text-slate-400 hover:text-amber-400 hover:bg-white/5' : 'border-[#2E2B27]/10 text-slate-600 hover:text-amber-600 hover:bg-black/5'
                }`}
              >
                <Star size={12} fill={favOnly ? 'currentColor' : 'none'} className={favOnly ? 'text-white' : 'text-amber-400'} />
                <span>Favourites ({favCount})</span>
              </button>
              <div className={`flex max-w-full overflow-x-auto rounded-lg border ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
                {VIEWS.map((v) => (
                  <button key={v.key} onClick={() => setView(v.key)}
                    className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-all ${
                      view === v.key ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white'
                        : isDark ? 'text-slate-400 hover:bg-white/5' : 'text-slate-600 hover:bg-black/5'
                    }`}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {view !== 'audit' && (
            <div className="flex flex-wrap items-center gap-4 mb-4 text-[11px] font-semibold">
              <span className={`flex items-center gap-1.5 ${GREEN}`}><span className="w-2 h-2 rounded-full bg-emerald-500" />Owned</span>
              <span className={`flex items-center gap-1.5 ${RED}`}><span className="w-2 h-2 rounded-full bg-red-500" />Not owned</span>
              <span className="flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full bg-slate-500" />Owned, not on MusicBrainz</span>
              {!['all', 'upcoming', 'wants', 'discover'].includes(view) && <span className="text-slate-500 text-[10px]">Highlighted rows are the releases inside this window. Year-only dates can't be placed in a window.</span>}
              {favOnly && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">★ Filtered to Favourite Artists</span>}
            </div>
          )}

          {!hasData && view !== 'audit' ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              {isRunning ? 'Waiting for the scan to finish...' : 'No scan data yet - run a scan to populate this.'}
            </p>
          ) : (
            <>
              {view === 'audit' && (
                <AuditView
                  isDark={isDark}
                  showToast={showToast}
                  onRefresh={() => { fetchStatus(); fetchView(); }}
                  onOpenFolderBrowser={openFolderBrowser}
                  onOpenMbSearch={openMbSearch}
                />
              )}

              {view === 'upcoming' && (
                <>
                  <div className={`mb-3 inline-flex max-w-full overflow-x-auto rounded-lg border [scrollbar-width:none] ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
                    {UP_RANGES.map((o) => (
                      <button key={o.key} onClick={() => setUpRange(o.key)} className={`shrink-0 whitespace-nowrap px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${upRange === o.key ? (isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-slate-900') : 'text-slate-500'}`}>{o.label}</button>
                    ))}
                  </div>
                  {viewLoading && upcoming.length === 0 ? (
                    <div className="py-8 flex justify-center"><RotateCw size={18} className="animate-spin opacity-50" /></div>
                  ) : upcomingShown.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center">{upcoming.length ? 'Nothing announced for this stretch - try a longer range.' : 'No announced releases from your artists yet. MusicBrainz only lists them once they are announced, so check again after the next scan.'}</p>
                  ) : (
                    <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
                      {upcomingShown.map((r, i) => (
                        <div key={`${r.artist}-${r.title}-${i}`} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs ${i ? 'border-t' : ''} ${isDark ? 'border-white/5' : 'border-[#2E2B27]/5'}`}>
                          <span className="w-24 shrink-0 tabular-nums font-semibold text-amber-500" title={r.precision === 'day' ? '' : 'MusicBrainz does not know the exact day yet'}>
                            {fmtDate(r.date, r.precision)}{r.precision !== 'day' && <span className="ml-1 text-[9px] font-bold text-slate-500">TBC</span>}
                          </span>
                          <span className="min-w-0 flex-1 basis-48 break-words">
                            <span className={`font-semibold ${r.owned ? GREEN : ''}`}>{r.title}</span>
                            <span className="text-slate-500"> · </span>
                            <span className="font-bold" title={r.mbName && r.mbName !== r.artist ? `Your folder: ${r.artist}` : undefined}>{r.mbName || r.artist}</span>
                            <span className="ml-1.5 opacity-50 text-[10px]">{r.type}</span>
                          </span>
                          <span className="ml-auto flex items-center gap-1">
                            <ListenLinks artist={r.mbName || r.artist} title={r.title} />
                            <StarButton on={wantSet.has(wantId(r.artist, r.title))} onClick={() => toggleWant(r)} />
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {view === 'wants' && (
                wants.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">Star a release you haven't got (in Upcoming, or inside any artist) and it lands here. IMS mentions it in your morning report on the day it comes out.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {wants.map((w) => (
                      <div key={wantId(w.artist, w.title)} className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs px-3 py-2 rounded-xl border ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'} ${w.owned ? 'opacity-50' : ''}`}>
                        <span className={`w-24 shrink-0 tabular-nums font-semibold ${w.released ? 'text-emerald-500' : 'text-amber-500'}`}>{w.date ? fmtDate(w.date, w.precision) : 'Date unknown'}</span>
                        <span className="min-w-0 flex-1 basis-48 break-words"><span className="font-semibold">{w.title}</span><span className="text-slate-500"> · </span><span className="font-bold">{w.artist}</span></span>
                        <span className="text-[10px] font-bold uppercase">{w.owned ? <span className="text-emerald-500">Got it</span> : w.released ? <span className="text-emerald-500">Out now</span> : <span className="text-slate-500">Not out yet</span>}</span>
                        <ListenLinks artist={w.artist} title={w.title} />
                        <StarButton on onClick={() => toggleWant(w)} />
                      </div>
                    ))}
                  </div>
                )
              )}

              {view === 'discover' && (
                <div>
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <p className="text-[11px] text-slate-500 flex-1 min-w-[12rem]">Suggested from the artists you own most of. Anything already in your library is left out.</p>
                    <button onClick={makeRecs} disabled={recsBusy} className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white disabled:opacity-50">
                      {recsBusy ? <RotateCw size={13} className="animate-spin" /> : <Sparkles size={13} />} {recs ? 'New suggestions' : 'Suggest artists'}
                    </button>
                  </div>
                  {recs?.artists?.length ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {recs.artists.map((r) => (
                        <div key={r.artist} className={`p-3 rounded-xl border text-xs flex flex-col gap-1 ${isDark ? 'border-white/10 bg-slate-950/40' : 'border-[#2E2B27]/10 bg-white'}`}>
                          <div className="flex items-center gap-2"><span className="font-black text-sm flex-1 min-w-0 break-words">{r.artist}</span><ListenLinks artist={r.artist} title={r.startWith || ''} /></div>
                          {r.why && <p className="text-slate-500">{r.why}</p>}
                          {r.startWith && <p><span className="text-slate-500">Start with:</span> <b>{r.startWith}</b></p>}
                          {Array.isArray(r.because) && r.because.length > 0 && <p className="text-[10px] text-slate-500">Because you own {r.because.join(', ')}</p>}
                        </div>
                      ))}
                    </div>
                  ) : !recsBusy && <p className="text-xs text-slate-500 py-6 text-center">Press Suggest artists.</p>}
                </div>
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
                          <span className="ml-auto flex items-center gap-1"><ListenLinks artist={r.artist} title={r.title} />{!r.owned && <StarButton on={wantSet.has(wantId(r.artist, r.title))} onClick={() => toggleWant(r)} />}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {view === 'all' && (
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
                    <input className={`${fieldClass} pl-8 font-sans`} placeholder={`Search ${allArtists.length} artists...`}
                      value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  {favCount > 0 && (
                    <button
                      onClick={() => setFavOnly(!favOnly)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 transition-all border ${
                        favOnly
                          ? 'bg-amber-500 text-white border-amber-500'
                          : isDark ? 'border-white/10 hover:bg-white/5 text-slate-400' : 'border-[#2E2B27]/10 hover:bg-black/5 text-slate-600'
                      }`}
                    >
                      <Star size={13} fill={favOnly ? 'currentColor' : 'none'} className={favOnly ? 'text-white' : 'text-amber-400'} />
                      <span>{favOnly ? 'Showing Favs' : 'Favs'}</span>
                    </button>
                  )}
                </div>
              )}

              {['upcoming', 'wants', 'discover', 'audit'].includes(view) ? null : viewLoading && artistsToShow.length === 0 ? (
                <div className="py-8 flex justify-center"><RotateCw size={18} className="animate-spin opacity-50" /></div>
              ) : artistsToShow.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  {view === 'all' ? 'No artists match.' : `None of your artists have a dated release in this window.`}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {view !== 'all' && <p className="text-[11px] text-slate-500">{artistsToShow.length} artist{artistsToShow.length === 1 ? '' : 's'}</p>}
                  {artistsToShow.map((a) => (
                    <ArtistCard
                      key={`${view}-${a.name}`}
                      artist={a}
                      isDark={isDark}
                      showToast={showToast}
                      onChanged={fetchView}
                      wantSet={wantSet}
                      onToggleWant={toggleWant}
                      onOpenFolderBrowser={openFolderBrowser}
                      onOpenMbSearch={openMbSearch}
                    />
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
