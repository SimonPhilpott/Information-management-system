import React from 'react';
import { CheckCircle2, Info, AlertTriangle, AlertOctagon } from 'lucide-react';

// One look for every notice in the Run Planner: a coloured edge and icon by kind (good / info / act on it / stop),
// a short bold title, the detail, and any buttons on the right. Dark text on a pale tint in light mode, so it reads
// easily on white; light text on a dim tint in dark mode.
const TONES = {
  good: { Icon: CheckCircle2, light: 'border-emerald-500 bg-emerald-50 text-emerald-950', dark: 'border-emerald-400 bg-emerald-500/10 text-emerald-50', icon: ['text-emerald-600', 'text-emerald-300'] },
  info: { Icon: Info, light: 'border-sky-500 bg-sky-50 text-sky-950', dark: 'border-sky-400 bg-sky-500/10 text-sky-50', icon: ['text-sky-600', 'text-sky-300'] },
  warn: { Icon: AlertTriangle, light: 'border-amber-500 bg-amber-50 text-amber-950', dark: 'border-amber-400 bg-amber-500/10 text-amber-50', icon: ['text-amber-600', 'text-amber-300'] },
  stop: { Icon: AlertOctagon, light: 'border-red-500 bg-red-50 text-red-950', dark: 'border-red-400 bg-red-500/10 text-red-50', icon: ['text-red-600', 'text-red-300'] },
};

export function noticeButton(isDark, primary = false) {
  return primary
    ? 'px-3 py-1.5 rounded-lg text-xs font-black bg-[#2E2B27] text-white dark:bg-white dark:text-slate-900 active:scale-95'
    : `px-3 py-1.5 rounded-lg text-xs font-bold border active:scale-95 ${isDark ? 'border-white/20 hover:bg-white/10' : 'border-black/15 bg-white/70 hover:bg-white'}`;
}

export default function Notice({ tone = 'info', title, children, actions = null, isDark = false, large = false, icon = null }) {
  const t = TONES[tone] || TONES.info;
  const Icon = icon || t.Icon;
  return (
    <div className={`rounded-xl border border-l-4 px-3.5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 ${isDark ? t.dark : t.light}`} role={tone === 'stop' || tone === 'warn' ? 'alert' : 'status'}>
      <Icon size={large ? 24 : 17} className={`shrink-0 self-start mt-0.5 ${t.icon[isDark ? 1 : 0]}`} />
      <div className="flex-1 min-w-[200px]">
        {title && <div className={`${large ? 'text-base' : 'text-xs'} font-black leading-tight`}>{title}</div>}
        {children && <div className="text-[11px] leading-snug mt-0.5 opacity-90">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
