import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWeather } from './weatherService.js';
import { getItemsDueToday, getItemsComingUp } from './remindersService.js';
import { listBirthdays } from './birthdayService.js';
import { getTodayReleases, getWants } from './musicScanService.js';
import { identifyPeopleInView } from './lookService.js';
import { getUpcomingEvents, getEventsOn, describeEvents, getDeviceIcons } from './calendarService.js';
import { getStatus as getStravaStatus, getSummary, listActivities } from './stravaService.js';
import { getCurrentState, getStoredMatch } from './runGlucoseService.js';
import { listGoals, assessGoal } from './goalService.js';
import { getOvernight, getNightscoutDbSize, getNightscoutWriteStatus } from './glucoseHubService.js';
import { getReportNews, tourNewsForReport } from './newsService.js';
import { unreportedTasks } from './tasksService.js';
import { recentCampaignGames } from './campaignsService.js';
import { getSetting, setSetting } from '../db/database.js';

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

export const AVAILABLE_SERVICES = [
  { id: 'standalone', name: 'Custom / Standalone Note', description: 'User-defined prompt or reminder without a backend service' },
  { id: 'weather', name: 'Weather Service', description: 'Open-Meteo local forecast, temperatures, and rain' },
  { id: 'reminders', name: 'Reminders & Alarms', description: 'Scheduled alarms, timers, and reminder lists' },
  { id: 'calendar', name: 'Google Calendar', description: 'Google Calendar events, schedules, and meetings' },
  { id: 'birthdays', name: 'Birthday Service', description: 'Upcoming family and friend birthdays' },
  { id: 'music_scan', name: 'Music Scanner', description: 'MusicBrainz release radar and wanted vinyl/albums' },
  { id: 'campaigns', name: 'Campaigns & Boardgames', description: 'Arkham Horror & LOTR campaign logs with Daniel' },
  { id: 'glucose', name: 'Nightscout CGM & Glucose Hub', description: 'Live glucose, trend, IOB, and overnight stats' },
  { id: 'device_status', name: 'Omnipod & Sensor Status', description: 'Pod and sensor change schedules and prescription alerts' },
  { id: 'strava', name: 'Strava Training', description: 'Strava activities, weekly miles, pace comparisons' },
  { id: 'goals', name: 'Goals Service', description: 'Active mileage, running, and fitness targets' },
  { id: 'news', name: 'News & Tour Announcements', description: 'RSS feeds and UK tour announcements' },
  { id: 'tasks', name: 'Background Tasks', description: 'Completed automated background jobs' },
  { id: 'memories', name: 'IMS Memories', description: 'Personal memory vault and recorded facts' }
];

