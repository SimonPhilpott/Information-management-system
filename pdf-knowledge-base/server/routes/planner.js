import { Router } from 'express';
import { getSetting, setSetting } from '../db/database.js';
import { requireSession } from '../middleware/requireSession.js';
import {
  listRoutes, getRoute, deleteRoute, saveRoute, saveRouteAsync, parseGpx, importKomootLink, connectKomoot, disconnectKomoot,
  getKomootStatus, listKomootTours, importKomootTour, renameRoute } from '../services/routeService.js';
import { estimatePlan, estimateDemand, routeRunHistory, getTargets, saveTargets, personalFit, calculateHydration, SOURCES } from '../services/runPlanService.js';
import { getCurrentState, getLoopSettings } from '../services/runGlucoseService.js';
import { getWeather } from '../services/weatherService.js';
import { sendRunAlerts, clearRunAlerts, alertStatus, suggestedStart, routeGpx, getAlertSettings, saveAlertSettings, testTasker, testPush, armRun, armedRun } from '../services/runAlertsService.js';
import { findRoutes, findDuplicateRoutes, deleteAllDuplicates, komootSyncStatus, startKomootSync } from '../services/routeFinderService.js';
import { evaluateGlucoseReadiness } from '../services/glucoseReadinessService.js';
import { syncActivities } from '../services/stravaService.js';
import { logNightscout } from '../services/runGlucoseService.js';
import {
  retrospective, latestRetrospectiveForRoute, analyseSession, sessionChart, routePlans, currentSentPlan, refreshLearnings, listLearnings, decideLearning, updateIntake, addIntake, deleteIntake,
  addNote, deleteNote, setEffort, linkSessionManually, linkSessions,
} from '../services/runLearningService.js';
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

// The route chosen in the Run Planner, kept in IMS so it survives a refresh and is the same on every device.
router.get('/selected-route', (req, res) => {
  const id = Number(getSetting('runplanner_selected_route')) || null;
  res.json({ success: true, routeId: id && getRoute(id) ? id : null });
});
router.put('/selected-route', (req, res) => {
  const id = Number(req.body?.routeId) || null;
  setSetting('runplanner_selected_route', id && getRoute(id) ? String(id) : '');
  res.json({ success: true, routeId: id });
});
router.get('/routes', (req, res) => res.json({ success: true, routes: listRoutes() }));
// Route finder and duplicate finder (before /routes/:id, which would otherwise swallow these paths)
router.get('/routes/find', async (req, res) => {
  try { res.json({ success: true, ...(await findRoutes({ shape: req.query.shape || 'any', minKm: req.query.minKm, maxKm: req.query.maxKm, minMinutes: req.query.minMinutes, maxMinutes: req.query.maxMinutes })) }); } catch (err) { fail(res, err); }
});
router.delete('/routes/duplicates', async (req, res) => {
  try { res.json({ success: true, ...(await deleteAllDuplicates()) }); } catch (err) { fail(res, err); }
});
router.get('/routes/duplicates', async (req, res) => {
  try { res.json({ success: true, ...(await findDuplicateRoutes()) }); } catch (err) { fail(res, err); }
});
router.get('/komoot/sync', async (req, res) => {
  try { res.json({ success: true, ...(await komootSyncStatus()) }); } catch (err) { fail(res, err); }
});
router.post('/komoot/sync', async (req, res) => {
  try { res.json({ success: true, job: await startKomootSync() }); } catch (err) { fail(res, err); }
});
// "Send to my phone": carb and water stops as Google Calendar alerts, and the route as GPX
router.get('/alerts', async (req, res) => { try { const a = armedRun(); res.json({ success: true, sent: alertStatus(), settings: getAlertSettings(), armed: a ? { name: a.name, armedAt: a.armedAt } : null, ...(await suggestedStart()) }); } catch (err) { fail(res, err); } });
router.put('/alerts/settings', (req, res) => { try { res.json({ success: true, settings: saveAlertSettings(req.body || {}) }); } catch (err) { fail(res, err, 400); } });
router.post('/alerts/push-test', async (req, res) => { try { res.json({ success: true, ...(await testPush()) }); } catch (err) { fail(res, err, 400); } });
router.post('/alerts/tasker-test', async (req, res) => { try { res.json({ success: true, ...(await testTasker()) }); } catch (err) { fail(res, err, 400); } });
router.post('/alerts', async (req, res) => {
  try {
    const b = req.body || {};
    if (b.startMode === 'tap') return res.json({ success: true, armed: await armRun(b) });
    // startNow: timed from this moment (the test run, when not waiting for a tap)
    res.json({ success: true, sent: await sendRunAlerts(b.startNow ? { ...b, startAtMs: Date.now() } : b) });
  } catch (err) { fail(res, err); }
});
router.delete('/alerts', async (req, res) => { try { res.json({ success: true, ...(await clearRunAlerts()) }); } catch (err) { fail(res, err); } });
router.get('/routes/:id/gpx', (req, res) => {
  try { const { name, gpx } = routeGpx(Number(req.params.id)); res.setHeader('Content-Type', 'application/gpx+xml'); res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\w .-]+/g, '_')}.gpx"`); res.send(gpx); } catch (err) { fail(res, err, 404); }
});
router.get('/routes/:id', (req, res) => { const r = getRoute(Number(req.params.id)); r ? res.json({ success: true, route: r }) : fail(res, new Error('Route not found.'), 404); });
router.patch('/routes/:id', (req, res) => { try { res.json({ success: true, route: renameRoute(Number(req.params.id), req.body?.name) }); } catch (err) { fail(res, err, 400); } });
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
    let loc = req.query.location || ''; // blank = home (Weather page)
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

