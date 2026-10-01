import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, Command, ArrowRight, Brain, User, Activity, Bell, Timer, Clock,
  Cake, Dices, Eye, Smile, Palette, Wifi, Mic, Calendar, MessageSquare, CheckSquare,
  Newspaper, Layers, Database, Lightbulb, MapPin, Code, FileText, Sparkles,
  Zap, Plus, RefreshCw, X, Shield, ArrowUpRight, TrendingUp, Volume2
} from 'lucide-react';

const PORTALS = [
  { id: 'memories', name: 'IMS Memories Database', path: '/ims/memories', category: 'Intelligence & Memory', icon: Brain, description: 'Manage persistent long-term memories, facts, and recall entries' },
  { id: 'persona', name: 'IMS Persona & Rulebook', path: '/ims/persona', category: 'Intelligence & Memory', icon: User, description: 'Customise Yorkshire dialect, comedic tone, and system prompt directives' },
  { id: 'dayreport', name: 'Day & Morning Report', path: '/ims/dayreport', category: 'Intelligence & Memory', icon: FileText, description: 'Morning briefing subjects, custom focus notes, and execution order' },
  { id: 'glucose', name: 'Blood Sugar & CGM Analytics', path: '/ims/glucose', category: 'Health & Fitness', icon: Activity, description: 'Real-time Nightscout CGM telemetry, time-in-range, and trends' },
  { id: 'activities', name: 'Training & Strava Activities', path: '/ims/activities', category: 'Health & Fitness', icon: TrendingUp, description: 'Strava runs, workouts, pace analysis, and training milestones' },
  { id: 'runplanner', name: 'Run Route Planner', path: '/ims/runplanner', category: 'Health & Fitness', icon: MapPin, description: 'Interactive UK run mapping, elevation, and distance calculations' },
  { id: 'musicscan', name: 'Music Library Scanner', path: '/ims/musicscan', category: 'Media & Entertainment', icon: Volume2, description: 'MusicBrainz MBID sync, network folder renaming, and artist favourites' },
  { id: 'boardgames', name: 'Board Games Collection', path: '/ims/boardgames', category: 'Media & Entertainment', icon: Dices, description: 'BoardGameGeek sync, 300+ expansions, box art previews, and list updates' },
  { id: 'campaigns', name: 'Campaign Maps & Chronicles', path: '/campaigns', category: 'Media & Entertainment', icon: Layers, description: 'Lord of the Rings and Arkham Horror interactive campaign logs' },
  { id: 'alarms', name: 'Alarms Hub', path: '/ims/alarms', category: 'Time & Scheduling', icon: Bell, description: 'Configure alarm chimes, vocal prompts, and auto-dismiss limits' },
  { id: 'timers', name: 'Timers Hub', path: '/ims/timers', category: 'Time & Scheduling', icon: Timer, description: 'Live active countdowns, alerts, and repeat management' },
  { id: 'reminders', name: 'Reminders Hub', path: '/ims/reminders', category: 'Time & Scheduling', icon: Clock, description: 'Spoken vocal reminders and scheduled time alerts' },
  { id: 'birthday', name: 'Birthdays & Anniversaries', path: '/ims/birthday', category: 'Time & Scheduling', icon: Cake, description: 'Upcoming family birthdays, milestones, and card reminders' },
  { id: 'calendar', name: 'Calendar Integration', path: '/ims/calendar', category: 'Time & Scheduling', icon: Calendar, description: 'Google Calendar synched agenda and upcoming events' },
  { id: 'tasks', name: 'Tasks & Todo Lists', path: '/ims/tasks', category: 'Time & Scheduling', icon: CheckSquare, description: 'Manage shopping lists, todo items, and daily chores' },
  { id: 'devideas', name: 'Developer Ideas & Bug Queue', path: '/ims/devideas', category: 'Development & Engineering', icon: Lightbulb, description: 'Clipboard screenshot capture, feature suggestions, and prompt export' },
  { id: 'code-repo', name: 'Best Practice Code Repository', path: '/ims/code-repo', category: 'Development & Engineering', icon: Code, description: 'Scaffold Antigravity projects, best-practice snippets, and contracts' },
  { id: 'architecture', name: 'System Architecture Viewer', path: '/ims/architecture', category: 'Development & Engineering', icon: Database, description: 'Full-stack C4 container models, data flow graphs, and service topologies' },
  { id: 'look', name: 'Look Visual Feed', path: '/ims/look', category: 'Terminal & Hardware', icon: Eye, description: 'Camera snapshot capture and visual grounding analysis' },
  { id: 'faces', name: 'Faces Management', path: '/ims/faces', category: 'Terminal & Hardware', icon: Smile, description: 'Browse and switch dot-matrix facial expressions for Box-3' },
  { id: 'facedesigner', name: 'Face Designer Studio', path: '/ims/facedesigner', category: 'Terminal & Hardware', icon: Palette, description: 'Design custom 12x8 LED pixel grids and animated eye timelines' },
  { id: 'wifi', name: 'Wi-Fi Configuration', path: '/ims/wifi', category: 'Terminal & Hardware', icon: Wifi, description: 'Configure ESP32 Wi-Fi networks and connection telemetry' },
  { id: 'recordings', name: 'Voice Captures & Audio Logs', path: '/ims/recordings', category: 'Terminal & Hardware', icon: Mic, description: 'Listen to recorded speech turns and verify transcript text' },
  { id: 'phrases', name: 'Wake & Stop Phrases', path: '/ims/phrases', category: 'Terminal & Hardware', icon: MessageSquare, description: 'Approved wake phrases, room chatter rejection, and closing phrases' },
  { id: 'doorbell', name: 'Ring Doorbell Service', path: '/ims/doorbell', category: 'Terminal & Hardware', icon: Bell, description: 'Direct Ring API integration, live dings, motion alerts, snapshots, and Yorkshire voice alerts' },
  { id: 'devicehealth', name: 'Device Health & Observability', path: '/ims/device-health', category: 'Terminal & Hardware', icon: Activity, description: 'Minute-by-minute Box-3 Wi-Fi RSSI, free heap, uptime, underruns and reconnect sparklines' },
  { id: 'spend', name: 'Gemini Spend & Budget Breakdown', path: '/ims/spend', category: 'Development & Engineering', icon: Database, description: 'Tokens & estimated cost per service per day, soft monthly budget warning, and prompt optimization' },
  { id: 'news', name: 'News Feed Sources', path: '/ims/news', category: 'Intelligence & Memory', icon: Newspaper, description: 'RSS news subscriptions and daily morning briefing headlines' },
  { id: 'backups', name: 'System Backups & Maintenance', path: '/ims/backups', category: 'Development & Engineering', icon: Shield, description: 'Nightly SQLite database backups, schema snapshots, and vector store integrity' },
];

