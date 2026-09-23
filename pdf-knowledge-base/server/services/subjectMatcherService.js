import db from '../db/database.js';

// Cache holding the subject taxonomy and catalogued books
let subjectCatalogCache = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute TTL

// Domain synonym and acronym expansions to enhance recall
const ACRONYMS_AND_SYNONYMS = {
  'gnn': ['graph neural network', 'graph neural networks'],
  'gnns': ['graph neural network', 'graph neural networks'],
  'llm': ['large language model', 'large language models'],
  'llms': ['large language model', 'large language models'],
  'rag': ['retrieval augmented generation', 'large language models', 'prompt engineering'],
  'agent': ['ai agents', 'agents'],
  'agents': ['ai agents'],
  'prompt': ['prompt engineering'],
  'prompts': ['prompt engineering'],
  'gpt': ['gpt-3', 'large language models', 'openai api'],
  'openai': ['openai api', 'azure openai', 'large language models'],
  'azure': ['azure openai', 'microsoft azure'],
  'threejs': ['three.js', 'three.js & a-frame', '3d graphics'],
  'react': ['react', 'react native', 'web development'],
  'd3': ['d3.js', 'data visualisation'],
  'd3js': ['d3.js', 'data visualisation'],
  'graph db': ['graph databases'],
  'graph database': ['graph databases'],
  'powerapp': ['power apps'],
  'powerapps': ['power apps'],
  'power automate': ['power automate', 'power platform'],
  'sharepoint': ['sharepoint online', 'sharepoint premium']
};

/**
 * Loads and caches the subject taxonomy along with catalogued books and topics.
 */
export function getSubjectCatalog(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && subjectCatalogCache && (now - lastCacheTime < CACHE_TTL_MS)) {
    return subjectCatalogCache;
  }

  try {
    // 1. Fetch indexed documents with subjects
    const docs = db.prepare(`
      SELECT id, drive_file_id, filename, subject, subject_source, page_count
      FROM documents
      WHERE indexed = 1 AND subject IS NOT NULL AND subject != ''
    `).all();

    // 2. Fetch topics
    const topics = db.prepare(`
      SELECT document_id, subject, topic, description
      FROM topics
    `).all();

    const topicsByDoc = new Map();
    for (const t of topics) {
      if (!topicsByDoc.has(t.document_id)) {
        topicsByDoc.set(t.document_id, []);
      }
      topicsByDoc.get(t.document_id).push(t);
    }

    // 3. Group by subject path
    const subjectMap = new Map();

    for (const doc of docs) {
      const subjectPath = doc.subject.trim();
      if (!subjectMap.has(subjectPath)) {
        const parts = subjectPath.split('/').map(p => p.trim()).filter(Boolean);
        const leafName = parts[parts.length - 1] || subjectPath;
        subjectMap.set(subjectPath, {
          subject: subjectPath,
          leafName,
          parts,
          source: doc.subject_source || 'folder',
          books: [],
          topics: []
        });
      }

      const entry = subjectMap.get(subjectPath);
      entry.books.push({
        id: doc.id,
        driveFileId: doc.drive_file_id,
        filename: doc.filename,
        pageCount: doc.page_count
      });

      const docTopics = topicsByDoc.get(doc.id) || [];
      for (const t of docTopics) {
        entry.topics.push({
          topic: t.topic,
          description: t.description
        });
      }
    }

    subjectCatalogCache = Array.from(subjectMap.values());
    lastCacheTime = now;
    return subjectCatalogCache;
  } catch (err) {
    console.error('[SubjectMatcher] Error loading subject catalog:', err.message);
    return subjectCatalogCache || [];
  }
}

/**
 * Normalises text into lowercase clean words for comparison.
 */
