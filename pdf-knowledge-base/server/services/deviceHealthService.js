import db from '../db/database.js';
import { addIdea } from './devIdeasService.js';
import { getFirmwareStatus, buildFirmware, flashFirmwareOta } from './firmwareService.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const FIRMWARE_DIR = path.join(PROJECT_ROOT, 'firmware', 'esp32-s3-box-3');
const PIO_EXE = path.join(process.env.USERPROFILE || 'C:\\Users\\sideb', '.platformio', 'penv', 'Scripts', 'pio.exe');

// Initialise device_health_telemetry SQLite table
db.exec(`
  CREATE TABLE IF NOT EXISTS device_health_telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    device_id TEXT DEFAULT 'esp32-s3-box-3',
    rssi INTEGER,
    free_heap INTEGER,
    min_free_heap INTEGER,
    int_free_heap INTEGER,
    uptime_sec INTEGER,
    reconnect_count INTEGER,
    audio_underruns INTEGER,
    last_error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_device_health_timestamp ON device_health_telemetry(timestamp);
`);

// In-memory Log Ring Buffer (Defensive Invariant 10: strictly bounded at 2,000 entries)
const MAX_LOG_ENTRIES = 2000;
let logRingBuffer = [];
let logSequence = 0;
const sseClients = new Set();

/**
 * Appends a log line to the in-memory ring buffer and broadcasts to active SSE clients
 */
