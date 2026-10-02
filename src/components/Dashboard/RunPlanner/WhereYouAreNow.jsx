import React, { useEffect, useState } from 'react';
import { RotateCw, Cookie, Syringe, Clock, Droplet } from 'lucide-react';
import Notice, { noticeButton } from './Notice';

// "Where you are now": your glucose, insulin and carbs on board and last bolus as tiles you can read at a glance
// (and edit in place), with the go / eat first / wait verdict from the readiness check across the top. The glucose
// tile shows where you sit against your floor, the 7-10 launch zone and your start target.

const ARROW = { DoubleUp: '⇈', SingleUp: '↑', FortyFiveUp: '↗', Flat: '→', FortyFiveDown: '↘', SingleDown: '↓', DoubleDown: '⇊' };
const TREND = { DoubleUp: 'rising fast', SingleUp: 'rising', FortyFiveUp: 'rising slowly', Flat: 'steady', FortyFiveDown: 'falling slowly', SingleDown: 'falling', DoubleDown: 'falling fast' };
const hm = (min) => (min == null ? '-' : min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min` : `${Math.round(min)} min`);

export default function WhereYouAreNow({ form, setForm, now, useCurrent: refreshReadings, plan, isDark, stepCarbs, busy }) {
  const floor = plan?.settings?.floor ?? 5;
  const startTarget = plan?.settings?.startTarget ?? 9;
  const n = now?.now || {};
  const bg = form.startBg !== '' && form.startBg != null ? Number(form.startBg) : n.bg ?? null;
  const iob = form.iob !== '' && form.iob != null ? Number(form.iob) : n.iob ?? null;
  const cob = form.cob !== '' && form.cob != null ? Number(form.cob) : n.cob ?? 0;
  const sinceBolus = form.minutesSinceBolus === '' || form.minutesSinceBolus == null ? null : Math.max(0, Math.round(Number(form.minutesSinceBolus)));
  const direction = n.direction || 'Flat';

  // the readiness verdict for these numbers
  const [ready, setReady] = useState(null);
  useEffect(() => {
    if (bg == null) return undefined;
    let live = true;
    const t = setTimeout(() => {
      const q = new URLSearchParams({ bg: String(bg), direction, iob: String(iob ?? 0), cob: String(cob ?? 0), durationMin: String(plan?.run?.durationMin || 45), intensity: form.intensity || 'steady', sessionType: 'running' });
      fetch(`/api/planner/readiness?${q}`, { credentials: 'same-origin' }).then((r) => r.json()).then((j) => { if (live && j.success) setReady(j.readiness); }).catch(() => {});
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [bg, direction, iob, cob, plan?.run?.durationMin, form.intensity]);

  const muted = isDark ? 'text-slate-400' : 'text-[#6A645D]';
  const tile = `rounded-xl border p-3 flex flex-col gap-1.5 ${isDark ? 'border-white/10 bg-white/5' : 'border-[#2E2B27]/10 bg-white'}`;
  const fit = (v, min = 2) => ({ width: `${Math.max(min, String(v ?? '').length) + 0.6}ch` });
  const big = `${'[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'} bg-transparent text-2xl font-black tabular-nums outline-none rounded-md px-1 -mx-1 focus:ring-2 focus:ring-emerald-500/40 ${isDark ? 'text-slate-100' : 'text-[#2E2B27]'}`;
  const head = `text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${muted}`;

  // glucose zone bar: 3 to 15 mmol/L
  const lo = 3, hi = 15;
  const pos = (v) => `${((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 100}%`;
  // readable on white: the darker shades in light mode, the lighter ones in dark mode
  const tone = (light, dark) => (isDark ? dark : light);
  const zone = bg == null ? null : bg < floor ? ['below your floor', tone('text-red-700', 'text-red-300')] : bg < 7 ? ['low for setting off', tone('text-amber-800', 'text-amber-300')] : bg <= 10 ? ['in the launch zone', tone('text-emerald-800', 'text-emerald-300')] : bg <= 15 ? ['high but safe to start', tone('text-yellow-800', 'text-yellow-200')] : ['too high - check ketones', tone('text-red-700', 'text-red-300')];

  const verdict = ready ? {
    go: { tone: 'good', title: 'Ready to run' },
    eat_first: { tone: 'warn', title: `Eat ${ready.recommendedCarbsGrams} g first` },
    wait: { tone: 'stop', title: ready.delayMinutes ? `Wait about ${ready.delayMinutes} min` : 'Wait' },
  }[ready.status] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className={`text-sm font-black uppercase tracking-wide ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>Where you are now</h2>
        {n.bgFresh && <span className={`text-[11px] ${muted}`}>from Nightscout, {n.bgMinutesAgo} min ago</span>}
        {busy === 'estimate' && <span className={`text-[11px] flex items-center gap-1 ${muted}`}><RotateCw size={11} className="animate-spin" /> updating the run plan</span>}
        <button onClick={() => refreshReadings(false)} className={`ml-auto px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${isDark ? 'border-white/15 hover:bg-white/5 text-slate-100' : 'border-[#2E2B27]/15 hover:bg-[#F4EFE6] text-[#2E2B27]'}`}>
          <RotateCw size={12} /> Use my current readings
        </button>
      </div>

      {/* the verdict */}
      {verdict && (
        <Notice isDark={isDark} tone={verdict.tone} large title={verdict.title}
          actions={ready.recommendedCarbsGrams > 0 && stepCarbs ? <button onClick={() => stepCarbs(ready.recommendedCarbsGrams)} className={noticeButton(isDark, true)}>Add {ready.recommendedCarbsGrams} g to the plan</button> : null}>
          {(ready.advisoryBullets || []).join(' ')}
        </Notice>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* glucose: the big one, with where it sits */}
        <div className={`${tile} col-span-2`}>
          <div className={head}><Droplet size={12} className="text-emerald-500" />Glucose</div>
          <div className="flex items-baseline gap-2">
            <input className={`${big} !text-3xl`} style={fit(form.startBg || n.bg, 3)} type="number" step="0.1" value={form.startBg} placeholder={n.bg != null ? String(n.bg) : '-'} onChange={(e) => setForm({ ...form, startBg: e.target.value })} aria-label="Glucose (mmol/L)" />
            <span className={`text-2xl font-black ${isDark ? 'text-slate-100' : 'text-[#2E2B27]'}`} title={TREND[direction]}>{ARROW[direction] || ''}</span>
            <span className={`text-[11px] ${muted}`}>mmol/L · {TREND[direction] || direction}</span>
          </div>
          {bg != null && (
            <div className="mt-1">
              <div className="relative h-3 rounded-full overflow-hidden flex">
                <div className="bg-red-400" style={{ width: pos(floor) }} />
                <div className="bg-amber-300" style={{ width: `calc(${pos(7)} - ${pos(floor)})` }} />
                <div className="bg-emerald-400" style={{ width: `calc(${pos(10)} - ${pos(7)})` }} />
                <div className="bg-yellow-300 flex-1" />
              </div>
              <div className="relative h-4">
                <div className={`absolute -top-[18px] w-1 h-5 rounded shadow ${isDark ? 'bg-white' : 'bg-slate-900'}`} style={{ left: `calc(${pos(bg)} - 2px)` }} />
                <div className={`absolute top-0 text-[9px] font-bold -translate-x-1/2 ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`} style={{ left: pos(startTarget) }}>▲ start {startTarget}</div>
              </div>
              <div className={`flex justify-between text-[9px] font-bold ${muted}`}><span>3</span><span>floor {floor}</span><span>7</span><span>10</span><span>15</span></div>
              {zone && <div className={`text-[11px] font-bold mt-0.5 ${zone[1]}`}>{bg} is {zone[0]}{bg < startTarget ? ` - ${Math.round((startTarget - bg) * 10) / 10} under your start target` : ''}</div>}
            </div>
          )}
        </div>

        {/* insulin on board, against the 1 U gate */}
        <div className={tile}>
          <div className={head}><Syringe size={12} className="text-violet-500" />Insulin on board</div>
          <div className="flex items-baseline gap-1"><input className={big} style={fit(form.iob || n.iob, 3)} type="number" step="0.1" value={form.iob} placeholder={n.iob != null ? String(n.iob) : '-'} onChange={(e) => setForm({ ...form, iob: e.target.value })} aria-label="Insulin on board (U)" /><span className={muted}>U</span></div>
          {iob != null && <>
            <div className="h-1.5 rounded-full bg-slate-500/15 overflow-hidden"><div className={`h-full ${iob >= 1 ? 'bg-amber-500' : 'bg-violet-500'}`} style={{ width: `${Math.min(100, (iob / 3) * 100)}%` }} /></div>
            <div className={`text-[11px] ${iob >= 1 ? `font-bold ${tone('text-amber-800', 'text-amber-300')}` : muted}`}>{iob >= 1 ? 'Over the 1 U gate - expect a faster drop' : 'Under the 1 U gate - good'}</div>
          </>}
        </div>

        {/* carbs on board */}
        <div className={tile}>
          <div className={head}><Cookie size={12} className="text-amber-500" />Carbs on board</div>
          <div className="flex items-baseline gap-1"><input className={big} style={fit(form.cob || n.cob, 1)} type="number" step="1" value={form.cob} placeholder={n.cob != null ? String(n.cob) : '0'} onChange={(e) => setForm({ ...form, cob: e.target.value })} aria-label="Carbs on board (g)" /><span className={muted}>g</span></div>
          <div className={`text-[11px] ${muted}`}>{cob > 0 ? 'Still absorbing - counted in the plan' : 'Nothing still absorbing'}</div>
        </div>

        {/* last bolus, against the 2-hour window */}
        <div className={tile}>
          <div className={head}><Clock size={12} className="text-sky-500" />Last bolus</div>
          <div className="flex items-baseline gap-1">
            <input className={`${big} text-right`} style={fit(sinceBolus == null ? '' : Math.floor(sinceBolus / 60), 2)} type="number" min="0" value={sinceBolus == null ? '' : Math.floor(sinceBolus / 60)} placeholder="-" onChange={(e) => setForm({ ...form, minutesSinceBolus: e.target.value === '' && sinceBolus == null ? '' : String((Number(e.target.value) || 0) * 60 + (sinceBolus ?? 0) % 60) })} aria-label="Hours since last bolus" />
            <span className={`text-xs font-bold ${muted}`}>h</span>
            <input className={`${big} text-right`} style={fit(2, 2)} type="number" min="0" max="59" value={sinceBolus == null ? '' : sinceBolus % 60} placeholder="-" onChange={(e) => setForm({ ...form, minutesSinceBolus: String(Math.floor((sinceBolus ?? 0) / 60) * 60 + (Number(e.target.value) || 0)) })} aria-label="Minutes since last bolus" />
            <span className={`text-xs font-bold ${muted}`}>min ago</span>
          </div>
          {sinceBolus != null && <div className={`text-[11px] ${sinceBolus < 120 ? `font-bold ${tone('text-amber-800', 'text-amber-300')}` : muted}`}>
            {n.lastBolusUnits != null && Math.abs((n.lastBolusMinutesAgo ?? -1) - sinceBolus) < 2 ? `${n.lastBolusUnits} U · ` : ''}{sinceBolus < 120 ? `Within 2 hours of the run - the bolus reduction guidance applies` : `${hm(sinceBolus)} ago - outside the 2-hour window`}
          </div>}
        </div>
      </div>
    </div>
  );
}
