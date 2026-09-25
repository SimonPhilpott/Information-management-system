import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Droplets, RotateCw, Sparkles, ChevronLeft, ChevronRight, Plus, Trash2, AlertTriangle, Moon } from 'lucide-react';
import PortalShell from './PortalShell';
import Prose from './Prose';

const PERIODS = [{ key: 1, label: '24 h' }, { key: 7, label: '7 days' }, { key: 14, label: '14 days' }, { key: 30, label: '30 days' }];
const ARROWS = { DoubleUp: '⇈', SingleUp: '↑', FortyFiveUp: '↗', Flat: '→', FortyFiveDown: '↘', SingleDown: '↓', DoubleDown: '⇊' };
const LOW = 3.9, HIGH = 10;
const colourOf = (v) => (v == null ? 'text-slate-400' : v < 3 ? 'text-red-500' : v < LOW ? 'text-red-400' : v <= HIGH ? 'text-emerald-400' : v <= 13.9 ? 'text-amber-400' : 'text-orange-500');
const fillOf = (v) => (v < 3 ? '#ef4444' : v < LOW ? '#f87171' : v <= HIGH ? '#34d399' : v <= 13.9 ? '#fbbf24' : '#f97316');
const hhmm = (t) => new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const shiftDay = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dayLabel = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

