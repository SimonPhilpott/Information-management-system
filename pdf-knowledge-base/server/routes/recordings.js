import { Router } from 'express';
import {
  getRecordingStatus, startRecording, stopRecording, listRecordings, getRecording,
  deleteRecording, renameRecording, summariseRecording,
} from '../services/recordingService.js';

const router = Router();

router.get('/status', (req, res) => res.json({ success: true, ...getRecordingStatus() }));

router.get('/', (req, res) => res.json({ success: true, recordings: listRecordings(), status: getRecordingStatus() }));

router.post('/start', (req, res) => {
  if (!String(req.body?.withWhom || '').trim()) return res.status(400).json({ error: 'Say who the call or meeting is with.' });
  res.json({ success: true, status: startRecording(req.body.withWhom, 'web') });
});

router.post('/stop', (req, res) => {
  const rec = stopRecording();
  if (!rec) return res.status(400).json({ error: 'Nothing is being recorded.' });
  res.json({ success: true, recording: rec });
});

router.get('/:id', (req, res) => {
  const rec = getRecording(Number(req.params.id));
  if (!rec) return res.status(404).json({ error: 'Recording not found.' });
  res.json({ success: true, recording: rec });
});

router.put('/:id', (req, res) => {
  try {
    if (!renameRecording(Number(req.params.id), req.body?.withWhom)) return res.status(404).json({ error: 'Recording not found.' });
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:id/summarise', async (req, res) => {
  try { res.json({ success: true, recording: await summariseRecording(Number(req.params.id)) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    if (!deleteRecording(Number(req.params.id))) return res.status(404).json({ error: 'Recording not found.' });
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;
