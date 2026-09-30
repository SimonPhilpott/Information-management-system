import { Router } from 'express';
import {
  getConfig, saveConfig, getStatus, getResultsMeta, getWindowResults, getTodayReleases, getUpcomingReleases,
  getArtistList, getArtistDetail, saveArtistSettings, rescanArtist,
  isScanRunning, runScanNow, getNextScheduledRun,
  getWants, addWant, removeWant, getSavedRecommendations, recommendArtists,
  getMusicAudit, getMuzakFolders, getArtistFolderContents, renameAlbumFolder, renameArtistFolder,
  searchMusicBrainzArtist, linkArtistRelease, hideArtist
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

// Audit endpoint: unmatched artists + artists with unowned releases
router.get('/audit', (req, res) => {
  try {
    res.json({ success: true, ...getMusicAudit() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Muzak share genre/artist hierarchy
router.get('/folders', (req, res) => {
  try {
    res.json({ success: true, ...getMuzakFolders() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get contents of a specific artist folder
router.get('/artist/folder', (req, res) => {
  const { genre, name } = req.query;
  if (!name) return res.status(400).json({ success: false, error: 'Artist name is required.' });
  try {
    res.json({ success: true, ...getArtistFolderContents(genre || '', String(name)) });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// Rename album folder inside artist directory
router.post('/album/rename', (req, res) => {
  const { genre, artist, oldFolder, newFolder } = req.body || {};
  if (!artist || !oldFolder || !newFolder) {
    return res.status(400).json({ success: false, error: 'artist, oldFolder, and newFolder are required.' });
  }
  try {
    const updatedArtist = renameAlbumFolder(genre || '', artist, oldFolder, newFolder);
    res.json({ success: true, artist: updatedArtist, message: `Renamed "${oldFolder}" to "${newFolder}".` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rename artist folder on disk
router.post('/artist/rename', (req, res) => {
  const { genre, oldArtist, newArtist } = req.body || {};
  if (!oldArtist || !newArtist) {
    return res.status(400).json({ success: false, error: 'oldArtist and newArtist are required.' });
  }
  try {
    const updatedArtist = renameArtistFolder(genre || '', oldArtist, newArtist);
    res.json({ success: true, artist: updatedArtist, message: `Renamed artist folder "${oldArtist}" to "${newArtist}".` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Link an album to a local folder or manual owned state
router.post('/album/link', (req, res) => {
  const { artist, title, folder } = req.body || {};
  if (!artist || !title) {
    return res.status(400).json({ success: false, error: 'artist and title are required.' });
  }
  try {
    const detail = linkArtistRelease(artist, title, folder || artist);
    res.json({ success: true, artist: detail });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Hide or unhide artist from music scanner
router.post('/artist/hide', (req, res) => {
  const { name, hidden } = req.body || {};
  if (!name) return res.status(400).json({ success: false, error: 'Artist name is required.' });
  try {
    res.json({ success: true, settings: hideArtist(name, hidden !== false) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Search MusicBrainz for closest artist matches
router.get('/musicbrainz/search', async (req, res) => {
  const { query } = req.query;
  if (!query) return res.json({ success: true, results: [] });
  try {
    const results = await searchMusicBrainzArtist(String(query));
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Artists with a release inside the window (day|week|month|6months|year)
router.get('/results', (req, res) => {
  try {
    res.json({ success: true, ...getResultsMeta(), ...getWindowResults(req.query.window || 'week') });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Announced future releases for artists in the library, soonest first.
router.get('/upcoming', (req, res) => {
  res.json({ success: true, ...getResultsMeta(), releases: getUpcomingReleases() });
});

router.get('/wants', (req, res) => { try { res.json({ success: true, wants: getWants() }); } catch (err) { res.status(500).json({ success: false, error: err.message }); } });
router.post('/wants', (req, res) => { try { res.json({ success: true, wants: addWant(req.body || {}) }); } catch (err) { res.status(400).json({ success: false, error: err.message }); } });
router.delete('/wants', (req, res) => { try { res.json({ success: true, wants: removeWant(req.body || {}) }); } catch (err) { res.status(400).json({ success: false, error: err.message }); } });
router.get('/recommendations', (req, res) => { res.json({ success: true, recommendations: getSavedRecommendations() }); });
router.post('/recommendations', async (req, res) => { try { res.json({ success: true, recommendations: await recommendArtists() }); } catch (err) { res.status(400).json({ success: false, error: err.message }); } });

router.get('/today', (req, res) => {
  res.json({ success: true, releases: getTodayReleases() });
});

// Compact list of every scanned artist
router.get('/artists', (req, res) => {
  const includeHidden = req.query.includeHidden === 'true';
  res.json({ success: true, artists: getArtistList({ includeHidden }) });
});

router.get('/artist', (req, res) => {
  const detail = getArtistDetail(String(req.query.name || ''));
  if (!detail) return res.status(404).json({ error: 'Artist not found in the last scan.' });
  res.json({ success: true, artist: detail });
});

router.put('/artist/settings', (req, res) => {
  const { name, searchName, aliases, hidden, linkedFolder, linkedReleases } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required.' });
  try {
    res.json({ success: true, settings: saveArtistSettings(name, { searchName, aliases, hidden, linkedFolder, linkedReleases }) });
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
