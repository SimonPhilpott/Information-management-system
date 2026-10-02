import express from 'express';
import { Readable } from 'stream';
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
 * GET /api/doorbell/settings
 * Fetches notification toggles (dingEnabled, motionEnabled)
 */
router.get('/settings', (req, res) => {
  try {
    const settings = doorbellService.getNotificationSettings();
    res.json({ success: true, ...settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/doorbell/settings
 * Updates notification toggles (dingEnabled, motionEnabled)
 */
router.post('/settings', (req, res) => {
  try {
    const { dingEnabled, motionEnabled } = req.body;
    const settings = doorbellService.setNotificationSettings({ dingEnabled, motionEnabled });
    res.json({ success: true, ...settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/doorbell/events
 * Fetches recent doorbell event history (dings and motions) from local SQLite
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
 * GET /api/doorbell/recordings
 * Fetches past motion, ding, and on-demand video recording records from Ring cloud
 */
router.get('/recordings', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '30', 10)));
    const cameraId = req.query.cameraId ? String(req.query.cameraId) : undefined;
    const result = await doorbellService.getRecordings({ limit, cameraId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/doorbell/recordings/:dingId/url
 * Returns the signed temporary Amazon S3 video URL for in-app video playback or download
 */
router.get('/recordings/:dingId/url', async (req, res) => {
  try {
    const { dingId } = req.params;
    const cameraId = req.query.cameraId ? String(req.query.cameraId) : undefined;
    const result = await doorbellService.getRecordingUrl(dingId, cameraId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/doorbell/recordings/:dingId/video
 * Proxies the MP4 video stream from Ring's signed storage with Range request support (HTTP 206)
 */
router.get('/recordings/:dingId/video', async (req, res) => {
  try {
    const { dingId } = req.params;
    const cameraId = req.query.cameraId ? String(req.query.cameraId) : undefined;
    const { url } = await doorbellService.getRecordingUrl(dingId, cameraId);

    const headers = {};
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const videoRes = await fetch(url, { headers });
    res.status(videoRes.status);

    const allowedHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control'];
    for (const [k, v] of videoRes.headers.entries()) {
      if (allowedHeaders.includes(k.toLowerCase())) {
        res.setHeader(k, v);
      }
    }

    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'video/mp4');
    }

    if (videoRes.body) {
      Readable.fromWeb(videoRes.body).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    console.error(`[DoorbellRoute] Error streaming recording ${req.params.dingId}:`, err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
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
