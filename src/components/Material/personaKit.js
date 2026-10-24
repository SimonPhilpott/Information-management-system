// The persona page's fixed data, moved unchanged from Dashboard/PersonaPortal.jsx (24 Oct 2026) for the IMS-design
// page (Material/Personas.jsx): the speech languages, the five personality slider axes (from the desk's
// Personality screen and hardwareClientService.js) and how a slider value is described.
// Strip YAML frontmatter
export const stripHeader = (raw) => String(raw || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');

// Helper fetch wrapper
export const api = async (url, opts = {}) => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.success === false) throw new Error(d.error || `Request failed (${res.status})`);
  return d;
};

export const LANGS = [
  ['en-GB', 'English (UK)'],
  ['en-US', 'English (US)'],
  ['en-AU', 'English (Australia)'],
  ['en-IN', 'English (India)']
];

// Ported from ESP32 IMS Personality Screen & hardwareClientService.js
export const PERSONALITY_AXES_CONFIG = {
  humor: {
    label: "Humor",
    low: { name: "Cheerful", val: 15, text: "upbeat, sunny, and lighthearted - playful banter, wholesome wit, gentle warmth, and zero cynicism" },
    mid: { name: "Dry", val: 50, text: "sharp, deadpan, and grounded - understated situational irony delivered with a straight face, occasional quiet wry breath for absurdities, never announced" },
    high: { name: "Dark", val: 85, text: "cynical, macabre, and sardonic - gallows humour, existential absurdity, biting satire, and wry fatalism about weather, hills, and code" }
  },
  delivery: {
    label: "Delivery",
    low: { name: "Tactful", val: 15, text: "diplomatic, gentle, and cushioned - polite phrasing and softened language to minimise friction" },
    mid: { name: "Candid", val: 50, text: "plainspoken, straightforward, and fair - clear and transparent without excessive softening or harshness" },
    high: { name: "Blunt", val: 85, text: "terse, unvarnished, and razor-sharp - straight to the point, zero pleasantries or euphemisms" }
  },
  temperament: {
    label: "Temperament",
    low: { name: "Pragmatic", val: 15, text: "grounded, literal, and functional - real-world utility, concrete actions, direct problem-solving" },
    mid: { name: "Systematic", val: 50, text: "structured, rational, and methodical - weighing variables logically into clear frameworks" },
    high: { name: "Philosophical", val: 85, text: "abstract, reflective, and speculative - foundational theories, meta-questions, existential implications" }
  },
  social: {
    label: "Social",
    low: { name: "Clinical", val: 15, text: "detached, objective, and transactional - minimal emotional colouring or rapport" },
    mid: { name: "Professional", val: 50, text: "cordial, cooperative, and approachable - respectful, constructive rapport without becoming overly personal" },
    high: { name: "Empathic", val: 85, text: "warm, validating, and emotionally attuned - actively engaging with feelings and offering reassurance" }
  },
  formality: {
    label: "Formality",
    low: { name: "Casual", val: 15, text: "conversational, relaxed, and idiomatic - loose sentence structures and an easygoing peer-to-peer tone" },
    mid: { name: "Articulate", val: 50, text: "clean, standard, and balanced - clear, modern, accessible prose, neither sloppy nor stuffy" },
    high: { name: "Academic", val: 85, text: "erudite, precise, and elevated - advanced vocabulary, rigorous syntax, formal rhetorical conventions" }
  }
};

export const DEFAULT_PERSONALITY = { humor: 70, delivery: 45, temperament: 30, social: 55, formality: 35 };

export function describeSliderAxis(val, axis) {
  const v = Math.round(Number(val) || 0);
  if (v <= 33) return { name: axis.low.name, tier: 'low', text: axis.low.text };
  if (v <= 66) return { name: axis.mid.name, tier: 'mid', text: axis.mid.text };
  return { name: axis.high.name, tier: 'high', text: axis.high.text };
}
