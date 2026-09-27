import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

// Voice notes for a campaign: tap the mic, speak, tap again - the recording is written down on the server
// (with the campaign's hero, investigator and scenario names spelt right) and handed back as text.
// Recordings stop on their own after three minutes.
const MAX_MS = 3 * 60 * 1000;
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

// Adds a spoken note to a notes box as its own bullet.
export const addBullet = (draft, text) => `${(draft || '').replace(/\s+$/, '')}${draft?.trim() ? '\n' : ''}• ${text}`;

export default function VoiceNoteButton({ campaignId, onText, ui, className = '' }) {
  const [state, setState] = useState('idle'); // idle | recording | working
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState(null);
  const rec = useRef(null);
  const timers = useRef([]);
  const stopAll = () => { timers.current.forEach(clearInterval); timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => { stopAll(); if (rec.current?.state === 'recording') rec.current.stop(); }, []);

  const send = async (blob) => {
    setState('working');
    try {
      const res = await fetch(`/api/decks/campaigns/${campaignId}/voice-note`, { method: 'POST', headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob });
      const d = await res.json().catch(() => ({ success: false, error: `The server answered ${res.status}` }));
      if (!d.success) throw new Error(d.error);
      if (d.text) onText(d.text); else setError('Nothing was heard - try again a bit closer.');
    } catch (err) { setError(err.message); }
    setState('idle');
  };
  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return setError('This browser cannot record.');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (_) { return setError('The microphone is blocked - allow it for this site.'); }
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
    const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      stopAll(); stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: (r.mimeType || mimeType || 'audio/webm') });
      if (blob.size < 1000) { setState('idle'); return setError('That was too short.'); }
      send(blob);
    };
    rec.current = r;
    r.start();
    setSecs(0); setState('recording');
    const began = Date.now();
    timers.current.push(setInterval(() => setSecs(Math.floor((Date.now() - began) / 1000)), 250));
    timers.current.push(setTimeout(() => r.state === 'recording' && r.stop(), MAX_MS));
  };
  const stop = () => rec.current?.state === 'recording' && rec.current.stop();

  const label = state === 'recording' ? 'Stop and add the note' : state === 'working' ? 'Writing it down...' : 'Speak a note';
  return (
    <span className={`inline-flex flex-col items-center shrink-0 ${className}`}>
      <button type="button" onClick={state === 'recording' ? stop : start} disabled={state === 'working'} title={label} aria-label={label}
        className={`h-full min-h-[2.25rem] px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${state === 'recording' ? 'bg-red-600 text-white animate-pulse' : ui.soft}`}>
        {state === 'recording' ? <><Square size={13} fill="currentColor" /> {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</>
          : state === 'working' ? <Loader2 size={15} className="animate-spin" /> : <Mic size={15} />}
      </button>
      {error && <span className="text-[10px] text-red-500 mt-0.5 max-w-[10rem] text-center leading-tight">{error}</span>}
    </span>
  );
}
