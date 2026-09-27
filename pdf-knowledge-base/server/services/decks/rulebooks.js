import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import db, { getSetting } from '../../db/database.js';
import { getAuthenticatedClient, getSyncProgress } from '../driveService.js';
import { startSyncAndIndex, getIndexProgress } from '../../routes/drive.js';

// Each game's official rules (Fantasy Flight Games' published PDFs, listed in data/decks/<game>_rulebooks.json)
// added to the PDF library: downloaded, uploaded to the Drive folder BOOKS / RPG / Rulebooks / <game>, then
// synced and indexed like any other book. Rule checks then search the core rules plus the campaign's own
// rulebooks - or, from a game's Campaigns page, every one of its rulebooks.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', '..', 'data', 'decks');
const FOLDER_PATH = ['RPG', 'Rulebooks'];      // under the library's root folder in Drive

// The rulebook sets, one per game.
const SETS = {
  lotr: {
    manifest: 'lotr_rulebooks.json', dir: 'lotr_rulebooks', folder: 'LOTR LCG', prefix: 'LOTR LCG - ',
    game: 'The Lord of the Rings: The Card Game',
    core: ['Learn to Play', 'Online Rules Reference', 'Card Game FAQ', 'Easy Mode'],
  },
  ahlcg: {
    manifest: 'ahlcg_rulebooks.json', dir: 'ahlcg_rulebooks', folder: 'Arkham Horror LCG', prefix: 'AH LCG - ',
    game: 'Arkham Horror: The Card Game',
    core: ['Learn to Play', 'Rules Reference', 'Rulebook (2026)', 'Campaign Guide (2026)'],
  },
};
const set = (game) => SETS[game] || SETS.lotr;
export const fileNameFor = (title, game = 'lotr') => `${set(game).prefix}${title.replace(/[\\/:*?"<>|]+/g, ' -').replace(/\s+/g, ' ').trim()}.pdf`;
export const manifest = (game = 'lotr') => JSON.parse(fs.readFileSync(path.join(DATA, set(game).manifest), 'utf8'));

const idle = () => ({ state: 'idle', phase: null, done: 0, total: 0, current: null, errors: [], startedAt: null, finishedAt: null });
const jobs = {}; // game -> import job

