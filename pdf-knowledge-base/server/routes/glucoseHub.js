import { Router } from 'express';
import { getSummary, getDay, logCarbs, listCarbs, deleteCarbs, analyse, getSavedInsight, getNightscoutWriteStatus, setNightscoutSecret, testNightscoutWrite, getNightscoutDbSize, clearOldNightscout, getAutoClear, setAutoClear } from '../services/glucoseHubService.js';
import { lookUpFood } from '../services/foodService.js';

const router = Router();
const fail = (res, err, code = 500) => res.status(code).json({ success: false, error: err.message });

router.get('/summary', (req, res) => {
  try { res.json({ success: true, ...getSummary(req.query.days), insight: getSavedInsight() }); } catch (err) { fail(res, err); }
});
router.get('/day', (req, res) => {
  try { res.json({ success: true, ...getDay(req.query.date) }); } catch (err) { fail(res, err); }
});
router.post('/insight', async (req, res) => {
  try { res.json({ success: true, insight: await analyse(req.body?.days) }); } catch (err) { fail(res, err, 400); }
});
router.get('/carbs', (req, res) => {
  try { res.json({ success: true, carbs: listCarbs(Number(req.query.days) || 7) }); } catch (err) { fail(res, err); }
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

export default router;
