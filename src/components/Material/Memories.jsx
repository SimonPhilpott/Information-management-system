// Memories in the IMS design (24 Oct 2026): everything Ims remembers. Search, a chip for each kind (with counts),
// each memory a card (copy, change, move to the archive); the archive restores them. Add a memory is the button in the
// bottom right, with examples to start from. The same /api/memories requests as before (Dashboard/MemoriesPortal.jsx).
import React, { useCallback, useEffect, useState } from 'react';
import ServicePage, { ItemCard, Empty, Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextArea, SelectField, Tabs, FilterChip, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';
import { useFocusItem } from '../../hooks/useFocusItem';

const KINDS = {
  pronunciation: ['Pronunciation', 'mic'], phrase: ['Phrases', 'note'], general: ['General', 'bulb'], item_location: ['Where things are', 'place'],
  preference: ['Preferences', 'fav'], personal: ['Personal', 'person'], work: ['Work and projects', 'doc'],
};
const EXAMPLES = [
  ['Pronounce "reet" with a long "ee", rhyming with "fleet", never "ret".', 'pronunciation'],
  ['The spare car keys are in the small top drawer in the hallway.', 'item_location'],
  ['Likes strong Yorkshire Gold tea with a splash of milk, no sugar.', 'preference'],
  ['The passports are in the metal fireproof safe.', 'item_location'],
];
const date = (t) => (t ? new Date(String(t).replace(' ', 'T') + (String(t).includes('Z') || String(t).includes('+') ? '' : 'Z')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const json = async (url, opts) => { const r = await fetch(url, opts); const d = await r.json().catch(() => ({})); if (!r.ok || d.success === false) throw new Error(d.error || 'That didn\'t work.'); return d; };

function Body() {
  const snack = useSnack();
  const [list, setList] = useState(null);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [tab, setTab] = useState('all');
  const [archived, setArchived] = useState([]);
  const [aq, setAq] = useState('');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  useFocusItem(list?.length || 0);

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (q.trim()) p.append('search', q.trim());
    if (kind !== 'all') p.append('category', kind);
    p.append('limit', '300');
    try { const d = await json(`/api/memories?${p}`); setList(d.memories || []); setTotal(d.total || 0); setCounts(d.categories || {}); } catch (e) { setList((x) => x || []); snack(e.message, { error: true }); }
  }, [q, kind, snack]);
  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);
  const loadArchive = useCallback(async () => { try { setArchived((await json(`/api/memories/archive?search=${encodeURIComponent(aq)}`)).memories || []); } catch { /* stays */ } }, [aq]);
  useEffect(() => { if (tab === 'archive') loadArchive(); }, [tab, loadArchive]);

  const save = async () => {
    if (!form.fact.trim()) return;
    setSaving(true);
    try {
      await json(form.id ? `/api/memories/${form.id}` : '/api/memories', { method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fact: form.fact.trim(), category: form.category }) });
      snack(form.id ? 'Memory changed.' : 'Ims will remember that.'); setForm(null); load();
    } catch (e) { snack(e.message, { error: true }); } finally { setSaving(false); }
  };
  const remove = (m) => setConfirm({
    title: 'Move this memory to the archive?', body: m.fact, okLabel: 'Move it', danger: true,
    onOk: async () => {
      try {
        await json(`/api/memories/${m.id}`, { method: 'DELETE' }); load();
        snack('Moved to the archive.', { action: { label: 'Undo', onClick: async () => { await json(`/api/memories/${m.id}/restore`, { method: 'POST' }).catch(() => {}); load(); } } });
      } catch (e) { snack(e.message, { error: true }); }
    },
  });
  const restore = async (m) => { try { await json(`/api/memories/${m.id}/restore`, { method: 'POST' }); snack('Memory back.'); loadArchive(); load(); } catch (e) { snack(e.message, { error: true }); } };
  const copy = (t) => { navigator.clipboard?.writeText(t); snack('Copied.'); };
  const kindOf = (c) => KINDS[c] || [c ? c[0].toUpperCase() + c.slice(1).replace(/_/g, ' ') : 'General', 'bulb'];

  return (
    <>
      <Tabs value={tab} onChange={setTab} tabs={[['all', `Memories (${total})`, 'bulb'], ['archive', 'Archive', 'archive']]} />
      {tab === 'all' && (
        <>
          <div className="search"><Icon n="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search what Ims remembers" aria-label="Search memories" />{q && <IconButton icon="close" label="Clear the search" onClick={() => setQ('')} />}</div>
          <div className="chips wrap">
            <FilterChip on={kind === 'all'} onClick={() => setKind('all')}>Everything</FilterChip>
            {Object.entries(counts).map(([k, n]) => <FilterChip key={k} on={kind === k} onClick={() => setKind(kind === k ? 'all' : k)} lead={<Icon n={kindOf(k)[1]} size={18} />} count={n}>{kindOf(k)[0]}</FilterChip>)}
          </div>
          {list == null ? <div className="imsm-empty"><Spinner /></div> : !list.length ? <Empty icon="bulb" title={q || kind !== 'all' ? 'Nothing matches' : 'Ims doesn\'t remember anything yet'}>Tell him "remember that…", or add one with the button in the corner.</Empty> : (
            <div className="imsm-list">
              {list.map((m, i) => {
                const [word, icon] = kindOf(m.category);
                return (
                  <div key={m.id} id={`memory-${m.id}`}>
                    <ItemCard icon={icon} title={m.fact} style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                      meta={`Remembered ${date(m.created_at)}${m.updated_at && m.updated_at !== m.created_at ? `, changed ${date(m.updated_at)}` : ''}`}
                      tags={<span className="tag">{word}</span>}>
                      <IconButton icon="copy" label="Copy it" onClick={() => copy(m.fact)} />
                      <IconButton icon="edit" label="Change it" onClick={() => setForm({ id: m.id, fact: m.fact, category: m.category || 'general' })} />
                      <IconButton icon="del" label="Move it to the archive" onClick={() => remove(m)} />
                    </ItemCard>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      {tab === 'archive' && (
        <>
          <div className="search"><Icon n="search" /><input value={aq} onChange={(e) => setAq(e.target.value)} placeholder="Search the archive" aria-label="Search the archive" /></div>
          {!archived.length ? <Empty icon="archive" title="Nothing in the archive" /> : (
            <div className="imsm-list">
              {archived.map((m) => (
                <ItemCard key={m.id} icon={kindOf(m.category)[1]} tone="quiet" title={m.fact} meta={`Archived ${date(m.deleted_at)}`} tags={<span className="tag quiet">{kindOf(m.category)[0]}</span>}>
                  <Btn kind="tonal" icon="sync" onClick={() => restore(m)}>Put it back</Btn>
                </ItemCard>
              ))}
            </div>
          )}
        </>
      )}

      <Sheet open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? 'Change this memory' : 'Something for Ims to remember'}
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setForm(null)}>Cancel</Btn><Btn icon="check" busy={saving} disabled={!form?.fact.trim()} onClick={save}>Save</Btn></div>}>
        {form && (
          <div className="imsm-form">
            <TextArea label="What to remember" rows={4} value={form.fact} onChange={(v) => setForm({ ...form, fact: v })} autoFocus />
            <SelectField label="Kind" value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={Object.entries(KINDS).map(([k, [l]]) => [k, l])} />
            {!form.id && (
              <div>
                <span className="imsm-label">For example</span>
                <div className="chips wrap">{EXAMPLES.map(([f, c]) => <button key={f} type="button" className="chip sl" style={{ height: 'auto', padding: '8px 12px', textAlign: 'left' }} onClick={() => setForm({ ...form, fact: f, category: c })}>{f}</button>)}</div>
              </div>
            )}
          </div>
        )}
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      {tab === 'all' && <Fab label="Add a memory" onClick={() => setForm({ fact: '', category: 'general' })} />}
    </>
  );
}

export default function Memories({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Memories" icon="bulb" accent="blue" theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="Everything Ims remembers: change or archive anything here.">
      <Body />
    </ServicePage>
  );
}
