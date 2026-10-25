import { Router } from 'express';
import {
  createArc, getArc, getArcs, recordEpisode, getEpisode, getEpisodes,
  linkEpisodes, getNarrativeGraph, getNarrativeSummaryForIms
} from '../services/narrativeGraphService.js';
import { requireSession } from '../middleware/requireSession.js';

const router = Router();
router.use(requireSession);

const fail = (res, err, code = 400) => res.status(code).json({ success: false, error: err.message });

router.get('/graph', (req, res) => {
  try {
    const data = getNarrativeGraph({
      limitArcs: req.query.limitArcs ? Number(req.query.limitArcs) : 10,
      limitEpisodes: req.query.limitEpisodes ? Number(req.query.limitEpisodes) : 50
    });
    res.json({ success: true, ...data });
  } catch (err) { fail(res, err); }
});

router.get('/summary', (req, res) => {
  try {
    res.json({ success: true, summary: getNarrativeSummaryForIms() });
  } catch (err) { fail(res, err); }
});

router.get('/arcs', (req, res) => {
  try {
    res.json({ success: true, arcs: getArcs(req.query.status || 'active') });
  } catch (err) { fail(res, err); }
});

router.post('/arcs', (req, res) => {
  try {
    const arc = createArc(req.body || {});
    res.json({ success: true, arc });
  } catch (err) { fail(res, err); }
});

router.get('/episodes', (req, res) => {
  try {
    const episodes = getEpisodes({
      limit: req.query.limit ? Number(req.query.limit) : 50,
      arcId: req.query.arcId || null,
      category: req.query.category || null
    });
    res.json({ success: true, episodes });
  } catch (err) { fail(res, err); }
});

router.post('/episodes', (req, res) => {
  try {
    const ep = recordEpisode(req.body || {});
    res.json({ success: true, episode: ep });
  } catch (err) { fail(res, err); }
});

router.post('/links', (req, res) => {
  try {
    const { sourceEpisodeId, targetEpisodeId, relationType, weight } = req.body || {};
    const result = linkEpisodes(sourceEpisodeId, targetEpisodeId, relationType, weight);
    res.json({ success: true, ...result });
  } catch (err) { fail(res, err); }
});

export default router;
