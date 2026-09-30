import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquareQuote, Mic, Square, Plus, Trash2, X, Play, RotateCw, Activity, ShieldCheck, Clock, Power, VolumeX, CheckCircle2, RotateCcw, Sparkles } from 'lucide-react';
import PortalShell from './PortalShell';

const DEVICE_SECONDS = 3;

function WakeDaemonMonitorCard({ isDark, notify }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/wake-daemon/status');
      const d = await res.json();
      if (d.success && d.status) {
        setStatus(d.status);
      }
    } catch (_) {
      // Background poll failure silently handled
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 2500);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/wake-daemon/reset', { method: 'POST' });
      const d = await res.json();
      if (d.success) {
        setStatus(d.status);
        notify('Wake daemon and device forced to Silent Standby', 'success');
      } else {
        notify(d.error || 'Failed to reset daemon', 'error');
      }
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setResetting(false);
    }
  };

  const border = isDark ? 'border-white/10' : 'border-[#2E2B27]/10';
  const cardBg = isDark ? 'bg-slate-900/60' : 'bg-white/80';

  const stateColors = {
    STANDBY: {
      badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      dot: 'bg-emerald-500',
      label: 'Silent Standby',
      desc: 'Microphone audio streaming is inactive. IMS only wakes when authorised wake phrases are invoked or the screen is tapped.'
    },
    VERIFYING: {
      badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      dot: 'bg-amber-500 animate-ping',
      label: 'Verifying Candidate',
      desc: 'Candidate audio detected. Daemon is actively verifying whether authorised wake phrases were spoken.'
    },
    CONVERSATION_ACTIVE: {
      badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
      dot: 'bg-purple-400 animate-pulse',
      label: 'Conversation Active',
      desc: 'Dialogue open. Follow-ups accepted without repeating wake words. Inactivity watchdog active.'
    },
    CLOSING: {
      badge: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      dot: 'bg-rose-500',
      label: 'Closing Conversation',
      desc: 'Farewell or silence watchdog triggered. Returning device to silent standby.'
    }
  };

  const curr = (status && stateColors[status.state]) ? stateColors[status.state] : stateColors.STANDBY;
  const silenceSecRemaining = status ? Math.ceil((status.silenceRemainingMs || 0) / 1000) : 15;

  return (
    <div className={`rounded-2xl border ${border} p-5 ${cardBg} shadow-sm backdrop-blur-md flex flex-col gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-inherit">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-purple-500/20">
            <Activity size={17} />
          </div>
          <div>
            <h2 className="text-sm font-black tracking-tight flex items-center gap-2">
              Background Wake Daemon
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Service Running
              </span>
            </h2>
            <p className="text-[11px] text-slate-500">
              Local background service managing wake recognition, 15-second silence auto-close, and active bye phrase termination
            </p>
          </div>
        </div>

        <button
          onClick={handleReset}
          disabled={resetting}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
            isDark ? 'border-white/10 hover:bg-white/5 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
          }`}
          title="Force immediate return to Standby and cut off mic streaming"
        >
          <RotateCcw size={12} className={resetting ? 'animate-spin' : ''} />
          Force Standby
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* State Tile */}
        <div className={`p-3.5 rounded-xl border ${border} ${isDark ? 'bg-slate-950/40' : 'bg-slate-50'} flex flex-col justify-between gap-2`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Device State</span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${curr.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${curr.dot}`} />
              {curr.label}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 leading-snug">
            {curr.desc}
          </p>
        </div>

        {/* Silence Watchdog Tile */}
        <div className={`p-3.5 rounded-xl border ${border} ${isDark ? 'bg-slate-950/40' : 'bg-slate-50'} flex flex-col justify-between gap-2`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Silence Watchdog</span>
            <span className="text-xs font-black text-purple-400 flex items-center gap-1">
              <Clock size={12} />
              {status?.state === 'CONVERSATION_ACTIVE' ? `${silenceSecRemaining}s remaining` : '15s Watchdog Ready'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 leading-snug">
            {status?.state === 'CONVERSATION_ACTIVE'
              ? `Conversation terminates automatically in ${silenceSecRemaining}s if silent, stopping mic streaming and returning to standby.`
              : 'When talking, staying silent for 15s automatically terminates the dialogue and halts device mic streaming.'}
          </p>
        </div>

        {/* Active Phrase Gating Tile */}
        <div className={`p-3.5 rounded-xl border ${border} ${isDark ? 'bg-slate-950/40' : 'bg-slate-50'} flex flex-col justify-between gap-2`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Phrase Verification</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Sparkles size={10} /> Active Wake Engine
            </span>
          </div>
          <p className="text-[11px] text-slate-500 leading-snug">
            Precision wake phrase gating (including phonetic rhymes like Tims/Jims). Stop phrases are disabled to prevent audio cut-offs.
          </p>
        </div>
      </div>

      {/* Live Activity & Diagnostic Logs */}
      {status?.recentLogs && status.recentLogs.length > 0 && (
        <div className={`p-3.5 rounded-xl border ${border} ${isDark ? 'bg-slate-950/60' : 'bg-slate-50'} flex flex-col gap-2`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Live Wake Daemon Event Activity ({status.recentLogs.length} events logged)
            </span>
            <span className="text-[10px] font-mono text-slate-500">Auto-refreshing</span>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1.5 font-mono text-[11px] pr-1">
            {status.recentLogs.map((log) => {
              const timeStr = new Date(log.timestamp).toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
              const isWake = log.type === 'wake_verified';
              const isReject = log.type === 'wake_rejected';
              const isCandidate = log.type === 'candidate';
              const isTimeout = log.type === 'silence_timeout';
              const color = isWake ? 'text-emerald-400' : isReject ? 'text-amber-400' : isCandidate ? 'text-sky-400' : isTimeout ? 'text-rose-400' : 'text-slate-400';
              return (
                <div key={log.id} className={`p-1.5 rounded bg-black/20 border border-white/5 flex items-start justify-between gap-2 ${color}`}>
                  <span className="shrink-0 text-slate-500 text-[10px]">{timeStr}</span>
                  <span className="grow break-all">{log.message}</span>
                  <span className="shrink-0 text-[10px] uppercase font-bold px-1 py-0.2 rounded bg-white/5">{log.type}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Telemetry Summary Bar */}
      {status && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-slate-500 border-t border-inherit">
          <div className="flex items-center gap-4">
            <span>
              Last Wake: <strong className="text-slate-300 font-semibold">{status.lastWakePhrase || 'None yet'}</strong>
            </span>
            <span>
              Last Close Reason: <strong className="text-slate-300 font-semibold">{status.lastCloseReason || 'Boot'}</strong>
            </span>
            <span>
              Conversations Handled: <strong className="text-slate-300 font-semibold">{status.conversationsCount || 0}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Service Uptime:</span>
            <span className="font-mono text-xs text-slate-400">
              {Math.floor((status.uptimeSeconds || 0) / 60)}m {(status.uptimeSeconds || 0) % 60}s
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

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
      
      {/* Live Background Wake Daemon Monitor */}
      <WakeDaemonMonitorCard isDark={isDark} notify={notify} />

      <div className={`${panel} text-xs text-slate-500`}>
        Speech-to-text often writes these short phrases oddly ("Hey IMS" can come out as "HMs"). Press Record on Ims, then say the phrase to the desk unit within 3 seconds (its screen shows "Say the phrase now") - it records with its own microphone, the one it really listens with. Do each a few times. IMS runs the recording through the same speech-to-text Ims listens with, and adds any new spelling to the list. Ims then recognises those spellings too. You can edit the lists by hand. Speak from where you'd normally talk to Ims. He needs to be on standby (not mid-conversation).
      </div>
      {section('wake', 'Wake phrases', 'Start a conversation with Ims. Anything else he hears is ignored.')}
      {section('stop', 'Stop phrases', 'Stop Ims straight away - cancels what he is doing, silences a ringing alarm or timer, or ends a call recording.')}
    </PortalShell>
  );
}
