import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWeather } from './weatherService.js';
import { getItemsDueToday, getItemsComingUp } from './remindersService.js';
import { listBirthdays } from './birthdayService.js';
import { getTodayReleases, getWants, getArtistOverrides } from './musicScanService.js';
import { identifyPeopleInView } from './lookService.js';
import { getUpcomingEvents, getEventsOn, describeEvents, getDeviceIcons } from './calendarService.js';
import { getStatus as getStravaStatus, getSummary, listActivities } from './stravaService.js';
import { getCurrentState, getStoredMatch } from './runGlucoseService.js';
import { listGoals, assessGoal } from './goalService.js';
import { getOvernight, getNightscoutDbSize, getNightscoutWriteStatus } from './glucoseHubService.js';
import { getReportNews, tourNewsForReport, markToursTold } from './newsService.js';
import { unreportedTasks } from './tasksService.js';
import { recentCampaignGames } from './campaignsService.js';
import db, { getSetting, setSetting } from '../db/database.js';

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
// A section that failed when the cache was built (weather service briefly down, etc.) must not be served
// for the next 15 minutes - Ims told the user "the weather's unavailable" from a stale cache.
const hasFailedSection = (c) => /Weather: (unavailable right now|could not be retrieved)/.test(c?.reportText || (c?.parts || []).join(' '));

