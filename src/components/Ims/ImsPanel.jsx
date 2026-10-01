import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX, Square, Trash2, Utensils, Activity, Radio, Cpu, Sparkles, Wifi, Command } from 'lucide-react';
import PhotoCarbs, { CameraCapture } from '../Dashboard/PhotoCarbs';
import ImsFace from './ImsFace';
import { useImsLive } from '../../hooks/useImsLive';

const STATUS_TEXT = {
  asleep: 'Asleep - type or tap the mic to talk',
  connecting: 'Waking up...',
  ready: 'Awake - type or tap the mic',
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking',
};

const STATUS_DOT = {
  asleep: 'bg-slate-500',
  connecting: 'bg-amber-400',
  ready: 'bg-emerald-400',
  listening: 'bg-emerald-400 animate-pulse',
  thinking: 'bg-sky-400 animate-pulse',
  speaking: 'bg-violet-400',
};

// Real-time audio waveform visualizer rendered around/under IMS's avatar mirroring the Box-3 display state
function AudioWaveVisualizer({ getAudioFrequencyData, isSpeaking, isListening, isDark }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    const freqData = new Uint8Array(64);

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const hasData = getAudioFrequencyData ? getAudioFrequencyData(freqData) : false;
      const bars = 24;
      const barWidth = (w - (bars - 1) * 3) / bars;

      for (let i = 0; i < bars; i++) {
        let val = 0;
        if (hasData && (isSpeaking || isListening)) {
          const idx = Math.floor((i / bars) * 32);
          val = (freqData[idx] || 0) / 255;
        } else if (isListening) {
          val = 0.15 + 0.1 * Math.sin(Date.now() / 150 + i * 0.4);
        } else if (isSpeaking) {
          val = 0.25 + 0.2 * Math.sin(Date.now() / 100 + i * 0.5);
        }

        const barHeight = Math.max(3, val * (h - 6));
        const x = i * (barWidth + 3);
        const y = (h - barHeight) / 2;

        let grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (isSpeaking) {
          grad.addColorStop(0, '#8b5cf6'); // Violet
          grad.addColorStop(1, '#6366f1'); // Indigo
        } else if (isListening) {
          grad.addColorStop(0, '#10b981'); // Emerald
          grad.addColorStop(1, '#06b6d4'); // Cyan
        } else {
          grad.addColorStop(0, isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(100, 116, 139, 0.25)');
          grad.addColorStop(1, isDark ? 'rgba(71, 85, 105, 0.2)' : 'rgba(148, 163, 184, 0.25)');
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [getAudioFrequencyData, isSpeaking, isListening, isDark]);

  return (
    <div className="w-full h-8 px-2 flex items-center justify-center">
      <canvas ref={canvasRef} className="w-full h-full max-w-[280px]" />
    </div>
  );
}

// Live telemetry status strip mirroring the Box-3 OLED/LCD top bar
function Box3TelemetryHeader({ status, isDark, levelRef }) {
  const [rmsLevel, setRmsLevel] = useState(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const lvl = levelRef?.current || 0;
      setRmsLevel(Math.round(lvl * 100));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [levelRef]);

  const border = isDark ? 'border-white/10' : 'border-[#2E2B27]/10';

  return (
    <div className={`flex items-center justify-between px-3 py-1.5 rounded-xl border ${border} ${isDark ? 'bg-slate-900/60' : 'bg-slate-50'} text-[10px] font-mono mb-2 max-w-xl mx-auto shadow-inner`}>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-emerald-400 font-semibold">
          <Cpu size={12} className="text-emerald-400" />
          <span>BOX-3 MIRROR</span>
        </span>
        <span className="text-slate-500">•</span>
        <span className="text-sky-400 font-medium">gemini-2.0-flash-exp</span>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1 text-slate-400">
          <Activity size={11} className={status === 'speaking' || status === 'listening' ? 'text-violet-400 animate-pulse' : 'text-slate-500'} />
          <span>RMS: {rmsLevel}%</span>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <Radio size={11} className="text-emerald-400" />
          <span className="uppercase">{status}</span>
        </div>
      </div>
    </div>
  );
}

// Ims on the home page: his face, full width, with live audio visualizer, Box-3 telemetry strip,
// voice-replies switch, and responsive chat.
export default function ImsPanel({ theme = 'dark' }) {
  const isDark = theme === 'dark';
  const ims = useImsLive();
  const [text, setText] = useState('');
  const listRef = useRef(null);
  const textareaRef = useRef(null);
  const [plate, setPlate] = useState(null);
  const [carbNote, setCarbNote] = useState(null);
  const [camera, setCamera] = useState(false);
  const compact = ims.messages.length > 0;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [ims.messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      if (text) {
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 260) + 'px';
      }
    }
  }, [text]);

  const submit = () => {
    if (text.trim()) {
      ims.sendText(text);
      setText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleInput = (e) => {
    setText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 260) + 'px';
  };

  const border = isDark ? 'border-white/10' : 'border-[#2E2B27]/10';
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className={`flex flex-col h-full min-h-0 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
      {/* Face, telemetry, waveform and voice controls */}
      <div className={`px-4 pt-2 pb-2 border-b ${border}`}>
        <Box3TelemetryHeader status={ims.status} isDark={isDark} levelRef={ims.levelRef} />
        <ImsFace face={ims.face} status={ims.status} levelRef={ims.levelRef} width="100%" className="max-w-[280px] mx-auto shadow-2xl" />
        
        {/* Dynamic real-time audio waveform visualizer */}
        <AudioWaveVisualizer
          getAudioFrequencyData={ims.getAudioFrequencyData}
          isSpeaking={ims.status === 'speaking'}
          isListening={ims.status === 'listening'}
          isDark={isDark}
        />

        <div className="flex flex-wrap items-center gap-2 mt-1 max-w-xl mx-auto">
          <button
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
            }}
            title="Open Global Command Palette (Ctrl+K)"
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border transition ${border} ${
              isDark ? 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Command size={12} className="text-violet-400" />
            <span>Launcher</span>
            <kbd className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-violet-600/20 text-violet-300 border border-violet-500/30">Ctrl+K</kbd>
          </button>
          <button
            onClick={() => ims.setVoiceReplies(!ims.voiceReplies)}
            title={ims.voiceReplies ? 'Voice replies on - tap for text only' : 'Text-only replies - tap to hear him'}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border transition ${border} ${
              ims.voiceReplies ? 'bg-violet-600/10 text-violet-400 border-violet-500/30' : 'opacity-70'
            }`}
          >
            {ims.voiceReplies ? <Volume2 size={13} /> : <VolumeX size={13} />} {ims.voiceReplies ? 'Voice replies' : 'Text only'}
          </button>
          <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[ims.status]}`} />
          <span className={`text-xs ${muted} min-w-0 truncate`}>{STATUS_TEXT[ims.status]}</span>
          <div className="ml-auto flex items-center gap-2">
            {ims.status === 'speaking' && (
              <button
                onClick={ims.stopSpeaking}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border bg-red-500/10 text-red-400 border-red-500/30 ${border}`}
              >
                <Square size={11} /> Stop
              </button>
            )}
            {compact && (
              <button
                onClick={ims.clear}
                title="Clear the chat on screen"
                className={`px-2 py-1.5 rounded-lg text-[11px] border hover:text-red-400 transition ${border} ${muted}`}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
        {ims.error && <p className="text-xs mt-1 text-red-500 max-w-xl mx-auto">{ims.error}</p>}
      </div>

      {/* Conversation message stream */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {!compact && (
          <div className={`m-auto text-center text-sm ${muted} max-w-md`}>
            <p>Ask him anything: "what's my day look like?", "how's my blood sugar been this week?", "I've just had two slices of toast", "any news from my sources?"</p>
          </div>
        )}
        {ims.messages.map((m) => (
          m.role === 'tool' ? (
            <div key={m.id} className={`self-start text-[11px] italic ${muted} pl-1`}>Ims {m.text}</div>
          ) : (
            <div
              key={m.id}
              className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                m.role === 'user'
                  ? 'self-end bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-br-md'
                  : `self-start rounded-bl-md ${isDark ? 'bg-slate-800/70 border border-white/5' : 'bg-white border border-[#2E2B27]/10'}`
              } ${m.done ? '' : 'opacity-80'}`}
            >
              {m.text}
            </div>
          )
        ))}
      </div>

      {plate && (
        <div className={`px-4 pt-3 border-t ${border} max-h-[60vh] overflow-y-auto`}>
          <PhotoCarbs
            file={plate}
            isDark={isDark}
            gradient="from-emerald-500 to-teal-600"
            field={`w-full px-2.5 py-1.5 rounded-lg text-sm outline-none border ${isDark ? 'bg-slate-900/60 border-white/10' : 'bg-white border-[#2E2B27]/10'}`}
            notify={(msg, kind) => {
              setCarbNote({ msg, error: kind === 'error' });
              setTimeout(() => setCarbNote(null), 5000);
            }}
            onLogged={() => setPlate(null)}
            onCancel={() => setPlate(null)}
          />
        </div>
      )}
      {carbNote && <div className={`px-4 pt-2 text-xs ${carbNote.error ? 'text-red-500' : 'text-emerald-500'}`}>{carbNote.msg}</div>}

      {/* Input controls */}
      <div className={`px-4 py-3 border-t ${border} flex items-end gap-2`}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          rows={1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Type to Ims..."
          className={`flex-1 resize-none px-3.5 py-2.5 rounded-xl text-sm outline-none border min-h-[42px] max-h-[260px] overflow-y-auto leading-relaxed transition ${
            isDark ? 'bg-slate-900/60 border-white/10 focus:border-violet-500/50' : 'bg-white border-[#2E2B27]/10 focus:border-violet-500/50'
          }`}
        />
        <button
          onClick={submit}
          disabled={!text.trim()}
          title="Send"
          className="p-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white disabled:opacity-40 shadow-lg shadow-violet-600/20 hover:scale-[1.02] active:scale-[0.98] transition"
        >
          <Send size={16} />
        </button>
        <button
          onClick={() => setCamera(true)}
          title="Carbs from a photo of your food"
          aria-label="Carbs from a photo of your food"
          className={`p-3 rounded-xl border ${border} ${isDark ? 'bg-slate-800/70 hover:bg-slate-800' : 'bg-white hover:bg-slate-100'} transition`}
        >
          <Utensils size={16} />
        </button>
        {camera && <CameraCapture onPhoto={(f) => { setCamera(false); setPlate(f); }} onClose={() => setCamera(false)} />}
        <button
          onClick={ims.toggleMic}
          title={ims.micOn ? 'Stop talking' : 'Talk to Ims'}
          className={`p-3 rounded-xl text-white transition shadow-lg ${
            ims.micOn ? 'bg-red-500 animate-pulse shadow-red-500/30' : 'bg-gradient-to-r from-emerald-500 to-teal-600 shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98]'
          }`}
        >
          {ims.micOn ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
      </div>
    </div>
  );
}
