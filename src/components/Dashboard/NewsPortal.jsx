import React, { useState, useEffect, useCallback } from 'react';
import { Newspaper, Plus, Trash2, RotateCw, ExternalLink, ChevronDown, ChevronRight, Rss, Globe, AlertTriangle } from 'lucide-react';
import PortalShell from './PortalShell';

const WEIGHT_LABEL = { 1: 'Just now and then', 2: 'Minor', 3: 'Normal', 4: 'Important', 5: 'Most important' };

function WeightPicker({ value, onChange }) {
  return (
    <span className="flex items-center gap-0.5 shrink-0" title={`Importance: ${WEIGHT_LABEL[value]}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onChange(n)} className={`w-5 h-5 rounded text-[10px] font-black ${n <= value ? 'bg-sky-500 text-white' : 'bg-slate-500/15 text-slate-500'}`}>{n}</button>
      ))}
    </span>
  );
}

function SourceRow({ src, isDark, onChange, onDelete }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const [name, setName] = useState(src.name);
  const [url, setUrl] = useState(src.url);
  const [savingUrl, setSavingUrl] = useState(false);
  useEffect(() => { setUrl(src.url); setItems(null); setErr(null); }, [src.url]);
  const saveUrl = async () => {
    if (!url.trim() || url.trim() === src.url) return;
    setSavingUrl(true);
    const ok = await onChange(src.id, { url: url.trim() });
    if (!ok) setUrl(src.url);
    setSavingUrl(false);
  };

  useEffect(() => {
    if (!open || items) return;
    fetch(`/api/news/sources/${src.id}/items`).then((r) => r.json())
      .then((d) => { if (d.success) setItems(d.items); else setErr(d.error); }).catch((e) => setErr(e.message));
  }, [open, items, src.id]);

  const border = isDark ? 'border-white/10' : 'border-[#2E2B27]/10';
  return (
    <div className={`rounded-xl border ${border} ${isDark ? 'bg-slate-950/40' : 'bg-white'}`}>
      <div className="px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <button onClick={() => setOpen(!open)} className="shrink-0 opacity-60">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        {src.kind === 'feed' ? <Rss size={13} className="text-orange-400 shrink-0" title="RSS/Atom feed" /> : <Globe size={13} className="text-sky-400 shrink-0" title="Headlines read from the page" />}
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== src.name && onChange(src.id, { name })}
          className="font-bold bg-transparent outline-none min-w-0 flex-1 basis-40 break-words" />
        <WeightPicker value={src.weight} onChange={(w) => onChange(src.id, { weight: w })} />
        <label className="flex items-center gap-1.5 cursor-pointer shrink-0" title="Include in the morning / day report">
          <input type="checkbox" checked={src.inReport} onChange={(e) => onChange(src.id, { inReport: e.target.checked })} />
          <span className="text-[11px]">In report</span>
        </label>
        <a href={src.url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-sky-500 shrink-0" title={src.url}><ExternalLink size={13} /></a>
        <button onClick={() => onDelete(src)} className="text-slate-500 hover:text-red-500 shrink-0" title="Remove"><Trash2 size={13} /></button>
      </div>
      {src.lastError && <div className="px-3 pb-2 text-[11px] text-amber-500 flex items-center gap-1.5"><AlertTriangle size={12} />Last try failed: {src.lastError}</div>}
      {open && (
        <div className={`px-3 pb-3 pt-2 border-t ${border} text-xs flex flex-col gap-2`}>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Address</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveUrl()}
              className={`flex-1 min-w-[12rem] px-2 py-1.5 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10' : 'bg-white border-[#2E2B27]/10'}`} />
            <button onClick={saveUrl} disabled={savingUrl || !url.trim() || url.trim() === src.url} className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-sky-500 text-white disabled:opacity-40">
              {savingUrl ? 'Checking...' : 'Save'}
            </button>
            <span className="w-full text-[10px] text-slate-500">Importance: {WEIGHT_LABEL[src.weight]} - {({ 1: 1, 2: 1, 3: 2, 4: 3, 5: 4 })[src.weight]} item{src.weight >= 3 ? 's' : ''} in the report{src.feedUrl && src.feedUrl !== src.url ? ` · reading its feed: ${src.feedUrl}` : ''}</span>
          </div>
          {!items && !err && <RotateCw size={14} className="animate-spin opacity-50" />}
          {err && <p className="text-amber-500">{err}</p>}
          {items && items.length === 0 && <p className="text-slate-500">Nothing there right now.</p>}
          {items && items.map((i) => (
            <div key={i.headline}>
              {i.link ? <a href={i.link} target="_blank" rel="noreferrer" className="font-semibold hover:underline">{i.headline}</a> : <span className="font-semibold">{i.headline}</span>}
              {i.summary && <p className="text-slate-500 mt-0.5">{i.summary}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NewsPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [sources, setSources] = useState([]);
  const [form, setForm] = useState({ url: '', name: '' });
  const [adding, setAdding] = useState(false);
  const [notification, setNotification] = useState(null);
  const notify = (msg, type = 'success') => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 4000); };
  const panel = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const field = `px-3 py-2 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10' : 'bg-white border-[#2E2B27]/10'}`;
  const gradient = 'from-sky-500 to-blue-600';

  const load = useCallback(async () => {
    const d = await (await fetch('/api/news/sources')).json();
    if (d.success) setSources(d.sources);
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    setAdding(true);
    try {
      const d = await (await fetch('/api/news/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })).json();
      if (!d.success) throw new Error(d.error);
      setForm({ url: '', name: '' });
      notify(`Added ${d.source.name} - ${d.source.kind === 'feed' ? 'found its feed' : 'reading headlines from the page'}.`);
      load();
    } catch (err) { notify(err.message, 'error'); } finally { setAdding(false); }
  };
  const change = async (id, patch) => {
    const d = await (await fetch(`/api/news/sources/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })).json();
    if (!d.success) { notify(d.error, 'error'); return false; }
    setSources((s) => s.map((x) => (x.id === id ? d.source : x)).sort((a, b) => b.weight - a.weight || a.id - b.id));
    if (patch.url) notify(`Address updated - ${d.source.kind === 'feed' ? 'found its feed' : 'reading headlines from the page'}.`);
    return true;
  };
  const remove = async (src) => {
    if (!window.confirm(`Remove ${src.name}?`)) return;
    await fetch(`/api/news/sources/${src.id}`, { method: 'DELETE' });
    load();
  };

  return (
    <PortalShell title="News Sources" subtitle="/ims/news • where IMS gathers your news and interests"
      icon={Newspaper} gradient={gradient} glow="rgba(14,165,233,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification} maxWidth="max-w-4xl">

      <div className={panel}>
        <h2 className="text-xs font-black uppercase tracking-wider mb-1">Add a source</h2>
        <p className="text-[11px] text-slate-500 mb-3">Paste any web address: a news site, a blog, a forum, a hobby site or an RSS feed. IMS finds the site's feed if it has one, otherwise it reads the headlines off the page.</p>
        <div className="flex flex-wrap gap-2">
          <input className={`${field} flex-1 min-w-[14rem]`} placeholder="https://..." value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && form.url && add()} />
          <input className={`${field} w-44`} placeholder="Name (optional)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <button onClick={add} disabled={!form.url || adding} className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r ${gradient} text-white disabled:opacity-40`}>
            {adding ? <RotateCw size={13} className="animate-spin" /> : <Plus size={13} />} Add
          </button>
        </div>
      </div>

      <div className={panel}>
        <h2 className="text-xs font-black uppercase tracking-wider mb-1">Your sources ({sources.length})</h2>
        <p className="text-[11px] text-slate-500 mb-3">Ticked sources go into your morning / day report. The 1-5 buttons set how much each matters: 5 gets four items and comes first, 1 gets one. Open a source to change its address. Any of them can be asked for by name: "Hey IMS, anything new on Dicebreaker?" Open a source to see what IMS is reading from it.</p>
        <div className="flex flex-col gap-2">
          {sources.map((src) => <SourceRow key={src.id} src={src} isDark={isDark} onChange={change} onDelete={remove} />)}
          {!sources.length && <p className="text-xs text-slate-500">No sources yet.</p>}
        </div>
      </div>
    </PortalShell>
  );
}
