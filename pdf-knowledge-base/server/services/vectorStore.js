import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db/database.js';
import { searchHnsw, invalidateIndex } from './hnswService.js';

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
/**
 * Sanitize subject name for use as filename
 */
function subjectToFilename(subject) {
  return subject.replace(/[^a-zA-Z0-9-_ ]/g, '_').replace(/\s+/g, '_').toLowerCase();
}

/**
 * Checks if a string contains RPG/entertainment/gaming terminology.
 */
function isEntertainment(text) {
  if (!text) return false;
  const n = text.toLowerCase();
  const entertainmentRegex = /\b(rpg|roleplaying|role-playing|role playing|boardgame|board game|gaming|tabletop|hobby|fantasy|dungeon|dragon|quest|campaign|rulebook|playbook|adventure|scenario|starter set|wargame|miniature|games|wargaming|character|dice|encounter|bestiary|grimoire|warband|bushido|campfire|dead world|parsec|borderland|no quarter|starship|gang warfare|salvage crew|cyberpunk|osr|pbt|d20|fate core|savage worlds|cthulhu|pathfinder|warhammer|d&d|dungeons)\w*/i;
  return entertainmentRegex.test(n);
}

// In-memory Vector Cache to prevent synchronous disk I/O and JSON parsing on large files
const vectorCache = new Map(); // filePath -> { chunks, size, lastUsed }
const MAX_CACHE_SIZE_BYTES = 200 * 1024 * 1024; // Limit cache to 200MB of raw file size (approx. 400-600MB parsed JS objects)

/**
 * Load vector chunks from cache or disk (async to avoid blocking event loop).
 * LRU eviction is applied when the total cached size exceeds MAX_CACHE_SIZE_BYTES.
 * @param {string} filePath
 * @returns {Promise<Array>}
 */
async function getCachedChunks(filePath) {
  const cached = vectorCache.get(filePath);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.chunks;
  }

  const stats = fs.statSync(filePath);
  const size = stats.size;

  // Calculate current cache size
  let currentCacheSize = 0;
  for (const entry of vectorCache.values()) {
    currentCacheSize += entry.size;
  }

  // LRU Eviction if memory limit exceeded
  if (currentCacheSize + size > MAX_CACHE_SIZE_BYTES) {
    const entries = [...vectorCache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key, entry] of entries) {
      vectorCache.delete(key);
      currentCacheSize -= entry.size;
      console.log(`[Vector Cache] Evicted cached vector file due to memory limit: ${path.basename(key)}`);
      if (currentCacheSize + size <= MAX_CACHE_SIZE_BYTES) break;
    }
  }

  // Use async file read so we don't block the event loop on large files (e.g. 330MB AI vector files)
  const raw = await fs.promises.readFile(filePath, 'utf-8');
  const chunks = JSON.parse(raw);
  vectorCache.set(filePath, {
    chunks,
    size,
    lastUsed: Date.now()
  });
  console.log(`[Vector Cache] Cached vector file: ${path.basename(filePath)} (${(size / (1024 * 1024)).toFixed(2)} MB)`);
  return chunks;
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
  
  // Invalidate cache entry on write so future queries reload the fresh data
  vectorCache.delete(filePath);
  // Mark HNSW index as needing rebuild
  invalidateIndex();
}

/**
 * Search for similar chunks across subjects
 * @param {number[]} queryEmbedding - The query embedding vector
 * @param {string[]} subjects - Optional filter by subjects (empty = all)
 * @param {number} topK - Number of results to return
 * @param {boolean} showPersonal - Toggle to include/exclude personal (RPG) books
 */
/**
 * Search for similar chunks across subjects
 * @param {number[]} queryEmbedding - The query embedding vector
 * @param {string[]} subjects - Optional filter by subjects (empty = all)
 * @param {number} topK - Number of results to return
 * @param {boolean} showPersonal - Toggle to include/exclude personal (RPG) books
 * @returns {Promise<Array>}
 */
export async function searchSimilar(queryEmbedding, subjects = [], topK = 8, showPersonal = false) {
  // Resolve allowed drive file IDs if filtered by subjects
  let allowedDriveFileIds = null;
  if (subjects.length > 0) {
    const placeholders = subjects.map(() => '?').join(',');
    const docs = db.prepare(`
      SELECT drive_file_id, subject FROM documents 
      WHERE subject IN (${placeholders}) OR folder_path IN (${placeholders})
    `).all(...subjects, ...subjects);
    
    const filteredDocs = showPersonal ? docs : docs.filter(d => !isEntertainment(d.subject));
    allowedDriveFileIds = new Set(filteredDocs.map(d => d.drive_file_id));
  }

  // 1. Try ultra-fast HNSW Approximate Nearest Neighbour search (1-2ms)
  const hnswResults = searchHnsw(queryEmbedding, topK, allowedDriveFileIds, showPersonal);
  if (hnswResults && hnswResults.length > 0) {
    return hnswResults;
  }

  // 2. Fallback: Memory-cached linear cosine similarity scan if HNSW index is not built
  const results = [];
  let vectorFiles;

  if (subjects.length > 0) {
    const placeholders = subjects.map(() => '?').join(',');
    const docs = db.prepare(`
      SELECT drive_file_id, subject FROM documents 
      WHERE subject IN (${placeholders}) OR folder_path IN (${placeholders})
    `).all(...subjects, ...subjects);
    
    const filteredDocs = showPersonal ? docs : docs.filter(d => !isEntertainment(d.subject));
    const uniqueSubjects = [...new Set(filteredDocs.map(d => d.subject))];
    vectorFiles = uniqueSubjects.map(s => path.join(VECTORS_DIR, `${subjectToFilename(s)}.json`));
  } else {
    // Search all subjects
    if (!fs.existsSync(VECTORS_DIR)) return [];
    vectorFiles = fs.readdirSync(VECTORS_DIR)
      .filter(f => f.endsWith('.json'))
      .filter(f => showPersonal || !isEntertainment(f))
      .map(f => path.join(VECTORS_DIR, f));
  }

  for (const filePath of vectorFiles) {
    if (!fs.existsSync(filePath)) continue;

    try {
      // Async cache load — does not block the event loop even on first read of large files
      const chunks = await getCachedChunks(filePath);
      let chunkCounter = 0;

      for (const chunk of chunks) {
        // Filter by driveFileId if we have a target list
        if (allowedDriveFileIds && !allowedDriveFileIds.has(chunk.driveFileId)) continue;
        
        // Secondary check inside chunks if personal files are disabled
        if (!showPersonal && (isEntertainment(chunk.subject) || isEntertainment(chunk.filename))) continue;
        
        const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
        results.push({
          ...chunk,
          similarity,
          embedding: undefined // Don't return the embedding vector
        });

        // Yield event loop every 50k iterations to keep the server responsive
        if (++chunkCounter % 50000 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
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
