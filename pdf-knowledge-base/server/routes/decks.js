import { Router } from 'express';
import {
  GAMES, getCardData, getOwnedPacks, setOwnedPacks, resetOwnedPacks, listDecks, getDeck, createDeck, updateDeck, deleteDeck, duplicateDeck,
  importDeck, syncDeck, analyseDeck, testDeck, deckInsights, applyImprovement, exportDeck, deckCardCodes, INSIGHT_TOPICS, insightTopics, getScenarios,
  listInvites, invite, revokeInvite, OWNER, personName, recentSignIns, canonEmail, startInsightsJob, insightsJob,
  listQuestions, askDeck, deleteQuestion, addCardToDeck,
} from '../services/decksService.js';
import { isApprovedSession } from '../middleware/requireSession.js';

// The deck builder is shared: the owner and anyone they've invited (guests, signed in with name and
// email only - see index.js and routes/auth.js). Everyone can see every deck, test it and run AI
// insights on it; only a deck's owner can change, sync or delete it. Invites are the owner's alone.
const router = Router();
const fail = (res, err, code = 500) => res.status(err.code === 'LOCAL_CHANGES' ? 409 : err.status || code).json({ success: false, error: err.message, code: err.code });
const safeName = (s) => String(s || 'deck').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'deck';
const viewer = (req) => ({ email: canonEmail(req.session?.user?.email), isOwner: isApprovedSession(req) });
const who = (req) => (viewer(req).isOwner ? OWNER : viewer(req).email);
const withMine = (req, d) => d && ({ ...d, mine: d.owner === who(req) });
const ownDeck = (req) => {
  const d = getDeck(req.params.id);
  if (!d) { const e = new Error('Deck not found.'); e.status = 404; throw e; }
  if (d.owner !== who(req)) { const e = new Error(`This is ${d.ownerName}'s deck - copy it to your decks to change it.`); e.status = 403; throw e; }
  return d;
};
const onlyOwner = (req, res, next) => (viewer(req).isOwner ? next() : res.status(403).json({ success: false, error: 'Only the owner can manage invites.' }));

router.get('/me', (req, res) => {
  const v = viewer(req);
  res.json({ success: true, email: who(req), isOwner: v.isOwner, name: personName(who(req)) });
});

// ---- invites (owner only) ----
router.get('/invites', onlyOwner, (req, res) => res.json({ success: true, invites: listInvites(), signIns: recentSignIns() }));
router.post('/invites', onlyOwner, (req, res) => { try { res.json({ success: true, invite: invite(req.body?.email) }); } catch (err) { fail(res, err, 400); } });
router.delete('/invites/:email', onlyOwner, (req, res) => res.json({ success: revokeInvite(req.params.email) }));

router.get('/games', (req, res) => {
  res.json({ success: true, games: Object.values(GAMES).map((g) => ({ key: g.key, name: g.name, short: g.short, bggIds: g.bggIds, site: g.site, rules: g.rules, decks: listDecks(g.key).length })) });
});

// Card pool: the card database plus how many of each this person has.
router.get('/:game/cards', async (req, res) => {
  try {
    const data = await getCardData(req.params.game, { refresh: req.query.refresh === '1' && viewer(req).isOwner });
    const owned = await getOwnedPacks(req.params.game, who(req));
    // inDecks: cards in this person's decks, which count as theirs
    res.json({ success: true, fetchedAt: data.fetchedAt, packs: data.packs, cards: data.cards, owned, inDecks: deckCardCodes(req.params.game, who(req)) });
  } catch (err) { fail(res, err); }
});
router.put('/:game/owned-packs', (req, res) => { try { res.json({ success: true, packs: setOwnedPacks(req.params.game, req.body?.packs, who(req)) }); } catch (err) { fail(res, err, 400); } });
router.delete('/:game/owned-packs', async (req, res) => { try { resetOwnedPacks(req.params.game, who(req)); res.json({ success: true, owned: await getOwnedPacks(req.params.game, who(req)) }); } catch (err) { fail(res, err); } });

// What insights can focus on, and the scenarios they can be tuned for.
router.get('/:game/insight-options', async (req, res) => {
  try { res.json({ success: true, topics: insightTopics(req.params.game), scenarios: req.params.game === 'ahlcg' ? [] : await getScenarios(req.params.game, who(req)) }); } catch (err) { fail(res, err); }
});
router.get('/:game/decks', (req, res) => { try { res.json({ success: true, decks: listDecks(req.params.game).map((d) => withMine(req, d)) }); } catch (err) { fail(res, err); } });
router.post('/:game/decks', (req, res) => { try { res.json({ success: true, deck: withMine(req, createDeck(req.params.game, { ...(req.body || {}), owner: who(req) })) }); } catch (err) { fail(res, err, 400); } });
router.post('/:game/import', async (req, res) => { try { res.json({ success: true, deck: withMine(req, await importDeck(req.params.game, req.body?.link, who(req))) }); } catch (err) { fail(res, err, 400); } });

