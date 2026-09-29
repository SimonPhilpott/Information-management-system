import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { getSummary, getGlucoseThresholds, getSavedInsight, analyse } from './glucoseHubService.js';
import { getProfile, getSavedEvaluation, evaluateProfile } from './glucoseInsightService.js';
import { getAuthenticatedClient } from './driveService.js';
import db from '../db/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const r1 = (x) => Math.round(Number(x) * 10) / 10;

/**
 * Builds clean HTML for clinical A4 PDF export
 */
export function buildGlucoseReportHtml({ days = 14, summary, profile, evaluation, insight, thresholds }) {
  const s = summary.stats || {};
  const th = thresholds || summary.thresholds || getGlucoseThresholds();
  const pLow = th.personalLow || 4.5;
  const pHigh = th.personalHigh || th.tightHigh || 7.8;
  const prof = profile || getProfile();

  const generatedDate = new Date().toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const fromDate = new Date(summary.from).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' });
  const toDate = new Date(summary.to).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' });

  // Compute 24h Profile SVG Points
  const W = 800, H = 220, L = 38, R = 15, T = 15, B = 28, maxV = 16;
  const pts = (summary.profile || []).filter((p) => p.median != null);
  const x = (h) => L + ((h + 0.5) / 24) * (W - L - R);
  const y = (v) => T + (1 - Math.min(v, maxV) / maxV) * (H - T - B);
  const band = (lo, hi) => pts.map((p) => `${x(p.hour)},${y(p[hi])}`).join(' ') + ' ' + [...pts].reverse().map((p) => `${x(p.hour)},${y(p[lo])}`).join(' ');

  let profileSvg = '';
  if (pts.length >= 4) {
    profileSvg = `
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">
        <!-- Medical in-range outer band -->
        <rect x="${L}" y="${y(th.high)}" width="${W - L - R}" height="${Math.max(0, y(th.low) - y(th.high))}" fill="rgba(52,211,153,0.12)" />
        <!-- Personal target inner band -->
        <rect x="${L}" y="${y(pHigh)}" width="${W - L - R}" height="${Math.max(0, y(pLow) - y(pHigh))}" fill="rgba(56,189,248,0.22)" />

        <!-- Threshold Reference Lines -->
        ${[th.low, pLow, pHigh, th.high].map((v) => `
          <g>
            <line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(0,0,0,0.12)" stroke-dasharray="3 3" />
            <text x="${L - 6}" y="${y(v) + 3}" font-size="9" text-anchor="end" fill="${v === pLow || v === pHigh ? '#0284c7' : '#64748b'}" font-weight="${v === pLow || v === pHigh ? 'bold' : 'normal'}">${v}</text>
          </g>
        `).join('')}

        <!-- Shaded Percentiles -->
        <polygon points="${band('p10', 'p90')}" fill="rgba(96,165,250,0.25)" />
        <polygon points="${band('p25', 'p75')}" fill="rgba(96,165,250,0.45)" />
        <polyline points="${pts.map((p) => `${x(p.hour)},${y(p.median)}`).join(' ')}" fill="none" stroke="#2563eb" stroke-width="2.5" />

        <!-- X Axis Ticks -->
        ${[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => `
          <text x="${L + (h / 24) * (W - L - R)}" y="${H - 8}" font-size="9" text-anchor="middle" fill="#64748b">${String(h % 24).padStart(2, '0')}:00</text>
        `).join('')}
      </svg>
    `;
  }

  // Segmented TIR bar items
  const personalTargetPct = s.personalTargetPct ?? s.tightPct ?? (s.inRangePct || 0);
  const lowSidePct = s.lowSidePct != null ? s.lowSidePct : 0;
  const highSidePct = s.highSidePct != null ? s.highSidePct : Math.max(0, Math.round(((s.inRangePct || 0) - personalTargetPct - lowSidePct) * 10) / 10);

  const tirSegments = [
    { label: `Very low <${th.veryLow}`, pct: s.veryLowPct || 0, color: '#ef4444' },
    { label: `Low ${th.veryLow}-${th.low}`, pct: s.lowPct || 0, color: '#f87171' },
    { label: `Low in-range ${th.low}-${pLow}`, pct: lowSidePct, color: '#7dd3fc' },
    { label: `Personal Target ${pLow}-${pHigh}`, pct: personalTargetPct, color: '#0284c7', bold: true },
    { label: `High in-range ${pHigh}-${th.high}`, pct: highSidePct, color: '#86efac' },
    { label: `High ${th.high}-${th.veryHigh}`, pct: s.highPct || 0, color: '#fbbf24' },
    { label: `Very high >${th.veryHigh}`, pct: s.veryHighPct || 0, color: '#f97316' },
  ];

  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <title>IMS Glucose Report - ${days} Days</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 14mm 14mm 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      line-height: 1.45;
      font-size: 10pt;
      margin: 0;
      padding: 0;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header {
      border-bottom: 2px solid #0284c7;
      padding-bottom: 8px;
      margin-bottom: 12px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .title {
      font-size: 17pt;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: -0.02em;
      margin: 0;
    }
    .subtitle {
      font-size: 9pt;
      color: #64748b;
      margin-top: 2px;
    }
    .meta-right {
      text-align: right;
      font-size: 8.5pt;
      color: #64748b;
    }
    .meta-right b {
      color: #0f172a;
    }
    .section-title {
      font-size: 10pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #0f172a;
      margin: 12px 0 6px 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .section-title::before {
      content: "";
      display: inline-block;
      width: 4px;
      height: 12px;
      background: #0284c7;
      border-radius: 2px;
    }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-bottom: 10px;
    }
    .card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 7px 9px;
      background: #f8fafc;
    }
    .card-label {
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.03em;
    }
    .card-value {
      font-size: 13pt;
      font-weight: 900;
      color: #0f172a;
      margin-top: 1px;
    }
    .card-sub {
      font-size: 7.5pt;
      color: #64748b;
    }
    .tir-bar {
      height: 18px;
      border-radius: 6px;
      display: flex;
      overflow: hidden;
      border: 1px solid #cbd5e1;
      margin-bottom: 6px;
    }
    .tir-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 7.5pt;
      margin-bottom: 8px;
    }
    .tir-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .tir-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
    }
    .graph-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 8px;
      background: #f8fafc;
      margin-bottom: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8pt;
      margin-bottom: 8px;
    }
    th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      text-align: left;
      padding: 4px 6px;
      border-bottom: 1px solid #cbd5e1;
    }
    td {
      padding: 4px 6px;
      border-bottom: 1px solid #f1f5f9;
      color: #334155;
    }
    .text-box {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 8px 10px;
      background: #f8fafc;
      font-size: 8.5pt;
      line-height: 1.45;
      margin-bottom: 8px;
      page-break-inside: avoid;
    }
    .text-box p {
      margin: 0 0 5px 0;
    }
    .text-box p:last-child {
      margin-bottom: 0;
    }
    .footer {
      margin-top: 14px;
      padding-top: 6px;
      border-top: 1px solid #e2e8f0;
      font-size: 7.5pt;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div>
      <h1 class="title">Clinical Blood Glucose & Profile Report</h1>
      <div class="subtitle">Information Management System (IMS) • Telemetry & Ambulatory Glucose Profile</div>
    </div>
    <div class="meta-right">
      <div>Period: <b>${days} Days (${fromDate} – ${toDate})</b></div>
      <div>Generated: <b>${generatedDate}</b></div>
      <div>Profile: <b>${esc(prof.profileName || '20u standard day')}</b></div>
    </div>
  </div>

  <!-- Key Telemetry Cards -->
  <div class="cards-grid">
    <div class="card">
      <div class="card-label">Personal Target (${pLow}-${pHigh})</div>
      <div class="card-value" style="color:#0284c7;">${s.personalTargetPct ?? s.tightPct ?? '--'}%</div>
      <div class="card-sub">Athlete's tight daytime target</div>
    </div>
    <div class="card">
      <div class="card-label">Medical In-Range (${th.low}-${th.high})</div>
      <div class="card-value" style="color:#16a34a;">${s.inRangePct ?? '--'}%</div>
      <div class="card-sub">Consensus Goal: &gt; 70.0%</div>
    </div>
    <div class="card">
      <div class="card-label">Average Glucose</div>
      <div class="card-value">${s.mean ?? '--'} <span style="font-size:9pt;font-weight:normal;">mmol/L</span></div>
      <div class="card-sub">Est. HbA1c (GMI): <b>${s.gmiPct ?? '--'}%</b></div>
    </div>
    <div class="card">
      <div class="card-label">Variability (CV)</div>
      <div class="card-value" style="color:${(s.cvPct || 0) <= 36 ? '#16a34a' : '#d97706'};">${s.cvPct ?? '--'}%</div>
      <div class="card-sub">Consensus Goal: &le; 36%</div>
    </div>
  </div>

  <div class="cards-grid">
    <div class="card">
      <div class="card-label">Hypos (Below ${th.low})</div>
      <div class="card-value" style="color:${(s.lowPct || 0) <= 4 ? '#16a34a' : '#dc2626'};">${s.lowPct ?? '--'}%</div>
      <div class="card-sub">Very Low (&lt;${th.veryLow}): <b>${s.veryLowPct ?? '--'}%</b></div>
    </div>
    <div class="card">
      <div class="card-label">Hypers (Above ${th.high})</div>
      <div class="card-value" style="color:#d97706;">${s.highPct ?? '--'}%</div>
      <div class="card-sub">Very High (&gt;${th.veryHigh}): <b>${s.veryHighPct ?? '--'}%</b></div>
    </div>
    <div class="card">
      <div class="card-label">Sensor Coverage</div>
      <div class="card-value">${s.coveragePct ?? '--'}%</div>
      <div class="card-sub">${s.readings ?? 0} readings analysed</div>
    </div>
    <div class="card">
      <div class="card-label">Insulin & Carbs (Total)</div>
      <div class="card-value">${summary.totals?.bolusUnits ?? 0} <span style="font-size:8.5pt;font-weight:normal;">U bolus</span></div>
      <div class="card-sub">${summary.totals?.carbsG ?? 0} g carbs logged</div>
    </div>
  </div>

  <!-- Time in Range Breakdown Bar -->
  <div class="section-title">Time in Range & Target Bands Breakdown</div>
  <div class="tir-bar">
    ${tirSegments.map((seg) => seg.pct > 0 ? `
      <div style="width:${seg.pct}%;background:${seg.color};" title="${seg.label}: ${seg.pct}%"></div>
    ` : '').join('')}
  </div>
  <div class="tir-legend">
    ${tirSegments.map((seg) => `
      <div class="tir-item" style="${seg.bold ? 'font-weight:bold;color:#0284c7;' : ''}">
        <span class="tir-dot" style="background:${seg.color};"></span>
        <span>${seg.label}: <b>${seg.pct}%</b></span>
      </div>
    `).join('')}
  </div>

  <!-- Full Width Typical Day Profile (AGP) -->
  <div class="section-title">24-Hour Typical Day Profile (Ambulatory Glucose Profile)</div>
  <div class="graph-card">
    ${profileSvg || '<p style="color:#64748b;font-size:8.5pt;text-align:center;">Insufficient readings to construct typical day AGP curve.</p>'}
    <div style="font-size:7.5pt;color:#64748b;margin-top:4px;display:flex;justify-content:space-between;">
      <span>Solid Blue Line: <b>Median Glucose</b> · Dark Shading: <b>IQR (25th–75th percentile)</b> · Light Shading: <b>10th–90th percentile</b></span>
      <span>Target Bands: <b style="color:#0284c7;">Personal ${pLow}-${pHigh}</b> | <b style="color:#16a34a;">Medical ${th.low}-${th.high}</b></span>
    </div>
  </div>

  <!-- Active Pump Profile & Schedule -->
  <div class="section-title">Active Pump Schedule (AndroidAPS "${esc(prof.profileName || '20u standard day')}")</div>
  <div style="display:grid;grid-template-columns: 2fr 1fr 1fr;gap:8px;margin-bottom:10px;">
    <div>
      <div style="font-size:7.5pt;font-weight:700;color:#64748b;margin-bottom:2px;">SCHEDULED BASAL RATES (Total: 20.75 U/day)</div>
      <table>
        <thead><tr><th>Time</th><th>Scheduled Rate</th><th>Window</th></tr></thead>
        <tbody>
          <tr><td>00:00 - 05:00</td><td>1.00 U/h</td><td>Overnight</td></tr>
          <tr><td>05:00 - 08:00</td><td>1.25 - 1.50 U/h</td><td>Dawn / Morning Rise</td></tr>
          <tr><td>08:00 - 12:00</td><td>1.25 U/h</td><td>Morning Active</td></tr>
          <tr style="background:#e0f2fe;font-weight:bold;"><td>12:00 - 16:00</td><td>0.50 - 0.75 U/h</td><td>Afternoon (Peak Drift Window)</td></tr>
          <tr><td>16:00 - 23:00</td><td>0.50 U/h</td><td>Evening</td></tr>
          <tr><td>23:00 - 24:00</td><td>0.75 U/h</td><td>Late Night</td></tr>
        </tbody>
      </table>
    </div>
    <div>
      <div style="font-size:7.5pt;font-weight:700;color:#64748b;margin-bottom:2px;">IC CARB RATIOS</div>
      <table>
        <thead><tr><th>Time</th><th>Ratio</th></tr></thead>
        <tbody>
          <tr><td>00:00</td><td>6.0 g/U</td></tr>
          <tr><td>10:00</td><td>7.5 g/U</td></tr>
          <tr><td>13:00</td><td>7.5 g/U</td></tr>
          <tr><td>23:00</td><td>8.5 g/U</td></tr>
        </tbody>
      </table>
    </div>
    <div>
      <div style="font-size:7.5pt;font-weight:700;color:#64748b;margin-bottom:2px;">ISF SENSITIVITY</div>
      <table>
        <thead><tr><th>Time</th><th>ISF Drop</th></tr></thead>
        <tbody>
          <tr><td>00:00</td><td>1.6 mmol/L/U</td></tr>
          <tr><td>All Day</td><td>Flat Schedule</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- AI Clinical Synthesis & Fine-Tuning Action Plan -->
  ${evaluation?.report ? `
    <div class="section-title">Clinical Synthesis & Fine-Tuning Action Plan</div>
    <div class="text-box">
      ${evaluation.report.split('\n\n').map((p) => `<p>${esc(p).replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')}</p>`).join('')}
    </div>
  ` : ''}

  <!-- AI Numerical Observations ("What the numbers say") -->
  ${insight?.text ? `
    <div class="section-title">What the Numbers Say (Empirical Observation)</div>
    <div class="text-box">
      ${insight.text.split('\n\n').map((p) => `<p>${esc(p).replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')}</p>`).join('')}
    </div>
  ` : ''}

  <!-- Footer -->
  <div class="footer">
    <span>Information Management System (IMS) • Grounded in AndroidAPS, Nightscout CGM telemetry, and international consensus guidelines.</span>
    <span>Clinical parameters and medication changes should always be evaluated with your specialist diabetes healthcare team.</span>
  </div>

</body>
</html>`;
}

/**
 * Generates a high-resolution PDF Buffer using Playwright Chromium
 */
export async function generateGlucosePdf({ days = 14 } = {}) {
  const summary = getSummary(days);
  const thresholds = getGlucoseThresholds();
  const profile = getProfile();
  const insight = getSavedInsight();
  const evaluation = getSavedEvaluation();

  const html = buildGlucoseReportHtml({
    days,
    summary,
    profile,
    evaluation,
    insight,
    thresholds
  });

  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '12mm', right: '12mm' }
    });
    return {
      pdf: pdfBuffer,
      filename: `IMS-Glucose-Report-${days}days.pdf`,
      days
    };
  } finally {
    await browser.close();
  }
}

