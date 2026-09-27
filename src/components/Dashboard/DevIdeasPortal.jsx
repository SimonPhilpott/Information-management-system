import React, { useCallback, useEffect, useState } from 'react';
import { Lightbulb, Pencil, Plus, AlertTriangle, Trash2, Mic, Monitor, Terminal, Check, X, RotateCcw, Save } from 'lucide-react';
import PortalShell from './PortalShell';

// Dev ideas (/ims/devideas): ideas for improving IMS, said to Ims ("Ims, dev idea: ...") or typed
// here, waiting to be picked up in Claude Code with /ideas.
const STATUS = {
  new: { label: 'New', cls: 'bg-violet-500/15 text-violet-500' },
  picked_up: { label: 'Picked up', cls: 'bg-sky-500/15 text-sky-500' },
  done: { label: 'Done', cls: 'bg-emerald-500/15 text-emerald-500' },
  dismissed: { label: 'Dismissed', cls: 'bg-slate-500/15 text-slate-500' },
};
const SOURCE = { desk: [Mic, 'Said to Ims on the desk'], web: [Mic, 'Said to Ims in the app'], page: [Monitor, 'Typed here'], claude: [Terminal, 'Added from Claude Code'], auto: [AlertTriangle, 'Flagged automatically when something failed'] };

export default function DevIdeasPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [ideas, setIdeas] = useState([]);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(null); // { id, text }
  const [showClosed, setShowClosed] = useState(false);
  const [notification, setNotification] = useState(null);

  const toast = (msg, type = 'success') => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3000); };
  const load = useCallback(async () => {
    try { const d = await (await fetch('/api/dev-ideas')).json(); if (d.success) setIdeas(d.ideas); } catch (err) { toast(err.message, 'error'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const call = async (url, method, body, done) => {
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Something went wrong.');
      if (done) toast(done);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };
  const add = () => { if (text.trim()) { call('/api/dev-ideas', 'POST', { text }, 'Idea saved.'); setText(''); } };
  const setStatus = (id, status) => call(`/api/dev-ideas/${id}`, 'PATCH', { status });
  const saveEdit = () => { call(`/api/dev-ideas/${editing.id}`, 'PATCH', { text: editing.text }, 'Idea updated.'); setEditing(null); };
  const remove = (id) => { if (window.confirm('Delete this idea?')) call(`/api/dev-ideas/${id}`, 'DELETE', null, 'Idea deleted.'); };

  const open = ideas.filter((i) => i.status === 'new' || i.status === 'picked_up');
  const closed = ideas.filter((i) => i.status === 'done' || i.status === 'dismissed');
  const panel = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const field = `w-full px-3 py-2.5 rounded-xl text-sm outline-none border ${isDark ? 'bg-slate-950/60 border-white/10' : 'bg-white border-[#2E2B27]/10'}`;
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';
  const btn = `p-2 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`;

  // a render function, not a component, so the edit box keeps focus while typing
  const renderRow = (i) => {
    const [SrcIcon, srcLabel] = SOURCE[i.source] || SOURCE.page;
    return (
      <div key={i.id} className={`p-3.5 rounded-xl border flex gap-3 ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
        <div className="flex-1 min-w-0">
          {editing?.id === i.id ? (
            <textarea className={field} rows={3} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} autoFocus />
          ) : (
            <p className="text-sm whitespace-pre-wrap break-words">{i.text}</p>
          )}
          {i.notes && <p className={`text-xs mt-1.5 ${muted}`}>Claude: {i.notes}</p>}
          <div className={`flex flex-wrap items-center gap-2 mt-2 text-[11px] ${muted}`}>
            <span className={`px-2 py-0.5 rounded-full font-bold ${STATUS[i.status].cls}`}>{STATUS[i.status].label}</span>
            <span className="flex items-center gap-1" title={srcLabel}><SrcIcon size={12} /> #{i.id}</span>
            <span>{new Date(i.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
        </div>
        <div className="flex items-start gap-0.5 shrink-0">
          {editing?.id === i.id ? (
            <>
              <button onClick={saveEdit} className={btn} title="Save"><Save size={15} /></button>
              <button onClick={() => setEditing(null)} className={btn} title="Cancel"><X size={15} /></button>
            </>
          ) : (i.status === 'new' || i.status === 'picked_up') ? (
            <>
              <button onClick={() => setEditing({ id: i.id, text: i.text })} className={btn} title="Edit"><Pencil size={15} /></button>
              <button onClick={() => setStatus(i.id, 'done')} className={`${btn} text-emerald-500`} title="Mark done"><Check size={15} /></button>
              <button onClick={() => setStatus(i.id, 'dismissed')} className={btn} title="Dismiss"><X size={15} /></button>
            </>
          ) : (
            <button onClick={() => setStatus(i.id, 'new')} className={btn} title="Reopen"><RotateCcw size={15} /></button>
          )}
          <button onClick={() => remove(i.id)} className={`${btn} text-red-400`} title="Delete"><Trash2 size={15} /></button>
        </div>
      </div>
    );
  };

  return (
    <PortalShell title="Dev Ideas" subtitle="/ims/devideas • ideas for IMS, picked up in Claude Code with /ideas"
      icon={Lightbulb} gradient="from-amber-400 to-orange-600" glow="rgba(251,146,60,0.3)" maxWidth="max-w-3xl"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification}>
      <div className={panel}>
        <p className={`text-xs mb-3 ${muted}`}>
          Say <b>"Ims, dev idea: …"</b> to the desk or the app, or type one here. In Claude Code, type <b>/ideas</b> to pull in everything waiting; ideas move to Picked up, then Done.
        </p>
        <div className="flex gap-2 items-end">
          <textarea className={field} rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Show tomorrow's first event in the desk footer after 9pm"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add(); }} />
          <button onClick={add} disabled={!text.trim()} className="px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 bg-gradient-to-r from-amber-400 to-orange-600 text-white disabled:opacity-40 shrink-0">
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      <div className={panel}>
        <h2 className="text-xs font-black uppercase tracking-wider mb-3">Waiting ({open.length})</h2>
        {open.length ? <div className="flex flex-col gap-2">{open.map(renderRow)}</div>
          : <p className={`text-sm text-center py-6 ${muted}`}>No ideas waiting.</p>}
      </div>

      {closed.length > 0 && (
        <div className={panel}>
          <button onClick={() => setShowClosed(!showClosed)} className="text-xs font-black uppercase tracking-wider">
            Done and dismissed ({closed.length}) {showClosed ? '▾' : '▸'}
          </button>
          {showClosed && <div className="flex flex-col gap-2 mt-3">{closed.map(renderRow)}</div>}
        </div>
      )}
    </PortalShell>
  );
}
