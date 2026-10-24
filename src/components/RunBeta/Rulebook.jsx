// Run planner: Rulebook - four tabs (24 Oct, Simon chose Rulebook A with C's ruler and B's readable rules).
//  Targets:     your glucose targets as a ruler you drag (floor and start target), the other numbers as steppers,
//               and what the planner does in each band beneath it, in the ruler's colours.
//  Rules:       the T1D rulebook as a readable document - a chip for each section, each rule a short card you can
//               edit on its own - with any waiting suggestion shown under the rule it would change.
//  Suggestions: the waiting ones as a queue, one at a time: the rule as it is, the change, Use it / Change it / Not
//               for me. Decided ones listed underneath.
//  Library:     your books (scan for suggestions, delete), add a book, or paste research to review.
// The same planner state and requests as the classic tab (useRunPlanner.js).
import React, { useMemo, useRef, useState } from 'react';
import { Icon, IconButton, Btn, Tabs, TextField, TextArea, Sheet, useMenu, Menu, useSnack } from '../HomebrewBeta/ui';
import { Banner } from './PlanSection';

// ---- the rulebook's markdown, as sections of rules ----
const clean = (t) => String(t || '').replace(/\*\*/g, '').replace(/^[*\s-]+/, '').trim();
export function parseRulebook(text) {
  const lines = String(text || '').split('\n');
  const sections = [];
  let intro = [];
  let cur = null;
  lines.forEach((line, i) => {
    const h = line.match(/^##\s+(.*)$/);
    if (h) { cur = { title: h[1].trim(), rules: [], line: i }; sections.push(cur); return; }
    if (/^#\s/.test(line)) return;
    const b = line.match(/^\s*[*-]\s+(.*)$/);
    if (b && cur) {
      const m = b[1].match(/^\*\*(.+?)\*\*:?\s*(.*)$/);
      cur.rules.push({ line: i, raw: line, title: m ? m[1].replace(/:$/, '') : '', text: m ? m[2] : b[1] });
      return;
    }
    if (line.trim() && cur?.rules.length) { const r = cur.rules[cur.rules.length - 1]; r.text += ` ${line.trim()}`; r.extra = (r.extra || []).concat(i); return; }
    if (line.trim() && !cur) intro.push(line.trim());
  });
  return { sections, intro: intro.join(' ') };
}
const norm = (t) => clean(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const sectionOf = (f, sections) => {
  const n = String(f.section_target || '').match(/^(\d+)\./)?.[1];
  return sections.find((s) => (n && s.title.startsWith(`${n}.`)) || norm(s.title) === norm(f.section_target)) || null;
};
const ruleOf = (f, sec) => {
  if (!sec || !f.current_rule) return null;
  const want = norm(f.current_rule).slice(0, 60);
  return sec.rules.find((r) => norm(`${r.title} ${r.text}`).includes(want.slice(0, 40)) || norm(r.raw).includes(want.slice(0, 40))) || null;
};
const actionFor = (f) => ((f.type || f.finding_type) === 'conflict' ? 'replace' : 'add');
const KIND = { addition: 'New rule', refinement: 'A refinement', conflict: 'A different rule' };

// ---- one suggestion, as "was / would be" ----
function Suggestion({ f, rp, compact = false }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(clean(f.book_recommendation));
  const busy = rp.busy === `res-${f.id}`;
  return (
    <div className={`rpb-sugg ${compact ? 'compact' : ''}`}>
      <span className="who"><span className="spill">{KIND[f.type || f.finding_type] || 'Suggestion'}</span>from {f.book_title || 'your reading'}</span>
      {!compact && <b className="nm">{f.title}</b>}
      <div className="rpb-diff">
        {f.current_rule && <div className="was">{clean(f.current_rule)}</div>}
        {editing ? <div className="now"><TextArea label="The rule as you want it" rows={4} value={text} onChange={setText} /></div> : <div className="now">{clean(f.book_recommendation)}</div>}
      </div>
      {f.rationale && !compact && <p className="muted">{f.rationale}</p>}
      <div className="rpb-acts">
        <Btn kind="text" disabled={busy} onClick={() => rp.handleResolveFinding(f, 'dismiss')}>Not for me</Btn>
        {editing ? <Btn kind="tonal" busy={busy} onClick={() => rp.handleResolveFinding(f, actionFor(f), text)}>Use my wording</Btn> : <Btn kind="tonal" onClick={() => setEditing(true)}>Change it</Btn>}
        {!editing && <Btn icon="check" busy={busy} onClick={() => rp.handleResolveFinding(f, actionFor(f))}>Use it</Btn>}
      </div>
    </div>
  );
}

// ---- Targets: the ruler ----
const LO = 3, HI = 15;
function Ruler({ targets, onChange }) {
  const box = useRef(null);
  const pct = (v) => ((v - LO) / (HI - LO)) * 100;
  const drag = (key, min, max) => (e) => {
    e.preventDefault();
    const el = box.current;
    const move = (ev) => {
      const r = el.getBoundingClientRect();
      const v = Math.round((LO + ((ev.clientX - r.left) / r.width) * (HI - LO)) * 2) / 2;
      onChange({ ...targets, [key]: Math.max(min, Math.min(max, v)) });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const key = (k, min, max) => (e) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 0.5 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.5 : 0;
    if (d) { e.preventDefault(); onChange({ ...targets, [k]: Math.max(min, Math.min(max, targets[k] + d)) }); }
  };
  const floor = targets.floor, start = targets.startTarget;
  return (
    <div className="rpb-ruler">
      <div className="rbar" ref={box}>
        <span className="z low" style={{ width: `${pct(floor)}%` }}>Low</span>
        <span className="z eat" style={{ width: `${pct(7) - pct(floor)}%` }}>Eat first</span>
        <span className="z go" style={{ width: `${pct(10) - pct(7)}%` }}>Go</span>
        <span className="z hi" style={{ width: `${100 - pct(10)}%` }}>Watch the trend</span>
        <span className="rh" role="slider" tabIndex={0} aria-label="Floor: never below" aria-valuemin={3} aria-valuemax={7} aria-valuenow={floor} style={{ left: `${pct(floor)}%` }} onPointerDown={drag('floor', 3, Math.min(7, start - 1))} onKeyDown={key('floor', 3, Math.min(7, start - 1))}><b>{floor}</b><small>floor</small></span>
        <span className="rh start" role="slider" tabIndex={0} aria-label="Start target" aria-valuemin={6} aria-valuemax={12} aria-valuenow={start} style={{ left: `${pct(start)}%` }} onPointerDown={drag('startTarget', Math.max(6, floor + 1), 12)} onKeyDown={key('startTarget', Math.max(6, floor + 1), 12)}><b>{start}</b><small>start</small></span>
      </div>
      <div className="scale">{[3, 5, 7, 10, 12, 15].map((n) => <span key={n} style={{ left: `${pct(n)}%` }}>{n}</span>)}</div>
    </div>
  );
}

function Num({ label, value, unit, step, min, max, onChange, help }) {
  return (
    <div className="rpb-stat">
      <span className="k">{label}</span>
      <span className="v">{value}<small>{unit}</small></span>
      {help && <span className="s">{help}</span>}
      <span className="rpb-stepper"><IconButton icon="remove" label={`Less ${label.toLowerCase()}`} onClick={() => onChange(Math.max(min, Math.round((value - step) * 10) / 10))} /><IconButton icon="add" label={`More ${label.toLowerCase()}`} onClick={() => onChange(Math.min(max, Math.round((value + step) * 10) / 10))} /></span>
    </div>
  );
}

export default function Rulebook({ rp }) {
  const snack = useSnack();
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('rpb_rules_tab') || 'targets'; } catch { return 'targets'; } });
  const pickTab = (t) => { setTab(t); try { localStorage.setItem('rpb_rules_tab', t); } catch { /* fine */ } };
  const [sec, setSec] = useState(0);
  const [editRule, setEditRule] = useState(null); // { line, title, text }
  const [editAll, setEditAll] = useState(false);
  const [dirty, setDirty] = useState(false);
  const more = useMenu();
  const fileRef = useRef(null);

  const text = rp.rulebook?.rulebook || '';
  const book = useMemo(() => parseRulebook(text), [text]);
  const pending = (rp.findings || []).filter((f) => f.status === 'pending');
  const decided = (rp.findings || []).filter((f) => f.status !== 'pending');
  const t = rp.targets;

  const setT = (nt) => { rp.setTargets(nt); rp.estimateWithTargets(nt); setDirty(true); };
  const saveRulebook = async (next, word = 'Rulebook saved.') => {
    try { const d = await rp.send('/api/planner/rulebook', 'PUT', { rulebook: next }); rp.setRulebook(d); rp.setRulebookDraft(d.rulebook || next); snack(word); return true; } catch (e) { snack(e.message, { error: true }); return false; }
  };
  const saveRule = async () => {
    const lines = text.split('\n');
    const r = editRule;
    const body = `* ${r.title.trim() ? `**${r.title.trim()}:** ` : ''}${r.text.trim().replace(/\s*\n\s*/g, ' ')}`;
    const drop = new Set(r.extra || []);
    const next = lines.map((l, i) => (i === r.line ? body : l)).filter((_, i) => !drop.has(i)).join('\n');
    if (await saveRulebook(next, 'Rule saved.')) setEditRule(null);
  };

  return (
    <div className="gutter rpb-plan rpb-rules">
      <Tabs value={tab} onChange={pickTab} tabs={[['targets', 'Targets'], ['rules', 'Rules'], ['suggestions', pending.length ? `Suggestions (${pending.length})` : 'Suggestions'], ['library', 'Library']]} />

      {tab === 'targets' && t && (
        <div key="targets" className="fade-through-in rpb-plan" style={{ paddingBottom: 0 }}>
          <section className="rpb-card rpb-chartcard">
            <div className="hd"><h3>Your glucose targets</h3><span className="muted">Drag the markers, or use the arrow keys. The plan follows as you change them.</span></div>
            <Ruler targets={t} onChange={setT} />
          </section>
          <div className="rpb-stats">
            <Num label="Insulin while running" value={t.sensMult} unit="×" step={0.1} min={1} max={10} onChange={(v) => setT({ ...t, sensMult: v })} help="How much stronger insulin on board acts while you run" />
            <Num label="Your weight" value={t.weightKg ?? 0} unit="kg" step={1} min={30} max={200} onChange={(v) => setT({ ...t, weightKg: v })} help="For the work of the climbs" />
          </div>
          <div className="rpb-acts start"><Btn icon="check" busy={rp.busy === 'targets'} disabled={!dirty} onClick={async () => { await rp.saveTargets(); setDirty(false); }}>Save my targets</Btn></div>
          <section className="rpb-card rpb-chartcard">
            <div className="hd"><h3>What the planner does</h3><span className="muted">With your targets and your rulebook's start window of 7 to 10.</span></div>
            <div className="rpb-matrix">
              <span className="k low">Under {t.floor}</span><span className="v low">Don't set off. Treat the low first, then check again.</span>
              <span className="k eat">{t.floor} to 7</span><span className="v eat">Eat first: the verdict says how much, and the plan adds it at the start.</span>
              <span className="k go">7 to 10</span><span className="v go">Go. With 2 u or more on board, carbs at the start (your rulebook's front-load).</span>
              <span className="k hi">Over 10</span><span className="v hi">Go, watching the trend. Over 15, your rulebook says check ketones first.</span>
            </div>
          </section>
        </div>
      )}

      {tab === 'rules' && (
        <div key="rules" className="fade-through-in rpb-plan" style={{ paddingBottom: 0 }}>
          <div className="rpb-acts start" style={{ alignItems: 'center' }}>
            <div className="chips wrap" style={{ flex: 1 }}>
              {book.sections.map((s, i) => <button key={s.title} type="button" className={`chip sl ${sec === i ? 'on' : ''}`} onClick={() => setSec(i)}>{s.title.replace(/^\d+\.\s*/, '').replace(/\s*&.*$/, '')}</button>)}
            </div>
            <IconButton icon="more" label="More" onClick={more.show} aria-haspopup="menu" />
          </div>
          {book.sections[sec] && (() => {
            const s = book.sections[sec];
            const here = pending.filter((f) => sectionOf(f, book.sections) === s);
            const unplaced = here.filter((f) => !ruleOf(f, s));
            return (
              <section>
                <h3 className="rpb-h3">{s.title}</h3>
                <div className="rpb-rulelist">
                  {s.rules.map((r) => {
                    const sug = here.filter((f) => ruleOf(f, s) === r);
                    return (
                      <div key={r.line}>
                        <div className="rpb-rule">
                          <div className="rt">{r.title && <b>{r.title}</b>}<span>{clean(r.text)}</span></div>
                          <IconButton icon="edit" label={`Edit ${r.title || 'this rule'}`} onClick={() => setEditRule({ ...r, text: clean(r.text) })} />
                        </div>
                        {sug.map((f) => <Suggestion key={f.id} f={f} rp={rp} compact />)}
                      </div>
                    );
                  })}
                  {unplaced.map((f) => <Suggestion key={f.id} f={f} rp={rp} />)}
                  {!s.rules.length && <p className="muted">No rules in this section yet.</p>}
                </div>
              </section>
            );
          })()}
          {!book.sections.length && <p className="muted">Your rulebook is empty.</p>}
        </div>
      )}

      {tab === 'suggestions' && (
        <div key="suggestions" className="fade-through-in rpb-plan" style={{ paddingBottom: 0 }}>
          {!pending.length ? <Banner tone="good" title="Nothing waiting">Suggestions come from scanning your books (Library), pasting research, or your runs (Learning).</Banner> : (
            <>
              <p className="muted">{pending.length} waiting. The first:</p>
              <div className="rpb-card rpb-chartcard"><Suggestion f={pending[0]} rp={rp} /></div>
              {pending.length > 1 && <p className="muted">Then: {pending.slice(1).map((f) => f.title).join(', ')}.</p>}
            </>
          )}
          {decided.length > 0 && (
            <details className="rpb-fold"><summary><Icon n="check" size={20} /><span>Already decided ({decided.length})</span><Icon n="down" size={22} /></summary>
              <div className="fb">{decided.map((f) => <div key={f.id} className="rpb-runrow"><span className="txt"><b>{f.title}</b><span className="muted">{f.status === 'accepted' ? 'Used' : f.status === 'dismissed' ? 'Not for you' : f.status} · from {f.book_title || 'your reading'}</span></span></div>)}</div>
            </details>
          )}
        </div>
      )}

      {tab === 'library' && (
        <div key="library" className="fade-through-in rpb-plan" style={{ paddingBottom: 0 }}>
          <div className="rpb-books">
            {(rp.books || []).map((b, i) => (
              <div key={b.id} className="rpb-card rpb-book">
                <span className={`cover c${i % 3}`}>{b.title}</span>
                <span className="txt"><b>{b.title}</b><span className="muted">{b.page_count ? `${b.page_count} pages` : ''}{b.word_count ? ` · ${Math.round(b.word_count / 1000)}k words` : ''}</span>
                  <span className="rpb-acts start"><Btn kind="tonal" icon="sparkle" busy={rp.busy === `scan-${b.id}`} onClick={() => rp.handleScanBook(b.id)}>Look for suggestions</Btn><IconButton icon="del" label={`Delete ${b.title}`} onClick={() => rp.handleDeleteBook(b)} /></span>
                </span>
              </div>
            ))}
          </div>
          {(rp.books || []).length > 1 && <div className="rpb-acts start"><Btn kind="text" icon="sparkle" busy={rp.busy === 'scan-all'} onClick={() => rp.handleScanBook(null)}>Look through every book</Btn></div>}
          <section className="rpb-card rpb-chartcard">
            <div className="hd"><h3>Add a book</h3><span className="muted">A PDF or a text file. It's read for suggestions to your rulebook.</span></div>
            <div className="rpb-acts start" style={{ alignItems: 'flex-end' }}>
              <TextField label="Title" value={rp.bookUploadTitle} onChange={rp.setBookUploadTitle} style={{ flex: 1, minWidth: 200 }} />
              <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.epub" hidden onChange={(e) => rp.setBookUploadFile(e.target.files?.[0] || null)} />
              <Btn kind="tonal" icon="upload" onClick={() => fileRef.current?.click()}>{rp.bookUploadFile ? rp.bookUploadFile.name.slice(0, 28) : 'Choose the file'}</Btn>
              <Btn icon="add" busy={rp.busy === 'book-upload'} disabled={!rp.bookUploadFile} onClick={rp.handleUploadBook}>Add it</Btn>
            </div>
          </section>
          <section className="rpb-card rpb-chartcard">
            <div className="hd"><h3>Paste some research</h3><span className="muted">An article or a paper's findings. It's compared with your rulebook.</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="rpb-acts start"><TextField label="Title" value={rp.pasteTitle} onChange={rp.setPasteTitle} style={{ flex: 1, minWidth: 200 }} /><TextField label="Where it's from" value={rp.pasteSource} onChange={rp.setPasteSource} style={{ flex: 1, minWidth: 200 }} /></div>
              <TextArea label="The text" rows={5} value={rp.pasteText} onChange={rp.setPasteText} />
              <label className="rpb-check"><input type="checkbox" checked={rp.pasteSaveAsBook} onChange={(e) => rp.setPasteSaveAsBook(e.target.checked)} />Keep it in the library too</label>
              <div className="rpb-acts start"><Btn icon="sparkle" busy={rp.busy === 'research-review'} disabled={(rp.pasteText || '').trim().length < 20} onClick={rp.handleReviewPastedResearch}>Compare with my rulebook</Btn></div>
            </div>
          </section>
        </div>
      )}

      <Menu anchor={more.anchor} open={more.open} onClose={more.close} items={[
        { label: 'Edit the whole rulebook', icon: 'edit', onClick: () => { rp.setRulebookDraft(text); setEditAll(true); } },
        { label: 'Copy the rulebook', icon: 'copy', onClick: rp.copyRulebookText },
        { label: 'Back to the original rulebook', icon: 'sync', danger: true, onClick: rp.handleResetRulebook },
      ]} />
      <Sheet open={Boolean(editRule)} onClose={() => setEditRule(null)} title={editRule?.title ? `Edit: ${editRule.title}` : 'Edit this rule'}
        footer={<div className="rpb-acts"><Btn kind="text" onClick={() => setEditRule(null)}>Cancel</Btn><Btn icon="check" onClick={saveRule}>Save the rule</Btn></div>}>
        {editRule && <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TextField label="Its name" value={editRule.title} onChange={(v) => setEditRule({ ...editRule, title: v })} />
          <TextArea label="The rule" rows={6} value={editRule.text} onChange={(v) => setEditRule({ ...editRule, text: v })} />
        </div>}
      </Sheet>
      <Sheet open={editAll} onClose={() => setEditAll(false)} title="Edit the whole rulebook" wideWidth="860px"
        footer={<div className="rpb-acts"><Btn kind="text" onClick={() => setEditAll(false)}>Cancel</Btn><Btn icon="check" onClick={async () => { if (await saveRulebook(rp.rulebookDraft)) setEditAll(false); }}>Save</Btn></div>}>
        <TextArea label="The rulebook (markdown)" rows={24} value={rp.rulebookDraft} onChange={rp.setRulebookDraft} />
      </Sheet>
    </div>
  );
}
