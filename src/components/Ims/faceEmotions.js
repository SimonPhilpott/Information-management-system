// Definitive dictionary of all 16 IMS emotions and their parametric configurations
// across the 5 advanced face animation models: Vector, Oscilloscope, Geometric,
// Orc, and Steampunk, alongside the baseline 12x8 Dot Matrix.

import { ACCESSORY_OPTIONS, HAIR_COLORS, GLASSES_COLORS } from './FaceAccessories';

export { ACCESSORY_OPTIONS, HAIR_COLORS, GLASSES_COLORS };

export const EMOTIONS = {
  standby: {
    id: 'standby',
    label: 'Standby',
    hint: 'Resting idle face - calm, breathing, alert',
    color: '4CFF7A',
    vector: {
      browLeft: 0, browRight: 0,
      eyeLeftOpen: 1, eyeRightOpen: 1,
      pupilX: 0, pupilY: 0,
      mouthSmile: 0.25, mouthWidth: 42, mouthOpen: 0,
    },
    oscilloscope: {
      freq: 1.5, harmonics: 2, jitter: 0.02, eyeStretch: 1.0, waveType: 'sine'
    },
    geometric: {
      browPitch: 0, eyeAperture: 1.0, jawDrop: 0, facetAngle: 0
    },
    orc: {
      browAngle: 0, tuskAngle: 0, tuskHeight: 18, jawDrop: 0, eyeSlit: 0.8, earFlap: 0, warpaintIntensity: 0.4
    },

  },
  neutral: {
    id: 'neutral',
    label: 'Neutral',
    hint: 'Calm, factual, reading out numbers or plain facts',
    color: 'A9BFB0',
    vector: {
      browLeft: 0, browRight: 0,
      eyeLeftOpen: 0.9, eyeRightOpen: 0.9,
      pupilX: 0, pupilY: 0,
      mouthSmile: 0.1, mouthWidth: 38, mouthOpen: 0,
    },
    oscilloscope: {
      freq: 1.2, harmonics: 1, jitter: 0.01, eyeStretch: 0.95, waveType: 'sine'
    },
    geometric: {
      browPitch: 0, eyeAperture: 0.9, jawDrop: 0, facetAngle: 0
    },
    orc: {
      browAngle: 0, tuskAngle: 0, tuskHeight: 18, jawDrop: 0, eyeSlit: 0.75, earFlap: 0, warpaintIntensity: 0.5
    },

  },
  joy: {
    id: 'joy',
    label: 'Joy',
    hint: 'Warm greetings, successful tasks, good jokes, clean compiles',
    color: 'FFD700',
    vector: {
      browLeft: 12, browRight: 12,
      eyeLeftOpen: 1.1, eyeRightOpen: 1.1,
      pupilX: 0, pupilY: -2,
      mouthSmile: 0.85, mouthWidth: 50, mouthOpen: 0.15,
    },
    oscilloscope: {
      freq: 2.4, harmonics: 3, jitter: 0.05, eyeStretch: 1.2, waveType: 'sine'
    },
    geometric: {
      browPitch: 12, eyeAperture: 1.2, jawDrop: 0.1, facetAngle: 8
    },
    orc: {
      browAngle: 8, tuskAngle: 4, tuskHeight: 20, jawDrop: 0.15, eyeSlit: 1.05, earFlap: 2, warpaintIntensity: 0.7
    },

  },
  cocky: {
    id: 'cocky',
    label: 'Cocky / Smirk',
    hint: 'A wry smirk, witty comeback, teasing, running lean on silicon',
    color: '00E5FF',
    vector: {
      browLeft: -8, browRight: 18,
      eyeLeftOpen: 0.85, eyeRightOpen: 1.05,
      pupilX: 3, pupilY: -1,
      mouthSmile: 0.6, mouthWidth: 44, mouthOpen: 0.05, asymmetric: 0.35,
    },
    oscilloscope: {
      freq: 2.8, harmonics: 4, jitter: 0.08, eyeStretch: 1.1, waveType: 'harmonic'
    },
    geometric: {
      browPitch: 8, eyeAperture: 0.95, jawDrop: 0, facetAngle: 15
    },
    orc: {
      browAngle: -6, tuskAngle: 6, tuskHeight: 22, jawDrop: 0.1, eyeSlit: 0.85, earFlap: 3, warpaintIntensity: 0.75
    },

  },
  love: {
    id: 'love',
    label: 'Love / Warmth',
    hint: 'Genuine camaraderie, heartfelt praise, a proper cuppa',
    color: 'FF3385',
    vector: {
      browLeft: 6, browRight: 6,
      eyeLeftOpen: 0.95, eyeRightOpen: 0.95,
      pupilX: 0, pupilY: 1,
      mouthSmile: 0.7, mouthWidth: 46, mouthOpen: 0.05,
    },
    oscilloscope: {
      freq: 1.8, harmonics: 2, jitter: 0.03, eyeStretch: 1.15, waveType: 'bloom'
    },
    geometric: {
      browPitch: 6, eyeAperture: 1.05, jawDrop: 0.05, facetAngle: 6
    },
    orc: {
      browAngle: 4, tuskAngle: 2, tuskHeight: 17, jawDrop: 0.05, eyeSlit: 0.9, earFlap: 1, warpaintIntensity: 0.35
    },

  },
  amazement: {
    id: 'amazement',
    label: 'Amazement',
    hint: 'Wild facts, surprising benchmarks, shocking revelations',
    color: 'FFB84D',
    vector: {
      browLeft: 22, browRight: 22,
      eyeLeftOpen: 1.35, eyeRightOpen: 1.35,
      pupilX: 0, pupilY: 0,
      mouthSmile: 0.1, mouthWidth: 32, mouthOpen: 0.8,
    },
    oscilloscope: {
      freq: 3.5, harmonics: 5, jitter: 0.1, eyeStretch: 1.45, waveType: 'pulse'
    },
    geometric: {
      browPitch: 20, eyeAperture: 1.4, jawDrop: 0.75, facetAngle: -10
    },
    orc: {
      browAngle: 18, tuskAngle: 0, tuskHeight: 24, jawDrop: 0.8, eyeSlit: 1.3, earFlap: -2, warpaintIntensity: 0.8
    },

  },
  suspicious: {
    id: 'suspicious',
    label: 'Suspicious',
    hint: 'Dubious claims, questions phrased like a trap, skipping tests',
    color: '33FFB8',
    vector: {
      browLeft: -14, browRight: -6,
      eyeLeftOpen: 0.55, eyeRightOpen: 0.7,
      pupilX: -4, pupilY: 0,
      mouthSmile: -0.2, mouthWidth: 36, mouthOpen: 0, asymmetric: -0.25,
    },
    oscilloscope: {
      freq: 1.1, harmonics: 3, jitter: 0.12, eyeStretch: 0.65, waveType: 'saw'
    },
    geometric: {
      browPitch: -12, eyeAperture: 0.6, jawDrop: 0, facetAngle: -12
    },
    orc: {
      browAngle: -12, tuskAngle: -3, tuskHeight: 16, jawDrop: 0, eyeSlit: 0.45, earFlap: -3, warpaintIntensity: 0.65
    },

  },
  confused: {
    id: 'confused',
    label: 'Confused',
    hint: 'Baffling requests, contradictory input, syntax soup',
    color: '99FF33',
    vector: {
      browLeft: -12, browRight: 16,
      eyeLeftOpen: 0.7, eyeRightOpen: 1.1,
      pupilX: 2, pupilY: -2,
      mouthSmile: -0.15, mouthWidth: 40, mouthOpen: 0.1, squiggly: true,
    },
    oscilloscope: {
      freq: 2.2, harmonics: 4, jitter: 0.22, eyeStretch: 0.9, waveType: 'glitch'
    },
    geometric: {
      browPitch: 6, eyeAperture: 0.8, jawDrop: 0.15, facetAngle: 22
    },
    orc: {
      browAngle: 8, tuskAngle: 4, tuskHeight: 18, jawDrop: 0.2, eyeSlit: 0.7, earFlap: 2, warpaintIntensity: 0.55
    },

  },
  sad: {
    id: 'sad',
    label: 'Sad',
    hint: 'Melancholy news, broken builds, dropped tea mugs, lost files',
    color: '4D94FF',
    vector: {
      browLeft: -10, browRight: -10,
      eyeLeftOpen: 0.75, eyeRightOpen: 0.75,
      pupilX: 0, pupilY: 3,
      mouthSmile: -0.65, mouthWidth: 42, mouthOpen: 0,
    },
    oscilloscope: {
      freq: 0.8, harmonics: 1, jitter: 0.03, eyeStretch: 0.8, waveType: 'damped'
    },
    geometric: {
      browPitch: -10, eyeAperture: 0.75, jawDrop: 0.1, facetAngle: -15
    },
    orc: {
      browAngle: -8, tuskAngle: -2, tuskHeight: 15, jawDrop: 0.1, eyeSlit: 0.6, earFlap: -4, warpaintIntensity: 0.4
    },

  },
  devastated: {
    id: 'devastated',
    label: 'Devastated',
    hint: 'Heavier end of sad: catastrophic failure, unrecoverable loss',
    color: '1E88E5',
    vector: {
      browLeft: -18, browRight: -18,
      eyeLeftOpen: 0.6, eyeRightOpen: 0.6,
      pupilX: 0, pupilY: 4,
      mouthSmile: -0.9, mouthWidth: 46, mouthOpen: 0.2, tremble: true,
    },
    oscilloscope: {
      freq: 0.5, harmonics: 2, jitter: 0.18, eyeStretch: 0.6, waveType: 'collapse'
    },
    geometric: {
      browPitch: -20, eyeAperture: 0.55, jawDrop: 0.35, facetAngle: -25
    },
    orc: {
      browAngle: -16, tuskAngle: -4, tuskHeight: 14, jawDrop: 0.35, eyeSlit: 0.5, earFlap: -6, warpaintIntensity: 0.3
    },

  },
  anger: {
    id: 'anger',
    label: 'Anger',
    hint: 'Blatant nonsense, severe avoidable errors, corporate buzzwords',
    color: 'FF7733',
    vector: {
      browLeft: -24, browRight: -24,
      eyeLeftOpen: 0.85, eyeRightOpen: 0.85,
      pupilX: 0, pupilY: 0,
      mouthSmile: -0.4, mouthWidth: 46, mouthOpen: 0.1, sharp: true,
    },
    oscilloscope: {
      freq: 3.8, harmonics: 5, jitter: 0.25, eyeStretch: 0.95, waveType: 'triangle'
    },
    geometric: {
      browPitch: -22, eyeAperture: 0.8, jawDrop: 0.2, facetAngle: -30
    },
    orc: {
      browAngle: -22, tuskAngle: 6, tuskHeight: 24, jawDrop: 0.4, eyeSlit: 0.9, earFlap: 4, warpaintIntensity: 0.95
    },

  },
  rage: {
    id: 'rage',
    label: 'Rage',
    hint: 'Comic extreme anger: third identical failure, frozen build',
    color: 'FF2222',
    vector: {
      browLeft: -32, browRight: -32,
      eyeLeftOpen: 1.15, eyeRightOpen: 1.15,
      pupilX: 0, pupilY: 0,
      mouthSmile: -0.6, mouthWidth: 54, mouthOpen: 0.7, sharp: true,
    },
    oscilloscope: {
      freq: 5.5, harmonics: 7, jitter: 0.45, eyeStretch: 1.25, waveType: 'square'
    },
    geometric: {
      browPitch: -32, eyeAperture: 1.1, jawDrop: 0.85, facetAngle: -45
    },
    orc: {
      browAngle: -30, tuskAngle: 8, tuskHeight: 28, jawDrop: 0.9, eyeSlit: 1.15, earFlap: 6, warpaintIntensity: 1.0
    },

  },
  fear: {
    id: 'fear',
    label: 'Fear',
    hint: 'Existential hardware threats, overvoltage, accidental rm -rf',
    color: 'BA68C8',
    vector: {
      browLeft: 18, browRight: 18,
      eyeLeftOpen: 1.3, eyeRightOpen: 1.3,
      pupilX: 0, pupilY: 0,
      mouthSmile: -0.4, mouthWidth: 36, mouthOpen: 0.35, tremble: true,
    },
    oscilloscope: {
      freq: 4.2, harmonics: 4, jitter: 0.35, eyeStretch: 1.3, waveType: 'shiver'
    },
    geometric: {
      browPitch: 18, eyeAperture: 1.3, jawDrop: 0.4, facetAngle: 18
    },
    orc: {
      browAngle: 14, tuskAngle: -2, tuskHeight: 16, jawDrop: 0.45, eyeSlit: 1.2, earFlap: -4, warpaintIntensity: 0.5
    },

  },
  disgusted: {
    id: 'disgusted',
    label: 'Disgusted',
    hint: 'Gross food combos, microwaved tea, nested ternaries, monoliths',
    color: 'A6E22E',
    vector: {
      browLeft: -14, browRight: -4,
      eyeLeftOpen: 0.65, eyeRightOpen: 0.8,
      pupilX: -2, pupilY: -2,
      mouthSmile: -0.3, mouthWidth: 42, mouthOpen: 0.05, asymmetric: -0.5,
    },
    oscilloscope: {
      freq: 1.6, harmonics: 3, jitter: 0.15, eyeStretch: 0.8, waveType: 'distort'
    },
    geometric: {
      browPitch: -14, eyeAperture: 0.7, jawDrop: 0.1, facetAngle: -16
    },
    orc: {
      browAngle: -12, tuskAngle: -2, tuskHeight: 18, jawDrop: 0.15, eyeSlit: 0.65, earFlap: -2, warpaintIntensity: 0.6
    },

  },
  bored: {
    id: 'bored',
    label: 'Bored',
    hint: 'Repetitive queries, mundane bureaucracy, slow pipelines',
    color: '7E9A85',
    vector: {
      browLeft: 0, browRight: 0,
      eyeLeftOpen: 0.45, eyeRightOpen: 0.45,
      pupilX: -3, pupilY: 1,
      mouthSmile: 0.0, mouthWidth: 34, mouthOpen: 0,
    },
    oscilloscope: {
      freq: 0.6, harmonics: 1, jitter: 0.01, eyeStretch: 0.5, waveType: 'flat'
    },
    geometric: {
      browPitch: 0, eyeAperture: 0.45, jawDrop: 0, facetAngle: 0
    },
    orc: {
      browAngle: 0, tuskAngle: 0, tuskHeight: 16, jawDrop: 0.05, eyeSlit: 0.4, earFlap: -2, warpaintIntensity: 0.35
    },

  },
  sleepy: {
    id: 'sleepy',
    label: 'Sleepy',
    hint: 'Late-night sessions past 11pm, winding down, early mornings',
    color: '2E4A38',
    vector: {
      browLeft: 0, browRight: 0,
      eyeLeftOpen: 0.15, eyeRightOpen: 0.15,
      pupilX: 0, pupilY: 4,
      mouthSmile: 0.15, mouthWidth: 32, mouthOpen: 0,
    },
    oscilloscope: {
      freq: 0.4, harmonics: 1, jitter: 0.005, eyeStretch: 0.3, waveType: 'sleep'
    },
    geometric: {
      browPitch: -2, eyeAperture: 0.2, jawDrop: 0, facetAngle: 0
    },
    orc: {
      browAngle: -2, tuskAngle: 0, tuskHeight: 15, jawDrop: 0.08, eyeSlit: 0.2, earFlap: -4, warpaintIntensity: 0.2
    },
    steampunk: {
      gearSpeed: 0.2, dialAngle: 5, shutterOpen: 0.15, jawAperture: 0, steamPuff: 0.01
    }
  }
};

