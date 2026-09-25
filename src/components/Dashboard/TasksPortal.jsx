import React, { useState, useEffect, useCallback } from 'react';
import { ListChecks, Plus, RotateCw, Trash2, ChevronDown, ChevronRight, ExternalLink, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import PortalShell from './PortalShell';
import Prose from './Prose';

const STATUS = {
  queued: { label: 'Queued', icon: Clock, cls: 'text-slate-500' },
  running: { label: 'Working on it', icon: Loader2, cls: 'text-sky-500', spin: true },
  done: { label: 'Done', icon: CheckCircle2, cls: 'text-emerald-500' },
  failed: { label: 'Failed', icon: XCircle, cls: 'text-red-500' },
};
const when = (t) => (t ? new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

function TaskRow({ task, isDark, onRerun, onDelete }) {
  const [open, setOpen] = useState(false);
  const st = STATUS[task.status] || STATUS.queued;
  const Icon = st.icon;
  const border = isDark ? 'border-white/10' : 'border-[#2E2B27]/10';
  return (
    <div className={`rounded-xl border ${border} ${isDark ? 'bg-slate-950/40' : 'bg-white'}`}>
      <div className="px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs cursor-pointer" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={14} className="opacity-60 shrink-0" /> : <ChevronRight size={14} className="opacity-60 shrink-0" />}
        <span className="font-bold min-w-0 flex-1 basis-48 break-words">{task.title}</span>
        <span className={`flex items-center gap-1 font-semibold shrink-0 ${st.cls}`}><Icon size={13} className={st.spin ? 'animate-spin' : ''} />{st.label}</span>
        <span className="text-[11px] text-slate-500 shrink-0">{when(task.createdAt)}{task.origin === 'desk' ? ' · asked on the desk' : task.origin === 'web' ? ' · asked Ims' : ''}</span>
      </div>
      {task.status === 'done' && task.summary && !open && <p className="px-3 pb-2.5 -mt-1 text-xs text-slate-500">{task.summary}</p>}
      {open && (
        <div className={`px-3 pb-3 pt-2 border-t ${border} text-sm flex flex-col gap-3`}>
          <p className="text-xs text-slate-500"><b>Asked:</b> {task.request}</p>
          {task.status === 'done' && (
            <>
              <p className="font-semibold">{task.summary}</p>
              <Prose text={task.result} className="text-sm leading-relaxed" />
              {task.sources?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {task.sources.map((s) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className={`flex items-center gap-1 px-2 py-0.5 rounded-full border ${border} hover:text-sky-500`}><ExternalLink size={10} />{s.title}</a>
                  ))}
                </div>
              )}
            </>
          )}
          {task.status === 'failed' && <p className="text-xs text-red-500">{task.error}</p>}
          {(task.status === 'queued' || task.status === 'running') && <p className="text-xs text-slate-500">Still working - this usually takes under a minute. The page updates by itself.</p>}
          <div className="flex gap-2">
            {(task.status === 'done' || task.status === 'failed') && (
              <button onClick={() => onRerun(task.id)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border ${border}`}><RotateCw size={12} /> Run again</button>
            )}
            <button onClick={() => onDelete(task)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border ${border} text-red-500`}><Trash2 size={12} /> Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TasksPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [tasks, setTasks] = useState([]);
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [notification, setNotification] = useState(null);
  const notify = (msg, type = 'success') => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3500); };
  const panel = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const gradient = 'from-teal-500 to-cyan-600';

  const load = useCallback(async () => {
    const d = await (await fetch('/api/tasks')).json();
    if (d.success) setTasks(d.tasks);
  }, []);
  useEffect(() => { load(); }, [load]);
  // Refresh while anything is still working.
  useEffect(() => {
    if (!tasks.some((t) => t.status === 'queued' || t.status === 'running')) return undefined;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [tasks, load]);

  const add = async () => {
    setBusy(true);
    try {
      const d = await (await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request }) })).json();
      if (!d.success) throw new Error(d.error);
      setRequest(''); notify(`Started: ${d.task.title}`); load();
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  };
  const rerun = async (id) => { await fetch(`/api/tasks/${id}/rerun`, { method: 'POST' }); load(); };
  const remove = async (task) => { if (!window.confirm(`Delete "${task.title}"?`)) return; await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' }); load(); };

  return (
    <PortalShell title="Tasks" subtitle="/ims/tasks • things Ims is looking into for you"
      icon={ListChecks} gradient={gradient} glow="rgba(20,184,166,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification} maxWidth="max-w-4xl">
      <div className={panel}>
        <h2 className="text-xs font-black uppercase tracking-wider mb-1">New task</h2>
        <p className="text-[11px] text-slate-500 mb-3">Ims researches it in the background (with web search) while you get on. Or just say "Hey IMS, look into ... in the background" and ask him later how it went. Finished tasks also go into your next day report.</p>
        <div className="flex flex-wrap gap-2">
          <textarea rows={2} value={request} onChange={(e) => setRequest(e.target.value)} placeholder="e.g. Find out which of my bands are playing Leeds, Sheffield or Manchester next year"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && request.trim()) { e.preventDefault(); add(); } }}
            className={`flex-1 min-w-[14rem] px-3 py-2 rounded-lg text-sm outline-none border resize-none ${isDark ? 'bg-slate-950/60 border-white/10' : 'bg-white border-[#2E2B27]/10'}`} />
          <button onClick={add} disabled={!request.trim() || busy} className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r ${gradient} text-white disabled:opacity-40 self-start`}>
            {busy ? <RotateCw size={13} className="animate-spin" /> : <Plus size={13} />} Start
          </button>
        </div>
      </div>
      <div className={panel}>
        <h2 className="text-xs font-black uppercase tracking-wider mb-3">Your tasks ({tasks.length})</h2>
        <div className="flex flex-col gap-2">
          {tasks.map((t) => <TaskRow key={t.id} task={t} isDark={isDark} onRerun={rerun} onDelete={remove} />)}
          {!tasks.length && <p className="text-xs text-slate-500">No tasks yet.</p>}
        </div>
      </div>
    </PortalShell>
  );
}
