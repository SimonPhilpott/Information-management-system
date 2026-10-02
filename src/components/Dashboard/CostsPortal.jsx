import React, { useEffect, useState } from 'react';
import { PoundSterling, Plus, Trash2, Save, ArrowRight } from 'lucide-react';
import PortalShell from './PortalShell';
import Notice from './RunPlanner/Notice';

// Costs: everything IMS costs to run - measured Gemini API use for every service (priced from an
// editable table), plus subscriptions and the other services the project leans on.
const PERIODS = [['month', 'This month'], ['lastMonth', 'Last month'], ['30d', 'Last 30 days'], ['7d', 'Last 7 days']];
const gbp = (n) => `£${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tokens = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n || 0));

export default function CostsPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState(null);
  const [fixed, setFixed] = useState([]);
  const [prices, setPrices] = useState({});
  const [fx, setFx] = useState(0.75);
  const [dirty, setDirty] = useState({ fixed: false, prices: false });
  const [note, setNote] = useState(null);

  const card = isDark ? 'bg-slate-900/60 border-white/10' : 'bg-white border-[#2E2B27]/15 shadow-sm';
  const strong = isDark ? 'text-slate-50' : 'text-slate-900';
  const body = isDark ? 'text-slate-200' : 'text-slate-800';
  const line = isDark ? 'border-white/10' : 'border-slate-200';
  const track = isDark ? 'bg-white/10' : 'bg-slate-200';
  const input = `rounded-md border px-2 py-1 text-xs ${isDark ? 'bg-slate-950 border-white/20 text-slate-50' : 'bg-white border-slate-300 text-slate-900'}`;
  const btn = `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${isDark ? 'bg-white/5 border-white/15 text-slate-100 hover:bg-white/10' : 'bg-white border-slate-300 text-slate-900 hover:bg-slate-100'}`;
  const primary = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50';

  const load = async (p = period) => {
    try {
      const j = await (await fetch(`/api/costs?period=${p}`)).json();
      if (!j.success) throw new Error(j.error);
      setData(j); setFixed(j.fixed); setPrices(j.prices); setFx(j.usdToGbp);
      setDirty({ fixed: false, prices: false });
    } catch (e) { setNote({ type: 'error', msg: e.message }); }
  };
  useEffect(() => { load(period); }, [period]);
  useEffect(() => { if (note) { const t = setTimeout(() => setNote(null), 4500); return () => clearTimeout(t); } }, [note]);

  const put = async (url, body, what) => {
    try {
      const j = await (await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
      if (!j.success) throw new Error(j.error);
      setNote({ type: 'ok', msg: `${what} saved` });
      await load();
    } catch (e) { setNote({ type: 'error', msg: e.message }); }
  };

  const setRow = (i, k, v) => { setFixed((f) => f.map((r, j) => (j === i ? { ...r, [k]: v } : r))); setDirty((d) => ({ ...d, fixed: true })); };
  const setPrice = (model, k, v) => { setPrices((p) => ({ ...p, [model]: { ...(p[model] || { input: 0, output: 0 }), [k]: v } })); setDirty((d) => ({ ...d, prices: true })); };

  const api = data?.api;
  const maxSvc = Math.max(0.0001, ...(api?.byService || []).map((s) => s.gbp));
  const maxDay = Math.max(0.0001, ...(api?.byDay || []).map((d) => d.gbp));
  const paid = fixed.filter((c) => c.category !== 'Free service');
  const free = fixed.filter((c) => c.category === 'Free service');

  const Tile = ({ label, value, sub }) => (
    <div className={`rounded-xl border p-4 ${card}`}>
      <div className={`text-xs font-bold uppercase tracking-wide ${body}`}>{label}</div>
      <div className={`text-2xl font-black mt-1 ${strong}`}>{value}</div>
      {sub && <div className={`text-xs mt-1 ${body}`}>{sub}</div>}
    </div>
  );

  const FixedRow = (c, i) => (
    <tr key={c.id} className={`border-t ${line}`}>
      <td className="py-1.5 pr-2"><input className={`${input} w-full font-semibold`} value={c.name} onChange={(e) => setRow(i, 'name', e.target.value)} /><div className={`text-[11px] mt-0.5 ${body}`}>{c.usedFor}</div></td>
      <td className="py-1.5 pr-2 whitespace-nowrap">
        <select className={input} value={c.currency} onChange={(e) => setRow(i, 'currency', e.target.value)}><option value="GBP">£</option><option value="USD">US$</option></select>
        <input className={`${input} w-20 ml-1 tabular-nums`} type="number" min="0" step="0.01" value={c.amount} onChange={(e) => setRow(i, 'amount', e.target.value)} />
        <select className={`${input} ml-1`} value={c.period} onChange={(e) => setRow(i, 'period', e.target.value)}><option value="month">/month</option><option value="year">/year</option></select>
      </td>
      <td className={`py-1.5 pr-3 text-right font-bold tabular-nums ${strong}`}>{gbp(c.monthlyGBP)}</td>
      <td className="py-1.5 pr-2">
        <button onClick={() => setRow(i, 'estimated', !c.estimated)} title={c.estimated ? 'Click once you have checked this against a real bill' : 'Click to mark as an estimate again'}
          className={`px-2 py-1 rounded-md text-[11px] font-black whitespace-nowrap ${c.estimated ? 'bg-amber-400 text-black hover:bg-amber-500' : 'bg-emerald-700 text-white hover:bg-emerald-800'}`}>
          {c.estimated ? 'Estimate - confirm?' : 'Confirmed'}
        </button>
      </td>
      <td className="py-1.5 text-right"><button className={btn} title="Remove" onClick={() => { setFixed((f) => f.filter((_, j) => j !== i)); setDirty((d) => ({ ...d, fixed: true })); }}><Trash2 size={12} /></button></td>
    </tr>
  );

  return (
    <PortalShell title="Costs" subtitle="/ims/costs • what IMS costs to run: Gemini API use, subscriptions and services" icon={PoundSterling}
      gradient="from-emerald-600 to-teal-700" glow="rgba(16,185,129,0.3)" isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={note}>
      {!data ? <div className={`p-8 ${body}`}>Adding it up...</div> : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {PERIODS.map(([k, label]) => (
              <button key={k} onClick={() => setPeriod(k)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${period === k ? 'bg-emerald-700 border-emerald-700 text-white' : btn}`}>{label}</button>
            ))}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label={`Gemini API - ${data.label.toLowerCase()}`} value={gbp(api.gbp)} sub={`${api.calls.toLocaleString('en-GB')} calls · US$${api.usd.toFixed(2)}`} />
            <Tile label="Gemini API - month projected" value={api.projectedGBP != null ? gbp(api.projectedGBP) : '-'} sub={api.projectedGBP != null ? 'At this month\'s rate so far' : 'Choose "This month"'} />
            <Tile label="Subscriptions & services" value={`${gbp(data.fixedMonthlyGBP)}/month`} sub={`${paid.filter((c) => c.estimated && c.amount > 0).length} amount(s) still estimates`} />
            <Tile label="Estimated monthly total" value={data.monthlyTotalGBP != null ? gbp(data.monthlyTotalGBP) : '-'} sub="Projected API + subscriptions" />
          </div>

          <Notice isDark={isDark} tone="info" title="Where these numbers come from">
            Gemini API costs are measured: every call's real token counts (thinking tokens included, and Live voice per turn) priced at the rates below. Before {data.trackingSince ? new Date(data.trackingSince).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : 'today'} only library chat, search and indexing were recorded, so earlier periods understate it. Your Google AI Pro subscription pays for the Gemini app, not API calls - those are billed to the Google Cloud project behind IMS's API key (free within limits on the API's free tier, in which case the API figures are what it would cost). Subscription amounts start as typical list prices marked "Estimate" until you confirm them against a bill.
          </Notice>
          {api.unpricedModels.length > 0 && (
            <Notice isDark={isDark} tone="warn" title={`${tokens(api.unpricedTokens)} tokens on models with no price set`}>
              {api.unpricedModels.join(', ')} - not counted in the totals. Add their prices under Prices below (ai.google.dev/pricing).
            </Notice>
          )}

          <section className={`rounded-xl border p-4 ${card}`}>
            <h2 className={`text-sm font-black uppercase tracking-wide mb-3 ${strong}`}>Gemini API by service</h2>
            {!api.byService.length ? <p className={`text-xs ${body}`}>No API use recorded in this period.</p> : (
              <div className="space-y-2">
                {api.byService.map((s) => (
                  <div key={s.key} className="grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-3 text-xs">
                    <div className="min-w-0"><div className={`font-bold truncate ${strong}`}>{s.label}</div><div className={`truncate ${body}`}>{s.models.join(', ')}</div></div>
                    <div className={`h-3 rounded ${track}`}><div className="h-full rounded bg-emerald-600" style={{ width: `${Math.max(0.5, (s.gbp / maxSvc) * 100)}%` }} /></div>
                    <div className={`text-right tabular-nums ${body}`}><span className={`font-black ${strong}`}>{gbp(s.gbp)}</span><div>{s.calls} call{s.calls === 1 ? '' : 's'} · {tokens(s.input)} in / {tokens(s.output)} out</div></div>
                  </div>
                ))}
              </div>
            )}
            {api.byDay.length > 1 && (
              <div className="mt-4">
                <div className={`text-xs font-bold mb-1 ${body}`}>By day</div>
                <div className="flex items-end gap-0.5 h-20">
                  {api.byDay.map((d) => (
                    <div key={d.day} className="flex-1 min-w-[3px] rounded-t bg-emerald-600" style={{ height: `${Math.max(2, (d.gbp / maxDay) * 100)}%` }} title={`${d.day}: ${gbp(d.gbp)}`} />
                  ))}
                </div>
                <div className={`flex justify-between text-[11px] mt-1 ${body}`}><span>{api.byDay[0].day}</span><span>{api.byDay[api.byDay.length - 1].day}</span></div>
              </div>
            )}
          </section>

          <section className={`rounded-xl border p-4 ${card}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className={`text-sm font-black uppercase tracking-wide ${strong}`}>Subscriptions & services</h2>
              <div className="flex gap-2">
                <button className={btn} onClick={() => { setFixed((f) => [...f, { id: `custom-${Date.now()}`, name: 'New service', provider: '', category: 'Subscription', amount: 0, currency: 'GBP', period: 'month', estimated: true, usedFor: '', monthlyGBP: 0 }]); setDirty((d) => ({ ...d, fixed: true })); }}><Plus size={13} />Add</button>
                <button className={primary} disabled={!dirty.fixed} onClick={() => put('/api/costs/fixed', { fixed: fixed.map(({ monthlyGBP, ...c }) => c) }, 'Subscriptions')}><Save size={13} />Save</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className={`text-left ${body}`}><th className="pb-1 font-bold">Service</th><th className="pb-1 font-bold">Price</th><th className="pb-1 pr-3 font-bold text-right">Per month</th><th className="pb-1 font-bold">Status</th><th /></tr></thead>
                <tbody>{fixed.map((c, i) => (c.category !== 'Free service' ? FixedRow(c, i) : null))}</tbody>
              </table>
            </div>
            <h3 className={`text-xs font-black uppercase tracking-wide mt-4 mb-1.5 ${strong}`}>Free services IMS relies on</h3>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
              {free.map((c) => <div key={c.id} className={`text-xs ${body}`}><span className={`font-bold ${strong}`}>{c.name}</span> - {c.usedFor}</div>)}
            </div>
          </section>

          <section className={`rounded-xl border p-4 ${card}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className={`text-sm font-black uppercase tracking-wide ${strong}`}>Prices (US$ per million tokens)</h2>
              <div className="flex items-center gap-2">
                <label className={`text-xs font-bold ${body}`}>US$1 = £<input className={`${input} w-16 ml-1`} type="number" step="0.01" min="0.1" max="2" value={fx} onChange={(e) => { setFx(e.target.value); setDirty((d) => ({ ...d, prices: true })); }} /></label>
                <button className={primary} disabled={!dirty.prices} onClick={() => put('/api/costs/prices', { prices, usdToGbp: fx }, 'Prices')}><Save size={13} />Save</button>
              </div>
            </div>
            <table className="w-full text-xs">
              <thead><tr className={`text-left ${body}`}><th className="pb-1 font-bold">Model</th><th className="pb-1 font-bold">Input</th><th className="pb-1 font-bold">Output</th><th className="pb-1 font-bold text-right">This period</th></tr></thead>
              <tbody>
                {[...new Set([...api.byModel.map((m) => m.model), ...Object.keys(prices)])].map((model) => {
                  const used = api.byModel.find((m) => m.model === model);
                  const p = prices[model];
                  return (
                    <tr key={model} className={`border-t ${line}`}>
                      <td className={`py-1.5 pr-2 font-semibold ${strong}`}><code>{model}</code>{!p && <span className={`ml-2 font-bold ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>no price</span>}</td>
                      <td className="py-1.5 pr-2"><input className={`${input} w-20`} type="number" min="0" step="0.01" value={p?.input ?? ''} placeholder="-" onChange={(e) => setPrice(model, 'input', e.target.value)} /></td>
                      <td className="py-1.5 pr-2"><input className={`${input} w-20`} type="number" min="0" step="0.01" value={p?.output ?? ''} placeholder="-" onChange={(e) => setPrice(model, 'output', e.target.value)} /></td>
                      <td className={`py-1.5 text-right tabular-nums ${body}`}>{used ? <><span className={`font-black ${strong}`}>{gbp(used.gbp)}</span> · {tokens(used.input + used.output)} tokens</> : 'not used'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className={`text-[11px] mt-2 ${body}`}>Output includes thinking tokens. Live voice models are billed mostly for audio, at higher rates than text - check Google's pricing page for the Live model you use.</p>
          </section>

          <button className={btn} onClick={() => { window.history.pushState(null, '', '/ims/spend'); setCurrentPath?.('/ims/spend'); }}>Monthly budget cap and costly prompts: Gemini Spend Budget <ArrowRight size={13} /></button>
        </div>
      )}
    </PortalShell>
  );
}
