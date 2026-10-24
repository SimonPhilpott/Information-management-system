// Activities in the IMS design (25 Oct 2026, Simon chose option A with B as its Trends room): a feed of activity
// cards (route map, the numbers and a glucose line for the run) with this week against the goal at the top, then
// rooms for Trends (period totals, training load, heart-rate zones, the 26-week chart, sports, records and the AI
// read-out), Goals and Glucose (glucose during activities). Sync Strava is the button in the bottom right; the
// Strava connection lives in a sheet. The same /api/strava and /api/goals requests as before
// (Dashboard/ActivitiesPortal.jsx), whose per-run glucose chart and run review are reused when a card is opened.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ServicePage, { Empty, Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextField, SelectField, FilterChip, Segmented, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';
import { GlucoseDetail } from '../Dashboard/ActivitiesPortal';
import Prose from '../Dashboard/Prose';
import TrainingLoad from '../RunBeta/TrainingLoad';
import { useUnits, dist, toKm, paceText, speedText, elev, elevUnit, KM_PER_MI } from '../../utils/units';
import '../RunBeta/rpb.css';
import '../RunBeta/rpb-plan.css';
import '../RunBeta/rpb-screens.css';

const PAGE = 25;
const PACE_SPORTS = ['Run', 'TrailRun', 'Walk', 'Hike', 'VirtualRun'];
const ROOMS = [['feed', 'Feed', 'list'], ['trends', 'Trends', 'chart'], ['goals', 'Goals', 'flag'], ['glucose', 'Glucose', 'blood']];
const METRICS = [['distanceKm', 'Distance'], ['hours', 'Time'], ['elevationM', 'Climbing'], ['count', 'Activities'], ['pace', 'Avg pace']];
const SORTS = [['start_local:desc', 'Newest first'], ['start_local:asc', 'Oldest first'], ['distance:desc', 'Longest'], ['moving_time:desc', 'Most time'], ['avg_speed:desc', 'Fastest'], ['elevation:desc', 'Most climbing'], ['avg_hr:desc', 'Highest heart rate']];
const TAGS = [['', 'All sessions'], ['none', 'Standard only'], ['speed', 'Speed sessions'], ['hill', 'Hill sessions']];
const LOW = 4.0, HIGH = 7.5;

const fmtDur = (s) => {
  if (s == null) return '-';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
};
const fmtDay = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtShort = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const fmtPace = (a, units) => {
  if (!a.avg_speed) return null;
  if (PACE_SPORTS.includes(a.sport)) return `${paceText(1000 / a.avg_speed / 60, units)} /${units}`;
  return speedText(a.avg_speed, units);
};
const fmtWhen = (t) => new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
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
const sportWord = (s) => ({ Run: 'Runs', TrailRun: 'Trail runs', Ride: 'Rides', Walk: 'Walks', Hike: 'Hikes', Swim: 'Swims', VirtualRun: 'Treadmill', VirtualRide: 'Indoor rides', WeightTraining: 'Weights', Workout: 'Workouts', Yoga: 'Yoga' }[s] || s);
const sportIcon = (s) => (/Run/.test(s) ? 'run' : /Walk|Hike/.test(s) ? 'terrain' : /Ride/.test(s) ? 'route' : 'bolt');