function TirBar({ s }) {
  const parts = [
    ['Very low <3.0', s.veryLowPct, '#ef4444'], ['Low 3.0-3.9', s.lowPct, '#f87171'], ['In range 3.9-10', s.inRangePct, '#34d399'],
    ['High 10-13.9', s.highPct, '#fbbf24'], ['Very high >13.9', s.veryHighPct, '#f97316'],
  ];
  return (
    <div>
      <div className="flex h-5 rounded-lg overflow-hidden">
        {parts.map(([k, v, c]) => v > 0 && <div key={k} style={{ width: `${v}%`, background: c }} title={`${k}: ${v}%`} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {parts.map(([k, v, c]) => (
          <span key={k} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: c }} />{k}: <b className="tabular-nums">{v}%</b></span>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Goals: over 70% in range, under 4% below 3.9, under 1% below 3.0.</p>
    </div>
  );
}

// One day: readings against the 3.9-10 band, with activities, insulin and carbs marked. Tap for a reading.
function DayChart({ data, isDark }) {
  const [pick, setPick] = useState(null);
  const W = 720, H = 220, L = 30, R = 8, T = 10, B = 24;
  const maxV = Math.max(15, ...data.readings.map((r) => r.v + 1));
  const x = (t) => L + ((t - data.from) / (data.to - data.from)) * (W - L - R);
  const y = (v) => T + (1 - v / maxV) * (H - T - B);
  const pts = data.readings;
  const grid = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const onPoint = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const t = data.from + ((px - L) / (W - L - R)) * (data.to - data.from);
    let best = null;
    for (const r of pts) if (!best || Math.abs(r.t - t) < Math.abs(best.t - t)) best = r;
    setPick(best && Math.abs(best.t - t) < 30 * 60000 ? best : null);
  };
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" onPointerDown={onPoint} onPointerMove={(e) => e.buttons && onPoint(e)}>
        <rect x={L} y={y(HIGH)} width={W - L - R} height={y(LOW) - y(HIGH)} fill="rgba(52,211,153,0.10)" />
        {[3.9, 10, 15].filter((v) => v <= maxV).map((v) => (
          <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={grid} strokeDasharray="3 3" /><text x={L - 4} y={y(v) + 3} fontSize="9" textAnchor="end" fill="#94a3b8">{v}</text></g>
        ))}
        {[0, 6, 12, 18, 24].map((h) => (
          <text key={h} x={L + (h / 24) * (W - L - R)} y={H - 6} fontSize="9" textAnchor="middle" fill="#94a3b8">{String(h % 24).padStart(2, '0')}:00</text>
        ))}
        {data.activities.map((a) => (
          <g key={a.id}><rect x={x(Math.max(a.start, data.from))} y={T} width={Math.max(2, x(Math.min(a.end, data.to)) - x(Math.max(a.start, data.from)))} height={H - T - B} fill="rgba(249,115,22,0.15)" />
            <text x={x(Math.max(a.start, data.from)) + 2} y={T + 10} fontSize="9" fill="#f97316">{a.sport}</text></g>
        ))}
        {pts.map((r, i) => i > 0 && r.t - pts[i - 1].t < 15 * 60000 && (
          <line key={r.t} x1={x(pts[i - 1].t)} y1={y(pts[i - 1].v)} x2={x(r.t)} y2={y(r.v)} stroke={fillOf(r.v)} strokeWidth="2" strokeLinecap="round" />
        ))}
        {data.treatments.filter((t) => t.insulin > 0).map((t) => (
          <g key={`i${t.at}`}><path d={`M${x(t.at) - 4},${H - B - 2} L${x(t.at) + 4},${H - B - 2} L${x(t.at)},${H - B - 10} Z`} fill="#60a5fa" /><title>{`${t.insulin} u at ${hhmm(t.at)}`}</title></g>
        ))}
        {[...data.treatments.filter((t) => t.carbs > 0).map((t) => ({ at: t.at, g: t.carbs })), ...data.carbs.map((c) => ({ at: c.at, g: c.grams }))].map((c) => (
          <g key={`c${c.at}`}><circle cx={x(c.at)} cy={T + 22} r="4" fill="#facc15" /><text x={x(c.at)} y={T + 36} fontSize="9" textAnchor="middle" fill="#facc15">{Math.round(c.g)}g</text></g>
        ))}
        {pick && (
          <g><line x1={x(pick.t)} x2={x(pick.t)} y1={T} y2={H - B} stroke="#94a3b8" strokeDasharray="2 2" /><circle cx={x(pick.t)} cy={y(pick.v)} r="4" fill={fillOf(pick.v)} /></g>
        )}
      </svg>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 mt-1">
        {pick ? <span className="font-bold text-sm text-inherit"><span className={colourOf(pick.v)}>{pick.v} mmol/L</span> at {hhmm(pick.t)} {ARROWS[pick.direction] || ''}</span> : <span>Tap the chart to see a reading.</span>}
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#facc15]" />carbs</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[#60a5fa]" />bolus</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-orange-500/40" />activity</span>
      </div>
    </div>
  );
}

// Median and spread for each hour of the day across the period.
function Profile({ profile, isDark }) {
  const W = 720, H = 180, L = 30, R = 8, T = 8, B = 22, maxV = 15;
  const pts = profile.filter((p) => p.median != null);
  if (pts.length < 4) return <p className="text-xs text-slate-500">Needs a few more days of readings to draw your typical day.</p>;
  const x = (h) => L + ((h + 0.5) / 24) * (W - L - R);
  const y = (v) => T + (1 - Math.min(v, maxV) / maxV) * (H - T - B);
  const band = (lo, hi) => pts.map((p) => `${x(p.hour)},${y(p[hi])}`).join(' ') + ' ' + [...pts].reverse().map((p) => `${x(p.hour)},${y(p[lo])}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <rect x={L} y={y(HIGH)} width={W - L - R} height={y(LOW) - y(HIGH)} fill="rgba(52,211,153,0.10)" />
      {[3.9, 10].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'} strokeDasharray="3 3" /><text x={L - 4} y={y(v) + 3} fontSize="9" textAnchor="end" fill="#94a3b8">{v}</text></g>)}
      <polygon points={band('p10', 'p90')} fill="rgba(96,165,250,0.15)" />
      <polygon points={band('p25', 'p75')} fill="rgba(96,165,250,0.30)" />
      <polyline points={pts.map((p) => `${x(p.hour)},${y(p.median)}`).join(' ')} fill="none" stroke="#60a5fa" strokeWidth="2" />
      {[0, 6, 12, 18].map((h) => <text key={h} x={L + (h / 24) * (W - L - R)} y={H - 6} fontSize="9" fill="#94a3b8">{String(h).padStart(2, '0')}:00</text>)}
    </svg>
  );
}

export default function GlucosePortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [days, setDays] = useState(14);
  const [summary, setSummary] = useState(null);
  const [day, setDay] = useState(todayStr());
  const [dayData, setDayData] = useState(null);
  const [carbs, setCarbs] = useState([]);
  const [carbForm, setCarbForm] = useState({ grams: '', food: '' });
  const [nsWrite, setNsWrite] = useState(null);
  const [nsSecret, setNsSecret] = useState('');
  const [busy, setBusy] = useState('');
  const [notification, setNotification] = useState(null);
  const notify = (msg, type = 'success') => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3500); };
  const panel = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const field = `px-3 py-2 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10' : 'bg-white border-[#2E2B27]/10'}`;
  const gradient = 'from-rose-500 to-red-600';

  const load = useCallback(async () => {
    const d = await (await fetch(`/api/glucose-hub/summary?days=${days}`)).json();
    if (d.success) setSummary(d);
  }, [days]);
  const loadDay = useCallback(async () => {
    const d = await (await fetch(`/api/glucose-hub/day?date=${day}`)).json();
    if (d.success) setDayData(d);
  }, [day]);
  const loadCarbs = useCallback(async () => {
    const d = await (await fetch('/api/glucose-hub/carbs?days=7')).json();
    if (d.success) setCarbs(d.carbs);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadDay(); }, [loadDay]);
  useEffect(() => { loadCarbs(); }, [loadCarbs]);
  useEffect(() => { fetch('/api/glucose-hub/nightscout').then((r) => r.json()).then((d) => d.success && setNsWrite(d.configured)).catch(() => {}); }, []);
  useEffect(() => { const t = setInterval(() => { load(); if (day === todayStr()) loadDay(); }, 60000); return () => clearInterval(t); }, [load, loadDay, day]);

  const addCarbs = async () => {
    const res = await fetch('/api/glucose-hub/carbs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(carbForm) });
    const d = await res.json();
    if (!d.success) return notify(d.error, 'error');
    setCarbForm({ grams: '', food: '' }); loadCarbs(); loadDay(); notify('Carbs logged.');
  };
  const saveNsSecret = async (secret) => {
    setBusy('ns');
    try {
      const d = await (await fetch('/api/glucose-hub/nightscout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret }) })).json();
      if (!d.success) throw new Error(d.error);
      setNsWrite(d.configured); setNsSecret('');
      notify(d.configured ? 'Nightscout accepted the secret - carbs will be sent there.' : 'Removed - carbs stay in IMS only.');
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(''); }
  };
  const delCarbs = async (id) => { await fetch(`/api/glucose-hub/carbs/${id}`, { method: 'DELETE' }); loadCarbs(); loadDay(); };
  const analyse = async () => {
    setBusy('insight');
    try {
      const d = await (await fetch('/api/glucose-hub/insight', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days }) })).json();
      if (!d.success) throw new Error(d.error);
      setSummary((s) => ({ ...s, insight: d.insight }));
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(''); }
  };

  const cur = summary?.current;
  const s = summary?.stats, p = summary?.previous;
  const earlyDays = summary?.dataSince ? (Date.now() - summary.dataSince) / 86400000 : null;
  const cmp = (a, b, better) => (a == null || b == null || a === b ? null : (better === 'up' ? a > b : a < b) ? 'better' : 'worse');
  const chips = useMemo(() => (s ? [
    ['Average', `${s.mean} mmol/L`, cmp(Math.abs(s.mean - 7), p && Math.abs(p.mean - 7), 'down')],
    ['Estimated HbA1c (GMI)', `${s.gmiPct}%`, null],
    ['Variability (CV)', `${s.cvPct}%`, s.cvPct <= 36 ? 'better' : 'worse'],
    ['Tight range 3.9-7.8', `${s.tightPct}%`, cmp(s.tightPct, p?.tightPct, 'up')],
    ['Lowest / highest', `${s.min} / ${s.max}`, null],
    ['Sensor coverage', `${s.coveragePct}%`, null],
  ] : []), [s, p]);

  return (
    <PortalShell title="Blood Sugar" subtitle="/ims/glucose • your glucose, from IMS's own log"
      icon={Droplets} gradient={gradient} glow="rgba(244,63,94,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification} maxWidth="max-w-5xl">

      {/* right now */}
      <div className={`${panel} flex flex-wrap items-center gap-6`}>
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Right now</div>
          <div className={`text-5xl font-black tabular-nums ${colourOf(cur?.value)} ${cur && !cur.fresh ? 'opacity-50' : ''}`}>
            {cur ? cur.value : '--'} <span className="text-3xl">{ARROWS[cur?.direction] || ''}</span>
          </div>
          <div className="text-xs text-slate-500">{cur ? `${cur.delta != null ? `${cur.delta > 0 ? '+' : ''}${cur.delta} · ` : ''}${cur.minutesAgo} min ago · ${cur.range}` : 'No readings yet'}</div>
        </div>
        <div className="flex gap-6 text-sm">
          <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Insulin on board</div><div className="font-bold tabular-nums">{cur?.iob != null ? `${cur.iob} u` : '-'}</div></div>
          <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Carbs on board</div><div className="font-bold tabular-nums">{cur?.cob != null ? `${cur.cob} g` : '-'}</div></div>
        </div>
        {summary?.overnight && (
          <div className="flex items-start gap-2 text-xs"><Moon size={14} className="mt-0.5 text-indigo-400" />
            <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Last night</div>
              {summary.overnight.inRangePct}% in range · lowest {summary.overnight.min} · woke at {summary.overnight.endValue}</div></div>
        )}
      </div>

      {earlyDays != null && earlyDays < 14 && (
        <div className={`${panel} text-xs flex items-center gap-2`}><AlertTriangle size={14} className="text-amber-500 shrink-0" />
          IMS has {earlyDays < 1 ? `${Math.round(earlyDays * 24)} hours` : `${Math.round(earlyDays * 10) / 10} days`} of glucose since the log was restarted, so longer periods fill in over the next couple of weeks.</div>
      )}

      {/* period */}
      <div className={panel}>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="text-xs font-black uppercase tracking-wider">Time in range</h2>
          <div className={`ml-auto flex max-w-full overflow-x-auto rounded-lg border [scrollbar-width:none] ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
            {PERIODS.map((o) => (
              <button key={o.key} onClick={() => setDays(o.key)} className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${days === o.key ? `bg-gradient-to-r ${gradient} text-white` : isDark ? 'text-slate-400 hover:bg-white/5' : 'text-slate-600 hover:bg-black/5'}`}>{o.label}</button>
            ))}
          </div>
        </div>
        {s ? (
          <>
            <TirBar s={s} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
              {chips.map(([k, v, tone]) => (
                <div key={k} className={`rounded-xl border px-3 py-2 ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">{k}</div>
                  <div className={`text-base font-bold tabular-nums ${tone === 'better' ? 'text-emerald-500' : tone === 'worse' ? 'text-amber-500' : ''}`}>{v}</div>
                </div>
              ))}
            </div>
            {summary.totals && <p className="mt-3 text-[11px] text-slate-500">Over this period: {summary.totals.bolusUnits} u bolus logged by the loop, {summary.totals.carbsG} g carbs entered.</p>}
          </>
        ) : <p className="text-xs text-slate-500">No readings in this period yet.</p>}
      </div>

      {/* one day */}
      <div className={panel}>
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setDay(shiftDay(day, -1))} className="p-1.5 rounded-lg hover:bg-slate-500/10"><ChevronLeft size={16} /></button>
          <h2 className="text-xs font-black uppercase tracking-wider flex-1 text-center">{day === todayStr() ? 'Today' : dayLabel(day)}</h2>
          <button onClick={() => setDay(shiftDay(day, 1))} disabled={day >= todayStr()} className="p-1.5 rounded-lg hover:bg-slate-500/10 disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
        {dayData && dayData.readings.length ? <DayChart data={dayData} isDark={isDark} /> : <p className="text-xs text-slate-500 text-center py-8">No readings for this day.</p>}
        {dayData?.stats && <p className="mt-2 text-[11px] text-slate-500 text-center">{dayData.stats.inRangePct}% in range · average {dayData.stats.mean} · lowest {dayData.stats.min} · highest {dayData.stats.max}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={panel}>
          <h2 className="text-xs font-black uppercase tracking-wider mb-3">Your typical day ({PERIODS.find((o) => o.key === days)?.label})</h2>
          {summary && <Profile profile={summary.profile} isDark={isDark} />}
          <p className="text-[11px] text-slate-500 mt-1">Line: median. Dark band: middle half of readings. Light band: 10th to 90th percentile.</p>
        </div>
        <div className={panel}>
          <h2 className="text-xs font-black uppercase tracking-wider mb-3">Lows (below 3.9 for 15 minutes or more)</h2>
          {summary?.lows?.length ? (
            <div className="flex flex-col gap-1.5 text-xs">
              {summary.lows.map((l) => (
                <div key={l.start} className="flex flex-wrap items-baseline gap-x-3">
                  <span className="w-32 text-slate-500">{l.when}</span>
                  <span className={`font-bold ${colourOf(l.lowest)}`}>{l.lowest}</span>
                  <span className="text-slate-500">{l.minutes} min</span>
                  {l.overnight && <span className="text-indigo-400">overnight</span>}
                  {l.afterExercise && <span className="text-orange-500">after {l.afterExercise}</span>}
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-slate-500">None in this period.</p>}
        </div>
      </div>

      {/* carbs */}
      <div className={panel}>
        <h2 className="text-xs font-black uppercase tracking-wider mb-1">Carb log</h2>
        <p className="text-[11px] text-slate-500 mb-3">Say "Hey IMS, I've just had two slices of toast" - Ims looks the carbs up in Open Food Facts, asks if it needs to (white or brown, how thick), and logs the total. {nsWrite ? 'Entries are also sent to Nightscout as a Carb Correction.' : 'Add your Nightscout API secret below to send entries to Nightscout too.'}</p>
        <div className={`mb-3 p-3 rounded-xl border text-xs flex flex-wrap items-center gap-2 ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
          <span className="font-bold">Nightscout:</span>
          {nsWrite ? (
            <>
              <span className="text-emerald-500 font-semibold">connected - carbs are sent there</span>
              <button onClick={() => saveNsSecret('')} disabled={busy === 'ns'} className="ml-auto px-2 py-1 rounded-lg text-[11px] font-bold border border-slate-500/30">Disconnect</button>
            </>
          ) : (
            <>
              <input type="password" autoComplete="off" className={`${field} flex-1 min-w-[10rem]`} placeholder="API secret (from your Nightscout settings)" value={nsSecret} onChange={(e) => setNsSecret(e.target.value)} />
              <button onClick={() => saveNsSecret(nsSecret)} disabled={!nsSecret || busy === 'ns'} className={`px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r ${gradient} text-white disabled:opacity-40`}>{busy === 'ns' ? 'Checking...' : 'Connect'}</button>
              <span className="w-full text-[10px] text-slate-500">Stored encrypted on the IMS server. AAPS may pick these carbs up from Nightscout, so don't also enter the same food in AAPS.</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          <input className={`${field} w-24`} inputMode="decimal" placeholder="grams" value={carbForm.grams} onChange={(e) => setCarbForm({ ...carbForm, grams: e.target.value })} />
          <input className={`${field} flex-1 min-w-[10rem]`} placeholder="what (optional)" value={carbForm.food} onChange={(e) => setCarbForm({ ...carbForm, food: e.target.value })} />
          <button onClick={addCarbs} disabled={!carbForm.grams} className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r ${gradient} text-white disabled:opacity-40`}><Plus size={13} /> Log</button>
        </div>
        {carbs.length ? (
          <div className="flex flex-col gap-1 text-xs">
            {carbs.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="w-32 text-slate-500">{new Date(c.at).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="font-bold tabular-nums w-12">{Math.round(c.grams)} g</span>
                <span className="flex-1 truncate">{c.food || ''}</span>
                {c.ns_id && <span className="text-[10px] font-bold text-emerald-500" title="Sent to Nightscout">NS</span>}
                <button onClick={() => delCarbs(c.id)} className="p-1 rounded hover:bg-slate-500/10 text-slate-500"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-slate-500">Nothing logged in the last week.</p>}
      </div>

      {/* AI read */}
      <div className={panel}>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <h2 className="text-xs font-black uppercase tracking-wider flex items-center gap-2"><Sparkles size={13} className="text-rose-400" />What the numbers say</h2>
          <button onClick={analyse} disabled={busy === 'insight'} className={`ml-auto px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r ${gradient} text-white disabled:opacity-50`}>
            {busy === 'insight' ? <RotateCw size={13} className="animate-spin" /> : <Sparkles size={13} />} {summary?.insight ? 'Refresh' : 'Analyse'}
          </button>
        </div>
        {summary?.insight ? (
          <>
            <Prose text={summary.insight.text} className="text-sm leading-relaxed" />
            <p className="text-[10px] text-slate-500 mt-2">Written {new Date(summary.insight.at).toLocaleString('en-GB')} from {summary.insight.days} days. Never gives insulin doses; talk those through with your diabetes team.</p>
          </>
        ) : <p className="text-xs text-slate-500">Press Analyse for a plain-English read of the patterns, lows and what to try. It never gives insulin doses.</p>}
      </div>
    </PortalShell>
  );
}
