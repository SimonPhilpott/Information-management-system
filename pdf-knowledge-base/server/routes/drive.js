import { Router } from 'express';
import fs from 'fs';
import { syncPdfs, getSyncProgress, listDriveFolders, getCatalogStructure, deleteDocuments, moveDocument, findDuplicates, getCachedPdfPath } from '../services/driveService.js';
import { autoCategoriseBooks } from '../services/categorisationService.js';
import { extractPdfText, chunkText, getPageImage, extractOutline } from '../services/pdfService.js';
import { generateEmbeddings } from '../services/embeddingService.js';
import { storeEmbeddings, isDocumentIndexed } from '../services/vectorStore.js';
import { extractTopicsFromDocument } from '../services/topicService.js';
import db from '../db/database.js';
import config from '../config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// Track indexing progress
let indexProgress = { active: false, total: 0, current: 0, currentFile: '', phase: '' };

/**
 * POST /api/drive/sync - Sync PDFs from Google Drive and index them
 */
router.post('/sync', async (req, res) => {
  const syncProg = getSyncProgress();
  if (indexProgress.active || syncProg.active) {
    return res.status(400).json({ error: 'Sync already in progress' });
  }

  res.json({ message: 'Sync started', status: 'syncing' });

  // Run in background
  (async () => {
    try {
      // Phase 1: Download PDFs from Drive
      await syncPdfs();

      // Phase 2: Index unindexed documents (including previously failed ones at indexed=-1)
      const unindexed = db.prepare(`
        SELECT * FROM documents WHERE indexed = 0 OR indexed = -1 OR indexed IS NULL
      `).all();

      indexProgress = {
        active: true,
        total: unindexed.length,
        current: 0,
        currentFile: '',
        phase: 'Indexing documents...'
      };

      for (let i = 0; i < unindexed.length; i++) {
        const doc = unindexed[i];
        indexProgress.current = i; 
        indexProgress.currentFile = doc.filename;

        try {
          const pdfPath = path.join(__dirname, '..', 'data', 'pdfs', `${doc.drive_file_id}.pdf`);
          
          if (!fs.existsSync(pdfPath)) {
            console.warn(`[Indexing] Cache missing for ${doc.filename}`);
            db.prepare('UPDATE documents SET indexed = -1 WHERE id = ?').run(doc.id);
            continue;
          }

          indexProgress.phase = `Extracting text: ${doc.filename}`;
          const pdfData = await extractPdfText(pdfPath);

          db.prepare('UPDATE documents SET page_count = ? WHERE id = ?')
            .run(pdfData.pageCount, doc.id);

          if (pdfData.pages.length === 0) {
            db.prepare('UPDATE documents SET indexed = 1 WHERE id = ?').run(doc.id);
            continue;
          }

          const chunks = chunkText(pdfData.pages, {
            chunkSize: config.defaults.chunkSize,
            chunkOverlap: config.defaults.chunkOverlap
          });

          // --- Embeddings: isolated try/catch so failures don't block TOC/topics ---
          try {
            indexProgress.phase = `Generating embeddings: ${doc.filename}`;
            const embeddedChunks = await generateEmbeddings(chunks);
            storeEmbeddings(doc.subject, doc.id, doc.drive_file_id, doc.filename, embeddedChunks);
          } catch (embedErr) {
            console.warn(`[Indexing] Embedding failed for ${doc.filename} (continuing): ${embedErr.message}`);
          }

          // --- Topics: isolated try/catch ---
          try {
            indexProgress.phase = `Extracting topics: ${doc.filename}`;
            await extractTopicsFromDocument(doc.id, doc.filename, doc.subject, pdfData.pages);
          } catch (topicErr) {
            console.warn(`[Indexing] Topic extraction failed for ${doc.filename} (continuing): ${topicErr.message}`);
          }

          // --- TOC: isolated try/catch ---
          try {
            indexProgress.phase = `Extracting TOC: ${doc.filename}`;
            const tocItems = await extractOutline(pdfPath);
            if (tocItems.length > 0) {
              // Clear old TOC for this document then insert fresh
              db.prepare('DELETE FROM toc_items WHERE document_id = ?').run(doc.id);
              const insertToc = db.prepare(
                'INSERT INTO toc_items (id, document_id, title, level, parent_id, page_number, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
              );
              const insertMany = db.transaction((items) => {
                for (const item of items) {
                  insertToc.run(item.id, doc.id, item.title, item.level, item.parentId, item.pageNumber, item.orderIndex);
                }
              });
              insertMany(tocItems);
              console.log(`[Indexing] Stored ${tocItems.length} TOC items for ${doc.filename}`);
            }
          } catch (tocErr) {
            console.warn(`[Indexing] TOC extraction failed for ${doc.filename} (continuing): ${tocErr.message}`);
          }

          // Mark as successfully indexed — partial failures (embeddings, topics, TOC)
          // are acceptable; search and graph still work with whatever we got.
          db.prepare('UPDATE documents SET indexed = 1, index_error = NULL WHERE id = ?').run(doc.id);
        } catch (err) {
          // Only reach here on critical failures: missing cache, text extraction crash, etc.
          console.error(`[Indexing] Failed to index ${doc.filename}:`, err);
          db.prepare('UPDATE documents SET indexed = -1, index_error = ? WHERE id = ?')
            .run(err.message || 'Unknown indexing error', doc.id);
        } finally {
          indexProgress.current = i + 1;
        }
      }
      indexProgress = { active: false, total: 0, current: 0, currentFile: '', phase: 'Complete' };
    } catch (err) {
      console.error('Background sync error:', err);
      indexProgress = { active: false, total: 0, current: 0, currentFile: '', phase: `Error: ${err.message}` };
    }
  })();
});

