// Alarms, Timers and Reminders in the IMS design (24 Oct 2026) - one page for the three, as before
// (Dashboard/ScheduledItemsPortal.jsx): they're the same scheduled_items rows on the server, differing only in type
// and the REST path. Active ones as cards (edit, cancel, add to Google Calendar), the archive with what happened to
// each and the event timeline; New is the button in the bottom right, opening a sheet.
import React, { useCallback, useEffect, useState } from 'react';
import ServicePage, { ItemCard, Empty, Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextField, SelectField, Tabs, Confirm, useSnack, Spinner, FilterChip } from '../HomebrewBeta/ui';

const META = {
  alarm: { icon: 'alarm', accent: 'red', api: '/api/alarms', plural: 'Alarms', one: 'alarm', repeats: 5 },
  timer: { icon: 'timer', accent: 'sky', api: '/api/timers', plural: 'Timers', one: 'timer', repeats: 5 },
  reminder: { icon: 'edit', accent: 'teal', api: '/api/reminders', plural: 'Reminders', one: 'reminder', repeats: 1 },
};
const RECUR = [['once', 'Once'], ['daily', 'Every day'], ['weekdays', 'Weekdays (Monday to Friday)'], ['weekly', 'Every week, the same day']];
const RECUR_WORD = { once: '', daily: 'Every day', weekdays: 'Weekdays', weekly: 'Every week' };
const MODES = [['both', 'Chimes and voice'], ['chimes', 'Chimes only'], ['vocal', 'Voice only']];
const MODE_WORD = { both: 'Chimes and voice', chimes: 'Chimes only', vocal: 'Voice only' };
const OUTCOME = { dismissed: ['Went off, answered', 'good'], unanswered: ['Went off, no answer', 'warn'], cancelled: ['Cancelled', 'quiet'], ended: ['Finished', 'quiet'] };
const EVENT_WORD = { created: 'Set', edited: 'Changed', fired: 'Went off', dismissed: 'Answered', unanswered: 'No answer', cancelled: 'Cancelled' };

const pad = (n) => String(n).padStart(2, '0');
const localInput = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const when = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');
const json = async (url, opts) => { const r = await fetch(url, { credentials: 'same-origin', ...opts }); const d = await r.json().catch(() => ({})); if (!r.ok || d.success === false) { const e = new Error(d.error || 'That didn\'t work. Try again.'); e.status = r.status; throw e; } return d; };

