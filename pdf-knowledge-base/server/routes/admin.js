import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import ngrok from '@ngrok/ngrok';
import config from '../config.js';
import { getHnswStatus, buildIndex } from '../services/hnswService.js';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// Ensure app_settings table exists for persistent configuration
db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

/**
 * Retrieves the currently configured client port from the database,
 * falling back to 5173 if no override has been set.
 * @returns {number} The active client port.
 */
const getStoredPort = () => {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('client_port');
  return row ? parseInt(row.value, 10) : 5173;
};

/**
 * Checks if ngrok was explicitly enabled by the user.
 * @returns {boolean}
 */
const isNgrokEnabled = () => {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('ngrok_enabled');
  return row ? row.value === 'true' : false; // Default to false to avoid unexpected sessions
};

/**
 * Persists the user's intended ngrok state.
 * @param {boolean} enabled 
 */
const setNgrokEnabled = (enabled) => {
  db.prepare(
    'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP'
  ).run('ngrok_enabled', String(enabled));
};

// Helper to read JSON files safely
const readJsonFile = (filename) => {
  const filePath = path.join(__dirname, '..', '..', filename);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      // Strip potential BOM
      const cleanContent = content.replace(/^\uFEFF/, '');
      return JSON.parse(cleanContent);
    }
  } catch (err) {
    console.error(`[Admin API] Failed to read ${filename}:`, err.message);
  }
  return null;
};

