import db, { getSetting, setSetting } from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MGDL = 18.0182;
const LOW = 3.9, HIGH = 10.0;
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const mmol = (sgv) => sgv / MGDL;

const PROFILE_KEY = 'aaps_active_profile';
const LAST_EVAL_KEY = 'glucose_profile_last_evaluation';

// Default baseline profile accurately initialized from runner's AndroidAPS "20u standard day"
export function getDefaultProfile() {
  return {
    profileName: "20u standard day",
    units: "mmol/l",
    dia: 5.0,
    ic: [
      { time: "00:00", value: 6.0 },
      { time: "10:00", value: 7.5 },
      { time: "13:00", value: 7.5 },
      { time: "23:00", value: 8.5 }
    ],
    isf: [
      { time: "00:00", value: 1.6 }
    ],
    basal: [
      { time: "00:00", value: 1.00 },
      { time: "02:00", value: 1.00 },
      { time: "03:00", value: 1.00 },
      { time: "04:00", value: 1.00 },
      { time: "05:00", value: 1.25 },
      { time: "06:00", value: 1.50 },
      { time: "07:00", value: 1.50 },
      { time: "08:00", value: 1.25 },
      { time: "09:00", value: 1.25 },
      { time: "10:00", value: 1.25 },
      { time: "11:00", value: 1.25 },
      { time: "12:00", value: 0.75 },
      { time: "13:00", value: 0.50 },
      { time: "14:00", value: 0.50 },
      { time: "15:00", value: 0.50 },
      { time: "16:00", value: 0.50 },
      { time: "17:00", value: 0.50 },
      { time: "18:00", value: 0.50 },
      { time: "19:00", value: 0.50 },
      { time: "20:00", value: 0.50 },
      { time: "21:00", value: 0.50 },
      { time: "22:00", value: 0.50 },
      { time: "23:00", value: 0.75 }
    ],
    target: [
      { time: "00:00", value: 5.5 }
    ],
    updatedAt: Date.now()
  };
}

export function getProfile() {
  try {
    const raw = getSetting(PROFILE_KEY);
    if (!raw) return getDefaultProfile();
    const parsed = JSON.parse(raw);
    return { ...getDefaultProfile(), ...parsed };
  } catch (err) {
    console.error('[GlucoseInsight] Failed to read profile, using default:', err.message);
    return getDefaultProfile();
  }
}

export function saveProfile(profile) {
  if (!profile || typeof profile !== 'object') throw new Error('Invalid profile payload');
  const clean = {
    profileName: String(profile.profileName || '20u standard day').slice(0, 50),
    units: 'mmol/l',
    dia: Number(profile.dia) || 5.0,
    ic: Array.isArray(profile.ic) ? profile.ic.map((e) => ({ time: String(e.time), value: r1(Number(e.value) || 7.5) })) : getDefaultProfile().ic,
    isf: Array.isArray(profile.isf) ? profile.isf.map((e) => ({ time: String(e.time), value: r1(Number(e.value) || 1.6) })) : getDefaultProfile().isf,
    basal: Array.isArray(profile.basal) ? profile.basal.map((e) => ({ time: String(e.time), value: r2(Number(e.value) || 0.5) })) : getDefaultProfile().basal,
    target: Array.isArray(profile.target) ? profile.target.map((e) => ({ time: String(e.time), value: r1(Number(e.value) || 5.5) })) : getDefaultProfile().target,
    updatedAt: Date.now()
  };
  setSetting(PROFILE_KEY, JSON.stringify(clean));
  return clean;
}

export function resetProfile() {
  const d = getDefaultProfile();
  setSetting(PROFILE_KEY, JSON.stringify(d));
  return d;
}

