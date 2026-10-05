import express from 'express';
import { listConversations, getConversation, deleteConversation, getRetentionDays, setRetentionDays, latencyStats } from '../services/conversationLog.js';
import { getProfiles, saveProfiles } from '../services/memoryProfiles.js';

// Conversations with Ims and how quickly he answers: /api/conversations
const router = express.Router();

router.get('/', (req, res) => {
  try {
    res.json({ success: true, conversations: listConversations({ limit: Math.min(200, Number(req.query.limit) || 50), before: req.query.before || null }), retentionDays: getRetentionDays() });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/latency', (req, res) => {
  try { res.json({ success: true, ...latencyStats() }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/retention', (req, res) => {
  try { res.json({ success: true, retentionDays: setRetentionDays(req.body?.days) }); }
  catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// What Ims knows about Simon and about himself (built nightly from the conversations)
router.get('/profiles', (req, res) => res.json({ success: true, ...getProfiles() }));
router.put('/profiles', (req, res) => {
  try { res.json({ success: true, ...saveProfiles({ simon: req.body?.simon, self: req.body?.self }) }); }
  catch (err) { res.status(400).json({ success: false, error: err.message }); }
});
router.post('/profiles/refresh', async (req, res) => {
  try { const { updateProfiles } = await import('../services/memoryService.js'); res.json({ success: true, ...(await updateProfiles({ sinceMs: Date.now() - 7 * 86400000 })) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// How Ims has been: his mood now, what's on his mind, and his speech habits this week
router.get('/insights', async (req, res) => {
  try {
    const m = await import('../services/moodService.js');
    res.json({ success: true, mood: m.currentMood(), onMind: m.thingsOnMind(), stats: m.computeSpeechStats({ days: 7 }), hint: m.speechVarietyHint() });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/:id', (req, res) => {
  const c = getConversation(req.params.id);
  if (!c) return res.status(404).json({ success: false, error: 'No such conversation.' });
  res.json({ success: true, conversation: c });
});

router.delete('/:id', (req, res) => {
  try { res.json({ success: true, deleted: deleteConversation(req.params.id) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

export default router;
