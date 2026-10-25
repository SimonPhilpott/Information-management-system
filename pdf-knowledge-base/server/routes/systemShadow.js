import { Router } from 'express';
import { getSystemShadow, recordEdgeDockPing } from '../services/systemShadowService.js';
import { requireSession } from '../middleware/requireSession.js';

const router = Router();

// Heartbeat endpoint can be called by Android Edge Dock without session cookie
router.post('/edge-dock-ping', (req, res) => {
  try {
    recordEdgeDockPing(req.body || {});
    res.json({ success: true, timestamp: Date.now() });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Full shadow state inspection requires signed-in session
router.get('/', requireSession, (req, res) => {
  try {
    const shadow = getSystemShadow();
    res.json({ success: true, shadow });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
