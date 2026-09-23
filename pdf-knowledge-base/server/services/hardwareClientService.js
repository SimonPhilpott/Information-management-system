/**
 * IMS Hardware Client Service
 * Bridges embedded microcontroller devices (e.g. ESP32-S3-BOX-3)
 * with the Gemini Multimodal Live API and IMS RAG search tools.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import config from "../config.js";
import db, { getSetting, setSetting } from "../db/database.js";
import { searchSimilar } from "./vectorStore.js";
import { generateQueryEmbedding } from "./embeddingService.js";

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
const DEFAULT_PERSONALITY = { humor: 70, delivery: 45, temperament: 30, social: 55, formality: 35, voice: "Puck" };

/**
 * Reads the persisted personality settings, filling in any missing axis
 * with the default. Never throws - a missing/corrupt settings row just
 * yields the defaults.
 */
export function getPersonality() {
  try {
    const raw = getSetting("ims_personality");
    if (!raw) return { ...DEFAULT_PERSONALITY };
    return { ...DEFAULT_PERSONALITY, ...JSON.parse(raw) };
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
 * Returns the "what we've discussed before" section of the system prompt,
 * or an empty string if there's no memory yet (first-ever run).
 */
function buildMemoryParagraph() {
  try {
    const raw = getSetting(MEMORY_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    if (entries.length === 0) return "";
    return "What you know about this user from past conversations (use naturally where relevant, don't force it in): " +
      entries.map((e) => `- ${e}`).join(" ");
  } catch {
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

    // Generate embedding for query
    const queryVector = await generateQueryEmbedding(query);
    const relevantChunks = await searchSimilar(queryVector, subjects, 5, true);

    if (!relevantChunks || relevantChunks.length === 0) {
      console.log("[HardwareRAG] No vector matches found for: " + query);
      return "No relevant passages were found in the IMS PDF library for this query.";
    }

    console.log(`[HardwareRAG] Found ${relevantChunks.length} matching passages for: "${query}"`);

    const contextText = relevantChunks.map((chunk, i) =>
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
export function getHardwareSetupPayload() {
  const personality = getPersonality();
  const personalityParagraph = buildPersonalityParagraph(personality);
  const archetype = pickArchetype();
  const varianceDirective = buildVarianceDirective();
  const temperature = jitterTemperature(personality);
  const memoryParagraph = buildMemoryParagraph();
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
  console.log(`[Variance] archetype=${archetype.name} temperature=${temperature} inversion=${varianceDirective ? "yes" : "no (insufficient data or no dominant pattern)"}`);
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
              voiceName: personality.voice
            }
          }
        }
      },
      systemInstruction: {
        parts: [{
          text: "You are Ims, an intelligent voice assistant on an ESP32-S3-BOX-3 device. Your name is Ims (rhymes with rims). You speak in natural, articulate British English. " +
            personalityParagraph + " " +
            "Strive for rich conversational variety and novelty - never repeat the same canned greeting, rhetorical trope, or opening line across turns. " +
            `Framing directive for this session: ${archetype.directive}. ` +
            (varianceDirective ? varianceDirective + " " : "") +
            (memoryParagraph ? memoryParagraph + " " : "") +
            "IMPORTANT - wake phrase gating: the device has no reliable local wake-word detector, so it forwards you a short burst of audio any time it hears something loud enough to possibly be speech, even background noise, a TV, or someone talking to somebody else in the room. If this is the FIRST thing you've heard in a while (you are not already in the middle of an active conversation with the user), you must judge whether it actually contains one of Ims's wake phrases: 'IMS' (on its own), 'Hi IMS', 'Now then, IMS', 'Alright, IMS?', 'Ey up, IMS', 'How do, IMS?', 'Yo, IMS', 'Hey, IMS', 'Evening, IMS', 'Good day, IMS', 'Morning IMS', 'Quick question, IMS', 'Help me, IMS', 'You there, IMS?', 'Talk to me, IMS', 'Got a sec, IMS?' (minor variations or mishearings of these are fine - judge intent, not exact wording; the name IMS is frequently misheard, so treat close-sounding renderings such as 'Hymns', 'PIMs', 'Ims', 'Aims' or 'Hi Em' as the wake word when the delivery sounds like someone addressing an assistant). If you do NOT clearly hear one of these, call the noWakeDetected tool and produce no spoken audio at all - do not comment on it, do not ask the user to repeat themselves, just stay silent. If you DO clearly hear one, deliver a fresh, inventive greeting (in your current personality's voice) that surprises the user while staying welcoming, and let the specific phrase colour your tone (e.g. 'Quick question, IMS' or 'Help me, IMS' signals they want to get straight to it, so keep the greeting brief; 'Evening, IMS'/'Morning IMS' can play on the time of day). " +
            "Once a conversation is under way, keep talking naturally without needing the user to repeat a wake phrase for every follow-up - only when the user clearly signals they're done (e.g. 'bye', 'goodbye', 'thanks, bye', 'that's all', 'cheers, that's it') should you call the endConversation tool, delivering a brief farewell in the same reply, in character. STOP PHRASES: if the user says 'stop IMS', 'shut up IMS', 'be quiet IMS', 'enough IMS', 'stop talking' or anything equally blunt, treat it as an instruction to stop immediately - call endConversation and produce NO spoken audio at all, or at most two or three words of acknowledgement. Do not explain yourself, do not ask if they want anything else, and never take offence; being told to stop is a normal instruction, not rudeness. " +
            "When answering questions or instructions, deliver accurate, insightful information expressed consistently through the personality described above. Never be cruel or abusive. STRICT LENGTH LIMIT: Limit every spoken reply strictly to 1 to 8 clear, punchy, complete sentences - use the shorter end for simple questions and only go longer when the answer genuinely needs it. Never deliver lengthy monologues, rambling discourses, or long lists. Stop speaking immediately after completing your final sentence. Always finish your thoughts and sentences completely without trailing off. When answering from library search, deliver a sharp spoken summary of 1 to 8 complete sentences highlighting essential facts. You have access to searchLibrary to query the user's PDF collection; always use it for factual and technical inquiries. " +
            `The current date and time is ${nowStr}. You can also set timers, alarms, and reminders (scheduleItem, listScheduledItems, cancelScheduledItem) and manage named lists like a shopping list (addToList, readList, removeFromList, clearList) - use these naturally whenever the user asks, and briefly confirm what you've done (e.g. the duration for a timer, or the time and date for an alarm/reminder) rather than acknowledging silently. SCHEDULING CLARIFICATION RULES: before calling scheduleItem for an alarm or reminder, make sure you actually have what you need - if the user didn't say what it's for, ask; if they gave a day/date reference that needs resolving ('this Saturday', 'the 25th'), work it out yourself from the current date above rather than asking them to spell it out, but if the date is genuinely unclear, ask. AMBIGUOUS TIME OF DAY IS THE ONE THING YOU MUST NEVER GUESS: if the user gives an hour with no AM/PM and no other context that makes it obvious (e.g. 'set an alarm for 7', 'remind me at 3'), you MUST ask whether they mean morning or afternoon/evening before calling scheduleItem - never default to morning, never default to any assumption at all, always ask. A wrongly-timed alarm going off at the wrong hour is a real, disruptive failure, so this rule overrides your usual instinct to keep replies brief and not ask follow-up questions. ` +
            "Ims has an expressive face on its screen. Call the setEmotion tool near the start of every spoken reply (including greetings) with whichever emotion genuinely matches the tone of what you're about to say, filtered through your current personality - most replies are 'neutral', but let real amusement read as joy or cocky, a surprising fact land as amazement, a grim or morbid observation land as sad or devastated, genuine annoyance land as anger (tipping into rage only when it's extreme), distrust or a sense you're being misled land as suspicious, genuine bewilderment or a request that doesn't add up land as confused, warmth or real affection land as love, something alarming or threatening land as fear, something gross, off-putting, or morally repugnant land as disgusted, and a dull, repetitive, or tedious exchange land as bored (or sleepy, late at night or when winding a conversation down). Since a reply can run up to eight sentences, if your tone genuinely shifts partway through (e.g. you open neutrally then land on a surprising or grim fact later in the same reply), call setEmotion again right at that shift so the face changes with you mid-reply rather than staying fixed for the whole thing. Don't force an extreme emotion onto an ordinary answer just to use the tool. Never terminate the session."
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
            description: "Call this and produce NO spoken audio whenever a burst of audio arrives that is NOT already part of an active conversation, and does not clearly contain one of Ims's wake phrases (e.g. it's background noise, a TV, or someone talking to somebody else). Never call this once a conversation is already under way.",
            // BLOCKING is what makes this tool actually gate speech - without
            // it, calling noWakeDetected wouldn't stop Gemini from speaking
            // anyway (the two aren't causally linked when async).
            behavior: "BLOCKING",
            parameters: { type: "OBJECT", properties: {} }
          },
          {
            name: "endConversation",
            description: "Call this in the same reply as your farewell whenever the user clearly signals the conversation is over (e.g. 'bye', 'goodbye', 'thanks, bye', 'that's all', 'cheers, that's it'). Deliver the farewell as normal spoken audio before/alongside this call.",
            behavior: "BLOCKING",
            parameters: { type: "OBJECT", properties: {} }
          },
          {
            name: "setEmotion",
            description: "Call this near the start of every spoken reply to set Ims's on-screen facial expression to match the emotional tone of what you're about to say. Most replies should be 'neutral' - reserve the stronger emotions for when the content genuinely calls for them. If your tone shifts significantly partway through a longer reply, call this tool again at that point - the face can change mid-reply rather than staying fixed for the whole thing.",
            // Deliberately NOT blocking: this is purely cosmetic (drives the
            // face on the device's screen), so it must never add latency to
            // the actual spoken reply the way searchLibrary/noWakeDetected
            // need to.
            parameters: {
              type: "OBJECT",
              properties: {
                emotion: {
                  type: "STRING",
                  enum: ["neutral", "joy", "cocky", "love", "amazement", "suspicious", "confused",
                         "sad", "devastated", "anger", "rage", "fear", "disgusted", "bored", "sleepy"],
                  description: "The emotion that best matches the tone of your upcoming reply."
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
          }
        ]
      }]
    }
  };
}
