// Day Report in the IMS design (24 Oct 2026): the subjects of Ims's morning report in the order he says them. Each is
// a card: switch it on or off, move it up or down, tune what it covers (its filters, with an example of what Ims would
// say), and add notes on what to stress. Your own subjects can be added too. The button in the bottom right saves
// when there are changes, and otherwise shows today's report. The same /api/day-report requests as before
// (Dashboard/DayReportPortal.jsx).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ServicePage, { Empty, Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextField, TextArea, SelectField, Segmented, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';

const ICONS = {
  weather: 'cloud', reminders: 'bell', calendar: 'calendar', birthdays: 'cake', music_scan: 'music', music_releases: 'music', campaigns: 'dice', card_games: 'dice',
  glucose: 'blood', glucose_now: 'blood', glucose_overnight: 'chart', device_status: 'shield', device_changes: 'shield', garmin_recovery: 'moon', strava: 'run', training: 'run',
  last_run: 'route', goals: 'flag', tours: 'mic', news: 'news', tasks: 'checklist', nightscout_db: 'disk', standalone: 'sparkle', custom: 'sparkle',
};
const iconFor = (s) => ICONS[s.serviceId] || ICONS[s.id] || 'sparkle';
const NOTE_HINTS = {
  tours: 'For example: focus on Leeds or Sheffield gigs; mention newly announced dates and ticket releases.',
  weather: 'For example: say when rain arrives around the morning; mention a big drop in temperature.',
  reminders: 'For example: say the morning alarms first; flag medication reminders.',
  calendar: 'For example: stress morning meetings; mention travel or a video call link.',
  birthdays: 'For example: mention milestone birthdays; remind me to send a card.',
  music_releases: 'For example: favourite artists first; flag records on my want list.',
  card_games: 'For example: note an investigator\'s trauma in Arkham; say whether the last scenario was won.',
  glucose_now: 'For example: warn if glucose is outside 4.0 to 7.5 mmol/L; mention high insulin on board.',
  glucose_overnight: 'For example: flag overnight dips below 3.9 mmol/L; say the time in range.',
  device_changes: 'For example: remind me to have a new pod or sensor ready; mention the warm-up time.',
  garmin_recovery: 'For example: warn if the sleep score is under 70; link low Body Battery with a high waking glucose.',
  training: 'For example: compare the distance with the weekly target; mention rest days.',
  last_run: 'For example: how steady the pace and glucose were.',
  goals: 'For example: progress towards running goals; keep it encouraging.',
  news: 'For example: UK tech, science and Leeds news first; skip sensational headlines.',
  tasks: 'For example: sum up what background tasks found; mention anything I need to do.',
  nightscout_db: 'For example: warn if storage is over 85%; suggest clearing old records.',
};
const BLANK = { title: '', serviceId: 'standalone', description: '', customNote: '', content: '' };