async function driveFolder(drive, game) {
  let parent = getSetting('drive_root_folder_id');
  const find = async (name, under) => (await drive.files.list({ q: `'${under}' in parents and name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: 'files(id)' })).data.files[0]?.id;
  for (const name of FOLDER_PATH) {
    const id = await find(name, parent);
    if (!id) throw new Error(`Couldn't find the Drive folder "${FOLDER_PATH.join(' / ')}" in the library.`);
    parent = id;
  }
  const folder = set(game).folder;
  return (await find(folder, parent))
    || (await drive.files.create({ requestBody: { name: folder, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }, fields: 'id' })).data.id;
}

export function startRulebookImport(game = 'lotr') {
  if (jobs[game]?.state === 'running') return jobs[game];
  const S = set(game), DL_DIR = path.join(DATA, S.dir);
  const job = jobs[game] = { ...idle(), state: 'running', phase: 'Downloading from Fantasy Flight Games', startedAt: Date.now() };
  (async () => {
    try {
      const list = manifest(game);
      const auth = getAuthenticatedClient();
      if (!auth) throw new Error('IMS isn\'t connected to Google Drive - reconnect it first.');
      const drive = google.drive({ version: 'v3', auth });

      // 1. download
      fs.mkdirSync(DL_DIR, { recursive: true });
      job.total = list.length; job.done = 0;
      for (const m of list) {
        const file = path.join(DL_DIR, fileNameFor(m.title, game));
        job.current = m.title;
        if (!fs.existsSync(file) || fs.statSync(file).size < 1000) {
          try {
            const res = await fetch(m.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' }, signal: AbortSignal.timeout(180000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.slice(0, 4).toString() !== '%PDF') throw new Error('not a PDF');
            fs.writeFileSync(file, buf);
          } catch (err) { job.errors.push(`${m.title}: download failed (${err.message})`); }
        }
        job.done++;
      }

      // 2. upload to Drive (anything already there is left alone)
      job.phase = `Uploading to Google Drive (Rulebooks / ${S.folder})`; job.done = 0;
      const folderId = await driveFolder(drive, game);
      const existing = new Set();
      let pageToken;
      do {
        const r = await drive.files.list({ q: `'${folderId}' in parents and trashed=false`, fields: 'nextPageToken, files(name)', pageSize: 200, pageToken });
        r.data.files.forEach((f) => existing.add(f.name)); pageToken = r.data.nextPageToken;
      } while (pageToken);
      for (const m of list) {
        const name = fileNameFor(m.title, game), file = path.join(DL_DIR, name);
        job.current = m.title;
        if (!existing.has(name) && fs.existsSync(file)) {
          try {
            await drive.files.create({ requestBody: { name, parents: [folderId], mimeType: 'application/pdf' }, media: { mimeType: 'application/pdf', body: fs.createReadStream(file) }, fields: 'id' });
          } catch (err) { job.errors.push(`${m.title}: upload failed (${err.message})`); }
        }
        job.done++;
      }

      // 3. sync and index through the library's own process
      job.phase = 'Syncing and indexing in the library'; job.current = null;
      if (!startSyncAndIndex()) job.errors.push('A library sync was already running - the new rulebooks will be indexed when it gets to them.');
      await new Promise((r) => setTimeout(r, 3000));
      while (getSyncProgress().active || getIndexProgress().active) await new Promise((r) => setTimeout(r, 3000));
      Object.assign(job, { state: 'done', phase: 'Done', current: null, finishedAt: Date.now() });
    } catch (err) {
      console.error(`[Rulebooks] ${S.folder} import failed:`, err.message);
      Object.assign(job, { state: 'error', phase: `Failed: ${err.message}`, finishedAt: Date.now() });
    }
  })();
  return job;
}

// A game's books in the library, with whether each is indexed yet (all games' books when game is null).
export function libraryDocs(game = 'lotr') {
  const prefixes = game ? [set(game).prefix] : Object.values(SETS).map((s) => s.prefix);
  return db.prepare(`SELECT id, drive_file_id, filename, indexed, page_count, index_error FROM documents WHERE ${prefixes.map(() => 'filename LIKE ?').join(' OR ')} ORDER BY filename`)
    .all(...prefixes.map((p) => `${p}%`));
}

export function rulebookStatus(game = 'lotr') {
  const docs = libraryDocs(game);
  const sync = getSyncProgress(), index = getIndexProgress();
  return {
    job: { ...(jobs[game] || idle()) },
    library: { active: Boolean(sync.active || index.active), sync, index },
    expected: manifest(game).length,
    inLibrary: docs.length,
    indexed: docs.filter((d) => d.indexed === 1).length,
    failed: docs.filter((d) => d.indexed === -1).map((d) => ({ filename: d.filename, error: d.index_error })),
  };
}

// ---- which books a campaign's rule checks read ------------------------------------------------------------
const KIND_BOOKS = {
  'The Lord of the Rings saga': ['The Black Riders', 'The Road Darkens', 'The Treason of Saruman', 'The Land of Shadow', 'The Flame of the West', 'The Mountain of Fire', 'Fellowship of the Ring Saga', 'Two Towers Saga', 'Return of the King Saga', 'Campaign Log'],
  'The Hobbit saga': ['Over Hill and Under Hill', 'On the Doorstep', 'Campaign Log'],
  'Revised Core Set campaign': ['Campaign Cards - Revised Core Set', 'Campaign Log'],
  'The Dark of Mirkwood campaign': ['The Dark of Mirkwood'],
  'Angmar Awakened campaign': ['Angmar Awakened', 'The Lost Realm', 'Wastes of Eriador', 'Mount Gram', 'Ettenmoors', 'Rhudaur', 'Carn D', 'Dread Realm'],
  'Dream-chaser campaign': ['Dream-chaser', 'Grey Havens', 'Stormcaller', 'Thing in the Depths', 'Temple of the Deceived', 'Drowned Ruins', 'Cobas Haven', 'City of Corsairs'],
  'Ered Mithrin campaign': ['Ered Mithrin', 'Wilds of Rhovanion', 'Withered Heath', 'Roam Across Rhovanion', 'Fire in the Night', 'Ghost of Framsburg'],
  'Haradrim campaign': ['Sands of Harad', 'makil', 'Race Across Harad', 'Beneath the Sands', 'Black Serpent', 'Cirith Gurat', 'Crossings of Poros'],
  'Dwarrowdelf campaign': ['Khazad-dum', 'Redhorn Gate', 'Road to Rivendell', 'Watcher in the Water', 'Long Dark', 'Foundations of Stone', 'Shadow and Flame'],
  'Against the Shadow campaign': ['Heirs of Numenor', "Steward's Fear", 'Druadan Forest', 'Amon Din', 'Assault on Osgiliath', 'Blood of Gondor', 'Morgul Vale'],
  'The Ring-maker campaign': ['Voice of Isengard', 'Dunland Trap', 'Three Trials', 'Tharbad', 'Nin in Eilph', 'Celebrimbor', 'Antlered Crown'],
};
const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// The books for a rule check: core rules, the campaign's rules, and the rulesheet for the scenario's pack.
// For Arkham, a campaign's books are the ones named after it ("The Dunwich Legacy Campaign Rules",
// its Investigator Rules and its Return to...).
export function booksFor(kind, scenarioPack = null, game = 'lotr') {
  const docs = libraryDocs(game).filter((d) => d.indexed === 1);
  const own = game === 'ahlcg' ? [String(kind || '').replace(/\s*campaign$/i, '').replace(/^the\s+/i, '')].filter(Boolean) : (KIND_BOOKS[kind] || []);
  const keys = [...set(game).core, ...own, ...(scenarioPack ? [scenarioPack.replace(/^The Hobbit: /, '')] : [])].map(plain);
  return docs.filter((d) => keys.some((k) => plain(d.filename).includes(k)));
}

// ---- rule check -------------------------------------------------------------------------------------------
// A rules question: for a campaign, the core rules, the campaign's own rules and the scenario's rulesheet
// are searched; from the Campaigns page (all: true), every rulebook of the game. Gemini answers from those
// passages only, citing book and page with the words of the rule itself.
export async function ruleCheck({ kind = null, scenarioPack = null, scenarioName = null, question, all = false, game = 'lotr' }) {
  const S = set(game);
  const q = String(question || '').trim();
  if (!q) throw new Error('Type a rules question first.');
  const books = all ? libraryDocs(game).filter((d) => d.indexed === 1) : booksFor(kind, scenarioPack, game);
  if (!books.length) throw new Error(`The ${S.folder} rulebooks aren't indexed yet - use "Download and index the rulebooks" on the Campaigns page first.`);
  const { generateQueryEmbedding } = await import('../embeddingService.js');
  const { searchSimilar } = await import('../vectorStore.js');
  const emb = await generateQueryEmbedding(`${scenarioName ? `${scenarioName}: ` : ''}${q}`);
  const hits = await searchSimilar(emb, [], all ? 18 : 14, true, books.map((b) => b.drive_file_id));
  if (!hits.length) throw new Error('Nothing in the rulebooks matched that question.');
  const title = (f) => String(f || '').replace(S.prefix, '').replace(/\.pdf$/i, '');
  const passages = hits.map((h, i) => `[${i + 1}] ${title(h.filename)}, page ${h.pageNum ?? '?'}:\n${String(h.text || '').slice(0, 1400)}`).join('\n\n');
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const config = (await import('../../config.js')).default;
  const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1, responseSchema: { type: 'OBJECT', properties: { answer: { type: 'STRING' }, confident: { type: 'BOOLEAN' }, sources: { type: 'ARRAY', items: { type: 'OBJECT', properties: { passage: { type: 'INTEGER' }, quote: { type: 'STRING' } }, required: ['passage', 'quote'] } } }, required: ['answer', 'confident', 'sources'] } },
  });
  const prompt = `You are a precise rules judge for ${S.game}. Answer the question using ONLY the rulebook passages below - quote or paraphrase the exact rule, and say plainly if the passages don't settle it. Where a scenario's or campaign's own rules differ from the core rules, those rules win for that scenario.
${all ? 'Any product may be relevant - say which book a rule comes from when it only applies to one scenario or campaign.' : `Campaign: ${kind || 'none'}`}${scenarioName ? `. Scenario being played: ${scenarioName}` : ''}.

PASSAGES:
${passages}

QUESTION: ${q}

Return: answer (clear and direct, a few sentences, with the rule), confident (false if the passages don't really cover it), sources (each passage you relied on: its number, and quote - the exact words from that passage that state the rule, copied verbatim, under 45 words).`;
  const out = JSON.parse((await model.generateContent(prompt)).response.text());
  const seen = new Set();
  return {
    answer: out.answer, confident: out.confident !== false,
    sources: (out.sources || []).map((s) => ({ h: hits[Number(s.passage) - 1], quote: String(s.quote || '').trim() })).filter((s) => s.h)
      .map(({ h, quote }) => ({ book: title(h.filename), page: h.pageNum ?? null, driveFileId: h.driveFileId, quote }))
      .filter((s) => { const k = `${s.book}|${s.page}`; if (seen.has(k)) return false; seen.add(k); return true; }),
    searched: books.map((b) => title(b.filename)),
  };
}

