import { Router } from 'express';
import { listPeople, enrolFace, updatePerson, deletePerson, deleteSample, sampleThumbPath } from '../services/faceService.js';
import { getSnapshot } from '../services/lookService.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({ success: true, people: listPeople() });
});

// Enrol one face from a stored snapshot (the snapshot already holds the
// detected faces and their embeddings, so no image is re-sent).
router.post('/enrol', (req, res) => {
  try {
    const { snapshotId, faceIndex = 0, name, notes, personId } = req.body || {};
    const snap = getSnapshot(Number(snapshotId), { withEmbeddings: true });
    if (!snap) return res.status(404).json({ error: 'Snapshot not found.' });
    const face = snap.faces[Number(faceIndex)];
    if (!face) return res.status(400).json({ error: 'That face is not in the snapshot.' });
    const result = enrolFace({ personId, name, notes, embedding: face.embedding, thumbBase64: face.thumb });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    updatePerson(Number(req.params.id), req.body || {});
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/sample/:id', (req, res) => {
  if (!deleteSample(Number(req.params.id))) return res.status(404).json({ error: 'Sample not found.' });
  res.json({ success: true });
});

router.get('/sample/:id/thumb', (req, res) => {
  const p = sampleThumbPath(req.params.id);
  if (!p) return res.status(404).end();
  res.sendFile(p);
});

router.delete('/:id', (req, res) => {
  if (!deletePerson(Number(req.params.id))) return res.status(404).json({ error: 'Person not found.' });
  res.json({ success: true });
});

export default router;
