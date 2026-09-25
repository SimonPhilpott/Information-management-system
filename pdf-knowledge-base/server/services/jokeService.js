import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import { fileURLToPath } from 'url';
import db from '../db/database.js';

// Jokes for "tell me a joke", from the r/Jokes dataset (Weller & Seppi 2020,
// github.com/orionw/rJokesData). The data is Reddit posts under the Reddit terms of
// service, so it is kept in the git-ignored server/data folder for personal use.
//
// Each joke carries a score 0-11 (how well it was received) which is used to prefer
// the better ones. The Humor slider on IMS Personality is a STYLE axis, not an
// amount: Cheerful (0) - Dry (50) - Dark (100). pickJoke() scales the jokes told
// along it: clean and wholesome at the low end, dry short one-liners in the middle,
// darker and cruder towards the top.
//
// The raw data is filthy, so at import time anything hateful, sexual, about self-harm,
// sexual violence, abuse, atrocities or real tragedies is dropped outright and never
// stored, whatever the slider says.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'jokes');
const SOURCES = ['dev', 'test', 'train'];
const RAW_URL = 'https://raw.githubusercontent.com/orionw/rJokesData/master/data';

db.exec(`
  CREATE TABLE IF NOT EXISTS jokes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL UNIQUE,
    score INTEGER NOT NULL,
    dark INTEGER NOT NULL,
    rude INTEGER NOT NULL,
    len INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_jokes_pick ON jokes(dark, rude, score);
  CREATE TABLE IF NOT EXISTS joke_history (
    joke_id INTEGER NOT NULL,
    told_at INTEGER NOT NULL,
    humor INTEGER
  );
`);

// ---- content rules ---------------------------------------------------------------
const word = (list) => new RegExp(`\\b(?:${list.join('|')})\\b`, 'i');
const stem = (list) => new RegExp(`(?:${list.join('|')})`, 'i');

