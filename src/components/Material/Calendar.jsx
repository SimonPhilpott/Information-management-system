// Calendar in the IMS design (24 Oct 2026): Google Calendar, the rules that turn events into icons or reminders on
// Ims, and which calendars and events Ims may see. Three tabs; the bottom-right button adds an appointment (or, on
// Rules, a new rule). The same /api/calendar requests as before (Dashboard/CalendarPortal.jsx); sign-in with Google
// when needed.
import React, { useCallback, useEffect, useState } from 'react';
import ServicePage, { ItemCard, Empty, Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextField, SelectField, Tabs, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';
import { useFocusItem } from '../../hooks/useFocusItem';

const ICON_LABEL = { pod: 'Pod (below glucose)', sensor: 'Sensor (above glucose)', prescription: 'Prescription (lower right)' };
const BLANK_RULE = { name: '', matchText: '', daysBefore: 0, action: 'icon', icon: 'pod', color: 'white', remindMinutes: 60 };
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const dayWord = (d) => (d === today() ? 'Today' : new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }));

function Body() {
  const snack = useSnack();
  const [data, setData] = useState(null);
  useFocusItem(data ? 1 : 0);
  const [rules, setRules] = useState([]);
  const [cals, setCals] = useState([]);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [tab, setTab] = useState('coming');
  const [ev, setEv] = useState(null);
  const [rule, setRule] = useState(null);
  const [exclude, setExclude] = useState('');
  const [confirm, setConfirm] = useState(null);

  const call = useCallback(async (url, options) => {
    const r = await fetch(url, { credentials: 'same-origin', ...options });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { setNeedsSignIn(true); throw new Error(d.error || 'Sign in first.'); }
    if (!r.ok || d.success === false) throw new Error(d.error || 'That didn\'t work.');
    return d;
  }, []);
  const send = (url, method, body) => call(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const load = useCallback(async (refresh = false) => {
    try {
      const d = await call(`/api/calendar?days=14${refresh ? '&refresh=1' : ''}`);
      const r = await call('/api/calendar/rules');
      setNeedsSignIn(false); setData(d); setRules(r.rules || []); setExclude((d.settings?.excludeWords || []).join(', '));
    } catch { /* needsSignIn set by call */ }
  }, [call]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { call('/api/calendar/calendars').then((d) => setCals(d.calendars || [])).catch(() => {}); }, [call, data?.status?.connected]);
  const signIn = async () => { try { const d = await (await fetch(`/api/auth/url?full=1&returnTo=${encodeURIComponent(window.location.pathname)}`)).json(); if (d.url) window.location.href = d.url; } catch (e) { snack(e.message, { error: true }); } };

  const addEvent = async () => { try { await send('/api/calendar/events', 'POST', { ...ev, time: ev.time || undefined }); setEv(null); snack('Added to your Google Calendar.'); load(true); } catch (e) { snack(e.message, { error: true }); } };
  const removeEvent = (e) => setConfirm({ title: `Delete "${e.title}"?`, body: 'It goes from your Google Calendar.', okLabel: 'Delete', danger: true, onOk: async () => { try { await call(`/api/calendar/events/${encodeURIComponent(e.calendarId)}/${encodeURIComponent(e.id)}`, { method: 'DELETE' }); load(true); } catch (err) { snack(err.message, { error: true }); } } });
  const saveRule = async () => {
    try { const b = { ...rule, daysBefore: Number(rule.daysBefore), remindMinutes: Number(rule.remindMinutes) }; if (rule.id) await send(`/api/calendar/rules/${rule.id}`, 'PUT', b); else await send('/api/calendar/rules', 'POST', b); setRule(null); snack('Rule saved.'); load(); } catch (e) { snack(e.message, { error: true }); }
  };
  const toggleRule = async (r) => { try { await send(`/api/calendar/rules/${r.id}`, 'PUT', { enabled: !r.enabled }); load(); } catch (e) { snack(e.message, { error: true }); } };
  const removeRule = (r) => setConfirm({ title: `Delete the rule "${r.name}"?`, okLabel: 'Delete', danger: true, onOk: async () => { try { await call(`/api/calendar/rules/${r.id}`, { method: 'DELETE' }); load(); } catch (e) { snack(e.message, { error: true }); } } });
  const saveSettings = async (patch) => { try { await send('/api/calendar/settings', 'PUT', patch); snack('Saved.'); load(true); } catch (e) { snack(e.message, { error: true }); } };
  const toggleCal = (id) => {
    const cur = data.settings.calendarIds;
    const next = cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id];
    if (!next.length) { snack('Keep at least one calendar.', { error: true }); return; }
    saveSettings({ calendarIds: next });
  };

  if (needsSignIn) return <Empty icon="calendar" title="Sign in to see your calendar">Your calendar is only shown to your own signed-in Google account.<br /><br /><Btn icon="person" onClick={signIn}>Sign in with Google</Btn></Empty>;
  if (!data) return <div className="imsm-empty"><Spinner /></div>;
  const byDay = {};
  for (const e of data.events || []) (byDay[e.date < today() ? today() : e.date] ||= []).push(e);
  const status = data.status || {};

  return (
    <>
      {status.error && <div className="imsm-banner"><Icon n="info" size={20} /><span style={{ flex: 1 }}>{status.error}</span>{status.needsReconnect && <Btn onClick={signIn}>Connect Google Calendar</Btn>}</div>}
      <Tabs value={tab} onChange={setTab} tabs={[['coming', 'Coming up', 'calendar'], ['rules', `Rules (${rules.length})`, 'tune'], ['settings', 'What Ims sees', 'person']]} />

      {tab === 'coming' && (
        <>
          <div className="imsm-card">
            <div className="imsm-row"><h3 style={{ flex: 1, margin: 0 }}>Showing on Ims now</h3><IconButton icon="sync" label="Fetch again from Google" onClick={() => load(true)} /></div>
            {!data.deviceIcons?.length ? <p className="muted" style={{ margin: 0 }}>No calendar icons today.</p> : <div className="chips wrap">{data.deviceIcons.map((i) => <span key={i.icon} className="tag good">{ICON_LABEL[i.icon] || i.icon}, {i.color}</span>)}</div>}
          </div>
          {!Object.keys(byDay).length ? <Empty icon="calendar" title="Nothing in the next two weeks" /> : Object.entries(byDay).map(([day, list]) => (
            <section key={day}>
              <h2 className="imsm-h2">{dayWord(day)}</h2>
              <div className="imsm-list">
                {list.map((e) => (
                  <div key={`${e.calendarId}-${e.id}`} id={`event-${e.id}`}>
                    <ItemCard icon="calendar" title={e.title} meta={[e.time ? `${e.time}${e.endTime ? ` to ${e.endTime}` : ''}` : 'All day', e.location].filter(Boolean).join(' · ')}>
                      {e.link && <a className="ib sl" href={e.link} target="_blank" rel="noreferrer" aria-label="Open in Google Calendar"><Icon n="open" /></a>}
                      <IconButton icon="del" label={`Delete ${e.title}`} onClick={() => removeEvent(e)} />
                    </ItemCard>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {status.hiddenCount > 0 && <p className="muted">{status.hiddenCount} event{status.hiddenCount === 1 ? ' is' : 's are'} hidden by your ignore list. Ims never sees them.</p>}
          <p className="muted">You can also ask Ims: "add a doctor's appointment on Thursday at 2pm to my calendar".</p>
        </>
      )}

      {tab === 'rules' && (
        <>
          <p className="muted" style={{ margin: 0 }}>When an event's title contains the words in a rule, Ims shows an icon or sets a reminder.</p>
          {!rules.length ? <Empty icon="tune" title="No rules yet" /> : (
            <div className="imsm-list">
              {rules.map((r) => (
                <ItemCard key={r.id} icon={r.action === 'icon' ? 'image' : 'bell'} tone={r.enabled ? '' : 'quiet'} title={r.name}
                  meta={`Title contains "${r.matchText}". ${r.daysBefore === 0 ? 'On the day' : `${r.daysBefore} day${r.daysBefore === 1 ? '' : 's'} before`}: ${r.action === 'icon' ? `${ICON_LABEL[r.icon] || r.icon}, ${r.color}` : `a reminder ${r.remindMinutes} min before`}.`}
                  tags={<span className={`tag ${r.enabled ? 'good' : 'quiet'}`}>{r.enabled ? 'On' : 'Off'}</span>}>
                  <label className="imsm-switch" title={r.enabled ? 'Turn it off' : 'Turn it on'}><input type="checkbox" checked={r.enabled} onChange={() => toggleRule(r)} aria-label={`${r.name}: on or off`} /><i /></label>
                  <IconButton icon="edit" label={`Change ${r.name}`} onClick={() => setRule({ ...r })} />
                  <IconButton icon="del" label={`Delete ${r.name}`} onClick={() => removeRule(r)} />
                </ItemCard>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'settings' && (
        <>
          {cals.length > 0 && (
            <div className="imsm-card">
              <h3>Calendars Ims can see</h3>
              {cals.map((c) => {
                const on = data.settings.calendarIds.includes(c.id) || (c.primary && data.settings.calendarIds.includes('primary'));
                return (
                  <label key={c.id} className="imsm-row" style={{ cursor: 'pointer' }}>
                    <span className="imsm-switch"><input type="checkbox" checked={on} onChange={() => toggleCal(c.primary && data.settings.calendarIds.includes('primary') ? 'primary' : c.id)} /><i /></span>
                    <span>{c.name}{c.primary ? <span className="muted"> (main)</span> : null}</span>
                  </label>
                );
              })}
            </div>
          )}
          <div className="imsm-card">
            <h3>Events Ims ignores</h3>
            <TextField label="Titles containing (comma separated)" value={exclude} onChange={setExclude} placeholder="bin, recycling, refuse" help="Whole words only. They're dropped before anything else sees them: not shown here, not told to Ims, not used by rules." />
            <div className="imsm-row end"><Btn icon="check" onClick={() => saveSettings({ excludeWords: exclude.split(',').map((w) => w.trim()).filter(Boolean) })}>Save</Btn></div>
          </div>
        </>
      )}

      <Sheet open={Boolean(ev)} onClose={() => setEv(null)} title="Add an appointment"
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setEv(null)}>Cancel</Btn><Btn icon="add" disabled={!ev?.title.trim() || !ev?.date} onClick={addEvent}>Add it</Btn></div>}>
        {ev && <div className="imsm-form">
          <TextField label="What it is" value={ev.title} onChange={(v) => setEv({ ...ev, title: v })} placeholder="For example: Doctor, diabetes review" autoFocus />
          <div className="two">
            <TextField label="Date" type="date" value={ev.date} onChange={(v) => setEv({ ...ev, date: v })} />
            <TextField label="Time" type="time" value={ev.time} onChange={(v) => setEv({ ...ev, time: v })} help="Blank: all day" />
          </div>
        </div>}
      </Sheet>
      <Sheet open={Boolean(rule)} onClose={() => setRule(null)} title={rule?.id ? `Change: ${rule.name}` : 'A new rule'}
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setRule(null)}>Cancel</Btn><Btn icon="check" onClick={saveRule}>Save the rule</Btn></div>}>
        {rule && <div className="imsm-form">
          <TextField label="Its name" value={rule.name} onChange={(v) => setRule({ ...rule, name: v })} autoFocus />
          <TextField label="When the event's title contains" value={rule.matchText} onChange={(v) => setRule({ ...rule, matchText: v })} placeholder="For example: Change pod" />
          <div className="two">
            <SelectField label="Then" value={rule.action} onChange={(v) => setRule({ ...rule, action: v })} options={[['icon', 'Show an icon'], ['remind', 'Set a reminder']]} />
            <TextField label="Days before the event" type="number" inputMode="numeric" value={rule.daysBefore} onChange={(v) => setRule({ ...rule, daysBefore: v })} />
            {rule.action === 'icon' ? <>
              <SelectField label="Icon" value={rule.icon} onChange={(v) => setRule({ ...rule, icon: v })} options={Object.entries(ICON_LABEL)} />
              <SelectField label="Colour" value={rule.color} onChange={(v) => setRule({ ...rule, color: v })} options={[['white', 'White'], ['orange', 'Orange']]} />
            </> : <TextField label="Minutes before (timed events)" type="number" inputMode="numeric" value={rule.remindMinutes} onChange={(v) => setRule({ ...rule, remindMinutes: v })} />}
          </div>
        </div>}
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      {tab === 'coming' && <Fab label="Add an appointment" onClick={() => setEv({ title: '', date: today(), time: '', durationMinutes: 30 })} />}
      {tab === 'rules' && <Fab label="New rule" onClick={() => setRule({ ...BLANK_RULE })} />}
    </>
  );
}

export default function Calendar({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Calendar" icon="calendar" accent="indigo" theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="Your Google Calendar, and the rules Ims follows from it.">
      <Body />
    </ServicePage>
  );
}
