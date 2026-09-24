import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Brain, 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Edit3, 
  Search, 
  Tag, 
  Calendar, 
  Check, 
  X, 
  RotateCw, 
  Copy, 
  Filter, 
  Sparkles, 
  MapPin, 
  Heart, 
  Briefcase, 
  Info, 
  Sun, 
  Moon,
  AlertCircle,
  Database,
  Archive,
  Undo2
} from 'lucide-react';

const CATEGORY_CONFIG = {
  all: { label: 'All Categories', color: 'text-slate-400 bg-slate-500/10 border-slate-500/20', icon: Filter },
  general: { label: 'General', color: 'text-sky-400 bg-sky-500/10 border-sky-500/20', icon: Tag },
  item_location: { label: 'Item Locations', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: MapPin },
  preference: { label: 'Preferences', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20', icon: Heart },
  personal: { label: 'Personal', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: Sparkles },
  work: { label: 'Work & Projects', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', icon: Briefcase }
};

const SUGGESTED_EXAMPLES = [
  { fact: "Spare car keys are kept in the small top drawer in the hallway.", category: "item_location" },
  { fact: "Prefers strong Yorkshire Gold tea with a splash of milk, no sugar.", category: "preference" },
  { fact: "Passport and birth certificate are stored in the metal fireproof safe.", category: "item_location" },
  { fact: "Birthday is on 15th October.", category: "personal" }
];

export default function MemoriesPortal({ 
  theme = 'dark', 
  onThemeToggle,
  currentPath = '/ims/memories',
  setCurrentPath
}) {
  const isDark = theme === 'dark';

  const [memories, setMemories] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [categoryCounts, setCategoryCounts] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [errorMessage, setErrorMessage] = useState(null);
  const [notification, setNotification] = useState(null);

  // Modal / Form state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [factInput, setFactInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('general');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit inline modal state
  const [editingMemory, setEditingMemory] = useState(null);
  const [editFactInput, setEditFactInput] = useState('');
  const [editCategoryInput, setEditCategoryInput] = useState('general');

  // Deletion confirm state
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Archive: deleted memories are kept (with when they were deleted) and can be restored.
  const [showArchive, setShowArchive] = useState(false);
  const [archived, setArchived] = useState([]);
  const [archiveSearch, setArchiveSearch] = useState('');

  // Notification helper
  const showToast = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => {
      setNotification(prev => (prev?.msg === msg ? null : prev));
    }, 3500);
  }, []);

  // Fetch memories from backend API
  const fetchMemories = useCallback(async (search = searchQuery, category = selectedCategory) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      if (search && search.trim()) params.append('search', search.trim());
      if (category && category !== 'all') params.append('category', category);
      params.append('limit', '300');

      const res = await fetch(`/api/memories?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      if (data.success) {
        setMemories(data.memories || []);
        setTotalCount(data.total || (data.memories ? data.memories.length : 0));
        setCategoryCounts(data.categories || {});
      } else {
        throw new Error(data.error || 'Failed to retrieve memories.');
      }
    } catch (err) {
      console.error('[MemoriesPortal] Error fetching memories:', err);
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedCategory]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  // Navigate back to the IMS Hub
  const handleReturnHome = () => {
    window.history.pushState(null, '', '/ims');
    if (setCurrentPath) {
      setCurrentPath('/ims');
    } else {
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  // Add memory handler
  const handleAddMemory = async (e) => {
    if (e) e.preventDefault();
    if (!factInput || !factInput.trim()) {
      showToast('Please enter a memory or fact.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fact: factInput.trim(),
          category: categoryInput.trim().toLowerCase()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save memory.');
      }

      showToast('Memory successfully saved to SQLite database.');
      setFactInput('');
      setCategoryInput('general');
      setIsAddModalOpen(false);
      fetchMemories();
    } catch (err) {
      console.error('[MemoriesPortal] Add error:', err);
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Edit memory handler
  const handleSaveEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editingMemory || !editFactInput.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/memories/${editingMemory.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fact: editFactInput.trim(),
          category: editCategoryInput.trim().toLowerCase()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update memory.');
      }

      showToast('Memory updated.');
      setEditingMemory(null);
      fetchMemories();
    } catch (err) {
      console.error('[MemoriesPortal] Edit error:', err);
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete memory handler
  const fetchArchive = useCallback(async () => {
    try {
      const d = await (await fetch(`/api/memories/archive?search=${encodeURIComponent(archiveSearch)}`)).json();
      if (d.success) setArchived(d.memories);
    } catch (err) {
      console.error('[MemoriesPortal] Archive load error:', err);
    }
  }, [archiveSearch]);

  useEffect(() => { if (showArchive) fetchArchive(); }, [showArchive, fetchArchive]);

  const handleRestoreMemory = async (id) => {
    try {
      const res = await fetch(`/api/memories/${id}/restore`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to restore memory.');
      showToast('Memory restored.');
      fetchArchive();
      fetchMemories();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteMemory = async (id) => {
    try {
      const res = await fetch(`/api/memories/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete memory.');
      }

      showToast('Memory moved to the archive.');
      setDeleteConfirmId(null);
      // Optimistic state filter
      setMemories(prev => prev.filter(m => m.id !== id));
      setTotalCount(prev => Math.max(0, prev - 1));
      fetchMemories();
    } catch (err) {
      console.error('[MemoriesPortal] Delete error:', err);
      showToast(err.message, 'error');
    }
  };

  // Copy text to clipboard
  const handleCopyFact = (fact) => {
    navigator.clipboard.writeText(fact);
    showToast('Fact copied to clipboard.');
  };

  // Format date helper in British English (DD/MM/YYYY HH:mm)
  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'Unknown';
    try {
      const d = new Date(dateStr.replace(' ', 'T'));
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${mins}`;
    } catch {
      return dateStr;
    }
  };

  // Filter memories locally if search matches
  const filteredMemories = useMemo(() => {
    if (!searchQuery.trim()) return memories;
    const term = searchQuery.toLowerCase().trim();
    return memories.filter(m => 
      (m.fact && m.fact.toLowerCase().includes(term)) ||
      (m.category && m.category.toLowerCase().includes(term)) ||
      (m.id && m.id.toLowerCase().includes(term))
    );
  }, [memories, searchQuery]);

  return (
    <div className={`h-screen overflow-y-auto w-full flex flex-col font-sans transition-colors duration-300 ${
      isDark ? 'bg-[#030712] text-[#f3f4f6]' : 'bg-[#f4efed] text-[#1f2937]'
    }`}>
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 backdrop-blur-md border animate-in fade-in slide-in-from-top-4 duration-200 ${
          notification.type === 'error'
            ? 'bg-red-500/90 text-white border-red-600/30'
            : isDark 
              ? 'bg-slate-900/90 text-white border-brand-cyan/40 shadow-[0_0_20px_rgba(0,242,255,0.2)]'
              : 'bg-white/95 text-slate-800 border-[#899981]/40 shadow-xl'
        }`}>
          {notification.type === 'error' ? <AlertCircle size={18} /> : <Check size={18} className="text-emerald-400" />}
          <span className="text-xs font-semibold">{notification.msg}</span>
        </div>
      )}

      {/* Top Header */}
      <header className={`px-6 py-4 flex items-center justify-between border-b backdrop-blur-xl sticky top-0 z-40 transition-colors duration-300 ${
        isDark ? 'bg-[#030712]/80 border-white/5' : 'bg-[#f4efed]/85 border-[#2E2B27]/10'
      }`}>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleReturnHome}
            className={`p-2 rounded-xl flex items-center gap-2 text-xs font-bold transition-all active:scale-95 ${
              isDark 
                ? 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5' 
                : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-[#2E2B27] border border-[#2E2B27]/10'
            }`}
            title="Return to IMS Hub"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">IMS Hub</span>
          </button>

          <div className="h-6 w-px bg-slate-500/20" />

          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 shadow-[0_0_15px_rgba(0,242,255,0.3)]">
              <Brain size={18} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight leading-none uppercase">
                  IMS Memories Hub
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/25">
                  SQLite
                </span>
              </div>
              <span className="text-[10px] font-semibold text-slate-500 tracking-wider">
                /ims/memories • Persistent Fact & Recall Subsystem
              </span>
            </div>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowArchive(true)}
            className={`px-3 py-2 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center gap-2 border active:scale-95 cursor-pointer ${
              isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10' : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-[#2E2B27] border-[#2E2B27]/10'
            }`}
            title="Deleted memories - review or restore"
          >
            <Archive size={15} />
            <span>Archive</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-[0_0_15px_rgba(0,242,255,0.25)] active:scale-95 cursor-pointer"
          >
            <Plus size={15} />
            <span>Add Memory</span>
          </button>

          {onThemeToggle && (
            <button
              onClick={onThemeToggle}
              className={`p-2 rounded-xl transition-all border ${
                isDark 
                  ? 'bg-white/5 hover:bg-white/10 text-amber-400 border-white/5' 
                  : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-slate-700 border-[#2E2B27]/10'
              }`}
              title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
        {/* Overview Stats Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className={`p-4 rounded-2xl border transition-all ${
            isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Memories</span>
              <Database size={16} className="text-cyan-400" />
            </div>
            <div className="text-3xl font-black">{totalCount}</div>
            <p className="text-[10px] text-slate-400 mt-1">Recalled automatically during voice & web chat</p>
          </div>

          <div className={`p-4 rounded-2xl border transition-all ${
            isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Item Locations</span>
              <MapPin size={16} className="text-amber-400" />
            </div>
            <div className="text-3xl font-black">{categoryCounts['item_location'] || 0}</div>
            <p className="text-[10px] text-slate-400 mt-1">Keys, passports, tools & possessions</p>
          </div>

          <div className={`p-4 rounded-2xl border transition-all ${
            isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Preferences</span>
              <Heart size={16} className="text-purple-400" />
            </div>
            <div className="text-3xl font-black">{categoryCounts['preference'] || 0}</div>
            <p className="text-[10px] text-slate-400 mt-1">Drinks, habits, personal taste & routines</p>
          </div>

          <div className={`p-4 rounded-2xl border transition-all ${
            isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Hardware Integration</span>
              <Sparkles size={16} className="text-emerald-400" />
            </div>
            <div className="text-base font-extrabold text-emerald-400 flex items-center gap-1.5 mt-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Sync Active
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">Say "Remember that..." to Box-3 assistant</p>
          </div>
        </div>

        {/* Filter & Search Toolbar */}
        <div className={`p-4 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-4 transition-all ${
          isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'
        }`}>
          {/* Search Bar */}
          <div className="relative w-full md:w-96">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search memories by keyword, location, item..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-9 py-2.5 rounded-xl text-xs font-medium border outline-none transition-all ${
                isDark 
                  ? 'bg-slate-950/60 border-white/10 text-white placeholder-slate-500 focus:border-cyan-400/50' 
                  : 'bg-white border-[#2E2B27]/15 text-slate-800 placeholder-slate-400 focus:border-[#899981]'
              }`}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
            {Object.keys(CATEGORY_CONFIG).map((catKey) => {
              const cat = CATEGORY_CONFIG[catKey];
              const IconComp = cat.icon;
              const isSelected = selectedCategory === catKey;
              const count = catKey === 'all' ? totalCount : (categoryCounts[catKey] || 0);

              return (
                <button
                  key={catKey}
                  onClick={() => setSelectedCategory(catKey)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-wide whitespace-nowrap transition-all flex items-center gap-1.5 border active:scale-95 ${
                    isSelected
                      ? isDark
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-[0_0_10px_rgba(0,242,255,0.15)]'
                        : 'bg-[#899981]/25 text-[#2E2B27] border-[#899981]/40 font-black'
                      : isDark
                        ? 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10 hover:text-slate-200'
                        : 'bg-[#2E2B27]/5 text-slate-600 border-[#2E2B27]/10 hover:bg-[#2E2B27]/10'
                  }`}
                >
                  <IconComp size={12} />
                  <span>{cat.label}</span>
                  <span className={`ml-1 text-[9px] px-1.5 py-0.2 rounded-full ${
                    isSelected 
                      ? 'bg-cyan-500/30 text-white' 
                      : 'bg-slate-500/20 text-slate-400'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}

            <button
              onClick={() => fetchMemories()}
              disabled={isLoading}
              className={`p-2 rounded-xl transition-all border active:scale-95 ml-1 ${
                isDark 
                  ? 'bg-white/5 hover:bg-white/10 text-slate-400 border-white/5' 
                  : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-slate-600 border-[#2E2B27]/10'
              }`}
              title="Refresh memories list"
            >
              <RotateCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-3">
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Memory Cards Grid */}
        <div className="flex flex-col gap-3">
          {isLoading && memories.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
              <RotateCw size={24} className="text-cyan-400 animate-spin" />
              <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Loading memories database...</p>
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className={`py-16 px-6 text-center rounded-2xl border flex flex-col items-center justify-center gap-4 ${
              isDark ? 'bg-slate-900/20 border-white/5' : 'bg-white/50 border-[#2E2B27]/10'
            }`}>
              <div className="p-4 rounded-2xl bg-cyan-500/10 text-cyan-400">
                <Brain size={32} />
              </div>
              <div className="max-w-md">
                <h3 className="text-sm font-bold tracking-tight">No memories found</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {searchQuery 
                    ? `No memories matched your query "${searchQuery}". Try clearing the search or category filter.`
                    : "No facts or memories have been stored yet. You can add one using the button above, or speak to IMS using 'Hey IMS, remember that...'"}
                </p>
              </div>

              {!searchQuery && (
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition-all flex items-center gap-2"
                >
                  <Plus size={14} />
                  <span>Create First Memory</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMemories.map((mem) => {
                const catConfig = CATEGORY_CONFIG[mem.category] || CATEGORY_CONFIG.general;
                const CatIcon = catConfig.icon;
                const isConfirming = deleteConfirmId === mem.id;

                return (
                  <div
                    key={mem.id}
                    className={`p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between group hover:shadow-lg ${
                      isDark 
                        ? 'bg-slate-900/50 hover:bg-slate-900/80 border-white/5 hover:border-cyan-500/30 shadow-[0_4px_20px_rgba(0,0,0,0.2)]' 
                        : 'bg-white hover:bg-white/90 border-[#2E2B27]/10 hover:border-[#899981]/50 shadow-sm'
                    }`}
                  >
                    <div>
                      {/* Card Header: Category & Actions */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5 ${catConfig.color}`}>
                          <CatIcon size={11} />
                          <span>{catConfig.label}</span>
                        </span>

                        <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleCopyFact(mem.fact)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isDark ? 'hover:bg-white/10 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                            }`}
                            title="Copy fact to clipboard"
                          >
                            <Copy size={13} />
                          </button>
                          <button
                            onClick={() => {
                              setEditingMemory(mem);
                              setEditFactInput(mem.fact);
                              setEditCategoryInput(mem.category || 'general');
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isDark ? 'hover:bg-white/10 text-slate-400 hover:text-cyan-400' : 'hover:bg-slate-100 text-slate-500 hover:text-cyan-700'
                            }`}
                            title="Edit memory"
                          >
                            <Edit3 size={13} />
                          </button>

                          {isConfirming ? (
                            <div className="flex items-center gap-1 bg-red-500/20 px-2 py-0.5 rounded-lg border border-red-500/30 animate-in fade-in duration-150">
                              <button
                                onClick={() => handleDeleteMemory(mem.id)}
                                className="text-[10px] font-bold text-red-400 hover:underline"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="text-slate-400 hover:text-white"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(mem.id)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isDark ? 'hover:bg-red-500/20 text-slate-400 hover:text-red-400' : 'hover:bg-red-50 text-slate-500 hover:text-red-600'
                              }`}
                              title="Delete memory"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Fact Content */}
                      <p className={`text-sm font-medium leading-relaxed tracking-normal ${
                        isDark ? 'text-slate-100' : 'text-slate-900'
                      }`}>
                        "{mem.fact}"
                      </p>
                    </div>

                    {/* Card Footer: Metadata */}
                    <div className="mt-4 pt-3 border-t border-slate-500/10 flex items-center justify-between text-[10px] text-slate-400">
                      <div className="flex items-center gap-1">
                        <Calendar size={11} className="opacity-70" />
                        <span>{formatDateTime(mem.created_at)}</span>
                      </div>
                      <span className="font-mono opacity-50 text-[9px]">{mem.id}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Archive panel: deleted memories, newest deletion first */}
      {showArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`max-w-2xl w-full max-h-[85vh] flex flex-col rounded-2xl border p-6 shadow-2xl relative ${
            isDark ? 'bg-slate-900 border-white/10 text-white' : 'bg-white border-[#2E2B27]/15 text-slate-900'
          }`}>
            <button onClick={() => setShowArchive(false)} className="absolute right-5 top-5 text-slate-400 hover:text-slate-200"><X size={18} /></button>
            <h2 className="text-sm font-black uppercase tracking-wider mb-1 flex items-center gap-2"><Archive size={16} />Memory archive ({archived.length})</h2>
            <p className="text-[11px] text-slate-500 mb-3">Deleted memories are kept here with when they were added and deleted. Restore any that you want back.</p>
            <input
              value={archiveSearch}
              onChange={(e) => setArchiveSearch(e.target.value)}
              placeholder="Search deleted memories..."
              className={`w-full px-3 py-2 rounded-lg text-xs outline-none border mb-3 ${isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/10 text-slate-900'}`}
            />
            <div className="overflow-y-auto flex flex-col gap-2">
              {archived.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No deleted memories.</p>
              ) : archived.map((m) => {
                const toDate = (str) => (str ? new Date(str.replace(' ', 'T') + 'Z').toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
                return (
                  <div key={m.id} className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-[#2E2B27]/10'}`}>
                    <div className="min-w-0">
                      <div className="font-semibold whitespace-pre-wrap break-words">{m.fact}</div>
                      <div className="mt-1 text-[10px] text-slate-500">
                        {m.category} &bull; added {toDate(m.created_at)}{m.updated_at ? ` \u2022 edited ${toDate(m.updated_at)}` : ''} &bull; deleted {toDate(m.deleted_at)}
                      </div>
                    </div>
                    <button onClick={() => handleRestoreMemory(m.id)} className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}>
                      <Undo2 size={12} /> Restore
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Add Memory Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`max-w-lg w-full rounded-2xl border p-6 shadow-2xl relative transition-all ${
            isDark ? 'bg-slate-900 border-white/10 text-white' : 'bg-white border-[#2E2B27]/15 text-slate-900'
          }`}>
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute right-5 top-5 text-slate-400 hover:text-slate-200"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <Brain size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold tracking-tight">Add New Memory</h3>
                <p className="text-xs text-slate-400">Will be persisted directly to IMS SQLite database.</p>
              </div>
            </div>

            <form onSubmit={handleAddMemory} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Fact or Information
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g., The spare car keys are on the hook behind the front door."
                  value={factInput}
                  onChange={(e) => setFactInput(e.target.value)}
                  className={`w-full p-3 rounded-xl text-xs font-medium border outline-none transition-all resize-none ${
                    isDark 
                      ? 'bg-slate-950/80 border-white/10 text-white placeholder-slate-500 focus:border-cyan-400' 
                      : 'bg-[#f4efed]/60 border-[#2E2B27]/20 text-slate-900 placeholder-slate-400 focus:border-[#899981]'
                  }`}
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {['general', 'item_location', 'preference', 'personal', 'work'].map((catKey) => {
                    const isSelected = categoryInput === catKey;
                    const catCfg = CATEGORY_CONFIG[catKey];
                    const CatIco = catCfg.icon;

                    return (
                      <button
                        type="button"
                        key={catKey}
                        onClick={() => setCategoryInput(catKey)}
                        className={`p-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all ${
                          isSelected
                            ? isDark
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                              : 'bg-[#899981]/25 text-[#2E2B27] border-[#899981]/60'
                            : isDark
                              ? 'bg-slate-950/40 text-slate-400 border-white/5 hover:bg-slate-950/80'
                              : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/60'
                        }`}
                      >
                        <CatIco size={13} />
                        <span>{catCfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Suggestions */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Quick Examples:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_EXAMPLES.map((eg, idx) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => {
                        setFactInput(eg.fact);
                        setCategoryInput(eg.category);
                      }}
                      className={`text-[10px] px-2.5 py-1 rounded-lg border text-left truncate max-w-full transition-colors ${
                        isDark 
                          ? 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10' 
                          : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200/70'
                      }`}
                    >
                      {eg.fact}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-500/10">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !factInput.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 transition-all shadow-md active:scale-95"
                >
                  {isSubmitting ? 'Saving...' : 'Save Memory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Memory Modal */}
      {editingMemory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`max-w-lg w-full rounded-2xl border p-6 shadow-2xl relative transition-all ${
            isDark ? 'bg-slate-900 border-white/10 text-white' : 'bg-white border-[#2E2B27]/15 text-slate-900'
          }`}>
            <button
              onClick={() => setEditingMemory(null)}
              className="absolute right-5 top-5 text-slate-400 hover:text-slate-200"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                <Edit3 size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold tracking-tight">Edit Memory</h3>
                <p className="text-xs text-slate-400">Modify memory entry ({editingMemory.id})</p>
              </div>
            </div>

            <form onSubmit={handleSaveEdit} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Fact Content
                </label>
                <textarea
                  rows={3}
                  value={editFactInput}
                  onChange={(e) => setEditFactInput(e.target.value)}
                  className={`w-full p-3 rounded-xl text-xs font-medium border outline-none transition-all resize-none ${
                    isDark 
                      ? 'bg-slate-950/80 border-white/10 text-white focus:border-cyan-400' 
                      : 'bg-[#f4efed]/60 border-[#2E2B27]/20 text-slate-900 focus:border-[#899981]'
                  }`}
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {['general', 'item_location', 'preference', 'personal', 'work'].map((catKey) => {
                    const isSelected = editCategoryInput === catKey;
                    const catCfg = CATEGORY_CONFIG[catKey];
                    const CatIco = catCfg.icon;

                    return (
                      <button
                        type="button"
                        key={catKey}
                        onClick={() => setEditCategoryInput(catKey)}
                        className={`p-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all ${
                          isSelected
                            ? isDark
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                              : 'bg-[#899981]/25 text-[#2E2B27] border-[#899981]/60'
                            : isDark
                              ? 'bg-slate-950/40 text-slate-400 border-white/5 hover:bg-slate-950/80'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        <CatIco size={13} />
                        <span>{catCfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-500/10">
                <button
                  type="button"
                  onClick={() => setEditingMemory(null)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold ${
                    isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !editFactInput.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 transition-all shadow-md active:scale-95"
                >
                  {isSubmitting ? 'Updating...' : 'Update Memory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
