import React from 'react';
import { Sliders, Save, RotateCw, Shield, AlertTriangle, Zap, HeartPulse } from 'lucide-react';

/**
 * Tab 3: Runner Targets & Physiologic Assumptions
 */
export default function RunTargetsTab({
  targets,
  setTargets,
  saveTargets,
  busy = '',
  isDark = true,
  panelClass = '',
  labelClass = '',
  fieldClass = '',
  btnClass = '',
  ghostClass = ''
}) {
  if (!targets) {
    return (
      <div className={`${panelClass} text-center py-12 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'} text-xs`}>
        Loading targets and assumptions...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Overview Card */}
      <div className={panelClass}>
        <div className="flex items-center gap-2 mb-3">
          <Sliders size={16} className="text-emerald-500" />
          <h2 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>
            Metabolic Targets & Physiological Assumptions
          </h2>
        </div>
        <p className={`text-xs leading-relaxed mb-4 ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>
          These baseline parameters govern the simulation engine, predictive glucose decay curves, and when in-run carbohydrates are prescribed. Adjust your exercise sensitivity multiplier, hypo safety floors, and pre-run target zones.
        </p>

        {/* Input Matrix */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl border mb-4 ${isDark ? 'border-white/5 bg-slate-950/40' : 'border-[#2E2B27]/10 bg-[#FAF7F2]'}`}>
          <div>
            <label className={labelClass}>
              Start Target (mmol/L)
            </label>
            <input
              className={fieldClass}
              type="number"
              step="0.1"
              value={targets.startTarget || ''}
              onChange={(e) => setTargets({ ...targets, startTarget: e.target.value })}
              placeholder="e.g. 8.0"
            />
            <p className={`text-[10px] mt-1 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>Recommended safe start level (7.0 - 9.0)</p>
          </div>

          <div>
            <label className={labelClass}>
              Never Below / Floor (mmol/L)
            </label>
            <input
              className={fieldClass}
              type="number"
              step="0.1"
              value={targets.floor || ''}
              onChange={(e) => setTargets({ ...targets, floor: e.target.value })}
              placeholder="e.g. 4.5"
            />
            <p className={`text-[10px] mt-1 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>Hard hypo threshold triggering carb stop</p>
          </div>

          <div>
            <label className={labelClass}>
              Exercise Insulin Sensitivity (x)
            </label>
            <div className="flex items-center gap-2">
              <input
                className={fieldClass}
                type="number"
                step="0.1"
                min="1.0"
                max="10.0"
                value={targets.sensMult || ''}
                onChange={(e) => setTargets({ ...targets, sensMult: e.target.value })}
                placeholder="e.g. 1.5 - 3.0"
              />
            </div>
            <p className={`text-[10px] mt-1 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>Multiplier on active IOB decay (1.0 to 10.0)</p>
          </div>

          <div>
            <label className={labelClass}>
              Weight (kg, optional)
            </label>
            <input
              className={fieldClass}
              type="number"
              step="0.5"
              value={targets.weightKg ?? ''}
              onChange={(e) => setTargets({ ...targets, weightKg: e.target.value })}
              placeholder="e.g. 72"
            />
            <p className={`text-[10px] mt-1 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>Used for climbing gravitational work</p>
          </div>
        </div>

        {/* Action Button */}
        <div className={`flex items-center justify-between pt-2 border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
          <div className={`text-[11px] flex items-center gap-1.5 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
            <Shield size={13} className="text-emerald-500" />
            <span>Settings synchronize with the simulation model and AndroidAPS pre-bolus wizard.</span>
          </div>

          <button
            onClick={saveTargets}
            disabled={busy === 'targets'}
            className={`${btnClass} px-5`}
          >
            {busy === 'targets' ? <RotateCw size={13} className="animate-spin" /> : <Save size={13} />}
            <span>Save Targets</span>
          </button>
        </div>
      </div>

      {/* Clinical Guidance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-900/30 border-white/5' : 'bg-[#FAF7F2] border-[#2E2B27]/10'}`}>
          <div className={`flex items-center gap-2 text-xs font-bold mb-2 ${isDark ? 'text-sky-400' : 'text-sky-800'}`}>
            <Zap size={14} />
            <span>Why Insulin Sensitivity Multiplier (sensMult) Matters</span>
          </div>
          <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>
            Exercise dramatically enhances skeletal muscle GLUT4 translocation, allowing muscle cells to take up glucose independently of insulin. When active insulin (IOB) is present, muscle contractions multiply its lowering velocity by 1.5x to 4.0x. If you tend to drop rapidly during the first 20 minutes, increase sensMult to 2.5–3.0 so the planner prescribes pre-run or earlier carbs.
          </p>
        </div>

        <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-900/30 border-white/5' : 'bg-[#FAF7F2] border-[#2E2B27]/10'}`}>
          <div className={`flex items-center gap-2 text-xs font-bold mb-2 ${isDark ? 'text-amber-400' : 'text-amber-800'}`}>
            <HeartPulse size={14} />
            <span>Basal Rate Reduction & Temp Targets</span>
          </div>
          <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>
            In closed-loop systems (AAPS / CamAPS), setting an Exercise Temp Target (8.0–9.0 mmol/L) 60–90 minutes before setting off reduces basal infusion, ensuring low circulating insulin when exercise begins. This significantly flattens the drop and reduces required in-run carbs.
          </p>
        </div>
      </div>
    </div>
  );
}
