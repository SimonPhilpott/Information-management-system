import db from './db/database.js';
console.log(db.prepare('PRAGMA table_info(documents)').all());
