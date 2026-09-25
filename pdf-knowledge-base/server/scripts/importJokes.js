// One-off (and safe to re-run): fills the jokes table from the r/Jokes dataset.
//   node scripts/importJokes.js
import '../config.js';
import { importJokes, getJokeStats } from '../services/jokeService.js';

const started = Date.now();
const stats = await importJokes();
console.log(`Done in ${Math.round((Date.now() - started) / 1000)}s:`, stats, getJokeStats());
process.exit(0);
