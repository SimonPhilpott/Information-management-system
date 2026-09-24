import React from 'react';
import { ArrowLeft, Sun, Moon, Check, AlertCircle } from 'lucide-react';

// Common frame for /ims/* pages: scrollable page, sticky header with a back
// button to the IMS Hub, theme toggle, and toast notification.
export default function PortalShell({
  title, subtitle, icon: Icon, gradient, glow, isDark, onThemeToggle, setCurrentPath,
  notification, maxWidth = 'max-w-6xl', children
}) {
  const goHub = () => {
    window.history.pushState(null, '', '/ims');
    if (setCurrentPath) setCurrentPath('/ims');
    else window.dispatchEvent(new PopStateEvent('popstate'));
  };
  return (
    // h-screen + overflow-y-auto: the app shell doesn't scroll the document,
    // so each page is its own scroll container.
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
          <button onClick={goHub} title="Return to IMS Hub" className={`p-2 rounded-xl flex items-center gap-2 text-xs font-bold transition-all active:scale-95 ${
            isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5' : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-[#2E2B27] border border-[#2E2B27]/10'
          }`}>
            <ArrowLeft size={16} /><span className="hidden sm:inline">IMS Hub</span>
          </button>
          <div className="h-6 w-px bg-slate-500/20" />
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl bg-gradient-to-tr ${gradient} shadow-[0_0_15px_var(--glow)]`} style={{ '--glow': glow }}>
              <Icon size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight leading-none uppercase">{title}</h1>
              <span className="text-[10px] font-semibold text-slate-500 tracking-wider">{subtitle}</span>
            </div>
          </div>
        </div>
        {onThemeToggle && (
          <button onClick={onThemeToggle} className={`p-2 rounded-xl transition-all border ${
            isDark ? 'bg-white/5 hover:bg-white/10 text-amber-400 border-white/5' : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-slate-700 border-[#2E2B27]/10'
          }`}>
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        )}
      </header>
      <main className={`flex-1 ${maxWidth} w-full mx-auto p-6 flex flex-col gap-5`}>{children}</main>
    </div>
  );
}
