import express from 'express';
import {
  summary,
  dedupePdfs,
  quantiseVectors,
  quantiseStatus,
  deleteVectorBackup,
  restoreVectorBackup,
  pruneStaleVectors,
  deleteStaleVectorBackup,
  restoreStaleVectors,
} from '../services/storageService.js';
import { getHnswStatus } from '../services/hnswService.js';

// Storage: /api/storage
const router = express.Router();

router.get('/', (req, res) => {
  try { res.json({ success: true, ...summary({ fresh: req.query.fresh === '1' }), quantise: quantiseStatus(), hnsw: getHnswStatus() }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/dedupe', async (req, res) => {
  try { res.json({ success: true, result: await dedupePdfs({ dryRun: !!req.body?.dryRun }) }); }
  catch (err) { res.status(409).json({ success: false, error: err.message }); }
});

router.post('/quantise', async (req, res) => {
  try { res.json({ success: true, result: await quantiseVectors() }); }
  catch (err) { res.status(409).json({ success: false, error: err.message }); }
});

router.delete('/vector-backup', (req, res) => {
  try { res.json({ success: true, result: deleteVectorBackup() }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/vector-backup/restore', (req, res) => {
  try { res.json({ success: true, result: restoreVectorBackup() }); }
  catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

router.post('/clean-stale-vectors', (req, res) => {
  try { res.json({ success: true, result: pruneStaleVectors() }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.delete('/stale-vector-backup', (req, res) => {
  try { res.json({ success: true, result: deleteStaleVectorBackup() }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/restore-stale-vectors', (req, res) => {
  try { res.json({ success: true, result: restoreStaleVectors() }); }
  catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

export default router;
