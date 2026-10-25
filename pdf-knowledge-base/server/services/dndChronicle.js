// The D&D Solo chronicle as a book (25 Oct 2026, Simon: "if the chronicle book could look and function exactly like how
// it is in the LOTR LCG campaign with pages, illustrations etc."). The page shows the very same book
// (Dashboard/Chronicle.jsx); this answers it the way campaignsService answers it for the LOTR campaigns: a chapter for
// every six turns of play, written by Rindewind wholly in-world (no rolls, stats or game terms), each with a pen-and-ink
// plate and a reading in the Chronicler's voice, made in the background. A chapter can be edited by hand, locked,
// re-titled or rewritten; one whose turns change (an undo, more play) is rewritten unless edited or locked.
import crypto from 'crypto';
import db from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI } from './geminiClient.js';
import { getModelFor } from './modelRegistry.js';
import { getCampaign, getRuleset } from './dndSoloService.js';

db.exec(`CREATE TABLE IF NOT EXISTS dnd_chapters (
  campaign_id TEXT NOT NULL, name TEXT NOT NULL, title TEXT, summary TEXT, paragraphs_json TEXT, key TEXT,
  edited INTEGER DEFAULT 0, locked INTEGER DEFAULT 0, take INTEGER DEFAULT 0, art_take INTEGER DEFAULT 0, art_custom TEXT,
  updated_at INTEGER, PRIMARY KEY (campaign_id, name)
)`);

const PER_CHAPTER = 6;
const NUMBER_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
const writing = new Set();

// the turns of each chapter: chapter 1 is the opening and the first five moves, then six moves a chapter
function blocks(c) {
  const out = new Map();
  for (const t of c.turns || []) {
    const n = String(Math.floor(t.turn_number / PER_CHAPTER) + 1);
    if (!out.has(n)) out.set(n, []);
    out.get(n).push(t);
  }
  return out;
}
const keyOf = (turns) => crypto.createHash('sha1').update(turns.map((t) => `${t.id}:${t.dm_narrative.length}`).join('|')).digest('hex').slice(0, 16);

function chaptersOf(id) {
  const rows = db.prepare('SELECT * FROM dnd_chapters WHERE campaign_id = ?').all(id);
  return Object.fromEntries(rows.map((r) => {
    let paragraphs = [];
    try { paragraphs = JSON.parse(r.paragraphs_json || '[]'); } catch { /* none */ }
    return [r.name, { title: r.title, summary: r.summary, paragraphs, key: r.key, edited: Boolean(r.edited), locked: Boolean(r.locked), take: r.take || 0, artTake: r.art_take || 0, artCustom: r.art_custom || null }];
  }));
}
function saveChapter(id, name, ch) {
  db.prepare(`INSERT INTO dnd_chapters (campaign_id, name, title, summary, paragraphs_json, key, edited, locked, take, art_take, art_custom, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(campaign_id, name) DO UPDATE SET title = excluded.title, summary = excluded.summary, paragraphs_json = excluded.paragraphs_json, key = excluded.key,
      edited = excluded.edited, locked = excluded.locked, take = excluded.take, art_take = excluded.art_take, art_custom = excluded.art_custom, updated_at = excluded.updated_at`)
    .run(id, name, ch.title || '', ch.summary || '', JSON.stringify(ch.paragraphs || []), ch.key || '', ch.edited ? 1 : 0, ch.locked ? 1 : 0, ch.take || 0, ch.artTake || 0, ch.artCustom || null, Date.now());
}

const heroLine = (c) => (c.character ? `${c.character.name}${c.character.role_or_class ? `, ${c.character.role_or_class}` : ''}` : 'the wanderer');

// what a chapter's plate shows (the LOTR book's art pipeline, in plain ink rather than Middle-earth's)
function artSource(c, name, ch) {
  const turns = blocks(c).get(name) || [];
  const place = [...new Set(turns.map((t) => t.scene_state?.scene_title).filter(Boolean))].slice(-2).join('; ');
  return { scene: ch.summary || ch.title, place, heroes: [heroLine(c)], fallen: [], style: 'ink', world: c.ruleset_name || '', custom: ch.artCustom || null, take: ch.artTake || 0 };
}

