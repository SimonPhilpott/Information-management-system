import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Extract text from a PDF file, page by page
 * Uses pdfjs-dist for reliable per-page extraction
 */
export async function extractPdfText(filePath) {
  // Dynamic import of pdfjs-dist
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

  const result = {
    pageCount: doc.numPages,
    pages: []
  };

  for (let i = 1; i <= doc.numPages; i++) {
    try {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();

      // Image detection - only check if we haven't found images yet or for first ~50 pages
      // to avoid hanging on massive complex documents
      let hasImages = false;
      if (i <= 50) {
        try {
          const ops = await Promise.race([
            page.getOperatorList(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
          ]);
          hasImages = ops.fnArray.some(fn => 
            fn === pdfjsLib.OPS.paintImageXObject || 
            fn === pdfjsLib.OPS.paintInlineImageXObject
          );
        } catch (e) {
          // Skip image detection on timeout/error
          hasImages = false;
        }
      }

      // Reconstruct text with proper line breaks
      let lastY = null;
      let textParts = [];

      for (const item of textContent.items) {
        if (item.str === undefined) continue;
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
          textParts.push('\n');
        }
        textParts.push(item.str);
        if (item.hasEOL) {
          textParts.push('\n');
        }
        lastY = item.transform[5];
      }

      const pageText = textParts.join('').trim();

      if (pageText.length > 0) {
        result.pages.push({
          pageNum: i,
          text: pageText,
          hasImages
        });
      }
    } catch (err) {
      console.warn(`Warning: Could not extract text from page ${i}: ${err.message}`);
    }
  }

  await doc.destroy();
  return result;
}

/**
 * Extract the Table of Contents (outline/bookmarks) from a PDF.
 * Returns an array of { title, level, pageNumber, children } items.
 */
export async function extractOutline(filePath) {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(fs.readFileSync(filePath));
    const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
    
    const outline = await doc.getOutline();
    await doc.destroy();

    if (!outline || outline.length === 0) return [];

    // Flatten the nested outline into a linear array with level information
    const items = [];
    let globalIndex = 0;

    function walk(tree, level = 0, parentId = null) {
      for (const item of tree) {
        const pageRef = item.dest ? (
          Array.isArray(item.dest) ? item.dest[0] : 
          typeof item.dest === 'object' && item.dest.num != null ? item.dest : null
        ) : null;

        globalIndex++;
        const entry = {
          id: `toc_${Date.now()}_${globalIndex}_${Math.random().toString(36).slice(2, 6)}`,
          title: item.title || '',
          level,
          parentId,
          pageNumber: pageRef && pageRef.num != null ? pageRef.num : null,
          orderIndex: globalIndex
        };
        items.push(entry);

        if (item.items && item.items.length > 0) {
          walk(item.items, level + 1, entry.id);
        }
      }
    }

    walk(outline);
    return items;
  } catch (err) {
    console.warn(`[PDF] Failed to extract outline: ${err.message}`);
    return [];
  }
}

/**
 * Chunk text into segments suitable for embedding
 * Each chunk retains source metadata (filename, page, position)
 */
export function chunkText(pages, { chunkSize = 500, chunkOverlap = 50 } = {}) {
  const chunks = [];

  for (const page of pages) {
    const words = page.text.split(/\s+/);

    if (words.length <= chunkSize) {
      // Entire page fits in one chunk
      chunks.push({
        text: page.text,
        pageNum: page.pageNum,
        chunkIndex: 0,
        hasImages: page.hasImages
      });
    } else {
      // Split into overlapping chunks
      let start = 0;
      let chunkIndex = 0;
      while (start < words.length) {
        const end = Math.min(start + chunkSize, words.length);
        const chunkText = words.slice(start, end).join(' ');
        chunks.push({
          text: chunkText,
          pageNum: page.pageNum,
          chunkIndex,
          hasImages: page.hasImages
        });
        start += chunkSize - chunkOverlap;
        chunkIndex++;
      }
    }
  }

  return chunks;
}

/**
 * Render a PDF page to an image buffer
 */
export async function getPageImage(filePath, pageNum, scale = 1.0) {
  const { createCanvas } = await import('canvas');
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(pageNum);

  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext('2d');

  await page.render({
    canvasContext: context,
    viewport: viewport
  }).promise;

  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.8 });
  
  await doc.destroy();
  return buffer;
}
