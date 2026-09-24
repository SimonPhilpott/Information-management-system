import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Save, RotateCw, Check, AlertCircle, Sun, Moon, Plus, Trash2, Pencil, X, Cake, Archive, ListChecks, Undo2 } from 'lucide-react';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function BirthdayPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';

  const [birthdays, setBirthdays] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [notification, setNotification] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ name: '', month: 1, day: 1, birthYear: '' });
  const [tab, setTab] = useState('active');   // 'active' | 'archive'
  const [archive, setArchive] = useState({ deleted: [], recentlyPassed: [] });

  const showToast = useCallback((msg, t = 'success') => {
    setNotification({ msg, type: t });
    setTimeout(() => setNotification((prev) => (prev?.msg === msg ? null : prev)), 3500);
  }, []);

  const fetchBirthdays = useCallback(async () => {
    try {
      const res = await fetch('/api/birthdays');
      const data = await res.json();
      if (data.success) { setBirthdays(data.birthdays); setErrorMessage(null); }
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchBirthdays(); }, [fetchBirthdays]);

  const fetchArchive = useCallback(async () => {
    try {
      const d = await (await fetch('/api/birthdays/archive')).json();
      if (d.success) setArchive({ deleted: d.deleted, recentlyPassed: d.recentlyPassed });
    } catch (err) {
      setErrorMessage(err.message);
    }
  }, []);
  useEffect(() => { if (tab === 'archive') fetchArchive(); }, [tab, fetchArchive]);

  const restore = async (id) => {
    try {
      const res = await fetch(`/api/birthdays/${id}/restore`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to restore.');
      showToast('Birthday restored.');
      fetchArchive();
      fetchBirthdays();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleReturnHome = () => {
    window.history.pushState(null, '', '/ims');
    if (setCurrentPath) setCurrentPath('/ims');
    else window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const startCreate = () => { setIsCreating(true); setEditingId(null); setForm({ name: '', month: 1, day: 1, birthYear: '' }); };
  const startEdit = (b) => { setEditingId(b.id); setIsCreating(false); setForm({ name: b.name, month: b.month, day: b.day, birthYear: b.birthYear || '' }); };
  const cancelForm = () => { setEditingId(null); setIsCreating(false); };

  const submitForm = async () => {
    if (!form.name.trim()) { showToast('Name is required.', 'error'); return; }
    try {
      const url = editingId ? `/api/birthdays/${editingId}` : '/api/birthdays';
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, month: Number(form.month), day: Number(form.day), birthYear: form.birthYear ? Number(form.birthYear) : null })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save.');
      showToast(editingId ? 'Birthday updated.' : 'Birthday added.');
      cancelForm();
      fetchBirthdays();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Move this birthday to the archive?')) return;
    try {
      const res = await fetch(`/api/birthdays/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete.');
      showToast('Birthday moved to the archive.');
      fetchBirthdays();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const fieldClass = `w-full px-3 py-2 rounded-lg text-xs outline-none border ${
    isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/10 text-slate-900'
  }`;
  const panelClass = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const daysInMonth = (m) => new Date(2024, m, 0).getDate();

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
            <div className="p-2 rounded-xl bg-gradient-to-tr from-pink-500 to-fuchsia-600 shadow-[0_0_15px_rgba(236,72,153,0.3)]">
              <Cake size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight leading-none uppercase">Birthdays</h1>
              <span className="text-[10px] font-semibold text-slate-500 tracking-wider">/ims/birthday • cake icon appears within 7 days of any birthday</span>
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
          {[['active', `Birthdays (${birthdays.length})`, ListChecks], ['archive', 'Archive', Archive]].map(([key, label, TabIcon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                tab === key ? 'bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white' : isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-black/5 hover:bg-black/10 text-slate-700'
              }`}>
              <TabIcon size={14} />{label}
            </button>
          ))}
        </div>

        {tab === 'active' && (
        <div className={panelClass}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-black uppercase tracking-wider">Birthdays ({birthdays.length})</h2>
            {!isCreating && (
              <button onClick={startCreate} className="px-3 py-2 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center gap-2 bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white active:scale-95">
                <Plus size={14} /> New
              </button>
            )}
          </div>

          {(isCreating || editingId) && (
            <div className={`mb-4 p-4 rounded-xl border grid grid-cols-1 sm:grid-cols-4 gap-3 ${isDark ? 'bg-slate-950/40 border-white/10' : 'bg-white border-[#2E2B27]/10'}`}>
              <div className="sm:col-span-4">
                <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Name</label>
                <input className={fieldClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Who's birthday?" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Month</label>
                <select className={fieldClass} value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })}>
                  {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Day</label>
                <select className={fieldClass} value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}>
                  {Array.from({ length: daysInMonth(Number(form.month)) }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Birth Year (optional)</label>
                <input type="number" className={fieldClass} value={form.birthYear} onChange={(e) => setForm({ ...form, birthYear: e.target.value })} placeholder="e.g. 1990" />
              </div>
              <div className="flex items-end gap-2">
                <button onClick={submitForm} className="flex-1 px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white active:scale-95">
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
          ) : birthdays.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No birthdays added yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {birthdays.map((b) => (
                <div key={b.id} className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                  b.isToday ? 'border-emerald-500/40 bg-emerald-500/5' : b.daysUntil <= 7 ? 'border-amber-500/40 bg-amber-500/5' : (isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10')
                }`}>
                  <div>
                    <div className="font-bold flex items-center gap-2">
                      {b.name}
                      {b.isToday && <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400">Today!</span>}
                      {!b.isToday && b.daysUntil <= 7 && <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-500/20 text-amber-400">In {b.daysUntil}d</span>}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {MONTH_NAMES[b.month - 1]} {b.day}{b.turningAge ? ` • turning ${b.turningAge}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => startEdit(b)} className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`} title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(b.id)} className="p-2 rounded-lg text-red-400 hover:bg-red-500/10" title="Delete">
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
          <>
            <div className={panelClass}>
              <h2 className="text-xs font-black uppercase tracking-wider mb-3">Recently passed - last 30 days ({archive.recentlyPassed.length})</h2>
              {archive.recentlyPassed.length === 0 ? (
                <p className="text-xs text-slate-500 py-3 text-center">No birthdays in the last 30 days.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {archive.recentlyPassed.map((b) => (
                    <div key={b.id} className={`p-3 rounded-xl border text-xs flex items-center justify-between ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
                      <div>
                        <div className="font-bold">{b.name}</div>
                        <div className="text-[11px] text-slate-500">{MONTH_NAMES[b.month - 1]} {b.day}{b.turnedAge ? ` • turned ${b.turnedAge}` : ''}</div>
                      </div>
                      <span className="text-[11px] text-slate-500">{b.daysSince} day{b.daysSince === 1 ? '' : 's'} ago</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={panelClass}>
              <h2 className="text-xs font-black uppercase tracking-wider mb-3">Deleted ({archive.deleted.length})</h2>
              {archive.deleted.length === 0 ? (
                <p className="text-xs text-slate-500 py-3 text-center">Nothing has been deleted.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {archive.deleted.map((b) => (
                    <div key={b.id} className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
                      <div>
                        <div className="font-bold">{b.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {MONTH_NAMES[b.month - 1]} {b.day}{b.birthYear ? ` • born ${b.birthYear}` : ''} • added {new Date(b.createdAt).toLocaleDateString('en-GB')} • deleted {new Date(b.deletedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                      </div>
                      <button onClick={() => restore(b.id)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}>
                        <Undo2 size={12} /> Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
