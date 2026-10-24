// Wake and Stop Phrases in the IMS design (24 Oct 2026): what wakes Ims and what stops him. The wake listener's live
// state, each phrase as a card (record it on the desk, the spellings it's recognised as, its recordings), your own
// wake-word model in three steps, and clips to check. New phrase is the button in the bottom right. The same
// /api/phrases and /api/wake-daemon requests as before (Dashboard/PhrasesPortal.jsx and WakeModelCard.jsx).
// The model only ever confirms a wake that Gemini also heard; it never wakes Ims on its own (21 Oct rule).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ServicePage, { Empty, Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextField, Segmented, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';

const MAX_SECONDS = 6; // a recording stops itself after this if Stop isn't pressed
const COUNTDOWN = 3;
const when = (ms) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const STATES = {
  STANDBY: ['Standby', 'quiet', 'Listening only for a wake phrase or a tap on the screen. Nothing is streamed.'],
  VERIFYING: ['Checking a wake', 'warn', 'It heard something and is checking whether it was a wake phrase.'],
  CONVERSATION_ACTIVE: ['In a conversation', 'good', 'Follow-ups are heard without the wake phrase until it goes quiet.'],
  CLOSING: ['Closing', 'warn', 'A goodbye or the silence timer ended it; going back to standby.'],
};
const LOG_TONE = { wake_verified: 'good', wake_rejected: 'warn', candidate: '', silence_timeout: 'bad' };

