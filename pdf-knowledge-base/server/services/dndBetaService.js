// D&D Solo beta: Rindewind's lines and his answers. The beta's rules engine has already decided everything (the room,
// the roll, the foe), so for a scene the model only dresses what the book's own text says: one or two sentences from a
// small fast model, no JSON. Out of character, rules questions are answered from Simon's rulebook (askRules, with the
// pages it used); advice and recaps from the live game state the page sends.
import { GoogleGenerativeAI } from './geminiClient.js';
import config from '../config.js';
import { askRules } from './dndLibrary.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { getRuleset, DND_BOOKS_ROOT } from './dndSoloService.js';

// Models come from IMS's model list (Settings > Models), so a retired model can never silence Rindewind again
// (29 Oct 2026: gemini-2.5-flash-lite was withdrawn and every narration and Chronicle chapter quietly failed).
import { getModelFor } from './modelRegistry.js';
const MODEL_NOW = () => process.env.DND_BETA_MODEL || getModelFor('library') || 'gemini-3.5-flash-lite';
// the least thinking each model allows: the Lite models refuse a zero budget
const quick = (model) => (/lite/i.test(model) ? undefined : { thinkingBudget: 0 }); // Lite: left to its default (no thinking); a 'low' level spent the whole allowance thinking
const ASK_NOW = () => process.env.DND_BETA_ASK_MODEL || getModelFor('campaigns') || 'gemini-3.8-flash';

// 29 Oct 2026, Simon: "can the generated text be more thematic and expand on what is provided by the rulebook, make it
// feel like a story being told ... 'fountain still trickling water is at the center of the room' is a bit boring".
const SYSTEM = `You are Rindewind, an old wizard-chronicler, telling a survivor's descent through Ker Nethalas: the drowned necropolis beneath Veldonia, built by the dead Vaelorian Ascendancy, where necromancy still seeps from the stone.
You are telling a story aloud, in rich, dark, grave British English, in the second person and the present tense, wholly inside that world.
Take the facts given and make them live: build on the book's words with what the survivor sees, hears, smells and feels, how the place bears on their body and nerve, and a hint of the history or dread behind it. Vary how you begin; never open with "You enter" or with a bare inventory of the room, and never write a flat statement like "a fountain is at the centre of the room".
Write as long as the moment asks for (you are told how long). Never change or contradict the facts, and never add creatures, items, treasure, harm, exits or numbers that are not given.
Never mention dice, rolls, checks, tables, points, levels or any game term. No lists, no headings, no quotation marks.`;

export async function dressScene({ title = '', book = '', tags = [], kind = 'room', overseer = '', light = null, hint = '', hero = null, before = '' } = {}) {
  const facts = [
    kind === 'event' || kind === 'roll' ? `What happens: ${String(title).slice(0, 80)}.` : `Place: ${kind === 'corridor' ? 'a corridor' : 'a chamber'} called "${String(title).slice(0, 60)}".`,
    book ? `The book says: ${String(book).slice(0, 700)}` : '',
    hero?.name ? `The survivor: ${String(hero.name).slice(0, 40)}${hero.state ? `, ${String(hero.state).slice(0, 160)}` : ''}.` : '',
    before ? `Told just before (do not repeat it): ${String(before).slice(0, 300)}` : '',
    tags.length ? `Seen here: ${tags.slice(0, 3).join(', ')}.` : '',
    overseer ? `A ruling horror of this Domain: ${overseer}.` : '',
    light != null ? (Number(light) <= 3 ? 'The torch is nearly spent.' : '') : '',
    // how long: a new place is told in full (Simon, 29 Oct: "it's not very descriptive and should expand on the basic
    // description given in the rulebook"); the outcome of a roll briefly, to keep play moving
    kind === 'room' || kind === 'corridor' || !kind ? 'Length: four or five sentences, 90 to 130 words. Open the place up: what the light shows first, what lies in the corners, what it smells and sounds like, what it does to the survivor, and the old story the place hints at.' : '',
    hint ? String(hint).slice(0, 300) : '',
  ].filter(Boolean).join('\n');
  const model = new GoogleGenerativeAI(config.geminiApiKey).getGenerativeModel({
    model: MODEL_NOW(),
    systemInstruction: SYSTEM,
    generationConfig: { temperature: 0.95, maxOutputTokens: 1200, thinkingConfig: quick(MODEL_NOW()) },
  });
  const res = await model.generateContent(`Tell this moment of the story.\n${facts}`);
  return String(res.response.text() || '').replace(/\s+/g, ' ').replace(/^["“]|["”]$/g, '').trim();
}

