import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import db, { getSetting, setSetting } from '../db/database.js';
import { addIdea } from './devIdeasService.js';

// Dependency and vulnerability watch: once a week (or on demand from the Code Repo page) runs
// `npm audit` and `npm outdated` for IMS itself (the web app, the server and the library client) and
// for every GitHub repo the Code Repo service has scanned. Each project is checked in a temporary copy
// of its package.json and lockfile, so nothing is installed and the projects themselves are untouched
// (a lockfile is generated in the copy when the repo has none). Critical and high advisories and
// packages a major version or more behind are kept for the page, and each critical finding becomes
// one dev idea (never twice while it's still open).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, '..');
const ROOT = path.join(SERVER, '..', '..');
const SCANS = path.join(SERVER, 'data', 'repo_scans');
const RESULT_KEY = 'dependency_watch_last';
const WEEK = 7 * 24 * 3600000;
const SEVERITY = ['critical', 'high', 'moderate', 'low', 'info'];
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

let running = null;
let progress = null;

function projects() {
  const list = [
    { key: 'ims-web', name: 'IMS web app', kind: 'ims', dir: ROOT },
    { key: 'ims-server', name: 'IMS server', kind: 'ims', dir: path.join(SERVER, '..') },
    { key: 'ims-client', name: 'IMS library client', kind: 'ims', dir: path.join(SERVER, '..', 'client') },
  ];
  try {
    for (const d of fs.readdirSync(SCANS)) list.push({ key: `repo-${d}`, name: d, kind: 'repo', dir: path.join(SCANS, d) });
  } catch { /* nothing scanned yet */ }
  return list.filter((p) => fs.existsSync(path.join(p.dir, 'package.json')));
}

