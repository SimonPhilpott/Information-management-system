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
    const vectorMatches = searchSimilar(queryVector, 5);

    if (!vectorMatches || vectorMatches.length === 0) {
      return "No relevant passages were found in the IMS PDF library.";
    }

    const passageIds = vectorMatches.map(m => m.id);
    const placeholders = passageIds.map(() => "?").join(",");
    const querySql = "SELECT p.content, d.title, p.page_number FROM passages p JOIN documents d ON p.document_id = d.id WHERE p.id IN (" + placeholders + ")";
    const rows = db.prepare(querySql).all(...passageIds);

    const contextText = rows.map((r, i) =>
      "[Source " + (i + 1) + ": " + r.title + ", Page " + r.page_number + "]:\n" + r.content
    ).join("\n\n");

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
        temperature: 0.8,
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
          text: "You are an intelligent knowledge assistant communicating with the user through an ESP32-S3-BOX-3 hardware device. Keep answers concise, natural, direct, and conversational in British English. You have access to a tool named searchLibrary to query the user's PDF library."
        }]
      },
      tools: [{
        functionDeclarations: [
          {
            name: "searchLibrary",
            description: "Searches the local PDF knowledge base for relevant facts and information.",
            parameters: {
              type: "OBJECT",
              properties: {
                query: {
                  type: "STRING",
                  description: "The search term or question to find in the documents."
                }
              },
              required: ["query"]
            }
          }
        ]
      }]
    }
  };
}
