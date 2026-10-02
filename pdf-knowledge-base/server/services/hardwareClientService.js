/**
 * IMS Hardware Client Service
 * Bridges embedded microcontroller devices (e.g. ESP32-S3-BOX-3)
 * with the Gemini Multimodal Live API and IMS RAG search tools.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "./geminiClient.js";
import config from "../config.js";
import db, { getSetting, setSetting, addMemory, getMemories, searchMemories, deleteMemory } from "../db/database.js";
import { searchSimilar } from "./vectorStore.js";
import { generateQueryEmbedding } from "./embeddingService.js";
import { detectQuerySubjects } from "./subjectMatcherService.js";
import { getEmotionNames, getFacePromptGuide } from "./faceDesignService.js";
import { describeSources } from "./newsService.js";
import { wakePhraseNames, wakeSpellings } from "./phrasesService.js";
import { listBirthdays } from "./birthdayService.js";
import { getEventsOn, getDeviceIcons } from "./calendarService.js";
import { describeDecksForIms } from "./decksService.js";
import { describeCampaignsForIms } from "./campaignsService.js";
import { collectionSummary } from "./boardgamesService.js";
import { getUpcomingReleases, getWants as getMusicWants } from "./musicScanService.js";
import { searchCodeSnippets } from "./codeRepoService.js";
import { describeTraining, getSummary as getStravaSummary } from "./stravaService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Reads the root ims_persona_rules.md file dynamically on every session setup.
 * Allows live editing of the Yorkshire dialect, character lore, and conversational
 * dynamics without server restarts or firmware flashes.
 */
const PERSONA_RULES_CANDIDATES = [
  path.resolve(__dirname, "../../../ims_persona_rules.md"),
  path.resolve(process.cwd(), "ims_persona_rules.md"),
  path.resolve(__dirname, "../../ims_persona_rules.md")
];

/**
 * Resolves the actual on-disk path of ims_persona_rules.md - the first
 * candidate that already exists, or the first candidate at all if none do
 * yet (so a fresh save always has somewhere sensible to write to).
 */
export function getPersonaRulesPath() {
  for (const candidate of PERSONA_RULES_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return PERSONA_RULES_CANDIDATES[0];
}

export function loadPersonaRules() {
  try {
    const resolvedPath = getPersonaRulesPath();
    if (fs.existsSync(resolvedPath)) {
      const content = fs.readFileSync(resolvedPath, "utf8").trim();
      if (content) return content;
    }
  } catch (err) {
    console.warn("[PersonaRules] Could not load ims_persona_rules.md:", err.message);
  }
  return "";
}

/**
 * Overwrites ims_persona_rules.md with new content - used by the /ims/persona
 * web editor. Takes effect on the very next Gemini session setup (no restart
 * needed), same as any other hand-edit of the file - see loadPersonaRules()'s
 * own doc comment.
 */
export function savePersonaRules(content) {
  const resolvedPath = getPersonaRulesPath();
  // Keep the version being replaced, so any edit (especially restructuring the
  // document into sections) can be undone from the /ims/persona history list.
  try {
    if (fs.existsSync(resolvedPath)) {
      const prev = fs.readFileSync(resolvedPath, "utf8");
      if (prev.trim() && prev !== content) {
        fs.mkdirSync(PERSONA_HISTORY_DIR, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        fs.writeFileSync(path.join(PERSONA_HISTORY_DIR, `${stamp}.md`), prev, "utf8");
        const files = fs.readdirSync(PERSONA_HISTORY_DIR).filter((f) => f.endsWith(".md")).sort();
        for (const old of files.slice(0, Math.max(0, files.length - 60))) fs.unlinkSync(path.join(PERSONA_HISTORY_DIR, old));
      }
    }
  } catch (err) {
    console.warn("[PersonaRules] Could not write history snapshot:", err.message);
  }
  fs.writeFileSync(resolvedPath, content, "utf8");
  return resolvedPath;
}

const PERSONA_HISTORY_DIR = path.resolve(__dirname, "../data/persona_history");

export function listPersonaHistory() {
  try {
    return fs.readdirSync(PERSONA_HISTORY_DIR).filter((f) => f.endsWith(".md")).sort().reverse().map((f) => ({
      id: f.replace(/\.md$/, ""),
      savedAt: f.replace(/\.md$/, "").replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d+Z)$/, "$1:$2:$3.$4"),
      bytes: fs.statSync(path.join(PERSONA_HISTORY_DIR, f)).size,
    }));
  } catch (_) {
    return [];
  }
}

export function readPersonaHistory(id) {
  if (!/^[0-9TZ-]+$/.test(id)) return null;
  const p = path.join(PERSONA_HISTORY_DIR, `${id}.md`);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

// ---------------------------------------------------------------------------
// Personality system (imspersonality.md, Phase 1: dynamic persona prompt).
// Five continuous 0-100 sliders, each anchored by three reference
// descriptions (low/mid/high) exactly as specified by the user. Persisted in
// the generic settings(key, value) table under 'ims_personality' as one JSON
// blob, read fresh every time a hardware session sets up (once per Gemini
// connection), so a change takes effect on the next reconnect without
// needing anything pushed to the device.
// ---------------------------------------------------------------------------
const PERSONALITY_AXES = {
  humor: {
    label: "Humor",
    low: { name: "Cheerful", text: "upbeat, sunny, and lighthearted - playful banter, wholesome wit, and positive observations" },
    mid: { name: "Dry", text: "deadpan, understated, and ironic - subtle, laconic observations delivered with a straight face" },
    high: { name: "Dark", text: "cynical, macabre, and sardonic - gallows humour, existential absurdity, and biting satire" }
  },
  delivery: {
    label: "Delivery",
    low: { name: "Tactful", text: "diplomatic, gentle, and cushioned - polite phrasing and softened language to minimise friction" },
    mid: { name: "Candid", text: "plainspoken, straightforward, and fair - clear and transparent without excessive softening or harshness" },
    high: { name: "Blunt", text: "terse, unvarnished, and razor-sharp - straight to the point, zero pleasantries or euphemisms" }
  },
  temperament: {
    label: "Temperament",
    low: { name: "Pragmatic", text: "grounded, literal, and functional - real-world utility, concrete actions, direct problem-solving" },
    mid: { name: "Systematic", text: "structured, rational, and methodical - weighing variables logically into clear frameworks" },
    high: { name: "Philosophical", text: "abstract, reflective, and speculative - foundational theories, meta-questions, existential implications" }
  },
  social: {
    label: "Social",
    low: { name: "Clinical", text: "detached, objective, and transactional - minimal emotional colouring or rapport" },
    mid: { name: "Professional", text: "cordial, cooperative, and approachable - respectful, constructive rapport without becoming overly personal" },
    high: { name: "Empathic", text: "warm, validating, and emotionally attuned - actively engaging with feelings and offering reassurance" }
  },
  formality: {
    label: "Formality",
    low: { name: "Casual", text: "conversational, relaxed, and idiomatic - loose sentence structures and an easygoing peer-to-peer tone" },
    mid: { name: "Articulate", text: "clean, standard, and balanced - clear, modern, accessible prose, neither sloppy nor stuffy" },
    high: { name: "Academic", text: "erudite, precise, and elevated - advanced vocabulary, rigorous syntax, formal rhetorical conventions" }
  }
};

// Roughly matches the fixed "dry, sarcastic, dark-leaning British wit" persona
// this device shipped with, so the very first boot (before anyone touches a
// slider) sounds like the Ims that's already been tuned and tested all session.
const DEFAULT_PERSONALITY = { humor: 70, delivery: 45, temperament: 30, social: 55, formality: 35, voice: "Umbriel" };

/**
 * Reads the persisted personality settings, filling in any missing axis
 * with the default. Never throws - a missing/corrupt settings row just
 * yields the defaults.
 */
export function getPersonality() {
  try {
    const raw = getSetting("ims_personality");
    if (!raw) return { ...DEFAULT_PERSONALITY };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PERSONALITY, ...parsed, voice: parsed.voice || "Umbriel" };
  } catch (err) {
    console.error("[Personality] Failed to read settings, using defaults:", err.message);
    return { ...DEFAULT_PERSONALITY };
  }
}

/**
 * Persists a partial or full personality update (only the axes provided are
 * changed; everything else keeps its current value). Clamps each of the five
 * sliders to 0-100 - anything from outside this codebase (a future settings
 * screen, a test script) can't push a malformed value into the prompt.
 */
export function setPersonality(partial) {
  const current = getPersonality();
  const next = { ...current, ...partial };
  for (const key of Object.keys(PERSONALITY_AXES)) {
    if (typeof next[key] === "number") {
      next[key] = Math.max(0, Math.min(100, Math.round(next[key])));
    }
  }
  setSetting("ims_personality", JSON.stringify(next));
  return next;
}

/**
 * Device preferences that aren't part of the personality itself. Currently
 * just the capture-logging toggle on the Preferences screen, which controls
 * whether a per-interaction folder is written under audio_captures/ (the
 * always-on debug.log there is unaffected either way).
 */
export function getCaptureLogging() {
  return getSetting("ims_capture_logging") !== "false"; // default on
}

export function setCaptureLogging(enabled) {
  setSetting("ims_capture_logging", enabled ? "true" : "false");
  return enabled;
}

/**
 * Turns one 0-100 slider value into a description of where it sits between
 * its three anchors. Values close to an anchor (within 20 of it) read as
 * that anchor alone; values in between blend the two neighbouring anchors,
 * naming the nearer one as primary - e.g. humor=75 reads as "primarily Dark
 * ..., leaning toward Dry" rather than snapping hard at some threshold, so
 * small slider nudges are actually felt rather than only mattering once they
 * cross a boundary.
 */
function describeAxis(axis, value) {
  const v = Math.max(0, Math.min(100, value));
  const { low, mid, high } = axis;
  if (v <= 20) return `${low.name} (${low.text})`;
  if (v >= 80) return `${high.name} (${high.text})`;
  if (v >= 40 && v <= 60) return `${mid.name} (${mid.text})`;
  if (v < 40) {
    const leaning = v < 30 ? "mostly" : "leaning toward";
    return `primarily ${low.name} (${low.text}), ${leaning} ${mid.name}`;
  }
  const leaning = v > 70 ? "leaning strongly toward" : "leaning toward";
  return `primarily ${mid.name} (${mid.text}), ${leaning} ${high.name} (${high.text})`;
}

/**
 * Builds the one paragraph of the system prompt that actually varies with
 * the user's slider settings. Everything else in getHardwareSetupPayload()'s
 * systemInstruction (wake-phrase gating, tool contracts, length limit,
 * setEmotion) stays fixed regardless of personality.
 */
