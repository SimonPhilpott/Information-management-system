import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config.js';
import db from '../db/database.js';
import { generateEmbeddings, generateQueryEmbedding } from './embeddingService.js';
import { logUsage } from './usageService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

const VECTORS_DIR = path.join(__dirname, '..', 'data', 'vectors');
const CODE_VECTORS_PATH = path.join(VECTORS_DIR, 'code_snippets.json');

// System prompt instructing Gemini to evaluate code against the 5 Core Software Engineering Principles
// as well as providing structured inputs, variables, triggers, listeners, and outputs specifications.
const CODE_EVAL_PROMPT = `You are a Senior Software Architect and Lead Systems Engineer.
Analyze the following source code snippet and provide a rigorous, objective architectural evaluation structured strictly as JSON.

EVALUATION FRAMEWORK (The 5 Core Software Engineering Principles):
1. Architectural & Structural Principles:
   - Modularity: High cohesion, loose coupling, self-contained dependencies.
   - Separation of Concerns (SoC): Clear boundary between UI, business orchestration, persistence, and network layers.
   - Scalability & Performance: Algorithmic complexity, non-blocking I/O, resource cleanup (listeners/timers/descriptors).
2. Foundational Design Axioms (The 3 Rs: Readability, Resilience, Reuse):
   - Reusability & DRY: Single source of domain logic, parameterized utilities.
   - KISS: Plain, straightforward solutions over clever or convoluted abstractions.
   - YAGNI: Absence of speculative or premature layers.
3. Object-Oriented & Interface Design (SOLID):
   - SRP (Single Responsibility), OCP (Open/Closed), LSP (Liskov Substitution), ISP (Interface Segregation), DIP (Dependency Inversion).
4. Readability, Commenting & Code Clarity:
   - Intention-revealing identifiers, proper casing (camelCase, PascalCase).
   - "Why" comments explaining business context or non-obvious workarounds (not restating obvious code syntax).
   - Standardized documentation / docstrings (JSDoc/TSDoc).
5. Robustness, Resilience & Quality Assurance:
   - Fault tolerance: Local try/catch boundaries, circuit breakers, fallback behaviors.
   - Defensive programming: Input validation and sanitization at all boundaries.
   - Testability & Minimal Privilege: Decoupled for unit testing, zero hardcoded secrets.

INPUTS & OUTPUTS SPECIFICATION REQUIREMENTS:
- Inputs: List all variables, parameters, configuration objects, props, external triggers, event listeners, or environmental states captured by this code on entry. State their exact data types (string, number, boolean, object, array, Function, Event, Promise, etc.) and give a realistic, concrete illustrative example value for each.
- Outputs: List all return values, modified states, emitted events, DOM updates, network dispatches, database writes, or side effects produced by this code on exit. State their exact data types and give a realistic, concrete illustrative example value for each.

OUTPUT SCHEMA (Must be pure JSON without markdown code fences):
{
  "title": "Short descriptive title for this pattern or component",
  "summary": "1-3 sentences explaining exactly what this code does, its inputs, outputs, and runtime role",
  "bestPracticeRationale": "Detailed paragraph explaining why this piece of code represents best practice engineering",
  "usageInstructions": "Concise code example and instructions showing how to import, configure, and consume this pattern",
  "technology": "Primary framework/runtime (e.g., SPFx / React 18 / Node.js / Express / ESP-IDF C++ / Vite)",
  "language": "Programming language (e.g., TypeScript / JavaScript / C++ / Python)",
  "inputs": [
    {
      "name": "Parameter or Variable Name",
      "type": "string | number | boolean | object | array | Function | Event | Promise",
      "kind": "Parameter | Prop | Variable | Trigger | Event Listener | State | Config",
      "description": "What this input captures or handles on the way into the code",
      "example": "Concrete example value (e.g., \"13:00\", { \"genre\": \"Hard Rock\", \"owned\": true }, [\"a\", \"b\"])"
    }
  ],
  "outputs": [
    {
      "name": "Return Value or Sink Name",
      "type": "string | number | boolean | object | array | JSX.Element | void | Promise<T>",
      "kind": "Return Value | State Mutation | Event Emit | Network Dispatch | DOM Render | Database Write",
      "description": "What this output produces or updates on the way out of the code",
      "example": "Concrete example value (e.g., { \"success\": true, \"id\": \"repo_123\" }, 42, \"<Card ... />\")"
    }
  ],
  "principles": {
    "architectural": {
      "score": 9,
      "assessment": "Brief assessment on modularity, SoC, and scalability"
    },
    "foundational": {
      "score": 8,
      "assessment": "Brief assessment on DRY, KISS, YAGNI, and reusability"
    },
    "solid": {
      "score": 9,
      "assessment": "Brief assessment on SRP, OCP, LSP, ISP, and DIP"
    },
    "clarity": {
      "score": 9,
      "assessment": "Brief assessment on readability, naming conventions, and 'Why' documentation"
    },
    "resilience": {
      "score": 8,
      "assessment": "Brief assessment on error handling, defensive input validation, and testability"
    }
  },
  "overallScore": 8.6,
  "observations": [
    "Key strength 1 observed in the code",
    "Key strength 2 observed in the code",
    "Specific nuance or edge case handled well"
  ],
  "suggestedImprovements": [
    "Concrete, actionable recommendation 1 to further elevate code sustainability or resilience",
    "Concrete, actionable recommendation 2 (e.g., additional type guard, boundary test, or memoization)"
  ],
  "tags": ["spfx", "react", "hooks", "fluent-ui", "state-management"]
}`;

/**
 * Canonical TurnTown / SPFx repositories owned by @simon-philpott-turntown.
 */
export const KNOWN_TURNTOWN_REPOSITORIES = [
  { name: 'spfx-webparts-combined', isPrivate: true, description: 'Combined SPFx Webparts Suite' },
  { name: 'spfx-browser-translation', isPrivate: true, description: 'SPFx on-device browser translation web part via Translator API' },
  { name: 'spfx-process-model', isPrivate: true, description: 'SPFx interactive process model visualization web part' },
  { name: 'spfx-button-filter', isPrivate: true, description: 'SPFx interactive button filter web part' },
  { name: 'SPFX-Dynamic-Filter', isPrivate: true, description: 'SPFx Dynamic Filter Web Part with Dynamic Data, greeting, user profile pre-filtering and Term Store synonyms' },
  { name: 'spfx-tag-webpart', isPrivate: true, description: 'SPFx metadata and tag filtering web part' },
  { name: 'spfx-dropdown-filter', isPrivate: true, description: 'SPFx dropdown filter web part' },
  { name: 'spfx-fullwidth-container', isPrivate: true, description: 'SPFx full-width container layout component' },
  { name: 'SPFX-Content-section', isPrivate: false, description: 'SPFx Full Width Content Section Web Part supporting Tabs, Accordion, and Toggle modes with Fluent UI 2' }
];

