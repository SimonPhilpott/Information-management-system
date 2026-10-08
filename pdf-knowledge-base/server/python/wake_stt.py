"""Local speech-to-text for the wake-phrase check (wakeGateService.js).

Usage: python wake_stt.py
Keeps faster-whisper's base.en model loaded (int8, CPU) and answers one request per stdin line:
  {"id": n, "pcm": "<base64 16 kHz mono 16-bit PCM>"}  ->  {"id": n, "text": "..."}
Prints {"ready": true} once the model is loaded. Nothing leaves this machine.

Biased towards the name with a hotword, so "Hey / Hi / Eh up Ims" come out with "Ims" in them (tested on
the recordings in data/phrase_recordings: tiny.en misheard "Eh up Ims", base.en got all six, in about
0.8 s for 3-4 s of audio; silence and noise give nothing).
"""
import sys
import json
import base64
import numpy as np
from faster_whisper import WhisperModel

MODEL = sys.argv[1] if len(sys.argv) > 1 else 'base.en'


def main():
    model = WhisperModel(MODEL, device='cpu', compute_type='int8', cpu_threads=4)
    sys.stdout.write(json.dumps({'ready': True, 'model': MODEL}) + '\n')
    sys.stdout.flush()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        rid = None
        try:
            req = json.loads(line)
            rid = req.get('id')
            audio = np.frombuffer(base64.b64decode(req['pcm']), dtype=np.int16).astype(np.float32) / 32768.0
            # hotwords only: an initial prompt made it "hear" "Ims." in silence, and the VAD filter dropped
            # some real speech; the caller skips clips too quiet to hold speech
            segs, _ = model.transcribe(audio, language='en', beam_size=1, vad_filter=False,
                                       condition_on_previous_text=False, without_timestamps=True,
                                       hotwords='Ims')
            out = {'text': ' '.join(s.text.strip() for s in segs).strip()}
        except Exception as e:  # one bad clip must not end the worker
            out = {'error': str(e)}
        out['id'] = rid
        sys.stdout.write(json.dumps(out) + '\n')
        sys.stdout.flush()
    return 0


if __name__ == '__main__':
    sys.exit(main())
