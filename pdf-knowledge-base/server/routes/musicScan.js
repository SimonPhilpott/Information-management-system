import { Router } from 'express';
import {
  getConfig, saveConfig, getStatus, getResultsMeta, getWindowResults, getTodayReleases,
  getArtistList, getArtistDetail, saveArtistSettings, rescanArtist,
  isScanRunning, runScanNow, getNextScheduledRun
} from '../services/musicScanService.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    success: true,
    config: getConfig(),
    status: getStatus(),
    isRunning: isScanRunning(),
    nextScheduledRun: getNextScheduledRun(),
    ...getResultsMeta()
  });
});

// Artists with a release inside the window (day|week|month|6months|year),
// each with their FULL album list (owned / not owned / unlisted) and the
// in-window releases flagged isNew.
router.get('/results', (req, res) => {
  try {
    res.json({ success: true, ...getResultsMeta(), ...getWindowResults(req.query.window || 'week') });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/today', (req, res) => {
  res.json({ success: true, releases: getTodayReleases() });
});

// Compact list of every scanned artist (counts only) - details are fetched
// per artist on expand so this stays small for ~1000 artists.
router.get('/artists', (req, res) => {
  res.json({ success: true, artists: getArtistList() });
});

// Artist names are folder names and may contain odd characters, so they
// travel as query/body values rather than URL path segments.
router.get('/artist', (req, res) => {
  const detail = getArtistDetail(String(req.query.name || ''));
  if (!detail) return res.status(404).json({ error: 'Artist not found in the last scan.' });
  res.json({ success: true, artist: detail });
});

router.put('/artist/settings', (req, res) => {
  const { name, searchName, aliases } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required.' });
  try {
    res.json({ success: true, settings: saveArtistSettings(name, { searchName, aliases }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/artist/rescan', async (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required.' });
  try {
    const artist = await rescanArtist(name);
    if (!artist) return res.status(404).json({ error: 'Artist not found after rescan.' });
    res.json({ success: true, artist });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

router.put('/config', (req, res) => {
  const body = req.body || {};
  if (body.muzak_path !== undefined && typeof body.muzak_path !== 'string') {
    return res.status(400).json({ error: 'muzak_path must be a string.' });
  }
  if (body.schedule_time !== undefined && !/^\d{2}:\d{2}$/.test(body.schedule_time)) {
    return res.status(400).json({ error: 'schedule_time must be HH:MM.' });
  }
  try {
    const config = saveConfig(body);
    res.json({ success: true, config, nextScheduledRun: getNextScheduledRun() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save config: ' + err.message });
  }
});

router.post('/run', (req, res) => {
  const result = runScanNow();
  if (!result.started) {
    return res.status(409).json({ error: result.reason });
  }
  res.json({ success: true, message: 'Scan started.' });
});

export default router;