router.get('/deck/:id', async (req, res) => {
  try {
    const deck = getDeck(req.params.id);
    if (!deck) return fail(res, new Error('Deck not found.'), 404);
    res.json({ success: true, deck: withMine(req, deck), analysis: await analyseDeck(deck) });
  } catch (err) { fail(res, err); }
});
router.put('/deck/:id', async (req, res) => {
  try { ownDeck(req); const deck = updateDeck(req.params.id, req.body || {}); res.json({ success: true, deck: withMine(req, deck), analysis: await analyseDeck(deck) }); } catch (err) { fail(res, err, 400); }
});
router.delete('/deck/:id', (req, res) => { try { ownDeck(req); res.json({ success: deleteDeck(req.params.id) }); } catch (err) { fail(res, err); } });
router.post('/deck/:id/duplicate', (req, res) => { try { res.json({ success: true, deck: withMine(req, duplicateDeck(req.params.id, who(req))) }); } catch (err) { fail(res, err, 400); } });
router.post('/deck/:id/sync', async (req, res) => {
  try { ownDeck(req); const deck = await syncDeck(req.params.id, { force: Boolean(req.body?.force) }); res.json({ success: true, deck: withMine(req, deck), analysis: await analyseDeck(deck) }); } catch (err) { fail(res, err, 400); }
});
router.post('/deck/:id/test', async (req, res) => {
  try {
    const deck = getDeck(req.params.id);
    if (!deck) return fail(res, new Error('Deck not found.'), 404);
    res.json({ success: true, test: await testDeck(deck, { games: Math.min(10000, Number(req.body?.games) || 2000), rounds: Math.min(10, Number(req.body?.rounds) || 6) }) });
  } catch (err) { fail(res, err, 400); }
});
// Anyone can run insights on any deck; the latest run is kept on the deck with who ran it.
router.post('/deck/:id/insights', async (req, res) => {
  try {
    if (!getDeck(req.params.id)) return fail(res, new Error('Deck not found.'), 404);
    res.json({ success: true, job: startInsightsJob(req.params.id, {
      topics: Array.isArray(req.body?.topics) && req.body.topics.length ? req.body.topics : null,
      scenarioId: req.body?.scenarioId || null, difficulty: req.body?.difficulty || 'normal',
      players: Number(req.body?.players) === 2 ? 2 : 1, campaign: Boolean(req.body?.campaign),
      partnerDeckId: Number(req.body?.players) === 2 && req.body?.partnerDeckId ? Number(req.body.partnerDeckId) : null,
      runBy: personName(who(req)),
    }) });
  } catch (err) { fail(res, err); }
});
// Ask about a deck: anyone can ask on any deck; answers arrive in the background (the page checks back).
router.get('/deck/:id/questions', (req, res) => { try { res.json({ success: true, questions: listQuestions(req.params.id) }); } catch (err) { fail(res, err); } });
router.post('/deck/:id/questions', (req, res) => { try { res.json({ success: true, question: askDeck(req.params.id, req.body?.question, who(req)) }); } catch (err) { fail(res, err, 400); } });
router.delete('/deck/:id/questions/:qid', (req, res) => {
  const q = listQuestions(req.params.id).find((x) => String(x.id) === String(req.params.qid));
  if (!q) return fail(res, new Error('Question not found.'), 404);
  if (q.askedBy !== who(req) && !viewer(req).isOwner) return fail(res, new Error('Only whoever asked it can remove a question.'), 403);
  res.json({ success: deleteQuestion(req.params.id, req.params.qid) });
});
router.post('/deck/:id/add-card', async (req, res) => {
  try { ownDeck(req); const deck = await addCardToDeck(req.params.id, String(req.body?.code || ''), Number(req.body?.qty) || 1); res.json({ success: true, deck: withMine(req, deck), analysis: await analyseDeck(deck) }); } catch (err) { fail(res, err, 400); }
});
// The page checks back on a running insights job every few seconds.
router.get('/deck/:id/insights/status', (req, res) => res.json({ success: true, job: insightsJob(req.params.id) }));
router.post('/deck/:id/insights/apply/:index', async (req, res) => {
  try { ownDeck(req); const deck = applyImprovement(req.params.id, Number(req.params.index), req.query.list === 'consider' ? 'cardsToConsider' : 'improvements'); res.json({ success: true, deck: withMine(req, deck), analysis: await analyseDeck(deck) }); } catch (err) { fail(res, err, 400); }
});

// Downloads: ?download=1 saves as a file; without it JSON is shown in the browser.
router.get('/deck/:id/export.:format', async (req, res) => {
  try {
    const { format } = req.params;
    if (!['csv', 'json', 'txt'].includes(format)) return fail(res, new Error('Format must be csv, json or txt.'), 400);
    const deck = getDeck(req.params.id);
    if (!deck) return fail(res, new Error('Deck not found.'), 404);
    const out = await exportDeck(deck.id, format);
    const file = `${safeName(deck.name)}.${format}`;
    if (req.query.download === '1') res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    if (format === 'json') return res.type('application/json').send(JSON.stringify(out, null, 2));
    res.type(format === 'csv' ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8').send(format === 'csv' ? '﻿' + out : out);
  } catch (err) { fail(res, err); }
});

export default router;
