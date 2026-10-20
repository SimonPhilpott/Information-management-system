import { Router } from 'express';
import { listBrews, listRecipes, startFromRecipe, saveAsRecipe, setFavourite, CATEGORIES, getBrew, saveBrew, deleteBrew, addLog, deleteLog, addTasting, deleteTasting, brewInsight, whatIf, setNutrientReminders, STYLES, STATUSES, LOG_KINDS } from '../services/homebrewService.js';
import { shareRecipe, unshareRecipe, publicBase, recipePdf } from '../services/homebrewShare.js';

// /api/homebrew - the Homebrew page (Personal)
const router = Router();
const wrap = (fn) => async (req, res) => {
  try { res.json({ success: true, ...(await fn(req)) }); } catch (err) { res.status(400).json({ error: err.message }); }
};

router.get('/', wrap(() => ({ brews: listBrews(), recipes: listRecipes(), categories: CATEGORIES, styles: STYLES, statuses: STATUSES, logKinds: LOG_KINDS })));
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
router.post('/:id/start', wrap((req) => ({ brew: startFromRecipe(req.params.id) })));
router.post('/:id/save-as-recipe', wrap((req) => ({ brew: saveAsRecipe(req.params.id) })));
router.post('/:id/favourite', wrap((req) => ({ brew: setFavourite(req.params.id, req.body?.favourite !== false) })));
router.post('/:id/what-if', wrap(async (req) => ({ result: await whatIf(req.params.id, req.body?.change) })));
// share a recipe as a link anyone can open (WhatsApp etc.), stop sharing it, or get it as a PDF
router.post('/:id/share', wrap(async (req) => {
  const token = shareRecipe(req.params.id);
  const { base, reachable } = await publicBase(req);
  return { token, url: `${base}/api/share/recipe/${token}`, pdfUrl: `${base}/api/share/recipe/${token}/pdf`, reachable };
}));
router.delete('/:id/share', wrap((req) => ({ stopped: unshareRecipe(req.params.id) })));
router.get('/:id/pdf', async (req, res) => {
  try {
    const b = getBrew(req.params.id);
    if (!b) return res.status(404).json({ error: 'No such recipe' });
    const { pdf, filename } = await recipePdf(b);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `${req.query.inline ? 'inline' : 'attachment'}; filename="${filename.replace(/"/g, '')}"` }).send(pdf);
  } catch (err) { res.status(500).json({ error: `Couldn't make the PDF: ${err.message}` }); }
});

export default router;
