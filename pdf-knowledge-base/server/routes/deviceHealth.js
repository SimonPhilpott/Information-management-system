import { Router } from 'express';
import { getDeviceHealthSummary, recordDeviceTelemetry } from '../services/deviceHealthService.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const summary = getDeviceHealthSummary(hours);
    res.json({ success: true, ...summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/report', (req, res) => {
  try {
    const recorded = recordDeviceTelemetry(req.body || {});
    res.json({ success: true, telemetry: recorded });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
