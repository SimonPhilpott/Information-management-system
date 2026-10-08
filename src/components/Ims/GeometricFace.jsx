import React, { useEffect, useRef, useState } from 'react';
import { EMOTIONS } from './faceEmotions';
import FaceAccessories from './FaceAccessories';

const hexToRgba = (hex, alpha = 1) => {
  const clean = (hex || '4CFF7A').replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default function GeometricFace({ face, status = 'idle', levelRef, width = 180, className = '' }) {
  const emotionKey = face?.emotion || face?.faceEmotion || 'neutral';
  const emotionConfig = EMOTIONS[emotionKey] || EMOTIONS.neutral;
  const baseColor = face?.color || face?.faceColor || emotionConfig.color || '4CFF7A';
  const color = `#${baseColor.replace('#', '')}`;

  const [blink, setBlink] = useState(false);
  const [glance, setGlance] = useState({ x: 0, y: 0 });
  const [audioLevel, setAudioLevel] = useState(0);
  const [pulse, setPulse] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    let nextBlink = performance.now() + 2500;
    let blinkUntil = 0;
    let nextGlance = performance.now() + 5000;
    let glanceUntil = 0;
    let currentGlance = { x: 0, y: 0 };
    let smoothLevel = 0;

    const animate = (now) => {
      // Natural blinks
      if (status !== 'asleep') {
        if (now > nextBlink) {
          blinkUntil = now + 130;
          nextBlink = now + (Math.random() < 0.2 ? 300 : 2500 + Math.random() * 4500);
        }
        setBlink(now < blinkUntil);

        // Natural glances
        if (now > nextGlance) {
          const dir = Math.random() < 0.5 ? -1 : 1;
          currentGlance = { x: dir * (3 + Math.random() * 3), y: (Math.random() - 0.5) * 2 };
          glanceUntil = now + 600 + Math.random() * 800;
          nextGlance = now + 5000 + Math.random() * 7000;
        }
        if (now > glanceUntil) currentGlance = { x: 0, y: 0 };
        setGlance(currentGlance);
      } else {
        setBlink(true);
        setGlance({ x: 0, y: 0 });
      }

      // Voice volume smoothing
      const lvl = levelRef?.current ?? 0;
      smoothLevel = smoothLevel * 0.45 + lvl * 0.55;
      setAudioLevel(smoothLevel);

      // Cybernetic node pulse (3s cycle)
      setPulse((Math.sin(now / 480) + 1) / 2);

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [status, levelRef]);

  const geo = emotionConfig.geometric || { browPitch: 0, eyeAperture: 1, jawDrop: 0, facetAngle: 0 };
  const isSpeaking = status === 'speaking' || audioLevel > 0.05;
  const isThinking = status === 'thinking' || status === 'connecting';
  const isAsleep = status === 'asleep';

  // Eye aperture factor: 0 when closed/blinking, scaled by emotion
  const eyeAperture = isAsleep ? 0.08 : blink ? 0.05 : Math.max(0.2, geo.eyeAperture);
  const eyeH = 14 * eyeAperture;

  // Brow tilt in degrees/pixels
  const browPitch = geo.browPitch || 0;
  // Left brow: slants from outer to inner. Right brow: symmetric
  // Outer left: (48, 44), Inner left: (86, 44 - browPitch * 0.4)
  const lOuterY = 44 + browPitch * 0.25;
  const lInnerY = 44 - browPitch * 0.5;
  const rInnerY = 44 - browPitch * 0.5;
  const rOuterY = 44 + browPitch * 0.25;

  // Eye centers with glance offset
  const lEyeX = 67 + glance.x;
  const lEyeY = 58 + glance.y;
  const rEyeX = 133 + glance.x;
  const rEyeY = 58 + glance.y;
  // face.gaze (-1 / 1): only the bright core looks left / right inside the still eye - the Box-3 face pack's
  // eyes that follow you
  const core = face?.gaze ? face.gaze * 7 : 0;

  // Low-poly polygonal eye vertices (Hexagon / Diamond)
  // Left eye polygon:
  const lEyePts = [
    `${lEyeX - 16},${lEyeY}`,
    `${lEyeX - 8},${lEyeY - eyeH}`,
    `${lEyeX + 8},${lEyeY - eyeH}`,
    `${lEyeX + 16},${lEyeY}`,
    `${lEyeX + 8},${lEyeY + eyeH}`,
    `${lEyeX - 8},${lEyeY + eyeH}`,
  ].join(' ');

  // Right eye polygon:
  const rEyePts = [
    `${rEyeX - 16},${rEyeY}`,
    `${rEyeX - 8},${rEyeY - eyeH}`,
    `${rEyeX + 8},${rEyeY - eyeH}`,
    `${rEyeX + 16},${rEyeY}`,
    `${rEyeX + 8},${rEyeY + eyeH}`,
    `${rEyeX - 8},${rEyeY + eyeH}`,
  ].join(' ');

  // Articulated Lower Jaw Prism Mouth
  // Jaw Drop: geo.jawDrop (0..0.85) + audioLevel (0..1)
  const jawDropDist = (geo.jawDrop * 12) + (isSpeaking ? audioLevel * 24 : 0);
  const mouthTopY = 88;
  const mouthMidY = 96;
  const mouthBottomY = 96 + Math.max(2, jawDropDist);

  // Polygonal mouth facets:
  // Upper lip chevron: (78, 88) -> (100, 91) -> (122, 88)
  // Lower jaw prism: (78, 88) -> (100, mouthBottomY) -> (122, 88) -> (100, mouthMidY)
  const mouthUpperPts = `78,${mouthTopY} 100,${mouthTopY + 3} 122,${mouthTopY}`;
  const mouthLowerPts = `78,${mouthTopY} 100,${mouthBottomY} 122,${mouthTopY}`;

  return (
    <div
      className={`rounded-2xl bg-[#070b10] p-2 border border-white/5 shadow-2xl relative overflow-hidden flex items-center justify-center ${className}`}
      style={{ width }}
    >
      {/* Background Cybernetic Glow */}
      <div
        className="absolute inset-0 pointer-events-none opacity-25 blur-xl transition-colors duration-700"
        style={{ background: `radial-gradient(circle at 50% 50%, ${color}, transparent 65%)` }}
      />

      <svg
        viewBox="0 0 200 133.33"
        className="w-full h-full block relative z-10"
        style={{ aspectRatio: '12 / 8' }}
      >
        <defs>
          <filter id="geoGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 1. CYBERNETIC FACET CONTOUR (Outer Angular Wireframe Mask) */}
        <polygon
          points="24,30 60,14 140,14 176,30 188,75 160,118 100,126 40,118 12,75"
          fill={hexToRgba(baseColor, 0.04)}
          stroke={hexToRgba(baseColor, 0.25)}
          strokeWidth="1.2"
        />

        {/* Diagonal wireframe mesh triangulation lines */}
        <line x1="24" y1="30" x2="60" y2="44" stroke={hexToRgba(baseColor, 0.15)} strokeWidth="1" />
        <line x1="176" y1="30" x2="140" y2="44" stroke={hexToRgba(baseColor, 0.15)} strokeWidth="1" />
        <line x1="40" y1="118" x2="78" y2="88" stroke={hexToRgba(baseColor, 0.15)} strokeWidth="1" />
        <line x1="160" y1="118" x2="122" y2="88" stroke={hexToRgba(baseColor, 0.15)} strokeWidth="1" />
        <line x1="100" y1="14" x2="100" y2="40" stroke={hexToRgba(baseColor, 0.2)} strokeWidth="1" strokeDasharray="3 3" />

        {/* 2. ARTICULATED ANGULAR BROW PLATES */}
        <g filter="url(#geoGlow)">
          {/* Left Brow Shard */}
          <polygon
            points={`48,${lOuterY} 86,${lInnerY} 84,${lInnerY - 5} 46,${lOuterY - 4}`}
            fill={hexToRgba(baseColor, 0.6)}
            stroke={color}
            strokeWidth="1.5"
            className="transition-all duration-200"
          />
          {/* Right Brow Shard */}
          <polygon
            points={`114,${rInnerY} 152,${rOuterY} 154,${rOuterY - 4} 116,${rInnerY - 5}`}
            fill={hexToRgba(baseColor, 0.6)}
            stroke={color}
            strokeWidth="1.5"
            className="transition-all duration-200"
          />
        </g>

        {/* 3. POLYGONAL EYES */}
        <g filter="url(#geoGlow)">
          {/* Left Eye Facet */}
          <polygon
            points={lEyePts}
            fill={hexToRgba(baseColor, 0.35)}
            stroke={color}
            strokeWidth="1.8"
            className="transition-all duration-150"
          />
          {/* Left Eye Diamond Core (Iris) */}
          {!blink && !isAsleep && (
            <polygon
              points={`${lEyeX + core},${lEyeY - 4} ${lEyeX + core + 4},${lEyeY} ${lEyeX + core},${lEyeY + 4} ${lEyeX + core - 4},${lEyeY}`}
              fill="#ffffff"
            />
          )}

          {/* Right Eye Facet */}
          <polygon
            points={rEyePts}
            fill={hexToRgba(baseColor, 0.35)}
            stroke={color}
            strokeWidth="1.8"
            className="transition-all duration-150"
          />
          {/* Right Eye Diamond Core (Iris) */}
          {!blink && !isAsleep && (
            <polygon
              points={`${rEyeX + core},${rEyeY - 4} ${rEyeX + core + 4},${rEyeY} ${rEyeX + core},${rEyeY + 4} ${rEyeX + core - 4},${rEyeY}`}
              fill="#ffffff"
            />
          )}

          {/* Asleep / Blink Slit Line */}
          {(blink || isAsleep) && (
            <>
              <line x1={lEyeX - 16} y1={lEyeY} x2={lEyeX + 16} y2={lEyeY} stroke={color} strokeWidth="2.5" />
              <line x1={rEyeX - 16} y1={rEyeY} x2={rEyeX + 16} y2={rEyeY} stroke={color} strokeWidth="2.5" />
            </>
          )}
        </g>

        {/* 4. ARTICULATED LOWER JAW PRISM MOUTH */}
        <g filter="url(#geoGlow)">
          {/* Mouth Cavity Polygon (when open) */}
          {jawDropDist > 2 && (
            <polygon
              points={`78,${mouthTopY} 122,${mouthTopY} 100,${mouthBottomY}`}
              fill={hexToRgba(baseColor, 0.85)}
              stroke={color}
              strokeWidth="1.6"
              className="transition-all duration-100"
            />
          )}

          {/* Closed / Neutral Mouth Angular Chevron Line */}
          {jawDropDist <= 2 && (
            <polyline
              points={`78,${mouthTopY} 100,${mouthTopY + 4} 122,${mouthTopY}`}
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-all duration-150"
            />
          )}

          {/* Articulated Lower Chin Prism Shard */}
          <polygon
            points={`84,${mouthBottomY + 5} 116,${mouthBottomY + 5} 100,${mouthBottomY + 12}`}
            fill={hexToRgba(baseColor, 0.2)}
            stroke={hexToRgba(baseColor, 0.5)}
            strokeWidth="1.2"
            className="transition-all duration-100"
          />
        </g>

        {/* 5. CHEEK FACET ACCENTS (Angle articulated by emotion) */}
        <g opacity="0.6" filter="url(#geoGlow)">
          {/* Left Cheek Prism */}
          <polygon
            points={`36,${72 + geo.facetAngle * 0.2} 48,${66} 44,${80} 32,${84}`}
            fill={hexToRgba(baseColor, 0.25)}
            stroke={color}
            strokeWidth="1"
          />
          {/* Right Cheek Prism */}
          <polygon
            points={`164,${72 + geo.facetAngle * 0.2} 152,${66} 156,${80} 168,${84}`}
            fill={hexToRgba(baseColor, 0.25)}
            stroke={color}
            strokeWidth="1"
          />
        </g>

        {/* 6. THINKING / CONNECTING HUD RING */}
        {isThinking && (
          <polygon
            points="100,20 140,43 140,90 100,113 60,90 60,43"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeDasharray="12 6"
            className="animate-spin origin-center"
            opacity="0.5"
          />
        )}

        {/* Glowing Vertex Nodes */}
        <circle cx="24" cy="30" r="2" fill={color} opacity={0.4 + pulse * 0.6} />
        <circle cx="176" cy="30" r="2" fill={color} opacity={0.4 + pulse * 0.6} />
        <circle cx="100" cy="126" r="2.5" fill={color} opacity={0.4 + pulse * 0.6} />

        {/* Accessories Overlay (Glasses, Hair, Facial Hair) */}
        <FaceAccessories
          accessories={face?.accessories}
          audioLevel={audioLevel}
          isSpeaking={isSpeaking}
          glance={glance}
        />
      </svg>
    </div>
  );
}
