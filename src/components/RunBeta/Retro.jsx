// Run planner: plan against reality - a run looked back on, in the same design as the plan (24 Oct, Simon:
// "make sure these changes are reflected in the Plan against reality chart too"). The run as a track with the
// plan's glucose (dashed) against your real glucose, what you took as solid pills and any planned stop you didn't
// take outlined; then stop by stop, planned against what happened, each one correctable (taken or skipped, the
// minute, the grams - corrections go to the carb log and Nightscout, as on the classic page); then what the run
// went well, what to watch, what it teaches; how it felt and your notes. The same /api/planner/retro requests.
import React, { useCallback, useEffect, useState } from 'react';
import { Icon, IconButton, Btn, TextField, Slider, Segmented, Menu, useMenu } from '../HomebrewBeta/ui';
import { dist } from '../../utils/units';
import { RetroTrack } from './Timeline';
import { Banner } from './PlanSection';
import { printRunReport } from '../Dashboard/RunPlanner/printRunReport';
import PostRunReviewPanel from '../Dashboard/RunPlanner/PostRunReviewPanel';
import { SavedPlanModal } from '../Dashboard/RunPlanner/SavedPlans';

const EFFORT_WORDS = ['', 'very easy', 'easy', 'moderate', 'somewhat hard', 'hard', 'hard', 'very hard', 'very hard', 'very, very hard', 'flat out'];
const near = (series, m, tol = 3) => { let best = null; for (const [x, bg] of series || []) if (Math.abs(x - m) <= tol && (best == null || Math.abs(x - m) < Math.abs(best[0] - m))) best = [x, bg]; return best ? best[1] : null; };
const kmAt = (ele, m) => { if (!ele?.length) return null; let best = ele[0]; for (const e of ele) { if (e[0] > m) break; best = e; } return best[1]; };
const paceStr = (p) => (p ? `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, '0')}` : '–');

