// Blood Sugar in the IMS design (25 Oct 2026, Simon chose option A with B as its Patterns room): "where am I now" first
// and big, then the rest in rooms: Now (glance, last night, the fortnight, training load, the plain-English read),
// Days (one day's chart, lows), Patterns (the clinic view: time in range, the typical day, reports, target bands),
// Insulin (the AndroidAPS profile, questions, the deep evaluation and its approvals) and Carbs (Nightscout and the
// log). Log carbs is the button in the bottom right. The same /api/glucose-hub requests as before
// (Dashboard/GlucosePortal.jsx); photo carb logging is the existing PhotoCarbs.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ServicePage, { Empty, Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextField, TextArea, SelectField, FilterChip, Segmented, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';
import PhotoCarbs from '../Dashboard/PhotoCarbs';
import Prose from '../Dashboard/Prose';
import TrainingLoad from '../RunBeta/TrainingLoad';
import { useUnits } from '../../utils/units';
import '../RunBeta/rpb.css';
import '../RunBeta/rpb-plan.css';
import '../RunBeta/rpb-screens.css';

const MONGO_URL = 'https://cloud.mongodb.com/v2/5fabc4b4fcf8b709ce8ab13c#/explorer/6542751e47463e28ff4eeb80';
const NIGHTSCOUT_URL = 'https://simon-philpott-nightscout.herokuapp.com';
const HEROKU_SETTINGS_URL = 'https://dashboard.heroku.com/apps/simon-philpott-nightscout/settings';
const PERIODS = [[1, '24 h'], [7, '7 days'], [14, '14 days'], [30, '30 days']];
const ARROWS = { DoubleUp: '⇈', SingleUp: '↑', FortyFiveUp: '↗', Flat: '→', FortyFiveDown: '↘', SingleDown: '↓', DoubleDown: '⇊' };
const DEFAULT_TH = { veryLow: 3.0, low: 3.9, personalLow: 4.5, personalHigh: 7.8, tightHigh: 7.8, high: 10.0, veryHigh: 13.9 };
const ROOMS = [['now', 'Now', 'blood'], ['days', 'Days', 'calendar'], ['patterns', 'Patterns', 'chart'], ['insulin', 'Insulin', 'tune'], ['carbs', 'Carbs', 'food']];
const SUGGESTED = ['Why is my blood sugar so high right now?', 'Did I bolus enough for my last meal?', 'How is my basal behaving this afternoon?', 'Is my insulin on board enough for the carbs I have on board?', 'Why did I drop low after my recent run?'];

// the band a reading falls in: very low, low, in range, high, very high
const band = (v, th = DEFAULT_TH) => (v == null ? '' : v < th.veryLow ? 'vlow' : v < th.low ? 'low' : v <= th.high ? 'in' : v <= th.veryHigh ? 'high' : 'vhigh');
const COLOUR = { vlow: '#c0392b', low: '#e2574c', in: '#2f8a52', high: '#d99a12', vhigh: '#c2620f' };
const hhmm = (t) => new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const shiftDay = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dayLabel = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const pHighOf = (th) => th.personalHigh || th.tightHigh || 7.8;
const post = (url, body, method = 'POST') => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body == null ? undefined : JSON.stringify(body) }).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok || d.success === false) throw new Error(d.error || 'It didn\'t work.'); return d; });
const download = async (url, name) => {
  const r = await fetch(url);
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `It couldn't be made (${r.status}).`); }
  const href = URL.createObjectURL(await r.blob());
  const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
};

// time in range as one bar, split into the seven bands
function TirBar({ s, th }) {
  const pLow = th.personalLow || 4.5, pHigh = pHighOf(th);
  const target = s.personalTargetPct ?? s.tightPct ?? (s.inRangePct || 0);
  const lowSide = s.lowSidePct ?? 0;
  const highSide = s.highSidePct ?? Math.max(0, Math.round(((s.inRangePct || 0) - target - lowSide) * 10) / 10);
  const parts = [
    ['vlow', `Very low, under ${th.veryLow}`, s.veryLowPct], ['low', `Low, ${th.veryLow} to ${th.low}`, s.lowPct], ['ls', `In range, ${th.low} to ${pLow}`, lowSide],
    ['tgt', `Your target, ${pLow} to ${pHigh}`, target], ['hs', `In range, ${pHigh} to ${th.high}`, highSide], ['high', `High, ${th.high} to ${th.veryHigh}`, s.highPct], ['vhigh', `Very high, over ${th.veryHigh}`, s.veryHighPct],
  ];
  return (
    <div className="imsm-tir">
      <div className="bar">{parts.map(([k, l, p]) => p > 0 && <i key={k} className={k} style={{ width: `${p}%` }} title={`${l}: ${p}%`} />)}</div>
      <ul>{parts.map(([k, l, p]) => <li key={k} className={k === 'tgt' ? 'mine' : ''}><i className={k} /><span>{l}</span><b>{p}%</b></li>)}</ul>
      <p className="muted">In range ({th.low} to {th.high}): <b>{s.inRangePct}%</b>. Goals: over 70% in range, under 4% below {th.low}, under 1% below {th.veryLow}.</p>
    </div>
  );
}

