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
const REPORT_CACHE_PATH = path.join(__dirname, '..', 'data', 'day_report_cache.json');

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

// ---------------------------------------------------------------------------
// Pre-Assembled Day Report Cache
// Assembles and caches the full report string in memory & disk in the background.
// This allows getDayReport() and buildMorningReportDirective() to return within
// <5ms, preventing ESP32 verify_timeout drops during voice interaction.
// ---------------------------------------------------------------------------
let memoryReportCache = null;
let isPrewarming = false;
let prewarmIntervalTimer = null;

function readReportCacheDisk() {
  try {
    if (fs.existsSync(REPORT_CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(REPORT_CACHE_PATH, 'utf8'));
    }
  } catch (_) { /* ignore */ }
  return null;
}

function writeReportCacheDisk(cacheData) {
  try {
    fs.mkdirSync(path.dirname(REPORT_CACHE_PATH), { recursive: true });
    fs.writeFileSync(REPORT_CACHE_PATH, JSON.stringify(cacheData, null, 2), 'utf8');
  } catch (err) {
    console.warn('[MorningReport] Failed to write disk cache:', err.message);
  }
}

/**
 * Pre-warms the day report cache asynchronously in the background.
 * Safe to call frequently; debounces duplicate concurrent runs.
 */
export async function prewarmDayReportCache({ markNews = false } = {}) {
  if (isPrewarming) return memoryReportCache;
  isPrewarming = true;
  try {
    const { whoLine, parts, hour } = await buildReportParts({ markNews });
    const reportText = parts.join('  ');
    const sectionCount = parts.length;
    const cacheData = {
      cachedAt: Date.now(),
      hour,
      whoLine,
      parts,
      reportText,
      sectionCount
    };
    memoryReportCache = cacheData;
    writeReportCacheDisk(cacheData);
    return cacheData;
  } catch (err) {
    console.warn('[MorningReport] Background pre-warm failed:', err.message);
    return memoryReportCache;
  } finally {
    isPrewarming = false;
  }
}

/**
 * Invalidates the in-memory and disk cache and triggers an immediate background refresh.
 */
export function invalidateDayReportCache() {
  memoryReportCache = null;
  // Trigger non-blocking async prewarm immediately
  prewarmDayReportCache().catch((err) => {
    console.warn('[MorningReport] Reactive refresh failed:', err.message);
  });
}

/**
 * Retrieves the pre-assembled report cache.
 * Returns in <5ms if cache is available. If stale or missing, returns existing cache
 * and triggers a background refresh, or builds immediately if cold.
 */
export async function getOrBuildReportCache({ forceRefresh = false, markNews = true } = {}) {
  const now = Date.now();
  // 1. Check memory cache (fresh within 15 minutes)
  if (!forceRefresh && memoryReportCache && (now - memoryReportCache.cachedAt < 15 * 60 * 1000)) {
    // If older than 3 minutes, schedule background refresh
    if (now - memoryReportCache.cachedAt > 3 * 60 * 1000 && !isPrewarming) {
      prewarmDayReportCache({ markNews: false }).catch(() => {});
    }
    return memoryReportCache;
  }

  // 2. Check disk cache
  if (!forceRefresh) {
    const disk = readReportCacheDisk();
    if (disk && (now - disk.cachedAt < 15 * 60 * 1000)) {
      memoryReportCache = disk;
      if (now - disk.cachedAt > 3 * 60 * 1000 && !isPrewarming) {
        prewarmDayReportCache({ markNews: false }).catch(() => {});
      }
      return disk;
    }
  }

  // 3. Cold start or force refresh: build immediately
  return await prewarmDayReportCache({ markNews });
}

