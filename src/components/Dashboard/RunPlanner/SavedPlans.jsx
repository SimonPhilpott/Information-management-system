import React, { useEffect, useState } from 'react';
import { X, History, Eye } from 'lucide-react';
import RunPlanChart from './RunPlanChart';

// Plans as they were sent to the phone, kept against the route: open one to see its chart exactly as it was
// (the line, the carb stops, the water, the course). Plans sent before charts were kept are redrawn from what
// was saved - the same inputs, stops and predicted line - and say so.

const when = (ms) => (ms ? new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const getJson = async (url) => { const r = await fetch(url, { credentials: 'same-origin' }); const j = await r.json(); if (!r.ok || j.success === false) throw new Error(j.error || 'Could not load the plan'); return j; };

export function SavedPlanModal({ sessionId, isDark, units = 'km', onClose }) {
  const [got, setGot] = useState(null);
  useEffect(() => {
    let live = true;
    getJson(`/api/planner/plans/${sessionId}`).then((j) => live && setGot(j)).catch((e) => live && setGot({ error: e.message }));
    return () => { live = false; };
  }, [sessionId]);
  const c = got?.chart;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className={`w-full max-w-5xl rounded-2xl border p-4 mt-8 ${isDark ? 'bg-slate-900 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/10 text-[#2E2B27]'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="font-black uppercase tracking-wider text-[11px]">The plan you ran with{got?.routeName ? `: ${got.routeName}` : ''}</div>
            {c && <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>
              Sent {when(got.createdAt)}{got.startedAt ? ` · started ${when(got.startedAt)}` : ''} · start glucose {c.inputs?.startBg}, {c.inputs?.iob} U on board · {c.plan.stops.map((s) => `${s.grams} g at ${s.minute === 0 ? 'the start' : `${s.minute} min`}`).join(', ')} · predicted lowest {c.plan.predicted?.minDuring}
              {got.redrawn ? ' · redrawn from what was saved (plans sent before 2 October kept the line and stops, not the whole chart)' : ''}
            </div>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5" title="Close"><X size={16} /></button>
        </div>
        {!got && <div className="text-xs py-10 text-center opacity-60">Loading the plan...</div>}
        {got?.error && <div className="text-xs text-amber-600">{got.error}</div>}
        {c && <RunPlanChart plan={c} isDark={isDark} units={units} />}
      </div>
    </div>
  );
}

export function SavedRoutePlans({ routeId, isDark, units = 'km', card, muted, refreshKey = 0 }) {
  const [plans, setPlans] = useState([]);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (!routeId) return undefined;
    let live = true;
    getJson(`/api/planner/routes/${routeId}/plans`).then((j) => live && setPlans(j.plans || [])).catch(() => live && setPlans([]));
    return () => { live = false; };
  }, [routeId, refreshKey]);
  if (!routeId || !plans.length) return null;
  const label = { linked: 'run done', started: 'under way', scheduled: 'sent', armed: 'waiting for Start', cancelled: 'cancelled', no_run: 'no run found' };
  return (
    <div className={card}>
      <div className="flex items-center gap-2 font-black uppercase tracking-wider text-[10px] mb-2"><History size={13} />Plans you've sent for this route</div>
      <div className="flex flex-col divide-y divide-current/5">
        {plans.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5">
            <span className="w-44 shrink-0 font-bold">{when(p.startedAt || p.createdAt)}</span>
            <span className="flex-1 min-w-[180px]">start {p.startBg}, {p.iob} U · {p.stops.map((s) => `${s.grams} g at ${s.minute === 0 ? 'start' : `${s.minute} min`}`).join(', ')} · lowest {p.lowest}</span>
            <span className={muted}>{label[p.status] || p.status}{p.accuracy ? ` · prediction ${p.accuracy.pct}% accurate` : ''}</span>
            <button onClick={() => setOpen(p.id)} className={`px-2 py-0.5 rounded-lg font-bold border flex items-center gap-1 ${isDark ? 'border-white/15' : 'border-[#2E2B27]/20'}`}><Eye size={11} />Open</button>
          </div>
        ))}
      </div>
      {open && <SavedPlanModal sessionId={open} isDark={isDark} units={units} onClose={() => setOpen(null)} />}
    </div>
  );
}
