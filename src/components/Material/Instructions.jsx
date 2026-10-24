// Instructions in the IMS design (24 Oct 2026): things Simon has asked Ims to do later - like reminders, but for
// Ims. Waiting ones as cards (change, done, cancel); the how-tos Ims follows in every conversation, each opening to
// its steps; the finished ones folded away; New instruction is the button in the bottom right, opening a sheet. The
// same /api/ims-instructions requests as before (Dashboard/InstructionsPortal.jsx).
import React, { useCallback, useEffect, useState } from 'react';
import ServicePage, { ItemCard, Empty, Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextField, TextArea, SelectField, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';
import { useFocusItem } from '../../hooks/useFocusItem';

const TRIGGERS = [['time', 'At a time', 'timer'], ['person', 'When someone is at the desk', 'person'], ['next_conversation', 'Next time we talk', 'note'], ['standing', 'Always (a standing rule)', 'sync'], ['how_to', 'How to do something, when it comes up', 'book']];
const REPEATS = [['once', 'Once'], ['daily', 'Every day'], ['every_time', 'Every time (people: at most every 30 minutes)']];
const STATUS = { done: ['Done', 'good'], cancelled: ['Cancelled', 'quiet'], expired: ['Ran out of time', 'warn'] };
const when = (t) => (t ? new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const hhmm = (t) => (t ? new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }) : '');
const ymd = (t) => (t ? new Date(t).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) : '');
const EMPTY = { instruction: '', say: '', trigger: 'time', person: '', situation: '', time: '', date: '', notBefore: '', notAfter: '', notBeforeDate: '', repeat: 'once' };
const fromItem = (i) => ({ id: i.id, instruction: i.instruction, say: i.say || '', trigger: i.trigger, person: i.person || '', situation: i.situation || '', time: hhmm(i.at), date: ymd(i.at), notBefore: hhmm(i.notBefore), notAfter: hhmm(i.notAfter), notBeforeDate: ymd(i.notBefore), repeat: i.repeat || 'once' });
const bodyOf = (f) => {
  const b = { instruction: f.instruction, say: f.say, trigger: f.trigger, repeat: f.repeat };
  if (f.trigger === 'time') { b.time = f.time; if (f.date) b.date = f.date; }
  if (f.trigger === 'person') b.person = f.person;
  if (f.trigger === 'how_to') b.situation = f.situation;
  if (f.trigger !== 'time' && f.trigger !== 'how_to') { b.notBefore = f.notBefore || null; b.notAfter = f.notAfter || null; if (f.notBeforeDate) b.notBeforeDate = f.notBeforeDate; }
  if (['standing', 'next_conversation', 'how_to'].includes(f.trigger)) b.repeat = 'once';
  return b;
};
const call = async (url, method, payload) => {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: payload ? JSON.stringify(payload) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.success === false) throw new Error(d.error || 'That didn\'t work.');
  return d;
};

function HowTo({ i, onEdit, onRemove }) {
  const [open, setOpen] = useState(false);
  return (
    <div id={`instruction-${i.id}`} className={`imsm-task ${open ? 'open' : ''}`}>
      <button type="button" className="hd sl" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="lead"><Icon n="book" size={22} /></span>
        <span className="txt"><b>When {i.situation}</b></span>
        <Icon n="down" size={22} />
      </button>
      {open && (
        <div className="bd">
          <p style={{ whiteSpace: 'pre-line' }}>{i.instruction.replace(/ (\d+)\) /g, '\n$1) ')}</p>
          <div className="imsm-row end"><Btn kind="text" icon="edit" onClick={() => onEdit(i)}>Change it</Btn><Btn kind="text" icon="del" onClick={() => onRemove(i)}>Remove</Btn></div>
        </div>
      )}
    </div>
  );
}

