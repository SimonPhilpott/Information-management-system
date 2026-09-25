import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWeather } from './weatherService.js';
import { getItemsDueToday } from './remindersService.js';
import { getUpcomingBirthdays } from './birthdayService.js';
import { getTodayReleases } from './musicScanService.js';
import { identifyPeopleInView } from './lookService.js';
import { getUpcomingEvents, getEventsOn, describeEvents } from './calendarService.js';
import { getStatus as getStravaStatus, getSummary, listActivities } from './stravaService.js';
import { getCurrentState, getStoredMatch } from './runGlucoseService.js';
import { listGoals, assessGoal } from './goalService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, '..', 'data', 'morning_report_state.json');

const londonPartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
});
function londonNow() {
  const parts = Object.fromEntries(londonPartsFormatter.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { dateStr: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function readState() {
  try {
    if (fs.existsSync(STATE_PATH)) return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch (_) { /* fall through */ }
  return { lastOfferedDate: null };
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

// True only for the FIRST hardware session that starts on a given London
// calendar day - checked (and immediately marked, so it never fires twice)
// when a hardware WS connection is established. Deliberately not gated by
// time of day ("morning") beyond that - if the first interaction of the day
// happens to be at 3pm, that's still the user's "first thing today".
export function isFirstInteractionToday() {
  const { dateStr } = londonNow();
  return readState().lastOfferedDate !== dateStr;
}

export function markMorningReportOffered() {
  const { dateStr } = londonNow();
  writeState({ lastOfferedDate: dateStr });
}

const RUN_SPORTS = ['Run', 'TrailRun', 'VirtualRun'];
const paceText = (minPerKm) => { const m = Math.floor(minPerKm); return `${m}:${String(Math.round((minPerKm - m) * 60)).padStart(2, '0')}/km`; };

// Glucose right now, how training is trending, the last run and goal progress. Anything without
// data is left out, and no insulin advice is ever given.
function buildHealthParts(rainPct) {
  const out = [];

  try {
    if (getStravaStatus().connected) {
      const cur = getCurrentState();
      if (cur.bg != null && cur.bgFresh) {
        const trend = cur.direction ? `, trend ${cur.direction}` : '';
        const iob = cur.iob != null ? `, ${cur.iob} units insulin on board` : '';
        let note = '';
        if (cur.bg < 4) note = ' - that is low; suggest treating it before anything else';
        else if (cur.bg < 5.5) note = ' - on the low side; worth having something before any run';
        else if (cur.bg > 13) note = ' - running high';
        out.push(`Glucose right now: ${cur.bg} mmol/L${trend}${iob}${note}. If they mention running today, their usual aim is to start around 9 and never drop below 5.`);
      }

      const s = getSummary();
      const w = s.periods.last7, pw = w.previous;
      if (w.count > 0 || pw.count > 0) {
        const bits = [`${w.count} activities and ${w.distanceKm} km in the last 7 days (${pw.count} and ${pw.distanceKm} km the 7 before)`];
        if (w.runKm > 0 && pw.runKm > 0 && pw.runKm >= 3) {
          const pct = Math.round(((w.runKm - pw.runKm) / pw.runKm) * 100);
          if (pct > 25) bits.push(`running distance is up ${pct}% - a fair jump, so an easier day could be sensible`);
          else if (pct < -40) bits.push(`running is down ${Math.abs(pct)}% on the week before`);
        }
        if (w.paceMinKm && pw.paceMinKm) {
          const diff = pw.paceMinKm - w.paceMinKm;
          if (Math.abs(diff) >= 0.1) bits.push(`average running pace ${paceText(w.paceMinKm)}, ${diff > 0 ? 'faster' : 'slower'} than the week before`);
        }
        out.push(`Training: ${bits.join('; ')}.`);
      }

      const last = listActivities({ limit: 20 }).activities.find((a) => RUN_SPORTS.includes(a.sport));
      if (last) {
        const days = Math.round((Date.parse(`${londonNow().dateStr}T00:00:00Z`) - Date.parse(`${last.day}T00:00:00Z`)) / 86400000);
        if (days <= 5) {
          let line = `Last run: ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}, ${(last.distance / 1000).toFixed(1)} km at ${paceText(last.moving_time / 60 / (last.distance / 1000))}`;
          try {
            const m = getStoredMatch(last.id);
            if (m && m.status === 'ok' && m.stats) {
              line += `; glucose started ${m.stats.bgStart}, lowest ${m.stats.bgMin} mmol/L${m.stats.hypoWithin2h ? ' and dipped low within two hours afterwards' : ''}`;
            }
          } catch (_) { /* no glucose match */ }
          out.push(line + '.');
        } else if (days >= 6) {
          out.push(`No run for ${days} days.`);
        }
      }

      for (const g of listGoals().slice(0, 2)) {
        try {
          const a = assessGoal(g);
          out.push(`Goal "${g.name || `${g.distanceKm} km`}"${g.targetDate ? ` (by ${g.targetDate})` : ''}: ${a.verdict}${a.weeksLeft != null ? ` ${a.weeksLeft} weeks left.` : ''}`);
        } catch (_) { /* goal not assessable */ }
      }
    }
  } catch (err) {
    console.warn('[MorningReport] Strava/glucose data skipped:', err.message);
  }

  if (out.length && rainPct != null && rainPct >= 50) out.push('Rain is likely today, so if a run is planned it may need to fit around the weather.');
  return out;
}

// Builds the system-prompt directive injected only into the first session of
// the day - a proactive offer plus the actual content to deliver if the user
// says yes, so Gemini doesn't need a second round-trip/tool-call to fetch it.
export async function buildMorningReportDirective() {
  const parts = [];
  let weatherRain = null;

  // Face recognition (local): if the camera has a fresh view of someone enrolled
  // on /ims/faces, greet them by name. No fresh frame, or no known face, simply
  // adds nothing - IMS never guesses who it's talking to.
  let whoLine = '';
  try {
    const who = await identifyPeopleInView();
    if (who && who.names.length) {
      whoLine = `The camera recognises ${who.names.join(' and ')} in front of you - greet them by name in your welcome and address the report to them. `;
    } else if (who && who.unknownCount > 0) {
      whoLine = "The camera can see someone it doesn't recognise - don't assume who it is; greet as normal. ";
    }
  } catch (err) {
    console.warn('[MorningReport] Face recognition skipped:', err.message);
  }

  try {
    const weather = await getWeather({});
    if (weather.today) {
      const t = weather.today;
      weatherRain = t.rain_probability_percent;
      parts.push(
        `Weather: ${t.condition}, ${t.min_temp_c}-${t.max_temp_c}°C, ${t.rain_probability_percent}% chance of rain` +
        (t.rain_probability_percent >= 40 ? ' (worth mentioning it could turn wet later)' : '') + '.'
      );
    } else if (weather.error) {
      parts.push(`Weather: unavailable right now (${weather.error}).`);
    }
  } catch (err) {
    parts.push('Weather: could not be retrieved.');
  }

  const dueToday = getItemsDueToday();
  if (dueToday.length > 0) {
    const desc = dueToday.map((i) => `${i.type} "${i.label || 'unlabelled'}" at ${new Date(i.fireAt).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })}`);
    parts.push(`Scheduled today: ${desc.join('; ')}.`);
  } else {
    parts.push('Nothing else scheduled for today.');
  }

  try {
    await getUpcomingEvents(1); // refreshes the cache if stale
    const today = getEventsOn(londonNow().dateStr);
    if (today.length > 0) parts.push(`Calendar today: ${describeEvents(today).join('; ')}.`);
  } catch (err) {
    console.warn('[MorningReport] Calendar skipped:', err.message);
  }

  const birthdays = getUpcomingBirthdays();
  if (birthdays.length > 0) {
    const desc = birthdays.map((b) => b.isToday ? `${b.name}'s birthday is TODAY${b.turningAge ? ` (turning ${b.turningAge})` : ''}` : `${b.name}'s birthday is in ${b.daysUntil} day(s)`);
    parts.push(`Birthdays: ${desc.join('; ')}.`);
  }

  const releases = getTodayReleases();
  if (releases.length > 0) {
    const desc = releases.map((r) => `${r.artist} - "${r.title}" (${r.type})`);
    parts.push(`New music out today from artists in the library: ${desc.join('; ')}.`);
  }

  try { parts.push(...buildHealthParts(weatherRain)); } catch (err) { console.warn('[MorningReport] Health/training skipped:', err.message); }

  const join = parts.length > 3 ? " Where two items connect (rain and a run, a busy calendar and a pod change, a birthday and a free evening), point that out in a short clause rather than reading the list flat; keep the whole report brief and skip anything that isn't useful." : '';
  return whoLine + "This is the user's first interaction with you today. Before anything else, warmly offer their morning report as part of your greeting (e.g. \"fancy your morning report?\") - keep the offer itself brief, one sentence. Only deliver the actual details below if they say yes; otherwise proceed normally. Morning report contents: " + parts.join(' ') + join;
}
