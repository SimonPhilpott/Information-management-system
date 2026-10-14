import { Router } from 'express';
import { listPhrases, addPhrase, updatePhrase, deletePhrase, addRecording, deleteRecording, recordingFile, listWakeCandidates, acceptWakeCandidate, dismissWakeCandidate } from '../services/phrasesService.js';
import { requestDeviceCapture, stopDeviceCapture } from '../services/deviceBus.js';
import { wakeModelStatus, startTraining, listClipsToReview, labelClip, clipFile } from '../services/wakeModelService.js';

const router = Router();
const fail = (res, err, code = 500) => res.status(code).json({ success: false, error: err.message });

router.get('/candidates', (req, res) => { try { res.json({ success: true, candidates: listWakeCandidates() }); } catch (err) { fail(res, err); } });
router.post('/candidates/accept', (req, res) => { try { res.json({ success: true, phrase: acceptWakeCandidate(req.body?.text, req.body?.phraseId) }); } catch (err) { fail(res, err, 400); } });
router.post('/candidates/dismiss', (req, res) => { try { res.json({ success: dismissWakeCandidate(req.body?.text) }); } catch (err) { fail(res, err); } });
router.get('/', (req, res) => { try { res.json({ success: true, phrases: listPhrases() }); } catch (err) { fail(res, err); } });
router.post('/', (req, res) => { try { res.json({ success: true, phrase: addPhrase(req.body || {}) }); } catch (err) { fail(res, err, 400); } });
router.patch('/:id', (req, res) => { try { res.json({ success: true, phrase: updatePhrase(req.params.id, req.body || {}) }); } catch (err) { fail(res, err, 400); } });
router.delete('/:id', (req, res) => { try { res.json({ success: deletePhrase(req.params.id) }); } catch (err) { fail(res, err); } });
// Recordings only ever come from the Box-3's own microphone (record-device below) - the one the wake phrases
// are really heard on, and what the wake-word model is trained on. Audio uploaded from elsewhere is refused.
router.post('/:id/recordings', (req, res) => fail(res, new Error('Record through the IMS device - recordings must come from the Box-3 microphone.'), 400));
// Record from the IMS device's own microphone (the one the phrases are really heard on).
router.post('/record-device/stop', (req, res) => { stopDeviceCapture(); res.json({ success: true }); });
// Simon's own wake-word model (shadow mode beside the Gemini wake check)
router.get('/model', (req, res) => { try { res.json({ success: true, ...wakeModelStatus() }); } catch (err) { fail(res, err); } });
router.post('/model/train', (req, res) => { try { res.json({ success: true, training: startTraining() }); } catch (err) { fail(res, err, 400); } });
router.get('/model/review', (req, res) => { try { res.json({ success: true, clips: listClipsToReview() }); } catch (err) { fail(res, err); } });
router.post('/model/clips/:cid/label', (req, res) => { try { res.json({ success: true, ...labelClip(req.params.cid, Boolean(req.body?.wake)) }); } catch (err) { fail(res, err, 400); } });
router.get('/model/clips/:cid/audio', (req, res) => { const f = clipFile(req.params.cid); return f ? res.type('audio/wav').sendFile(f) : res.status(404).end(); });
router.post('/:id/record-device', async (req, res) => {
  try {
    // up to 6 s: the page's Stop button usually ends it sooner (POST /record-device/stop)
    const pcm = await requestDeviceCapture(Math.max(2, Math.min(6, Number(req.body?.seconds) || 3)));
    res.json({ success: true, ...(await addRecording(req.params.id, null, pcm)) });
  } catch (err) { fail(res, err, 400); }
});
router.delete('/recordings/:rid', (req, res) => { try { res.json({ success: deleteRecording(req.params.rid) }); } catch (err) { fail(res, err); } });
router.get('/recordings/:rid/audio', (req, res) => { const f = recordingFile(req.params.rid); return f ? res.type('audio/wav').sendFile(f) : res.status(404).end(); });

export default router;
