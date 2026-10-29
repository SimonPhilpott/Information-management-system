// The D&D Solo DM's knowledge of Simon's own books (25 Oct 2026, Simon: "they don't reflect the whole scope of possible
// D&D solo games I would want to run. Maybe they need to be indexed ... then use that index to further improve the D&D
// Solo DM service"). The books are indexed by the library's own sync (Drive -> documents -> vectors), like every other
// PDF. This reads that index:
//   - discoverSystems(): every RPG / solo game in the library, grouped into game systems (a Gemini pass over the
//     filenames and folders), each then studied from its own rulebook passages - core mechanic, how solo play works,
//     character creation, a starting hero, its random tables and three adventure hooks, with the pages they came from.
//   - searchRules(): the passages of a system's books that bear on a moment of play (the DM reads them every turn).
//   - askRules(): a rules question answered from the books, with pages.
//   - rollHero(): a starting hero made by the book's own character creation.
import crypto from 'crypto';
import db from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI } from './geminiClient.js';
import { getModelFor } from './modelRegistry.js';
import { generateQueryEmbedding } from './embeddingService.js';
import { searchSimilar } from './vectorStore.js';
import { generateHeroAvatar } from './dndAvatarService.js';

const slug = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const ATMOSPHERES = ['dungeon', 'campfire', 'tavern', 'scifi', 'storm'];

const json = async (prompt, schema, temperature = 0.4, maxOutputTokens = 8000) => {
  const model = new GoogleGenerativeAI(config.geminiApiKey).getGenerativeModel({
    model: getModelFor('campaigns') || 'gemini-2.5-flash',
    generationConfig: { temperature, maxOutputTokens, responseMimeType: 'application/json', responseSchema: schema },
  });
  const res = await model.generateContent(prompt);
  return JSON.parse(res.response.text());
};

// The solo games Simon wants to play: the books in BOOKS/D&D (25 Oct 2026: "the only games that I want to play solo D&D with are in the D&D folder")
export function rpgDocuments() {
  return db.prepare(`
    SELECT drive_file_id AS id, filename, folder_path AS folder, page_count AS pages, indexed
    FROM documents
    WHERE (folder_path = 'D&D' OR folder_path LIKE 'D&D /%')
      -- held back until Simon says (25 Oct 2026: "make sure it's all functional before you do anything with Warhammer
      -- Fantasy and D&D 5E")
      AND folder_path NOT LIKE 'D&D / D&D 5E%' AND folder_path NOT LIKE 'D&D / Warhammer%'
    ORDER BY folder_path, filename
  `).all();
}

