// Dev Ideas in the IMS design (24 Oct 2026): ideas for improving IMS, said to Ims ("Ims, dev idea: …") or typed
// here, with screenshots, waiting to be picked up in Claude Code with /ideas. Each idea a card (copy its prompt or
// screenshot, change, done, dismiss); filter by the part of IMS; New idea is the button in the bottom right (paste a
// screenshot straight into it). The same /api/dev-ideas requests as before (Dashboard/DevIdeasPortal.jsx).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ServicePage, { Empty, Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextArea, SelectField, FilterChip, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';
import { useFocusItem } from '../../hooks/useFocusItem';

const STATUS = { new: ['New', ''], picked_up: ['Picked up', 'warn'], done: ['Done', 'good'], dismissed: ['Dismissed', 'quiet'] };
const SOURCE = { desk: 'Said to Ims on the desk', web: 'Said to Ims in the app', page: 'Typed here', claude: 'Added from Claude Code', auto: 'Noticed by IMS' };
const DEFAULTS = ['IMS Desktop', 'IMS ESP32', 'Music Scanner', 'Blood Glucose / Diabetes', 'Run Planner', 'Activities & Training', 'Morning Report', 'Hardware & Firmware', 'Voice & Persona', 'Calendar & Schedule', 'Lists & Memory', 'Campaign Manager', 'Board Games', 'Code Repo Best Practices', 'System Architecture', 'Other'];

