import db from '../db/database.js';

// Training load from Strava: every session's load (Strava's Relative Effort, else a heart-rate estimate,
// else its length), the acute load (7-day, "fatigue"), chronic load (42-day, "fitness") and their balance
// ("form" = fitness - fatigue), the acute:chronic ratio and the week-on-week running distance ramp.
// Speed and hill sessions count in full here - load and distance are real work; it's only PACE analysis
// that leaves them out (stravaService). Loads are impulses decaying continuously from the moment each
// session ended, so recovery can be given to the hour: "recovered" is form back to RECOVERED_TSB or
// above, and the percentage is how far form has climbed back since the last session ended.
// Shown on the Run Planner and the Blood sugar page.

const ATL_DAYS = 7, CTL_DAYS = 42;
const RECOVERED_TSB = -5;
const RUNS = ['Run', 'TrailRun', 'VirtualRun'];
const HOUR = 3600000, DAY = 24 * HOUR;

// Load for one session, roughly on Strava's Relative Effort scale.
function sessionLoad(a) {
  let raw = {};
  try { raw = JSON.parse(a.raw || '{}'); } catch { /* no extras */ }
  if (raw.suffer_score > 0) return { load: raw.suffer_score, from: 'relative effort' };
  const min = (a.moving_time || 0) / 60;
  if (a.avg_hr) {
    const hr = a.avg_hr;
    const k = hr < 130 ? 0.6 : hr < 145 ? 1.0 : hr < 158 ? 1.5 : hr < 168 ? 2.0 : 2.6;
    return { load: min * k, from: 'heart rate' };
  }
  const easy = ['Walk', 'Hike', 'StandUpPaddling'].includes(a.sport);
  return { load: min * (easy ? 0.4 : 0.8), from: 'duration' };
}

const endTime = (a) => {
  const start = Date.parse(a.start_utc || `${a.start_local}Z`);
  return (Number.isFinite(start) ? start : Date.parse(`${a.day}T12:00:00Z`)) + (a.elapsed_time || a.moving_time || 0) * 1000;
};

// Fatigue (ATL), fitness (CTL) and form (TSB) at time t from a list of { at, load } impulses.
function stateAt(impulses, t) {
  let atl = 0, ctl = 0;
  for (const s of impulses) {
    if (s.at > t) continue;
    const d = (t - s.at) / DAY;
    atl += (s.load / ATL_DAYS) * Math.exp(-d / ATL_DAYS);
    ctl += (s.load / CTL_DAYS) * Math.exp(-d / CTL_DAYS);
  }
  return { atl, ctl, tsb: ctl - atl };
}

const r1 = (n) => Math.round(n * 10) / 10;

