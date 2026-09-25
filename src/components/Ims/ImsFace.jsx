import React, { useEffect, useRef } from 'react';

// Ims's face for the web: the same 12x8 dot grid, designs and behaviour as the desk terminal -
// breathing background, random blinks and glances, eye timelines from the Face Designer, the
// mouth following his actual voice, a thinking spinner and a sleeping face.
const COLS = 12, ROWS = 8;
const RING = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 23, 35, 47, 59, 71, 83, 95, 94, 93, 92, 91, 90, 89, 88, 87, 86, 85, 84, 72, 60, 48, 36, 24, 12];
const EYE_CELLS = [2, 3, 4, 7, 8, 9];
const DEFAULT_FACE = {
  // eyes rows 1-3, smile on rows 5-6 - the firmware's built-in idle face
  grid: '000000000000' + '00fff00fff00' + '00fff00fff00' + '00fff00fff00' + '000000000000' + '00f000000f00' + '000ffffff000' + '000000000000',
  openGrid: null, color: '4CFF7A', eyes: null,
};

const levels = (hex) => {
  const out = new Float32Array(96);
  for (let i = 0; i < 96; i++) out[i] = parseInt((hex || '')[i] || '0', 16) / 15;
  return out;
};
const rgb = (hex) => { const n = parseInt(hex || '4CFF7A', 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

function breath(t) {
  const c = (t / 1000) % 4.5;
  if (c < 1.5) return 0.5 - 0.5 * Math.cos(Math.PI * (c / 1.5));
  if (c < 2) return 1;
  return 0.5 + 0.5 * Math.cos(Math.PI * ((c - 2) / 2.5));
}

export default function ImsFace({ face, status = 'idle', levelRef, width = 180, className = '' }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ face, status });
  stateRef.current = { face, status };
  const faceStartRef = useRef(performance.now());
  useEffect(() => { faceStartRef.current = performance.now(); }, [face]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let nextBlink = performance.now() + 2500, blinkUntil = 0;
    let nextGlance = performance.now() + 6000, glanceUntil = 0, glanceDir = 0;
    let smoothLevel = 0;

    const draw = (now) => {
      const { face: f0, status: st } = stateRef.current;
      const f = f0 || DEFAULT_FACE;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const level = levelRef?.current ?? 0;
      smoothLevel = smoothLevel * 0.5 + level * 0.5;
      const speaking = st === 'speaking';
      const asleep = st === 'asleep';
      const thinking = st === 'thinking' || st === 'connecting';

      let want = levels(speaking && smoothLevel > 0.18 && f.openGrid ? f.openGrid : f.grid);
      if (!f.openGrid && speaking) {
        // Built-in face: open the mouth with the voice (rows 5-7, centre).
        const rows = 1 + Math.round(Math.min(1, smoothLevel * 1.6) * 2);
        for (let r = 5; r < 5 + rows; r++) for (let c = 4; c <= 7; c++) want[r * COLS + c] = 1;
        for (let c = 3; c <= 8; c++) want[6 * COLS + c] = Math.max(want[6 * COLS + c], 0);
      }

      // Eyes: a designed timeline, or natural blinks and glances.
      const cells = f.eyes?.cells;
      if (cells?.length) {
        const total = cells.reduce((a, c) => a + (c.ms || 1000), 0);
        let t = (now - faceStartRef.current) % total, idx = 0;
        for (; idx < cells.length - 1; idx++) { if (t < (cells[idx].ms || 1000)) break; t -= cells[idx].ms || 1000; }
        const eyes = levels(cells[idx].g);
        for (let i = 0; i < 60; i++) want[i] = eyes[i];
      } else if (!asleep) {
        if (now > nextBlink) { blinkUntil = now + 130; nextBlink = now + (Math.random() < 0.18 ? 300 : 2500 + Math.random() * 4500); }
        if (now > nextGlance) { glanceDir = Math.random() < 0.5 ? -1 : 1; glanceUntil = now + 600 + Math.random() * 1000; nextGlance = now + 6000 + Math.random() * 9000; }
        if (now < blinkUntil) {
          for (let r = 1; r <= 4; r++) for (const c of EYE_CELLS) want[r * COLS + c] = 0;
          for (const c of EYE_CELLS) want[3 * COLS + c] = 1;
        } else if (now < glanceUntil && st !== 'listening') {
          const shifted = new Float32Array(want);
          for (let r = 0; r <= 4; r++) for (let c = 0; c < COLS; c++) {
            const src = c - glanceDir;
            shifted[r * COLS + c] = src >= 0 && src < COLS ? want[r * COLS + src] : 0;
          }
          want = shifted;
        }
      }

      if (asleep) {
        want = new Float32Array(96);
        for (const c of EYE_CELLS) want[3 * COLS + c] = 0.8;
        want[6 * COLS + 5] = 0.6; want[6 * COLS + 6] = 0.6;
      }
      if (thinking) {
        const step = Math.floor(now / 60) % 36;
        [1, 0.55, 0.3, 0.15].forEach((v, k) => { const i = RING[(step - k + 36) % 36]; want[i] = Math.max(want[i], v); });
      }

      const [R, G, B] = asleep ? [60, 90, 140] : rgb(f.color);
      const bg = 0.05 + 0.19 * breath(now);
      const pitch = Math.min(w / COLS, h / ROWS);
      const dot = pitch * 0.72;
      const ox = (w - pitch * COLS) / 2 + (pitch - dot) / 2, oy = (h - pitch * ROWS) / 2 + (pitch - dot) / 2;
      for (let i = 0; i < 96; i++) {
        const v = want[i];
        const x = ox + (i % COLS) * pitch, y = oy + Math.floor(i / COLS) * pitch;
        const a = v > 0 ? 0.25 + 0.75 * v : bg;
        ctx.fillStyle = `rgba(${R},${G},${B},${a.toFixed(3)})`;
        if (v > 0.9) { ctx.shadowColor = `rgba(${R},${G},${B},0.55)`; ctx.shadowBlur = dot * 0.6; } else ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.roundRect(x, y, dot, dot, dot * 0.3);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [levelRef]);

  return (
    <div className={`rounded-2xl bg-[#0b0e15] p-2 ${className}`} style={{ width }}>
      <canvas ref={canvasRef} style={{ width: '100%', aspectRatio: `${COLS} / ${ROWS}`, display: 'block' }} />
    </div>
  );
}
