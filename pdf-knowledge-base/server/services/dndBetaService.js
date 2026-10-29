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

const MODEL = process.env.DND_BETA_MODEL || 'gemini-2.5-flash-lite';
const ASK_MODEL = process.env.DND_BETA_ASK_MODEL || 'gemini-2.5-flash';

const SYSTEM = `You are Rindewind, an old wizard-chronicler, telling a solo crawl through Ker Nethalas, a drowned necropolis of the dead Vaelorian Ascendancy.
Write plain, grave British English in the second person, wholly in the world. One or two sentences, at most 45 words.
Add one sensory detail (smell, sound, cold, light) that fits the facts given. Never change or contradict the facts, and never add creatures, items, numbers or exits that are not given.
Never mention dice, rolls, checks, tables, points or any game term. No lists, no headings, no quotation marks.`;

export async function dressScene({ title = '', book = '', tags = [], kind = 'room', overseer = '', light = null, hint = '' } = {}) {
  const facts = [
    `Place: ${kind === 'corridor' ? 'a corridor' : 'a chamber'} called "${String(title).slice(0, 60)}".`,
    book ? `The book says: ${String(book).slice(0, 400)}` : '',
    tags.length ? `Seen here: ${tags.slice(0, 3).join(', ')}.` : '',
    overseer ? `A ruling horror of this Domain: ${overseer}.` : '',
    light != null ? (Number(light) <= 3 ? 'The torch is nearly spent.' : '') : '',
    hint ? String(hint).slice(0, 200) : '',
  ].filter(Boolean).join('\n');
  const model = new GoogleGenerativeAI(config.geminiApiKey).getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM,
    generationConfig: { temperature: 0.9, maxOutputTokens: 120, thinkingConfig: { thinkingBudget: 0 } },
  });
  const res = await model.generateContent(`Dress this scene.\n${facts}`);
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
    model: ASK_MODEL,
    systemInstruction: `You are Rindewind, an old wizard-chronicler sitting across the table from Simon as the Dungeon Master of his solo game of Ker Nethalas: Into the Midnight Throne. He is asking you something out of character.
Answer in plain British English, warmly and briefly (under 120 words). Use the game's real terms and numbers from the situation given; never invent rules, creatures or items. If you would be guessing about a rule, say so and suggest he asks it as a rules question. ${mode === 'recap' ? 'Give a short recap of the story so far, as a chronicler would.' : 'If he asks what to do, weigh the options he has with their risks, and give one clear recommendation.'}`,
    generationConfig: { temperature: 0.6, maxOutputTokens: 400, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json',
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
    context.hero ? `THE SURVIVOR: ${context.hero}` : '', context.backstory ? `WHO THEY WERE: ${context.backstory}` : '', context.goals ? `WHAT THEY WANT: ${context.goals}` : '',
    context.marks ? `MARKS OF THE ROAD:\n${context.marks}` : '', context.place ? `WHERE THEY ARE: ${context.place}` : '', context.recent ? `LATELY:\n${String(context.recent).slice(0, 2500)}` : '',
  ].filter(Boolean).join('\n');
  const model = new GoogleGenerativeAI(config.geminiApiKey).getGenerativeModel({
    model: ASK_MODEL,
    systemInstruction: `You are Rindewind, an old wizard-chronicler, writing about a survivor in the necropolis of Ker Nethalas as the campaign has left them.
Use only the facts given: their wounds, their mind, what they have faced, who they were. Never invent events, items or people. British English, wholly in the world, no game terms or numbers.
"portrait": two short paragraphs (at most 120 words in all), present tense, third person: how they look now and how the road has changed them inside.
"feeling": one or two sentences in their own voice and manner, about how they feel right now.
"mood": one word for their state of mind.`,
    generationConfig: { temperature: 0.8, maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json',
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
