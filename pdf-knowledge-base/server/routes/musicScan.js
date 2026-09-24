import { Router } from 'express';
import {
  getConfig, saveConfig, getStatus, getResults,
  isScanRunning, runScanNow, getNextScheduledRun
} from '../services/musicScanService.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    success: true,
    config: getConfig(),
    status: getStatus(),
    isRunning: isScanRunning(),
    nextScheduledRun: getNextScheduledRun()
  });
});

router.get('/results', (req, res) => {
  res.json({ success: true, ...getResults() });
});

router.put('/config', (req, res) => {
  const body = req.body || {};
  if (body.muzak_path !== undefined && typeof body.muzak_path !== 'string') {
    return res.status(400).json({ error: 'muzak_path must be a string.' });
  }
  if (body.schedule_time !== undefined && !/^\d{2}:\d{2}$/.test(body.schedule_time)) {
    return res.status(400).json({ error: 'schedule_time must be HH:MM.' });
  }
  try {
    const config = saveConfig(body);
    res.json({ success: true, config, nextScheduledRun: getNextScheduledRun() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save config: ' + err.message });
  }
});

router.post('/run', (req, res) => {
  const result = runScanNow();
  if (!result.started) {
    return res.status(409).json({ error: result.reason });
  }
  res.json({ success: true, message: 'Scan started.' });
});

export default router;