// one day: readings against the bands, with runs, boluses and carbs marked; tap or drag for a reading
function DayChart({ data, th }) {
  const [pick, setPick] = useState(null);
  const W = 720, H = 230, L = 30, R = 8, T = 10, B = 24;
  const maxV = Math.max(15, ...data.readings.map((r) => r.v + 1));
  const x = (t) => L + ((t - data.from) / (data.to - data.from)) * (W - L - R);
  const y = (v) => T + (1 - v / maxV) * (H - T - B);
  const pLow = th.personalLow || 4.5, pHigh = pHighOf(th);
  const pts = data.readings;
  const onPoint = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const t = data.from + ((((e.clientX - box.left) / box.width) * W - L) / (W - L - R)) * (data.to - data.from);
    let best = null;
    for (const r of pts) if (!best || Math.abs(r.t - t) < Math.abs(best.t - t)) best = r;
    setPick(best && Math.abs(best.t - t) < 30 * 60000 ? best : null);
  };
  const carbs = [...data.treatments.filter((t) => t.carbs > 0).map((t) => ({ at: t.at, g: t.carbs })), ...data.carbs.map((c) => ({ at: c.at, g: c.grams }))];
  return (
    <div className="imsm-gchart">
      <svg viewBox={`0 0 ${W} ${H}`} onPointerDown={onPoint} onPointerMove={(e) => e.buttons && onPoint(e)} role="img" aria-label="Glucose through the day">
        <rect x={L} y={y(th.high)} width={W - L - R} height={Math.max(0, y(th.low) - y(th.high))} className="inr" />
        <rect x={L} y={y(pHigh)} width={W - L - R} height={Math.max(0, y(pLow) - y(pHigh))} className="tgt" />
        {[th.low, pLow, pHigh, th.high, 15].filter((v) => v <= maxV).map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" /><text x={L - 4} y={y(v) + 3} textAnchor="end" className="ax">{v}</text></g>)}
        {[0, 6, 12, 18, 24].map((h) => <text key={h} x={L + (h / 24) * (W - L - R)} y={H - 6} textAnchor="middle" className="ax">{String(h % 24).padStart(2, '0')}:00</text>)}
        {data.activities.map((a) => <g key={a.id}><rect x={x(Math.max(a.start, data.from))} y={T} width={Math.max(2, x(Math.min(a.end, data.to)) - x(Math.max(a.start, data.from)))} height={H - T - B} className="act" /><text x={x(Math.max(a.start, data.from)) + 3} y={T + 11} className="actl">{a.sport}</text></g>)}
        {pts.map((r, i) => i > 0 && r.t - pts[i - 1].t < 15 * 60000 && <line key={r.t} x1={x(pts[i - 1].t)} y1={y(pts[i - 1].v)} x2={x(r.t)} y2={y(r.v)} stroke={COLOUR[band(r.v, th)]} strokeWidth="2.5" strokeLinecap="round" />)}
        {data.treatments.filter((t) => t.insulin > 0).map((t) => <path key={`i${t.at}`} d={`M${x(t.at) - 5},${H - B - 2} L${x(t.at) + 5},${H - B - 2} L${x(t.at)},${H - B - 11} Z`} className="bol"><title>{`${t.insulin} u at ${hhmm(t.at)}`}</title></path>)}
        {carbs.map((c) => <g key={`c${c.at}`}><rect x={x(c.at) - 15} y={T + 16} width="30" height="16" rx="8" className="carb" /><text x={x(c.at)} y={T + 27.5} textAnchor="middle" className="carbt">{Math.round(c.g)}g</text></g>)}
        {pick && <g><line x1={x(pick.t)} x2={x(pick.t)} y1={T} y2={H - B} className="pick" /><circle cx={x(pick.t)} cy={y(pick.v)} r="5" fill={COLOUR[band(pick.v, th)]} /></g>}
      </svg>
      <div className="leg">
        {pick ? <b style={{ color: COLOUR[band(pick.v, th)] }}>{pick.v} mmol/L at {hhmm(pick.t)} {ARROWS[pick.direction] || ''}</b> : <span>Tap or drag along the chart for a reading.</span>}
        <span><i className="tgt" />your target</span><span><i className="inr" />in range</span><span><i className="carb" />carbs</span><span><i className="bol" />bolus</span><span><i className="act" />activity</span>
      </div>
    </div>
  );
}

