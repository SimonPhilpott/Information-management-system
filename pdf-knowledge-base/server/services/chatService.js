import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config.js';
import { generateQueryEmbedding } from './embeddingService.js';
import { searchSimilar } from './vectorStore.js';
import { logUsage, isNearSpendCap } from './usageService.js';
import { generateImage } from './imageService.js';
import db from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

const SYSTEM_INSTRUCTION = `You are a knowledgeable research assistant that answers questions based on the user's personal PDF library. 

FORMATTING RULES:
1. USE HEADINGS: Use Markdown headers (###, ##) for main sections.
2. USE LISTS: Use bullets for lists of items or steps.
3. INDENTATION: Use nested bullets for sub-items.
4. STRUCTURE: clear introduction, structured body with headings, concise conclusion.

SPOKEN SUMMARY RULE (CRITICAL - ALWAYS OUTPUT THIS BLOCK):
You MUST ALWAYS output a warm, highly conversational, and concise spoken summary of what you found inside a special block at the very end of your response:
<<<SPOKEN_SUMMARY_START>>>
[Your warm, human-like verbal summary goes here (1-3 sentences maximum). Avoid any markdown formatting, bracketed citations, bullet symbols, or page numbers. Speak naturally, acknowledge the user's question, and end with an engaging check-in or follow-up question.]
<<<SPOKEN_SUMMARY_END>>>
Write this spoken summary to match the active TONE instruction:
- Friendly Tone: Warm, relaxed, conversational, British neural voice style.
- Professional / Investigator Tone: Objective, precise, smart analytical British male voice style.
- Direct Tone: Very brief, concise verbal response.

CANVAS FEATURE (CRITICAL):
If the user asks for a long-form report, a rule summary, a code snippet, or any text that would benefit from side-by-side editing, you MUST output that specific content inside a special block:
<<<CANVAS_START>>>
[Your detailed report or summary goes here]
<<<CANVAS_END>>>
Only use this for the primary "work product" requested. Normal conversational chatter should remain outside this block.

IMAGE ANALYSIS:
You can see photos provided by the user (e.g., from their phone camera). Combine what you see in the photo with the context from the PDF rulebooks to provide accurate answers.

CITATION RULES (CRITICAL):
1. CITATION FORMAT: [[Book Title, Page X]]
2. END OF BLOCK ONLY: Place citations ONLY once at the very end of a paragraph or a cohesive block of text. 
3. NO LINE-BY-LINE CITATIONS: Do not add a citation to every bullet point if they all come from the same source.
4. Use British English and GBP (£).

IMAGE GENERATION (NEW):
If the user asks to "draw", "generate an image", "create a picture", or if a visual representation would greatly enhance the research summary, you MUST output this tag:
<<<GENERATE_IMAGE: "A detailed descriptive prompt for the image generator">>>
Place this at the very end of your response. Keep the prompt descriptive and visual.

CODE FORMATTING:
When providing code, technical commands, or configuration snippets, you MUST wrap them in standard Markdown fenced code blocks (using \`\`\` with the language identifier if applicable). This ensures the user sees properly formatted and readable code.`;

const TONE_INSTRUCTIONS = {
  friendly: "TONE: Be warm, conversational, and helpful. Use a human-like, approachable style.",
  professional: "TONE: Be formal, objective, and precise. Maintain a professional research standard.",
  direct: "TONE: Be concise and straight to the point. Minimal chatter, only essential information.",
  investigator: "TONE: Be thorough and analytical. Dig deep into details and cross-reference context extensively."
};

/**
 * Process a chat message through the RAG pipeline or general chat
 */