export function appendLog(type = 'device', line = '') {
  if (!line || typeof line !== 'string') return;
  const entry = {
    id: ++logSequence,
    timestamp: new Date().toISOString(),
    type: type.toLowerCase(), // 'build' | 'ota' | 'device' | 'server'
    line: line.trim()
  };

  logRingBuffer.push(entry);
  if (logRingBuffer.length > MAX_LOG_ENTRIES) {
    logRingBuffer.shift(); // FIFO pruning
  }

  // Push to SSE subscribers
  const payload = `data: ${JSON.stringify(entry)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (_) {
      sseClients.delete(client);
    }
  }
}

/**
 * Registers an HTTP response stream as an SSE client
 */
export function subscribeLogs(res) {
  sseClients.add(res);
  // Send back the last 100 entries immediately as backlog
  const backlog = logRingBuffer.slice(-100);
  for (const entry of backlog) {
    try {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    } catch (_) {
      sseClients.delete(res);
      break;
    }
  }
}

/**
 * Removes an SSE client
 */
export function unsubscribeLogs(res) {
  sseClients.delete(res);
}

/**
 * Returns filtered historical logs from the ring buffer
 */
export function getLogs(filter = 'all', limit = 500) {
  const normFilter = filter.toLowerCase();
  let items = logRingBuffer;
  if (normFilter !== 'all') {
    items = items.filter((item) => item.type === normFilter);
  }
  return items.slice(-limit);
}

const STATE_NAMES = {
  0: 'STANDBY',
  1: 'VERIFYING',
  2: 'LISTENING',
  3: 'THINKING',
  4: 'SPEAKING',
  5: 'STREAMING_MIC',
  6: 'PLAYBACK_ACTIVE'
};

let latestTelemetry = {
  deviceId: 'esp32-s3-box-3',
  rssi: -62,
  freeHeap: 4194304,
  minFreeHeap: 3950000,
  intFreeHeap: 184320,
  intMinFreeHeap: 175000,
  uptimeSec: 3600,
  reconnectCount: 0,
  audioUnderruns: 0,
  lastError: null,
  ipAddress: '192.168.1.92',
  isSocketOpen: true,
  deviceState: 0,
  deviceStateName: 'STANDBY',
  wakeVerified: false,
  micMuted: false,
  speakerActive: false,
  isRecordingActive: false,
  cameraStatus: 'standby',
  geminiState: 'idle',
  bootCount: 1,
  resetReason: 'Software / Power On',
  updatedAt: Date.now()
};

let previousUptime = 0;
let previousReconnectCount = 0;
let lastAutoDevIdeaTime = 0;
let activeSocketSender = null; // hook to send control messages directly to hardware socket

export function setHardwareSocketSender(senderFn) {
  activeSocketSender = typeof senderFn === 'function' ? senderFn : null;
}

/**
 * Ingests a telemetry snapshot from the ESP32-S3-BOX-3 or simulation
 */
export function recordDeviceTelemetry(data = {}) {
  const now = Date.now();
  const rssi = Number.isFinite(data.rssi) ? Number(data.rssi) : (latestTelemetry.rssi || -65);
  const freeHeap = Number.isFinite(data.freeHeap) ? Number(data.freeHeap) : (data.heap || latestTelemetry.freeHeap || 4194304);
  const minFreeHeap = Number.isFinite(data.minFreeHeap) ? Number(data.minFreeHeap) : (data.minHeap || freeHeap);
  const intFreeHeap = Number.isFinite(data.intFreeHeap) ? Number(data.intFreeHeap) : (data.intHeap || latestTelemetry.intFreeHeap || 180000);
  const intMinFreeHeap = Number.isFinite(data.intMinFreeHeap) ? Number(data.intMinFreeHeap) : (data.intMin || minFreeHeap);
  const uptimeSec = Number.isFinite(data.uptimeSec) ? Number(data.uptimeSec) : latestTelemetry.uptimeSec;
  const reconnectCount = Number.isFinite(data.reconnectCount) ? Number(data.reconnectCount) : latestTelemetry.reconnectCount;
  const audioUnderruns = Number.isFinite(data.audioUnderruns) ? Number(data.audioUnderruns) : (data.audioBufferUnderruns || latestTelemetry.audioUnderruns);
  const lastError = data.lastError != null ? String(data.lastError) : latestTelemetry.lastError;
  const deviceId = data.deviceId || latestTelemetry.deviceId || 'esp32-s3-box-3';
  const ipAddress = data.ipAddress || (data.ip ? String(data.ip) : latestTelemetry.ipAddress);
  const isSocketOpen = data.isSocketOpen !== undefined ? Boolean(data.isSocketOpen) : latestTelemetry.isSocketOpen;

  const rawState = Number.isFinite(data.state) ? Number(data.state) : latestTelemetry.deviceState;
  const deviceStateName = STATE_NAMES[rawState] || data.deviceStateName || latestTelemetry.deviceStateName;

  // Check for reboot spike (uptime dropped) or reconnect spike
  const isRebootDetected = previousUptime > 120 && uptimeSec < 30;
  const isReconnectSpike = reconnectCount > previousReconnectCount + 2;

  if ((isRebootDetected || isReconnectSpike) && (now - lastAutoDevIdeaTime > 15 * 60 * 1000)) {
    lastAutoDevIdeaTime = now;
    const reason = isRebootDetected
      ? `Box-3 unexpected reboot detected (uptime reset from ${previousUptime}s to ${uptimeSec}s)`
      : `Box-3 reconnect spike detected (${reconnectCount} reconnects in short interval, RSSI: ${rssi} dBm, free heap: ${Math.round(freeHeap / 1024)} KB)`;
    
    try {
      addIdea({
        text: `[Device Health Watchdog] ${reason}. Check Wi-Fi signal attenuation, socket timeouts, or internal RAM fragmentation.`,
        category: 'IMS Hardware',
        source: 'device_health_watchdog'
      });
      console.log('[DeviceHealth] Automatically logged dev idea for hardware anomaly:', reason);
    } catch (e) {
      console.warn('[DeviceHealth] Failed to auto-log dev idea:', e.message);
    }
  }

  previousUptime = uptimeSec;
  previousReconnectCount = reconnectCount;

  latestTelemetry = {
    ...latestTelemetry,
    deviceId,
    rssi,
    freeHeap,
    minFreeHeap,
    intFreeHeap,
    intMinFreeHeap,
    uptimeSec,
    reconnectCount,
    audioUnderruns,
    lastError,
    ipAddress,
    isSocketOpen,
    deviceState: rawState,
    deviceStateName,
    wakeVerified: data.wakeVerified !== undefined ? Boolean(data.wakeVerified) : latestTelemetry.wakeVerified,
    micMuted: data.micMuted !== undefined ? Boolean(data.micMuted) : latestTelemetry.micMuted,
    speakerActive: data.speakerActive !== undefined ? Boolean(data.speakerActive) : latestTelemetry.speakerActive,
    isRecordingActive: data.isRecordingActive !== undefined ? Boolean(data.isRecordingActive) : latestTelemetry.isRecordingActive,
    cameraStatus: data.cameraStatus || latestTelemetry.cameraStatus,
    geminiState: data.geminiState || latestTelemetry.geminiState,
    bootCount: data.bootCount || latestTelemetry.bootCount,
    resetReason: data.resetReason || latestTelemetry.resetReason,
    updatedAt: now
  };

  // Throttle database inserts to once every 30 seconds to prevent SQLite bloat
  const lastDbInsert = latestTelemetry._lastDbInsert || 0;
  if (now - lastDbInsert >= 30000) {
    latestTelemetry._lastDbInsert = now;
    try {
      db.prepare(`
        INSERT INTO device_health_telemetry (
          device_id, rssi, free_heap, min_free_heap, int_free_heap, uptime_sec, reconnect_count, audio_underruns, last_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(deviceId, rssi, freeHeap, minFreeHeap, intFreeHeap, uptimeSec, reconnectCount, audioUnderruns, lastError);
    } catch (err) {
      console.warn('[DeviceHealth] Failed to insert telemetry:', err.message);
    }
  }

  return latestTelemetry;
}

