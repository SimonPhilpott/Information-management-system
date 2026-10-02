import React from 'react';
import { Route as RouteIcon, Mountain, RotateCw, Upload, Link2, Download, Unlink, ExternalLink, Trash2, Sparkles, Cookie, ChevronUp, ChevronDown, Calculator, Syringe, BookOpen, AlertTriangle, CheckCircle, Zap, CloudSun, Droplets, Wind, Thermometer, ShieldAlert, FileText } from 'lucide-react';
import RunGaugesBar from './RunGaugesBar';
import CarbFuelingTimeline from './CarbFuelingTimeline';
import WhereYouAreNow from './WhereYouAreNow';
import TrainingLoadCard from '../TrainingLoadCard';
import RunPlanDock from './RunPlanDock';
import { dist, toKm, paceText, paceToMinPerKm, elev, elevUnit } from '../../../utils/units';

const fmtMin = (m) => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')} min`;

const renderDeltaBadge = (current, baseline, type = 'time', isDark = true) => {
  if (baseline == null || baseline <= 0 || current == null) return null;
  const pct = Math.round(((current - baseline) / baseline) * 100);
  if (pct === 0) return <span className={`text-[10px] font-black tabular-nums px-2 py-0.5 rounded-full ${isDark ? 'bg-white/10 text-slate-300' : 'bg-[#2E2B27]/10 text-[#2E2B27]'}`}>0%</span>;
  const isPos = pct > 0;
  let tone = isDark ? 'text-slate-300 bg-slate-500/10 border-slate-500/20' : 'text-[#2E2B27] bg-[#2E2B27]/10 border-[#2E2B27]/20';
  if (type === 'time' || type === 'pace') {
    tone = isPos 
      ? (isDark ? 'text-amber-400 bg-amber-500/15 border-amber-500/30' : 'text-amber-950 bg-amber-100 border-amber-300 font-bold')
      : (isDark ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' : 'text-emerald-950 bg-emerald-100 border-emerald-300 font-bold');
  } else if (type === 'carbs') {
    tone = isPos 
      ? (isDark ? 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30' : 'text-amber-950 bg-amber-100 border-amber-300 font-bold')
      : (isDark ? 'text-amber-400 bg-amber-500/15 border-amber-500/30' : 'text-orange-950 bg-orange-100 border-orange-300 font-bold');
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black tabular-nums border ${tone}`} title={`${isPos ? '+' : ''}${pct}% vs original plan`}>
      {isPos ? '+' : ''}{pct}%
    </span>
  );
};

export default function RunMissionControlTab({
  routeFull,
  routeHistory,
  demand,
  routes,
  routeId,
  setRouteId,
  selected,
  removeRoute,
  fileRef,
  addGpx,
  kForm,
  setKForm,
  addLink,
  komoot,
  loadTours,
  tours,
  tourType,
  tourSearch,
  setTourSearch,
  importTour,
  connectKomoot,
  send,
  setTours,
  loadAll,
  form,
  setForm,
  setPaceTouched,
  goals,
  goalId,
  pickGoal,
  goal,
  now,
  useCurrent,
  estimate,
  plan,
  originalBaseline,
  stepTime,
  stepPace,
  stepCarbs,
  stepStopCarbs,
  moveStop,
  addStop,
  removeStop,
  carbChange,
  keepPreviousStops,
  dismissCarbChange,
  moveDrink,
  resetTiming,
  hasCustomTiming,
  timeEditFocus,
  setTimeEditFocus,
  timeEditDraft,
  setTimeEditDraft,
  paceEditFocus,
  setPaceEditFocus,
  paceEditDraft,
  setPaceEditDraft,
  carbsEditFocus,
  setCarbsEditFocus,
  carbsEditDraft,
  setCarbsEditDraft,
  RouteMap,
  ElevationProfile,
  DemandCard,
  chip,
  busy,
  units,
  isDark,
  panel,
  label,
  field,
  btn,
  ghost,
  targets
}) {
  // signing in to a different Komoot account (the current one stays connected until the new one works)
  const weather = plan?.weather || demand?.weather;
  const hydration = plan?.hydration || demand?.hydration;

  return (
    <div className="flex flex-col gap-4">
      {/* 1. TOP TELEMETRY RADIAL GAUGES */}
      <RunGaugesBar
        paceTextVal={form.pace || (plan?.inputs ? paceText(plan.inputs.averagePaceMinPerKm, units) : '5:15')}
        units={units}
        gainM={routeFull?.gainM || (selected?.gainM || 0)}
        lossM={routeFull?.lossM || (selected?.lossM || 0)}
        currentBg={form.startBg || (now?.now?.bg || 8.0)}
        bgFloor={targets?.floor || 4.5}
        bgCeiling={10.0}
        targetBg={targets?.startTarget || 8.0}
        isDark={isDark}
        weather={weather?.current ? { current: weather.current, hydration } : null}
      />

      {/* 3. ROUTE PREVIEW & WHAT IT ASKS OF YOU */}
      {(routeFull || demand) && (
        <div className={panel}>
          <h2 className={`text-sm font-black uppercase tracking-wide mb-3 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>
            <Mountain size={13} className="text-emerald-500" />
            {routeFull ? routeFull.name : `${dist(toKm(form.distanceKm, units), units, 1)} ${units} run`} - What it asks of you
          </h2>
          {routeFull && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
              <div className="lg:col-span-3">
                <RouteMap route={routeFull} units={units} />
              </div>
              <div className="lg:col-span-2 flex flex-col gap-3">
                <div className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'opacity-70 text-slate-300' : 'text-[#2E2B27]'}`}>Elevation Profile</div>
                <ElevationProfile route={routeFull} units={units} />
                <p className={`text-[10px] leading-relaxed ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
                  {dist(routeFull.distanceKm, units, 1)} {units}, {elev(routeFull.gainM, units)} {elevUnit(units)} up and {elev(routeFull.lossM, units)} {elevUnit(units)} down. Steepness: green flat, amber climbing, red steep, blue downhill.
                </p>
              </div>
            </div>
          )}

          {routeFull && routeHistory && (
            <div className={`rounded-xl border p-3 mb-4 ${isDark ? 'border-white/10 bg-slate-950/30' : 'border-[#2E2B27]/10 bg-[#FAF7F2]'}`}>
              {routeHistory.count > 0 ? (
                <>
                  <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'opacity-70 text-slate-300' : 'text-[#2E2B27]'}`}>
                    Your previous runs of this route ({routeHistory.count})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {routeHistory.expectedCurrentPaceMinPerKm && (
                      <div
                        title="What your current fitness suggests for this route - set your pace in the Run plan"
                        className={`text-left rounded-lg px-3 py-2 border ${isDark ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-300'}`}
                      >
                        <div className={`text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>
                          <Sparkles size={10} />
                          Expected Now
                        </div>
                        <div className={`text-sm font-black tabular-nums ${isDark ? 'text-emerald-300' : 'text-emerald-900'}`}>
                          {paceText(routeHistory.expectedCurrentPaceMinPerKm, units)} <span className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>/{units}</span>
                        </div>
                        <div className={`text-[10px] ${isDark ? 'text-emerald-400/80' : 'text-emerald-700'}`}>~{fmtMin(routeHistory.expectedCurrentTimeMin)} • fitness</div>
                      </div>
                    )}
                    {[['Last', routeHistory.last, 'sky'], ['Fastest', routeHistory.fastest, 'emerald'], ['Slowest', routeHistory.slowest, 'amber']].map(([name, run]) => run && (
                      <div
                        key={name}
                        className={`text-left rounded-lg p-2.5 border ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10 bg-white/70'} flex flex-col justify-between`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'opacity-60 text-slate-400' : 'text-[#6A645D]'}`}>{name}</span>
                            <a
                              href={`/ims/activities?openActivity=${run.id}`}
                              className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                                isDark ? 'bg-white/10 hover:bg-white/20 text-slate-300' : 'bg-black/5 hover:bg-black/10 text-slate-700'
                              }`}
                              title="Open this run's debrief notes and scrutiny in Activities"
                            >
                              <FileText size={9} />
                              <span>Debrief</span>
                            </a>
                          </div>
                          <div className={`text-sm font-black tabular-nums ${isDark ? '' : 'text-[#2E2B27]'}`}>
                            {paceText(run.paceMinPerKm, units)} <span className={`text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>/{units}</span>
                          </div>
                        </div>
                        <div className={`text-[10px] mt-1 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
                          {new Date(`${run.day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                    ))}
                    <div
                      className={`text-left rounded-lg px-3 py-2 border ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10 bg-white/70'}`}
                    >
                      <div className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'opacity-60 text-slate-400' : 'text-[#6A645D]'}`}>Average</div>
                      <div className={`text-sm font-black tabular-nums ${isDark ? '' : 'text-[#2E2B27]'}`}>
                        {paceText(routeHistory.averagePaceMinPerKm, units)} <span className={`text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>/{units}</span>
                      </div>
                      <div className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>all {routeHistory.count} runs</div>
                    </div>
                  </div>
                </>
              ) : (
                <p className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>None of your Strava runs follow this route yet.</p>
              )}
            </div>
          )}
          {demand ? <DemandCard demand={demand} units={units} isDark={isDark} /> : <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>Calculating route demand...</p>}
        </div>
      )}

      {/* TRAINING LOAD, RAMP AND RECOVERY (Strava) */}
      <TrainingLoadCard isDark={isDark} units={units} />

      {/* LIVE ROUTE WEATHER & DYNAMIC HYDRATION BAR */}
      {weather?.current && hydration && (
        <div className={`rounded-2xl border p-4 transition-all ${isDark ? 'bg-slate-900/50 border-sky-500/20' : 'bg-sky-50/60 border-sky-300 shadow-sm'}`}>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 mb-3 border-b border-sky-500/15">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'bg-sky-500/20 text-sky-800'}`}>
                <CloudSun size={17} />
              </div>
              <div>
                <h3 className={`text-sm font-black uppercase tracking-wide flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-[#2E2B27]'}`}>
                  Weather and Hydration
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isDark ? 'bg-sky-500/10 text-sky-300 border-sky-500/20' : 'bg-sky-100 text-sky-900 border-sky-300'}`}>
                    Open-Meteo
                  </span>
                </h3>
                <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-[#2E2B27]/80 font-medium'}`}>
                  {weather.location}: {weather.current.condition}, {weather.current.temperature_c}°C (feels like {weather.current.feels_like_c}°C), {weather.current.humidity_percent}% humidity, wind {weather.current.wind_speed_kmh} km/h {weather.current.wind_direction}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className={`px-2.5 py-1 rounded-lg border text-right ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white/80 border-[#2E2B27]/10'}`}>
                <div className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-[#2E2B27]/70'}`}>Sweat rate</div>
                <div className={`text-xs font-black tabular-nums ${isDark ? 'text-sky-300' : 'text-sky-900'}`}>{hydration.fluidPerHourMl} ml/h</div>
              </div>
              <div className={`px-2.5 py-1 rounded-lg border text-right ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white/80 border-[#2E2B27]/10'}`}>
                <div className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-[#2E2B27]/70'}`}>To drink</div>
                <div className={`text-xs font-black tabular-nums ${isDark ? 'text-emerald-300' : 'text-emerald-900'}`}>{hydration.drinkToThirst === false ? `${hydration.needMl} ml` : 'To thirst'}</div>
              </div>
              <div className={`px-2.5 py-1 rounded-lg border text-right ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white/80 border-[#2E2B27]/10'}`}>
                <div className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-[#2E2B27]/70'}`}>Sweat loss</div>
                <div className={`text-xs font-black tabular-nums ${isDark ? 'text-amber-300' : 'text-amber-950'}`}>{((hydration.sweatLossMl ?? hydration.totalFluidMl) / 1000).toFixed(2)} L{hydration.lossPct != null ? ` (${hydration.lossPct}%)` : ''}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
            <div className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white/90 border-[#2E2B27]/10'}`}>
              <Droplets size={16} className="text-sky-400 shrink-0" />
              <div>
                <div className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>When to drink</div>
                <div className={`font-black ${isDark ? 'text-slate-100' : 'text-[#2E2B27]'}`}>{hydration.drinkToThirst === false ? `${hydration.needMl} ml over ${(plan?.drinks || []).filter((dk) => dk.minute > 0).length} drinks, with the carbs` : 'A mouthful with each carb stop'}</div>
              </div>
            </div>

            <div className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white/90 border-[#2E2B27]/10'}`}>
              <Zap size={16} className="text-amber-400 shrink-0" />
              <div>
                <div className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>Electrolytes (Sodium)</div>
                <div className={`font-black ${isDark ? 'text-slate-100' : 'text-[#2E2B27]'}`}>{hydration.electrolyteTablets ? `${hydration.sodiumMg} mg (${hydration.electrolyteTablets} tab${hydration.electrolyteTablets === 1 ? '' : 's'})` : 'Not needed for this run'}</div>
              </div>
            </div>

            <div className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white/90 border-[#2E2B27]/10'}`}>
              <Wind size={16} className="text-teal-400 shrink-0" />
              <div>
                <div className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>Wind Drag &amp; Effort</div>
                <div className={`font-black ${isDark ? 'text-slate-100' : 'text-[#2E2B27]'}`}>{weather.current.wind_speed_kmh} km/h • {weather.current.wind_direction}</div>
              </div>
            </div>

            <div className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white/90 border-[#2E2B27]/10'}`}>
              <Thermometer size={16} className="text-rose-400 shrink-0" />
              <div>
                <div className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>Thermal Multiplier</div>
                <div className={`font-black ${isDark ? 'text-slate-100' : 'text-[#2E2B27]'}`}>{plan?.inputs?.weatherEffortMultiplier ? `+${Math.round((plan.inputs.weatherEffortMultiplier - 1) * 100)}% burn` : 'Standard'}</div>
              </div>
            </div>
          </div>

          <div className={`text-[11px] mt-2.5 px-3 py-1.5 rounded-lg border flex items-center gap-2 ${isDark ? 'bg-sky-500/10 text-sky-200 border-sky-500/20' : 'bg-sky-100/70 text-sky-950 border-sky-300 font-medium'}`}>
            <Droplets size={12} className="text-sky-500 shrink-0" />
            <span>{hydration.guidance}</span>
          </div>
        </div>
      )}

      {/* 4. GOAL SELECTION */}
      {goals.length > 0 && (
        <div className={panel}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className={`text-sm font-black uppercase tracking-wide ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>Plan for a goal</h2>
            <select className={`${field} sm:!w-72`} value={goalId} onChange={(e) => pickGoal(e.target.value)}>
              <option value="">No goal - just this run</option>
              {goals.map((a) => (
                <option key={a.goal.id} value={a.goal.id}>
                  {a.goal.name} - {dist(a.goal.distanceKm, units, 1)} {units}
                </option>
              ))}
            </select>
          </div>
          {goal && (
            <p className={`text-[11px] mt-2 leading-relaxed ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
              {goal.verdict}
            </p>
          )}
        </div>
      )}

      {/* 5. WHERE YOU ARE NOW - tiles with the go / eat first / wait verdict */}
      <div className={panel}>
        <WhereYouAreNow form={form} setForm={setForm} now={now} useCurrent={useCurrent} plan={plan} isDark={isDark} stepCarbs={stepCarbs} busy={busy} />
      </div>

      {/* 6. THE RUN PLAN - its own section under "Where you are now", always open, filled in as things change */}
      <RunPlanDock
        plan={plan}
        busy={busy === 'estimate'}
        isDark={isDark}
        units={units}
        form={form}
        setForm={setForm}
        setPaceTouched={setPaceTouched}
        moveStop={moveStop}
        addStop={addStop}
        removeStop={removeStop}
        stepTime={stepTime}
        stepPace={stepPace}
        stepCarbs={stepCarbs}
        stepStopCarbs={stepStopCarbs}
        carbChange={carbChange}
        keepPreviousStops={keepPreviousStops}
        dismissCarbChange={dismissCarbChange}
        moveDrink={moveDrink}
        resetTiming={resetTiming}
        hasCustomTiming={hasCustomTiming}
        waitingFor={!routeFull && !selected && !(Number(form.distanceKm) > 0) ? 'Pick a route (Route Finder, saved routes, Komoot or a GPX) or enter a distance to start your run plan.' : 'Working out your run plan...'}
      >
      {plan && (
        <>

          {/* Scenario Matrices */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={panel}>
              <h3 className={`text-sm font-black uppercase tracking-wide mb-2 ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>If you started at a different glucose</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className={`text-left text-[9px] uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
                    <th className="py-1">Start</th>
                    <th className="text-right">Carbs</th>
                    <th className="text-right">At start</th>
                    <th className="text-right">Lowest</th>
                  </tr>
                </thead>
                <tbody>
                  {(plan.startScenarios || []).map((s) => (
                    <tr key={s.startBg} className={`border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
                      <td className={`py-1 font-bold ${isDark ? '' : 'text-[#2E2B27]'}`}>{s.startBg}</td>
                      <td className={`text-right tabular-nums ${isDark ? '' : 'text-[#6A645D]'}`}>{s.totalCarbs} g</td>
                      <td className={`text-right tabular-nums ${isDark ? '' : 'text-[#6A645D]'}`}>{s.carbsAtStart} g</td>
                      <td className={`text-right tabular-nums font-bold ${s.minBg < (plan.settings?.floor || 4.0) ? 'text-red-500' : (isDark ? 'text-emerald-400' : 'text-emerald-700')}`}>{s.minBg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={panel}>
              <h3 className={`text-sm font-black uppercase tracking-wide mb-2 ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>If you had different insulin on board</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className={`text-left text-[9px] uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
                    <th className="py-1">IOB</th>
                    <th className="text-right">Carbs</th>
                    <th className="text-right">At start</th>
                    <th className="text-right">Lowest</th>
                  </tr>
                </thead>
                <tbody>
                  {(plan.iobScenarios || []).map((s) => (
                    <tr key={s.iob} className={`border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
                      <td className={`py-1 font-bold ${isDark ? '' : 'text-[#2E2B27]'}`}>{s.iob} U</td>
                      <td className={`text-right tabular-nums ${isDark ? '' : 'text-[#6A645D]'}`}>{s.totalCarbs} g</td>
                      <td className={`text-right tabular-nums ${isDark ? '' : 'text-[#6A645D]'}`}>{s.carbsAtStart} g</td>
                      <td className={`text-right tabular-nums font-bold ${s.minBg < (plan.settings?.floor || 4.0) ? 'text-red-500' : (isDark ? 'text-emerald-400' : 'text-emerald-700')}`}>{s.minBg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* How this was worked out */}
          {plan.basis && (
            <div className={panel}>
              <h3 className={`text-sm font-black uppercase tracking-wide mb-2 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>
                <BookOpen size={13} className="text-emerald-500" />
                How this was worked out
              </h3>
              <p className={`text-[11px] leading-relaxed mb-2 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
                Each minute: glucose falls with insulin action (your {plan.inputs?.iob} U on board over a 3-hour curve, times your ISF of {plan.settings?.isf} mmol/L per U, made {plan.inputs?.sensMult}x stronger during the run) and with exercise uptake ({plan.inputs?.kEx} mmol/L per hour, scaled by effort, terrain gradients, and ambient weather), and rises with carbs ({plan.settings?.cr} g per U, so about {plan.settings?.mmolPerGram} mmol/L per gram, absorbed over about 20 minutes). Stops are placed so the estimate stays at least 1 mmol/L above your {plan.settings?.floor} floor, off steep climbs where possible. Your loop will also react (temp basals), which this ignores, so treat the estimate as cautious.
              </p>
              <p className={`text-[11px] leading-relaxed mb-2 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
                {plan.basis.personalFitted
                  ? `Exercise uptake was fitted from ${plan.basis.personalRuns} of your matched runs.`
                  : `Not personalised yet: ${plan.basis.personalRuns} of your runs are matched with glucose data and 4 are needed to fit your own exercise uptake.`}
                {plan.basis.assumed?.length > 0 && <> Assumed: {plan.basis.assumed.join('; ')}.</>}
              </p>
              {plan.sources && plan.sources.length > 0 && (
                <ul className="text-[11px] list-disc pl-5 space-y-0.5">
                  {plan.sources.map((s) => (
                    <li key={s.url}>
                      <a className="text-sky-500 hover:underline" href={s.url} target="_blank" rel="noreferrer">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
      </RunPlanDock>
    </div>
  );
}