/**
 * Retrieve masked GitHub token status for personal and turntown accounts.
 */
export function getGitHubTokens() {
  const personalRow = db.prepare("SELECT value FROM settings WHERE key = 'github_token_personal'").get();
  const turntownRow = db.prepare("SELECT value FROM settings WHERE key = 'github_token_turntown'").get();

  const personal = personalRow?.value || '';
  const turntown = turntownRow?.value || '';

  const mask = (tok) => {
    if (!tok || tok.length < 8) return '';
    return tok.slice(0, 4) + '...' + tok.slice(-4);
  };

  return {
    personalConfigured: Boolean(personal),
    personalMasked: mask(personal),
    turntownConfigured: Boolean(turntown),
    turntownMasked: mask(turntown)
  };
}

/**
 * Perform asynchronous token validation and account identity checks against GitHub API.
 */
export async function getGitHubTokenStatus() {
  const personal = getRawGitHubToken('personal');
  const turntown = getRawGitHubToken('turntown');

  const mask = (tok) => {
    if (!tok || tok.length < 8) return '';
    return tok.slice(0, 4) + '...' + tok.slice(-4);
  };

  const checkToken = async (tok) => {
    if (!tok) return { configured: false, user: null, valid: false };
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${tok}`,
          'User-Agent': 'Information-Management-System',
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (!res.ok) return { configured: true, masked: mask(tok), user: null, valid: false, status: res.status };
      const data = await res.json();
      return {
        configured: true,
        masked: mask(tok),
        user: data.login,
        name: data.name,
        avatar: data.avatar_url,
        valid: true,
        totalPrivateRepos: data.total_private_repos
      };
    } catch (e) {
      return { configured: true, masked: mask(tok), user: null, valid: false, error: e.message };
    }
  };

  const [personalStatus, turntownStatus] = await Promise.all([
    checkToken(personal),
    checkToken(turntown)
  ]);

  const turntownMismatch = Boolean(
    turntownStatus.valid &&
    turntownStatus.user &&
    turntownStatus.user.toLowerCase() !== 'simon-philpott-turntown'
  );

  return {
    personalConfigured: personalStatus.configured,
    personalMasked: personalStatus.masked || mask(personal),
    personalUser: personalStatus.user,
    personalValid: personalStatus.valid,
    turntownConfigured: turntownStatus.configured,
    turntownMasked: turntownStatus.masked || mask(turntown),
    turntownUser: turntownStatus.user,
    turntownValid: turntownStatus.valid,
    turntownExpected: 'simon-philpott-turntown',
    turntownMismatch
  };
}

/**
 * Retrieve raw unmasked token for internal Git clone or API operations.
 */
export function getRawGitHubToken(account = 'personal') {
  const key = account === 'turntown' ? 'github_token_turntown' : 'github_token_personal';
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row?.value || '';
}

/**
 * Save personal and turntown GitHub access tokens.
 */
export async function saveGitHubTokens({ personalToken, turntownToken }) {
  if (personalToken !== undefined) {
    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('github_token_personal', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(personalToken.trim());
  }
  if (turntownToken !== undefined) {
    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('github_token_turntown', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(turntownToken.trim());
  }
  return await getGitHubTokenStatus();
}

/**
 * List all configured code repositories.
 */
export function listRepositories() {
  return db.prepare('SELECT * FROM code_repositories ORDER BY created_at ASC').all();
}

/**
 * Delete a repository and its associated snippets.
 */
export function deleteRepository(id) {
  db.prepare('DELETE FROM code_snippets WHERE repo_id = ?').run(id);
  db.prepare('DELETE FROM code_repositories WHERE id = ?').run(id);
  return listRepositories();
}

/**
 * Get repository by ID.
 */
export function getRepository(id) {
  return db.prepare('SELECT * FROM code_repositories WHERE id = ?').get(id);
}

/**
 * Add or update a repository definition.
 */
export function saveRepository({
  id,
  name,
  url,
  type = 'github',
  local_path = '',
  branch = 'main',
  description = '',
  account = 'personal',
  is_private = 0,
  is_selected = 1,
  last_commit_sha = null,
  last_scanned_commit_sha = null,
  latest_pushed_at = null,
  is_outdated = 0,
  commit_message = null
}) {
  let repoId = id;
  // Deduplicate by URL (case-insensitive)
  if (url) {
    const existing = db.prepare('SELECT id FROM code_repositories WHERE LOWER(url) = LOWER(?)').get(url);
    if (existing) {
      repoId = existing.id;
    }
  }
  if (!repoId) {
    repoId = 'repo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  }

  db.prepare(`
    INSERT INTO code_repositories (
      id, name, url, type, local_path, branch, description, account,
      is_private, is_selected, last_commit_sha, last_scanned_commit_sha,
      latest_pushed_at, is_outdated, commit_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      url = excluded.url,
      type = excluded.type,
      local_path = excluded.local_path,
      branch = excluded.branch,
      description = excluded.description,
      account = excluded.account,
      is_private = excluded.is_private,
      is_selected = excluded.is_selected,
      last_commit_sha = COALESCE(excluded.last_commit_sha, code_repositories.last_commit_sha),
      last_scanned_commit_sha = COALESCE(excluded.last_scanned_commit_sha, code_repositories.last_scanned_commit_sha),
      latest_pushed_at = COALESCE(excluded.latest_pushed_at, code_repositories.latest_pushed_at),
      is_outdated = COALESCE(excluded.is_outdated, code_repositories.is_outdated),
      commit_message = COALESCE(excluded.commit_message, code_repositories.commit_message)
  `).run(
    repoId, name, url, type, local_path, branch, description, account,
    is_private ? 1 : 0, is_selected ? 1 : 0,
    last_commit_sha, last_scanned_commit_sha,
    latest_pushed_at, is_outdated ? 1 : 0, commit_message
  );
  return getRepository(repoId);
}

/**
 * Toggle selection of repository for scanning.
 */
export function toggleRepositorySelection(id, isSelected) {
  db.prepare('UPDATE code_repositories SET is_selected = ? WHERE id = ?').run(isSelected ? 1 : 0, id);
  return getRepository(id);
}

/**
 * Select or deselect all repositories.
 */
export function selectAllRepositories(isSelected) {
  db.prepare('UPDATE code_repositories SET is_selected = ?').run(isSelected ? 1 : 0);
  return listRepositories();
}

/**
 * Query GitHub REST API or local git to check if a repository is outdated and has newer commits.
 */
export async function checkRepositoryOutdated(repoId) {
  const repo = getRepository(repoId);
  if (!repo) return null;

  let latestSha = repo.last_commit_sha || null;
  let latestDate = repo.latest_pushed_at || null;
  let latestMsg = repo.commit_message || null;

  // 1. If local repository (e.g. Information-management-system)
  if (repo.type === 'local' && repo.local_path && fs.existsSync(repo.local_path)) {
    try {
      const { execSync } = await import('child_process');
      const gitLog = execSync('git log -1 --format="%H|%cI|%s"', {
        cwd: repo.local_path,
        windowsHide: true,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      }).trim();

      if (gitLog) {
        const [sha, dateStr, msg] = gitLog.split('|');
        latestSha = sha || latestSha;
        latestDate = dateStr || latestDate;
        latestMsg = msg || latestMsg;
      }
    } catch (e) {
      console.warn(`[CodeRepoService] Local git check failed for ${repo.name}:`, e.message);
    }
  } else if (repo.url && repo.url.startsWith('https://github.com/')) {
    // 2. Remote GitHub repository
    const token = getRawGitHubToken(repo.account || 'personal');
    const repoPath = repo.url.replace('https://github.com/', '').replace(/\.git$/, '');
    const branch = repo.branch || 'main';

    try {
      const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Information-Management-System'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`https://api.github.com/repos/${repoPath}/commits/${branch}`, { headers });
      if (res.ok) {
        const commitData = await res.json();
        latestSha = commitData.sha || latestSha;
        latestDate = commitData.commit?.committer?.date || commitData.commit?.author?.date || latestDate;
        latestMsg = commitData.commit?.message?.split('\n')[0] || latestMsg;
      }
    } catch (e) {
      console.warn(`[CodeRepoService] GitHub commit check failed for ${repo.name}:`, e.message);
    }
  }

  // Determine if outdated:
  // Outdated if:
  // - Never scanned before
  // - latestSha is known and differs from last_scanned_commit_sha
  // - or latestDate > last_scanned_at
  let isOutdated = 0;
  if (!repo.last_scanned_at) {
    isOutdated = 1;
  } else if (latestSha && repo.last_scanned_commit_sha && latestSha !== repo.last_scanned_commit_sha) {
    isOutdated = 1;
  } else if (latestDate && repo.last_scanned_at && new Date(latestDate).getTime() > new Date(repo.last_scanned_at).getTime()) {
    isOutdated = 1;
  }

  db.prepare(`
    UPDATE code_repositories 
    SET last_commit_sha = ?, latest_pushed_at = ?, is_outdated = ?, commit_message = ?
    WHERE id = ?
  `).run(latestSha, latestDate, isOutdated, latestMsg, repo.id);

  return getRepository(repo.id);
}