function QuietHoursCard() {
  const snack = useSnack();
  const [config, setConfig] = useState({ enabled: true, start: '22:00', end: '08:30' });
  const [isQuietNow, setIsQuietNow] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/reminders/quiet-hours');
      const d = await res.json();
      if (d.success && d.config) {
        setConfig(d.config);
        setIsQuietNow(Boolean(d.isQuietNow));
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (changes) => {
    const next = { ...config, ...changes };
    setConfig(next);
    setSaving(true);
    try {
      const res = await fetch('/api/reminders/quiet-hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next)
      });
      const d = await res.json();
      if (d.success && d.config) {
        setConfig(d.config);
        setIsQuietNow(Boolean(d.isQuietNow));
        snack('Quiet hours saved.');
      }
    } catch (err) {
      snack('Could not update quiet hours: ' + err.message, { error: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="imsm-quiet-hours-card">
      <div className="imsm-quiet-hours-hd">
        <div className="imsm-quiet-hours-title">
          <span className="ico"><Icon n="alarm" size={20} /></span>
          <div>
            <b>Quiet Hours (Repress Voice)</b>
            <small>When enabled, Ims will not speak reminders aloud during these hours.</small>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`tag ${isQuietNow ? 'good' : 'quiet'}`}>
            {isQuietNow ? 'Active now (Silenced)' : 'Quiet 10pm – 8:30am'}
          </span>
          <Btn
            kind={config.enabled ? 'filled' : 'tonal'}
            size="small"
            icon={config.enabled ? 'check' : 'close'}
            busy={saving}
            onClick={() => update({ enabled: !config.enabled })}
          >
            {config.enabled ? 'Repress on' : 'Repress off'}
          </Btn>
        </div>
      </div>
      <div className="imsm-quiet-hours-controls">
        <label className="imsm-quiet-hours-time">
          <span>Quiet from:</span>
          <input
            type="time"
            value={config.start || '22:00'}
            onChange={(e) => update({ start: e.target.value })}
          />
        </label>
        <label className="imsm-quiet-hours-time">
          <span>Until:</span>
          <input
            type="time"
            value={config.end || '08:30'}
            onChange={(e) => update({ end: e.target.value })}
          />
        </label>
        <span style={{ fontSize: 11, color: 'var(--on-surface-var)', marginLeft: 'auto' }}>
          {config.enabled ? 'Gentle chimes and phone pushes only' : 'Normal voice reminders'}
        </span>
      </div>
    </div>
  );
}

function Body({ type }) {
  const m = META[type];
  const snack = useSnack();
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('active');
  const [archive, setArchive] = useState([]);
  const [events, setEvents] = useState([]);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState('');
  const [timeline, setTimeline] = useState(false);
  const [cal, setCal] = useState({});
  const [calBusy, setCalBusy] = useState(null);
  const [form, setForm] = useState(null); // { id?, label, when, recurrence, alertMode, maxRepeats }
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => { try { setItems((await json(m.api)).items || []); } catch (e) { setItems([]); snack(e.message, { error: true }); } }, [m.api, snack]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  const loadCal = useCallback(async () => { if (type === 'timer') return; try { setCal((await json('/api/calendar/links')).links || {}); } catch { /* not signed in */ } }, [type]);
  useEffect(() => { loadCal(); }, [loadCal]);
  const loadArchive = useCallback(async () => {
    try {
      const [a, e] = await Promise.all([json(`${m.api}/archive?days=${days}&search=${encodeURIComponent(search)}`), json(`${m.api}/events?days=${days || 3650}`)]);
      setArchive(a.items || []); setEvents(e.events || []);
    } catch (err) { snack(err.message, { error: true }); }
  }, [m.api, days, search, snack]);
  useEffect(() => { if (tab === 'archive') loadArchive(); }, [tab, loadArchive]);

  const startNew = () => setForm({ label: '', when: localInput(new Date(Date.now() + 3600000).toISOString()), recurrence: 'once', alertMode: 'both', maxRepeats: m.repeats });
  const startEdit = (it) => setForm({ id: it.id, label: it.label || '', when: localInput(it.fireAt), recurrence: it.recurrence || 'once', alertMode: it.alertMode || 'both', maxRepeats: Number(it.maxRepeats) || m.repeats });
  const save = async () => {
    if (!form.when) { snack('Choose a date and time.', { error: true }); return; }
    const dt = new Date(form.when);
    const body = { label: form.label || null, date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`, time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`, recurrence: form.recurrence, alertMode: form.alertMode, maxRepeats: Number(form.maxRepeats) || m.repeats };
    try {
      await json(form.id ? `${m.api}/${form.id}` : m.api, { method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      snack(form.id ? `${m.one[0].toUpperCase()}${m.one.slice(1)} changed.` : `${m.one[0].toUpperCase()}${m.one.slice(1)} set for ${when(dt.toISOString())}.`);
      setForm(null); load();
    } catch (e) { snack(e.message, { error: true }); }
  };
  const cancel = (it) => setConfirm({
    title: `Cancel this ${m.one}?`, body: it.label || `The ${m.one} for ${when(it.fireAt)}`, okLabel: `Cancel the ${m.one}`, danger: true,
    onOk: async () => { try { await json(`${m.api}/${it.id}`, { method: 'DELETE' }); snack(`${m.one[0].toUpperCase()}${m.one.slice(1)} cancelled.`); load(); } catch (e) { snack(e.message, { error: true }); } },
  });
  const addToCal = async (it) => {
    setCalBusy(it.id);
    try {
      const d = await json(`/api/calendar/from-reminder/${it.id}`, { method: 'POST' });
      snack(d.alreadyAdded ? 'Already on your Google Calendar.' : 'Added to your Google Calendar.'); loadCal();
    } catch (e) { snack(e.status === 401 ? 'Sign in with Google (on the Calendar page) to add it to your calendar.' : e.message, { error: true }); } finally { setCalBusy(null); }
  };

  return (
    <>
      <Tabs value={tab} onChange={setTab} tabs={[['active', items ? `Coming up (${items.length})` : 'Coming up', m.icon], ['archive', 'Archive', 'archive']]} />
      {type === 'reminder' && tab === 'active' && <QuietHoursCard />}
      {tab === 'active' && (
        items == null ? <div className="imsm-empty"><Spinner /></div>
          : !items.length ? <Empty icon={m.icon} title={`No ${m.plural.toLowerCase()} set`}>Set one with the button in the corner, or just ask Ims.</Empty>
            : (
              <div className="imsm-list">
                {items.map((it, i) => (
                  <ItemCard key={it.id} icon={m.icon} title={it.label || `A ${m.one}`} style={{ animationDelay: `${i * 30}ms` }}
                    meta={<span className="imsm-time">{when(it.fireAt)}</span>}
                    tags={<>
                      {it.recurrence && it.recurrence !== 'once' && <span className="tag good">{RECUR_WORD[it.recurrence] || it.recurrence}</span>}
                      <span className="tag">{MODE_WORD[it.alertMode || 'both']}</span>
                      <span className="tag quiet">{Number(it.maxRepeats || m.repeats) === 1 ? 'Says it once' : `Up to ${Number(it.maxRepeats || m.repeats)} times`}</span>
                    </>}>
                    {type !== 'timer' && (cal[it.id]
                      ? <a className="ib sl" href={typeof cal[it.id] === 'string' ? cal[it.id] : undefined} target="_blank" rel="noreferrer" aria-label="On your Google Calendar: open it" title="On your Google Calendar"><Icon n="calendar" /></a>
                      : <IconButton icon={calBusy === it.id ? 'sync' : 'calendar'} label="Add to Google Calendar" onClick={() => addToCal(it)} disabled={calBusy === it.id} />)}
                    <IconButton icon="edit" label={`Change this ${m.one}`} onClick={() => startEdit(it)} />
                    <IconButton icon="del" label={`Cancel this ${m.one}`} onClick={() => cancel(it)} />
                  </ItemCard>
                ))}
              </div>
            )
      )}

      {tab === 'archive' && (
        <>
          <div className="imsm-row">
            <div className="search" style={{ flex: 1, minWidth: 220 }}><Icon n="search" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search past ${m.plural.toLowerCase()}`} aria-label="Search" /></div>
          </div>
          <div className="chips wrap">
            {[[1, 'A day'], [7, 'A week'], [30, 'A month'], [90, 'Three months'], [0, 'All']].map(([d, l]) => <FilterChip key={d} on={days === d} onClick={() => setDays(d)}>{l}</FilterChip>)}
            <FilterChip on={timeline} onClick={() => setTimeline(!timeline)} lead={<Icon n="list" size={18} />}>Timeline</FilterChip>
          </div>
          {!timeline ? (
            !archive.length ? <Empty icon="archive" title="Nothing in this time" /> : (
              <div className="imsm-list">
                {archive.map((a) => {
                  const [word, tone] = OUTCOME[a.outcome] || OUTCOME.ended;
                  return (
                    <ItemCard key={a.id} icon={m.icon} tone="quiet" title={a.label || `A ${m.one}`}
                      meta={`Set ${fmt(a.createdAt)} for ${fmt(a.scheduledFor)}. Went off ${fmt(a.firstFiredAt)}. Ended ${fmt(a.endedAt)}.`}
                      tags={<><span className={`tag ${tone}`}>{word}</span>{a.recurrence && a.recurrence !== 'once' && <span className="tag quiet">{RECUR_WORD[a.recurrence] || a.recurrence}</span>}</>} />
                  );
                })}
              </div>
            )
          ) : (
            !events.length ? <Empty icon="list" title="Nothing happened in this time" /> : (
              <div className="imsm-card imsm-timeline">
                {events.map((e) => (
                  <div key={e.id} className="ev"><span className="when">{fmt(e.at)}</span><span className="what">{EVENT_WORD[e.event] || e.event}</span><span>{e.label || `A ${e.type}`}{e.detail ? <span className="muted"> · {e.detail}</span> : null}</span></div>
                ))}
              </div>
            )
          )}
        </>
      )}

      <Sheet open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? `Change this ${m.one}` : `New ${m.one}`}
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setForm(null)}>Cancel</Btn><Btn icon="check" onClick={save}>Save</Btn></div>}>
        {form && (
          <div className="imsm-form">
            <TextField label="What it's for" value={form.label} onChange={(v) => setForm({ ...form, label: v })} placeholder={`What's this ${m.one} for?`} autoFocus />
            <div className="two">
              <TextField label="When" type="datetime-local" value={form.when} onChange={(v) => setForm({ ...form, when: v })} />
              <SelectField label="Repeats" value={form.recurrence} onChange={(v) => setForm({ ...form, recurrence: v })} options={RECUR} />
              <SelectField label="How it tells you" value={form.alertMode} onChange={(v) => setForm({ ...form, alertMode: v })} options={MODES} />
              <SelectField label="Goes before it stops" value={String(form.maxRepeats)} onChange={(v) => setForm({ ...form, maxRepeats: Number(v) })}
                options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => [String(n), n === 1 ? 'Once, then stops' : `${n} times (about ${Math.round(n * 0.5)} min)`])} />
            </div>
          </div>
        )}
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      <Fab label={`New ${m.one}`} onClick={startNew} />
    </>
  );
}

export default function Scheduled({ type, theme = 'light', onThemeToggle, setCurrentPath }) {
  const m = META[type];
  return (
    <ServicePage title={m.plural} icon={m.icon} accent={m.accent} theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath}
      sub="Kept in step with Ims within 15 seconds.">
      <Body type={type} />
    </ServicePage>
  );
}
