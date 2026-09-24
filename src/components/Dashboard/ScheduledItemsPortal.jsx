import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Save, RotateCw, Check, AlertCircle, Sun, Moon,
  Plus, Trash2, Pencil, X, Bell, Clock, PenLine, Archive, ListChecks, CalendarPlus, CalendarCheck
} from 'lucide-react';

// One shared page for /ims/alarms, /ims/timers, /ims/reminders - they're the
// same underlying scheduled_items row on the backend (see
// remindersService.js), differing only in `type` and which REST path serves
// them, so a single parameterised component avoids three near-duplicate files.
const TYPE_META = {
  alarm: { icon: Bell, gradient: 'from-red-500 to-rose-600', glow: 'rgba(244,63,94,0.3)', apiPath: '/api/alarms', plural: 'Alarms' },
  timer: { icon: Clock, gradient: 'from-sky-500 to-blue-600', glow: 'rgba(59,130,246,0.3)', apiPath: '/api/timers', plural: 'Timers' },
  reminder: { icon: PenLine, gradient: 'from-emerald-500 to-teal-600', glow: 'rgba(16,185,129,0.3)', apiPath: '/api/reminders', plural: 'Reminders' },
};
const RECURRENCE_OPTIONS = ['once', 'daily', 'weekdays'];

