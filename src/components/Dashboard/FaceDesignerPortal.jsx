import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Smile, Save, Trash2, Copy, Play, Plus, Eraser, RotateCcw, Undo2, Rewind, Mic,
  ChevronLeft, ChevronRight, Film, Volume2, Sparkles, LayoutGrid, Eye, Check, Sliders, Glasses
} from 'lucide-react';
import PortalShell from './PortalShell';
import ImsFace from '../Ims/ImsFace';
import usePersonaVoice from '../../hooks/usePersonaVoice';
import { EMOTIONS, EMOTION_KEYS, FACE_STYLES, ACCESSORY_OPTIONS, HAIR_COLORS, GLASSES_COLORS } from '../Ims/faceEmotions';

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

function FaceThumb({ face, hovering, style = 'dots', levelRef, isSpeaking = false, accessories = null }) {
  if (style !== 'dots') {
    return (
      <div className="w-full aspect-[12/8] flex items-center justify-center p-0.5 bg-[#080c14] rounded-lg overflow-hidden border border-white/5 relative">
        <ImsFace
          face={{ faceStyle: style, color: face.color, emotion: face.name, faceEmotion: face.name, accessories }}
          status={hovering || isSpeaking ? 'speaking' : 'idle'}
          levelRef={levelRef}
          width="100%"
          className="!rounded-lg !p-1 !border-0"
        />
      </div>
    );
  }
  return hovering
    ? <TalkingPreview face={face} size={8} gap={2} fluid />
    : <DotGrid grid={face.grid} color={face.color} size={8} gap={2} fluid />;
}

