import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import {
  scanDndLibrary, getRulesets, getRuleset,
  createCharacter, getCharacter, updateCharacter,
  createCampaign, getCampaigns, getCampaign, deleteCampaign,
  rollDice, consultOracle, processDmTurn
} from '../services/dndSoloService.js';
import { requireSession } from '../middleware/requireSession.js';

const router = Router();
router.use(requireSession);

const fail = (res, err, code = 400) => res.status(code).json({ success: false, error: err.message });

// Rulesets & Scanner
router.get('/rulesets', (req, res) => {
  try {
    const rulesets = getRulesets();
    res.json({ success: true, rulesets });
  } catch (err) { fail(res, err); }
});

router.post('/scan', (req, res) => {
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

// Campaigns
router.get('/campaigns', (req, res) => {
  try {
    const campaigns = getCampaigns();
    res.json({ success: true, campaigns });
  } catch (err) { fail(res, err); }
});

router.post('/campaigns', (req, res) => {
  try {
    const campaign = createCampaign(req.body || {});
    res.json({ success: true, campaign });
  } catch (err) { fail(res, err); }
});

router.get('/campaigns/:id', (req, res) => {
  try {
    const campaign = getCampaign(req.params.id);
    if (!campaign) return fail(res, new Error('Campaign not found'), 404);
    res.json({ success: true, campaign });
  } catch (err) { fail(res, err); }
});

router.delete('/campaigns/:id', (req, res) => {
  try {
    deleteCampaign(req.params.id);
    res.json({ success: true });
  } catch (err) { fail(res, err); }
});

router.post('/campaigns/:id/turn', async (req, res) => {
  try {
    const { playerAction, diceRoll, oracleResult } = req.body || {};
    if (!playerAction) return fail(res, new Error('Player action is required'), 400);
    const campaign = await processDmTurn({
      campaignId: req.params.id,
      playerAction,
      diceRoll,
      oracleResult
    });
    res.json({ success: true, campaign });
  } catch (err) { fail(res, err, 500); }
});

// Characters
router.post('/characters', (req, res) => {
  try {
    const character = createCharacter(req.body || {});
    res.json({ success: true, character });
  } catch (err) { fail(res, err); }
});

router.get('/characters/:id', (req, res) => {
  try {
    const character = getCharacter(req.params.id);
    if (!character) return fail(res, new Error('Character not found'), 404);
    res.json({ success: true, character });
  } catch (err) { fail(res, err); }
});

router.put('/characters/:id', (req, res) => {
  try {
    const character = updateCharacter(req.params.id, req.body || {});
    res.json({ success: true, character });
  } catch (err) { fail(res, err); }
});

// Dice Roller & Solo Oracle
router.post('/roll', (req, res) => {
  try {
    const result = rollDice(req.body || {});
    res.json({ success: true, result });
  } catch (err) { fail(res, err); }
});

router.post('/oracle', (req, res) => {
  try {
    const result = consultOracle(req.body || {});
    res.json({ success: true, result });
  } catch (err) { fail(res, err); }
});

// Asset streamer for maps, tokens, and play sheets
router.get('/asset', (req, res) => {
  try {
    const rel = String(req.query.path || '').replace(/\.\./g, '');
    const baseDir = process.env.DND_BOOKS_PATH || 'G:\\My Drive\\BOOKS\\D&D';
    const filePath = path.resolve(baseDir, rel);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Asset not found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip'
    };

    if (mimeTypes[ext]) {
      res.setHeader('Content-Type', mimeTypes[ext]);
    }
    fs.createReadStream(filePath).pipe(res);
  } catch (err) { fail(res, err, 500); }
});

export default router;
