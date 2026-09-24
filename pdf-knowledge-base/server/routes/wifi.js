import { Router } from 'express';
import { requireSession } from '../middleware/requireSession.js';
import { listNetworks, addNetwork, updateNetwork, removeNetwork, moveNetwork, revealPassword } from '../services/wifiService.js';

const router = Router();

// Everything here needs THIS browser to be signed in with the approved Google
// account - not merely a server that has been authorised somewhere.
router.use(requireSession);

router.get('/', (req, res) => {
  res.json({ success: true, networks: listNetworks() });
});

router.post('/', (req, res) => {
  try {
    res.json({ success: true, network: addNetwork(req.body || {}) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    res.json({ success: true, network: updateNetwork(req.params.id, req.body || {}) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/move', (req, res) => {
  const delta = Number(req.body?.delta) < 0 ? -1 : 1;
  res.json({ success: true, networks: moveNetwork(req.params.id, delta) });
});

router.delete('/:id', (req, res) => {
  if (!removeNetwork(req.params.id)) return res.status(404).json({ error: 'Network not found.' });
  res.json({ success: true });
});

// Deliberately a POST (never cached or prefetched) and separate from the list.
router.post('/:id/reveal', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, password: revealPassword(req.params.id, req.session.user.email) });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

export default router;
