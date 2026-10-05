// Ims's memory, built from the stored conversations (persona plan Phase 3):
//  E1  a note from EVERY conversation, however it ended (it used to be only when Ims called endConversation,
//      so "cheers", silence and dropped connections were never remembered) - topics, people, plans, stances,
//      how Simon seemed, anything unresolved - plus any opinion Ims gave, over the whole conversation.
//  E2  meaning-based recall: every memory and note is embedded, so "what did I say about my brother" finds
//      the note about Daniel; the old word match still runs alongside.
//  E4  nightly profiles: what Ims knows about Simon (people, projects, plans, likes, goals - health and running
//      kept for reports only) and about himself (his opinions, running jokes, things he's been told off for).
import db, { getSetting, setSetting, getMemories, searchMemories } from '../db/database.js';
import { getConversation, conversationsSince } from './conversationLog.js';
import { generateEmbeddings, generateQueryEmbedding } from './embeddingService.js';
import { generate } from './modelAudit.js';
import { getModelFor } from './modelRegistry.js';
import crypto from 'crypto';
import { getProfiles, saveProfiles, MOOD_KEY } from './memoryProfiles.js';
export { getProfiles, saveProfiles, profilesForPrompt, lastUserMood } from './memoryProfiles.js';

const NOTES_KEY = 'ims_relationship_memory';
const NOTES_CAP = 40;
const OPINIONS_KEY = 'ims_opinions';

const readJson = (k, d) => { try { return JSON.parse(getSetting(k) || '') ?? d; } catch { return d; } };
const writeJson = (k, v) => setSetting(k, JSON.stringify(v));
const ask = async (prompt, json = false) => {
  const r = await generate(getModelFor('dayReport'), {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, ...(json ? { responseMimeType: 'application/json' } : {}) },
  }, 'memory');
  return (r.text || '').trim();
};
const transcriptOf = (c) => c.turns.map((t) => `${t.role === 'ims' ? 'Ims' : t.role === 'system' ? 'Desk' : 'Simon'}: ${t.text}`).join('\n');

// ---------------------------------------------------------------------------------------------------------
// E2: embeddings for memories and notes
// ---------------------------------------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS memory_vectors (
    kind TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    text TEXT NOT NULL,
    vec BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (kind, ref_id)
  );
`);
const noteId = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
const toBlob = (arr) => Buffer.from(new Float32Array(arr).buffer);
const fromBlob = (b) => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);

export async function embedMemory(kind, refId, text) {
  try {
    const [row] = await generateEmbeddings([{ text: String(text) }], 'RETRIEVAL_DOCUMENT');
    const vec = row?.embedding;
    if (!vec?.length) return false;
    db.prepare('INSERT INTO memory_vectors (kind, ref_id, text, vec, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(kind, ref_id) DO UPDATE SET text = excluded.text, vec = excluded.vec')
      .run(kind, String(refId), String(text), toBlob(vec), Date.now());
    return true;
  } catch (err) { console.error('[Memory] embedding failed:', err.message); return false; }
}

// everything not yet embedded: saved memories and conversation notes
export async function backfillMemoryVectors() {
  const have = new Set(db.prepare(`SELECT kind || ':' || ref_id AS k FROM memory_vectors`).all().map((r) => r.k));
  let n = 0;
  for (const m of getMemories(0)) if (!have.has(`memory:${m.id}`) && await embedMemory('memory', m.id, m.fact)) n++;
  for (const note of readJson(NOTES_KEY, [])) if (!have.has(`note:${noteId(note)}`) && await embedMemory('note', noteId(note), note)) n++;
  // drop vectors for memories that have been deleted
  const live = new Set(getMemories(0).map((m) => m.id));
  for (const r of db.prepare("SELECT ref_id FROM memory_vectors WHERE kind = 'memory'").all()) if (!live.has(r.ref_id)) db.prepare("DELETE FROM memory_vectors WHERE kind = 'memory' AND ref_id = ?").run(r.ref_id);
  return n;
}

const cosine = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / (Math.sqrt(x) * Math.sqrt(y) || 1); };

// recallMemory: meaning first, plus the old word match; each result says whether it's a saved fact or a note
export async function recallMemories(query, { limit = 8 } = {}) {
  const words = searchMemories(query).map((m) => ({ kind: 'memory', id: m.id, text: m.fact, category: m.category, created_at: m.created_at, score: 1 }));
  if (!query || !String(query).trim()) return words;
  let meaning = [];
  try {
    const q = await generateQueryEmbedding(String(query));
    const live = new Map(getMemories(0).map((m) => [m.id, m]));
    meaning = db.prepare('SELECT kind, ref_id, text, vec FROM memory_vectors').all()
      .filter((r) => r.kind !== 'memory' || live.has(r.ref_id))
      .map((r) => ({ kind: r.kind, id: r.ref_id, text: r.text, category: r.kind === 'memory' ? live.get(r.ref_id)?.category : 'conversation note', score: cosine(q, fromBlob(r.vec)) }))
      .filter((r) => r.score >= 0.66) // Gemini embeddings put unrelated short facts around 0.6-0.65
      .sort((a, b) => b.score - a.score);
  } catch (err) { console.error('[Memory] meaning search failed, word match only:', err.message); }
  const seen = new Set();
  return [...words, ...meaning].filter((r) => { const k = `${r.kind}:${r.id}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, Math.max(limit, words.length));
}

