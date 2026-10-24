// Face Designer in the IMS design (24 Oct 2026): design Ims's faces on the desk's 12x8 dot grid and decide when each
// is used. The faces in a gallery (they play when you point at them); the chosen one opens in the editor: paint its
// resting and speaking frames, its moving eyes and the eyes it follows you with, its colour, and when Ims should pull
// it. The other face styles (vector, oscilloscope, orc and so on) can be previewed, with accessories, and given to a
// persona. New face is the button in the bottom right. The same /api/face-designs and /api/personas requests as
// before (Dashboard/FaceDesignerPortal.jsx); the drawing pieces are in faceKit.jsx, unchanged.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ServicePage, { Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextField, TextArea, SelectField, FilterChip, Segmented, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';
import ImsFace from '../Ims/ImsFace';
import usePersonaVoice from '../../hooks/usePersonaVoice';
import { EMOTIONS, FACE_STYLES, ACCESSORY_OPTIONS, HAIR_COLORS, GLASSES_COLORS } from '../Ims/faceEmotions';
import { COLS, ROWS, EMPTY_GRID, BRUSHES, FRAMES, DotGrid, EYE_LEN, MAX_CELLS, defaultCells, totalMs, isAnimated, LOOKS, followEyes, TalkingPreview, FaceThumb } from './faceKit';

const STYLES = [['dots', 'Dot matrix'], ['vector', 'Vector'], ['oscilloscope', 'Oscilloscope'], ['geometric', 'Geometric'], ['orc', 'Orc chief'], ['steampunk', 'Steampunk'], ['chronicler', 'Chronicler']];
const STYLE_NOTE = {
  dots: 'The 12x8 dot grid on the desk, with its breathing background dots',
  vector: 'Curved eyelids, glances and a morphing mouth',
  oscilloscope: 'Looping eye traces and a rippling mouth',
  geometric: 'Hinged brow plates and a jaw that moves with the voice',
  orc: 'A painted portrait: lip-sync, blinking, breathing and head movement',
  steampunk: 'Turning brass gears, a pressure gauge and puffs of steam',
  chronicler: 'A painted portrait: lip-sync, blinking, breathing and head movement',
};
const SWATCHES = ['4CFF7A', 'FFD700', '00E5FF', 'FF3385', 'FFB84D', '33FFB8', '99FF33', '4D94FF', 'FF7733', 'FF2222', 'BA68C8', 'FFFFFF'];
const NO_ACC = { glasses: 'none', hair: 'none', facialHair: 'none', hairColor: '#16161a', glassesColor: '#d4af37', facialHairColor: '#16161a' };
const PARAMS = {
  vector: (p) => [['Brows', `L ${p.browLeft ?? 0} / R ${p.browRight ?? 0}`], ['Eyes open', `L ${Math.round((p.eyeLeftOpen ?? 1) * 100)}% / R ${Math.round((p.eyeRightOpen ?? 1) * 100)}%`], ['Pupils', `x ${p.pupilX ?? 0} / y ${p.pupilY ?? 0}`], ['Smile', `${p.mouthSmile ?? 0} (width ${p.mouthWidth ?? 40})`]],
  oscilloscope: (p) => [['Frequency', `${p.freq ?? 1.5} Hz`], ['Harmonics', p.harmonics ?? 2], ['Jitter', `${Math.round((p.jitter ?? 0.02) * 100)}%`], ['Wave', p.waveType ?? 'sine']],
  geometric: (p) => [['Brow pitch', `${p.browPitch ?? 0}°`], ['Eye opening', `${Math.round((p.eyeAperture ?? 1) * 100)}%`], ['Jaw drop', p.jawDrop ?? 0], ['Facet angle', `${p.facetAngle ?? 0}°`]],
  orc: (p) => [['Brow angle', `${p.browAngle ?? 0}°`], ['Tusks', `${p.tuskHeight ?? 18} px, tilt ${p.tuskAngle ?? 0}°`], ['Jaw drop', p.jawDrop ?? 0], ['War paint', `${Math.round((p.warpaintIntensity ?? 0.5) * 100)}%`]],
  steampunk: (p) => [['Gear speed', `${p.gearSpeed ?? 1}×`], ['Pressure dial', `${p.dialAngle ?? 30}°`], ['Iris shutter', `${Math.round((p.shutterOpen ?? 0.9) * 100)}%`], ['Steam', `${Math.round((p.steamPuff ?? 0.2) * 100)}%`]],
};

