// Homebrew (beta): the form for a new or existing recipe or brew - every field the classic form has, as Material
// outlined fields in sections. Save answers back (spinner, then a tick); leaving with changes asks first.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  EMPTY_BREW, ING_TYPES, ING_EMOJI, ING_STAGES, STAGE_LABEL, WINE_CATS, WINE_COLOURS, BASIS_WORD, bottlesOf, look, parseSteps, joinSteps,
} from './brewData';
import { api } from './logic';
import { Icon, IconButton, Btn, TextField, TextArea, SelectField, SaveButton, Confirm, useSnack, FilterChip, useScrollState } from './ui';
import { PictureSheet } from './Tools';

const STATUS_LABEL = { planning: 'Planning', fermenting: 'Fermenting', conditioning: 'Clearing', bottled: 'Bottled', finished: 'Finished', dumped: 'Dumped' };
const blankIng = () => ({ type: 'fruit', name: '', amount: '', unit: 'kg', stage: 'primary' });
const pick = (b) => ({ ...EMPTY_BREW, ...Object.fromEntries(Object.keys(EMPTY_BREW).map((k) => [k, b?.[k] ?? EMPTY_BREW[k]])), ingredients: (b?.ingredients || []).map((g) => ({ ...g })) });

export default function BrewForm({ item, kind, meta, onCancel, onSaved, onDeleted, onPicture }) {
  const snack = useSnack();
  const isRecipe = item ? item.isRecipe : kind === 'recipe';
  const [form, setForm] = useState(() => pick(item));
  const [steps, setSteps] = useState(() => { const s = parseSteps(item?.method); return s.length ? s : ['']; });
  const [confirm, setConfirm] = useState(null);
  const [picture, setPicture] = useState(false);
  const start = useRef(JSON.stringify(pick(item)));
  const scroll = useRef(null);
  const { lifted } = useScrollState(scroll);
  const fresh = useRef(new Set()); // ingredients and steps just added (they animate in)
  useEffect(() => { setForm(pick(item)); const s = parseSteps(item?.method); setSteps(s.length ? s : ['']); start.current = JSON.stringify(pick(item)); }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const stylesFor = (id) => (meta.categories.find((x) => x.id === id) || {}).styles || meta.styles || [];
  const styles = stylesFor(form.category);
  const current = { ...form, method: joinSteps(steps) };
  const dirty = JSON.stringify(current) !== JSON.stringify({ ...JSON.parse(start.current), method: joinSteps(parseSteps(JSON.parse(start.current).method)) });
  const bottles = bottlesOf(form.batchLitres, form.category);

  const setIng = (i, k, v) => setForm((f) => ({ ...f, ingredients: f.ingredients.map((g, j) => (j === i ? { ...g, [k]: v } : g)) }));
  const addIng = () => setForm((f) => { fresh.current.add(`i${f.ingredients.length}`); return { ...f, ingredients: [...f.ingredients, blankIng()] }; });
  const removeIng = (i) => {
    const gone = form.ingredients[i];
    setForm((f) => ({ ...f, ingredients: f.ingredients.filter((_, j) => j !== i) }));
    snack(`Removed ${gone.name || 'the ingredient'}.`, { action: { label: 'Undo', onClick: () => setForm((f) => { const l = [...f.ingredients]; l.splice(i, 0, gone); return { ...f, ingredients: l }; }) } });
  };
  const moveStep = (i, d) => setSteps((s) => { const l = [...s]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); return l; });
  const removeStep = (i) => {
    const gone = steps[i];
    setSteps((s) => (s.length > 1 ? s.filter((_, j) => j !== i) : ['']));
    if (gone.trim()) snack('Step removed.', { action: { label: 'Undo', onClick: () => setSteps((s) => { const l = [...s]; l.splice(i, 0, gone); return l; }) } });
  };

  const save = async () => {
    if (!form.name.trim()) { snack('Give it a name first.', { error: true }); return false; }
    try {
      const body = { ...current, ingredients: current.ingredients.filter((g) => g.name?.trim() || g.amount) };
      const d = await api(item ? `/api/homebrew/${item.id}` : '/api/homebrew', item ? 'PUT' : 'POST', item ? body : { ...body, isRecipe });
      start.current = JSON.stringify(pick(d.brew));
      setTimeout(() => onSaved(d.brew), 700);
      return true;
    } catch (e) { snack(e.message, { error: true }); return false; }
  };
  const cancel = () => (dirty ? setConfirm({ title: 'Discard your changes?', body: 'What you\'ve changed here won\'t be saved.', okLabel: 'Discard', danger: true, onOk: onCancel }) : onCancel());
  const remove = () => setConfirm({
    title: `Delete ${item.name}?`, body: item.isRecipe ? 'The recipe goes for good.' : 'The brew and everything logged for it go for good.', okLabel: 'Delete', danger: true,
    onOk: async () => { try { await api(`/api/homebrew/${item.id}`, 'DELETE'); snack(`Deleted ${item.name}.`); onDeleted(); } catch (e) { snack(e.message, { error: true }); } },
  });
  const title = item ? (isRecipe ? 'Edit recipe' : 'Edit brew') : (isRecipe ? 'New recipe' : 'New brew');
  const styleOptions = useMemo(() => (styles.includes(form.style) || !form.style ? styles : [form.style, ...styles]), [styles, form.style]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className={`topbar ${lifted ? 'lift' : ''}`}>
        <IconButton icon="close" label="Cancel" onClick={cancel} />
        <span className="title">{title}</span>
        {item && <IconButton icon="del" label="Delete" onClick={remove} />}
      </div>
      <div className="scroll" ref={scroll}>
        <div className="gutter" style={{ paddingBottom: 32, maxWidth: 840 }}>
          <section className="fsec">
            <h2><Icon n="sparkle" size={20} />What it is</h2>
            <div className="chips wrap" role="radiogroup" aria-label="Type of drink">
              {meta.categories.map((c) => (
                <FilterChip key={c.id} lead={look(c.id).emoji} on={form.category === c.id} onClick={() => setForm((f) => ({ ...f, category: c.id, style: stylesFor(c.id)[0] || f.style }))}>{c.label}</FilterChip>
              ))}
            </div>
            <div className="fgrid">
              <TextField className="full" label="Name" value={form.name} onChange={set('name')} autoFocus={!item} help={!form.name.trim() ? 'Needed to save' : undefined} />
              <SelectField label="Style" value={form.style} onChange={set('style')} options={styleOptions} />
              {!isRecipe && <SelectField label="Stage" value={form.status} onChange={set('status')} options={(meta.statuses || []).map((s) => [s, STATUS_LABEL[s] || s])} />}
              {isRecipe && <TextField label="Batch (litres)" type="number" inputMode="decimal" step="0.1" value={form.batchLitres} onChange={set('batchLitres')} help={bottles ? `Makes ${bottles.text} bottles` : undefined} />}
              <TextArea className="full" label="Summary" rows={2} value={form.summary} onChange={set('summary')} help="What it is and what it's like, in a line or two" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h3 className="t-ts muted">Colour in the jar</h3>
              <div className="chips wrap">
                <FilterChip on={!form.liquidChoice} onClick={() => set('liquidChoice')('')}><span className="swatch" style={{ background: item?.liquid || look(form.category).liquid, width: 14, height: 14, marginRight: 6 }} />Worked out for it</FilterChip>
                <label className={`chip sl ${form.liquidChoice ? 'on' : ''}`} style={{ cursor: 'pointer' }}>
                  <input type="color" value={form.liquidChoice || item?.liquid || look(form.category).liquid} onChange={(e) => set('liquidChoice')(e.target.value)} style={{ width: 18, height: 18, border: 0, padding: 0, background: 'none', marginRight: 6 }} aria-label="Choose your own colour" />
                  {form.liquidChoice ? 'Your colour' : 'Choose your own'}
                </label>
                {item && <button type="button" className="chip sl" onClick={() => (onPicture ? onPicture() : setPicture(true))}><span className="lead"><Icon n="image" size={18} /></span>Change picture</button>}
              </div>
            </div>
          </section>

          {!isRecipe && (
            <section className="fsec">
              <h2><Icon n="flask" size={20} />Batch and dates</h2>
              <div className="fgrid three">
                <TextField label="Batch (litres)" type="number" inputMode="decimal" step="0.1" value={form.batchLitres} onChange={set('batchLitres')} help={bottles ? `Makes ${bottles.text} bottles` : undefined} />
                <TextField label="Yeast pitched on" type="date" value={form.startedOn} onChange={set('startedOn')} />
                <TextField label="Bottled on" type="date" value={form.bottledOn} onChange={set('bottledOn')} />
              </div>
            </section>
          )}

          <section className="fsec">
            <h2><Icon n="chart" size={20} />Gravity and taste</h2>
            <div className="fgrid four">
              <TextField label="Target OG" type="number" inputMode="decimal" step="0.001" value={form.targetOg} onChange={set('targetOg')} help="Original gravity, e.g. 1.100" />
              <TextField label="Target FG" type="number" inputMode="decimal" step="0.001" value={form.targetFg} onChange={set('targetFg')} help="Final gravity, e.g. 1.015" />
              {!isRecipe && <TextField label="Actual OG" type="number" inputMode="decimal" step="0.001" value={form.og} onChange={set('og')} help="First reading" />}
              {!isRecipe && <TextField label="Actual FG" type="number" inputMode="decimal" step="0.001" value={form.fg} onChange={set('fg')} help="Final reading" />}
            </div>
            <div className="fgrid three">
              <SelectField label="Sweetness" value={form.sweetness} onChange={set('sweetness')} options={[['', 'Not set'], ...['dry', 'medium', 'sweet'].map((s) => [s, s[0].toUpperCase() + s.slice(1)]), ...(['dry', 'medium', 'sweet', ''].includes(form.sweetness || '') ? [] : [[form.sweetness, form.sweetness]])]}
                help={item?.sweetnessBasis ? `Now ${BASIS_WORD[item.sweetnessBasis]}` : undefined} />
              <SelectField label="Fizz" value={form.carbonation} onChange={set('carbonation')} options={[['', 'Not set'], ['still', 'Still'], ['petillant', 'Pétillant (lightly fizzy)'], ['sparkling', 'Sparkling']]} />
              {WINE_CATS.includes(form.category) && <SelectField label="Wine colour" value={form.colour} onChange={set('colour')} options={[['', 'Not set'], ...WINE_COLOURS.map((w) => [w.id, w.label])]} />}
            </div>
          </section>

          <section className="fsec">
            <h2 style={{ justifyContent: 'space-between' }}><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Icon n="leaf" size={20} />Ingredients <span className="muted t-bm">{form.ingredients.length}</span></span></h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {form.ingredients.map((g, i) => (
                <div key={i} className="ingcard" style={fresh.current.has(`i${i}`) ? undefined : { animation: 'none' }}>
                  <div className="hd">
                    <span style={{ fontSize: 20 }}>{ING_EMOJI[g.type] || '🧪'}</span>
                    <span className="t">{g.name?.trim() || `Ingredient ${i + 1}`}</span>
                    <IconButton icon="del" label={`Remove ${g.name || 'this ingredient'}`} onClick={() => removeIng(i)} />
                  </div>
                  <div className="fgrid four">
                    <TextField className="full" label="Ingredient" value={g.name} onChange={(v) => setIng(i, 'name', v)} />
                    <TextField label="Amount" inputMode="decimal" value={g.amount} onChange={(v) => setIng(i, 'amount', v)} />
                    <TextField label="Unit" value={g.unit} onChange={(v) => setIng(i, 'unit', v)} help="kg, g, L, tsp…" />
                    <SelectField label="Kind" value={g.type || 'other'} onChange={(v) => setIng(i, 'type', v)} options={ING_TYPES.map((t) => [t, `${ING_EMOJI[t]} ${t[0].toUpperCase()}${t.slice(1)}`])} />
                    <SelectField label="When" value={g.stage || 'primary'} onChange={(v) => setIng(i, 'stage', v)} options={ING_STAGES.map((s) => [s, STAGE_LABEL[s]])} />
                  </div>
                </div>
              ))}
              {!form.ingredients.length && <p className="muted">No ingredients yet.</p>}
              <Btn kind="tonal" icon="add" onClick={addIng} style={{ alignSelf: 'flex-start' }}>Add ingredient</Btn>
            </div>
          </section>

          <section className="fsec">
            <h2><Icon n="note" size={20} />Method</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {steps.map((s, i) => (
                <div key={i} className="step-row" style={fresh.current.has(`s${i}`) ? undefined : { animation: 'none' }}>
                  <span className="no">{i + 1}</span>
                  <TextArea label={`Step ${i + 1}`} rows={2} value={s} onChange={(v) => setSteps((l) => l.map((x, j) => (j === i ? v : x)))} />
                  <span className="tools">
                    <IconButton icon="up" label="Move up" disabled={i === 0} onClick={() => moveStep(i, -1)} />
                    <IconButton icon="down" label="Move down" disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)} />
                  </span>
                  <IconButton icon="del" label={`Remove step ${i + 1}`} onClick={() => removeStep(i)} style={{ marginTop: 4 }} />
                </div>
              ))}
              <Btn kind="tonal" icon="add" onClick={() => setSteps((l) => { fresh.current.add(`s${l.length}`); return [...l, '']; })} style={{ alignSelf: 'flex-start' }}>Add step</Btn>
            </div>
          </section>

          <section className="fsec">
            <h2><Icon n="flask" size={20} />Yeast and nutrients</h2>
            <div className="fgrid">
              <TextField label="Yeast" value={form.yeast} onChange={set('yeast')} help="e.g. Lalvin 71B, 1 sachet" />
              <TextField label="How it was pitched" value={form.yeastNotes} onChange={set('yeastNotes')} help="e.g. rehydrated with Go-Ferm at 40°C" />
              <TextField label="Nutrients" value={form.nutrients} onChange={set('nutrients')} help="e.g. Fermaid-O, 4 doses of 1.5 g" />
              <TextField label="Water" value={form.water} onChange={set('water')} help="e.g. tap, Campden-treated" />
            </div>
          </section>

          <section className="fsec">
            <h2><Icon n="book" size={20} />Notes and source</h2>
            <div className="fgrid">
              <TextArea className="full" label="Notes" rows={4} value={form.notes} onChange={set('notes')} />
              <TextField label="Where the recipe came from" value={form.sourceName} onChange={set('sourceName')} />
              <TextField label="Link to it" type="url" inputMode="url" value={form.sourceUrl} onChange={set('sourceUrl')} />
            </div>
          </section>
        </div>
      </div>
      <div className="bottombar" style={{ gap: 8, paddingLeft: 16 }}>
        <Btn kind="text" onClick={cancel}>Cancel</Btn>
        <span className="grow" />
        <SaveButton label={item ? 'Save' : (isRecipe ? 'Create recipe' : 'Create brew')} doneLabel="Saved" onSave={save} disabled={!form.name.trim()} />
      </div>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      {item && <PictureSheet open={picture} onClose={() => setPicture(false)} brew={item} onPicked={() => { setPicture(false); snack('Picture changed.'); }} />}
    </div>
  );
}
