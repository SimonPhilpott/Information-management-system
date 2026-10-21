import fs from 'fs';
import { Router } from 'express';
import { listBrews, listRecipes, startFromRecipe, saveAsRecipe, setFavourite, CATEGORIES, getBrew, saveBrew, deleteBrew, addLog, deleteLog, addTasting, deleteTasting, brewInsight, whatIf, setNutrientReminders, setStepReminders, STYLES, STATUSES, LOG_KINDS } from '../services/homebrewService.js';
import { shareRecipe, unshareRecipe, publicBase, recipePdf, labelsPdf, labelsHtml, labelLook, labelQr, listLabelFonts, addLabelFont, removeLabelFont, labelFontFile } from '../services/homebrewShare.js';
import express from 'express';
import { mainIngredients, pictureFile, listThemes, uploadBanner, setBannerChoice, savePixabayPhoto, listAllIngredients, setCustomIngredientKey, removeCustomIngredientKey, uploadIngredientPicture, savePixabayIngredientPhoto } from '../services/homebrewPictures.js';
import { searchPixabayPhotos } from '../services/homebrewPhotos.js';
import { setColourByYou, clearColourByYou, fillColours } from '../services/homebrewColours.js';
import { listInvites, invite, revokeInvite, recentSignIns, OWNER, personName, canonEmail } from '../services/decksService.js';
import { isApprovedSession } from '../middleware/requireSession.js';
import db from '../db/database.js';
import { migrateHomebrewIngredients } from '../services/homebrewCanonical.js';

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
// the theme pictures to choose from on the recipe form, and a photo of his own for the banner
router.get('/themes', wrap(() => ({ themes: listThemes() })));
router.post('/picture', express.raw({ type: ['image/*', 'application/octet-stream'], limit: '15mb' }), wrap(async (req) => ({ key: await uploadBanner(req.body) })));
router.get('/picture/:key', (req, res) => {
  const f = pictureFile(req.params.key);
  if (!f || !fs.existsSync(f)) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable').sendFile(f);
});
// search pixabay for banner photos with thumbnail previews, and save a picked photo
router.get('/pixabay/search', wrap(async (req) => {
  const q = req.query.q || '';
  const page = parseInt(req.query.page, 10) || 1;
  return searchPixabayPhotos(q, { page, perPage: 24 });
}));
router.post('/pixabay/pick', wrap(async (req) => {
  return savePixabayPhoto(req.body || {});
}));
// Admin: ingredient image management (list, custom image, upload square, pick Pixabay)
router.get('/admin/ingredients', onlyOwner, wrap(() => listAllIngredients()));
router.post('/admin/ingredients/custom', onlyOwner, wrap((req) => {
  setCustomIngredientKey(req.body?.name, req.body?.key);
  return { success: true, key: req.body?.key };
}));
router.delete('/admin/ingredients/custom/:name', onlyOwner, wrap((req) => {
  removeCustomIngredientKey(req.params.name);
  return { success: true };
}));
router.post('/admin/ingredients/upload', onlyOwner, express.raw({ type: ['image/*', 'application/octet-stream'], limit: '15mb' }), wrap(async (req) => {
  const key = await uploadIngredientPicture(req.body);
  if (req.query.name) setCustomIngredientKey(req.query.name, key);
  return { key };
}));
router.post('/admin/ingredients/pixabay/pick', onlyOwner, wrap(async (req) => {
  return savePixabayIngredientPhoto(req.body || {});
}));
router.post('/admin/ingredients/merge', onlyOwner, wrap(() => {
  const stats = migrateHomebrewIngredients(db);
  return { success: true, ...stats };
}));
// a brew made from a recipe shows the recipe's main ingredients and banner
router.get('/:id/main-ingredients', wrap((req) => { const brew = getBrew(req.params.id); if (!brew) throw new Error('No such brew'); return mainIngredients((brew.fromRecipe && getBrew(brew.fromRecipe)) || brew); }));
// the lettering to choose from for labels
router.get('/label-fonts', wrap(() => ({ fonts: listLabelFonts() })));
// his own fonts for label names: upload (?name= the file's name), show in the window, remove
router.post('/label-fonts', express.raw({ type: () => true, limit: '10mb' }), wrap((req) => ({ font: addLabelFont(req.body, req.query.name) })));
router.delete('/label-fonts/:id', wrap((req) => ({ removed: removeLabelFont(req.params.id) })));
router.get('/label-font/:id', (req, res) => {
  const f = labelFontFile(req.params.id);
  if (!f) return res.status(404).end();
  res.set({ 'Content-Type': f.mime, 'Cache-Control': 'public, max-age=31536000, immutable' }).sendFile(f.file);
});
router.get('/:id', wrap((req) => { const brew = getBrew(req.params.id); if (!brew) throw new Error('No such brew'); return { brew }; }));
// the recipe form's Look: the picture it shows (null = made for it) and the drink's colour ('' = worked out for it)
const saveLook = (id, body) => {
  if ('bannerChoice' in body) setBannerChoice(id, body.bannerChoice || null);
  if ('liquidChoice' in body) {
    if (/^#[0-9a-f]{6}$/i.test(body.liquidChoice || '')) setColourByYou(id, body.liquidChoice);
    else { clearColourByYou(id); fillColours().catch(() => {}); }
  }
  return getBrew(id);
};
router.post('/', wrap((req) => ({ brew: saveLook(saveBrew(null, req.body || {}).id, req.body || {}) })));
router.put('/:id', wrap((req) => ({ brew: saveLook(saveBrew(req.params.id, req.body || {}).id, req.body || {}) })));
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
// one label as a web page, for the Print labels window's live preview (the QR code is the real one if it's shared
// already, else a stand-in - previewing never shares the recipe)
router.get('/:id/labels/preview', async (req, res) => {
  try {
    const b = getBrew(req.params.id);
    if (!b) return res.status(404).send('No such brew');
    const src = getBrew((!b.isRecipe && b.fromRecipe) || b.id);
    const { base } = await publicBase(req);
    // the real link, so the preview's code can be scanned to check it (20 Oct: a stand-in pointed at /preview) - the
    // recipe is shared now, as making the labels would anyway
    const qrHtml = await labelQr(`${base}/api/share/recipe/${shareRecipe(src.id)}`);
    res.set('Content-Type', 'text/html; charset=utf-8').send(labelsHtml(b, { fontId: req.query.font, title: req.query.name, recipeText: req.query.recipeText, showRecipe: req.query.showRecipe, look: labelLook(req.query), qrHtml, preview: true }));
  } catch (err) { res.status(500).send(`Couldn't show the label: ${err.message}`); }
});
// bottle labels: A4 sheets of 10 (?count= how many labels; ?inline=1 to open rather than download)
router.get('/:id/labels', async (req, res) => {
  try {
    const b = getBrew(req.params.id);
    if (!b) return res.status(404).json({ error: 'No such brew' });
    // the QR code opens the recipe's shared page (a brew's: the recipe it came from) - shared now if it wasn't yet
    const token = shareRecipe((!b.isRecipe && b.fromRecipe) || b.id);
    const { base } = await publicBase(req);
    const { pdf, filename } = await labelsPdf(b, { count: req.query.count, fontId: req.query.font, title: req.query.name, recipeText: req.query.recipeText, showRecipe: req.query.showRecipe, look: labelLook(req.query), qrUrl: `${base}/api/share/recipe/${token}` });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `${req.query.inline ? 'inline' : 'attachment'}; filename="${filename.replace(/"/g, '')}"` }).send(pdf);
  } catch (err) { res.status(500).json({ error: `Couldn't make the labels: ${err.message}` }); }
});
router.get('/:id/pdf', async (req, res) => {
  try {
    const b = getBrew(req.params.id);
    if (!b) return res.status(404).json({ error: 'No such recipe' });
    const { pdf, filename } = await recipePdf(b);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `${req.query.inline ? 'inline' : 'attachment'}; filename="${filename.replace(/"/g, '')}"` }).send(pdf);
  } catch (err) { res.status(500).json({ error: `Couldn't make the PDF: ${err.message}` }); }
});

export default router;
