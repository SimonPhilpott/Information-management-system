import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config.js';
import db from '../db/database.js';
import { logUsage } from './usageService.js';
import { v4 as uuidv4 } from 'uuid';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

/**
 * Extract topics from a document's text content
 */
export async function extractTopicsFromDocument(documentId, filename, subject, pageTexts) {
  // Combine text (limit to first ~3000 words to save tokens)
  const allText = pageTexts.map(p => p.text).join('\n').split(/\s+/).slice(0, 3000).join(' ');

  if (allText.length < 100) {
    return []; // Too little text to extract topics
  }

  const model = genAI.getGenerativeModel(
    { model: config.gemini.chatModels.flash },
    { apiVersion: 'v1' }
  );

  const prompt = `Analyse the following text from a PDF document and extract the main topics/themes discussed.

Document: "${filename}"
Subject: "${subject}"

Text excerpt:
${allText}

Return a JSON array of 3-8 topics. Each topic should have:
- "topic": A short topic name (2-5 words)
- "description": A one-sentence description
- "suggested_question": A thoughtful question a student might ask about this topic

Return ONLY the JSON array, no other text.`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Log usage
    const usage = response.usageMetadata;
    if (usage) {
      logUsage(
        config.gemini.chatModels.flash,
        usage.promptTokenCount || 0,
        usage.candidatesTokenCount || 0,
        'topic_extraction'
      );
    }

    // Parse JSON response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const topics = JSON.parse(jsonMatch[0]);

    // Store topics in database
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO topics (id, document_id, subject, topic, description, suggested_question)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Remove existing topics for this document
    db.prepare('DELETE FROM topics WHERE document_id = ?').run(documentId);

    for (const topic of topics) {
      stmt.run(
        uuidv4(),
        documentId,
        subject,
        topic.topic,
        topic.description,
        topic.suggested_question
      );
    }

    return topics;
  } catch (err) {
    console.error(`Failed to extract topics from ${filename}:`, err.message);
    return [];
  }
}

/**
 * Get all topics grouped by subject
 */
export function getTopicsBySubject() {
  const rows = db.prepare(`
    SELECT t.*, d.filename
    FROM topics t
    JOIN documents d ON t.document_id = d.id
    ORDER BY t.subject, t.topic
  `).all();

  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.subject]) {
      grouped[row.subject] = [];
    }
    grouped[row.subject].push({
      id: row.id,
      topic: row.topic,
      description: row.description,
      suggestedQuestion: row.suggested_question,
      filename: row.filename
    });
  }

  return grouped;
}

/**
 * Get random suggested questions across the library
 */
export function getRandomSuggestions(count = 5, subjects = []) {
  if (subjects && subjects.length > 0) {
    const placeholders = subjects.map(() => '?').join(',');
    return db.prepare(`
      SELECT topic, suggested_question, subject, 
        (SELECT filename FROM documents WHERE id = topics.document_id) as filename
      FROM topics
      WHERE suggested_question IS NOT NULL AND suggested_question != ''
      AND subject IN (${placeholders})
      ORDER BY RANDOM()
      LIMIT ?
    `).all(...subjects, count);
  }

  return db.prepare(`
    SELECT topic, suggested_question, subject, 
      (SELECT filename FROM documents WHERE id = topics.document_id) as filename
    FROM topics
    WHERE suggested_question IS NOT NULL AND suggested_question != ''
    ORDER BY RANDOM()
    LIMIT ?
  `).all(count);
}

/**
 * Get topics for a specific subject
 */
export function getTopicsForSubject(subject) {
  return db.prepare(`
    SELECT t.*, d.filename
    FROM topics t
    JOIN documents d ON t.document_id = d.id
    WHERE t.subject = ?
    ORDER BY t.topic
  `).all(subject);
}
