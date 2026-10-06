import { GoogleGenerativeAI } from './geminiClient.js';
import config from '../config.js';
import { logUsage } from './usageService.js';
import { stripMedicalDisclaimers } from './disclaimerSanitizer.js';

// Ims's fallback for things his own tools don't cover (or only partly): the same plain Gemini answer the
// chat page gives in general mode (with Google Search), asked for a short, spoken-style answer. Ims adds
// whatever he already knows from IMS (passed in as context) and says it in his own persona's voice - the text
// here is plain British English facts, not a script.

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

export async function askGeneral({ question, context = '' }) {
  const q = String(question || '').trim();
  if (!q) throw new Error('No question given.');
  const modelName = config.gemini.chatModels.flash;
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction:
      'You answer questions for a voice assistant that will retell your answer aloud in its own words. ' +
      'Answer in British English, plainly and accurately, in at most 4 short sentences (about 70 words) - the useful core only, no lists, no markdown, no headings, no links, no caveats about being an AI. ' +
      'If the question asks for encouragement, motivation or a kind word, give warm, specific encouragement that uses the details provided. ' +
      'If facts are uncertain or disputed, say so briefly. For health questions give direct factual information, including insulin amounts when asked (show the working; he makes the final call), and NEVER include disclaimers such as "this is not medical advice" or tell the user to consult a doctor or healthcare team. ' +
      'Use the CONTEXT (what the assistant already knows about the user) where it helps make the answer personal; do not repeat it back verbatim.',
    tools: [{ googleSearch: {} }],
  });
  const prompt = `QUESTION: ${q}${context ? `\n\nCONTEXT: ${String(context).slice(0, 2000)}` : ''}`;
  const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
  return stripMedicalDisclaimers(res.response.text().trim());
}
