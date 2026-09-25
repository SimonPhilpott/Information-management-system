import express from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import net from 'net';
import http from 'http';
import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import config from './config.js';

// ---------------------------------------------------------------------------
// PROCESS-LEVEL CRASH GUARDS
// Without these, any unhandled promise rejection (e.g. from a Gemini API
// timeout during a voice search tool call) will kill the entire Node process
// and take port 3001 offline until the server is manually restarted.
// ---------------------------------------------------------------------------
process.on('uncaughtException', (err) => {
  console.error('[Server] ❌ UNCAUGHT EXCEPTION — server kept alive:', err.message);
  console.error(err.stack);
  // Do NOT call process.exit() — we want the server to stay online.
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] ❌ UNHANDLED PROMISE REJECTION — server kept alive:');
  console.error('  Promise:', promise);
  console.error('  Reason:', reason);
  // Do NOT call process.exit() — we want the server to stay online.
});

// Graceful shutdown ONLY on explicit termination signals
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received — shutting down gracefully.');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('[Server] SIGINT received — shutting down gracefully.');
  process.exit(0);
});

// Import routes
import authRoutes from './routes/auth.js';
import driveRoutes from './routes/drive.js';
import chatRoutes from './routes/chat.js';
import subjectRoutes from './routes/subjects.js';
import usageRoutes from './routes/usage.js';
import pdfRoutes from './routes/pdf.js';
import settingsRoutes from './routes/settings.js';
import notebookRoutes from './routes/notebook.js';
import adminRoutes, { startNgrok } from './routes/admin.js';
import gemsRoutes from './routes/gems.js';
import graphRoutes from './routes/graph.js';
import voiceRoutes from './routes/voice.js';
import memoriesRoutes from './routes/memories.js';
import glucoseHubRoutes from './routes/glucoseHub.js';
import { describeForIms as describeGlucoseForIms, logCarbs, clearOldNightscout, recentCarbs } from './services/glucoseHubService.js';
import { lookUpFood } from './services/foodService.js';
import { isApprovedSession } from './middleware/requireSession.js';
import personaRoutes from './routes/persona.js';
import musicScanRoutes from './routes/musicScan.js';
import birthdayRoutes from './routes/birthdays.js';
import scheduledRouter from './routes/scheduled.js';
import cameraRoutes from './routes/camera.js';
import faceDesignRoutes from './routes/faceDesigns.js';
import wifiRoutes from './routes/wifi.js';
import recordingRoutes from './routes/recordings.js';
import { isRecordingActive, startRecording, stopRecording, appendRecordingText, onRecordingChange, isCancelCommand } from './services/recordingService.js';
import { SqliteSessionStore } from './db/sessionStore.js';
import { onDevicePush, onSchedulePush, onDeviceCapture } from './services/deviceBus.js';
import calendarRoutes from './routes/calendar.js';
import stravaRoutes from './routes/strava.js';
import plannerRoutes from './routes/planner.js';
import goalRoutes from './routes/goals.js';
import { getStatus as getStravaStatus, syncActivities as syncStrava, describeTraining } from './services/stravaService.js';
import { logNightscout } from './services/runGlucoseService.js';
import { refreshEvents, getUpcomingEvents, getDeviceIcons, createEvent, describeEvents, getEventsOn as getCalendarEventsOn } from './services/calendarService.js';
import { getDevicePayload, getStandbyOverride } from './services/faceDesignService.js';
import { pickJoke } from './services/jokeService.js';
import boardgamesRoutes from './routes/boardgames.js';
import peopleRoutes from './routes/people.js';
import lookRoutes from './routes/look.js';
import { getCameraStatus, getFrame, wakeCamera, setFrame, heartbeat, appendDeviceLog } from './services/cameraService.js';
import { askLive } from './services/lookService.js';
import { getAuthStatus } from './services/driveService.js';
import { validateConfiguredModels } from './services/modelService.js';
import { loadHnswFromDisk } from './services/hnswService.js';
import { executeHardwareRAGSearch, getHardwareSetupPayload, recordReplyOpener, recordConversationMemory, getWebPersonaBlock, getPersonality, setPersonality, getCaptureLogging, setCaptureLogging, recordReplyText, getWebSetupPayload, ACCENT_RULE } from './services/hardwareClientService.js';
import { scheduleItem, listScheduledItems, cancelScheduledItem, addToList, readList, removeFromList, clearList, checkDueScheduledItems, stopAllRinging, getActiveScheduledStatus, getItemsDueToday, getHistorySummary } from './services/remindersService.js';
import { getBirthdayFooterStatus, getUpcomingBirthdays, listBirthdays } from './services/birthdayService.js';
import { getTodayReleases, getWindowResults, getUpcomingReleases , getWants as getMusicWants } from './services/musicScanService.js';
import { isFirstInteractionToday, markMorningReportOffered, buildMorningReportDirective, getDayReport } from './services/morningReportService.js';
import { getNews } from './services/newsService.js';
import newsRoutes from './routes/news.js';
import tasksRoutes from './routes/tasks.js';
import phrasesRoutes from './routes/phrases.js';
import { matchesWake, matchesStop } from './services/phrasesService.js';
import { createTask, describeTasksForIms } from './services/tasksService.js';
import { addMemory, getMemories, searchMemories, deleteMemory } from './db/database.js';
import { getWeather } from './services/weatherService.js';
import { startGlucosePoller, getGlucoseData } from './services/glucoseService.js';
import { checkAndTriggerNightlyScan } from './services/musicScanService.js';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Ensure data directories exist
const dataDirs = ['data', 'data/pdfs', 'data/vectors'];
for (const dir of dataDirs) {
  fs.mkdirSync(path.join(__dirname, dir), { recursive: true });
}

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow localhost, local network IPs, nip.io domains, ngrok domains, or fallback
    if (!origin ||
      origin.match(/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/) ||
      origin.match(/^http:\/\/192\.168\.\d+\.\d+\.nip\.io(:\d+)?$/) ||
      origin.match(/^https:\/\/[a-zA-Z0-9-]+\.(ngrok-free\.app|ngrok-free\.dev)$/)) {
      callback(null, true);
    } else {
      callback(null, config.clientUrl);
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
const sessionMiddleware = session({
  store: new SqliteSessionStore(), // logins survive backend restarts
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set true in production with HTTPS
    maxAge: 180 * 24 * 60 * 60 * 1000 // one sign-in per device lasts; renewed on every visit
  },
  rolling: true
});
app.use(sessionMiddleware);

// Every API call needs this browser to be signed in with an approved Google account. Only the
// sign-in routes themselves are open. The device talks over its own TCP link, not this API.
const requireAdmin = (req, res, next) => {
  if (!req.path.startsWith('/api') || req.path.startsWith('/api/auth')) return next();
  if (isApprovedSession(req)) return next();
  return res.status(401).json({ error: 'Sign in with your Google account to use this.', signInRequired: true });
};

app.use(requireAdmin);
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[API] ${req.method} ${req.path}`);
  }
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notebook', notebookRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/gems', gemsRoutes);
app.use('/api/graph', graphRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/memories', memoriesRoutes);
app.use('/api/glucose-hub', glucoseHubRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/phrases', phrasesRoutes);
app.use('/api/persona-rules', personaRoutes);
app.use('/api/music-scan', musicScanRoutes);
app.use('/api/birthdays', birthdayRoutes);
app.use('/api/camera', cameraRoutes);
app.use('/api/face-designs', faceDesignRoutes);
app.use('/api/wifi', wifiRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/strava', stravaRoutes);
app.use('/api/planner', plannerRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/boardgames', boardgamesRoutes);
app.use('/api/people', peopleRoutes);
app.use('/api/look', lookRoutes);
app.use('/api/alarms', scheduledRouter('alarm'));
app.use('/api/timers', scheduledRouter('timer'));
app.use('/api/reminders', scheduledRouter('reminder'));

app.get('/api/glucose', async (req, res) => {
  try {
    const data = await getGlucoseData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/schedule', (req, res) => {
  try {
    res.json(getActiveScheduledStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static client build in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const server = app.listen(config.port, async () => {
  console.log(`\n🚀 PDF Knowledge Base server running on http://localhost:${config.port}`);
  console.log(`📡 Client expected at ${config.clientUrl}\n`);

  // Start Ngrok if it was previously enabled
  // We add a small delay to ensure external activation scripts (like enable-ngrok.js) have finished
  setTimeout(async () => {
    try {
      console.log('[Ngrok] Checking for auto-start...');
      await startNgrok();
    } catch (err) {
      console.error('[Ngrok] Startup error:', err.message);
    }
  }, 3000);

  // Validate models on startup
  try {
    await validateConfiguredModels();
  } catch (err) {
    console.warn('[ModelCheck] Validation failed, but server starting anyway.');
  }

  // Load HNSW vector index into memory if built
  try {
    await loadHnswFromDisk();
  } catch (err) {
    console.warn('[HNSW] Index load failed at startup:', err.message);
  }
});

// WebSocket Servers for Gemini Live Proxy (Dedicated Browser vs Hardware Endpoints)
const browserWss = new WebSocketServer({ noServer: true });
const imsWebWss = new WebSocketServer({ noServer: true });
const hardwareWss = new WebSocketServer({ noServer: true });
let activeBrowserSession = null;
let activeHardwareSession = null;

// Messages routes want pushed to the device (e.g. previewing a face from the
// Face Designer) - see services/deviceBus.js.
onDevicePush((message) => {
  const ws = activeHardwareSession?.clientWs;
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(message)); } catch (err) { console.error('[DeviceBus] push failed:', err.message); }
  }
});

onSchedulePush(() => pushScheduleStatus());

onDeviceCapture(({ seconds, resolve, reject }) => {
  const ws = activeHardwareSession?.clientWs;
  if (!ws || ws.readyState !== WebSocket.OPEN || !ws.capturePhrase) return reject(new Error('The IMS device is not connected.'));
  ws.capturePhrase(seconds).then(resolve, reject);
});

// Google Calendar: refresh every 5 minutes (also applies any "remind" rules)
// and re-send the icons. Silent no-op until the user has connected Calendar.
const refreshCalendar = () => refreshEvents({ force: true }).then(() => pushScheduleStatus()).catch((err) => console.error('[Calendar] refresh failed:', err.message));
// Strava: once connected, pull anything new every 30 minutes (well inside the rate limits).
const refreshStrava = () => { const st = getStravaStatus(); if (st.connected && st.canReadActivities) syncStrava().catch((err) => console.error('[Strava] sync failed:', err.message)); };
// Nightscout only keeps a few hours, so glucose / IOB / treatments are logged locally every
// 5 minutes; that log is what runs are matched against (services/runGlucoseService.js).
const logGlucoseHistory = () => logNightscout().catch((err) => console.error('[NightscoutLog]', err.message));
setTimeout(logGlucoseHistory, 15000);
setInterval(logGlucoseHistory, 5 * 60 * 1000);
setTimeout(refreshStrava, 20000);
setInterval(refreshStrava, 30 * 60 * 1000);
setTimeout(refreshCalendar, 10000);
setInterval(refreshCalendar, 5 * 60 * 1000);

// Weather for the device footer, refreshed every 30 minutes.
let deviceWeather = null;
const weatherKind = (c, day) => (/thunder/i.test(c) ? 'storm' : /snow/i.test(c) ? 'snow' : /rain|drizzle|shower/i.test(c) ? 'rain' : /fog/i.test(c) ? 'fog'
  : /clear|sunny|mainly clear/i.test(c) ? (day ? 'sun' : 'moon') : /partly/i.test(c) ? (day ? 'partsun' : 'cloud') : 'cloud');
const refreshDeviceWeather = () => getWeather({}).then((w) => {
  if (w?.current) { deviceWeather = { tempC: w.current.temperature_c, weather: weatherKind(w.current.condition, w.current.is_daylight) }; pushScheduleStatus(); }
}).catch(() => {});
setTimeout(refreshDeviceWeather, 20000);
setInterval(refreshDeviceWeather, 30 * 60 * 1000);

// The footer line: the soonest timer (the device counts it down), otherwise the next thing today.
function deviceInfo() {
  const info = { ...(deviceWeather || {}) };
  try {
    const items = listScheduledItems();
    const timer = items.filter((i) => i.type === 'timer').sort((a, b) => a.secondsFromNow - b.secondsFromNow)[0];
    if (timer) { info.timerSec = timer.secondsFromNow; info.timerLabel = timer.label || ''; }
    const now = new Date();
    const hm = now.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
    const today = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    const next = [];
    for (const e of getCalendarEventsOn(today)) if (e.time && e.time > hm) next.push({ time: e.time, what: e.title || e.summary || 'Event' });
    for (const i of items.filter((x) => x.type !== 'timer')) {
      const d = new Date(i.fireAt);
      if (d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) === today) next.push({ time: d.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }), what: i.label || (i.type === 'alarm' ? 'Alarm' : 'Reminder') });
    }
    next.sort((a, b) => a.time.localeCompare(b.time));
    if (next[0]) info.next = `${next[0].time} ${next[0].what}`.slice(0, 40);
    info.upcoming = next.slice(0, 6).map((n) => `${n.time} ${n.what}`.slice(0, 40));
  } catch (err) { console.error('[Schedule] Footer info failed:', err.message); }
  return info;
}