// Never stored: hate, explicit sex, self-harm, abuse, atrocity, real tragedy.
const BLOCK = [
  stem(['nigg', 'fagg', 'faggot', 'kike', 'chink', 'wetback', 'raghead', 'towelhead', 'tranny', 'retard', 'spastic', 'mongoloid', 'gypsies', 'redskin', 'sandnigg', 'paki\\b', 'beaner', 'gook', 'darkie', 'coon\\b', 'homo\\b', 'dyke']),
  word(['jews?', 'jewish', 'muslims?', 'islam(?:ic)?', 'arabs?', 'mexicans?', 'asians?', 'chinese', 'japanese', 'africans?', 'blacks?', 'negroes', 'gays?', 'lesbians?', 'homosexuals?', 'transgender', 'transsexual', 'blondes?', 'redneck', 'hillbill(?:y|ies)', 'immigrants?', 'refugees?', 'terrorists?', 'isis', 'nazis?', 'hitler', 'holocaust', 'auschwitz', 'genocide', 'slaves?', 'slavery', 'racist', 'racism']),
  word(['sex', 'sexual', 'sexy', 'dick', 'dicks', 'cock', 'cocks', 'penis', 'vagina', 'pussy', 'pussies', 'tits?', 'titties', 'boobs?', 'breasts?', 'nipples?', 'cum', 'cumming', 'blowjobs?', 'handjobs?', 'orgasms?', 'masturbat\\w*', 'porn\\w*', 'anal', 'anus', 'clit\\w*', 'whore', 'whores', 'slut', 'sluts', 'hooker', 'hookers', 'prostitutes?', 'stripper', 'strippers', 'horny', 'erection', 'boner', 'balls', 'nuts', 'semen', 'sperm', 'foreplay', 'threesome', 'bdsm', 'naked', 'nude', 'fuck\\w*', 'condoms?', 'pubic', 'virgin', 'virginity', 'kinky', 'fetish', 'gangbang', 'bukkake', 'jizz', 'wank\\w*', 'bollocks', 'twat', 'cunt', 'cunts', 'skank', 'hoe', 'hoes']),
  word(['suicide', 'suicidal', 'kill (?:myself|himself|herself|themselves)', 'hang (?:myself|himself|herself)', 'slit (?:my|his|her) wrists?', 'overdos\\w*', 'self[- ]harm', 'rape', 'raped', 'raping', 'rapist', 'rapists', 'molest\\w*', 'pedophil\\w*', 'paedophil\\w*', 'paedo', 'pedo', 'incest', 'child abuse', 'abuse[sd]? (?:a )?child', 'sexually abus\\w*', 'kidnap\\w*', 'abortion', 'abortions', 'miscarriage', 'stillborn', 'dead babies', 'dead baby', 'baby killer', 'school shoot\\w*', 'mass shoot\\w*', 'shootings?', 'shooters?', 'gunmen', 'gunman', 'massacres?', 'sandy hook', 'columbine', '9/11', 'twin towers', 'september 11', 'boston marathon', 'holocaust', 'cancer patients?', 'dying children', 'terminally ill child']),
  // CORE RULE: never racist, never sexist. Over-blocks on purpose - a joke about a race,
  // a nationality, a religion, or about women / wives / girlfriends / husbands is dropped
  // however it is worded, because a small safe pool beats one bad joke.
  word(['mexico', 'trump', 'obama', 'biden', 'clinton', 'brexit', 'democrats?', 'republicans?', 'nudists?', 'nudity', 'strip clubs?', 'brothels?', 'swingers?', 'orgy', 'irish(?:man|men)?', 'scots(?:man|men)?', 'scottish', 'scotch(?:man)?', 'welsh(?:man|men)?', 'french(?:man|men)?', 'germans?', 'italians?', 'russians?', 'americans?', 'canadians?', 'pakistan\\w*', 'koreans?', 'vietnamese', 'oriental', 'eskimos?', 'aboriginals?', 'natives?', 'hispanics?', 'latinos?', 'latinas?', 'ethnic\\w*', 'minorit\\w+', 'colou?red', 'racial\\w*', 'african[- ]americans?', 'native americans?', 'catholics?', 'protestants?', 'christians?', 'hindus?', 'buddhists?', 'atheists?', 'mormons?', 'amish', 'rabbis?', 'priests?', 'nuns?', 'pastors?', 'imams?', 'mosque', 'synagogue', 'yo mama', 'yo momma', 'your mama', 'your mom', 'your mum', 'your mother', 'ur mom', 'ur mum']),
  /\b(?:black|white|yellow|brown) (?:guy|guys|man|men|woman|women|people|person|kid|kids|dude|friend|family|girl|boy|lady)\b/i,
  word(['women', 'woman', 'womans', 'womens', 'girls?', 'girlfriends?', 'boyfriends?', 'wife', 'wives', 'wifes?', 'husbands?', 'ladies', 'lady', 'females?', 'feminis\\w+', 'misogyn\\w+', 'sexis\\w+', 'chauvinis\\w+', 'mother[- ]in[- ]laws?', 'mistress', 'housewives?', 'housewife', 'gold[- ]?diggers?', 'pms', 'menstru\\w+', 'periods', 'nagging', 'nags?', 'bimbos?', 'slags?', 'sandwich(?:es)?', 'kitchen', 'bride', 'brides', 'divorcee', 'stepmother', 'stepmom', 'mommy', 'mama', 'bitch\\w*', 'chicks?', 'babes?', 'dames?', 'broads?', 'skirts?', 'cheat(?:s|ed|ing)? on']),
  // harm to children, in either order
  /\b(?:children|kids?|babies|baby|toddlers?|infants?|newborns?)\b.{0,60}\b(?:cancer|dies|died|dead|dying|kill\w*|murder\w*|shot|burn\w*|drown\w*|starv\w*|beat\w*|hit)\b|\b(?:cancer|dies|died|dead|dying|kill\w*|murder\w*|shot|burn\w*|drown\w*|starv\w*|beat\w*)\b.{0,60}\b(?:children|kids|babies|toddlers?|infants?|newborns?)\b/i,
  /[Ѐ-ӿ一-鿿぀-ヿ؀-ۿ]/, // not English
];
// Kept, but only told towards the dark end of the slider.
const RUDE = word(['shit\\w*', 'damn\\w*', 'hell', 'ass', 'asses', 'arse', 'arses', 'crap\\w*', 'bastards?', 'bloody', 'piss\\w*', 'bugger\\w*', 'prick', 'douche\\w*', 'idiots?', 'stupid', 'drunk', 'drugs?', 'stoned', 'weed', 'cocaine', 'heroin']);
// What makes a joke "dark" (each distinct marker adds one, up to three).
const DARK_MARKERS = [
  word(['dead', 'death', 'die', 'dies', 'died', 'dying', 'deadly', 'lethal', 'fatal']),
  word(['kill\\w*', 'murder\\w*', 'stab\\w*', 'shot', 'shoot\\w*', 'gun', 'guns', 'bullet', 'poison\\w*', 'strangle\\w*', 'hang\\w*', 'execut\\w*', 'electric chair', 'noose']),
  word(['funeral', 'coffin', 'grave', 'graves', 'gravestone', 'cemetery', 'graveyard', 'corpse', 'corpses', 'undertaker', 'morgue', 'autopsy', 'obituary', 'skeleton', 'cremat\\w*', 'widow', 'orphan', 'orphans']),
  word(['cancer', 'terminal', 'disease', 'dementia', 'alzheimer\\w*', 'hospital', 'coma', 'amputat\\w*', 'paralys\\w*', 'blind', 'deaf']),
  word(['hell', 'devil', 'satan', 'demon', 'demons', 'zombie', 'zombies', 'vampire', 'vampires', 'reaper', 'haunted']),
  word(['prison', 'jail', 'convict', 'divorce', 'divorced', 'bankrupt', 'homeless', 'war', 'bomb', 'bombs', 'sinking', 'plane crash', 'crash(?:ed)?']),
];
// Reddit furniture that means it isn't a self-contained joke.
const JUNK = /(?:https?:|www\.|\.com\b|\/r\/|reddit|subreddit|upvote|downvote|karma|\bmods?\b|\brepost|\bOP\b|\bTIL\b|\[|\]|\*\*|#|\bx-?post|\bedit\b|\bupdate:|\bpunchline|\btitle\b|\bthe joke is\b|\bthis joke\b|\bmy joke\b|\bmy dad told me\b|\bsource:|\bcredit\b|\btwitter\b|\bfacebook\b|\byoutube\b|\bimgur\b|\bpost\b)/i;

function cleanText(raw) {
  let t = String(raw)
    .replace(/\^\^?/g, '')
    .replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&#x200B;/gi, '').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
  t = t.replace(/\s+(?:EDIT|Edit|edit)\b.*$/, '').replace(/\s+(?:UPDATE|Update)\b:.*$/, '').trim();
  return t;
}

// Returns {text, dark, rude} for a joke worth keeping, or null.
export function classify(raw) {
  const text = cleanText(raw);
  if (text.length < 35 || text.length > 380) return null;
  if (JUNK.test(text)) return null;
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length < 25) return null;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  if (upper / letters.length > 0.35) return null; // SHOUTING
  if ((text.match(/[^\x20-\x7e]/g) || []).length > 3) return null;
  if (BLOCK.some((re) => re.test(text))) return null;
  const dark = Math.min(3, DARK_MARKERS.filter((re) => re.test(text)).length);
  return { text, dark, rude: RUDE.test(text) ? 1 : 0 };
}

