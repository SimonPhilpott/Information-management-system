import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCw, Trash2, Clock, Wrench, Smile, Monitor, Cpu, X, Brain } from 'lucide-react';

// Persona page > Conversations: every conversation with Ims (transcripts from conversationLog.js), what he
// said, the face he pulled, the tools he used and how long he took to start answering. Kept for the
// retention period set here; nothing is recorded while a call or meeting is being recorded.
const api = async (url, opts = {}) => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.success === false) throw new Error(d.error || `Request failed (${res.status})`);
  return d;
};
const when = (ms) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const time = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const secs = (ms) => (ms == null ? null : `${(ms / 1000).toFixed(1)} s`);
const ENDED = {
  farewell: 'said goodbye', cancel: 'stopped', tap_interrupt: 'tapped to stop', silence: 'went quiet',
  device_closed: 'desk closed it', disconnect: 'connection dropped', stale: 'timed out',
};
const RETENTION = [30, 90, 180, 365, 730];
const SIMON_FIELDS = [['people', 'People'], ['projects', 'Projects'], ['plans', 'Plans'], ['likes', 'Likes'], ['dislikes', 'Dislikes'], ['goals', 'Goals'], ['reportsOnly', 'Health & training (reports only)']];
const SELF_FIELDS = [['opinions', 'His opinions'], ['runningJokes', 'Running jokes'], ['toldOffFor', "Told off for (won't repeat)"], ['tastes', 'Tastes he has mentioned']];