export function pushScheduleStatus(targetWs = null) {
  const ws = targetWs || activeHardwareSession?.clientWs;
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      // Bundles alarms/timers/reminders (counts, not just booleans, so the
      // footer can show a number badge) with birthdays and today's new music
      // releases - one message covers the whole left-of-face icon stack,
      // since all of it is refreshed together on the same 15s poll (see the
      // setInterval below) regardless of which single thing actually changed.
      const status = {
        ...getActiveScheduledStatus(),
        birthday: getBirthdayFooterStatus(),
        newReleases: { count: getTodayReleases().length },
        camera: (({ attached, awake }) => ({ attached, awake }))(getCameraStatus()),
        recording: { active: isRecordingActive() },
        calendar: { icons: getDeviceIcons() },
        standbyFace: getStandbyOverride(),
        info: deviceInfo()
      };
      ws.send(JSON.stringify({
        schedule: status
      }));
      console.log(`[Schedule] Pushed status to hardware client:`, status);
    } catch (err) {
      console.error('[Schedule] Failed to push status:', err.message);
    }
  }
}

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (pathname === '/api/live' || pathname === '/api/ims-live') {
    // Browser voice sockets reach Ims's tools (glucose, memories, calendar...), so they need
    // the same signed-in Google session as the rest of the app.
    sessionMiddleware(request, {}, () => {
      if (!isApprovedSession(request)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      const wss = pathname === '/api/ims-live' ? imsWebWss : browserWss;
      wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
    });
  } else if (pathname === '/api/hardware-live') {
    hardwareWss.handleUpgrade(request, socket, head, (ws) => {
      hardwareWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// The accent drifts to American right after Ims looks something up: a tool result is
// plain neutral English, and the voice follows whatever the text in front of it sounds
// like. So every result that Ims is about to read out carries a reminder to voice it in
// the usual British Yorkshire accent.
const VOICE_REMINDER = () => `DELIVERY REMINDER: ${ACCENT_RULE}`;
function withVoiceReminder(output) {
  return output && typeof output === 'object' && !Array.isArray(output) ? { ...output, deliveryReminder: VOICE_REMINDER() } : output;
}

// While a call/meeting is being recorded the upstream Gemini session is only a
// transcriber: no tools, told to say nothing. (Anything it does say is also
// dropped in handleLiveProxyConnection - this just stops it wasting effort.)
function toSilentSetup(msgStr) {
  try {
    const parsed = JSON.parse(msgStr);
    if (!parsed.setup) return msgStr;
    delete parsed.setup.tools;
    parsed.setup.systemInstruction = {
      parts: [{
        text: 'You are a silent listener. Someone is on a call or in a meeting and this is being transcribed. ' +
          'You must NEVER speak, answer, greet, acknowledge or call any tool, whatever anyone says, even if they address you by name. ' +
          'Produce no output of any kind.'
      }]
    };
    return JSON.stringify(parsed);
  } catch (_) { return msgStr; }
}

// Every (re)connection to Gemini gets the SAVED voice re-applied, and the voice
// actually sent is logged - so the voice can never silently be anything other
// than the one chosen on the IMS Personality screen. Voice-audition setups
// (which carry previewVoice) are left alone, since trying other voices is
// their whole point.
function pinSavedVoice(msgStr, tag, resumptionHandle = null) {
  try {
    const parsed = JSON.parse(msgStr);
    if (!parsed.setup || parsed.setup.previewVoice) return msgStr;
    // Session resumption: when Gemini cycles its upstream session (it does
    // after ~30-40s of quiet), resume WITH the previous session's handle so
    // the conversation's context carries over instead of starting cold and
    // re-greeting. Without a handle this still asks for resumable updates.
    parsed.setup.sessionResumption = resumptionHandle ? { handle: resumptionHandle } : {};
    const voice = getPersonality().voice;
    parsed.setup.generationConfig = parsed.setup.generationConfig || {};
    const was = parsed.setup.generationConfig.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName;
    parsed.setup.generationConfig.speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } };
    console.log(`${tag} 🎙️ Gemini setup voice = ${voice}${was && was !== voice ? ` (corrected from ${was})` : ''}`);
    return JSON.stringify(parsed);
  } catch (_) {
    return msgStr;
  }
}

// "Hey / Hi / Eh up IMS", allowing for how speech-to-text spells the name (Ims, Ems, Eems, Hims...).
const WAKE_RX = /\b(hey|hi|hiya|heya|hello|eh up|ey up|ay up|aye up|ayup|eyup|oi)\b[\s,.!?'-]*(h?[aei]{1,2}m+e?[sz]\b|i\.?\s?m\.?\s?s\b)/i;
// Speech-to-text often mangles the short wake phrase ("Hey IMS" -> "HMs", "Eh up Ims" -> "Anya Pims",
// "Hi IMS" -> "Hiya."). Gemini hears the audio itself, so when it has decided to answer, these
// count too: a name-like word near the start, or a bare greeting. Ordinary sentences don't.
const NAME_TOKEN = /\b(i\.?\s?m\.?\s?s|ims|imz|ems|eems|emms|hims|aims|hms|h\.?\s?m\.?\s?s|pims|mims|m's|ms|him's|hymns?|\w*pms|\w*ims\w*)\b/i;
const GREETING_ONLY = /^\W*(hi|hiya|hi ya|heya|hey|hey up|hello|eh up|ey up|ay up|aye up|ayup|eyup|anya|now then)\W*$/i;
const looksAddressed = (t) => {
  const text = String(t || '').trim();
  const opening = text.split(/\s+/).slice(0, 5).join(' ');
  if (WAKE_RX.test(text) || NAME_TOKEN.test(opening) || GREETING_ONLY.test(text) || matchesWake(text)) return true; // + spellings recorded on /ims/phrases
  // A wake phrase is only a few words, and speech-to-text garbles it differently every time
  // ("Eh up IMS" -> "I am I am", "Ayo Pimsup him's"). For short utterances Gemini's own judgement
  // from the audio decides; only longer sentences with nothing name-like are blocked - that's
  // people talking in the room.
  return text.split(/\s+/).filter(Boolean).length <= 4;
};
// Strict enough to overrule Gemini's own "no wake phrase" verdict: a recorded spelling, the full
// wake phrase, or a short utterance ending in something like the name ("Neyo Pims", "radio Pims").
const heardLikeWake = (t) => {
  const text = String(t || '').trim();
  if (!text) return false;
  if (matchesWake(text) || WAKE_RX.test(text)) return true;
  const words = text.split(/\s+/).filter(Boolean);
  return words.length <= 4 && /\b(\w*pims|\w*pms|ims|ems|eems|him's|hims|hymns?|m's)\W*$/i.test(text);
};
const FOLLOW_UP_MS = 10000; // after Ims stops talking, a reply within this long needs no wake phrase

function handleLiveProxyConnection(ws, isHardware = false, opts = {}) {
  const imsWeb = Boolean(opts.imsWeb);
  const imsBrain = isHardware || imsWeb; // sessions that run Ims's own tools on the server
  const tag = isHardware ? '[HardwareLive]' : imsWeb ? '[ImsWeb]' : '[BrowserLive]';

  // Most connections are just the device sitting in standby, reconnecting
  // periodically with no real interaction at all - creating a folder for
  // every single one of those used to flood audio_captures/ with near-empty
  // junk. Instead there's one single always-on log at audio_captures/debug.log,
  // and a per-connection folder (audio.wav/mic.wav/debug.log) only actually
  // gets created the first time this connection produces real spoken audio
  // (see ensureCaptureFolder(), called from the audioChunks.push() site below)
  // - i.e. a genuine wake-phrase interaction, never a noWakeDetected/silent
  // reconnect. Every log line for this connection is buffered in memory from
  // the start regardless, so a folder that does get created still has the
  // full context leading up to the interaction, not just what happened after.
  const globalLogPath = path.join(__dirname, 'audio_captures', 'debug.log');
  const captureDir = path.join(__dirname, 'audio_captures', `${Date.now()}_${isHardware ? 'hardware' : 'browser'}`);
  const capturePath = path.join(captureDir, 'audio.wav');
  const micCapturePath = path.join(captureDir, 'mic.wav');
  const connectionLogPath = path.join(captureDir, 'debug.log');
  const connectionLogLines = [];
  let captureFolderCreated = false;

  const ensureCaptureFolder = () => {
    if (captureFolderCreated) return;
    // Preferences screen toggle - when off, no per-interaction folder is
    // written at all (the always-on audio_captures/debug.log is unaffected).
    if (!getCaptureLogging()) return;
    captureFolderCreated = true;
    try {
      fs.mkdirSync(captureDir, { recursive: true });
      fs.appendFileSync(connectionLogPath, connectionLogLines.join(''));
    } catch (_) { }
  };

  // Writes to the single global running log always, and buffers into this
  // connection's own in-memory log - only actually written to a folder (and
  // kept live-appended from then on) once ensureCaptureFolder() has fired.
  const logCapture = (line) => {
    try { fs.appendFileSync(globalLogPath, line); } catch (_) { }
    connectionLogLines.push(line);
    if (captureFolderCreated) {
      try { fs.appendFileSync(connectionLogPath, line); } catch (_) { }
    }
  };

  const remoteInfo = ws.socket ? `${ws.socket.remoteAddress}:${ws.socket.remotePort}` : (ws._socket ? `${ws._socket.remoteAddress}:${ws._socket.remotePort}` : 'unknown');
  console.log(`${tag} Client connected from ${remoteInfo}`);
  logCapture(`[${new Date().toISOString()}] ${tag} CLIENT CONNECTED from ${remoteInfo}\n`);
  if (isHardware) ws.isHardwareClient = true;

  // Morning report: kicked off as early as possible (right at raw WS
  // connect, well before the setup handshake message that actually needs
  // it) since building it involves a real network call (getWeather) and the
  // handshake handler below is synchronous. If it hasn't resolved by the
  // time the handshake needs it, morningReportReady stays false and nothing
  // is injected THIS connection - markMorningReportOffered() is only called
  // once it's actually been used, so an unlucky race just means it's offered
  // on the next reconnect/wake instead of being silently lost for the day.
  let morningReportDirective = null;
  let morningReportReady = false;
  let morningOfferPending = false;
  if (isHardware && isFirstInteractionToday()) {
    buildMorningReportDirective().then((text) => {
      morningReportDirective = text;
      morningReportReady = true;
    }).catch((err) => console.error(`${tag} [MorningReport] Failed to build directive:`, err.message));
  }

  // Terminate only the prior session for THIS client type (browser vs hardware do not stomp each other)
  if (isHardware) {
    if (activeHardwareSession && activeHardwareSession.clientWs !== ws) {
      console.warn(`${tag} ⚠️ Terminating previous hardware session`);
      try {
        logCapture(
          `[${new Date().toISOString()}] ${tag} TERMINATING PREVIOUS HARDWARE SESSION (replaced by incoming socket ${remoteInfo})\n`);
      } catch (_) { }
      try {
        if (activeHardwareSession.geminiWs && (activeHardwareSession.geminiWs.readyState === WebSocket.OPEN || activeHardwareSession.geminiWs.readyState === WebSocket.CONNECTING)) {
          activeHardwareSession.geminiWs.close(1000, 'Replaced by new hardware session');
        }
        if (activeHardwareSession.clientWs && activeHardwareSession.clientWs.readyState === WebSocket.OPEN) {
          activeHardwareSession.clientWs.close(1000, 'Replaced by new hardware session');
        }
      } catch (e) {
        console.error(`${tag} Error closing prior hardware session:`, e);
      }
    }
  } else {
    if (activeBrowserSession && activeBrowserSession.clientWs !== ws) {
      console.warn(`${tag} ⚠️ Terminating previous browser session`);
      try {
        if (activeBrowserSession.geminiWs && (activeBrowserSession.geminiWs.readyState === WebSocket.OPEN || activeBrowserSession.geminiWs.readyState === WebSocket.CONNECTING)) {
          activeBrowserSession.geminiWs.close(1000, 'Replaced by new browser session');
        }
        if (activeBrowserSession.clientWs && activeBrowserSession.clientWs.readyState === WebSocket.OPEN) {
          activeBrowserSession.clientWs.close(1000, 'Replaced by new browser session');
        }
      } catch (e) {
        console.error(`${tag} Error closing prior browser session:`, e);
      }
    }
  }

  const apiKey = process.env.GEMINI_API_KEY || config.gemini?.apiKey;
  if (!apiKey) {
    console.error(`${tag} Gemini API key not found in environment`);
    ws.close(1011, 'Gemini API key not configured on server');
    return;
  }

  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
  console.log(`${tag} Connecting to Gemini Live with key prefix: ${apiKey ? apiKey.slice(0, 6) : 'MISSING'}, url length: ${geminiUrl.length}`);
  try {
    logCapture(
      `[${new Date().toISOString()}] ${tag} CONNECTING GEMINI keyPrefix=${apiKey ? apiKey.slice(0, 6) : 'MISSING'}\n`);
  } catch (_) { }

  let currentGeminiWs = null;
  let cachedSetupMsg = null;
  let resumptionHandle = null; // latest Gemini session-resumption handle for this device connection
  let isClientClosed = false;
  const outboundQueue = [];
  let geminiFirstMessageLogged = false;
  let lastModelAudioTime = 0;
  let suppressedMicFrameCount = 0; // see the echo-suppression logging below
  let sessionTranscript = ''; // Gemini's internal "thinking" trace - NOT what it actually says out loud
  let spokenTranscript = '';  // real word-for-word transcript of the spoken audio (outputAudioTranscription)
  let userSpokenTranscript = ''; // real transcript of what the USER said (inputAudioTranscription) - Phase 3 memory
  // Phase 2 variance engine (hardwareClientService.js): the first ~15 words
  // of each real spoken reply, captured once per turn and persisted via
  // recordReplyOpener() so the NEXT session's prompt can steer away from
  // whatever structural pattern has been overused recently.
  let turnOpenerWords = [];
  let turnOpenerSaved = false;
  let turnReplyText = '';

  // Live sessions are billed while open, so an Ims conversation closes after 15 s of silence:
  // nothing heard from the user (transcribed words or typed text), nothing from Ims still
  // playing, and no reply or tool call in progress. The desk goes back to standby; the web app
  // is told the session went to sleep. Room noise doesn't count - only transcribed words do.
  const SILENCE_CLOSE_MS = 15000;
  let lastActivityAt = Date.now();
  let silenceClosedAt = 0; // mic frames still in flight when the session closed are dropped
  let webAudioEndAt = 0;
  const silenceTimer = imsBrain ? setInterval(() => {
    if (isClientClosed || !currentGeminiWs || currentGeminiWs.readyState !== WebSocket.OPEN) return;
    if (!currentTurnComplete) return; // Ims is thinking or speaking
    if (isHardware && isRecordingActive()) return;
    const playingUntil = isHardware ? (paceSentMs ? paceStart + paceSentMs : 0) : webAudioEndAt;
    const quietSince = Math.max(lastActivityAt, playingUntil, turnCompleteAt || 0);
    if (Date.now() - quietSince < SILENCE_CLOSE_MS) return;
    console.log(`${tag} 💤 15 s of silence - closing the Gemini session`);
    silenceClosedAt = Date.now();
    try { logCapture(`[${new Date().toISOString()}] ${tag} SILENCE CLOSE (15s)\n`); } catch (_) { }
    isConversationActive = false;
    touchToTalkActive = false;
    try { currentGeminiWs.close(1000, 'Silence timeout'); } catch (_) { }
    currentGeminiWs = null;
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(isHardware ? { cancelConversation: true } : { sessionIdle: true }));
  }, 1000) : null;

  // Audio pacing for the device. Gemini generates speech much faster than it plays (a 45 s
  // report arrives in ~10 s), and the device can only hold ~33 s of audio - once that fills,
  // chunks get dropped and the speech sounds sped up. So audio is released no more than
  // PACE_LEAD_MS ahead of playback. Control messages that must follow the audio (turnComplete,
  // text) go through the same queue so their order is kept.
  const PACE_LEAD_MS = 15000;
  const PCM_BYTES_PER_MS = 48; // 24 kHz, 16-bit mono from Gemini
  const paceQueue = [];
  let paceTimer = null, paceSentMs = 0, paceStart = 0;
  const pacePump = () => {
    while (paceQueue.length) {
      const now = Date.now();
      if (paceSentMs && now - paceStart > paceSentMs + 2000) paceSentMs = 0; // device has played everything: new window
      if (!paceSentMs) paceStart = now;
      const item = paceQueue[0];
      if (item.bin && paceSentMs - (now - paceStart) > PACE_LEAD_MS) break;
      if (judgePendingUntil && now < judgePendingUntil) break; // waiting to confirm he was addressed
      paceQueue.shift();
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (item.bin) { ws.send(item.bin, { binary: true }); paceSentMs += item.bin.length / PCM_BYTES_PER_MS; }
      else ws.send(item.json);
    }
    if (!paceQueue.length && paceTimer) { clearInterval(paceTimer); paceTimer = null; }
  };
  const paceSend = (item) => {
    paceQueue.push(item);
    pacePump();
    if (paceQueue.length && !paceTimer) paceTimer = setInterval(pacePump, 40);
  };
  const paceFlush = () => {
    paceQueue.length = 0;
    paceSentMs = 0;
    if (paceTimer) { clearInterval(paceTimer); paceTimer = null; }
  };
  // Tracks whether Gemini sent a turnComplete for the current generation turn.
  // Used to detect mid-turn disconnects (Gemini closes code=1000 before the turn
  // finished) and synthesise the missing turnComplete so the device does not
  // get stuck in SPEAKING state with a partially-played response.
  let currentTurnComplete = true; // true initially (no active turn yet)
  // Guard against unsolicited replies. Gemini sometimes starts a new turn on its
  // own right after finishing one (seen: it re-said the last sentence of an
  // answer, unprompted). A genuine turn always follows something the user did
  // since the last turn ended: real speech on the mic, a transcription of it, or
  // a text turn from the device (reminder announcement, voice preview). A model
  // turn that follows none of those is dropped - nothing reaches the speaker.
  let energeticMicFrames = 0;
  let userTranscriptSeen = false;
  let textTurnSent = false;
  let unsolicitedTurn = false;
  // Triggers are only cleared once a turn that actually SPOKE has finished. Gemini
  // reports a tool call (e.g. the wake-phrase check) as its own finished turn, and
  // its real answer follows it a moment later - that answer is still a reply to
  // the same user speech and must not be dropped.
  let turnHadAudio = false;
  const turnHasTrigger = () => energeticMicFrames >= 8 || userTranscriptSeen || textTurnSent;
  const resetTurnTriggers = () => { energeticMicFrames = 0; userTranscriptSeen = false; textTurnSent = false; stopWindow = ''; heardThisTurn = ''; heardStartAt = 0; };
  // Wake gate (desk only): Ims may only speak when what was just heard contains a wake phrase,
  // or it is a follow-up that started within FOLLOW_UP_MS of him finishing - or a tap / device text.
  let heardThisTurn = '';
  // Carbs go to Nightscout and AAPS takes them in, so they are only sent after Ims has proposed a
  // number and the user has answered since (spoken or typed) - see the logCarbs handler.
  let pendingCarbs = null;
  let lastUserInputAt = 0;
  let heardStartAt = 0;
  let followUpUntil = 0;
  let judgePendingUntil = 0; // Gemini started replying before the transcript arrived: hold his voice until we can check
  let stopWindow = ''; // the last few words the user said, for the "IMS stop" command

  // "IMS stop" / "stop IMS" at any point - including while Ims is "thinking" - cancels
  // the whole conversation: nothing more is said, Gemini's work is abandoned (its
  // connection is closed) and the device goes back to plain standby. Silent.
  const cancelConversation = () => {
    console.log(`${tag} ✋ Stop command heard - cancelling the conversation, back to standby`);
    try { logCapture(`[${new Date().toISOString()}] ${tag} STOP COMMAND - CONVERSATION CANCELLED\n`); } catch (_) { }
    isConversationActive = false;
    touchToTalkActive = false;
    currentTurnComplete = true;
    turnCompleteAt = Date.now();
    userSpokenTranscript = '';
    spokenTranscript = '';
    resetTurnTriggers();
    paceFlush();
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ cancelConversation: true }));
    if (stopAllRinging() > 0) pushScheduleStatus(); // it also silences a ringing alarm/timer/reminder
    unsolicitedTurn = true; // anything Gemini still sends for the cancelled request is dropped
    restartUpstream();
  };
  let turnCompleteAt = 0; // when currentTurnComplete last flipped true - see isModelSpeakingNow's POST_TURN_ECHO_GRACE_MS

  // Strict session lifecycle state for hardware clients
  let isConversationActive = false;
  let touchToTalkActive = false;

  // Call/meeting recording (services/recordingService.js). While active this
  // connection is strictly silent: see recordingMessage() and the guards below.
  let normalSetupMsg = null; // the real setup, restored when recording ends
  const restartUpstream = () => {
    resumptionHandle = null; // never resume across a normal <-> silent switch
    try {
      if (currentGeminiWs && (currentGeminiWs.readyState === WebSocket.OPEN || currentGeminiWs.readyState === WebSocket.CONNECTING)) {
        currentGeminiWs.close(1000, 'Recording mode changed');
      }
    } catch (_) { }
  };
  const offRecordingChange = isHardware ? onRecordingChange((status) => {
    if (isClientClosed) return;
    userSpokenTranscript = '';
    spokenTranscript = '';
    isConversationActive = false;
    touchToTalkActive = false;
    currentTurnComplete = true;
    if (cachedSetupMsg) {
      cachedSetupMsg = status.active ? toSilentSetup(normalSetupMsg || cachedSetupMsg) : (normalSetupMsg || cachedSetupMsg);
    }
    restartUpstream();
    console.log(`${tag} 🎙️ Recording mode ${status.active ? 'ON - fully silent' : 'OFF'}`);
    pushScheduleStatus(ws);
  }) : null;

  // Everything Gemini sends while recording ends up here instead of the normal
  // handler, so nothing can reach the device: no audio, text, tool effects or
  // turn events. Only the user's words are kept, for the transcript.
  const recordingMessage = (parsed, gWs) => {
    currentTurnComplete = true;
    // The device needs the setup acknowledgement (a control frame, not speech) or it will not stream its mic.
    if (parsed.setupComplete && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ setupComplete: {} }));
    const heard = parsed.serverContent?.inputTranscription?.text;
    if (heard && appendRecordingText(heard)) {
      stopRecording();
      console.log(`${tag} 🎙️ Recording stopped by voice command`);
    }
    for (const call of parsed.toolCall?.functionCalls || []) {
      if (gWs.readyState === WebSocket.OPEN) {
        gWs.send(JSON.stringify({ toolResponse: { functionResponses: [{ response: { output: { status: 'ignored', instruction: 'Stay completely silent.' } }, id: call.id }] } }));
      }
    }
  };

  // Direct Raw Packet Capture: Stream recording to WAV on disk (capturePath
  // defined at the top of this function, inside the per-connection folder)
  const audioChunks = [];
  const captureStartTime = Date.now();
  console.log(`[AudioCapture] 🎙️ Ready to capture (folder only created if this connection gets a real interaction): ${capturePath}`);

  // Mirror capture for the OTHER direction (hardware mic -> Gemini) - the
  // existing AudioCapture above only ever recorded Gemini's spoken replies.
  // Added purely to directly listen to what the ESP32 mic is actually
  // sending, since RMS telemetry alone can't distinguish real intelligible
  // speech from non-zero but garbled/distorted audio, and Gemini's own VAD
  // has been silently failing to ever respond to it.
  // Stereo A/B test concluded (L and R sounded identical, ruling out a
  // channel-mapping bug) - firmware is back to mono capture, so this is a
  // plain single-channel WAV writer again. (micCapturePath also defined at
  // the top of this function.)
  const micAudioChunks = [];
  const flushMicWavToDisk = () => {
    if (!isHardware || micAudioChunks.length === 0 || !captureFolderCreated) return;
    try {
      const totalPcmBytes = micAudioChunks.reduce((acc, c) => acc + c.length, 0);
      const wavHeader = Buffer.alloc(44);
      const sampleRate = 16000;
      const numChannels = 1;
      const bitsPerSample = 16;
      const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
      const blockAlign = numChannels * (bitsPerSample / 8);
      wavHeader.write('RIFF', 0);
      wavHeader.writeUInt32LE(36 + totalPcmBytes, 4);
      wavHeader.write('WAVE', 8);
      wavHeader.write('fmt ', 12);
      wavHeader.writeUInt32LE(16, 16);
      wavHeader.writeUInt16LE(1, 20);
      wavHeader.writeUInt16LE(numChannels, 22);
      wavHeader.writeUInt32LE(sampleRate, 24);
      wavHeader.writeUInt32LE(byteRate, 28);
      wavHeader.writeUInt16LE(blockAlign, 32);
      wavHeader.writeUInt16LE(bitsPerSample, 34);
      wavHeader.write('data', 36);
      wavHeader.writeUInt32LE(totalPcmBytes, 40);
      const finalWav = Buffer.concat([wavHeader, ...micAudioChunks]);
      fs.writeFileSync(micCapturePath, finalWav);
      console.log(`[MicCapture] 💾 SAVED RAW MIC WAV: ${micCapturePath} (${(totalPcmBytes / byteRate).toFixed(2)}s, ${finalWav.length} bytes)`);
    } catch (err) {
      console.error('[MicCapture] Error saving WAV:', err);
    }
  };
  // Flush periodically too, not just on close - a session that never
  // cleanly closes (still connected, or the server restarts) would
  // otherwise never produce a listenable file at all.
  const micFlushInterval = setInterval(flushMicWavToDisk, 5000);
  const geminiFlushInterval = setInterval(() => flushWavToDisk(), 5000);

  const flushWavToDisk = () => {
    if (audioChunks.length === 0 || !captureFolderCreated) return;
    try {
      const totalPcmBytes = audioChunks.reduce((acc, c) => acc + c.length, 0);
      // WAV header (44 bytes) for 24kHz, 16-bit mono PCM
      const wavHeader = Buffer.alloc(44);
      const sampleRate = 24000;
      const numChannels = 1;
      const bitsPerSample = 16;
      const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
      const blockAlign = numChannels * (bitsPerSample / 8);

      wavHeader.write('RIFF', 0);
      wavHeader.writeUInt32LE(36 + totalPcmBytes, 4);
      wavHeader.write('WAVE', 8);
      wavHeader.write('fmt ', 12);
      wavHeader.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
      wavHeader.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
      wavHeader.writeUInt16LE(numChannels, 22);
      wavHeader.writeUInt32LE(sampleRate, 24);
      wavHeader.writeUInt32LE(byteRate, 28);
      wavHeader.writeUInt16LE(blockAlign, 32);
      wavHeader.writeUInt16LE(bitsPerSample, 34);
      wavHeader.write('data', 36);
      wavHeader.writeUInt32LE(totalPcmBytes, 40);

      const finalWav = Buffer.concat([wavHeader, ...audioChunks]);
      fs.writeFileSync(capturePath, finalWav);
      const durationSec = (totalPcmBytes / byteRate).toFixed(2);
      console.log(`[AudioCapture] 💾 SAVED RAW WAV: ${capturePath} (${durationSec}s of audio, ${finalWav.length} bytes)`);

      // Save corresponding full transcript .txt file alongside the .wav file with identical base name
      const txtPath = capturePath.replace(/\.wav$/, '.txt');
      fs.writeFileSync(txtPath, sessionTranscript.trim() || '(No transcript received)');
      console.log(`[TranscriptCapture] 📝 SAVED TRANSCRIPT TXT: ${txtPath} (${sessionTranscript.length} chars)`);

      // The REAL word-for-word transcript of the spoken audio, separate from
      // the thinking-trace .txt above - compare this against the .wav's
      // actual duration/content to tell apart a genuine upstream truncation
      // (this is ALSO incomplete/cuts off) from a local delivery bug (this
      // is complete, but the audio isn't).
      const spokenPath = capturePath.replace(/\.wav$/, '_spoken.txt');
      fs.writeFileSync(spokenPath, spokenTranscript.trim() || '(No spoken transcript received - outputAudioTranscription may not be enabled/supported for this model)');
      console.log(`[TranscriptCapture] 🗣️ SAVED SPOKEN TRANSCRIPT: ${spokenPath} (${spokenTranscript.length} chars)`);
    } catch (err) {
      console.error('[AudioCapture] Error saving WAV/TXT:', err);
    }
  };

  let geminiConnectedAt = 0; // for "how long was this connection alive" in the close log below

  const createGeminiSocket = () => {
    if (isClientClosed) return null;
    const gWs = new WebSocket(geminiUrl);
    geminiConnectedAt = Date.now();
    lastActivityAt = Date.now(); // a fresh session gets its full 15 s before the silence close

    if (isHardware) {
      activeHardwareSession = { clientWs: ws, geminiWs: gWs };
      pushScheduleStatus(ws);
      getGlucoseData().then((glucose) => {
        if (ws.readyState === WebSocket.OPEN && glucose?.value) {
          ws.send(JSON.stringify({
            glucose: { value: glucose.value, direction: glucose.direction, dbPct: glucose.dbPct }
          }));
        }
      }).catch((err) => console.error('[Glucose] Initial device push error:', err.message));
    } else {
      activeBrowserSession = { clientWs: ws, geminiWs: gWs };
    }

    // 15-second WebSocket keep-alive heartbeat ping to prevent intermediate proxy/Cloudflare drops
    const pingInterval = setInterval(() => {
      if (gWs && gWs.readyState === WebSocket.OPEN) {
        gWs.ping();
      }
    }, 15000);

    // Hardware-only: while Gemini is speaking, the device has no acoustic
    // echo cancellation (unlike the browser client's getUserMedia
    // echoCancellation), so real mic audio is withheld to avoid feeding
    // Gemini its own speaker output back as if it were the user barging in.
    // But withholding it means literally nothing is sent as client input for
    // the whole reply - no realtimeInput messages at all, sometimes for
    // 15-20+ seconds - unlike the browser, which always streams continuous
    // (echo-cancelled) audio. That gap looks like the likely cause of the
    // playback cutting off mid-word at unpredictable points: whatever is
    // timing out is timing out on elapsed silence since the last input
    // frame, not on anything about the reply's content. Filling the gap
    // with synthetic silence (rather than real, echo-risky mic audio) keeps
    // input continuous the same way the browser's stream always is, without
    // reintroducing the barge-in problem this suppression exists to prevent.
    // 32ms cadence ~ matches a real 512-sample/16kHz mic chunk.
    let silenceInterval = null;
    if (isHardware) {
      const silenceChunk = Buffer.alloc(1024); // 512 samples x 16-bit mono = 1024 bytes of zero PCM
      const silenceBase64 = silenceChunk.toString('base64');
      silenceInterval = setInterval(() => {
        const isModelSpeakingNow = !currentTurnComplete && (Date.now() - lastModelAudioTime < 800);
        if (isModelSpeakingNow && gWs && gWs.readyState === WebSocket.OPEN) {
          gWs.send(JSON.stringify({
            realtimeInput: {
              audio: { mimeType: 'audio/pcm;rate=16000', data: silenceBase64 }
            }
          }));
        }
      }, 32);
    }

    gWs.on('open', () => {
      console.log(`${tag} Connected to Gemini Live upstream`);
      // If we cached a setup handshake from the client, re-send it on new socket ONLY if outboundQueue doesn't already contain one
      const hasQueuedSetup = outboundQueue.some(m => typeof m === 'string' && m.includes('"setup"'));
      if (cachedSetupMsg && !hasQueuedSetup) {
        console.log(`${tag} Replaying cached setup handshake to Gemini...`);
        gWs.send(pinSavedVoice(cachedSetupMsg, tag, resumptionHandle));
        if (resumptionHandle) console.log(`${tag} 🔁 Resuming previous Gemini session (context preserved)`);
      }
      // Flush queued messages
      while (outboundQueue.length > 0) {
        const msg = outboundQueue.shift();
        console.log(`${tag} Flushing queued message to Gemini...`);
        gWs.send(typeof msg === 'string' && msg.includes('"setup"') ? pinSavedVoice(msg, tag, resumptionHandle) : msg);
      }
    });

    gWs.on('message', (data) => {
      if (!geminiFirstMessageLogged) {
        geminiFirstMessageLogged = true;
        const preview = data.toString().slice(0, 500);
        console.log(`${tag} First Gemini message received:`, preview);
        try {
          logCapture(
            `[${new Date().toISOString()}] ${tag} GEMINI FIRST MSG: ${preview}\n`);
        } catch (_) { }
      }
      const msgStr = data.toString();
      if (msgStr.includes('sessionResumptionUpdate')) {
        try {
          const upd = JSON.parse(msgStr).sessionResumptionUpdate;
          if (upd?.newHandle && upd.resumable !== false) resumptionHandle = upd.newHandle;
        } catch (_) { }
      }
      let parsedAudioBytes = null;
      let parsed = null;
      try {
        parsed = JSON.parse(msgStr);

        if (isHardware && isRecordingActive()) {
          recordingMessage(parsed, gWs);
          return;
        }

        if (isHardware) {
          const heardForStop = parsed.serverContent?.inputTranscription?.text;
          if (heardForStop) {
            stopWindow = (stopWindow + heardForStop).slice(-70);
            if (isCancelCommand(stopWindow) || matchesStop(stopWindow)) { cancelConversation(); return; }
          }
          if (parsed.serverContent?.inputTranscription?.text) {
            userTranscriptSeen = true; unsolicitedTurn = false;
            if (!heardStartAt) heardStartAt = Date.now();
            heardThisTurn = (heardThisTurn + parsed.serverContent.inputTranscription.text).slice(-400);
            if (judgePendingUntil) {
              judgePendingUntil = 0;
              if (!looksAddressed(heardThisTurn)) {
                unsolicitedTurn = true;
                console.warn(`${tag} 🔇 Not addressed to Ims (late transcript) - dropping the held reply. Heard: "${heardThisTurn.slice(0, 80)}"`);
                try { logCapture(`[${new Date().toISOString()}] ${tag} REPLY DROPPED - NOT ADDRESSED (late): "${heardThisTurn.slice(0, 120)}"\n`); } catch (_) { }
                paceFlush();
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ noWakeDetected: true }));
              } else {
                pacePump();
              }
            }
          }
          const startsModelOutput = parsed.serverContent?.modelTurn || parsed.serverContent?.outputTranscription || parsed.toolCall;
          if (startsModelOutput && currentTurnComplete && !unsolicitedTurn && !turnHasTrigger()) {
            // Nothing new from the user since his last reply - Gemini repeating itself. Drop it.
            unsolicitedTurn = true;
            console.warn(`${tag} 🔇 Dropping an unsolicited model turn (nothing from the user since the last one ended)`);
            try { logCapture(`[${new Date().toISOString()}] ${tag} UNSOLICITED MODEL TURN DROPPED
`); } catch (_) { }
            paceFlush();
          }
          if (startsModelOutput && currentTurnComplete && !unsolicitedTurn) {
            const followUp = heardStartAt ? heardStartAt <= followUpUntil : (energeticMicFrames >= 8 && Date.now() <= followUpUntil);
            const addressed = textTurnSent || touchToTalkActive || looksAddressed(heardThisTurn) || followUp;
            if (!addressed && !heardThisTurn.trim()) {
              // No transcript yet - hold his voice for up to 1.5 s until it arrives (see above).
              judgePendingUntil = Date.now() + 1500;
            } else if (!addressed) {
              unsolicitedTurn = true;
              console.warn(`${tag} 🔇 Not addressed to Ims (no wake phrase, not a follow-up) - dropping the reply. Heard: "${heardThisTurn.slice(0, 80)}"`);
              try { logCapture(`[${new Date().toISOString()}] ${tag} REPLY DROPPED - NOT ADDRESSED: "${heardThisTurn.slice(0, 120)}"\n`); } catch (_) { }
              paceFlush();
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ noWakeDetected: true }));
            }
          }
          if (unsolicitedTurn) {
            for (const call of parsed.toolCall?.functionCalls || []) {
              if (gWs.readyState === WebSocket.OPEN) {
                gWs.send(JSON.stringify({ toolResponse: { functionResponses: [{ response: { output: { status: 'acknowledged' } }, id: call.id }] } }));
              }
            }
            if (parsed.serverContent?.turnComplete && !parsed.toolCall) {
              unsolicitedTurn = false;
              currentTurnComplete = true;
              turnCompleteAt = Date.now();
              resetTurnTriggers();
            }
            return;
          }
        }

        // Check for incoming audio parts
        if (parsed.serverContent?.modelTurn?.parts) {
          for (const part of parsed.serverContent.modelTurn.parts) {
            if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
              lastModelAudioTime = Date.now();
              turnHadAudio = true;
              // currentTurnComplete was true -> this chunk starts a NEW turn,
              // so reset the opener-fingerprint tracker (see the
              // outputTranscription handler below) before flipping it false.
              if (currentTurnComplete) {
                turnOpenerWords = [];
                turnOpenerSaved = false;
                turnReplyText = '';
              }
              // Mark this turn as incomplete until Gemini confirms otherwise.
              // Any audio chunk arriving means a generation turn is in flight.
              currentTurnComplete = false;
              // Real spoken audio only ever arrives for a genuine wake-phrase
              // reply, never a noWakeDetected/silent turn - this is the
              // signal that a real interaction happened, so this is the one
              // place a capture folder actually gets created.
              ensureCaptureFolder();
              const rawBytes = Buffer.from(part.inlineData.data, 'base64');
              if (imsWeb) webAudioEndAt = Math.max(webAudioEndAt, Date.now()) + rawBytes.length / 48;
              parsedAudioBytes = rawBytes;
              audioChunks.push(rawBytes);
              const elapsedSec = ((Date.now() - captureStartTime) / 1000).toFixed(2);
              console.log(`[AudioCapture] [${elapsedSec}s] Captured raw chunk: ${rawBytes.length} bytes (Total: ${audioChunks.reduce((a, c) => a + c.length, 0)} bytes)`);
            }
          }
        }

        // Check for native text parts
        if (parsed.serverContent?.modelTurn?.parts) {
          for (const part of parsed.serverContent.modelTurn.parts) {
            if (part.text) {
              sessionTranscript += part.text + "\n";
              console.log(`${tag} [LiveTranscript] Text received from Gemini:`, part.text);
              try {
                logCapture(
                  `[${new Date().toISOString()}] ${tag} GEMINI TEXT: ${part.text}\n`);
              } catch (_) { }
            }
          }
        }

        // The REAL transcript of what Gemini is actually saying out loud -
        // only present when outputAudioTranscription was enabled in setup
        // (see the augmentation above). Arrives incrementally, timed close
        // to the corresponding audio chunk, not as one block at the end.
        if (parsed.serverContent?.outputTranscription?.text) {
          const spokenText = parsed.serverContent.outputTranscription.text;
          spokenTranscript += spokenText;
          if (isHardware && morningOfferPending) { morningOfferPending = false; markMorningReportOffered(); }
          turnReplyText += spokenText;
          console.log(`${tag} [SpokenTranscript] "${spokenText}"`);
          try {
            logCapture(
              `[${new Date().toISOString()}] ${tag} GEMINI SPOKEN TEXT: ${spokenText}\n`);
          } catch (_) { }

          // Phase 2 variance engine: capture just the first ~15 words of this
          // turn's REAL spoken opener (not the thinking trace) and persist it
          // once, the first time this turn accumulates enough words.
          if (isHardware && !turnOpenerSaved) {
            turnOpenerWords.push(...spokenText.split(/\s+/).filter(Boolean));
            if (turnOpenerWords.length >= 15) {
              const opener = turnOpenerWords.slice(0, 15).join(' ');
              recordReplyOpener(opener);
              turnOpenerSaved = true;
              console.log(`${tag} [Variance] Recorded reply opener: "${opener}"`);
            }
          }
        }

        // The user's own words, transcribed (Phase 3 memory needs to know
        // what the user actually said, not just what Ims replied).
        if (parsed.serverContent?.inputTranscription?.text) {
          const heardText = parsed.serverContent.inputTranscription.text;
          if (/[a-z0-9]/i.test(heardText)) lastUserInputAt = Date.now();
          if (/[a-z0-9]/i.test(heardText) && (!isHardware || looksAddressed(heardThisTurn) || Date.now() <= followUpUntil || touchToTalkActive)) lastActivityAt = Date.now();
          userSpokenTranscript += heardText;
          try {
            logCapture(
              `[${new Date().toISOString()}] ${tag} USER SPOKEN TEXT: ${heardText}\n`);
          } catch (_) { }

        }

        if (parsed.serverContent?.interrupted && isHardware) paceFlush(); // the user cut in - drop what hasn't been sent yet
        if (parsed.serverContent?.interrupted) {
          // msSinceOwnAudio small (a couple hundred ms or less) points at the
          // model interrupting ITS OWN in-flight generation (a self-revision,
          // nothing to do with the mic) rather than reacting to delayed
          // user/echo audio arriving - the two look identical in the plain
          // "GEMINI INTERRUPTED" line alone, so this is the number that
          // actually distinguishes them.
          const msSinceOwnAudio = lastModelAudioTime > 0 ? (Date.now() - lastModelAudioTime) : -1;
          console.warn(`${tag} ⚠️ Gemini reported MODEL INTERRUPTED! (${msSinceOwnAudio}ms since its own last audio chunk, ${suppressedMicFrameCount} mic frames suppressed in the current window)`);
          try {
            logCapture(
              `[${new Date().toISOString()}] ${tag} GEMINI INTERRUPTED msSinceOwnAudio=${msSinceOwnAudio} suppressedMicFrames=${suppressedMicFrameCount}\n`);
          } catch (_) { }
        }

        if (parsed.serverContent?.turnComplete) {
          if (!parsed.toolCall) {
            currentTurnComplete = true; // Gemini confirmed the turn ended cleanly
            turnCompleteAt = Date.now();
            if (turnHadAudio) {
              resetTurnTriggers(); turnHadAudio = false;
              const playEnd = isHardware ? (paceSentMs ? paceStart + paceSentMs : Date.now()) : Math.max(Date.now(), webAudioEndAt);
              followUpUntil = playEnd + FOLLOW_UP_MS;
            }
          }
          console.log(`${tag} ✅ Gemini reported TURN COMPLETE (hasToolCall=${!!parsed.toolCall})`);
          try {
            logCapture(
              `[${new Date().toISOString()}] ${tag} GEMINI TURN COMPLETE hasToolCall=${!!parsed.toolCall}\n`);
          } catch (_) { }
          // Fallback for the (very common, given the strict length limit)
          // case where a whole reply never reaches the 15-word threshold in
          // the outputTranscription handler above - record whatever was
          // actually said rather than silently never recording short turns.
          if (isHardware && !turnOpenerSaved && turnOpenerWords.length > 0) {
            recordReplyOpener(turnOpenerWords.join(' '));
            turnOpenerSaved = true;
          }
          if (imsBrain && turnReplyText.trim()) { recordReplyText(turnReplyText); turnReplyText = ''; }
        }

        // DIAGNOSTIC: the thinking-trace text repeatedly says "I'm calling
        // searchLibrary/noWakeDetected" but the handler below (keyed on
        // parsed.toolCall.functionCalls) never actually fires - not once in
        // the whole log history, even before today's model swap. That means
        // either the field is shaped differently than expected, or nested
        // somewhere else in the message. Dump the raw top-level keys (and
        // the toolCall value itself, if the field exists under ANY name) so
        // the actual shape is visible on the next reply instead of guessing.
        const topLevelKeys = Object.keys(parsed);
        if (topLevelKeys.some(k => k.toLowerCase().includes('tool') || k.toLowerCase().includes('call'))) {
          console.log(`${tag} 🐛 RAW message with a tool/call-like key:`, msgStr.slice(0, 2000));
          try {
            logCapture(
              `[${new Date().toISOString()}] ${tag} RAW TOOLCALL-LIKE MSG: ${msgStr.slice(0, 2000)}\n`);
          } catch (_) { }
        }

        // If tool call is issued by Gemini, handle searchLibrary automatically for hardware clients only.
        // Browser clients run their own handleSearchTool() in useGeminiLive.js and respond themselves -
        // auto-responding here too raced it with a second, less-formatted toolResponse for the same
        // call.id, degrading library answers and destabilizing the turn-taking/interrupt state.
        if (imsBrain && parsed.toolCall?.functionCalls) {
          lastActivityAt = Date.now();
          // Shared by every new reminders/lists branch below, all of which
          // are synchronous - reduces 7 near-identical toolResponse blocks to
          // one call each, so a copy-paste slip can't silently mismatch a
          // call.id or skip the OPEN check.
          const respondToToolCall = (call, output) => {
            if (gWs.readyState === WebSocket.OPEN) {
              gWs.send(JSON.stringify({
                toolResponse: { functionResponses: [{ response: { output: withVoiceReminder(output) }, id: call.id }] }
              }));
            }
          };
          for (const call of parsed.toolCall.functionCalls) {
            if (call.name === 'searchLibrary') {
              console.log(`${tag} 🔍 Executing searchLibrary RAG tool for client: "${call.args?.query}"`);
              executeHardwareRAGSearch(call.args?.query || '').then((contextText) => {
                if (gWs.readyState === WebSocket.OPEN) {
                  gWs.send(JSON.stringify({
                    toolResponse: {
                      functionResponses: [{
                        response: { output: withVoiceReminder({ text: contextText }) },
                        id: call.id
                      }]
                    }
                  }));
                  console.log(`${tag} ✅ Sent RAG context back to Gemini for hardware client`);
                }
              }).catch((err) => {
                console.error(`${tag} RAG tool execution error:`, err);
                if (gWs.readyState === WebSocket.OPEN) {
                  gWs.send(JSON.stringify({
                    toolResponse: {
                      functionResponses: [{
                        response: { output: withVoiceReminder({ text: "Search failed: " + err.message }) },
                        id: call.id
                      }]
                    }
                  }));
                }
              });
            } else if (call.name === 'noWakeDetected' && isHardware && heardLikeWake(heardThisTurn)) {
              // Gemini said "no wake phrase", but what it heard is one of the ways the wake phrase
              // actually comes through (recorded on /ims/phrases). Answer instead.
              console.log(`${tag} 🔔 noWakeDetected overridden - "${heardThisTurn.slice(0, 60)}" matches a known wake-phrase spelling`);
              try { logCapture(`[${new Date().toISOString()}] ${tag} NOWAKE OVERRIDDEN: "${heardThisTurn.slice(0, 80)}"\n`); } catch (_) { }
              if (gWs.readyState === WebSocket.OPEN) {
                gWs.send(JSON.stringify({ toolResponse: { functionResponses: [{ response: { output: withVoiceReminder({ status: 'overruled', note: 'That WAS the wake phrase - speech-to-text just mangled it. Reply to the user now.' }) }, id: call.id }] } }));
                gWs.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: `(System: the user just said the wake phrase - it was transcribed as "${heardThisTurn.trim()}". Greet them briefly, or answer if they asked something - in your Yorkshire accent.)` }] }], turnComplete: true } }));
                textTurnSent = true;
              }
            } else if (call.name === 'noWakeDetected' || call.name === 'endConversation') {
              console.log(`${tag} 🔔 ${call.name} tool call from Gemini - forwarding to hardware client`);
              if (call.name === 'noWakeDetected') {
                isConversationActive = false;
                turnWakePhraseVerified = false;
                pendingModelAudioBytes = [];
              }
              if (call.name === 'endConversation') {
                isConversationActive = false;
                touchToTalkActive = false;
                turnWakePhraseVerified = false;
              }
              if (imsBrain && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ [call.name]: true }));
              }
              if (call.name === 'endConversation' && imsBrain) {
                // Phase 3 memory: fire-and-forget, never blocks the tool ack
                // above - a slow/failed summarisation call must not delay
                // the farewell reply reaching the device.
                recordConversationMemory(userSpokenTranscript, spokenTranscript)
                  .catch((err) => console.error(`${tag} [Memory] recordConversationMemory failed:`, err.message));
                // Every goodbye also dismisses any currently-ringing
                // timer/alarm/reminder - harmless no-op if nothing's ringing,
                // so this doesn't need to know whether THIS particular
                // farewell was actually "IMS, stop" for an alert or just an
                // ordinary end of conversation.
                const stopped = stopAllRinging();
                if (stopped > 0) {
                  console.log(`${tag} 🔕 Dismissed ${stopped} ringing alert(s)`);
                  pushScheduleStatus();
                }
              }
              if (gWs.readyState === WebSocket.OPEN) {
                gWs.send(JSON.stringify({
                  toolResponse: {
                    functionResponses: [{
                      response: { output: withVoiceReminder({ status: 'acknowledged' }) },
                      id: call.id
                    }]
                  }
                }));
              }
            } else if (call.name === 'setEmotion') {
              // Cosmetic only (drives the face on the device's screen) - forward
              // the chosen emotion string straight through, no RAG/state logic
              // needed. main.cpp maps the string to its emotion index.
              const emotion = call.args?.emotion || 'neutral';
              console.log(`${tag} 🎭 setEmotion(${emotion}) - forwarding to hardware client`);
              if (imsBrain && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(getDevicePayload(emotion)));
              }
              if (gWs.readyState === WebSocket.OPEN) {
                gWs.send(JSON.stringify({
                  toolResponse: {
                    functionResponses: [{
                      response: { output: withVoiceReminder({ status: 'acknowledged' }) },
                      id: call.id
                    }]
                  }
                }));
              }
            } else if (call.name === 'scheduleItem') {
              try {
                const result = scheduleItem(call.args || {});
                console.log(`${tag} ⏰ scheduleItem:`, result);
                pushScheduleStatus();
                respondToToolCall(call, result);
              } catch (err) {
                console.error(`${tag} scheduleItem failed:`, err.message);
                respondToToolCall(call, { error: err.message });
              }
            } else if (call.name === 'startRecording') {
              console.log(`${tag} 🎙️ startRecording tool call`);
              respondToToolCall(call, { status: 'recording', instruction: 'Recording has started. Say nothing at all from now on.' });
              startRecording(call.args?.withWhom, 'voice');
            } else if (call.name === 'tellJoke') {
              const humor = getPersonality().humor;
              const topic = String(call.args?.topic || '').trim();
              let pick = null;
              try { pick = pickJoke({ humor, topic }); } catch (err) { console.error(`${tag} 😄 tellJoke failed:`, err.message); }
              if (!pick) {
                respondToToolCall(call, { error: 'The joke library is not ready yet. Say so plainly and offer to try again in a bit - do not make a joke up.' });
              } else {
                console.log(`${tag} 😄 tellJoke(humor=${humor}, tone=${pick.tone}, topic="${topic}") -> score ${pick.score}, darkness ${pick.darkness}`);
                respondToToolCall(call, {
                  joke: pick.joke,
                  tone: pick.tone,
                  ...(topic && !pick.onTopic ? { note: `None of the jokes are about "${topic}" - say that briefly, then tell this one.` } : {}),
                  instruction: 'Tell exactly this joke, in your own voice, with good comic timing (a beat before the punchline). Keep the joke itself as written - you may swap any Americanisms for British wording. Do not tell a different joke, do not explain it, and do not make up or add another one.'
                });
              }
            } else if (call.name === 'getTrainingSummary') {
              const days = call.args?.period === 'week' ? 7 : call.args?.period === 'year' ? 365 : 28;
              try {
                const st = getStravaStatus();
                if (!st.connected || !st.activityCount) respondToToolCall(call, { error: 'Strava is not connected or has no activities yet. Say so plainly.' });
                else { console.log(`${tag} 🏃 getTrainingSummary(${days}d)`); respondToToolCall(call, describeTraining(days)); }
              } catch (err) { respondToToolCall(call, { error: err.message }); }
            } else if (call.name === 'getCalendarEvents') {
              const days = Math.max(1, Math.min(30, Number(call.args?.days ?? 7)));
              getUpcomingEvents(days).then((events) => {
                console.log(`${tag} 📅 getCalendarEvents(${days}d) -> ${events.length}`);
                respondToToolCall(call, { days, count: events.length, events: describeEvents(events) });
              }).catch((err) => respondToToolCall(call, { error: err.message }));
            } else if (call.name === 'addCalendarEvent') {
              createEvent({ title: call.args?.title, date: call.args?.date, time: call.args?.time, durationMinutes: call.args?.durationMinutes })
                .then((ev) => { console.log(`${tag} 📅 addCalendarEvent -> ${ev.title} ${ev.date}`); respondToToolCall(call, { status: 'added', title: ev.title, date: ev.date, time: ev.time }); })
                .catch((err) => respondToToolCall(call, { error: err.message }));
            } else if (call.name === 'listScheduledItems') {
              respondToToolCall(call, { items: listScheduledItems() });
            } else if (call.name === 'cancelScheduledItem') {
              const cancelled = cancelScheduledItem(call.args?.id);
              console.log(`${tag} ⏰ cancelScheduledItem(${call.args?.id}) -> ${cancelled}`);
              pushScheduleStatus();
              respondToToolCall(call, { cancelled });
            } else if (call.name === 'addToList') {
              try {
                respondToToolCall(call, addToList(call.args?.listName, call.args?.item));
              } catch (err) {
                respondToToolCall(call, { error: err.message });
              }
            } else if (call.name === 'readList') {
              try {
                respondToToolCall(call, readList(call.args?.listName));
              } catch (err) {
                respondToToolCall(call, { error: err.message });
              }
            } else if (call.name === 'removeFromList') {
              try {
                respondToToolCall(call, { removed: removeFromList(call.args?.listName, call.args?.item) });
              } catch (err) {
                respondToToolCall(call, { error: err.message });
              }
            } else if (call.name === 'clearList') {
              try {
                clearList(call.args?.listName);
                respondToToolCall(call, { status: 'cleared' });
              } catch (err) {
                respondToToolCall(call, { error: err.message });
              }
            } else if (call.name === 'rememberFact') {
              try {
                const fact = call.args?.fact;
                const category = call.args?.category || 'general';
                if (!fact) {
                  respondToToolCall(call, { error: 'No fact provided' });
                } else {
                  const saved = addMemory(fact, category);
                  console.log(`${tag} 🧠 rememberFact saved: "${saved.fact}" (${saved.category})`);
                  respondToToolCall(call, { status: 'remembered', fact: saved.fact, id: saved.id });
                }
              } catch (err) {
                console.error(`${tag} rememberFact failed:`, err.message);
                respondToToolCall(call, { error: err.message });
              }
            } else if (call.name === 'recallMemory') {
              try {
                const query = call.args?.query || '';
                const results = searchMemories(query);
                console.log(`${tag} 🔍 recallMemory("${query}") -> found ${results.length} memories`);
                respondToToolCall(call, { query, memories: results.map((m) => m.fact) });
              } catch (err) {
                console.error(`${tag} recallMemory failed:`, err.message);
                respondToToolCall(call, { error: err.message });
              }
            } else if (call.name === 'forgetMemory') {
              try {
                const query = call.args?.query || '';
                const deleted = deleteMemory(query);
                console.log(`${tag} 🗑️ forgetMemory("${query}") -> deleted: ${deleted}`);
                respondToToolCall(call, { status: deleted ? 'forgotten' : 'not_found', query });
              } catch (err) {
                console.error(`${tag} forgetMemory failed:`, err.message);
                respondToToolCall(call, { error: err.message });
              }
            } else if (call.name === 'getWeather') {
              const loc = call.args?.location || '';
              console.log(`${tag} 🌦️ Executing getWeather tool for location: "${loc || 'local'}"`);
              getWeather(call.args || {}).then((weatherData) => {
                console.log(`${tag} 🌦️ Weather result for ${weatherData.location}: ${weatherData.current?.temperature_c}°C, ${weatherData.current?.condition}`);
                respondToToolCall(call, weatherData);
              }).catch((err) => {
                console.error(`${tag} getWeather error:`, err.message);
                respondToToolCall(call, { error: err.message, fallback: "Current weather conditions unavailable." });
              });
            } else if (call.name === 'lookAtCamera') {
              wakeCamera();
              const frame = getFrame();
              const q = String(call.args?.question || 'What can you see?');
              if (!frame || Date.now() - frame.at > 120000) {
                console.log(`${tag} 📷 lookAtCamera: no fresh camera frame`);
                respondToToolCall(call, { error: 'The camera is not delivering pictures right now.' });
              } else {
                askLive(q).then((snap) => {
                  const last = snap.qa[snap.qa.length - 1];
                  console.log(`${tag} 📷 lookAtCamera answered (snapshot ${snap.id})`);
                  respondToToolCall(call, { answer: last?.answer, recognisedPeople: snap.faces.filter((f) => f.match).map((f) => f.match.name) });
                }).catch((err) => {
                  console.error(`${tag} lookAtCamera error:`, err.message);
                  respondToToolCall(call, { error: err.message });
                });
              }
            } else if (call.name === 'getScheduleHistory') {
              const kind = ['alarm', 'timer', 'reminder'].includes(call.args?.type) ? call.args.type : null;
              const period = ['today', 'yesterday', 'week', 'month'].includes(call.args?.period) ? call.args.period : 'yesterday';
              const summary = getHistorySummary({ type: kind, period });
              console.log(`${tag} 🕘 getScheduleHistory(${kind || 'all'}, ${period}) -> ${summary.events.length} events`);
              respondToToolCall(call, summary);
            } else if (call.name === 'getUpcomingBirthdays') {
              const days = Math.max(0, Math.min(366, Number(call.args?.withinDays ?? 7)));
              const list = listBirthdays().filter((b) => b.daysUntil <= days)
                .map((b) => ({ name: b.name, daysUntil: b.daysUntil, isToday: b.isToday, date: `${b.day}/${b.month}`, turningAge: b.turningAge }));
              console.log(`${tag} 🎂 getUpcomingBirthdays(${days}d) -> ${list.length}`);
              respondToToolCall(call, { withinDays: days, count: list.length, birthdays: list });
            } else if (call.name === 'getNewMusicReleases') {
              const period = ['today', 'week', 'month', 'upcoming'].includes(call.args?.period) ? call.args.period : 'week';
              const releases = period === 'upcoming'
                ? getUpcomingReleases().map((r) => ({ artist: r.mbName || r.artist, title: r.title, type: r.type, date: r.date, precision: r.precision, owned: r.owned }))
                : period === 'today'
                ? getTodayReleases().map((r) => ({ artist: r.artist, title: r.title, type: r.type, date: r.date, owned: r.owned }))
                : getWindowResults(period === 'week' ? 'week' : 'month').artists.flatMap((a) =>
                    a.releases.filter((r) => r.isNew).map((r) => ({ artist: a.name, title: r.title, type: r.type, date: r.date, owned: r.owned })));
              console.log(`${tag} 💿 getNewMusicReleases(${period}) -> ${releases.length}`);
              let wants = []; try { wants = getMusicWants().filter((w) => !w.owned).map((w) => ({ artist: w.artist, title: w.title, date: w.date, released: w.released })); } catch (_) { /* none */ }
              respondToToolCall(call, { period, count: releases.length, releases: releases.slice(0, 25), wantList: wants.slice(0, 15), note: 'wantList is what the user has starred as wanted - mention if any of these are in the releases.' });
            } else if (call.name === 'getBloodGlucose') {
              try {
                const g = describeGlucoseForIms(call.args?.period || 'today');
                console.log(`${tag} 🩸 getBloodGlucose(${call.args?.period || 'today'}) -> ${JSON.stringify(g.now).slice(0, 120)}`);
                respondToToolCall(call, g);
              } catch (err) {
                console.error(`${tag} getBloodGlucose error:`, err.message);
                respondToToolCall(call, { error: err.message, fallback: 'Blood glucose data currently unavailable.' });
              }
            } else if (call.name === 'getDayReport') {
              getDayReport().then((r) => {
                console.log(`${tag} 📰 getDayReport -> ${r.report.length} items`);
                respondToToolCall(call, r);
              }).catch((err) => respondToToolCall(call, { error: err.message }));
            } else if (call.name === 'getNews') {
              getNews({ topic: call.args?.topic, source: call.args?.source, about: call.args?.about, tours: call.args?.tours }).then((d) => {
                console.log(`${tag} 📰 getNews(${call.args?.about || call.args?.source || call.args?.topic || 'top'}) -> ${(d.items || []).length}`);
                respondToToolCall(call, { ...d, note: 'Summarise the most interesting three or four in your own words and say where they are from; offer more on any of them.' });
              }).catch((err) => respondToToolCall(call, { error: err.message }));
            } else if (call.name === 'logCarbs') {
              const grams = Math.round(Number(call.args?.grams));
              const food = call.args?.food || null;
              const confirmedOk = call.args?.confirmed === true && pendingCarbs && Math.abs(pendingCarbs.grams - grams) <= 1 &&
                lastUserInputAt > pendingCarbs.at && Date.now() - pendingCarbs.at < 5 * 60000;
              if (!confirmedOk) {
                // Step 1: propose. Nothing is sent until the user says yes.
                recentCarbs(20).then((recent) => {
                  pendingCarbs = { grams, food, at: Date.now() };
                  console.log(`${tag} 🍞 logCarbs proposed ${grams} g ${food || ''} (recent: ${recent.length})`);
                  respondToToolCall(call, {
                    status: 'needs_confirmation', grams, food,
                    say: `Tell them the total and what you based it on, then ask if you should log it - e.g. "That's about ${grams} grams, shall I log it?". Only after they say yes, call logCarbs again with the same grams and confirmed: true. If they give a different number, propose that instead.`,
                    ...(recent.length ? { alreadyLoggedRecently: recent, warning: 'Carbs were already entered in the last 20 minutes (listed). Mention them and ask whether this is extra food or the same meal - never log the same meal twice.' } : {}),
                  });
                }).catch((err) => respondToToolCall(call, { error: err.message }));
              } else {
                // Step 2: confirmed after the proposal - send it.
                pendingCarbs = null;
                logCarbs({ grams, food }).then((e) => {
                  console.log(`${tag} 🍞 logCarbs(${e.grams} g ${e.food || ''}) confirmed, nightscout=${e.nightscout.sent}`);
                  respondToToolCall(call, { status: 'logged', grams: e.grams, food: e.food, sentToNightscout: e.nightscout.sent, ...(e.nightscout.sent ? { note: 'It will show in AAPS once it syncs.' } : { nightscoutProblem: e.nightscout.reason }) });
                }).catch((err) => respondToToolCall(call, { error: err.message }));
              }
            } else if (call.name === 'clearOldNightscoutData') {
              clearOldNightscout(3).then((r) => {
                const ok = r.results.every((x) => x.ok);
                console.log(`${tag} 🧹 clearOldNightscoutData -> ${ok ? 'ok' : 'partly failed'}, now ${r.dbSize?.pct}%`);
                respondToToolCall(call, {
                  status: ok ? 'cleared' : 'partly failed',
                  olderThan: r.cutoff.slice(0, 10),
                  deleted: r.results.map((x) => `${x.label}: ${x.ok ? (x.deleted ?? 'done') : 'failed'}`),
                  databaseNowPercent: r.dbSize?.pct ?? null,
                });
              }).catch((err) => respondToToolCall(call, { error: err.message }));
            } else if (call.name === 'startBackgroundTask') {
              createTask({ request: call.args?.task, origin: isHardware ? 'desk' : 'web' }).then((t) => {
                console.log(`${tag} 🧵 startBackgroundTask #${t.id}: ${t.title}`);
                respondToToolCall(call, { status: 'started', id: t.id, title: t.title, note: 'Tell them briefly you are on it and they can ask how it went later (or it will be in their next day report). Do not guess the answer now.' });
              }).catch((err) => respondToToolCall(call, { error: err.message }));
            } else if (call.name === 'getBackgroundTasks') {
              try {
                const tasks = describeTasksForIms({ id: call.args?.id, about: call.args?.about });
                console.log(`${tag} 🧵 getBackgroundTasks -> ${tasks.length}`);
                respondToToolCall(call, { tasks, note: tasks.length ? 'Give the summary of finished ones in your own words; offer more detail. Say which are still running.' : 'No background tasks yet.' });
              } catch (err) { respondToToolCall(call, { error: err.message }); }
            } else if (call.name === 'lookUpFood') {
              lookUpFood(call.args?.food).then((d) => {
                console.log(`${tag} 🥪 lookUpFood(${call.args?.food}) -> ${d.matches} matches, ${d.typicalCarbsPer100g} g/100g`);
                respondToToolCall(call, d);
              }).catch((err) => respondToToolCall(call, { error: err.message, fallback: 'Use your own knowledge of typical UK carb values and say it is an estimate.' }));
            } else {
              respondToToolCall(call, { status: 'acknowledged' });
            }
          }
        }
      } catch (e) { /* non-JSON binary frame */ }

      if (ws.readyState === ws.OPEN) {
        if (ws.isHardwareClient) {
          // Hardware clients have limited WebSocket RX buffers (typically 2-4KB).
          // NEVER forward raw Gemini JSON messages (which contain 60KB+ base64 audio and trigger 1009 error).
          // Chunk binary audio into small frames (1024 bytes) so the ESP32 WebSocket buffer never overflows (1009)
          if (parsedAudioBytes) {
            const CHUNK_SIZE = 1024;
            for (let i = 0; i < parsedAudioBytes.length; i += CHUNK_SIZE) {
              paceSend({ bin: Buffer.from(parsedAudioBytes.subarray(i, i + CHUNK_SIZE)) });
            }
          }
          // Forward lightweight text snippet if available:
          if (parsed?.serverContent?.modelTurn?.parts) {
            for (const part of parsed.serverContent.modelTurn.parts) {
              if (part.text) {
                paceSend({ json: JSON.stringify({ text: part.text }) });
              }
            }
          }
          if (parsed?.setupComplete) {
            paceFlush();
            ws.send(JSON.stringify({ setupComplete: {} }));
          }
          if (parsed?.serverContent?.turnComplete && !parsed.toolCall) {
            paceSend({ json: JSON.stringify({ turnComplete: true }) });
          }
        } else {
          // Forward standard text JSON frame to web browser client
          ws.send(msgStr);
        }
      } else {
        console.warn(`${tag} ⚠️ Cannot forward to client — ws state:`, ws.readyState);
      }
    });

    gWs.on('close', (code, reason) => {
      unsolicitedTurn = false; // a dropped turn never carries over to a new upstream session
      clearInterval(pingInterval);
      clearInterval(silenceInterval);
      flushWavToDisk();
      flushMicWavToDisk();
      const reasonStr = reason ? reason.toString() : '';
      const connectionAliveMs = geminiConnectedAt > 0 ? (Date.now() - geminiConnectedAt) : -1;
      const msSinceOwnAudioAtClose = lastModelAudioTime > 0 ? (Date.now() - lastModelAudioTime) : -1;
      console.log(`${tag} Gemini Live closed connection: ${code} - ${reasonStr} (alive ${connectionAliveMs}ms, ${msSinceOwnAudioAtClose}ms since last audio chunk)`);
      try {
        // connectionAliveMs distinguishes a Gemini-side idle/session-length
        // limit (would cluster around some roughly-fixed duration every
        // time) from something we're doing (would vary with what the user
        // was actually doing). msSinceOwnAudioAtClose small + turnComplete
        // false means it died WHILE actively mid-generation, not after
        // finishing and going idle.
        logCapture(
          `[${new Date().toISOString()}] ${tag} GEMINI CLOSE: code=${code} reason="${reasonStr}" turnComplete=${currentTurnComplete} connectionAliveMs=${connectionAliveMs} msSinceOwnAudioAtClose=${msSinceOwnAudioAtClose}\n`);
      } catch (_) { }

      // Code 1000 is a normal WebSocket close (turn completed / idle duration reached).
      // If the client socket is still active (especially hardware terminal awaiting next voice turn),
      // do NOT drop the client socket. Reconnect to Gemini Live upstream transparently.
      if (!isClientClosed && ws.readyState === WebSocket.OPEN && (code === 1000 || code === 1005)) {
        // -----------------------------------------------------------------------
        // Mid-turn disconnect guard:
        // Gemini occasionally closes code=1000 BEFORE sending turnComplete when
        // its own server-side idle timeout fires mid-synthesis. Without this
        // guard the hardware client is left in STATE_SPEAKING forever (or until
        // the 1500ms isSpeakerActive safety guard fires), but crucially all audio
        // already queued on the device DOES play out in full - we just need to
        // tell it the turn is over afterward so the device returns to STANDBY.
        // We wait 200ms to allow the last binary audio chunks already in-flight
        // on the TCP socket to arrive at the device before the turnComplete JSON
        // frame lands, avoiding a race where the device resets state mid-drain.
        // -----------------------------------------------------------------------
        if (!currentTurnComplete && isHardware && ws.readyState === WebSocket.OPEN) {
          console.warn(`${tag} ⚠️ Gemini closed mid-turn (no turnComplete received). Sending synthetic turnComplete after 200ms drain delay.`);
          try {
            logCapture(
              `[${new Date().toISOString()}] ${tag} SYNTHETIC TURNCOMPLETE QUEUED (mid-turn disconnect)\n`);
          } catch (_) { }
          setTimeout(() => {
            try {
              if (!isClientClosed && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ turnComplete: true }));
                console.log(`${tag} ✅ Sent synthetic turnComplete to hardware client.`);
              }
            } catch (e) {
              console.error(`${tag} Error sending synthetic turnComplete:`, e.message);
            }
          }, 200);
        }
        currentTurnComplete = true; // Reset for next turn
        turnCompleteAt = Date.now();
        console.log(`${tag} Gracefully handling code ${code} from Gemini. Keeping client socket open and preparing seamless upstream reconnect.`);
        if (currentGeminiWs === gWs) currentGeminiWs = null;
        return;
      }

      // If unexpected fatal close (or client is already gone), close the client
      try {
        const safeCode = (code === 1005 || code === 1006) ? 1000 : code;
        if (ws.readyState === ws.OPEN) {
          ws.close(safeCode, reasonStr || 'Gemini session ended');
        }
      } catch (err) {
        console.error(`${tag} Error closing client ws after Gemini closed:`, err.message);
      }
    });

    gWs.on('error', (err) => {
      clearInterval(pingInterval);
      clearInterval(silenceInterval);
      console.error(`${tag} Gemini Live WebSocket error:`, err.message);
      try {
        logCapture(
          `[${new Date().toISOString()}] ${tag} GEMINI ERROR: ${err.message}\n`);
      } catch (_) { }
      try {
        if (ws.readyState === ws.OPEN) ws.close(1011, 'Error communicating with Gemini');
      } catch (closeErr) {
        console.error(`${tag} Error closing client ws after Gemini error:`, closeErr.message);
      }
    });

    return gWs;
  };

  currentGeminiWs = createGeminiSocket();

  const ensureGeminiSocket = () => {
    if (!currentGeminiWs || currentGeminiWs.readyState === WebSocket.CLOSED || currentGeminiWs.readyState === WebSocket.CLOSING) {
      console.log(`${tag} Re-establishing upstream Gemini Live connection on demand...`);
      currentGeminiWs = createGeminiSocket();
    }
    return currentGeminiWs;
  };

  // Wake/stop phrase recording from the device microphone (see /ims/phrases): while this is set, mic
  // frames are collected here and never reach Gemini.
  let phraseCapture = null;
  if (isHardware) {
    ws.capturePhrase = (seconds = 3) => new Promise((resolve, reject) => {
      if (phraseCapture) return reject(new Error('Already recording - wait a moment.'));
      if (isConversationActive || !currentTurnComplete || isRecordingActive()) return reject(new Error('Ims is busy - try again when he is on standby.'));
      phraseCapture = { chunks: [] };
      try { ws.send(JSON.stringify({ phraseCapture: { seconds } })); } catch (err) { phraseCapture = null; return reject(err); }
      setTimeout(() => {
        const pcm = Buffer.concat(phraseCapture?.chunks || []);
        phraseCapture = null;
        if (pcm.length < 16000) reject(new Error('No sound came from the device - it may have been busy. Try again.'));
        else resolve(pcm);
      }, seconds * 1000 + 800);
    });
  }

  ws.on('message', (message, isBinary) => {
    if (isBinary && phraseCapture) { phraseCapture.chunks.push(Buffer.from(message)); return; }
    if (isBinary && isHardware && silenceClosedAt && Date.now() - silenceClosedAt < 2500) return; // don't reopen a session we just closed
    // Hardware firmware debug telemetry ({"debug":"..."}) - log only, never
    // forward to Gemini (it would reject these as malformed clientContent).
    if (!isBinary) {
      try {
        const maybeJson = JSON.parse(message.toString());
        if (typeof maybeJson.debug === 'string') {
          console.log(`${tag} [DEBUG] ${maybeJson.debug}`);
          try {
            logCapture(
              `[${new Date().toISOString()}] ${tag} DEVICE DEBUG: ${maybeJson.debug}\n`);
          } catch (_) { }
          return;
        }
        // A call is being recorded: the device only streams its mic. Session
        // and touch messages must not reset or restart anything.
        if (isHardware && isRecordingActive() && (maybeJson.sessionClosed || maybeJson.touchToTalk)) return;
        if (maybeJson.sessionClosed) {
          console.log(`${tag} 🔒 Hardware session closed by device. Resetting conversation state.`);
          isConversationActive = false;
          touchToTalkActive = false;
          try {
            logCapture(`[${new Date().toISOString()}] ${tag} SESSION CLOSED BY DEVICE\n`);
          } catch (_) { }
          if (currentGeminiWs && currentGeminiWs.readyState === WebSocket.OPEN) {
            currentGeminiWs.close(1000, "Device session closed");
            currentGeminiWs = null;
          }
          return;
        }
        if (maybeJson.touchToTalk) {
          console.log(`${tag} 👆 Touch-to-talk initiated by device.`);
          isConversationActive = true;
          touchToTalkActive = true;
          try {
            logCapture(`[${new Date().toISOString()}] ${tag} TOUCH TO TALK INITIATED\n`);
          } catch (_) { }
          return;
        }
      } catch (_) { }
    }

    const gWs = ensureGeminiSocket();

    // In ws library, message is ALWAYS a Buffer. ONLY isBinary indicates an opcode 0x02 binary frame.
    if (isBinary) {
      ws.isHardwareClient = true;
      if (isHardware && !isRecordingActive()) micAudioChunks.push(Buffer.from(message)); // never keep call audio on disk

      // Acoustic echo barge-in protection:
      // While Gemini is actively generating speech chunks, suppress forwarding mic audio so
      // Google's server-side VAD does not hear the physical speaker output and abort the turn.
      //
      // Also keeps suppressing for POST_TURN_ECHO_GRACE_MS AFTER turnComplete, not just up to it.
      // turnComplete is a NETWORK signal ("Gemini has finished sending audio for this turn") - it says
      // nothing about whether the DEVICE has finished physically playing that audio out loud yet, and
      // with no real device-side query, there's still a gap of a few hundred ms where the speaker is
      // audibly finishing while the mic (device auto-reopens for a wake-free follow-up the instant
      // conversationOpen is true) is already back on. A real capture caught this directly: turnComplete
      // fired, suppression dropped instantly, the mic picked up the tail of the device's own reply as
      // fresh input (RMS spikes in the thousands right after - self-echo, not the room), and Gemini,
      // receiving that as a new turn, answered with the exact same sentence it had just finished saying.
      const POST_TURN_ECHO_GRACE_MS = 900;
      const msSinceTurnComplete = currentTurnComplete ? (Date.now() - turnCompleteAt) : Infinity;
      const isModelSpeakingNow =
        (!currentTurnComplete && (Date.now() - lastModelAudioTime < 800)) ||
        (currentTurnComplete && msSinceTurnComplete < POST_TURN_ECHO_GRACE_MS);
      if (isHardware && isModelSpeakingNow) {
        // Was silent before - logging every suppressed frame would be way
        // too noisy (one per ~32ms chunk), so just count them and log a
        // summary the moment suppression actually lifts. Lets a cutoff
        // reproduction be checked afterward for whether mic audio was still
        // being generated (device didn't think it was muted) right up to
        // the edge of this window, without drowning the log.
        suppressedMicFrameCount++;
        return;
      }
      if (suppressedMicFrameCount > 0) {
        try {
          logCapture(
            `[${new Date().toISOString()}] ${tag} ECHO SUPPRESSION LIFTED: dropped ${suppressedMicFrameCount} mic frames (device believed it was muted/not-listening for this whole window)\n`);
        } catch (_) { }
        suppressedMicFrameCount = 0;
      }

      if (isHardware) {
        // Real speech (not silence or a faint tail of the speaker) counts as the
        // user having done something - see the unsolicited-turn guard above.
        const samples = Math.floor(message.length / 2);
        let sumSq = 0;
        for (let i = 0; i < samples; i++) { const v = message.readInt16LE(i * 2); sumSq += v * v; }
        // Ignore the first 3 s after a turn ends: the speaker's own tail and room echo are
        // loud enough on the mic to look like speech. A quick follow-up from the user is
        // still recognised through its transcription instead.
        if (samples > 0 && Math.sqrt(sumSq / samples) > 300 && Date.now() - turnCompleteAt > 3000 && ++energeticMicFrames >= 8) unsolicitedTurn = false; // the user is talking: stop dropping
      }
      const base64Audio = Buffer.from(message).toString('base64');
      const realtimePayload = JSON.stringify({
        realtimeInput: {
          audio: {
            mimeType: 'audio/pcm;rate=16000',
            data: base64Audio
          }
        }
      });
      if (gWs && gWs.readyState === WebSocket.OPEN) {
        gWs.send(realtimePayload);
      } else if (gWs && gWs.readyState === WebSocket.CONNECTING) {
        outboundQueue.push(realtimePayload);
      }
      return;
    }

    let msgStr = message.toString();
    if (msgStr.includes('realtimeInput')) {
      if (Math.random() < 0.05) {
        console.log(`${tag} Forwarding audio stream chunks...`);
      }
    } else {
      // Prevent forwarding malformed/empty turns like {"clientContent":{"turns":[],"turnComplete":true}}
      // which Gemini rejects with 1007 "Request contains an invalid argument."
      try {
        const parsedCtrl = JSON.parse(msgStr);
        if (parsedCtrl.clientContent?.turns?.length) { textTurnSent = true; lastActivityAt = Date.now(); lastUserInputAt = Date.now(); }
        if (parsedCtrl.clientContent && Array.isArray(parsedCtrl.clientContent.turns) && parsedCtrl.clientContent.turns.length === 0) {
          console.warn(`${tag} ⚠️ Suppressed empty clientContent turns to prevent Gemini 1007 rejection.`);
          return;
        }
      } catch (_) { }

      // Cache and augment client setup handshake so we can auto-replay if Gemini closes with 1000
      try {
        const parsed = JSON.parse(msgStr);
        if (parsed.setup) {
          if (isHardware) {
            // Augment hardware setup with searchLibrary/noWakeDetected/endConversation
            // tool declarations and the RAG + wake-phrase-gating system prompt.
            // Tools are now ALWAYS overridden (not just when the client sent none) -
            // the firmware's own hardcoded setup message already includes a stale
            // searchLibrary-only tools array, which previously meant the
            // noWakeDetected/endConversation declarations added here never actually
            // reached Gemini for hardware clients.
            const previewVoice = parsed.setup.previewVoice || null;
            const recordingNow = isRecordingActive();
            const hardwareDefaults = getHardwareSetupPayload(previewVoice, morningReportReady && !recordingNow ? morningReportDirective : null);
            if (morningReportReady && !recordingNow) {
              // Only counts as offered once Ims actually speaks in this session (see the
              // spoken-transcript handler) - a connection nobody talks to doesn't use it up.
              morningOfferPending = true;
              morningReportReady = false; // don't re-inject if setup is replayed on this same connection
            }
            parsed.setup.tools = hardwareDefaults.setup.tools;
            parsed.setup.systemInstruction = hardwareDefaults.setup.systemInstruction;
            // generationConfig carries the selected voice (or previewVoice if auditioning)
            // AND the variance engine's per-session temperature.
            parsed.setup.generationConfig = hardwareDefaults.setup.generationConfig;
            // DIAGNOSTIC (and worth keeping permanently): asks Gemini for a
            // real, word-for-word transcript of what it's actually SAYING in
            // the audio, arriving incrementally alongside the audio chunks
            // themselves (serverContent.outputTranscription.text) - distinct
            // from the "thinking" trace text already captured into
            // sessionTranscript, which is internal reasoning, not a
            // transcript of the spoken words. This is the ground truth that
            // tells apart "Gemini's own generation stopped" (transcript is
            // ALSO incomplete) from "our own pipeline lost/dropped audio
            // Gemini actually sent" (transcript is complete, audio isn't).
            parsed.setup.outputAudioTranscription = {};
            // Same idea, the USER's side - needed for Phase 3's relationship
            // memory (imspersonality.md), which needs to know what the user
            // actually said/asked about, not just what Ims replied.
            parsed.setup.inputAudioTranscription = {};
            // Ask Gemini for resumable-session handles from the very first setup, so a
            // later upstream reconnect can resume with context (see pinSavedVoice()).
            parsed.setup.sessionResumption = {};
            msgStr = JSON.stringify(parsed);
            console.log(`${tag} 🔧 Augmented hardware setup handshake with searchLibrary/noWakeDetected/endConversation tools, wake-phrase-gated system prompt, and outputAudioTranscription`);
          }
          if (imsWeb) {
            const web = getWebSetupPayload();
            parsed.setup.model = web.setup.model;
            parsed.setup.tools = web.setup.tools;
            parsed.setup.systemInstruction = web.setup.systemInstruction;
            parsed.setup.generationConfig = web.setup.generationConfig;
            parsed.setup.outputAudioTranscription = {};
            parsed.setup.inputAudioTranscription = {};
            parsed.setup.sessionResumption = {};
            delete parsed.setup.imsWeb;
            msgStr = JSON.stringify(parsed);
            console.log(`${tag} 🧠 Web Ims session: same persona, memory and tools as the desk terminal`);
          }
          // Browser live sessions ship their own generic assistant prompt and
          // voice. Ims must be the same Ims everywhere, so put the saved voice,
          // personality sliders and ims_persona_rules.md in front of it and pin
          // the saved voice. The voice-audition connection (no system prompt)
          // is left alone - it exists specifically to try OTHER voices.
          if (!isHardware && !imsWeb && parsed.setup.systemInstruction && !parsed.setup.previewVoice) {
            const persona = getWebPersonaBlock();
            const original = (parsed.setup.systemInstruction.parts || []).map((p) => p.text || '').join('\n');
            parsed.setup.systemInstruction = {
              parts: [{ text: persona.text + "\n\nYOUR CURRENT TASK AND TOOLS (keep the identity, dialect, personality and voice above throughout): " + original }]
            };
            parsed.setup.generationConfig = parsed.setup.generationConfig || {};
            parsed.setup.generationConfig.speechConfig = { languageCode: 'en-GB', voiceConfig: { prebuiltVoiceConfig: { voiceName: persona.voice } } };
            msgStr = JSON.stringify(parsed);
            console.log(`${tag} 🎭 Applied saved Ims voice (${persona.voice}), personality and persona rules to browser live session`);
          }
          normalSetupMsg = msgStr;
          if (isHardware && isRecordingActive()) msgStr = toSilentSetup(msgStr);
          cachedSetupMsg = msgStr;
          console.log(`${tag} Cached setup handshake for resilient reconnection.`);
        }
      } catch (_) { }

      console.log(`${tag} Forwarding control message:`, msgStr);
      try {
        logCapture(
          `[${new Date().toISOString()}] ${tag} CLIENT MSG: ${msgStr}\n`);
      } catch (_) { }
    }

    if (gWs && gWs.readyState === WebSocket.OPEN) {
      gWs.send(msgStr);
    } else if (gWs && gWs.readyState === WebSocket.CONNECTING) {
      console.log(`${tag} Queueing outbound message (Gemini connection is CONNECTING)...`);
      outboundQueue.push(msgStr);
    } else {
      console.warn(`${tag} Dropping message, Gemini socket state:`, gWs ? gWs.readyState : 'null');
    }
  });

  ws.on('close', (code, reason) => {
    isClientClosed = true;
    paceFlush();
    if (silenceTimer) clearInterval(silenceTimer);
    if (offRecordingChange) offRecordingChange();
    flushMicWavToDisk();
    flushWavToDisk();
    clearInterval(micFlushInterval);
    clearInterval(geminiFlushInterval);
    const reasonStr = reason ? reason.toString() : '';
    console.log(`${tag} Client closed connection: ${code} - ${reasonStr}`);
    try {
      logCapture(
        `[${new Date().toISOString()}] ${tag} CLIENT CLOSED: code=${code} reason="${reasonStr}"\n`);
    } catch (_) { }
    if (isHardware && activeHardwareSession?.clientWs === ws) {
      activeHardwareSession = null;
    } else if (!isHardware && activeBrowserSession?.clientWs === ws) {
      activeBrowserSession = null;
    }
    try {
      if (currentGeminiWs && (currentGeminiWs.readyState === WebSocket.OPEN || currentGeminiWs.readyState === WebSocket.CONNECTING)) {
        const safeCode = (code === 1005 || code === 1006) ? 1000 : code;
        currentGeminiWs.close(safeCode, reasonStr || 'Client disconnected');
      }
    } catch (err) {
      console.error(`${tag} Error closing Gemini ws after client closed:`, err.message);
    }
  });

  ws.on('error', (err) => {
    isClientClosed = true;
    console.error(`${tag} Client WebSocket error:`, err.message);
    try {
      logCapture(
        `[${new Date().toISOString()}] ${tag} CLIENT ERROR: ${err.message}\n`);
    } catch (_) { }
    try {
      if (currentGeminiWs && (currentGeminiWs.readyState === WebSocket.OPEN || currentGeminiWs.readyState === WebSocket.CONNECTING)) {
        currentGeminiWs.close(1011, 'Client socket error');
      }
    } catch (closeErr) {
      console.error(`${tag} Error closing Gemini ws after client error:`, closeErr.message);
    }
  });
}

