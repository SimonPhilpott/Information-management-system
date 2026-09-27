import { getWebSetupPayload } from './hardwareClientService.js';
import { describeForIms as describeGlucoseForIms } from './glucoseHubService.js';
import { lookUpFood } from './foodService.js';
import { getStatus as getStravaStatus, describeTraining } from './stravaService.js';
import { getUpcomingEvents, describeEvents } from './calendarService.js';
import { listScheduledItems, readList, getHistorySummary } from './remindersService.js';
import { listBirthdays } from './birthdayService.js';
import { getTodayReleases, getWindowResults, getUpcomingReleases } from './musicScanService.js';
import { getNews } from './newsService.js';
import { describeCollectionForIms } from './boardgamesService.js';
import { campaignsForIms } from './campaignsService.js';
import { describeTasksForIms } from './tasksService.js';
import { searchMemories } from '../db/database.js';
import { getWeather } from './weatherService.js';
import { buildReportParts } from './morningReportService.js';
import { pickJoke } from './jokeService.js';
import { executeHardwareRAGSearch, getPersonality } from './hardwareClientService.js';
import config from '../config.js';

// A test prompt from the System Architecture page, run through Ims's brain and traced: the prompt goes to
// Gemini with Ims's own persona and tools (as text rather than live voice), tools that only READ are run
// for real, and anything that would CHANGE something (log carbs, add an event, set a reminder, remember a
// fact...) is described but not done. Every step is reported as it happens, naming the architecture
// page's rows it uses - card key + row title - so the page can light them up.

const MODEL = 'gemini-2.5-flash';
const WAKE = /^\s*(hey|hi|eh up|ey up|oi)?\s*,?\s*(ims|imms|ems)\b/i;

// Which rows each tool uses: connections, data stores and services beyond the tool itself.
const TOOL_ROWS = {
  getCalendarEvents: [['connections', 'Google Calendar'], ['services', 'Core functions - 8']],
  addCalendarEvent: [['connections', 'Google Calendar'], ['services', 'Core functions - 8']],
  getWeather: [['connections', 'Open-Meteo']],
  getBloodGlucose: [['connections', 'Nightscout (Heroku + MongoDB)'], ['data', 'SQLite - app.db'], ['services', 'Health and fitness - 3']],
  logCarbs: [['connections', 'Nightscout (Heroku + MongoDB)'], ['connections', 'AndroidAPS'], ['data', 'SQLite - app.db'], ['services', 'Health and fitness - 3']],
  lookUpFood: [['connections', 'Open Food Facts']],
  clearOldNightscoutData: [['connections', 'Nightscout (Heroku + MongoDB)']],
  getTrainingSummary: [['connections', 'Strava'], ['data', 'SQLite - app.db'], ['services', 'Health and fitness - 3']],
  getNews: [['connections', 'News feeds'], ['services', 'Personal - 4']],
  getNewMusicReleases: [['connections', 'MusicBrainz'], ['services', 'Personal - 4']],
  getBoardGames: [['connections', 'BoardGameGeek'], ['services', 'Personal - 4']],
  getCampaigns: [['connections', 'RingsDB'], ['data', 'SQLite - app.db'], ['services', 'Personal - 4']],
  searchLibrary: [['connections', 'Google Drive'], ['data', 'Vector index (HNSW)'], ['data', 'Library databases'], ['ai', 'gemini-embedding-001']],
  getDayReport: [['connections', 'Open-Meteo'], ['connections', 'Google Calendar'], ['connections', 'News feeds'], ['data', 'SQLite - app.db']],
  startBackgroundTask: [['ai', 'gemini-2.5-flash'], ['data', 'SQLite - app.db'], ['services', 'Core functions - 8']],
  getBackgroundTasks: [['data', 'SQLite - app.db'], ['services', 'Core functions - 8']],
  saveDevIdea: [['data', 'SQLite - app.db'], ['services', 'Customisation and system - 6']],
};
const DB_TOOLS = new Set(['scheduleItem', 'listScheduledItems', 'cancelScheduledItem', 'getScheduleHistory', 'addToList', 'readList', 'removeFromList', 'clearList', 'rememberFact', 'recallMemory', 'forgetMemory', 'getUpcomingBirthdays', 'tellJoke']);
const rowsFor = (name) => [['pipeline', 'function tools'], ...(TOOL_ROWS[name] || []), ...(DB_TOOLS.has(name) ? [['data', 'SQLite - app.db'], ['services', 'Core functions - 8']] : [])];