// How Ims has been: his mood now (and why), what's on his mind, and his speech habits this week.
function InsightsPanel({ isDark, panel, strong, sub, showToast }) {
  const [d, setD] = useState(null);
  useEffect(() => { api('/api/conversations/insights').then(setD).catch((e) => showToast(e.message, 'error')); }, [showToast]);
  if (!d) return null;
  const st = d.stats || {};
  const chip = `inline-flex items-center px-1.5 py-0.5 rounded text-[11px] ${isDark ? 'bg-white/10 text-slate-200' : 'bg-black/5 text-slate-700'}`;
  const pc = (x) => (x == null ? '-' : `${Math.round(x * 100)}%`);
  const faces = Object.entries(st.emotions || {}).filter(([e]) => e !== 'none');
  return (
    <div className={`${panel} p-4 grid md:grid-cols-3 gap-4`}>
      <div>
        <h4 className={`text-xs font-black uppercase tracking-wider mb-1.5 ${strong}`}>His mood now</h4>
        <p className={`text-sm font-bold ${strong}`}>{d.mood.label}{d.mood.gentle ? ' (going gently)' : ''}</p>
        <p className={`text-xs mt-0.5 ${sub}`}>{d.mood.reasons.length ? d.mood.reasons.join('; ') : 'Nothing much has happened to move it today.'}</p>
      </div>
      <div>
        <h4 className={`text-xs font-black uppercase tracking-wider mb-1.5 ${strong}`}>On his mind</h4>
        {d.onMind.length ? d.onMind.map((x, i) => <p key={i} className={`text-xs mb-1 ${strong}`}>{x}</p>) : <p className={`text-xs ${sub}`}>Nothing new today.</p>}
        <p className={`text-[11px] mt-1 ${sub}`}>He only brings these up in a conversation you started, at a lull.</p>
      </div>
      <div>
        <h4 className={`text-xs font-black uppercase tracking-wider mb-1.5 ${strong}`}>This week ({st.replies || 0} replies)</h4>
        {(st.replies || 0) === 0 ? <p className={`text-xs ${sub}`}>No replies recorded yet.</p> : (
          <div className="space-y-1.5">
            <p className={`text-xs ${sub}`}>Typical reply {st.length?.median ?? '-'} words (short {st.length?.p10 ?? '-'}, long {st.length?.p90 ?? '-'}) · questions {pc(st.questionRate)} · fillers {pc(st.fillerRate)}</p>
            {faces.length > 0 && <div className="flex flex-wrap gap-1">{faces.map(([e, n]) => <span key={e} className={chip}>{e} {n}</span>)}</div>}
            {st.topOpeners?.length > 0 && <p className={`text-[11px] ${sub}`}>Openers: {st.topOpeners.slice(0, 3).map(([o, n]) => `"${o}" ×${n}`).join(', ')}</p>}
            {d.hint && <p className={`text-[11px] ${strong}`}>{d.hint}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// What Ims knows about Simon and about himself - built nightly from the conversations; any line can be removed.
function ProfilesPanel({ isDark, panel, ghost, strong, sub, showToast }) {
  const [p, setP] = useState(null);
  const [busy, setBusy] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => { api('/api/conversations/profiles').then(setP).catch((e) => showToast(e.message, 'error')); }, [showToast]);
  const save = async (next) => {
    try { const d = await api('/api/conversations/profiles', { method: 'PUT', body: JSON.stringify(next) }); setP(d); }
    catch (e) { showToast(e.message, 'error'); }
  };
  const remove = (which, field, i) => {
    const cur = { ...(p?.[which] || {}) };
    cur[field] = (cur[field] || []).filter((_, j) => j !== i);
    save({ [which]: cur });
  };
  const refresh = async () => {
    setBusy('refresh');
    try { const d = await api('/api/conversations/profiles/refresh', { method: 'POST' }); if (d.profiles) setP(d.profiles); showToast(d.updated ? `Updated from ${d.conversations} conversation(s).` : 'No conversations in the last week to learn from yet.'); }
    catch (e) { showToast(e.message, 'error'); }
    setBusy('');
  };
  const clearAll = async () => { await save({ simon: null, self: null }); setConfirmClear(false); showToast('Cleared.'); };
  const col = (which, title, fields) => {
    const data = p?.[which];
    const any = data && fields.some(([f]) => data[f]?.length);
    return (
      <div className="flex-1 min-w-[240px]">
        <h4 className={`text-xs font-black uppercase tracking-wider mb-2 ${strong}`}>{title}</h4>
        {!any ? <p className={`text-xs ${sub}`}>Nothing yet - it's built each night from that day's conversations.</p> : fields.map(([f, label]) => (data[f]?.length ? (
          <div key={f} className="mb-2">
            <div className={`text-[11px] font-bold ${sub}`}>{label}</div>
            {data[f].map((x, i) => (
              <div key={i} className="flex items-start gap-1.5 group">
                <span className={`text-xs flex-1 ${strong}`}>{x}</span>
                <button type="button" onClick={() => remove(which, f, i)} title="Forget this" className={`opacity-60 hover:opacity-100 ${sub}`}><X size={12} /></button>
              </div>
            ))}
          </div>
        ) : null))}
      </div>
    );
  };
  return (
    <div className={`${panel} p-4 space-y-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <Brain size={16} className={strong} />
        <h3 className={`text-sm font-bold ${strong}`}>What Ims knows</h3>
        <span className={`text-xs ${sub}`}>{p?.simon?.updatedAt ? `updated ${new Date(p.simon.updatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : 'built nightly at 3am'}</span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={refresh} disabled={!!busy} className={ghost}><RotateCw size={14} className={busy ? 'animate-spin' : ''} /> Update from recent conversations</button>
          {confirmClear ? (
            <>
              <span className={`text-xs ${strong}`}>Forget all of it?</span>
              <button type="button" onClick={clearAll} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white">Clear</button>
              <button type="button" onClick={() => setConfirmClear(false)} className={ghost}>Keep</button>
            </>
          ) : <button type="button" onClick={() => setConfirmClear(true)} className={ghost}><Trash2 size={14} /> Clear all</button>}
        </div>
      </div>
      <div className="flex flex-col md:flex-row gap-4">
        {col('simon', 'About you', SIMON_FIELDS)}
        {col('self', 'About Ims himself', SELF_FIELDS)}
      </div>
    </div>
  );
}

export default function PersonaConversations({ isDark, panel, ghost, field, strong, sub, showToast: toast }) {
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const showToast = useCallback((...a) => toastRef.current?.(...a), []);
  const [list, setList] = useState(null);
  const [retention, setRetention] = useState(180);
  const [openId, setOpenId] = useState(null);
  const [open, setOpen] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api('/api/conversations?limit=100');
      setList(d.conversations);
      setRetention(d.retentionDays);
      if (!openId && d.conversations[0]) setOpenId(d.conversations[0].id);
    } catch (err) { showToast(err.message, 'error'); setList([]); }
  }, [openId, showToast]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setConfirmDelete(false);
    if (!openId) { setOpen(null); return; }
    api(`/api/conversations/${openId}`).then((d) => setOpen(d.conversation)).catch((err) => showToast(err.message, 'error'));
  }, [openId, showToast]);

  const remove = async () => {
    try {
      await api(`/api/conversations/${openId}`, { method: 'DELETE' });
      showToast('Conversation deleted.');
      const rest = (list || []).filter((c) => c.id !== openId);
      setList(rest);
      setOpenId(rest[0]?.id || null);
    } catch (err) { showToast(err.message, 'error'); }
  };

  const saveRetention = async (days) => {
    try {
      const d = await api('/api/conversations/retention', { method: 'PUT', body: JSON.stringify({ days }) });
      setRetention(d.retentionDays);
      showToast(`Conversations are kept for ${d.retentionDays} days.`);
    } catch (err) { showToast(err.message, 'error'); }
  };

  const chip = `inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${isDark ? 'bg-white/10 text-slate-200' : 'bg-black/5 text-slate-700'}`;

  return (
    <div className="space-y-4">
      <InsightsPanel isDark={isDark} panel={panel} strong={strong} sub={sub} showToast={showToast} />
      <ProfilesPanel isDark={isDark} panel={panel} ghost={ghost} strong={strong} sub={sub} showToast={showToast} />
      <div className="flex flex-wrap items-center gap-3">
        <p className={`text-xs flex-1 min-w-[240px] ${sub}`}>
          Every conversation with Ims - what was said, the face he pulled, the tools he used and how long he took to start answering. Nothing is kept while a call or meeting is being recorded.
        </p>
        <label className={`text-xs ${sub}`} htmlFor="conv-retention">Keep for</label>
        <select id="conv-retention" className={`${field} w-auto`} value={retention} onChange={(e) => saveRetention(Number(e.target.value))}>
          {[...new Set([...RETENTION, retention])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>{d} days</option>)}
        </select>
        <button type="button" onClick={load} className={ghost}><RotateCw size={14} /> Refresh</button>
      </div>

      {list === null ? (
        <p className={`text-xs ${sub}`}>Loading conversations...</p>
      ) : list.length === 0 ? (
        <div className={`${panel} p-6 text-center`}>
          <p className={`text-sm font-bold ${strong}`}>No conversations yet</p>
          <p className={`text-xs mt-1 ${sub}`}>Say "Hey Ims" to the desk or talk to him in the web app - each conversation will appear here once he has replied.</p>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4">
          <div className={`${panel} p-2 lg:w-80 shrink-0 max-h-[70vh] overflow-y-auto`}>
            {list.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setOpenId(c.id)}
                className={`w-full text-left p-2.5 rounded-xl mb-1 transition-colors ${openId === c.id ? (isDark ? 'bg-purple-500/20' : 'bg-purple-100') : (isDark ? 'hover:bg-white/5' : 'hover:bg-black/5')}`}
              >
                <div className="flex items-center gap-1.5">
                  {c.device === 'web' ? <Monitor size={12} className={sub} /> : <Cpu size={12} className={sub} />}
                  <span className={`text-xs font-bold ${strong}`}>{when(c.started_at)}</span>
                  <span className={`text-[11px] ml-auto ${sub}`}>{Math.ceil((c.turn_count || 0) / 2)} exchange{Math.ceil((c.turn_count || 0) / 2) === 1 ? '' : 's'}</span>
                </div>
                <p className={`text-xs mt-1 truncate ${sub}`}>{c.opening || '(started by the desk)'}</p>
                <p className={`text-[11px] mt-0.5 ${sub}`}>{c.persona_id || 'unknown persona'}{c.end_reason ? ` · ${ENDED[c.end_reason] || c.end_reason}` : ' · in progress'}</p>
              </button>
            ))}
          </div>

          <div className={`${panel} p-4 flex-1 min-w-0`}>
            {!open ? (
              <p className={`text-xs ${sub}`}>Pick a conversation.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className={`text-sm font-bold ${strong}`}>{when(open.started_at)}</h3>
                  <span className={`text-xs ${sub}`}>{open.device === 'web' ? 'Web app' : 'Desk'} · {open.persona_id || 'unknown persona'}{open.end_reason ? ` · ${ENDED[open.end_reason] || open.end_reason}` : ''}</span>
                  <div className="ml-auto flex items-center gap-2">
                    {confirmDelete ? (
                      <>
                        <span className={`text-xs ${strong}`}>Delete this conversation?</span>
                        <button type="button" onClick={remove} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white">Delete</button>
                        <button type="button" onClick={() => setConfirmDelete(false)} className={ghost}>Keep</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirmDelete(true)} className={ghost}><Trash2 size={14} /> Delete</button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {open.turns.map((t) => (
                    <div key={t.id} className={`flex ${t.role === 'ims' ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${t.role === 'ims'
                        ? (isDark ? 'bg-purple-500/15' : 'bg-purple-50')
                        : t.role === 'system' ? (isDark ? 'bg-amber-500/10' : 'bg-amber-50') : (isDark ? 'bg-white/10' : 'bg-slate-100')}`}>
                        <div className={`text-[11px] mb-0.5 ${sub}`}>{t.role === 'ims' ? 'Ims' : t.role === 'system' ? 'Desk (announcement)' : 'You'} · {time(t.at)}</div>
                        <p className={`text-sm leading-relaxed whitespace-pre-wrap ${strong}`}>{t.text}</p>
                        {t.role === 'ims' && (t.emotion || t.latency_ms != null || t.tools?.length > 0) && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {t.latency_ms != null && <span className={chip} title="From the end of what you said to his first word"><Clock size={11} /> answered in {secs(t.latency_ms)}</span>}
                            {t.emotion && t.emotion.split(',').map((e) => <span key={e} className={chip}><Smile size={11} /> {e}</span>)}
                            {(t.tools || []).map((x, i) => <span key={i} className={chip} title={x.ok === false ? 'failed' : ''}><Wrench size={11} /> {x.name} {secs(x.ms)}{x.ok === false ? ' (failed)' : ''}</span>)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
