// The Gemini Live voice proxy: one call per client connection (the Box-3, the browser voice page, Ims on the
// web). It relays audio and messages between the client and a Gemini Live session, runs Ims's tools, and
// owns the conversation lifecycle (wake checks, follow-ups, silence, recording mode). Moved out of index.js.
import path from 'path';
import { fileURLToPath } from 'url';
// the server folder, as in index.js (this file lives one level down, in live/)
const __dirname = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
import config from '../config.js';
import fs from 'fs';
import { DAEMON_STATES, wakeDaemonService } from '../services/wakeDaemonService.js';
import { WebSocket } from 'ws';
import { activePersonaId, inYourVoice, languageCode as personaLanguageCode } from '../services/personaService.js';
import { addIdea as addDevIdea, flagToolFailure } from '../services/devIdeasService.js';
import { addMemory, deleteMemory } from '../db/database.js';
import { addToList, cancelScheduledItem, clearList, getHistorySummary, listScheduledItems, readList, removeFromList, scheduleItem, stopAllRinging } from '../services/remindersService.js';
import { addTurn, endConversation as endConversationLog, recentTurns, startConversation } from '../services/conversationLog.js';
import { appendLog, recordDeviceTelemetry, setHardwareSocketSender } from '../services/deviceHealthService.js';
import { appendRecordingText, isRecordingActive, onRecordingChange, startRecording, stopRecording } from '../services/recordingService.js';
import { askLive } from '../services/lookService.js';
import { askProfileInsightQuestion } from '../services/glucoseInsightService.js';
import { buildMorningReportDirective, getDayReport, isFirstInteractionToday, markMorningReportOffered } from '../services/morningReportService.js';
import { campaignsForIms } from '../services/campaignsService.js';
import { clearOldNightscout, describeForIms as describeGlucoseForIms, dosingContext, logCarbs, recentCarbs } from '../services/glucoseHubService.js';
import { createEvent, describeEvents, getUpcomingEvents } from '../services/calendarService.js';
import { createTask, describeTasksForIms, markReported, owedThinkTasks } from '../services/tasksService.js';
import { describeCollectionForIms } from '../services/boardgamesService.js';
import { describeTraining, getStatus as getStravaStatus } from '../services/stravaService.js';
import { doorbellService } from '../services/doorbellService.js';
import { embedMemory, recallMemories, summariseConversation } from '../services/memoryService.js';
import { enrolFace } from '../services/faceService.js';
import { executeHardwareRAGSearch, getCaptureLogging, getHardwareSetupPayload, getPersonality, getWebPersonaBlock, getWebSetupPayload, recordReplyOpener, recordReplyText } from '../services/hardwareClientService.js';
import { getDevicePayload } from '../services/faceDesignService.js';
import { getFrame, wakeCamera } from '../services/cameraService.js';
import { getGlucoseData } from '../services/glucoseService.js';
import { getModelFor } from '../services/modelRegistry.js';
import { getNews } from '../services/newsService.js';
import { getTodayReleases, getUpcomingReleases, getWants as getMusicWants, getWindowResults } from '../services/musicScanService.js';
import { listBirthdays } from '../services/birthdayService.js';
import { getWeather } from '../services/weatherService.js';
import { isDeviceMicMuted, setDeviceConnected, setDeviceMicMuted } from '../services/deviceState.js';
import { lookUpFood } from '../services/foodService.js';
import { noteWakeCandidate } from '../services/phrasesService.js';
import { pickClip } from '../services/holdingClips.js';
import { pickJoke } from '../services/jokeService.js';
import { recordUsage } from '../services/geminiClient.js';
import { stripMedicalDisclaimers } from '../services/disclaimerSanitizer.js';
import { transcribeWake } from '../services/wakeGateService.js';
import { live, thinkDeliverers, FOLLOW_UP_MS } from './state.js';
import { stripToolText, looksLikeVisionAsk, looksAddressed, heardLikeWake, faceFromWords } from './textMatching.js';
import { withVoiceReminder, toSilentSetup, pinSavedVoice } from './setupMessages.js';
import { writeDebugLog, IDF_NOISE } from './debugLog.js';

// index.js's status push to the Box-3 (set at start-up - index.js imports this module, not the other way)
let pushScheduleStatus = () => {};
export function setPushScheduleStatus(fn) { pushScheduleStatus = fn; }

