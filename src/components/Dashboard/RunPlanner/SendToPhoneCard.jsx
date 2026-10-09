import React, { useEffect, useState } from 'react';
import { Smartphone, RotateCw, Trash2, Check, Download, BookmarkCheck } from 'lucide-react';

// Send to my phone: one button. IMS pushes a "Ready when you are" notification (ntfy) with Start run, Open route
// and Cancel; tapping Start run as you set off starts the plan, and every carb and water reminder is pushed at its
// minute from then, with Taken / Skipped buttons. Push notifications are the only way reminders go now - calendar
// and Tasker alerts are switched off. The ntfy set-up (topic, sound or vibrate) is kept as it is.
// Users can also choose "Save plan only" to record the planned run in IMS without sending phone notifications.

export default function SendToPhoneCard({ plan, isDark, card, muted, onChange = null }) {
  const [info, setInfo] = useState(null); // { armed, sent, settings }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const routeId = plan.inputs?.routeId || null;

  const loadInfo = () => fetch('/api/planner/alerts').then((r) => r.json()).then((j) => {
    if (!j.success) return;
    setInfo(j);
    // push only: make sure calendar and Tasker alerts are off and push is on
    const st = j.settings || {};
    if (!st.push || st.calendar || st.tasker) {
      fetch('/api/planner/alerts/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ push: true, calendar: false, tasker: false }) }).catch(() => {});
    }
  }).catch(() => {});
  useEffect(() => { loadInfo(); }, []);
  useEffect(() => {
    if (!routeId) return undefined;
    let live = true;
    fetch(`/api/planner/routes/${routeId}`).then((r) => r.json()).then((j) => { if (live && j.success) setRouteInfo(j.route); }).catch(() => {});
    return () => { live = false; };
  }, [routeId]);
  const komoot = routeInfo?.source === 'komoot' && routeInfo.externalId;

  // carb stops with their water, plus water-only drinks, by minute
  const stops = () => {
    const by = new Map();
    for (const s of plan.plan.stops || []) by.set(s.minute, { minute: s.minute, km: s.km, grams: s.grams, ml: s.fluidMl || 0, withCarbs: true });
    for (const d of plan.drinks || []) if (!by.has(d.minute)) by.set(d.minute, { minute: d.minute, km: d.km, grams: 0, ml: d.ml, withCarbs: false });
    return [...by.values()].sort((a, b) => a.minute - b.minute);
  };
  // the whole plan as sent - chart series included - so it can be shown again exactly as it was
  const snapshot = () => {
    const { startScenarios, iobScenarios, sources, guideline, demand, weather, ...rest } = plan; // eslint-disable-line no-unused-vars
    return { ...rest, weather: weather?.current ? { current: weather.current } : null };
  };

  const send = async () => {
    setBusy(true); setError(null); setSavedSuccess(false);
    try {
      const j = await (await fetch('/api/planner/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        startMode: 'tap', routeId, routeName: plan.inputs?.routeName || `${plan.run.distanceKm} km run`, durationMin: plan.run.durationMin,
        stops: stops(), postCarbs: plan.plan.postCarbs || 0, plan: snapshot(),
      }) })).json();
      if (!j.success) throw new Error(j.error || 'Could not send');
      setInfo((i) => ({ ...i, sent: null, armed: { name: j.armed.name, armedAt: Date.now() } }));
      onChange?.();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const savePlanOnly = async () => {
    setBusy(true); setError(null); setSavedSuccess(false);
    try {
      const j = await (await fetch('/api/planner/sessions/save-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeId,
          routeName: plan.inputs?.routeName || `${plan.run.distanceKm} km run`,
          durationMin: plan.run.durationMin,
          stops: stops(),
          postCarbs: plan.plan.postCarbs || 0,
          plan: snapshot(),
        })
      })).json();
      if (!j.success) throw new Error(j.error || 'Could not save plan');
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 6000);
      onChange?.();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const clear = async () => {
    setBusy(true);
    try { await fetch('/api/planner/alerts', { method: 'DELETE' }); setInfo((i) => ({ ...i, sent: null, armed: null })); onChange?.(); } finally { setBusy(false); }
  };

  const armed = info?.armed;
  return (
    <div className={`${card} flex flex-wrap items-center gap-3`}>
      <button onClick={send} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-black flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-sm active:scale-95 disabled:opacity-50">
        {busy ? <RotateCw size={15} className="animate-spin" /> : <Smartphone size={15} />} {armed ? 'Send to my phone again' : 'Send to my phone'}
      </button>
      <button onClick={savePlanOnly} disabled={busy} className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border active:scale-95 disabled:opacity-50 ${isDark ? 'border-white/15 hover:bg-white/5 text-slate-200' : 'border-[#2E2B27]/20 hover:bg-[#F4EFE6] text-[#2E2B27]'}`} title="Save this plan to IMS history without sending phone alerts. You can match it to your Strava run anytime in the Learning tab.">
        <BookmarkCheck size={14} className="text-sky-500" /> Save plan only
      </button>
      <div className="flex-1 min-w-[220px] text-[11px] leading-snug">
        {savedSuccess && (
          <span className="flex items-center gap-1 font-bold text-sky-500 mb-0.5"><Check size={13} /> Plan saved! You can link it to your completed Strava run anytime in the Learning tab.</span>
        )}
        {armed ? (
          <span className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`}><Check size={13} /> On your phone: tap <b>Start run</b> on "Ready when you are: {armed.name}" as you set off - the reminders are timed from then.</span>
        ) : (
          <span className={muted}>Sends "Ready when you are" to your phone. Tap <b>Start run</b> as you set off; each carb and water reminder follows at its minute, with Taken / Skipped.{komoot ? ' Open route opens it in Komoot.' : ''}</span>
        )}
        {routeId && routeInfo && !komoot && <span className={`block mt-0.5 ${muted}`}>{routeInfo.name} isn't a Komoot route, so there's no Open route link - <a href={`/api/planner/routes/${routeId}/gpx`} className="underline inline-flex items-center gap-0.5"><Download size={11} />download the GPX</a> for your watch.</span>}
        {error && <span className="block mt-0.5 text-rose-600">{error}</span>}
      </div>
      {armed && <button onClick={clear} disabled={busy} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${isDark ? 'border-white/15' : 'border-[#2E2B27]/20'}`}><Trash2 size={13} /> Cancel</button>}
    </div>
  );
}

