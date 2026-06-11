import db from './db/database.js';

const totalDocs = db.prepare('SELECT COUNT(*) as count FROM documents').get().count;
const indexedDocs = db.prepare('SELECT COUNT(*) as count FROM documents WHERE indexed = 1').get().count;
const unindexedDocs = db.prepare('SELECT COUNT(*) as count FROM documents WHERE indexed = 0 OR indexed IS NULL').get().count;
const failedDocs = db.prepare('SELECT COUNT(*) as count FROM documents WHERE indexed = -1').get().count;

console.log({
  totalDocs,
  indexedDocs,
  unindexedDocs,
  failedDocs
});

const docs = db.prepare('SELECT id, drive_file_id, filename, indexed FROM documents').all();
console.log('Sample docs:', docs.slice(0, 5));
