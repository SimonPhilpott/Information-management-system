import db from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';

console.log('🌱 Seeding demo data...');

// 1. Clear existing demo data (optional, but good for fresh start)
// db.prepare('DELETE FROM token_usage').run();
// db.prepare('DELETE FROM settings').run();
// db.prepare('DELETE FROM chat_sessions').run();
// db.prepare('DELETE FROM documents').run();
// db.prepare('DELETE FROM topics').run();

// 2. Set default settings
db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('monthly_spend_cap', '250')").run();
db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('drive_root_folder_id', 'sample-root-id')").run();
db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('drive_root_folder_name', 'My PDF Library')").run();
db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('isConfigured', '1')").run();
db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('preferredModel', '\"flash\"')").run();

// 3. Add sample documents
const docs = [
  { id: uuidv4(), drive_file_id: 'sample-1', filename: 'Quantum_Computing_Intro.pdf', subject: 'Physics', page_count: 45 },
  { id: uuidv4(), drive_file_id: 'sample-2', filename: 'neural_networks_guide.pdf', subject: 'Computer Science', page_count: 120 },
  { id: uuidv4(), drive_file_id: 'sample-3', filename: 'Macroeconomics_Theory.pdf', subject: 'Economics', page_count: 85 }
];

const insertDoc = db.prepare(`
  INSERT OR REPLACE INTO documents (id, drive_file_id, filename, subject, page_count, indexed)
  VALUES (?, ?, ?, ?, ?, 1)
`);

docs.forEach(d => insertDoc.run(d.id, d.drive_file_id, d.filename, d.subject, d.page_count));

// 4. Add sample usage (simulating some spend)
const insertUsage = db.prepare(`
  INSERT INTO token_usage (timestamp, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost, operation)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const now = new Date();
for (let i = 0; i < 15; i++) {
  const ts = new Date(now.getTime() - i * 8 * 3600 * 1000).toISOString();
  const prompt = Math.floor(Math.random() * 2000) + 500;
  const completion = Math.floor(Math.random() * 500) + 100;
  const total = prompt + completion;
  const cost = (prompt / 1_000_000) * 0.3 + (completion / 1_000_000) * 2.5; // Flash pricing
  
  insertUsage.run(ts, 'gemini-1.5-flash', prompt, completion, total, cost, 'chat');
}

// 5. Add sample topics
const insertTopic = db.prepare(`
  INSERT INTO topics (id, document_id, subject, topic, description, suggested_question)
  VALUES (?, ?, ?, ?, ?, ?)
`);

docs.forEach(d => {
  insertTopic.run(uuidv4(), d.id, d.subject, 'Fundamental Concepts', `Key introduction to ${d.subject} principles.`, `What are the core fundamentals discussed in ${d.filename}?`);
  insertTopic.run(uuidv4(), d.id, d.subject, 'Advanced Theory', `Deep dive into complex theoretical frameworks.`, `Can you explain the advanced theory section in ${d.filename}?`);
});

// 6. Add sample chat session
const sessionId = uuidv4();
db.prepare('INSERT INTO chat_sessions (id, title) VALUES (?, ?)').run(sessionId, 'Quantum Computing Basics');

const insertMsg = db.prepare(`
  INSERT INTO chat_messages (id, session_id, role, content, citations_json, model_used)
  VALUES (?, ?, ?, ?, ?, ?)
`);

insertMsg.run(uuidv4(), sessionId, 'user', 'What is quantum entanglement?', null, 'flash');
insertMsg.run(uuidv4(), sessionId, 'assistant', 'Quantum entanglement is a phenomenon where physical particles become interconnected such that the state of one particle cannot be described independently of the others, even when separated by large distances. [[Quantum_Computing_Intro.pdf, Page 12]]', JSON.stringify([
  { text: 'Quantum_Computing_Intro.pdf, Page 12', filename: 'Quantum_Computing_Intro.pdf', driveFileId: 'sample-1', pageNum: 12, excerpt: 'Entanglement is one of the most counter-intuitive aspects of quantum mechanics...' }
]), 'gemini-1.5-flash');

// 7. Dummy OAuth for UI visibility
db.prepare(`
  INSERT OR REPLACE INTO oauth_tokens (id, access_token, refresh_token, token_type, expiry_date, user_email, user_name)
  VALUES (1, 'mock-token', 'mock-refresh', 'Bearer', 9999999999999, 'demo@example.com', 'Demo User')
`).run();

console.log('✅ Seeding complete! Restart your server to see the demo data.');