export function handleLiveProxyConnection(ws, isHardware = false, opts = {}) {
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
    if (live.hardwareSession && live.hardwareSession.clientWs !== ws) {
      console.warn(`${tag} ⚠️ Terminating previous hardware session`);
      try {
        logCapture(
          `[${new Date().toISOString()}] ${tag} TERMINATING PREVIOUS HARDWARE SESSION (replaced by incoming socket ${remoteInfo})\n`);
      } catch (_) { }
      try {
        if (live.hardwareSession.geminiWs && (live.hardwareSession.geminiWs.readyState === WebSocket.OPEN || live.hardwareSession.geminiWs.readyState === WebSocket.CONNECTING)) {
          live.hardwareSession.geminiWs.close(1000, 'Replaced by new hardware session');
        }
        if (live.hardwareSession.clientWs) {
          live.hardwareSession.clientWs.close(1000, 'Replaced by new hardware session');
        }
      } catch (e) {
        console.error(`${tag} Error closing prior hardware session:`, e);
      }
    }
    live.hardwareSession = { clientWs: ws, geminiWs: null };
    setDeviceConnected(true);
    pushScheduleStatus(ws);
  } else {
    if (live.browserSession && live.browserSession.clientWs !== ws) {
      console.warn(`${tag} ⚠️ Terminating previous browser session`);
      try {
        if (live.browserSession.geminiWs && (live.browserSession.geminiWs.readyState === WebSocket.OPEN || live.browserSession.geminiWs.readyState === WebSocket.CONNECTING)) {
          live.browserSession.geminiWs.close(1000, 'Replaced by new browser session');
        }
        if (live.browserSession.clientWs && live.browserSession.clientWs.readyState === WebSocket.OPEN) {
          live.browserSession.clientWs.close(1000, 'Replaced by new browser session');
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
  // (looksAddressed: the wake phrases service's recorded spellings included), which always need the name:
  // "Hello", "Hi" or "Eh up" on their own don't open anything. A local check that fails lets the audio through.
  const WAKE_FIRST_CHECK_BYTES = 16000 * 2 * 1.2; // 1.2 s of 16 kHz 16-bit audio: enough for "Hey Ims"
  const WAKE_RECHECK_BYTES = 16000 * 2 * 0.6;     // then look again every 0.6 s while the sound goes on
  const WAKE_MAX_BYTES = 16000 * 2 * 8;           // hold at most the last 8 s
  const WAKE_GIVE_UP_MS = 8000;                   // no wake phrase 8 s into a sound: not for Ims
  const wakeGate = { frames: [], bytes: 0, startedAt: 0, lastFrameAt: 0, checkedBytes: 0, checking: false, done: false, passedAt: 0 };
  const resetWakeGate = () => Object.assign(wakeGate, { frames: [], bytes: 0, startedAt: 0, lastFrameAt: 0, checkedBytes: 0, checking: false, done: false });
  const wakeGateApplies = () => {
    // Local CPU-based faster-whisper check takes 1.5-2.7s per slice on host CPU, which exceeds
    // the ESP32-S3-BOX-3's 4.5s STATE_VERIFYING timeout and causes empty transcript drops ("").
    // Disabled by default to preserve instantaneous cloud Gemini Live wake phrase response (<300ms).
    if (process.env.ENABLE_LOCAL_WAKE_GATE !== 'true') return false;
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
      const ok = looksAddressed(text);
      const strong = ok;
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
  // what he said in his previous reply - the context for a pronunciation correction that follows it
  let lastImsReply = '';
  // "it's pronounced...", "say it like...": a correction he must keep (saved by the server if he doesn't)
  const PRONUNCIATION_FIX = /\b(pronounc\w*|say it (?:like|as)|said like|it'?s said|sounds like)\b/i;
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
    if (isHardware) live.lastConversationEnd = { at: Date.now(), reason };
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
    if (Date.now() < live.geminiCooldownUntil) {
      const waitMs = Math.max(200, live.geminiCooldownUntil - Date.now() + 100);
      scheduleWarmUpstreamReconnect(waitMs);
      if (!createGeminiSocket.lastNote || Date.now() - createGeminiSocket.lastNote > 10000) {
        createGeminiSocket.lastNote = Date.now();
        try { logCapture(`[${new Date().toISOString()}] ${tag} GEMINI COOLDOWN - not opening a session for ${Math.ceil((live.geminiCooldownUntil - Date.now()) / 1000)} s (retry scheduled in ${Math.round(waitMs / 1000)}s)\n`); } catch (_) { }
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
      if (live.hardwareSession && live.hardwareSession.clientWs === ws) {
        live.hardwareSession.geminiWs = gWs;
      } else {
        live.hardwareSession = { clientWs: ws, geminiWs: gWs };
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
      live.browserSession = { clientWs: ws, geminiWs: gWs };
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
            // noted only: the camera is asked at the end of his reply, and only if he didn't look himself
            // (looking in parallel every time cost an extra vision call when he did)
            visionAsk = { at: Date.now(), toolCalled: false, question: turnLog.user.trim() };
            console.log(`${tag} 📷 Heard a look/see request: "${visionAsk.question.slice(0, 80)}"`);
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
              // a pronunciation correction he answered without saving: keep it anyway, with what he'd said
              if (imsBrain && PRONUNCIATION_FIX.test(turnLog.user) && !turnLog.tools.some((t) => t.name === 'rememberFact') && !(isHardware && isRecordingActive())) {
                try {
                  const fact = `Simon corrected your pronunciation: "${turnLog.user.trim().slice(0, 200)}"` + (lastImsReply ? ` (you had just said: "${lastImsReply.slice(0, 160)}")` : '');
                  const saved = addMemory(fact, 'pronunciation');
                  embedMemory('memory', saved.id, saved.fact).catch(() => {});
                  console.log(`${tag} 🗣️ Pronunciation correction saved for him: "${turnLog.user.trim().slice(0, 80)}"`);
                  try { logCapture(`[${new Date().toISOString()}] ${tag} PRONUNCIATION SAVED (he didn't): ${saved.fact.slice(0, 200)}\n`); } catch (_) { }
                } catch (err) { console.warn(`${tag} pronunciation save failed:`, err.message); }
              }
              lastImsReply = said;
              followUpMs = (/\?["')\s]*$/.test(said) || said.split(/\s+/).length > 60) ? 25000 : FOLLOW_UP_MS;
              followUpUntil = playEnd + followUpMs;
              wakeDaemonService.setSilenceTimeout(followUpMs + 5000);
              if (isHardware) paceSend({ json: JSON.stringify({ followUpMs }) }); // the Box-3 keeps listening that long too
              // a look / see request he answered without looking: give him what the camera shows, once
              const va = visionAsk;
              if (va && !va.toolCalled && !turnLog.tools.some((t) => t.name === 'lookAtCamera') && Date.now() - va.at < 30000) {
                visionAsk = { ...va, toolCalled: true };
                const frame = getFrame();
                const looking = frame && Date.now() - frame.at < 120000
                  ? askLive(`${va.question} (describe what is in front of the desk camera)`, { withEmbeddings: true }).catch(() => null)
                  : Promise.resolve(null);
                looking.then((snap) => {
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
            if (!['setEmotion', 'endConversation', 'noWakeDetected', 'noteWake'].includes(call.name) && (wordsSpoken - wordMark < 10 || call.name === 'lookAtCamera')) { toolAnswerOwedAt = Date.now(); toolAnswerWords = 0; }
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
              // (turnWakePhraseVerified / pendingModelAudioBytes were also cleared here - leftovers of variables that
              // no longer exist: in a module that threw, so the device was never told and convEndPending never set)
              if (call.name === 'noWakeDetected') {
                isConversationActive = false;
              }
              if (call.name === 'endConversation') {
                isConversationActive = false;
                touchToTalkActive = false;
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
                    live.lastUnenrolledFace = unknown[0];
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
              } else if (!live.lastUnenrolledFace || !live.lastUnenrolledFace.embedding) {
                respondToToolCall(call, { error: 'No recent unknown face sample is available to enrol. Call lookAtCamera first.' });
              } else {
                try {
                  const res = enrolFace({
                    name,
                    notes,
                    embedding: live.lastUnenrolledFace.embedding,
                    thumbBase64: live.lastUnenrolledFace.thumb
                  });
                  console.log(`${tag} 👤 Enrolled new person "${name}" into Faces (ID ${res.personId})`);
                  live.lastUnenrolledFace = null;
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
            if (isHardware && !resumptionHandle && live.lastConversationEnd.at && Date.now() - live.lastConversationEnd.at < 10 * 60000
              && ['silence', 'disconnect', 'device_closed', 'stale'].includes(live.lastConversationEnd.reason) && !isRecordingActive()) {
              try {
                const turns = recentTurns({ withinMinutes: 15, limit: 6 }).filter((t) => t.role !== 'system')
                  .map((t) => ({ role: t.role === 'ims' ? 'model' : 'user', parts: [{ text: t.text }] }));
                if (turns.length && gWs && gWs.readyState === WebSocket.OPEN) {
                  gWs.send(JSON.stringify({ clientContent: { turns, turnComplete: false } }));
                  try { logCapture(`[${new Date().toISOString()}] ${tag} CONTEXT RESTORED - ${turns.length} recent turns from the last conversation (${live.lastConversationEnd.reason})\n`); } catch (_) { }
                }
              } catch (err) { console.error(`${tag} [Conversation] restore failed:`, err.message); }
              live.lastConversationEnd = { at: 0, reason: null }; // once
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
        live.geminiCooldownUntil = Math.max(live.geminiCooldownUntil, Date.now() + wait);
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
      // Calibrated to 450ms: preserves acoustic decay suppression against Box-3 speaker reverberation
      // without swallowing immediate human affirmations ('Yes' / 'Yeah') in conversational turn-taking.
      const POST_TURN_ECHO_GRACE_MS = 450;
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
    if (isHardware && live.hardwareSession?.clientWs === ws) {
      live.hardwareSession = null;
      setDeviceConnected(false);
      recordDeviceTelemetry({ isSocketOpen: false, wakeVerified: false, deviceState: 0, deviceStateName: 'STANDBY' });
      appendLog('server', `[HardwareLive] Box-3 disconnected (code=${code})`);
    } else if (!isHardware && live.browserSession?.clientWs === ws) {
      live.browserSession = null;
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