// ---- import ------------------------------------------------------------------------
async function ensureFile(name) {
  const file = path.join(DATA_DIR, `${name}.tsv.gz`);
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return file;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`[Jokes] Downloading ${name}.tsv.gz ...`);
  const res = await fetch(`${RAW_URL}/${name}.tsv.gz`);
  if (!res.ok) throw new Error(`Could not download ${name}.tsv.gz (${res.status})`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

// Reads the three data files (downloading any that are missing) and fills the jokes table.
export async function importJokes({ minScore = 2 } = {}) {
  const insert = db.prepare('INSERT OR IGNORE INTO jokes (text, score, dark, rude, len) VALUES (?, ?, ?, ?, ?)');
  const stats = { read: 0, kept: 0 };
  for (const name of SOURCES) {
    const file = await ensureFile(name);
    const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
    let batch = [];
    const flush = db.transaction((rows) => { for (const r of rows) stats.kept += insert.run(...r).changes; });
    for await (const line of rl) {
      const tab = line.indexOf('\t');
      if (tab < 0) continue;
      const score = Math.round(Number(line.slice(0, tab)));
      stats.read++;
      if (!Number.isFinite(score) || score < minScore) continue;
      const c = classify(line.slice(tab + 1));
      if (!c) continue;
      batch.push([c.text, score, c.dark, c.rude, c.text.length]);
      if (batch.length >= 2000) { flush(batch); batch = []; }
    }
    flush(batch);
    console.log(`[Jokes] ${name}: ${stats.read} read so far, ${stats.kept} kept`);
  }
  return stats;
}

// ---- telling ---------------------------------------------------------------------------
export function getJokeStats() {
  const row = db.prepare('SELECT COUNT(*) AS n, SUM(dark = 0 AND rude = 0) AS cheerful, SUM(dark BETWEEN 1 AND 2) AS mid, SUM(dark >= 2 OR rude = 1) AS dark FROM jokes').get();
  return { total: row.n || 0, cheerful: row.cheerful || 0, dryish: row.mid || 0, dark: row.dark || 0, told: db.prepare('SELECT COUNT(*) AS n FROM joke_history').get().n };
}

export function toneFor(humor) {
  const h = Math.max(0, Math.min(100, Number(humor)));
  return h <= 33 ? 'cheerful' : h <= 66 ? 'dry' : 'dark';
}

// Picks a joke to suit the Humor slider (0-100: Cheerful - Dry - Dark).
//   darkness wanted D = humor/100 * 3, jokes are weighted by how close their own
//   darkness is to D and by how well they scored on Reddit;
//   crude language is only allowed from the middle-high part of the slider up;
//   the dry middle prefers short, straight-faced one-liners.
export function pickJoke({ humor = 50, topic = '' } = {}) {
  const h = Math.max(0, Math.min(100, Number(humor) || 0));
  // Eases in: dry (50) wants a hint of darkness, only the top of the slider wants the real thing.
  const wanted = 3 * (h / 100) ** 1.5;
  const allowRude = h >= 60;
  const params = [Math.max(0, Math.floor(wanted - 1.2)), Math.min(3, Math.ceil(wanted + 1.2))];
  const like = String(topic || '').trim().slice(0, 40);

  const fetchPool = (minScore, useHistory, useTopic) => db.prepare(`
    SELECT id, text, score, dark, len FROM jokes
    WHERE dark BETWEEN ? AND ? AND (rude = 0 OR ?) AND score >= ?
      ${useHistory ? 'AND id NOT IN (SELECT joke_id FROM joke_history)' : ''}
      ${useTopic && like ? "AND text LIKE ? ESCAPE '\\'" : ''}
    ORDER BY RANDOM() LIMIT 400`)
    .all(...[...params, allowRude ? 1 : 0, minScore, ...(useTopic && like ? [`%${like.replace(/[\\%_]/g, '\\$&')}%`] : [])]);

  let pool = [];
  let onTopic = Boolean(like);
  for (const useTopic of like ? [true, false] : [false]) {
    for (const minScore of [3, 2]) {
      pool = fetchPool(minScore, true, useTopic);
      if (pool.length >= 5) break;
    }
    if (pool.length === 0) pool = fetchPool(2, false, useTopic); // everything has been told: allow repeats
    if (pool.length > 0) { onTopic = useTopic && Boolean(like); break; }
  }
  if (pool.length === 0) return null;

  const weight = (j) => {
    const closeness = Math.exp(-((j.dark - wanted) ** 2) / 0.7);
    const shortBonus = h > 33 && h <= 66 ? (j.len <= 170 ? 2.5 : 0.6) : 1;
    return closeness * (j.score + 1) ** 1.5 * shortBonus;
  };
  const total = pool.reduce((n, j) => n + weight(j), 0);
  let r = Math.random() * total;
  let chosen = pool[pool.length - 1];
  for (const j of pool) { r -= weight(j); if (r <= 0) { chosen = j; break; } }

  db.prepare('INSERT INTO joke_history (joke_id, told_at, humor) VALUES (?, ?, ?)').run(chosen.id, Date.now(), Math.round(h));
  return { joke: chosen.text, tone: toneFor(h), score: chosen.score, darkness: chosen.dark, onTopic };
}