export function getSavedEvaluation() {
  try {
    const raw = getSetting(LAST_EVAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Helper to look up profile scheduled rate at an hour HH (0-23)
function getScheduledBasal(profile, hour) {
  const basal = profile.basal || [];
  let current = basal[0]?.value || 0.5;
  for (const b of basal) {
    const [h] = b.time.split(':').map(Number);
    if (h <= hour) current = b.value;
    else break;
  }
  return current;
}

// Helper to look up profile scheduled IC ratio at hour HH (0-23)
function getScheduledIC(profile, hour) {
  const ic = profile.ic || [];
  let current = ic[0]?.value || 7.5;
  for (const entry of ic) {
    const [h] = entry.time.split(':').map(Number);
    if (h <= hour) current = entry.value;
    else break;
  }
  return current;
}

// Helper to look up profile scheduled ISF at hour HH (0-23)
function getScheduledISF(profile, hour) {
  const isf = profile.isf || [];
  let current = isf[0]?.value || 1.6;
  for (const entry of isf) {
    const [h] = entry.time.split(':').map(Number);
    if (h <= hour) current = entry.value;
    else break;
  }
  return current;
}

/**
 * Computes deep mathematical telemetry across historical CGM, boluses, and temp basals
 */
export function computeEmpiricalMetrics(days = 14, profile = null) {
  const prof = profile || getProfile();
  const since = Date.now() - Math.max(1, Math.min(90, Number(days) || 14)) * 86400000;

  // 1. Fetch entries, treatments, and device status
  const entries = db.prepare('SELECT date as t, sgv, direction FROM ns_entries WHERE date >= ? ORDER BY date ASC').all(since)
    .map((e) => ({ t: e.t, v: r1(mmol(e.sgv)), direction: e.direction }));

  const treatments = db.prepare('SELECT at, event, insulin, carbs, rate, duration FROM ns_treatments WHERE at >= ? ORDER BY at ASC').all(since);
  const carbLogs = db.prepare('SELECT at, grams, food FROM carb_log WHERE at >= ? ORDER BY at ASC').all(since);
  const devicestatus = db.prepare('SELECT at, iob, basal_iob, cob, isf, cr FROM ns_devicestatus WHERE at >= ? ORDER BY at ASC').all(since);

  const getLondonHour = (t) => {
    return Number(new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }));
  };

  // --- SECTION A: TIME-BLOCK BASAL EVALUATION ---
  // Define the 6 physiological blocks, specifically isolating 12pm-4pm and Overnight
  const BASAL_BLOCKS = [
    { id: 'overnight', name: 'Overnight', start: 0, end: 6, label: '00:00 - 06:00' },
    { id: 'morning_dawn', name: 'Dawn & Morning', start: 6, end: 10, label: '06:00 - 10:00' },
    { id: 'late_morning', name: 'Late Morning', start: 10, end: 12, label: '10:00 - 12:00' },
    { id: 'afternoon', name: 'Afternoon (Peak Focus)', start: 12, end: 16, label: '12:00 - 16:00' },
    { id: 'evening', name: 'Late Afternoon & Dinner', start: 16, end: 20, label: '16:00 - 20:00' },
    { id: 'night', name: 'Night / Wind-down', start: 20, end: 24, label: '20:00 - 24:00' }
  ];

  // Map temp basals by block
  const tempBasals = treatments.filter((t) => t.event === 'Temp Basal' && t.duration > 0);

  const basalBlockStats = BASAL_BLOCKS.map((block) => {
    // Scheduled rate average across block
    let schedSum = 0;
    const hoursCount = block.end - block.start;
    for (let h = block.start; h < block.end; h++) {
      schedSum += getScheduledBasal(prof, h);
    }
    const avgScheduled = r2(schedSum / hoursCount);

    // Delivered basal across this block
    const blockTemps = tempBasals.filter((tb) => {
      const h = getLondonHour(tb.at);
      return h >= block.start && h < block.end;
    });

    let deliveredSum = 0;
    let deliveredMins = 0;
    for (const tb of blockTemps) {
      const dur = Math.min(120, Number(tb.duration) || 30);
      deliveredSum += (Number(tb.rate) || 0) * dur;
      deliveredMins += dur;
    }
    const avgDelivered = deliveredMins > 0 ? r2(deliveredSum / deliveredMins) : avgScheduled;
    const netOffset = r2(avgDelivered - avgScheduled);

    // Fasting Glucose Drift Rate in this block
    // Look at 1-hour windows where no carb log or meal bolus occurred in prior 2.5 hours
    const blockReadings = entries.filter((e) => {
      const h = getLondonHour(e.t);
      return h >= block.start && h < block.end;
    });

    const drifts = [];
    for (let i = 12; i < blockReadings.length; i += 12) {
      const p1 = blockReadings[i - 12];
      const p2 = blockReadings[i];
      if (!p1 || !p2) continue;
      const dtHours = (p2.t - p1.t) / 3600000;
      if (dtHours >= 0.8 && dtHours <= 1.2) {
        // verify no meal bolus in the last 2.5h
        const hadMeal = treatments.some((t) => (t.carbs > 0 || t.insulin > 1.0) && t.at >= p1.t - 9000000 && t.at <= p2.t);
        if (!hadMeal) {
          drifts.push((p2.v - p1.v) / dtHours);
        }
      }
    }

    const meanDrift = drifts.length > 0 ? r2(drifts.reduce((a, b) => a + b, 0) / drifts.length) : 0;
    const risingPct = drifts.length > 0 ? Math.round((drifts.filter((d) => d > 0.4).length / drifts.length) * 100) : 0;
    const fallingPct = drifts.length > 0 ? Math.round((drifts.filter((d) => d < -0.4).length / drifts.length) * 100) : 0;

    let verdict = 'BALANCED';
    let suggestion = `Rate of ${avgScheduled} U/h holds stability well.`;
    if (netOffset > 0.12 || meanDrift > 0.45 || risingPct > 55) {
      verdict = 'TOO_LOW';
      const proposed = r2(avgScheduled + 0.1);
      suggestion = `Basal appears too low. Loop is having to boost delivered basal (avg ${avgDelivered} U/h vs ${avgScheduled} U/h scheduled, drift +${meanDrift} mmol/L/h). Consider testing ${proposed} U/h (+0.1 U/h).`;
    } else if (netOffset < -0.12 || meanDrift < -0.45 || fallingPct > 55) {
      verdict = 'TOO_HIGH';
      const proposed = r2(Math.max(0.1, avgScheduled - 0.1));
      suggestion = `Basal appears too high. Loop is frequently zero-temping to prevent drops (avg ${avgDelivered} U/h vs ${avgScheduled} U/h scheduled, drift ${meanDrift} mmol/L/h). Consider testing ${proposed} U/h (-0.1 U/h).`;
    }

    return {
      id: block.id,
      name: block.name,
      label: block.label,
      avgScheduled,
      avgDelivered,
      netOffset,
      meanDrift,
      risingPct,
      fallingPct,
      verdict,
      suggestion,
      sampleWindows: drifts.length
    };
  });

  // --- SECTION B: IC (CARB RATIO) EVALUATION BY MEAL ---
  const MEAL_BLOCKS = [
    { id: 'breakfast', name: 'Breakfast (06:00 - 10:00)', start: 6, end: 10, defaultIC: 6.0 },
    { id: 'elevenses', name: 'Late Morning (10:00 - 13:00)', start: 10, end: 13, defaultIC: 7.5 },
    { id: 'lunch', name: 'Lunch (13:00 - 17:00)', start: 13, end: 17, defaultIC: 7.5 },
    { id: 'dinner', name: 'Dinner & Evening (17:00 - 23:00)', start: 17, end: 23, defaultIC: 7.5 },
    { id: 'overnight', name: 'Late Night (23:00 - 06:00)', start: 23, end: 6, defaultIC: 8.5 }
  ];

  // Combine meal boluses from treatments and carb logs
  const mealEvents = [];
  for (const t of treatments) {
    if (t.carbs > 5 || (t.event === 'Meal Bolus' && t.insulin > 0)) {
      mealEvents.push({ at: t.at, carbs: Number(t.carbs) || 0, insulin: Number(t.insulin) || 0, source: 'ns' });
    }
  }
  for (const c of carbLogs) {
    if (!mealEvents.some((m) => Math.abs(m.at - c.at) < 15 * 60000)) {
      mealEvents.push({ at: c.at, carbs: Number(c.grams) || 0, insulin: 0, source: 'carb_log' });
    }
  }

  const mealBlockStats = MEAL_BLOCKS.map((mb) => {
    // Scheduled IC for this window
    const scheduledIC = getScheduledIC(prof, mb.start);

    // Find meals in this window
    const mealsInWindow = mealEvents.filter((m) => {
      const h = getLondonHour(m.at);
      if (mb.start < mb.end) return h >= mb.start && h < mb.end;
      return h >= mb.start || h < mb.end; // overnight wrap
    });

    const excursions = [];
    let highCount = 0;
    let lowCount = 0;
    const empiricalRatios = [];

    for (const meal of mealsInWindow) {
      // Find start BG (closest within 20 min before)
      const startEntry = entries.filter((e) => e.t >= meal.at - 20 * 60000 && e.t <= meal.at + 5 * 60000).pop();
      // Find post-meal BG at +2h to +3h
      const postEntries = entries.filter((e) => e.t >= meal.at + 90 * 60000 && e.t <= meal.at + 180 * 60000);
      if (startEntry && postEntries.length > 0) {
        const peak = Math.max(...postEntries.map((p) => p.v));
        const endV = postEntries[postEntries.length - 1].v;
        const excursion = r1(endV - startEntry.v);
        excursions.push(excursion);

        if (peak > HIGH || endV > HIGH) highCount++;
        if (postEntries.some((p) => p.v < LOW)) lowCount++;

        // If meal had both carbs and insulin, calculate ratio
        if (meal.carbs > 15 && meal.insulin > 1.0) {
          empiricalRatios.push(r1(meal.carbs / meal.insulin));
        }
      }
    }

    const n = excursions.length;
    const avgExcursion = n > 0 ? r1(excursions.reduce((a, b) => a + b, 0) / n) : 0;
    const highPct = n > 0 ? Math.round((highCount / n) * 100) : 0;
    const lowPct = n > 0 ? Math.round((lowCount / n) * 100) : 0;
    const measuredIC = empiricalRatios.length > 0 ? r1(empiricalRatios.reduce((a, b) => a + b, 0) / empiricalRatios.length) : scheduledIC;

    let verdict = 'BALANCED';
    let suggestion = `IC ratio ${scheduledIC} g/U produces stable postprandial return (+${avgExcursion} mmol/L).`;
    if (highPct >= 45 || avgExcursion > 2.5) {
      verdict = 'UNDER_BOLUSED';
      const proposed = r1(Math.max(4.0, scheduledIC - 1.0));
      suggestion = `Ratio is too weak / under-bolusing (${highPct}% of meals remain >10.0 mmol/L at 2-3h; avg excursion +${avgExcursion} mmol/L). Consider testing a stronger ratio of ${proposed} g/U (giving more insulin per carb).`;
    } else if (lowPct >= 25 || avgExcursion < -2.0) {
      verdict = 'OVER_BOLUSED';
      const proposed = r1(scheduledIC + 1.0);
      suggestion = `Ratio is too aggressive / over-bolusing (${lowPct}% post-meal hypos < 3.9 mmol/L; avg excursion ${avgExcursion} mmol/L). Consider testing a gentler ratio of ${proposed} g/U (giving less insulin per carb).`;
    }

    return {
      id: mb.id,
      name: mb.name,
      scheduledIC,
      measuredIC,
      mealsObserved: n,
      avgExcursion,
      highPct,
      lowPct,
      verdict,
      suggestion
    };
  });

  // --- SECTION C: ISF (INSULIN SENSITIVITY FACTOR) EVALUATION & DIURNAL VARIANCE ---
  // Currently scheduled flat at 1.6 mmol/L per U across entire day
  const DIURNAL_WINDOWS = [
    { id: 'morning', name: 'Morning (06:00 - 12:00)', start: 6, end: 12 },
    { id: 'afternoon', name: 'Afternoon (12:00 - 18:00)', start: 12, end: 18 },
    { id: 'night', name: 'Evening & Night (18:00 - 06:00)', start: 18, end: 6 }
  ];

  // Look for correction boluses (insulin > 0.4, carbs == 0 or null, initial BG >= 7.5)
  const corrections = treatments.filter((t) => (t.carbs == null || t.carbs === 0) && t.insulin >= 0.4);

  const isfStats = DIURNAL_WINDOWS.map((win) => {
    const scheduledISF = getScheduledISF(prof, win.start);
    const winCorrections = corrections.filter((c) => {
      const h = getLondonHour(c.at);
      if (win.start < win.end) return h >= win.start && h < win.end;
      return h >= win.start || h < win.end;
    });

    const observedISFs = [];
    for (const cor of winCorrections) {
      // Find start BG
      const start = entries.filter((e) => e.t >= cor.at - 15 * 60000 && e.t <= cor.at + 5 * 60000).pop();
      // Find nadir within 2h - 3.5h
      const post = entries.filter((e) => e.t >= cor.at + 90 * 60000 && e.t <= cor.at + 210 * 60000);
      if (start && start.v >= 7.0 && post.length > 0) {
        const nadir = Math.min(...post.map((p) => p.v));
        const drop = start.v - nadir;
        if (drop > 0.5) {
          const calc = drop / cor.insulin;
          if (calc >= 0.5 && calc <= 6.0) observedISFs.push(calc);
        }
      }
    }

    const n = observedISFs.length;
    const measuredISF = n > 0 ? r1(observedISFs.reduce((a, b) => a + b, 0) / n) : scheduledISF;
    const diff = r1(measuredISF - scheduledISF);

    let verdict = 'MATCHED';
    let suggestion = `Sensitivity is well calibrated with profile ISF 1.6 (measured ~${measuredISF} mmol/L drop per Unit).`;
    if (diff > 0.4) {
      verdict = 'MORE_SENSITIVE';
      suggestion = `You are more sensitive in this period than profile 1.6 assumes (1 Unit drops you by ${measuredISF} mmol/L instead of 1.6). Consider raising ISF to ${measuredISF} to prevent over-correction dips.`;
    } else if (diff < -0.3) {
      verdict = 'MORE_RESISTANT';
      suggestion = `You are more resistant in this period than profile 1.6 assumes (1 Unit only drops you by ${measuredISF} mmol/L). Consider lowering ISF to ${measuredISF} so corrections are sufficient.`;
    }

    return {
      id: win.id,
      name: win.name,
      scheduledISF,
      measuredISF,
      diff,
      correctionsEvaluated: n,
      verdict,
      suggestion
    };
  });

  return {
    days,
    profile: prof,
    readingsEvaluated: entries.length,
    treatmentsEvaluated: treatments.length,
    basalBlocks: basalBlockStats,
    mealBlocks: mealBlockStats,
    isfBlocks: isfStats
  };
}

/**
 * Runs deep evaluation with both empirical numbers and Gemini Flash clinical synthesis
 */
export async function evaluateProfile(days = 14, customProfile = null) {
  const profile = customProfile || getProfile();
  const metrics = computeEmpiricalMetrics(days, profile);

  if (metrics.readingsEvaluated < 40) {
    throw new Error('Not enough glucose readings logged to perform profile evaluation - requires at least 48 hours of CGM data.');
  }

  const prompt = `You are an expert specialist clinical endocrinology and sports diabetes advisor reviewing real continuous glucose monitoring (CGM) and automated insulin delivery (AID/AndroidAPS) closed-loop data for an athlete with type 1 diabetes.
The runner's active pump profile is "${profile.profileName}" (units: mmol/l).

DATA ANALYSIS FROM THE LAST ${days} DAYS:
Active Profile:
- Scheduled Basal: Total 20.75 U/day, currently scheduled as: 00:00-05:00=1.00 U/h, 05:00-06:00=1.25 U/h, 06:00-08:00=1.50 U/h, 08:00-12:00=1.25 U/h, 12:00-13:00=0.75 U/h, 13:00-23:00=0.50 U/h, 23:00-24:00=0.75 U/h.
- Scheduled IC Ratio: 00:00=6.0 g/U, 10:00=7.5 g/U, 13:00=7.5 g/U, 23:00=8.5 g/U.
- Scheduled ISF: Flat 1.6 mmol/l per U across all 24 hours.

EMPIRICAL FINDINGS:
1. BASAL RATE DRIFT & DELIVERED OFFSETS BY TIME WINDOW:
${JSON.stringify(metrics.basalBlocks, null, 2)}

2. IC RATIO POSTPRANDIAL EXCURSIONS BY MEAL WINDOW:
${JSON.stringify(metrics.mealBlocks, null, 2)}

3. ISF EMPIRICAL DROP & DIURNAL VARIATION:
${JSON.stringify(metrics.isfBlocks, null, 2)}

TASK:
Produce a rigorous, plain-English, supportive clinical audit addressing the runner's exact questions:
1. **Executive Profile Verdict**: Overall health of the "20u standard day" profile.
2. **Basal Scrutiny (Specific focus on 12:00 - 16:00 and Overnight)**: Is basal too high or too low over 12pm to 4pm? Is it too high or low overnight? Cite the net delivered basal offset (what AAPS was forced to do) and the fasting glucose drift rate. Propose exact rate modifications (e.g. adjust from 0.50 to 0.60 U/h).
3. **Insulin-to-Carb (IC) Scrutiny**: Is the IC ratio wrong, and for which meal times of the day (Breakfast vs Lunch vs Dinner)? Cite postprandial excursion numbers and recommend specific g/U adjustments.
4. **Insulin Sensitivity Factor (ISF) & Diurnal Variance**: Is the current flat 1.6 mmol/l/U ISF appropriate across the entire day, or does the runner show significant diurnal variation (e.g. morning resistance vs afternoon/post-exercise sensitivity)? Propose whether to split ISF into diurnal time blocks.
5. **Concrete Action Plan for Fine-Tuning**: A bulleted list of 2-3 safe, conservative parameter tweaks to trial together with their diabetes team.

FORMATTING RULES:
- Use British English (en-GB) and clinical units (mmol/L, U, g).
- Concise, clear markdown with bold headers and bullet points.
- Professional, objective, and constructive tone.
- Include standard clinical safety reminder that changes should be trialled cautiously and discussed with their diabetes clinical care team.`;

  const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({ model: 'gemini-2.5-flash' });
  const text = (await model.generateContent(prompt)).response.text().trim();

  const result = {
    at: Date.now(),
    days,
    profileName: profile.profileName,
    metrics,
    report: text
  };

  setSetting(LAST_EVAL_KEY, JSON.stringify(result));
  return result;
}
