import React, { useState, useEffect, useCallback } from 'react';
import { useFocusItem } from '../../hooks/useFocusItem';
import { ClipboardList, Plus, RotateCw, Trash2, Pencil, Check, X, ChevronDown, ChevronRight, Clock, User, MessageCircle, Repeat, Ban, BookOpen } from 'lucide-react';
import PortalShell from './PortalShell';

// Ims's instructions: things Simon has asked Ims to do later - like reminders, but for Ims. Ims saves them
// himself when asked ("if you see Rowan tonight, tell him..."); they can also be added and edited here.
const TRIGGERS = [
  { value: 'time', label: 'At a time', icon: Clock },
  { value: 'person', label: 'When someone is at the desk', icon: User },
  { value: 'next_conversation', label: 'Next time we talk', icon: MessageCircle },
  { value: 'standing', label: 'Always (a standing rule)', icon: Repeat },
  { value: 'how_to', label: 'How to do something (when it comes up)', icon: BookOpen },
];
const REPEATS = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Every day' },
  { value: 'every_time', label: 'Every time (people: at most every 30 min)' },
];
const STATUS = {
  done: { label: 'Done', cls: 'text-emerald-500' },
  cancelled: { label: 'Cancelled', cls: 'text-slate-500' },
  expired: { label: 'Expired', cls: 'text-amber-500' },
};
const when = (t) => (t ? new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const hhmm = (t) => (t ? new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }) : '');
const ymd = (t) => (t ? new Date(t).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) : '');
const EMPTY = { instruction: '', say: '', trigger: 'time', person: '', situation: '', time: '', date: '', notBefore: '', notAfter: '', notBeforeDate: '', repeat: 'once' };
const fromItem = (i) => ({
  instruction: i.instruction, say: i.say || '', trigger: i.trigger, person: i.person || '', situation: i.situation || '',
  time: hhmm(i.at), date: ymd(i.at), notBefore: hhmm(i.notBefore), notAfter: hhmm(i.notAfter), notBeforeDate: ymd(i.notBefore), repeat: i.repeat || 'once',
});

function InstructionForm({ form, setForm, isDark, onSave, onCancel, saving, saveLabel }) {
  const field = `w-full px-3 py-2 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/15 text-[#2E2B27]'}`;
  const label = 'text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block';
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="flex flex-col gap-3">
      <div>
        <span className={label}>What should Ims do?</span>
        <textarea rows={form.trigger === 'how_to' ? 6 : 2} value={form.instruction} onChange={set('instruction')} placeholder={form.trigger === 'how_to' ? 'e.g. 1) Check how many it is for. 2) Give the oven temperature first...' : "e.g. Tell Rowan it's time for bed"} className={`${field} resize-y`} />
      </div>
      <div>
        <span className={label}>Exact words to say (optional)</span>
        <input value={form.say} onChange={set('say')} placeholder={'e.g. Hello Rowan, isn\'t it time for bed?'} className={field} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <span className={label}>When</span>
          <select value={form.trigger} onChange={set('trigger')} className={field}>
            {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        {form.trigger === 'how_to' && (
          <div><span className={label}>When does it apply?</span><input value={form.situation} onChange={set('situation')} placeholder="e.g. he asks for a recipe" className={field} /></div>
        )}
        {form.trigger !== 'standing' && form.trigger !== 'next_conversation' && form.trigger !== 'how_to' && (
          <div>
            <span className={label}>Repeat</span>
            <select value={form.repeat} onChange={set('repeat')} className={field}>
              {REPEATS.filter((r) => form.trigger === 'person' || r.value !== 'every_time').map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        )}
        {form.trigger === 'time' && (
          <>
            <div><span className={label}>Time</span><input type="time" value={form.time} onChange={set('time')} className={field} /></div>
            <div><span className={label}>Date (blank = next time it comes round)</span><input type="date" value={form.date} onChange={set('date')} className={field} /></div>
          </>
        )}
        {form.trigger === 'person' && (
          <div><span className={label}>Who</span><input value={form.person} onChange={set('person')} placeholder="e.g. Rowan" className={field} /></div>
        )}
      </div>
      {form.trigger !== 'time' && form.trigger !== 'how_to' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><span className={label}>Not before (optional)</span><input type="time" value={form.notBefore} onChange={set('notBefore')} className={field} /></div>
          <div><span className={label}>Not after (optional)</span><input type="time" value={form.notAfter} onChange={set('notAfter')} className={field} /></div>
          <div><span className={label}>On (blank = today)</span><input type="date" value={form.notBeforeDate} onChange={set('notBeforeDate')} className={field} /></div>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onSave} disabled={!form.instruction.trim() || saving} className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r from-indigo-500 to-violet-600 text-white disabled:opacity-40">
          {saving ? <RotateCw size={13} className="animate-spin" /> : <Check size={13} />} {saveLabel}
        </button>
        {onCancel && <button onClick={onCancel} className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}><X size={13} /> Cancel</button>}
      </div>
    </div>
  );
}

