import React, { useCallback, useEffect, useState } from 'react';
import { RotateCw, Cookie, Droplets, Syringe, BatteryCharging, Timer, Gauge, Sunrise, CloudSun, Route as RouteIcon, Printer, AlertTriangle } from 'lucide-react';
import RunPlanChart from './RunPlanChart';
import SendToPhoneCard from './SendToPhoneCard';
import { SavedRoutePlans } from './SavedPlans';
import Notice, { noticeButton } from './Notice';
import { printRunReport } from './printRunReport';
import { dist, paceText, elev, elevUnit } from '../../../utils/units';

// The Run Plan: a section of the Run Planner, under "Where you are now", always open - a summary row that
// fills in as soon as there's a route or distance, then the whole plan: live time and pace, before-you-go,
// recovery, hydration, insulin settings, the combined chart and the detailed carb plan. It recalculates by
// itself whenever anything on the page changes; there's no button to press.

const hm = (min) => (min == null ? '-' : min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min` : `${Math.round(min)} min`);

export default function RunPlanDock({ plan, busy, error, isDark, units, waitingFor, stepTime, stepPace, stepCarbs, stepStopCarbs, addStop, removeStop, moveStop, moveDrink, resetTiming, hasCustomTiming, carbChange, keepPreviousStops, dismissCarbChange, children }) {
  const shell = isDark ? 'bg-slate-900/40 border-white/5 text-slate-100' : 'bg-white/80 border-[#2E2B27]/10 text-[#2E2B27] shadow-sm';
  const muted = isDark ? 'text-slate-400' : 'text-[#6A645D]';
  const card = `rounded-xl border p-3 text-xs ${isDark ? 'border-white/10 bg-white/5' : 'border-[#2E2B27]/10 bg-white'}`;
  const stat = (icon, labelText, value, sub, tone = '', controls = null) => (
    <div className="flex items-center gap-2 flex-1">
      <span className={`shrink-0 ${tone}`}>{icon}</span>
      <div className="min-w-min flex-1 leading-tight">
        <div className={`text-[9px] font-bold uppercase tracking-wider ${muted}`}>{labelText}</div>
        <div className="text-sm font-black whitespace-nowrap">{value}</div>
        {sub && <div className={`text-[10px] truncate ${muted}`} style={{ width: 0, minWidth: "100%" }} title={sub}>{sub}</div>}
      </div>
      {controls && <div className="shrink-0">{controls}</div>}
    </div>
  );
  // the plan's adjusters live here, next to the chart, so a change shows straight away on the lines below
  const stepBtn = `w-6 h-6 rounded-md border text-xs font-black flex items-center justify-center active:scale-95 disabled:opacity-30 ${isDark ? 'border-white/15 hover:bg-white/10' : 'border-[#2E2B27]/20 hover:bg-[#F4EFE6]'}`;
  const pair = (onDown, onUp, downTitle, upTitle, small = '') => (
    <div className="flex flex-col gap-0.5 shrink-0">
      {small && <span className={`text-[8px] font-bold uppercase text-center ${muted}`}>{small}</span>}
      <div className="flex gap-1">
        <button className={stepBtn} onClick={onDown} title={downTitle} aria-label={downTitle}>-</button>
        <button className={stepBtn} onClick={onUp} title={upTitle} aria-label={upTitle}>+</button>
      </div>
    </div>
  );

  // After a run is sent, this section shows THAT plan - what the phone is following - until the run is over.
  // "Show live plan" switches to the plan the page keeps working out; it isn't sent unless you send it.
  const [sent, setSent] = useState(null);
  const [showLive, setShowLive] = useState(false);
  const [sentVersion, setSentVersion] = useState(0);
  const loadSent = useCallback(() => {
    fetch('/api/planner/plans/current', { credentials: 'same-origin' }).then((r) => r.json())
      .then((j) => { setSent(j.success ? j.sent : null); setShowLive(false); setSentVersion((v) => v + 1); }).catch(() => {});
  }, []);
  useEffect(() => { loadSent(); const t = setInterval(loadSent, 5 * 60000); return () => clearInterval(t); }, [loadSent]);
  const viewingSent = Boolean(sent?.chart && !showLive);
  const clock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });

  const p = viewingSent ? sent.chart : plan;
  const dur = p?.run?.durationMin;
  const distKm = p?.run?.distanceKm;
  const pred = p?.plan?.predicted;
  return (
    <section className={`rounded-2xl border p-5 ${shell}`} aria-label="Run plan">
      {sent?.chart && (
        <div className="mb-3">
          {viewingSent ? (
            <Notice isDark={isDark} tone="good" title={`Sent at ${clock(sent.createdAt)} - this is what your phone is following${sent.routeName ? ` (${sent.routeName})` : ''}`}
              actions={<button onClick={() => setShowLive(true)} className={noticeButton(isDark)}>Show live plan</button>}>
              {sent.waitingForTap ? 'Timed from when you tap Start run: ' : 'Reminders: '}
              {sent.reminders.map((r) => `${r.grams ? `${r.grams} g` : `${r.ml} ml water`} at ${r.minute === 0 ? 'the start' : `${r.minute} min`}${r.at ? ` (${clock(r.at)})` : ''}`).join(' · ')}. Changes on this page aren't sent unless you send again.
            </Notice>
          ) : (
            <Notice isDark={isDark} tone="info" title="Live plan - not what your phone is following"
              actions={<button onClick={() => setShowLive(false)} className={noticeButton(isDark)}>Back to the sent plan</button>}>
              Your phone is following the plan sent at {clock(sent.createdAt)}. Send to my phone to send this one instead.
            </Notice>
          )}
        </div>
      )}
      <div>
        {/* summary row */}
        <div className="w-full flex flex-wrap lg:flex-nowrap items-center gap-x-5 gap-y-2 pb-3 text-left">
          <div className="flex items-center gap-2 mr-2 shrink-0">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center"><RouteIcon size={16} /></span>
            <div className="leading-tight">
              <div className="text-sm font-black uppercase tracking-wide flex items-center gap-1.5">Run plan {busy && <RotateCw size={12} className="animate-spin text-emerald-500" />}</div>
              <div className={`text-[10px] max-w-[220px] truncate ${muted}`}>{p ? (p.inputs?.routeName || `${dist(distKm, units, 1)} ${units} run`) : waitingFor}</div>
            </div>
          </div>
          {p && !error && (
            <>
              {stat(<Timer size={15} />, 'Time · pace', `${hm(dur)} · ${paceText(p.inputs.averagePaceMinPerKm, units)} /${units}`, `${dist(distKm, units, 2)} ${units} · ${elev(p.run.gainM || 0, units)} ${elevUnit(units)} up · ${p.run.kcal} kcal${p.inputs.paceEffortFactor && Math.abs(p.inputs.paceEffortFactor - 1) >= 0.02 ? ` · effort ${p.inputs.paceEffortFactor > 1 ? '+' : ''}${Math.round((p.inputs.paceEffortFactor - 1) * 100)}% from pace` : ''}`, 'text-sky-500',
                !viewingSent && stepTime && <div className="flex gap-2">
                  {pair(() => stepTime(-2), () => stepTime(2), '2 minutes faster', '2 minutes slower', 'time')}
                  {pair(() => stepPace(-5), () => stepPace(5), `5 seconds per ${units} faster`, `5 seconds per ${units} slower`, 'pace')}
                </div>)}
              {stat(<Cookie size={15} />, 'Carbs', `${p.plan.totalCarbs} g`, `${p.plan.carbsPerHour} g an hour${p.guideline?.[p.guideline.usedRange] ? ` (guidance ${p.guideline[p.guideline.usedRange][0]}-${p.guideline[p.guideline.usedRange][1]})` : ''}`, 'text-amber-500')}
              {stat(<Droplets size={15} />, 'Drink', p.hydration?.drinkToThirst ? 'To thirst' : `${p.hydration?.needMl} ml`, p.hydration?.drinkToThirst ? `a mouthful per carb stop · sweat ${p.hydration?.lossPct}%` : `${(p.drinks || []).filter((dk) => dk.minute > 0).length} drinks · sweat ${p.hydration?.lossPct}%`, 'text-cyan-500')}
              {stat(<Gauge size={15} />, 'Glucose', `${p.inputs.startBg} → ${pred.minDuring} → ${pred.endBg}`, `start → lowest → finish · lowest after ${pred.minAfter} · no carbs ${pred.minWithoutCarbs}`, pred.minDuring < p.settings.floor ? 'text-rose-500' : 'text-emerald-500')}
            </>
          )}
          {error && <span className="text-xs text-rose-500">{error}</span>}
        </div>

        {(
          <div className="flex flex-col gap-3">
            {!p ? (
              <p className={`text-sm py-6 text-center ${muted}`}>{waitingFor}</p>
            ) : (
              <>
                {(p.warnings || []).map((w) => {
                  const [head, ...rest] = w.split(': ');
                  const titled = rest.length && head.length < 40;
                  return <Notice key={w} isDark={isDark} tone={/below|DO NOT|ketones|treat the low/i.test(w) ? 'stop' : 'warn'} title={titled ? head : w}>{titled ? rest.join(': ') : null}</Notice>;
                })}

                {/* insulin & carb settings the plan uses */}
                <div className={card}>
                  <div className="font-black uppercase tracking-wider text-[10px] mb-1.5 flex items-center gap-1.5 text-violet-500"><Syringe size={13} /> Insulin & carb settings</div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    <span>ISF <b>{p.settings.isf}</b> mmol/L per unit · carb ratio <b>{p.settings.cr}</b> g per unit</span>
                    <span>1 g of carbs ≈ <b>{p.settings.mmolPerGram}</b> mmol/L · insulin {p.inputs.sensMult}× stronger while running{p.settings.insulinBoost > 1 ? `, ×${p.settings.insulinBoost} from recent training` : ''}</span>
                    <span>On board at the start: <b>{p.inputs.iob} U</b>{p.inputs.cob ? `, ${p.inputs.cob} g carbs` : ''}</span>
                    <span className={muted}>From your AAPS loop settings.</span>
                  </div>
                </div>

                {/* the carb stops just changed: what changed, why, and the option to keep the previous ones */}
                {carbChange && !viewingSent && (
                  <Notice isDark={isDark} tone="warn" title={carbChange.fromTotal === carbChange.toTotal ? 'Your carb stops changed' : `Your carb stops changed: ${carbChange.fromTotal} g → ${carbChange.toTotal} g`}
                    actions={<>
                      <button onClick={keepPreviousStops} className={noticeButton(isDark, true)}>Keep my previous stops</button>
                      <button onClick={dismissCarbChange} className={noticeButton(isDark)}>Use the new plan</button>
                    </>}>
                    Was {carbChange.from}; now {carbChange.to}. Why: {carbChange.reasons.length ? carbChange.reasons.join('; ') : 'the plan was worked out again with the latest readings'}.
                    {carbChange.lowest != null && carbChange.toTotal < carbChange.fromTotal ? ` The model now keeps you at ${carbChange.lowest} or above without the extra carbs - keep them if you'd rather carry them.` : ''}
                  </Notice>
                )}

                {/* lessons from your own runs that this plan uses (accepted in the Run Learning tab) */}
                {p.learning?.applied?.length > 0 && (
                  <Notice isDark={isDark} tone="info" title="Learned from your runs">{p.learning.applied.map((x) => x.text).join(' · ')}</Notice>
                )}

                {/* the combined chart */}
                <div className={card}>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="font-black uppercase tracking-wider text-[10px]">Glucose, hydration, insulin & course</div>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className={muted}>{viewingSent ? "The plan as sent - Show live plan to change it" : "Drag a carb or water line to change when you take it"}</span>
                      <button onClick={() => printRunReport({ plan: p, units })} className={`px-2 py-0.5 rounded-lg font-bold border flex items-center gap-1 ${isDark ? 'border-white/15' : 'border-[#2E2B27]/20'}`} title="The route, this plan and the latest retrospective for the route - choose Save as PDF in the print dialogue"><Printer size={11} />Print / PDF</button>
                      {hasCustomTiming && <button onClick={resetTiming} className="px-2 py-0.5 rounded-lg font-bold border border-amber-500/50 text-amber-600 dark:text-amber-400">Reset to the planned times</button>}
                    </div>
                  </div>
                  <RunPlanChart plan={p} isDark={isDark} units={units} onMoveStop={viewingSent ? null : moveStop} onMoveDrink={viewingSent ? null : moveDrink} />
                  {/* each carb stop under the chart: when, where, how much - change one and watch the line */}
                  <div className="mt-2 flex flex-wrap items-stretch gap-2">
                    {!viewingSent && stepCarbs && (p.plan.stops || []).length > 0 && (
                      <div className={`flex items-center gap-2 rounded-lg border-2 px-2.5 py-1.5 ${isDark ? 'border-amber-500/50 bg-amber-500/15' : 'border-amber-500 bg-amber-100'}`}>
                        <div className="leading-tight">
                          <div className={`text-[9px] font-black uppercase tracking-wider ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>All stops</div>
                          <div className="text-sm font-black tabular-nums">{p.plan.totalCarbs} g <span className={`text-[10px] font-bold ${muted}`}>in total</span></div>
                        </div>
                        {pair(() => stepCarbs(-5), () => stepCarbs(5), '5 g less in all - shared across the stops', '5 g more in all - shared across the stops')}
                      </div>
                    )}
                    {(p.plan.stops || []).map((s, i) => (
                      <div key={`${i}-${s.minute}`} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${isDark ? 'border-amber-500/30 bg-amber-500/10' : 'border-amber-400/60 bg-amber-50'}`} title={s.note || ''}>
                        <div className="leading-tight">
                          <div className={`text-[9px] font-black uppercase tracking-wider flex items-center gap-1 ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>
                            Stop {i + 1} ·
                            {viewingSent || !moveStop ? <span>{s.minute === 0 ? 'start' : `${s.minute} min`}</span> : (
                              <input type="number" min="0" max={dur} defaultValue={s.minute} key={s.minute}
                                onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== s.minute) moveStop(i, v); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                className={`w-11 rounded border px-1 text-[10px] font-black bg-transparent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none ${isDark ? 'border-amber-500/40' : 'border-amber-500/50'}`}
                                title="Minute into the run (0 = at the start)" aria-label={`Minute of stop ${i + 1}`} />
                            )}
                            {!viewingSent && moveStop && <span>min</span>}
                            {s.minute > 0 && s.km != null ? <span>· {dist(s.km, units, 1)} {units}</span> : null}
                          </div>
                          <div className="text-sm font-black tabular-nums">{s.grams} g <span className={`text-[10px] font-bold ${muted}`}>+ {s.fluidMl || 100} ml</span></div>
                        </div>
                        {!viewingSent && stepStopCarbs && pair(() => stepStopCarbs(i, -5), () => stepStopCarbs(i, 5), `5 g less at stop ${i + 1}`, `5 g more at stop ${i + 1}`)}
                        {!viewingSent && removeStop && <button onClick={() => removeStop(i)} className={`self-start -mr-1 w-5 h-5 rounded-full text-xs font-black flex items-center justify-center ${isDark ? 'hover:bg-white/10 text-slate-300' : 'hover:bg-amber-100 text-amber-900'}`} title={`Remove stop ${i + 1}`} aria-label={`Remove stop ${i + 1}`}>×</button>}
                      </div>
                    ))}
                    {!viewingSent && addStop && (
                      <button onClick={() => addStop()} className={`rounded-lg border-2 border-dashed px-3 py-1.5 text-xs font-black flex items-center gap-1 ${isDark ? 'border-amber-500/40 text-amber-300 hover:bg-amber-500/10' : 'border-amber-400 text-amber-900 hover:bg-amber-50'}`} title="Adds 10 g in the middle of the longest gap - then set its minute, grams, or drag it on the chart">
                        + Add a carb stop
                      </button>
                    )}
                  </div>
                  {!(p.plan.stops || []).some((s) => s.minute > 0) && <p className={`mt-1 text-[11px] font-bold ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>No carbs during the run in this plan - your rule is at least one stop while running.</p>}
                </div>

                <SendToPhoneCard plan={plan || p} isDark={isDark} card={card} muted={muted} onChange={loadSent} />
                <SavedRoutePlans routeId={(plan || p)?.inputs?.routeId} isDark={isDark} units={units} card={card} muted={muted} refreshKey={sentVersion} />

                {children}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
