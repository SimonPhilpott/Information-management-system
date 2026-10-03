import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RunPlanChart from './RunPlanChart';
import RetroChart from './RetroChart';
import { dist, paceText } from '../../../utils/units';

// "Print / PDF" for the Run Planner: one printable page set with the route, the run plan (if one is open)
// and the retrospective of the latest run on the route (or the run being looked at) - but only one that has
// already been made; printing never creates a new one. It opens in a new window and brings up the print
// dialogue, where "Save as PDF" gives the file. Charts are drawn in the light style so they print cleanly.

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const get = async (url) => { try { const r = await fetch(url, { credentials: 'same-origin' }); const j = await r.json(); return j.success === false ? null : j; } catch { return null; } };
const hm = (min) => (min == null ? '-' : min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min` : `${Math.round(min)} min`);
const today = () => new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// the route's shape as a small outline (no map tiles, so it always prints)
function routeOutline(path) {
  if (!path?.length) return '';
  const lat0 = path.reduce((n, p) => n + p[0], 0) / path.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = path.map((p) => p[1] * k), ys = path.map((p) => -p[0]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const S = 180, pad = 8;
  const P = (i) => `${(pad + ((xs[i] - minX) / span) * (S - 2 * pad)).toFixed(1)},${(pad + ((ys[i] - minY) / span) * (S - 2 * pad)).toFixed(1)}`;
  const step = Math.max(1, Math.floor(path.length / 600));
  const pts = []; for (let i = 0; i < path.length; i += step) pts.push(P(i));
  return `<svg viewBox="0 0 ${S} ${S}" width="170" height="170"><polyline points="${pts.join(' ')}" fill="none" stroke="#ea580c" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${P(0).split(',')[0]}" cy="${P(0).split(',')[1]}" r="4.5" fill="#16a34a"/><circle cx="${P(path.length - 1).split(',')[0]}" cy="${P(path.length - 1).split(',')[1]}" r="3.5" fill="#dc2626"/></svg>`;
}

