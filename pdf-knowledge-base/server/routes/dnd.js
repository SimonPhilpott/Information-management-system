import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  DND_BOOKS_ROOT, scanDndLibrary, getRulesets, getRuleset,
  createCharacter, getCharacter, getCharacters, updateCharacter, deleteCharacter,
  startCampaign, getCampaigns, getCampaign, deleteCampaign,
  rollDice, consultOracle, processDmTurn, processDmTurnStream, undoLastTurn, getTurn, updateCampaignAdversary,
  isChronicleCompactionEnabled, setChronicleCompactionSetting
} from '../services/dndSoloService.js';
import { narrate } from '../services/decks/chronicleVoice.js';
import { startDiscovery, discoveryStatus, studySystem, askRules, rollHero, rulesetFiles, rpgDocuments, askDm } from '../services/dndLibrary.js';
import { isApprovedSession, isGuestSession } from '../middleware/requireSession.js';
import { canonEmail, OWNER, personName } from '../services/decksService.js';
import { myGames, saveGame, deleteGame, othersGames, watchGame, addFlag, listFlags } from '../services/dndBetaGames.js';
import { campaignOwner, characterCampaign, turnCampaign } from '../services/dndSoloService.js';
import * as chronicle from '../services/dndChronicle.js';
import { getRulesDigest, getGameSystemConfig } from '../services/rulesDigestService.js';
import { generateHeroAvatar, getAvatarFilePath } from '../services/dndAvatarService.js';
import { dressScene, askRindewind, libraryListing, reflectHero, saveCreatureArt, creatureArtFile, tellChapter } from '../services/dndBetaService.js';

const router = Router();

// Serve locally cached avatar portrait image (public static asset for <img> tags)
router.get('/avatars/:file', (req, res) => {
  const file = getAvatarFilePath(req.params.file);
  if (!file) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.type('image/jpeg').sendFile(file);
});

// Simon, and anyone he's invited (the shared guest list of the deck builder and Homebrew). Guests play their own
// adventures; reading the library and studying the games is Simon's.
const viewer = (req) => ({ isOwner: isApprovedSession(req), email: canonEmail(req.session?.user?.email) });
router.use((req, res, next) => (isApprovedSession(req) || isGuestSession(req) ? next() : res.status(401).json({ error: 'Sign in with your Google account to use this.', signInRequired: true })));
const ownerOf = (req) => (viewer(req).isOwner ? null : viewer(req).email);
const onlyOwner = (req, res, next) => (viewer(req).isOwner ? next() : res.status(403).json({ success: false, error: 'Only Simon can do that.' }));
const theirs = (row, req) => Boolean(row) && (row.owner || null) === ownerOf(req);
// every request about one adventure (or its hero, or one of its turns) must be the viewer's own
router.param('id', (req, res, next, id) => (req.path.startsWith('/campaigns/') && !theirs(campaignOwner(id), req) ? res.status(404).json({ success: false, error: 'Campaign not found' }) : next()));
router.use('/characters/:charId', (req, res, next) => (theirs(characterCampaign(req.params.charId), req) ? next() : res.status(404).json({ success: false, error: 'Character not found' })));
router.use('/turns/:turnId', (req, res, next) => (theirs(turnCampaign(Number(req.params.turnId)), req) ? next() : res.status(404).json({ success: false, error: 'Turn not found' })));
router.get('/me', (req, res) => res.json({ success: true, isOwner: viewer(req).isOwner, email: viewer(req).email }));

const fail = (res, err, code = 400) => res.status(code).json({ success: false, error: err.message });

// Rulesets & Scanner
router.get('/rulesets', (req, res) => {
  try { res.json({ success: true, rulesets: getRulesets() }); } catch (err) { fail(res, err); }
});

router.post('/scan', onlyOwner, (req, res) => {
  try {
    const rulesets = scanDndLibrary();
    res.json({ success: true, rulesets, count: rulesets.length });
  } catch (err) { fail(res, err); }
});

router.get('/rulesets/:id', (req, res) => {
  try {
    const ruleset = getRuleset(req.params.id);
    if (!ruleset) return fail(res, new Error('Ruleset not found'), 404);
    res.json({ success: true, ruleset });
  } catch (err) { fail(res, err); }
});