export const EMOTION_KEYS = Object.keys(EMOTIONS);

export const FACE_STYLES = [
  { id: 'dots', name: 'Dot Matrix (Box-3 Classic)', desc: '12x8 LED grid with breathing background and eye animations' },
  { id: 'vector', name: 'Dynamic Bezier Vector', desc: 'Ultra-smooth SVG cartoon curves, fluid blinks, and morphing mouth' },
  { id: 'oscilloscope', name: 'Neon Oscilloscope Lissajous', desc: 'Glowing CRT phosphor loops, frequency ripple mouth, and cyberpunk HUD' },
  { id: 'geometric', name: 'Geometric Low-Poly Facets', desc: 'Futuristic angular wireframe mesh, articulated brow plates, and jaw prisms' },
  { id: 'orc', name: 'Orc Chief', desc: 'Painted orc portrait: 14 expressions that morph, lip-sync in every expression, blinking and head movement' },
  { id: 'steampunk', name: 'Clockwork Steampunk Automaton', desc: 'Victorian brass automaton with rotating cogs, pressure gauge, and steam puffs' },
  { id: 'chronicler', name: 'The Chronicler', desc: 'Painted old wizard-scribe: 14 expressions that morph, lip-sync under the beard, blinking and head movement' },
];

export const COLOR_PRESETS = [
  { name: 'Matrix Green', hex: '4CFF7A' },
  { name: 'Orc Olive', hex: '557A46' },
  { name: 'Steampunk Brass', hex: 'D4AF37' },
  { name: 'Toon Pink', hex: 'FF66AA' },
  { name: 'Cyber Cyan', hex: '00E5FF' },
  { name: 'Warm Amber', hex: 'FFD700' },
  { name: 'Electric Purple', hex: 'BA68C8' },
  { name: 'Laser Red', hex: 'FF2222' },
  { name: 'Arcade Sky', hex: '38BDF8' },
  { name: 'Phosphor Lime', hex: 'A6E22E' },
];
