import db from '../db/database.js';
import { matchActivity } from './runGlucoseService.js';
import { getRoute, linkedRouteId } from './routeService.js';
import { estimatePlan, getTargets } from './runPlanService.js';
import { getTrainingLoad } from './trainingLoadService.js';

// The post-run review for the Run Planner's flythrough: what worked and what to watch, worked out from
// the run's own CGM trace (runGlucoseService) against the user's targets - never made up - and what the
// run means for the next couple of days, each linked to the page that uses it: the raised insulin
// sensitivity window (Blood sugar), refuelling muscle glycogen (carbs), and the next plan on this route
// (Run Planner). Insulin wording follows the T1D rulebook: no doses; setting changes are for the team.

const HOUR = 3600000;
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
const clock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
const dayClock = (ms) => new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' });

export async function postRunReview(activityId) {
  const a = db.prepare('SELECT id, name, sport, day, start_utc, distance, moving_time, elapsed_time, avg_hr, session_tag, raw FROM strava_activities WHERE id = ?').get(activityId);
  if (!a) throw new Error('Activity not found.');
  const m = await matchActivity(activityId);
  if (m.status !== 'ok') return { available: false, reason: m.note || 'No glucose data was logged for this run, so there is nothing to review yet.' };
  const t = getTargets();
  const st = m.stats;
  const dur = m.window.durationMin;
  const endMs = Date.parse(a.start_utc) + (a.elapsed_time || a.moving_time) * 1000;
  const inRun = m.series.filter((p) => p.m >= 0 && p.m <= dur && p.bg != null);
  // minutes from the share of readings (the trace mixes 1- and 5-minute data)
  const share = (f) => (inRun.length ? Math.round((inRun.filter(f).length / inRun.length) * dur) : 0);
  const below = share((p) => p.bg < t.floor);
  const above10 = share((p) => p.bg > 10);
  const carbsDuring = st.carbsGramsDuring || 0;

  const worked = [], watch = [];
  if (st.bgStart != null) {
    const off = st.bgStart - t.startTarget;
    if (Math.abs(off) <= 1) worked.push(`Started at ${st.bgStart} mmol/L - right on your ${t.startTarget} start target.`);
    else if (off < -1) watch.push(`Started at ${st.bgStart} mmol/L, ${r1(-off)} below your ${t.startTarget} start target - less headroom for the drop once you got going.`);
    else watch.push(`Started at ${st.bgStart} mmol/L, ${r1(off)} above your ${t.startTarget} start target.`);
  }
  if (st.bgMin != null && below === 0) worked.push(`Stayed above your ${t.floor} floor the whole run (lowest ${st.bgMin}${st.bgMinAtMin != null ? ` at minute ${st.bgMinAtMin}` : ''}).`);
  if (below > 0) watch.push(`About ${below} minutes below your ${t.floor} floor; lowest ${st.bgMin}${st.bgMinAtMin != null ? ` at minute ${st.bgMinAtMin}` : ''}.`);
  if (carbsDuring > 0) (below === 0 ? worked : watch).push(`${carbsDuring} g of carbs during the run${below === 0 ? ' kept you above the floor' : " weren't quite enough to hold the floor"}.`);
  if (above10 === 0 && inRun.length) worked.push('No time above 10 mmol/L.');
  else if (above10 >= 15) watch.push(`${above10} minutes above 10 mmol/L.`);
  if (st.fallPer10Min != null && st.fallPer10Min >= 1) watch.push(`Fastest fall was ${st.fallPer10Min} mmol/L in 10 minutes - carbs a little earlier would soften it.`);
  if (st.post?.hypo || (st.post?.bgMin != null && st.post.bgMin < t.floor)) watch.push(`Dropped to ${st.post.bgMin} within 2 hours of finishing${st.post.bgMinAtMin != null ? ` (about ${st.post.bgMinAtMin} minutes after)` : ''}.`);
  else if (st.post?.bgMin != null) worked.push(`No low in the 2 hours after finishing (lowest ${st.post.bgMin}).`);
  if (a.session_tag === 'speed' || a.session_tag === 'hill') watch.push(`Tagged as a ${a.session_tag} session - harder efforts burn carbs faster and can push glucose up at first, then drop it later.`);

  // ---- what it means for the next couple of days ----
  let load = null;
  try { load = JSON.parse(a.raw || '{}').suffer_score ?? null; } catch { /* none */ }
  const strength = load == null ? 'moderate' : load < 50 ? 'mild' : load < 120 ? 'moderate' : 'high';
  const now = Date.now();
  const since = (now - endMs) / HOUR;
  // raised from the end of the run, strongest for the first day, back to normal by about 48 hours
  const sensitivity = {
    strength, from: endMs, peakUntil: endMs + 24 * HOUR, until: endMs + 48 * HOUR,
    hoursSince: r1(since), percentLeft: Math.max(0, Math.min(100, Math.round(100 - (since / 48) * 100))),
    active: since < 48,
    nightRisk: { from: endMs + 7 * HOUR, to: endMs + 11 * HOUR, text: `${dayClock(endMs + 7 * HOUR)} - ${clock(endMs + 11 * HOUR)}` },
    text: `Insulin sensitivity is raised (${strength}, by the run's effort) for about 24 hours after you finished, tailing off to normal by around ${dayClock(endMs + 48 * HOUR)}. The likeliest time for a low overnight is 7-11 hours after (${dayClock(endMs + 7 * HOUR)} to ${clock(endMs + 11 * HOUR)}). Your rulebook (ISPAD) suggests about a 20% overnight basal reduction for ~6 hours or a higher night-time loop target (6.5-7.0) after evening runs - agree any setting change with your diabetes team first.`,
    link: { label: 'Blood sugar', path: '/ims/glucose' },
  };

  // refuelling: what the planner model says for the conditions this run actually started in
  const route = linkedRouteId(activityId) ? getRoute(linkedRouteId(activityId)) : null;
  const km = a.distance / 1000;
  const base = { paceMinPerKm: a.moving_time / 60 / km, intensity: a.session_tag === 'speed' ? 'hard' : 'steady', sport: a.sport, ...(route ? { routeId: route.id } : { distanceKm: km }) };
  let same = null, next = null;
  try { same = await estimatePlan({ ...base, startBg: st.bgStart ?? t.startTarget, iob: st.iobStart ?? 0, cob: st.cobStart ?? 0 }); } catch { /* planner can't model it */ }
  try { next = await estimatePlan({ ...base, startBg: t.startTarget, iob: 0 }); } catch { /* ditto */ }
  const weight = t.weightKg || null;
  // ~1 g/kg in the first hour after a long or hard run (consensus sports nutrition); else the planner's post-run carbs
  const hardOrLong = dur >= 75 || strength === 'high';
  const refuelG = hardOrLong && weight ? Math.round(weight) : Math.max(same?.plan?.postCarbs || 0, hardOrLong ? 40 : 20);
  const glycogen = {
    grams: refuelG,
    text: `Refuel muscle glycogen with about ${refuelG} g of carbs in the hour after (${hardOrLong ? (weight ? 'about 1 g per kg after a long or hard run' : 'a long or hard run - add your weight under Targets for a per-kg figure') : 'from the planner, for where you finished'}), with some protein. Because sensitivity is raised, this is a time carbs are less likely to spike you.`,
    link: { label: 'Log carbs', path: '/ims/glucose' },
  };

  // the next plan on this route, from the start target
  const nextPlan = next ? {
    totalCarbs: next.plan.totalCarbs, stops: next.plan.stops.map((s) => ({ minute: s.minute, grams: s.grams })),
    text: `Next time${route ? ` on ${route.name}` : ''}: starting at your ${t.startTarget} target with no insulin on board, the plan is ${next.plan.totalCarbs} g in all${next.plan.stops.length ? ` (${next.plan.stops.map((s) => `${s.grams} g at ${s.minute} min`).join(', ')})` : ''}${below > 0 ? ` - this run dipped below your floor, so consider starting nearer the top of your target or taking the first carbs earlier` : ''}.`,
    link: route ? { label: 'Plan this run', path: '/ims/runplanner', routeId: route.id } : { label: 'Run Planner', path: '/ims/runplanner' },
  } : null;

  let recovery = null;
  try { const tl = getTrainingLoad(); recovery = tl.available ? { ...tl.recovery, status: tl.status } : null; } catch { /* no Strava */ }

  return {
    available: true,
    run: { id: a.id, name: a.name, day: a.day, km: r1(km), minutes: Math.round(a.moving_time / 60), endedAt: new Date(endMs).toISOString(), tag: a.session_tag || null, load },
    worked, watch, followUps: { sensitivity, glycogen, nextPlan, recovery },
  };
}
