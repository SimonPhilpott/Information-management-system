import db from '../db/database.js';
import { addIdea } from './devIdeasService.js';

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

let latestTelemetry = {
  deviceId: 'esp32-s3-box-3',
  rssi: -62,
  freeHeap: 4194304,
  minFreeHeap: 3950000,
  intFreeHeap: 184320,
  uptimeSec: 3600,
  reconnectCount: 0,
  audioUnderruns: 0,
  lastError: null,
  updatedAt: Date.now()
};

let previousUptime = 0;
let previousReconnectCount = 0;
let lastAutoDevIdeaTime = 0;

/**
 * Ingests a telemetry snapshot from the ESP32-S3-BOX-3 or simulation
 */
export function recordDeviceTelemetry(data = {}) {
  const now = Date.now();
  const rssi = Number.isFinite(data.rssi) ? Number(data.rssi) : -65;
  const freeHeap = Number.isFinite(data.freeHeap) ? Number(data.freeHeap) : (data.heap || 4194304);
  const minFreeHeap = Number.isFinite(data.minFreeHeap) ? Number(data.minFreeHeap) : (data.minHeap || freeHeap);
  const intFreeHeap = Number.isFinite(data.intFreeHeap) ? Number(data.intFreeHeap) : (data.intHeap || 180000);
  const uptimeSec = Number.isFinite(data.uptimeSec) ? Number(data.uptimeSec) : Math.floor(process.uptime());
  const reconnectCount = Number.isFinite(data.reconnectCount) ? Number(data.reconnectCount) : 0;
  const audioUnderruns = Number.isFinite(data.audioUnderruns) ? Number(data.audioUnderruns) : 0;
  const lastError = data.lastError ? String(data.lastError) : null;
  const deviceId = data.deviceId || 'esp32-s3-box-3';

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
    deviceId,
    rssi,
    freeHeap,
    minFreeHeap,
    intFreeHeap,
    uptimeSec,
    reconnectCount,
    audioUnderruns,
    lastError,
    updatedAt: now
  };

  try {
    db.prepare(`
      INSERT INTO device_health_telemetry (
        device_id, rssi, free_heap, min_free_heap, int_free_heap, uptime_sec, reconnect_count, audio_underruns, last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(deviceId, rssi, freeHeap, minFreeHeap, intFreeHeap, uptimeSec, reconnectCount, audioUnderruns, lastError);
  } catch (err) {
    console.warn('[DeviceHealth] Failed to insert telemetry:', err.message);
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

  // If database is fresh, populate with live latest values
  const current = {
    ...latestTelemetry,
    isOnline: (Date.now() - latestTelemetry.updatedAt) < 3 * 60 * 1000,
    rssiRating: latestTelemetry.rssi >= -60 ? 'Excellent' : latestTelemetry.rssi >= -75 ? 'Good' : 'Fair',
    heapKb: Math.round(latestTelemetry.freeHeap / 1024),
    minHeapKb: Math.round(latestTelemetry.minFreeHeap / 1024),
    intHeapKb: Math.round(latestTelemetry.intFreeHeap / 1024)
  };

  return {
    current,
    history: history.map(h => ({
      timestamp: h.timestamp,
      rssi: h.rssi,
      freeHeapKb: Math.round(h.free_heap / 1024),
      minHeapKb: Math.round(h.min_free_heap / 1024),
      intHeapKb: Math.round(h.int_free_heap / 1024),
      uptimeSec: h.uptime_sec,
      reconnectCount: h.reconnect_count,
      audioUnderruns: h.audio_underruns,
      lastError: h.last_error
    }))
  };
}