function PendingRow({ item, isDark, onEdit, onDone, onCancel }) {
  const border = isDark ? 'border-white/10' : 'border-[#2E2B27]/10';
  const T = (TRIGGERS.find((t) => t.value === item.trigger) || TRIGGERS[0]).icon;
  return (
    <div id={`instruction-${item.id}`} className={`rounded-xl border ${border} ${isDark ? 'bg-slate-950/40' : 'bg-white'} px-3 py-2.5 flex flex-col gap-1.5`}>
      <div className="flex items-start gap-2 text-xs">
        <T size={14} className="shrink-0 mt-0.5 text-indigo-500" />
        <span className="font-semibold min-w-0 flex-1 break-words">{item.description}</span>
      </div>
      {item.simonSaid && <p className="text-[11px] text-slate-500 pl-6">You said: "{item.simonSaid}"</p>}
      <div className="flex flex-wrap gap-2 pl-6 items-center">
        <span className="text-[11px] text-slate-500 mr-auto">Added {when(item.createdAt)}{item.origin === 'desk' ? ' on the desk' : item.origin === 'web' ? ' here' : ''}{item.doneCount ? ` · done ${item.doneCount}×, last ${when(item.lastDoneAt)}` : ''}</span>
        <button onClick={() => onEdit(item)} className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 border ${border}`}><Pencil size={11} /> Edit</button>
        {item.trigger !== 'standing' && item.trigger !== 'how_to' && <button onClick={() => onDone(item)} className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 border ${border} text-emerald-500`}><Check size={11} /> Done</button>}
        <button onClick={() => onCancel(item)} className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 border ${border} text-red-500`}><Ban size={11} /> Cancel</button>
      </div>
    </div>
  );
}

function HowToRow({ item, isDark, onEdit, onCancel }) {
  const [open, setOpen] = useState(false);
  const border = isDark ? 'border-white/10' : 'border-[#2E2B27]/10';
  return (
    <div id={`instruction-${item.id}`} className={`rounded-xl border ${border} ${isDark ? 'bg-slate-950/40' : 'bg-white'}`}>
      <div className="px-3 py-2.5 flex items-center gap-2 text-xs cursor-pointer" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={14} className="opacity-60 shrink-0" /> : <ChevronRight size={14} className="opacity-60 shrink-0" />}
        <BookOpen size={14} className="shrink-0 text-indigo-500" />
        <span className="font-semibold min-w-0 flex-1 break-words">When {item.situation}</span>
      </div>
      {open && (
        <div className={`px-3 pb-3 pt-2 border-t ${border} flex flex-col gap-2`}>
          <p className="text-xs leading-relaxed whitespace-pre-line">{item.instruction.replace(/ (\d+)\) /g, '\n$1) ')}</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => onEdit(item)} className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 border ${border}`}><Pencil size={11} /> Edit</button>
            <button onClick={() => onCancel(item)} className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 border ${border} text-red-500`}><Ban size={11} /> Remove</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InstructionsPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [pending, setPending] = useState([]);
  const [finished, setFinished] = useState([]);
  useFocusItem(pending.length); // Ctrl+K search results land on #<item>
  const howTos = pending.filter((i) => i.trigger === 'how_to');
  const waiting = pending.filter((i) => i.trigger !== 'how_to');
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null); // id
  const [editForm, setEditForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [showFinished, setShowFinished] = useState(false);
  const [notification, setNotification] = useState(null);
  const notify = (msg, type = 'success') => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3500); };
  const panel = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const border = isDark ? 'border-white/10' : 'border-[#2E2B27]/10';

  const load = useCallback(async () => {
    try {
      const d = await (await fetch('/api/ims-instructions')).json();
      if (d.success) { setPending(d.pending); setFinished(d.finished); }
    } catch (err) { notify(err.message, 'error'); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const body = (f) => {
    const b = { instruction: f.instruction, say: f.say, trigger: f.trigger, repeat: f.repeat };
    if (f.trigger === 'time') { b.time = f.time; if (f.date) b.date = f.date; }
    if (f.trigger === 'person') b.person = f.person;
    if (f.trigger === 'how_to') b.situation = f.situation;
    if (f.trigger !== 'time' && f.trigger !== 'how_to') { b.notBefore = f.notBefore || null; b.notAfter = f.notAfter || null; if (f.notBeforeDate) b.notBeforeDate = f.notBeforeDate; }
    if (f.trigger === 'standing' || f.trigger === 'next_conversation' || f.trigger === 'how_to') b.repeat = 'once';
    return b;
  };
  const call = async (url, method, payload) => {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: payload ? JSON.stringify(payload) : undefined });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.success === false) throw new Error(d.error || 'That did not work.');
    return d;
  };
  const add = async () => {
    setSaving(true);
    try { const d = await call('/api/ims-instructions', 'POST', body(form)); notify(`Saved: ${d.instruction.description}`); setForm(EMPTY); load(); }
    catch (err) { notify(err.message, 'error'); } finally { setSaving(false); }
  };
  const saveEdit = async () => {
    setSaving(true);
    try { await call(`/api/ims-instructions/${editing}`, 'PUT', body(editForm)); notify('Instruction updated.'); setEditing(null); load(); }
    catch (err) { notify(err.message, 'error'); } finally { setSaving(false); }
  };
  const done = async (i) => { try { await call(`/api/ims-instructions/${i.id}/done`, 'POST', {}); notify('Marked done.'); load(); } catch (err) { notify(err.message, 'error'); } };
  const cancel = async (i) => { if (!window.confirm(`Cancel "${i.instruction}"?`)) return; try { await call(`/api/ims-instructions/${i.id}/cancel`, 'POST', {}); notify('Cancelled.'); load(); } catch (err) { notify(err.message, 'error'); } };
  const remove = async (i) => { if (!window.confirm('Delete this from the history?')) return; try { await call(`/api/ims-instructions/${i.id}`, 'DELETE'); load(); } catch (err) { notify(err.message, 'error'); } };

  return (
    <PortalShell title="Instructions" subtitle="/ims/instructions • things you've asked Ims to do"
      icon={ClipboardList} gradient="from-indigo-500 to-violet-600" glow="rgba(99,102,241,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification} maxWidth="max-w-4xl">
      <div className={panel}>
        <h2 className="text-xs font-black uppercase tracking-wider mb-1">New instruction</h2>
        <p className="text-[11px] text-slate-500 mb-3">Like a reminder, but for Ims. Or just tell him - "Hey IMS, if you see Rowan between half eight and nine tonight, say 'Hello Rowan, isn't it time for bed?'" - and he'll save it here, read it back to you, and do it at the right moment.</p>
        <InstructionForm form={form} setForm={setForm} isDark={isDark} onSave={add} saving={saving} saveLabel="Save" />
      </div>
      <div className={panel}>
        <h2 className="text-xs font-black uppercase tracking-wider mb-3">Waiting ({waiting.length})</h2>
        <div className="flex flex-col gap-2">
          {waiting.map((i) => (editing === i.id
            ? <div key={i.id} className={`rounded-xl border ${border} p-3`}><InstructionForm form={editForm} setForm={setEditForm} isDark={isDark} onSave={saveEdit} onCancel={() => setEditing(null)} saving={saving} saveLabel="Save changes" /></div>
            : <PendingRow key={i.id} item={i} isDark={isDark} onEdit={(x) => { setEditing(x.id); setEditForm(fromItem(x)); }} onDone={done} onCancel={cancel} />))}
          {!waiting.length && <p className="text-xs text-slate-500">Nothing waiting.</p>}
        </div>
      </div>
      <div className={panel}>
        <h2 className="text-xs font-black uppercase tracking-wider mb-1">How-tos ({howTos.length})</h2>
        <p className="text-[11px] text-slate-500 mb-3">How Ims handles each kind of request - stories, recipes, a child at the desk... He follows these in every conversation; edit one to change how he does it, or tell him ("from now on, when I ask for a recipe, give me the oven temperature first").</p>
        <div className="flex flex-col gap-2">
          {howTos.map((i) => (editing === i.id
            ? <div key={i.id} className={`rounded-xl border ${border} p-3`}><InstructionForm form={editForm} setForm={setEditForm} isDark={isDark} onSave={saveEdit} onCancel={() => setEditing(null)} saving={saving} saveLabel="Save changes" /></div>
            : <HowToRow key={i.id} item={i} isDark={isDark} onEdit={(x) => { setEditing(x.id); setEditForm(fromItem(x)); }} onCancel={cancel} />))}
          {!howTos.length && <p className="text-xs text-slate-500">None yet.</p>}
        </div>
      </div>
      <div className={panel}>
        <button onClick={() => setShowFinished(!showFinished)} className="w-full flex items-center gap-2 text-xs font-black uppercase tracking-wider">
          {showFinished ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Finished ({finished.length})
        </button>
        {showFinished && (
          <div className="flex flex-col gap-2 mt-3">
            {finished.map((i) => {
              const st = STATUS[i.status] || STATUS.done;
              return (
                <div key={i.id} className={`rounded-xl border ${border} px-3 py-2.5 text-xs flex flex-col gap-1`}>
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 break-words">{i.description}</span>
                    <span className={`font-semibold shrink-0 ${st.cls}`}>{st.label}</span>
                    <button onClick={() => remove(i)} title="Delete" className="shrink-0 text-slate-500 hover:text-red-500"><Trash2 size={12} /></button>
                  </div>
                  {i.outcome && <p className="text-[11px] text-slate-500">{i.outcome}</p>}
                  <p className="text-[11px] text-slate-500">{when(i.lastDoneAt || i.updatedAt)}</p>
                </div>
              );
            })}
            {!finished.length && <p className="text-xs text-slate-500">None yet.</p>}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