export const DEFAULT_REPORT_SECTIONS = [
  {
    id: 'weather',
    type: 'builtin',
    title: 'Weather Forecast',
    serviceId: 'weather',
    serviceName: 'Weather Service',
    description: "Today's forecast, temperatures, and rain probability.",
    enabled: true,
    customNote: ''
  },
  {
    id: 'reminders',
    type: 'builtin',
    title: 'Scheduled Reminders & Alarms',
    serviceId: 'reminders',
    serviceName: 'Reminders & Alarms',
    description: "Today's and this week's scheduled alarms, timers, and reminders.",
    enabled: true,
    customNote: ''
  },
  {
    id: 'calendar',
    type: 'builtin',
    title: 'Calendar Events',
    serviceId: 'calendar',
    serviceName: 'Google Calendar',
    description: "Today's and tomorrow's upcoming calendar events and meetings.",
    enabled: true,
    customNote: ''
  },
  {
    id: 'birthdays',
    type: 'builtin',
    title: 'Birthdays',
    serviceId: 'birthdays',
    serviceName: 'Birthday Service',
    description: 'Upcoming birthdays for family and friends within the next 14 days.',
    enabled: true,
    customNote: ''
  },
  {
    id: 'music_releases',
    type: 'builtin',
    title: 'Music Releases & Wants',
    serviceId: 'music_scan',
    serviceName: 'Music Scanner',
    description: 'New releases today from artists in your library and want-list matches.',
    enabled: true,
    customNote: ''
  },
  {
    id: 'card_games',
    type: 'builtin',
    title: 'Card Game Campaigns',
    serviceId: 'campaigns',
    serviceName: 'Campaigns & Boardgames',
    description: 'Recent Arkham Horror and Lord of the Rings campaign games with Daniel.',
    enabled: true,
    customNote: ''
  },
  {
    id: 'glucose_now',
    type: 'builtin',
    title: 'Live Blood Glucose & IOB',
    serviceId: 'glucose',
    serviceName: 'Nightscout CGM',
    description: 'Current glucose reading, directional trend, and insulin on board.',
    enabled: true,
    customNote: ''
  },
  {
    id: 'glucose_overnight',
    type: 'builtin',
    title: 'Overnight Glucose Summary',
    serviceId: 'glucose',
    serviceName: 'Glucose Hub',
    description: 'Overnight percentage time-in-range, lowest reading, hypo spells, and waking level.',
    enabled: true,
    customNote: ''
  },
  {
    id: 'device_changes',
    type: 'builtin',
    title: 'Omnipod & Sensor Device Status',
    serviceId: 'device_status',
    serviceName: 'Device Management',
    description: 'Summarises whether an Omnipod or CGM sensor change or warmup is due today or tomorrow.',
    enabled: true,
    customNote: ''
  },
  {
    id: 'training',
    type: 'builtin',
    title: 'Training & Weekly Mileage',
    serviceId: 'strava',
    serviceName: 'Strava Service',
    description: 'Last 7 days mileage, activity count, and running pace compared to the previous week.',
    enabled: true,
    customNote: ''
  },
  {
    id: 'last_run',
    type: 'builtin',
    title: 'Last Run & Glucose Response',
    serviceId: 'strava',
    serviceName: 'Strava & Nightscout',
    description: 'Distance and pace of most recent run, plus starting and lowest glucose during the run.',
    enabled: true,
    customNote: ''
  },
  {
    id: 'goals',
    type: 'builtin',
    title: 'Fitness & Running Goals',
    serviceId: 'goals',
    serviceName: 'Goals Service',
    description: 'Progress and current assessment towards active running and distance goals.',
    enabled: true,
    customNote: ''
  },
  {
    id: 'tours',
    type: 'builtin',
    title: 'UK Tour News',
    serviceId: 'news',
    serviceName: 'News Service',
    description: 'Tour dates for library artists (prioritising Leeds, Sheffield, Manchester, York).',
    enabled: true,
    customNote: ''
  },
  {
    id: 'news',
    type: 'builtin',
    title: 'Curated News & Interests',
    serviceId: 'news',
    serviceName: 'News Service',
    description: 'Headlines from preferred feeds, ordered by personal importance rating.',
    enabled: true,
    customNote: ''
  },
  {
    id: 'tasks',
    type: 'builtin',
    title: 'Completed Background Tasks',
    serviceId: 'tasks',
    serviceName: 'Tasks Service',
    description: 'Brief overview of any automated background tasks finished since last report.',
    enabled: true,
    customNote: ''
  },
  {
    id: 'nightscout_db',
    type: 'builtin',
    title: 'Nightscout Database Size Alert',
    serviceId: 'glucose',
    serviceName: 'Nightscout Database',
    description: 'Alerts if MongoDB usage is above 90% and offers to clear older records.',
    enabled: true,
    customNote: ''
  }
];

export function getReportConfig() {
  try {
    const raw = getSetting('morning_report_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const existingIds = new Set(parsed.map((s) => s.id));
        const merged = parsed.map((s) => {
          let customNote = s.customNote || '';
          if (s.id !== 'tours' && /focus on leeds|sheffield gigs/i.test(customNote)) {
            customNote = '';
          }
          return { ...s, customNote };
        });
        for (const def of DEFAULT_REPORT_SECTIONS) {
          if (!existingIds.has(def.id)) {
            merged.push({ ...def });
          }
        }
        return merged;
      }
    }
  } catch (err) {
    console.warn('[MorningReport] Failed to load custom report config, using defaults:', err.message);
  }
  return DEFAULT_REPORT_SECTIONS.map((s) => ({ ...s }));
}