// one filter control, by type: a switch, a level from a short list, a number, or a choice
function Filter({ f, value, onChange, selectOptions }) {
  const val = value !== undefined ? value : f.default;
  if (f.type === 'boolean') {
    return (
      <label className={`imsm-filt sw ${val ? 'on' : ''}`}>
        <span className="txt"><b>{f.label}</b><small>{f.description}</small></span>
        <span className="imsm-switch"><input type="checkbox" checked={Boolean(val)} onChange={() => onChange(!val)} /><i /></span>
      </label>
    );
  }
  if (f.type === 'level') {
    const levels = f.levels || ['Off', 'Brief', 'Normal', 'Detailed'];
    const lv = typeof val === 'boolean' ? (val ? 2 : 0) : Number(val ?? 2);
    const off = !f.levels && lv === 0;
    const many = levels.length > 5;
    return (
      <div className={`imsm-filt ${off ? '' : 'on'}`}>
        <span className="txt"><b>{f.label}</b><small>{f.description}</small></span>
        {many ? (
          <>
            <div className="imsm-row" style={{ justifyContent: 'space-between' }}><span className="muted">{levels[0]}</span><span className="tag good">{levels[lv]}</span><span className="muted">{levels[levels.length - 1]}</span></div>
            <input type="range" className="imsm-range" min="0" max={levels.length - 1} step="1" value={lv} style={{ '--v': `${(lv / (levels.length - 1)) * 100}%` }} onChange={(e) => onChange(Number(e.target.value))} aria-label={`${f.label}: how much`} />
          </>
        ) : <Segmented label={f.label} value={lv} onChange={onChange} options={levels.map((l, i) => [i, l])} />}
      </div>
    );
  }
  if (f.type === 'number') {
    const min = f.min || 0, max = f.max || 100;
    return (
      <div className="imsm-filt on">
        <span className="txt"><b>{f.label} <span className="tag good">{val}</span></b><small>{f.description}</small></span>
        <input type="range" className="imsm-range" min={min} max={max} step={f.step || 1} value={val} style={{ '--v': `${((val - min) / (max - min || 1)) * 100}%` }} onChange={(e) => onChange(parseFloat(e.target.value))} aria-label={f.label} />
      </div>
    );
  }
  if (f.type === 'select') {
    const opts = f.options || selectOptions[f.optionsUrl] || [];
    return (
      <div className="imsm-filt on">
        <SelectField label={f.label} value={val ?? ''} onChange={onChange} options={opts.map((o) => [o.value, o.label])} help={f.description} />
      </div>
    );
  }
  return null;
}