const RULE_Q = /\b(rule|rules|how (do|does|can|is)|what happens|can i|am i allowed|explain|what is|what's|what does|mean|work)\b/i;
const MOODS = ['neutral', 'joy', 'amazement', 'suspicious', 'sad', 'fear'];

// mode: 'rule' | 'advice' | 'recap' | 'free' (free decides between a rule and advice from the question)
export async function askRindewind({ question = '', mode = 'free', context = {} } = {}) {
  const q = String(question).trim().slice(0, 600);
  if (!q) throw new Error('Ask him something');
  const asRule = mode === 'rule' || (mode === 'free' && RULE_Q.test(q));
  if (asRule) {
    const ruleset = getRuleset('ker-nethalas');
    if (ruleset) {
      const r = await askRules(ruleset, q);
      return { answer: r.answer, mood: 'neutral', sources: r.sources || [], kind: 'rule' };
    }
  }
  const ctx = [
    context.hero ? `THE SURVIVOR: ${context.hero}` : '',
    context.place ? `WHERE: ${context.place}` : '',
    context.state ? `THE SITUATION: ${context.state}` : '',
    context.options ? `WHAT HE CAN DO NOW: ${context.options}` : '',
    context.recent ? `WHAT HAS HAPPENED LATELY:\n${context.recent}` : '',
  ].filter(Boolean).join('\n');
  const model = new GoogleGenerativeAI(config.geminiApiKey).getGenerativeModel({
    model: ASK_NOW(),
    systemInstruction: `You are Rindewind, an old wizard-chronicler sitting across the table from Simon as the Dungeon Master of his solo game of Ker Nethalas: Into the Midnight Throne. He is asking you something out of character.
Answer in plain British English, warmly and briefly (under 120 words). Use the game's real terms and numbers from the situation given; never invent rules, creatures or items. If you would be guessing about a rule, say so and suggest he asks it as a rules question. ${mode === 'recap' ? 'Give a short recap of the story so far, as a chronicler would.' : 'If he asks what to do, weigh the options he has with their risks, and give one clear recommendation.'}`,
    generationConfig: { temperature: 0.6, maxOutputTokens: 400, thinkingConfig: quick(ASK_NOW()), responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: { answer: { type: 'STRING' }, mood: { type: 'STRING', enum: MOODS } }, required: ['answer'] } },
  });
  const res = await model.generateContent(`${ctx}\n\nHE ASKS: ${q}`);
  let out = {}; try { out = JSON.parse(res.response.text()); } catch { out = { answer: res.response.text() }; }
  return { answer: String(out.answer || '').trim(), mood: MOODS.includes(out.mood) ? out.mood : 'neutral', sources: [], kind: mode === 'recap' ? 'recap' : 'advice' };
}

// The books in the D&D folder, folder by folder, for the beta's library. A listing only: nothing is read or indexed.
let libCache = null;
export function libraryListing() {
  if (libCache && Date.now() - libCache.at < 10 * 60 * 1000) return libCache.data;
  const out = { folders: [], files: [] };
  const walk = (dir, rel, depth, acc) => {
    let entries = []; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (depth < 4) walk(path.join(dir, e.name), r, depth + 1, acc); }
      else if (/\.(pdf|zip|epub)$/i.test(e.name)) acc.push({ rel: r, name: e.name });
    }
  };
  let top = []; try { top = fs.readdirSync(DND_BOOKS_ROOT, { withFileTypes: true }); } catch { /* the drive is not mounted */ }
  for (const e of top) {
    if (e.isDirectory()) { const files = []; walk(path.join(DND_BOOKS_ROOT, e.name), '', 1, files); out.folders.push({ name: e.name, files }); }
    else if (/\.pdf$/i.test(e.name)) out.files.push({ rel: e.name, name: e.name });
  }
  libCache = { at: Date.now(), data: out };
  return out;
}

// Who the survivor is now: Rindewind's account of how the campaign has marked them, and a line in their own voice
export async function reflectHero({ context = {} } = {}) {
  const facts = [
    context.ended ? `THE END: ${context.ended}` : '', context.hero ? `THE SURVIVOR: ${context.hero}` : '', context.backstory ? `WHO THEY WERE: ${context.backstory}` : '', context.goals ? `WHAT THEY WANT: ${context.goals}` : '',
    context.marks ? `MARKS OF THE ROAD:\n${context.marks}` : '', context.place ? `WHERE THEY ARE: ${context.place}` : '', context.recent ? `LATELY:\n${String(context.recent).slice(0, 2500)}` : '',
  ].filter(Boolean).join('\n');
  const model = new GoogleGenerativeAI(config.geminiApiKey).getGenerativeModel({
    model: ASK_NOW(),
    systemInstruction: `You are Rindewind, an old wizard-chronicler, writing about a survivor in the necropolis of Ker Nethalas as the campaign has left them.
Use only the facts given: their wounds, their mind, what they have faced, who they were. Never invent events, items or people. British English, wholly in the world, no game terms or numbers.
"portrait": two short paragraphs (at most 120 words in all), present tense, third person: how they look now and how the road has changed them inside.
"feeling": one or two sentences in their own voice and manner, about how they feel right now.
"mood": one word for their state of mind.
If THE END is given, the survivor is dead (or lost): say so plainly. Write the portrait as they lie now, at the place and by the hand that ended them, and how the road brought them there; "feeling" is their last thought before the end, in their own voice; "mood" is a word for that ending.`,
    generationConfig: { temperature: 0.8, maxOutputTokens: 500, thinkingConfig: quick(ASK_NOW()), responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: { portrait: { type: 'STRING' }, feeling: { type: 'STRING' }, mood: { type: 'STRING' } }, required: ['portrait', 'feeling', 'mood'] } },
  });
  const res = await model.generateContent(facts || 'A survivor with no story yet.');
  let out = {}; try { out = JSON.parse(res.response.text()); } catch { out = { portrait: res.response.text() }; }
  return { portrait: String(out.portrait || '').trim(), feeling: String(out.feeling || '').trim(), mood: String(out.mood || '').trim().toLowerCase() };
}

