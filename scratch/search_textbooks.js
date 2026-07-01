import fs from 'fs';
import path from 'path';

// Polyfill DOMMatrix for Node.js PDF.js execution
globalThis.DOMMatrix = class DOMMatrix {
  constructor() {
    this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
  }
};

const books = [
  {
    name: 'Building Knowledge Graphs.pdf',
    ranges: [
      { start: 147, end: 157, label: 'Identity Knowledge Graphs' }
    ]
  },
  {
    name: 'The Practitioners Guide to Graph Data.pdf',
    ranges: [
      { start: 109, end: 119, label: 'Naming Mistakes' },
      { start: 140, end: 146, label: 'Primary Keys' },
      { start: 249, end: 256, label: 'Path Concepts' }
    ]
  }
];

const dir = 'G:\\My Drive\\BOOKS\\Data';

async function extractPages(filePath, startPage, endPage) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  let text = '';
  
  for (let p = startPage; p <= Math.min(endPage, doc.numPages); p++) {
    try {
      const page = await doc.getPage(p);
      const textContent = await page.getTextContent();
      let lastY = null;
      let textParts = [];
      for (const item of textContent.items) {
        if (item.str === undefined) continue;
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
          textParts.push('\n');
        }
        textParts.push(item.str);
        lastY = item.transform[5];
      }
      text += `\n--- Page ${p} ---\n` + textParts.join('').trim() + '\n';
    } catch (e) {
      text += `\n--- Page ${p} (Error: ${e.message}) ---\n`;
    }
  }
  await doc.destroy();
  return text;
}

async function main() {
  let output = '';
  for (const book of books) {
    const filePath = path.join(dir, book.name);
    output += `========================================================\n`;
    output += `BOOK: ${book.name}\n`;
    output += `========================================================\n\n`;
    for (const range of book.ranges) {
      output += `### RANGE: ${range.label} (Pages ${range.start}-${range.end}) ###\n`;
      try {
        console.log(`Extracting ${book.name} - ${range.label} (${range.start}-${range.end})...`);
        const text = await extractPages(filePath, range.start, range.end);
        output += text + '\n';
      } catch (e) {
        output += `Error: ${e.message}\n\n`;
      }
    }
  }
  fs.writeFileSync('scratch/extracted_textbook_sections.txt', output);
  console.log('Extracted content written to scratch/extracted_textbook_sections.txt');
}

main();
