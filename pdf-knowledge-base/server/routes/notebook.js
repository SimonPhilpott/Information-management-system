import { Router } from 'express';
import db from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * GET /api/notebook - List all pinned items
 */
router.get('/', (req, res) => {
  try {
    const pins = db.prepare('SELECT * FROM pinned_items ORDER BY created_at DESC').all();
    res.json(pins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/notebook/pin - Pin a citation
 */
router.post('/pin', (req, res) => {
  try {
    const { driveFileId, filename, pageNum, excerpt } = req.body;
    
    // Use a unique ID based on file and page to prevent duplicates
    const id = `${driveFileId}_${pageNum}`;
    
    db.prepare(`
      INSERT OR REPLACE INTO pinned_items (id, drive_file_id, filename, page_num, excerpt, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(id, driveFileId, filename, pageNum, excerpt);
    
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/notebook/pin/:id - Unpin an item
 */
router.delete('/pin/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM pinned_items WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/notebook/pins - Clear all pinned items
 */
router.delete('/pins', (req, res) => {
  try {
    db.prepare('DELETE FROM pinned_items').run();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
