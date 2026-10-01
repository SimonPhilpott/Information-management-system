import express from 'express';
import { generateAgpPdf } from '../services/agpService.js';
import { Router } from 'express';
import {
  estimateCarbsFromPhoto, getSummary, getDay, logCarbs, listCarbs, deleteCarbs,
  analyse, getSavedInsight, getNightscoutWriteStatus, setNightscoutSecret,
  testNightscoutWrite, getNightscoutDbSize, clearOldNightscout, getAutoClear, setAutoClear,
  getGlucoseThresholds, setGlucoseThresholds, resetGlucoseThresholds
} from '../services/glucoseHubService.js';
import { lookUpFood } from '../services/foodService.js';
import { getProfile, saveProfile, resetProfile, getSavedEvaluation, evaluateProfile, askProfileInsightQuestion } from '../services/glucoseInsightService.js';
import { invalidateDayReportCache } from '../services/morningReportService.js';
import { generateGlucosePdf, sendGlucosePdfEmail, getEmailStatus } from '../services/glucosePdfService.js';


const router = Router();
const fail = (res, err, code = 500) => res.status(code).json({ success: false, error: err.message });

router.get('/summary', (req, res) => {
  try { res.json({ success: true, ...getSummary(req.query.days), insight: getSavedInsight() }); } catch (err) { fail(res, err); }
});
router.get('/day', (req, res) => {
  try { res.json({ success: true, ...getDay(req.query.date) }); } catch (err) { fail(res, err); }
});

// Configurable blood glucose threshold bands
router.get('/thresholds', (req, res) => {
  try { res.json({ success: true, thresholds: getGlucoseThresholds() }); } catch (err) { fail(res, err); }
});
router.put('/thresholds', (req, res) => {
  try {
    const updated = setGlucoseThresholds(req.body);
    invalidateDayReportCache();
    res.json({ success: true, thresholds: updated });
  } catch (err) { fail(res, err, 400); }
});
router.post('/thresholds/reset', (req, res) => {
  try {
    const reset = resetGlucoseThresholds();
    invalidateDayReportCache();
    res.json({ success: true, thresholds: reset });
  } catch (err) { fail(res, err); }
});

router.post('/insight', async (req, res) => {
  try { res.json({ success: true, insight: await analyse(req.body?.days) }); } catch (err) { fail(res, err, 400); }
});
router.get('/carbs', (req, res) => {
  try { res.json({ success: true, carbs: listCarbs(Number(req.query.days) || 7) }); } catch (err) { fail(res, err); }
});
// A plate photo from the phone: an estimate to check - nothing is logged until it's confirmed.
router.post('/carbs/photo', express.raw({ type: 'image/*', limit: '12mb' }), async (req, res) => {
  try { res.json({ success: true, ...(await estimateCarbsFromPhoto(req.body, String(req.headers['content-type'] || 'image/jpeg').split(';')[0], String(req.query.note || '').slice(0, 300))) }); }
  catch (err) { fail(res, err, 400); }
});
router.post('/carbs', async (req, res) => {
  try { res.json({ success: true, entry: await logCarbs(req.body || {}) }); } catch (err) { fail(res, err, 400); }
});
router.delete('/carbs/:id', async (req, res) => {
  try { res.json({ success: await deleteCarbs(req.params.id) }); } catch (err) { fail(res, err); }
});
router.get('/food', async (req, res) => {
  try { res.json({ success: true, ...(await lookUpFood(req.query.q)) }); } catch (err) { fail(res, err, 400); }
});
router.get('/nightscout', async (req, res) => res.json({ success: true, ...getNightscoutWriteStatus(), dbSize: await getNightscoutDbSize(), autoClear: getAutoClear() }));
router.put('/nightscout/auto-clear', (req, res) => res.json({ success: true, autoClear: setAutoClear(Boolean(req.body?.enabled)) }));
router.post('/nightscout/cleanup', async (req, res) => {
  try { res.json({ success: true, ...(await clearOldNightscout(req.body?.months || 3)) }); } catch (err) { fail(res, err, 400); }
});
router.put('/nightscout', async (req, res) => {
  try {
    const st = setNightscoutSecret(req.body?.secret);
    if (st.configured) await testNightscoutWrite();
    res.json({ success: true, ...st });
  } catch (err) { if (req.body?.secret) setNightscoutSecret(''); fail(res, err, 400); }
});

// Continuously evaluative profile and pump settings insight endpoints
router.get('/profile', (req, res) => {
  try { res.json({ success: true, profile: getProfile() }); } catch (err) { fail(res, err); }
});
router.put('/profile', (req, res) => {
  try { res.json({ success: true, profile: saveProfile(req.body) }); } catch (err) { fail(res, err, 400); }
});
router.post('/profile/reset', (req, res) => {
  try { res.json({ success: true, profile: resetProfile() }); } catch (err) { fail(res, err); }
});
router.get('/profile/evaluation', (req, res) => {
  try { res.json({ success: true, evaluation: getSavedEvaluation() }); } catch (err) { fail(res, err); }
});
router.post('/profile/evaluate', async (req, res) => {
  try { res.json({ success: true, evaluation: await evaluateProfile(req.body?.days, req.body?.profile) }); }
  catch (err) { fail(res, err, 400); }
});
router.post('/profile/ask', async (req, res) => {
  try { res.json({ success: true, insight: await askProfileInsightQuestion(req.body?.question, req.body?.profile) }); }
  catch (err) { fail(res, err, 400); }
});

// PDF Generation & Email Dispatch Endpoints
router.get('/report/email-status', (req, res) => {
  try { res.json({ success: true, ...getEmailStatus() }); } catch (err) { fail(res, err); }
});

router.get('/report/pdf', async (req, res) => {
  try {
    const days = Number(req.query.days) || 14;
    const { pdf, filename } = await generateGlucosePdf({ days });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    fail(res, err);
  }
});

// Clinic AGP report (14 or 90 days, ending on ?end=YYYY-MM-DD or today) as a PDF for the diabetes team.
router.get('/report/agp', async (req, res) => {
  try {
    const { pdf, filename } = await generateAgpPdf({ days: Number(req.query.days) === 90 ? 90 : 14, end: req.query.end || null });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    fail(res, err);
  }
});

router.post('/report/email', async (req, res) => {
  try {
    const { days = 14, recipientEmail, subject, note } = req.body || {};
    const result = await sendGlucosePdfEmail({ days, recipientEmail, subject, note });
    res.json({ success: true, ...result });
  } catch (err) {
    fail(res, err, 400);
  }
});

export default router;