export function chronicleStatus(id) {
  const c = getCampaign(id);
  if (!c) return null;
  const bl = blocks(c);
  const order = [...bl.keys()];
  const chapters = Object.fromEntries(Object.entries(chaptersOf(id)).filter(([n]) => /^\d+$/.test(n)));
  const changed = (n) => chapters[n] && chapters[n].key !== keyOf(bl.get(n));
  const stale = order.filter((n) => !chapters[n] || (changed(n) && !chapters[n].edited && !chapters[n].locked));
  const outdated = order.filter((n) => chapters[n]?.edited && !chapters[n].locked && changed(n));
  const art = {}, artBrief = {};
  return import('./decks/chronicleArt.js').then(({ artReady, artBrief: brief }) => {
    for (const n of order) {
      if (!chapters[n]) continue;
      const src = artSource(c, n, chapters[n]);
      const key = artReady(src);
      if (key) art[n] = `/api/decks/campaigns/chronicle-art/${key}`;
      artBrief[n] = chapters[n].artCustom || brief(src);
    }
    return { writing: writing.has(id), order, chapters, stale, outdated, art, artBrief, fallen: [] };
  });
}

async function writeOne(c, name, previous) {
  const turns = blocks(c).get(name) || [];
  const ruleset = getRuleset(c.ruleset_id);
  const world = ruleset?.metadata?.genre || c.genre || '';
  const told = turns.map((t) => `${t.turn_number ? `${c.character?.name || 'The hero'} chose: ${t.player_action}\n` : ''}${t.dm_narrative}`).join('\n\n');
  const model = new GoogleGenerativeAI(config.geminiApiKey).getGenerativeModel({
    model: getModelFor('campaigns') || 'gemini-2.5-flash',
    generationConfig: { temperature: 0.85, maxOutputTokens: 6000, responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { title: { type: 'STRING' }, summary: { type: 'STRING' }, paragraphs: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['title', 'summary', 'paragraphs'] } },
  });
  const res = await model.generateContent(`You are Rindewind, an ancient chronicler, setting down in a bound chronicle the deeds of ${heroLine(c)} in a ${world || 'perilous'} world (${c.ruleset_name || 'a tale of adventure'}${c.title ? `, "${c.title}"` : ''}).
Write ONE chapter of the chronicle from what happened below - WHOLLY IN-WORLD: never mention dice, rolls, checks, hit points, turns, options, players, rules or anything of a game. Third person, past tense, in a voice true to that world and its genre, rich but clear; keep every real event, name and consequence, and give the hero's choices weight. Length: 4-6 paragraphs, 280-420 words.
Also give: a short, evocative chapter title (two to seven words, not "Chapter ..."), and a one-sentence summary (under 30 words) of what the chapter shows, for its illustration.
${previous ? `THE PREVIOUS CHAPTER ENDED: ${previous.slice(-500)}` : 'This is the first chapter - open the chronicle.'}

WHAT HAPPENED:
${told}`);
  const out = JSON.parse(res.response.text());
  return { title: String(out.title || '').trim().slice(0, 120), summary: String(out.summary || '').trim().slice(0, 300), paragraphs: (out.paragraphs || []).map((p) => String(p).trim()).filter(Boolean).slice(0, 12) };
}

// Write the missing and changed chapters (in the background), then their plates and readings
export async function writeChronicle(id) {
  const s = await chronicleStatus(id);
  if (!s) throw new Error('Campaign not found');
  if (!writing.has(id) && s.stale.length) {
    writing.add(id);
    (async () => {
      try {
        const c = getCampaign(id);
        for (const n of s.stale) {
          const all = chaptersOf(id);
          const prevName = String(Number(n) - 1);
          const ch = await writeOne(c, n, all[prevName]?.paragraphs?.join('\n\n') || '');
          saveChapter(id, n, { ...(all[n] || {}), ...ch, key: keyOf(blocks(c).get(n)), edited: false });
        }
      } catch (err) { console.warn('[DndChronicle] writing failed:', err.message); } finally { writing.delete(id); }
      prepare(id);
    })();
  }
  return { ...(await chronicleStatus(id)), writing: writing.has(id) };
}

// plates and readings, one at a time, so the book shows them and the narrator plays at once
let queue = Promise.resolve();
function prepare(id) {
  queue = queue.then(async () => {
    const c = getCampaign(id);
    if (!c) return;
    const { artAndWait } = await import('./decks/chronicleArt.js');
    const { narrateAndWait } = await import('./decks/chronicleVoice.js');
    const chapters = Object.fromEntries(Object.entries(chaptersOf(id)).filter(([n]) => /^\d+$/.test(n)));
    for (const n of Object.keys(chapters)) { try { await artAndWait(artSource(c, n, chapters[n])); } catch (err) { console.warn(`[DndChronicle] plate ${n}: ${err.message}`); } }
    for (const n of ['__intro', ...Object.keys(chapters)]) { try { await narrateAndWait(chapterForReading(id, n)); } catch (err) { console.warn(`[DndChronicle] reading ${n}: ${err.message}`); } }
  }).catch(() => {});
}