// Google's encoded polyline, to [lat, lng] points
function decodePolyline(str) {
  const pts = []; let i = 0, lat = 0, lng = 0;
  while (str && i < str.length) {
    for (const k of [0, 1]) {
      let b, shift = 0, out = 0;
      do { b = str.charCodeAt(i++) - 63; out |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i < str.length);
      const d = out & 1 ? ~(out >> 1) : out >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}

// the route as a small drawing, kept to its own shape
function RouteMap({ polyline, sport }) {
  const d = useMemo(() => {
    const pts = decodePolyline(polyline);
    if (pts.length < 2) return null;
    const k = Math.cos((pts[0][0] * Math.PI) / 180);
    const xs = pts.map((p) => p[1] * k), ys = pts.map((p) => -p[0]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const span = Math.max(x1 - x0, y1 - y0) || 1, S = 52 / span;
    const ox = 6 + (52 - (x1 - x0) * S) / 2, oy = 6 + (52 - (y1 - y0) * S) / 2;
    const step = Math.max(1, Math.floor(pts.length / 160));
    return xs.filter((_, i) => i % step === 0 || i === xs.length - 1).map((x, j) => { const i = Math.min(xs.length - 1, j * step); return `${j ? 'L' : 'M'}${(ox + (xs[i] - x0) * S).toFixed(1)},${(oy + (ys[i] - y0) * S).toFixed(1)}`; }).join('');
  }, [polyline]);
  return (
    <span className="map" aria-hidden="true">
      {d ? <svg viewBox="0 0 64 64"><path d={d} /></svg> : <Icon n={sportIcon(sport)} size={28} />}
    </span>
  );
}

// the run's glucose, start to finish, over the 4 to 7.5 band
function GlucoseLine({ spark }) {
  if (!spark || spark.length < 2) return null;
  const lo = Math.min(3, ...spark), hi = Math.max(11, ...spark);
  const Y = (v) => 2 + (1 - (v - lo) / (hi - lo)) * 20;
  const pts = spark.map((v, i) => `${((i / (spark.length - 1)) * 200).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const minV = Math.min(...spark);
  return (
    <svg className="gline" viewBox="0 0 200 24" preserveAspectRatio="none" role="img" aria-label="Glucose during the activity">
      <rect className="band" x="0" y={Y(HIGH)} width="200" height={Y(LOW) - Y(HIGH)} rx="3" />
      <polyline points={pts} className={minV < LOW ? 'low' : Math.max(...spark) > 10 ? 'high' : 'ok'} />
    </svg>
  );
}

function ActivityCard({ a, bd, units, open, onOpen, onTag, tagging, dark }) {
  const isRun = PACE_SPORTS.includes(a.sport);
  const km = Math.round((a.distance / 1000) * 10) / 10;
  const pace = fmtPace(a, units);
  const g = bd ? (bd.hypo || (bd.bgMin != null && bd.bgMin < LOW) ? ['warn', `Dipped to ${bd.bgMin}`] : bd.pctInRange === 100 ? ['gin', 'In range all the way'] : bd.pctInRange != null ? ['', `${bd.pctInRange}% in range`] : ['', `${bd.bgStart ?? '-'} to ${bd.bgEnd ?? '-'}`]) : null;
  return (
    <div className={`imsm-act ${open ? 'open' : ''}`}>
      <div className="hd sl" role="button" tabIndex={0} aria-expanded={open} onClick={onOpen} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onOpen(); } }}>
        <RouteMap polyline={a.polyline} sport={a.sport} />
        <span className="txt">
          <b>{a.name}</b>
          <span className="meta">{fmtShort(a.day)} · {a.distance ? `${dist(a.distance / 1000, units)} ${units} · ` : ''}{fmtDur(a.moving_time)}{pace ? ` · ${pace}` : ''}</span>
          <GlucoseLine spark={bd?.spark} />
          <span className="tags">
            {g && <span className={`tag ${g[0]}`}>{g[1]}</span>}
            {bd?.iobStart != null && <span className="tag">{bd.iobStart} u on board at the start</span>}
            {a.avg_hr ? <span className="tag">{Math.round(a.avg_hr)} bpm</span> : null}
            {a.elevation > 20 ? <span className="tag">{elev(a.elevation, units)} {elevUnit(units)} climbed</span> : null}
            {a.session_tag === 'speed' && <span className="tag warn">Speed session</span>}
            {a.session_tag === 'hill' && <span className="tag good">Hill session</span>}
            {!bd && <span className="tag quiet">Open to check glucose</span>}
          </span>
        </span>
        <Icon n="down" size={22} className={`chev ${open ? 'up' : ''}`} />
      </div>
      {open && (
        <div className="bd">
          <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
            {isRun ? (
              <Segmented label="Session type" value={a.session_tag || ''} onChange={(v) => !tagging && onTag(a.id, v || null)} options={[['', 'Standard'], ['speed', 'Speed'], ['hill', 'Hill']]} />
            ) : <span />}
            <a className="btn sl text icon" href={`https://www.strava.com/activities/${a.id}`} target="_blank" rel="noreferrer"><Icon n="open" />Open on Strava</a>
          </div>
          {isRun && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Speed and hill sessions count towards your distance but their pace stays out of your running averages.</p>}
          <div className="rpb-legacy imsm-actdetail">
            <GlucoseDetail id={a.id} km={km} isDark={dark} sessionTag={a.session_tag} onUpdateTag={onTag} />
          </div>
        </div>
      )}
    </div>
  );
}

function InsightTable({ title, rows }) {
  if (!rows?.length) return null;
  const n = (v, s = '') => (v == null ? '-' : `${v}${s}`);
  return (
    <div className="imsm-itable">
      <h4>{title}</h4>
      <div className="scrollx">
        <table>
          <thead><tr><th>Group</th><th>Runs</th><th>Start</th><th>Lowest</th><th>Change</th><th>In range</th><th>Low within 2 h</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td><td>{r.runs}</td><td>{n(r.avgStart)}</td>
              <td className={r.avgMin != null && r.avgMin < LOW ? 'bad' : ''}>{n(r.avgMin)}</td>
              <td>{r.avgChange != null ? `${r.avgChange > 0 ? '+' : ''}${r.avgChange}` : '-'}</td>
              <td>{n(r.avgInRangePct, '%')}</td>
              <td className={r.hypoPct > 25 ? 'bad' : ''}>{n(r.hypoPct, '%')}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

const Delta = ({ now, before }) => {
  if (!before) return <span className="s">No earlier data</span>;
  const pct = Math.round(((now - before) / before) * 100);
  return <span className={`s ${pct > 2 ? 'up' : pct < -2 ? 'dn' : ''}`}>{pct > 0 ? '+' : ''}{pct}% on the period before</span>;
};

function Body({ theme }) {
  const dark = theme === 'dark';
  const snack = useSnack();
  const err = useCallback((m) => snack(m, { error: true }), [snack]);
  const { units, setUnits } = useUnits();
  const [room, setRoom] = useState('feed');
  const [status, setStatus] = useState(null);
  const [summary, setSummary] = useState(null);
  const [sports, setSports] = useState([]);
  const [list, setList] = useState({ total: 0, activities: [] });
  const [filters, setFilters] = useState({ sport: '', search: '', tag: '', sort: 'start_local:desc' });
  const [page, setPage] = useState(0);
  const [metric, setMetric] = useState('distanceKm');
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [glucose, setGlucose] = useState({ logger: null, progress: null, badges: {}, insights: null, analysis: null });
  const [glucoseSport, setGlucoseSport] = useState('Run');
  const [openId, setOpenId] = useState(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [taggingId, setTaggingId] = useState(null);
  const [creds, setCreds] = useState({ clientId: '', clientSecret: '' });
  const [stravaSheet, setStravaSheet] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [goals, setGoals] = useState([]);
  const [plans, setPlans] = useState({});
  const [goalSheet, setGoalSheet] = useState(null); // { id?, name, distance, time, date }
  const libreRef = useRef(null);

  const call = useCallback(async (url, options) => {
    const res = await fetch(url, { credentials: 'same-origin', ...options });
    const d = await res.json().catch(() => ({}));
    if (res.status === 401) { setNeedsSignIn(true); throw new Error(d.error || 'Sign in required.'); }
    if (!res.ok || d.success === false) throw new Error(d.error || 'It didn\'t work.');
    return d;
  }, []);
  const send = useCallback((url, method, body) => call(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }), [call]);

  const loadStatus = useCallback(async () => {
    try { const s = await call('/api/strava/status'); setNeedsSignIn(false); setStatus(s); return s; }
    catch { return null; }
    finally { setLoading(false); }
  }, [call]);
  const loadData = useCallback(async () => {
    try {
      const [sum, sp, an] = await Promise.all([call('/api/strava/summary'), call('/api/strava/sports'), call(`/api/strava/analysis?units=${units}`)]);
      setSummary(sum); setSports(sp.sports); setAnalysis(an.analysis);
    } catch { /* shown by the status */ }
  }, [call, units]);
  const loadGlucose = useCallback(async () => {
    try {
      const [st, bd, ins] = await Promise.all([call('/api/strava/glucose/status'), call('/api/strava/glucose/badges'), call(`/api/strava/glucose/insights?sport=${encodeURIComponent(glucoseSport)}&units=${units}`)]);
      setGlucose({ logger: st.logger, progress: st.progress, badges: bd.badges, insights: ins.insights, analysis: ins.analysis });
    } catch { /* optional */ }
  }, [call, glucoseSport, units]);
  const loadList = useCallback(async () => {
    try {
      const [sortBy, sortDir] = filters.sort.split(':');
      const q = new URLSearchParams({ limit: PAGE, offset: page * PAGE, sortBy, sortDir, ...(filters.sport && { sport: filters.sport }), ...(filters.search && { search: filters.search }), ...(filters.tag && { tag: filters.tag }) });
      const d = await call(`/api/strava/activities?${q}`);
      setList((prev) => (page ? { total: d.total, activities: [...prev.activities, ...d.activities.filter((a) => !prev.activities.some((p) => p.id === a.id))] } : { total: d.total, activities: d.activities }));
    } catch { /* keep */ }
  }, [call, page, filters]);
  const loadGoals = useCallback(async () => {
    try {
      const d = await call('/api/goals');
      setGoals(d.goals);
      const entries = await Promise.all(d.goals.map((a) => call(`/api/goals/${a.goal.id}/plan?units=${units}`).then((r) => [a.goal.id, r.plan]).catch(() => [a.goal.id, null])));
      setPlans(Object.fromEntries(entries));
    } catch { /* optional */ }
  }, [call, units]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('strava') === 'connected') snack('Strava connected. Pulling your activities now...');
    else if (p.get('strava') === 'error') err(p.get('message') || 'Strava sign-in failed.');
    const target = p.get('openActivity') || p.get('activityId');
    if (target) setOpenId(Number(target));
    if (p.has('strava')) window.history.replaceState(null, '', '/ims/activities');
    loadStatus().then((s) => { if (s?.activityCount) loadData(); });
  }, [loadStatus, loadData, snack, err]);
  useEffect(() => { if (status?.activityCount) loadList(); }, [status?.activityCount, loadList]);
  useEffect(() => { if (status?.activityCount) loadGlucose(); }, [status?.activityCount, loadGlucose]);
  useEffect(() => { if (status?.activityCount) loadGoals(); }, [status?.activityCount, loadGoals]);
  // while matching runs in the background, keep the progress fresh
  useEffect(() => {
    if (!glucose.progress?.running) return undefined;
    const t = setInterval(loadGlucose, 3000);
    return () => clearInterval(t);
  }, [glucose.progress?.running, loadGlucose]);
  // a first sync runs in the background after connecting: keep checking until it lands
  useEffect(() => {
    if (!status?.connected || status.activityCount) return undefined;
    const t = setInterval(() => loadStatus().then((s) => { if (s?.activityCount) loadData(); }), 4000);
    return () => clearInterval(t);
  }, [status?.connected, status?.activityCount, loadStatus, loadData]);

  const setFilter = (patch) => { setPage(0); setFilters((f) => ({ ...f, ...patch })); };
  const signInGoogle = async () => {
    try { const d = await (await fetch(`/api/auth/url?returnTo=${encodeURIComponent(window.location.pathname)}`)).json(); if (d.url) window.location.href = d.url; }
    catch (e) { err(e.message); }
  };
  const saveCreds = async () => {
    try {
      const body = {}; if (creds.clientId.trim()) body.clientId = creds.clientId; if (creds.clientSecret.trim()) body.clientSecret = creds.clientSecret;
      await send('/api/strava/credentials', 'PUT', body);
      setCreds({ clientId: '', clientSecret: '' }); snack('Saved (the secret is stored encrypted).'); loadStatus();
    } catch (e) { err(e.message); }
  };
  const connect = async () => { try { const d = await call('/api/strava/connect-url'); window.location.href = d.url; } catch (e) { err(e.message); } };
  const sync = async (full) => {
    setBusy('sync');
    try { const d = await send('/api/strava/sync', 'POST', { full }); snack(`Synced: ${d.fetched} activities checked, ${d.total} stored.`); await loadStatus(); loadData(); setPage(0); loadList(); loadGlucose(); }
    catch (e) { err(e.message); loadStatus(); }
    finally { setBusy(''); }
  };
  const fullSync = () => setConfirm({ title: 'Re-read your whole history from Strava?', body: 'It uses a few of your Strava requests, and takes a minute or two.', okLabel: 'Re-sync', onOk: () => sync(true) });
  const disconnect = () => setConfirm({ title: 'Disconnect Strava?', body: 'Your logged activities stay; syncing stops until you connect again.', okLabel: 'Disconnect', danger: true, onOk: async () => { try { await send('/api/strava/disconnect', 'POST'); setStravaSheet(false); loadStatus(); } catch (e) { err(e.message); } } });
  const runAnalysis = async () => {
    setBusy('analysis');
    try { setAnalysis((await send('/api/strava/analysis', 'POST', { units })).analysis); }
    catch (e) { err(e.message); } finally { setBusy(''); }
  };
  const updateTag = async (id, tag) => {
    setTaggingId(id);
    try {
      const d = await send(`/api/strava/activities/${id}/tag`, 'PUT', { tag });
      setList((prev) => ({ ...prev, activities: prev.activities.map((a) => (a.id === id ? { ...a, session_tag: d.activity?.session_tag ?? tag } : a)) }));
      snack(tag === 'speed' ? 'Tagged as a speed session: the distance counts, the pace stays out of your averages.' : tag === 'hill' ? 'Tagged as a hill session: the distance counts, the pace stays out of your averages.' : 'Back to a standard session.');
      loadData();
    } catch (e) { err(e.message); } finally { setTaggingId(null); }
  };
  const startMatching = async () => { try { await send('/api/strava/glucose/match', 'POST', {}); snack('Matching activities with your glucose log...'); setTimeout(loadGlucose, 800); } catch (e) { err(e.message); } };
  const backfill = async () => {
    setBusy('backfill');
    try { const d = await send('/api/strava/glucose/backfill', 'POST', {}); d.entries ? snack(`Found older data in Nightscout: ${d.entries} readings pulled in.`) : err('Nightscout has nothing older than IMS already holds.'); loadGlucose(); }
    catch (e) { err(e.message); } finally { setBusy(''); }
  };
  const importLibre = async (file) => {
    if (!file) return;
    setBusy('libre');
    try { const d = await send('/api/strava/glucose/import-libre', 'POST', { csv: await file.text() }); snack(`Imported ${d.added} new glucose readings (${d.read} in the file). Matching your activities now...`); setTimeout(loadGlucose, 1500); }
    catch (e) { err(e.message); } finally { setBusy(''); }
  };
  const runGlucoseAnalysis = async () => {
    setBusy('gAnalysis');
    try { const d = await send('/api/strava/glucose/analysis', 'POST', { sport: glucoseSport, units }); setGlucose((g) => ({ ...g, analysis: d.analysis })); }
    catch (e) { err(e.message); } finally { setBusy(''); }
  };
  // goals
  const saveGoal = async () => {
    const f = goalSheet;
    try {
      const time = parseTime(f.time);
      if (Number.isNaN(time)) throw new Error('Type the time like 55:00 or 1:55:00.');
      const body = { name: f.name, distanceKm: toKm(f.distance, units), targetMin: time, targetDate: f.date || null };
      if (f.id) await send(`/api/goals/${f.id}`, 'PUT', body); else await send('/api/goals', 'POST', body);
      setGoalSheet(null); snack(f.id ? 'Goal saved.' : 'Goal added.'); loadGoals();
    } catch (e) { err(e.message); }
  };
  const editGoal = (g) => setGoalSheet({ id: g.id, name: g.name, distance: String(dist(g.distanceKm, units, 2)), time: g.targetMin ? fmtHms(g.targetMin) : '', date: g.targetDate || '' });
  const removeGoal = (g) => setConfirm({ title: `Delete the goal "${g.name}"?`, okLabel: 'Delete', danger: true, onOk: async () => { try { await call(`/api/goals/${g.id}`, { method: 'DELETE' }); loadGoals(); snack('Goal deleted.'); } catch (e) { err(e.message); } } });
  const makePlan = async (id) => {
    setBusy(`p${id}`);
    try { const d = await send(`/api/goals/${id}/plan`, 'POST', { units }); setPlans((p) => ({ ...p, [id]: d.plan })); }
    catch (e) { err(e.message); } finally { setBusy(''); }
  };

  // ---- the weekly chart (as before) ----
  const weeks = useMemo(() => summary?.weekly || [], [summary]);
  const isPace = metric === 'pace';
  const perUnit = units === 'mi' ? KM_PER_MI : 1;
  const weekVal = (w) => (isPace ? (w.paceMinKm ? w.paceMinKm * perUnit : null) : metric === 'distanceKm' ? dist(w.distanceKm, units) : w[metric]);
  const fmtWeekVal = (v) => {
    if (v == null) return '-';
    if (isPace) return `${paceText(v / perUnit, units)} /${units}`;
    return metric === 'distanceKm' ? `${v} ${units}` : metric === 'hours' ? `${v} h` : metric === 'elevationM' ? `${v} m climbed` : `${v}`;
  };
  const vals = weeks.map(weekVal);
  const present = vals.filter((v) => v != null && v > 0);
  const max = Math.max(1, ...present);
  const fastest = present.length ? Math.min(...present) : null;
  const barFrac = (v) => (v == null || v <= 0 ? 0 : isPace ? fastest / v : v / max);
  const totalVal = isPace ? null : vals.reduce((a, v) => a + (v || 0), 0);
  const bestIdx = present.length ? vals.indexOf(isPace ? fastest : max) : -1;
  const periodPace = (() => { const km = weeks.reduce((a, w) => a + (w.runKm || 0), 0); const hrs = weeks.reduce((a, w) => a + (w.runKm && w.paceMinKm ? (w.runKm * w.paceMinKm) / 60 : 0), 0); return km > 0 ? ((hrs * 60) / km) * perUnit : null; })();
  const sel = selectedWeek != null ? weeks.find((w) => w.weekStart === selectedWeek) : null;

  // ---- this week against the goal ----
  const week = useMemo(() => {
    if (!weeks.length) return null;
    const now = weeks[weeks.length - 1];
    const goal = goals.map((a) => a).filter((a) => a.recommended?.weeklyKm).sort((a, b) => (a.goal.targetDate || '9999').localeCompare(b.goal.targetDate || '9999'))[0];
    const prev = weeks.slice(-5, -1).filter((w) => w.distanceKm > 0);
    const avg = prev.length ? prev.reduce((s, w) => s + w.distanceKm, 0) / prev.length : null;
    const targetKm = goal ? goal.recommended.weeklyKm : avg;
    return { now, targetKm, goalName: goal?.goal.name, avg, frac: targetKm ? Math.min(1, now.distanceKm / targetKm) : 0 };
  }, [weeks, goals]);

  const topSports = sports.slice(0, 4);
  const zones = summary?.periods?.last28?.hrZones;
  const signedOut = needsSignIn;
  const connected = status?.connected && status?.canReadActivities;

  if (signedOut) return <Empty icon="lock" title="Sign in to see your training">Your training data is only available to your signed-in Google account.<br /><Btn icon="person" onClick={signInGoogle} style={{ marginTop: 12 }}>Sign in with Google</Btn></Empty>;
  if (loading || !status) return <div className="imsm-row" style={{ justifyContent: 'center', padding: 48 }}><Spinner /></div>;

  const stravaLine = status.connected ? (
    <>
      {status.activityCount} activities logged{status.earliest ? `, ${fmtDay(status.earliest)} to ${fmtDay(status.latest)}` : ''}.
      {status.lastSync ? ` Last checked ${fmtWhen(status.lastSync)}; it checks again every 30 minutes.` : ' First sync running...'}
    </>
  ) : 'Not connected.';

  const connectCard = (
    <section className="imsm-card">
      <h3><Icon n="link" size={20} />Connect Strava</h3>
      <p style={{ margin: 0 }}>Strava's default token only has basic access and can't read activities, so you connect once and approve <b>View data about your activities</b>. On your Strava API settings page, set <b>Authorization Callback Domain</b> to <code>{status.callbackDomain || 'localhost'}</code> (the address you're on now; Strava allows one domain, so use the address you sign in from).</p>
      {(!status.hasClientId || !status.hasClientSecret) && (
        <div className="imsm-form">
          <div className="two">
            {!status.hasClientId && <TextField label="Client ID (the number)" value={creds.clientId} onChange={(v) => setCreds({ ...creds, clientId: v })} inputMode="numeric" />}
            {!status.hasClientSecret && <TextField label="Client secret" type="password" autoComplete="new-password" value={creds.clientSecret} onChange={(v) => setCreds({ ...creds, clientSecret: v })} />}
          </div>
          <div className="imsm-row end"><Btn kind="tonal" icon="check" disabled={!creds.clientId.trim() && !creds.clientSecret.trim()} onClick={saveCreds}>Save</Btn></div>
        </div>
      )}
      <div className="imsm-row">
        <Btn icon="link" disabled={!status.hasClientId || !status.hasClientSecret} onClick={connect}>Connect Strava</Btn>
        <span className="muted" style={{ fontSize: 14 }}>{status.hasClientSecret ? 'Client secret saved (encrypted). ' : ''}{status.hasClientId ? 'Client ID saved.' : 'Enter your Client ID to continue.'}</span>
      </div>
    </section>
  );

  return (
    <>
      {status.lastSyncError && <div className="imsm-banner"><Icon n="warn" size={22} /><span>{status.lastSyncError}</span></div>}
      {!connected && connectCard}

      {status.activityCount > 0 && summary && (
        <>
          {week && (
            <section className="imsm-anow">
              <div className="hd"><span className="lbl">This week</span><span className="tag">{week.now.count} {week.now.count === 1 ? 'activity' : 'activities'}</span></div>
              <div className="num"><b>{dist(week.now.distanceKm, units)}</b><span>{week.targetKm ? `of ${dist(week.targetKm, units)} ${units}` : units}</span>
                <span className="meta">{week.now.hours} h moving<br />{elev(week.now.elevationM, units)} {elevUnit(units)} climbed</span></div>
              {week.targetKm ? <div className="imsm-pbar" role="progressbar" aria-valuenow={Math.round(week.frac * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.round(week.frac * 100)}%` }} /></div> : null}
              <small className="muted">{week.goalName ? `The weekly distance your goal "${week.goalName}" asks for.` : week.avg ? `Against your average week over the last month.` : 'Set a goal to see the weekly distance it needs.'}</small>
            </section>
          )}
          <div className="imsm-ptabs"><div className="chips">{ROOMS.map(([k, l, ic]) => <FilterChip key={k} on={room === k} onClick={() => setRoom(k)} lead={<Icon n={ic} size={18} />}>{l}</FilterChip>)}</div></div>

          {room === 'feed' && (
            <>
              <div className="imsm-row">
                <FilterChip on={!filters.sport} onClick={() => setFilter({ sport: '' })}>Everything</FilterChip>
                {topSports.map((s) => <FilterChip key={s.sport} on={filters.sport === s.sport} onClick={() => setFilter({ sport: filters.sport === s.sport ? '' : s.sport })} count={s.n}>{sportWord(s.sport)}</FilterChip>)}
              </div>
              <div className="imsm-afilters">
                <TextField label="Search the names" value={filters.search} onChange={(v) => setFilter({ search: v })} />
                <SelectField label="Order" value={filters.sort} onChange={(v) => setFilter({ sort: v })} options={SORTS} />
                <SelectField label="Sessions" value={filters.tag} onChange={(v) => setFilter({ tag: v })} options={TAGS} />
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>{list.total} {list.total === 1 ? 'activity' : 'activities'}. Open one for its glucose, insulin and the run review.</p>
              {list.activities.length ? (
                <div className="imsm-acts">
                  {list.activities.map((a) => (
                    <ActivityCard key={a.id} a={a} bd={glucose.badges[a.id]} units={units} dark={dark} open={openId === a.id} onOpen={() => setOpenId(openId === a.id ? null : a.id)} onTag={updateTag} tagging={taggingId === a.id} />
                  ))}
                </div>
              ) : <Empty icon="run" title="Nothing matches">Try another sport or clear the search.</Empty>}
              {list.activities.length < list.total && <div className="imsm-row" style={{ justifyContent: 'center' }}><Btn kind="tonal" icon="down" onClick={() => setPage(page + 1)}>Show more</Btn></div>}
              <section className="imsm-card quiet">
                <div className="imsm-row" style={{ justifyContent: 'space-between' }}><h3><Icon n="sync" size={20} />Strava</h3><Btn kind="text" icon="tune" onClick={() => setStravaSheet(true)}>Strava settings</Btn></div>
                <p className="muted" style={{ margin: 0 }}>{connected ? `Connected${status.athlete?.name ? ` as ${status.athlete.name}` : ''}. ` : ''}{stravaLine}</p>
              </section>
            </>
          )}

          {room === 'trends' && (
            <>
              <div className="imsm-row" style={{ justifyContent: 'flex-end' }}><Segmented label="Distances in" value={units} onChange={setUnits} options={[['km', 'Kilometres'], ['mi', 'Miles']]} /></div>
              <div className="imsm-stats">
                {[['last7', 'Last 7 days'], ['last28', 'Last 28 days'], ['last365', 'Last 12 months']].map(([k, title]) => {
                  const p = summary.periods[k];
                  return (
                    <div key={k} className="imsm-stat">
                      <span className="k">{title}</span>
                      <b>{dist(p.distanceKm, units)} <small>{units}</small></b>
                      <Delta now={p.distanceKm} before={p.previous.distanceKm} />
                      <span className="s">{p.count} activities · {p.hours} h · {elev(p.elevationM, units)} {elevUnit(units)} climbed{p.avgHr ? ` · average ${p.avgHr} bpm` : ''}</span>
                    </div>
                  );
                })}
              </div>
              <div className={`hbb rpb ${dark ? 'dark' : ''} imsm-embed`}><TrainingLoad units={units} /></div>

              {zones && (
                <section className="imsm-card">
                  <h3><Icon n="blood" size={20} />Heart-rate zones, the last 4 weeks</h3>
                  <div className="imsm-zones">
                    <div className="bar"><i className="z1" style={{ width: `${zones.aerobic.pctDist}%` }} /><i className="z2" style={{ width: `${zones.threshold.pctDist}%` }} /><i className="z3" style={{ width: `${zones.vo2max.pctDist}%` }} /></div>
                    <div className="cards">
                      {[['z1', 'Easy (zones 1 and 2)', 'under 145 bpm', zones.aerobic, 'Base building and fat burning. The steadiest for your glucose.'],
                        ['z2', 'Threshold (zones 3 and 4)', '145 to 168 bpm', zones.threshold, 'Tempo and threshold work. Burns through muscle glycogen faster.'],
                        ['z3', 'Hard (zone 5)', 'over 168 bpm', zones.vo2max, 'Intervals and peak efforts. Adrenaline can push your glucose up.']].map(([c, t, r, z, note]) => (
                        <div key={c} className={`zc ${c}`}>
                          <span className="t"><i />{t}<small>{r}</small></span>
                          <b>{z.pctDist}%<small> · {dist(z.km, units)} {units} · {z.hours} h</small></b>
                          <span className="n">{z.count} sessions. {note}</span>
                        </div>
                      ))}
                    </div>
                    <p className="muted" style={{ margin: 0, fontSize: 14 }}>From {zones.totalCount} activities with heart rate ({dist(zones.totalKm, units)} {units}, {zones.totalHours} h). The usual aim is about 80% easy and 20% harder.</p>
                  </div>
                </section>
              )}

              <section className="imsm-card">
                <h3><Icon n="chart" size={20} />Every week, the last 26</h3>
                <div className="imsm-chipsx">{METRICS.map(([k, l]) => <FilterChip key={k} on={metric === k} onClick={() => { setMetric(k); setSelectedWeek(null); }}>{l}</FilterChip>)}</div>
                <div className="imsm-stats four">
                  {(isPace ? [
                    ['Average', periodPace ? `${paceText(periodPace / perUnit, units)} /${units}` : '-'], ['Fastest week', fastest ? fmtWeekVal(fastest) : '-'],
                    ['Slowest week', present.length ? fmtWeekVal(Math.max(...present)) : '-'], ['This week', fmtWeekVal(vals[vals.length - 1])],
                  ] : [
                    ['In 26 weeks', fmtWeekVal(metric === 'count' ? totalVal : Math.round(totalVal * 10) / 10)], ['A typical week', fmtWeekVal(Math.round((totalVal / Math.max(1, weeks.length)) * 10) / 10)],
                    ['Best week', bestIdx >= 0 ? fmtWeekVal(vals[bestIdx]) : '-'], ['This week', fmtWeekVal(vals[vals.length - 1])],
                  ]).map(([k, v]) => <div key={k} className="imsm-stat"><span className="k">{k}</span><b style={{ fontSize: 22 }}>{v}</b></div>)}
                </div>
                <div className="imsm-wk">
                  {weeks.map((w, i) => {
                    const v = vals[i], on = selectedWeek === w.weekStart;
                    return (
                      <button key={w.weekStart} type="button" className={`sl ${on ? 'on' : ''}`} onClick={() => setSelectedWeek(on ? null : w.weekStart)} title={`Week of ${fmtDay(w.weekStart)}: ${fmtWeekVal(v)}`} aria-label={`Week of ${fmtDay(w.weekStart)}: ${fmtWeekVal(v)}`}>
                        <i style={{ height: `${Math.max(v ? 3 : 1, barFrac(v) * 100)}%`, opacity: v ? 1 : 0.25 }} />
                      </button>
                    );
                  })}
                </div>
                <div className="imsm-row muted" style={{ justifyContent: 'space-between', fontSize: 13 }}><span>{fmtDay(weeks[0]?.weekStart)}</span><span>{isPace ? 'taller is faster' : `the tallest is ${fmtWeekVal(max)}`}</span><span>this week</span></div>
                {sel ? (
                  <div className="imsm-wsel">
                    <b>Week of {fmtDay(sel.weekStart)}</b>
                    <span>{sel.count} activities · {dist(sel.distanceKm, units)} {units} · {sel.hours} h · {elev(sel.elevationM, units)} {elevUnit(units)} climbed{sel.paceMinKm ? ` · running pace ${paceText(sel.paceMinKm, units)} /${units}` : ''}{sel.avgHr ? ` · average ${sel.avgHr} bpm` : ''}</span>
                  </div>
                ) : <p className="muted" style={{ margin: 0, fontSize: 14 }}>Tap a bar for that week.{isPace ? ' Pace is the running average for the week.' : ''}</p>}
              </section>

              <div className="imsm-two">
                <section className="imsm-card">
                  <h3><Icon n="bolt" size={20} />By sport, all time</h3>
                  <div className="imsm-list">
                    {summary.bySport.map((s) => (
                      <div key={s.sport} className="imsm-srow"><Icon n={sportIcon(s.sport)} size={20} /><b>{sportWord(s.sport)}</b><span>{s.count} times</span><span>{dist(s.km, units)} {units}</span><span>{s.hours} h</span></div>
                    ))}
                  </div>
                </section>
                <section className="imsm-card">
                  <h3><Icon n="star" size={20} />Records</h3>
                  <div className="imsm-list">
                    {[['Longest', summary.records.longest, (a) => `${dist(a.distance / 1000, units)} ${units}`], ['Most climbing', summary.records.mostClimbing, (a) => `${elev(a.elevation, units)} ${elevUnit(units)}`],
                      ['Longest time', summary.records.longestTime, (a) => fmtDur(a.moving_time)], [`Fastest run (${dist(5, units, 0)} ${units} or more)`, summary.records.fastestRun, (a) => fmtPace({ ...a, sport: 'Run' }, units)],
                      [`Fastest ride (${dist(15, units, 0)} ${units} or more)`, summary.records.fastestRide, (a) => fmtPace({ ...a, sport: 'Ride' }, units)]].filter(([, a]) => a).map(([t, a, f]) => (
                      <a key={t} className="imsm-rec sl" href={`https://www.strava.com/activities/${a.id}`} target="_blank" rel="noreferrer" title="Open on Strava">
                        <span className="k">{t}</span><b>{f(a)}</b><span className="n">{a.name} · {fmtDay(a.day)}</span>
                      </a>
                    ))}
                  </div>
                </section>
              </div>

              <section className="imsm-card">
                <div className="imsm-row" style={{ justifyContent: 'space-between' }}><h3><Icon n="sparkle" size={20} />What the training says</h3><Btn kind="tonal" icon="sparkle" busy={busy === 'analysis'} onClick={runAnalysis}>{analysis ? 'Read it again' : 'Read my training'}</Btn></div>
                {analysis ? <><div className="imsm-prose"><Prose text={analysis.text} /></div><small className="muted">Written {fmtWhen(analysis.at)}.</small></>
                  : <p className="muted" style={{ margin: 0 }}>An AI coach reads your weekly load, consistency, sport mix and latest activities, and writes up what's going well, what to watch and what to do next. It only uses your logged numbers.</p>}
              </section>
            </>
          )}

          {room === 'goals' && (
            <>
              <section className="imsm-card quiet">
                <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
                  <h3><Icon n="flag" size={20} />Your goals</h3>
                  <Btn kind="tonal" icon="add" onClick={() => setGoalSheet({ name: '', distance: '', time: '', date: '' })}>Add a goal</Btn>
                </div>
                <p className="muted" style={{ margin: 0 }}>A distance, or a distance in a time, by a date if you like. Each one is checked against your Strava running, and the Run planner can plan the carbs for the day itself.</p>
              </section>
              {goals.length === 0 ? <Empty icon="flag" title="No goals yet">Add one, like a 10K in under 55 minutes by the spring.</Empty> : goals.map((a) => {
                const g = a.goal;
                return (
                  <section key={g.id} className="imsm-card imsm-goal">
                    <div className="imsm-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span><h3>{g.name}</h3><span className="muted" style={{ fontSize: 14 }}>{dist(g.distanceKm, units, 1)} {units}{g.targetMin ? ` in ${fmtHms(g.targetMin)} (${paceText(a.targetPaceMinPerKm, units)} /${units})` : ', a distance goal'}{g.targetDate ? `, by ${fmtDay(g.targetDate)}${a.weeksLeft != null ? ` (${a.weeksLeft} weeks)` : ''}` : ''}</span></span>
                      <span className="imsm-row" style={{ gap: 0 }}><IconButton icon="edit" label="Edit the goal" onClick={() => editGoal(g)} /><IconButton icon="del" label="Delete the goal" onClick={() => removeGoal(g)} /></span>
                    </div>
                    <p style={{ margin: 0, fontWeight: 600 }}>{a.verdict}</p>
                    <div className="imsm-gbars">
                      <div><span>Long run<b>{dist(a.current.longestRunKm, units, 1)} of {dist(a.recommended.longRunKm, units, 1)} {units}</b></span><div className="imsm-pbar"><i style={{ width: `${Math.round((a.progress.longRun ?? 0) * 100)}%` }} /></div></div>
                      <div><span>Weekly distance<b>{dist(a.current.weeklyKm, units, 1)} of {dist(a.recommended.weeklyKm, units, 1)} {units}</b></span><div className="imsm-pbar"><i style={{ width: `${Math.round((a.progress.weekly ?? 0) * 100)}%` }} /></div></div>
                      {g.targetMin && <div><span>Predicted from recent runs<b>{a.current.bestPredictedMin ? fmtHms(a.current.bestPredictedMin) : '-'} against {fmtHms(g.targetMin)}</b></span><div className="imsm-pbar"><i style={{ width: `${Math.round((a.progress.time ?? 0) * 100)}%` }} /></div></div>}
                    </div>
                    {a.current.basedOn && <small className="muted">The prediction (Riegel) comes from your {dist(a.current.basedOn.km, units, 1)} {units} run on {fmtDay(a.current.basedOn.day)} in {fmtHms(a.current.basedOn.minutes)}. {a.current.runsPerWeek} runs a week lately.</small>}
                    {a.flags.length > 0 && <ul className="imsm-flags">{a.flags.map((f, i) => <li key={i}><Icon n="warn" size={18} />{f}</li>)}</ul>}
                    <div className="imsm-row">
                      <Btn kind="tonal" icon="sparkle" busy={busy === `p${g.id}`} onClick={() => makePlan(g.id)}>{plans[g.id] ? 'Rewrite the training plan' : 'Build a training plan'}</Btn>
                      <a className="btn sl text icon" href={`/ims/runplanner?goal=${g.id}`}><Icon n="food" />Plan the fuelling</a>
                    </div>
                    {plans[g.id] && <><div className="imsm-prose"><Prose text={plans[g.id].text} /></div><small className="muted">Written {fmtWhen(plans[g.id].at)}.</small></>}
                  </section>
                );
              })}
            </>
          )}

          {room === 'glucose' && (
            <>
              <div className="imsm-banner info"><Icon n="book" size={22} /><span style={{ flex: 1 }}>Run reviews and coaching check your glucose against your Running with T1D rulebook: the pre-run target, insulin on board limits and overnight protection.</span><a className="btn sl text" href="/ims/runplanner#rulebook">The rulebook</a></div>
              <section className="imsm-card">
                <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
                  <h3><Icon n="blood" size={20} />Glucose during activities</h3>
                  <span className="imsm-row">
                    <SelectField label="Sport" value={glucoseSport} onChange={setGlucoseSport} options={(sports.length ? sports : [{ sport: 'Run' }]).map((s) => [s.sport, sportWord(s.sport)])} />
                    <Btn kind="tonal" icon="sync" busy={glucose.progress?.running} onClick={startMatching} disabled={glucose.progress?.running}>{glucose.progress?.running ? `Matching ${glucose.progress.done} of ${glucose.progress.total}` : 'Match activities'}</Btn>
                  </span>
                </div>
                <p className="muted" style={{ margin: 0 }}>
                  Each activity is lined up with your Nightscout glucose, insulin on board, carbs, boluses and temp basal from the time. Nightscout only keeps the last few hours, so IMS logs it every 5 minutes
                  {glucose.logger?.since ? <> and has readings since <b>{fmtWhen(glucose.logger.since)}</b> ({glucose.logger.readings} readings). Activities before that can't be matched.</> : '. Logging hasn\'t started yet.'}
                </p>
                {glucose.insights?.runs > 0 ? (
                  <>
                    <div className="imsm-stats four">
                      {[['Matched', glucose.insights.runs], ['Average start', glucose.insights.overall.avgStart], ['Average lowest', glucose.insights.overall.avgMin], ['In range', `${glucose.insights.overall.avgInRangePct}%`], ['Low within 2 h', `${glucose.insights.overall.hypoWithin2hPct}%`]].map(([k, v]) => (
                        <div key={k} className="imsm-stat"><span className="k">{k}</span><b>{v ?? '-'}</b></div>
                      ))}
                    </div>
                    <div className="imsm-two">
                      <InsightTable title="By glucose at the start (mmol/L)" rows={glucose.insights.byStartGlucose} />
                      <InsightTable title="By insulin on board at the start" rows={glucose.insights.byStartIob} />
                      <InsightTable title="By carbs in the hour before" rows={glucose.insights.byCarbsBefore} />
                      <InsightTable title="By time since the last bolus" rows={glucose.insights.byTimeSinceBolus} />
                    </div>
                  </>
                ) : <Empty icon="blood" title={`No ${sportWord(glucoseSport).toLowerCase()} matched yet`}>After the next one syncs it appears here by itself; Match activities processes any that are waiting.</Empty>}
              </section>
              {glucose.insights?.runs > 0 && (
                <section className="imsm-card">
                  <div className="imsm-row" style={{ justifyContent: 'space-between' }}><h3><Icon n="sparkle" size={20} />The patterns</h3><Btn kind="tonal" icon="sparkle" busy={busy === 'gAnalysis'} disabled={glucose.insights.runs < 3} onClick={runGlucoseAnalysis}>{glucose.analysis ? 'Look again' : 'Find patterns'}</Btn></div>
                  {glucose.analysis ? <><div className="imsm-prose"><Prose text={glucose.analysis.text} /></div><small className="muted">Written {fmtWhen(glucose.analysis.at)} from {glucose.analysis.runs} activities.</small></>
                    : <p className="muted" style={{ margin: 0 }}>{glucose.insights.runs < 3 ? 'Needs at least 3 matched activities.' : 'What tends to keep you in range, and what tends to bring on a low.'}</p>}
                </section>
              )}
              <section className="imsm-card quiet">
                <h3><Icon n="download" size={20} />Missing glucose for an older run?</h3>
                <p className="muted" style={{ margin: 0 }}>Re-upload from AAPS (NSClient, full sync) and IMS pulls it in by itself, or download your readings from LibreView (Reports, Download glucose data) and import them here. LibreView readings are 15 minutes apart, with no insulin data.</p>
                <div className="imsm-row">
                  <Btn kind="tonal" icon="sync" busy={busy === 'backfill'} onClick={backfill}>Look for older data in Nightscout</Btn>
                  <Btn kind="text" icon="upload" busy={busy === 'libre'} onClick={() => libreRef.current?.click()}>Import a LibreView CSV</Btn>
                  <input ref={libreRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { importLibre(e.target.files?.[0]); e.target.value = ''; }} />
                </div>
              </section>
            </>
          )}
        </>
      )}

      {status.connected && !status.activityCount && <Empty icon="sync" title="The first sync is running">Your activities appear here as soon as Strava sends them.</Empty>}

      <Sheet open={stravaSheet} onClose={() => setStravaSheet(false)} title="Strava"
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setStravaSheet(false)}>Done</Btn></div>}>
        <div className="imsm-form">
          <p style={{ margin: 0 }}><b>{connected ? `Connected${status.athlete?.name ? ` as ${status.athlete.name}` : ''}` : 'Not connected'}</b></p>
          <p className="muted" style={{ margin: 0 }}>{stravaLine}{status.rate?.usage ? ` Strava requests used: ${status.rate.usage.split(',')[0]} of ${status.rate.limit.split(',')[0]} per 15 minutes.` : ''}</p>
          <Segmented label="Distances in" value={units} onChange={setUnits} options={[['km', 'Kilometres'], ['mi', 'Miles']]} />
          {status.connected && (
            <div className="imsm-row">
              <Btn icon="sync" busy={busy === 'sync'} onClick={() => sync(false)}>Sync now</Btn>
              <Btn kind="tonal" disabled={busy === 'sync'} onClick={fullSync}>Full re-sync</Btn>
              <Btn kind="text" icon="linkoff" onClick={disconnect}>Disconnect</Btn>
            </div>
          )}
        </div>
      </Sheet>
      <Sheet open={Boolean(goalSheet)} onClose={() => setGoalSheet(null)} title={goalSheet?.id ? 'Edit the goal' : 'Add a goal'}
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setGoalSheet(null)}>Cancel</Btn><Btn icon="check" disabled={!goalSheet?.name?.trim() || !goalSheet?.distance} onClick={saveGoal}>{goalSheet?.id ? 'Save' : 'Add it'}</Btn></div>}>
        {goalSheet && (
          <div className="imsm-form">
            <TextField label="Goal" value={goalSheet.name} onChange={(v) => setGoalSheet({ ...goalSheet, name: v })} help="For example, Leeds 10K" />
            <div className="two">
              <TextField label={`Distance (${units})`} type="number" step="0.1" inputMode="decimal" value={goalSheet.distance} onChange={(v) => setGoalSheet({ ...goalSheet, distance: v })} />
              <TextField label="Time, if you have one" value={goalSheet.time} onChange={(v) => setGoalSheet({ ...goalSheet, time: v })} help="Like 55:00 or 1:55:00" />
            </div>
            <TextField label="By, if there's a date" type="date" value={goalSheet.date} onChange={(v) => setGoalSheet({ ...goalSheet, date: v })} />
          </div>
        )}
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      {status.connected && <Fab label={busy === 'sync' ? 'Syncing...' : 'Sync Strava'} icon="sync" disabled={busy === 'sync'} onClick={() => sync(false)} />}
    </>
  );
}

export default function Activities({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Activities" icon="run" accent="orange" wide theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="Your Strava log, with the glucose behind every run.">
      <Body theme={theme} />
    </ServicePage>
  );
}