// The games in the library index: find them all (in the background) and study each from its rulebooks
router.post('/discover', onlyOwner, (req, res) => {
  if (!startDiscovery({ restudy: Boolean(req.body?.restudy) })) return fail(res, new Error('Already reading the library'), 409);
  res.json({ success: true, status: discoveryStatus() });
});
router.get('/discover', (req, res) => {
  const docs = rpgDocuments();
  res.json({ success: true, status: discoveryStatus(), books: docs.length, indexed: docs.filter((d) => d.indexed === 1).length });
});
router.post('/rulesets/:id/study', onlyOwner, async (req, res) => {
  try { res.json({ success: true, profile: await studySystem(req.params.id) }); } catch (err) { fail(res, err, 500); }
});
router.get('/rulesets/:id/books', (req, res) => {
  try { res.json({ success: true, books: rulesetFiles(getRuleset(req.params.id)) }); } catch (err) { fail(res, err); }
});
// Authoritative quick-reference rules digest cards and system configuration
router.get('/rulesets/:id/digest', (req, res) => {
  try {
    const cards = getRulesDigest(req.params.id);
    const config = getGameSystemConfig(req.params.id);
    res.json({ success: true, cards, config });
  } catch (err) { fail(res, err); }
});
// A rules question answered from the game's own books, with the pages
router.post('/rulesets/:id/ask', async (req, res) => {
  try {
    const r = getRuleset(req.params.id);
    if (!r) return fail(res, new Error('Ruleset not found'), 404);
    res.json({ success: true, ...(await askRules(r, String(req.body?.question || ''))) });
  } catch (err) { fail(res, err, 500); }
});
// A starting hero made by the book's character creation (not saved - the page shows it to keep or re-roll)
router.post('/rulesets/:id/hero', async (req, res) => {
  try {
    const r = getRuleset(req.params.id);
    if (!r) return fail(res, new Error('Ruleset not found'), 404);
    res.json({ success: true, hero: await rollHero(r, req.body || {}) });
  } catch (err) { fail(res, err, 500); }
});

// Generate an avatar portrait on demand for a hero setup or re-roll
router.post('/hero/avatar', async (req, res) => {
  try {
    const { name, roleOrClass, rulesetId, concept, details, backstory, premise, referenceImage } = req.body || {};
    const ruleset = rulesetId ? getRuleset(rulesetId) : null;
    const out = await generateHeroAvatar({ name, roleOrClass, ruleset, concept, details, backstory, premise, referenceImage });
    res.json({ success: true, avatarUrl: out.avatarUrl });
  } catch (err) { fail(res, err, 500); }
});

// Characters across all campaigns
router.get('/characters', (req, res) => {
  try { res.json({ success: true, characters: getCharacters(ownerOf(req)) }); } catch (err) { fail(res, err); }
});

// Campaigns
router.get('/campaigns', (req, res) => {
  try { res.json({ success: true, campaigns: getCampaigns(ownerOf(req)) }); } catch (err) { fail(res, err); }
});

// A new campaign with its hero; the DM writes the opening scene before this answers
router.post('/campaigns', async (req, res) => {
  try { res.json({ success: true, campaign: await startCampaign(req.body || {}, ownerOf(req)) }); } catch (err) { fail(res, err, 500); }
});

router.get('/campaigns/:id', (req, res) => {
  try {
    const campaign = getCampaign(req.params.id);
    if (!campaign) return fail(res, new Error('Campaign not found'), 404);
    res.json({ success: true, campaign });
  } catch (err) { fail(res, err); }
});

router.delete('/campaigns/:id', (req, res) => {
  try { deleteCampaign(req.params.id); res.json({ success: true }); } catch (err) { fail(res, err); }
});

router.post('/campaigns/:id/turn', async (req, res) => {
  try {
    const { playerAction, diceRoll, oracleResult, adversary } = req.body || {};
    if (!String(playerAction || '').trim()) return fail(res, new Error('Player action is required'), 400);
    const campaign = await processDmTurn({ campaignId: req.params.id, playerAction: String(playerAction).trim(), diceRoll, oracleResult, adversary });
    res.json({ success: true, campaign });
  } catch (err) { fail(res, err, 500); }
});

