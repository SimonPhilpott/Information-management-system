import { Router } from 'express';
import { getCachedPdfPath, ensurePdfCached } from '../services/driveService.js';
import db from '../db/database.js';
import fs from 'fs';

const router = Router();

/**
 * GET /api/pdf/:driveFileId - Serve a cached PDF file for the in-app viewer
 */
router.get('/:driveFileId', async (req, res) => {
  try {
    const { driveFileId } = req.params;

    // Get document info
    const doc = db.prepare('SELECT filename FROM documents WHERE drive_file_id = ?').get(driveFileId);

    // Try cached file first
    let filePath = getCachedPdfPath(driveFileId);

    // Download on-demand if not cached
    if (!filePath) {
      filePath = await ensurePdfCached(driveFileId);
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    const stat = fs.statSync(filePath);
    const filename = doc?.filename || `${driveFileId}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Accept-Ranges', 'bytes');

    // Support range requests for PDF.js
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', chunkSize);

      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    }
  } catch (err) {
    console.error('PDF serve error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