export function saveReportConfig(sections) {
  if (!Array.isArray(sections)) throw new Error('Sections must be an array');
  // Sanitize sections
  const cleaned = sections.map((s, idx) => {
    let customNote = String(s.customNote || '').trim();
    if (s.id !== 'tours' && /focus on leeds|sheffield gigs/i.test(customNote)) {
      customNote = '';
    }
    return {
      id: s.id || `custom_${Date.now()}_${idx}`,
      type: s.type === 'custom' ? 'custom' : 'builtin',
      title: String(s.title || '').trim() || 'Untitled Subject',
      serviceId: s.serviceId || 'standalone',
      serviceName: s.serviceName || (AVAILABLE_SERVICES.find(srv => srv.id === s.serviceId)?.name || 'Custom'),
      description: String(s.description || '').trim(),
      enabled: s.enabled !== false,
      customNote,
      content: String(s.content || '').trim()
    };
  });

  setSetting('morning_report_config', JSON.stringify(cleaned));
  return getReportConfig();
}

export function resetReportConfig() {
  setSetting('morning_report_config', JSON.stringify(DEFAULT_REPORT_SECTIONS));
  return DEFAULT_REPORT_SECTIONS.map((s) => ({ ...s }));
}

// Section generators
async function buildWeatherSection(section, context) {
  try {
    const weather = await getWeather({});
    if (weather.today) {
      const t = weather.today;
      context.weatherRain = t.rain_probability_percent;
      let line = `Weather: ${t.condition}, ${t.min_temp_c}-${t.max_temp_c}°C, ${t.rain_probability_percent}% chance of rain` +
        (t.rain_probability_percent >= 40 ? ' (worth mentioning it could turn wet later)' : '') + '.';
      if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
      return line;
    } else if (weather.error) {
      return `Weather: unavailable right now (${weather.error}).`;
    }
  } catch (err) {
    return 'Weather: could not be retrieved.';
  }
  return null;
}

async function buildRemindersSection(section, context) {
  const lines = [];
  const dueToday = getItemsDueToday();
  if (dueToday.length > 0) {
    const desc = dueToday.map((i) => `${i.type} "${i.label || 'unlabelled'}" at ${new Date(i.fireAt).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })}`);
    lines.push(`Scheduled today: ${desc.join('; ')}.`);
  } else {
    lines.push('Nothing else scheduled for today.');
  }
  try {
    const soon = getItemsComingUp(7);
    if (soon.length) {
      const when = (i) => new Date(i.fireAt).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      lines.push(`Reminders and alarms coming up this week: ${soon.map((i) => `${i.type} "${i.label || 'unlabelled'}" on ${when(i)}${i.recurrence ? ` (repeats ${i.recurrence})` : ''}`).join('; ')}.`);
    }
  } catch (err) { console.warn('[MorningReport] Upcoming reminders skipped:', err.message); }
  if (section.customNote?.trim()) lines.push(`Reminders note: ${section.customNote.trim()}.`);
  return lines.join(' ');
}

