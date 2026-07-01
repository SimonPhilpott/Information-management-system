import fs from 'fs';
import path from 'path';

globalThis.DOMMatrix = class DOMMatrix {
  constructor() {
    this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
  }
};

const books = [
  'Building Knowledge Graphs.pdf',
  'Large-scale Graph Analysis System Algorithm and Optimization.pdf',
  'The Practitioners Guide to Graph Data.pdf'
];
const dir = 'G:\\My Drive\\BOOKS\\Data';

async function getActualOutline(filePath) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  
  const outline = await doc.getOutline();
  if (!outline || outline.length === 0) {
    await doc.destroy();
    return [];
  }
  
  const items = [];
  let globalIndex = 0;
  
  async function walk(tree, level = 0) {
    for (const item of tree) {
      let pageNum = null;
      if (item.dest) {
        let dest = item.dest;
        if (typeof dest === 'string') {
          dest = await doc.getDestination(dest);
        }
        if (Array.isArray(dest)) {
          const pageRef = dest[0];
          if (pageRef && typeof pageRef === 'object') {
            try {
              // getPageIndex is 0-indexed, so add 1 for 1-based page number
              pageNum = (await doc.getPageIndex(pageRef)) + 1;
            } catch (e) {
              // Ignore resolution failure
            }
          }
        }
      }
      
      globalIndex++;
      const entry = {
        title: item.title || '',
        level,
        pageNumber: pageNum
      };
      items.push(entry);
      
      if (item.items && item.items.length > 0) {
        await walk(item.items, level + 1);
      }
    }
  }
  
  await walk(outline);
  await doc.destroy();
  return items;
}

async function main() {
  const allOutlines = {};
  for (const book of books) {
    console.log(`Resolving outline for ${book}...`);
    try {
      const outline = await getActualOutline(path.join(dir, book));
      allOutlines[book] = outline.filter(item => 
        /ident|nam|uri|path|syntax|fingerprint|model|key/i.test(item.title)
      );
      console.log(`Found ${allOutlines[book].length} matching sections in ${book}`);
    } catch (e) {
      console.error(`Error resolving ${book}:`, e);
    }
  }
  fs.writeFileSync('scratch/resolved_outlines.json', JSON.stringify(allOutlines, null, 2));
}

main();