function Body() {
  const snack = useSnack();
  const [sections, setSections] = useState(null);
  const [saved, setSaved] = useState([]);
  const [services, setServices] = useState([]);
  const [schemas, setSchemas] = useState({});
  const [selectOptions, setSelectOptions] = useState({});
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState({}); // { id: 'filters' | 'notes' }
  const [examples, setExamples] = useState({});
  const [form, setForm] = useState(null); // custom subject being added or changed
  const [preview, setPreview] = useState(null); // { view, data, script, loading }
  const [confirm, setConfirm] = useState(null);
  const err = useCallback((m) => snack(m, { error: true }), [snack]);
  const dirty = useMemo(() => sections && JSON.stringify(sections) !== JSON.stringify(saved), [sections, saved]);

  const apply = (d) => { setSections(d.sections); setSaved(d.sections); if (d.subFilterSchemas) setSchemas(d.subFilterSchemas); };
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/day-report/config'); const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'The report\'s settings couldn\'t be loaded.');
      const list = (d.sections || []).map((s) => ({ ...s, customNote: s.id !== 'tours' && /focus on leeds|sheffield gigs/i.test(s.customNote || '') ? '' : (s.customNote || '') }));
      setSections(list); setSaved(list); setServices(d.availableServices || []); setSchemas(d.subFilterSchemas || {});
    } catch (e) { setSections((s) => s || []); err(e.message); }
  }, [err]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  useEffect(() => {
    const urls = [...new Set(Object.values(schemas).flat().filter((f) => f?.type === 'select' && f.optionsUrl).map((f) => f.optionsUrl))];
    urls.filter((u) => !selectOptions[u]).forEach((u) => { fetch(u).then((r) => r.json()).then((j) => setSelectOptions((o) => ({ ...o, [u]: j.options || [] }))).catch(() => {}); });
  }, [schemas]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (id, p) => setSections((all) => all.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const move = (i, by) => setSections((all) => { const j = i + by; if (j < 0 || j >= all.length) return all; const n = all.slice(); [n[i], n[j]] = [n[j], n[i]]; return n; });
  const setFilter = (s, key, v) => { setExamples((e) => (e[s.id] ? { ...e, [s.id]: { ...e[s.id], stale: true } } : e)); patch(s.id, { subFilters: { ...(s.subFilters || {}), [key]: v } }); };
  const toggle = (id, which) => setOpen((o) => ({ ...o, [id]: o[id] === which ? null : which }));
  const example = async (s) => {
    setExamples((e) => ({ ...e, [s.id]: { ...(e[s.id] || {}), loading: true, error: null } }));
    try {
      const j = await (await fetch('/api/day-report/sample', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: s }) })).json();
      if (!j.success) throw new Error(j.error || 'No example came back.');
      setExamples((e) => ({ ...e, [s.id]: { text: j.text, reason: j.reason, dummy: j.dummy, loading: false, stale: false } }));
    } catch (e) { setExamples((x) => ({ ...x, [s.id]: { loading: false, error: e.message } })); }
  };
  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/day-report/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sections }) });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'It couldn\'t be saved.');
      apply(d); snack('Saved. Tomorrow\'s report follows this order.');
    } catch (e) { err(e.message); }
    setSaving(false);
  };
  const reset = () => setConfirm({ title: 'Back to the standard report?', body: 'Every subject returns to its usual place and settings, and your own subjects are removed.', okLabel: 'Reset it', danger: true, onOk: async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/day-report/reset', { method: 'POST' }); const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'It couldn\'t be reset.');
      apply(d); setOpen({}); snack('Back to the standard report.');
    } catch (e) { err(e.message); }
    setSaving(false);
  } });
  const saveCustom = () => {
    const title = form.title.trim();
    if (!title) return;
    const svc = services.find((s) => s.id === form.serviceId);
    const serviceName = svc ? svc.name : 'Custom';
    const body = { title, serviceId: form.serviceId, serviceName, description: form.description.trim() || `Your own subject, linked to ${serviceName}.`, customNote: form.customNote.trim(), content: form.content.trim() };
    if (form.id) { patch(form.id, body); snack(`“${title}” changed. Save to keep it.`); }
    else { setSections((all) => [...all, { id: `custom_${Date.now()}`, type: 'custom', enabled: true, subFilters: {}, ...body }]); snack(`“${title}” added at the end. Save to keep it.`); }
    setForm(null);
  };
  const removeCustom = (s) => setConfirm({ title: `Remove “${s.title}”?`, okLabel: 'Remove', danger: true, onOk: () => { setSections((all) => all.filter((x) => x.id !== s.id)); snack('Removed. Save to keep it.'); } });

  const loadScript = async () => {
    setPreview((p) => ({ ...p, scriptLoading: true }));
    try {
      const j = await (await fetch('/api/day-report/script', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sections }) })).json();
      if (!j.success) throw new Error(j.error || 'The script couldn\'t be written.');
      setPreview((p) => ({ ...p, script: j.script || [], scriptLoading: false }));
    } catch (e) { err(e.message); setPreview((p) => ({ ...p, scriptLoading: false })); }
  };
  const loadGiven = async () => {
    setPreview((p) => ({ ...p, dataLoading: true }));
    try {
      const r = await fetch('/api/day-report/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sections }) });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'The preview couldn\'t be made.');
      setPreview((p) => ({ ...p, data: d, dataLoading: false }));
    } catch (e) { err(e.message); setPreview((p) => ({ ...p, dataLoading: false })); }
  };
  const openPreview = () => { setPreview({ view: 'script' }); loadScript(); loadGiven(); };
  const copyPreview = () => {
    const text = preview.view === 'script' ? (preview.script || []).map((x) => `${x.title}\n${x.text || ''}`).join('\n\n') : (preview.data?.whoLine || '') + (preview.data?.parts || []).join('\n\n');
    navigator.clipboard.writeText(text).then(() => snack('Copied.')).catch(() => err('It couldn\'t be copied.'));
  };

  if (sections == null) return <div className="imsm-empty"><Spinner /></div>;
  const on = sections.filter((s) => s.enabled).length;
  return (
    <>
      <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">{on} of {sections.length} subjects on, said in this order.</span>
        <span className="imsm-row">
          <Btn kind="text" icon="add" onClick={() => setForm({ ...BLANK })}>Your own subject</Btn>
          <Btn kind="text" icon="eye" onClick={openPreview}>Today's report</Btn>
          <Btn kind="text" icon="sync" disabled={saving} onClick={reset}>Reset</Btn>
        </span>
      </div>
      {dirty && <div className="imsm-banner info"><Icon n="info" size={22} /><span>You have changes that aren't saved yet.</span><Btn kind="text" onClick={() => { setSections(saved); setExamples({}); }}>Undo them</Btn></div>}
      {!sections.length ? <Empty icon="sun" title="No subjects">Reset to get the standard report back.</Empty> : (
        <ol className="imsm-drs">
          {sections.map((s, i) => {
            const schema = schemas[s.id] || schemas[s.serviceId] || [];
            const tuned = schema.filter((f) => (s.subFilters || {})[f.key] !== undefined && (s.subFilters || {})[f.key] !== f.default).length;
            const mine = s.type === 'custom';
            const ex = examples[s.id];
            return (
              <li key={s.id} className={`imsm-dr ${s.enabled ? '' : 'off'}`}>
                <div className="top">
                  <span className="pos">{i + 1}</span>
                  <span className="mv"><IconButton icon="up" label="Say it earlier" disabled={i === 0} onClick={() => move(i, -1)} /><IconButton icon="down" label="Say it later" disabled={i === sections.length - 1} onClick={() => move(i, 1)} /></span>
                  <span className="lead"><Icon n={iconFor(s)} size={22} /></span>
                  <span className="txt">
                    <b>{s.title}</b>
                    <small>{s.description}</small>
                    <span className="tags">
                      <span className={`tag ${mine ? 'warn' : 'quiet'}`}>{mine ? 'Your own' : s.serviceName || 'Built in'}</span>
                      {tuned > 0 && <span className="tag good">{tuned} tuned</span>}
                      {s.customNote && <span className="tag quiet">Has notes</span>}
                    </span>
                  </span>
                  <label className="imsm-switch" title={s.enabled ? 'Leave it out of the report' : 'Put it in the report'}><input type="checkbox" checked={s.enabled} onChange={() => patch(s.id, { enabled: !s.enabled })} aria-label={`${s.title}: in the report`} /><i /></label>
                </div>
                <div className="acts">
                  {schema.length > 0 && <Btn kind={open[s.id] === 'filters' ? 'tonal' : 'text'} icon="tune" onClick={() => toggle(s.id, 'filters')}>What it covers</Btn>}
                  <Btn kind={open[s.id] === 'notes' ? 'tonal' : 'text'} icon="edit" onClick={() => toggle(s.id, 'notes')}>Notes</Btn>
                  {mine && <><IconButton icon="tune" label="Change this subject" onClick={() => setForm({ id: s.id, title: s.title || '', serviceId: s.serviceId || 'standalone', description: s.description || '', customNote: s.customNote || '', content: s.content || '' })} /><IconButton icon="del" label="Remove this subject" onClick={() => removeCustom(s)} /></>}
                </div>
                {open[s.id] === 'filters' && (
                  <div className="drawer">
                    <div className="imsm-filts">{schema.map((f) => <Filter key={f.key} f={f} value={(s.subFilters || {})[f.key]} onChange={(v) => setFilter(s, f.key, v)} selectOptions={selectOptions} />)}</div>
                    <div className="imsm-say">
                      <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
                        <b><Icon n="chat" size={18} />What Ims would say</b>
                        <Btn kind="tonal" busy={ex?.loading} onClick={() => example(s)}>{ex?.text || ex?.reason ? (ex.stale ? 'Settings changed: try again' : 'Another example') : 'Show an example'}</Btn>
                      </div>
                      {ex?.error && <p className="bad">{ex.error}</p>}
                      {ex?.dummy && ex?.text && <span className="tag warn">Made-up data: nothing real for this today</span>}
                      {ex?.text ? <q className={ex.stale ? 'stale' : ''}>{ex.text}</q> : ex?.reason ? <p className="muted">{ex.reason}</p> : !ex?.loading && <p className="muted">Today's real data, in Ims's voice, with the settings above (saved or not).</p>}
                    </div>
                  </div>
                )}
                {open[s.id] === 'notes' && (
                  <div className="drawer">
                    <TextArea label="What to stress" rows={2} value={s.customNote || ''} onChange={(v) => patch(s.id, { customNote: v })} placeholder={NOTE_HINTS[s.id] || 'What Ims should mention or stress in this part.'} />
                    {mine && s.content && <p className="muted" style={{ margin: 0 }}><b>What it asks Ims to do:</b> {s.content}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <Sheet open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? 'Change your subject' : 'Your own subject'}
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setForm(null)}>Cancel</Btn><Btn icon="check" disabled={!form?.title.trim()} onClick={saveCustom}>{form?.id ? 'Change it' : 'Add it'}</Btn></div>}>
        {form && (
          <div className="imsm-form">
            <TextField label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} autoFocus placeholder="For example: Garden watering" />
            <SelectField label="Uses data from" value={form.serviceId} onChange={(v) => setForm({ ...form, serviceId: v })} options={services.map((s) => [s.id, `${s.name}: ${s.description}`])} help="Pick a service if this subject should draw on its data." />
            <TextField label="Short summary" value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="For example: a reminder to take the morning vitamins." />
            <TextArea label="What Ims should say or check" rows={3} value={form.content} onChange={(v) => setForm({ ...form, content: v })} />
            <TextField label="How to say it" value={form.customNote} onChange={(v) => setForm({ ...form, customNote: v })} placeholder="For example: keep it short and ask if it's done" />
          </div>
        )}
      </Sheet>

      <Sheet open={Boolean(preview)} onClose={() => setPreview(null)} title="Today's report" wideWidth="760px"
        footer={<div className="imsm-row" style={{ justifyContent: 'space-between' }}><span className="muted">{preview?.view === 'script' ? 'From the settings on this page, saved or not.' : 'The facts and instructions each subject gives Ims.'}</span><span className="imsm-row"><Btn kind="text" icon="copy" onClick={copyPreview}>Copy</Btn><Btn kind="tonal" icon="sync" onClick={() => (preview?.view === 'script' ? loadScript() : loadGiven())}>Again</Btn></span></div>}>
        {preview && (
          <div className="imsm-form">
            <Segmented label="Which view" value={preview.view} onChange={(v) => setPreview((p) => ({ ...p, view: v }))} options={[['script', 'What he\'ll say'], ['given', 'What he\'s given']]} />
            {preview.view === 'script' ? (
              preview.scriptLoading ? <div className="imsm-empty"><Spinner /><p>Writing today's report in Ims's voice…</p></div>
                : !preview.script?.length ? <p className="muted">Nothing to say with these settings; check some subjects are on.</p>
                : <ol className="imsm-script">{preview.script.map((x, i) => <li key={i}><b>{x.title}</b><p>{x.text || 'Nothing came back for this part; try again.'}</p></li>)}</ol>
            ) : (
              preview.dataLoading ? <div className="imsm-empty"><Spinner /></div>
                : !preview.data?.parts?.length ? <p className="muted">Nothing to give him with these settings; check some subjects are on.</p>
                : <>{preview.data.whoLine && <div className="imsm-banner info"><span>{preview.data.whoLine}</span></div>}<ol className="imsm-script">{preview.data.parts.map((p, i) => <li key={i}><p>{p}</p></li>)}</ol></>
            )}
          </div>
        )}
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      {dirty ? <Fab label={saving ? 'Saving…' : 'Save'} icon="check" disabled={saving} onClick={save} /> : <Fab label="Today's report" icon="eye" onClick={openPreview} />}
    </>
  );
}

export default function DayReport({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Day Report" icon="sun" accent="orange" theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="What Ims tells you each morning, and in what order.">
      <Body />
    </ServicePage>
  );
}
