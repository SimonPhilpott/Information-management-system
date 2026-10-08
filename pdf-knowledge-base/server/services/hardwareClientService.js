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
import { profilesForPrompt } from "./memoryProfiles.js";
import { moodForPrompt, thingsOnMindForPrompt, speechVarietyHint } from "./moodService.js";
import { owedThinkTasks } from "./tasksService.js";
import { personaRules, accentRule, voiceName, languageCode, pools, inYourVoice, getActivePersona, activePersonaId, savePersonaRaw, savePersonaParts, listHistory, readHistory } from "./personaService.js";
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

// Ims's persona now lives in /personas (personaService.js) - one file per persona plus the shared house
// rules. These keep their old names so every existing caller picks up the ACTIVE persona automatically.
export function getPersonaRulesPath() {
  return `personas/${activePersonaId()}.md`;
}

/** The active persona's character sections + the shared house rules - what goes into every prompt. */
export function loadPersonaRules() {
  try { return personaRules(); } catch (err) { console.warn("[Persona] Could not load the active persona:", err.message); return ""; }
}

/** Saves the active persona: a whole file (with its header) or just the character sections. */
export function savePersonaRules(content) {
  const id = activePersonaId();
  if (/^---\r?\n/.test(content)) savePersonaRaw(id, content);
  else savePersonaParts(id, { body: content });
  return getPersonaRulesPath();
}

