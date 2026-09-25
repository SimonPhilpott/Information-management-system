import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquareQuote, Mic, Square, Plus, Trash2, X, Play, RotateCw } from 'lucide-react';
import PortalShell from './PortalShell';

const DEVICE_SECONDS = 3;

function PhraseCard({ p, isDark, onChanged, notify }) {
  const [state, setState] = useState('idle'); // idle | recording | working
  const [level, setLevel] = useState(0);
  const [last, setLast] = useState(null);
  const [adding, setAdding] = useState('');
  const border = isDark ? 'border-white/10' : 'border-[#2E2B27]/10';

  // Records from the IMS desk unit's own microphone: it shows "Say the phrase now" for 3 seconds.
  const record = async () => {
    setLast(null); setState('recording'); setLevel(DEVICE_SECONDS);
    const tick = setInterval(() => setLevel((n) => Math.max(0, n - 1)), 1000);
    try {
      const res = await fetch(`/api/phrases/${p.id}/record-device`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds: DEVICE_SECONDS }) });
      clearInterval(tick); setState('working');
      const d = await res.json();
      if (!d.success) throw new Error(d.error);
      setLast({ transcript: d.transcript, added: d.added });
      onChanged(d.phrase);
    } catch (err) { notify(err.message, 'error'); }
    clearInterval(tick); setState('idle');
  };
  const saveVariants = async (variants) => {
    const d = await (await fetch(`/api/phrases/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variants }) })).json();
    if (d.success) onChanged(d.phrase); else notify(d.error, 'error');
  };
  const addVariant = () => { const v = adding.trim(); if (v && !p.variants.includes(v.toLowerCase())) saveVariants([...p.variants, v]); setAdding(''); };
  const remove = async () => {
    if (!window.confirm(`Delete "${p.phrase}" and its recordings?`)) return;
    await fetch(`/api/phrases/${p.id}`, { method: 'DELETE' }); onChanged(null, p.id);
  };
  const delRec = async (rid) => { await fetch(`/api/phrases/recordings/${rid}`, { method: 'DELETE' }); onChanged({ ...p, recordings: p.recordings.filter((r) => r.id !== rid) }); };

  return (
    <div className={`rounded-xl border ${border} p-3 flex flex-col gap-2.5 ${isDark ? 'bg-slate-950/40' : 'bg-white'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-black text-sm flex-1 min-w-0 break-words">"{p.phrase}"</span>
        {state === 'recording' ? (
          <span className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-red-500 text-white animate-pulse">
            <Mic size={12} /> Say it to Ims now{level > 0 ? ` (${level})` : '...'}
          </span>
        ) : (
          <button onClick={record} disabled={state === 'working'} className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white disabled:opacity-50">
            {state === 'working' ? <><RotateCw size={12} className="animate-spin" /> Listening back...</> : <><Mic size={12} /> Record on Ims</>}
          </button>
        )}
        <button onClick={remove} title="Delete phrase" className="text-slate-500 hover:text-red-500"><Trash2 size={13} /></button>
      </div>
      {last && (
        <p className="text-xs">
          Heard as <b>"{last.transcript || '(nothing)'}"</b> - {last.transcript ? (last.added ? <span className="text-emerald-500 font-semibold">new spelling added</span> : 'already known') : 'try again a bit louder or closer'}.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-slate-500 font-semibold mr-1">Recognised as:</span>
        {p.variants.map((v) => (
          <span key={v} className={`flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full ${isDark ? 'bg-purple-500/15 text-purple-300' : 'bg-purple-100 text-purple-700'}`}>
            {v}<button onClick={() => saveVariants(p.variants.filter((x) => x !== v))} className="opacity-60 hover:opacity-100" title="Remove"><X size={10} /></button>
          </span>
        ))}
        <input value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addVariant(); }} onBlur={addVariant}
          placeholder="+ add spelling" className={`w-28 px-2 py-0.5 rounded-full outline-none border bg-transparent ${border}`} />
      </div>
      {p.recordings.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {p.recordings.map((r) => (
            <span key={r.id} className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border ${border}`}>
              <button onClick={() => new Audio(`/api/phrases/recordings/${r.id}/audio`).play()} title="Play" className="hover:text-purple-500"><Play size={10} /></button>
              "{r.transcript || '...'}"
              <button onClick={() => delRec(r.id)} title="Delete recording" className="opacity-60 hover:opacity-100 hover:text-red-500"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PhrasesPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [phrases, setPhrases] = useState([]);
  const [newPhrase, setNewPhrase] = useState({ wake: '', stop: '' });
  const [notification, setNotification] = useState(null);
  const notify = (msg, type = 'success') => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3500); };
  const panel = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const field = `px-3 py-2 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10' : 'bg-white border-[#2E2B27]/10'}`;

  const load = useCallback(async () => { const d = await (await fetch('/api/phrases')).json(); if (d.success) setPhrases(d.phrases); }, []);
  useEffect(() => { load(); }, [load]);
  const changed = (p, removedId) => setPhrases((all) => (removedId ? all.filter((x) => x.id !== removedId) : all.map((x) => (x.id === p.id ? p : x))));
  const add = async (kind) => {
    const d = await (await fetch('/api/phrases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, phrase: newPhrase[kind] }) })).json();
    if (!d.success) return notify(d.error, 'error');
    setPhrases((all) => [...all, d.phrase]); setNewPhrase((n) => ({ ...n, [kind]: '' }));
    notify(`Added "${d.phrase.phrase}" - now record yourself saying it a few times.`);
  };

  const section = (kind, title, help) => (
    <div className={panel}>
      <h2 className="text-xs font-black uppercase tracking-wider mb-1">{title}</h2>
      <p className="text-[11px] text-slate-500 mb-3">{help}</p>
      <div className="flex flex-col gap-2">
        {phrases.filter((p) => p.kind === kind).map((p) => <PhraseCard key={p.id} p={p} isDark={isDark} onChanged={changed} notify={notify} />)}
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <input value={newPhrase[kind]} onChange={(e) => setNewPhrase({ ...newPhrase, [kind]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && newPhrase[kind].trim() && add(kind)}
          placeholder={kind === 'wake' ? 'New wake phrase, e.g. Now then IMS' : 'New stop phrase, e.g. That will do IMS'} className={`${field} flex-1 min-w-[12rem]`} />
        <button onClick={() => add(kind)} disabled={!newPhrase[kind].trim()} className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white disabled:opacity-40"><Plus size={13} /> Add</button>
      </div>
    </div>
  );

  return (
    <PortalShell title="Wake and Stop Phrases" subtitle="/ims/phrases • what wakes Ims up and what stops him"
      icon={MessageSquareQuote} gradient="from-fuchsia-500 to-purple-600" glow="rgba(192,38,211,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification} maxWidth="max-w-4xl">
      <div className={`${panel} text-xs text-slate-500`}>
        Speech-to-text often writes these short phrases oddly ("Hey IMS" can come out as "HMs"). Press Record on Ims, then say the phrase to the desk unit within 3 seconds (its screen shows "Say the phrase now") - it records with its own microphone, the one it really listens with. Do each a few times. IMS runs the recording through the same speech-to-text Ims listens with, and adds any new spelling to the list. Ims then recognises those spellings too. You can edit the lists by hand. Speak from where you'd normally talk to Ims. He needs to be on standby (not mid-conversation).
      </div>
      {section('wake', 'Wake phrases', 'Start a conversation with Ims. Anything else he hears is ignored.')}
      {section('stop', 'Stop phrases', 'Stop Ims straight away - cancels what he is doing, silences a ringing alarm or timer, or ends a call recording.')}
    </PortalShell>
  );
}
