import db from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getArtistList } from './musicScanService.js';

// Background tasks: the user asks Ims to look into something ("find out which of my bands are
// playing Leeds next year"), IMS researches it in the background with Gemini and Google Search,
// and the write-up is kept here - Ims can report on it later, and it shows on /ims/tasks.
// Ims never announces a finished task on his own; it goes into the next day report instead.

db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, request TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', summary TEXT, result TEXT, sources TEXT NOT NULL DEFAULT '[]', error TEXT,
  origin TEXT, created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER, reported_at INTEGER
)`);

const MAX_RUNNING = 2;
const TASK_TIMEOUT_MS = 4 * 60000;
let running = 0;

const present = (r) => r && ({
  id: r.id, title: r.title, request: r.request, status: r.status, summary: r.summary, result: r.result,
  sources: (() => { try { return JSON.parse(r.sources || '[]'); } catch { return []; } })(),
  error: r.error, origin: r.origin, createdAt: r.created_at, startedAt: r.started_at, finishedAt: r.finished_at, reportedAt: r.reported_at,
});

function context() {
  let bands = '';
  try {
    bands = getArtistList().filter((a) => /metal|rock|desert/i.test(a.genre || '') && a.owned > 0)
      .sort((a, b) => b.owned - a.owned).slice(0, 120).map((a) => a.mbName || a.name).join(', ');
  } catch (_) { /* no library */ }
  const now = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'full', timeStyle: 'short' });
  return `About the user: lives in Leeds, West Yorkshire, UK (also cares about Sheffield, Manchester and York; London is a maybe). Today is ${now}. `
    + 'Has type 1 diabetes on an AAPS closed loop and runs regularly. Loves heavy metal and rock. '
    + (bands ? `Bands in their music collection they own the most by (use this when the task mentions "my bands" or "my music"): ${bands}.` : '');
}

async function run(id) {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!row) return;
  running++;
  db.prepare("UPDATE tasks SET status = 'running', started_at = ?, error = NULL WHERE id = ?").run(Date.now(), id);
  try {
    const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({ model: 'gemini-2.5-flash', tools: [{ googleSearch: {} }] });
    const prompt = `You are doing a background research task for the user of IMS, their personal assistant. Search the web as much as you need and be accurate - never invent facts, dates or prices; say plainly if something couldn't be found.
${context()}

THE TASK: ${row.request}

Reply in British English in exactly this shape:
SUMMARY: two or three plain sentences with the answer, suitable for reading aloud.
DETAILS:
the full findings - short paragraphs or "- " bullet points, with dates, places and figures.`;
    const res = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, rej) => setTimeout(() => rej(new Error('The task took too long and was stopped.')), TASK_TIMEOUT_MS)),
    ]);
    const text = res.response.text().trim();
    const summary = (text.match(/SUMMARY:\s*([\s\S]*?)(?:\n\s*DETAILS:|$)/i) || [])[1]?.trim() || text.split('\n')[0];
    const details = (text.match(/DETAILS:\s*([\s\S]*)$/i) || [])[1]?.trim() || text;
    const chunks = res.response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = [...new Map(chunks.filter((c) => c.web?.uri).map((c) => [c.web.title || c.web.uri, { title: c.web.title || c.web.uri, url: c.web.uri }])).values()].slice(0, 12);
    db.prepare("UPDATE tasks SET status = 'done', summary = ?, result = ?, sources = ?, finished_at = ? WHERE id = ?")
      .run(summary.slice(0, 1500), details, JSON.stringify(sources), Date.now(), id);
    console.log(`[Tasks] #${id} done: ${row.title}`);
  } catch (err) {
    db.prepare("UPDATE tasks SET status = 'failed', error = ?, finished_at = ? WHERE id = ?").run(err.message, Date.now(), id);
    console.warn(`[Tasks] #${id} failed:`, err.message);
  } finally {
    running--;
    pump();
  }
}

function pump() {
  while (running < MAX_RUNNING) {
    const next = db.prepare("SELECT id FROM tasks WHERE status = 'queued' ORDER BY created_at LIMIT 1").get();
    if (!next) return;
    db.prepare("UPDATE tasks SET status = 'running' WHERE id = ?").run(next.id); // claim it before the async start
    run(next.id);
  }
}

// Anything left running when the server restarted goes back in the queue.
db.prepare("UPDATE tasks SET status = 'queued' WHERE status = 'running'").run();
setTimeout(pump, 5000);

async function titleFor(request) {
  try {
    const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({ model: 'gemini-2.5-flash' });
    const t = (await model.generateContent(`Give a short title (max 7 words, no quotes, British English) for this task: ${request}`)).response.text().trim();
    return t.replace(/^["']|["'.]$/g, '').slice(0, 80) || request.slice(0, 60);
  } catch { return request.slice(0, 60); }
}

export async function createTask({ request, title, origin = 'page' }) {
  const req = String(request || '').trim();
  if (req.length < 5) throw new Error('Say what the task is.');
  const t = String(title || '').trim() || await titleFor(req);
  const info = db.prepare('INSERT INTO tasks (title, request, status, origin, created_at) VALUES (?, ?, ?, ?, ?)').run(t, req.slice(0, 2000), 'queued', origin, Date.now());
  setImmediate(pump);
  return present(db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid));
}

export const listTasks = (limit = 50) => db.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?').all(limit).map(present);
export const getTask = (id) => present(db.prepare('SELECT * FROM tasks WHERE id = ?').get(Number(id)));
export const deleteTask = (id) => db.prepare('DELETE FROM tasks WHERE id = ?').run(Number(id)).changes > 0;
export function rerunTask(id) {
  const r = db.prepare("UPDATE tasks SET status = 'queued', summary = NULL, result = NULL, sources = '[]', error = NULL, finished_at = NULL, reported_at = NULL WHERE id = ?").run(Number(id));
  if (!r.changes) throw new Error('Task not found.');
  setImmediate(pump);
  return getTask(id);
}

// For Ims: recent tasks, or one matched by id / words in its title or request.
export function describeTasksForIms({ id, about } = {}) {
  let rows;
  if (id) rows = [getTask(id)].filter(Boolean);
  else if (about) {
    const words = String(about).toLowerCase().split(/\W+/).filter((w) => w.length > 2);
    rows = listTasks(30).filter((t) => words.some((w) => `${t.title} ${t.request}`.toLowerCase().includes(w))).slice(0, 3);
  } else rows = listTasks(6);
  const now = Date.now();
  for (const t of rows) if (t.status === 'done' && !t.reportedAt) db.prepare('UPDATE tasks SET reported_at = ? WHERE id = ?').run(now, t.id);
  return rows.map((t) => ({
    id: t.id, title: t.title, status: t.status,
    askedAt: new Date(t.createdAt).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' }),
    ...(t.status === 'done' ? { summary: t.summary, details: (t.result || '').slice(0, 2500) } : {}),
    ...(t.status === 'failed' ? { error: t.error } : {}),
  }));
}

// For the day report: finished tasks the user hasn't heard about yet.
export function unreportedTasks() {
  const rows = db.prepare("SELECT * FROM tasks WHERE status = 'done' AND reported_at IS NULL ORDER BY finished_at").all().map(present);
  const now = Date.now();
  for (const t of rows) db.prepare('UPDATE tasks SET reported_at = ? WHERE id = ?').run(now, t.id);
  return rows;
}
