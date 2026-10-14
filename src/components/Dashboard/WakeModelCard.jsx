import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Brain, RotateCw, Play, Check, X, Mic } from 'lucide-react';

// Simon's own wake-word model on /ims/phrases: trained on his voice through the Box-3 microphone, and watching
// every wake check in SHADOW MODE beside the live Gemini check - it never wakes Ims by itself until it's
// switched over (a separate step, once the comparison here shows it's better).
const LABELS = { wake: 'real wakes', yes: 'you said were you', other_speech: 'other speech', noise: 'room noise', no: 'you said weren\'t you', unsure: 'to check' };

export default function WakeModelCard({ isDark, notify, panel }) {
  const [s, setS] = useState(null);
  const [review, setReview] = useState([]);
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

  const train = async () => {
    const d = await (await fetch('/api/phrases/model/train', { method: 'POST' })).json();
    if (!d.success) return notify(d.error, 'error');
    notify('Training your wake-word model - about a minute.');
    load();
  };
  const label = async (id, wake) => {
    const d = await (await fetch(`/api/phrases/model/clips/${id}/label`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wake }) })).json();
    if (!d.success) return notify(d.error, 'error');
    setReview((x) => x.filter((c) => c.id !== id));
  };
  const play = (id) => { try { audio.current?.pause(); audio.current = new Audio(`/api/phrases/model/clips/${id}/audio`); audio.current.play(); } catch (_) { /* no audio */ } };

  const muted = 'text-slate-500';
  const box = `p-2.5 rounded-xl border text-xs ${isDark ? 'border-white/10 bg-slate-950/40' : 'border-[#2E2B27]/10 bg-white'}`;
  const btn = `px-2.5 py-1 rounded-lg font-bold border inline-flex items-center gap-1 ${isDark ? 'border-white/10 text-slate-300' : 'border-[#2E2B27]/15'}`;
  const m = s?.model, c = s?.comparison, t = s?.training;
  const wakePhrases = (s?.phrases || []).filter((p) => p.kind === 'wake');
  const clips = s?.clips || {};
  const positives = wakePhrases.reduce((n, p) => n + p.recordings, 0) + (clips.wake || 0) + (clips.yes || 0);
  const negatives = (clips.other_speech || 0) + (clips.noise || 0) + (clips.no || 0);
  const when = (ms) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className={panel}>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <Brain size={15} className="text-fuchsia-400" />
        <h2 className="text-xs font-black uppercase tracking-wider">Your own wake-word model</h2>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30">Watching only - Gemini still wakes Ims</span>
        <button onClick={train} disabled={!s || t?.running} className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white disabled:opacity-50 inline-flex items-center gap-1.5">
          <RotateCw size={12} className={t?.running ? 'animate-spin' : ''} />{t?.running ? 'Training...' : m ? 'Train again' : 'Train it'}
        </button>
      </div>
      <p className={`text-[11px] ${muted} mb-3`}>
        Trained on your voice through the Box-3 microphone, so it listens for how you say the phrase rather than how speech-to-text spells it.
        It scores every wake check alongside Gemini and the two are compared below. Nothing changes how Ims wakes until you decide to switch over.
      </p>

      {/* what it learns from */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        <div className={box}>
          <div className="font-black uppercase tracking-wider text-[10px] mb-1.5 flex items-center gap-1"><Mic size={11} /> Your recordings (Box-3 mic)</div>
          {wakePhrases.map((p) => (
            <div key={p.id} className="flex items-center gap-2 mb-1">
              <span className="w-24 shrink-0 font-bold">{p.phrase}</span>
              <div className={`h-1.5 flex-1 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}><div className="h-full bg-fuchsia-500" style={{ width: `${Math.min(100, (p.recordings / (s?.target || 20)) * 100)}%` }} /></div>
              <span className="tabular-nums w-12 text-right">{p.recordings}/{s?.target || 20}</span>
            </div>
          ))}
          <div className={`text-[10px] ${muted} mt-1`}>Record more with the Record buttons above - aim for {s?.target || 20} of each, said different ways and from where you usually sit.</div>
        </div>
        <div className={box}>
          <div className="font-black uppercase tracking-wider text-[10px] mb-1.5">Collected from wake checks</div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {Object.entries(LABELS).map(([k, v]) => <span key={k}><b className="tabular-nums">{clips[k] || 0}</b> {v}</span>)}
          </div>
          <div className={`text-[10px] ${muted} mt-1.5`}>Every sound that makes Ims check for a wake phrase is kept: real wakes teach it your voice, other speech and noise teach it what isn't you.</div>
          <div className="mt-1.5">Training uses <b>{positives}</b> of you and <b>{negatives}</b> of everything else.</div>
        </div>
      </div>

      {/* the trained model */}
      {t?.error && <div className="text-xs text-rose-400 mb-2">Training: {t.error}</div>}
      {m && (
        <div className={`${box} mb-3`}>
          <div className="font-black uppercase tracking-wider text-[10px] mb-1">Last trained {when(m.trainedAt)}</div>
          On recordings it hadn't seen, it recognised <b>{Math.round(m.heldOutRecall * 100)}%</b> of your wake phrases and wrongly woke on <b>{m.heldOutFalseWakes}</b> of {m.heldOutNegatives} other clips
          (from {m.positives} of you and {m.negatives} others).
        </div>
      )}

      {/* the comparison with Gemini */}
      {m && c && (
        <div className={`${box} mb-3`}>
          <div className="font-black uppercase tracking-wider text-[10px] mb-1">Against Gemini, last 7 days ({c.checks} wake checks)</div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            <span><b>{c.bothWoke}</b> both woke</span>
            <span><b>{c.modelOnly}</b> only your model would wake</span>
            <span><b>{c.geminiOnly}</b> only Gemini woke</span>
            <span><b>{c.bothQuiet}</b> both stayed asleep</span>
          </div>
          {(c.modelMissedRealWake > 0 || c.modelFalseWake > 0) && <div className="mt-1 text-amber-500">Your model missed {c.modelMissedRealWake} real wake{c.modelMissedRealWake === 1 ? '' : 's'} and would have woken by mistake {c.modelFalseWake} time{c.modelFalseWake === 1 ? '' : 's'}.</div>}
          {s.recent?.length > 0 && (
            <div className="mt-2 flex flex-col gap-0.5 text-[11px]">
              {s.recent.slice(0, 8).map((r) => (
                <div key={r.at} className="flex flex-wrap gap-x-2">
                  <span className={`${muted} tabular-nums`}>{when(r.at)}</span>
                  <span className={r.score >= (r.threshold ?? 0.5) ? 'text-emerald-500 font-bold' : muted}>model {r.score.toFixed(2)}</span>
                  <span>Gemini: {/^woke/.test(r.gemini) ? 'woke' : 'no'}{r.heard ? ` ("${r.heard}")` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* clips to check: was that you saying a wake phrase? */}
      {review.length > 0 && (
        <div>
          <div className="font-black uppercase tracking-wider text-[10px] mb-1">Was this you saying a wake phrase?</div>
          <div className={`text-[10px] ${muted} mb-1.5`}>Short sounds that made Ims check but weren't clear either way. Each answer teaches the model.</div>
          <div className="flex flex-col gap-1.5">
            {review.slice(0, 10).map((r) => (
              <div key={r.id} className={`${box} flex flex-wrap items-center gap-2`}>
                <button onClick={() => play(r.id)} className={btn}><Play size={11} />Play</button>
                <span className={muted}>{when(r.at)}</span>
                <span className="font-bold">{r.transcript ? `"${r.transcript}"` : 'nothing written down'}</span>
                <span className="ml-auto flex gap-1.5">
                  <button onClick={() => label(r.id, true)} className="px-2.5 py-1 rounded-lg font-bold bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white inline-flex items-center gap-1"><Check size={11} />Yes, me</button>
                  <button onClick={() => label(r.id, false)} className={btn}><X size={11} />No</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
