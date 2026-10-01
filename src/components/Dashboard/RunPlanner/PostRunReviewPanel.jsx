import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Droplets, Cookie, Route as RouteIcon, BatteryCharging, ArrowRight, Info } from 'lucide-react';

// The flythrough's retrospective, for a real completed run only: what worked and what to watch from the
// run's own glucose trace, then what the run means for the next day or two, each linked to the page that
// uses it. Nothing is shown for a planned (not yet run) route - there's nothing to look back on.

function List({ items, dot, isDark }) {
  return (
    <div className={`flex flex-col gap-2 text-xs ${isDark ? 'text-slate-300' : 'text-[#2E2B27]'}`}>
      {items.map((t) => <div key={t} className="flex items-start gap-2"><span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${dot}`} /><span>{t}</span></div>)}
    </div>
  );
}

const go = (path) => { window.history.pushState(null, '', path); window.dispatchEvent(new PopStateEvent('popstate')); };

export default function PostRunReviewPanel({ activityId, isDark, onPlanRoute }) {
  // { id, review, error } for the run last fetched - anything for another run counts as still loading
  const [got, setGot] = useState(null);
  useEffect(() => {
    if (!activityId) return undefined;
    let live = true;
    fetch(`/api/strava/activities/${activityId}/post-run`).then((r) => r.json())
      .then((j) => { if (live) setGot({ id: activityId, review: j.success ? j.review : null, error: j.success ? null : (j.error || 'Could not review this run') }); })
      .catch((e) => live && setGot({ id: activityId, review: null, error: e.message }));
    return () => { live = false; };
  }, [activityId]);
  const review = got?.id === activityId ? got.review : null;
  const error = got?.id === activityId ? got.error : null;

  const muted = isDark ? 'text-slate-400' : 'text-[#6A645D]';
  const box = (tone) => `p-4 rounded-xl border ${tone === 'good' ? (isDark ? 'border-emerald-500/20 bg-emerald-950/10' : 'border-emerald-600/30 bg-[#FAF7F2]') : tone === 'warn' ? (isDark ? 'border-amber-500/20 bg-amber-950/10' : 'border-amber-600/30 bg-[#FAF7F2]') : (isDark ? 'border-white/10 bg-slate-950/30' : 'border-[#2E2B27]/10 bg-white')}`;
  const linkBtn = `mt-2 inline-flex items-center gap-1 text-[11px] font-bold ${isDark ? 'text-sky-300 hover:text-sky-200' : 'text-sky-700 hover:text-sky-900'}`;

  if (!activityId) {
    return (
      <div className={`${box()} text-xs flex items-start gap-2 ${muted}`}>
        <Info size={15} className="shrink-0 mt-0.5" />
        <span>The retrospective appears once you've run this route: choose <b>Completed Run Retrospective</b> and pick one of your runs. It's worked out from that run's own glucose trace - nothing is shown for a run that hasn't happened.</span>
      </div>
    );
  }
  if (error) return <div className={`${box('warn')} text-xs`}>{error}</div>;
  if (!review) return <div className={`${box()} text-xs ${muted}`}>Reviewing the run...</div>;
  if (!review.available) return <div className={`${box()} text-xs ${muted}`}>{review.reason}</div>;

  const f = review.followUps;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={box('good')}>
          <div className={`flex items-center gap-2 mb-2 font-bold text-xs uppercase tracking-wider ${isDark ? 'text-emerald-400' : 'text-emerald-800'}`}><CheckCircle2 size={15} /> Retrospective: what worked</div>
          {review.worked.length ? <List isDark={isDark} items={review.worked} dot={isDark ? 'bg-emerald-400' : 'bg-emerald-600'} /> : <p className={`text-xs ${muted}`}>Nothing stood out as going to plan this time.</p>}
        </div>
        <div className={box('warn')}>
          <div className={`flex items-center gap-2 mb-2 font-bold text-xs uppercase tracking-wider ${isDark ? 'text-amber-400' : 'text-amber-800'}`}><AlertTriangle size={15} /> Retrospective: what to watch & refine</div>
          {review.watch.length ? <List isDark={isDark} items={review.watch} dot={isDark ? 'bg-amber-400' : 'bg-amber-600'} /> : <p className={`text-xs ${muted}`}>Nothing to refine - it went as planned.</p>}
        </div>
      </div>

      <div className={box()}>
        <div className="font-bold text-xs uppercase tracking-wider mb-3">After this run - {review.run.name}, {new Date(`${review.run.day}T12:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
          <div>
            <div className="flex items-center gap-1.5 font-bold mb-1"><Droplets size={14} className="text-rose-500" /> Insulin sensitivity</div>
            {f.sensitivity.active && (
              <div className={`h-1.5 rounded-full overflow-hidden mb-1.5 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} title={`${f.sensitivity.percentLeft}% of the 48-hour window left`}>
                <div className="h-full bg-gradient-to-r from-rose-500 to-amber-400" style={{ width: `${f.sensitivity.percentLeft}%` }} />
              </div>
            )}
            <p className={muted}>{f.sensitivity.active ? `${f.sensitivity.percentLeft}% of the raised window left. ` : 'Back to normal now. '}{f.sensitivity.text}</p>
            <button onClick={() => go(f.sensitivity.link.path)} className={linkBtn}>{f.sensitivity.link.label} <ArrowRight size={11} /></button>
          </div>
          <div>
            <div className="flex items-center gap-1.5 font-bold mb-1"><Cookie size={14} className="text-amber-500" /> Refuel - {f.glycogen.grams} g</div>
            <p className={muted}>{f.glycogen.text}</p>
            <button onClick={() => go(f.glycogen.link.path)} className={linkBtn}>{f.glycogen.link.label} <ArrowRight size={11} /></button>
          </div>
          <div>
            <div className="flex items-center gap-1.5 font-bold mb-1"><RouteIcon size={14} className="text-emerald-500" /> Next time</div>
            <p className={muted}>{f.nextPlan?.text || 'The planner could not model this run.'}</p>
            {f.nextPlan?.link?.routeId
              ? <button onClick={() => onPlanRoute?.(f.nextPlan.link.routeId)} className={linkBtn}>{f.nextPlan.link.label} <ArrowRight size={11} /></button>
              : null}
          </div>
        </div>
        {f.recovery && (
          <div className={`mt-3 pt-3 border-t text-xs flex items-center gap-2 ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
            <BatteryCharging size={14} className={f.recovery.inRecovery ? 'text-amber-500' : 'text-emerald-500'} />
            <span>{f.recovery.inRecovery ? `Training load: recovering - ${f.recovery.percent}% recovered, about ${f.recovery.daysLeft} days to go.` : 'Training load: fully recovered.'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
