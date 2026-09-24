import { Router } from 'express';
import { synthesizeSpeech } from '../services/voiceService.js';

const router = Router();

/**
 * POST /api/voice/tts - read text aloud in the saved IMS voice + personality
 * (see voiceService.js: there is no fallback voice by design).
 */
router.post('/tts', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text content is required for speech synthesis.' });
    }

    // Clean text of any stray markdown brackets or citations just in case
    const cleanText = text
      .replace(/\[\[([^\]]+)\]\]/g, '') // Remove RAG citations
      .replace(/[*_#`[\]()]/g, '')     // Remove general markdown syntax
      .trim();

    const audioBuffer = await synthesizeSpeech(cleanText);

    res.set({
      'Content-Type': 'audio/wav',
      'Content-Length': audioBuffer.length,
      'Cache-Control': 'no-cache'
    });

    res.send(audioBuffer);
  } catch (err) {
    console.error('[Voice Route] TTS Synthesis failed:', err.message);
    res.status(502).json({ error: 'Failed to synthesize speech: ' + err.message });
  }
});

export default router;
