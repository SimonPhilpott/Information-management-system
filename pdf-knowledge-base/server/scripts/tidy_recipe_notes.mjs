// One-off (24 Oct 2026, Simon): recipe notes keep every bit of brewing information but lose what was carried over from
// where the recipe came from - people ("his notes", "he collected 10 L"), books ("the book adds...", chapters) and
// scans ("the scan reads 3 oz as..."). A minimal edit: a note with none of that is left exactly as it is.
//   node server/scripts/tidy_recipe_notes.mjs            Gemini edits; checks; review file (nothing changed)
//   node server/scripts/tidy_recipe_notes.mjs --apply    saves them (backup first)
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';
import { GoogleGenerativeAI } from '../services/geminiClient.js';
import { getModelFor } from '../services/modelRegistry.js';

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const APPLY = process.argv.includes('--apply');
const CACHE = path.join(DATA, 'recipe_notes_proposals.json');
const REPORT = path.join(DATA, 'recipe_notes_review.md');
const BATCH = 12;
const db = new Database(path.join(DATA, 'app.db'));

const FLAG = /\b(he|she|his|her|him|the author|the book'?s?|the scan|scanned|scan's|chapter|page \d+|the original recipe|the recipe book|the brewer)\b/i;
const recipes = db.prepare('SELECT id, name, notes FROM brews WHERE is_recipe = 1 AND notes IS NOT NULL').all().filter((r) => FLAG.test(r.notes));

const SYSTEM = 'You are a careful copy editor for a home-brewing recipe book. You make the smallest edits needed. Reply with JSON only.';
const RULES = `Each recipe below has a note. Edit each note so it no longer refers to where the recipe came from, and change nothing else:
- Remove references to people: "he", "she", "his", "her", "him", the author, the brewer ("his notes for this one" -> "notes for this one"; "for his 5-gallon batch" -> "for a 5-gallon batch"; "he collected 10 L" -> "it makes about 10 L").
- Remove references to a book, chapter, page, scan or printed original ("the book adds grape juice concentrate" -> "Grape juice concentrate is added"; "the book's Imperial column" -> "Imperial measures"; "The scan reads 3 oz, read as ½ oz" -> "½ oz"; "Sugar fractions in the scanned book are hard to read, so allow ±¼ lb" -> "Allow ±¼ lb of sugar"). When a sentence only explains a misprint, keep just the corrected amount or advice.
- Keep EVERY piece of brewing information: amounts, conversions, batch sizes, gravities, temperatures, timings, method tips, warnings and alternatives. Keep the same wording wherever it doesn't need to change, the same paragraph breaks (\\n), British spelling.
- Don't use a dash as punctuation (" - "); use a comma or full stop. Don't add anything new.
Return {"results": [{"id": number, "notes": "the edited note"}]} with one entry per recipe.`;

const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({ model: getModelFor('homebrew') || config.gemini.chatModels.flash, systemInstruction: SYSTEM });
async function ask(batch) {
  const list = batch.map((r) => `### id ${r.id} (${r.name})\n${r.notes}`).join('\n\n');
  const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: `${RULES}\n\n${list}` }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } });
  return JSON.parse(res.response.text()).results || [];
}

// checks: nothing about people, books or scans left; no spaced dashes; no big loss of content (numbers kept)
const nums = (t) => (String(t).match(/\d+(?:[.,]\d+)?/g) || []).length;
const problems = (r, t) => {
  const p = [];
  if (!t || !t.trim()) return ['empty'];
  const m = t.match(FLAG);
  if (m) p.push(`still says "${m[0]}"`);
  if (/\s[-–—]\s/.test(t)) p.push('has a spaced dash');
  if (nums(t) < nums(r.notes) * 0.8 - 1) p.push(`lost numbers (${nums(r.notes)} -> ${nums(t)})`);
  return p;
};

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const todo = recipes.filter((r) => !cache[r.id] || cache[r.id].old !== r.notes || problems(r, cache[r.id].notes).length);
if (!APPLY && todo.length) {
  console.log(`Editing ${todo.length} notes in ${Math.ceil(todo.length / BATCH)} batches...`);
  for (let s = 0; s < todo.length; s += BATCH) {
    const batch = todo.slice(s, s + BATCH);
    let results = [];
    for (let attempt = 0; attempt < 3 && !results.length; attempt++) {
      try { results = await ask(batch); } catch (e) { console.log(`  batch ${s / BATCH + 1}: ${e.message} - trying again`); await new Promise((r) => setTimeout(r, 4000)); }
    }
    for (const r of results) {
      const rec = batch.find((b) => b.id === Number(r.id));
      if (rec) cache[rec.id] = { name: rec.name, old: rec.notes, notes: String(r.notes || '').replace(/\s+[-–—]\s+/g, ', ').trim() };
    }
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
    if ((s / BATCH) % 10 === 9 || s + BATCH >= todo.length) console.log(`  ${Math.min(s + BATCH, todo.length)} of ${todo.length}`);
  }
}

const ready = recipes.filter((r) => cache[r.id] && cache[r.id].old === r.notes && !problems(r, cache[r.id].notes).length);
const flagged = recipes.filter((r) => cache[r.id] && problems(r, cache[r.id].notes).length);
const md = [`# Recipe notes (${ready.length} ready, ${flagged.length} flagged)`, '',
  ...(flagged.length ? ['## Flagged (not saved; run again to retry)', '', ...flagged.map((r) => `- **${r.name}** (#${r.id}): ${problems(r, cache[r.id].notes).join(', ')}`), ''] : []),
  '## Ready', '', ...ready.map((r) => `### ${r.name} (#${r.id})\n\n**Was:** ${r.notes.replace(/\n+/g, ' / ')}\n\n**Now:** ${cache[r.id].notes.replace(/\n+/g, ' / ')}\n`)].join('\n');
fs.writeFileSync(REPORT, md);
console.log(`${ready.length} ready, ${flagged.length} flagged. Review: ${REPORT}`);
if (!APPLY) { console.log('Dry run - nothing changed.'); process.exit(0); }

const backup = path.join(DATA, `recipe_notes_backup_${Date.now()}.json`);
fs.writeFileSync(backup, JSON.stringify(recipes.map((r) => ({ id: r.id, notes: r.notes })), null, 1));
const upd = db.prepare('UPDATE brews SET notes = ?, updated_at = ? WHERE id = ?');
db.transaction(() => { for (const r of ready) upd.run(cache[r.id].notes, Date.now(), r.id); })();
console.log(`Saved ${ready.length} notes. Backup of the old ones: ${backup}`);
process.exit(0);
