import express from 'express';
import cors from 'cors';
import session from 'express-session';
import helmet from 'helmet';
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
import { describeForIms as describeGlucoseForIms, logCarbs, clearOldNightscout, recentCarbs, dosingContext } from './services/glucoseHubService.js';
import { askProfileInsightQuestion } from './services/glucoseInsightService.js';
import { stripMedicalDisclaimers } from './services/disclaimerSanitizer.js';
import { lookUpFood } from './services/foodService.js';
import { isApprovedSession, isGuestSession, setGuestCheck } from './middleware/requireSession.js';
import { isInvited } from './services/decksService.js';
setGuestCheck(isInvited);
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
import { getCameraStatus, getFrame, wakeCamera, setFrame, heartbeat, appendDeviceLog, onCameraChange } from './services/cameraService.js';
import { askLive } from './services/lookService.js';
import { enrolFace } from './services/faceService.js';
let lastUnenrolledFace = null;
import { startPresence, onPresence } from './services/presenceService.js';
import { startWakeGate, transcribeWake } from './services/wakeGateService.js';
import { getAuthStatus } from './services/driveService.js';
import { validateConfiguredModels } from './services/modelService.js';
import { getModelFor } from './services/modelRegistry.js';
import { setDeviceMicMuted, setDeviceConnected, isDeviceMicMuted } from './services/deviceState.js';
import { recordUsage } from './services/geminiClient.js';
import { loadHnswFromDisk } from './services/hnswService.js';
import { getDeviceFace, ensurePack, onFacePackReady, packPath } from './services/faceDeviceService.js';
import { startConversation, addTurn, endConversation as endConversationLog, recentTurns } from './services/conversationLog.js';
import { summariseConversation, recallMemories, embedMemory } from './services/memoryService.js';
import { pickClip, ensureClips, ensureAllClips } from './services/holdingClips.js';
import { onTaskDone, markReported, owedThinkTasks } from './services/tasksService.js';
import { executeHardwareRAGSearch, getHardwareSetupPayload, recordReplyOpener, recordConversationMemory, getWebPersonaBlock, getPersonality, setPersonality, getCaptureLogging, setCaptureLogging, recordReplyText, getWebSetupPayload, getAccentRule, refreshLiveContext } from './services/hardwareClientService.js';
import { inYourVoice, languageCode as personaLanguageCode, onPersonaChange, activePersonaId } from './services/personaService.js';
import { scheduleItem, listScheduledItems, cancelScheduledItem, addToList, readList, removeFromList, clearList, checkDueScheduledItems, stopAllRinging, getActiveScheduledStatus, getItemsDueToday, getHistorySummary } from './services/remindersService.js';
import { getBirthdayFooterStatus, getUpcomingBirthdays, listBirthdays } from './services/birthdayService.js';
import { getTodayReleases, getWindowResults, getUpcomingReleases , getWants as getMusicWants } from './services/musicScanService.js';
import { isFirstInteractionToday, markMorningReportOffered, buildMorningReportDirective, getDayReport, prewarmDayReportCache, invalidateDayReportCache } from './services/morningReportService.js';
import { getNews } from './services/newsService.js';
import newsRoutes from './routes/news.js';
import tasksRoutes from './routes/tasks.js';
import devIdeasRoutes from './routes/devIdeas.js';
import decksRoutes from './routes/decks.js';
import campaignsRoutes from './routes/campaigns.js';
import dayReportRoutes from './routes/dayReport.js';
import codeRepoRoutes from './routes/codeRepo.js';
import { addIdea as addDevIdea, flagToolFailure } from './services/devIdeasService.js';
import { describeCollectionForIms } from './services/boardgamesService.js';
import { campaignsForIms } from './services/campaignsService.js';
import phrasesRoutes from './routes/phrases.js';
import { matchesWake, matchesStop, noteWakeCandidate } from './services/phrasesService.js';
import wakeDaemonRoutes from './routes/wakeDaemon.js';
import { wakeDaemonService, DAEMON_STATES } from './services/wakeDaemonService.js';
import doorbellRoutes from './routes/doorbell.js';
import weatherRoutes from './routes/weather.js';
import searchRoutes from './routes/search.js';
import runStartRoutes from './routes/runStart.js';
import { doorbellService } from './services/doorbellService.js';
import { createTask, describeTasksForIms } from './services/tasksService.js';
import appDb, { addMemory, getMemories, searchMemories, deleteMemory } from './db/database.js';
import { getWeather } from './services/weatherService.js';
import { startGlucosePoller, getGlucoseData } from './services/glucoseService.js';
import { checkAndTriggerNightlyScan } from './services/musicScanService.js';
import { schedulerService } from './services/schedulerService.js';
import eventBus from './services/eventBus.js';
import logger from './services/loggerService.js';
import { recordDeviceTelemetry, appendLog, setHardwareSocketSender } from './services/deviceHealthService.js';
import { setOtaActivityCheck } from './services/firmwareService.js';

// Hook OTA activity checks to active voice/recording states
setOtaActivityCheck(() => {
  const isConv = typeof isConversationActive !== 'undefined' ? Boolean(isConversationActive) : false;
  const isRec = typeof isRecordingActive === 'function' ? isRecordingActive() : false;
  return {
    canUpdate: !isConv && !isRec,
    reason: isConv ? 'Conversation with Gemini is active' : isRec ? 'Audio recording is active' : null
  };
});