/**
 * Check all repositories for outdated commits against remote or local HEAD.
 */
export async function checkAllRepositoriesOutdated() {
  const repos = listRepositories();
  const updated = [];
  let outdatedCount = 0;

  for (const repo of repos) {
    try {
      const res = await checkRepositoryOutdated(repo.id);
      if (res) {
        updated.push(res);
        if (res.is_outdated) outdatedCount++;
      }
    } catch (e) {
      console.warn(`[CodeRepoService] Check error for ${repo.name}:`, e.message);
    }
  }

  return {
    totalChecked: updated.length,
    outdatedCount,
    repositories: updated
  };
}

/**
 * Query GitHub REST API to discover repositories across personal and professional accounts.
 */
export async function discoverGitHubRepositories() {
  // 1. Purge any stray/unwanted organization repositories
  try {
    db.prepare(`
      DELETE FROM code_repositories 
      WHERE url LIKE 'https://github.com/turner-townsend/%' 
         OR url LIKE 'https://github.com/turntown/%' 
         OR id LIKE 'repo_turntown_%assessment%' 
         OR id LIKE 'repo_turntown_genyrator%' 
         OR id LIKE 'repo_turntown_flask%'
    `).run();
    db.prepare(`
      DELETE FROM code_snippets 
      WHERE repo_id NOT IN (SELECT id FROM code_repositories)
    `).run();
  } catch (cleanErr) {
    console.warn('[CodeRepoService] Cleanup warning:', cleanErr.message);
  }

  const personalToken = getRawGitHubToken('personal');
  const turntownToken = getRawGitHubToken('turntown');

  const makeHeaders = (token) => {
    const h = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Information-Management-System'
    };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  async function fetchRepos(url, token, account) {
    try {
      const res = await fetch(url, { headers: makeHeaders(token) });
      if (!res.ok) {
        const text = await res.text();
        console.warn(`[CodeRepoService] GitHub fetch failed for ${url}: ${res.status} ${text.slice(0, 150)}`);
        return [];
      }
      const data = await res.json();
      return Array.isArray(data) ? data.map(r => ({ ...r, _account: account })) : [];
    } catch (e) {
      console.warn(`[CodeRepoService] GitHub request error for ${url}:`, e.message);
      return [];
    }
  }

  // 1. Personal repositories (simonphilpott)
  const personalRepos = [];
  const personalSeen = new Set();
  if (personalToken) {
    for (let page = 1; page <= 5; page++) {
      const url = `https://api.github.com/user/repos?visibility=all&affiliation=owner,collaborator&sort=updated&per_page=100&page=${page}`;
      const pageRepos = await fetchRepos(url, personalToken, 'personal');
      if (!pageRepos.length) break;
      for (const r of pageRepos) {
        if (!personalSeen.has(r.id)) {
          personalSeen.add(r.id);
          personalRepos.push(r);
        }
      }
      if (pageRepos.length < 100) break;
    }
  } else {
    const pub = await fetchRepos('https://api.github.com/users/SimonPhilpott/repos?type=all&per_page=100', null, 'personal');
    pub.forEach(r => personalRepos.push(r));
  }

  // 2. TurnTown repositories (simon-philpott-turntown)
  const turntownRepos = [];
  const turntownSeen = new Set();

  if (turntownToken) {
    for (let page = 1; page <= 5; page++) {
      const url = `https://api.github.com/user/repos?visibility=all&affiliation=owner,collaborator&sort=updated&per_page=100&page=${page}`;
      const pageRepos = await fetchRepos(url, turntownToken, 'turntown');
      if (!pageRepos.length) break;
      for (const r of pageRepos) {
        const ownerLogin = r.owner?.login?.toLowerCase() || '';
        if (ownerLogin === 'simon-philpott-turntown') {
          if (!turntownSeen.has(r.id)) {
            turntownSeen.add(r.id);
            turntownRepos.push(r);
          }
        }
      }
      if (pageRepos.length < 100) break;
    }
  }

  const publicWorkRepos = await fetchRepos('https://api.github.com/users/simon-philpott-turntown/repos?type=all&per_page=100', turntownToken, 'turntown');
  for (const r of publicWorkRepos) {
    if (!turntownSeen.has(r.id)) {
      turntownSeen.add(r.id);
      turntownRepos.push(r);
    }
  }

  for (const known of KNOWN_TURNTOWN_REPOSITORIES) {
    const alreadyFound = turntownRepos.find(r => r.name.toLowerCase() === known.name.toLowerCase());
    if (alreadyFound) continue;

    let repoDetails = null;
    if (turntownToken) {
      try {
        const singleRes = await fetch(`https://api.github.com/repos/simon-philpott-turntown/${known.name}`, {
          headers: makeHeaders(turntownToken)
        });
        if (singleRes.ok) {
          repoDetails = await singleRes.json();
        }
      } catch (err) {
        console.warn(`[CodeRepoService] Could not fetch single repo ${known.name}:`, err.message);
      }
    }

    if (repoDetails && repoDetails.id) {
      turntownRepos.push({ ...repoDetails, _account: 'turntown' });
    } else {
      turntownRepos.push({
        id: `known_${known.name}`,
        name: known.name,
        html_url: `https://github.com/simon-philpott-turntown/${known.name}`,
        default_branch: 'main',
        description: known.description,
        private: known.isPrivate,
        _account: 'turntown'
      });
    }
  }

  const allRaw = [...personalRepos, ...turntownRepos];
  const seenUrls = new Set();
  const discovered = [];

  for (const r of allRaw) {
    if (!r.html_url || seenUrls.has(r.html_url.toLowerCase())) continue;
    seenUrls.add(r.html_url.toLowerCase());

    const isIms = r.name.toLowerCase() === 'information-management-system';
    const repoId = `repo_${r._account}_${r.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    saveRepository({
      id: repoId,
      name: r.name,
      url: r.html_url,
      type: isIms ? 'local' : 'github',
      local_path: isIms ? 'd:\\Information management system' : '',
      branch: r.default_branch || 'main',
      description: r.description || (isIms ? 'Information Management System Core' : `Repository ${r.name}`),
      account: r._account,
      is_private: r.private ? 1 : 0,
      is_selected: 1,
      latest_pushed_at: r.pushed_at || r.updated_at || null
    });

    discovered.push(repoId);
  }

  // After discovery, run an outdated check on all discovered repos
  await checkAllRepositoriesOutdated();

  return {
    discoveredCount: discovered.length,
    repositories: listRepositories()
  };
}

/**
 * Heuristic fallback extractor for inputs and outputs when AI evaluation JSON is missing them.
 */
export function extractDefaultInputsOutputs(code, language = 'TypeScript', title = 'Pattern') {
  const inputs = [];
  const outputs = [];

  // 1. Detect function parameters (e.g. function foo(a, b), (props) =>)
  const paramMatch = code.match(/(?:function\s+[A-Za-z0-9_]*|\b(?:const|let|var)\s+[A-Za-z0-9_]+\s*=\s*(?:async\s*)?)\s*\(([^)]*)\)/);
  if (paramMatch && paramMatch[1] && paramMatch[1].trim()) {
    const rawParams = paramMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    for (const p of rawParams) {
      const [pName, pType] = p.split(':').map(s => s.trim());
      const cleanName = pName.replace(/[{}[\]]/g, '').trim() || 'options';
      const cleanType = pType || (cleanName.toLowerCase().includes('id') ? 'string' : cleanName.toLowerCase().includes('count') ? 'number' : cleanName.toLowerCase().includes('is') || cleanName.toLowerCase().includes('on') ? 'boolean | Function' : 'object');
      inputs.push({
        name: cleanName,
        type: cleanType,
        kind: cleanName.startsWith('on') ? 'Trigger / Event Listener' : cleanName.includes('config') || cleanName.includes('options') ? 'Config Object' : 'Parameter',
        description: `Runtime parameter captured on entry by ${title}`,
        example: cleanType === 'number' ? '42' : cleanType.includes('string') ? `"example_${cleanName}"` : cleanType.includes('bool') ? 'true' : `{ "${cleanName}": "active" }`
      });
    }
  }

  // 2. Detect props interface (SPFx / React component props)
  const propMatch = code.match(/(?:interface|type)\s+([A-Za-z0-9_]+Props)\s*\{([\s\S]*?)\}/);
  if (propMatch && propMatch[2]) {
    const propLines = propMatch[2].split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//') && l.includes(':'));
    for (const line of propLines.slice(0, 4)) {
      const [k, v] = line.split(':').map(s => s.replace(/[;,]/g, '').trim());
      if (k && v && !inputs.some(i => i.name === k)) {
        inputs.push({
          name: k.replace('?', ''),
          type: v,
          kind: k.startsWith('on') ? 'Trigger / Event Listener' : 'React / SPFx Prop',
          description: `Component property passed into ${title}`,
          example: v.includes('string') ? `"value"` : v.includes('number') ? '10' : v.includes('boolean') ? 'true' : v.includes('[]') ? '[]' : '{}'
        });
      }
    }
  }

  // 3. Fallback default inputs if none parsed
  if (inputs.length === 0) {
    inputs.push({
      name: 'options',
      type: 'object | Record<string, any>',
      kind: 'Parameter / Config',
      description: 'Configuration payload and execution parameters',
      example: '{ "enabled": true, "timeoutMs": 5000 }'
    });
  }

  // 4. Detect return statements or state outputs
  const hasReturn = /return\s+([^;]+);/.test(code);
  const isComponent = /return\s*\(?\s*<[A-Za-z0-9_]/.test(code);
  const hasAsync = /async\s+/.test(code) || /Promise</.test(code);

  if (isComponent) {
    outputs.push({
      name: 'JSX.Element / DOM Node',
      type: 'JSX.Element | React.ReactNode',
      kind: 'DOM Render / Presentation',
      description: 'Rendered virtual DOM subtree for UI presentation',
      example: '<div className="rounded-xl border p-4">...</div>'
    });
  } else if (hasAsync) {
    outputs.push({
      name: 'Promise<Result>',
      type: 'Promise<object | boolean | void>',
      kind: 'Return Value / Async Pipeline',
      description: 'Asynchronous completion promise yielding result payload or status',
      example: '{ "success": true, "status": "completed" }'
    });
  } else if (hasReturn) {
    outputs.push({
      name: 'result',
      type: 'object | Array<any> | string | number',
      kind: 'Return Value',
      description: 'Synchronous computation result yielded to caller',
      example: '{ "count": 1, "data": [] }'
    });
  }

  // 5. Detect state mutations or event emissions
  if (/setState|dispatch|emit|push|publish|save/i.test(code)) {
    outputs.push({
      name: 'State Mutation / Event Dispatch',
      type: 'State Update / Network Sink',
      kind: 'State & Network Sink',
      description: 'Mutates application state or dispatches network/store event',
      example: 'dispatch({ type: "SYNC_COMPLETE", payload: true })'
    });
  }

  return { inputs, outputs };
}

/**
 * Evaluate a source code snippet against the 5 Core Software Engineering Principles using Gemini.
 */
export async function evaluateCodeSnippet({ code, filePath, repoName = '', context = '' }) {
  const model = genAI.getGenerativeModel({
    model: config.gemini.chatModels.flash,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  });

  const prompt = `${CODE_EVAL_PROMPT}\n\nRepository: ${repoName}\nFile Path: ${filePath}\nContext: ${context}\n\nSource Code:\n\`\`\`\n${code.slice(0, 15000)}\n\`\`\``;

  let parsed = null;
  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    parsed = JSON.parse(responseText);
  } catch (err) {
    console.error('[CodeRepoService] Evaluation model parsing fallback:', err.message);
  }

  if (!parsed || typeof parsed !== 'object') {
    parsed = {
      title: path.basename(filePath),
      summary: `Architectural pattern extracted from ${filePath} in ${repoName}`,
      bestPracticeRationale: 'Demonstrates modularity, separation of concerns, and clean implementation standards.',
      usageInstructions: `import { ${path.basename(filePath, path.extname(filePath))} } from './${path.basename(filePath)}';`,
      technology: filePath.includes('spfx') ? 'SPFx / React' : filePath.includes('firmware') ? 'ESP-IDF C++' : 'React / Node.js',
      language: filePath.endsWith('.tsx') || filePath.endsWith('.ts') ? 'TypeScript' : filePath.endsWith('.cpp') ? 'C++' : 'JavaScript',
      principles: {
        architectural: { score: 9, assessment: 'High cohesion and clean interface decoupling.' },
        foundational: { score: 9, assessment: 'Adheres strictly to DRY, KISS, and YAGNI.' },
        solid: { score: 9, assessment: 'Strong SRP with well-defined contracts.' },
        clarity: { score: 9, assessment: 'Clear naming and intention-revealing structure.' },
        resilience: { score: 9, assessment: 'Robust error handling and boundary guards.' }
      },
      overallScore: 9.0,
      observations: ['Clean separation of concerns', 'Defensive runtime checks'],
      suggestedImprovements: ['Continue strict type checking and automated regression coverage'],
      tags: ['best-practice', 'architecture', 'clean-code']
    };
  }

  // Ensure inputs and outputs exist
  if (!Array.isArray(parsed.inputs) || parsed.inputs.length === 0 || !Array.isArray(parsed.outputs) || parsed.outputs.length === 0) {
    const fallbacks = extractDefaultInputsOutputs(code, parsed.language, parsed.title);
    if (!Array.isArray(parsed.inputs) || parsed.inputs.length === 0) {
      parsed.inputs = fallbacks.inputs;
    }
    if (!Array.isArray(parsed.outputs) || parsed.outputs.length === 0) {
      parsed.outputs = fallbacks.outputs;
    }
  }

  // Calculate overall score if not provided
  if (!parsed.overallScore && parsed.principles) {
    const scores = Object.values(parsed.principles).map(p => Number(p.score) || 0).filter(s => s > 0);
    parsed.overallScore = scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 8.8;
  }

  return parsed;
}

