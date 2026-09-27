import { Router } from 'express';
import express from 'express';
import { getPublicConfig, saveConfig, getStatus, startRefresh, getGames, setWantToSell, importCollectionCsv, addGame, removeGame, restoreGame } from '../services/boardgamesService.js';
import { deckGameForBgg } from '../services/decksService.js';

const router = Router();

router.get('/', (req, res) => {
  const data = getGames();
  // deckGame: the key of this game's deck builder (/ims/decks), when it has one
  data.games = data.games.map((g) => ({ ...g, deckGame: deckGameForBgg(g.id) }));
  res.json({ success: true, config: getPublicConfig(), status: getStatus(), ...data });
});

// BoardGameGeek's "Export collection" CSV, sent as the raw file text.
router.post('/import-csv', express.text({ type: '*/*', limit: '5mb' }), (req, res) => {
  try { res.json({ success: true, ...importCollectionCsv(req.body) }); } catch (err) { res.status(400).json({ error: err.message }); }
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

// Add a game by hand, remove one, or bring a removed one back. Kept through CSV imports and BGG refreshes.
router.post('/games', (req, res) => { try { res.json({ success: true, game: addGame(req.body || {}) }); } catch (err) { res.status(400).json({ error: err.message }); } });
router.delete('/games/:id', (req, res) => res.json({ success: removeGame(req.params.id) }));
router.post('/games/:id/restore', (req, res) => res.json({ success: restoreGame(req.params.id) }));

router.put('/sell', (req, res) => {
  const { id, wantToSell } = req.body || {};
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id (integer BGG id) is required.' });
  setWantToSell(id, Boolean(wantToSell));
  res.json({ success: true });
});

export default router;