browserWss.on('connection', (ws) => handleLiveProxyConnection(ws, false));
imsWebWss.on('connection', (ws) => handleLiveProxyConnection(ws, false, { imsWeb: true }));
hardwareWss.on('connection', (ws) => handleLiveProxyConnection(ws, true));

// ---------------------------------------------------------------------------
// RAW TCP HARDWARE ENDPOINT (for the ESPHome custom component)
// ESPHome has no built-in WebSocket client, so this ESP32 path speaks a much
// simpler framed protocol over a plain TCP socket instead of real WebSocket
// framing: each message is [1 byte type: 0x00 text / 0x01 binary][4 bytes
// big-endian payload length][payload]. HardwareTcpClient below wraps a raw
// net.Socket in the same minimal API surface (.on('message'/'close'/'error'),
// .send(), .close(), .readyState, .OPEN/etc.) that handleLiveProxyConnection
// already uses for the WebSocket-based hardware/browser paths, so this reuses
// that exact same Gemini Live proxy + RAG tool logic with no duplication.
// ---------------------------------------------------------------------------
const HARDWARE_TCP_PORT = process.env.HARDWARE_TCP_PORT || 3002;

// Wire framing, both directions - must match FRAME_MAGIC/FRAME_HEADER_LEN in
// the firmware's main.cpp: [0xA5][0x5A][type:1][length:4 BE][payload].
const FRAME_MAGIC = Buffer.from([0xa5, 0x5a]);
const FRAME_HEADER_LEN = 7;
// Nothing legitimate comes close: the largest real frame either direction is
// a Gemini audio chunk, and those top out around 46KB.
const MAX_FRAME_PAYLOAD = 64 * 1024;

