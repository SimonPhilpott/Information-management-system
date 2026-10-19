import { Router } from 'express';
import { addInstruction, listInstructions, updateInstruction, cancelInstruction, completeInstruction, deleteInstruction, describe } from '../services/imsInstructionsService.js';

// /api/ims-instructions - the Instructions page (Core functions): what Simon has asked Ims to do later.
const router = Router();
const withText = (i) => ({ ...i, description: describe(i) });

router.get('/', (req, res) => {
  try {
    res.json({ success: true, pending: listInstructions({ status: 'pending' }).map(withText), finished: listInstructions({ status: 'finished', limit: 100 }).map(withText) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req, res) => {
  try { res.json({ success: true, instruction: withText(addInstruction({ ...req.body, origin: 'web' })) }); } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/:id', (req, res) => {
  try { res.json({ success: true, instruction: withText(updateInstruction(req.params.id, req.body || {})) }); } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:id/done', (req, res) => {
  try { res.json({ success: true, instruction: withText(completeInstruction(req.params.id, req.body?.outcome || 'Marked done on the Instructions page')) }); } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:id/cancel', (req, res) => {
  try { res.json({ success: true, instruction: withText(cancelInstruction(req.params.id)) }); } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try { res.json({ success: deleteInstruction(req.params.id) }); } catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;
