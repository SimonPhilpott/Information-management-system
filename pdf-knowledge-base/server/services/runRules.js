// The numbers in your T1D running rulebook, read from its text so the planner and run learning follow
// whatever the rulebook says now (edit the rulebook and plans change with it). Each rule keeps the exact line
// it came from, so run learning can suggest a change to that line. Anything the rulebook doesn't say (or says
// in words this can't read) falls back to the standard rulebook's value, and is marked as such.
// (Simon, 14 Oct: "make sure the planner and Run learning take into account the Targets and rulebook")
import { getRulebook, DEFAULT_T1D_RULEBOOK } from './t1dRulebookService.js';

const NUM = '(\\d+(?:\\.\\d+)?)';
const DASH = '\\s*(?:–|-|to)\\s*';
const range = (text, unit) => {
  const m = text.match(new RegExp(`${NUM}${DASH}${NUM}\\s*${unit}`, 'i'));
  if (m) return [Number(m[1]), Number(m[2])];
  const one = text.match(new RegExp(`${NUM}\\s*${unit}`, 'i'));
  return one ? [Number(one[1]), Number(one[1])] : null;
};
const bullets = (text) => text.split('\n').map((l) => l.trim()).filter((l) => /^[*-]\s/.test(l));

// "**< 4.0 mmol/L", "**4.0 – 4.9 mmol/L", "**> 15.0 mmol/L" at the start of a bullet
function zoneOf(line) {
  const m = line.match(new RegExp(`^[*-]\\s*\\*\\*\\s*(?:([<>]=?)\\s*${NUM}|${NUM}${DASH}${NUM})\\s*mmol`, 'i'));
  if (!m) return null;
  const label = (line.match(/^[*-]\s*\*\*([^*]+)\*\*/) || [])[1]?.replace(/:\s*$/, '').trim() || '';
  let lo, hi;
  if (m[1]) { const v = Number(m[2]); if (m[1].startsWith('<')) { lo = -Infinity; hi = v; } else { lo = v + 0.05; hi = Infinity; } }
  else { lo = Number(m[3]); hi = Number(m[4]); }
  const t = line;
  const z = { lo, hi, label, line, grams: range(t, 'g\\b(?!\\/)'), gPerKg: (t.match(new RegExp(`${NUM}\\s*g\\/kg`, 'i')) || [])[1] ? Number(t.match(new RegExp(`${NUM}\\s*g\\/kg`, 'i'))[1]) : null };
  if (/do not run/i.test(t)) z.kind = 'do_not_run';
  else if (/ketone/i.test(t)) z.kind = 'ketones';
  else if (/delay/i.test(t)) z.kind = 'delay_and_carbs';
  else if (/without upfront carbs|no upfront carbs|set out immediately/i.test(t)) z.kind = 'go';
  else if (/withhold|safe to start/i.test(t) && !z.grams) z.kind = 'elevated';
  else if (z.grams || z.gPerKg) z.kind = 'carbs_before';
  else z.kind = 'go';
  z.delayMin = /delay/i.test(t) ? range(t, 'min') : null;
  z.leadMin = (t.match(/(\d+)\s*min(?:ute)?s?\s*(?:prior|before)/i) || [])[1] ? Number(t.match(/(\d+)\s*min(?:ute)?s?\s*(?:prior|before)/i)[1]) : null;
  z.resumeAt = (t.match(new RegExp(`(?:>=|≥|reaches)\\s*(?:>=\\s*)?${NUM}\\s*mmol`, 'i')) || [])[1] ? Number(t.match(new RegExp(`(?:>=|≥|reaches)\\s*(?:>=\\s*)?${NUM}\\s*mmol`, 'i'))[1]) : null;
  z.unlessDown = /unless[^.]*down/i.test(t);
  // "If performing anaerobic exercise or HIIT, it is generally safe to start without upfront carbohydrates"
  z.hardNoCarbs = /(anaerobic|HIIT|high[- ]intensity)[^.]*without upfront carb/i.test(t);
  if (z.kind === 'do_not_run' && !z.grams) z.grams = range(t, 'g');
  return z;
}

