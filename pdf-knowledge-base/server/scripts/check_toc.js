import db from '../db/database.js';

const total = db.prepare('SELECT COUNT(*) as c FROM toc_items').get().c;
const withParent = db.prepare('SELECT COUNT(*) as c FROM toc_items WHERE parent_id IS NOT NULL').get().c;
const docsTotal = db.prepare('SELECT COUNT(DISTINCT document_id) as c FROM toc_items').get().c;
const docsNested = db.prepare('SELECT COUNT(DISTINCT document_id) as c FROM toc_items WHERE parent_id IS NOT NULL').get().c;

console.log(`TOC items:          ${total}`);
console.log(`With parent:         ${withParent} (${(withParent/total*100).toFixed(1)}%)`);
console.log(`Docs with TOC:       ${docsTotal}`);
console.log(`Docs with nested:    ${docsNested}`);
console.log(`Docs flat only:      ${docsTotal - docsNested}`);

const levels = db.prepare('SELECT level, COUNT(*) as c FROM toc_items GROUP BY level ORDER BY level').all();
console.log('\nLevel distribution:');
levels.forEach(l => console.log(`  Level ${l.level}: ${l.c} items`));