export function getTrainingLoad({ now = Date.now() } = {}) {
  const since = new Date(now - 200 * DAY).toISOString().slice(0, 10); // plenty for the 42-day average to settle
  const rows = db.prepare(`SELECT id, name, sport, day, start_local, start_utc, distance, moving_time, elapsed_time, avg_hr, session_tag, raw
    FROM strava_activities WHERE day >= ? ORDER BY start_local`).all(since);
  const impulses = rows.map((a) => ({ ...sessionLoad(a), at: endTime(a), a }));
  if (!impulses.length) return { available: false, reason: 'No Strava activities in the last 200 days.' };

  const cur = stateAt(impulses, now);
  const acwr = cur.ctl > 0 ? cur.atl / cur.ctl : null;

  // week-on-week running distance (all runs - speed and hill sessions still count for distance)
  const runKm = (fromMs, toMs) => rows.filter((a) => RUNS.includes(a.sport)).filter((a) => { const t = endTime(a); return t > fromMs && t <= toMs; })
    .reduce((n, a) => n + (a.distance || 0) / 1000, 0);
  const thisWeek = runKm(now - 7 * DAY, now), lastWeek = runKm(now - 14 * DAY, now - 7 * DAY);
  const rampPct = lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek) * 100 : null;

  // recovery: from the end of the last session, how long until form is back to RECOVERED_TSB with no more training
  const last = impulses.filter((s) => s.at <= now).at(-1);
  const after = last ? stateAt(impulses, last.at) : cur;
  let recoveredAt = null;
  if (cur.tsb < RECOVERED_TSB) {
    for (let h = 1; h <= 21 * 24; h++) {
      if (stateAt(impulses, now + h * HOUR).tsb >= RECOVERED_TSB) { recoveredAt = now + h * HOUR; break; }
    }
  }
  const startTsb = Math.min(after.tsb, cur.tsb);
  const pct = cur.tsb >= RECOVERED_TSB ? 100 : startTsb >= RECOVERED_TSB ? 100
    : Math.max(0, Math.min(99, Math.round(((cur.tsb - startTsb) / (RECOVERED_TSB - startTsb)) * 100)));
  const hoursLeft = recoveredAt ? Math.round((recoveredAt - now) / HOUR) : cur.tsb >= RECOVERED_TSB ? 0 : null;

  const status = cur.tsb > 10 ? 'fresh' : cur.tsb >= RECOVERED_TSB ? 'ready' : cur.tsb >= -10 ? 'recovering' : cur.tsb >= -20 ? 'tired' : 'very tired';
  const warnings = [], suggestions = [];
  if (rampPct != null && rampPct > 10) {
    warnings.push({ kind: 'ramp', level: rampPct > 30 ? 'high' : 'caution', text: `Running distance is up ${Math.round(rampPct)}% on the week before (${r1(thisWeek)} km against ${r1(lastWeek)} km) - more than the usual 10% guide.` });
    suggestions.push(`Keep the next 7 days to about ${r1(lastWeek * 1.1)} km, with most of it easy.`);
  }
  if (acwr != null && acwr > 1.5) warnings.push({ kind: 'acwr', level: 'high', text: `Acute:chronic load ratio is ${acwr.toFixed(2)} - well above the 0.8-1.3 sweet spot, where injury risk climbs.` });
  else if (acwr != null && acwr > 1.3) warnings.push({ kind: 'acwr', level: 'caution', text: `Acute:chronic load ratio is ${acwr.toFixed(2)} - edging above the 0.8-1.3 sweet spot.` });
  if (cur.tsb < -20) warnings.push({ kind: 'fatigue', level: 'high', text: `Fatigue is high (form ${r1(cur.tsb)}).` });
  if (status === 'very tired' || status === 'tired') suggestions.push('Make the next day or two rest or very easy (conversational pace, short).');
  else if (status === 'recovering') suggestions.push(recoveredAt ? `Easy running only until about ${new Date(recoveredAt).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' })}.` : 'Keep it easy for now.');
  if (acwr != null && acwr < 0.8 && cur.ctl > 5) suggestions.push('Load has dropped below your usual - room to build back gradually.');
  if (!suggestions.length) suggestions.push('Good to train - a quality session is fine if one is planned.');

  // the last 42 days, day by day, for the chart
  const history = [];
  for (let d = 41; d >= 0; d--) {
    const t = now - d * DAY;
    const s = stateAt(impulses, t);
    history.push({ day: new Date(t).toISOString().slice(0, 10), atl: r1(s.atl), ctl: r1(s.ctl), tsb: r1(s.tsb) });
  }

  return {
    available: true,
    atl: r1(cur.atl), ctl: r1(cur.ctl), tsb: r1(cur.tsb), acwr: acwr != null ? Math.round(acwr * 100) / 100 : null,
    status,
    recovery: {
      inRecovery: cur.tsb < RECOVERED_TSB, percent: pct, hoursLeft,
      daysLeft: hoursLeft != null ? Math.round((hoursLeft / 24) * 10) / 10 : null,
      recoveredAt: recoveredAt ? new Date(recoveredAt).toISOString() : null,
      threshold: RECOVERED_TSB,
      lastSession: last ? { name: last.a.name, sport: last.a.sport, day: last.a.day, endedAt: new Date(last.at).toISOString(), load: Math.round(last.load), loadFrom: last.from, tag: last.a.session_tag || null } : null,
    },
    ramp: { thisWeekKm: r1(thisWeek), lastWeekKm: r1(lastWeek), pct: rampPct != null ? Math.round(rampPct) : null },
    warnings, suggestions, history,
    notes: 'Load uses Strava Relative Effort where available (else heart rate, else duration). Speed and hill sessions count towards load and distance; they stay out of pace analysis only.',
  };
}
