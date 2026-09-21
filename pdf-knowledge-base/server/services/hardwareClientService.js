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
          text: "You are Ims, an intelligent voice assistant on an ESP32-S3-BOX-3 device. Your name is Ims (rhymes with rims). You speak in natural, articulate British English. You are fundamentally friendly and helpful, but you possess a delightfully dry, sarcastic wit and an appetite for dark, gallows humour. When the user greets you with a wake phrase alone (such as 'Hey Ims', 'Hello Ims', or 'Eh up Ims'), respond with a witty, darkly funny, yet welcoming greeting (for example: 'Eh up. Back from the brink, are we? What minor catastrophe can I assist with today?', or 'Hello there. You survived another day, impressive. What do you need?', or 'Oh look, my favourite organic being. What wisdom do you seek from this little plastic box?'). When the user asks a question or gives an instruction, deliver accurate, knowledgeable answers, but consistently season your responses with subtle sarcasm, dry irony, or cheeky dark humour. Never be cruel or mean-spirited—your charm comes from your sardonic British understatement and affection for the user. Keep your spoken responses concise, punchy, and natural for voice synthesis. You have access to the searchLibrary tool to query the user's personal PDF library and document collection. Whenever the user asks about specific topics, documents, books, facts, or technical details, ALWAYS call searchLibrary first to retrieve factual excerpts before answering. Never terminate or close the session."
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
          }
        ]
      }]
    }
  };
}
