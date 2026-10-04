import { useCallback, useEffect, useRef, useState } from 'react';

// A persona speaking a line that matches a face emotion (Gemini writes it in the persona and reads it in the
// persona's voice), with the loudness of the audio as it plays in levelRef so a face can lip-sync to it.
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

export default function usePersonaVoice() {
  const audioRef = useRef(null);
  const analyserRef = useRef(null);
  const levelRef = useRef(0);
  const reqRef = useRef(0);
  const [busy, setBusy] = useState(false);       // writing and voicing the line
  const [playing, setPlaying] = useState(false);
  const [said, setSaid] = useState('');
  const [error, setError] = useState('');

  // one audio element through an analyser; must first happen inside a click so playback is allowed
  const hook = useCallback(() => {
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    if (analyserRef.current) { analyserRef.current.ctx.resume().catch(() => {}); return a; }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaElementSource(a).connect(an);
      an.connect(ctx.destination);
      analyserRef.current = { ctx, an, buf: new Uint8Array(an.fftSize) };
    } catch { /* no Web Audio: the voice still plays, the face uses its own rhythm */ }
    a.addEventListener('playing', () => { if (a.src !== SILENCE) setPlaying(true); });
    a.addEventListener('pause', () => setPlaying(false));
    a.addEventListener('ended', () => setPlaying(false));
    return a;
  }, []);

  useEffect(() => {
    if (!playing) { levelRef.current = 0; return undefined; }
    let raf = 0;
    const loop = () => {
      const h = analyserRef.current;
      if (h) {
        h.an.getByteTimeDomainData(h.buf);
        let sum = 0;
        for (let i = 0; i < h.buf.length; i++) { const v = (h.buf[i] - 128) / 128; sum += v * v; }
        levelRef.current = Math.min(1, Math.sqrt(sum / h.buf.length) * 2.5);
      } else {
        levelRef.current = 0.2 + Math.random() * 0.5;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => () => { audioRef.current?.pause(); analyserRef.current?.ctx.close().catch(() => {}); }, []);

  const stop = useCallback(() => {
    reqRef.current += 1; // drop a line still being written
    setBusy(false);
    audioRef.current?.pause();
  }, []);

  // say(personaId, { emotion }) - or { text } / { scenario, engine } as /api/personas/:id/speak takes
  const say = useCallback(async (personaId, body) => {
    if (!personaId) { setError('Pick a persona first.'); return; }
    const a = hook();
    a.pause();
    a.src = SILENCE; // unlock playback inside the click, before the wait
    a.play().catch(() => {});
    const req = ++reqRef.current;
    setBusy(true); setError(''); setSaid('');
    try {
      const res = await fetch(`/api/personas/${personaId}/speak`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.success === false) throw new Error(d.error || `Request failed (${res.status})`);
      if (req !== reqRef.current) return;
      setSaid(d.said || '');
      a.src = d.audio;
      await a.play().catch(() => { throw new Error('The browser blocked playback - press the button again.'); });
    } catch (err) {
      if (req === reqRef.current) setError(err.message);
    } finally {
      if (req === reqRef.current) setBusy(false);
    }
  }, [hook]);

  return { say, stop, busy, playing, said, error, levelRef };
}
