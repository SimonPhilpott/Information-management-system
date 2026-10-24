// Run planner: Learning - an inbox, then the lessons (24 Oct, Simon chose Learning A with B's traces).
// Runs waiting for review first, each with one Review button; then lessons as cards (suggested ones to use or not,
// the ones in use to stop); how well the plans predict as a ring and bars; then every run you've looked back on, each
// with a small line of the plan against what really happened. A run opens plan against reality (Retro.jsx).
// Everything else the classic tab shows (the spike after runs, refuelling, kinds of run, plans waiting for a run)
// is folded away underneath. The same /api/planner requests as the classic tab.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Btn, Sheet, useInView } from '../HomebrewBeta/ui';
import { dist } from '../../utils/units';
import { Banner } from './PlanSection';

const dayWord = (day) => (day ? new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
const when = (ms) => (ms ? new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const SCOPE = { route: 'This route', profile: 'This kind of run', general: 'All runs', rulebook: 'Change to your rulebook', targets: 'Change to your targets' };
const STATUS = { armed: 'Planned, waiting for the run', scheduled: 'Planned in IMS', started: 'Started, waiting for Strava', no_run: 'No Strava run found', other_route: 'You ran a different route' };
const tone = (pct) => (pct >= 80 ? 'ok' : pct >= 50 ? 'near' : 'low');

// the plan's line against what really happened, small, for a run's card (loaded when the card comes into view)
const traceCache = new Map();
function Trace({ activityId, call }) {
  const box = useRef(null);
  const seen = useInView(box, { once: true });
  const [a, setA] = useState(() => traceCache.get(activityId) || null);
  useEffect(() => {
    if (!seen || a || !activityId) return;
    call(`/api/planner/retro/${activityId}`).then((d) => { const x = d.analysis?.available ? d.analysis : { none: true }; traceCache.set(activityId, x); setA(x); }).catch(() => setA({ none: true }));
  }, [seen, activityId]); // eslint-disable-line react-hooks/exhaustive-deps
  const paths = useMemo(() => {
    if (!a || a.none) return null;
    const dur = a.run.durationMin, W = 300, H = 44;
    const inRun = (pts) => (pts || []).filter((p) => p[0] >= 0 && p[0] <= dur && p[1] != null);
    const all = [...inRun(a.actual), ...inRun(a.planned)].map((p) => p[1]);
    if (!all.length) return null;
    const lo = Math.min(...all, a.floor) - 0.5, hi = Math.max(...all) + 0.5;
    const X = (m) => (m / dur) * W, Y = (v) => 4 + (1 - (v - lo) / (hi - lo)) * (H - 8);
    const d = (pts) => inRun(pts).map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ');
    return { planned: d(a.planned), actual: d(a.actual), floorY: Y(a.floor), W, H };
  }, [a]);
  return (
    <span ref={box} className="rpb-trace">
      {paths && (
        <svg viewBox={`0 0 ${paths.W} ${paths.H}`} preserveAspectRatio="none" role="img" aria-label="The plan's glucose against your real glucose">
          <line x1="0" x2={paths.W} y1={paths.floorY} y2={paths.floorY} className="floor" />
          {paths.planned && <path d={paths.planned} className="planned" />}
          <path d={paths.actual} className="actual" />
        </svg>
      )}
    </span>
  );
}

function Lesson({ l, children, suggested }) {
  return (
    <div className={`rpb-lesson ${suggested ? 'sug' : ''}`}>
      <span className="scope">{l.scope === 'general' ? SCOPE.general : `${SCOPE[l.scope] || ''}${l.label ? `: ${l.label}` : ''}`}<span>from {l.runs} run{l.runs === 1 ? '' : 's'}</span></span>
      <p>{l.text}</p>
      {l.kind === 'rulebook' && Array.isArray(l.evidence?.change) && l.evidence.change.map((c) => (
        <div key={c.from} className="rpb-diff"><div className="was">{c.from.replace(/^[*\s-]+/, '').replace(/\*\*/g, '')}</div><div className="now">{c.to.replace(/^[*\s-]+/, '').replace(/\*\*/g, '')}</div></div>
      ))}
      {l.kind === 'target' && l.evidence?.change && <div className="rpb-diff"><div className="was">{l.evidence.change.from}</div><div className="now">{l.evidence.change.to}</div></div>}
      <div className="rpb-acts">{children}</div>
    </div>
  );
}

export default function Learning({ rp, onOpenRun, openId }) {
  const { call, send } = rp;
  const [data, setData] = useState(null);
  const [recent, setRecent] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [matching, setMatching] = useState(null); // a plan waiting for its run, being matched
  const u = rp.units;

  const loadRecent = useCallback(async () => { try { setRecent((await call('/api/planner/runs/recent')).runs || []); } catch { /* stays as it was */ } }, [call]);
  const load = useCallback(async (sync = false) => {
    setBusy(sync ? 'sync' : 'load');
    if (sync) setMsg({ tone: 'info', text: 'Checking Strava and Nightscout…' });
    try {
      const d = await call(`/api/planner/learning${sync ? '?sync=1' : ''}`);
      setData(d);
      if (d.check) setMsg(d.check.stravaError ? { tone: 'warn', text: `Strava: ${d.check.stravaError}` } : { tone: 'good', text: `Strava checked (${d.check.strava?.fetched ?? 0} recent activities)${d.check.linked ? `. ${d.check.linked} run${d.check.linked === 1 ? '' : 's'} matched to a plan and looked at` : ''}.` });
      else if (sync) setMsg(null);
      if (sync) loadRecent();
    } catch (e) { setMsg({ tone: 'warn', text: e.message }); } finally { setBusy(''); }
  }, [call, loadRecent]);
  useEffect(() => { load(); loadRecent(); }, [load, loadRecent]);

  const review = async (r, unlinkPlan = false) => {
    if (unlinkPlan && !window.confirm(`Look at "${r.name}" as the route you really ran? It will stop counting as the run for your plan (${r.routeName || 'the planned route'}).`)) return;
    setBusy(`r${r.activityId}`);
    try {
      const x = await send(`/api/planner/runs/${r.activityId}/review`, 'POST', { unlinkPlan });
      setMsg({ tone: 'good', text: `Looked at ${r.name} as ${x.routeName}: started on ${x.startBg} mmol/L. ${x.stops ? `Mark whether you took the ${x.stops} carb stop${x.stops === 1 ? '' : 's'}.` : 'No carbs were needed.'}` });
      traceCache.delete(r.activityId);
      await Promise.all([load(), loadRecent()]);
      onOpenRun(r.activityId);
    } catch (e) { setMsg({ tone: 'warn', text: e.message }); } finally { setBusy(''); }
  };
  const decide = async (id, decision) => { setBusy(`l${id}`); try { setData(await send(`/api/planner/learning/${id}/${decision}`, 'POST')); } catch (e) { setMsg({ tone: 'warn', text: e.message }); } finally { setBusy(''); } };
  const link = async (sessionId, activityId) => {
    setBusy('link');
    try { await send(`/api/planner/retro/sessions/${sessionId}/link`, 'POST', { activityId }); setMatching(null); await load(); onOpenRun(activityId); } catch (e) { setMsg({ tone: 'warn', text: e.message }); } finally { setBusy(''); }
  };

  const toReview = (recent || []).filter((r) => r.status === 'new' || r.status === 'basic');
  const looked = (recent || []).filter((r) => r.status === 'matched' || r.status === 'reviewed');
  const waiting = (data?.sessions || []).filter((x) => !x.activityId);
  const acc = data?.accuracy || [];
  const avg = acc.length ? Math.round(acc.reduce((n, r) => n + r.pct, 0) / acc.length) : null;
  const accByActivity = new Map((data?.sessions || []).filter((x) => x.activityId && x.accuracy != null).map((x) => [x.activityId, x.accuracy]));

  return (
    <div className="gutter rpb-plan rpb-learning">
      <div className="rpb-acts start">
        <Btn kind="tonal" icon="sync" busy={busy === 'sync'} onClick={() => load(true)}>Check for new runs</Btn>
      </div>
      {msg && <Banner tone={msg.tone} title={msg.text} />}

      {/* the inbox */}
      <section>
        <h3 className="rpb-h3">{toReview.length ? `${toReview.length} run${toReview.length === 1 ? '' : 's'} to look at` : 'Nothing to look at'}</h3>
        {!toReview.length ? <p className="muted">Every recent run has been looked at. New runs from Strava come in here.</p> : (
          <div className="rpb-inbox">
            {toReview.map((r) => (
              <div key={r.activityId} className="rpb-card rpb-runrow">
                <span className="txt"><b>{r.name}</b><span className="muted">{dayWord(r.day)} · {dist(r.km, u, 2)} {u} · {r.minutes} min{r.status === 'basic' ? ' · glucose only, no plan' : ''}</span></span>
                <Btn icon="school" busy={busy === `r${r.activityId}`} onClick={() => review(r)}>Look at it</Btn>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* lessons */}
      <section>
        <h3 className="rpb-h3">Lessons</h3>
        <div className="rpb-lessons">
          {(data?.suggestions || []).map((l) => (
            <Lesson key={l.id} l={l} suggested>
              <Btn kind="text" onClick={() => decide(l.id, 'dismiss')}>Not now</Btn>
              <Btn icon="check" busy={busy === `l${l.id}`} onClick={() => decide(l.id, 'accept')}>{l.kind === 'rulebook' ? 'Change my rulebook' : l.kind === 'target' ? 'Change my targets' : 'Use it'}</Btn>
            </Lesson>
          ))}
          {(data?.accepted || []).map((l) => (
            <Lesson key={l.id} l={l}><Btn kind="text" icon="close" busy={busy === `l${l.id}`} onClick={() => decide(l.id, 'retire')}>Stop using it</Btn></Lesson>
          ))}
          {!data?.suggestions?.length && !data?.accepted?.length && (
            <div className="rpb-lesson"><span className="scope">None yet</span><p>Plans use the standard model. Lessons come once the same thing shows up again: {data?.minRuns?.route ?? 2} runs on a route, {data?.minRuns?.profile ?? 3} of a kind or {data?.minRuns?.general ?? 4} overall. Nothing changes your plans until you say so.</p></div>
          )}
        </div>
      </section>

      {/* how well the plans predict */}
      <section className="rpb-card rpb-chartcard">
        <div className="hd"><h3>How well the plans predict</h3></div>
        {!acc.length ? <p className="muted">No runs with a sent plan and glucose yet.</p> : (
          <div className="rpb-accuracy">
            <svg className="accring" viewBox="0 0 100 100" role="img" aria-label={`${avg}% on average`}>
              <circle cx="50" cy="50" r="42" className="bgr" />
              <circle cx="50" cy="50" r="42" className={`fg ${tone(avg)}`} pathLength="100" strokeDasharray={`${avg} 100`} transform="rotate(-90 50 50)" />
              <text x="50" y="57" textAnchor="middle">{avg}%</text>
            </svg>
            <div className="txt">
              <p><b>{avg}%</b> of your readings were within 1 mmol/L of the plan, on average over {acc.length} run{acc.length === 1 ? '' : 's'}. As lessons are taken on it should climb.</p>
              <div className="abars">
                {acc.slice(-8).map((r) => (
                  <span key={r.id} className="abar" title={`${r.routeName || r.name}: ${r.pct}%, average gap ${r.mae} mmol/L`}>
                    <b>{r.pct}%</b><i className={tone(r.pct)} style={{ height: `${Math.max(6, r.pct * 0.7)}px` }} /><small>{String(r.day).slice(5).split('-').reverse().join('/')}</small>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* every run looked back on, with the plan against what really happened */}
      {looked.length > 0 && (
        <section>
          <h3 className="rpb-h3">Your runs</h3>
          <div className="rpb-runs">
            {looked.map((r) => {
              const pct = accByActivity.get(r.activityId);
              return (
                <button key={r.activityId} type="button" className={`rpb-card rpb-runcard sl ${openId === r.activityId ? 'sel' : ''}`} onClick={() => onOpenRun(r.activityId)}>
                  <span className="top">
                    <span className="txt"><b>{r.status === 'matched' ? r.routeName || r.name : r.name}</b><span className="muted">{dayWord(r.day)} · {dist(r.km, u, 2)} {u} · {r.minutes} min</span></span>
                    {pct != null && <span className={`pct ${tone(pct)}`}>{pct}%</span>}
                  </span>
                  <Trace activityId={r.activityId} call={call} />
                  <span className="muted small">{r.status === 'matched' ? 'Run with your plan' : 'Looked at as the route you ran'}. Dashed: the plan, solid: real.</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* the rest, folded away */}
      <div className="rpb-folds">
        {waiting.length > 0 && (
          <details className="rpb-fold"><summary><Icon n="link" size={20} /><span>Plans waiting for their run ({waiting.length})</span><Icon n="down" size={22} /></summary>
            <div className="fb">
              {waiting.map((x) => (
                <div key={x.id} className="rpb-runrow">
                  <span className="txt"><b>{x.routeName || 'Run'}</b><span className="muted">{x.day || when(x.startedAt || x.createdAt)} · {STATUS[x.status] || x.status}</span></span>
                  <Btn kind="tonal" icon="link" onClick={() => setMatching(x)}>Match to a run</Btn>
                </div>
              ))}
            </div>
          </details>
        )}
        {data?.postRun?.overall?.runs > 0 && (
          <details className="rpb-fold"><summary><Icon n="chart" size={20} /><span>After your runs: the rise</span><Icon n="down" size={22} /></summary>
            <div className="fb">
              <p>From {data.postRun.overall.runs} run{data.postRun.overall.runs === 1 ? '' : 's'}: glucose typically rose <b>{data.postRun.overall.rise} mmol/L</b> after the finish, highest about <b>{data.postRun.overall.peakAt} min</b> after (around {data.postRun.overall.peak}).</p>
              {data.postRun.overall.units ? <Banner tone="warn" title={`Correction estimate: about ${data.postRun.overall.units.conservative} u`}>A full correction would be {data.postRun.overall.units.full} u at your sensitivity of {data.postRun.overall.units.isf}. {data.postRun.caveat}</Banner>
                : <p className="muted">A correction estimate appears once {data.postRun.needRuns} runs show a typical rise of 2 mmol/L or more.</p>}
            </div>
          </details>
        )}
        {data?.refuel && (
          <details className="rpb-fold"><summary><Icon n="food" size={20} /><span>Refuelled since your last run? {data.refuel.eatenG} of {data.refuel.targetG} g</span><Icon n="down" size={22} /></summary>
            <div className="fb"><p>{data.refuel.text}</p><p className="muted">The run used about {data.refuel.usedG} g ({data.refuel.run.km} km, {data.refuel.run.intensity}); everyday need is about 3 g per kg a day. {data.refuel.note}</p></div>
          </details>
        )}
        {data?.profiles?.length > 0 && (
          <details className="rpb-fold"><summary><Icon n="tune" size={20} /><span>Kinds of run so far</span><Icon n="down" size={22} /></summary>
            <div className="fb"><div className="chips wrap">{data.profiles.map((p) => <span key={p.key} className="tag">{p.label} · {p.runs} run{p.runs === 1 ? '' : 's'}{p.medianEffective != null ? ` · uptake ${p.medianEffective >= 1 ? '+' : ''}${Math.round((p.medianEffective - 1) * 100)}%` : ''}</span>)}</div></div>
          </details>
        )}
        <details className="rpb-fold"><summary><Icon n="info" size={20} /><span>How learning works</span><Icon n="down" size={22} /></summary>
          <div className="fb"><p>Each plan you send or save keeps its fuelling. After the run, IMS matches it to your Strava activity and glucose, replays the plan with what really happened and measures where the planner was wrong. When the same thing shows up again, it's suggested here. Nothing changes your plans until you accept it. Lessons that would mean fewer carbs need an extra run and no lows. Lessons that hold across routes are offered to your rulebook too.</p></div>
        </details>
      </div>

      {/* match a waiting plan to a Strava run */}
      <Sheet open={Boolean(matching)} onClose={() => setMatching(null)} title={`Match ${matching?.routeName || 'the plan'} to a run`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!data?.unlinkedActivities?.length ? (
            <><p className="muted">No recent Strava runs waiting to be matched.</p><Btn kind="tonal" icon="sync" onClick={() => load(true)}>Check Strava</Btn></>
          ) : data.unlinkedActivities.map((x) => (
            <div key={x.id} className="rpb-card rpb-runrow">
              <span className="txt"><b>{x.name}</b><span className="muted">{x.day || when(Date.parse(x.start_utc))} · {x.distance ? dist(x.distance / 1000, u, 1) : '–'} {u} · {Math.round((x.elapsed_time || x.moving_time || 0) / 60)} min</span></span>
              <Btn icon="link" busy={busy === 'link'} onClick={() => link(matching.id, x.id)}>This one</Btn>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
