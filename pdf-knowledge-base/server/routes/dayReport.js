import express from 'express';
import {
  getReportConfig,
  saveReportConfig,
  resetReportConfig,
  buildReportParts,
  AVAILABLE_SERVICES,
  SERVICE_SUB_FILTERS,
  sampleSection,
  scriptReport
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

// POST /api/day-report/sample - what Ims would say for one section, with its sliders as set (saved or not)
router.post('/sample', async (req, res) => {
  try {
    const section = req.body?.section;
    if (!section?.id) return res.status(400).json({ success: false, error: 'Which section?' });
    res.json({ success: true, ...(await sampleSection(section)) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Could not make an example' });
  }
});

// POST /api/day-report/script - the whole report as Ims would say it, from the sections as they are on the page
router.post('/script', async (req, res) => {
  try { res.json({ success: true, ...(await scriptReport(Array.isArray(req.body?.sections) ? req.body.sections : null)) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message || 'Could not write the script' }); }
});

// POST /api/day-report/preview - the same, from the sections as they are on the page (saved or not)
router.post('/preview', async (req, res) => {
  try {
    const { whoLine, parts, hour } = await buildReportParts({ markNews: false, sections: Array.isArray(req.body?.sections) ? req.body.sections : null });
    res.json({ success: true, whoLine, parts, hour });
  } catch (err) { res.status(500).json({ success: false, error: err.message || 'Failed to generate day report preview' }); }
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