// Creature pictures Simon gives the beta (pasted or uploaded on a bestiary card), kept in data/dnd_creature_art
const ART_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'dnd_creature_art');
const artSlug = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
export function saveCreatureArt({ name, image } = {}) {
  const slug = artSlug(name); if (!slug) throw new Error('Which creature?');
  const m = String(image || '').match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  if (!m) throw new Error('That is not a picture (PNG, JPEG or WebP).');
  const buf = Buffer.from(m[2], 'base64'); if (buf.length > 8 * 1024 * 1024) throw new Error('That picture is too large (8 MB at most).');
  fs.mkdirSync(ART_DIR, { recursive: true });
  for (const ext of ['png', 'jpg', 'webp']) { try { fs.unlinkSync(path.join(ART_DIR, `${slug}.${ext}`)); } catch { /* none */ } }
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  fs.writeFileSync(path.join(ART_DIR, `${slug}.${ext}`), buf);
  return { slug, url: `/api/dnd/beta/creature-art/${slug}?v=${Date.now()}` };
}
export function creatureArtFile(slug) {
  const s = artSlug(slug);
  for (const ext of ['png', 'jpg', 'webp']) { const f = path.join(ART_DIR, `${s}.${ext}`); if (fs.existsSync(f)) return f; }
  return null;
}


// The Chronicle, told as a story (29 Oct 2026, Simon: "the chronicle really should read out more like a story, rather
// than a literal summary of rolls"): one place at a time, from what happened there, wholly in-world (no game terms,
// no real names), past tense, as the chronicler of the necropolis would write it in his book.
const TALE = `You are Rindewind, chronicler of the drowned necropolis of Ker Nethalas beneath Veldonia, writing in your great book the tale of one survivor's descent.
Write in dark, measured British English, in the past tense and always the third person: never address the survivor as "you". Tell what the place was like, what befell the survivor there, and how they bore it, in the order it happened.
Turn every outcome into story: a fight becomes blows struck and taken, a failed attempt becomes a slip or a fright, coin found glints in the muck, wounds become pain and blood. Never name dice, rolls, checks, tables, points, levels, experience, abilities or any game term, and never a real-world name.
Keep strictly to the facts given. Never invent an outcome: a fight that has not ended in these facts has not ended, and a creature is dead only if the facts say it was destroyed or slain. Do not add events, foes or finds that are not in the facts.
Prefer clear, concrete sentences to piled adjectives: one sharp image is worth three. Vary your words: use any striking phrase (weeping, drowned, timeless dark and the like) at most once in a chapter, and never repeat the chapter before's phrasing. Write possessives properly (George's, not George his). Never use the words critical, initiative, misstep, doubled, rally or parry: show the thing instead (a blow that lands true, the first to move, a foot slipping on wet stone).
Two or three paragraphs, 180 to 350 words. No headings, no lists, no quotation marks.`;
// ending: 'dead', 'mad' or 'rot' when this is the tale's last page (30 Oct 2026: the Chronicle closes with the hero's end)
const ENDINGS = { dead: 'died there, struck down', mad: 'was lost there to madness', rot: 'was taken there by the Rot and became one more horror of the halls' };
export async function tellChapter({ hero = '', place = '', facts = [], before = '', ending = null } = {}) {
  const model = new GoogleGenerativeAI(config.geminiApiKey).getGenerativeModel({
    model: MODEL_NOW(), systemInstruction: TALE,
    generationConfig: { temperature: 0.85, maxOutputTokens: 2400, thinkingConfig: quick(MODEL_NOW()) },
  });
  const lines = (Array.isArray(facts) ? facts : []).slice(0, 40).map((f) => `- ${String(f).slice(0, 320)}`).join('\n');
  const res = await model.generateContent(`The survivor: ${String(hero).slice(0, 60)}.\nThe place: ${String(place).slice(0, 80)}.\n${before ? `The chapter before ended: ${String(before).slice(-300)}\n` : ''}What happened there, in order:\n${lines}\n\n${ENDINGS[ending] ? `This is the last page of the tale: the survivor ${ENDINGS[ending]}. The chapter before has already told the fight; do not retell it. Begin where it ended and write only the final moments, 120 to 200 words: how the end came, in the same voice, and a last line that closes the tale for good. Do not soften it, and do not promise a return.` : 'Write this chapter.'}`);
  const first = String(hero).trim().split(/\s+/)[0].replace(/[^A-Za-z'-]/g, '');
  let text = String(res.response.text() || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (first) text = text.replace(new RegExp(`\\b(${first}(?: the \\w+)?) his\\b`, 'g'), "$1's"); // the small model's "George his leg"
  return text;
}
