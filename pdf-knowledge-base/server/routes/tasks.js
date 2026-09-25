import { Router } from 'express';
import { createTask, listTasks, getTask, deleteTask, rerunTask } from '../services/tasksService.js';

const router = Router();
const fail = (res, err, code = 500) => res.status(code).json({ success: false, error: err.message });

router.get('/', (req, res) => { try { res.json({ success: true, tasks: listTasks() }); } catch (err) { fail(res, err); } });
router.post('/', async (req, res) => { try { res.json({ success: true, task: await createTask({ ...(req.body || {}), origin: 'page' }) }); } catch (err) { fail(res, err, 400); } });
router.get('/:id', (req, res) => { const t = getTask(req.params.id); return t ? res.json({ success: true, task: t }) : fail(res, new Error('Task not found.'), 404); });
router.post('/:id/rerun', (req, res) => { try { res.json({ success: true, task: rerunTask(req.params.id) }); } catch (err) { fail(res, err, 404); } });
router.delete('/:id', (req, res) => { try { res.json({ success: deleteTask(req.params.id) }); } catch (err) { fail(res, err); } });

export default router;
