import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWeather } from './weatherService.js';
import { getItemsDueToday } from './remindersService.js';
import { getUpcomingBirthdays } from './birthdayService.js';
import { getTodayReleases, getWants } from './musicScanService.js';
import { identifyPeopleInView } from './lookService.js';
import { getUpcomingEvents, getEventsOn, describeEvents } from './calendarService.js';
import { getStatus as getStravaStatus, getSummary, listActivities } from './stravaService.js';
import { getCurrentState, getStoredMatch } from './runGlucoseService.js';
import { listGoals, assessGoal } from './goalService.js';
import { getOvernight, getNightscoutDbSize, getNightscoutWriteStatus } from './glucoseHubService.js';
import { getReportNews, tourNewsForReport } from './newsService.js';
import { unreportedTasks } from './tasksService.js';

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
  const { dateStr, hour } = londonNow();
  // Not before 5am: an overnight reconnect must not use up the day's offer.
  return hour >= 5 && readState().lastOfferedDate !== dateStr;
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

      try {
        const n = getOvernight();
        if (n) out.push(`Overnight: ${n.inRangePct}% in range, lowest ${n.min}${n.lows ? `, ${n.lows} low spell${n.lows > 1 ? 's' : ''}` : ''}, woke at ${n.endValue} mmol/L.`);
      } catch (_) { /* no overnight data */ }

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

// Everything in the report, as short plain lines. Used for the first-of-the-day offer and by
// the getDayReport tool, so it can be asked for at any time ("morning report", "day report").
export async function buildReportParts() {
  const parts = [];
  const hour = londonNow().hour;
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
    await getUpcomingEvents(2); // refreshes the cache if stale
    const todayStr = londonNow().dateStr;
    const nowHm = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
    const today = getEventsOn(todayStr).filter((e) => hour < 11 || !e.time || e.time >= nowHm);
    parts.push(today.length > 0 ? `Calendar ${hour < 11 ? 'today' : 'for the rest of today'}: ${describeEvents(today).join('; ')}.` : `Calendar: nothing ${hour < 11 ? 'today' : 'else today'}.`);
    if (hour >= 16) {
      const t = new Date(Date.parse(`${todayStr}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
      const tomorrow = getEventsOn(t);
      if (tomorrow.length) parts.push(`Calendar tomorrow: ${describeEvents(tomorrow).join('; ')}.`);
    }
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
    let wanted = new Set();
    try { wanted = new Set(getWants().map((w) => `${w.artist}|${w.title}`.toLowerCase())); } catch (_) { /* none */ }
    const desc = releases.map((r) => `${r.artist} - "${r.title}" (${r.type})${wanted.has(`${r.artist}|${r.title}`.toLowerCase()) ? ' - ON THEIR WANT LIST, so lead with this one' : ''}`);
    parts.push(`New music out today from artists in the library: ${desc.join('; ')}.`);
  }

  try { parts.push(...buildHealthParts(weatherRain)); } catch (err) { console.warn('[MorningReport] Health/training skipped:', err.message); }

  try {
    const tours = await tourNewsForReport();
    if (tours.length) parts.push(`UK TOUR NEWS for bands in their music library (lead the news with these; Leeds, Sheffield, Manchester or York matter most, then the rest of the north; London is only a maybe - say where they're playing): ${tours.map((t) => `[${t.artist}, playing ${t.places.join(', ')}] ${t.headline}`).join(' | ')}.`);
    const news = await getReportNews();
    if (news.length) parts.push(`News and interests (from their chosen sources; importance 1-5 is how much each source matters to them - lead with and give more time to the higher ones, say which source): ${news.map((n) => `[${n.source}, importance ${n.importance}${n.alsoIn ? `; also covered by ${n.alsoIn.join(', ')}` : ''}] ${n.headline}${n.summary ? ` - ${n.summary}` : ''}`).join(' | ')}.`);
  } catch (err) { console.warn('[MorningReport] News skipped:', err.message); }

  try {
    const done = unreportedTasks();
    if (done.length) parts.push(`BACKGROUND TASKS FINISHED since they last heard (give each a sentence or two): ${done.map((t) => `"${t.title}": ${t.summary}`).join(' | ')}`);
  } catch (err) { console.warn('[MorningReport] Tasks skipped:', err.message); }

  // Nightscout's database nearly full: the report ends by offering to clear it out.
  try {
    const db = await getNightscoutDbSize();
    if (db && db.pct > 90) {
      const connected = getNightscoutWriteStatus().configured;
      parts.push(connected
        ? `LAST ITEM - Nightscout database: ${db.pct.toFixed(1)}% full (${db.usedMb} of ${db.maxMb} MB). END the report by asking whether to clear it out, in your own words - e.g. "Shall I clear out your Mongo database? It's nearly full." If they say yes, call clearOldNightscoutData; if they say no, leave it.`
        : `LAST ITEM - Nightscout database: ${db.pct.toFixed(1)}% full. End by mentioning it's nearly full, and that you can clear it out once Nightscout is connected on the Blood Sugar page.`);
    }
  } catch (err) { console.warn('[MorningReport] DB size skipped:', err.message); }

  return { whoLine, parts, hour };
}

const DELIVERY = "HOW TO DELIVER IT - IN YOUR YORKSHIRE ACCENT FROM THE FIRST WORD TO THE LAST (long reports are where it slips; hold the flat northern vowels and never sound an r after a vowel): this report is the one exception to your usual length limit - cover EVERY item below, in this order, as a flowing spoken briefing of roughly 8 to 14 sentences. Don't read it like a list: link items where they connect (rain and a run, a low overnight and a planned run, a busy afternoon and a pod change). Give the news as three or four quick headlines in your own words, mixing sources; each story is listed once, so never repeat a story or tell it twice in different words. Never give insulin doses. ";

// The first conversation of the day: offer the report, with its contents ready.
export async function buildMorningReportDirective() {
  const { whoLine, parts, hour } = await buildReportParts();
  const name = hour < 12 ? 'morning report' : 'day report';
  return whoLine + `This is the user's first conversation with you today. As part of your greeting, briefly offer their ${name} in one short sentence. Only deliver it if they say yes; otherwise carry on normally. ` + DELIVERY + 'CONTENTS: ' + parts.join(' ');
}

// For the getDayReport tool, any time of day.
export async function getDayReport() {
  const { whoLine, parts, hour } = await buildReportParts();
  return { report: parts, instructions: whoLine + DELIVERY + (hour >= 16 ? 'It is later in the day, so frame it as a day report / evening round-up and include tomorrow where given.' : '') };
}
