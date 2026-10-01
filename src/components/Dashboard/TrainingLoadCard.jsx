import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, BatteryCharging, TrendingUp, Lightbulb } from 'lucide-react';
import { dist } from '../../utils/units';

// Training load and recovery (from Strava, via /api/strava/training-load) - shown on the Run Planner and
// the Blood sugar page. Fatigue = 7-day load, fitness = 42-day load, form = fitness - fatigue.

const STATUS = {
  fresh: ['Fresh', 'bg-emerald-500'], ready: ['Ready to train', 'bg-emerald-500'], recovering: ['Recovering', 'bg-amber-500'],
  tired: ['Tired', 'bg-orange-500'], 'very tired': ['Very tired', 'bg-rose-500'],
};
const left = (h) => {
  if (h == null) return 'more than three weeks';
  const d = Math.floor(h / 24), hr = h % 24;
  return [d ? `${d} day${d === 1 ? '' : 's'}` : '', hr ? `${hr} hour${hr === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ') || 'under an hour';
};

function FormLine({ history, isDark }) {
  if (!history?.length) return null;
  const w = 260, h = 48, vals = history.map((x) => x.tsb);
  const lo = Math.min(-30, ...vals), hi = Math.max(15, ...vals);
  const y = (v) => h - ((v - lo) / (hi - lo)) * h;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12" preserveAspectRatio="none" aria-label="Form over the last 42 days">
      <rect x="0" y={y(-5)} width={w} height={Math.max(0, y(lo) - y(-5))} className={isDark ? 'fill-rose-500/10' : 'fill-rose-500/10'} />
      <line x1="0" x2={w} y1={y(0)} y2={y(0)} className={isDark ? 'stroke-white/20' : 'stroke-slate-400/40'} strokeDasharray="3 3" />
      <polyline points={pts} fill="none" className="stroke-sky-500" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function TrainingLoadCard({ isDark = true, units = 'km', compact = false, className = '' }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    fetch('/api/strava/training-load').then((r) => r.json()).then((j) => { if (!live) return; if (j.success) setData(j.load); else setError(j.error || 'Unavailable'); })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, []);

  const card = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/80 border-[#2E2B27]/10 shadow-sm'} ${className}`;
  const muted = isDark ? 'text-slate-400' : 'text-[#6A645D]';
  if (error) return <div className={card}><span className={`text-xs ${muted}`}>Training load unavailable: {error}</span></div>;
  if (!data) return <div className={card}><span className={`text-xs ${muted}`}>Working out training load...</span></div>;
  if (!data.available) return <div className={card}><span className={`text-xs ${muted}`}>{data.reason}</span></div>;

  const [statusName, statusColour] = STATUS[data.status] || STATUS.ready;
  const rec = data.recovery;
  const tile = `p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-[#FAF7F2]'}`;

  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-black uppercase tracking-wide flex items-center gap-2"><Activity size={16} className="text-sky-500" /> Training load & recovery</h3>
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-white ${statusColour}`}>{statusName}</span>
      </div>

      {/* recovery */}
      <div className={`${tile} mb-3`}>
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="flex items-center gap-1.5"><BatteryCharging size={14} className={rec.inRecovery ? 'text-amber-500' : 'text-emerald-500'} />
            {rec.inRecovery ? `Recovering - ${left(rec.hoursLeft)} to go` : 'Fully recovered'}</span>
          <span className="font-black text-base">{rec.percent}%</span>
        </div>
        <div className={`h-2 rounded-full mt-2 overflow-hidden ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}>
          <div className={`h-full rounded-full ${rec.percent >= 100 ? 'bg-emerald-500' : rec.percent >= 60 ? 'bg-amber-400' : 'bg-orange-500'}`} style={{ width: `${rec.percent}%` }} />
        </div>
        <div className={`text-[11px] mt-1.5 ${muted}`}>
          {rec.inRecovery && rec.recoveredAt ? `Fully recovered about ${new Date(rec.recoveredAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} (${rec.daysLeft} days) with no more hard training. ` : ''}
          {rec.lastSession && `Last session: ${rec.lastSession.name} (${new Date(`${rec.lastSession.day}T12:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}), load ${rec.lastSession.load}${rec.lastSession.tag ? `, ${rec.lastSession.tag} session` : ''}.`}
        </div>
      </div>

      {!compact && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-xs">
          <div className={tile} title="7-day load"><div className={muted}>Fatigue (7 d)</div><div className="text-lg font-black">{data.atl}</div></div>
          <div className={tile} title="42-day load"><div className={muted}>Fitness (42 d)</div><div className="text-lg font-black">{data.ctl}</div></div>
          <div className={tile} title="Fitness minus fatigue"><div className={muted}>Form</div><div className={`text-lg font-black ${data.tsb < -20 ? 'text-rose-500' : data.tsb < -5 ? 'text-amber-500' : 'text-emerald-500'}`}>{data.tsb > 0 ? '+' : ''}{data.tsb}</div></div>
          <div className={tile} title="Acute:chronic ratio - 0.8 to 1.3 is the sweet spot"><div className={muted}>Load ratio</div><div className={`text-lg font-black ${data.acwr > 1.5 ? 'text-rose-500' : data.acwr > 1.3 ? 'text-amber-500' : ''}`}>{data.acwr ?? '-'}</div></div>
        </div>
      )}

      <div className={`${tile} mb-3 flex items-center justify-between gap-3 text-xs`}>
        <span className="flex items-center gap-1.5 font-bold"><TrendingUp size={14} className="text-sky-500" /> Weekly running</span>
        <span>{dist(data.ramp.thisWeekKm, units, 1)} {units} this week vs {dist(data.ramp.lastWeekKm, units, 1)} {units}
          {data.ramp.pct != null && <span className={`ml-1.5 font-black ${data.ramp.pct > 10 ? 'text-rose-500' : 'text-emerald-500'}`}>{data.ramp.pct > 0 ? '+' : ''}{data.ramp.pct}%</span>}</span>
      </div>

      {!compact && <div className="mb-3"><div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${muted}`}>Form, last 42 days (below the shaded line = still recovering)</div><FormLine history={data.history} isDark={isDark} /></div>}

      {data.warnings.map((w) => (
        <div key={w.kind} className={`flex gap-2 text-xs p-2.5 rounded-xl mb-2 border ${w.level === 'high' ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {w.text}
        </div>
      ))}
      {data.suggestions.map((s) => (
        <div key={s} className="flex gap-2 text-xs mb-1"><Lightbulb size={14} className="shrink-0 mt-0.5 text-amber-400" /> {s}</div>
      ))}
      {!compact && <p className={`text-[10px] mt-2 ${muted}`}>{data.notes}</p>}
    </div>
  );
}