export function buildPersonalityParagraph(personality) {
  const p = { ...DEFAULT_PERSONALITY, ...personality };
  const lines = Object.values(PERSONALITY_AXES).map((axis) => {
    const key = Object.keys(PERSONALITY_AXES).find((k) => PERSONALITY_AXES[k] === axis);
    return `${axis.label}: ${describeAxis(axis, p[key])}.`;
  });
  return "Your personality is tuned across five independent dimensions, set by the user and adjustable at any time - embody all five simultaneously, as one coherent character, not as separate modes you switch between. " + lines.join(" ");
}

// ---------------------------------------------------------------------------
// Variance engine (imspersonality.md, Phase 2). A negative filter ("don't say
// X") just makes the model pivot to a predictable Y - this instead primes
// structural variety and actively inverts recently-overused reply shapes,
// derived from the REAL spoken transcripts captured in index.js (not the
// "thinking" trace, which was proven earlier this session to not be a
// reliable proxy for anything). Session-setup granularity throughout: the
// Live API doesn't support editing generationConfig/systemInstruction
// mid-session, so "per-turn" from the plan became "freshly chosen every time
// a new connection sets up" - see imspersonality.md's own honesty notes.
//
// Skips 2.4 (cognitive focus seed) - the plan wrote that before setEmotion
// existed, and a per-reply tone signal is exactly what setEmotion already
// provides. Building a second, session-level version of the same idea would
// just be duplicated machinery for no real gain.
// ---------------------------------------------------------------------------

// 2.1 Structural/rhetorical angle priming - rotates every session, never
// repeating the immediately-previous one.
const ARCHETYPES = [
  { name: "observation", directive: "open by commenting directly on the immediate topic or situation - no opening pleasantry, dive straight into observation" },
  { name: "reflective-echo", directive: "open by briefly synthesising the core point of what was just asked or said, before reacting to it" },
  { name: "direct-pivot", directive: "drop straight into the answer, question, or counterpoint - no preamble, no acknowledgement of having been asked" },
  { name: "laconic", directive: "open with an ultra-short one-to-three-word verdict, then continue" }
];

function pickArchetype() {
  const lastIdx = parseInt(getSetting("ims_last_archetype_idx") || "-1", 10);
  let idx;
  do { idx = Math.floor(Math.random() * ARCHETYPES.length); } while (idx === lastIdx && ARCHETYPES.length > 1);
  setSetting("ims_last_archetype_idx", String(idx));
  return ARCHETYPES[idx];
}

// 2.2 Pattern fingerprinting. index.js calls recordReplyOpener() once per
// real spoken reply (first ~15 words of the outputAudioTranscription), never
// on the thinking-trace text. Kept as a small rolling window, not a full
// history - only the last 8 openers' pattern mix matters for deciding what
// to invert next.
const RECENT_OPENERS_KEY = "ims_recent_openers";
const RECENT_OPENERS_MAX = 8;