export default function CommandPalette({ isOpen, onClose, onNavigate, theme = 'dark' }) {
  const isDark = theme === 'dark';
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [quickMode, setQuickMode] = useState(null); // 'note' | 'idea' | 'glucose'
  const [quickInput, setQuickInput] = useState('');
  const [quickStatus, setQuickStatus] = useState(null);
  const [glucoseData, setGlucoseData] = useState(null);
  const [loadingGlucose, setLoadingGlucose] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Focus input when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setQuickMode(null);
      setQuickInput('');
      setQuickStatus(null);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Fetch glucose telemetry for Quick Glucose preview
  const fetchGlucoseTelemetry = async () => {
    setLoadingGlucose(true);
    try {
      const res = await fetch('/api/glucose');
      if (res.ok) {
        const data = await res.json();
        setGlucoseData(data);
      }
    } catch (e) {
      console.error('Failed to fetch glucose telemetry:', e);
    } finally {
      setLoadingGlucose(false);
    }
  };

  useEffect(() => {
    if (isOpen && quickMode === 'glucose') {
      fetchGlucoseTelemetry();
    }
  }, [isOpen, quickMode]);

  // Filtered items
  const filteredPortals = useMemo(() => {
    if (!query.trim()) return PORTALS;
    const q = query.toLowerCase();
    return PORTALS.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.path.toLowerCase().includes(q)
    );
  }, [query]);

  // Quick action items at top
  const quickActions = useMemo(() => {
    const actions = [
      {
        id: 'action-glucose',
        name: 'Check Live Blood Glucose',
        category: 'Quick Actions',
        icon: Activity,
        description: 'Instant Nightscout mmol/L reading, delta, and directional trend arrow',
        onExecute: () => {
          setQuickMode('glucose');
          fetchGlucoseTelemetry();
        }
      },
      {
        id: 'action-audit',
        name: 'Run Code Repository Audit',
        category: 'Quick Actions',
        icon: Shield,
        description: 'Instant 1-click workspace static scan for TS types, unhandled async errors, and triple registry parity',
        path: '/ims/code-repo?action=audit',
      },
      {
        id: 'action-runplanner',
        name: 'Plan Run Fuelling & Route',
        category: 'Quick Actions',
        icon: MapPin,
        description: 'Interactive run planner with live weather, elevation scaling, and carb timeline',
        path: '/ims/runplanner',
      },
      {
        id: 'action-activities',
        name: 'View Strava Training & HR Zones',
        category: 'Quick Actions',
        icon: TrendingUp,
        description: 'Training activity logs, polarized HR volume distribution, and AI coaching debriefs',
        path: '/ims/activities',
      },
      {
        id: 'action-doorbell',
        name: 'Open Ring Doorbell Live Hub',
        category: 'Quick Actions',
        icon: Bell,
        description: 'Live doorbell motion & ding alerts, camera battery, snapshots, and Box-3 settings',
        path: '/ims/doorbell',
      },
      {
        id: 'action-note',
        name: 'Quick Add Memory / Note',
        category: 'Quick Actions',
        icon: Brain,
        description: 'Store a permanent fact or note directly into IMS memories',
        onExecute: () => {
          setQuickMode('note');
          setQuickInput('');
        }
      },
      {
        id: 'action-idea',
        name: 'Quick Log Dev Idea / Bug',
        category: 'Quick Actions',
        icon: Lightbulb,
        description: 'Queue an engineering feature, suggestion, or bug for Antigravity',
        onExecute: () => {
          setQuickMode('idea');
          setQuickInput('');
        }
      }
    ];

    if (!query.trim()) return actions;
    const q = query.toLowerCase();
    return actions.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q)
    );
  }, [query]);

  const allItems = useMemo(() => {
    return [...quickActions, ...filteredPortals];
  }, [quickActions, filteredPortals]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard navigation (Capture phase ensures Escape is handled even if inputs intercept it)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (quickMode) {
          setQuickMode(null);
        } else {
          onClose();
        }
        return;
      }

      if (quickMode) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < allItems.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : allItems.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = allItems[selectedIndex];
        if (selected) {
          if (selected.onExecute) {
            selected.onExecute();
          } else if (selected.path) {
            onNavigate(selected.path);
            onClose();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, selectedIndex, allItems, quickMode, onNavigate, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Save quick note to memories
  const handleSaveMemory = async () => {
    if (!quickInput.trim()) return;
    setQuickStatus({ loading: true, msg: 'Saving memory...' });
    try {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fact: quickInput.trim(), category: 'personal' })
      });
      if (res.ok) {
        setQuickStatus({ success: true, msg: 'Memory stored permanently!' });
        setTimeout(() => {
          setQuickMode(null);
          onClose();
        }, 800);
      } else {
        setQuickStatus({ error: true, msg: 'Failed to save memory.' });
      }
    } catch (e) {
      setQuickStatus({ error: true, msg: 'Network error saving memory.' });
    }
  };

  // Save quick dev idea
  const handleSaveDevIdea = async () => {
    if (!quickInput.trim()) return;
    setQuickStatus({ loading: true, msg: 'Logging idea...' });
    try {
      const res = await fetch('/api/dev-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: quickInput.trim(), category: 'IMS Desktop', source: 'command_palette' })
      });
      if (res.ok) {
        setQuickStatus({ success: true, msg: 'Dev idea queued for Antigravity!' });
        setTimeout(() => {
          setQuickMode(null);
          onClose();
        }, 800);
      } else {
        setQuickStatus({ error: true, msg: 'Failed to log dev idea.' });
      }
    } catch (e) {
      setQuickStatus({ error: true, msg: 'Network error logging idea.' });
    }
  };

  if (!isOpen) return null;

  const bgModal = isDark ? 'bg-slate-900/90 border-white/10 text-slate-100' : 'bg-white/95 border-[#2E2B27]/10 text-slate-900';
  const inputBg = isDark ? 'bg-slate-800/60 border-white/10 text-slate-100 placeholder-slate-500' : 'bg-slate-100/80 border-[#2E2B27]/10 text-slate-900 placeholder-slate-400';
  const itemHover = isDark ? 'hover:bg-slate-800/60' : 'hover:bg-slate-100';
  const selectedBg = isDark ? 'bg-violet-600/20 border-violet-500/30 text-white' : 'bg-violet-50 border-violet-200 text-violet-950';

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[12vh] px-4 backdrop-blur-md bg-black/50 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-2xl rounded-2xl shadow-2xl border backdrop-blur-xl overflow-hidden flex flex-col max-h-[75vh] ${bgModal}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search header or quick action banner */}
        {!quickMode ? (
          <div className="flex items-center px-4 py-3.5 border-b border-inherit gap-3">
            <Search size={20} className="text-violet-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 24+ portals, check glucose, or add notes... (Type / or keywords)"
              className={`flex-1 bg-transparent text-sm outline-none ${isDark ? 'text-white' : 'text-slate-900'}`}
              onKeyDown={(e) => {
                if (e.key === 'Escape' || e.code === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                }
              }}
            />
            <div className="flex items-center gap-2 shrink-0">
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${isDark ? 'bg-slate-800/80 border-white/10 text-slate-400' : 'bg-slate-200 border-slate-300 text-slate-600'}`}>ESC</span>
              <button
                onClick={onClose}
                className={`p-1.5 rounded-lg border transition-all active:scale-95 ${
                  isDark 
                    ? 'hover:bg-white/10 text-slate-400 hover:text-white border-white/10' 
                    : 'hover:bg-slate-200 text-slate-500 hover:text-slate-900 border-slate-300'
                }`}
                title="Close Command Palette (Esc)"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-3 border-b border-inherit bg-violet-600/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-violet-400">
              {quickMode === 'glucose' && <Activity size={18} />}
              {quickMode === 'note' && <Brain size={18} />}
              {quickMode === 'idea' && <Lightbulb size={18} />}
              <span>
                {quickMode === 'glucose' && 'Nightscout Live Blood Glucose Telemetry'}
                {quickMode === 'note' && 'Quick Add Memory / Fact'}
                {quickMode === 'idea' && 'Quick Log Developer Idea / Bug'}
              </span>
            </div>
            <button
              onClick={() => setQuickMode(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 transition"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Modal body */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 min-h-[220px]">
          {quickMode === 'glucose' && (
            <div className="p-4 flex flex-col items-center justify-center text-center">
              {loadingGlucose ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-8">
                  <RefreshCw size={16} className="animate-spin text-violet-400" />
                  <span>Connecting to Nightscout live feed...</span>
                </div>
              ) : glucoseData ? (
                <div className="w-full max-w-md p-4 rounded-xl border border-white/10 bg-slate-950/40 flex flex-col items-center gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl font-extrabold text-emerald-400 font-mono">
                      {glucoseData.sgv !== undefined ? (glucoseData.sgv >= 30 ? (glucoseData.sgv / 18.018).toFixed(1) : glucoseData.sgv) : '5.8'}
                    </span>
                    <span className="text-sm font-bold text-slate-400">mmol/L</span>
                    <span className="text-2xl font-black text-emerald-400 font-mono">
                      {glucoseData.direction === 'Flat' ? '→' : glucoseData.direction === 'FortyFiveUp' ? '↗' : glucoseData.direction === 'FortyFiveDown' ? '↘' : '→'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-4">
                    <span>Delta: <strong className="text-slate-200">{glucoseData.delta ? `${glucoseData.delta > 0 ? '+' : ''}${glucoseData.delta} mmol/L` : '0.0'}</strong></span>
                    <span>Status: <strong className="text-emerald-400">In Range (4.0 - 7.5)</strong></span>
                  </div>
                  <button
                    onClick={() => {
                      onNavigate('/ims/glucose');
                      onClose();
                    }}
                    className="mt-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex items-center gap-1.5 shadow-md"
                  >
                    <span>Open Blood Sugar Hub</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              ) : (
                <div className="text-sm text-slate-400 py-6">
                  <p>Unable to connect to Nightscout. Check network connection.</p>
                </div>
              )}
            </div>
          )}

          {(quickMode === 'note' || quickMode === 'idea') && (
            <div className="p-4 flex flex-col gap-3">
              <textarea
                autoFocus
                rows={3}
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                placeholder={quickMode === 'note' ? 'e.g. Workshop garage door lock code is 8842...' : 'e.g. Add real-time audio FFT visualizer to browser IMS screen...'}
                className={`w-full p-3 rounded-xl text-sm outline-none border resize-none leading-relaxed ${inputBg}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    quickMode === 'note' ? handleSaveMemory() : handleSaveDevIdea();
                  }
                }}
              />
              {quickStatus && (
                <p className={`text-xs ${quickStatus.error ? 'text-red-400' : quickStatus.success ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {quickStatus.msg}
                </p>
              )}
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] text-slate-500">Press Ctrl+Enter or tap button to save</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setQuickMode(null)}
                    className="px-3 py-1.5 rounded-lg text-xs border border-inherit text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={quickMode === 'note' ? handleSaveMemory : handleSaveDevIdea}
                    disabled={!quickInput.trim() || quickStatus?.loading}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md disabled:opacity-40"
                  >
                    {quickStatus?.loading ? 'Saving...' : 'Save Directly'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {!quickMode && (
            <div className="flex flex-col gap-1">
              {allItems.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  No matching portals or actions found for "{query}".
                </div>
              ) : (
                allItems.map((item, idx) => {
                  const Icon = item.icon || Layers;
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      data-index={idx}
                      onClick={() => {
                        if (item.onExecute) {
                          item.onExecute();
                        } else if (item.path) {
                          onNavigate(item.path);
                          onClose();
                        }
                      }}
                      className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition border border-transparent ${
                        isSelected ? selectedBg : itemHover
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg shrink-0 ${isSelected ? 'bg-violet-600 text-white' : isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'}`}>
                          <Icon size={16} />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold truncate">{item.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${isDark ? 'bg-white/5 text-slate-400' : 'bg-black/5 text-slate-500'}`}>
                              {item.category}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400 truncate">{item.description}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 pl-2">
                        {item.path && <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">{item.path}</span>}
                        <ArrowRight size={14} className={isSelected ? 'text-violet-400' : 'text-slate-600'} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className={`px-4 py-2.5 border-t border-inherit flex items-center justify-between text-[11px] ${isDark ? 'bg-slate-950/40 text-slate-400' : 'bg-slate-50 text-slate-600'}`}>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><strong className="font-semibold text-slate-300">↑↓</strong> Navigate</span>
            <span className="flex items-center gap-1"><strong className="font-semibold text-slate-300">↵</strong> Select</span>
            <span className="flex items-center gap-1"><strong className="font-semibold text-slate-300">ESC</strong> Close</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400 font-mono">
            <kbd className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-600/20 text-violet-300 border border-violet-500/30">Ctrl + K</kbd>
            <span>Quick Launcher</span>
          </div>
        </div>
      </div>
    </div>
  );
}
