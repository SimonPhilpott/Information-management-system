import express from 'express';
import {
  listRepositories,
  getRepository,
  saveRepository,
  deleteRepository,
  querySnippets,
  getSnippetById,
  updateUserObservations,
  scanRepository,
  scanMultipleRepositories,
  scanOutdatedRepositories,
  checkRepositoryOutdated,
  checkAllRepositoriesOutdated,
  syncCodeVectors,
  evaluateCodeSnippet,
  saveCodeSnippet,
  getGitHubTokens,
  getGitHubTokenStatus,
  saveGitHubTokens,
  discoverGitHubRepositories,
  toggleRepositorySelection,
  selectAllRepositories,
  suggestBestPractices,
  generateProjectPrompt
} from '../services/codeRepoService.js';

const router = express.Router();

/**
 * POST /api/code-repo/suggest-best-practices
 * Suggest matching best practice code patterns from the repository library.
 */
router.post('/suggest-best-practices', async (req, res) => {
  try {
    const { description, scaffold, cssFramework, preconditions } = req.body;
    const suggestions = await suggestBestPractices({ description, scaffold, cssFramework, preconditions });
    res.json({ success: true, suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/code-repo/generate-prompt
 * Generate an exhaustive Antigravity project kick-off prompt and phased implementation plan.
 */
router.post('/generate-prompt', async (req, res) => {
  try {
    const { projectName, description, scaffold, cssFramework, preconditions, customPreconditions, selectedSnippetIds } = req.body;
    const result = await generateProjectPrompt({
      projectName,
      description,
      scaffold,
      cssFramework,
      preconditions,
      customPreconditions,
      selectedSnippetIds
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/code-repo/tokens
 * Retrieve masked GitHub token status with authenticated account validation for personal and turntown accounts.
 */
router.get('/tokens', async (req, res) => {
  try {
    const tokens = await getGitHubTokenStatus();
    res.json({ success: true, ...tokens });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/code-repo/tokens
 * Save personal and turntown GitHub access tokens and return verified account statuses.
 */
router.post('/tokens', async (req, res) => {
  try {
    const { personalToken, turntownToken } = req.body;
    const tokens = await saveGitHubTokens({ personalToken, turntownToken });
    res.json({ success: true, ...tokens });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/code-repo/discover-repos
 * Query GitHub REST API to discover repositories from both accounts.
 */
router.post('/discover-repos', async (req, res) => {
  try {
    const result = await discoverGitHubRepositories();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/code-repo/check-outdated
 * Check all repositories for new commits / outdated status.
 */
router.post('/check-outdated', async (req, res) => {
  try {
    const result = await checkAllRepositoriesOutdated();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/code-repo/repositories/:id/check-outdated
 * Check a single repository for new commits.
 */
router.get('/repositories/:id/check-outdated', async (req, res) => {
  try {
    const repository = await checkRepositoryOutdated(req.params.id);
    if (!repository) return res.status(404).json({ error: 'Repository not found' });
    res.json({ success: true, repository });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/code-repo/repositories/:id/toggle-select
 * Toggle scan selection for a repository.
 */
router.put('/repositories/:id/toggle-select', (req, res) => {
  try {
    const { isSelected } = req.body;
    const updated = toggleRepositorySelection(req.params.id, Boolean(isSelected));
    res.json({ success: true, repository: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/code-repo/repositories/select-all
 * Select or deselect all repositories.
 */
router.put('/repositories/select-all', (req, res) => {
  try {
    const { isSelected } = req.body;
    const updated = selectAllRepositories(Boolean(isSelected));
    res.json({ success: true, repositories: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/code-repo/repositories
 * List all registered repositories.
 */
router.get('/repositories', (req, res) => {
  try {
    const repos = listRepositories();
    res.json({ success: true, repositories: repos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/code-repo/repositories
 * Add or update a repository.
 */
router.post('/repositories', (req, res) => {
  try {
    const repo = saveRepository(req.body);
    res.json({ success: true, repository: repo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/code-repo/repositories/:id
 * Remove a repository and its snippets.
 */
router.delete('/repositories/:id', (req, res) => {
  try {
    const updated = deleteRepository(req.params.id);
    res.json({ success: true, repositories: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/code-repo/snippets
 * Query snippets with filters.
 */
router.get('/snippets', (req, res) => {
  try {
    const { repoId, technology, language, search, limit } = req.query;
    const snippets = querySnippets({
      repoId,
      technology,
      language,
      search,
      limit: limit ? Number(limit) : 150
    });
    res.json({ success: true, count: snippets.length, snippets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/code-repo/snippets/:id
 * Retrieve a specific snippet with evaluation and observations.
 */
router.get('/snippets/:id', (req, res) => {
  try {
    const snippet = getSnippetById(req.params.id);
    if (!snippet) return res.status(404).json({ error: 'Snippet not found' });
    res.json({ success: true, snippet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/code-repo/snippets/:id/observations
 * Update user observation notes for a snippet.
 */
router.put('/snippets/:id/observations', (req, res) => {
  try {
    const { userObservations } = req.body;
    const updated = updateUserObservations(req.params.id, String(userObservations || ''));
    res.json({ success: true, snippet: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/code-repo/snippets/:id/re-evaluate
 * Trigger fresh AI evaluation against the 5 principles and inputs/outputs.
 */
router.post('/snippets/:id/re-evaluate', async (req, res) => {
  try {
    const existing = getSnippetById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Snippet not found' });

    const evalResult = await evaluateCodeSnippet({
      code: existing.code_content,
      filePath: existing.file_path,
      repoName: existing.repo_name
    });

    const updated = saveCodeSnippet({
      id: existing.id,
      repo_id: existing.repo_id,
      file_path: existing.file_path,
      title: evalResult.title || existing.title,
      description: evalResult.summary || existing.description,
      code_content: existing.code_content,
      language: evalResult.language || existing.language,
      technology: evalResult.technology || existing.technology,
      best_practice_rationale: evalResult.bestPracticeRationale,
      usage_example: evalResult.usageInstructions,
      inputs_json: evalResult.inputs || [],
      outputs_json: evalResult.outputs || [],
      principles_json: evalResult.principles,
      ai_observations: evalResult.observations,
      user_observations: existing.user_observations,
      suggested_improvements: evalResult.suggestedImprovements,
      tags_json: evalResult.tags || []
    });

    res.json({ success: true, snippet: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/code-repo/scan-stream/:repoId
 * Scan a single repository with real-time Server-Sent Events (SSE).
 */
router.get('/scan-stream/:repoId', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const repoId = req.params.repoId;
    sendEvent({ phase: 'starting', message: 'Starting repository scan...', progress: 5 });

    const result = await scanRepository(repoId, (progress) => {
      sendEvent(progress);
    });

    sendEvent({ phase: 'finished', message: 'Scan complete!', result, progress: 100 });
    res.end();
  } catch (err) {
    sendEvent({ phase: 'error', message: err.message, progress: 0 });
    res.end();
  }
});

/**
 * GET /api/code-repo/scan-outdated-stream
 * Scan all outdated repositories with real-time SSE.
 */
router.get('/scan-outdated-stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendEvent({ phase: 'starting', message: 'Checking repositories and initiating re-scan for outdated codebases...', progress: 2 });

    const result = await scanOutdatedRepositories((progress) => {
      sendEvent(progress);
    });

    sendEvent({ phase: 'finished', message: 'All outdated repositories have been re-scanned and updated!', result, progress: 100 });
    res.end();
  } catch (err) {
    sendEvent({ phase: 'error', message: err.message, progress: 0 });
    res.end();
  }
});

/**
 * GET /api/code-repo/scan-all-stream
 * Scan multiple selected repositories with real-time SSE.
 */
router.get('/scan-all-stream', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const repoIdsQuery = req.query.repoIds;
    const account = req.query.account || null;
    const repoIds = repoIdsQuery ? repoIdsQuery.split(',').filter(Boolean) : null;

    sendEvent({ phase: 'starting', message: `Starting batch scan${account ? ` for ${account} account` : ''}...`, progress: 2 });

    const result = await scanMultipleRepositories(repoIds, (progress) => {
      sendEvent(progress);
    }, account);

    sendEvent({ phase: 'finished', message: 'All selected repositories scanned successfully!', result, progress: 100 });
    res.end();
  } catch (err) {
    sendEvent({ phase: 'error', message: err.message, progress: 0 });
    res.end();
  }
});

export default router;
