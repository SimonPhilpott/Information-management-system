import React from 'react';
import { Cookie, Clock, Sparkles, ChevronDown, ChevronUp, AlertCircle, Droplets, Zap } from 'lucide-react';
import { dist } from '../../../utils/units';

// Helper for delta badge
const renderDeltaBadge = (current, baseline, type = 'carbs') => {
  if (baseline == null || baseline <= 0 || current == null) return null;
  const pct = Math.round(((current - baseline) / baseline) * 100);
  if (pct === 0) return <span className="text-[9px] font-bold text-slate-500 tabular-nums">0%</span>;
  const isPos = pct > 0;
  const tone = isPos ? 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30' : 'text-amber-400 bg-amber-500/15 border-amber-500/30';
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black tabular-nums border ${tone}`} title={`${isPos ? '+' : ''}${pct}% vs original plan`}>
      {isPos ? '+' : ''}{pct}%
    </span>
  );
};

// Predicted glucose (with and without the planned carbs) over the route's elevation profile.
export function PlanChart({ plan, isDark }) {
  if (!plan || !plan.prediction || !plan.elevation) return null;
  const dur = plan.run.durationMin;
  const total = plan.prediction[plan.prediction.length - 1][0];
  const W = 760, PADL = 30, PADR = 10, H1 = 170, H2 = 56, GAP = 18;
  const X = (m) => PADL + (m / total) * (W - PADL - PADR);
  const maxBg = Math.max(12, Math.ceil(Math.max(...plan.prediction.map((p) => p[1]), ...plan.withoutCarbs.map((p) => p[1])) + 1));
  const Y = (v) => 8 + (1 - (Math.min(maxBg, Math.max(2, v)) - 2) / (maxBg - 2)) * (H1 - 16);
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
  const eles = plan.elevation.map((e) => e[2]);
  const eMin = Math.min(...eles), eMax = Math.max(...eles, eMin + 1);
  const Y2 = (v) => H1 + GAP + (1 - (v - eMin) / (eMax - eMin)) * (H2 - 6);
  const area = plan.elevation.map((e, i) => `${i ? 'L' : 'M'}${X(e[0]).toFixed(1)},${Y2(e[2]).toFixed(1)}`).join(' ') + ` L${X(plan.elevation[plan.elevation.length - 1][0])},${H1 + GAP + H2} L${X(0)},${H1 + GAP + H2} Z`;
  const ticks = []; for (let m = 0; m <= total; m += 30) ticks.push(m);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H1 + GAP + H2 + 16}`} className="w-full min-w-[560px]" role="img" aria-label="Predicted glucose over the run">
        <rect x={X(0)} y={0} width={X(dur) - X(0)} height={H1 + GAP + H2} fill="rgba(249,115,22,0.08)" />
        <text x={X(0) + 4} y={11} fontSize="9" fill="#f97316">run</text>
        <line x1={PADL} x2={W - PADR} y1={Y(plan.settings.floor)} y2={Y(plan.settings.floor)} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity="0.7" />
        <text x={2} y={Y(plan.settings.floor) + 3} fontSize="9" fill="#ef4444">{plan.settings.floor}</text>
        <line x1={PADL} x2={W - PADR} y1={Y(plan.settings.startTarget)} y2={Y(plan.settings.startTarget)} stroke="#22c55e" strokeDasharray="4 3" strokeOpacity="0.5" />
        <text x={2} y={Y(plan.settings.startTarget) + 3} fontSize="9" fill="#22c55e">{plan.settings.startTarget}</text>
        <path d={path(plan.withoutCarbs)} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" />
        <path d={path(plan.prediction)} fill="none" stroke="#38bdf8" strokeWidth="2.2" strokeLinejoin="round" />
        {plan.plan.stops.map((s, i) => (
          <g key={i}>
            <line x1={X(s.minute)} x2={X(s.minute)} y1={10} y2={H1} stroke="#facc15" strokeWidth="1.2" strokeOpacity="0.8" />
            <text x={X(s.minute) + 3} y={20 + (i % 2) * 10} fontSize="9" fontWeight="700" fill="#facc15">{s.grams} g</text>
          </g>
        ))}
        <path d={area} fill="rgba(148,163,184,0.25)" stroke="#94a3b8" strokeWidth="1" />
        <text x={2} y={H1 + GAP + 10} fontSize="9" fill="currentColor" opacity="0.5">{Math.round(eMax)}m</text>
        {ticks.map((m) => (<text key={m} x={X(m)} y={H1 + GAP + H2 + 12} fontSize="9" textAnchor="middle" fill="currentColor" opacity="0.55">{m === 0 ? 'start' : `${m}m`}</text>))}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500 mt-1">
        <span><span className="inline-block w-3 h-0.5 bg-sky-400 align-middle mr-1" />estimated glucose with plan</span>
        <span><span className="inline-block w-3 h-0.5 bg-slate-400 align-middle mr-1" />with no carbs</span>
        <span><span className="inline-block w-3 h-0.5 bg-yellow-400 align-middle mr-1" />carb stop</span>
        <span><span className="inline-block w-3 h-0.5 bg-red-500 align-middle mr-1" />hypo floor</span>
        <span><span className="inline-block w-3 h-0.5 bg-green-500 align-middle mr-1" />start target</span>
        <span>grey area = route elevation</span>
      </div>
    </div>
  );
}