export function rulesetFiles(ruleset) {
  const ids = (ruleset?.metadata?.files || []).map((f) => f.id).filter(Boolean);
  if (!ids.length) return [];
  const docs = db.prepare(`SELECT drive_file_id AS id, filename, indexed, page_count AS pages FROM documents WHERE drive_file_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  return docs;
}

// ---- searching a system's books --------------------------------------------------------------------------------------

// onlyIds: the books in play in this adventure (its core rules plus the expansions and settings chosen for it)
export async function searchRules(ruleset, query, k = 5, onlyIds = null) {
  const allow = Array.isArray(onlyIds) && onlyIds.length ? new Set(onlyIds) : null;
  const ids = rulesetFiles(ruleset).filter((d) => d.indexed === 1 && (!allow || allow.has(d.id))).map((d) => d.id);
  if (!ids.length || !String(query || '').trim()) return [];
  try {
    const e = await generateQueryEmbedding(String(query).slice(0, 1500));
    const hits = await searchSimilar(e, [], k, true, ids);
    return hits.map((h) => ({ id: h.driveFileId, book: String(h.filename || '').replace(/\.pdf$/i, ''), page: h.pageNum, text: String(h.text || '').replace(/\s+/g, ' ').trim().slice(0, 900), score: h.similarity }));
  } catch (err) {
    console.warn('[DndLibrary] rules search failed:', err.message);
    return [];
  }
}

export const passagesText = (ps) => ps.map((p, i) => `[${i + 1}] ${p.book}, page ${p.page}:\n${p.text}`).join('\n\n');

// ---- discovering and studying the systems ----------------------------------------------------------------------------

const PROFILE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    tagline: { type: 'STRING' },
    genre: { type: 'STRING' },
    description: { type: 'STRING' },
    dice_system: { type: 'STRING' },
    core_mechanic: { type: 'STRING' },
    solo_play: { type: 'STRING' },
    character_creation: { type: 'STRING' },
    hp_label: { type: 'STRING' },
    defence_label: { type: 'STRING' },
    character_template: {
      type: 'OBJECT',
      properties: {
        role_or_class: { type: 'STRING' }, hp: { type: 'INTEGER' }, ac: { type: 'INTEGER' },
        attributes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, value: { type: 'INTEGER' } }, required: ['name', 'value'] } },
        inventory: { type: 'ARRAY', items: { type: 'STRING' } },
        skills: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['role_or_class', 'hp', 'ac', 'attributes', 'inventory', 'skills'],
    },
    tables: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, dice: { type: 'STRING' }, page: { type: 'INTEGER' } }, required: ['name'] } },
    premises: { type: 'ARRAY', items: { type: 'STRING' } },
    atmosphere: { type: 'STRING', enum: ATMOSPHERES },
    check_dice: { type: 'STRING' },
    resolution: { type: 'STRING', enum: ['d20', 'd100-under', 'd6-pool', 'ironsworn', 'sum'] },
    pool_success: { type: 'INTEGER' },
    moves: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, stat: { type: 'STRING' }, trigger: { type: 'STRING' }, page: { type: 'INTEGER' } }, required: ['name'] } },
    progress_tracks: { type: 'BOOLEAN' },
    trackers: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, min: { type: 'INTEGER' }, max: { type: 'INTEGER' }, start: { type: 'INTEGER' }, about: { type: 'STRING' } }, required: ['name', 'min', 'max', 'start'] } },
    books_notes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { n: { type: 'INTEGER' }, adds: { type: 'STRING' } }, required: ['n', 'adds'] } },
  },
  required: ['name', 'tagline', 'genre', 'description', 'dice_system', 'core_mechanic', 'solo_play', 'character_creation', 'hp_label', 'defence_label', 'character_template', 'premises', 'atmosphere', 'check_dice', 'resolution', 'trackers'],
};

const job = { active: false, phase: '', done: 0, total: 0, current: '', error: null, finishedAt: null };
export const discoveryStatus = () => ({ ...job });

const TOPICS = [
  'moves: the list of moves or basic actions, their triggers and the stat each one rolls',
  'progress tracks, vows, journeys and combat progress: ranks and marking progress',
  'core rules: how to resolve an action, roll dice, success and failure',
  'solo play: playing alone, the oracle, asking questions, random events',
  'character creation: creating a character, attributes, starting equipment',
  'random tables: encounters, rooms, loot, events to roll on',
  'health, damage, injury, death and recovery',
];

export async function studySystem(rulesetId) {
  const row = db.prepare('SELECT * FROM dnd_rulesets WHERE id = ?').get(rulesetId);
  if (!row) throw new Error('No such game');
  let meta = {};
  try { meta = JSON.parse(row.metadata_json || '{}'); } catch { /* fresh */ }
  const ruleset = { ...row, metadata: meta };
  const passages = [];
  const seen = new Set();
  for (const t of TOPICS) {
    for (const p of await searchRules(ruleset, `${row.name}: ${t}`, 4)) {
      const k = `${p.id}:${p.page}:${p.text.slice(0, 40)}`;
      if (!seen.has(k)) { seen.add(k); passages.push(p); }
    }
  }
  // what each expansion, setting and supplement adds (a few passages of each)
  const extras = (meta.files || []).filter((f) => f.role && !['core', 'sheet'].includes(f.role));
  const extraText = [];
  for (const [i, f] of extras.slice(0, 12).entries()) {
    const ps = await searchRules({ ...ruleset, metadata: { files: [f] } }, `${f.filename}: what this book adds - new rules, setting, options`, 2);
    extraText.push(`(${i + 1}) ${f.role.toUpperCase()}: ${f.filename}${ps.length ? `\n${ps.map((p) => p.text.slice(0, 500)).join('\n')}` : ''}`);
  }
  const grounded = passages.length > 0;
  const profile = await json(`You are preparing an AI Dungeon Master to run SOLO play of the tabletop game "${row.name}" for one player.
${grounded ? `Here are passages from the player's own copies of its books - base everything on them, using the book's own terms, stats and numbers:\n\n${passagesText(passages.slice(0, 22))}` : 'None of its books are indexed yet, so use what you know of the published game - and keep to it; never invent rules.'}

Write the game's profile:
- name: the game's proper name. tagline: one evocative line. genre. description: 2-3 sentences on what playing it is like.
- dice_system: the dice it uses. check_dice: the dice for an ordinary check (e.g. "1d20", "1d100", "2d6", "1d6").
- core_mechanic: how an action is resolved, in 2-4 sentences with the real numbers.
- solo_play: how the game is played solo (its oracle, prompts, tables or deck) - or, if it isn't a solo game, how a DM-less solo session should work with a yes/no oracle.
- character_creation: the book's method, in 2-4 sentences.
- hp_label: what the game calls health (e.g. "HP", "Health", "Wounds"); defence_label: what it calls defence ("AC", "Armour", "Defence"; "Defence" if it has none).
- character_template: a ready-to-play starting hero made by that method: role_or_class, hp, ac (defence; 10 if none), attributes with the game's own stat names and values, starting inventory, skills/abilities.
- tables: the notable random tables in the book (name, dice, page if known).
- premises: three short, distinct adventure hooks in the game's own spirit.
- atmosphere: the soundscape that suits it best.
- resolution: how a check is rolled - "d20" (d20 + modifier against a DC), "d100-under" (roll d100 at or under a stat), "d6-pool" (a pool of d6, successes on high faces - give pool_success, e.g. 6), "ironsworn" (an action die d6 + stat against two d10 challenge dice: strong hit / weak hit / miss), or "sum" (a total of dice + modifier against a target, e.g. 2d6).
- moves: if the game is built on named moves (Ironsworn, Starforged and other Powered by the Apocalypse style games), every core move - name exactly as in the book, the stat(s) it rolls ("edge|heart|iron|shadow|wits" when you choose; "progress" for a progress move), its trigger in a few words, and the page. Otherwise the game's handful of key named actions, or empty.
- progress_tracks: true if the game tracks vows, journeys, fights or other goals on progress tracks.
- trackers: the game's resources and meters beyond health that the sheet must track (e.g. momentum -6..10 starting 2, spirit 0..5, supply 0..5, stress 0..10, sanity, oxygen, morale, gold), each with min, max, start and a few words on what it is. Not health or defence. Empty if none.
${extraText.length ? `- books_notes: for each numbered extra book below, one line on what it adds to the game (n = its number). A SETTING is a different world to play the system in - say which world.\n\nEXTRA BOOKS:\n${extraText.join('\n\n')}` : '- books_notes: empty.'}`, PROFILE_SCHEMA, 0.5);
  const tpl = profile.character_template || {};
  const attributes = Object.fromEntries((tpl.attributes || []).map((a) => [a.name, a.value]));
  const merged = {
    ...meta, ...profile, id: row.id, name: profile.name || row.name,
    character_template: { role_or_class: tpl.role_or_class, hp: tpl.hp, max_hp: tpl.hp, ac: tpl.ac, attributes, inventory: tpl.inventory || [], skills: tpl.skills || [] },
    files: (meta.files || []).map((f) => { const k = extras.indexOf(f); const note = k >= 0 ? (profile.books_notes || []).find((b) => b.n === k + 1) : null; return note ? { ...f, adds: note.adds } : f; }),
    moves: (profile.moves || []).filter((m) => m.name).slice(0, 60),
    trackers: (profile.trackers || []).filter((t) => t.name && !/^(hp|health|hit points|ac|armou?r|defen[cs]e)$/i.test(t.name.trim())).slice(0, 8),
    sources: [...new Map(passages.map((p) => [`${p.id}:${p.page}`, { id: p.id, book: p.book, page: p.page }])).values()].slice(0, 16),
    grounded, studied_at: new Date().toISOString(),
  };
  db.prepare('UPDATE dnd_rulesets SET name = ?, description = ?, genre = ?, dice_system = ?, metadata_json = ?, last_scanned = ? WHERE id = ?')
    .run(merged.name, merged.description, merged.genre, merged.dice_system, JSON.stringify(merged), merged.studied_at, row.id);
  return merged;
}

// Every RPG / solo game in the library as a system (then each studied). Runs in the background; discoveryStatus() reports.
export function startDiscovery({ restudy = false } = {}) {
  if (job.active) return false;
  Object.assign(job, { active: true, phase: 'Reading the library', done: 0, total: 0, current: '', error: null, finishedAt: null });
  (async () => {
    try {
      const docs = rpgDocuments();
      if (!docs.length) throw new Error('No role-playing books are in the library yet - sync the library first.');
      const existing = db.prepare('SELECT id, name FROM dnd_rulesets').all();
      const out = await json(`Below are the PDF files in a player's library of tabletop role-playing and board games (folder | file | id).
Group them into GAME SYSTEMS (one system = one game and its expansions, supplements, sheets and playbooks). Keep only games that can be played as a SOLO role-playing or solo narrative campaign run by a DM or oracle: solo RPGs, RPGs, journaling games, and solo campaign skirmish games with story (e.g. Five Parsecs From Home, Five Leagues from the Borderlands). Leave out pure board games, wargames, card games and the Lord of the Rings / Arkham Horror living card games.
For each system: name (the game's proper name), solo ("built-in solo" if made for solo play, "solo with an oracle" otherwise), every one of its files (by number) with its role, and core (the number of its main rulebook). Roles: "core" (the main rules - more than one if the rules come in several books), "expansion" (adds rules, content or a mode such as delving), "setting" (a different world or genre to play the same system in), "supplement" (extra options, monsters, tables), "adventure" (a scenario or campaign), "sheet" (character sheets, trackers, cards, play aids). A game built on another's system but sold as its own game (e.g. Ironsworn: Starforged) is its own system.
If a system is the same game as one of these existing ids, use that id as existing_id: ${existing.map((e) => `${e.id} (${e.name})`).join('; ')}.

${docs.map((d, i) => `${d.folder} | ${d.filename} | ${i + 1}`).join('\n')}`, {
        type: 'OBJECT',
        properties: { systems: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, solo: { type: 'STRING' }, files: { type: 'ARRAY', items: { type: 'OBJECT', properties: { n: { type: 'INTEGER' }, role: { type: 'STRING', enum: ['core', 'expansion', 'setting', 'supplement', 'adventure', 'sheet'] } }, required: ['n', 'role'] } }, core: { type: 'INTEGER' }, existing_id: { type: 'STRING' } }, required: ['name', 'solo', 'files'] } } },
        required: ['systems'],
      }, 0.2, 30000);
      const byId = new Map(docs.map((d) => [d.id, d]));
      const systems = (out.systems || []).map((s) => ({
        ...s, core: docs[(s.core || 0) - 1]?.id,
        files: (s.files || []).map((f) => ({ id: docs[(f.n || 0) - 1]?.id, role: f.role })).filter((f) => byId.has(f.id)),
      })).filter((s) => s.files.length);
      const upsert = db.prepare(`
        INSERT INTO dnd_rulesets (id, name, path, description, genre, dice_system, books_count, maps_count, sheets_count, metadata_json, last_scanned)
        VALUES (?, ?, 'library', '', '', '', ?, 0, 0, ?, ?)
        ON CONFLICT(id) DO UPDATE SET books_count = excluded.books_count, metadata_json = ?
      `);
      const toStudy = [];
      for (const s of systems) {
        const id = existing.some((e) => e.id === s.existing_id) ? s.existing_id : slug(s.name);
        const row = db.prepare('SELECT metadata_json FROM dnd_rulesets WHERE id = ?').get(id);
        let meta = {};
        try { meta = JSON.parse(row?.metadata_json || '{}'); } catch { /* fresh */ }
        const files = s.files.map((f) => ({ id: f.id, filename: byId.get(f.id).filename, folder: byId.get(f.id).folder, role: f.id === s.core ? 'core' : f.role, core: f.id === s.core || f.role === 'core' }));
        const merged = JSON.stringify({ ...meta, id, files, solo: s.solo, from_library: true });
        upsert.run(id, s.name, files.length, merged, new Date().toISOString(), merged);
        if (restudy || !meta.studied_at) toStudy.push({ id, name: s.name });
      }
      Object.assign(job, { phase: 'Studying the rulebooks', total: toStudy.length });
      for (const s of toStudy) {
        job.current = s.name;
        try { await studySystem(s.id); } catch (err) { console.warn(`[DndLibrary] studying ${s.name} failed:`, err.message); }
        job.done++;
      }
      Object.assign(job, { phase: `Found ${systems.length} games`, current: '' });
    } catch (err) {
      job.error = err.message;
      console.warn('[DndLibrary] discovery failed:', err.message);
    } finally {
      job.active = false; job.finishedAt = new Date().toISOString();
    }
  })();
  return true;
}

// ---- at the table ------------------------------------------------------------------------------------------------------

export async function askRules(ruleset, question) {
  const passages = await searchRules(ruleset, question, 8);
  const out = await json(`A player of "${ruleset.name}" asks a rules question. ${passages.length ? `Answer from these passages of his own books, quoting numbers exactly, and say which passages you used (their [n]). If they don't cover it, say so and give the most likely ruling, clearly marked as such.\n\n${passagesText(passages)}` : 'None of its books are indexed, so answer from your knowledge of the published game and say so.'}

QUESTION: ${question}

Answer in British English, plainly and briefly (under 150 words).`, {
    type: 'OBJECT', properties: { answer: { type: 'STRING' }, used: { type: 'ARRAY', items: { type: 'INTEGER' } } }, required: ['answer'],
  }, 0.2);
  const used = (out.used || []).map((n) => passages[n - 1]).filter(Boolean);
  return { answer: out.answer, sources: (used.length ? used : passages.slice(0, 3)).map(({ id, book, page }) => ({ id, book, page })) };
}

export async function rollHero(ruleset, { name = '', concept = '', details = '', premise = '', referenceImage = null } = {}) {
  const passages = await searchRules(ruleset, `${ruleset.name} character creation: generating attributes, starting equipment, choosing a class or background`, 8);
  const roll = (n, s) => Array.from({ length: n }, () => Math.floor(Math.random() * s) + 1);
  const dice = { d6: roll(12, 6), d10: roll(6, 10), d20: roll(4, 20), d100: roll(6, 100) };
  const out = await json(`Create a starting hero for a SOLO game of "${ruleset.name}" by the book's own character creation.
${passages.length ? `From the player's own rulebook:\n\n${passagesText(passages)}` : 'Use the published rules.'}
${ruleset.metadata?.character_creation ? `The method in brief: ${ruleset.metadata.character_creation}` : ''}
Where the method rolls dice, use these real rolls in order (don't invent your own): d6 ${dice.d6.join(', ')}; d10 ${dice.d10.join(', ')}; d20 ${dice.d20.join(', ')}; d100 ${dice.d100.join(', ')}.
${name ? `Name: ${name}.` : 'Give the hero a fitting name.'} ${concept ? `Concept: ${concept}.` : ''}
${details ? `Physical Appearance & Details: ${details}. Weave these visual traits, features and equipment into the backstory and character description.` : ''}
${premise ? `Opening Situation / Hook: ${premise}. Weave this starting ordeal into the character's background.` : ''}
Use the game's own stat names. hp is their health in the game's terms, ac their defence (10 if the game has none). backstory: 2-3 sentences that hook into the game's world. how: one sentence on how the rolls became the stats.`, {
    type: 'OBJECT',
    properties: {
      name: { type: 'STRING' }, role_or_class: { type: 'STRING' }, hp: { type: 'INTEGER' }, ac: { type: 'INTEGER' },
      attributes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, value: { type: 'INTEGER' } }, required: ['name', 'value'] } },
      inventory: { type: 'ARRAY', items: { type: 'STRING' } }, skills: { type: 'ARRAY', items: { type: 'STRING' } },
      backstory: { type: 'STRING' }, how: { type: 'STRING' },
    },
    required: ['name', 'role_or_class', 'hp', 'ac', 'attributes', 'inventory', 'skills', 'backstory'],
  }, 0.9);

  let avatarUrl = null;
  try {
    const avatarRes = await generateHeroAvatar({
      name: out.name,
      roleOrClass: out.role_or_class,
      ruleset,
      concept,
      details,
      backstory: out.backstory || '',
      premise,
      referenceImage
    });
    if (avatarRes?.avatarUrl) avatarUrl = avatarRes.avatarUrl;
  } catch (err) {
    console.warn('[DndLibrary] Hero avatar generation non-fatal failure:', err.message);
  }

  return {
    name: out.name, roleOrClass: out.role_or_class, maxHp: Math.max(1, out.hp || 1), ac: out.ac || 10,
    attributes: Object.fromEntries((out.attributes || []).map((a) => [a.name, a.value])), inventory: out.inventory || [], skills: out.skills || [],
    backstory: out.backstory || '', how: out.how || '', sources: passages.slice(0, 4).map(({ id, book, page }) => ({ id, book, page })),
    avatarUrl,
  };
}

