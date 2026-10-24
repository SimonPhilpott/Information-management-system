// Recordings in the IMS design (24 Oct 2026): calls and meetings Ims records silently. A recording in progress at
// the top; each recording a card that opens to its AI summary and transcript (copy either, summarise again,
// rename, delete). The button in the bottom right starts a recording (asking who it's with) or, while one is
// running, stops it. The same /api/recordings requests as before (Dashboard/RecordingsPortal.jsx), kept in step every
// few seconds since a recording can be started or stopped by voice.
import React, { useCallback, useEffect, useState } from 'react';
import ServicePage, { Empty, Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextField, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';
import { useFocusItem } from '../../hooks/useFocusItem';

const fmtDate = (ms) => new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtDur = (s) => { if (s == null) return ''; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return h ? `${h} h ${m} min` : m ? `${m} min ${sec} s` : `${sec} s`; };
const SECTIONS = [['actionItems', 'Action items'], ['followUpQuestions', 'Follow-up questions'], ['keyPoints', 'Key points'], ['decisions', 'Decisions'], ['risksOrConcerns', 'Risks and concerns'], ['suggestedNextSteps', 'Suggested next steps']];
const itemText = (it) => (typeof it === 'string' ? it : [it.task, it.owner && `(${it.owner})`, it.due && `, due ${it.due}`].filter(Boolean).join(' '));
const transcriptText = (r) => r.lines.map((l) => `[${l.clock}] ${l.text}`).join('\n');
const summaryText = (r) => { const s = r.summary; if (!s) return ''; const parts = [`Summary\n${s.summary || ''}`]; for (const [k, l] of SECTIONS) if (s[k]?.length) parts.push(`${l}\n${s[k].map((x) => `- ${itemText(x)}`).join('\n')}`); return parts.join('\n\n'); };
const api = async (url, opts) => { const r = await fetch(url, opts); const d = await r.json().catch(() => ({})); if (!r.ok || d.success === false) throw new Error(d.error || 'That didn\'t work.'); return d; };
const post = (url, method = 'POST', body) => api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

function Body() {
  const snack = useSnack();
  const [list, setList] = useState(null);
  const [status, setStatus] = useState({ active: false });
  useFocusItem(list?.length || 0);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(null);
  const [asking, setAsking] = useState(false);
  const [who, setWho] = useState('');
  const [rename, setRename] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [, tick] = useState(0);

  const load = useCallback(async () => { try { const d = await api('/api/recordings'); setList(d.recordings || []); setStatus(d.status || { active: false }); } catch (e) { setList((x) => x || []); snack(e.message, { error: true }); } }, [snack]);
  useEffect(() => { load(); const t = setInterval(() => { load(); tick((n) => n + 1); }, 4000); return () => clearInterval(t); }, [load]);

  const open = async (id) => {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id); setDetail(null);
    try { setDetail((await api(`/api/recordings/${id}`)).recording); } catch (e) { snack(e.message, { error: true }); }
  };
  const start = async () => { try { await post('/api/recordings/start', 'POST', { withWhom: who }); setWho(''); setAsking(false); snack('Recording. Ims is silent now.'); load(); } catch (e) { snack(e.message, { error: true }); } };
  const stop = async () => { try { await post('/api/recordings/stop'); snack('Recording saved.'); load(); } catch (e) { snack(e.message, { error: true }); } };
  const summarise = async (id) => { setBusy(id); try { setDetail((await post(`/api/recordings/${id}/summarise`)).recording); load(); } catch (e) { snack(e.message, { error: true }); } finally { setBusy(null); } };
  const remove = (r) => setConfirm({ title: `Delete the recording with ${r.withWhom}?`, body: 'The transcript and summary go too.', okLabel: 'Delete', danger: true, onOk: async () => { try { await api(`/api/recordings/${r.id}`, { method: 'DELETE' }); if (openId === r.id) { setOpenId(null); setDetail(null); } load(); } catch (e) { snack(e.message, { error: true }); } } });
  const saveName = async () => { try { await post(`/api/recordings/${rename.id}`, 'PUT', { withWhom: rename.value }); if (detail?.id === rename.id) setDetail({ ...detail, withWhom: rename.value }); setRename(null); load(); } catch (e) { snack(e.message, { error: true }); } };
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); snack(`${what} copied.`); } catch { snack('Your browser didn\'t allow copying.', { error: true }); } };

  return (
    <>
      <div className="imsm-banner info"><Icon n="mic" size={20} /><span>Say <b>"Ims, record this call"</b> and tell him who it's with. Ims is completely silent (no speech, alarms or sounds) until you say <b>"Ims stop"</b>. Your words are picked up reliably; the other person only if they come through your speaker.</span></div>
      {status.active && (
        <div className="imsm-live">
          <span className="dot" />
          <span className="txt"><b>Recording with {status.withWhom}</b><span className="meta">Started {fmtDate(status.startedAt)}, {fmtDur(Math.max(0, Math.round((Date.now() - status.startedAt) / 1000)))} so far. Ims is silent.</span></span>
        </div>
      )}
      {list == null ? <div className="imsm-empty"><Spinner /></div> : !list.length ? <Empty icon="mic" title="No recordings yet" /> : (
        <div className="imsm-list">
          {list.map((r) => (
            <div key={r.id} id={`recording-${r.id}`} className={`imsm-task ${openId === r.id ? 'open' : ''}`}>
              <button type="button" className="hd sl" onClick={() => open(r.id)} aria-expanded={openId === r.id}>
                <span className={`lead ${r.status === 'recording' ? 'bad' : ''}`}><Icon n="mic" size={22} /></span>
                <span className="txt">
                  <b>{r.withWhom}</b>
                  <span className="meta">{fmtDate(r.startedAt)}{r.durationSec != null ? `, ${fmtDur(r.durationSec)}` : ''}, {r.wordCount} words</span>
                </span>
                {r.status === 'recording' && <span className="tag bad">Recording now</span>}
                {r.status === 'interrupted' && <span className="tag warn">Interrupted</span>}
                {r.summary && <span className="tag good">Summarised</span>}
                <Icon n="down" size={22} />
              </button>
              {openId === r.id && (
                <div className="bd">
                  {!detail || detail.id !== r.id ? <Spinner /> : (
                    <>
                      <div className="imsm-row">
                        <Btn kind="tonal" icon="copy" onClick={() => copy(transcriptText(detail), 'The transcript')}>Copy the transcript</Btn>
                        {detail.summary && <Btn kind="tonal" icon="copy" onClick={() => copy(summaryText(detail), 'The summary')}>Copy the summary</Btn>}
                        <span className="grow" />
                        <IconButton icon="edit" label="Change who it was with" onClick={() => setRename({ id: r.id, value: r.withWhom })} />
                        <IconButton icon="del" label="Delete this recording" onClick={() => remove(r)} disabled={r.status === 'recording'} />
                        <Btn icon="sparkle" busy={busy === r.id} disabled={r.status === 'recording' || !detail.lines.length} onClick={() => summarise(r.id)}>{detail.summary ? 'Summarise again' : 'Summarise it'}</Btn>
                      </div>
                      {detail.summary && (
                        <div className="imsm-card">
                          <h3>Summary</h3>
                          <p style={{ margin: 0 }}>{detail.summary.summary}</p>
                          {SECTIONS.map(([k, l]) => detail.summary[k]?.length ? <div key={k}><b className="imsm-label">{l}</b><ul className="imsm-ul">{detail.summary[k].map((x, i) => <li key={i}>{itemText(x)}</li>)}</ul></div> : null)}
                        </div>
                      )}
                      <div className="imsm-card imsm-transcript">
                        <h3>Transcript</h3>
                        {!detail.lines.length ? <p className="muted">Nothing was transcribed yet.</p> : detail.lines.map((l, i) => <p key={i}><span className="clock">{l.clock}</span>{l.text}</p>)}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Sheet open={asking} onClose={() => setAsking(false)} title="Record a call or meeting"
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setAsking(false)}>Cancel</Btn><Btn icon="mic" disabled={!who.trim()} onClick={start}>Start recording</Btn></div>}>
        <div className="imsm-form"><TextField label="Who is it with?" value={who} onChange={setWho} autoFocus onKeyDown={(e) => { if (e.key === 'Enter' && who.trim()) start(); }} /></div>
      </Sheet>
      <Sheet open={Boolean(rename)} onClose={() => setRename(null)} title="Who it was with"
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setRename(null)}>Cancel</Btn><Btn icon="check" onClick={saveName}>Save</Btn></div>}>
        {rename && <div className="imsm-form"><TextField label="Who it was with" value={rename.value} onChange={(v) => setRename({ ...rename, value: v })} autoFocus /></div>}
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      {status.active ? <Fab label="Stop recording" icon="stop" onClick={stop} /> : <Fab label="Record" icon="mic" onClick={() => setAsking(true)} />}
    </>
  );
}

export default function Recordings({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Recordings" icon="mic" accent="red" theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="Call and meeting transcripts, with AI summaries.">
      <Body />
    </ServicePage>
  );
}