export async function getOrBuildReportCache({ forceRefresh = false, markNews = true } = {}) {
  const now = Date.now();
  if (!forceRefresh && hasFailedSection(memoryReportCache || readReportCacheDisk())) forceRefresh = true;
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

// Hourly pre-warming is run by the scheduler ('morning_report_prewarm' in index.js).

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
    { key: 'includeUpcomingWeek', label: 'Coming Up (After Today)', type: 'boolean', default: true, description: 'Mention items after today - how far ahead is set by the look-ahead slider below.' },
    { key: 'includeAlarms', label: 'Alarms', type: 'boolean', default: true, description: 'Include time-based alarm wakeups.' },
    { key: 'includeReminders', label: 'Reminders & Tasks', type: 'boolean', default: true, description: 'Include standard scheduled reminders.' },
    { key: 'includeTimers', label: 'Active Timers', type: 'boolean', default: true, description: 'Include short-interval running timers.' },
    {
      key: 'lookAhead',
      label: 'Look Ahead',
      type: 'level',
      default: 6,
      levels: [
        '1 day', '2 days', '3 days', '4 days', '5 days', '6 days',
        '1 week', '8 days', '9 days', '10 days', '11 days', '12 days', '13 days', '2 weeks'
      ],
      description: 'How far ahead to mention alarms, reminders, tasks, and timers (1 day up to 2 weeks).'
    }
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
    { key: 'prioritiseFavourites', label: 'Prioritise Favourite Artists', type: 'boolean', default: true, description: 'Lead with artists you have starred as favourites on the Music page.' },
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
    { key: 'maxDaysLookback', label: 'Max Days Lookback', type: 'number', default: 5, min: 1, max: 14, step: 1, description: 'Report as recent if run within this many days.' },
    { key: 'opinion', label: "Ims's Opinion of the Run", type: 'level', default: 1, levels: ['None', 'A word', 'A view', 'Full verdict'], description: 'An honest take - positive and negative - from how it compares with your recent runs: a good effort, slower than usual, a tough one, a long one.' }
  ],
  goals: [
    { key: 'includeVerdict', label: 'Goal Status & Assessment Verdict', type: 'boolean', default: true, description: 'State whether active goals are on track or behind.' },
    { key: 'includeWeeksRemaining', label: 'Weeks Remaining to Target Date', type: 'boolean', default: true, description: 'State countdown to target achievement date.' },
    { key: 'maxGoals', label: 'Max Goals in Report', type: 'number', default: 2, min: 1, max: 5, step: 1, description: 'Maximum number of fitness goals to review.' }
  ],
  tours: [
    { key: 'prioritiseYorkshire', label: 'Prioritise Yorkshire & Northern Venues', type: 'boolean', default: true, description: 'Lead with Leeds, Sheffield, Manchester, and York tour stops.' },
    { key: 'prioritiseFavourites', label: 'Prioritise Favourite Artists', type: 'boolean', default: true, description: 'Lead with artists you have starred as favourites on the Music page - kept in even when the story count is capped.' },
    { key: 'includeLondon', label: 'Include London Shows', type: 'boolean', default: true, description: 'Mention London gigs as secondary alternatives.' },
    { key: 'includeFestivals', label: 'Include UK Music Festivals', type: 'boolean', default: true, description: 'Report festival appearances for library artists (Bloodstock, Download, etc.).' },
    { key: 'lookAhead', label: 'Look Ahead', type: 'level', default: 6, levels: ['1 week', '2 weeks', '3 weeks', '1 month', '6 weeks', '2 months', '3 months', '4 months', '6 months', '9 months', '1 year'], description: 'Only tours with a UK show within this window. Tours with no dates announced yet are kept and flagged.' },
    { key: 'maxTours', label: 'Max Tour Stories', type: 'number', default: 5, min: 1, max: 10, step: 1, description: 'Maximum tour announcements in the daily briefing.' }
  ],
  news: [
    { key: 'minImportance', label: 'Minimum Source Importance Rating', type: 'number', default: 1, min: 1, max: 5, step: 1, description: 'Only include news from sources rated at or above this weight.' },
    { key: 'includeTech', label: 'Technology Feeds', type: 'boolean', default: true, description: 'Include headlines from technology sources.' },
    { key: 'includeLocal', label: 'Local & Regional News', type: 'boolean', default: true, description: 'Include Yorkshire and regional news feeds.' },
    { key: 'includeGeneral', label: 'National / World Headlines', type: 'boolean', default: true, description: 'Include general news coverage.' },
    { key: 'maxHeadlines', label: 'Max Headlines to Report', type: 'number', default: 6, min: 1, max: 12, step: 1, description: 'Cap total stories delivered in briefing.' },
    { key: 'storyDetail', label: 'Story Detail', type: 'level', default: 2, levels: ['Headline only', 'One sentence', 'A few sentences', 'The full story'], description: 'How much Ims says about each story - never just a list of headlines.' }
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

// Detail sliders. Every "include..." filter is a 4-step slider - Off, Brief, Normal, Detailed - rather than an on /
// off switch, so each item can be a passing mention or the full picture. Behaviour switches (prioritise..., offer...,
// mention...) stay as switches. Old saved true / false values read as Normal / Off.
export const DETAIL_LEVELS = ['Off', 'Brief', 'Normal', 'Detailed'];
for (const list of Object.values(SERVICE_SUB_FILTERS)) {
  for (const f of list) {
    if (f.type === 'boolean' && /^include/.test(f.key)) { f.type = 'level'; f.levels = DETAIL_LEVELS; f.default = f.default ? 2 : 0; }
  }
}
const LEVEL_WORDS = ['leave it out', 'brief - a passing mention, a few words', 'a normal sentence or so', 'in detail - every useful fact and number'];
const levelOf = (v, def = 2, max = 3) => (typeof v === 'boolean' ? (v ? 2 : 0) : Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.max(0, Math.min(max, Math.round(Number(v)))) : def);
const maxLevel = (f) => (f.levels ? f.levels.length - 1 : 3);
const schemaFor = (section) => SERVICE_SUB_FILTERS[section.id] || SERVICE_SUB_FILTERS[section.serviceId] || [];
// saved values in the right shape: levels as 0-3 numbers
function normaliseFilters(section, filters) {
  const out = { ...filters };
  // Migrate legacy reminders ahead filters to unified lookAhead if present
  if (section?.id === 'reminders' || section?.serviceId === 'reminders') {
    if (out.lookAhead === undefined) {
      const oldDays = [0, 1, 3, 7, 14, 30, 90, 180];
      const legacyVal = out.remindersAhead ?? out.alarmsAhead ?? out.timersAhead;
      if (legacyVal !== undefined) {
        const legacyIdx = levelOf(legacyVal, 3, oldDays.length - 1);
        const days = Math.min(14, Math.max(1, oldDays[legacyIdx] ?? 7));
        out.lookAhead = days - 1; // Map 1 day to 0, 7 days (1 week) to 6, 14 days (2 weeks) to 13
      }
    }
    delete out.alarmsAhead;
    delete out.remindersAhead;
    delete out.timersAhead;
  }
  for (const f of schemaFor(section)) if (f.type === 'level' && out[f.key] !== undefined) out[f.key] = levelOf(out[f.key], f.default, maxLevel(f));
  return out;
}
// what a section builder sees: level filters as on / off (so "include" checks keep working), levels kept aside
export function prepareSection(section) {
  const filters = { ...(section.subFilters || {}) };
  const levels = {};
  for (const f of schemaFor(section)) {
    if (f.type !== 'level') continue;
    const lv = levelOf(filters[f.key], f.default, maxLevel(f));
    levels[f.key] = lv;
    if (/^include/.test(f.key)) filters[f.key] = lv > 0;
  }
  return { ...section, subFilters: filters, levels };
}
// the "how much to say" line added to each section for Ims
export function detailGuide(section) {
  const levels = section.levels || {};
  const bits = [];
  for (const f of schemaFor(section)) {
    if (f.type !== 'level' || !(f.key in levels)) continue;
    const lv = levels[f.key];
    if (['storyDetail', 'opinion', 'lookAhead'].includes(f.key) || /Ahead$/.test(f.key)) continue; // said in the section's own line
    if (lv > 0) bits.push(`${f.label}: ${LEVEL_WORDS[lv]}`);
  }
  return bits.length ? ` HOW MUCH TO SAY in this section - ${bits.join('; ')}. Say each thing once only in this section; don't repeat it.` : ' Say each thing once only in this section; don\'t repeat it.';
}

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
          const subFilters = normaliseFilters(s, { ...defaultFilterValues, ...(s.subFilters || {}) });
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
    const subFilters = normaliseFilters(s, typeof s.subFilters === 'object' && s.subFilters !== null
      ? { ...defaultFilterValues, ...s.subFilters }
      : defaultFilterValues);

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
  const windLevel = section.levels?.includeWind ?? (filters.includeWind === true ? 2 : 0);
  // wind per part of the day only at Detailed; otherwise one line for the whole day (or none)
  const opts = { conditions: filters.includeConditions !== false, temps: filters.includeTemps !== false, rain: filters.includeRain !== false, wind: windLevel >= 3 };
  const threshold = typeof filters.rainThreshold === 'number' ? filters.rainThreshold : 40;
  const describe = (w, { withTomorrow }) => {
    const p = (w.periods || []).filter((x) => x.name !== 'Overnight');
    const parts = p.map((x) => `${x.name.toLowerCase()} ${periodText(x, opts)}`);
    let line = parts.length ? `rest of today - ${parts.join('; ')}` : `tonight - ${periodText(w.periods?.[0] || {}, opts)}`;
    if (filters.includeHumidity === true && w.current?.humidity_percent != null) line += `; humidity ${w.current.humidity_percent}%`;
    const today = w.forecast?.[0];
    if (windLevel > 0 && windLevel < 3 && today?.wind_words) line += `; wind for the day: ${today.wind_words}${windLevel >= 2 && today.gust_max_mph ? ` (gusts up to ${today.gust_max_mph} mph)` : ''}`;
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
    let home = await getWeather({ days: 2 });
    if (home.error) { await new Promise((r) => setTimeout(r, 1500)); home = await getWeather({ days: 2 }); } // one retry for a brief blip
    if (home.error) return `Weather: unavailable right now (${home.error}). Say so - do not guess.`;
    context.weatherRain = home.today?.rain_probability_percent ?? null;
    const lang = home.description?.language_today;
    let line = `Weather at home (${home.location.split(',')[0]}): ${describe(home, { withTomorrow: filters.includeTomorrow !== false })}.`;
    if (lang) line += ` Words that fit today - rain: ${lang.rain.level} (never say ${lang.rain.avoid.slice(-4).join(', ')})`
      + `; temperature: ${lang.temperature.band}${windLevel > 0 ? `; wind: ${lang.wind.band}` : ''}${lang.extras.length ? `; also ${lang.extras.map((e) => e.kind.replace('_', ' ')).join(', ')}` : ''}. Describe it no stronger or weaker than that.`;
    line += windLevel === 0 ? ' Do not mention the wind at all.' : windLevel < 3 ? ' Mention the wind ONCE for the whole forecast - not for each part of the day.' : '';
    // the facts above are plain English for accuracy; the weather must be SPOKEN in Yorkshire dialect
    if (home.sounds_like?.rest_of_today) line += ` Say the weather in broad Yorkshire dialect in your own words - never read the facts out as listed - something like (style only, vary it${windLevel < 3 ? '; it mentions the wind in every part - you must not' : ''}): "${home.sounds_like.rest_of_today}${filters.includeTomorrow !== false && home.sounds_like.tomorrow ? ` ${home.sounds_like.tomorrow}` : ''}"`;
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
      // 14-step look-ahead from 1 day up to 2 weeks (each step up is 1 day) for all scheduled items
      const AHEAD_DAYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
      let aheadDays = 7;
      if (filters.lookAhead !== undefined || section.levels?.lookAhead !== undefined) {
        const idx = section.levels?.lookAhead ?? levelOf(filters.lookAhead, 6, AHEAD_DAYS.length - 1);
        aheadDays = AHEAD_DAYS[idx] ?? 7;
      } else if (filters.remindersAhead !== undefined || filters.alarmsAhead !== undefined || filters.timersAhead !== undefined) {
        const oldDays = [0, 1, 3, 7, 14, 30, 90, 180];
        const legacyIdx = Math.max(
          section.levels?.alarmsAhead ?? levelOf(filters.alarmsAhead, 3, oldDays.length - 1),
          section.levels?.remindersAhead ?? levelOf(filters.remindersAhead, 3, oldDays.length - 1),
          section.levels?.timersAhead ?? levelOf(filters.timersAhead, 0, oldDays.length - 1)
        );
        aheadDays = Math.min(14, Math.max(1, oldDays[legacyIdx] ?? 7));
      }

      const todayEnd = Date.parse(`${londonNow().dateStr}T23:59:59Z`);
      const soon = aheadDays > 0 ? getItemsComingUp(aheadDays).filter(filterItemType)
        .filter((i) => Date.parse(i.fireAt) <= todayEnd + aheadDays * 86400000 + 3600000) : [];
      if (soon.length) {
        const when = (i) => new Date(i.fireAt).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const span = aheadDays <= 1 ? 'tomorrow' : aheadDays === 7 ? 'this week' : aheadDays === 14 ? 'over the next 2 weeks' : `over the next ${aheadDays} days`;
        lines.push(`Reminders and alarms coming up ${span} (soonest first - say when each one is): ${soon.map((i) => `${i.type} "${i.label || 'unlabelled'}" on ${when(i)}${i.recurrence ? ` (repeats ${i.recurrence})` : ''}`).join('; ')}.`);
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
    const cfg = (() => { try { const c = getReportConfig(); return Array.isArray(c) ? c : (c?.sections || []); } catch { return []; } })();
    if (cfg.some((s) => s.id === 'device_changes' && s.enabled !== false)) {
      today = today.filter((e) => !/\b(omnipod|pod|sensor|libre|cgm)\b/i.test(`${e.title || ''} ${e.summary || ''}`));
    }

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
    const who = (b) => (b.relationship ? `${b.name} - Simon's ${b.relationship.toLowerCase()} -` : b.name);
    const ageStr = (b) => (filters.includeTurningAge !== false && b.turningAge ? ` (turning ${b.turningAge})` : '');
    const desc = birthdays.map((b) => b.isToday ? `${who(b)} has a birthday TODAY${ageStr(b)}` : `${who(b)} has a birthday in ${b.daysUntil} day(s)${filters.includeTurningAge !== false && b.turningAge ? `, turning ${b.turningAge}` : ''}`);
    let line = `Birthdays: ${desc.join('; ')}.`;
    if (section.customNote?.trim()) line += ` Note: ${section.customNote.trim()}.`;
    return line;
  }
  return null;
}

const cleanArtist = (n) => String(n || '').toLowerCase().replace(/\s*[•·|].*$/, '').replace(/\s*[-–]\s*(discography|collection|albums?|complete).*$/i, '').replace(/\s*[\[(].*$/, '').replace(/\s+/g, ' ').trim();
function favouriteArtists() {
  const names = new Set();
  try {
    for (const [name, v] of Object.entries(getArtistOverrides())) {
      if (!v.favourite) continue;
      for (const n of [name, v.searchName, ...(v.aliases || [])]) if (cleanArtist(n)) names.add(cleanArtist(n));
    }
  } catch (_) { /* no music library */ }
  return names;
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

  const favs = filters.prioritiseFavourites !== false ? favouriteArtists() : new Set();
  const isFav = (r) => favs.has(cleanArtist(r.artist));
  if (favs.size) releases = [...releases].sort((a, b) => Number(isFav(b)) - Number(isFav(a)));

  if (releases.length > 0) {
    const desc = releases.map((r) => {
      const isWant = wanted.has(`${r.artist}|${r.title}`.toLowerCase());
      const wantNotice = isWant && filters.prioritiseWants !== false ? ' - ON THEIR WANT LIST, so lead with this one' : '';
      const favNotice = isFav(r) ? ' - ONE OF THEIR FAVOURITE ARTISTS, so give it pride of place' : '';
      return `${r.artist} - "${r.title}" (${r.type})${wantNotice}${favNotice}`;
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
        // the calendar entry's time goes here, since the calendar section leaves pod changes to this one
        let at = '';
        try {
          await getUpcomingEvents(2);
          const ev = getEventsOn(londonNow().dateStr).find((e) => e.time && /\b(omnipod|pod)\b/i.test(e.title || ''));
          if (ev) at = `, at ${ev.time}`;
        } catch (_) { /* no time then */ }
        devBits.push(`an Omnipod change is due today${at}`);
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
          const opinionLevel = section.levels?.opinion ?? 1;
          if (opinionLevel > 0) line += ` ${runOpinion(last, opinionLevel)}`;
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

// What Ims's opinion of a run is based on: how it compares with the last 90 days of runs - pace (and where it ranks),
// distance (usual and longest), climb, heart rate, the session type, how hard it felt if logged, and any low.
// Then how much opinion to give: a word, a view, or a full verdict - honest both ways, never invented.
function runOpinion(run, level) {
  const km = (run.distance || 0) / 1000;
  const pace = km ? run.moving_time / 60 / km : null;
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const others = db.prepare(`SELECT id, distance, moving_time, elevation, avg_hr FROM strava_activities WHERE sport IN ('Run','TrailRun','VirtualRun') AND day >= ? AND distance >= 1500 AND moving_time > 0 AND id != ?`).all(since, run.id);
  const med = (xs) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
  const facts = [];
  if (others.length >= 3 && pace) {
    const paces = others.map((o) => o.moving_time / 60 / (o.distance / 1000));
    const medPace = med(paces);
    const diff = Math.round(((pace - medPace) / medPace) * 100);
    const rank = paces.filter((p) => p < pace).length + 1;
    facts.push(`pace ${paceText(pace)} against a usual ${paceText(medPace)} (${diff === 0 ? 'about the same' : diff < 0 ? `${-diff}% faster` : `${diff}% slower`}; ${rank === 1 ? 'the fastest' : `${rank}${rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'} fastest`} of ${others.length + 1} runs in 90 days)`);
    const medKm = med(others.map((o) => o.distance / 1000));
    const longest = Math.max(...others.map((o) => o.distance / 1000));
    facts.push(`distance ${km.toFixed(1)} km against a usual ${medKm.toFixed(1)} km${km > longest ? ' - the longest in 90 days' : km >= longest * 0.9 ? ' - one of the longest' : km < medKm * 0.7 ? ' - a short one' : ''}`);
    const climb = run.elevation != null && km ? run.elevation / km : null;
    const medClimb = med(others.filter((o) => o.elevation != null).map((o) => o.elevation / (o.distance / 1000)));
    if (climb != null && medClimb != null) facts.push(`climb ${Math.round(climb)} m per km against a usual ${Math.round(medClimb)}${climb > medClimb * 1.5 ? ' (hilly)' : climb < medClimb * 0.5 ? ' (flat)' : ''}`);
    const medHr = med(others.map((o) => o.avg_hr));
    if (run.avg_hr && medHr) facts.push(`average heart rate ${Math.round(run.avg_hr)} against a usual ${Math.round(medHr)}`);
  } else facts.push('not enough recent runs to compare with - judge it on its own');
  if (run.session_tag) facts.push(`it was a ${run.session_tag} session (judge it as one, not on pace)`);
  try {
    const effort = db.prepare('SELECT effort FROM run_session WHERE activity_id = ?').get(run.id)?.effort;
    if (effort) facts.push(`they said it felt ${effort}/10`);
    const notes = db.prepare('SELECT n.text FROM run_note n JOIN run_session s ON s.id = n.session_id WHERE s.activity_id = ? ORDER BY n.id LIMIT 3').all(run.id).map((n) => n.text);
    if (notes.length) facts.push(`their notes: "${notes.join('"; "')}"`);
  } catch (_) { /* no run learning yet */ }
  try {
    const m = getStoredMatch(run.id);
    if (m?.stats?.bgMin != null) facts.push(`glucose lowest ${m.stats.bgMin}${m.stats.hypoWithin2h ? ', with a low within two hours after' : ''}`);
  } catch (_) { /* no glucose */ }
  const how = [
    '',
    'Add a quick honest word of opinion on the run - a few words, like "a good solid effort", "a tough one, that", "not your quickest", "a proper long one" - picked from the comparisons below.',
    'Give your honest opinion of the run in a sentence or two, like a mate who runs: praise what was genuinely good, and say plainly what was not (slower than usual, short, a low) - kind, never sugar-coated, never invented.',
    'Give a fuller honest verdict on the run: what was good, what was not, how it compares with their recent runs, and one thing to try next time - positive and negative, from the comparisons below only.',
  ][level];
  return `${how} Compared with the last 90 days: ${facts.join('; ')}.`;
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
    const LOOK_DAYS = [7, 14, 21, 30, 42, 60, 90, 120, 180, 270, 365];
    const aheadIdx = section.levels?.lookAhead ?? levelOf(filters.lookAhead, 6, 10);
    const aheadDays = LOOK_DAYS[aheadIdx] ?? 90;
    const aheadLabel = ['1 week', '2 weeks', '3 weeks', '1 month', '6 weeks', '2 months', '3 months', '4 months', '6 months', '9 months', '1 year'][aheadIdx] || '3 months';
    // a tour announced a while back can still be months away, so look further back for longer windows
    let tours = await tourNewsForReport({ days: Math.min(45, Math.max(4, Math.round(aheadDays / 4))) });
    // only tours with a UK show inside the window; ones with no dates yet stay, flagged
    tours = tours.filter((t) => !t.nextShow || t.nextShow <= Date.now() + aheadDays * 86400000);

    if (filters.includeFestivals === false) {
      tours = tours.filter(t => !/fest|festival/i.test(t.headline || '') && !/festival/i.test(t.places?.join(' ') || ''));
    }
    if (filters.includeLondon === false) {
      tours = tours.filter(t => !t.places?.includes('London') || t.places?.length > 1);
    }
    const favs = filters.prioritiseFavourites !== false ? favouriteArtists() : new Set();
    const isFav = (t) => favs.has(cleanArtist(t.artist));
    if (favs.size) tours = [...tours].sort((a, b) => Number(isFav(b)) - Number(isFav(a)));
    tours = tours.slice(0, maxTours);
    if (context.markNews !== false) markToursTold(tours); // previews and examples don't use them up
    const when = (t) => (t.showYearOnly ? `, UK dates in ${new Date(t.nextShow).getFullYear()} (exact dates not given yet)` : t.nextShow ? `, next UK show ${new Date(t.nextShow).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', ...(new Date(t.nextShow).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })}` : ', dates not given yet');

    if (tours.length) {
      let line = `UK TOUR NEWS for bands in their music library (lead the news with these; ${favs.size ? 'their FAVOURITE artists first, ' : ''}Leeds, Sheffield, Manchester or York matter most, then the rest of the north; London is only a maybe - say where they're playing): ${tours.map((t) => `[${t.artist}${isFav(t) ? ' - A FAVOURITE' : ''}, playing ${t.places.join(', ')}${when(t)}] ${t.headline}`).join(' | ')}. (Looking ${aheadLabel} ahead - say when each one is.)`;
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
      const storyLevel = levelOf(filters.storyDetail, 2);
      const storyHow = ['the headline in your own words, a single short line', 'one sentence on what happened', 'two or three sentences: what happened and why it matters to them', 'the full story: what happened, the background and why it matters'][storyLevel];
      let line = `News and interests - TELL the stories, don't rattle off a list of headlines: introduce each one naturally, say which source, and give ${storyHow}; link a story to them where it fits. Importance 1-5 is how much each source matters to them - lead with and give more time to the higher ones: ${news.map((n) => `[${n.source}, importance ${n.importance}${n.alsoIn ? `; also covered by ${n.alsoIn.join(', ')}` : ''}] ${n.headline}${n.summary ? ` - ${n.summary}` : ''}`).join(' | ')}.`;
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

// One section's line for Ims: built from its data with the sliders applied, plus how much to say.
export async function buildSectionLine(section, context = { hour: londonNow().hour, weatherRain: null, markNews: false }) {
  if (section.type === 'custom' || !SECTION_BUILDERS[section.id]) return buildCustomSection(section, context);
  const prepared = prepareSection(section);
  const line = await SECTION_BUILDERS[section.id](prepared, context);
  return line && String(line).trim() ? `${String(line).trim()}${detailGuide(prepared)}` : line;
}

// Everything in the report, as short plain lines. Formulated according to the
// user-configured subject order and enabled preferences.
export async function buildReportParts({ markNews = true, sections = null } = {}) {
  const parts = [];
  const titles = [];
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

  const configuredSections = Array.isArray(sections) ? sections : getReportConfig();

  for (const section of configuredSections) {
    if (section.enabled === false) continue;

    try {
      let partLine = null;
      partLine = await buildSectionLine(section, context);
      if (partLine && typeof partLine === 'string' && partLine.trim()) {
        parts.push(partLine.trim());
        titles.push(section.title);
      }
    } catch (err) {
      console.warn(`[MorningReport] Section "${section.id}" (${section.title}) failed:`, err.message);
    }
  }

  return { whoLine, parts, titles, hour };
}

// How the report is delivered: in the active persona's accent and sign-offs (never a fixed accent).
const signOffExamples = () => { const s = signOffs(); return (s.length ? s : ["and that's your lot", "that's your day sorted"]).slice(0, 3).map((x) => `\"${x}\"`).join(", "); };
const DELIVERY = () => "HOW TO DELIVER IT - IN YOUR " + String(accentLabel() || "own").toUpperCase() + " ACCENT FROM THE FIRST WORD TO THE LAST (long reports are where it slips - hold it right to the end): ONE CONTINUOUS REPORT: go straight into the first section - no preview, headline summary or list of what is coming first, and no pause partway asking whether to go on. this report is the one exception to your usual length limit - they ALWAYS want it IN FULL, however long that makes it. Cover EVERY section below and EVERY item within it, in the exact sequential order presented below. STRICT NON-REPETITION RULE: deliver each section and each topic ONCE only in its designated slot. For example, once Omnipod & Sensor Device Status has been stated, NEVER repeat device status or pod/sensor dates later in the briefing or in other sections. Link items where they connect naturally (rain and a run, an overnight low and a planned run, a busy afternoon and a pod change). Understand the metrics: 3.9-10.0 mmol/L is IN RANGE and 5.0 mmol/L is perfectly spot-on, not low. Under 3.0 is very low, 3.0-3.9 is low, 10.0-13.9 is high, and over 13.9 is very high. Tell each news story once in your own words, saying which source it's from - a story, not a list of headlines; never repeat a story. Follow each section's HOW MUCH TO SAY exactly - brief means a passing mention, and something mentioned once is not mentioned again. Never give insulin doses. No medical disclaimers or referrals. FINISH PROPERLY: after the last item, wrap the whole report up with a short warm sign-off in your own words - something like " + signOffExamples() + " - different each time; never just stop after the last item. If the last item asks them a question (like clearing the Nightscout database), sign off just before asking it, so the question is the last thing they hear. ";

// The first conversation of the day: offer the report, with its contents ready.
export async function buildMorningReportDirective() {
  const cached = await getOrBuildReportCache({ markNews: false });
  const hour = cached.hour || londonNow().hour;
  const name = hour < 12 ? 'morning report' : 'day report';
  return (cached.whoLine || '') + `This is the user's first conversation with you today. If the user asked for their ${name} or daily briefing directly in their opening turn, DELIVER IT IMMEDIATELY using the contents below without asking first. If they only greeted you, briefly offer their ${name} in one short sentence as part of your greeting, and deliver it when they say yes. ` + DELIVERY() + 'CONTENTS: ' + cached.parts.join(' ');
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
  const countReminder = `START: your very first words are the first section of the report - say nothing about any later item (birthdays, pod or sensor changes, reminders) before its own section, and speak it as one unbroken reply. CRITICAL: this report has ${sectionCount} sections. You MUST speak ALL ${sectionCount} sections in exact sequential order without stopping, pausing between turns, or deciding you have covered enough. STRICT NON-REPETITION: each topic (e.g. Omnipod & Sensor Device Status) must only be read once in its place and never repeated later. Do not stop after health or device status - continue straight into training, goals, tours, news, and tasks without any break. `;
  return {
    report: reportText,
    sectionCount,
    instructions: (cached.whoLine || '') + countReminder + DELIVERY() + (hour >= 16 ? 'It is later in the day, so frame it as a day report / evening round-up and include tomorrow where given.' : '')
  };
}


// ---- an example of one section, as Ims would say it ----
import { GoogleGenerativeAI as _GenAI } from './geminiClient.js';
import _config from '../config.js';
import { loadPersonaRules as _persona } from './hardwareClientService.js';
import { accentLabel, signOffs } from './personaService.js';
export async function sampleSection(section) {
  let line = await buildSectionLine(section, { hour: londonNow().hour, weatherRain: null, markNews: false });
  // Nothing real to say today (no birthdays coming, no new releases...): make up realistic example data so the
  // settings can still be seen in action - clearly marked as made up.
  let dummy = false;
  if (!line) {
    dummy = true;
    const prepared = prepareSection(section);
    const offItems = schemaFor(section).filter((f) => f.type === 'level' && prepared.levels?.[f.key] === 0).map((f) => f.label);
    line = `THERE IS NO REAL DATA FOR THIS SECTION TODAY. Invent realistic, plausible example data for a "${section.title}" section (${section.description || 'part of the day report'}) for the user - Simon, who lives in Garforth near Leeds, has type 1 diabetes, runs, loves metal and rock music, and plays card games with his brother Daniel - then say it as you would in the report.${offItems.length ? ` Leave out completely: ${offItems.join(', ')}.` : ''}${detailGuide(prepared)}${section.customNote?.trim() ? ` Note: ${section.customNote.trim()}.` : ''}`;
  }
  const model = new _GenAI(_config.gemini.apiKey).getGenerativeModel({ model: 'gemini-2.5-flash' });
  const prompt = `${_persona() || ''}

You are Ims. Below is ONE section of the user's day report with ${dummy ? 'instructions to make up example data' : "today's real data and instructions"}. Write exactly what you would SAY for this section in the report - spoken words only, no headings, no lists, no stage directions, no greeting or sign-off - in your broad Yorkshire voice, English only, no self-corrections or false starts. Follow the HOW MUCH TO SAY guidance exactly and mention each thing once.

SECTION: ${section.title}
${line}`;
  const out = (await model.generateContent(prompt)).response.text().trim();
  return { text: out, line, dummy, reason: dummy ? 'No real data for this today - this example uses made-up data so you can hear how the section would sound.' : null };
}

// The whole report as Ims would say it, section by section, from the settings as they are on the page (saved or
// not) - so it can be shaped and read through before he delivers it.
export async function scriptReport(sections = null) {
  const { parts, titles, hour } = await buildReportParts({ markNews: false, sections });
  if (!parts.length) return { script: [], hour };
  const model = new _GenAI(_config.gemini.apiKey).getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } });
  const name = hour < 12 ? 'morning report' : 'day report';
  const prompt = `${_persona() || ''}

You are Ims, delivering the user's ${name}. Below are its sections, in order, with today's real data and instructions. Write exactly what you will SAY for each section - spoken words only, in your broad Yorkshire voice, English only, no self-corrections, no headings or lists. Start the first section with a short natural opener; flow from one section to the next as you would aloud; end the last section with a short warm sign-off of your own (like "and that's your lot", "that's your day sorted", "have a grand day") - unless it asks them a question, in which case sign off just before the question. Follow each section's HOW MUCH TO SAY exactly, and never repeat something already said in an earlier section.
Return JSON: an array with one string per section, in the same order.

${parts.map((p, i) => `SECTION ${i + 1} - ${titles[i]}:\n${p}`).join('\n\n')}`;
  let said = [];
  try { said = JSON.parse((await model.generateContent(prompt)).response.text()); } catch { said = []; }
  return { hour, script: parts.map((p, i) => ({ title: titles[i], text: typeof said[i] === 'string' ? said[i] : null, given: p })) };
}
