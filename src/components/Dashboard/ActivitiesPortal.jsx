import React, { useState, useEffect, useCallback, Fragment } from 'react';
import { Activity, RotateCw, LogIn, Lock, Link2, Unlink, Sparkles, Save, ExternalLink, ChevronLeft, ChevronRight, AlertTriangle, TrendingUp, TrendingDown, Minus, Trophy, Droplets, ChevronDown } from 'lucide-react';
import PortalShell from './PortalShell';
import Prose from './Prose';
import { useUnits, UnitToggle, dist, toKm, paceText, speedText, KM_PER_MI } from '../../utils/units';

const PACE_SPORTS = ['Run', 'TrailRun', 'Walk', 'Hike', 'VirtualRun'];
const METRICS = [
  { key: 'distanceKm', label: 'Distance', unit: 'dist' },
  { key: 'hours', label: 'Time', unit: 'h' },
  { key: 'elevationM', label: 'Climbing', unit: 'm' },
  { key: 'count', label: 'Activities', unit: '' },
  { key: 'pace', label: 'Avg pace', unit: 'pace' },
];

const fmtDur = (s) => {
  if (s == null) return '-';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
};
const fmtDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const fmtPace = (a, units) => {
  if (!a.avg_speed) return '-';
  if (PACE_SPORTS.includes(a.sport)) return `${paceText(1000 / a.avg_speed / 60, units)} /${units}`;
  return speedText(a.avg_speed, units);
};

function Delta({ now, before, invert = false }) {
  if (!before) return <span className="text-[10px] text-slate-500">no earlier data</span>;
  const pct = Math.round(((now - before) / before) * 100);
  const Icon = pct > 2 ? TrendingUp : pct < -2 ? TrendingDown : Minus;
  const good = invert ? pct < 0 : pct > 0;
  return <span className={`text-[10px] font-bold flex items-center gap-1 ${Math.abs(pct) <= 2 ? 'text-slate-500' : good ? 'text-emerald-500' : 'text-amber-500'}`}><Icon size={11} />{pct > 0 ? '+' : ''}{pct}% vs before</span>;
}

const LOW = 4.0, HIGH = 7.5;