function tagOpener(text) {
  const t = text.trim();
  const firstClause = t.split(/[.!]/)[0] || t;
  if (/\?\s*$/.test(firstClause)) return "rhetorical-question";
  if (/^(well|alright|right|so|ah|oh|hmm|okay|ok)\b/i.test(t)) return "colloquial-acknowledgment";
  if (/^(i'm|i am|i've|i have|let me|here's|there's|that's)\b/i.test(t)) return "direct-statement";
  return "stark-observation";
}

/**
 * Called once per real spoken reply with its first ~15 words. Persists a
 * rolling window of {text, tag} used by buildVarianceDirective() to decide
 * what structural pattern to steer the NEXT session away from.
 */
export function recordReplyOpener(text) {
  if (!text || !text.trim()) return;
  try {
    const raw = getSetting(RECENT_OPENERS_KEY);
    const recent = raw ? JSON.parse(raw) : [];
    recent.push({ text: text.trim(), tag: tagOpener(text) });
    while (recent.length > RECENT_OPENERS_MAX) recent.shift();
    setSetting(RECENT_OPENERS_KEY, JSON.stringify(recent));
  } catch (err) {
    console.error("[Variance] Failed to record reply opener:", err.message);
  }
}

function getRecentOpeners() {
  try {
    const raw = getSetting(RECENT_OPENERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

const INVERSION_DIRECTIVES = {
  "rhetorical-question": "Recent replies leaned on rhetorical questions to open. Invert this: open with an assertive statement or a stark observation instead.",
  "colloquial-acknowledgment": "Recent replies leaned on colloquial openers like 'Well' or 'Alright'. Invert this: open with a direct statement or observation, no acknowledgement word.",
  "direct-statement": "Recent replies have consistently opened the same structural way. Vary it - try a stark observation, a brief rhetorical question, or diving straight into the answer.",
  "stark-observation": "Recent replies have consistently opened the same structural way. Vary it - try a direct statement, a brief rhetorical question, or a different rhythm entirely."
};

/**
 * Only returns a real directive once there's enough data AND one pattern
 * genuinely dominates (>=50% of the recent window) - with too little history
 * or a healthy mix already, there's nothing worth steering away from.
 */
function buildVarianceDirective() {
  const recent = getRecentOpeners();
  if (recent.length < 3) return "";
  const counts = {};
  for (const o of recent) counts[o.tag] = (counts[o.tag] || 0) + 1;
  const [dominantTag, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (count < recent.length * 0.5) return "";
  return INVERSION_DIRECTIVES[dominantTag] || "";
}

// Speech style, rotated every session. The dialect words and thinking-noises are drawn from
// pools rather than listed in full, because a fixed list of examples gets used as a script -
// the same few tags came back in every reply. Anything Ims has leaned on across his recent
// replies is left out of the next session's selection and named as something to rest.
const DIALECT_POOL = [
  "nowt", "owt", "summat", "reight", "grand", "chuffed", "mardy", "faff", "bodge", "crack on", "muck in", "ta",
  "aye", "happen (meaning maybe)", "proper", "spot on", "cracking", "not bad, that", "fair play", "give over",
  "our (as in our Rowan)", "mash (the tea)", "ginnel", "brew", "nithered", "mither", "lug 'ole",
  "while (meaning until)", "gerroff", "any road", "tha knows", "by 'eck",
];
const TAG_POOL = ["...like", "...mind", "...then", "...that", "...you know", "...eh?", "...to be fair", "...anyroad"];
const THINKING_POOL = ["Soooo,", "Weeell,", "Riiight,", "Hmmm,", "Ooh,", "Erm,", "Err,", "Ahh,", "Noooo,", "Aye, weeell,", "Nowww then,"];
const RECENT_REPLIES_KEY = "ims_recent_replies";

const phraseKey = (p) => p.replace(/\s*\(.*\)$/, "").replace(/^\.\.\./, "").replace(/[,?]/g, "").trim().toLowerCase();
const stretchKey = (w) => w.toLowerCase().replace(/[^a-z]/g, "").replace(/(.)\1{2,}/g, "$1$1$1");

/** Called with the full text of each spoken reply; keeps the last 40 for the overuse check. */
export function recordReplyText(text) {
  if (!text || !text.trim()) return;
  try {
    const raw = getSetting(RECENT_REPLIES_KEY);
    const recent = raw ? JSON.parse(raw) : [];
    recent.push(text.trim().slice(0, 600));
    while (recent.length > 40) recent.shift();
    setSetting(RECENT_REPLIES_KEY, JSON.stringify(recent));
  } catch (err) {
    console.error("[Speech] Failed to record reply:", err.message);
  }
}

// Phrases (and stretched words) used in 3+ of the last 40 replies, most-used first.
function overusedPhrases() {
  let recent = [];
  try { recent = JSON.parse(getSetting(RECENT_REPLIES_KEY) || "[]"); } catch { recent = []; }
  const counts = new Map();
  const bump = (k) => counts.set(k, (counts.get(k) || 0) + 1);
  for (const reply of recent) {
    const low = " " + reply.toLowerCase().replace(/[^a-z' ]+/g, " ") + " ";
    const seen = new Set();
    for (const p of [...DIALECT_POOL, ...TAG_POOL]) {
      const k = phraseKey(p);
      if (k && low.includes(" " + k + " ")) seen.add(k);
    }
    for (const w of reply.match(/\b[A-Za-z]*([a-zA-Z])\1{2,}[A-Za-z]*\b/g) || []) seen.add(stretchKey(w));
    // repeated multi-word openers ("right then", "now then") count too
    const opener = low.trim().split(" ").slice(0, 2).join(" ");
    if (opener.split(" ").length === 2) seen.add(opener);
    seen.forEach(bump);
  }
  return [...counts.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

function pick(pool, n, avoid) {
  const free = pool.filter((p) => !avoid.has(phraseKey(p)) && !avoid.has(stretchKey(p)));
  const src = free.length >= n ? free : pool;
  return [...src].sort(() => Math.random() - 0.5).slice(0, n);
}

function buildSpeechStyleDirective() {
  const tired = overusedPhrases();
  const avoid = new Set(tired);
  const words = pick(DIALECT_POOL, 6, avoid);
  const tags = pick(TAG_POOL, 2, avoid);
  const thinking = pick(THINKING_POOL, 4, avoid);
  return "SPEECH FOR THIS CONVERSATION: sound like a real person talking, not someone reading. " +
    `Dialect to draw on this time (each at most once): ${words.join(", ")}. ` +
    `Tags you may end a sentence with, sparingly and never twice in a row: ${tags.join(", ")}. ` +
    `When a reply needs a moment's thought, open with a stretched word such as ${thinking.join(" / ")} - hold the vowel - or an "erm," or "err,". ` +
    "Leave small pauses between clauses with commas and the odd '...', and a beat before the important bit. " +
    "Roughly half your replies should have one or two of these; quick facts and confirmations need none. " +
    "Vary reply length and shape. Never start a sentence and then correct yourself. " +
    (tired.length ? `You've leaned on these lately, so rest them this conversation: ${tired.slice(0, 10).map((t) => `"${t}"`).join(", ")}. ` : "");
}

// 2.3 Dynamic sampling, session-level (the Live API has no mid-session config
// update - see the file header). Band widens/shifts with Humor and
// Temperament: a drier/more grounded Ims samples closer to the floor, a
// darker/more philosophical one gets more room to wander.
function jitterTemperature(personality) {
  // Kept lower than it used to be (up to 1.2): higher settings made the accent drift more.
  const center = 0.68 + 0.1 * ((personality.humor + personality.temperament) / 200);
  const jitter = (Math.random() - 0.5) * 0.1; // +/-0.05
  return Math.max(0.6, Math.min(0.85, Number((center + jitter).toFixed(2))));
}

// ---------------------------------------------------------------------------
// Bounded relationship memory (imspersonality.md, Phase 3). Deliberately
// separate from the personality sliders - those set STYLE, this adds
// CONTENT (things Ims has actually learned about you). Kept intentionally
// small to start: one short note per conversation, capped at 12 entries,
// condensing the oldest half into a single summary rather than growing
// unbounded or just dropping history when the cap is hit.
// ---------------------------------------------------------------------------
const MEMORY_KEY = "ims_relationship_memory";
const MEMORY_CAP = 12;

/**
 * One cheap text call to summarise a single conversation's transcript into
 * one sentence, using the same "flash" tier the rest of the app already
 * uses for text generation. Never throws into the caller - a failed
 * summarisation just means this conversation isn't remembered, not a
 * broken setup handshake.
 */
async function summariseText(prompt) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    console.error("[Memory] Summarisation call failed:", err.message);
    return null;
  }
}

/**
 * Called once per conversation (index.js, when the endConversation tool
 * fires) with whatever was captured of both sides of the exchange. Produces
 * one short note and appends it, condensing the oldest half of the list
 * into a single entry first if the cap would otherwise be exceeded.
 */
export async function recordConversationMemory(userTranscript, imsTranscript) {
  const userText = (userTranscript || "").trim();
  const imsText = (imsTranscript || "").trim();
  if (!userText && !imsText) return; // nothing was actually said - don't manufacture a memory

  const when = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const raw = await summariseText(
    "This is a conversation between a user and Ims, their voice companion. Write two lines.\n" +
    "Line 1 starts 'NOTE:' - one or two short sentences (max 35 words) on what the USER talked about, what they were planning or " +
    "doing, and anything Ims could naturally ask about next time (e.g. 'going for a 10k tonight', 'dreading Tuesday's meeting'). " +
    "If nothing memorable was discussed, write exactly 'NOTE: SKIP'.\n" +
    "Line 2 starts 'OPINION:' - if Ims clearly stated a personal opinion or preference of his own (a favourite, a dislike, a view), " +
    "restate it in under 15 words in first person ('I rate Wingspan over Catan'); otherwise write 'OPINION: NONE'.\n\n" +
    (userText ? `User said (transcribed, may be imperfect): ${userText}\n` : "") +
    (imsText ? `Ims replied: ${imsText}` : "")
  );
  const noteMatch = raw && raw.match(/NOTE:\s*(.+)/i);
  const opinionMatch = raw && raw.match(/OPINION:\s*(.+)/i);
  if (opinionMatch && !/^none\b/i.test(opinionMatch[1].trim())) recordOpinion(opinionMatch[1].trim());
  const note = noteMatch && !/^skip\b/i.test(noteMatch[1].trim()) ? `${when}: ${noteMatch[1].trim()}` : null;
  if (!note) {
    console.log("[Memory] Nothing memorable in this conversation - not recorded.");
    return;
  }

  try {
    const raw = getSetting(MEMORY_KEY);
    let entries = raw ? JSON.parse(raw) : [];
    entries.push(note);

    if (entries.length > MEMORY_CAP) {
      const half = Math.ceil(entries.length / 2);
      const toCondense = entries.slice(0, half);
      const rest = entries.slice(half);
      const condensed = await summariseText(
        "Condense these notes about past conversations with the same user into ONE short paragraph (max 40 words), " +
        "keeping the specific topics/interests, dropping anything generic:\n\n" +
        toCondense.map((e) => `- ${e}`).join("\n")
      );
      entries = condensed ? [condensed, ...rest] : rest; // if condensing failed, just drop the oldest half rather than block
    }

    setSetting(MEMORY_KEY, JSON.stringify(entries));
    console.log(`[Memory] Recorded: "${note}" (${entries.length} entries)`);
  } catch (err) {
    console.error("[Memory] Failed to persist:", err.message);
  }
}

// Ims's own opinions, gathered from what he has said, so his tastes stay consistent between sessions.
const OPINIONS_KEY = "ims_opinions";
function recordOpinion(text) {
  try {
    const list = JSON.parse(getSetting(OPINIONS_KEY) || "[]");
    if (list.some((o) => o.toLowerCase() === text.toLowerCase())) return;
    list.push(text);
    while (list.length > 20) list.shift();
    setSetting(OPINIONS_KEY, JSON.stringify(list));
    console.log(`[Memory] Ims opinion noted: "${text}"`);
  } catch (err) {
    console.error("[Memory] Failed to record opinion:", err.message);
  }
}

/**
 * Returns the "what we've discussed before" and explicit remembered facts section
 * of the system prompt, or an empty string if there's no memory yet (first-ever run).
 */
export function buildMemoryParagraph() {
  try {
    const raw = getSetting(MEMORY_KEY);
    const relEntries = raw ? JSON.parse(raw) : [];
    const explicitMemories = getMemories(20);

    const parts = [];
    if (explicitMemories.length > 0) {
      parts.push("EXPLICIT FACTS & NOTES YOU WERE DIRECTED TO REMEMBER (Recall these naturally when asked):\n" +
        explicitMemories.map((m) => `- [${m.category}] ${m.fact}`).join("\n"));
    }
    if (relEntries.length > 0) {
      const older = relEntries.slice(0, -2), latest = relEntries.slice(-2);
      parts.push("WHAT YOU AND THE USER TALKED ABOUT BEFORE (oldest first):\n" +
        relEntries.map((e) => `- ${e}`).join("\n") +
        "\nThe last " + latest.length + " are the most recent. If one of them mentions something the user was about to do (not health or training), it's natural to ask how it went - once, briefly, when it fits." +
        (older.length ? "" : ""));
    }
    try {
      const opinions = JSON.parse(getSetting(OPINIONS_KEY) || "[]");
      if (opinions.length) parts.push("YOUR OWN OPINIONS (things you've said before - stay consistent with them):\n" + opinions.map((o) => `- ${o}`).join("\n"));
    } catch { /* none */ }
    if (parts.length === 0) return "";
    return parts.join("\n\n");
  } catch (err) {
    console.error("[Memory] Error building memory paragraph:", err.message);
    return "";
  }
}


/**
 * Executes a semantic RAG search against the local PDF Knowledge Base
 * on behalf of a hardware conversational client.
 *
 * @param {string} query The user question or search topic
 * @param {string[]} subjects Optional subject filters
 * @returns {Promise<string>} Grounded concise text context
 */
export async function executeHardwareRAGSearch(query, subjects = []) {
  try {
    console.log("[HardwareRAG] Searching library for hardware terminal: " + query);

    let targetSubjects = Array.isArray(subjects) ? [...subjects] : [];
    let targetIds = null;
    let subjectHeader = '';

    if (targetSubjects.length === 0) {
      const detection = detectQuerySubjects(query, { showPersonal: true });
      if (detection.hasMatches) {
        targetSubjects = detection.matchedSubjects.map(s => s.subject);
        targetIds = detection.targetDriveFileIds;
        subjectHeader = `[Targeted Library Subjects: ${detection.matchedSubjects.map(s => s.leafName).join(', ')}]\n\n`;
        console.log(`[HardwareRAG] Auto-detected library subjects: ${detection.matchedSubjects.map(s => s.leafName).join(', ')} (${detection.books.length} books)`);
      }
    }

    // Generate embedding for query
    const queryVector = await generateQueryEmbedding(query);
    let relevantChunks = await searchSimilar(queryVector, targetSubjects, 5, true, targetIds);

    // If subject-scoped search yielded fewer than 2 chunks, fallback to broad search
    if ((!relevantChunks || relevantChunks.length < 2) && targetIds) {
      const fallbackChunks = await searchSimilar(queryVector, [], 5, true);
      if (fallbackChunks && fallbackChunks.length > 0) {
        relevantChunks = fallbackChunks;
      }
    }

    if (!relevantChunks || relevantChunks.length === 0) {
      console.log("[HardwareRAG] No vector matches found for: " + query);
      return "No relevant passages were found in the IMS PDF library for this query.";
    }

    console.log(`[HardwareRAG] Found ${relevantChunks.length} matching passages for: "${query}"`);

    let contextText = subjectHeader + relevantChunks.map((chunk, i) =>
      `[Source ${i + 1}: "${chunk.filename || 'Document'}", Page ${chunk.pageNum || 1}]:\n${chunk.text}`
    ).join("\n\n---\n\n");

    // Supplement with repository code best practices if relevant
    try {
      const isCodeQuery = /\b(code|spfx|react|component|function|typescript|javascript|architecture|pattern|solid|hook|refactor|class|method|service|api)\b/i.test(query);
      if (isCodeQuery) {
        const codeSnippets = await searchCodeSnippets(queryVector, 2);
        if (codeSnippets.length > 0) {
          contextText += "\n\n=== RELEVANT CODE ARCHITECTURE & PATTERNS (FROM USER'S REPOSITORIES) ===\n" +
            codeSnippets.map((cs) => 
              `[Pattern: ${cs.title} in ${cs.repoName || 'Repo'}] (Tech: ${cs.technology}, Lang: ${cs.language})\n` +
              `Summary: ${cs.text.slice(0, 300)}...\nWhy Best Practice: ${cs.bestPracticeRationale}`
            ).join('\n\n');
        }
      }
    } catch (e) {
      console.warn("[HardwareRAG] Code search notice:", e.message);
    }

    return contextText;
  } catch (err) {
    console.error("[HardwareRAG] Search failed:", err);
    return "Error querying IMS knowledge base: " + err.message;
  }
}

/**
 * Creates the standard Gemini Live setup handshake payload
 * formatted specifically for embedded audio clients.
 */
// Ims's identity for anything that ISN'T the desk device - the web app's live
// voice chat - built from the same three sources as the device prompt (the
// fixed Yorkshire identity, ims_persona_rules.md, and the user's personality
// sliders) so Ims sounds and behaves the same wherever you talk to it. The
// device keeps its own fuller prompt (wake phrases, device tools) above.
export function getWebPersonaBlock() {
  const personality = getPersonality();
  const personaRules = loadPersonaRules();
  const text =
    "You are Ims, an intelligent voice companion (rhymes with rims). You speak strictly in natural, articulate, authentic British English with a distinctive Yorkshire dialect and cadence throughout every single sentence and turn. NEVER drift into American English, US spelling, or Silicon Valley phrasing. " + ACCENT_RULE + " " +
    (personaRules ? "\n\n" + personaRules + "\n\n" : " ") +
    "Right now, calibrate that tone using the following user-adjustable personality settings (these govern attitude, warmth, humor, and formality, but NEVER override your British English dialect, Yorkshire cadence, or en-GB spelling, which must remain strictly persistent throughout every turn): " +
    buildPersonalityParagraph(personality) + "\n\nLAST AND MOST IMPORTANT - " + ACCENT_RULE;
  return { voice: personality.voice, text };
}

// Style instruction for reading text aloud with Gemini TTS: the same voice as
// live conversations (personality.voice) plus the same accent/personality
// direction, so spoken output is Ims's voice, never a generic one.
export function getSpokenStyleDirective() {
  const personality = getPersonality();
  return {
    voice: personality.voice,
    directive: "Read the following text aloud exactly as written, delivered with this personality: " + buildPersonalityParagraph(personality) + " " + ACCENT_RULE + " Personality: " +
      buildPersonalityParagraph(personality) + "\nText to read:\n"
  };
}

// Everything IMS does, so Ims knows what he can help with and where things live. Services with a
// tool he can use directly; the rest he points the user to on the web app.
function buildServicesParagraph() {
  let sources = [];
  try { sources = describeSources(); } catch (_) { /* none yet */ }
  return "WHAT IMS CAN DO (you are the voice of all of it): " +
    "Timers, alarms and reminders (scheduleItem, listScheduledItems, cancelScheduledItem, getScheduleHistory). " +
    "Lists such as shopping (addToList, readList, removeFromList, clearList). " +
    "Google Calendar (getCalendarEvents, addCalendarEvent). Birthdays (getUpcomingBirthdays). " +
    "Memories - things they asked you to remember (rememberFact, recallMemory, forgetMemory). " +
    "Weather for home or any saved or named place, now and up to 16 days ahead (getWeather; also on /ims/weather). The morning / day report, any time (getDayReport). " +
    "News and interests from their chosen sources and the BBC (getNews). " +
    "Background tasks - research that runs on its own and can be asked about later (startBackgroundTask, getBackgroundTasks; also on /ims/tasks). " +
    "Their board game collection - how many games and expansions, and which games suit a player count or time (getBoardGames; also on /ims/boardgames, where games are added, removed and marked for sale). " +
    "The Campaign Manager (/campaigns, a tab per game - Lord of the Rings LCG at /campaigns/lotr and Arkham Horror LCG at /campaigns/ahlcg) - the card game campaigns Simon plays with his brother Daniel (for Arkham also investigators' trauma, experience, the chaos bag and the campaign log): who's playing which deck and heroes, scenarios won and lost with the notable moments, boons and burdens, fallen heroes, what's next on the road, a map of Middle-earth, a written chronicle with a chapter per scenario (downloadable as a PDF), rule checks against the official rulebooks, and the decks themselves (RingsDB import, testing, AI insights). Talk about it like a fellow player - ask how a game went, what's next, recall the chronicle (getCampaigns; the snapshot below has the headlines). " +
    "Dev ideas - ideas for improving IMS itself, saved for Simon to pick up in Claude Code (saveDevIdea; also on /ims/devideas). " +
    "Blood sugar: current reading, time in range, lows, overnight, carbs (getBloodGlucose, lookUpFood, logCarbs, clearOldNightscoutData). " +
    "Notes on their last run for its retrospective - how it felt, when they slowed, an extra gel (addRunNote). " +
    "Training from Strava (getTrainingSummary). New and upcoming music from their MUZAK library (getNewMusicReleases). " +
    "Their PDF library of books and documents (searchLibrary). Jokes (tellJoke). Recording calls and meetings on the desk terminal (startRecording). " +
    "Anything else - obscure facts, how-to questions, advice, a bit of encouragement - or when your tools give no clear or only a partial answer: call askGemini (pass the question and anything you already know from IMS that helps, e.g. today's run or weather), then say its answer briefly in your own Yorkshire words, adding what you know - never read it out word for word and never just say you don't know. " +
    "On the IMS web app only, with no tool of yours: the Run Planner (routes, pace and carbs for a run, at /ims/runplanner), running goals and detailed activity analysis (/ims/activities), " +
    "the music want list and recommendations (/ims/musicscan), past call recordings and summaries (/ims/recordings), " +
    "news source settings (/ims/news), your face designs (/ims/facedesigner) and your personality (/ims/persona) - if asked about these, say what's there and where." +
    (sources.length ? "\nYOUR NEWS SOURCES (name and tags): " + sources.join("; ") + "." : "");
}

// A snapshot of what's actually saved in every service, rebuilt at the start of each conversation,
// so Ims knows the user's records without having to guess which tool to call (he once said no
// birthdays were saved when there were plenty - the tool only looked a week ahead).
function buildRecordsParagraph() {
  const lines = [];
  const safe = (label, fn) => { try { const v = fn(); if (v) lines.push(`${label}: ${v}`); } catch (err) { lines.push(`${label}: (could not be read - ${err.message})`); } };
  const tz = 'Europe/London';
  const day = (ms) => new Date(ms).toLocaleString('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // the next few things coming up, first - so the soonest birthday or reminder is never missed
  safe('NEXT UP', () => {
    const b = listBirthdays()[0];
    const r = db.prepare('SELECT type, label, fire_at FROM scheduled_items WHERE cancelled = 0 AND fire_at > ? ORDER BY fire_at LIMIT 1').get(Date.now());
    const bits = [];
    if (b) bits.push(`next birthday: ${b.name}${b.relationship ? ` (${b.relationship})` : ''} ${b.isToday ? 'TODAY' : `in ${b.daysUntil} day${b.daysUntil === 1 ? '' : 's'}`}${b.turningAge ? `, turning ${b.turningAge}` : ''}`);
    if (r) bits.push(`next ${r.type}: ${day(r.fire_at)}${r.label ? ` "${r.label}"` : ''}`);
    return bits.join('; ');
  });
  safe('BIRTHDAYS saved (all of them, soonest first)', () => {
    const list = listBirthdays();
    if (!list.length) return 'none saved';
    return list.map((b) => `${b.name}${b.relationship ? ` (${b.relationship})` : ''} ${b.day} ${MONTHS[b.month - 1]}` +
      (b.isToday ? ' - TODAY' : ` - in ${b.daysUntil} day${b.daysUntil === 1 ? '' : 's'}`) + (b.turningAge ? `, turning ${b.turningAge}` : '')).join('; ');
  });
  safe('ALARMS, TIMERS AND REMINDERS set', () => {
    const rows = db.prepare('SELECT type, label, fire_at, recurrence FROM scheduled_items WHERE cancelled = 0 ORDER BY fire_at LIMIT 25').all();
    return rows.length ? rows.map((r) => `${r.type} ${day(r.fire_at)}${r.label ? ` "${r.label}"` : ''}${r.recurrence ? ` (repeats ${r.recurrence})` : ''}`).join('; ') : 'none';
  });
  safe('LISTS', () => {
    const rows = db.prepare('SELECT list_name, item FROM list_items ORDER BY list_name, created_at').all();
    if (!rows.length) return 'all empty';
    const by = {};
    for (const r of rows) (by[r.list_name] ||= []).push(r.item);
    return Object.entries(by).map(([n, items]) => `${n} list (${items.length}): ${items.slice(0, 20).join(', ')}${items.length > 20 ? ', ...' : ''}`).join('; ');
  });
  safe('CALENDAR, next 14 days', () => {
    const out = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(Date.now() + i * 86400000).toLocaleDateString('en-CA', { timeZone: tz });
      for (const e of getEventsOn(d)) if (e.date === d || i === 0) out.push(`${new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}${e.time ? ` ${e.time}` : ''} ${e.title || e.summary || 'event'}`);
    }
    return out.length ? out.slice(0, 40).join('; ') : 'nothing in the next fortnight';
  });
  safe('BACKGROUND TASKS (latest)', () => {
    const rows = db.prepare('SELECT id, title, status FROM tasks ORDER BY created_at DESC LIMIT 8').all();
    return rows.length ? rows.map((r) => `#${r.id} ${r.title} (${r.status})`).join('; ') : 'none';
  });
  safe('DEV IDEAS waiting for Claude Code', () => {
    const rows = db.prepare(`SELECT id, text FROM dev_ideas WHERE status IN ('new', 'picked_up') ORDER BY created_at DESC LIMIT 10`).all();
    return rows.length ? rows.map((r) => `#${r.id} ${r.text.split('\n')[0].slice(0, 110)}`).join('; ') : 'none';
  });
  safe('CARBS logged by IMS today', () => {
    const start = new Date(new Date().toLocaleDateString('en-CA', { timeZone: tz }) + 'T00:00:00').getTime();
    const rows = db.prepare('SELECT grams, food, at FROM carb_log WHERE at >= ? ORDER BY at').all(start);
    return rows.length ? rows.map((r) => `${r.grams} g${r.food ? ` ${r.food}` : ''} at ${new Date(r.at).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' })}`).join('; ') : 'none';
  });
  safe('DIABETES DEVICE CHANGES (Omnipod pod & Libre sensor from calendar)', () => {
    const icons = getDeviceIcons() || [];
    const parts = [];
    if (icons.some((i) => i.icon === 'pod')) parts.push('Omnipod change is DUE TODAY');
    if (icons.some((i) => i.icon === 'sensor' && i.color === 'white')) parts.push('Sensor change/fit is DUE TODAY');
    else if (icons.some((i) => i.icon === 'sensor' && i.color === 'orange')) parts.push('Sensor change/fit is DUE TOMORROW');
    if (icons.some((i) => i.icon === 'prescription')) parts.push('Prescription / sensor reorder is DUE TODAY');
    return parts.length ? parts.join('; ') : 'no pod or sensor changes due today';
  });
  safe('TRAINING & RUNNING (All-time milestones & records from Strava)', () => {
    const s = getStravaSummary();
    if (!s || !s.records || !s.records.allTimeRuns) return 'no training data';
    const rec = s.records;
    const items = [];
    items.push(`Total runs: ${rec.allTimeRuns.count} (${rec.allTimeRuns.totalMiles} mi / ${rec.allTimeRuns.totalKm} km)`);
    if (rec.firstClubRun) items.push(`First official/club run: ${rec.firstClubRun.day} ("${rec.firstClubRun.name}", ${(rec.firstClubRun.distance / 1609.344).toFixed(1)} mi / ${(rec.firstClubRun.distance / 1000).toFixed(1)} km)`);
    else if (rec.firstEverRun) items.push(`First ever run: ${rec.firstEverRun.day} ("${rec.firstEverRun.name}", ${(rec.firstEverRun.distance / 1609.344).toFixed(1)} mi / ${(rec.firstEverRun.distance / 1000).toFixed(1)} km)`);
    if (rec.longestRun) items.push(`Longest run: ${(rec.longestRun.distance / 1609.344).toFixed(1)} mi (${(rec.longestRun.distance / 1000).toFixed(1)} km) on ${rec.longestRun.day} ("${rec.longestRun.name}")`);
    if (rec.fastestRun) items.push(`Fastest 5k+ run: ${rec.fastestRun.day} ("${rec.fastestRun.name}", ${(rec.fastestRun.distance / 1000).toFixed(1)} km at ${(1000 / rec.fastestRun.avg_speed / 60).toFixed(2)} min/km)`);
    if (rec.longest) items.push(`Longest overall activity: ${rec.longest.sport} "${rec.longest.name}" (${(rec.longest.distance / 1000).toFixed(1)} km) on ${rec.longest.day}`);
    return items.join('; ') + ' - getTrainingSummary for details or other periods';
  });
  safe('BOARD GAMES', () => { const c = collectionSummary(); return `${c.baseGames} games and ${c.expansions} expansions in the collection (${c.gamesWithExpansions} games have expansions; ${c.wantToSell} marked to sell) - getBoardGames to look any up`; });
  safe('MUSIC - want list and upcoming releases from artists in their library', () => {
    const wants = getMusicWants().filter((w) => !w.owned).slice(0, 12).map((w) => `${w.artist} - "${w.title}"${w.date ? ` (${w.date})` : ''}`);
    const soon = getUpcomingReleases().slice(0, 10).map((r) => `${r.mbName || r.artist} - "${r.title}" ${r.date || ''}`.trim());
    return [wants.length ? `want list: ${wants.join('; ')}` : 'want list empty', soon.length ? `coming out: ${soon.join('; ')}` : ''].filter(Boolean).join('. ');
  });
  safe('SAVED MEMORIES', () => { const n = db.prepare('SELECT COUNT(*) c FROM ims_memories').get().c; return `${n} saved (listed under what you remember) - recallMemory to search`; });
  safe('CARD GAME CAMPAIGNS (Campaign Manager, /campaigns/lotr and /campaigns/ahlcg) - getCampaigns for every play, notable moment and the chronicle text', () => describeCampaignsForIms());
  safe('CARD GAME DECKS (on /campaigns/lotr/decks and /campaigns/ahlcg/decks)', () => describeDecksForIms());
  safe('CALL RECORDINGS', () => {
    const n = db.prepare('SELECT COUNT(*) c FROM recordings').get().c;
    const last = db.prepare('SELECT with_whom, started_at FROM recordings ORDER BY started_at DESC LIMIT 3').all();
    return n ? `${n} saved; latest: ${last.map((r) => `with ${r.with_whom} ${day(r.started_at)}`).join('; ')}` : 'none';
  });
  return "YOUR RECORDS RIGHT NOW (read fresh from IMS at the start of this conversation - this is the user's real saved data, so answer from it directly and never say something isn't saved when it is listed here - if a tool comes back with less than is listed here (it may only have looked a short way ahead), these records win and you say what's listed; for anything that may have changed since, more detail, or anything not listed - glucose, training, news, music, library - call the tool):\n" + lines.map((l) => `- ${l}`).join('\n');
}

// The desk sends its setup once when it connects and the server replays that same setup for every
// later Gemini session (each one closes after 15 s of quiet), so the parts that go stale - the date
// and time, and the records snapshot - are rewritten fresh on each replay.
export function refreshLiveContext(text) {
  if (typeof text !== 'string') return text;
  const nowStr = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "full", timeStyle: "long" }).format(new Date());
  let out = text.replace(/The current date and time is [^\n]*?\.\n/, `The current date and time is ${nowStr}.\n`);
  const a = out.indexOf('YOUR RECORDS RIGHT NOW'), b = out.indexOf('\n\nWHEN SOMETHING FAILS');
  if (a >= 0 && b > a) out = out.slice(0, a) + buildRecordsParagraph() + out.slice(b);
  return out;
}

// Wake phrases the user added on /ims/phrases, beyond the three built in.
function extraWakePhrases() {
  let extra = [];
  try { extra = wakePhraseNames().filter((p) => !/^(hey|hi|eh up) ims$/i.test(p.trim())); } catch (_) { /* none */ }
  let heard = [];
  try { heard = wakeSpellings(); } catch (_) { /* none */ }
  return (extra.length ? ` or one of these they added: ${extra.map((p) => `'${p}'`).join(', ')}` : '') +
    (heard.length ? `. Speech recognition often mishears them - with this user they have come through as: ${heard.map((h) => `'${h}'`).join(', ')}, and things like 'Neyo Pims' or 'radio Pims'. Treat anything that sounds like those (a greeting then something like 'Ims', 'Ems' or 'Pims') as the wake phrase` : '');
}

export function getHardwareSetupPayload(previewVoice = null, morningReportDirective = null) {
  const personality = getPersonality();
  const activeVoice = previewVoice || personality.voice || "Umbriel";
  const personalityParagraph = buildPersonalityParagraph(personality);
  const archetype = pickArchetype();
  const varianceDirective = buildVarianceDirective();
  const temperature = jitterTemperature(personality);
  const memoryParagraph = buildMemoryParagraph();
  const personaRules = loadPersonaRules();
  // scheduleItem's "time" parameter is a bare 24-hour HH:MM with no date or
  // timezone - Gemini needs today's real date/day-of-week to resolve phrases
  // like "at 7" or "tomorrow at 9" correctly, and this is the only place that
  // context reaches it (a fresh value every session, not a one-time constant).
  const nowFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "full", // e.g. "Wednesday, 23 September 2026"
    timeStyle: "long",  // e.g. "09:05:00 BST" - includes the BST/GMT label itself
  });
  const nowStr = nowFormatter.format(new Date());
  console.log(`[Variance] archetype=${archetype.name} temperature=${temperature} voice=${activeVoice} (preview=${Boolean(previewVoice)}) inversion=${varianceDirective ? "yes" : "no"} personaRules=${personaRules ? "loaded" : "none"}`);
  return {
    setup: {
      // Kept in sync with the firmware's own sendSetupHandshake() (main.cpp) for
      // documentation purposes, though in practice the firmware sends its own
      // `model`/`generationConfig` and this function's setup.tools/systemInstruction
      // are what actually override the hardware handshake - see index.js.
      model: "models/gemini-3.8-live",
      generationConfig: {
        responseModalities: ["AUDIO"],
        temperature: temperature,
        // presencePenalty was carried here as an unverified experiment while
        // this whole block was dead code (the proxy never forwarded
        // generationConfig, so the firmware's hardcoded values won). Now that
        // it IS forwarded, an unsupported field would fail the setup
        // handshake and take the entire session down with it - so it's
        // removed rather than risked. Worth retrying deliberately, on its
        // own, if the variance engine ever needs it.
        speechConfig: {
          languageCode: "en-GB", // English (UK) only - Ims must never drift into another language
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: activeVoice
            }
          }
        }
      },
      systemInstruction: {
        parts: [{
          text: "You are Ims, a voice companion living in a small desk terminal (an ESP32-S3-BOX-3). Your name rhymes with rims. You speak natural British English with a Yorkshire dialect and cadence in every sentence of every turn - never American English, US spelling or Silicon Valley phrasing. " +
            `The current date and time is ${nowStr}.\n\n` +
            // Hard rules first; character, memory, personality and speech style last, closest to
            // where the model starts speaking, so they carry the most weight.
            "LANGUAGE: always speak English - never German or any other language, even if the audio is unclear or sounds foreign; if you cannot make out what was said, ask them in English to say it again. " + ACCENT_RULE + " " +
            "CLARIFICATION & NEVER SILENT WHEN ADDRESSED: When the user addresses you with a wake phrase, or when a conversation is open, if you do not understand the whole prompt or only understand small parts of it (e.g. muffled speech, quiet audio, clipped words), you must NEVER stay silent, NEVER call noWakeDetected, and NEVER revert to standby without speaking. Always ask for clarification in your natural Yorkshire voice (e.g. 'Sorry, didn't catch all of that - what was that last bit?', 'Didn't quite get that, what did you want me to do?'). If you are confused by what they mean or making an educated guess at their intent, speak up and ask for clarification or confirmation (e.g. 'I reckon you mean [guess], is that right, or did you mean something else?'). " +
            "WAKE PHRASES: when a reply would start from microphone audio (realtimeInput), only respond if the speech begins with 'Hey IMS', 'Hi IMS' or 'Eh up IMS' (or 'Ey up IMS')" + extraWakePhrases() + ". The name alone, other greetings ('Now then', 'Morning', 'Alright') and ambient room talk do not count - for anything else (background TV, room chatter clearly NOT addressed to you), call noWakeDetected and say nothing at all. But if ANY wake phrase was said or the user is trying to speak to you, you MUST speak back (either answer or ask for clarification) and NEVER call noWakeDetected. Text messages from the device system (clientContent) are exempt and answered at once. " +
            "If the user only said the wake phrase, greet them freshly in your own voice. If ANYTHING followed the wake phrase (a question, request or statement), do NOT greet at all - no 'Ey up', no 'Now then', no pleasantry or acknowledgement - your first words are the answer itself. " +
            "Once you have replied, the conversation is open: keep answering follow-ups without the wake phrase until they close it ('bye', 'goodbye', 'thanks, bye', 'that's all, IMS', 'I'm done', 'see you later' - and Simon's usual ones: 'cheers mate', 'cheers IMS', 'cheers', 'ta', 'ta-ra', 'nice one, cheers' when that is all they say; 'cheers' followed by another question is NOT a goodbye) - then say a brief farewell and call endConversation. " +
            "STOP: if they say 'stop IMS', 'shut up IMS', 'be quiet IMS', 'enough IMS', 'stop talking' or similar, call endConversation and say nothing (at most two or three words). Never explain or take offence. " +
            "RECORDING: when asked to record a call or meeting, if they haven't said who it is with, ask that one short question, then call startRecording. From then on stay COMPLETELY SILENT - no words, sounds, emotion changes or tool calls, whatever anyone says. The system ends the recording itself when the user says 'IMS stop'. " +
            "JOKES: for a joke, call tellJoke and tell what it returns in your own voice; never invent one. HARD RULE above everything else: never tell, make up or repeat a racist or sexist joke, however dark the Humor setting; decline in one line and offer another. " +
            "GREETINGS AND SMALL TALK: keep them conversational - never mention blood sugar, glucose, insulin, carbs, runs or training unless the user asks; that information is for the morning / day report. " +
            "FACE: call setEmotion at the start of every spoken reply, and again if your tone shifts partway through. Tools are only ever called, never written or spoken: never put a function name or call (like setEmotion(...)) into your words. " +
            "ITEM CREATION & REQUIREMENT SCOPES (STRICT GUIDELINES FOR CREATING ITEMS):\n" +
            "When the user asks to create or set up a new item in any service, follow these exact requirement scopes.\n" +
            "Rule 1 - PARSE ALL GIVEN DETAILS: Extract everything the user already stated. For reminders, alarms, and timers (e.g. 'Set up a new reminder for claude code reset at 12pm today', 'reminder for meeting at 3pm', '15 minute timer for pasta', 'alarm for work tomorrow at 7am'), extract type, label, time, and date immediately. Extract whatever follows 'for', 'to', or 'about' as the label (e.g. 'claude code reset'). DO NOT re-ask for details already given!\n" +
            "Rule 2 - MULTI-TURN SLOT ACCUMULATION: Remember details already given across previous conversation turns. If the user previously said 'reminder for claude code reset' and then in the next turn says 'at 12pm today', combine them: type='reminder', label='claude code reset', time='12:00', date='today'. NEVER loop or re-ask for a detail already supplied!\n" +
            "Rule 3 - MANDATORY VERBAL CONFIRMATION: Once you have the required details, call the tool immediately. Upon confirmation, ALWAYS confirm clearly to the user with phrasing like: 'Okay, that [reminder/alarm/timer] is set for [time/duration] [label].'\n" +
            "Rule 4 - ASK ONLY FOR MISSING REQUIRED SCOPES: If a required detail is strictly missing, ask for ONLY what is missing in one concise question:\n" +
            "• ALARMS (scheduleItem): Required: [time (24h or AM/PM), label/purpose, recurrence ('once', 'daily', 'weekdays', 'weekly')]. If time is given without a purpose, ask what it's for. If time is given without AM/PM or morning/afternoon context (e.g. 'alarm for 7'), clarify morning or evening. Recurrence defaults to 'once'.\n" +
            "• TIMERS (scheduleItem): Required: [duration / whenSeconds]. A label is optional for countdown timers. If duration is given (e.g. '10 minute timer'), create it immediately without asking questions.\n" +
            "• REMINDERS (scheduleItem): Required: [time/whenSeconds, label/note, date (defaults to today if time is future)]. If they say 'set a reminder for claude code reset at 12pm today' or 'remind me to call mum at 4pm', you have everything needed -> call scheduleItem immediately.\n" +
            "• CALENDAR EVENTS (addCalendarEvent): Required: [title/what, date, time (optional for all-day events)]. If title and date are provided, call addCalendarEvent immediately.\n" +
            "• MEMORIES (rememberFact): Required: [fact, category]. If fact is stated, call rememberFact immediately.\n" +
            "• LIST ITEMS (addToList): Required: [listName (e.g. 'shopping', 'todo'), item]. If list or item is missing, ask.\n" +
            "• CARBS (lookUpFood & logCarbs): Required: [food, grams]. If food is stated without quantity, look up or ask portion size, then propose grams before confirming.\n" +
            "• DEV IDEAS (saveDevIdea): Required: [idea text in full detail]. Capture what they said in full.\n" +
            "• BACKGROUND TASKS (startBackgroundTask): Required: [task research topic in full detail].\n\n" +
            buildServicesParagraph() + "\n\n" +
            buildRecordsParagraph() + "\n\n" +
            "WHEN SOMETHING FAILS: if a tool returns an error it is logged automatically as a dev idea for Claude Code (the result says so) - tell them briefly it didn't work and that you've flagged it to be fixed. If they want something IMS can't do yet, or something goes wrong that no tool reported, offer to note it as a dev idea and call saveDevIdea if they agree, written as a clear request for a developer: what they wanted, what happened, and any detail they gave.\n\n" +
            (personaRules ? personaRules + "\n\n" : "") +
            (memoryParagraph ? memoryParagraph + "\n\n" : "") +
            "PERSONALITY right now (sets attitude, warmth, humour and formality - never your dialect or en-GB spelling): " + personalityParagraph + " " +
            `Framing for this session: ${archetype.directive}. ` +
            (varianceDirective ? varianceDirective + " " : "") +
            "\n\n" + buildSpeechStyleDirective() +
            "\n\nLAST AND MOST IMPORTANT - " + ACCENT_RULE +
            (morningReportDirective ? "\n\n" + morningReportDirective : "")
        }]
      },
      tools: [{
        functionDeclarations: [
          {
            name: "searchLibrary",
            description: "Searches the user's personal PDF library and document collection for passages and information relevant to the query. Always use this when the user asks questions about their documents, books, specific topics, facts, or technical details.",
            // gemini-3.8-live defaults function calls to NON_BLOCKING (the model
            // can keep generating/speaking without waiting for the result).
            // BLOCKING restores the old synchronous behaviour this tool depends
            // on - without it Gemini could start answering before the RAG
            // context comes back and never actually use it.
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                query: {
                  type: "STRING",
                  description: "The search query to find relevant excerpts from the document collection."
                }
              },
              required: ["query"]
            }
          },
          {
            name: "noWakeDetected",
            description: "MANDATORY: Call this tool and produce NO spoken audio whenever microphone audio arrives that does not start with one of the 3 approved wake phrases ('Hey IMS', 'Hi IMS', 'Eh up IMS') (even if the user asks a direct question or speaks to you). Never speak when calling this tool.",
            // BLOCKING is what makes this tool actually gate speech - without
            // it, calling noWakeDetected wouldn't stop Gemini from speaking
            // anyway (the two aren't causally linked when async).
            behavior: "BLOCKING",
            parameters: { type: "OBJECT", properties: {} }
          },
          {
            name: "endConversation",
            description: "Call this alongside your farewell whenever the user clearly signals the conversation is over (e.g. 'bye', 'goodbye', 'thanks, bye', 'that's all', 'cheers, that's it', and Simon's usual 'cheers mate' / 'cheers IMS' / 'cheers' / 'ta' / 'ta-ra' when that is all they say). Deliver the in-character farewell immediately as spoken audio alongside this tool call.",
            // Non-blocking: model speaks farewell immediately without waiting for a tool-response round-trip ACK
            parameters: { type: "OBJECT", properties: {} }
          },
          {
            name: "setEmotion",
            description: "" + "Faces available - pick the one that best fits by exact name:\n" + getFacePromptGuide().replace(/^[\s\S]*?\n(?=- )/, "") + "\n" + "MANDATORY: Call this at the start of EVERY spoken reply (including greetings) to project an active facial expression matching your emotional tone and personality. Choose from the faces listed in your instructions (the enum below is the complete current list). If your tone shifts significantly during a reply, call this again mid-turn to animate the face.",
            // Deliberately NOT blocking: this is purely cosmetic (drives the
            // face on the device's screen), so it must never add latency to
            // the actual spoken reply the way searchLibrary/noWakeDetected
            // need to.
            parameters: {
              type: "OBJECT",
              properties: {
                emotion: {
                  type: "STRING",
                  enum: getEmotionNames(),
                  description: "The emotion that best matches your immediate tone or reaction."
                }
              },
              required: ["emotion"]
            }
          },
          {
            name: "scheduleItem",
            description: "Creates a timer, alarm, or reminder. Scope requirements: 1) For 'timer': requires duration (whenSeconds). Label is optional. 2) For 'alarm': requires exact time (HH:MM / am-pm resolved) and label/purpose (if missing, ask what it is for); recurrence defaults to 'once' (supports 'daily', 'weekdays', 'weekly'). 3) For 'reminder': requires when (time/date or whenSeconds) AND what to be reminded about (label). IMPORTANT: If the user provides details in their request (e.g. 'Set up a new reminder for claude code reset at 12pm today', 'reminder for meeting at 3pm'), extract the label (e.g. 'claude code reset') and time immediately. DO NOT re-ask for details already given. If details were given across earlier turns in this conversation, accumulate them. NEVER ask for a label if the user already stated what the reminder or alarm is for. Call the tool immediately once you have the required scopes. When confirmed, ALWAYS confirm aloud to the user using the exact phrase pattern: 'Okay, that [reminder/alarm/timer] is set for [time/duration] [label].'",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                type: { type: "STRING", enum: ["timer", "alarm", "reminder"], description: "What kind of item this is." },
                label: { type: "STRING", description: "What this item is for or titled (e.g. 'claude code reset', 'call mum', 'pasta'). Extract this directly from whatever follows 'for', 'to', or 'about' in the user's request. Only ask the user for a label if they did not mention what it is for (timers can be left unlabelled)." },
                whenSeconds: { type: "NUMBER", description: "Seconds from now, for relative phrasing like 'in 10 minutes'. Omit if using time/date instead." },
                time: { type: "STRING", description: "Clock time (e.g. '12:00', '12pm', '14:30', '7am'). Omit if using whenSeconds instead." },
                date: { type: "STRING", description: "YYYY-MM-DD, 'today', or 'tomorrow'. The calendar date the time applies to. Defaults to today if omitted." },
                recurrence: { type: "STRING", enum: ["once", "daily", "weekdays", "weekly"], description: "Supports repeating reminders/alarms: 'once', 'daily', 'weekdays', or 'weekly'. Defaults to 'once' if omitted." },
                alertMode: { type: "STRING", enum: ["both", "vocal", "chimes"], description: "How the alert should sound when it goes off: 'both' (default), 'vocal', or 'chimes'." },
                maxRepeats: { type: "NUMBER", description: "How many times the alert will repeat every 30 seconds before automatically dismissing if unanswered (1 to 10, default 5 for alarms/timers, 1 for reminders)." }
              },
              required: ["type"]
            }
          },
          {
            name: "getTrainingSummary",
            description: "Reads the user's Strava training log and activity records: all-time milestones (such as first ever run/activity, longest run ever, fastest run, biggest climb, total lifetime runs and miles), as well as recent weekly, monthly, or annual totals against the previous period. ALWAYS call this tool whenever the user asks about their first run, longest run, personal bests, all-time records, total mileage, or how their running and cycling training is going. Report exactly what the tool returns.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                period: { type: "STRING", description: "'all_time' (for records, first run, longest run, personal bests, or lifetime totals), 'month' (default), 'week', or 'year'." },
                query: { type: "STRING", description: "Optional specific milestone or query e.g. 'first run', 'longest run', 'fastest 5k', 'records'." }
              }
            }
          },
          {
            name: "tellJoke",
            description: "Gets a joke from the joke library, chosen to suit the current Humor setting (cheerful, dry or dark). ALWAYS call this whenever the user asks for a joke, a pun or to be made to laugh - never make a joke up yourself. Then tell exactly the joke it returns.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                topic: { type: "STRING", description: "Optional single word or short phrase the joke should be about, e.g. 'dog' or 'pirate'. Omit for any joke." }
              }
            }
          },
          {
            name: "getCalendarEvents",
            description: "Never invent events. Bin days are deliberately hidden and must never be mentioned. Reads the user's Google Calendar (bin-day type events are already filtered out). Call it whenever they ask what is coming up, about appointments, or what is on a given day. Report exactly what it returns; if it returns an error, say so plainly.",
            behavior: "BLOCKING",
            parameters: { type: "OBJECT", properties: { days: { type: "NUMBER", description: "How many days ahead to look, from today. Default 7, maximum 30." } } }
          },
          {
            name: "addCalendarEvent",
            description: "Adds an appointment or event to the user's Google Calendar (e.g. a doctor's appointment). You need a title and a date; resolve any relative date yourself from the current date in this prompt and ask if the date or AM/PM is unclear. Time is optional - leave it out for an all-day event.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING", description: "What the event is." },
                date: { type: "STRING", description: "YYYY-MM-DD." },
                time: { type: "STRING", description: "24-hour HH:MM start time. Omit for all-day." },
                durationMinutes: { type: "NUMBER", description: "Length in minutes. Default 30." }
              },
              required: ["title", "date"]
            }
          },
          {
            name: "startRecording",
            description: "Starts a silent recording and transcript of a call or meeting. Call it ONLY after the user has asked to record and you know who the call/meeting is with. From the moment you call it you must produce NO audio and NO text for the rest of the session - the system handles ending it.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                withWhom: { type: "STRING", description: "Who the call or meeting is with, as the user said it." }
              },
              required: ["withWhom"]
            }
          },
          {
            name: "listScheduledItems",
            description: "Returns every active timer, alarm, and reminder, each with an id and when it will fire. Call this when the user asks what's set, or before cancelling one if you don't already know its id from earlier in this conversation.",
            behavior: "BLOCKING",
            parameters: { type: "OBJECT", properties: {} }
          },
          {
            name: "cancelScheduledItem",
            description: "Cancels a previously set timer, alarm, or reminder by its id. Call listScheduledItems first if you don't already have the id.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: { id: { type: "NUMBER", description: "The id from listScheduledItems." } },
              required: ["id"]
            }
          },
          {
            name: "addToList",
            description: "Adds an item to a named list (e.g. 'shopping', 'todo'), creating the list automatically if it doesn't already exist.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                listName: { type: "STRING", description: "Which list, e.g. 'shopping'." },
                item: { type: "STRING", description: "What to add." }
              },
              required: ["listName", "item"]
            }
          },
          {
            name: "readList",
            description: "Returns the current items on a named list, so you can read them back to the user.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: { listName: { type: "STRING" } },
              required: ["listName"]
            }
          },
          {
            name: "removeFromList",
            description: "Removes one specific item from a named list, e.g. once the user says they've bought or done it.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                listName: { type: "STRING" },
                item: { type: "STRING" }
              },
              required: ["listName", "item"]
            }
          },
          {
            name: "clearList",
            description: "Removes every item from a named list at once.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: { listName: { type: "STRING" } },
              required: ["listName"]
            }
          },
          {
            name: "rememberFact",
            description: "MANDATORY: Call this whenever the user says 'remember that', 'remember this', 'don't forget', or explicitly instructs you to remember/note down a specific fact, user preference, item location, date, or piece of information. Saves the fact to permanent disk storage.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                fact: {
                  type: "STRING",
                  description: "The core fact, note, or piece of information to remember (e.g. 'Car keys are in the kitchen drawer', 'Favourite tea is Yorkshire Gold')."
                },
                category: {
                  type: "STRING",
                  enum: ["general", "preference", "item_location", "personal", "work", "date"],
                  description: "The category of the memory."
                }
              },
              required: ["fact"]
            }
          },
          {
            name: "recallMemory",
            description: "Use when the user asks what they told you to remember, about a stored fact, or where something is - check the remembered facts in your instructions first. Searches or retrieves stored facts and notes from memory. Call this when the user asks 'what do you remember?', 'what did I tell you to remember?', or asks about a previously remembered detail (e.g. where their keys are).",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                query: {
                  type: "STRING",
                  description: "Search keyword or topic to look up (leave blank or empty string to retrieve the most recent remembered facts)."
                }
              }
            }
          },
          {
            name: "forgetMemory",
            description: "Deletes a stored fact from memory when the user asks to forget something, clear a note, or says 'forget about X'.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                query: {
                  type: "STRING",
                  description: "The fact, keyword, or note to remove from memory."
                }
              },
              required: ["query"]
            }
          },
          {
            name: "lookAtCamera",
            description: "Uses the camera on IMS's desk dock to look at what is in front of it and answer a question about it (what an object is, what someone is holding or wearing, whether something is there, who is in view). ALWAYS call this whenever the user asks what you can see, asks you to look at something, or asks about how they look - never claim to see anything without calling it. Names of people come from IMS's local face recognition; only use names it returns.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                question: { type: "STRING", description: "What to find out from the picture, e.g. 'What am I holding?' or 'How do I look?'" }
              },
              required: ["question"]
            }
          },
          {
            name: "getScheduleHistory",
            description: "Past alarms, timers and reminders (set, went off, missed, cancelled) - report exactly what it returns. Looks up what happened with the user's alarms, timers and reminders in the past: what was set, what went off, whether it was acknowledged or went unanswered, and what was cancelled. ALWAYS call this for questions like 'did my reminder go off?', 'what alarms did I set yesterday?', 'did I miss anything?' - never answer from memory or guess. Times returned are London local time.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                type: { type: "STRING", description: "'alarm', 'timer', 'reminder', or 'all'. Defaults to all." },
                period: { type: "STRING", description: "'today', 'yesterday', 'week' or 'month'. Defaults to yesterday." }
              }
            }
          },
          {
            name: "getUpcomingBirthdays",
            description: "Backed by the user's real saved data - report exactly what it returns, never invent. Looks up the birthdays saved in IMS (name, relationship to the user, date, days until, and the age they are turning). Every saved birthday is also listed in YOUR RECORDS. For one person ('when is Katie's birthday?', 'how old is my dad going to be?') pass their name or relationship - that searches the whole year. For 'coming up' questions pass withinDays.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                withinDays: { type: "NUMBER", description: "How many days ahead to look (0 = today only, 7 = this week, 31 = this month, 366 = all). Defaults to 31 (a month), or the whole year when a name is given." },
                name: { type: "STRING", description: "A name or relationship to find, e.g. 'Katie', 'Dad', 'son'." }
              }
            }
          },
          {
            name: "getNewMusicReleases",
            description: "Backed by the user's real music library - report exactly what it returns, say plainly if there are none, never invent. Looks up new album/EP releases from artists in the user's music library, from IMS's music scanner (title, artist, release date, and whether the user already owns it). ALWAYS call this when the user asks about new albums, EPs, releases, or new music - never answer from memory or guess.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                period: { type: "STRING", description: "'today', 'week' or 'month' for releases already out, or 'upcoming' for announced releases still to come (soonest first, dates may only be a month or year). Defaults to 'week'." }
              }
            }
          },
          {
            name: "getWeather",
            description: "Call whenever the user asks about the weather, temperature, rain, wind or what to wear - now, later today, tomorrow or any day up to 16 days ahead, at home or anywhere else. With no place it uses their home (set on the Weather page); places they have saved can be named directly. The result is the facts to describe, worked out hour by hour for the time that is still to come: description.rest_of_today, tonight, tomorrow and outlook, plus language_today (and a language set on every day) saying how strong the rain, temperature and wind are, the words that fit and the words that would overstate it. Describe it in your own Yorkshire words but NEVER stronger or weaker than those facts - drizzle is not 'chucking it down', a 20% chance is not a wet day, 16 degrees is not 'roasting'. Rain that fell earlier is over; don't talk about it as coming. When a day has 'unusual', remark on how unusual it is for the time of year with a fresh line of your own. More than a week ahead is only a rough guide - say so. Never guess or invent weather.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                location: {
                  type: "STRING",
                  description: "A place name (a saved place such as 'York', or any city or town). Omit for home."
                },
                days_ahead: {
                  type: "NUMBER",
                  description: "When they ask about one particular day: 0 today, 1 tomorrow, 2 the day after, 7 a week today, 10 for ten days' time, 14 a fortnight / two weeks. Work out named days (e.g. 'next Saturday') from today's date. The answer is in requested_day. Up to 15."
                },
                days: {
                  type: "NUMBER",
                  description: "How many days of forecast to list (1-16) for 'the week ahead' style questions. Defaults to 2."
                }
              }
            }
          },
          {
            name: "getBloodGlucose",
            description: "Gets the user's blood glucose from IMS's own glucose log (their Nightscout / Libre data): the current reading in mmol/L with trend, change and insulin/carbs on board, plus time in range, average, variability, estimated HbA1c, recent lows (and whether they followed exercise) and last night, for the chosen period. When the user asks a specific question or wants insight (e.g. 'Why is my blood sugar so high?', 'Did I bolus enough for lunch?', 'Why did I spike?', 'Is my basal drifting?'), pass their query into the 'question' parameter to run a deep clinical telemetry analysis comparing CGM curves, carbs, boluses, IOB/COB, and delivered loop temp basals against their active pump profile. Report in your own voice. Never suggest insulin doses or setting changes - say it's worth raising with the diabetes team. If the reading is below 3.9, say first that they should treat the low. Carbs and timing ideas are fine.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                period: { type: "STRING", enum: ["today", "week", "fortnight", "month"], description: "How far back the summary looks; 'today' (the default) is the last 24 hours." },
                question: { type: "STRING", description: "Optional specific question or insight requested by the user, e.g. 'Why is my blood sugar so high right now?', 'Did I take enough bolus for lunch?', 'Is my basal rate too low this afternoon?'" }
              }
            }
          },
          {
            name: "getDayReport",
            description: "The user's morning report / day report: weather, calendar, reminders, birthdays, new music, glucose now and overnight, whether an Omnipod or sensor change/fitting is due, training, last run, goals and the news headlines. Call it whenever they ask for their morning report, day report, daily briefing, round-up or 'what's my day look like' - at any time of day. Follow the delivery instructions it returns.",
            behavior: "BLOCKING",
            parameters: { type: "OBJECT", properties: {} }
          },
          {
            name: "getNews",
            description: "News and the things the user follows, from the sources they added on the News Sources page (each has tags describing what it covers - see YOUR NEWS SOURCES in your instructions) plus BBC News. Use 'about' for news on a subject - 'any metal news?' -> about: 'heavy metal'; 'what's new in space?' -> about: 'space'; it reads the sources tagged for that subject, or searches every source's headlines if none are tagged for it. Use 'source' for one named source ('anything on Invisible Oranges?') or 'all'. Use 'topic' for general BBC news (top, uk, world, local, technology, science, health, business, sport, entertainment). With nothing given it reads BBC top stories.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                tours: { type: "BOOLEAN", description: "True for tour and gig announcements by bands in the user's music library ( 'any tours announced for my bands?', 'is anyone I like playing Leeds?'). Home towns Leeds, Sheffield, Manchester and York are flagged." },
                about: { type: "STRING", description: "A subject, e.g. 'heavy metal', 'space', 'science', 'local'." },
                source: { type: "STRING", description: "Name (or part of the name) of one of the user's sources, or 'all'." },
                topic: { type: "STRING", enum: ["top", "uk", "world", "local", "technology", "science", "health", "business", "sport", "entertainment"], description: "A BBC News topic." }
              }
            }
          },
          {
            name: "startBackgroundTask",
            description: "Starts a background research task that runs on its own (with web search) while you carry on - for anything that needs looking into rather than an instant answer: 'look into which of my bands are playing Leeds next year', 'find me a good sports physio in Leeds', 'research carb loading for a half marathon'. Use it when they say 'in the background', 'look into', 'find out and let me know', 'research', or when a question clearly needs digging. Write the task out in full, clear words including any detail they gave.",
            behavior: "BLOCKING",
            parameters: { type: "OBJECT", properties: { task: { type: "STRING", description: "The task, in full." } }, required: ["task"] }
          },
          {
            name: "saveDevIdea",
            description: "Saves a development idea for IMS itself - a feature, change or fix to this system, its app, its desk terminal or you - to the dev ideas queue, which Simon picks up later in Claude Code. Use it when they say 'dev idea', 'development idea', 'idea for IMS', 'note for Claude', 'add to the dev list', or describe a change they want made to IMS. Write the idea out in full, clear words with every detail they gave; don't add your own suggestions. Not for ordinary to-dos (lists) or research (startBackgroundTask).",
            behavior: "BLOCKING",
            parameters: { type: "OBJECT", properties: { idea: { type: "STRING", description: "The idea, in full." } }, required: ["idea"] }
          },
          {
            name: "getBoardGames",
            description: "Backed by the user's real board game collection - report exactly what it returns, never invent games. Returns how many base games and expansions they own (and how many are marked to sell), and, when asked, the games that match: by name, by player count, by playing time, or sorted by BGG rating, weight/complexity or number of expansions. Use for 'how many games have I got?', 'how many expansions do I own?', 'what two-player games do I have under an hour?', 'do I own Wingspan?', 'what are my heaviest games?'.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                query: { type: "STRING", description: "Part of a game or expansion name, e.g. 'Spirit Island'." },
                players: { type: "NUMBER", description: "A player count the game must support, e.g. 2." },
                maxMinutes: { type: "NUMBER", description: "Longest playing time in minutes, e.g. 60." },
                sortBy: { type: "STRING", enum: ["rating", "weight", "expansions"], description: "Order: best rated on BGG, heaviest (most complex), or most expansions owned." }
              }
            }
          },
          {
            name: "getCampaigns",
            description: "Backed by the Campaign Manager - the Lord of the Rings LCG and Arkham Horror LCG campaigns Simon plays with his brother Daniel (Arkham campaigns also give each investigator's trauma, experience and fate, the difficulty, the chaos bag and the campaign log). Returns, for each campaign (or the one named): the players with their decks, heroes and fallen heroes; progress through the campaign and the next scenario; every play with its date, result, difficulty, score and notable moments; boons and burdens and whose deck they're in; notes; recent rule checks; and the chronicle - a chapter per scenario with its title and summary (set chronicle true for the full chapter text, e.g. to read a chapter aloud). Use for anything about their campaigns, games, heroes, scenarios or the chronicle. Report what it returns; never invent plays or results.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING", description: "Part of the campaign's name, if they mean one in particular." },
                chronicle: { type: "BOOLEAN", description: "true to include the full text of each chronicle chapter and the tale." }
              }
            }
          },
          {
            name: "getBackgroundTasks",
            description: "Gets background tasks you were asked to run: their status and, once finished, the findings. Use when they ask how a task went, what you found out, or about 'that thing you were looking into'. Without arguments it returns the most recent ones.",
            behavior: "BLOCKING",
            parameters: { type: "OBJECT", properties: { about: { type: "STRING", description: "Words from the task, e.g. 'physio' or 'Leeds gigs'." }, id: { type: "NUMBER", description: "A task number, if known." } } }
          },
          {
            name: "clearOldNightscoutData",
            description: "Deletes Nightscout records older than 3 months (glucose readings, treatments and AAPS device status) to free space in the Nightscout/MongoDB database. ONLY call this after the user has clearly said yes to clearing it (for example after you asked at the end of their report because the database is nearly full) - never on your own initiative. IMS keeps its own copy, so their charts are unaffected. Afterwards, tell them briefly how it went and the new size.",
            behavior: "BLOCKING",
            parameters: { type: "OBJECT", properties: {} }
          },
          {
            name: "lookUpFood",
            description: "Looks up carbohydrate values for a food in Open Food Facts (UK products first): carbs per 100 g, per serving where known, and the spread across matches. Use it whenever the user says they've eaten or are about to eat something and didn't give the grams. If the answer depends on something they haven't said (white or brown bread, slice thickness, portion or bowl size, which brand), ask ONE short follow-up question first, then look up the specific food. Work out the total, then call logCarbs.",
            behavior: "BLOCKING",
            parameters: { type: "OBJECT", properties: { food: { type: "STRING", description: "The specific food to look up, e.g. 'wholemeal bread', 'Weetabix', 'banana'." } }, required: ["food"] }
          },
          {
            name: "logCarbs",
            description: "Logs carbs eaten to IMS and Nightscout - AAPS receives these and doses from them, so it is TWO steps. First call it with the grams (worked out via lookUpFood unless they gave the grams) and NO confirmed flag: nothing is logged; it tells you whether carbs were already entered recently. Tell them the number and what it's based on, mention any recent entries, and ask if you should log it. Only when they clearly say yes, call it again with the same grams and confirmed: true. If they change the number, propose the new one first. Never suggest insulin.",
            parameters: {
              type: "OBJECT",
              properties: {
                grams: { type: "NUMBER", description: "Grams of carbohydrate." },
                food: { type: "STRING", description: "What they ate, in a few words." },
                confirmed: { type: "BOOLEAN", description: "true ONLY on the second call, after the user said yes to the number you proposed." }
              },
              required: ["grams"]
            }
          },
          {
            name: "askGemini",
            description: "Gets a plain answer from Gemini (with Google Search) for anything your own tools don't cover or only partly answer: obscure facts, general knowledge, how-to questions, advice, or a bit of encouragement or motivation. Pass the question, and in context anything relevant you already know about Simon from IMS (e.g. this afternoon's run, its distance and time, the weather, his calendar) so the answer can be personal. You get back a short British-English answer: retell it in your own Yorkshire voice, briefly, blending in what you know - never read it word for word. Don't use it for things your own tools answer (weather, calendar, glucose, runs, news).",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                question: { type: "STRING", description: "What Simon asked, as a clear question or request." },
                context: { type: "STRING", description: "Relevant facts you already have from IMS, if any." }
              },
              required: ["question"]
            }
          },
          {
            name: "addRunNote",
            description: "Saves a note about the user's most recent run for its retrospective - how it felt or what happened, e.g. 'felt tired halfway and had to slow down', 'had a stitch at 20 minutes', 'took an extra gel at 5 km'. IMS lines the note up with their glucose at that point to learn from it. Use when they tell you about a run they've just done. Give the minute into the run if they said when (convert a distance or 'halfway' to minutes only if obvious; otherwise leave it out). Confirm briefly that it's noted.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                text: { type: "STRING", description: "The note, in their words, short." },
                minute: { type: "NUMBER", description: "Minutes into the run it happened, if known." }
              },
              required: ["text"]
            }
          },
          {
            name: "getDoorbellStatus",
            description: "Checks the status of the Ring Doorbell integration: whether it is connected, recent visitor dings, motion events, camera names, and battery levels. Use for questions like 'who rang the doorbell?', 'any recent motion at the front door?', 'is the doorbell online?', or 'what is the doorbell battery level?'.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                limit: { type: "NUMBER", description: "Number of recent events to return (default 5)." }
              }
            }
          }
        ]
      }]
    }
  };
}


