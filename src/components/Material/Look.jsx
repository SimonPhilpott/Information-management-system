// Look in the IMS design (24 Oct 2026): what IMS sees through the camera, snapshots with the faces it found, questions
// about them, and the camera hours. Ask about what it sees right now is the button in the bottom right. The same
// /api/look and /api/camera requests as before (Dashboard/LookPortal.jsx).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ServicePage, { Empty, Fab } from './ServicePage';
import CameraView from './CameraView';
import SnapshotView from '../Dashboard/SnapshotView';
import { Icon, IconButton, Btn, Sheet, TextField, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';

const DAY_ROWS = [{ key: 'weekday', label: 'Weekdays', sub: 'Monday to Friday' }, { key: 'weekend', label: 'Weekends', sub: 'Saturday and Sunday' }];
const when = (t) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// when the camera stays on so Ims can see you come and go; outside these hours it sleeps until woken
function CameraHours() {
  const snack = useSnack();
  const [hours, setHours] = useState(null);
  const [saved, setSaved] = useState(null);
  const [now, setNow] = useState(null);
  const [saving, setSaving] = useState(false);
  const loadNow = useCallback(() => { fetch('/api/camera/status').then((r) => r.json()).then((d) => { if (d.success) setNow(d); }).catch(() => {}); }, []);
  useEffect(() => {
    fetch('/api/camera/hours').then((r) => r.json()).then((d) => { if (d.success) { setHours(d.hours); setSaved(d.hours); } }).catch((e) => snack(e.message, { error: true }));
    loadNow();
    const t = setInterval(loadNow, 30000);
    return () => clearInterval(t);
  }, [loadNow, snack]);
  if (!hours) return null;
  const changed = JSON.stringify(hours) !== JSON.stringify(saved);
  const setRow = (key, patch) => setHours((h) => ({ ...h, [key]: { ...h[key], ...patch } }));
  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/camera/hours', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hours }) });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'The camera hours couldn\'t be saved.');
      setHours(d.hours); setSaved(d.hours);
      snack('Camera hours saved, and the desk has been told.');
      loadNow();
    } catch (e) { snack(e.message, { error: true }); }
    setSaving(false);
  };
  const nowText = !now ? '' : now.recording ? 'Off now: a call or meeting is being recorded'
    : now.deviceAwakeWanted ? (now.idle ? 'On now, slowly: nobody at the desk' : 'On now, full speed') : 'Asleep now: outside camera hours';
  return (
    <section className="imsm-card">
      <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
        <h3><Icon n="timer" size={20} />Camera hours</h3>
        {nowText && <span className={`tag ${now?.deviceAwakeWanted ? 'good' : 'quiet'}`}>{nowText}</span>}
      </div>
      <p className="muted" style={{ margin: 0 }}>When the camera stays on, so Ims can see you come and go: his eyes follow you, and he says hello when you sit back down after 5 minutes away. Outside these hours it sleeps until you ask him to look, tap the camera icon or open this page, then stays on for 10 minutes. Everything it sees stays on this PC.</p>
      {DAY_ROWS.map(({ key, label, sub }) => {
        const row = hours[key];
        return (
          <div key={key} className="imsm-hours">
            <label className="imsm-switch"><input type="checkbox" checked={row.on} onChange={(e) => setRow(key, { on: e.target.checked })} aria-label={`${label}: camera hours on or off`} /><i /></label>
            <span className="nm"><b>{label}</b><small>{sub}</small></span>
            {row.on ? (
              <span className="tm">
                <TextField label="On from" type="time" value={row.from} onChange={(v) => setRow(key, { from: v })} />
                <TextField label="Until" type="time" value={row.until} onChange={(v) => setRow(key, { until: v })} />
              </span>
            ) : <span className="muted">Only on when woken</span>}
          </div>
        );
      })}
      <div className="imsm-row end"><Btn icon="check" busy={saving} disabled={!changed || saving} onClick={save}>Save camera hours</Btn></div>
    </section>
  );
}