// Automatically start periodic background pre-warming every 1 hour (60 minutes)
if (!prewarmIntervalTimer) {
  prewarmIntervalTimer = setInterval(() => {
    prewarmDayReportCache({ markNews: false }).catch(() => {});
  }, 60 * 60 * 1000);
  if (typeof prewarmIntervalTimer.unref === 'function') {
    prewarmIntervalTimer.unref();
  }
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
  { id: 'weather', name: 'Weather Service', description: 'Home forecast for the rest of today and tomorrow (Open-Meteo), plus an optional second saved place' },
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

// Extensible metadata registry detailing available sub-filters per connected service & built-in section
export const SERVICE_SUB_FILTERS = {
  weather: [
    { key: 'includeConditions', label: 'Sky & Weather Conditions', type: 'boolean', default: true, description: 'Include sky clarity, clouds, and condition summary.' },
    { key: 'includeTemps', label: 'Min & Max Temperatures', type: 'boolean', default: true, description: 'State predicted temperature range.' },
    { key: 'includeRain', label: 'Rain Probability & Totals', type: 'boolean', default: true, description: 'State precipitation percentage and warn if rain is likely.' },
    { key: 'rainThreshold', label: 'Rain Warning Threshold (%)', type: 'number', default: 40, min: 10, max: 90, step: 5, description: 'Minimum chance of rain to trigger wet weather advice.' },
    { key: 'includeWind', label: 'Wind Speed & Direction', type: 'boolean', default: false, description: 'Include wind velocity in km/h and compass direction.' },
    { key: 'includeHumidity', label: 'Relative Humidity', type: 'boolean', default: false, description: 'State relative humidity percentage.' },
    { key: 'includeTomorrow', label: "Tomorrow's Forecast", type: 'boolean', default: true, description: 'Add a line for tomorrow after the rest of today.' },
    { key: 'includeUnusual', label: 'Unusual for the Time of Year', type: 'boolean', default: true, description: 'Point out weather that is unusually warm, cold, windy or out of season compared with the last 10 years.' },
    { key: 'altLocation', label: 'Also Read Out the Weather For', type: 'select', default: '', optionsUrl: '/api/weather/places', description: 'A second saved place (add places on the Weather page). Home is always read first.' }
  ],
  reminders: [
    { key: 'includeToday', label: "Today's Due Items", type: 'boolean', default: true, description: 'List scheduled items and alarms due today.' },
    { key: 'includeUpcomingWeek', label: "Coming Up (Next 7 Days)", type: 'boolean', default: true, description: 'Mention reminders and alarms scheduled for the week ahead.' },
    { key: 'includeAlarms', label: 'Alarms', type: 'boolean', default: true, description: 'Include time-based alarm wakeups.' },
    { key: 'includeReminders', label: 'Reminders & Tasks', type: 'boolean', default: true, description: 'Include standard scheduled reminders.' },
    { key: 'includeTimers', label: 'Active Timers', type: 'boolean', default: true, description: 'Include short-interval running timers.' }
  ],
  calendar: [
    { key: 'includeToday', label: "Today's Events", type: 'boolean', default: true, description: 'Include meetings, shifts, and events scheduled for today.' },
    { key: 'includeTomorrowEvening', label: "Tomorrow (After 4 PM)", type: 'boolean', default: true, description: 'Preview tomorrow when briefing later in the afternoon/evening.' },
    { key: 'includeAllDay', label: 'All-Day Events', type: 'boolean', default: true, description: 'Include all-day calendar entries.' },
    { key: 'includeTimed', label: 'Timed Appointments', type: 'boolean', default: true, description: 'Include events with specific start and end times.' }
  ],
  birthdays: [
    { key: 'includeToday', label: "Today's Birthdays", type: 'boolean', default: true, description: 'Highlight birthdays occurring today.' },
    { key: 'includeUpcoming', label: 'Upcoming Birthdays (<=14 Days)', type: 'boolean', default: true, description: 'Mention birthdays approaching in the next fortnight.' },
    { key: 'maxDaysAhead', label: 'Max Days Ahead', type: 'number', default: 14, min: 1, max: 30, step: 1, description: 'How far ahead to look for upcoming birthdays.' },
    { key: 'includeTurningAge', label: 'Include Age Turning', type: 'boolean', default: true, description: 'State age milestone if birth year is known.' }
  ],
  music_releases: [
    { key: 'prioritiseWants', label: 'Lead With Want-List Matches', type: 'boolean', default: true, description: 'Emphasise newly released albums saved on your vinyl/CD want list.' },
    { key: 'includeAllReleases', label: 'All Library Artist Releases', type: 'boolean', default: true, description: 'Include new drops from all artists catalogued in your MUZAK collection.' },
    { key: 'includeSinglesAndEPs', label: 'Include Singles & EPs', type: 'boolean', default: true, description: 'Include short releases in addition to full albums.' }
  ],
  card_games: [
    { key: 'includeArkham', label: 'Arkham Horror LCG', type: 'boolean', default: true, description: 'Include recent scenario results, trauma, and investigator notes.' },
    { key: 'includeLotr', label: 'Lord of the Rings LCG', type: 'boolean', default: true, description: 'Include fellowship quests and recent scenario victories.' },
    { key: 'mentionDaniel', label: 'Reference Daniel As Player Partner', type: 'boolean', default: true, description: 'Frame game banter around your co-op play with Daniel.' }
  ],
  glucose_now: [
    { key: 'includeTrend', label: 'Directional Trend Arrow', type: 'boolean', default: true, description: 'State if glucose is rising, falling, or flat.' },
    { key: 'includeIob', label: 'Insulin on Board (IOB)', type: 'boolean', default: true, description: 'State active units of insulin remaining.' },
    { key: 'includeTargetEvaluation', label: 'Personal Target Band Evaluation', type: 'boolean', default: true, description: 'Evaluate whether reading is spot-on in target vs running high/low.' },
    { key: 'includeRunningTargetAdvice', label: 'Running Target Advice (~9 start, >5 min)', type: 'boolean', default: true, description: 'Include pre-run glucose recommendation.' },
    { key: 'includePreRunReadiness', label: 'Pre-Run Readiness Status (Go/Wait/Eat First)', type: 'boolean', default: true, description: 'Include pre-run fueling readiness status in morning briefing summary.' }
  ],
  glucose_overnight: [
    { key: 'includeTir', label: 'Percentage Time in Range (TIR)', type: 'boolean', default: true, description: 'State overnight percentage between 3.9 and 10.0 mmol/L.' },
    { key: 'includeMinGlucose', label: 'Lowest Overnight Reading', type: 'boolean', default: true, description: 'State lowest blood sugar reading recorded overnight.' },
    { key: 'includeHypoCount', label: 'Hypo Spells Count', type: 'boolean', default: true, description: 'Report number of discrete low spells (<3.9 mmol/L).' },
    { key: 'includeWakingLevel', label: 'Waking Glucose Level', type: 'boolean', default: true, description: 'State fasting glucose upon waking.' }
  ],
  device_changes: [
    { key: 'includePod', label: 'Omnipod Change Alerts', type: 'boolean', default: true, description: 'Report whether an Omnipod pump change is due today.' },
    { key: 'includeSensor', label: 'CGM Sensor Change Alerts', type: 'boolean', default: true, description: 'Report if a Libre/Dexcom sensor change is due today.' },
    { key: 'includeSensorWarmupTomorrow', label: 'Tomorrow Sensor Warmup Heads-Up', type: 'boolean', default: true, description: 'Alert if sensor expires tomorrow to prepare a replacement/warmup.' },
    { key: 'includePrescriptions', label: 'Prescription & Supply Reorders', type: 'boolean', default: true, description: 'Alert if a prescription or sensor reorder is due today.' }
  ],
  training: [
    { key: 'includeActivityCount', label: 'Activity Count (Last 7 Days)', type: 'boolean', default: true, description: 'State number of completed workouts in the past 7 days.' },
    { key: 'includeDistanceTotals', label: 'Distance Totals (Last 7 vs Prior 7)', type: 'boolean', default: true, description: 'Compare weekly kilometres against previous week.' },
    { key: 'includePaceComparison', label: 'Pace Comparison', type: 'boolean', default: true, description: 'Highlight if average pace was faster or slower.' },
    { key: 'includeLoadWarning', label: 'Volume Spike / Fatigue Warning', type: 'boolean', default: true, description: 'Suggest an easier day if running volume jumped >25%.' },
    { key: 'includeWeatherCorrelation', label: 'Weather Correlation (Fit Runs Around Rain)', type: 'boolean', default: true, description: 'Connect running plan with today\'s rain forecast.' }
  ],
  last_run: [
    { key: 'includeDistanceAndPace', label: 'Distance & Average Pace', type: 'boolean', default: true, description: 'State distance in km and average mm:ss /km pace.' },
    { key: 'includeDaysAgo', label: 'Recency (Today / Yesterday / X Days)', type: 'boolean', default: true, description: 'State how long ago the run occurred.' },
    { key: 'includeGlucoseResponse', label: 'Start & Lowest Glucose During Run', type: 'boolean', default: true, description: 'Report blood sugar response and post-run hypo dips.' },
    { key: 'maxDaysLookback', label: 'Max Days Lookback', type: 'number', default: 5, min: 1, max: 14, step: 1, description: 'Report as recent if run within this many days.' }
  ],
  goals: [
    { key: 'includeVerdict', label: 'Goal Status & Assessment Verdict', type: 'boolean', default: true, description: 'State whether active goals are on track or behind.' },
    { key: 'includeWeeksRemaining', label: 'Weeks Remaining to Target Date', type: 'boolean', default: true, description: 'State countdown to target achievement date.' },
    { key: 'maxGoals', label: 'Max Goals in Report', type: 'number', default: 2, min: 1, max: 5, step: 1, description: 'Maximum number of fitness goals to review.' }
  ],
  tours: [
    { key: 'prioritiseYorkshire', label: 'Prioritise Yorkshire & Northern Venues', type: 'boolean', default: true, description: 'Lead with Leeds, Sheffield, Manchester, and York tour stops.' },
    { key: 'includeLondon', label: 'Include London Shows', type: 'boolean', default: true, description: 'Mention London gigs as secondary alternatives.' },
    { key: 'includeFestivals', label: 'Include UK Music Festivals', type: 'boolean', default: true, description: 'Report festival appearances for library artists (Bloodstock, Download, etc.).' },
    { key: 'maxTours', label: 'Max Tour Stories', type: 'number', default: 5, min: 1, max: 10, step: 1, description: 'Maximum tour announcements in the daily briefing.' }
  ],
  news: [
    { key: 'minImportance', label: 'Minimum Source Importance Rating', type: 'number', default: 1, min: 1, max: 5, step: 1, description: 'Only include news from sources rated at or above this weight.' },
    { key: 'includeTech', label: 'Technology Feeds', type: 'boolean', default: true, description: 'Include headlines from technology sources.' },
    { key: 'includeLocal', label: 'Local & Regional News', type: 'boolean', default: true, description: 'Include Yorkshire and regional news feeds.' },
    { key: 'includeGeneral', label: 'National / World Headlines', type: 'boolean', default: true, description: 'Include general news coverage.' },
    { key: 'maxHeadlines', label: 'Max Headlines to Report', type: 'number', default: 6, min: 1, max: 12, step: 1, description: 'Cap total stories delivered in briefing.' }
  ],
  tasks: [
    { key: 'includeSummaries', label: 'Task Result Summaries', type: 'boolean', default: true, description: 'Briefly explain key findings or outputs of completed jobs.' },
    { key: 'maxTasks', label: 'Max Tasks Reported', type: 'number', default: 4, min: 1, max: 10, step: 1, description: 'Maximum completed background tasks to list.' }
  ],
  nightscout_db: [
    { key: 'alertThresholdPct', label: 'Database Warning Threshold (%)', type: 'number', default: 90, min: 50, max: 98, step: 5, description: 'Trigger alert when MongoDB usage exceeds this capacity.' },
    { key: 'offerClearout', label: 'Offer Automated Mongo Cleanup', type: 'boolean', default: true, description: 'Conclude report by asking whether to purge older readings.' }
  ]
};

// Generates default sub-filter state object from schema
export function getDefaultSubFilters(serviceIdOrSectionId) {
  const schema = SERVICE_SUB_FILTERS[serviceIdOrSectionId];
  if (!schema || !Array.isArray(schema)) return {};
  const defaults = {};
  for (const item of schema) {
    defaults[item.key] = item.default;
  }
  return defaults;
}

export const DEFAULT_REPORT_SECTIONS = [
  {
    id: 'weather',
    type: 'builtin',
    title: 'Weather Forecast',
    serviceId: 'weather',
    serviceName: 'Weather Service',
    description: "Today's forecast, temperatures, and rain probability.",
    enabled: true,
    customNote: '',
    subFilters: getDefaultSubFilters('weather')
  },
  {
    id: 'reminders',
    type: 'builtin',
    title: 'Scheduled Reminders & Alarms',
    serviceId: 'reminders',
    serviceName: 'Reminders & Alarms',
    description: "Today's and this week's scheduled alarms, timers, and reminders.",
    enabled: true,
    customNote: '',
    subFilters: getDefaultSubFilters('reminders')
  },
  {
    id: 'calendar',
    type: 'builtin',
    title: 'Calendar Events',
    serviceId: 'calendar',
    serviceName: 'Google Calendar',
    description: "Today's and tomorrow's upcoming calendar events and meetings.",
    enabled: true,
    customNote: '',
    subFilters: getDefaultSubFilters('calendar')
  },
  {
    id: 'birthdays',
    type: 'builtin',
    title: 'Birthdays',
    serviceId: 'birthdays',
    serviceName: 'Birthday Service',
    description: 'Upcoming birthdays for family and friends within the next 14 days.',
    enabled: true,
    customNote: '',
    subFilters: getDefaultSubFilters('birthdays')
  },
  {
    id: 'music_releases',
    type: 'builtin',
    title: 'Music Releases & Wants',
    serviceId: 'music_scan',
    serviceName: 'Music Scanner',
    description: 'New releases today from artists in your library and want-list matches.',
    enabled: true,
    customNote: '',
    subFilters: getDefaultSubFilters('music_releases')
  },
  {
    id: 'card_games',
    type: 'builtin',
    title: 'Card Game Campaigns',
    serviceId: 'campaigns',
    serviceName: 'Campaigns & Boardgames',
    description: 'Recent Arkham Horror and Lord of the Rings campaign games with Daniel.',
    enabled: true,
    customNote: '',
    subFilters: getDefaultSubFilters('card_games')
  },
  {
    id: 'glucose_now',
    type: 'builtin',
    title: 'Live Blood Glucose & IOB',
    serviceId: 'glucose',
    serviceName: 'Nightscout CGM',
    description: 'Current glucose reading, directional trend, and insulin on board.',
    enabled: true,
    customNote: '',
    subFilters: getDefaultSubFilters('glucose_now')
  },
  {
    id: 'glucose_overnight',
    type: 'builtin',
    title: 'Overnight Glucose Summary',
    serviceId: 'glucose',
    serviceName: 'Glucose Hub',
    description: 'Overnight percentage time-in-range, lowest reading, hypo spells, and waking level.',
    enabled: true,
    customNote: '',
    subFilters: getDefaultSubFilters('glucose_overnight')
  },
  {
    id: 'device_changes',
    type: 'builtin',
    title: 'Omnipod & Sensor Device Status',
    serviceId: 'device_status',
    serviceName: 'Device Management',
    description: 'Summarises whether an Omnipod or CGM sensor change or warmup is due today or tomorrow.',
    enabled: true,
    customNote: '',
    subFilters: getDefaultSubFilters('device_changes')
  },
  {
    id: 'training',
    type: 'builtin',
    title: 'Training & Weekly Mileage',
    serviceId: 'strava',
    serviceName: 'Strava Service',
    description: 'Last 7 days mileage, activity count, and running pace compared to the previous week.',
    enabled: true,
    customNote: '',
    subFilters: getDefaultSubFilters('training')
  },
  {
    id: 'last_run',
    type: 'builtin',
    title: 'Last Run & Glucose Response',
    serviceId: 'strava',
    serviceName: 'Strava & Nightscout',
    description: 'Distance and pace of most recent run, plus starting and lowest glucose during the run.',
    enabled: true,
    customNote: '',
    subFilters: getDefaultSubFilters('last_run')
  },
  {
    id: 'goals',
    type: 'builtin',
    title: 'Fitness & Running Goals',
    serviceId: 'goals',
    serviceName: 'Goals Service',
    description: 'Progress and current assessment towards active running and distance goals.',
    enabled: true,
    customNote: '',
    subFilters: getDefaultSubFilters('goals')
  },
  {
    id: 'tours',
    type: 'builtin',
    title: 'UK Tour News',
    serviceId: 'news',
    serviceName: 'News Service',
    description: 'Tour dates for library artists (prioritising Leeds, Sheffield, Manchester, York).',
    enabled: true,
    customNote: '',
    subFilters: getDefaultSubFilters('tours')
  },
  {
    id: 'news',
    type: 'builtin',
    title: 'Curated News & Interests',
    serviceId: 'news',
    serviceName: 'News Service',
    description: 'Headlines from preferred feeds, ordered by personal importance rating.',
    enabled: true,
    customNote: '',
    subFilters: getDefaultSubFilters('news')
  },
  {
    id: 'tasks',
    type: 'builtin',
    title: 'Completed Background Tasks',
    serviceId: 'tasks',
    serviceName: 'Tasks Service',
    description: 'Brief overview of any automated background tasks finished since last report.',
    enabled: true,
    customNote: '',
    subFilters: getDefaultSubFilters('tasks')
  },
  {
    id: 'nightscout_db',
    type: 'builtin',
    title: 'Nightscout Database Size Alert',
    serviceId: 'glucose',
    serviceName: 'Nightscout Database',
    description: 'Alerts if MongoDB usage is above 90% and offers to clear older records.',
    enabled: true,
    customNote: '',
    subFilters: getDefaultSubFilters('nightscout_db')
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
          // Merge subFilters with standard schema defaults to maintain future compatibility
          const defaultFilterValues = getDefaultSubFilters(s.id) || getDefaultSubFilters(s.serviceId) || {};
          const subFilters = { ...defaultFilterValues, ...(s.subFilters || {}) };
          return { ...s, customNote, subFilters };
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
    const defaultFilterValues = getDefaultSubFilters(s.id) || getDefaultSubFilters(s.serviceId) || {};
    const subFilters = typeof s.subFilters === 'object' && s.subFilters !== null
      ? { ...defaultFilterValues, ...s.subFilters }
      : defaultFilterValues;

    return {
      id: s.id || `custom_${Date.now()}_${idx}`,
      type: s.type === 'custom' ? 'custom' : 'builtin',
      title: String(s.title || '').trim() || 'Untitled Subject',
      serviceId: s.serviceId || 'standalone',
      serviceName: s.serviceName || (AVAILABLE_SERVICES.find(srv => srv.id === s.serviceId)?.name || 'Custom'),
      description: String(s.description || '').trim(),
      enabled: s.enabled !== false,
      customNote,
      content: String(s.content || '').trim(),
      subFilters
    };
  });

  setSetting('morning_report_config', JSON.stringify(cleaned));
  invalidateDayReportCache();
  return getReportConfig();
}