// Tools that only read, run for real.
const READ_TOOLS = {
  getCalendarEvents: async (a) => { const days = Math.max(1, Math.min(30, Number(a.days ?? 7))); const ev = await getUpcomingEvents(days); return { days, count: ev.length, events: describeEvents(ev) }; },
  listScheduledItems: async () => ({ items: listScheduledItems() }),
  getScheduleHistory: async (a) => getHistorySummary({ type: ['alarm', 'timer', 'reminder'].includes(a.type) ? a.type : null, period: ['today', 'yesterday', 'week', 'month'].includes(a.period) ? a.period : 'yesterday' }),
  readList: async (a) => readList(a.listName),
  recallMemory: async (a) => ({ query: a.query || '', memories: searchMemories(a.query || '').map((m) => m.fact) }),
  getWeather: async (a) => getWeather(a || {}),
  getUpcomingBirthdays: async (a) => {
    const who = String(a.name || '').trim().toLowerCase();
    const days = Math.max(0, Math.min(366, Number(a.withinDays ?? (who ? 366 : 31))));
    const list = listBirthdays().filter((b) => b.daysUntil <= days).filter((b) => !who || `${b.name} ${b.relationship || ''}`.toLowerCase().includes(who));
    return { withinDays: days, count: list.length, birthdays: list.map((b) => ({ name: b.name, relationship: b.relationship, daysUntil: b.daysUntil, turningAge: b.turningAge })) };
  },
  getNewMusicReleases: async (a) => {
    const period = ['today', 'week', 'month', 'upcoming'].includes(a.period) ? a.period : 'week';
    const releases = period === 'upcoming' ? getUpcomingReleases() : period === 'today' ? getTodayReleases()
      : getWindowResults(period === 'week' ? 'week' : 'month').artists.flatMap((x) => x.releases.filter((r) => r.isNew).map((r) => ({ artist: x.name, title: r.title, date: r.date })));
    return { period, count: releases.length, releases: releases.slice(0, 20) };
  },
  getBloodGlucose: async (a) => describeGlucoseForIms(a.period || 'today'),
  getTrainingSummary: async (a) => { const st = getStravaStatus(); if (!st.connected) return { error: 'Strava is not connected.' }; return describeTraining(a.period === 'week' ? 7 : a.period === 'year' ? 365 : 28); },
  lookUpFood: async (a) => lookUpFood(a.food),
  getNews: async (a) => getNews({ topic: a.topic, source: a.source, about: a.about, tours: a.tours }),
  getBoardGames: async (a) => describeCollectionForIms({ query: a.query, players: Number(a.players) || null, maxMinutes: Number(a.maxMinutes) || null, sortBy: a.sortBy || null }),
  getCampaigns: async (a) => ({ campaigns: campaignsForIms({ name: a.name, chronicle: false }) }),
  getBackgroundTasks: async (a) => ({ tasks: describeTasksForIms({ id: a.id, about: a.about }) }),
  getDayReport: async () => { const r = await buildReportParts({ markNews: false }); return { report: r.parts }; },
  tellJoke: async (a) => { const p = pickJoke({ humor: getPersonality().humor, topic: String(a.topic || '') }); return p ? { joke: p.joke } : { error: 'No joke ready.' }; },
  searchLibrary: async (a) => executeHardwareRAGSearch(a.query || '', a.subjects || []),
};