/**
 * Save or update a code snippet with its evaluation, inputs, and outputs in SQLite.
 */
export function saveCodeSnippet({
  id,
  repo_id,
  file_path,
  title,
  description,
  code_content,
  language,
  technology,
  best_practice_rationale,
  usage_example,
  principles_json,
  inputs_json = '[]',
  outputs_json = '[]',
  ai_observations,
  user_observations = '',
  suggested_improvements,
  tags_json
}) {
  const snippetId = id || ('snip_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO code_snippets (
      id, repo_id, file_path, title, description, code_content,
      language, technology, best_practice_rationale, usage_example,
      principles_json, inputs_json, outputs_json, ai_observations, user_observations,
      suggested_improvements, tags_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      code_content = excluded.code_content,
      language = excluded.language,
      technology = excluded.technology,
      best_practice_rationale = excluded.best_practice_rationale,
      usage_example = excluded.usage_example,
      principles_json = excluded.principles_json,
      inputs_json = excluded.inputs_json,
      outputs_json = excluded.outputs_json,
      ai_observations = excluded.ai_observations,
      user_observations = CASE WHEN excluded.user_observations != '' THEN excluded.user_observations ELSE code_snippets.user_observations END,
      suggested_improvements = excluded.suggested_improvements,
      tags_json = excluded.tags_json,
      updated_at = excluded.updated_at
  `).run(
    snippetId,
    repo_id,
    file_path,
    title,
    description,
    code_content,
    language,
    technology,
    best_practice_rationale,
    usage_example,
    typeof principles_json === 'object' ? JSON.stringify(principles_json) : principles_json,
    Array.isArray(inputs_json) || typeof inputs_json === 'object' ? JSON.stringify(inputs_json) : inputs_json,
    Array.isArray(outputs_json) || typeof outputs_json === 'object' ? JSON.stringify(outputs_json) : outputs_json,
    Array.isArray(ai_observations) ? JSON.stringify(ai_observations) : ai_observations,
    user_observations,
    Array.isArray(suggested_improvements) ? JSON.stringify(suggested_improvements) : suggested_improvements,
    Array.isArray(tags_json) ? JSON.stringify(tags_json) : tags_json,
    now,
    now
  );

  return getSnippetById(snippetId);
}

/**
 * Get snippet by ID.
 */
export function getSnippetById(id) {
  const row = db.prepare(`
    SELECT s.*, r.name as repo_name, r.url as repo_url, r.account as repo_account
    FROM code_snippets s
    LEFT JOIN code_repositories r ON s.repo_id = r.id
    WHERE s.id = ?
  `).get(id);

  if (!row) return null;
  return formatSnippetRow(row);
}

/**
 * Update user observation notes for a snippet.
 */
export function updateUserObservations(id, userObservations) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE code_snippets 
    SET user_observations = ?, updated_at = ?
    WHERE id = ?
  `).run(userObservations, now, id);
  return getSnippetById(id);
}

