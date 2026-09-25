import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Smile, Save, Trash2, Copy, Play, Plus, Eraser, RotateCcw, Undo2, Rewind, Mic, ChevronLeft, ChevronRight, Film } from 'lucide-react';
import PortalShell from './PortalShell';

const COLS = 12, ROWS = 8;
const EMPTY_GRID = '0'.repeat(COLS * ROWS);

// Brush levels written into the grid: 0 = off, 2 = a dim dot, f = fully lit.
const BRUSHES = [
  { key: 'f', label: 'Lit', hint: 'a fully lit dot' },
  { key: '2', label: 'Dim', hint: 'a dim dot (like a pupil)' },
  { key: '0', label: 'Erase', hint: 'switch a dot off' }
];

// Every face is two frames on the device's 12x8 grid: the resting face (mouth
// closed) and the speaking face (mouth open). Ims flaps between them as it talks.
const FRAMES = [
  { key: 'grid', label: 'Mouth closed', hint: 'The resting face' },
  { key: 'openGrid', label: 'Mouth open', hint: 'Shown while Ims speaks' }
];

// Draws a 12x8 dot grid. Unlit dots are faint, matching the device's
// (breathing) background dots behind every face.
function DotGrid({ grid, color, size = 14, gap = 3, onPaint, editable = false, editRange = null, fluid = false }) {
  const [painting, setPainting] = useState(false);
  useEffect(() => {
    const up = () => setPainting(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);
  const cells = [];
  for (let i = 0; i < grid.length; i++) {
    const paintable = editable && (!editRange || (i >= editRange[0] && i < editRange[1]));
    const level = parseInt(grid[i] || '0', 16);
    const lit = level / 15;
    // Unlit dots are the design's own colour, faded, and breathe in and out on
    // the same inhale / pause / exhale rhythm as the device's background dots.
    cells.push(
      <div
        key={i}
        onMouseDown={paintable ? (e) => { e.preventDefault(); setPainting(true); onPaint(i, true); } : undefined}
        onMouseEnter={paintable ? () => { if (painting) onPaint(i, false); } : undefined}
        style={{
          ...(fluid ? { width: '100%', aspectRatio: '1', borderRadius: '33%' } : { width: size, height: size, borderRadius: size * 0.33 }),
          background: `#${color}`,
          ...(lit > 0 ? { opacity: 0.25 + 0.75 * lit } : { animation: 'imsBreath 4.5s ease-in-out infinite' }),
          cursor: paintable ? 'pointer' : 'default',
          ...(editable && !paintable ? { filter: 'saturate(0.4)', outline: '1px dashed rgba(148,163,184,0.25)' } : {}),
          boxShadow: lit > 0.9 ? `0 0 ${size * 0.5}px #${color}88` : 'none'
        }}
      />
    );
  }
  return (
    <div className="p-2 rounded-lg select-none"
      style={{ display: 'grid', gridTemplateColumns: fluid ? `repeat(${COLS}, minmax(0, 1fr))` : `repeat(${COLS}, ${size}px)`, gap, background: '#0b0e15', width: fluid ? '100%' : 'fit-content', boxSizing: 'border-box' }}>
      <style>{'@keyframes imsBreath { 0% { opacity: .05 } 33% { opacity: .24 } 44% { opacity: .24 } 100% { opacity: .05 } }'}</style>
      {cells}
    </div>
  );
}

// --- Eye animation ---------------------------------------------------------
// A face's eyes can be a looping timeline of cells. Each cell is the top five
// rows of the grid (60 hex digits) and a duration in ms. The mouth rows (5-7)
// still come from the resting / speaking frames.
const EYE_LEN = 5 * COLS;
const MAX_CELLS = 24;

function collapseEyes(eyes) {
  const v = eyes.split('').map((c) => parseInt(c, 16));
  for (let c = 0; c < COLS; c++) {
    let bottom = -1, peak = 0;
    for (let r = 0; r < 5; r++) { const x = v[r * COLS + c]; if (x > 0) { bottom = r; peak = Math.max(peak, x); } }
    if (bottom < 0) continue;
    for (let r = 0; r < 5; r++) v[r * COLS + c] = 0;
    v[bottom * COLS + c] = peak;
  }
  return v.map((x) => x.toString(16)).join('');
}
function shiftEyes(eyes, dir) {
  const v = eyes.split('').map((c) => parseInt(c, 16));
  const src = v.slice();
  for (let r = 0; r < 5; r++) for (let c = 0; c < COLS; c++) {
    const x = src[r * COLS + c], nc = c + dir;
    if (x > 0 && x <= 3 && nc >= 0 && nc < COLS && src[r * COLS + nc] >= 12) { v[r * COLS + nc] = x; v[r * COLS + c] = 15; }
  }
  return v.map((x) => x.toString(16)).join('');
}
// Open, blink, look left, look right - built from whatever eyes the face has now.
function defaultCells(grid) {
  const eyes = grid.slice(0, EYE_LEN);
  return [
    { name: 'Eyes open', ms: 5500, grid: eyes },
    { name: 'Blink', ms: 250, grid: collapseEyes(eyes) },
    { name: 'Look left', ms: 1200, grid: shiftEyes(eyes, -1) },
    { name: 'Look right', ms: 1200, grid: shiftEyes(eyes, 1) },
  ];
}
const totalMs = (cells) => cells.reduce((n, c) => n + (Number(c.ms) || 0), 0);
function cellAt(cells, tMs) {
  let t = tMs % Math.max(1, totalMs(cells));
  for (let i = 0; i < cells.length; i++) { if (t < cells[i].ms) return i; t -= cells[i].ms; }
  return cells.length - 1;
}
const isAnimated = (anim) => Boolean(anim?.enabled && anim.cells?.length);

// The face "talking" with its eyes animating in real time, alternating the two
// mouth frames the way the device does.
function TalkingPreview({ face, size = 9, gap = 2, fluid = false }) {
  const [open, setOpen] = useState(false);
  const [, setNow] = useState(0);
  const start = useRef(Date.now());
  useEffect(() => {
    const a = setInterval(() => setOpen((o) => !o), 260);
    const b = setInterval(() => setNow(Date.now()), 40);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);
  const base = open ? face.openGrid : face.grid;
  const cells = face.eyeAnim?.cells || [];
  const grid = isAnimated(face.eyeAnim) ? cells[cellAt(cells, Date.now() - start.current)].grid + base.slice(EYE_LEN) : base;
  return <DotGrid grid={grid} color={face.color} size={size} gap={gap} fluid={fluid} />;
}

// A face in the list: still until the pointer is over it, then it plays its eye
// timeline and flaps its mouth, so you can see how it will look on Ims.
// Backups of one face: everything about it (resting and speaking frames, colour, eye animation,
// scenarios) as last saved. Restoring backs up the current state first, so it can be undone too.
function FaceBackups({ face, isDark, showToast, onRestored }) {
  const [backups, setBackups] = useState([]);
  const [label, setLabel] = useState('');
  const [hoverId, setHoverId] = useState(null);
  const load = useCallback(async () => {
    const d = await (await fetch(`/api/face-designs/${face.id}/backups`)).json();
    if (d.success) setBackups(d.backups);
  }, [face.id]);
  useEffect(() => { load(); }, [load]);
  const backup = async () => {
    const d = await (await fetch(`/api/face-designs/${face.id}/backups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }) })).json();
    if (!d.success) return showToast(d.error || 'Backup failed.', 'error');
    setLabel(''); showToast('Backed up.'); load();
  };
  const restore = async (b) => {
    if (!window.confirm(`Restore "${face.name}" to the backup from ${new Date(b.createdAt).toLocaleString('en-GB')}? The current version is backed up first.`)) return;
    const d = await (await fetch(`/api/face-designs/backups/${b.id}/restore`, { method: 'POST' })).json();
    if (!d.success) return showToast(d.error || 'Restore failed.', 'error');
    showToast('Restored.'); load(); onRestored();
  };
  const remove = async (b) => { await fetch(`/api/face-designs/backups/${b.id}`, { method: 'DELETE' }); load(); };
  const border = isDark ? 'border-white/10' : 'border-[#2E2B27]/10';
  return (
    <div className={`mt-4 pt-4 border-t ${border}`}>
      <h3 className="text-xs font-black uppercase tracking-wider mb-1">Backups of "{face.name}"</h3>
      <p className="text-[11px] text-slate-500 mb-2">Saves everything about this face as last saved - both frames, colour, eye animation and scenarios. Save your edits first if you want them in the backup. Restoring backs up the current version first.</p>
      <div className="flex flex-wrap gap-2 mb-3">
        <input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && backup()} placeholder="Label (optional), e.g. before the new eyes"
          className={`flex-1 min-w-[12rem] px-3 py-2 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10' : 'bg-white border-[#2E2B27]/10'}`} />
        <button onClick={backup} className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}><Save size={13} /> Back up now</button>
      </div>
      {backups.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {backups.map((b) => (
            <div key={b.id} className={`p-2 rounded-xl border ${border} flex flex-col gap-1.5`} onMouseEnter={() => setHoverId(b.id)} onMouseLeave={() => setHoverId(null)}>
              {hoverId === b.id ? <TalkingPreview face={b} size={8} gap={2} fluid /> : <DotGrid grid={b.grid} color={b.color} size={8} gap={2} fluid />}
              <div className="text-[11px] font-semibold break-words">{b.label || 'Backup'}</div>
              <div className="text-[10px] text-slate-500">{new Date(b.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{b.eyeAnim?.enabled ? ' · animated eyes' : ''}</div>
              <div className="flex gap-1">
                <button onClick={() => restore(b)} className="flex-1 px-2 py-1 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 bg-amber-500 text-slate-900"><Undo2 size={11} /> Restore</button>
                <button onClick={() => remove(b)} title="Delete backup" className="px-2 py-1 rounded-lg text-[11px] text-red-400 hover:bg-red-500/10"><Trash2 size={11} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : <p className="text-xs text-slate-500">No backups of this face yet.</p>}
    </div>
  );
}

function FaceThumb({ face, hovering }) {
  return hovering
    ? <TalkingPreview face={face} size={8} gap={2} fluid />
    : <DotGrid grid={face.grid} color={face.color} size={8} gap={2} fluid />;
}

export default function FaceDesignerPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [faces, setFaces] = useState([]);
  const [deleted, setDeleted] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState({ name: '', grid: EMPTY_GRID, openGrid: EMPTY_GRID, color: '4CFF7A', scenarios: '', eyeAnim: { enabled: false, cells: [] } });
  const [frame, setFrame] = useState('grid');           // 'grid' | 'openGrid' | 'cell' (an eye-animation cell)
  const [cellIdx, setCellIdx] = useState(0);            // which eye cell is selected
  const [hoverId, setHoverId] = useState(null);         // face in the list under the pointer
  const [brush, setBrush] = useState('f');
  const [busy, setBusy] = useState(false);
  const [notification, setNotification] = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification((prev) => (prev?.msg === msg ? null : prev)), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await (await fetch('/api/face-designs')).json();
      if (d.success) { setFaces(d.faces); setDeleted(d.deleted); return d.faces; }
    } catch (err) { showToast(err.message, 'error'); }
    return [];
  }, [showToast]);

  useEffect(() => { load().then((f) => { if (f[0]) select(f[0]); }); /* eslint-disable-next-line */ }, []);

  const selected = faces.find((f) => f.id === selectedId) || null;
  const locked = false; // every face, neutral included, can be redrawn and recoloured

  function select(face) {
    setSelectedId(face.id);
    setIsNew(false);
    setFrame('grid');
    setDraft({ name: face.name, grid: face.grid, openGrid: face.openGrid, color: face.color, scenarios: face.scenarios, eyeAnim: face.eyeAnim || { enabled: false, cells: [] } });
    setCellIdx(0);
  }

  const startNew = (from = null) => {
    setSelectedId(null);
    setIsNew(true);
    setFrame('grid');
    setDraft(from
      ? { name: `${from.name}_copy`, grid: from.grid, openGrid: from.openGrid, color: from.color, scenarios: from.scenarios, eyeAnim: JSON.parse(JSON.stringify(from.eyeAnim || { enabled: false, cells: [] })) }
      : { name: '', grid: EMPTY_GRID, openGrid: EMPTY_GRID, color: '4CFF7A', scenarios: '', eyeAnim: { enabled: false, cells: [] } });
    setCellIdx(0);
  };

  const animated = isAnimated(draft.eyeAnim);
  const cells = draft.eyeAnim?.cells || [];
  const cell = cells[Math.min(cellIdx, cells.length - 1)];
  const editingCell = frame === 'cell' && animated;
  const activeFrame = editingCell ? 'cell' : frame === 'cell' ? 'grid' : frame;

  const setCells = (fn) => setDraft((d) => ({ ...d, eyeAnim: { ...d.eyeAnim, cells: fn(d.eyeAnim.cells) } }));
  const patchCell = (i, patch) => setCells((cs) => cs.map((c, k) => (k === i ? { ...c, ...patch } : c)));

  // What the big grid shows: with animated eyes the top five rows come from the
  // selected cell and the mouth rows from the resting / speaking frame.
  const shownGrid = editingCell ? cell.grid + draft.grid.slice(EYE_LEN)
    : animated ? cell.grid + draft[activeFrame].slice(EYE_LEN)
    : draft[activeFrame];
  const editRange = editingCell ? [0, EYE_LEN] : animated ? [EYE_LEN, COLS * ROWS] : null;

  const strokeLevel = useRef(brush);
  const paint = (i, start = false) => {
    if (editingCell) {
      if (i >= EYE_LEN) return;
      const chars = cell.grid.split('');
      if (start) strokeLevel.current = (brush !== '0' && chars[i] === brush) ? '0' : brush;
      chars[i] = strokeLevel.current;
      patchCell(Math.min(cellIdx, cells.length - 1), { grid: chars.join('') });
      return;
    }
    if (animated && i < EYE_LEN) return;
    setDraft((d) => {
      const chars = d[activeFrame].split('');
      if (start) strokeLevel.current = (brush !== '0' && chars[i] === brush) ? '0' : brush;
      chars[i] = strokeLevel.current;
      return { ...d, [activeFrame]: chars.join('') };
    });
  };

  const setAnimated = (on) => setDraft((d) => {
    const existing = d.eyeAnim?.cells || [];
    return { ...d, eyeAnim: { enabled: on, cells: on && existing.length === 0 ? defaultCells(d.grid) : existing } };
  });
  const selectCell = (i) => { setCellIdx(i); setFrame('cell'); };
  const addCell = () => {
    if (cells.length >= MAX_CELLS) return;
    const src = cell || { name: 'Cell', ms: 500, grid: draft.grid.slice(0, EYE_LEN) };
    setCells((cs) => [...cs.slice(0, cellIdx + 1), { ...src, name: `${src.name} copy`.slice(0, 24) }, ...cs.slice(cellIdx + 1)]);
    selectCell(cellIdx + 1);
  };
  const moveCell = (i, d2) => setCells((cs) => {
    const j = i + d2;
    if (j < 0 || j >= cs.length) return cs;
    const next = cs.slice();
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const removeCell = (i) => {
    if (cells.length <= 1) return;
    setCells((cs) => cs.filter((_, k) => k !== i));
    setCellIdx(Math.max(0, Math.min(cellIdx, cells.length - 2)));
  };
  const rebuildCells = () => {
    if (!window.confirm('Replace the timeline with four new cells (open, blink, look left, look right) built from this face\'s current eyes?')) return;
    setDraft((d) => ({ ...d, eyeAnim: { enabled: true, cells: defaultCells(d.grid) } }));
    setCellIdx(0);
  };

  // Convenience: eyes are the top rows of both frames, so copy them across
  // rather than painting them twice. Only rows 0-4 (above the mouth) move.
  const copyEyes = (from, to) => setDraft((d) => ({ ...d, [to]: d[from].slice(0, 5 * COLS) + d[to].slice(5 * COLS) }));
  const copyFrame = (from, to) => setDraft((d) => ({ ...d, [to]: d[from] }));

  const save = async () => {
    setBusy(true);
    try {
      const url = isNew ? '/api/face-designs' : `/api/face-designs/${selectedId}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(locked ? { scenarios: draft.scenarios } : draft)
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to save.');
      showToast(isNew ? `Face "${d.face.name}" created.` : 'Saved - Ims uses it from its next conversation.');
      const list = await load();
      const f = list.find((x) => x.id === d.face.id);
      if (f) select(f);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selected || selected.builtin || !window.confirm(`Move "${selected.name}" to the archive?`)) return;
    const res = await fetch(`/api/face-designs/${selected.id}`, { method: 'DELETE' });
    const d = await res.json();
    if (!res.ok) { showToast(d.error || 'Failed.', 'error'); return; }
    showToast('Face moved to the archive.');
    const list = await load();
    if (list[0]) select(list[0]);
  };

  const resetToDefault = async () => {
    if (!selected?.hasDefault || !window.confirm(`Put "${selected.name}" back to its original look? (Your scenarios are kept.)`)) return;
    const res = await fetch(`/api/face-designs/${selected.id}/reset`, { method: 'POST' });
    const d = await res.json();
    if (!res.ok) { showToast(d.error || 'Failed.', 'error'); return; }
    showToast('Reset to the original face.');
    const list = await load();
    const f = list.find((x) => x.id === selected.id);
    if (f) select(f);
  };

  const restore = async (id) => {
    const res = await fetch(`/api/face-designs/${id}/restore`, { method: 'POST' });
    const d = await res.json();
    if (!res.ok) { showToast(d.error || 'Failed.', 'error'); return; }
    showToast('Face restored.');
    load();
  };

  const preview = async () => {
    try {
      const body = isNew || !selected
        ? { name: draft.name || 'preview', grid: draft.grid, openGrid: draft.openGrid, color: draft.color, eyeAnim: draft.eyeAnim }
        : { name: draft.name, grid: draft.grid, openGrid: draft.openGrid, color: draft.color, eyeAnim: draft.eyeAnim };
      const res = await fetch('/api/face-designs/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Preview failed.');
      showToast('Sent to IMS - it shows for about 20 seconds (needs IMS connected). Say something to see the mouth move.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const panel = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const field = `w-full px-3 py-2 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/10 text-slate-900'}`;
  const label = 'text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70';
  const ghost = `px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`;
  const gradient = 'from-yellow-400 to-amber-500';

  return (
    <PortalShell title="Face Designer" subtitle="/ims/facedesigner • every face Ims can pull, and when to use it"
      icon={Smile} gradient={gradient} glow="rgba(250,204,21,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification} maxWidth="max-w-7xl">

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Face list */}
        <div className={`${panel} lg:col-span-2`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-black uppercase tracking-wider">Faces ({faces.length})</h2>
            <button onClick={() => startNew()} className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r ${gradient} text-slate-900 active:scale-95`}>
              <Plus size={14} /> New face
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {faces.map((f) => (
              <button key={f.id} onClick={() => select(f)}
                onMouseEnter={() => setHoverId(f.id)} onMouseLeave={() => setHoverId((h) => (h === f.id ? null : h))}
                className={`p-2 rounded-xl border text-left transition-all hover:scale-[1.02] ${
                  selectedId === f.id && !isNew ? 'border-amber-400 ring-1 ring-amber-400/40' : isDark ? 'border-white/10' : 'border-[#2E2B27]/10'
                } ${isDark ? 'bg-slate-950/40' : 'bg-white'}`}>
                <FaceThumb face={f} hovering={hoverId === f.id} />
                <div className="mt-2 text-xs font-bold flex items-center gap-1.5">
                  {f.name}{f.selectable === false && <span className="ml-1 text-[9px] font-black uppercase tracking-wider text-emerald-500">auto</span>}
                </div>
              </button>
            ))}
          </div>

          {deleted.length > 0 && (
            <div className="mt-5">
              <h3 className="text-[11px] font-black uppercase tracking-wider mb-2 opacity-70">Archived designs ({deleted.length})</h3>
              <div className="flex flex-col gap-1.5">
                {deleted.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 text-xs">
                    <DotGrid grid={f.grid} color={f.color} size={5} gap={1} />
                    <span className="font-semibold">{f.name}</span>
                    <button onClick={() => restore(f.id)} className={`ml-auto ${ghost}`}><Undo2 size={11} /> Restore</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Editor */}
        <div className={`${panel} lg:col-span-3`}>
          <h2 className="text-xs font-black uppercase tracking-wider mb-4">
            {isNew ? 'Design a new face' : selected ? `Editing "${selected.name}"` : 'Pick a face'}
          </h2>

          {(isNew || selected) && (
            <div className="flex flex-col gap-4">
              {selected?.name === 'standby' && !isNew && (
                <p className={`text-[11px] leading-relaxed p-3 rounded-lg border ${isDark ? 'border-white/10 text-slate-400' : 'border-[#2E2B27]/10 text-slate-600'}`}>
                  This is Ims's resting face - the one on screen whenever it is idle, and while it talks with no other face chosen. Ims never picks it, so there are no scenarios to write. Your dots, colour and eye movement replace the built-in look; while listening, thinking, connecting or recording Ims keeps its own state faces and colours so you can tell what it is doing. Use <strong>Reset to original</strong> to go back.
                </p>
              )}

              <div className="flex flex-wrap items-start gap-5">
                <div>
                  {/* Which frame is being painted */}
                  <div className="flex gap-2 mb-2">
                    {FRAMES.map((fr) => (
                      <button key={fr.key} onClick={() => setFrame(fr.key)} title={fr.hint}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${activeFrame === fr.key ? `bg-gradient-to-r ${gradient} text-slate-900` : isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}>
                        {fr.label}
                      </button>
                    ))}
                    {animated && (
                      <button onClick={() => selectCell(Math.min(cellIdx, cells.length - 1))} title="Edit the eyes of the selected animation cell"
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 ${activeFrame === 'cell' ? `bg-gradient-to-r ${gradient} text-slate-900` : isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}>
                        <Film size={11} /> Eyes: {cell?.name}
                      </button>
                    )}
                  </div>
                  <DotGrid grid={shownGrid} color={draft.color} size={22} gap={4} editable={!locked} editRange={editRange} onPaint={paint} />
                  <p className="text-[10px] text-slate-500 mt-1.5">
                    {activeFrame === 'cell' ? `Painting the eyes of cell "${cell?.name}" (top five rows). The greyed rows are the mouth.`
                      : animated ? `Painting the ${activeFrame === 'grid' ? 'closed' : 'open'} mouth (bottom three rows). The eyes above come from the animation cell you have selected.`
                      : activeFrame === 'grid' ? 'The resting face: eyes and a closed mouth.' : 'The same face with the mouth open - shown while Ims speaks.'}
                  </p>

                  {!locked && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {BRUSHES.map((b) => (
                        <button key={b.key} onClick={() => setBrush(b.key)} title={b.hint}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 ${brush === b.key ? `bg-gradient-to-r ${gradient} text-slate-900` : isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}>
                          {b.key === '0' && <Eraser size={12} />}{b.label}
                        </button>
                      ))}
                      <button onClick={() => (editingCell ? patchCell(Math.min(cellIdx, cells.length - 1), { grid: '0'.repeat(EYE_LEN) })
                        : setDraft((d) => ({ ...d, [activeFrame]: (animated ? d[activeFrame].slice(0, EYE_LEN) : '') + '0'.repeat(animated ? COLS * ROWS - EYE_LEN : COLS * ROWS) })))} className={ghost}><RotateCcw size={12} /> Clear</button>
                    </div>
                  )}
                  {!locked && !animated && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button onClick={() => copyEyes('grid', 'openGrid')} className={ghost} title="Copy the eyes (top five rows) from the resting face into the speaking face"><Copy size={12} /> Eyes: closed &rarr; open</button>
                      <button onClick={() => copyFrame('grid', 'openGrid')} className={ghost} title="Start the speaking face as a copy of the resting face"><Rewind size={12} /> Copy whole face</button>
                    </div>
                  )}
                  {!locked && <p className="text-[10px] text-slate-500 mt-2 max-w-[22rem]">Click or drag to light dots; click a lit dot again (with the same brush) to switch it off. Mouths live in the bottom three rows (5-7); the eyes above are usually the same in both frames.</p>}
                </div>

                <div className="flex-1 min-w-[14rem] flex flex-col gap-3">
                  <div>
                    <label className={label}><Mic size={10} className="inline mr-1" />Talking preview</label>
                    <TalkingPreview face={{ grid: draft.grid, openGrid: draft.openGrid, color: draft.color, eyeAnim: draft.eyeAnim }} />
                  </div>
                  <div>
                    <label className={label}>Name</label>
                    <input className={field} value={draft.name} disabled={!isNew && selected?.builtin} placeholder="e.g. smug"
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                    <p className="text-[10px] text-slate-500 mt-1">Letters, numbers and underscores. This is the exact name Ims uses to choose the face.</p>
                  </div>
                  <div>
                    <label className={label}>Colour</label>
                    <div className="flex items-center gap-3 mb-2">
                      <input type="color" value={`#${draft.color}`} onChange={(e) => setDraft({ ...draft, color: e.target.value.slice(1).toUpperCase() })}
                        className="w-14 h-10 rounded cursor-pointer bg-transparent" title="Open the colour picker" />
                      <input key={draft.color} className={`${field} w-28 font-mono`} defaultValue={`#${draft.color}`} maxLength={7} spellCheck={false}
                        title="Type a hex colour, e.g. #4CFF7A"
                        onChange={(e) => { const v = e.target.value.replace('#', '').toUpperCase(); if (/^[0-9A-F]{6}$/.test(v)) setDraft({ ...draft, color: v }); }} />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {['4CFF7A', 'FFD700', '00E5FF', 'FF3385', 'FFB84D', '33FFB8', '99FF33', '4D94FF', 'FF7733', 'FF2222', 'BA68C8', 'FFFFFF'].map((c) => (
                        <button key={c} onClick={() => setDraft({ ...draft, color: c })} title={`#${c}`}
                          className={`w-6 h-6 rounded-md border ${draft.color === c ? 'ring-2 ring-offset-1 ring-yellow-400' : 'border-white/20'}`} style={{ background: `#${c}` }} />
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1.5">The faded, breathing background dots always take a dim version of this colour.</p>
                  </div>
                </div>
              </div>

              {/* Eye animation timeline */}
              <div className={`rounded-xl border p-4 ${isDark ? 'border-white/10 bg-slate-950/30' : 'border-[#2E2B27]/10 bg-white/60'}`}>
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                    <input type="checkbox" checked={animated} onChange={(e) => setAnimated(e.target.checked)} />
                    <Film size={13} /> Animate the eyes
                  </label>
                  {animated && <span className="text-[11px] text-slate-500">Loop: {(totalMs(cells) / 1000).toFixed(2)} s - {cells.length} cell{cells.length === 1 ? '' : 's'}</span>}
                </div>
                {!animated ? (
                  <p className="text-[10px] text-slate-500">Tick this to give the face moving eyes: a timeline of eye pictures, each with its own duration, that loops. It starts with four cells - eyes open, blink, look left, look right - built from the eyes you have drawn.</p>
                ) : (
                  <>
                    {/* proportional timeline bar */}
                    <div className="flex h-7 rounded-lg overflow-hidden mb-3 border border-white/10">
                      {cells.map((c, i) => (
                        <button key={i} onClick={() => selectCell(i)} title={`${c.name} - ${c.ms} ms`} style={{ flexGrow: Math.max(1, c.ms), flexBasis: 0, minWidth: 14 }}
                          className={`text-[9px] font-bold truncate px-1 border-r border-black/30 ${i === Math.min(cellIdx, cells.length - 1) ? 'bg-amber-400 text-slate-900' : isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-black/10 hover:bg-black/20'}`}>
                          {c.name}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {cells.map((c, i) => (
                        <div key={i} className={`rounded-lg border p-2 flex flex-col gap-1.5 w-[10.5rem] ${i === Math.min(cellIdx, cells.length - 1) ? 'border-amber-400 ring-1 ring-amber-400/40' : isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
                          <button onClick={() => selectCell(i)} title="Edit this cell's eyes"><DotGrid grid={c.grid + draft.grid.slice(EYE_LEN)} color={draft.color} size={6} gap={1} /></button>
                          <input className={`${field} !py-1`} value={c.name} maxLength={24} onChange={(e) => patchCell(i, { name: e.target.value })} title="Cell name" />
                          <div className="flex items-center gap-1.5">
                            <input type="number" min="40" max="60000" step="10" className={`${field} !py-1`} value={c.ms}
                              onChange={(e) => patchCell(i, { ms: e.target.value === '' ? '' : Number(e.target.value) })} title="How long this cell stays up, in milliseconds" />
                            <span className="text-[10px] text-slate-500">ms</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => moveCell(i, -1)} disabled={i === 0} className={`${ghost} !px-1.5 disabled:opacity-30`} title="Earlier"><ChevronLeft size={12} /></button>
                            <button onClick={() => moveCell(i, 1)} disabled={i === cells.length - 1} className={`${ghost} !px-1.5 disabled:opacity-30`} title="Later"><ChevronRight size={12} /></button>
                            <button onClick={() => { setCellIdx(i); addCell(); }} disabled={cells.length >= MAX_CELLS} className={`${ghost} !px-1.5 disabled:opacity-30`} title="Duplicate this cell"><Copy size={12} /></button>
                            <button onClick={() => removeCell(i)} disabled={cells.length <= 1} className={`${ghost} !px-1.5 text-red-400 disabled:opacity-30`} title="Delete this cell"><Trash2 size={12} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button onClick={addCell} disabled={cells.length >= MAX_CELLS} className={`${ghost} disabled:opacity-40`}><Plus size={12} /> Add cell (copy of selected)</button>
                      <button onClick={rebuildCells} className={ghost}><RotateCcw size={12} /> Rebuild the four default cells</button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2">Click a cell (or the timeline bar) to paint its eyes in the big grid. Cells play in order, each for its duration, then the loop repeats - the preview on the right shows it in real time. Up to {MAX_CELLS} cells, 40 ms to 60 s each.</p>
                  </>
                )}
              </div>

              <div className={selected?.selectable === false && !isNew ? 'hidden' : ''}>
                <label className={label}>When Ims should use this face (scenarios)</label>
                <textarea className={`${field} min-h-[110px] leading-relaxed`} value={draft.scenarios}
                  placeholder="Describe the moments this face fits - e.g. 'When teasing the user, when a plan goes exactly to plan, when winning an argument.'"
                  onChange={(e) => setDraft({ ...draft, scenarios: e.target.value })} />
                <p className="text-[10px] text-slate-500 mt-1">This text is given to Ims verbatim to decide which face to pull, replacing the fixed list that used to live in <code>ims_persona_rules.md</code>. The more specific, the better.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={save} disabled={busy}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r ${gradient} text-slate-900 active:scale-95 disabled:opacity-50`}>
                  <Save size={14} />{isNew ? 'Create face' : 'Save'}
                </button>
                <button onClick={preview} className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`} title="Show this face on IMS now">
                  <Play size={14} /> Preview on IMS
                </button>
                {!isNew && selected && (
                  <button onClick={() => startNew(selected)} className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}>
                    <Copy size={14} /> Duplicate
                  </button>
                )}
                {!isNew && selected?.hasDefault && !selected.shapeLocked && (
                  <button onClick={resetToDefault} className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}>
                    <RotateCcw size={14} /> Reset to original
                  </button>
                )}
                {!isNew && selected && !selected.builtin && (
                  <button onClick={remove} className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 text-red-400 hover:bg-red-500/10 ml-auto">
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>
              {!isNew && selected && (
                <FaceBackups face={selected} isDark={isDark} showToast={showToast}
                  onRestored={async () => { const list = await load(); const f = list.find((x) => x.id === selected.id); if (f) select(f); }} />
              )}
            </div>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