/**
 * Sends the generated PDF report as an email attachment via the user's connected Gmail OAuth account
 */
export async function sendGlucosePdfEmail({ days = 14, recipientEmail, subject, note } = {}) {
  const auth = getAuthenticatedClient();
  if (!auth) {
    throw new Error('Google account is not connected. Please connect your Google account in Settings.');
  }

  // Retrieve user email from stored token
  const tokenRow = db.prepare('SELECT user_email, user_name FROM oauth_tokens WHERE id = 1').get();
  const to = recipientEmail || tokenRow?.user_email;
  if (!to) {
    throw new Error('Recipient email is required.');
  }

  const { pdf, filename } = await generateGlucosePdf({ days });

  const finalSubject = subject || `IMS Blood Glucose Report (${days} Days) - ${new Date().toLocaleDateString('en-GB')}`;
  const bodyText = [
    `Hi,`,
    ``,
    `Please find attached your ${days}-day Blood Glucose & Pump Profile Report generated from the Information Management System (IMS).`,
    note ? `\nNote from sender:\n${note}\n` : '',
    ``,
    `Report Highlights:`,
    `- Generated: ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })}`,
    `- Connected Profile: "20u standard day"`,
    `- Includes: Time-in-Range breakdown, full-width 24h Ambulatory Glucose Profile, AndroidAPS pump schedules, and AI Clinical Synthesis.`,
    ``,
    `Best regards,`,
    `Information Management System (IMS)`
  ].filter(Boolean).join('\n');

  const boundary = '==Multipart_Boundary_x' + Math.random().toString(36).substring(2) + 'x==';
  const nl = '\r\n';
  const fromEmail = tokenRow?.user_email || 'me';

  const rawMessage = [
    `From: ${fromEmail}`,
    `To: ${to}`,
    `Subject: =?utf-8?B?${Buffer.from(finalSubject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    bodyText,
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename}"`,
    '',
    Buffer.from(pdf).toString('base64'),
    '',
    `--${boundary}--`
  ].join(nl);

  const encoded = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const gmail = google.gmail({ version: 'v1', auth });
  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encoded
    }
  });

  return {
    success: true,
    messageId: result.data.id,
    sentTo: to,
    filename
  };
}

/**
 * Returns Google account status for email sending
 */
export function getEmailStatus() {
  const tokenRow = db.prepare('SELECT user_email, user_name FROM oauth_tokens WHERE id = 1').get();
  return {
    connected: Boolean(tokenRow?.user_email),
    userEmail: tokenRow?.user_email || null,
    userName: tokenRow?.user_name || null
  };
}