// A tool call the model has written out as text instead of calling it: setEmotion(emotion='happy'),
// default_api.endConversation(), print(...) - never meant to be seen or kept.
const TOOL_TEXT = /(?:\bprint\s*\(\s*)?\b(?:default_api\.)?(?:setEmotion|noWakeDetected|endConversation|lookAtCamera|startRecording|[a-z]+[A-Z]\w*)\s*\((?:[^()]|\([^()]*\))*\)\s*\)?/g;
// Asking Ims to use his eyes: look / see / camera / observe / watch, in a sentence that's about what's in
// front of him ("what can you see?", "have a look at this", "watch for the postman", "how do I look?").
// Gemini doesn't always call lookAtCamera for these (8 Oct: "What can you see?" got "I can't quite make
// anything out"), so the server looks anyway and hands him the answer if he didn't (see visionAsk).
const VISION_ASK = [
  /\b(camera|webcam)\b/i,
  /\b(can|could|do|did|would|will)\s+you\s+(see|spot|make out|recogni[sz]e)\b/i,
  /\bwhat\s+(can|do|did)\s+you\s+see\b/i,
  /\bwho\s+(can|do)\s+you\s+see\b/i,
  /\b(have|take)\s+a\s+(quick\s+|proper\s+|good\s+)?(look|peek|gander|butcher'?s)\b/i,
  /\blook(ing)?\s+at\s+(this|that|these|those|me|my|him|her|them|what|who|it|the)\b/i,
  /\b(observe|watch(ing)?\s+(for|out for|me|this|that|the))\b/i,
  /\bhow\s+do\s+i\s+look\b/i,
  /\bwhat\s+am\s+i\s+(holding|wearing|doing|showing)\b/i,
  /\bwho('s|\s+is)\s+(this|that|here|there|with me|behind me|in front)\b/i,
];
// ...but not where the "look" is at information rather than at the room.
const NOT_VISION = /\b(calendar|diary|schedule|weather|forecast|glucose|sugar|reminders?|lists?|emails?|report|news|notes?|timers?|alarms?|look\s+(up|into|for(ward)?)|see\s+you|we'?ll\s+see|let'?s\s+see|see\s+if)\b/i;
const looksLikeVisionAsk = (text) => VISION_ASK.some((re) => re.test(text)) && !NOT_VISION.test(text);

const stripToolText = (text) => String(text).replace(TOOL_TEXT, '').replace(/[ 	]{2,}/g, ' ');


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Trust reverse proxies (ngrok, cloudflared) so client IP and X-Forwarded-Proto are accurately detected
app.set('trust proxy', 1);

// Ensure data directories exist
const dataDirs = ['data', 'data/pdfs', 'data/vectors'];
for (const dir of dataDirs) {
  fs.mkdirSync(path.join(__dirname, dir), { recursive: true });
}

// Security Headers & Content Security Policy tailored for IMS (OpenStreetMap tiles, Google Fonts, WebSockets)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "https:", "wss:", "ws:"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "*.tile.openstreetmap.org", "*.openstreetmap.org"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      workerSrc: ["'self'", "blob:"],
      mediaSrc: ["'self'", "data:", "blob:", "https:"],
      frameSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

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

// Scoped upload parsers with 50MB limits for file/image uploads
app.use('/api/pdf', express.json({ limit: '50mb' }), express.urlencoded({ limit: '50mb', extended: true }));
app.use('/api/glucose-hub/carbs/photo', express.json({ limit: '50mb' }), express.urlencoded({ limit: '50mb', extended: true }));
app.use('/api/planner/rulebook/books/upload', express.json({ limit: '50mb' }), express.urlencoded({ limit: '50mb', extended: true }));

// Standard global 1MB limit for all other routes to protect against oversized payload crashes
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

const sessionMiddleware = session({
  store: new SqliteSessionStore(), // logins survive backend restarts
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: 'auto', // Enforces secure cookie when connection is HTTPS or forwarded over HTTPS by ngrok
    sameSite: 'lax',
    maxAge: 180 * 24 * 60 * 60 * 1000 // one sign-in per device lasts; renewed on every visit
  },
  rolling: true
});
app.use(sessionMiddleware);

// Every API call needs this browser to be signed in with an approved Google account. Only the
// sign-in routes themselves are open. The device talks over its own TCP link, not this API.
const requireAdmin = (req, res, next) => {
  if (!req.path.startsWith('/api') || req.path.startsWith('/api/auth') || req.path.startsWith('/api/wake-daemon')) return next();
  // Device health telemetry reporting & live diagnostic stream
  if (req.path.startsWith('/api/device-health/report') || req.path.startsWith('/api/device-health/stream')) return next();
  // Local loopback diagnostics
  if (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1') return next();
  // the Start run button on a phone notification: guarded by its one-time token instead (routes/runStart.js)
  if (req.path.startsWith('/api/run-start/')) return next();
  if (isApprovedSession(req)) return next();
  // Invited guests: the deck builder only, never invites or anything else in IMS.
  if (isGuestSession(req) && req.path.startsWith('/api/decks/') && !req.path.startsWith('/api/decks/invites')) return next();
  return res.status(401).json({ error: 'Sign in with your Google account to use this.', signInRequired: true });
};

app.use(requireAdmin);
const QUIET_POLL_PATHS = ['/api/glucose', '/api/events', '/api/jobs', '/api/device-health', '/device/health', '/api/live/status', '/api/logs'];
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    const isQuiet = QUIET_POLL_PATHS.some(p => req.path.startsWith(p));
    if (isQuiet) {
      logger.debug('API', `${req.method} ${req.path}`);
    } else {
      logger.info('API', `${req.method} ${req.path}`);
    }
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
app.use('/api/dev-ideas', devIdeasRoutes);
app.use('/api/decks/campaigns', campaignsRoutes);  // campaign tracking - part of the deck builder, so guests can use it
app.use('/api/decks', decksRoutes);
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
app.use('/api/day-report', dayReportRoutes);
app.use('/api/code-repo', codeRepoRoutes);
app.use('/api/wake-daemon', wakeDaemonRoutes);
app.use('/api/doorbell', doorbellRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/run-start', runStartRoutes);
app.use('/api/device-health', (await import('./routes/deviceHealth.js')).default);
// Phase 4: Model Switcher, Storage, Costs
app.use('/api/models', (await import('./routes/models.js')).default);
app.use('/api/storage', (await import('./routes/storage.js')).default);
app.use('/api/costs', (await import('./routes/costs.js')).default);
app.use('/api/conversations', (await import('./routes/conversations.js')).default); // transcripts + Ims's answer times
app.use('/api/personas', (await import('./routes/personas.js')).default); // Ims's personas (character, accent, voice) + test bench
app.use('/api/voice-latency', (await import('./routes/voiceLatency.js')).default);

// Live figures for the System Architecture page (/ims/architecture).
app.get('/api/system/architecture', async (req, res) => {
  const count = (sql) => { try { return appDb.prepare(sql).get().c; } catch (_) { return null; } };
  const deviceLinks = await new Promise((resolve) => hardwareTcpServer.getConnections((err, n) => resolve(err ? 0 : n)));
  const cam = getCameraStatus();
  const online = deviceLinks > 0 || !!activeHardwareSession;
  res.json({
    success: true,
    tables: count("SELECT COUNT(*) c FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"),
    newsSources: count('SELECT COUNT(*) c FROM news_sources'),
    birthdays: count('SELECT COUNT(*) c FROM birthdays WHERE deleted_at IS NULL'),
    tasks: count('SELECT COUNT(*) c FROM tasks'),
    scheduled: count('SELECT COUNT(*) c FROM scheduled_items'),
    cameraAttached: Boolean(cam.attached),
    cameraAwake: Boolean(cam.awake),
    cameraStreaming: Boolean(cam.attached && cam.awake),
    hardware: {
      mic: { online, active: online && !isDeviceMicMuted(), muted: isDeviceMicMuted() },
      camera: { attached: Boolean(cam.attached), awake: Boolean(cam.awake), streaming: Boolean(cam.attached && cam.awake) },
      speaker: { online, active: false },
      display: { online, active: online },
      presence: { online: Boolean(cam.attached), active: Boolean(cam.attached && cam.awake) },
    },
    snapshots: count('SELECT COUNT(*) c FROM snapshots'),
    faces: count('SELECT COUNT(*) c FROM people'),
    deviceOnline: online,
    uptimeSec: Math.round(process.uptime()),
    node: process.version,
  });
});

// A test prompt from the System Architecture page: run through Ims's brain, each step streamed back as a
// line of JSON so the page can light up what's being used (read-only tools run; nothing is changed).
app.post('/api/system/trace', async (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  const emit = (o) => { if (!res.writableEnded) res.write(`${JSON.stringify(o)}\n`); };
  const started = Date.now();
  logger.info('Trace', `Test prompt started: "${String(req.body?.prompt || '').slice(0, 60)}"`);
  // never hang silently: give up after 2 minutes and say so
  const watchdog = setTimeout(() => { logger.warn('Trace', 'Test prompt timed out after 120 s'); emit({ type: 'error', error: 'The test took over 2 minutes and was stopped.' }); res.end(); }, 120000);
  try {
    const { traceTestPrompt } = await import('./services/traceService.js');
    await traceTestPrompt(req.body?.prompt, emit);
    logger.info('Trace', `Test prompt finished in ${Date.now() - started} ms`);
  } catch (err) {
    logger.error('Trace', `Test prompt failed after ${Date.now() - started} ms: ${err.message}`);
    emit({ type: 'error', error: err.message });
  }
  clearTimeout(watchdog);
  if (!res.writableEnded) res.end();
});

// Background Jobs telemetry and control (Dev Idea #44 & Phase 2)
app.get('/api/jobs', (req, res) => {
  res.json({ success: true, jobs: schedulerService.getJobs() });
});

app.post('/api/jobs/:name/run', async (req, res) => {
  try {
    const result = await schedulerService.runJobNow(req.params.name);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Backups (/ims/backups): status, drill, restore, and backup on demand (Dev Idea #48 & Phase 2)
app.get('/api/ims-backups', async (req, res) => {
  const { backupStatus } = await import('./services/backupService.js');
  res.json({ success: true, ...backupStatus() });
});
app.post('/api/ims-backups', async (req, res) => {
  const { runBackup } = await import('./services/backupService.js');
  try { res.json({ success: true, result: await runBackup({ reason: 'manual' }) }); } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
app.post('/api/ims-backups/restore/:filename', async (req, res) => {
  const { restoreBackup } = await import('./services/backupService.js');
  try {
    const result = await restoreBackup(req.params.filename);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post('/api/ims-backups/drill', async (req, res) => {
  const { runIntegrityDrill } = await import('./services/backupService.js');
  try {
    const result = await runIntegrityDrill();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Unified SSE Push Stream (Dev Idea #42 & Implementation Plan Phase 3)
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const client = eventBus.addClient(res, req.ip || req.socket?.remoteAddress);
  logger.debug('SSE', `Client connected (${eventBus.getClientCount()} total active)`);

  req.on('close', () => {
    eventBus.removeClient(client);
    logger.debug('SSE', `Client disconnected (${eventBus.getClientCount()} remaining)`);
  });
});

// Structured Logging Telemetry & Explorer (Dev Idea #50 & Implementation Plan Phase 3)
app.get('/api/logs', (req, res) => {
  const { limit, level, service, search, since } = req.query;
  const result = logger.getRecentLogs({
    limit: limit ? parseInt(limit, 10) : 200,
    level,
    service,
    search,
    since
  });
  res.json({ success: true, ...result });
});

app.get('/api/logs/services', (req, res) => {
  res.json({ success: true, services: logger.getServices() });
});

app.delete('/api/logs', (req, res) => {
  logger.clearBuffer();
  res.json({ success: true, message: 'In-memory log buffer cleared' });
});

// Wire Doorbell real-time events to SSE EventBus
doorbellService.on('doorbellEvent', (alert) => {
  try {
    // the web app stays silent while the Box-3 is in MIC MUTED mode
    eventBus.broadcast('doorbell:ding', { ...alert, deviceMuted: isDeviceMicMuted() });
    logger.info('Doorbell', `Broadcasted ${alert.event} alert for camera "${alert.cameraName}"`);
  } catch (_) {}
});
doorbellService.on('alertCleared', () => {
  try {
    eventBus.broadcast('doorbell:cleared', {});
  } catch (_) {}
});

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
const refreshStrava = () => { const st = getStravaStatus(); if (st.connected && st.canReadActivities) return syncStrava().catch((err) => console.error('[Strava] sync failed:', err.message)); };
// Nightscout only keeps a few hours, so glucose / IOB / treatments are logged locally every
// 5 minutes; that log is what runs are matched against (services/runGlucoseService.js).
const logGlucoseHistory = () => logNightscout().catch((err) => console.error('[NightscoutLog]', err.message));

// Weather for the device footer, refreshed every 30 minutes.
let deviceWeather = null;
const weatherKind = (c, day) => (/thunder/i.test(c) ? 'storm' : /snow/i.test(c) ? 'snow' : /rain|drizzle|shower/i.test(c) ? 'rain' : /fog/i.test(c) ? 'fog'
  : /clear|sunny|mainly clear/i.test(c) ? (day ? 'sun' : 'moon') : /partly/i.test(c) ? (day ? 'partsun' : 'cloud') : 'cloud');
const refreshDeviceWeather = () => getWeather({}).then((w) => {
  if (w?.current) { deviceWeather = { tempC: w.current.temperature_c, weather: weatherKind(w.current.condition, w.current.is_daylight) }; pushScheduleStatus(); }
}).catch(() => {});

// Central Job Scheduler Registrations (Dev Idea #44 & Implementation Plan Phase 2)
schedulerService.registerJob({
  name: 'calendar_refresh',
  description: 'Google Calendar event synchronization and automated reminder triggers',
  category: 'sync',
  intervalMs: 5 * 60 * 1000,
  initialDelayMs: 10000,
  action: refreshCalendar
});

schedulerService.registerJob({
  name: 'strava_sync',
  description: 'Strava activities sync and continuous training load calculation',
  category: 'sync',
  intervalMs: 30 * 60 * 1000,
  initialDelayMs: 20000,
  action: refreshStrava
});

schedulerService.registerJob({
  name: 'nightscout_log',
  description: 'Nightscout continuous glucose, IOB, and treatment history recording',
  category: 'sync',
  intervalMs: 5 * 60 * 1000,
  initialDelayMs: 15000,
  action: logGlucoseHistory
});

schedulerService.registerJob({
  name: 'weather_device_refresh',
  description: 'Live local weather update for desk terminal footer & speech status',
  category: 'sync',
  intervalMs: 30 * 60 * 1000,
  initialDelayMs: 20000,
  action: refreshDeviceWeather
});

schedulerService.registerJob({
  name: 'speech_stats',
  description: "Weekly: Ims's speech habits from the transcripts (faces, reply lengths, questions, repeated openers) - the worst becomes next week's 'vary this'",
  category: 'maintenance',
  intervalMs: 7 * 24 * 60 * 60 * 1000,
  initialDelayMs: 15 * 60 * 1000,
  action: async () => { const { computeSpeechStats } = await import('./services/moodService.js'); const s = computeSpeechStats({ days: 7 }); return { replies: s.replies }; }
});

schedulerService.registerJob({
  name: 'memory_vectors',
  description: 'Embed saved memories and conversation notes so Ims can recall them by meaning',
  category: 'maintenance',
  intervalMs: 6 * 60 * 60 * 1000,
  initialDelayMs: 2 * 60 * 1000,
  action: async () => { const { backfillMemoryVectors } = await import('./services/memoryService.js'); return { embedded: await backfillMemoryVectors() }; }
});

schedulerService.registerJob({
  name: 'persona_profiles',
  description: "Nightly: update what Ims knows about Simon and about himself from the day's conversations",
  category: 'maintenance',
  intervalMs: 60 * 60 * 1000,
  initialDelayMs: 10 * 60 * 1000,
  londonHourWindow: { minHour: 3, maxHour: 3 },
  action: async () => {
    const { getSetting, setSetting } = await import('./db/database.js');
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    if (getSetting('ims_profiles_last_day') === day) return { skipped: 'already done today' };
    const { updateProfiles } = await import('./services/memoryService.js');
    const r = await updateProfiles();
    setSetting('ims_profiles_last_day', day);
    return { conversations: r.conversations, updated: r.updated };
  }
});

schedulerService.registerJob({
  name: 'conversation_prune',
  description: 'Remove conversation transcripts older than the retention period',
  category: 'maintenance',
  intervalMs: 24 * 60 * 60 * 1000,
  initialDelayMs: 5 * 60 * 1000,
  action: async () => { const { pruneConversations } = await import('./services/conversationLog.js'); return { removed: pruneConversations() }; }
});

schedulerService.registerJob({
  name: 'morning_report_prewarm',
  description: 'Pre-warm daily morning briefing cache for sub-5ms instant delivery',
  category: 'maintenance',
  intervalMs: 60 * 60 * 1000,
  initialDelayMs: 60000,
  action: () => prewarmDayReportCache({ reason: 'scheduler_prewarm' })
});

schedulerService.registerJob({
  name: 'nightly_backup',
  description: 'Nightly database & assets backup to PC and Google Drive (post-03:00 London)',
  category: 'maintenance',
  intervalMs: 10 * 60 * 1000,
  initialDelayMs: 60000,
  londonHourWindow: { minHour: 3 },
  action: async () => {
    const { runBackup } = await import('./services/backupService.js');
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    const { getSetting, setSetting } = await import('./db/database.js');
    if (getSetting('backup_last_day') !== day) {
      setSetting('backup_last_day', day);
      await runBackup({ reason: 'nightly' });
    }
  }
});

schedulerService.registerJob({
  name: 'backup_integrity_drill',
  description: 'Weekly SQLite archive PRAGMA integrity_check drill & sandbox verification',
  category: 'maintenance',
  intervalMs: 7 * 24 * 60 * 60 * 1000,
  initialDelayMs: 5 * 60 * 1000,
  action: async () => {
    const { runIntegrityDrill } = await import('./services/backupService.js');
    await runIntegrityDrill();
  }
});

schedulerService.registerJob({
  name: 'dependency_watch',
  description: 'Weekly audit of project dependencies, outdated packages, and CVEs',
  category: 'maintenance',
  intervalMs: 6 * 60 * 60 * 1000,
  initialDelayMs: 3 * 60 * 1000,
  action: async () => {
    const { checkDependencyWatch } = await import('./services/dependencyWatchService.js');
    return checkDependencyWatch();
  }
});

schedulerService.registerJob({
  name: 'route_komoot_sync',
  description: 'Evening synchronization of saved routes and elevation tours from Komoot',
  category: 'sync',
  intervalMs: 10 * 60 * 1000,
  initialDelayMs: 60000,
  action: async () => {
    const { eveningKomootCheck } = await import('./services/routeFinderService.js');
    return eveningKomootCheck();
  }
});

schedulerService.registerJob({
  name: 'run_learning_tick',
  description: 'Match sent running sessions to Strava activities and update learning models',
  category: 'sync',
  intervalMs: 15 * 60 * 1000,
  initialDelayMs: 60000,
  action: async () => {
    const { tickRunLearning } = await import('./services/runLearningService.js');
    return tickRunLearning();
  }
});

schedulerService.registerJob({
  name: 'run_push_queue_tick',
  description: 'Phone push notification queue processor for carb stops and hydration alerts',
  category: 'realtime',
  intervalMs: 10000,
  action: async () => {
    const { tickRunPushQueue } = await import('./services/runAlertsService.js');
    return tickRunPushQueue();
  }
});

schedulerService.registerJob({
  name: 'glucose_hub_autoclear',
  description: 'Scheduled purge of ancient Nightscout entries exceeding retention policy',
  category: 'maintenance',
  intervalMs: 60 * 60 * 1000,
  initialDelayMs: 10 * 60 * 1000,
  // Only autoClearCheck() may clear: it respects the auto-clear switch, the 95%-full threshold and the
  // once-a-day limit. (This job used to call clearOldNightscout() directly - deleting everything older than
  // three months on Nightscout every hour regardless of any of those.)
  action: async () => {
    const { autoClearCheck } = await import('./services/glucoseHubService.js');
    return autoClearCheck();
  }
});

schedulerService.registerJob({
  name: 'model_assessment',
  description: 'Finds new Gemini models and tries each in every IMS service it could run (Ims\'s persona and accent included) - manual only (Model Switcher), as one run can use millions of tokens',
  category: 'maintenance',
  intervalMs: 24 * 3600 * 1000,
  initialDelayMs: 10 * 60 * 1000,
  // Off: it re-ran after every server restart and one run used 7.3M tokens (5 Oct). Run it from the
  // Model Switcher page (/api/models/assess) or the scheduler's "Run now" when wanted.
  enabled: false,
  action: async () => {
    const { assessModels } = await import('./services/modelAudit.js');
    return assessModels({ onlyNew: true });
  }
});

schedulerService.registerJob({
  name: 'pdf_dedupe',
  description: 'Hard-links identical PDFs (SHA-256) so each is stored once - only new or changed files are read',
  category: 'maintenance',
  intervalMs: 24 * 3600 * 1000,
  action: async () => {
    const { dedupePdfs } = await import('./services/storageService.js');
    return dedupePdfs();
  }
});

schedulerService.registerJob({
  name: 'camera_heartbeat',
  description: 'Desk camera daemon healthcheck and frame capture heartbeat verification',
  category: 'monitoring',
  intervalMs: 60000,
  action: async () => {
    // Read-only: only the device itself may report a heartbeat. Calling heartbeat() here faked a camera being
    // plugged in every minute, which flashed the yellow/green camera icon on Ims's screen with no camera attached.
    const { attached, awake } = getCameraStatus();
    return { attached, awake };
  }
});

// Backups, dependency watch, the Komoot evening sync, run pushes and run learning are all run by the
// scheduler jobs above - their old self-started timers are no longer started (they ran everything twice).

// The footer line: the soonest timer (the device counts it down), and unified rolling ticker of all upcoming items.
function deviceInfo() {
  const info = { ...(deviceWeather || {}) };
  try {
    const items = listScheduledItems();
    const activeTimers = items.filter((i) => i.type === 'timer').sort((a, b) => a.secondsFromNow - b.secondsFromNow);
    const primaryTimer = activeTimers[0];
    if (primaryTimer) { info.timerSec = primaryTimer.secondsFromNow; info.timerLabel = primaryTimer.label || ''; }
    
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    const hm = now.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
    
    // Helper to format item date/time badge
    const formatBadge = (dStr, tStr) => {
      if (!dStr) return tStr ? `(Today ${tStr})` : `(Today)`;
      if (dStr === todayStr) {
        return tStr ? `(Today ${tStr})` : `(Today)`;
      }
      try {
        const parts = dStr.split('-');
        if (parts.length === 3) {
          const dt = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
          const dateFmt = dt.toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
          return tStr ? `(${dateFmt} ${tStr})` : `(${dateFmt})`;
        }
      } catch (_) {}
      return tStr ? `(${dStr} ${tStr})` : `(${dStr})`;
    };

    const tickerItems = [];

    // 1. Running Timers (if any active timers on left icon stack)
    for (const tm of activeTimers) {
      const leftSec = tm.secondsFromNow;
      const mm = Math.floor(leftSec / 60);
      const ss = leftSec % 60;
      const timeStr = `${mm}:${ss < 10 ? '0' : ''}${ss}`;
      const label = tm.label || 'Countdown';
      tickerItems.push({
        sortKey: `0_${leftSec}`,
        text: `${label} (${timeStr} left)`
      });
    }

    // 2. Alarms & Reminders (upcoming active scheduled items on left icon stack)
    for (const item of items.filter((x) => x.type !== 'timer')) {
      const d = new Date(item.fireAt);
      const itemDateStr = d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      const itemTimeStr = d.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
      const badge = formatBadge(itemDateStr, itemTimeStr);
      const label = item.label || (item.type === 'alarm' ? 'Alarm' : 'Reminder');
      tickerItems.push({
        sortKey: `1_${d.getTime()}`,
        text: `${label} ${badge}`
      });
    }

    // 3. Birthdays (Today & upcoming in next 14 days, matching left cake icon status)
    try {
      const bdays = listBirthdays().filter((b) => b.daysUntil <= 14);
      for (const b of bdays) {
        let bDateStr = null;
        if (b.isToday) {
          bDateStr = todayStr;
        } else {
          const bYear = Number(todayStr.slice(0, 4));
          const mStr = String(b.month).padStart(2, '0');
          const dStr = String(b.day).padStart(2, '0');
          bDateStr = `${bYear}-${mStr}-${dStr}`;
        }
        const badge = formatBadge(bDateStr, null);
        const agePart = b.birthYear ? ` (${new Date().getFullYear() - b.birthYear}th)` : '';
        tickerItems.push({
          sortKey: `2_${String(b.daysUntil).padStart(3, '0')}`,
          text: `${b.name}${agePart} ${badge}`
        });
      }
    } catch (_) {}

    // 4. New Music Album Releases (Only if released today, matching the left music icon count)
    try {
      const todayReleases = getTodayReleases();
      for (const r of todayReleases) {
        const badge = formatBadge(todayStr, null);
        tickerItems.push({
          sortKey: `3_0_${r.artist}`,
          text: `${r.artist} - "${r.title}" ${badge}`
        });
      }
    } catch (_) {}

    // Sort combined ticker items
    tickerItems.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    if (tickerItems[0]) info.next = tickerItems[0].text;
    info.upcoming = tickerItems.slice(0, 24).map((n) => n.text);
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
        camera: (({ attached, deviceAwakeWanted }) => ({ attached, awake: Boolean(deviceAwakeWanted) }))(getCameraStatus()),
        recording: { active: isRecordingActive() },
        calendar: { icons: getDeviceIcons() },
        standbyFace: getStandbyOverride(),
        face: (() => { try { return getDeviceFace(); } catch (err) { console.error('[FaceDevice]', err.message); return { style: 'dots' }; } })(),
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

// The Box-3 shows the active persona's face: push the change at once, and again once its face pack is built.
onPersonaChange(() => { try { pushScheduleStatus(); } catch (_) { } });
onFacePackReady(() => { try { pushScheduleStatus(); } catch (_) { } });
setTimeout(() => { ensurePack().catch((err) => console.error('[FaceDevice] Pack build failed:', err.message)); }, 20000);

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
// the active persona's accent.
const VOICE_REMINDER = () => `DELIVERY REMINDER: ${getAccentRule()}`;
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
    // languageCode must survive this rebuild - dropping it let Ims drift out of English (UK)
    parsed.setup.generationConfig.speechConfig = { languageCode: personaLanguageCode(), voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } };
    console.log(`${tag} 🎙️ Gemini setup voice = ${voice}${was && was !== voice ? ` (corrected from ${was})` : ''}`);
    // Fresh date/time and records for this session, not the ones from when the device connected.
    const part = parsed.setup.systemInstruction?.parts?.[0];
    if (part?.text) part.text = refreshLiveContext(part.text);
    return JSON.stringify(parsed);
  } catch (_) {
    return msgStr;
  }
}

// "Hey / Hi / Eh up IMS", allowing for how speech-to-text spells the name (Ims, Ems, Eems, Hims, Elms...).
const WAKE_RX = /\b(hey[\s,-]*up|hey|hi|hiya|heya|hello|eh[\s,-]*up|ey[\s,-]*up|ay[\s,-]*up|aye[\s,-]*up|ayup|eyup|oi|up)\b[\s,.!?'-]*(h?[aei]{1,2}m+e?[sz]\b|i\.?\s?m\.?\s?s\b|elms\b|helms\b|aops\b)/i;
// Speech-to-text often mangles the short wake phrase ("Hey IMS" -> "HMs", "Eh up Ims" -> "Anya Pims",
// "Hi IMS" -> "Hiya."). Gemini hears the audio itself, so when it has decided to answer, these
// count too: a name-like word near the start, or a bare greeting. Ordinary sentences don't.
const NAME_TOKEN = /\b(i\.?\s?m\.?\s?s|ims|imz|ems|eems|emms|hims|aims|hms|h\.?\s?m\.?\s?s|pims|mims|m's|ms|him's|hymns?|elms|helms|aops|\w*pms|\w*ims\w*)\b/i;
const GREETING_ONLY = /^\W*(hi|hiya|hi ya|heya|hey|hey up|hello|eh up|ey up|ay up|aye up|ayup|eyup|anya|now then)\W*$/i;
const looksAddressed = (t) => {
  const text = String(t || '').trim();
  const opening = text.split(/\s+/).slice(0, 5).join(' ');
  if (WAKE_RX.test(text) || NAME_TOKEN.test(opening) || GREETING_ONLY.test(text) || matchesWake(text) || ehUpSounding(text)) return true; // + spellings recorded on /ims/phrases
  if (wakeDaemonService.isWakePhrase(text).matches) return true;
  return false;
};
// Strict enough to overrule Gemini's own "no wake phrase" verdict: a recorded spelling, the full
// wake phrase, or a short utterance ending in something like the name ("Neyo Pims", "radio Pims").
const heardLikeWake = (t) => {
  const text = String(t || '').trim();
  if (!text) return false;
  if (matchesWake(text) || WAKE_RX.test(text) || ehUpSounding(text) || wakeDaemonService.isWakePhrase(text).matches) return true;
  const words = text.split(/\s+/).filter(Boolean);
  return words.length <= 4 && /\b(\w*pims|\w*pms|ims|ems|eems|him's|hims|hymns?|m's)\W*$/i.test(text);
};
// "Eh up IMS" run together sounds like "pms", and speech-to-text writes it as "poems", "APM", "up ems"...
// For a short utterance (three words at most), letters only: an optional eh/ey/ay sound, then p, any
// vowels, m, and an optional s. Ordinary words rarely have that shape; Gemini, which heard the audio,
// has also already chosen to answer before this is consulted.
const EHUP_SHAPE = /^(?:[aeiuy]+h?[aeiouy]*)?p+[aeiouy]*m+[aeiouy]*[sz]?$/;
const ehUpSounding = (t) => {
  const text = String(t || '').trim();
  if (!text || text.split(/\s+/).length > 3) return false;
  return EHUP_SHAPE.test(text.toLowerCase().replace(/[^a-z]/g, ''));
};
// After a Gemini error (outage, quota) NO new Live session opens anywhere until this passes - mic audio and
// wake checks used to open a fresh session on every frame, hundreds a minute, which is what tripped the quota.
let geminiCooldownUntil = 0;
// E5: when the last desk conversation ended and why - a new session soon after a silence close or a dropped
// connection is handed the last few exchanges, so "and what about tomorrow?" still makes sense
let lastConversationEnd = { at: 0, reason: null };
// C2: a 'proper think' answer is given in the conversation it came from if that's still open; otherwise it waits
// for the next conversation Simon starts (it's in the session prompt until then)
const thinkDeliverers = new Set();
onTaskDone((t) => { if (t?.kind !== 'think') return; for (const deliver of thinkDeliverers) { try { if (deliver(t)) return; } catch (_) { } } });
// A2: each persona's holding lines are recorded once (and again when its voice or lines change)
setTimeout(() => { ensureAllClips().catch((err) => console.warn('[Holding]', err.message)); }, 3 * 60 * 1000);
onPersonaChange((id) => { ensureClips(id).catch(() => {}); });
// I4: the face follows the words. A reply he starts without setting a face gets one from its opening words,
// and a reply can change face partway when the words take a turn (once per reply). First match wins.
const FACE_CUES = [
  ['disgusted', /\b(yuck|gross|grim|disgusting|revolting|minging|vile)\b/i],
  ['amazement', /\b(wow|blimey|by 'eck|ee by gum|incredible|unbelievable|can you believe|would you believe|amazing|astonishing)\b/i],
  ['sad', /\b(sadly|unfortunately|sorry to hear|bad news|what a shame|gutted|i'm sorry|that's a pity)\b/i],
  ['suspicious', /\b(hmm+|are you sure|pull the other one|i doubt|sounds fishy|likely story|i'm not convinced)\b|\breally\?/i],
  ['confused', /\b(not sure what you mean|you've lost me|come again|baffled|confused|doesn't add up)\b|\beh\?/i],
  ['cocky', /\b(ha+|heh|told you|course i did|obviously|cheeky|you would|nice try|daft (?:beggar|ha'porth))\b/i],
  ['love', /\b(proud of you|love that|bless|i'm touched|you're a good|means a lot)\b/i],
  ['bored', /\b(yawn|tedious|boring|same again|dull as)\b/i],
  ['joy', /\b(great news|good news|brilliant|cracking|fantastic|wonderful|lovely|grand|smashing|champion|well done|congratulations|morning|hello|ey up|now then)\b/i],
];
const faceFromWords = (text, used = []) => (FACE_CUES.find(([emo, rx]) => !used.includes(emo) && rx.test(text)) || [])[0] || null;
const FOLLOW_UP_MS = 10000; // after Ims stops talking, a reply within this long needs no wake phrase

// The always-on debug log (audio_captures/debug.log). Written through one stream - a blocking write per line
// paused the server, and it grew to 430 MB - and rotated: at the first write of a new day, or past 100 MB,
// the current file becomes debug-YYYY-MM-DD[-HHMM].log, and rotated logs older than 14 days are deleted.
// The ESP-IDF verbose/debug lines older firmware sends ("V (1234) ENUM: ...") are left out.
const DEBUG_LOG_DIR = path.join(__dirname, 'audio_captures');
const DEBUG_LOG_PATH = path.join(DEBUG_LOG_DIR, 'debug.log');
const DEBUG_LOG_MAX_BYTES = 100 * 1024 * 1024;
const DEBUG_LOG_KEEP_DAYS = 14;
const IDF_NOISE = /DEVICE LOG: [VD] \(\d+\) /;
let debugLogStream = null, debugLogDay = '', debugLogBytes = 0;
const londonDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
function rotateDebugLog(label) {
  try { if (debugLogStream) debugLogStream.end(); } catch (_) { }
  debugLogStream = null;
  try {
    if (fs.existsSync(DEBUG_LOG_PATH) && fs.statSync(DEBUG_LOG_PATH).size > 0) {
      let dest = path.join(DEBUG_LOG_DIR, `debug-${label}.log`);
      if (fs.existsSync(dest)) dest = path.join(DEBUG_LOG_DIR, `debug-${label}-${Date.now()}.log`);
      fs.renameSync(DEBUG_LOG_PATH, dest);
    }
    // rotated logs, and the per-conversation capture folders (audio.wav / mic.wav / debug.log), after 14 days
    const cutoff = Date.now() - DEBUG_LOG_KEEP_DAYS * 86400000;
    for (const f of fs.readdirSync(DEBUG_LOG_DIR)) {
      const full = path.join(DEBUG_LOG_DIR, f);
      if (/^debug-.+\.log$/.test(f) && fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
      else if (/^\d{13}_(hardware|browser)$/.test(f) && Number(f.slice(0, 13)) < cutoff) fs.rmSync(full, { recursive: true, force: true });
    }
  } catch (err) { console.warn('[DebugLog] rotate:', err.message); }
}
function writeDebugLog(line) {
  if (IDF_NOISE.test(line)) return;
  const day = londonDay();
  if (!debugLogStream) {
    // first write since start-up: a log left from an earlier day, or an oversized one, is rotated first
    try {
      const st = fs.existsSync(DEBUG_LOG_PATH) ? fs.statSync(DEBUG_LOG_PATH) : null;
      const fileDay = st ? new Date(st.mtimeMs).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) : day;
      if (st && (fileDay !== day || st.size > DEBUG_LOG_MAX_BYTES)) rotateDebugLog(fileDay);
      debugLogBytes = fs.existsSync(DEBUG_LOG_PATH) ? fs.statSync(DEBUG_LOG_PATH).size : 0;
    } catch (_) { debugLogBytes = 0; }
    debugLogDay = day;
    debugLogStream = fs.createWriteStream(DEBUG_LOG_PATH, { flags: 'a' });
    debugLogStream.on('error', (err) => { console.warn('[DebugLog]', err.message); debugLogStream = null; });
  } else if (day !== debugLogDay || debugLogBytes > DEBUG_LOG_MAX_BYTES) {
    rotateDebugLog(day !== debugLogDay ? debugLogDay : `${day}-${new Date().toISOString().slice(11, 16).replace(':', '')}`);
    debugLogDay = day;
    debugLogBytes = 0;
    debugLogStream = fs.createWriteStream(DEBUG_LOG_PATH, { flags: 'a' });
    debugLogStream.on('error', (err) => { console.warn('[DebugLog]', err.message); debugLogStream = null; });
  }
  debugLogBytes += Buffer.byteLength(line);
  debugLogStream.write(line);
}

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
  const captureDir = path.join(__dirname, 'audio_captures', `${Date.now()}_${isHardware ? 'hardware' : 'browser'}`);
  const capturePath = path.join(captureDir, 'audio.wav');
  const micCapturePath = path.join(captureDir, 'mic.wav');
  const connectionLogPath = path.join(captureDir, 'debug.log');
  const connectionLogLines = []; // the last CONNECTION_LOG_MAX lines - a Box-3 connection lasts hours
  const CONNECTION_LOG_MAX = 2000;
  let captureFolderCreated = false;
  let connectionLogStream = null;

  const ensureCaptureFolder = () => {
    if (captureFolderCreated) return;
    // Preferences screen toggle - when off, no per-interaction folder is
    // written at all (the always-on audio_captures/debug.log is unaffected).
    if (!getCaptureLogging()) return;
    captureFolderCreated = true;
    try {
      fs.mkdirSync(captureDir, { recursive: true });
      connectionLogStream = fs.createWriteStream(connectionLogPath, { flags: 'a' });
      connectionLogStream.on('error', () => { connectionLogStream = null; });
      connectionLogStream.write(connectionLogLines.join(''));
    } catch (_) { }
  };

  // Writes to the single global running log always, and buffers into this
  // connection's own in-memory log - only actually written to a folder (and
  // kept live-appended from then on) once ensureCaptureFolder() has fired.
  const logCapture = (line) => {
    try { writeDebugLog(line); } catch (_) { }
    if (IDF_NOISE.test(line)) return;
    connectionLogLines.push(line);
    if (connectionLogLines.length > CONNECTION_LOG_MAX) connectionLogLines.splice(0, connectionLogLines.length - CONNECTION_LOG_MAX);
    if (connectionLogStream) {
      try { connectionLogStream.write(line); } catch (_) { }
    }
  };

  const remoteInfo = ws.socket ? `${ws.socket.remoteAddress}:${ws.socket.remotePort}` : (ws._socket ? `${ws._socket.remoteAddress}:${ws._socket.remotePort}` : 'unknown');
  console.log(`${tag} Client connected from ${remoteInfo}`);
  logCapture(`[${new Date().toISOString()}] ${tag} CLIENT CONNECTED from ${remoteInfo}\n`);
  if (isHardware) {
    ws.isHardwareClient = true;
    const clientIp = (ws.socket?.remoteAddress || ws._socket?.remoteAddress || '192.168.1.92').replace(/^.*:/, '');
    recordDeviceTelemetry({ isSocketOpen: true, ipAddress: clientIp });
    setHardwareSocketSender((msg) => {
      try {
        if (ws.readyState === ws.OPEN) ws.send(msg);
      } catch (e) {
        console.error('[HardwareLive] Failed to send to hardware socket:', e.message);
      }
    });
    appendLog('server', `[HardwareLive] Box-3 connected from ${remoteInfo}`);
  }

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
        if (activeHardwareSession.clientWs) {
          activeHardwareSession.clientWs.close(1000, 'Replaced by new hardware session');
        }
      } catch (e) {
        console.error(`${tag} Error closing prior hardware session:`, e);
      }
    }
    activeHardwareSession = { clientWs: ws, geminiWs: null };
    setDeviceConnected(true);
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
  let liveModel = null; // the voice model this session was set up with (Model Switcher), for usage logging
  let resumptionHandle = null; // latest Gemini session-resumption handle for this device connection
  let resumptionHandleAt = 0;
  // An old handle has usually expired on Google's side: presenting it failed the connection ("Requested entity
  // was not found", 1008) and cost a back-off before a fresh session. Only resume recent ones.
  const RESUME_MAX_AGE_MS = 15 * 60000;
  const freshResumptionHandle = () => (resumptionHandle && Date.now() - resumptionHandleAt < RESUME_MAX_AGE_MS ? resumptionHandle : null);
  let isClientClosed = false;
  const outboundQueue = [];
  const outboundAudioQueue = [];
  let geminiSetupAcknowledged = false;

  // ---- Local wake check (wakeGateService.js) ----------------------------------------------------------
  // On standby, the Box-3's mic audio is held and transcribed on this PC; Gemini is opened (and handed the
  // held audio) only when it sounds like a wake phrase - the same matchers as everywhere else
  // (looksAddressed: the wake phrases service's recorded spellings included), or speech that opens with a
  // greeting, which Gemini still judges as before. A local check that fails lets the audio through.
  const WAKE_FIRST_CHECK_BYTES = 16000 * 2 * 1.2; // 1.2 s of 16 kHz 16-bit audio: enough for "Hey Ims"
  const WAKE_RECHECK_BYTES = 16000 * 2 * 0.6;     // then look again every 0.6 s while the sound goes on
  const WAKE_MAX_BYTES = 16000 * 2 * 8;           // hold at most the last 8 s
  const WAKE_GIVE_UP_MS = 8000;                   // no wake phrase 8 s into a sound: not for Ims
  const WAKE_GREETING_START = /^\W*(hey|hi|hiya|heya|hello|eh|ey|ay|aye|ayup|eyup|oi|now then)\b/i;
  const wakeGate = { frames: [], bytes: 0, startedAt: 0, lastFrameAt: 0, checkedBytes: 0, checking: false, done: false, passedAt: 0 };
  const resetWakeGate = () => Object.assign(wakeGate, { frames: [], bytes: 0, startedAt: 0, lastFrameAt: 0, checkedBytes: 0, checking: false, done: false });
  const wakeGateApplies = () => {
    if (isRecordingActive() || phraseCapture) return false;
    if (isConversationActive || touchToTalkActive || Date.now() <= followUpUntil + 1500) return false;
    if (wakeDaemonService.state === DAEMON_STATES.CONVERSATION_ACTIVE) return false;
    if (Date.now() - wakeGate.passedAt < 15000) return false; // this burst already opened Gemini
    if (currentGeminiWs && currentGeminiWs.readyState === WebSocket.OPEN && !currentTurnComplete) return false; // he's mid-reply
    return true;
  };
  const openWakeGate = (text, strong) => {
    if (Date.now() - wakeGate.passedAt < 15000) return;
    wakeGate.passedAt = Date.now();
    const held = wakeGate.frames;
    resetWakeGate();
    console.log(`${tag} 🗝️ Local wake check passed ("${text}") - opening Gemini with ${held.length} held frames`);
    // a clear wake phrase: tell the Box-3 now, so it keeps listening while Gemini connects
    if (strong) wakeDaemonService.acceptWake(text.slice(0, 40), 'local');
    for (const f of held) outboundAudioQueue.push(JSON.stringify({ realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: f.toString('base64') } } }));
    sessionUsed = true;
    const g = ensureGeminiSocket();
    if (g && g.readyState === WebSocket.OPEN && geminiSetupAcknowledged) while (outboundAudioQueue.length) g.send(outboundAudioQueue.shift());
  };
  const checkWake = () => {
    if (wakeGate.checking || wakeGate.done) return;
    if (wakeGate.bytes - wakeGate.checkedBytes < (wakeGate.checkedBytes ? WAKE_RECHECK_BYTES : WAKE_FIRST_CHECK_BYTES)) return;
    if (Date.now() - wakeGate.startedAt > WAKE_GIVE_UP_MS) {
      wakeGate.done = true;
      try { logCapture(`[${new Date().toISOString()}] ${tag} LOCAL WAKE CHECK: no wake phrase - Gemini not opened\n`); } catch (_) { }
      return;
    }
    wakeGate.checkedBytes = wakeGate.bytes;
    // too quiet to hold speech (no 0.1 s stretch louder than ~400 RMS): nothing to transcribe
    const pcm = Buffer.concat(wakeGate.frames);
    let loud = false;
    for (let i = 0; i + 3200 <= pcm.length && !loud; i += 3200) {
      let s = 0;
      for (let j = i; j < i + 3200; j += 2) { const v = pcm.readInt16LE(j); s += v * v; }
      loud = Math.sqrt(s / 1600) > 400;
    }
    if (!loud) return;
    wakeGate.checking = true;
    const t0 = Date.now();
    transcribeWake(pcm).then((text) => {
      const strong = looksAddressed(text);
      const ok = strong || WAKE_GREETING_START.test(text);
      try { logCapture(`[${new Date().toISOString()}] ${tag} LOCAL WAKE CHECK "${text}" -> ${ok ? 'OPEN' : 'hold'} (${Date.now() - t0} ms)\n`); } catch (_) { }
      if (ok) openWakeGate(text, strong);
    }).catch((err) => {
      if (err.message === 'busy') return;
      try { logCapture(`[${new Date().toISOString()}] ${tag} LOCAL WAKE CHECK unavailable (${err.message}) - letting Gemini decide\n`); } catch (_) { }
      openWakeGate('', false);
    }).finally(() => {
      wakeGate.checking = false;
      if (wakeGateApplies()) checkWake();
    });
  };
  const gateWakeAudio = (buf) => {
    const now = Date.now();
    if (now - wakeGate.lastFrameAt > 1500) resetWakeGate(); // a new burst of sound
    if (!wakeGate.startedAt) wakeGate.startedAt = now;
    wakeGate.lastFrameAt = now;
    lastMicFrameAt = now;
    if (!isRecordingActive()) micAudioChunks.push(buf);
    wakeDaemonService.notifyCandidateStart(clientType);
    if (wakeGate.done) return; // already judged not to be for Ims - wait for the sound to stop
    wakeGate.frames.push(buf);
    wakeGate.bytes += buf.length;
    while (wakeGate.bytes > WAKE_MAX_BYTES) {
      const f = wakeGate.frames.shift();
      wakeGate.bytes -= f.length;
      wakeGate.checkedBytes = Math.max(0, wakeGate.checkedBytes - f.length);
    }
    checkWake();
  };
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
  // The desk keeps one warm Gemini session ready so a wake is answered quickly. An untouched warm session
  // is NOT closed by the silence timer (that used to close and reopen it every ~17 s, ~210 sessions an hour,
  // all day, which ate into the Live API's session rate limit). It's recycled every WARM_RECYCLE_MS instead,
  // or straight away when the persona changes, so its date/time, records and persona stay fresh.
  const WARM_RECYCLE_MS = 10 * 60 * 1000;
  let sessionUsed = false;       // anything said or sent in this Gemini session yet
  let sessionPersonaId = null;   // the persona the session was set up with
  let lastActivityAt = Date.now();
  let silenceClosedAt = 0; // mic frames still in flight when the session closed are dropped
  let webAudioEndAt = 0;
  const silenceTimer = imsBrain ? setInterval(() => {
    if (isClientClosed || !currentGeminiWs || currentGeminiWs.readyState !== WebSocket.OPEN) return;
    if (!currentTurnComplete) return; // Ims is thinking or speaking
    if (isHardware && isRecordingActive()) return;
    // The user spoke in the follow-up window, the mic carried it to Gemini, and 3.5 s after they
    // stopped there's still no transcript and no reply - Gemini lost it (often the start was cut by the
    // echo guard). Rather than sit in "thinking" until the silence timeout, ask Ims to check what they
    // said. A reply to the user, never unprompted; once per thing said.
    // Require at least 45 frames (~1.4s of genuine speech) so natural brief pauses or throat-clears
    // aren't treated as abandoned speech and prematurely interrupted.
    if (isHardware && !clarifyNudged && pendingSpeechFrames >= 45 && Date.now() - pendingSpeechLast >= 3500
      && followUpUntil && pendingSpeechStart <= followUpUntil + 1000) {
      clarifyNudged = true;
      const frames = pendingSpeechFrames;
      clearPendingSpeech();
      textTurnSent = true;
      lastActivityAt = Date.now();
      try { logCapture(`[${new Date().toISOString()}] ${tag} NO REPLY TO SPEECH (${frames} speech frames, no transcript) - asking Ims to check what was said\n`); } catch (_) { }
      console.log(`${tag} 🤔 Speech went unanswered - asking Ims to check what was said`);
      currentGeminiWs.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: '(System: the user just said something to you, but it did not come through clearly - it may have been cut off. Do not stay silent. In one short sentence, ' + inYourVoice() + ', say you did not quite catch it and ask them to say it again. Do not greet them.)' }] }], turnComplete: true } }));
      return;
    }
    if (isHardware && !sessionUsed) {
      let personaNow = sessionPersonaId;
      try { personaNow = activePersonaId(); } catch (_) { }
      if (Date.now() - geminiConnectedAt < WARM_RECYCLE_MS && personaNow === sessionPersonaId) return; // warm and waiting: keep it
      try { logCapture(`[${new Date().toISOString()}] ${tag} WARM SESSION RECYCLED (${personaNow !== sessionPersonaId ? 'persona changed' : 'age'})\n`); } catch (_) { }
      try { currentGeminiWs.close(1000, 'Warm session recycle'); } catch (_) { } // the close handler reconnects
      return;
    }
    if (isHardware && deviceStillPlaying()) return; // he's still talking on the desk
    if (isHardware && Date.now() - lastMicFrameAt < 3000) return; // someone may be mid-sentence - never close under them
    const playingUntil = isHardware ? Math.max(paceSentMs ? paceStart + paceSentMs : 0, lastDeviceSpeakingAt) : webAudioEndAt;
    const quietSince = Math.max(lastActivityAt, playingUntil, turnCompleteAt || 0);
    if (Date.now() - quietSince < Math.max(SILENCE_CLOSE_MS, followUpMs + 5000)) return;
    console.log(`${tag} 💤 15 s of silence - closing the Gemini session`);
    silenceClosedAt = Date.now();
    try { logCapture(`[${new Date().toISOString()}] ${tag} SILENCE CLOSE (15s)\n`); } catch (_) { }
    convEnd('silence');
    isConversationActive = false;
    touchToTalkActive = false;
    wakeDaemonService.forceStandby('silence_timeout');
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
      if (item.bin) { ws.send(item.bin, { binary: true }); paceSentMs += item.bin.length / PCM_BYTES_PER_MS; lastAudioSentAt = Date.now(); }
      else ws.send(item.json);
    }
    if (!paceQueue.length && paceTimer) { clearInterval(paceTimer); paceTimer = null; }
  };
  const paceSend = (item) => {
    paceQueue.push(item);
    pacePump();
    if (paceQueue.length && !paceTimer) paceTimer = setInterval(pacePump, 40);
  };
  // What the Box-3 reports about its own speaker (playbackStart / playbackDone and "state=6" heartbeats).
  // From playbackStart until playbackDone Ims is talking, whatever the estimate says - capped at 3 minutes
  // after the last audio was sent, so a lost message can't hold a session open. If the device never started
  // playing a reply, the estimate below is all there is.
  let devicePlaying = false, lastAudioSentAt = 0, lastDeviceSpeakingAt = 0;
  const deviceStillPlaying = () => {
    if (!isHardware) return false;
    const now = Date.now();
    if (paceQueue.length > 0) return true;
    if (devicePlaying && now - lastAudioSentAt < 180000) return true;
    if (now - lastDeviceSpeakingAt < 6000) return true;
    return Boolean(paceSentMs && now < paceStart + paceSentMs);
  };
  const paceFlush = () => {
    paceQueue.length = 0;
    paceSentMs = 0;
    devicePlaying = false;
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
  // "Heard you, but nothing came back" (see the silence timer): speech the user sent after Ims's last
  // turn that Gemini has neither transcribed nor answered, and whether Ims has been asked to check.
  let pendingSpeechFrames = 0, pendingSpeechStart = 0, pendingSpeechLast = 0, clarifyNudged = false;
  const clearPendingSpeech = () => { pendingSpeechFrames = 0; pendingSpeechStart = 0; pendingSpeechLast = 0; };
  let userTranscriptSeen = false;
  let textTurnSent = false;
  let unsolicitedTurn = false;
  // Tracks when the getDayReport tool response was last sent. Gemini sometimes
  // fires a genuine turnComplete mid-report (it finished the first batch of
  // audio) and then immediately starts a second turn to continue - that
  // continuation looks like an unsolicited turn but is legitimate. Give a
  // 120-second grace window after dispatching the report tool-response so the
  // continuation is not dropped.
  let dayReportSentAt = 0;
  // Gemini sometimes speaks a few items of the report and stops (6 Oct: three calendar items, no weather,
  // health or news). Words spoken since the report went out are counted; a reply that ends far short of a
  // full report gets one "carry on" note, so he finishes it without being asked twice.
  let dayReportWords = 0, dayReportSections = 0, dayReportNudged = false;
  // Triggers are only cleared once a turn that actually SPOKE has finished. Gemini
  // reports a tool call (e.g. the wake-phrase check) as its own finished turn, and
  // its real answer follows it a moment later - that answer is still a reply to
  // the same user speech and must not be dropped.
  let turnHadAudio = false;
  // A quick answer ("lunchtime") can start his reply before its transcript arrives, and mic energy in the first
  // 3 s after Gemini's turnComplete is ignored (echo) - so also count loud mic after the reply finished
  // playing, inside the follow-up window. (followUpUntil - followUpMs is when playback ended.)
  const answeredAloud = () => followUpUntil > 0 && Date.now() <= followUpUntil && lastLoudMicAt > followUpUntil - followUpMs + 700;
  const turnHasTrigger = () => energeticMicFrames >= 8 || userTranscriptSeen || textTurnSent || answeredAloud();
  const resetTurnTriggers = () => { speechStartAt = 0; energeticMicFrames = 0; userTranscriptSeen = false; textTurnSent = false; stopWindow = ''; heardThisTurn = ''; heardStartAt = 0; };
  // Wake gate (desk only): Ims may only speak when what was just heard contains a wake phrase,
  // or it is a follow-up that started within FOLLOW_UP_MS of him finishing - or a tap / device text.
  let heardThisTurn = '';
  // Carbs go to Nightscout and AAPS takes them in, so they are only sent after Ims has proposed a
  // number and the user has answered since (spoken or typed) - see the logCarbs handler.
  let pendingCarbs = null;
  let lastUserInputAt = 0;
  let heardStartAt = 0;
  // Wake kick: Gemini sometimes transcribes "Hi Ims" but never ends the user's turn, so no reply starts before
  // the Box-3 gives up (4.5 s). Once a wake phrase is heard and the speech has stopped, the server ends the
  // audio turn itself, and if that still gets nothing, tells him in text to answer.
  let lastModelOutputAt = 0;
  // An answer is owed once a tool's result has gone back to Gemini. His holding line ("let's have a look")
  // finishes as its own turn and clears the turn triggers, so the real answer that follows used to look
  // unsolicited and was dropped (6 Oct: glucose and pre-bolus answers lost) - the next turn is that answer.
  let toolAnswerOwedAt = 0;
  let toolAnswerWords = 0;
  // A look / see request (looksLikeVisionAsk): the camera is asked at once, and if his reply comes back
  // without a lookAtCamera call, the answer is handed to him as a follow-up so he says what he can see.
  let visionAsk = null; // { at, toolCalled, result: Promise }
  let wordsSpoken = 0; // every word he has said this connection - to tell whether he already answered after a tool call // words spoken since the result went back - a real answer (not the tail of the holding line) settles it
  let wakeKickTimer = null;
  let followUpUntil = 0;

  // ---- Conversation transcripts and time-to-first-word (conversationLog.js, persona plan Phase 0) ----
  // A turn is recorded once Gemini completes a reply that was actually heard (dropped / unsolicited replies
  // never reach here). Latency: from the end of the user's transcribed words (or a device text turn) to the
  // first audio of the reply. Nothing is recorded while a call or meeting is being recorded.
  let convId = null, convLastTurnAt = 0, convEndPending = null;
  let followUpMs = FOLLOW_UP_MS; // F1: 25 s after a question or a long answer, 10 s otherwise
  let sessionOwedIds = []; // C2: 'think' answers this session's prompt told him to give
  const deliverThink = (t) => {
    if (!imsBrain || !isConversationActive || !currentGeminiWs || currentGeminiWs.readyState !== WebSocket.OPEN || (isHardware && isRecordingActive())) return false;
    textTurnSent = true; sessionUsed = true; lastActivityAt = Date.now();
    currentGeminiWs.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: `(System: your considered answer to "${t.request}" is ready. Give it to him now, in your own words, conclusion first and briefly: ${t.summary})` }] }], turnComplete: true } }));
    markReported([t.id]);
    try { logCapture(`[${new Date().toISOString()}] ${tag} PROPER THINK DELIVERED #${t.id}\n`); } catch (_) { }
    return true;
  };
  thinkDeliverers.add(deliverThink);
  const newTurnLog = () => ({ user: '', ims: '', system: '', emotions: [], tools: [], userEndAt: 0, firstAudioAt: 0, cueSent: false });
  let turnLog = newTurnLog();
  const convEnd = (reason) => {
    if (!convId) return;
    try { endConversationLog(convId, reason); } catch (err) { console.error(`${tag} [Conversation] end failed:`, err.message); }
    const ended = convId;
    convId = null;
    if (sessionOwedIds.length) { try { markReported(sessionOwedIds); } catch (_) { } sessionOwedIds = []; } // he's had the chance to give them
    if (isHardware) lastConversationEnd = { at: Date.now(), reason };
    summariseConversation(ended).catch((err) => console.error(`${tag} [Memory] note failed:`, err.message)); // in the background
  };
  const convRecordTurn = () => {
    const t = turnLog;
    if (!imsBrain || (isHardware && isRecordingActive())) { turnLog = newTurnLog(); return; }
    const ims = stripToolText(t.ims).trim();
    if (!ims) return; // nothing said yet (e.g. a step that only set his face) - keep collecting this turn
    turnLog = newTurnLog();
    try {
      if (convId && Date.now() - convLastTurnAt > 10 * 60000) convEnd('stale');
      if (!convId) {
        let personaId = null;
        try { personaId = activePersonaId(); } catch (_) { }
        convId = startConversation({ personaId, device: isHardware ? 'desk' : 'web' });
      }
      if (t.system.trim()) addTurn(convId, { role: 'system', text: t.system });
      if (t.user.trim()) addTurn(convId, { role: 'user', text: t.user });
      const latencyMs = t.userEndAt && t.firstAudioAt && t.firstAudioAt >= t.userEndAt ? t.firstAudioAt - t.userEndAt : null;
      addTurn(convId, { role: 'ims', text: ims, emotion: [...new Set(t.emotions)].join(',') || null, tools: t.tools, latencyMs });
      convLastTurnAt = Date.now();
      if (convEndPending) { convEnd(convEndPending); convEndPending = null; }
    } catch (err) { console.error(`${tag} [Conversation] record failed:`, err.message); }
  };
  let judgePendingUntil = 0; // Gemini started replying before the transcript arrived: hold his voice until we can check
  let stopWindow = ''; // the last few words the user said, for the "IMS stop" command

  // "IMS stop" / "stop IMS" at any point - including while Ims is "thinking" - cancels
  // the whole conversation: nothing more is said, Gemini's work is abandoned (its
  // connection is closed) and the device goes back to plain standby. Silent.
  const cancelConversation = (reason = 'user_cancel') => {
    convRecordTurn(); // whatever he'd said of the cut-off reply
    convEnd(reason === 'tap_interrupt' ? 'tap_interrupt' : 'cancel');
    console.log(`${tag} ✋ Stop command / farewell heard - cancelling conversation, back to standby (${reason})`);
    try { logCapture(`[${new Date().toISOString()}] ${tag} STOP/FAREWELL - CONVERSATION CANCELLED (${reason})\n`); } catch (_) { }
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
    wakeDaemonService.forceStandby(reason);
    restartUpstream();
  };
  let turnCompleteAt = 0; // when currentTurnComplete last flipped true
  let audibleTurnEndAt = 0; // when a reply that was actually played last ended - the echo guard keys off this, not dropped replies
  let lastMicFrameAt = 0;   // the Box-3 streams the mic only while checking a wake phrase or listening
  let speechStartAt = 0;    // first loud mic frame after his last reply - when the user STARTED talking
  let lastLoudMicAt = 0;    // last mic frame with real speech in it - the end of what the user said

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
  // Google answers a session opened within ~1 s of the last one closing with "Internal error" (seen on every
  // such failure on 5 Oct 2026), so a new one waits until SESSION_GAP_MS after the last close. Mic audio is
  // queued meanwhile (outboundAudioQueue) and sent once the new session is ready, so nothing said is lost.
  const SESSION_GAP_MS = 1500;
  let lastGeminiCloseAt = 0;
  let deferredOpenTimer = null;
  let warmReconnectTimer = null;
  let warmReconnectAttempts = 0;

  // After Gemini errors the wait grows 2 -> 5 -> 15 -> 30 -> 60 s (it used to retry every 2-3 s, which turned
  // a Google outage into hundreds of session starts a minute and then quota errors). It resets once a
  // session has stayed up for 10 s.
  const RETRY_LADDER_MS = [2000, 5000, 15000, 30000, 60000];
  const scheduleWarmUpstreamReconnect = (delayMs = 1500) => {
    if (isClientClosed || ws.readyState !== WebSocket.OPEN) return;
    if (warmReconnectTimer) clearTimeout(warmReconnectTimer);
    const waitMs = warmReconnectAttempts > 0 ? RETRY_LADDER_MS[Math.min(warmReconnectAttempts - 1, RETRY_LADDER_MS.length - 1)] : delayMs;
    if (warmReconnectAttempts > 0) console.log(`${tag} ⏳ Gemini reconnect in ${Math.round(waitMs / 1000)} s (attempt ${warmReconnectAttempts})`);
    warmReconnectTimer = setTimeout(() => {
      warmReconnectTimer = null;
      if (isClientClosed || ws.readyState !== WebSocket.OPEN) return;
      if (!currentGeminiWs || currentGeminiWs.readyState === WebSocket.CLOSED || currentGeminiWs.readyState === WebSocket.CLOSING) {
        console.log(`${tag} 🔥 Proactively re-establishing warm upstream Gemini Live connection in background...`);
        ensureGeminiSocket();
      }
    }, waitMs);
  };

  const createGeminiSocket = () => {
    if (isClientClosed) return null;
    if (Date.now() < geminiCooldownUntil) {
      const waitMs = Math.max(200, geminiCooldownUntil - Date.now() + 100);
      scheduleWarmUpstreamReconnect(waitMs);
      if (!createGeminiSocket.lastNote || Date.now() - createGeminiSocket.lastNote > 10000) {
        createGeminiSocket.lastNote = Date.now();
        try { logCapture(`[${new Date().toISOString()}] ${tag} GEMINI COOLDOWN - not opening a session for ${Math.ceil((geminiCooldownUntil - Date.now()) / 1000)} s (retry scheduled in ${Math.round(waitMs / 1000)}s)\n`); } catch (_) { }
      }
      return null;
    }
    const gWs = new WebSocket(geminiUrl);
    geminiConnectedAt = Date.now();
    gWs.openedAt = geminiConnectedAt; // this session's own start (geminiConnectedAt moves on to the next one)
    // The gap before the next session counts from when a close STARTS: the server drops its handle straight
    // after close(), so the next mic frame used to open a new session while this one was still closing -
    // Google answered those with "Internal error" (46 of 50 on 6 Oct 2026).
    const closeNow = gWs.close.bind(gWs);
    gWs.close = (...args) => { lastGeminiCloseAt = Date.now(); return closeNow(...args); };
    geminiSetupAcknowledged = false;
    lastActivityAt = Date.now(); // a fresh session gets its full 15 s before the silence close
    sessionUsed = false;
    try { sessionPersonaId = activePersonaId(); } catch (_) { sessionPersonaId = null; }

    if (isHardware) {
      if (activeHardwareSession && activeHardwareSession.clientWs === ws) {
        activeHardwareSession.geminiWs = gWs;
      } else {
        activeHardwareSession = { clientWs: ws, geminiWs: gWs };
      }
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
        gWs.send(pinSavedVoice(cachedSetupMsg, tag, freshResumptionHandle()));
        if (freshResumptionHandle()) console.log(`${tag} 🔁 Resuming previous Gemini session (context preserved)`);
      }
      // Flush queued messages
      while (outboundQueue.length > 0) {
        const msg = outboundQueue.shift();
        console.log(`${tag} Flushing queued message to Gemini...`);
        gWs.send(typeof msg === 'string' && msg.includes('"setup"') ? pinSavedVoice(msg, tag, freshResumptionHandle()) : msg);
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
          if (upd?.newHandle && upd.resumable !== false) { resumptionHandle = upd.newHandle; resumptionHandleAt = Date.now(); }
        } catch (_) { }
      }
      let parsedAudioBytes = null;
      let parsed = null;
      try {
        parsed = JSON.parse(msgStr);

        // Live sessions report token use per turn (audio both ways) - logged for the Costs page
        if (parsed.usageMetadata) recordUsage(liveModel || getModelFor(isHardware || imsWeb ? 'imsVoice' : 'browserVoice'), parsed.usageMetadata, isHardware || imsWeb ? 'imsVoice' : 'browserVoice');

        if (isHardware && isRecordingActive()) {
          recordingMessage(parsed, gWs);
          return;
        }

        if (isHardware) {
          if (parsed.serverContent?.inputTranscription?.text) {
            clearPendingSpeech();
            userTranscriptSeen = true; unsolicitedTurn = false;
            if (!heardStartAt) heardStartAt = speechStartAt && Date.now() - speechStartAt < 60000 ? speechStartAt : Date.now();
            const incomingTranscript = parsed.serverContent.inputTranscription.text;
            heardThisTurn = (heardThisTurn + incomingTranscript).slice(-400);
            if (currentTurnComplete && looksAddressed(heardThisTurn) && !isRecordingActive()) {
              isConversationActive = true;
              wakeDaemonService.acceptWake(heardThisTurn.trim().slice(0, 40), 'transcript_addressed');
              // restarted on every new piece of transcript, so a longer request isn't cut short
              if (wakeKickTimer) clearTimeout(wakeKickTimer);
              const heardAt = Date.now();
              const kick = (step) => {
                wakeKickTimer = null;
                if (lastModelOutputAt >= heardAt || gWs.readyState !== WebSocket.OPEN || isRecordingActive()) return;
                if (step === 1 && Date.now() - lastLoudMicAt < 500) { wakeKickTimer = setTimeout(() => kick(1), 300); return; } // still talking
                if (step === 1) {
                  gWs.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
                  try { logCapture(`[${new Date().toISOString()}] ${tag} WAKE KICK 1: ended the audio turn (heard "${heardThisTurn.trim().slice(0, 60)}", no reply yet)\n`); } catch (_) { }
                  wakeKickTimer = setTimeout(() => kick(2), 500);
                } else {
                  textTurnSent = true; sessionUsed = true; lastActivityAt = Date.now();
                  gWs.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: `(System: Simon just said "${heardThisTurn.trim().slice(0, 200)}" to you - that is your wake phrase, misheard by speech recognition. Answer him now: if he only said the wake phrase, greet him; otherwise answer what he said.)` }] }], turnComplete: true } }));
                  try { logCapture(`[${new Date().toISOString()}] ${tag} WAKE KICK 2: asked him to answer in text\n`); } catch (_) { }
                }
              };
              wakeKickTimer = setTimeout(() => kick(1), 400);
            }

            // Wake Daemon user speech assessment
            const speechEval = wakeDaemonService.processUserSpeech(incomingTranscript, 'hardware');
            if (speechEval.action === 'wake_accepted') {
              isConversationActive = true;
            } else if (speechEval.action === 'wake_rejected') {
              unsolicitedTurn = true;
              paceFlush();
              heardThisTurn = '';
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ noWakeDetected: true }));
              return;
            }

            if (judgePendingUntil) {
              judgePendingUntil = 0;
              if (!isConversationActive && !looksAddressed(heardThisTurn)) {
                unsolicitedTurn = true;
                console.warn(`${tag} 🔇 Not addressed to Ims (late transcript) - dropping the held reply. Heard: "${heardThisTurn.slice(0, 80)}"`);
                try { logCapture(`[${new Date().toISOString()}] ${tag} REPLY DROPPED - NOT ADDRESSED (late): "${heardThisTurn.slice(0, 120)}"\n`); } catch (_) { }
                try { noteWakeCandidate(heardThisTurn); } catch (_) { /* never let this break the turn */ }
                paceFlush();
                heardThisTurn = '';
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ noWakeDetected: true }));
              } else {
                pacePump();
              }
            }
          }
          const startsModelOutput = parsed.serverContent?.modelTurn || parsed.serverContent?.outputTranscription || parsed.toolCall;
          const answersTool = Boolean(startsModelOutput && currentTurnComplete && toolAnswerOwedAt && Date.now() - toolAnswerOwedAt < 90000);
          if (answersTool) { toolAnswerOwedAt = 0; unsolicitedTurn = false; }
          if (startsModelOutput) { lastModelOutputAt = Date.now(); if (wakeKickTimer) { clearTimeout(wakeKickTimer); wakeKickTimer = null; } }
          if (startsModelOutput && currentTurnComplete && !unsolicitedTurn && !turnHasTrigger() && !answersTool) {
            // Allow a continuation turn within 120 s of a getDayReport tool response:
            // Gemini sometimes fires turnComplete after the first batch of audio
            // (e.g. after device-changes) then starts a new turn to continue the
            // remaining sections (training, goals, tours, news, tasks). That looks
            // unsolicited but is the expected behaviour with a long report.
            const dayReportGrace = dayReportSentAt && (Date.now() - dayReportSentAt) < 120000;
            if (dayReportGrace) {
              console.log(`${tag} 📰 Allowing day-report continuation turn (${Math.round((Date.now() - dayReportSentAt) / 1000)}s since report sent)`);
              try { logCapture(`[${new Date().toISOString()}] ${tag} DAY REPORT CONTINUATION ALLOWED\n`); } catch (_) { }
            } else {
              // Nothing new from the user since his last reply - Gemini repeating itself. Drop it.
              unsolicitedTurn = true;
              console.warn(`${tag} 🔇 Dropping an unsolicited model turn (nothing from the user since the last one ended)`);
              try { logCapture(`[${new Date().toISOString()}] ${tag} UNSOLICITED MODEL TURN DROPPED\n`); } catch (_) { }
              paceFlush();
            }
          }
          if (startsModelOutput && currentTurnComplete && !unsolicitedTurn) {
            const followUp = heardStartAt ? heardStartAt <= followUpUntil : ((energeticMicFrames >= 8 || answeredAloud()) && Date.now() <= followUpUntil);
            // an open conversation is a to and fro: anything said in it is for Ims - no timing test. It only ends
            // when he's told goodbye or nobody speaks for the silence timeout (device idle / SILENCE_CLOSE_MS).
            const addressed = isConversationActive || answersTool || textTurnSent || touchToTalkActive || looksAddressed(heardThisTurn) || followUp;
            if (!addressed && !heardThisTurn.trim()) {
              // No transcript yet - hold his voice for up to 1.5 s until it arrives (see above).
              judgePendingUntil = Date.now() + 1500;
            } else if (!addressed) {
              unsolicitedTurn = true;
              console.warn(`${tag} 🔇 Not addressed to Ims (no wake phrase, not a follow-up) - dropping the reply. Heard: "${heardThisTurn.slice(0, 80)}"`);
              try { logCapture(`[${new Date().toISOString()}] ${tag} REPLY DROPPED - NOT ADDRESSED: "${heardThisTurn.slice(0, 120)}"\n`); } catch (_) { }
              try { noteWakeCandidate(heardThisTurn); } catch (_) { /* never let this break the turn */ }
              paceFlush();
              heardThisTurn = '';
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ noWakeDetected: true }));
            }
          }
          const realAction = (parsed.toolCall?.functionCalls || []).find((c) => !['setEmotion', 'noWakeDetected', 'noteWake', 'endConversation'].includes(c.name));
          if (unsolicitedTurn && realAction && (isConversationActive || Date.now() <= followUpUntil + 5000) && !isRecordingActive()) {
            // Gemini only sets alarms, looks things up etc. when asked - this was a reply after all. Dropping it
            // used to answer the call "acknowledged" without running it (6 Oct: an alarm he said he'd set, never set).
            unsolicitedTurn = false;
            console.log(`${tag} ✅ Reply un-dropped - it carries ${realAction.name}`);
            try { logCapture(`[${new Date().toISOString()}] ${tag} REPLY UN-DROPPED - carries ${realAction.name}
`); } catch (_) { }
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
              turnLog = newTurnLog(); // what was heard wasn't for Ims
            }
            return;
          }
        }

        // Check for incoming audio parts
        if (parsed.serverContent?.modelTurn?.parts) {
          wakeDaemonService.notifyModelSpeechStart();
          if (imsBrain && !(isHardware && isRecordingActive())) isConversationActive = true; // he's answering: the conversation is open
          for (const part of parsed.serverContent.modelTurn.parts) {
            if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
              lastModelAudioTime = Date.now();
              turnHadAudio = true;
              if (!turnLog.firstAudioAt) {
                turnLog.firstAudioAt = Date.now();
                if (lastLoudMicAt && lastLoudMicAt < turnLog.firstAudioAt && turnLog.firstAudioAt - lastLoudMicAt < 20000 && !turnLog.system) turnLog.userEndAt = lastLoudMicAt;
              }
              clearPendingSpeech(); clarifyNudged = false;
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
          // the model now and then writes a tool call into its transcript ("setEmotion(emotion='happy')") -
          // it isn't spoken, so keep it out of the record (cleaned over the whole turn, as it can arrive in pieces)
          spokenTranscript = stripToolText(spokenTranscript + spokenText);
          if (isHardware && morningOfferPending) { morningOfferPending = false; markMorningReportOffered(); }
          turnReplyText = stripToolText(turnReplyText + spokenText);
          turnLog.ims += spokenText;
          { const n = spokenText.split(/\s+/).filter(Boolean).length; wordsSpoken += n; if (toolAnswerOwedAt) toolAnswerWords += n; }
          if (dayReportSentAt && Date.now() - dayReportSentAt < 180000) dayReportWords += spokenText.split(/\s+/).filter(Boolean).length;
          // I4: the face follows a turn in a long reply - timed to when those words are actually heard
          // (no face set yet: from the first ~8 words; already set: on a later turn in a reply past 12 words)
          const wordsSoFar = turnLog.ims.split(/\s+/).filter(Boolean).length;
          const noFaceYet = !turnLog.emotions.length && !turnLog.autoFaceChecked && wordsSoFar >= 8;
          if (imsBrain && !(isHardware && isRecordingActive()) && (noFaceYet || (!turnLog.cueSent && turnLog.emotions.length && wordsSoFar > 12))) {
            if (noFaceYet) turnLog.autoFaceChecked = true;
            const emo = faceFromWords(noFaceYet ? turnLog.ims : turnLog.ims.slice(-160), turnLog.emotions);
            const cue = emo && [emo];
            if (cue) {
              if (!noFaceYet) turnLog.cueSent = true;
              turnLog.emotions.push(cue[0]);
              console.log(`${tag} 🎭 face from his words: ${cue[0]}${noFaceYet ? ' (he set none)' : ''}`);
              const queuedMs = paceQueue.reduce((n, it) => n + (it.bin ? it.bin.length / PCM_BYTES_PER_MS : 0), 0);
              const playsAt = isHardware ? (paceSentMs ? paceStart + paceSentMs : Date.now()) + queuedMs : Math.max(Date.now(), webAudioEndAt);
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN && !(isHardware && isRecordingActive())) ws.send(JSON.stringify(getDevicePayload(cue[0])));
              }, Math.max(0, Math.min(20000, playsAt - Date.now())));
            }
          }
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
          if (/[a-z0-9]/i.test(heardText)) { lastUserInputAt = Date.now(); sessionUsed = true; }
          if (/[a-z0-9]/i.test(heardText) && (!isHardware || looksAddressed(heardThisTurn) || Date.now() <= followUpUntil || touchToTalkActive)) { lastActivityAt = Date.now(); sessionUsed = true; }
          userSpokenTranscript += heardText;
          turnLog.user += heardText;
          if (isHardware && imsBrain && !isRecordingActive() && (!visionAsk || Date.now() - visionAsk.at > 20000) && looksLikeVisionAsk(turnLog.user)) {
            const question = turnLog.user.trim();
            visionAsk = { at: Date.now(), toolCalled: false, question, result: null };
            const frame = getFrame();
            visionAsk.result = frame && Date.now() - frame.at < 120000
              ? askLive(`${question} (describe what is in front of the desk camera)`, { withEmbeddings: true }).catch(() => null)
              : Promise.resolve(null);
            console.log(`${tag} 📷 Heard a look/see request - looking through the camera: "${question.slice(0, 80)}"`);
          }
          try {
            logCapture(
              `[${new Date().toISOString()}] ${tag} USER SPOKEN TEXT: ${heardText}\n`);
          } catch (_) { }

        }

        if (parsed.serverContent?.interrupted && isHardware) {
          const msSinceOwnAudio = lastModelAudioTime > 0 ? (Date.now() - lastModelAudioTime) : -1;
          const dayReportGrace = dayReportSentAt && (Date.now() - dayReportSentAt) < 120000;
          // Only flush audio queue if this was a genuine user barge-in (user transcript seen and model was not actively generating chunks within 500ms),
          // and never flush during a day report unless explicit stop phrase was verified.
          if (!dayReportGrace && (msSinceOwnAudio > 600 || userTranscriptSeen)) {
            paceFlush();
          }
        }
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
          const playEnd = isHardware ? (paceSentMs ? paceStart + paceSentMs : Date.now()) : Math.max(Date.now(), webAudioEndAt);
          wakeDaemonService.notifyModelSpeechEnd(playEnd);
          if (!parsed.toolCall) {
            currentTurnComplete = true; // Gemini confirmed the turn ended cleanly
            turnCompleteAt = Date.now();
            if (turnHadAudio) {
              audibleTurnEndAt = Date.now();
              if (toolAnswerOwedAt && toolAnswerWords >= 10) toolAnswerOwedAt = 0; // he gave the answer in this same turn
              resetTurnTriggers(); turnHadAudio = false;
              const said = stripToolText(turnLog.ims).trim();
              followUpMs = (/\?["')\s]*$/.test(said) || said.split(/\s+/).length > 60) ? 25000 : FOLLOW_UP_MS;
              followUpUntil = playEnd + followUpMs;
              wakeDaemonService.setSilenceTimeout(followUpMs + 5000);
              if (isHardware) paceSend({ json: JSON.stringify({ followUpMs }) }); // the Box-3 keeps listening that long too
              // a look / see request he answered without looking: give him what the camera shows, once
              const va = visionAsk;
              if (va && !va.toolCalled && !turnLog.tools.some((t) => t.name === 'lookAtCamera') && Date.now() - va.at < 30000) {
                visionAsk = { ...va, toolCalled: true };
                va.result.then((snap) => {
                  if (!snap || !isConversationActive || gWs.readyState !== WebSocket.OPEN || (isHardware && isRecordingActive())) return;
                  const answer = snap.qa?.[snap.qa.length - 1]?.answer;
                  if (!answer) return;
                  const recognised = (snap.faces || []).filter((f) => f.match).map((f) => f.match.name);
                  textTurnSent = true; sessionUsed = true; lastActivityAt = Date.now();
                  gWs.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: `(System: you have now looked through the desk camera for "${va.question.slice(0, 160)}". It shows: ${answer}${recognised.length ? ` Recognised: ${recognised.join(', ')}.` : ''} Tell him what you can see, briefly and in your own words, answering what he asked - if you just said you couldn't see, simply say you've had a proper look now. Only use names given here.)` }] }], turnComplete: true } }));
                  console.log(`${tag} 📷 He answered a look request without looking - gave him the camera's answer`);
                  try { logCapture(`[${new Date().toISOString()}] ${tag} VISION FALLBACK DELIVERED (snapshot ${snap.id})\n`); } catch (_) { }
                });
              }
              // a day report that stopped well short of all its sections: tell him once to finish it
              const reportFloor = Math.max(120, dayReportSections * 20);
              if (imsBrain && dayReportSentAt && Date.now() - dayReportSentAt < 180000 && !dayReportNudged && dayReportWords < reportFloor
                && isConversationActive && gWs.readyState === WebSocket.OPEN && !(isHardware && isRecordingActive())) {
                dayReportNudged = true;
                textTurnSent = true; sessionUsed = true; lastActivityAt = Date.now();
                gWs.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: `(System: you stopped partway through the day report - only ${dayReportWords} words of its ${dayReportSections} sections. Carry straight on now with every section you have not spoken yet, in the report's order, including any you skipped such as the weather - no greeting, no recap of what you already said, full detail as the report's instructions ask - then sign off.)` }] }], turnComplete: true } }));
                console.log(`${tag} 📰 Day report stopped short (${dayReportWords} words) - asked him to carry on`);
                try { logCapture(`[${new Date().toISOString()}] ${tag} DAY REPORT CONTINUE NUDGE (${dayReportWords} words of ${dayReportSections} sections)
`); } catch (_) { }
              }
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
          if (!parsed.toolCall) convRecordTurn();
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
          sessionUsed = true;
          const toolStartedAt = Date.now();
          const wordMark = wordsSpoken; // words he'd said when he made these calls
          const lookups = parsed.toolCall.functionCalls.filter((c) => !['setEmotion', 'endConversation', 'noWakeDetected', 'startRecording', 'noteWake'].includes(c.name));
          if (isHardware && lookups.length && !turnLog.firstAudioAt && !turnLog.holdingPlayed) {
            const tl = turnLog;
            setTimeout(() => {
              if (isClientClosed || tl !== turnLog || tl.firstAudioAt || tl.holdingPlayed || isRecordingActive() || isDeviceMicMuted()) return;
              let personaNow = null;
              try { personaNow = activePersonaId(); } catch (_) { }
              const clip = personaNow && pickClip(personaNow);
              if (!clip) return;
              tl.holdingPlayed = clip.line; tl.firstAudioAt = Date.now();
              tl.ims = `${clip.line} ${tl.ims}`;
              tl.tools.push({ name: 'holdingLine', ms: Date.now() - toolStartedAt, ok: true });
              for (let o = 0; o < clip.pcm.length; o += 4800) paceSend({ bin: clip.pcm.subarray(o, o + 4800) });
              try { logCapture(`[${new Date().toISOString()}] ${tag} HOLDING LINE "${clip.line}" (${lookups.map((c) => c.name).join(', ')} still running)\n`); } catch (_) { }
            }, 2500);
          }
          // Shared by every new reminders/lists branch below, all of which
          // are synchronous - reduces 7 near-identical toolResponse blocks to
          // one call each, so a copy-paste slip can't silently mismatch a
          // call.id or skip the OPEN check.
          const respondToToolCall = (call, output) => {
            // an answer is only owed if he hasn't already given one while the tool ran (a slow save like
            // rememberFact finishing after "Aye, I'll remember that" let the same line through twice)
            if (!['setEmotion', 'endConversation', 'noWakeDetected', 'noteWake'].includes(call.name) && wordsSpoken - wordMark < 10) { toolAnswerOwedAt = Date.now(); toolAnswerWords = 0; }
            if (call.name !== 'setEmotion') turnLog.tools.push({ name: call.name, ms: Date.now() - toolStartedAt, ok: !(output && output.error),
              ...(/^(getWeather|getBloodGlucose|listScheduledItems|getCalendarEvents|getDayReport|getUpcomingBirthdays|getTrainingSummary|getScheduleHistory|getNewMusicReleases)$/.test(call.name) ? { out: JSON.stringify(output).slice(0, 2500) } : {}) });
            // Anything that fails is logged to the dev ideas queue as a prompt for Claude Code.
            if (output && output.error) {
              try {
                const f = flagToolFailure({ tool: call.name, error: output.error, args: call.args, heard: heardThisTurn, where: isHardware ? 'desk terminal' : 'web app' });
                console.log(`${tag} 💡 ${call.name} failure ${f.duplicate ? 'already flagged' : 'flagged'} as dev idea #${f.id}`);
                output = { ...output, flaggedForFixing: `Logged as dev idea #${f.id} for Claude Code. Tell them briefly it didn't work and you've flagged it to be fixed.` };
              } catch (_) { /* never let flagging break the reply */ }
            }
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
            } else if (call.name === 'noWakeDetected' && isHardware && heardStartAt && followUpUntil && heardStartAt <= followUpUntil) {
              // A follow-up within the conversation needs no wake phrase - Gemini sometimes forgets.
              console.log(`${tag} 🔔 noWakeDetected overridden - follow-up within the conversation: "${heardThisTurn.slice(0, 60)}"`);
              try { logCapture(`[${new Date().toISOString()}] ${tag} NOWAKE OVERRIDDEN (follow-up): "${heardThisTurn.slice(0, 80)}"
`); } catch (_) { }
              if (gWs.readyState === WebSocket.OPEN) {
                gWs.send(JSON.stringify({ toolResponse: { functionResponses: [{ response: { output: withVoiceReminder({ status: 'overruled', note: 'This was a follow-up in an ongoing conversation - no wake phrase is needed. Answer it now; if you are not sure what they said, ask them to say it again.' }) }, id: call.id }] } }));
                textTurnSent = true;
              }
            } else if (call.name === 'noWakeDetected' && isHardware && heardLikeWake(heardThisTurn)) {
              // Gemini said "no wake phrase", but what it heard is one of the ways the wake phrase
              // actually comes through (recorded on /ims/phrases). Answer instead.
              console.log(`${tag} 🔔 noWakeDetected overridden - "${heardThisTurn.slice(0, 60)}" matches a known wake-phrase spelling`);
              try { logCapture(`[${new Date().toISOString()}] ${tag} NOWAKE OVERRIDDEN: "${heardThisTurn.slice(0, 80)}"\n`); } catch (_) { }
              if (gWs.readyState === WebSocket.OPEN) {
                gWs.send(JSON.stringify({ toolResponse: { functionResponses: [{ response: { output: withVoiceReminder({ status: 'overruled', note: 'That WAS the wake phrase - speech-to-text just mangled it. Reply to the user now.' }) }, id: call.id }] } }));
                gWs.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: `(System: the user just said the wake phrase - it was transcribed as "${heardThisTurn.trim()}". Greet them briefly, or answer if they asked something - ${inYourVoice()}.)` }] }], turnComplete: true } }));
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
              if (call.name === 'endConversation') convEndPending = 'farewell'; // ends once the farewell turn is recorded
              if (call.name === 'endConversation' && imsBrain) {
                // the conversation's note is written when it ends (convEnd -> summariseConversation)
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
              turnLog.emotions.push(emotion);
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
              const p = call.args?.period;
              const days = p === 'week' ? 7 : p === 'year' ? 365 : (p === 'all' || p === 'all_time') ? 'all_time' : 28;
              try {
                const st = getStravaStatus();
                if (!st.connected || !st.activityCount) respondToToolCall(call, { error: 'Strava is not connected or has no activities yet. Say so plainly.' });
                else {
                  console.log(`${tag} 🏃 getTrainingSummary(period=${p || 'month'}, query="${call.args?.query || ''}")`);
                  respondToToolCall(call, describeTraining(days));
                }
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
                  embedMemory('memory', saved.id, saved.fact).catch(() => {});
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
                recallMemories(query).then((results) => {
                  console.log(`${tag} 🔍 recallMemory("${query}") -> found ${results.length} (facts and conversation notes)`);
                  respondToToolCall(call, { query, memories: results.map((m) => (m.kind === 'note' ? `(from a past conversation) ${m.text}` : m.text)) });
                }).catch((err) => respondToToolCall(call, { error: err.message }));
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
              if (visionAsk) visionAsk.toolCalled = true;
              wakeCamera();
              const frame = getFrame();
              const q = String(call.args?.question || 'What can you see?');
              if (!frame || Date.now() - frame.at > 120000) {
                console.log(`${tag} 📷 lookAtCamera: no fresh camera frame`);
                respondToToolCall(call, { error: 'The camera is not delivering pictures right now.' });
              } else {
                askLive(q, { withEmbeddings: true }).then((snap) => {
                  const last = snap.qa[snap.qa.length - 1];
                  const recognised = snap.faces.filter((f) => f.match).map((f) => f.match.name);
                  const unknown = snap.faces.filter((f) => !f.match);
                  if (unknown.length > 0) {
                    lastUnenrolledFace = unknown[0];
                  }
                  console.log(`${tag} 📷 lookAtCamera answered (snapshot ${snap.id}): ${recognised.length} recognised, ${unknown.length} unknown`);
                  respondToToolCall(call, {
                    answer: last?.answer,
                    recognisedPeople: recognised,
                    unknownFacesCount: unknown.length,
                    guidance: unknown.length > 0
                      ? 'An unfamiliar person is in view. Describe them warmly and ask their name, then call enrolPerson to add them to Faces.'
                      : null
                  });
                }).catch((err) => {
                  console.error(`${tag} lookAtCamera error:`, err.message);
                  respondToToolCall(call, { error: err.message });
                });
              }
            } else if (call.name === 'enrolPerson') {
              const name = String(call.args?.name || '').trim();
              const notes = call.args?.notes ? String(call.args.notes).trim() : null;
              if (!name) {
                respondToToolCall(call, { error: 'A name is required to enrol a person.' });
              } else if (!lastUnenrolledFace || !lastUnenrolledFace.embedding) {
                respondToToolCall(call, { error: 'No recent unknown face sample is available to enrol. Call lookAtCamera first.' });
              } else {
                try {
                  const res = enrolFace({
                    name,
                    notes,
                    embedding: lastUnenrolledFace.embedding,
                    thumbBase64: lastUnenrolledFace.thumb
                  });
                  console.log(`${tag} 👤 Enrolled new person "${name}" into Faces (ID ${res.personId})`);
                  lastUnenrolledFace = null;
                  respondToToolCall(call, { success: true, name, personId: res.personId, message: `Successfully enrolled ${name} into Faces.` });
                } catch (err) {
                  console.error(`${tag} enrolPerson error:`, err.message);
                  respondToToolCall(call, { error: err.message });
                }
              }
            } else if (call.name === 'getScheduleHistory') {
              const kind = ['alarm', 'timer', 'reminder'].includes(call.args?.type) ? call.args.type : null;
              const period = ['today', 'yesterday', 'week', 'month'].includes(call.args?.period) ? call.args.period : 'yesterday';
              const summary = getHistorySummary({ type: kind, period });
              console.log(`${tag} 🕘 getScheduleHistory(${kind || 'all'}, ${period}) -> ${summary.events.length} events`);
              respondToToolCall(call, summary);
            } else if (call.name === 'getUpcomingBirthdays') {
              const who = String(call.args?.name || '').trim().toLowerCase();
              const days = Math.max(0, Math.min(366, Number(call.args?.withinDays ?? (who ? 366 : 31))));
              const list = listBirthdays().filter((b) => b.daysUntil <= days)
                .filter((b) => !who || `${b.name} ${b.relationship || ''}`.toLowerCase().includes(who))
                .map((b) => ({ name: b.name, relationship: b.relationship, daysUntil: b.daysUntil, isToday: b.isToday, date: `${b.day}/${b.month}`, turningAge: b.turningAge }));
              console.log(`${tag} 🎂 getUpcomingBirthdays(${days}d${who ? `, ${who}` : ''}) -> ${list.length}`);
              // always say which birthday is next, however far off - "none in the window" isn't "none"
              const next = listBirthdays()[0];
              respondToToolCall(call, { withinDays: days, count: list.length, birthdays: list, nextBirthday: next ? { name: next.name, relationship: next.relationship, daysUntil: next.daysUntil, turningAge: next.turningAge } : null });
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
              const question = call.args?.question ? String(call.args.question).trim() : '';
              if (question) {
                console.log(`${tag} 🩸 getBloodGlucose question requested: "${question}"`);
                askProfileInsightQuestion(question).then((insight) => {
                  console.log(`${tag} 🩸 getBloodGlucose deep insight answered: snapshot reading=${insight.telemetrySnapshot?.currentReading?.mmol} mmol/L`);
                  respondToToolCall(call, {
                    question: insight.question,
                    insight: stripMedicalDisclaimers(insight.answer),
                    telemetrySnapshot: insight.telemetrySnapshot,
                    dosing: dosingContext(), instruction: 'Summarise the clinical telemetry insight ' + inYourVoice() + ', directly answering the user. If he asked how much insulin to take, take the amount from dosing.wizard (the server bolus-wizard sums - use them over any number in insight, and never add insulin when correctionAfterInsulinOnBoard is zero or negative) and give it with the working - he makes the final call; otherwise give observations and ideas straight to consider. CRITICAL NON-NEGOTIABLE: NEVER say "this is not medical advice", NEVER say "please seek advice from a medical professional or team", and NEVER tell or suggest to the user to consult or speak to their diabetes team, doctor, or healthcare professionals (the user manages their care independently and forbids disclaimers).'
                  });
                }).catch((err) => {
                  console.error(`${tag} getBloodGlucose insight error:`, err.message);
                  try {
                    const fallback = describeGlucoseForIms(call.args?.period || 'today');
                    respondToToolCall(call, { ...fallback, insightError: err.message });
                  } catch (e) {
                    respondToToolCall(call, { error: err.message, fallback: 'Blood glucose telemetry analysis currently unavailable.' });
                  }
                });
              } else {
                try {
                  const g = { ...describeGlucoseForIms(call.args?.period || 'today'), dosing: dosingContext() };
                  console.log(`${tag} 🩸 getBloodGlucose(${call.args?.period || 'today'}) -> ${JSON.stringify(g.now).slice(0, 120)}`);
                  respondToToolCall(call, g);
                } catch (err) {
                  console.error(`${tag} getBloodGlucose error:`, err.message);
                  respondToToolCall(call, { error: err.message, fallback: 'Blood glucose data currently unavailable.' });
                }
              }
            } else if (call.name === 'getDayReport') {
              getDayReport().then((r) => {
                console.log(`${tag} 📰 getDayReport -> ${r.sectionCount} sections, ${r.report.length} chars`);
                dayReportSentAt = Date.now();
                dayReportWords = 0; dayReportSections = r.sectionCount || 0; dayReportNudged = false;
                respondToToolCall(call, { instructions: r.instructions, sectionCount: r.sectionCount, report: r.report });
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
            } else if (call.name === 'askGemini') {
              import('./services/imsFallbackService.js').then((m) => m.askGeneral({ question: call.args?.question, context: call.args?.context || '' })).then((answer) => {
                console.log(`${tag} 💡 askGemini(${String(call.args?.question || '').slice(0, 60)})`);
                respondToToolCall(call, { answer, say: 'Retell this briefly ' + inYourVoice() + ', adding anything you already know that fits. Do not read it word for word or mention Gemini unless asked.' });
              }).catch((err) => respondToToolCall(call, { error: err.message, say: 'Answer as best you can yourself, briefly, in your own voice.' }));
            } else if (call.name === 'addRunNote') {
              import('./services/runLearningService.js').then((m) => m.noteOnLatestRun({ text: call.args?.text, minute: call.args?.minute ?? null })).then((r) => {
                console.log(`${tag} 🏃 addRunNote on ${r.run}`);
                respondToToolCall(call, { status: 'noted', run: r.run, note: 'It will be lined up with their glucose in the run retrospective (Run Planner, Flythrough).' });
              }).catch((err) => respondToToolCall(call, { error: err.message }));
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
              const thinkIt = call.args?.kind === 'think';
              createTask({ request: call.args?.task, origin: isHardware ? 'desk' : 'web', kind: thinkIt ? 'think' : 'research' }).then((t) => {
                if (thinkIt) {
                  console.log(`${tag} 🤔 proper think #${t.id}: ${t.title}`);
                  return respondToToolCall(call, { status: 'thinking', id: t.id, note: "Tell him in a few words you'll have a proper think and come back to him. If it's ready while you're still talking you'll be told; otherwise you'll bring it up next time he talks to you. Don't guess the answer now." });
                }
                console.log(`${tag} 🧵 startBackgroundTask #${t.id}: ${t.title}`);
                respondToToolCall(call, { status: 'started', id: t.id, title: t.title, note: 'Tell them briefly you are on it and they can ask how it went later (or it will be in their next day report). Do not guess the answer now.' });
              }).catch((err) => respondToToolCall(call, { error: err.message }));
            } else if (call.name === 'saveDevIdea') {
              try {
                const idea = addDevIdea({ text: call.args?.idea, source: isHardware ? 'desk' : 'web' });
                console.log(`${tag} 💡 saveDevIdea #${idea.id}: ${idea.text.slice(0, 60)}`);
                respondToToolCall(call, { status: 'saved', id: idea.id, note: 'Confirm in a few words that it is saved for Claude Code. Do not start discussing how to build it.' });
              } catch (err) { respondToToolCall(call, { error: err.message }); }
            } else if (call.name === 'getBoardGames') {
              try {
                const out = describeCollectionForIms({ query: call.args?.query, players: Number(call.args?.players) || null, maxMinutes: Number(call.args?.maxMinutes) || null, sortBy: call.args?.sortBy || null, favourites: call.args?.favourites === true, solo: call.args?.solo === true, theme: call.args?.theme || '' });
                console.log(`${tag} 🎲 getBoardGames -> ${out.baseGames} games, ${out.expansions} expansions${out.matching !== undefined ? `, ${out.matching} matching` : ''}`);
                respondToToolCall(call, { ...out, note: out.matching !== undefined ? 'Say how many match and name a few; offer more if there are lots.' : 'Give the counts.' });
              } catch (err) { respondToToolCall(call, { error: err.message }); }
            } else if (call.name === 'getDoorbellStatus') {
              try {
                const status = doorbellService.getStatus();
                const limit = Math.min(20, Math.max(1, Number(call.args?.limit) || 5));
                const events = doorbellService.getEvents(limit);
                console.log(`${tag} 🔔 getDoorbellStatus -> status=${status.status}, cameras=${status.cameraCount}, events=${events.length}`);
                respondToToolCall(call, {
                  ...status,
                  recentEvents: events.map((e) => ({
                    type: e.event_type,
                    camera: e.camera_name,
                    time: new Date(e.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
                    battery: e.battery_level
                  })),
                  instruction: 'Summarise the doorbell and visitor status ' + inYourVoice() + '.'
                });
              } catch (err) { respondToToolCall(call, { error: err.message }); }
            } else if (call.name === 'getCampaigns') {
              try {
                const campaigns = campaignsForIms({ name: call.args?.name, chronicle: Boolean(call.args?.chronicle) });
                console.log(`${tag} 🗺️ getCampaigns(${call.args?.name || 'all'}) -> ${campaigns.length}`);
                respondToToolCall(call, { campaigns, note: campaigns.length ? 'Answer what they asked in a sentence or two, like a fellow player. Chronicle text is written in the voice of Middle-earth - if reading it, read it as written.' : 'No campaign matches that - say which ones there are.' });
              } catch (err) { respondToToolCall(call, { error: err.message }); }
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
            geminiSetupAcknowledged = true;
            paceFlush();
            ws.send(JSON.stringify({ setupComplete: {} }));
            if (isHardware && !resumptionHandle && lastConversationEnd.at && Date.now() - lastConversationEnd.at < 10 * 60000
              && ['silence', 'disconnect', 'device_closed', 'stale'].includes(lastConversationEnd.reason) && !isRecordingActive()) {
              try {
                const turns = recentTurns({ withinMinutes: 15, limit: 6 }).filter((t) => t.role !== 'system')
                  .map((t) => ({ role: t.role === 'ims' ? 'model' : 'user', parts: [{ text: t.text }] }));
                if (turns.length && gWs && gWs.readyState === WebSocket.OPEN) {
                  gWs.send(JSON.stringify({ clientContent: { turns, turnComplete: false } }));
                  try { logCapture(`[${new Date().toISOString()}] ${tag} CONTEXT RESTORED - ${turns.length} recent turns from the last conversation (${lastConversationEnd.reason})\n`); } catch (_) { }
                }
              } catch (err) { console.error(`${tag} [Conversation] restore failed:`, err.message); }
              lastConversationEnd = { at: 0, reason: null }; // once
            }
            while (outboundAudioQueue.length > 0) {
              const audioPayload = outboundAudioQueue.shift();
              if (gWs && gWs.readyState === WebSocket.OPEN) {
                gWs.send(audioPayload);
              }
            }
          }
          if (parsed?.serverContent?.turnComplete && !parsed.toolCall) {
            paceSend({ json: JSON.stringify({ turnComplete: true }) });
          }
        } else {
          if (parsed?.setupComplete) {
            geminiSetupAcknowledged = true;
            while (outboundAudioQueue.length > 0) {
              const audioPayload = outboundAudioQueue.shift();
              if (gWs && gWs.readyState === WebSocket.OPEN) {
                gWs.send(audioPayload);
              }
            }
          }
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
      lastGeminiCloseAt = Date.now();
      const connectionAliveMs = gWs.openedAt > 0 ? (Date.now() - gWs.openedAt) : -1;
      const msSinceOwnAudioAtClose = lastModelAudioTime > 0 ? (Date.now() - lastModelAudioTime) : -1;
      console.log(`${tag} Gemini Live closed connection: ${code} - ${reasonStr} (alive ${connectionAliveMs}ms, ${msSinceOwnAudioAtClose}ms since last audio chunk)`);
      if (connectionAliveMs > 10000) warmReconnectAttempts = 0; // that session was healthy
      if (code !== 1000 && code !== 1005) {
        warmReconnectAttempts++;
        if (/quota|rate/i.test(reasonStr)) warmReconnectAttempts = Math.max(warmReconnectAttempts, 4); // 30 s, then 60 s
        // quota / rate limits get the long ladder; Google's transient "Internal error" only a short pause (at most 5 s),
        // so a flaky spell doesn't leave Ims deaf for a minute - the pause alone stops the per-frame reconnect storm
        const quota = /quota|rate/i.test(reasonStr);
        // a session that failed may have left a bad resume token - presenting it again got 'Internal error' every time
        if (!quota && resumptionHandle) { resumptionHandle = null; try { logCapture(`[${new Date().toISOString()}] ${tag} RESUME TOKEN DROPPED after ${code}
`); } catch (_) { } }
        const wait = quota ? RETRY_LADDER_MS[Math.min(warmReconnectAttempts - 1, RETRY_LADDER_MS.length - 1)] : Math.min(5000, RETRY_LADDER_MS[Math.min(warmReconnectAttempts - 1, 1)]);
        geminiCooldownUntil = Math.max(geminiCooldownUntil, Date.now() + wait);
      }
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
                paceSend({ json: JSON.stringify({ turnComplete: true }) }); // after any audio still queued for the device
                console.log(`${tag} ✅ Queued synthetic turnComplete for the hardware client (after remaining audio).`);
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
        if (ws.isHardwareClient) scheduleWarmUpstreamReconnect(1500);
        return;
      }

      // If upstream closes with 1011 (or other transient codes), for hardware clients keep the
      // raw TCP socket connected to IMS and reset upstream so the next wake or reminder can connect cleanly.
      if (!isClientClosed && ws.isHardwareClient && ws.readyState === ws.OPEN) {
        console.warn(`${tag} Gemini Live upstream closed (${code}). Keeping hardware TCP link open in STANDBY and scheduling warm reconnect.`);
        currentTurnComplete = true;
        if (currentGeminiWs === gWs) currentGeminiWs = null;
        scheduleWarmUpstreamReconnect(2000);
        return;
      }

      // If unexpected fatal close on browser (or client is already gone), close the client
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
      warmReconnectAttempts++;
      if (!isClientClosed && ws.isHardwareClient && ws.readyState === ws.OPEN) {
        console.warn(`${tag} Gemini Live WebSocket error on hardware session - scheduling warm reconnect.`);
        if (currentGeminiWs === gWs) currentGeminiWs = null;
        scheduleWarmUpstreamReconnect(3000);
        return;
      }
      try {
        if (ws.readyState === ws.OPEN) ws.close(1011, 'Error communicating with Gemini');
      } catch (closeErr) {
        console.error(`${tag} Error closing client ws after Gemini error:`, closeErr.message);
      }
    });

    return gWs;
  };

  currentGeminiWs = createGeminiSocket();

  const clientType = isHardware ? 'hardware' : imsWeb ? 'web' : 'browser';
  wakeDaemonService.registerClient(clientType, {
    isSocketAlive: () => !isClientClosed && (ws.readyState === WebSocket.OPEN),
    sendControl: (payload) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    },
    closeUpstream: (reason) => {
      if (currentGeminiWs && (currentGeminiWs.readyState === WebSocket.OPEN || currentGeminiWs.readyState === WebSocket.CONNECTING)) {
        try { currentGeminiWs.close(1000, `WakeDaemon: ${reason}`); } catch (_) {}
        currentGeminiWs = null;
      }
      if (isHardware && !isClientClosed && ws.readyState === WebSocket.OPEN) {
        scheduleWarmUpstreamReconnect(1000);
      }
    },
    isPlayingOrPacing: () => {
      if (isHardware && deviceStillPlaying()) return true; // still playing on the desk
      if (!currentTurnComplete && lastModelAudioTime > 0 && (Date.now() - lastModelAudioTime > 8000)) {
        return false;
      }
      if (!currentTurnComplete) return true;
      if (isHardware) {
        const playingUntil = paceSentMs ? paceStart + paceSentMs : 0;
        return (paceQueue.length > 0) || (Date.now() < playingUntil);
      }
      return Date.now() < webAudioEndAt;
    },
    logCapture
  });

  // Watchdog checking for stalled model turns every second (recovers if Gemini stops audio mid-turn)
  const turnStallWatchdogInterval = setInterval(() => {
    if (isClientClosed) {
      clearInterval(turnStallWatchdogInterval);
      return;
    }
    if (isHardware && !currentTurnComplete && lastModelAudioTime > 0 && (Date.now() - lastModelAudioTime > 8000)) {
      if (paceQueue.length === 0) {
        console.warn(`${tag} ⚠️ Model turn stalled (no audio for 8s). Auto-recovering turnComplete.`);
        try { logCapture(`[${new Date().toISOString()}] ${tag} WATCHDOG RECOVERED STALLED TURN\n`); } catch (_) { }
        currentTurnComplete = true;
        turnCompleteAt = Date.now();
        wakeDaemonService.notifyModelSpeechEnd();
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ turnComplete: true })); } catch (_) { }
        }
      }
    }
  }, 1000);

  const ensureGeminiSocket = () => {
    if (!currentGeminiWs || currentGeminiWs.readyState === WebSocket.CLOSED || currentGeminiWs.readyState === WebSocket.CLOSING) {
      const wait = lastGeminiCloseAt + SESSION_GAP_MS - Date.now();
      if (wait > 0) {
        // too soon after the last session closed - open it a moment later (audio is queued until then)
        if (!deferredOpenTimer) deferredOpenTimer = setTimeout(() => { deferredOpenTimer = null; if (!isClientClosed) ensureGeminiSocket(); }, wait);
        return null;
      }
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
        if (isHardware && maybeJson.playbackStart) {
          devicePlaying = true;
          lastDeviceSpeakingAt = Date.now();
          recordDeviceTelemetry({ speakerActive: true, deviceState: 4, deviceStateName: 'SPEAKING' });
          try { logCapture(`[${new Date().toISOString()}] ${tag} DEVICE PLAYBACK START\n`); } catch (_) { }
          return;
        }
        if (isHardware && maybeJson.playbackDone) {
          devicePlaying = false;
          lastDeviceSpeakingAt = Date.now();
          recordDeviceTelemetry({ speakerActive: false, deviceState: 0, deviceStateName: 'STANDBY' });
          try { logCapture(`[${new Date().toISOString()}] ${tag} DEVICE PLAYBACK DONE (${paceQueue.length} chunks still queued)\n`); } catch (_) { }
          lastActivityAt = Math.max(lastActivityAt, Date.now()); // the silence count starts when he actually stops
          if (followUpUntil) followUpUntil = Math.max(followUpUntil, Date.now() + followUpMs); // so does the reply window
          wakeDaemonService.notifyModelSpeechEnd(Date.now()); // the daemon's silence count too
          return;
        }
        if (typeof maybeJson.log === 'string') {
          const isCam = maybeJson.log.startsWith('[Camera]') || maybeJson.log.startsWith('[USB]');
          appendLog(isCam ? 'camera' : 'device', maybeJson.log);
          try {
            logCapture(`[${new Date().toISOString()}] ${tag} DEVICE LOG: ${maybeJson.log}\n`);
          } catch (_) { }
          if (isHardware) {
            const bootLogMatch = maybeJson.log.match(/boot_diag\s+reset=(\w+)\s+panic=(\d+)/);
            if (bootLogMatch) {
              const rstReason = bootLogMatch[1];
              const hasPanic = bootLogMatch[2] === '1';
              recordDeviceTelemetry({
                resetReason: rstReason,
                lastError: hasPanic ? 'Kernel Panic Detected' : null
              });
              console.log(`${tag} 🚀 Boot Diagnostics (via log): Reset Reason=${rstReason}, Panic=${hasPanic}`);
            }
          }
          return;
        }
        if (typeof maybeJson.debug === 'string') {
          const isCam = maybeJson.debug.startsWith('[Camera]') || maybeJson.debug.startsWith('[USB]');
          appendLog(isCam ? 'camera' : 'device', maybeJson.debug);
          if (isHardware) {
            const bootMatch = maybeJson.debug.match(/^boot_diag\s+reset=(\w+)\s+panic=(\d+)/);
            if (bootMatch) {
              const rstReason = bootMatch[1];
              const hasPanic = bootMatch[2] === '1';
              recordDeviceTelemetry({
                resetReason: rstReason,
                lastError: hasPanic ? 'Kernel Panic Detected' : null
              });
              console.log(`${tag} 🚀 Boot Diagnostics: Reset Reason=${rstReason}, Panic=${hasPanic}`);
            }
            const repMatch = maybeJson.debug.match(/^telemetry_report\s+heap=(\d+)\s+minHeap=(\d+)\s+intHeap=(\d+)\s+intMin=(\d+)/);
            if (repMatch) {
              recordDeviceTelemetry({
                freeHeap: parseInt(repMatch[1], 10),
                minFreeHeap: parseInt(repMatch[2], 10),
                intFreeHeap: parseInt(repMatch[3], 10),
                intMinFreeHeap: parseInt(repMatch[4], 10)
              });
            }
            const hbMatch = maybeJson.debug.match(/^heartbeat\s+state=(\d+)\s+heap=(\d+)\s+minHeap=(\d+)\s+rssi=(-?\d+)(?:\s+intHeap=(\d+)\s+intMin=(\d+))?/);
            if (hbMatch) {
              recordDeviceTelemetry({
                state: parseInt(hbMatch[1], 10),
                freeHeap: parseInt(hbMatch[2], 10),
                minFreeHeap: parseInt(hbMatch[3], 10),
                rssi: parseInt(hbMatch[4], 10),
                intFreeHeap: hbMatch[5] ? parseInt(hbMatch[5], 10) : undefined,
                intMinFreeHeap: hbMatch[6] ? parseInt(hbMatch[6], 10) : undefined,
                isSocketOpen: true
              });
            }
          }
          if (isHardware && maybeJson.debug === 'verifying_start' && !isConversationActive) {
            resetTurnTriggers();
            userSpokenTranscript = '';
            spokenTranscript = '';
            recordDeviceTelemetry({ deviceState: 1, deviceStateName: 'VERIFYING' });
          }
          if (isHardware && /^heartbeat state=6\b/.test(maybeJson.debug)) lastDeviceSpeakingAt = Date.now();
          console.log(`${tag} [DEBUG] ${maybeJson.debug}`);
          try {
            logCapture(
              `[${new Date().toISOString()}] ${tag} DEVICE DEBUG: ${maybeJson.debug}\n`);
          } catch (_) { }
          if (maybeJson.debug === 'verifying_start') {
            heardThisTurn = '';
            resetTurnTriggers();
            if (wakeKickTimer) { clearTimeout(wakeKickTimer); wakeKickTimer = null; }
          }
          return;
        }
        // The top button on the Box-3: MIC MUTED is Ims's silent mode - remembered so the web app
        // doesn't speak doorbell alerts either.
        if (isHardware && typeof maybeJson.micMuted === 'boolean') {
          setDeviceMicMuted(maybeJson.micMuted);
          recordDeviceTelemetry({ micMuted: maybeJson.micMuted });
          console.log(`${tag} 🔇 Device mic ${maybeJson.micMuted ? 'MUTED - silent mode' : 'unmuted'}`);
          return;
        }
        // A call is being recorded: the device only streams its mic. Session
        // and touch messages must not reset or restart anything.
        if (isHardware && isRecordingActive() && (maybeJson.sessionClosed || maybeJson.touchToTalk)) return;
        if (maybeJson.sessionClosed) {
          console.log(`${tag} 🔒 Hardware session closed by device. Resetting conversation state.`);
          convEnd('device_closed');
          turnLog = newTurnLog(); // a wake check that came to nothing
          isConversationActive = false;
          touchToTalkActive = false;
          userSpokenTranscript = '';
          spokenTranscript = '';
          heardThisTurn = '';
          if (wakeKickTimer) { clearTimeout(wakeKickTimer); wakeKickTimer = null; }
          resetTurnTriggers();
          wakeDaemonService.forceStandby('device_session_closed');
          try {
            logCapture(`[${new Date().toISOString()}] ${tag} SESSION CLOSED BY DEVICE\n`);
          } catch (_) { }
          if (currentGeminiWs && currentGeminiWs.readyState === WebSocket.OPEN) {
            currentGeminiWs.close(1000, "Device session closed");
            currentGeminiWs = null;
          }
          return;
        }
        // A tap on the Box-3 while Ims was speaking or thinking: stop him - the rest of the reply is
        // dropped, the conversation ends and the wake listener is reset (same as saying "IMS stop").
        if (isHardware && maybeJson.interrupt) {
          cancelConversation('tap_interrupt');
          return;
        }
        if (maybeJson.touchToTalk) {
          console.log(`${tag} 👆 Touch-to-talk initiated by device.`);
          isConversationActive = true;
          touchToTalkActive = true;
          wakeDaemonService.notifyTouchToTalk(clientType);
          try {
            logCapture(`[${new Date().toISOString()}] ${tag} TOUCH TO TALK INITIATED\n`);
          } catch (_) { }
          return;
        }
        if (isHardware && maybeJson.camera) {
          if (maybeJson.camera.awake !== undefined) {
            console.log(`${tag} 📷 Camera awake frame from device: ${maybeJson.camera.awake}`);
            if (maybeJson.camera.awake) wakeCamera();
            pushScheduleStatus();
          }
          return;
        }
      } catch (_) { }
    }

    // Local wake check: on standby the Box-3's microphone audio is held and transcribed on this PC first
    // (wakeGateService.js); Gemini is only opened - and handed the held audio - for something that sounds
    // like a wake phrase. In a conversation, a follow-up window, touch-to-talk or a recording, audio goes
    // straight through as before.
    if (isBinary && isHardware && imsBrain && wakeGateApplies()) { gateWakeAudio(Buffer.from(message)); return; }

    // Only Gemini's own client messages go upstream (and open a session). Anything else - typically a device
    // log line it couldn't turn into valid JSON during the USB boot flood - is logged and dropped: forwarded,
    // it made Gemini close the session (1007 "Unknown name 'log'").
    if (!isBinary) {
      let upstream = false;
      try { const o = JSON.parse(message.toString()); upstream = Boolean(o && (o.setup || o.clientContent || o.realtimeInput || o.toolResponse)); } catch (_) { }
      if (!upstream) {
        try { logCapture(`[${new Date().toISOString()}] ${tag} DEVICE MESSAGE (not for Gemini, dropped): ${message.toString().slice(0, 300)}\n`); } catch (_) { }
        return;
      }
    }

    const gWs = ensureGeminiSocket();

    // In ws library, message is ALWAYS a Buffer. ONLY isBinary indicates an opcode 0x02 binary frame.
    if (isBinary) {
      ws.isHardwareClient = true;
      if (isHardware && !isRecordingActive()) micAudioChunks.push(Buffer.from(message)); // never keep call audio on disk
      wakeDaemonService.notifyCandidateStart(clientType);

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
      lastMicFrameAt = Date.now();
      // only after a reply that was actually played - a dropped reply made no sound, so there's no echo to guard against
      const msSinceTurnComplete = currentTurnComplete && audibleTurnEndAt ? (Date.now() - audibleTurnEndAt) : Infinity;
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
        if (samples > 0 && Math.sqrt(sumSq / samples) > 400) {
          lastLoudMicAt = Date.now();
          // a transcript only arrives once a long sentence is finished, so judge "did he answer in time" from here
          if (!speechStartAt && currentTurnComplete && Date.now() > followUpUntil - followUpMs + 700) speechStartAt = Date.now();
        }
        if (samples > 0 && Math.sqrt(sumSq / samples) > 300 && Date.now() - turnCompleteAt > 3000 && ++energeticMicFrames >= 8) unsolicitedTurn = false; // the user is talking: stop dropping
        // speech after Ims's turn, in an open conversation - watched so a reply that never comes is noticed
        if (samples > 0 && currentTurnComplete && turnCompleteAt && Math.sqrt(sumSq / samples) > 400) {
          const t = Date.now();
          if (!pendingSpeechStart) pendingSpeechStart = t;
          pendingSpeechLast = t;
          pendingSpeechFrames++;
        }
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
      sessionUsed = true; // mic audio went into this session (a wake check or a conversation)
      if (gWs && gWs.readyState === WebSocket.OPEN && geminiSetupAcknowledged) {
        gWs.send(realtimePayload);
      } else {
        outboundAudioQueue.push(realtimePayload);
        if (outboundAudioQueue.length > 150) outboundAudioQueue.shift();
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
        if (parsedCtrl.clientContent?.turns?.length) {
          textTurnSent = true; sessionUsed = true; lastActivityAt = Date.now(); lastUserInputAt = Date.now();
          const said = parsedCtrl.clientContent.turns.flatMap((t) => (t.parts || []).map((p) => p.text || '')).join(' ').trim();
          if (said) { turnLog.system = said.slice(0, 600); turnLog.userEndAt = Date.now(); }
        }
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
            try { sessionOwedIds = owedThinkTasks().map((t) => t.id); } catch (_) { sessionOwedIds = []; } // C2: answers this session will give
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
          // personality sliders and the active persona in front of it and pin
          // the saved voice. The voice-audition connection (no system prompt)
          // is left alone - it exists specifically to try OTHER voices.
          if (!isHardware && !imsWeb && parsed.setup.systemInstruction && !parsed.setup.previewVoice) {
            const persona = getWebPersonaBlock();
            const original = (parsed.setup.systemInstruction.parts || []).map((p) => p.text || '').join('\n');
            parsed.setup.systemInstruction = {
              parts: [{ text: persona.text + "\n\nYOUR CURRENT TASK AND TOOLS (keep the identity, dialect, personality and voice above throughout): " + original }]
            };
            parsed.setup.generationConfig = parsed.setup.generationConfig || {};
            parsed.setup.generationConfig.speechConfig = { languageCode: persona.languageCode || personaLanguageCode(), voiceConfig: { prebuiltVoiceConfig: { voiceName: persona.voice } } };
            msgStr = JSON.stringify(parsed);
            console.log(`${tag} 🎭 Applied saved Ims voice (${persona.voice}), personality and persona rules to browser live session`);
          }
          // Model Switcher (Phase 4): the voice model chosen for this kind of session - Ims on the desk and
          // in the web app share one choice, the library's generic voice chat has its own.
          {
            const chosen = getModelFor(isHardware || imsWeb ? 'imsVoice' : 'browserVoice');
            const withModel = JSON.parse(msgStr);
            if (chosen && withModel.setup) {
              withModel.setup.model = `models/${chosen}`;
              msgStr = JSON.stringify(withModel);
              liveModel = chosen;
            }
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
      console.log(`${tag} Queueing outbound message (Gemini socket not open yet, state: ${gWs ? gWs.readyState : 'null'})...`);
      outboundQueue.push(msgStr);
      scheduleWarmUpstreamReconnect(200);
    }
  });

  ws.on('close', (code, reason) => {
    isClientClosed = true;
    thinkDeliverers.delete(deliverThink);
    try { if (connectionLogStream) connectionLogStream.end(); } catch (_) { }
    convRecordTurn();
    convEnd('disconnect');
    if (turnStallWatchdogInterval) clearInterval(turnStallWatchdogInterval);
    if (warmReconnectTimer) clearTimeout(warmReconnectTimer);
    wakeDaemonService.unregisterClient(clientType);
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
      setDeviceConnected(false);
      recordDeviceTelemetry({ isSocketOpen: false, wakeVerified: false, deviceState: 0, deviceStateName: 'STANDBY' });
      appendLog('server', `[HardwareLive] Box-3 disconnected (code=${code})`);
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
  socket.setKeepAlive(true, 10000); // 10s TCP keep-alive probe
  socket.setTimeout(60000); // 60s idle timeout
  socket.on('timeout', () => {
    console.warn('[HardwareTCP] Socket idle timeout (60s no activity) — closing stale connection');
    socket.destroy();
  });
  const client = new HardwareTcpClient(socket);
  handleLiveProxyConnection(client, true);
});

