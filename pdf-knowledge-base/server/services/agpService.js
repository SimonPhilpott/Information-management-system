import db from '../db/database.js';
import { getDeviceChangeEvents } from './calendarService.js';

// Clinic-ready Ambulatory Glucose Profile (AGP) for a 14 or 90 day range, laid out the way diabetes
// teams expect (International Consensus on Time in Range, 2019; AGP report v5): CGM coverage, mean,
// GMI, CV, the five time-in-range bands, the 24-hour percentile profile (5/25/50/75/95), daily
// profiles, level 1 and level 2 hypo events, and overlays for Omnipod and CGM sensor changes (from
// Nightscout's Site/Sensor Change records and the calendar's change events). Built as HTML and printed
// to PDF with Playwright, like the main glucose report. Readings come from IMS's own Nightscout log.

const MGDL = 18.0182;
const r1 = (n) => Math.round(n * 10) / 10;
// consensus bands, mmol/L
const BANDS = { veryLow: 3.0, low: 3.9, high: 10.0, veryHigh: 13.9 };
const TZ = 'Europe/London';
const fmt = (ms, o) => new Date(ms).toLocaleString('en-GB', { timeZone: TZ, ...o });
const londonMinutes = (ms) => { const [h, m] = fmt(ms, { hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number); return (h % 24) * 60 + m; };
const londonDay = (ms) => fmt(ms, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function quantile(sorted, p) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p, lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
}

// Stretches below a threshold lasting 15 minutes or more; an event ends after 15 minutes back above it.
function hypoEvents(rs, below) {
  const out = [];
  let cur = null;
  for (const r of rs) {
    if (r.v < below) {
      if (cur && r.t - cur.last > 20 * 60000) { out.push(cur); cur = null; }
      if (!cur) cur = { start: r.t, last: r.t, nadir: r.v, aboveSince: null };
      cur.last = r.t; cur.nadir = Math.min(cur.nadir, r.v); cur.aboveSince = null;
    } else if (cur) {
      cur.aboveSince ??= r.t;
      if (r.t - cur.aboveSince >= 15 * 60000) { out.push(cur); cur = null; }
    }
  }
  if (cur) out.push(cur);
  return out.filter((e) => e.last - e.start >= 10 * 60000).map((e) => ({
    start: e.start, minutes: Math.round((e.last - e.start) / 60000) + 5, nadir: r1(e.nadir), overnight: londonMinutes(e.start) < 360,
  }));
}

async function deviceChanges(from, to) {
  const rows = db.prepare(`SELECT at, event FROM ns_treatments WHERE at >= ? AND at < ? AND event IN ('Site Change', 'Insulin Change', 'Pump Battery Change', 'Sensor Change', 'Sensor Start') ORDER BY at`).all(from, to);
  const list = rows.map((r) => ({ kind: /sensor/i.test(r.event) ? 'sensor' : 'pod', at: r.at, title: r.event, source: 'Nightscout' }));
  let calendarNote = null;
  try { list.push(...(await getDeviceChangeEvents(londonDay(from), londonDay(to))).filter((e) => e.at >= from && e.at < to).map((e) => ({ ...e, source: 'Calendar' }))); }
  catch (err) { calendarNote = `Calendar change events not included (${err.message}).`; }
  // one marker per kind within 12 hours (AAPS logs Site Change and Insulin Change together; the calendar repeats them)
  list.sort((a, b) => a.at - b.at);
  const merged = [];
  for (const c of list) {
    const near = merged.find((m) => m.kind === c.kind && Math.abs(m.at - c.at) < 12 * 3600000);
    if (near) { if (!near.sources.includes(c.source)) near.sources.push(c.source); } else merged.push({ ...c, sources: [c.source] });
  }
  return { changes: merged, calendarNote };
}

export async function buildAgp({ days = 14, end = null } = {}) {
  days = Number(days) === 90 ? 90 : 14;
  const endDay = /^\d{4}-\d{2}-\d{2}$/.test(String(end || '')) ? end : londonDay(Date.now());
  const to = Math.min(Date.now(), Date.parse(`${endDay}T23:59:59Z`) + 1000);
  const from = to - days * 86400000;
  // one reading per 5-minute slot - the log holds some 1-minute data, which would otherwise over-weight
  // those stretches and push coverage past 100%
  const seen = new Set();
  const rs = db.prepare('SELECT date AS t, sgv FROM ns_entries WHERE date >= ? AND date < ? ORDER BY date').all(from, to)
    .filter((e) => { const slot = Math.floor(e.t / 300000); if (seen.has(slot)) return false; seen.add(slot); return true; })
    .map((e) => ({ t: e.t, v: r1(e.sgv / MGDL) }));

  const n = rs.length;
  const expected = (to - from) / (5 * 60000);
  const vals = rs.map((r) => r.v);
  const mean = n ? vals.reduce((a, v) => a + v, 0) / n : null;
  const sd = n ? Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / n) : null;
  const pct = (f) => (n ? r1((vals.filter(f).length / n) * 100) : 0);
  const tir = {
    veryLow: pct((v) => v < BANDS.veryLow), low: pct((v) => v >= BANDS.veryLow && v < BANDS.low),
    inRange: pct((v) => v >= BANDS.low && v <= BANDS.high), high: pct((v) => v > BANDS.high && v <= BANDS.veryHigh), veryHigh: pct((v) => v > BANDS.veryHigh),
  };
  const daysWithData = new Set(rs.map((r) => londonDay(r.t))).size;
  const stats = n ? {
    readings: n, coveragePct: Math.min(100, Math.round((n / expected) * 100)), daysWithData,
    mean: r1(mean), meanMgdl: Math.round(mean * MGDL), sd: r1(sd), cvPct: r1((sd / mean) * 100), gmiPct: r1(3.31 + 0.02392 * mean * MGDL),
    gmiMmolMol: Math.round((3.31 + 0.02392 * mean * MGDL - 2.152) * 10.929), min: Math.min(...vals), max: Math.max(...vals),
  } : null;

  // 24-hour profile in 15-minute bins, each smoothed over the bins either side (as AGP does)
  const bins = Array.from({ length: 96 }, () => []);
  for (const r of rs) bins[Math.floor(londonMinutes(r.t) / 15)].push(r.v);
  const profile = bins.map((_, i) => {
    const pool = [-1, 0, 1].flatMap((k) => bins[(i + k + 96) % 96]).sort((a, b) => a - b);
    return pool.length >= 5 ? { min: i * 15, p5: r1(quantile(pool, 0.05)), p25: r1(quantile(pool, 0.25)), p50: r1(quantile(pool, 0.5)), p75: r1(quantile(pool, 0.75)), p95: r1(quantile(pool, 0.95)) } : { min: i * 15 };
  });

  const level1 = hypoEvents(rs, BANDS.low), level2 = hypoEvents(rs, BANDS.veryLow);
  const { changes, calendarNote } = await deviceChanges(from, to);

  // how the 24 hours after each change went, against the period as a whole
  const after = (kind) => {
    const cs = changes.filter((c) => c.kind === kind);
    const w = rs.filter((r) => cs.some((c) => r.t >= c.at && r.t < c.at + 24 * 3600000)).map((r) => r.v);
    return w.length >= 24 ? { count: cs.length, readings: w.length, mean: r1(w.reduce((a, v) => a + v, 0) / w.length), inRangePct: r1((w.filter((v) => v >= BANDS.low && v <= BANDS.high).length / w.length) * 100) } : { count: cs.length };
  };

  // the daily traces: the last 14 days of the range
  const dayList = [];
  for (let i = Math.min(days, 14) - 1; i >= 0; i--) {
    const d = londonDay(to - 1 - i * 86400000);
    dayList.push({ day: d, points: rs.filter((r) => londonDay(r.t) === d).map((r) => [londonMinutes(r.t), r.v]), changes: changes.filter((c) => londonDay(c.at) === d).map((c) => ({ kind: c.kind, min: londonMinutes(c.at) })) });
  }

  const flags = [];
  if (!stats) flags.push('No CGM readings in this period.');
  else {
    if (stats.coveragePct < 70) flags.push(`CGM data covers ${stats.coveragePct}% of the period - below the 70% the consensus recommends for a reliable AGP.`);
    if (daysWithData < days) flags.push(`Readings on ${daysWithData} of ${days} days (IMS's log starts ${fmt(rs[0].t, { day: 'numeric', month: 'short', year: 'numeric' })}).`);
  }
  if (calendarNote) flags.push(calendarNote);

  return {
    days, from, to, endDay, stats, tir, bands: BANDS, profile, dailies: dayList,
    hypos: { level1, level2, level1PerWeek: r1((level1.length / days) * 7), level2PerWeek: r1((level2.length / days) * 7) },
    changes, afterChange: { pod: after('pod'), sensor: after('sensor') }, flags,
    targets: { inRange: 70, low: 4, veryLow: 1, high: 25, veryHigh: 5, cv: 36 },
  };
}

