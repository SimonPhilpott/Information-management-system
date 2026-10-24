// News Sources in the IMS design (24 Oct 2026): where IMS gathers your news and interests. Each source a card (how much
// it matters, whether it's in the day report, tags Ims uses to pick sources, and what it's reading from it); Add a
// source is the button in the bottom right. The same /api/news requests as before (Dashboard/NewsPortal.jsx).
import React, { useCallback, useEffect, useState } from 'react';
import ServicePage, { Empty, Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextField, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';

const WEIGHT_LABEL = { 1: 'Now and then', 2: 'Minor', 3: 'Normal', 4: 'Important', 5: 'Most important' };
const ITEMS = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4 };

function Weight({ value, onChange }) {
  return (
    <span className="imsm-weight" role="radiogroup" aria-label="How much it matters">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={n === value} className={`sl ${n <= value ? 'on' : ''}`} title={WEIGHT_LABEL[n]} onClick={() => onChange(n)}>{n}</button>
      ))}
    </span>
  );
}

function Genres({ start, onSave }) {
  const [v, setV] = useState(start);
  return <TextField label="Genres" value={v} onChange={setV} help="Matched against each artist's genre in the Music Scanner; leave it empty for any." onBlur={() => v !== start && onSave(v)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />;
}

function Source({ src, onChange, onDelete, onRetag }) {
  const snack = useSnack();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const [name, setName] = useState(src.name);
  const [url, setUrl] = useState(src.url);
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState('');
  const filterKey = JSON.stringify(src.filter || {});
  useEffect(() => { setItems(null); setErr(null); }, [filterKey]);
  useEffect(() => { setUrl(src.url); setItems(null); setErr(null); }, [src.url]);
  useEffect(() => { setName(src.name); }, [src.name]);
  useEffect(() => {
    if (!open || items) return;
    fetch(`/api/news/sources/${src.id}/items`).then((r) => r.json()).then((d) => { if (d.success) setItems(d.items); else setErr(d.error); }).catch((e) => setErr(e.message));
  }, [open, items, src.id]);

  const tags = src.tags || [];
  const addTag = () => { const t = adding.trim().toLowerCase(); if (t && !tags.includes(t)) onChange(src.id, { tags: [...tags, t] }); setAdding(''); };
  const saveUrl = async () => {
    if (!url.trim() || url.trim() === src.url) return;
    setBusy('url');
    if (!(await onChange(src.id, { url: url.trim() }))) setUrl(src.url);
    setBusy('');
  };
  const retag = async () => { setBusy('tag'); await onRetag(src.id); setBusy(''); snack('Tags suggested from the latest headlines.'); };
  const lib = Boolean(src.filter?.libraryOnly);

  return (
    <div className="imsm-src">
      <div className="top">
        <span className={`lead ${src.kind === 'feed' ? 'feed' : ''}`} title={src.kind === 'feed' ? 'Read from its feed' : 'Headlines read from the page'}><Icon n={src.kind === 'feed' ? 'rss' : 'public'} size={22} /></span>
        <span className="txt">
          <input className="nm" value={name} aria-label="Name" onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== src.name && onChange(src.id, { name })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          <small>{WEIGHT_LABEL[src.weight]}: {ITEMS[src.weight]} item{ITEMS[src.weight] === 1 ? '' : 's'} in the report</small>
        </span>
        <IconButton icon="open" label={`Open ${src.name}`} onClick={() => window.open(src.url, '_blank', 'noreferrer')} />
        <IconButton icon="del" label={`Remove ${src.name}`} onClick={() => onDelete(src)} />
      </div>
      <div className="ctl">
        <Weight value={src.weight} onChange={(w) => onChange(src.id, { weight: w })} />
        <label className="rep"><span className="imsm-switch"><input type="checkbox" checked={src.inReport} onChange={(e) => onChange(src.id, { inReport: e.target.checked })} /><i /></span>In the day report</label>
      </div>
      <div className="tags">
        {tags.map((t) => (
          <span key={t} className="chip">{t}<button type="button" aria-label={`Remove the tag ${t}`} onClick={() => onChange(src.id, { tags: tags.filter((x) => x !== t) })}><Icon n="close" size={14} /></button></span>
        ))}
        <input className="addtag" value={adding} placeholder="Add a tag" aria-label="Add a tag" onChange={(e) => setAdding(e.target.value)} onBlur={addTag} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }} />
        <Btn kind="text" icon="sparkle" busy={busy === 'tag'} onClick={retag}>Suggest</Btn>
      </div>
      {src.lastError && <p className="bad"><Icon n="warn" size={16} />The last try failed: {src.lastError}</p>}
      <details className="more" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary><span>What IMS is reading from it</span><Icon n="down" size={22} /></summary>
        <div className="in">
          <div className="imsm-ask">
            <TextField label="Address" value={url} onChange={setUrl} onKeyDown={(e) => e.key === 'Enter' && saveUrl()} help={src.feedUrl && src.feedUrl !== src.url ? `Reading its feed: ${src.feedUrl}` : undefined} />
            <Btn kind="tonal" busy={busy === 'url'} disabled={busy === 'url' || !url.trim() || url.trim() === src.url} onClick={saveUrl}>Save</Btn>
          </div>
          <label className="rep"><span className="imsm-switch"><input type="checkbox" checked={lib} onChange={async (e) => { await onChange(src.id, { filter: { libraryOnly: e.target.checked, genres: src.filter?.genres?.length ? src.filter.genres : ['metal', 'rock', 'desert'] } }); setItems(null); }} /><i /></span>Only stories about bands in my MUZAK collection</label>
          {lib && (
            <Genres key={(src.filter.genres || []).join(',')} start={(src.filter.genres || []).join(', ')} onSave={async (v) => { await onChange(src.id, { filter: { libraryOnly: true, genres: v.split(',') } }); setItems(null); }} />
          )}
          {!items && !err && <Spinner />}
          {err && <p className="bad">{err}</p>}
          {items && !items.length && <p className="muted">Nothing there right now.</p>}
          {items && items.length > 0 && (
            <ul className="heads">
              {items.map((i) => (
                <li key={i.headline}>
                  {i.link ? <a href={i.link} target="_blank" rel="noreferrer">{i.headline}</a> : <b>{i.headline}</b>}
                  {i.artist && <span className="tag good">{i.artist}</span>}
                  {i.summary && <p>{i.summary}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}

function Body() {
  const snack = useSnack();
  const [sources, setSources] = useState(null);
  const [form, setForm] = useState(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const load = useCallback(async () => {
    try { const d = await (await fetch('/api/news/sources')).json(); if (d.success) setSources(d.sources); } catch (e) { setSources((s) => s || []); snack(e.message, { error: true }); }
  }, [snack]);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    setAdding(true);
    try {
      const d = await (await fetch('/api/news/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })).json();
      if (!d.success) throw new Error(d.error);
      setForm(null);
      snack(`Added ${d.source.name}: ${d.source.kind === 'feed' ? 'it found its feed' : 'reading the headlines from the page'}.`);
      load();
    } catch (e) { snack(e.message, { error: true }); }
    setAdding(false);
  };
  const change = async (id, patch) => {
    try {
      const d = await (await fetch(`/api/news/sources/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })).json();
      if (!d.success) throw new Error(d.error);
      setSources((s) => s.map((x) => (x.id === id ? d.source : x)).sort((a, b) => b.weight - a.weight || a.id - b.id));
      if (patch.url) snack(`Address changed: ${d.source.kind === 'feed' ? 'it found its feed' : 'reading the headlines from the page'}.`);
      return true;
    } catch (e) { snack(e.message, { error: true }); return false; }
  };
  const retag = async (id) => {
    const d = await (await fetch(`/api/news/sources/${id}/autotag`, { method: 'POST' })).json();
    if (d.success) setSources((s) => s.map((x) => (x.id === id ? d.source : x))); else snack(d.error, { error: true });
  };
  const remove = (src) => setConfirm({ title: `Remove ${src.name}?`, body: 'Ims stops reading it, and it leaves the day report.', okLabel: 'Remove', danger: true, onOk: async () => { await fetch(`/api/news/sources/${src.id}`, { method: 'DELETE' }); snack(`${src.name} removed.`); load(); } });

  const inReport = (sources || []).filter((s) => s.inReport).length;
  return (
    <>
      <details className="imsm-fold">
        <summary><Icon n="info" size={20} /><span>How sources work</span><Icon n="down" size={22} /></summary>
        <div style={{ padding: '0 16px 16px' }}>
          <p>Sources switched on go into your day report. The 1 to 5 buttons set how much each matters: 5 gets four items and comes first, 1 gets one.</p>
          <p>Tags say what a source covers. They're suggested for you and you can change them; Ims uses them to find the right sources when you ask about a subject, like "Hey Ims, any metal news?". Any source can also be asked for by name: "Hey Ims, anything new on Dicebreaker?"</p>
        </div>
      </details>
      <h2 className="imsm-h2">Your sources{sources ? ` (${sources.length}, ${inReport} in the report)` : ''}</h2>
      {sources == null ? <div className="imsm-empty"><Spinner /></div> : !sources.length ? <Empty icon="news" title="No sources yet">Add a news site, a blog, a forum or a feed with the button in the corner.</Empty> : (
        <div className="imsm-list">{sources.map((s) => <Source key={s.id} src={s} onChange={change} onDelete={remove} onRetag={retag} />)}</div>
      )}
      <Sheet open={Boolean(form)} onClose={() => !adding && setForm(null)} title="Add a source"
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setForm(null)}>Cancel</Btn><Btn icon="add" busy={adding} disabled={adding || !form?.url.trim()} onClick={add}>Add it</Btn></div>}>
        {form && (
          <div className="imsm-form">
            <p className="muted" style={{ margin: 0 }}>Paste any web address: a news site, a blog, a forum, a hobby site or an RSS feed. IMS finds the site's feed if it has one; if not, it reads the headlines off the page.</p>
            <TextField label="Web address" value={form.url} onChange={(v) => setForm({ ...form, url: v })} autoFocus inputMode="url" placeholder="https://" onKeyDown={(e) => e.key === 'Enter' && form.url.trim() && add()} />
            <TextField label="Name (optional)" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          </div>
        )}
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      <Fab label="Add a source" onClick={() => setForm({ url: '', name: '' })} />
    </>
  );
}

export default function News({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="News Sources" icon="news" accent="sky" theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="Where IMS gathers your news and interests for the day report and when you ask.">
      <Body />
    </ServicePage>
  );
}
