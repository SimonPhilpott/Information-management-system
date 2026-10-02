import React, { useState, useEffect } from 'react';
import {
  Activity, ArrowRight, Clock, AlertTriangle, CheckCircle2,
  AlertOctagon, Cookie, RefreshCw, Sparkles, TrendingUp,
  TrendingDown, Minus, Info
} from 'lucide-react';

export default function PreRunReadinessCard({
  currentBg,
  trendDirection,
  plannedDistanceKm,
  plannedDurationMin,
  plannedIntensity = 'steady',
  sessionType = 'running',
  isDark = true,
  onApplyCarbs,
  embedded = false // shown inside "Where you are now" rather than as its own card
}) {
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchReadiness = async () => {
    setLoading(true);
    try {
      // the server reads bg and direction (the old names were ignored, so the readiness used defaults)
      const params = new URLSearchParams({
        bg: currentBg != null ? String(currentBg) : '7.2',
        direction: trendDirection || 'Flat',
        sessionType: sessionType || 'running',
        durationMin: plannedDurationMin != null ? String(plannedDurationMin) : '45',
        intensity: plannedIntensity || 'steady'
      });
      const res = await fetch(`/api/planner/readiness?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setReadiness(data);
        setError(null);
      } else {
        setError('Failed to evaluate glucose readiness');
      }
    } catch (e) {
      console.error('Readiness evaluation error:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReadiness();
  }, [currentBg, trendDirection, plannedDurationMin, plannedIntensity, sessionType]);

  if (loading && !readiness) {
    return (
      <div className={`p-4 rounded-2xl border flex items-center justify-center gap-2 text-xs text-slate-400 ${isDark ? 'bg-slate-900/50 border-white/10' : 'bg-white border-slate-200'}`}>
        <RefreshCw size={14} className="animate-spin text-emerald-400" />
        <span>Evaluating pre-run glucose readiness...</span>
      </div>
    );
  }

  if (!readiness) return null;

  const {
    status, // 'GO' | 'WAIT' | 'EAT FIRST'
    summary,
    targetLaunchBg,
    recommendedPreRunCarbs,
    delayMinutes,
    trendBufferApplied,
    advisoryBullets = [],
    clinicalNotes
  } = readiness;

  let badgeColor = isDark
    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    : 'bg-emerald-100 text-emerald-900 border-emerald-300 font-black';
  let badgeIcon = CheckCircle2;
  let borderAccent = isDark ? 'border-emerald-500/30' : 'border-emerald-300';
  let titleText = 'READY TO LAUNCH';

  if (status === 'WAIT') {
    badgeColor = isDark
      ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      : 'bg-rose-100 text-rose-950 border-rose-300 font-black';
    badgeIcon = AlertOctagon;
    borderAccent = isDark ? 'border-rose-500/30' : 'border-rose-300';
    titleText = 'WAIT & STABILISE FIRST';
  } else if (status === 'EAT FIRST') {
    badgeColor = isDark
      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
      : 'bg-amber-100 text-amber-950 border-amber-300 font-black';
    badgeIcon = AlertTriangle;
    borderAccent = isDark ? 'border-amber-500/30' : 'border-amber-300';
    titleText = 'CONSUME PRE-RUN CARBS FIRST';
  }

  const BadgeIcon = badgeIcon;

  return (
    <div className={embedded ? `mt-4 pt-4 border-t flex flex-col gap-3 ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}` : `rounded-2xl border p-4 transition-all flex flex-col gap-3.5 ${borderAccent} ${isDark ? 'bg-slate-900/60' : 'bg-white shadow-sm'}`}>
      {/* Top Title & Status Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-inherit">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl border ${badgeColor}`}>
            <BadgeIcon size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md border ${badgeColor}`}>
                {status}
              </span>
              <span className={`text-xs font-black uppercase tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-950 font-black'}`}>
                Pre-Run Glucose Readiness
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-800 font-medium'}`}>
              {summary}
            </p>
          </div>
        </div>

        {/* Key Metrics Chips */}
        <div className="flex items-center gap-2 shrink-0">
          {recommendedPreRunCarbs > 0 && (
            <div className={`px-3 py-1.5 rounded-xl border flex flex-col items-end ${isDark ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-amber-50 border-amber-300 text-amber-950 font-bold'}`}>
              <span className="text-[9px] font-bold uppercase tracking-wider">Suggested Carbs</span>
              <span className="text-sm font-black tabular-nums font-mono">+{recommendedPreRunCarbs} g</span>
            </div>
          )}
          {delayMinutes > 0 && (
            <div className={`px-3 py-1.5 rounded-xl border flex flex-col items-end ${isDark ? 'bg-rose-500/10 border-rose-500/20 text-rose-300' : 'bg-rose-50 border-rose-300 text-rose-950 font-bold'}`}>
              <span className="text-[9px] font-bold uppercase tracking-wider">Delay Launch</span>
              <span className="text-sm font-black tabular-nums font-mono">~{delayMinutes} min</span>
            </div>
          )}
        </div>
      </div>

      {/* Advisory Bullet Guidance */}
      {advisoryBullets.length > 0 && (
        <div className="flex flex-col gap-1.5 text-xs">
          {advisoryBullets.map((bullet, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <Sparkles size={13} className="text-amber-500 shrink-0 mt-0.5" />
              <span className={isDark ? 'text-slate-300' : 'text-slate-800 font-medium'}>{bullet}</span>
            </div>
          ))}
        </div>
      )}

      {/* Target Launch Range & T1D Action Footer */}
      <div className={`pt-2.5 border-t border-inherit flex flex-wrap items-center justify-between gap-2 text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-700 font-medium'}`}>
        <div className="flex items-center gap-3">
          <span>Target Launch BG: <strong className={`font-mono ${isDark ? 'text-emerald-400' : 'text-emerald-800 font-black'}`}>{targetLaunchBg || '7.0 - 9.0'} mmol/L</strong></span>
          <span>Trend buffer: <strong className={`font-mono ${isDark ? 'text-slate-300' : 'text-slate-900 font-bold'}`}>{trendBufferApplied || '0 g'}</strong></span>
        </div>

        {recommendedPreRunCarbs > 0 && onApplyCarbs && (
          <button
            onClick={() => onApplyCarbs(recommendedPreRunCarbs)}
            className="px-3 py-1 rounded-lg text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow-sm active:scale-95 transition"
          >
            <Cookie size={12} />
            <span>Apply +{recommendedPreRunCarbs}g to Run Plan</span>
          </button>
        )}
      </div>
    </div>
  );
}