export function resetReportConfig() {
  setSetting('morning_report_config', JSON.stringify(DEFAULT_REPORT_SECTIONS));
  invalidateDayReportCache();
  return DEFAULT_REPORT_SECTIONS.map((s) => ({ ...s }));
}

// Section generators with sub-filtering support
async function buildWeatherSection(section, context) {
  // Home first (always), from the hours still to come today - so rain that fell before the report isn't
  // reported as coming - then tomorrow and, if chosen, a second saved place.
  const filters = section.subFilters || {};
  const opts = { conditions: filters.includeConditions !== false, temps: filters.includeTemps !== false, rain: filters.includeRain !== false, wind: filters.includeWind === true };
  const threshold = typeof filters.rainThreshold === 'number' ? filters.rainThreshold : 40;
  const describe = (w, { withTomorrow }) => {
    const p = (w.periods || []).filter((x) => x.name !== 'Overnight');
    const parts = p.map((x) => `${x.name.toLowerCase()} ${periodText(x, opts)}`);
    let line = parts.length ? `rest of today - ${parts.join('; ')}` : `tonight - ${periodText(w.periods?.[0] || {}, opts)}`;
    if (filters.includeHumidity === true && w.current?.humidity_percent != null) line += `; humidity ${w.current.humidity_percent}%`;
    if (opts.rain && (w.today?.rain_probability_percent ?? 0) >= threshold) line += ' (worth mentioning it could turn wet)';
    const tomorrow = w.forecast?.[1];
    if (withTomorrow && tomorrow) line += `. Tomorrow: ${tomorrow.summary}`;
    if (filters.includeUnusual !== false) {
      const odd = [w.forecast?.[0]?.unusual, withTomorrow ? tomorrow?.unusual : null].filter(Boolean).flatMap((u) => u.notes.map((n) => n.text));
      if (odd.length) line += `. Unusual for the time of year: ${odd.join(' ')} (make a fresh remark of your own about it)`;
    }
    return line;
  };
  try {
    const home = await getWeather({ days: 2 });
    if (home.error) return `Weather: unavailable right now (${home.error}). Say so - do not guess.`;
    context.weatherRain = home.today?.rain_probability_percent ?? null;
    const lang = home.description?.language_today;
    let line = `Weather at home (${home.location.split(',')[0]}): ${describe(home, { withTomorrow: filters.includeTomorrow !== false })}.`;
    if (lang) line += ` Words that fit today - rain: ${lang.rain.level} (never say ${lang.rain.avoid.slice(-4).join(', ')})`
      + `; temperature: ${lang.temperature.band}; wind: ${lang.wind.band}${lang.extras.length ? `; also ${lang.extras.map((e) => e.kind.replace('_', ' ')).join(', ')}` : ''}. Describe it no stronger or weaker than that.`;
    if (filters.altLocation) {
      const alt = await getWeather({ location: filters.altLocation, days: 2 });
      line += alt.error ? ` ${filters.altLocation}: forecast unavailable.` : ` Also in ${filters.altLocation}: ${describe(alt, { withTomorrow: filters.includeTomorrow !== false })}.`;
    }
    if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
    return line;
  } catch (err) {
    return 'Weather: could not be retrieved. Say so - do not guess.';
  }
}