// Run learning: the retrospective for one run (plan vs actual, what you took, your notes) and the lessons
// across runs - suggested, then accepted or dismissed by you before the planner uses them.
router.get('/learning', async (req, res) => {
  try {
    // "Check for new runs": fetch the latest from Strava and Nightscout first, then link and analyse
    let check = null;
    if (req.query.sync === '1') {
      check = {};
      try { check.strava = await syncActivities(); } catch (err) { check.stravaError = err.message; }
      try { await logNightscout(); } catch (err) { check.nightscoutError = err.message; }
    }
    const linked = await linkSessions();
    res.json({ success: true, ...refreshLearnings(), ...(check ? { check: { ...check, linked: linked.length } } : {}) });
  } catch (err) { fail(res, err); }
});
router.post('/learning/:id/:decision', (req, res) => {
  try { res.json({ success: true, ...decideLearning(Number(req.params.id), req.params.decision) }); } catch (err) { fail(res, err); }
});
// plans as sent: the one the phone is following now, one by its run, and every plan sent for a route
router.get('/plans/current', async (req, res) => { try { res.json({ success: true, sent: await currentSentPlan() }); } catch (err) { fail(res, err); } });
router.get('/plans/:id', async (req, res) => { try { res.json({ success: true, ...(await sessionChart(Number(req.params.id))) }); } catch (err) { fail(res, err, 404); } });
router.get('/routes/:id/plans', (req, res) => { try { res.json({ success: true, plans: routePlans(Number(req.params.id)) }); } catch (err) { fail(res, err); } });
router.get('/retro/latest', async (req, res) => {
  try { res.json({ success: true, ...(await latestRetrospectiveForRoute(Number(req.query.routeId))) }); } catch (err) { fail(res, err); }
});
router.get('/retro/:activityId', async (req, res) => {
  try { res.json({ success: true, ...(await retrospective(Number(req.params.activityId), { refresh: req.query.refresh === '1', peek: req.query.peek === '1' })) }); } catch (err) { fail(res, err); }
});
const reanalyse = async (sessionId) => { try { await analyseSession(sessionId); refreshLearnings(); } catch (_) { /* shown on reload */ } };
router.patch('/retro/intakes/:id', async (req, res) => {
  try { const it = await updateIntake(Number(req.params.id), req.body || {}); await reanalyse(it.session_id); res.json({ success: true, intake: it }); } catch (err) { fail(res, err); }
});
router.delete('/retro/intakes/:id', async (req, res) => {
  try { res.json({ success: true, deleted: await deleteIntake(Number(req.params.id)) }); } catch (err) { fail(res, err); }
});
router.post('/retro/sessions/:id/intakes', async (req, res) => {
  try { const list = await addIntake(Number(req.params.id), req.body || {}); await reanalyse(Number(req.params.id)); res.json({ success: true, intakes: list }); } catch (err) { fail(res, err); }
});
router.post('/retro/sessions/:id/notes', async (req, res) => {
  try { const notes = addNote(Number(req.params.id), req.body || {}); await reanalyse(Number(req.params.id)); res.json({ success: true, notes }); } catch (err) { fail(res, err); }
});
router.delete('/retro/notes/:id', (req, res) => { res.json({ success: true, deleted: deleteNote(Number(req.params.id)) }); });
router.put('/retro/sessions/:id/effort', async (req, res) => {
  try { setEffort(Number(req.params.id), req.body?.effort); await reanalyse(Number(req.params.id)); res.json({ success: true }); } catch (err) { fail(res, err); }
});
router.post('/retro/sessions/:id/link', async (req, res) => {
  try { await linkSessionManually(Number(req.params.id), Number(req.body?.activityId)); res.json({ success: true, ...listLearnings() }); } catch (err) { fail(res, err); }
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
