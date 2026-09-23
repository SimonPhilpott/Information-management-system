import { Router } from 'express';
import db, { addMemory, getMemories, searchMemories, deleteMemory, updateMemory } from '../db/database.js';

const router = Router();

/**
 * GET /api/memories
 * Retrieve memories with optional search query, category filtering, and category distribution counts.
 */
router.get('/', (req, res) => {
  try {
    const { search = '', category = 'all', limit = 200 } = req.query;
    const parsedLimit = parseInt(limit, 10) || 200;

    let memories = [];
    if (search && search.trim()) {
      memories = searchMemories(search.trim(), category);
    } else {
      memories = getMemories(parsedLimit, category);
    }

    // Compute category aggregations and total count
    const totalRow = db.prepare('SELECT COUNT(*) as count FROM ims_memories').get();
    const catRows = db.prepare('SELECT category, COUNT(*) as count FROM ims_memories GROUP BY category ORDER BY count DESC').all();

    const categoryCounts = {};
    catRows.forEach(row => {
      categoryCounts[row.category || 'general'] = row.count;
    });

    res.json({
      success: true,
      total: totalRow ? totalRow.count : 0,
      categories: categoryCounts,
      memories
    });
  } catch (err) {
    console.error('[Memories Route] Failed to fetch memories:', err);
    res.status(500).json({ error: 'Failed to retrieve memories: ' + err.message });
  }
});

/**
 * GET /api/memories/stats
 * Aggregate overview stats for memory dashboard widgets.
 */
router.get('/stats', (req, res) => {
  try {
    const totalRow = db.prepare('SELECT COUNT(*) as count FROM ims_memories').get();
    const newestRow = db.prepare('SELECT * FROM ims_memories ORDER BY created_at DESC LIMIT 1').get();
    const catRows = db.prepare('SELECT category, COUNT(*) as count FROM ims_memories GROUP BY category ORDER BY count DESC').all();

    res.json({
      success: true,
      total: totalRow ? totalRow.count : 0,
      newest: newestRow || null,
      categories: catRows
    });
  } catch (err) {
    console.error('[Memories Route] Failed to get memory stats:', err);
    res.status(500).json({ error: 'Failed to retrieve memory stats: ' + err.message });
  }
});

/**
 * POST /api/memories
 * Create a new persistent memory entry.
 */
router.post('/', (req, res) => {
  try {
    const { fact, category } = req.body;

    if (!fact || typeof fact !== 'string' || !fact.trim()) {
      return res.status(400).json({ error: 'Fact content is required and cannot be empty.' });
    }

    const newMemory = addMemory(fact.trim(), category || 'general');
    res.status(201).json({
      success: true,
      message: 'Memory saved successfully.',
      memory: newMemory
    });
  } catch (err) {
    console.error('[Memories Route] Failed to add memory:', err);
    res.status(500).json({ error: 'Failed to add memory: ' + err.message });
  }
});

/**
 * PUT /api/memories/:id
 * Update an existing memory's fact or category.
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { fact, category } = req.body;

    if (!fact || typeof fact !== 'string' || !fact.trim()) {
      return res.status(400).json({ error: 'Updated fact text cannot be empty.' });
    }

    const updated = updateMemory(id, fact.trim(), category || 'general');
    if (!updated) {
      return res.status(404).json({ error: 'Memory not found or no changes made.' });
    }

    res.json({
      success: true,
      message: 'Memory updated successfully.',
      memory: { id, fact: fact.trim(), category: (category || 'general').trim().toLowerCase() }
    });
  } catch (err) {
    console.error('[Memories Route] Failed to update memory:', err);
    res.status(500).json({ error: 'Failed to update memory: ' + err.message });
  }
});

/**
 * DELETE /api/memories/:id
 * Delete a memory by its unique ID.
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !id.trim()) {
      return res.status(400).json({ error: 'Valid memory ID is required.' });
    }

    const deleted = deleteMemory(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Memory not found.' });
    }

    res.json({
      success: true,
      message: 'Memory deleted successfully.',
      id
    });
  } catch (err) {
    console.error('[Memories Route] Failed to delete memory:', err);
    res.status(500).json({ error: 'Failed to delete memory: ' + err.message });
  }
});

export default router;
