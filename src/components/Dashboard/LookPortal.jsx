import React, { useState, useEffect, useCallback } from 'react';
import { Eye, RotateCw, Send, Trash2, MessageSquare, Users, Clock, Save } from 'lucide-react';
import PortalShell from './PortalShell';
import CameraPanel from './CameraPanel';
import SnapshotView from './SnapshotView';

// Camera hours: when the camera stays on so Ims can see you come and go (eyes that follow, the sit-down hello).
// Outside these hours it sleeps until it's woken - you ask him to look, tap the camera icon, or open the live
// view - and then it stays on for 10 minutes. Saved on the server (camera_desk_hours) and sent to the Box-3 at once.
const DAY_ROWS = [{ key: 'weekday', label: 'Weekdays', sub: 'Monday to Friday' }, { key: 'weekend', label: 'Weekends', sub: 'Saturday and Sunday' }];

function CameraHours({ isDark, panel, showToast, onError }) {
  const [hours, setHours] = useState(null);
  const [saved, setSaved] = useState(null);
  const [now, setNow] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadNow = useCallback(() => {
    fetch('/api/camera/status').then((r) => r.json()).then((d) => { if (d.success) setNow(d); }).catch(() => {});
  }, []);
  useEffect(() => {
    fetch('/api/camera/hours').then((r) => r.json()).then((d) => { if (d.success) { setHours(d.hours); setSaved(d.hours); } }).catch((err) => onError(err.message));
    loadNow();
    const t = setInterval(loadNow, 30000);
    return () => clearInterval(t);
  }, [loadNow, onError]);

  if (!hours) return null;
  const changed = JSON.stringify(hours) !== JSON.stringify(saved);
  const setRow = (key, patch) => setHours((h) => ({ ...h, [key]: { ...h[key], ...patch } }));
  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/camera/hours', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hours }) });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Could not save the camera hours.');
      setHours(d.hours); setSaved(d.hours);
      showToast('Camera hours saved - the Box-3 has been told.');
      loadNow();
    } catch (err) { onError(err.message); } finally { setSaving(false); }
  };

  const nowText = !now ? '' : now.recording ? 'Off - a call or meeting is being recorded'
    : now.deviceAwakeWanted ? (now.idle ? 'On - nobody at the desk, so taking about one picture a second' : 'On - full speed')
    : 'Asleep - outside camera hours';
  const timeField = `px-2.5 py-1.5 rounded-lg text-xs outline-none border font-mono ${isDark ? 'bg-slate-950/60 border-white/10 text-slate-100 [color-scheme:dark]' : 'bg-white border-[#2E2B27]/10 text-slate-900'}`;

  return (
    <div className={panel}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5"><Clock size={13} /> Camera hours</h2>
          <p className="text-[11px] text-slate-500 mt-1 max-w-2xl">
            When the camera stays on, so Ims can see you come and go - his eyes follow you and he says hello when you sit back down after 5 minutes away.
            Outside these hours it sleeps until you ask him to look, tap the camera icon or open the live view, then stays on for 10 minutes. Everything it sees stays on this PC.
          </p>
        </div>
        {nowText && <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${now?.deviceAwakeWanted ? (isDark ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30' : 'bg-emerald-50 text-emerald-800 border-emerald-300') : (isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-300')}`}>Now: {nowText}</span>}
      </div>
      <div className="flex flex-col gap-2.5">
        {DAY_ROWS.map(({ key, label, sub }) => {
          const row = hours[key];
          return (
            <div key={key} className={`flex items-center gap-3 flex-wrap rounded-xl p-3 ${isDark ? 'bg-slate-950/50' : 'bg-white border border-[#2E2B27]/10'}`}>
              <label className="flex items-center gap-2.5 cursor-pointer min-w-[180px]">
                <input type="checkbox" checked={row.on} onChange={(e) => setRow(key, { on: e.target.checked })} className="w-4 h-4 accent-cyan-500" />
                <span>
                  <span className="text-xs font-bold block">{label}</span>
                  <span className="text-[10px] text-slate-500">{sub}</span>
                </span>
              </label>
              {row.on ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="opacity-70">On from</span>
                  <input type="time" value={row.from} onChange={(e) => setRow(key, { from: e.target.value })} className={timeField} />
                  <span className="opacity-70">until</span>
                  <input type="time" value={row.until} onChange={(e) => setRow(key, { until: e.target.value })} className={timeField} />
                </div>
              ) : (
                <span className="text-xs text-slate-500">Camera only on when woken</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-end mt-3">
        <button onClick={save} disabled={!changed || saving}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all disabled:opacity-40 ${isDark ? 'bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 border-cyan-500/30' : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border-cyan-300'}`}>
          {saving ? <RotateCw size={13} className="animate-spin" /> : <Save size={13} />} Save camera hours
        </button>
      </div>
    </div>
  );
}

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
    try {
      await fetch(`/api/look/snapshots/${selected.id}`, { method: 'DELETE' });
      showToast('Snapshot deleted.');
      setSelected(null);
      loadList();
    } catch (err) { onError(err.message); }
  };

  const removeSingle = async (id, e) => {
    e?.stopPropagation();
    if (!window.confirm('Delete this snapshot?')) return;
    try {
      await fetch(`/api/look/snapshots/${id}`, { method: 'DELETE' });
      if (selected?.id === id) setSelected(null);
      showToast('Snapshot deleted.');
      loadList();
    } catch (err) { onError(err.message); }
  };

  const removeAll = async () => {
    if (!snapshots.length || !window.confirm(`Delete all ${snapshots.length} snapshot(s)?`)) return;
    try {
      const res = await fetch('/api/look/snapshots', { method: 'DELETE' });
      const d = await res.json();
      if (d.success) {
        setSelected(null);
        showToast(`Deleted ${d.count || snapshots.length} snapshot(s).`);
        loadList();
      }
    } catch (err) { onError(err.message); }
  };

  const removeQa = async (qaId) => {
    if (!selected || !window.confirm('Delete this Q&A?')) return;
    try {
      await fetch(`/api/look/snapshots/${selected.id}/qa/${qaId}`, { method: 'DELETE' });
      showToast('Q&A deleted.');
      openSnapshot(selected.id);
      loadList();
    } catch (err) { onError(err.message); }
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
                    <div key={x.id} className={`rounded-xl p-3 text-xs relative group ${isDark ? 'bg-slate-950/50' : 'bg-white border border-[#2E2B27]/10'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold flex items-start gap-2">
                          <MessageSquare size={12} className="mt-0.5 shrink-0 opacity-60" />
                          {x.question}
                        </div>
                        <button
                          onClick={() => removeQa(x.id)}
                          className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors opacity-70 group-hover:opacity-100 shrink-0"
                          title="Delete Q&A"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
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

      {/* Camera hours */}
      <CameraHours isDark={isDark} panel={panel} showToast={showToast} onError={onError} />

      {/* Gallery */}
      <div className={panel}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-black uppercase tracking-wider">Snapshots ({snapshots.length})</h2>
          {snapshots.length > 0 && (
            <button
              onClick={removeAll}
              className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
              title="Delete all snapshots"
            >
              <Trash2 size={12} /> Clear all
            </button>
          )}
        </div>
        {snapshots.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No snapshots yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {snapshots.map((s) => (
              <div key={s.id} className="relative group">
                <button
                  onClick={() => openSnapshot(s.id)}
                  className={`w-full text-left rounded-xl overflow-hidden border transition-all hover:scale-[1.02] ${
                    selected?.id === s.id ? 'border-cyan-400 ring-2 ring-cyan-400/30' : isDark ? 'border-white/10' : 'border-[#2E2B27]/10'
                  }`}
                >
                  <img src={`/api/look/snapshots/${s.id}/image`} alt="" loading="lazy" className="w-full aspect-[4/3] object-cover bg-black" />
                  <div className="p-2 text-[10px]">
                    <div className="font-bold truncate">{s.names.length ? s.names.join(', ') : s.faceCount ? `${s.faceCount} face(s)` : 'No faces'}</div>
                    <div className="opacity-60">{new Date(s.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}{s.qaCount ? ` · ${s.qaCount} Q&A` : ''}</div>
                  </div>
                </button>
                <button
                  onClick={(e) => removeSingle(s.id, e)}
                  className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/70 hover:bg-red-600 text-white/90 hover:text-white transition-all shadow-md opacity-70 group-hover:opacity-100 hover:scale-110 z-10"
                  title="Delete snapshot"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
