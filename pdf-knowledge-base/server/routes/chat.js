import { Router } from 'express';
import { processMessage, getChatSessions, getSessionMessages, deleteSession, verifyMessage, clearAllSessions, validateMessage } from '../services/chatService.js';
import { generateQueryEmbedding } from '../services/embeddingService.js';
import { searchSimilar } from '../services/vectorStore.js';
import db from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * POST /api/chat - Send a message and get a response
 */
router.post('/', async (req, res) => {
  try {
    const { message, sessionId, subjects, model, appMode, image, tone, attachments, showPersonal } = req.body;

    if ((!message || !message.trim()) && !image && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ error: 'Message, image, or attachment is required' });
    }

    const result = await processMessage(
      (message || "").trim(),
      sessionId || null,
      subjects || [],
      model || 'flash',
      appMode || 'kb',
      image || null,
      tone || 'friendly',
      attachments || null,
      showPersonal || false
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

// Validation endpoint (Auditing against local PDF library)
router.post('/validate', async (req, res) => {
  try {
    const { messageId, prompt, responseText, subjects } = req.body;
    let targetPrompt = prompt;
    let targetResponse = responseText;
    
    if (messageId && (!targetPrompt || !targetResponse)) {
      const msg = db.prepare('SELECT session_id, content, created_at FROM chat_messages WHERE id = ?').get(messageId);
      if (msg) {
        if (!targetResponse) targetResponse = msg.content;
        const promptMsg = db.prepare(`
          SELECT content FROM chat_messages 
          WHERE session_id = ? AND role = 'user' AND created_at < ? 
          ORDER BY created_at DESC LIMIT 1
        `).get(msg.session_id, msg.created_at);
        if (promptMsg && !targetPrompt) {
          targetPrompt = promptMsg.content;
        }
      }
    }

    if (!targetPrompt || !targetResponse) {
      return res.status(400).json({ error: 'Unable to locate prompt or response content for validation' });
    }

    const result = await validateMessage(targetPrompt, targetResponse, subjects || []);
    
    // Update the message in database with the newly audited confidence score and status
    if (messageId) {
      db.prepare(`
        UPDATE chat_messages 
        SET confidence_score = ?, validation_status = ? 
        WHERE id = ?
      `).run(result.confidenceScore, result.validationStatus, messageId);
    }
    
    res.json({
      ...result,
      question: targetPrompt
    });
  } catch (err) {
    console.error('Validation error on route:', err);
    res.status(500).json({ error: err.message });
  }
});

// Save a validated answer (Ground Truth Q&A)
router.post('/save-validated', async (req, res) => {
  try {
    const { question, answer } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ error: 'Question and answer are required' });
    }

    db.prepare(`
      INSERT OR REPLACE INTO validated_qas (id, question, answer)
      VALUES (?, ?, ?)
    `).run(uuidv4(), question.trim(), answer.trim());

    res.json({ success: true });
  } catch (err) {
    console.error('Save validated Q&A error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/chat/search - Semantic vector search for libraries
 */
router.post('/search', async (req, res) => {
  try {
    const { query, subjects, showPersonal } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const queryEmbedding = await generateQueryEmbedding(query.trim());
    const chunks = await searchSimilar(queryEmbedding, subjects || [], 8, showPersonal || false);

    // Format simple text response context for Gemini Live to consume easily
    const formattedText = chunks
      .map((chunk, i) => `[Source ${i + 1}: "${chunk.filename}", Page ${chunk.pageNum}]\n${chunk.text}`)
      .join('\n\n---\n\n');

    res.json({ chunks, formattedText });
  } catch (err) {
    console.error('Search API error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