async function buildCalendarSection(section, context) {
  try {
    await getUpcomingEvents(2);
    const todayStr = londonNow().dateStr;
    const hour = context.hour;
    const nowHm = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
    const today = getEventsOn(todayStr).filter((e) => hour < 11 || !e.time || e.time >= nowHm);
    const lines = [];
    lines.push(today.length > 0 ? `Calendar ${hour < 11 ? 'today' : 'for the rest of today'}: ${describeEvents(today).join('; ')}.` : `Calendar: nothing ${hour < 11 ? 'today' : 'else today'}.`);
    if (hour >= 16) {
      const t = new Date(Date.parse(`${todayStr}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
      const tomorrow = getEventsOn(t);
      if (tomorrow.length) lines.push(`Calendar tomorrow: ${describeEvents(tomorrow).join('; ')}.`);
    }
    if (section.customNote?.trim()) lines.push(`Calendar note: ${section.customNote.trim()}.`);
    return lines.join(' ');
  } catch (err) {
    console.warn('[MorningReport] Calendar skipped:', err.message);
    return null;
  }
}

async function buildBirthdaysSection(section, context) {
  const birthdays = listBirthdays().filter((b) => b.daysUntil <= 14);
  if (birthdays.length > 0) {
    const who = (b) => (b.relationship ? `${b.name} (their ${b.relationship.toLowerCase()})` : b.name);
    const desc = birthdays.map((b) => b.isToday ? `${who(b)}'s birthday is TODAY${b.turningAge ? ` (turning ${b.turningAge})` : ''}` : `${who(b)}'s birthday is in ${b.daysUntil} day(s)${b.turningAge ? `, turning ${b.turningAge}` : ''}`);
    let line = `Birthdays: ${desc.join('; ')}.`;
    if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
    return line;
  }
  return null;
}

async function buildMusicReleasesSection(section, context) {
  const releases = getTodayReleases();
  if (releases.length > 0) {
    let wanted = new Set();
    try { wanted = new Set(getWants().map((w) => `${w.artist}|${w.title}`.toLowerCase())); } catch (_) { /* none */ }
    const desc = releases.map((r) => `${r.artist} - "${r.title}" (${r.type})${wanted.has(`${r.artist}|${r.title}`.toLowerCase()) ? ' - ON THEIR WANT LIST, so lead with this one' : ''}`);
    let line = `New music out today from artists in the library: ${desc.join('; ')}.`;
    if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
    return line;
  }
  return null;
}

async function buildCardGamesSection(section, context) {
  try {
    const games = recentCampaignGames();
    if (games.length) {
      let line = `CARD GAME NIGHT (with Daniel - each line says which game; mention it briefly, a sentence or two, like a fellow player): ${games.join(' | ')}.`;
      if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
      return line;
    }
  } catch (err) { console.warn('[MorningReport] Campaigns skipped:', err.message); }
  return null;
}

async function buildGlucoseNowSection(section, context) {
  try {
    const cur = getCurrentState();
    if (cur.bg != null && cur.bgFresh) {
      const trend = cur.direction ? `, trend ${cur.direction}` : '';
      const iob = cur.iob != null ? `, ${cur.iob} units insulin on board` : '';
      let note = '';
      if (cur.bg < 4) note = ' - that is low; suggest treating it before anything else';
      else if (cur.bg < 5.5) note = ' - on the low side; worth having something before any run';
      else if (cur.bg > 13) note = ' - running high';
      let line = `Glucose right now: ${cur.bg} mmol/L${trend}${iob}${note}. If they mention running today, their usual aim is to start around 9 and never drop below 5.`;
      if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
      return line;
    }
  } catch (err) { console.warn('[MorningReport] Glucose now skipped:', err.message); }
  return null;
}

async function buildGlucoseOvernightSection(section, context) {
  try {
    const n = getOvernight();
    if (n) {
      let line = `Overnight: ${n.inRangePct}% in range, lowest ${n.min}${n.lows ? `, ${n.lows} low spell${n.lows > 1 ? 's' : ''}` : ''}, woke at ${n.endValue} mmol/L.`;
      if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
      return line;
    }
  } catch (_) { /* no overnight data */ }
  return null;
}

async function buildDeviceChangesSection(section, context) {
  try {
    const icons = getDeviceIcons() || [];
    const podIcon = icons.find((i) => i.icon === 'pod');
    const sensorIcon = icons.find((i) => i.icon === 'sensor');
    const rxIcon = icons.find((i) => i.icon === 'prescription');

    const devBits = [];
    if (podIcon) {
      devBits.push('an Omnipod change is due today');
    } else {
      devBits.push('no Omnipod change due today');
    }

    if (sensorIcon) {
      if (sensorIcon.color === 'white') {
        devBits.push('a sensor change/fit is due today');
      } else if (sensorIcon.color === 'orange') {
        devBits.push('a sensor change/fit is due tomorrow (so get one ready or warmed up)');
      } else {
        devBits.push('a sensor change/fit is due soon');
      }
    } else {
      devBits.push('no sensor change due today');
    }

    if (rxIcon) {
      devBits.push('a prescription or Libre sensor reorder is due today');
    }

    let line = `Device changes: ${devBits.join(', ')}.`;
    if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
    return line;
  } catch (err) {
    console.warn('[MorningReport] Device icons / pod-sensor status skipped:', err.message);
    return null;
  }
}

async function buildTrainingSection(section, context) {
  try {
    if (getStravaStatus().connected) {
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
        let line = `Training: ${bits.join('; ')}.`;
        if (context.weatherRain != null && context.weatherRain >= 50) {
          line += ' Rain is likely today, so if a run is planned it may need to fit around the weather.';
        }
        if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
        return line;
      }
    }
  } catch (err) { console.warn('[MorningReport] Strava summary skipped:', err.message); }
  return null;
}

async function buildLastRunSection(section, context) {
  try {
    if (getStravaStatus().connected) {
      const last = listActivities({ limit: 20 }).activities.find((a) => RUN_SPORTS.includes(a.sport));
      if (last) {
        const days = Math.round((Date.parse(`${londonNow().dateStr}T00:00:00Z`) - Date.parse(`${last.day}T00:00:00Z`)) / 86400000);
        let line = '';
        if (days <= 5) {
          line = `Last run: ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}, ${(last.distance / 1000).toFixed(1)} km at ${paceText(last.moving_time / 60 / (last.distance / 1000))}`;
          try {
            const m = getStoredMatch(last.id);
            if (m && m.status === 'ok' && m.stats) {
              line += `; glucose started ${m.stats.bgStart}, lowest ${m.stats.bgMin} mmol/L${m.stats.hypoWithin2h ? ' and dipped low within two hours afterwards' : ''}`;
            }
          } catch (_) { /* no glucose match */ }
          line += '.';
        } else if (days >= 6) {
          line = `No run for ${days} days.`;
        }
        if (line) {
          if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
          return line;
        }
      }
    }
  } catch (err) { console.warn('[MorningReport] Last run skipped:', err.message); }
  return null;
}

async function buildGoalsSection(section, context) {
  try {
    if (getStravaStatus().connected) {
      const lines = [];
      for (const g of listGoals().slice(0, 2)) {
        try {
          const a = assessGoal(g);
          lines.push(`Goal "${g.name || `${g.distanceKm} km`}"${g.targetDate ? ` (by ${g.targetDate})` : ''}: ${a.verdict}${a.weeksLeft != null ? ` ${a.weeksLeft} weeks left.` : ''}`);
        } catch (_) { /* goal not assessable */ }
      }
      if (lines.length) {
        let line = lines.join(' ');
        if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
        return line;
      }
    }
  } catch (err) { console.warn('[MorningReport] Goals skipped:', err.message); }
  return null;
}

async function buildToursSection(section, context) {
  try {
    const tours = await tourNewsForReport();
    if (tours.length) {
      let line = `UK TOUR NEWS for bands in their music library (lead the news with these; Leeds, Sheffield, Manchester or York matter most, then the rest of the north; London is only a maybe - say where they're playing): ${tours.map((t) => `[${t.artist}, playing ${t.places.join(', ')}] ${t.headline}`).join(' | ')}.`;
      if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
      return line;
    }
  } catch (err) { console.warn('[MorningReport] Tours skipped:', err.message); }
  return null;
}

async function buildNewsSection(section, context) {
  try {
    const news = await getReportNews({ mark: context.markNews });
    if (news.length) {
      let line = `News and interests (from their chosen sources; importance 1-5 is how much each source matters to them - lead with and give more time to the higher ones, say which source): ${news.map((n) => `[${n.source}, importance ${n.importance}${n.alsoIn ? `; also covered by ${n.alsoIn.join(', ')}` : ''}] ${n.headline}${n.summary ? ` - ${n.summary}` : ''}`).join(' | ')}.`;
      if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
      return line;
    }
  } catch (err) { console.warn('[MorningReport] News skipped:', err.message); }
  return null;
}

async function buildTasksSection(section, context) {
  try {
    const done = unreportedTasks();
    if (done.length) {
      let line = `BACKGROUND TASKS FINISHED since they last heard (give each a sentence or two): ${done.map((t) => `"${t.title}": ${t.summary}`).join(' | ')}`;
      if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
      return line;
    }
  } catch (err) { console.warn('[MorningReport] Tasks skipped:', err.message); }
  return null;
}

async function buildNightscoutDbSection(section, context) {
  try {
    const db = await getNightscoutDbSize();
    if (db && db.pct > 90) {
      const connected = getNightscoutWriteStatus().configured;
      let line = connected
        ? `LAST ITEM - Nightscout database: ${db.pct.toFixed(1)}% full (${db.usedMb} of ${db.maxMb} MB). END the report by asking whether to clear it out, in your own words - e.g. "Shall I clear out your Mongo database? It's nearly full." If they say yes, call clearOldNightscoutData; if they say no, leave it.`
        : `LAST ITEM - Nightscout database: ${db.pct.toFixed(1)}% full. End by mentioning it's nearly full, and that you can clear it out once Nightscout is connected on the Blood Sugar page.`;
      if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
      return line;
    }
  } catch (err) { console.warn('[MorningReport] DB size skipped:', err.message); }
  return null;
}

async function buildCustomSection(section, context) {
  const title = section.title || 'Custom Subject';
  const content = section.content || section.customNote || '';
  const serviceName = section.serviceName && section.serviceId !== 'standalone' ? ` [Service: ${section.serviceName}]` : '';
  if (content.trim()) {
    return `Custom Subject - "${title}"${serviceName}: ${content.trim()}`;
  }
  return `Custom Subject - "${title}"${serviceName}: Cover this user-requested subject in the report.`;
}

const SECTION_BUILDERS = {
  weather: buildWeatherSection,
  reminders: buildRemindersSection,
  calendar: buildCalendarSection,
  birthdays: buildBirthdaysSection,
  music_releases: buildMusicReleasesSection,
  card_games: buildCardGamesSection,
  glucose_now: buildGlucoseNowSection,
  glucose_overnight: buildGlucoseOvernightSection,
  device_changes: buildDeviceChangesSection,
  training: buildTrainingSection,
  last_run: buildLastRunSection,
  goals: buildGoalsSection,
  tours: buildToursSection,
  news: buildNewsSection,
  tasks: buildTasksSection,
  nightscout_db: buildNightscoutDbSection
};

// Everything in the report, as short plain lines. Formulated according to the
// user-configured subject order and enabled preferences.
export async function buildReportParts({ markNews = true } = {}) {
  const parts = [];
  const hour = londonNow().hour;
  const context = { hour, weatherRain: null, markNews };

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

  const configuredSections = getReportConfig();

  for (const section of configuredSections) {
    if (section.enabled === false) continue;

    try {
      let partLine = null;
      if (section.type === 'custom' || !SECTION_BUILDERS[section.id]) {
        partLine = await buildCustomSection(section, context);
      } else {
        const builder = SECTION_BUILDERS[section.id];
        partLine = await builder(section, context);
      }

      if (partLine && typeof partLine === 'string' && partLine.trim()) {
        parts.push(partLine.trim());
      }
    } catch (err) {
      console.warn(`[MorningReport] Section "${section.id}" (${section.title}) failed:`, err.message);
    }
  }

  return { whoLine, parts, hour };
}

const DELIVERY = "HOW TO DELIVER IT - IN YOUR YORKSHIRE ACCENT FROM THE FIRST WORD TO THE LAST (long reports are where it slips; hold the flat northern vowels and never sound an r after a vowel): this report is the one exception to your usual length limit - they ALWAYS want it IN FULL, however long that makes it. Cover EVERY section below and EVERY item within it, in the exact order presented below. Never drop, merge away or summarise out an item to keep it short; there is no sentence limit. Deliver it as a flowing spoken briefing rather than a bare list, linking items where they connect (rain and a run, a low overnight and a planned run, a busy afternoon and a pod change). Tell each news story once, in your own words, saying which source it's from; never repeat a story. Never give insulin doses. ";

// The first conversation of the day: offer the report, with its contents ready.
export async function buildMorningReportDirective() {
  const { whoLine, parts, hour } = await buildReportParts({ markNews: false });
  const name = hour < 12 ? 'morning report' : 'day report';
  return whoLine + `This is the user's first conversation with you today. As part of your greeting, briefly offer their ${name} in one short sentence. Only deliver it if they say yes; otherwise carry on normally. ` + DELIVERY + 'CONTENTS: ' + parts.join(' ');
}

// For the getDayReport tool, any time of day.
export async function getDayReport() {
  const { whoLine, parts, hour } = await buildReportParts();
  // IMPORTANT: report is a single concatenated string, NOT an array.
  // Sending it as an array caused Gemini to treat each element as a
  // separate turn item and stop after the first batch (items 0-7) then
  // fire a turnComplete, so training/goals/news/tasks were never spoken.
  const reportText = parts.join('  ');
  const sectionCount = parts.length;
  const countReminder = `CRITICAL: this report has ${sectionCount} sections. You MUST speak ALL ${sectionCount} sections without stopping, pausing between turns, or deciding you have covered enough. Do not stop after health or device status - continue straight into training, goals, tours, news, and tasks without any break. `;
  return {
    report: reportText,
    sectionCount,
    instructions: whoLine + countReminder + DELIVERY + (hour >= 16 ? 'It is later in the day, so frame it as a day report / evening round-up and include tomorrow where given.' : '')
  };
}