/**
 * GET /api/drive/status - Get sync/index progress
 */
router.get('/status', (req, res) => {
  const driveProgress = getSyncProgress();
  const totalDocs = db.prepare('SELECT COUNT(*) as count FROM documents').get().count;
  const indexedDocs = db.prepare('SELECT COUNT(*) as count FROM documents WHERE indexed = 1').get().count;
  const lastSynced = db.prepare('SELECT MAX(last_synced) as last FROM documents').get().last;

  res.json({
    drive: driveProgress,
    indexing: indexProgress,
    stats: {
      totalDocuments: totalDocs,
      indexedDocuments: indexedDocs,
      lastSynced
    }
  });
});

/**
 * GET /api/drive/folders - Browse Drive folders for the folder picker
 */
router.get('/folders', async (req, res) => {
  try {
    const parentId = req.query.parentId || 'root';
    const folders = await listDriveFolders(parentId);
    res.json(folders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/drive/retry - Reset failed indexing status to try again
 */
router.post('/retry', async (req, res) => {
  try {
    const { driveFileIds } = req.body;
    if (driveFileIds && Array.isArray(driveFileIds)) {
      const placeholders = driveFileIds.map(() => '?').join(',');
      db.prepare(`UPDATE documents SET indexed = 0, index_error = NULL WHERE drive_file_id IN (${placeholders})`).run(...driveFileIds);
    } else {
      db.prepare('UPDATE documents SET indexed = 0, index_error = NULL WHERE indexed = -1').run();
    }
    res.json({ success: true, message: 'Failed documents reset for indexing. Start a sync to retry.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/drive/reindex - Force re-index all documents
 */
router.post('/reindex', async (req, res) => {
  try {
    db.prepare('UPDATE documents SET indexed = 0').run();
    res.json({ message: 'All documents marked for re-indexing. Start a sync to re-index.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/drive/catalog - Get the hierarchical folder structure
 */
router.get('/catalog', (req, res) => {
  try {
    const catalog = getCatalogStructure();
    res.json(catalog);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/drive/documents - Delete multiple documents
 */
router.delete('/documents', async (req, res) => {
  try {
    const { driveFileIds } = req.body;
    if (!driveFileIds || !Array.isArray(driveFileIds)) {
      return res.status(400).json({ error: 'driveFileIds array is required' });
    }
    await deleteDocuments(driveFileIds);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/drive/move - Move a document to a different subject
 */
router.post('/move', async (req, res) => {
  try {
    const { driveFileId, newSubject } = req.body;
    if (!driveFileId || !newSubject) {
      return res.status(400).json({ error: 'driveFileId and newSubject are required' });
    }
    await moveDocument(driveFileId, newSubject);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/drive/folder - "Create" a new folder (subject)
 */
router.post('/folder', (req, res) => {
  try {
    const { path } = req.body;
    if (!path) return res.status(400).json({ error: 'Folder path is required' });
    // This basically just validates/preps the string
    res.json({ subject: path.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/drive/duplicates - Find duplicate document IDs
 */
router.get('/duplicates', (req, res) => {
  try {
    const ids = findDuplicates();
    res.json({ duplicateIds: ids });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/drive/auto-categorise - Use AI to regroup books
 */
router.post('/auto-categorise', async (req, res) => {
  try {
    const { driveFileIds } = req.body;
    if (!driveFileIds || !Array.isArray(driveFileIds)) {
      return res.status(400).json({ error: 'driveFileIds array is required' });
    }
    const result = await autoCategoriseBooks(driveFileIds);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/drive/page-image/:driveFileId/:pageNum - Get a thumbnail of a PDF page
 */
router.get('/page-image/:driveFileId/:pageNum', async (req, res) => {
  try {
    const { driveFileId, pageNum } = req.params;
    const filePath = getCachedPdfPath(driveFileId);
    
    if (!filePath) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    const imageBuffer = await getPageImage(filePath, parseInt(pageNum), 0.5); // 0.5 scale for thumbnails
    
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24h
    res.send(imageBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
