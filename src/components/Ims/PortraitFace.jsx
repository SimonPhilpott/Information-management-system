import React, { useEffect, useRef } from 'react';

// A painted portrait (Orc Chief, Chronicler...) animated like a character, entirely from frames made from
// the painting itself and aligned to it:
//  - EXPRESSIONS: each emotion is its own painted expression (brows, forehead, eyes, the face round the
//    mouth). Changing emotion MORPHS through optical-flow in-between frames (current -> neutral -> new),
//    so the brows actually travel.
//  - LIP-SYNC: every expression has its own mouth shapes (closed / "ah" / wide, plus neutral's small and
//    "oh"), so he keeps the emotion while he talks. Syllables are detected from the voice level.
//  - HEAD: sprung breathing, idle sway, held tilts and a nod on each syllable, pivoting at the neck; the
//    emotion changes how he moves (rage nods hard, sad and sleepy hang low and slow).
//  - EYES: blinking lids fitted to each expression's eye opening (none where the eyes are already shut).
// One animation loop writes straight to the DOM - no React re-render per frame.
//
// art = { frames: { neutral: { closed, small, mid, wide, round }, <emotion>: { closed, mid, wide, m1..m4 } },
//         eyes: { <emotion>: [{ x, y, w, h, lid: [top, bottom], open }] } (% of the painting),
//         aspect, background, pivot, motion }

// how each emotion moves the head: amount of nod, sway speed, head drop (%), extra tilt
const MOVE = {
  rage: { nod: 1.6, sway: 1.3, drop: 0, tilt: 0 }, anger: { nod: 1.3, sway: 1.1, drop: 0, tilt: 0 },
  joy: { nod: 1.3, sway: 1.2, drop: -0.3, tilt: 0 }, love: { nod: 0.8, sway: 0.8, drop: 0, tilt: 1.5 },
  cocky: { nod: 1, sway: 0.9, drop: -0.3, tilt: 2.2 }, sad: { nod: 0.6, sway: 0.6, drop: 1.2, tilt: -1 },
  devastated: { nod: 0.5, sway: 0.5, drop: 1.8, tilt: -1.5 }, bored: { nod: 0.4, sway: 0.5, drop: 0.8, tilt: 1.8 },
  sleepy: { nod: 0.3, sway: 0.4, drop: 1.6, tilt: 2.5 }, fear: { nod: 0.9, sway: 1.6, drop: -0.5, tilt: 0 },
  amazement: { nod: 0.9, sway: 1, drop: -0.8, tilt: 0 }, confused: { nod: 0.8, sway: 0.9, drop: 0, tilt: -2.2 },
  suspicious: { nod: 0.6, sway: 0.7, drop: 0.3, tilt: 1.6 },
};
const STILL = { nod: 1, sway: 1, drop: 0, tilt: 0 };
const ALIAS = { standby: 'neutral' };
const FRAME_MS = 42; // morph frame time (~24 fps)

