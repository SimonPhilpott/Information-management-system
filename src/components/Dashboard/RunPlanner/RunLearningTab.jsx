import React, { useCallback, useEffect, useState } from 'react';
import { GraduationCap, Check, X, Undo2, RotateCw, Info, Route as RouteIcon, Layers, Globe } from 'lucide-react';
import RunRetrospective from './RunRetrospective';
import PostRunReviewPanel from './PostRunReviewPanel';

// Run learning: what your runs have taught, at three levels - this route, this kind of run (distance, effort,
// hills) and all runs. IMS suggests; nothing changes your plans until you accept it, and accepted lessons can
// be retired at any time. Below, every run with its retrospective (plan against reality, what you took, notes).

const SCOPE = { route: ['This route', RouteIcon], profile: ['This kind of run', Layers], general: ['All runs', Globe] };
const when = (ms) => (ms ? new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const STATUS = { armed: 'waiting for you to tap Start', scheduled: 'sent - waiting for the run', started: 'run started - waiting for Strava', linked: 'matched to Strava', no_run: 'no Strava run found' };

export default function RunLearningTab({ call, send, isDark, panelClass, units = 'km' }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null); // activity id whose retrospective is shown

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
          Each run you send to your phone saves its plan; Taken / Skipped on the reminders records what you actually took. After the run IMS matches it to Strava and your glucose,
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
        {!data?.sessions?.length ? <div className={muted}>No runs yet - send one from the Run Planner, or open a past run in the Flythrough tab.</div> : (
          <div className="flex flex-col divide-y divide-current/5">
            {data.sessions.map((x) => (
              <button key={x.id} disabled={!x.activityId} onClick={() => setOpen(x.activityId)}
                className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 text-left ${x.activityId ? 'hover:opacity-80' : 'opacity-70 cursor-default'} ${open === x.activityId && x.activityId ? 'font-bold text-sky-500' : ''}`}>
                <span className="w-40 shrink-0">{x.day || when(x.startedAt)}</span>
                <span className="flex-1 min-w-[160px]">{x.activityName || x.routeName}{x.kind === 'live' ? ' · planned in IMS' : ''}</span>
                <span className={muted}>{x.activityId ? (x.quality === 'good' ? `uptake ${x.effective >= 1 ? '+' : ''}${Math.round((x.effective - 1) * 100)}%` : x.quality === 'low' ? 'not clear enough to learn from' : 'not analysed') : STATUS[x.status] || x.status}</span>
                {x.accuracy != null && <span className={muted}>prediction {x.accuracy}%</span>}
                {x.lowest != null && <span className={muted}>lowest {x.lowest}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {open && <RunRetrospective activityId={open} isDark={isDark} call={call} send={send} units={units} />}
      {/* what the run means for the next day or two: sensitivity window, refuelling, the next plan */}
      {open && <PostRunReviewPanel activityId={open} isDark={isDark} />}
    </div>
  );
}