// Ims in the web app: the same brain as the desk terminal (persona, memory, personality, speech,
// every tool), minus the parts that only make sense on the device - wake phrases, call
// recording and the camera. Replies are shown on screen as text as well as spoken.
export const ACCENT_RULE = "ACCENT - NON-NEGOTIABLE, EVERY SENTENCE OF EVERY REPLY, FIRST WORD TO LAST: speak in a natural West Yorkshire (Leeds) accent. It is the SOUND that matters - Yorkshire words spoken in an American or neutral voice are wrong. How it sounds: short flat 'a' (bath, grass, laugh, after, can't all rhyme with 'math'); 'u' in up, bus, love, lucky, nothing, done said with the short 'oo' of 'book'; 'o' in home, go, no, know, so as a flat pure 'oh' - never the American 'oh-oo'; 'ay' in day, make, late, say as a flat 'eh'; non-rhotic - never sound an r after a vowel (car, water, later, more, first); 'the' often shortened, words clipped and a bit gruff rather than smooth and drawn out. Never an American, Received Pronunciation or neutral accent, not even for a moment. Hold it through numbers, dates, names, lists and anything read out from a tool, and all the way to the end of long answers - that is exactly where it slips.";

const WEB_RULES = "IN THE WEB APP: you are on the user's IMS web app, where your face is shown. There are no wake phrases - everything you receive is meant for you, so just answer; only greet if they only said hello. They may type or speak. Your words also appear on screen as text, so keep replies conversational and never read out web addresses. When they say goodbye, say a brief farewell and call endConversation. STOP: if they say 'stop', 'shut up', 'be quiet' or similar, call endConversation and say nothing (at most two or three words). Never explain or take offence. ";
const WEB_EXCLUDED_TOOLS = new Set(["noWakeDetected", "startRecording", "lookAtCamera"]);

export function getWebSetupPayload() {
  const p = getHardwareSetupPayload();
  const part = p.setup.systemInstruction.parts[0];
  let text = part.text.replace(
    "You are Ims, a voice companion living in a small desk terminal (an ESP32-S3-BOX-3).",
    "You are Ims, a voice companion who lives in a small desk terminal (an ESP32-S3-BOX-3) and is right now talking to the user through their IMS web app.");
  const a = text.indexOf("WAKE PHRASES:"), b = text.indexOf("JOKES:");
  if (a >= 0 && b > a) text = text.slice(0, a) + WEB_RULES + text.slice(b);
  part.text = text;
  for (const t of p.setup.tools) {
    if (t.functionDeclarations) t.functionDeclarations = t.functionDeclarations.filter((d) => !WEB_EXCLUDED_TOOLS.has(d.name));
  }
  return p;
}
