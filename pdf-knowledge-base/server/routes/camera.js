import express, { Router } from 'express';
import { setFrame, getFrame, getCameraStatus, wakeCamera, heartbeat, readDeviceLog } from '../services/cameraService.js';

const router = Router();

// Raw JPEG body, one frame per request (device, or the browser's webcam).
router.post('/frame', express.raw({ type: ['image/jpeg', 'application/octet-stream'], limit: '6mb' }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length < 200) {
    return res.status(400).json({ error: 'Send a JPEG as the raw request body.' });
  }
  // JPEG magic bytes - reject anything else rather than storing junk.
  if (req.body[0] !== 0xFF || req.body[1] !== 0xD8) {
    return res.status(400).json({ error: 'Body is not a JPEG.' });
  }
  setFrame(req.body, String(req.query.source || 'unknown').slice(0, 24));
  res.json({ success: true });
});

router.get('/latest.jpg', (req, res) => {
  wakeCamera(); // someone is watching the live view, so keep the camera awake
  const frame = getFrame();
  if (!frame) return res.status(404).json({ error: 'No camera frame received yet.' });
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' });
  res.send(frame.buffer);
});

// A device with a camera plugged in but not streaming says so here.
router.post('/heartbeat', (req, res) => {
  heartbeat({ boot: req.query.boot === '1' });
  res.json({ success: true });
});

// Wakes the camera for another 10 minutes (used when /ims/look or /ims/faces opens).
router.post('/wake', (req, res) => {
  wakeCamera();
  res.json({ success: true, ...getCameraStatus() });
});

// What the box has reported about its camera (enumeration, formats, errors).
router.get('/device-log', (req, res) => {
  res.json({ success: true, lines: readDeviceLog(Number(req.query.lines) || 200) });
});

router.get('/status', (req, res) => {
  res.json({ success: true, ...getCameraStatus() });
});

export default router;