/**
 * Returns latest device health summary and historical sparkline points
 */
export function getDeviceHealthSummary(hours = 24) {
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  
  const history = db.prepare(`
    SELECT timestamp, rssi, free_heap, min_free_heap, int_free_heap, uptime_sec, reconnect_count, audio_underruns, last_error
    FROM device_health_telemetry
    WHERE timestamp >= ?
    ORDER BY timestamp ASC
    LIMIT 288
  `).all(cutoff);

  const isOnline = latestTelemetry.isSocketOpen && (Date.now() - latestTelemetry.updatedAt < 90000);
  const firmware = getFirmwareStatus();

  // Subsystems Status Indicators Matrix
  const subsystems = [
    {
      id: 'connection',
      name: 'Wireless Connection',
      status: isOnline ? 'online' : 'offline',
      color: isOnline ? '#10b981' : '#f43f5e',
      badge: isOnline ? 'ONLINE' : 'OFFLINE',
      detail: isOnline ? (latestTelemetry.ipAddress ? `IP: ${latestTelemetry.ipAddress}` : 'Connected') : 'Socket Disconnected'
    },
    {
      id: 'firmware',
      name: 'Firmware Engine',
      status: 'ready',
      color: '#38bdf8',
      badge: firmware.builtVersion.slice(0, 14),
      detail: `Binary: ${(firmware.binary.size / 1024 / 1024).toFixed(2)} MB`
    },
    {
      id: 'ota',
      name: 'OTA State',
      status: firmware.otaState.status,
      color: firmware.otaState.status === 'flashing' ? '#06b6d4' : firmware.otaState.status === 'building' ? '#eab308' : '#10b981',
      badge: firmware.otaState.status.toUpperCase(),
      detail: firmware.otaState.message || 'Ready for Wi-Fi Update'
    },
    {
      id: 'deviceState',
      name: 'Device State',
      status: latestTelemetry.deviceStateName.toLowerCase(),
      color: latestTelemetry.deviceState === 4 ? '#a855f7' : latestTelemetry.deviceState === 2 ? '#06b6d4' : '#64748b',
      badge: latestTelemetry.deviceStateName,
      detail: `Mode Code ${latestTelemetry.deviceState}`
    },
    {
      id: 'wake',
      name: 'Wake Listener',
      status: latestTelemetry.wakeVerified ? 'verified' : 'running',
      color: latestTelemetry.wakeVerified ? '#10b981' : '#0ea5e9',
      badge: latestTelemetry.wakeVerified ? 'VERIFIED' : 'READY',
      detail: 'Precision Wake Gating'
    },
    {
      id: 'mic',
      name: 'Microphone & Speaker',
      status: latestTelemetry.micMuted ? 'muted' : 'live',
      color: latestTelemetry.micMuted ? '#f43f5e' : '#10b981',
      badge: latestTelemetry.micMuted ? 'MIC MUTED' : 'MIC ACTIVE',
      detail: latestTelemetry.speakerActive ? 'Speaker Playing' : 'PA Idle'
    },
    {
      id: 'recording',
      name: 'Audio Recording Mode',
      status: latestTelemetry.isRecordingActive ? 'recording' : 'idle',
      color: latestTelemetry.isRecordingActive ? '#f43f5e' : '#64748b',
      badge: latestTelemetry.isRecordingActive ? 'RECORDING' : 'IDLE',
      detail: 'Full Mic Stream Preservation'
    },
    {
      id: 'camera',
      name: 'Webcam (Dock C270)',
      status: latestTelemetry.cameraStatus,
      color: latestTelemetry.cameraStatus === 'streaming' ? '#10b981' : '#64748b',
      badge: (latestTelemetry.cameraStatus || 'STANDBY').toUpperCase(),
      detail: 'USB-A UVC Host Driver'
    },
    {
      id: 'gemini',
      name: 'Gemini Live Session',
      status: latestTelemetry.geminiState,
      color: latestTelemetry.geminiState === 'active' ? '#10b981' : latestTelemetry.geminiState === 'error' ? '#f43f5e' : '#64748b',
      badge: (latestTelemetry.geminiState || 'IDLE').toUpperCase(),
      detail: 'Bidirectional Audio Proxy'
    },
    {
      id: 'crashWatchdog',
      name: 'Crash Watchdog',
      status: 'nominal',
      color: '#10b981',
      badge: 'NORMAL',
      detail: latestTelemetry.resetReason || 'Clean Boot'
    }
  ];

  const current = {
    ...latestTelemetry,
    isOnline,
    rssiRating: latestTelemetry.rssi >= -60 ? 'Excellent' : latestTelemetry.rssi >= -75 ? 'Good' : 'Fair',
    heapKb: Math.round(latestTelemetry.freeHeap / 1024),
    minHeapKb: Math.round(latestTelemetry.minFreeHeap / 1024),
    intHeapKb: Math.round(latestTelemetry.intFreeHeap / 1024),
    intMinHeapKb: Math.round(latestTelemetry.intMinFreeHeap / 1024),
    lastReportSecondsAgo: Math.max(0, Math.floor((Date.now() - latestTelemetry.updatedAt) / 1000))
  };

  const sparklines = {
    wifiRssi: history.map((h) => h.rssi).slice(-30),
    freeHeap: history.map((h) => Math.round(h.free_heap / 1024)).slice(-30),
    uptimeSeconds: history.map((h) => h.uptime_sec).slice(-30),
    reconnectCount: history.map((h) => h.reconnect_count).slice(-30)
  };

  return {
    latest: {
      wifiRssi: current.rssi,
      freeHeap: current.freeHeap,
      minFreeHeap: current.minFreeHeap,
      psramFreeHeap: current.freeHeap,
      uptimeSeconds: current.uptimeSec,
      reconnectCount: current.reconnectCount,
      audioBufferUnderruns: current.audioUnderruns,
      lastError: current.lastError,
      ipAddress: current.ipAddress,
      bootCount: current.bootCount,
      resetReason: current.resetReason
    },
    current,
    subsystems,
    firmware,
    sparklines,
    isOnline,
    lastReportSecondsAgo: current.lastReportSecondsAgo,
    history: history.map((h) => ({
      timestamp: h.timestamp,
      wifiRssi: h.rssi,
      freeHeap: h.free_heap,
      minFreeHeap: h.min_free_heap,
      uptimeSeconds: h.uptime_sec,
      reconnectCount: h.reconnect_count,
      audioBufferUnderruns: h.audio_underruns,
      lastError: h.last_error
    }))
  };
}

