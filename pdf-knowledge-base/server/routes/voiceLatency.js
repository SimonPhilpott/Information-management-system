import { Router } from 'express';
import { getVoiceLatencyMetrics, recordVoiceTurnLatency } from '../services/voiceLatencyService.js';

const router = Router();

router.get('/metrics', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const metrics = getVoiceLatencyMetrics(limit);
    res.json({ success: true, ...metrics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/record', (req, res) => {
  try {
    const result = recordVoiceTurnLatency(req.body || {});
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
