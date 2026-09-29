import React from 'react';
import { Cookie, Clock, Sparkles, AlertCircle, Droplets, Zap, ChevronUp, ChevronDown } from 'lucide-react';
import { dist } from '../../../utils/units';

// Helper for delta badge
const renderDeltaBadge = (current, baseline, type = 'carbs', isDark = true) => {
  if (baseline == null || baseline <= 0 || current == null) return null;
  const pct = Math.round(((current - baseline) / baseline) * 100);
  if (pct === 0) return <span className={`text-[10px] font-black tabular-nums px-2 py-0.5 rounded-full ${isDark ? 'bg-white/10 text-slate-300' : 'bg-[#2E2B27]/10 text-[#2E2B27]'}`}>0%</span>;
  const isPos = pct > 0;
  const tone = isPos
    ? (isDark ? 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30' : 'text-amber-950 bg-amber-100 border-amber-300 font-bold')
    : (isDark ? 'text-amber-400 bg-amber-500/15 border-amber-500/30' : 'text-orange-950 bg-orange-100 border-orange-300 font-bold');
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black tabular-nums border ${tone}`} title={`${isPos ? '+' : ''}${pct}% vs original plan`}>
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
        <rect x={X(0)} y={0} width={X(dur) - X(0)} height={H1 + GAP + H2} fill={isDark ? "rgba(249,115,22,0.08)" : "rgba(249,115,22,0.12)"} />
        <text x={X(0) + 4} y={11} fontSize="9" fontWeight="700" fill={isDark ? "#f97316" : "#c2410c"}>run</text>
        <line x1={PADL} x2={W - PADR} y1={Y(plan.settings.floor)} y2={Y(plan.settings.floor)} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity="0.8" />
        <text x={2} y={Y(plan.settings.floor) + 3} fontSize="9" fontWeight="700" fill="#dc2626">{plan.settings.floor}</text>
        <line x1={PADL} x2={W - PADR} y1={Y(plan.settings.startTarget)} y2={Y(plan.settings.startTarget)} stroke="#16a34a" strokeDasharray="4 3" strokeOpacity="0.8" />
        <text x={2} y={Y(plan.settings.startTarget) + 3} fontSize="9" fontWeight="700" fill="#16a34a">{plan.settings.startTarget}</text>
        <path d={path(plan.withoutCarbs)} fill="none" stroke={isDark ? "#94a3b8" : "#64748b"} strokeWidth="1.5" strokeDasharray="4 3" />
        <path d={path(plan.prediction)} fill="none" stroke="#0284c7" strokeWidth="2.4" strokeLinejoin="round" />
        {plan.plan.stops.map((s, i) => (
          <g key={i}>
            <line x1={X(s.minute)} x2={X(s.minute)} y1={10} y2={H1} stroke={isDark ? "#facc15" : "#b45309"} strokeWidth="1.5" strokeOpacity="0.85" />
            <text x={X(s.minute) + 3} y={20 + (i % 2) * 10} fontSize="9" fontWeight="800" fill={isDark ? "#facc15" : "#78350f"}>{s.grams} g</text>
          </g>
        ))}
        <path d={area} fill={isDark ? "rgba(148,163,184,0.25)" : "rgba(120,53,15,0.12)"} stroke={isDark ? "#94a3b8" : "#b45309"} strokeWidth="1.2" />
        <text x={2} y={H1 + GAP + 10} fontSize="9" fontWeight="700" fill="currentColor" opacity="0.7">{Math.round(eMax)}m</text>
        {ticks.map((m) => (<text key={m} x={X(m)} y={H1 + GAP + H2 + 12} fontSize="9" fontWeight="600" textAnchor="middle" fill="currentColor" opacity="0.8">{m === 0 ? 'start' : `${m}m`}</text>))}
      </svg>
      <div className={`flex flex-wrap gap-x-4 gap-y-1 text-[10px] mt-1 ${isDark ? 'text-slate-400' : 'text-[#2E2B27] font-medium'}`}>
        <span><span className="inline-block w-3 h-1 bg-sky-500 align-middle mr-1 rounded" />estimated glucose with plan</span>
        <span><span className={`inline-block w-3 h-1 ${isDark ? 'bg-slate-400' : 'bg-slate-600'} align-middle mr-1 rounded`} />with no carbs</span>
        <span><span className={`inline-block w-3 h-1 ${isDark ? 'bg-yellow-400' : 'bg-amber-600'} align-middle mr-1 rounded`} />carb stop</span>
        <span><span className="inline-block w-3 h-1 bg-red-500 align-middle mr-1 rounded" />hypo floor</span>
        <span><span className="inline-block w-3 h-1 bg-green-600 align-middle mr-1 rounded" />start target</span>
        <span className="opacity-75">shaded area = route elevation</span>
      </div>
    </div>
  );
}

/**
 * Infographic Carb Fueling Timeline component.
 *
 * Props:
 *   onStepCarbs(delta)         – global Total Fuel ± stepper (proportional rebalance via customCarbs)
 *   onStepStopCarbs(idx, delta) – per-stop independent stepper (sends exact intakes via customIntakes)
 *
 * Per-stop rules:
 *   - Each milestone's +/- is fully independent; changing one does NOT affect others.
 *   - Minimum per stop = 0 g (zeroing a stop removes it from the simulation).
 *   - Total Fuel and Fuel Rate chips react instantly after any per-stop change.
 */
export default function CarbFuelingTimeline({
  plan = null,
  units = 'km',
  isDark = true,
  originalBaseline = null,
  onStepCarbs = null,
  onStepStopCarbs = null,
}) {
  if (!plan) return null;

  const totalCarbs = plan.plan.totalCarbs || 0;
  const stops = plan.plan.stops || [];
  const baselineCarbs = originalBaseline?.totalCarbs || totalCarbs;
  const durationMin = plan.run.durationMin || 60;
  const carbRatePerHour = durationMin > 0 ? Math.round((totalCarbs / (durationMin / 60))) : 0;

  // Shared stepper button style
  const stepBtn = (extraClass = '') =>
    `w-7 h-7 rounded-lg flex items-center justify-center border active:scale-95 text-sm font-black transition-all select-none ${
      isDark
        ? 'border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed'
        : 'border-[#2E2B27]/20 bg-white hover:bg-amber-100 text-[#2E2B27] shadow-xs disabled:opacity-30 disabled:cursor-not-allowed'
    } ${extraClass}`;

  return (
    <div className={`p-4 rounded-2xl border transition-all ${isDark ? 'bg-slate-900/40 border-white/10' : 'bg-white border-[#2E2B27]/10 shadow-sm'} mb-4`}>
      {/* Header & Quick Stats */}
      <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 pb-3 border-b ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDark ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400' : 'bg-amber-500/20 border border-amber-600/30 text-amber-800'}`}>
            <Cookie size={17} />
          </div>
          <div>
            <h3 className={`text-xs font-black uppercase tracking-wider flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-[#2E2B27]'}`}>
              Carb Strategy &amp; Fueling Timeline
              {originalBaseline && renderDeltaBadge(totalCarbs, baselineCarbs, 'carbs', isDark)}
            </h3>
            <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-[#2E2B27]/80 font-medium'}`}>
              Planned carbohydrate schedule timed to elevation gradients and aerobic demand
            </p>
          </div>
        </div>

        {/* Aggregate KPI chips — Total Fuel and Fuel Rate react to per-stop changes */}
        <div className="flex items-center gap-2">
          {/* Total Fuel — ± adjusts global total (proportional rebalance) */}
          <div className={`px-3 py-1.5 rounded-xl border text-right ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-[#FAF7F2] border-[#2E2B27]/15'}`}>
            <div className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-[#2E2B27]/70'}`}>Total Fuel</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {onStepCarbs && (
                <button
                  onClick={() => onStepCarbs(-5)}
                  disabled={totalCarbs <= 0}
                  className={stepBtn()}
                  title="Reduce total carbs by 5g (rebalances all stops proportionally)"
                >-</button>
              )}
              <span className={`text-sm font-black tabular-nums ${isDark ? 'text-yellow-400' : 'text-amber-950'}`}>
                {totalCarbs} <span className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-[#2E2B27]'}`}>g</span>
              </span>
              {onStepCarbs && (
                <button
                  onClick={() => onStepCarbs(5)}
                  className={stepBtn()}
                  title="Increase total carbs by 5g (rebalances all stops proportionally)"
                >+</button>
              )}
            </div>
            {onStepCarbs && (
              <div className={`text-[9px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>rebalances all stops</div>
            )}
          </div>

          {/* Fuel Rate — display only, derived from total */}
          <div className={`px-3 py-1.5 rounded-xl border text-right ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-[#FAF7F2] border-[#2E2B27]/15'}`}>
            <div className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-[#2E2B27]/70'}`}>Fuel Rate</div>
            <div className={`text-sm font-black tabular-nums mt-0.5 ${isDark ? 'text-sky-400' : 'text-sky-900'}`}>
              {carbRatePerHour} <span className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-[#2E2B27]'}`}>g/h</span>
            </div>
          </div>

          <div className={`px-3 py-1.5 rounded-xl border text-right ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-[#FAF7F2] border-[#2E2B27]/15'}`}>
            <div className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-[#2E2B27]/70'}`}>Stops</div>
            <div className={`text-sm font-black tabular-nums mt-0.5 ${isDark ? 'text-emerald-400' : 'text-emerald-900'}`}>{stops.length}</div>
          </div>
        </div>
      </div>

      {/* Visual Timeline Milestones */}
      {stops.length > 0 ? (
        <div className="mb-5">
          <div className={`text-xs font-black uppercase tracking-wider mb-1 flex items-center gap-1.5 ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>
            <Clock size={13} className={isDark ? 'text-amber-400' : 'text-amber-700'} />
            Milestone Fueling Schedule
          </div>
          <p className={`text-[11px] mb-3 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
            Each stop is independent — adjust one without affecting others. Set to 0 g to remove a stop.{' '}
            {onStepCarbs && 'Use Total Fuel ± above to rebalance all stops proportionally.'}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {stops.map((s, idx) => (
              <div
                key={idx}
                className={`relative p-3.5 rounded-xl border transition-all ${
                  isDark
                    ? 'bg-slate-950/60 border-amber-500/20 hover:border-amber-500/40 shadow-sm'
                    : 'bg-[#FAF7F2] border-amber-500/30 hover:border-amber-600/50 shadow-sm'
                }`}
              >
                {/* Stop header */}
                <div className="flex items-center justify-between mb-2.5">
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                    isDark ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-amber-600 text-white font-black shadow-xs'
                  }`}>
                    Stop {idx + 1} • {s.minute} min
                  </span>
                  <span className={`text-xs font-black tabular-nums ${isDark ? 'text-slate-300' : 'text-[#2E2B27]'}`}>
                    km {dist(s.km, units, 1)}
                  </span>
                </div>

                {/* Grams value + per-stop independent ± steppers */}
                <div className="flex items-center justify-between my-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-black tabular-nums ${isDark ? 'text-yellow-400' : 'text-amber-950'}`}>
                      {s.grams} <span className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-[#2E2B27]'}`}>g</span>
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded border ${isDark ? 'bg-slate-800 text-slate-300 border-white/5' : 'bg-white text-[#2E2B27] border-[#2E2B27]/20 font-black shadow-2xs'}`}>
                      Fast Gel
                    </span>
                  </div>

                  {onStepStopCarbs && (
                    <div className="flex flex-col items-center gap-1">
                      <button
                        onClick={() => onStepStopCarbs(idx, 5)}
                        className={stepBtn()}
                        title={`Increase stop ${idx + 1} by 5g (independent)`}
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        onClick={() => onStepStopCarbs(idx, -5)}
                        disabled={s.grams <= 0}
                        className={stepBtn()}
                        title={`Decrease stop ${idx + 1} by 5g — set to 0 to remove`}
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Guidance pill */}
                <div className={`text-[11px] leading-snug mt-2 p-1.5 rounded-lg flex items-center gap-1.5 ${
                  isDark ? 'bg-amber-500/10 text-amber-200 border border-amber-500/20' : 'bg-amber-100/70 text-amber-950 border border-amber-300 font-medium'
                }`}>
                  <Zap size={13} className="text-amber-600 shrink-0" />
                  <span>{s.note || 'Take before fatigue sets in. Chase with 2-3 sips water.'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={`p-3.5 rounded-xl border text-center text-xs mb-4 ${isDark ? 'border-dashed border-white/10 text-slate-400' : 'border-dashed border-[#2E2B27]/20 text-[#2E2B27] bg-[#FAF7F2] font-medium'}`}>
          No in-run carb stops required for this distance and metabolic state. Carry emergency hypo treatment as standard.
        </div>
      )}

      {/* Trajectory Elevation & Glucose Infographic Chart */}
      <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-950/50 border-white/5' : 'bg-[#FAF7F2] border-[#2E2B27]/10'}`}>
        <div className={`text-xs font-black uppercase tracking-wider mb-2.5 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>
          <Sparkles size={13} className="text-sky-500" />
          Physiologic Glucose Trajectory vs Course Topography
        </div>
        <PlanChart plan={plan} isDark={isDark} />
      </div>
    </div>
  );
}