class HardwareTcpClient extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.readyState = HardwareTcpClient.OPEN;
    this._closed = false;
    this._buffer = Buffer.alloc(0);
    this._resyncSkipped = 0;

    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => this._finishClose(1006, ''));
    socket.on('error', (err) => this.emit('error', err));
  }

  _onData(chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk]);
    // A single TCP chunk can contain multiple frames, or a partial one -
    // drain every complete frame currently buffered, then wait for more.
    while (true) {
      // Hunt for the frame marker. Without one, a single lost or duplicated
      // byte desynchronises this parser permanently (every subsequent
      // "length" is really payload), and the only escape was dropping the
      // connection. Scanning to the next marker turns that into a recoverable
      // hiccup - see FRAME_MAGIC in the firmware for the full reasoning.
      const idx = this._buffer.indexOf(FRAME_MAGIC);
      if (idx < 0) {
        // Keep one trailing byte: it could be the first half of a marker
        // split across two TCP chunks.
        if (this._buffer.length > 1) {
          this._resyncSkipped += this._buffer.length - 1;
          this._buffer = this._buffer.subarray(this._buffer.length - 1);
        }
        return;
      }
      if (idx > 0) {
        this._resyncSkipped += idx;
        this._buffer = this._buffer.subarray(idx);
      }
      if (this._buffer.length < FRAME_HEADER_LEN) return;
      const type = this._buffer[2];
      const len = this._buffer.readUInt32BE(3);
      if (len > MAX_FRAME_PAYLOAD) {
        // Marker matched but the length is impossible, so it was payload that
        // happened to look like one. Skip past it and keep hunting.
        this._resyncSkipped += 2;
        this._buffer = this._buffer.subarray(2);
        continue;
      }
      if (this._buffer.length < FRAME_HEADER_LEN + len) return;
      const payload = this._buffer.subarray(FRAME_HEADER_LEN, FRAME_HEADER_LEN + len);
      this._buffer = this._buffer.subarray(FRAME_HEADER_LEN + len);
      if (this._resyncSkipped > 0) {
        console.warn(`[HardwareTCP] Resynced after skipping ${this._resyncSkipped} bytes from device`);
        this._resyncSkipped = 0;
      }
      this.emit('message', Buffer.from(payload), type === 1);
    }
  }

  send(data, opts) {
    if (this.readyState !== HardwareTcpClient.OPEN) return;
    const isBinary = Buffer.isBuffer(data) || !!(opts && opts.binary);
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
    const header = Buffer.alloc(FRAME_HEADER_LEN);
    header[0] = FRAME_MAGIC[0];
    header[1] = FRAME_MAGIC[1];
    header[2] = isBinary ? 1 : 0;
    header.writeUInt32BE(payload.length, 3);
    try {
      this.socket.write(Buffer.concat([header, payload]));
    } catch (err) {
      console.error('[HardwareTCP] Write failed:', err.message);
    }
  }

  close(code, reason) {
    this._finishClose(code || 1000, reason || '');
    try { this.socket.end(); } catch (_) { }
    try { this.socket.destroy(); } catch (_) { }
  }

  _finishClose(code, reason) {
    if (this._closed) return;
    this._closed = true;
    this.readyState = HardwareTcpClient.CLOSED;
    this.emit('close', code, Buffer.from(String(reason || '')));
  }
}
// Set on both the class (static, e.g. HardwareTcpClient.OPEN) and the
// prototype (instance-accessible, e.g. client.OPEN) - handleLiveProxyConnection
// checks `ws.readyState === ws.OPEN` on the instance itself (mirroring how
// the real 'ws' library exposes these constants both ways), and a
// static-only assignment left every ws.OPEN read on our instances
// `undefined`, silently dropping every outbound message to hardware clients
// including the initial setupComplete ACK.
HardwareTcpClient.CONNECTING = HardwareTcpClient.prototype.CONNECTING = 0;
HardwareTcpClient.OPEN = HardwareTcpClient.prototype.OPEN = 1;
HardwareTcpClient.CLOSING = HardwareTcpClient.prototype.CLOSING = 2;
HardwareTcpClient.CLOSED = HardwareTcpClient.prototype.CLOSED = 3;

