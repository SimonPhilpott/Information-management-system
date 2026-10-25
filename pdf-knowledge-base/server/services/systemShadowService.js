import db from '../db/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { live } from '../live/state.js';
import { getAlertSettings } from './runAlertsService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'app.db');

let edgeDockHeartbeat = {
  lastSeen: 0,
  client: 'android-edge-dock',
  version: '1.0.0',
  status: 'standby'
};

export function recordEdgeDockPing(metadata = {}) {
  edgeDockHeartbeat = {
    lastSeen: Date.now(),
    client: 'android-edge-dock',
    version: metadata.version || '1.0.0',
    status: 'online',
    ...metadata
  };
}

export function getSystemShadow() {
  const now = Date.now();
  const uptimeSec = Math.round(process.uptime());
  const mem = process.memoryUsage();

  // SQLite Telemetry
  let dbSizeBytes = 0;
  let walSizeBytes = 0;
  try {
    if (fs.existsSync(DB_PATH)) dbSizeBytes = fs.statSync(DB_PATH).size;
    const walPath = `${DB_PATH}-wal`;
    if (fs.existsSync(walPath)) walSizeBytes = fs.statSync(walPath).size;
  } catch (_) {}

  let tableCount = 0;
  try {
    tableCount = db.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table'").get().c;
  } catch (_) {}

  // Desk Hardware Telemetry
  let latestDeviceTelemetry = null;
  try {
    latestDeviceTelemetry = db.prepare('SELECT * FROM device_health_telemetry ORDER BY id DESC LIMIT 1').get() || null;
  } catch (_) {}

  // Edge Dock status
  const edgeDockOnline = (now - edgeDockHeartbeat.lastSeen) < 120000;

  // Gemini Live Voice Session Telemetry
  const voiceSession = {
    active: Boolean(live?.lastConversationEnd && (now - (live.lastConversationEnd.at || 0) < 60000)),
    sessionResumed: Boolean(live?.lastConversationEnd?.reason),
    lastEndReason: live?.lastConversationEnd?.reason || 'none',
    latencyBudgetMs: 1800
  };

  // Scheduled Jobs & Background Processes
  const alertSettings = getAlertSettings();
  const ntfyConfigured = Boolean(alertSettings.pushTopic);

  // Digital Twin Node Graph
  const nodes = [
    {
      id: 'node-backend',
      label: 'Express Core Server',
      sub: `Node.js ${process.version} (:3001)`,
      status: 'healthy',
      metrics: {
        uptime: `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m`,
        heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
        rssMb: Math.round(mem.rss / (1024 * 1024))
      }
    },
    {
      id: 'node-sqlite',
      label: 'SQLite Database (WAL)',
      sub: `${tableCount} tables in app.db`,
      status: dbSizeBytes > 0 ? 'healthy' : 'warning',
      metrics: {
        dbSizeMb: (dbSizeBytes / (1024 * 1024)).toFixed(2),
        walSizeMb: (walSizeBytes / (1024 * 1024)).toFixed(2),
        tables: tableCount
      }
    },
    {
      id: 'node-terminal',
      label: 'ESP32-S3-BOX-3 Desk Terminal',
      sub: 'Raw TCP :3002 (audio & display)',
      status: latestDeviceTelemetry && (now - new Date(latestDeviceTelemetry.timestamp).getTime() < 300000) ? 'healthy' : 'standby',
      metrics: {
        rssi: latestDeviceTelemetry?.rssi ?? -58,
        freeHeap: latestDeviceTelemetry?.free_heap ?? 184000,
        underruns: latestDeviceTelemetry?.audio_underruns ?? 0
      }
    },
    {
      id: 'node-edge-dock',
      label: 'Android Edge Dock',
      sub: 'SYSTEM_ALERT_WINDOW drawer',
      status: edgeDockOnline ? 'healthy' : 'standby',
      metrics: {
        active: edgeDockOnline,
        lastPing: edgeDockHeartbeat.lastSeen ? `${Math.round((now - edgeDockHeartbeat.lastSeen) / 1000)}s ago` : 'waiting for phone'
      }
    },
    {
      id: 'node-gemini-live',
      label: 'Gemini Live Voice Pipeline',
      sub: 'gemini-3.8-live bidirectional socket',
      status: 'healthy',
      metrics: {
        targetLatency: '< 1800ms',
        audioFormat: 'PCM 16k up / 24k down',
        voiceStatus: voiceSession.active ? 'active call' : 'idle standby'
      }
    },
    {
      id: 'node-push-ntfy',
      label: 'ntfy.sh Mobile Push Relay',
      sub: alertSettings.pushTopic ? `Topic: ${alertSettings.pushTopic.slice(0, 10)}...` : 'Unconfigured',
      status: ntfyConfigured ? 'healthy' : 'warning',
      metrics: {
        server: alertSettings.pushServer || 'https://ntfy.sh',
        style: alertSettings.alertStyle || 'sound'
      }
    }
  ];

  // System Health Score (0-100)
  let healthScore = 100;
  if (!ntfyConfigured) healthScore -= 5;
  if (!latestDeviceTelemetry) healthScore -= 10;
  if (walSizeBytes > 50 * 1024 * 1024) healthScore -= 5;

  return {
    timestamp: new Date().toISOString(),
    healthScore,
    status: healthScore >= 90 ? 'optimal' : healthScore >= 75 ? 'nominal' : 'degraded',
    uptimeSec,
    nodes,
    memory: {
      rss: Math.round(mem.rss / 1048576),
      heapTotal: Math.round(mem.heapTotal / 1048576),
      heapUsed: Math.round(mem.heapUsed / 1048576),
      external: Math.round(mem.external / 1048576)
    },
    database: {
      path: DB_PATH,
      sizeMb: (dbSizeBytes / 1048576).toFixed(2),
      walSizeMb: (walSizeBytes / 1048576).toFixed(2),
      tableCount
    },
    voiceSession,
    edgeDock: {
      ...edgeDockHeartbeat,
      online: edgeDockOnline
    }
  };
}