function Listener() {
  const snack = useSnack();
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { const d = await (await fetch('/api/wake-daemon/status')).json(); if (d.success && d.status) setSt(d.status); } catch { /* polled again */ } }, []);
  useEffect(() => { load(); const t = setInterval(load, 2500); return () => clearInterval(t); }, [load]);
  const reset = async () => {
    setBusy(true);
    try { const d = await (await fetch('/api/wake-daemon/reset', { method: 'POST' })).json(); if (!d.success) throw new Error(d.error || 'It couldn\'t be reset.'); setSt(d.status); snack('Back on standby, and the desk microphone stopped.'); } catch (e) { snack(e.message, { error: true }); }
    setBusy(false);
  };
  const [word, tone, desc] = STATES[st?.state] || STATES.STANDBY;
  const left = Math.ceil((st?.silenceRemainingMs || 0) / 1000);
  const up = st?.uptimeSeconds || 0;
  return (
    <section className="imsm-card">
      <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
        <h3><Icon n="mic" size={20} />The wake listener</h3>
        <Btn kind="text" icon="stop" busy={busy} onClick={reset} title="Back to standby at once, and stop the microphone">Back to standby</Btn>
      </div>
      <div className="imsm-stats">
        <div className="imsm-stat"><span className="k"><Icon n="info" size={16} />Now</span><b><span className={`tag ${tone}`} style={{ fontSize: 15, height: 30 }}>{word}</span></b><span className="s">{desc}</span></div>
        <div className="imsm-stat"><span className="k"><Icon n="timer" size={16} />Silence timer</span><b>{st?.state === 'CONVERSATION_ACTIVE' ? `${left} s` : '15 s'}</b><span className="s">{st?.state === 'CONVERSATION_ACTIVE' ? `The conversation ends in ${left} seconds if nothing more is said.` : 'In a conversation, 15 seconds of quiet ends it.'}</span></div>
        <div className="imsm-stat"><span className="k"><Icon n="chat" size={16} />Conversations</span><b>{st?.conversationsCount || 0}</b><span className="s">Last wake: {st?.lastWakePhrase || 'none yet'}. Last ended by: {(st?.lastCloseReason || 'start-up').replace(/_/g, ' ')}. Running {Math.floor(up / 3600)} h {Math.floor((up % 3600) / 60)} min.</span></div>
      </div>
      {st?.recentLogs?.length > 0 && (
        <details className="imsm-fold" style={{ margin: 0 }}>
          <summary><Icon n="list" size={20} /><span>What it's heard lately ({st.recentLogs.length})</span><Icon n="down" size={22} /></summary>
          <ul className="imsm-log">
            {st.recentLogs.map((l) => (
              <li key={l.id}><span className="t">{new Date(l.timestamp).toLocaleTimeString('en-GB')}</span><span className="m">{l.message}</span><span className={`tag ${LOG_TONE[l.type] ?? 'quiet'}`}>{l.type.replace(/_/g, ' ')}</span></li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// record a phrase on the desk unit's own microphone: 3-2-1, speak, Stop (or it stops itself)
function useRecorder(onDone) {
  const snack = useSnack();
  const [rec, setRec] = useState(null); // { id, state: countdown|recording|working, n }
  const record = async (p) => {
    fetch('/api/phrases/session/start', { method: 'POST' }).catch(() => {}); // Ims ignores wake phrases while recording
    for (let n = COUNTDOWN; n >= 1; n--) { setRec({ id: p.id, state: 'countdown', n }); await new Promise((r) => setTimeout(r, 1000)); }
    setRec({ id: p.id, state: 'recording', n: 0 });
    const tick = setInterval(() => setRec((r) => (r && r.state === 'recording' ? { ...r, n: r.n + 1 } : r)), 1000);
    try {
      const res = await fetch(`/api/phrases/${p.id}/record-device`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seconds: MAX_SECONDS }) });
      clearInterval(tick); setRec({ id: p.id, state: 'working', n: 0 });
      const d = await res.json();
      if (!d.success) throw new Error(d.error);
      onDone(p, d);
    } catch (e) { snack(e.message, { error: true }); }
    clearInterval(tick); setRec(null);
  };
  const stop = () => { setRec((r) => (r ? { ...r, state: 'working' } : r)); fetch('/api/phrases/record-device/stop', { method: 'POST' }).catch(() => {}); };
  return { rec, record, stop };
}

function RecordButton({ p, rec, record, stop, label = 'Record on Ims' }) {
  const mine = rec?.id === p.id;
  if (mine && rec.state === 'countdown') return <span className="imsm-rec ready">Get ready… <b>{rec.n}</b></span>;
  if (mine && rec.state === 'recording') return <Btn className="imsm-recnow" icon="stop" onClick={stop} title={`Stops by itself after ${MAX_SECONDS} seconds`}>Speak now · {rec.n} s · Stop</Btn>;
  return <Btn kind="tonal" icon="mic" busy={mine && rec.state === 'working'} disabled={Boolean(rec)} onClick={() => record(p)}>{mine ? 'Saving…' : label}</Btn>;
}

function Phrase({ p, rec, record, stop, last, onChanged, onDelete, play }) {
  const [adding, setAdding] = useState('');
  const snack = useSnack();
  const saveVariants = async (variants) => {
    const d = await (await fetch(`/api/phrases/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variants }) })).json();
    if (d.success) onChanged(d.phrase); else snack(d.error, { error: true });
  };
  const add = () => { const v = adding.trim(); if (v && !p.variants.includes(v.toLowerCase())) saveVariants([...p.variants, v]); setAdding(''); };
  const delRec = async (rid) => { await fetch(`/api/phrases/recordings/${rid}`, { method: 'DELETE' }); onChanged({ ...p, recordings: p.recordings.filter((r) => r.id !== rid) }); };
  return (
    <div className="imsm-phrase">
      <div className="top">
        <span className="q">“{p.phrase}”</span>
        <RecordButton p={p} rec={rec} record={record} stop={stop} />
        <IconButton icon="del" label={`Delete “${p.phrase}”`} onClick={() => onDelete(p)} />
      </div>
      {last && <p className="heard">Heard as <b>“{last.transcript || 'nothing'}”</b>: {last.transcript ? (last.added ? <span className="new">a new spelling, added</span> : 'already known') : 'try again a bit louder or closer'}.</p>}
      <div className="imsm-chips">
        <span className="lbl">Recognised as</span>
        {p.variants.map((v) => <span key={v} className="chip">{v}<button type="button" aria-label={`Remove ${v}`} onClick={() => saveVariants(p.variants.filter((x) => x !== v))}><Icon n="close" size={14} /></button></span>)}
        <input className="addtag" value={adding} placeholder="Add a spelling" aria-label="Add a spelling" onChange={(e) => setAdding(e.target.value)} onBlur={add} onKeyDown={(e) => e.key === 'Enter' && add()} />
      </div>
      {p.recordings.length > 0 && (
        <div className="imsm-chips recs">
          <span className="lbl">Recordings</span>
          {p.recordings.map((r) => (
            <span key={r.id} className="chip rc">
              <button type="button" aria-label="Play it" onClick={() => play(`/api/phrases/recordings/${r.id}/audio`)}><Icon n="play" size={14} /></button>
              “{r.transcript || '…'}”
              <button type="button" aria-label="Delete this recording" onClick={() => delRec(r.id)}><Icon n="close" size={14} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function WakeModel({ play, confirmIt, onRecorded }) {
  const snack = useSnack();
  const [s, setS] = useState(null);
  const [review, setReview] = useState([]);
  const [recs, setRecs] = useState({});
  const [open, setOpen] = useState(null);
  const [session, setSession] = useState(null);
  const [lastHeard, setLastHeard] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => { if (!session?.active) return undefined; const t = setInterval(() => { tick((n) => n + 1); if (Date.now() > session.until) setSession({ active: false }); }, 1000); return () => clearInterval(t); }, [session]);
  const load = useCallback(async () => {
    try {
      const [m, r, ph, ss] = await Promise.all(['/api/phrases/model', '/api/phrases/model/review', '/api/phrases', '/api/phrases/session'].map((u) => fetch(u).then((x) => x.json())));
      if (ss.success) setSession(ss);
      if (m.success) setS(m);
      if (r.success) setReview(r.clips);
      if (ph.success) setRecs(Object.fromEntries(ph.phrases.map((x) => [x.id, x.recordings || []])));
    } catch { /* shown as loading */ }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (!s?.training?.running) return undefined; const t = setInterval(load, 3000); return () => clearInterval(t); }, [s?.training?.running, load]);
  const { rec, record, stop } = useRecorder((p, d) => { setLastHeard({ id: p.id, transcript: d.transcript }); onRecorded?.(d.phrase); load(); });
  const startRec = async (p) => { setLastHeard(null); try { const d = await (await fetch('/api/phrases/session/start', { method: 'POST' })).json(); if (d.success) setSession(d); } catch { /* still records */ } record(p); };
  const endSession = async () => { try { const d = await (await fetch('/api/phrases/session/end', { method: 'POST' })).json(); if (d.success) setSession(d); } catch { /* ends by itself */ } };
  const train = async () => { const d = await (await fetch('/api/phrases/model/train', { method: 'POST' })).json(); if (!d.success) return snack(d.error, { error: true }); snack('Training your wake-word model: about a minute.'); load(); };
  const label = async (ids, wake) => {
    const d = await (await fetch('/api/phrases/model/clips/label', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, wake }) })).json();
    if (!d.success) return snack(d.error, { error: true });
    setReview((x) => x.filter((c) => !ids.includes(c.id)));
  };
  const setLive = async () => {
    const d = await (await fetch('/api/phrases/model/live', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: s.live !== 'model+gemini' }) })).json();
    if (d.success) { snack(d.live ? 'Your model now helps confirm wakes.' : 'Your model is back to watching only.'); load(); }
  };
  const delRec = (pid, rid) => confirmIt({ title: 'Delete this recording?', okLabel: 'Delete', danger: true, onOk: async () => { await fetch(`/api/phrases/recordings/${rid}`, { method: 'DELETE' }); setRecs((a) => ({ ...a, [pid]: (a[pid] || []).filter((x) => x.id !== rid) })); load(); } });

  const m = s?.model, c = s?.comparison, t = s?.training;
  const target = s?.target || 20;
  const wake = (s?.phrases || []).filter((p) => p.kind === 'wake');
  const recorded = wake.reduce((n, p) => n + Math.min(p.recordings, target), 0);
  const ready = wake.length > 0 && wake.every((p) => p.recordings >= 10);
  const live = s?.live === 'model+gemini';
  const Step = ({ n, done, title }) => <h4 className="imsm-steph"><span className={`imsm-step ${done ? 'done' : ''}`}>{done ? <Icon n="check" size={16} /> : n}</span>{title}</h4>;
  const secs = session?.active ? Math.max(0, Math.round((session.until - Date.now()) / 1000)) : 0;

  return (
    <section className="imsm-card">
      <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
        <h3><Icon n="school" size={20} />Your own wake-word model</h3>
        {s?.model && <label className="imsm-row" style={{ cursor: 'pointer' }}><span className="muted">{live ? 'Helping confirm wakes' : 'Watching only'}</span><span className="imsm-switch"><input type="checkbox" checked={live} onChange={setLive} aria-label="Let your model help confirm wakes" /><i /></span></label>}
      </div>
      <p className="muted" style={{ margin: 0 }}>Gemini turns what you say into words, and Ims wakes if they look like a wake phrase, which is why "Hi Ims" can come out as "H&M". This model learns the sound of you saying each phrase instead. It never wakes Ims on its own: it only helps confirm a wake when the whole wake phrase was heard too.</p>
      {session?.active && (
        <div className="imsm-banner info"><Icon n="mic" size={22} /><span><b>Recording session.</b> Ims is ignoring wake phrases so he won't answer you. Back to normal in {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')} (each recording adds 3 minutes).</span><Btn kind="text" onClick={endSession}>End it now</Btn></div>
      )}

      <div className="imsm-sub-card">
        <Step n={1} done={ready} title={`Record each wake phrase, aiming for ${target} of each`} />
        <p className="muted">Press Record, wait for 3, 2, 1, then say the phrase towards the desk the way you normally would and press Stop. It records through the desk's own microphone. Vary it a bit: quickly, slowly, from where you usually sit.</p>
        {!s ? <Spinner /> : wake.map((p) => (
          <div key={p.id} className="imsm-target">
            <div className="row">
              <button type="button" className="nm sl" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}><Icon n={open === p.id ? 'up' : 'down'} size={20} />“{p.phrase}”</button>
              <span className="rbar2"><i style={{ width: `${Math.min(100, (p.recordings / target) * 100)}%` }} /></span>
              <span className="n">{p.recordings}/{target}</span>
              <RecordButton p={p} rec={rec} record={startRec} stop={stop} label="Record" />
            </div>
            {lastHeard?.id === p.id && <p className="muted">Saved. Speech-to-text heard “{lastHeard.transcript || 'nothing'}”; the model learns from the sound either way.</p>}
            {open === p.id && (
              <ul className="list">
                {!(recs[p.id] || []).length && <li className="muted">No recordings yet.</li>}
                {(recs[p.id] || []).map((r, i, all) => (
                  <li key={r.id}>
                    <span className="n">{all.length - i}</span>
                    <IconButton icon="play" label="Play it" onClick={() => play(`/api/phrases/recordings/${r.id}/audio`)} />
                    <span className="muted">{when(r.createdAt)}</span>
                    <span className="tx" title="What speech-to-text wrote down">“{r.transcript || '…'}”</span>
                    <IconButton icon="del" label="Delete this recording" onClick={() => delRec(p.id, r.id)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="imsm-sub-card">
        <Step n={2} done={Boolean(m)} title="Train it" />
        <p className="muted">It learns from two piles of sound. Train it again whenever you've added recordings.</p>
        <div className="imsm-stats">
          <div className="imsm-stat"><span className="k">You saying a wake phrase</span><b>{recorded + (s?.clips?.wake || 0) + (s?.clips?.yes || 0)}</b><span className="s">{recorded} you recorded above{s?.clips?.wake ? `, ${s.clips.wake} real wakes that worked` : ''}{s?.clips?.yes ? `, ${s.clips.yes} you said were you` : ''}.</span></div>
          <div className="imsm-stat"><span className="k">Sounds that aren't</span><b>{(s?.clips?.noise || 0) + (s?.clips?.other_speech || 0) + (s?.clips?.no || 0)}</b><span className="s">Collected when a sound made Ims check but it wasn't you waking him: {s?.clips?.noise || 0} room noise, {s?.clips?.other_speech || 0} other talk{s?.clips?.no ? `, ${s.clips.no} you said weren't you` : ''}. Anything unclear is left out.</span></div>
        </div>
        <div className="imsm-row">
          <Btn icon="school" busy={t?.running} disabled={!s || t?.running || recorded < 5} onClick={train}>{t?.running ? 'Training…' : m ? 'Train it again' : 'Train it'}</Btn>
          {recorded < 5 && <span className="muted">Record at least 5 first.</span>}
          {t?.error && <span className="bad">{t.error}</span>}
        </div>
        {m && <p style={{ margin: 0 }}>Last trained {when(m.trainedAt)}. On recordings it hadn't seen, it recognised <b>{Math.round(m.heldOutRecall * 100)}%</b> of your wake phrases, and wrongly woke on <b>{m.heldOutFalseWakes}</b> of {m.heldOutNegatives} other sounds.</p>}
      </div>

      <div className="imsm-sub-card">
        <Step n={3} title="See how it compares with Gemini" />
        {!m ? <p className="muted">Once it's trained, every time Ims checks for a wake phrase both get a say, and the results show here.</p> : (
          <>
            <div className="imsm-cmp4">
              <span><b>{c?.bothWoke ?? 0}</b>both woke</span>
              <span><b>{c?.modelOnly ?? 0}</b>only your model</span>
              <span><b>{c?.geminiOnly ?? 0}</b>only Gemini</span>
              <span><b>{c?.bothQuiet ?? 0}</b>both stayed asleep</span>
            </div>
            <p className="muted">The last 7 days, {c?.checks ?? 0} checks.</p>
            {s.recent?.length > 0 && (
              <ul className="imsm-log">
                {s.recent.slice(0, 6).map((r) => {
                  const yes = r.score >= (r.threshold ?? 0.5);
                  return <li key={r.at}><span className="t">{when(r.at)}</span><span className="m">Gemini {/^woke/.test(r.gemini) ? 'woke' : 'didn\'t'}{r.heard ? ` (“${r.heard}”)` : ''}</span><span className={`tag ${yes ? 'good' : 'quiet'}`}>model: {yes ? 'wake' : 'no'}</span></li>;
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {review.length > 0 && (
        <div className="imsm-sub-card">
          <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
            <h4 className="imsm-steph" style={{ margin: 0 }}>Was this you saying a wake phrase?</h4>
            <Btn kind="text" icon="close" onClick={() => label(review.slice(0, 10).map((r) => r.id), false)}>None of these were me</Btn>
          </div>
          <p className="muted">Short things the desk heard that didn't wake Ims. Play one to check, and only answer the ones you're sure of. It's optional; it just helps the model learn faster.</p>
          <ul className="list">
            {review.slice(0, 10).map((r) => (
              <li key={r.id}>
                <IconButton icon="play" label="Play it" onClick={() => play(`/api/phrases/model/clips/${r.id}/audio`)} />
                <span className="muted">{when(r.at)}</span>
                <span className="tx"><b>“{r.transcript}”</b></span>
                <Btn kind="tonal" icon="check" onClick={() => label([r.id], true)}>Yes, me</Btn>
                <Btn kind="text" onClick={() => label([r.id], false)}>No</Btn>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Body() {
  const snack = useSnack();
  const [phrases, setPhrases] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [last, setLast] = useState({});
  const [form, setForm] = useState(null); // { kind, phrase }
  const [confirm, setConfirm] = useState(null);
  const audio = useRef(null);
  const play = (url) => { try { audio.current?.pause(); audio.current = new Audio(url); audio.current.play().catch((e) => snack(`It couldn't play: ${e.message}`, { error: true })); } catch (e) { snack(e.message, { error: true }); } };
  const load = useCallback(async () => { try { const d = await (await fetch('/api/phrases')).json(); if (d.success) setPhrases(d.phrases); } catch { setPhrases((p) => p || []); } }, []);
  const loadCand = useCallback(async () => { try { const d = await (await fetch('/api/phrases/candidates')).json(); if (d.success) setCandidates(d.candidates || []); } catch { /* optional */ } }, []);
  useEffect(() => { load(); loadCand(); }, [load, loadCand]);
  const changed = (p, removedId) => setPhrases((all) => (removedId ? all.filter((x) => x.id !== removedId) : all.map((x) => (x.id === p.id ? p : x))));
  const { rec, record, stop } = useRecorder((p, d) => { setLast((l) => ({ ...l, [p.id]: { transcript: d.transcript, added: d.added } })); changed(d.phrase); });
  const add = async () => {
    const d = await (await fetch('/api/phrases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: form.kind, phrase: form.phrase }) })).json();
    if (!d.success) return snack(d.error, { error: true });
    setPhrases((all) => [...all, d.phrase]); setForm(null);
    snack(`Added “${d.phrase.phrase}”. Now record yourself saying it a few times.`);
  };
  const remove = (p) => setConfirm({ title: `Delete “${p.phrase}”?`, body: 'Its spellings and recordings go with it.', okLabel: 'Delete', danger: true, onOk: async () => { await fetch(`/api/phrases/${p.id}`, { method: 'DELETE' }); changed(null, p.id); snack('Deleted.'); } });
  const accept = async (text, phraseId) => {
    const d = await (await fetch('/api/phrases/candidates/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, phraseId }) })).json();
    if (!d.success) return snack(d.error, { error: true });
    changed(d.phrase); setCandidates((c) => c.filter((x) => x.text !== text));
    snack(`“${text}” now wakes Ims as “${d.phrase.phrase}”.`);
  };
  const dismiss = async (text) => { await fetch('/api/phrases/candidates/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }); setCandidates((c) => c.filter((x) => x.text !== text)); };

  const list = (kind, title, help, icon) => {
    const mine = (phrases || []).filter((p) => p.kind === kind);
    return (
      <>
        <h2 className="imsm-h2">{title}</h2>
        <p className="muted" style={{ marginTop: -6 }}>{help}</p>
        {phrases == null ? <div className="imsm-empty"><Spinner /></div> : !mine.length ? <Empty icon={icon} title={`No ${kind} phrases yet`}>Add one with the button in the corner.</Empty> : (
          <div className="imsm-list">{mine.map((p) => <Phrase key={p.id} p={p} rec={rec} record={record} stop={stop} last={last[p.id]} onChanged={changed} onDelete={remove} play={play} />)}</div>
        )}
      </>
    );
  };
  const wakeList = (phrases || []).filter((p) => p.kind === 'wake');

  return (
    <>
      <Listener />
      <details className="imsm-fold">
        <summary><Icon n="info" size={20} /><span>Why record the phrases</span><Icon n="down" size={22} /></summary>
        <div style={{ padding: '0 16px 16px' }}>
          <p>Speech-to-text often writes these short phrases oddly ("Hey IMS" can come out as "HMs"). Press Record on Ims and wait for the 3, 2, 1. When it says Speak now, say the phrase to the desk, then press Stop (it stops by itself after {MAX_SECONDS} seconds). It records with the desk's own microphone, the one it really listens with.</p>
          <p>Do each a few times. IMS runs the recording through the same speech-to-text Ims listens with, and adds any new spelling to the list so he recognises it too. You can change the lists by hand. Speak from where you'd normally talk to Ims, while he's on standby (not mid-conversation).</p>
        </div>
      </details>
      {candidates.length > 0 && (
        <section className="imsm-card">
          <h3><Icon n="bulb" size={20} />Heard just before a missed wake</h3>
          <p className="muted" style={{ margin: 0 }}>Short phrases heard just before Ims didn't answer. If one was you saying a wake phrase, add it as a spelling of that phrase.</p>
          <ul className="imsm-cands">
            {candidates.map((c) => (
              <li key={c.text}>
                <b>“{c.text}”</b>{c.count > 1 && <span className="muted"> ×{c.count}</span>}
                <span className="grow" />
                {wakeList.map((p) => <Btn key={p.id} kind="tonal" onClick={() => accept(c.text, p.id)}>Add to “{p.phrase}”</Btn>)}
                <Btn kind="text" onClick={() => dismiss(c.text)}>Not me</Btn>
              </li>
            ))}
          </ul>
        </section>
      )}
      {list('wake', 'Wake phrases', 'They start a conversation with Ims. Anything else he hears is ignored.', 'mic')}
      <WakeModel play={play} confirmIt={setConfirm} onRecorded={(p) => p && changed(p)} />
      {list('stop', 'Stop phrases', 'They stop Ims straight away: cancel what he\'s doing, silence a ringing alarm or timer, or end a call recording.', 'stop')}

      <Sheet open={Boolean(form)} onClose={() => setForm(null)} title="A new phrase"
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setForm(null)}>Cancel</Btn><Btn icon="add" disabled={!form?.phrase.trim()} onClick={add}>Add it</Btn></div>}>
        {form && (
          <div className="imsm-form">
            <Segmented label="What it does" value={form.kind} onChange={(k) => setForm({ ...form, kind: k })} options={[['wake', 'Wakes Ims'], ['stop', 'Stops Ims']]} />
            <TextField label="The phrase" value={form.phrase} onChange={(v) => setForm({ ...form, phrase: v })} autoFocus placeholder={form.kind === 'wake' ? 'For example: Now then Ims' : 'For example: That will do, Ims'} onKeyDown={(e) => e.key === 'Enter' && form.phrase.trim() && add()} />
          </div>
        )}
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      <Fab label="New phrase" onClick={() => setForm({ kind: 'wake', phrase: '' })} />
    </>
  );
}

export default function Phrases({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Wake and Stop Phrases" icon="mic" accent="pink" theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="What wakes Ims up, and what stops him.">
      <Body />
    </ServicePage>
  );
}
