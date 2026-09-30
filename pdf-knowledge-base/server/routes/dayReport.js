import express from 'express';
import {
  getReportConfig,
  saveReportConfig,
  resetReportConfig,
  buildReportParts,
  AVAILABLE_SERVICES,
  SERVICE_SUB_FILTERS
} from '../services/morningReportService.js';

const router = express.Router();

// GET /api/day-report/config
// Returns current sections, catalog of available services, and sub-filter schemas
router.get('/config', async (req, res) => {
  try {
    const sections = getReportConfig();
    res.json({
      success: true,
      sections,
      availableServices: AVAILABLE_SERVICES,
      subFilterSchemas: SERVICE_SUB_FILTERS
    });
  } catch (err) {
    console.error('[DayReportRoute] Failed to get config:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch day report configuration' });
  }
});

// PUT /api/day-report/config
// Updates sections ordering, enabled states, custom notes, custom items, and subFilters
router.put('/config', async (req, res) => {
  try {
    const { sections } = req.body;
    if (!sections || !Array.isArray(sections)) {
      return res.status(400).json({ success: false, error: 'Expected an array of sections in payload' });
    }
    const updated = saveReportConfig(sections);
    res.json({
      success: true,
      sections: updated,
      subFilterSchemas: SERVICE_SUB_FILTERS
    });
  } catch (err) {
    console.error('[DayReportRoute] Failed to save config:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to save day report configuration' });
  }
});

// POST /api/day-report/reset
// Resets report sections to factory default configuration
router.post('/reset', async (req, res) => {
  try {
    const reset = resetReportConfig();
    res.json({
      success: true,
      sections: reset,
      subFilterSchemas: SERVICE_SUB_FILTERS
    });
  } catch (err) {
    console.error('[DayReportRoute] Failed to reset config:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to reset day report configuration' });
  }
});

// GET /api/day-report/preview
// Generates a live test rendering of the day report based on the configured order and active data
router.get('/preview', async (req, res) => {
  try {
    const { whoLine, parts, hour } = await buildReportParts({ markNews: false });
    res.json({
      success: true,
      whoLine,
      parts,
      hour
    });
  } catch (err) {
    console.error('[DayReportRoute] Preview generation failed:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to generate day report preview' });
  }
});

export default router;
