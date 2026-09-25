import { Router } from 'express';
import { requireSession } from '../middleware/requireSession.js';
import {
  listRoutes, getRoute, deleteRoute, saveRoute, parseGpx, importKomootLink, connectKomoot, disconnectKomoot,
  getKomootStatus, listKomootTours, importKomootTour,
} from '../services/routeService.js';
import { estimatePlan, estimateDemand, routeRunHistory, getTargets, saveTargets, personalFit, SOURCES } from '../services/runPlanService.js';
import { getCurrentState, getLoopSettings } from '../services/runGlucoseService.js';

const router = Router();
router.use(requireSession); // glucose, insulin and route data are personal
const fail = (res, err, code = 400) => res.status(code).json({ error: err.message });

router.get('/now', (req, res) => res.json({ success: true, now: getCurrentState(), loop: getLoopSettings(), personal: personalFit('Run') }));
router.get('/targets', (req, res) => res.json({ success: true, targets: getTargets(), sources: SOURCES }));
router.put('/targets', (req, res) => { try { res.json({ success: true, targets: saveTargets(req.body || {}) }); } catch (err) { fail(res, err); } });

router.get('/routes', (req, res) => res.json({ success: true, routes: listRoutes() }));
router.get('/routes/:id', (req, res) => { const r = getRoute(Number(req.params.id)); r ? res.json({ success: true, route: r }) : fail(res, new Error('Route not found.'), 404); });
router.delete('/routes/:id', (req, res) => { deleteRoute(Number(req.params.id)) ? res.json({ success: true }) : fail(res, new Error('Route not found.'), 404); });

router.post('/routes/gpx', (req, res) => {
  try {
    const xml = String(req.body?.gpx || '');
    if (xml.length > 15 * 1024 * 1024) throw new Error('That file is too large.');
    const points = parseGpx(xml);
    if (points.length < 2) throw new Error('No route points were found - is this a GPX file?');
    const nameInFile = /<name>\s*([^<]{1,120}?)\s*<\/name>/.exec(xml)?.[1];
    res.json({ success: true, route: saveRoute({ source: 'gpx', name: req.body?.name || nameInFile || 'Imported route', points }) });
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

router.post('/demand', (req, res) => {
  try { res.json({ success: true, ...estimateDemand(req.body || {}) }); } catch (err) { fail(res, err); }
});

router.post('/estimate', (req, res) => {
  try { res.json({ success: true, ...estimatePlan(req.body || {}) }); } catch (err) { fail(res, err); }
});

export default router;