// One activity's glucose and insulin on board, from the Nightscout log.
function GlucoseDetail({ id, km, isDark }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let live = true;
    fetch(`/api/strava/activities/${id}/glucose`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => { if (live) setState(d.glucose ? { glucose: d.glucose } : { error: d.error || 'Could not read the glucose data.' }); })
      .catch((e) => { if (live) setState({ error: e.message }); });
    return () => { live = false; };
  }, [id]);

  if (state.loading) return <div className="py-4 flex justify-center"><RotateCw size={16} className="animate-spin opacity-50" /></div>;
  if (state.error) return <p className="text-xs text-amber-500 py-2">{state.error}</p>;
  const g = state.glucose;
  if (g.status !== 'ok') return <p className="text-xs text-slate-500 py-2">{g.status === 'error' ? `Could not read the glucose log: ${g.error}` : g.note || 'No glucose was logged for this activity.'}</p>;

  const st = g.stats, dur = g.window.durationMin;
  const x0 = -g.window.preMin, x1 = dur + g.window.postMin;
  const W = 720, PADL = 34, PADR = 10, H1 = 150, H2 = 62, GAP = 22;
  const X = (m) => PADL + ((m - x0) / (x1 - x0)) * (W - PADL - PADR);
  const yMin = 2, yMax = Math.max(12, Math.ceil(Math.max(...g.series.map((p) => p.bg || 0)) + 1));
  const Y = (v) => 8 + (1 - (Math.min(yMax, Math.max(yMin, v)) - yMin) / (yMax - yMin)) * (H1 - 16);
  const iobs = g.series.map((p) => p.iob).filter((v) => v != null);
  const iMin = Math.min(0, ...iobs), iMax = Math.max(1, ...iobs);
  const Y2 = (v) => H1 + GAP + 4 + (1 - (v - iMin) / (iMax - iMin)) * (H2 - 8);
  const line = (key, Yf) => {
    const parts = []; let cur = [];
    for (const p of g.series) { if (p[key] == null) { if (cur.length) parts.push(cur); cur = []; } else cur.push(`${X(p.m).toFixed(1)},${Yf(p[key]).toFixed(1)}`); }
    if (cur.length) parts.push(cur);
    return parts.map((pts) => pts.join(' '));
  };
  const ticks = []; for (let m = Math.ceil(x0 / 30) * 30; m <= x1; m += 30) ticks.push(m);
  const chip = (label, value, tone) => (
    <div className={`rounded-lg px-3 py-2 ${isDark ? 'bg-slate-950/50' : 'bg-white'} border ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10'}`}>
      <div className="text-[9px] font-bold uppercase tracking-wider opacity-60">{label}</div>
      <div className={`text-sm font-black tabular-nums ${tone || ''}`}>{value ?? '-'}</div>
    </div>
  );
  const bgTone = (v) => (v == null ? '' : v < LOW ? 'text-red-500' : v > HIGH ? 'text-amber-500' : 'text-emerald-500');

  return (
    <div className="flex flex-col gap-3 py-2">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H1 + GAP + H2 + 16}`} className="w-full min-w-[520px]" role="img" aria-label="Glucose and insulin on board during the activity">
          <rect x={X(0)} y={0} width={X(dur) - X(0)} height={H1 + GAP + H2} fill="rgba(249,115,22,0.10)" />
          <text x={X(0) + 4} y={11} fontSize="9" fill="#f97316">activity</text>
          <rect x={PADL} y={Y(HIGH)} width={W - PADL - PADR} height={Y(LOW) - Y(HIGH)} fill="rgba(46,213,115,0.10)" />
          <line x1={PADL} x2={W - PADR} y1={Y(LOW)} y2={Y(LOW)} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity="0.5" />
          {[4, 7.5, 10].concat(yMax > 12 ? [yMax] : []).map((v) => (<text key={v} x={2} y={Y(v) + 3} fontSize="9" fill="currentColor" opacity="0.5">{v}</text>))}
          {line('bg', Y).map((pts, i) => <polyline key={i} points={pts} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinejoin="round" />)}
          {/* insulin on board */}
          <line x1={PADL} x2={W - PADR} y1={Y2(0)} y2={Y2(0)} stroke="currentColor" strokeOpacity="0.2" />
          <text x={2} y={Y2(0) + 3} fontSize="9" fill="currentColor" opacity="0.5">0 U</text>
          {line('basalIob', Y2).map((pts, i) => <polyline key={`b${i}`} points={pts} fill="none" stroke="#a78bfa" strokeWidth="1.2" strokeDasharray="3 2" />)}
          {line('iob', Y2).map((pts, i) => <polyline key={`i${i}`} points={pts} fill="none" stroke="#c084fc" strokeWidth="2" />)}
          {g.events.map((e, i) => (
            <g key={i}>
              <line x1={X(e.m)} x2={X(e.m)} y1={H1 + GAP} y2={H1 + GAP + H2} stroke={e.type === 'bolus' ? '#f472b6' : '#facc15'} strokeWidth="1.5" />
              <text x={X(e.m) + 3} y={H1 + GAP + 10 + (i % 3) * 9} fontSize="9" fill={e.type === 'bolus' ? '#f472b6' : '#facc15'}>{e.type === 'bolus' ? `${e.units} U` : `${e.grams} g`}</text>
            </g>
          ))}
          {ticks.map((m) => (<text key={m} x={X(m)} y={H1 + GAP + H2 + 12} fontSize="9" textAnchor="middle" fill="currentColor" opacity="0.55">{m === 0 ? 'start' : `${m > 0 ? '+' : ''}${m}m`}</text>))}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
        <span><span className="inline-block w-3 h-0.5 bg-sky-400 align-middle mr-1" />glucose (mmol/L, green band = {LOW}-{HIGH})</span>
        <span><span className="inline-block w-3 h-0.5 bg-purple-400 align-middle mr-1" />insulin on board (dashed = basal part)</span>
        <span><span className="inline-block w-3 h-0.5 bg-pink-400 align-middle mr-1" />bolus</span>
        <span><span className="inline-block w-3 h-0.5 bg-yellow-400 align-middle mr-1" />carbs</span>
        {!g.complete && <span className="text-amber-500">still collecting the 2 hours after the finish</span>}
        {st.sparseReadings && <span className="text-amber-500">readings are 15 minutes apart (LibreView import), so this is coarser</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {chip('Start', st.bgStart, bgTone(st.bgStart))}
        {chip('End', st.bgEnd, bgTone(st.bgEnd))}
        {chip('Lowest', st.bgMin != null ? `${st.bgMin}${st.bgMinAtMin != null ? ` (at ${st.bgMinAtMin}m)` : ''}` : null, bgTone(st.bgMin))}
        {chip('Highest', st.bgMax, bgTone(st.bgMax))}
        {chip('Mean / variability', st.bgMean != null ? `${st.bgMean} (CV ${st.bgCv}%)` : null)}
        {chip('Change', st.bgChange != null ? `${st.bgChange > 0 ? '+' : ''}${st.bgChange}` : null)}
        {chip('Below / in range / above', `${st.pctBelow}% / ${st.pctInRange}% / ${st.pctAbove}%`)}
        {chip('Steepest fall', st.fallPer10Min != null ? `${st.fallPer10Min} per 10 min` : null)}
        {chip(st.iobEstimated ? 'IOB start / end (estimated from boluses)' : 'IOB start / end', `${st.iobStart ?? '-'} / ${st.iobEnd ?? '-'} U`, st.iobStart > 1.5 ? 'text-amber-500' : '')}
        {chip('IOB range during', st.iobMinDuring != null ? `${st.iobMinDuring} to ${st.iobMaxDuring} U` : null)}
        {chip('Carbs on board', st.cobStart != null ? `${st.cobStart} g` : null)}
        {chip('Last bolus', st.lastBolusUnits != null ? `${st.lastBolusUnits} U, ${Math.round(st.lastBolusMinutesBefore / 6) / 10} h before` : 'none in the log')}
        {chip('Carbs 1 h before / during', `${st.carbsGrams60mBefore} g / ${st.carbsGramsDuring} g`)}
        {chip('Bolus in 4 h before', `${st.bolusUnits4hBefore} U`)}
        {chip('Pump suspended', st.basalCoveredPct ? `${st.basalZeroPct}% of the run` : 'no temp basal logged')}
        {chip('Temporary target', st.tempTarget ? `${st.tempTarget.bottom ?? '?'}-${st.tempTarget.top ?? '?'}${st.tempTarget.reason ? ` (${st.tempTarget.reason})` : ''}` : 'none')}
        {chip('After the finish', st.post?.bgMin != null ? `low ${st.post.bgMin}${st.post.hypo ? ' (hypo)' : ''}, high ${st.post.bgMax}` : 'not yet', st.post?.hypo ? 'text-red-500' : '')}
      </div>
      <RunInsight id={id} km={km} isDark={isDark} />
    </div>
  );
}

const fmtNum = (v, suffix = '') => (v == null ? '-' : `${v}${suffix}`);

function InsightTable({ title, rows, isDark }) {
  if (!rows?.length) return null;
  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-wider opacity-70 mb-1">{title}</div>
      <table className="w-full text-xs">
        <thead><tr className="text-left text-[9px] uppercase tracking-wider text-slate-500"><th className="py-1 pr-2">Group</th><th className="pr-2 text-right">Runs</th><th className="pr-2 text-right">Start</th><th className="pr-2 text-right">Lowest</th><th className="pr-2 text-right">Change</th><th className="pr-2 text-right">In range</th><th className="text-right">Low within 2 h</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className={`border-t ${isDark ? 'border-white/5' : 'border-[#2E2B27]/5'}`}>
              <td className="py-1 pr-2 font-semibold">{r.label}</td>
              <td className="pr-2 text-right tabular-nums">{r.runs}</td>
              <td className="pr-2 text-right tabular-nums">{fmtNum(r.avgStart)}</td>
              <td className={`pr-2 text-right tabular-nums ${r.avgMin != null && r.avgMin < LOW ? 'text-red-500' : ''}`}>{fmtNum(r.avgMin)}</td>
              <td className="pr-2 text-right tabular-nums">{r.avgChange != null ? `${r.avgChange > 0 ? '+' : ''}${r.avgChange}` : '-'}</td>
              <td className="pr-2 text-right tabular-nums">{fmtNum(r.avgInRangePct, '%')}</td>
              <td className={`text-right tabular-nums ${r.hypoPct > 25 ? 'text-red-500 font-bold' : ''}`}>{fmtNum(r.hypoPct, '%')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const parseTime = (text) => {
  const t = String(text || '').trim();
  if (!t) return null;
  const p = t.split(':').map(Number);
  if (p.some((x) => !Number.isFinite(x))) return NaN;
  if (p.length === 3) return p[0] * 60 + p[1] + p[2] / 60;
  if (p.length === 2) return p[0] + p[1] / 60;
  return p[0];
};
const fmtHms = (min) => {
  const total = Math.round(min * 60), h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

// Running goals, judged from the Strava log and handed to the Run Planner for the fuelling.
function GoalsPanel({ isDark, units, panel, field, label, btn, ghost, showToast }) {
  const [goals, setGoals] = useState([]);
  const [plans, setPlans] = useState({});
  const [form, setForm] = useState({ name: '', distance: '', time: '', date: '' });
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState('');

  const api = useCallback(async (url, options) => {
    const res = await fetch(url, { credentials: 'same-origin', ...options });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.success === false) throw new Error(d.error || 'Request failed.');
    return d;
  }, []);
  const load = useCallback(async () => {
    try {
      const d = await api('/api/goals');
      setGoals(d.goals);
      const entries = await Promise.all(d.goals.map((a) => api(`/api/goals/${a.goal.id}/plan?units=${units}`).then((r) => [a.goal.id, r.plan]).catch(() => [a.goal.id, null])));
      setPlans(Object.fromEntries(entries));
    } catch (_) { /* shown elsewhere */ }
  }, [api, units]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      const time = parseTime(form.time);
      if (Number.isNaN(time)) throw new Error('Type the time like 55:00 or 1:55:00.');
      const body = { name: form.name, distanceKm: toKm(form.distance, units), targetMin: time, targetDate: form.date || null };
      if (editing) await api(`/api/goals/${editing}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      else await api('/api/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setForm({ name: '', distance: '', time: '', date: '' }); setEditing(null); load();
    } catch (err) { showToast(err.message, 'error'); }
  };
  const edit = (g) => { setEditing(g.id); setForm({ name: g.name, distance: String(dist(g.distanceKm, units, 2)), time: g.targetMin ? fmtHms(g.targetMin) : '', date: g.targetDate || '' }); };
  const remove = async (g) => { if (window.confirm(`Delete the goal "${g.name}"?`)) { try { await api(`/api/goals/${g.id}`, { method: 'DELETE' }); load(); } catch (err) { showToast(err.message, 'error'); } } };
  const makePlan = async (id) => {
    setBusy(`p${id}`);
    try { const d = await api(`/api/goals/${id}/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ units }) }); setPlans((p) => ({ ...p, [id]: d.plan })); }
    catch (err) { showToast(err.message, 'error'); } finally { setBusy(''); }
  };
  const bar = (v, tone) => (<div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-black/10'}`}><div className={`h-full ${tone}`} style={{ width: `${Math.round((v ?? 0) * 100)}%` }} /></div>);

  return (
    <div className={panel}>
      <h2 className="text-xs font-black uppercase tracking-wider mb-1 flex items-center gap-2"><Trophy size={13} className="text-amber-500" />Goals</h2>
      <p className="text-[11px] text-slate-500 mb-3">A distance, or a distance in a time, optionally by a date. Each goal is checked against your Strava running, and the <a className="text-sky-500 hover:underline" href="/ims/runplanner">Run Planner</a> can plan the carbs for the effort itself.</p>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end mb-4">
        <div className="col-span-2"><label className={label}>Goal</label><input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Leeds 10K" /></div>
        <div><label className={label}>Distance ({units})</label><input className={field} type="number" step="0.1" value={form.distance} onChange={(e) => setForm({ ...form, distance: e.target.value })} /></div>
        <div><label className={label}>Time (optional)</label><input className={field} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} placeholder="55:00" /></div>
        <div><label className={label}>By (optional)</label><input className={field} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
        <div className="flex gap-2">
          <button onClick={save} disabled={!form.name.trim() || !form.distance} className={btn}><Save size={13} />{editing ? 'Save' : 'Add'}</button>
          {editing && <button onClick={() => { setEditing(null); setForm({ name: '', distance: '', time: '', date: '' }); }} className={ghost}>Cancel</button>}
        </div>
      </div>

      {goals.length === 0 ? <p className="text-xs text-slate-500">No goals yet.</p> : (
        <div className="flex flex-col gap-4">
          {goals.map((a) => {
            const g = a.goal;
            return (
              <div key={g.id} className={`rounded-xl border p-4 ${isDark ? 'border-white/10 bg-slate-950/30' : 'border-[#2E2B27]/10 bg-white/60'}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-black">{g.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {dist(g.distanceKm, units, 1)} {units}{g.targetMin ? ` in ${fmtHms(g.targetMin)} (${paceText(a.targetPaceMinPerKm, units)} /${units})` : ' - distance goal'}
                      {g.targetDate ? ` - by ${fmtDay(g.targetDate)}${a.weeksLeft != null ? ` (${a.weeksLeft} weeks)` : ''}` : ''}
                    </div>
                  </div>
                  <a href={`/ims/runplanner?goal=${g.id}`} className={ghost} title="Open the Run Planner set up for this goal"><Sparkles size={13} />Plan the fuelling</a>
                  <button onClick={() => edit(g)} className={ghost}>Edit</button>
                  <button onClick={() => remove(g)} className={`${ghost} text-red-400`}>Delete</button>
                </div>
                <p className="text-xs font-semibold mt-3">{a.verdict}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1"><span>Long run</span><span>{dist(a.current.longestRunKm, units, 1)} of {dist(a.recommended.longRunKm, units, 1)} {units}</span></div>
                    {bar(a.progress.longRun, 'bg-emerald-500')}
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1"><span>Weekly distance</span><span>{dist(a.current.weeklyKm, units, 1)} of {dist(a.recommended.weeklyKm, units, 1)} {units}</span></div>
                    {bar(a.progress.weekly, 'bg-sky-500')}
                  </div>
                  {g.targetMin && (
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-500 mb-1"><span>Predicted from recent runs</span><span>{a.current.bestPredictedMin ? fmtHms(a.current.bestPredictedMin) : '-'} vs {fmtHms(g.targetMin)}</span></div>
                      {bar(a.progress.time, 'bg-amber-500')}
                    </div>
                  )}
                </div>
                {a.current.basedOn && <p className="text-[10px] text-slate-500 mt-2">Prediction (Riegel) from your {dist(a.current.basedOn.km, units, 1)} {units} run on {fmtDay(a.current.basedOn.day)} in {fmtHms(a.current.basedOn.minutes)}. {a.current.runsPerWeek} runs a week lately.</p>}
                {a.flags.length > 0 && <ul className="text-[11px] text-amber-500 list-disc pl-5 mt-2 space-y-0.5">{a.flags.map((f, i) => <li key={i}>{f}</li>)}</ul>}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button onClick={() => makePlan(g.id)} disabled={busy === `p${g.id}`} className={btn}>{busy === `p${g.id}` ? <RotateCw size={13} className="animate-spin" /> : <Sparkles size={13} />}{plans[g.id] ? 'Rewrite the plan' : 'Build a training plan'}</button>
                  {plans[g.id] && <span className="text-[10px] text-slate-500">{new Date(plans[g.id].at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}</span>}
                </div>
                {plans[g.id] && <Prose className="mt-2" text={plans[g.id].text} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// AI review of one run against the runner's targets, with advice for next time on the same route.
function RunInsight({ id, km, isDark }) {
  const { units } = useUnits();
  const [insight, setInsight] = useState(null);
  const [routes, setRoutes] = useState({ routes: [], routeId: null, suggestions: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    Promise.all([
      fetch(`/api/strava/activities/${id}/insight?units=${units}`, { credentials: 'same-origin' }).then((r) => r.json()),
      fetch(`/api/strava/activities/${id}/route?km=${km}`, { credentials: 'same-origin' }).then((r) => r.json()),
    ]).then(([i, r]) => { if (live) { setInsight(i.insight || null); setRoutes({ routes: r.routes || [], routeId: r.routeId, suggestions: r.suggestions || [] }); } }).catch(() => {});
    return () => { live = false; };
  }, [id, km, units]);

  const setRoute = async (routeId) => {
    try {
      const res = await fetch(`/api/strava/activities/${id}/route`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routeId: routeId || null }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not link the route.');
      setRoutes((r) => ({ ...r, routeId: d.routeId }));
    } catch (e) { setError(e.message); }
  };
  const review = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/strava/activities/${id}/insight`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ units }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'The review failed.');
      setInsight(d.insight);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const suggested = routes.suggestions.filter((sid) => sid !== routes.routeId);
  return (
    <div className={`rounded-xl border p-4 ${isDark ? 'border-white/10 bg-slate-950/30' : 'border-[#2E2B27]/10 bg-white/60'}`}>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h3 className="text-[11px] font-black uppercase tracking-wider flex items-center gap-2"><Sparkles size={12} className="text-emerald-400" />Review this run and plan the next one</h3>
        <select value={routes.routeId ?? ''} onChange={(e) => setRoute(e.target.value ? Number(e.target.value) : null)} className={`px-2 py-1.5 rounded-lg text-[11px] outline-none border ${isDark ? 'bg-slate-950/60 border-white/10' : 'bg-white border-[#2E2B27]/10'}`} title="The saved route this run followed (its elevation is used for the advice)">
          <option value="">No saved route linked</option>
          {routes.routes.map((r) => <option key={r.id} value={r.id}>{r.name} ({dist(r.distanceKm, units)} {units}){suggested.includes(r.id) ? ' - similar length' : ''}</option>)}
        </select>
        <button onClick={review} disabled={busy} className="ml-auto px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white active:scale-95 disabled:opacity-40">
          {busy ? <RotateCw size={13} className="animate-spin" /> : <Sparkles size={13} />}{insight ? 'Review again' : 'Review this run'}
        </button>
      </div>
      {routes.routes.length === 0 && <p className="text-[10px] text-slate-500 mb-2">Add your Komoot or GPX routes on the <a className="text-sky-500 hover:underline" href="/ims/runplanner">Run Planner</a> to include the route's climbing in the advice.</p>}
      {error && <p className="text-xs text-amber-500 mb-2">{error}</p>}
      {insight ? (
        <>
          <p className="text-[10px] text-slate-500 mb-1">{new Date(insight.at).toLocaleString('en-GB', { timeZone: 'Europe/London' })} - based on where your glucose and insulin on board are now</p>
          <Prose text={insight.text} />
          {insight.sources && <details className="mt-2 text-[10px] text-slate-500"><summary className="cursor-pointer">Research behind the advice</summary><ul className="list-disc pl-5 mt-1 space-y-0.5">{insight.sources.map((s) => <li key={s.url}><a className="text-sky-500 hover:underline" href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul></details>}
        </>
      ) : !busy && <p className="text-[11px] text-slate-500">An AI review of how this run went against your targets, what to change, and how many carbs to take before and during the same route next time from where you are now. Pattern-spotting from your own data, not medical advice.</p>}
    </div>
  );
}

export default function ActivitiesPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [status, setStatus] = useState(null);
  const [summary, setSummary] = useState(null);
  const [sports, setSports] = useState([]);
  const [list, setList] = useState({ total: 0, activities: [] });
  const [filters, setFilters] = useState({ sport: '', search: '' });
  const [page, setPage] = useState(0);
  const [metric, setMetric] = useState('distanceKm');
  const [selectedWeek, setSelectedWeek] = useState(null);
  const { units, setUnits } = useUnits();
  const [analysis, setAnalysis] = useState(null);
  const [glucose, setGlucose] = useState({ logger: null, progress: null, badges: {}, insights: null, analysis: null });
  const [glucoseSport, setGlucoseSport] = useState('Run');
  const [openId, setOpenId] = useState(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [creds, setCreds] = useState({ clientId: '', clientSecret: '' });
  const [notification, setNotification] = useState(null);
  const PAGE = 25;

  const showToast = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification((p) => (p?.msg === msg ? null : p)), 5000);
  }, []);

  const call = useCallback(async (url, options) => {
    const res = await fetch(url, { credentials: 'same-origin', ...options });
    const d = await res.json().catch(() => ({}));
    if (res.status === 401) { setNeedsSignIn(true); throw new Error(d.error || 'Sign in required.'); }
    if (!res.ok || d.success === false) throw new Error(d.error || 'Request failed.');
    return d;
  }, []);
  const send = (url, method, body) => call(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

  const loadStatus = useCallback(async () => {
    try { const s = await call('/api/strava/status'); setNeedsSignIn(false); setStatus(s); return s; }
    catch (_) { return null; }
    finally { setIsLoading(false); }
  }, [call]);

  const loadData = useCallback(async () => {
    try {
      const [sum, sp, an] = await Promise.all([call('/api/strava/summary'), call('/api/strava/sports'), call(`/api/strava/analysis?units=${units}`)]);
      setSummary(sum); setSports(sp.sports); setAnalysis(an.analysis);
    } catch (_) { /* shown by status */ }
  }, [call, units]);

  const loadGlucose = useCallback(async () => {
    try {
      const [st, bd, ins] = await Promise.all([call('/api/strava/glucose/status'), call('/api/strava/glucose/badges'), call(`/api/strava/glucose/insights?sport=${encodeURIComponent(glucoseSport)}&units=${units}`)]);
      setGlucose({ logger: st.logger, progress: st.progress, badges: bd.badges, insights: ins.insights, analysis: ins.analysis });
    } catch (_) { /* optional */ }
  }, [call, glucoseSport, units]);

  const loadList = useCallback(async () => {
    try {
      const q = new URLSearchParams({ limit: PAGE, offset: page * PAGE, ...(filters.sport && { sport: filters.sport }), ...(filters.search && { search: filters.search }) });
      setList(await call(`/api/strava/activities?${q}`));
    } catch (_) { /* ignore */ }
  }, [call, page, filters]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('strava') === 'connected') showToast('Strava connected. Pulling your activities now...');
    else if (p.get('strava') === 'error') showToast(p.get('message') || 'Strava sign-in failed.', 'error');
    if (p.has('strava')) window.history.replaceState(null, '', '/ims/activities');
    loadStatus().then((s) => { if (s?.activityCount) loadData(); });
  }, [loadStatus, loadData, showToast]);
  useEffect(() => { if (status?.activityCount) loadList(); }, [status?.activityCount, loadList]);
  useEffect(() => { if (status?.activityCount) loadGlucose(); }, [status?.activityCount, loadGlucose]);
  // While matching runs in the background, keep the progress fresh.
  useEffect(() => {
    if (!glucose.progress?.running) return undefined;
    const t = setInterval(loadGlucose, 3000);
    return () => clearInterval(t);
  }, [glucose.progress?.running, loadGlucose]);
  // A first sync runs in the background after connecting: keep checking until it lands.
  useEffect(() => {
    if (!status?.connected || status.activityCount) return undefined;
    const t = setInterval(() => loadStatus().then((s) => { if (s?.activityCount) loadData(); }), 4000);
    return () => clearInterval(t);
  }, [status?.connected, status?.activityCount, loadStatus, loadData]);

  const signInGoogle = async () => {
    try { const d = await (await fetch(`/api/auth/url?returnTo=${encodeURIComponent(window.location.pathname)}`)).json(); if (d.url) window.location.href = d.url; }
    catch (err) { showToast(err.message, 'error'); }
  };
  const saveCreds = async () => {
    try {
      const body = {}; if (creds.clientId.trim()) body.clientId = creds.clientId; if (creds.clientSecret.trim()) body.clientSecret = creds.clientSecret;
      await send('/api/strava/credentials', 'PUT', body);
      setCreds({ clientId: '', clientSecret: '' }); showToast('Saved (the secret is stored encrypted).'); loadStatus();
    } catch (err) { showToast(err.message, 'error'); }
  };
  const connect = async () => {
    try { const d = await call('/api/strava/connect-url'); window.location.href = d.url; }
    catch (err) { showToast(err.message, 'error'); }
  };
  const sync = async (full) => {
    setBusy('sync');
    try { const d = await send('/api/strava/sync', 'POST', { full }); showToast(`Synced - ${d.fetched} activities checked, ${d.total} stored.`); await loadStatus(); loadData(); loadList(); }
    catch (err) { showToast(err.message, 'error'); loadStatus(); }
    finally { setBusy(''); }
  };
  const runAnalysis = async () => {
    setBusy('analysis');
    try { setAnalysis((await send('/api/strava/analysis', 'POST', { units })).analysis); }
    catch (err) { showToast(err.message, 'error'); }
    finally { setBusy(''); }
  };
  const startMatching = async () => {
    try { await send('/api/strava/glucose/match', 'POST', {}); showToast('Matching activities with your glucose log...'); setTimeout(loadGlucose, 800); }
    catch (err) { showToast(err.message, 'error'); }
  };
  const backfillGlucose = async () => {
    setBusy('backfill');
    try {
      const d = await send('/api/strava/glucose/backfill', 'POST', {});
      showToast(d.entries ? `Found older data in Nightscout: ${d.entries} readings pulled in.` : 'Nightscout has nothing older than IMS already holds.', d.entries ? 'success' : 'error');
      loadGlucose();
    } catch (err) { showToast(err.message, 'error'); } finally { setBusy(''); }
  };
  const importLibre = async (file) => {
    if (!file) return;
    setBusy('libre');
    try {
      const d = await send('/api/strava/glucose/import-libre', 'POST', { csv: await file.text() });
      showToast(`Imported ${d.added} new glucose readings (${d.read} in the file). Matching your activities now...`);
      setTimeout(loadGlucose, 1500);
    } catch (err) { showToast(err.message, 'error'); } finally { setBusy(''); }
  };
  const runGlucoseAnalysis = async () => {
    setBusy('gAnalysis');
    try { const d = await send('/api/strava/glucose/analysis', 'POST', { sport: glucoseSport, units }); setGlucose((g) => ({ ...g, analysis: d.analysis })); }
    catch (err) { showToast(err.message, 'error'); }
    finally { setBusy(''); }
  };
  const disconnectStrava = async () => {
    if (!window.confirm('Disconnect Strava? Your logged activities stay; syncing stops until you connect again.')) return;
    try { await send('/api/strava/disconnect', 'POST'); loadStatus(); } catch (err) { showToast(err.message, 'error'); }
  };

  const panel = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const field = `w-full px-3 py-2 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/10 text-slate-900'}`;
  const label = 'text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70';
  const gradient = 'from-orange-500 to-red-600';
  const btn = `px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r ${gradient} text-white active:scale-95 disabled:opacity-40`;
  const ghost = `px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`;

  const weeks = summary?.weekly || [];
  const metricMeta = METRICS.find((m) => m.key === metric);
  const isPace = metric === 'pace';
  const perUnit = units === 'mi' ? KM_PER_MI : 1;
  // What one bar means, in the chosen unit. For pace it is minutes per km/mile (lower = faster).
  const weekVal = (w) => (isPace ? (w.paceMinKm ? w.paceMinKm * perUnit : null) : metric === 'distanceKm' ? dist(w.distanceKm, units) : w[metric]);
  const fmtWeekVal = (v, key = metric) => {
    if (v == null) return '-';
    if (key === 'pace') return `${paceText(v / perUnit, units)} /${units}`;
    return key === 'distanceKm' ? `${v} ${units}` : key === 'hours' ? `${v} h` : key === 'elevationM' ? `${v} m` : `${v}`;
  };
  const vals = weeks.map(weekVal);
  const present = vals.filter((v) => v != null && v > 0);
  const max = Math.max(1, ...present);
  const fastest = present.length ? Math.min(...present) : null;
  // pace bars: taller = faster (height follows speed); other metrics: taller = more
  const barFrac = (v) => (v == null || v <= 0 ? 0 : isPace ? fastest / v : v / max);
  const barTop = isPace ? (fastest ? fmtWeekVal(fastest) : '-') : fmtWeekVal(max);
  const totalVal = isPace ? null : vals.reduce((a, v) => a + (v || 0), 0);
  const bestIdx = present.length ? vals.indexOf(isPace ? fastest : max) : -1;
  const periodPace = (() => { const km = weeks.reduce((a, w) => a + (w.runKm || 0), 0); const hrs = weeks.reduce((a, w) => a + (w.runKm && w.paceMinKm ? (w.runKm * w.paceMinKm) / 60 : 0), 0); return km > 0 ? (hrs * 60 / km) * perUnit : null; })();
  const unitLabel = metricMeta.unit === 'dist' ? units : metricMeta.unit === 'pace' ? `min/${units}` : metricMeta.unit;
  const sel = selectedWeek != null ? weeks.find((w) => w.weekStart === selectedWeek) : null;
  const pages = Math.max(1, Math.ceil(list.total / PAGE));

  return (
    <PortalShell title="Activities" subtitle="/ims/activities • your Strava log, for analysis"
      icon={Activity} gradient={gradient} glow="rgba(249,115,22,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification} maxWidth="max-w-5xl">

      {needsSignIn ? (
        <div className={`${panel} text-center py-10 flex flex-col items-center gap-4`}>
          <Lock size={28} className="opacity-60" />
          <p className="text-xs text-slate-500 max-w-sm">Your training data is only available to your signed-in Google account.</p>
          <button onClick={signInGoogle} className={btn}><LogIn size={14} /> Sign in with Google</button>
        </div>
      ) : isLoading || !status ? (
        <div className="py-16 flex justify-center"><RotateCw size={22} className="animate-spin opacity-50" /></div>
      ) : (
        <>
          <div className="flex items-center justify-end gap-2 text-[10px] text-slate-500">Distances in <UnitToggle units={units} setUnits={setUnits} isDark={isDark} /></div>

          {/* Connection */}
          <div className={panel}>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xs font-black uppercase tracking-wider">Strava</h2>
              {status.connected && status.canReadActivities ? (
                <span className="text-[11px] text-emerald-500 font-bold">Connected{status.athlete?.name ? ` as ${status.athlete.name}` : ''}</span>
              ) : <span className="text-[11px] text-amber-500 font-bold">Not connected</span>}
              <div className="ml-auto flex flex-wrap gap-2">
                {status.connected && (
                  <>
                    <button onClick={() => sync(false)} disabled={busy === 'sync'} className={btn}>{busy === 'sync' ? <RotateCw size={13} className="animate-spin" /> : <RotateCw size={13} />} Sync now</button>
                    <button onClick={() => window.confirm('Re-read your whole history from Strava? (Uses a few requests.)') && sync(true)} disabled={busy === 'sync'} className={ghost}>Full re-sync</button>
                    <button onClick={disconnectStrava} className={ghost}><Unlink size={13} /> Disconnect</button>
                  </>
                )}
              </div>
            </div>
            {status.connected && (
              <p className="text-[11px] text-slate-500 mt-2">
                {status.activityCount} activities logged{status.earliest ? ` (${fmtDay(status.earliest)} to ${fmtDay(status.latest)})` : ''}.
                {status.lastSync ? ` Last checked ${new Date(status.lastSync).toLocaleString('en-GB', { timeZone: 'Europe/London' })}; it checks again every 30 minutes.` : ' First sync running...'}
                {status.rate?.usage && ` Strava requests used: ${status.rate.usage.split(',')[0]} of ${status.rate.limit.split(',')[0]} per 15 min.`}
              </p>
            )}
            {status.lastSyncError && <p className="text-[11px] text-amber-500 mt-2 flex items-center gap-1.5"><AlertTriangle size={12} />{status.lastSyncError}</p>}

            {(!status.connected || !status.canReadActivities) && (
              <div className="mt-4 flex flex-col gap-3 text-xs">
                <p className="text-slate-500 leading-relaxed">
                  Strava's default token only has basic "read" access and cannot read activities, so you connect once and approve <strong>View data about your activities</strong>.
                  On your Strava API settings page, set <strong>Authorization Callback Domain</strong> to <code>{status.callbackDomain || 'localhost'}</code> (the address you are on now - Strava allows one domain, so use the address you sign in from).
                </p>
                {(!status.hasClientId || !status.hasClientSecret) && (
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
                    {!status.hasClientId && (
                      <div className="sm:col-span-2"><label className={label}>Client ID (the number)</label><input className={field} value={creds.clientId} onChange={(e) => setCreds({ ...creds, clientId: e.target.value })} placeholder="e.g. 123456" inputMode="numeric" /></div>
                    )}
                    {!status.hasClientSecret && (
                      <div className="sm:col-span-2"><label className={label}>Client Secret</label><input type="password" autoComplete="new-password" className={field} value={creds.clientSecret} onChange={(e) => setCreds({ ...creds, clientSecret: e.target.value })} /></div>
                    )}
                    <button onClick={saveCreds} disabled={!creds.clientId.trim() && !creds.clientSecret.trim()} className={btn}><Save size={13} /> Save</button>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button onClick={connect} disabled={!status.hasClientId || !status.hasClientSecret} className={btn}><Link2 size={14} /> Connect Strava</button>
                  <span className="text-[11px] text-slate-500">
                    {status.hasClientSecret ? 'Client secret saved (encrypted). ' : ''}{status.hasClientId ? 'Client ID saved.' : 'Enter your Client ID to continue.'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {status.activityCount > 0 && summary && (
            <>
              {/* Period cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[['last7', 'Last 7 days'], ['last28', 'Last 28 days'], ['last365', 'Last 12 months']].map(([k, title]) => {
                  const p = summary.periods[k];
                  return (
                    <div key={k} className={panel}>
                      <div className="text-[10px] font-black uppercase tracking-wider opacity-70 mb-2">{title}</div>
                      <div className="text-2xl font-black tabular-nums">{dist(p.distanceKm, units)} <span className="text-xs font-bold text-slate-500">{units}</span></div>
                      <Delta now={p.distanceKm} before={p.previous.distanceKm} />
                      <div className="mt-2 text-[11px] text-slate-500 leading-relaxed">
                        {p.count} activities - {p.hours} h - {p.elevationM} m climbed{p.avgHr ? ` - avg HR ${p.avgHr}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Weekly chart */}
              <div className={panel}>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <h2 className="text-xs font-black uppercase tracking-wider">Weekly {metricMeta.label.toLowerCase()} - last 26 weeks</h2>
                  <div className={`ml-auto flex max-w-full overflow-x-auto rounded-lg border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
                    {METRICS.map((m) => (
                      <button key={m.key} onClick={() => { setMetric(m.key); setSelectedWeek(null); }} className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${metric === m.key ? `bg-gradient-to-r ${gradient} text-white` : isDark ? 'text-slate-400 hover:bg-white/5' : 'text-slate-600 hover:bg-black/5'}`}>{m.label}</button>
                    ))}
                  </div>
                </div>

                {/* what the bars add up to */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  {(isPace ? [
                    ['Average (26 weeks)', periodPace ? `${paceText(periodPace / perUnit, units)} /${units}` : '-'],
                    ['Fastest week', fastest ? `${fmtWeekVal(fastest)}` : '-'],
                    ['Slowest week', present.length ? fmtWeekVal(Math.max(...present)) : '-'],
                    ['Latest week', fmtWeekVal(vals[vals.length - 1])],
                  ] : [
                    [`Total (26 weeks)`, fmtWeekVal(metric === 'count' ? totalVal : Math.round(totalVal * 10) / 10)],
                    ['Average a week', fmtWeekVal(Math.round((totalVal / Math.max(1, weeks.length)) * 10) / 10)],
                    ['Best week', bestIdx >= 0 ? `${fmtWeekVal(vals[bestIdx])}` : '-'],
                    ['This week', fmtWeekVal(vals[vals.length - 1])],
                  ]).map(([l, v]) => (
                    <div key={l} className={`rounded-lg px-3 py-2 border ${isDark ? 'bg-slate-950/50 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
                      <div className="text-[9px] font-bold uppercase tracking-wider opacity-60">{l}</div>
                      <div className="text-sm font-black tabular-nums">{v}</div>
                    </div>
                  ))}
                </div>

                {/* bars: scale on the left, the reading above each bar, press one for its week */}
                <div className="flex gap-2">
                  {!isPace && (
                    <div className="flex flex-col justify-between text-[9px] text-slate-500 tabular-nums text-right h-40 pb-0 pt-3 w-12 shrink-0">
                      <span>{fmtWeekVal(max)}</span><span>{fmtWeekVal(Math.round((max / 2) * 10) / 10)}</span><span>0</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-end gap-1 h-40 relative border-b border-slate-500/30">
                      {!isPace && <><div className="absolute left-0 right-0 border-t border-dashed border-slate-500/20" style={{ bottom: '50%' }} /><div className="absolute left-0 right-0 border-t border-dashed border-slate-500/20" style={{ top: 12 }} /></>}
                      {weeks.map((w, i) => {
                        const v = vals[i], frac = barFrac(v), on = selectedWeek === w.weekStart;
                        return (
                          <button key={w.weekStart} type="button" onClick={() => setSelectedWeek(on ? null : w.weekStart)}
                            className="flex-1 min-w-0 flex flex-col justify-end items-center h-full relative focus:outline-none"
                            title={`Week of ${fmtDay(w.weekStart)}: ${fmtWeekVal(v)} (${w.count} activities) - press for details`}>
                            {v != null && v > 0 && <span className={`text-[8px] leading-none mb-0.5 tabular-nums whitespace-nowrap ${on ? 'font-black text-orange-400' : 'text-slate-500'}`}>{isPace ? paceText(v / perUnit, units) : metric === 'distanceKm' || metric === 'hours' ? Math.round(v) : v}</span>}
                            <div className={`w-full rounded-t bg-gradient-to-t ${gradient} ${v ? '' : 'opacity-20'} ${on ? 'ring-2 ring-orange-300' : 'hover:brightness-125'}`} style={{ height: `${Math.max(v ? 3 : 1, frac * (100 - 9))}%` }} />
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                      <span>{fmtDay(weeks[0]?.weekStart)}</span>
                      <span>{isPace ? 'taller bar = faster average pace' : `full height = ${barTop}`}</span>
                      <span>this week</span>
                    </div>
                  </div>
                </div>

                {sel ? (
                  <div className={`mt-3 rounded-xl border p-3 ${isDark ? 'border-amber-500/30 bg-amber-500/5' : 'border-amber-400/50 bg-amber-50'}`}>
                    <div className="text-xs font-black mb-2">Week of {fmtDay(sel.weekStart)}: {fmtWeekVal(weekVal(sel))}</div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                      <div><span className="text-slate-500">Activities</span><div className="font-bold tabular-nums">{sel.count}</div></div>
                      <div><span className="text-slate-500">Distance</span><div className="font-bold tabular-nums">{dist(sel.distanceKm, units)} {units}</div></div>
                      <div><span className="text-slate-500">Time</span><div className="font-bold tabular-nums">{sel.hours} h</div></div>
                      <div><span className="text-slate-500">Climbing</span><div className="font-bold tabular-nums">{sel.elevationM} m</div></div>
                      <div><span className="text-slate-500">Avg pace (runs)</span><div className="font-bold tabular-nums">{sel.paceMinKm ? `${paceText(sel.paceMinKm, units)} /${units}` : '-'}</div></div>
                    </div>
                    {sel.avgHr && <div className="text-[10px] text-slate-500 mt-1">Average heart rate {sel.avgHr}</div>}
                  </div>
                ) : <p className="text-[10px] text-slate-500 mt-2">Press a bar to see that week's reading.{isPace ? ' Pace is the running average for the week (running time over running distance).' : ''}</p>}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* By sport */}
                <div className={panel}>
                  <h2 className="text-xs font-black uppercase tracking-wider mb-3">By sport (all time)</h2>
                  <div className="flex flex-col gap-1.5 text-xs">
                    <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-500/20 pb-1">
                      <span className="w-28">Sport</span>
                      <span className="w-[4.5rem]">Activities</span>
                      <span className="w-20">Distance</span>
                      <span className="w-16">Time</span>
                      <span>Climbing</span>
                    </div>
                    {summary.bySport.map((s) => (
                      <div key={s.sport} className="flex items-center gap-3">
                        <span className="font-bold w-28 truncate">{s.sport}</span>
                        <span className="tabular-nums text-slate-500 w-[4.5rem]">{s.count}x</span>
                        <span className="tabular-nums w-20">{dist(s.km, units)} {units}</span>
                        <span className="tabular-nums w-16 text-slate-500">{s.hours} h</span>
                        <span className="tabular-nums text-slate-500">{s.elevationM} m</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Records */}
                <div className={panel}>
                  <h2 className="text-xs font-black uppercase tracking-wider mb-3 flex items-center gap-2"><Trophy size={13} className="text-amber-500" />Records</h2>
                  <div className="flex flex-col gap-2 text-xs">
                    {[['Longest', summary.records.longest, (a) => `${dist(a.distance / 1000, units)} ${units}`], ['Most climbing', summary.records.mostClimbing, (a) => `${Math.round(a.elevation)} m`],
                      ['Longest time', summary.records.longestTime, (a) => fmtDur(a.moving_time)], [`Fastest run (${dist(5, units, 0)} ${units}+)`, summary.records.fastestRun, (a) => fmtPace({ ...a, sport: 'Run' }, units)],
                      [`Fastest ride (${dist(15, units, 0)} ${units}+)`, summary.records.fastestRide, (a) => fmtPace({ ...a, sport: 'Ride' }, units)]].filter(([, a]) => a).map(([t, a, f]) => (
                      <div key={t} className="flex items-baseline gap-3">
                        <span className="w-36 text-slate-500 shrink-0">{t}</span>
                        <span className="font-bold tabular-nums">{f(a)}</span>
                        <a className="truncate text-slate-500 hover:underline" href={`https://www.strava.com/activities/${a.id}`} target="_blank" rel="noreferrer" title="Open on Strava">{a.name} - {fmtDay(a.day)}</a>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <GoalsPanel isDark={isDark} units={units} panel={panel} field={field} label={label} btn={btn} ghost={ghost} showToast={showToast} />

              {/* AI analysis */}
              <div className={panel}>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <h2 className="text-xs font-black uppercase tracking-wider">Training analysis</h2>
                  {analysis && <span className="text-[10px] text-slate-500">{new Date(analysis.at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}</span>}
                  <button onClick={runAnalysis} disabled={busy === 'analysis'} className={`${btn} ml-auto`}>{busy === 'analysis' ? <RotateCw size={13} className="animate-spin" /> : <Sparkles size={13} />}{analysis ? 'Analyse again' : 'Analyse my training'}</button>
                </div>
                {analysis ? <Prose text={analysis.text} />
                  : <p className="text-xs text-slate-500">An AI coach reads your weekly load, consistency, sport mix and latest activities and writes up what is going well, what to watch, and what to do next. It only uses your logged numbers.</p>}
              </div>

              {/* Glucose during activities */}
              <div className={panel}>
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h2 className="text-xs font-black uppercase tracking-wider flex items-center gap-2"><Droplets size={13} className="text-sky-400" />Glucose during activities</h2>
                  <select className={`${field} !w-auto ml-auto`} value={glucoseSport} onChange={(e) => setGlucoseSport(e.target.value)}>
                    {(sports.length ? sports : [{ sport: 'Run' }]).map((s) => <option key={s.sport} value={s.sport}>{s.sport}</option>)}
                  </select>
                  <button onClick={startMatching} disabled={glucose.progress?.running} className={btn}>{glucose.progress?.running ? <RotateCw size={13} className="animate-spin" /> : <Droplets size={13} />}{glucose.progress?.running ? `Matching ${glucose.progress.done}/${glucose.progress.total}` : 'Match activities'}</button>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
                  Each activity is lined up with your Nightscout glucose, insulin on board, carbs, boluses and temp basal from that time. Your Nightscout only keeps the last few hours, so IMS logs it every 5 minutes
                  {glucose.logger?.since ? <> and has readings since <strong>{new Date(glucose.logger.since).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong> ({glucose.logger.readings} readings). Activities before that cannot be matched.</> : '. Logging has not started yet.'}
                  {' '}Click any activity below to see its chart.
                </p>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <button onClick={backfillGlucose} disabled={busy === 'backfill'} className={ghost} title="Ask Nightscout for anything older than IMS already has - for example after AAPS re-uploads its history">
                    {busy === 'backfill' ? <RotateCw size={13} className="animate-spin" /> : <RotateCw size={13} />} Look for older data in Nightscout
                  </button>
                  <label className={`${ghost} cursor-pointer`} title="Reports > Download glucose data on LibreView">
                    {busy === 'libre' ? <RotateCw size={13} className="animate-spin" /> : <Droplets size={13} />} Import a LibreView CSV
                    <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { importLibre(e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                  <span className="text-[10px] text-slate-500 max-w-md">Missing glucose for an older run? Re-upload from AAPS (NSClient, full sync) and IMS pulls it in by itself, or download your readings from LibreView and import them here (15-minute readings, no insulin data).</span>
                </div>
                {glucose.insights?.runs > 0 ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
                      {[['Matched', glucose.insights.runs], ['Avg start', glucose.insights.overall.avgStart], ['Avg lowest', glucose.insights.overall.avgMin], ['In range', `${glucose.insights.overall.avgInRangePct}%`], ['Low within 2 h', `${glucose.insights.overall.hypoWithin2hPct}%`]].map(([l, v]) => (
                        <div key={l} className={`rounded-lg px-3 py-2 border ${isDark ? 'bg-slate-950/50 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}><div className="text-[9px] font-bold uppercase tracking-wider opacity-60">{l}</div><div className="text-sm font-black tabular-nums">{v ?? '-'}</div></div>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
                      <InsightTable title="By glucose at the start (mmol/L)" rows={glucose.insights.byStartGlucose} isDark={isDark} />
                      <InsightTable title="By insulin on board at the start" rows={glucose.insights.byStartIob} isDark={isDark} />
                      <InsightTable title="By carbs in the hour before" rows={glucose.insights.byCarbsBefore} isDark={isDark} />
                      <InsightTable title="By time since the last bolus" rows={glucose.insights.byTimeSinceBolus} isDark={isDark} />
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button onClick={runGlucoseAnalysis} disabled={busy === 'gAnalysis' || glucose.insights.runs < 3} className={btn}>{busy === 'gAnalysis' ? <RotateCw size={13} className="animate-spin" /> : <Sparkles size={13} />}{glucose.analysis ? 'Analyse again' : 'Find patterns'}</button>
                      {glucose.insights.runs < 3 && <span className="text-[11px] text-slate-500">Needs at least 3 matched activities.</span>}
                      {glucose.analysis && <span className="text-[10px] text-slate-500">{new Date(glucose.analysis.at).toLocaleString('en-GB', { timeZone: 'Europe/London' })} - {glucose.analysis.runs} activities</span>}
                    </div>
                    {glucose.analysis && <Prose className="mt-3" text={glucose.analysis.text} />}
                  </>
                ) : <p className="text-xs text-slate-500">No {glucoseSport.toLowerCase()}s matched yet. After your next one syncs it appears here automatically; press "Match activities" to process any that are waiting.</p>}
              </div>

              {/* Activities */}
              <div className={panel}>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <h2 className="text-xs font-black uppercase tracking-wider">Activities ({list.total})</h2>
                  <select className={`${field} !w-auto`} value={filters.sport} onChange={(e) => { setPage(0); setFilters({ ...filters, sport: e.target.value }); }}>
                    <option value="">All sports</option>
                    {sports.map((s) => <option key={s.sport} value={s.sport}>{s.sport} ({s.n})</option>)}
                  </select>
                  <input className={`${field} !w-48`} placeholder="Search names..." value={filters.search} onChange={(e) => { setPage(0); setFilters({ ...filters, search: e.target.value }); }} />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                      <th className="py-1.5 pr-3">Date</th><th className="pr-3">Name</th><th className="pr-3">Sport</th><th className="pr-3 text-right">Distance</th><th className="pr-3 text-right">Time</th><th className="pr-3 text-right">Pace / speed</th><th className="pr-3 text-right">Climb</th><th className="pr-3 text-right">HR</th><th className="text-right">Glucose start / low / end</th><th />
                    </tr></thead>
                    <tbody>
                      {list.activities.map((a) => {
                        const bd = glucose.badges[a.id];
                        const open = openId === a.id;
                        return (
                          <Fragment key={a.id}>
                            <tr onClick={() => setOpenId(open ? null : a.id)} className={`border-t cursor-pointer ${isDark ? 'border-white/5 hover:bg-white/5' : 'border-[#2E2B27]/5 hover:bg-black/5'}`}>
                              <td className="py-1.5 pr-3 whitespace-nowrap text-slate-500">{fmtDay(a.day)}</td>
                              <td className="pr-3 font-semibold max-w-[16rem] truncate">{a.name}</td>
                              <td className="pr-3">{a.sport}</td>
                              <td className="pr-3 text-right tabular-nums">{dist(a.distance / 1000, units)} {units}</td>
                              <td className="pr-3 text-right tabular-nums">{fmtDur(a.moving_time)}</td>
                              <td className="pr-3 text-right tabular-nums">{fmtPace(a, units)}</td>
                              <td className="pr-3 text-right tabular-nums">{a.elevation ? `${Math.round(a.elevation)} m` : '-'}</td>
                              <td className="pr-3 text-right tabular-nums">{a.avg_hr ? Math.round(a.avg_hr) : '-'}</td>
                              <td className={`text-right tabular-nums whitespace-nowrap ${bd?.hypo ? 'text-red-500 font-bold' : ''}`}>{bd ? `${bd.bgStart ?? '-'} / ${bd.bgMin ?? '-'} / ${bd.bgEnd ?? '-'}${bd.iobStart != null ? ` (${bd.iobStart} U)` : ''}` : <span className="text-slate-500 text-[10px]">tap to check</span>}</td>
                              <td className="pl-2 whitespace-nowrap">
                                <ChevronDown size={12} className={`inline opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} />
                                <a href={`https://www.strava.com/activities/${a.id}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="opacity-50 hover:opacity-100 ml-1" title="Open on Strava"><ExternalLink size={12} className="inline" /></a>
                              </td>
                            </tr>
                            {open && (<tr><td colSpan={10} className="px-1"><GlucoseDetail id={a.id} km={Math.round((a.distance / 1000) * 10) / 10} isDark={isDark} /></td></tr>)}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-end gap-2 mt-3 text-[11px] text-slate-500">
                  <button className={ghost} disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={12} /></button>
                  Page {page + 1} of {pages}
                  <button className={ghost} disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={12} /></button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </PortalShell>
  );
}
