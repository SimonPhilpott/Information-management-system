import { Router } from 'express';
import { requireSession } from '../middleware/requireSession.js';
import { listGoals, getGoal, createGoal, updateGoal, deleteGoal, assessGoal, analyseGoal, getGoalPlan } from '../services/goalService.js';

const router = Router();
router.use(requireSession);
const fail = (res, err, code = 400) => res.status(code).json({ error: err.message });
const units = (req) => (req.query.units === 'mi' || req.body?.units === 'mi' ? 'mi' : 'km');

router.get('/', (req, res) => res.json({ success: true, goals: listGoals().map((g) => assessGoal(g)) }));

router.post('/', (req, res) => {
  try { const g = createGoal(req.body || {}); res.json({ success: true, goal: g, assessment: assessGoal(g) }); } catch (err) { fail(res, err); }
});
router.put('/:id', (req, res) => {
  try { const g = updateGoal(Number(req.params.id), req.body || {}); res.json({ success: true, goal: g, assessment: assessGoal(g) }); } catch (err) { fail(res, err); }
});
router.delete('/:id', (req, res) => { deleteGoal(Number(req.params.id)); res.json({ success: true }); });

router.get('/:id/plan', async (req, res) => {
  try { res.json({ success: true, plan: await getGoalPlan(Number(req.params.id), units(req)) }); } catch (err) { fail(res, err); }
});
router.post('/:id/plan', async (req, res) => {
  try { if (!getGoal(Number(req.params.id))) return fail(res, new Error('Goal not found.'), 404); res.json({ success: true, plan: await analyseGoal(Number(req.params.id), units(req)) }); } catch (err) { fail(res, err); }
});

export default router;
