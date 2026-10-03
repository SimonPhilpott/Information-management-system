import { Router } from 'express';
import express from 'express';
import {
  getPublicConfig, saveConfig, getStatus, startRefresh, getGames, setWantToSell,
  importCollectionCsv, addGame, addGameWithExpansions, removeGame, restoreGame,
  searchBgg, getBggDetails, setExpansionOwned, startThumbnailBackfill, getBackfillStatus, setFavourite, getDetailsStatus, fetchMissingDetails } from '../services/boardgamesService.js';
import { deckGameForBgg } from '../services/decksService.js';

const router = Router();

router.get('/', (req, res) => {
  const data = getGames();
  // deckGame: the key of this game's deck builder (/ims/decks), when it has one
  data.games = data.games.map((g) => ({ ...g, deckGame: deckGameForBgg(g.id) }));
  res.json({ success: true, config: getPublicConfig(), status: getStatus(), backfillStatus: getBackfillStatus(), ...data });
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

// Trigger backfilling expansion thumbnails / box art for all expansions currently in cache
router.post('/backfill-thumbnails', (req, res) => {
  const result = startThumbnailBackfill();
  if (!result.started) return res.status(409).json({ error: result.reason });
  res.json({ success: true, total: result.total });
});

router.get('/backfill-status', (req, res) => {
  res.json({ success: true, status: getBackfillStatus() });
});

// Search BoardGameGeek for matching titles
router.get('/search', async (req, res) => {
  try {
    const results = await searchBgg(req.query.q || req.query.query || '');
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch detailed game data including all BGG expansions for selection
router.get('/bgg-details/:id', async (req, res) => {
  try {
    const details = await getBggDetails(req.params.id);
    res.json({ success: true, details });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a game along with user-selected owned expansions
router.post('/add-with-expansions', (req, res) => {
  try {
    const result = addGameWithExpansions(req.body || {});
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Toggle expansion owned status
router.put('/expansions/:id/own', (req, res) => {
  try {
    const { owned } = req.body || {};
    const result = setExpansionOwned(req.params.id, owned !== undefined ? Boolean(owned) : true);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add a game by hand, remove one, or bring a removed one back. Kept through CSV imports and BGG refreshes.
router.post('/games', (req, res) => { try { res.json({ success: true, game: addGame(req.body || {}) }); } catch (err) { res.status(400).json({ error: err.message }); } });
router.delete('/games/:id', (req, res) => res.json({ success: removeGame(req.params.id) }));
router.post('/games/:id/restore', (req, res) => res.json({ success: restoreGame(req.params.id) }));

router.put('/favourite', (req, res) => {
  const { id, favourite } = req.body || {};
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id (integer BGG id) is required.' });
  setFavourite(id, Boolean(favourite));
  res.json({ success: true });
});

// Players, play time, solo and themes from BoardGameGeek - fetched in the background
router.get('/details/status', (req, res) => res.json({ success: true, ...getDetailsStatus() }));
router.post('/details/refresh', (req, res) => {
  fetchMissingDetails({ force: Boolean(req.body?.force) }).catch(() => {});
  res.json({ success: true, started: true });
});

router.put('/sell', (req, res) => {
  const { id, wantToSell } = req.body || {};
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id (integer BGG id) is required.' });
  setWantToSell(id, Boolean(wantToSell));
  res.json({ success: true });
});

export default router;