function ParametricBreakdown({ emotionKey, style, isDark }) {
  const em = EMOTIONS[emotionKey] || EMOTIONS.neutral;
  const p = em ? (em[style] || {}) : {};
  if (!p || Object.keys(p).length === 0) return null;

  return (
    <div className={`p-3 rounded-xl border text-[11px] ${isDark ? 'bg-slate-950/40 border-white/10' : 'bg-slate-50 border-[#2E2B27]/10'}`}>
      <div className="font-bold uppercase tracking-wider text-[10px] text-amber-400 mb-2 flex items-center gap-1.5">
        <Sliders size={12} />
        {em?.label || 'Emotion'} Parametric Geometry ({(style || '').toUpperCase()})
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
        {style === 'vector' && (
          <>
            <div><span className="text-slate-500">Brows:</span> L:{p.browLeft ?? 0} / R:{p.browRight ?? 0}</div>
            <div><span className="text-slate-500">Eyes:</span> L:{(((p.eyeLeftOpen ?? 1)) * 100).toFixed(0)}% / R:{(((p.eyeRightOpen ?? 1)) * 100).toFixed(0)}%</div>
            <div><span className="text-slate-500">Pupils:</span> X:{p.pupilX ?? 0} / Y:{p.pupilY ?? 0}</div>
            <div><span className="text-slate-500">Smile:</span> {p.mouthSmile ?? 0} (W:{p.mouthWidth ?? 40})</div>
          </>
        )}
        {style === 'oscilloscope' && (
          <>
            <div><span className="text-slate-500">Frequency:</span> {p.freq ?? 1.5} Hz</div>
            <div><span className="text-slate-500">Harmonics:</span> {p.harmonics ?? 2}</div>
            <div><span className="text-slate-500">Jitter:</span> {(((p.jitter ?? 0.02)) * 100).toFixed(0)}%</div>
            <div><span className="text-slate-500">Waveform:</span> {p.waveType ?? 'sine'}</div>
          </>
        )}
        {style === 'geometric' && (
          <>
            <div><span className="text-slate-500">Brow Pitch:</span> {p.browPitch ?? 0}°</div>
            <div><span className="text-slate-500">Eye Aperture:</span> {(((p.eyeAperture ?? 1)) * 100).toFixed(0)}%</div>
            <div><span className="text-slate-500">Jaw Drop:</span> {p.jawDrop ?? 0}</div>
            <div><span className="text-slate-500">Facet Angle:</span> {p.facetAngle ?? 0}°</div>
          </>
        )}
        {style === 'orc' && (
          <>
            <div><span className="text-slate-500">Brow Angle:</span> {p.browAngle ?? 0}°</div>
            <div><span className="text-slate-500">Tusk Size:</span> {p.tuskHeight ?? 18}px (Tilt: {p.tuskAngle ?? 0}°)</div>
            <div><span className="text-slate-500">Jaw Drop:</span> {p.jawDrop ?? 0}</div>
            <div><span className="text-slate-500">Warpaint:</span> {(((p.warpaintIntensity ?? 0.5)) * 100).toFixed(0)}%</div>
          </>
        )}
        {style === 'steampunk' && (
          <>
            <div><span className="text-slate-500">Gear Speed:</span> {p.gearSpeed ?? 1}x</div>
            <div><span className="text-slate-500">Pressure Dial:</span> {p.dialAngle ?? 30}°</div>
            <div><span className="text-slate-500">Iris Shutter:</span> {(((p.shutterOpen ?? 0.9)) * 100).toFixed(0)}%</div>
            <div><span className="text-slate-500">Steam Exhaust:</span> {(((p.steamPuff ?? 0.2)) * 100).toFixed(0)}%</div>
          </>
        )}
      </div>
    </div>
  );
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

  // Multi-Style Face Animation States
  const [viewStyle, setViewStyle] = useState('dots'); // 'dots' | 'vector' | 'oscilloscope' | 'geometric' | 'orc' | 'steampunk' | 'anime' | 'pixel' | 'all'
  const [listStyle, setListStyle] = useState('dots');
  const [previewStyle, setPreviewStyle] = useState('dots');
  const [isSimulatingSpeech, setIsSimulatingSpeech] = useState(false);
  const [accessories, setAccessories] = useState({
    glasses: 'none',
    hair: 'none',
    facialHair: 'none',
    hairColor: '#16161a',
    glassesColor: '#d4af37',
    facialHairColor: '#16161a',
  });
  const [showAccessories, setShowAccessories] = useState(false);
  const [personas, setPersonas] = useState([]);       // to give the face on show to a persona
  const [facePersona, setFacePersona] = useState('');
  const simLevelRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    if (isSimulatingSpeech || hoverId !== null) {
      const loop = (now) => {
        // the real voice when one is playing, otherwise a speaking rhythm (hover previews)
        simLevelRef.current = voice.playing ? voice.levelRef.current : (Math.sin(now / 130) * 0.4 + 0.5) * (0.3 + Math.random() * 0.6);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    } else {
      simLevelRef.current = 0;
    }
    return () => cancelAnimationFrame(raf);
  }, [isSimulatingSpeech, hoverId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/personas').then((r) => r.json()).then((d) => {
      if (!d.personas) return;
      setPersonas(d.personas);
      setFacePersona((cur) => cur || d.activeId || d.personas[0]?.id || '');
    }).catch(() => {});
  }, []);

  // the face style on show (with the accessories being auditioned) becomes that persona's face
  const useFaceForPersona = async () => {
    const p = personas.find((x) => x.id === facePersona);
    if (!p || viewStyle === 'all') return;
    try {
      const res = await fetch(`/api/personas/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meta: { faceStyle: viewStyle, accessories } }) });
      const d = await res.json();
      if (!res.ok || d.success === false) throw new Error(d.error || 'Could not save the face.');
      setPersonas((list) => list.map((x) => (x.id === p.id ? { ...x, faceStyle: viewStyle } : x)));
      showToast(`${p.name} now uses this face - see it on the Persona page.`);
    } catch (err) { showToast(err.message, 'error'); }
  };

  // Simulate Voice: the persona says a line that fits the emotion on show, in its Gemini voice; faces lip-sync to it
  const voice = usePersonaVoice();
  useEffect(() => { setIsSimulatingSpeech(voice.playing); }, [voice.playing]);
  useEffect(() => { if (voice.error) showToast(voice.error, 'error'); }, [voice.error]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleVoice = () => ((voice.busy || voice.playing) ? voice.stop() : voice.say(facePersona, { emotion: draft.name || 'neutral' }));
  const voiceLabel = voice.busy ? 'Writing a line...' : voice.playing ? 'Speaking - stop' : 'Simulate Voice';

  const switchEngineModel = useCallback((modelId) => {
    setViewStyle(modelId);
    if (modelId !== 'all') {
      setPreviewStyle(modelId);
      setListStyle(modelId);
    }
  }, []);

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
    <PortalShell title="Face Designer" subtitle="/ims/facedesigner • 6 expressive animation models (Dot Matrix, Bezier Vector, Oscilloscope, Geometric, Orc War-Chief, Clockwork Steampunk) & 16 emotional archetypes"
      icon={Smile} gradient={gradient} glow="rgba(250,204,21,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification} maxWidth="max-w-7xl">

      {/* Animation Models Switcher Banner */}
      <div className={`flex flex-wrap items-center justify-between gap-3 mb-4 p-3 rounded-2xl border ${isDark ? 'bg-slate-900/40 border-white/10' : 'bg-white/80 border-[#2E2B27]/15 shadow-sm'}`}>
        <div className="flex items-center gap-2.5">
          <Sparkles size={18} className="text-amber-400" />
          <div>
            <div className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
              Face Animation Models
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                6 Active Engines
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Preview and design faces across 6 procedural engines: Dot Matrix, Bezier Vector, Oscilloscope, Geometric Mesh, Orc War-Chief, and Steampunk Automaton.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-950/60 border border-white/10">
            {[
              { id: 'dots', label: 'Dot Matrix' },
              { id: 'vector', label: 'Bezier Vector' },
              { id: 'oscilloscope', label: 'Oscilloscope' },
              { id: 'geometric', label: 'Geometric' },
              { id: 'orc', label: 'Orc Chief' },
              { id: 'steampunk', label: 'Steampunk' },
              { id: 'chronicler', label: 'Chronicler' },
              { id: 'all', label: 'All faces' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => switchEngineModel(m.id)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                  viewStyle === m.id
                    ? 'bg-amber-400 text-slate-900 shadow-sm'
                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-black'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {personas.length > 0 && (
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-xl border ${isDark ? 'bg-slate-950/60 border-white/10' : 'bg-white border-[#2E2B27]/15'}`}>
              <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Use for</span>
              <select
                value={facePersona}
                onChange={(e) => setFacePersona(e.target.value)}
                className={`text-xs font-bold rounded-lg px-1.5 py-1 outline-none ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-100 text-slate-900'}`}
              >
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.faceStyle ? ` (now: ${FACE_STYLES.find((s) => s.id === p.faceStyle)?.name || p.faceStyle})` : ''}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={useFaceForPersona}
                disabled={viewStyle === 'all' || personas.find((p) => p.id === facePersona)?.faceStyle === viewStyle}
                title={viewStyle === 'all' ? 'Pick one face above first' : 'Make the face on show (and the accessories) this persona\'s face'}
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-400 text-slate-900 disabled:opacity-40"
              >
                {personas.find((p) => p.id === facePersona)?.faceStyle === viewStyle ? 'In use' : 'Use this face'}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowAccessories((v) => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              showAccessories
                ? 'bg-amber-400 text-slate-900 shadow-sm'
                : isDark ? 'text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10' : 'text-slate-700 bg-black/5 hover:bg-black/10 border border-[#2E2B27]/10'
            }`}
          >
            <Glasses size={14} />
            Accessories {showAccessories ? '(Active)' : ''}
          </button>
        </div>
      </div>

      {/* Accessories Customizer Drawer */}
      {showAccessories && (
        <div className={`mb-5 p-4 rounded-2xl border ${isDark ? 'bg-slate-900/60 border-amber-400/30' : 'bg-amber-50/50 border-amber-300'} shadow-md space-y-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Glasses size={16} className="text-amber-400" />
              <span className="text-xs font-black uppercase tracking-wider text-amber-400">Audition Modular Accessories</span>
              <span className="text-[10px] text-slate-400">Live overlay across all 6 models with jaw-shift speech articulation</span>
            </div>
            <button
              type="button"
              onClick={() => setAccessories({
                glasses: 'none',
                hair: 'none',
                facialHair: 'none',
                hairColor: '#16161a',
                glassesColor: '#d4af37',
                facialHairColor: '#16161a',
              })}
              className="text-[10px] font-bold text-slate-400 hover:text-red-400 transition-colors"
            >
              Reset Accessories
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Glasses */}
            <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950/40 border-white/10' : 'bg-white border-[#2E2B27]/10'}`}>
              <div className="font-bold mb-2 flex items-center justify-between text-slate-300">
                <span>Glasses & Eyewear</span>
                <span className="text-[10px] text-amber-400 font-mono">{accessories.glasses}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 mb-2">
                {ACCESSORY_OPTIONS.glasses.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setAccessories((prev) => ({ ...prev, glasses: g.id }))}
                    className={`px-2 py-1 text-[10px] font-medium rounded-lg text-center truncate transition-all ${
                      accessories.glasses === g.id
                        ? 'bg-amber-400 text-slate-900 font-bold'
                        : isDark ? 'bg-white/5 text-slate-400 hover:text-white' : 'bg-black/5 text-slate-600 hover:text-black'
                    }`}
                  >
                    {g.name || g.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                <span className="text-[10px] text-slate-400">Frame Tint:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {GLASSES_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setAccessories((prev) => ({ ...prev, glassesColor: c.hex }))}
                      title={c.name || c.label}
                      className={`w-4 h-4 rounded-full border ${accessories.glassesColor === c.hex ? 'ring-2 ring-amber-400' : 'border-white/20'}`}
                      style={{ background: c.hex }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Hair */}
            <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950/40 border-white/10' : 'bg-white border-[#2E2B27]/10'}`}>
              <div className="font-bold mb-2 flex items-center justify-between text-slate-300">
                <span>Hairstyle</span>
                <span className="text-[10px] text-amber-400 font-mono">{accessories.hair}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 mb-2">
                {ACCESSORY_OPTIONS.hair.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setAccessories((prev) => ({ ...prev, hair: h.id }))}
                    className={`px-2 py-1 text-[10px] font-medium rounded-lg text-center truncate transition-all ${
                      accessories.hair === h.id
                        ? 'bg-amber-400 text-slate-900 font-bold'
                        : isDark ? 'bg-white/5 text-slate-400 hover:text-white' : 'bg-black/5 text-slate-600 hover:text-black'
                    }`}
                  >
                    {h.name || h.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                <span className="text-[10px] text-slate-400">Hair Dye:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {HAIR_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setAccessories((prev) => ({ ...prev, hairColor: c.hex }))}
                      title={c.name || c.label}
                      className={`w-4 h-4 rounded-full border ${accessories.hairColor === c.hex ? 'ring-2 ring-amber-400' : 'border-white/20'}`}
                      style={{ background: c.hex }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Facial Hair */}
            <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950/40 border-white/10' : 'bg-white border-[#2E2B27]/10'}`}>
              <div className="font-bold mb-2 flex items-center justify-between text-slate-300">
                <span>Facial Hair (Beards & Staches)</span>
                <span className="text-[10px] text-amber-400 font-mono">{accessories.facialHair}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 mb-2">
                {ACCESSORY_OPTIONS.facialHair.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setAccessories((prev) => ({ ...prev, facialHair: b.id }))}
                    className={`px-2 py-1 text-[10px] font-medium rounded-lg text-center truncate transition-all ${
                      accessories.facialHair === b.id
                        ? 'bg-amber-400 text-slate-900 font-bold'
                        : isDark ? 'bg-white/5 text-slate-400 hover:text-white' : 'bg-black/5 text-slate-600 hover:text-black'
                    }`}
                  >
                    {b.name || b.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                <span className="text-[10px] text-slate-400">Beard Tint:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {HAIR_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setAccessories((prev) => ({ ...prev, facialHairColor: c.hex }))}
                      title={c.name || c.label}
                      className={`w-4 h-4 rounded-full border ${accessories.facialHairColor === c.hex ? 'ring-2 ring-amber-400' : 'border-white/20'}`}
                      style={{ background: c.hex }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Face list */}
        <div className={`${panel} lg:col-span-2`}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
              Faces ({faces.length})
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 font-bold uppercase">
                {listStyle}
              </span>
            </h2>
            <button onClick={() => startNew()} className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r ${gradient} text-slate-900 active:scale-95`}>
              <Plus size={14} /> New face
            </button>
          </div>

          {/* Face List Style Filter */}
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-950/40 border border-white/10 mb-3">
            {[
              { id: 'dots', label: 'LED' },
              { id: 'vector', label: 'Vec' },
              { id: 'oscilloscope', label: 'Scope' },
              { id: 'geometric', label: 'Geo' },
              { id: 'orc', label: 'Orc' },
              { id: 'steampunk', label: 'Steam' },
              { id: 'chronicler', label: 'Chron' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setListStyle(s.id);
                  if (viewStyle !== 'all') {
                    setViewStyle(s.id);
                    setPreviewStyle(s.id);
                  }
                }}
                className={`flex-1 min-w-[2.5rem] py-1 text-[10px] font-bold rounded-lg transition-all text-center ${
                  listStyle === s.id
                    ? 'bg-amber-400 text-slate-900 shadow-sm'
                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-black'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {faces.map((f) => (
              <button key={f.id} onClick={() => select(f)}
                onMouseEnter={() => setHoverId(f.id)} onMouseLeave={() => setHoverId((h) => (h === f.id ? null : h))}
                className={`p-2 rounded-xl border text-left transition-all hover:scale-[1.02] ${
                  selectedId === f.id && !isNew ? 'border-amber-400 ring-1 ring-amber-400/40' : isDark ? 'border-white/10' : 'border-[#2E2B27]/10'
                } ${isDark ? 'bg-slate-950/40' : 'bg-white'}`}>
                <FaceThumb face={f} hovering={hoverId === f.id} style={listStyle} levelRef={simLevelRef} isSpeaking={isSimulatingSpeech} accessories={showAccessories ? accessories : null} />
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

              {/* 1. HEXA VIEW: Compare All 6 Face Animation Models */}
              {viewStyle === 'all' && (
                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950/40 border-white/10' : 'bg-slate-50 border-[#2E2B27]/10'} space-y-4`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-amber-400">
                        <LayoutGrid size={14} />
                        Multi-Style Hexa View: "{draft.name || 'Current Face'}"
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Real-time comparative view across all 6 face animation models with color #{draft.color} {showAccessories ? 'and active accessories' : ''}.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleVoice}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                          isSimulatingSpeech
                            ? 'bg-amber-400 text-slate-900 shadow-md'
                            : ghost
                        }`}
                      >
                        <Volume2 size={13} className={isSimulatingSpeech ? 'animate-pulse' : ''} />
                        {voiceLabel}
                      </button>
                      {voice.said && (voice.playing || voice.busy) && <span className={`text-xs italic max-w-[26rem] ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>"{voice.said}"</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* 1. Dot Matrix */}
                    <div className={`p-3 rounded-xl border flex flex-col gap-2 ${isDark ? 'bg-slate-900/60 border-white/10' : 'bg-white border-[#2E2B27]/15'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold flex items-center gap-1 text-slate-200">
                          Dot Matrix (Classic)
                        </span>
                        <button
                          type="button"
                          onClick={() => switchEngineModel('dots')}
                          className="text-[10px] text-amber-400 hover:underline font-bold"
                        >
                          Edit Dots &rarr;
                        </button>
                      </div>
                      <ImsFace
                        face={{
                          faceStyle: 'dots',
                          grid: draft.grid,
                          openGrid: draft.openGrid,
                          color: draft.color,
                          eyeAnim: draft.eyeAnim,
                          accessories: showAccessories ? accessories : null,
                        }}
                        status={isSimulatingSpeech ? 'speaking' : 'idle'}
                        levelRef={simLevelRef}
                        width="100%"
                        className="shadow-lg mx-auto"
                      />
                      <p className="text-[10px] text-slate-500 text-center">12x8 LED hardware matrix with ambient breathing</p>
                    </div>

                    {/* 2. Dynamic Bezier Vector */}
                    <div className={`p-3 rounded-xl border flex flex-col gap-2 ${isDark ? 'bg-slate-900/60 border-white/10' : 'bg-white border-[#2E2B27]/15'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold flex items-center gap-1 text-slate-200">
                          Bezier Vector
                        </span>
                        <button
                          type="button"
                          onClick={() => switchEngineModel('vector')}
                          className="text-[10px] text-amber-400 hover:underline font-bold"
                        >
                          Inspect &rarr;
                        </button>
                      </div>
                      <ImsFace
                        face={{
                          faceStyle: 'vector',
                          color: draft.color,
                          emotion: draft.name,
                          faceEmotion: draft.name,
                          accessories: showAccessories ? accessories : null,
                        }}
                        status={isSimulatingSpeech ? 'speaking' : 'idle'}
                        levelRef={simLevelRef}
                        width="100%"
                        className="shadow-lg mx-auto"
                      />
                      <p className="text-[10px] text-slate-500 text-center">Curved SVG eyelids, gaze saccades & morphing mouth</p>
                    </div>

                    {/* 3. Neon Oscilloscope Lissajous */}
                    <div className={`p-3 rounded-xl border flex flex-col gap-2 ${isDark ? 'bg-slate-900/60 border-white/10' : 'bg-white border-[#2E2B27]/15'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold flex items-center gap-1 text-slate-200">
                          Oscilloscope Lissajous
                        </span>
                        <button
                          type="button"
                          onClick={() => switchEngineModel('oscilloscope')}
                          className="text-[10px] text-amber-400 hover:underline font-bold"
                        >
                          Inspect &rarr;
                        </button>
                      </div>
                      <ImsFace
                        face={{
                          faceStyle: 'oscilloscope',
                          color: draft.color,
                          emotion: draft.name,
                          faceEmotion: draft.name,
                          accessories: showAccessories ? accessories : null,
                        }}
                        status={isSimulatingSpeech ? 'speaking' : 'idle'}
                        levelRef={simLevelRef}
                        width="100%"
                        className="shadow-lg mx-auto"
                      />
                      <p className="text-[10px] text-slate-500 text-center">Dual Lissajous eye loops & ripple mouth</p>
                    </div>

                    {/* 4. Geometric Low-Poly Facets */}
                    <div className={`p-3 rounded-xl border flex flex-col gap-2 ${isDark ? 'bg-slate-900/60 border-white/10' : 'bg-white border-[#2E2B27]/15'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold flex items-center gap-1 text-slate-200">
                          Geometric Low-Poly
                        </span>
                        <button
                          type="button"
                          onClick={() => switchEngineModel('geometric')}
                          className="text-[10px] text-amber-400 hover:underline font-bold"
                        >
                          Inspect &rarr;
                        </button>
                      </div>
                      <ImsFace
                        face={{
                          faceStyle: 'geometric',
                          color: draft.color,
                          emotion: draft.name,
                          faceEmotion: draft.name,
                          accessories: showAccessories ? accessories : null,
                        }}
                        status={isSimulatingSpeech ? 'speaking' : 'idle'}
                        levelRef={simLevelRef}
                        width="100%"
                        className="shadow-lg mx-auto"
                      />
                      <p className="text-[10px] text-slate-500 text-center">Articulated brow plates & volume-responsive jaw prism</p>
                    </div>

                    {/* 5. Savage Orc War-Chief */}
                    <div className={`p-3 rounded-xl border flex flex-col gap-2 ${isDark ? 'bg-slate-900/60 border-white/10' : 'bg-white border-[#2E2B27]/15'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold flex items-center gap-1 text-slate-200">
                          Orc War-Chief
                        </span>
                        <button
                          type="button"
                          onClick={() => switchEngineModel('orc')}
                          className="text-[10px] text-amber-400 hover:underline font-bold"
                        >
                          Inspect &rarr;
                        </button>
                      </div>
                      <ImsFace
                        face={{
                          faceStyle: 'orc',
                          color: draft.color,
                          emotion: draft.name,
                          faceEmotion: draft.name,
                          accessories: showAccessories ? accessories : null,
                        }}
                        status={isSimulatingSpeech ? 'speaking' : 'idle'}
                        levelRef={simLevelRef}
                        width="100%"
                        className="shadow-lg mx-auto"
                      />
                      <p className={`text-[10px] text-center ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Painted portrait: lip-sync mouth shapes, blinking, breathing and head movement</p>
                    </div>

                    {/* 6. Clockwork Steampunk Automaton */}
                    <div className={`p-3 rounded-xl border flex flex-col gap-2 ${isDark ? 'bg-slate-900/60 border-white/10' : 'bg-white border-[#2E2B27]/15'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold flex items-center gap-1 text-slate-200">
                          Steampunk Automaton
                        </span>
                        <button
                          type="button"
                          onClick={() => switchEngineModel('steampunk')}
                          className="text-[10px] text-amber-400 hover:underline font-bold"
                        >
                          Inspect &rarr;
                        </button>
                      </div>
                      <ImsFace
                        face={{
                          faceStyle: 'steampunk',
                          color: draft.color,
                          emotion: draft.name,
                          faceEmotion: draft.name,
                          accessories: showAccessories ? accessories : null,
                        }}
                        status={isSimulatingSpeech ? 'speaking' : 'idle'}
                        levelRef={simLevelRef}
                        width="100%"
                        className="shadow-lg mx-auto"
                      />
                      <p className="text-[10px] text-slate-500 text-center">Rotating brass gears, pressure gauge & steam puffs</p>
                    </div>

                    {/* 7. The Chronicler (animated painted portrait) */}
                    <div className={`p-3 rounded-xl border flex flex-col gap-2 ${isDark ? 'bg-slate-900/60 border-white/10' : 'bg-white border-[#2E2B27]/15'}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold flex items-center gap-1 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                          The Chronicler
                        </span>
                        <button
                          type="button"
                          onClick={() => switchEngineModel('chronicler')}
                          className="text-[10px] text-amber-600 hover:underline font-bold"
                        >
                          Inspect &rarr;
                        </button>
                      </div>
                      <ImsFace
                        face={{ faceStyle: 'chronicler', emotion: draft.name, faceEmotion: draft.name }}
                        status={isSimulatingSpeech ? 'speaking' : 'idle'}
                        levelRef={simLevelRef}
                        width="100%"
                        className="shadow-lg mx-auto"
                      />
                      <p className={`text-[10px] text-center ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Painted portrait: lip-sync mouth shapes, blinking, breathing and head movement</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. SINGLE-STYLE DEDICATED INSPECTOR */}
              {viewStyle !== 'dots' && viewStyle !== 'all' && (
                <div className={`p-5 rounded-2xl border ${isDark ? 'bg-slate-950/40 border-white/10' : 'bg-slate-50 border-[#2E2B27]/10'} flex flex-col items-center gap-4`}>
                  <div className="w-full flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-amber-400">
                        <Sparkles size={14} />
                        {viewStyle.toUpperCase()} Engine Preview: "{draft.name || 'Current Face'}"
                      </h3>
                      <p className="text-[11px] text-slate-500">Live animated display for this emotion archetype with accessories.</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleVoice}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                          isSimulatingSpeech ? 'bg-amber-400 text-slate-900 shadow-md' : ghost
                        }`}
                      >
                        <Volume2 size={13} className={isSimulatingSpeech ? 'animate-pulse' : ''} />
                        {voiceLabel}
                      </button>
                      {voice.said && (voice.playing || voice.busy) && <span className={`text-xs italic max-w-[26rem] ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>"{voice.said}"</span>}
                      <button
                        type="button"
                        onClick={() => switchEngineModel('dots')}
                        className={`${ghost} text-amber-400 font-bold`}
                      >
                        Back to Dot Matrix Painter
                      </button>
                    </div>
                  </div>

                  <div className="py-2">
                    <ImsFace
                      face={{
                        faceStyle: viewStyle,
                        color: draft.color,
                        emotion: draft.name,
                        faceEmotion: draft.name,
                        accessories: showAccessories ? accessories : null,
                      }}
                      status={isSimulatingSpeech ? 'speaking' : 'idle'}
                      levelRef={simLevelRef}
                      width={280}
                      className="shadow-2xl mx-auto border border-white/10"
                    />
                  </div>

                  <div className="w-full">
                    <ParametricBreakdown emotionKey={draft.name} style={viewStyle} isDark={isDark} />
                  </div>

                  {/* Dedicated Engine Inspector Metadata Controls */}
                  <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-white/10 text-left">
                    <div>
                      <label className={label}>Name</label>
                      <input
                        className={field}
                        value={draft.name}
                        disabled={!isNew && selected?.builtin}
                        placeholder="e.g. smug"
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      />
                      <p className="text-[10px] text-slate-500 mt-1">Letters, numbers and underscores.</p>
                    </div>

                    <div>
                      <label className={label}>Colour</label>
                      <div className="flex items-center gap-3 mb-2">
                        <input
                          type="color"
                          value={`#${draft.color}`}
                          onChange={(e) => setDraft({ ...draft, color: e.target.value.slice(1).toUpperCase() })}
                          className="w-10 h-9 rounded cursor-pointer bg-transparent"
                          title="Open the colour picker"
                        />
                        <span className="text-xs font-mono font-bold text-amber-400">#{draft.color}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {['4CFF7A', 'FFD700', '00E5FF', 'FF3385', 'FFB84D', '33FFB8', '99FF33', '4D94FF', 'FF7733', 'FF2222', 'BA68C8', 'FFFFFF'].map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setDraft({ ...draft, color: c })}
                            title={`#${c}`}
                            className={`w-5 h-5 rounded-md border transition-transform hover:scale-110 ${
                              draft.color === c ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-900' : 'border-white/20'
                            }`}
                            style={{ background: `#${c}` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. CLASSIC 12x8 DOT MATRIX PAINTER (When in dots mode) */}
              <div className={`flex flex-wrap items-start gap-5 ${viewStyle !== 'dots' ? 'hidden' : ''}`}>
                <div>
                  {/* Which frame is being painted */}
                  <div className="flex flex-wrap gap-2 mb-2">
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
                  {/* fills the column on a phone, full size (22px dots) on wider screens */}
                  <div style={{ maxWidth: 12 * 22 + 11 * 4 + 16 }}>
                    <DotGrid grid={shownGrid} color={draft.color} size={22} gap={4} fluid editable={!locked} editRange={editRange} onPaint={paint} />
                  </div>
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
                    <div className="flex items-center justify-between mb-1">
                      <label className={label}><Mic size={10} className="inline mr-1" />Talking preview</label>
                      <button
                        type="button"
                        onClick={toggleVoice}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 transition-all ${
                          isSimulatingSpeech ? 'bg-amber-400 text-slate-900' : 'bg-white/10 text-slate-300 hover:bg-white/20'
                        }`}
                      >
                        <Volume2 size={11} className={isSimulatingSpeech ? 'animate-pulse' : ''} />
                        {voice.busy ? 'Writing...' : voice.playing ? 'Stop' : 'Test Voice'}
                      </button>
                    </div>

                    <div className="rounded-xl overflow-hidden border border-white/10 bg-[#080c14] p-1 mb-2">
                      <ImsFace
                        face={{
                          faceStyle: previewStyle,
                          grid: draft.grid,
                          openGrid: draft.openGrid,
                          color: draft.color,
                          eyeAnim: draft.eyeAnim,
                          emotion: draft.name,
                          faceEmotion: draft.name,
                          accessories: showAccessories ? accessories : null,
                        }}
                        status={isSimulatingSpeech ? 'speaking' : 'idle'}
                        levelRef={simLevelRef}
                        width="100%"
                      />
                    </div>

                    {/* Preview Style Selector Pills */}
                    <div className="flex flex-wrap items-center gap-1 p-0.5 rounded-lg bg-slate-950/40 border border-white/10">
                      {[
                        { id: 'dots', label: 'Dots' },
                        { id: 'vector', label: 'Vec' },
                        { id: 'oscilloscope', label: 'Scope' },
                        { id: 'geometric', label: 'Geo' },
                        { id: 'orc', label: 'Orc' },
                        { id: 'steampunk', label: 'Steam' },
                        { id: 'chronicler', label: 'Chron' },
                      ].map((ps) => (
                        <button
                          key={ps.id}
                          type="button"
                          onClick={() => {
                            setPreviewStyle(ps.id);
                            if (viewStyle !== 'all') {
                              setViewStyle(ps.id);
                              setListStyle(ps.id);
                            }
                          }}
                          className={`flex-1 min-w-[2.2rem] py-0.5 text-[9px] font-bold rounded transition-all text-center ${
                            previewStyle === ps.id
                              ? 'bg-amber-400 text-slate-900'
                              : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-black'
                          }`}
                        >
                          {ps.label}
                        </button>
                      ))}
                    </div>
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

              {/* Eye animation timeline (only applicable to Box-3 Dot Matrix) */}
              {viewStyle === 'dots' && (
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
              )}

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
