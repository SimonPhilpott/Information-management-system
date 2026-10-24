// Costs in the IMS design (24 Oct 2026): what IMS costs to run - measured Gemini API use for every service (priced
// from an editable table), the monthly budget, the costliest calls, and the subscriptions and free services it leans
// on. Add a subscription is the button in the bottom right; each one opens to change it. The same /api/costs requests
// as before (Dashboard/CostsPortal.jsx).
import React, { useEffect, useState } from 'react';
import ServicePage, { ItemCard, Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextField, SelectField, FilterChip, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';

const PERIODS = [['month', 'This month'], ['lastMonth', 'Last month'], ['30d', 'Last 30 days'], ['7d', 'Last 7 days']];
const gbp = (n) => `£${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tokens = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n || 0));
const PORTALS = [
  ['Google AI Studio', 'Plan, rate limits and API keys', 'https://aistudio.google.com/app/plan_information'],
  ['Google Cloud billing', 'The real bills and daily spend', 'https://console.cloud.google.com/billing'],
  ['API traffic', 'Requests, errors and speed', 'https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/metrics'],
  ['Google\'s price list', 'Prices per million tokens', 'https://ai.google.dev/pricing'],
];
const SERVICE_URLS = { 'google-ai-pro': 'https://gemini.google.com/', 'heroku-nightscout': 'https://dashboard.heroku.com/', 'nightscout-db': 'https://cloud.mongodb.com/', 'ring-protect': 'https://ring.com/account/plans', ngrok: 'https://dashboard.ngrok.com/', strava: 'https://www.strava.com/settings/billing', komoot: 'https://www.komoot.com/account', github: 'https://github.com/settings/billing', 'open-meteo': 'https://open-meteo.com/', ntfy: 'https://ntfy.sh/', 'card-dbs': 'https://boardgamegeek.com/', off: 'https://world.openfoodfacts.org/', bbc: 'https://www.bbc.co.uk/news', osm: 'https://www.openstreetmap.org/', 'google-apis': 'https://console.cloud.google.com/apis/dashboard' };

function Body() {
  const snack = useSnack();
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState(null);
  const [prices, setPrices] = useState({});
  const [fx, setFx] = useState(0.75);
  const [pricesDirty, setPricesDirty] = useState(false);
  const [cap, setCap] = useState('');
  const [sub, setSub] = useState(null); // the subscription being changed: { i, ...row }
  const [confirm, setConfirm] = useState(null);

  const load = async (p = period) => {
    try {
      const j = await (await fetch(`/api/costs?period=${p}`)).json();
      if (!j.success) throw new Error(j.error);
      setData(j); setPrices(j.prices); setFx(j.usdToGbp); setCap(j.budget?.capGBP ? String(j.budget.capGBP) : ''); setPricesDirty(false);
    } catch (e) { snack(e.message, { error: true }); }
  };
  useEffect(() => { load(period); }, [period]); // eslint-disable-line react-hooks/exhaustive-deps
  const put = async (url, body, what) => {
    try { const j = await (await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(); if (!j.success) throw new Error(j.error); snack(`${what} saved.`); await load(); } catch (e) { snack(e.message, { error: true }); }
  };
  const saveFixed = (list) => put('/api/costs/fixed', { fixed: list.map(({ monthlyGBP, ...c }) => c) }, 'Subscriptions'); // eslint-disable-line no-unused-vars
  const saveSub = async () => {
    const { i, ...row } = sub;
    const list = [...data.fixed];
    if (i == null) list.push(row); else list[i] = { ...list[i], ...row };
    await saveFixed(list); setSub(null);
  };
  const removeSub = (i) => setConfirm({ title: `Remove ${data.fixed[i].name}?`, okLabel: 'Remove', danger: true, onOk: () => saveFixed(data.fixed.filter((_, j) => j !== i)) });

  if (!data) return <div className="imsm-empty"><Spinner /><span>Adding it up…</span></div>;
  const api = data.api;
  const b = data.budget;
  const maxSvc = Math.max(0.0001, ...api.byService.map((s) => s.gbp));
  const maxDay = Math.max(0.0001, ...api.byDay.map((d) => d.gbp));
  const paid = data.fixed.map((c, i) => ({ ...c, i })).filter((c) => c.category !== 'Free service');
  const free = data.fixed.filter((c) => c.category === 'Free service');
  const pct = Math.min(100, b.percentage || 0);
  const proj = b.capGBP ? Math.min(100, (b.projectedGBP / b.capGBP) * 100) : 0;
  const tone = b.status === 'critical' ? 'low' : b.status === 'near' || b.status === 'on course to go over' ? 'near' : 'ok';

  return (
    <>
      <div className="chips wrap">{PERIODS.map(([k, l]) => <FilterChip key={k} on={period === k} onClick={() => setPeriod(k)}>{l}</FilterChip>)}</div>
      <div className="imsm-stats">
        <div className="imsm-stat"><span className="k"><Icon n="sparkle" size={16} />Gemini, {data.label.toLowerCase()}</span><b>{gbp(api.gbp)}</b><span className="s">{api.calls.toLocaleString('en-GB')} calls, US${api.usd.toFixed(2)}</span></div>
        <div className="imsm-stat"><span className="k"><Icon n="chart" size={16} />This month, projected</span><b>{api.projectedGBP != null ? gbp(api.projectedGBP) : '–'}</b><span className="s">{api.projectedGBP != null ? 'At this month\'s rate so far' : 'Choose This month'}</span></div>
        <div className="imsm-stat"><span className="k"><Icon n="calendar" size={16} />Subscriptions</span><b>{gbp(data.fixedMonthlyGBP)}<small> a month</small></b><span className="s">{paid.filter((c) => c.estimated && c.amount > 0).length} still estimates</span></div>
        <div className="imsm-stat"><span className="k"><Icon n="calc" size={16} />A month in all</span><b>{data.monthlyTotalGBP != null ? gbp(data.monthlyTotalGBP) : '–'}</b><span className="s">Projected Gemini and subscriptions</span></div>
      </div>

      <section className="imsm-card">
        <div className="imsm-row"><h3 style={{ flex: 1, margin: 0 }}>Monthly Gemini budget</h3>
          <TextField label="Budget (£)" type="number" inputMode="decimal" value={cap} onChange={setCap} style={{ width: 140 }} />
          <Btn icon="check" disabled={String(b.capGBP || '') === String(cap)} onClick={() => put('/api/costs/budget', { capGBP: Number(cap) || 0 }, 'Budget')}>Save</Btn></div>
        {b.capGBP ? (
          <>
            <div className="imsm-budget"><i className={tone} style={{ width: `${pct}%` }} /><span className="proj" style={{ left: `${proj}%` }} title={`By the month end: ${gbp(b.projectedGBP)}`} /></div>
            <p style={{ margin: 0 }}><b>{gbp(b.spentGBP)}</b> of {gbp(b.capGBP)} used ({b.percentage}%), {gbp(b.remainingGBP)} left, {gbp(b.projectedGBP)} by the month end (the dashed line).
              {b.status === 'critical' && <b> Over 95%: library chat warns before each answer.</b>}
              {b.status === 'near' && <b> Over 80%: library chat now warns before answering.</b>}
              {b.status === 'on course to go over' && <b> On course to go over by the month end.</b>}</p>
          </>
        ) : <p className="muted" style={{ margin: 0 }}>No budget set. With one, library chat warns you once 80% is used. This month so far: {gbp(b.spentGBP)}, {gbp(b.projectedGBP)} projected.</p>}
      </section>
      {api.unpricedModels.length > 0 && <div className="imsm-banner warn"><Icon n="info" size={20} /><span><b>{tokens(api.unpricedTokens)} tokens on models with no price.</b> {api.unpricedModels.join(', ')} aren't in the totals; add their prices below.</span></div>}

      <section className="imsm-card">
        <h3>Gemini by service</h3>
        {!api.byService.length ? <p className="muted" style={{ margin: 0 }}>Nothing in this period.</p> : api.byService.map((s) => (
          <div key={s.key} className="imsm-svc">
            <span className="nm"><b>{s.label}</b><small className="muted">{s.models.join(', ')}</small></span>
            <span className="track"><i style={{ width: `${Math.max(0.5, (s.gbp / maxSvc) * 100)}%` }} /></span>
            <span className="val"><b>{gbp(s.gbp)}</b><small className="muted">{s.calls} call{s.calls === 1 ? '' : 's'}, {tokens(s.input)} in, {tokens(s.output)} out</small></span>
          </div>
        ))}
        {api.byDay.length > 1 && (
          <>
            <span className="imsm-label">By day</span>
            <div className="imsm-days">{api.byDay.map((d) => <i key={d.day} style={{ height: `${Math.max(3, (d.gbp / maxDay) * 100)}%` }} title={`${d.day}: ${gbp(d.gbp)}`} />)}</div>
            <div className="imsm-row" style={{ justifyContent: 'space-between' }}><small className="muted">{api.byDay[0].day}</small><small className="muted">{api.byDay[api.byDay.length - 1].day}</small></div>
          </>
        )}
      </section>

      <h2 className="imsm-h2">The costliest calls this month</h2>
      {!data.costliest?.length ? <p className="muted">None yet this month.</p> : (
        <div className="imsm-list">
          {data.costliest.map((c) => (
            <ItemCard key={c.id} icon="sparkle" tone="quiet" title={`${c.priced ? gbp(c.gbp) : 'No price'}: ${c.service}`}
              meta={`${new Date(c.timestamp.replace(' ', 'T') + 'Z').toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${c.model} · ${tokens(c.input)} in, ${tokens(c.output)} out${c.advice ? `. ${c.advice}` : ''}`} />
          ))}
        </div>
      )}

      <h2 className="imsm-h2">Subscriptions and services</h2>
      <div className="imsm-list">
        {paid.map((c) => (
          <ItemCard key={c.id} icon="calendar" title={c.name} meta={`${c.usedFor || ''}${c.usedFor ? '. ' : ''}${c.currency === 'USD' ? 'US$' : '£'}${c.amount} a ${c.period}`}
            tags={<><span className="tag">{gbp(c.monthlyGBP)} a month</span><span className={`tag ${c.estimated ? 'warn' : 'good'}`}>{c.estimated ? 'An estimate' : 'Checked against a bill'}</span></>}
            onClick={() => setSub({ ...c })}>
            {SERVICE_URLS[c.id] && <a className="ib sl" href={SERVICE_URLS[c.id]} target="_blank" rel="noreferrer" aria-label={`Open ${c.name}`}><Icon n="open" /></a>}
            <IconButton icon="del" label={`Remove ${c.name}`} onClick={() => removeSub(c.i)} />
          </ItemCard>
        ))}
      </div>
      <details className="imsm-fold">
        <summary><Icon n="check" size={20} /><span>Free services IMS relies on ({free.length})</span><Icon n="down" size={22} /></summary>
        <div className="imsm-list" style={{ padding: '0 12px 12px' }}>
          {free.map((c) => <ItemCard key={c.id} icon="check" tone="quiet" title={c.name} meta={c.usedFor}>{SERVICE_URLS[c.id] && <a className="ib sl" href={SERVICE_URLS[c.id]} target="_blank" rel="noreferrer" aria-label={`Open ${c.name}`}><Icon n="open" /></a>}</ItemCard>)}
        </div>
      </details>

      <details className="imsm-fold">
        <summary><Icon n="calc" size={20} /><span>Prices (US$ per million tokens)</span><Icon n="down" size={22} /></summary>
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="imsm-row"><TextField label="US$1 in £" type="number" inputMode="decimal" value={fx} onChange={(v) => { setFx(v); setPricesDirty(true); }} style={{ width: 140 }} /><span className="grow" /><Btn icon="check" disabled={!pricesDirty} onClick={() => put('/api/costs/prices', { prices, usdToGbp: fx }, 'Prices')}>Save the prices</Btn></div>
          {[...new Set([...api.byModel.map((m) => m.model), ...Object.keys(prices)])].map((model) => {
            const used = api.byModel.find((m) => m.model === model);
            const p = prices[model];
            const setP = (k, v) => { setPrices((x) => ({ ...x, [model]: { ...(x[model] || { input: 0, output: 0 }), [k]: v } })); setPricesDirty(true); };
            return (
              <div key={model} className="imsm-price">
                <span className="nm"><code>{model}</code>{!p && <span className="tag warn">No price</span>}<small className="muted">{used ? `${gbp(used.gbp)}, ${tokens(used.input + used.output)} tokens` : 'Not used in this period'}</small></span>
                <TextField label="Input" type="number" inputMode="decimal" value={p?.input ?? ''} onChange={(v) => setP('input', v)} />
                <TextField label="Output" type="number" inputMode="decimal" value={p?.output ?? ''} onChange={(v) => setP('output', v)} />
              </div>
            );
          })}
          <p className="muted" style={{ margin: 0 }}>Output includes thinking tokens. Live voice is billed mostly for audio, at higher rates than text.</p>
        </div>
      </details>
      <details className="imsm-fold">
        <summary><Icon n="open" size={20} /><span>Where to see these costs at Google</span><Icon n="down" size={22} /></summary>
        <div className="imsm-grid" style={{ padding: '0 16px 16px' }}>
          {PORTALS.map(([t, s, u]) => <a key={u} className="imsm-say sl" href={u} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><b>{t}</b><p className="muted">{s}</p></a>)}
        </div>
      </details>
      <p className="muted" style={{ fontSize: 13 }}>Gemini costs are measured: every call's real token counts (thinking included, and Live voice per turn) priced at the rates above{data.trackingSince ? `, since ${new Date(data.trackingSince).toLocaleDateString('en-GB')}` : ''}.</p>

      <Sheet open={Boolean(sub)} onClose={() => setSub(null)} title={sub?.i == null ? 'Add a subscription' : `Change ${sub?.name}`}
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setSub(null)}>Cancel</Btn><Btn icon="check" disabled={!sub?.name?.trim()} onClick={saveSub}>Save</Btn></div>}>
        {sub && (
          <div className="imsm-form">
            <TextField label="Name" value={sub.name} onChange={(v) => setSub({ ...sub, name: v })} autoFocus />
            <TextField label="What it's for" value={sub.usedFor || ''} onChange={(v) => setSub({ ...sub, usedFor: v })} />
            <div className="two">
              <TextField label="Price" type="number" inputMode="decimal" value={sub.amount} onChange={(v) => setSub({ ...sub, amount: v })} />
              <SelectField label="Currency" value={sub.currency} onChange={(v) => setSub({ ...sub, currency: v })} options={[['GBP', 'Pounds (£)'], ['USD', 'US dollars']]} />
              <SelectField label="Every" value={sub.period} onChange={(v) => setSub({ ...sub, period: v })} options={[['month', 'Month'], ['year', 'Year']]} />
            </div>
            <label className="imsm-row" style={{ cursor: 'pointer' }}><span className="imsm-switch"><input type="checkbox" checked={!sub.estimated} onChange={(e) => setSub({ ...sub, estimated: !e.target.checked })} /><i /></span>Checked against a real bill</label>
          </div>
        )}
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      <Fab label="Add a subscription" onClick={() => setSub({ i: null, id: `custom-${Date.now()}`, name: '', provider: '', category: 'Subscription', amount: 0, currency: 'GBP', period: 'month', usedFor: '', estimated: true })} />
    </>
  );
}

export default function Costs({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Costs" icon="calc" accent="green" theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} wide sub="What IMS costs to run: Gemini, the budget, subscriptions and services.">
      <Body />
    </ServicePage>
  );
}
