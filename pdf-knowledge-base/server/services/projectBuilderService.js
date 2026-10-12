// New Project builder (/ims/code-repo/new-project): from a short brief to a ready project folder.
//
//   1. suggestSetup  - the brief picks what it's built with, how it looks and the house rules (Simon can change them)
//   2. findCode      - his own best code that fits, grouped by the job it would do, with what to change in each
//   3. planProject   - a plain summary, the folder layout and the build order, plus the prompt for Antigravity
//   4. createProject - the folder itself: README, prompt, house rules, his code, GitHub setup, first commit,
//                      and (only when asked) a private GitHub repo it's pushed to
//
// The options live in projectBuilderPresets.json - re-read on every call, so adding a stack or a rule needs no
// code change. AI: one short call per step (Code best practices model), ~5p a project; creating the folder
// uses none unless Simon asks for the code changes to be applied for him.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import { GoogleGenerativeAI } from './geminiClient.js';
import config from '../config.js';
import db from '../db/database.js';
import { getModelFor } from './modelRegistry.js';
import { generateQueryEmbedding } from './embeddingService.js';
import { syncCodeVectors, searchCodeSnippets, codeIndexIsCurrent, isThirdPartyPath, getRawGitHubToken } from './codeRepoService.js';
import { presets, stackOf, lookOf } from './codeStacks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const sh = promisify(exec);
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
const DATA_DIR = path.join(__dirname, '..', 'data');
const TIDY_MARK = path.join(DATA_DIR, '.code_library_tidied_v1');
const IMS_ROOT = path.resolve(__dirname, '..', '..', '..');

