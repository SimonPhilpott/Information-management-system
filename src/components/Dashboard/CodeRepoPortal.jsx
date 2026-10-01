import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Code2, Search, RefreshCw, CheckCircle2, AlertCircle, AlertTriangle, Trash2,
  ExternalLink, Sparkles, BookOpen, Layers, ShieldCheck, Cpu, Terminal,
  ChevronRight, ChevronDown, ChevronUp, FileCode, Check, Copy, Edit3, Save, Compass,
  KeyRound, GitBranch, Lock, Eye, EyeOff, X, CheckSquare, Square,
  Boxes, Server, Wrench, Shield, ArrowRight, User, Building, HardDrive,
  Activity, Play, CheckCircle, Database, Mic, Speaker, ArrowUpRight,
  ArrowRightLeft, LogIn, LogOut, GitCommit, HelpCircle, Rocket, Wand2, FileSpreadsheet, CheckCheck,
  FileCheck, Zap, BarChart3, Filter, Lightbulb
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

  // Scan state (SSE) & Outdated checking
  const [isScanning, setIsScanning] = useState(false);
  const [scanTarget, setScanTarget] = useState(null); // 'all', 'personal', 'turntown', 'outdated', or repoId
  const [scanLogs, setScanLogs] = useState([]);
  const [scanProgress, setScanProgress] = useState(0);
  const [isCheckingOutdated, setIsCheckingOutdated] = useState(false);

  // Observation state & UI feedback
  const [editingObservations, setEditingObservations] = useState('');
  const [isSavingObs, setIsSavingObs] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [notification, setNotification] = useState(null);

  // Automated PR Quality, TypeScript Linting & Triple Registry Audit Modal State
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState(null);
  const [auditFilter, setAuditFilter] = useState('all'); // 'all', 'registry', 'async_catch', 'type_definition'
  const [loggedFindings, setLoggedFindings] = useState(new Set());
  const [loggingFindingIdx, setLoggingFindingIdx] = useState(null);
  const [loggingAllCritical, setLoggingAllCritical] = useState(false);

  // Antigravity Project Scaffolder & Prompt Generator Modal State
  const [isScaffolderOpen, setIsScaffolderOpen] = useState(false);
  const [scaffoldProjectName, setScaffoldProjectName] = useState('');
  const [scaffoldDescription, setScaffoldDescription] = useState('');
  const [selectedScaffold, setSelectedScaffold] = useState('React 18 + Vite (SPA)');
  const [selectedCssFramework, setSelectedCssFramework] = useState('Tailwind CSS v4');
  const [selectedPreconditions, setSelectedPreconditions] = useState(['TypeScript strict mode', 'Defensive module boundaries & resource cleanup']);
  const [customPreconditions, setCustomPreconditions] = useState('');
  const [selectedPromptSnippetIds, setSelectedPromptSnippetIds] = useState([]);
  const [suggestedSnippets, setSuggestedSnippets] = useState([]);
  const [isSuggestingSnippets, setIsSuggestingSnippets] = useState(false);
  const [generatedPromptResult, setGeneratedPromptResult] = useState(null);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Rich metadata for Scaffolder Presets with thorough details and use cases
  const SCAFFOLD_OPTIONS = [
    {
      label: 'React 18 + Vite (SPA)',
      value: 'React 18 + Vite (SPA)',
      badge: 'Fastest / Frontend SPA',
      desc: 'Blazing fast Single Page Application with Vite HMR, React 18 concurrency, and optimal local development build speeds. Ideal for modern client-rendered web applications, dashboards, and internal tooling.',
      highlights: ['Instant server start (<300ms)', 'Rollup production bundler', 'Full React 18 hook & suspense support', 'Clean asset pipeline'],
      cli: 'npm create vite@latest my-app -- --template react-ts'
    },
    {
      label: 'SvelteKit 2.0 (Universal)',
      value: 'SvelteKit 2.0 (Universal)',
      badge: 'Svelte Compiler / SSR',
      desc: 'Compiler-driven reactive web framework with zero-runtime overhead, file-based routing, universal SSR/SPA rendering, and native form actions. Perfect for ultra-lean, high-performance web applications.',
      highlights: ['Zero virtual DOM overhead', 'Scoped CSS by default', 'Built-in page transitions & animations', 'Universal load functions'],
      cli: 'npx sv create my-app --template minimal --types ts'
    },
    {
      label: 'Next.js 15 App Router',
      value: 'Next.js 15 App Router',
      badge: 'Full-stack / RSC',
      desc: 'Enterprise full-stack framework with React Server Components (RSC), server actions, nested layouts, streaming SSR, and edge API routes. Best for SEO-critical portals, SaaS backends, and multi-tenant architectures.',
      highlights: ['React Server Components', 'Server Actions for zero-API mutations', 'Incremental Static Regeneration (ISR)', 'Optimised font/image pipelines'],
      cli: 'npx create-next-app@latest my-app --typescript --app'
    },
    {
      label: 'SharePoint SPFx Web Part (v1.19+)',
      value: 'SharePoint SPFx Web Part (v1.19+)',
      badge: 'Enterprise / M365',
      desc: 'Microsoft SharePoint Framework client-side web part running directly inside SharePoint Online, Microsoft Teams, and Microsoft 365. Handles page context, tenant permissions, PnPjs taxonomy, and enterprise authentication.',
      highlights: ['Direct SharePoint PageContext access', 'PnPjs v3/v4 taxonomy integration', 'Native MS Teams tab support', 'Isolated tenant execution'],
      cli: 'yo @microsoft/sharepoint --plusbeta'
    },
    {
      label: 'Vue 3 + Vite (Pinia)',
      value: 'Vue 3 + Vite (Pinia)',
      badge: 'Composition API',
      desc: 'Progressive JavaScript framework featuring Vue 3 Composition API, script setup syntax, and Pinia reactive state stores. Excellent developer ergonomics with fast Vite HMR and declarative templates.',
      highlights: ['Single-File Components (<script setup>)', 'Type-safe Pinia state stores', 'Fine-grained proxy reactivity', 'Vite-powered bundle speeds'],
      cli: 'npm create vite@latest my-app -- --template vue-ts'
    },
    {
      label: 'SolidJS + Vite',
      value: 'SolidJS + Vite',
      badge: 'Fine-grained Reactivity',
      desc: 'JSX-based UI library that compiles directly to real DOM operations without a virtual DOM, achieving peak runtime benchmark performance and memory efficiency for data-dense dashboards.',
      highlights: ['Zero Virtual DOM overhead', 'Fine-grained signals reactivity', 'Real DOM micro-updates', 'Familiar JSX component syntax'],
      cli: 'npm create vite@latest my-app -- --template solid-ts'
    },
    {
      label: 'Node.js + Express REST / SSE API',
      value: 'Node.js + Express REST / SSE API',
      badge: 'Backend Pipeline',
      desc: 'Modular Node.js and Express backend service with Server-Sent Events (SSE) streaming, SQLite/PostgreSQL persistence, and clean layered router/controller/service architecture.',
      highlights: ['SSE real-time telemetry streaming', 'Modular route & service layering', 'SQLite/HNSW RAG store support', 'Async middleware error handling'],
      cli: 'npm init -y && npm i express cors dotenv sqlite3'
    },
    {
      label: 'ESP32-S3 FreeRTOS C++ (PlatformIO)',
      value: 'ESP32-S3 FreeRTOS C++ (PlatformIO)',
      badge: 'Embedded Firmware',
      desc: 'Hardware firmware architecture for ESP32-S3 microcontrollers with dual-core FreeRTOS tasks, I2S microphone/speaker DMA buffers, WebSocket telemetry, and LovyanGFX display rendering.',
      highlights: ['Dual-core FreeRTOS concurrency', 'I2S DMA audio acquisition & speaker DAC', 'PSRAM circular pre-roll ringbuffers', 'LovyanGFX LCD UI renderer'],
      cli: 'pio project init --board esp32-s3-box-3 --project-option "framework=arduino"'
    }
  ];

  // Rich metadata for CSS Frameworks
  const CSS_FRAMEWORKS = [
    {
      label: 'Tailwind CSS v4 (Modern Utility)',
      value: 'Tailwind CSS v4',
      sub: 'Class-based styling & design tokens',
      desc: 'Next-generation utility-first CSS framework built in Rust (Lightning CSS). Generates zero unused CSS with instantaneous build times, native CSS color variables, and container queries.',
      features: ['Lightning CSS engine', 'Native @theme token configuration', 'Container queries & modern CSS variables', 'Zero runtime overhead']
    },
    {
      label: 'Fluent UI 2 (Microsoft / SPFx)',
      value: 'Fluent UI 2 (Griffel)',
      sub: 'Microsoft 365 enterprise components',
      desc: 'Microsoft’s official design system for Microsoft 365, Teams, and SharePoint SPFx. Features Griffel CSS-in-JS ahead-of-time compilation, high-contrast themes, and accessible React v9 components.',
      features: ['Official Microsoft 365 design language', 'AOT Griffel CSS-in-JS style extraction', 'High contrast & dark mode token tokens', 'WCAG 2.1 AA accessibility baked in']
    },
    {
      label: 'Vanilla Modern CSS (Custom Design Tokens)',
      value: 'Vanilla Modern CSS',
      sub: 'Clean variables, glassmorphism & zero dependencies',
      desc: 'Zero-dependency modern CSS architecture using CSS custom properties (--token), backdrop-filter glassmorphism, CSS Grid, and responsive flexbox layouts with maximum control and longevity.',
      features: ['Zero third-party runtime or build dependencies', 'Dynamic CSS variables for dark/light themes', 'Glassmorphic card & drawer tokens', 'Maximum performance and portability']
    },
    {
      label: 'SCSS / SASS Modules',
      value: 'SCSS / SASS Modules',
      sub: 'Scoped modular styling',
      desc: 'Modular CSS with SCSS pre-processing, nested syntax, mixins, and component-scoped class hashing to prevent global namespace pollution.',
      features: ['Locally scoped component CSS modules', 'Reusable mixins and calculation functions', 'Clean nesting for pseudo-selectors', 'Zero global selector leaks']
    }
  ];

  // Rich metadata for Preconditions & Invariants
  const PRECONDITION_DETAILS = {
    'TypeScript strict mode & complete interfaces': {
      title: 'Strict TypeScript & Complete Type Contracts',
      desc: 'Enforces "strict": true in tsconfig.json with zero "any" types. All function arguments, API responses, and component props must have explicit, well-defined TypeScript interfaces.',
      benefit: 'Eliminates runtime undefined/null errors and ensures full IDE autocompletion for Antigravity.'
    },
    'Defensive module boundaries & resource cleanup': {
      title: 'Defensive Engineering & Lifecycle Hygiene',
      desc: 'Every async hook, WebSocket connection, setInterval, and event listener must implement explicit cleanup in return unmount handlers. File handles and DB connections must close cleanly.',
      benefit: 'Prevents persistent memory leaks, dangling network connections, and unhandled promise rejections.'
    },
    'Triple Registry compliance (feature.json, ProjectStructure.JSON, test_plan.md)': {
      title: 'Triple Registry Architectural Parity',
      desc: 'Mandates synchronised updates across feature.json (unique feature ID), ProjectStructure.JSON (module dependency graph), and test_plan.md (Section 1 matrix, Section 2 scenario, Executive Summary).',
      benefit: 'Guarantees complete traceability and automated verification of every delivered feature.'
    },
    'Full module emission without truncated snippets': {
      title: 'Anti-Chunking & Full File Integrity',
      desc: 'Requires emitting complete file modules without placeholders, truncated snippets, or partial comments ("// ... rest of code"). Maintains full lexical scope and closure integrity.',
      benefit: 'Avoids corrupted code states, missing imports, and broken function closures.'
    },
    'SharePoint SPFx Context & PnPjs v3 integration': {
      title: 'SharePoint PageContext & PnPjs API Bridge',
      desc: 'Provides access to WebPartContext, current user profile, SharePoint REST endpoints, and taxonomy stores via PnPjs v3 spfi() factory with scoped caching.',
      benefit: 'Seamlessly interacts with SharePoint lists, document libraries, and Managed Metadata terms.'
    },
    'WebSocket real-time bidirectional telemetry': {
      title: 'Low-Latency Bidirectional WebSocket Streaming',
      desc: 'Implements full-duplex WebSocket connections with automatic reconnection loops, heartbeat keep-alive pings, and structured JSON payload message routing.',
      benefit: 'Enables instant hardware telemetry, live speech streaming, and reactive dashboard sync.'
    },
    'SQLite persistence with atomic schema migrations': {
      title: 'SQLite Database Governance & Migrations',
      desc: 'Local SQLite relational storage with WAL mode, parameterized prepared statements, and idempotent "CREATE TABLE IF NOT EXISTS" and "ALTER TABLE" on startup.',
      benefit: 'Guarantees fast, ACID-compliant local data persistence and safe schema evolutions.'
    },
    'British English (en-GB) and GBP (£) regionalisation': {
      title: 'British English Orthography & Currency Standard',
      desc: 'Enforces UK English spelling (e.g. colour, synchronise, initialised, behaviour) and pound sterling (£) formatting across all UI labels, prompts, and documentation.',
      benefit: 'Maintains consistent regional voice and compliance with UK business requirements.'
    }
  };

  const COMMON_PRECONDITIONS = Object.keys(PRECONDITION_DETAILS);

  // Hover Popover States
  const [hoveredScaffold, setHoveredScaffold] = useState(null);
  const [hoveredCss, setHoveredCss] = useState(null);
  const [hoveredPrecondition, setHoveredPrecondition] = useState(null);
  const [hoveredSnippet, setHoveredSnippet] = useState(null);
  const [hoverCardPos, setHoverCardPos] = useState({ x: 0, y: 0 });
  const hoverTimerRef = useRef(null);

  const handleMouseEnterCard = (item, type, e) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverCardPos({
      top: rect.bottom + 8,
      left: Math.max(16, Math.min(window.innerWidth - 380, rect.left))
    });
    if (type === 'scaffold') setHoveredScaffold(item);
    if (type === 'css') setHoveredCss(item);
    if (type === 'precondition') setHoveredPrecondition(item);
    if (type === 'snippet') setHoveredSnippet(item);
  };

  const handleMouseLeaveCard = () => {
    hoverTimerRef.current = setTimeout(() => {
      setHoveredScaffold(null);
      setHoveredCss(null);
      setHoveredPrecondition(null);
      setHoveredSnippet(null);
    }, 150);
  };

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

  // Auto-suggest best practice snippets based on description and scaffold
  const handleSuggestSnippets = async () => {
    if (!scaffoldDescription.trim() && !scaffoldProjectName.trim()) {
      showToast('Please enter a project description or title first', 'error');
      return;
    }
    setIsSuggestingSnippets(true);
    try {
      const res = await fetch('/api/code-repo/suggest-best-practices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: scaffoldDescription,
          scaffold: selectedScaffold,
          cssFramework: selectedCssFramework,
          preconditions: selectedPreconditions
        })
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.suggestions)) {
        setSuggestedSnippets(data.suggestions);
        // Automatically select the top suggested snippets
        const topIds = data.suggestions.slice(0, 4).map(s => s.id);
        setSelectedPromptSnippetIds(prev => Array.from(new Set([...prev, ...topIds])));
        showToast(`Matched ${data.suggestions.length} relevant code blueprints from your library`);
      } else {
        throw new Error(data.error || 'Failed suggesting snippets');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSuggestingSnippets(false);
    }
  };

  // Generate full Antigravity project kick-off prompt and implementation plan
  const handleGenerateAntigravityPrompt = async () => {
    setIsGeneratingPrompt(true);
    try {
      const res = await fetch('/api/code-repo/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: scaffoldProjectName || 'New Project',
          description: scaffoldDescription,
          scaffold: selectedScaffold,
          cssFramework: selectedCssFramework,
          preconditions: selectedPreconditions,
          customPreconditions: customPreconditions,
          selectedSnippetIds: selectedPromptSnippetIds
        })
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedPromptResult(data);
        showToast('Antigravity implementation plan and prompt generated!');
      } else {
        throw new Error(data.error || 'Failed generating prompt');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const handleCopyPromptToClipboard = () => {
    if (!generatedPromptResult?.promptMarkdown) return;
    navigator.clipboard.writeText(generatedPromptResult.promptMarkdown);
    setCopiedPrompt(true);
    showToast('Implementation prompt copied! Paste directly into Antigravity.');
    setTimeout(() => setCopiedPrompt(false), 3000);
  };

  // Toggle snippet selection for prompt
  const handleTogglePromptSnippet = (id) => {
    setSelectedPromptSnippetIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Run Automated PR Quality, TypeScript Linting & Triple Registry Audit
  const handleRunAudit = async () => {
    setIsAuditing(true);
    setIsAuditModalOpen(true);
    try {
      const res = await fetch('/api/code-repo/audit', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setAuditResult(data);
        showToast(`Audit complete: Quality Health Score ${data.metrics.overallScore}/100`);
      } else {
        throw new Error(data.error || 'Failed executing quality audit');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsAuditing(false);
    }
  };

  // 1-Click Log audit finding to Dev Ideas
  const handleLogFindingToDevIdeas = async (issue, idx) => {
    setLoggingFindingIdx(idx);
    try {
      const text = `[Code Repo Audit] ${issue.title} in ${issue.file}${issue.line ? `:${issue.line}` : ''} (${issue.severity}): ${issue.description} -> Remediation: ${issue.remediation}`;
      const res = await fetch('/api/dev-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          category: issue.type === 'registry' ? 'IMS Desktop' : 'Architecture',
          source: 'code_repo_audit'
        })
      });
      const data = await res.json();
      if (data.success) {
        setLoggedFindings(prev => new Set([...prev, idx]));
        showToast('Finding logged to Dev Ideas queue (#ID ' + (data.idea?.id || '') + ')');
      } else {
        throw new Error(data.error || 'Failed logging idea');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoggingFindingIdx(null);
    }
  };

  // Batch log all critical findings to Dev Ideas
  const handleLogAllCriticalToDevIdeas = async () => {
    if (!auditResult?.issues) return;
    const criticals = auditResult.issues
      .map((issue, idx) => ({ issue, idx }))
      .filter(({ issue, idx }) => issue.severity === 'critical' && !loggedFindings.has(idx));

    if (criticals.length === 0) {
      showToast('All critical findings have already been logged to Dev Ideas');
      return;
    }

    setLoggingAllCritical(true);
    try {
      let count = 0;
      for (const { issue, idx } of criticals) {
        const text = `[Critical Code Audit] ${issue.title} in ${issue.file}${issue.line ? `:${issue.line}` : ''}: ${issue.description} -> Remediation: ${issue.remediation}`;
        const res = await fetch('/api/dev-ideas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            category: 'Architecture',
            source: 'code_repo_audit'
          })
        });
        if (res.ok) {
          setLoggedFindings(prev => new Set([...prev, idx]));
          count++;
        }
      }
      showToast(`Logged ${count} critical findings to Dev Ideas`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoggingAllCritical(false);
    }
  };

  // Check URL search params for instant audit trigger (from Command Palette)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'audit' || params.get('audit') === 'true') {
      handleRunAudit();
    }
  }, []);

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

  // Check all repositories for outdated commits
  const handleCheckOutdated = async () => {
    setIsCheckingOutdated(true);
    try {
      const res = await fetch('/api/code-repo/check-outdated', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setRepositories(data.repositories || []);
        if (data.outdatedCount > 0) {
          showToast(`Found ${data.outdatedCount} repository with new commits requiring re-scan`, 'error');
        } else {
          showToast('All repositories are fully up to date with latest commits');
        }
      } else {
        throw new Error(data.error || 'Failed checking repository updates');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsCheckingOutdated(false);
    }
  };

  // Re-scan only outdated repositories
  const handleStartScanOutdated = () => {
    const outdatedRepos = repositories.filter(r => r.is_outdated);
    if (outdatedRepos.length === 0) {
      showToast('No outdated repositories detected. Everything is up to date.');
      return;
    }

    setScanTarget('outdated');
    setIsScanning(true);
    setScanLogs([]);
    setScanProgress(0);

    const eventSource = new EventSource('/api/code-repo/scan-outdated-stream');

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
          showToast(data.message || 'Outdated repositories re-scanned successfully!');
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
      gradient="from-cyan-500 to-blue-600"
      glow="rgba(6,182,212,0.3)"
      isDark={isDark}
      onThemeToggle={onThemeToggle}
      currentPath="/ims/code-repo"
      setCurrentPath={setCurrentPath}
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
            {/* PR Quality, TypeScript Lint & Triple Registry Audit */}
            <button
              onClick={handleRunAudit}
              disabled={isAuditing}
              className="px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition-all shadow-md shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
              title="Run automated PR quality scan checking for missing type definitions, unhandled async catch blocks, and out-of-sync Triple Registry entries"
            >
              <FileCheck size={14} className={isAuditing ? 'animate-spin text-amber-300' : 'text-amber-300'} />
              <span>{isAuditing ? 'Auditing Codebase...' : 'PR Quality & Registry Audit'}</span>
            </button>

            {/* Launch Antigravity Project Scaffolder */}
            <button
              onClick={() => setIsScaffolderOpen(true)}
              className="px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white transition-all shadow-md shadow-blue-500/20 active:scale-95"
              title="Scaffold a new project with best-practice blueprints and generate an exhaustive Antigravity kick-off prompt"
            >
              <Rocket size={14} className="text-amber-300 animate-bounce" />
              <span>Scaffold in Antigravity</span>
            </button>

            {/* Outdated Repos Alert & Action */}
            {repositories.some(r => r.is_outdated) && (
              <button
                onClick={handleStartScanOutdated}
                disabled={isScanning}
                className="px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black transition-all shadow-md shadow-amber-500/20 animate-pulse"
                title="Re-scan and incrementally update modified or newly expanded code snippets"
              >
                <RefreshCw size={13} className={isScanning && scanTarget === 'outdated' ? 'animate-spin' : ''} />
                <span>Re-scan Outdated ({repositories.filter(r => r.is_outdated).length})</span>
              </button>
            )}

            <button
              onClick={handleCheckOutdated}
              disabled={isCheckingOutdated || isScanning}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                isDark
                  ? 'bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-500/30'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300'
              }`}
              title="Check GitHub for newer commits since last scan"
            >
              <GitCommit size={13} className={isCheckingOutdated ? 'animate-spin' : ''} />
              <span>{isCheckingOutdated ? 'Checking Commits...' : 'Check for Updates'}</span>
            </button>

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
                          {repo.is_outdated ? (
                            <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-bold flex items-center gap-1 animate-pulse" title={`Newer commits found since last scan (${repo.last_scanned_commit_sha ? repo.last_scanned_commit_sha.slice(0, 7) : 'none'} -> ${repo.last_commit_sha ? repo.last_commit_sha.slice(0, 7) : 'latest'})`}>
                              <AlertTriangle size={10} />
                              Needs Re-scan
                            </span>
                          ) : repo.last_scanned_at ? (
                            <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                              <CheckCircle2 size={10} />
                              Up to date
                            </span>
                          ) : (
                            <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 font-medium">
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
                          {repo.is_outdated ? (
                            <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-bold flex items-center gap-1 animate-pulse" title={`Newer commits found since last scan (${repo.last_scanned_commit_sha ? repo.last_scanned_commit_sha.slice(0, 7) : 'none'} -> ${repo.last_commit_sha ? repo.last_commit_sha.slice(0, 7) : 'latest'})`}>
                              <AlertTriangle size={10} />
                              Needs Re-scan
                            </span>
                          ) : repo.last_scanned_at ? (
                            <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                              <CheckCircle2 size={10} />
                              Up to date
                            </span>
                          ) : (
                            <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 font-medium">
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
                              {((snip.inputs?.length || 0) > 0 || (snip.outputs?.length || 0) > 0) && (
                                <span className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 ${
                                  isDark ? 'bg-blue-950/60 text-blue-300 border border-blue-500/20' : 'bg-blue-50 text-blue-700 border border-blue-200'
                                }`} title={`${snip.inputs?.length || 0} Inputs, ${snip.outputs?.length || 0} Outputs`}>
                                  <ArrowRightLeft size={9} />
                                  <span>{snip.inputs?.length || 0} in / {snip.outputs?.length || 0} out</span>
                                </span>
                              )}
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

            {/* INPUTS & OUTPUTS CONTRACT SPECIFICATION (Variables, Triggers, Listeners, Return Values, Mutations) */}
            <div className={`rounded-2xl border p-5 sm:p-6 transition-all ${
              isDark ? 'bg-slate-950/70 border-white/10' : 'bg-slate-50/90 border-slate-200'
            }`}>
              <div className="flex items-center justify-between pb-3.5 mb-5 border-b border-slate-200/80 dark:border-white/10">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-500">
                    <ArrowRightLeft size={16} />
                  </span>
                  <div>
                    <h4 className={`text-xs font-extrabold uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      Inputs & Outputs Contract Specifications
                    </h4>
                    <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Explicit data contracts, trigger events, listeners, state mutations, and concrete example payloads
                    </p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${isDark ? 'bg-white/10 text-slate-300' : 'bg-white text-slate-700 border border-slate-200'}`}>
                  {((activeSnippet.inputs?.length || 0) + (activeSnippet.outputs?.length || 0))} Contract Points
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Column 1: Inputs (Captured on the way in) */}
                <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                  isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200/90 shadow-sm'
                }`}>
                  <div>
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200/60 dark:border-white/5">
                      <div className="flex items-center gap-1.5">
                        <LogIn size={14} className="text-blue-500" />
                        <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                          Inputs (Captured on Entry)
                        </span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? 'bg-blue-500/15 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
                        {activeSnippet.inputs?.length || 0} items
                      </span>
                    </div>

                    {(activeSnippet.inputs?.length || 0) === 0 ? (
                      <p className="text-xs text-slate-500 italic py-3">No parameter or trigger inputs defined.</p>
                    ) : (
                      <div className="flex flex-col gap-3.5">
                        {activeSnippet.inputs.map((inp, idx) => (
                          <div key={idx} className={`p-3 rounded-lg border ${
                            isDark ? 'bg-slate-950/70 border-slate-800/80' : 'bg-slate-50/80 border-slate-200/80'
                          }`}>
                            <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                              <span className={`text-xs font-mono font-bold ${isDark ? 'text-blue-300' : 'text-blue-800'}`}>
                                {inp.name}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[9.5px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                                  inp.kind === 'Trigger' ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30' :
                                  inp.kind === 'Listener' ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30' :
                                  inp.kind === 'Config' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' :
                                  inp.kind === 'State' ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30' :
                                  'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                                }`}>
                                  {inp.kind || 'Variable'}
                                </span>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                  {inp.type || 'any'}
                                </span>
                              </div>
                            </div>
                            <p className={`text-[11.5px] mb-2 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                              {inp.description}
                            </p>
                            {inp.example && (
                              <div className="mt-1.5">
                                <span className={`text-[9.5px] font-bold uppercase tracking-wider block mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                  Example Payload / Value:
                                </span>
                                <pre className="p-2 rounded font-mono text-[11px] overflow-x-auto leading-tight bg-slate-950 text-emerald-400 border border-slate-800/80">
                                  <code>{inp.example}</code>
                                </pre>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Column 2: Outputs (Produced on the way out) */}
                <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                  isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200/90 shadow-sm'
                }`}>
                  <div>
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200/60 dark:border-white/5">
                      <div className="flex items-center gap-1.5">
                        <LogOut size={14} className="text-emerald-500" />
                        <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                          Outputs (Produced on Exit)
                        </span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700'}`}>
                        {activeSnippet.outputs?.length || 0} items
                      </span>
                    </div>

                    {(activeSnippet.outputs?.length || 0) === 0 ? (
                      <p className="text-xs text-slate-500 italic py-3">No return value or sink outputs defined.</p>
                    ) : (
                      <div className="flex flex-col gap-3.5">
                        {activeSnippet.outputs.map((out, idx) => (
                          <div key={idx} className={`p-3 rounded-lg border ${
                            isDark ? 'bg-slate-950/70 border-slate-800/80' : 'bg-slate-50/80 border-slate-200/80'
                          }`}>
                            <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                              <span className={`text-xs font-mono font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`}>
                                {out.name}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[9.5px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                                  out.kind === 'Event' ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30' :
                                  out.kind === 'Mutation' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' :
                                  out.kind === 'Render' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30' :
                                  out.kind === 'Sink' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30' :
                                  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                }`}>
                                  {out.kind || 'Return Value'}
                                </span>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                  {out.type || 'any'}
                                </span>
                              </div>
                            </div>
                            <p className={`text-[11.5px] mb-2 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                              {out.description}
                            </p>
                            {out.example && (
                              <div className="mt-1.5">
                                <span className={`text-[9.5px] font-bold uppercase tracking-wider block mb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                  Example Output / Return Value:
                                </span>
                                <pre className="p-2 rounded font-mono text-[11px] overflow-x-auto leading-tight bg-slate-950 text-cyan-300 border border-slate-800/80">
                                  <code>{out.example}</code>
                                </pre>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
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

      {/* AUTOMATED PR QUALITY, TYPESCRIPT LINTING & TRIPLE REGISTRY AUDIT MODAL */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
          <div className={`relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl border shadow-[0_25px_60px_rgba(0,0,0,0.4)] overflow-hidden transition-all ${
            isDark ? 'bg-slate-900 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            {/* Modal Header */}
            <div className="p-5 sm:p-6 flex items-center justify-between border-b border-slate-200/80 dark:border-white/10 shrink-0 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-blue-500/10">
              <div className="flex items-center gap-3.5">
                <span className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20">
                  <FileCheck size={20} />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-black tracking-tight">
                      Automated PR Quality & TypeScript Linting Scanner
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      Code Integrity Audit
                    </span>
                  </div>
                  <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Scans workspace for missing type definitions, unhandled async catch blocks, and Triple Registry (feature.json / ProjectStructure.JSON / test_plan.md) synchronisation.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className={`p-2 rounded-xl border transition-colors ${
                  isDark ? 'border-slate-800 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-600'
                }`}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
              {isAuditing ? (
                <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
                  <RefreshCw size={36} className="text-emerald-500 animate-spin" />
                  <p className="text-sm font-extrabold">Scanning codebase files & Triple Registry invariant tables...</p>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Checking TypeScript declarations, JSDoc signatures, async promise chains, and registry metrics parity.
                  </p>
                </div>
              ) : auditResult ? (
                <div className="space-y-6">
                  {/* Top Score & Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Overall Score */}
                    <div className={`p-4 rounded-2xl border flex items-center justify-between ${
                      auditResult.metrics.overallScore >= 90
                        ? isDark ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : auditResult.metrics.overallScore >= 75
                          ? isDark ? 'bg-amber-950/40 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-900'
                          : isDark ? 'bg-rose-950/40 border-rose-500/30 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-900'
                    }`}>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider opacity-70">Code Health Score</span>
                        <div className="text-2xl font-black">{auditResult.metrics.overallScore} / 100</div>
                        <span className="text-[10px] font-medium opacity-80">
                          {auditResult.metrics.overallScore >= 90 ? '✨ Production Ready' : '⚠️ Remediation Recommended'}
                        </span>
                      </div>
                      <ShieldCheck size={32} className="opacity-80" />
                    </div>

                    {/* Triple Registry Status */}
                    <div className={`p-4 rounded-2xl border flex items-center justify-between ${
                      auditResult.metrics.tripleRegistryStats.inSync
                        ? isDark ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : isDark ? 'bg-rose-950/40 border-rose-500/30 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-900'
                    }`}>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider opacity-70">Triple Registry</span>
                        <div className="text-lg font-black">
                          {auditResult.metrics.tripleRegistryStats.inSync ? 'In Parity (1:1)' : 'Out of Sync'}
                        </div>
                        <span className="text-[10px] font-medium opacity-80">
                          {auditResult.metrics.tripleRegistryStats.featureJsonCount} Feats • {auditResult.metrics.tripleRegistryStats.projectStructureCount} Modules
                        </span>
                      </div>
                      <Layers size={28} className="opacity-80" />
                    </div>

                    {/* Async Catch Status */}
                    <div className={`p-4 rounded-2xl border flex items-center justify-between ${
                      auditResult.metrics.asyncCatchIssuesCount === 0
                        ? isDark ? 'bg-slate-900/80 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                        : isDark ? 'bg-amber-950/40 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider opacity-70">Async / Catch Blocks</span>
                        <div className="text-2xl font-black">{auditResult.metrics.asyncCatchIssuesCount}</div>
                        <span className="text-[10px] font-medium opacity-80">
                          {auditResult.metrics.asyncCatchIssuesCount === 0 ? 'Zero unhandled catches' : 'Empty catch or unhandled promises'}
                        </span>
                      </div>
                      <Zap size={28} className="opacity-80" />
                    </div>

                    {/* Type Definition Status */}
                    <div className={`p-4 rounded-2xl border flex items-center justify-between ${
                      auditResult.metrics.typeIssuesCount === 0
                        ? isDark ? 'bg-slate-900/80 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                        : isDark ? 'bg-indigo-950/40 border-indigo-500/30 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-900'
                    }`}>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider opacity-70">Type Declarations</span>
                        <div className="text-2xl font-black">{auditResult.metrics.typeIssuesCount}</div>
                        <span className="text-[10px] font-medium opacity-80">
                          {auditResult.metrics.totalFilesScanned} source files inspected
                        </span>
                      </div>
                      <Code2 size={28} className="opacity-80" />
                    </div>
                  </div>

                  {/* Filter Tabs & Re-Run */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/80 dark:border-white/10">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => setAuditFilter('all')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          auditFilter === 'all'
                            ? 'bg-emerald-500 text-black font-extrabold shadow-sm'
                            : isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        All Findings ({auditResult.issues.length})
                      </button>
                      <button
                        onClick={() => setAuditFilter('registry')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          auditFilter === 'registry'
                            ? 'bg-emerald-500 text-black font-extrabold shadow-sm'
                            : isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        Triple Registry ({auditResult.metrics.tripleRegistryIssuesCount})
                      </button>
                      <button
                        onClick={() => setAuditFilter('async_catch')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          auditFilter === 'async_catch'
                            ? 'bg-emerald-500 text-black font-extrabold shadow-sm'
                            : isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        Async Catches ({auditResult.metrics.asyncCatchIssuesCount})
                      </button>
                      <button
                        onClick={() => setAuditFilter('type_definition')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          auditFilter === 'type_definition'
                            ? 'bg-emerald-500 text-black font-extrabold shadow-sm'
                            : isDark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        Type Defs ({auditResult.metrics.typeIssuesCount})
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleLogAllCriticalToDevIdeas}
                        disabled={loggingAllCritical || !auditResult?.issues?.some(i => i.severity === 'critical')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                          isDark ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30' : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300'
                        } disabled:opacity-40 disabled:pointer-events-none`}
                        title="Log all critical audit issues as actionable items in Dev Ideas"
                      >
                        <Lightbulb size={12} className={loggingAllCritical ? 'animate-spin text-amber-400' : 'text-amber-400'} />
                        <span>{loggingAllCritical ? 'Logging Critical...' : 'Log Critical to Dev Ideas'}</span>
                      </button>

                      <button
                        onClick={handleRunAudit}
                        disabled={isAuditing}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                          isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                        }`}
                      >
                        <RefreshCw size={12} className={isAuditing ? 'animate-spin' : ''} />
                        <span>Re-Run Audit</span>
                      </button>
                    </div>
                  </div>

                  {/* Issues List */}
                  <div className="space-y-3">
                    {auditResult.issues
                      .filter(i => auditFilter === 'all' || i.type === auditFilter)
                      .map((issue, idx) => {
                        const isLogged = loggedFindings.has(idx);
                        const isLoggingThis = loggingFindingIdx === idx;
                        return (
                          <div
                            key={idx}
                            className={`p-4 rounded-2xl border transition-all ${
                              issue.severity === 'critical'
                                ? isDark ? 'bg-rose-950/30 border-rose-500/40 text-rose-200' : 'bg-rose-50 border-rose-300 text-rose-900'
                                : issue.severity === 'warning'
                                  ? isDark ? 'bg-amber-950/30 border-amber-500/40 text-amber-200' : 'bg-amber-50 border-amber-300 text-amber-900'
                                  : isDark ? 'bg-slate-950/60 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800 shadow-sm'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3 mb-1.5">
                              <div className="flex items-center gap-2">
                                {issue.severity === 'critical' ? (
                                  <AlertCircle size={16} className="text-rose-500 shrink-0" />
                                ) : issue.severity === 'warning' ? (
                                  <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                                ) : (
                                  <HelpCircle size={16} className="text-blue-500 shrink-0" />
                                )}
                                <span className="font-extrabold text-xs">{issue.title}</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-black/20 font-bold">
                                  {issue.file}{issue.line ? `:${issue.line}` : ''}
                                </span>
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                                  issue.severity === 'critical'
                                    ? 'bg-rose-500 text-white'
                                    : issue.severity === 'warning'
                                      ? 'bg-amber-500 text-black'
                                      : 'bg-blue-500/20 text-blue-400'
                                }`}>
                                  {issue.severity}
                                </span>
                              </div>
                            </div>
                            <p className="text-xs leading-relaxed opacity-90 mb-2.5">
                              {issue.description}
                            </p>
                            
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-black/10 dark:border-white/5">
                              <div className={`p-2 rounded-xl text-[11px] leading-snug border flex-1 ${
                                isDark ? 'bg-black/40 border-white/5 text-emerald-300' : 'bg-slate-50 border-slate-200 text-emerald-800'
                              }`}>
                                <strong>Remediation:</strong> {issue.remediation}
                              </div>

                              <button
                                onClick={() => handleLogFindingToDevIdeas(issue, idx)}
                                disabled={isLoggingThis || isLogged}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-all ${
                                  isLogged
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                                    : isDark
                                    ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 hover:border-amber-500/50 active:scale-95'
                                    : 'bg-white hover:bg-amber-50 text-amber-900 border border-slate-200 shadow-sm active:scale-95'
                                }`}
                                title="Log finding as an actionable item in Dev Ideas"
                              >
                                {isLogged ? (
                                  <>
                                    <Check size={12} className="text-emerald-400" />
                                    <span>Logged to Ideas</span>
                                  </>
                                ) : isLoggingThis ? (
                                  <>
                                    <RefreshCw size={12} className="animate-spin text-amber-400" />
                                    <span>Logging...</span>
                                  </>
                                ) : (
                                  <>
                                    <Lightbulb size={12} className="text-amber-400" />
                                    <span>Log to Dev Ideas</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}

                    {auditResult.issues.filter(i => auditFilter === 'all' || i.type === auditFilter).length === 0 && (
                      <div className={`p-8 text-center rounded-2xl border ${
                        isDark ? 'bg-slate-900/40 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
                      }`}>
                        <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500" />
                        <p className="text-xs font-bold">No issues found in this category.</p>
                        <p className="text-[11px] opacity-70 mt-0.5">All examined modules satisfy verified architectural standards.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ANTIGRAVITY PROJECT SCAFFOLDER & PROMPT GENERATOR MODAL */}
      {isScaffolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
          <div className={`relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl border shadow-[0_25px_60px_rgba(0,0,0,0.4)] overflow-hidden transition-all ${
            isDark ? 'bg-slate-900 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            {/* Modal Header */}
            <div className="p-5 sm:p-6 flex items-center justify-between border-b border-slate-200/80 dark:border-white/10 shrink-0 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-indigo-500/10">
              <div className="flex items-center gap-3.5">
                <span className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-br from-cyan-500 to-indigo-600 text-white shadow-md shadow-blue-500/20">
                  <Rocket size={20} />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-black tracking-tight">
                      Antigravity Project Scaffolder & Prompt Generator
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
                      Phase 1 Kick-off
                    </span>
                  </div>
                  <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Configure frameworks, preconditions, and inject verified GitHub best practice blueprints into an exhaustive Antigravity implementation plan.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsScaffolderOpen(false)}
                className={`p-2 rounded-xl border transition-colors ${
                  isDark ? 'border-slate-800 hover:bg-slate-800 text-slate-400' : 'border-slate-200 hover:bg-slate-100 text-slate-600'
                }`}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
              {/* Row 1: Project Title & Description */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1 flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 opacity-80">
                    <Terminal size={13} className="text-blue-500" />
                    <span>Project Name</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. TurnTown Resource Planner"
                    value={scaffoldProjectName}
                    onChange={(e) => setScaffoldProjectName(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold border outline-none ${
                      isDark ? 'bg-slate-950 border-slate-800 focus:border-blue-500' : 'bg-slate-50 border-slate-300 focus:border-blue-500'
                    }`}
                  />
                </div>

                <div className="md:col-span-2 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 opacity-80">
                      <Sparkles size={13} className="text-amber-500" />
                      <span>Project Goal & Scope Description</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleSuggestSnippets}
                      disabled={isSuggestingSnippets || (!scaffoldDescription.trim() && !scaffoldProjectName.trim())}
                      className="text-[11px] font-bold text-amber-500 hover:text-amber-400 disabled:opacity-40 flex items-center gap-1 px-2 py-0.5 rounded-lg border border-amber-500/30 bg-amber-500/10"
                      title="AI search through your GitHub snippet library for matching architectural blueprints"
                    >
                      <Wand2 size={12} className={isSuggestingSnippets ? 'animate-spin' : ''} />
                      <span>{isSuggestingSnippets ? 'Matching Library...' : 'Auto-Match Best Practices'}</span>
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Describe what you want to build (e.g. SPFx web part with real-time WebSocket live updates, glassmorphism UI, and reactive state stores)..."
                    value={scaffoldDescription}
                    onChange={(e) => setScaffoldDescription(e.target.value)}
                    className={`w-full px-3.5 py-2 rounded-xl text-xs leading-relaxed border outline-none resize-none ${
                      isDark ? 'bg-slate-950 border-slate-800 focus:border-blue-500' : 'bg-slate-50 border-slate-300 focus:border-blue-500'
                    }`}
                  />
                </div>
              </div>

              {/* Row 2: Architecture Framework Scaffold & CSS Framework */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Scaffold Choice */}
                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <label className="text-xs font-extrabold uppercase tracking-wider mb-2.5 flex items-center justify-between opacity-90">
                    <span className="flex items-center gap-1.5">
                      <Boxes size={14} className="text-blue-500" />
                      <span>1. Select Framework Scaffold</span>
                    </span>
                    <span className="text-[10px] font-normal lowercase opacity-60 flex items-center gap-1">
                      <HelpCircle size={11} /> hover for architecture details
                    </span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SCAFFOLD_OPTIONS.map((opt) => {
                      const isSelected = selectedScaffold === opt.value;
                      return (
                        <div
                          key={opt.value}
                          onClick={() => setSelectedScaffold(opt.value)}
                          onMouseEnter={(e) => handleMouseEnterCard(opt, 'scaffold', e)}
                          onMouseLeave={handleMouseLeaveCard}
                          className={`p-2.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between relative group ${
                            isSelected
                              ? isDark
                                ? 'bg-blue-950/60 border-blue-500 text-white shadow-sm ring-1 ring-blue-500/50'
                                : 'bg-blue-50 border-blue-400 text-slate-900 shadow-sm ring-1 ring-blue-400/50'
                              : isDark
                                ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-xs font-bold truncate">{opt.label}</span>
                            {isSelected ? <CheckCircle2 size={13} className="text-blue-500 shrink-0" /> : <div className="w-3 h-3 rounded-full border border-slate-500/40" />}
                          </div>
                          <span className={`text-[9.5px] font-medium ${isSelected ? (isDark ? 'text-blue-300' : 'text-blue-700') : 'opacity-60'}`}>
                            {opt.badge}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* CSS Framework Choice */}
                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <label className="text-xs font-extrabold uppercase tracking-wider mb-2.5 flex items-center justify-between opacity-90">
                    <span className="flex items-center gap-1.5">
                      <Sparkles size={14} className="text-purple-500" />
                      <span>2. Styling & Design System</span>
                    </span>
                    <span className="text-[10px] font-normal lowercase opacity-60 flex items-center gap-1">
                      <HelpCircle size={11} /> hover for stack features
                    </span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CSS_FRAMEWORKS.map((opt) => {
                      const isSelected = selectedCssFramework === opt.value;
                      return (
                        <div
                          key={opt.value}
                          onClick={() => setSelectedCssFramework(opt.value)}
                          onMouseEnter={(e) => handleMouseEnterCard(opt, 'css', e)}
                          onMouseLeave={handleMouseLeaveCard}
                          className={`p-2.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between relative group ${
                            isSelected
                              ? isDark
                                ? 'bg-purple-950/60 border-purple-500 text-white shadow-sm ring-1 ring-purple-500/50'
                                : 'bg-purple-50 border-purple-400 text-slate-900 shadow-sm ring-1 ring-purple-400/50'
                              : isDark
                                ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-xs font-bold truncate">{opt.label}</span>
                            {isSelected ? <CheckCircle2 size={13} className="text-purple-500 shrink-0" /> : <div className="w-3 h-3 rounded-full border border-slate-500/40" />}
                          </div>
                          <span className={`text-[9.5px] font-medium ${isSelected ? (isDark ? 'text-purple-300' : 'text-purple-700') : 'opacity-60'}`}>
                            {opt.sub}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Row 3: Preconditions & Invariants */}
              <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <label className="text-xs font-extrabold uppercase tracking-wider mb-2.5 flex items-center justify-between opacity-90">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-emerald-500" />
                    <span>3. Project Preconditions & Engineering Invariants</span>
                  </span>
                  <span className="text-[10px] font-normal lowercase opacity-60 flex items-center gap-1">
                    <HelpCircle size={11} /> hover for invariant specifications
                  </span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
                  {COMMON_PRECONDITIONS.map((p) => {
                    const isChecked = selectedPreconditions.includes(p);
                    const pMeta = PRECONDITION_DETAILS[p] || { title: p, desc: p, benefit: '' };
                    return (
                      <div
                        key={p}
                        onClick={() => {
                          setSelectedPreconditions(prev =>
                            isChecked ? prev.filter(x => x !== p) : [...prev, p]
                          );
                        }}
                        onMouseEnter={(e) => handleMouseEnterCard(pMeta, 'precondition', e)}
                        onMouseLeave={handleMouseLeaveCard}
                        className={`p-2 rounded-xl border cursor-pointer text-xs flex items-start gap-2 transition-all relative group ${
                          isChecked
                            ? isDark
                              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200 ring-1 ring-emerald-500/30'
                              : 'bg-emerald-50 border-emerald-300 text-emerald-900 ring-1 ring-emerald-400/30'
                            : isDark
                              ? 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                        }`}
                      >
                        <span className="mt-0.5 shrink-0 text-emerald-500">
                          {isChecked ? <CheckSquare size={14} /> : <Square size={14} />}
                        </span>
                        <span className="text-[11px] font-semibold leading-tight">{p}</span>
                      </div>
                    );
                  })}
                </div>
                <input
                  type="text"
                  placeholder="Add custom preconditions (e.g. PnPjs v3 SPHttpClient, MSAL Auth, Web Audio API, or Azure OpenAI API key)..."
                  value={customPreconditions}
                  onChange={(e) => setCustomPreconditions(e.target.value)}
                  className={`w-full px-3.5 py-2 rounded-xl text-xs border outline-none ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-200 focus:border-emerald-500' : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                  }`}
                />
              </div>

              {/* Row 4: Attach Best Practice Blueprints from Library */}
              <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200/80 dark:border-white/10 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <BookOpen size={15} className="text-cyan-500" />
                    <span className="text-xs font-extrabold uppercase tracking-wider">
                      4. Attach Reference Blueprints ({selectedPromptSnippetIds.length} Selected)
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] lowercase opacity-60 flex items-center gap-1">
                      <HelpCircle size={11} /> hover blueprint for code summary
                    </span>
                    <span className="opacity-30">•</span>
                    <button
                      type="button"
                      onClick={() => setSelectedPromptSnippetIds(snippets.map(s => s.id))}
                      className="text-[10.5px] font-bold text-blue-500 hover:underline"
                    >
                      Select All ({snippets.length})
                    </button>
                    <span className="opacity-30">•</span>
                    <button
                      type="button"
                      onClick={() => setSelectedPromptSnippetIds([])}
                      className="text-[10.5px] font-bold text-slate-400 hover:underline"
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>

                {/* Suggested Snippets Section if AI Match was run */}
                {suggestedSnippets.length > 0 && (
                  <div className="mb-4 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
                    <div className="flex items-center gap-1.5 mb-2 text-amber-500 text-xs font-bold">
                      <Sparkles size={13} />
                      <span>AI Matched Blueprints for this Architecture:</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {suggestedSnippets.map((s) => {
                        const isSelected = selectedPromptSnippetIds.includes(s.id);
                        return (
                          <div
                            key={s.id}
                            onClick={() => handleTogglePromptSnippet(s.id)}
                            onMouseEnter={(e) => handleMouseEnterCard(s, 'snippet', e)}
                            onMouseLeave={handleMouseLeaveCard}
                            className={`p-2 rounded-lg border cursor-pointer flex items-center justify-between gap-1 text-[11px] font-semibold transition-all ${
                              isSelected
                                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                            }`}
                          >
                            <span className="truncate">{s.title}</span>
                            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/30 text-amber-200 font-mono shrink-0">
                              {s.similarity}% match
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Snippets Checklist (Compact grid) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 max-h-56 overflow-y-auto pr-1">
                  {snippets.map((snip) => {
                    const isChecked = selectedPromptSnippetIds.includes(snip.id);
                    return (
                      <div
                        key={snip.id}
                        onClick={() => handleTogglePromptSnippet(snip.id)}
                        onMouseEnter={(e) => handleMouseEnterCard(snip, 'snippet', e)}
                        onMouseLeave={handleMouseLeaveCard}
                        className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2 transition-all relative group ${
                          isChecked
                            ? isDark
                              ? 'bg-blue-950/60 border-blue-500/80 text-white shadow-sm ring-1 ring-blue-500/40'
                              : 'bg-blue-50 border-blue-400 text-slate-900 shadow-sm ring-1 ring-blue-400/40'
                            : isDark
                              ? 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                        }`}
                      >
                        <span className="mt-0.5 shrink-0 text-blue-500">
                          {isChecked ? <CheckSquare size={14} /> : <Square size={14} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold truncate leading-tight">{snip.title}</div>
                          <div className="text-[9.5px] font-mono opacity-60 truncate mt-0.5">{snip.technology} • {snip.file_path?.split('/').pop()}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Button: Generate Implementation Prompt */}
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={handleGenerateAntigravityPrompt}
                  disabled={isGeneratingPrompt}
                  className="px-6 py-3 rounded-2xl text-sm font-black flex items-center gap-2 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white transition-all shadow-lg shadow-blue-500/25 active:scale-95 disabled:opacity-50"
                >
                  <Sparkles size={16} className={isGeneratingPrompt ? 'animate-spin text-amber-300' : 'text-amber-300'} />
                  <span>{isGeneratingPrompt ? 'Synthesizing Architecture Plan...' : 'Generate Antigravity Kick-off Prompt'}</span>
                </button>
              </div>

              {/* Generated Prompt Output Box */}
              {generatedPromptResult && (
                <div className={`p-5 rounded-2xl border ${isDark ? 'bg-slate-950 border-blue-500/40' : 'bg-slate-50 border-blue-300'} animate-in fade-in duration-200`}>
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/80 dark:border-white/10 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-500" />
                      <span className="text-xs font-extrabold uppercase tracking-wider">
                        Generated Prompt for Antigravity ({generatedPromptResult.snippetCount} Reference Blueprints Attached)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyPromptToClipboard}
                      className="px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black transition-all shadow-sm"
                    >
                      {copiedPrompt ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedPrompt ? 'Copied Prompt!' : 'Copy Prompt to Clipboard'}</span>
                    </button>
                  </div>
                  <pre className="p-4 rounded-xl font-mono text-xs overflow-x-auto leading-relaxed max-h-80 bg-slate-900 text-slate-200 border border-slate-800 select-all">
                    <code>{generatedPromptResult.promptMarkdown}</code>
                  </pre>
                  <p className={`text-[11px] mt-2.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    💡 <strong>Next Step:</strong> Click <strong>Copy Prompt to Clipboard</strong>, open a fresh empty folder in your IDE, start a new Antigravity session, and paste this prompt to scaffold and build your project immediately.
                  </p>
                </div>
              )}
            </div>

            {/* Floating Rich Hover Popovers */}
            {hoveredScaffold && (
              <div
                className={`fixed z-[100] w-96 p-4 rounded-2xl border shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 pointer-events-none ${
                  isDark ? 'bg-slate-900/95 border-blue-500/40 text-slate-100 shadow-[0_12px_36px_rgba(0,0,0,0.7)]' : 'bg-white/95 border-blue-300 text-slate-800 shadow-[0_12px_36px_rgba(0,0,0,0.15)]'
                }`}
                style={{ top: `${Math.min(window.innerHeight - 260, hoverCardPos.top)}px`, left: `${hoverCardPos.left}px` }}
              >
                <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-200/80 dark:border-white/10">
                  <div className="flex items-center gap-2">
                    <Boxes size={16} className="text-blue-500" />
                    <span className="font-extrabold text-xs">{hoveredScaffold.label}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    {hoveredScaffold.badge}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed mb-3 opacity-80">
                  {hoveredScaffold.desc}
                </p>
                <div className="space-y-1 mb-3">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-blue-500">Key Capabilities:</div>
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    {hoveredScaffold.highlights?.map((h, i) => (
                      <div key={i} className="flex items-center gap-1 opacity-90">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        <span className="truncate">{h}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`p-2 rounded-lg font-mono text-[10px] border truncate ${isDark ? 'bg-black/50 border-white/10 text-cyan-300' : 'bg-slate-100 border-slate-200 text-blue-700'}`}>
                  $ {hoveredScaffold.cli}
                </div>
              </div>
            )}

            {hoveredCss && (
              <div
                className={`fixed z-[100] w-96 p-4 rounded-2xl border shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 pointer-events-none ${
                  isDark ? 'bg-slate-900/95 border-purple-500/40 text-slate-100 shadow-[0_12px_36px_rgba(0,0,0,0.7)]' : 'bg-white/95 border-purple-300 text-slate-800 shadow-[0_12px_36px_rgba(0,0,0,0.15)]'
                }`}
                style={{ top: `${Math.min(window.innerHeight - 240, hoverCardPos.top)}px`, left: `${hoverCardPos.left}px` }}
              >
                <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-200/80 dark:border-white/10">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-purple-500" />
                    <span className="font-extrabold text-xs">{hoveredCss.label}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                    {hoveredCss.sub}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed mb-3 opacity-80">
                  {hoveredCss.desc}
                </p>
                <div className="space-y-1">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-purple-500">Styling Features:</div>
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    {hoveredCss.features?.map((f, i) => (
                      <div key={i} className="flex items-center gap-1 opacity-90">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                        <span className="truncate">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {hoveredPrecondition && (
              <div
                className={`fixed z-[100] w-96 p-4 rounded-2xl border shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 pointer-events-none ${
                  isDark ? 'bg-slate-900/95 border-emerald-500/40 text-slate-100 shadow-[0_12px_36px_rgba(0,0,0,0.7)]' : 'bg-white/95 border-emerald-300 text-slate-800 shadow-[0_12px_36px_rgba(0,0,0,0.15)]'
                }`}
                style={{ top: `${Math.min(window.innerHeight - 220, hoverCardPos.top)}px`, left: `${hoverCardPos.left}px` }}
              >
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-200/80 dark:border-white/10">
                  <ShieldCheck size={16} className="text-emerald-500" />
                  <span className="font-extrabold text-xs">{hoveredPrecondition.title}</span>
                </div>
                <p className="text-[11px] leading-relaxed mb-2.5 opacity-80">
                  {hoveredPrecondition.desc}
                </p>
                {hoveredPrecondition.benefit && (
                  <div className={`p-2 rounded-lg text-[10px] leading-snug border ${isDark ? 'bg-emerald-950/40 border-emerald-500/20 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                    ✨ <strong>Antigravity Guarantee:</strong> {hoveredPrecondition.benefit}
                  </div>
                )}
              </div>
            )}

            {hoveredSnippet && (
              <div
                className={`fixed z-[100] w-[420px] p-4 rounded-2xl border shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 pointer-events-none ${
                  isDark ? 'bg-slate-900/95 border-cyan-500/40 text-slate-100 shadow-[0_12px_36px_rgba(0,0,0,0.7)]' : 'bg-white/95 border-cyan-300 text-slate-800 shadow-[0_12px_36px_rgba(0,0,0,0.15)]'
                }`}
                style={{ top: `${Math.min(window.innerHeight - 280, hoverCardPos.top)}px`, left: `${Math.min(window.innerWidth - 440, hoverCardPos.left)}px` }}
              >
                <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-200/80 dark:border-white/10">
                  <div className="flex items-center gap-2 min-w-0">
                    <BookOpen size={16} className="text-cyan-500 shrink-0" />
                    <span className="font-extrabold text-xs truncate">{hoveredSnippet.title}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shrink-0">
                    {hoveredSnippet.technology}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed mb-3 opacity-80 line-clamp-3">
                  {hoveredSnippet.description || 'Verified production pattern blueprint.'}
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="opacity-60">Source File:</span>
                    <span className="font-mono text-cyan-400 truncate max-w-[260px]">{hoveredSnippet.file_path}</span>
                  </div>
                  {hoveredSnippet.principles?.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap pt-1">
                      {hoveredSnippet.principles.slice(0, 3).map((pr, i) => (
                        <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'}`}>
                          {pr.name || pr}
                        </span>
                      ))}
                    </div>
                  )}
                  {hoveredSnippet.inputs && (
                    <div className={`mt-2 p-2 rounded-lg font-mono text-[9.5px] border ${isDark ? 'bg-black/50 border-white/10 text-emerald-300' : 'bg-slate-50 border-slate-200 text-emerald-700'}`}>
                      <span className="font-bold opacity-70">Inputs Contract:</span> {typeof hoveredSnippet.inputs === 'string' ? hoveredSnippet.inputs.slice(0, 90) : JSON.stringify(hoveredSnippet.inputs).slice(0, 90)}...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </PortalShell>
  );
}
