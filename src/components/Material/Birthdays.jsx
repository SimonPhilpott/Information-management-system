// Birthdays in the IMS design (24 Oct 2026). Coming up first, today's and this week's highlighted; the archive with
// the last month's and the deleted ones (restore them); Add a birthday is the button in the bottom right. The same
// /api/birthdays requests as before (Dashboard/BirthdayPortal.jsx).
import React, { useCallback, useEffect, useState } from 'react';
import ServicePage, { ItemCard, Empty, Fab } from './ServicePage';
import { IconButton, Btn, Sheet, TextField, SelectField, Tabs, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const daysIn = (m) => new Date(2024, m, 0).getDate();
const json = async (url, opts) => { const r = await fetch(url, { credentials: 'same-origin', ...opts }); const d = await r.json().catch(() => ({})); if (!r.ok || d.success === false) throw new Error(d.error || 'That didn\'t work. Try again.'); return d; };

function Body() {
  const snack = useSnack();
  const [list, setList] = useState(null);
  const [tab, setTab] = useState('coming');
  const [archive, setArchive] = useState({ deleted: [], recentlyPassed: [] });
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => { try { setList((await json('/api/birthdays')).birthdays || []); } catch (e) { setList([]); snack(e.message, { error: true }); } }, [snack]);
  useEffect(() => { load(); }, [load]);
  const loadArchive = useCallback(async () => { try { const d = await json('/api/birthdays/archive'); setArchive({ deleted: d.deleted || [], recentlyPassed: d.recentlyPassed || [] }); } catch (e) { snack(e.message, { error: true }); } }, [snack]);
  useEffect(() => { if (tab === 'archive') loadArchive(); }, [tab, loadArchive]);

  const save = async () => {
    if (!form.name.trim()) { snack('Add their name first.', { error: true }); return; }
    try {
      await json(form.id ? `/api/birthdays/${form.id}` : '/api/birthdays', { method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), relationship: form.relationship, month: Number(form.month), day: Number(form.day), birthYear: form.birthYear ? Number(form.birthYear) : null }) });
      snack(form.id ? `${form.name}'s birthday changed.` : `${form.name}'s birthday added.`); setForm(null); load();
    } catch (e) { snack(e.message, { error: true }); }
  };
  const remove = (b) => setConfirm({
    title: `Move ${b.name}'s birthday to the archive?`, body: 'You can put it back from the archive.', okLabel: 'Move it', danger: true,
    onOk: async () => {
      try {
        await json(`/api/birthdays/${b.id}`, { method: 'DELETE' }); load();
        snack(`${b.name}'s birthday is in the archive.`, { action: { label: 'Undo', onClick: async () => { await json(`/api/birthdays/${b.id}/restore`, { method: 'POST' }).catch(() => {}); load(); } } });
      } catch (e) { snack(e.message, { error: true }); }
    },
  });
  const restore = async (b) => { try { await json(`/api/birthdays/${b.id}/restore`, { method: 'POST' }); snack(`${b.name}'s birthday is back.`); loadArchive(); load(); } catch (e) { snack(e.message, { error: true }); } };

  return (
    <>
      <Tabs value={tab} onChange={setTab} tabs={[['coming', list ? `Coming up (${list.length})` : 'Coming up', 'cake'], ['archive', 'Archive', 'archive']]} />
      {tab === 'coming' && (list == null ? <div className="imsm-empty"><Spinner /></div> : !list.length ? <Empty icon="cake" title="No birthdays yet">Add one with the button in the corner. A cake shows in IMS in the week before each one.</Empty> : (
        <div className="imsm-list">
          {list.map((b, i) => (
            <ItemCard key={b.id} icon="cake" tone={b.isToday ? '' : b.daysUntil <= 7 ? 'warn' : 'quiet'} title={b.name} style={{ animationDelay: `${i * 25}ms` }}
              meta={`${b.day} ${MONTHS[b.month - 1]}${b.turningAge ? `, turning ${b.turningAge}` : ''}`}
              tags={<>
                {b.isToday && <span className="tag good">Today</span>}
                {!b.isToday && b.daysUntil <= 7 && <span className="tag warn">In {b.daysUntil} day{b.daysUntil === 1 ? '' : 's'}</span>}
                {!b.isToday && b.daysUntil > 7 && <span className="tag quiet">In {b.daysUntil} days</span>}
                {b.relationship && <span className="tag">{b.relationship}</span>}
              </>}>
              <IconButton icon="edit" label={`Change ${b.name}'s birthday`} onClick={() => setForm({ id: b.id, name: b.name, relationship: b.relationship || '', month: b.month, day: b.day, birthYear: b.birthYear || '' })} />
              <IconButton icon="del" label={`Move ${b.name}'s birthday to the archive`} onClick={() => remove(b)} />
            </ItemCard>
          ))}
        </div>
      ))}
      {tab === 'archive' && (
        <>
          <h2 className="imsm-h2">In the last month</h2>
          {!archive.recentlyPassed.length ? <p className="muted">None in the last 30 days.</p> : (
            <div className="imsm-list">{archive.recentlyPassed.map((b) => (
              <ItemCard key={b.id} icon="cake" tone="quiet" title={b.name} meta={`${b.day} ${MONTHS[b.month - 1]}${b.turnedAge ? `, turned ${b.turnedAge}` : ''}. ${b.daysSince} day${b.daysSince === 1 ? '' : 's'} ago.`}
                tags={b.relationship ? <span className="tag quiet">{b.relationship}</span> : null} />
            ))}</div>
          )}
          <h2 className="imsm-h2">Deleted</h2>
          {!archive.deleted.length ? <p className="muted">Nothing has been deleted.</p> : (
            <div className="imsm-list">{archive.deleted.map((b) => (
              <ItemCard key={b.id} icon="cake" tone="quiet" title={b.name}
                meta={`${b.day} ${MONTHS[b.month - 1]}${b.birthYear ? `, born ${b.birthYear}` : ''}. Deleted ${new Date(b.deletedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`}>
                <Btn kind="tonal" icon="sync" onClick={() => restore(b)}>Put it back</Btn>
              </ItemCard>
            ))}</div>
          )}
        </>
      )}

      <Sheet open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? `Change ${form.name}'s birthday` : 'Add a birthday'}
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setForm(null)}>Cancel</Btn><Btn icon="check" onClick={save}>Save</Btn></div>}>
        {form && (
          <div className="imsm-form">
            <TextField label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} autoFocus />
            <TextField label="Who they are to you" value={form.relationship} onChange={(v) => setForm({ ...form, relationship: v })} help="For example Dad, son, sister-in-law, friend" />
            <div className="two">
              <SelectField label="Month" value={String(form.month)} onChange={(v) => setForm({ ...form, month: Number(v), day: Math.min(form.day, daysIn(Number(v))) })} options={MONTHS.map((m, i) => [String(i + 1), m])} />
              <SelectField label="Day" value={String(form.day)} onChange={(v) => setForm({ ...form, day: Number(v) })} options={Array.from({ length: daysIn(Number(form.month)) }, (_, i) => [String(i + 1), String(i + 1)])} />
              <TextField label="Year born (optional)" type="number" inputMode="numeric" value={form.birthYear} onChange={(v) => setForm({ ...form, birthYear: v })} help="Then Ims knows how old they're turning" />
            </div>
          </div>
        )}
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      {tab === 'coming' && <Fab label="Add a birthday" onClick={() => setForm({ name: '', relationship: '', month: new Date().getMonth() + 1, day: 1, birthYear: '' })} />}
    </>
  );
}

export default function Birthdays({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Birthdays" icon="cake" accent="pink" theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="A cake shows in IMS in the week before each birthday.">
      <Body />
    </ServicePage>
  );
}
