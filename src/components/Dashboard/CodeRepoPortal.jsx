import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Code2, Search, RefreshCw, CheckCircle2, AlertCircle, AlertTriangle, Trash2,
  ExternalLink, Sparkles, BookOpen, Layers, ShieldCheck, Cpu, Terminal,
  ChevronRight, ChevronDown, ChevronUp, FileCode, Check, Copy, Edit3, Save, Compass,
  KeyRound, GitBranch, Lock, Eye, EyeOff, X, CheckSquare, Square,
  Boxes, Server, Wrench, Shield, ArrowRight, User, Building, HardDrive,
  Activity, Play, CheckCircle, Database, Mic, Speaker, ArrowUpRight
} from 'lucide-react';
import PortalShell from './PortalShell';

// System Architecture ACCENTS palette
const ACCENTS = {
  purple: { text: 'text-purple-500', badge: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20', line: '#a855f7', glow: 'rgba(168, 85, 247, 0.25)' },
  blue: { text: 'text-blue-500', badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', line: '#3b82f6', glow: 'rgba(59, 130, 246, 0.25)' },
  violet: { text: 'text-violet-500', badge: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20', line: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.25)' },
  green: { text: 'text-emerald-500', badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', line: '#10b981', glow: 'rgba(16, 185, 129, 0.25)' },
  orange: { text: 'text-orange-500', badge: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20', line: '#f59e0b', glow: 'rgba(245, 158, 11, 0.25)' },
  red: { text: 'text-rose-500', badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20', line: '#f43f5e', glow: 'rgba(244, 63, 94, 0.25)' },
  indigo: { text: 'text-indigo-500', badge: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20', line: '#6366f1', glow: 'rgba(99, 102, 241, 0.25)' },
  sky: { text: 'text-sky-500', badge: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20', line: '#0ea5e9', glow: 'rgba(14, 165, 233, 0.25)' },
  amber: { text: 'text-amber-500', badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', line: '#f59e0b', glow: 'rgba(245, 158, 11, 0.25)' },
  cyan: { text: 'text-cyan-500', badge: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20', line: '#06b6d4', glow: 'rgba(6, 182, 212, 0.25)' },
  slate: { text: 'text-slate-500', badge: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20', line: '#64748b', glow: 'rgba(100, 116, 139, 0.25)' },
};

// 5 Functional Categories
const FUNCTIONAL_CATEGORIES = [
  {
    key: 'ui',
    title: 'UI & Presentation Components',
    subtitle: 'SharePoint SPFx web parts, responsive React containers, dialogs & visual elements',
    icon: Boxes,
    accent: 'blue'
  },
  {
    key: 'hooks',
    title: 'Custom Hooks, Audio & State',
    subtitle: 'React hooks, state closures, WebSocket subscriptions & audio streaming pipelines',
    icon: Sparkles,
    accent: 'violet'
  },
  {
    key: 'services',
    title: 'Backend Services & API Pipelines',
    subtitle: 'Node/Express endpoints, Gemini Live orchestration, HNSW vector search & database stores',
    icon: Server,
    accent: 'green'
  },
  {
    key: 'firmware',
    title: 'Firmware & Embedded Hardware',
    subtitle: 'ESP32-S3 FreeRTOS tasks, I2S / DMA audio drivers & LovyanGFX display routines',
    icon: Cpu,
    accent: 'orange'
  },
  {
    key: 'testing',
    title: 'Architecture, Testing & Utilities',
    subtitle: 'Validation schemas, test runners, resilience guards & shared mathematical helpers',
    icon: Shield,
    accent: 'red'
  }
];

function classifyPatternCategory(snippet) {
  const p = (snippet.file_path || '').toLowerCase();
  const t = (snippet.title || '').toLowerCase();
  const d = (snippet.description || '').toLowerCase();
  const tech = (snippet.technology || '').toLowerCase();

  if (p.includes('firmware') || p.includes('esp32') || p.endsWith('.cpp') || p.endsWith('.h') || tech.includes('c++') || tech.includes('esp')) {
    return 'firmware';
  }
  if (p.includes('hook') || t.startsWith('use') || p.includes('use') || d.includes('hook') || t.includes('state') || tech.includes('zustand')) {
    return 'hooks';
  }
  if (p.includes('service') || p.includes('server') || p.includes('route') || p.includes('api') || tech.includes('express') || tech.includes('node') || d.includes('backend')) {
    return 'services';
  }
  if (p.includes('test') || p.includes('spec') || d.includes('test') || t.includes('test') || t.includes('audit')) {
    return 'testing';
  }
  return 'ui';
}

/**
 * Derive interaction flow nodes for a snippet to generate diagrammatic infographics.
 */
function getInteractionFlow(snippet) {
  const cat = classifyPatternCategory(snippet);
  const title = snippet.title || 'Component';

  if (cat === 'firmware') {
    return {
      trigger: { label: 'Microphone Hardware', sub: 'ES7210 16kHz I2S DMA', accent: 'orange' },
      guard: { label: 'Acoustic Cooldown Guard', sub: 'Half-duplex mic suppression', accent: 'red' },
      core: { label: title, sub: `${snippet.language} • ${snippet.technology}`, accent: 'amber' },
      sink: { label: 'Speaker DAC & Network', sub: 'Raw BSD Socket & ES8311', accent: 'green' },
      deps: [
        { label: 'FreeRTOS Core 0', sub: 'Queue pacing & DRAM', accent: 'sky' },
        { label: 'LovyanGFX LCD', sub: '320x240 LCD rendering', accent: 'blue' }
      ]
    };
  }

  if (cat === 'hooks') {
    return {
      trigger: { label: 'Component Lifecycle', sub: 'Mount / User event trigger', accent: 'violet' },
      guard: { label: 'State & Effect Closure', sub: 'Memoized dependency array', accent: 'blue' },
      core: { label: title, sub: `Custom Hook • ${snippet.technology}`, accent: 'violet' },
      sink: { label: 'Reactive State Store', sub: 'Consumer UI re-render', accent: 'green' },
      deps: [
        { label: 'WebSocket / Fetch', sub: 'Real-time telemetry stream', accent: 'indigo' },
        { label: 'LocalStorage / AudioContext', sub: 'Client state persistence', accent: 'sky' }
      ]
    };
  }

  if (cat === 'services') {
    return {
      trigger: { label: 'Client REST / SSE Request', sub: 'Incoming HTTP endpoint call', accent: 'green' },
      guard: { label: 'Payload & Invariant Guard', sub: 'Runtime schema & null safety', accent: 'red' },
      core: { label: title, sub: `Backend Service • ${snippet.technology}`, accent: 'green' },
      sink: { label: 'SQLite & Vector Store', sub: 'Atomic persistence & HNSW index', accent: 'sky' },
      deps: [
        { label: 'Gemini Generative AI', sub: 'Multimodal / Flash RAG', accent: 'violet' },
        { label: 'Express Router', sub: 'SSE EventStream pacing', accent: 'indigo' }
      ]
    };
  }

  if (cat === 'testing') {
    return {
      trigger: { label: 'CI / Test Harness', sub: 'Automated runner execution', accent: 'red' },
      guard: { label: 'Assertion Invariants', sub: 'Boundary & exception contracts', accent: 'orange' },
      core: { label: title, sub: `Testing Suite • ${snippet.technology}`, accent: 'red' },
      sink: { label: 'Verification Telemetry', sub: 'Pass/Fail audit metrics', accent: 'green' },
      deps: [
        { label: 'Mock Codec / Fixture', sub: 'Isolated sandbox environment', accent: 'blue' },
        { label: 'Triple Registry Matrix', sub: 'DoD compliance tracking', accent: 'violet' }
      ]
    };
  }

  return {
    trigger: { label: 'User Interaction / Page', sub: 'Touch, click or layout mount', accent: 'blue' },
    guard: { label: 'Theme & Prop Contracts', sub: 'Strict TypeScript interfaces', accent: 'indigo' },
    core: { label: title, sub: `UI Component • ${snippet.technology}`, accent: 'blue' },
    sink: { label: 'Rendered DOM Tree', sub: 'Virtual DOM reconciliation', accent: 'green' },
    deps: [
      { label: 'Fluent UI 2 / Tailwind', sub: 'Design tokens & typography', accent: 'purple' },
      { label: 'Parent Dashboard / Hub', sub: 'PortalShell container', accent: 'sky' }
    ]
  };
}

/**
 * Clean SVG Radial Gauge component displaying circular ring, numeric score, and clear title.
 */
function RadialScoreGauge({ score = 9.0, maxScore = 10, title, subtitle, isDark }) {
  const radius = 24;
  const strokeWidth = 4.5;
  const circumference = 2 * Math.PI * radius;
  const numScore = Number(score) || 0;
  const normalizedScore = Math.min(Math.max(numScore, 0), maxScore);
  const strokeDashoffset = circumference - (normalizedScore / maxScore) * circumference;

  let color = '#10b981'; // green >= 9
  if (normalizedScore < 7.0) {
    color = '#f43f5e'; // red < 7
  } else if (normalizedScore < 8.2) {
    color = '#f59e0b'; // orange < 8.2
  } else if (normalizedScore < 9.0) {
    color = '#3b82f6'; // blue < 9
  }

  return (
    <div className={`p-3 rounded-2xl border flex flex-col items-center text-center transition-all ${
      isDark ? 'bg-slate-900/80 border-white/10' : 'bg-white border-slate-200/80 shadow-[0_4px_16px_rgba(15,23,42,0.04)]'
    }`}>
      <div className="relative w-[68px] h-[68px] flex items-center justify-center my-0.5">
        <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 68 68">
          <circle
            cx="34"
            cy="34"
            r={radius}
            stroke={isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <circle
            cx="34"
            cy="34"
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-black font-mono tracking-tight leading-none" style={{ color }}>
            {normalizedScore.toFixed(1)}
          </span>
          <span className={`text-[8.5px] font-bold mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            / 10
          </span>
        </div>
      </div>

      <span className={`text-[11.5px] font-bold mt-1.5 leading-snug line-clamp-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
        {title}
      </span>
      {subtitle && (
        <span className={`text-[9.5px] mt-0.5 line-clamp-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          {subtitle}
        </span>
      )}
    </div>
  );
}

/**
 * Visual Interaction Infographic (Hub-and-spoke inspired by System Architecture).
 */
function InteractionInfographic({ snippet, isDark }) {
  const flow = getInteractionFlow(snippet);

  const nodeBox = (node, tag) => {
    const a = ACCENTS[node.accent] || ACCENTS.blue;
    return (
      <div className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
        isDark ? 'bg-slate-900/90 border-white/10' : 'bg-white border-slate-200/90 shadow-[0_4px_16px_rgba(15,23,42,0.04)]'
      }`}>
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wider ${a.badge}`}>
            {tag}
          </span>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: a.line }} />
        </div>
        <div className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
          {node.label}
        </div>
        <div className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          {node.sub}
        </div>
      </div>
    );
  };

  return (
    <div className={`rounded-2xl border p-5 transition-all ${
      isDark ? 'bg-slate-950/70 border-white/10' : 'bg-slate-50/80 border-slate-200/90'
    }`}>
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200/80 dark:border-white/10">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-500">
            <Layers size={15} />
          </span>
          <div>
            <h4 className={`text-xs font-extrabold uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Interaction & Data Flow Infographic
            </h4>
            <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Runtime execution boundaries, pipeline stages, and downstream dependencies
            </p>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? 'bg-white/10 text-slate-300' : 'bg-white text-slate-700 border border-slate-200'}`}>
          Active Architecture
        </span>
      </div>

      {/* 4-Stage Horizontal Pipeline Flow with SVG Connectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 relative items-stretch">
        {nodeBox(flow.trigger, '1. Trigger / Input')}
        {nodeBox(flow.guard, '2. Boundary Guard')}
        {nodeBox(flow.core, '3. Core Unit')}
        {nodeBox(flow.sink, '4. State & Sink')}
      </div>

      {/* Downstream Dependencies Row */}
      {flow.deps?.length > 0 && (
        <div className="mt-3.5 pt-3 border-t border-slate-200/60 dark:border-white/10 flex flex-wrap items-center gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Connected Integrations:
          </span>
          {flow.deps.map((dep, idx) => {
            const a = ACCENTS[dep.accent] || ACCENTS.blue;
            return (
              <span
                key={idx}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10.5px] font-semibold border ${a.badge}`}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: a.line }} />
                <span>{dep.label}</span>
                <span className="opacity-60 text-[9.5px]">({dep.sub})</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CodeRepoPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';

  // Repositories & filtering
  const [repositories, setRepositories] = useState([]);
  const [selectedRepoId, setSelectedRepoId] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTech, setSelectedTech] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [snippets, setSnippets] = useState([]);
  const [activeSnippet, setActiveSnippet] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Collapsible accordion states for the two accounts
  const [personalExpanded, setPersonalExpanded] = useState(true);
  const [turntownExpanded, setTurntownExpanded] = useState(true);

  // GitHub Access Tokens state & modal
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [tokenStatus, setTokenStatus] = useState({
    personalConfigured: false,
    personalMasked: '',
    turntownConfigured: false,
    turntownMasked: ''
  });
  const [personalTokenInput, setPersonalTokenInput] = useState('');
  const [turntownTokenInput, setTurntownTokenInput] = useState('');
  const [showPersonalToken, setShowPersonalToken] = useState(false);
  const [showTurntownToken, setShowTurntownToken] = useState(false);
  const [isSavingTokens, setIsSavingTokens] = useState(false);
  const [isDiscoveringRepos, setIsDiscoveringRepos] = useState(false);

  // Scan state (SSE)
  const [isScanning, setIsScanning] = useState(false);
  const [scanTarget, setScanTarget] = useState(null); // 'all', 'personal', 'turntown', or repoId
  const [scanLogs, setScanLogs] = useState([]);
  const [scanProgress, setScanProgress] = useState(0);

  // Observation state & UI feedback
  const [editingObservations, setEditingObservations] = useState('');
  const [isSavingObs, setIsSavingObs] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [notification, setNotification] = useState(null);

  const overviewRef = useRef(null);

  const showToast = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(prev => prev?.msg === msg ? null : prev), 4000);
  }, []);

  // Fetch token status with verification
  const loadTokenStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/code-repo/tokens');
      const data = await res.json();
      if (data.success) {
        setTokenStatus({
          personalConfigured: data.personalConfigured,
          personalMasked: data.personalMasked,
          personalUser: data.personalUser,
          personalValid: data.personalValid,
          turntownConfigured: data.turntownConfigured,
          turntownMasked: data.turntownMasked,
          turntownUser: data.turntownUser,
          turntownValid: data.turntownValid,
          turntownExpected: data.turntownExpected,
          turntownMismatch: data.turntownMismatch
        });
      }
    } catch (err) {
      console.error('Failed loading tokens:', err);
    }
  }, []);

  // Fetch repositories
  const loadRepositories = useCallback(async () => {
    try {
      const res = await fetch('/api/code-repo/repositories');
      const data = await res.json();
      if (data.success) {
        setRepositories(data.repositories || []);
      }
    } catch (err) {
      console.error('Failed loading repos:', err);
    }
  }, []);

  // Fetch snippets
  const loadSnippets = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedRepoId !== 'all') params.set('repoId', selectedRepoId);
      if (selectedTech !== 'all') params.set('technology', selectedTech);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/code-repo/snippets?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setSnippets(data.snippets || []);
        if (data.snippets?.length > 0 && !activeSnippet) {
          setActiveSnippet(data.snippets[0]);
          setEditingObservations(data.snippets[0].user_observations || '');
        }
      }
    } catch (err) {
      showToast('Failed to load code snippets: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [selectedRepoId, selectedTech, searchQuery, activeSnippet, showToast]);

  useEffect(() => {
    loadTokenStatus();
    loadRepositories();
    loadSnippets();
  }, [loadTokenStatus, loadRepositories, loadSnippets]);

  // Select snippet & scroll to full-column overview smoothly
  const handleSelectSnippet = (s) => {
    setActiveSnippet(s);
    setEditingObservations(s.user_observations || '');
    if (overviewRef.current) {
      overviewRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Save tokens
  const handleSaveTokens = async () => {
    setIsSavingTokens(true);
    try {
      const payload = {};
      if (personalTokenInput.trim()) payload.personalToken = personalTokenInput.trim();
      if (turntownTokenInput.trim()) payload.turntownToken = turntownTokenInput.trim();

      const res = await fetch('/api/code-repo/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setTokenStatus({
          personalConfigured: data.personalConfigured,
          personalMasked: data.personalMasked,
          personalUser: data.personalUser,
          personalValid: data.personalValid,
          turntownConfigured: data.turntownConfigured,
          turntownMasked: data.turntownMasked,
          turntownUser: data.turntownUser,
          turntownValid: data.turntownValid,
          turntownExpected: data.turntownExpected,
          turntownMismatch: data.turntownMismatch
        });
        setPersonalTokenInput('');
        setTurntownTokenInput('');
        if (data.turntownMismatch) {
          showToast(`TurnTown token saved, but belongs to @${data.turntownUser} instead of @simon-philpott-turntown`, 'error');
        } else {
          showToast('GitHub access tokens saved securely');
        }
      } else {
        throw new Error(data.error || 'Failed saving tokens');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSavingTokens(false);
    }
  };

  // Discover repositories
  const handleDiscoverRepos = async () => {
    setIsDiscoveringRepos(true);
    try {
      const res = await fetch('/api/code-repo/discover-repos', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setRepositories(data.repositories || []);
        showToast(`Discovered ${data.discoveredCount} repositories from GitHub accounts`);
      } else {
        throw new Error(data.error || 'Failed discovering repositories');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsDiscoveringRepos(false);
    }
  };

  // Delete repository
  const handleDeleteRepo = async (repoId, repoName) => {
    if (!window.confirm(`Remove ${repoName} from tracked repositories?`)) return;
    try {
      const res = await fetch(`/api/code-repo/repositories/${repoId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setRepositories(data.repositories || []);
        showToast(`Removed repository ${repoName}`);
      } else {
        throw new Error(data.error || 'Failed removing repository');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Toggle selection for a repo
  const handleToggleSelectRepo = async (id, currentVal) => {
    try {
      const res = await fetch(`/api/code-repo/repositories/${id}/toggle-select`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSelected: !currentVal })
      });
      const data = await res.json();
      if (data.success) {
        setRepositories(prev => prev.map(r => r.id === id ? { ...r, is_selected: !currentVal ? 1 : 0 } : r));
      }
    } catch (err) {
      showToast('Error updating selection', 'error');
    }
  };

  // Toggle select all for an account
  const handleToggleSelectAccount = async (accountType, selectState) => {
    try {
      const reposToToggle = repositories.filter(r => (r.account || 'personal') === accountType);
      for (const repo of reposToToggle) {
        await fetch(`/api/code-repo/repositories/${repo.id}/toggle-select`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isSelected: selectState })
        });
      }
      setRepositories(prev => prev.map(r => (r.account || 'personal') === accountType ? { ...r, is_selected: selectState ? 1 : 0 } : r));
    } catch (err) {
      showToast('Error updating selections', 'error');
    }
  };

  // Save manual observation notes
  const handleSaveObservations = async () => {
    if (!activeSnippet) return;
    setIsSavingObs(true);
    try {
      const res = await fetch(`/api/code-repo/snippets/${activeSnippet.id}/observations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userObservations: editingObservations })
      });
      const data = await res.json();
      if (data.success) {
        setActiveSnippet(data.snippet);
        setSnippets(prev => prev.map(s => s.id === data.snippet.id ? data.snippet : s));
        showToast('Observation notes updated successfully');
      } else {
        throw new Error(data.error || 'Failed saving observations');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSavingObs(false);
    }
  };

  // Single repo scan
  const handleStartScan = (repoId) => {
    setScanTarget(repoId);
    setIsScanning(true);
    setScanLogs([]);
    setScanProgress(0);

    const eventSource = new EventSource(`/api/code-repo/scan-stream/${repoId}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message) {
          setScanLogs(prev => [...prev, data.message]);
        }
        if (typeof data.progress === 'number') {
          setScanProgress(data.progress);
        }
        if (data.phase === 'finished') {
          eventSource.close();
          setIsScanning(false);
          setScanTarget(null);
          loadRepositories();
          loadSnippets();
          showToast(data.message || 'Scan completed successfully!');
        } else if (data.phase === 'error') {
          eventSource.close();
          setIsScanning(false);
          setScanTarget(null);
          showToast(data.message || 'Scan encountered an error', 'error');
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err);
      eventSource.close();
      setIsScanning(false);
      setScanTarget(null);
      showToast('Scan connection interrupted', 'error');
    };
  };

  // Batch scan by account (e.g. 'personal' or 'turntown')
  const handleStartAccountScan = (accountType) => {
    const accountRepos = repositories.filter(r => (r.account || 'personal') === accountType && r.is_selected);
    if (accountRepos.length === 0) {
      showToast(`No ${accountType} repositories selected for scanning`, 'error');
      return;
    }

    setScanTarget(accountType);
    setIsScanning(true);
    setScanLogs([]);
    setScanProgress(0);

    const eventSource = new EventSource(`/api/code-repo/scan-all-stream?account=${accountType}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message) {
          setScanLogs(prev => [...prev, data.message]);
        }
        if (typeof data.progress === 'number') {
          setScanProgress(data.progress);
        }
        if (data.phase === 'finished') {
          eventSource.close();
          setIsScanning(false);
          setScanTarget(null);
          loadRepositories();
          loadSnippets();
          showToast(data.message || `${accountType} repositories scanned successfully!`);
        } else if (data.phase === 'error') {
          eventSource.close();
          setIsScanning(false);
          setScanTarget(null);
          showToast(data.message || 'Scan encountered an error', 'error');
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err);
      eventSource.close();
      setIsScanning(false);
      setScanTarget(null);
      showToast('Scan connection interrupted', 'error');
    };
  };

  // Copy code handler with immediate clipboard feedback
  const handleCopyCode = () => {
    if (!activeSnippet?.code_content) return;
    navigator.clipboard.writeText(activeSnippet.code_content);
    setCopiedCode(true);
    showToast('Code copied to clipboard');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Partition repositories by account
  const personalRepos = useMemo(() => {
    return repositories.filter(r => (r.account || 'personal') === 'personal');
  }, [repositories]);

  const turntownRepos = useMemo(() => {
    return repositories.filter(r => r.account === 'turntown');
  }, [repositories]);

  // Group snippets by functional category
  const groupedSnippets = useMemo(() => {
    const groups = {
      ui: [],
      hooks: [],
      services: [],
      firmware: [],
      testing: []
    };

    snippets.forEach(snip => {
      const cat = classifyPatternCategory(snip);
      if (groups[cat]) {
        groups[cat].push(snip);
      } else {
        groups.ui.push(snip);
      }
    });

    return groups;
  }, [snippets]);

  // Aggregate technologies for dropdown filter
  const availableTechs = useMemo(() => {
    const set = new Set();
    snippets.forEach(s => { if (s.technology) set.add(s.technology); });
    return Array.from(set);
  }, [snippets]);

  return (
    <PortalShell
      title="Code Best Practices"
      subtitle="Architectural patterns, SOLID assessments, and sustainability evaluations across repositories"
      icon={Code2}
      theme={theme}
      onThemeToggle={onThemeToggle}
      currentPath="/ims/code-repo"
      setCurrentPath={setCurrentPath}
      badgeText={`${snippets.length} Patterns`}
    >
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-2xl border flex items-center gap-2.5 shadow-2xl backdrop-blur-md transition-all ${
          notification.type === 'error'
            ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
            : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
        }`}>
          {notification.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span className="text-xs font-semibold">{notification.msg}</span>
        </div>
      )}

      {/* Top Utility Header & Action Bar */}
      <div className={`rounded-2xl border p-5 sm:p-6 mb-6 backdrop-blur-xl transition-all ${
        isDark ? 'bg-slate-900/80 border-white/10' : 'bg-white border-slate-200/80 shadow-[0_6px_24px_rgba(15,23,42,0.06)]'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-blue-500/10 text-blue-500">
              <GitBranch size={20} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-base font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Connected GitHub Repositories
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${isDark ? 'bg-white/10 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>
                  {repositories.length} Total
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Personal & professional codebases evaluated against 5 engineering principles with automated vector RAG synthesis.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              onClick={() => setIsTokenModalOpen(true)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
              }`}
            >
              <KeyRound size={14} className="text-blue-500" />
              <span>GitHub Tokens & Setup</span>
            </button>

            <button
              onClick={handleDiscoverRepos}
              disabled={isDiscoveringRepos}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                isDark
                  ? 'bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-500/30'
                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
              }`}
            >
              <RefreshCw size={13} className={isDiscoveringRepos ? 'animate-spin' : ''} />
              <span>{isDiscoveringRepos ? 'Syncing Repos...' : 'Sync / Discover Repos'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* DUAL COLLAPSIBLES: Personal & Professional Repositories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        {/* Card 1: Personal Repositories (simonphilpott) */}
        <div className={`rounded-2xl border transition-all overflow-hidden ${
          isDark ? 'bg-slate-900/80 border-white/10' : 'bg-white border-slate-200/80 shadow-[0_6px_24px_rgba(15,23,42,0.06)]'
        }`}>
          {/* Header */}
          <div className="p-4 flex items-center justify-between gap-3 border-b border-slate-200/80 dark:border-white/10">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-blue-500/10 text-blue-500">
                <User size={18} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    Personal Repositories
                  </h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isDark ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-700'}`}>
                    {personalRepos.length}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    tokenStatus.personalConfigured
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                  }`}>
                    {tokenStatus.personalConfigured ? `PAT Active (${tokenStatus.personalMasked})` : 'Public API'}
                  </span>
                </div>
                <div className={`text-[11px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  github.com/simonphilpott • Personal tools & open-source projects
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleStartAccountScan('personal')}
                disabled={isScanning}
                className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white transition-all disabled:opacity-50 shadow-sm"
                title="Scan all selected personal repositories"
              >
                <RefreshCw size={12} className={isScanning && scanTarget === 'personal' ? 'animate-spin' : ''} />
                <span>Scan Personal</span>
              </button>
              <button
                onClick={() => setPersonalExpanded(!personalExpanded)}
                className={`p-1.5 rounded-lg border transition-colors ${
                  isDark ? 'border-slate-800 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-600'
                }`}
                title={personalExpanded ? 'Collapse list' : 'Expand list'}
              >
                {personalExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          </div>

          {/* Progress bar if scanning personal */}
          {isScanning && (scanTarget === 'personal' || (typeof scanTarget === 'string' && personalRepos.some(r => r.id === scanTarget))) && (
            <div className="px-4 py-2.5 bg-blue-500/10 border-b border-blue-500/20">
              <div className="flex justify-between items-center text-[11px] font-bold text-blue-500 mb-1">
                <span className="flex items-center gap-1.5">
                  <RefreshCw size={11} className="animate-spin" />
                  Scanning Personal Repositories...
                </span>
                <span className="font-mono">{scanProgress}%</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${scanProgress}%` }} />
              </div>
              <div className="text-[10px] font-mono text-slate-400 truncate mt-1">
                {scanLogs[scanLogs.length - 1] || 'Scanning files...'}
              </div>
            </div>
          )}

          {/* Collapsible Content */}
          {personalExpanded && (
            <div className="p-4">
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200/60 dark:border-white/10 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleSelectAccount('personal', !personalRepos.every(r => r.is_selected))}
                    className="font-bold text-blue-500 hover:underline flex items-center gap-1"
                  >
                    {personalRepos.every(r => r.is_selected) ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    ({personalRepos.filter(r => r.is_selected).length} of {personalRepos.length} enabled)
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                {personalRepos.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No personal repositories discovered.</p>
                ) : (
                  personalRepos.map(repo => {
                    const isSelected = Boolean(repo.is_selected);
                    return (
                      <div
                        key={repo.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                          isSelected
                            ? isDark
                              ? 'bg-slate-900 border-blue-500/30 text-white'
                              : 'bg-blue-50/60 border-blue-200 text-slate-900'
                            : isDark
                              ? 'bg-slate-950/40 border-slate-800 text-slate-400'
                              : 'bg-white border-slate-200 text-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            onClick={() => handleToggleSelectRepo(repo.id, isSelected)}
                            className="shrink-0 text-blue-500 cursor-pointer"
                          >
                            {isSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                          </button>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold truncate">{repo.name}</span>
                              {Boolean(repo.is_private) && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-semibold border border-amber-500/20 flex items-center gap-0.5">
                                  <Lock size={9} /> Private
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 truncate">
                              {repo.local_path ? 'Local: D:\\...' : repo.url?.replace('https://github.com/', '')}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {repo.last_scanned_at ? (
                            <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-medium">
                              Scanned
                            </span>
                          ) : (
                            <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400">
                              Unscanned
                            </span>
                          )}
                          <button
                            onClick={() => handleStartScan(repo.id)}
                            disabled={isScanning}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              isDark ? 'border-slate-800 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                            }`}
                            title={`Scan ${repo.name}`}
                          >
                            <RefreshCw size={11} className={isScanning && scanTarget === repo.id ? 'animate-spin' : ''} />
                          </button>
                          <button
                            onClick={() => handleDeleteRepo(repo.id, repo.name)}
                            disabled={isScanning}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              isDark ? 'border-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400' : 'border-slate-200 hover:bg-rose-50 text-slate-500 hover:text-rose-600'
                            }`}
                            title={`Remove ${repo.name} from tracked list`}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Card 2: Professional Repositories (simon-philpott-turntown) */}
        <div className={`rounded-2xl border transition-all overflow-hidden ${
          isDark ? 'bg-slate-900/80 border-white/10' : 'bg-white border-slate-200/80 shadow-[0_6px_24px_rgba(15,23,42,0.06)]'
        }`}>
          {/* Header */}
          <div className="p-4 flex items-center justify-between gap-3 border-b border-slate-200/80 dark:border-white/10">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-purple-500/10 text-purple-500">
                <Building size={18} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    Professional Repositories
                  </h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isDark ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-700'}`}>
                    {turntownRepos.length}
                  </span>
                  {tokenStatus.turntownMismatch ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                      <AlertTriangle size={10} />
                      Wrong Account (@{tokenStatus.turntownUser})
                    </span>
                  ) : (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      tokenStatus.turntownConfigured
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-slate-500/15 text-slate-500 dark:text-slate-400 border border-slate-500/20'
                    }`}>
                      {tokenStatus.turntownConfigured ? `PAT Active (${tokenStatus.turntownMasked})` : 'Token Required'}
                    </span>
                  )}
                </div>
                <div className={`text-[11px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  github.com/simon-philpott-turntown • SPFx & Turner & Townsend enterprise solutions
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleStartAccountScan('turntown')}
                disabled={isScanning}
                className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-purple-500 hover:bg-purple-600 text-white transition-all disabled:opacity-50 shadow-sm"
                title="Scan all selected professional repositories"
              >
                <RefreshCw size={12} className={isScanning && scanTarget === 'turntown' ? 'animate-spin' : ''} />
                <span>Scan TurnTown</span>
              </button>
              <button
                onClick={() => setTurntownExpanded(!turntownExpanded)}
                className={`p-1.5 rounded-lg border transition-colors ${
                  isDark ? 'border-slate-800 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-600'
                }`}
                title={turntownExpanded ? 'Collapse list' : 'Expand list'}
              >
                {turntownExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          </div>

          {/* Progress bar if scanning turntown */}
          {isScanning && (scanTarget === 'turntown' || (typeof scanTarget === 'string' && turntownRepos.some(r => r.id === scanTarget))) && (
            <div className="px-4 py-2.5 bg-purple-500/10 border-b border-purple-500/20">
              <div className="flex justify-between items-center text-[11px] font-bold text-purple-500 mb-1">
                <span className="flex items-center gap-1.5">
                  <RefreshCw size={11} className="animate-spin" />
                  Scanning TurnTown Repositories...
                </span>
                <span className="font-mono">{scanProgress}%</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div className="bg-purple-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${scanProgress}%` }} />
              </div>
              <div className="text-[10px] font-mono text-slate-400 truncate mt-1">
                {scanLogs[scanLogs.length - 1] || 'Scanning files...'}
              </div>
            </div>
          )}

          {/* Collapsible Content */}
          {turntownExpanded && (
            <div className="p-4">
              {tokenStatus.turntownMismatch && (
                <div className="mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2.5">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-500" />
                  <div className="min-w-0">
                    <p className="font-bold text-amber-500">Token Account Mismatch: Authenticated as @{tokenStatus.turntownUser}</p>
                    <p className="text-[11px] mt-0.5 leading-relaxed text-slate-600 dark:text-slate-300">
                      Your current PAT was generated by your personal GitHub account (<strong>@{tokenStatus.turntownUser}</strong>). Because your work SPFx repositories are owned by <strong>@simon-philpott-turntown</strong>, GitHub blocks access to your private work repositories with this token.
                    </p>
                    <button
                      onClick={() => setIsTokenModalOpen(true)}
                      className="mt-1.5 text-[11px] font-bold text-purple-500 hover:underline flex items-center gap-1"
                    >
                      Update TurnTown Token with Work Account →
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200/60 dark:border-white/10 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleSelectAccount('turntown', !turntownRepos.every(r => r.is_selected))}
                    className="font-bold text-purple-500 hover:underline flex items-center gap-1"
                  >
                    {turntownRepos.every(r => r.is_selected) ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    ({turntownRepos.filter(r => r.is_selected).length} of {turntownRepos.length} enabled)
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                {turntownRepos.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No TurnTown repositories discovered. Add your PAT and click Sync Repos.</p>
                ) : (
                  turntownRepos.map(repo => {
                    const isSelected = Boolean(repo.is_selected);
                    return (
                      <div
                        key={repo.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                          isSelected
                            ? isDark
                              ? 'bg-slate-900 border-purple-500/30 text-white'
                              : 'bg-purple-50/60 border-purple-200 text-slate-900'
                            : isDark
                              ? 'bg-slate-950/40 border-slate-800 text-slate-400'
                              : 'bg-white border-slate-200 text-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            onClick={() => handleToggleSelectRepo(repo.id, isSelected)}
                            className="shrink-0 text-purple-500 cursor-pointer"
                          >
                            {isSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                          </button>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold truncate">{repo.name}</span>
                              {Boolean(repo.is_private) && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold border flex items-center gap-0.5 ${
                                  tokenStatus.turntownMismatch
                                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                    : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                }`}>
                                  <Lock size={9} /> {tokenStatus.turntownMismatch ? 'Private (Work PAT Req.)' : 'Private'}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 truncate">
                              {repo.url?.replace('https://github.com/', '')}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {repo.last_scanned_at ? (
                            <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-medium">
                              Scanned
                            </span>
                          ) : (
                            <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400">
                              Unscanned
                            </span>
                          )}
                          <button
                            onClick={() => handleStartScan(repo.id)}
                            disabled={isScanning}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              isDark ? 'border-slate-800 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                            }`}
                            title={`Scan ${repo.name}`}
                          >
                            <RefreshCw size={11} className={isScanning && scanTarget === repo.id ? 'animate-spin' : ''} />
                          </button>
                          <button
                            onClick={() => handleDeleteRepo(repo.id, repo.name)}
                            disabled={isScanning}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              isDark ? 'border-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400' : 'border-slate-200 hover:bg-rose-50 text-slate-500 hover:text-rose-600'
                            }`}
                            title={`Remove ${repo.name} from tracked list`}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* GitHub Tokens Modal - Styled with System Architecture Aesthetics & Direct Creation Links */}
      {isTokenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`relative w-full max-w-xl rounded-2xl border p-6 shadow-[0_20px_50px_rgba(15,23,42,0.18)] transition-all ${
            isDark ? 'bg-slate-900 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200/80 dark:border-white/10">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-500">
                  <KeyRound size={18} />
                </span>
                <div>
                  <h3 className="text-base font-extrabold">GitHub Access Tokens</h3>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Configure Personal Access Tokens (PATs) for repository scanning and updates
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTokenModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Personal Account Token */}
              <div className={`p-4 rounded-xl border ${
                isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50/80 border-slate-200'
              }`}>
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">Personal Account</span>
                    <span className="font-mono text-xs text-blue-500">simonphilpott</span>
                  </div>
                  <a
                    href="https://github.com/settings/tokens/new?description=IMS+Personal+Code+Scanner&scopes=repo,read:org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-bold text-blue-500 hover:text-blue-600 flex items-center gap-1"
                  >
                    <span>Generate Token on GitHub</span>
                    <ArrowUpRight size={12} />
                  </a>
                </div>
                <p className={`text-[11px] mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Requires the <strong>repo</strong> scope to scan private repositories and avoid GitHub API rate limits.
                </p>
                {tokenStatus.personalValid && (
                  <div className="mb-2.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
                    <CheckCircle2 size={13} />
                    <span>Verified & Connected as @{tokenStatus.personalUser}</span>
                  </div>
                )}
                <div className="relative">
                  <input
                    type={showPersonalToken ? 'text' : 'password'}
                    placeholder={tokenStatus.personalConfigured ? `Saved (${tokenStatus.personalMasked}) — enter new to replace` : 'ghp_xxxxxxxxxxxxxxxxxxxx'}
                    value={personalTokenInput}
                    onChange={(e) => setPersonalTokenInput(e.target.value)}
                    className={`w-full pr-10 pl-3 py-2 rounded-xl text-xs font-mono border outline-none ${
                      isDark
                        ? 'bg-slate-900 border-slate-800 text-white placeholder-slate-500 focus:border-blue-500'
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPersonalToken(!showPersonalToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    {showPersonalToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Professional Account Token */}
              <div className={`p-4 rounded-xl border ${
                isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50/80 border-slate-200'
              }`}>
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">Professional Account</span>
                    <span className="font-mono text-xs text-purple-500">simon-philpott-turntown</span>
                  </div>
                  <a
                    href="https://github.com/settings/tokens/new?description=IMS+TurnTown+Code+Scanner&scopes=repo,read:org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-bold text-purple-500 hover:text-purple-600 flex items-center gap-1"
                  >
                    <span>Generate Token on GitHub</span>
                    <ArrowUpRight size={12} />
                  </a>
                </div>
                <p className={`text-[11px] mb-2 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Requires <strong>repo</strong> and <strong>read:org</strong> scopes for private and organisation repositories. If your organisation enforces SAML Single Sign-On (SSO), click <strong>Configure SSO</strong> next to the token on GitHub to authorise it.
                </p>
                {tokenStatus.turntownValid && !tokenStatus.turntownMismatch && (
                  <div className="mb-2.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
                    <CheckCircle2 size={13} />
                    <span>Verified & Connected as @{tokenStatus.turntownUser}</span>
                  </div>
                )}
                {tokenStatus.turntownMismatch && (
                  <div className="mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs">
                    <div className="font-bold flex items-center gap-1.5 mb-1 text-amber-500">
                      <AlertTriangle size={14} />
                      <span>Account Mismatch: Authenticated as @{tokenStatus.turntownUser}</span>
                    </div>
                    <p className="leading-relaxed text-[11px] text-slate-600 dark:text-slate-300">
                      This token was generated from your personal account (<strong>@{tokenStatus.turntownUser}</strong>). Because your work SPFx repositories are owned by <strong>@simon-philpott-turntown</strong>, GitHub blocks access to your private work repositories with this token.
                    </p>
                    <p className="mt-2 text-[11px] font-medium text-purple-600 dark:text-purple-400">
                      👉 <strong>Action:</strong> Open an Incognito/Private window (or switch to your work account on GitHub), sign in as <strong>simon-philpott-turntown</strong>, generate a token with <code>repo</code> scope, and paste it below.
                    </p>
                  </div>
                )}
                <div className="relative">
                  <input
                    type={showTurntownToken ? 'text' : 'password'}
                    placeholder={tokenStatus.turntownConfigured ? `Saved (${tokenStatus.turntownMasked}) — enter new to replace` : 'ghp_xxxxxxxxxxxxxxxxxxxx'}
                    value={turntownTokenInput}
                    onChange={(e) => setTurntownTokenInput(e.target.value)}
                    className={`w-full pr-10 pl-3 py-2 rounded-xl text-xs font-mono border outline-none ${
                      isDark
                        ? 'bg-slate-900 border-slate-800 text-white placeholder-slate-500 focus:border-purple-500'
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-purple-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowTurntownToken(!showTurntownToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    {showTurntownToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200/80 dark:border-white/10">
              <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Tokens are stored locally in SQLite settings and used strictly for authenticated operations.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsTokenModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTokens}
                  disabled={isSavingTokens || (!personalTokenInput.trim() && !turntownTokenInput.trim())}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-all shadow-sm disabled:opacity-50"
                >
                  {isSavingTokens ? 'Saving...' : 'Save Tokens'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className={`p-4 rounded-2xl border mb-6 flex flex-col xl:flex-row gap-3.5 items-stretch xl:items-center justify-between backdrop-blur-xl ${
        isDark ? 'bg-slate-900/80 border-white/10' : 'bg-white border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.04)]'
      }`}>
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className={`absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
          <input
            type="text"
            placeholder="Search patterns, principles, technologies, or keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-9 pr-8 py-2 rounded-xl text-xs border outline-none transition-all ${
              isDark
                ? 'bg-slate-950/70 border-slate-800 text-white placeholder-slate-500 focus:border-blue-500'
                : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500 shadow-sm'
            }`}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-0.5"
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className={`h-9 px-3 pr-8 rounded-xl text-xs border outline-none font-medium appearance-none cursor-pointer transition-colors max-w-[210px] truncate ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200 focus:border-blue-500' : 'bg-white border-slate-300 text-slate-800 shadow-sm focus:border-blue-500'
              }`}
            >
              <option value="all">All Functions (5 Groups)</option>
              {FUNCTIONAL_CATEGORIES.map(c => (
                <option key={c.key} value={c.key}>{c.title}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
          </div>

          <div className="relative">
            <select
              value={selectedRepoId}
              onChange={(e) => setSelectedRepoId(e.target.value)}
              className={`h-9 px-3 pr-8 rounded-xl text-xs border outline-none font-medium appearance-none cursor-pointer transition-colors max-w-[220px] truncate ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200 focus:border-blue-500' : 'bg-white border-slate-300 text-slate-800 shadow-sm focus:border-blue-500'
              }`}
            >
              <option value="all">All Repositories ({repositories.length})</option>
              {repositories.map(r => (
                <option key={r.id} value={r.id}>{r.name} ({r.account || 'personal'})</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
          </div>

          <div className="relative">
            <select
              value={selectedTech}
              onChange={(e) => setSelectedTech(e.target.value)}
              className={`h-9 px-3 pr-8 rounded-xl text-xs border outline-none font-medium appearance-none cursor-pointer transition-colors max-w-[180px] truncate ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200 focus:border-blue-500' : 'bg-white border-slate-300 text-slate-800 shadow-sm focus:border-blue-500'
              }`}
            >
              <option value="all">All Technologies ({availableTechs.length})</option>
              {availableTechs.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
          </div>

          {(selectedCategory !== 'all' || selectedRepoId !== 'all' || selectedTech !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSelectedRepoId('all');
                setSelectedTech('all');
                setSearchQuery('');
              }}
              className={`h-9 px-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title="Reset all filters"
            >
              <RefreshCw size={11} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* FULL-SCREEN BLOCK: Documented Patterns Grouped by Function with Visual Flow Badges */}
      <div className="mb-10 flex flex-col gap-6">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h3 className={`text-sm font-extrabold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Documented Code Patterns ({snippets.length})
            </h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${isDark ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
              Grouped by Functional Role
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-500">Loading catalogued patterns...</div>
        ) : snippets.length === 0 ? (
          <div className={`p-12 text-center rounded-2xl border ${
            isDark ? 'bg-slate-900/40 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
          }`}>
            <BookOpen size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-semibold">No code patterns found</p>
            <p className="text-xs mt-1 opacity-70">Trigger a repository scan above to extract and evaluate best practices.</p>
          </div>
        ) : (
          FUNCTIONAL_CATEGORIES
            .filter(cat => selectedCategory === 'all' || selectedCategory === cat.key)
            .map(category => {
              const categorySnippets = groupedSnippets[category.key] || [];
              if (categorySnippets.length === 0 && selectedCategory === 'all') return null;

              const a = ACCENTS[category.accent] || ACCENTS.blue;
              const Icon = category.icon;

              return (
                <div
                  key={category.key}
                  className={`rounded-2xl border p-5 backdrop-blur-xl transition-all duration-300 ${
                    isDark ? 'bg-slate-900/60 border-white/10' : 'bg-white border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.05)]'
                  }`}
                >
                  {/* Category Header */}
                  <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-200/80 dark:border-white/10">
                    <div className="flex items-center gap-3">
                      <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${a.badge}`}>
                        <Icon size={18} className={a.text} />
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {category.title}
                          </h4>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isDark ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-700'}`}>
                            {categorySnippets.length}
                          </span>
                        </div>
                        <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {category.subtitle}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Cards Grid with Mini Flow Infographic on Each Card */}
                  {categorySnippets.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500 italic">
                      No patterns found in this category matching current filters.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                      {categorySnippets.map(snip => {
                        const isSelected = activeSnippet?.id === snip.id;
                        const score = Number(snip.principles?.overallScore || snip.overallScore || 8.5);
                        const flow = getInteractionFlow(snip);

                        return (
                          <div
                            key={snip.id}
                            onClick={() => handleSelectSnippet(snip)}
                            className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 flex flex-col justify-between ${
                              isSelected
                                ? isDark
                                  ? 'bg-slate-900 border-blue-500/80 shadow-lg shadow-blue-950/40'
                                  : 'bg-blue-50/90 border-blue-400 shadow-md'
                                : isDark
                                  ? 'bg-slate-950/50 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60'
                                  : 'bg-white border-slate-200/90 hover:border-slate-300 hover:shadow-sm'
                            }`}
                            style={isSelected ? { boxShadow: `0 0 0 1.5px ${a.line}, 0 0 16px ${a.glow}` } : undefined}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <h5 className={`text-xs font-bold leading-snug line-clamp-2 ${
                                  isSelected ? 'text-blue-500 font-extrabold' : isDark ? 'text-white' : 'text-slate-900'
                                }`}>
                                  {snip.title}
                                </h5>
                                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black ${
                                  score >= 8.5
                                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                    : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                }`}>
                                  {score.toFixed(1)}/10
                                </span>
                              </div>

                              {/* Mini Diagrammatic Flow Pill */}
                              <div className={`p-2 rounded-lg mb-2.5 flex items-center justify-between text-[9.5px] border ${
                                isDark ? 'bg-slate-950/80 border-slate-800/80 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                              }`}>
                                <span className="truncate max-w-[80px] font-medium">{flow.trigger.label}</span>
                                <ArrowRight size={10} className="text-slate-400 shrink-0" />
                                <span className="truncate max-w-[80px] font-bold text-blue-500">{flow.core.label}</span>
                                <ArrowRight size={10} className="text-slate-400 shrink-0" />
                                <span className="truncate max-w-[80px] font-medium text-emerald-500">{flow.sink.label}</span>
                              </div>

                              <p className={`text-[11px] line-clamp-2 mb-3 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                {snip.description}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 text-[10px] pt-2 border-t border-slate-200/40 dark:border-white/5">
                              <span className={`px-2 py-0.5 rounded-md font-medium ${
                                isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {snip.technology}
                              </span>
                              <span className={`px-2 py-0.5 rounded-md font-medium ${
                                isDark ? 'bg-indigo-950/60 text-indigo-300 border border-indigo-500/20' : 'bg-indigo-50 text-indigo-700'
                              }`}>
                                {snip.language}
                              </span>
                              <span className={`truncate max-w-[120px] font-mono text-[9px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`} title={snip.file_path}>
                                {snip.file_path?.split('/').pop()}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
        )}
      </div>

      {/* FULL-COLUMN SCREEN BLOCK: Selected Code Pattern Architecture Overview & Engineering Principles Audit */}
      <div ref={overviewRef} className="pt-2">
        {activeSnippet ? (
          <div className={`rounded-2xl border p-6 backdrop-blur-xl flex flex-col gap-6 transition-all ${
            isDark ? 'bg-slate-900/80 border-white/10' : 'bg-white border-slate-200/80 shadow-[0_8px_30px_rgba(15,23,42,0.06)]'
          }`}>
            {/* Header: Title, Path, Repo & Fixed Copy Code Button */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-white/10">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    activeSnippet.repo_account === 'turntown'
                      ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/20'
                      : 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/20'
                  }`}>
                    {activeSnippet.repo_name || 'Repository'}
                  </span>
                  <span className={`text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    • {activeSnippet.file_path}
                  </span>
                </div>
                <h2 className={`text-xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {activeSnippet.title}
                </h2>
              </div>

              {/* Action Buttons: Ensured NO OVERFLOW with shrink-0 and clean whitespace */}
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  onClick={handleCopyCode}
                  className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all shadow-sm ${
                    copiedCode
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600 dark:text-emerald-300'
                      : isDark
                        ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100 hover:border-blue-500/40'
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                  }`}
                  title="Copy full source implementation"
                >
                  {copiedCode ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="text-blue-500" />}
                  <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                </button>
              </div>
            </div>

            {/* Pattern Summary and Role Overview */}
            <div className={`p-4 rounded-xl border ${
              isDark ? 'bg-slate-950/60 border-slate-800/80 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}>
              <h4 className={`text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-2 ${
                isDark ? 'text-blue-400' : 'text-blue-700'
              }`}>
                <Compass size={14} />
                Architecture Overview & Role
              </h4>
              <p className="text-xs leading-relaxed">
                {activeSnippet.description}
              </p>
            </div>

            {/* VISUAL INTERACTION & ARCHITECTURE INFOGRAPHIC (Inspired by System Architecture Canvas) */}
            <InteractionInfographic snippet={activeSnippet} isDark={isDark} />

            {/* 5 Core Principles Scorecard - RADIAL GAUGE METERS */}
            <div className={`p-5 rounded-2xl border ${
              isDark ? 'bg-slate-950/70 border-white/10' : 'bg-slate-50/70 border-slate-200'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-blue-500" />
                  <h4 className={`text-xs font-extrabold uppercase tracking-wider ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                    Core Software Engineering Principles Audit
                  </h4>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold ${
                  (activeSnippet.principles?.overallScore || activeSnippet.overallScore || 8.5) >= 8.5
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                }`}>
                  Overall: {(activeSnippet.principles?.overallScore || activeSnippet.overallScore || 8.5)} / 10
                </span>
              </div>

              {/* 5 Radial Gauges with Numbers and Titles */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5">
                {[
                  {
                    key: 'architectural',
                    title: 'Modularity & SoC',
                    subtitle: 'Architectural Layering'
                  },
                  {
                    key: 'foundational',
                    title: '3 Rs, DRY & KISS',
                    subtitle: 'Reusability & Simplicity'
                  },
                  {
                    key: 'solid',
                    title: 'SOLID Axioms',
                    subtitle: 'Interface & Class Design'
                  },
                  {
                    key: 'clarity',
                    title: 'Readability & Clarity',
                    subtitle: 'Naming & "Why" Context'
                  },
                  {
                    key: 'resilience',
                    title: 'Resilience & QA',
                    subtitle: 'Defensive Fault Tolerance'
                  }
                ].map(({ key, title, subtitle }) => {
                  const item = activeSnippet.principles?.[key] || { score: 9, assessment: 'Meets production engineering standards' };
                  return (
                    <RadialScoreGauge
                      key={key}
                      score={item.score}
                      title={title}
                      subtitle={subtitle}
                      isDark={isDark}
                    />
                  );
                })}
              </div>
            </div>

            {/* Why This is Best Practice */}
            <div className={`p-5 rounded-2xl border ${
              isDark ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-emerald-50/70 border-emerald-200'
            }`}>
              <h4 className={`text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2 ${
                isDark ? 'text-emerald-400' : 'text-emerald-800'
              }`}>
                <CheckCircle2 size={16} />
                Why This is Best Practice
              </h4>
              <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                {activeSnippet.best_practice_rationale || 'Adheres to high-cohesion, low-coupling design principles.'}
              </p>
            </div>

            {/* Source Code Implementation Box */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Source Implementation
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {activeSnippet.language}
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="p-1 hover:text-blue-500 text-slate-400 transition-colors"
                    title="Copy code"
                  >
                    {copiedCode ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
              <div className="relative max-w-full overflow-hidden rounded-xl border border-slate-800">
                <pre className="p-4 font-mono text-xs overflow-x-auto leading-relaxed max-h-96 bg-slate-950 text-slate-200">
                  <code>{activeSnippet.code_content}</code>
                </pre>
              </div>
            </div>

            {/* How to Consume / Import */}
            {activeSnippet.usage_example && (
              <div className="flex flex-col gap-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  How to Consume / Import
                </span>
                <div className="relative max-w-full overflow-hidden rounded-xl border border-slate-800">
                  <pre className="p-3.5 font-mono text-xs overflow-x-auto leading-relaxed bg-slate-950/80 text-blue-300">
                    <code>{activeSnippet.usage_example}</code>
                  </pre>
                </div>
              </div>
            )}

            {/* Dual Observations Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Left: AI Observations & Actionable Improvements */}
              <div className={`p-5 rounded-2xl border flex flex-col justify-between ${
                isDark ? 'bg-slate-950/60 border-white/10' : 'bg-slate-50 border-slate-200'
              }`}>
                <div>
                  <h4 className={`text-xs font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5 ${
                    isDark ? 'text-indigo-400' : 'text-indigo-700'
                  }`}>
                    <Sparkles size={15} />
                    AI Observations & Critique
                  </h4>

                  {activeSnippet.aiObservations?.length > 0 ? (
                    <ul className="flex flex-col gap-2 mb-4">
                      {activeSnippet.aiObservations.map((obs, idx) => (
                        <li key={idx} className={`text-xs flex items-start gap-2 leading-relaxed ${
                          isDark ? 'text-slate-300' : 'text-slate-700'
                        }`}>
                          <span className="text-blue-500 font-bold">•</span>
                          <span>{obs}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500 italic mb-4">No specific caveats recorded.</p>
                  )}

                  {activeSnippet.suggestedImprovements?.length > 0 && (
                    <div className="pt-3 border-t border-slate-200/60 dark:border-white/10">
                      <span className={`text-[11px] font-bold uppercase tracking-wider block mb-1.5 ${
                        isDark ? 'text-amber-400' : 'text-amber-700'
                      }`}>
                        Actionable Improvements:
                      </span>
                      <ul className="flex flex-col gap-1.5">
                        {activeSnippet.suggestedImprovements.map((imp, idx) => (
                          <li key={idx} className={`text-xs flex items-start gap-2 ${
                            isDark ? 'text-slate-400' : 'text-slate-600'
                          }`}>
                            <span className="text-amber-400 font-bold">→</span>
                            <span>{imp}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: User Observation Notes */}
              <div className={`p-5 rounded-2xl border flex flex-col justify-between ${
                isDark ? 'bg-slate-950/60 border-white/10' : 'bg-slate-50 border-slate-200'
              }`}>
                <div>
                  <h4 className={`text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 ${
                    isDark ? 'text-amber-400' : 'text-amber-700'
                  }`}>
                    <Edit3 size={15} />
                    User Observations & Architecture Notes
                  </h4>
                  <p className={`text-[11px] mb-3 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Persist your team standards, production caveats, or migration guidance alongside this pattern.
                  </p>
                  <textarea
                    rows={6}
                    value={editingObservations}
                    onChange={(e) => setEditingObservations(e.target.value)}
                    placeholder="Add personal observations, caveats, or team recommendations..."
                    className={`w-full p-3 rounded-xl text-xs border outline-none font-sans leading-relaxed resize-none ${
                      isDark
                        ? 'bg-slate-900 border-slate-800 text-white placeholder-slate-600 focus:border-amber-400'
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-amber-500'
                    }`}
                  />
                </div>

                <div className="flex justify-end mt-4">
                  <button
                    onClick={handleSaveObservations}
                    disabled={isSavingObs}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-1.5 transition-all shadow-sm"
                  >
                    <Save size={14} />
                    <span>{isSavingObs ? 'Saving...' : 'Save Notes'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className={`p-12 text-center rounded-2xl border ${
            isDark ? 'bg-slate-900/40 border-slate-800 text-slate-500' : 'bg-white border-slate-200 text-slate-400'
          }`}>
            <Code2 size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-semibold">Select a code pattern above to view architectural analysis</p>
            <p className="text-xs mt-1">Review 5-principle radial gauge scorecards, best-practice rationales, and user observations.</p>
          </div>
        )}
      </div>
    </PortalShell>
  );
}
