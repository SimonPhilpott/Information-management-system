import { GoogleGenerativeAI } from './geminiClient.js';
import config from '../config.js';
import { getModelFor } from './modelRegistry.js';
import { getPersona, activePersonaId } from './personaService.js';
import { profilesForPrompt } from './memoryProfiles.js';

// Stories for Ims to tell aloud. Gemini Live makes a story up as it speaks and stops after a paragraph - a tale
// Simon asked for came out a sentence a turn, with no detail, no shape and no ending (19 Oct: "it was a bit
// boring... you kept stopping"). So the whole story is written first, properly, in the active persona's voice
// and with what Ims knows Simon likes, and Ims performs it from the text, as he does the day report.

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
const WORDS = { short: 350, normal: 750, long: 1200 };

export async function writeStory({ request = '', length = 'normal' } = {}) {
  const words = WORDS[length] || WORDS.normal;
  let persona = null;
  try { persona = getPersona(activePersonaId()); } catch (_) { /* default voice */ }
  let about = '';
  try { about = profilesForPrompt({ accentFree: true }).slice(0, 1500); } catch (_) { /* none yet */ }
  const teller = persona
    ? `${persona.name} - ${persona.character}. He speaks ${persona.dialect || 'plain British English'}${persona.dialectWords?.length ? ` (words like ${persona.dialectWords.slice(0, 8).join(', ')})` : ''}.`
    : 'a warm, plain-spoken British storyteller.';
  const model = genAI.getGenerativeModel({
    model: getModelFor('imsStories') || config.gemini.chatModels.flash,
    systemInstruction:
      `You write stories to be told aloud, by heart, by ${teller} ` +
      `Write in his voice, with a light touch of his dialect - a few of his words and turns of phrase, but spelled normally (never "t'" for "the", "tha" or dropped letters with apostrophes: the voice reads them badly) - the voice of someone telling it by a fire, not reading a book. ` +
      `Craft: one complete tale with a beginning, middle and end. A named character the listener can picture; a vivid place, ` +
      `with all five senses (cold, smell, sound, texture, light); something they want and something in the way; a turn the ` +
      `listener doesn't see coming; a moment of real wonder or dread; and an ending that lands and lingers, on an image, never a ` +
      `moral spelled out. Be original and surprising - avoid the obvious version of any idea (no "lost on the moor, finds a ` +
      `cottage, kind old woman"), and no stock fantasy names (Elara, Lyra, Elias, Kael...) - real-sounding ones that fit the place. Folklore, myth and the strange are welcome. ` +
      `For the ear: short paragraphs, mostly short sentences with the odd long rolling one, a little dialogue with clear "she said" ` +
      `tags, "..." where the teller should pause. No title, no headings, no markdown, no lists, no stage directions, no ` +
      `preamble - start with the first line of the story. British English. About ${words} words. ` +
      `Never sexual, never gratuitously violent, never racist or sexist; nothing about blood sugar, diabetes, insulin or running.`,
  });
  const prompt = `THE LISTENER ASKED FOR: ${String(request || 'an interesting story').slice(0, 600)}` +
    (about ? `\n\nWHAT THE TELLER KNOWS ABOUT HIM (use a thread of it if it fits - never list it):\n${about}` : '');
  // little thinking: he's waiting in silence while it's written (25 s with the default, 19 Oct)
  const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 1.0, thinkingConfig: { thinkingBudget: 256 } } });
  return res.response.text().replace(/^#+\s.*$/gm, '').replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
}