export default function PortraitFace({ art, face, status = 'idle', levelRef, width = 180, className = '' }) {
  const asked = face?.emotion || face?.faceEmotion || 'neutral';
  const target = status === 'asleep' ? (art.frames.sleepy ? 'sleepy' : 'neutral') : (art.frames[ALIAS[asked] || asked] ? (ALIAS[asked] || asked) : 'neutral');
  const headRef = useRef(null);
  const layers = useRef({});     // closed / small / mid / wide / round / morph <img>s
  const lidRefs = useRef([]);
  const statusRef = useRef(status);
  const targetRef = useRef(target);
  statusRef.current = status;
  targetRef.current = target;

  // warm the browser cache for everything this face can show
  useEffect(() => {
    for (const set of Object.values(art.frames)) for (const url of Object.values(set)) { if (url) { const i = new Image(); i.src = url; } }
  }, [art]);

  useEffect(() => {
    let raf = 0;
    const st = {
      expr: null, queue: [], queueAt: 0, morphing: false,
      level: 0, shape: 'closed', shapeAt: 0, syllableOpen: false, variant: 'mid',
      rot: 0, y: 0, s: 1, vRot: 0, vY: 0, nod: 0, tilt: 0, nextTilt: performance.now() + 5000, tiltUntil: 0,
      nextBlink: performance.now() + 2200, blinkUntil: 0, doubleBlinkAt: 0, sim: 0, simTarget: 0, simNext: 0,
    };
    const set = (k) => art.frames[k] || art.frames.neutral;
    const shapeUrl = (k, shape) => {
      const f = set(k);
      if (shape === 'small') return f.small || f.mid || f.closed;
      if (shape === 'round') return f.round || f.mid || f.closed;
      return f[shape] || f.closed;
    };
    const showExpression = (k) => {
      st.expr = k;
      for (const shape of ['closed', 'small', 'mid', 'wide', 'round']) { const el = layers.current[shape]; if (el) el.src = shapeUrl(k, shape); }
      // half-open "small" for an expression without its own: its "ah" frame at half strength over closed
      if (layers.current.small) layers.current.small.dataset.half = set(k).small ? '' : '1';
      const geo = art.eyes?.[k] || art.eyes?.neutral || [];
      lidRefs.current.forEach((el, i) => {
        const e = geo[i];
        if (!el) return;
        if (!e) { el.style.display = 'none'; return; }
        Object.assign(el.style, { display: e.open === false ? 'none' : 'block', left: `${e.x - e.w / 2}%`, top: `${e.y - e.h / 2}%`, width: `${e.w}%`, height: `${e.h}%`, background: `linear-gradient(180deg, ${e.lid[0]}, ${e.lid[1]})` });
      });
    };
    const setShape = (name) => {
      const half = layers.current.small?.dataset.half === '1';
      for (const k of ['small', 'mid', 'wide', 'round']) {
        const el = layers.current[k];
        if (!el) continue;
        el.style.opacity = k === name ? (k === 'small' && half ? '0.5' : '1') : '0';
      }
    };
    // the morph from one expression to another: back out through its in-betweens to neutral, then in
    const morphFrames = (from, to) => {
      const out = [];
      if (from !== 'neutral') { const f = set(from); for (const m of ['m4', 'm3', 'm2', 'm1']) if (f[m]) out.push(f[m]); out.push(set('neutral').closed); }
      if (to !== 'neutral') { const t = set(to); for (const m of ['m1', 'm2', 'm3', 'm4']) if (t[m]) out.push(t[m]); }
      return out;
    };

    showExpression(targetRef.current);
    setShape('closed');

    const tick = (now) => {
      const status = statusRef.current;
      const asleep = status === 'asleep';

      // ---- expression changes -> morph ----
      if (targetRef.current !== st.expr && !st.morphing) {
        st.queue = morphFrames(st.expr, targetRef.current);
        st.next = targetRef.current;
        st.morphing = true; st.queueAt = now; setShape('closed');
        lidRefs.current.forEach((el) => { if (el) el.style.opacity = '0'; });
      }
      const morph = layers.current.morph;
      if (st.morphing) {
        const i = Math.floor((now - st.queueAt) / FRAME_MS);
        if (i < st.queue.length) { if (morph) { if (morph.src !== st.queue[i]) morph.src = st.queue[i]; morph.style.opacity = '1'; } }
        else { showExpression(st.next); st.morphing = false; if (morph) morph.style.opacity = '0'; }
      }
      const mv = MOVE[st.expr] || STILL;

      // ---- voice level ----
      let raw = levelRef?.current ?? 0;
      if (status === 'speaking' && raw < 0.01) { // a preview with no audio: a natural syllable rhythm
        if (now > st.simNext) { st.simTarget = Math.random() < 0.22 ? 0 : 0.15 + Math.random() * 0.6; st.simNext = now + 90 + Math.random() * 170; }
        st.sim += (st.simTarget - st.sim) * 0.35; raw = st.sim;
      }
      st.level = raw > st.level ? st.level * 0.35 + raw * 0.65 : st.level * 0.78 + raw * 0.22;
      const lvl = asleep || st.morphing ? 0 : st.level;
      const talking = lvl > 0.05;

      // ---- syllables -> mouth shape ----
      if (lvl < 0.06) st.syllableOpen = false;
      else if (!st.syllableOpen && lvl > 0.11) {
        st.syllableOpen = true;
        st.variant = Math.random() < 0.28 ? 'round' : 'mid';
        st.nod = Math.min(1, 0.35 + lvl) * (Math.random() < 0.5 ? -1 : 1);
      }
      let want = 'closed';
      if (talking) want = lvl < 0.15 ? 'small' : lvl < 0.42 ? st.variant : 'wide';
      if (!st.morphing && want !== st.shape && now - st.shapeAt > 75) { st.shape = want; st.shapeAt = now; setShape(want); }

      // ---- head ----
      const motion = art.motion ?? 1;
      const breath = Math.sin(now / (asleep ? 2200 : 1500));
      if (!talking && now > st.nextTilt) { st.tilt = (Math.random() - 0.5) * 2.4; st.tiltUntil = now + 1500 + Math.random() * 2000; st.nextTilt = now + 6000 + Math.random() * 6000; }
      if (now > st.tiltUntil) st.tilt *= 0.97;
      st.nod *= 0.9;
      const tRot = (Math.sin(now / (3100 / mv.sway)) * 0.55 + st.tilt + mv.tilt + st.nod * 1.1 * mv.nod + (talking ? Math.sin(now / 420) * lvl * 0.6 * mv.nod : 0)) * motion;
      const tY = (mv.drop + breath * 0.25 + Math.abs(st.nod) * 0.8 * mv.nod + lvl * 0.6) * motion;
      const tS = 1 + breath * 0.004 + lvl * 0.006 * motion;
      st.vRot = (st.vRot + (tRot - st.rot) * 0.06) * 0.78; st.rot += st.vRot;
      st.vY = (st.vY + (tY - st.y) * 0.08) * 0.75; st.y += st.vY;
      st.s += (tS - st.s) * 0.12;
      if (headRef.current) headRef.current.style.transform = `translateY(${st.y.toFixed(3)}%) rotate(${st.rot.toFixed(3)}deg) scale(${st.s.toFixed(4)})`;

      // ---- eyes ----
      if (!asleep && !st.morphing && now > st.nextBlink) {
        st.blinkUntil = now + 130;
        if (Math.random() < 0.15) st.doubleBlinkAt = now + 260;
        st.nextBlink = now + 2600 + Math.random() * 4200;
      }
      if (st.doubleBlinkAt && now > st.doubleBlinkAt) { st.blinkUntil = now + 120; st.doubleBlinkAt = 0; }
      const lid = !st.morphing && (asleep || now < st.blinkUntil) ? 1 : 0;
      lidRefs.current.forEach((el) => { if (el && el.style.display !== 'none') { el.style.transform = `scaleY(${lid})`; el.style.opacity = lid ? '1' : '0'; } });

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [art, levelRef]);

  const filter = status === 'asleep' ? 'brightness(0.7) saturate(0.8)' : 'none';
  const img = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', userSelect: 'none', pointerEvents: 'none', transition: 'opacity 55ms linear' };
  const first = art.frames[target] || art.frames.neutral;

  return (
    <div className={`rounded-2xl relative overflow-hidden flex items-center justify-center ${className}`}
      style={{ width, aspectRatio: '12 / 8', display: 'flex', alignItems: 'center', justifyContent: 'center', background: art.background, filter, transition: 'filter 600ms ease' }}>
      <div ref={headRef} style={{ position: 'relative', height: '100%', aspectRatio: art.aspect, transformOrigin: art.pivot || '50% 88%', willChange: 'transform' }}>
        <img ref={(el) => { layers.current.closed = el; }} src={first.closed} alt="" draggable="false" style={{ ...img, transition: 'none' }} />
        {['small', 'mid', 'round', 'wide'].map((k) => (
          <img key={k} ref={(el) => { layers.current[k] = el; }} src={first[k] || first.mid || first.closed} alt="" draggable="false" style={{ ...img, opacity: 0 }} />
        ))}
        <img ref={(el) => { layers.current.morph = el; }} src={first.closed} alt="" draggable="false" style={{ ...img, opacity: 0, transition: 'none' }} />
        {[0, 1].map((i) => (
          <div key={i} ref={(el) => { lidRefs.current[i] = el; }} style={{
            position: 'absolute', borderRadius: '50% 50% 45% 45%', boxShadow: 'inset 0 -1px 2px rgba(0,0,0,0.55)',
            transformOrigin: '50% 0%', transform: 'scaleY(0)', opacity: 0, transition: 'transform 55ms ease-out',
          }} />
        ))}
      </div>
    </div>
  );
}
