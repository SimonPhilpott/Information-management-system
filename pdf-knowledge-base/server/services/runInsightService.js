import db from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { matchActivity, getCurrentState } from './runGlucoseService.js';
import { getRoute, linkedRouteId } from './routeService.js';
import { estimatePlan, getTargets, SOURCES } from './runPlanService.js';
import { textInUnits, clearUnitCache, normaliseUnits } from './aiTextService.js';

// An AI review of one finished activity against the user's targets (start near 9 mmol/L and
// never below 5 by default), with advice for the next time on the same route from where
// glucose and insulin on board are right now. The numbers come from the Nightscout log and
// the planner model; the AI only explains them.
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
db.exec('CREATE TABLE IF NOT EXISTS activity_insight (activity_id INTEGER PRIMARY KEY, at INTEGER NOT NULL, text TEXT NOT NULL, inputs TEXT)');

try { db.exec('ALTER TABLE activity_insight ADD COLUMN units TEXT'); } catch (_) { /* already there */ }

export async function getSavedInsight(id, units = 'km') {
  const r = db.prepare('SELECT at, text, units FROM activity_insight WHERE activity_id = ?').get(id);
  return r ? { at: r.at, text: await textInUnits('insight', id, r.text, r.units || 'km', units), sources: SOURCES } : null;
}

const brief = (plan) => plan && ({
  startBg: plan.inputs.startBg, iob: plan.inputs.iob, minutes: plan.run.durationMin, gainM: plan.run.gainM, effortFactor: plan.run.effortFactor,
  totalCarbsG: plan.plan.totalCarbs, carbsPerHour: plan.plan.carbsPerHour,
  stops: plan.plan.stops.map((s) => `${s.grams} g at ${s.minute} min (${s.km} km)${s.note ? ` - ${s.note}` : ''}`),
  postRunCarbsG: plan.plan.postCarbs, carbsToReachStartTargetG: plan.plan.toReachStartTarget, predicted: plan.plan.predicted, warnings: plan.warnings,
  whatIfStart: plan.startScenarios.map((s) => `start ${s.startBg}: ${s.totalCarbs} g total, lowest ${s.minBg}`),
  whatIfIob: plan.iobScenarios.map((s) => `IOB ${s.iob}: ${s.totalCarbs} g total, lowest ${s.minBg}`),
  guidelineGrams: plan.guideline,
});