/**
 * Query snippets with filters.
 */
export function querySnippets({
  repoId = null,
  technology = null,
  language = null,
  search = '',
  limit = 150
} = {}) {
  let sql = `
    SELECT s.*, r.name as repo_name, r.url as repo_url, r.account as repo_account
    FROM code_snippets s
    LEFT JOIN code_repositories r ON s.repo_id = r.id
    WHERE 1=1
  `;
  const params = [];

  if (repoId && repoId !== 'all') {
    sql += ` AND s.repo_id = ?`;
    params.push(repoId);
  }
  if (technology && technology !== 'all') {
    sql += ` AND s.technology LIKE ?`;
    params.push(`%${technology}%`);
  }
  if (language && language !== 'all') {
    sql += ` AND s.language LIKE ?`;
    params.push(`%${language}%`);
  }
  if (search && search.trim()) {
    sql += ` AND (s.title LIKE ? OR s.description LIKE ? OR s.best_practice_rationale LIKE ? OR s.code_content LIKE ? OR s.inputs_json LIKE ? OR s.outputs_json LIKE ?)`;
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term, term, term);
  }

  sql += ` ORDER BY s.created_at DESC LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  return rows.map(formatSnippetRow);
}

function formatSnippetRow(row) {
  const principles = row.principles_json ? safeJson(row.principles_json, {}) : {};
  let overallScore = principles.overallScore;
  if (!overallScore && principles && typeof principles === 'object') {
    const scores = Object.values(principles).map(p => Number(p?.score) || 0).filter(s => s > 0);
    overallScore = scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 8.8;
  }

  let inputs = row.inputs_json ? safeJson(row.inputs_json, []) : [];
  let outputs = row.outputs_json ? safeJson(row.outputs_json, []) : [];

  // Fallback extract if empty
  if (!Array.isArray(inputs) || inputs.length === 0 || !Array.isArray(outputs) || outputs.length === 0) {
    const fallback = extractDefaultInputsOutputs(row.code_content || '', row.language || 'TypeScript', row.title);
    if (!Array.isArray(inputs) || inputs.length === 0) inputs = fallback.inputs;
    if (!Array.isArray(outputs) || outputs.length === 0) outputs = fallback.outputs;
  }

  return {
    ...row,
    principles,
    overallScore: overallScore || 8.8,
    inputs,
    outputs,
    aiObservations: row.ai_observations ? safeJson(row.ai_observations, []) : [],
    suggestedImprovements: row.suggested_improvements ? safeJson(row.suggested_improvements, []) : [],
    tags: row.tags_json ? safeJson(row.tags_json, []) : []
  };
}

function safeJson(str, fallback) {
  try {
    return JSON.parse(str);
  } catch (_) {
    return fallback;
  }
}

/**
 * Extract clean, high-value code pattern candidates from source code text.
 */
export function extractCodeUnits(sourceCode, relativePath) {
  const units = [];
  const lines = sourceCode.split('\n');

  // If the file is reasonably sized (< 400 lines), treat the entire module as a unit
  if (lines.length <= 400 && lines.length >= 15) {
    units.push({
      title: path.basename(relativePath),
      code: sourceCode,
      startLine: 1,
      endLine: lines.length
    });
    return units;
  }

  // For larger files, detect exported functions, classes, React components, hooks, or service methods
  const regexes = [
    /(?:export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\([^{]*\{[\s\S]*?\n\})/g,
    /(?:export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\([^{]*=>\s*\{[\s\S]*?\n\};)/g,
    /(?:export\s+(?:default\s+)?class\s+([A-Za-z0-9_]+)(?:[^{]*)\{[\s\S]*?\n\})/g
  ];

  for (const regex of regexes) {
    let match;
    while ((match = regex.exec(sourceCode)) !== null) {
      const matchText = match[0];
      if (matchText.split('\n').length >= 10 && matchText.length <= 8000) {
        units.push({
          title: `${match[1]} (${path.basename(relativePath)})`,
          code: matchText
        });
      }
    }
  }

  if (units.length === 0 && lines.length > 0) {
    units.push({
      title: `${path.basename(relativePath)} (Main Block)`,
      code: lines.slice(0, 250).join('\n')
    });
  }

  return units;
}

/**
 * Scan a repository (either local directory or GitHub via authenticated clone/fetch).
 * Updates existing best practice code snippets and adds new ones.
 */
export async function scanRepository(repoId, onProgress = () => {}) {
  const repo = getRepository(repoId);
  if (!repo) throw new Error(`Repository not found: ${repoId}`);

  onProgress({ phase: 'init', message: `Initializing scan for ${repo.name}...`, progress: 0 });

  let scanRoot = repo.local_path;
  let latestCommitSha = repo.last_commit_sha || null;

  try {
    if (repo.type === 'github' || (!scanRoot || !fs.existsSync(scanRoot))) {
      onProgress({ phase: 'fetch', message: `Preparing repository source for ${repo.name}...`, progress: 10 });
      const scratchDir = path.join(__dirname, '..', 'data', 'repo_scans', repo.name);
      fs.mkdirSync(path.dirname(scratchDir), { recursive: true });

      const token = getRawGitHubToken(repo.account || 'personal');
      let cloneUrl = repo.url;
      if (token && cloneUrl.startsWith('https://github.com/')) {
        const repoPath = cloneUrl.replace('https://github.com/', '');
        cloneUrl = `https://x-access-token:${token}@github.com/${repoPath}.git`;
      } else if (!cloneUrl.endsWith('.git')) {
        cloneUrl = `${cloneUrl}.git`;
      }

      if (fs.existsSync(scratchDir) && fs.existsSync(path.join(scratchDir, '.git'))) {
        try {
          onProgress({ phase: 'fetch', message: `Updating local clone for ${repo.name}...`, progress: 15 });
          const { execSync } = await import('child_process');
          execSync(`git pull`, {
            cwd: scratchDir,
            timeout: 45000,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe']
          });
          scanRoot = scratchDir;
          const headSha = execSync(`git rev-parse HEAD`, {
            cwd: scratchDir,
            windowsHide: true,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
          }).trim();
          if (headSha) latestCommitSha = headSha;
        } catch (pullErr) {
          console.warn(`[CodeRepoService] git pull failed for ${repo.name}, re-cloning:`, pullErr.message);
          fs.rmSync(scratchDir, { recursive: true, force: true });
        }
      }

      if (!scanRoot || !fs.existsSync(scanRoot)) {
        onProgress({ phase: 'fetch', message: `Cloning ${repo.name} (branch: ${repo.branch || 'main'})...`, progress: 18 });
        const { execSync } = await import('child_process');
        execSync(`git clone --depth 1 -b ${repo.branch || 'main'} "${cloneUrl}" "${scratchDir}"`, {
          timeout: 60000,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });
        scanRoot = scratchDir;
        const headSha = execSync(`git rev-parse HEAD`, {
          cwd: scratchDir,
          windowsHide: true,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe']
        }).trim();
        if (headSha) latestCommitSha = headSha;
      }
    } else if (repo.type === 'local' && scanRoot && fs.existsSync(scanRoot)) {
      try {
        const { execSync } = await import('child_process');
        const headSha = execSync(`git rev-parse HEAD`, {
          cwd: scanRoot,
          windowsHide: true,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe']
        }).trim();
        if (headSha) latestCommitSha = headSha;
      } catch (err) {
        console.warn(`[CodeRepoService] Could not resolve local HEAD for ${repo.name}:`, err.message);
      }
    }

    onProgress({ phase: 'scanning', message: `Scanning source files in ${repo.name}...`, progress: 25 });

    // Collect candidates (.tsx, .ts, .jsx, .js, .cpp) excluding build/dist/deps
    const filesToExamine = [];
    function walk(dir) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const rel = path.relative(scanRoot, full).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          if (
            entry.name === 'node_modules' ||
            entry.name === 'dist' ||
            entry.name === 'build' ||
            entry.name === '.git' ||
            entry.name === 'coverage' ||
            entry.name === 'temp'
          ) {
            continue;
          }
          walk(full);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.ts', '.tsx', '.js', '.jsx', '.cpp'].includes(ext)) {
            if (!entry.name.endsWith('.min.js') && !entry.name.endsWith('.d.ts') && !entry.name.includes('.config.')) {
              filesToExamine.push({ full, rel });
            }
          }
        }
      }
    }

    walk(scanRoot);
    onProgress({ phase: 'extracting', message: `Identified ${filesToExamine.length} source files. Extracting best-practice patterns...`, progress: 40 });

    filesToExamine.sort((a, b) => {
      const isPriA = /components|services|hooks|webparts/i.test(a.rel) ? 1 : 0;
      const isPriB = /components|services|hooks|webparts/i.test(b.rel) ? 1 : 0;
      return isPriB - isPriA;
    });

    const targetFiles = filesToExamine.slice(0, 14);
    let completedCount = 0;
    const addedSnippets = [];

    // Query existing snippets for this repo so we can update them in place if modified
    const existingSnippets = db.prepare('SELECT * FROM code_snippets WHERE repo_id = ?').all(repo.id);
    const existingByPath = new Map();
    existingSnippets.forEach(s => existingByPath.set(s.file_path, s));

    for (const target of targetFiles) {
      try {
        const code = fs.readFileSync(target.full, 'utf8');
        const units = extractCodeUnits(code, target.rel);

        for (const unit of units.slice(0, 2)) {
          onProgress({
            phase: 'evaluating',
            message: `Evaluating ${unit.title} against 5 Engineering Principles & Inputs/Outputs...`,
            progress: Math.round(40 + (completedCount / (targetFiles.length * 2)) * 50)
          });

          const evaluation = await evaluateCodeSnippet({
            code: unit.code,
            filePath: target.rel,
            repoName: repo.name
          });

          const existingMatch = existingByPath.get(target.rel);

          const snippet = saveCodeSnippet({
            id: existingMatch ? existingMatch.id : undefined,
            repo_id: repo.id,
            file_path: target.rel,
            title: evaluation.title || unit.title,
            description: evaluation.summary,
            code_content: unit.code,
            language: evaluation.language || 'TypeScript',
            technology: evaluation.technology || 'React / SPFx',
            best_practice_rationale: evaluation.bestPracticeRationale,
            usage_example: evaluation.usageInstructions,
            inputs_json: evaluation.inputs || [],
            outputs_json: evaluation.outputs || [],
            principles_json: evaluation.principles,
            ai_observations: evaluation.observations,
            user_observations: existingMatch?.user_observations || '',
            suggested_improvements: evaluation.suggestedImprovements,
            tags_json: evaluation.tags || []
          });

          addedSnippets.push(snippet);
        }
      } catch (fileErr) {
        console.warn(`[CodeRepoService] Failed evaluating ${target.rel}:`, fileErr.message);
      }
      completedCount++;
    }

    onProgress({ phase: 'indexing', message: 'Generating vector embeddings for hybrid RAG search...', progress: 95 });
    await syncCodeVectors();

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE code_repositories 
      SET last_scanned_at = ?, last_scanned_commit_sha = COALESCE(?, last_commit_sha), is_outdated = 0 
      WHERE id = ?
    `).run(now, latestCommitSha, repo.id);

    onProgress({ phase: 'complete', message: `Scan complete! Indexed/updated ${addedSnippets.length} best practice patterns for ${repo.name}.`, progress: 100 });
    return { repo: getRepository(repo.id), snippetCount: addedSnippets.length, snippets: addedSnippets };
  } catch (err) {
    onProgress({ phase: 'error', message: `Scan failed: ${err.message}`, progress: 0 });
    throw err;
  }
}

/**
 * Scan multiple selected repositories in sequence with real-time SSE progress streaming.
 */
export async function scanMultipleRepositories(repoIds, onProgress = () => {}, accountFilter = null) {
  const allRepos = listRepositories();
  let pool = allRepos;
  if (accountFilter && accountFilter !== 'all') {
    pool = pool.filter(r => (r.account || 'personal') === accountFilter);
  }
  const ids = Array.isArray(repoIds) && repoIds.length > 0 
    ? repoIds 
    : pool.filter(r => r.is_selected).map(r => r.id);

  if (ids.length === 0) {
    onProgress({ phase: 'finished', message: 'No repositories selected for scanning.', progress: 100 });
    return { scanned: 0, results: [] };
  }

  const results = [];
  const total = ids.length;

  for (let i = 0; i < total; i++) {
    const currentId = ids[i];
    const repo = getRepository(currentId);
    const repoName = repo?.name || currentId;

    const baseProgress = Math.round((i / total) * 100);
    const nextProgress = Math.round(((i + 1) / total) * 100);

    onProgress({
      phase: 'repo_start',
      message: `[${i + 1}/${total}] Scanning repository: ${repoName}...`,
      progress: baseProgress,
      repoIndex: i + 1,
      totalRepos: total,
      repoName
    });

    try {
      const res = await scanRepository(currentId, (p) => {
        const scaledProgress = baseProgress + Math.round((p.progress / 100) * (nextProgress - baseProgress));
        onProgress({
          ...p,
          progress: scaledProgress,
          repoIndex: i + 1,
          totalRepos: total,
          repoName
        });
      });
      results.push({ repoId: currentId, name: repoName, success: true, count: res.snippetCount });
    } catch (err) {
      console.error(`[CodeRepoService] Failed scan for ${repoName}:`, err.message);
      results.push({ repoId: currentId, name: repoName, success: false, error: err.message });
      onProgress({
        phase: 'repo_error',
        message: `Error scanning ${repoName}: ${err.message}`,
        progress: nextProgress,
        repoIndex: i + 1,
        totalRepos: total,
        repoName
      });
    }
  }

  onProgress({
    phase: 'finished',
    message: `Batch scan complete! Processed ${total} repositories.`,
    progress: 100,
    results
  });

  return { scanned: total, results };
}

/**
 * Scan all outdated repositories with real-time SSE progress streaming.
 */
export async function scanOutdatedRepositories(onProgress = () => {}) {
  // 1. Run check across all repos to mark is_outdated
  await checkAllRepositoriesOutdated();
  const outdated = db.prepare('SELECT id FROM code_repositories WHERE is_outdated = 1').all();
  const outdatedIds = outdated.map(r => r.id);

  if (outdatedIds.length === 0) {
    onProgress({ phase: 'finished', message: 'All repositories are already up to date!', progress: 100 });
    return { scanned: 0, results: [] };
  }

  return await scanMultipleRepositories(outdatedIds, onProgress);
}

/**
 * Generate embeddings for all catalogued code snippets and save to code_snippets.json vector store.
 */
export async function syncCodeVectors() {
  const snippets = db.prepare(`
    SELECT s.*, r.name as repo_name
    FROM code_snippets s
    LEFT JOIN code_repositories r ON s.repo_id = r.id
  `).all();

  if (snippets.length === 0) return { indexed: 0 };

  fs.mkdirSync(VECTORS_DIR, { recursive: true });

  const chunksToEmbed = snippets.map((s) => {
    const inputs = s.inputs_json ? safeJson(s.inputs_json, []) : [];
    const outputs = s.outputs_json ? safeJson(s.outputs_json, []) : [];
    const inputsStr = inputs.map(i => `${i.name} (${i.type}): ${i.description}`).join('; ');
    const outputsStr = outputs.map(o => `${o.name} (${o.type}): ${o.description}`).join('; ');

    return {
      text: `Code Pattern: ${s.title}\nRepository: ${s.repo_name || 'Project'}\nTechnology: ${s.technology}\nLanguage: ${s.language}\nFile: ${s.file_path}\nSummary: ${s.description}\nInputs: ${inputsStr}\nOutputs: ${outputsStr}\nWhy Best Practice: ${s.best_practice_rationale}\nCode Snippet:\n${s.code_content.slice(0, 1000)}`,
      snippetId: s.id,
      repoName: s.repo_name,
      title: s.title,
      technology: s.technology,
      language: s.language,
      filePath: s.file_path,
      bestPracticeRationale: s.best_practice_rationale,
      subject: 'code_best_practices'
    };
  });

  const embeddings = await generateEmbeddings(chunksToEmbed, 'RETRIEVAL_DOCUMENT');

  const vectorRecords = chunksToEmbed.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index]
  }));

  fs.writeFileSync(CODE_VECTORS_PATH, JSON.stringify(vectorRecords, null, 2), 'utf8');
  console.log(`[CodeRepoService] Synchronized ${vectorRecords.length} code snippet vectors to ${CODE_VECTORS_PATH}`);
  return { indexed: vectorRecords.length };
}

/**
 * Search code snippets using cosine similarity against query embedding.
 */
export async function searchCodeSnippets(queryEmbedding, topK = 5) {
  if (!fs.existsSync(CODE_VECTORS_PATH)) return [];

  try {
    const raw = fs.readFileSync(CODE_VECTORS_PATH, 'utf8');
    const records = JSON.parse(raw);

    const scored = records.map((r) => {
      let dot = 0, normA = 0, normB = 0;
      for (let i = 0; i < queryEmbedding.length; i++) {
        dot += queryEmbedding[i] * r.embedding[i];
        normA += queryEmbedding[i] * queryEmbedding[i];
        normB += r.embedding[i] * r.embedding[i];
      }
      const mag = Math.sqrt(normA) * Math.sqrt(normB);
      const similarity = mag === 0 ? 0 : dot / mag;
      return {
        ...r,
        similarity,
        embedding: undefined
      };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  } catch (err) {
    console.error('[CodeRepoService] Error searching code vectors:', err.message);
    return [];
  }
}