// ---------------------------------------------------------------------------------------------------------
// E1: a note from every conversation
// ---------------------------------------------------------------------------------------------------------
function recordOpinion(text) {
  const list = readJson(OPINIONS_KEY, []);
  if (list.some((o) => o.toLowerCase() === text.toLowerCase())) return;
  list.push(text);
  writeJson(OPINIONS_KEY, list.slice(-30));
  console.log(`[Memory] Ims opinion noted: "${text}"`);
}

async function addNote(note) {
  let notes = readJson(NOTES_KEY, []);
  notes.push(note);
  if (notes.length > NOTES_CAP) {
    const third = Math.ceil(notes.length / 3);
    const condensed = await ask(
      'Condense these notes about past conversations with Simon into ONE short paragraph (max 60 words). Keep the specific people, plans, interests and anything unresolved; drop the generic.\n\n' +
      notes.slice(0, third).map((e) => `- ${e}`).join('\n')).catch(() => '');
    notes = condensed ? [`Earlier: ${condensed}`, ...notes.slice(third)] : notes.slice(third);
  }
  writeJson(NOTES_KEY, notes);
  embedMemory('note', noteId(note), note).catch(() => {});
}

export async function summariseConversation(conversationId) {
  const c = getConversation(conversationId);
  if (!c || c.summary_done || !c.turns.some((t) => t.role === 'user')) return null;
  db.prepare('UPDATE conversations SET summary_done = 1 WHERE id = ?').run(c.id);
  const when = new Date(c.started_at).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const raw = await ask(
    'A conversation between Simon and Ims, his voice companion. Answer in exactly this form:\n' +
    "NOTE: up to three short sentences on what Simon talked about - topics, people, plans, what he thinks about something, anything left unresolved that Ims could ask about next time. Write 'NOTE: SKIP' if it was only a quick command or fact (a timer, the time, the weather).\n" +
    "MOOD: one or two words for how Simon seemed (e.g. cheerful, tired, rushed, fed up, chatty), or 'unclear'.\n" +
    "OPINION: if Ims stated an opinion or preference of his own, restate it in first person in under 15 words; otherwise 'NONE'. One per line if more than one.\n\n" +
    transcriptOf(c)).catch(() => '');
  if (!raw) return null;
  const note = raw.match(/NOTE:\s*(.+)/i)?.[1]?.trim();
  const mood = raw.match(/MOOD:\s*(.+)/i)?.[1]?.trim();
  for (const m of raw.matchAll(/OPINION:\s*(.+)/gi)) { const o = m[1].trim(); if (o && !/^none\b/i.test(o)) recordOpinion(o); }
  if (mood && !/^unclear/i.test(mood)) writeJson(MOOD_KEY, { mood, at: c.ended_at || Date.now(), conversationId: c.id });
  if (note && !/^skip\b/i.test(note)) {
    await addNote(`${when}: ${note}`);
    console.log(`[Memory] Conversation #${c.id} noted: "${note}"`);
    return note;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// E4: nightly profiles
// ---------------------------------------------------------------------------------------------------------
const cap = (arr, n) => (Array.isArray(arr) ? arr.map((x) => String(x).trim()).filter(Boolean).slice(0, n) : []);

export async function updateProfiles({ sinceMs = Date.now() - 26 * 3600000 } = {}) {
  const convs = conversationsSince(sinceMs).filter((c) => c && c.turns.some((t) => t.role === 'user'));
  if (!convs.length) return { updated: false, conversations: 0 };
  const { simon, self } = getProfiles();
  const text = convs.map((c) => `--- ${new Date(c.started_at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}\n${transcriptOf(c)}`).join('\n').slice(-60000);
  const raw = await ask(
    'You keep two short profiles for Ims, a voice companion, updated from his latest conversations with Simon. Merge what is new into what is there; keep anything still true; drop trivia and one-off commands. Return JSON:\n' +
    '{"simon": {"people": [], "projects": [], "plans": [], "likes": [], "dislikes": [], "goals": [], "reportsOnly": []}, "self": {"opinions": [], "runningJokes": [], "toldOffFor": [], "tastes": []}}\n' +
    '- simon.people: who he mentions and how they relate ("Daniel - brother, plays the card campaigns with him").\n' +
    '- anything about his health, blood sugar, insulin, running or training goes ONLY in simon.reportsOnly.\n' +
    '- self: what Ims himself said he thinks or likes, jokes the two of them share, and things Simon told Ims off for or asked him to stop.\n' +
    '- every item one short line; at most 8 per list.\n\n' +
    `CURRENT PROFILES:\n${JSON.stringify({ simon: simon || {}, self: self || {} })}\n\nLATEST CONVERSATIONS:\n${text}`, true);
  let next;
  try { next = JSON.parse(raw); } catch { throw new Error('The profile update came back unreadable.'); }
  const s = next.simon || {}, me = next.self || {};
  const profiles = saveProfiles({
    simon: { people: cap(s.people, 8), projects: cap(s.projects, 8), plans: cap(s.plans, 8), likes: cap(s.likes, 8), dislikes: cap(s.dislikes, 8), goals: cap(s.goals, 8), reportsOnly: cap(s.reportsOnly, 8), updatedAt: new Date().toISOString() },
    self: { opinions: cap(me.opinions, 8), runningJokes: cap(me.runningJokes, 8), toldOffFor: cap(me.toldOffFor, 8), tastes: cap(me.tastes, 8), updatedAt: new Date().toISOString() },
  });
  console.log(`[Memory] Profiles updated from ${convs.length} conversation(s)`);
  return { updated: true, conversations: convs.length, profiles };
}


