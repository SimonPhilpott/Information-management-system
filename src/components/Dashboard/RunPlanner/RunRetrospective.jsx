import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Lightbulb, StickyNote, Trash2, Plus, RotateCw, Cookie, Printer } from 'lucide-react';
import RetroChart from './RetroChart';
import { SavedPlanModal } from './SavedPlans';
import { printRunReport } from './printRunReport';

// Borg CR10 words for how hard a run felt
const EFFORT_WORDS = ['', 'very easy', 'easy', 'moderate', 'somewhat hard', 'hard', 'hard', 'very hard', 'very hard', 'very, very hard', 'flat out'];

// The run retrospective: what you planned against what happened. Your real glucose (coloured by your bands),
// the plan's predicted line, and the planner's model replayed with what you actually took (and, where it
// fits better, with the uptake this run showed). Carb stops as planned (faint) and as taken (solid), your
// notes pinned to the minute, then what the run teaches. Corrections here (a stop taken late, an extra gel)
// go to the carb log and Nightscout and re-run the analysis.

export default function RunRetrospective({ activityId, isDark, call, send, units = 'km', hideChart = false }) {
  const [effortDraft, setEffortDraft] = useState(null);
  const [showPlan, setShowPlan] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState({ minute: '', text: '' });
  const [extra, setExtra] = useState({ minute: '', grams: '' });

  const load = useCallback(async (refresh = false) => {
    if (!activityId) return;
    setBusy(true); setError(null);
    try { const d = await call(`/api/planner/retro/${activityId}${refresh ? '?refresh=1' : ''}`); setData(d); if (d.error) setError(d.error); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }, [activityId, call]);
  useEffect(() => { setData(null); load(); }, [load]);

  const act = async (fn) => { setBusy(true); try { await fn(); await load(); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  const muted = isDark ? 'text-slate-400' : 'text-[#6A645D]';
  const card = `rounded-xl border p-4 text-xs ${isDark ? 'border-white/10 bg-slate-950/30' : 'border-[#2E2B27]/10 bg-white'}`;
  const input = `px-2 py-1 rounded-lg border text-xs ${isDark ? 'bg-slate-900 border-white/10 text-slate-100' : 'bg-[#FAF7F2] border-[#2E2B27]/15'}`;
  const small = `px-2 py-1 rounded-lg text-[11px] font-bold border ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-[#2E2B27]/15 hover:bg-[#F4EFE6]'}`;

  const a = data?.analysis;
  const s = data?.session;
  const intakes = data?.intakes || [];
  const notes = data?.notes || [];
  const effort = effortDraft ?? s?.effort ?? null;
  const saveEffort = (v) => { setEffortDraft(null); act(() => send(`/api/planner/retro/sessions/${s.id}/effort`, 'PUT', { effort: v })); };

  if (!activityId) return null;
  if (!data && busy) return <div className={`${card} ${muted}`}>Lining the run up with your plan and glucose...</div>;
  if (!data) return error ? <div className={card}>{error}</div> : null;

  return (
    <div className="flex flex-col gap-4">
      {showPlan && s?.id && <SavedPlanModal sessionId={s.id} isDark={isDark} units={units} onClose={() => setShowPlan(false)} />}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <div className="font-black uppercase tracking-wider text-[11px]">Plan against reality{a?.run ? `: ${a.run.name}, ${a.run.day}` : ''}</div>
            <div className={`text-[11px] ${muted}`}>
              {s?.kind === 'live' ? `The dashed line is the plan's prediction as sent at ${s.createdAt ? new Date(s.createdAt).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }) : '?'}${s.plan ? ` (start ${s.plan.startBg}, ${s.plan.iob} U on board, ${s.plan.stops.map((x) => `${x.grams} g at ${x.minute === 0 ? 'the start' : `${x.minute} min`}`).join(', ')})` : ''} - your real glucose is the bold line.` : 'Not sent from the planner, so there\'s no plan to compare timings with - your carbs come from the carb log. Add anything else you took below.'}
              {a?.profile ? ` Kind of run: ${a.profile.label}.` : ''}
            </div>
          </div>
          <span className="flex gap-2">
            {s?.kind === 'live' && s.plan && <button onClick={() => setShowPlan(true)} className={small}>Open the plan you ran with</button>}
            <button onClick={() => printRunReport({ call, routeId: s?.routeId || a?.routeId || null, retro: data, units })} className={small} title="Opens a printable report - choose Save as PDF in the print dialogue"><Printer size={12} className="inline mr-1" />Print / PDF</button>
            <button onClick={() => load(true)} disabled={busy} className={small}><RotateCw size={12} className={`inline mr-1 ${busy ? 'animate-spin' : ''}`} />Re-analyse</button>
          </span>
        </div>
        {error && <div className="text-amber-600 mb-2">{error}</div>}
        {a && !a.available && <div className={muted}>{a.reason}</div>}
        {a?.available && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-3">
              {[
                ['Prediction', a.accuracy ? `${a.accuracy.pct}%` : '-', a.accuracy ? `within 1 mmol/L · ${a.accuracy.bias > 0 ? `${a.accuracy.bias} low` : a.accuracy.bias < 0 ? `${-a.accuracy.bias} high` : 'on the line'} on average` : 'no plan to compare'],
                ['Start', a.stats.start != null ? `${a.stats.start}` : '-', 'mmol/L'],
                ['Lowest', a.stats.lowest != null ? `${a.stats.lowest}` : '-', a.stats.lowestAt != null ? `at ${a.stats.lowestAt} min` : ''],
                ['After (2 h)', a.stats.postLowest != null ? `${a.stats.postLowest}` : '-', 'lowest'],
                ['Pace', a.run.pace ? `${Math.floor(a.run.pace)}:${String(Math.round((a.run.pace % 1) * 60)).padStart(2, '0')}` : '-', a.run.plannedPace ? `planned ${Math.floor(a.run.plannedPace)}:${String(Math.round((a.run.plannedPace % 1) * 60)).padStart(2, '0')} per km` : 'per km'],
                ['Model fit', a.quality === 'good' ? `${a.fit.effective >= 1 ? '+' : ''}${Math.round((a.fit.effective - 1) * 100)}%` : 'not used', a.quality === 'good' ? 'exercise uptake vs model' : 'too unclear to learn from'],
              ].map(([k, v, sub]) => (
                <div key={k} className={`rounded-lg border px-3 py-2 ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
                  <div className={`text-[9px] font-bold uppercase tracking-wider ${muted}`}>{k}</div>
                  <div className="text-base font-black tabular-nums">{v}</div>
                  <div className={`text-[10px] ${muted}`}>{sub}</div>
                </div>
              ))}
            </div>
            {!hideChart && <RetroChart a={a} notes={notes} isDark={isDark} units={units} />}
          </>
        )}
      </div>

      {a?.available && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[['good', 'What went well', CheckCircle2, 'text-emerald-500'], ['watch', 'What to watch', AlertTriangle, 'text-amber-500'], ['learn', 'What it teaches', Lightbulb, 'text-sky-500']].map(([k, title, Icon, tone]) => (
            <div key={k} className={card}>
              <div className={`flex items-center gap-2 font-black uppercase tracking-wider text-[10px] mb-2 ${tone}`}><Icon size={14} />{title}</div>
              {a.findings[k].length ? <ul className="flex flex-col gap-1.5">{a.findings[k].map((t) => <li key={t} className="leading-snug">{t}</li>)}</ul> : <div className={muted}>Nothing here this time.</div>}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* what you took: correct anything the phone buttons missed */}
        <div className={card}>
          <div className="flex items-center gap-2 font-black uppercase tracking-wider text-[10px] mb-2"><Cookie size={14} className="text-amber-500" />What you took</div>
          <p className={`mb-2 ${muted}`}>Carbs marked taken are logged to Nightscout as a note at that minute (a record only - AAPS does not count them as carbs). Minutes are from when you started.</p>
          <div className="flex flex-col gap-1.5">
            {intakes.length === 0 && <div className={muted}>Nothing recorded.</div>}
            {intakes.map((it) => (
              <div key={it.id} className="flex flex-wrap items-center gap-2">
                <span className="w-40 shrink-0">{it.planned_minute != null ? `Planned ${it.planned_minute} min` : 'Extra'}{it.planned_g ? ` · ${it.planned_g} g` : ''}{!it.planned_g && it.planned_ml ? ` · ${it.planned_ml} ml` : ''}</span>
                <select value={it.action || ''} onChange={(e) => act(() => send(`/api/planner/retro/intakes/${it.id}`, 'PATCH', { action: e.target.value || null }))} className={input}>
                  <option value="">not recorded</option><option value="taken">taken</option><option value="skipped">skipped</option>
                </select>
                {it.action === 'taken' && (
                  <>
                    <label className="flex items-center gap-1">at <input type="number" defaultValue={it.minute != null ? Math.round(it.minute) : ''} onBlur={(e) => Number(e.target.value) !== Math.round(it.minute) && act(() => send(`/api/planner/retro/intakes/${it.id}`, 'PATCH', { minute: Number(e.target.value) }))} className={`${input} w-16`} /> min</label>
                    <label className="flex items-center gap-1"><input type="number" defaultValue={it.grams ?? ''} onBlur={(e) => Number(e.target.value) !== it.grams && act(() => send(`/api/planner/retro/intakes/${it.id}`, 'PATCH', { grams: Number(e.target.value) }))} className={`${input} w-14`} /> g</label>
                  </>
                )}
                {it.planned_minute == null && <button onClick={() => act(() => send(`/api/planner/retro/intakes/${it.id}`, 'DELETE'))} className={`p-1 ${muted}`} title="Remove"><Trash2 size={12} /></button>}
                {it.source && <span className={`text-[10px] ${muted}`}>{it.source === 'phone' ? 'from your phone' : it.source === 'page' ? 'corrected here' : it.source}</span>}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-dashed border-current/10">
            <span className="font-bold">Add something you took:</span>
            <input type="number" placeholder="min" value={extra.minute} onChange={(e) => setExtra({ ...extra, minute: e.target.value })} className={`${input} w-16`} />
            <input type="number" placeholder="g carbs" value={extra.grams} onChange={(e) => setExtra({ ...extra, grams: e.target.value })} className={`${input} w-20`} />
            <button disabled={!s || extra.minute === '' || !extra.grams} onClick={() => act(async () => { await send(`/api/planner/retro/sessions/${s.id}/intakes`, 'POST', { minute: Number(extra.minute), grams: Number(extra.grams) }); setExtra({ minute: '', grams: '' }); })} className={small}><Plus size={12} className="inline" /> Add</button>
          </div>
        </div>

        {/* how it felt, pinned to the timeline */}
        <div className={card}>
          <div className="flex items-center gap-2 font-black uppercase tracking-wider text-[10px] mb-2"><StickyNote size={14} className="text-indigo-500" />Your notes</div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="font-bold shrink-0">How hard did it feel?</span>
            <div className="flex-1 min-w-[200px]">
              <input type="range" min="1" max="10" step="1" value={effort ?? 5} disabled={!s}
                onChange={(e) => setEffortDraft(Number(e.target.value))}
                onPointerUp={(e) => saveEffort(Number(e.currentTarget.value))} onKeyUp={(e) => saveEffort(Number(e.currentTarget.value))}
                className={`w-full accent-indigo-500 ${effort == null ? 'opacity-40' : ''}`} aria-label="How hard the run felt, 1 to 10" />
              <div className={`flex justify-between text-[10px] ${muted}`}><span>1 very easy</span><span>5 hard</span><span>10 flat out</span></div>
            </div>
            <span className="w-28 shrink-0 font-bold text-indigo-500">{effort == null ? <span className={muted}>not set</span> : `${effort}/10 · ${EFFORT_WORDS[effort]}`}</span>
            {s?.effort != null && <button onClick={() => saveEffort(null)} className={`text-[10px] underline ${muted}`}>clear</button>}
          </div>
          <div className="flex flex-col gap-1.5 mb-2">
            {notes.length === 0 && <div className={muted}>No notes yet - e.g. "felt tired halfway and had to slow down". You can also tell Ims after a run.</div>}
            {notes.map((n) => (
              <div key={n.id} className="flex items-start gap-2">
                <span className="w-14 shrink-0 font-bold">{n.minute != null ? `${Math.round(n.minute)} min` : 'overall'}</span>
                <span className="flex-1">{n.text}</span>
                <button onClick={() => act(() => send(`/api/planner/retro/notes/${n.id}`, 'DELETE'))} className={`p-1 ${muted}`} title="Delete"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="number" placeholder="min" value={note.minute} onChange={(e) => setNote({ ...note, minute: e.target.value })} className={`${input} w-16`} title="Minutes into the run (leave blank for the whole run)" />
            <input placeholder="What happened, how it felt..." value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && note.text.trim() && document.getElementById(`add-note-${activityId}`)?.click()} className={`${input} flex-1 min-w-[180px]`} />
            <button id={`add-note-${activityId}`} disabled={!s || !note.text.trim()} onClick={() => act(async () => { await send(`/api/planner/retro/sessions/${s.id}/notes`, 'POST', { minute: note.minute === '' ? null : Number(note.minute), text: note.text }); setNote({ minute: '', text: '' }); })} className={small}><Plus size={12} className="inline" /> Add note</button>
          </div>
        </div>
      </div>
    </div>
  );
}
