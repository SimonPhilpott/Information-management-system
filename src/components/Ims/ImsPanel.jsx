import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX, Square, Trash2 } from 'lucide-react';
import ImsFace from './ImsFace';
import { useImsLive } from '../../hooks/useImsLive';

const STATUS_TEXT = {
  asleep: 'Asleep - type or tap the mic to talk', connecting: 'Waking up...', ready: 'Awake - type or tap the mic',
  listening: 'Listening...', thinking: 'Thinking...', speaking: 'Speaking',
};
const STATUS_DOT = { asleep: 'bg-slate-500', connecting: 'bg-amber-400', ready: 'bg-emerald-400', listening: 'bg-emerald-400 animate-pulse', thinking: 'bg-sky-400 animate-pulse', speaking: 'bg-violet-400' };

// Ims on the home page: his face (compact, shrinking once a conversation gets going), the chat,
// a text box and a mic. Voice replies can be switched off to have him answer in text only.
export default function ImsPanel({ theme = 'dark' }) {
  const isDark = theme === 'dark';
  const ims = useImsLive();
  const [text, setText] = useState('');
  const listRef = useRef(null);
  const compact = ims.messages.length > 0;

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [ims.messages]);

  const submit = () => { if (text.trim()) { ims.sendText(text); setText(''); } };
  const border = isDark ? 'border-white/10' : 'border-[#2E2B27]/10';
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className={`flex flex-col h-full min-h-0 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
      {/* face and controls */}
      <div className={`flex items-center gap-4 px-4 py-3 border-b ${border} transition-all`}>
        <ImsFace face={ims.face} status={ims.status} levelRef={ims.levelRef} width={compact ? 96 : 200} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-black tracking-tight">Ims</span>
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[ims.status]}`} />
            <span className={`text-xs ${muted}`}>{STATUS_TEXT[ims.status]}</span>
          </div>
          {!compact && <p className={`text-xs mt-1 ${muted}`}>Same Ims as on your desk: he knows your calendar, glucose, runs, music and library, and remembers what you've talked about.</p>}
          {ims.error && <p className="text-xs mt-1 text-red-500">{ims.error}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button onClick={() => ims.setVoiceReplies(!ims.voiceReplies)} title={ims.voiceReplies ? 'Voice replies on - tap for text only' : 'Text-only replies - tap to hear him'}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border ${border} ${ims.voiceReplies ? '' : 'opacity-70'}`}>
              {ims.voiceReplies ? <Volume2 size={13} /> : <VolumeX size={13} />} {ims.voiceReplies ? 'Voice replies' : 'Text only'}
            </button>
            {ims.status === 'speaking' && (
              <button onClick={ims.stopSpeaking} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border ${border}`}><Square size={11} /> Stop</button>
            )}
            {compact && (
              <button onClick={ims.clear} title="Clear the chat on screen" className={`px-2 py-1.5 rounded-lg text-[11px] border ${border} ${muted}`}><Trash2 size={12} /></button>
            )}
          </div>
        </div>
      </div>

      {/* conversation */}
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {!compact && (
          <div className={`m-auto text-center text-sm ${muted} max-w-md`}>
            <p>Ask him anything: "what's my day look like?", "how's my blood sugar been this week?", "I've just had two slices of toast", "any news from my sources?"</p>
            <p className="text-xs mt-2">He closes the conversation after 15 seconds of quiet to keep costs down - just speak or type again.</p>
          </div>
        )}
        {ims.messages.map((m) => (
          m.role === 'tool' ? (
            <div key={m.id} className={`self-start text-[11px] italic ${muted} pl-1`}>Ims {m.text}</div>
          ) : (
            <div key={m.id} className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'self-end bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-br-md'
                : `self-start rounded-bl-md ${isDark ? 'bg-slate-800/70' : 'bg-white border border-[#2E2B27]/10'}`
            } ${m.done ? '' : 'opacity-80'}`}>
              {m.text}
            </div>
          )
        ))}
      </div>

      {/* input */}
      <div className={`px-4 py-3 border-t ${border} flex items-end gap-2`}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Type to Ims..." className={`flex-1 resize-none px-3.5 py-2.5 rounded-xl text-sm outline-none border max-h-32 ${isDark ? 'bg-slate-900/60 border-white/10' : 'bg-white border-[#2E2B27]/10'}`} />
        <button onClick={submit} disabled={!text.trim()} title="Send" className="p-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white disabled:opacity-40"><Send size={16} /></button>
        <button onClick={ims.toggleMic} title={ims.micOn ? 'Stop talking' : 'Talk to Ims'}
          className={`p-3 rounded-xl text-white ${ims.micOn ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-r from-emerald-500 to-teal-600'}`}>
          {ims.micOn ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
      </div>
    </div>
  );
}