export default function Retro({ activityId, rp, dark, onBack, backIcon = 'back' }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState({ minute: '', text: '' });
  const [extra, setExtra] = useState({ minute: '', grams: '' });
  const [effortDraft, setEffortDraft] = useState(null);
  const [showPlan, setShowPlan] = useState(false);
  const { call, send } = rp;
  const more = useMenu();
  // look at the run again as it was planned, or as the route you really ran (the classic Redo and Ran a different route?)
  const redo = async (unlinkPlan) => {
    if (unlinkPlan && !window.confirm('Look at this run as the route you really ran? It will stop counting as the run for your plan.')) return;
    setBusy(true); setError(null);
    try { await send(`/api/planner/runs/${activityId}/review`, 'POST', { unlinkPlan }); await load(true); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const u = rp.units;

  const load = useCallback(async (refresh = false) => {
    if (!activityId) return;
    setBusy(true); setError(null);
    try { const d = await call(`/api/planner/retro/${activityId}${refresh ? '?refresh=1' : ''}`); setData(d); if (d.error) setError(d.error); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }, [activityId, call]);
  useEffect(() => { setData(null); load(); }, [load]);
  const act = async (fn) => { setBusy(true); try { await fn(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } };

  const a = data?.analysis;
  const s = data?.session;
  const intakes = data?.intakes || [];
  const notes = data?.notes || [];
  const effort = effortDraft ?? s?.effort ?? null;
  const saveEffort = (v) => { setEffortDraft(null); act(() => send(`/api/planner/retro/sessions/${s.id}/effort`, 'PUT', { effort: v })); };
  const patch = (it, body) => act(() => send(`/api/planner/retro/intakes/${it.id}`, 'PATCH', body));

  const title = a?.run ? a.run.name : 'Your run';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="topbar">
        <IconButton icon={backIcon} label={backIcon === 'close' ? 'Close' : 'Back'} onClick={onBack} />
        <span className="title">{title}</span>
        <IconButton icon="sync" label="Work it out again" onClick={() => load(true)} disabled={busy} />
        <IconButton icon="print" label="Print or save as PDF" onClick={() => printRunReport({ call, routeId: s?.routeId || a?.routeId || null, retro: data, units: u })} />
        <IconButton icon="more" label="More" onClick={more.show} aria-haspopup="menu" />
        <Menu anchor={more.anchor} open={more.open} onClose={more.close} items={[
          { label: 'Look at it again from the start', icon: 'sync', onClick: () => redo(false) },
          { label: 'I ran a different route', icon: 'route', onClick: () => redo(true) },
        ]} />
      </div>
      <div className="scroll">
        <div className="gutter rpb-plan" style={{ paddingBottom: 40 }}>
          {!data && busy && <p className="muted">Lining the run up with your plan and glucose…</p>}
          {error && <Banner tone="warn" title="Something didn't work">{error}</Banner>}
          {a && !a.available && <Banner tone="info" title="Nothing to compare yet">{a.reason}</Banner>}
          {a?.available && (
            <>
              <div className="props">
                <span className="tag">{new Date(`${a.run.day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="tag">{dist(a.run.km, u, 2)} {u}</span>
                <span className="tag">{a.run.minutes} min</span>
                {a.routeName && <span className="tag quiet">{a.routeName}</span>}
                {a.profile && <span className="tag quiet">{a.profile.label}</span>}
              </div>
              <div className="rpb-stats">
                <div className={`rpb-stat ${a.accuracy?.pct >= 80 ? 'ok' : a.accuracy?.pct >= 50 ? '' : 'low'}`}><span className="k"><Icon n="chart" size={16} />The plan was right</span><span className="v">{a.accuracy ? <>{a.accuracy.pct}<small>%</small></> : '–'}</span>
                  <span className="s">{a.accuracy ? `of readings within 1 mmol/L. On average ${a.accuracy.bias > 0 ? `${a.accuracy.bias} lower than planned` : a.accuracy.bias < 0 ? `${-a.accuracy.bias} higher than planned` : 'on the line'}` : 'No plan to compare'}</span></div>
                <div className={`rpb-stat ${a.stats.lowest != null && a.stats.lowest < a.floor ? 'low' : 'ok'}`}><span className="k"><Icon n="blood" size={16} />Glucose</span>
                  <span className="v">{a.stats.start ?? '–'}<span className="to">→</span>{a.stats.lowest ?? '–'}<span className="to">→</span>{a.stats.end ?? '–'}</span>
                  <span className="s">Start, lowest{a.stats.lowestAt != null ? ` (at ${a.stats.lowestAt} min)` : ''}, finish. Lowest in the 2 hours after: {a.stats.postLowest ?? '–'}</span></div>
                <div className="rpb-stat"><span className="k"><Icon n="run" size={16} />Pace</span><span className="v">{paceStr(a.run.pace)}<small>/km</small></span><span className="s">{a.run.plannedPace ? `Planned ${paceStr(a.run.plannedPace)} /km` : ''}</span></div>
                <div className="rpb-stat"><span className="k"><Icon n="school" size={16} />For learning</span><span className="v" style={{ fontSize: 22 }}>{a.quality === 'good' ? `${a.fit.effective >= 1 ? '+' : ''}${Math.round((a.fit.effective - 1) * 100)}%` : 'Not used'}</span><span className="s">{a.quality === 'good' ? 'Your exercise uptake against the model' : 'Too unclear to learn from'}</span></div>
              </div>

              <section className="rpb-card rpb-chartcard">
                <div className="hd"><h3>The run, planned and real</h3><span className="grow" />
                  {s?.kind === 'live' && s.plan && <Btn kind="text" icon="open" onClick={() => setShowPlan(true)}>The plan you ran with</Btn>}</div>
                <RetroTrack a={a} intakes={intakes} units={u} />
              </section>

              {/* stop by stop: planned against what happened, correctable */}
              <section className="rpb-card rpb-chartcard">
                <div className="hd"><h3>Stop by stop</h3><span className="muted">Mark each stop taken or skipped. Corrections go to your carb log and Nightscout.</span></div>
                <div className="rpb-moments">
                  {[...intakes].sort((x, y) => (x.planned_minute ?? x.minute ?? 0) - (y.planned_minute ?? y.minute ?? 0)).map((it, n, list) => {
                    const m = it.action === 'taken' && it.minute != null ? it.minute : it.planned_minute ?? it.minute ?? 0;
                    const planned = near(a.planned, m), real = near(a.actual, m, 5);
                    const next = list[n + 1];
                    const lowNext = Math.min(...(a.actual || []).filter((p) => p[0] >= m && p[0] <= (next ? (next.planned_minute ?? next.minute ?? m) : a.run.durationMin)).map((p) => p[1]));
                    const seg = !Number.isFinite(lowNext) ? 'ok' : lowNext < a.floor ? 'low' : lowNext < a.floor + 1 ? 'near' : 'ok';
                    const km = kmAt(a.elevation, m);
                    return (
                      <div key={it.id} className={`mo ${it.planned_g ? 'stop' : 'stop'}`}>
                        <div className="mt"><b>{m === 0 ? 'Start' : `${Math.round(m)} min`}</b><small>{m > 0 && km != null ? `${dist(km, u, 1)} ${u}` : 'before you go'}</small></div>
                        <div className={`mrail ${seg}`}><i /></div>
                        <div className="mbd">
                          <div className={`ev ${it.action === 'skipped' ? 'quiet' : ''}`}>
                            <span className="mamt">{it.action === 'taken' && it.grams ? it.grams : it.planned_g || it.grams || 0}<small>g</small></span>
                            <span className="mwhat">{it.planned_minute != null ? `Planned ${it.planned_g ? `${it.planned_g} g` : `${it.planned_ml} ml`} at ${it.planned_minute === 0 ? 'the start' : `${it.planned_minute} min`}` : 'Extra, not in the plan'}{it.source === 'phone' ? '. From your phone' : ''}</span>
                            <span className="med">
                              <Segmented label="Taken or skipped" value={it.action || ''} onChange={(val) => patch(it, { action: val || null })} options={[['taken', 'Taken'], ['skipped', 'Skipped']]} />
                              {it.planned_minute == null && <IconButton icon="del" label="Remove" onClick={() => act(() => send(`/api/planner/retro/intakes/${it.id}`, 'DELETE'))} />}
                            </span>
                          </div>
                          {it.action === 'taken' && (
                            <div className="rpb-acts start" style={{ alignItems: 'center' }}>
                              <label className="mmin rpb-inline">at <input type="number" defaultValue={it.minute != null ? Math.round(it.minute) : ''} key={`m${it.minute}`} onBlur={(e) => e.target.value !== '' && Number(e.target.value) !== Math.round(it.minute) && patch(it, { minute: Number(e.target.value) })} aria-label="Minute you took it" /> min</label>
                              <label className="mmin rpb-inline"><input type="number" defaultValue={it.grams ?? ''} key={`g${it.grams}`} onBlur={(e) => e.target.value !== '' && Number(e.target.value) !== it.grams && patch(it, { grams: Number(e.target.value) })} aria-label="Grams you took" /> g</label>
                            </div>
                          )}
                          <span className="mgl">{planned != null ? `Planned glucose ${planned}` : ''}{planned != null && real != null ? ', ' : ''}{real != null ? `real ${real}` : ''}</span>
                        </div>
                      </div>
                    );
                  })}
                  {!intakes.length && <p className="muted">Nothing recorded for this run.</p>}
                </div>
                <div className="rpb-acts start" style={{ alignItems: 'flex-end', marginTop: 8 }}>
                  <TextField label="Minute" type="number" inputMode="numeric" value={extra.minute} onChange={(v) => setExtra({ ...extra, minute: v })} style={{ width: 110 }} />
                  <TextField label="Grams" type="number" inputMode="numeric" value={extra.grams} onChange={(v) => setExtra({ ...extra, grams: v })} style={{ width: 110 }} />
                  <Btn kind="tonal" icon="add" disabled={!s || extra.minute === '' || !extra.grams} onClick={() => act(async () => { await send(`/api/planner/retro/sessions/${s.id}/intakes`, 'POST', { minute: Number(extra.minute), grams: Number(extra.grams) }); setExtra({ minute: '', grams: '' }); })}>Add something you took</Btn>
                </div>
              </section>

              {/* what it teaches */}
              {[['good', 'What went well', 'good'], ['watch', 'What to watch', 'warn'], ['learn', 'What it teaches', 'info']].map(([k, t, tone]) => a.findings[k].length > 0 && (
                <Banner key={k} tone={tone} icon={k === 'learn' ? 'school' : undefined} title={t}>{a.findings[k].join(' ')}</Banner>
              ))}
            </>
          )}

          {s && (
            <section className="rpb-card rpb-chartcard">
              <div className="hd"><h3>How it felt</h3></div>
              <div className="rpb-acts start" style={{ alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <Slider label="How hard it felt, 1 to 10" value={effort ?? 5} min={1} max={10} onChange={(v) => setEffortDraft(v)} lo="Very easy" hi="Flat out" />
                </div>
                <b style={{ minWidth: 130 }}>{effort == null ? <span className="muted">Not set</span> : `${effort}/10, ${EFFORT_WORDS[effort]}`}</b>
                {effortDraft != null && <Btn kind="tonal" onClick={() => saveEffort(effortDraft)}>Save</Btn>}
              </div>
              <div className="hd" style={{ marginTop: 12 }}><h3>Your notes</h3></div>
              {!notes.length && <p className="muted">No notes yet, for example "felt tired halfway and had to slow down". You can also tell Ims after a run.</p>}
              <div className="rpb-notes">
                {notes.map((n) => (
                  <div key={n.id} className="rpb-note"><b>{n.minute != null ? `${Math.round(n.minute)} min` : 'The whole run'}</b><span>{n.text}</span><IconButton icon="del" label="Delete this note" onClick={() => act(() => send(`/api/planner/retro/notes/${n.id}`, 'DELETE'))} /></div>
                ))}
              </div>
              <div className="rpb-acts start" style={{ alignItems: 'flex-end', marginTop: 8 }}>
                <TextField label="Minute (or leave blank)" type="number" inputMode="numeric" value={note.minute} onChange={(v) => setNote({ ...note, minute: v })} style={{ width: 170 }} />
                <TextField label="What happened, how it felt" value={note.text} onChange={(v) => setNote({ ...note, text: v })} style={{ flex: 1, minWidth: 220 }} />
                <Btn kind="tonal" icon="add" disabled={!note.text.trim()} onClick={() => act(async () => { await send(`/api/planner/retro/sessions/${s.id}/notes`, 'POST', { minute: note.minute === '' ? null : Number(note.minute), text: note.text.trim() }); setNote({ minute: '', text: '' }); })}>Add note</Btn>
              </div>
            </section>
          )}

          {/* the next day or two after the run */}
          <div className="rpb-legacy"><PostRunReviewPanel activityId={activityId} isDark={dark} /></div>
        </div>
      </div>
      {showPlan && s?.id && <div className="rpb-legacy"><SavedPlanModal sessionId={s.id} isDark={dark} units={u} onClose={() => setShowPlan(false)} /></div>}
    </div>
  );
}