// Rule checks asked from a game's Campaigns page (across every rulebook), shared by everyone - newest first.
const checksTable = (game) => `${SETS[game] ? game : 'lotr'}_rule_checks`;
for (const g of Object.keys(SETS)) db.exec(`CREATE TABLE IF NOT EXISTS ${checksTable(g)} (id INTEGER PRIMARY KEY AUTOINCREMENT, by TEXT, at INTEGER NOT NULL, data TEXT NOT NULL)`);
export function saveGeneralRuleCheck(entry, by, game = 'lotr') {
  const t = checksTable(game);
  db.prepare(`INSERT INTO ${t} (by, at, data) VALUES (?, ?, ?)`).run(by, Date.now(), JSON.stringify(entry));
  db.prepare(`DELETE FROM ${t} WHERE id NOT IN (SELECT id FROM ${t} ORDER BY at DESC LIMIT 40)`).run();
}
export function listGeneralRuleChecks(game = 'lotr') {
  return db.prepare(`SELECT id, by, at, data FROM ${checksTable(game)} ORDER BY at DESC LIMIT 40`).all()
    .map((r) => { try { return { id: r.id, by: r.by, at: r.at, ...JSON.parse(r.data) }; } catch { return null; } }).filter(Boolean);
}
// A cited rulebook's PDF (the page opens at #page=N) - only the games' rulebooks, so guests can open them too.
export async function rulebookPdf(driveFileId) {
  const doc = libraryDocs(null).find((d) => d.drive_file_id === driveFileId);
  if (!doc) { const e = new Error('Not a rulebook.'); e.status = 404; throw e; }
  const { getCachedPdfPath } = await import('../driveService.js');
  const f = getCachedPdfPath(driveFileId);
  if (!f) { const e = new Error('That rulebook isn\'t downloaded.'); e.status = 404; throw e; }
  return { file: f, filename: doc.filename };
}
