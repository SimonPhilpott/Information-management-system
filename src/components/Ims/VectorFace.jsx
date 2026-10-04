import React, { useEffect, useRef, useState } from 'react';
import { EMOTIONS } from './faceEmotions';
import FaceAccessories from './FaceAccessories';

// Helper to parse hex to rgba
const hexToRgba = (hex, alpha = 1) => {
  const clean = (hex || '4CFF7A').replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default function VectorFace({ face, status = 'idle', levelRef, width = 180, className = '' }) {
  const emotionKey = face?.emotion || face?.faceEmotion || 'neutral';
  const emotionConfig = EMOTIONS[emotionKey] || EMOTIONS.neutral;
  const baseColor = face?.color || face?.faceColor || emotionConfig.color || '4CFF7A';
  const color = `#${baseColor.replace('#', '')}`;

  const [blink, setBlink] = useState(false);
  const [glance, setGlance] = useState({ x: 0, y: 0 });
  const [breathPhase, setBreathPhase] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const rafRef = useRef(0);

  // Animation loop: blinks, glances, breathing, and audio tracking
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
          blinkUntil = now + 140;
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
        if (now > glanceUntil) {
          currentGlance = { x: 0, y: 0 };
        }
        setGlance(currentGlance);
      } else {
        setBlink(true);
        setGlance({ x: 0, y: 0 });
      }

      // Breathing sine wave (4 second cycle)
      const b = (Math.sin(now / 650) + 1) / 2;
      setBreathPhase(b);

      // Audio smoothing for mouth movement
      const lvl = levelRef?.current ?? 0;
      smoothLevel = smoothLevel * 0.45 + lvl * 0.55;
      setAudioLevel(smoothLevel);

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [status, levelRef]);

  const p = emotionConfig.vector;
  const isSpeaking = status === 'speaking' || audioLevel > 0.05;
  const isThinking = status === 'thinking' || status === 'connecting';
  const isAsleep = status === 'asleep';

  // Eye apertures
  const eyeLeftScale = isAsleep ? 0.08 : blink ? 0.05 : p.eyeLeftOpen;
  const eyeRightScale = isAsleep ? 0.08 : blink ? 0.05 : p.eyeRightOpen;

  // Pupil offsets
  const pupilX = (p.pupilX || 0) + glance.x;
  const pupilY = (p.pupilY || 0) + glance.y + (isAsleep ? 4 : 0);

  // Mouth calculation
  // Base mouth center (100, 96). Width typically 30-55.
  const mouthW = p.mouthWidth || 40;
  const smileFactor = p.mouthSmile ?? 0.2; // -1 (deep frown) to +1 (broad smile)
  const baseOpen = isSpeaking ? Math.min(1.2, p.mouthOpen + audioLevel * 1.8) : p.mouthOpen;
  const asym = p.asymmetric || 0;

  // Mouth anchor points (SVG coordinates 0..200 x 0..133)
  const mLeftX = 100 - mouthW / 2;
  const mLeftY = 96 - asym * 4;
  const mRightX = 100 + mouthW / 2;
  const mRightY = 96 + asym * 4;
  const mCenterX = 100;
  const mSmileY = 96 + smileFactor * 14;
  const mOpenY = mSmileY + baseOpen * 16;

  // Mouth Path
  let mouthPath = '';
  if (p.sharp && Math.abs(smileFactor) > 0.3) {
    // Jagged / clenched angry teeth path
    const drop = baseOpen * 10;
    mouthPath = `M ${mLeftX} ${mLeftY} L ${mLeftX + mouthW * 0.25} ${mSmileY - 2} L ${mCenterX} ${mSmileY + 2} L ${mLeftX + mouthW * 0.75} ${mSmileY - 2} L ${mRightX} ${mRightY} ${
      baseOpen > 0.15 ? `L ${mRightX} ${mRightY + drop} L ${mCenterX} ${mOpenY} L ${mLeftX} ${mLeftY + drop} Z` : ''
    }`;
  } else if (p.squiggly) {
    // Confused squiggly wave mouth
    mouthPath = `M ${mLeftX} ${mLeftY} Q ${mLeftX + mouthW * 0.25} ${96 - 6} ${mCenterX} 96 T ${mRightX} ${mRightY}`;
  } else if (baseOpen > 0.12) {
    // Open morphing mouth (upper lip curve & lower lip jaw curve)
    mouthPath = `M ${mLeftX} ${mLeftY} Q ${mCenterX} ${mSmileY - 4} ${mRightX} ${mRightY} Q ${mCenterX} ${mOpenY} ${mLeftX} ${mLeftY} Z`;
  } else {
    // Closed expressive Bezier smile/frown curve
    mouthPath = `M ${mLeftX} ${mLeftY} Q ${mCenterX} ${mSmileY} ${mRightX} ${mRightY}`;
  }

  // Eyebrows
  // Left brow (center ~68, 48), Right brow (center ~132, 48)
  const leftBrowPitch = p.browLeft || 0;
  const rightBrowPitch = p.browRight || 0;
  const browLeftPath = `M 52 ${52 + leftBrowPitch * 0.35} Q 68 ${42 - leftBrowPitch * 0.6} 84 ${50 - leftBrowPitch * 0.4}`;
  const browRightPath = `M 116 ${50 - rightBrowPitch * 0.4} Q 132 ${42 - rightBrowPitch * 0.6} 148 ${52 + rightBrowPitch * 0.35}`;

  return (
    <div
      className={`rounded-2xl bg-[#080c12] p-2 border border-white/5 shadow-2xl relative overflow-hidden flex items-center justify-center ${className}`}
      style={{ width }}
    >
      {/* Background ambient glow matching emotion color */}
      <div
        className="absolute inset-0 pointer-events-none transition-colors duration-700 opacity-20 blur-xl"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${color}, transparent 70%)`
        }}
      />

      <svg
        viewBox="0 0 200 133.33"
        className="w-full h-full block relative z-10"
        style={{ aspectRatio: '12 / 8' }}
      >
        <defs>
          {/* Neon Visor Outer Glow Filter */}
          <filter id="vectorGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Eye clip paths for clipping eyelids */}
          <clipPath id="leftEyeClip">
            <rect
              x="52"
              y={56 - (eyeLeftScale * 18)}
              width="32"
              height={eyeLeftScale * 36}
              rx="16"
              ry={eyeLeftScale * 14}
            />
          </clipPath>
          <clipPath id="rightEyeClip">
            <rect
              x="116"
              y={56 - (eyeRightScale * 18)}
              width="32"
              height={eyeRightScale * 36}
              rx="16"
              ry={eyeRightScale * 14}
            />
          </clipPath>

          {/* Visor Frame Linear Gradient */}
          <linearGradient id="visorStroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={hexToRgba(baseColor, 0.4)} />
            <stop offset="50%" stopColor={hexToRgba(baseColor, 0.8)} />
            <stop offset="100%" stopColor={hexToRgba(baseColor, 0.2)} />
          </linearGradient>
        </defs>

        {/* Outer Curved Futuristic Screen Frame */}
        <rect
          x="10"
          y="8"
          width="180"
          height="117.33"
          rx="18"
          fill="#0c111a"
          stroke="url(#visorStroke)"
          strokeWidth="1.5"
          opacity={0.85 + breathPhase * 0.15}
        />

        {/* Ambient Grid Guidelines for Hi-Tech Touch */}
        <line x1="20" y1="66.6" x2="30" y2="66.6" stroke={color} strokeWidth="1" opacity="0.3" />
        <line x1="170" y1="66.6" x2="180" y2="66.6" stroke={color} strokeWidth="1" opacity="0.3" />
        <line x1="100" y1="14" x2="100" y2="20" stroke={color} strokeWidth="1" opacity="0.3" />

        {/* Thinking / Connecting Status Ring */}
        {isThinking && (
          <circle
            cx="100"
            cy="66.6"
            r="48"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeDasharray="16 10"
            className="animate-spin origin-center"
            opacity="0.4"
          />
        )}

        {/* EYEBROWS */}
        <g filter="url(#vectorGlow)">
          <path
            d={browLeftPath}
            fill="none"
            stroke={color}
            strokeWidth="3.5"
            strokeLinecap="round"
            className="transition-all duration-300"
          />
          <path
            d={browRightPath}
            fill="none"
            stroke={color}
            strokeWidth="3.5"
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </g>

        {/* LEFT EYE */}
        <g id="leftEyeGroup" filter="url(#vectorGlow)">
          {/* Eye Socket Outline */}
          <rect
            x="52"
            y="42"
            width="32"
            height="28"
            rx="14"
            fill={hexToRgba(baseColor, 0.08)}
            stroke={hexToRgba(baseColor, 0.35)}
            strokeWidth="1.5"
          />

          {/* Eye Interior with Pupil, masked by dynamic eyelid scale */}
          <g clipPath="url(#leftEyeClip)">
            {/* Glowing Iris Base */}
            <circle
              cx={68 + pupilX}
              cy={56 + pupilY}
              r={10 * (p.eyeLeftOpen > 1.2 ? 1.25 : 1)}
              fill={color}
              className="transition-all duration-150"
            />
            {/* Pupil Center Specular Highlight */}
            <circle
              cx={65 + pupilX}
              cy={53 + pupilY}
              r="3"
              fill="#ffffff"
              opacity="0.9"
            />
            <circle
              cx={71 + pupilX}
              cy={58 + pupilY}
              r="1.5"
              fill="#ffffff"
              opacity="0.6"
            />
          </g>

          {/* Eyelid Crease when closed or asleep */}
          {eyeLeftScale < 0.15 && (
            <line
              x1="54"
              y1="56"
              x2="82"
              y2="56"
              stroke={color}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          )}
        </g>

        {/* RIGHT EYE */}
        <g id="rightEyeGroup" filter="url(#vectorGlow)">
          {/* Eye Socket Outline */}
          <rect
            x="116"
            y="42"
            width="32"
            height="28"
            rx="14"
            fill={hexToRgba(baseColor, 0.08)}
            stroke={hexToRgba(baseColor, 0.35)}
            strokeWidth="1.5"
          />

          {/* Eye Interior with Pupil, masked by dynamic eyelid scale */}
          <g clipPath="url(#rightEyeClip)">
            {/* Glowing Iris Base */}
            <circle
              cx={132 + pupilX}
              cy={56 + pupilY}
              r={10 * (p.eyeRightOpen > 1.2 ? 1.25 : 1)}
              fill={color}
              className="transition-all duration-150"
            />
            {/* Pupil Center Specular Highlight */}
            <circle
              cx={129 + pupilX}
              cy={53 + pupilY}
              r="3"
              fill="#ffffff"
              opacity="0.9"
            />
            <circle
              cx={135 + pupilX}
              cy={58 + pupilY}
              r="1.5"
              fill="#ffffff"
              opacity="0.6"
            />
          </g>

          {/* Eyelid Crease when closed or asleep */}
          {eyeRightScale < 0.15 && (
            <line
              x1="118"
              y1="56"
              x2="146"
              y2="56"
              stroke={color}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          )}
        </g>

        {/* MOUTH */}
        <g id="mouthGroup" filter="url(#vectorGlow)">
          <path
            d={mouthPath}
            fill={baseOpen > 0.12 ? hexToRgba(baseColor, 0.85) : 'none'}
            stroke={color}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-all duration-150"
          />

        </g>

        {/* Subtle Cheek Accents for Warmth / Joy / Love */}
        {(emotionKey === 'joy' || emotionKey === 'love') && (
          <g opacity="0.45" filter="url(#vectorGlow)">
            <ellipse cx="44" cy="74" rx="8" ry="4" fill={color} />
            <ellipse cx="156" cy="74" rx="8" ry="4" fill={color} />
          </g>
        )}

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
