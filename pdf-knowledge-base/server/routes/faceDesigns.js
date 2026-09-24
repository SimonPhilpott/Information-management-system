import { Router } from 'express';
import { listFaces, createFace, updateFace, deleteFace, restoreFace, resetFace, getFaceByName, getDevicePayload } from '../services/faceDesignService.js';
import { pushToDevice, pushScheduleNow } from '../services/deviceBus.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({ success: true, faces: listFaces(), deleted: listFaces({ deleted: true }) });
});

router.post('/', (req, res) => {
  try {
    res.json({ success: true, face: createFace(req.body || {}) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const face = updateFace(Number(req.params.id), req.body || {});
    pushScheduleNow(); // the device picks up an edited neutral face straight away
    res.json({ success: true, face });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    deleteFace(Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Put a built-in face's frames and colour back to how they shipped.
router.post('/:id/reset', (req, res) => {
  try {
    const face = resetFace(Number(req.params.id));
    pushScheduleNow();
    res.json({ success: true, face });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/restore', (req, res) => {
  try {
    restoreFace(Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Show a face on the device right now (it fades back to neutral after ~20s,
// like any face Ims picks). Works for built-in and designed faces alike.
router.post('/preview', (req, res) => {
  const { name, grid, openGrid, color, eyeBlink, eyeGlance } = req.body || {};
  // Unsaved designs can be previewed too: the frames are sent straight through.
  const isStandby = String(name || '').toLowerCase() === 'standby';
  const draft = { grid, openGrid: openGrid || grid, color: color || '4CFF7A', blink: Boolean(eyeBlink), glance: Boolean(eyeGlance) };
  const payload = grid === undefined
    ? getDevicePayload(getFaceByName(name)?.name || name)
    : isStandby
    ? { setEmotion: 'neutral', standbyFace: draft }
    : { setEmotion: String(name || 'preview').slice(0, 22), face: draft };
  const shown = payload.face || payload.standbyFace;
  if (shown) {
    const ok = (g) => /^[0-9a-f]{96}$/.test(String(g || ''));
    if (!ok(shown.grid) || !ok(shown.openGrid)) return res.status(400).json({ error: 'The face grid is invalid.' });
  }
  pushToDevice(payload);
  res.json({ success: true });
});

export default router;