const hardwareTcpServer = net.createServer((socket) => {
  socket.setNoDelay(true);
  const client = new HardwareTcpClient(socket);
  handleLiveProxyConnection(client, true);
});

hardwareTcpServer.listen(HARDWARE_TCP_PORT, () => {
  console.log(`[HardwareTCP] Raw TCP hardware endpoint listening on port ${HARDWARE_TCP_PORT}`);
});

// Timers/alarms/reminders: poll every 15s for anything due and push it to
// the device. Deliberately NOT a Gemini turn - it's a lightweight control
// frame (device chimes + shows it on screen, see reminderFired in main.cpp),
// so it works whether or not a live conversation happens to be in progress,
// and it's independent of any specific handleLiveProxyConnection() closure -
// it just needs whichever hardware session is currently active, if any.
setInterval(() => {
  let fired;
  try {
    fired = checkDueScheduledItems();
    pushScheduleStatus();
  } catch (err) {
    console.error('[Reminders] checkDueScheduledItems failed:', err.message);
    return;
  }
  if (isRecordingActive() && fired.length) {
    console.log(`[Reminders] ${fired.length} item(s) went off during a recording - kept silent`);
    return;
  }
  for (const item of fired) {
    console.log(`[Reminders] Fired: ${item.type} "${item.label || ''}" (id=${item.id})`);
    if (activeHardwareSession?.clientWs?.readyState === WebSocket.OPEN) {
      try {
        activeHardwareSession.clientWs.send(JSON.stringify({
          reminderFired: { type: item.type, label: item.label || '' }
        }));
      } catch (err) {
        console.error('[Reminders] Failed to notify device:', err.message);
      }
    } else {
      console.warn(`[Reminders] No connected hardware client to notify for id=${item.id} - it fired but was missed`);
    }
  }
}, 15000);

