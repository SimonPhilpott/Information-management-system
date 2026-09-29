import React from 'react';
import { Route as RouteIcon, Mountain, RotateCw, Upload, Link2, Download, Unlink, ExternalLink, Trash2, Sparkles, Cookie, ChevronUp, ChevronDown, Calculator, Syringe, BookOpen, AlertTriangle, CheckCircle, Zap } from 'lucide-react';
import RunGaugesBar from './RunGaugesBar';
import CarbFuelingTimeline from './CarbFuelingTimeline';
import { dist, toKm, paceText, paceToMinPerKm } from '../../../utils/units';

const fmtMin = (m) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;

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
      />

      {/* Safety Notice Banner */}
      <div className={`p-3 rounded-xl border flex items-start gap-3 text-[11px] leading-relaxed ${isDark ? 'bg-amber-500/5 border-amber-500/30 text-slate-300' : 'bg-amber-50/70 border-amber-300 text-[#2E2B27]'}`}>
        <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-500" />
        <span>
          This is an <strong>infographic planning estimate</strong> from a metabolic uptake model, your Nightscout data, and sports endocrinology guidelines. Always carry fast carbohydrates and follow your clinical hypo safety plan.
        </span>
      </div>

      {/* 2. ROUTE SELECTION & KOMOOT INTEGRATION */}
      <div className={panel}>
        <h2 className={`text-xs font-black uppercase tracking-wider mb-3 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>
          <Mountain size={13} className="text-emerald-500" />
          Route Selection
        </h2>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <select className={field} value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">No route - just a distance</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} - {dist(r.distanceKm, units)} {units}, {r.gainM} m up
              </option>
            ))}
          </select>
          {!routeId && (
            <input
              className={`${field} sm:!w-40`}
              type="number"
              min="1"
              step="0.5"
              value={form.distanceKm}
              onChange={(e) => setForm({ ...form, distanceKm: e.target.value })}
              placeholder={units}
            />
          )}
        </div>

        {selected && (
          <div className={`flex flex-wrap items-center gap-2 text-[11px] mb-3 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
            <span>
              {dist(selected.distanceKm, units)} {units} - {selected.gainM} m up / {selected.lossM} m down - {selected.minEle}-{selected.maxEle} m altitude - from {selected.source}
            </span>
            {!selected.hasElevation && <span className="text-amber-500">this file has no elevation, so climbing is unknown</span>}
            <button onClick={() => removeRoute(selected)} className="ml-auto text-red-400 flex items-center gap-1">
              <Trash2 size={12} />
              Delete
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <label className={label}>Add a GPX file</label>
            <input ref={fileRef} type="file" accept=".gpx,application/gpx+xml,text/xml" className="hidden" onChange={(e) => addGpx(e.target.files?.[0])} />
            <button onClick={() => fileRef.current?.click()} disabled={busy === 'gpx'} className={ghost}>
              {busy === 'gpx' ? <RotateCw size={13} className="animate-spin" /> : <Upload size={13} />} Choose file
            </button>
            <p className={`text-[10px] mt-1.5 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>In Komoot: open the tour, then Share / Export as GPX.</p>
          </div>
          <div>
            <label className={label}>Or paste a Komoot tour link</label>
            <div className="flex gap-2">
              <input className={field} value={kForm.link} onChange={(e) => setKForm({ ...kForm, link: e.target.value })} placeholder="https://www.komoot.com/tour/..." />
              <button onClick={addLink} disabled={!kForm.link.trim() || busy === 'link'} className={ghost}>
                <Link2 size={13} />
              </button>
            </div>
            <p className={`text-[10px] mt-1.5 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>Any tour link works while your account is connected.</p>
          </div>
          <div>
            <label className={label}>Or connect your Komoot account</label>
            {komoot.connected ? (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-[11px] text-emerald-500 font-bold">Connected{komoot.email ? ` (${komoot.email})` : ''}</span>
                <button onClick={() => loadTours('recorded')} disabled={busy === 'tours'} className={btn} title="Your completed activities on Komoot">
                  {busy === 'tours' ? <RotateCw size={13} className="animate-spin" /> : <Download size={13} />} Completed routes
                </button>
                <a href="https://www.komoot.com/tours" target="_blank" rel="noreferrer" className={ghost}>
                  <ExternalLink size={13} /> Open Komoot
                </a>
                <button onClick={() => loadTours('planned')} disabled={busy === 'tours'} className={ghost}>
                  <Download size={13} /> Saved routes
                </button>
                <button onClick={async () => { await send('/api/planner/komoot/disconnect', 'POST'); setTours(null); loadAll(); }} className={ghost}>
                  <Unlink size={13} />
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input className={field} value={kForm.email} onChange={(e) => setKForm({ ...kForm, email: e.target.value })} placeholder="Komoot email" autoComplete="off" />
                <input className={field} type="password" value={kForm.password} onChange={(e) => setKForm({ ...kForm, password: e.target.value })} placeholder="Komoot password" autoComplete="new-password" />
                <button onClick={connectKomoot} disabled={!kForm.email || !kForm.password || busy === 'komoot'} className={btn}>
                  {busy === 'komoot' ? <RotateCw size={13} className="animate-spin" /> : <Link2 size={13} />}Connect
                </button>
              </div>
            )}
          </div>
        </div>

        {tours && (
          <div className="mt-4 max-h-72 overflow-y-auto flex flex-col gap-1.5">
            <div className="flex items-center gap-3 mb-1 sticky top-0 py-1" style={{ background: isDark ? '#0f172a' : '#FAF7F2' }}>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'opacity-70 text-slate-300' : 'text-[#2E2B27]'}`}>
                {tourType === 'recorded' ? 'Completed routes' : 'Saved routes'} ({tours.length})
              </span>
              <input className={`${field} !w-56`} value={tourSearch} onChange={(e) => setTourSearch(e.target.value)} placeholder="Search by name..." />
            </div>
            {tours.length === 0 ? (
              <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>Nothing found here - try the other list.</p>
            ) : (
              tours
                .filter((t) => !tourSearch.trim() || String(t.name).toLowerCase().includes(tourSearch.trim().toLowerCase()))
                .map((t) => (
                  <div key={t.id} className={`flex items-center gap-3 p-2 rounded-lg border text-xs ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10 bg-white/60'}`}>
                    <div className="min-w-0 flex-1">
                      <div className={`font-bold truncate ${isDark ? '' : 'text-[#2E2B27]'}`}>{t.name}</div>
                      <div className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
                        {t.sport} - {t.distanceKm != null ? dist(t.distanceKm, units) : '?'} {units}
                        {t.gainM != null ? ` - ${t.gainM} m up` : ''}
                      </div>
                    </div>
                    <a href={`https://www.komoot.com/tour/${t.id}`} target="_blank" rel="noreferrer" className={ghost}>
                      <ExternalLink size={12} />
                    </a>
                    <button onClick={() => importTour(t.id)} disabled={busy === `t${t.id}`} className={ghost}>
                      {busy === `t${t.id}` ? <RotateCw size={12} className="animate-spin" /> : <Download size={12} />} Use
                    </button>
                  </div>
                ))
            )}
          </div>
        )}
      </div>

      {/* 3. ROUTE PREVIEW & WHAT IT ASKS OF YOU */}
      {(routeFull || demand) && (
        <div className={panel}>
          <h2 className={`text-xs font-black uppercase tracking-wider mb-3 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>
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
                  {dist(routeFull.distanceKm, units, 1)} {units}, {routeFull.gainM} m up and {routeFull.lossM} m down. Steepness: green flat, amber climbing, red steep, blue downhill.
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
                      <button
                        onClick={() => {
                          setPaceTouched(true);
                          setForm((f) => ({ ...f, pace: paceText(routeHistory.expectedCurrentPaceMinPerKm, units) }));
                        }}
                        title={`Use current fitness pace (${paceText(routeHistory.expectedCurrentPaceMinPerKm, units)} /${units})`}
                        className={`text-left rounded-lg px-3 py-2 border active:scale-95 transition-all ${isDark ? 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20' : 'bg-emerald-50 border-emerald-300 hover:bg-emerald-100/70'}`}
                      >
                        <div className={`text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}>
                          <Sparkles size={10} />
                          Expected Now
                        </div>
                        <div className={`text-sm font-black tabular-nums ${isDark ? 'text-emerald-300' : 'text-emerald-900'}`}>
                          {paceText(routeHistory.expectedCurrentPaceMinPerKm, units)} <span className={`text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>/{units}</span>
                        </div>
                        <div className={`text-[10px] ${isDark ? 'text-emerald-400/80' : 'text-emerald-700'}`}>~{fmtMin(routeHistory.expectedCurrentTimeMin)} • fitness</div>
                      </button>
                    )}
                    {[['Last', routeHistory.last, 'sky'], ['Fastest', routeHistory.fastest, 'emerald'], ['Slowest', routeHistory.slowest, 'amber']].map(([name, run]) => (
                      <button
                        key={name}
                        onClick={() => {
                          setPaceTouched(true);
                          setForm((f) => ({ ...f, pace: paceText(run.paceMinPerKm, units) }));
                        }}
                        className={`text-left rounded-lg px-3 py-2 border ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-[#2E2B27]/10 bg-white/70 hover:bg-white'} active:scale-95 transition-all`}
                      >
                        <div className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'opacity-60 text-slate-400' : 'text-[#6A645D]'}`}>{name}</div>
                        <div className={`text-sm font-black tabular-nums ${isDark ? '' : 'text-[#2E2B27]'}`}>
                          {paceText(run.paceMinPerKm, units)} <span className={`text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>/{units}</span>
                        </div>
                        <div className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
                          {new Date(`${run.day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </div>
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setPaceTouched(true);
                        setForm((f) => ({ ...f, pace: paceText(routeHistory.averagePaceMinPerKm, units) }));
                      }}
                      className={`text-left rounded-lg px-3 py-2 border ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-[#2E2B27]/10 bg-white/70 hover:bg-white'} active:scale-95 transition-all`}
                    >
                      <div className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'opacity-60 text-slate-400' : 'text-[#6A645D]'}`}>Average</div>
                      <div className={`text-sm font-black tabular-nums ${isDark ? '' : 'text-[#2E2B27]'}`}>
                        {paceText(routeHistory.averagePaceMinPerKm, units)} <span className={`text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>/{units}</span>
                      </div>
                      <div className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>all {routeHistory.count} runs</div>
                    </button>
                  </div>
                </>
              ) : (
                <p className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>None of your Strava runs follow this route yet. Type your pace in below.</p>
              )}
            </div>
          )}
          {demand ? <DemandCard demand={demand} units={units} isDark={isDark} /> : <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>Calculating route demand...</p>}
        </div>
      )}

      {/* 4. GOAL SELECTION */}
      {goals.length > 0 && (
        <div className={panel}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>Plan for a goal</h2>
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

      {/* 5. WHERE YOU ARE NOW (METABOLIC STATUS HUD) */}
      <div className={panel}>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h2 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>Where you are now</h2>
          <button onClick={() => useCurrent(false)} className={`${ghost} ml-auto text-xs`}>
            <RotateCw size={12} />
            Use my current readings
          </button>
        </div>
        {now?.now?.bgFresh && (
          <p className={`text-[11px] mb-3 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
            From your Nightscout log {now.now.bgMinutesAgo} min ago: glucose {now.now.bg} ({now.now.direction}), insulin on board {now.now.iob ?? 'unknown'} U
            {now.now.lastBolusMinutesAgo != null ? `, last bolus ${now.now.lastBolusUnits} U ${now.now.lastBolusMinutesAgo} min ago` : ''}.
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
          <div>
            <label className={label}>Glucose (mmol/L)</label>
            <input className={field} type="number" step="0.1" value={form.startBg} onChange={(e) => setForm({ ...form, startBg: e.target.value })} />
          </div>
          <div>
            <label className={label}>Insulin on board (U)</label>
            <input className={field} type="number" step="0.1" value={form.iob} onChange={(e) => setForm({ ...form, iob: e.target.value })} />
          </div>
          <div>
            <label className={label}>Carbs on board (g)</label>
            <input className={field} type="number" step="1" value={form.cob} onChange={(e) => setForm({ ...form, cob: e.target.value })} />
          </div>
          <div>
            <label className={label}>Last bolus (min ago)</label>
            <input className={field} type="number" value={form.minutesSinceBolus} onChange={(e) => setForm({ ...form, minutesSinceBolus: e.target.value })} />
          </div>
          <div>
            <label className={label}>Average pace (m:ss /{units})</label>
            <input
              className={field}
              value={form.pace}
              onChange={(e) => {
                setPaceTouched(true);
                setForm({ ...form, pace: e.target.value });
              }}
              placeholder="from your runs"
            />
          </div>
          <div>
            <label className={label}>Effort</label>
            <select className={field} value={form.intensity} onChange={(e) => setForm({ ...form, intensity: e.target.value })}>
              <option value="easy">Easy</option>
              <option value="steady">Steady</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <button onClick={estimate} disabled={busy === 'estimate' || !form.startBg} className={btn}>
            {busy === 'estimate' ? <RotateCw size={13} className="animate-spin" /> : <Calculator size={13} />}
            Plan my carbs
          </button>
        </div>
      </div>

      {/* 6. THE PLAN & INFOGRAPHIC CARB FUELING TIMELINE */}
      {plan && (
        <>
          {(plan.warnings || []).length > 0 && (
            <div className={`${panel} border-amber-500/40 flex flex-col gap-1.5`}>
              {(plan.warnings || []).map((w, i) => (
                <p key={i} className="text-xs flex items-start gap-2">
                  <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                  {w}
                </p>
              ))}
            </div>
          )}          {/* Quick Metrics Chips Row with Steppers */}
          <div className={panel}>
            <h2 className={`text-xs font-black uppercase tracking-wider mb-3 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>
              <Cookie size={13} className="text-amber-500" />
              The Plan{plan.inputs?.routeName ? ` - ${plan.inputs.routeName}` : ''}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-4">
              {chip('Distance', `${dist(plan.run?.distanceKm || 0, units, 2)} ${units}`)}

              {/* Editable: Estimated Time chip */}
              <div className={`rounded-lg px-3 py-2 border ${isDark ? 'bg-slate-950/50 border-white/5' : 'bg-[#FAF7F2] border-[#2E2B27]/10'}`}>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>Estimated time</div>
                  {originalBaseline && renderDeltaBadge(plan.run?.durationMin, originalBaseline.durationMin, 'time', isDark)}
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      onClick={() => stepTime(2)}
                      disabled={busy === 'estimate'}
                      className={`p-0.5 rounded active:scale-90 transition-colors ${isDark ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-[#6A645D] hover:text-[#2E2B27] hover:bg-[#2E2B27]/5'}`}
                      title="Increase time (+2 min)"
                    >
                      <ChevronUp size={11} />
                    </button>
                    <button
                      onClick={() => stepTime(-2)}
                      disabled={busy === 'estimate' || (plan.run?.durationMin || 0) <= 2}
                      className={`p-0.5 rounded active:scale-90 transition-colors ${isDark ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-[#6A645D] hover:text-[#2E2B27] hover:bg-[#2E2B27]/5'}`}
                      title="Decrease time (-2 min)"
                    >
                      <ChevronDown size={11} />
                    </button>
                  </div>
                  {timeEditFocus ? (
                    <input
                      autoFocus
                      className={`text-sm font-black tabular-nums w-full bg-transparent outline-none border-b ${isDark ? 'border-emerald-400 text-emerald-300' : 'border-emerald-600 text-emerald-700'}`}
                      value={timeEditDraft ?? fmtMin(plan.run?.durationMin || 0)}
                      onChange={(e) => setTimeEditDraft(e.target.value)}
                      onFocus={() => {
                        if (!timeEditFocus) setTimeEditDraft(fmtMin(plan.run?.durationMin || 0));
                        setTimeEditFocus(true);
                      }}
                      onBlur={() => {
                        const raw = (timeEditDraft ?? '').trim();
                        const hm = raw.match(/(\d+)h\s*(\d+)m/);
                        const hOnly = raw.match(/^(\d+)h$/);
                        const mOnly = raw.match(/^(\d+)m?$/);
                        let newMin = null;
                        if (hm) newMin = parseInt(hm[1]) * 60 + parseInt(hm[2]);
                        else if (hOnly) newMin = parseInt(hOnly[1]) * 60;
                        else if (mOnly) newMin = parseInt(mOnly[1]);
                        if (newMin && newMin > 0) {
                          const distKm = plan.run?.distanceKm || 1;
                          const newPaceMinPerKm = newMin / distKm;
                          const newPaceStr = paceText(newPaceMinPerKm, units);
                          setForm((f) => ({ ...f, pace: newPaceStr }));
                          setPaceTouched(true);
                          estimate({ isTweak: true, paceMinPerKm: newPaceMinPerKm });
                        }
                        setTimeEditFocus(false);
                        setTimeEditDraft(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.target.blur();
                        if (e.key === 'Escape') { setTimeEditFocus(false); setTimeEditDraft(null); }
                      }}
                      style={{ width: '80px' }}
                    />
                  ) : (
                    <button
                      className={`text-sm font-black tabular-nums hover:underline cursor-text text-left w-full ${isDark ? '' : 'text-[#2E2B27]'}`}
                      onClick={() => { setTimeEditFocus(true); setTimeEditDraft(fmtMin(plan.run?.durationMin || 0)); }}
                    >
                      {fmtMin(plan.run?.durationMin || 0)}
                      <span className="ml-1 text-[9px] opacity-40 font-normal">✎</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Editable: Average Pace chip */}
              <div className={`rounded-lg px-3 py-2 border ${isDark ? 'bg-slate-950/50 border-white/5' : 'bg-[#FAF7F2] border-[#2E2B27]/10'}`}>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>Average pace</div>
                  {originalBaseline && renderDeltaBadge(plan.inputs?.averagePaceMinPerKm, originalBaseline.averagePaceMinPerKm, 'pace', isDark)}
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      onClick={() => stepPace(5)}
                      disabled={busy === 'estimate'}
                      className={`p-0.5 rounded active:scale-90 transition-colors ${isDark ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-[#6A645D] hover:text-[#2E2B27] hover:bg-[#2E2B27]/5'}`}
                      title="Slower pace (+5 sec)"
                    >
                      <ChevronUp size={11} />
                    </button>
                    <button
                      onClick={() => stepPace(-5)}
                      disabled={busy === 'estimate' || (plan.inputs?.averagePaceMinPerKm || 0) <= 2.5}
                      className={`p-0.5 rounded active:scale-90 transition-colors ${isDark ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-[#6A645D] hover:text-[#2E2B27] hover:bg-[#2E2B27]/5'}`}
                      title="Faster pace (-5 sec)"
                    >
                      <ChevronDown size={11} />
                    </button>
                  </div>
                  {paceEditFocus ? (
                    <input
                      autoFocus
                      className={`text-sm font-black tabular-nums w-full bg-transparent outline-none border-b ${isDark ? 'border-emerald-400 text-emerald-300' : 'border-emerald-600 text-emerald-700'}`}
                      value={paceEditDraft ?? `${paceText(plan.inputs?.averagePaceMinPerKm || 5.0, units)}`}
                      onChange={(e) => setPaceEditDraft(e.target.value)}
                      onFocus={() => {
                        if (!paceEditFocus) setPaceEditDraft(paceText(plan.inputs?.averagePaceMinPerKm || 5.0, units));
                        setPaceEditFocus(true);
                      }}
                      onBlur={() => {
                        const raw = (paceEditDraft ?? '').trim();
                        const parsed = paceToMinPerKm(raw, units);
                        if (raw.includes(':') && parsed > 0 && parsed < 30) {
                          setForm((f) => ({ ...f, pace: raw }));
                          setPaceTouched(true);
                          estimate({ isTweak: true, paceMinPerKm: parsed });
                        }
                        setPaceEditFocus(false);
                        setPaceEditDraft(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.target.blur();
                        if (e.key === 'Escape') { setPaceEditFocus(false); setPaceEditDraft(null); }
                      }}
                      style={{ width: '80px' }}
                    />
                  ) : (
                    <button
                      className={`text-sm font-black tabular-nums hover:underline cursor-text text-left w-full ${isDark ? '' : 'text-[#2E2B27]'}`}
                      onClick={() => { setPaceEditFocus(true); setPaceEditDraft(paceText(plan.inputs?.averagePaceMinPerKm || 5.0, units)); }}
                    >
                      {paceText(plan.inputs?.averagePaceMinPerKm || 5.0, units)} /{units}
                      <span className="ml-1 text-[9px] opacity-40 font-normal">✎</span>
                    </button>
                  )}
                </div>
              </div>

              {chip('Climbing', plan.run?.hasElevation ? `${plan.run.gainM} m up` : 'flat / unknown')}
              {chip('Effort vs flat', `${Math.round(((plan.run?.effortFactor || 1) - 1) * 100)}% more`)}

              {/* Editable: Carbs in Total chip */}
              <div className={`rounded-lg px-3 py-2 border ${isDark ? 'bg-slate-950/50 border-white/5' : 'bg-[#FAF7F2] border-[#2E2B27]/10'}`}>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-yellow-500/90' : 'text-amber-900 font-bold'}`}>Carbs in total</div>
                  {originalBaseline && renderDeltaBadge(plan.plan?.totalCarbs, originalBaseline.totalCarbs, 'carbs', isDark)}
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      onClick={() => stepCarbs(5)}
                      disabled={busy === 'estimate'}
                      className={`p-0.5 rounded active:scale-90 transition-colors ${isDark ? 'text-yellow-400 hover:text-white hover:bg-white/10' : 'text-amber-700 hover:text-amber-900 hover:bg-amber-100'}`}
                      title="Increase carbs (+5 g)"
                    >
                      <ChevronUp size={11} />
                    </button>
                    <button
                      onClick={() => stepCarbs(-5)}
                      disabled={busy === 'estimate' || (plan.plan?.totalCarbs || 0) <= 0}
                      className={`p-0.5 rounded active:scale-90 transition-colors ${isDark ? 'text-yellow-400 hover:text-white hover:bg-white/10' : 'text-amber-700 hover:text-amber-900 hover:bg-amber-100'}`}
                      title="Decrease carbs (-5 g)"
                    >
                      <ChevronDown size={11} />
                    </button>
                  </div>
                  {carbsEditFocus ? (
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      max="300"
                      step="5"
                      className={`text-sm font-black tabular-nums w-full bg-transparent outline-none border-b ${isDark ? 'border-yellow-400 text-yellow-300' : 'border-yellow-600 text-yellow-700'}`}
                      value={carbsEditDraft ?? String(plan.plan?.totalCarbs || 0)}
                      onChange={(e) => setCarbsEditDraft(e.target.value)}
                      onFocus={() => {
                        if (!carbsEditFocus) setCarbsEditDraft(String(plan.plan?.totalCarbs || 0));
                        setCarbsEditFocus(true);
                      }}
                      onBlur={() => {
                        const raw = (carbsEditDraft ?? '').trim();
                        const parsed = Number(raw);
                        if (Number.isFinite(parsed) && parsed >= 0) {
                          estimate({ isTweak: true, customCarbs: Math.round(parsed) });
                        }
                        setCarbsEditFocus(false);
                        setCarbsEditDraft(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.target.blur();
                        if (e.key === 'Escape') { setCarbsEditFocus(false); setCarbsEditDraft(null); }
                      }}
                      style={{ width: '56px' }}
                    />
                  ) : (
                    <button
                      className={`text-sm font-black tabular-nums hover:underline cursor-text text-left ${isDark ? 'text-yellow-400' : 'text-amber-800'}`}
                      onClick={() => { setCarbsEditFocus(true); setCarbsEditDraft(String(plan.plan?.totalCarbs || 0)); }}
                    >
                      {plan.plan?.totalCarbs || 0} g
                      <span className="ml-1 text-[9px] opacity-40 font-normal">✎</span>
                    </button>
                  )}
                </div>
              </div>

              {chip('Per hour', `${plan.plan?.carbsPerHour || 0} g/h`)}
              {chip('Lowest (estimate)', plan.plan?.predicted?.minDuring, (plan.plan?.predicted?.minDuring || 0) < (plan.settings?.floor || 4.0) ? 'text-red-500' : 'text-emerald-500')}
              {chip('At the finish', plan.plan?.predicted?.endBg)}
              {chip('Lowest after', plan.plan?.predicted?.minAfter, (plan.plan?.predicted?.minAfter || 0) < (plan.settings?.floor || 4.0) ? 'text-red-500' : '')}
              {chip('With no carbs', plan.plan?.predicted?.minWithoutCarbs, (plan.plan?.predicted?.minWithoutCarbs || 0) < (plan.settings?.floor || 4.0) ? 'text-amber-500' : '')}
              {chip('Energy', plan.run?.kcal ? `${plan.run.kcal} kcal` : 'add weight')}
              {chip('1 g of carb =', `${plan.settings?.mmolPerGram || '--'} mmol/L`)}
            </div>

            {/* Infographic Carb Timeline & Elevation Trajectory */}
            <CarbFuelingTimeline
              plan={plan}
              units={units}
              isDark={isDark}
              originalBaseline={originalBaseline}
              onStepCarbs={stepCarbs}
              onStepStopCarbs={stepStopCarbs}
            />

            {/* When to Eat Table */}
            <h3 className={`text-[11px] font-black uppercase tracking-wider mt-4 mb-2 ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>When to eat</h3>
            {(plan.plan?.stops || []).length === 0 ? (
              <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>On these numbers no carbs are needed during the run - keep some with you anyway.</p>
            ) : (
              <table className="w-full text-xs mb-3">
                <thead>
                  <tr className={`text-left text-[9px] uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
                    <th className="py-1 pr-3">When</th>
                    <th className="pr-3">Where</th>
                    <th className="pr-3 text-right">Carbs</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {(plan.plan?.stops || []).map((s, i) => (
                    <tr key={i} className={`border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
                      <td className={`py-1.5 pr-3 tabular-nums font-bold ${isDark ? '' : 'text-[#2E2B27]'}`}>{s.minute === 0 ? 'At the start' : `${s.minute} min in`}</td>
                      <td className={`pr-3 tabular-nums ${isDark ? '' : 'text-[#6A645D]'}`}>{s.minute === 0 ? '-' : `${units} ${dist(s.km, units)}`}</td>
                      <td className="pr-3 text-right tabular-nums font-black text-yellow-500">{s.grams} g</td>
                      <td className={isDark ? 'text-slate-500' : 'text-[#6A645D]'}>{s.note}</td>
                    </tr>
                  ))}
                  {(plan.plan?.postCarbs || 0) > 0 && (
                    <tr className={`border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
                      <td className={`py-1.5 pr-3 font-bold ${isDark ? '' : 'text-[#2E2B27]'}`}>At the finish</td>
                      <td>-</td>
                      <td className="pr-3 text-right font-black text-yellow-500 tabular-nums">{plan.plan.postCarbs} g</td>
                      <td className={isDark ? 'text-slate-500' : 'text-[#6A645D]'}>The estimate dips after you stop; insulin stays extra effective for hours.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {(plan.plan?.toReachStartTarget || 0) > 0 && (
              <p className={`text-[11px] mt-2 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
                To be at your {plan.settings?.startTarget} start target from {plan.inputs?.startBg} you would need about {plan.plan?.toReachStartTarget} g of fast carbs 15-20 minutes before you go.
              </p>
            )}
            {plan.guideline && plan.guideline[plan.guideline.usedRange] && (
              <p className={`text-[11px] mt-2 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
                For comparison, ISPAD guidance is {plan.guideline[plan.guideline.usedRange][0]}-{plan.guideline[plan.guideline.usedRange][1]} g an hour at your weight with {plan.guideline.usedRange === 'highIob' ? 'insulin still active' : 'little insulin active'}; this plan uses {plan.plan?.carbsPerHour} g/h because it is tailored to your glucose and insulin on board.
              </p>
            )}
          </div>

          {/* Scenario Matrices */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={panel}>
              <h3 className={`text-[11px] font-black uppercase tracking-wider mb-2 ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>If you started at a different glucose</h3>
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
              <h3 className={`text-[11px] font-black uppercase tracking-wider mb-2 ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>If you had different insulin on board</h3>
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

          {/* Insulin - Things to discuss with your diabetes team */}
          {plan.insulin && plan.insulin.length > 0 && (
            <div className={panel}>
              <h3 className={`text-[11px] font-black uppercase tracking-wider mb-2 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>
                <Syringe size={13} className="text-emerald-500" />
                Insulin - things to discuss with your diabetes team
              </h3>
              <div className="flex flex-col gap-3">
                {plan.insulin.map((n, i) => (
                  <div key={i}>
                    <div className={`text-xs font-bold ${isDark ? '' : 'text-[#2E2B27]'}`}>{n.title}</div>
                    <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>{n.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* How this was worked out */}
          {plan.basis && (
            <div className={panel}>
              <h3 className={`text-[11px] font-black uppercase tracking-wider mb-2 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>
                <BookOpen size={13} className="text-emerald-500" />
                How this was worked out
              </h3>
              <p className={`text-[11px] leading-relaxed mb-2 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
                Each minute: glucose falls with insulin action (your {plan.inputs?.iob} U on board over a 3-hour curve, times your ISF of {plan.settings?.isf} mmol/L per U, made {plan.inputs?.sensMult}x stronger during the run) and with exercise uptake ({plan.inputs?.kEx} mmol/L per hour, scaled by effort and the route's climbing), and rises with carbs ({plan.settings?.cr} g per U, so about {plan.settings?.mmolPerGram} mmol/L per gram, absorbed over about 20 minutes). Stops are placed so the estimate stays at least 1 mmol/L above your {plan.settings?.floor} floor, off steep climbs where possible. Your loop will also react (temp basals), which this ignores, so treat the estimate as cautious.
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
    </div>
  );
}