export function chapterForReading(id, name) {
  const c = getCampaign(id);
  if (!c) throw new Error('Campaign not found');
  if (name === '__intro') {
    let take = 0;
    try { take = chaptersOf(id).__intro?.take || 0; } catch { /* none */ }
    return { heading: `Here beginneth the Chronicle of ${c.title}`, paragraphs: [`Being a tale of ${c.ruleset_name || 'adventure'}.`, `Of ${heroLine(c)}.`, 'Set down by Rindewind, from the telling.'], take, game: 'lotr' };
  }
  const ch = chaptersOf(id)[name];
  if (!ch) throw new Error('That chapter is not written yet.');
  return { heading: `Chapter ${NUMBER_WORDS[Number(name)] || name}. ${ch.title}`, paragraphs: ch.paragraphs, take: ch.take || 0, game: 'lotr' };
}

const mustBe = (id, name, { unlocked = true } = {}) => {
  const ch = chaptersOf(id)[name];
  if (!ch) { const e = new Error('That chapter is not written yet.'); e.status = 404; throw e; }
  if (unlocked && ch.locked) { const e = new Error('That chapter is locked - unlock it first.'); e.status = 409; throw e; }
  return ch;
};

export async function editChapter(id, name, { title, summary, paragraphs }) {
  const ch = mustBe(id, name);
  const paras = (Array.isArray(paragraphs) ? paragraphs : String(paragraphs || '').split(/\n\s*\n/)).map((x) => String(x).trim()).filter(Boolean).slice(0, 30);
  if (!paras.length) throw new Error('The chapter is empty.');
  saveChapter(id, name, { ...ch, title: String(title || ch.title).slice(0, 120), summary: String(summary ?? ch.summary).slice(0, 300), paragraphs: paras, edited: true, key: keyOf(blocks(getCampaign(id)).get(name) || []) });
  prepare(id);
  return chronicleStatus(id);
}
export function lockChapter(id, name, locked) {
  const ch = mustBe(id, name, { unlocked: false });
  saveChapter(id, name, { ...ch, locked: Boolean(locked) });
  return chronicleStatus(id);
}
export function rewriteChapter(id, name) {
  mustBe(id, name);
  db.prepare('DELETE FROM dnd_chapters WHERE campaign_id = ? AND name = ?').run(id, name);
  return writeChronicle(id);
}
export async function suggestTitle(id, name, { title, text }) {
  const body = String(text || '').trim().slice(0, 6000);
  if (!body) throw new Error('The chapter is empty.');
  const c = getCampaign(id);
  const model = new GoogleGenerativeAI(config.geminiApiKey).getGenerativeModel({ model: getModelFor('campaigns') || 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json', temperature: 1, responseSchema: { type: 'OBJECT', properties: { title: { type: 'STRING' } }, required: ['title'] } } });
  const out = JSON.parse((await model.generateContent(`You title the chapters of a chronicle of ${heroLine(c)} (${c?.ruleset_name || 'an adventure'}). Give ONE new title for the chapter below: two to seven words, evocative and wholly in-world - no game terms.${title ? ` Different from "${title}".` : ''}\n\nTHE CHAPTER:\n${body}`)).response.text());
  return { title: String(out.title || '').replace(/^["']|["']$/g, '').trim().slice(0, 120) || title };
}
export async function newReadingTake(id, name) {
  const { forgetReading, narrate } = await import('./decks/chronicleVoice.js');
  forgetReading(chapterForReading(id, name));
  if (name === '__intro') {
    const cur = chaptersOf(id).__intro;
    saveChapter(id, '__intro', { ...(cur || {}), title: '', paragraphs: [], take: (cur?.take || 0) + 1 });
  } else {
    const ch = mustBe(id, name, { unlocked: false });
    saveChapter(id, name, { ...ch, take: (ch.take || 0) + 1 });
  }
  return narrate(chapterForReading(id, name));
}
export async function newPicture(id, name, prompt) {
  const ch = mustBe(id, name, { unlocked: false });
  saveChapter(id, name, { ...ch, artTake: (ch.artTake || 0) + 1, artCustom: prompt == null ? ch.artCustom : (String(prompt).trim() || null) });
  const c = getCampaign(id);
  const { artAndWait } = await import('./decks/chronicleArt.js');
  artAndWait(artSource(c, name, chaptersOf(id)[name])).catch((err) => console.warn(`[DndChronicle] plate ${name}: ${err.message}`));
  return chronicleStatus(id);
}