hardwareTcpServer.listen(HARDWARE_TCP_PORT, () => {
  console.log(`[HardwareTCP] Raw TCP hardware endpoint listening on port ${HARDWARE_TCP_PORT}`);
});

// Timers/alarms/reminders: poll every 1s for anything due and push it to
// the device for exact second-accurate timer alerts. Deliberately NOT a Gemini turn - it's a lightweight control
// frame (device chimes + shows it on screen, see reminderFired in main.cpp).
function pollDueReminders() {
  let fired;
  try {
    fired = checkDueScheduledItems();
    if (fired.length > 0) {
      pushScheduleStatus();
    }
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
          reminderFired: { type: item.type, label: item.label || '', alertMode: item.alertMode || 'both' }
        }));
      } catch (err) {
        console.error('[Reminders] Failed to notify device:', err.message);
      }
    } else {
      console.warn(`[Reminders] No connected hardware client to notify for id=${item.id} - it fired but was missed`);
    }
  }
}

schedulerService.registerJob({
  name: 'reminders_due_poll',
  description: 'Second-accurate due checks for timers, alarms, and reminders',
  category: 'realtime',
  intervalMs: 1000,
  action: pollDueReminders
});

schedulerService.registerJob({
  name: 'schedule_status_push',
  description: 'Periodic schedule ticker and soonest timer push to hardware client',
  category: 'realtime',
  intervalMs: 15000,
  action: () => { pushScheduleStatus(); }
});

