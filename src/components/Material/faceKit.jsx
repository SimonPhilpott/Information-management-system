// The Face Designer's drawing pieces, moved unchanged from Dashboard/FaceDesignerPortal.jsx (24 Oct 2026) so the
// IMS-design page (Material/FaceDesigner.jsx) can use them: the 12x8 dot grid, the eye-animation timeline helpers,
// the following-eyes rules (same as followEyes() in faceDesignService.js) and the talking previews.
import React, { useState, useEffect, useRef } from 'react';
import ImsFace from '../Ims/ImsFace';

export const COLS = 12, ROWS = 8;
export const EMPTY_GRID = '0'.repeat(COLS * ROWS);

// Brush levels written into the grid: 0 = off, 2 = a dim dot, f = fully lit.
export const BRUSHES = [
  { key: 'f', label: 'Lit', hint: 'a fully lit dot' },
  { key: '2', label: 'Dim', hint: 'a dim dot (like a pupil)' },
  { key: '0', label: 'Erase', hint: 'switch a dot off' }
];

// Every face is two frames on the device's 12x8 grid: the resting face (mouth
// closed) and the speaking face (mouth open). Ims flaps between them as it talks.
export const FRAMES = [
  { key: 'grid', label: 'Mouth closed', hint: 'The resting face' },
  { key: 'openGrid', label: 'Mouth open', hint: 'Shown while Ims speaks' }
];

// Draws a 12x8 dot grid. Unlit dots are faint, matching the device's
// (breathing) background dots behind every face.
export function DotGrid({ grid, color, size = 14, gap = 3, onPaint, editable = false, editRange = null, fluid = false }) {
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
export const EYE_LEN = 5 * COLS;
export const MAX_CELLS = 24;

export function collapseEyes(eyes) {
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
export function shiftEyes(eyes, dir) {
  const v = eyes.split('').map((c) => parseInt(c, 16));
  const src = v.slice();
  for (let r = 0; r < 5; r++) for (let c = 0; c < COLS; c++) {
    const x = src[r * COLS + c], nc = c + dir;
    if (x > 0 && x <= 3 && nc >= 0 && nc < COLS && src[r * COLS + nc] >= 12) { v[r * COLS + nc] = x; v[r * COLS + c] = 15; }
  }
  return v.map((x) => x.toString(16)).join('');
}
// Open, blink, look left, look right - built from whatever eyes the face has now.
export function defaultCells(grid) {
  const eyes = grid.slice(0, EYE_LEN);
  return [
    { name: 'Eyes open', ms: 5500, grid: eyes },
    { name: 'Blink', ms: 250, grid: collapseEyes(eyes) },
    { name: 'Look left', ms: 1200, grid: shiftEyes(eyes, -1) },
    { name: 'Look right', ms: 1200, grid: shiftEyes(eyes, 1) },
  ];
}
export const totalMs = (cells) => cells.reduce((n, c) => n + (Number(c.ms) || 0), 0);
export function cellAt(cells, tMs) {
  let t = tMs % Math.max(1, totalMs(cells));
  for (let i = 0; i < cells.length; i++) { if (t < cells[i].ms) return i; t -= cells[i].ms; }
  return cells.length - 1;
}
export const isAnimated = (anim) => Boolean(anim?.enabled && anim.cells?.length);

// --- Following you ----------------------------------------------------------
// While someone is at the desk, Ims's eyes follow them: these are the eyes (top five rows) he shows looking
// left, ahead and right. A face's own design wins; otherwise its timeline's "Look left" / "Look right" cells
// (with "Eyes open" as ahead); otherwise they're made automatically by sliding each dim pupil dot one step.
// "Left" / "Right" are as you look at the screen. Same rules as followEyes() in faceDesignService.js.
export const LOOKS = [
  { key: 'left', frame: 'lookLeft', label: 'Left' },
  { key: 'ahead', frame: 'lookAhead', label: 'Ahead' },
  { key: 'right', frame: 'lookRight', label: 'Right' },
];
export function followEyes(d) {
  if (d.eyeLook) return { ...d.eyeLook, source: 'designed' };
  const cells = isAnimated(d.eyeAnim) ? d.eyeAnim.cells : [];
  const find = (re) => cells.find((c) => re.test(c.name || ''))?.grid;
  const left = find(/look\s*left/i), right = find(/look\s*right/i);
  if (left && right) return { ahead: find(/eyes\s*open|ahead/i) || cells[0].grid, left, right, source: 'timeline' };
  const ahead = cells[0]?.grid || d.grid.slice(0, EYE_LEN);
  return { ahead, left: shiftEyes(ahead, -1), right: shiftEyes(ahead, 1), source: 'automatic' };
}

// The face "talking" with its eyes animating in real time, alternating the two
// mouth frames the way the device does.
export function TalkingPreview({ face, size = 9, gap = 2, fluid = false }) {
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

export function FaceThumb({ face, hovering, style = 'dots', levelRef, isSpeaking = false, accessories = null }) {
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
