import React from 'react';

// Curated palette of realistic & eccentric accessory colors
export const HAIR_COLORS = [
  { id: 'raven_black', name: 'Raven Black', hex: '#16161a' },
  { id: 'dark_brunette', name: 'Dark Brunette', hex: '#3d2b1f' },
  { id: 'warm_chestnut', name: 'Warm Chestnut', hex: '#633a21' },
  { id: 'honey_blonde', name: 'Honey Blonde', hex: '#d4af37' },
  { id: 'platinum_blonde', name: 'Platinum', hex: '#f0f0e8' },
  { id: 'fiery_auburn', name: 'Fiery Auburn', hex: '#942f1b' },
  { id: 'silver_fox', name: 'Silver Fox', hex: '#9ea6b2' },
  { id: 'wizard_white', name: 'Wizard White', hex: '#ffffff' },
  { id: 'cyber_cyan', name: 'Cyber Cyan', hex: '#00e5ff' },
  { id: 'neon_pink', name: 'Neon Pink', hex: '#ff3385' },
  { id: 'toxic_green', name: 'Toxic Green', hex: '#4cff7a' },
  { id: 'royal_purple', name: 'Royal Purple', hex: '#9d4edd' },
];

export const GLASSES_COLORS = [
  { id: 'classic_black', name: 'Classic Black', hex: '#111317' },
  { id: 'antique_gold', name: 'Antique Gold', hex: '#d4af37' },
  { id: 'steampunk_brass', name: 'Steampunk Brass', hex: '#b58434' },
  { id: 'sterling_silver', name: 'Sterling Silver', hex: '#cbd5e1' },
  { id: 'tortoise_shell', name: 'Tortoiseshell', hex: '#78350f' },
  { id: 'cyber_neon', name: 'Cyber Neon', hex: '#00f0ff' },
  { id: 'laser_crimson', name: 'Laser Crimson', hex: '#ef4444' },
  { id: 'emerald_jade', name: 'Emerald Jade', hex: '#10b981' },
];

export const ACCESSORY_OPTIONS = {
  glasses: [
    { id: 'none', name: 'None', hint: 'No eyewear' },
    { id: 'round', name: 'Round Wireframes', hint: 'Lennon / Potter circular spectacles' },
    { id: 'square', name: 'Hipster Wayfarers', hint: 'Thick black acetate horn-rims' },
    { id: 'aviator', name: 'Aviator Shades', hint: 'Teardrop sunglasses with double brow bar' },
    { id: 'monocle', name: 'Gentleman Monocle', hint: 'Gold-rimmed right eye glass with chain' },
    { id: 'steampunk_goggles', name: 'Steampunk Goggles', hint: 'Brass riveted oculars with leather strap' },
    { id: 'cyber_visor', name: 'Cyberpunk Visor', hint: 'Futuristic glowing neon scanner bar' },
    { id: 'shades_cool', name: 'Retro 80s Shades', hint: 'Dark angled shades with glass specular glint' },
    { id: 'half_moon', name: 'Half-Moon Readers', hint: 'Perched reading glasses' },
  ],
  hair: [
    { id: 'none', name: 'Bald / Chrome', hint: 'Smooth cranium' },
    { id: 'short_crop', name: 'Textured Crop', hint: 'Neat modern quiff with side fade' },
    { id: 'anime_spikes', name: 'Anime Spikes', hint: 'Wild manga protagonist spiky hair' },
    { id: 'messy_curly', name: 'Messy Curls', hint: 'Tousled volumetric curls' },
    { id: 'parted_side', name: 'Side Parting', hint: 'Slick retro gentleman parting' },
    { id: 'long_flow', name: 'Flowing Locks', hint: 'Shoulder-length parted hair' },
    { id: 'mohawk', name: 'Punk Mohawk', hint: 'Central crest with shaved sides' },
    { id: 'samurai_topknot', name: 'Samurai Topknot', hint: 'Clean bun topknot with tie' },
    { id: 'orc_crest', name: 'War-Chief Crest', hint: 'Braided savage crest with bone clasps' },
    { id: 'afro', name: 'Volumetric Afro', hint: 'Classic rounded retro afro silhouette' },
  ],
  facialHair: [
    { id: 'none', name: 'Clean Shaven', hint: 'Smooth jawline' },
    { id: 'stubble', name: '5 O\'Clock Stubble', hint: 'Rugged dark stubble shadow' },
    { id: 'handlebar', name: 'Handlebar Moustache', hint: 'Curled Victorian dandy moustache' },
    { id: 'chevron', name: 'Bushy Chevron', hint: 'Classic thick 80s cop moustache' },
    { id: 'pencil', name: 'Pencil Moustache', hint: 'Ultra-thin suave pencil line' },
    { id: 'horseshoe', name: 'Horseshoe Biker', hint: 'Heavy moustache drooping past chin' },
    { id: 'goatee', name: 'Van Dyke Goatee', hint: 'Pointed chin beard and moustache' },
    { id: 'full_beard', name: 'Lumberjack Beard', hint: 'Magnificent bushy full beard' },
    { id: 'braided_dwarf', name: 'Braided War Beard', hint: 'Twin dwarven/orc braids with brass rings' },
    { id: 'wizard', name: 'Wispy Wizard Beard', hint: 'Long flowing mystical wizard beard' },
  ],
};