function toLocalInputValue(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ScheduledItemsPortal({ type, theme = 'dark', onThemeToggle, setCurrentPath }) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  const isDark = theme === 'dark';

  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [notification, setNotification] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ label: '', when: '', recurrence: 'once' });
  const [isCreating, setIsCreating] = useState(false);
  const [tab, setTab] = useState('active');           // 'active' | 'archive'
  const [archive, setArchive] = useState([]);
  const [events, setEvents] = useState([]);
  const [archiveDays, setArchiveDays] = useState(30);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [showTimeline, setShowTimeline] = useState(false);
  const [calLinks, setCalLinks] = useState({});        // item id -> Google Calendar link, for items already added
  const [calBusy, setCalBusy] = useState(null);

  const showToast = useCallback((msg, t = 'success') => {
    setNotification({ msg, type: t });
    setTimeout(() => setNotification((prev) => (prev?.msg === msg ? null : prev)), 3500);
  }, []);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(meta.apiPath);
      const data = await res.json();
      if (data.success) { setItems(data.items); setErrorMessage(null); }
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [meta.apiPath]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Which items are already on the Google Calendar. Quietly empty if not signed in.
  const fetchCalLinks = useCallback(async () => {
    if (type === 'timer') return;
    try {
      const res = await fetch('/api/calendar/links', { credentials: 'same-origin' });
      const data = await res.json();
      if (data.success) setCalLinks(data.links);
    } catch (_) { /* optional */ }
  }, [type]);
  useEffect(() => { fetchCalLinks(); }, [fetchCalLinks]);

  const addToCalendar = async (item) => {
    setCalBusy(item.id);
    try {
      const res = await fetch(`/api/calendar/from-reminder/${item.id}`, { method: 'POST', credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error('Sign in with Google (on the Calendar page) to add to your calendar.');
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not add it to the calendar.');
      showToast(data.alreadyAdded ? 'Already on your Google Calendar.' : 'Added to your Google Calendar.');
      fetchCalLinks();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCalBusy(null);
    }
  };

  // Archive: everything finished (cancelled, or went off) with its timestamps,
  // and the event timeline. Refetched when the tab, period or search changes.
  const fetchArchive = useCallback(async () => {
    try {
      const [a, e] = await Promise.all([
        fetch(`${meta.apiPath}/archive?days=${archiveDays}&search=${encodeURIComponent(archiveSearch)}`).then((r) => r.json()),
        fetch(`${meta.apiPath}/events?days=${archiveDays || 3650}`).then((r) => r.json())
      ]);
      if (a.success) setArchive(a.items);
      if (e.success) setEvents(e.events);
    } catch (err) {
      setErrorMessage(err.message);
    }
  }, [meta.apiPath, archiveDays, archiveSearch]);

  useEffect(() => { if (tab === 'archive') fetchArchive(); }, [tab, fetchArchive]);

  const handleReturnHome = () => {
    window.history.pushState(null, '', '/ims');
    if (setCurrentPath) setCurrentPath('/ims');
    else window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setIsCreating(false);
    setForm({ label: item.label || '', when: toLocalInputValue(item.fireAt), recurrence: item.recurrence });
  };

  const startCreate = () => {
    setIsCreating(true);
    setEditingId(null);
    const d = new Date(Date.now() + 3600000);
    setForm({ label: '', when: toLocalInputValue(d.toISOString()), recurrence: 'once' });
  };

  const cancelForm = () => { setEditingId(null); setIsCreating(false); };

  const submitForm = async () => {
    if (!form.when) { showToast('Pick a date/time.', 'error'); return; }
    const dt = new Date(form.when);
    const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const time = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    const body = { label: form.label || null, date, time, recurrence: form.recurrence };
    try {
      const url = editingId ? `${meta.apiPath}/${editingId}` : meta.apiPath;
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save.');
      showToast(editingId ? `${type} updated.` : `${type} created.`);
      cancelForm();
      fetchItems();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`Cancel this ${type}?`)) return;
    try {
      const res = await fetch(`${meta.apiPath}/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to cancel.');
      showToast(`${type} cancelled.`);
      fetchItems();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const fieldClass = `w-full px-3 py-2 rounded-lg text-xs outline-none border ${
    isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/10 text-slate-900'
  }`;
  const panelClass = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;

  return (
    <div className={`h-screen overflow-y-auto w-full flex flex-col font-sans transition-colors duration-300 ${
      isDark ? 'bg-[#030712] text-[#f3f4f6]' : 'bg-[#f4efed] text-[#1f2937]'
    }`}>
      {notification && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 backdrop-blur-md border animate-in fade-in slide-in-from-top-4 duration-200 ${
          notification.type === 'error'
            ? 'bg-red-500/90 text-white border-red-600/30'
            : isDark ? 'bg-slate-900/90 text-white border-brand-cyan/40' : 'bg-white/95 text-slate-800 border-[#899981]/40 shadow-xl'
        }`}>
          {notification.type === 'error' ? <AlertCircle size={18} /> : <Check size={18} className="text-emerald-400" />}
          <span className="text-xs font-semibold">{notification.msg}</span>
        </div>
      )}

      <header className={`px-6 py-4 flex items-center justify-between border-b backdrop-blur-xl sticky top-0 z-40 transition-colors duration-300 ${
        isDark ? 'bg-[#030712]/80 border-white/5' : 'bg-[#f4efed]/85 border-[#2E2B27]/10'
      }`}>
        <div className="flex items-center gap-4">
          <button onClick={handleReturnHome} className={`p-2 rounded-xl flex items-center gap-2 text-xs font-bold transition-all active:scale-95 ${
            isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5' : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-[#2E2B27] border border-[#2E2B27]/10'
          }`} title="Return to IMS Hub">
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">IMS Hub</span>
          </button>
          <div className="h-6 w-px bg-slate-500/20" />
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl bg-gradient-to-tr ${meta.gradient} shadow-[0_0_15px_var(--glow)]`} style={{ '--glow': meta.glow }}>
              <Icon size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight leading-none uppercase">{meta.plural}</h1>
              <span className="text-[10px] font-semibold text-slate-500 tracking-wider">/ims/{type}s • synced to IMS within 15s</span>
            </div>
          </div>
        </div>
        {onThemeToggle && (
          <button onClick={onThemeToggle} className={`p-2 rounded-xl transition-all border ${
            isDark ? 'bg-white/5 hover:bg-white/10 text-amber-400 border-white/5' : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-slate-700 border-[#2E2B27]/10'
          }`} title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}>
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        )}
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto p-6 flex flex-col gap-4">
        {errorMessage && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-3">
            <AlertCircle size={16} /><span>{errorMessage}</span>
          </div>
        )}

        <div className="flex gap-2">
          {[['active', `Active (${items.length})`, ListChecks], ['archive', 'Archive', Archive]].map(([key, label, TabIcon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                tab === key ? `bg-gradient-to-r ${meta.gradient} text-white` : isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-black/5 hover:bg-black/10 text-slate-700'
              }`}>
              <TabIcon size={14} />{label}
            </button>
          ))}
        </div>

        {tab === 'active' && (
        <div className={panelClass}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-black uppercase tracking-wider">Active {meta.plural} ({items.length})</h2>
            {!isCreating && (
              <button onClick={startCreate} className={`px-3 py-2 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center gap-2 bg-gradient-to-r ${meta.gradient} text-white active:scale-95`}>
                <Plus size={14} /> New
              </button>
            )}
          </div>

          {(isCreating || editingId) && (
            <div className={`mb-4 p-4 rounded-xl border grid grid-cols-1 sm:grid-cols-3 gap-3 ${isDark ? 'bg-slate-950/40 border-white/10' : 'bg-white border-[#2E2B27]/10'}`}>
              <div className="sm:col-span-3">
                <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Label</label>
                <input className={fieldClass} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={`What's this ${type} for?`} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Date &amp; Time</label>
                <input type="datetime-local" className={fieldClass} value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Repeats</label>
                <select className={fieldClass} value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
                  {RECURRENCE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button onClick={submitForm} className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-gradient-to-r ${meta.gradient} text-white active:scale-95`}>
                  <Save size={13} /> Save
                </button>
                <button onClick={cancelForm} className={`px-3 py-2 rounded-xl text-xs font-bold ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}>
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="py-10 text-center flex flex-col items-center gap-3">
              <RotateCw size={22} className="animate-spin opacity-60" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No {type}s set.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <div key={item.id} className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
                  <div>
                    <div className="font-bold">{item.label || `(unlabelled ${type})`}</div>
                    <div className="text-[11px] text-slate-500">
                      {new Date(item.fireAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })}
                      {item.recurrence !== 'once' && <span className="ml-2 opacity-70">({item.recurrence})</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {type !== 'timer' && (calLinks[item.id] ? (
                      <a href={typeof calLinks[item.id] === 'string' ? calLinks[item.id] : undefined} target="_blank" rel="noreferrer"
                        className="p-2 rounded-lg text-emerald-400" title="On your Google Calendar - open it">
                        <CalendarCheck size={14} />
                      </a>
                    ) : (
                      <button onClick={() => addToCalendar(item)} disabled={calBusy === item.id}
                        className={`p-2 rounded-lg disabled:opacity-40 ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`} title="Add to Google Calendar">
                        {calBusy === item.id ? <RotateCw size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
                      </button>
                    ))}
                    <button onClick={() => startEdit(item)} className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`} title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="p-2 rounded-lg text-red-400 hover:bg-red-500/10" title="Cancel">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {tab === 'archive' && (
          <div className={panelClass}>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h2 className="text-xs font-black uppercase tracking-wider mr-auto">Past {meta.plural.toLowerCase()} ({archive.length})</h2>
              <input className={`${fieldClass} !w-48`} placeholder="Search..." value={archiveSearch} onChange={(e) => setArchiveSearch(e.target.value)} />
              <select className={`${fieldClass} !w-36`} value={archiveDays} onChange={(e) => setArchiveDays(Number(e.target.value))}>
                <option value={1}>Last 24 hours</option>
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
                <option value={0}>All time</option>
              </select>
              <button onClick={() => setShowTimeline(!showTimeline)} className={`px-3 py-2 rounded-lg text-xs font-bold ${showTimeline ? `bg-gradient-to-r ${meta.gradient} text-white` : isDark ? 'bg-white/5' : 'bg-black/5'}`}>
                {showTimeline ? 'Show list' : 'Show timeline'}
              </button>
            </div>

            {!showTimeline ? (
              archive.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">Nothing in this period.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {archive.map((a) => {
                    const OUTCOME = {
                      dismissed: ['Went off - acknowledged', 'bg-emerald-500/15 text-emerald-500'],
                      unanswered: ['Went off - no response', 'bg-amber-500/15 text-amber-500'],
                      cancelled: ['Cancelled', 'bg-slate-500/15 text-slate-400'],
                      ended: ['Finished', 'bg-slate-500/15 text-slate-400']
                    }[a.outcome] || ['Finished', 'bg-slate-500/15 text-slate-400'];
                    const fmt = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' }) : '-');
                    return (
                      <div key={a.id} className={`p-3 rounded-xl border text-xs ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold">{a.label || `(unlabelled ${type})`}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${OUTCOME[1]}`}>{OUTCOME[0]}</span>
                          {a.recurrence !== 'once' && <span className="opacity-60 text-[10px]">repeats {a.recurrence}</span>}
                        </div>
                        <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[11px] text-slate-500">
                          <span>Set: <strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>{fmt(a.createdAt)}</strong></span>
                          <span>For: <strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>{fmt(a.scheduledFor)}</strong></span>
                          <span>Went off: <strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>{fmt(a.firstFiredAt)}</strong></span>
                          <span>Ended: <strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>{fmt(a.endedAt)}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              events.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No events recorded in this period.</p>
              ) : (
                <div className="flex flex-col">
                  {events.map((e) => (
                    <div key={e.id} className="flex items-center gap-3 py-1.5 text-xs border-b border-white/5 last:border-0">
                      <span className="w-40 shrink-0 text-slate-500 tabular-nums">{new Date(e.at).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'short', timeStyle: 'medium' })}</span>
                      <span className={`w-24 shrink-0 font-bold ${{ created: 'text-sky-400', edited: 'text-violet-400', fired: 'text-amber-400', dismissed: 'text-emerald-400', unanswered: 'text-red-400', cancelled: 'text-slate-400' }[e.event] || ''}`}>{e.event}</span>
                      <span className="truncate">{e.label || `(unlabelled ${e.type})`}</span>
                      {e.detail && <span className="ml-auto text-[10px] opacity-60 shrink-0">{e.detail}</span>}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
}
