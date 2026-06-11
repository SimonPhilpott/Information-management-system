import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config.js';
import db from '../db/database.js';
import { updateDocumentSubject } from './vectorStore.js';
import { moveDocument } from './driveService.js';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

/**
 * Uses AI to regroup books into a more logical hierarchy based on their content and titles.
 */
export async function autoCategoriseBooks(driveFileIds) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: config.gemini.chatModels.flash
    });
    // Get metadata and topics for these books
    const placeholders = driveFileIds.map(() => '?').join(',');
    const books = db.prepare(`
      SELECT d.drive_file_id, d.filename, d.subject, GROUP_CONCAT(t.topic, ', ') as themes
      FROM documents d
      LEFT JOIN topics t ON d.id = t.document_id
      WHERE d.drive_file_id IN (${placeholders})
      GROUP BY d.id
    `).all(...driveFileIds);

    // Get current subject list for deduplication
    const existingSubjects = db.prepare('SELECT DISTINCT subject FROM documents WHERE subject IS NOT NULL').all().map(s => s.subject);

    if (books.length === 0) return { success: true, count: 0 };

    const prompt = `
      You are a senior librarian and AI content architect. 
      Your goal is to organise these books into a sophisticated, multi-level hierarchy based on their DEEPLY INDEXED CONTENT (themes) and filenames.
      Use British English spelling (e.g., 'Organisation', 'History', 'Specialisation').
      
      EXISTING LIBRARY STRUCTURE (DEDUPLICATE AGAINST THESE):
      ${existingSubjects.join('\n')}

      CRITICAL INSTRUCTIONS:
      1. DEDUPLICATION & ALIASES: You MUST merge similar or abbreviated subjects. 
         - "AI" should be merged into "Artificial Intelligence".
         - "RPG" or "Role-Playing" must ALWAYS be merged into "Role-Playing Games".
         - "Boardgames & RPG" or "Boardgames and RPG" must ALWAYS be merged into "Boardgames & Role-Playing Games".
         - Use "Boardgames & Role-Playing Games" as the primary root for all tabletop gaming content.
      2. MULTI-LEVEL HIERARCHY: Structure subjects using a forward slash ( / ). Aim for 2-4 levels deep.
         - If a book fits an existing category above, use the EXACT existing path to avoid duplicates.
      3. PREFER FULL NAMES: Always use the full, formal name for a category instead of an abbreviation.
      4. PRIMARY SOURCE: Use the "Themes" provided for each book. If themes suggest a specific series or system (e.g., "Space Empires 4X"), prioritize that.
      5. Response Format: Respond ONLY with a JSON object where keys are drive_file_id and values are the NEW subject paths.
      
      Books to classify (based on CONTENT INDEX):
      ${books.map(b => `- [${b.drive_file_id}] Title: ${b.filename} | Themes: ${b.themes || 'UNINDEXED'} | Current: ${b.subject}`).join('\n')}
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI failed to produce a valid JSON mapping');
    
    const mapping = JSON.parse(jsonMatch[0]);
    let updateCount = 0;

    for (const [id, newSubject] of Object.entries(mapping)) {
      try {
        await moveDocument(id, newSubject, 'ai');
        updateCount++;
      } catch (err) {
        console.error(`Failed to apply AI category for ${id}:`, err.message);
      }
    }

    return { success: true, count: updateCount };
  } catch (err) {
    console.error('[AICatalog] Reorganization failed:', err);
    throw err;
  }
}