// One period of the day ("afternoon sunny spells, dry, 16-18°C"), trimmed to the chosen sub-filters.
function periodText(p, { conditions, temps, rain, wind }) {
  const bits = String(p.text || '').split(', ');
  // text is: sky, rain, temps, wind
  const keep = [];
  if (conditions && bits[0]) keep.push(bits[0]);
  if (rain && bits[1]) keep.push(bits[1]);
  if (temps && bits[2]) keep.push(bits[2]);
  if (wind && bits[3]) keep.push(bits.slice(3).join(', '));
  return keep.join(', ') || 'no details chosen';
}

async function buildRemindersSection(section, context) {
  const filters = section.subFilters || {};
  const lines = [];

  const filterItemType = (item) => {
    if (item.type === 'alarm' && filters.includeAlarms === false) return false;
    if (item.type === 'timer' && filters.includeTimers === false) return false;
    if (item.type === 'reminder' && filters.includeReminders === false) return false;
    return true;
  };

  if (filters.includeToday !== false) {
    const dueToday = getItemsDueToday().filter(filterItemType);
    if (dueToday.length > 0) {
      const desc = dueToday.map((i) => `${i.type} "${i.label || 'unlabelled'}" at ${new Date(i.fireAt).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })}`);
      lines.push(`Scheduled today: ${desc.join('; ')}.`);
    } else {
      lines.push('Nothing else scheduled for today.');
    }
  }

  if (filters.includeUpcomingWeek !== false) {
    try {
      const soon = getItemsComingUp(7).filter(filterItemType);
      if (soon.length) {
        const when = (i) => new Date(i.fireAt).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        lines.push(`Reminders and alarms coming up this week: ${soon.map((i) => `${i.type} "${i.label || 'unlabelled'}" on ${when(i)}${i.recurrence ? ` (repeats ${i.recurrence})` : ''}`).join('; ')}.`);
      }
    } catch (err) { console.warn('[MorningReport] Upcoming reminders skipped:', err.message); }
  }

  if (lines.length === 0) return null;
  if (section.customNote?.trim()) lines.push(`Reminders note: ${section.customNote.trim()}.`);
  return lines.join(' ');
}

