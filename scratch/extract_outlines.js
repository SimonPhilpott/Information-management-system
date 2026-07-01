import { extractOutline } from '../pdf-knowledge-base/server/services/pdfService.js';
import fs from 'fs';
import path from 'path';

const books = [
  'Building Knowledge Graphs.pdf',
  'Large-scale Graph Analysis System Algorithm and Optimization.pdf',
  'The Practitioners Guide to Graph Data.pdf'
];
const dir = 'G:\\My Drive\\BOOKS\\Data';

async function main() {
  for (const book of books) {
    const filePath = path.join(dir, book);
    console.log(`\n===================================`);
    console.log(`Outline for: ${book}`);
    console.log(`===================================`);
    try {
      const outline = await extractOutline(filePath);
      const matches = outline.filter(item => 
        /ident/i.test(item.title) || 
        /nam/i.test(item.title) || 
        /uri/i.test(item.title) || 
        /path/i.test(item.title) || 
        /syntax/i.test(item.title) ||
        /model/i.test(item.title)
      );
      console.log(`Total outline items: ${outline.length}`);
      console.log(`Matching items:`);
      console.log(JSON.stringify(matches, null, 2));
    } catch (e) {
      console.error(`Error outlining ${book}:`, e);
    }
  }
}

main();
