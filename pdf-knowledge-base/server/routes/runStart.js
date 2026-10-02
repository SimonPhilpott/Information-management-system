import { Router } from 'express';
import { startArmedRun, cancelArmedRun } from '../services/runAlertsService.js';
import { recordIntakeFromPhone } from '../services/runLearningService.js';

// The Start run / Cancel buttons on the "Ready when you are" phone notification. The phone isn't signed in
// to IMS, so these are open, guarded by the one-time token in the path (runAlertsService.armRun).
const router = Router();
const reply = (res, fn) => fn().then((out) => res.json({ success: true, ...out })).catch((err) => res.status(404).json({ success: false, error: err.message }));
// Taken / Skipped on a carb or water reminder (the run's own token guards it)
const logIntake = (req, res) => reply(res, () => recordIntakeFromPhone(req.params.token, req.params.intakeId, req.params.action === 'skipped' ? 'skipped' : 'taken'));
router.post('/log/:token/:intakeId/:action', logIntake);
router.get('/log/:token/:intakeId/:action', logIntake);
router.post('/:token', (req, res) => reply(res, () => startArmedRun(req.params.token)));
router.get('/:token', (req, res) => reply(res, () => startArmedRun(req.params.token)));
router.post('/:token/cancel', (req, res) => reply(res, () => cancelArmedRun(req.params.token)));
export default router;