function Body() {
  const snack = useSnack();
  const [ideas, setIdeas] = useState(null);
  const [cats, setCats] = useState(DEFAULTS);
  const [cat, setCat] = useState('all');
  const [form, setForm] = useState(null); // { id?, text, category, image }
  const [view, setView] = useState(null); // a screenshot shown large
  const [confirm, setConfirm] = useState(null);
  const fileRef = useRef(null);
  useFocusItem(ideas?.length || 0);

  const load = useCallback(async () => {
    try {
      const d = await (await fetch(cat !== 'all' ? `/api/dev-ideas?category=${encodeURIComponent(cat)}` : '/api/dev-ideas')).json();
      if (d.success) { setIdeas(d.ideas); if (Array.isArray(d.categories)) setCats(d.categories); }
    } catch (e) { setIdeas((x) => x || []); snack(e.message, { error: true }); }
  }, [cat, snack]);
  useEffect(() => { load(); }, [load]);
  const call = async (url, method, body, done) => {
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Something went wrong.');
      if (done) snack(done);
      load();
    } catch (e) { snack(e.message, { error: true }); }
  };
  const readImage = (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { snack('That picture is over 5 MB.', { error: true }); return; }
    const r = new FileReader();
    r.onloadend = () => setForm((f) => (f ? { ...f, image: r.result } : f));
    r.readAsDataURL(file);
  };
  const paste = (e) => { for (const it of e.clipboardData?.items || []) if (it.type.startsWith('image')) { e.preventDefault(); readImage(it.getAsFile()); snack('Screenshot pasted.'); break; } };
  const save = () => {
    if (form.id) call(`/api/dev-ideas/${form.id}`, 'PATCH', { text: form.text, category: form.category, image: form.image }, 'Idea changed.');
    else call('/api/dev-ideas', 'POST', { text: form.text, category: form.category, image: form.image }, 'Idea saved.');
    setForm(null);
  };
  const status = (i, s, word) => call(`/api/dev-ideas/${i.id}`, 'PATCH', { status: s }, word);
  const remove = (i) => setConfirm({ title: 'Delete this idea?', body: i.text, okLabel: 'Delete', danger: true, onOk: () => call(`/api/dev-ideas/${i.id}`, 'DELETE', null, 'Idea deleted.') });
  const copyPrompt = (i) => { navigator.clipboard.writeText(`[Dev Idea #${i.id} - ${i.category || 'Other'}]\n${i.text}${i.image ? `\n\n(Screenshot attached in IMS Dev Ideas #${i.id})` : ''}`); snack('Prompt copied, ready to paste into Claude Code.'); };
  const copyImage = async (url) => { try { const b = await (await fetch(url)).blob(); await navigator.clipboard.write([new ClipboardItem({ [b.type]: b })]); snack('Screenshot copied.'); } catch (e) { snack(`It couldn't be copied: ${e.message}`, { error: true }); } };

  const Idea = (i) => {
    const [w, tone] = STATUS[i.status] || STATUS.new;
    const open = i.status === 'new' || i.status === 'picked_up';
    return (
      <div key={i.id} id={`idea-${i.id}`} className={`imsm-idea ${open ? '' : 'closed'}`}>
        <p className="tx">{i.text}</p>
        {i.image && (
          <div className="pic">
            <button type="button" className="sl" onClick={() => setView(i.image)} aria-label="See the screenshot larger"><img src={i.image} alt="Screenshot with this idea" /></button>
            <Btn kind="text" icon="copy" onClick={() => copyImage(i.image)}>Copy the screenshot</Btn>
          </div>
        )}
        {i.notes && <p className="muted">From Claude Code: {i.notes}</p>}
        <div className="foot">
          <span className={`tag ${tone}`}>{w}</span>
          <span className="tag quiet">{i.category || 'Other'}</span>
          <span className="muted" title={SOURCE[i.source] || ''}>#{i.id} · {new Date(i.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          <span className="grow" />
          <IconButton icon="sparkle" label="Copy the prompt for Claude Code" onClick={() => copyPrompt(i)} />
          {open ? (
            <>
              <IconButton icon="edit" label="Change it" onClick={() => setForm({ id: i.id, text: i.text, category: i.category || 'Other', image: i.image || null })} />
              <IconButton icon="check" label="Mark it done" onClick={() => status(i, 'done', 'Marked done.')} />
              <IconButton icon="close" label="Dismiss it" onClick={() => status(i, 'dismissed', 'Dismissed.')} />
            </>
          ) : <IconButton icon="sync" label="Open it again" onClick={() => status(i, 'new', 'Open again.')} />}
          <IconButton icon="del" label="Delete it" onClick={() => remove(i)} />
        </div>
      </div>
    );
  };

  const open = (ideas || []).filter((i) => i.status === 'new' || i.status === 'picked_up');
  const closed = (ideas || []).filter((i) => i.status === 'done' || i.status === 'dismissed');
  return (
    <>
      <div className="chips wrap">
        <FilterChip on={cat === 'all'} onClick={() => setCat('all')}>Everything</FilterChip>
        {cats.map((c) => <FilterChip key={c} on={cat === c} onClick={() => setCat(cat === c ? 'all' : c)}>{c}</FilterChip>)}
      </div>
      <h2 className="imsm-h2">Waiting ({open.length})</h2>
      {ideas == null ? <div className="imsm-empty"><Spinner /></div> : !open.length ? <Empty icon="bulb" title={cat === 'all' ? 'No ideas waiting' : `No ideas waiting for ${cat}`}>Say "Ims, dev idea: …" to the desk, or use the button in the corner. You can paste a screenshot into it.</Empty>
        : <div className="imsm-list">{open.map(Idea)}</div>}
      {closed.length > 0 && (
        <details className="imsm-fold">
          <summary><Icon n="archive" size={20} /><span>Done and dismissed ({closed.length})</span><Icon n="down" size={22} /></summary>
          <div className="imsm-list" style={{ padding: '0 12px 12px' }}>{closed.map(Idea)}</div>
        </details>
      )}

      <Sheet open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? 'Change this idea' : 'A new idea'}
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setForm(null)}>Cancel</Btn><Btn icon="check" disabled={!form?.text.trim() && !form?.image} onClick={save}>Save</Btn></div>}>
        {form && (
          <div className="imsm-form" onPaste={paste}>
            <TextArea label="The idea" rows={4} value={form.text} onChange={(v) => setForm({ ...form, text: v })} autoFocus placeholder="For example: show tomorrow's first event in the desk footer after 9pm. Paste a screenshot here with Ctrl+V." onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(); }} />
            <SelectField label="Which part of IMS" value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={cats.map((c) => [c, c])} />
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { readImage(e.target.files?.[0]); e.target.value = ''; }} />
            {form.image ? (
              <div className="imsm-attach"><img src={form.image} alt="The screenshot attached" /><IconButton icon="close" label="Remove the screenshot" onClick={() => setForm({ ...form, image: null })} /></div>
            ) : <Btn kind="tonal" icon="image" onClick={() => fileRef.current?.click()}>Attach a screenshot</Btn>}
          </div>
        )}
      </Sheet>
      <Sheet open={Boolean(view)} onClose={() => setView(null)} title="Screenshot" wideWidth="980px">{view && <img src={view} alt="The screenshot, large" style={{ width: '100%', borderRadius: 12 }} />}</Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      <Fab label="New idea" onClick={() => setForm({ text: '', category: cat !== 'all' ? cat : 'Other', image: null })} />
    </>
  );
}

export default function DevIdeas({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Dev Ideas" icon="bulb" accent="orange" theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="Ideas for improving IMS, ready for Claude Code with /ideas.">
      <Body />
    </ServicePage>
  );
}
