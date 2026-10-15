import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Brain, RotateCw, Play, Check, X, Mic, Square } from 'lucide-react';

// Simon's own wake-word model on /ims/phrases: trained on his voice through the Box-3 microphone, and watching
// every wake check in SHADOW MODE beside the live Gemini check - it never wakes Ims by itself until it's
// switched over (a separate step, once the comparison here shows it's better).
const MAX_SECONDS = 6;
const COUNTDOWN = 3;

export default function WakeModelCard({ isDark, notify, panel, onRecorded }) {
  const [s, setS] = useState(null);
  const [review, setReview] = useState([]);
  const [rec, setRec] = useState(null); // { id, state: 'countdown'|'recording'|'working', n }
  const [lastHeard, setLastHeard] = useState(null); // { id, transcript }
  const audio = useRef(null);
  const load = useCallback(async () => {
    try {
      const [m, r] = await Promise.all([(await fetch('/api/phrases/model')).json(), (await fetch('/api/phrases/model/review')).json()]);
      if (m.success) setS(m);
      if (r.success) setReview(r.clips);
    } catch (_) { /* shown as loading */ }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (!s?.training?.running) return undefined; const t = setInterval(load, 3000); return () => clearInterval(t); }, [s?.training?.running, load]);

  // record one phrase through the Box-3: 3-2-1, then speak, then Stop (or it stops itself after 6 s)
  const record = async (p) => {
    setLastHeard(null);
    for (let n = COUNTDOWN; n >= 1; n--) { setRec({ id: p.id, state: 'countdown', n }); await new Promise((r) => setTimeout(r, 1000)); }
    setRec({ id: p.id, state: 'recording', n: 0 });
    try {
      const res = await fetch(`/api/phrases/${p.id}/record-device`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds: MAX_SECONDS }) });
      setRec({ id: p.id, state: 'working', n: 0 });
      const d = await res.json();
      if (!d.success) throw new Error(d.error);
      setLastHeard({ id: p.id, transcript: d.transcript });
      onRecorded?.(d.phrase);
      load();
    } catch (err) { notify(err.message, 'error'); }
    setRec(null);
  };
  const stop = () => { fetch('/api/phrases/record-device/stop', { method: 'POST' }).catch(() => {}); };

  const train = async () => {
    const d = await (await fetch('/api/phrases/model/train', { method: 'POST' })).json();
    if (!d.success) return notify(d.error, 'error');
    notify('Training your wake-word model - about a minute.');
    load();
  };
  const label = async (ids, wake) => {
    const d = await (await fetch('/api/phrases/model/clips/label', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, wake }) })).json();
    if (!d.success) return notify(d.error, 'error');
    setReview((x) => x.filter((c) => !ids.includes(c.id)));
  };
  const play = (url) => {
    try { audio.current?.pause(); audio.current = new Audio(url); audio.current.play().catch((err) => notify(`Couldn't play it: ${err.message}`, 'error')); } catch (err) { notify(`Couldn't play it: ${err.message}`, 'error'); }
  };

  const muted = 'text-slate-500';
  const box = `p-3 rounded-xl border text-xs ${isDark ? 'border-white/10 bg-slate-950/40' : 'border-[#2E2B27]/10 bg-white'}`;
  const btn = `px-2.5 py-1 rounded-lg font-bold border inline-flex items-center gap-1 ${isDark ? 'border-white/10 text-slate-300' : 'border-[#2E2B27]/15'}`;
  const primary = 'px-2.5 py-1 rounded-lg font-bold bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white inline-flex items-center gap-1 disabled:opacity-50';
  const m = s?.model, c = s?.comparison, t = s?.training;
  const target = s?.target || 20;
  const wakePhrases = (s?.phrases || []).filter((p) => p.kind === 'wake');
  const recorded = wakePhrases.reduce((n, p) => n + Math.min(p.recordings, target), 0);
  const ready = wakePhrases.length > 0 && wakePhrases.every((p) => p.recordings >= 10);
  const when = (ms) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const step = (n, title, done) => (
    <div className="flex items-center gap-2 mb-2">
      <span className={`w-5 h-5 rounded-full text-[11px] font-black flex items-center justify-center ${done ? 'bg-emerald-500 text-white' : 'bg-fuchsia-500/20 text-fuchsia-400'}`}>{done ? <Check size={12} /> : n}</span>
      <span className="font-black uppercase tracking-wider text-[10px]">{title}</span>
    </div>
  );

  return (
    <div className={panel}>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <Brain size={15} className="text-fuchsia-400" />
        <h2 className="text-xs font-black uppercase tracking-wider">Your own wake-word model</h2>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30">Watching only - Gemini still wakes Ims</span>
      </div>
      <p className={`text-[11px] ${muted} mb-4`}>
        Right now Gemini turns what you say into words and Ims wakes if the words look like a wake phrase - which is why it keeps mishearing "Hi Ims" as things like "H&M".
        This model learns the <i>sound</i> of you saying each phrase instead. It only watches for now: once it's proved itself against Gemini (step 3), we switch Ims over to it.
      </p>

      {/* 1. record */}
      <div className={`${box} mb-3`}>
        {step(1, `Record each wake phrase - aim for ${target} of each`, ready)}
        <p className={`${muted} mb-2`}>Press Record, wait for 3-2-1, then say the phrase towards the desk unit the way you normally would and press Stop. It records through the Box-3 microphone. Vary it a bit - quickly, slowly, from where you usually sit.</p>
        <div className="flex flex-col gap-2">
          {wakePhrases.map((p) => {
            const mine = rec?.id === p.id;
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-2">
                <span className="w-28 shrink-0 font-bold">"{p.phrase}"</span>
                <div className={`h-1.5 flex-1 min-w-[80px] rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}><div className="h-full bg-fuchsia-500" style={{ width: `${Math.min(100, (p.recordings / target) * 100)}%` }} /></div>
                <span className="tabular-nums w-12 text-right">{p.recordings}/{target}</span>
                {mine && rec.state === 'recording' ? (
                  <button onClick={stop} className="px-2.5 py-1 rounded-lg font-bold bg-rose-500 text-white inline-flex items-center gap-1 animate-pulse"><Square size={11} />Speak now - Stop</button>
                ) : (
                  <button onClick={() => record(p)} disabled={Boolean(rec)} className={primary}>
                    <Mic size={11} />{mine ? (rec.state === 'countdown' ? rec.n : 'Saving...') : 'Record'}
                  </button>
                )}
                {lastHeard?.id === p.id && <span className={`w-full text-[10px] ${muted}`}>Saved. Speech-to-text heard: "{lastHeard.transcript || 'nothing'}" - the model learns from the sound either way.</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. train */}
      <div className={`${box} mb-3`}>
        {step(2, 'Train it', Boolean(m))}
        <p className={`${muted} mb-2`}>
          It learns your voice from your recordings and every time Ims really wakes, and what <i>isn't</i> you from the other speech and room noise the Box-3 picks up ({(s?.clips?.noise || 0) + (s?.clips?.other_speech || 0) + (s?.clips?.no || 0)} clips so far, collected automatically). Train again whenever you've added recordings.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={train} disabled={!s || t?.running || recorded < 5} className={primary}><RotateCw size={11} className={t?.running ? 'animate-spin' : ''} />{t?.running ? 'Training...' : m ? 'Train again' : 'Train it'}</button>
          {recorded < 5 && <span className={muted}>Record at least 5 first.</span>}
          {t?.error && <span className="text-rose-400">{t.error}</span>}
        </div>
        {m && (
          <div className="mt-2">
            Last trained {when(m.trainedAt)}: on recordings it hadn't seen, it recognised <b>{Math.round(m.heldOutRecall * 100)}%</b> of your wake phrases and wrongly woke on <b>{m.heldOutFalseWakes}</b> of {m.heldOutNegatives} other sounds.
          </div>
        )}
      </div>

      {/* 3. compare */}
      <div className={`${box} mb-3`}>
        {step(3, 'See how it compares with Gemini', false)}
        {!m ? <p className={muted}>Once it's trained, every time Ims checks for a wake phrase both get a say and the results show here.</p> : (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mb-1">
              <span><b>{c?.bothWoke ?? 0}</b> both woke</span>
              <span><b>{c?.modelOnly ?? 0}</b> only your model would wake</span>
              <span><b>{c?.geminiOnly ?? 0}</b> only Gemini woke</span>
              <span><b>{c?.bothQuiet ?? 0}</b> both stayed asleep</span>
            </div>
            <p className={muted}>Last 7 days, {c?.checks ?? 0} checks. When it's catching the "Hi Ims" that Gemini misses without waking by mistake, ask Claude to switch Ims over to it.</p>
            {s.recent?.length > 0 && (
              <div className="mt-2 flex flex-col gap-0.5 text-[11px]">
                {s.recent.slice(0, 6).map((r) => (
                  <div key={r.at} className="flex flex-wrap gap-x-2">
                    <span className={`${muted} tabular-nums`}>{when(r.at)}</span>
                    <span className={r.score >= (r.threshold ?? 0.5) ? 'text-emerald-500 font-bold' : muted}>your model {r.score >= (r.threshold ?? 0.5) ? 'would wake' : 'no'}</span>
                    <span>Gemini {/^woke/.test(r.gemini) ? 'woke' : 'no'}{r.heard ? ` ("${r.heard}")` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* clips to check: short things heard that weren't a wake phrase - was it him? */}
      {review.length > 0 && (
        <div className={box}>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-black uppercase tracking-wider text-[10px]">Was this you saying a wake phrase?</span>
            <button onClick={() => label(review.slice(0, 10).map((r) => r.id), false)} className={`${btn} ml-auto`}><X size={11} />None of these were me</button>
          </div>
          <div className={`text-[10px] ${muted} mb-2`}>Short things the Box-3 heard that didn't wake Ims. Play one to check - only answer the ones you're sure of. Optional: it just helps the model learn faster.</div>
          <div className="flex flex-col gap-1.5">
            {review.slice(0, 10).map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2">
                <button onClick={() => play(`/api/phrases/model/clips/${r.id}/audio`)} className={btn}><Play size={11} />Play</button>
                <span className={muted}>{when(r.at)}</span>
                <span className="font-bold">"{r.transcript}"</span>
                <span className="ml-auto flex gap-1.5">
                  <button onClick={() => label([r.id], true)} className={primary}><Check size={11} />Yes, me</button>
                  <button onClick={() => label([r.id], false)} className={btn}><X size={11} />No</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
