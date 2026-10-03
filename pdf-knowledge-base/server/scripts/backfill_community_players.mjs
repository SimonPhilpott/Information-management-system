import fs from 'fs';
import db from '../db/database.js';

const csvPath = 'data/bgg_collection.csv';
if (!fs.existsSync(csvPath)) {
  console.log('No CSV found at', csvPath);
  process.exit(0);
}

const csv = fs.readFileSync(csvPath, 'utf8');
const lines = csv.split('\n');
const head = lines[0].split(',').map(s => s.trim());
const idIdx = head.indexOf('objectid');
const recIdx = head.indexOf('bggrecplayers');
const bestIdx = head.indexOf('bggbestplayers');

const updateStmt = db.prepare(`
  UPDATE boardgame_details
  SET community_min_players = ?, community_players = ?
  WHERE bgg_id = ?
`);

let updated = 0;
const parseRow = (line) => {
  const cols = [];
  let cur = '', inQ = false;
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    if (inQ) {
      if (ch === '"') {
        if (line[j + 1] === '"') { cur += '"'; j++; }
        else inQ = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { cols.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  cols.push(cur);
  return cols;
};

db.transaction(() => {
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = parseRow(line);
    const id = Number(cols[idIdx]);
    if (!id) continue;
    const rec = cols[recIdx] || '';
    const best = cols[bestIdx] || '';
    const recNums = rec.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0);
    const bestNums = best.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n) && n > 0);
    const commRec = [...new Set([...recNums, ...bestNums])].sort((a, b) => a - b);
    if (commRec.length > 0) {
      const info = updateStmt.run(commRec[0], JSON.stringify(commRec), id);
      if (info.changes > 0) updated++;
    }
  }
})();

console.log(`Backfilled community players for ${updated} rows in boardgame_details`);