schedulerService.registerJob({
  name: 'music_nightly_scan',
  description: 'Daily check and trigger for album releases and want-list updates',
  category: 'maintenance',
  intervalMs: 60000,
  action: () => { checkAndTriggerNightlyScan(); }
});

// Launch central background scheduler
schedulerService.start();

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

// Voice Detection Background Service (Wake Daemon): push real-time telemetry to hardware client
const pushWakeDaemonStatus = (extra = {}) => {
  if (activeHardwareSession?.clientWs?.readyState === WebSocket.OPEN) {
    try {
      activeHardwareSession.clientWs.send(JSON.stringify({
        wakeDaemon: {
          running: true,
          state: wakeDaemonService.state,
          wakeVerified: wakeDaemonService.state === 'CONVERSATION_ACTIVE',
          ...extra
        }
      }));
    } catch (err) {
      console.error('[WakeDaemon] Failed to push status to hardware client:', err.message);
    }
  }
};

wakeDaemonService.on('stateChange', ({ state, reason }) => {
  pushWakeDaemonStatus({ state, reason });
});

wakeDaemonService.on('wakeVerified', ({ phrase }) => {
  pushWakeDaemonStatus({ state: 'CONVERSATION_ACTIVE', wakeVerified: true, phrase });
});

// Desk presence (presenceService.js): Ims's eyes follow whoever is at the desk, and an enrolled person
// sitting down after being away gets a hello. Both go to the box, which decides: it greets only from
// standby, never while recording, muted or asleep (and drops both while recording anyway).
const sendToHardware = (msg) => {
  const ws = activeHardwareSession?.clientWs;
  if (ws?.readyState !== WebSocket.OPEN || isRecordingActive()) return;
  try { ws.send(JSON.stringify(msg)); } catch (err) { console.error('[Presence] Failed to send to hardware client:', err.message); }
};
onPresence('gaze', (gaze) => sendToHardware({ gaze }));
onPresence('greet', ({ names }) => {
  // First names only, and nothing that could break the device's prompt string.
  const first = names.map((n) => String(n).trim().split(/\s+/)[0].replace(/["\\]/g, '').slice(0, 24)).filter(Boolean);
  if (first.length) sendToHardware({ greet: { names: first.join(' and ') } });
});
startPresence();
startWakeGate(); // load the local wake-check model now, not on the first "Hey Ims"

// Ring Doorbell Direct API Service: Wire real-time alerts to ESP32-S3-BOX-3 and Gemini spoken announcements
doorbellService.on('doorbellEvent', (alert) => {
  console.log(`[DoorbellAlert] Dispatching ${alert.event.toUpperCase()} to hardware client & voice brain...`);
  
  // 1. Push alert frame to connected hardware device (triggers alert sound / visual screen indicator)
  if (activeHardwareSession?.clientWs?.readyState === WebSocket.OPEN) {
    try {
      activeHardwareSession.clientWs.send(JSON.stringify({
        doorbellAlert: {
          event: alert.event,
          cameraName: alert.cameraName,
          locationName: alert.locationName,
          batteryLevel: alert.batteryLevel,
          phrase: alert.phrase,
          timestamp: alert.timestamp
        }
      }));
      console.log(`[DoorbellAlert] Sent doorbellAlert frame to active hardware client.`);
    } catch (err) {
      console.error('[DoorbellAlert] Failed to push doorbellAlert to hardware client:', err.message);
    }
  }

  // 2. If Gemini Live session is open with the hardware device or web client, speak the persona's announcement
  // Speaking it: the ESP32 asks Ims itself when the doorbellAlert frame arrives (firmware - speaker ready, said once);
  // only a browser voice session with no device connected gets the announcement injected from here.
  const targetGeminiWs = activeHardwareSession?.clientWs?.readyState === WebSocket.OPEN ? null : activeBrowserSession?.geminiWs;
  if (targetGeminiWs && targetGeminiWs.readyState === WebSocket.OPEN) {
    try {
      console.log(`[DoorbellAlert] Triggering spoken announcement via Gemini Live turn: "${alert.phrase}"`);
      targetGeminiWs.send(JSON.stringify({
        clientContent: {
          turns: [{
            role: 'user',
            parts: [{
              text: `(System: The Ring Doorbell just triggered a ${alert.event} event at ${alert.cameraName}. Announce this urgently and naturally ${inYourVoice()} right now, something like: "${alert.phrase}")`
            }]
          }],
          turnComplete: true
        }
      }));
    } catch (err) {
      console.error('[DoorbellAlert] Failed to trigger Gemini spoken announcement:', err.message);
    }
  }
});

// Initialise Doorbell service in the background on startup
doorbellService.init().then((connected) => {
  if (connected) {
    console.log('[DoorbellService] Initialized and listening for Ring doorbell events');
  } else {
    console.log('[DoorbellService] Initialized (standing by for token configuration)');
  }
}).catch((err) => {
  console.warn('[DoorbellService] Startup initialization skipped:', err.message);
});


// Pre-warm day report cache on server startup in the background
prewarmDayReportCache({ markNews: false }).then(() => {
  console.log('[MorningReport] Initial background day report cache pre-warmed successfully');
}).catch((err) => {
  console.warn('[MorningReport] Initial background day report cache pre-warm skipped:', err.message);
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
let lastFrameCamKey = '';
const debugMicServer = http.createServer((req, res) => {
  // Device key: when IMS_DEVICE_KEY is set (pdf-knowledge-base/.env), every request must carry it in the
  // X-IMS-Key header - the Box-3 sends it (secrets.h) - so nothing else on the network can change Ims's
  // personality, post camera frames or fetch face packs. Not set: open, as before.
  if (process.env.IMS_DEVICE_KEY && req.headers['x-ims-key'] !== process.env.IMS_DEVICE_KEY) {
    res.writeHead(401, { 'Content-Type': 'text/plain' }).end('Device key required.');
    return;
  }
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
        // Only tell the box when the camera icon's state actually changed - pushing the whole status
        // on every frame (several a second) crowded the link Ims's voice uses.
        const cam = getCameraStatus();
        const camKey = `${cam.attached}|${cam.deviceAwakeWanted}`;
        if (camKey !== lastFrameCamKey) { lastFrameCamKey = camKey; pushScheduleStatus(); }
        res.writeHead(200).end('ok');
      } else if (kind === 'heartbeat') {
        heartbeat({ boot: req.url.includes('boot=1') });
        pushScheduleStatus();
        res.writeHead(200).end('ok');
      } else if (kind === 'log') {
        const logText = body.toString('utf8').slice(0, 2000).trim();
        appendDeviceLog(logText);
        appendLog('camera', logText);
        res.writeHead(200).end('ok');
      } else {
        res.writeHead(404).end();
      }
    });
    return;
  }

  // Box-3 face packs (faceDeviceService.js): one file of JPEG frames for the active persona's face
  if (req.method === 'GET' && req.url.startsWith('/device/face-pack/')) {
    const id = req.url.slice('/device/face-pack/'.length).replace(/\.bin$/, '');
    const f = packPath(id);
    if (!fs.existsSync(f)) { res.writeHead(404).end('no such face pack'); return; }
    const size = fs.statSync(f).size;
    console.log(`[FaceDevice] Sending face pack ${id} (${Math.round(size / 1024)} KB) to the Box-3`);
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': size });
    fs.createReadStream(f).pipe(res);
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

