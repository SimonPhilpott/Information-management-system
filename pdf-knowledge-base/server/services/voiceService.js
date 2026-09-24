import config from '../config.js';
import { getSpokenStyleDirective } from './hardwareClientService.js';

// Text-to-speech for the web app's "read aloud". It speaks with EXACTLY the
// voice and personality saved on the IMS Personality screen (the same voice
// live conversations use), via Gemini's own TTS model. There is deliberately
// no fallback voice: if synthesis fails the caller gets an error and nothing
// is spoken, rather than a different, generic voice quietly taking over.
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const MAX_CHARS = 4000; // keep a single request bounded; longer text is trimmed at a sentence

const SAMPLE_RATE = 24000; // Gemini TTS returns raw 24kHz 16-bit mono PCM

function pcmToWav(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);            // PCM
  header.writeUInt16LE(1, 22);            // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function trimToSentence(text) {
  if (text.length <= MAX_CHARS) return text;
  const cut = text.slice(0, MAX_CHARS);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return end > MAX_CHARS * 0.5 ? cut.slice(0, end + 1) : cut;
}

export async function synthesizeSpeech(text) {
  if (!config.gemini.apiKey) throw new Error('No Gemini API key is configured on the server.');
  const { voice, directive } = getSpokenStyleDirective();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: directive + trimToSentence(text) }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
      }
    })
  });
  if (!res.ok) throw new Error(`Gemini TTS returned HTTP ${res.status}`);
  const data = await res.json();
  const b64 = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
  if (!b64) throw new Error('Gemini TTS returned no audio.');
  return pcmToWav(Buffer.from(b64, 'base64'));
}
