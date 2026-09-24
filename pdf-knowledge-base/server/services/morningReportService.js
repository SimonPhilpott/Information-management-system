import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWeather } from './weatherService.js';
import { getItemsDueToday } from './remindersService.js';
import { getUpcomingBirthdays } from './birthdayService.js';
import { getTodayReleases } from './musicScanService.js';
import { identifyPeopleInView } from './lookService.js';
import { getUpcomingEvents, getEventsOn, describeEvents } from './calendarService.js';

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

// Builds the system-prompt directive injected only into the first session of
// the day - a proactive offer plus the actual content to deliver if the user
// says yes, so Gemini doesn't need a second round-trip/tool-call to fetch it.
export async function buildMorningReportDirective() {
  const parts = [];

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

  return whoLine + "This is the user's first interaction with you today. Before anything else, warmly offer their morning report as part of your greeting (e.g. \"fancy your morning report?\") - keep the offer itself brief, one sentence. Only deliver the actual details below if they say yes; otherwise proceed normally. Morning report contents: " + parts.join(' ');
}
