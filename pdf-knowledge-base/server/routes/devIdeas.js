import { Router } from 'express';
import { listIdeas, addIdea, updateIdea, deleteIdea, CATEGORIES } from '../services/devIdeasService.js';

const router = Router();
const fail = (res, err, code = 500) => res.status(code).json({ success: false, error: err.message });

router.get('/', (req, res) => {
  try {
    res.json({
      success: true,
      ideas: listIdeas({ status: req.query.status, category: req.query.category }),
      categories: CATEGORIES
    });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/', (req, res) => {
  try {
    res.json({
      success: true,
      idea: addIdea({ text: req.body?.text, source: 'page', category: req.body?.category || 'Other' })
    });
  } catch (err) {
    fail(res, err, 400);
  }
});

router.patch('/:id', (req, res) => {
  try {
    res.json({
      success: true,
      idea: updateIdea(Number(req.params.id), req.body || {})
    });
  } catch (err) {
    fail(res, err, 400);
  }
});

router.delete('/:id', (req, res) => {
  try {
    res.json({
      success: deleteIdea(Number(req.params.id))
    });
  } catch (err) {
    fail(res, err);
  }
});

export default router;