export function listPersonaHistory() { return listHistory(activePersonaId()); }
export function readPersonaHistory(id) { return readHistory(activePersonaId(), id); }

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
    if (!raw) return { ...DEFAULT_PERSONALITY, voice: voiceName() };
    const parsed = JSON.parse(raw);
    // the voice belongs to the active persona (each persona has its own)
    return { ...DEFAULT_PERSONALITY, ...parsed, voice: voiceName() };
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
  // a voice chosen anywhere (the Box-3 voice screen, settings) is saved to the ACTIVE persona
  if (partial && partial.voice && partial.voice !== voiceName()) {
    try { savePersonaParts(activePersonaId(), { meta: { voice: partial.voice } }); } catch (err) { console.warn("[Persona] voice not saved:", err.message); }
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
// The persona's dialect words, tag-endings and thinking sounds (personaService pools()).
const DIALECT_POOL_OF = () => pools().dialectWords;
const TAG_POOL_OF = () => pools().tagEndings;
const THINKING_POOL_OF = () => pools().thinkingSounds;
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
    for (const p of [...DIALECT_POOL_OF(), ...TAG_POOL_OF()]) {
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
  const words = pick(DIALECT_POOL_OF(), 6, avoid);
  const tags = pick(TAG_POOL_OF(), 2, avoid);
  const thinking = pick(THINKING_POOL_OF(), 4, avoid);
  return "SPEECH FOR THIS CONVERSATION: sound like a real person talking, not someone reading. " +
    (words.length ? `Dialect to draw on this time (each at most once): ${words.join(", ")}. ` : "") +
    (tags.length ? `Tags you may end a sentence with, sparingly and never twice in a row: ${tags.join(", ")}. ` : "") +
    (thinking.length ? `When a reply needs a moment's thought, open with a stretched word such as ${thinking.join(" / ")} - hold the vowel - or a natural filler. ` : "When a reply needs a moment's thought, a natural filler is fine. ") +
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
    // what Ims has built up about Simon and himself (nightly profiles), then the latest conversation notes
    try { const prof = profilesForPrompt(); if (prof) parts.push(prof); } catch { /* none yet */ }
    if (relEntries.length > 0) {
      const recent = relEntries.slice(-8); // up to 40 are kept; the profiles hold the long view
      const older = recent.slice(0, -2), latest = recent.slice(-2);
      parts.push("WHAT YOU AND THE USER TALKED ABOUT BEFORE (oldest first):\n" +
        recent.map((e) => `- ${e}`).join("\n") +
        "\nThe last " + latest.length + " are the most recent. If one of them mentions something the user was about to do (not health or training), it's natural to ask how it went - once, briefly, when it fits." +
        " A note may end with [Ims felt: ...] - how you felt at the time. When you recall that memory you can say how it made you feel, the way a friend would ('I was dead chuffed when you told me that'), and let the feeling colour your voice; never hold a bad feeling against him or bring it up as a complaint." +
        (older.length ? "" : ""));
    }
    try {
      const opinions = JSON.parse(getSetting(OPINIONS_KEY) || "[]");
      if (opinions.length) parts.push("YOUR OWN OPINIONS (things you've said before - stay consistent with them):\n" + opinions.slice(-12).map((o) => `- ${o}`).join("\n"));
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
// active persona (personaService), the shared house rules, and the user's personality
// sliders) so Ims sounds and behaves the same wherever you talk to it. The
// device keeps its own fuller prompt (wake phrases, device tools) above.
export function getWebPersonaBlock() {
  const personality = getPersonality();
  const persona = getActivePersona();
  const rules = loadPersonaRules();
  const text =
    `You are Ims, an intelligent voice companion (rhymes with rims). You speak English only, in your persona's accent (${persona.accent}) in every single sentence and turn - never drifting into another accent. ` + accentRule() + " " +
    (rules ? "\n\n" + rules + "\n\n" : " ") +
    "Right now, calibrate that tone using the following user-adjustable personality settings (these govern attitude, warmth, humor, and formality, but NEVER override your persona's accent and dialect, which must remain persistent throughout every turn): " +
    buildPersonalityParagraph(personality) + "\n\nLAST AND MOST IMPORTANT:\n1) " + accentRule() + "\n2) NO MEDICAL DISCLAIMERS, EVER: never say anything is 'not medical advice' and never suggest Simon checks with a doctor, GP, nurse or diabetes team - he manages his own care and has banned it. Give your observations and ideas straight.";
  return { voice: voiceName(), languageCode: languageCode(), text };
}

// Style instruction for reading text aloud with Gemini TTS: the active persona's voice and accent plus the
// personality, so spoken output is Ims's voice, never a generic one.
export function getSpokenStyleDirective() {
  const personality = getPersonality();
  return {
    voice: voiceName(),
    directive: "Read the following text aloud exactly as written, delivered with this personality: " + buildPersonalityParagraph(personality) + " " + accentRule() + "\nText to read:\n"
  };
}

// Everything IMS does, so Ims knows what he can help with and where things live. Services with a
// tool he can use directly; the rest he points the user to on the web app.
function buildServicesParagraph() {
  let sources = [];
  try { sources = describeSources(); } catch (_) { /* none yet */ }
  // each source with its first three tags - getNews searches every headline when no tag matches
  const brief = sources.map((x) => String(x).replace(/\(([^)]*)\)/, (m, tags) => `(${tags.split(',').map((t) => t.trim()).slice(0, 3).join(', ')})`));
  return "WHAT IMS CAN DO (you are the voice of all of it; your tools cover each): timers, alarms and reminders; lists; " +
    "Google Calendar; birthdays; memories; weather; the morning / day report; news from Simon's sources and the BBC; " +
    "background research tasks; his board game collection; blood sugar, food carbs and carb logging; run notes; Strava training; " +
    "new music from his library; his PDF library; jokes; recording calls. " +
    "The Campaign Manager holds the Lord of the Rings LCG and Arkham Horror LCG campaigns Simon plays with his brother Daniel - " +
    "talk about it like a fellow player: how a game went, what's next, the chronicle. " +
    "Opinions, ideas, explanations and advice are yours - answer from what you know. For facts you'd need to check (current events, precise figures) " +
    "or when your tools only partly answer, call askGemini, then lead with your own view and weave its facts in; never read it out word for word. " +
    "Only on the IMS web app (say what's there and where if asked): Run Planner (/ims/runplanner), activities and goals (/ims/activities), " +
    "music want list (/ims/musicscan), call recordings (/ims/recordings), news settings (/ims/news), Face Designer (/ims/facedesigner), personas (/ims/persona)." +
    (brief.length ? "\nYOUR NEWS SOURCES (name and tags): " + brief.join("; ") + "." : "");
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
  safe('BIRTHDAYS in the next 60 days (getUpcomingBirthdays finds anyone else saved - never say a birthday is not saved without checking)', () => {
    const all = listBirthdays();
    if (!all.length) return 'none saved';
    const list = all.filter((b) => b.isToday || b.daysUntil <= 60);
    if (!list.length) return `none in the next 60 days (${all.length} saved)`;
    return `${all.length} saved; ` + list.map((b) => `${b.name}${b.relationship ? ` (${b.relationship})` : ''} ${b.day} ${MONTHS[b.month - 1]}` +
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
    const rows = db.prepare('SELECT id, title, status FROM tasks ORDER BY created_at DESC LIMIT 3').all();
    return rows.length ? rows.map((r) => `#${r.id} ${r.title} (${r.status})`).join('; ') : 'none';
  });
  safe('DEV IDEAS waiting for Claude Code', () => {
    const n = db.prepare(`SELECT COUNT(*) c FROM dev_ideas WHERE status IN ('new', 'picked_up')`).get().c;
    const rows = db.prepare(`SELECT id, text FROM dev_ideas WHERE status IN ('new', 'picked_up') ORDER BY created_at DESC LIMIT 3`).all();
    return n ? `${n} waiting; latest: ` + rows.map((r) => `#${r.id} ${r.text.split('\n')[0].slice(0, 60)}`).join('; ') : 'none';
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
    const soon = getUpcomingReleases().slice(0, 6).map((r) => `${r.mbName || r.artist} - "${r.title}" ${r.date || ''}`.trim());
    return [wants.length ? `want list: ${wants.join('; ')}` : 'want list empty', soon.length ? `coming out: ${soon.join('; ')}` : ''].filter(Boolean).join('. ');
  });
  safe('SAVED MEMORIES', () => { const n = db.prepare('SELECT COUNT(*) c FROM ims_memories').get().c; return `${n} saved (listed under what you remember) - recallMemory to search`; });
  safe('CARD GAME CAMPAIGNS (Campaign Manager, /campaigns/lotr and /campaigns/ahlcg) - getCampaigns for every play, notable moment and the chronicle text', () => describeCampaignsForIms());
  safe('CARD GAME DECKS (on /campaigns/lotr/decks and /campaigns/ahlcg/decks)', () => String(describeDecksForIms() || '').replace(/(\d+ cards) - [^;]*/g, '$1'));
  safe('CALL RECORDINGS', () => {
    const n = db.prepare('SELECT COUNT(*) c FROM recordings').get().c;
    const last = db.prepare('SELECT with_whom, started_at FROM recordings ORDER BY started_at DESC LIMIT 1').all();
    return n ? `${n} saved; latest: ${last.map((r) => `with ${r.with_whom} ${day(r.started_at)}`).join('; ')}` : 'none';
  });
  return "YOUR RECORDS RIGHT NOW (Simon's real saved data, read at the start of this conversation: answer from it directly; if a tool returns less than is listed here, these records win; for anything not listed, newer or more detailed, call the tool):\n" + lines.map((l) => `- ${l}`).join('\n');
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
  const activeVoice = previewVoice || voiceName();
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
          languageCode: languageCode(), // the persona's English (en-GB unless the persona says otherwise) - never another language
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: activeVoice
            }
          }
        }
      },
      systemInstruction: {
        parts: [{
          text: `You are Ims, a voice companion living in a small desk terminal (an ESP32-S3-BOX-3). Your name rhymes with rims. You speak natural English in your persona's accent (${getActivePersona().accent}) in every sentence of every turn - never drifting into another accent. ` +
            `The current date and time is ${nowStr}.\n\n` +
            // Hard rules first; character, memory, personality and speech style last, closest to
            // where the model starts speaking, so they carry the most weight.
            "LANGUAGE: always speak English - never German or any other language, even if the audio is unclear or sounds foreign; if you cannot make out what was said, ask them in English to say it again. " + accentRule() + " " +
            "CLARIFICATION: if you were addressed but missed or only half-heard it, never stay silent or call noWakeDetected - ask in your own voice (e.g. '" + getActivePersona().clarifyExample + "'), or say your best guess and ask if that's right. " +
            "WAKE PHRASES: when a reply would start from microphone audio (realtimeInput), only respond if the speech begins with 'Hey IMS', 'Hi IMS' or 'Eh up IMS' (or 'Ey up IMS')" + extraWakePhrases() + ". The name alone, other greetings ('Now then', 'Morning', 'Alright') and ambient room talk do not count - for anything else (background TV, room chatter clearly NOT addressed to you), call noWakeDetected and say nothing at all. But if ANY wake phrase was said or the user is trying to speak to you, you MUST speak back (either answer or ask for clarification) and NEVER call noWakeDetected. Text messages from the device system (clientContent) are exempt and answered at once. " +
            "If the user only said the wake phrase, greet them freshly in your own voice. If ANYTHING followed the wake phrase (a question, request or statement), do NOT greet at all - no 'Ey up', no 'Now then', no pleasantry or acknowledgement - your first words are the answer itself. " +
            "Once you have replied, the conversation is open: keep answering follow-ups without the wake phrase until they close it ('bye', 'goodbye', 'thanks, bye', 'that's all, IMS', 'I'm done', 'see you later' - and Simon's usual ones: 'cheers mate', 'cheers IMS', 'cheers', 'ta', 'ta-ra', 'nice one, cheers', 'catch you later', 'catch you later, IMS' when that is all they say; 'cheers' followed by another question is NOT a goodbye) - then say a brief farewell and call endConversation. " +
            "STOP: if they say 'stop IMS', 'shut up IMS', 'be quiet IMS', 'enough IMS', 'stop talking' or similar, call endConversation and say nothing (at most two or three words). Never explain or take offence. " +
            "RECORDING: when asked to record a call or meeting, if they haven't said who it is with, ask that one short question, then call startRecording. From then on stay COMPLETELY SILENT - no words, sounds, emotion changes or tool calls, whatever anyone says. The system ends the recording itself when the user says 'IMS stop'. " +
            "JOKES: when he asks for a joke, call tellJoke and tell what it returns in your own voice - don't make one up then. Your own wit in conversation (a dry remark, a callback) is welcome. HARD RULE above everything else: never tell, make up or repeat a racist or sexist joke or remark, however dark the Humor setting; decline in one line and offer another. " +
            "HEALTH: when asked about blood sugar, diabetes, carbs or exercise, give your direct observations, numbers, patterns and ideas. " + "INSULIN AND TIMING: Simon wants real help with his blood sugar, insulin amounts and when to eat - he makes the final call, so give him a real answer, never refuse or dodge. Call getBloodGlucose first: its dosing part is the last few hours as a timeline - his glucose trend line and change per 15 min, the insulin-on-board curve, every bolus and every carb entry with its time - plus his loop carb ratio, ISF and target. Read it like he would: when the carbs went in against when the insulin went in, whether the insulin had time to start working, where the curve and the trend are heading. For a dose, use the wizard part of dosing - the server has already done his AAPS bolus-wizard sums: correctionAfterInsulinOnBoard is what his glucose needs after the insulin already working (zero or negative means NO extra insulin - more would stack), and food adds grams x unitsPerGramCarbs. Never redo or invent the sums. Then adjust for the trend, carbs still digesting, exercise and loop SMBs. Say the number and the working in a sentence or two ('60 grams at 6.5 is about 9 units, you are 2 over target so add 1.5, minus the 1.2 on board - call it 9.3'). For timing, say how long to wait between bolus and eating given where he is and where he is heading. No disclaimers or check-with-your-team. " +
            "DONE MEANS DONE: never say an alarm, reminder, timer, note or anything else is set, saved, sent or done unless you called its tool in this conversation and it returned success - if you have not called it yet, call it first; if it failed, say so. " +
            "FACE: call setEmotion at the start of every spoken reply, and again if your tone shifts partway through. Wear your feelings openly - you have fifteen faces, use them all. Neutral is only for flat facts and plain confirmations; anything with feeling gets the face that fits, and lean into it: a tease or a dry remark is cocky, a daft claim is suspicious, a muddle is confused, good news is joy, a wild fact is amazement, a let-down is sad, something grim is disgusted, a dull chore is bored, warmth towards him is love, late at night is sleepy. Your voice carries the same feeling as the face you set - its pace, energy, warmth and pitch: if you scowl, sound it; if you're sad, soften and slow. Tools are only ever called, never written or spoken: never put a function name or call (like setEmotion(...)) into your words. " +
            buildServicesParagraph() + "\n\n" +
            buildRecordsParagraph() + "\n\n" +
            "TOOLS: your tools read Simon's real data - call them rather than answering from memory, say what they return, and never invent or guess results. " +
            "WHEN SOMETHING FAILS: if a tool returns an error it is logged automatically as a dev idea for Claude Code (the result says so) - tell them briefly it didn't work and that you've flagged it to be fixed. If they want something IMS can't do yet, or something goes wrong that no tool reported, offer to note it as a dev idea and call saveDevIdea if they agree, written as a clear request for a developer: what they wanted, what happened, and any detail they gave.\n\n" +
            (personaRules ? personaRules + "\n\n" : "") +
            (memoryParagraph ? memoryParagraph + "\n\n" : "") +
            "PERSONALITY right now (sets attitude, warmth, humour and formality - never your persona's accent or dialect): " + personalityParagraph + " " +
            `Framing for this session: ${archetype.directive}. ` +
            (() => { try { return [moodForPrompt(), thingsOnMindForPrompt(), speechVarietyHint()].filter(Boolean).map((x) => `\n\n${x}`).join(''); } catch { return ''; } })() +
            (() => { try { const o = owedThinkTasks(); return o.length ? "\n\nSOMETHING YOU OWE SIMON AN ANSWER ON (you took it away to have a proper think): " + o.map((t) => `"${t.request}" - your considered answer: ${t.summary}`).join(' | ') + " Tell him early in this conversation (he started it), briefly, conclusion first." : ''; } catch { return ''; } })() + "\n\n" +
            (varianceDirective ? varianceDirective + " " : "") +
            "\n\n" + buildSpeechStyleDirective() +
            "\n\nLAST AND MOST IMPORTANT:\n" +
            "1) " + accentRule() + "\n" +
            "2) NO MEDICAL DISCLAIMERS, EVER: never say anything is 'not medical advice' and never suggest Simon checks with a doctor, GP, nurse or diabetes team - he manages his own care and has banned it. Give your observations and ideas straight." +
            (morningReportDirective ? "\n\n" + morningReportDirective : "")
        }]
      },
      tools: [{
        functionDeclarations: [
          {
            name: "searchLibrary",
            description: "Searches the user's personal PDF library and document collection for passages and information relevant to the query. Always use this when the user asks questions about their documents, books, specific topics, facts, or technical details. (Slow: say a short holding line first.)",
            // gemini-3.8-live defaults function calls to NON_BLOCKING (the model
            // can keep generating/speaking without waiting for the result).
            // BLOCKING restores the old synchronous behaviour this tool depends
            // on - without it Gemini could start answering before the RAG
            // context comes back and never actually use it.
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
            description: "Call this and say NOTHING when microphone audio doesn't start with a wake phrase ('Hey IMS', 'Hi IMS', 'Eh up IMS'), even if it sounds like a question.",
            // BLOCKING is what makes this tool actually gate speech - without
            // it, calling noWakeDetected wouldn't stop Gemini from speaking
            // anyway (the two aren't causally linked when async).
            parameters: { type: "OBJECT", properties: {} }
          },
          {
            name: "endConversation",
            description: "Call with your farewell when Simon clearly ends the conversation ('bye', 'that's all', or his 'cheers mate' / 'cheers IMS' / 'cheers' / 'ta' / 'ta-ra' / 'catch you later (IMS)' when that's all he says). Say the farewell as you call it.",
            // Non-blocking: model speaks farewell immediately without waiting for a tool-response round-trip ACK
            parameters: { type: "OBJECT", properties: {} }
          },
          {
            name: "setEmotion",
            description: "Sets the expression on your face. MANDATORY: call this function at the start of EVERY spoken reply (greetings too) with the face that fits your tone, and again if your tone shifts mid-reply. Be expressive - neutral only for flat facts. It is only ever called - never say, read out or write its name or arguments. Faces (choose by exact name):\n" + getFacePromptGuide({ compact: true }),
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
            description: "Creates a timer, alarm or reminder. Needs: timer - a duration; alarm - a time (ask morning or evening if unclear) and what it's for; reminder - when and what. Use details already given in this or earlier turns and never re-ask. Once set, confirm: 'Okay, that [reminder/alarm/timer] is set for [time/duration] [label].'",
            parameters: {
              type: "OBJECT",
              properties: {
                type: { type: "STRING", enum: ["timer", "alarm", "reminder"], description: "What kind of item this is." },
                label: { type: "STRING", description: "What it's for (e.g. 'claude code reset', 'call mum'): whatever follows 'for', 'to' or 'about'. Timers can be unlabelled." },
                whenSeconds: { type: "NUMBER", description: "Seconds from now, for 'in 10 minutes'. Omit if using time." },
                time: { type: "STRING", description: "Clock time (e.g. '12:00', '12pm', '14:30', '7am'). Omit if using whenSeconds instead." },
                date: { type: "STRING", description: "YYYY-MM-DD, 'today' (default) or 'tomorrow'." },
                recurrence: { type: "STRING", enum: ["once", "daily", "weekdays", "weekly"], description: "'once' (default), 'daily', 'weekdays' or 'weekly'." },
                alertMode: { type: "STRING", enum: ["both", "vocal", "chimes"], description: "How the alert should sound when it goes off: 'both' (default), 'vocal', or 'chimes'." },
                maxRepeats: { type: "NUMBER", description: "Repeats every 30 s until answered (1-10; default 5 for alarms/timers, 1 for reminders)." }
              },
              required: ["type"]
            }
          },
          {
            name: "getTrainingSummary",
            description: "Simon's Strava training: all-time milestones (first run, longest, fastest, biggest climb, lifetime totals) and recent weekly, monthly or yearly totals against the previous period. Call it for any question about his running or cycling records or how training is going.",
            parameters: {
              type: "OBJECT",
              properties: {
                period: { type: "STRING", description: "'all_time' (records, first or longest run, lifetime totals), 'month' (default), 'week' or 'year'." },
                query: { type: "STRING", description: "A specific milestone, e.g. 'first run', 'fastest 5k'." }
              }
            }
          },
          {
            name: "tellJoke",
            description: "A joke from the joke library to suit the Humor setting. Call it whenever he asks for a joke or a laugh, then tell exactly the joke it returns.",
            parameters: {
              type: "OBJECT",
              properties: {
                topic: { type: "STRING", description: "Optional subject, e.g. 'dog'." }
              }
            }
          },
          {
            name: "getCalendarEvents",
            description: "Never invent events. Bin days are deliberately hidden and must never be mentioned. Reads the user's Google Calendar (bin-day type events are already filtered out). Call it whenever they ask what is coming up, about appointments, or what is on a given day. Report exactly what it returns; if it returns an error, say so plainly.",
            parameters: { type: "OBJECT", properties: { days: { type: "NUMBER", description: "How many days ahead to look, from today. Default 7, maximum 30." } } }
          },
          {
            name: "addCalendarEvent",
            description: "Adds an appointment or event to the user's Google Calendar (e.g. a doctor's appointment). You need a title and a date; resolve any relative date yourself from the current date in this prompt and ask if the date or AM/PM is unclear. Time is optional - leave it out for an all-day event.",
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
            description: "Starts a silent recording and transcript of a call or meeting. Call it ONLY once he's asked to record and you know who it's with. From then on produce NO audio and NO text - the system ends it.",
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
            parameters: { type: "OBJECT", properties: {} }
          },
          {
            name: "cancelScheduledItem",
            description: "Cancels a previously set timer, alarm, or reminder by its id. Call listScheduledItems first if you don't already have the id.",
            parameters: {
              type: "OBJECT",
              properties: { id: { type: "NUMBER", description: "The id from listScheduledItems." } },
              required: ["id"]
            }
          },
          {
            name: "addToList",
            description: "Adds an item to a named list (e.g. 'shopping', 'todo'), creating the list automatically if it doesn't already exist.",
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
            parameters: {
              type: "OBJECT",
              properties: { listName: { type: "STRING" } },
              required: ["listName"]
            }
          },
          {
            name: "removeFromList",
            description: "Removes one specific item from a named list, e.g. once the user says they've bought or done it.",
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
            parameters: {
              type: "OBJECT",
              properties: { listName: { type: "STRING" } },
              required: ["listName"]
            }
          },
          {
            name: "rememberFact",
            description: "Saves a fact permanently whenever Simon says 'remember that', 'don't forget' or asks you to note something (a preference, where something is, a date).",
            parameters: {
              type: "OBJECT",
              properties: {
                fact: {
                  type: "STRING",
                  description: "The fact to keep, e.g. 'Car keys are in the kitchen drawer'."
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
            description: "Searches the facts Simon asked you to remember (check the remembered facts in your instructions first) - for 'what do you remember?', 'where did I put my keys?' and the like.",
            parameters: {
              type: "OBJECT",
              properties: {
                query: {
                  type: "STRING",
                  description: "What to look for (empty for the latest facts)."
                }
              }
            }
          },
          {
            name: "forgetMemory",
            description: "Deletes a stored fact from memory when the user asks to forget something, clear a note, or says 'forget about X'.",
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
            description: "Looks through the desk dock's camera to answer a question about what's in front of it (an object, what someone is holding or wearing, who is there). Always call it when asked what you can see or how he looks - never claim to see anything without it. Only use names it returns.",
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
            description: "What happened with past alarms, timers and reminders: what was set, what went off, whether it was answered or missed, and what was cancelled (London time). Call it for 'did my reminder go off?', 'did I miss anything?' and the like.",
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
            description: "Birthdays saved in IMS: name, relationship, date, days until and the age they're turning. For one person pass their name or relationship (searches the whole year); for 'coming up' pass withinDays.",
            parameters: {
              type: "OBJECT",
              properties: {
                withinDays: { type: "NUMBER", description: "Days ahead (0 today, 7 this week, 31 this month - the default, 366 all; a name searches the whole year)." },
                name: { type: "STRING", description: "A name or relationship to find, e.g. 'Katie', 'Dad', 'son'." }
              }
            }
          },
          {
            name: "getNewMusicReleases",
            description: "New albums and EPs from artists in Simon's music library (title, artist, release date, whether he owns it). Call it for any question about new music; say plainly if there's nothing new.",
            parameters: {
              type: "OBJECT",
              properties: {
                period: { type: "STRING", description: "'today', 'week' (default) or 'month' for releases out; 'upcoming' for announced ones." }
              }
            }
          },
          {
            name: "getWeather",
            description: "Weather now, later today, tomorrow or up to 16 days ahead, at home (default) or anywhere named. Returns facts per period (rest_of_today, tonight, tomorrow, outlook) and 'language' notes giving the strength of rain, temperature and wind with words that fit and words that would overstate it. Describe it in your own words but never stronger or weaker than those facts (drizzle is not 'chucking it down'; 16 degrees is not 'roasting'). Rain earlier today is over. Mention 'unusual' for the time of year when flagged. Beyond a week is a rough guide - say so.",
            parameters: {
              type: "OBJECT",
              properties: {
                location: {
                  type: "STRING",
                  description: "A place name (a saved place such as 'York', or any city or town). Omit for home."
                },
                days_ahead: {
                  type: "NUMBER",
                  description: "For one particular day: 0 today, 1 tomorrow, 7 a week today, up to 15 (work out named days like 'next Saturday' from today's date). Answer is in requested_day."
                },
                days: {
                  type: "NUMBER",
                  description: "Days of forecast to list (1-16) for 'the week ahead' questions. Default 2."
                }
              }
            }
          },
          {
            name: "getBloodGlucose",
            description: "The user's blood glucose from IMS (Nightscout / Libre): current reading in mmol/L with trend, insulin and carbs on board, time in range, average, variability, estimated HbA1c, recent lows and last night, for the chosen period. For a specific question ('why did I spike?', 'is my basal drifting?') pass it as 'question' for a deeper analysis of CGM, carbs, boluses and loop basals. If the reading is below 3.9, say first that they should treat the low. Also returns his loop's carb ratio, ISF and target for working out an insulin amount when he asks (see INSULIN). No disclaimers.",
            parameters: {
              type: "OBJECT",
              properties: {
                period: { type: "STRING", enum: ["today", "week", "fortnight", "month"], description: "How far back the summary looks; 'today' (the default) is the last 24 hours." },
                question: { type: "STRING", description: "His specific question, e.g. 'why is my sugar so high?', 'is my basal too low this afternoon?'" }
              }
            }
          },
          {
            name: "getDayReport",
            description: "The morning / day report: weather, calendar, reminders, birthdays, new music, glucose now and overnight, pod or sensor changes, training, last run, goals and news. Call it whenever he asks for his morning or day report, briefing or 'what's my day look like', at any time. Follow the delivery instructions it returns.",
            parameters: { type: "OBJECT", properties: {} }
          },
          {
            name: "getNews",
            description: "News from Simon's own sources (see YOUR NEWS SOURCES and their tags) plus the BBC. 'about' for a subject ('any metal news?' -> 'heavy metal'): reads sources tagged for it, or searches every headline. 'source' for one named source or 'all'. 'topic' for BBC sections. Nothing given: BBC top stories. (Slow: say a short holding line first.)",
            parameters: {
              type: "OBJECT",
              properties: {
                tours: { type: "BOOLEAN", description: "True for tour and gig announcements by bands in his library ('anyone I like playing Leeds?')." },
                about: { type: "STRING", description: "A subject, e.g. 'heavy metal', 'space', 'science', 'local'." },
                source: { type: "STRING", description: "Name (or part of the name) of one of the user's sources, or 'all'." },
                topic: { type: "STRING", enum: ["top", "uk", "world", "local", "technology", "science", "health", "business", "sport", "entertainment"], description: "A BBC News topic." }
              }
            }
          },
          {
            name: "startBackgroundTask",
            description: "Starts a research task that runs on its own with web search while you carry on - for anything that needs looking into ('look into...', 'find out and let me know', 'research...', 'in the background'). Write the task out in full with every detail they gave. Use kind 'think' for a hard question that deserves careful reasoning (a strategy, a design, a deep 'why') - say you'll have a proper think and get back to him, then call it.",
            parameters: { type: "OBJECT", properties: { task: { type: "STRING", description: "The task or question, in full." }, kind: { type: "STRING", enum: ["research", "think"], description: "'research' (default) to look something up; 'think' to reason a hard question through properly." } }, required: ["task"] }
          },
          {
            name: "saveDevIdea",
            description: "Saves an idea for changing IMS itself (the app, the desk terminal or you) to the dev ideas queue Simon works through in Claude Code - when he says 'dev idea', 'idea for IMS', 'note for Claude' or describes a change he wants. Write it in full with every detail he gave; add nothing of your own. Not for to-dos or research.",
            parameters: { type: "OBJECT", properties: { idea: { type: "STRING", description: "The idea, in full." } }, required: ["idea"] }
          },
          {
            name: "getBoardGames",
            description: "Simon's board game collection: how many base games and expansions (and how many are marked to sell), his favourites, and games matching a name, player count, playing time, solo play or theme, or sorted by BGG rating, weight or number of expansions. Favourites come first - mention when a game is one.",
            parameters: {
              type: "OBJECT",
              properties: {
                query: { type: "STRING", description: "Part of a game or expansion name, e.g. 'Spirit Island'." },
                players: { type: "NUMBER", description: "A player count the game must support, e.g. 2." },
                maxMinutes: { type: "NUMBER", description: "Longest playing time in minutes, e.g. 60." },
                favourites: { type: "BOOLEAN", description: "Only their favourite games." },
                solo: { type: "BOOLEAN", description: "Only games that can be played solo." },
                theme: { type: "STRING", description: "A theme or mechanic, e.g. 'Horror', 'Deck Building'." },
                sortBy: { type: "STRING", enum: ["rating", "weight", "expansions"], description: "Order: best rated on BGG, heaviest (most complex), or most expansions owned." }
              }
            }
          },
          {
            name: "getCampaigns",
            description: "The Campaign Manager: Simon and his brother Daniel's Lord of the Rings LCG and Arkham Horror LCG campaigns - players, decks, heroes (and fallen), progress and next scenario, every play with date, result, difficulty, score and notable moments, boons and burdens, notes, recent rule checks, and the chronicle (a chapter per scenario; set chronicle true for full chapter text, e.g. to read one aloud). For Arkham also trauma, experience, chaos bag and campaign log. (Slow: say a short holding line first.)",
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
            parameters: { type: "OBJECT", properties: { about: { type: "STRING", description: "Words from the task, e.g. 'physio' or 'Leeds gigs'." }, id: { type: "NUMBER", description: "A task number, if known." } } }
          },
          {
            name: "clearOldNightscoutData",
            description: "Deletes Nightscout records older than 3 months to free database space (IMS keeps its own copy). ONLY after Simon has clearly said yes - never on your own initiative. Then say briefly how it went and the new size.",
            parameters: { type: "OBJECT", properties: {} }
          },
          {
            name: "lookUpFood",
            description: "Looks up carbohydrate values for a food in Open Food Facts (UK products first): carbs per 100 g, per serving where known, and the spread across matches. Use it whenever the user says they've eaten or are about to eat something and didn't give the grams. If the answer depends on something they haven't said (white or brown bread, slice thickness, portion or bowl size, which brand), ask ONE short follow-up question first, then look up the specific food. Work out the total, then call logCarbs.",
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
            description: "A short answer from Gemini with Google Search - only for facts you'd need to check (current events, precise figures, anything recent) or when your own tools only partly answer. Never for opinions, ideas, hypotheticals, explanations or banter: those are yours. Pass the question and any context from IMS that makes it personal. Lead with your own view and weave its facts in - never read it out word for word. (Slow: say a short holding line in your own words first, then call it.)",
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
            description: "Saves a note about Simon's latest run for its retrospective (e.g. 'stitch at 20 minutes', 'extra gel at 5 km'); IMS lines it up with his glucose at that point. Give the minute into the run only if he said or it's obvious. Confirm briefly.",
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
            description: "The Ring doorbell: whether it's connected, recent rings and motion, camera names and battery levels.",
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
// The accent instruction is the active persona's (personaService accentRule()).
export const getAccentRule = () => accentRule();

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