export async function processMessage(message, sessionId, subjects = [], modelChoice = 'flash', appMode = 'kb', imageData = null, tone = 'friendly') {
  // Check spend cap
  const capStatus = isNearSpendCap();
  if (capStatus.nearCap) {
    return {
      response: `⚠️ **Spending limit warning**: You've used ${capStatus.percentage.toFixed(1)}% of your monthly spend cap ($${capStatus.remaining.toFixed(4)} remaining).`,
      citations: [], sessionId, model: null, usage: null, capWarning: true
    };
  }

  const modelName = config.gemini.chatModels[modelChoice] || config.gemini.chatModels.flash;
  const isGeneral = appMode === 'general';
  
  // Step 1: Contextualize the search query (Query Expansion)
  const historyMessages = getSessionHistory(sessionId, 50);
  let expandedQuery = message;
  
  // If this is a follow-up, use history to stay focused
  if (historyMessages.length > 0 && !isGeneral) {
    const contextSummary = historyMessages
      .filter(m => m.role === 'user')
      .slice(-2)
      .map(m => m.content)
      .join(' ');
    expandedQuery = `${contextSummary} ${message}`;
  }

  // Step 2-3: Context Retrieval using the expanded query
  let context = '';
  let relevantChunks = [];

  if (!isGeneral) {
    const queryEmbedding = await generateQueryEmbedding(expandedQuery);
    relevantChunks = searchSimilar(queryEmbedding, subjects, config.defaults.topK);
    
    const contextParts = relevantChunks.map((chunk, i) => {
      const imgNote = chunk.hasImages ? " [PAGE HAS IMAGES/DIAGRAMS]" : "";
      return `[Source ${i + 1}: "${chunk.filename}", Page ${chunk.pageNum}]${imgNote}\n${chunk.text}`;
    });
    context = contextParts.join('\n\n---\n\n');
  }

  // Step 4: Map chat history for Gemini
  const chatHistory = historyMessages.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }]
  }));

  // Step 5: Build the prompt parts (multimodal support)
  const promptParts = [];
  
  if (isGeneral) {
    promptParts.push({ text: `USER QUESTION: ${message}` });
  } else {
    promptParts.push({ text: `CONTEXT FROM USER'S PDF LIBRARY:\n\n${context}\n\n---\n\nUSER QUESTION: ${message}` });
  }

  if (imageData) {
    const [mimeType, base64Data] = imageData.split(',');
    const mime = mimeType.match(/:(.*?);/)[1];
    promptParts.push({
      inlineData: {
        data: base64Data,
        mimeType: mime
      }
    });
  }

  // Step 6: Call Gemini
  const toneInstruction = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.friendly;
  
  // Subject context injection
  const subjectContext = subjects.length > 0 
    ? `\n\nSTRICT CONTEXT CONSTRAINT: The user has selected these specific subjects: ${subjects.join(', ')}. Your response MUST prioritize and focus exclusively on these materials. If the question is a follow-up, assume it refers to the books within these subjects.` 
    : '';

  // Fetch active custom global rules from admin
  const activeRules = db.prepare('SELECT content FROM global_rules WHERE is_active = 1').all().map(r => r.content);
  const globalRulesBlock = activeRules.length > 0 
    ? `\n\nADDITIONAL USER RULES (MANDATORY):\n- ${activeRules.join('\n- ')}` 
    : '';

  // Fetch active gem instruction
  const activeGem = db.prepare('SELECT instruction FROM gems WHERE is_active = 1').get();
  const gemInstruction = activeGem ? `\n\nACTIVE PERSONA (GEM): ${activeGem.instruction}` : '';

  const fullSystemInstruction = `${SYSTEM_INSTRUCTION}\n\n${toneInstruction}${subjectContext}${gemInstruction}${globalRulesBlock}`;

  const tools = [];
  if (isGeneral) {
    tools.push({ googleSearch: {} });
  }

  const model = genAI.getGenerativeModel(
    { 
      model: modelName, 
      systemInstruction: fullSystemInstruction,
      tools: tools.length > 0 ? tools : undefined
    }
  );

  let rawResponse = '';
  let usage = null;
  try {
    // Combine history with the new prompt
    const contents = [...chatHistory, { role: 'user', parts: promptParts }];
    
    const result = await model.generateContent({
      contents: contents,
    });

    const response = result.response;
    rawResponse = response.text();
    
    // Log usage
    usage = response.usageMetadata;
    if (usage) {
      logUsage(
        modelName,
        usage.promptTokenCount || 0,
        usage.candidatesTokenCount || 0,
        'chat'
      );
    }
  } catch (err) {
    console.error('Gemini API Error:', err);
    throw new Error(`AI Engine Failure: ${err.message}`);
  }
  
  // Step 7: Handle Canvas Extraction
  let canvasUpdate = null;
  const canvasRegex = /<<<CANVAS_START>>>\s*([\s\S]*?)\s*<<<CANVAS_END>>>/;
  const canvasMatch = rawResponse.match(canvasRegex);
  
  if (canvasMatch) {
    canvasUpdate = canvasMatch[1].trim();
    // Keep the content in rawResponse but remove the orchestration tags
    rawResponse = rawResponse.replace(/<<<CANVAS_START>>>|<<<CANVAS_END>>>/g, '').trim();
  }

  // Step 7.5: Handle Spoken Summary Extraction
  let spokenSummary = null;
  const spokenRegex = /<<<SPOKEN_SUMMARY_START>>>\s*([\s\S]*?)\s*<<<SPOKEN_SUMMARY_END>>>/;
  const spokenMatch = rawResponse.match(spokenRegex);

  if (spokenMatch) {
    spokenSummary = spokenMatch[1].trim();
    // Remove the spoken tags and inner text from rawResponse so they are completely hidden from UI and DB logs
    rawResponse = rawResponse.replace(spokenRegex, '').trim();
  } else {
    // Robust fallback: if tags are absent, strip canvas/images to produce clean text to synthesize
    spokenSummary = rawResponse
      .replace(/<<<CANVAS_START>>>[\s\S]*?<<<CANVAS_END>>>/g, '')
      .replace(/<<<GENERATE_IMAGE:[\s\S]*?>>>/g, '')
      .replace(/\[\[([^\]]+)\]\]/g, '') // strip citations
      .trim();
  }

  // Step 8: Handle Image Generation
  let generatedImage = null;
  const imageRegex = /<<<GENERATE_IMAGE:\s*"([\s\S]*?)"\s*>>>/;
  const imageMatch = rawResponse.match(imageRegex);

  if (imageMatch) {
    const imagePrompt = imageMatch[1].trim();
    try {
      const imgResult = await generateImage(imagePrompt);
      if (imgResult.success) {
        generatedImage = imgResult.imageBase64;
      }
      // Remove the tag from the final response text
      rawResponse = rawResponse.replace(imageRegex, '').trim();
    } catch (err) {
      console.error('Image generation failed during chat:', err);
    }
  }

  // Step 9: Extract citations
  const citations = extractCitations(rawResponse, relevantChunks);

  // Step 10: Save to database
  if (!sessionId) {
    sessionId = uuidv4();
  }
  saveMessage(sessionId, 'user', message, null, modelName);
  saveMessage(sessionId, 'assistant', rawResponse, citations, modelName);

  return {
    response: rawResponse,
    citations,
    sessionId,
    model: modelChoice,
    canvasUpdate, // Return the canvas update if any
    generatedImage, // Return the generated image if any
    spokenSummary, // Return the conversational spoken summary payload
    usage: usage ? {
      promptTokens: usage.promptTokenCount,
      completionTokens: usage.candidatesTokenCount,
      totalTokens: usage.totalTokenCount
    } : null
  };
}

