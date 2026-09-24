import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Smile, Save, Trash2, Copy, Play, Plus, Eraser, RotateCcw, Undo2, Lock, Rewind, Mic } from 'lucide-react';
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
function DotGrid({ grid, color, size = 14, gap = 3, onPaint, editable = false }) {
  const [painting, setPainting] = useState(false);
  useEffect(() => {
    const up = () => setPainting(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);
  const cells = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    const level = parseInt(grid[i] || '0', 16);
    const lit = level / 15;
    // Unlit dots are the design's own colour, faded, and breathe in and out on
    // the same inhale / pause / exhale rhythm as the device's background dots.
    cells.push(
      <div
        key={i}
        onMouseDown={editable ? (e) => { e.preventDefault(); setPainting(true); onPaint(i, true); } : undefined}
        onMouseEnter={editable ? () => { if (painting) onPaint(i, false); } : undefined}
        style={{
          width: size, height: size, borderRadius: size * 0.33,
          background: `#${color}`,
          ...(lit > 0 ? { opacity: 0.25 + 0.75 * lit } : { animation: 'imsBreath 4.5s ease-in-out infinite' }),
          cursor: editable ? 'pointer' : 'default',
          boxShadow: lit > 0.9 ? `0 0 ${size * 0.5}px #${color}88` : 'none'
        }}
      />
    );
  }
  return (
    <div className="p-2 rounded-lg select-none"
      style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, ${size}px)`, gap, background: '#0b0e15', width: 'fit-content' }}>
      <style>{'@keyframes imsBreath { 0% { opacity: .05 } 33% { opacity: .24 } 44% { opacity: .24 } 100% { opacity: .05 } }'}</style>
      {cells}
    </div>
  );
}

// The face "talking": alternates the two frames the way the device does.
function TalkingPreview({ face }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setOpen((o) => !o), 260);
    return () => clearInterval(id);
  }, []);
  return <DotGrid grid={open ? face.openGrid : face.grid} color={face.color} size={9} gap={2} />;
}

export default function FaceDesignerPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [faces, setFaces] = useState([]);
  const [deleted, setDeleted] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState({ name: '', grid: EMPTY_GRID, openGrid: EMPTY_GRID, color: '4CFF7A', scenarios: '' });
  const [frame, setFrame] = useState('grid');           // which frame is being painted
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
    setDraft({ name: face.name, grid: face.grid, openGrid: face.openGrid, color: face.color, scenarios: face.scenarios });
  }

  const startNew = (from = null) => {
    setSelectedId(null);
    setIsNew(true);
    setFrame('grid');
    setDraft(from
      ? { name: `${from.name}_copy`, grid: from.grid, openGrid: from.openGrid, color: from.color, scenarios: from.scenarios }
      : { name: '', grid: EMPTY_GRID, openGrid: EMPTY_GRID, color: '4CFF7A', scenarios: '' });
  };

  const strokeLevel = useRef(brush);
  const paint = (i, start = false) => {
    setDraft((d) => {
      const chars = d[frame].split('');
      if (start) strokeLevel.current = (brush !== '0' && chars[i] === brush) ? '0' : brush;
      chars[i] = strokeLevel.current;
      return { ...d, [frame]: chars.join('') };
    });
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
        ? { name: draft.name || 'preview', grid: draft.grid, openGrid: draft.openGrid, color: draft.color }
        : locked ? { name: selected.name } : { name: draft.name, grid: draft.grid, openGrid: draft.openGrid, color: draft.color };
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
                className={`p-2 rounded-xl border text-left transition-all hover:scale-[1.02] ${
                  selectedId === f.id && !isNew ? 'border-amber-400 ring-1 ring-amber-400/40' : isDark ? 'border-white/10' : 'border-[#2E2B27]/10'
                } ${isDark ? 'bg-slate-950/40' : 'bg-white'}`}>
                <DotGrid grid={f.grid} color={f.color} size={8} gap={2} />
                <div className="mt-2 text-xs font-bold flex items-center gap-1.5">
                  {f.name}{f.shapeLocked && <Lock size={10} className="opacity-50" title="Drawn by the firmware" />}
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
              {selected?.name === 'neutral' && !isNew && (
                <p className={`text-[11px] leading-relaxed p-3 rounded-lg border ${isDark ? 'border-white/10 text-slate-400' : 'border-[#2E2B27]/10 text-slate-600'}`}>
                  This is Ims's everyday face. Your dots and colour are used when Ims is idle and when it is speaking. While listening, thinking, connecting or recording it keeps its own state faces and colours, so you can always tell what it is doing.
                </p>
              )}

              <div className="flex flex-wrap items-start gap-5">
                <div>
                  {/* Which frame is being painted */}
                  <div className="flex gap-2 mb-2">
                    {FRAMES.map((fr) => (
                      <button key={fr.key} onClick={() => setFrame(fr.key)} title={fr.hint}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${frame === fr.key ? `bg-gradient-to-r ${gradient} text-slate-900` : isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}>
                        {fr.label}
                      </button>
                    ))}
                  </div>
                  <DotGrid grid={draft[frame]} color={draft.color} size={22} gap={4} editable={!locked} onPaint={paint} />
                  <p className="text-[10px] text-slate-500 mt-1.5">{frame === 'grid' ? 'The resting face: eyes and a closed mouth.' : 'The same face with the mouth open - shown while Ims speaks.'}</p>

                  {!locked && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {BRUSHES.map((b) => (
                        <button key={b.key} onClick={() => setBrush(b.key)} title={b.hint}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 ${brush === b.key ? `bg-gradient-to-r ${gradient} text-slate-900` : isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-black/5 hover:bg-black/10'}`}>
                          {b.key === '0' && <Eraser size={12} />}{b.label}
                        </button>
                      ))}
                      <button onClick={() => setDraft((d) => ({ ...d, [frame]: EMPTY_GRID }))} className={ghost}><RotateCcw size={12} /> Clear</button>
                    </div>
                  )}
                  {!locked && (
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
                    <TalkingPreview face={{ grid: draft.grid, openGrid: draft.openGrid, color: draft.color }} />
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

              <div>
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
            </div>
          )}
        </div>
      </div>
    </PortalShell>
  );
}
