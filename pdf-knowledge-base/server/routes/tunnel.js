import { Router } from 'express';
import { spawn, execSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import localOnly from '../middleware/localOnly.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');

let tunnelProcess = null;
let tunnelUrl = '';
let tunnelStatus = 'disconnected';
let tunnelError = '';
let tunnelLogs = [];

const getImsPort = () => {
  try {
    const portsPath = path.join(projectRoot, 'ports.json');
    if (fs.existsSync(portsPath)) {
      const ports = JSON.parse(fs.readFileSync(portsPath, 'utf8'));
      return ports.ims?.port || 6001;
    }
  } catch (_) {}
  return 6001;
};

const getNgrokAuthToken = () => {
  if (process.env.NGROK_AUTHTOKEN) {
    return process.env.NGROK_AUTHTOKEN.trim();
  }
  return '';
};

const fetchTunnelUrl = () => {
  return new Promise((resolve) => {
    http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.tunnels && parsed.tunnels.length > 0) {
            resolve(parsed.tunnels[0].public_url);
            return;
          }
        } catch (_) {}
        resolve(null);
      });
    }).on('error', () => {
      resolve(null);
    });
  });
};

const router = Router();
router.use(localOnly);

// Query ngrok tunnel status and live agent connection
router.get('/status', async (req, res) => {
  const liveCheck = await fetchTunnelUrl();
  if (liveCheck && tunnelStatus === 'disconnected') {
    tunnelStatus = 'connected';
    tunnelUrl = liveCheck;
  } else if (!liveCheck && tunnelStatus === 'connected') {
    tunnelStatus = 'disconnected';
  }

  res.json({
    status: tunnelStatus,
    url: tunnelUrl,
    error: tunnelError,
    logs: tunnelLogs.slice(-20)
  });
});

// Start ngrok tunnel process
router.post('/start', (req, res) => {
  if (tunnelProcess) {
    return res.json({ success: true, status: tunnelStatus, url: tunnelUrl });
  }

  const port = getImsPort();
  const domain = process.env.NGROK_DOMAIN
    ? (process.env.NGROK_DOMAIN.startsWith('http') ? process.env.NGROK_DOMAIN : `https://${process.env.NGROK_DOMAIN}`)
    : 'https://simon-ims.ngrok-free.app';

  try {
    tunnelStatus = 'connecting';
    tunnelError = '';
    tunnelLogs = [`[System] Starting ngrok Tunnel to port ${port}...`];

    const authtoken = getNgrokAuthToken();
    const spawnEnv = { ...process.env };
    if (authtoken) {
      spawnEnv.NGROK_AUTHTOKEN = authtoken;
      tunnelLogs.push('[System] Custom NGROK_AUTHTOKEN environment variable loaded.');
    } else {
      tunnelLogs.push('[System] Warning: No NGROK_AUTHTOKEN found in environment.');
    }

    tunnelProcess = spawn('ngrok', [
      'http',
      port.toString(),
      `--url=${domain}`
    ], { env: spawnEnv });

    let checkCount = 0;
    const checkInterval = setInterval(async () => {
      if (!tunnelProcess) {
        clearInterval(checkInterval);
        return;
      }
      const url = await fetchTunnelUrl();
      if (url) {
        tunnelUrl = url;
        tunnelStatus = 'connected';
        tunnelLogs.push(`[System] Tunnel running at: ${tunnelUrl}`);
        clearInterval(checkInterval);
      } else if (checkCount > 15) {
        clearInterval(checkInterval);
        if (tunnelStatus === 'connecting') {
          tunnelStatus = 'error';
          tunnelError = 'Timed out waiting for ngrok public URL';
          tunnelLogs.push('[System] Error: Timed out waiting for ngrok public URL');
        }
      }
      checkCount++;
    }, 1000);

    tunnelProcess.stdout.on('data', (data) => {
      tunnelLogs.push(data.toString());
      if (tunnelLogs.length > 100) tunnelLogs.shift();
    });

    tunnelProcess.stderr.on('data', (data) => {
      tunnelLogs.push(data.toString());
      if (tunnelLogs.length > 100) tunnelLogs.shift();
    });

    tunnelProcess.on('close', (code) => {
      tunnelProcess = null;
      tunnelStatus = 'disconnected';
      tunnelLogs.push(`[System] Process closed with exit code ${code}`);
    });

    tunnelProcess.on('error', (err) => {
      tunnelStatus = 'error';
      tunnelError = err.message;
      tunnelProcess = null;
      tunnelLogs.push(`[System] Error: ${err.message}`);
    });

    res.json({ success: true, status: tunnelStatus });
  } catch (e) {
    tunnelStatus = 'error';
    tunnelError = e.message;
    tunnelProcess = null;
    res.status(500).json({ error: e.message });
  }
});

// Stop ngrok tunnel process and terminate any orphaned ngrok instances
router.post('/stop', (req, res) => {
  tunnelLogs.push('[System] Stopping ngrok tunnel...');

  if (tunnelProcess) {
    try {
      tunnelProcess.kill('SIGKILL');
    } catch (_) {}
    tunnelProcess = null;
  }

  try {
    execSync('taskkill /F /IM ngrok.exe', { stdio: 'ignore' });
    tunnelLogs.push('[System] All ngrok processes terminated via taskkill.');
  } catch (_) {
    tunnelLogs.push('[System] No additional ngrok processes found.');
  }

  tunnelStatus = 'disconnected';
  tunnelUrl = '';
  res.json({ success: true, status: 'disconnected' });
});

process.on('exit', () => {
  if (tunnelProcess) {
    try {
      tunnelProcess.kill('SIGKILL');
    } catch (_) {}
  }
});

export default router;