// ---- HTML / PDF ----

function agpSvg(profile) {
  const W = 760, H = 260, L = 40, R = 12, T = 10, B = 26, maxV = 22;
  const x = (min) => L + (min / 1440) * (W - L - R);
  const y = (v) => T + (1 - Math.min(v, maxV) / maxV) * (H - T - B);
  const pts = profile.filter((p) => p.p50 != null);
  const area = (lo, hi) => (pts.length ? `${pts.map((p) => `${x(p.min + 7.5)},${y(p[hi])}`).join(' ')} ${[...pts].reverse().map((p) => `${x(p.min + 7.5)},${y(p[lo])}`).join(' ')}` : '');
  const line = (k) => pts.map((p) => `${x(p.min + 7.5)},${y(p[k])}`).join(' ');
  const grid = [0, 3, 6, 9, 12, 15, 18, 21, 24];
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">
    <rect x="${L}" y="${y(BANDS.high)}" width="${W - L - R}" height="${y(BANDS.low) - y(BANDS.high)}" fill="#dcfce7"/>
    ${[BANDS.veryLow, BANDS.low, BANDS.high, BANDS.veryHigh].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${v === BANDS.low || v === BANDS.high ? '#16a34a' : '#94a3b8'}" stroke-width="1" stroke-dasharray="${v === BANDS.low || v === BANDS.high ? '' : '3 3'}"/><text x="${L - 5}" y="${y(v) + 3}" font-size="9" text-anchor="end" fill="#475569">${v}</text>`).join('')}
    ${grid.map((h) => `<line x1="${x(h * 60)}" x2="${x(h * 60)}" y1="${T}" y2="${H - B}" stroke="#e2e8f0"/><text x="${x(h * 60)}" y="${H - 10}" font-size="9" text-anchor="middle" fill="#475569">${String(h % 24).padStart(2, '0')}:00</text>`).join('')}
    <polygon points="${area('p5', 'p95')}" fill="#93c5fd" fill-opacity="0.45"/>
    <polygon points="${area('p25', 'p75')}" fill="#2563eb" fill-opacity="0.45"/>
    <polyline points="${line('p50')}" fill="none" stroke="#1e3a8a" stroke-width="2.2"/>
    <text x="${W - R}" y="${T + 10}" font-size="9" text-anchor="end" fill="#475569">mmol/L · median, 25-75% and 5-95%</text>
  </svg>`;
}

function dailySvg(d) {
  const W = 240, H = 74, maxV = 16;
  const x = (min) => (min / 1440) * W, y = (v) => (1 - Math.min(v, maxV) / maxV) * H;
  const path = d.points.map(([m, v], i) => `${i && m - d.points[i - 1][0] > 20 ? 'M' : i ? 'L' : 'M'}${x(m).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="day">
    <rect x="0" y="${y(BANDS.high)}" width="${W}" height="${y(BANDS.low) - y(BANDS.high)}" fill="#dcfce7"/>
    <line x1="0" x2="${W}" y1="${y(BANDS.low)}" y2="${y(BANDS.low)}" stroke="#dc2626" stroke-width="0.6"/>
    ${d.changes.map((c) => `<line x1="${x(c.min)}" x2="${x(c.min)}" y1="0" y2="${H}" stroke="${c.kind === 'pod' ? '#7c3aed' : '#ea580c'}" stroke-width="1.4" stroke-dasharray="3 2"/><text x="${x(c.min) + 2}" y="9" font-size="8" fill="${c.kind === 'pod' ? '#7c3aed' : '#ea580c'}">${c.kind === 'pod' ? 'Pod' : 'Sensor'}</text>`).join('')}
    <path d="${path}" fill="none" stroke="#1e3a8a" stroke-width="1.1"/>
  </svg>`;
}

export function buildAgpHtml(a, { patient = 'Simon Philpott' } = {}) {
  const s = a.stats || {};
  const t = a.tir, g = a.targets;
  const range = `${fmt(a.from, { day: 'numeric', month: 'short', year: 'numeric' })} - ${fmt(a.to - 1, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const bar = [['veryHigh', '#f97316', 'Very high', `>${BANDS.veryHigh}`, `<${g.veryHigh}%`], ['high', '#fbbf24', 'High', `${BANDS.high}-${BANDS.veryHigh}`, `<${g.high}%`],
    ['inRange', '#16a34a', 'In range', `${BANDS.low}-${BANDS.high}`, `>${g.inRange}%`], ['low', '#ef4444', 'Low', `${BANDS.veryLow}-3.8`, `<${g.low}%`], ['veryLow', '#991b1b', 'Very low', `<${BANDS.veryLow}`, `<${g.veryLow}%`]];
  const ok = (k) => (k === 'inRange' ? t[k] >= g.inRange : t[k] < g[k]);
  const hypoRows = [...a.hypos.level2.map((h) => ({ ...h, level: 2 })), ...a.hypos.level1.filter((h) => !a.hypos.level2.some((x) => Math.abs(x.start - h.start) < 3600000)).map((h) => ({ ...h, level: 1 }))]
    .sort((x, y) => y.start - x.start).slice(0, 25);
  const ac = a.afterChange;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; } body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 11px; margin: 0; }
    h1 { font-size: 18px; margin: 0; } h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; margin: 14px 0 6px; color: #1e3a8a; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #1e3a8a; padding-bottom: 6px; }
    .muted { color: #475569; } .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    table { border-collapse: collapse; width: 100%; } td, th { padding: 3px 5px; border-bottom: 1px solid #e2e8f0; text-align: left; } th { font-size: 10px; color: #475569; }
    .tir { display: flex; gap: 10px; align-items: stretch; } .stack { width: 46px; display: flex; flex-direction: column; border: 1px solid #94a3b8; }
    .ok { color: #15803d; font-weight: bold; } .bad { color: #b91c1c; font-weight: bold; } .chart { width: 100%; } .flag { background: #fef3c7; border: 1px solid #f59e0b; padding: 5px 8px; margin: 6px 0; border-radius: 4px; }
    .days { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; } .day { width: 100%; height: 56px; border: 1px solid #e2e8f0; } .dl { font-size: 9px; color: #475569; }
    .page { page-break-after: always; } .legend span { display: inline-block; margin-right: 12px; }
  </style></head><body>
  <div class="page">
    <div class="head"><div><h1>Ambulatory Glucose Profile (AGP)</h1><div class="muted">${esc(patient)} · Type 1 diabetes · Omnipod with closed loop (AndroidAPS) · CGM via Nightscout</div></div>
      <div style="text-align:right"><b>${a.days}-day report</b><br>${range}<br><span class="muted">Generated ${fmt(Date.now(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div></div>
    ${a.flags.map((f) => `<div class="flag">${esc(f)}</div>`).join('')}
    <div class="grid">
      <div><h2>Glucose statistics and targets</h2><table>
        <tr><td>CGM active</td><td><b>${s.coveragePct ?? '-'}%</b> <span class="muted">(${s.readings ?? 0} readings, ${s.daysWithData ?? 0} days)</span></td></tr>
        <tr><td>Mean glucose</td><td><b>${s.mean ?? '-'} mmol/L</b> <span class="muted">(${s.meanMgdl ?? '-'} mg/dL)</span></td></tr>
        <tr><td>Glucose Management Indicator (GMI)</td><td><b>${s.gmiPct ?? '-'}%</b> <span class="muted">(${s.gmiMmolMol ?? '-'} mmol/mol)</span></td></tr>
        <tr><td>Glucose variability (CV)</td><td><b class="${s.cvPct <= g.cv ? 'ok' : 'bad'}">${s.cvPct ?? '-'}%</b> <span class="muted">target ≤${g.cv}% · SD ${s.sd ?? '-'} mmol/L</span></td></tr>
        <tr><td>Lowest / highest</td><td>${s.min ?? '-'} / ${s.max ?? '-'} mmol/L</td></tr>
        <tr><td>Hypo events (≥15 min)</td><td>Level 1 (&lt;3.9): <b>${a.hypos.level1.length}</b> (${a.hypos.level1PerWeek}/week) · Level 2 (&lt;3.0): <b>${a.hypos.level2.length}</b> (${a.hypos.level2PerWeek}/week)</td></tr>
        <tr><td>Pod / sensor changes</td><td>${a.changes.filter((c) => c.kind === 'pod').length} pod · ${a.changes.filter((c) => c.kind === 'sensor').length} sensor</td></tr>
      </table></div>
      <div><h2>Time in ranges</h2><div class="tir">
        <div class="stack">${bar.map(([k, col]) => `<div style="background:${col};height:${Math.max(t[k], 0.8) * 1.6}px"></div>`).join('')}</div>
        <table>${bar.map(([k, col, name, rangeTxt, target]) => `<tr><td><span style="display:inline-block;width:9px;height:9px;background:${col}"></span> ${name} <span class="muted">${rangeTxt} mmol/L</span></td><td class="${ok(k) ? 'ok' : 'bad'}">${t[k]}%</td><td class="muted">${target}</td></tr>`).join('')}
        <tr><td colspan="3" class="muted">Below range total ${r1(t.low + t.veryLow)}% (target &lt;4%) · above range total ${r1(t.high + t.veryHigh)}% (target &lt;25%)</td></tr></table>
      </div></div>
    </div>
    <h2>Ambulatory glucose profile - all days overlaid as one 24-hour day</h2>
    ${agpSvg(a.profile)}
    <h2>First 24 hours after a change</h2>
    <table><tr><th></th><th>Changes</th><th>Mean in first 24 h</th><th>Time in range in first 24 h</th><th>Whole period</th></tr>
      <tr><td>Omnipod change</td><td>${ac.pod.count}</td><td>${ac.pod.mean ?? '-'} mmol/L</td><td>${ac.pod.inRangePct ?? '-'}%</td><td rowspan="2">${s.mean ?? '-'} mmol/L · ${t.inRange}% in range</td></tr>
      <tr><td>CGM sensor change</td><td>${ac.sensor.count}</td><td>${ac.sensor.mean ?? '-'} mmol/L</td><td>${ac.sensor.inRangePct ?? '-'}%</td></tr></table>
  </div>
  <div>
    <h2>Daily glucose profiles - ${a.dailies.length === a.days ? 'each day' : `last ${a.dailies.length} days`}</h2>
    <div class="legend muted"><span><b style="color:#7c3aed">- - Pod</b> Omnipod change</span><span><b style="color:#ea580c">- - Sensor</b> CGM sensor change</span><span>Green band 3.9-10.0 mmol/L, red line 3.9</span></div>
    <div class="days">${a.dailies.map((d) => `<div><div class="dl">${fmt(Date.parse(`${d.day}T12:00:00Z`), { weekday: 'short', day: 'numeric', month: 'short' })}</div>${dailySvg(d)}</div>`).join('')}</div>
    <h2>Hypo events (most recent ${hypoRows.length})</h2>
    ${hypoRows.length ? `<table><tr><th>When</th><th>Level</th><th>Duration</th><th>Lowest</th><th>Overnight</th></tr>${hypoRows.map((h) => `<tr><td>${fmt(h.start, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td><td>${h.level === 2 ? '<b class="bad">Level 2 (&lt;3.0)</b>' : 'Level 1 (&lt;3.9)'}</td><td>${h.minutes} min</td><td>${h.nadir} mmol/L</td><td>${h.overnight ? 'Yes' : ''}</td></tr>`).join('')}</table>` : '<p class="muted">No hypo events lasting 15 minutes or more.</p>'}
    <h2>Pod and sensor changes</h2>
    ${a.changes.length ? `<table><tr><th>When</th><th>Change</th><th>Recorded in</th></tr>${a.changes.map((c) => `<tr><td>${fmt(c.at, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td><td>${c.kind === 'pod' ? 'Omnipod' : 'CGM sensor'}</td><td class="muted">${c.sources.join(', ')}</td></tr>`).join('')}</table>` : '<p class="muted">No pod or sensor changes recorded in this period.</p>'}
    <p class="muted" style="margin-top:12px">Targets follow the International Consensus on Time in Range (Battelino et al., Diabetes Care 2019). GMI = 3.31 + 0.02392 × mean glucose (mg/dL). Hypo events are 15 minutes or more below the threshold. Generated by IMS from CGM data logged via Nightscout; for discussion with the diabetes team.</p>
  </div>
  </body></html>`;
}

export async function generateAgpPdf({ days = 14, end = null } = {}) {
  const agp = await buildAgp({ days, end });
  const html = buildAgpHtml(agp);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
    return { pdf, filename: `AGP-Report-${agp.days}days-to-${agp.endDay}.pdf` };
  } finally {
    await browser.close();
  }
}
