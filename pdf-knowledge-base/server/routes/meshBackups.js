import { Router } from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import localOnly from '../middleware/localOnly.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');
const backupsDir = path.join(projectRoot, 'backups');
const authorityJsonPath = path.join(projectRoot, 'src/data/mesh_authority.json');
const authorityJsPath = path.join(projectRoot, 'src/data/mesh_authority.js');

export const backupArchiveHandler = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  const zipFile = path.join(backupsDir, `hive_mesh_checkpoint_${timestamp}.zip`).replace(/\\/g, '/');

  const psCommand = `Compress-Archive -Path src, index.html, package.json, tailwind.config.js, vite.config.js, public -DestinationPath '${zipFile}' -Force`;

  exec(`powershell.exe -NoProfile -Command "${psCommand}"`, { cwd: projectRoot }, (err, stdout, stderr) => {
    if (err) {
      console.error('Backup Engine Error:', stderr);
      res.status(500).json({ error: err.message, details: stderr });
    } else {
      res.json({ success: true, file: zipFile });
    }
  });
};

const router = Router();
router.use(localOnly);

// List all mesh backups from the local registry
router.get('/', (req, res) => {
  const registryPath = path.join(backupsDir, 'mesh_backups_registry.json');
  if (!fs.existsSync(registryPath)) {
    return res.json([]);
  }
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    res.json(registry);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create a new mesh backup from src/data/mesh_authority.json
router.post('/', (req, res) => {
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  if (!fs.existsSync(authorityJsonPath)) {
    return res.status(404).json({ error: 'Authority JSON file not found' });
  }

  try {
    const rawData = fs.readFileSync(authorityJsonPath, 'utf8');
    const nodes = JSON.parse(rawData);

    let connectionCount = 0;
    nodes.forEach((n) => {
      if (n.parentId) connectionCount++;
      if (n.secondaryLinks && Array.isArray(n.secondaryLinks)) {
        connectionCount += n.secondaryLinks.length;
      }
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `mesh_backup_${timestamp}.json`;
    const backupFilePath = path.join(backupsDir, backupFilename);

    fs.writeFileSync(backupFilePath, rawData, 'utf8');

    const registryPath = path.join(backupsDir, 'mesh_backups_registry.json');
    let registry = [];
    if (fs.existsSync(registryPath)) {
      try {
        registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      } catch (_) {
        registry = [];
      }
    }

    const newBackup = {
      filename: backupFilename,
      timestamp: new Date().toISOString(),
      nodeCount: nodes.length,
      connectionCount
    };
    registry.unshift(newBackup);

    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf8');
    res.json({ success: true, backup: newBackup });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Restore mesh authority state from a backup file
router.post('/restore', (req, res) => {
  const filename = req.query.filename || req.body?.filename;

  // Strict sanitisation: basename match only, alphanumeric and dashes/dots ending in .json
  if (!filename || filename !== path.basename(filename) || !/^[\w.-]+\.json$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid backup file name' });
  }

  const backupFilePath = path.join(backupsDir, filename);
  if (!fs.existsSync(backupFilePath)) {
    return res.status(404).json({ error: 'Backup file not found' });
  }

  try {
    const rawData = fs.readFileSync(backupFilePath, 'utf8');

    // Overwrite JSON file
    fs.writeFileSync(authorityJsonPath, rawData, 'utf8');

    // Overwrite JS file
    const jsContent = `export const MESHES = ${rawData};\n`;
    fs.writeFileSync(authorityJsPath, jsContent, 'utf8');

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