function cleanTokens(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\-\.\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

/**
 * Detects whether a query touches on any catalogued subjects in the library.
 *
 * @param {string} query The user's prompt or question
 * @param {object} options Configuration options
 * @returns {object} Detection results including matched subjects and books
 */
export function detectQuerySubjects(query, options = {}) {
  const {
    showPersonal = false,
    minScore = 0.25,
    maxSubjects = 3
  } = options;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return { hasMatches: false, matchedSubjects: [], targetDriveFileIds: [], books: [] };
  }

  const catalog = getSubjectCatalog();
  if (catalog.length === 0) {
    return { hasMatches: false, matchedSubjects: [], targetDriveFileIds: [], books: [] };
  }

  const queryLower = query.toLowerCase();
  const queryTokens = new Set(cleanTokens(query));

  // Expand acronyms from query
  const expandedQueryPhrases = [];
  for (const [acronym, expansions] of Object.entries(ACRONYMS_AND_SYNONYMS)) {
    const rx = new RegExp(`\\b${acronym}\\b`, 'i');
    if (rx.test(queryLower)) {
      expandedQueryPhrases.push(...expansions);
    }
  }

  const scoredSubjects = [];

  for (const item of catalog) {
    // Check personal/entertainment filter if needed
    if (!showPersonal) {
      const isEnt = item.parts.some(p => 
        /\b(rpg|roleplaying|boardgame|gaming|tabletop|fantasy|dungeon|wargame)\b/i.test(p)
      );
      if (isEnt) continue;
    }

    let score = 0;
    const matchedTerms = [];

    const leafLower = item.leafName.toLowerCase();
    const leafTokens = cleanTokens(item.leafName);

    // 1. Direct leaf phrase match (e.g. "prompt engineering", "azure openai", "graph neural networks")
    if (queryLower.includes(leafLower)) {
      score += 1.0;
      matchedTerms.push(item.leafName);
    } else {
      // Check expanded phrases for leaf match
      for (const phrase of expandedQueryPhrases) {
        if (phrase.includes(leafLower) || leafLower.includes(phrase)) {
          score += 0.85;
          matchedTerms.push(`${item.leafName} (via ${phrase})`);
          break;
        }
      }
    }

    // 2. Token overlap on leaf name
    let leafOverlapCount = 0;
    for (const lt of leafTokens) {
      if (queryTokens.has(lt)) {
        leafOverlapCount++;
      }
    }
    if (leafTokens.length > 0 && leafOverlapCount > 0) {
      const overlapRatio = leafOverlapCount / leafTokens.length;
      if (overlapRatio >= 0.5) {
        score += overlapRatio * 0.6;
        matchedTerms.push(`partial: ${leafOverlapCount}/${leafTokens.length} tokens`);
      }
    }

    // 3. Higher-level path segments match (e.g. "artificial intelligence", "developer", "data")
    for (let i = 0; i < item.parts.length - 1; i++) {
      const partLower = item.parts[i].toLowerCase();
      if (partLower === 'ai categorisation' || partLower === 'folder structure') continue;
      if (queryLower.includes(partLower)) {
        score += 0.35;
        matchedTerms.push(item.parts[i]);
      }
    }

    // 4. Topic matches within this subject's documents
    let topicMatchCount = 0;
    for (const t of item.topics) {
      const topicLower = (t.topic || '').toLowerCase();
      if (topicLower.length > 3 && queryLower.includes(topicLower)) {
        topicMatchCount++;
        matchedTerms.push(`topic: "${t.topic}"`);
        if (topicMatchCount >= 2) break;
      }
    }
    if (topicMatchCount > 0) {
      score += Math.min(topicMatchCount * 0.3, 0.6);
    }

    // 5. Book filename matching
    for (const b of item.books) {
      const cleanTitle = b.filename.replace(/\.pdf$/i, '').toLowerCase();
      const titleTokens = cleanTokens(cleanTitle);
      let titleHits = 0;
      for (const tt of titleTokens) {
        if (queryTokens.has(tt) && tt.length > 3) titleHits++;
      }
      if (titleHits >= 2) {
        score += 0.4;
        matchedTerms.push(`book: "${b.filename}"`);
        break;
      }
    }

    if (score >= minScore) {
      scoredSubjects.push({
        subject: item.subject,
        leafName: item.leafName,
        parts: item.parts,
        source: item.source,
        score,
        books: item.books,
        matchedTerms
      });
    }
  }

  // Sort by highest score first
  scoredSubjects.sort((a, b) => b.score - a.score);

  const topSubjects = scoredSubjects.slice(0, maxSubjects);
  const targetDriveFileIdsSet = new Set();
  const allMatchedBooks = [];

  for (const s of topSubjects) {
    for (const b of s.books) {
      if (!targetDriveFileIdsSet.has(b.driveFileId)) {
        targetDriveFileIdsSet.add(b.driveFileId);
        allMatchedBooks.push({
          driveFileId: b.driveFileId,
          filename: b.filename,
          subject: s.subject
        });
      }
    }
  }

  return {
    hasMatches: topSubjects.length > 0,
    matchedSubjects: topSubjects,
    targetDriveFileIds: Array.from(targetDriveFileIdsSet),
    books: allMatchedBooks
  };
}

export default {
  getSubjectCatalog,
  detectQuerySubjects
};
