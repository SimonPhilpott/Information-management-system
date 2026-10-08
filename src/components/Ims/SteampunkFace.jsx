import React, { useEffect, useRef, useState } from 'react';
import { EMOTIONS } from './faceEmotions';
import FaceAccessories from './FaceAccessories';

const hexToRgba = (hex, alpha = 1) => {
  const clean = (hex || 'D4AF37').replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default function SteampunkFace({ face, status = 'idle', levelRef, width = 180, className = '' }) {
  const emotionKey = face?.emotion || face?.faceEmotion || 'neutral';
  const emotionConfig = EMOTIONS[emotionKey] || EMOTIONS.neutral;
  const baseColor = face?.color || face?.faceColor || emotionConfig.color || 'D4AF37';
  const color = `#${baseColor.replace('#', '')}`;

  const [gearAngle, setGearAngle] = useState(0);
  const [pressure, setPressure] = useState(45);
  const [steamPhase, setSteamPhase] = useState(0);
  const [blink, setBlink] = useState(false);
  const [glance, setGlance] = useState({ x: 0, y: 0 });
  const [audioLevel, setAudioLevel] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    let nextBlink = performance.now() + 3500;
    let blinkUntil = 0;
    let nextGlance = performance.now() + 6000;
    let glanceUntil = 0;
    let currentGlance = { x: 0, y: 0 };
    let smoothLevel = 0;
    let angle = 0;

    const animate = (now) => {
      const lvl = levelRef?.current ?? 0;
      smoothLevel = smoothLevel * 0.45 + lvl * 0.55;
      setAudioLevel(smoothLevel);

      // Gear rotation speed accelerates when thinking or speaking
      const isFast = status === 'thinking' || status === 'speaking' || smoothLevel > 0.1;
      const speed = isFast ? 1.8 + smoothLevel * 4 : 0.4;
      angle = (angle + speed) % 360;
      setGearAngle(angle);

      // Pressure needle responds to audio & thinking
      const targetPsi = (status === 'thinking' ? 75 : 35) + smoothLevel * 50 + Math.sin(now / 200) * 4;
      setPressure((p) => p * 0.85 + targetPsi * 0.15);

      // Steam puff cycle
      setSteamPhase((now / 150) % 100);

      // Shutter blinks
      if (status !== 'asleep') {
        if (now > nextBlink) {
          blinkUntil = now + 120;
          nextBlink = now + (Math.random() < 0.1 ? 400 : 3500 + Math.random() * 5000);
        }
        setBlink(now < blinkUntil);

        if (now > nextGlance) {
          const dir = Math.random() < 0.5 ? -1 : 1;
          currentGlance = { x: dir * (2.5 + Math.random() * 2), y: (Math.random() - 0.5) * 1.5 };
          glanceUntil = now + 700 + Math.random() * 800;
          nextGlance = now + 5000 + Math.random() * 8000;
        }
        if (now > glanceUntil) {
          currentGlance = { x: 0, y: 0 };
        }
        setGlance(currentGlance);
      } else {
        setBlink(true);
        setGlance({ x: 0, y: 0 });
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [status, levelRef]);

  const p = emotionConfig.steampunk || {
    gearSpeed: 1,
    dialAngle: 30,
    shutterOpen: 0.9,
    jawAperture: 0.1,
    steamPuff: 0.2,
  };

  const isSpeaking = status === 'speaking' || audioLevel > 0.05;
  const isThinking = status === 'thinking' || status === 'connecting';
  const isAsleep = status === 'asleep';

  // Shutter aperture
  const shutterScale = isAsleep ? 0.08 : blink ? 0.05 : (p.shutterOpen || 0.9);
  // face.gaze (-1 / 1): the pupils look left / right inside the still iris - the Box-3 face pack's eyes that follow you
  const pupil = face?.gaze ? face.gaze * 6 : 0;

  // Jaw drop
  const jawDrop = isSpeaking ? Math.min(22, (p.jawAperture || 0) * 12 + audioLevel * 25) : (p.jawAperture || 0) * 8;

  return (
    <div
      className={`rounded-2xl bg-[#0f0c08] p-2 border border-amber-900/40 shadow-2xl relative overflow-hidden flex items-center justify-center ${className}`}
      style={{ width }}
    >
      {/* Background furnace glow */}
      <div
        className="absolute inset-0 pointer-events-none transition-colors duration-700 opacity-25 blur-xl"
        style={{
          background: `radial-gradient(circle at 50% 50%, #d97706, #78350f 70%, transparent 90%)`,
        }}
      />

      <svg
        viewBox="0 0 200 133.33"
        className="w-full h-full block relative z-10"
        style={{ aspectRatio: '12 / 8' }}
      >
        <defs>
          <linearGradient id="brassPlate" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#854d0e" />
            <stop offset="35%" stopColor="#ca8a04" />
            <stop offset="70%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#713f12" />
          </linearGradient>
          <linearGradient id="copperPlate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9a3412" />
            <stop offset="50%" stopColor="#c2410c" />
            <stop offset="100%" stopColor="#7c2d12" />
          </linearGradient>
          <filter id="gearShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="1" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.7" />
          </filter>
        </defs>

        {/* 1. Main Automaton Head Plate (Riveted Brass Casing) */}
        <rect
          x="30"
          y="16"
          width="140"
          height="105"
          rx="22"
          fill="url(#brassPlate)"
          stroke="#451a03"
          strokeWidth="2.5"
          filter="url(#gearShadow)"
        />

        {/* 2. Copper Forehead & Cheek Reinforcements with Rivets */}
        <path d="M 45 16 L 155 16 L 145 36 L 55 36 Z" fill="url(#copperPlate)" stroke="#451a03" strokeWidth="1.2" />
        {[48, 68, 88, 112, 132, 152].map((x) => (
          <circle key={x} cx={x} cy="24" r="1.8" fill="#fef08a" stroke="#713f12" strokeWidth="0.8" />
        ))}
        {/* Perimeter rivets */}
        {[38, 58, 78, 98, 118].map((y) => (
          <React.Fragment key={y}>
            <circle cx="36" cy={y} r="1.6" fill="#fef08a" stroke="#713f12" strokeWidth="0.8" />
            <circle cx="164" cy={y} r="1.6" fill="#fef08a" stroke="#713f12" strokeWidth="0.8" />
          </React.Fragment>
        ))}

        {/* 3. Pressure Gauge on Forehead */}
        <g id="pressureGauge">
          <circle cx="100" cy="28" r="11" fill="#fef9c3" stroke="#451a03" strokeWidth="1.8" />
          {/* Gauge dial tick marks */}
          <line x1="94" y1="28" x2="96" y2="28" stroke="#78350f" strokeWidth="1" />
          <line x1="100" y1="20" x2="100" y2="22" stroke="#dc2626" strokeWidth="1" />
          <line x1="106" y1="28" x2="104" y2="28" stroke="#78350f" strokeWidth="1" />
          {/* Pressure Needle */}
          <line
            x1="100"
            y1="28"
            x2={100 + Math.cos(((pressure - 90) * Math.PI) / 180) * 8}
            y2={28 + Math.sin(((pressure - 90) * Math.PI) / 180) * 8}
            stroke="#b91c1c"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="100" cy="28" r="2" fill="#451a03" />
        </g>

        {/* 4. Rotating Clockwork Gears (Left and Right temples) */}
        <g id="gears" stroke="#713f12" strokeWidth="1.2" fill="#d97706">
          {/* Left Gear */}
          <g transform={`translate(26, 68) rotate(${gearAngle})`}>
            <circle cx="0" cy="0" r="14" fill="#ca8a04" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <rect
                key={deg}
                x="-2.5"
                y="-18"
                width="5"
                height="7"
                rx="1"
                transform={`rotate(${deg})`}
                fill="#ca8a04"
              />
            ))}
            <circle cx="0" cy="0" r="5" fill="#451a03" />
          </g>

          {/* Right Interlocking Gear (Rotates reverse) */}
          <g transform={`translate(174, 68) rotate(${-gearAngle * 1.25})`}>
            <circle cx="0" cy="0" r="14" fill="#ca8a04" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <rect
                key={deg}
                x="-2.5"
                y="-18"
                width="5"
                height="7"
                rx="1"
                transform={`rotate(${deg})`}
                fill="#ca8a04"
              />
            ))}
            <circle cx="0" cy="0" r="5" fill="#451a03" />
          </g>
        </g>

        {/* 5. Mechanical Iris Oculars (Eyes) */}
        <g id="steampunkEyes" transform={`translate(${glance.x}, ${glance.y})`}>
          {/* Left Ocular Bezel */}
          <circle cx="68" cy="56" r="18" fill="#1c1917" stroke="#451a03" strokeWidth="3" />
          <circle cx="68" cy="56" r="14" fill="#0f172a" />
          {/* Amber Mechanical Iris */}
          <ellipse
            cx="68"
            cy="56"
            rx="12"
            ry={Math.max(2, 12 * shutterScale)}
            fill="#f59e0b"
            stroke="#d97706"
            strokeWidth="1.2"
          />
          {/* Lens crosshair grid */}
          <line x1="56" y1="56" x2="80" y2="56" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
          <line x1="68" y1="44" x2="68" y2="68" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
          {/* Aperture Pupil */}
          <ellipse cx={68 + pupil} cy="56" rx="4.5" ry="4.5" fill="#000000" />
          <ellipse cx={66 + pupil} cy="54" rx="1.5" ry="1.5" fill="#ffffff" opacity="0.8" />

          {/* Right Ocular Bezel with Monocle Gauge Prongs */}
          <circle cx="132" cy="56" r="18" fill="#1c1917" stroke="#451a03" strokeWidth="3" />
          <circle cx="132" cy="56" r="14" fill="#0f172a" />
          <ellipse
            cx="132"
            cy="56"
            rx="12"
            ry={Math.max(2, 12 * shutterScale)}
            fill="#f59e0b"
            stroke="#d97706"
            strokeWidth="1.2"
          />
          <line x1="120" y1="56" x2="144" y2="56" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
          <line x1="132" y1="44" x2="132" y2="68" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
          <ellipse cx={132 + pupil} cy="56" rx="4.5" ry="4.5" fill="#000000" />
          <ellipse cx={130 + pupil} cy="54" rx="1.5" ry="1.5" fill="#ffffff" opacity="0.8" />
        </g>

        {/* 6. Lateral Steam Pipes & Animated Steam Puffs */}
        <g id="steamVents">
          {/* Left Vent Pipe */}
          <rect x="36" y="80" width="10" height="6" rx="2" fill="#78350f" stroke="#451a03" strokeWidth="1" />
          {/* Right Vent Pipe */}
          <rect x="154" y="80" width="10" height="6" rx="2" fill="#78350f" stroke="#451a03" strokeWidth="1" />

          {/* Animated Steam Clouds during speech or thinking */}
          {(isSpeaking || isThinking) && (
            <g fill="#e2e8f0" opacity={0.6 + Math.sin(steamPhase) * 0.3}>
              <circle cx={30 - Math.sin(steamPhase) * 6} cy={82 - (steamPhase % 15)} r={4 + audioLevel * 6} />
              <circle cx={24 - Math.sin(steamPhase) * 10} cy={76 - (steamPhase % 20)} r={3 + audioLevel * 4} />
              <circle cx={170 + Math.sin(steamPhase) * 6} cy={82 - (steamPhase % 15)} r={4 + audioLevel * 6} />
              <circle cx={176 + Math.sin(steamPhase) * 10} cy={76 - (steamPhase % 20)} r={3 + audioLevel * 4} />
            </g>
          )}
        </g>

        {/* 7. Articulated Clockwork Jaw & Brass Grille Mouth */}
        <g id="clockworkJaw" transform={`translate(0, ${jawDrop * 0.5})`}>
          {/* Lower Jaw Plate */}
          <path
            d={`M 60 88 L 140 88 L 132 ${106 + jawDrop * 0.5} L 68 ${106 + jawDrop * 0.5} Z`}
            fill="#78350f"
            stroke="#451a03"
            strokeWidth="1.8"
          />
          {/* Mouth Cavity */}
          <rect
            x="72"
            y="90"
            width="56"
            height={6 + jawDrop * 0.8}
            rx="3"
            fill="#1c1917"
            stroke="#451a03"
            strokeWidth="1.2"
          />
          {/* Brass Grille Teeth Bars */}
          {[78, 86, 94, 102, 110, 118, 124].map((bx) => (
            <line
              key={bx}
              x1={bx}
              y1="90"
              x2={bx}
              y2={96 + jawDrop * 0.8}
              stroke="#fef08a"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ))}
        </g>

        {/* 8. Accessories Overlay */}
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