// Rindewind out of character: a recap, a rule, advice - from the story so far, the sheet and the books in play
export async function askDm({ campaign, ruleset, question, books }) {
  const passages = await searchRules(ruleset, question, 6, books);
  const recent = (campaign.turns || []).slice(-6).map((t) => `${t.turn_number ? `Simon: ${t.player_action}\n` : ''}DM: ${t.dm_narrative}`).join('\n\n');
  const ch = campaign.character;
  const out = await json(`You are Rindewind, an ancient wizard-chronicler and the Dungeon Master of Simon's solo game of "${ruleset?.name || campaign.ruleset_name}". He is asking you something OUT OF CHARACTER, across the table - answer as yourself: warm, wise, a touch of dry wit, plain British English, under 120 words, no lists unless he asks. If it's a rules question, answer from the passages (quote numbers exactly) and give their [n] in used. If it's about the story, answer from the story. Never reveal secrets the story hasn't revealed; you may hint.
HIS HERO: ${ch ? `${ch.name}, ${ch.role_or_class}, ${ch.hp}/${ch.max_hp} health, kit: ${(ch.inventory || []).join(', ')}` : 'none'}
${campaign.notes ? `THE STORY SO FAR: ${campaign.notes}\n` : ''}RECENT TURNS:\n${recent}
${passages.length ? `\nFROM HIS BOOKS:\n${passagesText(passages)}` : ''}

HE ASKS: ${question}`, { type: 'OBJECT', properties: { answer: { type: 'STRING' }, used: { type: 'ARRAY', items: { type: 'INTEGER' } }, mood: { type: 'STRING', enum: ['neutral', 'joy', 'amazement', 'suspicious', 'sad', 'fear', 'rage'] } }, required: ['answer'] }, 0.7);
  const used = (out.used || []).map((n) => passages[n - 1]).filter(Boolean);
  return { answer: out.answer, mood: out.mood || 'neutral', sources: used.map(({ id, book, page }) => ({ id, book, page })) };
}

// Real dice for the DM to read any of the book's random tables with, so table results aren't the model's choice
export function fateDice() {
  const r = (s) => Math.floor(Math.random() * s) + 1;
  return { d6: [r(6), r(6), r(6)], d8: r(8), d10: r(10), d12: r(12), d20: [r(20), r(20)], d66: `${r(6)}${r(6)}`, d100: [r(100), r(100)], id: crypto.randomBytes(3).toString('hex') };
}
