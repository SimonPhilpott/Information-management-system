import { Router } from 'express';
import crypto from 'crypto';
import config from '../config.js';
import { requireSession, isApprovedSession } from '../middleware/requireSession.js';
import { publicOrigin } from '../middleware/publicOrigin.js';
import {
  getStatus, saveAppCredentials, authorizeUrl, completeAuthorisation, disconnect, syncActivities,
  listActivities, listSports, getSummary, analyse, getSavedAnalysis,
} from '../services/stravaService.js';
import {
  matchActivity, getStoredMatch, getGlucoseBadges, matchPending, getMatchProgress, getLoggerStatus, getInsights, analyseGlucose, getSavedGlucoseAnalysis, backfillNightscout, importLibreCsv,
} from '../services/runGlucoseService.js';
import { analyseActivity, getSavedInsight } from '../services/runInsightService.js';
import { listRoutes, linkedRouteId, linkActivityRoute, suggestRoutes } from '../services/routeService.js';

const router = Router();
const fail = (res, err, code = 400) => res.status(code).json({ error: err.message });

// Strava sends the browser back here after you approve. There is no API token on this
// request, so it is checked the other way: the state we issued to THIS browser must come
// back, and this browser must be signed in with the approved Google account.
router.get('/callback', async (req, res) => {
  const back = (qs) => res.redirect(`${req.session?.stravaReturn || config.clientUrl}/ims/activities?${qs}`);
  try {
    const { code, state, scope, error } = req.query;
    if (error) return back(`strava=error&message=${encodeURIComponent(error === 'access_denied' ? 'You did not allow access on Strava.' : String(error))}`);
    if (!isApprovedSession(req)) return back('strava=error&message=' + encodeURIComponent('Sign in with your Google account first, then connect Strava.'));
    if (!state || state !== req.session.stravaState) return back('strava=error&message=' + encodeURIComponent('That sign-in did not start here. Press Connect Strava again.'));
    delete req.session.stravaState;
    await completeAuthorisation(String(code), String(scope || ''));
    // First connection: pull the whole history straight away, without holding the redirect up.
    syncActivities({ full: true }).catch((err) => console.error('[Strava] first sync failed:', err.message));
    return back('strava=connected');
  } catch (err) {
    console.error('[Strava] callback failed:', err.message);
    return back(`strava=error&message=${encodeURIComponent(err.message)}`);
  }
});

router.use(requireSession);

router.get('/status', (req, res) => { const o = publicOrigin(req); res.json({ success: true, ...getStatus(o ? new URL(o).hostname : null) }); });

router.put('/credentials', (req, res) => {
  try { res.json({ success: true, status: saveAppCredentials(req.body || {}) }); } catch (err) { fail(res, err); }
});

router.get('/connect-url', (req, res) => {
  try {
    // Sign in on the address the browser is using (ngrok or localhost) and come back to it.
    const origin = publicOrigin(req);
    req.session.stravaState = crypto.randomBytes(16).toString('hex');
    req.session.stravaReturn = origin || config.clientUrl;
    res.json({ success: true, url: authorizeUrl(req.session.stravaState, origin ? `${origin}/api/strava/callback` : undefined) });
  } catch (err) { fail(res, err); }
});

router.post('/disconnect', (req, res) => { disconnect(); res.json({ success: true, status: getStatus() }); });

router.post('/sync', async (req, res) => {
  try { res.json({ success: true, ...(await syncActivities({ full: Boolean(req.body?.full) })), status: getStatus() }); } catch (err) { fail(res, err); }
});

router.get('/activities', (req, res) => res.json({ success: true, ...listActivities(req.query) }));
router.get('/sports', (req, res) => res.json({ success: true, sports: listSports() }));
router.get('/summary', (req, res) => res.json({ success: true, ...getSummary() }));
router.get('/analysis', async (req, res) => { try { res.json({ success: true, analysis: await getSavedAnalysis(req.query.units === 'mi' ? 'mi' : 'km') }); } catch (err) { fail(res, err); } });
router.post('/analysis', async (req, res) => {
  try { res.json({ success: true, analysis: await analyse(req.body?.units === 'mi' ? 'mi' : 'km') }); } catch (err) { fail(res, err); }
});

// ---- glucose (Nightscout) matched to activities -----------------------------------------
router.get('/activities/:id/glucose', async (req, res) => {
  try { res.json({ success: true, glucose: await matchActivity(Number(req.params.id)) }); } catch (err) { fail(res, err); }
});
// AI review of one run against the user's targets, plus advice for next time on the same route.
router.get('/activities/:id/insight', async (req, res) => { try { res.json({ success: true, insight: await getSavedInsight(Number(req.params.id), req.query.units === 'mi' ? 'mi' : 'km') }); } catch (err) { fail(res, err); } });
router.post('/activities/:id/insight', async (req, res) => {
  try { res.json({ success: true, insight: await analyseActivity(Number(req.params.id), req.body?.units === 'mi' ? 'mi' : 'km') }); } catch (err) { fail(res, err); }
});
// Which saved route an activity followed (so its elevation is used for the advice).
router.get('/activities/:id/route', (req, res) => {
  const id = Number(req.params.id);
  res.json({ success: true, routeId: linkedRouteId(id), routes: listRoutes(), suggestions: suggestRoutes(Number(req.query.km) || 0).map((r) => r.id) });
});
router.put('/activities/:id/route', (req, res) => {
  try { res.json({ success: true, routeId: linkActivityRoute(Number(req.params.id), req.body?.routeId ?? null) }); } catch (err) { fail(res, err); }
});
router.get('/glucose/status', (req, res) => res.json({ success: true, logger: getLoggerStatus(), progress: getMatchProgress() }));
router.get('/glucose/badges', (req, res) => res.json({ success: true, badges: getGlucoseBadges() }));
router.post('/glucose/match', (req, res) => {
  const sports = Array.isArray(req.body?.sports) ? req.body.sports : null;
  if (getMatchProgress().running) return fail(res, new Error('Matching is already running.'));
  matchPending({ sports, retryNoGlucose: true }).catch((err) => console.error('[Strava] glucose matching failed:', err.message)); // runs in the background
  res.json({ success: true, started: true });
});
router.post('/glucose/backfill', async (req, res) => {
  try { res.json({ success: true, ...(await backfillNightscout({ maxDays: Math.min(365, Number(req.body?.days) || 90) })) }); } catch (err) { fail(res, err); }
});
router.post('/glucose/import-libre', async (req, res) => {
  try {
    const result = importLibreCsv(String(req.body?.csv || ''));
    matchPending({ retryNoGlucose: true }).catch((err) => console.error('[Strava] glucose matching failed:', err.message));
    res.json({ success: true, ...result });
  } catch (err) { fail(res, err); }
});
router.get('/glucose/insights', async (req, res) => { try { res.json({ success: true, insights: getInsights(String(req.query.sport || 'Run')), analysis: await getSavedGlucoseAnalysis(String(req.query.sport || 'Run'), req.query.units === 'mi' ? 'mi' : 'km') }); } catch (err) { fail(res, err); } });
router.post('/glucose/analysis', async (req, res) => {
  try { res.json({ success: true, analysis: await analyseGlucose(String(req.body?.sport || 'Run'), req.body?.units === 'mi' ? 'mi' : 'km') }); } catch (err) { fail(res, err); }
});

export default router;