function Body() {
  const snack = useSnack();
  const [snaps, setSnaps] = useState(null);
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState('');
  const [liveQ, setLiveQ] = useState(null); // the "ask about right now" sheet's question
  const [asking, setAsking] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const selRef = useRef(null);
  const err = useCallback((m) => snack(m, { error: true }), [snack]);

  const loadList = useCallback(async () => {
    try { const d = await (await fetch('/api/look/snapshots')).json(); if (d.success) setSnaps(d.snapshots); } catch { setSnaps((s) => s || []); }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);
  const show = (snap) => { setSel(snap); setTimeout(() => selRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); };
  const open = async (id) => { try { const d = await (await fetch(`/api/look/snapshots/${id}`)).json(); if (d.success) show(d.snapshot); } catch (e) { err(e.message); } };
  const onSnapshot = useCallback((snap) => {
    show(snap); loadList();
    if (snap.facesError) err(`Saved, but finding faces failed: ${snap.facesError}`);
  }, [loadList, err]);

  const ask = async (live, question) => {
    const text = question.trim();
    if (!text) return;
    setAsking(true);
    try {
      const r = await fetch(live ? '/api/look/ask' : `/api/look/snapshots/${sel.id}/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text }) });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'No answer came back.');
      show(d.snapshot);
      if (live) setLiveQ(null); else setQ('');
      loadList();
    } catch (e) { err(e.message); }
    setAsking(false);
  };
  const del = (url, word, after) => fetch(url, { method: 'DELETE' }).then((r) => r.json()).then((d) => { snack(word); after?.(d); loadList(); }).catch((e) => err(e.message));
  const removeSnap = (id) => setConfirm({ title: 'Delete this snapshot?', body: 'Its questions and answers go with it.', okLabel: 'Delete', danger: true, onOk: () => del(`/api/look/snapshots/${id}`, 'Snapshot deleted.', () => { if (sel?.id === id) setSel(null); }) });
  const removeAll = () => setConfirm({ title: `Delete all ${snaps.length} snapshots?`, body: 'Every snapshot, and the questions asked about them.', okLabel: 'Delete them all', danger: true, onOk: () => del('/api/look/snapshots', 'All snapshots deleted.', () => setSel(null)) });
  const removeQa = (qaId) => setConfirm({ title: 'Delete this question and answer?', okLabel: 'Delete', danger: true, onOk: () => del(`/api/look/snapshots/${sel.id}/qa/${qaId}`, 'Deleted.', () => open(sel.id)) });

  return (
    <>
      <div className="imsm-two">
        <section className="imsm-card">
          <h3><Icon n="video" size={20} />Live view</h3>
          <CameraView onSnapshot={onSnapshot} onError={err} />
        </section>
        <section className="imsm-card" ref={selRef}>
          <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
            <h3><Icon n="image" size={20} />{sel ? `Snapshot ${sel.id}` : 'Snapshot'}</h3>
            {sel && <IconButton icon="del" label="Delete this snapshot" onClick={() => removeSnap(sel.id)} />}
          </div>
          {!sel ? <Empty icon="camera" title="No snapshot open">Take one from the live view, or pick one below.</Empty> : (
            <>
              <SnapshotView snapshot={sel} />
              <div className="imsm-row">
                <span className="tag quiet"><Icon n="people" size={16} />{sel.faces.length ? sel.faces.map((f) => (f.match ? f.match.name : 'Someone not recognised')).join(', ') : 'No faces'}</span>
                <span className="muted">{when(sel.createdAt)}</span>
              </div>
              {sel.qa.map((x) => (
                <div key={x.id} className="imsm-qa">
                  <div className="q"><Icon n="chat" size={18} /><b>{x.question}</b><IconButton icon="del" label="Delete this question" onClick={() => removeQa(x.id)} /></div>
                  <p>{x.answer}</p>
                </div>
              ))}
              <div className="imsm-ask">
                <TextField label="Ask about this photo" value={q} onChange={setQ} onKeyDown={(e) => { if (e.key === 'Enter') ask(false, q); }} />
                <Btn icon="send" busy={asking} disabled={asking || !q.trim()} onClick={() => ask(false, q)}>Ask</Btn>
              </div>
            </>
          )}
        </section>
      </div>

      <CameraHours />

      <div className="imsm-row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <h2 className="imsm-h2" style={{ margin: 0 }}>Snapshots{snaps ? ` (${snaps.length})` : ''}</h2>
        {snaps?.length > 0 && <Btn kind="text" icon="del" onClick={removeAll}>Delete them all</Btn>}
      </div>
      {snaps == null ? <div className="imsm-empty"><Spinner /></div> : !snaps.length ? <Empty icon="image" title="No snapshots yet" /> : (
        <div className="imsm-shots">
          {snaps.map((s) => (
            <div key={s.id} className={`shot ${sel?.id === s.id ? 'on' : ''}`}>
              <button type="button" className="sl" onClick={() => open(s.id)}>
                <img src={`/api/look/snapshots/${s.id}/image`} alt="" loading="lazy" />
                <span className="cap"><b>{s.names.length ? s.names.join(', ') : s.faceCount ? `${s.faceCount} face${s.faceCount === 1 ? '' : 's'}` : 'No faces'}</b><small>{when(s.createdAt)}{s.qaCount ? ` · ${s.qaCount} question${s.qaCount === 1 ? '' : 's'}` : ''}</small></span>
              </button>
              <IconButton icon="del" label="Delete this snapshot" onClick={() => removeSnap(s.id)} />
            </div>
          ))}
        </div>
      )}

      <Sheet open={liveQ != null} onClose={() => !asking && setLiveQ(null)} title="Ask about what IMS sees now"
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setLiveQ(null)}>Cancel</Btn><Btn icon="send" busy={asking} disabled={asking || !liveQ?.trim()} onClick={() => ask(true, liveQ)}>Ask</Btn></div>}>
        <div className="imsm-form">
          <TextField label="Your question" value={liveQ || ''} onChange={setLiveQ} autoFocus placeholder="For example: what am I holding?" onKeyDown={(e) => { if (e.key === 'Enter') ask(true, liveQ || ''); }} />
          <p className="muted" style={{ margin: 0 }}>It takes a snapshot first, so the photo and the answer are kept.</p>
        </div>
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      <Fab label="Ask about now" icon="chat" onClick={() => setLiveQ('')} />
    </>
  );
}

export default function Look({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Look" icon="eye" accent="sky" wide theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="What IMS sees through the camera, and your questions about it.">
      <Body />
    </ServicePage>
  );
}
