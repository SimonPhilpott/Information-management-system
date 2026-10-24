// Faces in the IMS design (24 Oct 2026): teach IMS who people are. Capture a face from the camera, name it, and manage
// the people it knows and their face samples. Capture is the main step, so the button in the bottom right takes you to
// the camera. The same /api/people and /api/look requests as before (Dashboard/FacesPortal.jsx); the captured photo
// is only a means to save a face and is deleted when replaced, discarded or when you leave the page.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ServicePage, { Empty, Fab } from './ServicePage';
import CameraView from './CameraView';
import SnapshotView from '../Dashboard/SnapshotView';
import { Icon, IconButton, Btn, Sheet, TextField, TextArea, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';

function Body() {
  const snack = useSnack();
  const [people, setPeople] = useState(null);
  const [captured, setCaptured] = useState(null);
  const [faceIdx, setFaceIdx] = useState(0);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // { id, name, notes }
  const [samplesOf, setSamplesOf] = useState(null); // the person whose samples are open
  const [samples, setSamples] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const capturedId = useRef(null);
  const camRef = useRef(null);
  const nameRef = useRef(null);
  const err = useCallback((m) => snack(m, { error: true }), [snack]);

  const loadPeople = useCallback(async () => {
    try { const d = await (await fetch('/api/people')).json(); if (d.success) setPeople(d.people); } catch { setPeople((p) => p || []); }
  }, []);
  useEffect(() => { loadPeople(); }, [loadPeople]);

  const dropCaptured = useCallback(() => {
    if (capturedId.current) { fetch(`/api/look/snapshots/${capturedId.current}`, { method: 'DELETE', keepalive: true }).catch(() => {}); capturedId.current = null; }
  }, []);
  useEffect(() => dropCaptured, [dropCaptured]);
  const onSnapshot = useCallback((snap) => {
    dropCaptured();
    capturedId.current = snap.id;
    setCaptured(snap); setFaceIdx(0);
    setName(snap.faces[0]?.match?.name || ''); setNotes('');
    if (snap.facesError) err(`Finding faces failed: ${snap.facesError}`);
    else if (!snap.faces.length) err('No face found. Try again facing the camera.');
    setTimeout(() => nameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }, [dropCaptured, err]);
  const discard = () => { dropCaptured(); setCaptured(null); };

  const existing = (people || []).find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
  const enrol = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/people/enrol', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshotId: captured.id, faceIndex: faceIdx, name, notes: notes || undefined, personId: existing?.id }) });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'The face couldn\'t be saved.');
      snack(existing ? `Another photo of ${name.trim()} saved.` : `${name.trim()} added.`);
      loadPeople();
      const s = await (await fetch(`/api/look/snapshots/${captured.id}`)).json();
      if (s.success) setCaptured(s.snapshot);
    } catch (e) { err(e.message); }
    setSaving(false);
  };
  const savePerson = async () => {
    try {
      const r = await fetch(`/api/people/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editing.name, notes: editing.notes }) });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'It couldn\'t be saved.');
      snack('Saved.'); setEditing(null); loadPeople();
    } catch (e) { err(e.message); }
  };
  const openSamples = async (p) => {
    setSamplesOf(p); setSamples(null);
    try { const d = await (await fetch(`/api/people/${p.id}/samples`)).json(); setSamples(d.success ? d.samples : []); } catch { setSamples([]); }
  };
  const del = (url, word, after) => fetch(url, { method: 'DELETE' }).then((r) => r.json()).then((d) => { if (d.success === false) throw new Error(d.error || 'It couldn\'t be deleted.'); snack(word); after?.(); loadPeople(); }).catch((e) => err(e.message));
  const removePerson = (p) => setConfirm({ title: `Delete ${p.name}?`, body: `With all ${p.samples} saved face sample${p.samples === 1 ? '' : 's'}. IMS won't recognise them any more.`, okLabel: 'Delete', danger: true, onOk: () => del(`/api/people/${p.id}`, `${p.name} deleted.`, () => { if (samplesOf?.id === p.id) setSamplesOf(null); }) });
  const removeAll = () => setConfirm({ title: `Delete all ${people.length} people?`, body: 'Every face IMS has learned goes.', okLabel: 'Delete them all', danger: true, onOk: () => del('/api/people', 'Every saved face deleted.', () => setSamplesOf(null)) });
  const removeSample = (s) => setConfirm({ title: 'Delete this face sample?', okLabel: 'Delete', danger: true, onOk: () => del(`/api/people/sample/${s.id}`, 'Sample deleted.', () => openSamples(samplesOf)) });

  return (
    <>
      <div className="imsm-banner info"><Icon n="shield" size={22} /><span>Face recognition runs only on this computer; nothing is sent to a cloud service to recognise someone. Each saved sample is a set of numbers and a small face crop, and the photo you capture here is thrown away when you leave. More samples per person (different angles and light) makes recognising them more reliable.</span></div>
      <div className="imsm-two">
        <section className="imsm-card" ref={camRef}>
          <h3><span className="imsm-step">1</span>Capture a face</h3>
          <CameraView onSnapshot={onSnapshot} onError={err} snapshotLabel="Capture" snapshotIcon="face" />
        </section>
        <section className="imsm-card" ref={nameRef}>
          <h3><span className="imsm-step">2</span>Name it</h3>
          {!captured ? <Empty icon="face" title="Capture a photo first">Whoever's in it can then be named here.</Empty> : (
            <>
              <SnapshotView snapshot={captured} selectedFace={captured.faces.length > 1 ? faceIdx : null}
                onSelectFace={(i) => { setFaceIdx(i); const m = captured.faces[i]?.match; if (m) setName(m.name); }} />
              {captured.faces.length > 1 && <p className="muted" style={{ margin: 0 }}>Several faces found: tap the one to save.</p>}
              {captured.faces.length > 0 && (
                <div className="imsm-form">
                  <TextField label="Name" value={name} onChange={setName} list="people-names" help={existing ? `Already known: this adds another sample for ${existing.name}.` : undefined} />
                  <datalist id="people-names">{(people || []).map((p) => <option key={p.id} value={p.name} />)}</datalist>
                  <TextArea label="Notes (optional)" rows={2} value={notes} onChange={setNotes} placeholder="Anything IMS should know about them" />
                </div>
              )}
              <div className="imsm-row">
                {captured.faces.length > 0 && <Btn icon="check" busy={saving} disabled={saving || !name.trim()} onClick={enrol}>{existing ? 'Add this sample' : 'Save this face'}</Btn>}
                <Btn kind="text" icon="del" onClick={discard}>Throw the photo away</Btn>
              </div>
            </>
          )}
        </section>
      </div>

      <div className="imsm-row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <h2 className="imsm-h2" style={{ margin: 0 }}>People IMS knows{people ? ` (${people.length})` : ''}</h2>
        {people?.length > 0 && <Btn kind="text" icon="del" onClick={removeAll}>Delete them all</Btn>}
      </div>
      {people == null ? <div className="imsm-empty"><Spinner /></div> : !people.length ? <Empty icon="people" title="Nobody yet">Capture a face above and give it a name.</Empty> : (
        <div className="imsm-people">
          {people.map((p) => (
            <div key={p.id} className="imsm-person">
              {p.thumbSampleId ? <img src={`/api/people/sample/${p.thumbSampleId}/thumb`} alt="" /> : <span className="noimg"><Icon n="person" size={30} /></span>}
              <span className="txt">
                <b>{p.name}</b>
                <small>{p.samples} sample{p.samples === 1 ? '' : 's'}</small>
                {p.notes && <span className="nt">{p.notes}</span>}
              </span>
              <span className="acts">
                {p.samples > 0 && <IconButton icon="face" label={`${p.name}'s face samples`} onClick={() => openSamples(p)} />}
                <IconButton icon="edit" label={`Change ${p.name}`} onClick={() => setEditing({ id: p.id, name: p.name, notes: p.notes || '' })} />
                <IconButton icon="del" label={`Delete ${p.name}`} onClick={() => removePerson(p)} />
              </span>
            </div>
          ))}
        </div>
      )}

      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title="Change this person"
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setEditing(null)}>Cancel</Btn><Btn icon="check" disabled={!editing?.name.trim()} onClick={savePerson}>Save</Btn></div>}>
        {editing && (
          <div className="imsm-form">
            <TextField label="Name" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} autoFocus />
            <TextArea label="Notes" rows={3} value={editing.notes} onChange={(v) => setEditing({ ...editing, notes: v })} />
          </div>
        )}
      </Sheet>
      <Sheet open={Boolean(samplesOf)} onClose={() => setSamplesOf(null)} title={samplesOf ? `${samplesOf.name}'s face samples` : ''}>
        {samples == null ? <div className="imsm-empty"><Spinner /></div> : !samples.length ? <p className="muted">No samples.</p> : (
          <div className="imsm-samples">
            {samples.map((s) => (
              <div key={s.id} className="smp">
                <img src={`/api/people/sample/${s.id}/thumb`} alt="" />
                <IconButton icon="del" label="Delete this sample" onClick={() => removeSample(s)} />
              </div>
            ))}
          </div>
        )}
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      <Fab label="Capture a face" icon="face" onClick={() => camRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
    </>
  );
}

export default function Faces({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Faces" icon="face" accent="violet" wide theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="Teach IMS who people are, so he knows who's at the desk.">
      <Body />
    </ServicePage>
  );
}