router.post('/campaigns/:id/turn-stream', async (req, res) => {
  try {
    const { playerAction, diceRoll, oracleResult, adversary } = req.body || {};
    if (!String(playerAction || '').trim()) return fail(res, new Error('Player action is required'), 400);

    // Set Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const campaign = await processDmTurnStream(
      { campaignId: req.params.id, playerAction: String(playerAction).trim(), diceRoll, oracleResult, adversary },
      (token) => {
        res.write(`data: ${JSON.stringify({ type: 'token', token })}\n\n`);
      }
    );

    res.write(`data: ${JSON.stringify({ type: 'complete', campaign })}\n\n`);
    res.end();
  } catch (err) {
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message || String(err) })}\n\n`);
      res.end();
    } else {
      fail(res, err, 500);
    }
  }
});

router.put('/campaigns/:id/adversary', (req, res) => {
  try {
    res.json({ success: true, campaign: updateCampaignAdversary(req.params.id, req.body || {}) });
  } catch (err) { fail(res, err); }
});

// Rindewind out of character - recap, rules, advice - for any room of the page
router.post('/campaigns/:id/ask', async (req, res) => {
  try {
    const campaign = getCampaign(req.params.id);
    if (!campaign) return fail(res, new Error('Campaign not found'), 404);
    const question = String(req.body?.question || '').trim();
    if (!question) return fail(res, new Error('Ask him something'), 400);
    res.json({ success: true, ...(await askDm({ campaign, ruleset: getRuleset(campaign.ruleset_id), question, books: campaign.books?.length ? campaign.books : null })) });
  } catch (err) { fail(res, err, 500); }
});
// The D&D Solo DM's adventures, on the server: each player's own to play; everyone else's to watch, never to play
const me = (req) => (viewer(req).isOwner ? OWNER : viewer(req).email);
const nameOf = (e) => (e === OWNER ? 'Simon' : personName(e));
router.get('/beta/games', (req, res) => {
  try { res.json({ success: true, me: nameOf(me(req)), isOwner: viewer(req).isOwner, games: myGames(me(req)) }); } catch (err) { fail(res, err, 500); }
});
router.put('/beta/games/:gid', (req, res) => {
  try { const st = req.body?.state; if (st?.id !== req.params.gid) throw new Error('The game and its id do not match.'); saveGame(me(req), st); res.json({ success: true }); } catch (err) { fail(res, err, err.code || 400); }
});
router.delete('/beta/games/:gid', (req, res) => {
  try { res.json({ success: true, deleted: deleteGame(me(req), req.params.gid) }); } catch (err) { fail(res, err, 500); }
});
router.post('/beta/flags', (req, res) => {
  try { res.json({ success: true, id: addFlag(me(req), req.body || {}) }); } catch (err) { fail(res, err, 400); }
});
router.get('/beta/flags', (req, res) => {
  try { res.json({ success: true, flags: listFlags(viewer(req).isOwner ? null : me(req)) }); } catch (err) { fail(res, err, 500); }
});
router.get('/beta/others', (req, res) => {
  try { res.json({ success: true, games: othersGames(me(req), nameOf) }); } catch (err) { fail(res, err, 500); }
});
router.get('/beta/others/:gid', (req, res) => {
  try { const g = watchGame(me(req), req.params.gid, nameOf); if (!g) return fail(res, new Error('Adventure not found'), 404); res.json({ success: true, game: g }); } catch (err) { fail(res, err, 500); }
});
// D&D Solo beta: Rindewind's one or two lines for a scene the rules engine has already settled
router.post('/beta/dress', async (req, res) => {
  try { res.json({ success: true, text: await dressScene(req.body || {}) }); } catch (err) { fail(res, err, 500); }
});
// D&D Solo: a chapter of the Chronicle told as a story, from what happened in one place
router.post('/beta/tale', async (req, res) => {
  try { res.json({ success: true, text: await tellChapter(req.body || {}) }); } catch (err) { fail(res, err, 500); }
});
// D&D Solo beta: the books in the D&D folder (a listing, nothing indexed), and who a survivor has become
router.get('/beta/library', (req, res) => {
  try { res.json({ success: true, ...libraryListing() }); } catch (err) { fail(res, err, 500); }
});
router.post('/beta/creature-art', (req, res) => {
  try { res.json({ success: true, ...saveCreatureArt(req.body || {}) }); } catch (err) { fail(res, err, 400); }
});
router.get('/beta/creature-art/:slug', (req, res) => {
  const f = creatureArtFile(req.params.slug);
  if (!f) return res.status(404).send('No picture');
  res.setHeader('Cache-Control', 'private, max-age=3600'); res.sendFile(f);
});
router.post('/beta/reflect', async (req, res) => {
  try { res.json({ success: true, ...(await reflectHero(req.body || {})) }); } catch (err) { fail(res, err, 500); }
});
// D&D Solo beta: Rindewind out of character - rules from the book (with pages), advice and recaps from the live game
router.post('/beta/ask', async (req, res) => {
  try { res.json({ success: true, ...(await askRindewind(req.body || {})) }); } catch (err) { fail(res, err, 500); }
});
// Any text read aloud by the Chronicler (his out-of-character answers)
router.post('/voice', (req, res) => {
  try {
    const text = String(req.body?.text || '').trim().slice(0, 3000);
    if (!text) return fail(res, new Error('Nothing to read'), 400);
    const r = narrate({ heading: '', paragraphs: text.split(/\n\s*\n/).filter(Boolean), game: 'lotr' });
    if (r.failed) throw new Error(`The narrator lost his voice for a moment (${r.error}) - try again.`);
    res.json({ success: true, ...r, url: r.ready ? `/api/decks/campaigns/chronicle-audio/${r.key}` : null });
  } catch (err) { fail(res, err, 500); }
});

// The chronicle book - the same requests the LOTR campaign's book makes (Dashboard/Chronicle.jsx with apiBase)
const ch = (fn) => async (req, res) => { try { res.json({ success: true, ...(await fn(req)) }); } catch (err) { res.status(err.status || 500).json({ success: false, error: err.message }); } };
const chap = (req) => String(req.body?.chapter || '');
router.get('/campaigns/:id/chronicle', ch((req) => chronicle.chronicleStatus(req.params.id)));
router.post('/campaigns/:id/chronicle', ch((req) => chronicle.writeChronicle(req.params.id, Boolean(req.body?.force))));
router.get('/campaigns/:id/compaction-settings', (req, res) => {
  try { res.json({ success: true, enabled: isChronicleCompactionEnabled(req.params.id) }); } catch (err) { fail(res, err); }
});
router.post('/campaigns/:id/compaction-settings', (req, res) => {
  try { res.json({ success: true, ...setChronicleCompactionSetting(req.params.id, Boolean(req.body?.enabled)) }); } catch (err) { fail(res, err); }
});
router.put('/campaigns/:id/chronicle/chapter', ch((req) => chronicle.editChapter(req.params.id, chap(req), req.body || {})));
router.put('/campaigns/:id/chronicle/lock', ch((req) => chronicle.lockChapter(req.params.id, chap(req), Boolean(req.body?.locked))));
router.post('/campaigns/:id/chronicle/title', ch((req) => chronicle.suggestTitle(req.params.id, chap(req), req.body || {})));
router.post('/campaigns/:id/chronicle/rewrite', ch((req) => chronicle.rewriteChapter(req.params.id, chap(req))));
router.post('/campaigns/:id/chronicle/voice', ch(async (req) => {
  const r = narrate(chronicle.chapterForReading(req.params.id, chap(req)));
  if (r.failed) throw new Error(`The narrator lost his voice for a moment (${r.error}) - try again.`);
  return { ...r, url: r.ready ? `/api/decks/campaigns/chronicle-audio/${r.key}` : null };
}));
router.post('/campaigns/:id/chronicle/voice/new-take', ch((req) => chronicle.newReadingTake(req.params.id, chap(req))));
router.post('/campaigns/:id/chronicle/art/new-take', ch((req) => chronicle.newPicture(req.params.id, chap(req), req.body?.prompt ?? null)));

// Take back the last turn (the sheet goes back too); answers with what was asked, so it can be tried again
router.post('/campaigns/:id/undo', (req, res) => {
  try { res.json({ success: true, ...undoLastTurn(req.params.id) }); } catch (err) { fail(res, err); }
});

// A turn read aloud by the Chronicler - the narrator of the Lord of the Rings campaign chronicles, same voice and
// direction. Made in the background the first time and kept; the page asks again until it's ready.
router.post('/turns/:turnId/voice', (req, res) => {
  try {
    const t = getTurn(Number(req.params.turnId));
    if (!t) return fail(res, new Error('Turn not found'), 404);
    const paragraphs = String(t.dm_narrative || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const r = narrate({ heading: '', paragraphs, game: 'lotr' });
    if (r.failed) throw new Error(`The narrator lost his voice for a moment (${r.error}) - try again.`);
    res.json({ success: true, ...r, url: r.ready ? `/api/decks/campaigns/chronicle-audio/${r.key}` : null });
  } catch (err) { fail(res, err, 500); }
});

// Tabletop Audio's soundscape catalogue (the browser can't read it across sites)
router.get('/soundscapes', async (req, res) => {
  try { res.json({ success: true, tracks: await (await import('../services/dndSoundscapes.js')).catalogue() }); } catch (err) { fail(res, err, 500); }
});

// Authentic Tabletop Audio RPG Sound Effects (cached locally on disk)
router.get('/sfx/:category/:file', async (req, res) => {
  try {
    const { category, file } = req.params;
    const allowed = ['dm_tools', 'combat2', 'dungeon2', 'atlantis'];
    if (!allowed.includes(category) || !/^[a-zA-Z0-9_\-\.]+\.(mp3|ogg)$/.test(file)) {
      return res.status(400).json({ error: 'Invalid audio asset request' });
    }

    const sfxDir = path.join(__dirname, '..', 'data', 'sfx', category);
    fs.mkdirSync(sfxDir, { recursive: true });
    const localPath = path.join(sfxDir, file);

    if (fs.existsSync(localPath)) {
      res.setHeader('Content-Type', file.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return fs.createReadStream(localPath).pipe(res);
    }

    // Fetch from Tabletop Audio CDN with required Referer
    const upstreamUrl = `https://sounds.tabletopaudio.com/${category}/${file}`;
    const upstream = await fetch(upstreamUrl, {
      headers: {
        'Referer': 'https://tabletopaudio.com/',
        'User-Agent': 'Mozilla/5.0'
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Sound unavailable: HTTP ${upstream.status}` });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    try { fs.writeFileSync(localPath, buffer); } catch { /* ignore write failure */ }

    res.setHeader('Content-Type', file.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(buffer);
  } catch (err) {
    fail(res, err, 500);
  }
});

// Characters
router.post('/characters', onlyOwner, (req, res) => {
  try { res.json({ success: true, character: createCharacter(req.body || {}) }); } catch (err) { fail(res, err); }
});

router.get('/characters/:id', (req, res) => {
  try {
    const character = getCharacter(req.params.id);
    if (!character) return fail(res, new Error('Character not found'), 404);
    res.json({ success: true, character });
  } catch (err) { fail(res, err); }
});

router.put('/characters/:id', (req, res) => {
  try { res.json({ success: true, character: updateCharacter(req.params.id, req.body || {}) }); } catch (err) { fail(res, err); }
});

router.delete('/characters/:id', (req, res) => {
  try { res.json({ success: true, result: deleteCharacter(req.params.id) }); } catch (err) { fail(res, err); }
});

// Dice Roller & Solo Oracle
router.post('/roll', (req, res) => {
  try { res.json({ success: true, result: rollDice(req.body || {}) }); } catch (err) { fail(res, err); }
});

router.post('/oracle', (req, res) => {
  try { res.json({ success: true, result: consultOracle(req.body || {}) }); } catch (err) { fail(res, err); }
});

// Maps, tokens and play sheets from the D&D books folder - and only from there
router.get('/asset', (req, res) => {
  try {
    const base = path.resolve(DND_BOOKS_ROOT);
    const filePath = path.resolve(base, String(req.query.path || ''));
    if (!filePath.toLowerCase().startsWith(base.toLowerCase() + path.sep)) return res.status(403).send('Not in the D&D books folder');
    if (!fs.existsSync(filePath)) return res.status(404).send('Asset not found');
    const types = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf', '.zip': 'application/zip' };
    const type = types[path.extname(filePath).toLowerCase()];
    if (!type) return res.status(415).send('Not a map, token or sheet');
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) { fail(res, err, 500); }
});

export default router;
