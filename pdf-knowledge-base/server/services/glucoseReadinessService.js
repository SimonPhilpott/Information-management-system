import { getCurrentState } from './runGlucoseService.js';
import { getTargets } from './runPlanService.js';
import { getRulebook } from './t1dRulebookService.js';

/**
 * Evaluates real-time pre-run readiness combining current CGM, trend arrow,
 * active IOB, recent carbs, and the planned session parameters.
 *
 * @param {Object} params
 * @param {number} [params.bg] Current blood glucose (mmol/L) - defaults to live Nightscout
 * @param {string} [params.direction] Trend direction (Flat, SingleUp, SingleDown, DoubleDown, etc.)
 * @param {number} [params.iob] Active Insulin on Board (U)
 * @param {number} [params.cob] Carbs on Board (g)
 * @param {string} [params.sessionType] 'aerobic' | 'tempo' | 'intervals' | 'hills' | 'long_run'
 * @param {number} [params.durationMin] Planned session duration in minutes (e.g. 45)
 * @param {number} [params.distanceKm] Planned distance in km
 * @param {string} [params.intensity] 'easy' | 'steady' | 'hard'
 */
export function evaluateGlucoseReadiness(params = {}) {
  const live = getCurrentState();
  const targets = getTargets();
  const { rulebook } = getRulebook();

  const bg = Number.isFinite(params.bg) ? Number(params.bg) : (live.bg ?? 8.5);
  const direction = params.direction || live.direction || 'Flat';
  const iob = Number.isFinite(params.iob) ? Number(params.iob) : (live.iob ?? 0.4);
  const cob = Number.isFinite(params.cob) ? Number(params.cob) : (live.cob ?? 0);
  const durationMin = Number(params.durationMin) || 45;
  const sessionType = params.sessionType || 'aerobic';
  const intensity = params.intensity || (sessionType === 'intervals' || sessionType === 'hills' ? 'hard' : 'steady');

  const floor = targets.floor || 5.0;
  const launchTarget = targets.startTarget || 9.0;
  const isFresh = live.bgFresh !== false;

  let status = 'go'; // 'go' | 'eat_first' | 'wait'
  let statusTitle = 'Prime Launch Window (GO)';
  let color = 'emerald';
  let recommendedCarbsGrams = 0;
  let delayMinutes = 0;
  const advisoryBullets = [];

  // 1. Hypoglycemia & Urgent Lows (< 4.0 mmol/L)
  if (bg < 4.0) {
    status = 'wait';
    statusTitle = 'Hypoglycemia Danger - DO NOT RUN (WAIT)';
    color = 'rose';
    recommendedCarbsGrams = 20;
    delayMinutes = 20;
    advisoryBullets.push('Blood glucose is below 4.0 mmol/L. Ingest 15–20 g of rapid-acting carbs immediately.');
    advisoryBullets.push('Wait 15–20 minutes and re-test. Only depart once glucose >= 5.5 mmol/L with a stable trajectory.');
  }
  // 2. Sub-Optimal Low (4.0 - 4.9 mmol/L)
  else if (bg < 5.0) {
    status = 'eat_first';
    statusTitle = 'Sub-Optimal Low (EAT & WAIT)';
    color = 'amber';
    recommendedCarbsGrams = 18;
    delayMinutes = 20;
    advisoryBullets.push('ISPAD 2022: Ingest 0.3 g/kg fast carbs (~18 g) and delay start 20–30 minutes.');
    advisoryBullets.push('Recheck CGM trend before setting out to confirm upward inflection.');
  }
  // 3. Low Normal (5.0 - 6.9 mmol/L)
  else if (bg < 7.0) {
    status = 'eat_first';
    statusTitle = 'Low Normal Buffer Required (EAT FIRST)';
    color = 'amber';
    recommendedCarbsGrams = 12;
    delayMinutes = 5;
    advisoryBullets.push('Take 10–15 g rapid carbs 5–10 minutes prior to departure to buffer against initial exercise drop.');
  }
  // 4. Optimal Green Zone (7.0 - 10.0 mmol/L)
  else if (bg <= 10.0) {
    status = 'go';
    statusTitle = 'Optimal Launch Zone (GO)';
    color = 'emerald';
    recommendedCarbsGrams = 0;
    delayMinutes = 0;
    advisoryBullets.push(`Prime running window (~${bg} mmol/L). Set out immediately without upfront carbs.`);
  }
  // 5. Elevated Safe (10.1 - 15.0 mmol/L)
  else if (bg <= 15.0) {
    status = 'go';
    statusTitle = 'Elevated Safe Window (GO)';
    color = 'emerald';
    recommendedCarbsGrams = 0;
    delayMinutes = 0;
    advisoryBullets.push('Safe to start. Withhold corrective meal boluses; aerobic uptake will naturally lower blood glucose.');
  }
  // 6. Hyperglycemia & Ketone Alert (> 15.0 mmol/L)
  else {
    status = 'wait';
    statusTitle = 'Hyperglycemia - Check Ketones (WAIT)';
    color = 'rose';
    recommendedCarbsGrams = 0;
    delayMinutes = 15;
    advisoryBullets.push('Mandatory blood/urine ketone test. If blood ketones >= 1.5 mmol/L, DO NOT exercise.');
    advisoryBullets.push('If ketones < 0.6 mmol/L, proceed with light aerobic running only; avoid high-intensity intervals.');
  }

  // Trend Arrow Adjustments
  if (direction.includes('Down') || direction === 'SingleDown') {
    if (status === 'go' && bg < 8.5) {
      status = 'eat_first';
      statusTitle = 'Falling Trend Buffer (EAT FIRST)';
      color = 'amber';
    }
    recommendedCarbsGrams += 10;
    advisoryBullets.push(`CGM trend is dropping (${direction}): add +10 g buffer carbs.`);
  } else if (direction === 'DoubleDown') {
    status = 'wait';
    statusTitle = 'Rapid Drop Detected (WAIT)';
    color = 'rose';
    recommendedCarbsGrams += 15;
    delayMinutes = Math.max(delayMinutes, 15);
    advisoryBullets.push('Rapid double downward drop (↓↓): delay departure 15m; take fast carbs and await stabilization.');
  }

  // High IOB Warning
  if (iob >= 1.5) {
    advisoryBullets.push(`Active IOB is high (${iob} U). Microvascular blood flow will amplify insulin potency 1.5x-2.0x. Expect rapid drops.`);
    if (recommendedCarbsGrams === 0 && bg < 9.0) {
      recommendedCarbsGrams = 15;
      if (status === 'go') {
        status = 'eat_first';
        statusTitle = 'High IOB Fuel Buffer (EAT FIRST)';
        color = 'amber';
      }
    }
  }

  // High Intensity / VO2 Max Coaching
  if (intensity === 'hard' || sessionType === 'intervals' || sessionType === 'hills') {
    advisoryBullets.push('High-intensity VO2 Max / Anaerobic effort: catecholamines may provoke an initial hepatic glucose spike. Do not over-fuel during early surges.');
  }

  return {
    status,
    statusTitle,
    color,
    currentBg: bg,
    direction,
    iob,
    cob,
    isFresh,
    sessionType,
    durationMin,
    intensity,
    targetLaunchBg: launchTarget,
    floorBg: floor,
    recommendedCarbsGrams,
    delayMinutes,
    advisoryBullets,
    evaluatedAt: Date.now()
  };
}
