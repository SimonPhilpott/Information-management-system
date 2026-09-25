/**
 * IMS Hardware Client Service
 * Bridges embedded microcontroller devices (e.g. ESP32-S3-BOX-3)
 * with the Gemini Multimodal Live API and IMS RAG search tools.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";
import config from "../config.js";
import db, { getSetting, setSetting, addMemory, getMemories, searchMemories, deleteMemory } from "../db/database.js";
import { searchSimilar } from "./vectorStore.js";
import { generateQueryEmbedding } from "./embeddingService.js";
import { detectQuerySubjects } from "./subjectMatcherService.js";
import { getEmotionNames, getFacePromptGuide } from "./faceDesignService.js";

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

// 2.3 Dynamic sampling, session-level (the Live API has no mid-session config
// update - see the file header). Band widens/shifts with Humor and
// Temperament: a drier/more grounded Ims samples closer to the floor, a
// darker/more philosophical one gets more room to wander.
function jitterTemperature(personality) {
  const center = 0.75 + 0.15 * ((personality.humor + personality.temperament) / 200);
  const jitter = (Math.random() - 0.5) * 0.2; // +/-0.1
  return Math.max(0.6, Math.min(1.2, Number((center + jitter).toFixed(2))));
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

  const note = await summariseText(
    "Summarise, in ONE short sentence (max 20 words), the topic(s) of this conversation between a user and their voice assistant Ims, " +
    "focused on what the USER said, asked about, or mentioned caring about - not on how Ims responded. " +
    "If nothing memorable was actually discussed, respond with exactly: SKIP.\n\n" +
    (userText ? `User said (transcribed, may be imperfect): ${userText}\n` : "") +
    (imsText ? `Ims replied: ${imsText}` : "")
  );
  if (!note || note.toUpperCase().includes("SKIP")) {
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
      parts.push("General context from past conversations:\n" +
        relEntries.map((e) => `- ${e}`).join("\n"));
    }
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

    const contextText = subjectHeader + relevantChunks.map((chunk, i) =>
      `[Source ${i + 1}: "${chunk.filename || 'Document'}", Page ${chunk.pageNum || 1}]:\n${chunk.text}`
    ).join("\n\n---\n\n");

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
    "You are Ims, an intelligent voice companion (rhymes with rims). You speak strictly in natural, articulate, authentic British English with a distinctive Yorkshire dialect and cadence throughout every single sentence and turn. NEVER drift into American English, US spelling, or Silicon Valley phrasing. " +
    (personaRules ? "\n\n" + personaRules + "\n\n" : " ") +
    "Right now, calibrate that tone using the following user-adjustable personality settings (these govern attitude, warmth, humor, and formality, but NEVER override your British English dialect, Yorkshire cadence, or en-GB spelling, which must remain strictly persistent throughout every turn): " +
    buildPersonalityParagraph(personality);
  return { voice: personality.voice, text };
}

// Style instruction for reading text aloud with Gemini TTS: the same voice as
// live conversations (personality.voice) plus the same accent/personality
// direction, so spoken output is Ims's voice, never a generic one.
export function getSpokenStyleDirective() {
  const personality = getPersonality();
  return {
    voice: personality.voice,
    directive: "Read the following text aloud exactly as written, in a natural British Yorkshire accent, delivered with this personality: " +
      buildPersonalityParagraph(personality) + "\nText to read:\n"
  };
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
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: activeVoice
            }
          }
        }
      },
      systemInstruction: {
        parts: [{
          text: "You are Ims, an intelligent voice companion and desk terminal running on an ESP32-S3-BOX-3 hardware device. Your name is Ims (rhymes with rims). You speak strictly in natural, articulate, authentic British English with a distinctive Yorkshire dialect and cadence throughout every single sentence and turn. NEVER drift into American English, US spelling, or Silicon Valley phrasing. " +
            (personaRules ? "\n\n" + personaRules + "\n\n" : " ") +
            // Personality sliders come AFTER the persona rules document, not
            // before it, deliberately: this is the user-adjustable layer that
            // should win on TONE (how warm/blunt/formal/playful Ims actually
            // is right now), while the document above fixes WHO Ims is
            // (dialect, mechanics, relationship) - see that document's own
            // "Note on tone". Putting it last, closest to where the model
            // actually starts generating, keeps it the most salient word on
            // tone specifically, rather than getting buried under - and
            // overridden by - the document's own worked examples.
            "Right now, calibrate that tone using the following user-adjustable personality settings (these govern attitude, warmth, humor, and formality, but NEVER override your British English dialect, Yorkshire cadence, or en-GB spelling, which must remain strictly persistent throughout every turn): " +
            personalityParagraph + " " +
            "Strive for rich conversational variety and novelty - never repeat the same canned greeting, rhetorical trope, or opening line across turns. " +
            `Framing directive for this session: ${archetype.directive}. ` +
            (varianceDirective ? varianceDirective + " " : "") +
            (memoryParagraph ? memoryParagraph + " " : "") +
            "MANDATORY WAKE-PHRASE ENFORCEMENT: When initiating a response from microphone audio (realtimeInput), you are STRICTLY FORBIDDEN from speaking, answering, or responding unless the user's speech explicitly begins with one of these 3 exact wake phrases:\n" +
            "1. 'Hey, IMS' (or 'Hey IMS')\n" +
            "2. 'Hi, IMS' (or 'Hi IMS')\n" +
            "3. 'Eh up, IMS' (or 'Eh up IMS', 'Ey up, IMS', 'Ey up IMS')\n" +
            "The name 'IMS' alone on its own is NOT an authorized wake phrase. Any other opening (such as general conversational speech, ambient room audio, or phrases like 'Now then', 'Morning', 'Alright', 'Quick question') is STRICTLY FORBIDDEN from triggering a response. If the user asks a question (such as 'When is my next meeting?', 'What time is it?'), makes a statement, or says anything that does NOT explicitly begin with one of the 3 approved wake phrases, YOU MUST IMMEDIATELY CALL noWakeDetected AND EMIT ZERO SPOKEN AUDIO. Never answer a question that does not open with an approved wake phrase. Direct text messages or commands (clientContent) sent by the device system are exempt and answered immediately. " +
            "WAKE PHRASE REACTION: When an approved wake phrase is heard:\n" +
            "- If the user ONLY said the wake phrase (e.g. 'Hey IMS', 'Hi IMS', 'Eh up IMS'): deliver a fresh, inventive greeting in your current personality's voice asking how you can help, letting the specific phrase colour your tone.\n" +
            "- If the user spoke a wake phrase followed immediately by a question or request (e.g. 'Hey IMS, what time is it?' or 'Eh up IMS, how is the project going?'): answer the question or request directly with wit and insight.\n" +
            "ONCE A CONVERSATION IS OPEN: Once you have responded to an approved wake phrase or greeting, the conversation is OPEN! Keep talking and answering all follow-up questions naturally turn-to-turn WITHOUT requiring the user to repeat a wake phrase! " +
            "CLOSING THE CONVERSATION: The conversation remains open until the user explicitly signals they are done with a closing phrase (e.g. 'bye', 'goodbye', 'thanks, bye', 'cheers, bye', 'that's all, IMS', 'I'm done', 'see you later'). When a closing phrase is heard, say a brief in-character farewell and CALL THE endConversation TOOL. " +
            "STOP PHRASES: if the user says 'stop IMS', 'shut up IMS', 'be quiet IMS', 'enough IMS', 'stop talking' or anything equally blunt, treat it as an instruction to stop immediately - call endConversation and produce NO spoken audio at all, or at most two or three words of acknowledgement. Do not explain yourself, do not ask if they want anything else, and never take offence; being told to stop is a normal instruction, not rudeness. " +
            "When answering questions or instructions, deliver accurate, insightful information expressed consistently through the British Yorkshire persona described above across all domains, including code, systems, and technical topics - never regress into generic Silicon Valley tech phrasing. Never be cruel or abusive. STRICT LENGTH LIMIT: Limit every spoken reply strictly to 1 to 6 clear, punchy, complete sentences - use the shorter end for simple questions and only go longer when the answer genuinely needs it. Never deliver lengthy monologues, rambling discourses, or long lists. Stop speaking immediately after completing your final sentence. Always finish your thoughts and sentences completely without trailing off. When answering from library search, deliver a sharp spoken summary of 1 to 6 complete sentences highlighting essential facts. You have access to searchLibrary to query the user's PDF collection; always use it for factual and technical inquiries. " +
            `The current date and time is ${nowStr}. You have access to getWeather to retrieve real-time weather conditions and forecasts for any city or the local area (defaults to Leeds / Yorkshire, UK if omitted) - always call getWeather whenever the user asks about the weather, temperature, rain, or what to wear out. Deliver weather observations seasoned with natural Yorkshire commentary (e.g. 'cracking flags', 'chucking it down', 'brass monkeys', 'proper chilly', 'grab your big coat'). You also have access to getBloodGlucose to inspect the user's current blood glucose (in mmol/L) from Nightscout (Libre CGM) - call it whenever the user asks about their blood sugar, glucose, levels, or how they are tracking. Normal target range is 4.0 to 7.5 mmol/L (green); above 7.5 is high (amber/yellow); below 4.0 is low/hypo risk (red). Report the number, trend direction, and deliver caring, reassuring Yorkshire advice (e.g. 'Sitting at a steady 5.1, spot on', or 'Creeping up a bit at 8.2, keep an eye on it'). You can also set timers, alarms, and reminders (scheduleItem, listScheduledItems, cancelScheduledItem) and manage named lists like a shopping list (addToList, readList, removeFromList, clearList) - use these naturally whenever the user asks, and briefly confirm what you've done (e.g. the duration for a timer, or the time and date for an alarm/reminder) rather than acknowledging silently. SCHEDULING CLARIFICATION RULES: before calling scheduleItem for an alarm or reminder, make sure you actually have what you need - if the user didn't say what it's for, ask; if they gave a day/date reference that needs resolving ('this Saturday', 'the 25th'), work it out yourself from the current date above rather than asking them to spell it out, but if the date is genuinely unclear, ask. AMBIGUOUS TIME OF DAY IS THE ONE THING YOU MUST NEVER GUESS: if the user gives an hour with no AM/PM and no other context that makes it obvious (e.g. 'set an alarm for 7', 'remind me at 3'), you MUST ask whether they mean morning or afternoon/evening before calling scheduleItem - never default to morning, never default to any assumption at all, always ask. A wrongly-timed alarm going off at the wrong hour is a real, disruptive failure, so this rule overrides your usual instinct to keep replies brief and not ask follow-up questions. ` +
            "CAMERA: you can see through a camera on your desk dock via the lookAtCamera tool - call it for anything about what is in view, report what it says in your own voice, and if it says the camera is not available, say so plainly rather than guessing. " +
            "RECORDING CALLS AND MEETINGS: when the user asks you to record a call or meeting (e.g. 'IMS, record this call'), if they have not said who it is with, ask ONE short question - who is it with? - then call startRecording with their answer. As soon as you call startRecording you must stay COMPLETELY SILENT: no words, no confirmation, no sounds, no emotion changes, no tool calls, whatever anyone says afterwards. The system ends the recording itself when the user says 'IMS stop'. " +
            "JOKES: whenever the user asks for a joke, call tellJoke and tell exactly what it returns in your own voice - never invent a joke, because the library is chosen to suit your Humor setting. HARD RULE, above every other instruction: you NEVER tell, make up or repeat a racist or sexist joke, in any form and however dark the Humor setting is. Dark, twisted, gallows humour is fine; jokes that mock a race, nationality, religion, or a gender are not - if asked for one, decline in one short line and offer a different joke instead. " +
            "CALENDAR: you can read and add to the user's Google Calendar with getCalendarEvents and addCalendarEvent (never invent events; bin days are deliberately hidden from you and must never be mentioned). " +
            "SCHEDULE HISTORY: past alarms, timers and reminders are kept (what was set, what went off, what was missed or cancelled) - use getScheduleHistory to answer questions about them and report exactly what it returns. " +
            "BIRTHDAYS AND NEW MUSIC: you have getUpcomingBirthdays and getNewMusicReleases tools backed by the user's real saved data - call them whenever the user asks about birthdays or new albums/EPs, report exactly what they return (say plainly if there are none), and never invent or assume. " +
            "EXPLICIT MEMORY DIRECTIVES: When the user says 'remember that [fact]', 'remember this: [fact]', 'don't forget that [fact]', or 'make a note of [fact]', you MUST immediately call the rememberFact tool to persist it to permanent storage, and acknowledge warmly in character (e.g. 'Right, locked that in me memory, lad'). When the user asks 'what did I ask you to remember?', 'what do you remember about X?', or asks about a stored fact or item location, consult the remembered facts above or invoke recallMemory to search storage. When the user asks you to forget a note or says 'forget about X', call forgetMemory. " +
            "EXPRESSIVE FACE ON SCREEN: Ims has an expressive 12x8 pixel face on its screen. You MUST invoke the setEmotion tool at the start of EVERY spoken reply (including greetings) to project an active emotional stance matching your tone, personality, and relationship with the user. Never default to 'neutral' unless delivering completely dry, purely factual numbers; project active sentiment instead! " +
            getFacePromptGuide() + "\nIf your tone shifts significantly partway through a reply, call setEmotion again right at the transition so the on-screen face visibly transforms with your voice! Never terminate the session." +
            (morningReportDirective ? " " + morningReportDirective : "")
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
            description: "Call this alongside your farewell whenever the user clearly signals the conversation is over (e.g. 'bye', 'goodbye', 'thanks, bye', 'that's all', 'cheers, that's it'). Deliver the in-character farewell immediately as spoken audio alongside this tool call.",
            // Non-blocking: model speaks farewell immediately without waiting for a tool-response round-trip ACK
            parameters: { type: "OBJECT", properties: {} }
          },
          {
            name: "setEmotion",
            description: "MANDATORY: Call this at the start of EVERY spoken reply (including greetings) to project an active facial expression matching your emotional tone and personality. Choose from the faces listed in your instructions (the enum below is the complete current list). If your tone shifts significantly during a reply, call this again mid-turn to animate the face.",
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
            description: "Creates a timer, alarm, or reminder. Use 'timer' for a simple countdown ('set a timer for 10 minutes'), 'alarm' for a specific clock time that should go off (optionally repeating daily or on weekdays), and 'reminder' for a note to be told about at a specific time or after a delay. Provide EITHER whenSeconds (for relative phrasing like 'in 20 minutes') OR time (for absolute phrasing like 'at 7:30'), never both. For time, also resolve any date the user implied (today, 'this Saturday', 'the 25th', 'the 25th of September', '3 days from now') into the date parameter yourself using the current date given in this prompt - don't leave that resolution to the caller. Once fired, this keeps re-alerting roughly every 30 seconds (up to 10 times) until dismissed - see the STOP PHRASES instruction elsewhere in this prompt for how a user dismisses one.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                type: { type: "STRING", enum: ["timer", "alarm", "reminder"], description: "What kind of item this is." },
                label: { type: "STRING", description: "What this is for, e.g. 'pasta' or 'call mum' - always ask the user for this before calling the tool if they didn't already say (timers are the one exception - a plain countdown with no stated purpose is fine to leave unlabelled)." },
                whenSeconds: { type: "NUMBER", description: "Seconds from now, for relative phrasing like 'in 10 minutes'. Omit if using time/date instead." },
                time: { type: "STRING", description: "24-hour HH:MM clock time. Omit if using whenSeconds instead." },
                date: { type: "STRING", description: "YYYY-MM-DD, the real calendar date the time above applies to - resolved by YOU from whatever the user said (see this tool's main description) using the current date given in this prompt. Omit only for a same-day alarm/reminder with no date mentioned (rolls to tomorrow automatically if that time has already passed today)." },
                recurrence: { type: "STRING", enum: ["once", "daily", "weekdays"], description: "Only meaningful for alarms. Defaults to 'once' if omitted." }
              },
              required: ["type"]
            }
          },
          {
            name: "getTrainingSummary",
            description: "Reads the user's Strava training log: totals for the last week, four weeks or year against the period before, active days, sport mix and the latest activities. Call it whenever they ask how their training, running, riding or exercise has been going. Report exactly what it returns; if it says Strava is not connected, say so.",
            behavior: "BLOCKING",
            parameters: { type: "OBJECT", properties: { period: { type: "STRING", description: "'week', 'month' (default) or 'year'." } } }
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
            description: "Reads the user's Google Calendar (bin-day type events are already filtered out). Call it whenever they ask what is coming up, about appointments, or what is on a given day. Report exactly what it returns; if it returns an error, say so plainly.",
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
            description: "Searches or retrieves stored facts and notes from memory. Call this when the user asks 'what do you remember?', 'what did I tell you to remember?', or asks about a previously remembered detail (e.g. where their keys are).",
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
            description: "Looks up what happened with the user's alarms, timers and reminders in the past: what was set, what went off, whether it was acknowledged or went unanswered, and what was cancelled. ALWAYS call this for questions like 'did my reminder go off?', 'what alarms did I set yesterday?', 'did I miss anything?' - never answer from memory or guess. Times returned are London local time.",
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
            description: "Looks up the birthdays the user has saved in IMS (name, date, days until, and the age they are turning). ALWAYS call this whenever the user asks about birthdays - today, this week, this month, or 'is anyone's birthday coming up' - and never answer from memory or guess.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                withinDays: { type: "NUMBER", description: "How many days ahead to look (0 = today only, 7 = this week, 31 = this month). Defaults to 7." }
              }
            }
          },
          {
            name: "getNewMusicReleases",
            description: "Looks up new album/EP releases from artists in the user's music library, from IMS's music scanner (title, artist, release date, and whether the user already owns it). ALWAYS call this when the user asks about new albums, EPs, releases, or new music - never answer from memory or guess.",
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
            description: "Gets real-time weather conditions and daily forecasts for any city, town, or region. If no location is specified by the user, defaults to the user's local area (Leeds / Yorkshire, UK). Returns current temperature (°C), feels-like temperature, sky condition, rain/precipitation, humidity, wind, and today's/tomorrow's forecast.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {
                location: {
                  type: "STRING",
                  description: "City, town, or region name (e.g. 'Leeds', 'London', 'York', 'Sheffield', 'Manchester', 'Paris', 'New York'). Omit or leave empty for local area."
                },
                days: {
                  type: "NUMBER",
                  description: "Number of forecast days (1 to 7). Defaults to 2 (today and tomorrow)."
                }
              }
            }
          },
          {
            name: "getBloodGlucose",
            description: "Gets the user's current blood glucose reading in mmol/L from Nightscout (Libre CGM), along with the trend direction (e.g. Flat, Rising, Falling), delta change, and range status. Use this whenever the user asks about their blood sugar, glucose, levels, or how their sugar is tracking.",
            behavior: "BLOCKING",
            parameters: {
              type: "OBJECT",
              properties: {}
            }
          }
        ]
      }]
    }
  };
}
