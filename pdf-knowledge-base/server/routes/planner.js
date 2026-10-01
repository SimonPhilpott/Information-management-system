import { Router } from 'express';
import { requireSession } from '../middleware/requireSession.js';
import {
  listRoutes, getRoute, deleteRoute, saveRoute, saveRouteAsync, parseGpx, importKomootLink, connectKomoot, disconnectKomoot,
  getKomootStatus, listKomootTours, importKomootTour,
} from '../services/routeService.js';
import { estimatePlan, estimateDemand, routeRunHistory, getTargets, saveTargets, personalFit, calculateHydration, SOURCES } from '../services/runPlanService.js';
import { getCurrentState, getLoopSettings } from '../services/runGlucoseService.js';
import { getWeather } from '../services/weatherService.js';
import { evaluateGlucoseReadiness } from '../services/glucoseReadinessService.js';
import {
  getRulebook, saveRulebook, resetRulebook,
  uploadBook, listBooks, getBook, deleteBook,
  scanBooksForRulebookImprovements, listFindings, resolveFinding,
  reviewResearchText
} from '../services/t1dRulebookService.js';

const router = Router();
router.use(requireSession); // glucose, insulin, routes and rulebook arbitration are personal
const fail = (res, err, code = 400) => res.status(code).json({ success: false, error: err.message });

router.get('/now', (req, res) => res.json({ success: true, now: getCurrentState(), loop: getLoopSettings(), personal: personalFit('Run') }));
router.get('/readiness', (req, res) => {
  try {
    const readiness = evaluateGlucoseReadiness({
      bg: req.query.bg ? Number(req.query.bg) : undefined,
      direction: req.query.direction,
      iob: req.query.iob ? Number(req.query.iob) : undefined,
      cob: req.query.cob ? Number(req.query.cob) : undefined,
      sessionType: req.query.sessionType,
      durationMin: req.query.durationMin ? Number(req.query.durationMin) : undefined,
      intensity: req.query.intensity
    });
    res.json({ success: true, readiness });
  } catch (err) {
    fail(res, err);
  }
});
router.get('/targets', (req, res) => res.json({ success: true, targets: getTargets(), sources: SOURCES }));
router.put('/targets', (req, res) => { try { res.json({ success: true, targets: saveTargets(req.body || {}) }); } catch (err) { fail(res, err); } });

router.get('/routes', (req, res) => res.json({ success: true, routes: listRoutes() }));
router.get('/routes/:id', (req, res) => { const r = getRoute(Number(req.params.id)); r ? res.json({ success: true, route: r }) : fail(res, new Error('Route not found.'), 404); });
router.delete('/routes/:id', (req, res) => { deleteRoute(Number(req.params.id)) ? res.json({ success: true }) : fail(res, new Error('Route not found.'), 404); });

router.post('/routes/gpx', async (req, res) => {
  try {
    const xml = String(req.body?.gpx || '');
    if (xml.length > 15 * 1024 * 1024) throw new Error('That file is too large.');
    const points = parseGpx(xml);
    if (points.length < 2) throw new Error('No route points were found - is this a GPX file?');
    const nameInFile = /<name>\s*([^<]{1,120}?)\s*<\/name>/.exec(xml)?.[1];
    const route = await saveRouteAsync({ source: 'gpx', name: req.body?.name || nameInFile || 'Imported route', points });
    res.json({ success: true, route });
  } catch (err) { fail(res, err); }
});