function Backups({ face, onRestored, confirmIt }) {
  const snack = useSnack();
  const [list, setList] = useState(null);
  const [label, setLabel] = useState('');
  const [hover, setHover] = useState(null);
  const load = useCallback(async () => { try { const d = await (await fetch(`/api/face-designs/${face.id}/backups`)).json(); setList(d.success ? d.backups : []); } catch { setList([]); } }, [face.id]);
  useEffect(() => { load(); }, [load]);
  const backup = async () => {
    const d = await (await fetch(`/api/face-designs/${face.id}/backups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }) })).json();
    if (!d.success) return snack(d.error || 'The backup failed.', { error: true });
    setLabel(''); snack('Backed up.'); load();
  };
  const restore = (b) => confirmIt({ title: `Restore “${face.name}”?`, body: `Back to the backup from ${new Date(b.createdAt).toLocaleString('en-GB')}. The version it has now is backed up first.`, okLabel: 'Restore', onOk: async () => {
    const d = await (await fetch(`/api/face-designs/backups/${b.id}/restore`, { method: 'POST' })).json();
    if (!d.success) return snack(d.error || 'It couldn\'t be restored.', { error: true });
    snack('Restored.'); load(); onRestored();
  } });
  const remove = async (b) => { await fetch(`/api/face-designs/backups/${b.id}`, { method: 'DELETE' }); load(); };
  return (
    <details className="imsm-fold" style={{ margin: 0 }}>
      <summary><Icon n="archive" size={20} /><span>Backups of “{face.name}”{list ? ` (${list.length})` : ''}</span><Icon n="down" size={22} /></summary>
      <div className="imsm-fd-backups">
        <p className="muted">Everything about this face as last saved: both frames, colour, eye movement and scenarios. Save your changes first if you want them in it. Restoring backs up the version it has now first.</p>
        <div className="imsm-ask"><TextField label="Label (optional)" value={label} onChange={setLabel} placeholder="For example: before the new eyes" onKeyDown={(e) => e.key === 'Enter' && backup()} /><Btn kind="tonal" icon="archive" onClick={backup}>Back up now</Btn></div>
        {list == null ? <Spinner /> : !list.length ? <p className="muted">No backups of this face yet.</p> : (
          <div className="grid">
            {list.map((b) => (
              <div key={b.id} className="bk" onMouseEnter={() => setHover(b.id)} onMouseLeave={() => setHover(null)}>
                {hover === b.id ? <TalkingPreview face={b} size={8} gap={2} fluid /> : <DotGrid grid={b.grid} color={b.color} size={8} gap={2} fluid />}
                <b>{b.label || 'Backup'}</b>
                <small>{new Date(b.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{b.eyeAnim?.enabled ? ' · moving eyes' : ''}</small>
                <div className="imsm-row"><Btn kind="tonal" icon="back" onClick={() => restore(b)}>Restore</Btn><IconButton icon="del" label="Delete this backup" onClick={() => remove(b)} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function Accessories({ value, onChange }) {
  const group = (key, title, options, colourKey, colours) => (
    <div className="imsm-acc">
      <b>{title}</b>
      <div className="chips wrap">{options.map((o) => <FilterChip key={o.id} on={value[key] === o.id} onClick={() => onChange({ ...value, [key]: o.id })}>{o.name || o.label}</FilterChip>)}</div>
      <div className="sw">{colours.map((c) => <button key={c.hex} type="button" className={`swatch sl ${value[colourKey] === c.hex ? 'on' : ''}`} style={{ background: c.hex }} title={c.name || c.label} aria-label={c.name || c.label} onClick={() => onChange({ ...value, [colourKey]: c.hex })} />)}</div>
    </div>
  );
  return (
    <div className="imsm-list">
      {group('glasses', 'Glasses', ACCESSORY_OPTIONS.glasses, 'glassesColor', GLASSES_COLORS)}
      {group('hair', 'Hair', ACCESSORY_OPTIONS.hair, 'hairColor', HAIR_COLORS)}
      {group('facialHair', 'Beard and moustache', ACCESSORY_OPTIONS.facialHair, 'facialHairColor', HAIR_COLORS)}
    </div>
  );
}

function Body() {
  const snack = useSnack();
  const [faces, setFaces] = useState(null);
  const [deleted, setDeleted] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState({ name: '', grid: EMPTY_GRID, openGrid: EMPTY_GRID, color: '4CFF7A', scenarios: '', eyeAnim: { enabled: false, cells: [] }, eyeLook: null });
  const [frame, setFrame] = useState('grid'); // grid | openGrid | cell | lookLeft | lookAhead | lookRight
  const [cellIdx, setCellIdx] = useState(0);
  const [hoverId, setHoverId] = useState(null);
  const [brush, setBrush] = useState('f');
  const [busy, setBusy] = useState(false);
  const [style, setStyle] = useState('dots'); // the face style on show; 'all' shows every style side by side
  const [accOn, setAccOn] = useState(false);
  const [acc, setAcc] = useState(NO_ACC);
  const [accSheet, setAccSheet] = useState(false);
  const [personas, setPersonas] = useState([]);
  const [forPersona, setForPersona] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const level = useRef(0);
  const editorRef = useRef(null);
  const voice = usePersonaVoice();

  useEffect(() => { setSpeaking(voice.playing); }, [voice.playing]);
  useEffect(() => { if (voice.error) snack(voice.error, { error: true }); }, [voice.error]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let raf = 0;
    if (speaking || hoverId !== null) {
      const loop = (now) => { level.current = voice.playing ? voice.levelRef.current : (Math.sin(now / 130) * 0.4 + 0.5) * (0.3 + Math.random() * 0.6); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    } else level.current = 0;
    return () => cancelAnimationFrame(raf);
  }, [speaking, hoverId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetch('/api/personas').then((r) => r.json()).then((d) => { if (!d.personas) return; setPersonas(d.personas); setForPersona((c) => c || d.activeId || d.personas[0]?.id || ''); }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try { const d = await (await fetch('/api/face-designs')).json(); if (d.success) { setFaces(d.faces); setDeleted(d.deleted); return d.faces; } } catch (e) { snack(e.message, { error: true }); }
    setFaces((f) => f || []);
    return [];
  }, [snack]);
  const select = (f) => {
    setSelectedId(f.id); setIsNew(false); setFrame('grid'); setCellIdx(0);
    setDraft({ name: f.name, grid: f.grid, openGrid: f.openGrid, color: f.color, scenarios: f.scenarios, eyeAnim: f.eyeAnim || { enabled: false, cells: [] }, eyeLook: f.eyeLook || null });
  };
  useEffect(() => { load().then((f) => { if (f[0]) select(f[0]); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const goEditor = () => setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  const startNew = (from = null) => {
    setSelectedId(null); setIsNew(true); setFrame('grid'); setCellIdx(0); setStyle('dots');
    setDraft(from
      ? { name: `${from.name}_copy`, grid: from.grid, openGrid: from.openGrid, color: from.color, scenarios: from.scenarios, eyeAnim: JSON.parse(JSON.stringify(from.eyeAnim || { enabled: false, cells: [] })), eyeLook: from.eyeLook ? { ...from.eyeLook } : null }
      : { name: '', grid: EMPTY_GRID, openGrid: EMPTY_GRID, color: '4CFF7A', scenarios: '', eyeAnim: { enabled: false, cells: [] }, eyeLook: null });
    goEditor();
  };

  const selected = (faces || []).find((f) => f.id === selectedId) || null;
  const animated = isAnimated(draft.eyeAnim);
  const cells = draft.eyeAnim?.cells || [];
  const ci = Math.min(cellIdx, cells.length - 1);
  const cell = cells[ci];
  const editingCell = frame === 'cell' && animated;
  const activeFrame = editingCell ? 'cell' : frame === 'cell' ? 'grid' : frame;
  const editingLook = LOOKS.find((l) => l.frame === frame) || null;
  const follow = followEyes(draft);
  const setCells = (fn) => setDraft((d) => ({ ...d, eyeAnim: { ...d.eyeAnim, cells: fn(d.eyeAnim.cells) } }));
  const patchCell = (i, patch) => setCells((cs) => cs.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const shownGrid = editingLook ? follow[editingLook.key] + draft.grid.slice(EYE_LEN)
    : editingCell ? cell.grid + draft.grid.slice(EYE_LEN)
    : animated ? cell.grid + draft[activeFrame].slice(EYE_LEN)
    : draft[activeFrame];
  const editRange = editingLook || editingCell ? [0, EYE_LEN] : animated ? [EYE_LEN, COLS * ROWS] : null;

  // a stroke lights dots with the brush, or switches them off if it started on a dot already that level
  const stroke = useRef(brush);
  const paint = (i, start = false) => {
    const flip = (chars) => { if (start) stroke.current = (brush !== '0' && chars[i] === brush) ? '0' : brush; chars[i] = stroke.current; return chars.join(''); };
    if (editingLook) {
      if (i >= EYE_LEN) return;
      setDraft((d) => { const f = followEyes(d); const look = d.eyeLook || { ahead: f.ahead, left: f.left, right: f.right }; return { ...d, eyeLook: { ...look, [editingLook.key]: flip(look[editingLook.key].split('')) } }; });
      return;
    }
    if (editingCell) { if (i >= EYE_LEN) return; patchCell(ci, { grid: flip(cell.grid.split('')) }); return; }
    if (animated && i < EYE_LEN) return;
    setDraft((d) => ({ ...d, [activeFrame]: flip(d[activeFrame].split('')) }));
  };
  const clear = () => (editingLook ? setDraft((d) => { const f = followEyes(d); const look = d.eyeLook || { ahead: f.ahead, left: f.left, right: f.right }; return { ...d, eyeLook: { ...look, [editingLook.key]: '0'.repeat(EYE_LEN) } }; })
    : editingCell ? patchCell(ci, { grid: '0'.repeat(EYE_LEN) })
    : setDraft((d) => ({ ...d, [activeFrame]: (animated ? d[activeFrame].slice(0, EYE_LEN) : '') + '0'.repeat(animated ? COLS * ROWS - EYE_LEN : COLS * ROWS) })));
  const setAnimated = (on) => setDraft((d) => { const ex = d.eyeAnim?.cells || []; return { ...d, eyeAnim: { enabled: on, cells: on && !ex.length ? defaultCells(d.grid) : ex } }; });
  const selectCell = (i) => { setCellIdx(i); setFrame('cell'); };
  const addCell = (at = ci) => {
    if (cells.length >= MAX_CELLS) return;
    const src = cells[at] || { name: 'Cell', ms: 500, grid: draft.grid.slice(0, EYE_LEN) };
    setCells((cs) => [...cs.slice(0, at + 1), { ...src, name: `${src.name} copy`.slice(0, 24) }, ...cs.slice(at + 1)]);
    selectCell(at + 1);
  };
  const moveCell = (i, by) => setCells((cs) => { const j = i + by; if (j < 0 || j >= cs.length) return cs; const n = cs.slice(); [n[i], n[j]] = [n[j], n[i]]; return n; });
  const removeCell = (i) => { if (cells.length <= 1) return; setCells((cs) => cs.filter((_, k) => k !== i)); setCellIdx(Math.max(0, Math.min(cellIdx, cells.length - 2))); };

  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch(isNew ? '/api/face-designs' : `/api/face-designs/${selectedId}`, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'It couldn\'t be saved.');
      snack(isNew ? `“${d.face.name}” created.` : 'Saved. Ims uses it from his next conversation.');
      const list = await load();
      const f = list.find((x) => x.id === d.face.id);
      if (f) select(f);
    } catch (e) { snack(e.message, { error: true }); }
    setBusy(false);
  };
  const call = async (url, method, word, after) => {
    const r = await fetch(url, { method }); const d = await r.json();
    if (!r.ok) return snack(d.error || 'It didn\'t work.', { error: true });
    snack(word); const list = await load(); after?.(list);
  };
  const archive = () => setConfirm({ title: `Archive “${selected.name}”?`, body: 'Ims stops using it. You can bring it back from the archive.', okLabel: 'Archive', danger: true, onOk: () => call(`/api/face-designs/${selected.id}`, 'DELETE', 'Moved to the archive.', (l) => l[0] && select(l[0])) });
  const reset = () => setConfirm({ title: `Put “${selected.name}” back to its original look?`, body: 'Its scenarios are kept.', okLabel: 'Reset', onOk: () => call(`/api/face-designs/${selected.id}/reset`, 'POST', 'Back to the original face.', (l) => { const f = l.find((x) => x.id === selected.id); if (f) select(f); }) });
  const rebuild = () => setConfirm({ title: 'Rebuild the eye timeline?', body: 'It\'s replaced with four new cells (open, blink, look left, look right) made from this face\'s eyes now.', okLabel: 'Rebuild', onOk: () => { setDraft((d) => ({ ...d, eyeAnim: { enabled: true, cells: defaultCells(d.grid) } })); setCellIdx(0); } });
  const preview = async () => {
    try {
      const r = await fetch('/api/face-designs/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: draft.name || 'preview', grid: draft.grid, openGrid: draft.openGrid, color: draft.color, eyeAnim: draft.eyeAnim, eyeLook: draft.eyeLook }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'It couldn\'t be shown.');
      snack('Showing on the desk for about 20 seconds. Say something to see the mouth move.');
    } catch (e) { snack(e.message, { error: true }); }
  };
  const giveToPersona = async () => {
    const p = personas.find((x) => x.id === forPersona);
    if (!p || style === 'all') return;
    try {
      const r = await fetch(`/api/personas/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meta: { faceStyle: style, accessories: acc } }) });
      const d = await r.json();
      if (!r.ok || d.success === false) throw new Error(d.error || 'The face couldn\'t be saved.');
      setPersonas((l) => l.map((x) => (x.id === p.id ? { ...x, faceStyle: style } : x)));
      snack(`${p.name} now uses this face.`);
    } catch (e) { snack(e.message, { error: true }); }
  };
  const toggleVoice = () => ((voice.busy || voice.playing) ? voice.stop() : voice.say(forPersona, { emotion: draft.name || 'neutral' }));
  const accessories = accOn ? acc : null;
  const faceFor = (st) => (st === 'dots'
    ? { faceStyle: 'dots', grid: draft.grid, openGrid: draft.openGrid, color: draft.color, eyeAnim: draft.eyeAnim, emotion: draft.name, faceEmotion: draft.name, accessories }
    : st === 'chronicler' ? { faceStyle: 'chronicler', emotion: draft.name, faceEmotion: draft.name }
    : { faceStyle: st, color: draft.color, emotion: draft.name, faceEmotion: draft.name, accessories });
  const listStyle = style === 'all' ? 'dots' : style;
  const personaNow = personas.find((p) => p.id === forPersona);
  const params = PARAMS[style]?.((EMOTIONS[draft.name] || EMOTIONS.neutral || {})[style] || {});

  const VoiceBtn = () => (
    <span className="imsm-row">
      <Btn kind={speaking ? 'filled' : 'tonal'} icon={speaking ? 'stop' : 'play'} busy={voice.busy} onClick={toggleVoice}>{voice.busy ? 'Writing a line…' : speaking ? 'Stop' : 'Hear it speak'}</Btn>
      {voice.said && (voice.playing || voice.busy) && <q className="said">{voice.said}</q>}
    </span>
  );

  return (
    <>
      <section className="imsm-card">
        <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
          <h3><Icon n="palette" size={20} />Face style</h3>
          <span className="imsm-row">
            <Btn kind={accOn ? 'filled' : 'text'} icon="face" onClick={() => setAccSheet(true)}>{accOn ? 'Accessories on' : 'Accessories'}</Btn>
          </span>
        </div>
        <div className="chips wrap">
          {STYLES.map(([k, l]) => <FilterChip key={k} on={style === k} onClick={() => setStyle(k)}>{l}</FilterChip>)}
          <FilterChip on={style === 'all'} onClick={() => setStyle('all')}>All side by side</FilterChip>
        </div>
        {personas.length > 0 && (
          <div className="imsm-ask">
            <SelectField label="Give the style on show to" value={forPersona} onChange={setForPersona} options={personas.map((p) => [p.id, `${p.name}${p.faceStyle ? ` (now ${FACE_STYLES.find((s) => s.id === p.faceStyle)?.name || p.faceStyle})` : ''}`])} />
            <Btn kind="tonal" icon="check" disabled={style === 'all' || personaNow?.faceStyle === style} onClick={giveToPersona} title={style === 'all' ? 'Pick one style first' : ''}>{personaNow?.faceStyle === style ? 'In use' : 'Use this style'}</Btn>
          </div>
        )}
      </section>

      <div className="imsm-fd">
        <section className="imsm-card gal">
          <h3><Icon n="face" size={20} />Faces{faces ? ` (${faces.length})` : ''}</h3>
          <p className="muted" style={{ margin: 0 }}>Point at one to see it talk.</p>
          {faces == null ? <Spinner /> : (
            <div className="imsm-faces">
              {faces.map((f) => (
                <button key={f.id} type="button" className={`fc sl ${selectedId === f.id && !isNew ? 'on' : ''}`} onClick={() => { select(f); if (window.matchMedia('(max-width: 899px)').matches) goEditor(); }}
                  onMouseEnter={() => setHoverId(f.id)} onMouseLeave={() => setHoverId((h) => (h === f.id ? null : h))}>
                  <FaceThumb face={f} hovering={hoverId === f.id} style={listStyle} levelRef={level} isSpeaking={speaking} accessories={accessories} />
                  <span className="nm">{f.name}{f.selectable === false && <span className="tag quiet">automatic</span>}</span>
                </button>
              ))}
            </div>
          )}
          {deleted.length > 0 && (
            <details className="imsm-fold" style={{ margin: 0 }}>
              <summary><Icon n="archive" size={20} /><span>Archived ({deleted.length})</span><Icon n="down" size={22} /></summary>
              <ul className="imsm-arch">
                {deleted.map((f) => <li key={f.id}><DotGrid grid={f.grid} color={f.color} size={5} gap={1} /><b>{f.name}</b><Btn kind="text" icon="back" onClick={() => call(`/api/face-designs/${f.id}/restore`, 'POST', 'Restored.')}>Bring back</Btn></li>)}
              </ul>
            </details>
          )}
        </section>

        <section className="imsm-card ed" ref={editorRef}>
          <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
            <h3><Icon n="edit" size={20} />{isNew ? 'A new face' : selected ? `“${selected.name}”` : 'Pick a face'}</h3>
            {(isNew || selected) && <span className="imsm-row" style={{ gap: 0 }}>
              <IconButton icon="play" label="Show it on the desk now" onClick={preview} />
              {!isNew && selected && <IconButton icon="copy" label="Duplicate it" onClick={() => startNew(selected)} />}
              {!isNew && selected?.hasDefault && !selected.shapeLocked && <IconButton icon="sync" label="Back to its original look" onClick={reset} />}
              {!isNew && selected && !selected.builtin && <IconButton icon="del" label="Archive it" onClick={archive} />}
            </span>}
          </div>
          {(isNew || selected) && (
            <>
              {selected?.name === 'standby' && !isNew && <div className="imsm-banner info"><Icon n="info" size={22} /><span>Ims's resting face: on screen whenever he's idle, and while he talks with no other face chosen. He never picks it, so it has no scenarios. While listening, thinking, connecting or recording he keeps his own state faces so you can tell what he's doing.</span></div>}

              {style === 'all' && (
                <div className="imsm-fd-all">
                  <VoiceBtn />
                  <div className="g">
                    {STYLES.map(([k, l]) => (
                      <div key={k} className="st">
                        <div className="imsm-row" style={{ justifyContent: 'space-between' }}><b>{l}</b><Btn kind="text" onClick={() => setStyle(k)}>{k === 'dots' ? 'Paint it' : 'Look closer'}</Btn></div>
                        <ImsFace face={faceFor(k)} status={speaking ? 'speaking' : 'idle'} levelRef={level} width="100%" />
                        <small>{STYLE_NOTE[k]}</small>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {style !== 'dots' && style !== 'all' && (
                <div className="imsm-fd-one">
                  <VoiceBtn />
                  <div className="pv"><ImsFace face={faceFor(style)} status={speaking ? 'speaking' : 'idle'} levelRef={level} width={300} /></div>
                  <p className="muted" style={{ margin: 0, textAlign: 'center' }}>{STYLE_NOTE[style]}</p>
                  {params && <div className="imsm-params">{params.map(([k, v]) => <span key={k}><small>{k}</small><b>{v}</b></span>)}</div>}
                </div>
              )}

              {style === 'dots' && (
                <div className="imsm-paint">
                  <div className="left">
                    <span className="lbl">What you're painting</span>
                    <div className="chips wrap">
                      {FRAMES.map((fr) => <FilterChip key={fr.key} on={activeFrame === fr.key && !editingLook} onClick={() => setFrame(fr.key)}>{fr.label}</FilterChip>)}
                      {animated && cells.map((c, i) => <FilterChip key={`c${i}`} on={activeFrame === 'cell' && i === ci} onClick={() => selectCell(i)}>Eyes: {c.name}</FilterChip>)}
                      {LOOKS.map((l) => <FilterChip key={l.frame} on={frame === l.frame} onClick={() => setFrame(l.frame)}>Following {l.label.toLowerCase()}</FilterChip>)}
                    </div>
                    <div className="canvas"><DotGrid grid={shownGrid} color={draft.color} size={22} gap={4} fluid editable editRange={editRange} onPaint={paint} /></div>
                    <p className="muted hint">
                      {editingLook ? `The eyes looking ${editingLook.key === 'ahead' ? 'ahead' : `${editingLook.key} (as you look at the screen)`} while Ims follows someone at the desk. ${follow.source === 'designed' ? 'This face has its own.' : follow.source === 'timeline' ? 'Showing the timeline\'s look cells; painting makes them this face\'s own.' : 'Showing the automatic eyes; painting makes them this face\'s own.'}`
                        : activeFrame === 'cell' ? `The eyes of the “${cell?.name}” cell (top five rows). The greyed rows are the mouth.`
                        : animated ? `The ${activeFrame === 'grid' ? 'closed' : 'open'} mouth (bottom three rows). The eyes come from the cell you've chosen.`
                        : activeFrame === 'grid' ? 'The resting face: eyes and a closed mouth.' : 'The same face with the mouth open, shown while Ims speaks.'}
                    </p>
                    <div className="imsm-row">
                      <Segmented label="Brush" value={brush} onChange={setBrush} options={BRUSHES.map((b) => [b.key, b.label])} />
                      <Btn kind="text" icon="del" onClick={clear}>Clear</Btn>
                      {editingLook && draft.eyeLook && <Btn kind="text" icon="back" onClick={() => setDraft((d) => ({ ...d, eyeLook: null }))}>Use the {isAnimated(draft.eyeAnim) && draft.eyeAnim.cells.some((c) => /look\s*left/i.test(c.name || '')) ? 'timeline\'s' : 'automatic'} eyes</Btn>}
                    </div>
                    {!animated && (
                      <div className="imsm-row">
                        <Btn kind="text" icon="copy" onClick={() => setDraft((d) => ({ ...d, openGrid: d.grid.slice(0, EYE_LEN) + d.openGrid.slice(EYE_LEN) }))} title="Copy the eyes (top five rows) from the resting face into the speaking face">Eyes into the open mouth</Btn>
                        <Btn kind="text" icon="copy" onClick={() => setDraft((d) => ({ ...d, openGrid: d.grid }))} title="Start the speaking face as a copy of the resting face">Copy the whole face</Btn>
                      </div>
                    )}
                    <p className="muted hint">Tap or drag to light dots; start on a lit dot with the same brush to switch them off. Mouths are the bottom three rows; the eyes above are usually the same in both frames.</p>
                  </div>
                  <div className="right">
                    <div className="imsm-row" style={{ justifyContent: 'space-between' }}><span className="lbl">Talking</span><VoiceBtn /></div>
                    <div className="pv"><ImsFace face={faceFor('dots')} status={speaking ? 'speaking' : 'idle'} levelRef={level} width="100%" /></div>
                    <TextField label="Name" value={draft.name} disabled={!isNew && selected?.builtin} onChange={(v) => setDraft({ ...draft, name: v })} help="Letters, numbers and underscores: the exact name Ims uses to pick it." />
                    <div className="imsm-colour">
                      <span className="lbl">Colour</span>
                      <div className="imsm-row">
                        <input type="color" value={`#${draft.color}`} onChange={(e) => setDraft({ ...draft, color: e.target.value.slice(1).toUpperCase() })} aria-label="Pick a colour" />
                        <code>#{draft.color}</code>
                      </div>
                      <div className="sw">{SWATCHES.map((c) => <button key={c} type="button" className={`swatch sl ${draft.color === c ? 'on' : ''}`} style={{ background: `#${c}` }} aria-label={`#${c}`} onClick={() => setDraft({ ...draft, color: c })} />)}</div>
                      <small className="muted">The faded, breathing background dots take a dim version of it.</small>
                    </div>
                  </div>
                </div>
              )}

              {style === 'dots' && (
                <div className="imsm-sub-card">
                  <label className="imsm-row" style={{ cursor: 'pointer', justifyContent: 'space-between' }}>
                    <span className="imsm-steph"><Icon n="eye" size={20} />Moving eyes{animated ? ` · ${(totalMs(cells) / 1000).toFixed(2)} s loop, ${cells.length} cell${cells.length === 1 ? '' : 's'}` : ''}</span>
                    <span className="imsm-switch"><input type="checkbox" checked={animated} onChange={(e) => setAnimated(e.target.checked)} /><i /></span>
                  </label>
                  {!animated ? <p className="muted">Switch this on to give the face moving eyes: a loop of eye pictures, each shown for its own time. It starts with four (eyes open, blink, look left, look right) made from the eyes you've drawn.</p> : (
                    <>
                      <div className="imsm-tl">{cells.map((c, i) => <button key={i} type="button" className={`sl ${i === ci ? 'on' : ''}`} style={{ flexGrow: Math.max(1, c.ms) }} title={`${c.name}: ${c.ms} ms`} onClick={() => selectCell(i)}>{c.name}</button>)}</div>
                      <div className="imsm-cells">
                        {cells.map((c, i) => (
                          <div key={i} className={`cl ${i === ci ? 'on' : ''}`}>
                            <button type="button" className="th" onClick={() => selectCell(i)} aria-label={`Paint the ${c.name} eyes`}><DotGrid grid={c.grid + draft.grid.slice(EYE_LEN)} color={draft.color} size={6} gap={1} fluid /></button>
                            <TextField label="Name" value={c.name} maxLength={24} onChange={(v) => patchCell(i, { name: v })} />
                            <TextField label="Milliseconds" type="number" min="40" max="60000" step="10" value={c.ms} onChange={(v) => patchCell(i, { ms: v === '' ? '' : Number(v) })} />
                            <div className="imsm-row" style={{ gap: 0, justifyContent: 'space-between' }}>
                              <IconButton icon="back" label="Earlier" disabled={i === 0} onClick={() => moveCell(i, -1)} />
                              <IconButton icon="send" label="Later" disabled={i === cells.length - 1} onClick={() => moveCell(i, 1)} />
                              <IconButton icon="copy" label="Duplicate" disabled={cells.length >= MAX_CELLS} onClick={() => { setCellIdx(i); addCell(i); }} />
                              <IconButton icon="del" label="Delete" disabled={cells.length <= 1} onClick={() => removeCell(i)} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="imsm-row">
                        <Btn kind="tonal" icon="add" disabled={cells.length >= MAX_CELLS} onClick={() => addCell()}>Add a cell</Btn>
                        <Btn kind="text" icon="sync" onClick={rebuild}>Rebuild the four default cells</Btn>
                      </div>
                      <p className="muted">Tap a cell to paint its eyes above. They play in order, each for its time, then loop; the talking preview shows it live. Up to {MAX_CELLS} cells, 40 ms to 60 s each.</p>
                    </>
                  )}
                </div>
              )}

              {!(selected?.selectable === false && !isNew) && (
                <TextArea label="When Ims should use this face" rows={4} value={draft.scenarios} onChange={(v) => setDraft({ ...draft, scenarios: v })}
                  placeholder="The moments it fits: when teasing you, when a plan goes exactly to plan, when winning an argument."
                  help="Ims is given this word for word to decide which face to pull. The more specific, the better." />
              )}
              <div className="imsm-row">
                <Btn icon="check" busy={busy} disabled={busy} onClick={save}>{isNew ? 'Create it' : 'Save'}</Btn>
                <Btn kind="tonal" icon="play" onClick={preview}>Show it on the desk</Btn>
              </div>
              {!isNew && selected && <Backups face={selected} confirmIt={setConfirm} onRestored={async () => { const l = await load(); const f = l.find((x) => x.id === selected.id); if (f) select(f); }} />}
            </>
          )}
        </section>
      </div>

      <Sheet open={accSheet} onClose={() => setAccSheet(false)} title="Accessories"
        footer={<div className="imsm-row" style={{ justifyContent: 'space-between' }}><Btn kind="text" onClick={() => { setAcc(NO_ACC); }}>Take them all off</Btn><span className="imsm-row"><Btn kind="text" onClick={() => { setAccOn(false); setAccSheet(false); }}>Hide them</Btn><Btn icon="check" onClick={() => { setAccOn(true); setAccSheet(false); }}>Try them on</Btn></span></div>}>
        <p className="muted" style={{ marginTop: 0 }}>Try glasses, hair and beards on every face style. They're saved with a style when you give it to a persona.</p>
        <Accessories value={acc} onChange={setAcc} />
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      <Fab label="New face" onClick={() => startNew()} />
    </>
  );
}

export default function FaceDesigner({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Face Designer" icon="face" accent="orange" wide theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="Design Ims's faces on the desk's dot grid, and decide when he pulls each one.">
      <Body />
    </ServicePage>
  );
}