export async function traceTestPrompt(prompt, emit) {
  const text = String(prompt || '').trim().slice(0, 1000);
  if (!text) throw new Error('Type a prompt first.');
  const t0 = Date.now();
  const step = (label, rows, detail = null) => emit({ type: 'step', at: Date.now() - t0, label, rows, detail });

  step('Signed-in session checked', [['owner', 'Simon Philpott'], ['owner', 'Session check on everything'], ['owner', 'Google sign-in (OAuth)']]);
  step('From the web app', [['clients', 'Web app - Ims panel'], ['environment', 'Frontend'], ['environment', 'Backend']]);
  const woke = WAKE.test(text);
  step(woke ? 'Wake phrase heard' : 'No wake phrase - a live conversation would ignore this unless Ims had just spoken; the test carries on', [['pipeline', 'Wake gate']]);
  const setup = getWebSetupPayload().setup;
  step('Persona, rules, services and memories loaded', [['pipeline', 'Persona and context'], ['data', 'SQLite - app.db'], ['data', 'Config files']]);

  // the tools that only make sense in a live voice session (the face's emotion, wake handling, hanging up) are left out
  const LIVE_ONLY = new Set(['setEmotion', 'noWakeDetected', 'endConversation', 'lookAtCamera', 'startRecording']);
  const tools = (setup.tools || []).filter((t) => t.functionDeclarations).map((t) => ({ functionDeclarations: t.functionDeclarations.filter((d) => !LIVE_ONLY.has(d.name)) }));
  // the persona is written for a live voice session - tell it this one is typed, and must be answered
  const sys = { parts: [{ text: `${setup.systemInstruction.parts[0].text}

TEST MODE (System Architecture page): the user has TYPED this request to you instead of speaking it, as a test. Treat it as having been said to you with your wake phrase, and ALWAYS answer it in text, just as you would out loud - call whatever tools you need first.` }] };
  const contents = [{ role: 'user', parts: [{ text }] }];
  const ask = async () => {
    step(`Thinking - ${MODEL} (standing in for the live voice model)`, [['ai', 'gemini-2.5-flash'], ['ai', 'gemini-3.8-live']]);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
      body: JSON.stringify({ systemInstruction: sys, contents, tools }), signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) throw new Error(`Gemini returned HTTP ${res.status}`);
    const cand = (await res.json())?.candidates?.[0];
    return { content: cand?.content || { parts: [] }, finish: cand?.finishReason };
  };

  let answer = '';
  for (let turn = 0; turn < 6; turn++) {
    let { content, finish } = await ask();
    for (let retry = 0; finish === 'MALFORMED_FUNCTION_CALL' && retry < 2; retry++) ({ content, finish } = await ask());
    contents.push({ role: 'model', parts: content.parts || [] });
    const calls = (content.parts || []).filter((p) => p.functionCall).map((p) => p.functionCall);
    const said = (content.parts || []).map((p) => p.text).filter(Boolean).join(' ').trim();
    if (said) answer = said;
    if (!calls.length) break;
    const responses = [];
    for (const call of calls) {
      const args = call.args || {};
      const run = READ_TOOLS[call.name];
      let response;
      if (run) {
        step(`Tool: ${call.name}${Object.keys(args).length ? ` ${JSON.stringify(args).slice(0, 80)}` : ''}`, rowsFor(call.name));
        try { response = await run(args); } catch (err) { response = { error: err.message }; }
      } else if (['setEmotion', 'noWakeDetected', 'endConversation'].includes(call.name)) {
        step(`Tool: ${call.name}`, [['pipeline', 'function tools']]);
        response = { status: 'ok' };
      } else {
        step(`Tool: ${call.name} - test mode, not done (it would change something)`, rowsFor(call.name), args);
        response = { status: 'not done - this is a test from the System Architecture page; say what you WOULD have done, in one sentence' };
      }
      const json = JSON.stringify(response ?? {});
      responses.push({ functionResponse: { name: call.name, response: json.length > 12000 ? { text: json.slice(0, 12000) } : JSON.parse(json) } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  step('Reply spoken in the Yorkshire voice', [['pipeline', 'Audio pacing'], ['ai', 'gemini-3.8-live'], ['clients', 'Web app - Ims panel']]);
  emit({ type: 'done', at: Date.now() - t0, answer: answer || '(no reply)' });
}