const fail = (status, message) => Object.assign(new Error(message), { status });
const clean = (t, max = 4000) => String(t ?? '').trim().slice(0, max);
const slugify = (t) => clean(t, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'new-project';
const pascal = (t) => slugify(t).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');

async function askJson(prompt, temperature = 0.3) {
  const model = genAI.getGenerativeModel({ model: getModelFor('codeRepo'), generationConfig: { temperature, responseMimeType: 'application/json' } });
  const r = await model.generateContent(prompt);
  return JSON.parse(r.response.text().trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
}

// ---------------------------------------------------------------- the library of Simon's code

function librarySnippets() {
  return db.prepare(`
    SELECT s.*, r.name AS repo_name, r.url AS repo_url, r.account AS repo_account, COALESCE(r.is_fork, 0) AS repo_is_fork
    FROM code_snippets s LEFT JOIN code_repositories r ON r.id = s.repo_id
  `).all();
}

// One-off library clean-up (and on demand): pieces of code that aren't Simon's (downloaded frameworks,
// examples) and exact duplicates are removed - saved to data/backups first - forks are flagged, and the
// search index is rebuilt with real vectors.
export async function tidyLibrary() {
  const rows = db.prepare('SELECT * FROM code_snippets ORDER BY updated_at DESC, created_at DESC').all();
  const kept = new Map();
  const removed = [];
  for (const r of rows) {
    if (isThirdPartyPath(r.file_path)) { removed.push({ ...r, removedBecause: 'not Simon\'s code' }); continue; }
    const key = `${r.repo_id}|${r.file_path}|${String(r.code_content || '').replace(/\s+/g, ' ').trim()}`;
    const keeper = kept.get(key);
    if (!keeper) { kept.set(key, r); continue; }
    if (clean(r.user_observations) && !clean(keeper.user_observations)) {
      db.prepare('UPDATE code_snippets SET user_observations = ? WHERE id = ?').run(r.user_observations, keeper.id);
      keeper.user_observations = r.user_observations;
    }
    removed.push({ ...r, removedBecause: 'duplicate' });
  }
  if (removed.length) {
    const dir = path.join(DATA_DIR, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `code_snippets_removed_${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(removed, null, 2));
    const del = db.prepare('DELETE FROM code_snippets WHERE id = ?');
    db.transaction(() => { for (const r of removed) del.run(r.id); })();
  }
  const forks = await refreshForkFlags();
  const indexed = removed.length || !codeIndexIsCurrent() ? (await syncCodeVectors()).indexed : null;
  fs.writeFileSync(TIDY_MARK, new Date().toISOString());
  const report = {
    removedDuplicates: removed.filter((r) => r.removedBecause === 'duplicate').length,
    removedNotYours: removed.filter((r) => r.removedBecause !== 'duplicate').length,
    kept: rows.length - removed.length,
    forks,
    reindexed: indexed,
  };
  console.log('[ProjectBuilder] Code library tidied:', report);
  return report;
}

// GitHub says which repos are forks (someone else's code) - asked once per tidy
async function refreshForkFlags() {
  const repos = db.prepare('SELECT id, url, account FROM code_repositories').all();
  let forks = 0;
  for (const r of repos) {
    const m = String(r.url || '').match(/github\.com\/([^/]+)\/([^/#?]+)/i);
    const token = getRawGitHubToken(r.account || 'personal');
    if (!m || !token) continue;
    try {
      const res = await fetch(`https://api.github.com/repos/${m[1]}/${m[2].replace(/\.git$/, '')}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'IMS-Project-Builder' } });
      if (!res.ok) continue;
      const fork = (await res.json()).fork ? 1 : 0;
      forks += fork;
      db.prepare('UPDATE code_repositories SET is_fork = ? WHERE id = ?').run(fork, r.id);
    } catch (_) { /* offline: keep what we had */ }
  }
  return forks;
}

let readying = null;
function ensureReady() {
  if (!readying) {
    readying = (async () => {
      if (!fs.existsSync(TIDY_MARK)) await tidyLibrary();
      else if (!codeIndexIsCurrent()) await syncCodeVectors();
    })().finally(() => { readying = null; });
  }
  return readying;
}

// ---------------------------------------------------------------- step 0: the options

export async function getOptions() {
  try { await ensureReady(); } catch (err) { console.warn('[ProjectBuilder] Library not ready:', err.message); }
  const p = presets();
  const snippets = librarySnippets();
  const stackCount = {}, lookCount = {};
  for (const s of snippets) {
    const st = stackOf(s, p.stacks); if (st) stackCount[st] = (stackCount[st] || 0) + 1;
    const lk = lookOf(s, p.looks); if (lk) lookCount[lk] = (lookCount[lk] || 0) + 1;
  }
  return {
    projectsRoot: p.projectsRoot,
    stacks: p.stacks.map(({ match, ...s }) => ({ ...s, examples: stackCount[s.id] || 0 })),
    looks: p.looks.map(({ match, ...l }) => ({ ...l, examples: lookCount[l.id] || 0 })),
    rules: p.rules.map(({ prompt, ...r }) => r),
    library: { snippets: snippets.length, repos: new Set(snippets.map((s) => s.repo_id)).size },
  };
}

// ---------------------------------------------------------------- step 1: brief -> setup

export async function suggestSetup({ name, brief }) {
  if (!clean(brief)) throw fail(400, 'Write a short brief first.');
  const p = presets();
  const { stacks, looks } = await getOptions();
  const list = (items) => items.map((i) => `- ${i.id}: ${i.name} - ${i.plain}${i.examples ? ` (Simon has ${i.examples} examples of his own)` : ''}`).join('\n');
  let ai = null;
  try {
    ai = await askJson(`You help Simon set up a new software project from his brief. Pick the best fit from each list.

PROJECT NAME: ${clean(name, 120) || '(not given)'}
BRIEF:
${clean(brief)}

WHAT IT'S BUILT WITH (pick one):
${list(stacks)}

HOW IT LOOKS (pick one; "none" only if there is no user interface at all):
${list(looks)}

HOUSE RULES (pick every one that fits; those marked default suit almost any project):
${p.rules.map((r) => `- ${r.id}: ${r.name} - ${r.plain}${r.default ? ' (default)' : ''}`).join('\n')}

Choose on what the brief needs. Having examples of his own is a tie-breaker only - never pick a stack just because he has used it.
Each "why" is one short plain sentence in British English aimed at Simon, about his project - no jargon, no marketing words.

Reply with JSON only:
{"stack":{"id":"...","why":"..."},"look":{"id":"...","why":"..."},"rules":[{"id":"...","why":"..."}]}`, 0.2);
  } catch (err) { console.warn('[ProjectBuilder] Suggest failed:', err.message); }
  const ok = (items, id) => items.some((i) => i.id === id);
  const stack = ok(stacks, ai?.stack?.id) ? ai.stack : { id: 'react-vite', why: 'A good general choice for a web app - change it if the project is something else.' };
  const look = ok(looks, ai?.look?.id) ? ai.look : { id: stack.id === 'spfx' ? 'fluent' : stack.id === 'esp32' || stack.id === 'node-api' ? 'none' : 'tailwind', why: '' };
  const rules = Array.isArray(ai?.rules) ? ai.rules.filter((r) => ok(p.rules, r.id)) : p.rules.filter((r) => r.default).map((r) => ({ id: r.id, why: '' }));
  for (const r of p.rules) if (r.locked && !rules.some((x) => x.id === r.id)) rules.push({ id: r.id, why: '' }); // British English, always
  return { stack, look, rules, aiUsed: Boolean(ai) };
}

// ---------------------------------------------------------------- step 2: find my code

export async function findCode({ name, brief, stack, look, rules = [] }) {
  if (!clean(brief)) throw fail(400, 'Write a short brief first.');
  await ensureReady();
  const p = presets();
  const st = p.stacks.find((s) => s.id === stack);
  if (!st) throw fail(400, 'Choose what it\'s built with first.');
  const lk = p.looks.find((l) => l.id === look);
  const ruleNames = p.rules.filter((r) => rules.includes(r.id)).map((r) => r.name);
  const library = librarySnippets();
  if (!library.length) return { groups: [], searched: 0 };
  const byId = new Map(library.map((s) => [s.id, s]));

  const queryVec = await generateQueryEmbedding(`${clean(brief)}\nBuilt with: ${st.name}\nLooks: ${lk?.name || ''}\nNeeds: ${ruleNames.join(', ')}`);
  const hits = await searchCodeSnippets(queryVec, 30);
  const scored = hits
    .map((h) => ({ row: byId.get(h.snippetId), sim: h.similarity }))
    .filter((h) => h.row)
    .map((h) => ({ ...h, score: h.sim + (stackOf(h.row, p.stacks) === stack ? 0.06 : 0) + (lk && lookOf(h.row, p.looks) === look ? 0.02 : 0) - (h.row.repo_is_fork ? 0.05 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  if (!scored.length) return { groups: [], searched: library.length };
  const best = scored[0].score;
  const strength = (score) => (score >= best - 0.03 ? 'Strong match' : score >= best - 0.08 ? 'Good match' : 'Possible match');

  const describe = (s) => {
    const inputs = safeList(s.inputs_json).slice(0, 8).map((i) => `${i.name} (${i.type}${i.example ? `, e.g. ${String(i.example).slice(0, 60)}` : ''})`).join('; ');
    return `### id: ${s.id}\nTitle: ${s.title}\nFrom: ${s.repo_name} / ${s.file_path}\nWhat it does: ${clean(s.description, 400)}\nInputs: ${inputs || 'none listed'}\nCode:\n${String(s.code_content || '').slice(0, 3000)}`;
  };
  let ai = null;
  try {
    ai = await askJson(`Simon is starting a new project and wants to reuse his own proven code. From the candidates below, keep only the pieces that would genuinely help THIS project (at most 8; skip near-duplicates and anything unrelated), and group them by the job they would do in it.

PROJECT: ${clean(name, 120) || '(no name yet)'}
BRIEF:
${clean(brief)}
BUILT WITH: ${st.name}. LOOKS: ${lk?.name || 'not chosen'}.

For each piece you keep, list what has to change for the new project: the hard-coded values, names and parameters in the code - list or library names, site addresses, field or column names, IDs, labels and text, API addresses, keys and environment variables, pin numbers, component and file names. Give the value in the code now and a suggested value for the new project taken from the brief (empty if Simon has to decide). Real values from the code only - no general advice. His look is the standard: never list styling - colours, fonts, sizes, spacing, borders, shadows, theme values - unless the brief explicitly asks for a different look. Up to 8 per piece; none if nothing needs changing.

Write in plain British English for Simon: short job labels (e.g. "Getting data from SharePoint", "Settings panel", "Tests"), one-sentence reasons, no jargon or marketing words.

CANDIDATES:
${scored.map((h) => describe(h.row)).join('\n\n')}

Reply with JSON only:
{"groups":[{"job":"...","items":[{"id":"...","why":"...","changes":[{"what":"...","current":"...","suggested":"...","where":"name of the variable, prop or function it's in"}]}]}]}`, 0.2);
  } catch (err) { console.warn('[ProjectBuilder] Find code failed:', err.message); }

  const shape = (h, extra = {}) => ({
    id: h.row.id,
    title: h.row.title,
    repo: h.row.repo_name,
    repoUrl: h.row.repo_url,
    isFork: Boolean(h.row.repo_is_fork),
    filePath: h.row.file_path,
    builtWith: p.stacks.find((s) => s.id === stackOf(h.row, p.stacks))?.name || h.row.technology,
    language: h.row.language,
    description: h.row.description,
    code: h.row.code_content,
    strength: strength(h.score),
    why: extra.why || clean(h.row.description, 300),
    changes: (extra.changes || []).filter((c) => c && clean(c.what)).slice(0, 8)
      .map((c) => ({ what: clean(c.what, 120), current: clean(c.current, 300), suggested: clean(c.suggested, 300), where: clean(c.where, 120), include: true })),
  });
  const scoredById = new Map(scored.map((h) => [h.row.id, h]));
  let groups = [];
  if (Array.isArray(ai?.groups)) {
    const used = new Set();
    groups = ai.groups.map((g) => ({
      job: clean(g.job, 80) || 'Other',
      items: (g.items || []).filter((i) => scoredById.has(i.id) && !used.has(i.id) && used.add(i.id)).map((i) => shape(scoredById.get(i.id), i)),
    })).filter((g) => g.items.length);
  }
  if (!groups.length) {
    // no AI: the closest matches, with the inputs the scanner recorded as the things to check
    groups = [{
      job: 'Closest matches',
      items: scored.slice(0, 6).map((h) => shape(h, { changes: safeList(h.row.inputs_json).map((i) => ({ what: i.name, current: i.example ?? '', suggested: '', where: i.kind || '' })) })),
    }];
  }
  return { groups, searched: library.length, aiUsed: Boolean(ai) };
}

function safeList(json) {
  try { const v = typeof json === 'string' ? JSON.parse(json) : json; return Array.isArray(v) ? v : []; } catch (_) { return []; }
}

// ---------------------------------------------------------------- step 3: review + prompt

function resolveStarter(st, name) {
  return String(st.starter || '').replace(/\{slug\}/g, slugify(name)).replace(/\{pascal\}/g, pascal(name));
}

function chosenCode(code = []) {
  const rows = new Map(librarySnippets().map((s) => [s.id, s]));
  const seen = new Set();
  return code.filter((c) => c && c.include !== false && rows.has(c.id) && !seen.has(c.id) && seen.add(c.id)).map((c) => ({ ...c, row: rows.get(c.id) }));
}

// Everything reused: the code picked in step 2, plus pieces of his code the plan found for the gaps
function allCode(body, plan = {}) {
  const fromGaps = (plan.gaps || []).filter((g) => g.covered && g.use !== false)
    .map((g) => ({ id: g.covered.id, job: g.need, why: g.covered.why, changes: g.covered.changes || [], include: true, fillsGap: g.need }));
  return chosenCode([...(body.code || []), ...fromGaps]);
}

// British English is always on (projectBuilderPresets.json: "locked"), whatever was ticked
function rulesFor(body) {
  return presets().rules.filter((r) => r.locked || (body.rules || []).includes(r.id));
}

const BRITISH = 'Write in British English.';

export async function planProject(body) {
  const { name, brief, stack, look, code = [] } = body;
  if (!clean(name)) throw fail(400, 'Give the project a name.');
  const p = presets();
  const st = p.stacks.find((s) => s.id === stack);
  if (!st) throw fail(400, 'Choose what it\'s built with first.');
  const lk = p.looks.find((l) => l.id === look);
  const chosen = chosenCode(code);
  const describe = (row, max = 2500) => `id ${row.id}: ${row.title} - ${row.repo_name}/${row.file_path}\nWhat it does: ${clean(row.description, 400)}\nCode (start):\n${String(row.code_content || '').slice(0, max)}`;

  // 1. What the brief needs that the chosen code doesn't cover
  let needs = [];
  try {
    const r = await askJson(`Simon is building a new project from his own proven code. List the parts of the brief that NONE of the chosen code already does - each a distinct feature or component the project still needs (at most 6; none if the chosen code covers everything). ${BRITISH}

BRIEF:
${clean(brief)}
BUILT WITH: ${st.name}. LOOKS: ${lk?.name || 'not chosen'}.
CHOSEN CODE:
${chosen.map((c) => `- ${c.row.title}: ${clean(c.row.description, 300)}`).join('\n') || '- none'}

For each, give a short plain name and the words to search his code library with.
Reply with JSON only: {"needs":[{"need":"...","searchFor":"..."}]}`, 0.2);
    needs = (r?.needs || []).filter((n) => clean(n.need)).slice(0, 6);
  } catch (err) { console.warn('[ProjectBuilder] Gap check failed:', err.message); }

  // 2. His library, searched for each of them
  const library = librarySnippets();
  const byId = new Map(library.map((s) => [s.id, s]));
  const taken = new Set(chosen.map((c) => c.id));
  for (const n of needs) {
    try {
      const vec = await generateQueryEmbedding(`${clean(n.searchFor || n.need)}\nBuilt with: ${st.name}`);
      n.candidates = (await searchCodeSnippets(vec, 8))
        .map((h) => byId.get(h.snippetId)).filter((row) => row && !taken.has(row.id))
        .sort((a, b) => (stackOf(b, p.stacks) === stack) - (stackOf(a, p.stacks) === stack)).slice(0, 3);
    } catch (_) { n.candidates = []; }
  }

  // 3. The plan: gaps filled from his code where it already does the job, decisions, layout, build order
  let ai = null;
  try {
    ai = await askJson(`Plan the starting layout of a new project for Simon, built from his own proven code. ${BRITISH}

PROJECT: ${clean(name, 120)}
BRIEF:
${clean(brief)}
BUILT WITH: ${st.name} (created with: ${resolveStarter(st, name)})
LOOKS: ${lk?.name || 'not chosen'}
HOUSE RULES: ${rulesFor(body).map((r) => r.name).join('; ')}
HIS CODE ALREADY CHOSEN:
${chosen.map((c) => `- id ${c.id}: ${c.row.title} (${c.job || 'reuse'}) from ${c.row.repo_name}/${c.row.file_path}`).join('\n') || '- none'}

PARTS THE CHOSEN CODE DOESN'T COVER, each with the closest pieces of his library:
${needs.map((n, i) => `## Gap ${i + 1}: ${n.need}\n${(n.candidates || []).map((row) => describe(row)).join('\n\n') || '(nothing in his library)'}`).join('\n\n') || '(none)'}

HIS CODE IS THE STANDARD. For each gap: if one of its candidates already does that job, use it - as it is, with the same set-up, look and behaviour - and list only the names and values that must change for this project (real values from its code). His look is the standard: never list styling - colours, fonts, sizes, spacing, borders, shadows, theme values - unless the brief explicitly asks for a different look. Never redesign, restyle or rebuild something his code already does. Only when no candidate does the job, describe briefly how to build it, reusing the patterns, components and styling of his chosen code so it looks and behaves like the rest of his work.

Decisions: only real choices the brief leaves open. Where his code already settles one, suggest what his code does.

Give:
- gaps: one per gap above.
- decisions: up to 6.
- summary: 3 to 5 plain sentences on what will be built and how the parts fit together.
- folders: 6 to 12 entries showing the real folder layout this stack uses (paths ending in "/"), each with a short plain purpose and the ids of his code that goes there (chosen and gap code).
- placements: for each piece of his code, the file path it should become in the new project.
- buildOrder: 4 to 7 short plain steps, in order.

Reply with JSON only:
{"gaps":[{"need":"...","useId":"candidate id, or empty","why":"...","changes":[{"what":"...","current":"...","suggested":"...","where":"..."}],"approach":"only when useId is empty"}],"decisions":[{"question":"...","suggested":"...","why":"..."}],"summary":"...","folders":[{"path":"src/components/","purpose":"...","reuse":["id"]}],"placements":[{"id":"...","target":"src/..."}],"buildOrder":["..."]}`, 0.3);
  } catch (err) { console.warn('[ProjectBuilder] Plan failed:', err.message); }

  const candidateIds = new Set(needs.flatMap((n) => (n.candidates || []).map((row) => row.id)));
  const gaps = (Array.isArray(ai?.gaps) ? ai.gaps : needs.map((n) => ({ need: n.need }))).filter((g) => clean(g.need)).slice(0, 6).map((g) => {
    const row = candidateIds.has(g.useId) ? byId.get(g.useId) : null;
    return {
      need: clean(g.need, 120),
      use: true,
      covered: row ? {
        id: row.id, title: row.title, repo: row.repo_name, repoUrl: row.repo_url, filePath: row.file_path, language: row.language,
        why: clean(g.why, 300), code: row.code_content,
        changes: (g.changes || []).filter((c) => clean(c.what)).slice(0, 8)
          .map((c) => ({ what: clean(c.what, 120), current: clean(c.current, 300), suggested: clean(c.suggested, 300), where: clean(c.where, 120), include: true })),
      } : null,
      approach: row ? '' : clean(g.approach, 800),
    };
  });
  const decisions = (Array.isArray(ai?.decisions) ? ai.decisions : []).filter((d) => clean(d.question)).slice(0, 6)
    .map((d) => ({ question: clean(d.question, 300), answer: clean(d.suggested, 300), why: clean(d.why, 300) }));
  const ids = new Set([...chosen.map((c) => c.id), ...gaps.filter((g) => g.covered).map((g) => g.covered.id)]);
  const summary = clean(ai?.summary, 1500) || `${clean(name)}: ${clean(brief, 600)}`;
  const folders = (Array.isArray(ai?.folders) ? ai.folders : [{ path: 'src/', purpose: 'The project\'s code' }, { path: 'reuse/', purpose: 'Your code to start from', reuse: [...ids] }])
    .map((f) => ({ path: clean(f.path, 160), purpose: clean(f.purpose, 200), reuse: (f.reuse || []).filter((id) => ids.has(id)) }))
    .filter((f) => f.path);
  const placements = Object.fromEntries((Array.isArray(ai?.placements) ? ai.placements : []).filter((x) => ids.has(x.id) && clean(x.target)).map((x) => [x.id, clean(x.target, 200)]));
  const buildOrder = (Array.isArray(ai?.buildOrder) ? ai.buildOrder : []).map((s) => clean(s, 300)).filter(Boolean);
  return { summary, folders, placements, buildOrder, gaps, decisions, starter: resolveStarter(st, name), aiUsed: Boolean(ai) };
}

// The prompt for the plan as it stands (gaps and decisions as Simon left them) - no AI
export async function promptFor(body) {
  if (!body.plan) throw fail(400, 'Make the plan first.');
  return { prompt: buildPrompt(body, body.plan, { inlineCode: true }), undecided: undecided(body, body.plan) };
}

// What's still marked "you decide": values to change with no new value, and open decisions
function undecided(body, plan) {
  const out = [];
  for (const c of allCode(body, plan)) for (const x of c.changes || []) if (x.include !== false && clean(x.what) && !clean(x.suggested)) out.push(`${c.row.title}: ${x.what}`);
  for (const d of plan.decisions || []) if (!clean(d.answer)) out.push(d.question);
  return out;
}

// The Antigravity prompt. Before the folder exists each file's whole code is written into the prompt (never
// cut short); in the created project the code is in reuse/ and the prompt points there.
function buildPrompt(body, plan, { inlineCode, reusePaths = {}, chosen: given } = {}) {
  const p = presets();
  const st = p.stacks.find((s) => s.id === body.stack);
  const lk = p.looks.find((l) => l.id === body.look);
  const rules = rulesFor(body);
  const chosen = given || allCode(body, plan);
  const lines = [
    `# Build ${clean(body.name, 120)}`,
    '',
    'You are building a new project for Simon in this folder. Read this whole brief first, then work through the build order one step at a time, checking each step works before moving on.',
    '',
    '## The brief',
    clean(body.brief),
    '',
    '## What it is',
    plan.summary,
    '',
    '## Setup',
    `- Built with: ${st?.name} - ${st?.plain}`,
    `- How it looks: ${lk ? `${lk.name} - ${lk.plain}` : 'your choice'}`,
    plan.started
      ? `- The project has already been created in this folder with \`${plan.starter}\` and its packages installed - build on it, don't create it again.`
      : `- Create the project in this folder with: \`${plan.starter}\`. The folder may already hold README.md, PROMPT.md, .github/, .agents/ and reuse/ - keep them.`,
    '',
  ];
  if (rules.length) lines.push('## House rules', ...rules.map((r) => `- ${r.prompt}`), '');
  if (chosen.length) {
    lines.push("## Simon's code is the standard",
      "- Reuse each piece of Simon's code below as it is: keep its structure, set-up, styling, Fluent UI usage, spacing, colours and behaviour. Don't restyle, redesign or rewrite it - only make the listed name and value changes.",
      "- Anything new must follow the same patterns, components and styles as his reused code, so the project looks and behaves like the rest of his work. Don't introduce a different UI library, design or interaction pattern.",
      '');
  }
  if (plan.folders?.length) {
    lines.push('## Folder layout');
    for (const f of plan.folders) {
      const uses = f.reuse.map((id) => chosen.find((c) => c.id === id)?.row.title).filter(Boolean);
      lines.push(`- \`${f.path}\` - ${f.purpose}${uses.length ? ` (uses: ${uses.join(', ')})` : ''}`);
    }
    lines.push('');
  }
  if (chosen.length) {
    lines.push("## Reuse Simon's own code",
      `These are proven pieces from Simon's repositories${inlineCode ? '' : ' - each is in reuse/ in this folder'}.`, '');
    chosen.forEach((c, i) => {
      const changes = (c.changes || []).filter((x) => x.include !== false && clean(x.what));
      lines.push(`### ${i + 1}. ${c.row.title}${c.job ? ` - ${c.job}` : ''}`,
        `- From: ${c.row.repo_name} / \`${c.row.file_path}\`${reusePaths[c.id] ? ` (copy in \`${reusePaths[c.id]}\`)` : ''}`);
      if (c.fillsGap) lines.push(`- Covers: ${c.fillsGap} - use it as it is, with the same set-up and look.`);
      if (plan.placements?.[c.id]) lines.push(`- Put it in: \`${plan.placements[c.id]}\``);
      if (c.why) lines.push(`- Why: ${c.why}`);
      if (changes.length) {
        const anyDone = changes.some((x) => x.applied);
        lines.push('- Change for this project:', '', `| What | Now | Change to |${anyDone ? ' Done? |' : ''}`, `|---|---|---|${anyDone ? '---|' : ''}`,
          ...changes.map((x) => `| ${cell(x.what)}${x.where ? ` (\`${cell(x.where)}\`)` : ''} | ${cell(x.current) || '-'} | ${cell(x.suggested) || 'ask Simon'} |${anyDone ? (x.applied ? ' already made - check it |' : ' still to do |') : ''}`), '');
      }
      if (inlineCode) lines.push('```' + (c.row.language || '').toLowerCase().split(/[^a-z+#]/)[0], String(c.row.code_content || ''), '```', '');
    });
  }
  const newParts = (plan.gaps || []).filter((g) => !(g.covered && g.use !== false));
  if (newParts.length) {
    lines.push("## Parts Simon's code doesn't cover",
      'Build these new, in the same style as the reused code above (same components, set-up, styling and patterns):');
    newParts.forEach((g) => lines.push(`- **${g.need}:** ${clean(g.approach) || 'ask Simon how this should work before building it.'}`));
    lines.push('');
  }
  if ((plan.decisions || []).length) {
    lines.push('## Decisions');
    plan.decisions.forEach((d) => lines.push(`- ${d.question} **${clean(d.answer) || 'Not decided yet - ask Simon before building this part.'}**`));
    lines.push('');
  }
  if (plan.buildOrder?.length) lines.push('## Build order', ...plan.buildOrder.map((s, i) => `${i + 1}. ${s}`), '');
  lines.push('## Done when',
    `- It builds and its tests pass (${st?.ci === 'platformio' ? '`pio run`' : '`npm run build` and `npm test`'}), and the GitHub CI check is green.`,
    "- Reused pieces look and behave as they do in Simon's other projects, and new parts match them.",
    '- Every "Change for this project" item has been made.',
    '- README.md says how to set it up and run it.');
  return lines.join('\n');
}
const cell = (t) => clean(t, 300).replace(/\|/g, '\\|').replace(/\n/g, ' ');

// ---------------------------------------------------------------- step 4: create the folder

export async function createProject(body) {
  const { name, brief, stack, applyChanges = false, github = {}, setUp = true } = body;
  let plan = body.plan || {};
  if (!clean(name)) throw fail(400, 'Give the project a name.');
  const p = presets();
  const st = p.stacks.find((s) => s.id === stack);
  if (!st) throw fail(400, 'Choose what it\'s built with first.');
  const slug = slugify(name);
  const folder = path.resolve(clean(body.folder, 500) || path.join(p.projectsRoot, slug));
  if (!path.isAbsolute(clean(body.folder, 500) || folder)) throw fail(400, 'The folder must be a full path, like D:\\Projects\\my-app.');
  if (fs.existsSync(folder) && fs.readdirSync(folder).length) throw fail(409, `${folder} already exists and isn't empty - choose another folder.`);

  // his code, with the changes applied when asked (one call per piece, in parallel)
  const chosen = allCode(body, body.plan || {});
  const reusePaths = {};
  const usedNames = new Set();
  const files = {};
  await Promise.all(chosen.map(async (c) => {
    let code = String(c.row.code_content || '');
    c.changes = (c.changes || []).map((x) => ({ ...x }));
    const wanted = c.changes.filter((x) => x.include !== false && clean(x.what) && clean(x.current) && clean(x.suggested));
    if (applyChanges && wanted.length) {
      // Most changes are names and values that appear word for word in the code: those are swapped directly
      // (longest first, whole words for names, so "DropdownFilter" doesn't touch "DropdownFilterRenderer").
      // Only what isn't found that way goes to AI - rewriting every file took four minutes (12 Oct).
      for (const x of [...wanted].sort((m, n) => n.current.length - m.current.length)) {
        const ident = /^[A-Za-z_$][\w$]*$/.test(x.current);
        const rx = ident ? new RegExp(`(?<![\\w$])${x.current.replace(/\$/g, '\\$')}(?![\\w$])`, 'g') : null;
        const next = ident ? code.replace(rx, x.suggested) : code.split(x.current).join(x.suggested);
        if (next !== code) { code = next; x.applied = true; }
      }
      const rest = wanted.filter((x) => !x.applied);
      if (rest.length) {
        try {
          const model = genAI.getGenerativeModel({ model: getModelFor('codeRepo'), generationConfig: { temperature: 0, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } } });
          const r = await model.generateContent(`Make exactly these changes to the code below for a new project, and nothing else. Keep everything else - structure, comments, formatting - as it is.

CHANGES:
${rest.map((x) => `- ${x.what}${x.where ? ` (in ${x.where})` : ''}: "${x.current}" -> "${x.suggested}"`).join('\n')}

CODE (${c.row.file_path}):
${code}

Reply with JSON only: {"code":"the whole updated file"}`);
          const out = JSON.parse(r.response.text().trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
          if (clean(out?.code, 10) && out.code !== code) { code = String(out.code); rest.forEach((x) => { x.applied = true; }); }
        } catch (err) { console.warn(`[ProjectBuilder] Changes not applied to ${c.row.file_path}:`, err.message); }
      }
      c.applied = c.changes.some((x) => x.applied);
    }
    // a file named after what it exports takes the new name when that name was changed in the code
    // (DropdownFilterRenderer.tsx -> DepartmentFilterRenderer.tsx), so the renamed imports find it
    const fileName = renamedFile(c.row.file_path || `${c.id}.txt`, c.changes.filter((x) => x.applied));
    c.renamedFrom = fileName !== path.basename(c.row.file_path || '') ? path.basename(c.row.file_path || '') : null;
    let base = `reuse/${slugify(c.row.repo_name || 'code')}/${fileName}`;
    while (usedNames.has(base)) base = base.replace(/(\.[^.]+)?$/, (ext) => `-2${ext || ''}`);
    usedNames.add(base);
    reusePaths[c.id] = base;
    files[base] = code;
  }));

  // The framework itself, for the starters that run without asking questions (React, Vue, SolidJS, Node.js
  // API): created and its packages installed before anything else goes in, so the project builds straight
  // away. If it fails (no internet, say) the folder is still made and Antigravity runs the starter instead.
  fs.mkdirSync(folder, { recursive: true });
  const starter = plan.starter || resolveStarter(st, name);
  let started = false, startError = null;
  if (setUp && st.autoStart) {
    try {
      await sh(starter, { cwd: folder, windowsHide: true, timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
      await sh('npm install --no-audit --no-fund', { cwd: folder, windowsHide: true, timeout: 600000, maxBuffer: 32 * 1024 * 1024 });
      started = true;
    } catch (err) {
      startError = String(err.stderr || err.message || err).trim().split('\n').slice(-3).join(' ').slice(0, 300);
      console.warn(`[ProjectBuilder] Starter failed for ${folder}:`, startError);
    }
  }
  plan = { ...plan, starter, started };

  const owner = await githubLogin().catch(() => null);
  const stackName = st.name;
  const ruleList = rulesFor(body);
  Object.assign(files, {
    'README.md': readme({ name, brief, st, plan, chosen, reusePaths, ruleList }),
    'PROMPT.md': buildPrompt(body, plan, { inlineCode: false, reusePaths, chosen }),
    'AGENTS.md': `# How to work on ${clean(name, 120)}\n\nRead PROMPT.md for the brief and build order, and follow the house rules in .agents/rules/house-rules.md.\n`,
    '.agents/rules/house-rules.md': `# House rules\n\n${ruleList.map((r) => `- **${r.name}.** ${r.prompt}`).join('\n') || '- Keep the code simple and readable.'}\n`,
    '.gitignore': mergeLines(fs.existsSync(path.join(folder, '.gitignore')) ? fs.readFileSync(path.join(folder, '.gitignore'), 'utf8') : '', gitignoreFor(st)),
    '.editorconfig': 'root = true\n\n[*]\ncharset = utf-8\nend_of_line = lf\nindent_style = space\nindent_size = 2\ninsert_final_newline = true\ntrim_trailing_whitespace = true\n\n[*.md]\ntrim_trailing_whitespace = false\n\n[*.{c,cpp,h,hpp,ino}]\nindent_size = 4\n',
    '.env.example': '# Copy to .env and fill in. .env never goes to GitHub.\n',
    '.github/workflows/ci.yml': ciFor(st),
    '.github/dependabot.yml': dependabotFor(st),
    '.github/pull_request_template.md': '## What this changes\n\n\n## How it was checked\n\n- [ ] Builds\n- [ ] Tests pass\n- [ ] Tried it by hand\n',
    '.github/ISSUE_TEMPLATE/bug_report.md': '---\nname: Something is wrong\nabout: Report a bug\nlabels: bug\n---\n\n## What happened\n\n\n## What should have happened\n\n\n## How to make it happen again\n\n1. \n',
    '.github/ISSUE_TEMPLATE/feature_request.md': '---\nname: An idea\nabout: Suggest a new feature or change\nlabels: enhancement\n---\n\n## What you\'d like\n\n\n## Why it would help\n\n',
  });
  if (owner) files['.github/CODEOWNERS'] = `* @${owner}\n`;
  if (ruleList.some((r) => r.id === 'registry')) {
    files['feature.json'] = '[]\n';
    files['ProjectStructure.JSON'] = JSON.stringify({ project: clean(name, 120), stack: stackName, modules: [] }, null, 2) + '\n';
    files['test_plan.md'] = `# Test plan - ${clean(name, 120)}\n\n## Executive summary\n\n## 1. Feature test matrix\n\n| Feature | Test | Status |\n|---|---|---|\n\n## 2. Test scenarios\n`;
  }

  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(folder, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  }

  // git: a first commit (his identity from the IMS repo if git has none set globally)
  const git = (args) => run('git', args, { cwd: folder, windowsHide: true });
  await git(['init', '-b', 'main']);
  await git(['add', '-A']);
  const message = `Start ${clean(name, 80)}: ${started ? `${st.name} set up, ` : ''}brief, house rules, reused code and GitHub setup`;
  try { await git(['commit', '-m', message]); } catch (_) {
    const id = async (k) => (await run('git', ['config', k], { cwd: IMS_ROOT, windowsHide: true }).catch(() => ({ stdout: '' }))).stdout.trim();
    const [user, email] = [await id('user.name'), await id('user.email')];
    await git(['-c', `user.name=${user || 'Simon Philpott'}`, '-c', `user.email=${email || 'noreply@example.com'}`, 'commit', '-m', message]);
  }

  let githubResult = null;
  if (github.create) githubResult = await createGithubRepo({ folder, slug, brief, isPrivate: github.isPrivate !== false });

  return {
    folder,
    files: Object.keys(files).sort(),
    changesApplied: chosen.reduce((n, c) => n + (c.changes || []).filter((x) => x.applied).length, 0),
    started,
    startError,
    prompt: files['PROMPT.md'],
    github: githubResult,
  };
}

// The file's name after a change that renames the thing it's named after (shared rule with the review page)
export function renamedFile(filePath, changes = []) {
  const name = path.basename(String(filePath || ''));
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  const hit = changes.find((x) => x && x.include !== false && clean(x.current) === stem && /^[A-Za-z_$][\w$-]*$/.test(clean(x.suggested)));
  return hit ? `${clean(hit.suggested)}${ext}` : name;
}

async function githubLogin() {
  const token = getRawGitHubToken('personal');
  if (!token) return null;
  const res = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'IMS-Project-Builder' } });
  return res.ok ? (await res.json()).login : null;
}

// A private repo on his personal account, then a push. The token is passed as a one-off header so it is
// never written into the project's git config.
async function createGithubRepo({ folder, slug, brief, isPrivate }) {
  const token = getRawGitHubToken('personal');
  if (!token) throw fail(400, 'No personal GitHub token is saved - add one on the Code Best Practices page first.');
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'IMS-Project-Builder', 'Content-Type': 'application/json' };
  const res = await fetch('https://api.github.com/user/repos', { method: 'POST', headers, body: JSON.stringify({ name: slug, private: isPrivate, description: clean(brief, 300).replace(/\s+/g, ' ') }) });
  const repo = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = (repo.errors || []).map((e) => e.message).filter(Boolean).join('; ') || repo.message || res.statusText;
    throw fail(res.status === 422 ? 409 : 502, `The folder was created, but GitHub didn't make the repo: ${why}`);
  }
  const git = (args) => run('git', args, { cwd: folder, windowsHide: true });
  await git(['remote', 'add', 'origin', repo.clone_url]);
  const auth = Buffer.from(`x-access-token:${token}`).toString('base64');
  try {
    await git(['-c', `http.extraHeader=Authorization: Basic ${auth}`, 'push', '-u', 'origin', 'main']);
  } catch (err) {
    throw fail(502, `The repo ${repo.html_url} was created, but the push failed: ${String(err.stderr || err.message).replace(auth, '***').slice(0, 300)}`);
  }
  return { url: repo.html_url, private: repo.private };
}

// ---------------------------------------------------------------- generated files

function readme({ name, brief, st, plan, chosen, reusePaths, ruleList }) {
  const out = [
    `# ${clean(name, 120)}`, '', clean(brief), '',
    plan.summary ? `${plan.summary}\n` : '',
    '## Getting started', '',
    ...(plan.started
      ? [`Built with ${st.name}, already set up with \`${plan.starter}\` and its packages installed.${st.ci === 'node' && st.id !== 'node-api' ? ' Run `npm run dev` to see it.' : ''} Open this folder in Antigravity and give it PROMPT.md to build the rest.`, '']
      : [`Built with ${st.name}. The project itself isn't generated yet: open this folder in Antigravity and give it PROMPT.md, or create it yourself with:`, '',
        '```', plan.starter || resolveStarter(st, name), '```', '']),
  ];
  if (plan.folders?.length) out.push('## Folder layout', '', ...plan.folders.map((f) => `- \`${f.path}\` - ${f.purpose}`), '');
  if (chosen.length) {
    out.push('## Code reused from my other projects', '');
    for (const c of chosen) {
      out.push(`### ${c.row.title}`, `From ${c.row.repo_name} / \`${c.row.file_path}\`, copied to \`${reusePaths[c.id]}\`${c.renamedFrom ? ` (renamed from \`${c.renamedFrom}\`)` : ''}.`, '');
      const changes = (c.changes || []).filter((x) => x.include !== false && clean(x.what));
      if (changes.length) {
        out.push(c.applied ? 'Changes for this project (ticked ones are already made - check them):' : 'To change for this project:', '',
          ...changes.map((x) => `- [${x.applied ? 'x' : ' '}] ${x.what}: \`${cell(x.current) || '-'}\` -> ${clean(x.suggested) ? `\`${cell(x.suggested)}\`` : 'to decide'}`), '');
      }
    }
  }
  if (ruleList.length) out.push('## House rules', '', ...ruleList.map((r) => `- **${r.name}** - ${r.plain}`), '');
  return out.join('\n');
}

// Two .gitignore files as one, without repeating a line
function mergeLines(first, second) {
  const seen = new Set();
  return [...String(first).split(/\r?\n/), ...String(second).split(/\r?\n/)]
    .filter((l) => { const k = l.trim(); if (!k) return true; if (seen.has(k)) return false; seen.add(k); return true; })
    .join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function gitignoreFor(st) {
  if (st.gitignore === 'platformio') return '.pio/\n.vscode/.browse.c_cpp.db*\n.vscode/c_cpp_properties.json\n.vscode/launch.json\n.vscode/ipch\n.env\n.env.*\n!.env.example\n';
  const extra = { spfx: 'lib/\nrelease/\ntemp/\nsharepoint/solution/\n*.sppkg\n.heft/\n', nextjs: '.next/\nout/\n', sveltekit: '.svelte-kit/\n' }[st.id] || '';
  return `node_modules/\ndist/\nbuild/\ncoverage/\n${extra}.env\n.env.*\n!.env.example\n*.log\n.DS_Store\nThumbs.db\n`;
}

// CI that passes until the project has been created (no package.json / platformio.ini yet), then builds,
// lints and tests on every push and pull request
function ciFor(st) {
  if (st.ci === 'platformio') {
    return `name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Not created yet
        if: hashFiles('platformio.ini') == ''
        run: echo "No platformio.ini yet - nothing to build."
      - uses: actions/setup-python@v5
        if: hashFiles('platformio.ini') != ''
        with:
          python-version: '3.12'
      - if: hashFiles('platformio.ini') != ''
        run: pip install platformio
      - if: hashFiles('platformio.ini') != ''
        run: pio run
`;
  }
  return `name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Not created yet
        if: hashFiles('package.json') == ''
        run: echo "No package.json yet - nothing to build."
      # the Node version the project itself asks for (package.json "engines"), so CI always matches the
      # framework - current SharePoint (SPFx 1.21+) needs Node 22, older versions need 18 or 20
      - name: Node version
        id: node
        if: hashFiles('package.json') != ''
        run: echo "version=$(node -p "(require('./package.json').engines || {}).node || '22'")" >> "$GITHUB_OUTPUT"
      - uses: actions/setup-node@v4
        if: hashFiles('package.json') != ''
        with:
          node-version: \${{ steps.node.outputs.version }}
      - name: Install
        if: hashFiles('package.json') != ''
        run: npm ci || npm install
      - name: Lint
        if: hashFiles('package.json') != ''
        run: npm run lint --if-present
      - name: Build
        if: hashFiles('package.json') != ''
        run: npm run build --if-present
      - name: Test
        if: hashFiles('package.json') != ''
        run: npm test --if-present
`;
}

function dependabotFor(st) {
  const npm = st.ci === 'node' ? `  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
` : '';
  return `version: 2
updates:
${npm}  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
`;
}
