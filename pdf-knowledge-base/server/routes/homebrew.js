import fs from 'fs';
import { Router } from 'express';
import { listBrews, listRecipes, startFromRecipe, saveAsRecipe, setFavourite, CATEGORIES, getBrew, saveBrew, deleteBrew, addLog, deleteLog, addTasting, deleteTasting, brewInsight, whatIf, setNutrientReminders, setStepReminders, STYLES, STATUSES, LOG_KINDS } from '../services/homebrewService.js';
import { shareRecipe, unshareRecipe, publicBase, recipePdf } from '../services/homebrewShare.js';
import { mainIngredients, pictureFile } from '../services/homebrewPictures.js';
import { listInvites, invite, revokeInvite, recentSignIns, OWNER, personName, canonEmail } from '../services/decksService.js';
import { isApprovedSession } from '../middleware/requireSession.js';

// /api/homebrew - the Homebrew page (Personal)
const router = Router();
const wrap = (fn) => async (req, res) => {
  try { res.json({ success: true, ...(await fn(req)) }); } catch (err) { res.status(400).json({ error: err.message }); }
};

const viewer = (req) => ({ email: canonEmail(req.session?.user?.email), isOwner: isApprovedSession(req) });
const onlyOwner = (req, res, next) => (viewer(req).isOwner ? next() : res.status(403).json({ success: false, error: 'Only the owner can manage invites.' }));

router.get('/me', (req, res) => {
  const v = viewer(req);
  res.json({ success: true, email: v.isOwner ? OWNER : v.email, isOwner: v.isOwner, name: personName(v.email) });
});

// ---- invites (owner only) ----
router.get('/invites', onlyOwner, (req, res) => res.json({ success: true, invites: listInvites(), signIns: recentSignIns() }));
router.post('/invites', onlyOwner, (req, res) => {
  try {
    res.json({ success: true, invite: invite(req.body?.email) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});
router.delete('/invites/:email', onlyOwner, (req, res) => res.json({ success: revokeInvite(req.params.email) }));

router.get('/', wrap(() => ({ brews: listBrews(), recipes: listRecipes(), categories: CATEGORIES, styles: STYLES, statuses: STATUSES, logKinds: LOG_KINDS })));
// main-ingredient pictures for a recipe's header (made the first time it's opened, then kept)
router.get('/picture/:key', (req, res) => {
  const f = pictureFile(req.params.key);
  if (!f || !fs.existsSync(f)) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable').sendFile(f);
});
router.get('/:id/main-ingredients', wrap((req) => { const brew = getBrew(req.params.id); if (!brew) throw new Error('No such brew'); return mainIngredients(brew); }));
router.get('/:id', wrap((req) => { const brew = getBrew(req.params.id); if (!brew) throw new Error('No such brew'); return { brew }; }));
router.post('/', wrap((req) => ({ brew: saveBrew(null, req.body || {}) })));
router.put('/:id', wrap((req) => ({ brew: saveBrew(req.params.id, req.body || {}) })));
router.delete('/:id', wrap((req) => ({ deleted: deleteBrew(req.params.id) })));
router.post('/:id/logs', wrap((req) => addLog(req.params.id, req.body || {})));
router.delete('/logs/:logId', wrap((req) => ({ deleted: deleteLog(req.params.logId) })));
router.post('/:id/tastings', wrap((req) => addTasting(req.params.id, req.body || {})));
router.delete('/tastings/:tastingId', wrap((req) => ({ deleted: deleteTasting(req.params.tastingId) })));
router.post('/:id/insight', wrap(async (req) => ({ insight: await brewInsight(req.params.id), brew: getBrew(req.params.id) })));
router.post('/:id/step-reminders', wrap(async (req) => ({ reminders: await setStepReminders(req.params.id, { justPitched: Boolean(req.body?.justPitched) }) })));
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
