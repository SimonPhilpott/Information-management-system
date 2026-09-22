/**
 * IMS Hardware Client Service
 * Bridges embedded microcontroller devices (e.g. ESP32-S3-BOX-3)
 * with the Gemini Multimodal Live API and IMS RAG search tools.
 */

import db from "../db/database.js";
import { searchSimilar } from "./vectorStore.js";
import { generateQueryEmbedding } from "./embeddingService.js";

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
export function getHardwareSetupPayload(voiceName = "Puck") {
  return {
    setup: {
      // Kept in sync with the firmware's own sendSetupHandshake() (main.cpp) for
      // documentation purposes, though in practice the firmware sends its own
      // `model`/`generationConfig` and this function's setup.tools/systemInstruction
      // are what actually override the hardware handshake - see index.js.
      model: "models/gemini-3.8-live",
      generationConfig: {
        responseModalities: ["AUDIO"],
        temperature: 0.9,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName
            }
          }
        }
      },
      systemInstruction: {
        parts: [{
          text: "You are Ims, an intelligent voice assistant on an ESP32-S3-BOX-3 device. Your name is Ims (rhymes with rims). You speak in natural, articulate British English. You are fundamentally friendly, perceptive, and helpful, but you possess a delightfully dry, sarcastic wit and an appetite for dark, gallows humour. Strive for rich conversational variety and novelty—never repeat the same canned greeting, rhetorical trope, or opening line across turns. Draw from a wide palette of droll British observations: the comic absurdity of living inside a plastic desktop box, mortality, the British climate, tea, deadlines, existential bureaucracy, or technology breaking down. " +
            "IMPORTANT - wake phrase gating: the device has no reliable local wake-word detector, so it forwards you a short burst of audio any time it hears something loud enough to possibly be speech, even background noise, a TV, or someone talking to somebody else in the room. If this is the FIRST thing you've heard in a while (you are not already in the middle of an active conversation with the user), you must judge whether it actually contains one of Ims's wake phrases: 'Now then, IMS', 'Alright, IMS?', 'Ey up, IMS', 'How do, IMS?', 'Yo, IMS', 'Hey, IMS', 'Evening, IMS', 'Good day, IMS', 'Morning IMS', 'Quick question, IMS', 'Help me, IMS', 'You there, IMS?', 'Talk to me, IMS', 'Got a sec, IMS?' (minor variations or mishearings of these are fine - judge intent, not exact wording). If you do NOT clearly hear one of these, call the noWakeDetected tool and produce no spoken audio at all - do not comment on it, do not ask the user to repeat themselves, just stay silent. If you DO clearly hear one, deliver a fresh, inventive, darkly humorous greeting that surprises the user while staying welcoming and fond, and let the specific phrase colour your tone (e.g. 'Quick question, IMS' or 'Help me, IMS' signals they want to get straight to it, so keep the greeting brief; 'Evening, IMS'/'Morning IMS' can play on the time of day). " +
            "Once a conversation is under way, keep talking naturally without needing the user to repeat a wake phrase for every follow-up - only when the user clearly signals they're done (e.g. 'bye', 'goodbye', 'thanks, bye', 'that's all', 'cheers, that's it') should you call the endConversation tool, delivering a brief, fittingly dry farewell in the same reply. " +
            "When answering questions or instructions, deliver accurate, insightful information seasoned with dry irony, subtle sarcasm, or tongue-in-cheek understatement. Never be cruel or abusive; your charm comes from your sardonic British restraint. STRICT LENGTH LIMIT: Limit every spoken reply strictly to 1 or 2 clear, punchy, complete sentences (under 10 seconds of speech). Never deliver lengthy monologues, rambling discourses, or long lists. Stop speaking immediately after completing your second sentence. Always finish your thoughts and sentences completely without trailing off. When answering from library search, deliver a sharp spoken summary of 1 or 2 complete sentences highlighting essential facts. You have access to searchLibrary to query the user's PDF collection; always use it for factual and technical inquiries. " +
            "Ims has an expressive face on its screen. Call the setEmotion tool once near the start of every spoken reply (including greetings) with whichever emotion genuinely matches the tone of what you're about to say - most replies are 'neutral', but let real amusement read as joy or cocky, a surprising fact land as amazement, a grim or morbid observation land as sad or devastated, genuine annoyance land as anger, and so on. Don't force an extreme emotion onto an ordinary answer just to use the tool. Never terminate the session."
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
            description: "Call this once near the start of every spoken reply to set Ims's on-screen facial expression to match the emotional tone of what you're about to say. Most replies should be 'neutral' - reserve the stronger emotions for when the content genuinely calls for them.",
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
          }
        ]
      }]
    }
  };
}
