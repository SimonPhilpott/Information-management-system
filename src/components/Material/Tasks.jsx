// Tasks in the IMS design (24 Oct 2026): things Ims looks into in the background. Each task a card that opens to its
// findings (with sources), drafts to copy; New task is the button in the bottom right. The same /api/tasks
// requests as before (Dashboard/TasksPortal.jsx); the page refreshes itself while anything is still working.
import React, { useCallback, useEffect, useState } from 'react';
import ServicePage, { Empty, Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextArea, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';
import { useFocusItem } from '../../hooks/useFocusItem';
import Prose from '../Dashboard/Prose';

const STATUS = { queued: ['Waiting to start', 'quiet', 'timer'], running: ['Working on it', 'warn', 'sync'], done: ['Done', 'good', 'check'], failed: ['Didn\'t work', 'bad', 'close'] };
const when = (t) => (t ? new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

function Task({ t, onRerun, onDelete, snack }) {
  const [open, setOpen] = useState(false);
  const draft = t.kind === 'draft';
  const [word, tone, icon] = draft ? ['Draft', 'good', 'doc'] : STATUS[t.status] || STATUS.queued;
  return (
    <div id={`task-${t.id}`} className={`imsm-task ${open ? 'open' : ''}`}>
      <button type="button" className="hd sl" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`lead ${tone}`}><Icon n={icon} size={22} /></span>
        <span className="txt">
          <b>{String(t.title || '').replace(/\*\*/g, '')}</b>
          <span className="meta">{when(t.createdAt)}{t.origin === 'desk' ? ', asked on the desk' : t.origin === 'web' ? ', asked Ims' : ''}</span>
          {!open && t.status === 'done' && t.summary && <span className="meta sum">{t.summary}</span>}
        </span>
        <span className={`tag ${tone}`}>{word}</span>
        <Icon n="down" size={22} />
      </button>
      {open && (
        <div className="bd">
          <p className="muted"><b>You asked:</b> {t.request}</p>
          {t.status === 'done' && <>
            {t.summary && <p className="sumlead">{t.summary}</p>}
            <Prose text={t.result} className="imsm-prose" />
            {t.sources?.length > 0 && <div className="chips wrap">{t.sources.map((s) => <a key={s.url} className="chip sl" href={s.url} target="_blank" rel="noreferrer"><Icon n="open" size={16} />{s.title}</a>)}</div>}
          </>}
          {t.status === 'failed' && <p className="err">{t.error}</p>}
          {(t.status === 'queued' || t.status === 'running') && <p className="muted">Still working on it. This usually takes under a minute, and the page updates by itself.</p>}
          <div className="imsm-row">
            {draft && <Btn kind="tonal" icon="copy" onClick={() => { navigator.clipboard?.writeText(t.result || ''); snack('Copied.'); }}>Copy</Btn>}
            {!draft && (t.status === 'done' || t.status === 'failed') && <Btn kind="tonal" icon="sync" onClick={() => onRerun(t)}>Run it again</Btn>}
            <span className="grow" />
            <IconButton icon="del" label={`Delete ${t.title}`} onClick={() => onDelete(t)} />
          </div>
        </div>
      )}
    </div>
  );
}

function Body() {
  const snack = useSnack();
  const [tasks, setTasks] = useState(null);
  useFocusItem(tasks?.length || 0); // Ctrl+K search results land on #task-<id>
  const [asking, setAsking] = useState(false);
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const load = useCallback(async () => { try { const d = await (await fetch('/api/tasks')).json(); if (d.success) setTasks(d.tasks); } catch { setTasks((x) => x || []); } }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!tasks?.some((t) => t.status === 'queued' || t.status === 'running')) return undefined;
    const i = setInterval(load, 4000);
    return () => clearInterval(i);
  }, [tasks, load]);
  const start = async () => {
    setBusy(true);
    try {
      const d = await (await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request }) })).json();
      if (!d.success) throw new Error(d.error || 'It couldn\'t be started.');
      setRequest(''); setAsking(false); snack(`Started: ${d.task.title}`); load();
    } catch (e) { snack(e.message, { error: true }); } finally { setBusy(false); }
  };
  const rerun = async (t) => { await fetch(`/api/tasks/${t.id}/rerun`, { method: 'POST' }); snack(`Running ${t.title} again.`); load(); };
  const remove = (t) => setConfirm({ title: `Delete "${t.title}"?`, body: 'What Ims found goes too.', okLabel: 'Delete', danger: true, onOk: async () => { await fetch(`/api/tasks/${t.id}`, { method: 'DELETE' }); load(); } });

  return (
    <>
      {tasks == null ? <div className="imsm-empty"><Spinner /></div> : !tasks.length ? <Empty icon="checklist" title="No tasks yet">Ask Ims to look into something in the background, with the button in the corner or by saying "Hey IMS, look into … in the background".</Empty> : (
        <div className="imsm-list">{tasks.map((t) => <Task key={t.id} t={t} onRerun={rerun} onDelete={remove} snack={snack} />)}</div>
      )}
      <Sheet open={asking} onClose={() => setAsking(false)} title="A new task"
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setAsking(false)}>Cancel</Btn><Btn icon="sparkle" busy={busy} disabled={!request.trim()} onClick={start}>Start</Btn></div>}>
        <div className="imsm-form">
          <p className="muted" style={{ margin: 0 }}>Ims looks into it in the background (with web search) while you get on. Ask him later how it went, or come back here.</p>
          <TextArea label="What should Ims look into?" rows={4} value={request} onChange={setRequest} autoFocus
            placeholder="For example: find out which of my bands are playing Leeds, Sheffield or Manchester next year"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && request.trim()) { e.preventDefault(); start(); } }} />
        </div>
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      <Fab label="New task" onClick={() => setAsking(true)} />
    </>
  );
}

export default function Tasks({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Tasks" icon="checklist" accent="teal" theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="Things Ims is looking into for you.">
      <Body />
    </ServicePage>
  );
}
