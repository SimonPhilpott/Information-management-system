import React, { useEffect, useRef } from 'react';
import { EMOTIONS } from './faceEmotions';
import FaceAccessories from './FaceAccessories';

const hexToRgb = (hex) => {
  const clean = (hex || '4CFF7A').replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export default function OscilloscopeFace({ face, status = 'idle', levelRef, width = 180, className = '' }) {
  const canvasRef = useRef(null);
  const emotionKey = face?.emotion || face?.faceEmotion || 'neutral';
  const emotionConfig = EMOTIONS[emotionKey] || EMOTIONS.neutral;
  const baseColor = face?.color || face?.faceColor || emotionConfig.color || '4CFF7A';

  const stateRef = useRef({ status, emotionConfig, baseColor });
  stateRef.current = { status, emotionConfig, baseColor };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let nextBlink = performance.now() + 2500;
    let blinkUntil = 0;
    let nextGlance = performance.now() + 5000;
    let glanceUntil = 0;
    let glanceX = 0;
    let smoothLevel = 0;
    let phase = 0;

    const render = (now) => {
      const { status: st, emotionConfig: ec, baseColor: col } = stateRef.current;
      const osc = ec.oscilloscope || { freq: 1.5, harmonics: 2, jitter: 0.02, eyeStretch: 1, waveType: 'sine' };
      const [r, g, b] = hexToRgb(col);

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // CRT Phosphor Decay (Dark phosphor background with slight motion blur trail)
      ctx.fillStyle = 'rgba(6, 10, 15, 0.45)';
      ctx.fillRect(0, 0, w, h);

      // Draw subtle CRT phosphor grid lines
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.06)`;
      ctx.lineWidth = 1;
      const stepX = w / 8;
      const stepY = h / 6;
      for (let x = stepX; x < w; x += stepX) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = stepY; y < h; y += stepY) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Voice audio level tracking
      const lvl = levelRef?.current ?? 0;
      smoothLevel = smoothLevel * 0.5 + lvl * 0.5;
      const isSpeaking = st === 'speaking' || smoothLevel > 0.04;
      const isAsleep = st === 'asleep';
      const isThinking = st === 'thinking' || st === 'connecting';

      // Blinks & Glances
      if (!isAsleep) {
        if (now > nextBlink) {
          blinkUntil = now + 120;
          nextBlink = now + (Math.random() < 0.2 ? 300 : 2500 + Math.random() * 4500);
        }
        if (now > nextGlance) {
          glanceX = (Math.random() < 0.5 ? -1 : 1) * (w * 0.035);
          glanceUntil = now + 600 + Math.random() * 800;
          nextGlance = now + 5000 + Math.random() * 7000;
        }
        if (now > glanceUntil) glanceX = 0;
      }
      const isBlinking = !isAsleep && now < blinkUntil;

      // Phase progression
      phase += 0.035 * osc.freq;

      // Oscilloscope Phosphor Glow Style
      ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.85)`;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 1. LEFT AND RIGHT LISSAJOUS EYES
      const eyeY = h * 0.4;
      const eyeLeftX = w * 0.32 + glanceX;
      const eyeRightX = w * 0.68 + glanceX;
      const baseRadius = w * 0.12 * osc.eyeStretch;
      const ySquash = isAsleep ? 0.04 : isBlinking ? 0.02 : 1.0;

      const drawLissajousEye = (cx, cy, flip = 1) => {
        ctx.beginPath();
        const samples = 70;
        const a = osc.harmonics;
        const bHarmonic = osc.harmonics + 1;
        const jitter = (Math.random() - 0.5) * osc.jitter * 12;

        for (let i = 0; i <= samples; i++) {
          const t = (i / samples) * Math.PI * 2;
          let lx = Math.sin(a * t + phase * flip) * baseRadius + jitter;
          let ly = Math.cos(bHarmonic * t + phase) * (baseRadius * 0.75 * ySquash) + jitter;

          if (osc.waveType === 'saw') {
            lx = ((t % 1) - 0.5) * baseRadius * 2;
          } else if (osc.waveType === 'triangle') {
            lx = Math.asin(Math.sin(a * t + phase)) * baseRadius * 0.7;
          }

          const ptX = cx + lx;
          const ptY = cy + ly;
          if (i === 0) ctx.moveTo(ptX, ptY);
          else ctx.lineTo(ptX, ptY);
        }
        ctx.stroke();

        // Inner glowing core dot
        if (!isBlinking && !isAsleep) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          // face.gaze (-1 / 1): the core looks left / right inside the still eye - the Box-3 face pack's eyes that follow you
          ctx.arc(cx + (face?.gaze ? face.gaze * baseRadius * 0.5 : Math.sin(phase) * 3), cy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      };

      drawLissajousEye(eyeLeftX, eyeY, 1);
      drawLissajousEye(eyeRightX, eyeY, -1);

      // 2. OSCILLOSCOPE AUDIO MOUTH WAVEFORM
      const mouthY = h * 0.75;
      const mouthLeft = w * 0.22;
      const mouthRight = w * 0.78;
      const mouthW = mouthRight - mouthLeft;
      const mouthPts = 60;
      const amp = (isSpeaking ? 14 + smoothLevel * 45 : 3.5);

      ctx.beginPath();
      for (let i = 0; i <= mouthPts; i++) {
        const norm = i / mouthPts; // 0 to 1
        const x = mouthLeft + norm * mouthW;
        // Window envelope (tapers ends to 0)
        const envelope = Math.sin(norm * Math.PI);
        const freqMult = isSpeaking ? 4.5 + smoothLevel * 6 : 2.2;

        let yOffset = 0;
        if (osc.waveType === 'square' || ec.id === 'rage') {
          // Clipped aggressive square wave
          const s = Math.sin(norm * Math.PI * freqMult + phase * 2);
          yOffset = Math.sign(s) * amp * envelope;
        } else if (osc.waveType === 'shiver' || ec.id === 'fear') {
          // High-frequency tremor
          yOffset = Math.sin(norm * Math.PI * 12 + phase * 4) * amp * envelope + (Math.random() - 0.5) * 5;
        } else if (osc.waveType === 'glitch' || ec.id === 'confused') {
          // Glitch jump
          const glitchShift = (i % 7 === 0) ? (Math.random() - 0.5) * 12 : 0;
          yOffset = (Math.sin(norm * Math.PI * freqMult + phase) * amp + glitchShift) * envelope;
        } else if (osc.waveType === 'collapse' || ec.id === 'devastated') {
          // Downward sagging collapse
          yOffset = Math.sin(norm * Math.PI * freqMult + phase) * amp * envelope + envelope * 10;
        } else if (isAsleep || ec.id === 'sleepy') {
          // Subtle breathing line
          yOffset = Math.sin(norm * Math.PI * 1.5 + phase * 0.5) * 2 * envelope;
        } else {
          // Standard / Joyful harmonic sine wave
          const smileBend = ec.vector?.mouthSmile ? -ec.vector.mouthSmile * 8 * envelope : 0;
          yOffset = Math.sin(norm * Math.PI * freqMult + phase * 1.8) * amp * envelope + smileBend;
        }

        const y = mouthY + yOffset;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 3. THINKING / CONNECTING SWEEP RING
      if (isThinking) {
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.4)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const sweepAngle = (now / 350) % (Math.PI * 2);
        ctx.arc(w * 0.5, h * 0.5, h * 0.42, sweepAngle, sweepAngle + 1.2);
        ctx.stroke();
      }

      // CRT Scanline Overlay
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      for (let y = 0; y < h; y += 3) {
        ctx.fillRect(0, y, w, 1.2);
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [levelRef, face?.gaze]);

  return (
    <div
      className={`rounded-2xl bg-[#05080c] p-2 border border-white/10 shadow-2xl relative overflow-hidden flex items-center justify-center ${className}`}
      style={{ width }}
    >
      {/* CRT Curvature Bezel & Ambient Glow */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20 blur-lg transition-colors duration-700"
        style={{ background: `radial-gradient(circle at 50% 50%, #${baseColor.replace('#', '')}, transparent 70%)` }}
      />
      <canvas
        ref={canvasRef}
        style={{ width: '100%', aspectRatio: '12 / 8', display: 'block', borderRadius: '12px' }}
      />
      {/* Accessories Overlay (Glasses, Hair, Facial Hair) */}
      <svg
        viewBox="0 0 200 133.33"
        className="absolute inset-0 w-full h-full pointer-events-none p-2"
        style={{ aspectRatio: '12 / 8' }}
      >
        <FaceAccessories
          accessories={face?.accessories}
          audioLevel={levelRef?.current ?? 0}
          isSpeaking={status === 'speaking'}
        />
      </svg>
    </div>
  );
}
