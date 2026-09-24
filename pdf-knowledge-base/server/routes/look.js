import { Router } from 'express';
import {
  takeSnapshot, listSnapshots, getSnapshot, getSnapshotImagePath, deleteSnapshot,
  askAboutSnapshot, askLive
} from '../services/lookService.js';

const router = Router();

router.post('/snapshot', async (req, res) => {
  try {
    res.json({ success: true, snapshot: await takeSnapshot() });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

router.get('/snapshots', (req, res) => {
  res.json({ success: true, snapshots: listSnapshots() });
});

router.get('/snapshots/:id', (req, res) => {
  const snap = getSnapshot(Number(req.params.id));
  if (!snap) return res.status(404).json({ error: 'Snapshot not found.' });
  res.json({ success: true, snapshot: snap });
});

router.get('/snapshots/:id/image', (req, res) => {
  const p = getSnapshotImagePath(req.params.id);
  if (!p) return res.status(404).end();
  res.sendFile(p);
});

router.delete('/snapshots/:id', (req, res) => {
  if (!deleteSnapshot(Number(req.params.id))) return res.status(404).json({ error: 'Snapshot not found.' });
  res.json({ success: true });
});

router.post('/snapshots/:id/ask', async (req, res) => {
  try {
    res.json({ success: true, snapshot: await askAboutSnapshot(Number(req.params.id), req.body?.question) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Snapshot the live view, then ask about it in one step.
router.post('/ask', async (req, res) => {
  try {
    res.json({ success: true, snapshot: await askLive(req.body?.question) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
