import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import ngrok from '@ngrok/ngrok';
import config from '../config.js';

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

export default router;

