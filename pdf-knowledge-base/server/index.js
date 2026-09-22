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
import { getAuthStatus } from './services/driveService.js';
import { validateConfiguredModels } from './services/modelService.js';
import { loadHnswFromDisk } from './services/hnswService.js';
import { executeHardwareRAGSearch, getHardwareSetupPayload } from './services/hardwareClientService.js';

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
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set true in production with HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Restriction Middleware: Gates the app to the authorized user only
const requireAdmin = (req, res, next) => {
  // Allow auth routes and static assets
  if (req.path.startsWith('/api/auth') || !req.path.startsWith('/api')) {
    return next();
  }

  const status = getAuthStatus();
  const isAdmin = !config.adminEmail || status.email === config.adminEmail;

  if (!isAdmin || (!req.session.user && !status.email)) {
    return res.status(401).json({ error: 'Unauthorized: Admin access required.' });
  }

  next();
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
const hardwareWss = new WebSocketServer({ noServer: true });
let activeBrowserSession = null;
let activeHardwareSession = null;

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (pathname === '/api/live') {
    browserWss.handleUpgrade(request, socket, head, (ws) => {
      browserWss.emit('connection', ws, request);
    });
  } else if (pathname === '/api/hardware-live') {
    hardwareWss.handleUpgrade(request, socket, head, (ws) => {
      hardwareWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

function handleLiveProxyConnection(ws, isHardware = false) {
  const tag = isHardware ? '[HardwareLive]' : '[BrowserLive]';
  console.log(`${tag} Client connected`);
  if (isHardware) ws.isHardwareClient = true;

  // Terminate only the prior session for THIS client type (browser vs hardware do not stomp each other)
  if (isHardware) {
    if (activeHardwareSession && activeHardwareSession.clientWs !== ws) {
      console.warn(`${tag} ⚠️ Terminating previous hardware session`);
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
    fs.appendFileSync(path.join(__dirname, 'live_proxy_debug.log'),
      `[${new Date().toISOString()}] ${tag} CONNECTING GEMINI keyPrefix=${apiKey ? apiKey.slice(0, 6) : 'MISSING'}\n`);
  } catch (_) { }

  let currentGeminiWs = null;
  let cachedSetupMsg = null;
  let isClientClosed = false;
  const outboundQueue = [];
  let geminiFirstMessageLogged = false;
  let lastModelAudioTime = 0;
  let suppressedMicFrameCount = 0; // see the echo-suppression logging below
  let sessionTranscript = '';
  // Tracks whether Gemini sent a turnComplete for the current generation turn.
  // Used to detect mid-turn disconnects (Gemini closes code=1000 before the turn
  // finished) and synthesise the missing turnComplete so the device does not
  // get stuck in SPEAKING state with a partially-played response.
  let currentTurnComplete = true; // true initially (no active turn yet)

  // Direct Raw Packet Capture: Stream recording to WAV on disk
  const capturesDir = path.join(__dirname, 'audio_captures');
  if (!fs.existsSync(capturesDir)) fs.mkdirSync(capturesDir, { recursive: true });
  const captureFilename = `raw_gemini_audio_${Date.now()}.wav`;
  const capturePath = path.join(capturesDir, captureFilename);
  const audioChunks = [];
  const captureStartTime = Date.now();
  console.log(`[AudioCapture] 🎙️ Initialised raw packet capture: ${capturePath}`);

  // Mirror capture for the OTHER direction (hardware mic -> Gemini) - the
  // existing AudioCapture above only ever recorded Gemini's spoken replies.
  // Added purely to directly listen to what the ESP32 mic is actually
  // sending, since RMS telemetry alone can't distinguish real intelligible
  // speech from non-zero but garbled/distorted audio, and Gemini's own VAD
  // has been silently failing to ever respond to it.
  // Stereo A/B test concluded (L and R sounded identical, ruling out a
  // channel-mapping bug) - firmware is back to mono capture, so this is a
  // plain single-channel WAV writer again.
  const micAudioChunks = [];
  const micCapturePath = path.join(capturesDir, `raw_mic_audio_${Date.now()}.wav`);
  const flushMicWavToDisk = () => {
    if (!isHardware || micAudioChunks.length === 0) return;
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
    if (audioChunks.length === 0) return;
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
    } catch (err) {
      console.error('[AudioCapture] Error saving WAV/TXT:', err);
    }
  };

  let geminiConnectedAt = 0; // for "how long was this connection alive" in the close log below

  const createGeminiSocket = () => {
    if (isClientClosed) return null;
    const gWs = new WebSocket(geminiUrl);
    geminiConnectedAt = Date.now();

    if (isHardware) {
      activeHardwareSession = { clientWs: ws, geminiWs: gWs };
    } else {
      activeBrowserSession = { clientWs: ws, geminiWs: gWs };
    }

    gWs.on('open', () => {
      console.log(`${tag} Connected to Gemini Live upstream`);
      // If we cached a setup handshake from the client, re-send it on new socket ONLY if outboundQueue doesn't already contain one
      const hasQueuedSetup = outboundQueue.some(m => typeof m === 'string' && m.includes('"setup"'));
      if (cachedSetupMsg && !hasQueuedSetup) {
        console.log(`${tag} Replaying cached setup handshake to Gemini...`);
        gWs.send(cachedSetupMsg);
      }
      // Flush queued messages
      while (outboundQueue.length > 0) {
        const msg = outboundQueue.shift();
        console.log(`${tag} Flushing queued message to Gemini...`);
        gWs.send(msg);
      }
    });

    gWs.on('message', (data) => {
      if (!geminiFirstMessageLogged) {
        geminiFirstMessageLogged = true;
        const preview = data.toString().slice(0, 500);
        console.log(`${tag} First Gemini message received:`, preview);
        try {
          fs.appendFileSync(path.join(__dirname, 'live_proxy_debug.log'),
            `[${new Date().toISOString()}] ${tag} GEMINI FIRST MSG: ${preview}\n`);
        } catch (_) { }
      }
      const msgStr = data.toString();
      let parsedAudioBytes = null;
      let parsed = null;
      try {
        parsed = JSON.parse(msgStr);

        // Check for incoming audio parts
        if (parsed.serverContent?.modelTurn?.parts) {
          for (const part of parsed.serverContent.modelTurn.parts) {
            if (part.inlineData?.mimeType?.startsWith('audio/') && part.inlineData.data) {
              lastModelAudioTime = Date.now();
              // Mark this turn as incomplete until Gemini confirms otherwise.
              // Any audio chunk arriving means a generation turn is in flight.
              currentTurnComplete = false;
              const rawBytes = Buffer.from(part.inlineData.data, 'base64');
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
                fs.appendFileSync(path.join(__dirname, 'live_proxy_debug.log'),
                  `[${new Date().toISOString()}] ${tag} GEMINI TEXT: ${part.text}\n`);
              } catch (_) { }
            }
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
            fs.appendFileSync(path.join(__dirname, 'live_proxy_debug.log'),
              `[${new Date().toISOString()}] ${tag} GEMINI INTERRUPTED msSinceOwnAudio=${msSinceOwnAudio} suppressedMicFrames=${suppressedMicFrameCount}\n`);
          } catch (_) { }
        }

        if (parsed.serverContent?.turnComplete) {
          currentTurnComplete = true; // Gemini confirmed the turn ended cleanly
          console.log(`${tag} ✅ Gemini reported TURN COMPLETE`);
          try {
            fs.appendFileSync(path.join(__dirname, 'live_proxy_debug.log'),
              `[${new Date().toISOString()}] ${tag} GEMINI TURN COMPLETE\n`);
          } catch (_) { }
        }

        // If tool call is issued by Gemini, handle searchLibrary automatically for hardware clients only.
        // Browser clients run their own handleSearchTool() in useGeminiLive.js and respond themselves -
        // auto-responding here too raced it with a second, less-formatted toolResponse for the same
        // call.id, degrading library answers and destabilizing the turn-taking/interrupt state.
        if (isHardware && parsed.toolCall?.functionCalls) {
          for (const call of parsed.toolCall.functionCalls) {
            if (call.name === 'searchLibrary') {
              console.log(`${tag} 🔍 Executing searchLibrary RAG tool for client: "${call.args?.query}"`);
              executeHardwareRAGSearch(call.args?.query || '').then((contextText) => {
                if (gWs.readyState === WebSocket.OPEN) {
                  gWs.send(JSON.stringify({
                    toolResponse: {
                      functionResponses: [{
                        response: { output: { text: contextText } },
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
                        response: { output: { text: "Search failed: " + err.message } },
                        id: call.id
                      }]
                    }
                  }));
                }
              });
            } else if (call.name === 'noWakeDetected' || call.name === 'endConversation') {
              // Both are pure signals to the DEVICE, not data Gemini needs back beyond
              // the usual ack - the hardware client is what actually needs to know,
              // so it can silently drop out of STATE_VERIFYING (noWakeDetected) or
              // mark the conversation closed once the farewell reply finishes
              // (endConversation). See handleFrame() in main.cpp.
              console.log(`${tag} 🔔 ${call.name} tool call from Gemini - forwarding to hardware client`);
              if (isHardware && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ [call.name]: true }));
              }
              if (gWs.readyState === WebSocket.OPEN) {
                gWs.send(JSON.stringify({
                  toolResponse: {
                    functionResponses: [{
                      response: { output: { status: 'acknowledged' } },
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
              if (isHardware && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ setEmotion: emotion }));
              }
              if (gWs.readyState === WebSocket.OPEN) {
                gWs.send(JSON.stringify({
                  toolResponse: {
                    functionResponses: [{
                      response: { output: { status: 'acknowledged' } },
                      id: call.id
                    }]
                  }
                }));
              }
            } else {
              if (gWs.readyState === WebSocket.OPEN) {
                gWs.send(JSON.stringify({
                  toolResponse: {
                    functionResponses: [{
                      response: { output: { status: 'acknowledged' } },
                      id: call.id
                    }]
                  }
                }));
              }
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
              const subChunk = parsedAudioBytes.subarray(i, i + CHUNK_SIZE);
              ws.send(subChunk, { binary: true });
            }
          }
          // Forward lightweight text snippet if available:
          if (parsed?.serverContent?.modelTurn?.parts) {
            for (const part of parsed.serverContent.modelTurn.parts) {
              if (part.text) {
                ws.send(JSON.stringify({ text: part.text }));
              }
            }
          }
          if (parsed?.setupComplete) {
            ws.send(JSON.stringify({ setupComplete: {} }));
          }
          if (parsed?.serverContent?.turnComplete) {
            ws.send(JSON.stringify({ turnComplete: true }));
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
        fs.appendFileSync(path.join(__dirname, 'live_proxy_debug.log'),
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
            fs.appendFileSync(path.join(__dirname, 'live_proxy_debug.log'),
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
        console.log(`${tag} Gracefully handling code ${code} from Gemini. Keeping client socket open and preparing seamless upstream reconnect.`);
        currentGeminiWs = null;
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
      console.error(`${tag} Gemini Live WebSocket error:`, err.message);
      try {
        fs.appendFileSync(path.join(__dirname, 'live_proxy_debug.log'),
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

  ws.on('message', (message, isBinary) => {
    // Hardware firmware debug telemetry ({"debug":"..."}) - log only, never
    // forward to Gemini (it would reject these as malformed clientContent).
    if (!isBinary) {
      try {
        const maybeDebug = JSON.parse(message.toString());
        if (typeof maybeDebug.debug === 'string') {
          console.log(`${tag} [DEBUG] ${maybeDebug.debug}`);
          // Was console-only until now, so this telemetry (mic RMS during
          // SPEAKING, mute-transition decisions, etc.) was lost as soon as
          // the console scrollback rolled over - persisting it lets a
          // playback-cutoff reproduction be analysed afterward instead of
          // needing to watch the live console at the exact moment it happens.
          try {
            fs.appendFileSync(path.join(__dirname, 'live_proxy_debug.log'),
              `[${new Date().toISOString()}] ${tag} DEVICE DEBUG: ${maybeDebug.debug}\n`);
          } catch (_) { }
          return;
        }
      } catch (_) { }
    }

    const gWs = ensureGeminiSocket();

    // In ws library, message is ALWAYS a Buffer. ONLY isBinary indicates an opcode 0x02 binary frame.
    if (isBinary) {
      ws.isHardwareClient = true;
      if (isHardware) micAudioChunks.push(Buffer.from(message));

      // Acoustic echo barge-in protection:
      // While Gemini is actively outputting speech audio (or within 1500ms of the last chunk),
      // suppress forwarding mic audio to Gemini so Google's server-side VAD does not hear the speaker
      // output and abort the turn with GEMINI INTERRUPTED.
      // 1500ms matches the speaker cooldown window used in the firmware (isSpeakerCoolingDown),
      // ensuring the proxy-side suppression stays in sync with when the physical speaker
      // has actually gone silent and mic feedback has decayed. A shorter window (800ms) was
      // insufficient — residual speaker output was leaking into the mic and causing Gemini to
      // barge-in and close the turn early (mid-sentence) with code=1000.
      // Automatically unblocks 1500ms after Gemini stops speaking, ensuring wake words and user
      // queries are never locked out.
      const isModelSpeakingNow = (Date.now() - lastModelAudioTime < 1500);
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
          fs.appendFileSync(path.join(__dirname, 'live_proxy_debug.log'),
            `[${new Date().toISOString()}] ${tag} ECHO SUPPRESSION LIFTED: dropped ${suppressedMicFrameCount} mic frames (device believed it was muted/not-listening for this whole window)\n`);
        } catch (_) { }
        suppressedMicFrameCount = 0;
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
            const hardwareDefaults = getHardwareSetupPayload();
            parsed.setup.tools = hardwareDefaults.setup.tools;
            parsed.setup.systemInstruction = hardwareDefaults.setup.systemInstruction;
            msgStr = JSON.stringify(parsed);
            console.log(`${tag} 🔧 Augmented hardware setup handshake with searchLibrary/noWakeDetected/endConversation tools and wake-phrase-gated system prompt`);
          }
          cachedSetupMsg = msgStr;
          console.log(`${tag} Cached setup handshake for resilient reconnection.`);
        }
      } catch (_) { }

      console.log(`${tag} Forwarding control message:`, msgStr);
      try {
        fs.appendFileSync(path.join(__dirname, 'live_proxy_debug.log'),
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
    flushMicWavToDisk();
    flushWavToDisk();
    clearInterval(micFlushInterval);
    clearInterval(geminiFlushInterval);
    const reasonStr = reason ? reason.toString() : '';
    console.log(`${tag} Client closed connection: ${code} - ${reasonStr}`);
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
      if (currentGeminiWs && (currentGeminiWs.readyState === WebSocket.OPEN || currentGeminiWs.readyState === WebSocket.CONNECTING)) {
        currentGeminiWs.close(1011, 'Client socket error');
      }
    } catch (closeErr) {
      console.error(`${tag} Error closing Gemini ws after client error:`, closeErr.message);
    }
  });
}

browserWss.on('connection', (ws) => handleLiveProxyConnection(ws, false));
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

class HardwareTcpClient extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.readyState = HardwareTcpClient.OPEN;
    this._closed = false;
    this._buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => this._finishClose(1006, ''));
    socket.on('error', (err) => this.emit('error', err));
  }

  _onData(chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk]);
    // A single TCP chunk can contain multiple frames, or a partial one -
    // drain every complete frame currently buffered, then wait for more.
    while (this._buffer.length >= 5) {
      const type = this._buffer[0];
      const len = this._buffer.readUInt32BE(1);
      if (this._buffer.length < 5 + len) break;
      const payload = this._buffer.subarray(5, 5 + len);
      this._buffer = this._buffer.subarray(5 + len);
      this.emit('message', Buffer.from(payload), type === 1);
    }
  }

  send(data, opts) {
    if (this.readyState !== HardwareTcpClient.OPEN) return;
    const isBinary = Buffer.isBuffer(data) || !!(opts && opts.binary);
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
    const header = Buffer.alloc(5);
    header[0] = isBinary ? 1 : 0;
    header.writeUInt32BE(payload.length, 1);
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
const debugMicServer = http.createServer((req, res) => {
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