// Helper to write JSON files safely
const writeJsonFile = (filename, data) => {
  const filePath = path.join(__dirname, '..', '..', filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

// 1. Project Structure View
router.get('/structure', (req, res) => {
  const structure = readJsonFile('ProjectStructure.JSON');
  res.json(structure);
});

router.put('/structure', (req, res) => {
  writeJsonFile('ProjectStructure.JSON', req.body);
  res.json({ success: true });
});

// 2. Rules View (Custom AI Rules)
router.get('/rules', (req, res) => {
  const rules = db.prepare('SELECT * FROM global_rules ORDER BY created_at DESC').all();
  res.json(rules);
});

router.post('/rules', (req, res) => {
  const { content } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO global_rules (id, content) VALUES (?, ?)').run(id, content);
  res.json({ success: true, id });
});

router.delete('/rules/:id', (req, res) => {
  db.prepare('DELETE FROM global_rules WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 3. Dev Rules View (GEMINI.md)
router.get('/dev-rules', (req, res) => {
  // Look for GEMINI.md in common locations
  const possiblePaths = [
    path.join('C:', 'Users', 'sideb', '.gemini', 'GEMINI.md'),
    path.join(__dirname, '..', '..', 'GEMINI.md')
  ];
  
  let content = 'GEMINI.md not found.';
  let filePath = '';
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      content = fs.readFileSync(p, 'utf8');
      filePath = p;
      break;
    }
  }
  res.json({ content, filePath });
});

router.put('/dev-rules', (req, res) => {
  const { content, filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'No file path provided' });
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Features View
router.get('/features', (req, res) => {
  const features = readJsonFile('feature.JSON');
  res.json(features);
});

router.put('/features', (req, res) => {
  writeJsonFile('feature.JSON', req.body);
  res.json({ success: true });
});

// 5. Component Style Rules View
router.get('/style-rules', (req, res) => {
  const rules = readJsonFile('client/src/ComponentStyleRules.JSON');
  res.json(rules);
});

// 6. Port Configuration Management
router.get('/port', (req, res) => {
  const port = getStoredPort();
  res.json({ port });
});

router.put('/port', (req, res) => {
  const { port } = req.body;
  const numPort = parseInt(port, 10);

  if (isNaN(numPort) || numPort < 1024 || numPort > 65535) {
    return res.status(400).json({ error: 'Port must be between 1024 and 65535.' });
  }

  db.prepare(
    'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP'
  ).run('client_port', String(numPort));

  console.log(`[Admin] Client port updated to ${numPort}. Restart the Vite dev server with VITE_PORT=${numPort} to apply.`);
  res.json({ success: true, port: numPort, requiresRestart: true });
});

// 7. Ngrok Tunnel Management
let ngrokListener = null;

export const startNgrok = async (force = false) => {
  // If not forced (auto-start on boot), check if user actually wants it enabled
  if (!force && !isNgrokEnabled()) {
    return null;
  }

  if (ngrokListener) return ngrokListener.url();
  if (!config.ngrok.authtoken) {
    console.warn('⚠️ Ngrok Authtoken missing in .env - cannot start tunnel.');
    return null;
  }

  const tunnelPort = getStoredPort();

  try {
    console.log(`[Ngrok] Initializing tunnel to localhost:${tunnelPort}...`);
    ngrokListener = await ngrok.forward({
      addr: tunnelPort,
      authtoken: config.ngrok.authtoken,
      domain: config.ngrok.domain
    });
    console.log(`\n🌍 Ngrok Tunnel Active: ${ngrokListener.url()} → localhost:${tunnelPort}`);
    
    // Ensure we keep it enabled in settings if it started successfully
    setNgrokEnabled(true);
    
    return ngrokListener.url();
  } catch (err) {
    console.error(`❌ Ngrok Failed to start: ${err.message}`);
    return null;
  }
};

router.get('/ngrok/status', async (req, res) => {
  const port = getStoredPort();
  if (ngrokListener) {
    res.json({ active: true, url: ngrokListener.url(), port });
  } else {
    res.json({ active: false, url: null, port });
  }
});

router.post('/ngrok/toggle', async (req, res) => {
  const { action } = req.body;
  const port = getStoredPort();
  try {
    if (action === 'start') {
      setNgrokEnabled(true);
      // If ngrok is already running, close it first so it reconnects to the current port
      if (ngrokListener) {
        await ngrokListener.close();
        ngrokListener = null;
      }
      const url = await startNgrok(true); // Force start since it's a manual toggle
      res.json({ active: !!url, url, port });
    } else if (action === 'stop') {
      setNgrokEnabled(false);
      if (ngrokListener) {
        await ngrokListener.close();
        ngrokListener = null;
      }
      res.json({ active: false, url: null, port });
    } else {
      res.status(400).json({ error: 'Invalid action' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. HNSW Vector Index Management
router.get('/hnsw/status', (req, res) => {
  try {
    const status = getHnswStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/hnsw/build-stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (res.flushHeaders) res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendEvent({ phase: 'init', progress: 0, total: 100, message: 'Initialising HNSW builder...' });
    const result = await buildIndex((progress) => {
      sendEvent(progress);
    });
    sendEvent({ phase: 'complete', ...result, message: 'HNSW index built successfully!' });
    res.end();
  } catch (err) {
    sendEvent({ phase: 'error', message: err.message });
    res.end();
  }
});

router.post('/hnsw/build', async (req, res) => {
  try {
    const result = await buildIndex();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rulebook scraper routes
let activeScraper = null;
let scraperLogs = [];
const maxLogs = 500;
let sseClients = [];

const addScraperLog = (text) => {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim()) {
      scraperLogs.push({
        timestamp: new Date().toISOString(),
        text: line
      });
    }
  }
  if (scraperLogs.length > maxLogs) {
    scraperLogs.shift();
  }
};

const broadcastSse = (data) => {
  for (const client of sseClients) {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  }
};

router.post('/rulebooks/scrape', (req, res) => {
  if (activeScraper) {
    return res.status(400).json({ error: 'Scraper is already running' });
  }

  const { bggUsername, bggPassword } = req.body;

  const scriptPath = path.resolve(__dirname, '..', '..', '..', 'scratch', 'Boardgame rule scrape', 'scrape.py');
  const workingDir = path.dirname(scriptPath);

  if (!fs.existsSync(scriptPath)) {
    return res.status(404).json({ error: `Scraper script not found at ${scriptPath}` });
  }

  scraperLogs = [];
  addScraperLog('[System] Starting rulebook scraper process...');

  const args = ['scrape.py'];
  if (bggUsername && bggPassword) {
    args.push('--bgg-user', bggUsername, '--bgg-pass', bggPassword);
  }

  // Spawn the process
  activeScraper = spawn('python', args, {
    cwd: workingDir,
    env: { ...process.env } // inherits GEMINI_API_KEY from process.env
  });

  broadcastSse({ type: 'status', status: 'running' });

  activeScraper.stdout.on('data', (data) => {
    const text = data.toString();
    addScraperLog(text);
    broadcastSse({ type: 'log', text });
  });

  activeScraper.stderr.on('data', (data) => {
    const text = data.toString();
    addScraperLog(text);
    
    // Parse tqdm progress (e.g. 7%|... 16/242)
    const progressMatch = text.match(/(\d+)%\|.*\| (\d+)\/(\d+)/);
    if (progressMatch) {
      const progress = parseInt(progressMatch[1], 10);
      const current = parseInt(progressMatch[2], 10);
      const total = parseInt(progressMatch[3], 10);
      broadcastSse({ type: 'progress', progress, current, total });
    } else {
      broadcastSse({ type: 'log', text });
    }
  });

  activeScraper.on('close', (code) => {
    addScraperLog(`[System] Scraper process completed with exit code ${code}`);
    activeScraper = null;
    broadcastSse({ type: 'status', status: 'idle', code });
  });

  activeScraper.on('error', (err) => {
    addScraperLog(`[System] Scraper process failed to start: ${err.message}`);
    activeScraper = null;
    broadcastSse({ type: 'status', status: 'error', error: err.message });
  });

  res.json({ success: true, message: 'Scraper process initiated' });
});

router.post('/rulebooks/scrape/stop', (req, res) => {
  if (!activeScraper) {
    return res.status(400).json({ error: 'No scraper process running' });
  }

  try {
    activeScraper.kill('SIGINT'); // Send KeyboardInterrupt so it exits gracefully
    addScraperLog('[System] Sent SIGINT (KeyboardInterrupt) to scraper process');
    res.json({ success: true, message: 'Stop signal sent to scraper' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/rulebooks/scrape/status', (req, res) => {
  res.json({
    active: !!activeScraper,
    logs: scraperLogs
  });
});

router.get('/rulebooks/scrape/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (res.flushHeaders) res.flushHeaders();

  sseClients.push(res);

  // Send initial state
  res.write(`data: ${JSON.stringify({ type: 'status', status: activeScraper ? 'running' : 'idle' })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
  });
});

router.get('/rulebooks/list', (req, res) => {
  const baseDir = path.resolve(__dirname, '..', '..', '..', 'scratch', 'Boardgame rule scrape');
  const collectionCsvPath = path.join(baseDir, 'collection.csv');
  const downloadLogCsvPath = path.join(baseDir, 'download_log.csv');
  const rulebooksDir = path.join(baseDir, 'Rulebooks');

  let games = [];
  
  if (!fs.existsSync(collectionCsvPath)) {
    return res.json({ games: [] });
  }

  try {
    // Read and parse collection.csv
    const collectionData = fs.readFileSync(collectionCsvPath, 'utf8');
    const lines = collectionData.split(/\r?\n/).filter(line => line.trim());
    if (lines.length > 1) {
      // Find header column for game name
      const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
      let nameIndex = headers.findIndex(h => ['name', 'game', 'title', 'boardgame', 'game_name', 'objectname'].includes(h));
      if (nameIndex === -1) nameIndex = 0;

      // Extract titles
      for (let i = 1; i < lines.length; i++) {
        const matches = lines[i].match(/(".*?"|[^",\r\n]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
        if (matches && matches[nameIndex]) {
          const gameName = matches[nameIndex].replace(/^["']|["']$/g, '').trim();
          if (gameName && gameName.toLowerCase() !== 'nan') {
            games.push({
              name: gameName,
              status: 'Pending',
              url: ''
            });
          }
        }
      }
    }

    // Read download_log.csv
    const logMap = new Map();
    if (fs.existsSync(downloadLogCsvPath)) {
      const logData = fs.readFileSync(downloadLogCsvPath, 'utf8');
      const logLines = logData.split(/\r?\n/).filter(line => line.trim());
      if (logLines.length > 1) {
        for (let i = 1; i < logLines.length; i++) {
          const parts = logLines[i].match(/(".*?"|[^",\r\n]+)(?=\s*,|\s*$)/g) || logLines[i].split(',');
          if (parts && parts.length >= 2) {
            const game = parts[0].replace(/^["']|["']$/g, '').trim();
            const status = parts[1].replace(/^["']|["']$/g, '').trim();
            const url = parts[3] ? parts[3].replace(/^["']|["']$/g, '').trim() : '';
            logMap.set(game.toLowerCase(), { status, url });
          }
        }
      }
    }

    // Update statuses
    games = games.map(g => {
      const safeName = g.name.replace(/[\\/*?:"<>|]/g, '').trim();
      const pdfPath = path.join(rulebooksDir, `${safeName}.pdf`);
      if (fs.existsSync(pdfPath)) {
        const log = logMap.get(g.name.toLowerCase());
        return { ...g, status: 'Downloaded', url: (log && log.url) ? log.url : 'Local' };
      }

      const log = logMap.get(g.name.toLowerCase());
      if (log) {
        return { ...g, status: log.status, url: log.url };
      }
      
      return g;
    });

    res.json({ games });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/rulebooks/scrape/single', (req, res) => {
  if (activeScraper) {
    return res.status(400).json({ error: 'Scraper is already running' });
  }

  const { gameName, deep, bggUsername, bggPassword } = req.body;
  if (!gameName) {
    return res.status(400).json({ error: 'Game name is required' });
  }

  const scriptPath = path.resolve(__dirname, '..', '..', '..', 'scratch', 'Boardgame rule scrape', 'scrape.py');
  const workingDir = path.dirname(scriptPath);

  if (!fs.existsSync(scriptPath)) {
    return res.status(404).json({ error: `Scraper script not found at ${scriptPath}` });
  }

  scraperLogs = [];
  addScraperLog(`[System] Starting single scrape for '${gameName}' (deep=${!!deep})...`);

  const args = ['scrape.py', '--game', gameName];
  if (deep) {
    args.push('--deep');
  }
  if (bggUsername && bggPassword) {
    args.push('--bgg-user', bggUsername, '--bgg-pass', bggPassword);
  }

  activeScraper = spawn('python', args, {
    cwd: workingDir,
    env: { ...process.env }
  });

  broadcastSse({ type: 'status', status: 'running' });

  activeScraper.stdout.on('data', (data) => {
    const text = data.toString();
    addScraperLog(text);
    broadcastSse({ type: 'log', text });
  });

  activeScraper.stderr.on('data', (data) => {
    const text = data.toString();
    addScraperLog(text);
    broadcastSse({ type: 'log', text });
  });

  activeScraper.on('close', (code) => {
    addScraperLog(`[System] Single scrape completed with code ${code}`);
    activeScraper = null;
    broadcastSse({ type: 'status', status: 'idle', code });
  });

  activeScraper.on('error', (err) => {
    addScraperLog(`[System] Single scrape process failed: ${err.message}`);
    activeScraper = null;
    broadcastSse({ type: 'status', status: 'error', error: err.message });
  });

  res.json({ success: true, message: `Started single scrape for ${gameName}` });
});

router.post('/rulebooks/status', (req, res) => {
  const { game, status, url } = req.body;
  if (!game || !status) {
    return res.status(400).json({ error: 'Missing game or status parameter' });
  }

  const baseDir = path.resolve(__dirname, '..', '..', '..', 'scratch', 'Boardgame rule scrape');
  const downloadLogCsvPath = path.join(baseDir, 'download_log.csv');

  try {
    let logDict = new Map();
    if (fs.existsSync(downloadLogCsvPath)) {
      const logData = fs.readFileSync(downloadLogCsvPath, 'utf8');
      const logLines = logData.split(/\r?\n/).filter(line => line.trim());
      if (logLines.length > 1) {
        for (let i = 1; i < logLines.length; i++) {
          const parts = logLines[i].match(/(".*?"|[^",\r\n]+)(?=\s*,|\s*$)/g) || logLines[i].split(',');
          if (parts && parts.length >= 2) {
            const g = parts[0].replace(/^["']|["']$/g, '').trim();
            const s = parts[1].replace(/^["']|["']$/g, '').trim();
            const p = parts[2] ? parts[2].replace(/^["']|["']$/g, '').trim() : '';
            const u = parts[3] ? parts[3].replace(/^["']|["']$/g, '').trim() : '';
            logDict.set(g, { status: s, path: p, url: u });
          }
        }
      }
    }

    const current = logDict.get(game) || { path: '', url: '' };
    logDict.set(game, {
      status,
      path: current.path || (status === 'Downloaded' ? `Rulebooks/${game.replace(/[\\/*?:"<>|]/g, '')}.pdf` : ''),
      url: url || current.url || 'Manual'
    });

    let newCsvContent = 'Game,Status,Path,URL\n';
    logDict.forEach((val, key) => {
      const escapedKey = key.includes(',') ? `"${key}"` : key;
      const escapedStatus = val.status.includes(',') ? `"${val.status}"` : val.status;
      const escapedPath = val.path.includes(',') ? `"${val.path}"` : val.path;
      const escapedUrl = val.url.includes(',') ? `"${val.url}"` : val.url;
      newCsvContent += `${escapedKey},${escapedStatus},${escapedPath},${escapedUrl}\n`;
    });

    fs.writeFileSync(downloadLogCsvPath, newCsvContent, 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

