import { Router } from 'express';
import { listBrews, getBrew, saveBrew, deleteBrew, addLog, deleteLog, addTasting, deleteTasting, brewInsight, whatIf, setNutrientReminders, STYLES, STATUSES, LOG_KINDS } from '../services/homebrewService.js';

// /api/homebrew - the Homebrew page (Personal)
const router = Router();
const wrap = (fn) => async (req, res) => {
  try { res.json({ success: true, ...(await fn(req)) }); } catch (err) { res.status(400).json({ error: err.message }); }
};

router.get('/', wrap(() => ({ brews: listBrews(), styles: STYLES, statuses: STATUSES, logKinds: LOG_KINDS })));
router.get('/:id', wrap((req) => { const brew = getBrew(req.params.id); if (!brew) throw new Error('No such brew'); return { brew }; }));
router.post('/', wrap((req) => ({ brew: saveBrew(null, req.body || {}) })));
router.put('/:id', wrap((req) => ({ brew: saveBrew(req.params.id, req.body || {}) })));
router.delete('/:id', wrap((req) => ({ deleted: deleteBrew(req.params.id) })));
router.post('/:id/logs', wrap((req) => addLog(req.params.id, req.body || {})));
router.delete('/logs/:logId', wrap((req) => ({ deleted: deleteLog(req.params.logId) })));
router.post('/:id/tastings', wrap((req) => addTasting(req.params.id, req.body || {})));
router.delete('/tastings/:tastingId', wrap((req) => ({ deleted: deleteTasting(req.params.tastingId) })));
router.post('/:id/insight', wrap(async (req) => ({ insight: await brewInsight(req.params.id), brew: getBrew(req.params.id) })));
router.post('/:id/nutrient-reminders', wrap(async (req) => ({ reminders: await setNutrientReminders(req.params.id) })));
router.post('/:id/what-if', wrap(async (req) => ({ result: await whatIf(req.params.id, req.body?.change) })));

export default router;
