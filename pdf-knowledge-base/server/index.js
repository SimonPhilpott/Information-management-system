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
import { isRecordingActive } from './services/recordingService.js';
import { SqliteSessionStore } from './db/sessionStore.js';
import { onDevicePush, onSchedulePush, onDeviceCapture } from './services/deviceBus.js';
import calendarRoutes from './routes/calendar.js';
import stravaRoutes from './routes/strava.js';
import plannerRoutes from './routes/planner.js';
import goalRoutes from './routes/goals.js';
import { getStatus as getStravaStatus, syncActivities as syncStrava } from './services/stravaService.js';
import { logNightscout } from './services/runGlucoseService.js';
import { refreshEvents, getDeviceIcons } from './services/calendarService.js';
import { getStandbyOverride } from './services/faceDesignService.js';
import boardgamesRoutes from './routes/boardgames.js';
import peopleRoutes from './routes/people.js';
import lookRoutes from './routes/look.js';
import { getCameraStatus, setFrame, heartbeat, appendDeviceLog } from './services/cameraService.js';
import { startPresence, onPresence } from './services/presenceService.js';
import { startWakeGate } from './services/wakeGateService.js';
import { live, thinkDeliverers } from './live/state.js';
import { handleLiveProxyConnection, setPushScheduleStatus } from './live/liveProxy.js';
import { validateConfiguredModels } from './services/modelService.js';
import { isDeviceMicMuted } from './services/deviceState.js';
import { loadHnswFromDisk } from './services/hnswService.js';
import { getDeviceFace, ensurePack, onFacePackReady, packPath } from './services/faceDeviceService.js';
import { ensureClips, ensureAllClips } from './services/holdingClips.js';
import { onTaskDone } from './services/tasksService.js';
import { getPersonality, setPersonality, getCaptureLogging, setCaptureLogging } from './services/hardwareClientService.js';
import { inYourVoice, onPersonaChange } from './services/personaService.js';
import { listScheduledItems, checkDueScheduledItems, getActiveScheduledStatus } from './services/remindersService.js';
import { getBirthdayFooterStatus, listBirthdays } from './services/birthdayService.js';
import { getTodayReleases } from './services/musicScanService.js';
import { prewarmDayReportCache } from './services/morningReportService.js';
import newsRoutes from './routes/news.js';
import tasksRoutes from './routes/tasks.js';
import devIdeasRoutes from './routes/devIdeas.js';
import decksRoutes from './routes/decks.js';
import campaignsRoutes from './routes/campaigns.js';
import dayReportRoutes from './routes/dayReport.js';
import codeRepoRoutes from './routes/codeRepo.js';
import phrasesRoutes from './routes/phrases.js';
import wakeDaemonRoutes from './routes/wakeDaemon.js';
import { wakeDaemonService, DAEMON_STATES } from './services/wakeDaemonService.js';
import doorbellRoutes from './routes/doorbell.js';
import weatherRoutes from './routes/weather.js';
import searchRoutes from './routes/search.js';
import runStartRoutes from './routes/runStart.js';
import { doorbellService } from './services/doorbellService.js';
import appDb from './db/database.js';
import { getWeather } from './services/weatherService.js';
import { startGlucosePoller, getGlucoseData } from './services/glucoseService.js';
import { checkAndTriggerNightlyScan } from './services/musicScanService.js';
import { schedulerService } from './services/schedulerService.js';
import eventBus from './services/eventBus.js';
import logger from './services/loggerService.js';
import { appendLog } from './services/deviceHealthService.js';
import { setOtaActivityCheck } from './services/firmwareService.js';

// Hook OTA activity checks to active voice/recording states
setOtaActivityCheck(() => {
  // (this used to test the live proxy's own isConversationActive, which is never defined out here - so an
  // update could start mid-conversation; the wake daemon knows when a conversation is open)
  const isConv = wakeDaemonService.state === DAEMON_STATES.CONVERSATION_ACTIVE;
  const isRec = typeof isRecordingActive === 'function' ? isRecordingActive() : false;
  return {
    canUpdate: !isConv && !isRec,
    reason: isConv ? 'Conversation with Gemini is active' : isRec ? 'Audio recording is active' : null
  };
});



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
  const online = deviceLinks > 0 || !!live.hardwareSession;
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

// Messages routes want pushed to the device (e.g. previewing a face from the
// Face Designer) - see services/deviceBus.js.
onDevicePush((message) => {
  const ws = live.hardwareSession?.clientWs;
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(message)); } catch (err) { console.error('[DeviceBus] push failed:', err.message); }
  }
});

onSchedulePush(() => pushScheduleStatus());

onDeviceCapture(({ seconds, resolve, reject }) => {
  const ws = live.hardwareSession?.clientWs;
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

setPushScheduleStatus(pushScheduleStatus); // the live proxy pushes it too (live/liveProxy.js)
export function pushScheduleStatus(targetWs = null) {
  const ws = targetWs || live.hardwareSession?.clientWs;
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


onTaskDone((t) => { if (t?.kind !== 'think') return; for (const deliver of thinkDeliverers) { try { if (deliver(t)) return; } catch (_) { } } });
// A2: each persona's holding lines are recorded once (and again when its voice or lines change)
setTimeout(() => { ensureAllClips().catch((err) => console.warn('[Holding]', err.message)); }, 3 * 60 * 1000);
onPersonaChange((id) => { ensureClips(id).catch(() => {}); });



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
    if (live.hardwareSession?.clientWs?.readyState === WebSocket.OPEN) {
      try {
        live.hardwareSession.clientWs.send(JSON.stringify({
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
  if (live.hardwareSession?.clientWs?.readyState === WebSocket.OPEN) {
    try {
      live.hardwareSession.clientWs.send(JSON.stringify({
        glucose: { value: glucose.value, direction: glucose.direction, dbPct: glucose.dbPct }
      }));
    } catch (err) {
      console.error('[Glucose] Failed to push update to hardware client:', err.message);
    }
  }
});

// Voice Detection Background Service (Wake Daemon): push real-time telemetry to hardware client
const pushWakeDaemonStatus = (extra = {}) => {
  if (live.hardwareSession?.clientWs?.readyState === WebSocket.OPEN) {
    try {
      live.hardwareSession.clientWs.send(JSON.stringify({
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
  const ws = live.hardwareSession?.clientWs;
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
  if (live.hardwareSession?.clientWs?.readyState === WebSocket.OPEN) {
    try {
      live.hardwareSession.clientWs.send(JSON.stringify({
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
  const targetGeminiWs = live.hardwareSession?.clientWs?.readyState === WebSocket.OPEN ? null : live.browserSession?.geminiWs;
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