// the typical day: the median and the spread for each hour across the period
function Profile({ profile, th }) {
  const W = 720, H = 190, L = 30, R = 8, T = 8, B = 22, maxV = 15;
  const pts = (profile || []).filter((p) => p.median != null);
  if (pts.length < 4) return <p className="muted">It needs a few more days of readings to draw your typical day.</p>;
  const x = (h) => L + ((h + 0.5) / 24) * (W - L - R);
  const y = (v) => T + (1 - Math.min(v, maxV) / maxV) * (H - T - B);
  const area = (lo, hi) => pts.map((p) => `${x(p.hour)},${y(p[hi])}`).join(' ') + ' ' + [...pts].reverse().map((p) => `${x(p.hour)},${y(p[lo])}`).join(' ');
  const pLow = th.personalLow || 4.5, pHigh = pHighOf(th);
  return (
    <div className="imsm-gchart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Your typical day">
        <rect x={L} y={y(th.high)} width={W - L - R} height={Math.max(0, y(th.low) - y(th.high))} className="inr" />
        <rect x={L} y={y(pHigh)} width={W - L - R} height={Math.max(0, y(pLow) - y(pHigh))} className="tgt" />
        {[th.low, pLow, pHigh, th.high].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" /><text x={L - 4} y={y(v) + 3} textAnchor="end" className="ax">{v}</text></g>)}
        <polygon points={area('p10', 'p90')} className="p90" />
        <polygon points={area('p25', 'p75')} className="p75" />
        <polyline points={pts.map((p) => `${x(p.hour)},${y(p.median)}`).join(' ')} className="med" />
        {[0, 6, 12, 18, 24].map((h) => <text key={h} x={L + (h / 24) * (W - L - R)} y={H - 6} textAnchor="middle" className="ax">{String(h % 24).padStart(2, '0')}:00</text>)}
      </svg>
      <div className="leg"><span><i className="med" />median</span><span><i className="p75" />middle half</span><span><i className="p90" />most days (10th to 90th)</span></div>
    </div>
  );
}

// a pump schedule across 24 hours as a step line
function Steps({ items = [], max = 2, focus }) {
  const W = 680, H = 130, L = 36, R = 24, T = 12, B = 22;
  const sorted = [...items].sort((a, b) => a.time.localeCompare(b.time));
  const hourly = Array.from({ length: 24 }, (_, h) => { let v = sorted[0]?.value || 0; for (const it of sorted) { if (parseInt(it.time, 10) <= h) v = Number(it.value) || 0; else break; } return v; });
  const x = (h) => L + (h / 24) * (W - L - R);
  const y = (v) => T + (1 - Math.min(max, Math.max(0, v)) / max) * (H - T - B);
  let d = `M ${x(0)} ${y(hourly[0])}`;
  for (let h = 0; h < 24; h++) { d += ` L ${x(h + 1)} ${y(hourly[h])}`; if (h < 23) d += ` L ${x(h + 1)} ${y(hourly[h + 1])}`; }
  const ticks = [0, max / 2, max].map((v) => Math.round(v * 10) / 10);
  return (
    <div className="imsm-gchart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="The schedule through the day">
        {focus && <><rect x={x(12)} y={T} width={x(16) - x(12)} height={H - T - B} className="tgt" rx="3" /><text x={x(14)} y={T + 12} textAnchor="middle" className="ax strong">12:00 to 16:00</text></>}
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" /><text x={L - 4} y={y(v) + 3} textAnchor="end" className="ax">{v}</text></g>)}
        {[0, 6, 12, 18, 24].map((h) => <text key={h} x={x(h)} y={H - 6} textAnchor="middle" className="ax">{String(h % 24).padStart(2, '0')}:00</text>)}
        <path d={d} className="step" />
      </svg>
    </div>
  );
}

function Stepper({ label, value, unit, onMinus, onPlus, minus = '−', plus = '+', tone = '', hint }) {
  return (
    <div className={`imsm-stepper ${tone}`}>
      <small>{label}</small>
      <b>{value}<span> {unit}</span></b>
      <span className="btns"><button type="button" className="sl" onClick={onMinus} aria-label={`${label}: less`} title={hint ? `${hint}, less` : undefined}>{minus}</button><button type="button" className="sl" onClick={onPlus} aria-label={`${label}: more`} title={hint ? `${hint}, more` : undefined}>{plus}</button></span>
    </div>
  );
}

function Body({ theme }) {
  const snack = useSnack();
  const err = useCallback((m) => snack(m, { error: true }), [snack]);
  const { units } = useUnits();
  const [room, setRoom] = useState('now');
  const [days, setDays] = useState(14);
  const [summary, setSummary] = useState(null);
  const [day, setDay] = useState(todayStr());
  const [dayData, setDayData] = useState(null);
  const [today, setToday] = useState(null);
  const [carbs, setCarbs] = useState([]);
  const [ns, setNs] = useState({ write: null, db: null, autoClear: null });
  const [nsSecret, setNsSecret] = useState('');
  const [th, setTh] = useState(DEFAULT_TH);
  const [thDraft, setThDraft] = useState(DEFAULT_TH);
  const [profile, setProfile] = useState(null);
  const [profileDirty, setProfileDirty] = useState(false);
  const [pTab, setPTab] = useState('BAS');
  const [evalDays, setEvalDays] = useState(14);
  const [evalData, setEvalData] = useState(null);
  const [ask, setAsk] = useState('');
  const [askResult, setAskResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [agp, setAgp] = useState({ days: 14, end: todayStr() });
  const [email, setEmail] = useState(null); // { to, note, status }
  const [logSheet, setLogSheet] = useState(false);
  const [carbForm, setCarbForm] = useState({ grams: '', food: '' });
  const [confirm, setConfirm] = useState(null);
  const thDirty = JSON.stringify(th) !== JSON.stringify(thDraft);

  const load = useCallback(async () => { try { const d = await (await fetch(`/api/glucose-hub/summary?days=${days}`)).json(); if (d.success) setSummary(d); } catch { /* keep */ } }, [days]);
  const loadDay = useCallback(async () => { try { const d = await (await fetch(`/api/glucose-hub/day?date=${day}`)).json(); if (d.success) setDayData(d); } catch { /* keep */ } }, [day]);
  // today's readings, with yesterday's in front so the last three hours are whole just after midnight
  const loadToday = useCallback(async () => {
    try {
      const [y, t] = await Promise.all([shiftDay(todayStr(), -1), todayStr()].map((d) => fetch(`/api/glucose-hub/day?date=${d}`).then((r) => r.json())));
      if (t.success) setToday({ ...t, readings: [...(y.success ? y.readings : []), ...t.readings] });
    } catch { /* keep */ }
  }, []);
  const loadCarbs = useCallback(async () => { try { const d = await (await fetch('/api/glucose-hub/carbs?days=7')).json(); if (d.success) setCarbs(d.carbs); } catch { /* keep */ } }, []);
  const loadTh = useCallback(async () => { try { const d = await (await fetch('/api/glucose-hub/thresholds')).json(); if (d.success && d.thresholds) { setTh(d.thresholds); setThDraft(d.thresholds); } } catch { /* defaults */ } }, []);
  const loadProfile = useCallback(async () => { try { const d = await (await fetch('/api/glucose-hub/profile')).json(); if (d.success && d.profile) { setProfile(d.profile); setProfileDirty(false); } } catch { /* keep */ } }, []);
  const loadEval = useCallback(async () => { try { const d = await (await fetch('/api/glucose-hub/profile/evaluation')).json(); if (d.success && d.evaluation) setEvalData(d.evaluation); } catch { /* keep */ } }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadDay(); }, [loadDay]);
  useEffect(() => { loadToday(); loadCarbs(); loadTh(); loadProfile(); loadEval(); }, [loadToday, loadCarbs, loadTh, loadProfile, loadEval]);
  useEffect(() => { fetch('/api/glucose-hub/nightscout').then((r) => r.json()).then((d) => { if (d.success) setNs({ write: d.configured, db: d.dbSize, autoClear: d.autoClear }); }).catch(() => {}); }, []);
  useEffect(() => { const t = setInterval(() => { load(); loadToday(); if (day === todayStr()) loadDay(); }, 60000); return () => clearInterval(t); }, [load, loadToday, loadDay, day]);
  const refreshCarbs = () => { loadCarbs(); loadDay(); loadToday(); };

  const addCarbs = async () => {
    try { await post('/api/glucose-hub/carbs', carbForm); setCarbForm({ grams: '', food: '' }); setLogSheet(false); refreshCarbs(); snack(ns.write ? 'Carbs logged, and sent to Nightscout.' : 'Carbs logged.'); } catch (e) { err(e.message); }
  };
  const delCarbs = (c) => setConfirm({ title: `Delete ${Math.round(c.grams)} g${c.food ? ` of ${c.food}` : ''}?`, okLabel: 'Delete', danger: true, onOk: async () => { await fetch(`/api/glucose-hub/carbs/${c.id}`, { method: 'DELETE' }); refreshCarbs(); snack('Deleted.'); } });
  const saveSecret = async (secret) => {
    setBusy('ns');
    try { const d = await post('/api/glucose-hub/nightscout', { secret }, 'PUT'); setNs((n) => ({ ...n, write: d.configured })); setNsSecret(''); snack(d.configured ? 'Nightscout accepted it: carbs will be sent there.' : 'Disconnected: carbs stay in IMS only.'); } catch (e) { err(e.message); }
    setBusy('');
  };
  const toggleAutoClear = async (enabled) => { try { const d = await post('/api/glucose-hub/nightscout/auto-clear', { enabled }, 'PUT'); setNs((n) => ({ ...n, autoClear: d.autoClear })); snack(enabled ? 'Auto-clear on: at 95% full, records older than 3 months are cleared.' : 'Auto-clear off.'); } catch (e) { err(e.message); } };
  const clearOld = () => setConfirm({ title: 'Clear Nightscout records over 3 months old?', body: 'Glucose readings, treatments and AAPS device status older than 3 months are deleted from Nightscout, and that can\'t be undone there. IMS keeps its own copy, so the charts here aren\'t affected.', okLabel: 'Clear them', danger: true, onOk: async () => {
    setBusy('cleanup');
    try {
      const d = await post('/api/glucose-hub/nightscout/cleanup', { months: 3 });
      if (d.dbSize) setNs((n) => ({ ...n, db: d.dbSize }));
      const failed = d.results.filter((r) => !r.ok);
      const counts = d.results.filter((r) => r.ok && r.deleted != null).map((r) => `${r.deleted} ${r.label}`).join(', ');
      if (failed.length) err(`Some didn't clear: ${failed.map((r) => r.label).join(', ')}`); else snack(`Cleared${counts ? `: ${counts}` : ''}.`);
    } catch (e) { err(e.message); }
    setBusy('');
  } });
  const analyse = async () => { setBusy('insight'); try { const d = await post('/api/glucose-hub/insight', { days }); setSummary((s) => ({ ...s, insight: d.insight })); } catch (e) { err(e.message); } setBusy(''); };
  const report = async (kind) => {
    setBusy(kind);
    try {
      if (kind === 'agp') await download(`/api/glucose-hub/report/agp?days=${agp.days}&end=${agp.end}`, `AGP_Report_${agp.days}d_to_${agp.end}.pdf`);
      else await download(`/api/glucose-hub/report/pdf?days=${days}&date=${day}`, `Clinical_Glucose_Report_${days}d_${day}.pdf`);
      snack('Report downloaded.');
    } catch (e) { err(e.message); }
    setBusy('');
  };
  const openEmail = async () => {
    setEmail({ to: '', note: '', status: null });
    try { const d = await (await fetch('/api/glucose-hub/report/email-status')).json(); if (d.success) setEmail((e) => ({ ...e, status: d, to: e.to || d.userEmail || '' })); } catch { /* fine */ }
  };
  const sendEmail = async () => {
    if (!email.to.includes('@')) return err('That email address doesn\'t look right.');
    setBusy('email');
    try { await post('/api/glucose-hub/report/email', { recipient: email.to, days, date: day, customNote: email.note }); snack(`Report emailed to ${email.to}.`); setEmail(null); } catch (e) { err(e.message); }
    setBusy('');
  };
  const nudge = (key, by) => setThDraft((p) => ({ ...p, [key]: Math.max(1, Math.min(25, Math.round(((Number(p[key]) || 0) + by) * 10) / 10)) }));
  const saveTh = async () => {
    const { veryLow, low, personalLow = 4.5, high, veryHigh } = thDraft; const ph = pHighOf(thDraft);
    const problem = veryLow >= low ? 'Very low must be under low.' : low > personalLow ? 'Low must be at or under the bottom of your target.' : personalLow >= ph ? 'The bottom of your target must be under its top.' : ph > high ? 'The top of your target must be at or under high.' : high >= veryHigh ? 'High must be under very high.' : '';
    if (problem) return err(problem);
    try { const d = await post('/api/glucose-hub/thresholds', { ...thDraft, personalHigh: ph, tightHigh: ph }, 'PUT'); setTh(d.thresholds); setThDraft(d.thresholds); load(); loadDay(); snack('Bands saved.'); } catch (e) { err(e.message); }
  };
  const resetTh = () => setConfirm({ title: 'Back to the standard bands?', body: '3.0, 3.9, 4.5, 7.8, 10.0 and 13.9 mmol/L.', okLabel: 'Reset', onOk: async () => { try { const d = await post('/api/glucose-hub/thresholds/reset'); setTh(d.thresholds); setThDraft(d.thresholds); load(); loadDay(); snack('Back to the standard bands.'); } catch (e) { err(e.message); } } });
  const adjust = (part, i, by, min, dp) => { setProfile((p) => { const list = [...p[part]]; list[i] = { ...list[i], value: Math.max(min, Math.round(((Number(list[i].value) || 0) + by) * dp) / dp) }; return { ...p, [part]: list }; }); setProfileDirty(true); };
  const saveProfile = async () => { try { const d = await post('/api/glucose-hub/profile', profile, 'PUT'); setProfile(d.profile); setProfileDirty(false); snack('Profile saved.'); } catch (e) { err(e.message); } };
  const resetProfile = () => setConfirm({ title: 'Back to the standard 20 u day?', body: 'Your tuned profile is replaced with the baseline.', okLabel: 'Reset', danger: true, onOk: async () => { try { const d = await post('/api/glucose-hub/profile/reset'); setProfile(d.profile); setProfileDirty(false); snack('Back to the 20 u standard day.'); } catch (e) { err(e.message); } } });
  const runEval = async () => { setBusy('eval'); try { const d = await post('/api/glucose-hub/profile/evaluate', { days: evalDays, profile }); setEvalData(d.evaluation); snack(`Evaluated over ${evalDays} days.`); } catch (e) { err(e.message); } setBusy(''); };
  const approve = (section, block) => setConfirm({
    title: 'Approve this change?',
    body: `${block.proposal.text}${profileDirty ? ' Your unsaved tweaks to the profile will be lost.' : ''} This changes your insulin profile in IMS; make the same change in AndroidAPS for the pump to use it.`,
    okLabel: 'Approve',
    onOk: async () => { setBusy(`ap:${section}:${block.id}`); try { const d = await post('/api/glucose-hub/profile/approve', { section, id: block.id }); setProfile(d.profile); setProfileDirty(false); setEvalData(d.evaluation); snack(`Profile updated: ${d.change}.`); } catch (e) { err(e.message); } setBusy(''); },
  });
  const askIt = async (q) => {
    const text = (q ?? ask).trim(); if (!text) return;
    setAsk(text); setBusy('ask');
    try { const d = await post('/api/glucose-hub/profile/ask', { question: text, profile }); setAskResult(d.insight); } catch (e) { err(e.message); }
    setBusy('');
  };

  const cur = summary?.current;
  const s = summary?.stats, p = summary?.previous;
  const dev = summary?.deviceStatus;
  const earlyDays = summary?.dataSince ? (Date.now() - summary.dataSince) / 86400000 : null;
  const pLow = th.personalLow || 4.5, pHigh = pHighOf(th);
  const better = (a, b, dir) => (a == null || b == null || a === b ? '' : (dir === 'up' ? a > b : a < b) ? 'good' : 'warn');
  const stats = s ? [
    ['Average', `${s.mean}`, 'mmol/L', better(Math.abs(s.mean - 7), p && Math.abs(p.mean - 7), 'down')],
    ['Estimated HbA1c', `${s.gmiPct}%`, 'GMI', ''],
    ['Variability', `${s.cvPct}%`, 'CV', s.cvPct <= 36 ? 'good' : 'warn'],
    ['In your target', `${s.personalTargetPct ?? s.tightPct}%`, `${pLow} to ${pHigh}`, better(s.personalTargetPct ?? s.tightPct, p?.personalTargetPct ?? p?.tightPct, 'up')],
    ['Lowest and highest', `${s.min} / ${s.max}`, 'mmol/L', ''],
    ['Sensor coverage', `${s.coveragePct}%`, '', ''],
  ] : [];
  const totalBasal = useMemo(() => {
    if (!profile?.basal) return null;
    const sorted = [...profile.basal].sort((a, b) => a.time.localeCompare(b.time));
    let t = 0; for (let h = 0; h < 24; h++) { let v = sorted[0]?.value || 0.5; for (const b of sorted) { if (parseInt(b.time, 10) <= h) v = b.value; else break; } t += v; }
    return Math.round(t * 100) / 100;
  }, [profile?.basal]);
  // the last three hours, for the glance
  const recent = useMemo(() => { const r = today?.readings || []; const from = Date.now() - 3 * 3600000; return r.filter((x) => x.t >= from); }, [today]);

  const verdict = (v) => ({ TOO_LOW: ['Rate too low', 'bad'], TOO_HIGH: ['Rate too high', 'warn'], UNDER_BOLUSED: ['Under-bolused', 'bad'], OVER_BOLUSED: ['Over-bolused', 'warn'], MORE_SENSITIVE: ['More sensitive', 'quiet'], MORE_RESISTANT: ['More resistant', 'warn'] }[v] || ['On target', 'good']);
  const approveRow = (section, b) => {
    if (b.appliedAt) return <span className="tag gin"><Icon n="check" size={14} />Approved {new Date(b.appliedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>;
    if (b.proposal === undefined && !/BALANCED|MATCHED/.test(b.verdict)) return <small className="muted">Run the evaluation again to approve this.</small>;
    if (!b.proposal) return null;
    return <Btn kind="tonal" icon="check" busy={busy === `ap:${section}:${b.id}`} disabled={busy.startsWith('ap:')} onClick={() => approve(section, b)} title={b.proposal.text}>Approve</Btn>;
  };
  const evalCard = (section, b, rows) => {
    const [w, tone] = verdict(b.verdict);
    return (
      <div key={b.id} className={`imsm-eval ${b.id === 'afternoon' || b.id === 'overnight' ? 'focus' : ''}`}>
        <div className="imsm-row" style={{ justifyContent: 'space-between' }}><b>{b.name}</b><span className={`tag ${tone}`}>{w}</span></div>
        {b.label && <small className="muted">{b.label}</small>}
        <div className="kv">{rows.map(([k, v, cls]) => <span key={k}><small>{k}</small><b className={cls || ''}>{v}</b></span>)}</div>
        <p>{b.suggestion}</p>
        {approveRow(section, b)}
      </div>
    );
  };

  // the PDF reports: the clinic AGP report, the full report, and emailing it (on Now and on Patterns)
  const reportsCard = (
  <section className="imsm-card">
    <h3><Icon n="doc" size={20} />Reports</h3>
    <div className="imsm-reports">
      <div className="imsm-sub-card"><b>For your diabetes clinic</b><p className="muted">The AGP report: time in ranges, GMI, CV, lows, and pod and sensor changes.</p>
        <div className="imsm-row"><SelectField label="Length" value={agp.days} onChange={(v) => setAgp({ ...agp, days: Number(v) })} options={[[14, '14 days'], [90, '90 days']]} /><TextField label="Ending" type="date" value={agp.end} max={todayStr()} onChange={(v) => setAgp({ ...agp, end: v })} /></div>
        <Btn icon="download" busy={busy === 'agp'} onClick={() => report('agp')}>Download the AGP report</Btn></div>
      <div className="imsm-sub-card"><b>The full report</b><p className="muted">The last {PERIODS.find(([k]) => k === days)?.[1]} with {day === todayStr() ? 'today' : dayLabel(day)} in detail, as a PDF.</p>
        <div className="imsm-row"><Btn kind="tonal" icon="download" busy={busy === 'pdf'} onClick={() => report('pdf')}>Download</Btn><Btn kind="tonal" icon="send" onClick={openEmail}>Email it</Btn></div></div>
    </div>
  </section>
  );

  return (
    <>
      <section className="imsm-gnow">
        <div className="hd">
          <span className="lbl">Right now</span>
          {cur && <span className={`tag ${band(cur.value, th) === 'in' ? 'gin' : band(cur.value, th).includes('low') ? 'bad' : 'warn'}`}>{cur.range}</span>}
        </div>
        <div className="num">
          <b className={cur && !cur.fresh ? 'stale' : ''} style={{ color: COLOUR[band(cur?.value, th)] }}>{cur ? cur.value : '–'}</b>
          <span className="arr" style={{ color: COLOUR[band(cur?.value, th)] }}>{ARROWS[cur?.direction] || ''}</span>
          <span className="meta">{cur ? <>{cur.delta != null ? `${cur.delta > 0 ? '+' : ''}${cur.delta} · ` : ''}{cur.minutesAgo} min ago<br />mmol/L</> : 'No readings yet'}</span>
        </div>
        {recent.length > 1 && (() => {
          const W = 600, H = 70, from = Date.now() - 3 * 3600000, maxV = Math.max(12, ...recent.map((r) => r.v + 1));
          const X = (t) => ((t - from) / (3 * 3600000)) * W, Y = (v) => 4 + (1 - v / maxV) * (H - 8);
          return (
            <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="The last three hours">
              <rect x="0" y={Y(pHigh)} width={W} height={Math.max(0, Y(pLow) - Y(pHigh))} className="tgt" />
              <polyline points={recent.map((r) => `${X(r.t)},${Y(r.v)}`).join(' ')} className="ln" style={{ stroke: COLOUR[band(cur?.value, th)] }} />
            </svg>
          );
        })()}
        <div className="chips wrap">
          <span className="chip">Insulin on board <b>{cur?.iob != null ? `${cur.iob} u` : '–'}</b></span>
          <span className="chip">Carbs on board <b>{cur?.cob != null ? `${cur.cob} g` : '–'}</b></span>
          {dev && <span className={`chip ${dev.omnipodChangeDueToday ? 'due' : ''}`}><Icon n="shield" size={16} />{dev.omnipodChangeDueToday ? 'Pod change due today' : 'Pod fine'}</span>}
          {dev && <span className={`chip ${dev.sensorChangeDueToday ? 'due' : dev.sensorChangeDueTomorrow ? 'soon' : ''}`}><Icon n="bolt" size={16} />{dev.sensorChangeDueToday ? 'Sensor change due today' : dev.sensorChangeDueTomorrow ? 'Sensor change tomorrow' : 'Sensor fine'}</span>}
          {dev?.prescriptionDueToday && <span className="chip soon"><Icon n="clipboard" size={16} />Order the prescription today</span>}
        </div>
      </section>

      <div className="imsm-ptabs"><div className="chips">{ROOMS.map(([k, l, ic]) => <FilterChip key={k} on={room === k} onClick={() => setRoom(k)} lead={<Icon n={ic} size={18} />}>{l}</FilterChip>)}</div></div>
      {earlyDays != null && earlyDays < 14 && <div className="imsm-banner info"><Icon n="info" size={22} /><span>IMS has {earlyDays < 1 ? `${Math.round(earlyDays * 24)} hours` : `${Math.round(earlyDays * 10) / 10} days`} of glucose since the log restarted, so the longer periods fill in over the next couple of weeks.</span></div>}

      {room === 'now' && (
        <>
          {summary?.overnight && (
            <section className="imsm-card">
              <div className="imsm-row" style={{ justifyContent: 'space-between' }}><h3><Icon n="moon" size={20} />Last night</h3><span className={`tag ${summary.overnight.inRangePct >= 70 ? 'good' : 'warn'}`}>{summary.overnight.inRangePct}% in range</span></div>
              <p style={{ margin: 0 }}>Lowest {summary.overnight.min}, and you woke at {summary.overnight.endValue} mmol/L.</p>
            </section>
          )}
          <section className="imsm-card">
            <div className="imsm-row" style={{ justifyContent: 'space-between' }}><h3><Icon n="chart" size={20} />The last {PERIODS.find(([k]) => k === days)?.[1]}</h3><Btn kind="text" onClick={() => setRoom('patterns')}>The full picture</Btn></div>
            {s ? <>
              <TirBar s={s} th={th} />
              <div className="imsm-stats">{stats.slice(0, 3).map(([k, v, u, tone]) => <div key={k} className={`imsm-stat ${tone === 'warn' ? 'warnv' : tone === 'good' ? 'goodv' : ''}`}><span className="k">{k}</span><b>{v}</b><span className="s">{u}</span></div>)}</div>
            </> : <p className="muted">No readings in this period yet.</p>}
          </section>
          <div className={`hbb rpb ${theme === 'dark' ? 'dark' : ''} imsm-embed`}><TrainingLoad units={units} /></div>
          {reportsCard}
          <section className="imsm-card">
            <div className="imsm-row" style={{ justifyContent: 'space-between' }}><h3><Icon n="sparkle" size={20} />What the numbers say</h3><Btn kind="tonal" icon="sparkle" busy={busy === 'insight'} onClick={analyse}>{summary?.insight ? 'Read it again' : 'Read them'}</Btn></div>
            {summary?.insight ? <><div className="imsm-prose"><Prose text={summary.insight.text} /></div><small className="muted">Written {new Date(summary.insight.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} from {summary.insight.days} days.</small></> : <p className="muted" style={{ margin: 0 }}>A plain-English read of the patterns, the lows and what to try.</p>}
          </section>
        </>
      )}

      {room === 'days' && (
        <>
          <section className="imsm-card">
            <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
              <IconButton icon="back" label="The day before" onClick={() => setDay(shiftDay(day, -1))} />
              <h3 style={{ justifyContent: 'center' }}>{day === todayStr() ? 'Today' : dayLabel(day)}</h3>
              <IconButton icon="back" className="flip" label="The day after" disabled={day >= todayStr()} onClick={() => setDay(shiftDay(day, 1))} />
            </div>
            {dayData?.readings?.length ? <DayChart data={dayData} th={th} /> : <Empty icon="chart" title="No readings for this day" />}
            {dayData?.stats && <div className="imsm-stats">{[['In range', `${dayData.stats.inRangePct}%`], ['Average', dayData.stats.mean], ['Lowest', dayData.stats.min], ['Highest', dayData.stats.max]].map(([k, v]) => <div key={k} className="imsm-stat"><span className="k">{k}</span><b>{v}</b></div>)}</div>}
          </section>
          <section className="imsm-card">
            <h3><Icon n="warn" size={20} />Lows <span className="muted" style={{ fontFamily: 'var(--font)', fontSize: 14 }}>under {th.low} for 15 minutes or more</span></h3>
            {summary?.lows?.length ? (
              <div className="imsm-lows">{summary.lows.map((l) => (
                <div key={l.start} className="lo"><span className="txt"><b>{l.when}</b><small>{l.minutes} min{l.overnight ? ' · overnight' : ''}{l.afterExercise ? ` · after ${l.afterExercise}` : ''}</small></span><b style={{ color: COLOUR[band(l.lowest, th)] }}>{l.lowest}</b></div>
              ))}</div>
            ) : <p className="muted" style={{ margin: 0 }}>None in the last {PERIODS.find(([k]) => k === days)?.[1]}.</p>}
          </section>
        </>
      )}

      {room === 'patterns' && (
        <>
          <Segmented label="Period" value={days} onChange={setDays} options={PERIODS} />
          <section className="imsm-card">
            <h3><Icon n="chart" size={20} />Time in range</h3>
            {s ? <>
              <TirBar s={s} th={th} />
              <div className="imsm-stats">{stats.map(([k, v, u, tone]) => <div key={k} className={`imsm-stat ${tone === 'warn' ? 'warnv' : tone === 'good' ? 'goodv' : ''}`}><span className="k">{k}</span><b>{v}</b><span className="s">{u}{tone === 'good' ? ' · better than before' : tone === 'warn' && k !== 'Variability' ? ' · worse than before' : ''}</span></div>)}</div>
              {summary.totals && <p className="muted" style={{ margin: 0 }}>Over this period: {summary.totals.bolusUnits} u of bolus logged by the loop, and {summary.totals.carbsG} g of carbs entered.</p>}
            </> : <p className="muted">No readings in this period yet.</p>}
          </section>
          <section className="imsm-card">
            <h3><Icon n="calendar" size={20} />Your typical day</h3>
            <p className="muted" style={{ margin: 0 }}>The ambulatory glucose profile: the median through the day, with the middle half and most days shaded.</p>
            {summary && <Profile profile={summary.profile} th={th} />}
          </section>
          {reportsCard}
          <details className="imsm-fold">
            <summary><Icon n="tune" size={20} /><span>Target bands {thDirty && <span className="tag warn" style={{ marginLeft: 6 }}>Not saved</span>}</span><Icon n="down" size={22} /></summary>
            <div className="imsm-form" style={{ padding: '0 16px 16px' }}>
              <p className="muted" style={{ margin: 0 }}>These cut-offs drive every time-in-range figure, the charts and the day report.</p>
              <div className="imsm-steppers">
                <Stepper label="Very low, under" tone="vlow" value={Number(thDraft.veryLow).toFixed(1)} unit="mmol/L" onMinus={() => nudge('veryLow', -0.1)} onPlus={() => nudge('veryLow', 0.1)} />
                <Stepper label="Low, under" tone="low" value={Number(thDraft.low).toFixed(1)} unit="mmol/L" onMinus={() => nudge('low', -0.1)} onPlus={() => nudge('low', 0.1)} />
                <Stepper label="Your target, from" tone="tgt" value={Number(thDraft.personalLow || 4.5).toFixed(1)} unit="mmol/L" onMinus={() => nudge('personalLow', -0.1)} onPlus={() => nudge('personalLow', 0.1)} />
                <Stepper label="Your target, to" tone="tgt" value={Number(pHighOf(thDraft)).toFixed(1)} unit="mmol/L" onMinus={() => { nudge('personalHigh', -0.1); nudge('tightHigh', -0.1); }} onPlus={() => { nudge('personalHigh', 0.1); nudge('tightHigh', 0.1); }} />
                <Stepper label="In range, up to" tone="in" value={Number(thDraft.high).toFixed(1)} unit="mmol/L" onMinus={() => nudge('high', -0.1)} onPlus={() => nudge('high', 0.1)} />
                <Stepper label="Very high, over" tone="vhigh" value={Number(thDraft.veryHigh).toFixed(1)} unit="mmol/L" onMinus={() => nudge('veryHigh', -0.1)} onPlus={() => nudge('veryHigh', 0.1)} />
              </div>
              <div className="imsm-row end"><Btn kind="text" icon="sync" onClick={resetTh}>Standard bands</Btn><Btn icon="check" disabled={!thDirty} onClick={saveTh}>Save the bands</Btn></div>
            </div>
          </details>
        </>
      )}

      {room === 'insulin' && (
        <>
          <section className="imsm-card">
            <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
              <h3><Icon n="tune" size={20} />Your AndroidAPS profile</h3>
              <span className="imsm-row">{profileDirty && <span className="tag warn">Not saved</span>}<Btn kind="text" icon="sync" onClick={resetProfile}>Reset</Btn><Btn icon="check" disabled={!profileDirty} onClick={saveProfile}>Save</Btn></span>
            </div>
            <Segmented label="Which part" value={pTab} onChange={setPTab} options={[['BAS', `Basal${totalBasal != null ? ` · ${totalBasal} u a day` : ''}`], ['IC', 'Carb ratio'], ['ISF', 'Sensitivity']]} />
            {!profile ? <Spinner /> : pTab === 'BAS' ? (
              <>
                <p className="muted" style={{ margin: 0 }}>The basal schedule, in units an hour. 12:00 to 16:00 is shaded, as that's where drift is checked closely.</p>
                <Steps items={profile.basal} max={2} focus />
                <div className="imsm-steppers">{profile.basal.map((b, i) => <Stepper key={b.time} label={b.time} tone={parseInt(b.time, 10) >= 12 && parseInt(b.time, 10) < 16 ? 'tgt' : ''} value={b.value.toFixed(2)} unit="u/h" onMinus={() => adjust('basal', i, -0.05, 0.05, 100)} onPlus={() => adjust('basal', i, 0.05, 0.05, 100)} />)}</div>
              </>
            ) : pTab === 'IC' ? (
              <>
                <p className="muted" style={{ margin: 0 }}>Grams of carbs per unit. Fewer grams per unit is stronger; more is gentler.</p>
                <Steps items={profile.ic} max={12} />
                <div className="imsm-steppers">{profile.ic.map((b, i) => <Stepper key={b.time} label={b.time} value={b.value.toFixed(1)} unit="g/u" minus="−0.5" plus="+0.5" onMinus={() => adjust('ic', i, -0.5, 2, 10)} onPlus={() => adjust('ic', i, 0.5, 2, 10)} />)}</div>
              </>
            ) : (
              <>
                <p className="muted" style={{ margin: 0 }}>How far one unit brings you down, in mmol/L.</p>
                <Steps items={profile.isf} max={3} />
                <div className="imsm-steppers">{profile.isf.map((b, i) => <Stepper key={b.time} label={`${b.time} on`} value={b.value.toFixed(1)} unit="mmol/L per u" minus="−0.1" plus="+0.1" onMinus={() => adjust('isf', i, -0.1, 0.5, 10)} onPlus={() => adjust('isf', i, 0.1, 0.5, 10)} />)}</div>
              </>
            )}
          </section>
          <section className="imsm-card">
            <h3><Icon n="chat" size={20} />Ask about your numbers</h3>
            <div className="chips wrap">{SUGGESTED.map((q) => <FilterChip key={q} on={false} onClick={() => askIt(q)}>{q}</FilterChip>)}</div>
            <div className="imsm-ask"><TextField label="Your question" value={ask} onChange={setAsk} disabled={busy === 'ask'} onKeyDown={(e) => e.key === 'Enter' && askIt()} placeholder="For example: is my afternoon basal too low?" /><Btn icon="sparkle" busy={busy === 'ask'} disabled={busy === 'ask' || !ask.trim()} onClick={() => askIt()}>Ask</Btn></div>
            {askResult && (
              <div className="imsm-sub-card">
                <div className="imsm-row" style={{ justifyContent: 'space-between' }}><b>“{askResult.question}”</b><IconButton icon="close" label="Clear the answer" onClick={() => setAskResult(null)} /></div>
                {askResult.telemetrySnapshot && <div className="chips wrap">
                  {askResult.telemetrySnapshot.currentReading && <span className="tag quiet">{askResult.telemetrySnapshot.currentReading.mmol} mmol/L ({askResult.telemetrySnapshot.currentReading.direction})</span>}
                  {askResult.telemetrySnapshot.iob != null && <span className="tag quiet">Insulin on board {askResult.telemetrySnapshot.iob} u</span>}
                  {askResult.telemetrySnapshot.cob != null && <span className="tag quiet">Carbs on board {askResult.telemetrySnapshot.cob} g</span>}
                  {askResult.telemetrySnapshot.scheduledBasal != null && <span className="tag quiet">Basal {askResult.telemetrySnapshot.scheduledBasal} u/h</span>}
                  {askResult.telemetrySnapshot.scheduledIC != null && <span className="tag quiet">Carb ratio {askResult.telemetrySnapshot.scheduledIC} g/u</span>}
                </div>}
                <div className="imsm-prose"><Prose text={askResult.answer} /></div>
              </div>
            )}
          </section>
          <section className="imsm-card">
            <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
              <h3><Icon n="flask" size={20} />How well the profile fits</h3>
              <span className="imsm-row"><Segmented label="Over" value={evalDays} onChange={setEvalDays} options={[[7, '7 days'], [14, '14 days'], [30, '30 days']]} /><Btn icon="sparkle" busy={busy === 'eval'} onClick={runEval}>Evaluate</Btn></span>
            </div>
            {!evalData?.metrics ? <p className="muted" style={{ margin: 0 }}>Checks your readings, temp basals and meal boluses against the profile: drift from 12:00 to 16:00 and overnight, the carb ratio by meal, and how your sensitivity changes through the day.</p> : (
              <>
                <small className="muted">{evalData.metrics.readingsEvaluated?.toLocaleString()} readings and {evalData.metrics.treatmentsEvaluated?.toLocaleString()} treatments · {new Date(evalData.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
                <h4 className="imsm-steph">Basal: what the loop actually gave</h4>
                <div className="imsm-evals">{(evalData.metrics.basalBlocks || []).map((b) => evalCard('basal', b, [['Scheduled', `${b.avgScheduled} u/h`], ['Delivered', `${b.avgDelivered} u/h`], ['Loop added', `${b.netOffset > 0 ? '+' : ''}${b.netOffset} u/h`, b.netOffset > 0 ? 'bad' : ''], ['Drift when fasting', `${b.meanDrift > 0 ? '+' : ''}${b.meanDrift} mmol/h`, Math.abs(b.meanDrift) > 0.4 ? 'bad' : 'good']]))}</div>
                <h4 className="imsm-steph">Carb ratio by meal</h4>
                <div className="imsm-evals">{(evalData.metrics.mealBlocks || []).map((b) => evalCard('ic', b, [['Scheduled', `${b.scheduledIC} g/u`], ['Measured', `${b.measuredIC} g/u`], ['Average rise', `${b.avgExcursion > 0 ? '+' : ''}${b.avgExcursion} mmol/L`, b.avgExcursion > 2 ? 'bad' : ''], ['High after meals', `${b.highPct}% of ${b.mealsObserved}`, b.highPct > 40 ? 'bad' : 'good']]))}</div>
                <h4 className="imsm-steph">Sensitivity through the day</h4>
                <div className="imsm-evals">{(evalData.metrics.isfBlocks || []).map((b) => evalCard('isf', b, [['Profile', `${b.scheduledISF}`], ['Measured', `${b.measuredISF}`], ['Difference', `${b.diff > 0 ? '+' : ''}${b.diff} mmol/L per u`]]))}</div>
                {evalData.report && <div className="imsm-sub-card"><h4 className="imsm-steph"><Icon n="sparkle" size={18} />What to change, and why</h4><div className="imsm-prose"><Prose text={evalData.report} /></div><small className="muted">Try changes gently, and with your diabetes team.</small></div>}
              </>
            )}
          </section>
        </>
      )}

      {room === 'carbs' && (
        <>
          <section className="imsm-card">
            <div className="imsm-row" style={{ justifyContent: 'space-between' }}><h3><Icon n="food" size={20} />The last week</h3><Btn kind="tonal" icon="add" onClick={() => setLogSheet(true)}>Log carbs</Btn></div>
            <p className="muted" style={{ margin: 0 }}>Or say “Hey Ims, I've just had two slices of toast”: he looks the carbs up, asks if he needs to, and logs the total.</p>
            {!carbs.length ? <p className="muted" style={{ margin: 0 }}>Nothing logged in the last week.</p> : (
              <ul className="imsm-carbs">{carbs.map((c) => (
                <li key={c.id}><span className="w">{new Date(c.at).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span><b>{Math.round(c.grams)} g</b><span className="f">{c.food || ''}</span>{c.ns_id && <span className="tag good" title="Sent to Nightscout">Nightscout</span>}<IconButton icon="del" label="Delete this" onClick={() => delCarbs(c)} /></li>
              ))}</ul>
            )}
          </section>
          <section className="imsm-card">
            <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
              <h3><Icon n="disk" size={20} />Nightscout</h3>
              <span className="imsm-row"><a className="btn text sl icon" href={NIGHTSCOUT_URL} target="_blank" rel="noreferrer"><Icon n="open" />Nightscout</a><a className="btn text sl icon" href={MONGO_URL} target="_blank" rel="noreferrer"><Icon n="open" />MongoDB</a></span>
            </div>
            {ns.db && (
              <div className="imsm-dbbar">
                <div className="imsm-row" style={{ justifyContent: 'space-between' }}><b>{Number(ns.db.pct).toFixed(1)}% full</b><span className="muted">{ns.db.usedMb} of {ns.db.maxMb} MB</span></div>
                <span className="trk"><i className={ns.db.pct > 90 ? 'bad' : ns.db.pct > 70 ? 'warn' : ''} style={{ width: `${Math.min(100, ns.db.pct)}%` }} /></span>
              </div>
            )}
            {ns.write ? (
              <>
                <p style={{ margin: 0 }}><span className="tag good">Connected</span> Carbs you log are sent there as a Carb Correction, and AAPS may pick them up, so don't enter the same food in AAPS too.</p>
                <label className="imsm-row" style={{ cursor: 'pointer' }} title={ns.autoClear?.last ? `Last cleared ${new Date(ns.autoClear.last.at).toLocaleString('en-GB')}` : 'Checked hourly'}><span className="imsm-switch"><input type="checkbox" checked={Boolean(ns.autoClear?.enabled)} onChange={(e) => toggleAutoClear(e.target.checked)} /><i /></span>At 95% full, clear records over 3 months old</label>
                <div className="imsm-row"><Btn kind="tonal" icon="del" busy={busy === 'cleanup'} onClick={clearOld}>Clear over 3 months now</Btn><Btn kind="text" busy={busy === 'ns'} onClick={() => saveSecret('')}>Disconnect</Btn></div>
              </>
            ) : (
              <>
                <p style={{ margin: 0 }}>IMS needs your Nightscout <b>API secret</b> to send carbs there and clear old records. It's the API_SECRET on Heroku: open <a href={HEROKU_SETTINGS_URL} target="_blank" rel="noreferrer">your Heroku settings</a>, press Reveal Config Vars and copy it.</p>
                <div className="imsm-ask"><TextField label="API secret" type="password" autoComplete="off" value={nsSecret} onChange={setNsSecret} onKeyDown={(e) => e.key === 'Enter' && nsSecret && saveSecret(nsSecret)} help="IMS checks it with Nightscout, then keeps it encrypted." /><Btn icon="check" busy={busy === 'ns'} disabled={!nsSecret} onClick={() => saveSecret(nsSecret)}>Connect</Btn></div>
              </>
            )}
          </section>
        </>
      )}

      <Sheet open={logSheet} onClose={() => setLogSheet(false)} title="Log carbs" wideWidth="640px"
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setLogSheet(false)}>Cancel</Btn><Btn icon="check" disabled={!carbForm.grams} onClick={addCarbs}>Log it</Btn></div>}>
        <div className="imsm-form">
          <div className="two"><TextField label="Grams" inputMode="decimal" value={carbForm.grams} onChange={(v) => setCarbForm({ ...carbForm, grams: v })} autoFocus /><TextField label="What (optional)" value={carbForm.food} onChange={(v) => setCarbForm({ ...carbForm, food: v })} /></div>
          <details className="imsm-fold" style={{ margin: 0 }}>
            <summary><Icon n="camera" size={20} /><span>Or from a photo</span><Icon n="down" size={22} /></summary>
            <div className="rpb-legacy imsm-legacy-inner" style={{ padding: '0 12px 12px' }}>
              <PhotoCarbs isDark={theme === 'dark'} field={`px-3 py-2 rounded-lg text-sm outline-none border ${theme === 'dark' ? 'bg-slate-950/60 border-white/10' : 'bg-white border-[#2E2B27]/15'}`} gradient="from-rose-500 to-red-600" notify={(m, t) => snack(m, t === 'error' ? { error: true } : undefined)} onLogged={() => { refreshCarbs(); setLogSheet(false); }} />
            </div>
          </details>
        </div>
      </Sheet>
      <Sheet open={Boolean(email)} onClose={() => setEmail(null)} title="Email the report"
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setEmail(null)}>Cancel</Btn><Btn icon="send" busy={busy === 'email'} disabled={!email?.to} onClick={sendEmail}>Send it</Btn></div>}>
        {email && (
          <div className="imsm-form">
            <p className="muted" style={{ margin: 0 }}>{email.status?.connected ? `Sent from your Google account (${email.status.userEmail || email.status.userName}).` : 'Sent through Gmail; if it fails, sign in with Google again.'} It covers the last {PERIODS.find(([k]) => k === days)?.[1]}, with {dayLabel(day)} in detail.</p>
            <TextField label="Send it to" type="email" value={email.to} onChange={(v) => setEmail({ ...email, to: v })} placeholder="For example: your diabetes clinic" />
            <TextArea label="A note (optional)" rows={3} value={email.note} onChange={(v) => setEmail({ ...email, note: v })} />
          </div>
        )}
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      <Fab label="Log carbs" icon="food" onClick={() => setLogSheet(true)} />
    </>
  );
}

export default function Glucose({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Blood Sugar" icon="blood" accent="red" wide theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="Where you are now, and how the days and weeks are going.">
      <Body theme={theme} />
    </ServicePage>
  );
}
