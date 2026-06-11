import { Router } from 'express';
import { processMessage, getChatSessions, getSessionMessages, deleteSession, verifyMessage, clearAllSessions } from '../services/chatService.js';

const router = Router();

/**
 * POST /api/chat - Send a message and get a response
 */
router.post('/', async (req, res) => {
  try {
    const { message, sessionId, subjects, model, appMode, image, tone } = req.body;

    if ((!message || !message.trim()) && !image) {
      return res.status(400).json({ error: 'Message or image is required' });
    }

    const result = await processMessage(
      (message || "").trim(),
      sessionId || null,
      subjects || [],
      model || 'flash',
      appMode || 'kb',
      image || null,
      tone || 'friendly'
    );

    res.json(result);
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Failed to process message: ' + err.message });
  }
});

/**
 * GET /api/chat/history - List all chat sessions
 */
router.get('/history', (req, res) => {
  try {
    const sessions = getChatSessions();
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/chat/history/:id - Get messages for a session
 */
router.get('/history/:id', (req, res) => {
  try {
    const messages = getSessionMessages(req.params.id);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/chat/history/:id - Delete a session
 */
router.delete('/history/:id', (req, res) => {
  try {
    deleteSession(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/chat/history - Delete all sessions
 */
router.delete('/history', (req, res) => {
  try {
    clearAllSessions();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verification endpoint (Double-Check)
router.post('/verify', async (req, res) => {
  try {
    const { content } = req.body;
    const result = await verifyMessage(content);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
