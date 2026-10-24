// Run planner: Send to my phone and Save plan only - the same requests as the classic page's card
// (Dashboard/RunPlanner/SendToPhoneCard.jsx): a "Ready when you are" push with Start run, then each carb and water
// reminder at its minute; or the plan saved in IMS without any reminders. Also the plan the phone is following now,
// which the plan section shows until the run is over.
import { useCallback, useEffect, useState } from 'react';

const json = (url, method, body) => fetch(url, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());

// carb stops with their water, plus water-only drinks, by minute
const stopsOf = (plan) => {
  const by = new Map();
  for (const s of plan.plan.stops || []) by.set(s.minute, { minute: s.minute, km: s.km, grams: s.grams, ml: s.fluidMl || 0, withCarbs: true });
  for (const d of plan.drinks || []) if (!by.has(d.minute)) by.set(d.minute, { minute: d.minute, km: d.km, grams: 0, ml: d.ml, withCarbs: false });
  return [...by.values()].sort((a, b) => a.minute - b.minute);
};
// the whole plan as sent - chart series included - so it can be shown again exactly as it was
const snapshot = (plan) => {
  const { startScenarios, iobScenarios, sources, guideline, demand, weather, ...rest } = plan; // eslint-disable-line no-unused-vars
  return { ...rest, weather: weather?.current ? { current: weather.current } : null };
};

export function usePhone(plan) {
  const [armed, setArmed] = useState(null);
  const [sent, setSent] = useState(null); // the plan the phone is following, if any
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState('');

  const loadSent = useCallback(() => {
    json('/api/planner/plans/current').then((j) => { setSent(j.success ? j.sent : null); setVersion((v) => v + 1); }).catch(() => {});
  }, []);
  useEffect(() => {
    json('/api/planner/alerts').then((j) => {
      if (!j.success) return;
      setArmed(j.armed || null);
      // push only: calendar and Tasker alerts off, push on (as the classic card does)
      const st = j.settings || {};
      if (!st.push || st.calendar || st.tasker) json('/api/planner/alerts/settings', 'PUT', { push: true, calendar: false, tasker: false }).catch(() => {});
    }).catch(() => {});
    loadSent();
    const t = setInterval(loadSent, 5 * 60000);
    return () => clearInterval(t);
  }, [loadSent]);

  const body = () => ({
    routeId: plan.inputs?.routeId || null, routeName: plan.inputs?.routeName || `${plan.run.distanceKm} km run`, durationMin: plan.run.durationMin,
    stops: stopsOf(plan), postCarbs: plan.plan.postCarbs || 0, plan: snapshot(plan),
  });
  const send = async () => {
    setBusy('send');
    try {
      const j = await json('/api/planner/alerts', 'POST', { startMode: 'tap', ...body() });
      if (!j.success) throw new Error(j.error || 'It couldn\'t be sent. Try again.');
      setArmed({ name: j.armed.name, armedAt: Date.now() });
      loadSent();
      return j.armed.name;
    } finally { setBusy(''); }
  };
  const saveOnly = async () => {
    setBusy('save');
    try {
      const j = await json('/api/planner/sessions/save-plan', 'POST', body());
      if (!j.success) throw new Error(j.error || 'The plan couldn\'t be saved. Try again.');
      loadSent();
    } finally { setBusy(''); }
  };
  const cancel = async () => {
    setBusy('cancel');
    try { await fetch('/api/planner/alerts', { method: 'DELETE', credentials: 'same-origin' }); setArmed(null); loadSent(); } finally { setBusy(''); }
  };
  return { armed, sent, version, busy, send, saveOnly, cancel };
}
