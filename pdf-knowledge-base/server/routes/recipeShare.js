import { Router } from 'express';
import { sharedRecipe, recipeHtml, recipePdf } from '../services/homebrewShare.js';

// /api/share - the only part of IMS open without signing in: a recipe Simon has chosen to share, as a page or a
// PDF, found by its unguessable token. Nothing else is reachable from here, and stopping sharing kills the link.
const router = Router();
const gone = (res) => res.status(404).type('html').send('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Recipe not found</title><body style="font:16px system-ui;padding:40px;text-align:center;color:#555">This recipe isn\'t shared any more.</body>');

router.get('/recipe/:token', (req, res) => {
  const b = sharedRecipe(req.params.token);
  if (!b) return gone(res);
  res.set('Cache-Control', 'no-store').type('html').send(recipeHtml(b, { pdfUrl: `${req.baseUrl}/recipe/${req.params.token}/pdf` }));
});

router.get('/recipe/:token/pdf', async (req, res) => {
  const b = sharedRecipe(req.params.token);
  if (!b) return gone(res);
  try {
    const { pdf, filename } = await recipePdf(b);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`, 'Cache-Control': 'no-store' }).send(pdf);
  } catch (err) { res.status(500).type('text').send(`Couldn't make the PDF: ${err.message}`); }
});

export default router;
