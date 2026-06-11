import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

/**
 * Microsoft Edge Neural Text-to-Speech (TTS) Service
 * Communicates with the consumer platform read-aloud WebSocket endpoint
 * to synthesize incredibly realistic, human-like voice tracks without API keys.
 */
export async function synthesizeNeuralSpeech(text, tone = 'friendly') {
  return new Promise((resolve, reject) => {
    // Map tone configurations to specific high-quality British Neural voices
    let voice = 'en-GB-SoniaNeural'; // Warm friendly default female voice
    if (tone === 'professional' || tone === 'investigator') {
      voice = 'en-GB-RyanNeural'; // Professional, smart male research voice
    }

    const requestId = uuidv4().replace(/-/g, '');
    const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/bootstrap/v1?trustedclienttoken=6A5AA1D4EAFF4E9B87E7D8D427DCE54F`;

    const ws = new WebSocket(wsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edge/120.0.0.0',
        'Origin': 'chrome-extension://jdiccldimpdaibdccjnbjmienimbocic'
      }
    });

    let audioChunks = [];
    let isFinished = false;

    ws.on('open', () => {
      // 1. Send Configuration Frame to negotiate monaural 24KHz 48Kbps MP3 streaming format
      const configFrame = `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      ws.send(configFrame);

      // 2. Escape special characters to construct valid SSML structure
      const escapedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

      const rateModifier = tone === 'direct' ? '+10%' : '+4%'; // Slightly faster for direct tone
      const pitchModifier = tone === 'friendly' ? '+1Hz' : '0Hz';

      const ssmlFrame = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-GB'><voice name='${voice}'><prosody pitch='${pitchModifier}' rate='${rateModifier}'>${escapedText}</prosody></voice></speak>`;
      ws.send(ssmlFrame);
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // Binary payloads contain frame headers followed by standard MP3 audio chunks
        // Look for double CRLF separator to extract clean audio bytes
        const separator = Buffer.from('\r\n\r\n');
        const index = data.indexOf(separator);
        if (index !== -1) {
          const audioPayload = data.subarray(index + 4);
          audioChunks.push(audioPayload);
        }
      } else {
        const textMessage = data.toString();
        // synthesis is successfully complete when turn.end is received
        if (textMessage.includes('Path:turn.end')) {
          isFinished = true;
          ws.close();
        }
      }
    });

    ws.on('close', () => {
      if (isFinished && audioChunks.length > 0) {
        resolve(Buffer.concat(audioChunks));
      } else {
        reject(new Error('Voice synthesis session terminated prematurely.'));
      }
    });

    ws.on('error', (err) => {
      console.error('[VoiceService] WebSocket error:', err);
      reject(err);
    });

    // Prevent hanging network queries
    setTimeout(() => {
      if (!isFinished) {
        ws.close();
        reject(new Error('Voice synthesis session timed out.'));
      }
    }, 12000);
  });
}
