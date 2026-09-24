import React from 'react';
import { ArrowLeft, Brain, Drama, Music, Bell, Clock, PenLine, Cake, Dices, Eye, ScanFace, Sun, Moon, ChevronRight } from 'lucide-react';

// Each entry here is one card on the hub. Add a new one whenever a new
// /ims/* page is built - this is the single place that needs to know about
// all of them (App.jsx separately needs its own route check per page, same
// as the existing /ims/memories one - see the comment there).
const LINKS = [
  {
    path: '/ims/memories',
    title: 'Memories',
    description: 'View, add, edit, and delete everything IMS has been told to remember.',
    icon: Brain,
    gradient: 'from-cyan-500 to-indigo-600',
    glow: 'rgba(0,242,255,0.3)'
  },
  {
    path: '/ims/persona',
    title: 'Persona',
    description: "Edit IMS's fixed dialect, identity, and tool-usage rules (ims_persona_rules.md).",
    icon: Drama,
    gradient: 'from-purple-500 to-fuchsia-600',
    glow: 'rgba(192,38,211,0.3)'
  },
  {
    path: '/ims/musicscan',
    title: 'Music Scanner',
    description: 'New album/EP releases from artists in MUZAK that you don\'t have yet, scanned nightly.',
    icon: Music,
    gradient: 'from-amber-500 to-orange-600',
    glow: 'rgba(249,115,22,0.3)'
  },
  {
    path: '/ims/alarms',
    title: 'Alarms',
    description: 'View, add, edit, and cancel every alarm set on IMS.',
    icon: Bell,
    gradient: 'from-red-500 to-rose-600',
    glow: 'rgba(244,63,94,0.3)'
  },
  {
    path: '/ims/timers',
    title: 'Timers',
    description: 'View, add, edit, and cancel every timer set on IMS.',
    icon: Clock,
    gradient: 'from-sky-500 to-blue-600',
    glow: 'rgba(59,130,246,0.3)'
  },
  {
    path: '/ims/reminders',
    title: 'Reminders',
    description: 'View, add, edit, and cancel every reminder set on IMS.',
    icon: PenLine,
    gradient: 'from-emerald-500 to-teal-600',
    glow: 'rgba(16,185,129,0.3)'
  },
  {
    path: '/ims/birthday',
    title: 'Birthdays',
    description: 'Add birthdays - a cake icon appears on IMS within a week of any of them.',
    icon: Cake,
    gradient: 'from-pink-500 to-fuchsia-600',
    glow: 'rgba(236,72,153,0.3)'
  },
  {
    path: '/ims/boardgames',
    title: 'Board Games',
    description: 'Your BoardGameGeek collection with expansions, and a want-to-sell tick.',
    icon: Dices,
    gradient: 'from-lime-500 to-green-600',
    glow: 'rgba(132,204,22,0.3)'
  },
  {
    path: '/ims/look',
    title: 'Look',
    description: 'See what IMS sees, take snapshots, and ask questions about them.',
    icon: Eye,
    gradient: 'from-cyan-500 to-indigo-600',
    glow: 'rgba(56,189,248,0.3)'
  },
  {
    path: '/ims/faces',
    title: 'Faces',
    description: 'Teach IMS who people are so it can recognise them in photos.',
    icon: ScanFace,
    gradient: 'from-violet-500 to-purple-600',
    glow: 'rgba(139,92,246,0.3)'
  }
];

export default function ImsHub({
  theme = 'dark',
  onThemeToggle,
  currentPath = '/ims',
  setCurrentPath
}) {
  const isDark = theme === 'dark';

  const navigateTo = (path) => {
    window.history.pushState(null, '', path);
    if (setCurrentPath) {
      setCurrentPath(path);
    } else {
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <div className={`h-screen overflow-y-auto w-full flex flex-col font-sans transition-colors duration-300 ${
      isDark ? 'bg-[#030712] text-[#f3f4f6]' : 'bg-[#f4efed] text-[#1f2937]'
    }`}>
      <header className={`px-6 py-4 flex items-center justify-between border-b backdrop-blur-xl sticky top-0 z-40 transition-colors duration-300 ${
        isDark ? 'bg-[#030712]/80 border-white/5' : 'bg-[#f4efed]/85 border-[#2E2B27]/10'
      }`}>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigateTo('/')}
            className={`p-2 rounded-xl flex items-center gap-2 text-xs font-bold transition-all active:scale-95 ${
              isDark
                ? 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
                : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-[#2E2B27] border border-[#2E2B27]/10'
            }`}
            title="Back to the dashboard"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Dashboard</span>
          </button>

          <div className="h-6 w-px bg-slate-500/20" />

          <div>
            <h1 className="text-base font-black tracking-tight leading-none uppercase">IMS Hub</h1>
            <span className="text-[10px] font-semibold text-slate-500 tracking-wider">
              /ims • Quick access to IMS's data and configuration
            </span>
          </div>
        </div>

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
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          Everything about IMS the voice terminal that lives outside a normal chat - what it remembers, and who it is. More pages will land here over time.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <button
                key={link.path}
                onClick={() => navigateTo(link.path)}
                className={`text-left p-5 rounded-2xl border transition-all duration-200 flex flex-col gap-3 group hover:shadow-lg ${
                  isDark
                    ? 'bg-slate-900/50 hover:bg-slate-900/80 border-white/5 hover:border-white/20 shadow-[0_4px_20px_rgba(0,0,0,0.2)]'
                    : 'bg-white hover:bg-white/90 border-[#2E2B27]/10 hover:border-[#899981]/50 shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`p-3 rounded-xl bg-gradient-to-tr ${link.gradient} shadow-[0_0_15px_var(--glow)]`}
                    style={{ '--glow': link.glow }}
                  >
                    <Icon size={20} className="text-white" />
                  </div>
                  <ChevronRight size={18} className={`transition-transform group-hover:translate-x-1 ${isDark ? 'text-slate-600' : 'text-slate-400'}`} />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">{link.title}</h3>
                  <p className={`text-xs mt-1 leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    {link.description}
                  </p>
                </div>
                <span className={`text-[10px] font-mono tracking-wide ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                  {link.path}
                </span>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