// npm exits non-zero whenever it finds something, so the exit code is ignored and stdout is parsed.
function npm(args, cwd, timeout = 300000) {
  return new Promise((resolve) => {
    execFile(NPM, args, { cwd, timeout, maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32', windowsHide: true },
      (err, stdout, stderr) => resolve({ stdout: String(stdout || ''), stderr: String(stderr || ''), code: err?.code ?? 0 }));
  });
}
const parse = (s) => { try { return JSON.parse(s || '{}'); } catch { return null; } };
const major = (v) => { const m = String(v || '').match(/(\d+)/); return m ? Number(m[1]) : null; };

// Follows "via" names back to the advisories that cause them.
function advisoriesFor(name, vulns, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const v = vulns[name];
  if (!v) return [];
  return (v.via || []).flatMap((x) => (typeof x === 'object' ? [{ title: x.title, url: x.url, severity: x.severity, package: x.name, range: x.range }] : advisoriesFor(x, vulns, seen)));
}

async function checkProject(p) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-depwatch-'));
  try {
    fs.copyFileSync(path.join(p.dir, 'package.json'), path.join(tmp, 'package.json'));
    const lock = path.join(p.dir, 'package-lock.json');
    let lockNote = null;
    if (fs.existsSync(lock)) fs.copyFileSync(lock, path.join(tmp, 'package-lock.json'));
    else {
      const gen = await npm(['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--legacy-peer-deps'], tmp, 600000);
      if (!fs.existsSync(path.join(tmp, 'package-lock.json'))) throw new Error(`Could not work out its dependencies (${gen.stderr.split('\n').find((l) => /ERR/.test(l)) || 'npm install failed'})`);
      lockNote = 'No lockfile in the repo - versions resolved fresh for this check.';
    }
    const lockJson = parse(fs.readFileSync(path.join(tmp, 'package-lock.json'), 'utf8')) || {};
    const installed = (name) => lockJson.packages?.[`node_modules/${name}`]?.version || lockJson.dependencies?.[name]?.version || null;

    const [auditRes, outdatedRes] = await Promise.all([npm(['audit', '--json'], tmp), npm(['outdated', '--json'], tmp)]);
    const audit = parse(auditRes.stdout);
    if (!audit) throw new Error('npm audit gave no readable answer.');
    const vulns = audit.vulnerabilities || {};
    const findings = Object.values(vulns).filter((v) => v.severity === 'critical' || v.severity === 'high').map((v) => {
      const adv = advisoriesFor(v.name, vulns);
      const fix = v.fixAvailable;
      return {
        package: v.name, severity: v.severity, direct: Boolean(v.isDirect), range: v.range || null,
        // worst first, so a critical advisory is never the one trimmed off
        advisories: [...new Map(adv.map((a) => [a.url || a.title, a])).values()].sort((x, y) => SEVERITY.indexOf(x.severity) - SEVERITY.indexOf(y.severity)).slice(0, 8),
        fix: fix === true ? { available: true } : fix && typeof fix === 'object' ? { available: true, package: fix.name, version: fix.version, major: Boolean(fix.isSemVerMajor) } : { available: false },
      };
    }).sort((a, b) => (a.severity === b.severity ? a.package.localeCompare(b.package) : a.severity === 'critical' ? -1 : 1));

    const outdated = parse(outdatedRes.stdout) || {};
    const lag = Object.entries(outdated).map(([name, o]) => {
      const current = o.current || installed(name);
      return { package: name, current, wanted: o.wanted || null, latest: o.latest || null, majorsBehind: major(o.latest) != null && major(current) != null ? major(o.latest) - major(current) : null };
    });
    const majorLag = lag.filter((x) => x.majorsBehind >= 1).sort((a, b) => b.majorsBehind - a.majorsBehind);

    return {
      key: p.key, name: p.name, kind: p.kind, ok: true, lockNote,
      counts: audit.metadata?.vulnerabilities || {}, dependencies: audit.metadata?.dependencies?.total ?? null,
      findings, outdatedCount: lag.length, majorLag,
    };
  } catch (err) {
    return { key: p.key, name: p.name, kind: p.kind, ok: false, error: err.message };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// One dev idea per critical advisory (a GitHub advisory such as GHSA-xxxx), listing every project and
// package it reaches - the same flaw in a shared library is one job, not one per repo. Not repeated
// while an earlier idea for that advisory is still open.
function ideasForCriticals(results) {
  const byAdvisory = new Map();
  for (const r of results.filter((x) => x.ok)) {
    for (const f of r.findings) {
      for (const a of f.advisories.filter((x) => x.severity === 'critical')) {
        const key = a.url || `${a.package}:${a.title}`;
        if (!byAdvisory.has(key)) byAdvisory.set(key, { advisory: a, where: new Map() });
        const w = byAdvisory.get(key).where;
        if (!w.has(r.name)) w.set(r.name, { project: r, via: new Set(), fixes: new Set() });
        const entry = w.get(r.name);
        entry.via.add(f.package);
        if (f.direct) entry.fixes.add(f.fix.available ? (f.fix.package ? `update ${f.fix.package} to ${f.fix.version}${f.fix.major ? ' (major - check for breaking changes)' : ''}` : `\`npm audit fix\` (${f.package})`) : `no fix yet for ${f.package}`);
      }
    }
  }
  const added = [];
  for (const [key, { advisory: a, where }] of byAdvisory) {
    const id = (key.match(/GHSA-[\w-]+/) || [a.package])[0];
    const tag = `[Dependency watch] Critical ${id}`;
    if (db.prepare(`SELECT id FROM dev_ideas WHERE status IN ('new', 'picked_up') AND text LIKE ?`).get(`${tag}%`)) continue;
    const lines = [...where.entries()].map(([name, e]) => `- ${e.project.kind === 'ims' ? `IMS (${name})` : `GitHub repo ${name}`}: via ${[...e.via].join(', ')}${e.fixes.size ? `; fix: ${[...e.fixes].join('; ')}` : ''}`);
    const idea = addIdea({
      text: `${tag}: ${a.title} in ${a.package} (${a.range || 'all versions'})${a.url ? `\n${a.url}` : ''}\nAffects ${where.size} project${where.size === 1 ? '' : 's'}:\n${lines.join('\n')}\nFound by the weekly npm audit (Code Repo > Dependencies).`,
      source: 'auto', category: 'Code Repo Best Practices',
    });
    added.push(idea.id);
  }
  return added;
}

export function getDependencyWatch() {
  let last = null;
  try { last = JSON.parse(getSetting(RESULT_KEY) || 'null'); } catch { /* none */ }
  return { last, running: Boolean(running), progress, nextDue: last?.finishedAt ? last.finishedAt + WEEK : null };
}

export function runDependencyWatch({ reason = 'manual' } = {}) {
  if (running) return running;
  running = (async () => {
    const list = projects();
    const startedAt = Date.now();
    const results = [];
    try {
      for (let i = 0; i < list.length; i++) {
        progress = { done: i, total: list.length, current: list[i].name };
        results.push(await checkProject(list[i]));
      }
      const ideaIds = ideasForCriticals(results);
      const summary = {
        projects: results.length, failed: results.filter((r) => !r.ok).length,
        critical: results.reduce((n, r) => n + (r.counts?.critical || 0), 0), high: results.reduce((n, r) => n + (r.counts?.high || 0), 0),
        majorLag: results.reduce((n, r) => n + (r.majorLag?.length || 0), 0), devIdeasAdded: ideaIds.length,
      };
      const out = { startedAt, finishedAt: Date.now(), reason, summary, results };
      setSetting(RESULT_KEY, JSON.stringify(out));
      console.log(`[DependencyWatch] ${summary.projects} projects - ${summary.critical} critical, ${summary.high} high, ${summary.majorLag} packages a major version behind; ${ideaIds.length} dev ideas added`);
      return out;
    } finally {
      running = null;
      progress = null;
    }
  })();
  return running;
}

// Weekly: checked every six hours, runs when the last full check is a week old.
export function startWeeklyDependencyWatch() {
  const check = () => {
    const last = getDependencyWatch().last;
    if (!running && (!last || Date.now() - last.finishedAt >= WEEK)) runDependencyWatch({ reason: 'weekly' }).catch((err) => console.error('[DependencyWatch]', err.message));
  };
  setTimeout(check, 5 * 60000); // not in the busy first minutes after start-up
  setInterval(check, 6 * 3600000);
}
