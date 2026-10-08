import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import db from '../db/database.js';
import { appendLog } from './deviceHealthService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const FIRMWARE_DIR = path.join(PROJECT_ROOT, 'firmware', 'esp32-s3-box-3');
const BIN_PATH = path.join(FIRMWARE_DIR, '.pio', 'build', 'esp32s3box', 'firmware.bin');
const PIO_EXE = path.join(process.env.USERPROFILE || 'C:\\Users\\sideb', '.platformio', 'penv', 'Scripts', 'pio.exe');
const PYTHON_EXE = 'C:\\python312\\python.exe';
const ESPOTA_PY = path.join(
  process.env.USERPROFILE || 'C:\\Users\\sideb',
  '.platformio',
  'packages',
  'framework-arduinoespressif32',
  'tools',
  'espota.py'
);

// Database schema for OTA history
db.exec(`
  CREATE TABLE IF NOT EXISTS device_ota_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    version TEXT,
    ip TEXT,
    size_bytes INTEGER,
    sha256 TEXT,
    status TEXT,
    duration_sec REAL,
    error_message TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_ota_history_timestamp ON device_ota_history(timestamp);
`);

// In-memory state tracking
let activeBuild = null;
let activeFlash = null;
let currentOtaState = {
  status: 'idle', // 'idle' | 'building' | 'flashing' | 'done' | 'failed' | 'rolled_back'
  progress: 0,
  message: '',
  startedAt: null,
  completedAt: null,
  error: null
};

// Activity blocker callback hook (populated by server/index.js)
let activityCheckFn = () => ({ canUpdate: true, reason: null });

export function setOtaActivityCheck(fn) {
  if (typeof fn === 'function') {
    activityCheckFn = fn;
  }
}

/**
 * Computes SHA-256 and metadata for the built firmware binary
 */
export function getBinaryMetadata() {
  if (!fs.existsSync(BIN_PATH)) {
    return { exists: false, size: 0, sha256: null, mtime: null, version: 'unknown' };
  }
  try {
    const stats = fs.statSync(BIN_PATH);
    const buffer = fs.readFileSync(BIN_PATH);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const shortHash = hash.slice(0, 8);
    const version = `fw-${shortHash}-${new Date(stats.mtime).toISOString().slice(0, 10)}`;
    return {
      exists: true,
      size: stats.size,
      sha256: hash,
      shortHash,
      mtime: stats.mtime.toISOString(),
      version
    };
  } catch (err) {
    return { exists: false, error: err.message };
  }
}

/**
 * Returns current firmware & OTA status overview
 */
export function getFirmwareStatus() {
  const meta = getBinaryMetadata();
  const activity = activityCheckFn();
  const history = getOtaHistory(10);

  return {
    binary: meta,
    builtVersion: meta.version || 'none',
    otaState: currentOtaState,
    canUpdate: activity.canUpdate && currentOtaState.status !== 'building' && currentOtaState.status !== 'flashing',
    updateBlockedReason: currentOtaState.status === 'building'
      ? 'A firmware build is already in progress'
      : currentOtaState.status === 'flashing'
        ? 'A firmware flash is already in progress'
        : activity.reason,
    history
  };
}

/**
 * Retrieves recent OTA flash history records
 */
