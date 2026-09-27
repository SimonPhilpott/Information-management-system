import fs from 'fs';
import express, { Router } from 'express';
import {
  CAMPAIGN_KINDS, getCampaignCards, listCampaigns, getCampaign, createCampaign, updateCampaign, deleteCampaign,
  saveScenario, removeScenario, saveCampaignCard, removeCampaignCard, addNote, removeNote, campaignScenarios,
  setBanner, removeBanner, bannerFile, voteDelete, campaignKinds, addLogEntry, updateLogEntry, removeLogEntry, arkhamSetup,
} from '../services/campaignsService.js';
import { arkhamPins, arkhamLore, moveArkhamPin } from '../services/decks/arkhamMap.js';
import { OWNER, canonEmail, listInvites, personName } from '../services/decksService.js';
import { scenarioPins, movePin, resetPin, scenarioLore } from '../services/decks/middleEarthMap.js';
import { startRulebookImport, rulebookStatus, ruleCheck, saveGeneralRuleCheck, listGeneralRuleChecks, rulebookPdf } from '../services/decks/rulebooks.js';
import { saveRuleCheck, startEpilogue, epilogueStatus, chronicleStatus, writeChronicle, editChapter, rewriteChapter, chapterForReading, lockChapter, newTake, newPicture, scenarioRewards, suggestTitle } from '../services/campaignsService.js';
import { artFile } from '../services/decks/chronicleArt.js';
import { narrate, narrationFile } from '../services/decks/chronicleVoice.js';
import { isApprovedSession } from '../middleware/requireSession.js';

// Campaign tracking, part of the deck builder (mounted at /api/decks/campaigns so invited guests can
// use it). Everyone sees every campaign; a campaign's players change it.
const router = Router();
const who = (req) => (isApprovedSession(req) ? OWNER : canonEmail(req.session?.user?.email));
const fail = (res, err, code = 400) => res.status(err.status || code).json({ success: false, error: err.message });
const wrap = (fn) => async (req, res) => { try { res.json({ success: true, ...(await fn(req)) }); } catch (err) { fail(res, err); } };
// ?game= picks the game (lotr, ahlcg); Lord of the Rings when it's left out.
const gameOf = (req) => (['lotr', 'ahlcg'].includes(String(req.query.game || req.body?.game || '')) ? String(req.query.game || req.body?.game) : 'lotr');

router.get('/options', wrap(async (req) => ({
  kinds: campaignKinds(gameOf(req)),
  people: [{ email: OWNER, name: personName(OWNER) }, ...listInvites().filter((i) => !i.revokedAt).map((i) => ({ email: i.email, name: i.name || personName(i.email) }))],
  me: who(req),
})));
router.get('/cards', wrap(async (req) => ({ cards: gameOf(req) === 'ahlcg' ? [] : await getCampaignCards('lotr') })));
router.get('/scenarios', wrap(async (req) => ({ scenarios: (await campaignScenarios(gameOf(req), who(req))).map((s) => ({ id: s.id, name: s.name, pack: s.pack, community: s.community, owned: s.owned })) })));

// The campaign map: where each scenario sits (dragging a pin moves it for everyone).
router.post('/map/pins', wrap(async (req) => {
  const names = Array.isArray(req.body?.names) ? req.body.names.slice(0, 300).map(String) : [];
  return gameOf(req) === 'ahlcg' ? arkhamPins(names) : { pins: scenarioPins(names) };
}));
router.post('/map/lore', wrap(async (req) => {
  const items = (Array.isArray(req.body?.items) ? req.body.items : []).slice(0, 200).map((x) => ({ name: String(x.name || ''), pack: x.pack ? String(x.pack) : null })).filter((x) => x.name);
  return gameOf(req) === 'ahlcg' ? arkhamLore(items.map((x) => x.name)) : scenarioLore(items);
}));
router.put('/map/pins', wrap(async (req) => { (gameOf(req) === 'ahlcg' ? moveArkhamPin : movePin)(req.body?.scenario, req.body?.x, req.body?.y, who(req)); return {}; }));
// An Arkham campaign type's setup from its guide: the chaos bag at each difficulty and the log's sections.
router.get('/arkham/setup', wrap(async (req) => ({ setup: await arkhamSetup(String(req.query.kind || '')) })));
router.delete('/map/pins', wrap(async (req) => ({ reset: resetPin(req.body?.scenario) })));

