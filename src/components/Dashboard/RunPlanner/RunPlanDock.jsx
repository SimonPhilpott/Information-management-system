import React, { useState } from 'react';
import { ChevronUp, ChevronDown, RotateCw, Cookie, Droplets, Syringe, BatteryCharging, Timer, Gauge, Sunrise, CloudSun, Route as RouteIcon } from 'lucide-react';
import RunPlanChart from './RunPlanChart';
import { dist, paceText } from '../../../utils/units';

// The Run Plan, always on screen at the foot of the Run Planner: a summary bar that fills in as soon as
// there's a route or distance, opening to the whole plan - live time and pace, before-you-go, recovery,
// hydration, insulin settings, the combined chart and the detailed carb plan. It recalculates by itself
// whenever anything on the page changes; there's no button to press.

const KEY = 'ims_runplan_open';
const hm = (min) => (min == null ? '-' : min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min` : `${Math.round(min)} min`);

export default function RunPlanDock({ plan, busy, error, isDark, units, form, setForm, setPaceTouched, waitingFor, children }) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  const toggle = () => setOpen((o) => { try { localStorage.setItem(KEY, o ? '0' : '1'); } catch { /* not kept */ } return !o; });

  const shell = isDark ? 'bg-slate-950/95 border-white/10 text-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]' : 'bg-[#FBF8F3]/95 border-[#2E2B27]/15 text-[#2E2B27] shadow-[0_-10px_30px_rgba(46,43,39,0.15)]';
  const muted = isDark ? 'text-slate-400' : 'text-[#6A645D]';
  const card = `rounded-xl border p-3 text-xs ${isDark ? 'border-white/10 bg-white/5' : 'border-[#2E2B27]/10 bg-white'}`;
  const stat = (icon, labelText, value, sub, tone = '') => (
    <div className="flex items-center gap-2 min-w-0">
      <span className={`shrink-0 ${tone}`}>{icon}</span>
      <div className="min-w-0 leading-tight">
        <div className={`text-[9px] font-bold uppercase tracking-wider ${muted}`}>{labelText}</div>
        <div className="text-sm font-black truncate">{value}</div>
        {sub && <div className={`text-[10px] truncate ${muted}`}>{sub}</div>}
      </div>
    </div>
  );

  const p = plan;
  const dur = p?.run?.durationMin;
  const distKm = p?.run?.distanceKm;
  const pred = p?.plan?.predicted;
  const rec = p?.recovery;
  // live time slider: 70%-140% of the planned time; moving it sets the average pace
  const sliderMin = dur ? Math.max(10, Math.round(dur * 0.7)) : 0;
  const sliderMax = dur ? Math.round(dur * 1.4) : 0;
  const setMinutes = (min) => {
    if (!distKm) return;
    setPaceTouched?.(true);
    setForm((f) => ({ ...f, pace: paceText(min / distKm, units) }));
  };

  return (
    <div className={`fixed bottom-0 inset-x-0 z-30 border-t backdrop-blur-xl ${shell}`}>
      <div className="max-w-6xl mx-auto px-4">
        {/* summary bar - always visible */}
        <button onClick={toggle} className="w-full flex flex-wrap items-center gap-x-6 gap-y-2 py-2.5 text-left" aria-expanded={open}>
          <div className="flex items-center gap-2 mr-2">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center"><RouteIcon size={16} /></span>
            <div className="leading-tight">
              <div className="text-sm font-black uppercase tracking-wide flex items-center gap-1.5">Run plan {busy && <RotateCw size={12} className="animate-spin text-emerald-500" />}</div>
              <div className={`text-[10px] max-w-[220px] truncate ${muted}`}>{p ? (p.inputs?.routeName || `${dist(distKm, units, 1)} ${units} run`) : waitingFor}</div>
            </div>
          </div>
          {p && !error && (
            <>
              {stat(<Timer size={15} />, 'Time · pace', hm(dur), `${paceText(p.inputs.averagePaceMinPerKm, units)} /${units}`, 'text-sky-500')}
              {stat(<Cookie size={15} />, 'Carbs', `${p.plan.totalCarbs} g`, `${p.plan.carbsPerHour} g an hour${p.preRun?.carbsToTargetG ? ` + ${p.preRun.carbsToTargetG} g before` : ''}`, 'text-amber-500')}
              {stat(<Droplets size={15} />, 'Fluid', `${((p.hydrationSeries?.at(-1)?.[1] || p.hydration?.totalFluidMl || 0) / 1000).toFixed(2)} L`, p.sips?.length ? `${p.sips.length} sips + ${p.preRun?.drinkMl || 0} ml before` : `${p.hydration?.fluidPerHourMl || 0} ml an hour`, 'text-cyan-500')}
              {stat(<Gauge size={15} />, 'Glucose', `${p.inputs.startBg} → ${pred.minDuring} → ${pred.endBg}`, `lowest after ${pred.minAfter}`, pred.minDuring < p.settings.floor ? 'text-rose-500' : 'text-emerald-500')}
              {rec && stat(<BatteryCharging size={15} />, 'Recovery', rec.status === 'ready' || rec.status === 'fresh' ? 'Recovered' : `${rec.percentRecovered}% recovered`, rec.insulinSensitivityPct ? `insulin +${rec.insulinSensitivityPct}%` : rec.glucoseUptakePct ? `uptake +${rec.glucoseUptakePct}%` : 'no carry-over', rec.insulinSensitivityPct || rec.glucoseUptakePct ? 'text-amber-500' : 'text-emerald-500')}
            </>
          )}
          {error && <span className="text-xs text-rose-500">{error}</span>}
          <span className={`ml-auto flex items-center gap-1 text-[11px] font-bold ${muted}`}>{open ? 'Hide' : 'Show the plan'} {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</span>
        </button>

        {open && (
          <div className="max-h-[68vh] overflow-y-auto pb-4 flex flex-col gap-3">
            {!p ? (
              <p className={`text-sm py-6 text-center ${muted}`}>{waitingFor}</p>
            ) : (
              <>
                {/* live time / pace */}
                <div className={`${card} grid md:grid-cols-[1fr_auto] gap-3 items-center`}>
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                      <span>Target time - drag to change the pace; everything below reacts</span>
                      <span className="text-emerald-500">{hm(dur)} · {paceText(p.inputs.averagePaceMinPerKm, units)} /{units}</span>
                    </div>
                    <input type="range" min={sliderMin} max={sliderMax} step={1} defaultValue={dur} key={`${p.inputs.routeId || distKm}-${sliderMin}`}
                      onChange={(e) => setMinutes(Number(e.target.value))} className="w-full accent-emerald-500" aria-label="Target time" />
                    <div className={`flex justify-between text-[10px] ${muted}`}><span>{hm(sliderMin)} (faster)</span><span>{hm(sliderMax)} (easier)</span></div>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] font-bold">Effort
                    <select value={form.intensity} onChange={(e) => setForm((f) => ({ ...f, intensity: e.target.value }))}
                      className={`rounded-lg border px-2 py-1 text-xs ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-[#2E2B27]/15'}`}>
                      <option value="easy">Easy</option><option value="steady">Steady</option><option value="hard">Hard</option>
                    </select>
                  </label>
                </div>

                {(p.warnings || []).length > 0 && (
                  <div className={`${card} border-amber-500/40 flex flex-col gap-1`}>
                    {p.warnings.map((w) => <p key={w} className="text-amber-600 dark:text-amber-400">⚠ {w}</p>)}
                  </div>
                )}

                {/* before / recovery / hydration / insulin */}
                <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  <div className={card}>
                    <div className="font-black uppercase tracking-wider text-[10px] mb-1.5 flex items-center gap-1.5 text-emerald-500"><Sunrise size={13} /> Before you go</div>
                    <ul className="space-y-1">
                      <li>{p.preRun.carbsToTargetG ? <><b>{p.preRun.carbsToTargetG} g</b> fast carbs 15-20 minutes before, to reach your {p.settings.startTarget} start target</> : <>At or above your {p.settings.startTarget} start target - no pre-run carbs needed</>}</li>
                      {p.preRun.startCarbsG > 0 && <li><b>{p.preRun.startCarbsG} g</b> as you set off (in the plan)</li>}
                      <li>{p.preRun.tempTarget}</li>
                      <li>{p.preRun.iobNote}</li>
                      <li>Drink about <b>{p.preRun.drinkMl} ml</b> in the hour before.</li>
                    </ul>
                  </div>
                  <div className={card}>
                    <div className="font-black uppercase tracking-wider text-[10px] mb-1.5 flex items-center gap-1.5 text-amber-500"><BatteryCharging size={13} /> Recovery</div>
                    {rec ? (
                      <>
                        <div className="flex items-baseline gap-2"><span className="text-lg font-black">{rec.percentRecovered}%</span><span className={muted}>recovered · form {rec.form > 0 ? '+' : ''}{rec.form}</span></div>
                        <div className={`h-1.5 rounded-full my-1.5 overflow-hidden ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}><div className="h-full bg-gradient-to-r from-orange-500 to-emerald-500" style={{ width: `${rec.percentRecovered}%` }} /></div>
                        <p>{rec.text}</p>
                        <p className={`mt-1 ${muted}`}>Built into the glucose line: insulin ×{p.settings.insulinBoost}, exercise uptake {p.settings.kExRun} mmol/L an hour.</p>
                      </>
                    ) : <p className={muted}>No Strava training data.</p>}
                  </div>
                  <div className={card}>
                    <div className="font-black uppercase tracking-wider text-[10px] mb-1.5 flex items-center gap-1.5 text-cyan-500"><CloudSun size={13} /> Weather & hydration</div>
                    <p><b>{p.hydration.tempC}°C</b>, {p.hydration.humidity}% humidity, wind {p.hydration.windKmh} km/h</p>
                    <p className="mt-1"><b>{p.hydration.fluidPerHourMl} ml an hour</b> · {p.hydration.totalFluidLitres} L in all{p.hydration.electrolyteTablets ? ` · ${p.hydration.electrolyteTablets} electrolyte tab${p.hydration.electrolyteTablets === 1 ? '' : 's'} (${p.hydration.sodiumMg} mg sodium)` : ''}</p>
                    {p.sips?.length > 0 && <p className="mt-1">Sips: {p.sips.map((s) => `${s.ml} ml at ${s.minute} min`).join(', ')}</p>}
                    <p className={`mt-1 ${muted}`}>{p.hydration.guidance}{p.inputs.weatherEffortMultiplier > 1 ? ` Weather adds ${Math.round((p.inputs.weatherEffortMultiplier - 1) * 100)}% to the effort.` : ''}</p>
                  </div>
                  <div className={card}>
                    <div className="font-black uppercase tracking-wider text-[10px] mb-1.5 flex items-center gap-1.5 text-violet-500"><Syringe size={13} /> Insulin & carb settings</div>
                    <p>ISF <b>{p.settings.isf}</b> mmol/L per unit · carb ratio <b>{p.settings.cr}</b> g per unit</p>
                    <p className="mt-1">1 g of carbs ≈ <b>{p.settings.mmolPerGram}</b> mmol/L · insulin {p.inputs.sensMult}× stronger while running{p.settings.insulinBoost > 1 ? `, ×${p.settings.insulinBoost} from recent training` : ''}</p>
                    <p className="mt-1">On board at the start: <b>{p.inputs.iob} U</b>{p.inputs.cob ? `, ${p.inputs.cob} g carbs` : ''}</p>
                    <p className={`mt-1 ${muted}`}>From your AAPS loop settings. No doses here - insulin changes are for you and your team.</p>
                  </div>
                </div>

                {/* the combined chart */}
                <div className={card}>
                  <div className="font-black uppercase tracking-wider text-[10px] mb-2">Glucose, hydration, insulin & course</div>
                  <RunPlanChart plan={p} isDark={isDark} units={units} />
                </div>

                {children}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
