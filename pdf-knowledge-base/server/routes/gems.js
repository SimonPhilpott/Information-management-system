import express from 'express';
import db from '../db/database.js';

const router = express.Router();

// Get all gems
router.get('/', (req, res) => {
  try {
    const gems = db.prepare('SELECT * FROM gems ORDER BY is_system DESC, created_at DESC').all();
    res.json(gems);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set active gem
router.post('/activate/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    // Use a transaction to ensure only one is active
    const activate = db.transaction(() => {
      db.prepare('UPDATE gems SET is_active = 0').run();
      db.prepare('UPDATE gems SET is_active = 1 WHERE id = ?').run(id);
    });
    
    activate();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