/**
 * Handles terminal management command dispatch
 */
export async function executeDeviceCommand(cmdString = '') {
  const parts = cmdString.trim().split(/\s+/);
  const action = parts[0]?.toLowerCase();
  const arg = parts[1]?.toLowerCase();

  appendLog('server', `[COMMAND INGESTED] $ ${cmdString}`);

  switch (action) {
    case 'build':
      buildFirmware().catch((err) => console.error('[Command] Build error:', err.message));
      return { success: true, message: 'PlatformIO firmware build initiated. Watch terminal output.' };

    case 'update':
    case 'ota':
      flashFirmwareOta({
        targetIp: latestTelemetry.ipAddress || '192.168.1.92'
      }).catch((err) => console.error('[Command] Flash OTA error:', err.message));
      return { success: true, message: `Wi-Fi OTA update started targeting ${latestTelemetry.ipAddress || '192.168.1.92'}:3232.` };

    case 'status':
      return {
        success: true,
        summary: getDeviceHealthSummary()
      };

    case 'reboot':
      if (activeSocketSender) {
        activeSocketSender(JSON.stringify({ reboot: true }));
        appendLog('server', '[Command] Dispatched {"reboot":true} to connected Box-3.');
        return { success: true, message: 'Reboot command sent to ESP32-S3-BOX-3.' };
      }
      throw new Error('No active Box-3 TCP client connected to dispatch reboot.');

    case 'heap':
      return {
        success: true,
        heap: {
          freeHeap: latestTelemetry.freeHeap,
          minFreeHeap: latestTelemetry.minFreeHeap,
          intFreeHeap: latestTelemetry.intFreeHeap,
          intMinFreeHeap: latestTelemetry.intMinFreeHeap
        }
      };

    case 'camera':
      if (arg === 'on' || arg === 'off') {
        const enable = arg === 'on';
        if (activeSocketSender) {
          activeSocketSender(JSON.stringify({ camera: { enable } }));
          appendLog('server', `[Command] Dispatched camera ${arg} to Box-3.`);
          latestTelemetry.cameraStatus = enable ? 'streaming' : 'standby';
          return { success: true, message: `Camera command (${arg}) dispatched.` };
        }
        throw new Error('No active Box-3 TCP client connected.');
      }
      throw new Error('Usage: camera on | camera off');

    case 'flash':
      if (arg === 'usb') {
        appendLog('build', '--- Initiating USB Cable Flash (COM3 Fallback) ---');
        const child = spawn(
          PIO_EXE,
          ['run', '-d', FIRMWARE_DIR, '-e', 'esp32s3box', '-t', 'upload', '--upload-port', 'COM3'],
          {
            cwd: FIRMWARE_DIR,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
            shell: true
          }
        );
        child.stdout.on('data', (c) => appendLog('build', c.toString('utf-8')));
        child.stderr.on('data', (c) => appendLog('build', `[STDERR] ${c.toString('utf-8')}`));
        return { success: true, message: 'USB flash on COM3 initiated.' };
      }
      throw new Error('Usage: flash usb');

    default:
      throw new Error(`Unknown command: "${cmdString}". Allowed: build, update, status, reboot, heap, camera on|off, flash usb`);
  }
}
