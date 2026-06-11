/**
 * One-shot script: Extract TOC/outline from all cached PDFs
 * and populate the toc_items table. Run once after adding the
 * extractOutline function to pdfService.js.
 *
 * Usage: node server/scripts/extract_tocs.js
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../db/database.js';
import { extractOutline } from '../services/pdfService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_CACHE_DIR = path.join(__dirname, '..', 'data', 'pdfs');

async function main() {
  console.log('=== TOC Extraction Script ===');
  
  // Get all documents
  const documents = db.prepare('SELECT id, drive_file_id, filename FROM documents ORDER BY filename').all();
  console.log(`Found ${documents.length} documents.`);
  
  let totalToc = 0;
  let failed = 0;
  let noToc = 0;

  for (const doc of documents) {
    const pdfPath = path.join(PDF_CACHE_DIR, `${doc.drive_file_id}.pdf`);
    
    if (!fs.existsSync(pdfPath)) {
      console.log(`  ⏭ ${doc.filename} — no cached PDF`);
      noToc++;
      continue;
    }

    try {
      const items = await extractOutline(pdfPath);
      
      // Clear old TOC for this document
      db.prepare('DELETE FROM toc_items WHERE document_id = ?').run(doc.id);
      
      if (items.length > 0) {
        const insertToc = db.prepare(
          'INSERT INTO toc_items (id, document_id, title, level, parent_id, page_number, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        const insertMany = db.transaction((allItems) => {
          for (const item of allItems) {
            insertToc.run(item.id, doc.id, item.title, item.level, item.parentId, item.pageNumber, item.orderIndex);
          }
        });
        insertMany(items);
        totalToc += items.length;
        console.log(`  ✓ ${doc.filename} — ${items.length} TOC items`);
      } else {
        console.log(`  ○ ${doc.filename} — no TOC/outline found`);
        noToc++;
      }
    } catch (err) {
      console.log(`  ✗ ${doc.filename} — ${err.message}`);
      failed++;
    }
  }

  console.log('\n=== Done ===');
  console.log(`Total TOC items stored: ${totalToc}`);
  console.log(`Documents with TOC: ${documents.length - noToc - failed}`);
  console.log(`No TOC found: ${noToc}`);
  console.log(`Failed: ${failed}`);
  
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
