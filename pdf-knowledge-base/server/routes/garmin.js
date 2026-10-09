import { Router } from 'express';
import { requireSession } from '../middleware/requireSession.js';
import {
  garminStatus,
  connectGarmin,
  disconnectGarmin,
  syncGarminDay,
  syncGarminRecent,
  getGarminDay,
  getLatestGarminDay,
  getGarminZones,
  listGarminDays
} from '../services/garminService.js';
import { invalidateDayReportCache } from '../services/morningReportService.js';

const router = Router();
router.use(requireSession);

// GET /api/garmin/status
router.get('/status', (req, res) => {
  res.json({ success: true, ...garminStatus() });
});

// POST /api/garmin/connect
router.post('/connect', async (req, res) => {
  try {
    const { email, password, mfaCode } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }
    const result = await connectGarmin(email, password, mfaCode);
    if (result.ok) {
      invalidateDayReportCache();
    }
    res.json({ success: result.ok, ...result, ...garminStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/garmin/disconnect
router.post('/disconnect', (req, res) => {
  const result = disconnectGarmin();
  invalidateDayReportCache();
  res.json({ success: true, ...result, ...garminStatus() });
});

// POST /api/garmin/sync
router.post('/sync', async (req, res) => {
  try {
    const { date } = req.body || {};
    let result;
    if (date) {
      result = await syncGarminDay(date);
    } else {
      result = await syncGarminRecent();
    }
    invalidateDayReportCache();
    res.json({ success: true, result, ...garminStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/garmin/latest
router.get('/latest', (req, res) => {
  const day = getLatestGarminDay();
  res.json({ success: true, day, ...garminStatus() });
});

// GET /api/garmin/history
router.get('/history', (req, res) => {
  const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 14));
  res.json({ success: true, days: listGarminDays(limit), ...garminStatus() });
});

// GET /api/garmin/zones
router.get('/zones', (req, res) => {
  res.json({ success: true, zones: getGarminZones() });
});

// GET /api/garmin/day/:date
router.get('/day/:date', (req, res) => {
  const day = getGarminDay(req.params.date);
  if (!day) {
    return res.status(404).json({ success: false, error: 'No Garmin metrics found for that date.' });
  }
  res.json({ success: true, day });
});

export default router;