router.post('/routes/komoot-link', async (req, res) => {
  try { res.json({ success: true, route: await importKomootLink(req.body?.link) }); } catch (err) { fail(res, err); }
});
router.get('/komoot/status', (req, res) => res.json({ success: true, ...getKomootStatus() }));
router.post('/komoot/connect', async (req, res) => {
  try { res.json({ success: true, ...(await connectKomoot(req.body?.email, req.body?.password)) }); } catch (err) { fail(res, err); }
});
router.post('/komoot/disconnect', (req, res) => { disconnectKomoot(); res.json({ success: true, ...getKomootStatus() }); });
router.get('/komoot/tours', async (req, res) => {
  try { res.json({ success: true, tours: await listKomootTours(req.query.type === 'recorded' ? 'recorded' : 'planned') }); } catch (err) { fail(res, err); }
});
router.post('/komoot/import', async (req, res) => {
  try { res.json({ success: true, route: await importKomootTour(String(req.body?.tourId || '')) }); } catch (err) { fail(res, err); }
});

router.get('/routes/:id/history', (req, res) => {
  try { res.json({ success: true, ...routeRunHistory(Number(req.params.id)) }); } catch (err) { fail(res, err, 404); }
});

router.get('/weather', async (req, res) => {
  try {
    let loc = req.query.location || 'Leeds';
    if (req.query.lat && req.query.lng) {
      loc = `${req.query.lat},${req.query.lng}`;
    } else if (req.query.routeId) {
      const r = getRoute(Number(req.query.routeId));
      if (r?.path?.[0]) loc = `${r.path[0][0]},${r.path[0][1]}`;
    }
    const weather = await getWeather({ location: loc, days: 1 });
    res.json({ success: true, weather });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/demand', async (req, res) => {
  try { res.json({ success: true, ...(await estimateDemand(req.body || {})) }); } catch (err) { fail(res, err); }
});

router.post('/estimate', async (req, res) => {
  try { res.json({ success: true, ...(await estimatePlan(req.body || {})) }); } catch (err) { fail(res, err); }
});

// T1D Rulebook Core Endpoints
router.get('/rulebook', (req, res) => {
  try { res.json({ success: true, ...getRulebook() }); } catch (err) { fail(res, err); }
});

router.put('/rulebook', (req, res) => {
  try {
    const text = String(req.body?.rulebook || '').trim();
    if (!text) throw new Error('Rulebook content cannot be empty.');
    res.json({ success: true, ...saveRulebook(text) });
  } catch (err) { fail(res, err); }
});

router.post('/rulebook/reset', (req, res) => {
  try { res.json({ success: true, ...resetRulebook() }); } catch (err) { fail(res, err); }
});

// T1D Rulebook Books & Indexing Endpoints
router.get('/rulebook/books', (req, res) => {
  try {
    res.json({ success: true, books: listBooks() });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/rulebook/books/upload', async (req, res) => {
  try {
    const book = await uploadBook(req.body || {});
    res.json({ success: true, book });
  } catch (err) {
    fail(res, err);
  }
});

router.delete('/rulebook/books/:id', (req, res) => {
  try {
    const ok = deleteBook(req.params.id);
    if (!ok) return fail(res, new Error('Book not found.'), 404);
    res.json({ success: true });
  } catch (err) {
    fail(res, err);
  }
});

// T1D Rulebook AI Comparative Scanner
router.post('/rulebook/scan', async (req, res) => {
  try {
    const result = await scanBooksForRulebookImprovements(req.body || {});
    res.json({ success: true, ...result });
  } catch (err) {
    fail(res, err);
  }
});

// T1D Rulebook Conflict & Enhancement Findings
router.get('/rulebook/findings', (req, res) => {
  try {
    const findings = listFindings({
      status: req.query.status || null,
      bookId: req.query.bookId || null,
      type: req.query.type || null
    });
    res.json({ success: true, findings });
  } catch (err) {
    fail(res, err);
  }
});

// T1D Rulebook Finding Arbitration (User Decision: Replace, Add, or Dismiss)
router.post('/rulebook/findings/:id/resolve', (req, res) => {
  try {
    const result = resolveFinding(req.params.id, req.body || {});
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

// T1D Rulebook Direct Pasted Research Comparative Review
router.post('/rulebook/research/review', async (req, res) => {
  try {
    const result = await reviewResearchText(req.body || {});
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

export default router;
