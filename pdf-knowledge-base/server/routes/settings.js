import { Router } from 'express';
import db, { getSettings, setSetting, getSetting } from '../db/database.js';
import { listDriveFolders } from '../services/driveService.js';
import { getPersonality, setPersonality, getCaptureLogging, setCaptureLogging } from '../services/hardwareClientService.js';

const router = Router();

/**
 * GET /api/settings/personality - Get current personality, active voice, and preferences
 */
router.get('/personality', (req, res) => {
  try {
    res.json({ ...getPersonality(), captureLogging: getCaptureLogging() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/settings/personality - Update personality or active voice setting
 */
router.post('/personality', (req, res) => {
  try {
    if (typeof req.body.captureLogging === 'boolean') {
      setCaptureLogging(req.body.captureLogging);
    }
    const next = setPersonality(req.body);
    res.json({ ...next, captureLogging: getCaptureLogging() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * GET /api/settings - Get all settings
 */
router.get('/', (req, res) => {
  try {
    const settings = getSettings();
    res.json({
      driveRootFolderId: settings.drive_root_folder_id || null,
      driveRootFolderName: settings.drive_root_folder_name || null,
      monthlySpendCap: settings.monthly_spend_cap ? parseFloat(settings.monthly_spend_cap) : 250,
      preferredModel: settings.preferred_model || 'flash',
      isConfigured: !!settings.drive_root_folder_id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/settings - Update settings
 */
router.put('/', (req, res) => {
  try {
    const { driveRootFolderId, driveRootFolderName, monthlySpendCap, preferredModel } = req.body;

    if (driveRootFolderId !== undefined) {
      setSetting('drive_root_folder_id', driveRootFolderId);
    }
    if (driveRootFolderName !== undefined) {
      setSetting('drive_root_folder_name', driveRootFolderName);
    }
    if (monthlySpendCap !== undefined) {
      setSetting('monthly_spend_cap', monthlySpendCap.toString());
    }
    if (preferredModel !== undefined) {
      setSetting('preferred_model', preferredModel);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/settings/drive-folders - Browse Drive folders for folder picker
 */
router.get('/drive-folders', async (req, res) => {
  try {
    const parentId = req.query.parentId || 'root';
    const folders = await listDriveFolders(parentId);
    res.json(folders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/settings/canvas - Get saved canvas content
 */
router.get('/canvas', async (req, res) => {
  try {
    const row = db.prepare('SELECT content FROM canvas_state WHERE id = 1').get();
    res.json({ content: row ? row.content : "" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/settings/canvas - Save canvas content
 */
router.put('/canvas', async (req, res) => {
  try {
    const { content } = req.body;
    db.prepare('INSERT OR REPLACE INTO canvas_state (id, content, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)').run(content);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
