import { Router } from 'express';
import { listPhrases, addPhrase, updatePhrase, deletePhrase, addRecording, deleteRecording, recordingFile } from '../services/phrasesService.js';
import { requestDeviceCapture } from '../services/deviceBus.js';

const router = Router();
const fail = (res, err, code = 500) => res.status(code).json({ success: false, error: err.message });

router.get('/', (req, res) => { try { res.json({ success: true, phrases: listPhrases() }); } catch (err) { fail(res, err); } });
router.post('/', (req, res) => { try { res.json({ success: true, phrase: addPhrase(req.body || {}) }); } catch (err) { fail(res, err, 400); } });
router.patch('/:id', (req, res) => { try { res.json({ success: true, phrase: updatePhrase(req.params.id, req.body || {}) }); } catch (err) { fail(res, err, 400); } });
router.delete('/:id', (req, res) => { try { res.json({ success: deletePhrase(req.params.id) }); } catch (err) { fail(res, err); } });
router.post('/:id/recordings', async (req, res) => { try { res.json({ success: true, ...(await addRecording(req.params.id, req.body?.pcm)) }); } catch (err) { fail(res, err, 400); } });
// Record from the IMS device's own microphone (the one the phrases are really heard on).
router.post('/:id/record-device', async (req, res) => {
  try {
    const pcm = await requestDeviceCapture(Math.max(2, Math.min(5, Number(req.body?.seconds) || 3)));
    res.json({ success: true, ...(await addRecording(req.params.id, null, pcm)) });
  } catch (err) { fail(res, err, 400); }
});
router.delete('/recordings/:rid', (req, res) => { try { res.json({ success: deleteRecording(req.params.rid) }); } catch (err) { fail(res, err); } });
router.get('/recordings/:rid/audio', (req, res) => { const f = recordingFile(req.params.rid); return f ? res.type('audio/wav').sendFile(f) : res.status(404).end(); });

export default router;
