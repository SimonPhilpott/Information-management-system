import React, { useCallback, useEffect, useState } from 'react';
import { GraduationCap, Check, X, Undo2, RotateCw, Info, Route as RouteIcon, Layers, Globe, Link2, ExternalLink, Calendar, Timer } from 'lucide-react';
import RunRetrospective from './RunRetrospective';
import PostRunReviewPanel from './PostRunReviewPanel';

// Run learning: what your runs have taught, at three levels - this route, this kind of run (distance, effort,
// hills) and all runs. IMS suggests; nothing changes your plans until you accept it, and accepted lessons can
// be retired at any time. Below, every run with its retrospective (plan against reality, what you took, notes).

const SCOPE = { route: ['This route', RouteIcon], profile: ['This kind of run', Layers], general: ['All runs', Globe] };
const when = (ms) => (ms ? new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const STATUS = { armed: 'planned · waiting for run / match', scheduled: 'planned in IMS', started: 'run started · waiting for Strava', linked: 'matched to Strava', no_run: 'no Strava run found' };

export default function RunLearningTab({ call, send, isDark, panelClass, units = 'km' }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null); // activity id whose retrospective is shown
  const [matchModalSession, setMatchModalSession] = useState(null);

  const [checkMsg, setCheckMsg] = useState(null);
  const load = useCallback(async (sync = false) => {
    setBusy(true); setError(null); if (sync) setCheckMsg('Checking Strava and Nightscout...');
    try {
      const d = await call(`/api/planner/learning${sync ? '?sync=1' : ''}`);
      setData(d); setOpen((o) => o ?? d.sessions.find((x) => x.activityId)?.activityId ?? null);
      if (d.check) {
        const c = d.check;
        setCheckMsg(c.stravaError ? `Strava: ${c.stravaError}` : `Strava checked (${c.strava?.fetched ?? 0} recent activities)${c.linked ? ` - ${c.linked} run${c.linked === 1 ? '' : 's'} matched and analysed` : ' - no new run to match yet'}${c.nightscoutError ? ` · Nightscout: ${c.nightscoutError}` : ''}.`);
      }
    } catch (err) { setError(err.message); setCheckMsg(null); } finally { setBusy(false); }
  }, [call]);
  useEffect(() => { load(); }, [load]);

  const decide = async (id, decision) => {
    setBusy(true);
    try { setData(await send(`/api/planner/learning/${id}/${decision}`, 'POST')); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const matchSession = async (sessionId, activityId) => {
    setBusy(true); setError(null);
    try {
      await send(`/api/planner/retro/sessions/${sessionId}/link`, 'POST', { activityId });
      setMatchModalSession(null);
      setOpen(activityId);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const muted = isDark ? 'text-slate-400' : 'text-[#6A645D]';
  const card = `rounded-xl border p-4 text-xs ${isDark ? 'border-white/10 bg-slate-950/30' : 'border-[#2E2B27]/10 bg-white'}`;
  const small = `px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-[#2E2B27]/15 hover:bg-[#F4EFE6]'}`;
  const Lesson = ({ l, actions }) => {
    const [title, Icon] = SCOPE[l.scope] || ['', Info];
    return (
      <div className={`rounded-lg border p-3 ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Icon size={13} className="text-sky-500" />
          <span className="font-black uppercase tracking-wider text-[10px]">{l.scope === 'general' ? title : `${title}: ${l.label}`}</span>
          <span className={`text-[10px] ${muted}`}>from {l.runs} runs</span>
        </div>
        <p className="leading-snug mb-2">{l.text}</p>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={`${panelClass} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <GraduationCap size={16} className="text-sky-500" />
            <h2 className="text-xs font-black uppercase tracking-wider">What your runs have taught</h2>
          </div>
          <button onClick={() => load(true)} disabled={busy} className={small}><RotateCw size={12} className={busy ? 'animate-spin' : ''} />Check for new runs</button>
        </div>
        {checkMsg && <div className="text-[11px] text-sky-600">{checkMsg}</div>}
        <p className={`text-[11px] ${muted}`}>
          Each run you plan saves its fuelling strategy. You can send it to your phone or save the plan directly. After the run, IMS matches it to your Strava activity and glucose,
          replays the plan with what really happened, and measures where the planner was wrong. When the same thing shows up again - {data?.minRuns?.route ?? 2} runs on a route,
          {' '}{data?.minRuns?.profile ?? 3} of a kind, {data?.minRuns?.general ?? 4} overall - it's suggested here. Nothing changes your plans until you accept it.
          Lessons that would mean fewer carbs need an extra run and no lows. Lessons that hold across routes are offered to your T1D Rulebook too. Never insulin.
        </p>
        {error && <div className="text-amber-600 text-xs">{error}</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={card}>
          <div className="font-black uppercase tracking-wider text-[10px] mb-2">Suggested - your call</div>
          {!data?.suggestions?.length ? <div className={muted}>Nothing to suggest yet. It takes a few runs with glucose data where the model fits clearly{data?.profiles?.length ? '' : ' - none analysed so far'}.</div> : (
            <div className="flex flex-col gap-2">
              {data.suggestions.map((l) => <Lesson key={l.id} l={l} actions={<>
                <button onClick={() => decide(l.id, 'accept')} className={`${small} bg-emerald-500 text-white border-transparent`}><Check size={12} />Use this in my plans</button>
                <button onClick={() => decide(l.id, 'dismiss')} className={small}><X size={12} />Not now</button>
              </>} />)}
            </div>
          )}
        </div>
        <div className={card}>
          <div className="font-black uppercase tracking-wider text-[10px] mb-2">In use in your plans</div>
          {!data?.accepted?.length ? <div className={muted}>None yet - plans use the standard model{' '}(fitted to your runs once 4 have glucose data).</div> : (
            <div className="flex flex-col gap-2">
              {data.accepted.map((l) => <Lesson key={l.id} l={l} actions={<button onClick={() => decide(l.id, 'retire')} className={small}><Undo2 size={12} />Stop using it</button>} />)}
            </div>
          )}
        </div>
      </div>

      {/* how close the pre-run prediction got, run by run - the number learning should push up */}
      <div className={card}>
        <div className="font-black uppercase tracking-wider text-[10px] mb-1">Prediction accuracy</div>
        <p className={`mb-2 ${muted}`}>For each run sent from the planner: the share of your glucose readings during the run that were within 1 mmol/L of the plan's predicted line. As lessons are accepted it should climb.</p>
        {!data?.accuracy?.length ? <div className={muted}>No runs with a sent plan and glucose data yet.</div> : (() => {
          const rows = data.accuracy;
          const avg = Math.round(rows.reduce((n, r) => n + r.pct, 0) / rows.length);
          const W = Math.max(260, rows.length * 56), H = 120, base = 96;
          return (
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <div className="text-3xl font-black tabular-nums">{rows[rows.length - 1].pct}%</div>
                <div className={muted}>latest · average {avg}% over {rows.length} run{rows.length === 1 ? '' : 's'}</div>
                <div className={`mt-1 ${muted}`}>Latest: average gap {rows[rows.length - 1].mae} mmol/L; lowest predicted {rows[rows.length - 1].lowestPredicted}, real {rows[rows.length - 1].lowestActual}.</div>
              </div>
              <div className="overflow-x-auto flex-1 min-w-[240px]">
                <svg viewBox={`0 0 ${W} ${H}`} className="h-[120px]" style={{ width: W }} role="img" aria-label="Prediction accuracy by run">
                  {[0, 50, 100].map((v) => <g key={v}><line x1="28" x2={W} y1={base - v * 0.8} y2={base - v * 0.8} stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(46,43,39,0.1)'} /><text x="24" y={base - v * 0.8 + 3} fontSize="9" textAnchor="end" fill={isDark ? '#94a3b8' : '#6A645D'}>{v}%</text></g>)}
                  {rows.map((r, i) => {
                    const x = 40 + i * 56, h = r.pct * 0.8;
                    return (
                      <g key={r.id}>
                        <rect x={x} y={base - h} width="30" height={h} rx="3" fill={r.pct >= 80 ? '#16a34a' : r.pct >= 50 ? '#f59e0b' : '#dc2626'} />
                        <text x={x + 15} y={base - h - 4} fontSize="10" fontWeight="800" textAnchor="middle" fill={isDark ? '#e2e8f0' : '#2E2B27'}>{r.pct}%</text>
                        <text x={x + 15} y={base + 13} fontSize="9" textAnchor="middle" fill={isDark ? '#94a3b8' : '#6A645D'}>{String(r.day).slice(5).split('-').reverse().join('/')}</text>
                        <title>{`${r.routeName || r.name}: ${r.pct}% within 1 mmol/L, average gap ${r.mae}`}</title>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* after your runs: the spike, and (with 3 runs) a conservative correction estimate */}
        <div className={card}>
          <div className="font-black uppercase tracking-wider text-[10px] mb-2">After your runs - the spike</div>
          {(() => {
            const pr = data?.postRun;
            const pat = pr?.overall;
            if (!pat?.runs) return <div className={muted}>No runs with 2 hours of glucose after the finish yet (runs with a meal straight after are left out, since the food explains the rise).</div>;
            return (
              <div className="flex flex-col gap-2">
                <div>From {pat.runs} run{pat.runs === 1 ? '' : 's'}: glucose typically rose <b>{pat.rise} mmol/L</b> after the finish, peaking about <b>{pat.peakAt} min</b> after (around {pat.peak}); a rise of 2 or more in {pat.spikes} of them, {pat.settledByThemselves} settled by themselves. Your loop added about {pat.loopUnits} U in those 2 hours.</div>
                {pr.hard && <div>Hard runs only ({pr.hard.runs}): rise {pr.hard.rise} mmol/L, peak about {pr.hard.peakAt} min after{pr.hard.units ? ` - conservative correction about ${pr.hard.units.conservative} U` : ''}.</div>}
                {pat.units ? (
                  <div className={`rounded-lg border p-2.5 ${isDark ? 'border-amber-500/40 bg-amber-500/10' : 'border-amber-500/50 bg-amber-50'}`}>
                    <div className="font-bold">Correction estimate: about {pat.units.conservative} U <span className="font-normal">(a full correction would be {pat.units.full} U at your ISF of {pat.units.isf}; post-exercise guidance is about half)</span></div>
                    <p className={`mt-1 text-[11px] ${muted}`}>{pr.caveat}</p>
                  </div>
                ) : <div className={muted}>A correction estimate appears once {pr.needRuns} runs show a typical rise of 2 mmol/L or more.</div>}
              </div>
            );
          })()}
        </div>

        {/* refuelled since the last run? */}
        <div className={card}>
          <div className="font-black uppercase tracking-wider text-[10px] mb-2">Refuelled since your last run?</div>
          {!data?.refuel ? <div className={muted}>No runs yet.</div> : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 rounded-full bg-slate-500/15 overflow-hidden"><div className={`h-full ${data.refuel.pct >= 90 ? 'bg-emerald-500' : data.refuel.pct >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, data.refuel.pct || 0)}%` }} /></div>
                <b className="tabular-nums">{data.refuel.eatenG} / {data.refuel.targetG} g</b>
              </div>
              <div>{data.refuel.text}</div>
              <div className={`text-[11px] ${muted}`}>Used by the run about {data.refuel.usedG} g ({data.refuel.run.km} km, {data.refuel.run.intensity}); everyday need about 3 g per kg a day. {data.refuel.note}</div>
            </div>
          )}
        </div>
      </div>

      {data?.profiles?.length > 0 && (
        <div className={card}>
          <div className="font-black uppercase tracking-wider text-[10px] mb-2">Kinds of run so far</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {data.profiles.map((p) => (
              <div key={p.key} className={`rounded-lg border px-3 py-2 ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
                <div className="font-bold capitalize">{p.label}</div>
                <div className={muted}>{p.runs} run{p.runs === 1 ? '' : 's'}, {p.good} clear enough to learn from</div>
                {p.medianEffective != null && <div>Uptake vs model: <b>{p.medianEffective >= 1 ? '+' : ''}{Math.round((p.medianEffective - 1) * 100)}%</b></div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={card}>
        <div className="font-black uppercase tracking-wider text-[10px] mb-2">Your runs</div>
        {!data?.sessions?.length ? <div className={muted}>No runs yet - plan one in the Run Planner, or open a past run in the Flythrough tab.</div> : (
          <div className="flex flex-col divide-y divide-current/5">
            {data.sessions.map((x) => {
              const isLinked = Boolean(x.activityId);
              const timeDisplay = x.day || when(x.startedAt || x.createdAt);
              // Check if there is an unlinked Strava run within 36 hours of the planned time
              const suggestedAct = !isLinked && (data?.unlinkedActivities || []).find((act) => {
                if (!act.start_utc) return false;
                const actMs = Date.parse(act.start_utc);
                const targetMs = x.startedAt || x.createdAt;
                return targetMs && Math.abs(actMs - targetMs) < 36 * 3600000;
              });

              return (
                <div key={x.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-left">
                  <div
                    onClick={() => isLinked && setOpen(x.activityId)}
                    className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 flex-1 min-w-[240px] ${isLinked ? 'cursor-pointer hover:opacity-80' : ''} ${open === x.activityId && isLinked ? 'font-bold text-sky-500' : ''}`}
                  >
                    <span className="w-36 shrink-0">{timeDisplay}</span>
                    <span className="font-bold min-w-[140px]">{x.activityName || x.routeName}{x.kind === 'live' ? ' · planned in IMS' : ''}</span>
                    <span className={muted}>
                      {isLinked
                        ? (x.quality === 'good' ? `uptake ${x.effective >= 1 ? '+' : ''}${Math.round((x.effective - 1) * 100)}%` : x.quality === 'low' ? 'not clear enough to learn from' : 'not analysed')
                        : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">{STATUS[x.status] || x.status}</span>
                      }
                    </span>
                    {x.accuracy != null && <span className={muted}>prediction {x.accuracy}%</span>}
                    {x.lowest != null && <span className={muted}>lowest {x.lowest}</span>}
                  </div>

                  <div className="flex items-center gap-2">
                    {!isLinked && (
                      <>
                        {suggestedAct ? (
                          <button
                            onClick={() => matchSession(x.id, suggestedAct.id)}
                            disabled={busy}
                            className={`${small} bg-emerald-500 text-white border-transparent hover:bg-emerald-600`}
                            title={`Match to ${suggestedAct.name} (${(suggestedAct.distance / 1000).toFixed(1)} km, ${suggestedAct.day || when(Date.parse(suggestedAct.start_utc))})`}
                          >
                            <Link2 size={12} /> Link to {suggestedAct.name}
                          </button>
                        ) : null}
                        <button
                          onClick={() => setMatchModalSession(x)}
                          disabled={busy}
                          className={`${small} text-sky-500 border-sky-500/30 hover:bg-sky-500/10`}
                          title="Choose a Strava activity to match to this plan"
                        >
                          <Link2 size={12} /> {suggestedAct ? 'Choose other run' : 'Match to Strava run'}
                        </button>
                      </>
                    )}
                    {isLinked && (
                      <button
                        onClick={() => setOpen(x.activityId)}
                        className={`${small} ${open === x.activityId ? 'bg-sky-500/15 border-sky-500 text-sky-500' : ''}`}
                      >
                        {open === x.activityId ? 'Showing review' : 'View review'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manual Run Matching Modal */}
      {matchModalSession && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setMatchModalSession(null)}>
          <div className={`w-full max-w-xl rounded-2xl border p-5 shadow-2xl ${isDark ? 'bg-slate-900 border-white/15 text-slate-100' : 'bg-white border-[#2E2B27]/15 text-[#2E2B27]'}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                  <Link2 size={16} className="text-sky-500" /> Match Planned Run to Strava
                </h3>
                <p className={`text-xs mt-1 ${muted}`}>
                  Planned: <b>{matchModalSession.routeName || 'Run'}</b> ({when(matchModalSession.startedAt || matchModalSession.createdAt)})
                </p>
              </div>
              <button onClick={() => setMatchModalSession(null)} className="p-1 rounded-lg hover:bg-white/10 opacity-70 hover:opacity-100"><X size={16} /></button>
            </div>

            <p className={`text-xs mb-3 ${muted}`}>
              Select the completed Strava run to link with this plan. IMS will align your glucose telemetry, calculate your fuelling accuracy, and produce your post-run learning insights.
            </p>

            <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
              {!data?.unlinkedActivities?.length ? (
                <div className={`text-center py-6 text-xs ${muted}`}>
                  No recent unlinked Strava runs found.
                  <div className="mt-2">
                    <button onClick={() => load(true)} disabled={busy} className={`${small} mx-auto`}>
                      <RotateCw size={12} className={busy ? 'animate-spin' : ''} /> Check Strava for new runs
                    </button>
                  </div>
                </div>
              ) : (
                data.unlinkedActivities.map((act) => {
                  const distKm = act.distance ? (act.distance / 1000).toFixed(1) : '-';
                  const durMin = Math.round((act.elapsed_time || act.moving_time || 0) / 60);
                  const actTime = act.day || (act.start_utc ? when(Date.parse(act.start_utc)) : '');
                  return (
                    <div key={act.id} className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors ${isDark ? 'border-white/10 hover:bg-white/5 bg-slate-950/40' : 'border-[#2E2B27]/10 hover:bg-[#F4EFE6] bg-[#FAF7F2]'}`}>
                      <div className="flex-1 min-w-[180px]">
                        <div className="font-bold text-xs">{act.name}</div>
                        <div className={`text-[11px] flex items-center gap-3 mt-0.5 ${muted}`}>
                          <span className="flex items-center gap-1"><Calendar size={11} /> {actTime}</span>
                          <span>{distKm} km</span>
                          <span className="flex items-center gap-1"><Timer size={11} /> {durMin} min</span>
                        </div>
                      </div>
                      <button
                        onClick={() => matchSession(matchModalSession.id, act.id)}
                        disabled={busy}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white flex items-center gap-1 active:scale-95 disabled:opacity-50"
                      >
                        <Link2 size={12} /> Link this run
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-current/10">
              <button onClick={() => setMatchModalSession(null)} className={small}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {open && <RunRetrospective activityId={open} isDark={isDark} call={call} send={send} units={units} />}
      {/* what the run means for the next day or two: sensitivity window, refuelling, the next plan */}
      {open && <PostRunReviewPanel activityId={open} isDark={isDark} />}
    </div>
  );
}

