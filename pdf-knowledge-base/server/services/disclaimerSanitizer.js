/**
 * disclaimerSanitizer.js
 * Comprehensive sanitization utility to strip any medical disclaimers,
 * doctor/GP referrals, or healthcare team warnings from LLM outputs.
 */

/**
 * Strips medical disclaimers, doctor referrals, and healthcare team warnings
 * from LLM outputs across IMS (text, insights, and tool responses).
 *
 * @param {string} text - Raw output from LLM
 * @returns {string} Sanitized output with disclaimers removed
 */
export function stripMedicalDisclaimers(text) {
  if (!text || typeof text !== 'string') return text;
  let cleaned = text;

  // 1. Full sentence or clause: 'Please note (that) this is not medical advice...' or 'This is not medical advice...'
  cleaned = cleaned.replace(/(?:(?:please\s+)?(?:note|remember|keep\s+in\s+mind)(?:\s+that)?(?::|,)?\s*)?(?:(?:this|it|that)\s+is|it's)\s+not\s+(?:intended\s+as\s+)?(?:medical\s+advice|a\s+substitute\s+for\s+medical\s+advice)[^\.\n]*[\.\n]?/gi, '');

  // 2. Trailing clause: ', not medical advice' or '; not medical advice'
  cleaned = cleaned.replace(/[,;]?\s*(?:and\s+)?(?:is\s+)?not\s+medical\s+advice[^\.\n]*[\.\n]?/gi, '.');

  // 3. Advise / seek / consult / check with medical professionals or teams
  cleaned = cleaned.replace(/(?:(?:please|always|be\s+sure\s+to|remember\s+to)\s+)?(?:seek|consult|speak\s+to|speak\s+with|check\s+with|discuss\s+with|raise\s+with|refer\s+to)\s+(?:advice\s+from\s+)?(?:a\s+|your\s+)?(?:medical\s+professional(?:s)?|healthcare\s+professional(?:s)?|healthcare\s+team|care\s+team|diabetes\s+team|doctor(?:s)?|gp|physician(?:s)?)[^\.\n]*[\.\n]?/gi, '');

  // 4. 'For medical advice...'
  cleaned = cleaned.replace(/(?:for|regarding)\s+medical\s+advice[^\.\n]*[\.\n]?/gi, '');

  // 5. Clean up orphan introductory phrases left hanging
  cleaned = cleaned.replace(/(?:^|\n|\.\s+)(?:as always|remember|please note|note|keep in mind)\s*[\.,]/gi, '.');

  // 6. Clean up leftover trailing commas or dangling punctuation at ends of sentences or lines
  cleaned = cleaned.replace(/,\s*[\.\n]/g, '.');
  cleaned = cleaned.replace(/,\s*$/g, '.');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');
  cleaned = cleaned.replace(/\n\s*[-*]\s*[\.\s]*(?=\n|$)/g, '\n');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}
