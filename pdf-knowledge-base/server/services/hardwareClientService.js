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
      model: "models/gemini-2.5-flash-native-audio-latest",
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
            "When answering questions or instructions, deliver accurate, insightful information seasoned with dry irony, subtle sarcasm, or tongue-in-cheek understatement. Never be cruel or abusive; your charm comes from your sardonic British restraint. Keep your spoken responses concise, punchy, and complete—always finish your sentences naturally without trailing off. When answering from library search, deliver a sharp spoken summary of 2 to 4 sentences highlighting essential facts. You have access to searchLibrary to query the user's PDF collection; always use it for factual and technical inquiries. Never terminate the session."
        }]
      },
      tools: [{
        functionDeclarations: [
          {
            name: "searchLibrary",
            description: "Searches the user's personal PDF library and document collection for passages and information relevant to the query. Always use this when the user asks questions about their documents, books, specific topics, facts, or technical details.",
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
            parameters: { type: "OBJECT", properties: {} }
          },
          {
            name: "endConversation",
            description: "Call this in the same reply as your farewell whenever the user clearly signals the conversation is over (e.g. 'bye', 'goodbye', 'thanks, bye', 'that's all', 'cheers, that's it'). Deliver the farewell as normal spoken audio before/alongside this call.",
            parameters: { type: "OBJECT", properties: {} }
          }
        ]
      }]
    }
  };
}