function Body() {
  const snack = useSnack();
  const [data, setData] = useState(null);
  useFocusItem(data?.pending?.length || 0);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const load = useCallback(async () => { try { const d = await call('/api/ims-instructions', 'GET'); setData({ pending: d.pending || [], finished: d.finished || [] }); } catch (e) { setData((x) => x || { pending: [], finished: [] }); snack(e.message, { error: true }); } }, [snack]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      if (form.id) { await call(`/api/ims-instructions/${form.id}`, 'PUT', bodyOf(form)); snack('Instruction changed.'); }
      else { const d = await call('/api/ims-instructions', 'POST', bodyOf(form)); snack(`Saved: ${d.instruction.description}`); }
      setForm(null); load();
    } catch (e) { snack(e.message, { error: true }); } finally { setSaving(false); }
  };
  const done = async (i) => { try { await call(`/api/ims-instructions/${i.id}/done`, 'POST', {}); snack('Marked done.'); load(); } catch (e) { snack(e.message, { error: true }); } };
  const cancel = (i) => setConfirm({ title: 'Cancel this instruction?', body: i.description || i.instruction, okLabel: 'Cancel it', danger: true, onOk: async () => { try { await call(`/api/ims-instructions/${i.id}/cancel`, 'POST', {}); snack('Cancelled.'); load(); } catch (e) { snack(e.message, { error: true }); } } });
  const remove = (i) => setConfirm({ title: 'Delete this from the history?', body: i.description, okLabel: 'Delete', danger: true, onOk: async () => { try { await call(`/api/ims-instructions/${i.id}`, 'DELETE'); load(); } catch (e) { snack(e.message, { error: true }); } } });

  if (!data) return <div className="imsm-empty"><Spinner /></div>;
  const howTos = data.pending.filter((i) => i.trigger === 'how_to');
  const waiting = data.pending.filter((i) => i.trigger !== 'how_to');
  const f = form;
  const set = (k) => (v) => setForm({ ...f, [k]: v });
  return (
    <>
      <h2 className="imsm-h2">Waiting ({waiting.length})</h2>
      {!waiting.length ? <Empty icon="clipboard" title="Nothing waiting">Tell Ims, for example "if you see Rowan between half eight and nine tonight, say 'isn't it time for bed?'", or use the button in the corner.</Empty> : (
        <div className="imsm-list">
          {waiting.map((i) => {
            const t = TRIGGERS.find((x) => x[0] === i.trigger) || TRIGGERS[0];
            return (
              <div key={i.id} id={`instruction-${i.id}`}>
                <ItemCard icon={t[2]} title={i.description}
                  meta={`${i.simonSaid ? `You said: "${i.simonSaid}". ` : ''}Added ${when(i.createdAt)}${i.origin === 'desk' ? ' on the desk' : i.origin === 'web' ? ' here' : ''}${i.doneCount ? `. Done ${i.doneCount} time${i.doneCount === 1 ? '' : 's'}, last ${when(i.lastDoneAt)}` : ''}.`}
                  tags={<span className="tag">{t[1]}</span>}>
                  <IconButton icon="edit" label="Change it" onClick={() => setForm(fromItem(i))} />
                  {i.trigger !== 'standing' && <IconButton icon="check" label="Mark it done" onClick={() => done(i)} />}
                  <IconButton icon="close" label="Cancel it" onClick={() => cancel(i)} />
                </ItemCard>
              </div>
            );
          })}
        </div>
      )}
      <h2 className="imsm-h2">How-tos ({howTos.length})</h2>
      <p className="muted" style={{ marginTop: -6 }}>How Ims handles each kind of request: stories, recipes, a child at the desk. He follows these in every conversation; change one to change how he does it, or tell him ("from now on, when I ask for a recipe…").</p>
      <div className="imsm-list">{howTos.map((i) => <HowTo key={i.id} i={i} onEdit={(x) => setForm(fromItem(x))} onRemove={cancel} />)}</div>
      {!howTos.length && <p className="muted">None yet.</p>}
      <details className="imsm-fold" open={showDone} onToggle={(e) => setShowDone(e.currentTarget.open)}>
        <summary><Icon n="archive" size={20} /><span>Finished ({data.finished.length})</span><Icon n="down" size={22} /></summary>
        <div className="imsm-list" style={{ padding: '0 12px 12px' }}>
          {data.finished.map((i) => {
            const [w, tone] = STATUS[i.status] || STATUS.done;
            return (
              <ItemCard key={i.id} icon="clipboard" tone="quiet" title={i.description} meta={`${i.outcome ? `${i.outcome}. ` : ''}${when(i.lastDoneAt || i.updatedAt)}`} tags={<span className={`tag ${tone}`}>{w}</span>}>
                <IconButton icon="del" label="Delete from the history" onClick={() => remove(i)} />
              </ItemCard>
            );
          })}
          {!data.finished.length && <p className="muted">None yet.</p>}
        </div>
      </details>

      <Sheet open={Boolean(form)} onClose={() => setForm(null)} title={f?.id ? 'Change this instruction' : 'A new instruction'}
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setForm(null)}>Cancel</Btn><Btn icon="check" busy={saving} disabled={!f?.instruction.trim()} onClick={save}>Save</Btn></div>}>
        {f && (
          <div className="imsm-form">
            <TextArea label="What should Ims do?" rows={f.trigger === 'how_to' ? 6 : 3} value={f.instruction} onChange={set('instruction')} autoFocus
              placeholder={f.trigger === 'how_to' ? 'For example: 1) Check how many it is for. 2) Give the oven temperature first…' : 'For example: remind Rowan it\'s bedtime'} />
            <TextField label="The exact words to say (optional)" value={f.say} onChange={set('say')} placeholder="For example: Hello Rowan, isn't it time for bed?" />
            <div className="two">
              <SelectField label="When" value={f.trigger} onChange={set('trigger')} options={TRIGGERS.map((t) => [t[0], t[1]])} />
              {f.trigger === 'how_to' && <TextField label="When does it apply?" value={f.situation} onChange={set('situation')} placeholder="For example: he asks for a recipe" />}
              {!['standing', 'next_conversation', 'how_to'].includes(f.trigger) && <SelectField label="Repeat" value={f.repeat} onChange={set('repeat')} options={REPEATS.filter((r) => f.trigger === 'person' || r[0] !== 'every_time')} />}
              {f.trigger === 'time' && <><TextField label="Time" type="time" value={f.time} onChange={set('time')} /><TextField label="Date" type="date" value={f.date} onChange={set('date')} help="Blank: the next time it comes round" /></>}
              {f.trigger === 'person' && <TextField label="Who" value={f.person} onChange={set('person')} placeholder="For example: Rowan" />}
            </div>
            {f.trigger !== 'time' && f.trigger !== 'how_to' && (
              <div className="two">
                <TextField label="Not before (optional)" type="time" value={f.notBefore} onChange={set('notBefore')} />
                <TextField label="Not after (optional)" type="time" value={f.notAfter} onChange={set('notAfter')} />
                <TextField label="On" type="date" value={f.notBeforeDate} onChange={set('notBeforeDate')} help="Blank: today" />
              </div>
            )}
          </div>
        )}
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      <Fab label="New instruction" onClick={() => setForm({ ...EMPTY })} />
    </>
  );
}

export default function Instructions({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Instructions" icon="clipboard" accent="violet" theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="Like reminders, but for Ims: things you've asked him to do later.">
      <Body />
    </ServicePage>
  );
}
