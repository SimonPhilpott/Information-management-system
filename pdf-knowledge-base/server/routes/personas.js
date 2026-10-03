import express from 'express';
import {
  listPersonas, getPersona, activePersonaId, setActivePersona, savePersonaRaw, savePersonaParts, createPersona, deletePersona,
  getHouseRules, saveHouseRules, listHistory, readHistory, serializePersona,
} from '../services/personaService.js';
import { runPersonaTests, lastResults, listScenarios } from '../services/personaTestService.js';
import { invalidateDayReportCache } from '../services/morningReportService.js';

// Personas: /api/personas
const router = express.Router();

// Gemini's prebuilt voices (the same list as the chat page)
const VOICES = [
  ['Achernar', 'Soft'], ['Achird', 'Friendly'], ['Algenib', 'Gravelly'], ['Algieba', 'Smooth'], ['Alnilam', 'Firm'], ['Aoede', 'Breezy'],
  ['Autonoe', 'Bright'], ['Callirrhoe', 'Easy-going'], ['Charon', 'Informative'], ['Despina', 'Smooth'], ['Enceladus', 'Breathy'],
  ['Erinome', 'Clear'], ['Fenrir', 'Excitable'], ['Gacrux', 'Mature'], ['Iapetus', 'Clear'], ['Kore', 'Firm'], ['Laomedeia', 'Upbeat'],
  ['Leda', 'Youthful'], ['Orus', 'Firm'], ['Puck', 'Upbeat'], ['Pulcherrima', 'Forward'], ['Rasalgethi', 'Informative'], ['Sadachbia', 'Lively'],
  ['Sadaltager', 'Knowledgeable'], ['Schedar', 'Even'], ['Sulafat', 'Warm'], ['Umbriel', 'Easy-going'], ['Vindemiatrix', 'Gentle'],
  ['Zephyr', 'Bright'], ['Zubenelgenubi', 'Casual'],
].map(([name, desc]) => ({ name, desc }));

const ok = (res, body) => res.json({ success: true, ...body });
const bad = (res, err, code = 400) => res.status(code).json({ success: false, error: err.message || String(err) });

router.get('/', (req, res) => ok(res, { personas: listPersonas(), activeId: activePersonaId(), voices: VOICES, scenarios: listScenarios() }));

router.get('/house', (req, res) => ok(res, { raw: getHouseRules(), history: listHistory('_house') }));
router.put('/house', (req, res) => { try { saveHouseRules(String(req.body?.raw || '')); ok(res, { raw: getHouseRules() }); } catch (err) { bad(res, err); } });
router.get('/house/history/:v', (req, res) => { const raw = readHistory('_house', req.params.v); raw === null ? bad(res, new Error('Not found'), 404) : ok(res, { raw }); });

router.post('/', (req, res) => { try { ok(res, { persona: createPersona({ name: req.body?.name, fromId: req.body?.fromId || null }) }); } catch (err) { bad(res, err); } });

router.post('/preview-raw', (req, res) => {
  try {
    const { meta, body } = req.body || {};
    ok(res, { raw: serializePersona(meta || {}, body || '') });
  } catch (err) { bad(res, err); }
});

router.get('/:id', (req, res) => {
  const p = getPersona(req.params.id);
  if (!p) return bad(res, new Error('No such persona.'), 404);
  ok(res, { persona: p, active: p.id === activePersonaId(), history: listHistory(p.id), tests: lastResults(p.id) });
});

// whole file as Markdown (header + sections)
router.put('/:id/raw', (req, res) => {
  try { const p = savePersonaRaw(req.params.id, String(req.body?.raw || '')); if (p.id === activePersonaId()) invalidateDayReportCache(); ok(res, { persona: p }); } catch (err) { bad(res, err); }
});
// settings and/or sections
router.put('/:id', (req, res) => {
  try {
    if (!getPersona(req.params.id)) return bad(res, new Error('No such persona.'), 404);
    const p = savePersonaParts(req.params.id, { meta: req.body?.meta, body: req.body?.body });
    if (p.id === activePersonaId()) invalidateDayReportCache();
    ok(res, { persona: p });
  } catch (err) { bad(res, err); }
});
router.delete('/:id', (req, res) => { try { ok(res, { deleted: deletePersona(req.params.id) }); } catch (err) { bad(res, err); } });

// switch Ims to this persona everywhere (next conversation / announcement / report picks it up)
router.post('/:id/activate', (req, res) => {
  try { const p = setActivePersona(req.params.id); invalidateDayReportCache(); ok(res, { activeId: p.id }); } catch (err) { bad(res, err); }
});

router.get('/:id/history/:v', (req, res) => { const raw = readHistory(req.params.id, req.params.v); raw === null ? bad(res, new Error('Not found'), 404) : ok(res, { raw }); });

// test bench: { scenarios?: [ids] } - runs them with this persona and judges each
router.post('/:id/test', async (req, res) => {
  try { ok(res, await runPersonaTests(req.params.id, Array.isArray(req.body?.scenarios) && req.body.scenarios.length ? req.body.scenarios : null)); } catch (err) { bad(res, err, 500); }
});

export default router;