// SVG Accessories Overlay Component
// ViewBox is standard 200 x 133.33 (matching 12:8 aspect ratio)
// Left eye center ~ (68, 52), Right eye center ~ (132, 52), Mouth center ~ (100, 96)
export default function FaceAccessories({
  accessories,
  audioLevel = 0,
  isSpeaking = false,
  glance = { x: 0, y: 0 },
  className = '',
}) {
  const acc = accessories || {};
  const glasses = acc.glasses || 'none';
  const hair = acc.hair || 'none';
  const facialHair = acc.facialHair || 'none';

  if (glasses === 'none' && hair === 'none' && facialHair === 'none') {
    return null;
  }

  const hairColor = acc.hairColor || '#1e1e24';
  const glassesColor = acc.glassesColor || '#d4af37';
  const facialHairColor = acc.facialHairColor || hairColor;

  const jawShift = isSpeaking ? Math.min(10, audioLevel * 14) : 0;

  return (
    <g className={`face-accessories pointer-events-none ${className}`}>
      {/* 1. HAIR LAYER (Behind/Above Eyes) */}
      {hair !== 'none' && (
        <g id="hairLayer" fill={hairColor} stroke="#090a0f" strokeWidth="1.2">
          {hair === 'short_crop' && (
            <path
              d="M 40 45 C 38 25, 55 12, 100 12 C 145 12, 162 25, 160 45 C 158 35, 142 22, 100 20 C 58 22, 42 35, 40 45 Z"
              filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"
            />
          )}

          {hair === 'anime_spikes' && (
            <path
              d="M 32 50 L 30 28 L 48 32 L 52 14 L 72 26 L 82 8 L 100 22 L 118 8 L 128 26 L 148 14 L 152 32 L 170 28 L 168 50 C 158 32, 140 22, 100 20 C 60 22, 42 32, 32 50 Z"
              filter="drop-shadow(0 3px 6px rgba(0,0,0,0.6))"
            />
          )}

          {hair === 'messy_curly' && (
            <path
              d="M 36 50 C 28 35, 38 20, 52 24 C 55 12, 75 10, 88 18 C 96 8, 116 8, 126 16 C 140 10, 158 14, 162 26 C 172 28, 176 42, 166 52 C 158 36, 142 24, 100 22 C 58 24, 44 36, 36 50 Z"
              filter="drop-shadow(0 2px 5px rgba(0,0,0,0.5))"
            />
          )}

          {hair === 'parted_side' && (
            <g>
              <path
                d="M 38 46 C 40 24, 60 14, 85 14 C 110 14, 155 18, 162 46 C 152 26, 115 20, 85 20 C 55 20, 42 32, 38 46 Z"
                filter="drop-shadow(0 2px 4px rgba(0,0,0,0.4))"
              />
              {/* Parting swoosh */}
              <path
                d="M 85 14 Q 95 24 145 28 Q 110 21 85 14 Z"
                fill="#ffffff"
                opacity="0.18"
              />
            </g>
          )}

          {hair === 'long_flow' && (
            <path
              d="M 34 85 C 28 55, 34 22, 85 14 C 135 14, 166 22, 166 85 C 156 75, 154 45, 145 32 C 130 22, 100 20, 70 24 C 52 32, 46 60, 34 85 Z"
              filter="drop-shadow(0 3px 6px rgba(0,0,0,0.5))"
            />
          )}

          {hair === 'mohawk' && (
            <path
              d="M 88 40 L 86 16 L 94 6 L 100 4 L 106 6 L 114 16 L 112 40 C 108 34, 92 34, 88 40 Z"
              filter="drop-shadow(0 3px 6px rgba(0,0,0,0.7))"
            />
          )}

          {hair === 'samurai_topknot' && (
            <g>
              <path
                d="M 44 42 C 45 24, 65 16, 100 16 C 135 16, 155 24, 156 42 C 145 26, 125 22, 100 22 C 75 22, 55 26, 44 42 Z"
              />
              {/* Topknot bun */}
              <circle cx="100" cy="8" r="9" />
              {/* Gold/Red tie band */}
              <rect x="94" y="13" width="12" height="4" rx="2" fill="#ef4444" stroke="#7f1d1d" strokeWidth="0.8" />
            </g>
          )}

          {hair === 'orc_crest' && (
            <g>
              <path
                d="M 82 42 L 78 12 L 92 18 L 100 2 L 108 18 L 122 12 L 118 42 C 110 32, 90 32, 82 42 Z"
                filter="drop-shadow(0 3px 6px rgba(0,0,0,0.7))"
              />
              {/* Bone clasps */}
              <rect x="88" y="24" width="24" height="4" rx="2" fill="#fef08a" stroke="#78350f" strokeWidth="0.8" />
              <rect x="92" y="32" width="16" height="3" rx="1.5" fill="#fef08a" stroke="#78350f" strokeWidth="0.8" />
            </g>
          )}

          {hair === 'afro' && (
            <path
              d="M 28 62 C 14 36, 32 10, 68 6 C 100 -2, 138 2, 168 12 C 190 26, 188 56, 172 66 C 162 42, 142 26, 100 24 C 60 26, 38 42, 28 62 Z"
              filter="drop-shadow(0 4px 8px rgba(0,0,0,0.6))"
            />
          )}
        </g>
      )}

      {/* 2. GLASSES & EYEWEAR LAYER (Over Eyes at y ~ 52) */}
      {glasses !== 'none' && (
        <g id="glassesLayer" transform={`translate(${glance.x * 0.3}, ${glance.y * 0.3})`}>
          {glasses === 'round' && (
            <g stroke={glassesColor} strokeWidth="2.5" fill="none">
              {/* Left Lens */}
              <circle cx="68" cy="52" r="18" fill="rgba(255,255,255,0.06)" />
              {/* Right Lens */}
              <circle cx="132" cy="52" r="18" fill="rgba(255,255,255,0.06)" />
              {/* Center Bridge */}
              <path d="M 86 50 Q 100 46 114 50" />
              {/* Temples */}
              <path d="M 50 50 L 32 46" strokeWidth="2" />
              <path d="M 150 50 L 168 46" strokeWidth="2" />
              {/* Glass Glint */}
              <path d="M 60 42 Q 68 38 74 44" stroke="#ffffff" strokeWidth="1.2" opacity="0.6" />
              <path d="M 124 42 Q 132 38 138 44" stroke="#ffffff" strokeWidth="1.2" opacity="0.6" />
            </g>
          )}

          {glasses === 'square' && (
            <g stroke={glassesColor} strokeWidth="3.2" fill="none" strokeLinejoin="round">
              {/* Left Frame */}
              <rect x="48" y="36" width="38" height="30" rx="6" fill="rgba(0,0,0,0.2)" />
              {/* Right Frame */}
              <rect x="114" y="36" width="38" height="30" rx="6" fill="rgba(0,0,0,0.2)" />
              {/* Bridge */}
              <path d="M 86 44 L 114 44" strokeWidth="3.5" />
              {/* Frame Accents / Temples */}
              <path d="M 48 44 L 30 42" strokeWidth="2.8" />
              <path d="M 152 44 L 170 42" strokeWidth="2.8" />
              {/* Metal corner studs */}
              <circle cx="51" cy="40" r="1.2" fill="#ffffff" stroke="none" />
              <circle cx="149" cy="40" r="1.2" fill="#ffffff" stroke="none" />
            </g>
          )}

          {glasses === 'aviator' && (
            <g stroke={glassesColor} strokeWidth="2" fill="none">
              {/* Double Top Brow Bar */}
              <path d="M 48 40 L 152 40" strokeWidth="2.2" />
              <path d="M 86 47 Q 100 45 114 47" strokeWidth="1.8" />
              {/* Teardrop Left Lens */}
              <path
                d="M 50 42 L 86 42 C 88 56, 82 66, 68 66 C 54 66, 48 56, 50 42 Z"
                fill="rgba(20,20,30,0.55)"
              />
              {/* Teardrop Right Lens */}
              <path
                d="M 114 42 L 150 42 C 152 56, 146 66, 132 66 C 118 66, 112 56, 114 42 Z"
                fill="rgba(20,20,30,0.55)"
              />
              {/* Temple stems */}
              <path d="M 48 42 L 30 40" strokeWidth="1.8" />
              <path d="M 152 42 L 170 40" strokeWidth="1.8" />
              {/* Tint gradient highlight */}
              <path d="M 54 46 L 76 62" stroke="#ffffff" strokeWidth="1.2" opacity="0.45" />
              <path d="M 118 46 L 140 62" stroke="#ffffff" strokeWidth="1.2" opacity="0.45" />
            </g>
          )}

          {glasses === 'monocle' && (
            <g stroke={glassesColor} strokeWidth="2.5" fill="none">
              {/* Right eye monocle only */}
              <circle cx="132" cy="52" r="19" fill="rgba(255,255,255,0.08)" />
              {/* Top and bottom gallery prongs */}
              <path d="M 124 33 L 140 33" strokeWidth="2" />
              <path d="M 124 71 L 140 71" strokeWidth="2" />
              {/* Hanging gold chain down the right side */}
              <path
                d="M 151 52 Q 165 75 160 110"
                stroke={glassesColor}
                strokeWidth="1.4"
                strokeDasharray="2.5 2.5"
                opacity="0.85"
              />
              {/* Specular glare */}
              <path d="M 124 42 Q 132 38 139 44" stroke="#ffffff" strokeWidth="1.4" opacity="0.75" />
            </g>
          )}

          {glasses === 'steampunk_goggles' && (
            <g stroke={glassesColor} strokeWidth="2.8" fill="none">
              {/* Leather Strap across brow */}
              <path d="M 28 50 L 50 50 M 150 50 L 172 50" stroke="#5c3818" strokeWidth="5" />
              {/* Left Brass Canister */}
              <circle cx="68" cy="52" r="19" fill="#1e1810" stroke={glassesColor} strokeWidth="3.5" />
              <circle cx="68" cy="52" r="14" fill="rgba(245,158,11,0.25)" stroke="#92400e" strokeWidth="1.5" />
              {/* Right Brass Canister */}
              <circle cx="132" cy="52" r="19" fill="#1e1810" stroke={glassesColor} strokeWidth="3.5" />
              <circle cx="132" cy="52" r="14" fill="rgba(245,158,11,0.25)" stroke="#92400e" strokeWidth="1.5" />
              {/* Center threaded brass bridge with adjustment screw */}
              <rect x="87" y="49" width="26" height="6" rx="2" fill="#78350f" stroke={glassesColor} strokeWidth="1.8" />
              <circle cx="100" cy="52" r="2" fill={glassesColor} />
              {/* Rivet studs around bezels */}
              {[0, 60, 120, 180, 240, 300].map((deg) => {
                const rad = (deg * Math.PI) / 180;
                return (
                  <React.Fragment key={deg}>
                    <circle cx={68 + Math.cos(rad) * 17} cy={52 + Math.sin(rad) * 17} r="1.2" fill="#fef08a" />
                    <circle cx={132 + Math.cos(rad) * 17} cy={52 + Math.sin(rad) * 17} r="1.2" fill="#fef08a" />
                  </React.Fragment>
                );
              })}
            </g>
          )}

          {glasses === 'cyber_visor' && (
            <g>
              {/* Glowing Cyber HUD Visor */}
              <path
                d="M 38 45 L 162 45 L 152 64 L 48 64 Z"
                fill="rgba(0, 229, 255, 0.28)"
                stroke={glassesColor}
                strokeWidth="2.5"
                filter="drop-shadow(0 0 6px rgba(0,229,255,0.7))"
              />
              {/* Visor internal scanline */}
              <line x1="44" y1="54" x2="156" y2="54" stroke="#ffffff" strokeWidth="1.2" opacity="0.8" />
              {/* Corner brackets */}
              <path d="M 42 48 L 46 48 L 46 60 L 42 60" stroke="#ffffff" strokeWidth="1.2" fill="none" />
              <path d="M 158 48 L 154 48 L 154 60 L 158 60" stroke="#ffffff" strokeWidth="1.2" fill="none" />
            </g>
          )}

          {glasses === 'shades_cool' && (
            <g fill="#0b0e14" stroke={glassesColor} strokeWidth="2.4">
              {/* Bold rectangular angled dark shades */}
              <path d="M 44 40 L 92 42 L 88 64 L 48 62 Z" />
              <path d="M 108 42 L 156 40 L 152 62 L 112 64 Z" />
              <path d="M 92 42 L 108 42" strokeWidth="3" />
              <path d="M 44 42 L 30 40" strokeWidth="2.5" />
              <path d="M 156 42 L 170 40" strokeWidth="2.5" />
              {/* White mirror slash glint */}
              <polygon points="54,44 64,44 58,60 48,60" fill="#ffffff" opacity="0.35" stroke="none" />
              <polygon points="118,44 128,44 122,60 112,60" fill="#ffffff" opacity="0.35" stroke="none" />
            </g>
          )}

          {glasses === 'half_moon' && (
            <g stroke={glassesColor} strokeWidth="2.2" fill="none">
              {/* Half Moon reading glasses sitting lower (y ~ 58) */}
              <path d="M 50 56 L 86 56 C 86 68, 50 68, 50 56 Z" fill="rgba(255,255,255,0.06)" />
              <path d="M 114 56 L 150 56 C 150 68, 114 68, 114 56 Z" fill="rgba(255,255,255,0.06)" />
              <path d="M 86 57 Q 100 52 114 57" strokeWidth="2" />
              <path d="M 50 56 L 36 50" strokeWidth="1.6" />
              <path d="M 150 56 L 164 50" strokeWidth="1.6" />
            </g>
          )}
        </g>
      )}

      {/* 3. FACIAL HAIR LAYER (Around Mouth & Jaw at y ~ 90..124) */}
      {facialHair !== 'none' && (
        <g id="facialHairLayer" fill={facialHairColor} stroke="#090a0f" strokeWidth="1">
          {facialHair === 'stubble' && (
            <g fill={facialHairColor} opacity="0.55" stroke="none">
              {/* Stipple pattern around jawline and upper lip */}
              {[
                [78, 86], [84, 85], [92, 85], [100, 85], [108, 85], [116, 85], [122, 86],
                [74, 94], [80, 96], [120, 96], [126, 94],
                [76, 104], [84, 106], [94, 108], [100, 108], [106, 108], [116, 106], [124, 104],
                [86, 114], [94, 116], [100, 116], [106, 116], [114, 114],
              ].map(([x, y], idx) => (
                <circle key={idx} cx={x} cy={y + jawShift * 0.4} r="1.1" />
              ))}
            </g>
          )}

          {facialHair === 'handlebar' && (
            <path
              d={`M 100 ${88 + jawShift * 0.3} Q 82 ${86 + jawShift * 0.3} 66 ${80 + jawShift * 0.2} Q 58 ${76 + jawShift * 0.2} 58 ${70 + jawShift * 0.2} Q 64 ${72 + jawShift * 0.2} 72 ${82 + jawShift * 0.2} Q 86 ${90 + jawShift * 0.3} 100 ${91 + jawShift * 0.3} Q 114 ${90 + jawShift * 0.3} 128 ${82 + jawShift * 0.2} Q 136 ${72 + jawShift * 0.2} 142 ${70 + jawShift * 0.2} Q 142 ${76 + jawShift * 0.2} 134 ${80 + jawShift * 0.2} Q 118 ${86 + jawShift * 0.3} 100 ${88 + jawShift * 0.3} Z`}
              filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"
            />
          )}

          {facialHair === 'chevron' && (
            <path
              d={`M 100 ${86 + jawShift * 0.3} L 74 ${92 + jawShift * 0.3} L 76 ${100 + jawShift * 0.4} L 92 ${97 + jawShift * 0.4} L 100 ${94 + jawShift * 0.4} L 108 ${97 + jawShift * 0.4} L 124 ${100 + jawShift * 0.4} L 126 ${92 + jawShift * 0.3} Z`}
              filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"
            />
          )}

          {facialHair === 'pencil' && (
            <path
              d={`M 78 ${88 + jawShift * 0.3} Q 100 ${86 + jawShift * 0.3} 122 ${88 + jawShift * 0.3}`}
              fill="none"
              stroke={facialHairColor}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          )}

          {facialHair === 'horseshoe' && (
            <path
              d={`M 80 ${88 + jawShift * 0.3} Q 100 ${86 + jawShift * 0.3} 120 ${88 + jawShift * 0.3} L 122 ${114 + jawShift * 0.8} L 114 ${114 + jawShift * 0.8} L 112 ${94 + jawShift * 0.4} Q 100 ${92 + jawShift * 0.4} 88 ${94 + jawShift * 0.4} L 86 ${114 + jawShift * 0.8} L 78 ${114 + jawShift * 0.8} Z`}
              filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"
            />
          )}

          {facialHair === 'goatee' && (
            <g filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))">
              {/* Upper moustache */}
              <path
                d={`M 78 ${88 + jawShift * 0.3} Q 100 ${86 + jawShift * 0.3} 122 ${88 + jawShift * 0.3} Q 100 ${92 + jawShift * 0.4} 78 ${88 + jawShift * 0.3} Z`}
              />
              {/* Soul patch & pointed chin goatee */}
              <path
                d={`M 92 ${102 + jawShift * 0.5} Q 100 ${101 + jawShift * 0.5} 108 ${102 + jawShift * 0.5} L 105 ${122 + jawShift * 0.9} Q 100 ${126 + jawShift * 0.9} 95 ${122 + jawShift * 0.9} Z`}
              />
            </g>
          )}

          {facialHair === 'full_beard' && (
            <path
              d={`M 54 ${78 + jawShift * 0.2} C 54 100, 68 ${126 + jawShift * 0.8}, 100 ${130 + jawShift * 0.9} C 132 ${126 + jawShift * 0.8}, 146 100, 146 ${78 + jawShift * 0.2} C 142 86, 136 94, 126 ${96 + jawShift * 0.4} C 114 ${98 + jawShift * 0.4}, 112 108, 100 ${108 + jawShift * 0.5} C 88 108, 86 ${98 + jawShift * 0.4}, 74 ${96 + jawShift * 0.4} C 64 94, 58 86, 54 ${78 + jawShift * 0.2} Z`}
              filter="drop-shadow(0 4px 8px rgba(0,0,0,0.6))"
            />
          )}

          {facialHair === 'braided_dwarf' && (
            <g filter="drop-shadow(0 4px 8px rgba(0,0,0,0.6))">
              {/* Mustache */}
              <path
                d={`M 72 ${88 + jawShift * 0.3} Q 100 ${84 + jawShift * 0.3} 128 ${88 + jawShift * 0.3} Q 100 ${94 + jawShift * 0.4} 72 ${88 + jawShift * 0.3} Z`}
              />
              {/* Left Braid */}
              <path
                d={`M 82 ${102 + jawShift * 0.5} Q 78 ${118 + jawShift * 0.8} 82 ${134 + jawShift * 1.0} L 88 ${133 + jawShift * 1.0} Q 86 ${118 + jawShift * 0.8} 90 ${102 + jawShift * 0.5} Z`}
              />
              {/* Right Braid */}
              <path
                d={`M 110 ${102 + jawShift * 0.5} Q 114 ${118 + jawShift * 0.8} 110 ${134 + jawShift * 1.0} L 116 ${133 + jawShift * 1.0} Q 120 ${118 + jawShift * 0.8} 118 ${102 + jawShift * 0.5} Z`}
              />
              {/* Brass/Gold Braid Rings */}
              <rect x="80" y={116 + jawShift * 0.7} width="9" height="4" rx="1.5" fill="#fef08a" stroke="#78350f" strokeWidth="0.8" />
              <rect x="111" y={116 + jawShift * 0.7} width="9" height="4" rx="1.5" fill="#fef08a" stroke="#78350f" strokeWidth="0.8" />
              <circle cx="84" cy={133 + jawShift * 1.0} r="2" fill="#fef08a" stroke="#78350f" strokeWidth="0.6" />
              <circle cx="114" cy={133 + jawShift * 1.0} r="2" fill="#fef08a" stroke="#78350f" strokeWidth="0.6" />
            </g>
          )}

          {facialHair === 'wizard' && (
            <path
              d={`M 72 ${88 + jawShift * 0.3} Q 100 ${85 + jawShift * 0.3} 128 ${88 + jawShift * 0.3} C 135 110, 115 130, 104 ${144 + jawShift * 1.1} Q 100 ${146 + jawShift * 1.1} 96 ${144 + jawShift * 1.1} C 85 130, 65 110, 72 ${88 + jawShift * 0.3} Z`}
              filter="drop-shadow(0 4px 10px rgba(0,0,0,0.6))"
              opacity="0.95"
            />
          )}
        </g>
      )}
    </g>
  );
}
