import React, { useState, useEffect, useCallback } from 'react';
import { Eye, RotateCw, Send, Trash2, MessageSquare, Users } from 'lucide-react';
import PortalShell from './PortalShell';
import CameraPanel from './CameraPanel';
import SnapshotView from './SnapshotView';

export default function LookPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [snapshots, setSnapshots] = useState([]);
  const [selected, setSelected] = useState(null);      // full snapshot detail
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [notification, setNotification] = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification((prev) => (prev?.msg === msg ? null : prev)), 4000);
  }, []);
  const onError = useCallback((m) => showToast(m, 'error'), [showToast]);

  const loadList = useCallback(async () => {
    try {
      const d = await (await fetch('/api/look/snapshots')).json();
      if (d.success) setSnapshots(d.snapshots);
    } catch (_) { /* keep what we have */ }
  }, []);

  const openSnapshot = useCallback(async (id) => {
    try {
      const d = await (await fetch(`/api/look/snapshots/${id}`)).json();
      if (d.success) setSelected(d.snapshot);
    } catch (err) { onError(err.message); }
  }, [onError]);

  useEffect(() => { loadList(); }, [loadList]);

  const onSnapshot = useCallback((snap) => {
    setSelected(snap);
    loadList();
    if (snap.facesError) showToast('Saved, but face detection failed: ' + snap.facesError, 'error');
  }, [loadList, showToast]);

  const ask = async (live) => {
    const q = question.trim();
    if (!q) return;
    setAsking(true);
    try {
      const res = await fetch(live ? '/api/look/ask' : `/api/look/snapshots/${selected.id}/ask`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q })
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Could not get an answer.');
      setSelected(d.snapshot);
      setQuestion('');
      loadList();
    } catch (err) {
      onError(err.message);
    } finally {
      setAsking(false);
    }
  };

  const remove = async () => {
    if (!selected || !window.confirm('Delete this snapshot and its questions?')) return;
    await fetch(`/api/look/snapshots/${selected.id}`, { method: 'DELETE' });
    setSelected(null);
    loadList();
  };

  const panel = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const field = `flex-1 px-3 py-2 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/10 text-slate-900'}`;

  return (
    <PortalShell title="Look" subtitle="/ims/look • what IMS sees, snapshots, and questions about them"
      icon={Eye} gradient="from-cyan-500 to-indigo-600" glow="rgba(56,189,248,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification}>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Live view */}
        <div className={panel}>
          <h2 className="text-xs font-black uppercase tracking-wider mb-3">Live view</h2>
          <CameraPanel isDark={isDark} onSnapshot={onSnapshot} onError={onError} />
          <div className="mt-4">
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Ask about what IMS sees right now</label>
            <div className="flex gap-2">
              <input className={field} value={question} placeholder="e.g. What am I holding?"
                onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ask(true); }} />
              <button onClick={() => ask(true)} disabled={asking || !question.trim()}
                className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-indigo-600 text-white disabled:opacity-40 active:scale-95">
                {asking ? <RotateCw size={13} className="animate-spin" /> : <Send size={13} />}Ask
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Asking snapshots the current view first, so the photo and answer are kept below.</p>
          </div>
        </div>

        {/* Selected snapshot */}
        <div className={panel}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-black uppercase tracking-wider">
              {selected ? `Snapshot #${selected.id}` : 'Snapshot'}
            </h2>
            {selected && (
              <button onClick={remove} className="p-2 rounded-lg text-red-400 hover:bg-red-500/10" title="Delete snapshot"><Trash2 size={14} /></button>
            )}
          </div>
          {!selected ? (
            <p className="text-xs text-slate-500 py-10 text-center">Take a snapshot, or pick one from the gallery below.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <SnapshotView snapshot={selected} />
              <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                <Users size={12} />
                {selected.faces.length === 0 ? 'No faces detected' : selected.faces.map((f) => (f.match ? f.match.name : 'unrecognised face')).join(', ')}
                <span className="opacity-60">&middot; {new Date(selected.createdAt).toLocaleString('en-GB')}</span>
              </div>

              {selected.qa.length > 0 && (
                <div className="flex flex-col gap-2">
                  {selected.qa.map((x) => (
                    <div key={x.id} className={`rounded-xl p-3 text-xs ${isDark ? 'bg-slate-950/50' : 'bg-white border border-[#2E2B27]/10'}`}>
                      <div className="font-bold flex items-start gap-2"><MessageSquare size={12} className="mt-0.5 shrink-0 opacity-60" />{x.question}</div>
                      <div className="mt-1.5 whitespace-pre-wrap leading-relaxed opacity-90">{x.answer}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input className={field} value={question} placeholder="Ask about this photo..."
                  onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ask(false); }} />
                <button onClick={() => ask(false)} disabled={asking || !question.trim()}
                  className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-indigo-600 text-white disabled:opacity-40 active:scale-95">
                  {asking ? <RotateCw size={13} className="animate-spin" /> : <Send size={13} />}Ask
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Gallery */}
      <div className={panel}>
        <h2 className="text-xs font-black uppercase tracking-wider mb-3">Snapshots ({snapshots.length})</h2>
        {snapshots.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No snapshots yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {snapshots.map((s) => (
              <button key={s.id} onClick={() => openSnapshot(s.id)}
                className={`text-left rounded-xl overflow-hidden border transition-all hover:scale-[1.02] ${selected?.id === s.id ? 'border-cyan-400' : isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
                <img src={`/api/look/snapshots/${s.id}/image`} alt="" loading="lazy" className="w-full aspect-[4/3] object-cover bg-black" />
                <div className="p-2 text-[10px]">
                  <div className="font-bold truncate">{s.names.length ? s.names.join(', ') : s.faceCount ? `${s.faceCount} face(s)` : 'No faces'}</div>
                  <div className="opacity-60">{new Date(s.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}{s.qaCount ? ` · ${s.qaCount} Q&A` : ''}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