// Music library scan (/ims/musicscan): checked once a minute against its own
// configurable schedule_time, unlike reminders' 15s poll - it fires at most
// once a day, so minute-granularity is more than enough and cheaper.
setInterval(() => {
  try {
    checkAndTriggerNightlyScan();
  } catch (err) {
    console.error('[MusicScan] checkAndTriggerNightlyScan failed:', err.message);
  }
}, 60000);

// Nightscout Blood Glucose: poll every 60s and push to active hardware client
startGlucosePoller((glucose) => {
  if (activeHardwareSession?.clientWs?.readyState === WebSocket.OPEN) {
    try {
      activeHardwareSession.clientWs.send(JSON.stringify({
        glucose: { value: glucose.value, direction: glucose.direction, dbPct: glucose.dbPct }
      }));
    } catch (err) {
      console.error('[Glucose] Failed to push update to hardware client:', err.message);
    }
  }
});

// Temporary debug endpoint: accepts a raw PCM POST body from the
// MichalZaniewicz/esphome-esp32-s3-box-3-va reference firmware's on_data
// mic hook and saves it as a WAV file in the same folder as our own mic
// captures, so it can be compared directly. Deliberately a separate plain
// HTTP server, not an Express route - avoids the requireAdmin session auth
// applied globally to the main app, which a bare device http_request.post
// action has no way to satisfy. Matches that firmware's esp_audio_stack
// config: 48000Hz, 16-bit, mono.
const DEBUG_MIC_UPLOAD_PORT = 3003;
const debugMicCapturesDir = path.join(__dirname, 'audio_captures');
// Must exist up front - the single always-on debug.log (written by every
// live connection, interaction or not) lives directly in here, and can't
// rely on a per-interaction capture folder's mkdirSync to have created the
// parent dir first on a fresh checkout.
fs.mkdirSync(debugMicCapturesDir, { recursive: true });
const debugMicServer = http.createServer((req, res) => {
  // Phase 4/5 (imspersonality.md): the settings screen's slider/voice
  // changes POST here, and reads current values on boot. Same server/port
  // as the mic upload above, same reasoning - a bare device HTTP request has
  // no way to satisfy the main app's session-based requireAdmin middleware.
  // The box's camera: frames, a periodic "camera is attached" heartbeat, and
  // diagnostic log lines. Same plain-HTTP reasoning as /device/personality -
  // a bare device request can't satisfy the app's session login.
  if (req.method === 'POST' && req.url.startsWith('/device/camera/')) {
    const kind = req.url.split('?')[0].slice('/device/camera/'.length);
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      if (kind === 'frame') {
        if (body.length < 200 || body[0] !== 0xFF || body[1] !== 0xD8) { res.writeHead(400).end('not a jpeg'); return; }
        setFrame(body, 'device');
        res.writeHead(200).end('ok');
      } else if (kind === 'heartbeat') {
        heartbeat({ boot: req.url.includes('boot=1') });
        res.writeHead(200).end('ok');
      } else if (kind === 'log') {
        appendDeviceLog(body.toString('utf8').slice(0, 2000));
        res.writeHead(200).end('ok');
      } else {
        res.writeHead(404).end();
      }
    });
    return;
  }

  if (req.url === '/device/personality') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
         .end(JSON.stringify({ ...getPersonality(), captureLogging: getCaptureLogging() }));
      return;
    }
    if (req.method === 'POST') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          // captureLogging rides along on the same device settings POST but
          // isn't part of the personality itself - see the Preferences screen.
          if (typeof body.captureLogging === 'boolean') {
            setCaptureLogging(body.captureLogging);
          }
          const next = setPersonality(body);
          console.log('[Personality] Updated from device:', next, 'captureLogging:', getCaptureLogging());
          res.writeHead(200, { 'Content-Type': 'application/json' })
             .end(JSON.stringify({ ...next, captureLogging: getCaptureLogging() }));
        } catch (err) {
          console.error('[Personality] Failed to parse device update:', err.message);
          res.writeHead(400).end('bad request');
        }
      });
      return;
    }
    res.writeHead(405).end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/debug-mic-upload') {
    res.writeHead(404).end();
    return;
  }
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const pcm = Buffer.concat(chunks);
    const sampleRate = 48000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const wavHeader = Buffer.alloc(44);
    wavHeader.write('RIFF', 0);
    wavHeader.writeUInt32LE(36 + pcm.length, 4);
    wavHeader.write('WAVE', 8);
    wavHeader.write('fmt ', 12);
    wavHeader.writeUInt32LE(16, 16);
    wavHeader.writeUInt16LE(1, 20);
    wavHeader.writeUInt16LE(numChannels, 22);
    wavHeader.writeUInt32LE(sampleRate, 24);
    wavHeader.writeUInt32LE(byteRate, 28);
    wavHeader.writeUInt16LE(blockAlign, 32);
    wavHeader.writeUInt16LE(bitsPerSample, 34);
    wavHeader.write('data', 36);
    wavHeader.writeUInt32LE(pcm.length, 40);
    const outPath = path.join(debugMicCapturesDir, `reference_fw_mic_${Date.now()}.wav`);
    fs.writeFileSync(outPath, Buffer.concat([wavHeader, pcm]));
    console.log(`[DebugMicUpload] 💾 Saved ${outPath} (${pcm.length} bytes, ${(pcm.length / byteRate).toFixed(2)}s)`);
    res.writeHead(200).end('ok');
  });
});
debugMicServer.listen(DEBUG_MIC_UPLOAD_PORT, () => {
  console.log(`[DebugMicUpload] Listening on port ${DEBUG_MIC_UPLOAD_PORT} at /debug-mic-upload`);
});

