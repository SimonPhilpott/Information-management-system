import { Router } from 'express';
import { loadPersonaRules, savePersonaRules, getPersonaRulesPath } from '../services/hardwareClientService.js';

const router = Router();

/**
 * GET /api/persona-rules
 * Returns the raw current contents of ims_persona_rules.md, exactly as
 * Gemini receives it in every session's system prompt.
 */
router.get('/', (req, res) => {
  try {
    const content = loadPersonaRules();
    res.json({ success: true, content, path: getPersonaRulesPath() });
  } catch (err) {
    console.error('[Persona Route] Failed to load persona rules:', err);
    res.status(500).json({ error: 'Failed to load persona rules: ' + err.message });
  }
});

/**
 * PUT /api/persona-rules
 * Overwrites ims_persona_rules.md. Takes effect on the next Gemini session
 * setup - no server restart or firmware flash needed, same as a direct
 * hand-edit of the file.
 */
router.put('/', (req, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Persona rules content cannot be empty.' });
    }
    const savedPath = savePersonaRules(content);
    res.json({ success: true, message: 'Persona rules saved.', path: savedPath });
  } catch (err) {
    console.error('[Persona Route] Failed to save persona rules:', err);
    res.status(500).json({ error: 'Failed to save persona rules: ' + err.message });
  }
});

export default router;
