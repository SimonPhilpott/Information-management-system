import React, { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Plus, Trash2, Pencil, Save, X, RotateCw, LogIn, Lock, ExternalLink, AlertTriangle, EyeOff } from 'lucide-react';
import PortalShell from './PortalShell';

const ICON_LABEL = { pod: 'Pod (below glucose)', sensor: 'Sensor (above glucose)', prescription: 'Prescription (lower right)' };
const blankRule = { name: '', matchText: '', daysBefore: 0, action: 'icon', icon: 'pod', color: 'white', remindMinutes: 60 };

const fmtDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const todayLondon = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

export default function CalendarPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [data, setData] = useState(null);
  const [rules, setRules] = useState([]);
  const [calendars, setCalendars] = useState([]);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [ev, setEv] = useState({ title: '', date: todayLondon(), time: '', durationMinutes: 30 });
  const [ruleForm, setRuleForm] = useState(null);         // null | rule being added/edited
  const [excludeText, setExcludeText] = useState('');
  const [notification, setNotification] = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification((p) => (p?.msg === msg ? null : p)), 4000);
  }, []);

  const call = useCallback(async (url, options) => {
    const res = await fetch(url, { credentials: 'same-origin', ...options });
    const d = await res.json().catch(() => ({}));
    if (res.status === 401) { setNeedsSignIn(true); throw new Error(d.error || 'Sign in required.'); }
    if (!res.ok || d.success === false) throw new Error(d.error || 'Request failed.');
    return d;
  }, []);
  const send = (url, method, body) => call(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

  const load = useCallback(async (refresh = false) => {
    try {
      const d = await call(`/api/calendar?days=14${refresh ? '&refresh=1' : ''}`);
      const r = await call('/api/calendar/rules');
      setNeedsSignIn(false);
      setData(d);
      setRules(r.rules);
      setExcludeText(d.settings.excludeWords.join(', '));
    } catch (_) { /* needsSignIn is set by call() */ }
    finally { setIsLoading(false); }
  }, [call]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    call('/api/calendar/calendars').then((d) => setCalendars(d.calendars)).catch(() => {});
  }, [call, data?.status?.connected]);

  const signIn = async () => {
    try {
      const d = await (await fetch('/api/auth/url')).json();
      if (d.url) window.location.href = d.url;
    } catch (err) { showToast(err.message, 'error'); }
  };

  const addEvent = async () => {
    try {
      await send('/api/calendar/events', 'POST', { ...ev, time: ev.time || undefined });
      setEv({ ...ev, title: '', time: '' });
      showToast('Added to your Google Calendar.');
      load(true);
    } catch (err) { showToast(err.message, 'error'); }
  };
  const removeEvent = async (e) => {
    if (!window.confirm(`Delete "${e.title}" from your Google Calendar?`)) return;
    try { await call(`/api/calendar/events/${encodeURIComponent(e.calendarId)}/${encodeURIComponent(e.id)}`, { method: 'DELETE' }); load(true); }
    catch (err) { showToast(err.message, 'error'); }
  };

  const saveRule = async () => {
    try {
      const body = { ...ruleForm, daysBefore: Number(ruleForm.daysBefore), remindMinutes: Number(ruleForm.remindMinutes) };
      if (ruleForm.id) await send(`/api/calendar/rules/${ruleForm.id}`, 'PUT', body);
      else await send('/api/calendar/rules', 'POST', body);
      setRuleForm(null);
      load();
    } catch (err) { showToast(err.message, 'error'); }
  };
  const toggleRule = async (r) => {
    try { await send(`/api/calendar/rules/${r.id}`, 'PUT', { enabled: !r.enabled }); load(); } catch (err) { showToast(err.message, 'error'); }
  };
  const removeRule = async (r) => {
    if (!window.confirm(`Delete the rule "${r.name}"?`)) return;
    try { await call(`/api/calendar/rules/${r.id}`, { method: 'DELETE' }); load(); } catch (err) { showToast(err.message, 'error'); }
  };

  const saveSettings = async (patch) => {
    try { await send('/api/calendar/settings', 'PUT', patch); showToast('Saved.'); load(true); }
    catch (err) { showToast(err.message, 'error'); }
  };
  const toggleCalendar = (id) => {
    const cur = data.settings.calendarIds;
    const next = cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id];
    if (!next.length) return showToast('Keep at least one calendar selected.', 'error');
    saveSettings({ calendarIds: next });
  };

  const panel = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const field = `w-full px-3 py-2 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/10 text-slate-900'}`;
  const label = 'text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70';
  const iconBtn = `p-1.5 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`;
  const gradient = 'from-indigo-500 to-blue-600';

  const byDay = {};
  for (const e of data?.events || []) (byDay[e.date < todayLondon() ? todayLondon() : e.date] ||= []).push(e);
  const status = data?.status;

  return (
    <PortalShell title="Calendar" subtitle="/ims/calendar • Google Calendar, rules and Ims"
      icon={CalendarDays} gradient={gradient} glow="rgba(99,102,241,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification} maxWidth="max-w-3xl">

      {needsSignIn ? (
        <div className={`${panel} text-center py-10 flex flex-col items-center gap-4`}>
          <Lock size={28} className="opacity-60" />
          <p className="text-xs text-slate-500 max-w-sm">Your calendar is only available to your signed-in Google account.</p>
          <button onClick={signIn} className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r ${gradient} text-white`}><LogIn size={14} /> Sign in with Google</button>
        </div>
      ) : isLoading || !data ? (
        <div className="py-16 flex justify-center"><RotateCw size={22} className="animate-spin opacity-50" /></div>
      ) : (
        <>
          {status.error && (
            <div className={`${panel} border-amber-500/40 flex items-start gap-3`}>
              <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs">
                <p className="mb-2">{status.error}</p>
                {status.needsReconnect && (
                  <button onClick={signIn} className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r ${gradient} text-white`}><LogIn size={13} /> Connect Google Calendar</button>
                )}
              </div>
            </div>
          )}

          <div className={panel}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-black uppercase tracking-wider">Showing on Ims now</h2>
              <button onClick={() => load(true)} className={iconBtn} title="Refresh from Google"><RotateCw size={14} /></button>
            </div>
            {data.deviceIcons.length === 0 ? <p className="text-xs text-slate-500">No calendar icons today.</p> : (
              <div className="flex flex-wrap gap-2">
                {data.deviceIcons.map((i) => (
                  <span key={i.icon} className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-500/15 text-indigo-300">
                    {ICON_LABEL[i.icon] || i.icon} - {i.color}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className={panel}>
            <h2 className="text-xs font-black uppercase tracking-wider mb-3">Coming up (next 14 days)</h2>
            {Object.keys(byDay).length === 0 ? <p className="text-xs text-slate-500 py-4 text-center">Nothing in the next two weeks.</p> : (
              <div className="flex flex-col gap-4">
                {Object.entries(byDay).map(([day, list]) => (
                  <div key={day}>
                    <div className="text-[11px] font-black uppercase tracking-wider text-indigo-400 mb-1.5">{day === todayLondon() ? 'Today' : fmtDay(day)}</div>
                    <div className="flex flex-col gap-1.5">
                      {list.map((e) => (
                        <div key={`${e.calendarId}-${e.id}`} className={`p-2.5 rounded-xl border flex items-center gap-3 text-xs ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
                          <span className="w-20 shrink-0 font-mono text-[11px] text-slate-500">{e.time ? `${e.time}${e.endTime ? `-${e.endTime}` : ''}` : 'All day'}</span>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold truncate">{e.title}</div>
                            {e.location && <div className="text-[11px] text-slate-500 truncate">{e.location}</div>}
                          </div>
                          {e.link && <a href={e.link} target="_blank" rel="noreferrer" className={iconBtn} title="Open in Google Calendar"><ExternalLink size={13} /></a>}
                          <button onClick={() => removeEvent(e)} className={`${iconBtn} text-red-400`} title="Delete"><Trash2 size={13} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {status.hiddenCount > 0 && (
              <p className="text-[11px] text-slate-500 mt-3 flex items-center gap-1.5"><EyeOff size={12} />{status.hiddenCount} event{status.hiddenCount === 1 ? '' : 's'} hidden by your exclusion list - Ims never sees them.</p>
            )}
          </div>

          <div className={panel}>
            <h2 className="text-xs font-black uppercase tracking-wider mb-3">Add an appointment</h2>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
              <div className="col-span-2 sm:col-span-3"><label className={label}>Title</label><input className={field} value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} placeholder="e.g. Doctor - diabetes review" /></div>
              <div className="sm:col-span-1"><label className={label}>Date</label><input type="date" className={field} value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} /></div>
              <div className="sm:col-span-1"><label className={label}>Time (blank = all day)</label><input type="time" className={field} value={ev.time} onChange={(e) => setEv({ ...ev, time: e.target.value })} /></div>
              <button onClick={addEvent} disabled={!ev.title.trim() || !ev.date} className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-gradient-to-r ${gradient} text-white disabled:opacity-40`}><Plus size={14} />Add</button>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">You can also ask Ims: "add a doctor's appointment on Thursday at 2pm to my calendar".</p>
          </div>

          <div className={panel}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xs font-black uppercase tracking-wider">Rules</h2>
              <button onClick={() => setRuleForm({ ...blankRule })} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 bg-gradient-to-r ${gradient} text-white`}><Plus size={12} />New rule</button>
            </div>
            <p className="text-[11px] text-slate-500 mb-3">When an event title contains the words below, Ims either shows an icon or sets a reminder.</p>

            {ruleForm && (
              <div className={`mb-3 p-4 rounded-xl border grid grid-cols-2 sm:grid-cols-4 gap-3 ${isDark ? 'bg-slate-950/40 border-white/10' : 'bg-white border-[#2E2B27]/10'}`}>
                <div className="col-span-2"><label className={label}>Rule name</label><input className={field} value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} /></div>
                <div className="col-span-2"><label className={label}>Event title contains</label><input className={field} value={ruleForm.matchText} onChange={(e) => setRuleForm({ ...ruleForm, matchText: e.target.value })} placeholder="e.g. Change pod" /></div>
                <div><label className={label}>Then</label>
                  <select className={field} value={ruleForm.action} onChange={(e) => setRuleForm({ ...ruleForm, action: e.target.value })}>
                    <option value="icon">Show an icon</option><option value="remind">Set a reminder</option>
                  </select>
                </div>
                <div><label className={label}>Days before the event</label><input type="number" min="0" max="14" className={field} value={ruleForm.daysBefore} onChange={(e) => setRuleForm({ ...ruleForm, daysBefore: e.target.value })} /></div>
                {ruleForm.action === 'icon' ? (
                  <>
                    <div><label className={label}>Icon</label>
                      <select className={field} value={ruleForm.icon} onChange={(e) => setRuleForm({ ...ruleForm, icon: e.target.value })}>
                        {Object.entries(ICON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div><label className={label}>Colour</label>
                      <select className={field} value={ruleForm.color} onChange={(e) => setRuleForm({ ...ruleForm, color: e.target.value })}>
                        <option value="white">White</option><option value="orange">Orange</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <div className="col-span-2"><label className={label}>Minutes before (timed events)</label><input type="number" min="0" className={field} value={ruleForm.remindMinutes} onChange={(e) => setRuleForm({ ...ruleForm, remindMinutes: e.target.value })} /></div>
                )}
                <div className="col-span-2 sm:col-span-4 flex gap-2">
                  <button onClick={saveRule} className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r ${gradient} text-white`}><Save size={13} />Save rule</button>
                  <button onClick={() => setRuleForm(null)} className={`px-3 py-2 rounded-xl text-xs font-bold ${isDark ? 'bg-white/5' : 'bg-black/5'}`}><X size={13} /></button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {rules.map((r) => (
                <div key={r.id} className={`p-3 rounded-xl border flex items-center gap-3 text-xs ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10'} ${r.enabled ? '' : 'opacity-50'}`}>
                  <input type="checkbox" checked={r.enabled} onChange={() => toggleRule(r)} title="Enabled" />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold truncate">{r.name}</div>
                    <div className="text-[11px] text-slate-500">
                      Title contains "{r.matchText}" - {r.daysBefore === 0 ? 'on the day' : `${r.daysBefore} day${r.daysBefore === 1 ? '' : 's'} before`} -{' '}
                      {r.action === 'icon' ? `${ICON_LABEL[r.icon] || r.icon}, ${r.color}` : `reminder ${r.remindMinutes} min before`}
                    </div>
                  </div>
                  <button onClick={() => setRuleForm({ ...r })} className={iconBtn} title="Edit"><Pencil size={13} /></button>
                  <button onClick={() => removeRule(r)} className={`${iconBtn} text-red-400`} title="Delete"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>

          <div className={panel}>
            <h2 className="text-xs font-black uppercase tracking-wider mb-3">Calendars and hidden events</h2>
            {calendars.length > 0 && (
              <div className="mb-4">
                <label className={label}>Calendars Ims can see</label>
                <div className="flex flex-col gap-1.5">
                  {calendars.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={data.settings.calendarIds.includes(c.id) || (c.primary && data.settings.calendarIds.includes('primary'))} onChange={() => toggleCalendar(c.primary && data.settings.calendarIds.includes('primary') ? 'primary' : c.id)} />
                      {c.name}{c.primary && <span className="text-[10px] text-slate-500">(main)</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <label className={label}>Ignore events whose title contains (comma separated)</label>
            <div className="flex gap-3">
              <input className={field} value={excludeText} onChange={(e) => setExcludeText(e.target.value)} placeholder="bin, recycling, refuse" />
              <button onClick={() => saveSettings({ excludeWords: excludeText.split(',').map((w) => w.trim()).filter(Boolean) })} className={`px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r ${gradient} text-white shrink-0`}>Save</button>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Matching whole words only. These events are dropped before anything else sees them - not shown here, not told to Ims, not used by rules.</p>
          </div>
        </>
      )}
    </PortalShell>
  );
}
