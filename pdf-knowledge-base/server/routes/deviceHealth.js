import { Router } from 'express';
import {
  getDeviceHealthSummary,
  recordDeviceTelemetry,
  subscribeLogs,
  unsubscribeLogs,
  getLogs,
  executeDeviceCommand
} from '../services/deviceHealthService.js';
import { buildFirmware, flashFirmwareOta, getFirmwareStatus } from '../services/firmwareService.js';

const router = Router();

// GET /api/device-health - Full telemetry, subsystems matrix and firmware status
router.get('/', (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const summary = getDeviceHealthSummary(hours);
    res.json({ success: true, ...summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/device-health/report - Telemetry ingestion
router.post('/report', (req, res) => {
  try {
    const recorded = recordDeviceTelemetry(req.body || {});
    res.json({ success: true, telemetry: recorded });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/device-health/stream - Live Server-Sent Events (SSE) log & status stream
router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive'
  });

  res.write(': sse connected\n\n');
  subscribeLogs(res);

  // Keep-alive heartbeat every 15s to prevent reverse-proxy timeout (Defensive Invariant 6)
  const pingInterval = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (_) {
      clearInterval(pingInterval);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
    unsubscribeLogs(res);
  });
});

// GET /api/device-health/logs - Filtered history from the ring buffer
router.get('/logs', (req, res) => {
  try {
    const filter = req.query.type || 'all';
    const limit = parseInt(req.query.limit) || 200;
    const logs = getLogs(filter, limit);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/device-health/command - Execute terminal command
router.post('/command', async (req, res) => {
  try {
    const command = req.body?.command || '';
    if (!command) {
      return res.status(400).json({ success: false, error: 'Command string required' });
    }
    const result = await executeDeviceCommand(command);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/device-health/ota/build - Trigger PlatformIO compilation
router.post('/ota/build', async (req, res) => {
  try {
    const result = await buildFirmware();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/device-health/ota/flash - Trigger Wi-Fi OTA flash
router.post('/ota/flash', async (req, res) => {
  try {
    const targetIp = req.body?.targetIp;
    const result = await flashFirmwareOta({ targetIp });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/device-health/firmware - Dedicated firmware info
router.get('/firmware', (req, res) => {
  try {
    res.json({ success: true, firmware: getFirmwareStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