/**
 * Infographic Carb Fueling Timeline component:
 * Visualises carb intake milestones, grams, absorption timing, and glucose trajectory.
 */
export default function CarbFuelingTimeline({
  plan = null,
  units = 'km',
  isDark = true,
  originalBaseline = null,
  onStepCarbs = null
}) {
  if (!plan) return null;

  const totalCarbs = plan.plan.totalCarbs || 0;
  const stops = plan.plan.stops || [];
  const baselineCarbs = originalBaseline?.totalCarbs || totalCarbs;
  const durationMin = plan.run.durationMin || 60;
  const carbRatePerHour = durationMin > 0 ? Math.round((totalCarbs / (durationMin / 60))) : 0;

  return (
    <div className={`p-4 rounded-2xl border transition-all ${isDark ? 'bg-slate-900/40 border-white/10' : 'bg-white border-slate-200 shadow-sm'} mb-4`}>
      {/* Header & Quick Stats */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Cookie size={16} />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
              Carb Strategy & Fueling Timeline
              {originalBaseline && renderDeltaBadge(totalCarbs, baselineCarbs, 'carbs')}
            </h3>
            <p className="text-[10px] text-slate-500">Planned carbohydrate schedule timed to elevation gradients and aerobic demand</p>
          </div>
        </div>

        {/* Aggregate KPI chips */}
        <div className="flex items-center gap-2">
          <div className={`px-2.5 py-1.5 rounded-lg border text-right ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Total Fuel</div>
            <div className="text-sm font-black tabular-nums text-yellow-400">{totalCarbs} <span className="text-[10px] font-bold text-slate-400">g</span></div>
          </div>
          <div className={`px-2.5 py-1.5 rounded-lg border text-right ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Fuel Rate</div>
            <div className="text-sm font-black tabular-nums text-sky-400">{carbRatePerHour} <span className="text-[10px] font-bold text-slate-400">g/h</span></div>
          </div>
          <div className={`px-2.5 py-1.5 rounded-lg border text-right ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Stops</div>
            <div className="text-sm font-black tabular-nums text-emerald-400">{stops.length}</div>
          </div>
        </div>
      </div>

      {/* Visual Timeline Milestones Bar */}
      {stops.length > 0 ? (
        <div className="mb-5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
            <Clock size={12} className="text-amber-400" />
            Milestone Fueling Schedule
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {stops.map((s, idx) => (
              <div
                key={idx}
                className={`relative p-3 rounded-xl border transition-all ${
                  isDark
                    ? 'bg-slate-950/60 border-amber-500/20 hover:border-amber-500/40 shadow-sm'
                    : 'bg-amber-50/50 border-amber-200 shadow-sm'
                }`}
              >
                {/* Step Index & Time Badge */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    Stop {idx + 1} • {s.minute} min
                  </span>
                  <span className="text-[10px] font-bold tabular-nums text-slate-400">
                    km {dist(s.km, units, 1)}
                  </span>
                </div>

                {/* Grams & Quick Steppers */}
                <div className="flex items-center justify-between my-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black tabular-nums text-yellow-400">
                      {s.grams} <span className="text-xs font-bold text-slate-400">g</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/5">
                      Fast Gel
                    </span>
                  </div>

                  {onStepCarbs && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onStepCarbs(-5)}
                        className="w-6 h-6 rounded flex items-center justify-center border border-white/10 hover:bg-white/10 active:scale-95 text-slate-300 text-xs font-bold"
                        title="Reduce plan carbs by 5g"
                      >
                        -
                      </button>
                      <button
                        onClick={() => onStepCarbs(5)}
                        className="w-6 h-6 rounded flex items-center justify-center border border-white/10 hover:bg-white/10 active:scale-95 text-slate-300 text-xs font-bold"
                        title="Increase plan carbs by 5g"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>

                {/* Guidance Pill */}
                <div className="text-[10px] text-slate-400 leading-tight mt-1 flex items-center gap-1">
                  <Zap size={11} className="text-amber-400 shrink-0" />
                  <span>Take before fatigue sets in. Chase with 2-3 sips water.</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-3 rounded-xl border border-dashed border-white/10 text-center text-xs text-slate-400 mb-4">
          No in-run carb stops required for this distance and metabolic state. Carry emergency hypo treatment as standard.
        </div>
      )}

      {/* Trajectory Elevation & Glucose Infographic Chart */}
      <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950/50 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
          <Sparkles size={12} className="text-sky-400" />
          Physiologic Glucose Trajectory vs Course Topography
        </div>
        <PlanChart plan={plan} isDark={isDark} />
      </div>
    </div>
  );
}