async function buildCalendarSection(section, context) {
  try {
    const filters = section.subFilters || {};
    await getUpcomingEvents(2);
    const todayStr = londonNow().dateStr;
    const hour = context.hour;
    const nowHm = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });

    let today = getEventsOn(todayStr).filter((e) => hour < 11 || !e.time || e.time >= nowHm);

    if (filters.includeAllDay === false) {
      today = today.filter(e => Boolean(e.time));
    }
    if (filters.includeTimed === false) {
      today = today.filter(e => !e.time);
    }

    const lines = [];
    if (filters.includeToday !== false) {
      lines.push(today.length > 0 ? `Calendar ${hour < 11 ? 'today' : 'for the rest of today'}: ${describeEvents(today).join('; ')}.` : `Calendar: nothing ${hour < 11 ? 'today' : 'else today'}.`);
    }

    if (filters.includeTomorrowEvening !== false && hour >= 16) {
      const t = new Date(Date.parse(`${todayStr}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
      let tomorrow = getEventsOn(t);
      if (filters.includeAllDay === false) tomorrow = tomorrow.filter(e => Boolean(e.time));
      if (filters.includeTimed === false) tomorrow = tomorrow.filter(e => !e.time);
      if (tomorrow.length) lines.push(`Calendar tomorrow: ${describeEvents(tomorrow).join('; ')}.`);
    }

    if (lines.length === 0) return null;
    if (section.customNote?.trim()) lines.push(`Calendar note: ${section.customNote.trim()}.`);
    return lines.join(' ');
  } catch (err) {
    console.warn('[MorningReport] Calendar skipped:', err.message);
    return null;
  }
}

async function buildBirthdaysSection(section, context) {
  const filters = section.subFilters || {};
  const maxDays = typeof filters.maxDaysAhead === 'number' ? filters.maxDaysAhead : 14;
  let birthdays = listBirthdays().filter((b) => b.daysUntil <= maxDays);

  if (filters.includeToday === false) {
    birthdays = birthdays.filter(b => !b.isToday);
  }
  if (filters.includeUpcoming === false) {
    birthdays = birthdays.filter(b => b.isToday);
  }

  if (birthdays.length > 0) {
    const who = (b) => (b.relationship ? `${b.name} (their ${b.relationship.toLowerCase()})` : b.name);
    const ageStr = (b) => (filters.includeTurningAge !== false && b.turningAge ? ` (turning ${b.turningAge})` : '');
    const desc = birthdays.map((b) => b.isToday ? `${who(b)}'s birthday is TODAY${ageStr(b)}` : `${who(b)}'s birthday is in ${b.daysUntil} day(s)${filters.includeTurningAge !== false && b.turningAge ? `, turning ${b.turningAge}` : ''}`);
    let line = `Birthdays: ${desc.join('; ')}.`;
    if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
    return line;
  }
  return null;
}

async function buildMusicReleasesSection(section, context) {
  const filters = section.subFilters || {};
  let releases = getTodayReleases();

  if (filters.includeSinglesAndEPs === false) {
    releases = releases.filter(r => !/single|ep/i.test(r.type || ''));
  }

  let wanted = new Set();
  try { wanted = new Set(getWants().map((w) => `${w.artist}|${w.title}`.toLowerCase())); } catch (_) { /* none */ }

  if (filters.includeAllReleases === false) {
    releases = releases.filter(r => wanted.has(`${r.artist}|${r.title}`.toLowerCase()));
  }

  if (releases.length > 0) {
    const desc = releases.map((r) => {
      const isWant = wanted.has(`${r.artist}|${r.title}`.toLowerCase());
      const wantNotice = isWant && filters.prioritiseWants !== false ? ' - ON THEIR WANT LIST, so lead with this one' : '';
      return `${r.artist} - "${r.title}" (${r.type})${wantNotice}`;
    });
    let line = `New music out today from artists in the library: ${desc.join('; ')}.`;
    if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
    return line;
  }
  return null;
}

async function buildCardGamesSection(section, context) {
  try {
    const filters = section.subFilters || {};
    let games = recentCampaignGames();

    if (filters.includeArkham === false) {
      games = games.filter(g => !/arkham/i.test(g));
    }
    if (filters.includeLotr === false) {
      games = games.filter(g => !/lotr|lord of the rings|fellowship/i.test(g));
    }

    if (games.length) {
      const partnerStr = filters.mentionDaniel !== false ? ' (with Daniel - each line says which game; mention it briefly, a sentence or two, like a fellow player)' : '';
      let line = `CARD GAME NIGHT${partnerStr}: ${games.join(' | ')}.`;
      if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
      return line;
    }
  } catch (err) { console.warn('[MorningReport] Campaigns skipped:', err.message); }
  return null;
}

async function buildGlucoseNowSection(section, context) {
  try {
    const filters = section.subFilters || {};
    const cur = getCurrentState();
    if (cur.bg != null && cur.bgFresh) {
      const th = (await import('./glucoseHubService.js')).getGlucoseThresholds();
      const trend = (filters.includeTrend !== false && cur.direction) ? `, trend ${cur.direction}` : '';
      const iob = (filters.includeIob !== false && cur.iob != null) ? `, ${cur.iob} units insulin on board` : '';
      let note = '';

      if (filters.includeTargetEvaluation !== false) {
        const pLow = th.personalLow || 4.5;
        const pHigh = th.personalHigh || th.tightHigh || 7.8;
        if (cur.bg < th.veryLow) {
          note = ` - that is very low (<${th.veryLow}); treat it urgently`;
        } else if (cur.bg < th.low) {
          note = ` - that is low (${th.veryLow}-${th.low}); treat before other activities`;
        } else if (cur.bg < pLow) {
          note = ` - on the low side of in range (${th.low}-${pLow})`;
        } else if (cur.bg <= pHigh) {
          note = ` - spot on, perfectly in range in your personal target (${pLow}-${pHigh})`;
        } else if (cur.bg <= th.high) {
          note = ` - on the high side of in range (${pHigh}-${th.high})`;
        } else if (cur.bg <= th.veryHigh) {
          note = ` - running high (${th.high}-${th.veryHigh})`;
        } else {
          note = ` - very high (>${th.veryHigh})`;
        }
      }

      const runAdvice = filters.includeRunningTargetAdvice !== false ? ' (For runs, target start is ~9 and never dropping below 5).' : '';
      
      let readinessStr = '';
      if (filters.includePreRunReadiness !== false) {
        try {
          const { evaluateGlucoseReadiness } = await import('./glucoseReadinessService.js');
          const rd = evaluateGlucoseReadiness({ bg: cur.bg, direction: cur.direction, iob: cur.iob });
          readinessStr = ` Pre-run readiness: ${rd.status === 'go' ? 'GO (Optimal)' : rd.status === 'eat_first' ? `EAT FIRST (+${rd.recommendedCarbsGrams}g carbs)` : 'WAIT (Delay departure)'}.`;
        } catch (_) { }
      }

      let line = `Glucose right now: ${cur.bg} mmol/L${trend}${iob}${note}.${runAdvice}${readinessStr}`;
      if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
      return line;
    }
  } catch (err) { console.warn('[MorningReport] Glucose now skipped:', err.message); }
  return null;
}

async function buildGlucoseOvernightSection(section, context) {
  try {
    const filters = section.subFilters || {};
    const n = getOvernight();
    if (n) {
      const bits = [];
      if (filters.includeTir !== false) bits.push(`${n.inRangePct}% in range`);
      if (filters.includeMinGlucose !== false) bits.push(`lowest ${n.min}`);
      if (filters.includeHypoCount !== false && n.lows) bits.push(`${n.lows} low spell${n.lows > 1 ? 's' : ''}`);
      if (filters.includeWakingLevel !== false && n.endValue != null) bits.push(`woke at ${n.endValue} mmol/L`);

      let line = `Overnight glucose summary: ${bits.join(', ')}.`;
      if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
      return line;
    }
  } catch (_) { /* no overnight data */ }
  return null;
}

async function buildDeviceChangesSection(section, context) {
  try {
    const filters = section.subFilters || {};
    const icons = getDeviceIcons() || [];
    const podIcon = icons.find((i) => i.icon === 'pod');
    const sensorIcon = icons.find((i) => i.icon === 'sensor');
    const rxIcon = icons.find((i) => i.icon === 'prescription');

    const devBits = [];
    if (filters.includePod !== false) {
      if (podIcon) {
        devBits.push('an Omnipod change is due today');
      } else {
        devBits.push('no Omnipod change due today');
      }
    }

    if (filters.includeSensor !== false) {
      if (sensorIcon) {
        if (sensorIcon.color === 'white') {
          devBits.push('a sensor change/fit is due today');
        } else if (sensorIcon.color === 'orange') {
          if (filters.includeSensorWarmupTomorrow !== false) {
            devBits.push('a sensor change/fit is due tomorrow (so get one ready or warmed up)');
          }
        } else {
          devBits.push('a sensor change/fit is due soon');
        }
      } else {
        devBits.push('no sensor change due today');
      }
    }

    if (filters.includePrescriptions !== false && rxIcon) {
      devBits.push('a prescription or Libre sensor reorder is due today');
    }

    if (devBits.length === 0) return null;
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
    const filters = section.subFilters || {};
    if (getStravaStatus().connected) {
      const s = getSummary();
      const w = s.periods.last7, pw = w.previous;
      if (w.count > 0 || pw.count > 0) {
        const bits = [];
        if (filters.includeDistanceTotals !== false || filters.includeActivityCount !== false) {
          const actCount = filters.includeActivityCount !== false ? `${w.count} activities and ` : '';
          const prevActCount = filters.includeActivityCount !== false ? `${pw.count} and ` : '';
          bits.push(`${actCount}${w.distanceKm} km in the last 7 days (${prevActCount}${pw.distanceKm} km the 7 before)`);
        }
        if (filters.includeLoadWarning !== false && w.runKm > 0 && pw.runKm > 0 && pw.runKm >= 3) {
          const pct = Math.round(((w.runKm - pw.runKm) / pw.runKm) * 100);
          if (pct > 25) bits.push(`running distance is up ${pct}% - a fair jump, so an easier day could be sensible`);
          else if (pct < -40) bits.push(`running is down ${Math.abs(pct)}% on the week before`);
        }
        if (filters.includePaceComparison !== false && w.paceMinKm && pw.paceMinKm) {
          const diff = pw.paceMinKm - w.paceMinKm;
          if (Math.abs(diff) >= 0.1) bits.push(`average running pace ${paceText(w.paceMinKm)}, ${diff > 0 ? 'faster' : 'slower'} than the week before`);
        }

        if (bits.length === 0) return null;
        let line = `Training: ${bits.join('; ')}.`;
        if (filters.includeWeatherCorrelation !== false && context.weatherRain != null && context.weatherRain >= 50) {
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
    const filters = section.subFilters || {};
    if (getStravaStatus().connected) {
      const last = listActivities({ limit: 20 }).activities.find((a) => RUN_SPORTS.includes(a.sport));
      if (last) {
        const maxLookback = typeof filters.maxDaysLookback === 'number' ? filters.maxDaysLookback : 5;
        const days = Math.round((Date.parse(`${londonNow().dateStr}T00:00:00Z`) - Date.parse(`${last.day}T00:00:00Z`)) / 86400000);
        let line = '';
        if (days <= maxLookback) {
          const whenStr = filters.includeDaysAgo !== false ? (days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`) : 'recently';
          const distPaceStr = filters.includeDistanceAndPace !== false ? `, ${(last.distance / 1000).toFixed(1)} km at ${paceText(last.moving_time / 60 / (last.distance / 1000))}` : '';
          line = `Last run: ${whenStr}${distPaceStr}`;
          if (filters.includeGlucoseResponse !== false) {
            try {
              const m = getStoredMatch(last.id);
              if (m && m.status === 'ok' && m.stats) {
                line += `; glucose started ${m.stats.bgStart}, lowest ${m.stats.bgMin} mmol/L${m.stats.hypoWithin2h ? ' and dipped low within two hours afterwards' : ''}`;
              }
            } catch (_) { /* no glucose match */ }
          }
          line += '.';
        } else if (days > maxLookback) {
          if (filters.includeDaysAgo !== false) {
            line = `No run for ${days} days.`;
          }
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
    const filters = section.subFilters || {};
    const maxGoals = typeof filters.maxGoals === 'number' ? filters.maxGoals : 2;
    if (getStravaStatus().connected) {
      const lines = [];
      for (const g of listGoals().slice(0, maxGoals)) {
        try {
          const a = assessGoal(g);
          const verdictStr = filters.includeVerdict !== false ? `: ${a.verdict}` : '';
          const weeksStr = (filters.includeWeeksRemaining !== false && a.weeksLeft != null) ? ` ${a.weeksLeft} weeks left.` : '.';
          lines.push(`Goal "${g.name || `${g.distanceKm} km`}"${g.targetDate ? ` (by ${g.targetDate})` : ''}${verdictStr}${weeksStr}`);
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
    const filters = section.subFilters || {};
    const maxTours = typeof filters.maxTours === 'number' ? filters.maxTours : 5;
    let tours = await tourNewsForReport();

    if (filters.includeFestivals === false) {
      tours = tours.filter(t => !/fest|festival/i.test(t.headline || '') && !/festival/i.test(t.places?.join(' ') || ''));
    }
    if (filters.includeLondon === false) {
      tours = tours.filter(t => !t.places?.includes('London') || t.places?.length > 1);
    }
    tours = tours.slice(0, maxTours);

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
    const filters = section.subFilters || {};
    const minImp = typeof filters.minImportance === 'number' ? filters.minImportance : 1;
    const maxHeadlines = typeof filters.maxHeadlines === 'number' ? filters.maxHeadlines : 6;
    let news = await getReportNews({ mark: context.markNews });

    if (minImp > 1) {
      news = news.filter(n => (n.importance || 3) >= minImp);
    }
    if (filters.includeTech === false) {
      news = news.filter(n => !/tech|technology|gadget|ai|software|silicon/i.test(`${n.source} ${n.headline}`));
    }
    if (filters.includeLocal === false) {
      news = news.filter(n => !/leeds|yorkshire|sheffield|local/i.test(`${n.source} ${n.headline}`));
    }

    news = news.slice(0, maxHeadlines);

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
    const filters = section.subFilters || {};
    const maxTasks = typeof filters.maxTasks === 'number' ? filters.maxTasks : 4;
    let done = unreportedTasks().slice(0, maxTasks);

    if (done.length) {
      const taskStrs = done.map((t) => {
        const summaryStr = filters.includeSummaries !== false && t.summary ? `: ${t.summary}` : '';
        return `"${t.title}"${summaryStr}`;
      });
      let line = `BACKGROUND TASKS FINISHED since they last heard (give each a sentence or two): ${taskStrs.join(' | ')}`;
      if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
      return line;
    }
  } catch (err) { console.warn('[MorningReport] Tasks skipped:', err.message); }
  return null;
}

async function buildNightscoutDbSection(section, context) {
  try {
    const filters = section.subFilters || {};
    const alertThreshold = typeof filters.alertThresholdPct === 'number' ? filters.alertThresholdPct : 90;
    const db = await getNightscoutDbSize();
    if (db && db.pct > alertThreshold) {
      const connected = getNightscoutWriteStatus().configured;
      const offerPrompt = filters.offerClearout !== false
        ? ` END the report by asking whether to clear it out, in your own words - e.g. "Shall I clear out your Mongo database? It's nearly full." If they say yes, call clearOldNightscoutData; if they say no, leave it.`
        : '';
      let line = connected
        ? `LAST ITEM - Nightscout database: ${db.pct.toFixed(1)}% full (${db.usedMb} of ${db.maxMb} MB).${offerPrompt}`
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

  // Refresh calendar events cache so deviceIcons and calendar sections have live data
  try {
    await getUpcomingEvents(2);
  } catch (err) {
    console.warn('[MorningReport] Calendar pre-fetch failed:', err.message);
  }

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

const DELIVERY = "HOW TO DELIVER IT - IN YOUR YORKSHIRE ACCENT FROM THE FIRST WORD TO THE LAST (long reports are where it slips; hold the flat northern vowels and never sound an r after a vowel): this report is the one exception to your usual length limit - they ALWAYS want it IN FULL, however long that makes it. Cover EVERY section below and EVERY item within it, in the exact sequential order presented below. STRICT NON-REPETITION RULE: deliver each section and each topic ONCE only in its designated slot. For example, once Omnipod & Sensor Device Status has been stated, NEVER repeat device status or pod/sensor dates later in the briefing or in other sections. Link items where they connect naturally (rain and a run, an overnight low and a planned run, a busy afternoon and a pod change). Understand the metrics: 3.9-10.0 mmol/L is IN RANGE and 5.0 mmol/L is perfectly spot-on, not low. Under 3.0 is very low, 3.0-3.9 is low, 10.0-13.9 is high, and over 13.9 is very high. Tell each news story once in your own words, saying which source it's from; never repeat a story. Never give insulin doses. ";

// The first conversation of the day: offer the report, with its contents ready.
export async function buildMorningReportDirective() {
  const cached = await getOrBuildReportCache({ markNews: false });
  const hour = cached.hour || londonNow().hour;
  const name = hour < 12 ? 'morning report' : 'day report';
  return (cached.whoLine || '') + `This is the user's first conversation with you today. If the user asked for their ${name} or daily briefing directly in their opening turn, DELIVER IT IMMEDIATELY using the contents below without asking first. If they only greeted you, briefly offer their ${name} in one short sentence as part of your greeting, and deliver it when they say yes. ` + DELIVERY + 'CONTENTS: ' + cached.parts.join(' ');
}

// For the getDayReport tool, any time of day.
export async function getDayReport() {
  const cached = await getOrBuildReportCache({ markNews: true });
  const hour = cached.hour || londonNow().hour;
  // IMPORTANT: report is a single concatenated string, NOT an array.
  // Sending it as an array caused Gemini to treat each element as a
  // separate turn item and stop after the first batch (items 0-7) then
  // fire a turnComplete, so training/goals/news/tasks were never spoken.
  const reportText = cached.reportText || cached.parts.join('  ');
  const sectionCount = cached.sectionCount || cached.parts.length;
  const countReminder = `CRITICAL: this report has ${sectionCount} sections. You MUST speak ALL ${sectionCount} sections in exact sequential order without stopping, pausing between turns, or deciding you have covered enough. STRICT NON-REPETITION: each topic (e.g. Omnipod & Sensor Device Status) must only be read once in its place and never repeated later. Do not stop after health or device status - continue straight into training, goals, tours, news, and tasks without any break. `;
  return {
    report: reportText,
    sectionCount,
    instructions: (cached.whoLine || '') + countReminder + DELIVERY + (hour >= 16 ? 'It is later in the day, so frame it as a day report / evening round-up and include tomorrow where given.' : '')
  };
}
