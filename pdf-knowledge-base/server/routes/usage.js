import { Router } from 'express';
import { getUsageSummary, getUsageHistory } from '../services/usageService.js';
import { setSetting } from '../db/database.js';

const router = Router();

/**
 * GET /api/usage/summary - Get current period usage summary
 */
router.get('/summary', (req, res) => {
  try {
    const summary = getUsageSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/usage/history - Get daily usage history
 */
router.get('/history', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const history = getUsageHistory(days);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/usage/expensive-prompts - Get flagged expensive prompts and optimization recommendations
 */
router.get('/expensive-prompts', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const { getExpensivePrompts } = await import('../services/usageService.js');
    res.json({ success: true, expensivePrompts: getExpensivePrompts(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/usage/budget-warning - Check soft budget status
 */
router.get('/budget-warning', async (req, res) => {
  try {
    const { isNearSpendCap } = await import('../services/usageService.js');
    res.json({ success: true, ...isNearSpendCap() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/usage/cap - Update monthly spend cap
 */
router.put('/cap', (req, res) => {
  try {
    const { cap } = req.body;
    if (typeof cap !== 'number' || cap < 0) {
      return res.status(400).json({ error: 'Invalid cap value' });
    }
    setSetting('monthly_spend_cap', cap.toString());
    res.json({ success: true, cap });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
