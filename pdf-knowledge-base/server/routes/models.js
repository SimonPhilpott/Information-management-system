import express from 'express';
import { getOverview, setModelFor, rollback, resetToDefault, probeModel, SERVICES, getModelFor } from '../services/modelRegistry.js';
import { sampleModel, auditModel, assessModels, assessmentProgress } from '../services/modelAudit.js';

// Model Switcher: /api/models
const router = express.Router();

router.get('/', async (req, res) => {
  try { res.json({ success: true, ...(await getOverview({ refresh: req.query.refresh === '1' })) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Test button: a real call that comes back with something to hear or see (no switch)
router.post('/probe', async (req, res) => {
  const { model, kind } = req.body || {};
  if (!model) return res.status(400).json({ success: false, error: 'model required' });
  try {
    const out = await sampleModel(String(model), kind || 'text');
    await probeModel(String(model), kind || 'text'); // keeps the "answers" badge up to date
    res.json({ success: true, model, ...out });
  } catch (err) {
    res.json({ success: true, model, ok: false, error: String(err.message || err) });
  }
});

// Assess models for every service of their kind (persona included). Runs in the background;
// the page polls /assess/status. { model } for one, { all: true } for everything, else new/unassessed.
router.post('/assess', (req, res) => {
  const { model, all } = req.body || {};
  if (assessmentProgress().running) return res.status(409).json({ success: false, error: 'An assessment is already running.' });
  assessModels(model ? { models: [String(model)] } : { onlyNew: !all }).catch((err) => console.warn('[Models] assess:', err.message));
  res.json({ success: true, started: true });
});
router.get('/assess/status', (req, res) => res.json({ success: true, ...assessmentProgress() }));

// Mini audit: every service on a model (or one service) tried with the features it uses
router.post('/audit', async (req, res) => {
  try {
    const { model, service } = req.body || {};
    const target = model || (service && getModelFor(service));
    if (!target) return res.status(400).json({ success: false, error: 'model or service required' });
    res.json({ success: true, audit: await auditModel(target, service && !model ? [service] : null) });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Switch a service: tested first, so a switch never lands on a model that won't answer; then every
// service on that model is audited
router.post('/:service', async (req, res) => {
  try {
    const svc = SERVICES.find((s) => s.key === req.params.service);
    if (!svc) return res.status(404).json({ success: false, error: 'Unknown service' });
    const model = String(req.body?.model || '');
    if (!model) return res.status(400).json({ success: false, error: 'model required' });
    const probe = await probeModel(model, svc.kind);
    if (!probe.ok) return res.status(409).json({ success: false, error: `${model} didn't answer the test call, so nothing was changed: ${probe.error}`, probe });
    const selection = setModelFor(svc.key, model, req.body?.note || '');
    res.json({ success: true, selection, probe, audit: await auditModel(model) });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.post('/:service/rollback', async (req, res) => {
  try {
    const selection = rollback(req.params.service);
    res.json({ success: true, selection, audit: await auditModel(selection.current) });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.post('/:service/reset', async (req, res) => {
  try {
    const selection = resetToDefault(req.params.service);
    res.json({ success: true, selection, audit: await auditModel(selection.current) });
  } catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

export default router;
