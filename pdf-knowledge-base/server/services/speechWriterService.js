import { GoogleGenerativeAI } from './geminiClient.js';
import config from '../config.js';
import { getModelFor } from './modelRegistry.js';
import { getPersona, activePersonaId } from './personaService.js';
import { profilesForPrompt } from './memoryProfiles.js';

// Pieces Ims writes first and then says - the same idea as stories (storyService.js): Gemini Live is good at
// back-and-forth but makes a long, structured piece up as it goes and stops after a paragraph. So an explanation,
// a toast, a message, a recipe, a campaign recap or a game teach is written properly here, then Ims performs it
// (or reads it back for changes). Kinds:
//   explanation - "how does X work": a planned 2-3 minutes, an analogy first
//   toast, speech, poem, card - words for Simon to give or write (his voice, not Ims's)
//   message - an email / Teams message in Simon's tone
//   recipe - ingredients and steps with timings, for cooking along one step at a time
//   recap - "previously on..." for a board game campaign, in-world
//   teach - teaching a board game's rules

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
export const KINDS = ['explanation', 'toast', 'speech', 'poem', 'card', 'message', 'recipe', 'recap', 'teach'];
// performed in full in one go (the rest are read back for changes, or followed a step at a time)
export const PERFORMED = new Set(['explanation', 'recap', 'teach', 'speech', 'toast', 'poem']);
const SEARCH = new Set(['explanation', 'recipe', 'teach']);

const LENGTH = {
  explanation: { short: 200, normal: 380, long: 650 },
  toast: { short: 90, normal: 170, long: 300 },
  speech: { short: 250, normal: 500, long: 900 },
  poem: { short: 60, normal: 130, long: 240 },
  card: { short: 30, normal: 60, long: 110 },
  message: { short: 60, normal: 130, long: 260 },
  recipe: { short: 250, normal: 400, long: 600 },
  recap: { short: 150, normal: 300, long: 500 },
  teach: { short: 250, normal: 450, long: 800 },
};

const BRIEF = {
  explanation: 'An explanation to be spoken aloud: start with one plain-English analogy that makes it click, then how it actually works step by step, then why it matters or the surprising bit. Flowing speech, no lists. Accurate - check facts you are not sure of.',
  toast: 'A toast for Simon to give aloud: warm, personal, a little funny, with one specific detail about the person, ending with the raise of a glass ("so please raise your glasses to...").',
  speech: 'A speech for Simon to give: a strong opening line, two or three real stories or points with specific details, a light touch of humour, and a close that lands.',
  poem: 'A poem: a clear rhythm and rhyme that reads well aloud (unless asked for free verse), concrete images, and one line that surprises. No clichés.',
  card: 'A message for a card, in Simon\'s voice: personal, specific, short - the kind of thing people keep.',
  message: 'An email or Teams message for Simon to send, in his own tone: plain, friendly, professional, to the point. First line says why he is writing; then what is needed and by when; a short sign-off. If it is an email, start with "Subject: ..." on its own line.',
  recipe: 'A recipe to cook along with, one step at a time. First "Ingredients:" with quantities (UK measures, grams and ml) for the servings asked. Then numbered steps, each one action, with its time in square brackets where there is a wait - e.g. "3. Fry the onions until soft and golden. [timer 8 min]" - and a tip only where it matters. Oven temperatures in °C (fan).',
  recap: 'A "previously on..." recap of the campaign, told wholly in-world - for The Lord of the Rings card game in the voice of Tolkien\'s narration (the heroes, the road, the shadow); for Arkham Horror in the voice of 1920s weird fiction. What happened last time, where the heroes stand (wounds, losses, trauma, what they carry), and the threat that waits next - ending on a line that sends them into the next scenario. Never mention cards, rules, scores or game terms by name.',
  teach: 'Teaching a board game to someone who has never played, aloud: what the game is about and how you win, first; then the setup in a couple of lines; then how a turn goes, in order; then the two or three things new players always get wrong; then "the best way to learn is to play a round". Accurate to the published rules - check them.',
};

export async function writePiece({ kind = 'explanation', request = '', forWhom = '', tone = '', length = 'normal', previous = '', change = '', campaign = '' } = {}) {
  const k = KINDS.includes(kind) ? kind : 'explanation';
  const words = (LENGTH[k] || LENGTH.explanation)[length] || (LENGTH[k] || LENGTH.explanation).normal;
  let persona = null;
  try { persona = getPersona(activePersonaId()); } catch (_) { /* default */ }
  let about = '';
  try { about = profilesForPrompt({ accentFree: true }).slice(0, 1500); } catch (_) { /* none yet */ }
  // Ims's own voice for what he says; Simon's for what Simon will give or send
  const simonsWords = ['toast', 'speech', 'poem', 'card', 'message'].includes(k);
  const voice = k === 'recap'
    ? 'Tell it wholly in-world, as the narrator of the tale itself - never as a chatty host, never "right then" or any modern or dialect voice.'
    : simonsWords
    ? 'Write it in Simon\'s own voice - he is a British software engineer from Leeds, warm, dry-humoured and plain-spoken - as words he will give or send himself. Plain British spelling, no dialect spellings.'
    : `It will be spoken aloud by ${persona ? `${persona.name} - ${persona.character}` : 'a warm British voice assistant'}: write it in his voice, with at most a light touch of his dialect, spelled normally (no "t'" or apostrophe-dropped letters - the voice reads them badly).`;
  const tools = SEARCH.has(k) ? [{ googleSearch: {} }] : undefined;
  const model = genAI.getGenerativeModel({
    model: getModelFor('imsStories') || config.gemini.chatModels.flash,
    systemInstruction: `${BRIEF[k]} ${voice} About ${words} words. For the ear: short paragraphs, mostly short sentences, "..." where a pause helps. ` +
      'No title, no markdown, no bullet points (numbered recipe steps are fine), no preamble or sign-off from you - just the piece itself. British English. ' +
      'Never sexual, never gratuitously violent, never racist or sexist; nothing about blood sugar, diabetes, insulin or running unless it is asked for.',
    ...(tools ? { tools } : {}),
  });
  const parts = [`WHAT HE ASKED FOR: ${String(request || '').slice(0, 1200)}`];
  if (forWhom) parts.push(`WHO IT IS FOR: ${String(forWhom).slice(0, 300)}`);
  if (tone) parts.push(`TONE: ${String(tone).slice(0, 200)}`);
  if (campaign) parts.push(`THE CAMPAIGN RECORDS:\n${String(campaign).slice(0, 12000)}`);
  if (previous) parts.push(`THE LAST VERSION:\n${String(previous).slice(0, 6000)}\n\nCHANGE IT LIKE THIS: ${String(change || 'improve it').slice(0, 600)} - keep everything else that worked.`);
  if (about && k !== 'recap') parts.push(`WHAT IS KNOWN ABOUT SIMON (use details only where they fit - never list them):\n${about}`);
  const res = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: parts.join('\n\n') }] }],
    // little thinking: Ims is waiting while it's written; a recipe or a rules teach is checked with search instead
    generationConfig: { temperature: ['explanation', 'recipe', 'teach', 'message'].includes(k) ? 0.6 : 1.0, thinkingConfig: { thinkingBudget: 256 } },
  });
  return res.response.text().replace(/^#+\s.*$/gm, '').replace(/\*{1,2}([^*\n]+)\*{1,2}/g, '$1').replace(/^\s*[-*•]\s+/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}