// The official rulebooks: download, add to the library and index (owner only - it writes to their Drive).
router.get('/rulebooks/status', wrap(async (req) => rulebookStatus(gameOf(req))));
router.post('/rulebooks/import', wrap(async (req) => {
  if (!isApprovedSession(req)) { const e = new Error('Only the IMS owner can add books to the library.'); e.status = 403; throw e; }
  return { job: startRulebookImport(gameOf(req)) };
}));

// Rule checks across every rulebook, from the Campaigns page (shared), and the cited rulebooks' PDFs.
router.get('/rules', wrap(async (req) => ({ checks: listGeneralRuleChecks(gameOf(req)).map((x) => ({ ...x, byName: personName(x.by) })) })));
router.post('/rules', wrap(async (req) => {
  const game = gameOf(req);
  const result = await ruleCheck({ question: req.body?.question, all: true, game });
  saveGeneralRuleCheck({ question: String(req.body.question).trim(), ...result }, who(req), game);
  return { checks: listGeneralRuleChecks(game).map((x) => ({ ...x, byName: personName(x.by) })) };
}));
router.get('/rulebooks/pdf/:driveFileId', async (req, res) => {
  try {
    const { file, filename } = await rulebookPdf(req.params.driveFileId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/[^\x20-\x7e]|"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(file);
  } catch (err) { fail(res, err, 500); }
});

router.get('/', wrap(async (req) => ({ campaigns: listCampaigns(gameOf(req), who(req)) })));
router.post('/', wrap(async (req) => ({ campaign: createCampaign(gameOf(req), req.body || {}, who(req)) })));
router.get('/:id', wrap(async (req) => { const c = getCampaign(req.params.id, who(req)); if (!c) { const e = new Error('Campaign not found.'); e.status = 404; throw e; } return { campaign: c }; }));
router.put('/:id', wrap(async (req) => ({ campaign: updateCampaign(req.params.id, req.body || {}, who(req)) })));
// Deleting needs every player to vote for it (POST vote, DELETE takes the vote back).
router.post('/:id/delete-vote', wrap(async (req) => voteDelete(req.params.id, who(req), true)));
router.delete('/:id/delete-vote', wrap(async (req) => voteDelete(req.params.id, who(req), false)));

// The campaign's banner image: uploaded as the raw file, served back to anyone in the deck builder.
router.get('/:id/banner', (req, res) => {
  const f = bannerFile(req.params.id);
  if (!f) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.sendFile(f);
});
router.post('/:id/banner', express.raw({ type: 'image/*', limit: '9mb' }), wrap(async (req) => ({ campaign: setBanner(req.params.id, req.body, req.headers['content-type'], who(req)) })));
router.delete('/:id/banner', wrap(async (req) => ({ campaign: removeBanner(req.params.id, who(req)) })));

router.post('/:id/scenarios', wrap(async (req) => ({ campaign: saveScenario(req.params.id, req.body || {}, who(req)) })));
router.delete('/:id/scenarios/:entry', wrap(async (req) => ({ campaign: removeScenario(req.params.id, req.params.entry, who(req)) })));
// Arkham's campaign log: entries under the guide's sections, crossed out or removed.
router.post('/:id/log', wrap(async (req) => ({ campaign: addLogEntry(req.params.id, req.body || {}, who(req)) })));
router.put('/:id/log/:entry', wrap(async (req) => ({ campaign: updateLogEntry(req.params.id, req.params.entry, req.body || {}, who(req)) })));
router.delete('/:id/log/:entry', wrap(async (req) => ({ campaign: removeLogEntry(req.params.id, req.params.entry, who(req)) })));
router.post('/:id/cards', wrap(async (req) => ({ campaign: saveCampaignCard(req.params.id, req.body || {}, who(req)) })));
router.delete('/:id/cards/:entry', wrap(async (req) => ({ campaign: removeCampaignCard(req.params.id, req.params.entry, who(req)) })));
// Rule check: the core rules + this campaign's rules + the scenario's rulesheet. Kept on the campaign.
router.post('/:id/rules', wrap(async (req) => {
  const c = getCampaign(req.params.id, who(req));
  if (!c) { const e = new Error('Campaign not found.'); e.status = 404; throw e; }
  const result = await ruleCheck({ kind: c.kind, scenarioPack: req.body?.scenarioPack || null, scenarioName: req.body?.scenarioName || null, question: req.body?.question, game: c.game });
  return { campaign: saveRuleCheck(c.id, { question: String(req.body.question).trim(), scenarioName: req.body?.scenarioName || null, ...result }, who(req)) };
}));
// The chronicle: a chapter per scenario, written in the background as the campaign is played.
router.get('/:id/chronicle', wrap(async (req) => chronicleStatus(req.params.id, who(req)) || {}));
router.post('/:id/chronicle', wrap(async (req) => writeChronicle(req.params.id, who(req))));
// Edit a chapter by hand, or have it written afresh (chapter = scenario name, or '__tale').
router.put('/:id/chronicle/chapter', wrap(async (req) => editChapter(req.params.id, String(req.body?.chapter || ''), req.body || {}, who(req))));
router.put('/:id/chronicle/lock', wrap(async (req) => lockChapter(req.params.id, String(req.body?.chapter || ''), Boolean(req.body?.locked), who(req))));
router.post('/:id/chronicle/title', wrap(async (req) => suggestTitle(req.params.id, String(req.body?.chapter || ''), req.body || {}, who(req))));
router.post('/:id/chronicle/rewrite', wrap(async (req) => rewriteChapter(req.params.id, String(req.body?.chapter || ''), who(req))));
// A chapter read aloud by the narrator: made in the background the first time; the page checks back.
router.post('/:id/chronicle/voice', wrap(async (req) => {
  const r = narrate(chapterForReading(req.params.id, String(req.body?.chapter || ''), who(req)));
  if (r.failed) throw new Error(`The narrator lost his voice for a moment (${r.error}) - press Narrator again.`);
  return { ...r, url: r.ready ? `/api/decks/campaigns/chronicle-audio/${r.key}` : null };
}));
router.post('/:id/chronicle/voice/new-take', wrap(async (req) => newTake(req.params.id, String(req.body?.chapter || ''), who(req))));
router.post('/:id/chronicle/art/new-take', wrap(async (req) => newPicture(req.params.id, String(req.body?.chapter || ''), who(req), req.body?.prompt ?? null)));
router.get('/chronicle-art/:key', (req, res) => {
  const f = artFile(req.params.key);
  if (!f || !fs.existsSync(f)) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.type('image/jpeg').sendFile(f);
});
// After a win: what the scenario's rules say it awards.
router.post('/:id/rewards', wrap(async (req) => scenarioRewards(req.params.id, { scenarioName: String(req.body?.scenarioName || ''), scenarioPack: req.body?.scenarioPack || null }, who(req))));
router.get('/chronicle-audio/:key', (req, res) => {
  const f = narrationFile(req.params.key);
  if (!f || !fs.existsSync(f)) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.type('audio/wav').sendFile(f);
});
router.get('/:id/chronicle.pdf', async (req, res) => {
  try {
    const { chroniclePdf } = await import('../services/decks/chroniclePdf.js');
    const { pdf, filename } = await chroniclePdf(req.params.id, who(req));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^ -~]|"/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(pdf);
  } catch (err) { fail(res, err, 500); }
});

// The tale of a completed campaign - written in the background; the page checks back.
router.get('/:id/epilogue', wrap(async (req) => epilogueStatus(req.params.id)));
router.post('/:id/epilogue', wrap(async (req) => startEpilogue(req.params.id, who(req))));
router.post('/:id/notes', wrap(async (req) => ({ campaign: addNote(req.params.id, req.body?.text, who(req)) })));
router.delete('/:id/notes/:note', wrap(async (req) => ({ campaign: removeNote(req.params.id, req.params.note, who(req)) })));

export default router;
