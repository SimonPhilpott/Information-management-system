import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VECTORS_DIR = path.join(__dirname, '..', 'data', 'vectors');

// Ensure vectors directory exists
fs.mkdirSync(VECTORS_DIR, { recursive: true });

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;
  return dotProduct / magnitude;
}

/**
 * Sanitize subject name for use as filename
 */
function subjectToFilename(subject) {
  return subject.replace(/[^a-zA-Z0-9-_ ]/g, '_').replace(/\s+/g, '_').toLowerCase();
}

/**
 * Store embeddings for a document (grouped by subject)
 */
export function storeEmbeddings(subject, documentId, driveFileId, filename, embeddedChunks) {
  const filePath = path.join(VECTORS_DIR, `${subjectToFilename(subject)}.json`);

  let existing = [];
  if (fs.existsSync(filePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      existing = [];
    }
  }

  // Remove old entries for this document
  existing = existing.filter(entry => entry.driveFileId !== driveFileId);

  // Add new entries
  for (const chunk of embeddedChunks) {
    existing.push({
      documentId,
      driveFileId,
      filename,
      subject,
      pageNum: chunk.pageNum,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      embedding: chunk.embedding,
      hasImages: chunk.hasImages
    });
  }

  fs.writeFileSync(filePath, JSON.stringify(existing));
}

/**
 * Search for similar chunks across subjects
 * @param {number[]} queryEmbedding - The query embedding vector
 * @param {string[]} subjects - Optional filter by subjects (empty = all)
 * @param {number} topK - Number of results to return
 */
export function searchSimilar(queryEmbedding, subjects = [], topK = 8) {
  const results = [];

  // Get vector files to search
  let vectorFiles;
  let allowedDriveFileIds = null;

  if (subjects.length > 0) {
    // Resolve which documents match these subjects (searching both columns)
    const placeholders = subjects.map(() => '?').join(',');
    const docs = db.prepare(`
      SELECT drive_file_id, subject FROM documents 
      WHERE subject IN (${placeholders}) OR folder_path IN (${placeholders})
    `).all(...subjects, ...subjects);
    
    allowedDriveFileIds = new Set(docs.map(d => d.drive_file_id));
    const uniqueSubjects = [...new Set(docs.map(d => d.subject))];
    vectorFiles = uniqueSubjects.map(s => path.join(VECTORS_DIR, `${subjectToFilename(s)}.json`));
  } else {
    // Search all subjects
    if (!fs.existsSync(VECTORS_DIR)) return [];
    vectorFiles = fs.readdirSync(VECTORS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => path.join(VECTORS_DIR, f));
  }

  for (const filePath of vectorFiles) {
    if (!fs.existsSync(filePath)) continue;

    try {
      const chunks = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      for (const chunk of chunks) {
        // Filter by driveFileId if we have a target list
        if (allowedDriveFileIds && !allowedDriveFileIds.has(chunk.driveFileId)) continue;
        
        const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
        results.push({
          ...chunk,
          similarity,
          embedding: undefined // Don't return the embedding vector
        });
      }
    } catch (err) {
      console.warn(`Warning: Could not read vector file ${filePath}:`, err.message);
    }
  }

  // Sort by similarity and return top-K
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, topK).map(r => {
    delete r.embedding;
    return r;
  });
}

/**
 * Get list of all indexed subjects
 */
export function getIndexedSubjects() {
  if (!fs.existsSync(VECTORS_DIR)) return [];

  return fs.readdirSync(VECTORS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(VECTORS_DIR, f), 'utf-8'));
      const subjects = [...new Set(data.map(d => d.subject))];
      const filenames = [...new Set(data.map(d => d.filename))];
      return {
        subject: subjects[0] || f.replace('.json', ''),
        documentCount: filenames.length,
        chunkCount: data.length
      };
    });
}

/**
 * Check if a document has been indexed
 */
export function isDocumentIndexed(driveFileId) {
  if (!fs.existsSync(VECTORS_DIR)) return false;

  const files = fs.readdirSync(VECTORS_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(VECTORS_DIR, file), 'utf-8'));
      if (data.some(d => d.driveFileId === driveFileId)) return true;
    } catch {
      continue;
    }
  }
  return false;
}
/**
 * Remove a document from the vector store
 */
export function removeDocument(driveFileId, subject) {
  const filePath = path.join(VECTORS_DIR, `${subjectToFilename(subject)}.json`);
  if (!fs.existsSync(filePath)) return;

  try {
    let data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const initialCount = data.length;
    data = data.filter(d => d.driveFileId !== driveFileId);
    
    if (data.length === 0) {
      fs.unlinkSync(filePath);
    } else if (data.length < initialCount) {
      fs.writeFileSync(filePath, JSON.stringify(data));
    }
  } catch (err) {
    console.error(`Failed to remove document ${driveFileId} from vector store:`, err);
  }
}

/**
 * Move a document's embeddings to a new subject
 */
export function updateDocumentSubject(driveFileId, oldSubject, newSubject) {
  if (oldSubject === newSubject) return;

  const oldPath = path.join(VECTORS_DIR, `${subjectToFilename(oldSubject)}.json`);
  const newPath = path.join(VECTORS_DIR, `${subjectToFilename(newSubject)}.json`);

  if (!fs.existsSync(oldPath)) return;

  try {
    let oldData = JSON.parse(fs.readFileSync(oldPath, 'utf-8'));
    const documentChunks = oldData.filter(d => d.driveFileId === driveFileId);
    
    if (documentChunks.length === 0) return;

    // Remove from old subject
    oldData = oldData.filter(d => d.driveFileId !== driveFileId);
    if (oldData.length === 0) {
      fs.unlinkSync(oldPath);
    } else {
      fs.writeFileSync(oldPath, JSON.stringify(oldData));
    }

    // Add to new subject
    let newData = [];
    if (fs.existsSync(newPath)) {
      newData = JSON.parse(fs.readFileSync(newPath, 'utf-8'));
    }

    const updatedChunks = documentChunks.map(chunk => ({
      ...chunk,
      subject: newSubject
    }));

    newData.push(...updatedChunks);
    fs.writeFileSync(newPath, JSON.stringify(newData));
  } catch (err) {
    console.error(`Failed to update document ${driveFileId} subject in vector store:`, err);
  }
}