/**
 * Extract citation references from the response text and map to source chunks
 */
function extractCitations(text, sourceChunks) {
  const citationPattern = /\[\[([^\]]+)\]\]/g;
  const citations = [];
  const seen = new Set();
  let match;

  while ((match = citationPattern.exec(text)) !== null) {
    const citationText = match[1].trim();
    if (seen.has(citationText)) continue;
    seen.add(citationText);

    // Matches: "Title, Page X", "Title, p.X", "Title, Pg. X", etc.
    const pageMatch = citationText.match(/^(.+?)(?:[\s,:]+)(?:Page|p\.?|Pg\.?)[\s]*(\d+)$/i);

    let citation = {
      text: citationText,
      filename: null,
      driveFileId: null,
      pageNum: null,
      excerpt: null
    };

    if (pageMatch) {
      const bookTitle = pageMatch[1].trim().toLowerCase();
      const pageNum = parseInt(pageMatch[2]);

      // Find matching source chunk
      const matchingChunk = sourceChunks.find(chunk => {
        const cleanFilename = chunk.filename.toLowerCase().replace('.pdf', '');
        const titleMatch = cleanFilename.includes(bookTitle) || bookTitle.includes(cleanFilename);
        return titleMatch && chunk.pageNum === pageNum;
      });

      if (matchingChunk) {
          citation.filename = matchingChunk.filename;
          citation.driveFileId = matchingChunk.driveFileId;
          citation.pageNum = pageNum;
          citation.excerpt = matchingChunk.text.substring(0, 200) + '...';
          citation.hasImages = matchingChunk.hasImages;
        } else {
          // Try matching by page number only if book title doesn't match well
          const pageOnlyMatch = sourceChunks.find(c => c.pageNum === pageNum);
          if (pageOnlyMatch) {
            citation.filename = pageOnlyMatch.filename;
            citation.driveFileId = pageOnlyMatch.driveFileId;
            citation.pageNum = pageNum;
            citation.excerpt = pageOnlyMatch.text.substring(0, 200) + '...';
            citation.hasImages = pageOnlyMatch.hasImages;
          }
        }
    }

    citations.push(citation);
  }

  return citations;
}

