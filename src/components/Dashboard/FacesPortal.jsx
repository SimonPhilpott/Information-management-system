import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ScanFace, Save, Trash2, Pencil, X, UserPlus, ShieldCheck } from 'lucide-react';
import PortalShell from './PortalShell';
import CameraPanel from './CameraPanel';
import SnapshotView from './SnapshotView';

export default function FacesPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [people, setPeople] = useState([]);
  const [captured, setCaptured] = useState(null);
  const [faceIdx, setFaceIdx] = useState(0);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // { id, name, notes }
  const [notification, setNotification] = useState(null);
  const capturedIdRef = useRef(null);

  const showToast = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification((prev) => (prev?.msg === msg ? null : prev)), 4000);
  }, []);
  const onError = useCallback((m) => showToast(m, 'error'), [showToast]);

  const loadPeople = useCallback(async () => {
    try {
      const d = await (await fetch('/api/people')).json();
      if (d.success) setPeople(d.people);
    } catch (_) { /* keep what we have */ }
  }, []);
  useEffect(() => { loadPeople(); }, [loadPeople]);

  // The capture photo is only a means to enrol a face - it isn't kept: it's
  // deleted when replaced, discarded, or when leaving the page.
  const dropCaptured = useCallback(() => {
    if (capturedIdRef.current) {
      fetch(`/api/look/snapshots/${capturedIdRef.current}`, { method: 'DELETE', keepalive: true }).catch(() => {});
      capturedIdRef.current = null;
    }
  }, []);
  useEffect(() => dropCaptured, [dropCaptured]);

  const onSnapshot = useCallback((snap) => {
    dropCaptured();
    capturedIdRef.current = snap.id;
    setCaptured(snap);
    setFaceIdx(0);
    const known = snap.faces[0]?.match;
    setName(known ? known.name : '');
    setNotes('');
    if (snap.facesError) showToast('Face detection failed: ' + snap.facesError, 'error');
    else if (snap.faces.length === 0) showToast('No face found - try again facing the camera.', 'error');
  }, [dropCaptured, showToast]);

  const discard = () => { dropCaptured(); setCaptured(null); };

  const existing = people.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());

  const enrol = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/people/enrol', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId: captured.id, faceIndex: faceIdx, name, notes: notes || undefined, personId: existing?.id })
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Could not save the face.');
      showToast(existing ? `Added another photo of ${name.trim()}.` : `${name.trim()} added.`);
      loadPeople();
      // Refresh the capture so the enrolled face now shows as recognised.
      const s = await (await fetch(`/api/look/snapshots/${captured.id}`)).json();
      if (s.success) setCaptured(s.snapshot);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const savePerson = async () => {
    try {
      const res = await fetch(`/api/people/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editing.name, notes: editing.notes })
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Could not save.');
      setEditing(null);
      loadPeople();
    } catch (err) { onError(err.message); }
  };

  const removePerson = async (p) => {
    if (!window.confirm(`Delete ${p.name} and all ${p.samples} saved face sample(s)?`)) return;
    await fetch(`/api/people/${p.id}`, { method: 'DELETE' });
    loadPeople();
  };

  const panel = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const field = `w-full px-3 py-2 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/10 text-slate-900'}`;

  return (
    <PortalShell title="Faces" subtitle="/ims/faces • teach IMS who people are"
      icon={ScanFace} gradient="from-violet-500 to-purple-600" glow="rgba(139,92,246,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification}>

      <div className={`p-3 rounded-xl border flex items-start gap-3 text-[11px] leading-relaxed ${isDark ? 'bg-slate-900/40 border-white/5 text-slate-400' : 'bg-white/70 border-[#2E2B27]/10 text-slate-600'}`}>
        <ShieldCheck size={15} className="shrink-0 mt-0.5 text-emerald-500" />
        <span>
          Face recognition runs entirely on this computer (OpenCV models) - nothing is sent to any cloud service to recognise someone.
          Each saved sample is a set of numbers plus a small face crop. The photo you capture here is discarded when you leave.
          More samples per person (different angles and lighting) makes recognition more reliable.
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className={panel}>
          <h2 className="text-xs font-black uppercase tracking-wider mb-3">1. Capture a face</h2>
          <CameraPanel isDark={isDark} onSnapshot={onSnapshot} onError={onError} snapshotLabel="Capture" />
        </div>

        <div className={panel}>
          <h2 className="text-xs font-black uppercase tracking-wider mb-3">2. Name it</h2>
          {!captured ? (
            <p className="text-xs text-slate-500 py-10 text-center">Capture a photo first.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <SnapshotView snapshot={captured} selectedFace={captured.faces.length > 1 ? faceIdx : null}
                onSelectFace={(i) => {
                  setFaceIdx(i);
                  const m = captured.faces[i]?.match;
                  if (m) setName(m.name);
                }} />
              {captured.faces.length > 1 && <p className="text-[11px] text-slate-500">Several faces found - click the one to save.</p>}
              {captured.faces.length > 0 && (
                <>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Name</label>
                    <input className={field} value={name} list="people-names" placeholder="Who is this?" onChange={(e) => setName(e.target.value)} />
                    <datalist id="people-names">{people.map((p) => <option key={p.id} value={p.name} />)}</datalist>
                    {existing && <p className="text-[10px] text-emerald-500 mt-1">Already known - this will add another sample for {existing.name}.</p>}
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Notes (optional)</label>
                    <textarea className={`${field} min-h-[60px]`} value={notes} placeholder="Anything IMS should know about them"
                      onChange={(e) => setNotes(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={enrol} disabled={saving || !name.trim()}
                      className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white disabled:opacity-40 active:scale-95">
                      <Save size={14} />{existing ? 'Add sample' : 'Save face'}
                    </button>
                    <button onClick={discard} className={`px-3 py-2.5 rounded-xl text-xs font-bold ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}>Discard photo</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={panel}>
        <h2 className="text-xs font-black uppercase tracking-wider mb-3 flex items-center gap-2"><UserPlus size={14} className="opacity-60" />People IMS knows ({people.length})</h2>
        {people.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">Nobody yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {people.map((p) => (
              <div key={p.id} className={`rounded-xl border p-3 flex gap-3 ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
                {p.thumbSampleId
                  ? <img src={`/api/people/sample/${p.thumbSampleId}/thumb`} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                  : <div className="w-16 h-16 rounded-lg bg-slate-700 shrink-0" />}
                <div className="min-w-0 flex-1 text-xs">
                  {editing?.id === p.id ? (
                    <div className="flex flex-col gap-2">
                      <input className={field} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                      <textarea className={`${field} min-h-[50px]`} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
                      <div className="flex gap-2">
                        <button onClick={savePerson} className="px-2 py-1 rounded-lg bg-emerald-500 text-white font-bold flex items-center gap-1"><Save size={11} />Save</button>
                        <button onClick={() => setEditing(null)} className="px-2 py-1 rounded-lg bg-black/10"><X size={11} /></button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="font-bold text-sm truncate">{p.name}</div>
                      <div className="text-[10px] text-slate-500">{p.samples} sample{p.samples === 1 ? '' : 's'}</div>
                      {p.notes && <div className="mt-1 opacity-80 whitespace-pre-wrap">{p.notes}</div>}
                      <div className="mt-2 flex gap-1">
                        <button onClick={() => setEditing({ id: p.id, name: p.name, notes: p.notes })} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`} title="Edit"><Pencil size={13} /></button>
                        <button onClick={() => removePerson(p)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10" title="Delete"><Trash2 size={13} /></button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
