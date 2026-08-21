import express from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
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
});

// WebSocket Server for Gemini Live Proxy
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (pathname === '/api/live') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  console.log('[LiveProxy] Client connected');
  
  const apiKey = process.env.GEMINI_API_KEY || config.gemini?.apiKey;
  if (!apiKey) {
    console.error('[LiveProxy] Gemini API key not found in environment');
    ws.close(1011, 'Gemini API key not configured on server');
    return;
  }

  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
  const geminiWs = new WebSocket(geminiUrl);

  // Message queue for outbound messages to Gemini while connection is opening
  const outboundQueue = [];

  geminiWs.on('open', () => {
    console.log('[LiveProxy] Connected to Gemini Live');
    // Flush queued messages
    while (outboundQueue.length > 0) {
      const msg = outboundQueue.shift();
      console.log('[LiveProxy] Flushing queued message to Gemini...');
      geminiWs.send(msg);
    }
  });

  geminiWs.on('message', (data) => {
    const msgStr = data.toString();
    try {
      const parsed = JSON.parse(msgStr);
      const keys = Object.keys(parsed);
      console.log('[LiveProxy] ← Gemini msg keys:', keys, '| client ws state:', ws.readyState, '(1=OPEN)');
    } catch (e) { /* non-JSON binary frame */ }

    if (ws.readyState === ws.OPEN) {
      ws.send(msgStr);
    } else {
      console.warn('[LiveProxy] ⚠️ Cannot forward to client — ws state:', ws.readyState);
    }
  });

  geminiWs.on('close', (code, reason) => {
    // Convert reason Buffer to string safely
    const reasonStr = reason ? reason.toString() : '';
    console.log(`[LiveProxy] Gemini Live closed connection: ${code} - ${reasonStr}`);
    try {
      // Code 1005 (no status) cannot be sent - remap to 1000 (normal closure)
      const safeCode = (code === 1005 || code === 1006) ? 1000 : code;
      if (ws.readyState === ws.OPEN) {
        ws.close(safeCode, reasonStr || 'Gemini session ended');
      }
    } catch (err) {
      console.error('[LiveProxy] Error closing client ws after Gemini closed:', err.message);
    }
  });

  geminiWs.on('error', (err) => {
    console.error('[LiveProxy] Gemini Live WebSocket error:', err.message);
    try {
      if (ws.readyState === ws.OPEN) ws.close(1011, 'Error communicating with Gemini');
    } catch (closeErr) {
      console.error('[LiveProxy] Error closing client ws after Gemini error:', closeErr.message);
    }
  });

  ws.on('message', (message) => {
    const msgStr = message.toString();
    if (msgStr.includes('realtimeInput')) {
      // Audio chunks: log periodically to avoid flood
      if (Math.random() < 0.05) {
        console.log('[LiveProxy] Forwarding audio stream chunks...');
      }
    } else {
      console.log('[LiveProxy] Forwarding non-audio control message:', msgStr.slice(0, 300));
    }
    if (geminiWs.readyState === geminiWs.OPEN) {
      geminiWs.send(msgStr);
    } else if (geminiWs.readyState === geminiWs.CONNECTING) {
      console.log('[LiveProxy] Queueing outbound message (Gemini connection is CONNECTING)...');
      outboundQueue.push(msgStr);
    } else {
      console.warn('[LiveProxy] Dropping message, Gemini socket state:', geminiWs.readyState);
    }
  });

  ws.on('close', (code, reason) => {
    const reasonStr = reason ? reason.toString() : '';
    console.log(`[LiveProxy] Client closed connection: ${code} - ${reasonStr}`);
    try {
      if (geminiWs.readyState === geminiWs.OPEN || geminiWs.readyState === geminiWs.CONNECTING) {
        // Code 1005 cannot be forwarded to ws library — use 1000
        const safeCode = (code === 1005 || code === 1006) ? 1000 : code;
        geminiWs.close(safeCode, reasonStr || 'Client disconnected');
      }
    } catch (err) {
      console.error('[LiveProxy] Error closing Gemini ws after client closed:', err.message);
    }
  });

  ws.on('error', (err) => {
    console.error('[LiveProxy] Client WebSocket error:', err.message);
    try {
      if (geminiWs.readyState === geminiWs.OPEN || geminiWs.readyState === geminiWs.CONNECTING) {
        geminiWs.close(1011, 'Client socket error');
      }
    } catch (closeErr) {
      console.error('[LiveProxy] Error closing Gemini ws after client error:', closeErr.message);
    }
  });
});
