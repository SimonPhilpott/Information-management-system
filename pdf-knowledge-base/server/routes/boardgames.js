import { Router } from 'express';
import { getPublicConfig, saveConfig, getStatus, startRefresh, getGames, setWantToSell } from '../services/boardgamesService.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({ success: true, config: getPublicConfig(), status: getStatus(), ...getGames() });
});

router.put('/config', (req, res) => {
  try {
    res.json({ success: true, config: saveConfig(req.body || {}) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/refresh', (req, res) => {
  const result = startRefresh();
  if (!result.started) return res.status(409).json({ error: result.reason });
  res.json({ success: true });
});

router.put('/sell', (req, res) => {
  const { id, wantToSell } = req.body || {};
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id (integer BGG id) is required.' });
  setWantToSell(id, Boolean(wantToSell));
  res.json({ success: true });
});

export default router;
