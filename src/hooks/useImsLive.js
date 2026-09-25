import { useCallback, useEffect, useRef, useState } from 'react';

// Talks to the same server-side Ims as the desk terminal (/api/ims-live): persona, memory and
// every tool run on the server. This hook streams the mic in, plays his voice out, turns both
// sides' speech into chat text, sends typed messages, and passes on face changes.
// The server closes the Gemini session after 15 s of silence ("sessionIdle"); it reopens by
// itself on the next message.

const TOOL_LABELS = {
  getBloodGlucose: 'checked your glucose', getWeather: 'checked the weather', getCalendarEvents: 'looked at your calendar',
  addCalendarEvent: 'added to your calendar', scheduleItem: 'set a reminder', listScheduledItems: 'checked your reminders',
  searchLibrary: 'searched your library', recallMemory: 'looked in his memory', rememberFact: 'remembered that',
  getDayReport: 'pulled your day report', getNews: 'read the news', tellJoke: 'found a joke', getTrainingSummary: 'checked your training',
  lookUpFood: 'looked up the carbs', logCarbs: 'logged your carbs', getNewMusicReleases: 'checked new music', getUpcomingBirthdays: 'checked birthdays',
  addToList: 'updated a list', readList: 'read a list', clearOldNightscoutData: 'cleared old Nightscout data',
  startBackgroundTask: 'started a background task', getBackgroundTasks: 'checked on his background tasks',
};
const SILENT_TOOLS = new Set(['setEmotion', 'endConversation', 'noWakeDetected']);

const b64ToInt16 = (b64) => { const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Int16Array(u8.buffer); };
const int16ToB64 = (i16) => { const u8 = new Uint8Array(i16.buffer); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };


export function useImsLive() {
  const [status, setStatus] = useState('asleep'); // asleep | connecting | listening | thinking | speaking | ready
  const [messages, setMessages] = useState([]);
  const [face, setFace] = useState(null);
  const [micOn, setMicOn] = useState(false);
  const [error, setError] = useState(null);
  const [voiceReplies, setVoiceRepliesState] = useState(() => { try { return localStorage.getItem('ims_voice_replies') !== 'off'; } catch { return true; } });
  const levelRef = useRef(0);

  const wsRef = useRef(null);
  const outCtxRef = useRef(null), analyserRef = useRef(null), nextTimeRef = useRef(0), sourcesRef = useRef([]);
  const micRef = useRef(null); // { ctx, stream, node }
  const voiceRef = useRef(voiceReplies);
  const micOnRef = useRef(false);
  const endAfterSpeechRef = useRef(false);
  const standbyFaceRef = useRef(null);

  useEffect(() => { voiceRef.current = voiceReplies; }, [voiceReplies]);
  const setVoiceReplies = (v) => { setVoiceRepliesState(v); try { localStorage.setItem('ims_voice_replies', v ? 'on' : 'off'); } catch { /* ignore */ } if (!v) stopPlayback(); };

  // The standby face from the Face Designer is his resting face here too.
  useEffect(() => {
    fetch('/api/face-designs').then((r) => r.json()).then((d) => {
      const f = d.faces?.find((x) => x.name === 'standby') || d.faces?.find((x) => x.name === 'neutral');
      if (f) { standbyFaceRef.current = { grid: f.grid, openGrid: f.openGrid, color: f.color, eyes: f.eyeAnim?.enabled ? { cells: f.eyeAnim.cells.map((c) => ({ g: c.grid, ms: c.ms })) } : null }; setFace((cur) => cur || standbyFaceRef.current); }
    }).catch(() => {});
  }, []);

  // ---- chat text -----------------------------------------------------------------------------------
  const appendText = (role, text) => setMessages((m) => {
    const last = m[m.length - 1];
    if (last && last.role === role && !last.done) return [...m.slice(0, -1), { ...last, text: last.text + text }];
    return [...m.filter((x) => !(x.role !== role && !x.done && !x.text.trim())), { id: Date.now() + Math.random(), role, text, done: false }];
  });
  const finishAll = () => setMessages((m) => m.map((x) => (x.done ? x : { ...x, done: true, text: x.text.trim() })).filter((x) => x.text || x.role === 'tool'));
  const addNote = (role, text) => setMessages((m) => [...m, { id: Date.now() + Math.random(), role, text, done: true }]);

  // ---- voice out -----------------------------------------------------------------------------------
  const ensureOut = () => {
    if (!outCtxRef.current) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      const analyser = ctx.createAnalyser(); analyser.fftSize = 512; analyser.connect(ctx.destination);
      outCtxRef.current = ctx; analyserRef.current = analyser;
    }
    if (outCtxRef.current.state === 'suspended') outCtxRef.current.resume();
    return outCtxRef.current;
  };
  const stopPlayback = () => { sourcesRef.current.forEach((s) => { try { s.stop(); } catch { /* ended */ } }); sourcesRef.current = []; nextTimeRef.current = 0; };
  const playChunk = (b64) => {
    const ctx = ensureOut();
    const pcm = b64ToInt16(b64);
    const buf = ctx.createBuffer(1, pcm.length, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(analyserRef.current);
    const at = Math.max(ctx.currentTime + 0.03, nextTimeRef.current);
    src.start(at); nextTimeRef.current = at + buf.duration;
    sourcesRef.current.push(src);
    src.onended = () => { sourcesRef.current = sourcesRef.current.filter((s) => s !== src); };
  };
  const isPlaying = () => outCtxRef.current && nextTimeRef.current > outCtxRef.current.currentTime;

  // Voice level for the mouth, and status while his voice is still playing out.
  useEffect(() => {
    let raf = 0; const data = new Uint8Array(256);
    const tick = () => {
      const a = analyserRef.current;
      if (a) { a.getByteTimeDomainData(data); let sum = 0; for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; } levelRef.current = Math.min(1, Math.sqrt(sum / data.length) * 4); } else levelRef.current = 0;
      setStatus((st) => {
        if (isPlaying()) return 'speaking';
        if (st === 'speaking') {
          if (endAfterSpeechRef.current) { endAfterSpeechRef.current = false; stopMic(); return 'asleep'; }
          return micOnRef.current ? 'listening' : 'ready';
        }
        return st;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- connection ---------------------------------------------------------------------------------
  const handleMessage = (raw) => {
    let d; try { d = JSON.parse(raw); } catch { return; }
    if (d.setupComplete) { setStatus((s) => (s === 'connecting' ? (micOnRef.current ? 'listening' : 'ready') : s)); return; }
    if (d.setEmotion !== undefined) { setFace(d.face || d.standbyFace || standbyFaceRef.current); return; }
    if (d.sessionIdle) { stopMic(); finishAll(); setStatus('asleep'); setFace(standbyFaceRef.current); return; }
    if (d.endConversation) { endAfterSpeechRef.current = true; if (!isPlaying()) { endAfterSpeechRef.current = false; stopMic(); setStatus('asleep'); } return; }
    if (d.toolCall?.functionCalls) {
      setStatus('thinking');
      for (const c of d.toolCall.functionCalls) if (!SILENT_TOOLS.has(c.name)) addNote('tool', TOOL_LABELS[c.name] || c.name);
      return;
    }
    const sc = d.serverContent;
    if (!sc) return;
    if (sc.interrupted) { stopPlayback(); finishAll(); }
    if (sc.inputTranscription?.text) { appendText('user', sc.inputTranscription.text); setStatus('thinking'); }
    if (sc.outputTranscription?.text) appendText('ims', sc.outputTranscription.text);
    for (const p of sc.modelTurn?.parts || []) {
      if (p.inlineData?.data && p.inlineData.mimeType?.startsWith('audio/') && voiceRef.current) playChunk(p.inlineData.data);
    }
    if (sc.turnComplete) { finishAll(); if (!isPlaying()) setStatus(micOnRef.current ? 'listening' : 'ready'); }
  };

  const connect = useCallback(() => new Promise((resolve, reject) => {
    const cur = wsRef.current;
    if (cur && cur.readyState === WebSocket.OPEN) return resolve(cur);
    if (cur && cur.readyState === WebSocket.CONNECTING) { cur.addEventListener('open', () => resolve(cur), { once: true }); return; }
    setStatus('connecting'); setError(null);
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ims-live`);
    wsRef.current = ws;
    ws.onopen = () => { ws.send(JSON.stringify({ setup: { model: 'models/gemini-3.8-live', imsWeb: {} } })); resolve(ws); };
    ws.onmessage = (e) => (typeof e.data === 'string' ? handleMessage(e.data) : e.data.text?.().then(handleMessage));
    ws.onerror = () => { setError('Could not reach Ims - check you are signed in.'); reject(new Error('connect failed')); };
    ws.onclose = () => { wsRef.current = null; stopMic(); setStatus('asleep'); finishAll(); };
  }), []);

  const send = async (obj) => { const ws = await connect(); ws.send(JSON.stringify(obj)); };

  const sendText = useCallback(async (text) => {
    const t = String(text || '').trim();
    if (!t) return;
    ensureOut();
    finishAll();
    addNote('user', t);
    setStatus('thinking');
    try { await send({ clientContent: { turns: [{ role: 'user', parts: [{ text: t }] }], turnComplete: true } }); } catch { /* error already shown */ }
  }, []);

  // ---- mic in -------------------------------------------------------------------------------------
  const stopMic = () => {
    micOnRef.current = false; setMicOn(false);
    const m = micRef.current; micRef.current = null;
    if (m) { try { m.node.disconnect(); m.stream.getTracks().forEach((t) => t.stop()); m.ctx.close(); } catch { /* closed */ } }
  };
  const startMic = async () => {
    ensureOut();
    try { await connect(); } catch { return; }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const srcNode = ctx.createMediaStreamSource(stream);
    const ratio = ctx.sampleRate / 16000;
    let pending = [];
    const onFrame = (f32) => {
      const outLen = Math.floor(f32.length / ratio);
      for (let i = 0; i < outLen; i++) { const v = Math.max(-1, Math.min(1, f32[Math.floor(i * ratio)])); pending.push(v < 0 ? v * 0x8000 : v * 0x7fff); }
      if (pending.length >= 640) { // ~40 ms at 16 kHz
        const i16 = Int16Array.from(pending); pending = [];
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN && micOnRef.current) ws.send(JSON.stringify({ realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: int16ToB64(i16) } } }));
      }
    };
    // AudioWorklet where it loads promptly; otherwise the older ScriptProcessor, which works everywhere.
    let node;
    try {
      await Promise.race([ctx.audioWorklet.addModule('/ims-mic-processor.js'), new Promise((_, rej) => setTimeout(() => rej(new Error('worklet slow')), 3000))]);
      node = new AudioWorkletNode(ctx, 'ims-mic');
      node.port.onmessage = (e) => onFrame(e.data);
      srcNode.connect(node);
    } catch (_) {
      node = ctx.createScriptProcessor(2048, 1, 1);
      node.onaudioprocess = (e) => onFrame(e.inputBuffer.getChannelData(0).slice(0));
      srcNode.connect(node);
      node.connect(ctx.destination); // required for onaudioprocess to fire; outputs silence
    }
    micRef.current = { ctx, stream, node };
    micOnRef.current = true; setMicOn(true);
    setStatus((s) => (s === 'speaking' || s === 'thinking' ? s : 'listening'));
  };
  const toggleMic = useCallback(async () => {
    if (micOnRef.current) { stopMic(); setStatus((s) => (s === 'listening' ? 'ready' : s)); return; }
    try { await startMic(); } catch (err) { setError(err.name === 'NotAllowedError' ? 'Microphone access was blocked.' : err.message); stopMic(); }
  }, []);

  const stopSpeaking = useCallback(() => stopPlayback(), []);
  useEffect(() => () => { stopMic(); try { wsRef.current?.close(); } catch { /* closed */ } }, []);

  return { status, messages, face, micOn, error, voiceReplies, setVoiceReplies, levelRef, sendText, toggleMic, stopSpeaking, clear: () => setMessages([]) };
}