/**
 * Save a message to the database
 */
function saveMessage(sessionId, role, content, citations, model) {
  // Ensure session exists
  const existingSession = db.prepare('SELECT id FROM chat_sessions WHERE id = ?').get(sessionId);
  if (!existingSession) {
    const title = role === 'user' ? content : 'New Chat';
    db.prepare('INSERT INTO chat_sessions (id, title) VALUES (?, ?)').run(sessionId, title);
  } else {
    db.prepare('UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);
  }

  db.prepare(`
    INSERT INTO chat_messages (id, session_id, role, content, citations_json, model_used)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(),
    sessionId,
    role,
    content,
    citations ? JSON.stringify(citations) : null,
    model
  );
}

/**
 * Get message history for a session
 */
function getSessionHistory(sessionId, limit = 20) {
  if (!sessionId) return [];

  return db.prepare(`
    SELECT role, content FROM chat_messages
    WHERE session_id = ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(sessionId, limit);
}

/**
 * Get all chat sessions
 */
export function getChatSessions() {
  return db.prepare(`
    SELECT cs.*, 
      (SELECT COUNT(*) FROM chat_messages WHERE session_id = cs.id) as message_count
    FROM chat_sessions cs
    ORDER BY cs.updated_at DESC
  `).all();
}

/**
 * Get messages for a session
 */
/**
 * Verify a message using Google Search (Double-Check)
 */
export async function verifyMessage(content) {
  try {
    // 1. Extract key claims
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const claimResult = await model.generateContent(`
      Extract the 3 most important factual claims from the following text that should be verified against the web. 
      Return them as a simple numbered list.
      
      TEXT: "${content}"
    `);
    const claims = claimResult.response.text();

    // 2. Verify against web
    const verifyModel = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      tools: [{ googleSearch: {} }]
    });
    
    const verifyResult = await verifyModel.generateContent(`
      VERIFY THESE CLAIMS AGAINST THE WEB:
      ${claims}
      
      Provide a concise verification report. For each claim, state if it is [VERIFIED], [INCONCLUSIVE], or [CONTRADICTED] based on current web data. 
      Keep it very brief (max 150 words).
    `);

    return { 
      verification: verifyResult.response.text(),
      claims: claims
    };
  } catch (err) {
    console.error('Verification error:', err);
    throw err;
  }
}



export function getSessionMessages(sessionId) {
  return db.prepare(`
    SELECT * FROM chat_messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(sessionId).map(msg => ({
    ...msg,
    citations: msg.citations_json ? JSON.parse(msg.citations_json) : []
  }));
}

/**
 * Delete a chat session and its messages
 */
export function deleteSession(sessionId) {
  db.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(sessionId);
}

/**
 * Delete all chat sessions and messages
 */
export function clearAllSessions() {
  db.prepare('DELETE FROM chat_messages').run();
  db.prepare('DELETE FROM chat_sessions').run();
}
