import db from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// AI reviews are written once, in whichever distance unit was showing at the time. When the
// km / miles switch is flipped, the saved text is rewritten in the other unit (one short model
// call, then remembered) so the wording always matches what the page is showing.
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
db.exec('CREATE TABLE IF NOT EXISTS ai_text_units (kind TEXT NOT NULL, owner TEXT NOT NULL, units TEXT NOT NULL, text TEXT NOT NULL, PRIMARY KEY (kind, owner, units))');

export const normaliseUnits = (u) => (u === 'mi' ? 'mi' : 'km');

// Forget converted copies when the original is rewritten.
export const clearUnitCache = (kind, owner) => db.prepare('DELETE FROM ai_text_units WHERE kind = ? AND owner = ?').run(kind, String(owner));

export async function textInUnits(kind, owner, text, writtenIn, wanted) {
  const from = normaliseUnits(writtenIn), to = normaliseUnits(wanted);
  if (!text || from === to) return text;
  const hit = db.prepare('SELECT text FROM ai_text_units WHERE kind = ? AND owner = ? AND units = ?').get(kind, String(owner), to);
  if (hit) return hit.text;
  const target = to === 'mi' ? 'MILES (mi), pace in minutes per mile, and speed in mph' : 'KILOMETRES (km), pace in minutes per km, and speed in km/h';
  const prompt =
    `Rewrite the text below so every distance, pace and speed is in ${target}. Convert the numbers accurately (1 mile = 1.609344 km) and round sensibly (distances to 1 decimal place, paces to the nearest second). ` +
    `Elevation and climbing stay in metres. Change NOTHING else: keep the wording, headings, bullets, markdown, glucose numbers and everything else exactly as written. Output only the rewritten text.\n\nTEXT:\n${text}`;
  const out = (await genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }).generateContent(prompt)).response.text().trim();
  db.prepare('INSERT OR REPLACE INTO ai_text_units (kind, owner, units, text) VALUES (?, ?, ?, ?)').run(kind, String(owner), to, out);
  return out;
}