export function getOtaHistory(limit = 10) {
  try {
    return db.prepare(`
      SELECT id, timestamp, version, ip, size_bytes, sha256, status, duration_sec, error_message
      FROM device_ota_history
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit);
  } catch (err) {
    console.error('[FirmwareService] Failed to query OTA history:', err.message);
    return [];
  }
}

/**
 * Initiates a PlatformIO compilation build
 */
export function buildFirmware() {
  if (activeBuild) {
    throw new Error('A firmware build is currently running.');
  }

  currentOtaState = {
    status: 'building',
    progress: 10,
    message: 'Compiling firmware via PlatformIO...',
    startedAt: Date.now(),
    completedAt: null,
    error: null
  };

  appendLog('build', '--- Starting PlatformIO Build (esp32s3box) ---');

  return new Promise((resolve, reject) => {
    const child = spawn(
      PIO_EXE,
      ['run', '-d', FIRMWARE_DIR, '-e', 'esp32s3box'],
      {
        cwd: FIRMWARE_DIR,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8'
        },
        shell: true
      }
    );

    activeBuild = child;

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf-8');
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      for (const line of lines) {
        appendLog('build', line);
        if (line.includes('Building in')) currentOtaState.progress = 25;
        else if (line.includes('Compiling')) currentOtaState.progress = Math.min(85, currentOtaState.progress + 2);
        else if (line.includes('Linking')) currentOtaState.progress = 90;
        else if (line.includes('Building .pio')) currentOtaState.progress = 95;
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf-8');
      appendLog('build', `[STDERR] ${text.trim()}`);
    });

    child.on('close', (code) => {
      activeBuild = null;
      if (code === 0) {
        const meta = getBinaryMetadata();
        currentOtaState = {
          status: 'idle',
          progress: 100,
          message: `Build completed successfully (${(meta.size / 1024 / 1024).toFixed(2)} MB)`,
          startedAt: currentOtaState.startedAt,
          completedAt: Date.now(),
          error: null
        };
        appendLog('build', `[SUCCESS] Firmware compiled cleanly. Output: ${BIN_PATH}`);
        resolve({ success: true, metadata: meta });
      } else {
        const errMsg = `PlatformIO build failed with exit code ${code}`;
        currentOtaState = {
          status: 'failed',
          progress: 0,
          message: errMsg,
          startedAt: currentOtaState.startedAt,
          completedAt: Date.now(),
          error: errMsg
        };
        appendLog('build', `[FAILED] ${errMsg}`);
        reject(new Error(errMsg));
      }
    });

    child.on('error', (err) => {
      activeBuild = null;
      currentOtaState = {
        status: 'failed',
        progress: 0,
        message: err.message,
        startedAt: currentOtaState.startedAt,
        completedAt: Date.now(),
        error: err.message
      };
      appendLog('build', `[ERROR] Process error: ${err.message}`);
      reject(err);
    });
  });
}

/**
 * Flashes the compiled binary over Wi-Fi using espota.py
 */
export function flashFirmwareOta(options = {}) {
  const targetIp = options.targetIp || '192.168.1.92';
  const hostIp = options.hostIp || '192.168.1.78';
  const targetPort = options.targetPort || 3232;

  const activity = activityCheckFn();
  if (!activity.canUpdate) {
    throw new Error(`OTA update blocked: ${activity.reason}`);
  }

  if (activeFlash) {
    throw new Error('An OTA update is already actively transferring.');
  }

  if (!fs.existsSync(BIN_PATH)) {
    throw new Error('Firmware binary not found. Please compile firmware first.');
  }

  const meta = getBinaryMetadata();
  const startTime = Date.now();

  currentOtaState = {
    status: 'flashing',
    progress: 0,
    message: `Connecting to ${targetIp}:${targetPort} over Wi-Fi...`,
    startedAt: startTime,
    completedAt: null,
    error: null
  };

  appendLog('ota', `--- Initiating Wi-Fi OTA Flash to ${targetIp}:${targetPort} ---`);
  appendLog('ota', `Binary: ${meta.size} bytes | SHA-256: ${meta.shortHash}`);

  return new Promise((resolve, reject) => {
    const child = spawn(
      PYTHON_EXE,
      [
        ESPOTA_PY,
        '-i', targetIp,
        '-I', hostIp,
        '-p', String(targetPort),
        '-f', BIN_PATH,
        '-d',
        '-r',
        '-t', '15'
      ],
      {
        cwd: FIRMWARE_DIR,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8'
        },
        shell: true
      }
    );

    activeFlash = child;

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf-8');
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      for (const line of lines) {
        appendLog('ota', line);
        // Track percentage regex: e.g. "Uploading: [====] 45%"
        const m = line.match(/(\d+)%/);
        if (m) {
          const pct = parseInt(m[1], 10);
          currentOtaState.progress = pct;
          currentOtaState.message = `Uploading: ${pct}%`;
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf-8');
      appendLog('ota', `[STDERR] ${text.trim()}`);
    });

    child.on('close', (code) => {
      activeFlash = null;
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

      if (code === 0) {
        currentOtaState = {
          status: 'done',
          progress: 100,
          message: `OTA upload complete in ${durationSec}s. Device rebooting into new slot...`,
          startedAt: startTime,
          completedAt: Date.now(),
          error: null
        };
        appendLog('ota', `[SUCCESS] 100% written in ${durationSec}s. Result: OK`);

        // Record in database
        try {
          db.prepare(`
            INSERT INTO device_ota_history (
              version, ip, size_bytes, sha256, status, duration_sec, error_message
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(meta.version, targetIp, meta.size, meta.sha256, 'SUCCESS', parseFloat(durationSec), null);
        } catch (dbErr) {
          console.warn('[FirmwareService] Failed to record OTA history:', dbErr.message);
        }

        resolve({ success: true, durationSec, version: meta.version });
      } else {
        const errDesc = `espota.py exited with error code ${code}`;
        currentOtaState = {
          status: 'failed',
          progress: currentOtaState.progress,
          message: errDesc,
          startedAt: startTime,
          completedAt: Date.now(),
          error: errDesc
        };
        appendLog('ota', `[FAILED] ${errDesc}`);

        try {
          db.prepare(`
            INSERT INTO device_ota_history (
              version, ip, size_bytes, sha256, status, duration_sec, error_message
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(meta.version, targetIp, meta.size, meta.sha256, 'FAILED', parseFloat(durationSec), errDesc);
        } catch (dbErr) {
          console.warn('[FirmwareService] Failed to record OTA failure in db:', dbErr.message);
        }

        reject(new Error(errDesc));
      }
    });

    child.on('error', (err) => {
      activeFlash = null;
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
      currentOtaState = {
        status: 'failed',
        progress: 0,
        message: err.message,
        startedAt: startTime,
        completedAt: Date.now(),
        error: err.message
      };
      appendLog('ota', `[ERROR] ${err.message}`);

      try {
        db.prepare(`
          INSERT INTO device_ota_history (
            version, ip, size_bytes, sha256, status, duration_sec, error_message
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(meta.version, targetIp, meta.size, meta.sha256, 'ERROR', parseFloat(durationSec), err.message);
      } catch (dbErr) {
        console.warn('[FirmwareService] Failed to record OTA error:', dbErr.message);
      }

      reject(err);
    });
  });
}