function parse(text) {
  const lines = bullets(text);
  const find = (re) => lines.find((l) => re.test(l)) || null;
  const out = { zones: [], missing: [] };

  out.zones = lines.map(zoneOf).filter(Boolean).filter((z) => z.lo < 30).sort((a, b) => a.lo - b.lo);

  const sd = find(/single down/i), dd = find(/double down/i), up = find(/single up|double up/i);
  out.trend = {
    singleDown: sd ? { grams: range(sd, 'g'), line: sd } : null,
    doubleDown: dd ? { grams: range(dd, 'g'), delayMin: range(dd, 'min'), line: dd } : null,
    up: up ? { withhold: /withhold/i.test(up), line: up } : null,
  };

  const cap = find(/IOB Safety Cap/i) || find(/starting IOB/i);
  if (cap) {
    const over = cap.match(new RegExp(`(?:>=|≥|over|above)\\s*${NUM}\\s*U`, 'i'));
    const target = cap.match(new RegExp(`IOB\\s*<\\s*${NUM}\\s*U`, 'i'));
    const g = cap.match(new RegExp(`${NUM}${DASH}${NUM}\\s*g`, 'i'));
    out.iobCap = { highIob: over ? Number(over[1]) : null, targetBelow: target ? Number(target[1]) : null, grams: g ? [Number(g[1]), Number(g[2])] : null, line: cap };
  }

  // one fuelling rate, or several: a plain one and ones for longer runs ("For endurance running (>60 minutes)")
  const fuelOf = (fuel) => {
    const rate = fuel.match(new RegExp(`${NUM}${DASH}${NUM}\\s*g\\s*(?:carbs\\s*)?(?:per hour|\\/h)`, 'i'));
    const max = fuel.match(new RegExp(`up to\\s*${NUM}\\s*g\\s*(?:\\/h|per hour)`, 'i'));
    const step = fuel.match(new RegExp(`${NUM}${DASH}${NUM}\\s*g\\s*increments`, 'i'));
    const every = fuel.match(new RegExp(`every\\s*${NUM}${DASH}${NUM}\\s*min`, 'i'));
    const over = fuel.match(/\(\s*(?:>|over|more than)\s*(\d+)\s*min/i);
    return {
      rate: rate ? [Number(rate[1]), Number(rate[2])] : null, max: max ? Number(max[1]) : null,
      step: step ? [Number(step[1]), Number(step[2])] : null, every: every ? [Number(every[1]), Number(every[2])] : null,
      overMin: over ? Number(over[1]) : null, line: fuel,
    };
  };
  const fuels = lines.filter((l) => /fuel(?:l)?ing rate/i.test(l)).map(fuelOf).filter((f) => f.rate);
  out.fuel = fuels.find((f) => f.overMin == null) || fuels[0] || null;
  out.fuelLonger = fuels.filter((f) => f.overMin != null && f !== out.fuel).sort((a, b) => a.overMin - b.overMin);

  const gut = find(/absorption ceiling/i);
  if (gut) { const m = gut.match(new RegExp(`~?${NUM}\\s*g\\s*\\/\\s*h`, 'i')); out.gut = { perHour: m ? Number(m[1]) : null, line: gut }; }

  const fin = find(/finish(?:ing)?\s*line|finishing glucose/i);
  if (fin) { const b = fin.match(new RegExp(`<\\s*${NUM}\\s*mmol`, 'i')); out.finish = { below: b ? Number(b[1]) : null, grams: range(fin, 'g\\s*fast'), line: fin }; if (!out.finish.grams) out.finish.grams = range(fin, 'g'); }

  const tt = find(/temp target/i);
  if (tt) { const r = tt.match(new RegExp(`${NUM}${DASH}${NUM}\\s*mmol`, 'i')); const w = tt.match(new RegExp(`${NUM}${DASH}${NUM}\\s*minutes`, 'i')); out.tempTarget = { range: r ? [Number(r[1]), Number(r[2])] : null, minutes: w ? [Number(w[1]), Number(w[2])] : null, line: tt }; }

  const st = find(/target starting glucose/i);
  if (st) { const r = st.match(new RegExp(`${NUM}${DASH}${NUM}\\s*mmol`, 'i')); const o = st.match(new RegExp(`~\\s*${NUM}`, 'i')); out.startTarget = { range: r ? [Number(r[1]), Number(r[2])] : null, optimal: o ? Number(o[1]) : null, line: st }; }
  return out;
}

const DEFAULTS = parse(DEFAULT_T1D_RULEBOOK);
let cache = { text: null, rules: null };

/** The rules as the rulebook states them now (each falling back to the standard rulebook where unreadable). */
export function getRunRules() {
  const { rulebook, isDefault } = getRulebook();
  if (cache.text === rulebook) return cache.rules;
  const own = parse(rulebook);
  const missing = [];
  const pick = (key, ok) => { if (own[key] && ok(own[key])) return { ...own[key], fromRulebook: true }; missing.push(key); return DEFAULTS[key] ? { ...DEFAULTS[key], fromRulebook: false } : null; };
  const rules = {
    isDefault,
    zones: own.zones.length >= 3 ? own.zones : (missing.push('zones'), DEFAULTS.zones),
    trend: {
      singleDown: own.trend.singleDown?.grams ? own.trend.singleDown : DEFAULTS.trend.singleDown,
      doubleDown: own.trend.doubleDown?.grams ? own.trend.doubleDown : DEFAULTS.trend.doubleDown,
      up: own.trend.up || DEFAULTS.trend.up,
    },
    iobCap: pick('iobCap', (x) => x.highIob != null && x.grams),
    fuel: pick('fuel', (x) => x.rate && x.step),
    gut: pick('gut', (x) => x.perHour != null),
    finish: pick('finish', (x) => x.below != null && x.grams),
    tempTarget: pick('tempTarget', (x) => x.range),
    startTarget: pick('startTarget', (x) => x.range),
  };
  rules.fuel = { ...rules.fuel, every: rules.fuel.every || [20, 30], max: rules.fuel.max || rules.fuel.rate[1] };
  rules.fuelLonger = rules.fuel.fromRulebook ? (own.fuelLonger || []).map((f) => ({ ...f, step: f.step || rules.fuel.step, every: f.every || rules.fuel.every, fromRulebook: true })) : [];
  rules.missing = missing;
  cache = { text: rulebook, rules };
  return rules;
}

// Nightscout arrows -> what the rulebook talks about. A slope (mmol/L per 10 minutes) works too, for past runs.
export function trendKind(trend) {
  if (trend == null || trend === '') return null;
  if (typeof trend === 'number') return trend <= -1.1 ? 'double_down' : trend <= -0.6 ? 'single_down' : trend <= -0.3 ? 'slight_down' : trend >= 0.6 ? 'up' : 'flat';
  const t = String(trend).replace(/[\s_-]/g, '').toLowerCase();
  if (t === 'doubledown' || t === '↓↓') return 'double_down';
  if (t === 'singledown' || t === '↓') return 'single_down';
  if (t === 'fortyfivedown' || t === '↘') return 'slight_down';
  if (t === 'flat' || t === '→') return 'flat';
  if (/up|↑|↗/.test(t)) return 'up';
  return null;
}
export const TREND_WORDS = { double_down: 'falling fast (double down)', single_down: 'falling (single down)', slight_down: 'drifting down (45° down)', flat: 'steady', up: 'rising' };

export const zoneFor = (rules, bg) => {
  let z = null;
  for (const x of rules.zones) if (bg >= x.lo || x.lo === -Infinity) z = x;
  return z;
};
const clampTo = (g, r) => (r ? Math.max(r[0], Math.min(r[1], g)) : g);
const round5 = (x) => Math.round(x / 5) * 5;
const fmtRange = (r, unit = 'g') => (r ? (r[0] === r[1] ? `${r[0]} ${unit}` : `${r[0]}-${r[1]} ${unit}`) : '');

/**
 * What the rulebook says to do before setting off.
 * modelGrams: the carbs the planner's model would want at the start (used to choose within a rulebook range).
 * Returns { zone, grams, leadMin, delayMin, doNotRun, ketones, text: [steps], applied: [rule lines] }.
 */
export function preRunDecision({ startBg, trend = null, iob = 0, weightKg = null, modelGrams = 0, intensity = null, rules = getRunRules() }) {
  const zone = zoneFor(rules, startBg);
  const tk = trendKind(trend);
  const out = { zone: zone ? { label: zone.label, kind: zone.kind, lo: zone.lo, hi: zone.hi } : null, trend: tk, grams: 0, leadMin: null, delayMin: null, doNotRun: false, ketones: false, text: [], applied: [] };
  if (!zone) return out;
  const want = Math.max(0, round5(modelGrams || 0));
  out.applied.push(zone.line);
  const lowZone = zone.kind === 'do_not_run' || zone.kind === 'delay_and_carbs';
  if (zone.kind === 'do_not_run') {
    out.doNotRun = true; out.grams = zone.grams ? zone.grams[1] : 20;
    out.text.push(`Don't set off yet: below ${zone.hi} take ${fmtRange(zone.grams) || '15-20 g'} of fast carbs, recheck in 15-20 minutes${zone.resumeAt ? ` and go once you're at ${zone.resumeAt} or above and steady or rising` : ''}.`);
  } else if (zone.kind === 'delay_and_carbs') {
    const g = zone.gPerKg && weightKg ? round5(zone.gPerKg * weightKg) : clampTo(want || (zone.grams?.[0] ?? 20), zone.grams);
    out.grams = g; out.delayMin = zone.delayMin;
    out.text.push(`At ${zone.label}: wait ${fmtRange(zone.delayMin, 'minutes') || '20-30 minutes'} and take ${g} g${zone.gPerKg ? ` (${zone.gPerKg} g/kg${weightKg ? '' : ', assuming a typical weight - add yours under Targets'})` : ''}, then recheck before you go.`);
  } else if (zone.kind === 'carbs_before' && zone.hardNoCarbs && intensity === 'hard') {
    out.text.push(`At ${zone.label}: a hard session - the rulebook says you can start without carbs (the effort tends to push glucose up).`);
  } else if (zone.kind === 'carbs_before') {
    out.grams = clampTo(want || zone.grams?.[0] || 10, zone.grams); out.leadMin = zone.leadMin;
    out.text.push(`At ${zone.label}: take ${out.grams} g${zone.leadMin ? ` about ${zone.leadMin} minutes before you set off` : ' before you set off'} (rulebook ${fmtRange(zone.grams)}).`);
  } else if (zone.kind === 'go') {
    out.text.push(`At ${zone.label}: set off without carbs first${zone.unlessDown ? ' - unless your glucose is falling' : ''}.`);
  } else if (zone.kind === 'elevated') {
    out.text.push(`At ${zone.label}: safe to start with no carbs, and no correction before you go.`);
  } else if (zone.kind === 'ketones') {
    out.ketones = true;
    out.text.push(`At ${zone.label}: check ketones before running (the rulebook's ketone rule).`);
  }

  // the trend arrow, on top of the zone - for starts up to the green zone (an elevated start has room to fall)
  if (!lowZone && zone.kind !== 'ketones' && zone.kind !== 'elevated') {
    if (tk === 'double_down' && rules.trend.doubleDown) {
      const r = rules.trend.doubleDown;
      out.grams = Math.max(out.grams, (out.grams || 0) + (r.grams?.[1] ?? 20)); out.delayMin = r.delayMin || [15, 20];
      out.applied.push(r.line); out.text.push(`Falling fast (double down): wait ${fmtRange(out.delayMin, 'minutes')}, take ${r.grams ? fmtRange(r.grams) : '20 g'} and let it level off before you go.`);
    } else if ((tk === 'single_down' || (tk === 'slight_down' && zone.unlessDown)) && rules.trend.singleDown) {
      const r = rules.trend.singleDown;
      const extra = tk === 'single_down' ? clampTo(want - out.grams > 0 ? want - out.grams : r.grams?.[0] ?? 10, r.grams) : (r.grams?.[0] ?? 10);
      out.grams += extra; out.applied.push(r.line);
      out.text.push(tk === 'single_down' ? `Falling (single down): ${extra} g more before you set off (rulebook ${fmtRange(r.grams)} extra).` : `Drifting down (45° arrow): ${extra} g before you set off - the rulebook's "unless falling", at the low end of its single-down amount.`);
    } else if (tk === 'up' && rules.trend.up?.withhold && out.grams && zone.kind === 'carbs_before') {
      out.applied.push(rules.trend.up.line);
      out.text.push(`Rising: the rulebook says hold the start carbs (${out.grams} g) and check again 15-20 minutes in.`);
      out.grams = 0;
    }
  }

  // lots of insulin on board: front-load at the start
  const cap = rules.iobCap;
  if (!out.doNotRun && cap?.highIob != null && iob >= cap.highIob && cap.grams) {
    const g = clampTo(Math.max(want, out.grams), cap.grams);
    if (g > out.grams) { out.text.push(`${iob} U on board (${cap.highIob} U or more): front-load ${g} g at the start (rulebook ${fmtRange(cap.grams)}).`); out.grams = g; }
    out.applied.push(cap.line);
  } else if (cap?.targetBelow != null && iob >= cap.targetBelow && !out.doNotRun) {
    out.text.push(`${iob} U on board - the rulebook aims for under ${cap.targetBelow} U at the start, so expect an earlier drop.`);
  }
  out.grams = Math.round(out.grams);
  return out;
}

/** In-run stop sizes and the hourly ceiling the planner keeps to. */
export function fuelLimits(rules = getRunRules(), { iob = 0, durationMin = 60 } = {}) {
  // the rate for this length of run: a longer-run rate once the run is past its threshold
  const longer = (rules.fuelLonger || []).filter((x) => durationMin > x.overMin).pop();
  const f = longer ? { ...longer, max: Math.max(longer.max || 0, rules.fuel.max || 0, longer.rate[1]) } : rules.fuel;
  const high = (rules.iobCap?.highIob != null && iob >= rules.iobCap.highIob) || durationMin > 90;
  const perHour = high ? f.max : Math.max(f.rate[1], Math.min(f.max, rules.gut?.perHour || f.rate[1]));
  // stop size: the rulebook's increments, a little larger only when the hourly rate can't be met with them
  const stepMax = Math.max(f.step[1], Math.min(30, round5((perHour * (f.every[0] || 20)) / 60)));
  return { stepMin: f.step[0], stepMax: high ? stepMax : f.step[1], perHour, rate: f.rate, every: f.every, line: f.line, forLonger: longer ? longer.overMin : null };
}

// ---- editing a rule's numbers (for suggestions from your runs: the planner reads the new numbers back) ----
const num1 = (x) => (Number.isInteger(x) ? `${x}.0` : String(x));
/** "**5.0 – 6.9 mmol/L" -> "**5.0 – 7.4 mmol/L" */
export function editZoneBounds(line, lo, hi) {
  return line.replace(new RegExp(`^([*-]\\s*\\*\\*\\s*)${NUM}(\\s*(?:–|-)\\s*)${NUM}`), (_, a, _lo, d) => `${a}${num1(lo)}${d}${num1(hi)}`);
}
/** the first carb amount in a line ("~10 g", "10–15 g") -> a new amount or range */
export function editFirstGrams(line, lo, hi) {
  return line.replace(new RegExp(`~?${NUM}(?:${DASH}${NUM})?\\s*g\\b(?!\\/)`), lo === hi ? `${lo} g` : `${lo}–${hi} g`);
}
/** "30–60 g carbs per hour" -> new range */
export function editRate(line, lo, hi) {
  return line.replace(new RegExp(`${NUM}${DASH}${NUM}(\\s*g\\s*(?:carbs\\s*)?(?:per hour|\\/h))`, 'i'), (_, _a, _b, rest) => `${lo}–${hi}${rest}`);
}
/** "< 6.0 mmol/L" -> "< 6.5 mmol/L" */
export function editBelow(line, v) {
  return line.replace(new RegExp(`<\\s*${NUM}(\\s*mmol)`, 'i'), (_, _v, rest) => `< ${num1(v)}${rest}`);
}
