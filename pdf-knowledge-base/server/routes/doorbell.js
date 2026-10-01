import express from 'express';
import doorbellService from '../services/doorbellService.js';

const router = express.Router();

/**
 * GET /api/doorbell/status
 * Fetches connection status, camera listing, and recent alert state
 */
router.get('/status', (req, res) => {
  try {
    const status = doorbellService.getStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/doorbell/events
 * Fetches recent doorbell event history (dings and motions)
 */
router.get('/events', (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const events = doorbellService.getEvents(limit);
    res.json({ success: true, count: events.length, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/doorbell/token
 * Updates or configures the Ring 2FA Refresh Token and attempts reconnection
 */
router.post('/token', async (req, res) => {
  try {
    const { token } = req.body;
    const result = await doorbellService.saveRefreshToken(token);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/doorbell/reconnect
 * Manually attempts reconnection with existing stored token
 */
router.post('/reconnect', async (req, res) => {
  try {
    const success = await doorbellService.init();
    res.json({ success, ...doorbellService.getStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/doorbell/test-alert
 * Triggers a test ding or motion event for verification
 */
router.post('/test-alert', async (req, res) => {
  try {
    const { eventType = 'ding', cameraName = 'Front Door' } = req.body;
    const alert = await doorbellService.triggerTestEvent(eventType, cameraName);
    res.json({ success: true, alert });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/doorbell/snapshot/:id
 * Grabs a fresh live JPEG snapshot from the specified Ring camera
 */
router.get('/snapshot/:id', async (req, res) => {
  try {
    const cameraId = req.params.id;
    const snapshotBuffer = await doorbellService.getCameraSnapshot(cameraId);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(snapshotBuffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
