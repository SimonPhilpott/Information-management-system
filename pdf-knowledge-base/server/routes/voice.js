import { Router } from 'express';
import { synthesizeNeuralSpeech } from '../services/voiceService.js';

const router = Router();

/**
 * POST /api/voice/tts - Synthesize text to human-like premium neural audio stream
 */
router.post('/tts', async (req, res) => {
  try {
    const { text, tone } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text content is required for speech synthesis.' });
    }

    // Clean text of any stray markdown brackets or citations just in case
    const cleanText = text
      .replace(/\[\[([^\]]+)\]\]/g, '') // Remove RAG citations
      .replace(/[*_#`[\]()]/g, '')     // Remove general markdown syntax
      .trim();

    const audioBuffer = await synthesizeNeuralSpeech(cleanText, tone || 'friendly');

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    });

    res.send(audioBuffer);
  } catch (err) {
    console.error('[Voice Route] TTS Synthesis failed:', err);
    res.status(500).json({ error: 'Failed to synthesize speech: ' + err.message });
  }
});

export default router;