const kpis = (items) => `<div class="kpis">${items.map(([k, v, sub]) => `<div class="kpi"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</div>`).join('')}</div>`;
const list = (items) => (items?.length ? `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="muted">Nothing here.</p>');

function planSection(plan, units) {
  const p = plan.plan;
  const stopsRows = p.stops.map((s) => `<tr><td>${s.minute === 0 ? 'Start' : `${s.minute} min`}</td><td>${s.km != null ? `${dist(s.km, units, 1)} ${units}` : ''}</td><td><b>${s.grams} g</b></td><td>${s.fluidMl || 0} ml</td><td>${esc(s.note || '')}</td></tr>`).join('');
  const waterOnly = (plan.drinks || []).filter((d) => !d.withCarbs);
  const pace = plan.inputs?.averagePaceMinPerKm;
  return `
  <section>
    <h2>Run plan</h2>
    ${kpis([
      ['Time', hm(plan.run.durationMin), pace ? `${paceText(pace, units)} per ${units}` : ''],
      ['Start glucose', `${plan.inputs.startBg}`, `insulin on board ${plan.inputs.iob} U`],
      ['Carbs', `${p.totalCarbs} g`, `${p.carbsPerHour} g an hour`],
      ['Lowest predicted', `${p.predicted.minDuring}`, `finish ${p.predicted.endBg}`],
      ['After the run', p.postCarbs ? `${p.postCarbs} g` : 'none', `lowest after ${p.predicted.minAfter}`],
    ])}
    ${plan.learning?.applied?.length ? `<p class="learned"><b>Learned from your runs:</b> ${plan.learning.applied.map((x) => esc(x.text)).join(' · ')}</p>` : ''}
    <div class="chart">${renderToStaticMarkup(<RunPlanChart plan={plan} isDark={false} units={units} />)}</div>
    <h3>Carb stops</h3>
    <table><thead><tr><th>When</th><th>Where</th><th>Carbs</th><th>Water</th><th></th></tr></thead><tbody>${stopsRows || '<tr><td colspan="5">No carbs needed during the run.</td></tr>'}</tbody></table>
    ${waterOnly.length ? `<p>Water only: ${waterOnly.map((d) => `${d.ml} ml at ${d.minute} min`).join(', ')}.</p>` : ''}
    <div class="two">
      <div><h3>Before you go</h3><ul>
        ${p.toReachStartTarget ? `<li>About ${p.toReachStartTarget} g to reach your ${plan.settings.startTarget} start target.</li>` : ''}
        ${plan.preRun?.tempTarget ? `<li>${esc(plan.preRun.tempTarget)}</li>` : ''}
        ${plan.preRun?.iobNote ? `<li>${esc(plan.preRun.iobNote)}</li>` : ''}
        ${plan.preRun?.drinkText ? `<li>${esc(plan.preRun.drinkText)}</li>` : ''}
      </ul></div>
      <div><h3>Hydration</h3><p>${esc(plan.hydration?.guidance || '')}</p>${plan.recovery?.text ? `<h3>Recovery</h3><p>${esc(plan.recovery.text)}</p>` : ''}</div>
    </div>
    ${plan.warnings?.length ? `<h3>Watch out</h3>${list(plan.warnings)}` : ''}
    ${(plan.insulin || []).filter((x) => x.estimate).length ? `<h3>After the run</h3><ul>${plan.insulin.filter((x) => x.estimate).map((x) => `<li class="estimate"><b>${esc(x.title)} (estimate - read the caveat).</b> ${esc(x.text)}</li>`).join('')}</ul>` : ''}
  </section>`;
}

function retroSection(retro, units) {
  const a = retro.analysis;
  if (!a?.available) return '';
  const fmtPace = (pc) => (pc ? `${Math.floor(pc)}:${String(Math.round((pc % 1) * 60)).padStart(2, '0')}` : '-');
  const eff = retro.session?.effort;
  const rows = (retro.intakes || []).map((it) => `<tr><td>${it.planned_minute != null ? `${it.planned_minute} min` : 'extra'}</td><td>${it.planned_g || it.grams || 0} g${it.planned_ml || it.ml ? ` + ${it.planned_ml || it.ml} ml` : ''}</td><td>${it.action ? esc(it.action) : 'not recorded'}</td><td>${it.action === 'taken' && it.minute != null ? `${Math.round(it.minute)} min` : ''}</td></tr>`).join('');
  return `
  <section class="${retro.planPrinted ? 'newpage' : ''}">
    <h2>Retrospective: ${esc(a.run.name)}, ${esc(a.run.day)}</h2>
    <p class="muted">${retro.session?.kind === 'live' ? 'Sent from the planner - compared with the plan you ran with.' : 'Not sent from the planner - carbs from the carb log.'}${a.profile ? ` Kind of run: ${esc(a.profile.label)}.` : ''}</p>
    ${kpis([
      ['Distance', `${dist(a.run.km, units, 1)} ${units}`, `${a.run.minutes} min`],
      ['Pace', fmtPace(a.run.pace), a.run.plannedPace ? `planned ${fmtPace(a.run.plannedPace)} per km` : 'per km'],
      ['Start', a.stats.start ?? '-', 'mmol/L'],
      ['Lowest', a.stats.lowest ?? '-', a.stats.lowestAt != null ? `at ${a.stats.lowestAt} min` : ''],
      ['After (2 h)', a.stats.postLowest ?? '-', 'lowest'],
      ['Felt', eff ? `${eff}/10` : '-', a.quality === 'good' ? `uptake ${a.fit.effective >= 1 ? '+' : ''}${Math.round((a.fit.effective - 1) * 100)}% vs model` : 'model fit not used'],
    ])}
    <div class="chart">${renderToStaticMarkup(<RetroChart a={a} notes={retro.notes || []} isDark={false} units={units} staticRender />)}</div>
    <div class="three">
      <div><h3 class="good">What went well</h3>${list(a.findings.good)}</div>
      <div><h3 class="warn">What to watch</h3>${list(a.findings.watch)}</div>
      <div><h3 class="learn">What it teaches</h3>${list(a.findings.learn)}</div>
    </div>
    ${rows ? `<h3>What you took</h3><table><thead><tr><th>Planned</th><th>Amount</th><th>What happened</th><th>When</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
  </section>`;
}

// What your runs have taught that applies here: lessons for this route, this kind of run and all runs - in use
// in your plans and still waiting for your decision - plus how many runs of this kind there are so far.
function learningSection(learning, routeId, profileKey, profileLabel) {
  if (!learning) return '';
  const fits = (l) => (l.scope === 'route' && String(l.scope_key) === String(routeId)) || (l.scope === 'profile' && l.scope_key === profileKey) || l.scope === 'general';
  const where = (l) => (l.scope === 'route' ? 'This route' : l.scope === 'profile' ? 'This kind of run' : 'All runs');
  const inUse = (learning.accepted || []).filter(fits);
  const waiting = (learning.suggestions || []).filter(fits);
  const kind = (learning.profiles || []).find((p) => p.key === profileKey);
  const row = (l) => `<li><b>${esc(where(l))}</b> (from ${l.runs} runs): ${esc(l.text)}</li>`;
  return `
  <section>
    <h2>Run learning</h2>
    ${kind ? `<p class="muted">${esc(profileLabel || kind.label)} runs so far: ${kind.runs}, ${kind.good} clear enough to learn from${kind.medianEffective != null ? ` - glucose use ${kind.medianEffective >= 1 ? '+' : ''}${Math.round((kind.medianEffective - 1) * 100)}% against the model` : ''}.</p>` : ''}
    <div class="two">
      <div><h3 class="good">In use in your plans</h3>${inUse.length ? `<ul>${inUse.map(row).join('')}</ul>` : '<p class="muted">None yet for this route or kind of run - plans use the standard model.</p>'}</div>
      <div><h3 class="learn">Suggested - waiting for your decision</h3>${waiting.length ? `<ul>${waiting.map(row).join('')}</ul>` : '<p class="muted">Nothing waiting.</p>'}</div>
    </div>
  </section>`;
}

/**
 * @param {{plan?: object, routeId?: number|null, retro?: object|null, units?: string}} o
 * retro: a retrospective already open; otherwise the latest made for the route is included, if any.
 */
export async function printRunReport({ plan = null, routeId = null, retro = null, units = 'km' } = {}) {
  // opened straight away, inside the click, so the browser doesn't block it as a pop-up
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups for IMS to print the report.'); return; }
  w.document.write('<p style="font-family:sans-serif;padding:24px">Preparing your run report...</p>');
  const rid = routeId || plan?.inputs?.routeId || null;
  const route = rid ? (await get(`/api/planner/routes/${rid}`))?.route : null;
  let r = retro;
  if (!r && rid) { const got = await get(`/api/planner/retro/latest?routeId=${rid}`); r = got && !got.none ? got : null; }
  const learning = await get('/api/planner/learning');
  const profile = plan?.profile || r?.analysis?.profile || null;
  const title = route?.name || plan?.inputs?.routeName || r?.analysis?.run?.name || 'Run';
  const komoot = route?.source === 'komoot' && route.externalId ? `https://www.komoot.com/tour/${route.externalId}` : null;
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join('\n');

  const routeHtml = route ? `
  <section class="route">
    <div>${routeOutline(route.path)}</div>
    <div>
      <h2>Route</h2>
      ${kpis([
        ['Distance', `${dist(route.distanceKm, units, 2)} ${units}`, ''],
        ['Climb', `${Math.round(route.gainM || 0)} m`, route.distanceKm ? `${Math.round((route.gainM || 0) / route.distanceKm)} m per km` : ''],
        ['Height', `${Math.round(route.minEle ?? 0)}-${Math.round(route.maxEle ?? 0)} m`, ''],
      ])}
      ${route.description ? `<p>${esc(route.description)}</p>` : ''}
      ${komoot ? `<p class="muted">Komoot: ${esc(komoot)}</p>` : ''}
      <p class="muted">Green dot: start · red dot: finish</p>
    </div>
  </section>` : '';

  const body = `
  <header><div><h1>${esc(title)}</h1><div class="muted">Run report for Simon Philpott · printed ${esc(today())}</div></div><div class="brand">IMS Run Planner</div></header>
  ${routeHtml}
  ${plan?.plan ? planSection(plan, units) : ''}
  ${r ? retroSection({ ...r, planPrinted: Boolean(plan?.plan) }, units) : (rid ? '<section><h2>Retrospective</h2><p class="muted">No retrospective has been made for a run on this route yet.</p></section>' : '')}
  ${learningSection(learning, rid, profile?.key, profile?.label)}
  <footer>Estimates from the IMS planner model and your own glucose data - pattern-spotting. IMS never suggests insulin doses.</footer>`;

  // non-ASCII as entities (°, ·, →), so they print right whatever encoding the new window assumes
  const ascii = (html) => html.replace(/[^\x00-\x7F]/gu, (c) => `&#${c.codePointAt(0)};`);
  w.document.open();
  w.document.write(ascii(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${esc(title)} - run report</title>${styles}
  <style>
    html, body { background: #fff !important; color: #1c1917; height: auto !important; min-height: 0 !important; overflow: visible !important; }
    #root { display: none; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; font-size: 11px; margin: 0; padding: 18px 22px; }
    header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #ea580c; padding-bottom: 8px; margin-bottom: 12px; }
    h1 { font-size: 20px; font-weight: 900; margin: 0; } h2 { font-size: 14px; font-weight: 900; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .04em; }
    h3 { font-size: 11px; font-weight: 800; margin: 10px 0 4px; text-transform: uppercase; letter-spacing: .04em; }
    h3.good { color: #15803d } h3.warn { color: #b45309 } h3.learn { color: #0369a1 }
    .brand { font-weight: 900; color: #ea580c; } .muted { color: #6b6158; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 6px; margin: 6px 0; }
    .kpi { border: 1px solid #e7e0d6; border-radius: 8px; padding: 5px 8px; } .kpi .k { font-size: 8px; font-weight: 800; text-transform: uppercase; color: #6b6158; } .kpi .v { font-size: 15px; font-weight: 900; } .kpi .s { font-size: 9px; color: #6b6158; }
    .route { display: flex; gap: 16px; align-items: flex-start; } .route > div:last-child { flex: 1; }
    .chart { border: 1px solid #e7e0d6; border-radius: 10px; padding: 6px; margin: 8px 0; break-inside: avoid; }
    .chart svg { min-width: 0 !important; width: 100%; height: auto; }
    table { width: 100%; border-collapse: collapse; margin: 4px 0; } th, td { text-align: left; padding: 3px 6px; border-bottom: 1px solid #eee7dd; vertical-align: top; } th { font-size: 9px; text-transform: uppercase; color: #6b6158; }
    ul { margin: 2px 0 2px 16px; padding: 0; } li { margin: 2px 0; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } .three { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
    li.estimate { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; padding: 4px 6px; list-style: none; margin-left: -16px; }
    .learned { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 5px 8px; }
    section { break-inside: auto; } .newpage { break-before: page; }
    footer { margin-top: 16px; border-top: 1px solid #e7e0d6; padding-top: 6px; font-size: 9px; color: #6b6158; }
    @page { size: A4; margin: 12mm; }
    @media print { body { padding: 0; } }
  </style></head><body>${body}</body></html>`));
  w.document.close();
  // give the stylesheet a moment, then the print dialogue (Save as PDF)
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* the page is still there to print */ } }, 700);
}
