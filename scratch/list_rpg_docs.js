import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = 'C:/Users/sideb/.gemini/antigravity/scratch/pdf-knowledge-base/server/data/app.db';
const db = new Database(DB_PATH);

console.log('=== DOCUMENTS ===');
const docs = db.prepare('SELECT id, filename, folder_path, subject FROM documents').all();
console.log(docs);

console.log('\n=== TOPICS & SUGGESTIONS ===');
const topics = db.prepare('SELECT id, subject, topic, description, suggested_question FROM topics').all();
console.log(topics);
