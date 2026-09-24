import React, { useState, useEffect, useCallback } from 'react';
import { Mic, Square, ChevronDown, ChevronRight, Copy, Check, Sparkles, Trash2, Pencil, Save, X, RotateCw, Circle } from 'lucide-react';
import PortalShell from './PortalShell';

const fmtDate = (ms) => new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' });
const fmtDur = (s) => {
  if (s == null) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${sec}s` : `${sec}s`;
};

const SECTIONS = [
  ['actionItems', 'Action items'],
  ['followUpQuestions', 'Follow-up questions'],
  ['keyPoints', 'Key points'],
  ['decisions', 'Decisions'],
  ['risksOrConcerns', 'Risks and concerns'],
  ['suggestedNextSteps', 'Suggested next steps'],
];

const itemText = (it) => (typeof it === 'string' ? it : [it.task, it.owner && `(${it.owner})`, it.due && `- due ${it.due}`].filter(Boolean).join(' '));

const transcriptToText = (rec) => rec.lines.map((l) => `[${l.clock}] ${l.text}`).join('\n');
const summaryToText = (rec) => {
  const s = rec.summary;
  if (!s) return '';
  const parts = [`Summary\n${s.summary || ''}`];
  for (const [key, label] of SECTIONS) if (s[key]?.length) parts.push(`${label}\n${s[key].map((x) => `- ${itemText(x)}`).join('\n')}`);
  return parts.join('\n\n');
};

export default function RecordingsPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [recordings, setRecordings] = useState([]);
  const [status, setStatus] = useState({ active: false });
  const [isLoading, setIsLoading] = useState(true);
  const [withWhom, setWithWhom] = useState('');
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [notification, setNotification] = useState(null);
  const [, tick] = useState(0);

  const showToast = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification((p) => (p?.msg === msg ? null : p)), 3500);
  }, []);

  const api = useCallback(async (url, options) => {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || 'Request failed.');
    return data;
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await api('/api/recordings');
      setRecordings(d.recordings);
      setStatus(d.status);
    } catch (err) { showToast(err.message, 'error'); }
    finally { setIsLoading(false); }
  }, [api, showToast]);

  useEffect(() => { load(); }, [load]);
  // A recording can be started or stopped by voice, so keep this page in step.
  useEffect(() => {
    const t = setInterval(() => { load(); tick((n) => n + 1); }, 4000);
    return () => clearInterval(t);
  }, [load]);

  const openRecording = async (id) => {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id); setDetail(null);
    try { setDetail((await api(`/api/recordings/${id}`)).recording); }
    catch (err) { showToast(err.message, 'error'); }
  };

  const post = (url, method = 'POST', body) => api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

  const start = async () => {
    try { await post('/api/recordings/start', 'POST', { withWhom }); setWithWhom(''); showToast('Recording. Ims is now silent.'); load(); }
    catch (err) { showToast(err.message, 'error'); }
  };
  const stop = async () => {
    try { await post('/api/recordings/stop'); showToast('Recording saved.'); load(); }
    catch (err) { showToast(err.message, 'error'); }
  };
  const summarise = async (id) => {
    setBusy(id);
    try { setDetail((await post(`/api/recordings/${id}/summarise`)).recording); load(); }
    catch (err) { showToast(err.message, 'error'); }
    finally { setBusy(null); }
  };
  const remove = async (r) => {
    if (!window.confirm(`Delete the recording with ${r.withWhom}?`)) return;
    try { await api(`/api/recordings/${r.id}`, { method: 'DELETE' }); if (openId === r.id) { setOpenId(null); setDetail(null); } load(); }
    catch (err) { showToast(err.message, 'error'); }
  };
  const saveName = async () => {
    try { await post(`/api/recordings/${renaming.id}`, 'PUT', { withWhom: renaming.value }); setRenaming(null); load(); if (detail?.id === renaming.id) setDetail({ ...detail, withWhom: renaming.value }); }
    catch (err) { showToast(err.message, 'error'); }
  };
  const copy = async (key, text) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1800); }
    catch (_) { showToast('Could not copy - your browser blocked it.', 'error'); }
  };

  const panel = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const field = `w-full px-3 py-2 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/10 text-slate-900'}`;
  const iconBtn = `p-1.5 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`;
  const gradient = 'from-rose-500 to-red-600';
  const liveFor = status.active ? Math.max(0, Math.round((Date.now() - status.startedAt) / 1000)) : 0;

  const CopyBtn = ({ k, text, label }) => (
    <button onClick={() => copy(k, text)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}>
      {copied === k ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}{copied === k ? 'Copied' : label}
    </button>
  );

  return (
    <PortalShell title="Recordings" subtitle="/ims/recordings • call and meeting transcripts"
      icon={Mic} gradient={gradient} glow="rgba(244,63,94,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification} maxWidth="max-w-3xl">

      <div className={`p-3 rounded-xl border text-[11px] leading-relaxed ${isDark ? 'bg-slate-900/40 border-white/5 text-slate-400' : 'bg-white/70 border-[#2E2B27]/10 text-slate-600'}`}>
        Say <strong>"Ims, record this call"</strong> and tell Ims who it is with. From then on Ims is completely silent - no speech, alarms or sounds - until you say <strong>"Ims stop"</strong> or <strong>"Ims stop recording"</strong>.
        The transcript is saved here. Only your words are reliably picked up; the other person is heard only if they come through your speaker.
      </div>

      {status.active ? (
        <div className={`${panel} flex items-center gap-4 border-red-500/40`}>
          <Circle size={14} className="text-red-500 fill-red-500 animate-pulse shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold">Recording with {status.withWhom}</div>
            <div className="text-[11px] text-slate-500">Started {fmtDate(status.startedAt)} - {fmtDur(liveFor)} so far. Ims is silent.</div>
          </div>
          <button onClick={stop} className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-red-600 text-white active:scale-95"><Square size={13} />Stop</button>
        </div>
      ) : (
        <div className={panel}>
          <h2 className="text-xs font-black uppercase tracking-wider mb-3">Start a recording from here</h2>
          <div className="flex gap-3">
            <input className={field} value={withWhom} onChange={(e) => setWithWhom(e.target.value)} placeholder="Who is the call or meeting with?"
              onKeyDown={(e) => { if (e.key === 'Enter' && withWhom.trim()) start(); }} />
            <button onClick={start} disabled={!withWhom.trim()} className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r ${gradient} text-white active:scale-95 disabled:opacity-40 shrink-0`}>
              <Mic size={13} />Record
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-12 flex justify-center"><RotateCw size={22} className="animate-spin opacity-50" /></div>
      ) : recordings.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-10">No recordings yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {recordings.map((r) => (
            <div key={r.id} className={panel}>
              <div className="flex items-center gap-3">
                <button onClick={() => openRecording(r.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  {openId === r.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <div className="min-w-0">
                    {renaming?.id === r.id ? null : <div className="font-bold text-sm truncate">{r.withWhom}</div>}
                    <div className="text-[11px] text-slate-500">
                      {fmtDate(r.startedAt)}{r.durationSec != null && ` - ${fmtDur(r.durationSec)}`} - {r.wordCount} words
                      {r.status === 'recording' && <span className="text-red-500 font-bold"> - recording now</span>}
                      {r.status === 'interrupted' && <span className="text-amber-500 font-bold"> - interrupted</span>}
                      {r.summary && <span className="text-emerald-500 font-bold"> - summarised</span>}
                    </div>
                  </div>
                </button>
                {renaming?.id === r.id ? (
                  <>
                    <input className={field} value={renaming.value} onChange={(e) => setRenaming({ ...renaming, value: e.target.value })} />
                    <button onClick={saveName} className={iconBtn}><Save size={14} /></button>
                    <button onClick={() => setRenaming(null)} className={iconBtn}><X size={14} /></button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setRenaming({ id: r.id, value: r.withWhom })} className={iconBtn} title="Change who it was with"><Pencil size={14} /></button>
                    <button onClick={() => remove(r)} disabled={r.status === 'recording'} className={`${iconBtn} text-red-400 disabled:opacity-30`} title="Delete"><Trash2 size={14} /></button>
                  </>
                )}
              </div>

              {openId === r.id && (
                <div className="mt-4 flex flex-col gap-4">
                  {!detail || detail.id !== r.id ? (
                    <div className="py-4 flex justify-center"><RotateCw size={18} className="animate-spin opacity-50" /></div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <CopyBtn k={`t${r.id}`} text={transcriptToText(detail)} label="Copy transcript" />
                        {detail.summary && <CopyBtn k={`s${r.id}`} text={summaryToText(detail)} label="Copy summary" />}
                        <button onClick={() => summarise(r.id)} disabled={busy === r.id || r.status === 'recording' || !detail.lines.length}
                          className={`ml-auto px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 bg-gradient-to-r ${gradient} text-white disabled:opacity-40`}>
                          {busy === r.id ? <RotateCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                          {detail.summary ? 'Summarise again' : 'Summarise with AI'}
                        </button>
                      </div>

                      {detail.summary && (
                        <div className={`rounded-xl border p-4 text-xs leading-relaxed ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
                          <div className="font-black uppercase tracking-wider text-[10px] mb-1 opacity-70">Summary</div>
                          <p className="mb-3">{detail.summary.summary}</p>
                          {SECTIONS.map(([key, label]) => detail.summary[key]?.length ? (
                            <div key={key} className="mb-3">
                              <div className="font-black uppercase tracking-wider text-[10px] mb-1 opacity-70">{label}</div>
                              <ul className="list-disc pl-5 space-y-0.5">{detail.summary[key].map((x, i) => <li key={i}>{itemText(x)}</li>)}</ul>
                            </div>
                          ) : null)}
                        </div>
                      )}

                      <div className={`rounded-xl border p-4 max-h-96 overflow-y-auto text-xs leading-relaxed ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
                        <div className="font-black uppercase tracking-wider text-[10px] mb-2 opacity-70">Transcript</div>
                        {detail.lines.length === 0 ? <p className="text-slate-500">Nothing was transcribed yet.</p> : detail.lines.map((l, i) => (
                          <p key={i} className="mb-1.5"><span className="font-mono text-[10px] text-slate-500 mr-2">{l.clock}</span>{l.text}</p>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PortalShell>
  );
}