const unitNote = (units) => (units === 'mi' ? 'Write distances in MILES and pace in min per mile (the data below is in kilometres and min per km - convert: 1 mile = 1.609 km); elevation stays in metres.' : 'Write distances in kilometres and pace in min per km; elevation in metres.');
export async function analyseActivity(id, units = 'km') {
  const m = await matchActivity(id);
  if (m.status !== 'ok') throw new Error(m.note || 'This activity has no glucose data to review.');
  const a = db.prepare('SELECT id, name, sport, day, distance, moving_time, elevation, avg_speed, avg_hr FROM strava_activities WHERE id = ?').get(id);
  const targets = getTargets();
  const st = m.stats;
  const dur = m.window.durationMin;

  // What happened, against the user's own targets.
  const inRun = m.series.filter((p) => p.m >= 0 && p.m <= dur && p.bg != null);
  const minutesBelow = inRun.filter((p) => p.bg < targets.floor).length * 5;
  const minutesAbove10 = inRun.filter((p) => p.bg > 10).length * 5;
  const verdict = {
    startTarget: targets.startTarget, floor: targets.floor, startedAt: st.bgStart,
    startVsTarget: st.bgStart != null ? Math.round((st.bgStart - targets.startTarget) * 10) / 10 : null,
    lowest: st.bgMin, lowestAtMinute: st.bgMinAtMin, minutesBelowFloor: minutesBelow, minutesAbove10, endedAt: st.bgEnd, change: st.bgChange,
    lowAfterFinish: st.post?.bgMin, lowAfterFinishAtMinute: st.post?.bgMinAtMin, hypoWithin2h: st.hypoWithin2h,
    stayedAboveFloor: st.bgMin != null && st.bgMin >= targets.floor && !(st.post?.bgMin < targets.floor),
  };

  const route = linkedRouteId(id) ? getRoute(linkedRouteId(id)) : null;
  const now = getCurrentState();
  const km = a.distance / 1000;
  const pace = a.moving_time / 60 / km;
  const base = { paceMinPerKm: pace, intensity: 'steady', sport: a.sport, ...(route ? { routeId: route.id } : { distanceKm: km }) };
  const safe = (fn) => { try { return fn(); } catch (_) { return null; } };
  const fromNow = now.bgFresh && now.bg != null
    ? safe(() => estimatePlan({ ...base, startBg: now.bg, iob: now.iob ?? 0, cob: now.cob ?? 0, minutesSinceBolus: now.lastBolusMinutesAgo ?? undefined }))
    : null;
  const fromTarget = safe(() => estimatePlan({ ...base, startBg: targets.startTarget, iob: 0 }));
  const sameStart = safe(() => estimatePlan({ ...base, startBg: st.bgStart ?? targets.startTarget, iob: st.iobStart ?? 0, cob: st.cobStart ?? 0 }));

  const facts = {
    activity: { name: a.name, sport: a.sport, date: a.day, km: Math.round(km * 10) / 10, minutes: Math.round(a.moving_time / 60), paceMinPerKm: Math.round(pace * 100) / 100, climbM: a.elevation ? Math.round(a.elevation) : null, avgHr: a.avg_hr ? Math.round(a.avg_hr) : null },
    route: route
      ? { name: route.name, km: route.distanceKm, gainM: route.gainM, steepestSplit: route.splits.reduce((b, s) => (s.maxGrade > (b?.maxGrade ?? -99) ? s : b), null) }
      : 'no saved route linked (distance and climb are from Strava)',
    verdict,
    conditions: {
      iobAtStart: st.iobStart, iobEnd: st.iobEnd, cobAtStart: st.cobStart, lastBolusUnits: st.lastBolusUnits,
      lastBolusHoursBefore: st.lastBolusMinutesBefore != null ? Math.round(st.lastBolusMinutesBefore / 6) / 10 : null,
      bolusUnitsIn4hBefore: st.bolusUnits4hBefore, carbs3hBeforeG: st.carbsGrams3hBefore, carbsHourBeforeG: st.carbsGrams60mBefore, carbsDuringG: st.carbsGramsDuring,
      pumpSuspendedPercentOfRun: st.basalZeroPct, tempTarget: st.tempTarget, glucoseTrendIntoStart: st.bgTrendIntoStart, steepestFallPer10Min: st.fallPer10Min,
    },
    chartEvery10Min: m.series.filter((p) => p.m >= -60 && p.m <= dur + 90).filter((_, i) => i % 2 === 0).map((p) => [p.m, p.bg, p.iob]),
    events: m.events,
    rightNow: {
      ...now,
      // how long until insulin on board falls below 1 U by the model's insulin curve (3 h action), and the 2-hour bolus rule
      hoursUntilIobBelow1U: now.iob != null && now.iob > 1 ? Math.round(3 * (1 - (1 / now.iob) ** (1 / 1.5)) * 10) / 10 : 0,
      lastBolusWithin2Hours: now.lastBolusMinutesAgo != null && now.lastBolusMinutesAgo < 120,
    },
    planIfYouStartHowYouAreNow: brief(fromNow),
    planIfYouStartAtTarget: brief(fromTarget),
    modelReplayOfThisRunsStart: sameStart ? { predictedLowestWithoutCarbs: sameStart.plan.predicted.minWithoutCarbs, actualLowest: st.bgMin } : null,
    modelAssumptions: {
      ...fromTarget?.basis,
      note: fromTarget?.basis?.personalFitted ? "exercise uptake fitted from the runner's own matched runs" : 'general assumptions only - not enough matched runs to fit personal values yet (needs 4)',
    },
    settings: fromTarget?.settings,
  };

  const prompt =
    `You are reviewing one run for a person with type 1 diabetes (Omnipod pump, AAPS closed loop, Libre 2 sensor; mmol/L). Their own targets: start each run at about ${targets.startTarget} mmol/L and never go below ${targets.floor} mmol/L. Use British English and plain, kind, specific language. ${unitNote(units)} ` +
    `Everything you say must come from the DATA below; quote numbers; separate what was observed from what the planner MODEL estimates; do not invent measurements. Where the data is thin, say so.\n\n` +
    `Write these sections with these headings:\n` +
    `1. "What went right" - compared with their targets (start near ${targets.startTarget}, stay above ${targets.floor}). Always find one to three genuine positives even in a hard run (for example: low insulin on board, never above 10, no low after finishing, a steady middle section); if there truly are none, say "Not much this time" and then name the least bad thing. Do not start this section with an apology.\n` +
    `2. "What went wrong" - lows or highs, when they happened, and the likely contributors visible in the data (insulin on board at the start, recent bolus, carbs, pump suspension, gradient and effort, trend into the start, post-run dip). Say plainly if nothing went wrong.\n` +
    `3. "Next time on this route" - based on where glucose and insulin on board are RIGHT NOW (use planIfYouStartHowYouAreNow if present; if it is null, say the current data is stale and use planIfYouStartAtTarget). If rightNow shows insulin on board of about 2 U or more, or lastBolusWithin2Hours is true, say clearly that right now is NOT a good time to start this run, and that waiting about hoursUntilIobBelow1U hours (or setting the exercise target early, as the team's guidance describes) makes the run much easier; only then describe what the plan would need if they went now, as an "if you had to go now" fallback. Give: "Before you go" (what start glucose to aim for, whether carbs are needed to reach it, how long IOB should be allowed to fall), "During the run" (concrete carbs: how many grams at what minute and km, ideally on flat or downhill stretches, matching the plan's stops) and "After" (carbs at the finish if the plan shows a post-run dip, and the delayed-low window).\n` +
    `4. "Insulin - things to discuss with your diabetes team" - only options the published guidance supports (reducing a bolus given within 2 hours of the run: about 20% per Riddell 2017 up to about 50% per ISPAD 2022; raising the exercise/activity target ahead of the run so IOB falls; an overnight basal reduction of about 20% for about 6 hours for pump users after evening runs). NEVER give a specific insulin dose, a specific target value, or a change to pump settings, and quote no numbers for these options other than the percentages and hours named in this paragraph; say these decisions are theirs and their team's.` +
    `Also explain briefly and accurately that exercise raises insulin-independent glucose uptake (roughly 1.5 to 10 times with intensity) and also increases insulin sensitivity during and for hours afterwards, so insulin on board that is harmless at rest can act harder during a run - which is why IOB at the start matters most. Do not claim a precise multiplier; the planner uses an adjustable assumption.\n` +
    `5. "How much to trust this" - sample size (personal fit: ${fromTarget?.basis?.personalRuns ?? 0} matched runs), the assumptions used (read modelAssumptions.note honestly: never call the model "fitted" unless it says so), and that this is pattern-spotting from their own data, not medical advice.\n` +
    `Keep it under about 450 words. Start with one sentence summing up the run. Use short paragraphs or short bullet lists.\n\nDATA (JSON):\n${JSON.stringify(facts)}`;

  const text = (await genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }).generateContent(prompt)).response.text().trim();
  const saved = { at: Date.now(), text, sources: SOURCES };
  db.prepare('INSERT OR REPLACE INTO activity_insight (activity_id, at, text, inputs, units) VALUES (?, ?, ?, ?, ?)').run(id, saved.at, text, JSON.stringify({ verdict, now }), normaliseUnits(units));
  clearUnitCache('insight', id);
  return saved;
}
